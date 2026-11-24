import { zodResolver } from '@hookform/resolvers/zod';
import { cloneElement, useState, type ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import {
  errorTextClass,
  focusRing,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from '../admin/formStyles';
import StatusBadge from '../admin/StatusBadge';
import { STATUS_LABEL, dhakaDateTime } from '../admin/userStatus';
import {
  useUpdateUser,
  useUser,
  type UserChanges,
  type UserStatus,
  type UserSummary,
} from '../admin/usersApi';
import { ROLE_LABEL } from '../auth/roleAccess';
import { formatBdt } from '../lib/money';
import { problemMessage, readProblem } from '../lib/problem';
import { editUserSchema, type EditUserFormValues } from '../schemas/admin';

const ROLE_BADGE = 'bg-indigo-100 text-indigo-900';
const PROFILE_FIELDS = ['fullName', 'email', 'mobile'] as const;

// The status dropdown always lists these three. "Suspended" is the SRS
// status INACTIVE (SRS 4.1, 5.2). The API still enforces the allowed
// transitions and answers 409 for any other.
const STATUS_CHOICES: { value: UserStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Suspended' },
];

const choiceLabel = (status: UserStatus) =>
  STATUS_CHOICES.find((choice) => choice.value === status)?.label ??
  STATUS_LABEL[status];

// Admin user view / edit (FR-ADM-01, FR-ADM-02, FR-ADM-04). Editable: name,
// email, mobile and status. Locked: ID, role (SRS 1.3) and balance
// (FR-ADM-08, BR-13). There is no delete (FR-ADM-02, BR-11).
export default function AdminUserDetail() {
  const { id = '' } = useParams();
  const user = useUser(id);

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/admin/users"
        className={`inline-flex items-center gap-1 text-sm font-semibold text-indigo-800 hover:underline ${focusRing}`}
      >
        <span aria-hidden="true">←</span> Back to User List
      </Link>

      {user.isPending ? (
        <p className="text-sm text-slate-600">Loading user…</p>
      ) : user.isError ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-rose-800">
            {readProblem(user.error)?.status === 404
              ? 'This user does not exist.'
              : problemMessage(user.error)}
          </p>
          {readProblem(user.error)?.status !== 404 && (
            <button
              type="button"
              onClick={() => void user.refetch()}
              className={secondaryButton}
            >
              Try again
            </button>
          )}
        </div>
      ) : (
        // A save returns a new updatedAt, so the form starts again from the
        // saved values.
        <UserEditor key={user.data.updatedAt} user={user.data} />
      )}
    </main>
  );
}

function toForm(user: UserSummary): EditUserFormValues {
  return {
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile,
    status: user.status,
    reason: '',
  };
}

