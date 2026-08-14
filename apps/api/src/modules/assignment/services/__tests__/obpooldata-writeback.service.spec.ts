/**
 * ObpooldataWritebackService — F115 分派結果回寫外部 OBPOOLDATA_LIST
 *
 * 對應 spec：docs/specs/features/F115-writeback-obpooldata-list.md §7.1
 *   - TC-WB-PREVIEW-001：preview 回 totalToWrite / byListNo / sample / notMatched=null / connectionAvailable
 *   - TC-WB-PREVIEW-002：連線探測失敗 → connectionAvailable=false（優雅降級）
 *   - TC-WB-PREVIEW-003：連線可用但無 UPDATE 權限 → writePermission=false（供前端先行擋下）
 *   - TC-WB-PREVIEW-004：權限探測本身失敗 → writePermission=null（未知，不誤擋）
 *   - TC-WB-EXEC-001：confirm 缺 → 422 WRITEBACK_CONFIRM_REQUIRED
 *   - TC-WB-EXEC-002：外部連線未設定 → 422 WRITEBACK_CONNECTION_NOT_CONFIGURED
 *   - TC-WB-EXEC-003：成功回寫 → updated/notMatched 正確、result_status 轉 SUCCESS/FAILED、稽核 WRITEBACK
 *   - TC-WB-EXEC-004：run 不存在 → 404；未完成 → 422 NOT_COMPLETED
 *   - TC-WB-EXEC-005：外部拒絕 UPDATE（SQL 229）→ 422 WRITEBACK_PERMISSION_DENIED，且 result_status
 *     維持 PENDING、不寫稽核、連線已關閉（2026-08-14 事故：原本冒泡成無資訊 500）
 *   - TC-WB-EXEC-006：其他外部寫入錯誤 → 422 WRITEBACK_EXTERNAL_WRITE_FAILED（附驅動訊息）
 *   - TC-WB-BATCH-001：writeBatches 以 fake pool 發出含 OBPOOLDATA_LIST 的 UPDATE，正確彙總 matched/not-matched
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ObpooldataWritebackService } from '../obpooldata-writeback.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const RUN_ID = '0b3a5196-047d-f111-80a2-00155dc92813';

interface Env {
  service: ObpooldataWritebackService;
  runRepo: Repository<AssignmentRun>;
  resultRepo: Repository<ObMonthlyRunResult>;
  auditRepo: Repository<AssignmentAuditLog>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [AssignmentRun, ObMonthlyRunResult, AssignmentAuditLog, Datasource, User],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        AssignmentRun,
        ObMonthlyRunResult,
        AssignmentAuditLog,
        Datasource,
        User,
      ]),
    ],
    providers: [ObpooldataWritebackService],
  }).compile();
  await app.init();
  return {
    service: app.get(ObpooldataWritebackService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    resultRepo: app.get(getRepositoryToken(ObMonthlyRunResult)),
    auditRepo: app.get(getRepositoryToken(AssignmentAuditLog)),
    app,
  };
}

async function seedRun(env: Env, status = 'completed'): Promise<void> {
  await env.runRepo.save(
    env.runRepo.create({
      run_id: RUN_ID,
      project_workym: '202607',
      triggered_by: 'u-director',
      status: status as AssignmentRun['status'],
      total_cases: 3,
      created_at: new Date('2026-07-11T08:43:28Z'),
    } as Partial<AssignmentRun>),
  );
}

async function seedResults(env: Env): Promise<void> {
  const mk = (applNo: string, listNo: string, emplid: string) =>
    env.resultRepo.create({
      run_id: RUN_ID,
      list_no: listNo,
      orgno: '02',
      appl_no: applNo,
      custo_no: `C-${applNo}`,
      dept_id: 'D01',
      emplid,
      emplid_deptid: 'D01',
      assignday: '20260701',
      card_level: 'A',
      tier_level: 'T1',
      is_cr: 'N',
      result_status: 'PENDING',
    } as Partial<ObMonthlyRunResult>);
  await env.resultRepo.save([
    mk('A1', 'OB202607001', '20742'),
    mk('A2', 'OB202607001', '20742'),
    mk('A3', 'OB202607002', '20815'),
  ]);
}

/** Fake mssql pool：query 依序回傳預設 recordset（not-matched keys）。 */
function makeFakePool(recordsetsPerQuery: Array<Array<Record<string, string>>>) {
  const queries: string[] = [];
  let idx = 0;
  return {
    queries,
    closed: false,
    request() {
      return {
        input() {
          return this;
        },
        async query(sql: string) {
          queries.push(sql);
          const rs = recordsetsPerQuery[idx++] ?? [];
          return { recordset: rs, rowsAffected: [rs.length] };
        },
      };
    },
    async close() {
      this.closed = true;
    },
  };
}

