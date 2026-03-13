'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, query, where, orderBy, Timestamp, addDoc, doc, getDoc } from 'firebase/firestore';

export default function Accounting() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [newExpense, setNewExpense] = useState({ description: '', amount: '', date: '' });

  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push('/');
      setUser(u);

      const userSnap = await getDoc(doc(db, 'users', u.uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        setIsPro(data.isPro || false);
      }

      const docsSnap = await getDocs(query(collection(db, 'documents'), where('userId', '==', u.uid), orderBy('createdAt', 'desc')));
      setDocuments(docsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const expSnap = await getDocs(query(collection(db, 'expenses'), where('userId', '==', u.uid), orderBy('createdAt', 'desc')));
      setExpenses(expSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [router]);

  // Monthly totals
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyInvoiced = documents
    .filter(d => {
      const dDate = new Date(d.createdAt?.seconds * 1000 || 0);
      return dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear && d.type === 'invoice';
    })
    .reduce((sum, d) => sum + parseFloat(d.total || 0), 0);

  const monthlyQuoted = documents
    .filter(d => {
      const dDate = new Date(d.createdAt?.seconds * 1000 || 0);
      return dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear && d.type === 'quote';
    })
    .reduce((sum, d) => sum + parseFloat(d.total || 0), 0);

  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const netProfit = monthlyInvoiced - totalExpenses;

  // Outstanding count (unpaid invoices)
  const outstandingCount = documents.filter(d => d.type === 'invoice' && (!d.status || d.status === 'sent' || d.status === 'overdue')).length;

  const addExpense = async () => {
    if (!user || !newExpense.description.trim() || !newExpense.amount) return alert('Fill all fields');

    await addDoc(collection(db, 'expenses'), {
      userId: user.uid,
      ...newExpense,
      amount: parseFloat(newExpense.amount),
      createdAt: Timestamp.now()
    });

    setExpenses([...expenses, { 
      ...newExpense, 
      amount: parseFloat(newExpense.amount), 
      createdAt: { seconds: Date.now() / 1000 } 
    }]);
    setNewExpense({ description: '', amount: '', date: '' });
    alert('Expense added!');
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
            <Link href="/customers" className="text-zinc-400 hover:text-white">Customers</Link>
            <Link href="/quotes" className="text-zinc-400 hover:text-white">Quotes</Link>
            <Link href="/accounting" className="text-emerald-400 font-medium">Accounting</Link>
            <Link href="/reporting" className="text-zinc-400 hover:text-white">Reports</Link>
            <Link href="/profile" className="text-zinc-400 hover:text-white">Profile</Link>
            <button onClick={() => signOut(auth)} className="text-red-400 hover:underline">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold text-white mb-8">Accounting</h1>

        {/* Monthly Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Invoiced this month</p>
            <p className="text-5xl font-bold text-emerald-400 mt-2">R{monthlyInvoiced.toFixed(2)}</p>
          </div>
          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Quoted this month</p>
            <p className="text-5xl font-bold text-blue-400 mt-2">R{monthlyQuoted.toFixed(2)}</p>
          </div>
          <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-8">
            <p className="text-zinc-400 text-sm">Net Profit this month</p>
            <p className={`text-5xl font-bold mt-2 ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              R{netProfit.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Outstanding & All Invoices Buttons */}
        <div className="flex gap-6 mb-12">
          <Link href="/outstanding-invoices" className="flex-1 bg-red-600 hover:bg-red-500 text-white py-5 rounded-2xl text-xl font-bold text-center">
            View Outstanding Invoices ({outstandingCount})
          </Link>
          <Link href="/invoices" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl text-xl font-bold text-center">
            View All Invoices
          </Link>
        </div>

        {/* Expenses Section */}
        <div className="bg-zinc-900 rounded-3xl p-8">
          <h3 className="text-2xl font-semibold text-white mb-6">Expenses</h3>
          
          {!isPro ? (
            <button 
              onClick={() => alert('Expense tracking is a Pro feature – upgrade for R35/month!')} 
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
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
                />
                <input
                  type="number"
                  placeholder="Amount"
                  value={newExpense.amount}
                  onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
                />
                <input
                  type="date"
                  value={newExpense.date}
                  onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white"
                />
                <button 
                  onClick={addExpense} 
                  className="bg-emerald-600 hover:bg-emerald-500 py-3 rounded-2xl font-bold text-white"
                >
                  Add Expense
                </button>
              </div>

              <div className="space-y-4">
                {expenses.length === 0 ? (
                  <p className="text-zinc-500 text-center py-10">No expenses added yet</p>
                ) : (
                  expenses.map(exp => (
                    <div key={exp.id} className="bg-zinc-800 p-6 rounded-3xl flex justify-between items-center">
                      <div>
                        <div className="font-medium text-white">{exp.description}</div>
                        <div className="text-sm text-zinc-300">
                          R{parseFloat(exp.amount).toFixed(2)} • {new Date(exp.createdAt.seconds * 1000).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}