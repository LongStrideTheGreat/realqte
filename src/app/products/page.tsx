'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  getDocs,
  getDoc,
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
  currencyCode?: string;
  currencyLocale?: string;
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

type ProfileType = {
  currencyCode?: string;
  currencyLocale?: string;
};

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

function getCurrencyConfig(profile: ProfileType) {
  return {
    currencyCode: profile.currencyCode || 'ZAR',
    currencyLocale: profile.currencyLocale || 'en-ZA',
  };
}

function formatMoney(
  value: string | number | undefined,
  currencyCode = 'ZAR',
  currencyLocale = 'en-ZA'
) {
  const numeric = typeof value === 'number' ? value : Number(value || 0);

  try {
    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currencyCode} ${numeric.toFixed(2)}`;
  }
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

function formatProductMoney(product: ProductType, value: number | string | undefined, profile: ProfileType) {
  const fallback = getCurrencyConfig(profile);

  return formatMoney(
    value,
    product.currencyCode || fallback.currencyCode,
    product.currencyLocale || fallback.currencyLocale
  );
}

export default function ProductsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [saveMessage, setSaveMessage] = useState('');

  const [form, setForm] = useState<ProductFormType>(defaultForm);

  const { currencyCode, currencyLocale } = useMemo(
    () => getCurrencyConfig(profile),
    [profile]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/');
        return;
      }

      try {
        setUser(u);
        setMobileMenuOpen(false);

        const userSnap = await getDoc(doc(db, 'users', u.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          const incomingProfile = data.profile || {};
          setProfile({
            currencyCode: incomingProfile.currencyCode || 'ZAR',
            currencyLocale: incomingProfile.currencyLocale || 'en-ZA',
          });
        } else {
          setProfile({
            currencyCode: 'ZAR',
            currencyLocale: 'en-ZA',
          });
        }

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
  }, [form.itemType, form.category, form.unit]);

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
        currencyCode,
        currencyLocale,
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
      stockQty: itemType === 'product' ? String(product.stockQty ?? 0) : '',
      lowStockThreshold:
        itemType === 'product' ? String(product.lowStockThreshold ?? 5) : '5',
      trackInventory:
        itemType === 'product' ? product.trackInventory !== false : true,
      isActive: product.isActive !== false,
    });

    setSaveMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (productId: string, productName?: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${productName || 'this item'}?`
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'products', productId));
      setProducts((prev) => prev.filter((product) => product.id !== productId));
    } catch (err) {
      console.error('Delete product error:', err);
      alert('Failed to delete item.');
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

  const currentUnitOptions =
    form.itemType === 'service' ? serviceUnitOptions : productUnitOptions;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading products...
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
              {mobileMenuOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="xl:hidden mt-4 border-t border-zinc-800 pt-4">
              <div className="grid grid-cols-1 gap-2 text-sm">
                <Link href="/" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  Dashboard
                </Link>
                <Link href="/new-invoice" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  New Invoice
                </Link>
                <Link href="/new-quote" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  New Quote
                </Link>
                <Link href="/quotes" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  Quotes
                </Link>
                <Link href="/products" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-emerald-400 bg-emerald-500/10 font-medium">
                  Products
                </Link>
                <Link href="/invoices" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  Invoices
                </Link>
                <Link href="/customers" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  Customers
                </Link>
                <Link href="/accounting" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  Accounting
                </Link>
                <Link href="/reporting" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  Reports
                </Link>
                <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                  Profile
                </Link>
                <button onClick={handleLogout} className="text-left rounded-xl px-3 py-2 text-red-400 hover:bg-zinc-800">
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-8">
          <div>
            <p className="text-zinc-400 text-sm mb-2">Products & services</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">Products</h1>
            <p className="text-zinc-400 mt-2">
              Manage services, physical products, pricing, stock levels, and reusable quote items.
            </p>
          </div>

          <div className="text-sm text-zinc-400">
            Default product currency:{' '}
            <span className="text-white font-medium">
              {currencyCode} ({currencyLocale})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-500 text-xs">Total</p>
            <p className="text-2xl font-bold mt-2">{productStats.total}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-500 text-xs">Active</p>
            <p className="text-2xl font-bold mt-2 text-emerald-400">{productStats.active}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-500 text-xs">Inactive</p>
            <p className="text-2xl font-bold mt-2 text-zinc-300">{productStats.inactive}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-500 text-xs">Services</p>
            <p className="text-2xl font-bold mt-2 text-blue-400">{productStats.services}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-500 text-xs">Products</p>
            <p className="text-2xl font-bold mt-2 text-purple-400">{productStats.physicalProducts}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-500 text-xs">Low Stock</p>
            <p className="text-2xl font-bold mt-2 text-amber-400">{productStats.lowStock}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-zinc-500 text-xs">Out of Stock</p>
            <p className="text-2xl font-bold mt-2 text-red-400">{productStats.outOfStock}</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 mb-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                {editingId ? 'Edit Item' : 'Add New Item'}
              </h2>
              <p className="text-zinc-400 text-sm mt-2">
                Create a reusable service or product for quotes and invoices.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm font-medium"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {saveMessage && (
            <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {saveMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Item Type</label>
              <select
                value={form.itemType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    itemType: e.target.value as ItemTypeValue,
                  }))
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              >
                <option value="service">Service</option>
                <option value="product">Physical Product</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                placeholder="Item name"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Unit</label>
              <select
                value={form.unit}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
              >
                {currentUnitOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Selling Price</label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Cost Price</label>
              <input
                type="number"
                step="0.01"
                value={form.costPrice}
                onChange={(e) => setForm((prev) => ({ ...prev, costPrice: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">VAT Rate %</label>
              <input
                type="number"
                step="0.01"
                value={form.vatRate}
                onChange={(e) => setForm((prev) => ({ ...prev, vatRate: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                placeholder="15"
              />
            </div>

            <div className="flex items-end">
              <div className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-400">
                Currency: <span className="text-white">{currencyCode}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">SKU</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                placeholder="SKU"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Barcode</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm((prev) => ({ ...prev, barcode: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                placeholder="Barcode"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Stock Qty</label>
              <input
                type="number"
                step="0.01"
                value={form.stockQty}
                onChange={(e) => setForm((prev) => ({ ...prev, stockQty: e.target.value }))}
                disabled={form.itemType !== 'product' || !form.trackInventory}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white disabled:opacity-50"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Low Stock Threshold</label>
              <input
                type="number"
                step="0.01"
                value={form.lowStockThreshold}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, lowStockThreshold: e.target.value }))
                }
                disabled={form.itemType !== 'product' || !form.trackInventory}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white disabled:opacity-50"
                placeholder="5"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-zinc-400 mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-h-[110px] text-white"
              placeholder="Describe this item or service"
            />
          </div>

          <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.trackInventory}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, trackInventory: e.target.checked }))
                  }
                  disabled={form.itemType !== 'product'}
                />
                Track inventory
              </label>

              <label className="inline-flex items-center gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                />
                Active
              </label>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 py-3 px-8 rounded-2xl font-bold text-white"
            >
              {saving ? 'Saving...' : editingId ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Search by name, description, category, SKU or barcode"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Items</option>
              <option value="service">Services</option>
              <option value="product">Products</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center">
            <p className="text-zinc-500">No products found for the selected filters.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProducts.map((product) => {
              const stockBadge = getStockBadge(product);
              const itemType = product.itemType || 'service';
              const createdDate = toDate(product.createdAt);

              return (
                <div
                  key={product.id}
                  className="bg-zinc-900 rounded-3xl p-6 border border-zinc-700 hover:bg-zinc-800 transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {product.name || 'Untitled Item'}
                      </h3>
                      <p className="text-sm text-zinc-400 mt-1">
                        {product.category || (itemType === 'service' ? 'Services' : 'Products')}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${stockBadge.className}`}>
                        {stockBadge.label}
                      </span>

                      {product.isActive === false ? (
                        <span className="inline-flex items-center rounded-full bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300">
                          Inactive
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                          Active
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-zinc-300 mb-5">
                    <div className="flex justify-between gap-4">
                      <span>Selling Price</span>
                      <span className="font-medium text-white">
                        {formatProductMoney(product, product.price, profile)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Cost Price</span>
                      <span>
                        {formatProductMoney(product, product.costPrice, profile)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Unit</span>
                      <span>{product.unit || 'each'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>VAT</span>
                      <span>{Number(product.vatRate ?? 0)}%</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>SKU</span>
                      <span>{product.sku || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Barcode</span>
                      <span>{product.barcode || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Stock</span>
                      <span>
                        {itemType === 'product'
                          ? product.trackInventory === false
                            ? 'Not tracked'
                            : Number(product.stockQty ?? 0)
                          : 'Service'}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Created</span>
                      <span>{createdDate?.toLocaleDateString() || '—'}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span>Currency</span>
                      <span>{product.currencyCode || currencyCode}</span>
                    </div>
                  </div>

                  {product.description ? (
                    <div className="mb-5 rounded-2xl bg-zinc-800 px-4 py-3 text-sm text-zinc-300">
                      {product.description}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => handleEdit(product)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-2xl font-medium"
                    >
                      Edit Item
                    </button>

                    <button
                      onClick={() => handleDelete(product.id, product.name)}
                      className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-2xl font-medium"
                    >
                      Delete Item
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}