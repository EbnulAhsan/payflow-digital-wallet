import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Role } from '../auth/types';
import { api } from '../lib/api';
import type {
  CreateAgentFormValues,
  DeactivateFormValues,
  EditUserFormValues,
} from '../schemas/admin';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED';

// Shapes of the admin API (backend src/admin/admin.service.ts).
export interface UserSummary {
  id: string;
  fullName: string;
  // Also the wallet number (SRS 1.2, Q3).
  mobile: string;
  email: string;
  role: Role;
  status: UserStatus;
  statusReason: string | null;
  mustResetPw: boolean;
  // Decimal string such as "2000.00"; null until the account has a wallet.
  balance: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPage {
  items: UserSummary[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface AgentCreated extends UserSummary {
  wallet: { id: string; balance: string };
}

export interface UserFilters {
  q: string;
  role: Role | 'ALL';
  status: UserStatus | 'ALL';
  page: number;
  size: number;
}

// Every user-list query starts with this key, so one invalidation refreshes
// all pages and filters after a change.
const USERS_KEY = ['admin', 'users'] as const;

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: [...USERS_KEY, filters],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<UserPage>('/admin/users', {
        signal,
        params: {
          page: filters.page,
          size: filters.size,
          // Send only the filters in use; "ALL" means no filter.
          q: filters.q || undefined,
          role: filters.role === 'ALL' ? undefined : filters.role,
          status: filters.status === 'ALL' ? undefined : filters.status,
        },
      });
      return data;
    },
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

function useInvalidatingMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useActivateUser() {
  return useInvalidatingMutation(async (user: UserSummary) => {
    const { data } = await api.post<UserSummary>(
      `/admin/users/${user.id}/activate`,
    );
    return data;
  });
}

export function useDeactivateUser() {
  return useInvalidatingMutation(
    async ({
      user,
      values,
    }: {
      user: UserSummary;
      values: DeactivateFormValues;
    }) => {
      const { data } = await api.post<UserSummary>(
        `/admin/users/${user.id}/deactivate`,
        values,
      );
      return data;
    },
  );
}

export function useReactivateUser() {
  return useInvalidatingMutation(async (user: UserSummary) => {
    const { data } = await api.post<UserSummary>(
      `/admin/users/${user.id}/reactivate`,
    );
    return data;
  });
}

// FR-ADM-03, BR-14: the only account an admin creates is an agent.
export function useCreateAgent() {
  return useInvalidatingMutation(async (values: CreateAgentFormValues) => {
    const { data } = await api.post<AgentCreated>('/admin/agents', values);
    return data;
  });
}

// Under USERS_KEY, so a change anywhere refreshes both the list and the user.
export function useUser(id: string) {
  return useQuery({
    queryKey: [...USERS_KEY, 'detail', id],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<UserSummary>(`/admin/users/${id}`, {
        signal,
      });
      return data;
    },
  });
}

/** The fields the edit screen changed; the API never takes role or balance. */
export type UserChanges = Partial<EditUserFormValues>;

export function useUpdateUser() {
  return useInvalidatingMutation(
    async ({ id, changes }: { id: string; changes: UserChanges }) => {
      const { data } = await api.patch<UserSummary>(
        `/admin/users/${id}`,
        changes,
      );
      return data;
    },
  );
}