function UserEditor({ user }: { user: UserSummary }) {
  const update = useUpdateUser();
  const [saved, setSaved] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isDirty },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: toForm(user),
  });

  // FR-ADM-02: an admin account's status never changes.
  const statusLocked = user.role === 'ADMIN';
  // A rejected registration is not one of the three choices; show it as a
  // disabled option so the dropdown still tells the truth.
  const showRejected = user.status === 'REJECTED';
  const selectedStatus = useWatch({ control, name: 'status' });
  const statusChanging = selectedStatus !== user.status;
  // FR-ADM-02: suspending (INACTIVE) always needs a reason.
  const reasonShown = statusChanging && selectedStatus === 'INACTIVE';

  const submit = (values: EditUserFormValues) => {
    setSaved(null);
    // Send only what changed; role and balance are never sent.
    const changes: UserChanges = {};
    for (const field of PROFILE_FIELDS) {
      if (values[field] !== user[field]) changes[field] = values[field];
    }
    if (statusChanging) {
      changes.status = values.status;
      if (reasonShown && values.reason) changes.reason = values.reason;
    }
    if (Object.keys(changes).length === 0) {
      setSaved('Nothing to save: no field was changed.');
      return;
    }
    update.mutate(
      { id: user.id, changes },
      {
        onSuccess: (next) =>
          setSaved(
            statusChanging
              ? `Saved. ${next.fullName} is now ${choiceLabel(next.status).toLowerCase()}.`
              : `Saved ${next.fullName}'s details.`,
          ),
        onError: (error) => {
          // SRS 5.3: 409 MOBILE_TAKEN / EMAIL_TAKEN belong next to the field.
          const code = readProblem(error)?.code;
          if (code === 'MOBILE_TAKEN') {
            setError('mobile', {
              message: 'This mobile number is already in use',
            });
          } else if (code === 'EMAIL_TAKEN') {
            setError('email', {
              message: 'This email address is already in use',
            });
          }
        },
      },
    );
  };

  const errorCode = readProblem(update.error)?.code;
  // SRS 4.1 transitions the API refused, in the dropdown's own words.
  const formError =
    errorCode === 'INVALID_STATUS_TRANSITION'
      ? `This account is ${choiceLabel(user.status)} and cannot be changed to ${choiceLabel(update.variables?.changes.status ?? user.status)}. Allowed changes: Pending to Active, Active to Suspended, Suspended to Active.`
      : problemMessage(update.error);
  const showFormError =
    update.isError &&
    errorCode !== 'MOBILE_TAKEN' &&
    errorCode !== 'EMAIL_TAKEN';

  return (
    <form
      noValidate
      aria-label={`Edit ${user.fullName}`}
      onSubmit={(event) => {
        update.reset();
        void handleSubmit(submit)(event);
      }}
      className="space-y-5"
    >
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-xl font-bold text-white"
          >
            {user.fullName.trim().charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-slate-900">
              {user.fullName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2.5 py-0.5 font-semibold ${ROLE_BADGE}`}
              >
                {ROLE_LABEL[user.role]}
              </span>
              <StatusBadge status={user.status} />
              <span className="text-slate-700">User ID {user.id}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              reset(toForm(user));
              update.reset();
              setSaved(null);
            }}
            disabled={update.isPending || !isDirty}
            className={secondaryButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={update.isPending}
            className={primaryButton}
          >
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </header>

      <div aria-live="polite" aria-atomic="true">
        {saved && (
          <p
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            {saved}
          </p>
        )}
      </div>
      {showFormError && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {formError}
        </p>
      )}

      <section
        aria-labelledby="profile-heading"
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 id="profile-heading" className="text-base font-bold text-slate-900">
          Profile
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="user-fullName"
            label="Full name"
            error={errors.fullName?.message}
          >
            <input
              id="user-fullName"
              type="text"
              autoComplete="off"
              maxLength={120}
              {...register('fullName')}
            />
          </Field>
          <Field
            id="user-email"
            label="Email address"
            error={errors.email?.message}
          >
            <input
              id="user-email"
              type="email"
              autoComplete="off"
              maxLength={254}
              {...register('email')}
            />
          </Field>
          <Field
            id="user-mobile"
            label="Phone number (mobile)"
            hint="11 digits, for example 01711000001. It is also the wallet number and a login, so a change applies at once."
            error={errors.mobile?.message}
          >
            <input
              id="user-mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              {...register('mobile')}
            />
          </Field>
        </div>
      </section>

      <section
        aria-labelledby="status-heading"
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 id="status-heading" className="text-base font-bold text-slate-900">
          Account status
        </h2>
        <Field
          id="user-status"
          label="Status"
          hint={
            statusLocked
              ? 'Administrator accounts cannot be suspended.'
              : 'Suspending needs a reason.'
          }
          error={errors.status?.message}
        >
          <select
            id="user-status"
            disabled={statusLocked}
            {...register('status')}
          >
            {STATUS_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
            {showRejected && (
              <option value="REJECTED" disabled>
                {STATUS_LABEL.REJECTED}
              </option>
            )}
          </select>
        </Field>

        {statusChanging && selectedStatus === 'INACTIVE' && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Suspending signs the user out at once and cancels their pending
            cash-out requests. Their balance is kept.
          </p>
        )}
        {statusChanging &&
          selectedStatus === 'ACTIVE' &&
          user.status === 'PENDING' && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Activating creates the user’s wallet with ৳ 0.00.
            </p>
          )}
        {reasonShown && (
          <Field
            id="user-reason"
            label="Reason (required)"
            error={errors.reason?.message}
          >
            <textarea
              id="user-reason"
              rows={3}
              maxLength={255}
              {...register('reason')}
            />
          </Field>
        )}
        {user.statusReason && !statusChanging && (
          <p className="text-sm text-slate-700">
            Current reason: {user.statusReason}
          </p>
        )}
      </section>

      <section
        aria-labelledby="locked-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 id="locked-heading" className="text-base font-bold text-slate-900">
          Read-only
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <ReadOnly label="User ID" value={user.id} />
          <ReadOnly label="Role" value={ROLE_LABEL[user.role]} />
          <ReadOnly
            label="Current balance (BDT)"
            value={
              user.balance === null ? 'No wallet yet' : formatBdt(user.balance)
            }
          />
          <ReadOnly
            label="Registered"
            value={dhakaDateTime.format(new Date(user.createdAt))}
          />
          <ReadOnly
            label="Last updated"
            value={dhakaDateTime.format(new Date(user.updatedAt))}
          />
        </dl>
      </section>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<{
    className?: string;
    'aria-invalid'?: 'true' | 'false';
    'aria-describedby'?: string;
  }>;
}

// Label, hint and error wired to the control for screen readers.
function Field({ id, label, hint, error, children }: FieldProps) {
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  const control = cloneElement(children, {
    className: `${inputClass} disabled:bg-slate-100 disabled:text-slate-700`,
    'aria-invalid': error ? 'true' : 'false',
    'aria-describedby': describedBy,
  });
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {control}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className={errorTextClass}>
          {error}
        </p>
      )}
    </div>
  );
}

// Shown as text, never as an input: the ID, the role (SRS 1.3) and the
// balance (FR-ADM-08, BR-13) cannot be edited here.
function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
