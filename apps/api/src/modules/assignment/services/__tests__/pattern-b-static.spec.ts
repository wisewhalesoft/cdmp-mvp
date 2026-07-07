/**
 * AD-E07-38 P1c — STATIC / PARAM 靜態守門（fs + regex，非僅 Grep tool，見 feedback_grep_negative_lookahead）。
 *
 * 覆蓋 PARAM-001 / PARAM-005 / PARAM-011 / PARAM-017、STATIC-001（交付物）、STATIC-002（殘留 $n 掃描）。
 * 全數讀原始碼字串比對，CI 恆常執行、不連資料庫。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// __tests__ → services/
const PIPELINE = path.resolve(HERE, '../assignment-run-pipeline.service.ts');
const REPORT = path.resolve(HERE, '../assignment-run-report.service.ts');
// __tests__ → services → assignment → modules → assignment-stage/
const PERSONNEL = path.resolve(
  HERE,
  '../../../assignment-stage/personnel-ratio.service.ts',
);

/** 移除 `/* *​/` 區塊註解與 `//` 行註解——只掃描實際程式碼（$n 位置參數存在於 SQL 字串，非文件說明）。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function read(p: string): string {
  return stripComments(fs.readFileSync(p, 'utf8'));
}

/** 擷取自 startMarker 至 endMarker（不含）之方法片段。 */
function slice(src: string, startMarker: string, endMarker: string): string {
  const s = src.indexOf(startMarker);
  expect(s, `找不到 ${startMarker}`).toBeGreaterThanOrEqual(0);
  const e = src.indexOf(endMarker, s);
  expect(e, `找不到 ${endMarker}`).toBeGreaterThan(s);
  return src.slice(s, e);
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'docs')) && fs.existsSync(path.join(dir, 'apps'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('repo root not found from ' + start);
}

describe('AD-E07-38 P1c STATIC/PARAM — 站點 1/2 靜態守門（pipeline）', () => {
  const prefetch = () =>
    slice(
      read(PIPELINE),
      'private async prefetchScoringSources(',
      'return { ccMap, arMap };',
    );

  // PARAM-001
  it('TS-MSSQL-P1C-PARAM-001：站點 1（customer_core）已改具名參數慣例', () => {
    const body = prefetch();
    expect(body).not.toContain('= ANY($1)');
    expect(body).toContain('IN (:...custoNos)');
    expect(body).toContain('escapeQueryWithParameters');
  });

  // PARAM-005
  it('TS-MSSQL-P1C-PARAM-005：站點 2（ob_arreturndf_min_cap）已改具名參數慣例', () => {
    const body = prefetch();
    expect(body).not.toContain('appl_no = ANY($1)');
    expect(body).toContain('IN (:...applNos)');
  });

  // STATIC-002（站點 1/2 範圍殘留 $n 掃描）
  it('TS-MSSQL-P1C-STATIC-002a：prefetchScoringSources 範圍內無殘留 $n 位置參數', () => {
    const body = prefetch();
    const hits = body.match(/\$\d+/g) ?? [];
    expect(hits).toEqual([]);
  });
});

describe('AD-E07-38 P1c STATIC/PARAM — 站點 4 靜態守門（buildExportQuery）', () => {
  const buildExport = () =>
    slice(
      read(REPORT),
      'private async buildExportQuery(',
      'EXPORT_FETCH_BATCH',
    );

  // PARAM-011
  it('TS-MSSQL-P1C-PARAM-011：主參數改為 :runId（不再 r.run_id = $1）', () => {
    const body = buildExport();
    expect(body).not.toContain('r.run_id = $1');
    expect(body).toContain('r.run_id = :runId');
  });

  // PARAM-012（靜態部分：巢狀 scope 亦為具名參數 + 單一次 escape）
  it('TS-MSSQL-P1C-PARAM-012：scope 子句用 :...emplIds，且單一次 escapeQueryWithParameters 展開', () => {
    const body = buildExport();
    expect(body).toContain('r.emplid IN (:...emplIds)');
    // 僅一次 escapeQueryWithParameters 呼叫（不拆兩段）
    const count = (body.match(/escapeQueryWithParameters/g) ?? []).length;
    expect(count).toBe(1);
    // 空轄區仍保留 1=0 guard（ESCAPE-004）
    expect(body).toContain('1 = 0');
  });

  // PARAM-017 / STATIC-002（buildExportQuery 範圍殘留 $n 掃描，cursorRows 除外）
  it('TS-MSSQL-P1C-PARAM-017：buildExportQuery 全路徑無殘留裸 $n 位置參數字面值', () => {
    const body = buildExport();
    const hits = body.match(/\$\d+/g) ?? [];
    expect(hits).toEqual([]);
  });
});

describe('AD-E07-38 P1c STATIC — 站點 3 鎖三分支已接線（personnel-ratio）', () => {
  it('personnel-ratio 已移除二元 isPostgres() gate、改用 acquireAutoAdvanceLock 三分支', () => {
    const src = read(PERSONNEL);
    expect(src).toContain('resolveLockDbKind');
    expect(src).toContain('acquireAutoAdvanceLock');
    expect(src).toContain('assertMssqlLockPrecondition');
    // 舊二元 gate 私有方法已移除
    expect(src).not.toContain('private isPostgres()');
  });
});

describe('AD-E07-38 P1c STATIC-001 — Pattern B 完整站點清單交付物', () => {
  it('TS-MSSQL-P1C-STATIC-001：站點清單文件存在且涵蓋四分類 phase 分流', () => {
    const root = findRepoRoot(HERE);
    const doc = path.join(
      root,
      'docs/specs/implementation-log/AD-E07-38-pattern-b-site-inventory.md',
    );
    expect(fs.existsSync(doc), `缺交付物：${doc}`).toBe(true);
    const text = fs.readFileSync(doc, 'utf8');
    // 四分類（AD §3 D-5 其餘 ~40 站點分流建議）
    expect(text).toContain('Phase 3a');
    expect(text).toContain('Phase 4');
    expect(text).toContain('Phase 6');
    expect(text).toContain('c360');
    // 至少含檔名+行號格式（站點:行）
    expect(/\.ts:\d+/.test(text)).toBe(true);
  });
});
