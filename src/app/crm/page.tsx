'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

type Profile = {
  businessName?: string;
  ownerName?: string;
  phone?: string;
  businessEmail?: string;
};

type LeadStatus = 'new' | 'quoted' | 'won' | 'lost' | 'repeat';
type SortOption = 'newest' | 'oldest' | 'updated';

type LeadDoc = {
  id: string;
  userId: string;
  pageSlug?: string;
  source?: string;
  status?: LeadStatus;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  businessName?: string;
  createdAt?: any;
  updatedAt?: any;
};

type QuoteLinkInfo = {
  quoteId: string;
  quoteNumber: string;
  total: number;
  status: string;
  createdAt?: any;
};

type QuoteLinkMap = Record<string, QuoteLinkInfo>;

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

function isProfileComplete(profile: Profile) {
  return Boolean(
    profile.businessName?.trim() &&
      profile.ownerName?.trim() &&
      profile.phone?.trim() &&
      profile.businessEmail?.trim()
  );
}

function formatDate(value: any) {
  const parsed = toDate(value);
  return parsed ? parsed.toLocaleDateString() : '—';
}

function formatDateTime(value: any) {
  const parsed = toDate(value);
  return parsed ? parsed.toLocaleString() : '—';
}

function getStatusClasses(status: LeadStatus) {
  switch (status) {
    case 'quoted':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
    case 'won':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
    case 'lost':
      return 'bg-red-500/15 text-red-300 border-red-500/20';
    case 'repeat':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/20';
    default:
      return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
  }
}

function getBaseUrl() {
  if (typeof window === 'undefined') return 'https://realqte.com';
  const { origin, hostname } = window.location;
  return hostname.includes('localhost') || hostname.includes('127.0.0.1')
    ? origin
    : 'https://realqte.com';
}

function getPublicPageLink(pageSlug?: string) {
  if (!pageSlug) return '';
  return `${getBaseUrl()}/b/${pageSlug}`;
}

function formatMoney(value?: number) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `R ${amount.toFixed(2)}`;
  }
}

const statusOptions: LeadStatus[] = ['new', 'quoted', 'won', 'lost', 'repeat'];

