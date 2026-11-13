import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession } from '../lib/api';
import { AuthContext, type AuthStatus } from './authContext';
import { onSessionExpired, setAccessToken } from './session';
import type { AuthResponse, AuthUser } from './types';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const startSession = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken);
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
    // Cached data belongs to the user who just left.
    queryClient.clear();
  }, [queryClient]);

  // After a page reload the in-memory token is gone; the httpOnly refresh
  // cookie gets the session back. refreshSession() shares one request, so
  // React StrictMode running this effect twice does not refresh twice.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((response) => {
        if (active) startSession(response);
      })
      .catch(() => {
        if (active) endSession();
      });
    return () => {
      active = false;
    };
  }, [startSession, endSession]);

  // The API client reports a failed refresh here.
  useEffect(() => onSessionExpired(endSession), [endSession]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // The session is cleared locally even if the server cannot be reached.
    }
    endSession();
  }, [endSession]);

  const value = useMemo(
    () => ({ user, status, startSession, logout }),
    [user, status, startSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
