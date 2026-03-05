'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

export default function AllInvoices() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      setUser(u);

      const snap = await getDocs(query(
        collection(db, 'documents'),
        where('userId', '==', u.uid),
        where('type', '==', 'invoice'),
        orderBy('createdAt', 'desc')
      ));
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const filteredInvoices = invoices.filter(inv => {
    const term = searchTerm.toLowerCase();
    return (
      inv.number?.toLowerCase().includes(term) ||
      inv.client?.toLowerCase().includes(term) ||
      inv.clientEmail?.toLowerCase().includes(term)
    );
  });

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
            <Link href="/profile" className="text-zinc-400 hover:text-white">Profile</Link>
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold text-white mb-8">All Invoices</h1>

        <input
          type="text"
          placeholder="Search by invoice number, client name or email..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full max-w-lg bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-8 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
        />

        {filteredInvoices.length === 0 ? (
          <p className="text-zinc-500 text-center py-10">No invoices found</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInvoices.map(inv => (
              <div key={inv.id} className="bg-zinc-900 rounded-3xl p-6 hover:bg-zinc-800 transition-all border border-zinc-700">
                <div className="font-medium text-white">{inv.number}</div>
                <div className="text-sm text-zinc-300">{inv.client} • R{inv.total}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {new Date(inv.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}