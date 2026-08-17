import { create } from 'zustand';
import type { ServiceHealth } from '@counselos/shared';

/**
 * SSE connection state and the session's notification queue. The second and
 * last Zustand store (06 Part 2).
 *
 * The queue is deliberately **session-scoped and resets on reload**: Phase 1
 * has no persistent notifications table and no unread endpoint, because the
 * deadline dashboard IS the notification center and is accurate regardless of
 * whether SSE or email delivered anything. Persisting this would invent a
 * second source of truth for what the attorney still needs to act on.
 *
 * Service health lives here too rather than in SWR — it is ephemeral status,
 * not server data anyone mutates (06 Part 13).
 */

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  href?: string;
  receivedAt: string;
}

interface RealtimeState {
  connectionStatus: ConnectionStatus;
  notificationQueue: Notification[];
  bellOpened: boolean;
  services: Record<string, ServiceHealth>;

  setConnectionStatus: (status: ConnectionStatus) => void;
  pushNotification: (notification: Notification) => void;
  clearNotifications: () => void;
  setBellOpened: (open: boolean) => void;
  setServices: (services: Record<string, ServiceHealth>) => void;
}

/** Newest first, and bounded — an unbounded queue is a memory leak on a long shift. */
const MAX_QUEUED = 50;

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connectionStatus: 'closed',
  notificationQueue: [],
  bellOpened: false,
  services: {},

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  pushNotification: (notification) =>
    set((state) => ({
      notificationQueue: [notification, ...state.notificationQueue].slice(0, MAX_QUEUED),
    })),

  clearNotifications: () => set({ notificationQueue: [] }),

  setBellOpened: (bellOpened) => set({ bellOpened }),

  setServices: (services) => set({ services }),
}));

/**
 * Is a dependency usable right now?
 *
 * `not_configured` returns false the same as `down`, but the UI must say
 * something different: "not set up" is a disabled control with an explanation,
 * "down" is an outage notice. Never a spinner for either — a spinner for a
 * service known to be unavailable is a lie that resolves only when the user
 * gives up (06 Part 13).
 */
export function isServiceUsable(services: Record<string, ServiceHealth>, name: string): boolean {
  const status = services[name]?.status;
  return status === 'ok' || status === 'degraded';
}
