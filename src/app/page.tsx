'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>({});
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

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

  // Calculate monthly totals
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

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* HEADER - Fixed for both logged-in and logged-out states */}
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
                <Link href="/" className="text-zinc-400 hover:text-white">Features</Link>
                <Link href="/" className="text-zinc-400 hover:text-white">Pricing</Link>
                <button 
                  onClick={() => {/* We'll add proper sign-in later if needed */}}
                  className="text-zinc-400 hover:text-white"
                >
                  Log in
                </button>
                <Link 
                  href="/" 
                  className="bg-white text-black px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-100"
                >
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {!user ? (
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h1 className="text-6xl font-bold leading-tight mb-6">Get paid faster.<br />Look more professional.</h1>
          <p className="text-2xl text-zinc-300 max-w-2xl mx-auto mb-12">
            RealQte helps small businesses, side hustles, startups, plumbers, salons, food vendors and contractors create beautiful invoices and quotes in seconds — completely free for your first 10 documents.
          </p>
          <Link 
            href="/" 
            className="inline-block bg-emerald-500 hover:bg-emerald-400 text-black text-2xl font-bold px-16 py-6 rounded-3xl"
          >
            Start for Free – Sign up with Google or E-mail
          </Link>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-10">
          {/* Welcome */}
          <div className="mb-12">
            <h2 className="text-4xl font-bold mb-2">Welcome back, {profile.businessName || 'Business Owner'}!</h2>
            <p className="text-zinc-400">You've used {usageCount} of 10 free documents this month</p>
          </div>

          {/* Monthly Totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
              <p className="text-zinc-400 text-sm">Invoiced this month</p>
              <p className="text-5xl font-bold text-emerald-400 mt-2">R{monthlyInvoiced.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
              <p className="text-zinc-400 text-sm">Quoted this month</p>
              <p className="text-5xl font-bold text-blue-400 mt-2">R{monthlyQuoted.toFixed(2)}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            <Link href="/new-invoice" className="bg-emerald-500 hover:bg-emerald-400 text-black p-10 rounded-3xl text-center text-2xl font-bold">Create New Invoice</Link>
            <Link href="/new-quote" className="bg-blue-600 hover:bg-blue-500 text-white p-10 rounded-3xl text-center text-2xl font-bold">Create New Quote</Link>
            <Link href="/customers" className="bg-zinc-700 hover:bg-zinc-600 text-white p-10 rounded-3xl text-center text-2xl font-bold">Manage Customers</Link>
          </div>

          {/* Reporting Section */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8 mb-12">
            <h3 className="text-2xl font-semibold mb-6">This Month's Report</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              <div>
                <p className="text-5xl font-bold text-emerald-400">{documents.filter(d => d.type === 'invoice').length}</p>
                <p className="text-zinc-400 mt-2">Invoices sent</p>
              </div>
              <div>
                <p className="text-5xl font-bold text-blue-400">{documents.filter(d => d.type === 'quote').length}</p>
                <p className="text-zinc-400 mt-2">Quotes sent</p>
              </div>
              <div>
                <p className="text-5xl font-bold text-purple-400">{customers.length}</p>
                <p className="text-zinc-400 mt-2">Total Customers</p>
              </div>
            </div>
          </div>

          {/* Email Blast (Premium) */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <h3 className="text-2xl font-semibold mb-4">Email Blast to All Customers</h3>
            <p className="text-zinc-400 mb-6">Send a message to your entire customer list</p>
            {!isPro ? (
              <button 
                onClick={() => alert('This is a Pro feature – upgrade for R35/month!')} 
                className="bg-zinc-700 hover:bg-zinc-600 py-4 px-10 rounded-2xl text-lg font-medium"
              >
                Pro Feature: Send Email Blast
              </button>
            ) : (
              <button className="bg-purple-600 hover:bg-purple-500 py-4 px-10 rounded-2xl text-lg font-medium">
                Send Email Blast to All Customers
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}