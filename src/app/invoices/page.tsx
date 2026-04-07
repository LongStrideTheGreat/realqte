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
  nextDue?: any;
  dueDate?: any;
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  sourceQuoteNumber?: string | null;
  createdFromQuote?: boolean;
  inventoryAdjusted?: boolean;
  inventoryAdjustedAt?: any;
  items?: InvoiceItemType[];
  currencyCode?: string;
  currencyLocale?: string;
  sentAt?: any;
  updatedAt?: any;
  isPublic?: boolean;
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
  businessName?: string;
  ownerName?: string;
  businessEmail?: string;
  currencyCode?: string;
  currencyLocale?: string;
};

type FollowUpState = {
  needsFollowUp: boolean;
  reason: string | null;
  priority: 'high' | 'medium' | 'low' | null;
  ageDays: number;
};

const PROD_BASE_URL = 'https://realqte.com';

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

function statusBadgeClasses(status: 'paid' | 'sent' | 'unpaid') {
  if (status === 'paid') {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
  }

  if (status === 'sent') {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
  }

  return 'bg-red-500/15 text-red-300 border-red-500/20';
}

function diffInDays(from: Date, to = new Date()) {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function getDueDate(invoice: InvoiceType) {
  return invoice.recurring && invoice.nextDue
    ? toDate(invoice.nextDue)
    : toDate(invoice.dueDate || invoice.nextDue);
}

function getFollowUpState(invoice: InvoiceType): FollowUpState {
  const now = new Date();
  const status = getInvoiceStatus(invoice);

  if (status === 'sent') {
    const sentDate = toDate(invoice.sentAt) || toDate(invoice.updatedAt) || toDate(invoice.createdAt);
    if (sentDate) {
      const ageDays = diffInDays(sentDate, now);
      if (ageDays >= 7) {
        return {
          needsFollowUp: true,
          reason: `Sent ${ageDays} day${ageDays === 1 ? '' : 's'} ago and still unpaid.`,
          priority: ageDays >= 14 ? 'high' : 'medium',
          ageDays,
        };
      }
    }
  }

  if (status === 'unpaid') {
    const dueDate = getDueDate(invoice);

    if (dueDate) {
      const daysUntilDue = diffInDays(now, dueDate);

      if (daysUntilDue > 0) {
        return {
          needsFollowUp: true,
          reason: `Overdue by ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`,
          priority: 'high',
          ageDays: daysUntilDue,
        };
      }

      if (daysUntilDue >= -3 && daysUntilDue <= 0) {
        return {
          needsFollowUp: true,
          reason:
            daysUntilDue === 0
              ? 'Due today.'
              : `Due in ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'}.`,
          priority: 'medium',
          ageDays: Math.abs(daysUntilDue),
        };
      }
    }
  }

  return {
    needsFollowUp: false,
    reason: null,
    priority: null,
    ageDays: 0,
  };
}

function followUpBadgeClasses(priority: 'high' | 'medium' | 'low' | null) {
  if (priority === 'high') return 'bg-red-500/15 text-red-300 border-red-500/20';
  if (priority === 'medium') return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
  if (priority === 'low') return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
  return 'bg-zinc-800 text-zinc-300 border-zinc-700';
}

function getBaseUrl() {
  if (typeof window === 'undefined') return PROD_BASE_URL;
  const { origin, hostname } = window.location;
  return hostname.includes('localhost') || hostname.includes('127.0.0.1') ? origin : PROD_BASE_URL;
}

function getPublicDocLink(type: 'quote' | 'invoice', id: string) {
  const baseUrl = getBaseUrl();
  return `${baseUrl}/${type === 'quote' ? 'q' : 'i'}/${id}`;
}

function isValidEmail(value?: string) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    alert('Link copied to clipboard.');
  } catch (err) {
    console.error('Failed to copy link:', err);
    alert('Could not copy the link.');
  }
}

