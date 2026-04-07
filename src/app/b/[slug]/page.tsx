'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

type PublicPageDoc = {
  id: string;
  userId: string;
  slug: string;
  shortDescription?: string;
  whatsappNumber?: string;
  isPublished?: boolean;
  businessSnapshot?: {
    businessName?: string;
    ownerName?: string;
    businessEmail?: string;
    phone?: string;
    physicalAddress?: string;
    logo?: string;
  };
};

type LeadFormState = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

const defaultLeadForm: LeadFormState = {
  name: '',
  email: '',
  phone: '',
  message: '',
};

function sanitizeWhatsappNumber(value?: string) {
  return String(value || '').replace(/[^\d]/g, '');
}

function buildWhatsappLink(number?: string, businessName?: string) {
  const cleanNumber = sanitizeWhatsappNumber(number);
  if (!cleanNumber) return '';

  const message = `Hello ${businessName || ''}, I would like to request a quote.`;
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message.trim())}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function PublicBusinessPage() {
  const params = useParams();
  const slugParam = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  const [pageData, setPageData] = useState<PublicPageDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  const [leadForm, setLeadForm] = useState<LeadFormState>(defaultLeadForm);
  const [submittingLead, setSubmittingLead] = useState(false);

  const whatsappLink = useMemo(() => {
    return buildWhatsappLink(
      pageData?.whatsappNumber,
      pageData?.businessSnapshot?.businessName
    );
  }, [pageData?.whatsappNumber, pageData?.businessSnapshot?.businessName]);

  useEffect(() => {
    const loadPublicPage = async () => {
      if (!slugParam || typeof slugParam !== 'string') {
        setNotFoundState(true);
        setLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'publicPages'),
          where('slug', '==', slugParam),
          where('isPublished', '==', true),
          limit(1)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          setNotFoundState(true);
          setPageData(null);
          setLoading(false);
          return;
        }

        const docSnap = snap.docs[0];
        setPageData({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PublicPageDoc, 'id'>),
        });
        setNotFoundState(false);
      } catch (err) {
        console.error('Failed to load public page:', err);
        setNotFoundState(true);
      } finally {
        setLoading(false);
      }
    };

    loadPublicPage();
  }, [slugParam]);

  const submitLead = async (e: FormEvent) => {
    e.preventDefault();

    if (!pageData?.userId || !pageData?.slug) {
      alert('This page is not available right now.');
      return;
    }

    if (!leadForm.name.trim()) {
      alert('Please enter your name.');
      return;
    }

    if (!leadForm.email.trim() || !isValidEmail(leadForm.email)) {
      alert('Please enter a valid email address.');
      return;
    }

    if (!leadForm.phone.trim()) {
      alert('Please enter your phone number.');
      return;
    }

    if (!leadForm.message.trim()) {
      alert('Please enter a short message.');
      return;
    }

    try {
      setSubmittingLead(true);

      await addDoc(collection(db, 'leads'), {
        userId: pageData.userId,
        pageSlug: pageData.slug,
        source: 'website',
        status: 'new',
        name: leadForm.name.trim(),
        email: leadForm.email.trim(),
        phone: leadForm.phone.trim(),
        message: leadForm.message.trim(),
        businessName: pageData.businessSnapshot?.businessName || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setLeadForm(defaultLeadForm);
      alert('Your quote request was sent successfully.');
    } catch (err: any) {
      console.error('Lead submission error:', err);
      alert('Failed to send your request: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmittingLead(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        Loading business page...
      </div>
    );
  }

  if (notFoundState || !pageData) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 sm:p-10 text-center">
            <p className="text-emerald-400 font-medium mb-3">RealQte Business Page</p>
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">Page not found</h1>
            <p className="text-zinc-400 max-w-2xl mx-auto leading-7">
              This business page may have been unpublished, moved, or the link may be incorrect.
            </p>

            <div className="mt-8">
              <Link
                href="/"
                className="inline-flex bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl font-semibold"
              >
                Visit RealQte
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const business = pageData.businessSnapshot || {};

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-emerald-400 font-semibold text-lg">RealQte</p>
            <p className="text-zinc-500 text-sm">Public Business Page</p>
          </div>

          <Link
            href="/"
            className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 rounded-xl"
          >
            Create your own
          </Link>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="grid lg:grid-cols-[1.08fr_0.92fr] gap-6">
          <section className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
              {business.logo ? (
                <div className="bg-white rounded-2xl p-4 inline-block mb-6 max-w-full">
                  <img
                    src={business.logo}
                    alt={`${business.businessName || 'Business'} logo`}
                    className="max-h-24 sm:max-h-28 w-auto object-contain"
                  />
                </div>
              ) : null}

              <div className="mb-5">
                <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
                  {business.businessName || 'Business Name'}
                </h1>
                {business.ownerName ? (
                  <p className="text-zinc-400 text-lg mt-3">{business.ownerName}</p>
                ) : null}
              </div>

              <p className="text-zinc-300 leading-8 text-base sm:text-lg whitespace-pre-wrap">
                {pageData.shortDescription?.trim() ||
                  'Please contact us for more information or to request a quote.'}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                {whatsappLink ? (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3.5 rounded-2xl font-semibold"
                  >
                    Contact on WhatsApp
                  </a>
                ) : null}

                {business.businessEmail ? (
                  <a
                    href={`mailto:${business.businessEmail}`}
                    className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-5 py-3.5 rounded-2xl font-semibold"
                  >
                    Send Email
                  </a>
                ) : null}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
              <h2 className="text-2xl font-semibold mb-5">Business contact details</h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Phone</p>
                  <p className="text-white">{business.phone || 'Not available'}</p>
                </div>

                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Email</p>
                  <p className="text-white break-all">{business.businessEmail || 'Not available'}</p>
                </div>

                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4 sm:col-span-2">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Address</p>
                  <p className="text-white whitespace-pre-wrap">
                    {business.physicalAddress || 'Not available'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
              <h2 className="text-2xl font-semibold mb-3">Request a Quote</h2>
              <p className="text-zinc-400 leading-7 mb-6">
                Fill in your details below and send a message. The business owner will receive your
                request inside RealQte.
              </p>

              <form onSubmit={submitLead} className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={leadForm.name}
                    onChange={(e) =>
                      setLeadForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={leadForm.email}
                    onChange={(e) =>
                      setLeadForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Phone <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={leadForm.phone}
                    onChange={(e) =>
                      setLeadForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    placeholder="Your phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Message <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={leadForm.message}
                    onChange={(e) =>
                      setLeadForm((prev) => ({ ...prev, message: e.target.value }))
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-h-[140px]"
                    placeholder="Tell the business what you need a quote for."
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingLead}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 py-4 rounded-2xl text-lg font-bold"
                >
                  {submittingLead ? 'Sending Request...' : 'Send Quote Request'}
                </button>
              </form>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
              <h3 className="text-xl font-semibold mb-3">Quick contact</h3>
              <div className="space-y-3">
                {business.phone ? (
                  <a
                    href={`tel:${business.phone}`}
                    className="block rounded-2xl bg-zinc-950 border border-zinc-800 p-4 hover:bg-zinc-800"
                  >
                    Call: {business.phone}
                  </a>
                ) : null}

                {business.businessEmail ? (
                  <a
                    href={`mailto:${business.businessEmail}`}
                    className="block rounded-2xl bg-zinc-950 border border-zinc-800 p-4 hover:bg-zinc-800 break-all"
                  >
                    Email: {business.businessEmail}
                  </a>
                ) : null}

                {whatsappLink ? (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 hover:bg-emerald-500/15 text-emerald-300"
                  >
                    Open WhatsApp Chat
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
              <p className="text-zinc-500 text-sm">
                Powered by RealQte
              </p>
              <p className="text-zinc-300 mt-2 leading-7">
                RealQte helps small businesses create quotes, invoices, and now public business pages.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
