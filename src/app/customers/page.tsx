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
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    taxNumber: '',
    mainContactPerson: ''
  });

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
      c.phone?.toLowerCase().includes(term) ||
      c.taxNumber?.toLowerCase().includes(term) ||
      c.mainContactPerson?.toLowerCase().includes(term)
    );
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      taxNumber: '',
      mainContactPerson: ''
    });
    setEditingCustomer(null);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addCustomer = async () => {
    if (!user) return alert('You must be signed in to add a customer');
    if (!formData.name.trim()) return alert('Customer name is required');

    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        userId: user.uid,  // Critical: this must match the security rule
        ...formData,
        createdAt: Timestamp.now()
      });

      setCustomers([...customers, { id: docRef.id, ...formData, createdAt: { seconds: Date.now() / 1000 } }]);
      resetForm();
      alert('Customer added successfully!');
    } catch (err: any) {
      console.error('Error adding customer:', err);
      alert(`Failed to add customer: ${err.message || 'Unknown error'}`);
    }
  };

  const startEdit = (cust: any) => {
    setEditingCustomer(cust);
    setFormData({
      name: cust.name || '',
      email: cust.email || '',
      phone: cust.phone || '',
      address: cust.address || '',
      taxNumber: cust.taxNumber || '',
      mainContactPerson: cust.mainContactPerson || ''
    });
  };

  const saveEdit = async () => {
    if (!editingCustomer || !formData.name.trim()) return alert('Name is required');

    try {
      await updateDoc(doc(db, 'customers', editingCustomer.id), formData);

      setCustomers(customers.map(c => 
        c.id === editingCustomer.id ? { ...c, ...formData } : c
      ));
      resetForm();
      alert('Customer updated successfully!');
    } catch (err: any) {
      console.error('Error updating customer:', err);
      alert(`Failed to update customer: ${err.message || 'Unknown error'}`);
    }
  };

  const deleteCustomer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;

    try {
      await deleteDoc(doc(db, 'customers', id));
      setCustomers(customers.filter(c => c.id !== id));
      alert('Customer deleted successfully');
    } catch (err: any) {
      console.error('Error deleting customer:', err);
      alert(`Failed to delete customer: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
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
            <Link href="/profile" className="text-zinc-400 hover:text-white">Profile</Link>
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold mb-8">Manage Customers</h1>

        {/* Add / Edit Form */}
        <div className="bg-zinc-900 rounded-3xl p-8 mb-12">
          <h2 className="text-2xl font-semibold mb-6">
            {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Customer Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Main Contact Person</label>
              <input
                type="text"
                name="mainContactPerson"
                value={formData.mainContactPerson}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Phone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Tax / VAT Number</label>
              <input
                type="text"
                name="taxNumber"
                value={formData.taxNumber}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-2">Address</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-28"
              />
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button
              onClick={editingCustomer ? saveEdit : addCustomer}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-bold"
            >
              {editingCustomer ? 'Save Changes' : 'Add Customer'}
            </button>
            {editingCustomer && (
              <button
                onClick={resetForm}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 py-4 rounded-2xl font-bold"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Customer List */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Your Customers ({customers.length})</h2>
            <input
              type="text"
              placeholder="Search by name, email, phone or tax number..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 w-96 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {filteredCustomers.length === 0 ? (
            <p className="text-zinc-500 text-center py-10">
              {searchTerm ? 'No matching customers found' : 'No customers yet. Add one above!'}
            </p>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCustomers.map(cust => (
                <div key={cust.id} className="bg-zinc-900 rounded-3xl p-6 hover:bg-zinc-800 transition-all border border-zinc-700">
                  <div className="font-medium text-lg mb-3">{cust.name}</div>
                  {cust.mainContactPerson && <div className="text-sm text-emerald-400 mb-1">Contact: {cust.mainContactPerson}</div>}
                  {cust.email && <div className="text-sm text-zinc-400">Email: {cust.email}</div>}
                  {cust.phone && <div className="text-sm text-zinc-400">Phone: {cust.phone}</div>}
                  {cust.taxNumber && <div className="text-sm text-zinc-400">Tax: {cust.taxNumber}</div>}
                  {cust.address && <div className="text-sm text-zinc-400 mt-2">Address: {cust.address}</div>}

                  <div className="mt-6 flex gap-3 flex-wrap">
                    <button onClick={() => startEdit(cust)} className="text-emerald-400 hover:underline text-sm">Edit</button>
                    <button onClick={() => { if (confirm('Delete this customer?')) deleteCustomer(cust.id); }} className="text-red-400 hover:underline text-sm">Delete</button>
                    <Link href={`/new-invoice?customerId=${cust.id}`} className="text-blue-400 hover:underline text-sm ml-auto">New Invoice</Link>
                    <Link href={`/new-quote?customerId=${cust.id}`} className="text-purple-400 hover:underline text-sm">New Quote</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}