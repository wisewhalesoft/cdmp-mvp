/**
 * F053 v1.2 / AC-7 / BR-4：cardType 範圍鎖 unit tests
 *
 * 對應 test-spec：docs/test-specs/features/F053-test.md
 *   TS-F053-016：GET 傳入不存在 ob_card_type active scope 的 cardType → 404 CARD_TYPE_NOT_FOUND
 *
 * 設計：採 mock-repo unit test，與既有 F053 spec 同 pattern。
 *
 * 注意（Iter 4 範圍守則）：
 *   v1.2 spec 將 cardType 改為「必填」並把 path rename 為 /scoring/dimensions —
 *   此屬於完整重構（超出 Iter 4 增量範圍）。Iter 4 僅補「範圍鎖」：
 *   當 caller 提供 cardType 時，先驗證該 cardType 存在於 ob_card_type.status='active'，
 *   不存在 → 404 CARD_TYPE_NOT_FOUND。
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

describe('AssignmentScoringService — F053 v1.2 cardType 範圍鎖（AC-7 / BR-4）', () => {
  let service: AssignmentScoringService;
  let versionRepo: any;
  let cardTypeRepo: any;

  beforeEach(async () => {
    versionRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'H', card_name: '期中', card_version: 1,
        sdate: '20190823', edate: '20991231', status: 'active',
      }),
    };
    // 預設：cardType 不存在於 active scope
    cardTypeRepo = { findOne: vi.fn().mockResolvedValue(null) };

    const noop = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentScoringService,
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: noop },
        { provide: getRepositoryToken(ObTier), useValue: noop },
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(ObPoolDataList), useValue: noop },
        { provide: getRepositoryToken(AssignmentRun), useValue: { findOne: vi.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: noop },
        { provide: getRepositoryToken(User), useValue: noop },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  it('TS-F053-016：cardType=GONE 不存在於 active scope → 404 CARD_TYPE_NOT_FOUND', async () => {
    cardTypeRepo.findOne.mockResolvedValue(null);

    try {
      await service.getScoring({ cardType: 'GONE' });
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
    }
  });

  it('cardType 存在但 status=inactive → 404（findOne where status=active 回 null）', async () => {
    cardTypeRepo.findOne.mockResolvedValue(null);
    try {
      await service.getScoring({ cardType: 'INACT' });
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
    }
  });

  it('CARD_TYPE_NOT_FOUND 優先於 SCORING_VERSION_NOT_FOUND（語意精確）', async () => {
    // cardType 不存在 → 應拋 CARD_TYPE_NOT_FOUND；
    // 即使 versionRepo 也回 null（無 active 版本），仍應先拋 CARD_TYPE_NOT_FOUND
    cardTypeRepo.findOne.mockResolvedValue(null);
    versionRepo.findOne.mockResolvedValue(null);

    try {
      await service.getScoring({ cardType: 'GONE' });
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
      // 不該是 SCORING_VERSION_NOT_FOUND
      expect(e.getResponse?.()?.error).not.toBe('SCORING_VERSION_NOT_FOUND');
    }
  });

  it('cardType active → 範圍鎖通過，回到既有流程（無回歸）', async () => {
    cardTypeRepo.findOne.mockResolvedValue({
      card_type: 'H', card_name: '期中', prod_kind: '01', status: 'active',
    });
    // 既有流程正常執行
    const result = await service.getScoring({ cardType: 'H' });
    expect(result.version.cardType).toBe('H');
  });
});
