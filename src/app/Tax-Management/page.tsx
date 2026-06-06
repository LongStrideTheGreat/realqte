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
  total?: string | number;
  createdAt?: any;
  status?: string;
  paymentStatus?: string;
  paid?: boolean;
};

type ExpenseType = {
  id: string;
  userId?: string;
  amount: number;
  category: string;
  description?: string;
  createdAt: any;
};

type ProfileType = {
  currencyCode?: string;
  currencyLocale?: string;
  taxRegion?: string; // e.g., 'ZA', 'US', 'UK'
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

export default function TaxManagement() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [expenses, setExpenses] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);

  const currencyCode = profile.currencyCode || 'ZAR';
  const currencyLocale = profile.currencyLocale || 'en-ZA';
  
  // Dynamic fallback inference for regional rules engine mapping
  const taxRegion = profile.taxRegion || (currencyCode === 'ZAR' ? 'ZA' : 'ZA');

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
            taxRegion: incomingProfile.taxRegion || (incomingProfile.currencyCode === 'ZAR' ? 'ZA' : 'ZA'),
          });
        } else {
          setIsPro(false);
          setProfile({ currencyCode: 'ZAR', currencyLocale: 'en-ZA', taxRegion: 'ZA' });
        }

        const [docsSnap, expSnap] = await Promise.all([
          getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'expenses'), where('userId', '==', u.uid)))
        ]);

        setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]);
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseType[]);
      } catch (err) {
        console.error('Tax processing pipeline failure:', err);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [router]);

  // ==========================================
  // SHARED OPERATIONAL REVENUE CALCULATIONS
  // ==========================================
  const invoices = useMemo(() => documents.filter((d) => d.type === 'invoice'), [documents]);
  const paidInvoices = useMemo(() => invoices.filter((invoice) => isInvoicePaid(invoice)), [invoices]);

  const lifetimeInvoiced = useMemo(() => invoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0), [invoices]);
  const paidRevenue = useMemo(() => paidInvoices.reduce((sum, d) => sum + parseFloat(String(d.total || '0')), 0), [paidInvoices]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0), [expenses]);
  const netProfit = useMemo(() => paidRevenue - totalExpenses, [paidRevenue, totalExpenses]);

  // ==========================================
  // REGIONAL TAX RULES ENGINE (AUTO-POPULATING)
  // ==========================================
  const regionalTaxData = useMemo(() => {
    // Default Rule Parameter Fallback (South African Framework Standards)
    let vatRate = 0.15;
    let profitTaxRate = 0.27;
    let regionName = 'South Africa (SARS Standard Ruleset)';
    let notes = 'VAT is calculated at 15% on total invoiced amounts. Corporate/Provisional tax is evaluated at 27% on net operational profit lines.';

    if (taxRegion === 'US') {
      vatRate = 0.0; // Sales Tax variants managed externally
      profitTaxRate = 0.21; // Federal Baseline Estimate
      regionName = 'United States (IRS Federal Baseline)';
      notes = 'Calculated using a flat 21% federal estimation metric. State sales tax parameters are independent.';
    } else if (taxRegion === 'UK') {
      vatRate = 0.20; // UK Standard VAT Rate
      profitTaxRate = 0.19; // UK Small Profits Rate Base
      regionName = 'United Kingdom (HMRC Framework)';
      notes = 'Standard VAT tracking mapped at 20%. Profit tracking configured to the 19% Small Profits Rate baseline.';
    }

    // Dynamic Safe-Harbour Metrics Formulations
    const grossVatOutput = lifetimeInvoiced * vatRate;
    const vatInputCredit = totalExpenses * vatRate;
    const netVatLiability = grossVatOutput - vatInputCredit;
    const provisionalTaxAllocation = netProfit > 0 ? netProfit * profitTaxRate : 0;
    const combinedSafeHarbourPot = (netVatLiability > 0 ? netVatLiability : 0) + provisionalTaxAllocation;

    return {
      regionName,
      vatPercent: (vatRate * 100).toFixed(0),
      profitPercent: (profitTaxRate * 100).toFixed(0),
      notes,
      grossVatOutput,
      vatInputCredit,
      netVatLiability,
      provisionalTaxAllocation,
      combinedSafeHarbourPot
    };
  }, [taxRegion, lifetimeInvoiced, totalExpenses, netProfit]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-sm font-medium text-zinc-400">
        Reconciling dynamic tax parameters...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden antialiased">
      <AppHeader user={user} setupComplete={true} onLogout={async () => { await signOut(auth); router.push('/'); }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* HEADER SECTION */}
        <div className="pb-6 border-b border-zinc-900 mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight">Tax Management Hub</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Automated regional safety pots, dynamic forecasts, and accounting reserves synced straight from your operations.
          </p>
        </div>

        {!isPro ? (
          <div className="bg-zinc-900 rounded-3xl p-10 text-center border border-zinc-800 max-w-xl mx-auto my-16 shadow-2xl space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">🏢</div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold tracking-tight">Unlock Automated Regional Tax Tools</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Upgrade to Pro to auto-populate native {currencyCode} tax pots, map out business deductions, and track input/output VAT balances.
              </p>
            </div>
            <Link href="/" className="inline-block w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3.5 px-8 rounded-xl transition-all">
              Upgrade to Premium
            </Link>
          </div>
        ) : (
          <div className="space-y-10 flex flex-col w-full">
            
            {/* REGIONAL RUNTIME ZONE CONFIGURATION STATUS BOX */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase block">Active Rule Target</span>
                <h2 className="text-lg font-bold mt-0.5 text-zinc-100">{regionalTaxData.regionName}</h2>
                <p className="text-xs text-zinc-400 mt-1 max-w-2xl">{regionalTaxData.notes}</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 px-4 py-2.5 rounded-xl text-xs font-mono text-zinc-400 self-start md:self-auto">
                Config: {regionalTaxData.vatPercent}% VAT / {regionalTaxData.profitPercent}% Profit Tax
              </div>
            </div>

            {/* MASTER LIQUIDITY SAFE HARBOUR CASH POT TARGET */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-emerald-950/40 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
              <div className="max-w-xl space-y-3">
                <span className="bg-emerald-500/10 text-emerald-400 text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md">
                  Recommended Total Tax Reserve Pot
                </span>
                <p className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                  {formatMoney(regionalTaxData.combinedSafeHarbourPot, currencyCode, currencyLocale)}
                </p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  This represents the recommended cash allocation to move into an unspent bank wallet immediately. It combines your outstanding net VAT position and accrued provisional income liabilities based on current cash movements.
                </p>
              </div>
            </div>

            {/* TWO COLUMN COMPONENT BREAKDOWN METRIC CARDS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
              
              {/* VAT LIABILITY ACCOUNTING FORECAST MATRIX */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Value Added Tax (VAT) Balance Flow</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Calculated using standard {regionalTaxData.vatPercent}% local transactions values.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-900">
                    <span className="text-[11px] text-zinc-500 font-bold uppercase block">Output VAT (Invoiced)</span>
                    <span className="text-lg font-bold text-zinc-200 block mt-1">{formatMoney(regionalTaxData.grossVatOutput, currencyCode, currencyLocale)}</span>
                  </div>
                  <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-900">
                    <span className="text-[11px] text-zinc-500 font-bold uppercase block">Input VAT (Claimable)</span>
                    <span className="text-lg font-bold text-emerald-400 block mt-1">{formatMoney(regionalTaxData.vatInputCredit, currencyCode, currencyLocale)}</span>
                  </div>
                </div>

                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold block text-zinc-300">Estimated Net VAT Payable</span>
                    <span className="text-[11px] text-zinc-500">Output collections minus claim deductions</span>
                  </div>
                  <span className={`text-xl font-black ${regionalTaxData.netVatLiability >= 0 ? 'text-orange-400' : 'text-teal-400'}`}>
                    {formatMoney(regionalTaxData.netVatLiability >= 0 ? regionalTaxData.netVatLiability : 0, currencyCode, currencyLocale)}
                  </span>
                </div>
              </div>

              {/* INCOME / PROVISIONAL TAX RESERVES MATRIX */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Provisional / Corporate Tax Forecast</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Projected flat {regionalTaxData.profitPercent}% assessment threshold on cleared net profit margin results.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-900">
                    <span className="text-[11px] text-zinc-500 font-bold uppercase block">Current Liquid Returns</span>
                    <span className="text-lg font-bold text-zinc-200 block mt-1">{formatMoney(netProfit, currencyCode, currencyLocale)}</span>
                  </div>
                  <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-900">
                    <span className="text-[11px] text-zinc-500 font-bold uppercase block">Tax Rate Allocation Base</span>
                    <span className="text-lg font-bold text-purple-400 block mt-1">{regionalTaxData.profitPercent}% Flat Rate</span>
                  </div>
                </div>

                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold block text-zinc-300">Accrued Tax Liability Estimate</span>
                    <span className="text-[11px] text-zinc-500">Provisional withholding safety buffer calculation</span>
                  </div>
                  <span className="text-xl font-black text-zinc-200">
                    {formatMoney(regionalTaxData.provisionalTaxAllocation, currencyCode, currencyLocale)}
                  </span>
                </div>
              </div>

            </div>

            {/* COMPLIANCE SUBMISSION CALENDAR TRACKS CONTAINER */}
            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Critical Compliance Submission Windows</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Standard regional fiscal baseline calendar parameters requiring attention.</p>
              </div>

              <div className="space-y-2.5 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-zinc-950 px-5 py-4 rounded-xl border border-zinc-900 gap-3">
                  <div>
                    <div className="text-sm font-bold text-zinc-200">Provisional Tax Assessment Block: Period 1</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Filing deadline tracking focus targeting trailing mid-year earnings benchmarks.</div>
                  </div>
                  <span className="bg-zinc-900 text-zinc-400 px-3 py-1 text-xs font-mono font-bold border border-zinc-800 rounded-lg shrink-0 self-start sm:self-auto">
                    Target Cycle: End of August
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-zinc-950 px-5 py-4 rounded-xl border border-zinc-900 gap-3">
                  <div>
                    <div className="text-sm font-bold text-zinc-200">Provisional Tax Assessment Block: Period 2</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Closing cycle consolidation evaluating total combined absolute fiscal year performance records.</div>
                  </div>
                  <span className="bg-zinc-900 text-zinc-400 px-3 py-1 text-xs font-mono font-bold border border-zinc-800 rounded-lg shrink-0 self-start sm:self-auto">
                    Target Cycle: End of February
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-zinc-950 px-5 py-4 rounded-xl border border-zinc-900 gap-3">
                  <div>
                    <div className="text-sm font-bold text-zinc-200">Periodic VAT Return Reconciliations</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Bi-monthly ledger balance transaction evaluations routing through output clearing registers.</div>
                  </div>
                  <span className="bg-zinc-900 text-emerald-500 bg-emerald-500/5 px-3 py-1 text-xs font-mono font-bold border border-emerald-950/30 rounded-lg shrink-0 self-start sm:self-auto">
                    Target Cycle: Alternate Month Ends
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}