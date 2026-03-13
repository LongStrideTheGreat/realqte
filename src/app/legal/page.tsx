'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

export default function LegalPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingUser(false);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
              SA
            </span>
          </div>

          <div className="flex items-center gap-8 text-sm">
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
                <Link href="/profile" className="text-zinc-400 hover:text-white">
                  Profile
                </Link>
                <Link href="/legal" className="text-emerald-400 font-medium">
                  Legal
                </Link>
                <button
                  onClick={() => signOut(auth)}
                  className="text-red-400 hover:underline"
                >
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
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-5xl font-bold mb-4">Legal Policies</h1>
          <p className="text-zinc-400 text-lg">
            These policies govern the use of RealQte, including account use, subscriptions,
            invoices, quotes, privacy, and cancellation.
          </p>
          <p className="text-zinc-500 text-sm mt-3">
            Last updated: 13 March 2026
          </p>
        </div>

        <div className="grid gap-8">
          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-3xl font-semibold mb-6">1. Terms of Service</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte is a software platform that helps users create, store, manage, and send
                quotes, invoices, and related business records.
              </p>

              <p>
                By using RealQte, you agree to use the platform lawfully and only for legitimate
                business purposes. You may not use RealQte for fraud, unlawful billing, misleading
                documents, impersonation, or any activity that causes harm to customers, third
                parties, or the platform.
              </p>

              <p>
                You are responsible for the accuracy of the information you enter into quotes,
                invoices, customer profiles, tax details, and business information.
              </p>

              <p>
                RealQte may update, suspend, or improve features from time to time. Some features
                may be limited to paid subscriptions.
              </p>

              <p>
                You remain responsible for checking your own tax, invoicing, accounting, and legal
                obligations. RealQte does not provide legal, accounting, tax, or financial advice.
              </p>

              <p>
                We may suspend or terminate accounts that misuse the platform, attempt fraud,
                interfere with service integrity, or violate these terms.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-3xl font-semibold mb-6">2. Privacy Policy</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte collects and stores information needed to provide the service, including
                account details, profile details, customer information, quotes, invoices, and
                subscription/payment-related metadata.
              </p>

              <p>
                This may include business name, owner name, contact details, customer names,
                customer emails, document content, and platform usage data necessary for platform
                operation, support, fraud prevention, and service improvement.
              </p>

              <p>
                RealQte uses third-party infrastructure and service providers to operate the
                service, including hosting, authentication, database, storage, email, and payment
                providers.
              </p>

              <p>
                By using RealQte, you acknowledge that your information may be processed for
                account management, document generation, customer communications initiated by you,
                subscription management, and platform security.
              </p>

              <p>
                We do not sell your personal information. We only share data where needed to
                operate the service, process payments, send requested communications, comply with
                law, or protect platform integrity.
              </p>

              <p>
                You are responsible for ensuring that customer information you upload or process
                through RealQte is collected and used lawfully.
              </p>

              <p>
                You may request account deletion, subject to any lawful retention obligations or
                technical limits related to fraud prevention, transaction records, or dispute
                handling.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-3xl font-semibold mb-6">3. Subscription, Billing, Cancellation and Refunds</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte Pro is offered as a recurring monthly subscription. Where applicable, the
                subscription renews automatically every 30 days until cancelled.
              </p>

              <p>
                By subscribing to Pro, you authorize recurring billing through the selected payment
                provider for the subscription fee in effect at the time of billing.
              </p>

              <p>
                Subscription access remains active until the current paid billing period ends,
                unless otherwise stated in writing or required by law.
              </p>

              <p>
                You may cancel your subscription before the next renewal date to avoid future
                billing. Cancellation stops future renewals but does not automatically erase your
                account or historical records.
              </p>

              <p>
                Unless required by law or expressly stated otherwise, subscription fees already paid
                for a billing cycle are generally non-refundable once that billing cycle has started.
              </p>

              <p>
                Refund requests, billing disputes, or accidental duplicate charges may be reviewed
                case by case.
              </p>

              <p>
                If a payment fails, Pro access may be suspended or downgraded at the end of the
                paid access period.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-3xl font-semibold mb-6">4. Cookies and Platform Technology</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte may use cookies, local storage, and similar technologies that are necessary
                for login sessions, security, feature operation, and performance.
              </p>

              <p>
                If analytics, advertising, or non-essential tracking tools are introduced in future,
                this policy should be updated and any required consent mechanisms should be added.
              </p>

              <p>
                By continuing to use RealQte, you acknowledge the use of strictly necessary
                technologies required to operate the service.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-3xl font-semibold mb-6">5. Limitation of Liability</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                RealQte is provided on an as-available basis. While we aim to provide a reliable
                service, we do not guarantee uninterrupted operation, error-free availability, or
                that the service will meet every specific legal, accounting, or operational need.
              </p>

              <p>
                To the maximum extent permitted by law, RealQte is not liable for indirect,
                incidental, special, or consequential losses, including loss of profits, lost
                business opportunities, lost data, or customer disputes arising from use of the
                platform.
              </p>

              <p>
                You are responsible for reviewing generated documents before sending them to your
                customers.
              </p>
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-3xl font-semibold mb-6">6. Contact</h2>

            <div className="space-y-5 text-zinc-300 leading-7">
              <p>
                If users need help with billing, privacy, subscription cancellation, or account
                issues, they should contact the business contact details provided by RealQte.
              </p>

              <p>
                You should replace this section with your actual support email and business contact
                details before launch.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}