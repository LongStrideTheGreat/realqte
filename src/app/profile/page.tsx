'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, where, deleteDoc } from 'firebase/firestore';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push('/');
      
      const snap = await getDoc(doc(db, 'users', u.uid));
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data.profile || profile);
      }
      setLoading(false);
    });

    return unsubscribe;
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

      // Delete all documents
      const docsQuery = query(collection(db, 'documents'), where('userId', '==', uid));
      const docsSnap = await getDocs(docsQuery);
      for (const docSnap of docsSnap.docs) {
        await deleteDoc(doc(db, 'documents', docSnap.id));
      }

      // Delete all customers
      const custQuery = query(collection(db, 'customers'), where('userId', '==', uid));
      const custSnap = await getDocs(custQuery);
      for (const custDoc of custSnap.docs) {
        await deleteDoc(doc(db, 'customers', custDoc.id));
      }

      // Delete user profile document
      await deleteDoc(doc(db, 'users', uid));

      // Delete Firebase Authentication account
      await deleteUser(auth.currentUser);

      alert('Your account and all associated data have been permanently deleted.');
      router.push('/');
    } catch (err: any) {
      console.error('Delete account error:', err);
      alert('Failed to delete account. Please try again or contact support.');
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
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">SA</span>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-white">Dashboard</Link>
            <Link href="/new-invoice" className="text-zinc-400 hover:text-white">New Invoice</Link>
            <Link href="/new-quote" className="text-zinc-400 hover:text-white">New Quote</Link>
            <Link href="/customers" className="text-zinc-400 hover:text-white">Customers</Link>
            <Link href="/profile" className="text-emerald-400 font-medium">Profile</Link>
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-10">Your Business Profile</h1>

        <div className="bg-zinc-900 rounded-3xl p-10">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Business Name</label>
              <input
                type="text"
                value={profile.businessName}
                onChange={e => setProfile({...profile, businessName: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Owner / Contact Name</label>
              <input
                type="text"
                value={profile.ownerName}
                onChange={e => setProfile({...profile, ownerName: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Phone Number</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={e => setProfile({...profile, phone: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Business Email</label>
              <input
                type="email"
                value={profile.businessEmail}
                onChange={e => setProfile({...profile, businessEmail: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-2">Physical Address</label>
              <textarea
                value={profile.physicalAddress}
                onChange={e => setProfile({...profile, physicalAddress: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-24"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-2">Postal Address (if different)</label>
              <textarea
                value={profile.postalAddress}
                onChange={e => setProfile({...profile, postalAddress: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-24"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">CIPC / Company Registration Number</label>
              <input
                type="text"
                value={profile.cipcNumber}
                onChange={e => setProfile({...profile, cipcNumber: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Tax / VAT Number</label>
              <input
                type="text"
                value={profile.taxNumber}
                onChange={e => setProfile({...profile, taxNumber: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-2">Banking Details (for invoices)</label>
              <textarea
                value={profile.bankDetails}
                onChange={e => setProfile({...profile, bankDetails: e.target.value})}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-32"
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
              {profile.logo && <img src={profile.logo} alt="Logo Preview" className="mt-4 max-h-32 rounded-xl border border-zinc-700" />}
            </div>
          </div>

          <button
            onClick={saveProfile}
            className="w-full bg-emerald-600 hover:bg-emerald-500 py-5 rounded-2xl text-xl font-bold mt-10"
          >
            Save Profile
          </button>

          {/* Delete Account Button */}
          <div className="mt-16 pt-8 border-t border-zinc-800">
            <h3 className="text-xl font-semibold text-red-400 mb-4">Danger Zone</h3>
            <p className="text-zinc-400 mb-6">Permanently delete your account and all associated data (invoices, quotes, customers, profile). This action cannot be undone.</p>
            <button
              onClick={handleDeleteAccount}
              className="bg-red-600 hover:bg-red-700 text-white py-4 px-8 rounded-xl font-bold"
            >
              Delete My Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}