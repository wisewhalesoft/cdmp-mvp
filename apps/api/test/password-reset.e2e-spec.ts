import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource, Repository } from 'typeorm';
import { AuthModule } from '@/modules/auth/auth.module';
import { AccountsModule } from '@/modules/accounts/accounts.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { ADMIN_ACTIVE, USER_ACTIVE } from './seeds/test-data';

describe('F009: Password Reset E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordResetTokenRepo: Repository<PasswordResetToken>;
  let userRepo: Repository<User>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-jwt-secret-key-for-e2e-testing',
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User, TokenBlocklist, PasswordResetToken],
          synchronize: true,
        }),
        ThrottlerModule.forRoot([
          {
            name: 'login',
            ttl: 60000,
            limit: 100,
          },
        ]),
        AuthModule,
        AccountsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    passwordResetTokenRepo = dataSource.getRepository(PasswordResetToken);
    userRepo = dataSource.getRepository(User);

    // Seed test users
    const hashedPassword = await HashUtil.hash(ADMIN_ACTIVE.password);

    await userRepo.save([
      userRepo.create({
        id: ADMIN_ACTIVE.id,
        name: ADMIN_ACTIVE.name,
        email: ADMIN_ACTIVE.email,
        password_hash: hashedPassword,
        role: ADMIN_ACTIVE.role,
        status: ADMIN_ACTIVE.status,
      }),
      userRepo.create({
        id: USER_ACTIVE.id,
        name: USER_ACTIVE.name,
        email: USER_ACTIVE.email,
        password_hash: hashedPassword,
        role: USER_ACTIVE.role,
        status: USER_ACTIVE.status,
      }),
    ]);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    // TS-F009-001: 已註冊 Email 發送重設連結
    it('should return 200 with unified message for registered email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: ADMIN_ACTIVE.email });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('若此 Email 存在，重設連結已寄出');

      // Verify token was created in DB
      const tokens = await passwordResetTokenRepo.find({
        where: { user_id: ADMIN_ACTIVE.id },
      });
      expect(tokens.length).toBeGreaterThanOrEqual(1);
    });

    // TS-F009-004: 未註冊 Email 不揭露帳號存在
    it('should return 200 with same message for unregistered email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexist@test.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('若此 Email 存在，重設連結已寄出');
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    // TS-F009-002: 有效 Token 成功重設密碼
    it('should return 200 and reset password with valid token', async () => {
      // Create a valid token
      const resetToken = 'valid-reset-token-for-test';
      await passwordResetTokenRepo.save(
        passwordResetTokenRepo.create({
          user_id: ADMIN_ACTIVE.id,
          token: resetToken,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'NewPass99' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('密碼已成功重設，請重新登入');

      // Verify token marked as used
      const usedToken = await passwordResetTokenRepo.findOne({
        where: { token: resetToken },
      });
      expect(usedToken?.used_at).not.toBeNull();
    });

    // TS-F009-003: 重設後可用新密碼登入
    it('should allow login with new password after reset', async () => {
      // Create a valid token for USER_ACTIVE
      const resetToken = 'token-for-login-test';
      await passwordResetTokenRepo.save(
        passwordResetTokenRepo.create({
          user_id: USER_ACTIVE.id,
          token: resetToken,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      );

      const newPassword = 'BrandNew123';

      // Reset password
      const resetResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword });

      expect(resetResponse.status).toBe(200);

      // Login with new password
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: USER_ACTIVE.email, password: newPassword });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('token');
      expect(loginResponse.body.user.email).toBe(USER_ACTIVE.email);
    });

    // TS-F009-005: 過期 Token 重設失敗
    it('should return 422 AUTH_RESET_TOKEN_EXPIRED for expired token', async () => {
      const expiredToken = 'expired-reset-token';
      await passwordResetTokenRepo.save(
        passwordResetTokenRepo.create({
          user_id: ADMIN_ACTIVE.id,
          token: expiredToken,
          expires_at: new Date(Date.now() - 1000), // already expired
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: expiredToken, newPassword: 'NewPass99' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('AUTH_RESET_TOKEN_EXPIRED');
      expect(response.body.message).toBe('此連結已過期，請重新申請密碼重設');
    });

    // TS-F009-006: 已使用 Token 重設失敗
    it('should return 422 AUTH_RESET_TOKEN_USED for already-used token', async () => {
      const usedToken = 'used-reset-token';
      await passwordResetTokenRepo.save(
        passwordResetTokenRepo.create({
          user_id: ADMIN_ACTIVE.id,
          token: usedToken,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          used_at: new Date(),
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: usedToken, newPassword: 'NewPass99' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('AUTH_RESET_TOKEN_USED');
      expect(response.body.message).toBe('此連結已失效');
    });

    // TS-F009-007: 無效 Token 格式
    it('should return 422 AUTH_RESET_TOKEN_INVALID for non-existent token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'totally-invalid-token', newPassword: 'NewPass99' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('AUTH_RESET_TOKEN_INVALID');
      expect(response.body.message).toBe('重設連結無效');
    });

    // TS-F009-008: 重設後舊 Session Token 失效
    it('should invalidate old session token after password reset', async () => {
      // Create a fresh user for this test to avoid interference from other tests
      const sessionTestUserId = 'e5f6a7b8-c9d0-1234-efab-567890123456';
      const sessionTestPassword = 'SessionTest99';
      const sessionTestHash = await HashUtil.hash(sessionTestPassword);
      await userRepo.save(
        userRepo.create({
          id: sessionTestUserId,
          name: 'Session Test Admin',
          email: 'session-test@cdmp.test',
          password_hash: sessionTestHash,
          role: 'admin' as const,
          status: 'active' as const,
        }),
      );

      // Login to get a session token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'session-test@cdmp.test', password: sessionTestPassword });

      expect(loginResponse.status).toBe(200);
      const oldSessionToken = loginResponse.body.token;

      // Verify old token works
      const beforeReset = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${oldSessionToken}`);
      expect(beforeReset.status).toBe(200);

      // Create a reset token and reset password
      const resetToken = 'token-for-session-invalidation';
      await passwordResetTokenRepo.save(
        passwordResetTokenRepo.create({
          user_id: sessionTestUserId,
          token: resetToken,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      );

      const resetResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'AfterReset99' });

      expect(resetResponse.status).toBe(200);

      // Old session token should be invalidated via password_changed_at check
      const afterReset = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${oldSessionToken}`);

      expect(afterReset.status).toBe(401);
      expect(afterReset.body.error).toBe('AUTH_TOKEN_REVOKED');
    });

    // TS-F009-009: 新密碼恰好 8 字元 → 成功
    it('should succeed with password exactly 8 characters', async () => {
      const resetToken = 'token-for-8char-test';
      await passwordResetTokenRepo.save(
        passwordResetTokenRepo.create({
          user_id: USER_ACTIVE.id,
          token: resetToken,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: '12345678' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('密碼已成功重設，請重新登入');
    });

    // TS-F009-010: 新密碼僅 7 字元 → 422 VALIDATION_PASSWORD_LENGTH
    it('should return 422 for password shorter than 8 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'any-token', newPassword: '1234567' });

      expect(response.status).toBe(422);
      // The DTO validation via ValidationPipe should catch this
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });
});
