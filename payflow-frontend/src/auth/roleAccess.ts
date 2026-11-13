import type { Role } from './types';

// One place that says which role may see which screen (SRS 1.3 and 5.4).
// The server still enforces every rule; this only decides what the UI shows.

export interface NavItem {
  label: string;
  path: string;
  roles: Role[];
}

export const HOME_PATH: Record<Role, string> = {
  CUSTOMER: '/dashboard',
  AGENT: '/agent',
  MERCHANT: '/merchant',
  ADMIN: '/admin',
};

// SRS 5.4 role home screens:
//   Customer: balance, send, pay, pending cash-outs, history
//   Agent:    float, cash-in, cash-out requests, history
//   Merchant: payments received, verify reference
//   Admin:    users, agents, allocations, transactions, audit, dashboard
export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/dashboard', roles: ['CUSTOMER'] },
  { label: 'Send', path: '/send', roles: ['CUSTOMER'] },
  { label: 'Pay', path: '/pay', roles: ['CUSTOMER'] },
  { label: 'Pending cash-outs', path: '/cash-outs', roles: ['CUSTOMER'] },

  { label: 'Float', path: '/agent', roles: ['AGENT'] },
  { label: 'Cash-in', path: '/agent/cash-in', roles: ['AGENT'] },
  { label: 'Cash-out requests', path: '/agent/cash-out', roles: ['AGENT'] },

  { label: 'Payments received', path: '/merchant', roles: ['MERCHANT'] },
  { label: 'Verify reference', path: '/merchant/verify', roles: ['MERCHANT'] },

  { label: 'Dashboard', path: '/admin', roles: ['ADMIN'] },
  { label: 'Users', path: '/admin/users', roles: ['ADMIN'] },
  { label: 'Agents', path: '/admin/agents', roles: ['ADMIN'] },
  { label: 'Allocations', path: '/admin/allocations', roles: ['ADMIN'] },
  { label: 'Transactions', path: '/admin/transactions', roles: ['ADMIN'] },
  { label: 'Audit', path: '/admin/audit', roles: ['ADMIN'] },

  // FR-HIS-01: customers, agents and merchants see their own history.
  {
    label: 'History',
    path: '/history',
    roles: ['CUSTOMER', 'AGENT', 'MERCHANT'],
  },
];

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'Customer',
  AGENT: 'Agent',
  MERCHANT: 'Merchant',
  ADMIN: 'Admin',
};

export const navFor = (role: Role) =>
  NAV_ITEMS.filter((item) => item.roles.includes(role));

export const canAccess = (role: Role, path: string) =>
  NAV_ITEMS.some((item) => item.path === path && item.roles.includes(role));
