import axios, { isAxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  getAccessToken,
  notifySessionExpired,
  setAccessToken,
} from '../auth/session';
import type { AuthResponse } from '../auth/types';

const baseURL = import.meta.env.VITE_API_BASE_URL;

// SRS 5.3: base path /api/v1. The refresh token travels as an httpOnly cookie.
export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// A bare client for the refresh call, so it never runs through the
// interceptors below: a failing refresh must not start another refresh.
const refreshClient = axios.create({ baseURL, withCredentials: true });

// Only one refresh at a time. The refresh token rotates on use (NFR-SEC-04),
// so a second parallel call with the old cookie would look like token reuse.
let refreshInFlight: Promise<AuthResponse> | null = null;

export function refreshSession(): Promise<AuthResponse> {
  refreshInFlight ??= refreshClient
    .post<AuthResponse>('/auth/refresh')
    .then((response) => {
      setAccessToken(response.data.accessToken);
      return response.data;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetriableRequest = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error) || !error.config) {
      throw error;
    }

    const request = error.config as RetriableRequest;
    // /auth/login, /auth/refresh and /auth/logout report their own 401s.
    const isAuthCall = request.url?.startsWith('/auth/');
    if (error.response?.status !== 401 || request._retried || isAuthCall) {
      throw error;
    }

    request._retried = true;
    try {
      await refreshSession();
    } catch {
      notifySessionExpired();
      throw error;
    }
    return api(request);
  },
);
