/**
 * Test seed data for Auth tests
 */

// F001: Admin accounts
export const ADMIN_ACTIVE = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'Admin User',
  email: 'admin@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'admin' as const,
  status: 'active' as const,
};

export const ADMIN_DISABLED = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  name: 'Disabled Admin',
  email: 'disabled@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'admin' as const,
  status: 'disabled' as const,
};

// F002: User accounts
export const USER_ACTIVE = {
  id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  name: 'Normal User',
  email: 'user@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
};

export const USER_DISABLED = {
  id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  name: 'Disabled User',
  email: 'disabled-user@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'disabled' as const,
};
