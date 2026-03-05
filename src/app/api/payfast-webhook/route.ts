import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const pfData: Record<string, string> = {};

    params.forEach((value, key) => {
      pfData[key] = decodeURIComponent(value.replace(/\+/g, ' '));
    });

    // Basic IP check (expand with full ranges later)
    const validIpsRanges = [
      '197.97.145.144/28',
      '41.74.179.192/27',
      '102.216.36.0/28',
      '102.216.36.128/28',
      '144.126.193.139',
    ];
    // For now, skip strict IP check in dev/sandbox – add later

    const passphrase = process.env.PAYFAST_SANDBOX_PASSPHRASE || '';

    // Rebuild string for signature verification
    const pfParamString = Object.entries(pfData)
      .filter(([key]) => key !== 'signature')
      .map(([key, val]) => `${key}=${encodeURIComponent(val.trim()).replace(/%20/g, '+')}`)
      .join('&');

    let signatureString = pfParamString;
    if (passphrase) {
      signatureString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
    }

    const checkSignature = crypto.createHash('md5').update(signatureString).digest('hex');

    if (checkSignature !== pfData.signature) {
      console.error('Signature mismatch');
      return new NextResponse('Signature mismatch', { status: 200 });
    }

    if (pfData.payment_status === 'COMPLETE') {
      const userId = pfData.custom_str1;
      if (userId) {
        await updateDoc(doc(db, 'users', userId), { isPro: true, proSince: new Date().toISOString() });
        console.log(`User ${userId} upgraded to Pro via PayFast`);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('Error', { status: 200 }); // PayFast requires 200 OK always
  }
}