export default function CRMPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isProfileReady, setIsProfileReady] = useState(false);
  const [isPro, setIsPro] = useState(false);

  const [leads, setLeads] = useState<LeadDoc[]>([]);
  const [quoteLinks, setQuoteLinks] = useState<QuoteLinkMap>({});
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  const setupComplete = acceptedTerms && isProfileReady;

  useEffect(() => {
    let unsubscribeUserSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setMobileMenuOpen(false);

      if (!u) {
        router.push('/');
        return;
      }

      if (unsubscribeUserSnapshot) unsubscribeUserSnapshot();

      unsubscribeUserSnapshot = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const incomingProfile = (data.profile || {}) as Profile;

            setProfile(incomingProfile);
            setAcceptedTerms(data.acceptedTerms === true);
            setIsProfileReady(isProfileComplete(incomingProfile));
            setIsPro(isSubscriptionActive(data));
          } else {
            setProfile({});
            setAcceptedTerms(false);
            setIsProfileReady(false);
            setIsPro(false);
          }

          setLoading(false);
        },
        (err) => {
          console.error('CRM user snapshot error:', err);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeUserSnapshot) unsubscribeUserSnapshot();
      unsubscribeAuth();
    };
  }, [router]);

  useEffect(() => {
    if (!user || !setupComplete || !isPro) {
      setLeads([]);
      setQuoteLinks({});
      return;
    }

    const leadsQuery = query(
      collection(db, 'leads'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const documentsQuery = query(
      collection(db, 'documents'),
      where('userId', '==', user.uid)
    );

    const unsubscribeLeads = onSnapshot(
      leadsQuery,
      (snap) => {
        const leadList = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as LeadDoc[];

        setLeads(leadList);
      },
      (err) => {
        console.error('Live leads snapshot error:', err);
      }
    );

    const unsubscribeDocuments = onSnapshot(
      documentsQuery,
      (snap) => {
        const nextQuoteLinks: QuoteLinkMap = {};

        snap.docs.forEach((d) => {
          const data = d.data();

          if (data.type !== 'quote') return;
          if (!data.sourceLeadId) return;

          const existing = nextQuoteLinks[data.sourceLeadId];
          const existingDate = toDate(existing?.createdAt);
          const incomingDate = toDate(data.createdAt);

          if (!existing || (incomingDate && (!existingDate || incomingDate > existingDate))) {
            nextQuoteLinks[data.sourceLeadId] = {
              quoteId: d.id,
              quoteNumber: data.number || '',
              total: Number(data.total || 0),
              status: data.status || 'draft',
              createdAt: data.createdAt || null,
            };
          }
        });

        setQuoteLinks(nextQuoteLinks);
      },
      (err) => {
        console.error('Live quote snapshot error:', err);
      }
    );

    return () => {
      unsubscribeLeads();
      unsubscribeDocuments();
    };
  }, [user, setupComplete, isPro]);

  const filteredLeads = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const working = leads.filter((lead) => {
      const matchesStatus = statusFilter === 'all' || (lead.status || 'new') === statusFilter;
      const linkedQuote = quoteLinks[lead.id];

      const haystack = [
        lead.name || '',
        lead.email || '',
        lead.phone || '',
        lead.message || '',
        lead.pageSlug || '',
        lead.source || '',
        linkedQuote?.quoteNumber || '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !term || haystack.includes(term);
      return matchesStatus && matchesSearch;
    });

    working.sort((a, b) => {
      if (sortBy === 'oldest') {
        return (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0);
      }

      if (sortBy === 'updated') {
        return (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0);
      }

      return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
    });

    return working;
  }, [leads, searchTerm, statusFilter, sortBy, quoteLinks]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const leadsThisMonth = leads.filter((lead) => {
      const created = toDate(lead.createdAt);
      return created && created.getMonth() === currentMonth && created.getFullYear() === currentYear;
    }).length;

    const quotedCount = leads.filter(
      (lead) => (lead.status === 'quoted') || Boolean(quoteLinks[lead.id])
    ).length;

    const wonCount = leads.filter((lead) => lead.status === 'won').length;
    const repeatCount = leads.filter((lead) => lead.status === 'repeat').length;
    const total = leads.length;

    return {
      total,
      newCount: leads.filter((l) => (l.status || 'new') === 'new').length,
      quoted: quotedCount,
      won: wonCount,
      repeat: repeatCount,
      leadsThisMonth,
      conversionRate: total > 0 ? Math.round((wonCount / total) * 100) : 0,
      quoteRate: total > 0 ? Math.round((quotedCount / total) * 100) : 0,
    };
  }, [leads, quoteLinks]);

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const updateLeadStatus = async (leadId: string, status: LeadStatus) => {
    try {
      setUpdatingLeadId(leadId);

      await updateDoc(doc(db, 'leads', leadId), {
        status,
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.error('Update lead status error:', err);
      alert('Failed to update lead status.');
    } finally {
      setUpdatingLeadId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading CRM...
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
                .com
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
              <Link href="/website" className="text-zinc-400 hover:text-white">
                Mini Site
              </Link>
              <Link href="/crm" className="text-emerald-400 font-medium">
                CRM
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
                <Link href="/website" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Mini Site
                </Link>
                <Link href="/crm" className="text-emerald-400 font-medium" onClick={() => setMobileMenuOpen(false)}>
                  CRM
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {!setupComplete && (
          <div className="mb-8 bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6">
            <h3 className="text-2xl font-semibold text-white mb-3">Complete your setup first</h3>
            <p className="text-zinc-300 leading-7 mb-5">
              Before using CRM, please complete your business profile and accept the Terms of Service.
            </p>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-2xl font-semibold"
            >
              Go to Profile
            </Link>
          </div>
        )}

        {setupComplete && !isPro && (
          <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="max-w-3xl">
                <p className="text-emerald-400 font-semibold text-sm uppercase tracking-wide mb-3">
                  Premium feature
                </p>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                  CRM is available on Pro
                </h2>
                <p className="text-zinc-300 leading-7">
                  Track leads from your mini website, update statuses, follow up faster, and turn
                  interest into paying clients. Upgrade to Pro to unlock the CRM.
                </p>

                <div className="grid sm:grid-cols-3 gap-3 mt-6">
                  <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-[0.12em]">Lead capture</p>
                    <p className="text-white font-medium mt-2">Website requests in one place</p>
                  </div>
                  <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-[0.12em]">Status tracking</p>
                    <p className="text-white font-medium mt-2">New, quoted, won, lost, repeat</p>
                  </div>
                  <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-[0.12em]">Conversion metrics</p>
                    <p className="text-white font-medium mt-2">See quotes and lead progress live</p>
                  </div>
                </div>
              </div>

              <div className="min-w-[220px]">
                <Link
                  href="/"
                  className="inline-flex w-full items-center justify-center bg-white hover:bg-zinc-100 text-black px-6 py-4 rounded-2xl font-bold text-lg"
                >
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          </div>
        )}

        {setupComplete && isPro && (
          <>
            <div className="mb-8">
              <p className="text-emerald-400 font-medium mb-3">CRM</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                Manage your incoming leads
              </h2>
              <p className="text-zinc-400 max-w-3xl leading-7">
                Leads from your mini website appear here in real time. Update statuses, search your
                pipeline, open linked quotes, and move prospects toward sales.
              </p>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-7 gap-3 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                <p className="text-zinc-500 text-[11px] uppercase tracking-[0.14em]">Total leads</p>
                <p className="text-xl sm:text-2xl font-semibold text-white mt-2">{stats.total}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                <p className="text-zinc-500 text-[11px] uppercase tracking-[0.14em]">New</p>
                <p className="text-xl sm:text-2xl font-semibold text-amber-300 mt-2">{stats.newCount}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                <p className="text-zinc-500 text-[11px] uppercase tracking-[0.14em]">Quoted</p>
                <p className="text-xl sm:text-2xl font-semibold text-blue-300 mt-2">{stats.quoted}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                <p className="text-zinc-500 text-[11px] uppercase tracking-[0.14em]">Won</p>
                <p className="text-xl sm:text-2xl font-semibold text-emerald-300 mt-2">{stats.won}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                <p className="text-zinc-500 text-[11px] uppercase tracking-[0.14em]">Repeat</p>
                <p className="text-xl sm:text-2xl font-semibold text-violet-300 mt-2">{stats.repeat}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                <p className="text-zinc-500 text-[11px] uppercase tracking-[0.14em]">This month</p>
                <p className="text-xl sm:text-2xl font-semibold text-white mt-2">{stats.leadsThisMonth}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                <p className="text-zinc-500 text-[11px] uppercase tracking-[0.14em]">Quote rate</p>
                <p className="text-xl sm:text-2xl font-semibold text-white mt-2">{stats.quoteRate}%</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 mb-6">
              <div className="grid lg:grid-cols-[1fr_220px_220px] gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Search leads</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    placeholder="Search by name, email, phone, message, source, page slug or quote number"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Filter by status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as 'all' | LeadStatus)
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                  >
                    <option value="all">All statuses</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Sort leads</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="updated">Recently updated</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
                    statusFilter === 'all'
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                  }`}
                >
                  All
                </button>
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
                      statusFilter === status
                        ? 'bg-white text-black border-white'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-zinc-400 text-sm">
                Showing <span className="text-white font-medium">{filteredLeads.length}</span> of{' '}
                <span className="text-white font-medium">{leads.length}</span> leads
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/website"
                  className="inline-flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                >
                  Open Mini Site
                </Link>
              </div>
            </div>

            {filteredLeads.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center">
                <h3 className="text-2xl font-semibold text-white mb-3">No leads found</h3>
                <p className="text-zinc-400 max-w-2xl mx-auto leading-7">
                  {leads.length === 0
                    ? 'When visitors submit quote requests from your mini site, they will appear here automatically.'
                    : 'No leads match your current search or filter.'}
                </p>

                <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
                  <Link
                    href="/website"
                    className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-2xl font-semibold"
                  >
                    Open Mini Site
                  </Link>
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setSortBy('newest');
                    }}
                    className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-3 rounded-2xl font-semibold"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLeads.map((lead) => {
                  const status = (lead.status || 'new') as LeadStatus;
                  const linkedQuote = quoteLinks[lead.id];
                  const publicPageLink = getPublicPageLink(lead.pageSlug);

                  return (
                    <div
                      key={lead.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6"
                    >
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <h3 className="text-xl font-semibold text-white">
                              {lead.name || 'Unnamed lead'}
                            </h3>
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(
                                status
                              )}`}
                            >
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                            <span className="inline-flex rounded-full bg-zinc-800 border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300">
                              {lead.source || 'website'}
                            </span>
                            {linkedQuote ? (
                              <span className="inline-flex rounded-full bg-blue-500/15 border border-blue-500/20 px-3 py-1 text-xs font-medium text-blue-300">
                                Quote Created
                              </span>
                            ) : null}
                          </div>

                          <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
                            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                              <p className="text-zinc-500 text-xs uppercase tracking-[0.12em] mb-1">Email</p>
                              <p className="text-white break-all">{lead.email || '—'}</p>
                            </div>
                            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                              <p className="text-zinc-500 text-xs uppercase tracking-[0.12em] mb-1">Phone</p>
                              <p className="text-white">{lead.phone || '—'}</p>
                            </div>
                            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                              <p className="text-zinc-500 text-xs uppercase tracking-[0.12em] mb-1">Page Slug</p>
                              <p className="text-white">{lead.pageSlug || '—'}</p>
                            </div>
                            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                              <p className="text-zinc-500 text-xs uppercase tracking-[0.12em] mb-1">Received</p>
                              <p className="text-white">{formatDate(lead.createdAt)}</p>
                            </div>
                            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                              <p className="text-zinc-500 text-xs uppercase tracking-[0.12em] mb-1">Last Updated</p>
                              <p className="text-white">{formatDateTime(lead.updatedAt || lead.createdAt)}</p>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4 mb-4">
                            <p className="text-zinc-500 text-xs uppercase tracking-[0.12em] mb-2">Message</p>
                            <p className="text-zinc-200 whitespace-pre-wrap leading-7">
                              {lead.message || 'No message provided.'}
                            </p>
                          </div>

                          {linkedQuote ? (
                            <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4">
                              <div className="grid sm:grid-cols-4 gap-3">
                                <div>
                                  <p className="text-blue-200 text-xs uppercase tracking-[0.12em] mb-1">Quote Number</p>
                                  <p className="text-white font-medium">{linkedQuote.quoteNumber || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-blue-200 text-xs uppercase tracking-[0.12em] mb-1">Quote Total</p>
                                  <p className="text-white font-medium">{formatMoney(linkedQuote.total)}</p>
                                </div>
                                <div>
                                  <p className="text-blue-200 text-xs uppercase tracking-[0.12em] mb-1">Quote Status</p>
                                  <p className="text-white font-medium">{linkedQuote.status || 'draft'}</p>
                                </div>
                                <div>
                                  <p className="text-blue-200 text-xs uppercase tracking-[0.12em] mb-1">Quote Created</p>
                                  <p className="text-white font-medium">{formatDate(linkedQuote.createdAt)}</p>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="xl:w-[260px] shrink-0">
                          <label className="block text-sm text-zinc-400 mb-2">Lead status</label>
                          <select
                            value={status}
                            onChange={(e) =>
                              updateLeadStatus(lead.id, e.target.value as LeadStatus)
                            }
                            disabled={updatingLeadId === lead.id}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-3 disabled:opacity-60"
                          >
                            {statusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option.charAt(0).toUpperCase() + option.slice(1)}
                              </option>
                            ))}
                          </select>

                          <div className="grid gap-3">
                            <Link
                              href={`/new-quote?leadId=${lead.id}&leadName=${encodeURIComponent(lead.name || '')}&leadEmail=${encodeURIComponent(lead.email || '')}&leadPhone=${encodeURIComponent(lead.phone || '')}&leadMessage=${encodeURIComponent(lead.message || '')}`}
                              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-2xl font-semibold"
                            >
                              {linkedQuote ? 'Create Another Quote' : 'Create Quote'}
                            </Link>

                            {linkedQuote ? (
                              <Link
                                href={`/new-quote?quoteId=${linkedQuote.quoteId}`}
                                className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-2xl font-semibold"
                              >
                                Open Quote
                              </Link>
                            ) : null}

                            {lead.email ? (
                              <a
                                href={`mailto:${lead.email}`}
                                className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-3 rounded-2xl font-semibold"
                              >
                                Email Lead
                              </a>
                            ) : null}

                            {lead.phone ? (
                              <a
                                href={`tel:${lead.phone}`}
                                className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-3 rounded-2xl font-semibold"
                              >
                                Call Lead
                              </a>
                            ) : null}

                            {publicPageLink ? (
                              <a
                                href={publicPageLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-3 rounded-2xl font-semibold"
                              >
                                Open Public Page
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
