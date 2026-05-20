/**
 * Iter 9 / CardTypeService.getCardTypeStats Unit Tests
 *
 * 對應 endpoint: GET /api/v1/assignment/scoring/card-types/:cardType/stats
 *
 * 涵蓋：
 *   - 已存在 cardType 且 cascade 全有 → 回傳正確五項 counts
 *   - 新建立 cardType（無 scores/levels/tiers）→ 回傳全 0
 *   - listDefsAffected 僅計算 status='active' 列定義
 *   - cardType 不存在 → 404 CARD_TYPE_NOT_FOUND
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CardTypeService } from '../services/card-type.service';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('CardTypeService — getCardTypeStats', () => {
  let service: CardTypeService;
  let cardTypeRepo: any;
  let columnRepo: any;
  let scoreRepo: any;
  let levelRepo: any;
  let tierRepo: any;
  let listDefRepo: any;

  beforeEach(async () => {
    cardTypeRepo = {
      findOne: vi.fn(),
    };
    columnRepo = { count: vi.fn().mockResolvedValue(0) };
    scoreRepo = { count: vi.fn().mockResolvedValue(0) };
    levelRepo = { count: vi.fn().mockResolvedValue(0) };
    tierRepo = { count: vi.fn().mockResolvedValue(0) };
    listDefRepo = { count: vi.fn().mockResolvedValue(0) };
    const versionRepo = { count: vi.fn().mockResolvedValue(0) };

    const noop = {
      find: vi.fn(),
      findOne: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardTypeService,
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(PooldataFieldOption), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: columnRepo },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: scoreRepo },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: levelRepo },
        { provide: getRepositoryToken(ObTier), useValue: tierRepo },
        { provide: getRepositoryToken(ObListDefinition), useValue: listDefRepo },
        { provide: getRepositoryToken(AssignmentRun), useValue: noop },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: noop },
        { provide: getRepositoryToken(User), useValue: noop },
        { provide: DataSource, useValue: { transaction: vi.fn() } },
      ],
    }).compile();

    service = module.get(CardTypeService);
  });

  it('回傳正確五項 counts（含 cascade 完整的卡）', async () => {
    cardTypeRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_name: '期中',
      prod_kind: '01',
      status: 'active',
    });
    columnRepo.count.mockResolvedValue(8);
    scoreRepo.count.mockResolvedValue(24);
    levelRepo.count.mockResolvedValue(4);
    tierRepo.count.mockResolvedValue(4);
    listDefRepo.count.mockResolvedValue(2);

    const result = await service.getCardTypeStats('H');

    expect(result).toEqual({
      cardType: 'H',
      dimCount: 8,
      scoreCount: 24,
      levelCount: 4,
      tierCount: 4,
      listDefsAffected: 2,
    });
  });

  it('新建立 cardType（無 scores/levels/tiers）→ 全 0', async () => {
    cardTypeRepo.findOne.mockResolvedValue({
      card_type: 'X1',
      card_name: '新測試',
      prod_kind: '01',
      status: 'active',
    });
    // 所有 count 預設 0

    const result = await service.getCardTypeStats('X1');

    expect(result).toEqual({
      cardType: 'X1',
      dimCount: 0,
      scoreCount: 0,
      levelCount: 0,
      tierCount: 0,
      listDefsAffected: 0,
    });
  });

  it("listDefsAffected 僅計算 status='active' 列定義", async () => {
    cardTypeRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_name: '期中',
      prod_kind: '01',
      status: 'active',
    });
    listDefRepo.count.mockResolvedValue(3);

    await service.getCardTypeStats('H');

    // 驗證 listDefRepo.count 帶 status='active' 篩選
    expect(listDefRepo.count).toHaveBeenCalledWith({
      where: {
        card_type: 'H',
        status: 'active',
      },
    });
  });

  it('cardType 不存在 → 404 CARD_TYPE_NOT_FOUND', async () => {
    cardTypeRepo.findOne.mockResolvedValue(null);

    await expect(service.getCardTypeStats('NONE')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getCardTypeStats('NONE')).rejects.toMatchObject({
      response: {
        error: 'CARD_TYPE_NOT_FOUND',
      },
    });
  });
});
