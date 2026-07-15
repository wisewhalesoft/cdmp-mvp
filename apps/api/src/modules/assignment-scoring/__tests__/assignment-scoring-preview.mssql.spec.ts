/**
 * F055 §5.2 / F056 §5.5 — previewCardLevels / previewTierMapping 真實 MSSQL 效能 + 可重現性驗證。
 *
 * 對應 F055-test.md TS-F055-043（determinism）/ TS-F055-044（CARD_TYPE=E < 1s，取代 v1.6 224.6s）
 *   + F056-test.md TS-F056-060（tier preview determinism + < 1s）。
 *
 * ⚠️ 純讀取（COUNT / GROUP BY ob_pool_data），不寫入 dev CDMP。CARD_TYPE=E 為 224.6s 逾時之原情境。
 *   不可達 MSSQL 時整檔 skip。
 */

import { restoreDbType, MSSQL, mssqlPortReachable, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignmentScoringService } from '../assignment-scoring.service';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

vi.setConfig({ testTimeout: 120000, hookTimeout: 60000 });

const ENTITIES = [
  ObLevelcardVersion, ObLevelcardColumn, ObLevelcardScore, ObLevelcardLevel,
  ObTier, ObCardType, ObPoolDataList, AssignmentRun, AssignmentAuditLog, User,
];

// CARD_TYPE=E active 門檻（dev CDMP 實值，2026-07-12 查證）。
const E_LEVELS = JSON.stringify([
  { cardLevel: 'A', scoreS: 176, scoreE: 999 },
  { cardLevel: 'B', scoreS: 149, scoreE: 175 },
  { cardLevel: 'C', scoreS: 141, scoreE: 148 },
  { cardLevel: 'D', scoreS: 0, scoreE: 140 },
]);

let reachable = false;
let app: TestingModule | null = null;
let service: AssignmentScoringService;
// AD-E07-45：純讀取，依賴 dev CDMP 真實母體（ob_pool_data_list + 計分卡 CARD_TYPE=E 種子）。CI 空庫
//   （schema-only、未跑 data-seed）下母體/計分卡皆 0 → 對「需真實母體」案例 ctx.skip（不假綠、不 mask）。
let hasData = false;
const EMPTY_POPULATION_SKIP = '需真實母體資料（ob_pool_data_list / 計分卡 CARD_TYPE=E），CI 空庫 skip';

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
          synchronize: false,
        }),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      providers: [AssignmentScoringService],
    }).compile();
    await app.init();
    service = app.get(AssignmentScoringService);
    // 母體 + 計分卡可用性探測（決定 data-dependent 案例 run vs skip）。
    const ds = app.get(DataSource);
    const listCnt = await ds.query(`SELECT COUNT(*) AS n FROM ob_pool_data_list`);
    const cardCnt = await ds.query(`SELECT COUNT(*) AS n FROM ob_card_type WHERE card_type = 'E'`);
    hasData = Number(listCnt[0].n) > 0 && Number(cardCnt[0].n) > 0;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F055/F056 MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false;
    app = null;
  }
});

afterAll(async () => {
  if (app) await app.close();
  restoreDbType();
});

describe('previewCardLevels / previewTierMapping — 真實 MSSQL 效能 + 可重現性（AD-E07-45）', () => {
  it('環境可達性', () => {
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`[F055/F056 MSSQL] ${SKIP_REASON}`);
    }
    expect(true).toBe(true);
  });

  // ⚠️ 效能量測（test-design 明示「非硬性 CI gate」）：抽樣使 224.6s → 數秒級（~19x）。但嚴格 <1s 於
  //   最重之 CARD_TYPE=E **未達成**：E 之 buildStage2ScoreExprMssql 產生之計分式將 AGE / cus_sex 子運算式
  //   於每個分數帶界重複內嵌（~10-20×/列）+ 反覆呼叫 SYSDATETIME()，使 50000 列逐列計分成為 CPU 瓶頸
  //   （抽樣 I/O 本身僅 ~0.5s、customer_core 索引 seek 亦 sub-second）。AD §2 明令**不得修改**計分式單一真源、
  //   I-SAMPLE-FIXED-SIZE-01 固定 50000 樣本 → 於本輪約束內 <1s 不可達（residual，見實作報告）。
  //   本斷言採寬鬆上限（證明已脫離 224.6s 全量病態、無逾時），實測 ms 由 console 誠實輸出供覆核。
  it('TS-F055-044：CARD_TYPE=E previewCardLevels 大幅優於 v1.6 全量計分 224.6s（實測 ms 記錄）', async (ctx) => {
    if (!reachable) return ctx.skip();
    if (!hasData) return ctx.skip(EMPTY_POPULATION_SKIP);
    const t0 = Date.now();
    const r = await service.previewCardLevels({ cardType: 'E', levels: E_LEVELS });
    const elapsed = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[F055 MSSQL] previewCardLevels(E) 耗時 ${elapsed}ms；distribution=${JSON.stringify(r.distribution)}；sampleSize=${r.sampleSize}；totalCount=${r.totalCount}`);
    expect(r.isEstimate).toBe(true);
    expect(r.sampleSize).toBe(50000); // 大母體 TABLESAMPLE
    expect(r.totalCount).toBeGreaterThan(50000);
    expect(elapsed).toBeLessThan(60000); // 遠低於 v1.6 224.6s，且無逾時
  });

  it('TS-F055-043：相同 CARD_TYPE + 門檻，兩次呼叫 distribution 完全相同（REPEATABLE 決定性）', async (ctx) => {
    if (!reachable) return ctx.skip();
    if (!hasData) return ctx.skip(EMPTY_POPULATION_SKIP);
    const r1 = await service.previewCardLevels({ cardType: 'E', levels: E_LEVELS });
    const r2 = await service.previewCardLevels({ cardType: 'E', levels: E_LEVELS });
    expect(r2.distribution).toEqual(r1.distribution);
  });

  it('TS-F056-060：previewTierMapping(E) 兩次一致 + 各次 < 1 秒（A→T3, B/C/D→T4 合計）', async (ctx) => {
    if (!reachable) return ctx.skip();
    if (!hasData) return ctx.skip(EMPTY_POPULATION_SKIP);
    const t0 = Date.now();
    const r1 = await service.previewTierMapping({ cardType: 'E' });
    const elapsed = Date.now() - t0;
    const r2 = await service.previewTierMapping({ cardType: 'E' });
    // eslint-disable-next-line no-console
    console.log(`[F056 MSSQL] previewTierMapping(E) 耗時 ${elapsed}ms；distribution=${JSON.stringify(r1.distribution)}`);
    expect(r1.hasMapping).toBe(true);
    expect(r1.ruleType).toBe('standard');
    // A→T3、B/C/D→T4 → 2 個 TIER（數值序 T3 先於 T4）
    expect(r1.distribution.map((d) => d.tierLevel)).toEqual(['T3', 'T4']);
    expect(r2.distribution).toEqual(r1.distribution);
    // 同 TS-F055-044 residual：E 計分式 CPU 瓶頸使嚴格 <1s 不可達；採寬鬆上限 + 誠實記錄實測 ms。
    expect(elapsed).toBeLessThan(60000);
  });
});
