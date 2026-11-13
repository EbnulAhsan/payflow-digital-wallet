import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, HOME_PATH, canAccess, navFor } from './roleAccess';
import { SCREENS } from '../pages/screens';
import type { Role } from './types';

const ROLES: Role[] = ['CUSTOMER', 'AGENT', 'MERCHANT', 'ADMIN'];
const labels = (role: Role) => navFor(role).map((item) => item.label);

// SRS 5.4 lists the screens of each role home.
describe('role navigation (SRS 5.4)', () => {
  it('gives the customer balance, send, pay, pending cash-outs and history', () => {
    expect(labels('CUSTOMER')).toEqual([
      'Home',
      'Send',
      'Pay',
      'Pending cash-outs',
      'History',
    ]);
  });

  it('gives the agent float, cash-in, cash-out requests and history', () => {
    expect(labels('AGENT')).toEqual([
      'Float',
      'Cash-in',
      'Cash-out requests',
      'History',
    ]);
  });

  it('gives the merchant payments received, verify reference and history', () => {
    expect(labels('MERCHANT')).toEqual([
      'Payments received',
      'Verify reference',
      'History',
    ]);
  });

  it('gives the admin users, agents, allocations, transactions, audit and dashboard', () => {
    expect(labels('ADMIN')).toEqual([
      'Dashboard',
      'Users',
      'Agents',
      'Allocations',
      'Transactions',
      'Audit',
    ]);
  });

  it('gives the admin no history (admins have no wallet, SRS 1.3)', () => {
    expect(canAccess('ADMIN', '/history')).toBe(false);
  });

  it('never lets a role open another role’s screen', () => {
    expect(canAccess('CUSTOMER', '/admin/users')).toBe(false);
    expect(canAccess('CUSTOMER', '/agent/cash-in')).toBe(false);
    expect(canAccess('AGENT', '/cash-outs')).toBe(false);
    expect(canAccess('MERCHANT', '/send')).toBe(false);
    expect(canAccess('ADMIN', '/admin/allocations')).toBe(true);
  });

  it('sends every role home to a screen it may open', () => {
    for (const role of ROLES) {
      expect(canAccess(role, HOME_PATH[role])).toBe(true);
    }
  });

  it('has a role screen definition for every menu item except the customer home', () => {
    const missing = NAV_ITEMS.filter(
      (item) => item.path !== '/dashboard' && !SCREENS[item.path],
    ).map((item) => item.path);
    expect(missing).toEqual([]);
  });
});
