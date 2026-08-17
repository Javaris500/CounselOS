export const COMMUNICATION_TYPES = [
  'PHONE_CALL',
  'EMAIL',
  'IN_PERSON',
  'TEXT',
  'VOICEMAIL',
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
