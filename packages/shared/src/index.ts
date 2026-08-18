// The sync contract. Both apps import from here, so nothing below can drift
// between backend and frontend — a mismatch is a compile error, not a bug
// report. See 02-repo-structure.md.

export * from './enums/user.enums.js';
export * from './enums/transaction.enums.js';
export * from './enums/document.enums.js';
export * from './enums/deadline.enums.js';
export * from './enums/draft.enums.js';
export * from './enums/task.enums.js';
export * from './enums/communication.enums.js';
export * from './enums/lead.enums.js';
export * from './enums/business.enums.js';

export * from './errors/error-codes.js';
export * from './events/sse-events.js';
export * from './constants/limits.js';
export * from './types/api.js';
export * from './types/auth.js';
export * from './schemas/auth.schema.js';
