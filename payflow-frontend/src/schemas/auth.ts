import { z } from 'zod';

// SRS 5.2: mobile is 11 digits, 01[3-9]XXXXXXXX
const MOBILE_PATTERN = /^01[3-9][0-9]{8}$/;

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Mobile or email is required')
    .refine(
      (value) =>
        MOBILE_PATTERN.test(value) || z.email().safeParse(value).success,
      'Enter a valid 11-digit mobile number or email',
    ),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  role: z.enum(['CUSTOMER', 'MERCHANT']),
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(120, 'Full name must be 120 characters or fewer'),
  mobile: z
    .string()
    .trim()
    .regex(MOBILE_PATTERN, 'Enter a valid 11-digit mobile number'),
  email: z
    .string()
    .trim()
    .max(254, 'Email must be 254 characters or fewer')
    .refine(
      (value) => z.email().safeParse(value).success,
      'Enter a valid email address',
    ),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(64, 'Password must be 64 characters or fewer')
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'Password needs a letter and a number'),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;
