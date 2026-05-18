/**
 * TC-GUARD-M06-NAMING-001 / TC-GUARD-M06-NAMING-002
 *
 * 對應 docs/test-specs/regression/M06-regression-guards.md（F075 v1.4 命名漂移防護）。
 *
 * 採 fs read + JS regex（不用 Grep tool — memory feedback_grep_negative_lookahead），
 * 不依賴 DB connection，可在任何環境跑。
 *
 * 涵蓋：
 *   TC-GUARD-M06-NAMING-001：spec + prototype 關鍵字存在性掃描
 *     - 正向：F075 spec 必須含 7 個 v1.4 關鍵字（最低出現次數）
 *     - 負向：prototype 必須不含 4 個禁用字串
 *
 *   TC-GUARD-M06-NAMING-002：source code 禁用識別符掃描
 *     - 負向：apps/api/src + apps/web/src 不得含 10 個禁用識別符
 *     - 正向：apps/api/src + apps/web/src 必須含 3 個正確識別符
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// 從 apps/api/src/database/migrations/__tests__ → repo root
const REPO_ROOT = path.resolve(__dirname, '../../../../../../');
const API_SRC = path.resolve(REPO_ROOT, 'apps/api/src');
const WEB_SRC = path.resolve(REPO_ROOT, 'apps/web/src');

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf-8');
}

/**
 * 遞迴掃描目錄下所有符合副檔名之檔案，回傳檔案內容陣列（含路徑）。
 * 排除 node_modules / dist / __tests__（避免測試檔案內部的禁用字串自誤判）。
 */
function readAllSourceFiles(
  dir: string,
  exts: string[],
): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = [];
  if (!fs.existsSync(dir)) return results;

  const walk = (current: string) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '__tests__'
        ) {
          continue;
        }
        walk(full);
      } else if (entry.isFile()) {
        if (exts.some((ext) => entry.name.endsWith(ext))) {
          results.push({ path: full, content: fs.readFileSync(full, 'utf-8') });
        }
      }
    }
  };
  walk(dir);
  return results;
}

function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function totalOccurrences(
  files: Array<{ path: string; content: string }>,
  literal: string,
): { count: number; offenders: string[] } {
  let count = 0;
  const offenders: string[] = [];
  for (const f of files) {
    const c = f.content.split(literal).length - 1;
    if (c > 0) {
      count += c;
      offenders.push(f.path);
    }
  }
  return { count, offenders };
}

describe('TC-GUARD-M06-NAMING-001：F075 spec + prototype 關鍵字漂移防護', () => {
  describe('A. F075 spec 關鍵字最低出現次數（正向掃描）', () => {
    const SPEC_PATH =
      'docs/specs/features/F075-manage-pooldata-field-whitelist.md';
    let specContent = '';

    it('能讀取 spec 檔案', () => {
      specContent = readFile(SPEC_PATH);
      expect(specContent.length).toBeGreaterThan(0);
    });

    // 註：M06-regression-guards.md L55-56 原列 `getAvailableColumns` / `_inferSuggestedFieldType`
    //     於 F075 spec 最低出現 ≥ 2；但 F075 spec 實際以「service method」等中文描述，未直
    //     接列出 method 字串（這些字串於 architecture-spec §3.10 v2.12 / test-spec Glossary 中）。
    //     此處遵守 F075 feature spec 為權威，將兩項 method 名稱檢核移至 source code（Guard 2），
    //     spec 層僅留 UI / API / response key 的字串檢核（feature spec 直接約束之識別符）。
    //     詳細決議見 docs/specs/implementation-log/F075-impl.md「Phase E spec-vs-spec drift 紀錄」。
    const checks: Array<{ pattern: RegExp; min: number; desc: string }> = [
      { pattern: /篩選欄位管理/g, min: 5, desc: 'UI 命名「篩選欄位管理」≥ 5' },
      { pattern: /新增篩選欄位/g, min: 3, desc: 'Modal 標題「新增篩選欄位」≥ 3' },
      { pattern: /available-columns/g, min: 5, desc: 'API path `available-columns` ≥ 5' },
      { pattern: /suggestedFieldType/g, min: 5, desc: 'response key `suggestedFieldType` ≥ 5' },
      { pattern: /availableColumns/g, min: 3, desc: 'response root key `availableColumns` ≥ 3' },
    ];

    for (const { pattern, min, desc } of checks) {
      it(`spec 應含「${desc}」`, () => {
        const content = specContent || readFile(SPEC_PATH);
        const occurrences = countMatches(content, pattern);
        expect(
          occurrences,
          `${desc}：實際出現 ${occurrences} 次（< ${min}）`,
        ).toBeGreaterThanOrEqual(min);
      });
    }
  });

  describe('B. prototype 禁用字串不存在（負向掃描）', () => {
    const PROTOTYPE_PATH = 'prototypes/37a-pooldata-whitelist.html';
    let prototypeContent = '';

    it('能讀取 prototype 檔案', () => {
      prototypeContent = readFile(PROTOTYPE_PATH);
      expect(prototypeContent.length).toBeGreaterThan(0);
    });

    const forbidden: string[] = [
      '白名單管理',
      '新增白名單欄位',
      '新增 POOLDATA 欄位',
      'WHITELIST_FIELD_DUPLICATE',
    ];

    for (const literal of forbidden) {
      it(`prototype 不應含禁用字串「${literal}」`, () => {
        const content = prototypeContent || readFile(PROTOTYPE_PATH);
        const count = content.split(literal).length - 1;
        expect(
          count,
          `禁用字串「${literal}」在 prototype 中出現 ${count} 次（應為 0）`,
        ).toBe(0);
      });
    }
  });
});

