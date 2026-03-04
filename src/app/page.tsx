'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

const provider = new GoogleAuthProvider();

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>({});
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Auth modal states
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Monthly totals
  const [monthlyInvoiced, setMonthlyInvoiced] = useState(0);
  const [monthlyQuoted, setMonthlyQuoted] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userSnap = await getDoc(doc(db, 'users', u.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setProfile(data.profile || {});
          setIsPro(data.isPro || false);
        }

        const docsSnap = await getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid), orderBy('createdAt', 'desc')));
        setDocuments(docsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const custSnap = await getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid)));
        setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    });
    return unsubscribe;
  }, []);

  // Monthly totals calculation
  useEffect(() => {
    if (documents.length === 0) return;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let invoiced = 0;
    let quoted = 0;

    documents.forEach(doc => {
      const docDate = new Date(doc.createdAt?.seconds * 1000 || 0);
      if (docDate.getMonth() === currentMonth && docDate.getFullYear() === currentYear) {
        if (doc.type === 'invoice') invoiced += parseFloat(doc.total || 0);
        if (doc.type === 'quote') quoted += parseFloat(doc.total || 0);
      }
    });

    setMonthlyInvoiced(invoiced);
    setMonthlyQuoted(quoted);
  }, [documents]);

  const usageCount = documents.length;

  const handleGoogleSignIn = async () => {
    try {
      setAuthError('');
      await signInWithPopup(auth, provider);
      setShowAuth(false);
    } catch (err: any) {
      setAuthError(err.message || 'Google sign in failed');
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
      setShowAuth(false);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  // Scroll to sections
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* HEADER */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">SA</span>
          </div>

          <div className="flex items-center gap-8 text-sm">
            {user ? (
              <>
                <Link href="/" className="text-emerald-400 font-medium">Dashboard</Link>
                <Link href="/new-invoice" className="text-zinc-400 hover:text-white">New Invoice</Link>
                <Link href="/new-quote" className="text-zinc-400 hover:text-white">New Quote</Link>
                <Link href="/customers" className="text-zinc-400 hover:text-white">Customers</Link>
                <Link href="/accounting" className="text-zinc-400 hover:text-white">Accounting</Link>
                <Link href="/reporting" className="text-zinc-400 hover:text-white">Reports</Link>
                <Link href="/profile" className="text-zinc-400 hover:text-white">Profile</Link>
                <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
              </>
            ) : (
              <>
                <button onClick={() => scrollToSection('features')} className="text-zinc-400 hover:text-white">Features</button>
                <button onClick={() => scrollToSection('pricing')} className="text-zinc-400 hover:text-white">Pricing</button>
                <button onClick={() => setShowAuth(true)} className="text-zinc-400 hover:text-white">Log in</button>
                <button 
                  onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
                  className="bg-white text-black px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-100"
                >
                  Sign up free
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      {showAuth && !user && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-3xl p-10 max-w-md w-full mx-4">
            <h2 className="text-3xl font-bold mb-6 text-center">
              {authMode === 'login' ? 'Log In' : 'Sign Up'}
            </h2>

            <div className="flex gap-4 mb-8">
              <button 
                onClick={() => setAuthMode('login')} 
                className={`flex-1 py-3 rounded-xl ${authMode === 'login' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'}`}
              >
                Log In
              </button>
              <button 
                onClick={() => setAuthMode('signup')} 
                className={`flex-1 py-3 rounded-xl ${authMode === 'signup' ? 'bg-emerald-500 text-black' : 'bg-zinc-800'}`}
              >
                Sign Up
              </button>
            </div>

            <button
              onClick={handleGoogleSignIn}
              className="w-full bg-white text-black py-4 rounded-xl font-medium flex items-center justify-center gap-3 mb-6 hover:bg-zinc-100"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Continue with Google
            </button>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-zinc-900 text-zinc-500">or</span>
              </div>
            </div>

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:border-emerald-500"
            />

            <button
              onClick={handleEmailAuth}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 rounded-2xl font-bold text-lg mb-4"
            >
              {authMode === 'login' ? 'Log In' : 'Create Free Account'}
            </button>

            {authError && <p className="text-red-400 text-center mb-4">{authError}</p>}

            <button 
              onClick={() => setShowAuth(false)} 
              className="w-full text-zinc-400 hover:text-white py-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Landing Page */}
      {!user ? (
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h1 className="text-6xl font-bold leading-tight mb-6">Get paid faster.<br />Look more professional.</h1>
          <p className="text-2xl text-zinc-300 max-w-2xl mx-auto mb-12">
            RealQte helps small businesses, side hustles, startups, plumbers, salons, food vendors and contractors create beautiful invoices and quotes in seconds — completely free for your first 10 documents.
          </p>

          <div className="flex justify-center gap-6 mb-16">
            <button 
              onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
              className="bg-emerald-500 hover:bg-emerald-400 text-black text-2xl font-bold px-16 py-6 rounded-3xl"
            >
              Start for Free
            </button>
          </div>

          {/* Features Section */}
          <section id="features" className="py-20 border-t border-zinc-800">
            <h2 className="text-4xl font-bold mb-12">Features</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-zinc-900 p-8 rounded-3xl">
                <h3 className="text-2xl font-semibold mb-4">Instant PDFs</h3>
                <p className="text-zinc-400">Generate professional quotes and invoices in seconds with your logo and details.</p>
              </div>
              <div className="bg-zinc-900 p-8 rounded-3xl">
                <h3 className="text-2xl font-semibold mb-4">Customer Management</h3>
                <p className="text-zinc-400">Save clients for quick auto-fill and repeat use.</p>
              </div>
              <div className="bg-zinc-900 p-8 rounded-3xl">
                <h3 className="text-2xl font-semibold mb-4">Pro Tools</h3>
                <p className="text-zinc-400">Unlimited documents, email sending, reporting, and more.</p>
              </div>
            </div>
          </section>

          {/* Pricing Section */}
          <section id="pricing" className="py-20 border-t border-zinc-800">
            <h2 className="text-4xl font-bold mb-12">Pricing</h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              <div className="bg-zinc-900 p-8 rounded-3xl border-2 border-emerald-500">
                <h3 className="text-2xl font-bold mb-4">Free</h3>
                <p className="text-5xl font-bold mb-6">R0</p>
                <ul className="text-zinc-400 space-y-3 mb-8">
                  <li>10 free quotes + 5 free invoices</li>
                  <li>Basic PDF generation</li>
                  <li>Customer management</li>
                  <li>Profile customization</li>
                </ul>
                <button onClick={() => { setAuthMode('signup'); setShowAuth(true); }} className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-bold">
                  Get Started Free
                </button>
              </div>

              <div className="bg-zinc-900 p-8 rounded-3xl border-2 border-purple-500 relative">
                <div className="absolute top-0 right-6 bg-purple-600 text-white px-4 py-1 rounded-b-lg text-sm font-bold">Popular</div>
                <h3 className="text-2xl font-bold mb-4">Pro</h3>
                <p className="text-5xl font-bold mb-6">R35<span className="text-xl">/month</span></p>
                <ul className="text-zinc-400 space-y-3 mb-8">
                  <li>Unlimited invoices & quotes</li>
                  <li>Send via Email</li>
                  <li>Advanced reporting</li>
                  <li>Pay Now links (coming soon)</li>
                  <li>Email blast to customers</li>
                </ul>
                <button onClick={() => alert('Upgrade coming soon – contact support!')} className="w-full bg-purple-600 hover:bg-purple-500 py-4 rounded-2xl font-bold">
                  Upgrade to Pro
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-10">
          {/* Dashboard content remains the same */}
          {/* ... (your existing dashboard code here) ... */}
        </div>
      )}
    </div>
  );
}