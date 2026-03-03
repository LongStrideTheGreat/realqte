'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, addDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import emailjs from '@emailjs/browser';

export default function NewQuote() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>({});
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [client, setClient] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [items, setItems] = useState([{ desc: '', qty: 1, rate: 0 }]);
  const [vat, setVat] = useState(15);
  const [notes, setNotes] = useState('Thank you for your business!');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDays, setExpiryDays] = useState(7);
  const [previewHTML, setPreviewHTML] = useState('');

  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push('/');
      setUser(u);

      // Load profile and Pro status
      const userSnap = await getDoc(doc(db, 'users', u.uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        setProfile(data.profile || {});
        setIsPro(data.isPro || false);
      }

      // Load customers
      const custSnap = await getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid)));
      setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Load usage count
      const docsSnap = await getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid)));
      setUsageCount(docsSnap.size);
    });
  }, [router]);

  // Auto-fill from URL ?customerId=xxx
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const customerId = urlParams.get('customerId');
    if (customerId && customers.length > 0) {
      const cust = customers.find(c => c.id === customerId);
      if (cust) {
        setSelectedCustomerId(cust.id);
        setClient(cust.name || '');
        setClientEmail(cust.email || '');
      }
    }
  }, [customers]);

  const addItem = () => setItems([...items, { desc: '', qty: 1, rate: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const calcTotals = () => {
    const subtotal = items.reduce((sum, i) => sum + (i.qty * i.rate), 0);
    const vatAmt = subtotal * (vat / 100);
    return {
      subtotal: subtotal.toFixed(2),
      vat: vatAmt.toFixed(2),
      total: (subtotal + vatAmt).toFixed(2)
    };
  };

  // Live preview with user's business details
  useEffect(() => {
    const totals = calcTotals();
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 40px; background: white; color: black; border: 1px solid #ddd;">
        ${profile.logo ? `<img src="${profile.logo}" alt="Logo" style="max-height: 80px; margin-bottom: 20px;">` : ''}
        <h1 style="text-align: center; font-size: 32px; color: #10b981; margin-bottom: 10px;">QUOTE</h1>
        <div style="display: flex; justify-content: space-between; font-size: 14px;">
          <div>
            <strong>${profile.businessName || 'Your Business'}</strong><br>
            ${profile.ownerName}<br>
            ${profile.phone ? profile.phone + '<br>' : ''}
            ${profile.physicalAddress ? profile.physicalAddress + '<br>' : ''}
            ${profile.email ? profile.email + '<br>' : ''}
            ${profile.taxNumber ? `Tax/VAT: ${profile.taxNumber}` : ''}
          </div>
          <div style="text-align: right;">
            ${invoiceNo}<br>
            Date: ${date}<br>
            Valid until: ${new Date(Date.now() + expiryDays * 86400000).toLocaleDateString()}
          </div>
        </div>
        <div style="margin: 30px 0;"><strong>Bill To:</strong><br>${client || 'Client Name'}</div>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead><tr style="background:#f3f4f6;"><th style="text-align:left;padding:10px;border-bottom:2px solid #ddd;">Description</th><th style="padding:10px;border-bottom:2px solid #ddd;">Qty</th><th style="padding:10px;border-bottom:2px solid #ddd;">Rate</th><th style="text-align:right;padding:10px;border-bottom:2px solid #ddd;">Amount</th></tr></thead>
          <tbody>${items.map(i => i.desc ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:10px;">${i.desc}</td><td style="text-align:center;padding:10px;">${i.qty}</td><td style="text-align:center;padding:10px;">R${i.rate.toFixed(2)}</td><td style="text-align:right;padding:10px;">R${(i.qty*i.rate).toFixed(2)}</td></tr>` : '').join('')}</tbody>
        </table>
        <div style="text-align:right;margin-top:20px;">Subtotal: R${totals.subtotal}<br>VAT (${vat}%): R${totals.vat}<br><strong style="font-size:18px;">Total: R${totals.total}</strong></div>
        ${profile.bankDetails ? `<div style="margin-top:40px;font-size:12px;border-top:1px solid #ddd;padding-top:10px;"><strong>Banking Details:</strong><br>${profile.bankDetails}</div>` : ''}
        <div style="margin-top:30px;font-style:italic;font-size:14px;">${notes}</div>
      </div>
    `;
    setPreviewHTML(html);
  }, [profile, items, vat, client, date, invoiceNo, notes, expiryDays]);

  const saveQuote = async () => {
    if (!user) return alert('Please sign in');
    if (!isPro && usageCount >= 10) return alert('Free limit reached (10 docs). Upgrade to Pro!');

    const totals = calcTotals();
    const docData = {
      userId: user.uid,
      type: 'quote',
      number: invoiceNo || 'QTE-' + Date.now(),
      date,
      client,
      clientEmail,
      items,
      vat,
      notes,
      total: totals.total,
      expiryDate: new Date(Date.now() + expiryDays * 86400000),
      createdAt: Timestamp.now()
    };

    await addDoc(collection(db, 'documents'), docData);
    alert('Quote saved & PDF downloaded!');
    router.push('/');
  };

  const sendEmail = async () => {
    if (!isPro) return alert('This is a Pro feature – upgrade for R35/month!');
    if (!clientEmail) return alert('Enter client email first');

    const pdfContainer = document.createElement('div');
    pdfContainer.innerHTML = previewHTML;
    pdfContainer.style.position = 'absolute';
    pdfContainer.style.left = '-9999px';
    document.body.appendChild(pdfContainer);
    const canvas = await html2canvas(pdfContainer, { scale: 2 });
    document.body.removeChild(pdfContainer);

    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), 0);
    const pdfBlob = pdf.output('blob');

    const pdfBase64 = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(pdfBlob);
    });

    try {
      await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID!,
        'template_50lnuc5',
        {
          to_email: clientEmail,
          from_name: profile.businessName || 'RealQte',
          client: client,
          business_name: profile.businessName,
          owner_name: profile.ownerName,
          mode: 'Quote',
          number: invoiceNo,
          attachment: pdfBase64,
          attachment_filename: `${invoiceNo}.pdf`,
          attachment_content_type: 'application/pdf'
        },
        process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY!
      );
      alert(`✅ Email sent to ${clientEmail}`);
    } catch (err) {
      console.error(err);
      alert('Failed to send email. Check console.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* HEADER - Consistent navigation */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">SA</span>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-white">Dashboard</Link>
            <Link href="/new-invoice" className="text-zinc-400 hover:text-white">New Invoice</Link>
            <Link href="/new-quote" className="text-emerald-400 font-medium">New Quote</Link>
            <Link href="/customers" className="text-zinc-400 hover:text-white">Customers</Link>
            <Link href="/profile" className="text-zinc-400 hover:text-white">Profile</Link>
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold mb-8">New Quote</h1>

        <div className="bg-zinc-900 rounded-3xl p-10">
          <select 
            value={selectedCustomerId} 
            onChange={(e) => {
              setSelectedCustomerId(e.target.value);
              const cust = customers.find(c => c.id === e.target.value);
              if (cust) {
                setClient(cust.name || '');
                setClientEmail(cust.email || '');
              }
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 mb-6 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Select Customer (auto-fills details)</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-6" />

          <div className="mb-6">
            <label className="block text-sm text-zinc-400 mb-2">Quote valid for</label>
            <select value={expiryDays} onChange={e => setExpiryDays(parseInt(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
              <option value={7}>7 days</option>
              <option value={15}>15 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          <input value={client} onChange={e => setClient(e.target.value)} placeholder="Client Name" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4" />
          <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="Client Email" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-6" />

          <div className="space-y-4 mb-6">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-4 bg-zinc-800 border border-zinc-700 p-4 rounded-xl">
                <input value={item.desc} onChange={e => {
                  const newItems = [...items];
                  newItems[idx].desc = e.target.value;
                  setItems(newItems);
                }} placeholder="Description" className="flex-1 bg-transparent focus:outline-none" />
                <input type="number" value={item.qty} onChange={e => {
                  const newItems = [...items];
                  newItems[idx].qty = parseFloat(e.target.value) || 1;
                  setItems(newItems);
                }} className="w-20 text-center bg-transparent" />
                <input type="number" value={item.rate} onChange={e => {
                  const newItems = [...items];
                  newItems[idx].rate = parseFloat(e.target.value) || 0;
                  setItems(newItems);
                }} className="w-28 text-center bg-transparent" />
                <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-500 text-xl">×</button>
              </div>
            ))}
            <button onClick={() => setItems([...items, { desc: '', qty: 1, rate: 0 }])} className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl">+ Add Item</button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">VAT % (15% common in ZA)</label>
              <input type="number" value={vat} onChange={e => setVat(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-24" />
            </div>
          </div>

          <button onClick={saveQuote} className="w-full bg-emerald-500 hover:bg-emerald-400 py-5 rounded-2xl text-xl font-bold mt-8">Save Quote & Download PDF</button>
          <button onClick={sendEmail} disabled={!isPro || !clientEmail} className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl text-xl font-bold mt-4">Send via Email (Pro)</button>
        </div>
      </div>
    </div>
  );
}