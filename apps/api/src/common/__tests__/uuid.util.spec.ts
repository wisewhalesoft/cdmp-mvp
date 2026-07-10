import { describe, it, expect } from 'vitest';
import { isUuid } from '../uuid.util';

describe('isUuid — varchar 稽核欄 → users.id(GUID) 查詢守門', () => {
  it('合法 UUID（含大小寫）→ true', () => {
    expect(isUuid('a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBe(true);
    expect(isUuid('A1B2C3D4-E5F6-7890-ABCD-EF0123456789')).toBe(true);
    expect(isUuid('00000000-0000-4000-8000-0000deadbeef')).toBe(true);
  });

  it('非 GUID 稽核標記（seed / legacy）→ false（避免 Invalid GUID 500）', () => {
    expect(isUuid('PROD_SEED')).toBe(false);
    expect(isUuid('A_USERID')).toBe(false);
    expect(isUuid('legacy-import')).toBe(false);
    expect(isUuid('seed')).toBe(false);
  });

  it('格式不符（缺段 / 多字元 / 非 hex）→ false', () => {
    expect(isUuid('a1b2c3d4e5f67890abcdef0123456789')).toBe(false); // 缺 dash
    expect(isUuid('a1b2c3d4-e5f6-7890-abcd-ef012345678')).toBe(false); // 末段 11 碼
    expect(isUuid('g1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBe(false); // 非 hex g
    expect(isUuid('a1b2c3d4-e5f6-7890-abcd-ef0123456789 ')).toBe(false); // 尾隨空白
  });

  it('非字串 / null / undefined → false（type guard）', () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid({})).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
