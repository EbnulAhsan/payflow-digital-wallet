import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { HOME_PATH } from '../auth/roleAccess';

export default function NoAccess() {
  const { user } = useAuth();

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-xl">
        <p className="text-4xl font-extrabold text-indigo-600">403</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">No access</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account does not have permission to open this page.
        </p>
        {user && (
          <Link
            to={HOME_PATH[user.role]}
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Go to my home
          </Link>
        )}
      </div>
    </main>
  );
}
