/**
 * F113 / AD-E02-5 §3.4.1 — employee-no.validator + CreateAccountDto / UpdateAccountDto。
 *
 * 覆蓋 F113-test.md DTOVAL（15）：格式驗證（三段優先序訊息）+ 正規化（trim / 空字串→undefined）。
 */

import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  EMPLOYEE_NO_RE,
  employeeNoErrorMessage,
  normalizeEmployeeNo,
} from '../dto/employee-no.validator';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';

// 取得 employeeNo 之 @Matches 約束訊息（若無 employeeNo 錯誤則 undefined）。
function matchesMsg(errs: any[]): string | undefined {
  const e = errs.find((x) => x.property === 'employeeNo');
  return e?.constraints?.matches;
}

async function validateCreate(employeeNo: unknown) {
  const dto = plainToInstance(CreateAccountDto, {
    name: 'Test',
    email: 'test@example.com',
    password: 'password123',
    role: 'user',
    ...(employeeNo === undefined ? {} : { employeeNo }),
  });
  return { dto, errs: await validate(dto) };
}

describe('F113 — normalizeEmployeeNo（FMT-4 / FMT-6）', () => {
  // TS-F113-DTOVAL-010
  it('DTOVAL-010: 空字串 → undefined', () => {
    expect(normalizeEmployeeNo('')).toBeUndefined();
  });

  // TS-F113-DTOVAL-011
  it('DTOVAL-011: 純空白字串 → undefined', () => {
    expect(normalizeEmployeeNo('   ')).toBeUndefined();
  });

  // TS-F113-DTOVAL-012 ⚠️【紅線】trim（與 LOGIN-006 相反）
  it('DTOVAL-012: 前後含空白 → trim 後值', () => {
    expect(normalizeEmployeeNo(' E12345 ')).toBe('E12345');
  });

  it('非字串 → 原樣回傳（交後續驗證器判斷）', () => {
    expect(normalizeEmployeeNo(123 as unknown)).toBe(123);
  });
});

describe('F113 — employeeNoErrorMessage 優先序（§3.2）', () => {
  it("含 '@' → 員工編號不可包含 @", () => {
    expect(employeeNoErrorMessage({ value: 'A@1' } as any)).toBe('員工編號不可包含 @');
  });
  it('長度 > 32 → 長度訊息', () => {
    expect(employeeNoErrorMessage({ value: 'A'.repeat(33) } as any)).toBe('員工編號長度不可超過 32 字元');
  });
  it('其他不合法字元 → 字元集訊息', () => {
    expect(employeeNoErrorMessage({ value: 'A 1' } as any)).toBe('員工編號僅允許英數字、- 與 _');
  });
});

describe('F113 — EMPLOYEE_NO_RE', () => {
  it('接受英數字/-/_，1~32 長度', () => {
    expect(EMPLOYEE_NO_RE.test('A0001')).toBe(true);
    expect(EMPLOYEE_NO_RE.test('EMP-1001')).toBe(true);
    expect(EMPLOYEE_NO_RE.test('emp_1')).toBe(true);
  });
  it('拒絕 @ / 空格 / 中文 / 超長', () => {
    expect(EMPLOYEE_NO_RE.test('A@1')).toBe(false);
    expect(EMPLOYEE_NO_RE.test('A 1')).toBe(false);
    expect(EMPLOYEE_NO_RE.test('員工001')).toBe(false);
    expect(EMPLOYEE_NO_RE.test('A'.repeat(33))).toBe(false);
    expect(EMPLOYEE_NO_RE.test('')).toBe(false);
  });
});

