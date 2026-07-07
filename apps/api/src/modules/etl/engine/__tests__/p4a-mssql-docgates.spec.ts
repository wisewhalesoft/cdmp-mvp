/**
 * AD-E07-41 P4a — 文件化決策關卡（CI 恆常執行）：CLEANUP-003 / DISPATCH-001 / QUOTE-003。
 * 依測試設計，這些案例之通過條件＝impl log 明確記錄對應決策（文件缺失即不通過）。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// 測試 cwd = apps/api → repo root 為 ../../
const IMPL_LOG = path.resolve(
  process.cwd(),
  '../../docs/specs/implementation-log/AD-E07-41-P4a-impl.md',
);

describe('P4a 文件化決策關卡', () => {
  const src = fs.readFileSync(IMPL_LOG, 'utf8');

  it('CLEANUP-003 (MUST-FIX): impl log 記錄清理掛載位置選擇與理由', () => {
    expect(src).toContain('CLEANUP-003');
    expect(src).toContain('cleanupAll');
    expect(src).toMatch(/DB_TYPE.*mssql/);
    expect(src).toContain('createdTables');
  });

  it('DISPATCH-001: impl log 記錄 createDispatcher 是否於 P4a 接 DB_TYPE 分支（選項甲）', () => {
    expect(src).toContain('DISPATCH-001');
    expect(src).toContain('createDispatcher');
    expect(src).toMatch(/延後至 P4c|選項甲/);
  });

  it('QUOTE-003: impl log 記錄雙引號識別碼相容性結論（PASS 分支）', () => {
    expect(src).toContain('QUOTE-003');
    expect(src).toMatch(/PASS/);
    expect(src).toContain('QUOTED_IDENTIFIER');
  });
});
