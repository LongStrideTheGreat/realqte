'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import AppHeader from '@/components/AppHeader';

export default function HelpPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        user={user}
        setupComplete={true}
        onLogout={handleLogout}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-10">
          <p className="text-emerald-400 font-medium mb-3">Help</p>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4">How to use RealQTE</h1>
          <p className="text-zinc-400 max-w-3xl leading-7">
            Use this page when you need a quick guide for setup, quoting, invoicing,
            the Mini Site, and CRM.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <h2 className="text-xl font-semibold mb-3">1. Complete your profile first</h2>
            <p className="text-zinc-400 leading-7 mb-4">
              Add your business name, owner name, phone number, business email, and logo.
              These details are used on your quotes, invoices, and mini site.
            </p>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 font-medium"
            >
              Open Profile
            </Link>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <h2 className="text-xl font-semibold mb-3">2. Add customers and products</h2>
            <p className="text-zinc-400 leading-7 mb-4">
              Save customer details and products once so you can reuse them quickly when creating
              quotes and invoices.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/customers" className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium">
                Customers
              </Link>
              <Link href="/products" className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium">
                Products
              </Link>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Create</p>
            <h3 className="text-lg font-semibold mb-3">Quotes and invoices</h3>
            <p className="text-zinc-400 leading-7">
              Use the Create menu in the header to open a new quote or invoice.
              Save, download, email, WhatsApp, or open public links from the builder pages.
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Mini Site</p>
            <h3 className="text-lg font-semibold mb-3">Public business page</h3>
            <p className="text-zinc-400 leading-7">
              Build your business page, publish it, and share the link with clients.
              Visitors can submit quote requests directly from that page.
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">CRM</p>
            <h3 className="text-lg font-semibold mb-3">Manage leads</h3>
            <p className="text-zinc-400 leading-7">
              Review leads, update their statuses, create quotes from them, and track their progress
              inside the CRM page.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
