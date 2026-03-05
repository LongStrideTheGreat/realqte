import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid userId' }, { status: 400 });
    }

    const merchant_id = process.env.PAYFAST_SANDBOX_MERCHANT_ID;
    const merchant_key = process.env.PAYFAST_SANDBOX_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_SANDBOX_PASSPHRASE || '';
    const payfast_url = process.env.PAYFAST_SANDBOX_URL;
    const notify_url = process.env.PAYFAST_NOTIFY_URL;
    const return_url = process.env.PAYFAST_SUCCESS_URL;
    const cancel_url = process.env.PAYFAST_CANCEL_URL;

    if (!merchant_id || !merchant_key || !payfast_url || !notify_url || !return_url || !cancel_url) {
      console.error('Missing PayFast environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const data: Record<string, string> = {
      merchant_id,
      merchant_key,
      return_url,
      cancel_url,
      notify_url,
      name_first: 'Pro',
      name_last: 'User',
      email_address: 'user@example.com', // ← TODO: replace with real email from Firestore later
      m_payment_id: `pro_${userId}_${Date.now()}`,
      amount: '35.00',
      item_name: 'RealQte Pro Subscription - Monthly',
      item_description: 'Unlimited features for R35/month',
      custom_str1: userId,
      // Add later for recurring: subscription_type: '1', frequency: '3', cycles: '0' (monthly, infinite)
    };

    // Build param string for signature
    const pfParamString = Object.entries(data)
      .filter(([, val]) => val !== '')
      .map(([key, val]) => `${key}=${encodeURIComponent(val.trim()).replace(/%20/g, '+')}`)
      .join('&');

    let signatureString = pfParamString;
    if (passphrase) {
      signatureString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
    }

    const signature = crypto.createHash('md5').update(signatureString).digest('hex');

    return NextResponse.json({
      ...data,
      signature,
      payfast_url,
    });
  } catch (error) {
    console.error('PayFast initiate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}