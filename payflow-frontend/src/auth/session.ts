// The access token lives only in memory: it is never written to localStorage,
// so a script injected into the page cannot read it. A reload loses it, and
// the httpOnly refresh cookie is used to get a new one (see AuthProvider).
let accessToken: string | null = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

// The axios client lives outside React, so it tells the AuthProvider through
// this small listener list when a refresh has failed.
type Listener = () => void;
const expiredListeners = new Set<Listener>();

export function onSessionExpired(listener: Listener) {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

export function notifySessionExpired() {
  setAccessToken(null);
  expiredListeners.forEach((listener) => listener());
}
