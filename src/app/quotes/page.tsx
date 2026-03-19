'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

type QuoteType = {
  id: string;
  userId?: string;
  type?: string;
  number?: string;
  client?: string;
  clientEmail?: string;
  customerId?: string | null;
  total?: string | number;
  subtotal?: string | number;
  vatAmount?: string | number;
  date?: string;
  expiryDate?: any;
  expiryDays?: number;
  validUntilText?: string;
  status?: string;
  convertedToInvoice?: boolean;
  convertedInvoiceId?: string | null;
  paymentStatus?: string;
  paid?: boolean;
  createdAt?: any;
  updatedAt?: any;
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

function isExpired(quote: QuoteType) {
  if (quote.convertedToInvoice) return false;

  const expiry = toDate(quote.expiryDate);
  if (!expiry) return false;

  return expiry.getTime() < Date.now();
}

function getQuoteStatus(quote: QuoteType): 'draft' | 'sent' | 'expired' | 'converted' {
  if (quote.convertedToInvoice || quote.status === 'converted') return 'converted';
  if (isExpired(quote)) return 'expired';
  if (quote.status === 'sent') return 'sent';
  return 'draft';
}

function formatMoney(value: string | number | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value || 0);
  return numeric.toFixed(2);
}

export default function QuotesPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [quotes, setQuotes] = useState<QuoteType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'draft' | 'sent' | 'expired' | 'converted'
  >('all');
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      try {
        setUser(u);

        const [quoteSnap, customerSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'documents'),
              where('userId', '==', u.uid),
              where('type', '==', 'quote'),
              orderBy('createdAt', 'desc')
            )
          ),
          getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid))),
        ]);

        setQuotes(quoteSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as QuoteType[]);
        setCustomers(customerSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[]);
      } catch (err) {
        console.error('Failed to load quotes:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  const filteredQuotes = useMemo(() => {
    return quotes.filter((quote) => {
      const term = searchTerm.trim().toLowerCase();

      const matchesSearch =
        !term ||
        quote.number?.toLowerCase().includes(term) ||
        quote.client?.toLowerCase().includes(term) ||
        quote.clientEmail?.toLowerCase().includes(term);

      const quoteStatus = getQuoteStatus(quote);
      const matchesStatus = statusFilter === 'all' || quoteStatus === statusFilter;

      const matchesCustomer =
        !selectedCustomerId ||
        quote.customerId === selectedCustomerId ||
        customers.some(
          (customer) =>
            customer.id === selectedCustomerId &&
            customer.name &&
            quote.client &&
            customer.name.trim().toLowerCase() === quote.client.trim().toLowerCase()
        );

      return matchesSearch && matchesStatus && matchesCustomer;
    });
  }, [quotes, searchTerm, statusFilter, selectedCustomerId, customers]);

  const stats = useMemo(() => {
    const total = quotes.length;
    const draft = quotes.filter((q) => getQuoteStatus(q) === 'draft').length;
    const sent = quotes.filter((q) => getQuoteStatus(q) === 'sent').length;
    const expired = quotes.filter((q) => getQuoteStatus(q) === 'expired').length;
    const converted = quotes.filter((q) => getQuoteStatus(q) === 'converted').length;

    return { total, draft, sent, expired, converted };
  }, [quotes]);

  const getCustomerName = (quote: QuoteType) => {
    if (quote.customerId) {
      const customer = customers.find((c) => c.id === quote.customerId);
      if (customer?.name) return customer.name;
    }

    return quote.client || 'Unknown Customer';
  };

  const getStatusBadge = (quote: QuoteType) => {
    const status = getQuoteStatus(quote);

    if (status === 'converted') {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400">
          Converted
        </span>
      );
    }

    if (status === 'expired') {
      return (
        <span className="inline-flex items-center rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
          Expired
        </span>
      );
    }

    if (status === 'sent') {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
          Sent
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
        Draft
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading quotes...
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
              <Link href="/quotes" className="text-emerald-400 font-medium">
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
              <Link href="/reporting" className="text-zinc-400 hover:text-white">
                Reports
              </Link>
              <Link href="/profile" className="text-zinc-400 hover:text-white">
                Profile
              </Link>
              <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">
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
                  className="text-emerald-400 font-medium"
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
                  className="text-zinc-300 hover:text-white"
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
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut(auth);
                  }}
                  className="text-left text-red-400 hover:underline"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">All Quotes</h1>
            <p className="text-zinc-400">
              View saved quotes, edit them, filter them, and convert eligible quotes into invoices.
            </p>
          </div>

          <Link
            href="/new-quote"
            className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-6 rounded-2xl font-medium"
          >
            Create New Quote
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Total quotes</p>
            <p className="text-4xl font-bold mt-2">{stats.total}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Draft quotes</p>
            <p className="text-4xl font-bold mt-2 text-emerald-400">{stats.draft}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Sent quotes</p>
            <p className="text-4xl font-bold mt-2 text-amber-400">{stats.sent}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Expired quotes</p>
            <p className="text-4xl font-bold mt-2 text-red-400">{stats.expired}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Converted quotes</p>
            <p className="text-4xl font-bold mt-2 text-blue-400">{stats.converted}</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Search by quote number, client name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />

            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name || customer.email || 'Unnamed Customer'}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as 'all' | 'draft' | 'sent' | 'expired' | 'converted'
                )
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft Only</option>
              <option value="sent">Sent Only</option>
              <option value="expired">Expired Only</option>
              <option value="converted">Converted Only</option>
            </select>
          </div>
        </div>

        {filteredQuotes.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center">
            <p className="text-zinc-500">No quotes found for the selected filters.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredQuotes.map((quote) => {
              const expiryDate = toDate(quote.expiryDate);
              const createdDate = toDate(quote.createdAt);
              const status = getQuoteStatus(quote);

              return (
                <div
                  key={quote.id}
                  className="bg-zinc-900 rounded-3xl p-6 hover:bg-zinc-800 transition-all border border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="font-medium text-white text-lg">{quote.number || 'Quote'}</div>
                      <div className="text-sm text-zinc-400 mt-1">{getCustomerName(quote)}</div>
                    </div>
                    {getStatusBadge(quote)}
                  </div>

                  <div className="space-y-2 text-sm text-zinc-300 mb-5">
                    <div className="flex justify-between gap-4">
                      <span>Total</span>
                      <span className="font-medium text-white">R{formatMoney(quote.total)}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Email</span>
                      <span className="text-right break-all">{quote.clientEmail || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Created</span>
                      <span>{createdDate?.toLocaleDateString() || quote.date || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Expires</span>
                      <span>{expiryDate?.toLocaleDateString() || quote.validUntilText || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Validity</span>
                      <span>{quote.expiryDays ? `${quote.expiryDays} days` : '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Invoice Link</span>
                      <span className="text-right">
                        {quote.convertedInvoiceId ? 'Created' : 'Not yet'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {status === 'draft' || status === 'sent' ? (
                      <>
                        <Link
                          href={`/new-invoice?quoteId=${quote.id}`}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-2xl font-medium text-center"
                        >
                          Convert to Invoice
                        </Link>

                        <Link
                          href={`/new-quote?quoteId=${quote.id}`}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-2xl font-medium text-center"
                        >
                          Edit Quote
                        </Link>
                      </>
                    ) : status === 'converted' ? (
                      <>
                        <div className="w-full bg-blue-500/10 border border-blue-500/20 text-blue-300 py-3 rounded-2xl font-medium text-center">
                          Already Converted
                        </div>

                        <Link
                          href={`/new-quote?quoteId=${quote.id}`}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-2xl font-medium text-center"
                        >
                          Edit Quote
                        </Link>

                        {quote.convertedInvoiceId ? (
                          <Link
                            href={`/new-invoice?invoiceId=${quote.convertedInvoiceId}`}
                            className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-3 rounded-2xl font-medium text-center"
                          >
                            View Linked Invoice
                          </Link>
                        ) : (
                          <Link
                            href="/invoices"
                            className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-3 rounded-2xl font-medium text-center"
                          >
                            View Invoices
                          </Link>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-full bg-red-500/10 border border-red-500/20 text-red-300 py-3 rounded-2xl font-medium text-center">
                          Quote Expired
                        </div>

                        <Link
                          href={`/new-quote?quoteId=${quote.id}`}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-2xl font-medium text-center"
                        >
                          Edit Quote
                        </Link>
                      </>
                    )}

                    <Link
                      href={`/new-quote?duplicateFrom=${quote.id}`}
                      className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-3 rounded-2xl font-medium text-center"
                    >
                      Create Similar Quote
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}