describe('F113 — CreateAccountDto employeeNo 驗證（DTOVAL）', () => {
  // TS-F113-DTOVAL-001/002/003 合法值
  it('DTOVAL-001: A0001 通過', async () => {
    const { errs } = await validateCreate('A0001');
    expect(matchesMsg(errs)).toBeUndefined();
  });
  it('DTOVAL-002: EMP-1001 通過', async () => {
    const { errs } = await validateCreate('EMP-1001');
    expect(matchesMsg(errs)).toBeUndefined();
  });
  it('DTOVAL-003: emp_1 通過', async () => {
    const { errs } = await validateCreate('emp_1');
    expect(matchesMsg(errs)).toBeUndefined();
  });

  // TS-F113-DTOVAL-004
  it("DTOVAL-004: 含 '@' → 「員工編號不可包含 @」（優先序 1）", async () => {
    const { errs } = await validateCreate('A0001@x');
    expect(matchesMsg(errs)).toBe('員工編號不可包含 @');
  });

  // TS-F113-DTOVAL-005
  it('DTOVAL-005: 長度 33 → 「員工編號長度不可超過 32 字元」（優先序 2）', async () => {
    const { errs } = await validateCreate('A'.repeat(33));
    expect(matchesMsg(errs)).toBe('員工編號長度不可超過 32 字元');
  });

  // TS-F113-DTOVAL-006 ⚠️ 優先序：@ 優先於長度
  it("DTOVAL-006: 40 字元且含 '@' → 「員工編號不可包含 @」（@ 優先於長度）", async () => {
    const { errs } = await validateCreate('A'.repeat(39) + '@');
    expect(matchesMsg(errs)).toBe('員工編號不可包含 @');
  });

  // TS-F113-DTOVAL-007/008/009 字元集訊息（優先序 3）
  it('DTOVAL-007: 含空格 → 字元集訊息', async () => {
    const { errs } = await validateCreate('A0001 X');
    expect(matchesMsg(errs)).toBe('員工編號僅允許英數字、- 與 _');
  });
  it('DTOVAL-008: 含中文 → 字元集訊息', async () => {
    const { errs } = await validateCreate('員工001');
    expect(matchesMsg(errs)).toBe('員工編號僅允許英數字、- 與 _');
  });
  it("DTOVAL-009: 含 '#' → 字元集訊息", async () => {
    const { errs } = await validateCreate('A0001#');
    expect(matchesMsg(errs)).toBe('員工編號僅允許英數字、- 與 _');
  });

  // TS-F113-DTOVAL-010/011 空字串/純空白經 Transform → undefined → @IsOptional 跳過
  it('DTOVAL-010: 空字串 → 正規化後不視為錯誤', async () => {
    const { dto, errs } = await validateCreate('');
    expect(matchesMsg(errs)).toBeUndefined();
    expect(dto.employeeNo).toBeUndefined();
  });
  it('DTOVAL-011: 純空白 → 正規化後不視為錯誤', async () => {
    const { dto, errs } = await validateCreate('   ');
    expect(matchesMsg(errs)).toBeUndefined();
    expect(dto.employeeNo).toBeUndefined();
  });

  // TS-F113-DTOVAL-012 ⚠️【紅線】trim 後驗證與儲存
  it('DTOVAL-012: 前後含空白 → trim 後以去空白值驗證且 instance 為去空白值', async () => {
    const { dto, errs } = await validateCreate(' E12345 ');
    expect(matchesMsg(errs)).toBeUndefined();
    expect(dto.employeeNo).toBe('E12345');
  });

  // TS-F113-DTOVAL-013/014 邊界長度
  it('DTOVAL-013: 恰 32 字元 → 合法', async () => {
    const { errs } = await validateCreate('A'.repeat(32));
    expect(matchesMsg(errs)).toBeUndefined();
  });
  it('DTOVAL-014: 恰 1 字元 → 合法', async () => {
    const { errs } = await validateCreate('A');
    expect(matchesMsg(errs)).toBeUndefined();
  });

  // TS-F113-DTOVAL-015 完全省略
  it('DTOVAL-015: 省略 employeeNo → @IsOptional 跳過，不視為錯誤', async () => {
    const { dto, errs } = await validateCreate(undefined);
    expect(matchesMsg(errs)).toBeUndefined();
    expect(dto.employeeNo).toBeUndefined();
  });
});

describe('F113 — UpdateAccountDto employeeNo 驗證（共用同一 validator）', () => {
  async function validateUpdate(employeeNo: unknown) {
    const dto = plainToInstance(UpdateAccountDto, {
      name: 'Test',
      email: 'test@example.com',
      ...(employeeNo === undefined ? {} : { employeeNo }),
    });
    return { dto, errs: await validate(dto) };
  }

  it('合法值通過、空字串正規化為 undefined、含 @ 報錯', async () => {
    expect(matchesMsg((await validateUpdate('E30001')).errs)).toBeUndefined();

    const cleared = await validateUpdate('');
    expect(matchesMsg(cleared.errs)).toBeUndefined();
    expect(cleared.dto.employeeNo).toBeUndefined();

    expect(matchesMsg((await validateUpdate('bad@x')).errs)).toBe('員工編號不可包含 @');
  });
});
