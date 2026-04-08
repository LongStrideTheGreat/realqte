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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-12">
          <p className="text-emerald-400 font-medium mb-3">Help</p>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4">How to use RealQTE</h1>
          <p className="text-zinc-400 max-w-3xl leading-7 text-lg">
            Use this page as a central guide for setup, quoting, invoicing, mini websites,
            CRM, and the public feature pages that help people discover RealQTE.
          </p>
        </div>

        <section className="grid lg:grid-cols-2 gap-6 mb-10">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <h2 className="text-xl font-semibold mb-3">1. Complete your profile first</h2>
            <p className="text-zinc-400 leading-7 mb-4">
              Add your business name, owner name, phone number, business email, and logo.
              These details are used on your quotes, invoices, and mini website.
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
              <Link
                href="/customers"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium"
              >
                Customers
              </Link>
              <Link
                href="/products"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium"
              >
                Products
              </Link>
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-3 gap-6 mb-10">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Create</p>
            <h3 className="text-lg font-semibold mb-3">Quotes and invoices</h3>
            <p className="text-zinc-400 leading-7 mb-4">
              Use the Create menu in the header to open a new quote or invoice.
              Save, download, email, WhatsApp, or open public links from the builder pages.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/quote-generator"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium"
              >
                Quote Generator
              </Link>
              <Link
                href="/invoice-generator"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium"
              >
                Invoice Generator
              </Link>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Mini Site</p>
            <h3 className="text-lg font-semibold mb-3">Public business page</h3>
            <p className="text-zinc-400 leading-7 mb-4">
              Build your business page, publish it, and share the link with clients.
              Visitors can submit quote requests directly from that page.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/mini-website"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium"
              >
                Mini Website Builder
              </Link>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">CRM</p>
            <h3 className="text-lg font-semibold mb-3">Manage leads</h3>
            <p className="text-zinc-400 leading-7 mb-4">
              Review leads, update their statuses, create quotes from them, and track their progress
              inside the CRM page.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/crm-for-small-business"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium"
              >
                CRM Guide
              </Link>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <div className="mb-6">
            <p className="text-emerald-400 font-medium mb-3">Explore tools</p>
            <h2 className="text-2xl sm:text-4xl font-bold">Feature hub</h2>
            <p className="text-zinc-400 mt-3 max-w-3xl leading-7">
              These pages help users discover what RealQTE can do and also help search engines
              understand the platform more clearly.
            </p>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Link href="/invoice-generator" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Tool page</p>
              <h3 className="text-lg font-semibold text-white mb-2">Invoice Generator</h3>
              <p className="text-zinc-400 text-sm leading-6">A public page focused on invoice creation for small businesses.</p>
            </Link>

            <Link href="/quote-generator" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Tool page</p>
              <h3 className="text-lg font-semibold text-white mb-2">Quote Generator</h3>
              <p className="text-zinc-400 text-sm leading-6">A public page focused on creating polished quotes faster.</p>
            </Link>

            <Link href="/mini-website" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Feature page</p>
              <h3 className="text-lg font-semibold text-white mb-2">Mini Website Builder</h3>
              <p className="text-zinc-400 text-sm leading-6">A public page for businesses that want a simple online presence and quote requests.</p>
            </Link>

            <Link href="/crm-for-small-business" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Feature page</p>
              <h3 className="text-lg font-semibold text-white mb-2">CRM for Small Business</h3>
              <p className="text-zinc-400 text-sm leading-6">A public page explaining how leads and simple CRM workflows fit into RealQTE.</p>
            </Link>
          </div>
        </section>

        <section className="mb-10">
          <div className="mb-6">
            <p className="text-emerald-400 font-medium mb-3">Learn and compare</p>
            <h2 className="text-2xl sm:text-4xl font-bold">SEO support pages</h2>
            <p className="text-zinc-400 mt-3 max-w-3xl leading-7">
              These pages target industry, workflow, and educational search intent so more people
              can discover RealQTE through relevant searches.
            </p>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Link href="/invoice-software-for-small-business" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <h3 className="text-lg font-semibold text-white mb-2">Invoice Software for Small Business</h3>
              <p className="text-zinc-400 text-sm leading-6">Positioning page for businesses evaluating invoicing tools.</p>
            </Link>

            <Link href="/quotes-for-contractors" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <h3 className="text-lg font-semibold text-white mb-2">Quotes for Contractors</h3>
              <p className="text-zinc-400 text-sm leading-6">Use-case page for contractors and service-based quoting workflows.</p>
            </Link>

            <Link href="/invoicing-for-freelancers" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <h3 className="text-lg font-semibold text-white mb-2">Invoicing for Freelancers</h3>
              <p className="text-zinc-400 text-sm leading-6">Use-case page for solo operators and freelance invoicing workflows.</p>
            </Link>

            <Link href="/quotes-for-plumbers" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <h3 className="text-lg font-semibold text-white mb-2">Quotes for Plumbers</h3>
              <p className="text-zinc-400 text-sm leading-6">Industry page for plumbing and service-quote workflows.</p>
            </Link>

            <Link href="/how-to-create-an-invoice" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <h3 className="text-lg font-semibold text-white mb-2">How to Create an Invoice</h3>
              <p className="text-zinc-400 text-sm leading-6">Educational page for top-of-funnel invoice-related searches.</p>
            </Link>

            <Link href="/how-to-write-a-quote" className="block bg-zinc-900 border border-zinc-800 rounded-3xl p-5 hover:bg-zinc-800/70 transition">
              <h3 className="text-lg font-semibold text-white mb-2">How to Write a Quote</h3>
              <p className="text-zinc-400 text-sm leading-6">Educational page for quote-related search intent.</p>
            </Link>
          </div>

          <div className="mt-4">
            <Link href="/how-to-get-more-clients" className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 font-medium">
              Read: How to Get More Clients
            </Link>
          </div>
        </section>

        <footer className="border-t border-zinc-800 pt-8 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <p className="text-white font-semibold">RealQTE Help Hub</p>
              <p className="text-zinc-500 mt-2 text-sm max-w-2xl">
                Use these links to move between setup, features, workflow pages, and public SEO pages.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <Link href="/" className="text-zinc-400 hover:text-white">Home</Link>
              <Link href="/mini-website" className="text-zinc-400 hover:text-white">Mini Website</Link>
              <Link href="/invoice-generator" className="text-zinc-400 hover:text-white">Invoice Generator</Link>
              <Link href="/quote-generator" className="text-zinc-400 hover:text-white">Quote Generator</Link>
              <Link href="/crm-for-small-business" className="text-zinc-400 hover:text-white">CRM</Link>
            </div>
          </div>

          <div className="mt-6 text-sm text-zinc-500">
            © {new Date().getFullYear()} RealQTE. All rights reserved.
          </div>
        </footer>
      </main>
    </div>
  );
}
