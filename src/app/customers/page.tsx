'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import AppHeader from '@/components/AppHeader';

export default function Customers() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    taxNumber: '',
    mainContactPerson: '',
  });

  const loadCustomers = async (uid: string) => {
    setLoading(true);
    try {
      const custSnap = await getDocs(
        query(
          collection(db, 'customers'),
          where('userId', '==', uid),
          orderBy('createdAt', 'desc')
        )
      );
      setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error loading customers:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      setUser(u);
      setMobileMenuOpen(false);
      await loadCustomers(u.uid);
    });

    return unsubscribe;
  }, [router]);

  const filteredCustomers = customers.filter((c) => {
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
      mainContactPerson: '',
    });
    setEditingCustomer(null);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const addCustomer = async () => {
    if (!user || !formData.name.trim()) return alert('Customer name is required');

    try {
      await addDoc(collection(db, 'customers'), {
        userId: user.uid,
        ...formData,
        createdAt: Timestamp.now(),
      });
      resetForm();
      await loadCustomers(user.uid);
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
      mainContactPerson: cust.mainContactPerson || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveEdit = async () => {
    if (!editingCustomer || !formData.name.trim()) return alert('Name is required');

    try {
      await updateDoc(doc(db, 'customers', editingCustomer.id), formData);
      resetForm();
      await loadCustomers(user.uid);
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
      await loadCustomers(user.uid);
      alert('Customer deleted successfully');
    } catch (err: any) {
      console.error('Error deleting customer:', err);
      alert(`Failed to delete customer: ${err.message || 'Unknown error'}`);
    }
  };

  const handleLogout = async () => {
    try {
      setMobileMenuOpen(false);
      await signOut(auth);
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading customers...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        user={user}
        setupComplete={true}
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">Manage Customers</h1>

        <div className="bg-zinc-900 rounded-3xl p-6 sm:p-8 mb-12 border border-zinc-800">
          <h2 className="text-2xl font-semibold text-white mb-6">
            {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-zinc-300 mb-2">Customer Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-2">Main Contact Person</label>
              <input
                type="text"
                name="mainContactPerson"
                value={formData.mainContactPerson}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-2">Phone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-2">Tax / VAT Number</label>
              <input
                type="text"
                name="taxNumber"
                value={formData.taxNumber}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-300 mb-2">Address</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleFormChange}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 h-28 text-white"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <button
              onClick={editingCustomer ? saveEdit : addCustomer}
              className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-bold text-white"
            >
              {editingCustomer ? 'Save Changes' : 'Add Customer'}
            </button>

            {editingCustomer && (
              <button
                onClick={resetForm}
                className="w-full sm:flex-1 bg-zinc-700 hover:bg-zinc-600 py-4 rounded-2xl font-bold text-white"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
            <h2 className="text-2xl font-semibold text-white">
              Your Customers ({customers.length})
            </h2>

            <input
              type="text"
              placeholder="Search by name, email, phone or tax number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 w-full lg:w-96 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {loading ? (
            <p className="text-zinc-500 text-center py-10">Loading customers...</p>
          ) : filteredCustomers.length === 0 ? (
            <p className="text-zinc-500 text-center py-10">
              {searchTerm ? 'No matching customers found' : 'No customers yet. Add one above!'}
            </p>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCustomers.map((cust) => (
                <div
                  key={cust.id}
                  className="bg-zinc-900 rounded-3xl p-6 hover:bg-zinc-800 transition-all border border-zinc-700"
                >
                  <div className="font-medium text-white text-lg mb-3">{cust.name}</div>

                  {cust.mainContactPerson && (
                    <div className="text-sm text-emerald-300 mb-1">
                      Contact: {cust.mainContactPerson}
                    </div>
                  )}

                  {cust.email && <div className="text-sm text-zinc-300">Email: {cust.email}</div>}
                  {cust.phone && <div className="text-sm text-zinc-300">Phone: {cust.phone}</div>}
                  {cust.taxNumber && (
                    <div className="text-sm text-zinc-300">Tax: {cust.taxNumber}</div>
                  )}
                  {cust.address && (
                    <div className="text-sm text-zinc-300 mt-2">Address: {cust.address}</div>
                  )}

                  <div className="mt-6 flex gap-3 flex-wrap">
                    <button
                      onClick={() => startEdit(cust)}
                      className="text-emerald-400 hover:underline text-sm"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => {
                        if (confirm('Delete this customer?')) deleteCustomer(cust.id);
                      }}
                      className="text-red-400 hover:underline text-sm"
                    >
                      Delete
                    </button>

                    <Link
                      href={`/new-invoice?customerId=${cust.id}`}
                      className="text-blue-400 hover:underline text-sm ml-auto"
                    >
                      New Invoice
                    </Link>

                    <Link
                      href={`/new-quote?customerId=${cust.id}`}
                      className="text-purple-400 hover:underline text-sm"
                    >
                      New Quote
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <footer className="mt-12 border-t border-zinc-800 pt-6 pb-4">
  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-500">
    
    <p>
      © {new Date().getFullYear()} RealQte. All rights reserved.
    </p>

    <div className="flex items-center gap-4">
      <Link href="/help" className="hover:text-white transition">
        Help
      </Link>
      <Link href="/legal" className="hover:text-white transition">
        Legal
      </Link>
      <Link href="/privacy" className="hover:text-white transition">
        Privacy
      </Link>
    </div>

  </div>
</footer>
    </div>
  );
}