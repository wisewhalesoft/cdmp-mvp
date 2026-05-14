/**
 * F054 v1.2 / AC-7 / BR-7：cardType 範圍鎖 unit tests
 *
 * 對應 test-spec：docs/test-specs/features/F054-test.md
 *   TS-F054-025：PUT /dimensions cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND
 *   TS-F054-026：POST /dimensions cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND
 *
 * 涵蓋：updateDimensions / createDimension / disableDimension 三個寫入端點
 *
 * 注意：F054 spec 內 line 99 / line 166 寫「422 CARD_TYPE_NOT_FOUND」（5.1 PUT / 5.2 POST），
 *   line 206（5.3 disable）寫「404 CARD_TYPE_NOT_FOUND」；
 *   test-spec TS-F054-025/026 統一寫 404；本實作採 404 統一（與 F053/F055/F056/F069~F072 一致）。
 *   F054 spec line 99/166 之 422 標記為 spec 內部不一致，留為 OPEN ITEM 待 spec-writer 確認。
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

describe('AssignmentScoringService — F054 v1.2 cardType 範圍鎖（AC-7 / BR-7）', () => {
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

  describe('updateDimensions (PUT)', () => {
    it('TS-F054-025：cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.updateDimensions(
          {
            cardType: 'NOTEXIST',
            cardVersion: 1,
            dimensions: [],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });

    it('cardType 為 inactive → 404', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);
      try {
        await service.updateDimensions(
          { cardType: 'INACT', cardVersion: 1, dimensions: [] },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });

  describe('createDimension (POST)', () => {
    it('TS-F054-026：cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.createDimension(
          {
            cardType: 'NOTEXIST',
            cardVersion: 1,
            columnName: 'TEST',
            columnLabel: '測試',
            scores: [],
          },
          actor,
        );
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });

  describe('disableDimension (PUT :columnName/disable)', () => {
    it('cardType=NOTEXIST → 404 CARD_TYPE_NOT_FOUND', async () => {
      cardTypeRepo.findOne.mockResolvedValue(null);

      try {
        await service.disableDimension('NOTEXIST', 'CONTRACT_YEARS', actor);
        throw new Error('expected to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      }
    });
  });

  describe('範圍鎖通過後不回歸', () => {
    it('cardType=H active → 範圍鎖通過，回到既有流程', async () => {
      cardTypeRepo.findOne.mockResolvedValue({
        card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active',
      });
      // 既有流程：updateDimensions 不會拋 CARD_TYPE_NOT_FOUND
      const result = await service.updateDimensions(
        { cardType: 'H', cardVersion: 1, dimensions: [] },
        actor,
      );
      expect(result.cardType).toBe('H');
      expect(result.updatedDimensions).toBe(0);
    });
  });
});
