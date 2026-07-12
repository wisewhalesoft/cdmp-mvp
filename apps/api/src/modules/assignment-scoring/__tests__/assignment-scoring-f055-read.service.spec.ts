/**
 * F055：AssignmentScoringService — getCardLevels / previewCardLevels Unit Tests
 *
 *   GET /card-levels (§5.1.1)
 *     - TS-F055-001：H 4 級回傳 4 筆，依 score_s 降冪
 *     - TS-F055-002：S5 2 級回傳 2 筆（不硬編碼 4 級）
 *     - cardVersion 未傳 → 取 active 版本
 *     - 無 active 版本 → 404 SCORING_VERSION_NOT_FOUND
 *
 *   GET /card-levels/preview (§5.2 / AC-3 / v1.7 US-174 / AD-E07-45)
 *     ── v1.7 抽樣估算：preview 改為「ob_pool_data 固定樣本套用 active 計分設定即時計分 → 依門檻分桶
 *        → 放大推算至母體」，取代 v1.6 全表即時計分 + 60s 快取（快取已移除）。
 *     ── 抽樣核心 sampling-estimator 之常數 / scaleEstimate / buildPoolDataSampleFrom 唯一測試位於
 *        sampling-estimator.spec.ts；本檔僅驗 previewCardLevels 消費端整合（契約 / 小母體 / 分桶 /
 *        方言 SQL shape / 死欄回歸 / 讀鎖豁免 / 快取移除守門）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
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

/**
 * 模擬 TypeORM driver 之 escapeQueryWithParameters（命名參數 :name → positional $n），
 * 貼近 Postgres 驅動行為：`::int` 之類的 cast（`:int` 非參數）原樣保留。
 */
function makeDriverEscape() {
  return vi.fn((sql: string, params: Record<string, unknown>) => {
    const values: unknown[] = [];
    const escaped = sql.replace(/:([A-Za-z0-9_]+)/g, (m, name) => {
      if (Object.prototype.hasOwnProperty.call(params, name)) {
        values.push(params[name]);
        return `$${values.length}`;
      }
      return m;
    });
    return [escaped, values] as [string, unknown[]];
  });
}

