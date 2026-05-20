import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * F050 v2.1 Phase 5d 波 11：apps/web ob_code_df / F068 殘留 regression guard
 *
 * 確認 F068（指派代碼）廢除後，apps/web/src 不再含以下殘留：
 *   1. `ob_code_df`（小寫，舊 table 名）
 *   2. `'/assignment-codes'`（API client 路由字串）
 *   3. `AssignmentTblId`（後端 enum，前端不應出現）
 *   4. 中文「指派代碼」（sidebar / page title 殘留）
 *
 * 註：此檔本身做 grep 比對，故 raw 字串會在 expectations 出現；test 透過分割成 token + join 避開 self-match。
 *
 * 對齊：
 *   - 5c implementation log §O-5C-002 — apps/web F068 殘留掃描
 *   - 5d 波 6 已刪 base-codes / assignment-codes.ts / field-whitelist / field-options（commit e7a0f49）
 */

const SRC_ROOT = path.resolve(__dirname, '..');

async function* walkSrc(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 略過 __tests__ 避免 self-match（本檔位於 __tests__ 內）
      if (entry.name === '__tests__') continue;
      yield* walkSrc(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    yield full;
  }
}

async function collectMatches(needle: string): Promise<Array<{ file: string; line: number; text: string }>> {
  const results: Array<{ file: string; line: number; text: string }> = [];
  for await (const file of walkSrc(SRC_ROOT)) {
    const content = await fs.readFile(file, 'utf-8');
    const lines = content.split(/\r?\n/);
    lines.forEach((text, idx) => {
      if (text.includes(needle)) {
        results.push({ file: path.relative(SRC_ROOT, file), line: idx + 1, text: text.trim() });
      }
    });
  }
  return results;
}

/**
 * 允許的「歷史對照說明」白名單（明示「已取代」/「舊」之描述，非實際 API 引用）。
 *
 * 兩處保留是因為它們提供使用者「v2.1 後此資料從 ob_code_df 遷移至 pooldata_field_option」的對照解釋：
 *   - field-base-page.tsx：「舊 ob_code_df 表中對應 tbl_id 之資料於 Phase 3a migration...」
 *   - options-tab.tsx：「之可選值統一在此管理（取代 F068 ob_code_df）」
 */
const ALLOWED_HISTORICAL_DESCRIPTION_FILES = new Set([
  'pages\\assignment\\field-base-page.tsx',
  'pages/assignment/field-base-page.tsx',
  'pages\\assignment\\_components\\options-tab.tsx',
  'pages/assignment/_components/options-tab.tsx',
]);

describe('apps/web F068 殘留 regression (Phase 5d 波 11)', () => {
  it('apps/web/src 不含 `ob_code_df` 字串（除歷史對照說明白名單外）', async () => {
    const matches = await collectMatches('ob_code_df');
    const offenders = matches.filter(
      (m) => !ALLOWED_HISTORICAL_DESCRIPTION_FILES.has(m.file),
    );
    expect(
      offenders,
      `Found ${offenders.length} non-whitelisted ob_code_df references:\n${offenders.map((m) => `  ${m.file}:${m.line} ${m.text}`).join('\n')}`,
    ).toEqual([]);
  });

  it("apps/web/src 不含 '/assignment-codes' route literal", async () => {
    const matches = await collectMatches('/assignment-codes');
    expect(matches, `Found ${matches.length} references to /assignment-codes:\n${matches.map((m) => `  ${m.file}:${m.line} ${m.text}`).join('\n')}`).toEqual([]);
  });

  it('apps/web/src 不含 `AssignmentTblId` enum/type', async () => {
    const matches = await collectMatches('AssignmentTblId');
    expect(matches, `Found ${matches.length} references to AssignmentTblId:\n${matches.map((m) => `  ${m.file}:${m.line} ${m.text}`).join('\n')}`).toEqual([]);
  });

  it('apps/web/src 不含「指派代碼」中文字串', async () => {
    const matches = await collectMatches('指派代碼');
    expect(matches, `Found ${matches.length} references to 指派代碼:\n${matches.map((m) => `  ${m.file}:${m.line} ${m.text}`).join('\n')}`).toEqual([]);
  });
});
