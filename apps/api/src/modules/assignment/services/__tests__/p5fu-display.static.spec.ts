/**
 * AD-E07-43 P5 收尾（顯示層 follow-up）— 靜態源碼守門（無需 DB，預設 sqlite lane 恆跑）。
 *
 * 對應測試設計 docs/test-specs/infrastructure/AD-E07-43-P5-followup-display-test.md：
 *   §二 CRNM-SCHEMA-003：entity cr_nm 改用 nvarcharColumnType（沿用既有 helper、不新建）。
 *   §二 CRNM-SCHEMA-004：MSSQL baseline ob_monthly_run_result cr_nm varchar(50)→nvarchar(50)、PK 不變。
 *   §二 CRNM-SCHEMA-005：PG baseline（1711360000000）ob_monthly_run_result cr_nm 維持 character varying(50)。
 *   §八 APLFMT-STATIC-001：buildExportQuery 進件日仍取 o.appl_date（GATE-001 落地；既有 sliceFn 不需改）。
 *   §八 APLFMT-STATIC-002：appl_date 依 dialect 分流（mssql=CONVERT/120、postgres=to_char）inline 於方法體。
 *   §八 APLFMT-STATIC-004：formatApplDate 私有方法保留（不刪除、防禦性字串/Date 雙分支）。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const API_ROOT = path.resolve(__dirname, '../../../..'); // apps/api/src

const ENTITY_SRC = fs.readFileSync(
  path.join(API_ROOT, 'database/entities/ob-monthly-run-result.entity.ts'),
  'utf8',
);
const MSSQL_BASELINE_SRC = fs.readFileSync(
  path.join(API_ROOT, 'database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts'),
  'utf8',
);
const SERVICE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../assignment-run-report.service.ts'),
  'utf8',
);

/** 擷取某 CREATE TABLE "<name>" (...) 之單一陳述式文字（到下一個 CREATE TABLE 前）。 */
function createTableStmt(src: string, table: string): string {
  const marker = `CREATE TABLE "${table}"`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`CREATE TABLE not found: ${table}`);
  const rest = src.slice(start + marker.length);
  const next = rest.indexOf('CREATE TABLE ');
  return rest.slice(0, next < 0 ? rest.length : next);
}

/** 從方法簽名切片方法體（比照 f064-export-23col.spec.ts 之 sliceFn）。 */
function sliceFn(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`fn not found: ${signature}`);
  const rest = src.slice(start + signature.length);
  const boundary = rest.search(/\n  (private |protected |public |async |\/\*\*|[a-zA-Z]+\()/);
  return rest.slice(0, boundary < 0 ? rest.length : boundary);
}

