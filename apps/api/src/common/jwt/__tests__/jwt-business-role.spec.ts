/**
 * F006a / F002 v2.0 §4.6 / AD-E07 v3.0 / E07 重構 P1 B1 / 2026-05-16
 *
 * JwtUtil.generateToken 對 businessRole claim 之行為驗證：
 *   TC-AUTH-200  傳入 businessRole='director' → JWT payload 含 businessRole='director'
 *   TC-AUTH-201  傳入 businessRole='section_chief' → JWT payload 含 businessRole='section_chief'
 *   TC-AUTH-202  傳入 businessRole=null → JWT payload 含 businessRole=null
 *   TC-AUTH-203  未傳 businessRole → JWT payload 顯式寫 null（不為 undefined）
 *   TC-LEGACY-1  legacy JWT（未含 businessRole）解碼後降級為 null 等價（透過 jwtService.verify 還原語意）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { JwtUtil } from '../jwt.util';

describe('JwtUtil — businessRole claim (TC-AUTH-200~203 / TC-LEGACY-1)', () => {
  let jwtUtil: JwtUtil;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-secret' });
    jwtUtil = new JwtUtil(jwtService);
  });

  it('TC-AUTH-200 businessRole=director → payload 含 businessRole=director', () => {
    const token = jwtUtil.generateToken({
      userId: 'u1',
      role: 'user',
      isSalesManager: false,
      businessRole: 'director',
    });
    const payload = jwtService.decode(token) as Record<string, unknown>;
    expect(payload.businessRole).toBe('director');
  });

  it('TC-AUTH-201 businessRole=section_chief → payload 含 businessRole=section_chief', () => {
    const token = jwtUtil.generateToken({
      userId: 'u1',
      role: 'user',
      businessRole: 'section_chief',
    });
    const payload = jwtService.decode(token) as Record<string, unknown>;
    expect(payload.businessRole).toBe('section_chief');
  });

  it('TC-AUTH-202 businessRole=null → payload 含 businessRole=null', () => {
    const token = jwtUtil.generateToken({
      userId: 'u1',
      role: 'user',
      businessRole: null,
    });
    const payload = jwtService.decode(token) as Record<string, unknown>;
    expect(payload.businessRole).toBeNull();
  });

  it('TC-AUTH-203 未傳 businessRole → payload 顯式為 null（不為 undefined）', () => {
    const token = jwtUtil.generateToken({ userId: 'u1', role: 'user' });
    const payload = jwtService.decode(token) as Record<string, unknown>;
    expect(payload.businessRole).toBeNull();
    expect(payload).toHaveProperty('businessRole');
  });

  it('TC-LEGACY-1 legacy JWT（手動簽發未含 businessRole）解碼後欄位為 undefined → callsite 應降級為 null', () => {
    // 模擬 v1.x legacy 簽發：直接以 jwtService.sign 不帶 businessRole
    const legacyToken = jwtService.sign({
      userId: 'u1',
      role: 'user',
      isSalesManager: false,
    });
    const payload = jwtService.decode(legacyToken) as Record<string, unknown>;
    expect(payload.businessRole).toBeUndefined();
    // 降級語意（AuthGuard / callsite 統一處理）：?? null
    expect((payload.businessRole as unknown) ?? null).toBeNull();
  });
});
