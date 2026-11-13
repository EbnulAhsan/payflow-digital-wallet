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