describe('AD-E07-43 P5 收尾 — 顯示層靜態守門', () => {
  // -----------------------------------------------------------------------
  // CRNM — cr_nm nvarchar 型別修法之源碼落地
  // -----------------------------------------------------------------------
  describe('CRNM-SCHEMA（源碼靜態）', () => {
    it('TS-P5FU-CRNM-SCHEMA-003：entity import 並套用 nvarcharColumnType 於 cr_nm；其餘欄位 literal varchar 不變', () => {
      // import 既有 helper（不新建）
      expect(ENTITY_SRC).toContain('nvarcharColumnType');
      // cr_nm 欄改用 helper（length 50 不變、nullable 不變）
      expect(ENTITY_SRC).toMatch(
        /@Column\(\{\s*name:\s*'cr_nm',\s*type:\s*nvarcharColumnType,\s*length:\s*50,\s*nullable:\s*true\s*\}\)/,
      );
      // 範圍界定（對稱 SCHEMA-002）：僅 cr_nm 使用 helper；其餘 12 欄仍為 literal 'varchar'
      for (const col of [
        'list_no',
        'orgno',
        'appl_no',
        'custo_no',
        'card_level',
        'tier_level',
        'is_cr',
        'cr_id',
        'dept_id',
        'emplid',
        'emplid_deptid',
        'result_status',
        'assignday',
      ]) {
        expect(ENTITY_SRC).toMatch(
          new RegExp(`name:\\s*'${col}',\\s*type:\\s*'varchar'`),
        );
      }
    });

    it('TS-P5FU-CRNM-SCHEMA-004：MSSQL baseline ob_monthly_run_result cr_nm=nvarchar(50)、PK 與其餘欄位不變', () => {
      const stmt = createTableStmt(MSSQL_BASELINE_SRC, 'ob_monthly_run_result');
      // 修法目標：cr_nm nvarchar(50)
      expect(stmt).toContain('"cr_nm" nvarchar(50)');
      expect(stmt).not.toContain('"cr_nm" varchar(50)');
      // 其餘欄位/PK 逐字不變（抽樣核對，避免修法誤擴大）
      expect(stmt).toContain('"cr_id" varchar(20)');
      expect(stmt).toContain('"tier_level" varchar(5)');
      expect(stmt).toContain('"assignday" varchar(100)');
      expect(stmt).toContain('PK_ae7626a9cdbb4815d2dc08ead13');
    });

    it('TS-P5FU-CRNM-SCHEMA-004b：MSSQL baseline 其餘 cr_nm 站點（ob_pool_data_list，P5i 已 nvarchar）不受影響', () => {
      const stmt = createTableStmt(MSSQL_BASELINE_SRC, 'ob_pool_data_list');
      expect(stmt).toContain('"cr_nm" nvarchar(50)');
    });
    // TS-P5FU-CRNM-SCHEMA-005（PG baseline cr_nm 守門）已隨 PG 全面移除刪除。
  });

  // -----------------------------------------------------------------------
  // APLFMT — appl_date SQL 端格式化之源碼落地
  // -----------------------------------------------------------------------
  describe('APLFMT-STATIC（源碼靜態）', () => {
    const body = sliceFn(SERVICE_SRC, 'private async buildExportQuery(');

    it('TS-P5FU-APLFMT-STATIC-001：buildExportQuery 進件日仍取 o.appl_date、非 r.appl_date（GATE-001；既有 APLDATE-002 不需改）', () => {
      expect(body).toContain('o.appl_date');
      expect(body).not.toContain('r.appl_date');
    });

    it('TS-P5FU-APLFMT-STATIC-002：appl_date 依 dialect 分流 inline（mssql=CONVERT/120、postgres=to_char）', () => {
      // dialect 分流以 dataSource.options.type
      expect(body).toContain('this.dataSource.options.type');
      // mssql 分支：CONVERT(varchar(10), o.appl_date, 120)
      expect(body).toContain('CONVERT(varchar(10), o.appl_date, 120)');
      expect(/CONVERT\(varchar\(10\), o\.appl_date, 120\)/.test(body)).toBe(true);
      // postgres 分支：to_char(o.appl_date, 'YYYY-MM-DD')
      expect(body).toContain("to_char(o.appl_date, 'YYYY-MM-DD')");
      // 字面量須 inline 於方法體（GATE-001）——上面 sliceFn 已為方法體切片，通過即代表 inline。
      // 且 SELECT 以插值使用該運算式
      expect(body).toContain('${applDateExpr}');
    });

    it('TS-P5FU-APLFMT-STATIC-003：既有 sliceFn 靜態測試（DET/LINEAGE/REGRESSION/SCOPE）之守門條件不因本修法回歸', () => {
      // ORDER BY 確定性不變
      expect(body).toContain('ORDER BY r.list_no, r.orgno, r.appl_no');
      // 剝除註解後：INNER JOIN ob_pool_data、不 JOIN ob_pool_data_list
      const code = body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(/INNER JOIN\s+ob_pool_data\s+o/i.test(code)).toBe(true);
      expect(/JOIN\s+ob_pool_data_list/i.test(code)).toBe(false);
      // 禁用欄位/隨機序不出現（REGRESSION-005 / DET-002）
      expect(/custo_no|cust_name|card_level|score/i.test(body)).toBe(false);
      expect(/RANDOM\(\)|NEWID\(\)/i.test(body)).toBe(false);
      // scope 注入仍為 emplid IN（SCOPE-005）
      expect(body).toContain('r.emplid IN');
    });

    it('TS-P5FU-APLFMT-STATIC-004：formatApplDate 私有方法保留（不刪除，Date/字串雙分支防禦）', () => {
      expect(SERVICE_SRC).toContain('private formatApplDate(');
      const fmt = sliceFn(SERVICE_SRC, 'private formatApplDate(');
      // 字串分支（SQL 端格式化後之實際路徑）：取前 10 碼 + 斜線化
      expect(fmt).toContain("slice(0, 10)");
      expect(fmt).toContain("replace(/-/g, '/')");
    });
  });
});
