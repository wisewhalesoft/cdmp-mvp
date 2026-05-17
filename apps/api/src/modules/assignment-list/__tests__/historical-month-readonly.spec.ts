/**
 * AssignmentListService — 歷史月份寫入攔截（E07 重構 P1 B2 補完）
 *
 * 對應 spec：
 *   - error-handling.md v1.14 §LIST_HISTORICAL_READONLY（403）
 *   - F077 v1.2 §6 BR-3：歷史月份資料為唯讀
 *
 * 涵蓋 case：
 *   1) updateList：existing.project_workym < currentWorkYm → 403 LIST_HISTORICAL_READONLY
 *   2) updateList：existing.project_workym === currentWorkYm → 通過（不攔截）
 *   3) updateList：existing.project_workym > currentWorkYm（未來月）→ 通過（不攔截）
 *   4) updateList：未傳入 currentWorkYm（向下相容舊呼叫）→ 跳過檢查
 *   5) disableList：existing.project_workym < currentWorkYm → 403 LIST_HISTORICAL_READONLY
 *   6) disableList：existing.project_workym === currentWorkYm → 通過
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentListService } from '../assignment-list.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const HISTORICAL_YM = '202504'; // 歷史月份
const CURRENT_YM = '202605';
const FUTURE_YM = '202607';

const ACTOR = {
  userId: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
  ipAddress: '127.0.0.1',
};

function fullUpdateDto(overrides: Partial<any> = {}) {
  return {
    listNm: '改名後',
    prodKind: '01',
    caseYear: '1',
    specTp: 'S1',
    caseStatus: '01',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    settleSrc: 'Y',
    cardType: '01',
    prodBest: null,
    crEnabled: false,
    ...overrides,
  };
}

describe('AssignmentListService — historical month readonly (TC-M01-HIST)', () => {
  let app: TestingModule;
  let service: AssignmentListService;
  let listRepo: Repository<ObListDefinition>;
  let auditRepo: Repository<AssignmentAuditLog>;
  let runRepo: Repository<AssignmentRun>;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          ObListDefinition,
          AssignmentAuditLog,
          AssignmentRun,
          PooldataFieldOption,
        ]),
      ],
      providers: [AssignmentListService, AssignmentRunGuardService],
    }).compile();
    await app.init();

    const ds = app.get(DataSource);
    listRepo = ds.getRepository(ObListDefinition);
    auditRepo = ds.getRepository(AssignmentAuditLog);
    runRepo = ds.getRepository(AssignmentRun);
    service = app.get(AssignmentListService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await auditRepo.clear();
    await listRepo.createQueryBuilder().delete().execute();
    await runRepo.clear();
  });

  async function seedList(ym: string): Promise<string> {
    const listNo = `OB${ym}001`;
    await listRepo.save(
      listRepo.create({
        list_no: listNo,
        list_nm: 'seed',
        prod_kind: '01',
        prod_best: '',
        spec_tp: 'S1',
        list_type: '01',
        list_period_start: '1',
        list_period_end: '6',
        list_interval: '1',
        settle_src: 'Y',
        card_type: '01',
        case_status: '01',
        cr_enabled: false,
        status: 'active',
        stage: 'draft',
        project_workym: ym,
        created_by_prog: 'seed',
        created_by: 'seed',
        created_at: new Date(),
        updated_by_prog: 'seed',
        updated_by: 'seed',
        updated_at: new Date(),
      } as Partial<ObListDefinition>),
    );
    return listNo;
  }

  describe('updateList', () => {
    it('1) 歷史月份名單 → 403 LIST_HISTORICAL_READONLY', async () => {
      const listNo = await seedList(HISTORICAL_YM);
      try {
        await service.updateList(listNo, fullUpdateDto(), ACTOR, CURRENT_YM);
        expect.fail('應拋出 ForbiddenException');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(e.response.error).toBe(ERROR_CODES.LIST_HISTORICAL_READONLY);
      }
    });

    it('2) 當月名單 → 不攔截（成功通過）', async () => {
      const listNo = await seedList(CURRENT_YM);
      const res = await service.updateList(
        listNo,
        fullUpdateDto(),
        ACTOR,
        CURRENT_YM,
      );
      expect(res.listNo).toBe(listNo);
    });

    it('3) 未來月份名單 → 不攔截（成功通過）', async () => {
      const listNo = await seedList(FUTURE_YM);
      const res = await service.updateList(
        listNo,
        fullUpdateDto(),
        ACTOR,
        CURRENT_YM,
      );
      expect(res.listNo).toBe(listNo);
    });

    it('4) 向下相容：未傳入 currentWorkYm 跳過歷史檢查', async () => {
      const listNo = await seedList(HISTORICAL_YM);
      const res = await service.updateList(listNo, fullUpdateDto(), ACTOR);
      expect(res.listNo).toBe(listNo);
    });
  });

  describe('disableList', () => {
    it('5) 歷史月份名單 → 403 LIST_HISTORICAL_READONLY', async () => {
      const listNo = await seedList(HISTORICAL_YM);
      try {
        await service.disableList(listNo, ACTOR, CURRENT_YM);
        expect.fail('應拋出 ForbiddenException');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(e.response.error).toBe(ERROR_CODES.LIST_HISTORICAL_READONLY);
      }
    });

    it('6) 當月名單 → 成功停用', async () => {
      const listNo = await seedList(CURRENT_YM);
      const res = await service.disableList(listNo, ACTOR, CURRENT_YM);
      expect(res.status).toBe('inactive');
    });
  });
});
