import { useLocation } from 'react-router-dom';
import { formatBdt } from '../lib/money';
import { SCREENS } from './screens';

// One layout for every role screen in SRS 5.4. It shows the SRS fields or
// columns and an empty state until the matching API is connected.
export default function RoleScreen() {
  const { pathname } = useLocation();
  const spec = SCREENS[pathname];

  if (!spec) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">Page not found</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{spec.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{spec.summary}</p>
        <p className="mt-1 text-xs text-slate-600">Requirement: {spec.fr}</p>
      </header>

      {spec.balanceLabel && (
        <section
          aria-label={spec.balanceLabel}
          className="rounded-2xl bg-indigo-900 p-5 text-white shadow-lg"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
            {spec.balanceLabel}
          </p>
          <p className="mt-1 text-2xl font-extrabold sm:text-3xl">
            {formatBdt('0')}
          </p>
        </section>
      )}

      {spec.fields && (
        <form
          aria-label={spec.title}
          onSubmit={(event) => event.preventDefault()}
          className="max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          {spec.fields.map((field) => (
            <label key={field} className="block text-sm text-slate-800">
              <span className="font-semibold">{field}</span>
              <input
                disabled
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm"
              />
            </label>
          ))}
          <p className="text-xs text-slate-600">
            This form opens when the transaction API is connected.
          </p>
        </form>
      )}

      {spec.columns && (
        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">{spec.title}</caption>
            <thead className="bg-slate-50 text-xs uppercase text-slate-700">
              <tr>
                {spec.columns.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={spec.columns.length}
                  className="px-4 py-8 text-center text-slate-600"
                >
                  No data yet.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
