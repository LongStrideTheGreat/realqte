import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const baseData = {
      merchant_id: process.env.PAYFAST_SANDBOX_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_SANDBOX_MERCHANT_KEY,
      return_url: process.env.PAYFAST_SUCCESS_URL,
      cancel_url: process.env.PAYFAST_CANCEL_URL,
      notify_url: process.env.PAYFAST_NOTIFY_URL,
      name_first: 'User', // Optional - can fetch from profile later
      name_last: 'Pro',
      email_address: 'user@example.com', // TODO: fetch real email
      cell_number: '', // Optional
      m_payment_id: `pro_${userId}_${Date.now()}`,
      amount: '35.00',
      item_name: 'RealQte Pro Subscription',
      item_description: 'Monthly Pro access - R35/month',
      custom_str1: userId,
      // For recurring later: subscription_type: '1', frequency: '3', cycles: '0'
    };

    // Filter out empty values (PayFast excludes them)
    const data = Object.fromEntries(
      Object.entries(baseData).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    );

    // Sort keys alphabetically (CRITICAL for signature)
    const sortedKeys = Object.keys(data).sort();

    // Build param string
    let pfParamString = sortedKeys
      .map(key => `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, '+')}`)
      .join('&');

    // Append passphrase if set (no leading & if no params)
    const passphrase = process.env.PAYFAST_SANDBOX_PASSPHRASE || '';
    if (passphrase) {
      pfParamString += (pfParamString ? '&' : '') + `passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
    }

    // Generate MD5 signature
    const signature = crypto.createHash('md5').update(pfParamString).digest('hex');

    // Return params + signature for client to submit
    return NextResponse.json({
      ...data,
      signature,
      payfast_url: process.env.PAYFAST_SANDBOX_URL,
    });
  } catch (error: any) {
    console.error('Initiate error:', error);
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
  }
}

// Force redeploy - March 12 2026 - Herman