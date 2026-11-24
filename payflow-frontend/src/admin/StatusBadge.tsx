import { STATUS_LABEL } from './userStatus';
import type { UserStatus } from './usersApi';

// Text and background pairs that pass WCAG 2.1 AA contrast (4.5:1).
const STATUS_BADGE: Record<UserStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  ACTIVE: 'bg-emerald-100 text-emerald-900',
  INACTIVE: 'bg-slate-200 text-slate-800',
  REJECTED: 'bg-rose-100 text-rose-900',
};

export default function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
