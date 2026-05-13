/**
 * F068：AssignmentCodeController Integration Tests
 *
 * 策略：採 mocked AssignmentCodeService + mocked AuthGuard / SalesManagerGuard
 * (覆寫 .canActivate 控制不同 user role)，避開 sqlite 對 ObCodeDf 的 timestamp 限制。
 *
 * DB 互動行為由 Service Unit Spec 驗證；本 spec 重點：
 *   - Route binding (4 端點)
 *   - Guard chain 行為（401 / 403 / 200 + 404 / 422 transparent pass-through）
 *   - ValidationPipe DTO 驗證（whitelist / forbidNonWhitelisted / transform）
 *
 * 涵蓋 15 cases：
 *
 * A. Route + Guard chain（5 cases）
 *   1. 未帶 JWT → 401 AUTH_TOKEN_MISSING（AuthGuard 拒）
 *   2. role=user 非業務主管 → 403 AUTH_FORBIDDEN（SalesManagerGuard 拒）
 *   3. admin 通過
 *   4. role=user + is_sales_manager=true 通過
 *   5. SalesManagerGuard 在 AuthGuard 之後執行
 *
 * B. GET /assignment/codes（3 cases）
 *   6. 缺 tblId → 422 VALIDATION_ERROR（CDMP HttpExceptionFilter 統一將 ValidationPipe 錯誤轉 422）
 *   7. Service throw CODE_TYPE_INVALID 透傳 422
 *   8. includeInactive='true' query 轉 boolean
 *
 * C. POST /assignment/codes（3 cases）
 *   9. tblCd 缺失 → 422 VALIDATION_ERROR
 *  10. 完整 body → 201
 *  11. tbl_desc1 > 40 字元 → 422 VALIDATION_ERROR
 *
 * D. PUT /:tblId/:tblCd（2 cases）
 *  12. Service throw CODE_NOT_FOUND 透傳 404
 *  13. tbl_desc1 缺失 → 422 VALIDATION_ERROR
 *
 * E. PUT /:tblId/:tblCd/disable（2 cases）
 *  14. 成功透傳 200
 *  15. Service throw CODE_NOT_FOUND 透傳 404
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException,
  ForbiddenException,
  ExecutionContext,
} from '@nestjs/common';
import request from 'supertest';
import { AssignmentCodeController } from '../assignment-code.controller';
import { AssignmentCodeService } from '../assignment-code.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { SalesManagerGuard } from '@/common/guards/sales-manager.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

type CurrentUser = { userId: string; role: string; isSalesManager: boolean } | null;

describe('AssignmentCodeController (HTTP integration)', () => {
  let app: INestApplication;
  let serviceMock: {
    listCodes: ReturnType<typeof vi.fn>;
    createCode: ReturnType<typeof vi.fn>;
    updateCode: ReturnType<typeof vi.fn>;
    disableCode: ReturnType<typeof vi.fn>;
  };
  // 可動態切換 current user 以驗證不同 role 場景
  let currentUser: CurrentUser = null;

  beforeAll(async () => {
    serviceMock = {
      listCodes: vi.fn(),
      createCode: vi.fn(),
      updateCode: vi.fn(),
      disableCode: vi.fn(),
    };

    // Mocked AuthGuard：未帶 user 視為未登入；帶 user 注入 request.user
    const authGuardMock = {
      canActivate: (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        if (!currentUser) {
          throw new UnauthorizedException({
            error: ERROR_CODES.TOKEN_MISSING,
            message: ERROR_MESSAGES.TOKEN_MISSING,
          });
        }
        req.user = currentUser;
        return true;
      },
    };

    // 真實 SalesManagerGuard 但 reflector 需要的 metadata 已由 @RequireSalesManager() 注入
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentCodeController],
      providers: [{ provide: AssignmentCodeService, useValue: serviceMock }],
    })
      .overrideGuard(AuthGuard)
      .useValue(authGuardMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = null;
  });

  function asAdmin() {
    currentUser = { userId: 'admin-id', role: 'admin', isSalesManager: false };
  }
  function asSalesManager() {
    currentUser = { userId: 'sm-id', role: 'user', isSalesManager: true };
  }
  function asPlainUser() {
    currentUser = { userId: 'user-id', role: 'user', isSalesManager: false };
  }

  // ===== A. Route + Guard chain =====

  it('1) 未帶 JWT → 401 AUTH_TOKEN_MISSING（AuthGuard 拒）', async () => {
    currentUser = null;
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  it('2) role=user 非業務主管 → 403 AUTH_FORBIDDEN（SalesManagerGuard 拒）', async () => {
    asPlainUser();
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  it('3) admin 通過', async () => {
    asAdmin();
    serviceMock.listCodes.mockResolvedValue({ tblId: 'PROD_KIND', data: [] });
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND');
    expect(res.status).toBe(200);
    expect(res.body.tblId).toBe('PROD_KIND');
  });

  it('4) role=user + is_sales_manager=true 通過', async () => {
    asSalesManager();
    serviceMock.listCodes.mockResolvedValue({ tblId: 'PROD_KIND', data: [] });
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND');
    expect(res.status).toBe(200);
  });

  it('5) SalesManagerGuard 在 AuthGuard 之後執行', async () => {
    // 未登入 + 非 SM → AuthGuard 應先拒（401），不會走到 SalesManagerGuard（403）
    currentUser = null;
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes')
      .send({ tblId: 'PROD_KIND', tblCd: '05', tblDesc1: 'X' });
    expect(res.status).toBe(401);
    expect(serviceMock.createCode).not.toHaveBeenCalled();
  });

  // ===== B. GET /assignment/codes =====

  it('6) 缺 tblId → 422 VALIDATION_ERROR（HttpExceptionFilter 將 ValidationPipe 轉 422）', async () => {
    asAdmin();
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(serviceMock.listCodes).not.toHaveBeenCalled();
  });

  it('7) Service throw CODE_TYPE_INVALID 透傳 422', async () => {
    asAdmin();
    serviceMock.listCodes.mockRejectedValue(
      new UnprocessableEntityException({
        error: ERROR_CODES.CODE_TYPE_INVALID,
        message: ERROR_MESSAGES.CODE_TYPE_INVALID,
      }),
    );
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=CASEYEAR');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('CODE_TYPE_INVALID');
  });

  it("8) includeInactive='true' query 轉 boolean", async () => {
    asAdmin();
    serviceMock.listCodes.mockResolvedValue({ tblId: 'PROD_KIND', data: [] });
    await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND&includeInactive=true');
    expect(serviceMock.listCodes).toHaveBeenCalledWith('PROD_KIND', true);

    await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND&includeInactive=false');
    expect(serviceMock.listCodes).toHaveBeenLastCalledWith('PROD_KIND', false);
  });

  // ===== C. POST /assignment/codes =====

  it('9) tblCd 缺失 → 422 VALIDATION_ERROR', async () => {
    asAdmin();
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes')
      .send({ tblId: 'PROD_KIND', tblDesc1: '商用車' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(serviceMock.createCode).not.toHaveBeenCalled();
  });

  it('10) 完整 body → 201', async () => {
    asAdmin();
    serviceMock.createCode.mockResolvedValue({
      tblCd: '05',
      tblDesc1: '商用車',
      tblDesc2: null,
      stadt: '20260513',
      enddt: '99991231',
      active: true,
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes')
      .send({ tblId: 'PROD_KIND', tblCd: '05', tblDesc1: '商用車' });
    expect(res.status).toBe(201);
    expect(res.body.tblCd).toBe('05');
    expect(serviceMock.createCode).toHaveBeenCalledWith(
      { tblId: 'PROD_KIND', tblCd: '05', tblDesc1: '商用車' },
      expect.objectContaining({ userId: 'admin-id' }),
    );
  });

  it('11) tbl_desc1 > 40 字元 → 422 VALIDATION_ERROR', async () => {
    asAdmin();
    const longDesc = 'A'.repeat(41);
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes')
      .send({ tblId: 'PROD_KIND', tblCd: '05', tblDesc1: longDesc });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // ===== D. PUT /:tblId/:tblCd =====

  it('12) Service throw CODE_NOT_FOUND 透傳 404', async () => {
    asAdmin();
    serviceMock.updateCode.mockRejectedValue(
      new NotFoundException({
        error: ERROR_CODES.CODE_NOT_FOUND,
        message: ERROR_MESSAGES.CODE_NOT_FOUND,
      }),
    );
    const res = await request(app.getHttpServer())
      .put('/api/v1/assignment/codes/PROD_KIND/99')
      .send({ tblDesc1: '新名' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CODE_NOT_FOUND');
  });

  it('13) tbl_desc1 缺失 → 422 VALIDATION_ERROR', async () => {
    asAdmin();
    const res = await request(app.getHttpServer())
      .put('/api/v1/assignment/codes/PROD_KIND/01')
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(serviceMock.updateCode).not.toHaveBeenCalled();
  });

  // ===== E. PUT /:tblId/:tblCd/disable =====

  it('14) 成功透傳 200', async () => {
    asAdmin();
    serviceMock.disableCode.mockResolvedValue({
      tblCd: '01',
      tblDesc1: 'X',
      tblDesc2: null,
      stadt: '20200101',
      enddt: '20260513',
      active: true,
    });
    const res = await request(app.getHttpServer())
      .put('/api/v1/assignment/codes/PROD_KIND/01/disable');
    expect(res.status).toBe(200);
    expect(serviceMock.disableCode).toHaveBeenCalledWith(
      'PROD_KIND',
      '01',
      expect.objectContaining({ userId: 'admin-id' }),
    );
  });

  it('15) disable 找不到 → 404 CODE_NOT_FOUND', async () => {
    asAdmin();
    serviceMock.disableCode.mockRejectedValue(
      new NotFoundException({
        error: ERROR_CODES.CODE_NOT_FOUND,
        message: ERROR_MESSAGES.CODE_NOT_FOUND,
      }),
    );
    const res = await request(app.getHttpServer())
      .put('/api/v1/assignment/codes/PROD_KIND/99/disable');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CODE_NOT_FOUND');
  });
});
