'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';

type ProductType = {
  id: string;
  userId?: string;
  name?: string;
  description?: string;
  price?: number;
  unit?: string;
  vatRate?: number;
  category?: string;
  sku?: string;
  isActive?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

type ProductFormType = {
  name: string;
  description: string;
  price: string;
  unit: string;
  vatRate: string;
  category: string;
  sku: string;
  isActive: boolean;
};

const defaultForm: ProductFormType = {
  name: '',
  description: '',
  price: '',
  unit: 'each',
  vatRate: '15',
  category: 'General',
  sku: '',
  isActive: true,
};

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

export default function ProductsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [form, setForm] = useState<ProductFormType>(defaultForm);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      try {
        setUser(u);
        setMobileMenuOpen(false);

        const snap = await getDocs(
          query(
            collection(db, 'products'),
            where('userId', '==', u.uid),
            orderBy('createdAt', 'desc')
          )
        );

        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ProductType[]);
      } catch (err) {
        console.error('Failed to load products:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const term = searchTerm.trim().toLowerCase();

      const matchesSearch =
        !term ||
        product.name?.toLowerCase().includes(term) ||
        product.description?.toLowerCase().includes(term) ||
        product.category?.toLowerCase().includes(term) ||
        product.sku?.toLowerCase().includes(term);

      const isActive = product.isActive !== false;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive);

      return matchesSearch && matchesStatus;
    });
  }, [products, searchTerm, statusFilter]);

  const productStats = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.isActive !== false).length;
    const inactive = products.filter((p) => p.isActive === false).length;

    return { total, active, inactive };
  }, [products]);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!user) {
      alert('Please sign in');
      return;
    }

    if (!form.name.trim()) {
      alert('Product or service name is required.');
      return;
    }

    if (!form.price.trim()) {
      alert('Price is required.');
      return;
    }

    const price = parseFloat(form.price);
    const vatRate = parseFloat(form.vatRate || '0');

    if (Number.isNaN(price) || price < 0) {
      alert('Please enter a valid price.');
      return;
    }

    if (Number.isNaN(vatRate) || vatRate < 0) {
      alert('Please enter a valid VAT rate.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        userId: user.uid,
        name: form.name.trim(),
        description: form.description.trim(),
        price,
        unit: form.unit.trim() || 'each',
        vatRate,
        category: form.category.trim() || 'General',
        sku: form.sku.trim(),
        isActive: form.isActive,
        updatedAt: Timestamp.now(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), payload);

        setProducts((prev) =>
          prev.map((product) =>
            product.id === editingId
              ? { ...product, ...payload }
              : product
          )
        );

        alert('Product updated!');
      } else {
        const fullPayload = {
          ...payload,
          createdAt: Timestamp.now(),
        };

        const ref = await addDoc(collection(db, 'products'), fullPayload);

        setProducts((prev) => [{ id: ref.id, ...fullPayload }, ...prev]);
        alert('Product added!');
      }

      resetForm();
    } catch (err: any) {
      console.error('Save product error:', err);
      alert('Failed to save product: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product: ProductType) => {
    setEditingId(product.id);
    setForm({
      name: product.name || '',
      description: product.description || '',
      price: String(product.price ?? ''),
      unit: product.unit || 'each',
      vatRate: String(product.vatRate ?? 15),
      category: product.category || 'General',
      sku: product.sku || '',
      isActive: product.isActive !== false,
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product/service?')) return;

    try {
      await deleteDoc(doc(db, 'products', productId));
      setProducts((prev) => prev.filter((product) => product.id !== productId));

      if (editingId === productId) {
        resetForm();
      }

      alert('Product deleted.');
    } catch (err: any) {
      console.error('Delete product error:', err);
      alert('Failed to delete product: ' + (err.message || 'Unknown error'));
    }
  };

  const handleToggleActive = async (product: ProductType) => {
    try {
      const nextValue = !(product.isActive !== false);

      await updateDoc(doc(db, 'products', product.id), {
        isActive: nextValue,
        updatedAt: Timestamp.now(),
      });

      setProducts((prev) =>
        prev.map((item) =>
          item.id === product.id
            ? { ...item, isActive: nextValue }
            : item
        )
      );
    } catch (err: any) {
      console.error('Toggle active error:', err);
      alert('Failed to update product status: ' + (err.message || 'Unknown error'));
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
        Loading products...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-emerald-400 truncate">
                RealQte
              </h1>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded whitespace-nowrap">
                SA
              </span>
            </div>

            <nav className="hidden xl:flex items-center gap-8 text-sm">
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
              <Link href="/products" className="text-emerald-400 font-medium">
                Products
              </Link>
              <Link href="/invoices" className="text-zinc-400 hover:text-white">
                Invoices
              </Link>
              <Link href="/customers" className="text-zinc-400 hover:text-white">
                Customers
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
              <button onClick={handleLogout} className="text-red-400 hover:underline">
                Logout
              </button>
            </nav>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="xl:hidden inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="xl:hidden mt-4 border-t border-zinc-800 pt-4">
              <div className="grid grid-cols-1 gap-2 text-sm">
                <Link
                  href="/"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Dashboard
                </Link>
                <Link
                  href="/new-invoice"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  New Invoice
                </Link>
                <Link
                  href="/new-quote"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  New Quote
                </Link>
                <Link
                  href="/quotes"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Quotes
                </Link>
                <Link
                  href="/products"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-emerald-400 bg-emerald-500/10 font-medium"
                >
                  Products
                </Link>
                <Link
                  href="/invoices"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Invoices
                </Link>
                <Link
                  href="/customers"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Customers
                </Link>
                <Link
                  href="/accounting"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Accounting
                </Link>
                <Link
                  href="/reporting"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Reports
                </Link>
                <Link
                  href="/profile"
                  onClick={closeMobileMenu}
                  className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-left rounded-xl px-3 py-2 text-red-400 hover:bg-zinc-800"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">Products & Services</h1>
            <p className="text-zinc-400">
              Save reusable products and services so you can add them quickly to quotes and invoices.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <Link
              href="/new-quote"
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white py-3 px-6 rounded-2xl font-medium w-full sm:w-auto"
            >
              New Quote
            </Link>
            <Link
              href="/new-invoice"
              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-6 rounded-2xl font-medium w-full sm:w-auto"
            >
              New Invoice
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Total items</p>
            <p className="text-4xl font-bold mt-2">{productStats.total}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Active items</p>
            <p className="text-4xl font-bold mt-2 text-emerald-400">{productStats.active}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">Inactive items</p>
            <p className="text-4xl font-bold mt-2 text-red-400">{productStats.inactive}</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 mb-8">
          <h2 className="text-2xl font-semibold mb-6">
            {editingId ? 'Edit Product / Service' : 'Add Product / Service'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Callout Fee"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Price</label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="e.g. 450"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Unit</label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="e.g. each, hour, day"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">VAT Rate %</label>
              <input
                type="number"
                step="0.01"
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
                placeholder="15"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Services, Materials"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">SKU / Code</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="Optional"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2 xl:col-span-3">
              <label className="block text-sm text-zinc-400 mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the product or service"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-h-[110px]"
              />
            </div>

            <div className="md:col-span-2 xl:col-span-3 flex items-center gap-3">
              <input
                id="isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-5 w-5"
              />
              <label htmlFor="isActive" className="text-zinc-300">
                Product/service is active
              </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 py-4 px-8 rounded-2xl font-bold"
            >
              {saving
                ? editingId
                  ? 'Saving Changes...'
                  : 'Adding Product...'
                : editingId
                  ? 'Save Changes'
                  : 'Add Product'}
            </button>

            {editingId && (
              <button
                onClick={resetForm}
                className="bg-zinc-700 hover:bg-zinc-600 py-4 px-8 rounded-2xl font-bold"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Search by name, description, category or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            >
              <option value="all">All Products</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center">
            <p className="text-zinc-500">No products or services found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => {
              const active = product.isActive !== false;

              return (
                <div
                  key={product.id}
                  className="bg-zinc-900 rounded-2xl p-4 border border-zinc-700 hover:bg-zinc-800 transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {product.name || 'Unnamed Product'}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {product.category || 'General'}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        active
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-zinc-300 mb-3">
                    <div className="flex justify-between">
                      <span>Price</span>
                      <span className="font-medium text-white">
                        R{parseFloat(String(product.price || 0)).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Unit</span>
                      <span>{product.unit || 'each'}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>VAT</span>
                      <span>{product.vatRate ?? 15}%</span>
                    </div>

                    <div className="flex justify-between">
                      <span>SKU</span>
                      <span>{product.sku || '—'}</span>
                    </div>
                  </div>

                  {product.description ? (
                    <div className="bg-zinc-800 rounded-xl p-3 text-xs text-zinc-300 mb-3 line-clamp-3">
                      {product.description}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleEdit(product)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl text-sm font-medium"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => handleToggleActive(product)}
                      className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2 rounded-xl text-sm font-medium"
                    >
                      {active ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      onClick={() => handleDelete(product.id)}
                      className="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-xl text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}