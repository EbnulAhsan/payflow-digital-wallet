import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPage, UserSummary } from '../admin/usersApi';
import { api } from '../lib/api';
import AdminUsers from './AdminUsers';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const user = (overrides: Partial<UserSummary>): UserSummary => ({
  id: '1',
  fullName: 'Someone',
  mobile: '01711000001',
  email: 'someone@example.com',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  statusReason: null,
  mustResetPw: false,
  balance: '2000.00',
  createdAt: '2026-11-10T08:15:02.114Z',
  updatedAt: '2026-11-11T09:00:00.000Z',
  ...overrides,
});

const pending = user({ id: '11', fullName: 'Pending Pia', status: 'PENDING' });
const active = user({ id: '12', fullName: 'Active Arif' });
const inactive = user({
  id: '13',
  fullName: 'Inactive Ira',
  status: 'INACTIVE',
  statusReason: 'Fraud check',
});
const admin = user({ id: '1', fullName: 'Admin Ada', role: 'ADMIN' });

const pageOf = (items: UserSummary[], total = items.length): UserPage => ({
  items,
  page: 1,
  size: 20,
  total,
  totalPages: Math.ceil(total / 20),
});

// RFC 9457 error as the API returns it.
function problem(status: number, code: string, detail: string) {
  const headers = new AxiosHeaders();
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: { status, code, title: detail, detail, errors: [] },
  });
}

function renderPage(fixedRole?: 'AGENT') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminUsers fixedRole={fixedRole} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The table is the md+ layout; the cards render too in jsdom (no CSS).
const table = () => within(screen.getByRole('table'));
const lastParams = () =>
  (get.mock.calls.at(-1)?.[1] as { params: Record<string, unknown> }).params;

