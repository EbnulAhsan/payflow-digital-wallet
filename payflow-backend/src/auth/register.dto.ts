import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { NotCommonBreachedPasswordConstraint } from './not-common-password.validator';

export class RegisterDto {
  @ApiProperty({ example: 'Rahim Uddin', maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: '01711000001' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^01[3-9]\d{8}$/)
  mobile!: string;

  @ApiProperty({ example: 'rahim@example.com', maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 64 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/)
  @Validate(NotCommonBreachedPasswordConstraint)
  password!: string;

  @ApiProperty({ enum: ['CUSTOMER', 'MERCHANT'], example: 'CUSTOMER' })
  @IsIn(['CUSTOMER', 'MERCHANT'])
  role!: 'CUSTOMER' | 'MERCHANT';
}
