import { HttpException, Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { type AuditContext, writeAudit } from '../audit/audit';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateAgentDto,
  DeactivateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './admin.dto';

const USER_SUMMARY_SELECT = {
  id: true,
  fullName: true,
  mobile: true,
  email: true,
  role: true,
  status: true,
  statusReason: true,
  mustResetPw: true,
  createdAt: true,
  updatedAt: true,
  wallet: { select: { balance: true } },
} satisfies Prisma.UserSelect;

type UserSummaryRow = Prisma.UserGetPayload<{
  select: typeof USER_SUMMARY_SELECT;
}>;

export interface UserSummary {
  id: string;
  fullName: string;
  // Also the wallet number (SRS 1.2, Q3).
  mobile: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  statusReason: string | null;
  mustResetPw: boolean;
  // Decimal string (SRS 5.3); null until the account has a wallet.
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

interface LockedUser {
  id: bigint;
  role: UserRole;
  status: UserStatus;
  statusReason: string | null;
}

const ACTIVATABLE_ROLES: readonly UserRole[] = [
  UserRole.CUSTOMER,
  UserRole.MERCHANT,
];

// SRS 4.1 account status machine. REJECTED is final.
const ALLOWED_TRANSITIONS: Record<UserStatus, readonly UserStatus[]> = {
  [UserStatus.PENDING]: [UserStatus.ACTIVE, UserStatus.REJECTED],
  [UserStatus.ACTIVE]: [UserStatus.INACTIVE],
  [UserStatus.INACTIVE]: [UserStatus.ACTIVE],
  [UserStatus.REJECTED]: [],
};

// Statuses that record why (users.status_reason).
const REASONED_STATUSES: readonly UserStatus[] = [
  UserStatus.INACTIVE,
  UserStatus.REJECTED,
];

// Fields an admin may never set: SRS 1.3 (role), FR-ADM-08 and BR-13
// (balance), and the primary key.
const IMMUTABLE_FIELDS = ['id', 'role', 'balance'] as const;
const PROFILE_FIELDS = ['fullName', 'email', 'mobile'] as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** FR-ADM-04: filtered, paginated, newest first, with a total count. */
  async listUsers(query: ListUsersQueryDto): Promise<UserPage> {
    const where: Prisma.UserWhereInput = {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { mobile: { contains: query.q } },
        ],
      }),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: USER_SUMMARY_SELECT,
        // id breaks ties so pages stay stable when rows share a timestamp.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.size,
        take: query.size,
      }),
    ]);

    return {
      items: rows.map(toSummary),
      page: query.page,
      size: query.size,
      total,
      totalPages: Math.ceil(total / query.size),
    };
  }

  /** One user's details for the admin view/edit screen. */
  async getUser(userId: bigint): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SUMMARY_SELECT,
    });
    if (!user) {
      throw notFound();
    }
    return toSummary(user);
  }

  /** FR-ADM-01, FR-WAL-01: PENDING -> ACTIVE. */
  async activate(userId: bigint, audit: AuditContext): Promise<UserSummary> {
    return this.changeStatus(userId, UserStatus.ACTIVE, null, audit, [
      UserStatus.PENDING,
    ]);
  }

  /** FR-ADM-02, FR-AUTH-03, Q9: ACTIVE -> INACTIVE with a reason. */
  async deactivate(
    userId: bigint,
    body: DeactivateUserDto,
    audit: AuditContext,
  ): Promise<UserSummary> {
    return this.changeStatus(userId, UserStatus.INACTIVE, body.reason, audit, [
      UserStatus.ACTIVE,
    ]);
  }

  /** FR-ADM-02: INACTIVE -> ACTIVE; the existing wallet and balance are kept. */
  async reactivate(userId: bigint, audit: AuditContext): Promise<UserSummary> {
    return this.changeStatus(userId, UserStatus.ACTIVE, null, audit, [
      UserStatus.INACTIVE,
    ]);
  }

  /**
   * Admin view/edit screen: name, email, mobile and status in one
   * transaction. The role, balance and ID never change. A status change has
   * exactly the effects of the activate, deactivate and reactivate endpoints;
   * every change writes its own audit row (BR-16).
   */
  async updateUser(
    userId: bigint,
    body: UpdateUserDto,
    audit: AuditContext,
  ): Promise<UserSummary> {
    for (const field of IMMUTABLE_FIELDS) {
      if (body[field] !== undefined) {
        throw problem(
          422,
          'FIELD_IMMUTABLE',
          'Field cannot be changed',
          `${field} cannot be changed`,
          [`${field}: ${field} cannot be changed`],
        );
      }
    }
    if (
      PROFILE_FIELDS.every((field) => body[field] === undefined) &&
      body.status === undefined
    ) {
      throw validationFailed(
        'fullName: send at least one of fullName, email, mobile or status',
      );
    }
    if (
      body.reason !== undefined &&
      (body.status === undefined || !REASONED_STATUSES.includes(body.status))
    ) {
      throw validationFailed(
        'reason: a reason is only used when status is INACTIVE or REJECTED',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const locked = await lockUser(transaction, userId);
        const current = await transaction.user.findUniqueOrThrow({
          where: { id: userId },
          select: USER_SUMMARY_SELECT,
        });

        const before: Record<string, string> = {};
        const after: Record<string, string> = {};
        for (const field of PROFILE_FIELDS) {
          const next = body[field];
          if (next !== undefined && next !== current[field]) {
            before[field] = current[field];
            after[field] = next;
          }
        }
        if (Object.keys(after).length > 0) {
          await transaction.user.update({
            where: { id: userId },
            data: { ...after, updatedAt: new Date() },
          });
          await writeAudit(transaction, audit, {
            action: 'ACCOUNT_UPDATED',
            entityType: 'USER',
            entityId: userId,
            before,
            after,
          });
        }

        if (body.status !== undefined && body.status !== locked.status) {
          await applyStatusChange(
            transaction,
            locked,
            body.status,
            body.reason ?? null,
            audit,
          );
        }

        return toSummary(
          await transaction.user.findUniqueOrThrow({
            where: { id: userId },
            select: USER_SUMMARY_SELECT,
          }),
        );
      });
    } catch (error) {
      throw duplicateProblem(error) ?? error;
    }
  }

  // The dedicated status endpoints: the same change as PATCH, but the
  // account must start in the endpoint's own "from" status.
  private changeStatus(
    userId: bigint,
    target: UserStatus,
    reason: string | null,
    audit: AuditContext,
    from: readonly UserStatus[],
  ): Promise<UserSummary> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await lockUser(transaction, userId);
      checkRole(user, target);
      // The activate endpoint is for customers and merchants only, whatever
      // their current status (FR-ADM-01).
      if (
        from.includes(UserStatus.PENDING) &&
        !ACTIVATABLE_ROLES.includes(user.role)
      ) {
        throw roleNotAllowed(
          'Only customer and merchant accounts are activated',
        );
      }
      if (!from.includes(user.status)) {
        throw invalidTransition(user.status, target);
      }
      await applyStatusChange(transaction, user, target, reason, audit);
      return toSummary(
        await transaction.user.findUniqueOrThrow({
          where: { id: userId },
          select: USER_SUMMARY_SELECT,
        }),
      );
    });
  }

  /**
   * FR-ADM-03, BR-14: agents are created only here, never self-registered.
   * They start ACTIVE with their one 0.00 BDT wallet (FR-WAL-01) and must
   * replace the temporary password on first login. SRS 1.3: the role is
   * fixed; no endpoint changes it.
   */
  async createAgent(
    body: CreateAgentDto,
    audit: AuditContext,
  ): Promise<AgentCreated> {
    // Checked first so a duplicate does not pay for an Argon2id hash; the
    // unique constraints below still decide when two requests race.
    if (await this.prisma.user.findUnique({ where: { mobile: body.mobile } })) {
      throw mobileTaken();
    }
    if (await this.prisma.user.findUnique({ where: { email: body.email } })) {
      throw emailTaken();
    }

    const passwordHash = await hashPassword(body.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const account = await transaction.user.create({
          data: {
            fullName: body.fullName,
            mobile: body.mobile,
            email: body.email,
            passwordHash,
            role: UserRole.AGENT,
            status: UserStatus.ACTIVE,
            mustResetPw: true,
          },
          select: USER_SUMMARY_SELECT,
        });
        const wallet = await transaction.wallet.create({
          data: { userId: account.id },
          select: { id: true, balance: true },
        });

        await writeAudit(transaction, audit, {
          action: 'AGENT_CREATED',
          entityType: 'USER',
          entityId: account.id,
          after: {
            fullName: account.fullName,
            mobile: account.mobile,
            email: account.email,
            role: account.role,
            status: account.status,
            mustResetPw: account.mustResetPw,
            walletId: wallet.id.toString(),
          },
        });

        return {
          ...toSummary(account),
          wallet: {
            id: wallet.id.toString(),
            balance: wallet.balance.toFixed(2),
          },
        };
      });
    } catch (error) {
      throw duplicateProblem(error) ?? error;
    }
  }
}

