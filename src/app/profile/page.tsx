'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, where, deleteDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signOut, deleteUser } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState({
    businessName: '',
    ownerName: '',
    phone: '',
    businessEmail: '',
    physicalAddress: '',
    postalAddress: '',
    cipcNumber: '',
    taxNumber: '',
    bankDetails: '',
    logo: ''
  });
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push('/');

      // Real-time listener for user document
      const userRef = doc(db, 'users', u.uid);
      const unsubscribeSnapshot = onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setProfile(data.profile || profile);
          setIsPro(data.isPro || false);
        }
        setLoading(false);
      }, (err) => {
        console.error('Profile snapshot error:', err);
        setLoading(false);
      });

      // Cleanup snapshot listener
      return () => unsubscribeSnapshot();
    });

    return unsubscribeAuth;
  }, [router]);

  const saveProfile = async () => {
    if (!auth.currentUser) return alert('Not signed in');

    await setDoc(doc(db, 'users', auth.currentUser.uid), { profile }, { merge: true });
    alert('Profile saved successfully!');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    const storageRef = ref(storage, `logos/${auth.currentUser.uid}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    setProfile({ ...profile, logo: url });
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser) return alert('Not signed in');

    if (!confirm('Are you sure you want to delete your account? This action is permanent and cannot be undone. All your invoices, quotes, customers, and profile data will be deleted.')) return;

    try {
      const uid = auth.currentUser.uid;

      // Delete documents
      const docsQuery = query(collection(db, 'documents'), where('userId', '==', uid));
      const docsSnap = await getDocs(docsQuery);
      for (const docSnap of docsSnap.docs) {
        await deleteDoc(doc(db, 'documents', docSnap.id));
      }

      // Delete customers
      const custQuery = query(collection(db, 'customers'), where('userId', '==', uid));
      const custSnap = await getDocs(custQuery);
      for (const custDoc of custSnap.docs) {
        await deleteDoc(doc(db, 'customers', custDoc.id));
      }

      // Delete user doc
      await deleteDoc(doc(db, 'users', uid));

      // Delete auth user
      await deleteUser(auth.currentUser);

      alert('Account and data permanently deleted.');
      router.push('/');
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Failed to delete account: ' + (err.message || 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          {/* Assuming your header content is here or in layout.tsx */}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Profile Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Business Name</label>
            <input
              type="text"
              value={profile.businessName}
              onChange={e => setProfile({ ...profile, businessName: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Owner Name</label>
            <input
              type="text"
              value={profile.ownerName}
              onChange={e => setProfile({ ...profile, ownerName: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            />
          </div>
          {/* Add other fields similarly: phone, businessEmail, physicalAddress, postalAddress, cipcNumber, taxNumber, bankDetails */}
          {/* ... your other inputs here ... */}
          <div className="md:col-span-2">
            <label className="block text-sm text-zinc-400 mb-2">Business Logo (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            />
            {profile.logo && <img src={profile.logo} alt="Logo Preview" className="mt-4 max-h-32 rounded-xl border border-zinc-700" />}
          </div>
        </div>

        <button
          onClick={saveProfile}
          className="w-full bg-emerald-600 hover:bg-emerald-500 py-5 rounded-2xl text-xl font-bold mt-10"
        >
          Save Profile
        </button>

        {/* Subscription Status */}
        <div className="mt-12 bg-zinc-800 rounded-3xl p-8">
          <h3 className="text-2xl font-semibold mb-4">Subscription</h3>
          {isPro ? (
            <div>
              <p className="text-emerald-400 font-medium mb-4">Pro Plan Active (R35/month)</p>
              <button onClick={() => alert('Contact support to cancel subscription')} className="text-red-400 hover:underline">
                Cancel Subscription
              </button>
            </div>
          ) : (
            <p className="text-zinc-400">
              Basic Plan • <Link href="/" className="text-emerald-400 hover:underline">Upgrade to Pro</Link>
            </p>
          )}
        </div>

        {/* Danger Zone */}
        <div className="mt-16 pt-8 border-t border-zinc-800">
          <h3 className="text-xl font-semibold text-red-400 mb-4">Danger Zone</h3>
          <p className="text-zinc-400 mb-6">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <button
            onClick={handleDeleteAccount}
            className="bg-red-600 hover:bg-red-700 text-white py-4 px-8 rounded-xl font-bold"
          >
            Delete My Account
          </button>
        </div>
      </div>
    </div>
  );
}