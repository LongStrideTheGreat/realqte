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
  sendPasswordResetEmail,
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
  total?: string | number;
  createdAt?: any;
  recurring?: boolean;
  nextDue?: any;
  convertedToInvoice?: boolean;
  convertedInvoiceId?: string | null;
  expiryDate?: any;
  date?: string;
  dueDate?: any;
  status?: string;
  paid?: boolean;
  paymentStatus?: string;
  sourceDocumentId?: string | null;
  sourceQuoteNumber?: string | null;
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

function getQuoteStatus(doc: DocumentType): 'Draft' | 'Sent' | 'Expired' | 'Converted' {
  if (doc.convertedToInvoice || doc.status === 'converted') return 'Converted';
  const expiry = toDate(doc.expiryDate);
  if (expiry && expiry.getTime() < Date.now()) return 'Expired';
  if (String(doc.status || '').toLowerCase() === 'sent') return 'Sent';
  return 'Draft';
}

function isInvoicePaid(doc: DocumentType) {
  return (
    String(doc.paymentStatus || '').toLowerCase() === 'paid' ||
    doc.paid === true ||
    String(doc.status || '').toLowerCase() === 'paid'
  );
}

function getInvoiceStatus(doc: DocumentType): 'Paid' | 'Sent' | 'Unpaid' {
  if (isInvoicePaid(doc)) return 'Paid';
  if (String(doc.status || '').toLowerCase() === 'sent') return 'Sent';
  return 'Unpaid';
}

