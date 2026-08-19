/**
 * F119 / US-183 — BR-8 大小寫 / 全半形敏感度之真實 MSSQL 驗證（T-7 / T-18）。
 *
 * 撰寫依據：F119 spec BR-8（"現行 DB 為 MSSQL 2022 / Chinese_Taiwan_Stroke_BIN（逐 byte 比較，
 * 大小寫敏感、全半形敏感）...此敏感度同時適用於篩選比對與重複判定簽章"）+ §10 T-7/T-18 +
 * AD-E07-50 §3.2/§3.3（`buildCategoricalOperatorFragment` 契約）。
 *
 * 撰寫依據同 `f119-categorical-operator-fragment.spec.ts`：呼叫**尚未實作**之
 * `buildCategoricalOperatorFragment()` 取得 fragment/params，執行於真實 MSSQL——與該檔案的
 * SQLite 版本同一手法，差異僅在執行引擎（此處驗證 collation 敏感度，SQLite 無法重現此行為）。
 * 本輪 authoring 前純函式尚未匯出，本檔於此刻執行必為紅（TypeError），與其餘 F119 測試同理由；
 * 一旦實作落地，紅燈轉綠同時證明「函式邏輯正確」與「真實 MSSQL collation 下行為符合 BR-8」。
 *
 * **範圍與安全性**：`colExpr` 傳入字面值 `CAST(N'...' AS nvarchar(n))`（把「待測欄位值」直接
 * 內嵌為 SQL 字面值），而非查詢 `ob_pool_data` 實際列——**不寫入、不插入、不修改任何既有表**
 * （比照既有 `preview-hit-count-customer-core.mssql.spec.ts` 之純讀取慣例，`synchronize: false`）。
 *
 * 依 team lead 指示：本檔為需要真實 DB 執行才能驗證之案例（純函式無法證明 collation 行為），
 * 併跑競爭下需 `vi.setConfig({ testTimeout: 60000 })` 避免偽紅（見對話記錄 2026-08-18）。
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { restoreDbType, MSSQL, mssqlPortReachable, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import {
  buildCategoricalOperatorFragment,
  type CategoricalOperator,
} from '../stage1-query-composer';

vi.setConfig({ testTimeout: 60000 });

let reachable = false;
let ds: DataSource | null = null;

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: MSSQL.database,
      options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
      synchronize: false, // 純字面值查詢，絕不 synchronize 或寫入既有 dev 表
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F119 BR-8 MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
  }
});

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy();
  restoreDbType();
});

/**
 * 將「待測欄位值」直接內嵌為 colExpr 字面值，呼叫 buildCategoricalOperatorFragment 取得
 * fragment/params，轉為 mssql 位置參數（@0, @1, ...）後執行 `SELECT CASE WHEN <fragment> ...`。
 * 回傳 1 = 該欄位值符合此條件、0 = 不符合。
 */
async function evalFragment(
  dataSource: DataSource,
  rowValue: string,
  operator: CategoricalOperator,
  keyword: string,
  nullKeptOnNotContains: boolean,
): Promise<number> {
  const escaped = rowValue.replace(/'/g, "''");
  const result = buildCategoricalOperatorFragment({
    colExpr: `CAST(N'${escaped}' AS nvarchar(100))`,
    operator,
    keyword,
    paramName: 'kw',
    nullKeptOnNotContains,
  });
  if (!result) throw new Error('buildCategoricalOperatorFragment returned null unexpectedly');
  const { fragment, params } = result;
  let sql = fragment;
  const bind: unknown[] = [];
  Object.entries(params).forEach(([key, value], i) => {
    sql = sql.split(`:${key}`).join(`@${i}`);
    bind.push(value);
  });
  const rows = await dataSource.query(`SELECT CASE WHEN ${sql} THEN 1 ELSE 0 END AS matched`, bind);
  return Number(rows[0].matched);
}

describe('F119 BR-8 — 大小寫 / 全半形敏感度（真實 MSSQL，字面值查詢，不寫入任何表）', () => {
  it('環境可達性', () => {
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`[F119 BR-8 MSSQL] ${SKIP_REASON}`);
    }
    expect(true).toBe(true);
  });

  it('COLLATION-001：ob_pool_data.spec_name 欄位之 collation 確為 Chinese_Taiwan_Stroke_BIN（BR-8 前提查證，與函式實作與否無關）', async (ctx) => {
    if (!reachable || !ds) return ctx.skip();
    const rows = await ds.query(
      `SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ob_pool_data' AND COLUMN_NAME = 'spec_name'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(String(rows[0].COLLATION_NAME)).toContain('Chinese_Taiwan_Stroke_BIN');
  });

  it('T-7（★核心）：contains "ABC" 於真實 collation 下不得命中值 "abc"，須命中值 "ABC"（大小寫敏感）', async (ctx) => {
    if (!reachable || !ds) return ctx.skip();
    expect(await evalFragment(ds, 'abc', 'contains', 'ABC', true)).toBe(0);
    expect(await evalFragment(ds, 'ABC', 'contains', 'ABC', true)).toBe(1);
  });

  it('T-18a：equals 大小寫敏感（值 "abc" 不等於關鍵字 "ABC"）', async (ctx) => {
    if (!reachable || !ds) return ctx.skip();
    expect(await evalFragment(ds, 'abc', 'equals', 'ABC', true)).toBe(0);
  });

  it('T-18b：not_contains 大小寫敏感（值 "abc" 對關鍵字 "ABC" 視為不含，予以保留）', async (ctx) => {
    if (!reachable || !ds) return ctx.skip();
    expect(await evalFragment(ds, 'abc', 'not_contains', 'ABC', true)).toBe(1);
  });

  it('T-18c（BR-8 全形/半形敏感）：contains 半形關鍵字不得命中全形字元值', async (ctx) => {
    if (!reachable || !ds) return ctx.skip();
    // 全形 Ａ（U+FF21）vs 半形 A（U+0041）
    expect(await evalFragment(ds, 'Ａ', 'contains', 'A', true)).toBe(0);
  });

  it('T-18d：equals 值恰為關鍵字（中文，正控制組，證明查詢本身未整體失效）', async (ctx) => {
    if (!reachable || !ds) return ctx.skip();
    expect(await evalFragment(ds, '勁便利', 'equals', '勁便利', true)).toBe(1);
  });
});
