'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

type ProfileState = {
  businessName: string;
  ownerName: string;
  phone: string;
  businessEmail: string;
  physicalAddress: string;
  postalAddress: string;
  cipcNumber: string;
  taxNumber: string;
  vatNumber: string;
  bankDetails: string;
  logo: string;
  currencyCode: string;
  currencyLocale: string;
};

type PublicPageState = {
  slug: string;
  shortDescription: string;
  whatsappNumber: string;
  isPublished: boolean;
  businessSnapshot: {
    businessName: string;
    ownerName: string;
    businessEmail: string;
    phone: string;
    physicalAddress: string;
    logo: string;
  };
};

const defaultProfile: ProfileState = {
  businessName: '',
  ownerName: '',
  phone: '',
  businessEmail: '',
  physicalAddress: '',
  postalAddress: '',
  cipcNumber: '',
  taxNumber: '',
  vatNumber: '',
  bankDetails: '',
  logo: '',
  currencyCode: 'ZAR',
  currencyLocale: 'en-ZA',
};

const defaultPublicPage: PublicPageState = {
  slug: '',
  shortDescription: '',
  whatsappNumber: '',
  isPublished: false,
  businessSnapshot: {
    businessName: '',
    ownerName: '',
    businessEmail: '',
    phone: '',
    physicalAddress: '',
    logo: '',
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

function sanitizeWhatsappNumber(value: string) {
  return value.replace(/[^\d]/g, '');
}

function buildBusinessSnapshot(profile: ProfileState) {
  return {
    businessName: profile.businessName.trim(),
    ownerName: profile.ownerName.trim(),
    businessEmail: profile.businessEmail.trim(),
    phone: profile.phone.trim(),
    physicalAddress: profile.physicalAddress.trim(),
    logo: profile.logo || '',
  };
}

function isProfileComplete(profile: ProfileState) {
  return Boolean(
    profile.businessName.trim() &&
      profile.ownerName.trim() &&
      profile.businessEmail.trim() &&
      profile.phone.trim()
  );
}

export default function WebsiteBuilderPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileState>(defaultProfile);
  const [pageData, setPageData] = useState<PublicPageState>(defaultPublicPage);

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [slugTouched, setSlugTouched] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugMessage, setSlugMessage] = useState('');
  const [publicPageExists, setPublicPageExists] = useState(false);

  const requiredProfileReady = useMemo(() => isProfileComplete(profile), [profile]);

  const publicUrl = useMemo(() => {
    if (!pageData.slug.trim()) return '';
    return `https://realqte.com/b/${pageData.slug.trim()}`;
  }, [pageData.slug]);

  useEffect(() => {
    let unsubscribeUserSnapshot: (() => void) | null = null;
    let unsubscribePublicPageSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      setUser(u);
      setMobileMenuOpen(false);

      if (unsubscribeUserSnapshot) unsubscribeUserSnapshot();
      if (unsubscribePublicPageSnapshot) unsubscribePublicPageSnapshot();

      unsubscribeUserSnapshot = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const incomingProfile = data.profile || {};

            const resolvedProfile: ProfileState = {
              businessName: incomingProfile.businessName || '',
              ownerName: incomingProfile.ownerName || '',
              phone: incomingProfile.phone || '',
              businessEmail: incomingProfile.businessEmail || u.email || '',
              physicalAddress: incomingProfile.physicalAddress || '',
              postalAddress: incomingProfile.postalAddress || '',
              cipcNumber: incomingProfile.cipcNumber || '',
              taxNumber: incomingProfile.taxNumber || '',
              vatNumber: incomingProfile.vatNumber || '',
              bankDetails: incomingProfile.bankDetails || '',
              logo: incomingProfile.logo || '',
              currencyCode: incomingProfile.currencyCode || 'ZAR',
              currencyLocale: incomingProfile.currencyLocale || 'en-ZA',
            };

            setProfile(resolvedProfile);
            setAcceptedTerms(data.acceptedTerms === true);
          } else {
            setProfile({
              ...defaultProfile,
              businessEmail: u.email || '',
            });
            setAcceptedTerms(false);
          }
        },
        (err) => {
          console.error('User snapshot error:', err);
        }
      );

      unsubscribePublicPageSnapshot = onSnapshot(
        doc(db, 'publicPages', u.uid),
        (snap) => {
          const profileSnapshot = buildBusinessSnapshot(profile);

          if (snap.exists()) {
            const data = snap.data();

            setPageData({
              slug: data.slug || '',
              shortDescription: data.shortDescription || '',
              whatsappNumber: data.whatsappNumber || '',
              isPublished: data.isPublished === true,
              businessSnapshot: {
                businessName:
                  data.businessSnapshot?.businessName || profileSnapshot.businessName,
                ownerName: data.businessSnapshot?.ownerName || profileSnapshot.ownerName,
                businessEmail:
                  data.businessSnapshot?.businessEmail || profileSnapshot.businessEmail,
                phone: data.businessSnapshot?.phone || profileSnapshot.phone,
                physicalAddress:
                  data.businessSnapshot?.physicalAddress || profileSnapshot.physicalAddress,
                logo: data.businessSnapshot?.logo || profileSnapshot.logo,
              },
            });

            setPublicPageExists(true);
            setSlugAvailable(true);
            setSlugMessage(data.slug ? 'This slug is saved to your page.' : '');
          } else {
            const autoSlug = slugify(profile.businessName || u.email || '');

            setPageData({
              slug: autoSlug,
              shortDescription: '',
              whatsappNumber: '',
              isPublished: false,
              businessSnapshot: profileSnapshot,
            });

            setPublicPageExists(false);
            setSlugAvailable(null);
            setSlugMessage('');
          }

          setLoading(false);
        },
        (err) => {
          console.error('Public page snapshot error:', err);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeUserSnapshot) unsubscribeUserSnapshot();
      if (unsubscribePublicPageSnapshot) unsubscribePublicPageSnapshot();
      unsubscribeAuth();
    };
  }, [router, profile.businessName, profile.ownerName, profile.businessEmail, profile.phone, profile.physicalAddress, profile.logo]);

  useEffect(() => {
    if (!slugTouched && !publicPageExists && !pageData.slug.trim() && profile.businessName.trim()) {
      setPageData((prev) => ({
        ...prev,
        slug: slugify(profile.businessName),
      }));
    }
  }, [profile.businessName, slugTouched, publicPageExists, pageData.slug]);

  useEffect(() => {
    const syncSnapshot = buildBusinessSnapshot(profile);

    setPageData((prev) => ({
      ...prev,
      businessSnapshot: syncSnapshot,
    }));
  }, [
    profile.businessName,
    profile.ownerName,
    profile.businessEmail,
    profile.phone,
    profile.physicalAddress,
    profile.logo,
  ]);

  const checkSlugAvailability = async (slugValue: string) => {
    const cleanSlug = slugify(slugValue);

    if (!cleanSlug) {
      setSlugAvailable(false);
      setSlugMessage('Please enter a valid slug.');
      return false;
    }

    if (!user) {
      setSlugAvailable(false);
      setSlugMessage('You must be logged in.');
      return false;
    }

    try {
      setCheckingSlug(true);

      const q = query(
        collection(db, 'publicPages'),
        where('slug', '==', cleanSlug),
        limit(1)
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        setSlugAvailable(true);
        setSlugMessage('Slug is available.');
        return true;
      }

      const foundDoc = snap.docs[0];
      const availableForUser = foundDoc.id === user.uid;

      setSlugAvailable(availableForUser);
      setSlugMessage(
        availableForUser ? 'This slug is saved to your page.' : 'That slug is already taken.'
      );

      return availableForUser;
    } catch (err) {
      console.error('Slug check error:', err);
      setSlugAvailable(false);
      setSlugMessage('Could not verify slug right now.');
      return false;
    } finally {
      setCheckingSlug(false);
    }
  };

  const saveMiniSite = async () => {
    if (!user) {
      alert('Please sign in first.');
      return;
    }

    if (!acceptedTerms) {
      alert('Please accept the Terms of Service in your profile before using this feature.');
      router.push('/profile');
      return;
    }

    if (!requiredProfileReady) {
      alert(
        'Please complete your profile first. Business Name, Owner Name, Business Email and Contact Number are required.'
      );
      router.push('/profile');
      return;
    }

    const cleanSlug = slugify(pageData.slug);
    if (!cleanSlug) {
      alert('Please enter a valid page slug.');
      return;
    }

    const slugOk = await checkSlugAvailability(cleanSlug);
    if (!slugOk) {
      alert('Please choose a different slug before saving.');
      return;
    }

    try {
      setSaving(true);

      const businessSnapshot = buildBusinessSnapshot(profile);

      await setDoc(
        doc(db, 'publicPages', user.uid),
        {
          userId: user.uid,
          slug: cleanSlug,
          shortDescription: pageData.shortDescription.trim(),
          whatsappNumber: sanitizeWhatsappNumber(pageData.whatsappNumber),
          isPublished: pageData.isPublished === true,
          businessSnapshot,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setPageData((prev) => ({
        ...prev,
        slug: cleanSlug,
        businessSnapshot,
      }));

      setPublicPageExists(true);
      setSlugAvailable(true);
      setSlugMessage('Mini website saved successfully.');

      alert('Mini website saved successfully!');
    } catch (err: any) {
      console.error('Save mini website error:', err);
      alert('Failed to save mini website: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!publicUrl) {
      alert('Save your page first so a public link can be created.');
      return;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      alert('Public page link copied to clipboard.');
    } catch (err) {
      console.error('Copy link error:', err);
      alert('Could not copy link.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading mini website builder...
      </div>
    );
  }

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
              <Link href="/" className="text-zinc-400 hover:text-white">
                Dashboard
              </Link>
              <Link href="/new-invoice" className="text-zinc-400 hover:text-white">
                New Invoice
              </Link>
              <Link href="/new-quote" className="text-zinc-400 hover:text-white">
                New Quote
              </Link>
              <Link href="/customers" className="text-zinc-400 hover:text-white">
                Customers
              </Link>
              <Link href="/quotes" className="text-zinc-400 hover:text-white">
                Quotes
              </Link>
              <Link href="/products" className="text-zinc-400 hover:text-white">
                Products
              </Link>
              <Link href="/invoices" className="text-zinc-400 hover:text-white">
                Invoices
              </Link>
              <Link href="/accounting" className="text-zinc-400 hover:text-white">
                Accounting
              </Link>
              <Link href="/reporting" className="text-zinc-400 hover:text-white">
                Reports
              </Link>
              <Link href="/website" className="text-emerald-400 font-medium">
                Mini Site
              </Link>
              <Link href="/profile" className="text-zinc-400 hover:text-white">
                Profile
              </Link>
              <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">
                Logout
              </button>
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
                <Link href="/" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Dashboard
                </Link>
                <Link href="/new-invoice" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  New Invoice
                </Link>
                <Link href="/new-quote" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  New Quote
                </Link>
                <Link href="/customers" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Customers
                </Link>
                <Link href="/quotes" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Quotes
                </Link>
                <Link href="/products" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Products
                </Link>
                <Link href="/invoices" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Invoices
                </Link>
                <Link href="/accounting" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Accounting
                </Link>
                <Link href="/reporting" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Reports
                </Link>
                <Link href="/website" className="text-emerald-400 font-medium" onClick={() => setMobileMenuOpen(false)}>
                  Mini Site
                </Link>
                <Link href="/profile" className="text-zinc-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                  Profile
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut(auth);
                  }}
                  className="text-left text-red-400 hover:underline"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-8">
          <p className="text-emerald-400 font-medium mb-3">Mini Website Builder</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">Create your public business page</h2>
          <p className="text-zinc-400 max-w-3xl leading-7">
            This page gives your business a simple public home on RealQte. Clients can view your
            business details, contact you on WhatsApp, and request a quote directly from your page.
          </p>
        </div>

        {!acceptedTerms && (
          <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-3xl p-5 sm:p-6">
            <h3 className="text-lg sm:text-xl font-semibold text-red-300 mb-2">
              Profile setup required first
            </h3>
            <p className="text-red-100/90 leading-7">
              Before using the Mini Website Builder, please accept the Terms of Service and complete
              your business profile.
            </p>
            <Link
              href="/profile"
              className="inline-flex mt-4 bg-red-500/15 border border-red-500/30 text-red-300 px-5 py-3 rounded-xl hover:bg-red-500/20"
            >
              Go to Profile
            </Link>
          </div>
        )}

        {acceptedTerms && !requiredProfileReady && (
          <div className="mb-8 bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 sm:p-6">
            <h3 className="text-lg sm:text-xl font-semibold text-amber-300 mb-2">
              Complete your profile first
            </h3>
            <p className="text-amber-100/90 leading-7">
              Your mini website uses your Business Name, Owner Name, Business Email, Contact Number,
              Address, and Logo from your Profile.
            </p>
            <Link
              href="/profile"
              className="inline-flex mt-4 bg-amber-500/15 border border-amber-500/30 text-amber-300 px-5 py-3 rounded-xl hover:bg-amber-500/20"
            >
              Complete Profile
            </Link>
          </div>
        )}

        <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                <div>
                  <h3 className="text-2xl font-semibold mb-2">How it works</h3>
                  <p className="text-zinc-400 leading-7">
                    We use your existing business profile automatically. You only need to set your
                    public slug, add a short description, add a WhatsApp number, and publish.
                  </p>
                </div>
                <span className="inline-flex rounded-full bg-emerald-500/15 text-emerald-400 px-3 py-1 text-xs font-semibold">
                  Free feature
                </span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-6">
                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em]">Step 1</p>
                  <p className="text-white font-medium mt-2">Choose your public link</p>
                </div>
                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em]">Step 2</p>
                  <p className="text-white font-medium mt-2">Add description and WhatsApp</p>
                </div>
                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em]">Step 3</p>
                  <p className="text-white font-medium mt-2">Publish and share your page</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
              <h3 className="text-2xl font-semibold mb-6">Builder settings</h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Public page name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={pageData.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      const nextSlug = slugify(e.target.value);
                      setPageData((prev) => ({ ...prev, slug: nextSlug }));
                      setSlugAvailable(null);
                      setSlugMessage('');
                    }}
                    onBlur={() => {
                      if (pageData.slug.trim()) {
                        void checkSlugAvailability(pageData.slug);
                      }
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    placeholder="your-business-name"
                  />
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-zinc-500">Your public page will be: {publicUrl || 'https://realqte.com/b/your-slug'}</p>
                    {checkingSlug && <p className="text-zinc-400">Checking slug availability...</p>}
                    {!checkingSlug && slugMessage && (
                      <p
                        className={
                          slugAvailable === false
                            ? 'text-red-400'
                            : slugAvailable === true
                              ? 'text-emerald-400'
                              : 'text-zinc-400'
                        }
                      >
                        {slugMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Short business description
                  </label>
                  <textarea
                    value={pageData.shortDescription}
                    onChange={(e) =>
                      setPageData((prev) => ({
                        ...prev,
                        shortDescription: e.target.value,
                      }))
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-h-[140px]"
                    placeholder="Briefly explain what your business does and what clients can contact you for."
                  />
                  <p className="text-zinc-500 text-sm mt-2">
                    Keep this simple and clear. This is what visitors will read first.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    WhatsApp number
                  </label>
                  <input
                    type="text"
                    value={pageData.whatsappNumber}
                    onChange={(e) =>
                      setPageData((prev) => ({
                        ...prev,
                        whatsappNumber: sanitizeWhatsappNumber(e.target.value),
                      }))
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    placeholder="e.g. 27821234567"
                  />
                  <p className="text-zinc-500 text-sm mt-2">
                    Use digits only with country code, for example 27821234567.
                  </p>
                </div>

                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-5">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={pageData.isPublished}
                      onChange={(e) =>
                        setPageData((prev) => ({
                          ...prev,
                          isPublished: e.target.checked,
                        }))
                      }
                      className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>
                      <span className="block text-white font-medium">Publish my page</span>
                      <span className="block text-zinc-400 text-sm mt-1">
                        When published, anyone with the link can visit your public business page.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={saveMiniSite}
                    disabled={saving || !acceptedTerms || !requiredProfileReady}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 py-4 rounded-2xl text-lg font-bold"
                  >
                    {saving ? 'Saving...' : 'Save Mini Website'}
                  </button>

                  <button
                    onClick={copyLink}
                    disabled={!publicUrl || !publicPageExists}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 py-4 rounded-2xl text-lg font-semibold"
                  >
                    Copy Public Link
                  </button>
                </div>

                {publicPageExists && publicUrl && (
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5">
                    <p className="text-emerald-300 font-medium mb-2">Your page link</p>
                    <div className="break-all text-zinc-200">{publicUrl}</div>
                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                      <button
                        onClick={copyLink}
                        className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-4 py-3 rounded-xl"
                      >
                        Copy Link
                      </button>
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl text-center"
                      >
                        Open Public Page
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
              <h3 className="text-2xl font-semibold mb-5">Business details used on the page</h3>
              <p className="text-zinc-400 mb-6 leading-7">
                These come from your Profile. To change them, update your business profile.
              </p>

              <div className="space-y-4">
                {pageData.businessSnapshot.logo ? (
                  <div className="bg-white rounded-2xl p-4 border border-zinc-700">
                    <img
                      src={pageData.businessSnapshot.logo}
                      alt="Business logo"
                      className="max-h-24 w-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-700 p-5 text-zinc-500">
                    No logo uploaded yet
                  </div>
                )}

                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-1">Business Name</p>
                  <p className="text-white">{pageData.businessSnapshot.businessName || 'Not set'}</p>
                </div>

                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-1">Owner Name</p>
                  <p className="text-white">{pageData.businessSnapshot.ownerName || 'Not set'}</p>
                </div>

                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-1">Business Email</p>
                  <p className="text-white break-all">{pageData.businessSnapshot.businessEmail || 'Not set'}</p>
                </div>

                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-1">Phone</p>
                  <p className="text-white">{pageData.businessSnapshot.phone || 'Not set'}</p>
                </div>

                <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.14em] mb-1">Address</p>
                  <p className="text-white whitespace-pre-wrap">
                    {pageData.businessSnapshot.physicalAddress || 'Not set'}
                  </p>
                </div>
              </div>

              <Link
                href="/profile"
                className="inline-flex mt-6 bg-zinc-800 hover:bg-zinc-700 px-5 py-3 rounded-xl font-medium"
              >
                Edit Business Profile
              </Link>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
              <h3 className="text-2xl font-semibold mb-4">What visitors will see</h3>
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                <div className="space-y-4">
                  {pageData.businessSnapshot.logo ? (
                    <div className="bg-white rounded-2xl p-3 inline-block">
                      <img
                        src={pageData.businessSnapshot.logo}
                        alt="Logo preview"
                        className="max-h-16 w-auto object-contain"
                      />
                    </div>
                  ) : null}

                  <div>
                    <h4 className="text-2xl font-bold text-white">
                      {pageData.businessSnapshot.businessName || 'Your Business'}
                    </h4>
                    <p className="text-zinc-400 mt-1">
                      {pageData.businessSnapshot.ownerName || 'Owner / Representative'}
                    </p>
                  </div>

                  <p className="text-zinc-300 leading-7">
                    {pageData.shortDescription.trim() ||
                      'Your business description will appear here once you add it.'}
                  </p>

                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
                      <p className="text-zinc-500 text-sm">Contact</p>
                      <p className="text-white mt-1">{pageData.businessSnapshot.phone || 'Phone not set'}</p>
                      <p className="text-white break-all">{pageData.businessSnapshot.businessEmail || 'Email not set'}</p>
                    </div>

                    {pageData.whatsappNumber ? (
                      <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-emerald-300">
                        WhatsApp button will be shown
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-zinc-500">
                        Add a WhatsApp number to show a WhatsApp contact button
                      </div>
                    )}

                    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
                      <p className="text-white font-medium">Request a Quote form</p>
                      <p className="text-zinc-400 text-sm mt-1">
                        Visitors will be able to send Name, Email, Phone, and Message from your public page.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}