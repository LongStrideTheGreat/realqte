'use client';

import Link from 'next/link';

export default function PaymentCancel() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
      <div className="max-w-lg text-center px-6">
        <div className="text-7xl mb-6">😕</div>
        <h1 className="text-4xl font-bold mb-4">Payment Cancelled</h1>
        <p className="text-xl text-zinc-300 mb-8">
          No worries — the transaction was not completed.
        </p>
        <p className="text-zinc-400 mb-10">
          You can try again whenever you're ready.
        </p>

        <Link 
          href="/"
          className="inline-block bg-zinc-700 hover:bg-zinc-600 text-white py-4 px-10 rounded-2xl text-lg font-medium"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}