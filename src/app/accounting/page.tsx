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
  Timestamp,
  addDoc,
  doc,
  getDoc,
} from 'firebase/firestore';

type DocumentType = {
  id: string;
  userId?: string;
  type?: string;
  number?: string;
  client?: string;
  clientEmail?: string;
  total?: string;
  createdAt?: any;
  status?: string;
  paymentStatus?: string;
  paid?: boolean;
};

type ExpenseType = {
  id: string;
  userId?: string;
  description?: string;
  amount?: number | string;
  date?: string;
  category?: string;
  createdAt?: any;
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

function isSubscriptionActive(data: any) {
  const expiresAt = toDate(data?.proExpiresAt);
  const status = String(data?.subscriptionStatus || '').toLowerCase();
  const blockedStatuses = ['cancelled', 'canceled', 'inactive', 'paused'];

  return (
    Boolean(data?.isPro) &&
    !!expiresAt &&
    expiresAt.getTime() > Date.now() &&
    !blockedStatuses.includes(status)
  );
}

function isInvoicePaid(documentItem: DocumentType) {
  return (
    documentItem.paid === true ||
    String(documentItem.paymentStatus || '').toLowerCase() === 'paid' ||
    String(documentItem.status || '').toLowerCase() === 'paid'
  );
}

export default function Accounting() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [expenses, setExpenses] = useState<ExpenseType[]>([]);
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'month'>('all');
  const [addingExpense, setAddingExpense] = useState(false);

  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'General',
  });

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
          setIsPro(isSubscriptionActive(data));
        }

        const docsSnap = await getDocs(
          query(
            collection(db, 'documents'),
            where('userId', '==', u.uid),
            orderBy('createdAt', 'desc')
          )
        );
        setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as DocumentType[]);

        const expSnap = await getDocs(
          query(
            collection(db, 'expenses'),
            where('userId', '==', u.uid),
            orderBy('createdAt', 'desc')
          )
        );
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpenseType[]);
      } catch (err) {
        console.error('Accounting page load error:', err);
      }
    });

    return unsubscribe;
  }, [router]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const invoiceDocs = useMemo(
    () => documents.filter((d) => d.type === 'invoice'),
    [documents]
  );

  const quoteDocs = useMemo(
    () => documents.filter((d) => d.type === 'quote'),
    [documents]
  );

  const monthlyInvoices = useMemo(() => {
    return invoiceDocs.filter((d) => {
      const dDate = toDate(d.createdAt);
      return (
        dDate &&
        dDate.getMonth() === currentMonth &&
        dDate.getFullYear() === currentYear
      );
    });
  }, [invoiceDocs, currentMonth, currentYear]);

  const monthlyQuotes = useMemo(() => {
    return quoteDocs.filter((d) => {
      const dDate = toDate(d.createdAt);
      return (
        dDate &&
        dDate.getMonth() === currentMonth &&
        dDate.getFullYear() === currentYear
      );
    });
  }, [quoteDocs, currentMonth, currentYear]);

  const monthlyInvoiced = monthlyInvoices.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const monthlyQuoted = monthlyQuotes.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const paidInvoices = invoiceDocs.filter((d) => isInvoicePaid(d));
  const unpaidInvoices = invoiceDocs.filter((d) => !isInvoicePaid(d));

  const paidRevenue = paidInvoices.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const outstandingValue = unpaidInvoices.reduce(
    (sum, d) => sum + parseFloat(d.total || '0'),
    0
  );

  const outstandingCount = unpaidInvoices.length;

  const monthlyExpenses = expenses.filter((e) => {
    const expenseDate = e.date ? new Date(e.date) : toDate(e.createdAt);
    return (
      expenseDate &&
      expenseDate.getMonth() === currentMonth &&
      expenseDate.getFullYear() === currentYear
    );
  });

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + parseFloat(String(e.amount || 0)),
    0
  );

  const expensesThisMonth = monthlyExpenses.reduce(
    (sum, e) => sum + parseFloat(String(e.amount || 0)),
    0
  );

  const netProfitThisMonth = monthlyInvoiced - expensesThisMonth;

  const filteredExpenses = useMemo(() => {
    if (expenseFilter === 'all') return expenses;
    return monthlyExpenses;
  }, [expenseFilter, expenses, monthlyExpenses]);

  const expenseCategories = useMemo(() => {
    const map = new Map<string, number>();

    expenses.forEach((expense) => {
      const category = expense.category || 'General';
      const amount = parseFloat(String(expense.amount || 0));
      map.set(category, (map.get(category) || 0) + amount);
    });

    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const recentFinancialActivity = useMemo(() => {
    const invoiceActivity = invoiceDocs.slice(0, 5).map((doc) => ({
      id: doc.id,
      kind: 'invoice' as const,
      label: doc.number || 'Invoice',
      name: doc.client || 'Unknown Client',
      amount: parseFloat(doc.total || '0'),
      date: toDate(doc.createdAt),
      paid: isInvoicePaid(doc),
    }));

    const expenseActivity = expenses.slice(0, 5).map((expense) => ({
      id: expense.id,
      kind: 'expense' as const,
      label: expense.description || 'Expense',
      name: expense.category || 'General',
      amount: parseFloat(String(expense.amount || 0)),
      date: expense.date ? new Date(expense.date) : toDate(expense.createdAt),
      paid: false,
    }));

    return [...invoiceActivity, ...expenseActivity]
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
      .slice(0, 8);
  }, [invoiceDocs, expenses]);

  const addExpense = async () => {
    if (!user) {
      alert('Please sign in');
      return;
    }

    if (!newExpense.description.trim() || !newExpense.amount || !newExpense.date) {
      alert('Please complete description, amount and date.');
      return;
    }

    try {
      setAddingExpense(true);

      const payload = {
        userId: user.uid,
        description: newExpense.description.trim(),
        amount: parseFloat(newExpense.amount),
        date: newExpense.date,
        category: newExpense.category || 'General',
        createdAt: Timestamp.now(),
      };

      const ref = await addDoc(collection(db, 'expenses'), payload);

      setExpenses((prev) => [{ id: ref.id, ...payload }, ...prev]);
      setNewExpense({
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'General',
      });

      alert('Expense added!');
    } catch (err: any) {
      console.error('Add expense error:', err);
      alert('Failed to add expense: ' + (err.message || 'Unknown error'));
    } finally {
      setAddingExpense(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-emerald-400">RealQte</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
              SA
            </span>
          </div>

          <div className="flex items-center gap-8 text-sm">
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
            <Link href="/products" className="text-zinc-400 hover:text-white">
  Products
</Link>
            <Link href="/invoices" className="text-zinc-400 hover:text-white">
              Invoices
            </Link>
            <Link href="/customers" className="text-zinc-400 hover:text-white">
              Customers
            </Link>
            <Link href="/accounting" className="text-emerald-400 font-medium">
              Accounting
            </Link>
            <Link href="/reporting" className="text-zinc-400 hover:text-white">
              Reports
            </Link>
            <Link href="/profile" className="text-zinc-400 hover:text-white">
              Profile
            </Link>
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Accounting</h1>
          <p className="text-zinc-400">
            Track revenue, expenses, cash flow, and outstanding invoice performance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Invoiced this month</p>
            <p className="text-5xl font-bold text-emerald-400 mt-2">
              R{monthlyInvoiced.toFixed(2)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Quoted this month</p>
            <p className="text-5xl font-bold text-blue-400 mt-2">
              R{monthlyQuoted.toFixed(2)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Expenses this month</p>
            <p className="text-5xl font-bold text-orange-400 mt-2">
              R{expensesThisMonth.toFixed(2)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Net this month</p>
            <p
              className={`text-5xl font-bold mt-2 ${
                netProfitThisMonth >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              R{netProfitThisMonth.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Paid revenue</p>
            <p className="text-4xl font-bold text-emerald-400 mt-2">
              R{paidRevenue.toFixed(2)}
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Outstanding invoice value</p>
            <p className="text-4xl font-bold text-red-400 mt-2">
              R{outstandingValue.toFixed(2)}
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Total expenses recorded</p>
            <p className="text-4xl font-bold text-white mt-2">
              R{totalExpenses.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6 mb-12">
          <Link
            href="/outstanding-invoices"
            className="flex-1 bg-red-600 hover:bg-red-500 text-white py-5 rounded-2xl text-xl font-bold text-center"
          >
            View Outstanding Invoices ({outstandingCount})
          </Link>

          <Link
            href="/invoices"
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl text-xl font-bold text-center"
          >
            View All Invoices
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
          <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
            <h3 className="text-2xl font-semibold text-white mb-6">Expense Tracking</h3>

            {!isPro ? (
              <button
                onClick={() =>
                  alert('Expense tracking is a Pro feature – upgrade for R35/month!')
                }
                className="bg-zinc-700 hover:bg-zinc-600 py-4 px-10 rounded-2xl text-lg font-medium text-white"
              >
                Pro Feature: Add Expenses
              </button>
            ) : (
              <>
                <div className="grid md:grid-cols-4 gap-4 mb-8">
                  <input
                    type="text"
                    placeholder="Description"
                    value={newExpense.description}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, description: e.target.value })
                    }
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
                  />

                  <input
                    type="number"
                    placeholder="Amount"
                    value={newExpense.amount}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, amount: e.target.value })
                    }
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
                  />

                  <input
                    type="date"
                    value={newExpense.date}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, date: e.target.value })
                    }
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                  />

                  <select
                    value={newExpense.category}
                    onChange={(e) =>
                      setNewExpense({ ...newExpense, category: e.target.value })
                    }
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                  >
                    <option value="General">General</option>
                    <option value="Fuel">Fuel</option>
                    <option value="Supplies">Supplies</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Transport">Transport</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Software">Software</option>
                    <option value="Rent">Rent</option>
                    <option value="Phone/Internet">Phone/Internet</option>
                  </select>
                </div>

                <button
                  onClick={addExpense}
                  disabled={addingExpense}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 py-3 px-8 rounded-2xl font-bold text-white mb-8"
                >
                  {addingExpense ? 'Adding Expense...' : 'Add Expense'}
                </button>

                <div className="flex gap-3 mb-6">
                  <button
                    onClick={() => setExpenseFilter('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium ${
                      expenseFilter === 'all'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    All Expenses
                  </button>
                  <button
                    onClick={() => setExpenseFilter('month')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium ${
                      expenseFilter === 'month'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    This Month
                  </button>
                </div>

                <div className="space-y-4">
                  {filteredExpenses.length === 0 ? (
                    <p className="text-zinc-500 text-center py-10">No expenses found</p>
                  ) : (
                    filteredExpenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="bg-zinc-800 p-6 rounded-3xl flex justify-between items-center"
                      >
                        <div>
                          <div className="font-medium text-white">
                            {exp.description}
                          </div>
                          <div className="text-sm text-zinc-300">
                            {(exp.category || 'General')} • R
                            {parseFloat(String(exp.amount || 0)).toFixed(2)} •{' '}
                            {(exp.date
                              ? new Date(exp.date)
                              : toDate(exp.createdAt)
                            )?.toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
            <h3 className="text-2xl font-semibold text-white mb-6">Expense Categories</h3>

            {!isPro ? (
              <p className="text-zinc-500">Upgrade to Pro to unlock expense breakdowns.</p>
            ) : expenseCategories.length === 0 ? (
              <p className="text-zinc-500">No expense categories yet.</p>
            ) : (
              <div className="space-y-4">
                {expenseCategories.map((item) => (
                  <div
                    key={item.category}
                    className="bg-zinc-800 rounded-2xl p-5 flex justify-between items-center"
                  >
                    <span className="text-white font-medium">{item.category}</span>
                    <span className="text-zinc-300">R{item.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800">
          <h3 className="text-2xl font-semibold text-white mb-6">Recent Financial Activity</h3>

          {recentFinancialActivity.length === 0 ? (
            <p className="text-zinc-500 text-center py-10">No financial activity yet</p>
          ) : (
            <div className="space-y-4">
              {recentFinancialActivity.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  className="bg-zinc-800 rounded-2xl p-5 flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium text-white">
                      {item.kind === 'invoice' ? item.label : item.label}
                    </div>
                    <div className="text-sm text-zinc-300">
                      {item.kind === 'invoice'
                        ? `${item.name} • ${item.paid ? 'Paid Invoice' : 'Unpaid Invoice'}`
                        : `${item.name} • Expense`}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {item.date?.toLocaleDateString()}
                    </div>
                  </div>

                  <div
                    className={`font-bold ${
                      item.kind === 'invoice'
                        ? item.paid
                          ? 'text-emerald-400'
                          : 'text-red-400'
                        : 'text-orange-400'
                    }`}
                  >
                    {item.kind === 'expense' ? '-' : ''}R{item.amount.toFixed(2)}
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