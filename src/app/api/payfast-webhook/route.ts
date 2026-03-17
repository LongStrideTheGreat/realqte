import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPayFastMode(): 'sandbox' | 'live' {
  const explicitMode = String(process.env.PAYFAST_MODE || '').trim().toLowerCase();

  if (explicitMode === 'sandbox' || explicitMode === 'live') {
    return explicitMode;
  }

  const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();

  if (vercelEnv === 'production') {
    return 'live';
  }

  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    return 'sandbox';
  }

  return process.env.NODE_ENV === 'production' ? 'live' : 'sandbox';
}

function getPayFastPassphrase() {
  return getPayFastMode() === 'live'
    ? (process.env.PAYFAST_PASSPHRASE || '').trim()
    : (process.env.PAYFAST_SANDBOX_PASSPHRASE || '').trim();
}

function payfastEncode(value: string) {
  return encodeURIComponent((value || '').trim()).replace(/%20/g, '+');
}

function generateSignature(data: Record<string, string>, passphrase: string) {
  const paramString = Object.entries(data)
    .filter(([key]) => key !== 'signature')
    .map(([key, value]) => `${key}=${payfastEncode(value)}`)
    .join('&');

  const finalString = passphrase
    ? `${paramString}&passphrase=${payfastEncode(passphrase)}`
    : paramString;

  return crypto.createHash('md5').update(finalString).digest('hex');
}

function getFirebaseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT environment variable');
  }

  const parsed = JSON.parse(raw);

  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  return parsed;
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }

  return null;
}

function normalizePaymentStatus(status: string) {
  return String(status || '').trim().toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const pfData: Record<string, string> = {};

    params.forEach((value, key) => {
      pfData[key] = value;
    });

    const passphrase = getPayFastPassphrase();
    const calculatedSignature = generateSignature(pfData, passphrase);

    if (calculatedSignature !== pfData.signature) {
      console.error('PayFast signature mismatch', {
        mode: getPayFastMode(),
        received: pfData.signature,
        calculated: calculatedSignature,
      });
      return new NextResponse('Signature mismatch', { status: 200 });
    }

    if (!getApps().length) {
      const serviceAccount = getFirebaseServiceAccount();

      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    const db = getFirestore();

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || '';
    const plan = searchParams.get('plan') || 'pro';
    const billingCycle = searchParams.get('billingCycle') || 'monthly';
    const ref = searchParams.get('ref') || '';

    const paymentStatus = normalizePaymentStatus(pfData.payment_status);

    if (!userId) {
      console.error('Missing userId in PayFast webhook query params', {
        url: request.url,
        pf_payment_id: pfData.pf_payment_id || null,
        payment_status: pfData.payment_status || null,
      });
      return new NextResponse('OK', { status: 200 });
    }

    const userRef = db.collection('users').doc(userId);
    const existingDoc = await userRef.get();

    if (!existingDoc.exists) {
      console.warn(
        `Ignoring PayFast webhook for missing/deleted user ${userId}. No document will be recreated.`
      );
      return new NextResponse('OK', { status: 200 });
    }

    const existingData = existingDoc.data() || {};
    const now = new Date().toISOString();

    const commonUpdate = {
      payfastMode: getPayFastMode(),
      payfastStatus: pfData.payment_status || null,
      payfastPaymentId: pfData.pf_payment_id || existingData.payfastPaymentId || null,
      payfastMerchantPaymentId:
        pfData.m_payment_id || existingData.payfastMerchantPaymentId || ref || null,
      payfastSubscriptionToken:
        pfData.token ||
        pfData.subscription_token ||
        existingData.payfastSubscriptionToken ||
        null,
      payfastSubscriptionReference:
        pfData.token ||
        pfData.subscription_token ||
        ref ||
        existingData.payfastSubscriptionReference ||
        null,
      lastWebhookAt: now,
    };

    if (paymentStatus === 'COMPLETE') {
      const currentDate = new Date();
      const existingExpiry = parseDate(existingData.proExpiresAt);
      const baseDate =
        existingExpiry && existingExpiry.getTime() > currentDate.getTime()
          ? existingExpiry
          : currentDate;

      const newExpiry = addDays(baseDate, 30);

      await userRef.set(
        {
          ...commonUpdate,
          isPro: true,
          subscriptionStatus: 'active',
          payfastSubscription: true,
          billingCycle,
          billingFrequencyCode: pfData.frequency || existingData.billingFrequencyCode || '3',
          proSince: existingData.proSince || currentDate.toISOString(),
          lastPaymentAt: currentDate.toISOString(),
          proExpiresAt: newExpiry.toISOString(),
          nextBillingDate: newExpiry.toISOString(),
          cancelledAt: null,
          cancellationReason: null,
          plan,
        },
        { merge: true }
      );

      console.log(`User ${userId} subscription extended to ${newExpiry.toISOString()}`);
      return new NextResponse('OK', { status: 200 });
    }

    if (
      paymentStatus === 'CANCELLED' ||
      paymentStatus === 'CANCELED' ||
      paymentStatus === 'FAILED'
    ) {
      await userRef.set(
        {
          ...commonUpdate,
          isPro: false,
          subscriptionStatus: paymentStatus === 'FAILED' ? 'payment_failed' : 'cancelled',
          payfastSubscription: false,
          nextBillingDate: null,
          cancelledAt: now,
          cancellationReason:
            paymentStatus === 'FAILED' ? 'payment_failed' : 'payfast_or_user_cancelled',
        },
        { merge: true }
      );

      console.log(`User ${userId} subscription marked as ${paymentStatus.toLowerCase()}`);
      return new NextResponse('OK', { status: 200 });
    }

    await userRef.set(commonUpdate, { merge: true });
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('Error', { status: 200 });
  }
}