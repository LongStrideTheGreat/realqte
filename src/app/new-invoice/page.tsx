'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  Timestamp,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, getBlob, ref } from 'firebase/storage';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import AppHeader from '@/components/AppHeader';

type ProfileType = {
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
  currencyCode?: string;
  currencyLocale?: string;
};

type CustomerType = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
};

type ProductType = {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  unit?: string;
  vatRate?: number;
  category?: string;
  sku?: string;
  isActive?: boolean;
};

type ItemType = {
  productId?: string | null;
  desc: string;
  qty: number;
  rate: number;
  unit?: string;
};

type InvoiceDocType = {
  id: string;
  number?: string;
  client?: string;
  total?: string | number;
  createdAt?: any;
  date?: string;
  paid?: boolean;
  paymentStatus?: string;
  status?: string;
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  createdFromQuote?: boolean;
  currencyCode?: string;
  currencyLocale?: string;
  recurring?: boolean;
  isPublic?: boolean;
};

type SavedInvoiceState = {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
};

type BusinessSnapshotType = {
  businessName: string;
  ownerName: string;
  phone: string;
  businessEmail: string;
  physicalAddress: string;
  postalAddress: string;
  cipcNumber: string;
  taxNumber: string;
  vatNumber: string;
  bankDetails: string;
  logo: string;
  currencyCode: string;
  currencyLocale: string;
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

function generateInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const t = String(now.getTime()).slice(-5);
  return `INV-${y}${m}${d}-${t}`;
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function resolveLatestLogoDataUrl(uid: string, fallbackLogo?: string): Promise<string> {
  const candidates = [
    `logos/${uid}`,
    `logos/${uid}.png`,
    `logos/${uid}.jpg`,
    `logos/${uid}.jpeg`,
    `logos/${uid}.webp`,
  ];

  for (const path of candidates) {
    try {
      const blob = await getBlob(ref(storage, path));
      if (blob) {
        return await blobToDataUrl(blob);
      }
    } catch {
      // try next
    }
  }

  return fallbackLogo || '';
}

async function resolveLatestLogoUrl(uid: string, fallbackLogo?: string): Promise<string> {
  const candidates = [
    `logos/${uid}`,
    `logos/${uid}.png`,
    `logos/${uid}.jpg`,
    `logos/${uid}.jpeg`,
    `logos/${uid}.webp`,
  ];

  for (const path of candidates) {
    try {
      const freshLogoUrl = await getDownloadURL(ref(storage, path));
      if (freshLogoUrl) {
        return `${freshLogoUrl}${freshLogoUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
      }
    } catch {
      // try next
    }
  }

  if (fallbackLogo) {
    return `${fallbackLogo}${fallbackLogo.includes('?') ? '&' : '?'}t=${Date.now()}`;
  }

  return '';
}

function createBusinessSnapshot(
  profile: ProfileType,
  overrides?: Partial<BusinessSnapshotType>
): BusinessSnapshotType {
  return {
    businessName: profile.businessName?.trim() || '',
    ownerName: profile.ownerName?.trim() || '',
    phone: profile.phone?.trim() || '',
    businessEmail: profile.businessEmail?.trim() || '',
    physicalAddress: profile.physicalAddress?.trim() || '',
    postalAddress: profile.postalAddress?.trim() || '',
    cipcNumber: profile.cipcNumber?.trim() || '',
    taxNumber: profile.taxNumber?.trim() || '',
    vatNumber: profile.vatNumber?.trim() || '',
    bankDetails: profile.bankDetails?.trim() || '',
    logo: profile.logo?.trim() || '',
    currencyCode: profile.currencyCode?.trim() || 'ZAR',
    currencyLocale: profile.currencyLocale?.trim() || 'en-ZA',
    ...overrides,
  };
}

function applyBusinessSnapshotToProfile(snapshot?: Partial<BusinessSnapshotType> | null): ProfileType | null {
  if (!snapshot) return null;

  return {
    businessName: snapshot.businessName || '',
    ownerName: snapshot.ownerName || '',
    phone: snapshot.phone || '',
    businessEmail: snapshot.businessEmail || '',
    physicalAddress: snapshot.physicalAddress || '',
    postalAddress: snapshot.postalAddress || '',
    cipcNumber: snapshot.cipcNumber || '',
    taxNumber: snapshot.taxNumber || '',
    vatNumber: snapshot.vatNumber || '',
    bankDetails: snapshot.bankDetails || '',
    logo: snapshot.logo || '',
    currencyCode: snapshot.currencyCode || 'ZAR',
    currencyLocale: snapshot.currencyLocale || 'en-ZA',
  };
}

function compactInputClasses() {
  return 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500';
}

function compactLabelClasses() {
  return 'block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-2';
}

function getInvoiceBadge(invoice: InvoiceDocType) {
  const paid =
    invoice.paid === true ||
    String(invoice.paymentStatus || '').toLowerCase() === 'paid' ||
    String(invoice.status || '').toLowerCase() === 'paid';

  if (paid) {
    return 'Paid';
  }

  if (String(invoice.status || '').toLowerCase() === 'sent') {
    return 'Sent';
  }

  return 'Unpaid';
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

export default function NewInvoice() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [embeddedLogoSrc, setEmbeddedLogoSrc] = useState('');
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [client, setClient] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [items, setItems] = useState<ItemType[]>([
    { productId: null, desc: '', qty: 1, rate: 0, unit: 'each' },
  ]);
  const [vat, setVat] = useState(15);
  const [notes, setNotes] = useState('Thank you for your business!');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');
  const [recentInvoices, setRecentInvoices] = useState<InvoiceDocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [openingEmail, setOpeningEmail] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [openingPublic, setOpeningPublic] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [sourceQuoteId, setSourceQuoteId] = useState<string | null>(null);
  const [sourceQuoteNumber, setSourceQuoteNumber] = useState<string | null>(null);
  const [loadedFromQuote, setLoadedFromQuote] = useState(false);

  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [savedInvoice, setSavedInvoice] = useState<SavedInvoiceState | null>(null);

  const profileComplete = useMemo(() => {
    return Boolean(
      profile.businessName?.trim() &&
        profile.ownerName?.trim() &&
        profile.businessEmail?.trim() &&
        profile.phone?.trim()
    );
  }, [profile]);

  const { currencyCode, currencyLocale } = useMemo(
    () => getCurrencyConfig(profile),
    [profile]
  );

  const validItems = useMemo(
    () => items.filter((item) => item.desc.trim() && item.qty > 0),
    [items]
  );

  const calcTotals = () => {
    const subtotal = validItems.reduce((sum, item) => sum + item.qty * item.rate, 0);
    const vatAmt = subtotal * (vat / 100);

    return {
      subtotal,
      vatAmount: vatAmt,
      total: subtotal + vatAmt,
    };
  };

  const totals = calcTotals();

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
          const resolvedLogo = await resolveLatestLogoUrl(u.uid, incomingProfile.logo || '');

          setProfile({
            ...incomingProfile,
            logo: resolvedLogo,
            currencyCode: incomingProfile.currencyCode || 'ZAR',
            currencyLocale: incomingProfile.currencyLocale || 'en-ZA',
          });
          setIsPro(isSubscriptionActive(data));
        } else {
          const resolvedLogo = await resolveLatestLogoUrl(u.uid, '');
          setProfile({
            logo: resolvedLogo,
            currencyCode: 'ZAR',
            currencyLocale: 'en-ZA',
          });
          setIsPro(false);
        }

        const [custSnap, docsSnap, recentSnap, productSnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid))),
          getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid))),
          getDocs(
            query(
              collection(db, 'documents'),
              where('userId', '==', u.uid),
              where('type', '==', 'invoice'),
              orderBy('createdAt', 'desc'),
              limit(5)
            )
          ),
          getDocs(query(collection(db, 'products'), where('userId', '==', u.uid))),
        ]);

        const customerList = custSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as CustomerType[];
        setCustomers(customerList);
        setUsageCount(docsSnap.size);
        setRecentInvoices(
          recentSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as InvoiceDocType[]
        );

        const activeProducts = productSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ProductType)
          .filter((p) => p.isActive !== false);

        setProducts(activeProducts);

        const urlParams = new URLSearchParams(window.location.search);
        const customerId = urlParams.get('customerId');
        const quoteId = urlParams.get('quoteId');
        const invoiceId = urlParams.get('invoiceId');

        if (customerId) {
          const cust = customerList.find((c) => c.id === customerId);
          if (cust) {
            setSelectedCustomerId(cust.id);
            setClient(cust.name || '');
            setClientEmail(cust.email || '');
          }
        }

        if (invoiceId) {
          const invoiceSnap = await getDoc(doc(db, 'documents', invoiceId));
          if (invoiceSnap.exists()) {
            const data = invoiceSnap.data();
            if (data.userId === u.uid && data.type === 'invoice') {
              const snapshotProfile = applyBusinessSnapshotToProfile(data.businessSnapshot);
              if (snapshotProfile) {
                setProfile(snapshotProfile);
                if (snapshotProfile.logo) {
                  setEmbeddedLogoSrc(snapshotProfile.logo);
                }
              }

              setEditingInvoiceId(invoiceSnap.id);
              setSavedInvoice({
                invoiceId: invoiceSnap.id,
                invoiceNumber: data.number || generateInvoiceNumber(),
                status: data.status || 'unpaid',
              });
              setInvoiceNo(data.number || generateInvoiceNumber());
              setDate(
                typeof data.date === 'string'
                  ? data.date
                  : new Date().toISOString().split('T')[0]
              );
              setClient(data.client || '');
              setClientEmail(data.clientEmail || '');
              setSelectedCustomerId(data.customerId || '');
              setItems(
                Array.isArray(data.items) && data.items.length > 0
                  ? data.items.map((item: any) => ({
                      productId: item.productId || null,
                      desc: item.desc || '',
                      qty: Number(item.qty || 1),
                      rate: Number(item.rate || 0),
                      unit: item.unit || 'each',
                    }))
                  : [{ productId: null, desc: '', qty: 1, rate: 0, unit: 'each' }]
              );
              setVat(Number(data.vat ?? 15));
              setNotes(data.notes || 'Thank you for your business!');
              setIsRecurring(Boolean(data.recurring));
              setSourceQuoteId(data.sourceDocumentId || null);
              setSourceQuoteNumber(data.sourceQuoteNumber || null);
              setLoadedFromQuote(Boolean(data.createdFromQuote));
            }
          }
        } else if (quoteId) {
          const quoteSnap = await getDoc(doc(db, 'documents', quoteId));

          if (quoteSnap.exists()) {
            const quoteData = quoteSnap.data();

            if (quoteData.userId === u.uid && quoteData.type === 'quote') {
              const snapshotProfile = applyBusinessSnapshotToProfile(quoteData.businessSnapshot);
              if (snapshotProfile) {
                setProfile(snapshotProfile);
                if (snapshotProfile.logo) {
                  setEmbeddedLogoSrc(snapshotProfile.logo);
                }
              }

              if (quoteData.convertedToInvoice === true || quoteData.status === 'converted') {
                if (quoteData.convertedInvoiceId) {
                  router.push(`/new-invoice?invoiceId=${quoteData.convertedInvoiceId}`);
                  return;
                }

                alert('This quote has already been converted to an invoice.');
                router.push('/quotes');
                return;
              }

              setSourceQuoteId(quoteId);
              setSourceQuoteNumber(quoteData.number || null);
              setLoadedFromQuote(true);
              setClient(quoteData.client || '');
              setClientEmail(quoteData.clientEmail || '');
              setSelectedCustomerId(quoteData.customerId || '');
              setItems(
                (
                  quoteData.items || [
                    { productId: null, desc: '', qty: 1, rate: 0, unit: 'each' },
                  ]
                ).map((item: any) => ({
                  productId: item.productId || null,
                  desc: item.desc || '',
                  qty: Number(item.qty || 1),
                  rate: Number(item.rate || 0),
                  unit: item.unit || 'each',
                }))
              );
              setVat(Number(quoteData.vat ?? 15));
              setNotes(quoteData.notes || 'Thank you for your business!');
              setDate(new Date().toISOString().split('T')[0]);

              if (quoteData.number) {
                setInvoiceNo(`INV-${String(quoteData.number).replace(/^QTE-?/i, '')}`);
              } else {
                setInvoiceNo(generateInvoiceNumber());
              }
            }
          }
        } else {
          setInvoiceNo(generateInvoiceNumber());
        }
      } catch (err) {
        console.error('Invoice page load error:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const prepareLogo = async () => {
      if (!user) return;

      try {
        const dataUrl = await resolveLatestLogoDataUrl(user.uid, profile.logo || '');
        if (!cancelled) {
          setEmbeddedLogoSrc(dataUrl || profile.logo || '');
        }
      } catch (err) {
        console.error('Failed to prepare logo for invoice PDF:', err);
        if (!cancelled) {
          setEmbeddedLogoSrc(profile.logo || '');
        }
      }
    };

    prepareLogo();

    return () => {
      cancelled = true;
    };
  }, [user, profile.logo]);

  useEffect(() => {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 820px; margin: auto; padding: 36px; background: white; color: black; border: 1px solid #e5e7eb;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:22px;">
          <div style="flex:1; min-width:0;">
            ${
              embeddedLogoSrc
                ? `<div style="margin-bottom:14px; width:220px; max-width:100%; height:84px; display:flex; align-items:center; justify-content:flex-start; overflow:hidden;">
                    <img src="${embeddedLogoSrc}" alt="Logo" crossorigin="anonymous" referrerpolicy="no-referrer" style="max-height:84px; max-width:220px; width:auto; height:auto; object-fit:contain; display:block;" />
                  </div>`
                : ''
            }
            <strong style="font-size:18px; line-height:1.4;">${escapeHtml(profile.businessName || 'Your Business')}</strong><br>
            ${profile.ownerName ? `${escapeHtml(profile.ownerName)}<br>` : ''}
            ${profile.phone ? `${escapeHtml(profile.phone)}<br>` : ''}
            ${profile.businessEmail ? `${escapeHtml(profile.businessEmail)}<br>` : ''}
            ${profile.physicalAddress ? `${escapeHtml(profile.physicalAddress)}<br>` : ''}
            ${profile.vatNumber ? `VAT No: ${escapeHtml(profile.vatNumber)}<br>` : ''}
            ${profile.taxNumber ? `Tax No: ${escapeHtml(profile.taxNumber)}` : ''}
          </div>

          <div style="text-align:right; min-width:190px;">
            <h1 style="font-size:30px; color:#10b981; margin:0 0 10px 0; letter-spacing:0.02em;">INVOICE</h1>
            <div style="font-weight:700; margin-bottom:8px;">${escapeHtml(invoiceNo || 'INV-DRAFT')}</div>
            <div style="font-size:14px; color:#374151;">Date: ${escapeHtml(date)}</div>
            ${
              sourceQuoteNumber
                ? `<div style="font-size:14px; color:#374151; margin-top:4px;">From Quote: ${escapeHtml(sourceQuoteNumber)}</div>`
                : ''
            }
            ${
              isRecurring && isPro
                ? `<div style="font-size:14px; color:#374151; margin-top:4px;">Recurring: Monthly</div>`
                : ''
            }
          </div>
        </div>

        <div style="margin: 28px 0;">
          <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#6b7280; margin-bottom:6px;">Invoice For</div>
          <strong>${escapeHtml(client || 'Client Name')}</strong><br>
          ${escapeHtml(clientEmail || '')}
        </div>

        <table style="width:100%; border-collapse:collapse; margin:20px 0;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;font-size:13px;">Description</th>
              <th style="padding:10px 12px;border-bottom:2px solid #e5e7eb;font-size:13px;">Qty</th>
              <th style="padding:10px 12px;border-bottom:2px solid #e5e7eb;font-size:13px;">Unit</th>
              <th style="padding:10px 12px;border-bottom:2px solid #e5e7eb;font-size:13px;">Rate</th>
              <th style="text-align:right;padding:10px 12px;border-bottom:2px solid #e5e7eb;font-size:13px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${validItems
              .map(
                (item) => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:10px 12px; vertical-align:top;">${escapeHtml(item.desc)}</td>
                  <td style="text-align:center;padding:10px 12px;">${item.qty}</td>
                  <td style="text-align:center;padding:10px 12px;">${escapeHtml(item.unit || 'each')}</td>
                  <td style="text-align:center;padding:10px 12px;">${escapeHtml(
                    formatMoney(item.rate, currencyCode, currencyLocale)
                  )}</td>
                  <td style="text-align:right;padding:10px 12px;">${escapeHtml(
                    formatMoney(item.qty * item.rate, currencyCode, currencyLocale)
                  )}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>

        <div style="display:flex; justify-content:flex-end; margin-top:22px;">
          <div style="min-width:260px; font-size:14px;">
            <div style="display:flex; justify-content:space-between; padding:4px 0;">
              <span>Subtotal</span>
              <span>${escapeHtml(formatMoney(totals.subtotal, currencyCode, currencyLocale))}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:4px 0;">
              <span>VAT (${vat}%)</span>
              <span>${escapeHtml(formatMoney(totals.vatAmount, currencyCode, currencyLocale))}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 0 0; margin-top:8px; border-top:2px solid #111827; font-weight:700; font-size:16px;">
              <span>Total</span>
              <span>${escapeHtml(formatMoney(totals.total, currencyCode, currencyLocale))}</span>
            </div>
          </div>
        </div>

        ${
          notes.trim()
            ? `<div style="margin-top:28px;">
                <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#6b7280; margin-bottom:6px;">Notes</div>
                <div style="font-size:14px; line-height:1.7; color:#374151; white-space:pre-wrap;">${escapeHtml(notes)}</div>
              </div>`
            : ''
        }
      </div>
    `;

    setPreviewHTML(html);
  }, [
    embeddedLogoSrc,
    profile,
    invoiceNo,
    date,
    sourceQuoteNumber,
    isRecurring,
    isPro,
    client,
    clientEmail,
    validItems,
    totals.subtotal,
    totals.vatAmount,
    totals.total,
    vat,
    notes,
    currencyCode,
    currencyLocale,
  ]);

  const addItem = () =>
    setItems([...items, { productId: null, desc: '', qty: 1, rate: 0, unit: 'each' }]);

  const removeItem = (index: number) => {
    if (items.length === 1) {
      setItems([{ productId: null, desc: '', qty: 1, rate: 0, unit: 'each' }]);
      return;
    }
    setItems(items.filter((_, idx) => idx !== index));
  };

  const updateItem = (index: number, key: keyof ItemType, value: string | number | null) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [key]: value,
    };
    setItems(updated);
  };

  const applyProductToItem = (index: number, productId: string) => {
    const updated = [...items];

    if (!productId) {
      updated[index] = {
        ...updated[index],
        productId: null,
      };
      setItems(updated);
      return;
    }

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    updated[index] = {
      ...updated[index],
      productId: product.id,
      desc: product.description?.trim() || product.name || '',
      rate: Number(product.price || 0),
      unit: product.unit || 'each',
    };

    if (typeof product.vatRate === 'number' && !Number.isNaN(product.vatRate)) {
      setVat(product.vatRate);
    }

    setItems(updated);
  };

  const generatePdfBlob = async () => {
    const pdfContainer = document.createElement('div');
    pdfContainer.innerHTML = previewHTML;
    pdfContainer.style.position = 'absolute';
    pdfContainer.style.left = '-9999px';
    pdfContainer.style.top = '0';
    pdfContainer.style.width = '820px';

    document.body.appendChild(pdfContainer);

    try {
      const logoImg = pdfContainer.querySelector('img');
      if (logoImg) {
        await new Promise<void>((resolve) => {
          if ((logoImg as HTMLImageElement).complete) {
            resolve();
            return;
          }

          logoImg.addEventListener('load', () => resolve(), { once: true });
          logoImg.addEventListener('error', () => resolve(), { once: true });
        });
      }

      const canvas = await html2canvas(pdfContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight);
      } else {
        let heightLeft = imgHeight;
        let position = 0;
        const imgData = canvas.toDataURL('image/png');

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
      }

      return pdf.output('blob');
    } finally {
      document.body.removeChild(pdfContainer);
    }
  };

  const downloadPdfFile = async (filename?: string) => {
    const pdfBlob = await generatePdfBlob();
    const blobUrl = URL.createObjectURL(pdfBlob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || `${invoiceNo || 'invoice'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(blobUrl);
  };

  const validateInvoice = () => {
    if (!user) {
      alert('Please sign in');
      return false;
    }

    if (!profileComplete) {
      alert(
        'Please complete your profile first. Business Name, Owner Name, Business Email and Contact Number are required before creating invoices.'
      );
      router.push('/profile');
      return false;
    }

    if (!client.trim()) {
      alert('Please enter the client name.');
      return false;
    }

    if (validItems.length === 0) {
      alert('Please add at least one valid item.');
      return false;
    }

    if (!isPro && usageCount >= 10 && !editingInvoiceId) {
      alert('Free limit reached (10 docs). Upgrade to Pro!');
      return false;
    }

    return true;
  };

  const buildInvoiceDocData = async (
    status: string = 'unpaid',
    existingDoc?: any,
    options?: { forcePublic?: boolean }
  ) => {
    const invoiceNumber = invoiceNo || generateInvoiceNumber();
    const now = Timestamp.now();
    const resolvedLogo = await resolveLatestLogoUrl(
      user!.uid,
      existingDoc?.businessSnapshot?.logo || profile.logo || ''
    );
    const sourceBusinessSnapshot = sourceQuoteId
      ? createBusinessSnapshot(profile, {
          logo: resolvedLogo || profile.logo || '',
          currencyCode,
          currencyLocale,
        })
      : null;
    const businessSnapshot = existingDoc?.businessSnapshot
      ? {
          ...existingDoc.businessSnapshot,
          logo: resolvedLogo || existingDoc.businessSnapshot.logo || profile.logo || '',
          currencyCode,
          currencyLocale,
        }
      : sourceBusinessSnapshot ||
        createBusinessSnapshot(profile, {
          logo: resolvedLogo || profile.logo || '',
          currencyCode,
          currencyLocale,
        });

    return {
      invoiceNumber,
      invoiceDocData: {
        userId: user!.uid,
        type: 'invoice',
        number: invoiceNumber,
        date,
        client,
        clientEmail,
        customerId: selectedCustomerId || null,
        items: validItems,
        vat,
        notes,
        subtotal: Number(totals.subtotal.toFixed(2)),
        vatAmount: Number(totals.vatAmount.toFixed(2)),
        total: Number(totals.total.toFixed(2)),
        currencyCode,
        currencyLocale,
        businessSnapshot,
        recurring: isPro ? isRecurring : false,
        nextDue:
          isPro && isRecurring
            ? Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
            : null,
        reminderSent: false,
        status,
        paid: status === 'paid',
        paymentStatus: status === 'paid' ? 'paid' : 'unpaid',
        inventoryAdjusted: existingDoc?.inventoryAdjusted === true,
        inventoryAdjustedAt: existingDoc?.inventoryAdjustedAt || null,
        sourceDocumentId: sourceQuoteId || null,
        sourceDocumentType: sourceQuoteId ? 'quote' : null,
        sourceQuoteNumber: sourceQuoteNumber || null,
        createdFromQuote: Boolean(sourceQuoteId),
        updatedAt: now,
        sentAt: status === 'sent' ? existingDoc?.sentAt || now : existingDoc?.sentAt || null,
        isPublic: options?.forcePublic === true ? true : existingDoc?.isPublic === true,
      },
    };
  };

  const persistInvoice = async (
    status: string = 'unpaid',
    options?: { forcePublic?: boolean }
  ) => {
    let existingDoc: any = null;

    if (editingInvoiceId) {
      const existingSnap = await getDoc(doc(db, 'documents', editingInvoiceId));
      if (existingSnap.exists()) {
        existingDoc = existingSnap.data();
      }
    }

    const { invoiceNumber, invoiceDocData } = await buildInvoiceDocData(status, existingDoc, options);

    let invoiceId = editingInvoiceId;

    if (editingInvoiceId) {
      await updateDoc(doc(db, 'documents', editingInvoiceId), invoiceDocData);
      invoiceId = editingInvoiceId;
    } else {
      const newDocRef = await addDoc(collection(db, 'documents'), {
        ...invoiceDocData,
        createdAt: Timestamp.now(),
      });
      invoiceId = newDocRef.id;
      setEditingInvoiceId(newDocRef.id);
      setUsageCount((prev) => prev + 1);
    }

    if (!invoiceNo) {
      setInvoiceNo(invoiceNumber);
    }

    if (sourceQuoteId) {
      try {
        await updateDoc(doc(db, 'documents', sourceQuoteId), {
          convertedToInvoice: true,
          convertedInvoiceId: invoiceId,
          convertedAt: Timestamp.now(),
          status: 'converted',
          updatedAt: Timestamp.now(),
          lastActivityAt: Timestamp.now(),
        });
      } catch (err) {
        console.error('Failed to update source quote conversion state:', err);
      }
    }

    const savedState = {
      invoiceId: invoiceId!,
      invoiceNumber,
      status,
    };
    setSavedInvoice(savedState);

    setRecentInvoices((prev) => {
      const next = [
        {
          id: invoiceId!,
          number: invoiceNumber,
          client,
          total: Number(totals.total.toFixed(2)),
          createdAt: Timestamp.now(),
          date,
          paid: status === 'paid',
          paymentStatus: status === 'paid' ? 'paid' : 'unpaid',
          status,
          sourceDocumentId: sourceQuoteId || null,
          sourceDocumentType: sourceQuoteId ? 'quote' : null,
          createdFromQuote: Boolean(sourceQuoteId),
          currencyCode,
          currencyLocale,
          recurring: isPro ? isRecurring : false,
          isPublic: options?.forcePublic === true ? true : existingDoc?.isPublic === true,
        } as InvoiceDocType,
        ...prev.filter((inv) => inv.id !== invoiceId),
      ];

      return next.slice(0, 5);
    });

    return savedState;
  };

  const saveInvoice = async () => {
    if (!validateInvoice()) return;

    try {
      setSaving(true);
      await persistInvoice('unpaid');
      alert(editingInvoiceId ? 'Invoice updated successfully!' : 'Invoice saved successfully!');
      router.push('/invoices');
    } catch (err: any) {
      console.error('Save invoice error:', err);
      alert('Failed to save invoice: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const downloadInvoice = async () => {
    if (!validateInvoice()) return;

    try {
      setDownloading(true);
      const { invoiceNumber } = await persistInvoice('unpaid');
      await downloadPdfFile(`${invoiceNumber || 'invoice'}.pdf`);
      alert('Invoice PDF downloaded successfully!');
    } catch (err: any) {
      console.error('Download invoice error:', err);
      alert('Failed to download invoice: ' + (err.message || 'Unknown error'));
    } finally {
      setDownloading(false);
    }
  };

  const openEmailClient = async () => {
    if (!validateInvoice()) return;

    const trimmedEmail = clientEmail.trim();

    if (!trimmedEmail) {
      alert('Enter client email first');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      alert('Please enter a valid client email address.');
      return;
    }

    try {
      setOpeningEmail(true);

      const { invoiceId, invoiceNumber } = await persistInvoice('sent', { forcePublic: true });
      const publicLink = getPublicDocLink('invoice', invoiceId);

      const subject = encodeURIComponent(
        `Invoice ${invoiceNumber} from ${profile.businessName || 'RealQte'}`
      );

      const body = encodeURIComponent(
        `Hello ${client},

Please view your invoice using the secure link below:

${publicLink}

Invoice Number: ${invoiceNumber}
Date: ${date}
Total: ${formatMoney(totals.total, currencyCode, currencyLocale)}

Kind regards,
${profile.ownerName || profile.businessName || 'RealQte'}${
          profile.businessEmail ? `\n${profile.businessEmail}` : ''
        }`
      );

      window.location.href = `mailto:${trimmedEmail}?subject=${subject}&body=${body}`;
    } catch (err: any) {
      console.error('Open email client error:', err);
      alert('Failed to open email client: ' + (err.message || 'Unknown error'));
    } finally {
      setOpeningEmail(false);
    }
  };

  const openWhatsAppShare = async () => {
    if (!validateInvoice()) return;

    try {
      setSharingWhatsApp(true);

      const { invoiceId, invoiceNumber } = await persistInvoice('sent', { forcePublic: true });
      const publicLink = getPublicDocLink('invoice', invoiceId);

      const message = `Hello ${client},

Please view your invoice from ${profile.businessName || 'RealQte'} using the secure link below:

${publicLink}

Invoice Number: ${invoiceNumber}
Date: ${date}
Total: ${formatMoney(totals.total, currencyCode, currencyLocale)}`;

      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      console.error('WhatsApp share error:', err);
      alert('Failed to open WhatsApp: ' + (err.message || 'Unknown error'));
    } finally {
      setSharingWhatsApp(false);
    }
  };

  const copyPublicLink = async () => {
    if (!validateInvoice()) return;

    try {
      setCopyingLink(true);

      const { invoiceId } = await persistInvoice('sent', { forcePublic: true });
      const publicLink = getPublicDocLink('invoice', invoiceId);

      await copyToClipboard(publicLink);
    } catch (err: any) {
      console.error('Copy invoice link error:', err);
      alert('Failed to copy invoice link: ' + (err.message || 'Unknown error'));
    } finally {
      setCopyingLink(false);
    }
  };

  const openPublicInvoice = async () => {
    if (!validateInvoice()) return;

    try {
      setOpeningPublic(true);

      const { invoiceId } = await persistInvoice('sent', { forcePublic: true });
      const publicLink = getPublicDocLink('invoice', invoiceId);

      window.open(publicLink, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      console.error('Open public invoice error:', err);
      alert('Failed to open public invoice: ' + (err.message || 'Unknown error'));
    } finally {
      setOpeningPublic(false);
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

  const closeMobileMenu = () => setMobileMenuOpen(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading invoice page.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        user={user}
        setupComplete={true}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between mb-6">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] mb-2">
              Invoice builder
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {editingInvoiceId ? 'Edit Invoice' : 'New Invoice'}
            </h1>
            <p className="text-zinc-400 mt-2 text-sm sm:text-base">
              Build the invoice once, then save, download, email, WhatsApp, or open the public link.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/invoices"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Back to Invoices
            </Link>
            {sourceQuoteId && (
              <Link
                href={`/new-quote?quoteId=${sourceQuoteId}`}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                View Source Quote
              </Link>
            )}
          </div>
        </div>

        {!isPro && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-amber-200">Free plan usage</p>
                <p className="text-sm text-amber-100/80">
                  You have used {usageCount} of 10 free documents.
                </p>
              </div>
              <Link
                href="/profile"
                className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400"
              >
                Upgrade to Pro
              </Link>
            </div>
          </div>
        )}

        {!profileComplete && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-200">
              Complete your profile before creating invoices.
            </p>
            <p className="mt-1 text-sm text-red-100/80">
              Business Name, Owner Name, Business Email, and Contact Number are required.
            </p>
            <Link
              href="/profile"
              className="mt-3 inline-flex items-center justify-center rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
            >
              Go to Profile
            </Link>
          </div>
        )}

        {loadedFromQuote && sourceQuoteNumber && (
          <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
            <p className="text-sm font-medium text-blue-200">
              This invoice was loaded from quote {sourceQuoteNumber}.
            </p>
            <p className="mt-1 text-sm text-blue-100/80">
              Saving this invoice will mark the source quote as converted.
            </p>
          </div>
        )}

        {savedInvoice && (
          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <h2 className="text-base font-semibold text-emerald-200">
              Invoice ready to share
            </h2>
            <p className="mt-1 text-sm text-emerald-100/80">
              {savedInvoice.invoiceNumber} has been saved and its public link is ready.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openPublicInvoice}
                disabled={openingPublic}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white"
              >
                {openingPublic ? 'Opening...' : 'View Public'}
              </button>
              <button
                type="button"
                onClick={copyPublicLink}
                disabled={copyingLink}
                className="rounded-xl border border-emerald-400/30 bg-zinc-950 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-zinc-900 disabled:opacity-60"
              >
                {copyingLink ? 'Copying...' : 'Copy Link'}
              </button>
              <button
                type="button"
                onClick={openEmailClient}
                disabled={openingEmail}
                className="rounded-xl border border-emerald-400/30 bg-zinc-950 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-zinc-900 disabled:opacity-60"
              >
                {openingEmail ? 'Opening...' : 'Email Client'}
              </button>
              <button
                type="button"
                onClick={openWhatsAppShare}
                disabled={sharingWhatsApp}
                className="rounded-xl border border-emerald-400/30 bg-zinc-950 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-zinc-900 disabled:opacity-60"
              >
                {sharingWhatsApp ? 'Opening...' : 'WhatsApp'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <div>
                  <label className={compactLabelClasses()}>Invoice Number</label>
                  <input
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    placeholder="INV-..."
                    className={compactInputClasses()}
                  />
                </div>

                <div>
                  <label className={compactLabelClasses()}>Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={compactInputClasses()}
                  />
                </div>

                <div>
                  <label className={compactLabelClasses()}>Recurring</label>
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 min-h-[44px]">
                    <input
                      id="recurring"
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      disabled={!isPro}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    <label htmlFor="recurring" className={`text-sm ${isPro ? 'text-white' : 'text-zinc-500'}`}>
                      {isPro ? 'Make recurring monthly' : 'Recurring is Pro only'}
                    </label>
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <label className={compactLabelClasses()}>
                  Select Customer — add customers on the Customers page
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    const cust = customers.find((c) => c.id === e.target.value);
                    if (cust) {
                      setClient(cust.name || '');
                      setClientEmail(cust.email || '');
                    } else {
                      setClient('');
                      setClientEmail('');
                    }
                  }}
                  className={compactInputClasses()}
                >
                  <option value="">Select Customer (auto-fills details)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email || 'Unnamed Customer'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className={compactLabelClasses()}>Client Name</label>
                  <input
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    placeholder="Client name"
                    className={compactInputClasses()}
                  />
                </div>

                <div>
                  <label className={compactLabelClasses()}>Client Email</label>
                  <input
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@email.com"
                    className={compactInputClasses()}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Items</h2>
                  <p className="text-zinc-500 text-sm">Add products or custom line items.</p>
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium text-white"
                >
                  Add Item
                </button>
              </div>

              <div className="space-y-3 mb-6">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 sm:p-4"
                  >
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.6fr)_minmax(0,4.2fr)_minmax(96px,1.15fr)_minmax(0,1.5fr)_minmax(88px,0.95fr)_auto] gap-3">
                      <div>
                        <label className={compactLabelClasses()}>Product</label>
                        <select
                          value={item.productId || ''}
                          onChange={(e) => applyProductToItem(index, e.target.value)}
                          className={compactInputClasses()}
                        >
                          <option value="">Custom item</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name || product.description || 'Unnamed Product'}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={compactLabelClasses()}>Description</label>
                        <input
                          value={item.desc}
                          onChange={(e) => updateItem(index, 'desc', e.target.value)}
                          placeholder="Item description"
                          className={compactInputClasses()}
                        />
                      </div>

                      <div>
                        <label className={compactLabelClasses()}>Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => updateItem(index, 'qty', Number(e.target.value))}
                          className={compactInputClasses()}
                        />
                      </div>

                      <div>
                        <label className={compactLabelClasses()}>Rate</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => updateItem(index, 'rate', Number(e.target.value))}
                          className={compactInputClasses()}
                        />
                      </div>

                      <div>
                        <label className={compactLabelClasses()}>Unit</label>
                        <input
                          value={item.unit || 'each'}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                          placeholder="ea"
                          className={`${compactInputClasses()} text-center`}
                        />
                      </div>

                      <div className="flex items-end xl:justify-end">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="min-w-[96px] rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 text-right text-sm text-zinc-400">
                      Line Total:{' '}
                      <span className="text-white font-medium">
                        {formatMoney(item.qty * item.rate, currencyCode, currencyLocale)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className={compactLabelClasses()}>VAT %</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={vat}
                    onChange={(e) => setVat(Number(e.target.value))}
                    className={compactInputClasses()}
                  />
                </div>

                <div>
                  <label className={compactLabelClasses()}>Source Quote</label>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-white min-h-[44px] flex items-center">
                    {sourceQuoteNumber || 'Not linked to a quote'}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className={compactLabelClasses()}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes or payment terms"
                  rows={5}
                  className={`${compactInputClasses()} resize-y`}
                />
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-zinc-900 px-4 py-3 border border-zinc-800">
                    <div className="text-zinc-500 text-xs uppercase tracking-[0.12em] mb-1">
                      Subtotal
                    </div>
                    <div className="font-semibold text-white">
                      {formatMoney(totals.subtotal, currencyCode, currencyLocale)}
                    </div>
                  </div>

                  <div className="rounded-xl bg-zinc-900 px-4 py-3 border border-zinc-800">
                    <div className="text-zinc-500 text-xs uppercase tracking-[0.12em] mb-1">
                      VAT
                    </div>
                    <div className="font-semibold text-white">
                      {formatMoney(totals.vatAmount, currencyCode, currencyLocale)}
                    </div>
                  </div>

                  <div className="rounded-xl bg-emerald-500/10 px-4 py-3 border border-emerald-500/20">
                    <div className="text-emerald-300 text-xs uppercase tracking-[0.12em] mb-1">
                      Total
                    </div>
                    <div className="font-semibold text-white text-base">
                      {formatMoney(totals.total, currencyCode, currencyLocale)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveInvoice}
                  disabled={saving}
                  className="rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-5 py-3 text-sm font-semibold text-white"
                >
                  {saving ? 'Saving...' : editingInvoiceId ? 'Update Invoice' : 'Save Invoice'}
                </button>

                <button
                  type="button"
                  onClick={downloadInvoice}
                  disabled={downloading}
                  className="rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-5 py-3 text-sm font-semibold text-white"
                >
                  {downloading ? 'Preparing PDF...' : 'Download PDF'}
                </button>

                <button
                  type="button"
                  onClick={openEmailClient}
                  disabled={openingEmail}
                  className="rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 px-5 py-3 text-sm font-semibold text-white"
                >
                  {openingEmail ? 'Opening...' : 'Email Client'}
                </button>

                <button
                  type="button"
                  onClick={openWhatsAppShare}
                  disabled={sharingWhatsApp}
                  className="rounded-2xl bg-green-600 hover:bg-green-500 disabled:opacity-60 px-5 py-3 text-sm font-semibold text-white"
                >
                  {sharingWhatsApp ? 'Opening...' : 'WhatsApp'}
                </button>

                <button
                  type="button"
                  onClick={copyPublicLink}
                  disabled={copyingLink}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-60 px-5 py-3 text-sm font-semibold text-white"
                >
                  {copyingLink ? 'Copying...' : 'Copy Link'}
                </button>

                <button
                  type="button"
                  onClick={openPublicInvoice}
                  disabled={openingPublic}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-60 px-5 py-3 text-sm font-semibold text-white"
                >
                  {openingPublic ? 'Opening...' : 'View Public'}
                </button>
              </div>
            </div>
          </div>

          <aside className="xl:w-[380px] shrink-0">
            <div className="sticky top-24 space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Live Preview</h3>
                    <p className="text-zinc-500 text-sm">Compact invoice snapshot</p>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Status</div>
                    <div className="text-sm font-medium text-white">
                      {savedInvoice?.status || 'Unpaid'}
                    </div>
                  </div>
                </div>

                {embeddedLogoSrc ? (
                  <div className="mb-4 h-16 w-full flex items-center justify-start overflow-hidden rounded-2xl border border-zinc-800 bg-white px-4">
                    <img
                      src={embeddedLogoSrc}
                      alt="Business Logo"
                      className="max-h-12 w-auto object-contain"
                    />
                  </div>
                ) : null}

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-zinc-500 mb-1">
                        Invoice
                      </div>
                      <div className="font-semibold text-white">{invoiceNo || 'INV-DRAFT'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-[0.12em] text-zinc-500 mb-1">
                        Date
                      </div>
                      <div className="font-medium text-white">{date}</div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-[0.12em] text-zinc-500 mb-1">
                      Client
                    </div>
                    <div className="font-medium text-white">{client || 'Client Name'}</div>
                    <div className="text-sm text-zinc-400">{clientEmail || 'No email added yet'}</div>
                  </div>

                  {sourceQuoteNumber ? (
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-[0.12em] text-zinc-500 mb-1">
                        Source Quote
                      </div>
                      <div className="font-medium text-white">{sourceQuoteNumber}</div>
                    </div>
                  ) : null}

                  {isRecurring && isPro ? (
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-[0.12em] text-zinc-500 mb-1">
                        Billing
                      </div>
                      <div className="font-medium text-white">Recurring monthly</div>
                    </div>
                  ) : null}

                  <div className="space-y-3 border-t border-zinc-800 pt-4">
                    {validItems.slice(0, 3).map((item, index) => (
                      <div key={index} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{item.desc || 'Untitled item'}</div>
                          <div className="text-xs text-zinc-500">
                            {item.qty} × {formatMoney(item.rate, currencyCode, currencyLocale)}
                          </div>
                        </div>
                        <div className="text-sm font-medium text-white whitespace-nowrap">
                          {formatMoney(item.qty * item.rate, currencyCode, currencyLocale)}
                        </div>
                      </div>
                    ))}

                    {validItems.length > 3 ? (
                      <div className="text-xs text-zinc-500">
                        + {validItems.length - 3} more item{validItems.length - 3 === 1 ? '' : 's'}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 border-t border-zinc-800 pt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Subtotal</span>
                      <span className="text-white">
                        {formatMoney(totals.subtotal, currencyCode, currencyLocale)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">VAT ({vat}%)</span>
                      <span className="text-white">
                        {formatMoney(totals.vatAmount, currencyCode, currencyLocale)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-base font-semibold">
                      <span className="text-white">Total</span>
                      <span className="text-emerald-400">
                        {formatMoney(totals.total, currencyCode, currencyLocale)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Recent Invoices</h3>
                    <p className="text-zinc-500 text-sm">Quick access to your latest invoices</p>
                  </div>
                </div>

                {recentInvoices.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
                    No recent invoices yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-white truncate">
                              {invoice.number || 'Invoice'}
                            </div>
                            <div className="text-sm text-zinc-400 truncate">
                              {invoice.client || 'Unknown Client'}
                            </div>
                          </div>
                          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300">
                            {getInvoiceBadge(invoice)}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <span className="text-zinc-500">
                            {toDate(invoice.createdAt)?.toLocaleDateString() || invoice.date || '—'}
                          </span>
                          <span className="font-medium text-white">
                            {formatMoney(
                              invoice.total,
                              invoice.currencyCode || currencyCode,
                              invoice.currencyLocale || currencyLocale
                            )}
                          </span>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Link
                            href={`/new-invoice?invoiceId=${invoice.id}`}
                            className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-center text-sm font-medium text-white"
                          >
                            Open
                          </Link>
                          <button
                            type="button"
                            onClick={() => window.open(getPublicDocLink('invoice', invoice.id), '_blank', 'noopener,noreferrer')}
                            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-2 text-sm font-medium text-white"
                          >
                            Public
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-5">
                <div className="text-sm text-zinc-400">
                  Tip: when you use Email Client, WhatsApp, Copy Link, or View Public, the invoice is saved as
                  share-ready and a public link is generated on your real domain.
                </div>
              </div>
            </div>
          </aside>
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
      </main>
    </div>
  );
}