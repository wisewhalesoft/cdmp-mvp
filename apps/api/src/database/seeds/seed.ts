import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';

const SEED_ACCOUNTS = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Admin User',
    email: 'admin@cdmp.test',
    password: 'P@ssw0rd123',
    role: 'admin' as const,
    status: 'active' as const,
    is_sales_manager: false,
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    name: 'Disabled Admin',
    email: 'disabled@cdmp.test',
    password: 'P@ssw0rd123',
    role: 'admin' as const,
    status: 'disabled' as const,
    is_sales_manager: false,
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    name: 'Normal User',
    email: 'user@cdmp.test',
    password: 'P@ssw0rd123',
    role: 'user' as const,
    status: 'active' as const,
    is_sales_manager: false,
  },
  // E07 業務主管 fixture（AD-E02-1）：role=user + is_sales_manager=true，
  // 用於 SalesManagerGuard 行為驗證與 F058 / F059 等 feature 本機測試
  {
    id: 'd4e5f6a7-b8c9-0123-def4-567890123456',
    name: 'Sales Manager User',
    email: 'manager@cdmp.test',
    password: 'P@ssw0rd123',
    role: 'user' as const,
    status: 'active' as const,
    is_sales_manager: true,
  },
];

async function seed() {
  const dbType = process.env.DB_TYPE || 'postgres';
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'cdmp',
    password: process.env.DB_PASSWORD || 'cdmp_secret',
    database: process.env.DB_NAME || 'cdmp_dev',
    entities: [User],
    synchronize: true,
  });

  await dataSource.initialize();
  console.log('Database connected.');

  const userRepo = dataSource.getRepository(User);

  for (const account of SEED_ACCOUNTS) {
    const existing = await userRepo.findOne({ where: { email: account.email } });
    if (existing) {
      // Update role/status/is_sales_manager if they drifted (e.g., after schema changes)
      const drifted =
        existing.role !== account.role ||
        existing.status !== account.status ||
        existing.is_sales_manager !== account.is_sales_manager;
      if (drifted) {
        existing.role = account.role;
        existing.status = account.status;
        existing.is_sales_manager = account.is_sales_manager;
        await userRepo.save(existing);
        console.log(
          `  Updated: ${account.email} (role=${account.role}, status=${account.status}, is_sales_manager=${account.is_sales_manager})`,
        );
      } else {
        console.log(`  Skip: ${account.email} (already correct)`);
      }
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, 10);
    const user = userRepo.create({
      id: account.id,
      name: account.name,
      email: account.email,
      password_hash: passwordHash,
      role: account.role,
      status: account.status,
      is_sales_manager: account.is_sales_manager,
    });
    await userRepo.save(user);
    console.log(
      `  Created: ${account.email} (${account.role}, ${account.status}, is_sales_manager=${account.is_sales_manager})`,
    );
  }

  console.log('Seed complete.');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
