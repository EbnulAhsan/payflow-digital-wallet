import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { AuthResponse } from '../auth/types';

// The API client is tested through a fake axios adapter, so no network and
// no server are needed. The adapter is set on the axios defaults before the
// client module is loaded, so both the main client and the bare refresh
// client created inside it use it.

interface FakeReply {
  status: number;
  data?: unknown;
}

interface Call {
  method: string;
  url: string;
  authorization: string;
}

let calls: Call[] = [];
let respond: (call: Call) => FakeReply = () => ({ status: 200 });

const fakeAdapter = async (config: InternalAxiosRequestConfig) => {
  const call: Call = {
    method: (config.method ?? 'get').toLowerCase(),
    url: config.url ?? '',
    authorization: String(config.headers.Authorization ?? ''),
  };
  calls.push(call);

  const { status, data } = respond(call);
  const response = { data, status, statusText: '', headers: {}, config };
  if (status >= 200 && status < 300) return response;
  throw new AxiosError(
    `HTTP ${status}`,
    String(status),
    config,
    null,
    response,
  );
};

const refreshReply = (accessToken: string): FakeReply => ({
  status: 200,
  data: {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: '1',
      fullName: 'Rahim Uddin',
      mobile: '01711000001',
      email: 'rahim@example.com',
      role: 'CUSTOMER',
    },
  } satisfies AuthResponse,
});

const refreshCalls = () =>
  calls.filter((c) => c.method === 'post' && c.url === '/auth/refresh');

let api: typeof import('./api').api;
let session: typeof import('../auth/session');

beforeAll(async () => {
  axios.defaults.adapter = fakeAdapter;
  ({ api } = await import('./api'));
  session = await import('../auth/session');
});

beforeEach(() => {
  calls = [];
  respond = () => ({ status: 200 });
  session.setAccessToken(null);
});

afterEach(() => {
  session.setAccessToken(null);
});

describe('authenticated API client', () => {
  it('sends the access token as a Bearer header', async () => {
    session.setAccessToken('token-1');
    await api.get('/wallet');

    expect(calls[0].authorization).toBe('Bearer token-1');
  });

  it('sends no Authorization header when there is no token', async () => {
    await api.get('/wallet');

    expect(calls[0].authorization).toBe('');
  });

  describe('401 on a protected request', () => {
    it('refreshes the session and retries the request with the new token', async () => {
      session.setAccessToken('old-token');
      respond = (call) => {
        if (call.url === '/auth/refresh') return refreshReply('new-token');
        return call.authorization === 'Bearer new-token'
          ? { status: 200, data: { balance: '2000.00' } }
          : { status: 401 };
      };

      const response = await api.get('/wallet');

      expect(response.data).toEqual({ balance: '2000.00' });
      expect(refreshCalls()).toHaveLength(1);
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        'get /wallet',
        'post /auth/refresh',
        'get /wallet',
      ]);
      expect(session.getAccessToken()).toBe('new-token');
    });

    it('shares one refresh between parallel requests', async () => {
      session.setAccessToken('old-token');
      respond = (call) => {
        if (call.url === '/auth/refresh') return refreshReply('new-token');
        return call.authorization === 'Bearer new-token'
          ? { status: 200 }
          : { status: 401 };
      };

      await Promise.all([api.get('/wallet'), api.get('/transactions')]);

      expect(refreshCalls()).toHaveLength(1);
    });

    it('does not retry forever when the retried request is still 401', async () => {
      session.setAccessToken('old-token');
      respond = (call) =>
        call.url === '/auth/refresh'
          ? refreshReply('new-token')
          : { status: 401 };

      await expect(api.get('/wallet')).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(refreshCalls()).toHaveLength(1);
      expect(calls.filter((c) => c.url === '/wallet')).toHaveLength(2);
    });
  });

  describe('refresh fails', () => {
    it('reports the expired session, clears the token and rejects the request', async () => {
      session.setAccessToken('old-token');
      respond = () => ({ status: 401 });
      const onExpired = vi.fn();
      const unsubscribe = session.onSessionExpired(onExpired);

      await expect(api.get('/wallet')).rejects.toMatchObject({
        response: { status: 401 },
      });

      unsubscribe();
      expect(onExpired).toHaveBeenCalledTimes(1);
      expect(session.getAccessToken()).toBeNull();
      // One protected call and one refresh: a failing refresh must not
      // start another refresh.
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        'get /wallet',
        'post /auth/refresh',
      ]);
    });
  });

  describe('requests that must not trigger a refresh', () => {
    it('does not refresh after a 401 from /auth/login', async () => {
      respond = () => ({ status: 401 });

      await expect(api.post('/auth/login', {})).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(refreshCalls()).toHaveLength(0);
    });

    it.each([403, 422, 500])('does not refresh after a %i', async (status) => {
      respond = () => ({ status });

      await expect(api.get('/wallet')).rejects.toMatchObject({
        response: { status },
      });
      expect(refreshCalls()).toHaveLength(0);
    });
  });
});
