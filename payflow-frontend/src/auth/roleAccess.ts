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

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/dashboard', roles: ['CUSTOMER'] },
  { label: 'Send', path: '/send', roles: ['CUSTOMER'] },
  { label: 'Pay', path: '/pay', roles: ['CUSTOMER'] },

  { label: 'Home', path: '/agent', roles: ['AGENT'] },
  { label: 'Cash-in', path: '/agent/cash-in', roles: ['AGENT'] },
  { label: 'Cash-out', path: '/agent/cash-out', roles: ['AGENT'] },

  { label: 'Home', path: '/merchant', roles: ['MERCHANT'] },
  { label: 'Verify', path: '/merchant/verify', roles: ['MERCHANT'] },

  { label: 'Home', path: '/admin', roles: ['ADMIN'] },
  { label: 'Users', path: '/admin/users', roles: ['ADMIN'] },
  { label: 'Allocations', path: '/admin/allocations', roles: ['ADMIN'] },
  { label: 'Transactions', path: '/admin/transactions', roles: ['ADMIN'] },
  { label: 'Audit', path: '/admin/audit', roles: ['ADMIN'] },

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
