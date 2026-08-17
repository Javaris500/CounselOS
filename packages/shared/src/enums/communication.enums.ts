export const COMMUNICATION_TYPES = [
  'PHONE_CALL',
  'EMAIL',
  'IN_PERSON',
  'TEXT',
  'VOICEMAIL',
  // Written by the client portal, not typed by a human: every client message
  // also lands in the communication log so two-way messaging feeds
  // institutional memory and AI chat context (13-adoption-features.md,
  // 05 §8J). Added ahead of the module that needs it — 03-schema.md omitted
  // the value while two other docs already required it.
  'CLIENT_PORTAL',
  'OTHER',
] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

export const COMMUNICATION_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];

/** Chat turn author — the RAG conversation in 05 §5. */
export const MESSAGE_ROLES = ['USER', 'ASSISTANT'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** Client-portal message direction (05 §8J). Distinct from MESSAGE_ROLES. */
export const MESSAGE_DIRECTIONS = [
  'INBOUND', // from client
  'OUTBOUND', // from firm
] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];
