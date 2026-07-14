/**
 * F097 — POST /api/v1/assignment/runs workYm 三分支 + 過去月 guard + project_workym 寫入
 *
 * 涵蓋測試場景（docs/test-specs/features/F097-test.md）：
 *   - TS-F097-DTO-001~007：workYm 缺省 → 400；格式錯 / MM 非法 → 422 WORK_YM_INVALID_FORMAT；合法 → 202
 *   - TS-F097-GUARD-001~004：過去月 → 422 RUN_WORKYM_PAST；當月 1 號邊界（>=）通過；未來月通過；server 時鐘基準
 *   - TS-F097-RUN-001~002：guard 通過後 service.triggerRun 帶選定 workYm（非 new Date() 執行月）
 *   - TS-F097-CTL-003：triggerRun handler 讀 dto.workYm（不再呼叫 static computeCurrentWorkYm）
 *
 * 註：POST /runs 成功 status 維持 202（F061 既有；F097 spec 未變更狀態碼）。
 *     測試設計文件以 201 表「成功」為非載重簡寫，AC-14 僅要求 ym='202606'。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { AssignmentRunController } from '../assignment-run.controller';
import { AssignmentRunService } from '../services/assignment-run.service';
import { AssignmentRunSnapshotService } from '../services/assignment-run-snapshot.service';
import { AssignmentRunReportService } from '../services/assignment-run-report.service';
import { ObpooldataWritebackService } from '../services/obpooldata-writeback.service';
import { MonthlyRunReadinessService } from '../services/monthly-run-readiness.service';
import { SystemService } from '@/modules/system/system.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { ERROR_CODES } from '@/common/errors/error-codes';

describe('POST /assignment/runs — F097 workYm + 過去月 guard', () => {
  let app: INestApplication;
  let triggerRunMock: ReturnType<typeof vi.fn>;
  let getCurrentWorkYmMock: ReturnType<typeof vi.fn>;

  const FLAG = 'ENABLE_E07_REFACTOR_PHASE3';
  const originalFlag = process.env[FLAG];

  const director = {
    userId: 'u-director',
    role: 'user',
    businessRole: 'director' as const,
  };

  beforeAll(async () => {
    process.env[FLAG] = 'true';
    triggerRunMock = vi.fn().mockImplementation((ym: string) =>
      Promise.resolve({
        runId: 'run-uuid-1',
        status: 'pending',
        projectWorkym: ym,
        triggeredAt: new Date('2026-05-27T00:00:00Z'),
      }),
    );
    // server 時鐘基準（BR-6）：getCurrentWorkYm() mock 回 '202605'（today=2026-05-27）
    getCurrentWorkYmMock = vi.fn().mockReturnValue('202605');

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentRunController],
      providers: [
        { provide: AssignmentRunService, useValue: { triggerRun: triggerRunMock } },
        { provide: AssignmentRunSnapshotService, useValue: {} },
        { provide: AssignmentRunReportService, useValue: {} },
        { provide: ObpooldataWritebackService, useValue: {} },
        {
          provide: MonthlyRunReadinessService,
          useValue: { calculateReadiness: vi.fn() },
        },
        {
          provide: SystemService,
          useValue: { getCurrentWorkYm: getCurrentWorkYmMock },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = director;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  beforeEach(() => {
    triggerRunMock.mockClear();
    getCurrentWorkYmMock.mockClear();
    getCurrentWorkYmMock.mockReturnValue('202605');
  });

  const post = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/assignment/runs').send(body);

  // -------------------------------------------------------------------------
  // 分支 (1)：缺省 → 400
  // -------------------------------------------------------------------------

  it('TS-F097-DTO-001：空 body → 400（缺必填，無 new Date() fallback）', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(triggerRunMock).not.toHaveBeenCalled();
  });

  it('TS-F097-DTO-002：workYm=null → 400', async () => {
    const res = await post({ workYm: null });
    expect(res.status).toBe(400);
    expect(triggerRunMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 分支 (2)：格式錯 → 422 WORK_YM_INVALID_FORMAT
  // -------------------------------------------------------------------------

  it('TS-F097-DTO-003：5 碼 (20266) → 422 WORK_YM_INVALID_FORMAT', async () => {
    const res = await post({ workYm: '20266' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(ERROR_CODES.WORK_YM_INVALID_FORMAT);
  });

  it('TS-F097-DTO-004：MM=13 (202613) → 422 WORK_YM_INVALID_FORMAT（格式層攔截）', async () => {
    const res = await post({ workYm: '202613' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(ERROR_CODES.WORK_YM_INVALID_FORMAT);
  });

  it('TS-F097-DTO-005：非數字 (abcdef) → 422 WORK_YM_INVALID_FORMAT', async () => {
    const res = await post({ workYm: 'abcdef' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(ERROR_CODES.WORK_YM_INVALID_FORMAT);
  });

  it('TS-F097-DTO-007：MM=00 (202600) → 422 WORK_YM_INVALID_FORMAT', async () => {
    const res = await post({ workYm: '202600' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(ERROR_CODES.WORK_YM_INVALID_FORMAT);
  });

  // -------------------------------------------------------------------------
  // 分支 (3) + 成功路徑
  // -------------------------------------------------------------------------

  it('TS-F097-DTO-006 / RUN-001：合法 202606（today=202605）→ 202 + ym=202606 + service 帶選定月', async () => {
    const res = await post({ workYm: '202606' });
    expect(res.status).toBe(202);
    expect(res.body.projectWorkym).toBe('202606');
    expect(triggerRunMock).toHaveBeenCalledWith('202606', 'u-director');
  });

  it('TS-F097-RUN-002：project_workym ≠ 執行月 202605（regression / breaking change）', async () => {
    await post({ workYm: '202606' });
    const [ymArg] = triggerRunMock.mock.calls[0];
    expect(ymArg).toBe('202606');
    expect(ymArg).not.toBe('202605');
  });

  it('TS-F097-GUARD-001：過去月 202504（today=202605）→ 422 RUN_WORKYM_PAST', async () => {
    const res = await post({ workYm: '202504' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(ERROR_CODES.RUN_WORKYM_PAST);
    expect(triggerRunMock).not.toHaveBeenCalled();
  });

  it('TS-F097-GUARD-002：當月 1 號邊界 — today=202606，workYm=202606 → 202 通過（>=）', async () => {
    getCurrentWorkYmMock.mockReturnValue('202606');
    const res = await post({ workYm: '202606' });
    expect(res.status).toBe(202);
    expect(triggerRunMock).toHaveBeenCalledWith('202606', 'u-director');
  });

  it('TS-F097-GUARD-003：未來月 202607（today=202605）→ 202 通過', async () => {
    const res = await post({ workYm: '202607' });
    expect(res.status).toBe(202);
    expect(triggerRunMock).toHaveBeenCalledWith('202607', 'u-director');
  });

  it('TS-F097-GUARD-004：guard 以 server 時鐘（SystemService.getCurrentWorkYm）為基準', async () => {
    // today=202607 → workYm=202606 之 workdt(2026-06-01) < today(2026-07-01) → 拒絕
    getCurrentWorkYmMock.mockReturnValue('202607');
    const res = await post({ workYm: '202606' });
    expect(getCurrentWorkYmMock).toHaveBeenCalled();
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(ERROR_CODES.RUN_WORKYM_PAST);
  });

  it('TS-F097-CTL-003：triggerRun handler 讀 dto.workYm（透傳 service，非自算月份）', async () => {
    await post({ workYm: '202609' });
    expect(triggerRunMock).toHaveBeenCalledWith('202609', 'u-director');
  });
});
