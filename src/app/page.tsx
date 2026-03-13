'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User,
} from 'firebase/auth';
import {
  doc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
} from 'firebase/firestore';

const provider = new GoogleAuthProvider();

type Profile = {
  businessName?: string;
  firstName?: string;
  lastName?: string;
};

type SubscriptionInfo = {
  isPro: boolean;
  subscriptionStatus: string;
  proSince: string | null;
  proExpiresAt: string | null;
  nextBillingDate: string | null;
  billingCycle: string | null;
  payfastSubscription: boolean;
};

type DocumentType = {
  id: string;
  type?: string;
  number?: string;
  client?: string;
  clientEmail?: string;
  total?: string;
  createdAt?: any;
  recurring?: boolean;
  nextDue?: any;
  convertedToInvoice?: boolean;
  expiryDate?: any;
};

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

  const cancelledStatuses = ['cancelled', 'canceled', 'paused', 'inactive'];
  const statusAllowsAccess = !cancelledStatuses.includes(status);

  return {
    active:
      Boolean(data?.isPro) &&
      statusAllowsAccess &&
      !!expiresAt &&
      expiresAt.getTime() > Date.now(),
    expiresAt,
    status: data?.subscriptionStatus || 'inactive',
  };
}

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

function getQuoteStatus(doc: DocumentType) {
  if (doc.convertedToInvoice) return 'Converted';
  const expiry = toDate(doc.expiryDate);
  if (expiry && expiry.getTime() < Date.now()) return 'Expired';
  return 'Active';
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [isPro, setIsPro] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo>({
    isPro: false,
    subscriptionStatus: 'inactive',
    proSince: null,
    proExpiresAt: null,
    nextBillingDate: null,
    billingCycle: null,
    payfastSubscription: false,
  });

  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [recentQuotes, setRecentQuotes] = useState<DocumentType[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<DocumentType[]>([]);
  const [loadingUserData, setLoadingUserData] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const [monthlyInvoiced, setMonthlyInvoiced] = useState(0);
  const [monthlyQuoted, setMonthlyQuoted] = useState(0);

  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (u) {
        setLoadingUserData(true);

        const userDocRef = doc(db, 'users', u.uid);
        unsubscribeSnapshot = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const subscription = isSubscriptionActive(data);

              setProfile((data.profile || {}) as Profile);
              setIsPro(subscription.active);
              setSubscriptionInfo({
                isPro: subscription.active,
                subscriptionStatus: data.subscriptionStatus || 'inactive',
                proSince: data.proSince || null,
                proExpiresAt: data.proExpiresAt || null,
                nextBillingDate: data.nextBillingDate || data.proExpiresAt || null,
                billingCycle: data.billingCycle || null,
                payfastSubscription: Boolean(data.payfastSubscription),
              });
            } else {
              setProfile({});
              setIsPro(false);
              setSubscriptionInfo({
                isPro: false,
                subscriptionStatus: 'inactive',
                proSince: null,
                proExpiresAt: null,
                nextBillingDate: null,
                billingCycle: null,
                payfastSubscription: false,
              });
              console.log('User document not found yet');
            }

            setLoadingUserData(false);
          },
          (error) => {
            console.error('Snapshot error:', error);
            setLoadingUserData(false);
          }
        );
      } else {
        setProfile({});
        setIsPro(false);
        setSubscriptionInfo({
          isPro: false,
          subscriptionStatus: 'inactive',
          proSince: null,
          proExpiresAt: null,
          nextBillingDate: null,
          billingCycle: null,
          payfastSubscription: false,
        });
        setDocuments([]);
        setCustomers([]);
        setRecentQuotes([]);
        setRecentInvoices([]);
        setLoadingUserData(false);
      }
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      const docsSnap = await getDocs(
        query(
          collection(db, 'documents'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        )
      );
      const docs = docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[];
      setDocuments(docs);

      const custSnap = await getDocs(
        query(collection(db, 'customers'), where('userId', '==', user.uid))
      );
      setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const quotesSnap = await getDocs(
        query(
          collection(db, 'documents'),
          where('userId', '==', user.uid),
          where('type', '==', 'quote'),
          orderBy('createdAt', 'desc'),
          limit(4)
        )
      );
      setRecentQuotes(
        quotesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]
      );

      const invoicesSnap = await getDocs(
        query(
          collection(db, 'documents'),
          where('userId', '==', user.uid),
          where('type', '==', 'invoice'),
          orderBy('createdAt', 'desc'),
          limit(4)
        )
      );
      setRecentInvoices(
        invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]
      );
    };

    loadData();
  }, [user]);

  useEffect(() => {
    if (documents.length === 0) {
      setMonthlyInvoiced(0);
      setMonthlyQuoted(0);
      return;
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let invoiced = 0;
    let quoted = 0;

    documents.forEach((documentItem) => {
      const docDate = toDate(documentItem.createdAt);
      if (!docDate) return;

      if (
        docDate.getMonth() === currentMonth &&
        docDate.getFullYear() === currentYear
      ) {
        if (documentItem.type === 'invoice') {
          invoiced += parseFloat(documentItem.total || '0');
        }
        if (documentItem.type === 'quote') {
          quoted += parseFloat(documentItem.total || '0');
        }
      }
    });

    setMonthlyInvoiced(invoiced);
    setMonthlyQuoted(quoted);
  }, [documents]);

  const usageCount = documents.length;

  const recurringDueSoon = useMemo(() => {
    const cutoff = Date.now() + 7 * 24 * 60 * 60 * 1000;

    return documents.filter((d) => {
      if (!d.recurring || !d.nextDue) return false;
      const nextDue = toDate(d.nextDue);
      return nextDue ? nextDue.getTime() < cutoff : false;
    });
  }, [documents]);

  const handleGoogleSignIn = async () => {
    try {
      setAuthError('');
      await signInWithPopup(auth, provider);
      setShowAuth(false);
    } catch (err: any) {
      setAuthError(err.message || 'Google sign in failed');
    }
  };

  const handleEmailAuth = async () => {
    try {
      setAuthError('');
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setShowAuth(false);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  const startSubscriptionCheckout = async () => {
    if (!user) {
      setAuthMode('signup');
      setShowAuth(true);
      alert('Please create an account or log in before starting your Pro subscription.');
      return;
    }

    try {
      setIsStartingCheckout(true);

      const displayNameParts = (user.displayName || '').trim().split(' ').filter(Boolean);
      const firstName = profile.firstName || displayNameParts[0] || 'RealQte';
      const lastName = profile.lastName || displayNameParts.slice(1).join(' ') || 'User';

      const response = await fetch('/api/payfast-initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email || '',
          firstName,
          lastName,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to initiate subscription');
      }

      const params = await response.json();

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = params.payfast_url;

      Object.entries(params).forEach(([key, value]) => {
        if (key !== 'payfast_url') {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value ?? '');
          form.appendChild(input);
        }
      });

      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      console.error('Upgrade initiation failed:', err);
      alert('Could not start subscription: ' + (err.message || 'Unknown error'));
    } finally {
      setIsStartingCheckout(false);
    }
  };

  const sendPendingReminders = () => {
    if (!isPro) return alert('This is a Pro feature – upgrade for R35/month!');
    alert('Pending reminders sent! (Full implementation coming soon)');
  };

  const nextBillingText =
    formatDate(subscriptionInfo.nextBillingDate) ||
    formatDate(subscriptionInfo.proExpiresAt);

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
              SA
            </span>
          </div>

          <div className="flex items-center gap-8 text-sm">
            {user ? (
              <>
                <Link href="/" className="text-emerald-400 font-medium">
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
                <Link href="#features" className="text-zinc-400 hover:text-white">
                  Features
                </Link>
                <Link href="#pricing" className="text-zinc-400 hover:text-white">
                  Pricing
                </Link>
                <button
                  onClick={() => setShowAuth(true)}
                  className="text-zinc-400 hover:text-white"
                >
                  Log in
                </button>
                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setShowAuth(true);
                  }}
                  className="bg-white text-black px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-100"
                >
                  Sign up free
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {showAuth && !user && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-3xl p-10 max-w-md w-full mx-4">
            <h2 className="text-3xl font-bold mb-6 text-center">
              {authMode === 'login' ? 'Log In' : 'Sign Up'}
            </h2>

            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-3 rounded-xl ${
                  authMode === 'login' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'
                }`}
              >
                Log In
              </button>
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-3 rounded-xl ${
                  authMode === 'signup' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'
                }`}
              >
                Sign Up
              </button>
            </div>

            <button
              onClick={handleGoogleSignIn}
              className="w-full bg-white text-black py-4 rounded-xl font-medium flex items-center justify-center gap-3 mb-6 hover:bg-zinc-100"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Continue with Google
            </button>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-zinc-900 text-zinc-500">or</span>
              </div>
            </div>

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:border-emerald-500"
            />

            <button
              onClick={handleEmailAuth}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 rounded-2xl font-bold text-lg mb-4"
            >
              {authMode === 'login' ? 'Log In' : 'Create Free Account'}
            </button>

            {authError && <p className="text-red-400 text-center mb-4">{authError}</p>}

            <button
              onClick={() => setShowAuth(false)}
              className="w-full text-zinc-400 hover:text-white py-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {!user ? (
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h1 className="text-6xl font-bold leading-tight mb-6">
            Get paid faster.
            <br />
            Look more professional.
          </h1>
          <p className="text-2xl text-zinc-300 max-w-2xl mx-auto mb-12">
            RealQte helps small South African businesses, side hustles, startups,
            plumbers, salons, food vendors and contractors create beautiful invoices
            and quotes in seconds — completely free for your first 10 documents.
          </p>

          <div className="flex justify-center gap-6 mb-16">
            <button
              onClick={() => {
                setAuthMode('signup');
                setShowAuth(true);
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-black text-2xl font-bold px-16 py-6 rounded-3xl"
            >
              Start for Free
            </button>
          </div>

          <section id="features" className="py-20 border-t border-zinc-800">
            <h2 className="text-4xl font-bold mb-12">Features</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-zinc-900 p-8 rounded-3xl">
                <h3 className="text-2xl font-semibold mb-4">Instant PDFs</h3>
                <p className="text-zinc-400">
                  Generate professional invoices and quotes in seconds with your logo and details.
                </p>
              </div>
              <div className="bg-zinc-900 p-8 rounded-3xl">
                <h3 className="text-2xl font-semibold mb-4">Customer Management</h3>
                <p className="text-zinc-400">
                  Save clients for quick auto-fill and repeat use.
                </p>
              </div>
              <div className="bg-zinc-900 p-8 rounded-3xl">
                <h3 className="text-2xl font-semibold mb-4">Pro Tools</h3>
                <p className="text-zinc-400">
                  Unlimited documents, email sending, reporting, and more.
                </p>
              </div>
            </div>
          </section>

          <section id="pricing" className="py-20 border-t border-zinc-800">
            <h2 className="text-4xl font-bold mb-12">Pricing</h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              <div className="bg-zinc-900 p-8 rounded-3xl border-2 border-emerald-500">
                <h3 className="text-2xl font-bold mb-4">Free</h3>
                <p className="text-5xl font-bold mb-6">R0</p>
                <ul className="text-zinc-400 space-y-3 mb-8">
                  <li>10 free quotes + 5 free invoices</li>
                  <li>Basic PDF generation</li>
                  <li>Customer management</li>
                  <li>Profile customization</li>
                </ul>
                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setShowAuth(true);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-bold"
                >
                  Get Started Free
                </button>
              </div>

              <div className="bg-zinc-900 p-8 rounded-3xl border-2 border-purple-500 relative">
                <div className="absolute top-0 right-6 bg-purple-600 text-white px-4 py-1 rounded-b-lg text-sm font-bold">
                  Popular
                </div>
                <h3 className="text-2xl font-bold mb-4">Pro</h3>
                <p className="text-5xl font-bold mb-6">
                  R35<span className="text-xl">/month</span>
                </p>
                <ul className="text-zinc-400 space-y-3 mb-8">
                  <li>Unlimited invoices & quotes</li>
                  <li>Send via Email</li>
                  <li>Advanced reporting</li>
                  <li>Pay Now links (coming soon)</li>
                  <li>Email blast to customers</li>
                  <li>Recurring invoices & reminders</li>
                </ul>
                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setShowAuth(true);
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-500 py-4 rounded-2xl font-bold"
                >
                  Create account to subscribe
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="mb-12">
            <h2 className="text-4xl font-bold mb-2">
              Welcome back, {profile.businessName || 'Business Owner'}!
            </h2>

            {loadingUserData ? (
              <p className="text-zinc-400">Loading your account…</p>
            ) : isPro ? (
              <div className="text-zinc-300 space-y-1">
                <p>Pro Plan Active – Unlimited features!</p>
                <p className="text-sm text-emerald-400">
                  Status: {subscriptionInfo.subscriptionStatus || 'active'}
                  {nextBillingText ? ` • Next billing / expiry: ${nextBillingText}` : ''}
                </p>
              </div>
            ) : (
              <div className="text-zinc-300 space-y-1">
                <p>You&apos;ve used {usageCount} of 10 free documents this month</p>
                {subscriptionInfo.subscriptionStatus &&
                subscriptionInfo.subscriptionStatus !== 'inactive' ? (
                  <p className="text-sm text-yellow-400">
                    Subscription status: {subscriptionInfo.subscriptionStatus}
                    {nextBillingText ? ` • Access until: ${nextBillingText}` : ''}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
              <p className="text-zinc-400 text-sm">Invoiced this month</p>
              <p className="text-5xl font-bold text-emerald-400 mt-2">
                R{monthlyInvoiced.toFixed(2)}
              </p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
              <p className="text-zinc-400 text-sm">Quoted this month</p>
              <p className="text-5xl font-bold text-blue-400 mt-2">
                R{monthlyQuoted.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
            <Link
              href="/new-invoice"
              className="bg-emerald-500 hover:bg-emerald-400 text-black p-10 rounded-3xl text-center text-2xl font-bold"
            >
              Create New Invoice
            </Link>
            <Link
              href="/new-quote"
              className="bg-blue-600 hover:bg-blue-500 text-white p-10 rounded-3xl text-center text-2xl font-bold"
            >
              Create New Quote
            </Link>
            <Link
              href="/quotes"
              className="bg-purple-600 hover:bg-purple-500 text-white p-10 rounded-3xl text-center text-2xl font-bold"
            >
              View Quotes
            </Link>
            <Link
              href="/customers"
              className="bg-zinc-700 hover:bg-zinc-600 text-white p-10 rounded-3xl text-center text-2xl font-bold"
            >
              Manage Customers
            </Link>
          </div>

          {isPro && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8 mb-12">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">Recurring Invoices Due Soon</h3>
                <button
                  onClick={sendPendingReminders}
                  className="bg-purple-600 hover:bg-purple-500 py-3 px-6 rounded-xl text-white font-medium"
                >
                  Send Pending Reminders
                </button>
              </div>
              <div className="space-y-4">
                {recurringDueSoon.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No recurring invoices due soon</p>
                ) : (
                  recurringDueSoon.map((d) => (
                    <div
                      key={d.id}
                      className="bg-zinc-900 p-6 rounded-3xl flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium text-white">
                          {d.number} • {d.client}
                        </div>
                        <div className="text-sm text-zinc-300">
                          Due: {toDate(d.nextDue)?.toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => alert('Reminder sent – full implementation coming')}
                        className="bg-emerald-600 hover:bg-emerald-500 py-2 px-4 rounded-xl text-white text-sm"
                      >
                        Send Reminder
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {!isPro && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8 mb-12 text-center">
              <h3 className="text-2xl font-semibold mb-4">Unlock RealQte Pro – R35/month</h3>
              <p className="text-zinc-400 mb-6">
                Unlimited documents • Email sending • Advanced reports • Recurring reminders • Email blasts
              </p>
              <p className="text-sm text-zinc-500 mb-6">
                Monthly subscription renews automatically until cancelled.
              </p>
              <button
                onClick={startSubscriptionCheckout}
                disabled={isStartingCheckout}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black py-5 px-12 rounded-2xl text-xl font-bold"
              >
                {isStartingCheckout ? 'Starting subscription…' : 'Upgrade to Pro Now'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">Recent Quotes</h3>
                <Link href="/quotes" className="text-emerald-400 hover:underline">
                  View All Quotes
                </Link>
              </div>

              {recentQuotes.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No quotes yet</p>
              ) : (
                <div className="space-y-4">
                  {recentQuotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="bg-zinc-900 p-5 rounded-2xl border border-zinc-700"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <div className="font-medium text-white">{quote.number}</div>
                          <div className="text-sm text-zinc-300">
                            {quote.client} • R{quote.total}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                            getQuoteStatus(quote) === 'Converted'
                              ? 'bg-blue-500/20 text-blue-400'
                              : getQuoteStatus(quote) === 'Expired'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {getQuoteStatus(quote)}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-500 mb-3">
                        {toDate(quote.createdAt)?.toLocaleDateString()}
                      </div>

                      <div className="flex gap-3">
                        {getQuoteStatus(quote) === 'Active' ? (
                          <Link
                            href={`/new-invoice?quoteId=${quote.id}`}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-sm font-medium"
                          >
                            Convert to Invoice
                          </Link>
                        ) : null}

                        <Link
                          href="/quotes"
                          className="bg-zinc-700 hover:bg-zinc-600 text-white py-2 px-4 rounded-xl text-sm font-medium"
                        >
                          View Quote
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">Recent Invoices</h3>
                <Link href="/invoices" className="text-emerald-400 hover:underline">
                  View All Invoices
                </Link>
              </div>

              {recentInvoices.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No invoices yet</p>
              ) : (
                <div className="space-y-4">
                  {recentInvoices.map((invoice) => {
                    const paid =
                      String((invoice as any).paymentStatus || '').toLowerCase() === 'paid' ||
                      (invoice as any).paid === true ||
                      String((invoice as any).status || '').toLowerCase() === 'paid';

                    return (
                      <div
                        key={invoice.id}
                        className="bg-zinc-900 p-5 rounded-2xl border border-zinc-700"
                      >
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div>
                            <div className="font-medium text-white">{invoice.number}</div>
                            <div className="text-sm text-zinc-300">
                              {invoice.client} • R{invoice.total}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                              paid
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-500">
                          {toDate(invoice.createdAt)?.toLocaleDateString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8 mb-12">
            <h3 className="text-2xl font-semibold mb-6">This Month&apos;s Report</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              <div>
                <p className="text-5xl font-bold text-emerald-400">
                  {documents.filter((d) => d.type === 'invoice').length}
                </p>
                <p className="text-zinc-400 mt-2">Invoices sent</p>
              </div>
              <div>
                <p className="text-5xl font-bold text-blue-400">
                  {documents.filter((d) => d.type === 'quote').length}
                </p>
                <p className="text-zinc-400 mt-2">Quotes sent</p>
              </div>
              <div>
                <p className="text-5xl font-bold text-purple-400">{customers.length}</p>
                <p className="text-zinc-400 mt-2">Total Customers</p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <h3 className="text-2xl font-semibold mb-4">Email Blast to All Customers</h3>
            <p className="text-zinc-400 mb-6">Send a message to your entire customer list</p>
            {!isPro ? (
              <button
                onClick={() => alert('This is a Pro feature – upgrade for R35/month!')}
                className="bg-zinc-700 hover:bg-zinc-600 py-4 px-10 rounded-2xl text-lg font-medium"
              >
                Pro Feature: Send Email Blast
              </button>
            ) : (
              <button className="bg-purple-600 hover:bg-purple-500 py-4 px-10 rounded-2xl text-lg font-medium">
                Send Email Blast to All Customers
              </button>
            )}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/outstanding-invoices"
              className="bg-red-600 hover:bg-red-500 text-white py-5 px-12 rounded-2xl text-xl font-bold"
            >
              View Outstanding Invoices
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}