/** Fake mssql pool：query 一律拋出指定錯誤（模擬外部庫拒絕 / 驅動錯誤）。 */
function makeThrowingPool(error: unknown) {
  return {
    closed: false,
    request() {
      return {
        input() {
          return this;
        },
        async query() {
          throw error;
        },
      };
    },
    async close() {
      this.closed = true;
    },
  };
}

/** mssql `RequestError` 形狀（權限不足：SQL Server error 229）。 */
function makePermissionDeniedError() {
  const err = new Error(
    "The UPDATE permission was denied on the object 'OBPOOLDATA_LIST', database 'OB', schema 'dbo'.",
  ) as Error & { code: string; number: number };
  err.name = 'RequestError';
  err.code = 'EREQUEST';
  err.number = 229;
  return err;
}

describe('ObpooldataWritebackService (F115)', () => {
  let env: Env;

  beforeEach(async () => {
    env = await buildModule();
  });

  afterEach(async () => {
    await env.app.close();
    vi.restoreAllMocks();
  });

  describe('preview', () => {
    it('TC-WB-PREVIEW-001：回 totalToWrite / byListNo / sample / notMatched=null / connectionAvailable', async () => {
      await seedRun(env);
      await seedResults(env);
      vi.spyOn(env.service as any, 'probeExternal').mockResolvedValue({
        connectionAvailable: true,
        writePermission: true,
      });

      const res = await env.service.preview(RUN_ID, null);
      expect(res.totalToWrite).toBe(3);
      expect(res.byListNo).toEqual([
        { listNo: 'OB202607001', count: 2 },
        { listNo: 'OB202607002', count: 1 },
      ]);
      expect(res.sample.length).toBe(3);
      expect(res.sample[0].applNo).toBe('A1');
      expect(res.notMatched).toBeNull();
      expect(res.connectionAvailable).toBe(true);
      expect(res.writePermission).toBe(true);
    });

    it('TC-WB-PREVIEW-002：連線探測失敗 → connectionAvailable=false、writePermission=null', async () => {
      await seedRun(env);
      await seedResults(env);
      vi.spyOn(env.service as any, 'openExternalPool').mockRejectedValue(
        new Error('connect ETIMEDOUT'),
      );
      const res = await env.service.preview(RUN_ID, null);
      expect(res.connectionAvailable).toBe(false);
      expect(res.writePermission).toBeNull();
    });

    it('TC-WB-PREVIEW-003：連線可用但無 UPDATE 權限 → writePermission=false', async () => {
      await seedRun(env);
      await seedResults(env);
      // SELECT 1 → ok；fn_my_permissions 探測 → can_update=0
      const fakePool = makeFakePool([[{ ok: '1' }], [{ can_update: '0' }]]);
      vi.spyOn(env.service as any, 'openExternalPool').mockResolvedValue(fakePool);

      const res = await env.service.preview(RUN_ID, null);
      expect(res.connectionAvailable).toBe(true);
      expect(res.writePermission).toBe(false);
      // 探測必須是唯讀的：不得對目標表發出任何 DML
      const sql = fakePool.queries.join('\n');
      expect(sql).toMatch(/fn_my_permissions/i);
      expect(sql).not.toMatch(
        /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(dbo\.)?OBPOOLDATA_LIST/i,
      );
      expect(fakePool.closed).toBe(true);
    });

    it('TC-WB-PREVIEW-004：權限探測失敗 → writePermission=null（未知，不誤擋）', async () => {
      await seedRun(env);
      await seedResults(env);
      let call = 0;
      const flakyPool = {
        closed: false,
        request() {
          return {
            input() {
              return this;
            },
            async query() {
              call += 1;
              if (call === 1) return { recordset: [{ ok: 1 }] };
              throw new Error("The user does not have permission to perform this action.");
            },
          };
        },
        async close() {
          this.closed = true;
        },
      };
      vi.spyOn(env.service as any, 'openExternalPool').mockResolvedValue(flakyPool);

      const res = await env.service.preview(RUN_ID, null);
      expect(res.connectionAvailable).toBe(true);
      expect(res.writePermission).toBeNull();
      expect(flakyPool.closed).toBe(true);
    });
  });

  describe('execute', () => {
    it('TC-WB-EXEC-001：confirm 缺 → 422 WRITEBACK_CONFIRM_REQUIRED', async () => {
      await seedRun(env);
      await seedResults(env);
      await expect(env.service.execute(RUN_ID, {}, null)).rejects.toMatchObject({
        response: { error: ERROR_CODES.WRITEBACK_CONFIRM_REQUIRED },
      });
    });

    it('TC-WB-EXEC-002：外部連線未設定 → 422 WRITEBACK_CONNECTION_NOT_CONFIGURED', async () => {
      await seedRun(env);
      await seedResults(env);
      // 無 datasource row → openExternalPool 拋 422
      await expect(
        env.service.execute(RUN_ID, { confirm: true }, null),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.WRITEBACK_CONNECTION_NOT_CONFIGURED },
      });
    });

    it('TC-WB-EXEC-003：成功回寫 → updated/notMatched + result_status + 稽核', async () => {
      await seedRun(env);
      await seedResults(env);
      // 1 批（3 列 < 150）；該批回傳 1 筆 not-matched（A3）
      const fakePool = makeFakePool([[{ list_no: 'OB202607002', orgno: '02', appl_no: 'A3' }]]);
      vi.spyOn(env.service as any, 'openExternalPool').mockResolvedValue(fakePool);

      const res = await env.service.execute(
        RUN_ID,
        { confirm: true },
        { userId: 'u-director', name: '王部長' },
      );
      expect(res.updated).toBe(2);
      expect(res.notMatched).toBe(1);

      const rows = await env.resultRepo.find({ where: { run_id: RUN_ID } });
      const byAppl = new Map(rows.map((r) => [r.appl_no, r.result_status]));
      expect(byAppl.get('A1')).toBe('SUCCESS');
      expect(byAppl.get('A2')).toBe('SUCCESS');
      expect(byAppl.get('A3')).toBe('FAILED');

      const audits = await env.auditRepo.find();
      expect(audits.length).toBe(1);
      expect(audits[0].action).toBe('WRITEBACK');
      expect(audits[0].entity_id).toBe(RUN_ID);
    });

    it('TC-WB-EXEC-004：run 不存在 → 404；未完成 → 422', async () => {
      await expect(
        env.service.execute('no-run', { confirm: true }, null),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND },
      });

      await seedRun(env, 'running');
      await expect(
        env.service.execute(RUN_ID, { confirm: true }, null),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED },
      });
    });

    it('TC-WB-EXEC-005：外部拒絕 UPDATE → 422 PERMISSION_DENIED、狀態不變、無稽核、連線關閉', async () => {
      await seedRun(env);
      await seedResults(env);
      const fakePool = makeThrowingPool(makePermissionDeniedError());
      vi.spyOn(env.service as any, 'openExternalPool').mockResolvedValue(fakePool);

      await expect(
        env.service.execute(RUN_ID, { confirm: true }, { userId: 'u-director' }),
      ).rejects.toMatchObject({
        status: 422,
        response: { error: ERROR_CODES.WRITEBACK_PERMISSION_DENIED },
      });

      // 未寫入外部 → CDMP 端不得被標成 SUCCESS（維持 PENDING 可原樣重試）
      const rows = await env.resultRepo.find({ where: { run_id: RUN_ID } });
      expect(rows.every((r) => r.result_status === 'PENDING')).toBe(true);
      expect(await env.auditRepo.count()).toBe(0);
      expect(fakePool.closed).toBe(true);
    });

    it('TC-WB-EXEC-006：其他外部寫入錯誤 → 422 EXTERNAL_WRITE_FAILED（附驅動訊息）', async () => {
      await seedRun(env);
      await seedResults(env);
      const fakePool = makeThrowingPool(new Error('Timeout: Request failed to complete in 30000ms'));
      vi.spyOn(env.service as any, 'openExternalPool').mockResolvedValue(fakePool);

      await expect(
        env.service.execute(RUN_ID, { confirm: true }, { userId: 'u-director' }),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          error: ERROR_CODES.WRITEBACK_EXTERNAL_WRITE_FAILED,
          message: expect.stringContaining('Timeout'),
        },
      });

      const rows = await env.resultRepo.find({ where: { run_id: RUN_ID } });
      expect(rows.every((r) => r.result_status === 'PENDING')).toBe(true);
      expect(await env.auditRepo.count()).toBe(0);
      expect(fakePool.closed).toBe(true);
    });
  });

  describe('writeBatches', () => {
    it('TC-WB-BATCH-001：發出含 OBPOOLDATA_LIST 的 UPDATE，正確彙總 matched/not-matched', async () => {
      const rows = [
        { list_no: 'L1', orgno: '02', appl_no: 'A1', dept_id: 'D01', emplid: 'E1', emplid_deptid: 'D01', assignday: '20260701', card_level: 'A', tier_level: 'T1', is_cr: 'N', cr_id: null, cr_nm: null },
        { list_no: 'L1', orgno: '02', appl_no: 'A2', dept_id: 'D01', emplid: 'E1', emplid_deptid: 'D01', assignday: '20260701', card_level: 'B', tier_level: 'T2', is_cr: 'N', cr_id: null, cr_nm: null },
      ] as unknown as ObMonthlyRunResult[];
      const fakePool = makeFakePool([[{ list_no: 'L1', orgno: '02', appl_no: 'A2' }]]);

      const out = await (env.service as any).writeBatches(fakePool, rows);
      expect(out.matched).toBe(1);
      expect(out.notMatchedKeys).toEqual([{ listNo: 'L1', orgno: '02', applNo: 'A2' }]);
      expect(fakePool.queries.join('\n')).toMatch(/UPDATE[\s\S]*OBPOOLDATA_LIST/i);
      expect(fakePool.queries.join('\n')).toMatch(/OB_EMPLID/);
    });
  });
});
