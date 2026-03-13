import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateSignature(data: Record<string, string>, passphrase: string) {
  const paramString = Object.entries(data)
    .filter(([key]) => key !== 'signature')
    .map(
      ([key, value]) =>
        `${key}=${encodeURIComponent((value || '').trim()).replace(/%20/g, '+')}`
    )
    .join('&');

  const finalString = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const pfData: Record<string, string> = {};

    params.forEach((value, key) => {
      pfData[key] = value;
    });

    const passphrase = process.env.PAYFAST_SANDBOX_PASSPHRASE || '';
    const calculatedSignature = generateSignature(pfData, passphrase);

    if (calculatedSignature !== pfData.signature) {
      console.error('PayFast signature mismatch', {
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

    const paymentStatus = (pfData.payment_status || '').toUpperCase();
    const userId = pfData.custom_str1;

    if (!userId) {
      console.error('Missing custom_str1 userId in PayFast webhook');
      return new NextResponse('OK', { status: 200 });
    }

    const userRef = db.collection('users').doc(userId);
    const existingDoc = await userRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() || {} : {};

    if (paymentStatus === 'COMPLETE') {
      const now = new Date();
      const existingExpiry = parseDate(existingData.proExpiresAt);
      const baseDate =
        existingExpiry && existingExpiry.getTime() > now.getTime()
          ? existingExpiry
          : now;

      const newExpiry = addDays(baseDate, 30);

      await userRef.set(
        {
          isPro: true,
          subscriptionStatus: 'active',
          payfastSubscription: true,
          billingCycle: 'monthly',
          billingFrequencyCode: pfData.frequency || '3',
          proSince: existingData.proSince || now.toISOString(),
          lastPaymentAt: now.toISOString(),
          proExpiresAt: newExpiry.toISOString(),
          nextBillingDate: newExpiry.toISOString(),
          payfastPaymentId: pfData.pf_payment_id || null,
          payfastMerchantPaymentId: pfData.m_payment_id || null,
          payfastStatus: pfData.payment_status || null,
          payfastSubscriptionReference: pfData.custom_str4 || pfData.m_payment_id || null,
          plan: 'pro',
        },
        { merge: true }
      );

      console.log(`User ${userId} subscription extended to ${newExpiry.toISOString()}`);
    } else {
      await userRef.set(
        {
          payfastStatus: pfData.payment_status || null,
          lastWebhookAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('Error', { status: 200 });
  }
}