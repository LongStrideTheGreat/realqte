'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
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
  taxRate?: number; // Added for VAT / Tax summary features
  createdAt?: any;
};

type DateFilterType = 'month' | '30days' | 'ytd' | 'all';

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

  // Real-time collections data arrays
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [expenses, setExpenses] = useState<ExpenseType[]>([]);
  
  // New Live Synchronized State Containers
  const [liveCollectionsLog, setLiveCollectionsLog] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Custom Analytics States
  const [dateRangeFilter, setDateRangeFilter] = useState<DateFilterType>('month');
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'filtered'>('filtered');
  const [addingExpense, setAddingExpense] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingUserData, setLoadingUserData] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'General',
    taxRate: '15', // Default standard VAT rate configuration (e.g. South Africa ZAR)
  });

  const { currencyCode, currencyLocale } = useMemo(
    () => getCurrencyConfig(profile),
    [profile]
  );

  // Unified Real-time Auth, Profile, and Subscription Synchronization Stream
  useEffect(() => {
    let unsubscribeUserSnap: (() => void) | null = null;
    let unsubscribeDocsSnap: (() => void) | null = null;
    let unsubscribeExpensesSnap: (() => void) | null = null;
    let unsubscribeCollectionsSnap: (() => void) | null = null;

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
        setLiveCollectionsLog([]);
        setLoadingUserData(false);
        router.push('/');
        return;
      }

      setUser(u);
      setMobileMenuOpen(false);
      setLoadingUserData(true);

      // 1. Snapshot Listener for User Profile / Subscription Info
      if (unsubscribeUserSnap) unsubscribeUserSnap();
      unsubscribeUserSnap = onSnapshot(
        doc(db, 'users', u.uid),
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
            setProfile({ currencyCode: 'ZAR', currencyLocale: 'en-ZA' });
            setIsPro(false);
          }
          setLoadingUserData(false);
        },
        (error) => {
          console.error('Accounting user snapshot error:', error);
          setLoadingUserData(false);
        }
      );

      // 2. Real-Time Document Stream Listener
      if (unsubscribeDocsSnap) unsubscribeDocsSnap();
      const docsQuery = query(
        collection(db, 'documents'),
        where('userId', '==', u.uid),
        orderBy('createdAt', 'desc')
      );
      unsubscribeDocsSnap = onSnapshot(docsQuery, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[];
        setDocuments(items);
      }, (err) => console.error('Real-time documents fetch execution failure:', err));

      // 3. Real-Time Operating Expenses Stream Listener
      if (unsubscribeExpensesSnap) unsubscribeExpensesSnap();
      const expensesQuery = query(
        collection(db, 'expenses'),
        where('userId', '==', u.uid),
        orderBy('createdAt', 'desc')
      );
      unsubscribeExpensesSnap = onSnapshot(expensesQuery, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseType[];
        setExpenses(items);
      }, (err) => console.error('Real-time expenses fetch execution failure:', err));

      // 4. New Live Listener: Real-Time Collections & Payments Tracking Registry
      if (unsubscribeCollectionsSnap) unsubscribeCollectionsSnap();
      const collectionsQuery = query(
        collection(db, 'collections_log'),
        where('userId', '==', u.uid),
        orderBy('timestamp', 'desc')
      );
      unsubscribeCollectionsSnap = onSnapshot(collectionsQuery, (snap) => {
        const logItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLiveCollectionsLog(logItems);
      }, (err) => console.error('Real-time live collections pipeline down:', err));

    });

    return () => {
      if (unsubscribeUserSnap) unsubscribeUserSnap();
      if (unsubscribeDocsSnap) unsubscribeDocsSnap();
      if (unsubscribeExpensesSnap) unsubscribeExpensesSnap();
      if (unsubscribeCollectionsSnap) unsubscribeCollectionsSnap();
      unsubscribeAuth();
    };
  }, [router]);

  // Evaluated Structural Timeframe Filter Configuration Helper Logic
  const filteredData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const isWithinRange = (dateItem: Date | null) => {
      if (!dateItem) return false;
      switch (dateRangeFilter) {
        case 'month':
          return dateItem.getMonth() === currentMonth && dateItem.getFullYear() === currentYear;
        case '30days':
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(now.getDate() - 30);
          return dateItem >= thirtyDaysAgo && dateItem <= now;
        case 'ytd':
          return dateItem.getFullYear() === currentYear && dateItem <= now;
        case 'all':
        default:
          return true;
      }
    };

    // Document Separation Filters
    const invoices = documents.filter((d) => d.type === 'invoice' && isWithinRange(toDate(d.createdAt)));
    const quotes = documents.filter((d) => d.type === 'quote' && isWithinRange(toDate(d.createdAt)));
    const periodExpenses = expenses.filter((e) => {
      const expDate = e.date ? new Date(e.date) : toDate(e.createdAt);
      return isWithinRange(expDate);
    });

    return {
      invoices,
      quotes,
      periodExpenses,
    };
  }, [documents, expenses, dateRangeFilter]);

  // Aggregated Dynamic Calculations
  const invoiceDocs = useMemo(() => documents.filter((d) => d.type === 'invoice'), [documents]);

  const financialMetrics = useMemo(() => {
    const totalInvoiced = filteredData.invoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0);
    const totalQuoted = filteredData.quotes.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0);
    const totalExpensesSum = filteredData.periodExpenses.reduce((sum, e) => sum + parseFloat(String(e.amount || 0)), 0);
    
    const paidInvoicesList = filteredData.invoices.filter((d) => isInvoicePaid(d));
    const unpaidInvoicesList = filteredData.invoices.filter((d) => !isInvoicePaid(d));

    const totalPaidRevenue = paidInvoicesList.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0);
    const totalOutstandingValue = unpaidInvoicesList.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0);
    
    const netProfit = totalInvoiced - totalExpensesSum;
    const collectionRate = (totalPaidRevenue + totalOutstandingValue) > 0 
      ? (totalPaidRevenue / (totalPaidRevenue + totalOutstandingValue)) * 100 
      : 0;
    
    const averageInvoiceValue = filteredData.invoices.length > 0 ? totalInvoiced / filteredData.invoices.length : 0;
    const expenseRatio = totalInvoiced > 0 ? (totalExpensesSum / totalInvoiced) * 100 : 0;
    const profitMargin = totalInvoiced > 0 ? (netProfit / totalInvoiced) * 100 : 0;

    return {
      totalInvoiced,
      totalQuoted,
      totalExpensesSum,
      totalPaidRevenue,
      totalOutstandingValue,
      outstandingCount: unpaidInvoicesList.length,
      netProfit,
      collectionRate,
      averageInvoiceValue,
      expenseRatio,
      profitMargin,
    };
  }, [filteredData]);

  // Advanced feature additions: Invoice Aging Breakdown Structure (All Time Contextualization)
  const agingReport = useMemo(() => {
    const now = new Date();
    let current = 0; // 0-30 days
    let mid = 0;     // 31-60 days
    let senior = 0;  // 61+ days

    invoiceDocs.forEach((inv) => {
      if (isInvoicePaid(inv)) return;
      const created = toDate(inv.createdAt);
      if (!created) return;

      const diffTime = Math.abs(now.getTime() - created.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const value = parseFloat(String(inv.total || '0'));
      if (diffDays <= 30) current += value;
      else if (diffDays <= 60) mid += value;
      else senior += value;
    });

    return { current, mid, senior };
  }, [invoiceDocs]);

  // Advanced feature additions: TAX / VAT Summarized Insights
  const taxSummary = useMemo(() => {
    let outputTax = 0; 
    let inputTax = 0;

    filteredData.invoices.forEach((inv) => {
      const value = parseFloat(String(inv.total || '0'));
      outputTax += (value - (value / 1.15));
    });

    filteredData.periodExpenses.forEach((exp) => {
      const value = parseFloat(String(exp.amount || '0'));
      const rate = (exp.taxRate || 15) / 100;
      inputTax += (value - (value / (1 + rate)));
    });

    return {
      outputTax,
      inputTax,
      netTaxLiability: outputTax - inputTax,
    };
  }, [filteredData]);

  // Advanced feature additions: Operational Cash Flow Tracking Insight metrics
  const cashFlowTracking = useMemo(() => {
    const cashInflow = documents.filter(d => d.type === 'invoice' && isInvoicePaid(d))
      .reduce((sum, d) => sum + parseFloat(String(d.total || 0)), 0);
    const cashOutflow = expenses.reduce((sum, e) => sum + parseFloat(String(e.amount || 0)), 0);
    
    return {
      cashInflow,
      cashOutflow,
      netCashFlow: cashInflow - cashOutflow,
    };
  }, [documents, expenses]);

  // Dynamic Expenses Aggregated Categories Structure Generator logic
  const expenseCategories = useMemo(() => {
    const map = new Map<string, number>();
    const targetSource = expenseFilter === 'all' ? expenses : filteredData.periodExpenses;

    targetSource.forEach((expense) => {
      const category = expense.category || 'General';
      const amount = parseFloat(String(expense.amount || 0));
      map.set(category, (map.get(category) || 0) + amount);
    });

    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, filteredData.periodExpenses, expenseFilter]);

  // Historical Component Financial Activity Log Mix parsing
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

  const nextBillingText = formatDate(subscriptionInfo.nextBillingDate) || formatDate(subscriptionInfo.proExpiresAt);

  // Structural Actions: Operational Writing Mutation Operations Execution
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
        taxRate: parseFloat(newExpense.taxRate || '0'),
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, 'expenses'), payload);
      
      setNewExpense({
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'General',
        taxRate: '15',
      });
      alert('Expense recorded in real-time pipeline successfully!');
    } catch (err: any) {
      console.error('Add expense error:', err);
      alert('Failed to add expense: ' + (err.message || 'Unknown error'));
    } finally {
      setAddingExpense(false);
    }
  };

  // Responsive Export Engine Implementation Logic
  const handleExportEngineTrigger = () => {
    if (!isPro) {
      alert('The responsive data exporting utility matrix is a premium Pro tier configuration pipeline feature.');
      return;
    }
    try {
      setIsExporting(true);
      
      const csvRows = [
        ['Type', 'Identifier / Category', 'Party Entity Label', 'Amount Value', 'Dated Period Reference', 'Payment Status'],
      ];

      filteredData.invoices.forEach(inv => {
        csvRows.push([
          'Invoice',
          inv.number || 'Unnumbered',
          inv.client || 'Anonymous Entity',
          String(inv.total || 0),
          toDate(inv.createdAt)?.toLocaleDateString() || '',
          isInvoicePaid(inv) ? 'PAID' : 'DUE / DELINQUENT'
        ]);
      });

      filteredData.periodExpenses.forEach(exp => {
        csvRows.push([
          'Expense',
          exp.category || 'General Operations',
          exp.description || 'Generic Liability Log entry',
          String(exp.amount || 0),
          exp.date || '',
          'SETTLED CASH'
        ]);
      });

      const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const encodingUri = encodeURI(csvContent);
      
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', encodingUri);
      downloadAnchor.setAttribute('download', `RealQte_Control_Center_Financials_Frame_${dateRangeFilter}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);

    } catch (err: any) {
      console.error('Responsive internal matrix reporting exporter failed:', err);
      alert('Execution failure across export pipelines: ' + err.message);
    } finally {
      setIsExporting(false);
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden antialiased selection:bg-emerald-500 selection:text-black">
      <AppHeader user={user} setupComplete={true} onLogout={handleLogout} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        
        {/* Header Section */}
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-900 pb-8">
          <div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-3">
              Accounting Control Center
            </h1>
            <p className="text-zinc-400 text-base max-w-2xl">
              Enterprise-grade financial intelligence dashboard. Monitor real-time dynamic net revenue streams, operational liabilities, tax positions, and critical aging diagnostics.
            </p>
          </div>

          <div className="w-full lg:w-auto shrink-0">
            {loadingUserData ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-sm text-zinc-400 animate-pulse">
                Establishing authenticated real-time telemetry pipelines...
              </div>
            ) : isPro ? (
              <div className="bg-gradient-to-br from-emerald-500/10 to-zinc-900 border border-emerald-500/20 rounded-2xl p-5 shadow-xl shadow-emerald-950/20">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400 tracking-wider uppercase">
                    Pro Active Real-Time Stream
                  </span>
                  <span className="text-xs text-zinc-400">
                    Status: {subscriptionInfo.subscriptionStatus || 'active'}
                    {nextBillingText ? ` • Next renewal: ${nextBillingText}` : ''}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Full programmatic integration unlocked: real-time updates enabled.
                </p>
                <p className="text-xs text-zinc-500 mt-2 font-mono">
                  Default Ledger Currency: {currencyCode} ({currencyLocale})
                </p>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                  <div>
                    <p className="text-base font-bold text-white">Upgrade to Premium Pro Accounting Pipeline</p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-md">
                      Unlock advanced expense ledgers, complete cash flow modules, live dynamic category metrics, and automatic localized tax configuration tracking for R35/month.
                    </p>
                  </div>
                  <button
                    onClick={startSubscriptionCheckout}
                    disabled={isStartingCheckout || loadingUserData}
                    className="bg-white text-black hover:bg-zinc-200 transition-colors px-6 py-3 rounded-xl font-bold whitespace-nowrap shadow-md disabled:opacity-50 text-sm"
                  >
                    {isStartingCheckout ? 'Connecting Gateway...' : 'Upgrade to Pro'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Global Control & Quick Actions Engine Interface Row */}
        <div className="mb-8 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-zinc-900/60 p-4 border border-zinc-800/80 rounded-2xl">
          {/* Advanced Dynamic Timeline Filtering Mechanism */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider px-2">Reporting Frame:</span>
            {(['month', '30days', 'ytd', 'all'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDateRangeFilter(mode)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  dateRangeFilter === mode
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                {mode === 'month' && 'This Month'}
                {mode === '30days' && 'Last 30 Days'}
                {mode === 'ytd' && 'Year to Date (YTD)'}
                {mode === 'all' && 'All Historical Data'}
              </button>
            ))}
          </div>

          {/* Core Responsive Export Control Panel Anchor */}
          <div className="flex gap-2 w-full md:w-auto items-center">
            <button
              onClick={handleExportEngineTrigger}
              disabled={isExporting}
              className="w-full md:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-blue-500/20 shadow-md shadow-indigo-950/40"
            >
              {isExporting ? (
                <span>Generating Framework Matrix...</span>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <span>Export CSV Ledger Ledger</span>
                </>
              )}
            </button>

            <div className="hidden sm:flex gap-2">
              <Link
                href="/invoices"
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                + Create Invoice
              </Link>
              <Link
                href="/quotes"
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                + Generate Quote
              </Link>
            </div>
          </div>
        </div>

        {/* Core Financial Snapshot Summary Block Grid Component */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-md transition-transform hover:scale-[1.01]">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Gross Invoiced Volume</p>
            <p className="text-3xl font-black text-emerald-400 mt-2 tracking-tight">
              {formatMoney(financialMetrics.totalInvoiced, currencyCode, currencyLocale)}
            </p>
            <div className="text-zinc-500 text-[11px] mt-1">Based on global active period metrics</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-md transition-transform hover:scale-[1.01]">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Active Quoted Committed Pipeline</p>
            <p className="text-3xl font-black text-blue-400 mt-2 tracking-tight">
              {formatMoney(financialMetrics.totalQuoted, currencyCode, currencyLocale)}
            </p>
            <div className="text-zinc-500 text-[11px] mt-1">Estimated contract proposals</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-md transition-transform hover:scale-[1.01]">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Period Operating Losses/Expenses</p>
            <p className="text-3xl font-black text-orange-400 mt-2 tracking-tight">
              {formatMoney(financialMetrics.totalExpensesSum, currencyCode, currencyLocale)}
            </p>
            <div className="text-zinc-500 text-[11px] mt-1">Real-time outlays calculated</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-md transition-transform hover:scale-[1.01]">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Calculated Period Net Cash Flow Position</p>
            <p className={`text-3xl font-black mt-2 tracking-tight ${financialMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatMoney(financialMetrics.netProfit, currencyCode, currencyLocale)}
            </p>
            <div className="text-zinc-500 text-[11px] mt-1">Invoiced revenue offset by liabilities</div>
          </div>
        </div>

        {/* Dynamic Profit and Loss (P&L) Statements Extended Summary Widget Module Section */}
        <div className="mb-6 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">Profit & Loss (P&L) Financial Performance Ledger Summary</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Accrual accounting statement modeling matching Sage financial tracking configurations.</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-500 font-mono">Ledger State: Real-Time Sync</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Total Revenue (Gross Receipts):</span>
                <span className="font-semibold text-white">{formatMoney(financialMetrics.totalInvoiced, currencyCode, currencyLocale)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Total Cost of Operations (COGS):</span>
                <span className="font-semibold text-orange-400">({formatMoney(financialMetrics.totalExpensesSum, currencyCode, currencyLocale)})</span>
              </div>
              <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold text-base">
                <span>Operating Profit / Net Income:</span>
                <span className={financialMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {formatMoney(financialMetrics.netProfit, currencyCode, currencyLocale)}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-sm border-t md:border-t-0 md:border-x border-zinc-800 md:px-6">
              <div className="flex justify-between text-zinc-400">
                <span>Calculated Operating Margin:</span>
                <span className={`font-bold ${financialMetrics.profitMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {financialMetrics.profitMargin.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Operational Expense Ratio:</span>
                <span className="font-bold text-orange-400">{financialMetrics.expenseRatio.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Capital Liquidity Index:</span>
                <span className="font-semibold text-zinc-200">Excellent</span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Operational Profit Margin Health Gauge</p>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${financialMetrics.profitMargin >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} 
                  style={{ width: `${Math.min(Math.max(financialMetrics.profitMargin, 0), 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                Visualizing total captured revenue remaining after addressing basic fixed and variable expenses operations.
              </p>
            </div>
          </div>
        </div>

        {/* Secondary Row Elements: Extended Cash Flow, Tax VAT and Aging Report Summary Framework grids */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Segment Component One: Localized Statement of Cash Flow Liquidity Module */}
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-wide mb-3">Liquidity & Cash Flow Tracker</h4>
              <p className="text-xs text-zinc-400 mb-4">Tracking actual cash receipts movement against variable expenditure outlays (Cash Basis View).</p>
              
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">Cash Inflows (Collected):</span>
                  <span className="text-emerald-400 font-bold">+{formatMoney(cashFlowTracking.cashInflow, currencyCode, currencyLocale)}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">Cash Outflows (Paid):</span>
                  <span className="text-orange-400 font-bold">-{formatMoney(cashFlowTracking.cashOutflow, currencyCode, currencyLocale)}</span>
                </div>
                <div className="flex justify-between pt-1 font-bold text-sm">
                  <span className="text-zinc-300 font-sans">Net Cash Velocity:</span>
                  <span className={cashFlowTracking.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatMoney(cashFlowTracking.netCashFlow, currencyCode, currencyLocale)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/60 text-center text-[11px] text-zinc-500">
              Live updates via automated real-time Firestore synchronization.
            </div>
          </div>

          {/* Segment Component Two: Tax & Localized VAT Liabilities Breakdown Analysis */}
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-wide mb-3">Tax & VAT Liability Matrix Summary</h4>
              <p className="text-xs text-zinc-400 mb-4">Estimated internal provisional values configured on ledger tax entries.</p>
              
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">VAT Output (Collected on Sales):</span>
                  <span className="text-white font-medium">{formatMoney(taxSummary.outputTax, currencyCode, currencyLocale)}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">VAT Input (Reclaimable on Costs):</span>
                  <span className="text-zinc-400 font-medium">{formatMoney(taxSummary.inputTax, currencyCode, currencyLocale)}</span>
                </div>
                <div className="flex justify-between pt-1 font-bold text-sm">
                  <span className="text-zinc-300 font-sans">Net Provisional Tax Liability:</span>
                  <span className={taxSummary.netTaxLiability >= 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {formatMoney(taxSummary.netTaxLiability, currencyCode, currencyLocale)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/60 text-center text-[11px] text-zinc-400">
              {taxSummary.netTaxLiability >= 0 
                ? '⚠️ Standard provisional reserve required' 
                : '✓ Net dynamic credit position calculated'}
            </div>
          </div>

          {/* Segment Component Three: Accounts Receivable Invoice Aging Matrix Diagnostician */}
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-wide mb-3">Accounts Receivable Invoice Aging Report</h4>
              <p className="text-xs text-zinc-400 mb-4">Analysis monitoring outstanding unpaid assets mapped across historical generation spans.</p>
              
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-zinc-950 p-2 border border-zinc-800 rounded-xl">
                  <span className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider">0 - 30 Days</span>
                  <span className="block mt-1 font-mono font-bold text-zinc-200">
                    {formatMoney(agingReport.current, currencyCode, currencyLocale)}
                  </span>
                </div>
                <div className="bg-zinc-950 p-2 border border-zinc-800 rounded-xl">
                  <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider">31 - 60 Days</span>
                  <span className="block mt-1 font-mono font-bold text-amber-500">
                    {formatMoney(agingReport.mid, currencyCode, currencyLocale)}
                  </span>
                </div>
                <div className="bg-zinc-950 p-2 border border-zinc-800 rounded-xl">
                  <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider">61+ Days</span>
                  <span className="block mt-1 font-mono font-bold text-red-500">
                    {formatMoney(agingReport.senior, currencyCode, currencyLocale)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/60 flex justify-between items-center text-xs">
              <span className="text-zinc-400">Collection Rate Status Index:</span>
              <span className="text-blue-400 font-black font-mono">{financialMetrics.collectionRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Primary Action Row Navigation Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <Link 
            href="/outstanding-invoices" 
            className="flex items-center justify-center gap-3 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 py-4 rounded-xl text-md font-bold text-center transition-all shadow-sm"
          >
            <span>Review Delinquent / Outstanding Invoices</span>
            <span className="bg-red-500/20 text-red-400 px-2.5 py-0.5 text-xs rounded-full font-black font-mono">
              {financialMetrics.outstandingCount}
            </span>
          </Link>
          <Link 
            href="/invoices" 
            className="flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl text-md font-bold text-center transition-all shadow-md shadow-blue-950"
          >
            View All Saved Invoice Records
          </Link>
        </div>

        {/* Real-time Dynamic Operations Entry Form / Real Activity Mix Dashboard Rows Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Left Column Section: Multi-layer Ledger Writing Forms Entry Subsystem */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-md">
              <h3 className="text-base font-bold text-white mb-1">Add Operational Cost Outlay / Expense</h3>
              <p className="text-xs text-zinc-400 mb-4">Commit a verified liability entry straight into the pipeline tracking stream.</p>
              
              {!isPro ? (
                <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl text-center">
                  <p className="text-xs text-zinc-400">Expense logging is reserved exclusively for Premium Pro engines.</p>
                  <button 
                    onClick={startSubscriptionCheckout}
                    className="mt-3 text-xs text-emerald-400 font-bold underline hover:text-emerald-300"
                  >
                    Upgrade Now
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Description</label>
                    <input 
                      type="text" 
                      placeholder="e.g., Cloud Hosting, Server Upgrades"
                      value={newExpense.description}
                      onChange={e => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-zinc-700 font-medium"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Amount Value</label>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        value={newExpense.amount}
                        onChange={e => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-zinc-700 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Tax / VAT Rate</label>
                      <select 
                        value={newExpense.taxRate}
                        onChange={e => setNewExpense(prev => ({ ...prev, taxRate: e.target.value }))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-zinc-700 font-medium text-zinc-300"
                      >
                        <option value="15">15% Standard VAT</option>
                        <option value="9">9% Reduced Rate</option>
                        <option value="0">0% Zero Exempt</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Dated Frame</label>
                    <input 
                      type="date" 
                      value={newExpense.date}
                      onChange={e => setNewExpense(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-zinc-700 font-medium text-zinc-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Classification Category</label>
                    <select 
                      value={newExpense.category}
                      onChange={e => setNewExpense(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-zinc-700 font-medium text-zinc-300"
                    >
                      <option value="General">General Operational Costs</option>
                      <option value="Marketing">Marketing & Advertising</option>
                      <option value="Infrastructure">Infrastructure & Cloud Hosting</option>
                      <option value="Salaries">Contractor / Freelancer Outlays</option>
                      <option value="Legal">Compliance & Corporate Affairs</option>
                    </select>
                  </div>
                  <button
                    onClick={addExpense}
                    disabled={addingExpense}
                    className="w-full bg-white text-black font-bold text-xs py-2.5 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-40 mt-2"
                  >
                    {addingExpense ? 'Processing Transmission Pipeline...' : 'Commit Operational Outlay Entry'}
                  </button>
                </div>
              )}
            </div>

            {/* Categorized Expense Matrix Block Summary Widget */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-md">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-4">
                <h4 className="text-sm font-bold text-white tracking-wide">Category Allocation Breakdown</h4>
                <select
                  value={expenseFilter}
                  onChange={e => setExpenseFilter(e.target.value as any)}
                  className="bg-zinc-950 text-[10px] text-zinc-400 font-bold uppercase tracking-wider border border-zinc-800 rounded-lg px-2 py-1 focus:outline-none"
                >
                  <option value="filtered">Selected Frame</option>
                  <option value="all">All-Time Metrics</option>
                </select>
              </div>

              {expenseCategories.length === 0 ? (
                <p className="text-zinc-500 text-xs py-2 text-center italic">No liabilities mapped across current filters.</p>
              ) : (
                <div className="space-y-3">
                  {expenseCategories.slice(0, 5).map(({ category, amount }) => (
                    <div key={category} className="text-xs">
                      <div className="flex justify-between font-medium mb-1">
                        <span className="text-zinc-300">{category}</span>
                        <span className="text-zinc-400 font-mono font-bold">{formatMoney(amount, currencyCode, currencyLocale)}</span>
                      </div>
                      <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden border border-zinc-900">
                        <div 
                          className="bg-orange-500 h-full rounded-full"
                          style={{ width: `${Math.min((amount / Math.max(financialMetrics.totalExpensesSum, 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column Section: Complete Real-Time Multi-Activity Ledger Streams View */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-md">
            <h3 className="text-base font-bold text-white tracking-wide">Real-Time Financial Activity Control Ledger Stream</h3>
            <p className="text-xs text-zinc-400 mt-0.5 mb-5">Unified operational view combining the latest generated client asset invoices with settled variable expense logs.</p>

            {recentFinancialActivity.length === 0 ? (
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-xs italic">
                Telemetry streams empty. Begin generating active system invoices or log liabilities to establish financial reporting tracks.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80 border border-zinc-800/60 bg-zinc-950 rounded-xl overflow-hidden shadow-inner">
                {recentFinancialActivity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-zinc-900/40 transition-colors text-xs gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl border shrink-0 hidden sm:block ${
                        item.kind === 'invoice' 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                          : 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                      }`}>
                        {item.kind === 'invoice' ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5M5.25 4.5V2.25m13.5 2.25V2.25m-16.5 15c0-1.262.83-2.32 2-2.651M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white tracking-tight truncate max-w-[120px] sm:max-w-none">{item.label}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                            item.kind === 'invoice' 
                              ? item.paid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                              : 'bg-orange-500/20 text-orange-400'
                          }`}>
                            {item.kind === 'invoice' ? (item.paid ? 'PAID' : 'DUE') : 'EXPENSE'}
                          </span>
                        </div>
                        <span className="text-zinc-400 block truncate mt-0.5 max-w-[180px] sm:max-w-none font-medium">{item.name}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`font-mono font-bold text-sm sm:text-base ${
                        item.kind === 'invoice' 
                          ? item.paid ? 'text-emerald-400' : 'text-red-400' 
                          : 'text-orange-400'
                      }`}>
                        {item.kind === 'expense' ? '-' : '+'}
                        {formatMoney(
                          item.amount,
                          item.currencyCode || currencyCode,
                          item.currencyLocale || currencyLocale
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                        {item.date ? item.date.toLocaleDateString() : 'Pending Framework Timeline'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Conditional Premium Features Conversion Dynamic Banners */}
        {!isPro && !loadingUserData && (
          <div className="mt-10 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
              <div>
                <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">Premium Accounting Engine Infrastructure Features</p>
                <h3 className="text-xl sm:text-2xl font-black text-white mb-2">
                  Evolve RealQte into an Intelligent Automations Business Engine Control Center
                </h3>
                <p className="text-zinc-400 text-xs max-w-3xl">
                  Pro access permits multi-layered operational cost accounting ledgers, localized taxation automation filters, multi-tier operational classification structures, and direct cash conversion reports.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <button
                  onClick={startSubscriptionCheckout}
                  disabled={isStartingCheckout}
                  className="bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all text-xs shadow-md"
                >
                  {isStartingCheckout ? 'Connecting Gateway...' : 'Upgrade to Pro Account'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Global Regulatory Footer Component Node Block */}
      <footer className="mt-20 border-t border-zinc-900 bg-zinc-950/40 pt-8 pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-medium">
          <p>© {new Date().getFullYear()} RealQte International Business Engines. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/help" className="hover:text-white transition-colors">Help Matrix</Link>
            <Link href="/legal" className="hover:text-white transition-colors">Regulatory Framework</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Data Privacy Protocols</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}