function buildInvoiceEmailHref({
  clientName,
  clientEmail,
  businessName,
  ownerName,
  businessEmail,
  invoiceNumber,
  publicLink,
  totalText,
  dueDateText,
}: {
  clientName?: string;
  clientEmail?: string;
  businessName?: string;
  ownerName?: string;
  businessEmail?: string;
  invoiceNumber?: string;
  publicLink: string;
  totalText?: string;
  dueDateText?: string;
}) {
  const subject = `Invoice ${invoiceNumber || ''} from ${businessName || 'RealQte'}`.trim();

  const body = [
    `Hello ${clientName || ''},`.trim(),
    '',
    'Please view your invoice using the secure link below:',
    publicLink,
    '',
    invoiceNumber ? `Invoice Number: ${invoiceNumber}` : '',
    dueDateText ? `Due Date: ${dueDateText}` : '',
    totalText ? `Total: ${totalText}` : '',
    '',
    'Kind regards,',
    ownerName || businessName || 'RealQte',
    businessEmail || '',
  ]
    .filter(Boolean)
    .join('\n');

  return `mailto:${clientEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildInvoiceWhatsAppText({
  clientName,
  businessName,
  invoiceNumber,
  publicLink,
  totalText,
  dueDateText,
}: {
  clientName?: string;
  businessName?: string;
  invoiceNumber?: string;
  publicLink: string;
  totalText?: string;
  dueDateText?: string;
}) {
  return [
    `Hi ${clientName || ''},`.trim(),
    '',
    `Please view your invoice${invoiceNumber ? ` ${invoiceNumber}` : ''} from ${businessName || 'RealQte'} here:`,
    publicLink,
    '',
    dueDateText ? `Due date: ${dueDateText}` : '',
    totalText ? `Total: ${totalText}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export default function InvoicesPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [invoices, setInvoices] = useState<InvoiceType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'paid' | 'sent' | 'unpaid' | 'follow_up'
  >('all');
  const [loading, setLoading] = useState(true);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sharingInvoiceId, setSharingInvoiceId] = useState<string | null>(null);

  const { currencyCode } = useMemo(() => getCurrencyConfig(profile), [profile]);

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
            businessName: incomingProfile.businessName || '',
            ownerName: incomingProfile.ownerName || '',
            businessEmail: incomingProfile.businessEmail || '',
            currencyCode: incomingProfile.currencyCode || 'ZAR',
            currencyLocale: incomingProfile.currencyLocale || 'en-ZA',
          });
        } else {
          setProfile({
            businessName: '',
            ownerName: '',
            businessEmail: '',
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
      const followUp = getFollowUpState(inv);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'follow_up' ? followUp.needsFollowUp : invoiceStatus === statusFilter);

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
    const followUp = invoices.filter((inv) => getFollowUpState(inv).needsFollowUp).length;
    const totalValue = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);

    return { total, paid, sent, unpaid, followUp, totalValue };
  }, [invoices]);

  const getCustomerName = (inv: InvoiceType) => {
    if (inv.customerId) {
      const customer = customers.find((c) => c.id === inv.customerId);
      if (customer?.name) return customer.name;
    }

    return inv.client || 'Unknown Customer';
  };

  const updateLocalInvoice = (invoiceId: string, payload: Partial<InvoiceType>) => {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              ...payload,
            }
          : inv
      )
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

      const payload: Partial<InvoiceType> = {
        paid: nextPaid,
        status: nextStatus,
        paymentStatus: nextPaymentStatus,
        inventoryAdjusted: nextPaid ? true : invoice.inventoryAdjusted,
        inventoryAdjustedAt: nextPaid ? Timestamp.now() : invoice.inventoryAdjustedAt,
        updatedAt: Timestamp.now(),
      };

      await updateDoc(doc(db, 'documents', invoiceId), payload as any);
      updateLocalInvoice(invoiceId, payload);
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

      const payload: Partial<InvoiceType> = {
        status: 'sent',
        paymentStatus: 'unpaid',
        paid: false,
        sentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await updateDoc(doc(db, 'documents', invoiceId), payload as any);
      updateLocalInvoice(invoiceId, payload);
    } catch (err) {
      console.error('Failed to mark invoice as sent:', err);
      alert('Failed to mark invoice as sent.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const ensureInvoiceReadyForSharing = async (invoice: InvoiceType) => {
    const currentStatus = getInvoiceStatus(invoice);
    const now = Timestamp.now();

    const payload: Record<string, any> = {
      isPublic: true,
      updatedAt: now,
    };

    if (currentStatus === 'unpaid') {
      payload.status = 'sent';
      payload.paymentStatus = 'unpaid';
      payload.paid = false;
      payload.sentAt = invoice.sentAt || now;
    }

    const hasChanges = Object.keys(payload).some((key) => {
      if (key === 'isPublic') return invoice.isPublic !== true;
      if (key === 'status') return String(invoice.status || '').toLowerCase() !== 'sent';
      if (key === 'sentAt') return !invoice.sentAt;
      return true;
    });

    if (hasChanges) {
      await updateDoc(doc(db, 'documents', invoice.id), payload);
      updateLocalInvoice(invoice.id, payload);
    }

    const mergedInvoice: InvoiceType = {
      ...invoice,
      ...payload,
    };

    return {
      invoice: mergedInvoice,
      publicLink: getPublicDocLink('invoice', invoice.id),
    };
  };

  const handleViewPublic = async (invoice: InvoiceType) => {
    try {
      setSharingInvoiceId(invoice.id);
      const { publicLink } = await ensureInvoiceReadyForSharing(invoice);
      window.open(publicLink, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open public invoice:', err);
      alert('Failed to open the public invoice link.');
    } finally {
      setSharingInvoiceId(null);
    }
  };

  const handleCopyPublicLink = async (invoice: InvoiceType) => {
    try {
      setSharingInvoiceId(invoice.id);
      const { publicLink } = await ensureInvoiceReadyForSharing(invoice);
      await copyToClipboard(publicLink);
    } catch (err) {
      console.error('Failed to copy invoice link:', err);
      alert('Failed to copy the public invoice link.');
    } finally {
      setSharingInvoiceId(null);
    }
  };

  const handleEmailClient = async (invoice: InvoiceType) => {
    const email = invoice.clientEmail?.trim() || '';

    if (!email) {
      alert('This invoice does not have a client email yet.');
      return;
    }

    if (!isValidEmail(email)) {
      alert('Please add a valid client email before using Email Client.');
      return;
    }

    try {
      setSharingInvoiceId(invoice.id);
      const { invoice: mergedInvoice, publicLink } = await ensureInvoiceReadyForSharing(invoice);

      const dueDateText = getDueDate(mergedInvoice)?.toLocaleDateString() || '';
      const totalText = formatInvoiceMoney(mergedInvoice, profile);

      const href = buildInvoiceEmailHref({
        clientName: getCustomerName(mergedInvoice),
        clientEmail: email,
        businessName: profile.businessName,
        ownerName: profile.ownerName,
        businessEmail: profile.businessEmail,
        invoiceNumber: mergedInvoice.number,
        publicLink,
        totalText,
        dueDateText,
      });

      window.location.href = href;
    } catch (err) {
      console.error('Failed to open email client:', err);
      alert('Failed to open the email client for this invoice.');
    } finally {
      setSharingInvoiceId(null);
    }
  };

  const handleWhatsAppShare = async (invoice: InvoiceType) => {
    try {
      setSharingInvoiceId(invoice.id);
      const { invoice: mergedInvoice, publicLink } = await ensureInvoiceReadyForSharing(invoice);

      const dueDateText = getDueDate(mergedInvoice)?.toLocaleDateString() || '';
      const totalText = formatInvoiceMoney(mergedInvoice, profile);

      const message = buildInvoiceWhatsAppText({
        clientName: getCustomerName(mergedInvoice),
        businessName: profile.businessName,
        invoiceNumber: mergedInvoice.number,
        publicLink,
        totalText,
        dueDateText,
      });

      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open WhatsApp share:', err);
      alert('Failed to open WhatsApp sharing for this invoice.');
    } finally {
      setSharingInvoiceId(null);
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
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
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
      <header className="bg-zinc-900/95 backdrop-blur border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-2xl sm:text-[28px] font-bold text-emerald-400 whitespace-nowrap">
                RealQte
              </h1>
              <span className="text-[11px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                SA
              </span>
            </div>

            <nav className="hidden xl:flex items-center gap-6 text-sm">
              <Link href="/" className="text-zinc-300 hover:text-white">
                Dashboard
              </Link>
              <Link href="/customers" className="text-zinc-300 hover:text-white">
                Customers
              </Link>
              <Link href="/products" className="text-zinc-300 hover:text-white">
                Products
              </Link>
              <Link href="/quotes" className="text-zinc-300 hover:text-white">
                Quotes
              </Link>
              <Link href="/invoices" className="text-emerald-400 font-medium">
                Invoices
              </Link>
              <Link href="/accounting" className="text-zinc-300 hover:text-white">
                Accounting
              </Link>
              <Link href="/reporting" className="text-zinc-300 hover:text-white">
                Reports
              </Link>
              <Link href="/profile" className="text-zinc-300 hover:text-white">
                Profile
              </Link>
              <button onClick={handleLogout} className="text-red-400 hover:text-red-300">
                Logout
              </button>
            </nav>

            <button
              className="xl:hidden inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? 'Close' : 'Menu'}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="xl:hidden mt-3 border-t border-zinc-800 pt-3">
              <div className="grid gap-2 text-sm">
                <Link
                  href="/"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/customers"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Customers
                </Link>
                <Link
                  href="/products"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Products
                </Link>
                <Link
                  href="/quotes"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Quotes
                </Link>
                <Link
                  href="/invoices"
                  className="text-emerald-400"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Invoices
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
                <button onClick={handleLogout} className="text-left text-red-400 hover:text-red-300">
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] mb-2">Invoice tracking</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Invoices</h1>
            <p className="text-zinc-400 mt-2 text-sm sm:text-base">
              Manage outstanding invoices, share public payment-ready links, and stay on top of follow-ups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-zinc-400">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2">
              Follow-ups <span className="text-white font-medium">{stats.followUp}</span>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2">
              Total value{' '}
              <span className="text-white font-medium">
                {formatMoney(stats.totalValue, currencyCode, profile.currencyLocale || 'en-ZA')}
              </span>
            </div>
            <Link
              href="/new-invoice"
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 font-medium text-white"
            >
              New Invoice
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total', value: stats.total, tone: 'text-white' },
            { label: 'Paid', value: stats.paid, tone: 'text-emerald-300' },
            { label: 'Sent', value: stats.sent, tone: 'text-amber-300' },
            { label: 'Unpaid', value: stats.unpaid, tone: 'text-red-300' },
            { label: 'Follow-up', value: stats.followUp, tone: 'text-orange-300' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{item.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Search invoice number, client or email"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />

            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name || customer.email || 'Unnamed Customer'}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'paid' | 'sent' | 'unpaid' | 'follow_up')
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All statuses</option>
              <option value="follow_up">Needs Follow-Up</option>
              <option value="paid">Paid</option>
              <option value="sent">Sent</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-zinc-500 text-sm">No invoices found for the selected filters.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredInvoices.map((inv) => {
              const invoiceStatus = getInvoiceStatus(inv);
              const followUp = getFollowUpState(inv);
              const createdDate = toDate(inv.createdAt);
              const dueDate = getDueDate(inv);
              const shareBusy = sharingInvoiceId === inv.id;

              return (
                <div
                  key={inv.id}
                  className="bg-zinc-900 rounded-2xl p-4 sm:p-5 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-base truncate">
                        {inv.number || 'Invoice'}
                      </div>
                      <div className="text-sm text-zinc-400 mt-1 truncate">{getCustomerName(inv)}</div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClasses(invoiceStatus)}`}
                    >
                      {invoiceStatus.charAt(0).toUpperCase() + invoiceStatus.slice(1)}
                    </span>
                  </div>

                  {followUp.needsFollowUp && (
                    <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${followUpBadgeClasses(followUp.priority)}`}
                        >
                          {followUp.priority === 'high' ? 'High priority' : 'Needs follow-up'}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {followUp.ageDays} day{followUp.ageDays === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300">{followUp.reason}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-zinc-300 mb-4">
                    <div className="text-zinc-500">Total</div>
                    <div className="text-right font-medium text-white">{formatInvoiceMoney(inv, profile)}</div>

                    <div className="text-zinc-500">Email</div>
                    <div className="text-right truncate">{inv.clientEmail || '—'}</div>

                    <div className="text-zinc-500">Created</div>
                    <div className="text-right">{createdDate?.toLocaleDateString() || inv.date || '—'}</div>

                    <div className="text-zinc-500">Due</div>
                    <div className="text-right">{dueDate?.toLocaleDateString() || '—'}</div>

                    <div className="text-zinc-500">Recurring</div>
                    <div className="text-right">{inv.recurring ? 'Yes' : 'No'}</div>

                    <div className="text-zinc-500">Public link</div>
                    <div className="text-right">{inv.isPublic ? 'Ready' : 'Not shared yet'}</div>

                    <div className="text-zinc-500">From quote</div>
                    <div className="text-right">
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
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <button
                      type="button"
                      onClick={() => handleViewPublic(inv)}
                      disabled={shareBusy}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {shareBusy ? 'Working...' : 'View Public'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyPublicLink(inv)}
                      disabled={shareBusy}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      Copy Link
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEmailClient(inv)}
                      disabled={shareBusy}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      Email Client
                    </button>

                    <button
                      type="button"
                      onClick={() => handleWhatsAppShare(inv)}
                      disabled={shareBusy}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      WhatsApp
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    <Link
                      href={`/new-invoice?invoiceId=${inv.id}`}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-medium text-sm text-center"
                    >
                      Edit Invoice
                    </Link>

                    {invoiceStatus === 'paid' ? (
                      <button
                        onClick={() => togglePaidStatus(inv.id, true)}
                        disabled={updatingStatusId === inv.id || shareBusy}
                        className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 text-white py-2.5 rounded-xl font-medium text-sm"
                      >
                        {updatingStatusId === inv.id ? 'Updating...' : 'Mark as Unpaid'}
                      </button>
                    ) : (
                      <button
                        onClick={() => togglePaidStatus(inv.id, false)}
                        disabled={updatingStatusId === inv.id || shareBusy}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white py-2.5 rounded-xl font-medium text-sm"
                      >
                        {updatingStatusId === inv.id ? 'Updating...' : 'Mark as Paid'}
                      </button>
                    )}

                    {invoiceStatus !== 'sent' && invoiceStatus !== 'paid' && (
                      <button
                        onClick={() => markAsSent(inv.id)}
                        disabled={updatingStatusId === inv.id || shareBusy}
                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white py-2.5 rounded-xl font-medium text-sm"
                      >
                        {updatingStatusId === inv.id ? 'Updating...' : 'Mark as Sent'}
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteInvoice(inv.id, inv.number)}
                      disabled={deletingInvoiceId === inv.id || shareBusy}
                      className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white py-2.5 rounded-xl font-medium text-sm"
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