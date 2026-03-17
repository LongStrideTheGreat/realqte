import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function ensureFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccount = getFirebaseServiceAccount();

    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  return getFirestore();
}

function md5(value: string) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function buildApiSignature({
  headersForSignature,
  bodyForSignature,
  passphrase,
}: {
  headersForSignature: Record<string, string>;
  bodyForSignature?: Record<string, string>;
  passphrase: string;
}) {
  const merged: Record<string, string> = {
    ...headersForSignature,
    ...(bodyForSignature || {}),
  };

  const signatureBase = Object.keys(merged)
    .sort((a, b) => a.localeCompare(b))
    .map(
      (key) =>
        `${key}=${encodeURIComponent((merged[key] || '').trim()).replace(/%20/g, '+')}`
    )
    .join('&');

  const finalString = passphrase
    ? `${signatureBase}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
    : signatureBase;

  return md5(finalString);
}

function getPayFastTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userId = String(body?.userId || '').trim();
    const reason = String(body?.reason || 'user_requested').trim();

    console.log('API BODY userId:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const serviceAccount = getFirebaseServiceAccount();
    console.log('ADMIN PROJECT:', serviceAccount.project_id);

    const db = ensureFirebaseAdmin();

    const userRef = db.collection('users').doc(userId);
    console.log('LOOKING FOR DOC:', userRef.path);

    const userSnap = await userRef.get();
    console.log('USER EXISTS:', userSnap.exists);

    if (!userSnap.exists) {
      console.log('USER NOT FOUND FOR UID:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data() || {};

    const subscriptionToken =
      userData.payfastSubscriptionToken ||
      userData.payfastSubscriptionReference ||
      null;

    console.log('SUBSCRIPTION TOKEN FOUND:', subscriptionToken);

    if (!subscriptionToken) {
      return NextResponse.json(
        {
          error:
            'Missing PayFast subscription token/reference on the user document. Make sure the webhook stores the subscription token first.',
        },
        { status: 400 }
      );
    }

    const merchantId = process.env.PAYFAST_SANDBOX_MERCHANT_ID || '';
    const merchantKey = process.env.PAYFAST_SANDBOX_MERCHANT_KEY || '';
    const passphrase = process.env.PAYFAST_SANDBOX_PASSPHRASE || '';

    if (!merchantId || !merchantKey) {
      return NextResponse.json(
        { error: 'Missing PayFast merchant credentials in environment variables.' },
        { status: 500 }
      );
    }

    const apiBaseUrl = process.env.PAYFAST_API_URL?.trim() || 'https://api.payfast.co.za';

    const timestamp = getPayFastTimestamp();

    const headersForSignature: Record<string, string> = {
      'merchant-id': merchantId,
      timestamp,
      version: 'v1',
    };

    const signature = buildApiSignature({
      headersForSignature,
      passphrase,
    });

    const endpoint = `${apiBaseUrl.replace(/\/+$/, '')}/subscriptions/${encodeURIComponent(
      String(subscriptionToken)
    )}/cancel`;

    console.log('CALLING PAYFAST ENDPOINT:', endpoint);
    console.log('PAYFAST TIMESTAMP:', timestamp);

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'merchant-id': merchantId,
        version: 'v1',
        timestamp,
        signature,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    const rawText = await response.text();
    let apiResult: any = null;

    try {
      apiResult = rawText ? JSON.parse(rawText) : null;
    } catch {
      apiResult = { raw: rawText };
    }

    console.log('PAYFAST RESPONSE STATUS:', response.status);
    console.log('PAYFAST RESPONSE BODY:', apiResult);

    if (!response.ok) {
      console.error('PayFast cancel subscription error:', {
        status: response.status,
        body: apiResult,
      });

      return NextResponse.json(
        {
          error: apiResult?.message || apiResult?.data?.message || 'Failed to cancel subscription',
          status: response.status,
          details: apiResult,
        },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();

    await userRef.set(
      {
        isPro: false,
        subscriptionStatus: 'cancelled',
        payfastSubscription: false,
        nextBillingDate: null,
        cancelledAt: now,
        cancellationReason: reason,
        payfastCancellationResponse: apiResult || null,
        payfastCancelledSubscriptionToken: subscriptionToken,
        lastWebhookAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    console.log('SUBSCRIPTION CANCELLED + FIRESTORE UPDATED');

    return NextResponse.json({
      success: true,
      cancelled: true,
      subscriptionToken,
      response: apiResult,
    });
  } catch (error: any) {
    console.error('PayFast cancel subscription route error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Failed to cancel PayFast subscription',
      },
      { status: 500 }
    );
  }
}