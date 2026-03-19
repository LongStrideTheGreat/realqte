'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
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
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

export default function NewQuote() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
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
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const profileComplete = useMemo(() => {
    return Boolean(
      profile.businessName?.trim() &&
        profile.ownerName?.trim() &&
        profile.businessEmail?.trim() &&
        profile.phone?.trim()
    );
  }, [profile]);

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
          setProfile(data.profile || {});
          setIsPro(isSubscriptionActive(data));
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
    if (!user) return;

    const urlParams = new URLSearchParams(window.location.search);
    const customerId = urlParams.get('customerId');
    const quoteId = urlParams.get('quoteId');
    const duplicateFrom = urlParams.get('duplicateFrom');

    const loadExistingQuote = async (id: string) => {
      try {
        const quoteRef = doc(db, 'documents', id);
        const quoteSnap = await getDoc(quoteRef);

        if (!quoteSnap.exists()) return;

        const data = quoteSnap.data();

        if (data.userId !== user.uid || data.type !== 'quote') return;

        setEditingQuoteId(quoteSnap.id);
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

        setEditingQuoteId(null);
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

    if (customerId && customers.length > 0) {
      const cust = customers.find((c) => c.id === customerId);
      if (cust) {
        setSelectedCustomerId(cust.id);
        setClient(cust.name || '');
        setClientEmail(cust.email || '');
      }
    }
  }, [customers, user]);

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

  const validItems = items.filter((item) => item.desc.trim() && item.qty > 0);

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
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 40px; background: white; color: black; border: 1px solid #ddd;">
        ${profile.logo ? `<img src="${profile.logo}" alt="Logo" style="max-height: 80px; margin-bottom: 20px;">` : ''}
        <h1 style="text-align: center; font-size: 32px; color: #10b981; margin-bottom: 10px;">QUOTE</h1>
        <div style="display: flex; justify-content: space-between; gap: 20px; font-size: 14px;">
          <div>
            <strong>${profile.businessName || 'Your Business'}</strong><br>
            ${profile.ownerName || ''}${profile.ownerName ? '<br>' : ''}
            ${profile.phone ? `${profile.phone}<br>` : ''}
            ${profile.businessEmail ? `${profile.businessEmail}<br>` : ''}
            ${profile.physicalAddress ? `${profile.physicalAddress}<br>` : ''}
            ${profile.vatNumber ? `VAT No: ${profile.vatNumber}<br>` : ''}
            ${profile.taxNumber ? `Tax No: ${profile.taxNumber}` : ''}
          </div>
          <div style="text-align: right;">
            <strong>${quoteNo || 'QTE-DRAFT'}</strong><br>
            Date: ${date}<br>
            Valid until: ${validUntil.toLocaleDateString()}
          </div>
        </div>

        <div style="margin: 30px 0;">
          <strong>Quote For:</strong><br>
          ${client || 'Client Name'}<br>
          ${clientEmail || ''}
        </div>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="text-align:left;padding:10px;border-bottom:2px solid #ddd;">Description</th>
              <th style="padding:10px;border-bottom:2px solid #ddd;">Qty</th>
              <th style="padding:10px;border-bottom:2px solid #ddd;">Rate</th>
              <th style="text-align:right;padding:10px;border-bottom:2px solid #ddd;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${validItems
              .map(
                (item) => `
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px;">${item.desc}</td>
                  <td style="text-align:center;padding:10px;">${item.qty}</td>
                  <td style="text-align:center;padding:10px;">R${item.rate.toFixed(2)}</td>
                  <td style="text-align:right;padding:10px;">R${(item.qty * item.rate).toFixed(2)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>

        <div style="text-align:right;margin-top:20px;">
          Subtotal: R${totals.subtotal.toFixed(2)}<br>
          VAT (${vat}%): R${totals.vatAmount.toFixed(2)}<br>
          <strong style="font-size:18px;">Total: R${totals.total.toFixed(2)}</strong>
        </div>

        ${
          profile.bankDetails
            ? `
          <div style="margin-top:40px;font-size:12px;border-top:1px solid #ddd;padding-top:10px;">
            <strong>Banking Details:</strong><br>
            ${profile.bankDetails.replace(/\n/g, '<br>')}
          </div>
        `
            : ''
        }

        <div style="margin-top:30px;font-style:italic;font-size:14px;">
          ${notes || ''}
        </div>
      </div>
    `;

    setPreviewHTML(html);
  }, [profile, validItems, vat, client, clientEmail, date, quoteNo, notes, expiryDays, totals, validUntil]);

  const generatePdfBlob = async () => {
    const pdfContainer = document.createElement('div');
    pdfContainer.innerHTML = previewHTML;
    pdfContainer.style.position = 'absolute';
    pdfContainer.style.left = '-9999px';
    pdfContainer.style.top = '0';
    pdfContainer.style.width = '820px';

    document.body.appendChild(pdfContainer);

    try {
      const canvas = await html2canvas(pdfContainer, { scale: 2, useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight);
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

  const buildQuoteDocData = (status: string = 'draft') => {
    const quoteNumber = quoteNo || generateQuoteNumber();
    const validUntilDate = getValidUntilDate();

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
        expiryDays,
        expiryDate: Timestamp.fromDate(validUntilDate),
        validUntilText: formatDateForInput(validUntilDate),
        status,
        convertedToInvoice: false,
        convertedInvoiceId: null,
        paid: false,
        paymentStatus: 'not_applicable',
        sourceDocumentId: null,
        updatedAt: Timestamp.now(),
      },
    };
  };

  const persistQuote = async (status: string = 'draft') => {
    const { quoteNumber, docData } = buildQuoteDocData(status);

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
    }

    if (!quoteNo) {
      setQuoteNo(quoteNumber);
    }

    return { quoteId, quoteNumber };
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

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      alert('Please enter a valid client email address.');
      return;
    }

    try {
      setOpeningEmail(true);

      const { quoteNumber } = await persistQuote('sent');

      const subject = encodeURIComponent(
        `Quote ${quoteNumber} from ${profile.businessName || 'RealQte'}`
      );

      const body = encodeURIComponent(
        `Hello ${client},

Please find your quote attached.

Quote Number: ${quoteNumber}
Valid Until: ${validUntil.toLocaleDateString()}
Total: R${totals.total.toFixed(2)}

Please attach the downloaded PDF to this email before sending.

Kind regards,
${profile.ownerName || profile.businessName || 'RealQte'}
${profile.businessEmail ? `\n${profile.businessEmail}` : ''}`
      );

      window.location.href = `mailto:${trimmedEmail}?subject=${subject}&body=${body}`;
    } catch (err: any) {
      console.error('Open email client error:', err);
      alert('Failed to open email client: ' + (err.message || 'Unknown error'));
    } finally {
      setOpeningEmail(false);
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
        Loading quote page...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-emerald-400 truncate">
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
              <Link href="/new-quote" className="text-emerald-400 font-medium">
                New Quote
              </Link>
              <Link href="/products" className="text-zinc-400 hover:text-white">
                Products
              </Link>
              <Link href="/quotes" className="text-zinc-400 hover:text-white">
                Quotes
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
              <button onClick={handleLogout} className="text-red-400 hover:underline">
                Logout
              </button>
            </nav>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="xl:hidden inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="xl:hidden mt-4 border-t border-zinc-800 pt-4">
              <div className="grid grid-cols-1 gap-2 text-sm">
                <Link
                  href="/"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Dashboard
                </Link>
                <Link
                  href="/new-invoice"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  New Invoice
                </Link>
                <Link
                  href="/new-quote"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-emerald-400 bg-emerald-500/10 font-medium"
                >
                  New Quote
                </Link>
                <Link
                  href="/products"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Products
                </Link>
                <Link
                  href="/quotes"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Quotes
                </Link>
                <Link
                  href="/invoices"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Invoices
                </Link>
                <Link
                  href="/customers"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Customers
                </Link>
                <Link
                  href="/accounting"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Accounting
                </Link>
                <Link
                  href="/reporting"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Reports
                </Link>
                <Link
                  href="/profile"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-left rounded-xl px-3 py-2 text-red-400 hover:bg-zinc-800"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            {editingQuoteId ? 'Edit Quote' : 'New Quote'}
          </h1>
          <p className="text-zinc-400">
            {editingQuoteId
              ? 'Update your existing quote, download the PDF, or open your email client to send it yourself.'
              : 'Create a professional quote, save it, download the PDF, or open your email client to send it yourself.'}
          </p>
        </div>

        {!profileComplete && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-2xl p-5 mb-8">
            Your profile is incomplete. Please complete Business Name, Owner Name, Business Email and
            Contact Number before saving quotes.
            <div className="mt-3">
              <Link href="/profile" className="text-emerald-400 hover:underline">
                Go to Profile
              </Link>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 rounded-3xl p-6 sm:p-8 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Quote Number</label>
              <input
                value={quoteNo}
                onChange={(e) => setQuoteNo(e.target.value)}
                placeholder="QTE-1001"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Quote Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm text-zinc-400 mb-2">Select Customer - (Add customers on the Customers page)</label>
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
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Select Customer (auto-fills details)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Client Name</label>
              <input
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Client Name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Client Email</label>
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="Client Email"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm text-zinc-400 mb-2">Quote valid for</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(parseInt(e.target.value, 10))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            >
              <option value={7}>7 days</option>
              <option value={15}>15 days</option>
              <option value={30}>30 days</option>
            </select>
            <p className="text-sm text-zinc-400 mt-2">
              This quote will expire on{' '}
              <span className="text-white font-medium">{validUntil.toLocaleDateString()}</span>
            </p>
          </div>

          <div className="space-y-4 mb-6">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="bg-zinc-800 border border-zinc-700 p-4 rounded-xl space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      Saved Product / Service - Add Products on the product page
                    </label>
                    <select
                      value={item.productId || ''}
                      onChange={(e) => applyProductToItem(idx, e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3"
                    >
                      <option value="">Custom Item</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}{' '}
                          {product.price != null ? `• R${Number(product.price).toFixed(2)}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Unit</label>
                    <input
                      value={item.unit || ''}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                      placeholder="each / hour / day"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_110px_150px_60px] gap-4">
                  <input
                    value={item.desc}
                    onChange={(e) => updateItem(idx, 'desc', e.target.value)}
                    placeholder="Description"
                    className="bg-transparent focus:outline-none border border-zinc-700 rounded-xl px-4 py-3"
                  />
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                    className="text-center bg-transparent focus:outline-none border border-zinc-700 rounded-xl px-4 py-3"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.rate}
                    onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                    className="text-center bg-transparent focus:outline-none border border-zinc-700 rounded-xl px-4 py-3"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-red-500 text-xl"
                    type="button"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={addItem}
                className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl"
                type="button"
              >
                + Add Item
              </button>

              <Link
                href="/products"
                className="bg-zinc-700 hover:bg-zinc-600 px-6 py-2 rounded-xl text-center"
              >
                Manage Products
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">VAT %</label>
              <input
                type="number"
                value={vat}
                onChange={(e) => setVat(parseFloat(e.target.value) || 0)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-24"
              />
            </div>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 mb-8">
            <h3 className="text-lg font-semibold mb-3">Quote Summary</h3>
            <div className="space-y-2 text-zinc-300">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>R{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT ({vat}%)</span>
                <span>R{totals.vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Valid Until</span>
                <span>{validUntil.toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between font-bold text-white text-lg pt-2 border-t border-zinc-700">
                <span>Total</span>
                <span>R{totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={saveQuote}
              disabled={saving}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 py-5 rounded-2xl text-lg font-bold"
            >
              {saving
                ? editingQuoteId
                  ? 'Updating Quote...'
                  : 'Saving Quote...'
                : 'Save Quote'}
            </button>

            <button
              onClick={downloadQuote}
              disabled={downloading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 py-5 rounded-2xl text-lg font-bold text-black"
            >
              {downloading ? 'Downloading...' : 'Download Quote'}
            </button>

            <button
              onClick={openEmailClient}
              disabled={openingEmail || !clientEmail.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 py-5 rounded-2xl text-lg font-bold"
            >
              {openingEmail ? 'Opening Email Client...' : 'Email Client'}
            </button>
          </div>

          <p className="text-sm text-zinc-400 mt-4">
            Tip: Download the PDF first, then click <span className="text-white">Email Client</span>{' '}
            and attach the downloaded quote manually in your email app.
          </p>
        </div>
      </div>
    </div>
  );
}