/**
 * Reads the user row under FOR UPDATE, so two admins changing the same account
 * at once are applied one after the other and each sees the other's result.
 */
async function lockUser(
  transaction: Prisma.TransactionClient,
  userId: bigint,
): Promise<LockedUser> {
  const rows = await transaction.$queryRaw<LockedUser[]>`
    SELECT id, role::text AS role, status::text AS status,
           status_reason AS "statusReason"
    FROM users
    WHERE id = ${userId}
    FOR UPDATE
  `;
  const user = rows[0];
  if (!user) {
    throw notFound();
  }
  return user;
}

function roleNotAllowed(detail: string): HttpException {
  return problem(422, 'TARGET_ROLE_NOT_ALLOWED', 'Role not allowed', detail);
}

function mobileTaken(): HttpException {
  return problem(
    409,
    'MOBILE_TAKEN',
    'Mobile number is already in use',
    'Mobile number is already in use',
  );
}

function emailTaken(): HttpException {
  return problem(
    409,
    'EMAIL_TAKEN',
    'Email address is already in use',
    'Email address is already in use',
  );
}

function duplicateProblem(error: unknown): HttpException | undefined {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return undefined;
  }
  const target = error.meta?.target;
  const fields = (Array.isArray(target) ? target : [target]).map(String);
  if (fields.some((field) => field.includes('mobile'))) {
    return mobileTaken();
  }
  if (fields.some((field) => field.includes('email'))) {
    return emailTaken();
  }
  return undefined;
}

