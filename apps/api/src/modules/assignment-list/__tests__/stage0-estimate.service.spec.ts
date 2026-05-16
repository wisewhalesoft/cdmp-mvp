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
    it('AC-4：對 active LIST_NO 套用 prod_kind / caseyear / settle_src 篩選後 COUNT', async () => {
      await seedActiveList(env.listRepo, 'OB202605001', {
        prod_kind: 'A',
        caseyear: '113',
        settle_src: '01',
      });

      // 3 筆符合（prod_kind = A），1 筆不符合
      const samples = [
        { appl: '0000000001', settle: '01' },
        { appl: '0000000002', settle: '01' },
        { appl: '0000000003', settle: '01' },
        { appl: '0000000004', settle: '99' }, // settle_src 不符
      ];
      for (const s of samples) {
        await env.poolRepo.save(
          env.poolRepo.create({
            orgno: '01',
            appl_no: s.appl,
            custo_no: 'C' + s.appl,
            sta_code: '01',
            dept_id: 'D01',
            list_type: '01',
            settle_src: s.settle,
            prod_kind: 'A',
            caseyear: '113',
            _cdmp_extracted_at: new Date(),
          } as Partial<ObPoolData>),
        );
      }

      const res = await env.service.estimateListCount('OB202605001');
      expect(res.listNo).toBe('OB202605001');
      expect(res.count).toBe(3);
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
  });
});
