/**
 * F056 v1.5 / AC-9：cardType 範圍鎖 unit tests
 *
 * 對應 test-spec：docs/test-specs/features/F056-test.md
 *   TS-F056-034：GET /tier-mapping?cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND
 *   TS-F056-035：PUT /tier-mapping?cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND
 *   TS-F056-044：GET 僅回傳該 cardType 紀錄（其他不混入）
 *
 * 涵蓋所有端點：GET / PUT / POST / DELETE 之 cardType 必須對應 ob_card_type.status='active'
 *
 * 設計：採 mock-repo unit test，不真實連 DB（與既有 F056 *.service.spec.ts 同 pattern）。
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

describe('AssignmentScoringService — F056 v1.5 cardType 範圍鎖（AC-9）', () => {
  let service: AssignmentScoringService;
  let cardTypeRepo: any;
  let tierRepo: any;
  let runRepo: any;
  let levelRepo: any;
  let versionRepo: any;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    cardTypeRepo = {
      findOne: vi.fn().mockResolvedValue(null), // 預設 cardType 不存在
    };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    tierRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      create: vi.fn((d: any) => ({ ...d })),
      remove: vi.fn(),
      delete: vi.fn(),
    };
    versionRepo = { findOne: vi.fn() };
    levelRepo = { findOne: vi.fn() };

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

  describe('getTierMapping (GET)', () => {
    it('TS-F056-034：cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.getTierMapping({ cardType: 'NOTEXIST' });
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });

    it('cardType 存在但 status=inactive → 404', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null); // findOne 帶 status='active' 條件，inactive 回 null

      try {
        await service.getTierMapping({ cardType: 'Z' });
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });

    it('TS-F056-044：cardType=H 僅回傳 H 紀錄（不混入其他 CARD_TYPE）', async () => {
      cardTypeRepo.findOne.mockResolvedValue({
        card_type: 'H',
        card_name: '期中',
        prod_kind: '01',
        status: 'active',
      });
      tierRepo.find.mockResolvedValue([
        { card_type: 'H', card_level: 'A', tier_level: 'T1', list_nm: '期中名單' },
        { card_type: 'H', card_level: 'B', tier_level: 'T2', list_nm: '期中名單' },
      ]);

      const result = await service.getTierMapping({ cardType: 'H' });

      expect(result.mappings).toHaveLength(2);
      // 確認 tierRepo.find 被以 card_type='H' 篩選
      expect(tierRepo.find).toHaveBeenCalledWith({
        where: { card_type: 'H' },
      });
      // 所有列均為 H
      expect(result.mappings.every((m) => m.cardType === 'H')).toBe(true);
    });
  });

  describe('updateTierMapping (PUT)', () => {
    it('TS-F056-035：query cardType=NOTEXIST → 404', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.updateTierMapping(
          {
            cardType: 'NOTEXIST',
            mappings: [{ cardType: 'NOTEXIST', cardLevel: 'A', tierLevel: 'T1' }],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });

    it('body 內 mapping.cardType 與 query cardType 不一致 → 422 VALIDATION_ERROR', async () => {
      cardTypeRepo.findOne.mockResolvedValue({
        card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active',
      });

      try {
        await service.updateTierMapping(
          {
            cardType: 'H', // query
            mappings: [
              { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
              { cardType: 'S', cardLevel: 'A', tierLevel: 'T1' }, // 混入 S
            ],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('VALIDATION_ERROR');
      }
      expect(tierRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('createTierMapping (POST)', () => {
    it('cardType 不存在 → 404', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.createTierMapping(
          { cardType: 'NOTEXIST', cardLevel: 'A', tierLevel: 'T1' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });

  describe('deleteTierMapping (DELETE)', () => {
    it('cardType 不存在 → 404', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.deleteTierMapping(
          { cardType: 'NOTEXIST', cardLevel: 'A' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });
});
