import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateSignature(data: Record<string, string>, passphrase: string) {
  const sortedKeys = Object.keys(data).sort();

  let pfParamString = sortedKeys
    .map((key) => {
      const value = data[key] ?? '';
      return `${key}=${encodeURIComponent(String(value).trim()).replace(/%20/g, '+')}`;
    })
    .join('&');

  if (passphrase) {
    pfParamString += `${pfParamString ? '&' : ''}passphrase=${encodeURIComponent(
      passphrase.trim()
    ).replace(/%20/g, '+')}`;
  }

  return crypto.createHash('md5').update(pfParamString).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const {
      userId,
      email,
      firstName,
      lastName,
    } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Missing email address for subscription' },
        { status: 400 }
      );
    }

    const merchantId = process.env.PAYFAST_SANDBOX_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_SANDBOX_MERCHANT_KEY;
    const returnUrl = process.env.PAYFAST_SUCCESS_URL;
    const cancelUrl = process.env.PAYFAST_CANCEL_URL;
    const notifyUrl = process.env.PAYFAST_NOTIFY_URL;
    const passphrase = process.env.PAYFAST_SANDBOX_PASSPHRASE || '';
    const payfastUrl = process.env.PAYFAST_SANDBOX_URL;

    if (
      !merchantId ||
      !merchantKey ||
      !returnUrl ||
      !cancelUrl ||
      !notifyUrl ||
      !payfastUrl
    ) {
      return NextResponse.json(
        { error: 'Missing one or more PayFast environment variables' },
        { status: 500 }
      );
    }

    const subscriptionReference = `realqte_pro_${userId}_${Date.now()}`;

    const baseData: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,

      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,

      name_first: firstName || 'RealQte',
      name_last: lastName || 'User',
      email_address: email,

      m_payment_id: subscriptionReference,

      amount: '35.00',
      recurring_amount: '35.00',

      item_name: 'RealQte Pro Subscription',
      item_description: 'RealQte Pro monthly subscription',

      subscription_type: '1',
      frequency: '3',
      cycles: '0',

      custom_str1: userId,
      custom_str2: 'pro',
      custom_str3: 'monthly',
      custom_str4: subscriptionReference,
    };

    const data = Object.fromEntries(
      Object.entries(baseData).filter(
        ([, value]) => value !== '' && value !== null && value !== undefined
      )
    ) as Record<string, string>;

    const signature = generateSignature(data, passphrase);

    return NextResponse.json({
      ...data,
      signature,
      payfast_url: payfastUrl,
    });
  } catch (error) {
    console.error('Initiate error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate subscription' },
      { status: 500 }
    );
  }
}