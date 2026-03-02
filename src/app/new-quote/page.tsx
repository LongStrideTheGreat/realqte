'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function NewQuote() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>({});
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

  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push('/');
      setUser(u);

      const custSnap = await getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid)));
      setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [router]);

  // Auto-fill from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const customerId = urlParams.get('customerId');
    if (customerId && customers.length > 0) {
      const cust = customers.find(c => c.id === customerId);
      if (cust) {
        setSelectedCustomerId(cust.id);
        setClient(cust.name);
        setClientEmail(cust.email || '');
      }
    }
  }, [customers]);

  const addItem = () => setItems([...items, { desc: '', qty: 1, rate: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const calculateTotal = () => {
    const sub = items.reduce((sum, i) => sum + (i.qty * i.rate), 0);
    return (sub + sub * (vat / 100)).toFixed(2);
  };

  const saveQuote = async () => {
    if (!user) return;
    const totals = calculateTotal();
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
      total: totals,
      expiryDate: new Date(Date.now() + expiryDays * 86400000),
      createdAt: Timestamp.now()
    };

    await addDoc(collection(db, 'documents'), docData);
    alert('Quote saved!');
    router.push('/');
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-4xl font-bold mb-8">New Quote</h1>

      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-zinc-900 p-8 rounded-3xl">
          <select 
            value={selectedCustomerId} 
            onChange={(e) => {
              setSelectedCustomerId(e.target.value);
              const cust = customers.find(c => c.id === e.target.value);
              if (cust) {
                setClient(cust.name);
                setClientEmail(cust.email);
              }
            }}
            className="w-full bg-zinc-800 p-4 rounded-xl mb-6"
          >
            <option value="">Select Customer (auto-fills details)</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-zinc-800 p-3 rounded-xl mb-6" />

          <div className="mb-6">
            <label className="block text-sm text-zinc-400 mb-2">Quote valid for</label>
            <select value={expiryDays} onChange={e => setExpiryDays(parseInt(e.target.value))} className="bg-zinc-800 p-3 rounded-xl w-full">
              <option value={7}>7 days</option>
              <option value={15}>15 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          <input value={client} onChange={e => setClient(e.target.value)} placeholder="Client Name" className="w-full bg-zinc-800 p-3 rounded-xl mb-4" />
          <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="Client Email" className="w-full bg-zinc-800 p-3 rounded-xl mb-6" />

          {/* Items section - same as invoice */}
          <div className="space-y-4 mb-6">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-4 bg-zinc-800 p-4 rounded-xl">
                <input value={item.desc} onChange={e => {
                  const newItems = [...items];
                  newItems[idx].desc = e.target.value;
                  setItems(newItems);
                }} placeholder="Description" className="flex-1 bg-transparent" />
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
                <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-500">×</button>
              </div>
            ))}
            <button onClick={() => setItems([...items, { desc: '', qty: 1, rate: 0 }])} className="bg-emerald-600 px-6 py-2 rounded-xl">+ Add Item</button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label>VAT %</label>
              <input type="number" value={vat} onChange={e => setVat(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-800 p-3 rounded-xl" />
            </div>
            <div>
              <label>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-zinc-800 p-3 rounded-xl h-24" />
            </div>
          </div>

          <button onClick={saveQuote} className="w-full bg-emerald-500 py-5 rounded-2xl text-xl font-bold mt-8">Save Quote & Download PDF</button>
        </div>
      </div>
    </div>
  );
}