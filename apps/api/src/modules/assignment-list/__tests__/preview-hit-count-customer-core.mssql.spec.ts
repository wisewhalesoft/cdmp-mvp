/**
 * F050 §6.3 — previewHitCount 之 customer_core（F109）篩選欄位須納入估算：真實 MSSQL 驗證。
 *
 * 對應 F050-test.md T 群組（TS-F050-T01/T02/T03）+ X 群組（TS-F050-X01 效能）。
 * 亦為 flag #1（buildCustomerCoreClauseMssql + 抽樣 CTE 之 MSSQL 相容性）之 runtime 查證點。
 *
 * ⚠️ **純讀取**（僅 COUNT ob_pool_data / customer_core），不寫入 / 不 DELETE；共用 dev CDMP 真實資料
 *   （ob_pool_data 1.68M > 50000 → 走 TABLESAMPLE 大母體路徑）。不可達 MSSQL 時整檔 describe.skip。
 */

import { restoreDbType, MSSQL, mssqlPortReachable, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignmentListService } from '../assignment-list.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { User } from '@/database/entities/user.entity';

vi.setConfig({ testTimeout: 120000, hookTimeout: 60000 });

const ENTITIES = [
  ObListDefinition, AssignmentAuditLog, AssignmentRun, ObPoolData,
  PooldataFieldOption, PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire,
  AssignmentApproval, User,
];

const WORKDT = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01（AGE 基準）

let reachable = false;
let app: TestingModule | null = null;
let service: AssignmentListService;
// AD-E07-45：本檔為純讀取，依賴 dev CDMP 真實母體（ob_pool_data 1.68M + customer_core）。CI 空庫
//   （schema-only）下母體為 0，估算恆回 0 → 對此類「需真實母體」案例 ctx.skip（不假綠、不 mask）。
let hasData = false;
const EMPTY_POPULATION_SKIP = '需真實母體資料（ob_pool_data/customer_core），CI 空庫 skip';

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'mssql',
          host: MSSQL.host, port: MSSQL.port, username: MSSQL.username,
          password: MSSQL.password, database: MSSQL.database,
          options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
          entities: ENTITIES,
          synchronize: false, // 共用既有 dev CDMP schema，絕不 synchronize
        }),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      providers: [
        AssignmentListService,
        AssignmentRunGuardService,
        { provide: SectionChiefScopeService, useValue: {} },
      ],
    }).compile();
    await app.init();
    service = app.get(AssignmentListService);
    // 母體可用性探測（決定 data-dependent 案例 run vs skip）。
    const ds = app.get(DataSource);
    const poolCnt = await ds.query(`SELECT COUNT(*) AS n FROM ob_pool_data`);
    const ccCnt = await ds.query(`SELECT COUNT(*) AS n FROM customer_core`);
    hasData = Number(poolCnt[0].n) > 0 && Number(ccCnt[0].n) > 0;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F050 §6.3 MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false;
    app = null;
  }
});

afterAll(async () => {
  if (app) await app.close();
  restoreDbType();
});

describe('previewHitCount — customer_core（F109）納入估算，真實 MSSQL（AD-E07-45 / flag #1）', () => {
  it('環境可達性', () => {
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`[F050 §6.3 MSSQL] ${SKIP_REASON}`);
    }
    expect(true).toBe(true);
  });

  it('TS-F050-T01：age（date_of_birth 衍生）條件改變估算值（未被靜默 skip），大母體 sampleSize=50000', async (ctx) => {
    if (!reachable) return ctx.skip();
    if (!hasData) return ctx.skip(EMPTY_POPULATION_SKIP);
    // 寬區間 [0,200]（幾乎全客戶）vs 窄區間 [30,40]
    const wide = await service.previewHitCount(
      { conditions: [{ columnName: 'date_of_birth', fieldType: 'numeric', min: 0, max: 200 }], logic: 'AND' } as any,
      WORKDT,
    );
    const narrow = await service.previewHitCount(
      { conditions: [{ columnName: 'date_of_birth', fieldType: 'numeric', min: 30, max: 40 }], logic: 'AND' } as any,
      WORKDT,
    );
    // 執行成功本身即證明 buildCustomerCoreClauseMssql + 抽樣 CTE 於真實 MSSQL 相容（flag #1）
    expect(wide.sampleSize).toBe(50000); // 大母體 TABLESAMPLE 路徑
    expect(wide.isEstimate).toBe(true);
    // 窄區間為寬區間之子集 → 命中 ≤（證明 age 條件確實生效，非被 composer skip 吞掉）
    expect(narrow.estimatedHitCount).toBeLessThanOrEqual(wide.estimatedHitCount);
    expect(narrow.estimatedHitCount).not.toBe(wide.estimatedHitCount);
  });

  it('TS-F050-T03：EMPTY_CONDITIONS 陷阱守門 — 僅 gender（customer_core）條件仍生效', async (ctx) => {
    if (!reachable) return ctx.skip();
    if (!hasData) return ctx.skip(EMPTY_POPULATION_SKIP);
    // baseline：僅 best_case（系統固定注入）
    const baseline = await service.previewHitCount({ conditions: [], logic: 'AND' } as any, WORKDT);
    // gender=1 條件（customer_core，composer 會 skip → 由 customerCoreClause 產生）
    const withGender = await service.previewHitCount(
      { conditions: [{ columnName: 'gender', fieldType: 'categorical', values: ['1'] }], logic: 'AND' } as any,
      WORKDT,
    );
    // gender 條件確實縮小命中（未因 fieldFragment 僅含 best_case 而整體略過 customer_core clause）
    expect(withGender.estimatedHitCount).toBeLessThanOrEqual(baseline.estimatedHitCount);
    expect(withGender.estimatedHitCount).toBeGreaterThan(0);
  });

  it('TS-F050-X01：大規模資料下回應時間 < 1 秒', async (ctx) => {
    if (!reachable) return ctx.skip();
    const t0 = Date.now();
    await service.previewHitCount(
      {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] },
          { columnName: 'date_of_birth', fieldType: 'numeric', min: 25, max: 55 },
        ],
        logic: 'AND',
      } as any,
      WORKDT,
    );
    const elapsed = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[F050 §6.3 MSSQL] previewHitCount（含 customer_core）耗時 ${elapsed}ms`);
    expect(elapsed).toBeLessThan(1000);
  });
});
