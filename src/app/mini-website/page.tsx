import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mini Website Builder for Small Businesses | RealQTE',
  description:
    'Create a simple public business page with a quote request form, WhatsApp contact button, and lead capture inside RealQTE.',
  alternates: {
    canonical: 'https://realqte.com/mini-website',
  },
  openGraph: {
    title: 'Mini Website Builder for Small Businesses | RealQTE',
    description:
      'Create a simple public business page with a quote request form, WhatsApp contact button, and lead capture inside RealQTE.',
    url: 'https://realqte.com/mini-website',
    siteName: 'RealQTE',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mini Website Builder for Small Businesses | RealQTE',
    description:
      'Create a simple public business page with a quote request form, WhatsApp contact button, and lead capture inside RealQTE.',
  },
};

const faqs = [
  {
    q: 'Do I need coding skills to use the mini website builder?',
    a: 'No. You fill in your business profile, add a short description, publish your page, and share your link.',
  },
  {
    q: 'Can clients send quote requests from the page?',
    a: 'Yes. Each page can include a quote request form so visitors can submit their name, email, phone number, and message.',
  },
  {
    q: 'Can I add WhatsApp to my page?',
    a: 'Yes. You can add your WhatsApp number so visitors can contact you directly from the page.',
  },
  {
    q: 'Is the mini website included in RealQTE?',
    a: 'Yes. The mini website builder is part of RealQTE and works with your business profile and CRM flow.',
  },
];

