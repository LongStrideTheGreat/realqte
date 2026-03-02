'use client';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState({ businessName: '', ownerName: '', taxNumber: '', bankDetails: '', logo: '' });

  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push('/');
      const snap = await getDoc(doc(db, 'users', u.uid));
      if (snap.exists()) setProfile(snap.data().profile || {});
    });
  }, []);

  const save = async () => {
    if (!auth.currentUser) return;
    await setDoc(doc(db, 'users', auth.currentUser.uid), { profile }, { merge: true });
    alert('Profile saved!');
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-4xl font-bold mb-8">Your Profile</h1>
      {/* Same input fields as before */}
      <button onClick={save} className="w-full bg-emerald-600 py-4 rounded-2xl">Save Changes</button>
      <button onClick={() => router.push('/')} className="mt-4 text-zinc-400">← Back to Tool</button>
    </div>
  );
}