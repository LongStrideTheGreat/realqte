import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPayFastMode(): 'sandbox' | 'live' {
  const explicitMode = String(process.env.PAYFAST_MODE || '').trim().toLowerCase();

  if (explicitMode === 'sandbox' || explicitMode === 'live') {
    return explicitMode;
  }

  const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();

  if (vercelEnv === 'production') {
    return 'live';
  }

  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    return 'sandbox';
  }

  return process.env.NODE_ENV === 'production' ? 'live' : 'sandbox';
}

function getPayFastConfig() {
  const mode = getPayFastMode();

  if (mode === 'live') {
    return {
      mode,
      merchantId: process.env.PAYFAST_MERCHANT_ID?.trim() || '',
      merchantKey: process.env.PAYFAST_MERCHANT_KEY?.trim() || '',
      passphrase: process.env.PAYFAST_PASSPHRASE?.trim() || '',
      processUrl:
        process.env.PAYFAST_PROCESS_URL?.trim() || 'https://www.payfast.co.za/eng/process',
      amount: process.env.PAYFAST_AMOUNT?.trim() || '35.00',
    };
  }

  return {
    mode,
    merchantId: process.env.PAYFAST_SANDBOX_MERCHANT_ID?.trim() || '',
    merchantKey: process.env.PAYFAST_SANDBOX_MERCHANT_KEY?.trim() || '',
    passphrase: process.env.PAYFAST_SANDBOX_PASSPHRASE?.trim() || '',
    processUrl:
      process.env.PAYFAST_SANDBOX_URL?.trim() || 'https://sandbox.payfast.co.za/eng/process',
    amount: process.env.PAYFAST_AMOUNT?.trim() || '35.00',
  };
}

function payfastEncode(value: string) {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

function generateSignature(data: Record<string, string>, passphrase?: string) {
  const pfParamString = Object.entries(data)
    .filter(([key, value]) => {
      return key !== 'signature' && value !== '' && value !== null && value !== undefined;
    })
    .map(([key, value]) => `${key}=${payfastEncode(String(value).trim())}`)
    .join('&');

  const signatureString = passphrase
    ? `${pfParamString}&passphrase=${payfastEncode(passphrase.trim())}`
    : pfParamString;

  return crypto.createHash('md5').update(signatureString).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { userId, email, firstName, lastName } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Missing email address for subscription' },
        { status: 400 }
      );
    }

    const config = getPayFastConfig();

    const returnUrl = process.env.PAYFAST_SUCCESS_URL?.trim() || '';
    const cancelUrl = process.env.PAYFAST_CANCEL_URL?.trim() || '';
    const notifyUrl = process.env.PAYFAST_NOTIFY_URL?.trim() || '';

    if (
      !config.merchantId ||
      !config.merchantKey ||
      !returnUrl ||
      !cancelUrl ||
      !notifyUrl ||
      !config.processUrl
    ) {
      return NextResponse.json(
        { error: 'Missing one or more PayFast environment variables' },
        { status: 500 }
      );
    }

    const subscriptionReference = `realqte_pro_${userId}_${Date.now()}`;

    const data: Record<string, string> = {
      merchant_id: config.merchantId,
      merchant_key: config.merchantKey,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: firstName?.trim() || 'RealQte',
      name_last: lastName?.trim() || 'User',
      email_address: email.trim(),
      m_payment_id: subscriptionReference,
      amount: config.amount,
      item_name: 'RealQte Pro Subscription',
      item_description: 'RealQte Pro monthly subscription',
      subscription_type: '1',
      recurring_amount: config.amount,
      frequency: '3',
      cycles: '0',
      custom_str1: userId,
      custom_str2: 'pro',
      custom_str3: 'monthly',
      custom_str4: subscriptionReference,
    };

    const signature = generateSignature(data, config.passphrase);

    console.log('PAYFAST MODE:', config.mode);
    console.log('PAYFAST URL:', config.processUrl);
    console.log('PAYFAST DATA TO SIGN:', data);
    console.log('PAYFAST PASSPHRASE PRESENT:', Boolean(config.passphrase));
    console.log('PAYFAST SIGNATURE:', signature);

    return NextResponse.json({
      payfast_url: config.processUrl,
      fields: {
        ...data,
        signature,
      },
    });
  } catch (error) {
    console.error('Initiate error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate subscription' },
      { status: 500 }
    );
  }
}