/**
 * F056 §5.5：AssignmentScoringService.previewTierMapping — 各 TIER 分布抽樣估算（AD-E07-45 §5.2）。
 *
 * 本檔為 F056 消費端特有整合案例（histogram → active CARD_LEVEL 分桶 → ob_tier 映射彙總 → 放大推算）；
 * 抽樣核心元件（常數 / scaleEstimate / buildPoolDataSampleFrom）唯一測試位於 sampling-estimator.spec.ts。
 *
 * 對應 F056-test.md：L 組（TS-F056-050~053）、M 組（054/055）、N 組（056）、O 組（058）、
 *   Q 組（061/062）、R 組（063/064）。效能 / 真實 TABLESAMPLE 可重現性（060）需真實 MSSQL，另行 smoke。
 * 均以小母體 fallback（totalCount ≤ 50000）驗證業務彙總邏輯（不依賴真實 TABLESAMPLE，可離線）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
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

// H 型 4 級 active 門檻。
const H_LEVELS = [
  { card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999 },
  { card_type: 'H', card_version: 1, card_level: 'B', score_s: 214, score_e: 242 },
  { card_type: 'H', card_version: 1, card_level: 'C', score_s: 185, score_e: 213 },
  { card_type: 'H', card_version: 1, card_level: 'D', score_s: 0, score_e: 184 },
];

describe('AssignmentScoringService — F056 previewTierMapping (§5.5 / AD-E07-45)', () => {
  let service: AssignmentScoringService;
  let versionRepo: any;
  let columnRepo: any;
  let scoreRepo: any;
  let levelRepo: any;
  let tierRepo: any;
  let cardTypeRepo: any;
  let poolDataListRepo: any;
  let runRepo: any;

  function setPoolData(totalCount: number, histogram: any[]) {
    poolDataListRepo.query.mockImplementation(async (sql: string) => {
      if (/GROUP BY/i.test(sql)) return histogram;
      return [{ cnt: totalCount }];
    });
  }

  beforeEach(async () => {
    versionRepo = {
      findOne: vi.fn().mockResolvedValue({ card_type: 'H', card_version: 1, status: 'active' }),
    };
    columnRepo = { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() };
    scoreRepo = { find: vi.fn().mockResolvedValue([]) };
    levelRepo = { find: vi.fn().mockResolvedValue(H_LEVELS), findOne: vi.fn(), save: vi.fn() };
    tierRepo = { find: vi.fn().mockResolvedValue([]) };
    cardTypeRepo = {
      findOne: vi.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ card_type: where.card_type, card_name: 'mock', prod_kind: '01', status: 'active' }),
      ),
    };
    poolDataListRepo = {
      find: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue([{ cnt: 100 }]),
      manager: { connection: { driver: { escapeQueryWithParameters: makeDriverEscape() } } },
    };
    setPoolData(100, []);
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(ObPoolDataList), useValue: poolDataListRepo },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: { create: vi.fn(), save: vi.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: vi.fn() } },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  // ── L 組：Standard 多對一合計 ──────────────────────────────────────────
  it('TS-F056-050：Standard 多對一合計（A+B→T1）', async () => {
    tierRepo.find.mockResolvedValue([
      { card_type: 'H', card_level: 'A', tier_level: 'T1' },
      { card_type: 'H', card_level: 'B', tier_level: 'T1' },
      { card_type: 'H', card_level: 'C', tier_level: 'T2' },
      { card_type: 'H', card_level: 'D', tier_level: 'T3' },
    ]);
    // 小母體 100：A(250)=10, B(220)=20, C(200)=30, D(100)=40 → sum 100
    setPoolData(100, [
      { score: 250, cnt: 10 },
      { score: 220, cnt: 20 },
      { score: 200, cnt: 30 },
      { score: 100, cnt: 40 },
    ]);

    const r = await service.previewTierMapping({ cardType: 'H' });
    expect(r.ruleType).toBe('standard');
    expect(r.hasMapping).toBe(true);
    // T1 = A(10)+B(20)=30；T2 = C(30)；T3 = D(40)（3 筆，非 4 筆）
    expect(r.distribution).toEqual([
      { tierLevel: 'T1', count: 30, ratio: 0.3 },
      { tierLevel: 'T2', count: 30, ratio: 0.3 },
      { tierLevel: 'T3', count: 40, ratio: 0.4 },
    ]);
    const ratioSum = r.distribution.reduce((a, d) => a + d.ratio, 0);
    expect(ratioSum).toBeCloseTo(1, 5);
  });

  it('TS-F056-051：一對一（無合計）→ 4 筆各自獨立', async () => {
    tierRepo.find.mockResolvedValue([
      { card_type: 'H', card_level: 'A', tier_level: 'T1' },
      { card_type: 'H', card_level: 'B', tier_level: 'T2' },
      { card_type: 'H', card_level: 'C', tier_level: 'T3' },
      { card_type: 'H', card_level: 'D', tier_level: 'T4' },
    ]);
    setPoolData(100, [
      { score: 250, cnt: 10 },
      { score: 220, cnt: 20 },
      { score: 200, cnt: 30 },
      { score: 100, cnt: 40 },
    ]);
    const r = await service.previewTierMapping({ cardType: 'H' });
    expect(r.distribution.map((d) => d.tierLevel)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(r.distribution.map((d) => d.count)).toEqual([10, 20, 30, 40]);
  });

  it('TS-F056-052：response 契約完整性（7 個頂層鍵 + distribution item 欄位）', async () => {
    tierRepo.find.mockResolvedValue([{ card_type: 'H', card_level: 'A', tier_level: 'T1' }]);
    setPoolData(100, [{ score: 250, cnt: 10 }]);
    const r = await service.previewTierMapping({ cardType: 'H' });
    expect(Object.keys(r).sort()).toEqual(
      ['cardType', 'distribution', 'hasMapping', 'isEstimate', 'ruleType', 'sampleSize', 'totalCount'].sort(),
    );
    expect(r.cardType).toBe('H');
    expect(r.hasMapping).toBe(true);
    expect(r.ruleType).toBe('standard');
    expect(r.isEstimate).toBe(true);
    expect(r.distribution[0]).toEqual(
      expect.objectContaining({ tierLevel: expect.any(String), count: expect.any(Number), ratio: expect.any(Number) }),
    );
  });

  it('TS-F056-053：distribution 依 tierLevel 數值序（T2 在 T10 之前，非字典序）', async () => {
    levelRepo.find.mockResolvedValue([
      { card_type: 'H', card_version: 1, card_level: 'A', score_s: 500, score_e: 999 },
      { card_type: 'H', card_version: 1, card_level: 'B', score_s: 0, score_e: 499 },
    ]);
    tierRepo.find.mockResolvedValue([
      { card_type: 'H', card_level: 'A', tier_level: 'T2' },
      { card_type: 'H', card_level: 'B', tier_level: 'T10' },
    ]);
    setPoolData(100, [
      { score: 600, cnt: 30 },
      { score: 100, cnt: 70 },
    ]);
    const r = await service.previewTierMapping({ cardType: 'H' });
    expect(r.distribution.map((d) => d.tierLevel)).toEqual(['T2', 'T10']);
  });

  // ── M 組：Fallback ───────────────────────────────────────────────────
  it('TS-F056-054：Fallback 全樣本可計分 → 單一 TIER，ratio=1.0（對齊 AC-11「100%」）', async () => {
    tierRepo.find.mockResolvedValue([{ card_type: 'M5', card_level: null, tier_level: 'T5' }]);
    // 全部 100 列可計分（histogram sum = totalCount）
    setPoolData(100, [{ score: 300, cnt: 100 }]);
    const r = await service.previewTierMapping({ cardType: 'M5' });
    expect(r.ruleType).toBe('fallback');
    expect(r.distribution).toHaveLength(1);
    expect(r.distribution[0].tierLevel).toBe('T5');
    expect(r.distribution[0].ratio).toBe(1);
  });

  it('TS-F056-055：Fallback 含不可計分列 → 仍單一 TIER，ratio<1.0（AD §3.5 精確定義，分母含 NULL-score）', async () => {
    tierRepo.find.mockResolvedValue([{ card_type: 'M5', card_level: null, tier_level: 'T5' }]);
    // 100 列中僅 60 列可計分（histogram sum=60 < totalCount=100）
    setPoolData(100, [{ score: 300, cnt: 60 }]);
    const r = await service.previewTierMapping({ cardType: 'M5' });
    expect(r.ruleType).toBe('fallback');
    expect(r.distribution).toHaveLength(1);
    expect(r.distribution[0].tierLevel).toBe('T5');
    expect(r.distribution[0].ratio).toBeLessThan(1);
    expect(r.distribution[0].ratio).toBeCloseTo(0.6, 5);
  });

  // ── N 組：無對應規則 ──────────────────────────────────────────────────
  it('TS-F056-056：ob_tier 無任何對應 → hasMapping=false / ruleType=none / distribution=[]', async () => {
    tierRepo.find.mockResolvedValue([]);
    const r = await service.previewTierMapping({ cardType: 'S5' });
    expect(r.hasMapping).toBe(false);
    expect(r.ruleType).toBe('none');
    expect(r.distribution).toEqual([]);
    expect(r.isEstimate).toBe(true);
  });

  // ── O 組：讀鎖豁免 ────────────────────────────────────────────────────
  it('TS-F056-058：assignment_run running 時 GET preview 仍回 200（讀鎖豁免，不呼叫 assertNotLocked）', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });
    tierRepo.find.mockResolvedValue([{ card_type: 'H', card_level: 'A', tier_level: 'T1' }]);
    setPoolData(100, [{ score: 250, cnt: 10 }]);
    const r = await service.previewTierMapping({ cardType: 'H' });
    expect(r.hasMapping).toBe(true);
    expect(r.distribution).toHaveLength(1);
  });

  // ── Q 組：不重掃 + 不快取 ─────────────────────────────────────────────
  it('TS-F056-061：單一 request 內 computeScoreHistogram 恰被呼叫 1 次', async () => {
    tierRepo.find.mockResolvedValue([
      { card_type: 'H', card_level: 'A', tier_level: 'T1' },
      { card_type: 'H', card_level: 'B', tier_level: 'T1' },
    ]);
    setPoolData(100, [{ score: 250, cnt: 10 }, { score: 220, cnt: 20 }]);
    const spy = vi.spyOn(service as any, 'computeScoreHistogram');
    await service.previewTierMapping({ cardType: 'H' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('TS-F056-062：totalCount 不快取（第二次請求反映變動後筆數）', async () => {
    tierRepo.find.mockResolvedValue([{ card_type: 'H', card_level: 'A', tier_level: 'T1' }]);
    setPoolData(100, [{ score: 250, cnt: 10 }]);
    const r1 = await service.previewTierMapping({ cardType: 'H' });
    expect(r1.totalCount).toBe(100);
    setPoolData(101, [{ score: 250, cnt: 10 }]);
    const r2 = await service.previewTierMapping({ cardType: 'H' });
    expect(r2.totalCount).toBe(101);
  });

  // ── R 組：cardType 範圍鎖 ─────────────────────────────────────────────
  it('TS-F056-064：cardType 不存在於 active ob_card_type → 404 CARD_TYPE_NOT_FOUND', async () => {
    cardTypeRepo.findOne.mockResolvedValue(null);
    await expect(service.previewTierMapping({ cardType: 'NOTEXIST' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    try {
      await service.previewTierMapping({ cardType: 'NOTEXIST' });
    } catch (e: any) {
      expect(e.getResponse().error).toBe('CARD_TYPE_NOT_FOUND');
    }
  });
});
