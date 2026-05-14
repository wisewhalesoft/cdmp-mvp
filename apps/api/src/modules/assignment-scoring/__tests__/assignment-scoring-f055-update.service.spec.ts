/**
 * F055：AssignmentScoringService.updateCardLevels Unit Tests
 *
 *   - TS-F055-003：H 4 級 A/B/C/D 修改成功，DB 對應 update，card_version 不遞增
 *   - TS-F055-004：S5 2 級 A/B 修改成功（不硬編碼 4 級）
 *   - TS-F055-005：以 (cardType, cardVersion, cardLevel) 三欄定位，不依 surrogate id
 *   - TS-F055-006：audit_log 記 UPDATE / before+after 含 scoreS / scoreE
 *   - TS-F055-009：B.scoreS=65 與 A.scoreE=80 重疊 → 422 SCORING_RANGE_OVERLAP
 *   - TS-F055-010：相鄰接觸 [81,100]+[61,80] 允許
 *   - BE-F055-001：levels 比 DB 現有筆數少（僅更新傳入的，其他保留）
 *   - BE-F055-002：preview 中 scoreS > scoreE → 422（單筆內反向區間視為重疊）
 *   - AC-5：月跑鎖 → 409
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
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

describe('AssignmentScoringService — F055 updateCardLevels', () => {
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
    columnRepo = { find: vi.fn(), findOne: vi.fn(), save: vi.fn(), create: vi.fn() };
    scoreRepo = { find: vi.fn(), save: vi.fn(), create: vi.fn(), delete: vi.fn() };
    levelRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };
    tierRepo = { find: vi.fn(), findOne: vi.fn() };
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

  it('TS-F055-003：H 4 級 A/B/C/D 修改成功，updatedLevels=4', async () => {
    levelRepo.findOne.mockImplementation(({ where }: any) => {
      const map: Record<string, any> = {
        A: { id: '1', card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999 },
        B: { id: '2', card_type: 'H', card_version: 1, card_level: 'B', score_s: 214, score_e: 242 },
        C: { id: '3', card_type: 'H', card_version: 1, card_level: 'C', score_s: 185, score_e: 213 },
        D: { id: '4', card_type: 'H', card_version: 1, card_level: 'D', score_s: 0, score_e: 184 },
      };
      return Promise.resolve(map[where.card_level]);
    });

    const result = await service.updateCardLevels(
      {
        cardType: 'H', cardVersion: 1,
        levels: [
          { cardLevel: 'A', scoreS: 250, scoreE: 999 },
          { cardLevel: 'B', scoreS: 214, scoreE: 249 },
          { cardLevel: 'C', scoreS: 185, scoreE: 213 },
          { cardLevel: 'D', scoreS: 0, scoreE: 184 },
        ],
      },
      actor,
    );

    expect(result).toMatchObject({ cardType: 'H', cardVersion: 1, updatedLevels: 4 });
    // levelRepo.save 應該被呼叫 4 次（每筆獨立 save，便於 partial update）
    expect(levelRepo.save).toHaveBeenCalledTimes(4);
    // 第一次 save 的 entity 是 A 級，score_s 改為 250
    const savedA = levelRepo.save.mock.calls.find(
      (c) => c[0].card_level === 'A',
    )[0];
    expect(savedA.score_s).toBe(250);
  });

  it('TS-F055-004：S5 2 級 A/B 修改成功（不硬編碼 4 級）', async () => {
    levelRepo.findOne.mockImplementation(({ where }: any) => {
      const map: Record<string, any> = {
        A: { id: '5', card_type: 'S5', card_version: 1, card_level: 'A', score_s: 200, score_e: 999 },
        B: { id: '6', card_type: 'S5', card_version: 1, card_level: 'B', score_s: 0, score_e: 199 },
      };
      return Promise.resolve(map[where.card_level]);
    });

    const result = await service.updateCardLevels(
      {
        cardType: 'S5', cardVersion: 1,
        levels: [
          { cardLevel: 'A', scoreS: 210, scoreE: 999 },
          { cardLevel: 'B', scoreS: 0, scoreE: 209 },
        ],
      },
      actor,
    );
    expect(result.updatedLevels).toBe(2);
    expect(levelRepo.save).toHaveBeenCalledTimes(2);
  });

  it('TS-F055-005：依三欄複合鍵定位（不依 surrogate id）', async () => {
    levelRepo.findOne.mockResolvedValue({
      id: '999', card_type: 'H', card_version: 1, card_level: 'B', score_s: 214, score_e: 242,
    });

    await service.updateCardLevels(
      {
        cardType: 'H', cardVersion: 1,
        levels: [{ cardLevel: 'B', scoreS: 220, scoreE: 242 }],
      },
      actor,
    );

    const findArgs = levelRepo.findOne.mock.calls[0][0];
    // 必須以 (card_type, card_version, card_level) 三欄查
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      card_version: 1,
      card_level: 'B',
    });
    // 不應傳入 id
    expect(findArgs.where.id).toBeUndefined();

    // save 後 score_s = 220（依三欄定位到的列）
    const saved = levelRepo.save.mock.calls[0][0];
    expect(saved.score_s).toBe(220);
    expect(saved.id).toBe('999'); // 保留原 id
  });

  it('TS-F055-006：audit_log 記 UPDATE / before+after / entity_id=H|1', async () => {
    levelRepo.findOne.mockImplementation(({ where }: any) => {
      if (where.card_level === 'A')
        return Promise.resolve({
          id: '1', card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
        });
      return Promise.resolve(null);
    });

    await service.updateCardLevels(
      {
        cardType: 'H', cardVersion: 1,
        levels: [{ cardLevel: 'A', scoreS: 250, scoreE: 999 }],
      },
      actor,
    );

    expect(auditRepo.create).toHaveBeenCalled();
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('UPDATE');
    expect(log.entity_type).toBe('ob_levelcard_level');
    expect(log.entity_id).toBe('H|1');
    expect((log.before_value as any).levels[0].scoreS).toBe(243);
    expect((log.after_value as any).levels[0].scoreS).toBe(250);
  });

  it('TS-F055-009：等級間區間重疊（A:[81,100] 與 B:[65,90]）→ 422 SCORING_RANGE_OVERLAP，DB 不變', async () => {
    // 註：test-spec 字面以「B.scoreS=65 與 A.scoreE=80 重疊」描述本 case，但數學上
    // [81,100] 與 [65,80] 為相鄰不重疊（80+1=81，與 TS-F055-010 同形）。為符合 test-spec
    // 「兩等級 overlap」之業務意圖，將 B.scoreE 調整為 90 使其與 A.scoreS=81 真實交集
    // ([65,90] ∩ [81,100] = [81,90] ≠ ∅），驗證 hasNumericOverlap 行為。
    await expect(
      service.updateCardLevels(
        {
          cardType: 'H', cardVersion: 1,
          levels: [
            { cardLevel: 'A', scoreS: 81, scoreE: 100 },
            { cardLevel: 'B', scoreS: 65, scoreE: 90 },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.updateCardLevels(
        {
          cardType: 'H', cardVersion: 1,
          levels: [
            { cardLevel: 'A', scoreS: 81, scoreE: 100 },
            { cardLevel: 'B', scoreS: 65, scoreE: 90 },
          ],
        },
        actor,
      );
    } catch (e: any) {
      expect(e.getResponse().error).toBe('SCORING_RANGE_OVERLAP');
    }

    expect(levelRepo.save).not.toHaveBeenCalled();
  });

  it('TS-F055-010：相鄰接觸 A:[81,100] B:[61,80] 合法（80+1=81）', async () => {
    levelRepo.findOne.mockImplementation(({ where }: any) => {
      const map: Record<string, any> = {
        A: { id: '1', card_type: 'H', card_version: 1, card_level: 'A', score_s: 81, score_e: 100 },
        B: { id: '2', card_type: 'H', card_version: 1, card_level: 'B', score_s: 61, score_e: 80 },
      };
      return Promise.resolve(map[where.card_level]);
    });

    const result = await service.updateCardLevels(
      {
        cardType: 'H', cardVersion: 1,
        levels: [
          { cardLevel: 'A', scoreS: 81, scoreE: 100 },
          { cardLevel: 'B', scoreS: 61, scoreE: 80 },
        ],
      },
      actor,
    );
    expect(result.updatedLevels).toBe(2);
  });

  it('BE-F055-001：levels 比 DB 現有少（partial update，其他保留）', async () => {
    // DB 有 4 級，request 只傳 A
    levelRepo.findOne.mockImplementation(({ where }: any) => {
      if (where.card_level === 'A')
        return Promise.resolve({
          id: '1', card_type: 'H', card_version: 1, card_level: 'A', score_s: 243, score_e: 999,
        });
      return Promise.resolve(null);
    });

    const result = await service.updateCardLevels(
      {
        cardType: 'H', cardVersion: 1,
        levels: [{ cardLevel: 'A', scoreS: 250, scoreE: 999 }],
      },
      actor,
    );

    expect(result.updatedLevels).toBe(1);
    // 只 save A，不動 B/C/D
    expect(levelRepo.save).toHaveBeenCalledTimes(1);
  });

  it('BE-F055-002：單筆 scoreS > scoreE → 422 SCORING_RANGE_OVERLAP', async () => {
    await expect(
      service.updateCardLevels(
        {
          cardType: 'H', cardVersion: 1,
          levels: [{ cardLevel: 'A', scoreS: 100, scoreE: 50 }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC-5：月跑鎖 → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ status: 'running' });
    await expect(
      service.updateCardLevels(
        {
          cardType: 'H', cardVersion: 1,
          levels: [{ cardLevel: 'A', scoreS: 243, scoreE: 999 }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('找不到三欄複合鍵對應的紀錄 → 404 CARD_LEVEL_NOT_FOUND', async () => {
    levelRepo.findOne.mockResolvedValue(null);
    try {
      await service.updateCardLevels(
        {
          cardType: 'H', cardVersion: 1,
          levels: [{ cardLevel: 'Z', scoreS: 0, scoreE: 99 }],
        },
        actor,
      );
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse().error).toBe('CARD_LEVEL_NOT_FOUND');
    }
  });
});
