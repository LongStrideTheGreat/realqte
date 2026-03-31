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
  ownerName?: string;
  phone?: string;
  businessEmail?: string;
  currencyCode?: string;
  currencyLocale?: string;
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
  currencyCode?: string;
  currencyLocale?: string;
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

function getCurrencyConfig(profile: Profile) {
  return {
    currencyCode: profile.currencyCode || 'ZAR',
    currencyLocale: profile.currencyLocale || 'en-ZA',
  };
}

function formatMoney(
  value: string | number | undefined,
  currencyCode = 'ZAR',
  currencyLocale = 'en-ZA'
) {
  const numeric = typeof value === 'number' ? value : Number(value || 0);

  try {
    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currencyCode} ${numeric.toFixed(2)}`;
  }
}

function formatDocumentMoney(doc: DocumentType, profile: Profile) {
  const fallback = getCurrencyConfig(profile);
  return formatMoney(
    doc.total,
    doc.currencyCode || fallback.currencyCode,
    doc.currencyLocale || fallback.currencyLocale
  );
}

function isProfileComplete(profile: Profile) {
  return Boolean(
    profile.businessName?.trim() &&
      profile.ownerName?.trim() &&
      profile.phone?.trim() &&
      profile.businessEmail?.trim()
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isProfileReady, setIsProfileReady] = useState(false);

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

  const { currencyCode, currencyLocale } = useMemo(
    () => getCurrencyConfig(profile),
    [profile]
  );

  const setupComplete = acceptedTerms && isProfileReady;

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
              const incomingProfile = (data.profile || {}) as Profile;

              setProfile(incomingProfile);
              setAcceptedTerms(data.acceptedTerms === true);
              setIsProfileReady(isProfileComplete(incomingProfile));

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
              setAcceptedTerms(false);
              setIsProfileReady(false);
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
        setAcceptedTerms(false);
        setIsProfileReady(false);
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
    if (!user || !setupComplete) {
      setDocuments([]);
      setCustomers([]);
      setRecentQuotes([]);
      setRecentInvoices([]);
      setMonthlyInvoiced(0);
      setMonthlyQuoted(0);
      return;
    }

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
  }, [user, setupComplete]);

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

    if (!setupComplete) {
      alert('Please complete your profile and accept the Terms of Service first.');
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

  const missingItems = [
    !acceptedTerms ? 'Accept the Terms of Service' : null,
    !profile.businessName?.trim() ? 'Add Business Name' : null,
    !profile.ownerName?.trim() ? 'Add Owner Name' : null,
    !profile.phone?.trim() ? 'Add Contact Number' : null,
    !profile.businessEmail?.trim() ? 'Add Business Email' : null,
  ].filter(Boolean) as string[];

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
                  <Link
                    href={setupComplete ? '/new-invoice' : '/profile'}
                    className="text-zinc-400 hover:text-white"
                  >
                    New Invoice
                  </Link>
                  <Link
                    href={setupComplete ? '/new-quote' : '/profile'}
                    className="text-zinc-400 hover:text-white"
                  >
                    New Quote
                  </Link>
                  <Link
                    href={setupComplete ? '/quotes' : '/profile'}
                    className="text-zinc-400 hover:text-white"
                  >
                    Quotes
                  </Link>
                  <Link
                    href={setupComplete ? '/products' : '/profile'}
                    className="text-zinc-400 hover:text-white"
                  >
                    Products
                  </Link>
                  <Link
                    href={setupComplete ? '/invoices' : '/profile'}
                    className="text-zinc-400 hover:text-white"
                  >
                    Invoices
                  </Link>
                  <Link
                    href={setupComplete ? '/customers' : '/profile'}
                    className="text-zinc-400 hover:text-white"
                  >
                    Customers
                  </Link>
                  <Link
                    href={setupComplete ? '/accounting' : '/profile'}
                    className="text-zinc-400 hover:text-white"
                  >
                    Accounting
                  </Link>
                  <Link
                    href={setupComplete ? '/reporting' : '/profile'}
                    className="text-zinc-400 hover:text-white"
                  >
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
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <Link href="/" className="text-emerald-400 font-medium" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                  <Link href={setupComplete ? '/new-invoice' : '/profile'} className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>New Invoice</Link>
                  <Link href={setupComplete ? '/new-quote' : '/profile'} className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>New Quote</Link>
                  <Link href={setupComplete ? '/quotes' : '/profile'} className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Quotes</Link>
                  <Link href={setupComplete ? '/products' : '/profile'} className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Products</Link>
                  <Link href={setupComplete ? '/invoices' : '/profile'} className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Invoices</Link>
                  <Link href={setupComplete ? '/customers' : '/profile'} className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Customers</Link>
                  <Link href={setupComplete ? '/accounting' : '/profile'} className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Accounting</Link>
                  <Link href={setupComplete ? '/reporting' : '/profile'} className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Reports</Link>
                  <Link href="/profile" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Profile</Link>
                  <button onClick={handleLogout} className="text-left text-red-400 hover:underline">Logout</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <Link href="#features" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Features</Link>
                  <Link href="#how-it-works" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>How it works</Link>
                  <Link href="#pricing" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Pricing</Link>
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
                  Built for Small businesses
                </div>

                <h1 className="text-4xl sm:text-6xl xl:text-7xl font-bold leading-tight mb-6 text-white">
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
                          <p className="font-semibold mt-1">ACME Events Co.</p>
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
              <h2 className="text-3xl sm:text-5xl font-bold mb-4 text-white">Simple workflow. Professional result.</h2>
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
                <h2 className="text-3xl sm:text-5xl font-bold mb-6 text-white">A cleaner, faster way to handle quotes and invoices.</h2>
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

          <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
            <div className="max-w-3xl">
              <p className="text-emerald-400 font-medium mb-3">Pricing</p>
              <h2 className="text-3xl sm:text-5xl font-bold mb-4 text-white">Start free. Upgrade when you need more.</h2>
              <p className="text-zinc-400 text-lg">
                Get started with free document creation, then unlock unlimited usage and advanced tools with Pro.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mt-10">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
                <p className="text-zinc-400 text-sm uppercase tracking-wide">Free</p>
                <h3 className="text-3xl font-bold text-white mt-3">R0</h3>
                <p className="text-zinc-400 mt-4">A solid starting point for getting your first quotes and invoices out fast.</p>
                <ul className="space-y-3 text-zinc-300 mt-6">
                  <li>• Up to 10 documents</li>
                  <li>• Branded PDF workflow</li>
                  <li>• Customer and product saving</li>
                </ul>
                <button
                  onClick={() => openAuthModal('signup')}
                  className="mt-8 bg-zinc-800 hover:bg-zinc-700 px-6 py-3 rounded-2xl font-semibold"
                >
                  Start free
                </button>
              </div>

              <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-8 shadow-xl">
                <div className="inline-flex rounded-full bg-emerald-500/15 text-emerald-400 px-3 py-1 text-xs font-semibold">
                  Most popular
                </div>
                <p className="text-zinc-400 text-sm uppercase tracking-wide mt-4">Pro</p>
                <h3 className="text-3xl font-bold text-white mt-3">R35/month</h3>
                <p className="text-zinc-400 mt-4">For businesses that want unlimited usage and a more complete workflow.</p>
                <ul className="space-y-3 text-zinc-300 mt-6">
                  <li>• Unlimited documents</li>
                  <li>• Premium reporting and accounting tools</li>
                  <li>• Recurring invoice and workflow upgrades</li>
                </ul>
                <button
                  onClick={() => openAuthModal('signup')}
                  className="mt-8 bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-2xl font-semibold"
                >
                  Get Pro
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {!setupComplete && !loadingUserData && (
            <div className="mb-8 bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="max-w-3xl">
                  <p className="text-amber-300 font-semibold text-sm uppercase tracking-wide mb-3">
                    Account setup required
                  </p>
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                    Finish your RealQte setup before using the platform
                  </h3>
                  <p className="text-zinc-300 leading-7">
                    Before you can create quotes, invoices, customers, and other records, you need to
                    complete your business profile and accept the Terms of Service. This helps protect
                    both your business and RealQte and ensures your documents are properly branded.
                  </p>

                  <div className="mt-5">
                    <p className="text-zinc-400 text-sm mb-3">Still needed:</p>
                    <div className="flex flex-wrap gap-2">
                      {missingItems.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center rounded-full bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="min-w-[220px]">
                  <Link
                    href="/profile"
                    className="inline-flex w-full items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-4 rounded-2xl font-bold text-lg"
                  >
                    Complete Profile Setup
                  </Link>
                  <Link
                    href="/legal"
                    className="inline-flex w-full items-center justify-center mt-3 bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-4 rounded-2xl font-medium"
                  >
                    View Terms & Legal Policies
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="relative">
            {!setupComplete && !loadingUserData && (
              <div className="absolute inset-0 z-20 bg-zinc-950/60 backdrop-blur-[2px] rounded-[32px] pointer-events-auto" />
            )}

            <div className={`${!setupComplete && !loadingUserData ? 'select-none' : ''}`}>
              <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6 mb-10">
                <div>
                  <p className="text-zinc-400 text-sm mb-2">Welcome back</p>
                  <h2 className="text-3xl sm:text-4xl font-bold text-white">
                    {profile.businessName || user.email || 'Your dashboard'}
                  </h2>
                  <p className="text-zinc-400 mt-3 max-w-2xl">
                    Keep track of your quotes, invoices, customer activity, and subscription status from one place.
                  </p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 min-w-[280px]">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      isPro
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      {isPro ? 'Pro active' : 'Free plan'}
                    </span>
                    <span className="text-zinc-500 text-sm">{usageCount} docs</span>
                  </div>

                  <p className="text-zinc-300 text-sm">
                    Status: {subscriptionInfo.subscriptionStatus || 'inactive'}
                  </p>

                  {nextBillingText && (
                    <p className="text-zinc-500 text-sm mt-2">
                      Next billing / expiry: {nextBillingText}
                    </p>
                  )}

                  {!isPro && (
                    <button
                      onClick={startSubscriptionCheckout}
                      disabled={isStartingCheckout}
                      className="mt-4 w-full bg-white text-black py-3 rounded-2xl font-semibold hover:bg-zinc-100 disabled:opacity-60"
                    >
                      {isStartingCheckout ? 'Starting checkout...' : 'Upgrade to Pro'}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <p className="text-zinc-400 text-sm">Invoiced this month</p>
                  <p className="text-3xl sm:text-4xl font-bold text-emerald-400 mt-3">
                    {formatMoney(monthlyInvoiced, currencyCode, currencyLocale)}
                  </p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <p className="text-zinc-400 text-sm">Quoted this month</p>
                  <p className="text-3xl sm:text-4xl font-bold text-blue-400 mt-3">
                    {formatMoney(monthlyQuoted, currencyCode, currencyLocale)}
                  </p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <p className="text-zinc-400 text-sm">Customers</p>
                  <p className="text-3xl sm:text-4xl font-bold text-white mt-3">{customers.length}</p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <p className="text-zinc-400 text-sm">Documents created</p>
                  <p className="text-3xl sm:text-4xl font-bold text-purple-400 mt-3">{usageCount}</p>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-8 mb-10">
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-white">Quote stats</h3>
                    <Link href={setupComplete ? '/quotes' : '/profile'} className="text-emerald-400 hover:underline text-sm">
                      View quotes
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Total</p>
                      <p className="text-2xl font-bold text-white mt-2">{quoteStats.total}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Draft</p>
                      <p className="text-2xl font-bold text-emerald-400 mt-2">{quoteStats.draft}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Sent</p>
                      <p className="text-2xl font-bold text-amber-400 mt-2">{quoteStats.sent}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Converted</p>
                      <p className="text-2xl font-bold text-blue-400 mt-2">{quoteStats.converted}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-white">Invoice stats</h3>
                    <Link href={setupComplete ? '/invoices' : '/profile'} className="text-emerald-400 hover:underline text-sm">
                      View invoices
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Total</p>
                      <p className="text-2xl font-bold text-white mt-2">{invoiceStats.total}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Paid</p>
                      <p className="text-2xl font-bold text-emerald-400 mt-2">{invoiceStats.paid}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Sent</p>
                      <p className="text-2xl font-bold text-amber-400 mt-2">{invoiceStats.sent}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Unpaid</p>
                      <p className="text-2xl font-bold text-red-400 mt-2">{invoiceStats.unpaid}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid xl:grid-cols-3 gap-8 mb-10">
                <div className="xl:col-span-2 bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-white">Due soon invoices</h3>
                    <Link href={setupComplete ? '/invoices' : '/profile'} className="text-emerald-400 hover:underline text-sm">
                      Open invoices
                    </Link>
                  </div>

                  {dueSoonInvoices.length === 0 ? (
                    <p className="text-zinc-500">No unpaid invoices due in the next 7 days.</p>
                  ) : (
                    <div className="space-y-4">
                      {dueSoonInvoices.map((invoice) => {
                        const dueDate =
                          invoice.recurring && invoice.nextDue
                            ? toDate(invoice.nextDue)
                            : toDate(invoice.dueDate || invoice.nextDue);

                        return (
                          <div
                            key={invoice.id}
                            className="bg-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-4"
                          >
                            <div>
                              <p className="text-white font-medium">{invoice.number || 'Invoice'}</p>
                              <p className="text-zinc-500 text-sm">
                                {invoice.client || 'Unknown Client'}
                                {dueDate ? ` • Due ${dueDate.toLocaleDateString()}` : ''}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-red-400 font-semibold">
                                {formatDocumentMoney(invoice, profile)}
                              </p>
                              <p className="text-zinc-500 text-xs">Unpaid</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-xl font-semibold text-white mb-5">Quick actions</h3>
                  <div className="grid gap-3">
                    <Link href={setupComplete ? '/new-quote' : '/profile'} className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-2xl font-semibold text-center">
                      Create Quote
                    </Link>
                    <Link href={setupComplete ? '/new-invoice' : '/profile'} className="bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-2xl font-semibold text-center">
                      Create Invoice
                    </Link>
                    <Link href={setupComplete ? '/customers' : '/profile'} className="bg-zinc-800 hover:bg-zinc-700 text-white py-3 px-4 rounded-2xl font-semibold text-center">
                      Manage Customers
                    </Link>
                    <Link href={setupComplete ? '/products' : '/profile'} className="bg-zinc-800 hover:bg-zinc-700 text-white py-3 px-4 rounded-2xl font-semibold text-center">
                      Manage Products
                    </Link>
                    <Link href={setupComplete ? '/accounting' : '/profile'} className="bg-zinc-800 hover:bg-zinc-700 text-white py-3 px-4 rounded-2xl font-semibold text-center">
                      Accounting
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid xl:grid-cols-2 gap-8">
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-white">Recent quotes</h3>
                    <Link href={setupComplete ? '/quotes' : '/profile'} className="text-emerald-400 hover:underline text-sm">
                      See all
                    </Link>
                  </div>

                  {recentQuotes.length === 0 ? (
                    <p className="text-zinc-500">No recent quotes yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {recentQuotes.map((quote) => (
                        <div key={quote.id} className="bg-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-white font-medium">{quote.number || 'Quote'}</p>
                            <p className="text-zinc-500 text-sm">{quote.client || 'Unknown Client'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-semibold">{formatDocumentMoney(quote, profile)}</p>
                            <p className="text-zinc-500 text-xs">{getQuoteStatus(quote)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-white">Recent invoices</h3>
                    <Link href={setupComplete ? '/invoices' : '/profile'} className="text-emerald-400 hover:underline text-sm">
                      See all
                    </Link>
                  </div>

                  {recentInvoices.length === 0 ? (
                    <p className="text-zinc-500">No recent invoices yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {recentInvoices.map((invoice) => (
                        <div key={invoice.id} className="bg-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-white font-medium">{invoice.number || 'Invoice'}</p>
                            <p className="text-zinc-500 text-sm">{invoice.client || 'Unknown Client'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-semibold">{formatDocumentMoney(invoice, profile)}</p>
                            <p className="text-zinc-500 text-xs">{getInvoiceStatus(invoice)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}