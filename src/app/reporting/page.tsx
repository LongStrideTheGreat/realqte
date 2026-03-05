'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

export default function Reporting() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push('/');
      setUser(u);

      const userSnap = await getDoc(doc(db, 'users', u.uid));
      if (userSnap.exists()) {
        setIsPro(userSnap.data().isPro || false);
      }

      const docsSnap = await getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid), orderBy('createdAt', 'desc')));
      setDocuments(docsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const custSnap = await getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid)));
      setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [router]);

  // Lifetime totals
  const lifetimeInvoiced = documents
    .filter(d => d.type === 'invoice')
    .reduce((sum, d) => sum + parseFloat(d.total || 0), 0);

  const lifetimeQuoted = documents
    .filter(d => d.type === 'quote')
    .reduce((sum, d) => sum + parseFloat(d.total || 0), 0);

  // Quote conversion rate (simple: number of invoices that were from quotes)
  const convertedQuotes = documents.filter(d => d.type === 'invoice' && d.fromQuote).length;  // Assume 'fromQuote' flag from recurring feature
  const totalQuotes = documents.filter(d => d.type === 'quote').length;
  const conversionRate = totalQuotes > 0 ? ((convertedQuotes / totalQuotes) * 100).toFixed(1) : '0.0';

  // Top customers by invoiced amount
  const customerTotals = customers.map(cust => {
    const custInvoices = documents.filter(d => d.client === cust.name && d.type === 'invoice');
    const total = custInvoices.reduce((sum, d) => sum + parseFloat(d.total || 0), 0);
    return { name: cust.name, total };
  }).sort((a, b) => b.total - a.total).slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">SA</span>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-white">Dashboard</Link>
            <Link href="/new-invoice" className="text-zinc-400 hover:text-white">New Invoice</Link>
            <Link href="/new-quote" className="text-zinc-400 hover:text-white">New Quote</Link>
            <Link href="/customers" className="text-zinc-400 hover:text-white">Customers</Link>
            <Link href="/accounting" className="text-zinc-400 hover:text-white">Accounting</Link>
            <Link href="/reporting" className="text-emerald-400 font-medium">Reports</Link>
            <Link href="/profile" className="text-zinc-400 hover:text-white">Profile</Link>
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold mb-8">Reports & Insights</h1>

        {!isPro ? (
          <div className="bg-zinc-900 rounded-3xl p-10 text-center">
            <h3 className="text-2xl font-semibold mb-6">Pro Reports</h3>
            <p className="text-zinc-400 mb-8">
              Unlock advanced reporting, lifetime totals, conversion rates, top customers, and more.<br />
              Upgrade to Pro for R35/month.
            </p>
            <button 
              onClick={() => alert('Upgrade to Pro coming soon - contact support!')} 
              className="bg-emerald-600 hover:bg-emerald-500 py-5 px-12 rounded-2xl text-xl font-bold"
            >
              Upgrade to Pro
            </button>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Lifetime Overview */}
            <div className="bg-zinc-900 rounded-3xl p-8">
              <h3 className="text-2xl font-semibold mb-6">Lifetime Overview</h3>
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-5xl font-bold text-emerald-400">R{lifetimeInvoiced.toFixed(2)}</p>
                  <p className="text-zinc-400 mt-2">Total Invoiced</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-blue-400">R{lifetimeQuoted.toFixed(2)}</p>
                  <p className="text-zinc-400 mt-2">Total Quoted</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-purple-400">{conversionRate}%</p>
                  <p className="text-zinc-400 mt-2">Quote Conversion Rate</p>
                </div>
              </div>
            </div>

            {/* Top Customers */}
            <div className="bg-zinc-900 rounded-3xl p-8">
              <h3 className="text-2xl font-semibold mb-6">Top Customers by Value</h3>
              {customerTotals.length === 0 ? (
                <p className="text-zinc-500 text-center py-10">No invoices yet</p>
              ) : (
                <div className="space-y-4">
                  {customerTotals.map((cust, index) => (
                    <div key={index} className="bg-zinc-800 p-5 rounded-2xl flex justify-between items-center">
                      <div className="font-medium">{cust.name}</div>
                      <div className="text-emerald-400 font-bold">R{cust.total.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Additional Stats */}
            <div className="bg-zinc-900 rounded-3xl p-8">
              <h3 className="text-2xl font-semibold mb-6">Other Insights</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-5xl font-bold text-emerald-400">{documents.filter(d => d.type === 'invoice').length}</p>
                  <p className="text-zinc-400">Total Invoices</p>
                </div>
                <div>
                  <p className="text-5xl font-bold text-blue-400">{documents.filter(d => d.type === 'quote').length}</p>
                  <p className="text-zinc-400">Total Quotes</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}