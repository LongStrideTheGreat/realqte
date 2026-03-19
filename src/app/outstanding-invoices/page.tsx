'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';

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
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-emerald-400 truncate">
                RealQte
              </h1>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded whitespace-nowrap">
                SA
              </span>
            </div>

            <nav className="hidden xl:flex items-center gap-8 text-sm">
              <Link href="/" className="text-zinc-400 hover:text-white">
                Dashboard
              </Link>
              <Link href="/new-invoice" className="text-zinc-400 hover:text-white">
                New Invoice
              </Link>
              <Link href="/new-quote" className="text-zinc-400 hover:text-white">
                New Quote
              </Link>
              <Link href="/quotes" className="text-zinc-400 hover:text-white">
                Quotes
              </Link>
              <Link href="/customers" className="text-zinc-400 hover:text-white">
                Customers
              </Link>
              <Link href="/invoices" className="text-emerald-400 font-medium">
                Invoices
              </Link>
              <Link href="/accounting" className="text-zinc-400 hover:text-white">
                Accounting
              </Link>
              <Link href="/reporting" className="text-zinc-400 hover:text-white">
                Reports
              </Link>
              <Link href="/profile" className="text-zinc-400 hover:text-white">
                Profile
              </Link>
              <button onClick={handleLogout} className="text-red-400 hover:underline">
                Logout
              </button>
            </nav>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="xl:hidden inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="xl:hidden mt-4 border-t border-zinc-800 pt-4">
              <div className="grid grid-cols-1 gap-2 text-sm">
                <Link
                  href="/"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Dashboard
                </Link>
                <Link
                  href="/new-invoice"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  New Invoice
                </Link>
                <Link
                  href="/new-quote"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  New Quote
                </Link>
                <Link
                  href="/quotes"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Quotes
                </Link>
                <Link
                  href="/customers"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Customers
                </Link>
                <Link
                  href="/invoices"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-emerald-400 bg-emerald-500/10 font-medium"
                >
                  Invoices
                </Link>
                <Link
                  href="/accounting"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Accounting
                </Link>
                <Link
                  href="/reporting"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Reports
                </Link>
                <Link
                  href="/profile"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-left rounded-xl px-3 py-2 text-red-400 hover:bg-zinc-800"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

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
    </div>
  );
}