import { Link } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '../lib/api';
import { registerSchema, type RegisterFormValues } from '../schemas/auth';

interface RegisterResponse {
  id: string;
  fullName: string;
  mobile: string;
  email: string;
  role: 'CUSTOMER' | 'MERCHANT';
  status: string;
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600';
const labelClass =
  'block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1';
const errorClass = 'mt-1 text-xs text-rose-600';

// SRS FR-AUTH-01: a taken mobile or email is 409 MOBILE_TAKEN / EMAIL_TAKEN.
// Those errors belong next to the field, not in the banner.
function conflictField(error: unknown): 'mobile' | 'email' | null {
  if (isAxiosError(error) && error.response?.status === 409) {
    const code = error.response.data?.code;
    if (code === 'MOBILE_TAKEN') {
      return 'mobile';
    }
    if (code === 'EMAIL_TAKEN') {
      return 'email';
    }
  }
  return null;
}

function registerErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 422) {
      return 'Please check the details and try again.';
    }
    if (status === 429) {
      return 'Too many attempts. Please try again later.';
    }
    if (!error.response) {
      return 'Cannot reach the server. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export default function Register() {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'CUSTOMER',
      fullName: '',
      mobile: '',
      email: '',
      password: '',
    },
  });
  const role = useWatch({ control, name: 'role' });

  const registration = useMutation({
    mutationFn: async (values: RegisterFormValues) => {
      const { data } = await api.post<RegisterResponse>(
        '/auth/register',
        values,
      );
      return data;
    },
    onError: (error) => {
      const field = conflictField(error);
      if (field) {
        setError(field, {
          type: 'server',
          message:
            field === 'mobile'
              ? 'This mobile number is already registered'
              : 'This email address is already registered',
        });
      }
    },
  });

  // FR-AUTH-01: the account stays PENDING until an administrator activates it.
  if (registration.isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div
          role="status"
          data-testid="register-success"
          className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-xl border border-slate-100"
        >
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Registration received
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Thank you, {registration.data.fullName}. Your account is pending
            activation. An administrator must activate your account before you
            can sign in.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  const showBanner =
    registration.isError && conflictField(registration.error) === null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl border border-slate-100">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xl mb-3 shadow-md shadow-indigo-200">
            PF
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create PayFlow Account
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Register as a Customer or Merchant (Approval required)
          </p>
        </div>

        <form
          onSubmit={(event) => {
            // Clear the previous server error on every new submit.
            registration.reset();
            void handleSubmit((values) => registration.mutate(values))(event);
          }}
          noValidate
          className="space-y-4"
        >
          {showBanner && (
            <div
              role="alert"
              data-testid="register-error"
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {registerErrorMessage(registration.error)}
            </div>
          )}

          <div>
            <span className={labelClass}>Account Role</span>
            <div className="grid grid-cols-2 gap-3">
              {(['CUSTOMER', 'MERCHANT'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={role === option}
                  onClick={() => setValue('role', option)}
                  className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                    role === option
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option === 'CUSTOMER' ? 'Customer' : 'Merchant'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="fullName" className={labelClass}>
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              placeholder="e.g. Rahim Uddin"
              aria-invalid={errors.fullName ? 'true' : 'false'}
              className={inputClass}
              {...register('fullName')}
            />
            {errors.fullName && (
              <p data-testid="fullName-error" className={errorClass}>
                {errors.fullName.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mobile" className={labelClass}>
                Mobile (11 Digits)
              </label>
              <input
                id="mobile"
                type="text"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="01711000001"
                aria-invalid={errors.mobile ? 'true' : 'false'}
                className={inputClass}
                {...register('mobile')}
              />
              {errors.mobile && (
                <p data-testid="mobile-error" className={errorClass}>
                  {errors.mobile.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="rahim@example.com"
                aria-invalid={errors.email ? 'true' : 'false'}
                className={inputClass}
                {...register('email')}
              />
              {errors.email && (
                <p data-testid="email-error" className={errorClass}>
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={errors.password ? 'true' : 'false'}
              className={inputClass}
              {...register('password')}
            />
            <p className="mt-1 text-xs text-slate-500">
              8 to 64 characters, with at least one letter and one number.
            </p>
            {errors.password && (
              <p data-testid="password-error" className={errorClass}>
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={registration.isPending}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {registration.isPending ? 'Submitting…' : 'Submit for Activation'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-indigo-600 hover:underline"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