export default function MiniWebsiteLandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-2xl sm:text-[28px] font-bold text-emerald-400 whitespace-nowrap">
              RealQTE
            </h1>
            <span className="text-[11px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap">
              .com
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="text-zinc-300 hover:text-white">
              Home
            </Link>
            <Link href="/help" className="text-zinc-300 hover:text-white">
              Help
            </Link>
            <Link href="/#pricing" className="text-zinc-300 hover:text-white">
              Pricing
            </Link>
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
            <div className="absolute top-64 left-0 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-emerald-400 font-medium mb-4">Mini Website Builder</p>
                <h1 className="text-4xl sm:text-6xl font-bold leading-tight mb-6">
                  Create a simple business page and start receiving quote requests.
                </h1>
                <p className="text-lg sm:text-xl text-zinc-300 leading-8 max-w-2xl mb-8">
                  Turn your business profile into a public page with your contact details,
                  WhatsApp button, and quote request form. Share one link and let clients contact you faster.
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
                    <p className="text-2xl font-bold text-emerald-400">1 link</p>
                    <p className="text-zinc-400 mt-1">Share your business page anywhere</p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-2xl font-bold text-blue-400">WhatsApp</p>
                    <p className="text-zinc-400 mt-1">Let clients message you directly</p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-2xl font-bold text-violet-400">CRM-ready</p>
                    <p className="text-zinc-400 mt-1">Website requests can feed your workflow</p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-5 shadow-2xl">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-[28px] p-5">
                    <div className="rounded-[24px] border border-zinc-800 bg-zinc-900 p-5">
                      <div className="mb-4">
                        <div className="inline-flex rounded-full bg-emerald-500/15 text-emerald-300 px-3 py-1 text-xs font-medium">
                          Public Business Page
                        </div>
                      </div>

                      <div className="bg-white rounded-3xl p-5 text-black shadow-xl">
                        <div className="flex items-start justify-between gap-4 mb-5">
                          <div>
                            <div className="text-2xl font-bold text-emerald-600">RealQTE Test ACC</div>
                            <div className="text-sm text-zinc-600 mt-1">Herman</div>
                          </div>
                          <div className="rounded-2xl bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
                            Quote Requests
                          </div>
                        </div>

                        <p className="text-sm text-zinc-700 leading-6 mb-5">
                          We help clients with quotes, invoices, and professional business documents.
                        </p>

                        <div className="grid gap-3 mb-5">
                          <div className="rounded-2xl bg-zinc-100 p-3">
                            <p className="text-xs text-zinc-500">Contact</p>
                            <p className="font-medium mt-1">072 428 3001</p>
                          </div>
                          <div className="rounded-2xl bg-zinc-100 p-3">
                            <p className="text-xs text-zinc-500">Email</p>
                            <p className="font-medium mt-1">business@email.com</p>
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3 text-center text-sm font-medium text-emerald-700">
                            WhatsApp
                          </div>
                          <div className="rounded-2xl bg-zinc-900 p-3 text-center text-sm font-medium text-white">
                            Request a Quote
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden sm:block absolute -left-8 bottom-10 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl">
                  <p className="text-xs text-zinc-500">Fast setup</p>
                  <p className="text-white font-semibold mt-1">Profile → Page → Leads</p>
                </div>

                <div className="hidden sm:block absolute -right-8 top-10 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl">
                  <p className="text-xs text-zinc-500">Great for</p>
                  <p className="text-white font-semibold mt-1">Freelancers & small businesses</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
          <div className="text-center mb-12">
            <p className="text-emerald-400 font-medium mb-3">How it works</p>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4">
              From business profile to public page in minutes
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
              RealQTE makes it easy to create a simple online business page without needing a developer.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <div className="text-emerald-400 text-3xl font-bold mb-4">01</div>
              <h3 className="text-xl font-semibold mb-3">Create your account</h3>
              <p className="text-zinc-400">
                Sign up and complete your business profile with your name, business info, and logo.
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <div className="text-blue-400 text-3xl font-bold mb-4">02</div>
              <h3 className="text-xl font-semibold mb-3">Open the mini site builder</h3>
              <p className="text-zinc-400">
                Choose your page link, write a short description, and add your WhatsApp number.
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <div className="text-violet-400 text-3xl font-bold mb-4">03</div>
              <h3 className="text-xl font-semibold mb-3">Publish your page</h3>
              <p className="text-zinc-400">
                Share your page with clients so they can view your details and contact you.
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <div className="text-amber-400 text-3xl font-bold mb-4">04</div>
              <h3 className="text-xl font-semibold mb-3">Receive quote requests</h3>
              <p className="text-zinc-400">
                Visitors can submit quote requests and you can manage those leads inside RealQTE.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-emerald-400 font-medium mb-3">Why use it</p>
              <h2 className="text-3xl sm:text-5xl font-bold mb-6">
                A simple online presence for businesses that need more leads.
              </h2>
              <div className="space-y-5">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <h3 className="font-semibold text-lg mb-2">Public business page</h3>
                  <p className="text-zinc-400">
                    Give clients a direct link to your business details instead of sending them scattered messages.
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <h3 className="font-semibold text-lg mb-2">WhatsApp and quote requests</h3>
                  <p className="text-zinc-400">
                    Let visitors contact you quickly with WhatsApp and a quote request form.
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <h3 className="font-semibold text-lg mb-2">Built into your workflow</h3>
                  <p className="text-zinc-400">
                    The mini website builder fits into RealQTE so your leads can support quoting and CRM work later.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
              <div className="grid gap-4">
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white">Great for</h3>
                    <span className="text-xs bg-purple-500/15 text-purple-400 px-2 py-1 rounded-full">
                      Small business
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-900 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Contractors</p>
                      <p className="text-lg font-bold text-emerald-400 mt-1">✓</p>
                    </div>
                    <div className="bg-zinc-900 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Freelancers</p>
                      <p className="text-lg font-bold text-blue-400 mt-1">✓</p>
                    </div>
                    <div className="bg-zinc-900 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Service businesses</p>
                      <p className="text-lg font-bold text-violet-400 mt-1">✓</p>
                    </div>
                    <div className="bg-zinc-900 rounded-2xl p-4">
                      <p className="text-zinc-500 text-xs">Suppliers</p>
                      <p className="text-lg font-bold text-amber-400 mt-1">✓</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-emerald-500/15 to-blue-500/15 border border-zinc-800 rounded-2xl p-5">
                  <h3 className="font-semibold text-white mb-2">One feature, multiple benefits</h3>
                  <p className="text-zinc-300 text-sm leading-7">
                    A small business website builder that gives you a public page, a quote request form,
                    and an easy way to turn attention into leads.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
          <div className="max-w-3xl mb-10">
            <p className="text-emerald-400 font-medium mb-3">Frequently asked questions</p>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4">Mini website builder FAQ</h2>
          </div>

          <div className="grid gap-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                <h3 className="text-lg font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-zinc-400 leading-7">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-800">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 sm:p-10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-emerald-400 font-medium mb-3">Ready to start?</p>
                <h2 className="text-3xl sm:text-4xl font-bold mb-3">
                  Build your mini website and start collecting quote requests.
                </h2>
                <p className="text-zinc-400 leading-7">
                  Create your account, complete your profile, and publish your business page with RealQTE.
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
                  href="/help"
                  className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-4 rounded-2xl font-semibold"
                >
                  Help
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
