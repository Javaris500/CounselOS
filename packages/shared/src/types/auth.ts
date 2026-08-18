import type { UserRole } from '../enums/user.enums.js';

/**
 * The authenticated identity, as both apps see it.
 *
 * Defined here rather than in either app because it crosses the boundary twice:
 * the API returns it from `GET /v1/auth/me` and `POST /v1/auth/login`, and the
 * frontend holds it in the Zustand auth store. Two definitions would drift the
 * first time a field is added.
 *
 * DELIBERATELY MINIMAL. This is session identity, not the user record — no
 * phone, no bar number, no timestamps. Anything else is a resource to fetch,
 * not something to carry on every request.
 */
export interface AuthUser {
  id: string;
  role: UserRole;
  firmId: string;
  fullName: string;
  email: string;
}

/**
 * What a successful login returns.
 *
 * The refresh token is deliberately absent: it is set as an httpOnly cookie the
 * browser cannot read, so it never appears in a response body and cannot be
 * lifted by a script. The access token lives in memory only.
 */
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** What a silent refresh returns. `apiFetch` reads exactly this shape. */
export interface RefreshResponse {
  accessToken: string;
}
