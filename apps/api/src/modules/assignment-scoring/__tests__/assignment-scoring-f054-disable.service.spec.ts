/**
 * F054：AssignmentScoringService.disableDimension Unit Tests
 *
 *   - TS-F054-007：成功 disable → status='inactive'，scores 資料不刪
 *   - TS-F054-008：audit_log 記 DISABLE，entity_type='ob_levelcard_column'，before.status='active' / after.status='inactive'
 *   - TS-F054-009：disable 後 status 已是 inactive（跨 F053 GET 不再回傳）— 由 e2e 串聯驗
 *   - BE-F054-003：重複 disable 已 inactive 維度 → 404 SCORING_COLUMN_NOT_FOUND（findOne 過濾 active）
 *   - AC-5：月跑鎖 → 409 SCORING_VERSION_LOCKED
 *   - 不存在的 column → 404 SCORING_COLUMN_NOT_FOUND
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
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

describe('AssignmentScoringService — F054 disableDimension', () => {
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
    columnRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      save: vi.fn((e: any) => Promise.resolve(e)),
      create: vi.fn((d: any) => ({ ...d })),
    };
    scoreRepo = { delete: vi.fn(), find: vi.fn(), save: vi.fn(), create: vi.fn() };
    levelRepo = { find: vi.fn() };
    tierRepo = { find: vi.fn(), findOne: vi.fn() };
    poolDataListRepo = { find: vi.fn().mockResolvedValue([]) };
    runRepo = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    versionRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1, status: 'active',
      card_name: '期中', sdate: '20190823', edate: '20991231',
    });
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

  it('TS-F054-007：成功 disable → column.status=inactive，scores 不刪', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1,
      column_name: 'ACCOUNT_AGE', column_label: '帳齡', status: 'active',
    });

    const result = await service.disableDimension('H', 'ACCOUNT_AGE', actor);

    expect(result).toMatchObject({
      cardType: 'H',
      cardVersion: 1,
      columnName: 'ACCOUNT_AGE',
      status: 'inactive',
    });
    expect(result.disabledAt).toMatch(/\d{4}-\d{2}-\d{2}T/);

    // column 被 save 且 status 改為 inactive
    expect(columnRepo.save).toHaveBeenCalled();
    const savedColumn = columnRepo.save.mock.calls[0][0];
    expect(savedColumn.status).toBe('inactive');

    // scores 不應被刪
    expect(scoreRepo.delete).not.toHaveBeenCalled();
  });

  it('TS-F054-008：audit_log 記 DISABLE，before.status=active / after.status=inactive', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1,
      column_name: 'ACCOUNT_AGE', column_label: '帳齡', status: 'active',
    });

    await service.disableDimension('H', 'ACCOUNT_AGE', actor);

    expect(auditRepo.create).toHaveBeenCalled();
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('DISABLE');
    expect(log.entity_type).toBe('ob_levelcard_column');
    expect(log.entity_id).toBe('H|1|ACCOUNT_AGE');
    expect(log.before_value).toMatchObject({ status: 'active' });
    expect(log.after_value).toMatchObject({ status: 'inactive' });
  });

  it('BE-F054-003：重複 disable 已 inactive 維度 → 404 SCORING_COLUMN_NOT_FOUND', async () => {
    columnRepo.findOne.mockResolvedValue(null); // findOne where status='active' 找不到

    try {
      await service.disableDimension('H', 'ACCOUNT_AGE', actor);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('SCORING_COLUMN_NOT_FOUND');
    }
    expect(auditRepo.create).not.toHaveBeenCalled();
  });

  it('AC-5：月跑鎖 → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'r1', status: 'running' });

    await expect(
      service.disableDimension('H', 'ACCOUNT_AGE', actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('不存在的 column → 404 SCORING_COLUMN_NOT_FOUND', async () => {
    columnRepo.findOne.mockResolvedValue(null);
    try {
      await service.disableDimension('H', 'NOT_EXIST', actor);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse().error).toBe('SCORING_COLUMN_NOT_FOUND');
    }
  });

  it('findOne 過濾必含 status=active（避免回退已停用的）', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1,
      column_name: 'ACCOUNT_AGE', column_label: '帳齡', status: 'active',
    });
    await service.disableDimension('H', 'ACCOUNT_AGE', actor);

    const findArgs = columnRepo.findOne.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      column_name: 'ACCOUNT_AGE',
      status: 'active',
    });
  });
});
