import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/** Node-side server for tests. Same handlers as the browser — one contract. */
export const server = setupServer(...handlers);
