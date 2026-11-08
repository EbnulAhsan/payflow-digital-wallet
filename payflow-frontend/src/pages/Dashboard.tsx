import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              PF
            </div>
            <span className="font-bold text-slate-900 text-lg">PayFlow</span>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
              ● Active Customer
            </span>
            <button
              onClick={() => navigate('/login')}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Wallet Overview Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 p-6 text-white shadow-lg flex flex-col justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">
                Available Wallet Balance
              </p>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
                ৳ 25,000.00{' '}
                <span className="text-xs font-normal text-indigo-300">BDT</span>
              </h2>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-indigo-700/60 pt-4 text-xs text-indigo-200">
              <span>Wallet: 01711000001</span>
              <span>Account: Rahim Uddin</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
            <h3 className="font-bold text-slate-900 text-sm mb-4">
              Quick Actions
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <button className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/50 transition-all text-center">
                <span className="text-lg">💸</span>
                <span className="text-[11px] font-semibold text-slate-700 mt-1">
                  Send
                </span>
              </button>
              <button className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/50 transition-all text-center">
                <span className="text-lg">🛍️</span>
                <span className="text-[11px] font-semibold text-slate-700 mt-1">
                  Pay
                </span>
              </button>
              <button className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/50 transition-all text-center">
                <span className="text-lg">🏧</span>
                <span className="text-[11px] font-semibold text-slate-700 mt-1">
                  Cash Out
                </span>
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-4 text-center">
              Simulated BDT transactions
            </p>
          </div>
        </div>

        {/* Recent Transactions Table Preview */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">
              Recent Ledger Activity
            </h3>
            <span className="text-xs text-indigo-600 font-semibold cursor-pointer hover:underline">
              View All
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-sm">
            <div className="px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                  ↓
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-xs">
                    Agent Deposit (Cash-In)
                  </p>
                  <p className="text-[11px] text-slate-600">
                    PF-20261110-7Q2K9XAB
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-emerald-600 text-xs">
                  + ৳ 5,000.00
                </p>
                <p className="text-[11px] text-slate-600">COMPLETED</p>
              </div>
            </div>

            <div className="px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
                  ↑
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-xs">
                    Send Money to Karim
                  </p>
                  <p className="text-[11px] text-slate-600">
                    PF-20261110-8A3M1CDE
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900 text-xs">- ৳ 3,000.00</p>
                <p className="text-[11px] text-slate-600">COMPLETED</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
