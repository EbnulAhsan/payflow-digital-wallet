import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import Modal from '../components/Modal';
import { problemMessage } from '../lib/problem';
import { deactivateSchema, type DeactivateFormValues } from '../schemas/admin';
import {
  dangerButton,
  errorTextClass,
  inputClass,
  labelClass,
  secondaryButton,
} from './formStyles';
import { useDeactivateUser, type UserSummary } from './usersApi';

interface DeactivateUserModalProps {
  user: UserSummary;
  onClose: () => void;
  onDone: (user: UserSummary) => void;
}

// FR-ADM-02: deactivation needs a reason; the wallet balance is kept and the
// user's sessions end (FR-AUTH-03).
export default function DeactivateUserModal({
  user,
  onClose,
  onDone,
}: DeactivateUserModalProps) {
  const deactivate = useDeactivateUser();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeactivateFormValues>({
    resolver: zodResolver(deactivateSchema),
    defaultValues: { reason: '' },
  });

  return (
    <Modal
      title={`Deactivate ${user.fullName}?`}
      description="They are signed out at once and cannot send or receive money until reactivated. Their balance is kept."
      onClose={onClose}
      busy={deactivate.isPending}
    >
      <form
        noValidate
        onSubmit={(event) => {
          deactivate.reset();
          void handleSubmit((values) =>
            deactivate.mutate({ user, values }, { onSuccess: onDone }),
          )(event);
        }}
        className="space-y-4"
      >
        {deactivate.isError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            {problemMessage(deactivate.error)}
          </p>
        )}

        <div>
          <label htmlFor="deactivate-reason" className={labelClass}>
            Reason (required)
          </label>
          <textarea
            id="deactivate-reason"
            rows={3}
            maxLength={255}
            aria-invalid={errors.reason ? 'true' : 'false'}
            aria-describedby={
              errors.reason ? 'deactivate-reason-error' : undefined
            }
            className={inputClass}
            {...register('reason')}
          />
          {errors.reason && (
            <p id="deactivate-reason-error" className={errorTextClass}>
              {errors.reason.message}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={deactivate.isPending}
            className={secondaryButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={deactivate.isPending}
            className={dangerButton}
          >
            {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
