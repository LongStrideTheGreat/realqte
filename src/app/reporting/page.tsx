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
  total?: string;
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
};

type CustomerType = {
  id: string;
  name?: string;
  email?: string;
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
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

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
          setIsPro(isSubscriptionActive(userSnap.data()));
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

  const lifetimeInvoiced = invoices.reduce((sum, d) => sum + parseFloat(d.total || '0'), 0);

  const lifetimeQuoted = quotes.reduce((sum, d) => sum + parseFloat(d.total || '0'), 0);

  const paidRevenue = paidInvoices.reduce((sum, d) => sum + parseFloat(d.total || '0'), 0);

  const unpaidRevenue = unpaidInvoices.reduce((sum, d) => sum + parseFloat(d.total || '0'), 0);

  const convertedInvoices = invoices.filter(
    (d) => d.createdFromQuote || d.sourceDocumentType === 'quote'
  ).length;

  const totalQuotes = quotes.length;
  const conversionRate =
    totalQuotes > 0 ? ((convertedInvoices / totalQuotes) * 100).toFixed(1) : '0.0';

  const activeQuotes = quotes.filter((q) => getQuoteStatus(q) === 'active').length;
  const expiredQuotes = quotes.filter((q) => getQuoteStatus(q) === 'expired').length;
  const convertedQuotes = quotes.filter((q) => getQuoteStatus(q) === 'converted').length;

  const averageInvoiceValue = invoices.length > 0 ? lifetimeInvoiced / invoices.length : 0;
  const averageQuoteValue = quotes.length > 0 ? lifetimeQuoted / quotes.length : 0;

  const customerTotals = useMemo(() => {
    return customers
      .map((cust) => {
        const custInvoices = invoices.filter((d) => {
          if (d.customerId && d.customerId === cust.id) return true;
          return (
            cust.name &&
            d.client &&
            cust.name.trim().toLowerCase() === d.client.trim().toLowerCase()
          );
        });

        const total = custInvoices.reduce((sum, d) => sum + parseFloat(d.total || '0'), 0);

        const paidTotal = custInvoices
          .filter((invoice) => isInvoicePaid(invoice))
          .reduce((sum, d) => sum + parseFloat(d.total || '0'), 0);

        return {
          name: cust.name || cust.email || 'Unnamed Customer',
          total,
          paidTotal,
          invoiceCount: custInvoices.length,
        };
      })
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [customers, invoices]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const invoicesThisMonth = invoices.filter((d) => {
    const created = toDate(d.createdAt);
    return (
      created &&
      created.getMonth() === currentMonth &&
      created.getFullYear() === currentYear
    );
  });

  const quotesThisMonth = quotes.filter((d) => {
    const created = toDate(d.createdAt);
    return (
      created &&
      created.getMonth() === currentMonth &&
      created.getFullYear() === currentYear
    );
  });

  const monthlyInvoiced = invoicesThisMonth.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const monthlyQuoted = quotesThisMonth.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const monthlyPaidRevenue = invoicesThisMonth
    .filter((invoice) => isInvoicePaid(invoice))
    .reduce((sum, d) => sum + parseFloat(d.total || '0'), 0);

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const exportPdfReport = async () => {
    try {
      setExportingPdf(true);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const marginX = 14;
      let y = 18;

      const addLine = (text: string, size = 11, color: [number, number, number] = [20, 20, 20], gap = 7) => {
        pdf.setFontSize(size);
        pdf.setTextColor(color[0], color[1], color[2]);
        const lines = pdf.splitTextToSize(text, pageWidth - marginX * 2);
        pdf.text(lines, marginX, y);
        y += lines.length * 5 + (gap - 5);
      };

      const addSectionTitle = (text: string) => {
        if (y > 265) {
          pdf.addPage();
          y = 18;
        }
        pdf.setDrawColor(220, 220, 220);
        pdf.line(marginX, y, pageWidth - marginX, y);
        y += 6;
        addLine(text, 14, [16, 185, 129], 7);
      };

      pdf.setFont('helvetica', 'bold');
      addLine('RealQte Reports & Insights', 18, [16, 185, 129], 8);
      pdf.setFont('helvetica', 'normal');
      addLine(
        `Generated on ${new Date().toLocaleString()}`,
        10,
        [100, 100, 100],
        8
      );

      addSectionTitle('Headline Metrics');
      addLine(`Paid Revenue: R${paidRevenue.toFixed(2)}`);
      addLine(`Outstanding Revenue: R${unpaidRevenue.toFixed(2)}`);
      addLine(`Lifetime Invoiced: R${lifetimeInvoiced.toFixed(2)}`);
      addLine(`Lifetime Quoted: R${lifetimeQuoted.toFixed(2)}`);
      addLine(`Conversion Rate: ${conversionRate}%`);

      addSectionTitle('This Month');
      addLine(`Invoiced This Month: R${monthlyInvoiced.toFixed(2)}`);
      addLine(`Quoted This Month: R${monthlyQuoted.toFixed(2)}`);
      addLine(`Paid This Month: R${monthlyPaidRevenue.toFixed(2)}`);

      addSectionTitle('Performance');
      addLine(`Average Invoice Value: R${averageInvoiceValue.toFixed(2)}`);
      addLine(`Average Quote Value: R${averageQuoteValue.toFixed(2)}`);
      addLine(`Total Invoices: ${invoices.length}`);
      addLine(`Total Quotes: ${quotes.length}`);
      addLine(`Paid Invoices: ${paidInvoices.length}`);
      addLine(`Unpaid Invoices: ${unpaidInvoices.length}`);

      addSectionTitle('Quote Pipeline');
      addLine(`Active Quotes: ${activeQuotes}`);
      addLine(`Expired Quotes: ${expiredQuotes}`);
      addLine(`Converted Quotes: ${convertedQuotes}`);

      addSectionTitle('Top Customers');
      if (customerTotals.length === 0) {
        addLine('No invoice history yet.');
      } else {
        customerTotals.forEach((cust, index) => {
          addLine(
            `${index + 1}. ${cust.name} — Total: R${cust.total.toFixed(2)} | Paid: R${cust.paidTotal.toFixed(2)} | Invoices: ${cust.invoiceCount}`,
            10,
            [30, 30, 30],
            6
          );
        });
      }

      pdf.save(`realqte-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Export PDF error:', err);
      alert('Failed to export PDF report.');
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading reports...
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

            <div className="hidden xl:flex items-center gap-6 text-sm">
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
              <div className="grid grid-cols-1 gap-3 text-sm">
                <Link
                  href="/"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/new-invoice"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  New Invoice
                </Link>
                <Link
                  href="/new-quote"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  New Quote
                </Link>
                <Link
                  href="/quotes"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Quotes
                </Link>
                <Link
                  href="/products"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Products
                </Link>
                <Link
                  href="/invoices"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Invoices
                </Link>
                <Link
                  href="/customers"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Customers
                </Link>
                <Link
                  href="/accounting"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Accounting
                </Link>
                <Link
                  href="/reporting"
                  className="text-emerald-400 font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Reports
                </Link>
                <Link
                  href="/profile"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
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
              <MetricCard title="Paid Revenue" value={`R${paidRevenue.toFixed(2)}`} color="text-emerald-400" />
              <MetricCard title="Outstanding" value={`R${unpaidRevenue.toFixed(2)}`} color="text-red-400" />
              <MetricCard title="Lifetime Invoiced" value={`R${lifetimeInvoiced.toFixed(2)}`} color="text-white" />
              <MetricCard title="Conversion Rate" value={`${conversionRate}%`} color="text-purple-400" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard title="This Month Invoiced" value={`R${monthlyInvoiced.toFixed(2)}`} />
              <MetricCard title="This Month Quoted" value={`R${monthlyQuoted.toFixed(2)}`} />
              <MetricCard title="Paid This Month" value={`R${monthlyPaidRevenue.toFixed(2)}`} />
              <MetricCard title="Avg Invoice Value" value={`R${averageInvoiceValue.toFixed(2)}`} />
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
                          R{cust.total.toFixed(2)}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Paid: R{cust.paidTotal.toFixed(2)}
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
                value={`R${lifetimeQuoted.toFixed(2)}`}
                color="text-blue-400"
              />
              <MetricCard
                title="Avg Quote Value"
                value={`R${averageQuoteValue.toFixed(2)}`}
                color="text-purple-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}