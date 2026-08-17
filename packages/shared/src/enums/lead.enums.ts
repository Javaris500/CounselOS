export const LEAD_STATUSES = ['NEW', 'REVIEWED', 'CONVERTED', 'REJECTED', 'DUPLICATE'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const REFERRAL_SOURCE_TYPES = [
  'REALTOR',
  'PAST_CLIENT',
  'ATTORNEY',
  'LENDER',
  'TITLE_COMPANY',
  'WEB_SEARCH',
  'WALK_IN',
  'OTHER',
] as const;
export type ReferralSourceType = (typeof REFERRAL_SOURCE_TYPES)[number];
