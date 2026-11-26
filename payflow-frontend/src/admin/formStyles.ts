export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';

export const labelClass = 'block text-sm font-semibold text-slate-800';

export const inputClass =
  'mt-1 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-700 aria-[invalid=true]:border-rose-700';

export const errorTextClass = 'mt-1 text-xs text-rose-700';

export const primaryButton = `rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const secondaryButton = `rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const dangerButton = `rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
