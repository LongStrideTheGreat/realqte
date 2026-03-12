'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function PaymentSuccess() {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Give webhook a few seconds to process (in real life this is usually fast)
    const timer = setTimeout(() => {
      setIsChecking(false);
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
      <div className="max-w-lg text-center px-6">
        <div className="text-7xl mb-6">🎉</div>
        <h1 className="text-4xl font-bold mb-4">Payment Successful!</h1>
        
        {isChecking ? (
          <p className="text-xl text-zinc-300 mb-8">
            Processing your Pro upgrade... one moment...
          </p>
        ) : (
          <>
            <p className="text-xl text-emerald-400 mb-8">
              Thank you! Your RealQte Pro account is now active.
            </p>
            <p className="text-zinc-400 mb-10">
              You should now have access to unlimited documents, email sending, reports, and more.
              Refresh the dashboard if features are not yet unlocked.
            </p>
          </>
        )}

        <Link 
          href="/"
          className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white py-4 px-10 rounded-2xl text-lg font-medium"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}