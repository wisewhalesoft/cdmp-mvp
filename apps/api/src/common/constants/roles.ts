export const VALID_ROLES = [
  'admin',
  'user',
  'business',
  'marketing',
  'customer_service',
  'analyst',
  'supervisor',
  'backend_ops',
] as const;

export type UserRole = (typeof VALID_ROLES)[number];
