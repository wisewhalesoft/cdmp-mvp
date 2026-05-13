/**
 * F068 / AD-E07-14：擴充 ob_code_df.tbl_id 至 VARCHAR(11) migration 測試
 *
 * 測試策略（R1 妥協方案 A）：
 *   - 採 mock QueryRunner，驗 up() 是否以正確 SQL 呼叫 query()。
 *   - PG 實際 ALTER COLUMN TYPE + 39 筆 dump 資料轉碼留待 npm run migration:run 手動驗收。
 *   - down() 行為驗證為「拋出不可逆錯誤」。
 *
 * 涵蓋 8 個 case：
 *   1. up() 第一條 SQL 為 ALTER COLUMN TYPE VARCHAR(11)
 *   2. up() 執行 '01' → 'PROD_KIND' UPDATE
 *   3. up() 執行 '02' → 'SPEC_TP' UPDATE
 *   4. up() 執行 '22' → 'CASE_STATUS' UPDATE
 *   5. up() 所有 UPDATE 限定 system_id = 'OB'（白名單外不轉）
 *   6. up() 各步驟總共執行 4 條 query（1 ALTER + 3 UPDATE）
 *   7. down() 拋 Error
 *   8. down() 錯誤訊息提示「not reversible」並指引 snapshot restore
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { ExtendObCodeDfTblIdToVarchar111711360000150 } from '../1711360000150-ExtendObCodeDfTblIdToVarchar11';

describe('Migration 1711360000150: ExtendObCodeDfTblIdToVarchar11', () => {
  let migration: ExtendObCodeDfTblIdToVarchar111711360000150;
  let queryRunner: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    migration = new ExtendObCodeDfTblIdToVarchar111711360000150();
    queryRunner = {
      query: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('up()', () => {
    it('1) 第一條 SQL 為 ALTER TABLE ob_code_df ALTER COLUMN tbl_id TYPE VARCHAR(11)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const firstCall = queryRunner.query.mock.calls[0][0];
      expect(firstCall).toMatch(/ALTER TABLE\s+ob_code_df/i);
      expect(firstCall).toMatch(/ALTER COLUMN\s+tbl_id/i);
      expect(firstCall).toMatch(/VARCHAR\(11\)/i);
    });

    it("2) 執行 '01' → 'PROD_KIND' UPDATE", async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/UPDATE\s+ob_code_df\s+SET\s+tbl_id\s*=\s*'PROD_KIND'\s+WHERE\s+system_id\s*=\s*'OB'\s+AND\s+tbl_id\s*=\s*'01'/i);
    });

    it("3) 執行 '02' → 'SPEC_TP' UPDATE", async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/UPDATE\s+ob_code_df\s+SET\s+tbl_id\s*=\s*'SPEC_TP'\s+WHERE\s+system_id\s*=\s*'OB'\s+AND\s+tbl_id\s*=\s*'02'/i);
    });

    it("4) 執行 '22' → 'CASE_STATUS' UPDATE", async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const allSql = queryRunner.query.mock.calls.map((c) => c[0]).join('\n');
      expect(allSql).toMatch(/UPDATE\s+ob_code_df\s+SET\s+tbl_id\s*=\s*'CASE_STATUS'\s+WHERE\s+system_id\s*=\s*'OB'\s+AND\s+tbl_id\s*=\s*'22'/i);
    });

    it("5) 所有 UPDATE 限定 system_id = 'OB'（白名單外 tbl_id 不轉）", async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const updateCalls = queryRunner.query.mock.calls
        .map((c) => c[0])
        .filter((sql) => /^\s*UPDATE/i.test(sql));

      expect(updateCalls.length).toBeGreaterThan(0);
      for (const sql of updateCalls) {
        expect(sql).toMatch(/WHERE[^;]*system_id\s*=\s*'OB'/i);
      }

      // 反向驗證：不應該有 UPDATE 修改 '03' / '04' / '05' / '06' / 'CASEYEAR' 等其他 tbl_id
      const forbiddenPatterns = [
        /tbl_id\s*=\s*'03'/,
        /tbl_id\s*=\s*'04'/,
        /tbl_id\s*=\s*'05'/,
        /tbl_id\s*=\s*'06'/,
        /CASEYEAR/,
      ];
      for (const sql of updateCalls) {
        // 來源 tbl_id（WHERE 子句）不應在白名單外
        const whereMatch = sql.match(/WHERE\s+system_id\s*=\s*'OB'\s+AND\s+tbl_id\s*=\s*'(\w+)'/i);
        expect(whereMatch).not.toBeNull();
        const sourceTblId = whereMatch![1];
        expect(['01', '02', '22']).toContain(sourceTblId);
        // 額外保險
        for (const pattern of forbiddenPatterns) {
          expect(sourceTblId).not.toMatch(pattern);
        }
      }
    });

    it('6) 總共執行 4 條 query（1 ALTER + 3 UPDATE）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      expect(queryRunner.query).toHaveBeenCalledTimes(4);

      const alterCalls = queryRunner.query.mock.calls
        .map((c) => c[0])
        .filter((sql) => /^\s*ALTER/i.test(sql));
      const updateCalls = queryRunner.query.mock.calls
        .map((c) => c[0])
        .filter((sql) => /^\s*UPDATE/i.test(sql));

      expect(alterCalls).toHaveLength(1);
      expect(updateCalls).toHaveLength(3);
    });
  });

  describe('down()', () => {
    it('7) 拋 Error（不可逆 migration，OQ-F068-02）', async () => {
      await expect(
        migration.down(queryRunner as unknown as QueryRunner),
      ).rejects.toThrow();
    });

    it('8) 錯誤訊息提示「not reversible」並指引 snapshot restore', async () => {
      await expect(
        migration.down(queryRunner as unknown as QueryRunner),
      ).rejects.toThrow(/not reversible/i);

      // 取得錯誤訊息進一步驗證
      try {
        await migration.down(queryRunner as unknown as QueryRunner);
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toMatch(/1711360000150/);
        expect(msg).toMatch(/snapshot/i);
      }
    });
  });
});
