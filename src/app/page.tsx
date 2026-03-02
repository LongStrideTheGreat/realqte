'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { auth, db, storage } from '@/lib/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import emailjs from '@emailjs/browser';

const provider = new GoogleAuthProvider();

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({
    businessName: '',
    ownerName: '',
    taxNumber: '',
    bankDetails: '',
    phone: '',
    email: '',
    physicalAddress: '',
    postalAddress: '',
    cipcNumber: '',
    logo: ''
  });
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [documents, setDocuments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [currentTab, setCurrentTab] = useState<'dashboard' | 'create' | 'documents' | 'customers'>('dashboard');
  const [mode, setMode] = useState<'invoice' | 'quote'>('invoice');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDays, setExpiryDays] = useState(7); // for quotes only
  const [client, setClient] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [items, setItems] = useState([{ desc: '', qty: 1, rate: 0 }]);
  const [vat, setVat] = useState(15);
  const [notes, setNotes] = useState('Thank you for your business!');
  const [previewHTML, setPreviewHTML] = useState('');

  // Auth states
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // New customer form
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '' });

  // Load everything
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userSnap = await getDoc(doc(db, 'users', u.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setProfile(data.profile || profile);
          setIsPro(data.isPro || false);
        }

        const docsSnap = await getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid), orderBy('createdAt', 'desc')));
        setDocuments(docsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setUsageCount(docsSnap.size);

        const custSnap = await getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid)));
        setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    });
    return unsubscribe;
  }, []);

  // Generate number
  useEffect(() => {
    if (user) {
      const prefix = mode === 'invoice' ? 'INV' : 'QTE';
      const ym = new Date().toISOString().slice(0,7).replace('-','');
      const last = documents[0]?.number || '';
      let next = 1;
      if (last) next = parseInt(last.split('-').pop() || '0') + 1;
      setInvoiceNo(`${prefix}-${ym}-${next.toString().padStart(3,'0')}`);
    }
  }, [mode, user, documents]);

  const calcTotals = () => {
    const subtotal = items.reduce((sum, i) => sum + (i.qty * i.rate), 0);
    const vatAmt = subtotal * (vat / 100);
    return {
      subtotal: subtotal.toFixed(2),
      vat: vatAmt.toFixed(2),
      total: (subtotal + vatAmt).toFixed(2)
    };
  };

  // Live preview
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
            ${profile.phone ? profile.phone + '<br>' : ''}
            ${profile.physicalAddress ? profile.physicalAddress + '<br>' : ''}
            ${profile.taxNumber ? `Tax/VAT: ${profile.taxNumber}` : ''}
          </div>
          <div style="text-align: right;">
            ${invoiceNo}<br>
            Date: ${date}<br>
            ${mode === 'quote' ? `Valid until: ${new Date(Date.now() + expiryDays * 86400000).toLocaleDateString()}` : ''}
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
  }, [profile, items, vat, client, date, invoiceNo, notes, mode, expiryDays]);

  const saveAndDownload = async (isQuote = false) => {
    if (!user) return alert('Please sign in');
    if (!isPro && usageCount >= 10) return alert('Free limit reached. Upgrade to Pro!');

    const totals = calcTotals();
    const docData = {
      userId: user.uid,
      type: mode,
      number: invoiceNo,
      date,
      client,
      clientEmail,
      items,
      vat,
      notes,
      total: totals.total,
      expiryDate: mode === 'quote' ? new Date(Date.now() + expiryDays * 86400000) : null,
      createdAt: Timestamp.now()
    };

    await addDoc(collection(db, 'documents'), docData);
    setUsageCount(usageCount + 1);

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

    alert(`${mode.toUpperCase()} saved & PDF downloaded!`);
  };

  const convertQuoteToInvoice = async (docId: string) => {
    if (!user) return;
    await setDoc(doc(db, 'documents', docId), { type: 'invoice' }, { merge: true });
    alert('Quote converted to Invoice!');
    // Refresh documents
    const docsSnap = await getDocs(query(collection(db, 'documents'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')));
    setDocuments(docsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const sendEmail = async () => {
    if (!isPro) return alert('Pro feature only – upgrade for R35/month!');
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
          mode: mode.toUpperCase(),
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

  const addCustomer = async () => {
    if (!user || !newCustomer.name) return alert('Enter customer name');
    await addDoc(collection(db, 'customers'), {
      userId: user.uid,
      ...newCustomer,
      createdAt: Timestamp.now()
    });
    setCustomers([...customers, { ...newCustomer }]);
    setNewCustomer({ name: '', email: '', phone: '', address: '' });
    alert('Customer added!');
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthError('');
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setAuthError(err.message || 'Sign in failed');
    }
  };

  const handleEmailAuth = async () => {
    try {
      setAuthError('');
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">SA</span>
          </div>

          <div className="flex items-center gap-8 text-sm">
            {user && (
              <>
                <button onClick={() => setCurrentTab('dashboard')} className={currentTab === 'dashboard' ? 'text-emerald-400 font-medium' : 'text-zinc-400 hover:text-white'}>Dashboard</button>
                <button onClick={() => setCurrentTab('create')} className={currentTab === 'create' ? 'text-emerald-400 font-medium' : 'text-zinc-400 hover:text-white'}>Create</button>
                <button onClick={() => setCurrentTab('documents')} className={currentTab === 'documents' ? 'text-emerald-400 font-medium' : 'text-zinc-400 hover:text-white'}>My Documents</button>
                <button onClick={() => setCurrentTab('customers')} className={currentTab === 'customers' ? 'text-emerald-400 font-medium' : 'text-zinc-400 hover:text-white'}>Customers</button>
              </>
            )}
            {user ? (
              <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
            ) : (
              <button onClick={handleGoogleSignIn} className="bg-white text-black px-6 py-2 rounded-xl font-medium">Sign in</button>
            )}
          </div>
        </div>
      </header>

      {!user ? (
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h1 className="text-6xl font-bold leading-tight mb-6">Get paid faster.<br />Look more professional.</h1>
          <p className="text-2xl text-zinc-300 max-w-2xl mx-auto mb-12">RealQte helps small South African businesses, side hustles, startups, plumbers, salons, food vendors and contractors create beautiful invoices and quotes in seconds — completely free for your first 10 documents.</p>
          <div className="max-w-md mx-auto bg-zinc-900 rounded-3xl p-8">
            <div className="flex gap-4 mb-6">
              <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-2xl ${authMode === 'login' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'}`}>Login</button>
              <button onClick={() => setAuthMode('signup')} className={`flex-1 py-3 rounded-2xl ${authMode === 'signup' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'}`}>Sign Up</button>
            </div>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-6" />
            <button onClick={handleEmailAuth} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 rounded-2xl font-bold text-lg mb-4">
              {authMode === 'login' ? 'Sign In' : 'Create Free Account'}
            </button>
            <button onClick={handleGoogleSignIn} className="w-full bg-white text-black py-4 rounded-2xl font-medium flex items-center justify-center gap-3">
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" /> Continue with Google
            </button>
            {authError && <p className="text-red-400 text-center mt-4">{authError}</p>}
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-10">
          {currentTab === 'dashboard' && (
            <div>
              <h2 className="text-4xl font-bold mb-2">Welcome back, {profile.businessName || 'Business Owner'}!</h2>
              <p className="text-zinc-400 mb-10">You've used {usageCount} of 10 free documents</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <button onClick={() => setCurrentTab('create')} className="bg-emerald-500 hover:bg-emerald-400 text-black py-8 rounded-3xl text-2xl font-bold">Create New Invoice</button>
                <button onClick={() => setCurrentTab('create')} className="bg-blue-600 hover:bg-blue-500 text-white py-8 rounded-3xl text-2xl font-bold">Create New Quote</button>
                <button onClick={() => setCurrentTab('customers')} className="bg-zinc-800 hover:bg-zinc-700 py-8 rounded-3xl text-2xl font-bold">Manage Customers</button>
              </div>
            </div>
          )}

          {currentTab === 'create' && (
            <div className="grid lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 bg-zinc-900 rounded-3xl p-8">
                <h2 className="text-2xl font-semibold mb-6">Your Business Profile</h2>
                <input value={profile.businessName} onChange={e => setProfile({...profile, businessName: e.target.value})} placeholder="Business Name" className="w-full bg-zinc-800 p-3 rounded-xl mb-3" />
                <input value={profile.ownerName} onChange={e => setProfile({...profile, ownerName: e.target.value})} placeholder="Owner Name" className="w-full bg-zinc-800 p-3 rounded-xl mb-3" />
                <input value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} placeholder="Phone Number" className="w-full bg-zinc-800 p-3 rounded-xl mb-3" />
                <input value={profile.email} onChange={e => setProfile({...profile, email: e.target.value})} placeholder="Business Email" className="w-full bg-zinc-800 p-3 rounded-xl mb-3" />
                <input value={profile.taxNumber} onChange={e => setProfile({...profile, taxNumber: e.target.value})} placeholder="Tax / VAT / CIPC Number" className="w-full bg-zinc-800 p-3 rounded-xl mb-3" />
                <textarea value={profile.physicalAddress} onChange={e => setProfile({...profile, physicalAddress: e.target.value})} placeholder="Physical Address" className="w-full bg-zinc-800 p-3 rounded-xl h-20 mb-3" />
                <textarea value={profile.bankDetails} onChange={e => setProfile({...profile, bankDetails: e.target.value})} placeholder="Banking Details" className="w-full bg-zinc-800 p-3 rounded-xl h-20 mb-6" />

                <button onClick={() => alert('Profile saved! (expand save logic as needed)')} className="w-full bg-emerald-600 py-3 rounded-2xl">Save Profile</button>
              </div>

              <div className="lg:col-span-8 bg-zinc-900 rounded-3xl p-8">
                <div className="flex gap-4 mb-8">
                  <button onClick={() => setMode('invoice')} className={`flex-1 py-4 rounded-xl ${mode === 'invoice' ? 'bg-emerald-600' : 'bg-zinc-800'}`}>Invoice</button>
                  <button onClick={() => setMode('quote')} className={`flex-1 py-4 rounded-xl ${mode === 'quote' ? 'bg-emerald-600' : 'bg-zinc-800'}`}>Quote</button>
                </div>

                {mode === 'quote' && (
                  <div className="mb-6">
                    <label className="block text-sm text-zinc-400 mb-2">Quote valid for</label>
                    <select value={expiryDays} onChange={e => setExpiryDays(parseInt(e.target.value))} className="bg-zinc-800 p-3 rounded-xl w-full">
                      <option value={7}>7 days</option>
                      <option value={15}>15 days</option>
                      <option value={30}>30 days</option>
                    </select>
                  </div>
                )}

                <select 
                  value={selectedCustomerId} 
                  onChange={e => {
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

                <input value={client} onChange={e => setClient(e.target.value)} placeholder="Client Name" className="w-full bg-zinc-800 p-3 rounded-xl mb-4" />
                <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="Client Email" className="w-full bg-zinc-800 p-3 rounded-xl mb-6" />

                {/* Items */}
                <div className="space-y-4 mb-6">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex gap-4 bg-zinc-800 p-4 rounded-xl">
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

                <button onClick={saveAndDownload} className="w-full bg-emerald-500 py-5 rounded-2xl text-xl font-bold mt-8">Save & Download PDF</button>
                <button onClick={sendEmail} disabled={!isPro || !clientEmail} className="w-full bg-blue-600 py-5 rounded-2xl text-xl font-bold mt-4">Send via Email (Pro)</button>
              </div>
            </div>
          )}

          {currentTab === 'documents' && (
            <div>
              <h3 className="text-2xl font-semibold mb-6">My Documents</h3>
              {documents.length === 0 ? (
                <p>No documents yet. Create one in the Create tab.</p>
              ) : (
                documents.map(doc => (
                  <div key={doc.id} className="bg-zinc-900 p-6 rounded-3xl mb-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{doc.number} • {doc.type.toUpperCase()}</div>
                      <div className="text-sm text-zinc-500">{doc.client} • R{doc.total}</div>
                    </div>
                    <div className="flex gap-4">
                      <button onClick={() => alert('Re-download coming in next update')} className="text-emerald-400 underline">Download</button>
                      {doc.type === 'quote' && (
                        <button onClick={() => convertQuoteToInvoice(doc.id)} className="text-blue-400 underline">Convert to Invoice</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {currentTab === 'customers' && (
            <div>
              <h3 className="text-2xl font-semibold mb-6">Customers</h3>
              <div className="bg-zinc-900 p-8 rounded-3xl mb-8">
                <input type="text" placeholder="Customer Name" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} className="w-full bg-zinc-800 p-3 rounded-xl mb-4" />
                <input type="email" placeholder="Email" value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})} className="w-full bg-zinc-800 p-3 rounded-xl mb-4" />
                <input type="tel" placeholder="Phone" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} className="w-full bg-zinc-800 p-3 rounded-xl mb-4" />
                <textarea placeholder="Address" value={newCustomer.address} onChange={e => setNewCustomer({...newCustomer, address: e.target.value})} className="w-full bg-zinc-800 p-3 rounded-xl h-24 mb-6" />
                <button onClick={addCustomer} className="w-full bg-emerald-600 py-4 rounded-2xl">Add Customer</button>
              </div>

              <div className="space-y-4">
                {customers.map(c => (
                  <div key={c.id} className="bg-zinc-900 p-6 rounded-3xl">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-zinc-500">{c.email} • {c.phone}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}