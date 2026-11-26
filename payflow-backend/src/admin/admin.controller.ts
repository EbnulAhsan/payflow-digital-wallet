import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuditContext } from '../audit/audit';
import type { AuthUser } from '../auth/ownership';
import { Roles } from '../auth/roles.decorator';
import {
  CreateAgentDto,
  DeactivateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './admin.dto';
import {
  AdminService,
  type AgentCreated,
  type UserPage,
  type UserSummary,
} from './admin.service';
import { ParseUserIdPipe } from './parse-user-id.pipe';

type AdminRequest = Request & { authUser?: AuthUser; requestId?: string };

@ApiTags('Administration')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Not authenticated.' })
@ApiResponse({ status: 403, description: 'FORBIDDEN_ROLE: admins only.' })
@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'Search users (FR-ADM-04)' })
  @ApiResponse({ status: 200, description: 'One page, newest first.' })
  @ApiResponse({ status: 422, description: 'Invalid filter or page.' })
  listUsers(@Query() query: ListUsersQueryDto): Promise<UserPage> {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: "One user's details, with the wallet balance" })
  @ApiResponse({ status: 200, description: 'The user.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  getUser(@Param('id', ParseUserIdPipe) userId: bigint): Promise<UserSummary> {
    return this.adminService.getUser(userId);
  }

  @Patch('users/:id')
  @ApiOperation({
    summary: 'Edit name, email, mobile and status (SRS 4.1 transitions)',
  })
  @ApiResponse({ status: 200, description: 'The updated user.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({
    status: 409,
    description: 'EMAIL_TAKEN, MOBILE_TAKEN or INVALID_STATUS_TRANSITION.',
  })
  @ApiResponse({
    status: 422,
    description:
      'FIELD_IMMUTABLE (id, role, balance), VALIDATION_FAILED (e.g. no reason for INACTIVE) or TARGET_ROLE_NOT_ALLOWED.',
  })
  updateUser(
    @Param('id', ParseUserIdPipe) userId: bigint,
    @Body() body: UpdateUserDto,
    @Req() request: AdminRequest,
  ): Promise<UserSummary> {
    return this.adminService.updateUser(userId, body, auditContext(request));
  }

  @Post('users/:id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate a pending customer or merchant (FR-ADM-01)',
  })
  @ApiResponse({ status: 200, description: 'Active; wallet exists.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'INVALID_STATUS_TRANSITION.' })
  @ApiResponse({ status: 422, description: 'TARGET_ROLE_NOT_ALLOWED.' })
  activate(
    @Param('id', ParseUserIdPipe) userId: bigint,
    @Req() request: AdminRequest,
  ): Promise<UserSummary> {
    return this.adminService.activate(userId, auditContext(request));
  }

  @Post('users/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a non-admin account with a reason (FR-ADM-02)',
  })
  @ApiResponse({ status: 200, description: 'Inactive; sessions revoked.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'INVALID_STATUS_TRANSITION.' })
  @ApiResponse({
    status: 422,
    description: 'Missing reason, or TARGET_ROLE_NOT_ALLOWED.',
  })
  deactivate(
    @Param('id', ParseUserIdPipe) userId: bigint,
    @Body() body: DeactivateUserDto,
    @Req() request: AdminRequest,
  ): Promise<UserSummary> {
    return this.adminService.deactivate(userId, body, auditContext(request));
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate an inactive account (FR-ADM-02)' })
  @ApiResponse({ status: 200, description: 'Active; balance unchanged.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'INVALID_STATUS_TRANSITION.' })
  @ApiResponse({ status: 422, description: 'TARGET_ROLE_NOT_ALLOWED.' })
  reactivate(
    @Param('id', ParseUserIdPipe) userId: bigint,
    @Req() request: AdminRequest,
  ): Promise<UserSummary> {
    return this.adminService.reactivate(userId, auditContext(request));
  }

  // FR-ADM-03, BR-14: the only account an admin creates is an agent.
  @Post('agents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an agent account (FR-ADM-03)' })
  @ApiResponse({ status: 201, description: 'Active agent with 0.00 wallet.' })
  @ApiResponse({ status: 409, description: 'MOBILE_TAKEN or EMAIL_TAKEN.' })
  @ApiResponse({ status: 422, description: 'Invalid agent details.' })
  createAgent(
    @Body() body: CreateAgentDto,
    @Req() request: AdminRequest,
  ): Promise<AgentCreated> {
    return this.adminService.createAgent(body, auditContext(request));
  }
}

function auditContext(request: AdminRequest): AuditContext {
  return {
    // JwtAuthGuard always sets authUser before an @Roles route runs.
    actorId: request.authUser ? BigInt(request.authUser.id) : null,
    ipAddress: request.ip ?? null,
    requestId: request.requestId ?? randomUUID(),
  };
}
