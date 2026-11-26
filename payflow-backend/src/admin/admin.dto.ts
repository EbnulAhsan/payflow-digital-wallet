import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
  MinLength,
} from 'class-validator';
import { RegisterDto } from '../auth/register.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** FR-ADM-04: GET /admin/users query. SRS 5.3: page from 1, size 1-100. */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size = 20;

  @ApiPropertyOptional({
    description: 'Matches part of the full name or mobile number',
    maxLength: 120,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

/** FR-ADM-02: a deactivation must give a reason (users.status_reason). */
export class DeactivateUserDto {
  @ApiProperty({ example: 'Suspicious activity reported', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  reason!: string;
}

/**
 * FR-ADM-03: the same name, mobile, email and password rules as
 * self-registration (NFR-SEC-01); the role is always AGENT.
 */
export class CreateAgentDto extends OmitType(RegisterDto, ['role'] as const) {}

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * PATCH /admin/users/{id}: the admin view/edit screen. Name, email, mobile
 * (the wallet number, SRS 1.2) and status are editable. id, role (SRS 1.3)
 * and balance (FR-ADM-08, BR-13) are accepted here only so the service can
 * answer 422 FIELD_IMMUTABLE (SRS 5.3) instead of a generic error.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Rahim Uddin', maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: 'rahim@example.com', maxLength: 254 })
  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '01711000001' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^01[3-9]\d{8}$/)
  mobile?: string;

  @ApiPropertyOptional({
    enum: UserStatus,
    description:
      'SRS 4.1: PENDING -> ACTIVE or REJECTED, ACTIVE -> INACTIVE, INACTIVE -> ACTIVE',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description:
      'Required with status INACTIVE (FR-ADM-02); optional with REJECTED',
    maxLength: 255,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional({ description: 'Not editable: 422 FIELD_IMMUTABLE' })
  @Allow()
  id?: unknown;

  @ApiPropertyOptional({ description: 'Not editable: 422 FIELD_IMMUTABLE' })
  @Allow()
  role?: unknown;

  @ApiPropertyOptional({ description: 'Not editable: 422 FIELD_IMMUTABLE' })
  @Allow()
  balance?: unknown;
}
