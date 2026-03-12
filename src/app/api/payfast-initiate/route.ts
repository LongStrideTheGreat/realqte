import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    const data = {
      merchant_id: process.env.PAYFAST_SANDBOX_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_SANDBOX_MERCHANT_KEY,
      return_url: process.env.PAYFAST_SUCCESS_URL,
      cancel_url: process.env.PAYFAST_CANCEL_URL,
      notify_url: process.env.PAYFAST_NOTIFY_URL,
      m_payment_id: `pro_${userId}_${Date.now()}`,
      amount: '35.00',
      item_name: 'RealQte Pro Monthly',
      custom_str1: userId,
    };

    const pfParamString = Object.entries(data)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const signature = crypto
      .createHash('md5')
      .update(pfParamString + (process.env.PAYFAST_SANDBOX_PASSPHRASE ? `&passphrase=${process.env.PAYFAST_SANDBOX_PASSPHRASE}` : ''))
      .digest('hex');

    return NextResponse.json({ ...data, signature, payfast_url: process.env.PAYFAST_SANDBOX_URL });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}