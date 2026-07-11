/**
 * F071 / CardTypeService.updateCardType Unit Tests
 *
 * 對應 spec：docs/specs/features/F071-edit-card-type.md
 * 對應 test-spec：docs/test-specs/features/F071-test.md
 *
 * 涵蓋 TC：
 *   TC-F071-03：成功更新 card_name + prod_kind
 *   TC-F071-04：audit_log UPDATE 含 before/after
 *   TC-F071-07：cardType 不存在 → 404 CARD_TYPE_NOT_FOUND
 *   TC-F071-08：prodKind 不在啟用期間內 → 422 VALIDATION_ERROR
 *   TC-F071-09/10：月名單分派鎖 → 409
 *   TC-F071-14：BR-4 ob_levelcard_version.card_name 不同步
 *   BE-F071-002：只更新 prodKind（cardName 不變）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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

describe('CardTypeService — F071 updateCardType', () => {
  let service: CardTypeService;
  let cardTypeRepo: any;
  let optionRepo: any;
  let runRepo: any;
  let userRepo: any;
  let auditRepo: any;
  let versionRepo: any;

  const actor = { userId: 'sm-uuid', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    cardTypeRepo = {
      findOne: vi.fn().mockResolvedValue({
        card_type: 'H',
        card_name: '期中',
        prod_kind: '01',
        status: 'active',
        updated_at: new Date(),
        updated_by: 'system',
      }),
      save: vi.fn(async (e: any) => ({ ...e, updated_at: new Date() })),
    };
    // v2.1 重構：prod_kind 來源從 ob_code_df 改 pooldata_field_option
    optionRepo = {
      findOne: vi.fn().mockResolvedValue({
        column_name: 'prod_kind',
        option_value: '01',
        option_label: '汽車',
        is_active: true,
      }),
    };
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'sm-uuid', name: 'SM' }),
    };
    auditRepo = {
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn((e: any) => Promise.resolve(e)),
    };
    versionRepo = { findOne: vi.fn(), save: vi.fn(), find: vi.fn() };

    const noop = { find: vi.fn(), findOne: vi.fn(), count: vi.fn(), save: vi.fn(), create: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardTypeService,
        { provide: getRepositoryToken(ObCardType), useValue: cardTypeRepo },
        { provide: getRepositoryToken(PooldataFieldOption), useValue: optionRepo },
        { provide: getRepositoryToken(ObLevelcardVersion), useValue: versionRepo },
        { provide: getRepositoryToken(ObLevelcardColumn), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardScore), useValue: noop },
        { provide: getRepositoryToken(ObLevelcardLevel), useValue: noop },
        { provide: getRepositoryToken(ObTier), useValue: noop },
        { provide: getRepositoryToken(ObListDefinition), useValue: noop },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DataSource, useValue: { transaction: vi.fn() } },
      ],
    }).compile();

    service = module.get(CardTypeService);
  });

  it('TC-F071-03：成功更新 card_name + prod_kind 並回 200', async () => {
    optionRepo.findOne.mockResolvedValue({
      column_name: 'prod_kind',
      option_value: '02',
      option_label: '機車',
      is_active: true,
    });

    const result = await service.updateCardType(
      'H',
      { cardName: '汽車高資產期中', prodKind: '02' },
      actor,
    );

    expect(result.cardType).toBe('H');
    expect(result.cardName).toBe('汽車高資產期中');
    expect(result.prodKind).toBe('02');
    expect(result.prodKindName).toBe('機車');

    expect(cardTypeRepo.save).toHaveBeenCalled();
    const saved = cardTypeRepo.save.mock.calls[0][0];
    expect(saved.card_name).toBe('汽車高資產期中');
    expect(saved.prod_kind).toBe('02');
    expect(saved.updated_by).toBe('sm-uuid');
  });

  it('TC-F071-04：audit_log action=UPDATE 含 before/after', async () => {
    await service.updateCardType(
      'H',
      { cardName: '新名稱', prodKind: '01' },
      actor,
    );

    expect(auditRepo.create).toHaveBeenCalled();
    const auditArg = auditRepo.create.mock.calls[0][0];
    expect(auditArg.action).toBe('UPDATE');
    expect(auditArg.entity_type).toBe('ob_card_type');
    expect(auditArg.entity_id).toBe('H');
    expect(auditArg.before_value).toMatchObject({ cardName: '期中', prodKind: '01' });
    expect(auditArg.after_value).toMatchObject({ cardName: '新名稱', prodKind: '01' });
  });

  it('TC-F071-07：cardType 不存在 → 404 CARD_TYPE_NOT_FOUND', async () => {
    cardTypeRepo.findOne.mockResolvedValue(null);

    try {
      await service.updateCardType(
        'NOTEXIST',
        { cardName: '測試', prodKind: '01' },
        actor,
      );
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse?.()?.error).toBe('CARD_TYPE_NOT_FOUND');
    }
  });

  it('TC-F071-08 v2.1：prodKind 不在 pooldata_field_option 啟用紀錄 → 422 VALIDATION_ERROR', async () => {
    optionRepo.findOne.mockResolvedValue(null);

    await expect(
      service.updateCardType('H', { cardName: '期中', prodKind: '99' }, actor),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('TC-F071-09：月名單分派鎖 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'r1', status: 'pending' });

    try {
      await service.updateCardType(
        'H',
        { cardName: '測試', prodKind: '01' },
        actor,
      );
      throw new Error('expected to throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse?.()?.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    }
  });

  it('TC-F071-14 + BR-4：ob_levelcard_version.card_name 不同步（service 不應 save versionRepo）', async () => {
    await service.updateCardType(
      'H',
      { cardName: '新名稱', prodKind: '01' },
      actor,
    );

    // 確認沒有對 versionRepo 進行 save / update
    expect(versionRepo.save).not.toHaveBeenCalled();
  });

  it('BE-F071-002：只更新 prodKind（cardName 不變仍 save 整列，行為等效）', async () => {
    cardTypeRepo.findOne.mockResolvedValue({
      card_type: 'H',
      card_name: '期中',
      prod_kind: '01',
      status: 'active',
      updated_at: new Date(),
      updated_by: 'system',
    });

    optionRepo.findOne.mockResolvedValue({
      column_name: 'prod_kind',
      option_value: '02',
      option_label: '機車',
      is_active: true,
    });

    await service.updateCardType(
      'H',
      { cardName: '期中', prodKind: '02' }, // cardName 同舊值
      actor,
    );

    const saved = cardTypeRepo.save.mock.calls[0][0];
    expect(saved.card_name).toBe('期中'); // 不變
    expect(saved.prod_kind).toBe('02'); // 改了

    // audit before/after 比對
    const auditArg = auditRepo.create.mock.calls[0][0];
    expect(auditArg.before_value).toMatchObject({ prodKind: '01' });
    expect(auditArg.after_value).toMatchObject({ prodKind: '02' });
  });
});
