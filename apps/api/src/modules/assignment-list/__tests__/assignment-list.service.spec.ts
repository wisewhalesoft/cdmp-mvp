/**
 * AssignmentListService — F048 / F050 / F051 / F052 / F077 service unit tests
 *
 * v2.1 migrate（2026-05-20 / Phase 5a 波 8）：
 *   - buildModule 註冊 PooldataFieldWhitelist
 *   - baseCreateDto / update inline DTO 全部移除 prodKind/caseYear/specTp/caseStatus/settleSrc 5 欄
 *   - 改用 conditionPayload schema（F050 v2.1 §5.4）
 *   - CASE_STATUS_REQUIRED 場景改為 conditions=[] → VALIDATION_ERROR
 *
 * 對應 spec：
 *   - F050 v2.1：建立草稿 — LIST_NO 自動產生、999 上限、prod_kind 交集唯一、
 *                conditionPayload 必填、月跑鎖
 *   - F051 v2.1：覆寫式編輯 — 404 / inactive / 4-state semantics / 衝突排除自身
 *   - F052 v2.0：軟刪除 — 重複停用阻擋、月跑鎖
 *   - 共通：assertNoRunningRun 頂層呼叫、audit log 寫入
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentListService } from '../assignment-list.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202605';
const ACTOR = {
  userId: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
  ipAddress: '127.0.0.1',
};

async function buildModule(): Promise<{
  service: AssignmentListService;
  listRepo: Repository<ObListDefinition>;
  auditRepo: Repository<AssignmentAuditLog>;
  runRepo: Repository<AssignmentRun>;
  whitelistRepo: Repository<PooldataFieldWhitelist>;
  ds: DataSource;
  app: TestingModule;
}> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ObListDefinition,
          AssignmentAuditLog,
          AssignmentRun,
          PooldataFieldOption,
          PooldataFieldWhitelist,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        AssignmentAuditLog,
        AssignmentRun,
        PooldataFieldOption,
        PooldataFieldWhitelist,
      ]),
    ],
    providers: [AssignmentListService, AssignmentRunGuardService],
  }).compile();

  await app.init();

  const ds = app.get(DataSource);
  const listRepo = ds.getRepository(ObListDefinition);
  const auditRepo = ds.getRepository(AssignmentAuditLog);
  const runRepo = ds.getRepository(AssignmentRun);
  const whitelistRepo = ds.getRepository(PooldataFieldWhitelist);
  const service = app.get(AssignmentListService);
  return { service, listRepo, auditRepo, runRepo, whitelistRepo, ds, app };
}

/**
 * v2.1 baseCreateDto：移除 5 個一級欄位、加 conditionPayload
 * 預設條件：prod_kind=['01']（與 fixture 衝突檢查相容）
 */
function baseCreateDto(overrides: Partial<any> = {}) {
  return {
    listNm: '車貸月跑名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: '01',
    prodBest: null,
    crEnabled: false,
    copyFromListNo: null,
    conditionPayload: {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    },
    ...overrides,
  };
}

/**
 * v2.1 baseUpdateDto：不含 copyFromListNo
 */
function baseUpdateDto(overrides: Partial<any> = {}) {
  return {
    listNm: '改名後',
    listPeriodStart: 2,
    listPeriodEnd: 8,
    listInterval: 1,
    cardType: '01',
    prodBest: null,
    crEnabled: true,
    conditionPayload: {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    },
    ...overrides,
  };
}

async function seedWhitelist(repo: Repository<PooldataFieldWhitelist>) {
  const now = new Date();
  const rows = [
    { column_name: 'prod_kind', field_type: 'categorical' as const, is_active: true },
    { column_name: 'caseyear', field_type: 'categorical' as const, is_active: true },
    { column_name: 'spec_tp', field_type: 'categorical' as const, is_active: true },
    { column_name: 'case_status', field_type: 'categorical' as const, is_active: true },
    { column_name: 'settle_src', field_type: 'categorical' as const, is_active: true },
  ];
  for (const r of rows) {
    await repo.save(
      repo.create({
        column_name: r.column_name,
        display_name: r.column_name,
        field_type: r.field_type,
        is_active: r.is_active,
        created_at: now,
        updated_at: now,
      } as Partial<PooldataFieldWhitelist>),
    );
  }
}

