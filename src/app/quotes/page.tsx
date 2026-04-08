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
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import AppHeader from '@/components/AppHeader';

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
  currencyCode?: string;
  currencyLocale?: string;
  sentAt?: any;
  viewedAt?: any;
  acceptedAt?: any;
  convertedAt?: any;
  lastViewedAt?: any;
  lastActivityAt?: any;
  viewCount?: number;
  isPublic?: boolean;
};

type CustomerType = {
  id: string;
  name?: string;
  email?: string;
};

type ProfileType = {
  businessName?: string;
  ownerName?: string;
  businessEmail?: string;
  currencyCode?: string;
  currencyLocale?: string;
};

type QuoteLifecycleStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'expired'
  | 'converted';

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

function isExpiredByValue(expiryValue: any) {
  const expiry = toDate(expiryValue);
  if (!expiry) return false;
  return expiry.getTime() < Date.now();
}

function getQuoteStatus(quote: QuoteType): QuoteLifecycleStatus {
  const explicitStatus = String(quote.status || '').toLowerCase();

  if (
    quote.convertedToInvoice ||
    explicitStatus === 'converted' ||
    Boolean(quote.convertedInvoiceId) ||
    Boolean(quote.convertedAt)
  ) {
    return 'converted';
  }

  if (explicitStatus === 'accepted' || Boolean(quote.acceptedAt)) {
    return 'accepted';
  }

  if (isExpiredByValue(quote.expiryDate)) {
    return 'expired';
  }

  if (explicitStatus === 'viewed' || Boolean(quote.viewedAt) || Boolean(quote.lastViewedAt)) {
    return 'viewed';
  }

  if (explicitStatus === 'sent' || Boolean(quote.sentAt)) {
    return 'sent';
  }

  return 'draft';
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

function formatQuoteMoney(quote: QuoteType, profile: ProfileType) {
  const fallback = getCurrencyConfig(profile);

  return formatMoney(
    quote.total,
    quote.currencyCode || fallback.currencyCode,
    quote.currencyLocale || fallback.currencyLocale
  );
}

function getLastActivityDate(quote: QuoteType) {
  return (
    toDate(quote.convertedAt) ||
    toDate(quote.acceptedAt) ||
    toDate(quote.lastViewedAt) ||
    toDate(quote.viewedAt) ||
    toDate(quote.sentAt) ||
    toDate(quote.updatedAt) ||
    toDate(quote.createdAt)
  );
}

function getLastActivityLabel(quote: QuoteType) {
  if (quote.convertedAt || quote.convertedToInvoice || quote.status === 'converted') {
    return 'Converted';
  }
  if (quote.acceptedAt || String(quote.status || '').toLowerCase() === 'accepted') {
    return 'Accepted';
  }
  if (
    quote.lastViewedAt ||
    quote.viewedAt ||
    String(quote.status || '').toLowerCase() === 'viewed'
  ) {
    return 'Viewed';
  }
  if (quote.sentAt || String(quote.status || '').toLowerCase() === 'sent') {
    return 'Sent';
  }
  if (quote.updatedAt) {
    return 'Updated';
  }
  return 'Created';
}

function statusBadgeClasses(status: QuoteLifecycleStatus) {
  switch (status) {
    case 'converted':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
    case 'accepted':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/20';
    case 'viewed':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20';
    case 'expired':
      return 'bg-red-500/15 text-red-300 border-red-500/20';
    case 'sent':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
    default:
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
  }
}

function diffInDays(from: Date, to = new Date()) {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function getFollowUpState(quote: QuoteType): FollowUpState {
  const status = getQuoteStatus(quote);
  const now = new Date();

  if (status === 'sent') {
    const sentDate = toDate(quote.sentAt) || toDate(quote.updatedAt) || toDate(quote.createdAt);
    if (sentDate) {
      const ageDays = diffInDays(sentDate, now);
      if (ageDays >= 2) {
        return {
          needsFollowUp: true,
          reason: `Sent ${ageDays} day${ageDays === 1 ? '' : 's'} ago and still not viewed.`,
          priority: ageDays >= 5 ? 'high' : 'medium',
          ageDays,
        };
      }
    }
  }

  if (status === 'viewed') {
    const viewedDate = toDate(quote.lastViewedAt) || toDate(quote.viewedAt);
    if (viewedDate) {
      const ageDays = diffInDays(viewedDate, now);
      if (ageDays >= 3) {
        return {
          needsFollowUp: true,
          reason: `Viewed ${ageDays} day${ageDays === 1 ? '' : 's'} ago but not accepted yet.`,
          priority: ageDays >= 6 ? 'high' : 'medium',
          ageDays,
        };
      }
    }
  }

  if (status === 'accepted') {
    const acceptedDate = toDate(quote.acceptedAt);
    if (acceptedDate && !quote.convertedToInvoice && !quote.convertedInvoiceId) {
      const ageDays = diffInDays(acceptedDate, now);
      if (ageDays >= 2) {
        return {
          needsFollowUp: true,
          reason: `Accepted ${ageDays} day${ageDays === 1 ? '' : 's'} ago but not yet converted to invoice.`,
          priority: 'high',
          ageDays,
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

function buildQuoteEmailHref({
  clientName,
  clientEmail,
  businessName,
  ownerName,
  businessEmail,
  quoteNumber,
  publicLink,
  totalText,
  validUntilText,
}: {
  clientName?: string;
  clientEmail?: string;
  businessName?: string;
  ownerName?: string;
  businessEmail?: string;
  quoteNumber?: string;
  publicLink: string;
  totalText?: string;
  validUntilText?: string;
}) {
  const subject = `Quote ${quoteNumber || ''} from ${businessName || 'RealQte'}`.trim();

  const body = [
    `Hello ${clientName || ''},`.trim(),
    '',
    'Please view your quote using the secure link below:',
    publicLink,
    '',
    quoteNumber ? `Quote Number: ${quoteNumber}` : '',
    validUntilText ? `Valid Until: ${validUntilText}` : '',
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

function buildQuoteWhatsAppText({
  clientName,
  businessName,
  quoteNumber,
  publicLink,
  totalText,
  validUntilText,
}: {
  clientName?: string;
  businessName?: string;
  quoteNumber?: string;
  publicLink: string;
  totalText?: string;
  validUntilText?: string;
}) {
  return [
    `Hi ${clientName || ''},`.trim(),
    '',
    `Please view your quote${quoteNumber ? ` ${quoteNumber}` : ''} from ${businessName || 'RealQte'} here:`,
    publicLink,
    '',
    validUntilText ? `Valid until: ${validUntilText}` : '',
    totalText ? `Total: ${totalText}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export default function QuotesPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [quotes, setQuotes] = useState<QuoteType[]>([]);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'draft' | 'sent' | 'viewed' | 'accepted' | 'expired' | 'converted' | 'follow_up'
  >('all');
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);
  const [updatingQuoteId, setUpdatingQuoteId] = useState<string | null>(null);
  const [sharingQuoteId, setSharingQuoteId] = useState<string | null>(null);

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
      const followUp = getFollowUpState(quote);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'follow_up' ? followUp.needsFollowUp : quoteStatus === statusFilter);

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
    const viewed = quotes.filter((q) => getQuoteStatus(q) === 'viewed').length;
    const accepted = quotes.filter((q) => getQuoteStatus(q) === 'accepted').length;
    const expired = quotes.filter((q) => getQuoteStatus(q) === 'expired').length;
    const converted = quotes.filter((q) => getQuoteStatus(q) === 'converted').length;
    const followUp = quotes.filter((q) => getFollowUpState(q).needsFollowUp).length;
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    return { total, draft, sent, viewed, accepted, expired, converted, followUp, conversionRate };
  }, [quotes]);

  const getCustomerName = (quote: QuoteType) => {
    if (quote.customerId) {
      const customer = customers.find((c) => c.id === quote.customerId);
      if (customer?.name) return customer.name;
    }

    return quote.client || 'Unknown Customer';
  };

  const updateLocalQuote = (quoteId: string, payload: Partial<QuoteType>) => {
    setQuotes((prev) =>
      prev.map((quote) =>
        quote.id === quoteId
          ? {
              ...quote,
              ...payload,
            }
          : quote
      )
    );
  };

  const updateQuoteLifecycle = async (
    quoteId: string,
    nextStatus: Extract<QuoteLifecycleStatus, 'sent' | 'viewed' | 'accepted'>
  ) => {
    const currentQuote = quotes.find((quote) => quote.id === quoteId);
    if (!currentQuote) return;

    try {
      setUpdatingQuoteId(quoteId);

      const now = Timestamp.now();
      const payload: Record<string, any> = {
        status: nextStatus,
        updatedAt: now,
        lastActivityAt: now,
      };

      if (nextStatus === 'sent') {
        payload.sentAt = currentQuote.sentAt || now;
      }

      if (nextStatus === 'viewed') {
        payload.viewedAt = currentQuote.viewedAt || now;
        payload.lastViewedAt = now;
        payload.viewCount = Number(currentQuote.viewCount || 0) + 1;
        payload.sentAt = currentQuote.sentAt || now;
      }

      if (nextStatus === 'accepted') {
        payload.acceptedAt = currentQuote.acceptedAt || now;
        payload.sentAt = currentQuote.sentAt || now;
      }

      await updateDoc(doc(db, 'documents', quoteId), payload);
      updateLocalQuote(quoteId, payload);
    } catch (err) {
      console.error('Failed to update quote lifecycle:', err);
      alert('Failed to update quote status.');
    } finally {
      setUpdatingQuoteId(null);
    }
  };

  const ensureQuoteReadyForSharing = async (quote: QuoteType) => {
    const currentStatus = getQuoteStatus(quote);
    const now = Timestamp.now();

    const payload: Record<string, any> = {
      isPublic: true,
      updatedAt: now,
    };

    if (currentStatus === 'draft') {
      payload.status = 'sent';
      payload.sentAt = quote.sentAt || now;
      payload.lastActivityAt = now;
    }

    const hasChanges = Object.keys(payload).some((key) => {
      if (key === 'isPublic') return quote.isPublic !== true;
      if (key === 'status') return quote.status !== 'sent';
      if (key === 'sentAt') return !quote.sentAt;
      return true;
    });

    if (hasChanges) {
      await updateDoc(doc(db, 'documents', quote.id), payload);
      updateLocalQuote(quote.id, payload);
    }

    const mergedQuote: QuoteType = {
      ...quote,
      ...payload,
    };

    return {
      quote: mergedQuote,
      publicLink: getPublicDocLink('quote', quote.id),
    };
  };

  const handleViewPublic = async (quote: QuoteType) => {
    try {
      setSharingQuoteId(quote.id);
      const { publicLink } = await ensureQuoteReadyForSharing(quote);
      window.open(publicLink, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open public quote:', err);
      alert('Failed to open the public quote link.');
    } finally {
      setSharingQuoteId(null);
    }
  };

  const handleCopyPublicLink = async (quote: QuoteType) => {
    try {
      setSharingQuoteId(quote.id);
      const { publicLink } = await ensureQuoteReadyForSharing(quote);
      await copyToClipboard(publicLink);
    } catch (err) {
      console.error('Failed to copy quote link:', err);
      alert('Failed to copy the public quote link.');
    } finally {
      setSharingQuoteId(null);
    }
  };

  const handleEmailClient = async (quote: QuoteType) => {
    const email = quote.clientEmail?.trim() || '';

    if (!email) {
      alert('This quote does not have a client email yet.');
      return;
    }

    if (!isValidEmail(email)) {
      alert('Please add a valid client email before using Email Client.');
      return;
    }

    try {
      setSharingQuoteId(quote.id);
      const { quote: mergedQuote, publicLink } = await ensureQuoteReadyForSharing(quote);

      const expiryText =
        toDate(mergedQuote.expiryDate)?.toLocaleDateString() || mergedQuote.validUntilText || '';

      const totalText = formatQuoteMoney(mergedQuote, profile);

      const href = buildQuoteEmailHref({
        clientName: getCustomerName(mergedQuote),
        clientEmail: email,
        businessName: profile.businessName,
        ownerName: profile.ownerName,
        businessEmail: profile.businessEmail,
        quoteNumber: mergedQuote.number,
        publicLink,
        totalText,
        validUntilText: expiryText,
      });

      window.location.href = href;
    } catch (err) {
      console.error('Failed to open email client:', err);
      alert('Failed to open the email client for this quote.');
    } finally {
      setSharingQuoteId(null);
    }
  };

  const handleWhatsAppShare = async (quote: QuoteType) => {
    try {
      setSharingQuoteId(quote.id);
      const { quote: mergedQuote, publicLink } = await ensureQuoteReadyForSharing(quote);

      const expiryText =
        toDate(mergedQuote.expiryDate)?.toLocaleDateString() || mergedQuote.validUntilText || '';

      const totalText = formatQuoteMoney(mergedQuote, profile);

      const message = buildQuoteWhatsAppText({
        clientName: getCustomerName(mergedQuote),
        businessName: profile.businessName,
        quoteNumber: mergedQuote.number,
        publicLink,
        totalText,
        validUntilText: expiryText,
      });

      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open WhatsApp share:', err);
      alert('Failed to open WhatsApp sharing for this quote.');
    } finally {
      setSharingQuoteId(null);
    }
  };

  const handleDeleteQuote = async (quoteId: string, quoteNumber?: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${quoteNumber || 'this quote'}? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingQuoteId(quoteId);
      await deleteDoc(doc(db, 'documents', quoteId));
      setQuotes((prev) => prev.filter((quote) => quote.id !== quoteId));
    } catch (err) {
      console.error('Failed to delete quote:', err);
      alert('Failed to delete quote.');
    } finally {
      setDeletingQuoteId(null);
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
        Loading quotes.
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] mb-2">Quote tracking</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Quotes</h1>
            <p className="text-zinc-400 mt-2 text-sm sm:text-base">
              Track lifecycle, see follow-up opportunities, and convert ready deals faster.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-zinc-400">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2">
              Follow-ups <span className="text-white font-medium">{stats.followUp}</span>
            </div>
            <Link
              href="/new-quote"
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 font-medium text-white"
            >
              New Quote
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
          {[
            { label: 'Total', value: stats.total, tone: 'text-white' },
            { label: 'Draft', value: stats.draft, tone: 'text-emerald-300' },
            { label: 'Sent', value: stats.sent, tone: 'text-amber-300' },
            { label: 'Viewed', value: stats.viewed, tone: 'text-cyan-300' },
            { label: 'Accepted', value: stats.accepted, tone: 'text-violet-300' },
            { label: 'Converted', value: stats.converted, tone: 'text-blue-300' },
            { label: 'Follow-up', value: stats.followUp, tone: 'text-red-300' },
            { label: 'Win rate', value: `${stats.conversionRate}%`, tone: 'text-white' },
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
              placeholder="Search quote number, client or email"
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
                setStatusFilter(
                  e.target.value as
                    | 'all'
                    | 'draft'
                    | 'sent'
                    | 'viewed'
                    | 'accepted'
                    | 'expired'
                    | 'converted'
                    | 'follow_up'
                )
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All statuses</option>
              <option value="follow_up">Needs Follow-Up</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="accepted">Accepted</option>
              <option value="expired">Expired</option>
              <option value="converted">Converted</option>
            </select>
          </div>
        </div>

        {filteredQuotes.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-zinc-500 text-sm">No quotes found for the selected filters.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredQuotes.map((quote) => {
              const expiryDate = toDate(quote.expiryDate);
              const createdDate = toDate(quote.createdAt);
              const status = getQuoteStatus(quote);
              const lastActivityDate = getLastActivityDate(quote);
              const followUp = getFollowUpState(quote);
              const shareBusy = sharingQuoteId === quote.id;

              return (
                <div
                  key={quote.id}
                  className="bg-zinc-900 rounded-2xl p-4 sm:p-5 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-base truncate">
                        {quote.number || 'Quote'}
                      </div>
                      <div className="text-sm text-zinc-400 mt-1 truncate">{getCustomerName(quote)}</div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClasses(status)}`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
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
                    <div className="text-right font-medium text-white">{formatQuoteMoney(quote, profile)}</div>

                    <div className="text-zinc-500">Email</div>
                    <div className="text-right truncate">{quote.clientEmail || '—'}</div>

                    <div className="text-zinc-500">Created</div>
                    <div className="text-right">
                      {createdDate?.toLocaleDateString() || quote.date || '—'}
                    </div>

                    <div className="text-zinc-500">Expires</div>
                    <div className="text-right">
                      {expiryDate?.toLocaleDateString() || quote.validUntilText || '—'}
                    </div>

                    <div className="text-zinc-500">Views</div>
                    <div className="text-right">{Number(quote.viewCount || 0)}</div>

                    <div className="text-zinc-500">Last activity</div>
                    <div className="text-right">
                      {getLastActivityLabel(quote)} ·{' '}
                      {lastActivityDate ? lastActivityDate.toLocaleDateString() : '—'}
                    </div>

                    <div className="text-zinc-500">Public link</div>
                    <div className="text-right">{quote.isPublic ? 'Ready' : 'Not shared yet'}</div>

                    <div className="text-zinc-500">Invoice link</div>
                    <div className="text-right">
                      {quote.convertedInvoiceId ? (
                        <Link
                          href={`/new-invoice?invoiceId=${quote.convertedInvoiceId}`}
                          className="text-blue-400 hover:underline"
                        >
                          View invoice
                        </Link>
                      ) : status === 'converted' ? (
                        'Converted'
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => updateQuoteLifecycle(quote.id, 'sent')}
                        disabled={updatingQuoteId === quote.id || shareBusy}
                        className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 disabled:opacity-60"
                      >
                        {updatingQuoteId === quote.id ? 'Updating...' : 'Mark sent'}
                      </button>
                    )}

                    {(status === 'sent' || status === 'draft') && (
                      <button
                        type="button"
                        onClick={() => updateQuoteLifecycle(quote.id, 'viewed')}
                        disabled={updatingQuoteId === quote.id || shareBusy}
                        className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 disabled:opacity-60"
                      >
                        {updatingQuoteId === quote.id ? 'Updating...' : 'Mark viewed'}
                      </button>
                    )}

                    {(status === 'sent' || status === 'viewed') && !quote.convertedToInvoice && (
                      <button
                        type="button"
                        onClick={() => updateQuoteLifecycle(quote.id, 'accepted')}
                        disabled={updatingQuoteId === quote.id || shareBusy}
                        className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 disabled:opacity-60"
                      >
                        {updatingQuoteId === quote.id ? 'Updating...' : 'Mark accepted'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <button
                      type="button"
                      onClick={() => handleViewPublic(quote)}
                      disabled={shareBusy}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {shareBusy ? 'Working...' : 'View Public'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyPublicLink(quote)}
                      disabled={shareBusy}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      Copy Link
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEmailClient(quote)}
                      disabled={shareBusy}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      Email Client
                    </button>

                    <button
                      type="button"
                      onClick={() => handleWhatsAppShare(quote)}
                      disabled={shareBusy}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      WhatsApp
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <Link
                      href={`/new-quote?quoteId=${quote.id}`}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-medium text-sm text-center"
                    >
                      Edit quote
                    </Link>

                    {quote.convertedToInvoice || quote.convertedInvoiceId ? (
                      <button
                        type="button"
                        disabled
                        className="w-full bg-zinc-800 text-zinc-500 py-2.5 rounded-xl font-medium text-sm cursor-not-allowed"
                      >
                        Already converted
                      </button>
                    ) : (
                      <Link
                        href={`/new-invoice?quoteId=${quote.id}`}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-medium text-sm text-center"
                      >
                        Convert to invoice
                      </Link>
                    )}

                    <button
                      onClick={() => handleDeleteQuote(quote.id, quote.number)}
                      disabled={deletingQuoteId === quote.id || shareBusy}
                      className="sm:col-span-2 w-full bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white py-2.5 rounded-xl font-medium text-sm"
                    >
                      {deletingQuoteId === quote.id ? 'Deleting...' : 'Delete quote'}
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