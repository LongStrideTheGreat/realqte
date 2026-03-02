import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const paymentStatus = formData.get('payment_status');
  const userId = formData.get('custom_int1');

  // TODO: Add full signature verification (MD5 hash check from PayFast docs)
  // For now, trust COMPLETE in production after testing

  if (paymentStatus === 'COMPLETE' && typeof userId === 'string') {
    await updateDoc(doc(db, 'users', userId), { isPro: true });
    return NextResponse.json({ status: 'success' });
  }

  return NextResponse.json({ status: 'ignored' });
}