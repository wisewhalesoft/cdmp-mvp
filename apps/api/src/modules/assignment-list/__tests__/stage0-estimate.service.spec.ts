/**
 * Stage0EstimateService — F049 Stage 0 每日估算 + 單一 LIST_NO 試算 unit tests
 *
 * 對應 spec：
 *   - F049 v1.0 AC-1：每日估算表（workingDays / totalEstimate / dailyEstimates）
 *   - F049 v1.0 AC-3：Pool 筆數低於 STAGE0_POOL_WARN_THRESHOLD 時 warning = "POOL_COUNT_LOW"
 *   - F049 v1.0 AC-4：單一 LIST_NO 即時試算（不寫入 ob_pool_data_list）
 *   - F049 v1.0 AC-5：試算逾時 10 秒 → STAGE0_ESTIMATE_TIMEOUT
 *   - BR-2：工作日來源 ob_calendar.rest_flg = '0'
 *   - 404：list_no 不存在 / status=inactive
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Stage0EstimateService } from '../stage0-estimate.service';
import { buildStage1WhereConditions } from '@/modules/assignment/stage1/stage1-query-composer';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202605';

async function buildModule(): Promise<{
  service: Stage0EstimateService;
  listRepo: Repository<ObListDefinition>;
  poolRepo: Repository<ObPoolData>;
  calRepo: Repository<ObCalendar>;
  ds: DataSource;
  app: TestingModule;
}> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [ObListDefinition, ObPoolData, ObCalendar],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([ObListDefinition, ObPoolData, ObCalendar]),
    ],
    providers: [Stage0EstimateService],
  }).compile();

  await app.init();

  const ds = app.get(DataSource);
  const listRepo = app.get<Repository<ObListDefinition>>(
    getRepositoryToken(ObListDefinition),
  );
  const poolRepo = app.get<Repository<ObPoolData>>(getRepositoryToken(ObPoolData));
  const calRepo = app.get<Repository<ObCalendar>>(getRepositoryToken(ObCalendar));
  const service = app.get(Stage0EstimateService);

  return { service, listRepo, poolRepo, calRepo, ds, app };
}

async function seedActiveList(
  listRepo: Repository<ObListDefinition>,
  listNo = 'OB202605001',
  overrides: Partial<ObListDefinition> = {},
): Promise<void> {
  const now = new Date();
  await listRepo.save(
    listRepo.create({
      list_no: listNo,
      list_nm: '測試名單',
      prod_kind: 'A',
      prod_best: 'Y',
      list_type: '01',
      list_period_start: '001',
      list_period_end: '030',
      list_interval: '030',
      project_workym: YM,
      caseyear: '113',
      settle_src: '01',
      card_type: 'T1',
      case_status: '01$$02',
      cr_enabled: false,
      status: 'active',
      stage: 'draft',
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: now,
      ...overrides,
    } as Partial<ObListDefinition>),
  );
}

describe('Stage0EstimateService', () => {
  let env: Awaited<ReturnType<typeof buildModule>>;

  beforeAll(async () => {
    env = await buildModule();
  });

  afterAll(async () => {
    await env.app.close();
  });

  beforeEach(async () => {
    delete process.env.STAGE0_POOL_WARN_THRESHOLD;
    // 清空所有測試表（FK 順序：list / pool / cal 彼此無 FK 直接清）
    await env.ds.query('DELETE FROM ob_list_definition');
    await env.ds.query('DELETE FROM ob_pool_data');
    await env.ds.query('DELETE FROM ob_calendar');
  });

  describe('calculateDailyEstimate', () => {
    it('AC-1：依工作日數平均分配（workingDays / dailyEstimates / totalEstimate）', async () => {
      // 模擬 ob_calendar：2026-05 共 3 個工作日
      await env.calRepo.save([
        env.calRepo.create({ calendar_date: new Date('2026-05-04'), rest_flg: '0' }),
        env.calRepo.create({ calendar_date: new Date('2026-05-05'), rest_flg: '0' }),
        env.calRepo.create({ calendar_date: new Date('2026-05-06'), rest_flg: '0' }),
        env.calRepo.create({ calendar_date: new Date('2026-05-02'), rest_flg: '1' }),
      ]);

      // 模擬 ob_pool_data：6 筆
      for (let i = 1; i <= 6; i++) {
        await env.poolRepo.save(
          env.poolRepo.create({
            orgno: '01',
            appl_no: String(i).padStart(10, '0'),
            custo_no: 'C' + i,
            sta_code: '01',
            dept_id: 'D01',
            list_type: '01',
            settle_src: '01',
            _cdmp_extracted_at: new Date(),
          } as Partial<ObPoolData>),
        );
      }

      const res = await env.service.calculateDailyEstimate(YM);

      expect(res.ym).toBe(YM);
      expect(res.workingDays).toBe(3);
      expect(res.poolCount).toBe(6);
      expect(res.totalEstimate).toBe(6);
      expect(res.dailyEstimates).toHaveLength(3);
      // 等分：每天 = floor(6/3) = 2
      expect(res.dailyEstimates[0].estimate).toBe(2);
    });

    it('AC-3：Pool 筆數低於門檻（預設 1000）→ warning = POOL_COUNT_LOW', async () => {
      await env.calRepo.save([
        env.calRepo.create({ calendar_date: new Date('2026-05-04'), rest_flg: '0' }),
      ]);
      // pool 0 筆 < 1000
      const res = await env.service.calculateDailyEstimate(YM);
      expect(res.warning).toBe('POOL_COUNT_LOW');
      expect(res.poolCount).toBe(0);
    });

    it('AC-3：環境變數 STAGE0_POOL_WARN_THRESHOLD 可覆蓋門檻', async () => {
      await env.calRepo.save([
        env.calRepo.create({ calendar_date: new Date('2026-05-04'), rest_flg: '0' }),
      ]);
      process.env.STAGE0_POOL_WARN_THRESHOLD = '5';

      // pool 6 筆 > 5 → no warning
      for (let i = 1; i <= 6; i++) {
        await env.poolRepo.save(
          env.poolRepo.create({
            orgno: '01',
            appl_no: String(i).padStart(10, '0'),
            custo_no: 'C' + i,
            sta_code: '01',
            dept_id: 'D01',
            list_type: '01',
            settle_src: '01',
            _cdmp_extracted_at: new Date(),
          } as Partial<ObPoolData>),
        );
      }
      const res = await env.service.calculateDailyEstimate(YM);
      expect(res.warning).toBeNull();
    });

    it('workingDays = 0 時：totalEstimate = 0 並回傳空 dailyEstimates', async () => {
      // 無 calendar 資料
      const res = await env.service.calculateDailyEstimate(YM);
      expect(res.workingDays).toBe(0);
      expect(res.totalEstimate).toBe(0);
      expect(res.dailyEstimates).toEqual([]);
    });
  });

  describe('estimateListCount', () => {
    it('AC-4：對 active LIST_NO 套用篩選後 COUNT（複用 Stage 1 演算法；路徑 B 多值 IN + 欄位映射）', async () => {
      // v1.2：condition_payload=null → 路徑 B fallback。
      // 篩選欄位：prod_kind='01' / settle_src='N' / case_status='02'（→ list_type）。
      // 不用 caseyear（year_cnt 整數比對在 SQLite 型別親和性與 PG 不同，整數映射另以純函式驗證）。
      await seedActiveList(env.listRepo, 'OB202605001', {
        condition_payload: null,
        prod_kind: '01',
        settle_src: 'N',
        case_status: '02',
        caseyear: null,
        spec_tp: null,
      });

      // 3 筆符合（prod_kind=01 / settle_src=N / list_type=02），其餘各破壞一個條件
      const samples = [
        { appl: '0000000001', prod: '01', settle: 'N', lt: '02', match: true },
        { appl: '0000000002', prod: '01', settle: 'N', lt: '02', match: true },
        { appl: '0000000003', prod: '01', settle: 'N', lt: '02', match: true },
        { appl: '0000000004', prod: '02', settle: 'N', lt: '02', match: false }, // prod_kind 不符
        { appl: '0000000005', prod: '01', settle: 'Y', lt: '02', match: false }, // settle_src 不符
        { appl: '0000000006', prod: '01', settle: 'N', lt: '01', match: false }, // list_type 不符
      ];
      for (const s of samples) {
        await env.poolRepo.save(
          env.poolRepo.create({
            orgno: '01',
            appl_no: s.appl,
            custo_no: 'C' + s.appl,
            sta_code: '01',
            dept_id: 'D01',
            list_type: s.lt,
            settle_src: s.settle,
            prod_kind: s.prod,
            _cdmp_extracted_at: new Date(),
          } as Partial<ObPoolData>),
        );
      }

      const res = await env.service.estimateListCount('OB202605001');
      expect(res.listNo).toBe('OB202605001');
      expect(res.count).toBe(3);
    });

    it('AC-4：路徑 A condition_payload categorical 多值 IN → COUNT（regression：舊 = 比對回 0）', async () => {
      // 路徑 A：prod_kind IN ('01','02')，多值。舊實作以 `=` 比對 '01$$02' 整串 → 0；新實作正確 IN。
      await seedActiveList(env.listRepo, 'OB202605010', {
        prod_kind: 'legacy-ignored',
        caseyear: null,
        spec_tp: null,
        case_status: null,
        settle_src: null,
        condition_payload: {
          logic: 'AND',
          conditions: [
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] },
          ],
        },
      });

      const rows = [
        { appl: '0000000001', prod: '01' },
        { appl: '0000000002', prod: '02' },
        { appl: '0000000003', prod: '03' }, // 不符
      ];
      for (const r of rows) {
        await env.poolRepo.save(
          env.poolRepo.create({
            orgno: '01',
            appl_no: r.appl,
            custo_no: 'C' + r.appl,
            sta_code: '01',
            dept_id: 'D01',
            list_type: '01',
            settle_src: 'N',
            prod_kind: r.prod,
            _cdmp_extracted_at: new Date(),
          } as Partial<ObPoolData>),
        );
      }

      const res = await env.service.estimateListCount('OB202605010');
      expect(res.count).toBe(2); // '01' + '02'，不含 '03'
    });

    it('404：list_no 不存在 → ASSIGNMENT_LIST_NOT_FOUND', async () => {
      await expect(env.service.estimateListCount('OB000000NIL')).rejects.toThrow(
        NotFoundException,
      );
      try {
        await env.service.estimateListCount('OB000000NIL');
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND);
      }
    });

    it('404：list_no 為 inactive → ASSIGNMENT_LIST_NOT_FOUND（spec L121）', async () => {
      await seedActiveList(env.listRepo, 'OB202605002', { status: 'inactive' });
      await expect(env.service.estimateListCount('OB202605002')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('AC-5：模擬查詢逾時 → STAGE0_ESTIMATE_TIMEOUT（500）', async () => {
      await seedActiveList(env.listRepo, 'OB202605003');

      // 透過注入 timeout = 0 ms 觸發逾時分支
      await expect(
        env.service.estimateListCount('OB202605003', { timeoutMs: 0 }),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.STAGE0_ESTIMATE_TIMEOUT },
      });
    });

    // TS-F049-EST-005c：skipReason='EMPTY_CONDITIONS' → estimateListCount 回 count=0（BR-5）
    it('TS-F049-EST-005c：condition_payload.conditions=[] → count=0（HTTP 200，與月跑 Stage 1 skip 一致）', async () => {
      await seedActiveList(env.listRepo, 'OB202605EMP', {
        condition_payload: { logic: 'AND', conditions: [] },
        // 確保不會 fallback 到路徑 B：路徑 A（condition_payload 非 null）優先，空 conditions → skip
      });

      // ob_pool_data 有 5 筆資料（若未正確 skip 會回 5）
      for (let i = 1; i <= 5; i++) {
        await env.poolRepo.save(
          env.poolRepo.create({
            orgno: '01',
            appl_no: String(i).padStart(10, '0'),
            custo_no: 'C' + i,
            sta_code: '01',
            dept_id: 'D01',
            list_type: '01',
            settle_src: 'N',
            prod_kind: '01',
            _cdmp_extracted_at: new Date(),
          } as Partial<ObPoolData>),
        );
      }

      const res = await env.service.estimateListCount('OB202605EMP');
      expect(res.count).toBe(0);
    });

    // TS-F049-EST-007（SQLite COUNT 子集）：路徑 B 多值 $$ split → IN，字串欄位整合驗證
    it('TS-F049-EST-007：路徑 B prod_kind="01$$02" → IN，COUNT 正確（多值整合）', async () => {
      await seedActiveList(env.listRepo, 'OB202605PB1', {
        condition_payload: null,
        prod_kind: '01$$02',
        settle_src: null,
        case_status: null,
        caseyear: null,
        spec_tp: null,
      });

      const rows = ['01', '02', '03', '01'];
      for (let i = 0; i < rows.length; i++) {
        await env.poolRepo.save(
          env.poolRepo.create({
            orgno: '01',
            appl_no: String(i + 1).padStart(10, '0'),
            custo_no: 'C' + i,
            sta_code: '01',
            dept_id: 'D01',
            list_type: '01',
            settle_src: 'N',
            prod_kind: rows[i],
            _cdmp_extracted_at: new Date(),
          } as Partial<ObPoolData>),
        );
      }

      const res = await env.service.estimateListCount('OB202605PB1');
      expect(res.count).toBe(3); // '01' x2 + '02' x1，不含 '03'
    });
  });

  // =========================================================================
  // TS-F049-EST-001~008：buildStage1WhereConditions 純函式（複用月跑 Stage 1 演算法）
  //   驗證 estimateListCount 改為複用此演算法後的 where / params / skipReason / warnings
  // =========================================================================
  describe('buildStage1WhereConditions（試算複用之 Stage 1 演算法）', () => {
    function mockDef(overrides: Partial<ObListDefinition>): ObListDefinition {
      return {
        list_no: 'OB202605001',
        list_nm: '測試名單',
        prod_kind: null,
        caseyear: null,
        spec_tp: null,
        case_status: null,
        settle_src: null,
        condition_payload: null,
        ...overrides,
      } as unknown as ObListDefinition;
    }

    // ---- TS-F049-EST-001：路徑 A categorical 多值 → IN（regression：舊 = 比對） ----
    it('TS-F049-EST-001：路徑 A categorical 多值 → IN，非 = 單值比對', () => {
      const def = mockDef({
        condition_payload: {
          logic: 'AND',
          conditions: [
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
            { columnName: 'settle_src', fieldType: 'categorical', values: ['N'] },
          ],
        },
      });
      const f = buildStage1WhereConditions(def);

      expect(f.skipReason).toBeNull();
      expect(f.where).toContain('"prod_kind" IN (:...cat0)');
      expect(f.where).toContain('"settle_src" IN (:...cat1)');
      // params 各自獨立陣列，非 '01$$N' 整串
      const catVals = Object.values(f.params).flat();
      expect(catVals).toContain('01');
      expect(catVals).toContain('N');
      expect(catVals).not.toContain('01$$N');
      // regression：不得出現 prod_kind = : 單值比對
      expect(f.where).not.toMatch(/"prod_kind"\s*=\s*:/);
    });

    // ---- TS-F049-EST-002：caseyear → year_cnt 整數映射 ----
    it('TS-F049-EST-002：路徑 A caseyear → year_cnt 整數陣列（非 caseyear 西元年欄位）', () => {
      const def = mockDef({
        condition_payload: {
          logic: 'AND',
          conditions: [
            {
              columnName: 'caseyear',
              fieldType: 'categorical',
              values: ['0', '1', '2', '3', '4', '5'],
            },
          ],
        },
      });
      const f = buildStage1WhereConditions(def);

      expect(f.where).toContain('"year_cnt" IN (');
      expect(f.where).not.toContain('"caseyear" IN (');
      expect(f.where).not.toContain('ob_pool_data.caseyear');
      const vals = Object.values(f.params).flat();
      expect(vals).toEqual([0, 1, 2, 3, 4, 5]);
      for (const v of vals) expect(typeof v).toBe('number');
    });

    // ---- TS-F049-EST-003：case_status → list_type 映射 ----
    it('TS-F049-EST-003：路徑 A case_status → list_type（ob_pool_data 無 case_status 欄位）', () => {
      const def = mockDef({
        condition_payload: {
          logic: 'AND',
          conditions: [
            { columnName: 'case_status', fieldType: 'categorical', values: ['02'] },
          ],
        },
      });
      const f = buildStage1WhereConditions(def);

      expect(f.where).toContain('"list_type" IN (');
      expect(f.where).not.toContain('"case_status" IN (');
      expect(Object.values(f.params).flat()).toContain('02');
    });

    // ---- TS-F049-EST-004：caseyear='99' wildcard ----
    it('TS-F049-EST-004a：caseyear 唯一條件 99 wildcard → skipReason=EMPTY_CONDITIONS', () => {
      const def = mockDef({
        condition_payload: {
          logic: 'AND',
          conditions: [
            { columnName: 'caseyear', fieldType: 'categorical', values: ['99'] },
          ],
        },
      });
      const f = buildStage1WhereConditions(def);
      expect(f.skipReason).toBe('EMPTY_CONDITIONS');
      expect(f.where).toBeNull();
    });

    it('TS-F049-EST-004b：caseyear=99 與其他條件並存 → 跳過 year_cnt，其他生效', () => {
      const def = mockDef({
        condition_payload: {
          logic: 'AND',
          conditions: [
            { columnName: 'caseyear', fieldType: 'categorical', values: ['99'] },
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          ],
        },
      });
      const f = buildStage1WhereConditions(def);
      expect(f.skipReason).toBeNull();
      expect(f.where).not.toContain('year_cnt');
      expect(f.where).toContain('"prod_kind" IN (');
    });

    // ---- TS-F049-EST-005a/b：EMPTY_CONDITIONS（BR-5） ----
    it('TS-F049-EST-005a：conditions=[] → skipReason=EMPTY_CONDITIONS', () => {
      const f = buildStage1WhereConditions(
        mockDef({ condition_payload: { logic: 'AND', conditions: [] } }),
      );
      expect(f.skipReason).toBe('EMPTY_CONDITIONS');
      expect(f.where).toBeNull();
    });

    it('TS-F049-EST-005b：_backfill_empty=true → skipReason=EMPTY_CONDITIONS', () => {
      const f = buildStage1WhereConditions(
        mockDef({
          condition_payload: { logic: 'AND', conditions: [], _backfill_empty: true },
        }),
      );
      expect(f.skipReason).toBe('EMPTY_CONDITIONS');
      expect(f.where).toBeNull();
    });

    // ---- TS-F049-EST-006：numeric / date BETWEEN ----
    it('TS-F049-EST-006a：numeric → BETWEEN', () => {
      const f = buildStage1WhereConditions(
        mockDef({
          condition_payload: {
            logic: 'AND',
            conditions: [
              { columnName: 'month_cnt', fieldType: 'numeric', min: 12, max: 60 },
            ],
          },
        }),
      );
      expect(f.skipReason).toBeNull();
      expect(f.where).toContain('"month_cnt" BETWEEN :numMin0 AND :numMax0');
      expect(f.params.numMin0).toBe(12);
      expect(f.params.numMax0).toBe(60);
    });

    it('TS-F049-EST-006b：date → BETWEEN', () => {
      const f = buildStage1WhereConditions(
        mockDef({
          condition_payload: {
            logic: 'AND',
            conditions: [
              {
                columnName: 'appl_date',
                fieldType: 'date',
                dateStart: '2025-01-01',
                dateEnd: '2025-12-31',
              },
            ],
          },
        }),
      );
      expect(f.skipReason).toBeNull();
      expect(f.where).toContain('"appl_date" BETWEEN :dateStart0 AND :dateEnd0');
      expect(f.params.dateStart0).toBe('2025-01-01');
      expect(f.params.dateEnd0).toBe('2025-12-31');
    });

    it('TS-F049-EST-006c：numeric 缺 max → skip + warning，不 throw', () => {
      const f = buildStage1WhereConditions(
        mockDef({
          condition_payload: {
            logic: 'AND',
            conditions: [
              { columnName: 'month_cnt', fieldType: 'numeric', min: 12 } as never,
            ],
          },
        }),
      );
      expect(f.skipReason).toBe('EMPTY_CONDITIONS');
      expect(f.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'INCOMPLETE_NUMERIC_RANGE',
            columnName: 'month_cnt',
          }),
        ]),
      );
    });

    // ---- TS-F049-EST-007：路徑 B legacy fallback（純函式驗 where/params） ----
    it('TS-F049-EST-007a：路徑 B prod_kind="01$$N" → IN，split 後各自獨立，非 = 比對', () => {
      const f = buildStage1WhereConditions(
        mockDef({
          condition_payload: null,
          prod_kind: '01$$N',
          settle_src: 'Y',
        }),
      );
      expect(f.skipReason).toBeNull();
      expect(f.where).toContain('"prod_kind" IN (');
      expect(f.where).toContain('"settle_src" IN (');
      expect(f.where).not.toMatch(/"prod_kind"\s*=\s*:/);
      const vals = Object.values(f.params).flat();
      expect(vals).toContain('01');
      expect(vals).toContain('N');
      expect(vals).toContain('Y');
      expect(vals).not.toContain('01$$N');
    });

    it('TS-F049-EST-007b：路徑 B caseyear="0$$1$$2" → year_cnt 整數陣列', () => {
      const f = buildStage1WhereConditions(
        mockDef({ condition_payload: null, caseyear: '0$$1$$2' }),
      );
      expect(f.where).toContain('"year_cnt" IN (');
      expect(f.where).not.toContain('"caseyear" IN (');
      const vals = Object.values(f.params).flat();
      expect(vals).toEqual([0, 1, 2]);
      for (const v of vals) expect(typeof v).toBe('number');
    });

    it('TS-F049-EST-007c：路徑 B caseyear="99" wildcard → 跳過 year_cnt，prod_kind 生效', () => {
      const f = buildStage1WhereConditions(
        mockDef({ condition_payload: null, caseyear: '99', prod_kind: '01' }),
      );
      expect(f.where).not.toContain('year_cnt');
      expect(f.where).toContain('"prod_kind" IN (');
    });

    it('TS-F049-EST-007d：路徑 B 全欄位空 → skipReason=EMPTY_CONDITIONS', () => {
      const f = buildStage1WhereConditions(
        mockDef({
          condition_payload: null,
          prod_kind: '',
          caseyear: '',
          spec_tp: '',
          case_status: null,
          settle_src: null,
        }),
      );
      expect(f.skipReason).toBe('EMPTY_CONDITIONS');
      expect(f.where).toBeNull();
    });

    // ---- TS-F049-EST-008：SAFE_COLUMN_NAME_RE 防注入 ----
    it('TS-F049-EST-008：非法 columnName → skip + warning（不 throw），合法欄位仍生效', () => {
      const f = buildStage1WhereConditions(
        mockDef({
          condition_payload: {
            logic: 'AND',
            conditions: [
              {
                columnName: '"; DROP TABLE ob_pool_data; --',
                fieldType: 'categorical',
                values: ['01'],
              },
              { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
            ],
          },
        }),
      );
      expect(f.where).not.toContain('DROP TABLE');
      expect(f.where).toContain('"prod_kind" IN (');
      const invalid = f.warnings.filter((w) => w.code === 'INVALID_COLUMN_NAME');
      expect(invalid).toHaveLength(1);
    });
  });
});