describe('Admin users screen (FR-ADM-01 to FR-ADM-04)', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockResolvedValue({ data: pageOf([pending, active, inactive, admin]) });
  });

  it('lists users with the total count and the right action per status', async () => {
    renderPage();

    expect(
      await within(await screen.findByRole('table')).findByText('Pending Pia'),
    ).toBeInTheDocument();
    expect(screen.getByText('Showing 1–4 of 4 users')).toBeInTheDocument();
    expect(lastParams()).toEqual({
      page: 1,
      size: 20,
      q: undefined,
      role: undefined,
      status: undefined,
    });

    const rows = table().getAllByRole('row');
    const actionsIn = (name: string) =>
      within(rows.find((row) => row.textContent?.includes(name))!)
        .queryAllByRole('button')
        .map((button) => button.textContent);
    expect(actionsIn('Pending Pia')).toEqual(['Activate']);
    expect(actionsIn('Active Arif')).toEqual(['Deactivate']);
    expect(actionsIn('Inactive Ira')).toEqual(['Reactivate']);
    // FR-ADM-02 covers non-admin accounts only.
    expect(actionsIn('Admin Ada')).toEqual([]);
  });

  it('sends search, role and status filters and starts again at page 1', async () => {
    get.mockResolvedValue({ data: pageOf([active], 45) });
    renderPage();
    await within(await screen.findByRole('table')).findByText('Active Arif');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastParams().page).toBe(2));

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'MERCHANT');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'PENDING');
    await userEvent.type(screen.getByLabelText('Name or mobile'), ' 01711 ');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(lastParams()).toEqual({
        page: 1,
        size: 20,
        q: '01711',
        role: 'MERCHANT',
        status: 'PENDING',
      }),
    );
  });

  it('activates a pending user, reports it and reloads the list', async () => {
    post.mockResolvedValue({ data: { ...pending, status: 'ACTIVE' } });
    renderPage();
    await within(await screen.findByRole('table')).findByText('Pending Pia');
    const loads = get.mock.calls.length;

    await userEvent.click(
      table().getByRole('button', { name: 'Activate Pending Pia' }),
    );

    expect(post).toHaveBeenCalledWith('/admin/users/11/activate');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pending Pia is now active and has a wallet.',
    );
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(loads));
  });

  it('shows the server’s Problem Details message when an action fails', async () => {
    post.mockRejectedValue(
      problem(
        409,
        'INVALID_STATUS_TRANSITION',
        'The account is ACTIVE; this action needs INACTIVE',
      ),
    );
    renderPage();
    await within(await screen.findByRole('table')).findByText('Inactive Ira');

    await userEvent.click(
      table().getByRole('button', { name: 'Reactivate Inactive Ira' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reactivate Inactive Ira: The account is ACTIVE; this action needs INACTIVE',
    );
  });

  it('needs a reason before it deactivates, then sends it', async () => {
    post.mockResolvedValue({ data: { ...active, status: 'INACTIVE' } });
    renderPage();
    await within(await screen.findByRole('table')).findByText('Active Arif');

    await userEvent.click(
      table().getByRole('button', { name: 'Deactivate Active Arif' }),
    );
    const dialog = within(
      screen.getByRole('dialog', { name: 'Deactivate Active Arif?' }),
    );
    // The reason box gets focus when the dialog opens (WCAG 2.4.3).
    expect(dialog.getByLabelText('Reason (required)')).toHaveFocus();

    await userEvent.click(dialog.getByRole('button', { name: 'Deactivate' }));
    expect(await dialog.findByText('A reason is required')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.type(
      dialog.getByLabelText('Reason (required)'),
      '  Suspicious activity  ',
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Deactivate' }));

    expect(post).toHaveBeenCalledWith('/admin/users/12/deactivate', {
      reason: 'Suspicious activity',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Active Arif is deactivated and signed out.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the deactivate dialog with Escape and returns focus', async () => {
    renderPage();
    await within(await screen.findByRole('table')).findByText('Active Arif');
    const opener = table().getByRole('button', {
      name: 'Deactivate Active Arif',
    });

    await userEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('Create agent (FR-ADM-03)', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockResolvedValue({ data: pageOf([]) });
  });

  async function openForm() {
    renderPage('AGENT');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create agent' }),
    );
    return within(screen.getByRole('dialog', { name: 'Create agent' }));
  }

  async function fill(
    form: Awaited<ReturnType<typeof openForm>>,
    values: Record<string, string>,
  ) {
    for (const [label, value] of Object.entries(values)) {
      await userEvent.type(form.getByLabelText(label), value);
    }
  }

  it('limits the Agents screen to agents', async () => {
    renderPage('AGENT');
    await screen.findByText('No agents match these filters.');
    expect(lastParams().role).toBe('AGENT');
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
  });

  it('validates the fields with the NFR-SEC-01 rules before sending', async () => {
    const form = await openForm();
    await fill(form, {
      'Full name': 'Agent Mirpur',
      Mobile: '0171100',
      Email: 'agent@',
      'Temporary password': 'onlyletters',
    });
    await userEvent.click(form.getByRole('button', { name: 'Create agent' }));

    expect(
      await form.findByText('Enter an 11-digit mobile number like 01711000001'),
    ).toBeInTheDocument();
    expect(form.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(form.getByText('Include at least one digit')).toBeInTheDocument();
    expect(form.getByLabelText('Mobile')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('creates the agent and reports it', async () => {
    post.mockResolvedValue({
      data: {
        ...user({ id: '30', fullName: 'Agent Mirpur', role: 'AGENT' }),
        mobile: '01811000001',
        wallet: { id: '31', balance: '0.00' },
      },
    });
    const form = await openForm();
    await fill(form, {
      'Full name': 'Agent Mirpur',
      Mobile: '01811000001',
      Email: 'mirpur@example.com',
      'Temporary password': 'Agent0Pass9x',
    });
    await userEvent.click(form.getByRole('button', { name: 'Create agent' }));

    expect(post).toHaveBeenCalledWith('/admin/agents', {
      fullName: 'Agent Mirpur',
      mobile: '01811000001',
      email: 'mirpur@example.com',
      password: 'Agent0Pass9x',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Agent Agent Mirpur (01811000001) is created',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['MOBILE_TAKEN', 'Mobile', 'This mobile number is already in use'],
    ['EMAIL_TAKEN', 'Email', 'This email address is already in use'],
  ])('shows 409 %s next to the %s field', async (code, label, message) => {
    post.mockRejectedValue(problem(409, code, 'Already in use'));
    const form = await openForm();
    await fill(form, {
      'Full name': 'Agent Mirpur',
      Mobile: '01811000001',
      Email: 'mirpur@example.com',
      'Temporary password': 'Agent0Pass9x',
    });
    await userEvent.click(form.getByRole('button', { name: 'Create agent' }));

    expect(await form.findByText(message)).toBeInTheDocument();
    expect(form.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    // The dialog stays open so the admin can correct the field.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// FR-ADM-04 table, with a View / Edit link per row; FR-ADM-02, BR-11: no
// delete; FR-ADM-03, BR-14: admins create agents only.
describe('Users table columns and row actions', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({
      data: pageOf([
        { ...pending, balance: null },
        active,
        { ...admin, balance: null },
      ]),
    });
  });

  it('shows the SRS columns, the balance in ৳ and a View / Edit link per row', async () => {
    renderPage();
    const list = within(await screen.findByRole('table'));
    await list.findByText('Active Arif');

    expect(
      list.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual([
      'Name',
      'Email',
      'Phone',
      'Balance (BDT)',
      'Role',
      'Status',
      'Registered Date',
      'Action',
    ]);
    const row = list
      .getAllByRole('row')
      .find((candidate) => candidate.textContent?.includes('Active Arif'))!;
    expect(row).toHaveTextContent('৳ 2,000.00');
    expect(row).toHaveTextContent('10 Nov 2026');

    for (const name of ['Pending Pia', 'Active Arif', 'Admin Ada']) {
      expect(
        list.getByRole('link', { name: `View or edit ${name}` }),
      ).toHaveAttribute(
        'href',
        `/admin/users/${name === 'Pending Pia' ? 11 : name === 'Active Arif' ? 12 : 1}`,
      );
    }
  });

  it('never offers to delete a user', async () => {
    renderPage();
    await within(await screen.findByRole('table')).findByText('Active Arif');

    expect(
      screen.queryByRole('button', { name: /delete/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it('creates agents only: the form has no role choice', async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create agent' }),
    );
    const form = within(screen.getByRole('dialog', { name: 'Create agent' }));

    expect(form.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(form.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
