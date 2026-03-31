'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import jsPDF from 'jspdf';

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
}: {
  title: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{title}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
  );
}

export default function Reporting() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
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

        const docsSnap = await getDocs(
          query(
            collection(db, 'documents'),
            where('userId', '==', u.uid),
            orderBy('createdAt', 'desc')
          )
        );
        setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]);

        const custSnap = await getDocs(
          query(collection(db, 'customers'), where('userId', '==', u.uid))
        );
        setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[]);
      } catch (err) {
        console.error('Reporting load error:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

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

  const lifetimeInvoiced = invoices.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const lifetimeQuoted = quotes.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const paidRevenue = paidInvoices.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const unpaidRevenue = unpaidInvoices.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const convertedInvoices = invoices.filter(
    (d) => d.createdFromQuote || d.sourceDocumentType === 'quote'
  ).length;

  const totalQuotes = quotes.length;
  const conversionRate =
    totalQuotes > 0 ? ((convertedInvoices / totalQuotes) * 100).toFixed(1) : '0.0';

  const activeQuotes = quotes.filter((q) => getQuoteStatus(q) === 'active').length;
  const expiredQuotes = quotes.filter((q) => getQuoteStatus(q) === 'expired').length;
  const convertedQuotes = quotes.filter((q) => getQuoteStatus(q) === 'converted').length;

  const averageInvoiceValue =
    invoices.length > 0 ? lifetimeInvoiced / invoices.length : 0;

  const averageQuoteValue =
    quotes.length > 0 ? lifetimeQuoted / quotes.length : 0;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthlyInvoices = invoices.filter((doc) => {
    const docDate = toDate(doc.createdAt);
    return (
      docDate &&
      docDate.getMonth() === currentMonth &&
      docDate.getFullYear() === currentYear
    );
  });

  const monthlyQuotesDocs = quotes.filter((doc) => {
    const docDate = toDate(doc.createdAt);
    return (
      docDate &&
      docDate.getMonth() === currentMonth &&
      docDate.getFullYear() === currentYear
    );
  });

  const monthlyPaidInvoices = paidInvoices.filter((doc) => {
    const docDate = toDate(doc.createdAt);
    return (
      docDate &&
      docDate.getMonth() === currentMonth &&
      docDate.getFullYear() === currentYear
    );
  });

  const monthlyInvoiced = monthlyInvoices.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const monthlyQuoted = monthlyQuotesDocs.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

  const monthlyPaidRevenue = monthlyPaidInvoices.reduce(
    (sum, d) => sum + parseFloat(String(d.total || '0')),
    0
  );

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

  const exportPdfReport = async () => {
    try {
      setExportingPdf(true);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();

      let y = 18;

      pdf.setFontSize(20);
      pdf.text('RealQte Report & Insights', 14, y);
      y += 8;

      pdf.setFontSize(10);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
      y += 5;
      pdf.text(`Currency: ${currencyCode} (${currencyLocale})`, 14, y);
      y += 10;

      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(13);
      pdf.text('Revenue Overview', 14, y);
      y += 7;

      pdf.setFontSize(10);
      const revenueLines = [
        `Paid Revenue: ${formatMoney(paidRevenue, currencyCode, currencyLocale)}`,
        `Outstanding Revenue: ${formatMoney(unpaidRevenue, currencyCode, currencyLocale)}`,
        `Lifetime Invoiced: ${formatMoney(lifetimeInvoiced, currencyCode, currencyLocale)}`,
        `Lifetime Quoted: ${formatMoney(lifetimeQuoted, currencyCode, currencyLocale)}`,
        `Conversion Rate: ${conversionRate}%`,
      ];

      revenueLines.forEach((line) => {
        pdf.text(line, 14, y);
        y += 6;
      });

      y += 4;
      pdf.setFontSize(13);
      pdf.text('Monthly Summary', 14, y);
      y += 7;

      pdf.setFontSize(10);
      const monthlyLines = [
        `This Month Invoiced: ${formatMoney(monthlyInvoiced, currencyCode, currencyLocale)}`,
        `This Month Quoted: ${formatMoney(monthlyQuoted, currencyCode, currencyLocale)}`,
        `Paid This Month: ${formatMoney(monthlyPaidRevenue, currencyCode, currencyLocale)}`,
        `Average Invoice Value: ${formatMoney(averageInvoiceValue, currencyCode, currencyLocale)}`,
        `Average Quote Value: ${formatMoney(averageQuoteValue, currencyCode, currencyLocale)}`,
      ];

      monthlyLines.forEach((line) => {
        pdf.text(line, 14, y);
        y += 6;
      });

      y += 4;
      pdf.setFontSize(13);
      pdf.text('Quote / Invoice Counts', 14, y);
      y += 7;

      pdf.setFontSize(10);
      const countLines = [
        `Invoices: ${invoices.length}`,
        `Quotes: ${quotes.length}`,
        `Paid Invoices: ${paidInvoices.length}`,
        `Unpaid Invoices: ${unpaidInvoices.length}`,
        `Active Quotes: ${activeQuotes}`,
        `Expired Quotes: ${expiredQuotes}`,
        `Converted Quotes: ${convertedQuotes}`,
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
        pdf.text('Top Customers', 14, y);
        y += 7;

        pdf.setFontSize(10);
        customerTotals.forEach((cust, index) => {
          const line = `${index + 1}. ${cust.name} — ${formatMoney(
            cust.total,
            currencyCode,
            currencyLocale
          )} total / ${formatMoney(
            cust.paidTotal,
            currencyCode,
            currencyLocale
          )} paid / ${cust.invoiceCount} invoices`;

          const split = pdf.splitTextToSize(line, pageWidth - 28);
          pdf.text(split, 14, y);
          y += split.length * 5 + 2;

          if (y > 270 && index < customerTotals.length - 1) {
            pdf.addPage();
            y = 18;
          }
        });
      }

      pdf.save(`realqte-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Failed to export PDF report.');
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
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading reports.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
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

            <nav className="hidden xl:flex items-center gap-8 text-sm">
              <Link href="/" className="text-zinc-400 hover:text-white">
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
              <Link href="/reporting" className="text-emerald-400 font-medium">
                Reports
              </Link>
              <Link href="/profile" className="text-zinc-400 hover:text-white">
                Profile
              </Link>
              <button onClick={handleLogout} className="text-red-400 hover:underline">
                Logout
              </button>
            </nav>

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
              <div className="grid grid-cols-1 gap-3 text-sm">
                <Link href="/" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
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
                <Link href="/reporting" className="text-emerald-400 font-medium" onClick={() => setMobileMenuOpen(false)}>
                  Reports
                </Link>
                <Link href="/profile" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-left text-red-400 hover:underline"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-1">Reports & Insights</h1>
            <p className="text-zinc-400 text-sm">
              Track revenue, performance, and customer value at a glance.
            </p>
            <p className="text-zinc-500 text-xs mt-2">
              Reporting currency: {currencyCode} ({currencyLocale})
            </p>
          </div>

          {isPro && (
            <button
              onClick={exportPdfReport}
              disabled={exportingPdf}
              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white py-3 px-5 rounded-xl font-semibold"
            >
              {exportingPdf ? 'Exporting PDF...' : 'Export PDF Report'}
            </button>
          )}
        </div>

        {!isPro ? (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center border border-zinc-800">
            <h3 className="text-xl font-semibold mb-3">Unlock Pro Reports</h3>
            <p className="text-zinc-400 mb-6 text-sm">
              Advanced analytics, conversion tracking, customer insights and more.
            </p>
            <Link
              href="/"
              className="inline-block bg-emerald-600 hover:bg-emerald-500 py-3 px-8 rounded-xl font-semibold"
            >
              Upgrade to Pro
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Paid Revenue"
                value={formatMoney(paidRevenue, currencyCode, currencyLocale)}
                color="text-emerald-400"
              />
              <MetricCard
                title="Outstanding"
                value={formatMoney(unpaidRevenue, currencyCode, currencyLocale)}
                color="text-red-400"
              />
              <MetricCard
                title="Lifetime Invoiced"
                value={formatMoney(lifetimeInvoiced, currencyCode, currencyLocale)}
                color="text-white"
              />
              <MetricCard
                title="Conversion Rate"
                value={`${conversionRate}%`}
                color="text-purple-400"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="This Month Invoiced"
                value={formatMoney(monthlyInvoiced, currencyCode, currencyLocale)}
              />
              <MetricCard
                title="This Month Quoted"
                value={formatMoney(monthlyQuoted, currencyCode, currencyLocale)}
              />
              <MetricCard
                title="Paid This Month"
                value={formatMoney(monthlyPaidRevenue, currencyCode, currencyLocale)}
              />
              <MetricCard
                title="Avg Invoice Value"
                value={formatMoney(averageInvoiceValue, currencyCode, currencyLocale)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <MetricCard title="Active Quotes" value={activeQuotes} color="text-emerald-400" />
              <MetricCard title="Expired" value={expiredQuotes} color="text-red-400" />
              <MetricCard title="Converted" value={convertedQuotes} color="text-blue-400" />
            </div>

            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
              <h3 className="text-lg font-semibold mb-4">Top Customers</h3>

              {customerTotals.length === 0 ? (
                <p className="text-zinc-500 text-center py-6 text-sm">No invoice history yet</p>
              ) : (
                <div className="space-y-3">
                  {customerTotals.map((cust, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500 text-sm w-5">{index + 1}.</span>
                        <div>
                          <div className="text-sm font-medium">{cust.name}</div>
                          <div className="text-xs text-zinc-400">
                            {cust.invoiceCount} invoices
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-emerald-400 font-semibold text-sm">
                          {formatMoney(cust.total, currencyCode, currencyLocale)}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Paid: {formatMoney(cust.paidTotal, currencyCode, currencyLocale)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard title="Invoices" value={invoices.length} />
              <MetricCard title="Quotes" value={quotes.length} />
              <MetricCard title="Paid" value={paidInvoices.length} color="text-emerald-400" />
              <MetricCard title="Unpaid" value={unpaidInvoices.length} color="text-red-400" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetricCard
                title="Lifetime Quoted"
                value={formatMoney(lifetimeQuoted, currencyCode, currencyLocale)}
                color="text-blue-400"
              />
              <MetricCard
                title="Avg Quote Value"
                value={formatMoney(averageQuoteValue, currencyCode, currencyLocale)}
                color="text-purple-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}