describe('AssignmentListService', () => {
  let app: TestingModule;
  let service: AssignmentListService;
  let listRepo: Repository<ObListDefinition>;
  let auditRepo: Repository<AssignmentAuditLog>;
  let runRepo: Repository<AssignmentRun>;
  let whitelistRepo: Repository<PooldataFieldWhitelist>;

  beforeAll(async () => {
    const built = await buildModule();
    app = built.app;
    service = built.service;
    listRepo = built.listRepo;
    auditRepo = built.auditRepo;
    runRepo = built.runRepo;
    whitelistRepo = built.whitelistRepo;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await auditRepo.clear();
    await listRepo.createQueryBuilder().delete().execute();
    await runRepo.clear();
    await whitelistRepo.clear();
    await seedWhitelist(whitelistRepo);
  });

  // =========================================================================
  // F050 — Create
  // =========================================================================

  describe('createList — F050 v2.1', () => {
    it('TC-M01-CREATE-001：成功新增 → list_no = OB{YM}001 + status=active + stage=draft', async () => {
      const res = await service.createList(baseCreateDto() as any, ACTOR, YM);
      expect(res.listNo).toBe('OB202605001');
      expect(res.status).toBe('active');
      expect(res.projectWorkym).toBe(YM);

      const saved = await listRepo.findOne({ where: { list_no: res.listNo } });
      expect(saved).not.toBeNull();
      expect(saved!.status).toBe('active');
      expect(saved!.stage).toBe('draft');
      expect(saved!.list_type).toBe('01'); // AC-2 後端固定
      expect(saved!.project_workym).toBe(YM);
    });

    it('TC-M01-CREATE-002：LIST_NO 自動遞增 OB{YM}001 → 002', async () => {
      const r1 = await service.createList(baseCreateDto() as any, ACTOR, YM);
      expect(r1.listNo).toBe('OB202605001');
      const r2 = await service.createList(
        baseCreateDto({ cardType: '02' }) as any,
        ACTOR,
        YM,
      );
      expect(r2.listNo).toBe('OB202605002');
    });

    it('TC-M01-CREATE-003：當月已 999 筆 → 422 LIST_NO_LIMIT_EXCEEDED', async () => {
      // 直接 seed 一筆 OB202605999 模擬上限
      await listRepo.save(
        listRepo.create({
          list_no: 'OB202605999',
          list_nm: 'last',
          prod_kind: 'ZZ', // 與新建 prod_kind=['01'] 無交集
          prod_best: '',
          spec_tp: null,
          list_type: '01',
          list_period_start: '1',
          list_period_end: '1',
          list_interval: '1',
          settle_src: null,
          card_type: '99',
          status: 'active',
          stage: 'draft',
          project_workym: YM,
          case_status: null,
          cr_enabled: false,
          condition_payload: null,
          created_by_prog: 'seed',
          created_by: 'seed',
          created_at: new Date(),
          updated_by_prog: 'seed',
          updated_by: 'seed',
          updated_at: new Date(),
        } as Partial<ObListDefinition>),
      );

      await expect(service.createList(baseCreateDto() as any, ACTOR, YM)).rejects.toThrow(
        UnprocessableEntityException,
      );
      try {
        await service.createList(baseCreateDto() as any, ACTOR, YM);
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.LIST_NO_LIMIT_EXCEEDED);
      }
    });

    it('TC-M01-CREATE-004：prod_kind 交集衝突 → 422 LIST_NO_DUPLICATE', async () => {
      await service.createList(baseCreateDto() as any, ACTOR, YM);
      // 第二個用同 cardType + 同 prod_kind 條件，應交集衝突
      await expect(
        service.createList(baseCreateDto() as any, ACTOR, YM),
      ).rejects.toThrow(UnprocessableEntityException);
      try {
        await service.createList(baseCreateDto() as any, ACTOR, YM);
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.LIST_NO_DUPLICATE);
        expect(e.response.message).toContain('OB202605001');
      }
    });

    it('TC-M01-CREATE-005：conditions=[] → 422 VALIDATION_ERROR（v2.1 取代 CASE_STATUS_REQUIRED）', async () => {
      try {
        await service.createList(
          baseCreateDto({ conditionPayload: { conditions: [], logic: 'AND' } }) as any,
          ACTOR,
          YM,
        );
        expect.fail('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(UnprocessableEntityException);
        expect(e.response.error).toBe(ERROR_CODES.VALIDATION_ERROR);
      }
    });

    it('TC-M01-CREATE-006：月跑執行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      await runRepo.save({
        run_id: 'r-running-001',
        project_workym: YM,
        triggered_by: ACTOR.userId,
        status: 'running',
        created_at: new Date(),
      } as any);

      await expect(service.createList(baseCreateDto() as any, ACTOR, YM)).rejects.toThrow(
        ConflictException,
      );
    });

    it('TC-M01-CREATE-007：寫入 audit log（action=CREATE）', async () => {
      const res = await service.createList(baseCreateDto() as any, ACTOR, YM);
      const logs = await auditRepo.find({
        where: { entity_type: 'ob_list_definition', entity_id: res.listNo },
      });
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('CREATE');
      expect(logs[0].actor_id).toBe(ACTOR.userId);
    });
  });

  // =========================================================================
  // F051 — Update（v2.1）
  // =========================================================================

  describe('updateList — F051 v2.1', () => {
    async function seedActive() {
      const r = await service.createList(baseCreateDto() as any, ACTOR, YM);
      return r.listNo;
    }

    it('TC-M01-UPDATE-001：成功覆寫 + audit log（action=UPDATE）', async () => {
      const listNo = await seedActive();
      const res = await service.updateList(
        listNo,
        baseUpdateDto({ listNm: '改名後' }) as any,
        ACTOR,
      );
      expect(res.listNo).toBe(listNo);
      expect(res.listNm).toBe('改名後');

      const updated = await listRepo.findOne({ where: { list_no: listNo } });
      expect(updated?.list_nm).toBe('改名後');
      expect(updated?.list_period_end).toBe('8');

      const logs = await auditRepo.find({ where: { entity_id: listNo } });
      const updateLog = logs.find((l) => l.action === 'UPDATE');
      expect(updateLog).toBeDefined();
    });

    it('TC-M01-UPDATE-002：list_no 不存在 → 404 ASSIGNMENT_LIST_NOT_FOUND', async () => {
      await expect(
        service.updateList('OB202605888', baseUpdateDto() as any, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('TC-M01-UPDATE-003：status=inactive → 422 ASSIGNMENT_LIST_INACTIVE', async () => {
      const listNo = await seedActive();
      await service.disableList(listNo, ACTOR);
      try {
        await service.updateList(listNo, baseUpdateDto() as any, ACTOR);
        expect.fail('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(UnprocessableEntityException);
        expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_LIST_INACTIVE);
      }
    });

    it('TC-M01-UPDATE-004：conditions=[] → 422 VALIDATION_ERROR（v2.1 取代 CASE_STATUS_REQUIRED）', async () => {
      const listNo = await seedActive();
      try {
        await service.updateList(
          listNo,
          baseUpdateDto({ conditionPayload: { conditions: [], logic: 'AND' } }) as any,
          ACTOR,
        );
        expect.fail('should have thrown');
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.VALIDATION_ERROR);
      }
    });

    it('TC-M01-UPDATE-005：prod_kind+cardType 衝突排除自身（同一 list 可保存）', async () => {
      const listNo = await seedActive();
      // 同 prod_kind + card_type 但只是換 list_nm，不應衝突（excludeListNo 自身）
      const res = await service.updateList(
        listNo,
        baseUpdateDto({ listNm: '改名' }) as any,
        ACTOR,
      );
      expect(res.listNo).toBe(listNo);
    });

    it('TC-M01-UPDATE-006：衝突其他 list → 422 LIST_NO_DUPLICATE', async () => {
      const listA = await seedActive();
      const listB = await service.createList(
        baseCreateDto({
          cardType: '02',
          conditionPayload: {
            conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      // 將 listB 改為與 listA 同 cardType=01 + prod_kind=['01']（交集衝突）
      try {
        await service.updateList(
          listB.listNo,
          baseUpdateDto({
            cardType: '01',
            conditionPayload: {
              conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
              logic: 'AND',
            },
          }) as any,
          ACTOR,
        );
        expect.fail('should have thrown');
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.LIST_NO_DUPLICATE);
        expect(e.response.message).toContain(listA);
      }
    });

    it('TC-M01-UPDATE-007：月跑執行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      const listNo = await seedActive();
      await runRepo.save({
        run_id: 'r-002',
        project_workym: YM,
        triggered_by: ACTOR.userId,
        status: 'pending',
        created_at: new Date(),
      } as any);
      await expect(
        service.updateList(listNo, baseUpdateDto() as any, ACTOR),
      ).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // F052 — Disable
  // =========================================================================

  describe('disableList — F052 v2.0', () => {
    async function seedActive() {
      const r = await service.createList(baseCreateDto() as any, ACTOR, YM);
      return r.listNo;
    }

    it('TC-M01-DISABLE-001：成功 status active → inactive + audit log', async () => {
      const listNo = await seedActive();
      const res = await service.disableList(listNo, ACTOR);
      expect(res.status).toBe('inactive');

      const updated = await listRepo.findOne({ where: { list_no: listNo } });
      expect(updated?.status).toBe('inactive');

      const logs = await auditRepo.find({ where: { entity_id: listNo } });
      const disableLog = logs.find(
        (l) =>
          l.action === 'UPDATE' &&
          (l.before_value as any)?._operation === 'DISABLE',
      );
      expect(disableLog).toBeDefined();
    });

    it('TC-M01-DISABLE-002：list_no 不存在 → 404 ASSIGNMENT_LIST_NOT_FOUND', async () => {
      try {
        await service.disableList('OB202605888', ACTOR);
        expect.fail('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND);
      }
    });

    it('TC-M01-DISABLE-003：重複停用 → 422 ASSIGNMENT_LIST_ALREADY_INACTIVE', async () => {
      const listNo = await seedActive();
      await service.disableList(listNo, ACTOR);
      try {
        await service.disableList(listNo, ACTOR);
        expect.fail('should have thrown');
      } catch (e: any) {
        expect(e.response.error).toBe(
          ERROR_CODES.ASSIGNMENT_LIST_ALREADY_INACTIVE,
        );
      }
    });

    it('TC-M01-DISABLE-004：月跑執行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      const listNo = await seedActive();
      await runRepo.save({
        run_id: 'r-003',
        project_workym: YM,
        triggered_by: ACTOR.userId,
        status: 'running',
        created_at: new Date(),
      } as any);
      await expect(service.disableList(listNo, ACTOR)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // =========================================================================
  // F048 / F077 — List
  // =========================================================================

  describe('listLists — F048 v2.0 / F077 v1.2', () => {
    it('TC-M01-LIST-001：回傳當月 active 名單列表 + lockState.locked=false', async () => {
      await service.createList(baseCreateDto() as any, ACTOR, YM);
      const res = await service.listLists({ ym: YM });
      expect(res.lists.length).toBe(1);
      expect(res.lockState.locked).toBe(false);
      expect(res.selectedYm).toBe(YM);
      expect(res.stageCounts.draft).toBe(1);
    });

    it('TC-M01-LIST-002：預設不顯示已停用名單', async () => {
      const r = await service.createList(baseCreateDto() as any, ACTOR, YM);
      await service.disableList(r.listNo, ACTOR);
      const res = await service.listLists({ ym: YM });
      expect(res.lists.length).toBe(0);
      expect(res.stageCounts.disabled).toBe(0);
    });

    it('TC-M01-LIST-003：includeDisabled=true 回傳已停用 + stageCounts.disabled=1', async () => {
      const r = await service.createList(baseCreateDto() as any, ACTOR, YM);
      await service.disableList(r.listNo, ACTOR);
      const res = await service.listLists({ ym: YM, includeDisabled: true });
      expect(res.lists.length).toBe(1);
      expect(res.lists[0].status).toBe('inactive');
      expect(res.stageCounts.disabled).toBe(1);
    });

    it('TC-M01-LIST-004：月跑執行中 → lockState.locked=true', async () => {
      await runRepo.save({
        run_id: 'r-004',
        project_workym: YM,
        triggered_by: ACTOR.userId,
        status: 'running',
        created_at: new Date(),
      } as any);
      const res = await service.listLists({ ym: YM });
      expect(res.lockState.locked).toBe(true);
      expect(res.lockState.reason).toBe('分派執行中');
    });

    it('TC-M01-LIST-005：stage 篩選器只回傳指定 stage', async () => {
      await service.createList(baseCreateDto() as any, ACTOR, YM);
      const all = await service.listLists({ ym: YM, stages: ['draft'] });
      expect(all.lists.length).toBe(1);
      const none = await service.listLists({ ym: YM, stages: ['ready'] });
      expect(none.lists.length).toBe(0);
    });

    // v2.1 衍生欄位驗證：listLists 仍回傳 5 個 backward-compat 欄位（由 createList 衍生填入）
    it('v2.1：listLists 回傳衍生 case_status / cr_enabled 欄位', async () => {
      await service.createList(
        baseCreateDto({
          crEnabled: true,
          conditionPayload: {
            conditions: [
              { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
              { columnName: 'case_status', fieldType: 'categorical', values: ['01', '02'] },
            ],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      const res = await service.listLists({ ym: YM });
      expect(res.lists.length).toBe(1);
      expect(res.lists[0].caseStatus).toBe('01$$02');
      expect(res.lists[0].crEnabled).toBe(true);
    });

    it('v2.1：crEnabled=false 預設值正確回傳', async () => {
      await service.createList(
        baseCreateDto({ crEnabled: false }) as any,
        ACTOR,
        YM,
      );
      const res = await service.listLists({ ym: YM });
      expect(res.lists[0].crEnabled).toBe(false);
    });
  });
});
