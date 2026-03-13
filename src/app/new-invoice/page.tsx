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
import emailjs from '@emailjs/browser';

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

type ItemType = {
  desc: string;
  qty: number;
  rate: number;
};

type InvoiceDocType = {
  id: string;
  number?: string;
  client?: string;
  total?: string;
  createdAt?: any;
  paid?: boolean;
  paymentStatus?: string;
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

export default function NewInvoice() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [client, setClient] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [items, setItems] = useState<ItemType[]>([{ desc: '', qty: 1, rate: 0 }]);
  const [vat, setVat] = useState(15);
  const [notes, setNotes] = useState('Thank you for your business!');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');
  const [recentInvoices, setRecentInvoices] = useState<InvoiceDocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  const [sourceQuoteId, setSourceQuoteId] = useState<string | null>(null);
  const [loadedFromQuote, setLoadedFromQuote] = useState(false);

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

        const custSnap = await getDocs(
          query(collection(db, 'customers'), where('userId', '==', u.uid))
        );
        const customerList = custSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[];
        setCustomers(customerList);

        const docsSnap = await getDocs(
          query(collection(db, 'documents'), where('userId', '==', u.uid))
        );
        setUsageCount(docsSnap.size);

        const recentSnap = await getDocs(
          query(
            collection(db, 'documents'),
            where('userId', '==', u.uid),
            where('type', '==', 'invoice'),
            orderBy('createdAt', 'desc'),
            limit(5)
          )
        );
        setRecentInvoices(recentSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as InvoiceDocType[]);

        const urlParams = new URLSearchParams(window.location.search);
        const customerId = urlParams.get('customerId');
        const quoteId = urlParams.get('quoteId');

        if (!invoiceNo) {
          setInvoiceNo(`INV-${Date.now()}`);
        }

        if (customerId) {
          const cust = customerList.find((c) => c.id === customerId);
          if (cust) {
            setSelectedCustomerId(cust.id);
            setClient(cust.name || '');
            setClientEmail(cust.email || '');
          }
        }

        if (quoteId) {
          const quoteSnap = await getDoc(doc(db, 'documents', quoteId));
          if (quoteSnap.exists()) {
            const quoteData = quoteSnap.data();

            if (quoteData.userId === u.uid && quoteData.type === 'quote') {
              setSourceQuoteId(quoteId);
              setLoadedFromQuote(true);
              setClient(quoteData.client || '');
              setClientEmail(quoteData.clientEmail || '');
              setSelectedCustomerId(quoteData.customerId || '');
              setItems(quoteData.items || [{ desc: '', qty: 1, rate: 0 }]);
              setVat(Number(quoteData.vat ?? 15));
              setNotes(quoteData.notes || 'Thank you for your business!');
              setDate(new Date().toISOString().split('T')[0]);

              if (quoteData.number) {
                setInvoiceNo(`INV-${String(quoteData.number).replace(/^QTE-?/i, '')}`);
              }
            }
          }
        }
      } catch (err) {
        console.error('Invoice page load error:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router, invoiceNo]);

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

        ${profile.bankDetails ? `
          <div style="margin-top:40px;font-size:12px;border-top:1px solid #ddd;padding-top:10px;">
            <strong>Banking Details:</strong><br>
            ${String(profile.bankDetails).replace(/\n/g, '<br>')}
          </div>
        ` : ''}

        <div style="margin-top:30px;font-style:italic;font-size:14px;">${notes || ''}</div>
      </div>
    `;

    setPreviewHTML(html);
  }, [profile, validItems, vat, client, clientEmail, date, invoiceNo, notes, totals]);

  const updateItem = (index: number, key: keyof ItemType, value: string | number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [key]: value,
    };
    setItems(updated);
  };

  const addItem = () => setItems([...items, { desc: '', qty: 1, rate: 0 }]);

  const removeItem = (index: number) => {
    if (items.length === 1) {
      setItems([{ desc: '', qty: 1, rate: 0 }]);
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

  const downloadPdf = async () => {
    const pdfBlob = await generatePdfBlob();
    const blobUrl = URL.createObjectURL(pdfBlob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${invoiceNo || 'invoice'}.pdf`;
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

    if (!isPro && usageCount >= 10) {
      alert('Free limit reached (10 docs). Upgrade to Pro!');
      return false;
    }

    return true;
  };

  const saveAndDownload = async () => {
    if (!validateInvoice()) return;

    try {
      setSaving(true);

      const invoiceNumber = invoiceNo || `INV-${Date.now()}`;

      const invoiceDocData = {
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
        subtotal: totals.subtotal.toFixed(2),
        vatAmount: totals.vatAmount.toFixed(2),
        total: totals.total.toFixed(2),
        recurring: isPro ? isRecurring : false,
        nextDue:
          isPro && isRecurring
            ? Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
            : null,
        reminderSent: false,
        status: 'unpaid',
        paid: false,
        paymentStatus: 'unpaid',
        sourceDocumentId: sourceQuoteId || null,
        sourceDocumentType: sourceQuoteId ? 'quote' : null,
        createdFromQuote: Boolean(sourceQuoteId),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const invoiceRef = await addDoc(collection(db, 'documents'), invoiceDocData);

      if (sourceQuoteId) {
        await updateDoc(doc(db, 'documents', sourceQuoteId), {
          convertedToInvoice: true,
          convertedInvoiceId: invoiceRef.id,
          status: 'converted',
          updatedAt: Timestamp.now(),
        });
      }

      await downloadPdf();

      alert(
        sourceQuoteId
          ? 'Invoice created from quote and PDF downloaded!'
          : 'Invoice saved and PDF downloaded!'
      );

      router.push('/invoices');
    } catch (err: any) {
      console.error('Save invoice error:', err);
      alert('Failed to save invoice: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const sendEmail = async () => {
    if (!isPro) {
      alert('This is a Pro feature – upgrade for R35/month!');
      return;
    }

    if (!validateInvoice()) return;

    if (!clientEmail.trim()) {
      alert('Enter client email first');
      return;
    }

    try {
      setSendingEmail(true);

      const pdfBlob = await generatePdfBlob();

      const pdfBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(pdfBlob);
      });

      await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!,
        'template_50lnuc5',
        {
          to_email: clientEmail,
          from_name: profile.businessName || 'RealQte',
          client: client,
          business_name: profile.businessName || '',
          owner_name: profile.ownerName || '',
          mode: 'Invoice',
          number: invoiceNo || 'Invoice',
          attachment: pdfBase64,
          attachment_filename: `${invoiceNo || 'invoice'}.pdf`,
          attachment_content_type: 'application/pdf',
        },
        process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY!
      );

      alert(`✅ Email sent to ${clientEmail}`);
    } catch (err) {
      console.error(err);
      alert('Failed to send email. Check console.');
    } finally {
      setSendingEmail(false);
    }
  };

  const sendReminder = async () => {
    if (!isPro) {
      alert('This is a Pro feature');
      return;
    }

    if (!clientEmail.trim()) {
      alert('No client email');
      return;
    }

    try {
      setSendingReminder(true);

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 40px; background: white; color: black;">
          <h1 style="text-align: center; color: #10b981;">Payment Reminder</h1>
          <p>Dear ${client},</p>
          <p>This is a friendly reminder that invoice ${invoiceNo} for R${totals.total.toFixed(2)} is due.</p>
          <p>Please make payment as soon as possible. Thank you!</p>
          <p>Best regards,<br>${profile.businessName || 'Your Business'}</p>
        </div>
      `;

      const pdfContainer = document.createElement('div');
      pdfContainer.innerHTML = html;
      pdfContainer.style.position = 'absolute';
      pdfContainer.style.left = '-9999px';
      document.body.appendChild(pdfContainer);

      const canvas = await html2canvas(pdfContainer, { scale: 2, useCORS: true });
      document.body.removeChild(pdfContainer);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfWidth, pdfHeight);
      const pdfBlob = pdf.output('blob');

      const pdfBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(pdfBlob);
      });

      await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!,
        'template_50lnuc5',
        {
          to_email: clientEmail,
          from_name: profile.businessName || 'RealQte',
          client: client,
          business_name: profile.businessName || '',
          owner_name: profile.ownerName || '',
          mode: 'Reminder for Invoice ' + (invoiceNo || 'Invoice'),
          number: invoiceNo || 'Invoice',
          attachment: pdfBase64,
          attachment_filename: `Reminder-${invoiceNo || 'invoice'}.pdf`,
          attachment_content_type: 'application/pdf',
        },
        process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY!
      );

      alert(`Reminder sent to ${clientEmail}`);
    } catch (err) {
      console.error(err);
      alert('Failed to send reminder');
    } finally {
      setSendingReminder(false);
    }
  };

  const getInvoiceBadge = (invoice: InvoiceDocType) => {
    const paid = invoice.paid === true || String(invoice.paymentStatus || '').toLowerCase() === 'paid';

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
            <Link href="/customers" className="text-zinc-400 hover:text-white">
              Customers
            </Link>
            <Link href="/quotes" className="text-zinc-400 hover:text-white">Quotes</Link>
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
          <h1 className="text-4xl font-bold text-white mb-2">New Invoice</h1>
          <p className="text-zinc-400">
            Create a new invoice or convert an existing quote into an invoice.
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
                className="grid grid-cols-1 md:grid-cols-[1fr_100px_140px_60px] gap-4 bg-zinc-800 border border-zinc-700 p-4 rounded-xl"
              >
                <input
                  value={item.desc}
                  onChange={(e) => updateItem(idx, 'desc', e.target.value)}
                  placeholder="Description"
                  className="bg-transparent text-white placeholder-zinc-500 focus:outline-none"
                />
                <input
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                  className="text-center bg-transparent text-white focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.rate}
                  onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                  className="text-center bg-transparent text-white focus:outline-none"
                />
                <button
                  onClick={() => removeItem(idx)}
                  className="text-red-400 text-xl"
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              onClick={addItem}
              className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl text-white"
              type="button"
            >
              + Add Item
            </button>
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

          <button
            onClick={saveAndDownload}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 py-5 rounded-2xl text-xl font-bold text-black"
          >
            {saving ? 'Saving Invoice...' : 'Save & Download PDF'}
          </button>

          <button
            onClick={sendEmail}
            disabled={!isPro || !clientEmail || sendingEmail}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 py-5 rounded-2xl text-xl font-bold mt-4"
          >
            {sendingEmail ? 'Sending Email...' : 'Send via Email (Pro)'}
          </button>

          {isPro && isRecurring && (
            <button
              onClick={sendReminder}
              disabled={sendingReminder}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-60 py-5 rounded-2xl text-xl font-bold mt-4 text-white"
            >
              {sendingReminder ? 'Sending Reminder...' : 'Send Reminder (Pro)'}
            </button>
          )}
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
                    {inv.client} • R{inv.total}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {toDate(inv.createdAt)?.toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}