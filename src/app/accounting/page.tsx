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

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null);
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
        setExpenses([]);
        setLoadingUserData(false);
        router.push('/');
        return;
      }

      setUser(u);
      setMobileMenuOpen(false);

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

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
        },
        (error) => {
          console.error('Accounting subscription snapshot error:', error);
          setLoadingUserData(false);
        }
      );
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      unsubscribeAuth();
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const docsSnap = await getDocs(
          query(
            collection(db, 'documents'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          )
        );
        setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]);

        const expSnap = await getDocs(
          query(
            collection(db, 'expenses'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
          )
        );
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseType[]);
      } catch (err) {
        console.error('Accounting page load error:', err);
      }
    };

    loadData();
  }, [user]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const invoiceDocs = useMemo(
    () => documents.filter((d) => d.type === 'invoice'),
    [documents]
  );

  const quoteDocs = useMemo(
    () => documents.filter((d) => d.type === 'quote'),
    [documents]
  );

  const monthlyInvoices = useMemo(() => {
    return invoiceDocs.filter((d) => {
      const dDate = toDate(d.createdAt);
      return (
        dDate &&
        dDate.getMonth() === currentMonth &&
        dDate.getFullYear() === currentYear
      );
    });
  }, [invoiceDocs, currentMonth, currentYear]);

  const monthlyQuotes = useMemo(() => {
    return quoteDocs.filter((d) => {
      const dDate = toDate(d.createdAt);
      return (
        dDate &&
        dDate.getMonth() === currentMonth &&
        dDate.getFullYear() === currentYear
      );
    });
  }, [quoteDocs, currentMonth, currentYear]);

  const paidInvoices = useMemo(
    () => invoiceDocs.filter((d) => isInvoicePaid(d)),
    [invoiceDocs]
  );

  const unpaidInvoices = useMemo(
    () => invoiceDocs.filter((d) => !isInvoicePaid(d)),
    [invoiceDocs]
  );

  const monthlyInvoiced = monthlyInvoices.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const monthlyQuoted = monthlyQuotes.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const paidRevenue = paidInvoices.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const outstandingValue = unpaidInvoices.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const outstandingCount = unpaidInvoices.length;

  const monthlyExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const expenseDate = e.date ? new Date(e.date) : toDate(e.createdAt);
      return (
        expenseDate &&
        expenseDate.getMonth() === currentMonth &&
        expenseDate.getFullYear() === currentYear
      );
    });
  }, [expenses, currentMonth, currentYear]);

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + parseFloat(String(e.amount || 0)),
    0
  );

  const expensesThisMonth = monthlyExpenses.reduce(
    (sum, e) => sum + parseFloat(String(e.amount || 0)),
    0
  );

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

  const collectionRate =
    paidRevenue + outstandingValue > 0
      ? (paidRevenue / (paidRevenue + outstandingValue)) * 100
      : 0;

  const averageInvoiceValue =
    invoiceDocs.length > 0
      ? invoiceDocs.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0) /
        invoiceDocs.length
      : 0;

  const expenseRatioThisMonth =
    monthlyInvoiced > 0 ? (expensesThisMonth / monthlyInvoiced) * 100 : 0;

  const profitMarginThisMonth =
    monthlyInvoiced > 0 ? (netProfitThisMonth / monthlyInvoiced) * 100 : 0;

  const nextBillingText =
    formatDate(subscriptionInfo.nextBillingDate) ||
    formatDate(subscriptionInfo.proExpiresAt);

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

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

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
                    {subscriptionInfo.subscriptionStatus &&
                    subscriptionInfo.subscriptionStatus !== 'inactive' ? (
                      <p className="text-xs text-zinc-500 mt-2">
                        Subscription status: {subscriptionInfo.subscriptionStatus}
                        {nextBillingText ? ` • Access until: ${nextBillingText}` : ''}
                      </p>
                    ) : null}
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Invoiced this month</p>
            <p className="text-3xl sm:text-4xl font-bold text-emerald-400 mt-2">
              {formatMoney(monthlyInvoiced, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Quoted this month</p>
            <p className="text-3xl sm:text-4xl font-bold text-blue-400 mt-2">
              {formatMoney(monthlyQuoted, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Expenses this month</p>
            <p className="text-3xl sm:text-4xl font-bold text-orange-400 mt-2">
              {formatMoney(expensesThisMonth, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Net this month</p>
            <p
              className={`text-3xl sm:text-4xl font-bold mt-2 ${
                netProfitThisMonth >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {formatMoney(netProfitThisMonth, currencyCode, currencyLocale)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Paid revenue</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              {formatMoney(paidRevenue, currencyCode, currencyLocale)}
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Outstanding invoice value</p>
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
            <p className="text-zinc-400 text-sm">Average invoice value</p>
            <p className="text-3xl font-bold text-white mt-2">
              {formatMoney(averageInvoiceValue, currencyCode, currencyLocale)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Outstanding invoices</p>
            <p className="text-3xl font-bold text-white mt-2">{outstandingCount}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Expense ratio this month</p>
            <p className="text-3xl font-bold text-orange-400 mt-2">
              {expenseRatioThisMonth.toFixed(1)}%
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Profit margin this month</p>
            <p
              className={`text-3xl font-bold mt-2 ${
                profitMarginThisMonth >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {profitMarginThisMonth.toFixed(1)}%
            </p>
          </div>
        </div>

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

        {!isPro && !loadingUserData && (
          <div className="mb-12 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
              <div>
                <p className="text-emerald-400 font-semibold mb-2">Premium accounting tools</p>
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                  Turn RealQte into a lightweight business control center
                </h3>
                <p className="text-zinc-300 max-w-3xl">
                  Pro unlocks expense entry, category analysis, cleaner monthly profitability tracking,
                  and deeper financial visibility without removing any of your current workflow.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={startSubscriptionCheckout}
                  disabled={isStartingCheckout}
                  className="bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-zinc-100 disabled:opacity-60"
                >
                  {isStartingCheckout ? 'Starting checkout...' : 'Upgrade to Pro'}
                </button>
                <Link
                  href="/reporting"
                  className="border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-6 py-3 rounded-2xl font-semibold text-center"
                >
                  View reports
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
          <div className="bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-800">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-2xl font-semibold text-white">Expense Tracking</h3>
                <p className="text-sm text-zinc-400 mt-2">
                  Add and review operating costs so your monthly net figures stay realistic.
                </p>
              </div>
              {!isPro && (
                <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-400 px-3 py-1 text-xs font-semibold">
                  Pro
                </span>
              )}
            </div>

            {!isPro ? (
              <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6">
                <p className="text-white font-semibold mb-2">Expense tracking is a Pro feature</p>
                <p className="text-zinc-400 mb-5">
                  Upgrade to add expenses, categorize spending, and calculate proper monthly profit.
                </p>
                <button
                  onClick={startSubscriptionCheckout}
                  disabled={isStartingCheckout}
                  className="bg-white text-black py-3 px-6 rounded-2xl font-semibold hover:bg-zinc-100 disabled:opacity-60"
                >
                  {isStartingCheckout ? 'Starting checkout...' : 'Upgrade to unlock'}
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                  <input
                    type="text"
                    placeholder="Description"
                    value={newExpense.description}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, description: e.target.value })
                    }
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
                  />

                  <input
                    type="number"
                    placeholder="Amount"
                    value={newExpense.amount}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, amount: e.target.value })
                    }
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
                  />

                  <input
                    type="date"
                    value={newExpense.date}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, date: e.target.value })
                    }
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                  />

                  <select
                    value={newExpense.category}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, category: e.target.value })
                    }
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                  >
                    <option value="General">General</option>
                    <option value="Fuel">Fuel</option>
                    <option value="Supplies">Supplies</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Transport">Transport</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Software">Software</option>
                    <option value="Rent">Rent</option>
                    <option value="Phone/Internet">Phone/Internet</option>
                  </select>
                </div>

                <div className="text-xs text-zinc-500 mb-4">
                  Expenses will be stored and displayed in your default currency: {currencyCode}
                </div>

                <button
                  onClick={addExpense}
                  disabled={addingExpense}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 py-3 px-8 rounded-2xl font-bold text-white mb-8"
                >
                  {addingExpense ? 'Adding Expense...' : 'Add Expense'}
                </button>

                <div className="flex gap-3 mb-6 flex-wrap">
                  <button
                    onClick={() => setExpenseFilter('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium ${
                      expenseFilter === 'all'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    All Expenses
                  </button>
                  <button
                    onClick={() => setExpenseFilter('month')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium ${
                      expenseFilter === 'month'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    This Month
                  </button>
                </div>

                <div className="space-y-4">
                  {filteredExpenses.length === 0 ? (
                    <p className="text-zinc-500 text-center py-10">No expenses found</p>
                  ) : (
                    filteredExpenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="bg-zinc-800 p-6 rounded-3xl flex justify-between items-center gap-4"
                      >
                        <div>
                          <div className="font-medium text-white">{exp.description}</div>
                          <div className="text-sm text-zinc-300">
                            {(exp.category || 'General')} •{' '}
                            {formatMoney(exp.amount, currencyCode, currencyLocale)} •{' '}
                            {(exp.date ? new Date(exp.date) : toDate(exp.createdAt))?.toLocaleDateString()}
                          </div>
                        </div>

                        <div className="text-orange-400 font-bold text-lg">
                          {formatMoney(exp.amount, currencyCode, currencyLocale)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-8">
            <div className="bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-800">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-2xl font-semibold text-white">Expense Categories</h3>
                  <p className="text-sm text-zinc-400 mt-2">
                    See where business money is actually going.
                  </p>
                </div>
                {!isPro && (
                  <span className="rounded-full bg-amber-500/15 text-amber-400 px-3 py-1 text-xs font-semibold">
                    Pro
                  </span>
                )}
              </div>

              {!isPro ? (
                <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6">
                  <p className="text-zinc-300">
                    Upgrade to Pro to unlock expense category breakdowns and deeper financial visibility.
                  </p>
                </div>
              ) : expenseCategories.length === 0 ? (
                <p className="text-zinc-500">No expense categories yet.</p>
              ) : (
                <div className="space-y-4">
                  {expenseCategories.map((item) => (
                    <div
                      key={item.category}
                      className="bg-zinc-800 rounded-2xl p-5 flex justify-between items-center gap-4"
                    >
                      <span className="text-white font-medium">{item.category}</span>
                      <span className="text-zinc-300">
                        {formatMoney(item.amount, currencyCode, currencyLocale)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-800">
              <h3 className="text-2xl font-semibold text-white mb-6">Top Categories This Month</h3>

              {!isPro ? (
                <p className="text-zinc-500">Available on Pro.</p>
              ) : topExpenseCategoriesThisMonth.length === 0 ? (
                <p className="text-zinc-500">No monthly expense categories yet.</p>
              ) : (
                <div className="space-y-4">
                  {topExpenseCategoriesThisMonth.map((item) => (
                    <div
                      key={item.category}
                      className="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center"
                    >
                      <span className="text-white">{item.category}</span>
                      <span className="text-orange-400 font-semibold">
                        {formatMoney(item.amount, currencyCode, currencyLocale)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-zinc-800">
          <h3 className="text-2xl font-semibold text-white mb-6">Recent Financial Activity</h3>

          {recentFinancialActivity.length === 0 ? (
            <p className="text-zinc-500 text-center py-10">No financial activity yet</p>
          ) : (
            <div className="space-y-4">
              {recentFinancialActivity.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  className="bg-zinc-800 rounded-2xl p-5 flex justify-between items-center gap-4"
                >
                  <div>
                    <div className="font-medium text-white">{item.label}</div>
                    <div className="text-sm text-zinc-300">
                      {item.kind === 'invoice'
                        ? `${item.name} • ${item.paid ? 'Paid Invoice' : 'Unpaid Invoice'}`
                        : `${item.name} • Expense`}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {item.date?.toLocaleDateString()}
                    </div>
                  </div>

                  <div
                    className={`font-bold ${
                      item.kind === 'invoice'
                        ? item.paid
                          ? 'text-emerald-400'
                          : 'text-red-400'
                        : 'text-orange-400'
                    }`}
                  >
                    {item.kind === 'expense' ? '-' : ''}
                    {formatMoney(
                      item.amount,
                      item.currencyCode || currencyCode,
                      item.currencyLocale || currencyLocale
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}