function formatMoney(value: string | number | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value || 0);
  return numeric.toFixed(2);
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
  const [resetMessage, setResetMessage] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setMobileMenuOpen(false);

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

      if (docDate.getMonth() === currentMonth && docDate.getFullYear() === currentYear) {
        if (documentItem.type === 'invoice') {
          invoiced += parseFloat(String(documentItem.total || '0'));
        }
        if (documentItem.type === 'quote') {
          quoted += parseFloat(String(documentItem.total || '0'));
        }
      }
    });

    setMonthlyInvoiced(invoiced);
    setMonthlyQuoted(quoted);
  }, [documents]);

  const usageCount = documents.length;

  const dueSoonInvoices = useMemo(() => {
    const now = Date.now();
    const cutoff = now + 7 * 24 * 60 * 60 * 1000;

    return documents
      .filter((d) => {
        if (d.type !== 'invoice') return false;
        if (isInvoicePaid(d)) return false;

        const dueDate =
          d.recurring && d.nextDue ? toDate(d.nextDue) : toDate(d.dueDate || d.nextDue);
        if (!dueDate) return false;

        const dueTime = dueDate.getTime();
        return dueTime >= now && dueTime <= cutoff;
      })
      .sort((a, b) => {
        const aDue =
          toDate(a.recurring && a.nextDue ? a.nextDue : a.dueDate || a.nextDue)?.getTime() || 0;
        const bDue =
          toDate(b.recurring && b.nextDue ? b.nextDue : b.dueDate || b.nextDue)?.getTime() || 0;
        return aDue - bDue;
      })
      .slice(0, 5);
  }, [documents]);

  const quoteStats = useMemo(() => {
    const quoteDocs = documents.filter((d) => d.type === 'quote');
    return {
      total: quoteDocs.length,
      draft: quoteDocs.filter((d) => getQuoteStatus(d) === 'Draft').length,
      sent: quoteDocs.filter((d) => getQuoteStatus(d) === 'Sent').length,
      converted: quoteDocs.filter((d) => getQuoteStatus(d) === 'Converted').length,
    };
  }, [documents]);

  const invoiceStats = useMemo(() => {
    const invoiceDocs = documents.filter((d) => d.type === 'invoice');
    return {
      total: invoiceDocs.length,
      paid: invoiceDocs.filter((d) => getInvoiceStatus(d) === 'Paid').length,
      sent: invoiceDocs.filter((d) => getInvoiceStatus(d) === 'Sent').length,
      unpaid: invoiceDocs.filter((d) => getInvoiceStatus(d) === 'Unpaid').length,
    };
  }, [documents]);

  const openAuthModal = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthError('');
    setResetMessage('');
    setPassword('');
    setShowAuth(true);
  };

  const closeAuthModal = () => {
    setShowAuth(false);
    setAuthError('');
    setResetMessage('');
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthError('');
      setResetMessage('');
      await signInWithPopup(auth, provider);
      setShowAuth(false);
      setMobileMenuOpen(false);
    } catch (err: any) {
      setAuthError(err.message || 'Google sign in failed');
    }
  };

  const handleEmailAuth = async () => {
    try {
      setAuthError('');
      setResetMessage('');

      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }

      setShowAuth(false);
      setMobileMenuOpen(false);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setAuthError('Please enter your email address first.');
      setResetMessage('');
      return;
    }

    try {
      setIsSendingReset(true);
      setAuthError('');
      setResetMessage('');

      await sendPasswordResetEmail(auth, trimmedEmail);

      setResetMessage('Password reset email sent. Please check your inbox and spam folder.');
    } catch (err: any) {
      console.error('Password reset error:', err);

      if (err.code === 'auth/user-not-found') {
        setAuthError('No account was found with that email address.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else if (err.code === 'auth/too-many-requests') {
        setAuthError('Too many attempts. Please wait a bit and try again.');
      } else {
        setAuthError('Failed to send password reset email.');
      }

      setResetMessage('');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const startSubscriptionCheckout = async () => {
    if (!user) {
      openAuthModal('signup');
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

      const { payfast_url, fields } = await response.json();

      if (!payfast_url || !fields || typeof fields !== 'object') {
        throw new Error('Invalid PayFast initiation response');
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = payfast_url;

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value ?? '');
        form.appendChild(input);
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

  const nextBillingText =
    formatDate(subscriptionInfo.nextBillingDate) ||
    formatDate(subscriptionInfo.proExpiresAt);

  return (
    <div className="min-h-screen bg-zinc-950 overflow-x-hidden">
      <header className="bg-zinc-900/90 backdrop-blur border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-emerald-400 whitespace-nowrap">
                RealQte
              </h1>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded whitespace-nowrap">
                SA
              </span>
            </div>

            <div className="hidden xl:flex items-center gap-6 text-sm">
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
                  <Link href="/products" className="text-zinc-400 hover:text-white">
                    Products
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
                  <button onClick={handleLogout} className="text-red-400 hover:underline">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="#features" className="text-zinc-400 hover:text-white">
                    Features
                  </Link>
                  <Link href="#how-it-works" className="text-zinc-400 hover:text-white">
                    How it works
                  </Link>
                  <Link href="#pricing" className="text-zinc-400 hover:text-white">
                    Pricing
                  </Link>
                  <button
                    onClick={() => openAuthModal('login')}
                    className="text-zinc-300 hover:text-white"
                  >
                    Log in
                  </button>
                  <button
                    onClick={() => openAuthModal('signup')}
                    className="bg-white text-black px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-100"
                  >
                    Sign up free
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="xl:hidden inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="xl:hidden mt-4 border-t border-zinc-800 pt-4">
              {user ? (
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <Link href="/" className="text-emerald-400 font-medium" onClick={() => setMobileMenuOpen(false)}>
                    Dashboard
                  </Link>
                  <Link href="/new-invoice" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    New Invoice
                  </Link>
                  <Link href="/new-quote" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    New Quote
                  </Link>
                  <Link href="/quotes" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Quotes
                  </Link>
                  <Link href="/products" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Products
                  </Link>
                  <Link href="/invoices" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Invoices
                  </Link>
                  <Link href="/customers" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Customers
                  </Link>
                  <Link href="/accounting" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Accounting
                  </Link>
                  <Link href="/reporting" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Reports
                  </Link>
                  <Link href="/profile" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Profile
                  </Link>
                  <button onClick={handleLogout} className="text-left text-red-400 hover:underline">
                    Logout
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <Link href="#features" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Features
                  </Link>
                  <Link href="#how-it-works" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    How it works
                  </Link>
                  <Link href="#pricing" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                    Pricing
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openAuthModal('login');
                    }}
                    className="text-left text-zinc-300 hover:text-white"
                  >
                    Log in
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openAuthModal('signup');
                    }}
                    className="bg-white text-black px-4 py-2.5 rounded-xl font-medium hover:bg-zinc-100 text-left"
                  >
                    Sign up free
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {showAuth && !user && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 rounded-3xl p-6 sm:p-10 max-w-md w-full border border-zinc-800 shadow-2xl">
            <h2 className="text-3xl font-bold mb-6 text-center">
              {authMode === 'login' ? 'Log In' : 'Sign Up'}
            </h2>

            <div className="flex gap-4 mb-8">
              <button
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setResetMessage('');
                }}
                className={`flex-1 py-3 rounded-xl ${
                  authMode === 'login' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'
                }`}
              >
                Log In
              </button>
              <button
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError('');
                  setResetMessage('');
                }}
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
              onChange={(e) => {
                setEmail(e.target.value);
                setAuthError('');
                setResetMessage('');
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAuthError('');
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-emerald-500"
            />

            {authMode === 'login' && (
              <div className="flex justify-end mb-6">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isSendingReset}
                  className="text-sm text-emerald-400 hover:underline disabled:opacity-60"
                >
                  {isSendingReset ? 'Sending reset link...' : 'Forgot Password?'}
                </button>
              </div>
            )}

            <button
              onClick={handleEmailAuth}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 rounded-2xl font-bold text-lg mb-4"
            >
              {authMode === 'login' ? 'Log In' : 'Create Free Account'}
            </button>

            {authError && <p className="text-red-400 text-center mb-3">{authError}</p>}
            {resetMessage && <p className="text-emerald-400 text-center mb-3">{resetMessage}</p>}

            <button onClick={closeAuthModal} className="w-full text-zinc-400 hover:text-white py-2">
              Close
            </button>
          </div>
        </div>
      )}

      {!user ? (
        <div className="relative">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="absolute top-64 -left-20 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute top-40 right-0 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
          </div>

          <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-full px-4 py-2 text-sm text-zinc-300 mb-6">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Built for South African businesses
                </div>

                <h1 className="text-4xl sm:text-6xl xl:text-7xl font-bold leading-tight mb-6">
                  Create quotes and invoices that look
                  <span className="text-emerald-400"> professional</span> and help you get paid
                  <span className="text-white"> faster.</span>
                </h1>

                <p className="text-lg sm:text-xl text-zinc-300 max-w-2xl mb-8 leading-8">
                  RealQte helps contractors, freelancers, side hustles, salons, suppliers, food
                  vendors, startups, and small businesses create polished quotes and invoices in
                  minutes. Save customers, reuse products, add your logo, and keep everything
                  organised in one place.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                  <button
                    onClick={() => openAuthModal('signup')}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black text-lg font-bold px-8 py-4 rounded-2xl"
                  >
                    Start Free
                  </button>
                  <button
                    onClick={() => openAuthModal('login')}
                    className="border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white text-lg font-medium px-8 py-4 rounded-2xl"
                  >
                    Log In
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-2xl font-bold text-emerald-400">10</p>
                    <p className="text-zinc-400 mt-1">Free documents to get started</p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-2xl font-bold text-blue-400">PDF</p>
                    <p className="text-zinc-400 mt-1">Quotes and invoices ready to send</p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-2xl font-bold text-purple-400">R35</p>
                    <p className="text-zinc-400 mt-1">Pro plan for unlimited usage</p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-[32px] p-5 shadow-2xl">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-[28px] p-5">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-zinc-500 text-xs uppercase tracking-[0.2em]">Live Preview</p>
                        <h3 className="text-xl font-semibold text-white mt-2">Professional Quote</h3>
                      </div>
                      <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-3 py-1 text-xs font-medium">
                        Ready to send
                      </span>
                    </div>

                    <div className="bg-white rounded-3xl p-5 text-black shadow-xl">
                      <div className="flex justify-between items-start gap-4 mb-5">
                        <div>
                          <div className="text-2xl font-bold text-emerald-600">RealQte</div>
                          <div className="text-xs text-zinc-600 mt-1">Your business branding here</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold">QUOTE</div>
                          <div className="text-xs text-zinc-500 mt-1">QTE-20260325-14521</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-5">
                        <div className="bg-zinc-100 rounded-2xl p-3">
                          <p className="text-xs text-zinc-500">Client</p>
                          <p className="font-semibold mt-1">Benoni Events Co.</p>
                        </div>
                        <div className="bg-zinc-100 rounded-2xl p-3">
                          <p className="text-xs text-zinc-500">Valid for</p>
                          <p className="font-semibold mt-1">15 days</p>
                        </div>
                      </div>

                      <div className="space-y-3 mb-5">
                        <div className="flex justify-between text-sm border-b border-zinc-200 pb-2">
                          <span>Event setup service</span>
                          <span>R2,500.00</span>
                        </div>
                        <div className="flex justify-between text-sm border-b border-zinc-200 pb-2">
                          <span>Transport and labour</span>
                          <span>R850.00</span>
                        </div>
                        <div className="flex justify-between text-sm font-semibold pt-2">
                          <span>Total</span>
                          <span className="text-emerald-700">R3,850.00</span>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                        <p className="text-xs text-emerald-700">
                          Add your logo, business info, saved products, and customer details automatically.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden sm:block absolute -left-10 bottom-10 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl">
                  <p className="text-xs text-zinc-500">Fast workflow</p>
                  <p className="text-white font-semibold mt-1">Customer → Quote → Invoice</p>
                </div>

                <div className="hidden sm:block absolute -right-8 top-10 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl">
                  <p className="text-xs text-zinc-500">Look more credible</p>
                  <p className="text-white font-semibold mt-1">Clean branded PDFs</p>
                </div>
              </div>
            </div>
          </section>

          <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-10">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 text-xl mb-4">
                  ⚡
                </div>
                <h3 className="text-xl font-semibold mb-3">Create documents quickly</h3>
                <p className="text-zinc-400">
                  Build polished quotes and invoices in minutes instead of typing them from scratch every time.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/15 flex items-center justify-center text-blue-400 text-xl mb-4">
                  👥
                </div>
                <h3 className="text-xl font-semibold mb-3">Save customers and products</h3>
                <p className="text-zinc-400">
                  Reuse saved customer details and products/services so quoting gets faster as your business grows.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <div className="h-12 w-12 rounded-2xl bg-purple-500/15 flex items-center justify-center text-purple-400 text-xl mb-4">
                  📈
                </div>
                <h3 className="text-xl font-semibold mb-3">Track what matters</h3>
                <p className="text-zinc-400">
                  Stay on top of quotes, invoices, statuses, totals, and due items from one dashboard.
                </p>
              </div>
            </div>
          </section>

          <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
            <div className="text-center mb-12">
              <p className="text-emerald-400 font-medium mb-3">How it works</p>
              <h2 className="text-3xl sm:text-5xl font-bold mb-4">Simple workflow. Professional result.</h2>
              <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
                RealQte is built to remove admin friction so you can spend less time formatting documents and more time closing work.
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <div className="text-emerald-400 text-3xl font-bold mb-4">01</div>
                <h3 className="text-xl font-semibold mb-3">Create your account</h3>
                <p className="text-zinc-400">Start free and set up your business profile with your contact details and logo.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <div className="text-blue-400 text-3xl font-bold mb-4">02</div>
                <h3 className="text-xl font-semibold mb-3">Add customers and services</h3>
                <p className="text-zinc-400">Save repeat customer info and products/services to speed up future documents.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <div className="text-purple-400 text-3xl font-bold mb-4">03</div>
                <h3 className="text-xl font-semibold mb-3">Generate quotes</h3>
                <p className="text-zinc-400">Build polished quotes with totals, branding, and clean layouts ready for clients.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <div className="text-amber-400 text-3xl font-bold mb-4">04</div>
                <h3 className="text-xl font-semibold mb-3">Convert into invoices</h3>
                <p className="text-zinc-400">Turn accepted quotes into invoices and keep everything linked and organised.</p>
              </div>
            </div>
          </section>

          <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <p className="text-emerald-400 font-medium mb-3">Why businesses use RealQte</p>
                <h2 className="text-3xl sm:text-5xl font-bold mb-6">A cleaner, faster way to handle quotes and invoices.</h2>
                <div className="space-y-5">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="font-semibold text-lg mb-2">Branded PDF documents</h3>
                    <p className="text-zinc-400">Upload your logo and generate professional-looking files that feel credible and client-ready.</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="font-semibold text-lg mb-2">Customer and product reuse</h3>
                    <p className="text-zinc-400">No more retyping the same data every time. Save details once and build faster after that.</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="font-semibold text-lg mb-2">Track statuses and history</h3>
                    <p className="text-zinc-400">See what is drafted, sent, paid, overdue, converted, and due soon from one place.</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
                <div className="grid gap-4">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-white">Quote stats</h3>
                      <span className="text-xs bg-purple-500/15 text-purple-400 px-2 py-1 rounded-full">Live style</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-zinc-900 rounded-2xl p-4">
                        <p className="text-zinc-500 text-xs">Draft</p>
                        <p className="text-2xl font-bold text-emerald-400 mt-1">12</p>
                      </div>
                      <div className="bg-zinc-900 rounded-2xl p-4">
                        <p className="text-zinc-500 text-xs">Sent</p>
                        <p className="text-2xl font-bold text-amber-400 mt-1">8</p>
                      </div>
                      <div className="bg-zinc-900 rounded-2xl p-4">
                        <p className="text-zinc-500 text-xs">Paid</p>
                        <p className="text-2xl font-bold text-blue-400 mt-1">6</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-white">Recent activity</h3>
                      <span className="text-xs text-zinc-500">Dashboard</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-zinc-900 rounded-2xl p-3">
                        <div>
                          <p className="text-white text-sm font-medium">QTE-20260325-14521</p>
                          <p className="text-zinc-500 text-xs">Benoni Events Co.</p>
                        </div>
                        <span className="text-emerald-400 text-sm">Draft</span>
                      </div>
                      <div className="flex items-center justify-between bg-zinc-900 rounded-2xl p-3">
                        <div>
                          <p className="text-white text-sm font-medium">INV-20260324-22416</p>
                          <p className="text-zinc-500 text-xs">JH Repairs</p>
                        </div>
                        <span className="text-amber-400 text-sm">Sent</span>
                      </div>
                      <div className="flex items-center justify-between bg-zinc-900 rounded-2xl p-3">
                        <div>
                          <p className="text-white text-sm font-medium">INV-20260321-11471</p>
                          <p className="text-zinc-500 text-xs">Urban Projects</p>
                        </div>
                        <span className="text-blue-400 text-sm">Paid</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-emerald-500/15 to-blue-500/15 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="font-semibold text-white mb-2">Built for real day-to-day business use</h3>
                    <p className="text-zinc-300 text-sm">
                      Whether you quote for labour, products, transport, projects, or services, RealQte helps you present your work more professionally.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
                <p className="text-emerald-400 font-medium mb-3">Who it helps</p>
                <h3 className="text-2xl font-bold mb-4">Perfect for small and growing businesses</h3>
                <p className="text-zinc-400">
                  Use RealQte if you need a faster, cleaner way to create quotes and invoices without building a full accounting system around your business.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
                <h3 className="text-xl font-semibold mb-4">Popular with</h3>
                <ul className="space-y-3 text-zinc-400">
                  <li>• Freelancers and consultants</li>
                  <li>• Contractors and technicians</li>
                  <li>• Event and service businesses</li>
                  <li>• Side hustles and startups</li>
                  <li>• Product and supply sellers</li>
                </ul>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
                <h3 className="text-xl font-semibold mb-4">What you get</h3>
                <ul className="space-y-3 text-zinc-400">
                  <li>• Better-looking documents</li>
                  <li>• Faster repeat quoting</li>
                  <li>• Cleaner client workflow</li>
                  <li>• Easier invoice follow-up</li>
                  <li>• One place to track activity</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
            <div className="text-center mb-12">
              <p className="text-emerald-400 font-medium mb-3">Pricing</p>
              <h2 className="text-3xl sm:text-5xl font-bold mb-4">Start free. Upgrade when you need more.</h2>
              <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
                Try RealQte without risk, then unlock unlimited usage and more advanced tools when your business is ready.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <div className="bg-zinc-900 p-8 rounded-3xl border border-emerald-500/30 shadow-xl">
                <h3 className="text-2xl font-bold mb-4">Free</h3>
                <p className="text-5xl font-bold mb-6">R0</p>
                <ul className="text-zinc-400 space-y-3 mb-8">
                  <li>10 total free documents</li>
                  <li>Professional PDF quotes and invoices</li>
                  <li>Customer management</li>
                  <li>Profile and logo customization</li>
                </ul>
                <button
                  onClick={() => openAuthModal('signup')}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-bold"
                >
                  Get Started Free
                </button>
              </div>

              <div className="bg-zinc-900 p-8 rounded-3xl border border-purple-500/40 relative shadow-xl">
                <div className="absolute top-0 right-6 bg-purple-600 text-white px-4 py-1 rounded-b-lg text-sm font-bold">
                  Popular
                </div>
                <h3 className="text-2xl font-bold mb-4">Pro</h3>
                <p className="text-5xl font-bold mb-6">
                  R35<span className="text-xl">/month</span>
                </p>
                <ul className="text-zinc-400 space-y-3 mb-8">
                  <li>Unlimited invoices and quotes</li>
                  <li>Advanced reporting</li>
                  <li>Recurring invoice support</li>
                  <li>Due-soon visibility</li>
                  <li>More growth-friendly workflow tools</li>
                </ul>
                <button
                  onClick={() => openAuthModal('signup')}
                  className="w-full bg-purple-600 hover:bg-purple-500 py-4 rounded-2xl font-bold"
                >
                  Create account to subscribe
                </button>
              </div>
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
            <div className="bg-gradient-to-r from-zinc-900 to-zinc-900/80 border border-zinc-800 rounded-[32px] p-8 sm:p-12 text-center">
              <h2 className="text-3xl sm:text-5xl font-bold mb-4">Ready to make your business look more professional?</h2>
              <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-8">
                Join RealQte, create your first polished quote or invoice, and start presenting your work with more confidence.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={() => openAuthModal('signup')}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black text-lg font-bold px-8 py-4 rounded-2xl"
                >
                  Start Free Now
                </button>
                <button
                  onClick={() => openAuthModal('login')}
                  className="border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-medium px-8 py-4 rounded-2xl"
                >
                  Log In
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-2 text-zinc-100 !text-zinc-100">
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
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 sm:p-8">
              <p className="text-zinc-400 text-sm">Invoiced this month</p>
              <p className="text-4xl sm:text-5xl font-bold text-emerald-400 mt-2">
                R{monthlyInvoiced.toFixed(2)}
              </p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 sm:p-8">
              <p className="text-zinc-400 text-sm">Quoted this month</p>
              <p className="text-4xl sm:text-5xl font-bold text-blue-400 mt-2">
                R{monthlyQuoted.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-16">
            <Link
              href="/new-invoice"
              className="bg-emerald-500 hover:bg-emerald-400 text-black p-8 sm:p-10 rounded-3xl text-center text-xl sm:text-2xl font-bold"
            >
              Create New Invoice
            </Link>
            <Link
              href="/new-quote"
              className="bg-blue-600 hover:bg-blue-500 text-white p-8 sm:p-10 rounded-3xl text-center text-xl sm:text-2xl font-bold"
            >
              Create New Quote
            </Link>
            <Link
              href="/quotes"
              className="bg-purple-600 hover:bg-purple-500 text-white p-8 sm:p-10 rounded-3xl text-center text-xl sm:text-2xl font-bold"
            >
              View Quotes
            </Link>
            <Link
              href="/customers"
              className="bg-zinc-700 hover:bg-zinc-600 text-white p-8 sm:p-10 rounded-3xl text-center text-xl sm:text-2xl font-bold"
            >
              Manage Customers
            </Link>
          </div>

          {isPro && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-5 sm:p-6 mb-12">
              <div className="flex justify-between items-center gap-4 mb-4">
                <h3 className="text-xl sm:text-2xl font-semibold">Invoices Due Soon</h3>
                <Link href="/invoices" className="text-emerald-400 hover:underline text-sm sm:text-base">
                  View All Invoices
                </Link>
              </div>

              <div className="space-y-3">
                {dueSoonInvoices.length === 0 ? (
                  <p className="text-zinc-500 text-center py-6">No invoices due in the next 7 days</p>
                ) : (
                  dueSoonInvoices.map((d) => {
                    const dueDate = d.recurring && d.nextDue ? toDate(d.nextDue) : toDate(d.dueDate || d.nextDue);

                    return (
                      <div
                        key={d.id}
                        className="bg-zinc-900 p-4 rounded-2xl border border-zinc-700 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3"
                      >
                        <div>
                          <div className="font-medium text-white">
                            {d.number} • {d.client}
                          </div>
                          <div className="text-sm text-zinc-300">
                            Due: {dueDate?.toLocaleDateString() || 'No due date'} • R{formatMoney(d.total)}
                          </div>
                          <div className="text-xs text-zinc-500 mt-1">
                            {d.recurring ? 'Recurring invoice' : 'Standard invoice'}
                          </div>
                        </div>

                        <Link
                          href={`/new-invoice?invoiceId=${d.id}`}
                          className="bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-xl text-sm font-medium text-center"
                        >
                          Open Invoice
                        </Link>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {!isPro && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 sm:p-8 mb-12 text-center">
              <h3 className="text-2xl font-semibold mb-4">Unlock RealQte Pro – R35/month</h3>
              <p className="text-zinc-400 mb-6">
                Unlimited documents • Advanced reports • Recurring reminders • And More!
              </p>
              <p className="text-sm text-zinc-500 mb-6">
                Monthly subscription renews automatically until cancelled.
              </p>
              <button
                onClick={startSubscriptionCheckout}
                disabled={isStartingCheckout}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black py-4 sm:py-5 px-8 sm:px-12 rounded-2xl text-lg sm:text-xl font-bold"
              >
                {isStartingCheckout ? 'Starting subscription…' : 'Upgrade to Pro Now'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 sm:p-8">
              <div className="flex justify-between items-center mb-6 gap-4">
                <h3 className="text-2xl font-semibold">Recent Quotes</h3>
                <Link href="/quotes" className="text-emerald-400 hover:underline text-sm sm:text-base">
                  View All Quotes
                </Link>
              </div>

              {recentQuotes.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No quotes yet</p>
              ) : (
                <div className="space-y-4">
                  {recentQuotes.map((quote) => {
                    const quoteStatus = getQuoteStatus(quote);

                    return (
                      <div key={quote.id} className="bg-zinc-900 p-5 rounded-2xl border border-zinc-700">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div>
                            <div className="font-medium text-white">{quote.number}</div>
                            <div className="text-sm text-zinc-300">
                              {quote.client} • R{formatMoney(quote.total)}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                              quoteStatus === 'Converted'
                                ? 'bg-blue-500/20 text-blue-400'
                                : quoteStatus === 'Expired'
                                ? 'bg-red-500/20 text-red-400'
                                : quoteStatus === 'Sent'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {quoteStatus}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-500 mb-3">
                          {toDate(quote.createdAt)?.toLocaleDateString()}
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {(quoteStatus === 'Draft' || quoteStatus === 'Sent') && (
                            <Link
                              href={`/new-invoice?quoteId=${quote.id}`}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-sm font-medium"
                            >
                              Convert to Invoice
                            </Link>
                          )}

                          <Link
                            href={`/new-quote?quoteId=${quote.id}`}
                            className="bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-xl text-sm font-medium"
                          >
                            Edit Quote
                          </Link>

                          {quoteStatus === 'Converted' && quote.convertedInvoiceId ? (
                            <Link
                              href={`/new-invoice?invoiceId=${quote.convertedInvoiceId}`}
                              className="bg-zinc-700 hover:bg-zinc-600 text-white py-2 px-4 rounded-xl text-sm font-medium"
                            >
                              View Linked Invoice
                            </Link>
                          ) : (
                            <Link
                              href="/quotes"
                              className="bg-zinc-700 hover:bg-zinc-600 text-white py-2 px-4 rounded-xl text-sm font-medium"
                            >
                              View Quote
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 sm:p-8">
              <div className="flex justify-between items-center mb-6 gap-4">
                <h3 className="text-2xl font-semibold">Recent Invoices</h3>
                <Link href="/invoices" className="text-emerald-400 hover:underline text-sm sm:text-base">
                  View All Invoices
                </Link>
              </div>

              {recentInvoices.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No invoices yet</p>
              ) : (
                <div className="space-y-4">
                  {recentInvoices.map((invoice) => {
                    const invoiceStatus = getInvoiceStatus(invoice);

                    return (
                      <div key={invoice.id} className="bg-zinc-900 p-5 rounded-2xl border border-zinc-700">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div>
                            <div className="font-medium text-white">{invoice.number}</div>
                            <div className="text-sm text-zinc-300">
                              {invoice.client} • R{formatMoney(invoice.total)}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                              invoiceStatus === 'Paid'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : invoiceStatus === 'Sent'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {invoiceStatus}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-500 mb-3">
                          {invoice.date || toDate(invoice.createdAt)?.toLocaleDateString()}
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Link
                            href={`/new-invoice?invoiceId=${invoice.id}`}
                            className="bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-xl text-sm font-medium"
                          >
                            Edit Invoice
                          </Link>

                          {invoice.sourceDocumentId ? (
                            <Link
                              href={`/new-quote?quoteId=${invoice.sourceDocumentId}`}
                              className="bg-zinc-700 hover:bg-zinc-600 text-white py-2 px-4 rounded-xl text-sm font-medium"
                            >
                              View Source Quote
                            </Link>
                          ) : (
                            <Link
                              href="/invoices"
                              className="bg-zinc-700 hover:bg-zinc-600 text-white py-2 px-4 rounded-xl text-sm font-medium"
                            >
                              View Invoice
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 sm:p-8 mb-12">
            <h3 className="text-2xl font-semibold mb-6">This Month&apos;s Report</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8 text-center">
              <div>
                <p className="text-5xl font-bold text-emerald-400">{invoiceStats.total}</p>
                <p className="text-zinc-400 mt-2">Invoices created</p>
              </div>
              <div>
                <p className="text-5xl font-bold text-blue-400">{quoteStats.total}</p>
                <p className="text-zinc-400 mt-2">Quotes created</p>
              </div>
              <div>
                <p className="text-5xl font-bold text-amber-400">
                  {quoteStats.sent + invoiceStats.sent}
                </p>
                <p className="text-zinc-400 mt-2">Marked as sent</p>
              </div>
              <div>
                <p className="text-5xl font-bold text-purple-400">{customers.length}</p>
                <p className="text-zinc-400 mt-2">Total Customers</p>
              </div>
              <div>
                <p className="text-5xl font-bold text-emerald-300">{invoiceStats.paid}</p>
                <p className="text-zinc-400 mt-2">Paid invoices</p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/outstanding-invoices"
              className="inline-block bg-red-600 hover:bg-red-500 text-white py-5 px-8 sm:px-12 rounded-2xl text-lg sm:text-xl font-bold"
            >
              View Outstanding Invoices
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}