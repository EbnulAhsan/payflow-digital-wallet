import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import CreateAgentModal from '../admin/CreateAgentModal';
import DeactivateUserModal from '../admin/DeactivateUserModal';
import StatusBadge from '../admin/StatusBadge';
import { STATUSES, STATUS_LABEL, dhakaDate } from '../admin/userStatus';
import {
  focusRing,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from '../admin/formStyles';
import {
  useActivateUser,
  useReactivateUser,
  useUsers,
  type UserFilters,
  type UserSummary,
} from '../admin/usersApi';
import { ROLE_LABEL } from '../auth/roleAccess';
import type { Role } from '../auth/types';
import { formatBdt } from '../lib/money';
import { problemMessage } from '../lib/problem';

const PAGE_SIZE = 20;
const ROLES: Role[] = ['ADMIN', 'AGENT', 'CUSTOMER', 'MERCHANT'];
interface Notice {
  kind: 'success' | 'error';
  text: string;
}

type Dialog =
  { kind: 'deactivate'; user: UserSummary } | { kind: 'create-agent' } | null;

// FR-ADM-01 only covers self-registered accounts; agents start ACTIVE.
const canActivate = (user: UserSummary) =>
  user.status === 'PENDING' &&
  (user.role === 'CUSTOMER' || user.role === 'MERCHANT');
// FR-ADM-02: any non-admin account.
const canDeactivate = (user: UserSummary) =>
  user.status === 'ACTIVE' && user.role !== 'ADMIN';
const canReactivate = (user: UserSummary) =>
  user.status === 'INACTIVE' && user.role !== 'ADMIN';

interface AdminUsersProps {
  // "/admin/agents" opens the same screen limited to agents.
  fixedRole?: 'AGENT';
}

// FR-ADM-01 to FR-ADM-04: search users and change their status; FR-ADM-03:
// create agents.
export default function AdminUsers({ fixedRole }: AdminUsersProps) {
  const [filters, setFilters] = useState<UserFilters>({
    q: '',
    role: fixedRole ?? 'ALL',
    status: 'ALL',
    page: 1,
    size: PAGE_SIZE,
  });
  const [searchText, setSearchText] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const users = useUsers(filters);
  const activate = useActivateUser();
  const reactivate = useReactivateUser();

  // Success messages fade after a while; errors stay until dismissed.
  useEffect(() => {
    if (notice?.kind !== 'success') return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const changeFilters = (next: Partial<UserFilters>) =>
    // Any new filter starts again at page 1.
    setFilters((current) => ({ ...current, page: 1, ...next }));

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    changeFilters({ q: searchText.trim() });
  };

  const report = (kind: Notice['kind'], text: string) =>
    setNotice({ kind, text });

  const onActivate = (user: UserSummary) =>
    activate.mutate(user, {
      onSuccess: () =>
        report('success', `${user.fullName} is now active and has a wallet.`),
      onError: (error) =>
        report(
          'error',
          `Could not activate ${user.fullName}: ${problemMessage(error)}`,
        ),
    });

  const onReactivate = (user: UserSummary) =>
    reactivate.mutate(user, {
      onSuccess: () => report('success', `${user.fullName} is active again.`),
      onError: (error) =>
        report(
          'error',
          `Could not reactivate ${user.fullName}: ${problemMessage(error)}`,
        ),
    });

  // Only one row action runs at a time; its row shows the progress.
  const busyUserId =
    (activate.isPending && activate.variables?.id) ||
    (reactivate.isPending && reactivate.variables?.id) ||
    null;

  // FR-ADM-01, FR-ADM-02: the one status change that fits the account.
  const renderActions = (user: UserSummary) => (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to={`/admin/users/${user.id}`}
        aria-label={`View or edit ${user.fullName}`}
        className={`${secondaryButton} px-3 py-1.5 text-xs`}
      >
        View / Edit
      </Link>
      {renderStatusAction(user)}
    </div>
  );

  // FR-ADM-01, FR-ADM-02: the quick status change that fits the account.
  const renderStatusAction = (user: UserSummary) => {
    const busy = busyUserId === user.id;
    const disabled = busyUserId !== null;
    if (canActivate(user)) {
      return (
        <button
          type="button"
          onClick={() => onActivate(user)}
          disabled={disabled}
          aria-label={`Activate ${user.fullName}`}
          className={`${primaryButton} px-3 py-1.5 text-xs`}
        >
          {busy ? 'Activating…' : 'Activate'}
        </button>
      );
    }
    if (canDeactivate(user)) {
      return (
        <button
          type="button"
          onClick={() => setDialog({ kind: 'deactivate', user })}
          disabled={disabled}
          aria-label={`Deactivate ${user.fullName}`}
          className={`rounded-lg border border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
        >
          Deactivate
        </button>
      );
    }
    if (canReactivate(user)) {
      return (
        <button
          type="button"
          onClick={() => onReactivate(user)}
          disabled={disabled}
          aria-label={`Reactivate ${user.fullName}`}
          className={`${secondaryButton} px-3 py-1.5 text-xs`}
        >
          {busy ? 'Reactivating…' : 'Reactivate'}
        </button>
      );
    }
    return null;
  };

  const balanceOf = (user: UserSummary) =>
    user.balance === null ? '—' : formatBdt(user.balance);

  const page = users.data;
  const firstRow = page ? (page.page - 1) * page.size + 1 : 0;
  const lastRow = page ? firstRow + page.items.length - 1 : 0;
  const title = fixedRole ? 'Agents' : 'Users';

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {fixedRole
              ? 'Agent accounts. Agents never self-register; create them here.'
              : 'Search users and activate, deactivate or reactivate them. Customers and merchants register themselves; only agents are created here.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ kind: 'create-agent' })}
          className={primaryButton}
        >
          Create agent
        </button>
      </header>

      {/* Always in the page, so screen readers announce each new message. */}
      <div aria-live="polite" aria-atomic="true">
        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
              notice.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              className={`shrink-0 rounded px-1 font-bold ${focusRing}`}
            >
              ×
            </button>
          </div>
        )}
      </div>

      <section
        aria-label="Filters"
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"
      >
        <form role="search" onSubmit={onSearch} className="min-w-0">
          <label htmlFor="user-search" className={labelClass}>
            Name or mobile
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="user-search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="e.g. Rahim or 01711"
              maxLength={120}
              className={`${inputClass} mt-0 min-w-0`}
            />
            <button type="submit" className={`${secondaryButton} shrink-0`}>
              Search
            </button>
          </div>
        </form>

        {!fixedRole && (
          <div>
            <label htmlFor="role-filter" className={labelClass}>
              Role
            </label>
            <select
              id="role-filter"
              value={filters.role}
              onChange={(event) =>
                changeFilters({
                  role: event.target.value as UserFilters['role'],
                })
              }
              className={inputClass}
            >
              <option value="ALL">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="status-filter" className={labelClass}>
            Status
          </label>
          <select
            id="status-filter"
            value={filters.status}
            onChange={(event) =>
              changeFilters({
                status: event.target.value as UserFilters['status'],
              })
            }
            className={inputClass}
          >
            <option value="ALL">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section
        aria-label={`${title} list`}
        aria-busy={users.isFetching}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        {users.isPending ? (
          <p className="px-4 py-8 text-center text-sm text-slate-600">
            Loading {title.toLowerCase()}…
          </p>
        ) : users.isError ? (
          <div role="alert" className="space-y-3 px-4 py-8 text-center">
            <p className="text-sm text-rose-800">
              {problemMessage(users.error)}
            </p>
            <button
              type="button"
              onClick={() => void users.refetch()}
              className={secondaryButton}
            >
              Try again
            </button>
          </div>
        ) : page && page.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-600">
            No {title.toLowerCase()} match these filters.
          </p>
        ) : page ? (
          <>
            {/* Phones (360 px and up): one card per user. */}
            <ul className="divide-y divide-slate-200 md:hidden">
              {page.items.map((user) => (
                <li key={user.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {user.fullName}
                      </p>
                      <p className="truncate text-xs text-slate-600">
                        {user.email}
                      </p>
                    </div>
                    <StatusBadge status={user.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 text-xs">
                    <dt className="text-slate-600">Phone</dt>
                    <dd className="text-slate-900">{user.mobile}</dd>
                    <dt className="text-slate-600">Balance (BDT)</dt>
                    <dd className="text-slate-900">{balanceOf(user)}</dd>
                    <dt className="text-slate-600">Role</dt>
                    <dd className="text-slate-900">{ROLE_LABEL[user.role]}</dd>
                    <dt className="text-slate-600">Registered</dt>
                    <dd className="text-slate-900">
                      {dhakaDate.format(new Date(user.createdAt))}
                    </dd>
                  </dl>
                  {user.statusReason && (
                    <p className="text-xs text-slate-700">
                      Reason: {user.statusReason}
                    </p>
                  )}
                  <div>{renderActions(user)}</div>
                </li>
              ))}
            </ul>

            {/* Tablets and desktops: a table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  {title}, page {page.page} of {Math.max(page.totalPages, 1)}
                </caption>
                <thead className="bg-slate-50 text-xs uppercase text-slate-700">
                  <tr>
                    {[
                      'Name',
                      'Email',
                      'Phone',
                      'Balance (BDT)',
                      'Role',
                      'Status',
                      'Registered Date',
                      'Action',
                    ].map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className={`whitespace-nowrap px-4 py-3 ${column === 'Balance (BDT)' ? 'text-right' : ''}`}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {page.items.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {user.fullName}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{user.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-900">
                        {user.mobile}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
                        {balanceOf(user)}
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        {ROLE_LABEL[user.role]}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={user.status} />
                        {user.statusReason && (
                          <p className="mt-1 max-w-[14rem] text-xs text-slate-700">
                            {user.statusReason}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-900">
                        {dhakaDate.format(new Date(user.createdAt))}
                      </td>
                      <td className="px-4 py-3">{renderActions(user)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {page && (
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm"
          >
            <p className="text-slate-700">
              {page.items.length === 0
                ? `${page.total} ${page.total === 1 ? 'user' : 'users'} in total`
                : `Showing ${firstRow}–${lastRow} of ${page.total} ${page.total === 1 ? 'user' : 'users'}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page - 1,
                  }))
                }
                disabled={filters.page <= 1}
                className={`${secondaryButton} px-3 py-1.5`}
              >
                Previous
              </button>
              <span className="text-slate-700">
                Page {filters.page} of {Math.max(page.totalPages, 1)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page + 1,
                  }))
                }
                disabled={filters.page >= page.totalPages}
                className={`${secondaryButton} px-3 py-1.5`}
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </section>

      {dialog?.kind === 'deactivate' && (
        <DeactivateUserModal
          user={dialog.user}
          onClose={() => setDialog(null)}
          onDone={(user) => {
            setDialog(null);
            report(
              'success',
              `${user.fullName} is deactivated and signed out. Their balance is kept.`,
            );
          }}
        />
      )}

      {dialog?.kind === 'create-agent' && (
        <CreateAgentModal
          onClose={() => setDialog(null)}
          onCreated={(agent) => {
            setDialog(null);
            report(
              'success',
              `Agent ${agent.fullName} (${agent.mobile}) is created with an empty wallet. They set their own password on first login.`,
            );
          }}
        />
      )}
    </main>
  );
}
