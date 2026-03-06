import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Use dynamic import to avoid build-time resolution issues
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const pfData: Record<string, string> = {};

    params.forEach((value, key) => {
      pfData[key] = decodeURIComponent(value.replace(/\+/g, ' '));
    });

    // Signature verification
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

    // Dynamic import of firebase-admin (only at runtime)
    const admin = (await import('firebase-admin')).default;

    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Admin SDK initialized successfully in webhook');
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
        console.warn('No userId found in custom_str1');
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error: any) {
    console.error('Webhook processing error:', error.message, error.stack);
    return new NextResponse('Server error', { status: 200 }); // PayFast requires 200 OK
  }
}