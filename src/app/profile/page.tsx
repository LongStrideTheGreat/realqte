'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import {
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, deleteUser, User } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

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

type SubscriptionState = {
  isPro: boolean;
  subscriptionStatus: string;
  proExpiresAt: string | null;
  nextBillingDate: string | null;
};

type CurrencyOption = {
  code: string;
  locale: string;
  label: string;
};

const currencyOptions: CurrencyOption[] = [
  { code: 'ZAR', locale: 'en-ZA', label: 'South African Rand (ZAR)' },
  { code: 'USD', locale: 'en-US', label: 'US Dollar (USD)' },
  { code: 'EUR', locale: 'en-IE', label: 'Euro (EUR)' },
  { code: 'GBP', locale: 'en-GB', label: 'British Pound (GBP)' },
  { code: 'AUD', locale: 'en-AU', label: 'Australian Dollar (AUD)' },
  { code: 'CAD', locale: 'en-CA', label: 'Canadian Dollar (CAD)' },
  { code: 'NZD', locale: 'en-NZ', label: 'New Zealand Dollar (NZD)' },
  { code: 'SGD', locale: 'en-SG', label: 'Singapore Dollar (SGD)' },
  { code: 'AED', locale: 'en-AE', label: 'UAE Dirham (AED)' },
  { code: 'INR', locale: 'en-IN', label: 'Indian Rupee (INR)' },
];

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

const MAX_SOURCE_LOGO_MB = 4;
const MAX_SOURCE_LOGO_BYTES = MAX_SOURCE_LOGO_MB * 1024 * 1024;

// 6 cm x 3 cm at 300 DPI for consistent print sizing in quotes/invoices
const LOGO_TARGET_WIDTH_PX = Math.round((6 / 2.54) * 300);
const LOGO_TARGET_HEIGHT_PX = Math.round((3 / 2.54) * 300);
const LOGO_OUTPUT_QUALITY = 0.88;

function toDate(value: any): Date | null {
  if (!value) return null;

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }

  return null;
}

function isSubscriptionActive(data: any) {
  const expiresAt = toDate(data?.proExpiresAt);
  const status = String(data?.subscriptionStatus || '').toLowerCase();
  const blockedStatuses = ['cancelled', 'canceled', 'inactive', 'paused'];

  return {
    active:
      Boolean(data?.isPro) &&
      !!expiresAt &&
      expiresAt.getTime() > Date.now() &&
      !blockedStatuses.includes(status),
    status: data?.subscriptionStatus || 'inactive',
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    nextBillingDate: data?.nextBillingDate || (expiresAt ? expiresAt.toISOString() : null),
  };
}

function formatDisplayDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to read image file.'));
    };

    img.src = objectUrl;
  });
}

