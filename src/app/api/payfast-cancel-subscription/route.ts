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
    .map((key) => `${key}=${encodeURIComponent((merged[key] || '').trim()).replace(/%20/g, '+')}`)
    .join('&');

  const finalString = passphrase
    ? `${signatureBase}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
    : signatureBase;

  return md5(finalString);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userId = String(body?.userId || '').trim();
    const reason = String(body?.reason || 'user_requested').trim();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const db = ensureFirebaseAdmin();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data() || {};

    const subscriptionToken =
      userData.payfastSubscriptionToken ||
      userData.payfastSubscriptionReference ||
      null;

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

    const apiBaseUrl =
      process.env.PAYFAST_API_URL?.trim() || 'https://api.payfast.co.za';

    const timestamp = new Date().toISOString();

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