function problem(
  status: number,
  code: string,
  title: string,
  detail: string,
  // Field messages, shown as `errors` in the Problem Details body.
  message?: string[],
): HttpException {
  return new HttpException({ code, title, detail, message }, status);
}

function toSummary(user: UserSummaryRow): UserSummary {
  return {
    id: user.id.toString(),
    fullName: user.fullName,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
    status: user.status,
    statusReason: user.statusReason,
    mustResetPw: user.mustResetPw,
    balance: user.wallet ? user.wallet.balance.toFixed(2) : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * The one place a user's status changes (SRS 4.1), with its side effects and
 * audit rows, inside the caller's transaction on a row locked FOR UPDATE.
 */
async function applyStatusChange(
  transaction: Prisma.TransactionClient,
  user: LockedUser,
  target: UserStatus,
  reason: string | null,
  audit: AuditContext,
): Promise<void> {
  checkRole(user, target);
  if (!ALLOWED_TRANSITIONS[user.status].includes(target)) {
    throw invalidTransition(user.status, target);
  }
  const statusReason = reason?.trim() || null;
  // FR-ADM-02: a deactivation always needs a reason.
  if (target === UserStatus.INACTIVE && !statusReason) {
    throw validationFailed('reason: a reason is required to deactivate');
  }

  const now = new Date();
  await transaction.user.update({
    where: { id: user.id },
    data: {
      status: target,
      statusReason: REASONED_STATUSES.includes(target) ? statusReason : null,
      updatedAt: now,
    },
  });
  const before = { status: user.status, statusReason: user.statusReason };

  if (user.status === UserStatus.PENDING && target === UserStatus.ACTIVE) {
    // FR-WAL-01: one wallet at 0.00 BDT, created on first activation; upsert
    // never makes a second one.
    const wallet = await transaction.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
      select: { id: true },
    });
    await writeAudit(transaction, audit, {
      action: 'ACCOUNT_ACTIVATED',
      entityType: 'USER',
      entityId: user.id,
      before: { status: user.status },
      after: { status: target, walletId: wallet.id.toString() },
    });
    return;
  }

  if (target === UserStatus.REJECTED) {
    // SRS 4.1 (Q8 default): a pending registration is refused for good.
    await writeAudit(transaction, audit, {
      action: 'ACCOUNT_REJECTED',
      entityType: 'USER',
      entityId: user.id,
      before,
      after: { status: target, statusReason },
    });
    return;
  }

  if (target === UserStatus.INACTIVE) {
    // FR-AUTH-03: sessions end at once. Q9: pending cash-outs are cancelled.
    // The wallet and its balance are untouched (FR-ADM-02).
    const revoked = await transaction.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    // RETURNING gives exactly the rows this statement cancelled, so each one
    // gets its own audit row (BR-16).
    const cancelled = await transaction.$queryRaw<{ id: bigint }[]>`
      UPDATE cashout_requests
      SET status = 'CANCELLED', decided_at = ${now}
      WHERE status = 'PENDING_AUTHORIZATION'
        AND (agent_id = ${user.id} OR customer_id = ${user.id})
      RETURNING id
    `;
    await writeAudit(transaction, audit, {
      action: 'ACCOUNT_DEACTIVATED',
      entityType: 'USER',
      entityId: user.id,
      before,
      after: {
        status: target,
        statusReason,
        revokedSessions: revoked.count,
        cancelledCashoutRequestIds: cancelled.map(({ id }) => id.toString()),
      },
    });
    for (const { id } of cancelled) {
      await writeAudit(transaction, audit, {
        action: 'CASHOUT_CANCELLED',
        entityType: 'CASHOUT_REQUEST',
        entityId: id,
        before: { status: 'PENDING_AUTHORIZATION' },
        after: { status: 'CANCELLED', cause: 'ACCOUNT_DEACTIVATED' },
      });
    }
    return;
  }

  // INACTIVE -> ACTIVE: the existing wallet and balance are kept.
  await writeAudit(transaction, audit, {
    action: 'ACCOUNT_REACTIVATED',
    entityType: 'USER',
    entityId: user.id,
    before,
    after: { status: target },
  });
}

