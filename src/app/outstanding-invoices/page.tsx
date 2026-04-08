'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import AppHeader from '@/components/AppHeader';

export default function OutstandingInvoices() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push('/');

      setUser(u);
      setMobileMenuOpen(false);

      const userSnap = await getDoc(doc(db, 'users', u.uid));
      if (userSnap.exists()) {
        setIsPro(userSnap.data().isPro || false);
      }

      const snap = await getDocs(
        query(
          collection(db, 'documents'),
          where('userId', '==', u.uid),
          where('type', '==', 'invoice'),
          where('status', 'in', ['sent', 'overdue']),
          orderBy('createdAt', 'desc')
        )
      );

      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsubscribe();
  }, [router]);

  const filteredInvoices = invoices.filter((inv) => {
    const term = searchTerm.toLowerCase();
    return (
      inv.number?.toLowerCase().includes(term) ||
      inv.client?.toLowerCase().includes(term) ||
      inv.clientEmail?.toLowerCase().includes(term)
    );
  });

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-zinc-950">
      <AppHeader
        user={user}
        setupComplete={true}
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">
          Outstanding Invoices
        </h1>

        {!isPro ? (
          <div className="bg-zinc-900 rounded-3xl p-8 sm:p-10 text-center">
            <h3 className="text-2xl font-semibold mb-6 text-white">Pro Feature</h3>
            <p className="text-zinc-400 mb-8">
              View and manage all outstanding (unpaid) invoices with detailed search and status
              updates.
              <br />
              Upgrade to Pro for R35/month to unlock this.
            </p>
            <button
              onClick={() => alert('Upgrade to Pro coming soon – contact support!')}
              className="bg-purple-600 hover:bg-purple-500 py-4 sm:py-5 px-8 sm:px-12 rounded-2xl text-lg sm:text-xl font-bold text-white"
            >
              Upgrade to Pro
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Search by invoice number, client name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-lg bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-8 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />

            {filteredInvoices.length === 0 ? (
              <p className="text-zinc-500 text-center py-10">No outstanding invoices found</p>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="bg-zinc-900 rounded-3xl p-6 hover:bg-zinc-800 transition-all border border-zinc-700"
                  >
                    <div className="font-medium text-white text-lg">{inv.number}</div>
                    <div className="text-sm text-zinc-300 mt-1">
                      {inv.client} • R{inv.total}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Due: {new Date(inv.date).toLocaleDateString()} • Status: {inv.status || 'Sent'}
                    </div>
                    <div className="mt-4 flex gap-3 flex-wrap">
                      <button className="text-emerald-400 hover:underline text-sm">
                        Mark as Paid
                      </button>
                      <Link
                        href={`/invoice/${inv.id}`}
                        className="text-blue-400 hover:underline text-sm"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <footer className="mt-12 border-t border-zinc-800 pt-6 pb-4">
  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-500">
    
    <p>
      © {new Date().getFullYear()} RealQte. All rights reserved.
    </p>

    <div className="flex items-center gap-4">
      <Link href="/help" className="hover:text-white transition">
        Help
      </Link>
      <Link href="/legal" className="hover:text-white transition">
        Legal
      </Link>
      <Link href="/privacy" className="hover:text-white transition">
        Privacy
      </Link>
    </div>

  </div>
</footer>
    </div>
  );
}