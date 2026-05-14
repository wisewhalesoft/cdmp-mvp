/**
 * F056 v1.5 / AC-8：TIER_LEVEL 列舉約束（T1~T10）unit tests
 *
 * 對應 test-spec：docs/test-specs/features/F056-test.md
 *   TS-F056-029：PUT tierLevel='T5M' → 422 TIER_LEVEL_INVALID_ENUM
 *   TS-F056-030：POST tierLevel='THC' → 422 TIER_LEVEL_INVALID_ENUM
 *   TS-F056-031：POST tierLevel='T11' → 422 TIER_LEVEL_INVALID_ENUM
 *   TS-F056-032：POST tierLevel='T1'  → 201（邊界值通過）
 *   TS-F056-033：POST tierLevel='T10' → 201（邊界值通過）
 *
 * 涵蓋寫入端點（PUT/POST）；GET / DELETE 不涉及 tierLevel 寫入故不檢查列舉。
 *
 * 設計：採 mock-repo unit test，不真實連 DB（與既有 F056 *.service.spec.ts 同 pattern）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnprocessableEntityException } from '@nestjs/common';
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

describe('AssignmentScoringService — F056 v1.5 TIER_LEVEL 列舉約束（AC-8）', () => {
  let service: AssignmentScoringService;
  let tierRepo: any;
  let runRepo: any;
  let levelRepo: any;
  let versionRepo: any;
  let cardTypeRepo: any;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    // 預設：所有前置驗證 (cardType / cardLevel / 月跑鎖 / 互斥) 都通過，
    // 讓 TIER_LEVEL 列舉檢查成為唯一阻擋點
    cardTypeRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'H',
        card_name: '期中',
        prod_kind: '01',
        status: 'active',
      }),
    };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    tierRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
      remove: vi.fn((e: any) => Promise.resolve(e)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    versionRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'H',
        card_version: 1,
        status: 'active',
      }),
    };
    levelRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'H',
        card_version: 1,
        card_level: 'A',
        score_s: 0,
        score_e: 99,
      }),
      find: vi.fn().mockResolvedValue([]),
    };

    const noop = { find: vi.fn(), findOne: vi.fn(), count: vi.fn(), save: vi.fn(), create: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(ObPoolDataList), useValue: noop },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: {
          create: vi.fn((d: any) => ({ ...d })),
          save: vi.fn((e: any) => Promise.resolve(e)),
        } },
        { provide: getRepositoryToken(User), useValue: {
          findOne: vi.fn().mockResolvedValue({ id: 'sm-uuid', name: 'SM' }),
        } },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  describe('createTierMapping (POST)', () => {
    it('TS-F056-030：tierLevel=THC → 422 TIER_LEVEL_INVALID_ENUM', async () => {
      try {
        await service.createTierMapping(
          { cardType: 'H', cardLevel: 'A', tierLevel: 'THC' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(UnprocessableEntityException);
        expect(e.getResponse?.()?.error).toBe('TIER_LEVEL_INVALID_ENUM');
      }
      // 不應寫入 DB
      expect(tierRepo.save).not.toHaveBeenCalled();
    });

    it('TS-F056-031：tierLevel=T11 → 422 TIER_LEVEL_INVALID_ENUM', async () => {
      try {
        await service.createTierMapping(
          { cardType: 'H', cardLevel: 'A', tierLevel: 'T11' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('TIER_LEVEL_INVALID_ENUM');
      }
      expect(tierRepo.save).not.toHaveBeenCalled();
    });

    it('tierLevel=T5M（舊後綴值）→ 422 TIER_LEVEL_INVALID_ENUM', async () => {
      try {
        await service.createTierMapping(
          { cardType: 'H', cardLevel: 'A', tierLevel: 'T5M' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('TIER_LEVEL_INVALID_ENUM');
      }
    });

    it('TS-F056-032：tierLevel=T1（邊界最小）→ 201 通過', async () => {
      const result = await service.createTierMapping(
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
        actor,
      );
      expect(result.tierLevel).toBe('T1');
      expect(tierRepo.save).toHaveBeenCalled();
    });

    it('TS-F056-033：tierLevel=T10（邊界最大）→ 201 通過', async () => {
      levelRepo.findOne.mockResolvedValue({
        card_type: 'H', card_version: 1, card_level: 'B', score_s: 0, score_e: 99,
      });
      const result = await service.createTierMapping(
        { cardType: 'H', cardLevel: 'B', tierLevel: 'T10' },
        actor,
      );
      expect(result.tierLevel).toBe('T10');
      expect(tierRepo.save).toHaveBeenCalled();
    });

    it('錯誤訊息應含送入的非法值，協助前端 debug', async () => {
      try {
        await service.createTierMapping(
          { cardType: 'H', cardLevel: 'A', tierLevel: 'INVALID' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        const r = e.getResponse();
        expect(r.error).toBe('TIER_LEVEL_INVALID_ENUM');
        expect(r.message).toContain('INVALID');
      }
    });
  });

  describe('updateTierMapping (PUT)', () => {
    it('TS-F056-029：PUT body 內 tierLevel=T5M → 422 TIER_LEVEL_INVALID_ENUM，整批不寫入', async () => {
      try {
        await service.updateTierMapping(
          {
            cardType: 'H',
            mappings: [
              { cardType: 'H', cardLevel: 'A', tierLevel: 'T5M' },
            ],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('TIER_LEVEL_INVALID_ENUM');
      }
      expect(tierRepo.save).not.toHaveBeenCalled();
    });

    it('PUT body 內 N 筆中任一筆 tierLevel 非列舉 → 422，無任何寫入', async () => {
      levelRepo.findOne.mockResolvedValue({
        card_type: 'H', card_version: 1, card_level: 'A',
      });

      try {
        await service.updateTierMapping(
          {
            cardType: 'H',
            mappings: [
              { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' }, // 合法
              { cardType: 'H', cardLevel: 'B', tierLevel: 'INVALID' }, // 非法
            ],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('TIER_LEVEL_INVALID_ENUM');
      }
      expect(tierRepo.save).not.toHaveBeenCalled();
    });

    it('PUT body 內所有 tierLevel 均為合法列舉 → 200', async () => {
      const result = await service.updateTierMapping(
        {
          cardType: 'H',
          mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T1' }],
        },
        actor,
      );
      expect(result.updatedCount + result.insertedCount).toBe(1);
    });
  });
});
