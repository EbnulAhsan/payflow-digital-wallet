import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ROLE_LABEL, navFor } from '../auth/roleAccess';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';

// Shared shell for every signed-in screen: the menu only lists what the
// current role may open. On a 360 px phone the menu moves to its own row
// and scrolls sideways instead of squeezing the header.
export default function AppLayout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-6 md:flex-nowrap">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
              PF
            </div>
            <span className="text-lg font-bold text-slate-900">PayFlow</span>
          </div>

          <div className="order-2 flex items-center space-x-3 md:order-3">
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 sm:inline">
              ● {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={() => void logout()}
              className={`rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
            >
              Sign Out
            </button>
          </div>

          <nav
            aria-label="Main"
            className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-1 md:order-2 md:w-auto md:flex-1 md:pb-0"
          >
            {navFor(user.role).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${focusRing} ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-800'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
