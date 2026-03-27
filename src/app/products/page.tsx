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

type ItemTypeValue = 'service' | 'product';

type ProductType = {
  id: string;
  userId?: string;
  itemType?: ItemTypeValue;
  name?: string;
  description?: string;
  price?: number;
  costPrice?: number;
  unit?: string;
  vatRate?: number;
  category?: string;
  sku?: string;
  barcode?: string;
  stockQty?: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
  isActive?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

type ProductFormType = {
  itemType: ItemTypeValue;
  name: string;
  description: string;
  price: string;
  costPrice: string;
  unit: string;
  vatRate: string;
  category: string;
  sku: string;
  barcode: string;
  stockQty: string;
  lowStockThreshold: string;
  trackInventory: boolean;
  isActive: boolean;
};

type StatusFilterValue =
  | 'all'
  | 'service'
  | 'product'
  | 'active'
  | 'inactive'
  | 'low_stock'
  | 'out_of_stock';

const defaultForm: ProductFormType = {
  itemType: 'service',
  name: '',
  description: '',
  price: '',
  costPrice: '',
  unit: 'each',
  vatRate: '15',
  category: 'Services',
  sku: '',
  barcode: '',
  stockQty: '',
  lowStockThreshold: '5',
  trackInventory: true,
  isActive: true,
};

const categoryOptions = [
  'Services',
  'Labour',
  'Materials',
  'Products',
  'Transport',
  'Rentals',
  'Maintenance',
  'Consulting',
  'General',
  'Other',
];

const serviceUnitOptions = ['each', 'hour', 'day', 'job', 'callout', 'session'];
const productUnitOptions = ['each', 'box', 'pack', 'metre', 'litre', 'kg'];

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

function formatMoney(value: string | number | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value || 0);
  return numeric.toFixed(2);
}

function isPhysicalProduct(product: ProductType) {
  return product.itemType === 'product';
}

function isLowStock(product: ProductType) {
  if (!isPhysicalProduct(product)) return false;
  if (product.trackInventory === false) return false;

  const qty = Number(product.stockQty || 0);
  const threshold = Number(product.lowStockThreshold ?? 5);

  return qty > 0 && qty <= threshold;
}

function isOutOfStock(product: ProductType) {
  if (!isPhysicalProduct(product)) return false;
  if (product.trackInventory === false) return false;

  const qty = Number(product.stockQty || 0);
  return qty <= 0;
}

