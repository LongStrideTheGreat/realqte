'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import jsPDF from 'jspdf';
import AppHeader from '@/components/AppHeader';

type DocumentType = {
  id: string;
  userId?: string;
  type?: string;
  number?: string;
  client?: string;
  clientEmail?: string;
  customerId?: string | null;
  total?: string | number;
  createdAt?: any;
  status?: string;
  paymentStatus?: string;
  paid?: boolean;
  convertedToInvoice?: boolean;
  convertedInvoiceId?: string | null;
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  createdFromQuote?: boolean;
  expiryDate?: any;
  currencyCode?: string;
  currencyLocale?: string;
};

type ExpenseType = {
  id: string;
  userId?: string;
  amount: number;
  category: string;
  description?: string;
  date?: string;
  taxRate?: number;
  createdAt: any;
};

type CustomerType = {
  id: string;
  name?: string;
  email?: string;
};

type ProfileType = {
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
  const blockedStatuses = ['cancelled', 'canceled', 'inactive', 'paused'];

  return (
    Boolean(data?.isPro) &&
    !!expiresAt &&
    expiresAt.getTime() > Date.now() &&
    !blockedStatuses.includes(status)
  );
}

function isInvoicePaid(documentItem: DocumentType) {
  return (
    documentItem.paid === true ||
    String(documentItem.paymentStatus || '').toLowerCase() === 'paid' ||
    String(documentItem.status || '').toLowerCase() === 'paid'
  );
}

function getQuoteStatus(documentItem: DocumentType) {
  if (documentItem.convertedToInvoice || documentItem.status === 'converted') {
    return 'converted';
  }

  const expiry = toDate(documentItem.expiryDate);
  if (expiry && expiry.getTime() < Date.now()) {
    return 'expired';
  }

  return 'active';
}

