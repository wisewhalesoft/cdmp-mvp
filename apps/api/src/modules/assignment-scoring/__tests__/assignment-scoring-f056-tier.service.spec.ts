/**
 * F056：AssignmentScoringService — TIER_LEVEL 對應表 Unit Tests
 *
 * GET /tier-mapping (§5.1)
 *   - TS-F056-001：回傳含標準對應 + fallback (M5/M3/HC/C3)，依 (card_type, card_level) 升冪
 *   - TS-F056-002：list_nm 有值與 null 均正確回傳
 *
 * PUT /tier-mapping (§5.2，批次 UPSERT)
 *   - TS-F056-004：UPDATE 既有對應
 *   - TS-F056-005：INSERT 不存在對應
 *   - TS-F056-006：未列出的既有對應不刪除（partial UPSERT）
 *   - TS-F056-007：body 內同一 PK 重複 → 422 TIER_LEVEL_DUPLICATE
 *   - TS-F056-008：audit_log entity_id 含分隔符 '{cardType}|{cardLevel}'
 *   - TS-F056-009：fallback (card_level=null) UPSERT 允許
 *   - TS-F056-010/011：月跑鎖 → 409
 *
 * POST /tier-mapping (§5.3，單筆 INSERT)
 *   - TS-F056-012：正常新增 → 201
 *   - TS-F056-013：DB 已存在 → 422 TIER_LEVEL_DUPLICATE（不執行 UPDATE）
 *   - TS-F056-014：CARD_LEVEL 不存在於 active 版本（標準路徑）→ 422 CARD_LEVEL_NOT_FOUND_IN_VERSION
 *   - TS-F056-015：card_level 'AB'（>1 字元）→ 422 CARD_LEVEL_NOT_FOUND_IN_VERSION（BR-9）
 *   - TS-F056-016：fallback (M5, null) 新增 → 201（不觸發 CARD_LEVEL_NOT_FOUND_IN_VERSION）
 *   - TS-F056-017：fallback (M3, null) 過渡期 → 201
 *   - TS-F056-018：月跑鎖 → 409
 *
 * 邊界
 *   - BE-F056-001：PUT listNm 省略 → 保留現有
 *   - BE-F056-002：PUT listNm 明確傳 null → 清空
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AssignmentScoringService } from '../assignment-scoring.service';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('AssignmentScoringService — F056 tier-mapping', () => {
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

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    versionRepo = { findOne: vi.fn() };
    columnRepo = { find: vi.fn(), findOne: vi.fn() };
    scoreRepo = { find: vi.fn() };
    levelRepo = { find: vi.fn(), findOne: vi.fn() };
    tierRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
    };
    poolDataListRepo = { find: vi.fn().mockResolvedValue([]) };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    auditRepo = {
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'sm-uuid', name: 'SM' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        { provide: getRepositoryToken(ObPoolDataList), useValue: poolDataListRepo },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  // ===== GET /tier-mapping =====

  it('TS-F056-001：GET 回傳含標準 + fallback 對應，依 (card_type, card_level) 升冪', async () => {
    tierRepo.find.mockResolvedValue([
      { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
      { card_type: 'M5', card_level: null, tier_level: 'T5M', list_nm: '機車' },
      { card_type: 'M3', card_level: null, tier_level: 'T5M', list_nm: null },
      { card_type: 'H', card_level: 'B', tier_level: 'T2', list_nm: '期中' },
    ]);

    const result = await service.getTierMapping();
    expect(result.mappings).toHaveLength(4);
    // 依 (card_type, card_level NULLS FIRST) 升冪
    // H/A < H/B < M3/null < M5/null
    expect(result.mappings.map((m) => `${m.cardType}|${m.cardLevel ?? '_null'}`)).toEqual([
      'H|A', 'H|B', 'M3|_null', 'M5|_null',
    ]);
    // fallback 那筆 cardLevel=null
    expect(result.mappings.find((m) => m.cardType === 'M5')?.cardLevel).toBeNull();
  });

  it('TS-F056-002：GET list_nm 有值與 null 均正確回傳（鍵存在）', async () => {
    tierRepo.find.mockResolvedValue([
      { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
      { card_type: 'H', card_level: 'B', tier_level: 'T2', list_nm: null },
    ]);

    const result = await service.getTierMapping();
    expect(result.mappings[0].listNm).toBe('期中名單');
    expect(result.mappings[1]).toHaveProperty('listNm', null);
  });

  // ===== PUT /tier-mapping =====

  it('TS-F056-004：PUT UPDATE 既有對應，updatedCount=1，insertedCount=0', async () => {
    // ob_levelcard_level 中 H/A 存在 → 通過 CARD_LEVEL_NOT_FOUND 檢查
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
    });
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    // DB 中 H/A 已存在
    tierRepo.findOne.mockResolvedValue({
      card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單',
    });

    const result = await service.updateTierMapping(
      {
        mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2', listNm: undefined }],
      },
      actor,
    );

    expect(result).toMatchObject({ updatedCount: 1, insertedCount: 0 });
    // tierRepo.save 被呼叫，且 tier_level=T2
    const saved = tierRepo.save.mock.calls[0][0];
    expect(saved.tier_level).toBe('T2');
  });

  it('TS-F056-005：PUT INSERT 不存在對應，updatedCount=0，insertedCount=1', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, card_level: 'B', score_s: 214, score_e: 242,
    });
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    tierRepo.findOne.mockResolvedValue(null); // DB 無 H/B

    const result = await service.updateTierMapping(
      { mappings: [{ cardType: 'H', cardLevel: 'B', tierLevel: 'T2' }] },
      actor,
    );

    expect(result).toMatchObject({ updatedCount: 0, insertedCount: 1 });
  });

  it('TS-F056-006：PUT 未列出的既有對應不刪除（spec 5.2）', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
    });
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    tierRepo.findOne.mockResolvedValue({
      card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單',
    });

    await service.updateTierMapping(
      { mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' }] },
      actor,
    );

    // service 不應呼叫 delete 任何紀錄
    expect(tierRepo.findOne).toHaveBeenCalled();
    // 沒有 delete 方法被呼叫（mock 上沒設）
  });

  it('TS-F056-007：PUT body 內同一 PK 重複 → 422 TIER_LEVEL_DUPLICATE，DB 不執行寫入', async () => {
    await expect(
      service.updateTierMapping(
        {
          mappings: [
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T2' },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.updateTierMapping(
        {
          mappings: [
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T2' },
          ],
        },
        actor,
      );
    } catch (e: any) {
      expect(e.getResponse().error).toBe('TIER_LEVEL_DUPLICATE');
    }

    expect(tierRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F056-007a：fallback body 內同一 PK (M5,null) 重複也 → 422', async () => {
    await expect(
      service.updateTierMapping(
        {
          mappings: [
            { cardType: 'M5', cardLevel: null, tierLevel: 'T5M' },
            { cardType: 'M5', cardLevel: null, tierLevel: 'T5N' },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('TS-F056-008：PUT audit_log entity_id 含 cardType|cardLevel', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
    });
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    tierRepo.findOne.mockResolvedValue({
      card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中',
    });

    await service.updateTierMapping(
      { mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2' }] },
      actor,
    );

    expect(auditRepo.create).toHaveBeenCalled();
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('UPDATE');
    expect(log.entity_type).toBe('ob_tier');
    expect(log.entity_id).toBe('H|A');
    expect((log.before_value as any).tierLevel).toBe('T1');
    expect((log.after_value as any).tierLevel).toBe('T2');
  });

  it('TS-F056-009：PUT fallback (M5, null) → 不觸發 CARD_LEVEL_NOT_FOUND', async () => {
    versionRepo.findOne.mockResolvedValue(null); // M5 無計分版本
    tierRepo.findOne.mockResolvedValue(null); // INSERT 路徑

    const result = await service.updateTierMapping(
      { mappings: [{ cardType: 'M5', cardLevel: null, tierLevel: 'T5M' }] },
      actor,
    );

    expect(result.insertedCount).toBe(1);
    // levelRepo.findOne 不該被呼叫（fallback 跳過 active level 驗證）
    expect(levelRepo.findOne).not.toHaveBeenCalled();
  });

  it('TS-F056-010：PUT 月跑鎖 pending → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'pending' });
    await expect(
      service.updateTierMapping(
        { mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' }] },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('TS-F056-011：PUT 月跑鎖 running → 409', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });
    await expect(
      service.updateTierMapping(
        { mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' }] },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ===== POST /tier-mapping =====

  it('TS-F056-012：POST 正常新增 → 201 OK 結構', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
    });
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    tierRepo.findOne.mockResolvedValue(null);

    const result = await service.createTierMapping(
      {
        cardType: 'H', cardLevel: 'A',
        tierLevel: 'T1', listNm: '期中名單',
      },
      actor,
    );

    expect(result).toMatchObject({
      cardType: 'H', cardLevel: 'A',
      tierLevel: 'T1', listNm: '期中名單',
    });
    expect(tierRepo.save).toHaveBeenCalled();
    expect(auditRepo.create).toHaveBeenCalled();
    expect(auditRepo.create.mock.calls[0][0].action).toBe('CREATE');
  });

  it('TS-F056-013：POST DB 已存在 PK → 422 TIER_LEVEL_DUPLICATE，不執行 UPDATE', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
    });
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    tierRepo.findOne.mockResolvedValue({
      card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中',
    });

    await expect(
      service.createTierMapping(
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T99' },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.createTierMapping(
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T99' },
        actor,
      );
    } catch (e: any) {
      expect(e.getResponse().error).toBe('TIER_LEVEL_DUPLICATE');
    }

    expect(tierRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F056-014：POST CARD_LEVEL 不存在於 active 版本 → 422 CARD_LEVEL_NOT_FOUND_IN_VERSION', async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    levelRepo.findOne.mockResolvedValue(null); // active 版本中無 H/Z

    await expect(
      service.createTierMapping(
        { cardType: 'H', cardLevel: 'Z', tierLevel: 'T9' },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.createTierMapping(
        { cardType: 'H', cardLevel: 'Z', tierLevel: 'T9' },
        actor,
      );
    } catch (e: any) {
      expect(e.getResponse().error).toBe('CARD_LEVEL_NOT_FOUND_IN_VERSION');
    }
  });

  it("TS-F056-015：POST card_level 'AB' (>1 字元) → 422 CARD_LEVEL_NOT_FOUND_IN_VERSION（BR-9）", async () => {
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    // levelRepo.findOne 不會被呼叫，因 service 應該先以 length>1 短路
    levelRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createTierMapping(
        { cardType: 'H', cardLevel: 'AB', tierLevel: 'T1' },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.createTierMapping(
        { cardType: 'H', cardLevel: 'AB', tierLevel: 'T1' },
        actor,
      );
    } catch (e: any) {
      expect(e.getResponse().error).toBe('CARD_LEVEL_NOT_FOUND_IN_VERSION');
    }
  });

  it('TS-F056-016：POST fallback (M5, null) → 201 不觸發 CARD_LEVEL_NOT_FOUND_IN_VERSION', async () => {
    tierRepo.findOne.mockResolvedValue(null);

    const result = await service.createTierMapping(
      { cardType: 'M5', cardLevel: null, tierLevel: 'T5M', listNm: '機車' },
      actor,
    );

    expect(result.cardLevel).toBeNull();
    expect(result.tierLevel).toBe('T5M');
    // levelRepo.findOne 不該被呼叫
    expect(levelRepo.findOne).not.toHaveBeenCalled();
  });

  it('TS-F056-017：POST fallback (M3, null) 過渡期 → 201', async () => {
    tierRepo.findOne.mockResolvedValue(null);

    const result = await service.createTierMapping(
      { cardType: 'M3', cardLevel: null, tierLevel: 'T5M' },
      actor,
    );
    expect(result.cardType).toBe('M3');
    expect(result.cardLevel).toBeNull();
  });

  it('TS-F056-018：POST 月跑鎖 → 409', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });
    await expect(
      service.createTierMapping(
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ===== BE-F056 邊界 =====

  it('BE-F056-001：PUT listNm 省略 → 保留 DB 現有值', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
    });
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    tierRepo.findOne.mockResolvedValue({
      card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單',
    });

    await service.updateTierMapping(
      { mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2' }] },
      actor,
    );

    const saved = tierRepo.save.mock.calls[0][0];
    expect(saved.list_nm).toBe('期中名單'); // 保留
    expect(saved.tier_level).toBe('T2');
  });

  it('BE-F056-002：PUT listNm 明確傳 null → 清空', async () => {
    levelRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
    });
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
    });
    tierRepo.findOne.mockResolvedValue({
      card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單',
    });

    await service.updateTierMapping(
      { mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2', listNm: null }] },
      actor,
    );

    const saved = tierRepo.save.mock.calls[0][0];
    expect(saved.list_nm).toBeNull();
  });
});
