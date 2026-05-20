/**
 * F050 v2.1 / AD-E07-18 R5：ObListDefinition.condition_payload 欄位 round-trip 驗證
 *
 * Phase 5a 波 2：entity 加 condition_payload 欄位後，需驗證：
 *   - SQLite e2e 環境（jsonColumnType=simple-json）下 JSON object 寫入 / 讀回為同物件（不為字串）
 *   - 寫入 null 後讀回為 null
 *   - 與 raw SQL 直查對照（simple-json 序列化為 TEXT 儲存）
 *
 * 對應 spec：
 *   - AD-E07-18 §18.10 R5：避免 buildStage1Query 讀到字串
 *   - 對應 test design：TS-F050-029 / 030（DB 寫入 condition_payload）整合測試前置驗證
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DataSource, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';

const YM = '202605';

describe('ObListDefinition entity condition_payload round-trip (Phase 5a 波2)', () => {
  let ds: DataSource;
  let listRepo: Repository<ObListDefinition>;

  beforeAll(async () => {
    process.env.DB_TYPE = 'sqlite';
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [ObListDefinition],
      synchronize: true,
    });
    await ds.initialize();
    listRepo = ds.getRepository(ObListDefinition);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(async () => {
    await listRepo.createQueryBuilder().delete().execute();
  });

  function baseEntity(overrides: Partial<ObListDefinition> = {}): Partial<ObListDefinition> {
    const now = new Date();
    return {
      list_no: 'OB202605001',
      list_nm: 'TEST',
      prod_kind: '01',
      prod_best: '',
      spec_tp: null,
      list_type: '01',
      list_period_start: '1',
      list_period_end: '6',
      list_interval: '1',
      assigned_date: null,
      total_amount: null,
      reserved_amount: null,
      is_assigned: null,
      project_workym: YM,
      casenumber: null,
      name: null,
      caseyear: null,
      caseyearnm: null,
      settle_src: null,
      card_type: null,
      status: 'active',
      stage: 'draft',
      case_status: null,
      cr_enabled: false,
      condition_payload: null,
      created_by_prog: 'TEST',
      created_by: 'TEST',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'TEST',
      updated_at: now,
      ...overrides,
    };
  }

  it('ENT-001：寫入 JSON object 後 findOne 讀回為同物件（不為字串）', async () => {
    const payload = {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] },
        { columnName: 'month_cnt', fieldType: 'numeric', min: 1, max: 6 },
      ],
      logic: 'AND' as const,
    };

    await listRepo.save(listRepo.create(baseEntity({ condition_payload: payload }) as ObListDefinition));

    const found = await listRepo.findOne({ where: { list_no: 'OB202605001' } });
    expect(found).not.toBeNull();
    expect(typeof found!.condition_payload).toBe('object');
    expect(found!.condition_payload).toEqual(payload);
  });

  it('ENT-002：寫入 null 後讀回為 null（不誤打 "null" 字串）', async () => {
    await listRepo.save(listRepo.create(baseEntity({ condition_payload: null }) as ObListDefinition));

    const found = await listRepo.findOne({ where: { list_no: 'OB202605001' } });
    expect(found).not.toBeNull();
    expect(found!.condition_payload).toBeNull();
  });

  it('ENT-003：raw SQL 直查 confirm 序列化為 JSON string', async () => {
    const payload = { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' as const };
    await listRepo.save(listRepo.create(baseEntity({ condition_payload: payload }) as ObListDefinition));

    const raw = await ds.query<Array<{ condition_payload: string | null }>>(
      `SELECT condition_payload FROM ob_list_definition WHERE list_no = 'OB202605001'`,
    );
    expect(raw.length).toBe(1);
    expect(typeof raw[0].condition_payload).toBe('string');
    expect(JSON.parse(raw[0].condition_payload!)).toEqual(payload);
  });

  /**
   * v2.1.1 補強（US-128 / architecture-spec §18.11.4 Entity 修改指引）：
   *   prod_best 欄位放寬為 nullable（string | null）；業務語意已遷移至
   *   condition_payload.conditions[columnName='best_case']。
   *
   * 對應 test spec：F050-test.md §十四 C 群組（TS-F050-C01 / C03）
   */
  describe('v2.1.1 補強 — prod_best nullable + ob_card_type regression', () => {
    it('TS-F050-C01：prod_best 欄位允許寫入 null（M-A2 後 nullable schema）', async () => {
      const entity = baseEntity({ prod_best: null }) as ObListDefinition;
      await listRepo.save(listRepo.create(entity));

      const found = await listRepo.findOne({ where: { list_no: 'OB202605001' } });
      expect(found).not.toBeNull();
      expect(found!.prod_best).toBeNull();
    });

    it('TS-F050-C03：ob_card_type entity regression — 欄位結構不受 v2.1.1 改動影響（card_type / card_name / prod_kind / status 四欄存在）', async () => {
      // Static analysis：讀 entity 檔案內容驗證 @Column 宣告
      // 依[[feedback_grep_negative_lookahead]]：用 fs + regex 確認 4 欄存在，不可僅靠 Grep 工具
      const fs = await import('fs');
      const path = await import('path');
      const entityPath = path.resolve(
        __dirname,
        '../../../database/entities/ob-card-type.entity.ts',
      );
      const src = fs.readFileSync(entityPath, 'utf-8');

      // 4 欄必存在
      expect(src).toMatch(/@PrimaryColumn\(\s*\{[^}]*name:\s*'card_type'/);
      expect(src).toMatch(/@Column\(\s*\{[^}]*name:\s*'card_name'/);
      expect(src).toMatch(/@Column\(\s*\{[^}]*name:\s*'prod_kind'/);
      expect(src).toMatch(/@Column\(\s*\{[^}]*name:\s*'status'/);
    });
  });
});