// FR-ADM-01: only self-registered customers and merchants are activated or
// rejected; FR-ADM-02: admin accounts are never deactivated or reactivated.
function checkRole(user: LockedUser, target: UserStatus): void {
  if (user.role === UserRole.ADMIN) {
    throw roleNotAllowed("Administrator accounts' status cannot be changed");
  }
  if (
    user.status === UserStatus.PENDING &&
    (target === UserStatus.ACTIVE || target === UserStatus.REJECTED) &&
    !ACTIVATABLE_ROLES.includes(user.role)
  ) {
    throw roleNotAllowed(
      'Only customer and merchant accounts are activated or rejected',
    );
  }
}

function invalidTransition(from: UserStatus, to: UserStatus): HttpException {
  const allowed = ALLOWED_TRANSITIONS[from];
  return problem(
    409,
    'INVALID_STATUS_TRANSITION',
    'Invalid status transition',
    allowed.length > 0
      ? `A ${from} account can move to ${allowed.join(' or ')}, not ${to}`
      : `A ${from} account cannot change status`,
  );
}

function notFound(): HttpException {
  return problem(404, 'NOT_FOUND', 'Not found', 'User not found');
}

function validationFailed(message: string): HttpException {
  return problem(
    422,
    'VALIDATION_FAILED',
    'Validation failed',
    'Request validation failed',
    [message],
  );
}
