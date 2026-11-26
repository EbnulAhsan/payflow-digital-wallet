import { z } from 'zod';

// Same rules as the API (SRS 5.2 users table and NFR-SEC-01); the server
// still checks everything, including the breached-password list.
const MOBILE_PATTERN = /^01[3-9][0-9]{8}$/;

export const createAgentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(120, 'Use at most 120 characters'),
  mobile: z
    .string()
    .trim()
    .regex(MOBILE_PATTERN, 'Enter an 11-digit mobile number like 01711000001'),
  email: z
    .string()
    .trim()
    .max(254, 'Use at most 254 characters')
    .pipe(z.email('Enter a valid email address')),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(64, 'Use at most 64 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/\d/, 'Include at least one digit'),
});

export type CreateAgentFormValues = z.infer<typeof createAgentSchema>;

// FR-ADM-02: a deactivation needs a reason (users.status_reason, 255 chars).
export const deactivateSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'A reason is required')
    .max(255, 'Use at most 255 characters'),
});

export type DeactivateFormValues = z.infer<typeof deactivateSchema>;

// Admin user view / edit screen. The role (SRS 1.3) and balance (FR-ADM-08)
// are never part of the form. A deactivation needs a reason (FR-ADM-02).
export const editUserSchema = createAgentSchema
  .pick({ fullName: true, email: true, mobile: true })
  .extend({
    status: z.enum(['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED']),
    reason: z.string().trim().max(255, 'Use at most 255 characters'),
  })
  .superRefine((values, context) => {
    if (values.status === 'INACTIVE' && values.reason.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A reason is required to suspend',
      });
    }
  });

export type EditUserFormValues = z.infer<typeof editUserSchema>;
