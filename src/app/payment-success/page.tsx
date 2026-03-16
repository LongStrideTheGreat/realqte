'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

type CheckState = 'checking' | 'active' | 'pending' | 'error';

function toDate(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }

  return null;
}

function isSubscriptionActive(data: any) {
  const expiresAt = toDate(data?.proExpiresAt);
  const status = String(data?.subscriptionStatus || '').toLowerCase();
  const blockedStatuses = ['cancelled', 'canceled', 'inactive', 'paused'];

  return (
    Boolean(data?.isPro) &&
    !!expiresAt &&
    expiresAt.getTime() > Date.now() &&
    !blockedStatuses.includes(status)
  );
}

function formatDate(value: any) {
  const parsed = toDate(value);
  if (!parsed) return null;
  return parsed.toLocaleDateString();
}

export default function PaymentSuccess() {
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [status, setStatus] = useState<CheckState>('checking');
  const [message, setMessage] = useState('Confirming your Pro subscription...');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('inactive');
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const maxAttempts = 12; // ~60 seconds total
  const pollIntervalMs = 5000;

  const statusLabel = useMemo(() => {
    if (status === 'active') return 'Pro activated';
    if (status === 'pending') return 'Still processing';
    if (status === 'error') return 'Confirmation issue';
    return 'Checking payment';
  }, [status]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthResolved(true);

      if (!firebaseUser) {
        setStatus('pending');
        setMessage(
          'Your payment return was received, but we could not confirm an active signed-in account on this page yet. Please sign in and check your dashboard.'
        );
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authResolved || !user) return;

    let mounted = true;
    let snapshotUnsub: (() => void) | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkSubscription = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (!mounted) return;

        if (!snap.exists()) {
          setSubscriptionStatus('inactive');
          setNextBillingDate(null);
          return false;
        }

        const data = snap.data();
        const active = isSubscriptionActive(data);

        setSubscriptionStatus(String(data.subscriptionStatus || 'inactive'));
        setNextBillingDate(data.nextBillingDate || data.proExpiresAt || null);

        if (active) {
          setStatus('active');
          setMessage('Thank you. Your RealQte Pro subscription is confirmed and active.');
          return true;
        }

        return false;
      } catch (error) {
        console.error('Payment success verification error:', error);
        if (mounted) {
          setStatus('error');
          setMessage(
            'We could not verify your subscription right now. Please check your dashboard in a moment.'
          );
        }
        return false;
      }
    };

    const startVerification = async () => {
      setStatus('checking');
      setMessage('Confirming your Pro subscription...');

      const userRef = doc(db, 'users', user.uid);

      snapshotUnsub = onSnapshot(
        userRef,
        (snap) => {
          if (!mounted || !snap.exists()) return;

          const data = snap.data();
          const active = isSubscriptionActive(data);

          setSubscriptionStatus(String(data.subscriptionStatus || 'inactive'));
          setNextBillingDate(data.nextBillingDate || data.proExpiresAt || null);

          if (active) {
            setStatus('active');
            setMessage('Thank you. Your RealQte Pro subscription is confirmed and active.');
          }
        },
        (error) => {
          console.error('Payment success snapshot error:', error);
        }
      );

      const immediateSuccess = await checkSubscription();
      if (immediateSuccess) return;

      let localAttempts = 0;

      intervalId = setInterval(async () => {
        if (!mounted) return;

        localAttempts += 1;
        setAttempts(localAttempts);

        const confirmed = await checkSubscription();

        if (confirmed) {
          if (intervalId) clearInterval(intervalId);
          return;
        }

        if (localAttempts >= maxAttempts) {
          if (intervalId) clearInterval(intervalId);

          setStatus('pending');
          setMessage(
            'Your payment may still be processing in sandbox. Please return to the dashboard and refresh shortly to see your updated plan.'
          );
        }
      }, pollIntervalMs);
    };

    startVerification();

    return () => {
      mounted = false;
      if (snapshotUnsub) snapshotUnsub();
      if (intervalId) clearInterval(intervalId);
    };
  }, [authResolved, user]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white px-6">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-8 md:p-10 text-center shadow-2xl">
        <div className="text-6xl mb-5">
          {status === 'active' ? '✅' : status === 'error' ? '⚠️' : '⏳'}
        </div>

        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500 mb-3">
          {statusLabel}
        </p>

        <h1 className="text-3xl md:text-4xl font-bold mb-4">
          {status === 'active'
            ? 'Payment Successful'
            : status === 'pending'
            ? 'Payment Received'
            : status === 'error'
            ? 'We hit a verification problem'
            : 'Verifying your payment'}
        </h1>

        <p className="text-lg text-zinc-300 mb-8">{message}</p>

        {user ? (
          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 text-left mb-8">
            <div className="flex items-center justify-between gap-4 py-2 border-b border-zinc-700">
              <span className="text-zinc-400">Account</span>
              <span className="text-white text-right break-all">{user.email || 'Signed in user'}</span>
            </div>

            <div className="flex items-center justify-between gap-4 py-2 border-b border-zinc-700">
              <span className="text-zinc-400">Subscription status</span>
              <span
                className={
                  status === 'active'
                    ? 'text-emerald-400 font-medium'
                    : status === 'error'
                    ? 'text-red-400 font-medium'
                    : 'text-yellow-400 font-medium'
                }
              >
                {subscriptionStatus || 'inactive'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-zinc-400">Next billing / expiry</span>
              <span className="text-white">
                {formatDate(nextBillingDate) || 'Waiting for confirmation'}
              </span>
            </div>
          </div>
        ) : authResolved ? (
          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 mb-8 text-zinc-300">
            We could not find a signed-in user on this page yet. Please log in and check your dashboard.
          </div>
        ) : null}

        {status === 'checking' && (
          <p className="text-sm text-zinc-500 mb-8">
            Sandbox confirmation can take a little time. Attempt {attempts + 1} of {maxAttempts + 1}.
          </p>
        )}

        {status === 'active' ? (
          <div className="space-y-4">
            <p className="text-zinc-400">
              Your account now has access to unlimited documents and Pro-only features tied to your active subscription.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white py-4 px-8 rounded-2xl text-lg font-medium"
              >
                Go to Dashboard
              </Link>

              <Link
                href="/new-invoice"
                className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white py-4 px-8 rounded-2xl text-lg font-medium"
              >
                Create Invoice
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-zinc-400">
              If your upgrade does not appear immediately, the webhook may still be processing. This is common while testing in sandbox.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white py-4 px-8 rounded-2xl text-lg font-medium"
              >
                Back to Dashboard
              </Link>

              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white py-4 px-8 rounded-2xl text-lg font-medium"
              >
                Check Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}