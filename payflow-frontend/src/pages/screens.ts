// What each role screen shows, taken from the SRS (the FR id is in `fr`).
// The screens are not wired to the API yet, so they show the SRS layout
// with an empty state instead of invented numbers.

export interface ScreenSpec {
  title: string;
  fr: string;
  summary: string;
  // Form-type screens list their fields; list-type screens list columns.
  fields?: string[];
  columns?: string[];
  balanceLabel?: string;
}

const HISTORY_COLUMNS = [
  'Reference',
  'Date and time',
  'Type',
  'Sender',
  'Receiver',
  'Amount',
  'Direction',
  'Status',
  'Balance after',
];

export const SCREENS: Record<string, ScreenSpec> = {
  '/send': {
    title: 'Send money',
    fr: 'FR-TXN-02',
    summary: 'Send money to another active customer by wallet number.',
    fields: ['Recipient wallet number', 'Amount (৳)', 'Note'],
  },
  '/pay': {
    title: 'Pay a merchant',
    fr: 'FR-TXN-03',
    summary: 'Pay an active merchant.',
    fields: ['Merchant wallet number', 'Amount (৳)', 'Note'],
  },
  '/cash-outs': {
    title: 'Pending cash-outs',
    fr: 'FR-TXN-05, FR-TXN-06',
    summary:
      'Cash-out requests from agents that wait for your approval. Each one expires after 5 minutes.',
    columns: ['Agent', 'Amount', 'Requested at', 'Expires at', 'Action'],
  },
  '/history': {
    title: 'History',
    fr: 'FR-HIS-01, FR-HIS-02',
    summary: 'Your own transactions, newest first.',
    columns: HISTORY_COLUMNS,
  },

  '/agent': {
    title: 'Float',
    fr: 'FR-WAL-02',
    summary: 'The balance you have available for cash-in.',
    balanceLabel: 'Current float',
  },
  '/agent/cash-in': {
    title: 'Cash-in',
    fr: 'FR-TXN-01',
    summary: 'Deposit to an active customer wallet from your float.',
    fields: ['Customer wallet number', 'Amount (৳)'],
  },
  '/agent/cash-out': {
    title: 'Cash-out requests',
    fr: 'FR-TXN-04, FR-TXN-06',
    summary:
      'Start a cash-out for a customer and follow requests that are waiting for approval.',
    columns: ['Customer', 'Amount', 'Status', 'Expires at', 'Action'],
  },

  '/merchant': {
    title: 'Payments received',
    fr: 'FR-TXN-03, FR-HIS-04',
    summary: 'Payments customers made to your wallet.',
    columns: ['Reference', 'Date and time', 'Payer', 'Amount', 'Status'],
    balanceLabel: 'Wallet balance',
  },
  '/merchant/verify': {
    title: 'Verify reference',
    fr: 'FR-HIS-04',
    summary: 'Look up a payment to you by its reference.',
    fields: ['Transaction reference (PF-YYYYMMDD-XXXXXXXX)'],
  },

  '/admin': {
    title: 'Dashboard',
    fr: 'FR-DSH-01 to FR-DSH-05',
    summary:
      'Platform counts, value by transaction type, daily and monthly trends and the agent funding summary.',
    columns: ['Type', 'Count', 'Total (৳)'],
  },
  '/admin/users': {
    title: 'Users',
    fr: 'FR-ADM-01, FR-ADM-02, FR-ADM-04',
    summary:
      'Search users and activate, reject, deactivate or reactivate them.',
    columns: ['Name', 'Mobile', 'Role', 'Status', 'Action'],
  },
  '/admin/agents': {
    title: 'Agents',
    fr: 'FR-ADM-03',
    summary: 'Create agent accounts. Agents never self-register.',
    fields: ['Full name', 'Mobile', 'Email'],
  },
  '/admin/allocations': {
    title: 'Allocations',
    fr: 'FR-ADM-05',
    summary: 'Allocate funds from the treasury to an agent.',
    fields: ['Agent wallet number', 'Amount (৳)', 'Note'],
  },
  '/admin/transactions': {
    title: 'Transactions',
    fr: 'FR-ADM-06',
    summary: 'Open any transaction by its reference.',
    fields: ['Transaction reference (PF-YYYYMMDD-XXXXXXXX)'],
  },
  '/admin/audit': {
    title: 'Audit trail',
    fr: 'FR-ADM-07',
    summary: 'Filter the audit trail by actor, action, entity and date.',
    columns: ['Time', 'Actor', 'Action', 'Entity', 'Before', 'After'],
  },
};
