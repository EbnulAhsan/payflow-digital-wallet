export type Role = 'ADMIN' | 'AGENT' | 'CUSTOMER' | 'MERCHANT';

export interface AuthUser {
  id: string;
  fullName: string;
  mobile: string;
  email: string;
  role: Role;
}

// Body of POST /auth/login and POST /auth/refresh.
export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}
