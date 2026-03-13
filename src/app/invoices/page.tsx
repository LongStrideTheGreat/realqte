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
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';

type InvoiceType = {
  id: string;
  userId?: string;
  type?: string;
  number?: string;
  client?: string;
  clientEmail?: string;
  customerId?: string | null;
  total?: string;
  createdAt?: any;
  paid?: boolean;
  paymentStatus?: string;
  status?: string;
  recurring?: boolean;
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  createdFromQuote?: boolean;
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

function isInvoicePaid(invoice: InvoiceType) {
  return (
    invoice.paid === true ||
    String(invoice.paymentStatus || '').toLowerCase() === 'paid' ||
    String(invoice.status || '').toLowerCase() === 'paid'
  );
}

export default function AllInvoices() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [invoices, setInvoices] = useState<InvoiceType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [loading, setLoading] = useState(true);
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      try {
        setUser(u);

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

      const paid = isInvoicePaid(inv);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'paid' && paid) ||
        (statusFilter === 'unpaid' && !paid);

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

  const paidCount = useMemo(
    () => invoices.filter((invoice) => isInvoicePaid(invoice)).length,
    [invoices]
  );

  const unpaidCount = useMemo(
    () => invoices.filter((invoice) => !isInvoicePaid(invoice)).length,
    [invoices]
  );

  const markInvoicePaymentStatus = async (invoiceId: string, paid: boolean) => {
    try {
      setUpdatingInvoiceId(invoiceId);

      await updateDoc(doc(db, 'documents', invoiceId), {
        paid,
        paymentStatus: paid ? 'paid' : 'unpaid',
        status: paid ? 'paid' : 'unpaid',
        updatedAt: Timestamp.now(),
      });

      setInvoices((prev) =>
        prev.map((invoice) =>
          invoice.id === invoiceId
            ? {
                ...invoice,
                paid,
                paymentStatus: paid ? 'paid' : 'unpaid',
                status: paid ? 'paid' : 'unpaid',
              }
            : invoice
        )
      );
    } catch (err) {
      console.error('Failed to update payment status:', err);
      alert('Could not update invoice payment status.');
    } finally {
      setUpdatingInvoiceId(null);
    }
  };

  const getCustomerName = (invoice: InvoiceType) => {
    if (invoice.customerId) {
      const customer = customers.find((c) => c.id === invoice.customerId);
      if (customer?.name) return customer.name;
    }
    return invoice.client || 'Unknown Customer';
  };

  const getStatusBadge = (invoice: InvoiceType) => {
    const paid = isInvoicePaid(invoice);

    if (paid) {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
          Paid
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
        Unpaid
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading invoices...
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
            <Link href="/customers" className="text-zinc-400 hover:text-white">
              Customers
            </Link>
            <Link href="/quotes" className="text-zinc-400 hover:text-white">Quotes</Link>
            <Link href="/products" className="text-zinc-400 hover:text-white">
  Products
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
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">All Invoices</h1>
            <p className="text-zinc-400">
              View, filter and manage invoices by customer and payment status.
            </p>
          </div>

          <Link
            href="/new-invoice"
            className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-6 rounded-2xl font-medium"
          >
            Create New Invoice
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Total invoices</p>
            <p className="text-4xl font-bold mt-2">{invoices.length}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Paid invoices</p>
            <p className="text-4xl font-bold mt-2 text-emerald-400">{paidCount}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Unpaid invoices</p>
            <p className="text-4xl font-bold mt-2 text-red-400">{unpaidCount}</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Search by invoice number, client name or email..."
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
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'paid' | 'unpaid')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid Only</option>
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
              const paid = isInvoicePaid(inv);

              return (
                <div
                  key={inv.id}
                  className="bg-zinc-900 rounded-3xl p-6 hover:bg-zinc-800 transition-all border border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="font-medium text-white text-lg">{inv.number || 'Invoice'}</div>
                      <div className="text-sm text-zinc-400 mt-1">
                        {getCustomerName(inv)}
                      </div>
                    </div>
                    {getStatusBadge(inv)}
                  </div>

                  <div className="space-y-2 text-sm text-zinc-300 mb-5">
                    <div className="flex justify-between gap-4">
                      <span>Total</span>
                      <span className="font-medium text-white">R{inv.total || '0.00'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Email</span>
                      <span className="text-right">{inv.clientEmail || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Date</span>
                      <span>{toDate(inv.createdAt)?.toLocaleDateString() || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Recurring</span>
                      <span>{inv.recurring ? 'Yes' : 'No'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Source</span>
                      <span>
                        {inv.createdFromQuote || inv.sourceDocumentType === 'quote'
                          ? 'Converted from quote'
                          : 'Direct invoice'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {!paid ? (
                      <button
                        onClick={() => markInvoicePaymentStatus(inv.id, true)}
                        disabled={updatingInvoiceId === inv.id}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white py-3 rounded-2xl font-medium"
                      >
                        {updatingInvoiceId === inv.id ? 'Updating...' : 'Mark as Paid'}
                      </button>
                    ) : (
                      <button
                        onClick={() => markInvoicePaymentStatus(inv.id, false)}
                        disabled={updatingInvoiceId === inv.id}
                        className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white py-3 rounded-2xl font-medium"
                      >
                        {updatingInvoiceId === inv.id ? 'Updating...' : 'Mark as Unpaid'}
                      </button>
                    )}
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