import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
// Vercel production install force — dummy static reference
import * as _dummyFirebaseAdmin from 'firebase-admin';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const pfData: Record<string, string> = {};

    params.forEach((value, key) => {
      pfData[key] = decodeURIComponent(value.replace(/\+/g, ' '));
    });

    const passphrase = process.env.PAYFAST_SANDBOX_PASSPHRASE || '';
    let pfParamString = Object.entries(pfData)
      .filter(([key]) => key !== 'signature')
      .map(([key, val]) => `${key}=${encodeURIComponent(val.trim()).replace(/%20/g, '+')}`)
      .join('&');

    if (passphrase) {
      pfParamString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
    }

    const checkSignature = crypto.createHash('md5').update(pfParamString).digest('hex');

    if (checkSignature !== pfData.signature) {
      console.error('Signature mismatch');
      return new NextResponse('Signature mismatch', { status: 200 });
    }

    // Variable to hide from static analysis
    const moduleName = 'firebase-admin';
    const admin = (await import(moduleName)).default;

    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin SDK initialized in webhook');
    }

    const adminDb = admin.firestore();

    if (pfData.payment_status === 'COMPLETE') {
      const userId = pfData.custom_str1;
      if (userId) {
        await adminDb.collection('users').doc(userId).update({
          isPro: true,
          proSince: new Date().toISOString(),
        });
        console.log(`User ${userId} upgraded to Pro via PayFast`);
      } else {
        console.warn('No userId in custom_str1');
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error: any) {
    console.error('Webhook error:', error.message, error.stack);
    return new NextResponse('Error', { status: 200 });
  }
}

// Vercel install hint - forces firebase-admin to be included in node_modules
if (false) {
  import('firebase-admin');
}
// Vercel runtime hint: force firebase-admin install (never runs)
if (false) require('firebase-admin');