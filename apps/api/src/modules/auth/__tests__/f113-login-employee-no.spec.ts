/**
 * F113 / US-179 / AD-E02-5 — 員工編號作為登入識別碼。
 *
 * 覆蓋測試設計 F113-test.md：
 *   LOGIN（14）    — 登入識別碼分支邏輯（Email vs employee_no）+ 大小寫/trim/停用/回應形狀
 *   LOGINDTO（4）  — LoginDto 放寬驗證
 *   FORGOT（3）    — 忘記密碼維持不變（AC-13 / I-EMPNO-FORGOT-PW-UNCHANGED-01）
 *
 * 權威來源：AD-E02-5 §3.3（登入分支，不 trim / 不小寫化 employee_no）> F113 spec v1.0。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { JwtUtil } from '@/common/jwt/jwt.util';
import { EmailUtil } from '@/common/email/email.util';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

// 帶 employee_no 的測試帳號 fixtures（AD §3.4 回應曝露）
const ACCOUNT_WITH_EMP = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'Admin User',
  email: 'admin@cdmp.test',
  role: 'admin' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: null,
  employee_no: 'A0001',
};

const CORRECT_PASSWORD = 'P@ssw0rd123';

describe('F113 — 員工編號登入（AuthService.login）', () => {
  let authService: AuthService;
  let mockUserRepository: Record<string, any>;
  let mockJwtUtil: Record<string, any>;
  let hashedPassword: string;

  beforeEach(async () => {
    hashedPassword = await HashUtil.hash(CORRECT_PASSWORD);

    mockUserRepository = { findOne: vi.fn() };
    mockJwtUtil = { generateToken: vi.fn().mockReturnValue('mock-jwt-token') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        {
          provide: getRepositoryToken(TokenBlocklist),
          useValue: { findOne: vi.fn(), save: vi.fn(), create: vi.fn((d: any) => d) },
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: { findOne: vi.fn(), save: vi.fn(), create: vi.fn((d: any) => d) },
        },
        { provide: JwtUtil, useValue: mockJwtUtil },
        { provide: JwtService, useValue: { decode: vi.fn() } },
        { provide: EmailUtil, useValue: { sendPasswordResetEmail: vi.fn() } },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  // ===== LOGIN =====

  // TS-F113-LOGIN-001
  it('LOGIN-001: identifier 含 @ → Email 分支，toLowerCase 後查詢（回歸）', async () => {
    mockUserRepository.findOne.mockResolvedValue({ ...ACCOUNT_WITH_EMP, password_hash: hashedPassword });

    await authService.login({ email: 'Admin@CDMP.test', password: CORRECT_PASSWORD });

    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'admin@cdmp.test' },
    });
  });

  // TS-F113-LOGIN-002
  it('LOGIN-002: 帳號同時設有 employee_no，仍以 Email 登入成功（不受新欄位影響）', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...ACCOUNT_WITH_EMP,
      email: 'user@cdmp.test',
      employee_no: 'E10001',
      password_hash: hashedPassword,
    });

    const result = await authService.login({ email: 'user@cdmp.test', password: CORRECT_PASSWORD });

    expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email: 'user@cdmp.test' } });
    expect(result).toHaveProperty('token');
  });

  // TS-F113-LOGIN-003
  it('LOGIN-003: identifier 不含 @ → employee_no 分支，精確查詢、不轉小寫', async () => {
    mockUserRepository.findOne.mockResolvedValue({ ...ACCOUNT_WITH_EMP, password_hash: hashedPassword });

    await authService.login({ email: 'A0001', password: CORRECT_PASSWORD });

    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { employee_no: 'A0001' },
    });
    // 明確不是 email 分支
    expect(mockUserRepository.findOne).not.toHaveBeenCalledWith({ where: { email: 'A0001' } });
  });

  // TS-F113-LOGIN-004
  it('LOGIN-004: employee_no 登入成功 → 回應含 user.employee_no 與 JWT', async () => {
    mockUserRepository.findOne.mockResolvedValue({ ...ACCOUNT_WITH_EMP, password_hash: hashedPassword });

    const result = await authService.login({ email: 'A0001', password: CORRECT_PASSWORD });

    expect(result.token).toBe('mock-jwt-token');
    expect(result.user.employee_no).toBe('A0001');
  });

  // TS-F113-LOGIN-005 ⚠️【紅線】大小寫敏感
  it('LOGIN-005: 大小寫不符 → employee_no 分支以原樣（未小寫化）查詢 → 401', async () => {
    mockUserRepository.findOne.mockResolvedValue(null); // 大小寫不符，DB 查無

    await expect(
      authService.login({ email: 'e12345', password: CORRECT_PASSWORD }),
    ).rejects.toThrow(UnauthorizedException);

    // 關鍵：未被 toLowerCase（若誤加 .toLowerCase() 此斷言會失敗）
    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { employee_no: 'e12345' },
    });
  });

  // TS-F113-LOGIN-006 ⚠️【紅線】不 trim
  it('LOGIN-006: 前後含空白 → 不 trim，原樣查詢 → 401', async () => {
    mockUserRepository.findOne.mockResolvedValue(null);

    await expect(
      authService.login({ email: ' A0001', password: CORRECT_PASSWORD }),
    ).rejects.toThrow(UnauthorizedException);

    // 前導空白原樣傳遞（若誤加 .trim() 此斷言會失敗）
    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { employee_no: ' A0001' },
    });
  });

  // TS-F113-LOGIN-007
  it('LOGIN-007: 不存在的 employee_no → 401 AUTH_INVALID_CREDENTIALS', async () => {
    mockUserRepository.findOne.mockResolvedValue(null);

    try {
      await authService.login({ email: 'E99999', password: 'anything' });
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe(ERROR_CODES.INVALID_CREDENTIALS);
      expect(error.response.message).toBe(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }
  });

  // TS-F113-LOGIN-008
  it('LOGIN-008: employee_no 存在但密碼錯誤 → 同一 401 訊息', async () => {
    mockUserRepository.findOne.mockResolvedValue({ ...ACCOUNT_WITH_EMP, password_hash: hashedPassword });

    try {
      await authService.login({ email: 'A0001', password: 'WrongPassword123' });
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe(ERROR_CODES.INVALID_CREDENTIALS);
      expect(error.response.message).toBe(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }
  });

  // TS-F113-LOGIN-009 不洩漏
  it('LOGIN-009: 識別碼不存在 與 密碼錯誤 回應完全一致（不洩漏）', async () => {
    // 情境 A：識別碼不存在
    mockUserRepository.findOne.mockResolvedValueOnce(null);
    let respA: any;
    try {
      await authService.login({ email: 'E99999', password: 'anything' });
    } catch (e: any) {
      respA = { status: e.getStatus(), ...e.response };
    }

    // 情境 B：識別碼存在但密碼錯誤
    mockUserRepository.findOne.mockResolvedValueOnce({ ...ACCOUNT_WITH_EMP, password_hash: hashedPassword });
    let respB: any;
    try {
      await authService.login({ email: 'A0001', password: 'WrongPassword123' });
    } catch (e: any) {
      respB = { status: e.getStatus(), ...e.response };
    }

    expect(respA).toEqual(respB);
  });

  // TS-F113-LOGIN-010 (T-22)
  it('LOGIN-010: 含 @ 但查無此 Email → 走 Email 分支 → 401（驗證分支判斷本身）', async () => {
    mockUserRepository.findOne.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'nonexist@cdmp.test', password: 'anything' }),
    ).rejects.toThrow(UnauthorizedException);

    // 走 Email 分支（非誤入 employee_no 分支）
    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'nonexist@cdmp.test' },
    });
    expect(mockUserRepository.findOne).not.toHaveBeenCalledWith({
      where: { employee_no: 'nonexist@cdmp.test' },
    });
  });

  // TS-F113-LOGIN-011
  it('LOGIN-011: 以 employee_no 登入、帳號停用 → 403 ACCOUNT_DISABLED', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...ACCOUNT_WITH_EMP,
      status: 'disabled',
      password_hash: hashedPassword,
    });

    try {
      await authService.login({ email: 'A0001', password: CORRECT_PASSWORD });
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.response.error).toBe(ERROR_CODES.ACCOUNT_DISABLED);
      expect(error.response.message).toBe(ERROR_MESSAGES.ACCOUNT_DISABLED);
    }
  });

  // TS-F113-LOGIN-012 順序 regression
  it('LOGIN-012: 停用帳號 + employee_no 正確但密碼錯誤 → 仍為 401（非 403）', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      ...ACCOUNT_WITH_EMP,
      status: 'disabled',
      password_hash: hashedPassword,
    });

    try {
      await authService.login({ email: 'A0001', password: 'WrongPassword123' });
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.response.error).toBe(ERROR_CODES.INVALID_CREDENTIALS);
    }
  });

  // TS-F113-LOGIN-013 JWT rememberMe 規則不受識別碼類型影響
  it('LOGIN-013: employee_no 登入之 JWT rememberMe 規則與 Email 登入相同', async () => {
    mockUserRepository.findOne.mockResolvedValue({ ...ACCOUNT_WITH_EMP, password_hash: hashedPassword });

    await authService.login({ email: 'A0001', password: CORRECT_PASSWORD, rememberMe: true });
    expect(mockJwtUtil.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ACCOUNT_WITH_EMP.id, role: 'admin', rememberMe: true }),
    );

    mockJwtUtil.generateToken.mockClear();
    await authService.login({ email: 'A0001', password: CORRECT_PASSWORD, rememberMe: false });
    expect(mockJwtUtil.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ rememberMe: false }),
    );
  });

  // TS-F113-LOGIN-014
  it('LOGIN-014: employee_no=null 之帳號不可能被 employee_no 分支匹配到 → 401', async () => {
    // 以任意不含 @ 字串查詢；DB 對 employee_no = <值> 天然查無（SQL =NULL 不成立）
    mockUserRepository.findOne.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'SOMEVALUE', password: 'anything' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { employee_no: 'SOMEVALUE' },
    });
  });

  // ===== FORGOT (行為部分) =====

  // TS-F113-FORGOT-002 regression：合法 Email 仍回既有通用成功訊息
  it('FORGOT-002: 合法 Email 之既有通用成功回應不受影響', async () => {
    mockUserRepository.findOne.mockResolvedValue(null); // 帳號不存在亦回相同訊息

    const result = await authService.forgotPassword({ email: 'user@cdmp.test' });
    expect(result.message).toBe('若此 Email 存在，重設連結已寄出');
  });
});

describe('F113 — LoginDto 放寬驗證（LOGINDTO）', () => {
  async function run(input: unknown) {
    const dto = plainToInstance(LoginDto, input);
    return validate(dto);
  }

  // TS-F113-LOGINDTO-001
  it('LOGINDTO-001: 不含 @ 的字串（A0001）通過 DTO 驗證', async () => {
    expect(await run({ email: 'A0001', password: 'x' })).toHaveLength(0);
  });

  // TS-F113-LOGINDTO-002
  it('LOGINDTO-002: 空字串 → 驗證失敗（@IsNotEmpty 仍生效）', async () => {
    const errs = await run({ email: '', password: 'x' });
    expect(errs.length).toBeGreaterThan(0);
    expect(JSON.stringify(errs)).toContain('請輸入 Email 或員工編號');
  });

  // TS-F113-LOGINDTO-003
  it('LOGINDTO-003: 長度 256 字元 → 驗證失敗（@MaxLength(255)）', async () => {
    const errs = await run({ email: 'a'.repeat(256), password: 'x' });
    expect(errs.length).toBeGreaterThan(0);
    expect(JSON.stringify(errs)).toContain('255');
  });

  // TS-F113-LOGINDTO-004 regression
  it('LOGINDTO-004: 合法 Email 格式仍正常通過（既有行為不受影響）', async () => {
    expect(await run({ email: 'admin@cdmp.test', password: 'x' })).toHaveLength(0);
  });
});

describe('F113 — 忘記密碼維持不變（FORGOT）', () => {
  async function runForgot(input: unknown) {
    const dto = plainToInstance(ForgotPasswordDto, input);
    return validate(dto);
  }

  // TS-F113-FORGOT-001：純員工編號輸入 → 既有 @IsEmail 攔截（格式錯誤，非 200）
  it('FORGOT-001: 純員工編號 → ForgotPasswordDto @IsEmail 攔截（格式錯誤）', async () => {
    const errs = await runForgot({ email: 'E12345' });
    expect(errs.length).toBeGreaterThan(0);
    expect(JSON.stringify(errs)).toContain('請輸入有效的 Email 地址');
  });

  // TS-F113-FORGOT-003：靜態 regression — forgot-password 未新增任何 employee_no 相關程式碼
  it('FORGOT-003: forgot-password.dto.ts 與 forgotPassword() 未新增 employee_no 分支', () => {
    const dtoSrc = readFileSync(
      join(__dirname, '..', 'dto', 'forgot-password.dto.ts'),
      'utf8',
    );
    expect(dtoSrc).toMatch(/@IsEmail/);
    expect(/employee_?no/i.test(dtoSrc)).toBe(false);

    const serviceSrc = readFileSync(join(__dirname, '..', 'auth.service.ts'), 'utf8');
    // 擷取 forgotPassword 方法體（至下一個 async 方法宣告前）
    const m = serviceSrc.match(/async forgotPassword\([\s\S]*?\n  async /);
    const body = m ? m[0] : '';
    expect(body.length).toBeGreaterThan(0);
    expect(/employee_?no/i.test(body)).toBe(false);
    expect(body.includes("includes('@')")).toBe(false);
  });
});
