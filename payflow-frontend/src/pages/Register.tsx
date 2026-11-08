import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'CUSTOMER' | 'MERCHANT'>('CUSTOMER');
  const navigate = useNavigate();

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    // Later connected to POST /api/v1/auth/register
    alert(
      `Registration submitted for ${fullName} as ${role}! Status: PENDING.`,
    );
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl border border-slate-100">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xl mb-3 shadow-md shadow-indigo-200">
            PF
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create PayFlow Account
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Register as a Customer or Merchant (Approval required)
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Account Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('CUSTOMER')}
                className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                  role === 'CUSTOMER'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Customer
              </button>
              <button
                type="button"
                onClick={() => setRole('MERCHANT')}
                className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                  role === 'MERCHANT'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Merchant
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Rahim Uddin"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Mobile (11 Digits)
              </label>
              <input
                type="text"
                required
                maxLength={11}
                placeholder="01711000001"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="rahim@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700"
          >
            Submit for Activation
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-indigo-600 hover:underline"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
