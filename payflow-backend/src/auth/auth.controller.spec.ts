import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService, LoginResult } from './auth.service';

const result: LoginResult = {
  response: {
    accessToken: 'jwt',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: '1',
      fullName: 'Rahim',
      mobile: '01711000001',
      email: 'rahim@example.com',
      role: 'CUSTOMER',
    },
  },
  refreshToken: 'refresh',
  refreshExpiresAt: new Date('2026-11-20T00:00:00Z'),
};

function setup() {
  const service = {
    register: jest.fn().mockResolvedValue({ id: '1', status: 'PENDING' }),
    login: jest.fn().mockResolvedValue(result),
    refresh: jest.fn().mockResolvedValue(result),
    logout: jest.fn().mockResolvedValue(undefined),
  };
  const response = { cookie: jest.fn(), clearCookie: jest.fn() };
  const controller = new AuthController(service as unknown as AuthService);
  return {
    controller,
    service,
    response: response as unknown as Response,
    raw: response,
  };
}

const requestWithCookie = (cookie?: string) =>
  ({ headers: { cookie } }) as unknown as Request;

// NFR-SEC-05: the refresh cookie is HttpOnly, Secure and SameSite=Strict.
const cookieOptions = expect.objectContaining({
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/v1/auth',
});

describe('AuthController', () => {
  it('registers through the service', async () => {
    const { controller, service } = setup();
    const dto = { fullName: 'Rahim' } as never;

    await expect(controller.register(dto)).resolves.toEqual({
      id: '1',
      status: 'PENDING',
    });
    expect(service.register).toHaveBeenCalledWith(dto);
  });

  it('login returns the access token and sets the refresh cookie', async () => {
    const { controller, response, raw } = setup();

    await expect(
      controller.login({ identifier: 'x', password: 'y' }, response),
    ).resolves.toBe(result.response);
    expect(raw.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh',
      cookieOptions,
    );
  });

  it('refresh reads the cookie and rotates it', async () => {
    const { controller, service, response, raw } = setup();

    await controller.refresh(requestWithCookie('refresh_token=old'), response);

    expect(service.refresh).toHaveBeenCalledWith('old');
    expect(raw.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh',
      cookieOptions,
    );
  });

  it('logout revokes the token and clears the cookie', async () => {
    const { controller, service, response, raw } = setup();

    await controller.logout(requestWithCookie('refresh_token=old'), response);

    expect(service.logout).toHaveBeenCalledWith('old');
    expect(raw.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      cookieOptions,
    );
  });
});
