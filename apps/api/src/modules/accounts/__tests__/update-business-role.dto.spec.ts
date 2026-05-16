/**
 * F006a / AD-E07 v3.0 / E07 重構 P1 B1 / 2026-05-16
 *
 * UpdateBusinessRoleDto @IsIn + @IsDefined 雙層驗證：
 *   TC-AUTH-204  接受 'director' / 'section_chief' / null
 *   TC-AUTH-205  拒絕 'manager' / '' / 數字 / undefined / 'admin' / true
 */

import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateBusinessRoleDto } from '../dto/update-business-role.dto';

async function run(input: unknown) {
  const dto = plainToInstance(UpdateBusinessRoleDto, input);
  return validate(dto);
}

describe('UpdateBusinessRoleDto (F006a) — TC-AUTH-204/205', () => {
  describe('接受值 (TC-AUTH-204)', () => {
    it('director', async () => expect(await run({ business_role: 'director' })).toHaveLength(0));
    it('section_chief', async () =>
      expect(await run({ business_role: 'section_chief' })).toHaveLength(0));
    it('null (顯式)', async () =>
      expect(await run({ business_role: null })).toHaveLength(0));
  });

  describe('拒絕值 (TC-AUTH-205)', () => {
    it("'manager' 拒絕", async () => expect(await run({ business_role: 'manager' })).not.toHaveLength(0));
    it("'admin' 拒絕（不是允許 enum）", async () =>
      expect(await run({ business_role: 'admin' })).not.toHaveLength(0));
    it("空字串拒絕", async () => expect(await run({ business_role: '' })).not.toHaveLength(0));
    it("數字 1 拒絕", async () => expect(await run({ business_role: 1 })).not.toHaveLength(0));
    it("boolean true 拒絕", async () =>
      expect(await run({ business_role: true })).not.toHaveLength(0));
    it("缺欄位（undefined）→ @IsDefined 觸發", async () => {
      const errs = await run({});
      expect(errs).not.toHaveLength(0);
      // 訊息含 "business_role" 提示
      const found = JSON.stringify(errs).includes('business_role');
      expect(found).toBe(true);
    });
  });
});
