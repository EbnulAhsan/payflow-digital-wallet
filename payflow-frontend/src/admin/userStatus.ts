import type { UserStatus } from './usersApi';

export const STATUSES: UserStatus[] = [
  'PENDING',
  'ACTIVE',
  'INACTIVE',
  'REJECTED',
];

export const STATUS_LABEL: Record<UserStatus, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  REJECTED: 'Rejected',
};

// SRS 2.5: times are stored in UTC and shown in Asia/Dhaka.
export const dhakaDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  dateStyle: 'medium',
});

export const dhakaDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  dateStyle: 'medium',
  timeStyle: 'short',
});
