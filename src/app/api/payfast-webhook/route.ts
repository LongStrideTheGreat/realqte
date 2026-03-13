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
      const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

      if (!serviceAccountRaw) {
        console.error('Missing FIREBASE_SERVICE_ACCOUNT environment variable');
        return new NextResponse('Error', { status: 200 });
      }

      const serviceAccount = JSON.parse(serviceAccountRaw);

      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    const db = getFirestore();

    if (pfData.payment_status === 'COMPLETE') {
      const userId = pfData.custom_str1;

      if (!userId) {
        console.error('Missing custom_str1 userId in PayFast webhook');
        return new NextResponse('OK', { status: 200 });
      }

      await db.collection('users').doc(userId).set(
        {
          isPro: true,
          proSince: new Date().toISOString(),
          payfastPaymentId: pfData.pf_payment_id || null,
          payfastMerchantPaymentId: pfData.m_payment_id || null,
          payfastStatus: pfData.payment_status,
        },
        { merge: true }
      );

      console.log(`User ${userId} upgraded to Pro`);
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('Error', { status: 200 });
  }
}