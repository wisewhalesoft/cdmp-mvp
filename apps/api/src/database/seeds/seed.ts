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
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    name: 'Disabled Admin',
    email: 'disabled@cdmp.test',
    password: 'P@ssw0rd123',
    role: 'admin' as const,
    status: 'disabled' as const,
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    name: 'Normal User',
    email: 'user@cdmp.test',
    password: 'P@ssw0rd123',
    role: 'user' as const,
    status: 'active' as const,
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
      // Update role/status if they drifted (e.g., after schema changes)
      if (existing.role !== account.role || existing.status !== account.status) {
        existing.role = account.role;
        existing.status = account.status;
        await userRepo.save(existing);
        console.log(`  Updated: ${account.email} (role=${account.role}, status=${account.status})`);
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
    });
    await userRepo.save(user);
    console.log(`  Created: ${account.email} (${account.role}, ${account.status})`);
  }

  console.log('Seed complete.');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
