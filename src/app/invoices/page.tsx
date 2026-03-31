'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';

type InvoiceItemType = {
  productId?: string | null;
  desc?: string;
  qty?: number;
  rate?: number;
  unit?: string;
};

type InvoiceType = {
  id: string;
  userId?: string;
  type?: string;
  number?: string;
  client?: string;
  clientEmail?: string;
  customerId?: string | null;
  total?: string | number;
  createdAt?: any;
  date?: string;
  paid?: boolean;
  paymentStatus?: string;
  status?: string;
  recurring?: boolean;
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  sourceQuoteNumber?: string | null;
  createdFromQuote?: boolean;
  inventoryAdjusted?: boolean;
  inventoryAdjustedAt?: any;
  items?: InvoiceItemType[];
  currencyCode?: string;
  currencyLocale?: string;
};

type CustomerType = {
  id: string;
  name?: string;
  email?: string;
};

type StockProductType = {
  id: string;
  itemType?: 'service' | 'product';
  stockQty?: number;
  trackInventory?: boolean;
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

function isInvoicePaid(invoice: InvoiceType) {
  return (
    invoice.paid === true ||
    String(invoice.paymentStatus || '').toLowerCase() === 'paid' ||
    String(invoice.status || '').toLowerCase() === 'paid'
  );
}

function getInvoiceStatus(invoice: InvoiceType): 'paid' | 'sent' | 'unpaid' {
  if (isInvoicePaid(invoice)) return 'paid';
  if (String(invoice.status || '').toLowerCase() === 'sent') return 'sent';
  return 'unpaid';
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

function formatInvoiceMoney(invoice: InvoiceType, profile: ProfileType) {
  const fallback = getCurrencyConfig(profile);

  return formatMoney(
    invoice.total,
    invoice.currencyCode || fallback.currencyCode,
    invoice.currencyLocale || fallback.currencyLocale
  );
}

export default function InvoicesPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [invoices, setInvoices] = useState<InvoiceType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'sent' | 'unpaid'>('all');
  const [loading, setLoading] = useState(true);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          setProfile({
            currencyCode: incomingProfile.currencyCode || 'ZAR',
            currencyLocale: incomingProfile.currencyLocale || 'en-ZA',
          });
        } else {
          setProfile({
            currencyCode: 'ZAR',
            currencyLocale: 'en-ZA',
          });
        }

        const [invoiceSnap, customerSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'documents'),
              where('userId', '==', u.uid),
              where('type', '==', 'invoice'),
              orderBy('createdAt', 'desc')
            )
          ),
          getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid))),
        ]);

        setInvoices(invoiceSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as InvoiceType[]);
        setCustomers(customerSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[]);
      } catch (err) {
        console.error('Failed to load invoices:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const term = searchTerm.trim().toLowerCase();

      const matchesSearch =
        !term ||
        inv.number?.toLowerCase().includes(term) ||
        inv.client?.toLowerCase().includes(term) ||
        inv.clientEmail?.toLowerCase().includes(term);

      const invoiceStatus = getInvoiceStatus(inv);
      const matchesStatus = statusFilter === 'all' || invoiceStatus === statusFilter;

      const matchesCustomer =
        !selectedCustomerId ||
        inv.customerId === selectedCustomerId ||
        customers.some(
          (customer) =>
            customer.id === selectedCustomerId &&
            customer.name &&
            inv.client &&
            customer.name.trim().toLowerCase() === inv.client.trim().toLowerCase()
        );

      return matchesSearch && matchesStatus && matchesCustomer;
    });
  }, [invoices, searchTerm, statusFilter, selectedCustomerId, customers]);

  const stats = useMemo(() => {
    const total = invoices.length;
    const paid = invoices.filter((inv) => getInvoiceStatus(inv) === 'paid').length;
    const sent = invoices.filter((inv) => getInvoiceStatus(inv) === 'sent').length;
    const unpaid = invoices.filter((inv) => getInvoiceStatus(inv) === 'unpaid').length;

    return { total, paid, sent, unpaid };
  }, [invoices]);

  const getCustomerName = (inv: InvoiceType) => {
    if (inv.customerId) {
      const customer = customers.find((c) => c.id === inv.customerId);
      if (customer?.name) return customer.name;
    }

    return inv.client || 'Unknown Customer';
  };

  const getStatusBadge = (inv: InvoiceType) => {
    const status = getInvoiceStatus(inv);

    if (status === 'paid') {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
          Paid
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
      <span className="inline-flex items-center rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
        Unpaid
      </span>
    );
  };

  const adjustInventoryForInvoice = async (invoice: InvoiceType) => {
    if (!invoice.items || invoice.items.length === 0) return false;

    const batch = writeBatch(db);
    let hasAdjustments = false;

    for (const item of invoice.items) {
      if (!item.productId) continue;

      const qtyToDeduct = Number(item.qty || 0);
      if (qtyToDeduct <= 0) continue;

      const productRef = doc(db, 'products', item.productId);
      const productSnap = await getDoc(productRef);

      if (!productSnap.exists()) continue;

      const productData = productSnap.data() as StockProductType;

      if (productData.itemType !== 'product') continue;
      if (productData.trackInventory === false) continue;

      const currentStock = Number(productData.stockQty || 0);
      const nextStock = currentStock - qtyToDeduct;

      batch.update(productRef, {
        stockQty: nextStock,
        updatedAt: Timestamp.now(),
      });

      hasAdjustments = true;
    }

    if (hasAdjustments) {
      const invoiceRef = doc(db, 'documents', invoice.id);

      batch.update(invoiceRef, {
        inventoryAdjusted: true,
        inventoryAdjustedAt: Timestamp.now(),
      });

      await batch.commit();
    }

    return hasAdjustments;
  };

  const togglePaidStatus = async (invoiceId: string, currentlyPaid: boolean) => {
    try {
      setUpdatingStatusId(invoiceId);

      const invoice = invoices.find((inv) => inv.id === invoiceId);
      if (!invoice) return;

      const nextPaid = !currentlyPaid;
      const nextStatus = nextPaid ? 'paid' : 'sent';
      const nextPaymentStatus = nextPaid ? 'paid' : 'unpaid';

      if (nextPaid && invoice.inventoryAdjusted !== true) {
        await adjustInventoryForInvoice(invoice);
      }

      await updateDoc(doc(db, 'documents', invoiceId), {
        paid: nextPaid,
        status: nextStatus,
        paymentStatus: nextPaymentStatus,
        updatedAt: Timestamp.now(),
      });

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                paid: nextPaid,
                status: nextStatus,
                paymentStatus: nextPaymentStatus,
                inventoryAdjusted: nextPaid ? true : inv.inventoryAdjusted,
                inventoryAdjustedAt: nextPaid ? Timestamp.now() : inv.inventoryAdjustedAt,
              }
            : inv
        )
      );
    } catch (err) {
      console.error('Failed to update invoice status:', err);
      alert('Failed to update invoice payment status.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const markAsSent = async (invoiceId: string) => {
    try {
      setUpdatingStatusId(invoiceId);

      await updateDoc(doc(db, 'documents', invoiceId), {
        status: 'sent',
        paymentStatus: 'unpaid',
        paid: false,
        updatedAt: Timestamp.now(),
      });

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, status: 'sent', paymentStatus: 'unpaid', paid: false }
            : inv
        )
      );
    } catch (err) {
      console.error('Failed to mark invoice as sent:', err);
      alert('Failed to mark invoice as sent.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string, invoiceNumber?: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${invoiceNumber || 'this invoice'}? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingInvoiceId(invoiceId);
      await deleteDoc(doc(db, 'documents', invoiceId));
      setInvoices((prev) => prev.filter((invoice) => invoice.id !== invoiceId));
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      alert('Failed to delete invoice.');
    } finally {
      setDeletingInvoiceId(null);
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
        Loading invoices.
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
              <Link href="/invoices" className="text-emerald-400 font-medium">
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
                <Link href="/invoices" className="text-emerald-400 font-medium" onClick={() => setMobileMenuOpen(false)}>
                  Invoices
                </Link>
                <Link href="/customers" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Customers
                </Link>
                <Link href="/accounting" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Accounting
                </Link>
                <Link href="/reporting" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Reports
                </Link>
                <Link href="/profile" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Profile
                </Link>
                <button onClick={handleLogout} className="text-left text-red-400 hover:underline">
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <p className="text-zinc-400 text-sm mb-2">Invoice management</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">Invoices</h1>
            <p className="text-zinc-400 mt-2">
              View saved invoices, edit them, and track payment status.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-3">
            <div className="text-sm text-zinc-400">
              Default display currency:{' '}
              <span className="text-white font-medium">
                {currencyCode} ({currencyLocale})
              </span>
            </div>

            <Link
              href="/new-invoice"
              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-6 rounded-2xl font-medium w-full md:w-auto"
            >
              Create New Invoice
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Total invoices</p>
            <p className="text-4xl font-bold mt-2">{stats.total}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Paid invoices</p>
            <p className="text-4xl font-bold mt-2 text-emerald-400">{stats.paid}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Sent invoices</p>
            <p className="text-4xl font-bold mt-2 text-amber-400">{stats.sent}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Unpaid invoices</p>
            <p className="text-4xl font-bold mt-2 text-red-400">{stats.unpaid}</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Search by invoice number, client name or email."
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
                setStatusFilter(e.target.value as 'all' | 'paid' | 'sent' | 'unpaid')
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid Only</option>
              <option value="sent">Sent Only</option>
              <option value="unpaid">Unpaid Only</option>
            </select>
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center">
            <p className="text-zinc-500">No invoices found for the selected filters.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredInvoices.map((inv) => {
              const invoiceStatus = getInvoiceStatus(inv);

              return (
                <div
                  key={inv.id}
                  className="bg-zinc-900 rounded-3xl p-6 hover:bg-zinc-800 transition-all border border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="font-medium text-white text-lg">
                        {inv.number || 'Invoice'}
                      </div>
                      <div className="text-sm text-zinc-400 mt-1">
                        {getCustomerName(inv)}
                      </div>
                    </div>
                    {getStatusBadge(inv)}
                  </div>

                  <div className="space-y-2 text-sm text-zinc-300 mb-5">
                    <div className="flex justify-between gap-4">
                      <span>Total</span>
                      <span className="font-medium text-white">
                        {formatInvoiceMoney(inv, profile)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Email</span>
                      <span className="text-right break-all">{inv.clientEmail || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Date</span>
                      <span>{inv.date || toDate(inv.createdAt)?.toLocaleDateString() || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Recurring</span>
                      <span>{inv.recurring ? 'Yes' : 'No'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Source Quote</span>
                      <span className="text-right">
                        {inv.sourceDocumentId ? (
                          <Link
                            href={`/new-quote?quoteId=${inv.sourceDocumentId}`}
                            className="text-blue-400 hover:underline"
                          >
                            {inv.sourceQuoteNumber || 'View Quote'}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <Link
                      href={`/new-invoice?invoiceId=${inv.id}`}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-2xl font-medium text-center"
                    >
                      Edit Invoice
                    </Link>

                    {invoiceStatus === 'paid' ? (
                      <button
                        onClick={() => togglePaidStatus(inv.id, true)}
                        disabled={updatingStatusId === inv.id}
                        className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 text-white py-3 rounded-2xl font-medium"
                      >
                        {updatingStatusId === inv.id ? 'Updating...' : 'Mark as Unpaid'}
                      </button>
                    ) : (
                      <button
                        onClick={() => togglePaidStatus(inv.id, false)}
                        disabled={updatingStatusId === inv.id}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white py-3 rounded-2xl font-medium"
                      >
                        {updatingStatusId === inv.id ? 'Updating...' : 'Mark as Paid'}
                      </button>
                    )}

                    {invoiceStatus !== 'sent' && invoiceStatus !== 'paid' && (
                      <button
                        onClick={() => markAsSent(inv.id)}
                        disabled={updatingStatusId === inv.id}
                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white py-3 rounded-2xl font-medium"
                      >
                        {updatingStatusId === inv.id ? 'Updating...' : 'Mark as Sent'}
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteInvoice(inv.id, inv.number)}
                      disabled={deletingInvoiceId === inv.id}
                      className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white py-3 rounded-2xl font-medium"
                    >
                      {deletingInvoiceId === inv.id ? 'Deleting...' : 'Delete Invoice'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}