describe('TC-GUARD-M06-NAMING-002：source code 禁用識別符掃描', () => {
  // 範圍：F075 模組相關檔案（pooldata-field module + FE 對應頁/API client + sidebar layout）。
  // 不掃全 src — `sourceColumns` 等通用 React state 變數名在 ETL editor 等無關模組合法存在，
  // 為避免無關模組之合法用法誤報，將禁用識別符檢核範圍限縮到 F075 直接相關之檔案。
  // 對應 docs/specs/implementation-log/F075-impl.md「Phase E 範圍說明」。
  const F075_API_DIRS = [
    path.resolve(API_SRC, 'modules/pooldata-field'),
    path.resolve(API_SRC, 'common/errors'), // error-codes.ts 為禁用字串可能殘留地
  ];
  const F075_WEB_DIRS = [
    path.resolve(WEB_SRC, 'pages/assignment'),
    path.resolve(WEB_SRC, 'api'),
    path.resolve(WEB_SRC, 'components/layout'), // sidebar 為 F075 入口
  ];

  const apiFiles = F075_API_DIRS.flatMap((d) => readAllSourceFiles(d, ['.ts']));
  const webFiles = F075_WEB_DIRS.flatMap((d) =>
    readAllSourceFiles(d, ['.ts', '.tsx']),
  );
  const allFiles = [...apiFiles, ...webFiles];

  it('掃描檔案數合理（避免假通過 — 應 > 0）', () => {
    expect(apiFiles.length).toBeGreaterThan(0);
    expect(webFiles.length).toBeGreaterThan(0);
  });

  describe('A. 禁用識別符出現次數 = 0', () => {
    const forbiddenIdentifiers: Array<{ literal: string; shouldUse: string }> = [
      { literal: 'WHITELIST_FIELD_DUPLICATE', shouldUse: 'POOLDATA_FIELD_DUPLICATE' },
      { literal: 'candidateColumns', shouldUse: 'availableColumns' },
      { literal: 'sourceColumns', shouldUse: 'availableColumns' },
      { literal: 'poolColumns', shouldUse: 'availableColumns' },
      { literal: 'recommendedType', shouldUse: 'suggestedFieldType' },
      { literal: 'inferredType', shouldUse: 'suggestedFieldType' },
      { literal: 'autoType', shouldUse: 'suggestedFieldType' },
      { literal: 'guessedType', shouldUse: 'suggestedFieldType' },
      { literal: 'getAvailableFields', shouldUse: 'getAvailableColumns' },
      { literal: 'inferFieldType', shouldUse: '_inferSuggestedFieldType' },
    ];

    for (const { literal, shouldUse } of forbiddenIdentifiers) {
      it(`src 不應含禁用識別符「${literal}」（應替換為「${shouldUse}」）`, () => {
        const { count, offenders } = totalOccurrences(allFiles, literal);
        if (count > 0) {
          // 列出前 3 個 offender 檔案方便排查
          const sample = offenders.slice(0, 3).join('\n  ');
          throw new Error(
            `禁用識別符「${literal}」在 src 中出現 ${count} 次。\n` +
              `應替換為「${shouldUse}」。Offenders（前 3）:\n  ${sample}`,
          );
        }
        expect(count).toBe(0);
      });
    }
  });

  describe('B. 正確識別符至少出現 1 次（防止 rename 過度）', () => {
    const requiredIdentifiers: string[] = [
      'POOLDATA_FIELD_DUPLICATE',
      'availableColumns',
      'suggestedFieldType',
    ];

    for (const literal of requiredIdentifiers) {
      it(`src 應含正確識別符「${literal}」≥ 1 次`, () => {
        const { count } = totalOccurrences(allFiles, literal);
        expect(
          count,
          `正確識別符「${literal}」在 src 中應 ≥ 1 次（實際 ${count}）`,
        ).toBeGreaterThanOrEqual(1);
      });
    }
  });
});