async function prepareUniformLogoFile(file: File): Promise<File> {
  const image = await loadImageFromFile(file);

  const canvas = document.createElement('canvas');
  canvas.width = LOGO_TARGET_WIDTH_PX;
  canvas.height = LOGO_TARGET_HEIGHT_PX;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare the logo canvas.');
  }

  // White background keeps outputs consistent and avoids transparency issues in PDFs
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (canvas.width - drawWidth) / 2;
  const y = (canvas.height - drawHeight) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y, drawWidth, drawHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', LOGO_OUTPUT_QUALITY);
  });

  if (!blob) {
    throw new Error('Failed to convert logo for upload.');
  }

  return new File([blob], 'business-logo.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

function getCurrencyOption(code: string) {
  return (
    currencyOptions.find((option) => option.code === code) ||
    currencyOptions.find((option) => option.code === 'ZAR')!
  );
}

function detectCurrencyPreference(): { currencyCode: string; currencyLocale: string } {
  if (typeof window === 'undefined') {
    return { currencyCode: 'ZAR', currencyLocale: 'en-ZA' };
  }

  const locale =
    navigator.language ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    'en-ZA';

  const normalizedLocale = locale.toLowerCase();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

  if (normalizedLocale.includes('-za') || timeZone === 'Africa/Johannesburg') {
    return { currencyCode: 'ZAR', currencyLocale: 'en-ZA' };
  }

  if (normalizedLocale.includes('-us')) {
    return { currencyCode: 'USD', currencyLocale: 'en-US' };
  }

  if (normalizedLocale.includes('-gb')) {
    return { currencyCode: 'GBP', currencyLocale: 'en-GB' };
  }

  if (
    normalizedLocale.includes('-ie') ||
    normalizedLocale.includes('-de') ||
    normalizedLocale.includes('-fr') ||
    normalizedLocale.includes('-es') ||
    normalizedLocale.includes('-it') ||
    normalizedLocale.includes('-pt') ||
    normalizedLocale.includes('-nl')
  ) {
    return { currencyCode: 'EUR', currencyLocale: 'en-IE' };
  }

  if (normalizedLocale.includes('-au')) {
    return { currencyCode: 'AUD', currencyLocale: 'en-AU' };
  }

  if (normalizedLocale.includes('-ca')) {
    return { currencyCode: 'CAD', currencyLocale: 'en-CA' };
  }

  if (normalizedLocale.includes('-nz')) {
    return { currencyCode: 'NZD', currencyLocale: 'en-NZ' };
  }

  if (normalizedLocale.includes('-sg')) {
    return { currencyCode: 'SGD', currencyLocale: 'en-SG' };
  }

  if (normalizedLocale.includes('-ae') || timeZone.includes('Dubai')) {
    return { currencyCode: 'AED', currencyLocale: 'en-AE' };
  }

  if (normalizedLocale.includes('-in') || timeZone === 'Asia/Kolkata') {
    return { currencyCode: 'INR', currencyLocale: 'en-IN' };
  }

  return { currencyCode: 'USD', currencyLocale: 'en-US' };
}

export default function Profile() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileState>(defaultProfile);
  const [isPro, setIsPro] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    isPro: false,
    subscriptionStatus: 'inactive',
    proExpiresAt: null,
    nextBillingDate: null,
  });

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedTermsAt, setAcceptedTermsAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileState, string>>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [detectedCurrency, setDetectedCurrency] = useState<{ currencyCode: string; currencyLocale: string }>({
    currencyCode: 'ZAR',
    currencyLocale: 'en-ZA',
  });

  useEffect(() => {
    setDetectedCurrency(detectCurrencyPreference());
  }, []);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      setUser(u);

      const userRef = doc(db, 'users', u.uid);
      unsubscribeSnapshot = onSnapshot(
        userRef,
        (snap) => {
          const detected = detectCurrencyPreference();

          if (snap.exists()) {
            const data = snap.data();
            const incomingProfile = data.profile || {};

            setProfile({
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
              currencyCode: incomingProfile.currencyCode || detected.currencyCode,
              currencyLocale: incomingProfile.currencyLocale || detected.currencyLocale,
            });

            setAcceptedTerms(data.acceptedTerms === true);

            const acceptedAtDate = toDate(data.acceptedTermsAt);
            setAcceptedTermsAt(acceptedAtDate ? acceptedAtDate.toISOString() : null);

            const subscriptionCheck = isSubscriptionActive(data);
            setIsPro(subscriptionCheck.active);
            setSubscription({
              isPro: subscriptionCheck.active,
              subscriptionStatus: subscriptionCheck.status,
              proExpiresAt: subscriptionCheck.expiresAt,
              nextBillingDate: subscriptionCheck.nextBillingDate,
            });
          } else {
            setProfile({
              ...defaultProfile,
              businessEmail: u.email || '',
              currencyCode: detected.currencyCode,
              currencyLocale: detected.currencyLocale,
            });
            setAcceptedTerms(false);
            setAcceptedTermsAt(null);
            setIsPro(false);
            setSubscription({
              isPro: false,
              subscriptionStatus: 'inactive',
              proExpiresAt: null,
              nextBillingDate: null,
            });
          }

          setLoading(false);
        },
        (err) => {
          console.error('Profile snapshot error:', err);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      unsubscribeAuth();
    };
  }, [router]);

  const validateProfile = () => {
    const newErrors: Partial<Record<keyof ProfileState, string>> = {};

    if (!profile.businessName.trim()) {
      newErrors.businessName = 'Business name is required.';
    }

    if (!profile.ownerName.trim()) {
      newErrors.ownerName = 'Owner name is required.';
    }

    if (!profile.businessEmail.trim()) {
      newErrors.businessEmail = 'Business email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.businessEmail.trim())) {
      newErrors.businessEmail = 'Enter a valid email address.';
    }

    if (!profile.phone.trim()) {
      newErrors.phone = 'Contact number is required.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCurrencyChange = (currencyCode: string) => {
    const selected = getCurrencyOption(currencyCode);
    setProfile((prev) => ({
      ...prev,
      currencyCode: selected.code,
      currencyLocale: selected.locale,
    }));
  };

  const saveProfile = async () => {
    if (!auth.currentUser) {
      alert('Not signed in');
      return;
    }

    if (!validateProfile()) {
      alert('Please complete all required profile fields before saving.');
      return;
    }

    if (!acceptedTerms) {
      alert('You must accept the Terms of Service before continuing.');
      return;
    }

    try {
      setSaving(true);

      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        {
          profile: {
            ...profile,
            businessName: profile.businessName.trim(),
            ownerName: profile.ownerName.trim(),
            phone: profile.phone.trim(),
            businessEmail: profile.businessEmail.trim(),
            physicalAddress: profile.physicalAddress.trim(),
            postalAddress: profile.postalAddress.trim(),
            cipcNumber: profile.cipcNumber.trim(),
            taxNumber: profile.taxNumber.trim(),
            vatNumber: profile.vatNumber.trim(),
            bankDetails: profile.bankDetails.trim(),
            logo: profile.logo || '',
            currencyCode: profile.currencyCode || detectedCurrency.currencyCode,
            currencyLocale: profile.currencyLocale || detectedCurrency.currencyLocale,
          },
          acceptedTerms: true,
          acceptedTermsAt: serverTimestamp(),
        },
        { merge: true }
      );

      alert('Profile saved successfully!');
    } catch (err: any) {
      console.error('Save profile error:', err);
      alert('Failed to save profile: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    try {
      if (file.size > MAX_SOURCE_LOGO_BYTES) {
        alert(`Logo file is too large. Please upload an image smaller than ${MAX_SOURCE_LOGO_MB} MB.`);
        e.target.value = '';
        return;
      }

      setUploadingLogo(true);

      const processedLogoFile = await prepareUniformLogoFile(file);
      const uid = auth.currentUser.uid;
      const storageRef = ref(storage, `logos/${uid}`);

      await uploadBytes(storageRef, processedLogoFile, {
        contentType: 'image/jpeg',
        cacheControl: 'public,max-age=3600',
      });

      const url = await getDownloadURL(storageRef);

      const updatedProfile: ProfileState = {
        ...profile,
        logo: url,
      };

      setProfile(updatedProfile);

      await setDoc(
        doc(db, 'users', uid),
        {
          profile: {
            ...updatedProfile,
            businessName: updatedProfile.businessName.trim(),
            ownerName: updatedProfile.ownerName.trim(),
            phone: updatedProfile.phone.trim(),
            businessEmail: updatedProfile.businessEmail.trim(),
            physicalAddress: updatedProfile.physicalAddress.trim(),
            postalAddress: updatedProfile.postalAddress.trim(),
            cipcNumber: updatedProfile.cipcNumber.trim(),
            taxNumber: updatedProfile.taxNumber.trim(),
            vatNumber: updatedProfile.vatNumber.trim(),
            bankDetails: updatedProfile.bankDetails.trim(),
            logo: url,
            currencyCode: updatedProfile.currencyCode || detectedCurrency.currencyCode,
            currencyLocale: updatedProfile.currencyLocale || detectedCurrency.currencyLocale,
          },
        },
        { merge: true }
      );

      alert('Logo uploaded successfully!');
      e.target.value = '';
    } catch (err: any) {
      console.error('Logo upload error:', err);
      alert('Failed to upload logo: ' + (err.message || 'Unknown error'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const deleteCollectionDocsForUser = async (collectionName: string, uid: string) => {
    const collectionQuery = query(collection(db, collectionName), where('userId', '==', uid));
    const snap = await getDocs(collectionQuery);

    for (const itemDoc of snap.docs) {
      await deleteDoc(doc(db, collectionName, itemDoc.id));
    }
  };

  const cancelPayfastSubscriptionBeforeDelete = async () => {
    if (!auth.currentUser || !isPro) return true;

    try {
      const response = await fetch('/api/payfast-cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: auth.currentUser.uid,
          reason: 'account_deleted',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error ||
            'We could not cancel the PayFast subscription before deleting the account.'
        );
      }

      return true;
    } catch (err: any) {
      console.error('Subscription cancellation before delete failed:', err);
      alert(
        'Your Pro subscription must be cancelled before your account can be deleted. Deletion has been stopped for safety.\n\n' +
          (err.message || 'Unknown error')
      );
      return false;
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser) {
      alert('Not signed in');
      return;
    }

    const confirmed = confirm(
      isPro
        ? 'Are you sure you want to delete your account? Your PayFast subscription will be cancelled first, then all your invoices, quotes, products, customers, and profile data will be permanently deleted. This cannot be undone.'
        : 'Are you sure you want to delete your account? This action is permanent and cannot be undone. All your invoices, quotes, products, customers, and profile data will be deleted.'
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingAccount(true);

      const currentUser = auth.currentUser;
      const uid = currentUser.uid;

      const cancelled = await cancelPayfastSubscriptionBeforeDelete();
      if (!cancelled) {
        return;
      }

      await deleteCollectionDocsForUser('documents', uid);
      await deleteCollectionDocsForUser('customers', uid);
      await deleteCollectionDocsForUser('products', uid);
      await deleteCollectionDocsForUser('expenses', uid);

      try {
        const logoRef = ref(storage, `logos/${uid}`);
        await deleteObject(logoRef);
      } catch (storageErr: any) {
        if (storageErr?.code !== 'storage/object-not-found') {
          console.warn('Logo deletion warning:', storageErr);
        }
      }

      await deleteDoc(doc(db, 'users', uid));
      await deleteUser(currentUser);

      alert('Account and data permanently deleted.');
      router.push('/');
    } catch (err: any) {
      console.error('Delete error:', err);

      if (err?.code === 'auth/requires-recent-login') {
        alert(
          'For security, please log out and log back in before deleting your account, then try again.'
        );
      } else {
        alert('Failed to delete account: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const requiredFieldsComplete =
    profile.businessName.trim() &&
    profile.ownerName.trim() &&
    profile.businessEmail.trim() &&
    profile.phone.trim();

  const selectedCurrency = getCurrencyOption(profile.currencyCode || detectedCurrency.currencyCode);
  const detectedCurrencyOption = getCurrencyOption(detectedCurrency.currencyCode);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading profile...
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
              <Link href="/profile" className="text-emerald-400 font-medium">
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
                  href="/customers"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Customers
                </Link>
                <Link
                  href="/quotes"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Quotes
                </Link>
                <Link
                  href="/products"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Products
                </Link>
                <Link
                  href="/invoices"
                  className="text-zinc-300 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Invoices
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
                  className="text-emerald-400 font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold mb-2">Business Profile</h2>
          <p className="text-zinc-400">
            Complete your business details below. These details will be used on your quotes and
            invoices.
          </p>
        </div>

        {!acceptedTerms && (
          <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-3xl p-5 sm:p-6">
            <h3 className="text-lg sm:text-xl font-semibold text-red-300 mb-2">
              Terms acceptance required
            </h3>
            <p className="text-red-100/90 leading-7">
              You must accept the Terms of Service before using RealQte fully. RealQte is a basic
              software tool and not an accounting firm, financial services provider, tax advisor,
              or legal advisor. You remain responsible for checking all figures, taxes, totals, and
              financial details yourself.
            </p>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 mb-8">
          <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
            <div>
              <h3 className="text-2xl font-semibold mb-2">Profile completeness</h3>
              <p className="text-zinc-400">
                Required: Business Name, Owner Name, Business Email, Contact Number
              </p>
            </div>

            <div
              className={
                requiredFieldsComplete
                  ? 'text-emerald-400 font-medium'
                  : 'text-yellow-400 font-medium'
              }
            >
              {requiredFieldsComplete ? 'Ready for invoices & quotes' : 'Missing required details'}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Business Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={profile.businessName}
                onChange={(e) => {
                  setProfile({ ...profile, businessName: e.target.value });
                  if (errors.businessName) setErrors((prev) => ({ ...prev, businessName: '' }));
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                placeholder="Enter your business name"
              />
              {errors.businessName && (
                <p className="text-red-400 text-sm mt-2">{errors.businessName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Owner Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={profile.ownerName}
                onChange={(e) => {
                  setProfile({ ...profile, ownerName: e.target.value });
                  if (errors.ownerName) setErrors((prev) => ({ ...prev, ownerName: '' }));
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                placeholder="Enter owner or representative name"
              />
              {errors.ownerName && <p className="text-red-400 text-sm mt-2">{errors.ownerName}</p>}
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Contact Number <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => {
                  setProfile({ ...profile, phone: e.target.value });
                  if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                placeholder="e.g. 082 123 4567"
              />
              {errors.phone && <p className="text-red-400 text-sm mt-2">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Business Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={profile.businessEmail}
                onChange={(e) => {
                  setProfile({ ...profile, businessEmail: e.target.value });
                  if (errors.businessEmail) {
                    setErrors((prev) => ({ ...prev, businessEmail: '' }));
                  }
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                placeholder="e.g. info@yourbusiness.co.za"
              />
              {errors.businessEmail && (
                <p className="text-red-400 text-sm mt-2">{errors.businessEmail}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Physical Address</label>
              <textarea
                value={profile.physicalAddress}
                onChange={(e) => setProfile({ ...profile, physicalAddress: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-h-[110px]"
                placeholder="Enter physical business address"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Postal Address</label>
              <textarea
                value={profile.postalAddress}
                onChange={(e) => setProfile({ ...profile, postalAddress: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-h-[110px]"
                placeholder="Enter postal address if different"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Business VAT Number (optional)
              </label>
              <input
                type="text"
                value={profile.vatNumber}
                onChange={(e) => setProfile({ ...profile, vatNumber: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                placeholder="Enter VAT number"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                CIPC / Registration Number
              </label>
              <input
                type="text"
                value={profile.cipcNumber}
                onChange={(e) => setProfile({ ...profile, cipcNumber: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                placeholder="Enter CIPC or company registration number"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Tax Number</label>
              <input
                type="text"
                value={profile.taxNumber}
                onChange={(e) => setProfile({ ...profile, taxNumber: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                placeholder="Enter tax number"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Default Currency</label>
              <select
                value={profile.currencyCode}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              >
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="text-zinc-500 text-sm mt-2 space-y-1">
                <p>Detected default: {detectedCurrencyOption.label}</p>
                <p>Current selected locale: {selectedCurrency.locale}</p>
                <p>
                  This becomes the default currency for future quotes and invoices after the next page
                  updates are applied.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Bank Details</label>
              <textarea
                value={profile.bankDetails}
                onChange={(e) => setProfile({ ...profile, bankDetails: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-h-[110px]"
                placeholder="Enter bank name, account number, branch code, account type"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-2">Business Logo (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
              <div className="text-zinc-500 text-sm mt-2 space-y-1">
                <p>
                  {uploadingLogo
                    ? 'Uploading logo...'
                    : 'Upload a logo to display on quotes and invoices.'}
                </p>
                <p>Maximum source file size: {MAX_SOURCE_LOGO_MB} MB.</p>
                <p>
                  Uploaded logos are automatically resized to 6 cm × 3 cm for consistent quote and
                  invoice branding.
                </p>
              </div>
              {profile.logo && (
                <img
                  src={profile.logo}
                  alt="Logo Preview"
                  className="mt-4 max-h-32 rounded-xl border border-zinc-700 bg-white p-2"
                />
              )}
            </div>
          </div>

          <div className="mt-10 border-t border-zinc-800 pt-6">
            <h3 className="text-xl font-semibold mb-3">Terms of Service</h3>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 sm:p-5">
              <p className="text-sm text-zinc-300 leading-7">
                By agreeing, you confirm that you understand RealQte is a basic software tool and
                not an accounting firm, financial services provider, tax advisor, or legal advisor.
                You remain solely responsible for checking all figures, taxes, totals, calculations,
                invoices, quotes, and financial records before relying on them or sending them to
                clients.
              </p>

              <p className="text-sm text-zinc-400 leading-7 mt-3">
                You also acknowledge that RealQte is not responsible for financial losses, tax
                errors, incorrect totals, business damages, or disputes arising from use of the
                platform. Please read the full{' '}
                <Link href="/legal" className="text-emerald-400 hover:underline">
                  Legal Policies and Terms of Service
                </Link>.
              </p>

              <label className="flex items-start gap-3 mt-5">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-zinc-200 leading-6">
                  I agree to the Terms of Service and understand that I must verify all figures,
                  calculations, taxes, totals, and financial information myself before using or
                  sending any document created with RealQte.
                </span>
              </label>

              {!acceptedTerms && (
                <p className="text-red-400 text-sm mt-3">
                  You must accept the Terms of Service before saving your profile and fully using
                  RealQte.
                </p>
              )}

              {acceptedTerms && acceptedTermsAt && (
                <p className="text-emerald-400 text-sm mt-3">
                  Terms accepted on: {formatDisplayDate(acceptedTermsAt)}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 py-4 sm:py-5 rounded-2xl text-lg sm:text-xl font-bold mt-10"
          >
            {saving ? 'Saving Profile...' : 'Save Profile'}
          </button>
        </div>

        <div className="mt-12 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
          <h3 className="text-2xl font-semibold mb-4">Subscription</h3>

          {isPro ? (
            <div>
              <p className="text-emerald-400 font-medium mb-2">Pro Plan Active (R35/month)</p>
              <p className="text-zinc-400 mb-2">
                Status: {subscription.subscriptionStatus || 'active'}
              </p>
              {subscription.nextBillingDate && (
                <p className="text-zinc-400 mb-4">
                  Next billing / expiry: {formatDisplayDate(subscription.nextBillingDate)}
                </p>
              )}

              <button
                onClick={async () => {
                  if (!auth.currentUser) {
                    alert('No signed-in user found.');
                    return;
                  }

                  console.log('CLIENT UID:', auth.currentUser.uid);

                  const confirmed = confirm(
                    'Are you sure you want to cancel your subscription?'
                  );
                  if (!confirmed) return;

                  try {
                    const res = await fetch('/api/payfast-cancel-subscription', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: auth.currentUser.uid }),
                    });

                    const data = await res.json();

                    console.log('CLIENT RESPONSE:', data);

                    if (!res.ok) {
                      throw new Error(data?.error || 'Failed to cancel subscription');
                    }

                    alert('Subscription cancelled successfully.');
                    window.location.reload();
                  } catch (err: any) {
                    console.error('CLIENT ERROR:', err);
                    alert(err.message || 'Error cancelling subscription');
                  }
                }}
                className="text-red-400 hover:underline"
              >
                Cancel Subscription
              </button>
            </div>
          ) : (
            <p className="text-zinc-400">
              Basic Plan •{' '}
              <Link href="/" className="text-emerald-400 hover:underline">
                Upgrade to Pro
              </Link>
            </p>
          )}
        </div>

        <div className="mt-6">
          <Link href="/legal" className="text-emerald-400 hover:underline">
            View Legal Policies - (Check these frequently for updates)
          </Link>
        </div>

        <div className="mt-16 pt-8 border-t border-zinc-800">
          <h3 className="text-xl font-semibold text-red-400 mb-4">Danger Zone</h3>
          <p className="text-zinc-400 mb-6">
            Permanently delete your account and all associated data. This cannot be undone.
            {isPro
              ? ' Your PayFast subscription will be cancelled first before deletion continues.'
              : ''}
          </p>
          <button
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-4 px-8 rounded-xl font-bold"
          >
            {deletingAccount ? 'Deleting Account...' : 'Delete My Account'}
          </button>
        </div>
      </div>
    </div>
  );
}