'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, orderBy, Timestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';

export default function Customers() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', address: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push('/');
      setUser(u);

      const custSnap = await getDocs(query(collection(db, 'customers'), where('userId', '==', u.uid), orderBy('createdAt', 'desc')));
      setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return unsubscribe;
  }, [router]);

  const filteredCustomers = customers.filter(c => {
    const term = searchTerm.toLowerCase();
    return (
      c.name?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term)
    );
  });

  const addCustomer = async () => {
    if (!user || !editForm.name.trim()) return alert('Customer name is required');
    
    await addDoc(collection(db, 'customers'), {
      userId: user.uid,
      ...editForm,
      createdAt: Timestamp.now()
    });

    setCustomers([...customers, { ...editForm, createdAt: { seconds: Date.now() / 1000 } }]);
    setEditForm({ name: '', email: '', phone: '', address: '' });
    alert('Customer added!');
  };

  const startEdit = (cust: any) => {
    setEditingCustomer(cust);
    setEditForm({ name: cust.name, email: cust.email || '', phone: cust.phone || '', address: cust.address || '' });
  };

  const saveEdit = async () => {
    if (!editingCustomer || !editForm.name.trim()) return alert('Name required');

    await updateDoc(doc(db, 'customers', editingCustomer.id), editForm);

    setCustomers(customers.map(c => c.id === editingCustomer.id ? { ...c, ...editForm } : c));
    setEditingCustomer(null);
    setEditForm({ name: '', email: '', phone: '', address: '' });
    alert('Customer updated!');
  };

  const deleteCustomer = async (id: string) => {
    if (!confirm('Delete this customer?')) return;

    await deleteDoc(doc(db, 'customers', id));
    setCustomers(customers.filter(c => c.id !== id));
    alert('Customer deleted');
  };

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
            <Link href="/customers" className="text-emerald-400 font-medium">Customers</Link>
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold mb-8">Manage Customers</h1>

        {/* Add / Edit Form */}
        <div className="bg-zinc-900 rounded-3xl p-8 mb-12">
          <h2 className="text-2xl font-semibold mb-6">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <input type="text" placeholder="Name *" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-zinc-800 p-3 rounded-xl" />
            <input type="email" placeholder="Email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className="w-full bg-zinc-800 p-3 rounded-xl" />
            <input type="tel" placeholder="Phone" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="w-full bg-zinc-800 p-3 rounded-xl" />
            <textarea placeholder="Address" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} className="w-full bg-zinc-800 p-3 rounded-xl h-28 md:col-span-2" />
          </div>

          <div className="flex gap-4 mt-8">
            <button onClick={editingCustomer ? saveEdit : addCustomer} className="flex-1 bg-emerald-600 py-4 rounded-2xl font-bold">
              {editingCustomer ? 'Save Changes' : 'Add Customer'}
            </button>
            {editingCustomer && <button onClick={() => { setEditingCustomer(null); setEditForm({ name: '', email: '', phone: '', address: '' }); }} className="flex-1 bg-zinc-700 py-4 rounded-2xl font-bold">Cancel</button>}
          </div>
        </div>

        {/* Search */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">Your Customers ({customers.length})</h2>
          <input type="text" placeholder="Search customers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 w-80" />
        </div>

        {/* List */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map(cust => (
            <div key={cust.id} className="bg-zinc-900 rounded-3xl p-6">
              <div className="font-medium text-lg">{cust.name}</div>
              {cust.email && <div className="text-sm text-zinc-400">{cust.email}</div>}
              {cust.phone && <div className="text-sm text-zinc-400">{cust.phone}</div>}
              {cust.address && <div className="text-sm text-zinc-400 mt-2">{cust.address}</div>}

              <div className="mt-6 flex gap-3">
                <button onClick={() => startEdit(cust)} className="text-emerald-400 hover:underline text-sm">Edit</button>
                <button onClick={() => { if (confirm('Delete?')) deleteCustomer(cust.id); }} className="text-red-400 hover:underline text-sm">Delete</button>
                <Link href={`/new-invoice?customerId=${cust.id}`} className="ml-auto text-blue-400 hover:underline text-sm">New Invoice</Link>
                <Link href={`/new-quote?customerId=${cust.id}`} className="text-purple-400 hover:underline text-sm">New Quote</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}