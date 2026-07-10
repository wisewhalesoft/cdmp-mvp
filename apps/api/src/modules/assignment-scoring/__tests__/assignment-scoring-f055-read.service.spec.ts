/**
 * F055：AssignmentScoringService — getCardLevels / previewCardLevels Unit Tests
 *
 *   GET /card-levels (§5.1.1)
 *     - TS-F055-001：H 4 級回傳 4 筆，依 score_s 降冪
 *     - TS-F055-002：S5 2 級回傳 2 筆（不硬編碼 4 級）
 *     - cardVersion 未傳 → 取 active 版本
 *     - 無 active 版本 → 404 SCORING_VERSION_NOT_FOUND
 *
 *   GET /card-levels/preview (§5.2 / AC-3 / BR-2)
 *     ── F094 死欄修正：preview 不再讀 `ob_pool_data_list.score`（自 F094 起恆 NULL），改為
 *        「重用月跑 Stage 2 計分下推（buildStage2ScoreExpr），對每列 ob_pool_data 以該 cardType
 *        active version 即時算分」。
 *     ── BR-2 快取（本次）：SQL 改回傳「分數 histogram」（每列＝相異 score 及其列數，level 無關，
 *        `GROUP BY s.score`），分桶改在記憶體（first-match-wins / inclusive / NULL 於 WHERE 排除）。
 *        histogram 以 `${cardType}:${cardVersion}` 為鍵、TTL 60s 快取；改門檻於 TTL 內即時重分桶、不重掃。
 *     - TS-F055-013：distribution 依 histogram in-memory 分桶、加總正確、含全部請求等級
 *     - TS-F055-014：URL-encoded levels JSON 正確解析
 *     - BE-F055-003：無命中列時 distribution 各等級=0
 *     - 無 active 計分版本 → distribution 全零且不下 SQL（優雅降級）
 *     - levels JSON 解析失敗 → 422 VALIDATION_ERROR
 *     - REG-F094：SQL 須讀 `ob_pool_data`（活表）histogram（GROUP BY s.score），不得讀死欄 `ob_pool_data_list`
 *     - REG-OOM：不得 find() 全表載入 Node，須以 query() 下推 SQL 聚合
 *     - BR-2 cache：同鍵不同 levels 於 TTL 內只掃一次；first-match/inclusive 分桶正確；逾 TTL 重掃
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
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
 * 貼近 Postgres 驅動行為：`::int` 之類的 cast（`:int` 非參數）原樣保留。修正後
 * previewCardLevels 以 `poolDataListRepo.manager.connection.driver.escapeQueryWithParameters`
 * 轉譯 buildStage2ScoreExpr 的 :sc_* 與分桶 :lvl_* 命名參數（與 stage2to4-sql-executor 同機制）。
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

  beforeEach(async () => {
    versionRepo = { findOne: vi.fn() };
    // preview 走 buildStage2ScoreExpr：需 columnRepo.find / scoreRepo.find（預設空 → scoreExpr='0'）
    columnRepo = { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() };
    scoreRepo = { find: vi.fn().mockResolvedValue([]) };
    levelRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn() };
    tierRepo = { find: vi.fn() };
    // 修正後 previewCardLevels 改用 query()（SQL 分桶下推）+ driver escape；find() 保留給其他方法。
    poolDataListRepo = {
      find: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue([]),
      manager: {
        connection: { driver: { escapeQueryWithParameters: makeDriverEscape() } },
      },
    };
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
        // Iter 4 v1.4：F055 cardType 範圍鎖；happy-path TC 預設 cardType active
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
    // score_s 降冪：A(243) → B(214) → C(185) → D(0)
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
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      status: 'active',
    });
  });

  it('cardVersion 顯式傳入 → 用該版本查（不必要求 active）', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 2, status: 'inactive',
    });
    levelRepo.find.mockResolvedValue([]);

    await service.getCardLevels({ cardType: 'H', cardVersion: 2 });

    const findArgs = versionRepo.findOne.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      card_version: 2,
    });
    // 顯式 cardVersion 時不限定 status
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

  // ===== GET /card-levels/preview =====

  it('TS-F055-013：preview distribution 依 histogram in-memory 分桶、加總正確、含全部請求等級', async () => {
    mockActiveVersion('H', 1);
    // SQL 端回傳的是「分數 histogram」（level 無關，每列＝一相異 score 及其列數），
    // 分桶改在記憶體進行：A(243-999)←250:20 / B(214-242)←220:40 / C(185-213)←200:30 / D(0-184)←100:10。
    poolDataListRepo.query.mockResolvedValue([
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
    const total = Object.values(result.distribution).reduce(
      (a: number, b: any) => a + b,
      0,
    );
    expect(total).toBe(100);
    // 單一 histogram 聚合、僅一次 query
    expect(poolDataListRepo.query).toHaveBeenCalledTimes(1);
  });

  it('TS-F055-014：URL-encoded levels 範例字串能正確解析', async () => {
    mockActiveVersion('H', 1);
    // histogram：score 500 落入 A(243-999)。
    poolDataListRepo.query.mockResolvedValue([{ score: 500, cnt: 1 }]);

    // spec 5.2 範例：levels=%5B%7B%22cardLevel%22%3A%22A%22%2C%22scoreS%22%3A243%2C%22scoreE%22%3A999%7D%5D
    const encoded =
      '%5B%7B%22cardLevel%22%3A%22A%22%2C%22scoreS%22%3A243%2C%22scoreE%22%3A999%7D%5D';
    const decoded = decodeURIComponent(encoded);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: decoded,
    });
    // 僅 A 級請求；SQL 回 A=1 → distribution.A=1
    expect(result.distribution).toEqual({ A: 1 });
  });

  it('BE-F055-003：無命中列時 distribution 各等級=0（含全部請求等級）', async () => {
    mockActiveVersion('H', 1);
    poolDataListRepo.query.mockResolvedValue([]); // SQL 無任何命中列

    const levels = JSON.stringify([
      { cardLevel: 'A', scoreS: 243, scoreE: 999 },
      { cardLevel: 'B', scoreS: 0, scoreE: 242 },
    ]);

    const result = await service.previewCardLevels({ cardType: 'H', levels });
    expect(result.distribution).toEqual({ A: 0, B: 0 });
  });

  it('無 active 計分版本 → distribution 全零且不下 SQL（優雅降級）', async () => {
    versionRepo.findOne.mockResolvedValue(null);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([
        { cardLevel: 'A', scoreS: 243, scoreE: 999 },
        { cardLevel: 'B', scoreS: 0, scoreE: 242 },
      ]),
    });

    expect(result.distribution).toEqual({ A: 0, B: 0 });
    expect(poolDataListRepo.query).not.toHaveBeenCalled();
    expect(poolDataListRepo.find).not.toHaveBeenCalled();
  });

  it('levels JSON 解析失敗 → 422 VALIDATION_ERROR', async () => {
    await expect(
      service.previewCardLevels({ cardType: 'H', levels: 'not-a-json' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('levels 為空陣列 → distribution 空物件、不下 SQL', async () => {
    mockActiveVersion('H', 1);
    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([]),
    });
    expect(result.distribution).toEqual({});
    expect(poolDataListRepo.query).not.toHaveBeenCalled();
  });

  it('preview 月跑鎖不阻擋（純讀取）', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });
    mockActiveVersion('H', 1);
    poolDataListRepo.query.mockResolvedValue([]);

    // 預期 200 而非 409
    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });
    expect(result.distribution).toEqual({ A: 0 });
  });

  // ===== F094 死欄回歸守門（本次修正核心） =====

  it('REG-F094：preview SQL 讀 ob_pool_data（活表即時計分），不得再讀死欄來源 ob_pool_data_list', async () => {
    mockActiveVersion('H', 1);
    // histogram 形（score/cnt）；本測僅驗 SQL 形狀 + 讀取來源。
    poolDataListRepo.query.mockResolvedValue([{ score: 500, cnt: 3 }]);

    await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });

    const sql = poolDataListRepo.query.mock.calls[0][0] as string;
    // 自 ob_pool_data 即時算分（LATERAL 子查詢 + histogram GROUP BY s.score，分桶已移至記憶體）
    expect(sql).toContain('ob_pool_data ');
    expect(sql).toMatch(/CROSS JOIN LATERAL/i);
    expect(sql).toMatch(/GROUP BY s\.score/i);
    // histogram 化：SQL 不再含分桶 CASE / :lvl_* 門檻參數（分桶在記憶體）
    expect(sql).not.toMatch(/:lvl_/);
    expect(sql).not.toMatch(/GROUP BY bucket/i);
    // 不得再自死欄來源 ob_pool_data_list 分桶（F094 起該表 score 恆 NULL）
    expect(sql).not.toContain('ob_pool_data_list');
    // 以該 cardType 之 active 計分設定算分（讀 active column + score 區間）
    expect(columnRepo.find).toHaveBeenCalled();
    const colWhere = columnRepo.find.mock.calls[0][0].where;
    expect(colWhere).toMatchObject({ card_type: 'H', card_version: 1, status: 'active' });
    expect(scoreRepo.find).toHaveBeenCalled();
  });

  // ===== 2026-06-02 OOM 事故回歸守門 =====

  it('REG-OOM：preview 不得 find() 全表載入 Node，須以 query() 下推 SQL 分桶', async () => {
    // 原 bug：poolDataListRepo.find() 把整張表 hydrate 進記憶體 → heap OOM → 進程崩潰 → 整頁 API 500。
    mockActiveVersion('H', 1);
    poolDataListRepo.find = vi.fn().mockResolvedValue([]);
    poolDataListRepo.query.mockResolvedValue([{ bucket: 'A', cnt: 1 }]);

    await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });

    expect(poolDataListRepo.find).not.toHaveBeenCalled();
    expect(poolDataListRepo.query).toHaveBeenCalledTimes(1);
  });

  // ===== MSSQL 遷移 GAP 1：previewCardLevels 方言分派守門 =====

  it('GAP1-MSSQL：連線方言為 mssql → SQL 走 CROSS APPLY + CAST(... AS INT) + COUNT(*)，無 LATERAL / ::int', async () => {
    mockActiveVersion('H', 1);
    // MSSQL 分支：連線 options.type='mssql'（PG 分支 mock 無 options → undefined，仍走 PG）。
    poolDataListRepo.manager.connection.options = { type: 'mssql' };
    // fetchPoolDataColumnsMssql 以 manager.query 查 INFORMATION_SCHEMA（fallback schema 檢查，一次性）。
    poolDataListRepo.manager.query = vi
      .fn()
      .mockResolvedValue([{ name: 'loan_rate' }]);
    // histogram：score 500 落入 A(0-999)。
    poolDataListRepo.query.mockResolvedValue([{ score: 500, cnt: 5 }]);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });

    expect(result.distribution).toEqual({ A: 5 });

    const sql = poolDataListRepo.query.mock.calls[0][0] as string;
    // MSSQL 方言：CROSS APPLY（非 LATERAL）、CAST(... AS INT)（非 (expr)::int）、COUNT(*)（非 COUNT(*)::int）。
    expect(sql).toMatch(/CROSS APPLY/i);
    expect(sql).toContain('AS INT)');
    expect(sql).not.toMatch(/LATERAL/i);
    expect(sql).not.toContain('::int');
    // 仍自活表 ob_pool_data 即時算分 + histogram GROUP BY s.score（不讀死欄來源 ob_pool_data_list）。
    expect(sql).toContain('ob_pool_data ');
    expect(sql).not.toContain('ob_pool_data_list');
    expect(sql).toMatch(/GROUP BY s\.score/i);
    // fallback schema 檢查恰一次（O(1) INFORMATION_SCHEMA 查詢，非逐欄 N+1）。
    expect(poolDataListRepo.manager.query).toHaveBeenCalledTimes(1);
  });

  // ===== F055 BR-2：≤60s 應用層 histogram 快取 =====

  it('BR-2 cache：同一 (cardType,cardVersion) 於 TTL 內不同 levels 只掃描一次（histogram 快取），兩次皆正確分桶', async () => {
    mockActiveVersion('H', 1);
    // histogram（level 無關）僅第一次掃描時查一次；第二次改門檻應命中快取、不再下 SQL。
    poolDataListRepo.query.mockResolvedValue([
      { score: 250, cnt: 20 },
      { score: 220, cnt: 40 },
      { score: 200, cnt: 30 },
      { score: 100, cnt: 10 },
    ]);

    // 第一次：4 級門檻（cache miss → 掃描一次）
    const r1 = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([
        { cardLevel: 'A', scoreS: 243, scoreE: 999 },
        { cardLevel: 'B', scoreS: 214, scoreE: 242 },
        { cardLevel: 'C', scoreS: 185, scoreE: 213 },
        { cardLevel: 'D', scoreS: 0, scoreE: 184 },
      ]),
    });
    expect(r1.distribution).toEqual({ A: 20, B: 40, C: 30, D: 10 });

    // 第二次：不同門檻（合併為 2 級）→ cache hit，純記憶體重新分桶：
    //   HI(210-999)←250:20 + 220:40 = 60；LO(0-209)←200:30 + 100:10 = 40。
    const r2 = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([
        { cardLevel: 'HI', scoreS: 210, scoreE: 999 },
        { cardLevel: 'LO', scoreS: 0, scoreE: 209 },
      ]),
    });
    expect(r2.distribution).toEqual({ HI: 60, LO: 40 });

    // 兩次呼叫、histogram 只掃一次（第二次全記憶體分桶）。
    expect(poolDataListRepo.query).toHaveBeenCalledTimes(1);
    // 計分維度讀取（columnRepo/scoreRepo）僅在首次 cache miss 時發生。
    expect(columnRepo.find).toHaveBeenCalledTimes(1);
    expect(scoreRepo.find).toHaveBeenCalledTimes(1);
  });

  it('BR-1 in-memory 分桶：first-match-wins（區間重疊時取第一命中）+ inclusive 兩端邊界', async () => {
    mockActiveVersion('H', 1);
    // 刻意重疊 X(100-300) / Y(200-400) 以驗 first-match-then-break；並取各邊界值驗 inclusive。
    poolDataListRepo.query.mockResolvedValue([
      { score: 100, cnt: 1 },  // X 下界(inclusive) → X
      { score: 200, cnt: 2 },  // 落在 X∩Y → first-match → X
      { score: 300, cnt: 4 },  // X 上界(inclusive)，亦落在 Y → first-match → X
      { score: 301, cnt: 8 },  // 僅 Y
      { score: 400, cnt: 16 }, // Y 上界(inclusive) → Y
    ]);

    const result = await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([
        { cardLevel: 'X', scoreS: 100, scoreE: 300 },
        { cardLevel: 'Y', scoreS: 200, scoreE: 400 },
      ]),
    });

    // X = 1+2+4 = 7（含下界 100、上界 300、且重疊 200/300 first-match 歸 X）
    // Y = 8+16 = 24（301 僅 Y、400 上界 inclusive）
    expect(result.distribution).toEqual({ X: 7, Y: 24 });
  });

  it('BR-2 cache：逾 60s TTL 後快取失效、重新掃描', async () => {
    mockActiveVersion('H', 1);
    poolDataListRepo.query.mockResolvedValue([{ score: 500, cnt: 3 }]);
    const levels = JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]);

    const nowSpy = vi.spyOn(Date, 'now');

    // t=0：cache miss → 掃描一次
    nowSpy.mockReturnValue(1_000_000);
    const r1 = await service.previewCardLevels({ cardType: 'H', levels });
    expect(r1.distribution).toEqual({ A: 3 });
    expect(poolDataListRepo.query).toHaveBeenCalledTimes(1);

    // t=+59s：仍在 TTL 內 → cache hit、不重掃
    nowSpy.mockReturnValue(1_000_000 + 59_000);
    await service.previewCardLevels({ cardType: 'H', levels });
    expect(poolDataListRepo.query).toHaveBeenCalledTimes(1);

    // t=+61s：逾 60s TTL → cache miss、重新掃描
    nowSpy.mockReturnValue(1_000_000 + 61_000);
    await service.previewCardLevels({ cardType: 'H', levels });
    expect(poolDataListRepo.query).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it('BR-2 cache（回歸）：TTL 自「查詢完成之當下」起算，慢 histogram 掃描後快取不得 dead-on-arrival', async () => {
    // 🔴 防回歸：expiresAt 曾誤用「查詢前」捕捉之 nowMs，當 histogram 掃描本身耗時 ~TTL（真庫 ~60s）時，
    //   expiresAt≈查詢剛結束即到期，下一次預覽仍重掃（快取形同無效）。此測模擬掃描期間 Date.now 推進 70s。
    mockActiveVersion('H', 1);
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    // histogram 查詢執行期間 Date.now 推進到 +70s（模擬慢掃描），且僅回一次直方圖
    poolDataListRepo.query.mockImplementation(async () => {
      nowSpy.mockReturnValue(1_000_000 + 70_000);
      return [{ score: 500, cnt: 3 }];
    });

    // 首次：cache miss → 掃描一次；expiresAt 須為 (1_000_000+70_000)+60_000 = 1_130_000（非誤用 nowMs 之 1_060_000）
    await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'A', scoreS: 0, scoreE: 999 }]),
    });
    expect(poolDataListRepo.query).toHaveBeenCalledTimes(1);

    // t=+90s（查詢完成後 +20s，遠在 130s 到期前）：若誤用 nowMs 則已於 +60s 過期→誤重掃；正確應命中快取。
    nowSpy.mockReturnValue(1_000_000 + 90_000);
    await service.previewCardLevels({
      cardType: 'H',
      levels: JSON.stringify([{ cardLevel: 'B', scoreS: 0, scoreE: 999 }]),
    });
    expect(poolDataListRepo.query).toHaveBeenCalledTimes(1); // 仍只掃一次 = 快取有效

    nowSpy.mockRestore();
  });
});
