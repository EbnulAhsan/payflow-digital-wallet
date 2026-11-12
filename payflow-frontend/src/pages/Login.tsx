import { Navigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { AuthResponse } from '../auth/types';
import { canAccess, HOME_PATH } from '../auth/roleAccess';
import { useAuth } from '../auth/useAuth';
import { api } from '../lib/api';
import { loginSchema, type LoginFormValues } from '../schemas/auth';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600';
const labelClass =
  'block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2';

// SRS FR-AUTH-02: unknown mobile and wrong password both return 401
// "Invalid credentials", so the UI shows one message for every login failure.
function loginErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    if (status === 403 && code === 'ACCOUNT_NOT_ACTIVE') {
      return 'Your account is not active yet. Please contact an administrator.';
    }
    if (status === 429) {
      return 'Too many failed attempts. Please try again later.';
    }
    if (status === 401) {
      return 'Invalid credentials';
    }
    if (!error.response) {
      return 'Cannot reach the server. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export default function Login() {
  const { user, status, startSession } = useAuth();
  const location = useLocation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const login = useMutation({
    mutationFn: async (values: LoginFormValues) => {
      const { data } = await api.post<AuthResponse>('/auth/login', values);
      return data;
    },
    // Keeps the token in memory; the redirect below then takes the user in.
    onSuccess: startSession,
  });

  // Signed in (also when someone opens /login while already signed in):
  // go back to the page that sent them here if their role may open it,
  // otherwise to the home screen of their role.
  if (status === 'authenticated' && user) {
    const from = (location.state as { from?: { pathname: string } } | null)
      ?.from?.pathname;
    const target =
      from && canAccess(user.role, from) ? from : HOME_PATH[user.role];
    return <Navigate to={target} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-100">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xl mb-3 shadow-md shadow-indigo-200">
            PF
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            PayFlow Digital Wallet
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in to access your wallet
          </p>
        </div>

        <form
          onSubmit={(event) => {
            // Clear the previous server error on every new submit, so it
            // never shows next to fresh field validation errors.
            login.reset();
            void handleSubmit((values) => login.mutate(values))(event);
          }}
          noValidate
          className="space-y-5"
        >
          {login.isError && (
            <div
              role="alert"
              data-testid="login-error"
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {loginErrorMessage(login.error)}
            </div>
          )}

          <div>
            <label htmlFor="identifier" className={labelClass}>
              Mobile or Email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              placeholder="01711000001 or user@example.com"
              aria-invalid={errors.identifier ? 'true' : 'false'}
              aria-describedby={
                errors.identifier ? 'identifier-error' : undefined
              }
              className={inputClass}
              {...register('identifier')}
            />
            {errors.identifier && (
              <p
                id="identifier-error"
                data-testid="identifier-error"
                className="mt-1 text-xs text-rose-600"
              >
                {errors.identifier.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={errors.password ? 'true' : 'false'}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className={inputClass}
              {...register('password')}
            />
            {errors.password && (
              <p
                id="password-error"
                data-testid="password-error"
                className="mt-1 text-xs text-rose-600"
              >
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {login.isPending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          PayFlow v1.0 • Group 2 Enterprise Wallet
        </p>
      </div>
    </div>
  );
}