describe('AssignmentScoringService — F055 getCardLevels + previewCardLevels', () => {
  let service: AssignmentScoringService;
  let versionRepo: any;
  let columnRepo: any;
  let scoreRepo: any;
  let levelRepo: any;
  let tierRepo: any;
  let poolDataListRepo: any;
  let runRepo: any;
  let auditRepo: any;
  let userRepo: any;

  /**
   * 抽樣估算需兩支查詢：getPoolDataTotalCount（`SELECT COUNT(*) AS cnt FROM ob_pool_data`，無 GROUP BY）
   * + histogram（`... GROUP BY s.score`）。以 GROUP BY 存在與否 dispatch。
   */
  function setPoolData(totalCount: number, histogram: any[]) {
    poolDataListRepo.query.mockImplementation(async (sql: string) => {
      if (/GROUP BY/i.test(sql)) return histogram;
      return [{ cnt: totalCount }];
    });
  }

  /** 取 histogram 查詢（含 GROUP BY）之 SQL 字串（非 COUNT 查詢）。 */
  function histogramSql(): string {
    const call = poolDataListRepo.query.mock.calls.find((c: any[]) =>
      /GROUP BY/i.test(c[0]),
    );
    return call ? (call[0] as string) : '';
  }

  /** histogram 查詢被呼叫次數（排除 COUNT 查詢）。 */
  function histogramCallCount(): number {
    return poolDataListRepo.query.mock.calls.filter((c: any[]) =>
      /GROUP BY/i.test(c[0]),
    ).length;
  }

  beforeEach(async () => {
    versionRepo = { findOne: vi.fn() };
    columnRepo = { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() };
    scoreRepo = { find: vi.fn().mockResolvedValue([]) };
    levelRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn() };
    tierRepo = { find: vi.fn() };
    poolDataListRepo = {
      find: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue([{ cnt: 100 }]),
      manager: {
        connection: { driver: { escapeQueryWithParameters: makeDriverEscape() } },
      },
    };
    // 預設小母體（100 筆）+ 空 histogram
    setPoolData(100, []);
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    auditRepo = { create: vi.fn(), save: vi.fn() };
    userRepo = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        { provide: getRepositoryToken(ObCardType), useValue: {
          findOne: vi.fn().mockImplementation(({ where }: any) =>
            Promise.resolve({
              card_type: where.card_type,
              card_name: 'mock',
              prod_kind: '01',
              status: 'active',
            }),
          ),
        } },
        { provide: getRepositoryToken(ObPoolDataList), useValue: poolDataListRepo },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  // active 計分版本（供 preview 解析 buildStage2ScoreExpr 用；不影響 getCardLevels）。
  function mockActiveVersion(cardType = 'H', cardVersion = 1) {
    versionRepo.findOne.mockResolvedValue({
      card_type: cardType,
      card_version: cardVersion,
      status: 'active',
    });
  }

  // ===== GET /card-levels =====

  it('TS-F055-001：H 4 級回傳 4 筆，依 score_s 降冪', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    levelRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, card_level: 'D', score_s: 0, score_e: 184 },
      { card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999 },
      { card_type: 'H', card_version: 1, card_level: 'C', score_s: 185, score_e: 213 },
      { card_type: 'H', card_version: 1, card_level: 'B', score_s: 214, score_e: 242 },
    ]);

    const result = await service.getCardLevels({ cardType: 'H' });

    expect(result.cardType).toBe('H');
    expect(result.cardVersion).toBe(1);
    expect(result.levels).toHaveLength(4);
    expect(result.levels.map((l: any) => l.cardLevel)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.levels[0]).toMatchObject({ cardLevel: 'A', scoreS: 243, scoreE: 999 });
  });

  it('TS-F055-002：S5 2 級回傳 2 筆（不硬編碼 4 級）', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'S5', card_version: 1, status: 'active',
    });
    levelRepo.find.mockResolvedValue([
      { card_type: 'S5', card_version: 1, card_level: 'A', score_s: 200, score_e: 999 },
      { card_type: 'S5', card_version: 1, card_level: 'B', score_s: 0, score_e: 199 },
    ]);

    const result = await service.getCardLevels({ cardType: 'S5' });
    expect(result.levels).toHaveLength(2);
    expect(result.levels.map((l: any) => l.cardLevel)).toEqual(['A', 'B']);
  });

  it('cardVersion 未傳 → 取 active 版本（findOne where status=active）', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    levelRepo.find.mockResolvedValue([]);

    await service.getCardLevels({ cardType: 'H' });

    const findArgs = versionRepo.findOne.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({ card_type: 'H', status: 'active' });
  });

  it('cardVersion 顯式傳入 → 用該版本查（不必要求 active）', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 2, status: 'inactive',
    });
    levelRepo.find.mockResolvedValue([]);

    await service.getCardLevels({ cardType: 'H', cardVersion: 2 });

    const findArgs = versionRepo.findOne.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({ card_type: 'H', card_version: 2 });
    expect(findArgs.where.status).toBeUndefined();
  });

  it('無 active 版本 → 404 SCORING_VERSION_NOT_FOUND', async () => {
    versionRepo.findOne.mockResolvedValue(null);

    try {
      await service.getCardLevels({ cardType: 'H' });
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('SCORING_VERSION_NOT_FOUND');
    }
  });

  // ===== GET /card-levels/preview（v1.7 抽樣估算）=====

  it('TS-F055-013：preview distribution 依 histogram in-memory 分桶、加總正確、含全部請求等級', async () => {
    mockActiveVersion('H', 1);
    // 小母體（totalCount=100，全部落桶）→ scaleEstimate 為恆等，distribution == 原始分桶。
    setPoolData(100, [
      { score: 250, cnt: 20 },
      { score: 220, cnt: 40 },
      { score: 200, cnt: 30 },
      { score: 100, cnt: 10 },
    ]);

    const levels = JSON.stringify([
      { cardLevel: 'A', scoreS: 243, scoreE: 999 },
      { cardLevel: 'B', scoreS: 214, scoreE: 242 },
      { cardLevel: 'C', scoreS: 185, scoreE: 213 },
      { cardLevel: 'D', scoreS: 0, scoreE: 184 },
    ]);

    const result = await service.previewCardLevels({ cardType: 'H', levels });

    expect(result.distribution).toEqual({ A: 20, B: 40, C: 30, D: 10 });
    const total = Object.values(result.distribution).reduce((a: number, b: any) => a + b, 0);
    expect(total).toBe(100);
    // histogram 僅掃一次
    expect(histogramCallCount()).toBe(1);
  });

  it('TS-F055-040：preview 回應新增 isEstimate / sampleSize / totalCount 契約', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, [{ score: 500, cnt: 5 }]);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });
    expect(result.isEstimate).toBe(true);
    expect(typeof result.sampleSize).toBe('number');
    expect(typeof result.totalCount).toBe('number');
    expect(result.totalCount).toBe(100);
  });

  it('TS-F055-041：小母體 fallback — isEstimate=true 但 sampleSize===totalCount（精確值）', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, [{ score: 500, cnt: 5 }]);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });
    expect(result.sampleSize).toBe(100);
    expect(result.totalCount).toBe(100);
    expect(result.isEstimate).toBe(true);
  });

  it('TS-F055-042：distribution 為 scaleEstimate 放大推算值，小母體下等同精確全量', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, [
      { score: 250, cnt: 20 },
      { score: 220, cnt: 40 },
      { score: 200, cnt: 30 },
      { score: 100, cnt: 10 },
    ]);
    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([
        { cardLevel: 'A', scoreS: 243, scoreE: 999 },
        { cardLevel: 'B', scoreS: 214, scoreE: 242 },
        { cardLevel: 'C', scoreS: 185, scoreE: 213 },
        { cardLevel: 'D', scoreS: 0, scoreE: 184 },
      ]),
    });
    expect(result.distribution).toEqual({ A: 20, B: 40, C: 30, D: 10 });
  });

  it('TS-F055-046：totalCount 絕不快取（第二次查詢反映新增之筆數）', async () => {
    mockActiveVersion('H', 1);
    const levels = JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]);

    setPoolData(100, [{ score: 500, cnt: 3 }]);
    const r1 = await service.previewCardLevels({ cardType: 'H', levels });
    expect(r1.totalCount).toBe(100);

    setPoolData(101, [{ score: 500, cnt: 3 }]);
    const r2 = await service.previewCardLevels({ cardType: 'H', levels });
    expect(r2.totalCount).toBe(101); // 即時反映，無 60s 快取延遲
  });

  it('AD-E07-45 v1.2：response 含 histogram: [{score,count}]（分桶前原始 histogram，cnt→count）', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, [
      { score: 250, cnt: 20 },
      { score: 220, cnt: 40 },
      { score: 200, cnt: 30 },
      { score: 100, cnt: 10 },
    ]);
    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });
    expect(Array.isArray(result.histogram)).toBe(true);
    // 逐項為 {score:number, count:number}
    for (const h of result.histogram) {
      expect(typeof h.score).toBe('number');
      expect(typeof h.count).toBe('number');
    }
    // 與注入之 histogram 一致（cnt 映射為 count）
    expect(result.histogram).toEqual([
      { score: 250, count: 20 },
      { score: 220, count: 40 },
      { score: 200, count: 30 },
      { score: 100, count: 10 },
    ]);
  });

  it('AD-E07-45 v1.2：client 端以 level bands 分桶 histogram + scaleEstimate 可精確重現 distribution（server/client 一致）', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, [
      { score: 250, cnt: 20 }, // A
      { score: 220, cnt: 40 }, // B
      { score: 200, cnt: 30 }, // C
      { score: 100, cnt: 10 }, // D
    ]);
    const levels = [
      { cardLevel: 'A', scoreS: 243, scoreE: 999 },
      { cardLevel: 'B', scoreS: 214, scoreE: 242 },
      { cardLevel: 'C', scoreS: 185, scoreE: 213 },
      { cardLevel: 'D', scoreS: 0, scoreE: 184 },
    ];
    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify(levels),
    });

    // 前端邏輯複刻：first-match-wins 分桶 histogram → scaleEstimate（與 server 逐字相同公式）。
    const bucket: Record<string, number> = {};
    for (const l of levels) bucket[l.cardLevel] = 0;
    for (const h of result.histogram) {
      for (const l of levels) {
        if (h.score >= l.scoreS && h.score <= l.scoreE) {
          bucket[l.cardLevel] += h.count;
          break;
        }
      }
    }
    const reproduced: Record<string, number> = {};
    for (const l of levels) {
      reproduced[l.cardLevel] =
        result.sampleSize <= 0
          ? 0
          : Math.round((bucket[l.cardLevel] / result.sampleSize) * result.totalCount);
    }
    // 逐等級精確重現 server 之 distribution（一般情境亦成立，非僅小母體）
    expect(reproduced).toEqual(result.distribution);
  });

  it('TS-F055-014：URL-encoded levels 範例字串能正確解析', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, [{ score: 500, cnt: 1 }]);

    const encoded =
      '%5B%7B%22cardLevel%22%3A%22A%22%2C%22scoreS%22%3A243%2C%22scoreE%22%3A999%7D%5D';
    const decoded = decodeURIComponent(encoded);

    const result = await service.previewCardLevels({ cardType: 'H', levels: decoded });
    expect(result.distribution).toEqual({ A: 1 });
  });

  it('BE-F055-003：無命中列時 distribution 各等級=0（含全部請求等級）', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, []); // histogram 空

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([
        { cardLevel: 'A', scoreS: 243, scoreE: 999 },
        { cardLevel: 'B', scoreS: 0, scoreE: 242 },
      ]),
    });
    expect(result.distribution).toEqual({ A: 0, B: 0 });
  });

  it('無 active 計分版本 → distribution 全零且不掃 histogram（優雅降級，仍回估算 metadata）', async () => {
    versionRepo.findOne.mockResolvedValue(null);
    setPoolData(100, []);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([
        { cardLevel: 'A', scoreS: 243, scoreE: 999 },
        { cardLevel: 'B', scoreS: 0, scoreE: 242 },
      ]),
    });

    expect(result.distribution).toEqual({ A: 0, B: 0 });
    expect(result.isEstimate).toBe(true);
    expect(result.totalCount).toBe(100);
    expect(histogramCallCount()).toBe(0); // 不掃 histogram
    expect(poolDataListRepo.find).not.toHaveBeenCalled();
  });

  it('levels JSON 解析失敗 → 422 VALIDATION_ERROR', async () => {
    await expect(
      service.previewCardLevels({ cardType: 'H', levels: 'not-a-json' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('levels 為空陣列 → distribution 空物件、不掃 histogram（仍回 metadata）', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, []);
    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([]),
    });
    expect(result.distribution).toEqual({});
    expect(result.totalCount).toBe(100);
    expect(histogramCallCount()).toBe(0);
  });

  it('TS-F055-053：assignment_run running 時 GET preview 仍回 200（讀鎖豁免，不回 409）', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });
    mockActiveVersion('H', 1);
    setPoolData(100, []);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });
    expect(result.distribution).toEqual({ A: 0 });
    expect(result.isEstimate).toBe(true);
  });

  it('TS-F055-054：assignment_run pending 時 GET preview 仍回 200（讀鎖豁免）', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'pending' });
    mockActiveVersion('H', 1);
    setPoolData(100, []);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });
    expect(result.distribution).toEqual({ A: 0 });
  });

  // ===== F094 死欄 + OOM 回歸守門 =====

  it('REG-F094：preview SQL 讀 ob_pool_data histogram（GROUP BY s.score），不得讀死欄來源 ob_pool_data_list', async () => {
    mockActiveVersion('H', 1);
    setPoolData(100, [{ score: 500, cnt: 3 }]);

    await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });

    const sql = histogramSql();
    expect(sql).toContain('ob_pool_data ');
    expect(sql).toMatch(/CROSS JOIN LATERAL/i);
    expect(sql).toMatch(/GROUP BY s\.score/i);
    expect(sql).not.toMatch(/:lvl_/);
    expect(sql).not.toContain('ob_pool_data_list');
    expect(columnRepo.find).toHaveBeenCalled();
    const colWhere = columnRepo.find.mock.calls[0][0].where;
    expect(colWhere).toMatchObject({ card_type: 'H', card_version: 1, status: 'active' });
    expect(scoreRepo.find).toHaveBeenCalled();
  });

  it('REG-OOM：preview 不得 find() 全表載入 Node，須以 query() 下推 SQL 聚合', async () => {
    mockActiveVersion('H', 1);
    poolDataListRepo.find = vi.fn().mockResolvedValue([]);
    setPoolData(100, [{ score: 500, cnt: 1 }]);

    await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });

    expect(poolDataListRepo.find).not.toHaveBeenCalled();
    expect(histogramCallCount()).toBe(1);
  });

  it('GAP1-MSSQL：連線方言為 mssql → SQL 走 CROSS APPLY + CAST(... AS INT) + COUNT(*)，無 LATERAL / ::int', async () => {
    mockActiveVersion('H', 1);
    poolDataListRepo.manager.connection.options = { type: 'mssql' };
    poolDataListRepo.manager.query = vi.fn().mockResolvedValue([{ name: 'loan_rate' }]);
    setPoolData(100, [{ score: 500, cnt: 5 }]);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });

    expect(result.distribution).toEqual({ A: 5 });

    const sql = histogramSql();
    expect(sql).toMatch(/CROSS APPLY/i);
    expect(sql).toContain('AS INT)');
    expect(sql).not.toMatch(/LATERAL/i);
    expect(sql).not.toContain('::int');
    expect(sql).toContain('ob_pool_data ');
    expect(sql).not.toContain('ob_pool_data_list');
    expect(sql).toMatch(/GROUP BY s\.score/i);
  });

  it('BR-1 in-memory 分桶：first-match-wins（區間重疊時取第一命中）+ inclusive 兩端邊界', async () => {
    mockActiveVersion('H', 1);
    setPoolData(1000, [
      { score: 100, cnt: 1 },
      { score: 200, cnt: 2 },
      { score: 300, cnt: 4 },
      { score: 301, cnt: 8 },
      { score: 400, cnt: 16 },
    ]);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([
        { cardLevel: 'X', scoreS: 100, scoreE: 300 },
        { cardLevel: 'Y', scoreS: 200, scoreE: 400 },
      ]),
    });

    // 小母體 fallback（totalCount=1000, sample=1000）→ scaleEstimate 恆等：X=1+2+4=7；Y=8+16=24
    expect(result.distribution).toEqual({ X: 7, Y: 24 });
  });

  // ===== TS-F055-045：BR-2 快取移除迴歸守門（fs + regex，非概念性 Grep）=====

  it('TS-F055-045：cardLevelHistogramCache / CARD_LEVEL_HISTOGRAM_TTL_MS 已完全移除', () => {
    const src = readFileSync(
      join(__dirname, '..', 'assignment-scoring.service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/cardLevelHistogramCache/);
    expect(src).not.toMatch(/CARD_LEVEL_HISTOGRAM_TTL_MS/);
  });
});