function getCurrencyConfig(profile: ProfileType) {
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

function MetricCard({
  title,
  value,
  color = 'text-white',
  subtitle,
}: {
  title: string;
  value: string | number;
  color?: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 transition hover:border-zinc-700">
      <p className="text-xs uppercase tracking-wide text-zinc-400 font-medium">{title}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-2 tracking-tight ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function Reporting() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [expenses, setExpenses] = useState<ExpenseType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { currencyCode, currencyLocale } = useMemo(
    () => getCurrencyConfig(profile),
    [profile]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      try {
        setUser(u);
        setMobileMenuOpen(false);

        const userSnap = await getDoc(doc(db, 'users', u.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          const incomingProfile = data.profile || {};
          setIsPro(isSubscriptionActive(data));
          setProfile({
            currencyCode: incomingProfile.currencyCode || 'ZAR',
            currencyLocale: incomingProfile.currencyLocale || 'en-ZA',
          });
        } else {
          setIsPro(false);
          setProfile({
            currencyCode: 'ZAR',
            currencyLocale: 'en-ZA',
          });
        }

        // Parallelized network reads optimized across independent data horizons
        const [docsSnap, custSnap, expSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'documents'),
              where('userId', '==', u.uid),
              orderBy('createdAt', 'desc')
            )
          ),
          getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid))),
          getDocs(query(collection(db, 'expenses'), where('userId', '==', u.uid)))
        ]);

        setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]);
        setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[]);
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseType[]);
      } catch (err) {
        console.error('Reporting pipeline load failure:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  // ==========================================
  // MEMOIZED ARCHITECTURAL REVENUE COEFFICIENTS
  // ==========================================
  const invoices = useMemo(() => documents.filter((d) => d.type === 'invoice'), [documents]);
  const quotes = useMemo(() => documents.filter((d) => d.type === 'quote'), [documents]);

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => isInvoicePaid(invoice)),
    [invoices]
  );

  const unpaidInvoices = useMemo(
    () => invoices.filter((invoice) => !isInvoicePaid(invoice)),
    [invoices]
  );

  const lifetimeInvoiced = useMemo(
    () => invoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0),
    [invoices]
  );

  const lifetimeQuoted = useMemo(
    () => quotes.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0),
    [quotes]
  );

  const paidRevenue = useMemo(
    () => paidInvoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0),
    [paidInvoices]
  );

  const unpaidRevenue = useMemo(
    () => unpaidInvoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0),
    [unpaidInvoices]
  );

  // Unified Accounting Ledger Connections
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [expenses]
  );

  const netProfit = useMemo(
    () => paidRevenue - totalExpenses,
    [paidRevenue, totalExpenses]
  );

  // Conversion Metrics Engine
  const conversionMetrics = useMemo(() => {
    const totalQuotes = quotes.length;
    const convertedInvoices = invoices.filter(
      (d) => d.createdFromQuote || d.sourceDocumentType === 'quote'
    ).length;
    const rate = totalQuotes > 0 ? ((convertedInvoices / totalQuotes) * 100).toFixed(1) : '0.0';

    let active = 0;
    let expired = 0;
    let converted = 0;

    quotes.forEach((q) => {
      const status = getQuoteStatus(q);
      if (status === 'converted') converted++;
      else if (status === 'expired') expired++;
      else active++;
    });

    return { rate, active, expired, converted, totalQuotes };
  }, [quotes, invoices]);

  const averageInvoiceValue = useMemo(
    () => (invoices.length > 0 ? lifetimeInvoiced / invoices.length : 0),
    [invoices, lifetimeInvoiced]
  );

  const averageQuoteValue = useMemo(
    () => (quotes.length > 0 ? lifetimeQuoted / quotes.length : 0),
    [quotes, lifetimeQuoted]
  );

  // Memoized Monthly Variance Processing Loop
  const currentMonthMetrics = useMemo(() => {
    const nowRef = new Date();
    const currentMonth = nowRef.getMonth();
    const currentYear = nowRef.getFullYear();

    let mInvoiced = 0;
    let mQuoted = 0;
    let mPaid = 0;

    invoices.forEach((docItem) => {
      const docDate = toDate(docItem.createdAt);
      if (docDate && docDate.getMonth() === currentMonth && docDate.getFullYear() === currentYear) {
        mInvoiced += parseFloat(String(docItem.total || '0'));
        if (isInvoicePaid(docItem)) {
          mPaid += parseFloat(String(docItem.total || '0'));
        }
      }
    });

    quotes.forEach((docItem) => {
      const docDate = toDate(docItem.createdAt);
      if (docDate && docDate.getMonth() === currentMonth && docDate.getFullYear() === currentYear) {
        mQuoted += parseFloat(String(docItem.total || '0'));
      }
    });

    return { mInvoiced, mQuoted, mPaid };
  }, [invoices, quotes]);

  // Account Analytics Mapping
  const customerTotals = useMemo(() => {
    const map = new Map<
      string,
      { name: string; total: number; paidTotal: number; invoiceCount: number }
    >();

    invoices.forEach((invoice) => {
      const name = invoice.client || 'Unknown Customer';
      const key = (invoice.customerId || name).toLowerCase();
      const amount = parseFloat(String(invoice.total || '0'));
      const paidAmount = isInvoicePaid(invoice) ? amount : 0;

      if (!map.has(key)) {
        map.set(key, {
          name,
          total: 0,
          paidTotal: 0,
          invoiceCount: 0,
        });
      }

      const existing = map.get(key)!;
      existing.total += amount;
      existing.paidTotal += paidAmount;
      existing.invoiceCount += 1;
    });

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [invoices]);

  // ==========================================
  // DOCUMENT REPORT EXPORT COMPILER
  // ==========================================
  const exportPdfReport = async () => {
    try {
      setExportingPdf(true);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();

      let y = 18;

      pdf.setFontSize(20);
      pdf.text('RealQte Premium Executive Report', 14, y);
      y += 8;

      pdf.setFontSize(10);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`Run Timestamp: ${new Date().toLocaleString()}`, 14, y);
      y += 5;
      pdf.text(`Currency Parameter: ${currencyCode} (${currencyLocale})`, 14, y);
      y += 10;

      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(13);
      pdf.text('Integrated Net Liquidity Summary', 14, y);
      y += 7;

      pdf.setFontSize(10);
      const revenueLines = [
        `Collected Revenue (Paid Invoices): ${formatMoney(paidRevenue, currencyCode, currencyLocale)}`,
        `Operating Expenses Overhead: ${formatMoney(totalExpenses, currencyCode, currencyLocale)}`,
        `True Net Return (Operating Margin): ${formatMoney(netProfit, currencyCode, currencyLocale)}`,
        `Outstanding Balance Arrears Pool: ${formatMoney(unpaidRevenue, currencyCode, currencyLocale)}`,
        `Lifetime Invoiced Volume: ${formatMoney(lifetimeInvoiced, currencyCode, currencyLocale)}`,
        `Pipeline Pipeline Conversion Rate: ${conversionMetrics.rate}%`,
      ];

      revenueLines.forEach((line) => {
        pdf.text(line, 14, y);
        y += 6;
      });

      y += 4;
      pdf.setFontSize(13);
      pdf.text('Current Accounting Period Horizon', 14, y);
      y += 7;

      pdf.setFontSize(10);
      const monthlyLines = [
        `This Month Invoiced standard: ${formatMoney(currentMonthMetrics.mInvoiced, currencyCode, currencyLocale)}`,
        `This Month Quoted Pipeline: ${formatMoney(currentMonthMetrics.mQuoted, currencyCode, currencyLocale)}`,
        `Settled Funds This Month: ${formatMoney(currentMonthMetrics.mPaid, currencyCode, currencyLocale)}`,
        `Average Invoice Nominal Profile: ${formatMoney(averageInvoiceValue, currencyCode, currencyLocale)}`,
        `Average Quote Nominal Profile: ${formatMoney(averageQuoteValue, currencyCode, currencyLocale)}`,
      ];

      monthlyLines.forEach((line) => {
        pdf.text(line, 14, y);
        y += 6;
      });

      y += 4;
      pdf.setFontSize(13);
      pdf.text('System Structural Quantities', 14, y);
      y += 7;

      pdf.setFontSize(10);
      const countLines = [
        `Total Invoice Records: ${invoices.length}`,
        `Total Proposal Quote Records: ${quotes.length}`,
        `Fully Settled Invoices: ${paidInvoices.length}`,
        `Outstanding Active Invoices: ${unpaidInvoices.length}`,
        `Active Safe Quotes: ${conversionMetrics.active}`,
        `Expired Tracking Fallouts: ${conversionMetrics.expired}`,
        `Successfully Converted Invoices: ${conversionMetrics.converted}`,
      ];

      countLines.forEach((line) => {
        pdf.text(line, 14, y);
        y += 6;
      });

      if (customerTotals.length > 0) {
        if (y > 220) {
          pdf.addPage();
          y = 18;
        }

        y += 4;
        pdf.setFontSize(13);
        pdf.text('Top Account Standings', 14, y);
        y += 7;

        pdf.setFontSize(10);
        customerTotals.forEach((cust, index) => {
          const line = `${index + 1}. ${cust.name} — ${formatMoney(
            cust.total,
            currencyCode,
            currencyLocale
          )} gross / ${formatMoney(
            cust.paidTotal,
            currencyCode,
            currencyLocale
          )} clear / ${cust.invoiceCount} invoices compiled`;

          const split = pdf.splitTextToSize(line, pageWidth - 28);
          pdf.text(split, 14, y);
          y += split.length * 5 + 2;

          if (y > 270 && index < customerTotals.length - 1) {
            pdf.addPage();
            y = 18;
          }
        });
      }

      pdf.save(`realqte-analytics-statement-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF construction layout engine error:', err);
      alert('Failed to generate report export document.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
      router.push('/');
    } catch (err) {
      console.error('Sign-out runtime error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-sm font-medium text-zinc-400">
        Reconciling analytics engine indexes...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden">
      <AppHeader
        user={user}
        setupComplete={true}
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Reports & Insights</h1>
            <p className="text-zinc-400 text-sm">
              Monitor net growth, pipeline velocity, and clear customer values at a single glance.
            </p>
            <p className="text-zinc-500 text-xs mt-2 font-mono">
              System active standard: {currencyCode} ({currencyLocale})
            </p>
          </div>

          {isPro && (
            <button
              onClick={exportPdfReport}
              disabled={exportingPdf}
              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white py-3 px-5 rounded-xl font-semibold text-sm shadow-sm transition-all"
            >
              {exportingPdf ? 'Compiling Engine Assets...' : 'Export PDF System Document'}
            </button>
          )}
        </div>

        {!isPro ? (
          <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800 max-w-xl mx-auto my-12">
            <h3 className="text-xl font-semibold mb-2">Unlock Pro Metric Systems</h3>
            <p className="text-zinc-400 mb-6 text-sm">
              Gain advanced analytics visibility, cross-collection expense tracing, and automated funnel health checks.
            </p>
            <Link
              href="/"
              className="inline-block bg-emerald-600 hover:bg-emerald-500 py-3 px-8 rounded-xl font-semibold text-sm transition"
            >
              Upgrade to Premium
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* UNIFIED REAL-TIME ACCOUNTING MATRIX INTEGRATION */}
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-[-12px]">Unified Balance Ledger Accounts</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Collected Revenue"
                value={formatMoney(paidRevenue, currencyCode, currencyLocale)}
                color="text-emerald-400"
                subtitle="Cleared settlement cash"
              />
              <MetricCard
                title="Logged Expenses"
                value={formatMoney(totalExpenses, currencyCode, currencyLocale)}
                color="text-amber-400"
                subtitle="Operating overhead costs"
              />
              <MetricCard
                title="True Net Profit"
                value={formatMoney(netProfit, currencyCode, currencyLocale)}
                color={netProfit >= 0 ? 'text-blue-400' : 'text-red-400'}
                subtitle="Calculated liquid return margin"
              />
              <MetricCard
                title="Arrears Outstanding"
                value={formatMoney(unpaidRevenue, currencyCode, currencyLocale)}
                color="text-red-400"
                subtitle="Unsettled open invoices pool"
              />
            </div>

            {/* PIPELINE & DEEP FUNNEL PROGRESSIVE TRACKS */}
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-[-12px]">Conversion & Funnel Velocity</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Funnel Conversion"
                value={`${conversionMetrics.rate}%`}
                color="text-purple-400"
                subtitle={`From ${conversionMetrics.totalQuotes} baseline quotes`}
              />
              <MetricCard
                title="Rolling Month Invoiced"
                value={formatMoney(currentMonthMetrics.mInvoiced, currencyCode, currencyLocale)}
              />
              <MetricCard
                title="Settled This Month"
                value={formatMoney(currentMonthMetrics.mPaid, currencyCode, currencyLocale)}
              />
              <MetricCard
                title="Avg Invoice Value"
                value={formatMoney(averageInvoiceValue, currencyCode, currencyLocale)}
              />
            </div>

            {/* VISUAL QUOTE CONVERSION HEALTH ENGINE */}
            <div className="grid grid-cols-3 gap-4">
              <MetricCard title="Active Safe Quotes" value={conversionMetrics.active} color="text-emerald-400" />
              <MetricCard title="Expired Losses" value={conversionMetrics.expired} color="text-zinc-500" />
              <MetricCard title="Successfully Converted" value={conversionMetrics.converted} color="text-blue-400" />
            </div>

            {/* CUSTOMER LIFE METRIC LEADERBOARD */}
            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Top Valuation Accounts</h3>
                <p className="text-zinc-400 text-xs mt-0.5">Top-performing customer tiers organized by absolute billing capacity.</p>
              </div>

              {customerTotals.length === 0 ? (
                <p className="text-zinc-500 text-center py-8 text-sm">No operational invoice matrix context found.</p>
              ) : (
                <div className="space-y-3">
                  {customerTotals.map((cust, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-zinc-950 rounded-xl px-4 py-3 border border-zinc-900 hover:border-zinc-800 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-600 text-sm font-bold w-5">{index + 1}.</span>
                        <div>
                          <div className="text-sm font-semibold">{cust.name}</div>
                          <div className="text-xs text-zinc-500">
                            {cust.invoiceCount} invoices generated
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-white font-bold text-sm">
                          {formatMoney(cust.total, currencyCode, currencyLocale)}
                        </div>
                        <div className="text-xs text-emerald-500 font-medium">
                          Paid: {formatMoney(cust.paidTotal, currencyCode, currencyLocale)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* LEDGER COUNT VOLUME ANALYSIS MATRIX */}
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-[-12px]">System Ledger Summaries</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard title="Total Invoices" value={invoices.length} />
              <MetricCard title="Total Quotes" value={quotes.length} />
              <MetricCard title="Settled Count" value={paidInvoices.length} color="text-emerald-500" />
              <MetricCard title="Open Count" value={unpaidInvoices.length} color="text-red-400" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetricCard
                title="Gross Pipeline Volume (Quotes)"
                value={formatMoney(lifetimeQuoted, currencyCode, currencyLocale)}
                color="text-blue-400"
              />
              <MetricCard
                title="This Month Quoted Pipeline"
                value={formatMoney(currentMonthMetrics.mQuoted, currencyCode, currencyLocale)}
                color="text-purple-400"
              />
            </div>
          </div>
        )}
      </div>

      <footer className="mt-16 border-t border-zinc-900 pt-6 pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© {new Date().getFullYear()} RealQte Engine Infrastructure. All privileges reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/help" className="hover:text-zinc-300 transition">
              Help Desk
            </Link>
            <Link href="/legal" className="hover:text-zinc-300 transition">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-zinc-300 transition">
              Privacy Architecture
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}