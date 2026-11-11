import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { LoginDto } from './login.dto';
import { AuthService, LoginResponse } from './auth.service';
import { Public } from './public.decorator';
import { readCookie } from './refresh-cookie';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Log in with a mobile number or email and password' })
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
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: REFRESH_COOKIE_TTL_MS,
      expires: result.refreshExpiresAt,
    });

    return result.response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Rotate the refresh token and renew the access token' })
  @ApiResponse({
    status: 200,
    description: 'Access token returned; rotated refresh token set as a cookie.',
  })
  @ApiResponse({ status: 401, description: 'Refresh token is invalid or revoked.' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.refresh(
      readCookie(request, REFRESH_COOKIE_NAME),
    );

    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: REFRESH_COOKIE_TTL_MS,
      expires: result.refreshExpiresAt,
    });

    return result.response;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Public()
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  @ApiResponse({ status: 204, description: 'Refresh token revoked.' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(readCookie(request, REFRESH_COOKIE_NAME));
    response.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  }
}
