/**
 * F055 v1.4 / AC-7 / BR-7：cardType 範圍鎖 unit tests
 *
 * 對應 test-spec：docs/test-specs/features/F055-test.md
 *   TS-F055-025：GET / PUT 傳不存在的 cardType → 404 CARD_TYPE_NOT_FOUND
 *
 * 涵蓋：getCardLevels / previewCardLevels / updateCardLevels / deleteCardLevel
 *   四個端點皆需 cardType 範圍鎖。
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

describe('AssignmentScoringService — F055 v1.4 cardType 範圍鎖（AC-7 / BR-7）', () => {
  let service: AssignmentScoringService;
  let cardTypeRepo: any;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    cardTypeRepo = { findOne: vi.fn().mockResolvedValue(null) };

    const noop = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: noop },
        { provide: getRepositoryToken(ObTier), useValue: noop },
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(ObPoolDataList), useValue: noop },
        { provide: getRepositoryToken(AssignmentRun), useValue: { findOne: vi.fn().mockResolvedValue(null) } },
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

  describe('getCardLevels (GET /card-levels)', () => {
    it('TS-F055-025：cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.getCardLevels({ cardType: 'NOTEXIST' });
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });

  describe('previewCardLevels (GET /card-levels/preview)', () => {
    it('cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.previewCardLevels({
          cardType: 'NOTEXIST',
          levels: JSON.stringify([
            { cardLevel: 'A', scoreS: 0, scoreE: 99 },
          ]),
        });
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });

  describe('updateCardLevels (PUT /card-levels)', () => {
    it('cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.updateCardLevels(
          {
            cardType: 'NOTEXIST',
            cardVersion: 1,
            levels: [{ cardLevel: 'A', scoreS: 0, scoreE: 99 }],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });

  describe('deleteCardLevel (DELETE /card-levels)', () => {
    it('cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.deleteCardLevel(
          { cardType: 'NOTEXIST', cardVersion: 1, cardLevel: 'A' },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });

  describe('範圍鎖通過後不回歸', () => {
    it('cardType=H active → 範圍鎖通過，回到既有流程（getCardLevels 不拋 CARD_TYPE_NOT_FOUND）', async () => {
      cardTypeRepo.findOne.mockResolvedValue({
        card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active',
      });

      // 範圍鎖通過後，由既有流程處理；
      // 因 versionRepo 未配置 mock 返回，會走 SCORING_VERSION_NOT_FOUND 路徑（既有行為）
      try {
        await service.getCardLevels({ cardType: 'H' });
      } catch (e: any) {
        // 不該是 CARD_TYPE_NOT_FOUND（已通過範圍鎖）
        expect(e.getResponse?.()?.error).not.toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });
});
