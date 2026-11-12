import {
  Body,
  Controller,
  HttpStatus,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
import { AuthService, LoginResponse, RegisterResponse } from './auth.service';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a customer or merchant account' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Pending account created.' })
  @ApiResponse({ status: 409, description: 'Mobile number or email is taken.' })
  @ApiResponse({ status: 422, description: 'Registration input is invalid.' })
  register(@Body() registration: RegisterDto): Promise<RegisterResponse> {
    return this.authService.register(registration);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Log in with a mobile number or email and password',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Access token returned; refresh token set as a secure cookie.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 403, description: 'Account is not active.' })
  @ApiResponse({ status: 429, description: 'Login rate limit exceeded.' })
  async login(
    @Body() credentials: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(credentials);

    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: REFRESH_COOKIE_TTL_MS,
      expires: result.refreshExpiresAt,
    });

    return result.response;
  }
}
