import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ROLE_LABEL, navFor } from '../auth/roleAccess';

// Shared shell for every signed-in screen: the menu only lists what the
// current role may open.
export default function AppLayout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
              PF
            </div>
            <span className="hidden text-lg font-bold text-slate-900 sm:inline">
              PayFlow
            </span>
          </div>

          <nav
            aria-label="Main"
            className="flex flex-1 items-center gap-1 overflow-x-auto"
          >
            {navFor(user.role).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center space-x-3">
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:inline">
              ● {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={() => void logout()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
