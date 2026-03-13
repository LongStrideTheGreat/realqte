'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

export default function PaymentCancel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingUser(false);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
              SA
            </span>
          </div>

          <div className="flex items-center gap-8 text-sm">
            {loadingUser ? null : user ? (
              <>
                <Link href="/" className="text-zinc-400 hover:text-white">
                  Dashboard
                </Link>
                <Link href="/new-invoice" className="text-zinc-400 hover:text-white">
                  New Invoice
                </Link>
                <Link href="/new-quote" className="text-zinc-400 hover:text-white">
                  New Quote
                </Link>
                <Link href="/customers" className="text-zinc-400 hover:text-white">
                  Customers
                </Link>
                <Link href="/accounting" className="text-zinc-400 hover:text-white">
                  Accounting
                </Link>
                <Link href="/reporting" className="text-zinc-400 hover:text-white">
                  Reports
                </Link>
                <Link href="/profile" className="text-zinc-400 hover:text-white">
                  Profile
                </Link>
                <button
                  onClick={() => signOut(auth)}
                  className="text-red-400 hover:underline"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/" className="text-zinc-400 hover:text-white">
                  Home
                </Link>
                <Link href="/#features" className="text-zinc-400 hover:text-white">
                  Features
                </Link>
                <Link href="/#pricing" className="text-zinc-400 hover:text-white">
                  Pricing
                </Link>
                <button
                  onClick={() => router.push('/')}
                  className="bg-white text-black px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-100"
                >
                  Back to Home
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-10 md:p-12 text-center shadow-2xl">
          <div className="text-7xl mb-6">😕</div>

          <h1 className="text-4xl md:text-5xl font-bold mb-4">Payment Cancelled</h1>

          <p className="text-xl text-zinc-300 mb-6">
            No worries — your subscription checkout was not completed.
          </p>

          <p className="text-zinc-400 mb-10 max-w-xl mx-auto">
            Your RealQte account is still active on its current plan, and no Pro upgrade was applied from this cancelled checkout. You can restart the subscription whenever you&apos;re ready.
          </p>

          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6 mb-10 text-left">
            <h2 className="text-lg font-semibold mb-3 text-white">What happens now?</h2>
            <ul className="space-y-2 text-zinc-400">
              <li>• No payment was completed.</li>
              <li>• Your account stays on its current plan.</li>
              <li>• You can return and try the Pro upgrade again at any time.</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white py-4 px-10 rounded-2xl text-lg font-medium"
            >
              Back to Dashboard
            </Link>

            <Link
              href="/profile"
              className="inline-block bg-zinc-700 hover:bg-zinc-600 text-white py-4 px-10 rounded-2xl text-lg font-medium"
            >
              Go to Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}