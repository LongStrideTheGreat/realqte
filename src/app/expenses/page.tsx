'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import AppHeader from '@/components/AppHeader';

type ExpenseType = {
  id: string;
  userId?: string;
  amount: number;
  category: string;
  description?: string;
  date?: string;
  createdAt: any;
};

type ProfileType = {
  currencyCode?: string;
  currencyLocale?: string;
};

function formatMoney(value: string | number | undefined, currencyCode = 'ZAR', currencyLocale = 'en-ZA') {
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

// Preset foundational expense category structures
const EXPENSE_CATEGORIES = [
  'Overhead & Rent',
  'Software & SaaS Subscriptions',
  'Inventory & Materials',
  'Logistics & Transport',
  'Marketing & Advertising',
  'Equipment & Hardware',
  'Salaries & Contractor Fees',
  'Licensing & Certifications',
  'Other Operational Costs'
];

export default function ExpensesManagement() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileType>({});
  const [expenses, setExpenses] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search and filter interactions layout matrix
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');

  // Interactive Form Inputs Model Block
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  const currencyCode = profile.currencyCode || 'ZAR';
  const currencyLocale = profile.currencyLocale || 'en-ZA';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/');
        return;
      }
      try {
        setUser(u);
        const userSnap = await getDoc(doc(db, 'users', u.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          const incomingProfile = data.profile || {};
          setProfile({
            currencyCode: incomingProfile.currencyCode || 'ZAR',
            currencyLocale: incomingProfile.currencyLocale || 'en-ZA',
          });
        } else {
          setProfile({ currencyCode: 'ZAR', currencyLocale: 'en-ZA' });
        }

        // Fetch core user expenses aligned structurally with reporting queries
        const expSnap = await getDocs(query(collection(db, 'expenses'), where('userId', '==', u.uid), orderBy('createdAt', 'desc')));
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseType[]);
      } catch (err) {
        console.error('Failed to resolve data layer expenditures ledger:', err);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [router]);

  // Handle addition of explicit new business overhead entries
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !amount || parseFloat(amount) <= 0) return;

    setIsSubmitting(true);
    try {
      const payload = {
        userId: user.uid,
        amount: parseFloat(amount),
        category,
        description: description.trim(),
        date: expenseDate,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'expenses'), payload);
      
      // Update local matrix instantly without requiring complete network reload roundtrips
      setExpenses((prev) => [{ id: docRef.id, ...payload, createdAt: new Date() }, ...prev]);
      
      // Clear inputs completely
      setAmount('');
      setDescription('');
      setExpenseDate(new Date().toISOString().split('T')[0]);
    } catch (err) {
      console.error('Error committing cost allocation matrix:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe removal transaction block targeting individual line records
  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you certain you wish to purge this expense item entry from your operational balance records?')) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
      setExpenses((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Purge transaction failure on expenditure record:', err);
    }
  };

  // Memoized aggregation performance blocks
  const totalCostOverhead = useMemo(() => {
    return expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch = (e.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                            e.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategoryFilter === 'All' || e.category === selectedCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, searchQuery, selectedCategoryFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-sm font-medium text-zinc-400">
        Assembling operational cost matrices...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden antialiased">
      <AppHeader user={user} setupComplete={true} onLogout={async () => { await signOut(auth); router.push('/'); }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* INTERACTIVE NAVIGATION CONTROL TABS */}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => router.push('/reports')} className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-zinc-400 border border-zinc-800/80 hover:text-white transition">
            📊 Operational Dashboard
          </button>
          <button className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 pointer-events-none">
            💸 Expenditures Ledger
          </button>
        </div>

        {/* TITLE HEADER BRAND LINE */}
        <div className="pb-6 border-b border-zinc-900 mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Expenses & Overheads</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Log expenditures, monitor operational outflows, and review deductible corporate runway records.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 shrink-0 shadow-lg min-w-[220px]">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Monitored Outflows</p>
            <p className="text-2xl font-black text-amber-400 mt-1">{formatMoney(totalCostOverhead, currencyCode, currencyLocale)}</p>
          </div>
        </div>

        {/* TWO-COLUMN MATRIX INTERFACE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start w-full">
          
          {/* COLUMN 1: INTERACTIVE MANUAL ENTRY WRAP BLOCK */}
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-xl space-y-5 lg:sticky lg:top-6">
            <div>
              <h3 className="text-base font-bold text-zinc-100">Record Expenditure</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Manually include outbound resource costs or fixed overhead accounts.</p>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Amount Paid ({currencyCode})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-600 font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Cost Allocation Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-600 font-semibold cursor-pointer"
                >
                  {EXPENSE_CATEGORIES.map((cat, idx) => (
                    <option key={idx} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Transaction Date</label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-600 font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Description / Supplier Note</label>
                <textarea
                  placeholder="e.g., Office Rent, Server Hosting Fees, Diesel Allocation..."
                  maxLength={180}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-600 placeholder-zinc-600 leading-relaxed resize-none font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-zinc-100 text-zinc-950 font-bold text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition hover:bg-zinc-200 active:scale-[0.99] disabled:opacity-50 shadow-md"
              >
                {isSubmitting ? 'Logging entry...' : 'Commit Outflow Entry'}
              </button>
            </form>
          </div>

          {/* COLUMN 2 & 3: HISTORICAL TRANSACTION LEDGER VIEWPORTS */}
          <div className="lg:col-span-2 space-y-6 w-full">
            
            {/* LEDGER SEARCH & SELECTION FILTERS CONTROLS ROW */}
            <div className="flex flex-col sm:flex-row gap-3 items-center w-full">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="Filter records via note text or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800/80 text-white placeholder-zinc-500 rounded-xl pl-4 pr-10 py-3 text-xs font-medium focus:outline-none focus:border-zinc-700"
                />
              </div>

              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="w-full sm:w-64 bg-zinc-900 border border-zinc-800/80 text-white rounded-xl px-4 py-3 text-xs font-bold cursor-pointer focus:outline-none focus:border-zinc-700"
              >
                <option value="All">All Categories</option>
                {EXPENSE_CATEGORIES.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* EXPENSE LEDGER LOOP LIST */}
            {filteredExpenses.length === 0 ? (
              <div className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-12 text-center">
                <p className="text-zinc-500 text-sm font-medium">No matching expenditure ledger records detected.</p>
              </div>
            ) : (
              <div className="space-y-2.5 w-full">
                {filteredExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-zinc-900/60 border border-zinc-900/80 rounded-xl px-5 py-4 hover:border-zinc-800/60 transition-all gap-4 w-full group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-zinc-950 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md">
                          {exp.category}
                        </span>
                        <span className="text-zinc-500 font-mono text-[10px]">
                          {exp.date || new Date(exp.createdAt?.seconds * 1000).toISOString().split('T')[0]}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-zinc-200 truncate pr-4">
                        {exp.description || <span className="text-zinc-600 italic">No supplemental context provided.</span>}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 border-t border-zinc-900 pt-3 sm:pt-0 sm:border-0">
                      <span className="text-zinc-100 font-extrabold text-sm sm:text-base">
                        {formatMoney(exp.amount, currencyCode, currencyLocale)}
                      </span>
                      
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="text-zinc-600 hover:text-red-400 text-xs font-bold uppercase tracking-wider p-2 rounded-lg transition-colors bg-zinc-950/40 border border-zinc-900 sm:opacity-0 group-hover:opacity-100"
                        title="Remove expense line"
                      >
                        Purge
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}