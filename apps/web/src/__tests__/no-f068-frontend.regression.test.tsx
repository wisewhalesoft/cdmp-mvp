/**
 * F050 v2.1 Phase 5d 波 6：F068 frontend 廢除 regression guard
 *
 * 對應 test spec：TS-F068-DEP-009（前端 Sidebar 不含 F068「指派代碼」入口）
 *
 * 5c implementation log 已將此 TS 標 SKIP（屬 5d 範圍）；本波 GREEN 後該 SKIP 改為 PASS。
 *
 * 廢除範圍：
 *   - 刪 apps/web/src/pages/assignment/base-codes-page.tsx
 *   - 刪 apps/web/src/pages/assignment/__tests__/base-codes-page.test.tsx
 *   - 刪 apps/web/src/api/assignment-codes.ts
 *   - 刪 apps/web/src/pages/assignment/field-whitelist-page.tsx（已併入 FieldsTab）
 *   - 刪 apps/web/src/pages/assignment/__tests__/field-whitelist-page.test.tsx
 *   - 刪 apps/web/src/pages/assignment/field-options-page.tsx（已併入 OptionsTab）
 *   - 刪 apps/web/src/pages/assignment/__tests__/field-options-page.test.tsx
 *
 * Sidebar 入口已在波 1 rename 為「篩選欄位」（app-sidebar.test.tsx 涵蓋）。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const WEB_SRC = path.resolve(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 讀取所有 production source（排除 test/spec 檔；regression 自身才能合理出現禁字字串）。
 */
function readAllProductionSrc(): { file: string; content: string }[] {
  return walk(WEB_SRC)
    .filter((f) => !/\.(test|spec)\.(ts|tsx)$/.test(f))
    .filter((f) => !/__tests__/.test(f))
    .map((file) => ({
      file,
      content: fs.readFileSync(file, 'utf-8'),
    }));
}

describe('F068 frontend 廢除 regression — Phase 5d 波 6', () => {
  it('regression-1：base-codes-page.tsx 已刪除', () => {
    const p = path.join(WEB_SRC, 'pages/assignment/base-codes-page.tsx');
    expect(fs.existsSync(p)).toBe(false);
  });

  it('regression-2：api/assignment-codes.ts 已刪除', () => {
    const p = path.join(WEB_SRC, 'api/assignment-codes.ts');
    expect(fs.existsSync(p)).toBe(false);
  });

  it('regression-3：field-whitelist-page.tsx + field-options-page.tsx 已刪除（已併入 FieldsTab / OptionsTab）', () => {
    const fw = path.join(WEB_SRC, 'pages/assignment/field-whitelist-page.tsx');
    const fo = path.join(WEB_SRC, 'pages/assignment/field-options-page.tsx');
    expect(fs.existsSync(fw)).toBe(false);
    expect(fs.existsSync(fo)).toBe(false);
  });

  it('regression-4：apps/web/src 無 import @/api/assignment-codes', () => {
    const all = readAllProductionSrc();
    const offenders = all.filter((f) =>
      /from\s+['"]@\/api\/assignment-codes['"]/.test(f.content),
    );
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it('regression-5：apps/web/src 無 BaseCodesPage / AssignmentTblId / listAssignmentCodes 引用（自我引用之 .test 檔已刪）', () => {
    const all = readAllProductionSrc();
    const re = /\b(BaseCodesPage|AssignmentTblId|listAssignmentCodes|ASSIGNMENT_TBL_IDS|TBL_ID_LABELS)\b/;
    const offenders = all.filter((f) => re.test(f.content));
    expect(offenders.map((o) => path.relative(WEB_SRC, o.file))).toEqual([]);
  });

  it('regression-6 (TS-F068-DEP-009 frontend 部分)：apps/web/src 無中文「指派代碼」字串', () => {
    const all = readAllProductionSrc();
    const offenders = all.filter((f) => f.content.includes('指派代碼'));
    expect(offenders.map((o) => path.relative(WEB_SRC, o.file))).toEqual([]);
  });
});
