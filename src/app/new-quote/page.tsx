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

type SavedQuoteState = {
  quoteId: string;
  quoteNumber: string;
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

function formatDateForInput(value: any) {
  const parsed = toDate(value);
  if (!parsed) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    return new Date().toISOString().split('T')[0];
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateQuoteNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const t = String(now.getTime()).slice(-5);
  return `QTE-${y}${m}${d}-${t}`;
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
      // try next candidate
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
      // Try next candidate
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

function buildLeadPrefillNotes(leadMessage?: string | null, leadPhone?: string | null) {
  const sections: string[] = [];

  if (leadMessage?.trim()) {
    sections.push(`Lead enquiry:\n${leadMessage.trim()}`);
  }

  if (leadPhone?.trim()) {
    sections.push(`Contact number:\n${leadPhone.trim()}`);
  }

  return sections.join('\n\n');
}

export default function NewQuote() {
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
  const [quoteNo, setQuoteNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDays, setExpiryDays] = useState(7);
  const [previewHTML, setPreviewHTML] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [openingEmail, setOpeningEmail] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [openingPublic, setOpeningPublic] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [savedQuote, setSavedQuote] = useState<SavedQuoteState | null>(null);

  const [sourceLeadId, setSourceLeadId] = useState<string | null>(null);
  const [sourceLeadPhone, setSourceLeadPhone] = useState('');
  const [sourceLeadMessage, setSourceLeadMessage] = useState('');
  const [prefillApplied, setPrefillApplied] = useState(false);

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

        const [custSnap, docsSnap, productSnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid))),
          getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid))),
          getDocs(query(collection(db, 'products'), where('userId', '==', u.uid))),
        ]);

        setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[]);
        setUsageCount(docsSnap.size);

        const activeProducts = productSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ProductType)
          .filter((p) => p.isActive !== false);

        setProducts(activeProducts);

        const urlParams = new URLSearchParams(window.location.search);
        const quoteId = urlParams.get('quoteId');
        const duplicateFrom = urlParams.get('duplicateFrom');

        if (!quoteId) {
          setEditingQuoteId(null);
        }

        if (!quoteId && !duplicateFrom) {
          setQuoteNo(generateQuoteNumber());
        }
      } catch (err) {
        console.error('Quote page load error:', err);
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
        console.error('Failed to prepare logo for quote PDF:', err);
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
    if (!user) return;

    const urlParams = new URLSearchParams(window.location.search);
    const customerId = urlParams.get('customerId');
    const quoteId = urlParams.get('quoteId');
    const duplicateFrom = urlParams.get('duplicateFrom');
    const leadId = urlParams.get('leadId');
    const leadName = urlParams.get('leadName');
    const leadEmail = urlParams.get('leadEmail');
    const leadPhone = urlParams.get('leadPhone');
    const leadMessage = urlParams.get('leadMessage');

    const loadExistingQuote = async (id: string) => {
      try {
        const quoteRef = doc(db, 'documents', id);
        const quoteSnap = await getDoc(quoteRef);

        if (!quoteSnap.exists()) return;

        const data = quoteSnap.data();

        if (data.userId !== user.uid || data.type !== 'quote') return;

        const snapshotProfile = applyBusinessSnapshotToProfile(data.businessSnapshot);
        if (snapshotProfile) {
          setProfile(snapshotProfile);
          if (snapshotProfile.logo) {
            setEmbeddedLogoSrc(snapshotProfile.logo);
          }
        }

        setEditingQuoteId(quoteSnap.id);
        setSavedQuote({
          quoteId: quoteSnap.id,
          quoteNumber: data.number || '',
          status: data.status || 'draft',
        });
        setQuoteNo(data.number || '');
        setDate(formatDateForInput(data.date));
        setClient(data.client || '');
        setClientEmail(data.clientEmail || '');
        setSelectedCustomerId(data.customerId || '');
        setItems(
          Array.isArray(data.items) && data.items.length > 0
            ? data.items.map((item: any) => ({
                productId: item.productId ?? null,
                desc: item.desc || '',
                qty: Number(item.qty || 1),
                rate: Number(item.rate || 0),
                unit: item.unit || 'each',
              }))
            : [{ productId: null, desc: '', qty: 1, rate: 0, unit: 'each' }]
        );
        setVat(typeof data.vat === 'number' ? data.vat : Number(data.vat || 15));
        setNotes(data.notes || 'Thank you for your business!');
        setExpiryDays(
          typeof data.expiryDays === 'number' ? data.expiryDays : Number(data.expiryDays || 7)
        );
        setSourceLeadId(data.sourceLeadId || null);
        setSourceLeadPhone(data.sourceLeadPhone || '');
        setSourceLeadMessage(data.sourceLeadMessage || '');
      } catch (err) {
        console.error('Load quote error:', err);
      }
    };

    const loadDuplicateQuote = async (id: string) => {
      try {
        const quoteRef = doc(db, 'documents', id);
        const quoteSnap = await getDoc(quoteRef);

        if (!quoteSnap.exists()) return;

        const data = quoteSnap.data();

        if (data.userId !== user.uid || data.type !== 'quote') return;

        const snapshotProfile = applyBusinessSnapshotToProfile(data.businessSnapshot);
        if (snapshotProfile) {
          setProfile(snapshotProfile);
          if (snapshotProfile.logo) {
            setEmbeddedLogoSrc(snapshotProfile.logo);
          }
        }

        setEditingQuoteId(null);
        setSavedQuote(null);
        setQuoteNo(generateQuoteNumber());
        setDate(new Date().toISOString().split('T')[0]);
        setClient(data.client || '');
        setClientEmail(data.clientEmail || '');
        setSelectedCustomerId(data.customerId || '');
        setItems(
          Array.isArray(data.items) && data.items.length > 0
            ? data.items.map((item: any) => ({
                productId: item.productId ?? null,
                desc: item.desc || '',
                qty: Number(item.qty || 1),
                rate: Number(item.rate || 0),
                unit: item.unit || 'each',
              }))
            : [{ productId: null, desc: '', qty: 1, rate: 0, unit: 'each' }]
        );
        setVat(typeof data.vat === 'number' ? data.vat : Number(data.vat || 15));
        setNotes(data.notes || 'Thank you for your business!');
        setExpiryDays(
          typeof data.expiryDays === 'number' ? data.expiryDays : Number(data.expiryDays || 7)
        );
        setSourceLeadId(data.sourceLeadId || null);
        setSourceLeadPhone(data.sourceLeadPhone || '');
        setSourceLeadMessage(data.sourceLeadMessage || '');
      } catch (err) {
        console.error('Load duplicate quote error:', err);
      }
    };

    if (quoteId) {
      loadExistingQuote(quoteId);
      return;
    }

    if (duplicateFrom) {
      loadDuplicateQuote(duplicateFrom);
      return;
    }

    if (!prefillApplied) {
      if (customerId && customers.length > 0) {
        const cust = customers.find((c) => c.id === customerId);
        if (cust) {
          setSelectedCustomerId(cust.id);
          setClient(cust.name || '');
          setClientEmail(cust.email || '');
        }
      }

      if (leadId || leadName || leadEmail || leadPhone || leadMessage) {
        setSourceLeadId(leadId || null);
        setSourceLeadPhone(leadPhone || '');
        setSourceLeadMessage(leadMessage || '');

        if (!customerId) {
          if (leadName) setClient(leadName);
          if (leadEmail) setClientEmail(leadEmail);
        }

        const leadPrefillBlock = buildLeadPrefillNotes(leadMessage, leadPhone);
        if (leadPrefillBlock) {
          setNotes((prev) => {
            const base = (prev || '').trim();
            if (base.includes(leadPrefillBlock)) {
              return prev;
            }
            if (!base) return leadPrefillBlock;
            return `${base}\n\n${leadPrefillBlock}`;
          });
        }
      }

      setPrefillApplied(true);
    }
  }, [customers, user, prefillApplied]);

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

  const getValidUntilDate = () => {
    const base = new Date(date);
    if (Number.isNaN(base.getTime())) {
      return new Date(Date.now() + expiryDays * 86400000);
    }
    return new Date(base.getTime() + expiryDays * 86400000);
  };

  const validUntil = getValidUntilDate();

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
            <h1 style="font-size:30px; color:#10b981; margin:0 0 10px 0; letter-spacing:0.02em;">QUOTE</h1>
            <div style="font-weight:700; margin-bottom:8px;">${escapeHtml(quoteNo || 'QTE-DRAFT')}</div>
            <div style="font-size:14px; color:#374151;">Date: ${escapeHtml(date)}</div>
            <div style="font-size:14px; color:#374151; margin-top:4px;">Valid until: ${escapeHtml(validUntil.toLocaleDateString(currencyLocale))}</div>
          </div>
        </div>

        <div style="margin: 28px 0;">
          <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#6b7280; margin-bottom:6px;">Quote For</div>
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
    quoteNo,
    date,
    validUntil,
    currencyLocale,
    client,
    clientEmail,
    validItems,
    totals.subtotal,
    totals.vatAmount,
    totals.total,
    vat,
    notes,
    currencyCode,
  ]);

  const generatePdfBlob = async () => {
    const pdfContainer = document.createElement('div');
    pdfContainer.style.position = 'fixed';
    pdfContainer.style.left = '-10000px';
    pdfContainer.style.top = '0';
    pdfContainer.style.width = '860px';
    pdfContainer.style.background = 'white';
    pdfContainer.innerHTML = previewHTML;
    document.body.appendChild(pdfContainer);

    try {
      const canvas = await html2canvas(pdfContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
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
    link.download = filename || `${quoteNo || 'quote'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(blobUrl);
  };

  const validateQuote = () => {
    if (!user) {
      alert('Please sign in');
      return false;
    }

    if (!profileComplete) {
      alert(
        'Please complete your profile first. Business Name, Owner Name, Business Email and Contact Number are required before creating quotes.'
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

    if (!isPro && usageCount >= 10 && !editingQuoteId) {
      alert('Free limit reached (10 docs). Upgrade to Pro!');
      return false;
    }

    return true;
  };

  const buildLifecycleFields = (status: string = 'draft', existingDoc?: any) => {
    const now = Timestamp.now();

    const base: Record<string, any> = {
      status,
      updatedAt: now,
      lastActivityAt: now,
      sentAt: existingDoc?.sentAt || null,
      viewedAt: existingDoc?.viewedAt || null,
      lastViewedAt: existingDoc?.lastViewedAt || null,
      acceptedAt: existingDoc?.acceptedAt || null,
      viewCount: Number(existingDoc?.viewCount || 0),
    };

    if (status === 'sent') {
      base.sentAt = existingDoc?.sentAt || now;
      base.lastActivityAt = now;
    }

    if (status === 'viewed') {
      base.sentAt = existingDoc?.sentAt || now;
      base.viewedAt = existingDoc?.viewedAt || now;
      base.lastViewedAt = now;
      base.viewCount = Number(existingDoc?.viewCount || 0) + 1;
      base.lastActivityAt = now;
    }

    if (status === 'accepted') {
      base.sentAt = existingDoc?.sentAt || now;
      base.acceptedAt = existingDoc?.acceptedAt || now;
      base.lastActivityAt = now;
    }

    if (status === 'draft') {
      base.lastActivityAt = existingDoc?.lastActivityAt || now;
    }

    return base;
  };

  const buildQuoteDocData = async (
    status: string = 'draft',
    existingDoc?: any,
    options?: { forcePublic?: boolean }
  ) => {
    const quoteNumber = quoteNo || generateQuoteNumber();
    const validUntilDate = getValidUntilDate();
    const lifecycleFields = buildLifecycleFields(status, existingDoc);
    const resolvedLogo = await resolveLatestLogoUrl(
      user!.uid,
      existingDoc?.businessSnapshot?.logo || profile.logo || ''
    );
    const businessSnapshot = createBusinessSnapshot(profile, {
      logo: resolvedLogo || existingDoc?.businessSnapshot?.logo || profile.logo || '',
      currencyCode,
      currencyLocale,
    });

    return {
      quoteNumber,
      docData: {
        userId: user!.uid,
        type: 'quote',
        number: quoteNumber,
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
        expiryDays,
        expiryDate: Timestamp.fromDate(validUntilDate),
        validUntilText: formatDateForInput(validUntilDate),
        convertedToInvoice: existingDoc?.convertedToInvoice === true,
        convertedInvoiceId: existingDoc?.convertedInvoiceId || null,
        paid: false,
        paymentStatus: 'not_applicable',
        sourceDocumentId: null,
        sourceLeadId: sourceLeadId || existingDoc?.sourceLeadId || null,
        sourceLeadPhone: sourceLeadPhone || existingDoc?.sourceLeadPhone || '',
        sourceLeadMessage: sourceLeadMessage || existingDoc?.sourceLeadMessage || '',
        sourceType:
          (sourceLeadId || existingDoc?.sourceLeadId) ? 'crm_lead' : existingDoc?.sourceType || null,
        isPublic: options?.forcePublic === true ? true : existingDoc?.isPublic === true,
        ...lifecycleFields,
      },
    };
  };

  const syncLeadStatusIfNeeded = async () => {
    if (!sourceLeadId) return;

    try {
      const leadRef = doc(db, 'leads', sourceLeadId);
      const leadSnap = await getDoc(leadRef);

      if (!leadSnap.exists()) return;
      const leadData = leadSnap.data();

      if (leadData.userId !== user?.uid) return;
      if (leadData.status === 'quoted' || leadData.status === 'won' || leadData.status === 'repeat') {
        return;
      }

      await updateDoc(leadRef, {
        status: 'quoted',
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.error('Failed to sync lead status:', err);
    }
  };

  const persistQuote = async (
    status: string = 'draft',
    options?: { forcePublic?: boolean }
  ) => {
    let existingDoc: any = null;

    if (editingQuoteId) {
      const existingSnap = await getDoc(doc(db, 'documents', editingQuoteId));
      if (existingSnap.exists()) {
        existingDoc = existingSnap.data();
      }
    }

    const { quoteNumber, docData } = await buildQuoteDocData(status, existingDoc, options);

    let quoteId = editingQuoteId;

    if (editingQuoteId) {
      await updateDoc(doc(db, 'documents', editingQuoteId), docData);
      quoteId = editingQuoteId;
    } else {
      const newDocRef = await addDoc(collection(db, 'documents'), {
        ...docData,
        createdAt: Timestamp.now(),
      });
      quoteId = newDocRef.id;
      setEditingQuoteId(newDocRef.id);
      setUsageCount((prev) => prev + 1);
    }

    if (!quoteNo) {
      setQuoteNo(quoteNumber);
    }

    if (sourceLeadId) {
      await syncLeadStatusIfNeeded();
    }

    const savedState = { quoteId: quoteId!, quoteNumber, status };
    setSavedQuote(savedState);

    return savedState;
  };

  const saveQuote = async () => {
    if (!validateQuote()) return;

    try {
      setSaving(true);
      await persistQuote('draft');
      alert(editingQuoteId ? 'Quote updated successfully!' : 'Quote saved successfully!');
      router.push('/quotes');
    } catch (err: any) {
      console.error('Save quote error:', err);
      alert('Failed to save quote: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const downloadQuote = async () => {
    if (!validateQuote()) return;

    try {
      setDownloading(true);
      const { quoteNumber } = await persistQuote('draft');
      await downloadPdfFile(`${quoteNumber || 'quote'}.pdf`);
      alert('Quote PDF downloaded successfully!');
    } catch (err: any) {
      console.error('Download quote error:', err);
      alert('Failed to download quote: ' + (err.message || 'Unknown error'));
    } finally {
      setDownloading(false);
    }
  };

  const openEmailClient = async () => {
    if (!validateQuote()) return;

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

      const { quoteId, quoteNumber } = await persistQuote('sent', { forcePublic: true });
      const publicLink = getPublicDocLink('quote', quoteId);

      const subject = encodeURIComponent(
        `Quote ${quoteNumber} from ${profile.businessName || 'RealQte'}`
      );

      const body = encodeURIComponent(
        `Hello ${client},

Please view your quote using the secure link below:

${publicLink}

Quote Number: ${quoteNumber}
Valid Until: ${validUntil.toLocaleDateString(currencyLocale)}
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
    if (!validateQuote()) return;

    try {
      setSharingWhatsApp(true);

      const { quoteId, quoteNumber } = await persistQuote('sent', { forcePublic: true });
      const publicLink = getPublicDocLink('quote', quoteId);

      const message = `Hello ${client},

Please view your quote from ${profile.businessName || 'RealQte'} using the secure link below:

${publicLink}

Quote Number: ${quoteNumber}
Valid Until: ${validUntil.toLocaleDateString(currencyLocale)}
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
    if (!validateQuote()) return;

    try {
      setCopyingLink(true);

      const { quoteId } = await persistQuote('sent', { forcePublic: true });
      const publicLink = getPublicDocLink('quote', quoteId);

      await copyToClipboard(publicLink);
    } catch (err: any) {
      console.error('Copy quote link error:', err);
      alert('Failed to copy quote link: ' + (err.message || 'Unknown error'));
    } finally {
      setCopyingLink(false);
    }
  };

  const openPublicQuote = async () => {
    if (!validateQuote()) return;

    try {
      setOpeningPublic(true);

      const { quoteId } = await persistQuote('sent', { forcePublic: true });
      const publicLink = getPublicDocLink('quote', quoteId);

      window.open(publicLink, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      console.error('Open public quote error:', err);
      alert('Failed to open public quote: ' + (err.message || 'Unknown error'));
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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading quote builder.
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between mb-6">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] mb-2">
              Quote builder
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {editingQuoteId ? 'Edit Quote' : 'New Quote'}
            </h1>
            <p className="text-zinc-400 mt-2 text-sm sm:text-base">
              Build the quote once, then save, download, email, WhatsApp, or open the public link.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/quotes"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Back to Quotes
            </Link>
            {editingQuoteId && (
              <Link
                href={`/new-quote?duplicateFrom=${editingQuoteId}`}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Duplicate
              </Link>
            )}
          </div>
        </div>

        {sourceLeadId && !editingQuoteId && (
          <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
            <h2 className="text-base font-semibold text-blue-200">CRM lead prefilled</h2>
            <p className="mt-1 text-sm text-blue-100/80">
              This quote was started from a CRM lead. Client details and lead notes were prefilled for you.
            </p>
          </div>
        )}

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
              Complete your profile before creating quotes.
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

        {savedQuote && (
          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <h2 className="text-base font-semibold text-emerald-200">
              Quote ready to share
            </h2>
            <p className="mt-1 text-sm text-emerald-100/80">
              {savedQuote.quoteNumber} has been saved and its public link is ready.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openPublicQuote}
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

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)] gap-6">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className={compactLabelClasses()}>Quote Number</label>
                <input
                  value={quoteNo}
                  onChange={(e) => setQuoteNo(e.target.value)}
                  placeholder="QTE-..."
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
                <label className={compactLabelClasses()}>Validity</label>
                <select
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                  className={compactInputClasses()}
                >
                  <option value={7}>7 days</option>
                  <option value={15}>15 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                </select>
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
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.7fr)_minmax(0,4.6fr)_88px_minmax(120px,1.6fr)] gap-3">
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
                          placeholder="1"
                          className={compactInputClasses()}
                        />
                      </div>

                      <div>
                        <label className={compactLabelClasses()}>Rate</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate === 0 ? '' : item.rate}
                          onChange={(e) => updateItem(index, 'rate', e.target.value === '' ? 0 : Number(e.target.value))}
                          placeholder="0.00"
                          className={compactInputClasses()}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 xl:justify-end">
                      <div className="w-full sm:w-[110px]">
                        <label className={compactLabelClasses()}>Unit</label>
                        <input
                          value={item.unit || 'each'}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                          placeholder="each"
                          className={`${compactInputClasses()} text-center`}
                        />
                      </div>

                      <div className="flex items-end xl:justify-end">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="w-full sm:min-w-[110px] rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap"
                        >
                          Remove
                        </button>
                      </div>
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
                <label className={compactLabelClasses()}>Valid Until</label>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-white min-h-[44px] flex items-center">
                  {validUntil.toLocaleDateString(currencyLocale)}
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
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Subtotal</span>
                  <span className="text-white">
                    {formatMoney(totals.subtotal, currencyCode, currencyLocale)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">VAT ({vat}%)</span>
                  <span className="text-white">
                    {formatMoney(totals.vatAmount, currencyCode, currencyLocale)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-base font-semibold">
                  <span className="text-white">Total</span>
                  <span className="text-emerald-400">
                    {formatMoney(totals.total, currencyCode, currencyLocale)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveQuote}
                disabled={saving}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-white"
              >
                {saving ? 'Saving...' : editingQuoteId ? 'Update Quote' : 'Save Quote'}
              </button>

              <button
                type="button"
                onClick={downloadQuote}
                disabled={downloading}
                className="rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-white"
              >
                {downloading ? 'Preparing PDF...' : 'Download Quote'}
              </button>

              <button
                type="button"
                onClick={openEmailClient}
                disabled={openingEmail}
                className="rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-white"
              >
                {openingEmail ? 'Opening...' : 'Email Client'}
              </button>

              <button
                type="button"
                onClick={openWhatsAppShare}
                disabled={sharingWhatsApp}
                className="rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-white"
              >
                {sharingWhatsApp ? 'Opening...' : 'WhatsApp'}
              </button>

              <button
                type="button"
                onClick={copyPublicLink}
                disabled={copyingLink}
                className="rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-white"
              >
                {copyingLink ? 'Copying...' : 'Copy Link'}
              </button>

              <button
                type="button"
                onClick={openPublicQuote}
                disabled={openingPublic}
                className="rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-white"
              >
                {openingPublic ? 'Opening...' : 'View Public'}
              </button>
            </div>
          </section>

          <aside className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-[0.16em] mb-1">Live Preview</p>
                <h2 className="text-lg font-semibold text-white">Quote Preview</h2>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-white overflow-hidden">
              <div
                className="max-h-[900px] overflow-auto"
                dangerouslySetInnerHTML={{ __html: previewHTML }}
              />
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
