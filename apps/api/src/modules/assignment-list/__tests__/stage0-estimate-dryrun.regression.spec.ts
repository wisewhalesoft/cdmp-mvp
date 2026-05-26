/**
 * F092 — TS-F092-RG-001 regression guard（靜態原始碼分析）
 *
 * 對應 spec：F092 AC-1（estimateListCount 內部改呼叫 executeStage1Chain；
 *           舊欄位篩選版 buildPoolCountQuery / buildStage1WhereConditions(...).getCount() 路徑應被取代）。
 *
 * 以 fs 讀取 stage0-estimate.service.ts 原始碼做正則斷言（記憶 feedback_grep_negative_lookahead：
 * 不可僅靠 Grep tool；以實檔 + regex regression guard 驗證）。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVICE_PATH = join(__dirname, '..', 'stage0-estimate.service.ts');

describe('F092 TS-F092-RG-001：舊欄位篩選版 COUNT 路徑已移除', () => {
  const src = readFileSync(SERVICE_PATH, 'utf-8');

  it('estimateListCount 改呼叫 executeStage1Chain', () => {
    expect(src).toMatch(/executeStage1Chain\s*\(/);
  });

  it('傳遞 { dryRun: true }（dry-run 模式）', () => {
    expect(src).toMatch(/dryRun:\s*true/);
  });

  it('不再保留舊版 buildPoolCountQuery 私有方法', () => {
    // 舊版以 buildStage1WhereConditions(def) → getCount() 的 COUNT 路徑封裝於 buildPoolCountQuery
    expect(src).not.toMatch(/private\s+async\s+buildPoolCountQuery/);
  });

  it('estimateListCount 路徑不再直接以 buildStage1WhereConditions(...).getCount() 計算 COUNT', () => {
    // 升級後不應再出現 .getCount() 作為 estimate 主路徑
    expect(src).not.toMatch(/\.getCount\(\)/);
  });

  it('已注入 ObPoolDataList repository（去重查詢需要）', () => {
    expect(src).toMatch(/ObPoolDataList/);
  });
});
