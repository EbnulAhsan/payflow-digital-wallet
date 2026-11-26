import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Path } from 'react-hook-form';
import Modal from '../components/Modal';
import { problemMessage, readProblem } from '../lib/problem';
import {
  createAgentSchema,
  type CreateAgentFormValues,
} from '../schemas/admin';
import {
  errorTextClass,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from './formStyles';
import { useCreateAgent, type AgentCreated } from './usersApi';

interface CreateAgentModalProps {
  onClose: () => void;
  onCreated: (agent: AgentCreated) => void;
}

const FIELDS: {
  name: Path<CreateAgentFormValues>;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
}[] = [
  { name: 'fullName', label: 'Full name', type: 'text', autoComplete: 'off' },
  {
    name: 'mobile',
    label: 'Mobile',
    type: 'tel',
    autoComplete: 'off',
    hint: '11 digits, for example 01811000001',
  },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'off' },
  {
    name: 'password',
    label: 'Temporary password',
    type: 'password',
    autoComplete: 'new-password',
    hint: '8–64 characters with a letter and a digit. The agent sets their own password on first login.',
  },
];

// FR-ADM-03, BR-14: only admins create agents, and agents are the only
// accounts an admin creates. They start ACTIVE with a 0.00 BDT wallet.
export default function CreateAgentModal({
  onClose,
  onCreated,
}: CreateAgentModalProps) {
  const createAgent = useCreateAgent();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateAgentFormValues>({
    resolver: zodResolver(createAgentSchema),
    defaultValues: {
      fullName: '',
      mobile: '',
      email: '',
      password: '',
    },
  });

  const submit = (values: CreateAgentFormValues) =>
    createAgent.mutate(values, {
      onSuccess: onCreated,
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
    });

  const errorCode = readProblem(createAgent.error)?.code;
  const showFormError =
    createAgent.isError &&
    errorCode !== 'MOBILE_TAKEN' &&
    errorCode !== 'EMAIL_TAKEN';

  return (
    <Modal
      title="Create agent"
      description="The agent account is active at once, with an empty wallet."
      onClose={onClose}
      busy={createAgent.isPending}
    >
      <form
        noValidate
        onSubmit={(event) => {
          createAgent.reset();
          void handleSubmit(submit)(event);
        }}
        className="space-y-4"
      >
        {showFormError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            {problemMessage(createAgent.error)}
          </p>
        )}

        {FIELDS.map((field) => {
          const id = `agent-${field.name}`;
          const error = errors[field.name];
          const describedBy = [
            field.hint ? `${id}-hint` : null,
            error ? `${id}-error` : null,
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={field.name}>
              <label htmlFor={id} className={labelClass}>
                {field.label}
              </label>
              <input
                id={id}
                type={field.type}
                autoComplete={field.autoComplete}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={describedBy || undefined}
                className={inputClass}
                {...register(field.name)}
              />
              {field.hint && (
                <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
                  {field.hint}
                </p>
              )}
              {error && (
                <p id={`${id}-error`} role="alert" className={errorTextClass}>
                  {error.message}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={createAgent.isPending}
            className={secondaryButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createAgent.isPending}
            className={primaryButton}
          >
            {createAgent.isPending ? 'Creating…' : 'Create agent'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
