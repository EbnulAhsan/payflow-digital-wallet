import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../auth/roleAccess';

// Placeholder for screens that later tasks will build.
export default function ComingSoon() {
  const { pathname } = useLocation();
  const title =
    NAV_ITEMS.find((item) => item.path === pathname)?.label ?? 'This page';

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">Coming soon.</p>
    </main>
  );
}
