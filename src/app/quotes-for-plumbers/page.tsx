import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Top Quotes for Plumbers | RealQte',
  description: 'Create professional plumbing quotes with RealQte. Quote labour, callouts, materials, repairs, and installation work with a cleaner workflow.',
  alternates: {
    canonical: 'https://realqte.com/quotes-for-plumbers',
  },
  openGraph: {
    title: 'Top Quotes for Plumbers | RealQte',
    description: 'Create professional plumbing quotes with RealQte. Quote labour, callouts, materials, repairs, and installation work with a cleaner workflow.',
    url: 'https://realqte.com/quotes-for-plumbers',
    siteName: 'RealQte',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Top Quotes for Plumbers | RealQte',
    description: 'Create professional plumbing quotes with RealQte. Quote labour, callouts, materials, repairs, and installation work with a cleaner workflow.',
  },
};

export default function Page() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-2xl sm:text-[28px] font-bold text-emerald-400 whitespace-nowrap">
              RealQte
            </h1>
            <span className="text-[11px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap">
              .com
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="text-zinc-300 hover:text-white">Home</Link>
            <Link href="/mini-website" className="text-zinc-300 hover:text-white">Mini Website</Link>
            <Link href="/help" className="text-zinc-300 hover:text-white">Help</Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center bg-white hover:bg-zinc-100 text-black px-5 py-2.5 rounded-xl font-medium"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-emerald-500/12 blur-3xl" />
            <div className="absolute top-40 right-0 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-emerald-400 font-medium mb-4">Quotes for Plumbers</p>
                <h1 className="text-4xl sm:text-6xl font-bold leading-tight mb-6">
                  Create plumbing quotes faster and present your work more professionally.
                </h1>
                <p className="text-lg sm:text-xl text-zinc-300 leading-8 max-w-2xl mb-8">
                  RealQte helps plumbers create clear, polished quotes for repairs, maintenance, installations, and callout work without messy manual documents.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl text-lg font-bold"
                  >
                    Start Free
                  </Link>
                  <Link
                    href="/help"
                    className="inline-flex items-center justify-center border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white px-8 py-4 rounded-2xl text-lg font-medium"
                  >
                    Learn More
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Benefit 1</p>
                    <p className="text-white font-semibold">Quote plumbing work faster</p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Benefit 2</p>
                    <p className="text-white font-semibold">Present labour and materials clearly</p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Benefit 3</p>
                    <p className="text-white font-semibold">Save repeat services and customer info</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
                <div className="grid gap-4">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-2">Best fit</p>
                    <h3 className="text-2xl font-bold text-white mb-3">Quotes for Plumbers</h3>
                    <p className="text-zinc-300 leading-7">
                      Independent plumbers, plumbing teams, repair services, and service businesses
                    </p>
                  </div>

                  <div className="bg-gradient-to-r from-emerald-500/15 to-blue-500/15 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="font-semibold text-white mb-2">Built to support growth</h3>
                    <p className="text-zinc-300 text-sm leading-7">
                      RealQte is expanding beyond quotes and invoices into mini websites, lead capture,
                      CRM workflows, and stronger business tools for small businesses worldwide.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
          <div className="text-center mb-12">
            <p className="text-emerald-400 font-medium mb-3">How it works</p>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4">
              A simple workflow for busy businesses
            </h2>
            <p className="text-zinc-400 max-w-3xl mx-auto text-lg">
              RealQte is designed to reduce admin friction and help you present your business more professionally.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <div className="text-emerald-400 text-3xl font-bold mb-4">01</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Add your business details</h3>
              <p className="text-zinc-400">Set up your profile and branding for stronger trust.</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <div className="text-emerald-400 text-3xl font-bold mb-4">02</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Create the quote</h3>
              <p className="text-zinc-400">Add labour, materials, transport, and service items clearly.</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <div className="text-emerald-400 text-3xl font-bold mb-4">03</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Send and manage</h3>
              <p className="text-zinc-400">Keep quotes organised and move faster when clients respond.</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <div className="text-emerald-400 text-3xl font-bold mb-4">04</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Expand into workflow tools</h3>
              <p className="text-zinc-400">Use invoices, mini websites, and CRM when your business grows.</p>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
          <div className="max-w-3xl mb-10">
            <p className="text-emerald-400 font-medium mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4">Frequently asked questions</h2>
          </div>

          <div className="grid gap-4">
            <div key="1" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Can RealQte be used for plumbing quotes?</h3>
              <p className="text-zinc-400 leading-7">Yes. It is well suited to service-based quoting workflows like plumbing.</p>
            </div>
            <div key="2" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Can I add multiple line items?</h3>
              <p className="text-zinc-400 leading-7">Yes. You can show labour, materials, transport, and other service costs clearly.</p>
            </div>
            <div key="3" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Is it useful for small plumbing businesses?</h3>
              <p className="text-zinc-400 leading-7">Yes. RealQte is aimed at small businesses that need a simpler quoting workflow.</p>
            </div>
            <div key="4" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Can I look more credible with clients?</h3>
              <p className="text-zinc-400 leading-7">Yes. Cleaner documents improve presentation and trust.</p>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 sm:p-10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-emerald-400 font-medium mb-3">Ready to start?</p>
                <h2 className="text-3xl sm:text-4xl font-bold mb-3">
                  Use RealQte to build a cleaner business workflow.
                </h2>
                <p className="text-zinc-400 leading-7">
                  Start with quotes and invoices, then expand into mini websites, lead capture, and CRM as your business grows.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 min-w-[220px]">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-4 rounded-2xl font-semibold"
                >
                  Start Free
                </Link>
                <Link
                  href="/mini-website"
                  className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-4 rounded-2xl font-semibold"
                >
                  Explore Features
                </Link>
              </div>
            </div>
          </div>
        </section>
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
      </main>
    </div>
  );
}
