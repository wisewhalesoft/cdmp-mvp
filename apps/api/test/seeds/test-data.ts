/**
 * Test seed data for F001 Auth tests
 */
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
