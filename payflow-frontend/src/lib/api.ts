import axios from 'axios';

// SRS 5.3: base path /api/v1. The refresh token travels as an httpOnly cookie.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
