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

export default function NewQuote() {
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
  const [quoteNo, setQuoteNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDays, setExpiryDays] = useState(7);
  const [previewHTML, setPreviewHTML] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

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

        const userSnap = await getDoc(doc(db, 'users', u.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setProfile(data.profile || {});
          setIsPro(isSubscriptionActive(data));
        }

        const custSnap = await getDocs(
          query(collection(db, 'customers'), where('userId', '==', u.uid))
        );
        setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CustomerType[]);

        const docsSnap = await getDocs(
          query(collection(db, 'documents'), where('userId', '==', u.uid))
        );
        setUsageCount(docsSnap.size);

        if (!quoteNo) {
          setQuoteNo(`QTE-${Date.now()}`);
        }
      } catch (err) {
        console.error('Quote page load error:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router, quoteNo]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const customerId = urlParams.get('customerId');

    if (customerId && customers.length > 0) {
      const cust = customers.find((c) => c.id === customerId);
      if (cust) {
        setSelectedCustomerId(cust.id);
        setClient(cust.name || '');
        setClientEmail(cust.email || '');
      }
    }
  }, [customers]);

  const addItem = () => setItems([...items, { desc: '', qty: 1, rate: 0 }]);

  const removeItem = (index: number) => {
    if (items.length === 1) {
      setItems([{ desc: '', qty: 1, rate: 0 }]);
      return;
    }
    setItems(items.filter((_, idx) => idx !== index));
  };

  const updateItem = (index: number, key: keyof ItemType, value: string | number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [key]: value,
    };
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

  useEffect(() => {
    const validUntil = getValidUntilDate();

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

        ${profile.bankDetails ? `
          <div style="margin-top:40px;font-size:12px;border-top:1px solid #ddd;padding-top:10px;">
            <strong>Banking Details:</strong><br>
            ${profile.bankDetails.replace(/\n/g, '<br>')}
          </div>
        ` : ''}

        <div style="margin-top:30px;font-style:italic;font-size:14px;">
          ${notes || ''}
        </div>
      </div>
    `;

    setPreviewHTML(html);
  }, [profile, validItems, vat, client, clientEmail, date, quoteNo, notes, expiryDays, totals]);

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

  const downloadPdf = async () => {
    const pdfBlob = await generatePdfBlob();
    const blobUrl = URL.createObjectURL(pdfBlob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${quoteNo || 'quote'}.pdf`;
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

    if (!isPro && usageCount >= 10) {
      alert('Free limit reached (10 docs). Upgrade to Pro!');
      return false;
    }

    return true;
  };

  const saveQuote = async () => {
    if (!validateQuote()) return;

    try {
      setSaving(true);

      const quoteNumber = quoteNo || `QTE-${Date.now()}`;
      const validUntil = getValidUntilDate();

      const docData = {
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
        subtotal: totals.subtotal.toFixed(2),
        vatAmount: totals.vatAmount.toFixed(2),
        total: totals.total.toFixed(2),
        expiryDays,
        expiryDate: Timestamp.fromDate(validUntil),
        status: 'draft',
        convertedToInvoice: false,
        convertedInvoiceId: null,
        paid: false,
        paymentStatus: 'not_applicable',
        sourceDocumentId: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await addDoc(collection(db, 'documents'), docData);
      await downloadPdf();

      alert('Quote saved and PDF downloaded!');
      router.push('/');
    } catch (err: any) {
      console.error('Save quote error:', err);
      alert('Failed to save quote: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const sendEmail = async () => {
    if (!isPro) {
      alert('This is a Pro feature – upgrade for R35/month!');
      return;
    }

    if (!validateQuote()) return;

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
          mode: 'Quote',
          number: quoteNo || 'Quote',
          attachment: pdfBase64,
          attachment_filename: `${quoteNo || 'quote'}.pdf`,
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
            <Link href="/new-invoice" className="text-zinc-400 hover:text-white">
              New Invoice
            </Link>
            <Link href="/new-quote" className="text-emerald-400 font-medium">
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
          <h1 className="text-4xl font-bold mb-2">New Quote</h1>
          <p className="text-zinc-400">
            Create a professional quote and save it so it can later be converted into an invoice.
          </p>
        </div>

        {!profileComplete && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-2xl p-5 mb-8">
            Your profile is incomplete. Please complete Business Name, Owner Name, Business Email and Contact Number before saving quotes.
            <div className="mt-3">
              <Link href="/profile" className="text-emerald-400 hover:underline">
                Go to Profile
              </Link>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 rounded-3xl p-8 md:p-10">
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
            <label className="block text-sm text-zinc-400 mb-2">Select Customer</label>
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
              onChange={(e) => setExpiryDays(parseInt(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            >
              <option value={7}>7 days</option>
              <option value={15}>15 days</option>
              <option value={30}>30 days</option>
            </select>
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
                  className="bg-transparent focus:outline-none"
                />
                <input
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                  className="text-center bg-transparent focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.rate}
                  onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                  className="text-center bg-transparent focus:outline-none"
                />
                <button
                  onClick={() => removeItem(idx)}
                  className="text-red-500 text-xl"
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              onClick={addItem}
              className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl"
              type="button"
            >
              + Add Item
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">VAT % (15% common in ZA)</label>
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
              <div className="flex justify-between font-bold text-white text-lg pt-2 border-t border-zinc-700">
                <span>Total</span>
                <span>R{totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={saveQuote}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 py-5 rounded-2xl text-xl font-bold"
          >
            {saving ? 'Saving Quote...' : 'Save Quote & Download PDF'}
          </button>

          <button
            onClick={sendEmail}
            disabled={!isPro || !clientEmail || sendingEmail}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 py-5 rounded-2xl text-xl font-bold mt-4"
          >
            {sendingEmail ? 'Sending Email...' : 'Send via Email (Pro)'}
          </button>
        </div>
      </div>
    </div>
  );
}