'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

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

export default function Reporting() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [loading, setLoading] = useState(true);

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

  const invoices = useMemo(
    () => documents.filter((d) => d.type === 'invoice'),
    [documents]
  );

  const quotes = useMemo(
    () => documents.filter((d) => d.type === 'quote'),
    [documents]
  );

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => isInvoicePaid(invoice)),
    [invoices]
  );

  const unpaidInvoices = useMemo(
    () => invoices.filter((invoice) => !isInvoicePaid(invoice)),
    [invoices]
  );

  const lifetimeInvoiced = invoices.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const lifetimeQuoted = quotes.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const paidRevenue = paidInvoices.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const unpaidRevenue = unpaidInvoices.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
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

        const total = custInvoices.reduce(
          (sum, d) => sum + parseFloat(d.total || '0'),
          0
        );

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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading reports...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
              SA
            </span>
          </div>
          <div className="flex items-center gap-8 text-sm">
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
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Reports & Insights</h1>
          <p className="text-zinc-400">
            Understand your sales performance, quote conversion, customer value, and cash flow trends.
          </p>
        </div>

        {!isPro ? (
          <div className="bg-zinc-900 rounded-3xl p-10 text-center border border-zinc-800">
            <h3 className="text-2xl font-semibold mb-6">Pro Reports</h3>
            <p className="text-zinc-400 mb-8">
              Unlock advanced reporting, lifetime totals, revenue breakdowns, quote conversion,
              top customers, and deeper business insights.
              <br />
              Upgrade to Pro for R35/month.
            </p>
            <Link
              href="/"
              className="inline-block bg-emerald-600 hover:bg-emerald-500 py-5 px-12 rounded-2xl text-xl font-bold"
            >
              Upgrade to Pro
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                <p className="text-zinc-400 text-sm">Lifetime invoiced</p>
                <p className="text-4xl font-bold text-emerald-400 mt-2">
                  R{lifetimeInvoiced.toFixed(2)}
                </p>
              </div>

              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                <p className="text-zinc-400 text-sm">Lifetime quoted</p>
                <p className="text-4xl font-bold text-blue-400 mt-2">
                  R{lifetimeQuoted.toFixed(2)}
                </p>
              </div>

              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                <p className="text-zinc-400 text-sm">Paid revenue</p>
                <p className="text-4xl font-bold text-emerald-400 mt-2">
                  R{paidRevenue.toFixed(2)}
                </p>
              </div>

              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
                <p className="text-zinc-400 text-sm">Outstanding revenue</p>
                <p className="text-4xl font-bold text-red-400 mt-2">
                  R{unpaidRevenue.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
              <h3 className="text-2xl font-semibold mb-6">Lifetime Overview</h3>
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-5xl font-bold text-purple-400">{conversionRate}%</p>
                  <p className="text-zinc-400 mt-2">Quote Conversion Rate</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-emerald-400">
                    R{averageInvoiceValue.toFixed(2)}
                  </p>
                  <p className="text-zinc-400 mt-2">Average Invoice Value</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-blue-400">
                    R{averageQuoteValue.toFixed(2)}
                  </p>
                  <p className="text-zinc-400 mt-2">Average Quote Value</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
              <h3 className="text-2xl font-semibold mb-6">This Month</h3>
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-5xl font-bold text-emerald-400">
                    R{monthlyInvoiced.toFixed(2)}
                  </p>
                  <p className="text-zinc-400 mt-2">Invoiced This Month</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-blue-400">
                    R{monthlyQuoted.toFixed(2)}
                  </p>
                  <p className="text-zinc-400 mt-2">Quoted This Month</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-purple-400">
                    R{monthlyPaidRevenue.toFixed(2)}
                  </p>
                  <p className="text-zinc-400 mt-2">Paid This Month</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
              <h3 className="text-2xl font-semibold mb-6">Quote Pipeline</h3>
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-5xl font-bold text-emerald-400">{activeQuotes}</p>
                  <p className="text-zinc-400 mt-2">Active Quotes</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-red-400">{expiredQuotes}</p>
                  <p className="text-zinc-400 mt-2">Expired Quotes</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-blue-400">{convertedQuotes}</p>
                  <p className="text-zinc-400 mt-2">Converted Quotes</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
              <h3 className="text-2xl font-semibold mb-6">Top Customers by Value</h3>
              {customerTotals.length === 0 ? (
                <p className="text-zinc-500 text-center py-10">No invoice history yet</p>
              ) : (
                <div className="space-y-4">
                  {customerTotals.map((cust, index) => (
                    <div
                      key={index}
                      className="bg-zinc-800 p-5 rounded-2xl flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium text-white">{cust.name}</div>
                        <div className="text-sm text-zinc-400">
                          {cust.invoiceCount} invoice{cust.invoiceCount === 1 ? '' : 's'} • Paid: R
                          {cust.paidTotal.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-emerald-400 font-bold">
                        R{cust.total.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
              <h3 className="text-2xl font-semibold mb-6">Other Insights</h3>
              <div className="grid md:grid-cols-4 gap-6 text-center">
                <div>
                  <p className="text-5xl font-bold text-emerald-400">{invoices.length}</p>
                  <p className="text-zinc-400">Total Invoices</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-blue-400">{quotes.length}</p>
                  <p className="text-zinc-400">Total Quotes</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-emerald-400">{paidInvoices.length}</p>
                  <p className="text-zinc-400">Paid Invoices</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-red-400">{unpaidInvoices.length}</p>
                  <p className="text-zinc-400">Unpaid Invoices</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}