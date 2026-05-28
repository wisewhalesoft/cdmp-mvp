import { MigrationInterface, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * m296 / M-B2 / US-144（AD-E07-18 §18.12.10 / F050 v2.3 AC-8）：
 *   BackfillBestCaseConditionPayloadDraftLists
 *
 * 目的：對 `stage = 'draft'` 且 `condition_payload IS NOT NULL` 之名單回填 best_case: ['Y']：
 *   - conditions 不含 best_case → push `{ columnName:'best_case', fieldType:'categorical', values:['Y'] }`
 *   - 已含但 values ≠ ['Y'] → 正規化為 ['Y']
 *   - 已含正確值 → skip（idempotent，無資料異動）
 *
 * 回填範圍（§18.12.10 決策 18.12.7）：
 *   ✅ stage='draft' AND condition_payload IS NOT NULL
 *   ✅ 跳過 condition_payload IS NULL（legacy null-payload，路徑 B 不觸碰）
 *   ✅ 跳過 stage IN (dept_ratio / personnel_ratio / approval / ready)（凍結快照）
 *
 * PG / SQLite 雙模式：
 *   - SQLite：condition_payload 存為 TEXT（simple-json）→ queryRunner 讀回為字串，需 JSON.parse；
 *     寫回時序列化為字串
 *   - PG：JSONB → queryRunner 讀回為物件（已反序列化）；寫回以 ::jsonb 參數綁定
 *
 * Idempotency：step ⑤ skip already-correct rows；重複 up() 對已含正確 best_case:['Y'] 之名單無任何異動。
 *
 * 依賴：condition_payload 欄位須存在（m281）；is_system_fixed 欄位須存在（m295）。
 *   本 migration up() 不查 whitelist（固定值 hardcode best_case → ['Y']，一次性操作）。
 *
 * 對應 test spec：F050-test.md §十六 O 群組：TS-F050-O07 ~ O10 / US-144 TC-144-06。
 */

const BEST_CASE_COLUMN = 'best_case';
const BEST_CASE_FIXED = ['Y'];

interface ConditionItem {
  columnName: string;
  fieldType?: string;
  values?: string[];
  [k: string]: unknown;
}
interface ConditionPayload {
  conditions?: ConditionItem[];
  logic?: string;
  [k: string]: unknown;
}

function parsePayload(raw: unknown): ConditionPayload | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ConditionPayload;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as ConditionPayload;
  return null;
}

function valuesEqual(a: string[] | undefined, b: string[]): boolean {
  if (!Array.isArray(a)) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export class BackfillBestCaseConditionPayloadDraftLists1711360000296
  implements MigrationInterface
{
  name = 'BackfillBestCaseConditionPayloadDraftLists1711360000296';
  private readonly logger = new Logger(
    BackfillBestCaseConditionPayloadDraftLists1711360000296.name,
  );

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    const rows = (await queryRunner.query(
      `SELECT list_no, condition_payload
         FROM ob_list_definition
        WHERE stage = 'draft' AND condition_payload IS NOT NULL`,
    )) as Array<{ list_no: string; condition_payload: unknown }>;

    let updated = 0;
    for (const row of rows) {
      const payload = parsePayload(row.condition_payload);
      if (!payload) continue;
      const conditions: ConditionItem[] = Array.isArray(payload.conditions)
        ? payload.conditions
        : [];

      const idx = conditions.findIndex(
        (c) => c.columnName === BEST_CASE_COLUMN,
      );
      let mutated = false;
      if (idx === -1) {
        conditions.push({
          columnName: BEST_CASE_COLUMN,
          fieldType: 'categorical',
          values: [...BEST_CASE_FIXED],
        });
        mutated = true;
      } else if (!valuesEqual(conditions[idx].values, BEST_CASE_FIXED)) {
        conditions[idx] = {
          ...conditions[idx],
          fieldType: conditions[idx].fieldType ?? 'categorical',
          values: [...BEST_CASE_FIXED],
        };
        mutated = true;
      }

      if (!mutated) continue; // idempotent skip

      const nextPayload: ConditionPayload = { ...payload, conditions };
      const serialized = JSON.stringify(nextPayload);
      if (isSqlite) {
        await queryRunner.query(
          `UPDATE ob_list_definition
              SET condition_payload = ?, updated_at = CURRENT_TIMESTAMP
            WHERE list_no = ?`,
          [serialized, row.list_no],
        );
      } else {
        await queryRunner.query(
          `UPDATE ob_list_definition
              SET condition_payload = $1::jsonb, updated_at = CURRENT_TIMESTAMP
            WHERE list_no = $2`,
          [serialized, row.list_no],
        );
      }
      updated += 1;
      if (updated % 50 === 0) {
        this.logger.log(`[m296] backfilled best_case for ${updated} draft lists`);
      }
    }

    this.logger.log(
      `[m296] backfill complete: ${updated} draft list(s) updated (scanned ${rows.length})`,
    );
  }

  /**
   * down(): 從 draft 名單的 condition_payload.conditions 中移除 best_case 條目（逆操作）。
   * for emergency rollback only — 對所有 stage='draft' AND condition_payload IS NOT NULL 執行。
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    const rows = (await queryRunner.query(
      `SELECT list_no, condition_payload
         FROM ob_list_definition
        WHERE stage = 'draft' AND condition_payload IS NOT NULL`,
    )) as Array<{ list_no: string; condition_payload: unknown }>;

    for (const row of rows) {
      const payload = parsePayload(row.condition_payload);
      if (!payload || !Array.isArray(payload.conditions)) continue;
      const filtered = payload.conditions.filter(
        (c) => c.columnName !== BEST_CASE_COLUMN,
      );
      if (filtered.length === payload.conditions.length) continue; // 無 best_case → skip

      const nextPayload: ConditionPayload = {
        ...payload,
        conditions: filtered,
      };
      const serialized = JSON.stringify(nextPayload);
      if (isSqlite) {
        await queryRunner.query(
          `UPDATE ob_list_definition
              SET condition_payload = ?, updated_at = CURRENT_TIMESTAMP
            WHERE list_no = ?`,
          [serialized, row.list_no],
        );
      } else {
        await queryRunner.query(
          `UPDATE ob_list_definition
              SET condition_payload = $1::jsonb, updated_at = CURRENT_TIMESTAMP
            WHERE list_no = $2`,
          [serialized, row.list_no],
        );
      }
    }
  }
}
