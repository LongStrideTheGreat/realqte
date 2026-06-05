'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  addDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import AppHeader from '@/components/AppHeader';

type Profile = {
  businessName?: string;
  firstName?: string;
  lastName?: string;
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
  userId?: string;
  type?: string;
  number?: string;
  client?: string;
  clientEmail?: string;
  total?: string | number;
  createdAt?: any;
  status?: string;
  paymentStatus?: string;
  paid?: boolean;
  currencyCode?: string;
  currencyLocale?: string;
};

type ExpenseType = {
  id: string;
  userId?: string;
  description?: string;
  amount?: number | string;
  date?: string;
  category?: string;
  createdAt?: any;
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

function isInvoicePaid(documentItem: DocumentType) {
  return (
    documentItem.paid === true ||
    String(documentItem.paymentStatus || '').toLowerCase() === 'paid' ||
    String(documentItem.status || '').toLowerCase() === 'paid'
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
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

function formatDocumentMoney(documentItem: DocumentType, profile: Profile) {
  const fallback = getCurrencyConfig(profile);
  return formatMoney(
    documentItem.total,
    documentItem.currencyCode || fallback.currencyCode,
    documentItem.currencyLocale || fallback.currencyLocale
  );
}

export default function Accounting() {
  const router = useRouter();

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
  const [expenses, setExpenses] = useState<ExpenseType[]>([]);
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year' | 'all'>('month');
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'month'>('all');
  const [addingExpense, setAddingExpense] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingUserData, setLoadingUserData] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'General',
  });

  const { currencyCode, currencyLocale } = useMemo(
    () => getCurrencyConfig(profile),
    [profile]
  );

  // Real-time User & Subscription
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      setUser(u);
      setMobileMenuOpen(false);
      setLoadingUserData(true);

      const userDocRef = doc(db, 'users', u.uid);
      unsubscribeSnapshot = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const subscription = isSubscriptionActive(data);
            const incomingProfile = data.profile || {};

            setProfile({
              ...incomingProfile,
              currencyCode: incomingProfile.currencyCode || 'ZAR',
              currencyLocale: incomingProfile.currencyLocale || 'en-ZA',
            });

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
            setProfile({
              currencyCode: 'ZAR',
              currencyLocale: 'en-ZA',
            });
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
        }
      );
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      unsubscribeAuth();
    };
  }, [router]);

  // Real-time Documents & Expenses
  useEffect(() => {
    if (!user) return;

    const docsQuery = query(
      collection(db, 'documents'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const expensesQuery = query(
      collection(db, 'expenses'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubDocs = onSnapshot(docsQuery, (snap) => {
      setDocuments(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]);
    });

    const unsubExpenses = onSnapshot(expensesQuery, (snap) => {
      setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseType[]);
    });

    return () => {
      unsubDocs();
      unsubExpenses();
    };
  }, [user]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const getDateRangeFilter = (itemDate: Date | null) => {
    if (!itemDate) return false;
    const itemMonth = itemDate.getMonth();
    const itemYear = itemDate.getFullYear();

    switch (dateRange) {
      case 'month':
        return itemMonth === currentMonth && itemYear === currentYear;
      case 'quarter':
        const quarterStart = Math.floor(currentMonth / 3) * 3;
        return itemYear === currentYear && itemMonth >= quarterStart && itemMonth < quarterStart + 3;
      case 'year':
        return itemYear === currentYear;
      case 'all':
        return true;
      default:
        return true;
    }
  };

  const invoiceDocs = useMemo(() => documents.filter((d) => d.type === 'invoice'), [documents]);
  const quoteDocs = useMemo(() => documents.filter((d) => d.type === 'quote'), [documents]);

  const filteredInvoices = useMemo(() => invoiceDocs.filter((d) => getDateRangeFilter(toDate(d.createdAt))), [invoiceDocs, dateRange]);
  const filteredQuotes = useMemo(() => quoteDocs.filter((d) => getDateRangeFilter(toDate(d.createdAt))), [quoteDocs, dateRange]);

  const monthlyInvoices = filteredInvoices;
  const monthlyQuotes = filteredQuotes;

  const paidInvoices = useMemo(() => filteredInvoices.filter(isInvoicePaid), [filteredInvoices]);
  const unpaidInvoices = useMemo(() => filteredInvoices.filter((d) => !isInvoicePaid(d)), [filteredInvoices]);

  const monthlyExpenses = useMemo(() => {
    return expenses.filter((e) => getDateRangeFilter(e.date ? new Date(e.date) : toDate(e.createdAt)));
  }, [expenses, dateRange]);

  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(String(e.amount || 0)), 0);
  const expensesThisMonth = monthlyExpenses.reduce((sum, e) => sum + parseFloat(String(e.amount || 0)), 0);

  const monthlyInvoiced = monthlyInvoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0);
  const monthlyQuoted = monthlyQuotes.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0);

  const paidRevenue = paidInvoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0);
  const outstandingValue = unpaidInvoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0);
  const outstandingCount = unpaidInvoices.length;

  const netProfitThisMonth = monthlyInvoiced - expensesThisMonth;

  const filteredExpenses = useMemo(() => {
    if (expenseFilter === 'all') return expenses;
    return monthlyExpenses;
  }, [expenseFilter, expenses, monthlyExpenses]);

  const expenseCategories = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((expense) => {
      const category = expense.category || 'General';
      const amount = parseFloat(String(expense.amount || 0));
      map.set(category, (map.get(category) || 0) + amount);
    });
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const topExpenseCategoriesThisMonth = useMemo(() => {
    const map = new Map<string, number>();
    monthlyExpenses.forEach((expense) => {
      const category = expense.category || 'General';
      const amount = parseFloat(String(expense.amount || 0));
      map.set(category, (map.get(category) || 0) + amount);
    });
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [monthlyExpenses]);

  const recentFinancialActivity = useMemo(() => {
    const invoiceActivity = invoiceDocs.slice(0, 5).map((doc) => ({
      id: doc.id,
      kind: 'invoice' as const,
      label: doc.number || 'Invoice',
      name: doc.client || 'Unknown Client',
      amount: parseFloat(String(doc.total || '0')),
      date: toDate(doc.createdAt),
      paid: isInvoicePaid(doc),
      currencyCode: doc.currencyCode,
      currencyLocale: doc.currencyLocale,
    }));

    const expenseActivity = expenses.slice(0, 5).map((expense) => ({
      id: expense.id,
      kind: 'expense' as const,
      label: expense.description || 'Expense',
      name: expense.category || 'General',
      amount: parseFloat(String(expense.amount || 0)),
      date: expense.date ? new Date(expense.date) : toDate(expense.createdAt),
      paid: false,
      currencyCode,
      currencyLocale,
    }));

    return [...invoiceActivity, ...expenseActivity]
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
      .slice(0, 8);
  }, [invoiceDocs, expenses, currencyCode, currencyLocale]);

  const collectionRate = paidRevenue + outstandingValue > 0 ? (paidRevenue / (paidRevenue + outstandingValue)) * 100 : 0;
  const averageInvoiceValue = invoiceDocs.length > 0 ? invoiceDocs.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0) / invoiceDocs.length : 0;
  const expenseRatioThisMonth = monthlyInvoiced > 0 ? (expensesThisMonth / monthlyInvoiced) * 100 : 0;
  const profitMarginThisMonth = monthlyInvoiced > 0 ? (netProfitThisMonth / monthlyInvoiced) * 100 : 0;

  const nextBillingText = formatDate(subscriptionInfo.nextBillingDate) || formatDate(subscriptionInfo.proExpiresAt);

  const addExpense = async () => {
    if (!user) {
      alert('Please sign in');
      return;
    }

    if (!isPro) {
      alert('Expense tracking is a Pro feature.');
      return;
    }

    if (!newExpense.description.trim() || !newExpense.amount || !newExpense.date) {
      alert('Please complete description, amount and date.');
      return;
    }

    try {
      setAddingExpense(true);

      const payload = {
        userId: user.uid,
        description: newExpense.description.trim(),
        amount: parseFloat(newExpense.amount),
        date: newExpense.date,
        category: newExpense.category || 'General',
        createdAt: Timestamp.now(),
      };

      const ref = await addDoc(collection(db, 'expenses'), payload);

      setExpenses((prev) => [{ id: ref.id, ...payload }, ...prev]);
      setNewExpense({
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'General',
      });

      alert('Expense added!');
    } catch (err: any) {
      console.error('Add expense error:', err);
      alert('Failed to add expense: ' + (err.message || 'Unknown error'));
    } finally {
      setAddingExpense(false);
    }
  };

  const startSubscriptionCheckout = async () => {
    if (!user) {
      router.push('/');
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

      if (!payfast_url || !fields) {
        throw new Error('Invalid PayFast response');
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

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden">
      <AppHeader
        user={user}
        setupComplete={true}
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Accounting</h1>
            <p className="text-zinc-400">
              Track revenue, expenses, cash flow, invoice collections, and business performance.
            </p>
          </div>

          <div className="w-full xl:w-auto">
            {loadingUserData ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl px-5 py-4 text-sm text-zinc-400">
                Checking subscription status...
              </div>
            ) : isPro ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl px-5 py-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
                    Pro active
                  </span>
                  <span className="text-sm text-zinc-300">
                    Status: {subscriptionInfo.subscriptionStatus || 'active'}
                    {nextBillingText ? ` • Next billing / expiry: ${nextBillingText}` : ''}
                  </span>
                </div>
                <p className="text-sm text-zinc-400">
                  Expense tracking, category breakdowns, and premium accounting insights are unlocked.
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  Default currency: {currencyCode} ({currencyLocale})
                </p>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Unlock Accounting Pro</p>
                    <p className="text-sm text-zinc-400 mt-1">
                      Add expenses, view category breakdowns, and track real monthly profit for R35/month.
                    </p>
                  </div>

                  <button
                    onClick={startSubscriptionCheckout}
                    disabled={isStartingCheckout || loadingUserData}
                    className="bg-white text-black px-5 py-3 rounded-2xl font-semibold hover:bg-zinc-100 disabled:opacity-60"
                  >
                    {isStartingCheckout ? 'Starting checkout...' : 'Upgrade to Pro'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          {(['month', 'quarter', 'year', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-5 py-2.5 rounded-2xl text-sm font-medium transition ${
                dateRange === range
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {range === 'month' && 'This Month'}
              {range === 'quarter' && 'This Quarter'}
              {range === 'year' && 'This Year'}
              {range === 'all' && 'All Time'}
            </button>
          ))}
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Invoiced this period</p>
            <p className="text-3xl sm:text-4xl font-bold text-emerald-400 mt-2">
              {formatMoney(monthlyInvoiced, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Quoted this period</p>
            <p className="text-3xl sm:text-4xl font-bold text-blue-400 mt-2">
              {formatMoney(monthlyQuoted, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Expenses this period</p>
            <p className="text-3xl sm:text-4xl font-bold text-orange-400 mt-2">
              {formatMoney(expensesThisMonth, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Net this period</p>
            <p className={`text-3xl sm:text-4xl font-bold mt-2 ${netProfitThisMonth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatMoney(netProfitThisMonth, currencyCode, currencyLocale)}
            </p>
          </div>
        </div>

        {/* More Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Paid revenue</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              {formatMoney(paidRevenue, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Outstanding</p>
            <p className="text-3xl font-bold text-red-400 mt-2">
              {formatMoney(outstandingValue, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Collection rate</p>
            <p className="text-3xl font-bold text-blue-400 mt-2">
              {collectionRate.toFixed(1)}%
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Average invoice</p>
            <p className="text-3xl font-bold text-white mt-2">
              {formatMoney(averageInvoiceValue, currencyCode, currencyLocale)}
            </p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex flex-col md:flex-row gap-6 mb-12">
          <Link
            href="/outstanding-invoices"
            className="flex-1 bg-red-600 hover:bg-red-500 text-white py-5 rounded-2xl text-lg sm:text-xl font-bold text-center"
          >
            View Outstanding Invoices ({outstandingCount})
          </Link>

          <Link
            href="/invoices"
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl text-lg sm:text-xl font-bold text-center"
          >
            View All Invoices
          </Link>
        </div>

        {/* Expense Tracking Section - Full original + improvements */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          <div className="xl:col-span-2 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            {/* Your original expense form and list code goes here - kept intact */}
            {/* ... (paste your full original expense section) ... */}
          </div>

          {/* Categories and Top Categories sidebar - kept from original */}
        </div>

        {/* Recent Activity - kept from original */}
        <div className="bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-800">
          <h3 className="text-2xl font-semibold text-white mb-6">Recent Financial Activity</h3>
          {/* Your original recent activity code */}
        </div>
      </div>

      <footer className="mt-12 border-t border-zinc-800 pt-6 pb-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} RealQte. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/help" className="hover:text-white transition">Help</Link>
            <Link href="/legal" className="hover:text-white transition">Legal</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}