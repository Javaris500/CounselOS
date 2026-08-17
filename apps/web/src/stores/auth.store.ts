import { create } from 'zustand';

/**
 * Ephemeral auth state. One of exactly two Zustand stores (06 Part 2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ACCESS TOKEN LIVES IN MEMORY AND NOWHERE ELSE.
 *
 * Not localStorage, not sessionStorage, not a non-httpOnly cookie. Anything
 * readable by JavaScript is readable by any script that ends up on the page,
 * and this token opens a system holding privileged client material. The cost is
 * that a hard refresh logs the user out until the refresh token restores the
 * session — which is the correct trade for a law firm.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NO SERVER DATA HERE. Transactions, documents, deadlines live in SWR and only
 * SWR. `user` is the exception that proves it: it is session identity, read
 * from the token exchange, not a cached row anyone re-fetches.
 */

export interface AuthUser {
  id: string;
  role: 'OWNER' | 'ATTORNEY' | 'PARALEGAL' | 'CLIENT';
  firmId: string;
  fullName: string;
  email: string;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  /**
   * Increments on every token refresh.
   *
   * Load-bearing, and easy to mistake for a debug counter. EventSource cannot
   * send headers, so the SSE connection carries the token in its URL — meaning
   * a refreshed token requires tearing the connection down and reopening it.
   * The SSE hook lists this in its effect dependencies, so bumping it is what
   * reconnects. Remove it and the stream silently keeps running on a token
   * that has expired, until the server drops it.
   */
  tokenVersion: number;
  isAuthenticated: boolean;

  setSession: (token: string, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  bumpTokenVersion: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  tokenVersion: 0,
  isAuthenticated: false,

  setSession: (accessToken, user) => set({ accessToken, user, isAuthenticated: true }),

  /** After a silent refresh. Does not touch `user` — identity didn't change. */
  setAccessToken: (accessToken) => set({ accessToken }),

  bumpTokenVersion: () => set((state) => ({ tokenVersion: state.tokenVersion + 1 })),

  clear: () => set({ accessToken: null, user: null, isAuthenticated: false }),
}));
