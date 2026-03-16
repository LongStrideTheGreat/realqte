'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

export default function PaymentCancel() {
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthResolved(true);
    });

    return () => unsubscribe();
  }, []);

  const primaryHref = useMemo(() => {
    return user ? '/' : '/';
  }, [user]);

  const primaryLabel = useMemo(() => {
    return user ? 'Back to Dashboard' : 'Back to Home';
  }, [user]);

  const secondaryHref = useMemo(() => {
    return user ? '/profile' : '/#pricing';
  }, [user]);

  const secondaryLabel = useMemo(() => {
    return user ? 'Go to Profile' : 'View Pricing';
  }, [user]);

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
            {!authResolved ? null : user ? (
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
                <Link href="/quotes" className="text-zinc-400 hover:text-white">
                  Quotes
                </Link>
                <Link href="/invoices" className="text-zinc-400 hover:text-white">
                  Invoices
                </Link>
                <Link href="/customers" className="text-zinc-400 hover:text-white">
                  Customers
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
              </>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-8 md:p-10 text-center shadow-2xl">
          <div className="text-6xl mb-5">⚠️</div>

          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500 mb-3">
            Checkout not completed
          </p>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Payment Cancelled
          </h1>

          <p className="text-lg text-zinc-300 mb-8">
            Your Pro subscription checkout was not completed, so no upgrade was applied from this attempt.
          </p>

          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 text-left mb-8">
            <div className="flex items-center justify-between gap-4 py-2 border-b border-zinc-700">
              <span className="text-zinc-400">Checkout result</span>
              <span className="text-yellow-400 font-medium">Cancelled</span>
            </div>

            <div className="flex items-center justify-between gap-4 py-2 border-b border-zinc-700">
              <span className="text-zinc-400">Payment taken</span>
              <span className="text-white">No</span>
            </div>

            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-zinc-400">Plan change</span>
              <span className="text-white">None applied</span>
            </div>
          </div>

          <div className="bg-zinc-800/60 border border-zinc-700 rounded-2xl p-5 mb-8 text-left">
            <h2 className="text-lg font-semibold mb-3 text-white">What happens now?</h2>
            <ul className="space-y-2 text-zinc-400">
              <li>• Your current account plan stays unchanged.</li>
              <li>• Your document access remains based on your current subscription status.</li>
              <li>• You can restart the Pro upgrade whenever you are ready.</li>
              <li>• During sandbox testing, cancelling here should not activate Pro.</li>
            </ul>
          </div>

          <p className="text-zinc-400 mb-8">
            {user
              ? 'You can continue using RealQte on your current plan, or try the upgrade again when you are ready.'
              : 'You can return home and start the upgrade flow again whenever you are ready.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white py-4 px-8 rounded-2xl text-lg font-medium"
            >
              {primaryLabel}
            </Link>

            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white py-4 px-8 rounded-2xl text-lg font-medium"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}