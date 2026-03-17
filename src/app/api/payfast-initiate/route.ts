import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPayFastMode(): 'sandbox' | 'live' {
  const explicitMode = String(process.env.PAYFAST_MODE || '').trim().toLowerCase();

  if (explicitMode === 'sandbox' || explicitMode === 'live') {
    return explicitMode;
  }

  const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();

  if (vercelEnv === 'production') return 'live';
  if (vercelEnv === 'preview' || vercelEnv === 'development') return 'sandbox';

  return process.env.NODE_ENV === 'production' ? 'live' : 'sandbox';
}

function getPayFastConfig() {
  const mode = getPayFastMode();

  if (mode === 'live') {
    return {
      mode,
      receiver: process.env.PAYFAST_MERCHANT_ID?.trim() || '',
      processUrl:
        process.env.PAYFAST_PROCESS_URL?.trim() || 'https://payment.payfast.io/eng/process',
      amount: process.env.PAYFAST_AMOUNT?.trim() || '35',
    };
  }

  return {
    mode,
    receiver: process.env.PAYFAST_SANDBOX_MERCHANT_ID?.trim() || '',
    processUrl:
      process.env.PAYFAST_SANDBOX_URL?.trim() || 'https://sandbox.payfast.co.za/eng/process',
    amount: process.env.PAYFAST_AMOUNT?.trim() || '35',
  };
}

function withQueryParams(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const config = getPayFastConfig();

    const successBase = process.env.PAYFAST_SUCCESS_URL?.trim() || '';
    const cancelBase = process.env.PAYFAST_CANCEL_URL?.trim() || '';
    const notifyBase = process.env.PAYFAST_NOTIFY_URL?.trim() || '';

    if (!config.receiver || !successBase || !cancelBase || !notifyBase || !config.processUrl) {
      return NextResponse.json(
        { error: 'Missing one or more PayFast environment variables' },
        { status: 500 }
      );
    }

    const subscriptionReference = `realqte_pro_${userId}_${Date.now()}`;

    const trackingParams = {
      userId,
      plan: 'pro',
      billingCycle: 'monthly',
      ref: subscriptionReference,
    };

    const returnUrl = withQueryParams(successBase, trackingParams);
    const cancelUrl = withQueryParams(cancelBase, trackingParams);
    const notifyUrl = withQueryParams(notifyBase, trackingParams);

    const fields: Record<string, string> = {
      cmd: '_paynow',
      receiver: config.receiver,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      amount: config.amount,
      item_name: 'Go Premium',
      subscription_type: '1',
      recurring_amount: config.amount,
      cycles: '0',
      frequency: '3',
    };

    console.log('PAYFAST MODE:', config.mode);
    console.log('PAYFAST URL:', config.processUrl);
    console.log('PAYFAST FIELDS:', fields);

    return NextResponse.json({
      payfast_url: config.processUrl,
      fields,
    });
  } catch (error) {
    console.error('Initiate error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate subscription' },
      { status: 500 }
    );
  }
}