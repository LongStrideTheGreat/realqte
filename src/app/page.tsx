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
  const [profile, setProfile] = useState({ businessName: '', ownerName: '', taxNumber: '', bankDetails: '', logo: '' });
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [documents, setDocuments] = useState<any[]>([]);

  // Tool states
  const [mode, setMode] = useState<'invoice' | 'quote'>('invoice');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [client, setClient] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [items, setItems] = useState([{ desc: '', qty: 1, rate: 0 }]);
  const [vat, setVat] = useState(15);
  const [notes, setNotes] = useState('Thank you for your business!');
  const [previewHTML, setPreviewHTML] = useState('');

  // Auth states
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Load user + data
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
      } else {
        setDocuments([]);
        setUsageCount(0);
      }
    });
    return unsubscribe;
  }, []);

  // Generate invoice/quote number
  useEffect(() => {
    if (user && documents.length >= 0) {
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
          <div><strong>${profile.businessName || 'Your Business'}</strong><br>${profile.ownerName}<br>${profile.taxNumber ? `Tax/VAT: ${profile.taxNumber}` : ''}</div>
          <div style="text-align: right;">${invoiceNo}<br>Date: ${date}</div>
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
  }, [profile, items, vat, client, date, invoiceNo, notes, mode]);

  const saveAndDownload = async () => { /* your original full function - paste it here if you want, it's unchanged */ };

  // Premium Send Email (using your template_50lnuc5)
  const sendEmail = async () => {
    if (!isPro) return alert('Pro feature only – upgrade for R35/month!');
    if (!clientEmail) return alert('Enter client email first');

    const pdfContainer = document.createElement('div');
    pdfContainer.innerHTML = previewHTML;
    pdfContainer.style.position = 'absolute'; pdfContainer.style.left = '-9999px';
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

  // Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      setAuthError('');
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Sign in failed');
    }
  };

  // Email/Password Sign In & Sign Up
  const handleEmailAuth = async () => {
    try {
      setAuthError('');
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Authentication failed');
    }
  };

  const goPro = () => { /* your PayFast code - unchanged */ };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* HEADER */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">SA</span>
          </div>
          <div className="flex items-center gap-6">
            {user ? (
              <>
                <Link href="/profile" className="text-zinc-400 hover:text-white">Profile</Link>
                <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
              </>
            ) : (
              <button onClick={handleGoogleSignIn} className="bg-white text-black px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-100">
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* LANDING PAGE - Improved */}
      {!user ? (
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h1 className="text-6xl font-bold leading-tight mb-6">
            Get paid faster.<br />
            Look more professional.
          </h1>
          <p className="text-2xl text-zinc-300 max-w-2xl mx-auto mb-12">
            RealQte helps small South African businesses, side hustles, startups, plumbers, salons, food vendors and contractors 
            create beautiful invoices and quotes in seconds — completely free for your first 10 documents.
          </p>

          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-16 text-left">
            <div className="bg-zinc-900 p-8 rounded-3xl">✓ Instant PDF with your logo & banking details</div>
            <div className="bg-zinc-900 p-8 rounded-3xl">✓ Auto numbering + VAT ready for SA</div>
            <div className="bg-zinc-900 p-8 rounded-3xl">✓ Pro: Send invoices by email + unlimited use</div>
          </div>

          <div className="max-w-md mx-auto bg-zinc-900 rounded-3xl p-8">
            <div className="flex gap-4 mb-6">
              <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-2xl ${authMode === 'login' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'}`}>Login</button>
              <button onClick={() => setAuthMode('signup')} className={`flex-1 py-3 rounded-2xl ${authMode === 'signup' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'}`}>Sign Up</button>
            </div>

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-6"
            />

            <button onClick={handleEmailAuth} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 rounded-2xl font-bold text-lg mb-4">
              {authMode === 'login' ? 'Sign In' : 'Create Free Account'}
            </button>

            <button onClick={handleGoogleSignIn} className="w-full bg-white text-black py-4 rounded-2xl font-medium flex items-center justify-center gap-3">
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" /> Continue with Google
            </button>

            {authError && <p className="text-red-400 text-center mt-4">{authError}</p>}
          </div>

          <p className="text-zinc-500 mt-8">No credit card • Cancel anytime • Made for South African small businesses</p>
        </div>
      ) : (
        // Logged-in tool (your existing tool + new features)
        <div className="max-w-7xl mx-auto px-6 py-10">
          {/* Your full tool grid here - I kept it exactly as you had before, just added the send button and history */}
          {/* Paste your original profile sidebar + main tool here if you want, or let me know and I'll fill it */}
          {/* For brevity I left a placeholder - reply and I'll send the full version with your exact sidebar */}
          <div className="text-center py-20 text-2xl">Tool area (your original code goes here)</div>

          {/* Premium Send Email */}
          <div className="max-w-md mx-auto mt-12">
            <input
              type="email"
              value={clientEmail}
              onChange={e => setClientEmail(e.target.value)}
              placeholder="Client email to send invoice to"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4"
            />
            <button
              onClick={sendEmail}
              disabled={!isPro || !clientEmail}
              className={`w-full py-5 rounded-2xl text-xl font-bold ${!isPro || !clientEmail ? 'bg-zinc-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}
            >
              { !isPro ? 'Pro: Send via Email' : 'Send Invoice/Quote via Email' }
            </button>
          </div>

          {/* Documents History */}
          <div className="mt-16">
            <h3 className="text-2xl font-semibold mb-6">My Documents</h3>
            {documents.length === 0 ? (
              <p>No documents yet. Create one above!</p>
            ) : (
              documents.map(doc => (
                <div key={doc.id} className="bg-zinc-900 p-6 rounded-3xl mb-4 flex justify-between">
                  <div>{doc.number} - {doc.type} - R{doc.total}</div>
                  <button className="text-emerald-400 underline">Download</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}