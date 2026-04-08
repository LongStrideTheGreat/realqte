'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type BusinessSnapshot = {
  businessName?: string;
  ownerName?: string;
  phone?: string;
  businessEmail?: string;
  physicalAddress?: string;
  postalAddress?: string;
  cipcNumber?: string;
  taxNumber?: string;
  vatNumber?: string;
  bankDetails?: string;
  logo?: string;
};

type PublicQuote = {
  id: string;
  type?: string;
  number?: string;
  client?: string;
  clientEmail?: string;
  date?: string;
  items?: {
    desc?: string;
    qty?: number;
    rate?: number;
    unit?: string;
  }[];
  vat?: number;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  notes?: string;
  expiryDate?: any;
  validUntilText?: string;
  currencyCode?: string;
  currencyLocale?: string;
  isPublic?: boolean;
  businessSnapshot?: BusinessSnapshot;
};

function toDate(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === 'function') return value.toDate();

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }

  return null;
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

export default function PublicQuotePage() {
  const params = useParams<{ id: string }>();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadQuote = async () => {
      try {
        const id = params?.id;
        if (!id) {
          setNotFound(true);
          return;
        }

        const snap = await getDoc(doc(db, 'documents', id));

        if (!snap.exists()) {
          setNotFound(true);
          return;
        }

        const data = snap.data() as PublicQuote;

        if (data.type !== 'quote' || data.isPublic !== true) {
          setNotFound(true);
          return;
        }

        setQuote({ ...data, id: snap.id });
      } catch (err) {
        console.error('Failed to load public quote:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadQuote();
  }, [params]);

  const currencyCode = quote?.currencyCode || 'ZAR';
  const currencyLocale = quote?.currencyLocale || 'en-ZA';
  const business = quote?.businessSnapshot || {};
  const expiry = useMemo(
    () => toDate(quote?.expiryDate)?.toLocaleDateString(currencyLocale) || quote?.validUntilText || '—',
    [quote, currencyLocale]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        Loading quote...
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-bold mb-3">Quote not available</h1>
          <p className="text-zinc-400">
            This quote link is unavailable or no longer public.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <p className="text-zinc-500 text-sm">Shared via RealQte</p>
            <h1 className="text-2xl sm:text-3xl font-bold">Quote</h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 text-sm font-medium"
            >
              Print / Save PDF
            </button>
            <Link
              href="/"
              className="rounded-2xl border border-zinc-300 bg-white hover:bg-zinc-50 px-4 py-2.5 text-sm font-medium"
            >
              Powered by RealQte
            </Link>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-[28px] shadow-sm p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
            <div className="min-w-0">
              {business.logo ? (
                <div className="mb-4">
                  <img
                    src={business.logo}
                    alt="Business logo"
                    className="max-h-20 max-w-[220px] object-contain"
                  />
                </div>
              ) : null}

              <h2 className="text-xl font-bold">{business.businessName || 'Business'}</h2>
              {business.ownerName ? <p className="mt-1">{business.ownerName}</p> : null}
              {business.phone ? <p>{business.phone}</p> : null}
              {business.businessEmail ? <p>{business.businessEmail}</p> : null}
              {business.physicalAddress ? <p>{business.physicalAddress}</p> : null}
              {business.vatNumber ? <p>VAT No: {business.vatNumber}</p> : null}
              {business.taxNumber ? <p>Tax No: {business.taxNumber}</p> : null}
            </div>

            <div className="md:text-right">
              <p className="text-emerald-600 text-sm font-semibold uppercase tracking-[0.18em]">
                Quote
              </p>
              <h3 className="text-xl font-bold mt-2">{quote.number || 'Quote'}</h3>
              <p className="text-zinc-500 mt-2">Date: {quote.date || '—'}</p>
              <p className="text-zinc-500">Valid until: {expiry}</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500 mb-2">Quote For</p>
            <p className="font-semibold">{quote.client || 'Client'}</p>
            {quote.clientEmail ? <p className="text-zinc-600">{quote.clientEmail}</p> : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-zinc-50">
                  <th className="text-left px-4 py-3 border-b border-zinc-200 text-sm">Description</th>
                  <th className="text-center px-4 py-3 border-b border-zinc-200 text-sm">Qty</th>
                  <th className="text-center px-4 py-3 border-b border-zinc-200 text-sm">Unit</th>
                  <th className="text-center px-4 py-3 border-b border-zinc-200 text-sm">Rate</th>
                  <th className="text-right px-4 py-3 border-b border-zinc-200 text-sm">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(quote.items || []).map((item, index) => (
                  <tr key={index} className="border-b border-zinc-100">
                    <td className="px-4 py-3">{item.desc || ''}</td>
                    <td className="px-4 py-3 text-center">{Number(item.qty || 0)}</td>
                    <td className="px-4 py-3 text-center">{item.unit || 'each'}</td>
                    <td className="px-4 py-3 text-center">
                      {formatMoney(item.rate, currencyCode, currencyLocale)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(
                        Number(item.qty || 0) * Number(item.rate || 0),
                        currencyCode,
                        currencyLocale
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex justify-end">
            <div className="w-full max-w-sm space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">Subtotal</span>
                <span>{formatMoney(quote.subtotal, currencyCode, currencyLocale)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">VAT ({Number(quote.vat || 0)}%)</span>
                <span>{formatMoney(quote.vatAmount, currencyCode, currencyLocale)}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold border-t border-zinc-200 pt-3">
                <span>Total</span>
                <span>{formatMoney(quote.total, currencyCode, currencyLocale)}</span>
              </div>
            </div>
          </div>

          {business.bankDetails ? (
            <div className="mt-8 pt-6 border-t border-zinc-200">
              <p className="text-sm font-semibold mb-2">Banking Details</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{business.bankDetails}</p>
            </div>
          ) : null}

          {quote.notes ? (
            <div className="mt-8 pt-6 border-t border-zinc-200">
              <p className="text-sm font-semibold mb-2">Notes</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          ) : null}
        </div>
      </div>
      <footer className="mt-12 border-t border-zinc-800 pt-6 pb-4">
  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-500">
    
    <p>
      © {new Date().getFullYear()} RealQte. All rights reserved.
    </p>

    <div className="flex items-center gap-4">
      <Link href="/help" className="hover:text-white transition">
        Help
      </Link>
      <Link href="/legal" className="hover:text-white transition">
        Legal
      </Link>
      <Link href="/privacy" className="hover:text-white transition">
        Privacy
      </Link>
    </div>

  </div>
</footer>
    </div>
  );
}