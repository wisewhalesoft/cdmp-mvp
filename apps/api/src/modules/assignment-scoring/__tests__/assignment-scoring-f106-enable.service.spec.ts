/**
 * F106：AssignmentScoringService.enableDimension Unit Tests（對稱 disable）
 *
 *   - TS-F106-001：成功 enable → status='active'，回 enabledAt
 *   - TS-F106-002：audit_log 記 ENABLE，entity_type='ob_levelcard_column'，
 *                  before.status='inactive' / after.status='active'，entity_id='{cardType}|{cardVersion}|{columnName}'
 *   - TS-F106-003（BR-3）：對已 active 維度 enable → 404 SCORING_COLUMN_NOT_FOUND（findOne 過濾 inactive 找不到）
 *   - TS-F106-004（AC-5）：月名單分派鎖 → 409 SCORING_VERSION_LOCKED
 *   - TS-F106-005：不存在的 column → 404 SCORING_COLUMN_NOT_FOUND
 *   - TS-F106-006：findOne 過濾必含 status='inactive'（方向相反 disable）
 *   - TS-F106-007（§5.3 EQ）：disable → enable → disable 往返後狀態 / audit 軌跡逐項對稱
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
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('AssignmentScoringService — F106 enableDimension', () => {
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
    runRepo = { findOne: vi.fn().mockResolvedValue(null) };
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
        { provide: getRepositoryToken(ObCardType), useValue: {
          findOne: vi.fn().mockImplementation(({ where }: any) =>
            Promise.resolve({
              card_type: where.card_type,
              card_name: 'mock',
              prod_kind: '01',
              status: 'active',
            }),
          ),
        } },
        { provide: getRepositoryToken(ObPoolDataList), useValue: poolDataListRepo },
        { provide: getRepositoryToken(AssignmentRun), useValue: runRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(AssignmentScoringService);
  });

  it('TS-F106-001：成功 enable → column.status=active，回 enabledAt', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1,
      column_name: 'SALES_STS', column_label: '業務狀態', status: 'inactive',
    });

    const result = await service.enableDimension('H', 'SALES_STS', actor);

    expect(result).toMatchObject({
      cardType: 'H',
      cardVersion: 1,
      columnName: 'SALES_STS',
      status: 'active',
    });
    expect(result.enabledAt).toMatch(/\d{4}-\d{2}-\d{2}T/);

    // column 被 save 且 status 改為 active
    expect(columnRepo.save).toHaveBeenCalled();
    const savedColumn = columnRepo.save.mock.calls[0][0];
    expect(savedColumn.status).toBe('active');

    // scores 不應被刪
    expect(scoreRepo.delete).not.toHaveBeenCalled();
  });

  it('TS-F106-002：audit_log 記 ENABLE，before.status=inactive / after.status=active', async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1,
      column_name: 'SALES_STS', column_label: '業務狀態', status: 'inactive',
    });

    await service.enableDimension('H', 'SALES_STS', actor);

    expect(auditRepo.create).toHaveBeenCalled();
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('ENABLE');
    expect(log.entity_type).toBe('ob_levelcard_column');
    expect(log.entity_id).toBe('H|1|SALES_STS');
    expect(log.before_value).toMatchObject({ status: 'inactive' });
    expect(log.after_value).toMatchObject({ status: 'active' });
  });

  it('TS-F106-003（BR-3）：對已 active 維度 enable → 404 SCORING_COLUMN_NOT_FOUND', async () => {
    // findOne where status='inactive' 找不到（該維度已是 active）
    columnRepo.findOne.mockResolvedValue(null);

    try {
      await service.enableDimension('H', 'ACCOUNT_AGE', actor);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(e.getResponse().error).toBe('SCORING_COLUMN_NOT_FOUND');
    }
    expect(auditRepo.create).not.toHaveBeenCalled();
  });

  it('TS-F106-004（AC-5）：月名單分派鎖 → 409 SCORING_VERSION_LOCKED', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'r1', status: 'running' });

    await expect(
      service.enableDimension('H', 'SALES_STS', actor),
    ).rejects.toBeInstanceOf(ConflictException);
    try {
      await service.enableDimension('H', 'SALES_STS', actor);
    } catch (e: any) {
      expect(e.getResponse().error).toBe('SCORING_VERSION_LOCKED');
    }
  });

  it('TS-F106-005：不存在的 column → 404 SCORING_COLUMN_NOT_FOUND', async () => {
    columnRepo.findOne.mockResolvedValue(null);
    try {
      await service.enableDimension('H', 'NOT_EXIST', actor);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse().error).toBe('SCORING_COLUMN_NOT_FOUND');
    }
  });

  it("TS-F106-006：findOne 過濾必含 status='inactive'（方向相反 disable）", async () => {
    columnRepo.findOne.mockResolvedValue({
      card_type: 'H', card_version: 1,
      column_name: 'SALES_STS', column_label: '業務狀態', status: 'inactive',
    });
    await service.enableDimension('H', 'SALES_STS', actor);

    const findArgs = columnRepo.findOne.mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      card_type: 'H',
      column_name: 'SALES_STS',
      status: 'inactive',
    });
  });

  it('TS-F106-007（§5.3 EQ）：disable → enable → disable 往返狀態 / audit 軌跡對稱', async () => {
    // 模擬可變狀態的單一 column 紀錄
    const col = {
      card_type: 'H', card_version: 1,
      column_name: 'SALES_STS', column_label: '業務狀態', status: 'active',
    };
    // disable 用 findOne(status='active')，enable 用 findOne(status='inactive')；
    // 依當前 col.status 回傳對應結果，模擬真實 DB 行為。
    columnRepo.findOne.mockImplementation(({ where }: any) =>
      Promise.resolve(col.status === where.status ? col : null),
    );

    // 1) disable：active → inactive
    const d1 = await service.disableDimension('H', 'SALES_STS', actor);
    expect(d1.status).toBe('inactive');
    expect(d1).toHaveProperty('disabledAt');
    col.status = 'inactive';

    // 2) enable：inactive → active
    const e1 = await service.enableDimension('H', 'SALES_STS', actor);
    expect(e1.status).toBe('active');
    expect(e1).toHaveProperty('enabledAt');
    col.status = 'active';

    // 3) disable：active → inactive（再次成功）
    const d2 = await service.disableDimension('H', 'SALES_STS', actor);
    expect(d2.status).toBe('inactive');
    col.status = 'inactive';

    // audit 軌跡逐項對稱：DISABLE / ENABLE / DISABLE，entity_id 相同格式
    const actions = auditRepo.create.mock.calls.map((c: any[]) => c[0].action);
    expect(actions).toEqual(['DISABLE', 'ENABLE', 'DISABLE']);

    const logs = auditRepo.create.mock.calls.map((c: any[]) => c[0]);
    // 全部 entity_id 相同格式且相同字串
    for (const log of logs) {
      expect(log.entity_type).toBe('ob_levelcard_column');
      expect(log.entity_id).toBe('H|1|SALES_STS');
    }
    // 方向相反：DISABLE before active/after inactive；ENABLE before inactive/after active
    expect(logs[0].before_value).toMatchObject({ status: 'active' });
    expect(logs[0].after_value).toMatchObject({ status: 'inactive' });
    expect(logs[1].before_value).toMatchObject({ status: 'inactive' });
    expect(logs[1].after_value).toMatchObject({ status: 'active' });
    expect(logs[2].before_value).toMatchObject({ status: 'active' });
    expect(logs[2].after_value).toMatchObject({ status: 'inactive' });
  });
});
