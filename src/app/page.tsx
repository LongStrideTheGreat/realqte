'use client';

import { useState, useEffect } from 'react';
import { auth, db, storage } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const provider = new GoogleAuthProvider();

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({
    businessName: '',
    ownerName: '',
    taxNumber: '',
    bankDetails: '',
    logo: ''
  });
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [mode, setMode] = useState<'invoice' | 'quote'>('invoice');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [client, setClient] = useState('');
  const [items, setItems] = useState<{ desc: string; qty: number; rate: number }[]>([{ desc: '', qty: 1, rate: 0 }]);
  const [vat, setVat] = useState(15);
  const [notes, setNotes] = useState('Thank you for your business!');
  const [previewHTML, setPreviewHTML] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setProfile(data.profile || profile);
          setIsPro(data.isPro || false);
        }
        // Count documents
        const q = query(collection(db, 'documents'), where('userId', '==', u.uid));
        const snap = await getDocs(q);
        setUsageCount(snap.size);
      } else {
        setUser(null);
      }
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  const logout = () => signOut(auth);

  const saveProfile = async () => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), { profile, isPro }, { merge: true });
    alert('Profile saved!');
  };

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const storageRef = ref(storage, `logos/${user.uid}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    setProfile({ ...profile, logo: url });
  };

  const addItem = () => setItems([...items, { desc: '', qty: 1, rate: 0 }]);
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const generateNumber = async () => {
    if (!user) return;
    const prefix = mode === 'invoice' ? 'INV' : 'QTE';
    const ym = new Date().toISOString().slice(0,7).replace('-','');
    const q = query(
      collection(db, 'documents'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    let nextNum = 1;
    if (!snap.empty) {
      const lastNum = snap.docs[0].data().number.split('-').pop() || '000';
      nextNum = parseInt(lastNum) + 1;
    }
    setInvoiceNo(`${prefix}-${ym}-${nextNum.toString().padStart(3, '0')}`);
  };

  useEffect(() => {
    if (user) generateNumber();
  }, [mode, user]);

  const calcTotals = () => {
    const subtotal = items.reduce((sum, i) => sum + (i.qty * i.rate), 0);
    const vatAmt = subtotal * (vat / 100);
    return {
      subtotal: subtotal.toFixed(2),
      vat: vatAmt.toFixed(2),
      total: (subtotal + vatAmt).toFixed(2)
    };
  };

  useEffect(() => {
    const totals = calcTotals();
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 40px; background: white; color: black; border: 1px solid #ddd;">
        ${profile.logo ? `<img src="${profile.logo}" alt="Logo" style="max-height: 80px; margin-bottom: 20px;">` : ''}
        <h1 style="text-align: center; font-size: 32px; color: #10b981; margin-bottom: 10px;">${mode.toUpperCase()}</h1>
        <div style="display: flex; justify-content: space-between; font-size: 14px;">
          <div>
            <strong>${profile.businessName || 'Your Business'}</strong><br>
            ${profile.ownerName}<br>
            ${profile.taxNumber ? `Tax/VAT: ${profile.taxNumber}` : ''}
          </div>
          <div style="text-align: right;">
            ${invoiceNo}<br>
            Date: ${date}
          </div>
        </div>
        <div style="margin: 30px 0;">
          <strong>Bill To:</strong><br>${client || 'Client Name'}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="text-align: left; padding: 10px; border-bottom: 2px solid #ddd;">Description</th>
              <th style="padding: 10px; border-bottom: 2px solid #ddd;">Qty</th>
              <th style="padding: 10px; border-bottom: 2px solid #ddd;">Rate</th>
              <th style="text-align: right; padding: 10px; border-bottom: 2px solid #ddd;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(i => i.desc ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${i.desc}</td>
                <td style="text-align: center; padding: 10px;">${i.qty}</td>
                <td style="text-align: center; padding: 10px;">R${i.rate.toFixed(2)}</td>
                <td style="text-align: right; padding: 10px;">R${(i.qty * i.rate).toFixed(2)}</td>
              </tr>
            ` : '').join('')}
          </tbody>
        </table>
        <div style="text-align: right; margin-top: 20px;">
          Subtotal: R${totals.subtotal}<br>
          VAT (${vat}%): R${totals.vat}<br>
          <strong style="font-size: 18px;">Total: R${totals.total}</strong>
        </div>
        ${profile.bankDetails ? `
          <div style="margin-top: 40px; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px;">
            <strong>Banking Details:</strong><br>${profile.bankDetails}
          </div>
        ` : ''}
        <div style="margin-top: 30px; font-style: italic; font-size: 14px;">${notes}</div>
      </div>
    `;
    setPreviewHTML(html);
  }, [profile, items, vat, client, date, invoiceNo, notes, mode]);

  const saveAndDownload = async () => {
    if (!user) return alert('Please sign in');
    if (!isPro && usageCount >= 10) return alert('Free limit reached (10 docs). Upgrade to Pro for R35/month!');

    const totals = calcTotals();
    const docData = {
      userId: user.uid,
      type: mode,
      number: invoiceNo,
      date,
      client,
      items,
      vat,
      notes,
      total: totals.total,
      createdAt: Timestamp.now()
    };

    await addDoc(collection(db, 'documents'), docData);
    setUsageCount(usageCount + 1);

    // Generate PDF
    const pdfContainer = document.createElement('div');
    pdfContainer.innerHTML = previewHTML;
    pdfContainer.style.position = 'absolute';
    pdfContainer.style.left = '-9999px';
    document.body.appendChild(pdfContainer);

    const canvas = await html2canvas(pdfContainer, { scale: 2 });
    document.body.removeChild(pdfContainer);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${invoiceNo}.pdf`);

    alert('Document saved & PDF downloaded!');
  };

  const goPro = () => {
    if (!user) return alert('Sign in first');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.payfast.co.za/eng/process'; // change to sandbox.payfast.co.za for testing

    const fields = {
      merchant_id: 'YOUR_MERCHANT_ID_HERE',
      merchant_key: 'YOUR_MERCHANT_KEY_HERE',
      return_url: window.location.href,
      notify_url: `${window.location.origin}/api/payfast-webhook`,
      amount: '35.00',
      item_name: 'RealQte Pro Monthly',
      subscription_type: '1',
      billing_date: new Date().toISOString().split('T')[0],
      recurring_amount: '35.00',
      frequency: '3', // monthly
      cycles: '0', // unlimited
      email_address: user.email || '',
      custom_int1: user.uid,
      passphrase: 'YOUR_PASSPHRASE_HERE'
    };

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value as string;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-zinc-400">Welcome, {user.displayName}</span>
              <button onClick={logout} className="text-sm text-red-400 hover:underline">Logout</button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {!user ? (
          <div className="text-center py-20">
            <h2 className="text-4xl font-bold mb-6">Welcome to RealQte</h2>
            <p className="text-xl text-zinc-300 mb-8">Professional quotes & invoices for South African businesses – free for your first 10</p>
            <button
              onClick={signIn}
              className="bg-white text-black px-8 py-4 rounded-xl text-lg font-medium hover:bg-zinc-200 flex items-center gap-3 mx-auto"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
              Sign in with Google to start
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Profile Panel */}
            <div className="lg:col-span-4 bg-zinc-900 rounded-3xl p-8">
              <h2 className="text-2xl font-semibold mb-6">Your Business Profile</h2>
              
              <input
                value={profile.businessName}
                onChange={e => setProfile({...profile, businessName: e.target.value})}
                placeholder="Business Name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-emerald-500"
              />
              <input
                value={profile.ownerName}
                onChange={e => setProfile({...profile, ownerName: e.target.value})}
                placeholder="Your Name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4"
              />
              <input
                value={profile.taxNumber}
                onChange={e => setProfile({...profile, taxNumber: e.target.value})}
                placeholder="Tax / VAT Number"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4"
              />
              <textarea
                value={profile.bankDetails}
                onChange={e => setProfile({...profile, bankDetails: e.target.value})}
                placeholder="Banking Details (for footer)"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-28 mb-4"
              />

              <label className="block text-sm text-zinc-400 mb-2">Business Logo</label>
              <input type="file" accept="image/*" onChange={handleLogo} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4" />
              {profile.logo && <img src={profile.logo} alt="Logo" className="w-32 mb-4 rounded" />}

              <button onClick={saveProfile} className="w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded-xl font-medium mb-6">
                Save Profile
              </button>

              <div className="text-sm">
                <p>Usage: <span className="font-bold">{usageCount} / 10 free</span></p>
                {!isPro && usageCount >= 10 && <p className="text-red-400 mt-2">Limit reached – upgrade for unlimited!</p>}
              </div>

              {!isPro && (
                <button
                  onClick={goPro}
                  className="w-full mt-6 bg-gradient-to-r from-emerald-500 to-teal-500 py-4 rounded-xl text-lg font-bold"
                >
                  Go Pro – R35/month Unlimited
                </button>
              )}
              {isPro && <p className="mt-6 text-emerald-400 font-bold text-center">✅ Pro Active – Unlimited Use</p>}
            </div>

            {/* Main Tool */}
            <div className="lg:col-span-8 bg-zinc-900 rounded-3xl p-8">
              <div className="flex gap-4 mb-8">
                <button
                  onClick={() => setMode('invoice')}
                  className={`flex-1 py-4 rounded-xl font-medium ${mode === 'invoice' ? 'bg-emerald-600' : 'bg-zinc-800'}`}
                >
                  Invoice
                </button>
                <button
                  onClick={() => setMode('quote')}
                  className={`flex-1 py-4 rounded-xl font-medium ${mode === 'quote' ? 'bg-emerald-600' : 'bg-zinc-800'}`}
                >
                  Quote
                </button>
              </div>

              <div className="space-y-6">
                <input
                  value={invoiceNo}
                  readOnly
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-400"
                />
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                />
                <input
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  placeholder="Client Name / Company"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                />

                <div>
                  <div className="flex justify-between mb-4">
                    <h3 className="text-lg font-medium">Items</h3>
                    <button onClick={addItem} className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl text-sm">
                      + Add Item
                    </button>
                  </div>
                  {items.map((item, idx) => (
                    <div key={idx} className="flex gap-4 mb-4 bg-zinc-800 p-4 rounded-xl">
                      <input
                        value={item.desc}
                        onChange={e => updateItem(idx, 'desc', e.target.value)}
                        placeholder="Description"
                        className="flex-1 bg-transparent focus:outline-none"
                      />
                      <input
                        type="number"
                        value={item.qty}
                        onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                        min="1"
                        className="w-20 bg-transparent text-center focus:outline-none"
                      />
                      <input
                        type="number"
                        value={item.rate}
                        onChange={e => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                        min="0"
                        className="w-28 bg-transparent text-center focus:outline-none"
                      />
                      <button onClick={() => removeItem(idx)} className="text-red-500 text-xl">×</button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">VAT % (15% common in ZA)</label>
                    <input
                      type="number"
                      value={vat}
                      onChange={e => setVat(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-24"
                    />
                  </div>
                </div>

                <button
                  onClick={saveAndDownload}
                  disabled={!isPro && usageCount >= 10}
                  className={`w-full py-5 rounded-2xl text-xl font-bold mt-8 ${
                    (!isPro && usageCount >= 10) ? 'bg-zinc-700 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400'
                  }`}
                >
                  {!isPro && usageCount >= 10 ? 'Upgrade to Pro' : 'Save & Download PDF'}
                </button>
              </div>

              {/* Live Preview */}
              <div className="mt-12">
                <h3 className="text-xl font-semibold mb-4">Live Preview</h3>
                <div dangerouslySetInnerHTML={{ __html: previewHTML }} className="bg-white text-black p-8 rounded-3xl shadow-2xl overflow-auto max-h-[800px]" />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}