'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

export default function LegalPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingUser(false);
    });

    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-emerald-400 whitespace-nowrap">
                RealQte
              </h1>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded whitespace-nowrap">
                SA
              </span>
            </div>

            <div className="hidden xl:flex items-center gap-6 text-sm">
              {loadingUser ? null : user ? (
                <>
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
                  <Link href="/invoices" className="text-zinc-400 hover:text-white">
                    Invoices
                  </Link>
                  <Link href="/customers" className="text-zinc-400 hover:text-white">
                    Customers
                  </Link>
                  <Link href="/products" className="text-zinc-400 hover:text-white">
                    Products
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
                  <Link href="/legal" className="text-emerald-400 font-medium">
                    Legal
                  </Link>
                  <button onClick={handleLogout} className="text-red-400 hover:underline">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/" className="text-zinc-400 hover:text-white">
                    Home
                  </Link>
                  <Link href="/legal" className="text-emerald-400 font-medium">
                    Legal
                  </Link>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="xl:hidden inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="xl:hidden mt-4 border-t border-zinc-800 pt-4">
              <div className="grid grid-cols-1 gap-3 text-sm">
                {loadingUser ? null : user ? (
                  <>
                    <Link
                      href="/"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/new-invoice"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      New Invoice
                    </Link>
                    <Link
                      href="/new-quote"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      New Quote
                    </Link>
                    <Link
                      href="/quotes"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Quotes
                    </Link>
                    <Link
                      href="/invoices"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Invoices
                    </Link>
                    <Link
                      href="/customers"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Customers
                    </Link>
                    <Link
                      href="/products"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Products
                    </Link>
                    <Link
                      href="/accounting"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Accounting
                    </Link>
                    <Link
                      href="/reporting"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Reports
                    </Link>
                    <Link
                      href="/profile"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <Link
                      href="/legal"
                      className="text-emerald-400 font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Legal
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="text-left text-red-400 hover:underline"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Home
                    </Link>
                    <Link
                      href="/legal"
                      className="text-emerald-400 font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Legal
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="mb-10">
          <div className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm text-emerald-300 mb-5">
            Legal policies and platform terms
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Legal Policies</h1>

          <p className="text-zinc-400 text-base sm:text-lg max-w-3xl leading-8">
            These policies govern the use of RealQte, including account use, document generation,
            subscriptions, privacy, cancellation, acceptable use, and legal responsibility.
          </p>

          <p className="text-zinc-500 text-sm mt-3">Last updated: 31 March 2026</p>
        </div>

        <div className="mb-8 bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-amber-300 mb-3">Important Notice</h2>
          <p className="text-zinc-200 leading-7">
            RealQte is a software tool only. It is not an accounting firm, financial services
            provider, tax advisor, bookkeeper, auditor, attorney, or legal advisory service.
            Users must independently review and verify all figures, taxes, totals, customer
            information, and document content before relying on or sending any document created
            through the platform.
          </p>
        </div>

        <div className="grid gap-8">
          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">1. Terms of Service</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte is a software platform that helps users create, store, manage, and send
                quotes, invoices, customer records, and related business information.
              </p>

              <p>
                By accessing or using RealQte, you agree to these Legal Policies and Terms of
                Service. If you do not agree, you must not use the platform.
              </p>

              <p>
                RealQte provides tools and workflow functionality only. RealQte does not provide
                accounting advice, tax advice, legal advice, financial advice, compliance advice,
                or any regulated professional service.
              </p>

              <p>
                All content, calculations, totals, tax amounts, payment information, due dates,
                and business records generated or stored through RealQte are provided on an
                informational and operational basis only and may contain inaccuracies, omissions,
                or user-input errors.
              </p>

              <p className="text-yellow-400 font-medium">
                You are solely responsible for reviewing, checking, confirming, and approving all
                data before using, saving, sharing, downloading, or sending any quote, invoice, or
                business document.
              </p>

              <p>By using RealQte, you agree that:</p>

              <ul className="list-disc pl-6 space-y-2">
                <li>You use the platform entirely at your own risk</li>
                <li>You will independently verify all figures, taxes, totals, and document details</li>
                <li>You are solely responsible for your own accounting, tax, legal, and compliance obligations</li>
                <li>You will not treat RealQte as a substitute for professional advice</li>
                <li>You are responsible for any documents sent to your customers or third parties</li>
                <li>You are responsible for all information entered into your account</li>
              </ul>

              <p>
                We may modify, suspend, restrict, remove, or improve features at any time, with or
                without notice, including limiting some features to paid plans.
              </p>

              <p>
                We may suspend or terminate accounts that misuse the platform, violate these terms,
                attempt fraud, interfere with service integrity, or create legal, technical, or
                reputational risk for RealQte or third parties.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">2. Acceptable Use and User Responsibilities</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                You may use RealQte only for lawful, legitimate business or administrative purposes.
              </p>

              <p>You may not use RealQte to:</p>

              <ul className="list-disc pl-6 space-y-2">
                <li>Create false, misleading, fraudulent, or deceptive business records</li>
                <li>Impersonate another person, entity, or business</li>
                <li>Issue unlawful invoices or deceptive quotes</li>
                <li>Upload or process data you do not have the right to use</li>
                <li>Attempt unauthorized access to systems, accounts, or data</li>
                <li>Interfere with platform security, availability, or integrity</li>
                <li>Use the service in any way that violates applicable law</li>
              </ul>

              <p>
                You are responsible for keeping your login credentials secure and for all activity
                that takes place under your account.
              </p>

              <p>
                You are also responsible for ensuring that any customer, client, employee, or third
                party information entered into RealQte is collected, processed, and used lawfully.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">3. Privacy Policy</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte collects and stores information needed to provide the service, including
                account information, business profile details, customer records, quotes, invoices,
                product data, usage information, and subscription or payment-related metadata.
              </p>

              <p>
                This may include business name, owner name, contact details, email addresses,
                physical or postal addresses, customer names, customer emails, document contents,
                and operational metadata necessary for account management, support, fraud
                prevention, billing, service improvement, and security.
              </p>

              <p>
                RealQte uses third-party infrastructure and service providers to operate the
                service, including hosting, authentication, database, storage, analytics, email,
                and payment processing services.
              </p>

              <p>
                By using RealQte, you acknowledge that your information may be processed for
                platform operations, document generation, customer communications initiated by you,
                subscription management, fraud prevention, service support, and security.
              </p>

              <p>
                We do not sell your personal information. We only share data where reasonably
                necessary to operate the platform, process payments, send requested communications,
                comply with law, enforce our rights, or protect the service and its users.
              </p>

              <p>
                You are responsible for ensuring that any personal information you upload or process
                through RealQte is collected and used lawfully and with any required permission,
                notice, or consent.
              </p>

              <p>
                You may request account deletion, subject to any lawful retention obligations,
                fraud-prevention needs, billing records, dispute handling requirements, backup
                cycles, or technical limitations.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">4. Subscription, Billing, Cancellation and Refunds</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte Pro is offered as a recurring paid subscription. Where applicable, the
                subscription renews automatically at the end of each billing cycle until cancelled.
              </p>

              <p>
                By subscribing, you authorize recurring billing through the selected payment
                provider for the applicable subscription fee, taxes if any, and any other charges
                expressly disclosed at checkout.
              </p>

              <p>
                Subscription access remains active until the end of the paid billing period unless
                suspended earlier for misuse, payment failure, fraud concerns, or other valid
                operational or legal reasons.
              </p>

              <p>
                You may cancel your subscription before the next renewal date to avoid future
                billing. Cancellation stops future renewals but does not automatically delete your
                account, remove historical data, or generate a refund for the current paid period.
              </p>

              <p>
                Unless required by law or expressly stated otherwise, subscription fees already paid
                for an active billing period are generally non-refundable once that billing period
                has started.
              </p>

              <p>
                Duplicate charges, billing errors, or exceptional refund requests may be reviewed
                on a case-by-case basis, but RealQte is not obligated to issue refunds except where
                required by law.
              </p>

              <p>
                If a payment fails, is reversed, is disputed, or is not successfully collected,
                Pro access may be limited, suspended, or downgraded.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">5. Cookies and Platform Technology</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte may use cookies, local storage, session storage, and similar technologies
                necessary for sign-in sessions, security, feature operation, account continuity,
                preference storage, and performance.
              </p>

              <p>
                If analytics, advertising, tracking, or other non-essential technologies are added
                later, these policies may be updated and any additional notices or consent
                mechanisms required by law should be implemented.
              </p>

              <p>
                By continuing to use RealQte, you acknowledge the use of strictly necessary
                technologies required to operate the platform.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">6. Disclaimers and Limitation of Liability</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte is provided on an “as is” and “as available” basis. To the maximum extent
                permitted by law, we make no warranties, representations, or guarantees of any
                kind, express or implied, regarding availability, reliability, accuracy, fitness
                for a particular purpose, merchantability, non-infringement, or that the service
                will be uninterrupted, secure, or error-free.
              </p>

              <p>
                We do not guarantee that calculations, tax values, totals, dates, invoice logic,
                quote logic, recurring billing logic, exported documents, generated PDFs, emails,
                saved records, or any other output will always be accurate, complete, lawful, or
                suitable for your needs.
              </p>

              <p className="text-yellow-400 font-medium">
                You are responsible for reviewing every document and every figure before sharing,
                sending, downloading, printing, or relying on it.
              </p>

              <p>
                To the maximum extent permitted by law, RealQte and its owners, operators,
                developers, employees, contractors, affiliates, and service providers will not be
                liable for any direct, indirect, incidental, special, punitive, exemplary, or
                consequential loss or damage, including loss of profits, loss of revenue, tax
                liability, penalties, business interruption, lost opportunities, lost data, damage
                to reputation, or customer disputes arising from or related to use of the platform.
              </p>

              <p>
                If liability is nevertheless imposed despite these terms, then to the maximum extent
                permitted by law, the total aggregate liability of RealQte for any claim relating
                to the service shall not exceed the amount actually paid by you to RealQte for the
                service during the three months immediately preceding the event giving rise to the
                claim.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">7. Indemnity</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                You agree to indemnify, defend, and hold harmless RealQte and its owners,
                operators, developers, employees, contractors, affiliates, successors, and service
                providers from and against any claims, demands, actions, proceedings, liabilities,
                losses, damages, penalties, fines, costs, and expenses, including reasonable legal
                costs, arising out of or related to:
              </p>

              <ul className="list-disc pl-6 space-y-2">
                <li>Your use of the platform</li>
                <li>Your reliance on any output generated by the platform</li>
                <li>Your quotes, invoices, customer records, or business documents</li>
                <li>Your breach of these Legal Policies or Terms of Service</li>
                <li>Your violation of law or third-party rights</li>
                <li>Any dispute between you and your customers, suppliers, employees, or third parties</li>
              </ul>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">8. Suspension, Termination and Changes</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                We may suspend, limit, or terminate access to RealQte at our discretion where
                reasonably necessary for security, platform integrity, legal compliance, fraud
                prevention, suspected misuse, non-payment, or serious breach of these terms.
              </p>

              <p>
                We may update these Legal Policies and Terms of Service from time to time.
                Continued use of the platform after updated terms are published means you accept the
                revised terms, subject to any rights you may have under applicable law.
              </p>

              <p>
                It is your responsibility to review these policies periodically for updates.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-3xl font-semibold mb-6">9. Contact</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                If you need help with billing, privacy, subscriptions, cancellations, or account
                issues, you should contact RealQte using the business support contact details made
                available by the platform.
              </p>

              

              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                <p className="text-sm text-zinc-400">
                  Example:
                </p>
                <p className="text-sm text-zinc-300 mt-2">
                  Support Email: realqte@outlook.com
                </p>
                <p className="text-sm text-zinc-300 mt-1">
                  Business Name: RealQte
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}