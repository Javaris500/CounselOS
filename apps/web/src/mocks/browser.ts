import { setupWorker } from 'msw/browser';

import { handlers } from './handlers';

/**
 * Dev-only worker. Started from the (attorney) layout when
 * NEXT_PUBLIC_API_MOCKING=enabled, so a slice can be built before its backend
 * module lands.
 *
 * The service worker file is committed at public/mockServiceWorker.js — MSW's
 * postinstall is blocked by policy, so a fresh clone relying on it would have
 * no worker and every request would silently hit the real network.
 */
export const worker = setupWorker(...handlers);
