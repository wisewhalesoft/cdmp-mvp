export const VALID_ROLES = [
  'admin',
  'user',
] as const;

export type UserRole = (typeof VALID_ROLES)[number];
