'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
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
  if (typeof value?.toDate === 'function') return value.toDate();
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

function formatMoney(value: string | number | undefined, currencyCode = 'ZAR', currencyLocale = 'en-ZA') {
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between transition hover:border-zinc-700 min-h-[120px] w-full block break-inside-avoid">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-400 font-semibold">{title}</p>
        <p className={`text-xl sm:text-2xl font-bold mt-2 tracking-tight ${color} break-all`}>{value}</p>
      </div>
      {subtitle && <p className="text-xs text-zinc-500 mt-2 font-medium">{subtitle}</p>}
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

  const currencyCode = profile.currencyCode || 'ZAR';
  const currencyLocale = profile.currencyLocale || 'en-ZA';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/');
        return;
      }
      try {
        setUser(u);
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
          setProfile({ currencyCode: 'ZAR', currencyLocale: 'en-ZA' });
        }

        const [docsSnap, custSnap, expSnap] = await Promise.all([
          getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid))),
          getDocs(query(collection(db, 'expenses'), where('userId', '==', u.uid)))
        ]);

        setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]);
        setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[]);
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseType[]);
      } catch (err) {
        console.error('Data layer retrieval anomaly:', err);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [router]);

  // ==========================================
  // COMPREHENSIVE MEMOIZED CALCULATION SUITE
  // ==========================================
  const invoices = useMemo(() => documents.filter((d) => d.type === 'invoice'), [documents]);
  const quotes = useMemo(() => documents.filter((d) => d.type === 'quote'), [documents]);

  const paidInvoices = useMemo(() => invoices.filter((invoice) => isInvoicePaid(invoice)), [invoices]);
  const unpaidInvoices = useMemo(() => invoices.filter((invoice) => !isInvoicePaid(invoice)), [invoices]);

  const lifetimeInvoiced = useMemo(() => invoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0), [invoices]);
  const lifetimeQuoted = useMemo(() => quotes.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0), [quotes]);
  
  const paidRevenue = useMemo(() => paidInvoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0), [paidInvoices]);
  const unpaidRevenue = useMemo(() => unpaidInvoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0), [unpaidInvoices]);

  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0), [expenses]);
  const netProfit = useMemo(() => paidRevenue - totalExpenses, [paidRevenue, totalExpenses]);

  // Compliance Safety Reserve Estimations
  const provisionalTaxReserve = useMemo(() => (netProfit > 0 ? netProfit * 0.27 : 0), [netProfit]);
  const estimatedVatLiability = useMemo(() => (lifetimeInvoiced * 0.15) - (totalExpenses * 0.15), [lifetimeInvoiced, totalExpenses]);

  const conversionMetrics = useMemo(() => {
    const totalQuotes = quotes.length;
    const convertedCount = invoices.filter(d => d.createdFromQuote || d.sourceDocumentType === 'quote').length;
    const rate = totalQuotes > 0 ? ((convertedCount / totalQuotes) * 100).toFixed(1) : '0.0';

    let active = 0, expired = 0, converted = 0;
    quotes.forEach(q => {
      const status = getQuoteStatus(q);
      if (status === 'active') active++;
      else if (status === 'expired') expired++;
      else if (status === 'converted') converted++;
    });
    return { rate, active, expired, converted, totalQuotes };
  }, [quotes, invoices]);

  const currentMonthMetrics = useMemo(() => {
    const nowRef = new Date();
    const cm = nowRef.getMonth();
    const cy = nowRef.getFullYear();

    let mInvoiced = 0;
    let mQuoted = 0;
    let mPaid = 0;

    invoices.forEach(inv => {
      const d = toDate(inv.createdAt);
      if (d && d.getMonth() === cm && d.getFullYear() === cy) {
        mInvoiced += parseFloat(String(inv.total || '0'));
        if (isInvoicePaid(inv)) mPaid += parseFloat(String(inv.total || '0'));
      }
    });

    quotes.forEach(q => {
      const d = toDate(q.createdAt);
      if (d && d.getMonth() === cm && d.getFullYear() === cy) {
        mQuoted += parseFloat(String(q.total || '0'));
      }
    });
    return { mInvoiced, mQuoted, mPaid };
  }, [invoices, quotes]);

  const customerTotals = useMemo(() => {
    const map = new Map<string, { name: string; total: number; paidTotal: number; invoiceCount: number }>();
    invoices.forEach((invoice) => {
      const name = invoice.client || 'Unknown Customer';
      const key = (invoice.customerId || name).toLowerCase();
      const amount = parseFloat(String(invoice.total || '0'));
      const paidAmount = isInvoicePaid(invoice) ? amount : 0;

      if (!map.has(key)) {
        map.set(key, { name, total: 0, paidTotal: 0, invoiceCount: 0 });
      }
      const existing = map.get(key)!;
      existing.total += amount;
      existing.paidTotal += paidAmount;
      existing.invoiceCount += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [invoices]);

  const averageInvoiceValue = invoices.length > 0 ? lifetimeInvoiced / invoices.length : 0;
  const averageQuoteValue = quotes.length > 0 ? lifetimeQuoted / quotes.length : 0;

  // Real-Time Native Window Print Trigger Engine matching accounting format standards
  const triggerNativePrintEngine = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-sm font-medium text-zinc-400">
        Syncing analytical ledger parameters...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white print:bg-white print:text-black overflow-x-hidden">
      {/* Structural layout protection block hiding layout fragments under prints */}
      <div className="print:hidden">
        <AppHeader user={user} setupComplete={true} onLogout={async () => { await signOut(auth); router.push('/'); }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        
        {/* RE-ENGINEERED DEFENSIVE HEADER BLOCK BOX */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-6 border-b border-zinc-900 print:border-black mb-8 w-full">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white print:text-black">Reports & Insights</h1>
            <p className="text-zinc-400 text-sm mt-1 print:hidden">Monitor business growth parameters, conversion velocities, and net profit margins.</p>
          </div>

          {isPro && (
            <button
              onClick={triggerNativePrintEngine}
              className="print:hidden inline-flex items-center justify-center bg-zinc-100 text-zinc-950 hover:bg-zinc-200 py-3 px-5 rounded-xl font-bold text-xs tracking-wide shadow-sm transition-all whitespace-nowrap"
            >
              Print Statement
            </button>
          )}
        </div>

        {!isPro ? (
          <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800 max-w-xl mx-auto my-12 print:hidden">
            <h3 className="text-xl font-semibold mb-2">Unlock Pro Metrics Suite</h3>
            <p className="text-zinc-400 mb-6 text-sm">Gain access to custom browser export layouts, localized tax safety projections, and conversion tracking flows.</p>
            <Link href="/" className="inline-block bg-emerald-600 hover:bg-emerald-500 py-3 px-8 rounded-xl font-semibold text-sm transition">
              Upgrade to Premium
            </Link>
          </div>
        ) : (
          <div className="space-y-10 flex flex-col w-full">
            
            {/* STAGE CONTAINER 1: VISUAL CONVERSION FUNNEL BLOCK */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 print:border-black break-inside-avoid w-full">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4 print:text-black">Pipeline Conversion Funnel</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center relative w-full">
                
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center print:border-black w-full">
                  <span className="text-xs font-bold text-zinc-500 uppercase block">Step 1: Quotes Generated</span>
                  <p className="text-2xl font-extrabold mt-1 text-zinc-200 print:text-black">{conversionMetrics.totalQuotes}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Total pipeline proposals issued</p>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center relative print:border-black w-full">
                  <span className="text-xs font-bold text-purple-400 uppercase block">Step 2: Conversion Efficiency</span>
                  <p className="text-2xl font-extrabold mt-1 text-purple-400">{conversionMetrics.rate}%</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{conversionMetrics.converted} proposals successfully accepted</p>
                  <div className="hidden md:block absolute top-1/2 -left-4 transform -translate-y-1/2 text-zinc-700 font-mono print:hidden">➔</div>
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 text-zinc-700 font-mono print:hidden">➔</div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center print:border-black w-full">
                  <span className="text-xs font-bold text-emerald-400 uppercase block">Step 3: Settled Orders</span>
                  <p className="text-2xl font-extrabold mt-1 text-emerald-400 print:text-black">{paidInvoices.length}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Paid invoices tracking completion</p>
                </div>

              </div>
            </div>

            {/* STAGE CONTAINER 2: RE-ENGINEERED UNIFIED BALANCES MATRIX GRID */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 print:text-black">Unified Accounting Balance Ledger</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                <MetricCard title="Collected Income" value={formatMoney(paidRevenue, currencyCode, currencyLocale)} color="text-emerald-400 print:text-black" subtitle="Total settled invoice receipts" />
                <MetricCard title="Logged Expenses" value={formatMoney(totalExpenses, currencyCode, currencyLocale)} color="text-amber-400 print:text-black" subtitle="Operating overhead parameters" />
                <MetricCard title="True Net Profit" value={formatMoney(netProfit, currencyCode, currencyLocale)} color={netProfit >= 0 ? 'text-blue-400 print:text-black' : 'text-red-400 print:text-black'} subtitle="Collected cash less operations" />
                <MetricCard title="Outstanding Arrears" value={formatMoney(unpaidRevenue, currencyCode, currencyLocale)} color="text-red-400 print:text-black" subtitle="Uncollected lock accounts receivable" />
              </div>
            </div>

            {/* STAGE CONTAINER 3: REGULATORY COMPLIANCE SUITE INDICATORS */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 print:text-black">Compliance Retention Estimates</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                <MetricCard 
                  title="Provisional Tax Safety Vault" 
                  value={formatMoney(provisionalTaxReserve, currencyCode, currencyLocale)} 
                  color="text-zinc-300 print:text-black"
                  subtitle="Suggested ~27% safe-harbour reserve from net returns" 
                />
                <MetricCard 
                  title="Estimated Net VAT Liability" 
                  value={formatMoney(estimatedVatLiability, currencyCode, currencyLocale)} 
                  color={estimatedVatLiability >= 0 ? 'text-orange-400 print:text-black' : 'text-teal-400 print:text-black'}
                  subtitle="Output VAT collections minus input deduction fields" 
                />
              </div>
            </div>

            {/* STAGE CONTAINER 4: VELOCITY INDICES SPEED CARD RE-LAYOUTS */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 print:text-black">Pipeline Tracking Velocity</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                <MetricCard title="Active Safe Quotes" value={conversionMetrics.active} color="text-emerald-400 print:text-black" />
                <MetricCard title="Expired Pipeline Losses" value={conversionMetrics.expired} color="text-zinc-500 print:text-black" />
                <MetricCard title="Avg Invoice Nominal" value={formatMoney(averageInvoiceValue, currencyCode, currencyLocale)} />
                <MetricCard title="Avg Quote Nominal" value={formatMoney(averageQuoteValue, currencyCode, currencyLocale)} />
              </div>
            </div>

            {/* STAGE CONTAINER 5: BOTTOM SUB-SECTION ARRAYS WITH COLLISION CORRECTIONS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full items-start">
              
              {/* TOP CLIENT CAPACITY METRIC LEADERBOARD */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 print:border-black w-full block break-inside-avoid">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white print:text-black">Top Customer Valuation Accounts</h3>
                  <p className="text-zinc-400 text-xs mt-1">Customer profiles organized by cumulative invoice volume assignments.</p>
                </div>

                {customerTotals.length === 0 ? (
                  <p className="text-zinc-500 text-center py-6 text-sm">No historical business invoices loaded.</p>
                ) : (
                  <div className="space-y-3 w-full">
                    {customerTotals.map((cust, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-zinc-950 rounded-xl px-4 py-3 border border-zinc-900/60 hover:border-zinc-800 transition print:border-black w-full">
                        <div className="min-w-0 pr-2">
                          <div className="text-sm font-bold text-zinc-200 print:text-black truncate">{cust.name}</div>
                          <div className="text-xs text-zinc-500">{cust.invoiceCount} invoices compiled</div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <div className="text-white font-extrabold text-sm print:text-black">{formatMoney(cust.total, currencyCode, currencyLocale)}</div>
                          <div className="text-xs text-emerald-400 font-medium print:text-zinc-600">Paid: {formatMoney(cust.paidTotal, currencyCode, currencyLocale)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ACTIONABLE DELINQUENT RECEIVABLES OUTSTANDING MODULE */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 print:border-black w-full block break-inside-avoid">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white print:text-black">Arrears Action Center center</h3>
                  <p className="text-zinc-400 text-xs mt-1">Outstanding open accounts requiring tracking follow-up workflows.</p>
                </div>

                {unpaidInvoices.length === 0 ? (
                  <p className="text-emerald-500 font-medium text-center py-8 text-sm">✓ All active client receivables are fully settled.</p>
                ) : (
                  <div className="space-y-3 w-full">
                    {unpaidInvoices.slice(0, 5).map((inv, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-zinc-950 rounded-xl px-4 py-3 border border-red-900/20 hover:border-red-900/50 transition gap-3 print:border-black w-full">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-zinc-100 print:text-black flex items-center gap-2 truncate">
                            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                            {inv.client || 'Unknown Client'}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5 truncate">Ref Number: #{inv.number || inv.id.slice(0, 5).toUpperCase()}</div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                          <span className="text-red-400 font-bold text-sm print:text-black">{formatMoney(inv.total, currencyCode, currencyLocale)}</span>
                          <Link 
                            href={`/invoices?search=${inv.number || ''}`}
                            className="print:hidden text-[11px] font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg transition"
                          >
                            Chaser
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* STAGE CONTAINER 6: QUANTITATIVE HISTORICAL AUDIT ACCUMULATORS */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 print:text-black">System Ledger Volume Audit</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                <MetricCard title="Total Invoices" value={invoices.length} />
                <MetricCard title="Total Proposals" value={quotes.length} />
                <MetricCard title="Settled Count" value={paidInvoices.length} color="text-emerald-500" />
                <MetricCard title="Open Count" value={unpaidInvoices.length} color="text-red-400" />
              </div>
            </div>

            {/* STAGE CONTAINER 7: GROSS TIMELINE VOLUMES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <MetricCard title="Gross Pipeline Volume (Quotes)" value={formatMoney(lifetimeQuoted, currencyCode, currencyLocale)} color="text-blue-400 print:text-black" />
              <MetricCard title="This Month Quoted Pipeline" value={formatMoney(currentMonthMetrics.mQuoted, currencyCode, currencyLocale)} color="text-purple-400 print:text-black" />
            </div>

            {/* STAGE CONTAINER 8: ROLLING PERIOD TRACKS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <MetricCard title="Rolling Month Issued" value={formatMoney(currentMonthMetrics.mInvoiced, currencyCode, currencyLocale)} />
              <MetricCard title="Rolling Month Realized" value={formatMoney(currentMonthMetrics.mPaid, currencyCode, currencyLocale)} color="text-emerald-400 print:text-black" />
            </div>

          </div>
        )}
      </div>

      <footer className="mt-20 border-t border-zinc-900 bg-zinc-950/40 py-6 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-medium">
          <p>© {new Date().getFullYear()} RealQte Business Management Infrastructure. All privileges reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/help" className="hover:text-white transition">Help Core</Link>
            <Link href="/legal" className="hover:text-white transition">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy Protocols</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}