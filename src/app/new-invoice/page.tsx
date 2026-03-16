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
  orderBy,
  limit,
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

type InvoiceDocType = {
  id: string;
  number?: string;
  client?: string;
  total?: string | number;
  createdAt?: any;
  paid?: boolean;
  paymentStatus?: string;
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  createdFromQuote?: boolean;
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

function generateInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const t = String(now.getTime()).slice(-5);
  return `INV-${y}${m}${d}-${t}`;
}

function formatMoney(value: string | number | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value || 0);
  return numeric.toFixed(2);
}

export default function NewInvoice() {
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
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');
  const [recentInvoices, setRecentInvoices] = useState<InvoiceDocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [openingEmail, setOpeningEmail] = useState(false);

  const [sourceQuoteId, setSourceQuoteId] = useState<string | null>(null);
  const [sourceQuoteNumber, setSourceQuoteNumber] = useState<string | null>(null);
  const [loadedFromQuote, setLoadedFromQuote] = useState(false);

  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const profileComplete = useMemo(() => {
    return Boolean(
      profile.businessName?.trim() &&
        profile.ownerName?.trim() &&
        profile.businessEmail?.trim() &&
        profile.phone?.trim()
    );
  }, [profile]);

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

        const userSnap = await getDoc(doc(db, 'users', u.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setProfile(data.profile || {});
          setIsPro(isSubscriptionActive(data));
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

        const customerList = custSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[];
        setCustomers(customerList);
        setUsageCount(docsSnap.size);
        setRecentInvoices(recentSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as InvoiceDocType[]);

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
              setEditingInvoiceId(invoiceSnap.id);
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
                (quoteData.items || [{ productId: null, desc: '', qty: 1, rate: 0, unit: 'each' }]).map(
                  (item: any) => ({
                    productId: item.productId || null,
                    desc: item.desc || '',
                    qty: Number(item.qty || 1),
                    rate: Number(item.rate || 0),
                    unit: item.unit || 'each',
                  })
                )
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
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 40px; background: white; color: black; border: 1px solid #ddd;">
        ${profile.logo ? `<img src="${profile.logo}" alt="Logo" style="max-height: 80px; margin-bottom: 20px;">` : ''}
        <h1 style="text-align: center; font-size: 32px; color: #10b981; margin-bottom: 10px;">INVOICE</h1>
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
            <strong>${invoiceNo || 'INV-DRAFT'}</strong><br>
            Date: ${date}
          </div>
        </div>

        <div style="margin: 30px 0;">
          <strong>Bill To:</strong><br>
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
            ${String(profile.bankDetails).replace(/\n/g, '<br>')}
          </div>
        `
            : ''
        }

        <div style="margin-top:30px;font-style:italic;font-size:14px;">${notes || ''}</div>
      </div>
    `;

    setPreviewHTML(html);
  }, [profile, validItems, vat, client, clientEmail, date, invoiceNo, notes, totals]);

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

  const addItem = () =>
    setItems([...items, { productId: null, desc: '', qty: 1, rate: 0, unit: 'each' }]);

  const removeItem = (index: number) => {
    if (items.length === 1) {
      setItems([{ productId: null, desc: '', qty: 1, rate: 0, unit: 'each' }]);
      return;
    }
    setItems(items.filter((_, idx) => idx !== index));
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
      const canvas = await html2canvas(pdfContainer, { scale: 2, useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfWidth, pdfHeight);
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

  const buildInvoiceDocData = (status: string = 'unpaid') => {
    const invoiceNumber = invoiceNo || generateInvoiceNumber();

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
        recurring: isPro ? isRecurring : false,
        nextDue:
          isPro && isRecurring
            ? Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
            : null,
        reminderSent: false,
        status,
        paid: false,
        paymentStatus: 'unpaid',
        sourceDocumentId: sourceQuoteId || null,
        sourceDocumentType: sourceQuoteId ? 'quote' : null,
        sourceQuoteNumber: sourceQuoteNumber || null,
        createdFromQuote: Boolean(sourceQuoteId),
        updatedAt: Timestamp.now(),
      },
    };
  };

  const persistInvoice = async (status: string = 'unpaid') => {
    const { invoiceNumber, invoiceDocData } = buildInvoiceDocData(status);

    let invoiceId = editingInvoiceId;

    if (editingInvoiceId) {
      await updateDoc(doc(db, 'documents', editingInvoiceId), invoiceDocData);
      invoiceId = editingInvoiceId;
    } else {
      const invoiceRef = await addDoc(collection(db, 'documents'), {
        ...invoiceDocData,
        createdAt: Timestamp.now(),
      });

      invoiceId = invoiceRef.id;
      setEditingInvoiceId(invoiceRef.id);

      if (sourceQuoteId) {
        await updateDoc(doc(db, 'documents', sourceQuoteId), {
          convertedToInvoice: true,
          convertedInvoiceId: invoiceRef.id,
          status: 'converted',
          updatedAt: Timestamp.now(),
        });
      }
    }

    if (!invoiceNo) {
      setInvoiceNo(invoiceNumber);
    }

    return { invoiceId, invoiceNumber };
  };

  const saveInvoice = async () => {
    if (!validateInvoice()) return;

    try {
      setSaving(true);
      await persistInvoice('unpaid');

      alert(editingInvoiceId ? 'Invoice updated successfully!' : sourceQuoteId
        ? 'Invoice created from quote successfully!'
        : 'Invoice saved successfully!');

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

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      alert('Please enter a valid client email address.');
      return;
    }

    try {
      setOpeningEmail(true);

      const { invoiceNumber } = await persistInvoice('sent');

      const subject = encodeURIComponent(
        `Invoice ${invoiceNumber} from ${profile.businessName || 'RealQte'}`
      );

      const body = encodeURIComponent(
        `Hello ${client},

Please find your invoice attached.

Invoice Number: ${invoiceNumber}
Date: ${date}
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

  const getInvoiceBadge = (invoice: InvoiceDocType) => {
    const paid =
      invoice.paid === true || String(invoice.paymentStatus || '').toLowerCase() === 'paid';

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
        Loading invoice page...
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
            <Link href="/new-invoice" className="text-emerald-400 font-medium">
              New Invoice
            </Link>
            <Link href="/new-quote" className="text-zinc-400 hover:text-white">
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
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            {editingInvoiceId ? 'Edit Invoice' : 'New Invoice'}
          </h1>
          <p className="text-zinc-400">
            {editingInvoiceId
              ? 'Update your invoice, download the PDF, or open your email client to send it yourself.'
              : 'Create a new invoice or convert an existing quote into an invoice.'}
          </p>
        </div>

        {!profileComplete && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-2xl p-5 mb-8">
            Your profile is incomplete. Please complete Business Name, Owner Name, Business Email and Contact Number before saving invoices.
            <div className="mt-3">
              <Link href="/profile" className="text-emerald-400 hover:underline">
                Go to Profile
              </Link>
            </div>
          </div>
        )}

        {loadedFromQuote && (
          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-2xl p-5 mb-8">
            This invoice has been pre-filled from an existing quote.
            {sourceQuoteNumber ? ` Source quote: ${sourceQuoteNumber}` : ''}
          </div>
        )}

        <div className="bg-zinc-900 rounded-3xl p-8 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-zinc-300 mb-2">Invoice Number</label>
              <input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="INV-1001"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-2">Invoice Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm text-zinc-300 mb-2">Select Customer</label>
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
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">Select Customer (auto-fills details)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {isPro && (
            <div className="mb-6">
              <label className="block text-sm text-zinc-300 mb-2">Make Recurring (monthly)</label>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-5 w-5 text-emerald-500"
              />
              <p className="text-sm text-zinc-500 mt-1">
                Next reminder will be scheduled automatically.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-zinc-300 mb-2">Client Name</label>
              <input
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Client Name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-2">Client Email</label>
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="Client Email"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-4 mb-6">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="bg-zinc-800 border border-zinc-700 p-4 rounded-xl space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Saved Product / Service</label>
                    <select
                      value={item.productId || ''}
                      onChange={(e) => applyProductToItem(idx, e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3"
                    >
                      <option value="">Custom Item</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} {product.price != null ? `• R${Number(product.price).toFixed(2)}` : ''}
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
                    className="bg-transparent text-white placeholder-zinc-500 focus:outline-none border border-zinc-700 rounded-xl px-4 py-3"
                  />
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                    className="text-center bg-transparent text-white focus:outline-none border border-zinc-700 rounded-xl px-4 py-3"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.rate}
                    onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                    className="text-center bg-transparent text-white focus:outline-none border border-zinc-700 rounded-xl px-4 py-3"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-red-400 text-xl"
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
                className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl text-white"
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
              <label className="block text-sm text-zinc-300 mb-2">VAT % (15% common in ZA)</label>
              <input
                type="number"
                value={vat}
                onChange={(e) => setVat(parseFloat(e.target.value) || 0)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-24 text-white placeholder-zinc-500"
              />
            </div>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-5 mb-8">
            <h3 className="text-lg font-semibold mb-3">Invoice Summary</h3>
            <div className="space-y-2 text-zinc-300">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>R{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT ({vat}%)</span>
                <span>R{totals.vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-white text-lg pt-2 border-t border-zinc-700">
                <span>Total</span>
                <span>R{totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={saveInvoice}
              disabled={saving}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 py-5 rounded-2xl text-lg font-bold text-black"
            >
              {saving ? (editingInvoiceId ? 'Updating Invoice...' : 'Saving Invoice...') : 'Save Invoice'}
            </button>

            <button
              onClick={downloadInvoice}
              disabled={downloading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 py-5 rounded-2xl text-lg font-bold text-black"
            >
              {downloading ? 'Downloading...' : 'Download Invoice'}
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
            and attach the downloaded invoice manually in your email app.
          </p>
        </div>

        <div className="mt-12">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-semibold text-white">Recent Invoices</h3>
            <Link href="/invoices" className="text-emerald-400 hover:underline">
              View All Invoices
            </Link>
          </div>

          {recentInvoices.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No invoices yet</p>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="bg-zinc-900 rounded-3xl p-6 hover:bg-zinc-800 transition-all border border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="font-medium text-white">{inv.number}</div>
                    {getInvoiceBadge(inv)}
                  </div>
                  <div className="text-sm text-zinc-300">
                    {inv.client} • R{formatMoney(inv.total)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {toDate(inv.createdAt)?.toLocaleDateString()}
                  </div>
                  {inv.createdFromQuote && (
                    <div className="text-xs text-blue-400 mt-2">Created from quote</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}