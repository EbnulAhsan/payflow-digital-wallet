import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [mobileOrEmail, setMobileOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-100">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xl mb-3 shadow-md shadow-indigo-200">
            PF
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            PayFlow Digital Wallet
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in to access your wallet
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Mobile or Email
            </label>
            <input
              type="text"
              required
              placeholder="01711000001 or user@example.com"
              value={mobileOrEmail}
              onChange={(e) => setMobileOrEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 focus:outline-none"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          PayFlow v1.0 • Group 2 Enterprise Wallet
        </p>
      </div>
    </div>
  );
}
