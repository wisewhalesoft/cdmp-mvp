/**
 * F056 v1.5 / AC-3 / AC-4a / BR-13：Fallback/Standard 互斥 unit tests
 *
 * 對應 test-spec：docs/test-specs/features/F056-test.md
 *   TS-F056-036：已有 Standard 列，新增 Fallback → 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX
 *   TS-F056-037：已有 Fallback 列，新增 Standard → 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX
 *   TS-F056-038：PUT batch body 同時含 null 與非 null → 422 互斥，整批 rollback
 *
 * 互斥規則：同一 CARD_TYPE 之 ob_tier 紀錄不可同時存在：
 *   - card_level IS NULL（Fallback）
 *   - card_level IS NOT NULL（Standard）
 *
 * 設計：依 Iter 3 規範採「pure function helper + service-level check」雙層；
 *   本 spec 同時驗 service 行為與 pure function 行為。
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
import {
  detectFallbackStandardMutexViolation,
  TierRow,
} from '../helpers/tier-mapping-mutex.helper';

describe('detectFallbackStandardMutexViolation (pure function)', () => {
  it('全 Standard 列 → 不違規', () => {
    const rows: TierRow[] = [
      { cardType: 'H', cardLevel: 'A' },
      { cardType: 'H', cardLevel: 'B' },
    ];
    expect(detectFallbackStandardMutexViolation(rows, 'H')).toBe(false);
  });

  it('全 Fallback 列（單筆，本系統設計 fallback 唯一）→ 不違規', () => {
    const rows: TierRow[] = [{ cardType: 'M5', cardLevel: null }];
    expect(detectFallbackStandardMutexViolation(rows, 'M5')).toBe(false);
  });

  it('同 CARD_TYPE 同時有 Standard 與 Fallback → 違規', () => {
    const rows: TierRow[] = [
      { cardType: 'H', cardLevel: 'A' }, // Standard
      { cardType: 'H', cardLevel: null }, // Fallback
    ];
    expect(detectFallbackStandardMutexViolation(rows, 'H')).toBe(true);
  });

  it('混入其他 cardType 的列不影響當前 cardType 判斷', () => {
    const rows: TierRow[] = [
      { cardType: 'S', cardLevel: 'A' }, // 不同 cardType
      { cardType: 'M5', cardLevel: null }, // 不同 cardType
      { cardType: 'H', cardLevel: 'A' }, // 當前 cardType（只有 Standard）
    ];
    expect(detectFallbackStandardMutexViolation(rows, 'H')).toBe(false);
  });

  it('空陣列 → 不違規', () => {
    expect(detectFallbackStandardMutexViolation([], 'H')).toBe(false);
  });
});

describe('AssignmentScoringService — F056 v1.5 Fallback/Standard 互斥（AC-3 / AC-4a / BR-13）', () => {
  let service: AssignmentScoringService;
  let cardTypeRepo: any;
  let tierRepo: any;
  let runRepo: any;
  let levelRepo: any;
  let versionRepo: any;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
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
      delete: vi.fn(),
    };
    versionRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'H', card_version: 1, status: 'active',
      }),
    };
    levelRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'H', card_version: 1, card_level: 'A',
      }),
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
    it('TS-F056-036：已有 Standard 列 (H/A)，POST Fallback (H/null) → 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX', async () => {
      // 模擬 DB 已有 Standard 列
      tierRepo.find.mockResolvedValue([
        { card_type: 'H', card_level: 'A', tier_level: 'T1' },
      ]);

      try {
        await service.createTierMapping(
          { cardType: 'H', cardLevel: null, tierLevel: 'T1' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(UnprocessableEntityException);
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_FALLBACK_STANDARD_MUTEX');
      }
      expect(tierRepo.save).not.toHaveBeenCalled();
    });

    it('TS-F056-037：已有 Fallback 列 (H/null)，POST Standard (H/A) → 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX', async () => {
      tierRepo.find.mockResolvedValue([
        { card_type: 'H', card_level: null, tier_level: 'T1' },
      ]);

      try {
        await service.createTierMapping(
          { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_FALLBACK_STANDARD_MUTEX');
      }
      expect(tierRepo.save).not.toHaveBeenCalled();
    });

    it('POST Standard 但同 CARD_TYPE 已有 Standard（非 Fallback）→ 不違規', async () => {
      tierRepo.find.mockResolvedValue([
        { card_type: 'H', card_level: 'A', tier_level: 'T1' },
      ]);

      // POST H/B → Standard，與既有 H/A Standard 不互斥
      const result = await service.createTierMapping(
        { cardType: 'H', cardLevel: 'B', tierLevel: 'T2' },
        actor,
      );
      expect(result.tierLevel).toBe('T2');
    });

    it('POST Fallback 至空 CARD_TYPE（DB 無任何 H 紀錄）→ 不違規', async () => {
      tierRepo.find.mockResolvedValue([]);

      const result = await service.createTierMapping(
        { cardType: 'H', cardLevel: null, tierLevel: 'T1' },
        actor,
      );
      expect(result.cardLevel).toBeNull();
    });
  });

  describe('updateTierMapping (PUT batch)', () => {
    it('TS-F056-038：PUT body 同時含 Standard + Fallback → 422，整批 rollback', async () => {
      tierRepo.find.mockResolvedValue([]); // DB 無既有 H 紀錄

      try {
        await service.updateTierMapping(
          {
            cardType: 'H',
            mappings: [
              { cardType: 'H', cardLevel: null, tierLevel: 'T1' },
              { cardType: 'H', cardLevel: 'A', tierLevel: 'T2' },
            ],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_FALLBACK_STANDARD_MUTEX');
      }
      expect(tierRepo.save).not.toHaveBeenCalled();
    });

    it('PUT body 全 Standard（與 DB 中 Standard 結合）→ 不違規，成功寫入', async () => {
      tierRepo.find.mockResolvedValue([
        { card_type: 'H', card_level: 'A', tier_level: 'T1' },
      ]);

      const result = await service.updateTierMapping(
        {
          cardType: 'H',
          mappings: [
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
            { cardType: 'H', cardLevel: 'B', tierLevel: 'T2' },
          ],
        },
        actor,
      );
      expect(result.updatedCount + result.insertedCount).toBe(2);
    });

    it('PUT body 為 Standard，但 DB 已有 Fallback 列 → 422 互斥', async () => {
      tierRepo.find.mockResolvedValue([
        { card_type: 'H', card_level: null, tier_level: 'T1' }, // DB 既有 Fallback
      ]);

      try {
        await service.updateTierMapping(
          {
            cardType: 'H',
            mappings: [{ cardType: 'H', cardLevel: 'A', tierLevel: 'T2' }],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_FALLBACK_STANDARD_MUTEX');
      }
    });
  });
});