function getStockBadge(product: ProductType) {
  if (!isPhysicalProduct(product)) {
    return {
      label: 'Service',
      className: 'bg-blue-500/20 text-blue-400',
    };
  }

  if (product.trackInventory === false) {
    return {
      label: 'Product',
      className: 'bg-purple-500/20 text-purple-400',
    };
  }

  if (isOutOfStock(product)) {
    return {
      label: 'Out of Stock',
      className: 'bg-red-500/20 text-red-400',
    };
  }

  if (isLowStock(product)) {
    return {
      label: 'Low Stock',
      className: 'bg-amber-500/20 text-amber-400',
    };
  }

  return {
    label: 'In Stock',
    className: 'bg-emerald-500/20 text-emerald-400',
  };
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
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [saveMessage, setSaveMessage] = useState('');

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

  useEffect(() => {
    if (form.itemType === 'service') {
      if (form.category === 'Products') {
        setForm((prev) => ({ ...prev, category: 'Services' }));
      }
      if (!serviceUnitOptions.includes(form.unit)) {
        setForm((prev) => ({ ...prev, unit: 'each' }));
      }
    } else {
      if (form.category === 'Services') {
        setForm((prev) => ({ ...prev, category: 'Products' }));
      }
      if (!productUnitOptions.includes(form.unit)) {
        setForm((prev) => ({ ...prev, unit: 'each' }));
      }
    }
  }, [form.itemType]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const term = searchTerm.trim().toLowerCase();

      const matchesSearch =
        !term ||
        product.name?.toLowerCase().includes(term) ||
        product.description?.toLowerCase().includes(term) ||
        product.category?.toLowerCase().includes(term) ||
        product.sku?.toLowerCase().includes(term) ||
        product.barcode?.toLowerCase().includes(term);

      const isActive = product.isActive !== false;
      const itemType = product.itemType || 'service';

      const matchesFilter =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive) ||
        (statusFilter === 'service' && itemType === 'service') ||
        (statusFilter === 'product' && itemType === 'product') ||
        (statusFilter === 'low_stock' && isLowStock(product)) ||
        (statusFilter === 'out_of_stock' && isOutOfStock(product));

      return matchesSearch && matchesFilter;
    });
  }, [products, searchTerm, statusFilter]);

  const productStats = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.isActive !== false).length;
    const inactive = products.filter((p) => p.isActive === false).length;
    const services = products.filter((p) => (p.itemType || 'service') === 'service').length;
    const physicalProducts = products.filter((p) => p.itemType === 'product').length;
    const lowStock = products.filter((p) => isLowStock(p)).length;
    const outOfStock = products.filter((p) => isOutOfStock(p)).length;

    return {
      total,
      active,
      inactive,
      services,
      physicalProducts,
      lowStock,
      outOfStock,
    };
  }, [products]);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setSaveMessage('');
  };

  const handleSave = async () => {
    if (!user) {
      alert('Please sign in');
      return;
    }

    if (!form.name.trim()) {
      alert('Item name is required.');
      return;
    }

    if (!form.price.trim()) {
      alert('Selling price is required.');
      return;
    }

    const price = parseFloat(form.price);
    const costPrice = form.costPrice.trim() ? parseFloat(form.costPrice) : 0;
    const vatRate = parseFloat(form.vatRate || '0');
    const stockQty = form.stockQty.trim() ? parseFloat(form.stockQty) : 0;
    const lowStockThreshold = form.lowStockThreshold.trim()
      ? parseFloat(form.lowStockThreshold)
      : 5;

    if (Number.isNaN(price) || price < 0) {
      alert('Please enter a valid selling price.');
      return;
    }

    if (form.costPrice.trim() && (Number.isNaN(costPrice) || costPrice < 0)) {
      alert('Please enter a valid cost price.');
      return;
    }

    if (Number.isNaN(vatRate) || vatRate < 0) {
      alert('Please enter a valid VAT rate.');
      return;
    }

    if (
      form.itemType === 'product' &&
      form.trackInventory &&
      (Number.isNaN(stockQty) || stockQty < 0)
    ) {
      alert('Please enter a valid stock quantity.');
      return;
    }

    if (
      form.itemType === 'product' &&
      form.trackInventory &&
      (Number.isNaN(lowStockThreshold) || lowStockThreshold < 0)
    ) {
      alert('Please enter a valid low stock threshold.');
      return;
    }

    try {
      setSaving(true);
      setSaveMessage('');

      const payload = {
        userId: user.uid,
        itemType: form.itemType,
        name: form.name.trim(),
        description: form.description.trim(),
        price,
        costPrice: form.costPrice.trim() ? costPrice : 0,
        unit: form.unit.trim() || 'each',
        vatRate,
        category:
          form.category.trim() || (form.itemType === 'service' ? 'Services' : 'Products'),
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        stockQty: form.itemType === 'product' ? stockQty : 0,
        lowStockThreshold: form.itemType === 'product' ? lowStockThreshold : 0,
        trackInventory: form.itemType === 'product' ? form.trackInventory : false,
        isActive: form.isActive,
        updatedAt: Timestamp.now(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), payload);

        setProducts((prev) =>
          prev.map((product) =>
            product.id === editingId ? { ...product, ...payload } : product
          )
        );

        setSaveMessage('Item updated successfully.');
      } else {
        const fullPayload = {
          ...payload,
          createdAt: Timestamp.now(),
        };

        const ref = await addDoc(collection(db, 'products'), fullPayload);

        setProducts((prev) => [{ id: ref.id, ...fullPayload }, ...prev]);
        setSaveMessage('Item added successfully.');
      }

      resetForm();
    } catch (err: any) {
      console.error('Save product error:', err);
      alert('Failed to save item: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product: ProductType) => {
    const itemType = product.itemType || 'service';

    setEditingId(product.id);
    setForm({
      itemType,
      name: product.name || '',
      description: product.description || '',
      price: String(product.price ?? ''),
      costPrice:
        product.costPrice !== undefined && product.costPrice !== null
          ? String(product.costPrice)
          : '',
      unit: product.unit || 'each',
      vatRate: String(product.vatRate ?? 15),
      category:
        product.category || (itemType === 'service' ? 'Services' : 'Products'),
      sku: product.sku || '',
      barcode: product.barcode || '',
      stockQty:
        itemType === 'product' ? String(product.stockQty ?? 0) : '',
      lowStockThreshold:
        itemType === 'product' ? String(product.lowStockThreshold ?? 5) : '5',
      trackInventory:
        itemType === 'product' ? product.trackInventory !== false : false,
      isActive: product.isActive !== false,
    });

    setSaveMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await deleteDoc(doc(db, 'products', productId));
      setProducts((prev) => prev.filter((product) => product.id !== productId));

      if (editingId === productId) {
        resetForm();
      }
    } catch (err: any) {
      console.error('Delete product error:', err);
      alert('Failed to delete item: ' + (err.message || 'Unknown error'));
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
          item.id === product.id ? { ...item, isActive: nextValue } : item
        )
      );
    } catch (err: any) {
      console.error('Toggle active error:', err);
      alert('Failed to update item status: ' + (err.message || 'Unknown error'));
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

  const unitOptions = form.itemType === 'service' ? serviceUnitOptions : productUnitOptions;

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
            <p className="text-zinc-400 max-w-3xl">
              Manage services and physical products separately. Track stock for physical items,
              save repeat-use services, and reuse everything quickly in quotes and invoices.
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

        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-400 text-xs uppercase tracking-wide">Total</p>
            <p className="text-3xl font-bold mt-2">{productStats.total}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-400 text-xs uppercase tracking-wide">Services</p>
            <p className="text-3xl font-bold mt-2 text-blue-400">{productStats.services}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-400 text-xs uppercase tracking-wide">Products</p>
            <p className="text-3xl font-bold mt-2 text-purple-400">{productStats.physicalProducts}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-400 text-xs uppercase tracking-wide">Active</p>
            <p className="text-3xl font-bold mt-2 text-emerald-400">{productStats.active}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-400 text-xs uppercase tracking-wide">Low Stock</p>
            <p className="text-3xl font-bold mt-2 text-amber-400">{productStats.lowStock}</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-400 text-xs uppercase tracking-wide">Out of Stock</p>
            <p className="text-3xl font-bold mt-2 text-red-400">{productStats.outOfStock}</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
            <div>
              <h2 className="text-2xl font-semibold">
                {editingId ? 'Edit Item' : 'Add New Item'}
              </h2>
              <p className="text-zinc-400 mt-2">
                Choose whether this is a service or a physical stocked product, then fill in only
                the fields that matter.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    itemType: 'service',
                    category:
                      prev.category === 'Products' ? 'Services' : prev.category || 'Services',
                    unit: serviceUnitOptions.includes(prev.unit) ? prev.unit : 'each',
                    trackInventory: false,
                  }))
                }
                className={`px-5 py-3 rounded-2xl font-medium ${
                  form.itemType === 'service'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                Service
              </button>

              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    itemType: 'product',
                    category:
                      prev.category === 'Services' ? 'Products' : prev.category || 'Products',
                    unit: productUnitOptions.includes(prev.unit) ? prev.unit : 'each',
                    trackInventory: true,
                  }))
                }
                className={`px-5 py-3 rounded-2xl font-medium ${
                  form.itemType === 'product'
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                Physical Product
              </button>
            </div>
          </div>

          {saveMessage ? (
            <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-300">
              {saveMessage}
            </div>
          ) : null}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5">
                <h3 className="text-lg font-semibold mb-4">Basic Info</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-sm text-zinc-400 mb-2">Item Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder={
                        form.itemType === 'service'
                          ? 'e.g. Callout Fee'
                          : 'e.g. Safety Gloves'
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    >
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      {form.itemType === 'service' ? 'Billing Unit' : 'Unit'}
                    </label>
                    <select
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    >
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm text-zinc-400 mb-2">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe the item, scope, contents, or work included"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-h-[120px]"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5">
                <h3 className="text-lg font-semibold mb-4">Pricing</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Selling Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      placeholder="0.00"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Cost Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.costPrice}
                      onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                      placeholder="Optional"
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
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {form.itemType === 'product' && (
                <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h3 className="text-lg font-semibold">Inventory</h3>
                    <label className="flex items-center gap-3 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={form.trackInventory}
                        onChange={(e) =>
                          setForm({ ...form, trackInventory: e.target.checked })
                        }
                        className="h-4 w-4"
                      />
                      Track inventory
                    </label>
                  </div>

                  {form.trackInventory ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm text-zinc-400 mb-2">Stock Quantity</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={form.stockQty}
                          onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
                          placeholder="0"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-zinc-400 mb-2">
                          Low Stock Threshold
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={form.lowStockThreshold}
                          onChange={(e) =>
                            setForm({ ...form, lowStockThreshold: e.target.value })
                          }
                          placeholder="5"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-zinc-800/80 border border-zinc-700 p-4 text-sm text-zinc-400">
                      Inventory tracking is off for this product. It will behave like a non-stocked
                      product but still remain a physical item.
                    </div>
                  )}
                </div>
              )}

              <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5">
                <h3 className="text-lg font-semibold mb-4">Codes & Status</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Barcode</label>
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      placeholder="Optional"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
                    />
                  </div>

                  <div className="md:col-span-2 flex items-center gap-3">
                    <input
                      id="isActive"
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="h-5 w-5"
                    />
                    <label htmlFor="isActive" className="text-zinc-300">
                      Item is active and available for quotes/invoices
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5">
                <h3 className="text-lg font-semibold mb-4">Preview</h3>

                <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {form.name || 'Item Name'}
                      </div>
                      <div className="text-sm text-zinc-400 mt-1">
                        {form.itemType === 'service' ? 'Service' : 'Physical Product'} •{' '}
                        {form.category || 'General'}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                        form.itemType === 'service'
                          ? 'bg-blue-500/20 text-blue-400'
                          : form.trackInventory
                          ? Number(form.stockQty || 0) <= 0
                            ? 'bg-red-500/20 text-red-400'
                            : Number(form.stockQty || 0) <= Number(form.lowStockThreshold || 5)
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}
                    >
                      {form.itemType === 'service'
                        ? 'Service'
                        : form.trackInventory
                        ? Number(form.stockQty || 0) <= 0
                          ? 'Out of Stock'
                          : Number(form.stockQty || 0) <= Number(form.lowStockThreshold || 5)
                          ? 'Low Stock'
                          : 'In Stock'
                        : 'Product'}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-zinc-300">
                    <div className="flex justify-between">
                      <span>Selling Price</span>
                      <span className="text-white font-medium">
                        R{formatMoney(form.price || 0)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Unit</span>
                      <span>{form.unit || 'each'}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>VAT</span>
                      <span>{form.vatRate || '15'}%</span>
                    </div>

                    {form.itemType === 'product' && (
                      <div className="flex justify-between">
                        <span>Stock</span>
                        <span>{form.trackInventory ? form.stockQty || '0' : 'Not tracked'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                  : 'Saving Item...'
                : editingId
                ? 'Save Changes'
                : 'Save Item'}
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
          <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4">
            <input
              type="text"
              placeholder="Search by name, description, category, SKU or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3"
            >
              <option value="all">All Items</option>
              <option value="service">Services Only</option>
              <option value="product">Products Only</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center">
            <p className="text-zinc-500">No matching items found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredProducts.map((product) => {
              const active = product.isActive !== false;
              const stockBadge = getStockBadge(product);
              const createdDate = toDate(product.createdAt);

              return (
                <div
                  key={product.id}
                  className="bg-zinc-900 rounded-3xl p-5 border border-zinc-700 hover:bg-zinc-800 transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {product.name || 'Unnamed Item'}
                      </div>
                      <div className="text-sm text-zinc-400 mt-1">
                        {(product.category || 'General')} •{' '}
                        {product.itemType === 'product' ? 'Physical Product' : 'Service'}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${stockBadge.className}`}
                      >
                        {stockBadge.label}
                      </span>

                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                          active
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-zinc-300 mb-4">
                    <div className="flex justify-between gap-4">
                      <span>Selling Price</span>
                      <span className="font-medium text-white">
                        R{formatMoney(product.price)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Cost Price</span>
                      <span>{product.costPrice ? `R${formatMoney(product.costPrice)}` : '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Unit</span>
                      <span>{product.unit || 'each'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>VAT</span>
                      <span>{product.vatRate ?? 15}%</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>SKU</span>
                      <span>{product.sku || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Barcode</span>
                      <span>{product.barcode || '—'}</span>
                    </div>

                    {product.itemType === 'product' && (
                      <>
                        <div className="flex justify-between gap-4">
                          <span>Inventory</span>
                          <span>{product.trackInventory === false ? 'Off' : 'On'}</span>
                        </div>

                        <div className="flex justify-between gap-4">
                          <span>Stock Qty</span>
                          <span>
                            {product.trackInventory === false
                              ? 'Not tracked'
                              : Number(product.stockQty || 0)}
                          </span>
                        </div>

                        <div className="flex justify-between gap-4">
                          <span>Low Stock At</span>
                          <span>
                            {product.trackInventory === false
                              ? '—'
                              : Number(product.lowStockThreshold ?? 5)}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between gap-4">
                      <span>Created</span>
                      <span>{createdDate?.toLocaleDateString() || '—'}</span>
                    </div>
                  </div>

                  {product.description ? (
                    <div className="bg-zinc-800 rounded-2xl p-3 text-sm text-zinc-300 mb-4 line-clamp-3">
                      {product.description}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleEdit(product)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => handleToggleActive(product)}
                      className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-2.5 rounded-xl text-sm font-medium"
                    >
                      {active ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      onClick={() => handleDelete(product.id)}
                      className="w-full bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium"
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