/**
 * F068 廢除：/api/v1/assignment/codes/* 全部路由回 404
 *
 * 對應 test spec：
 *   - TS-F068-DEP-001：GET /api/v1/assignment/codes 回傳 404
 *   - TS-F068-DEP-002：GET /api/v1/assignment/codes/:id 回傳 404
 *   - TS-F068-DEP-003：POST /api/v1/assignment/codes 回傳 404
 *
 * 範圍說明：本 e2e 採輕量 TestingModule（不含 AppModule 全套 entity / migration），
 * 僅驗證「未註冊任何 controller 時，路由必回 404」之核心行為。
 * 完整 AppModule boot 驗證屬 W13 regression 範圍。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('TS-F068-DEP-001~003：F068 路由全部回 404（assignment-code/ 已刪）', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // 不註冊任何 controller — 驗證 NestJS 路由不存在時的 404 行為
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [],
      controllers: [],
      providers: [],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('TS-F068-DEP-001：GET /api/v1/assignment-codes 回傳 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/assignment-codes');
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/assignment/codes 回傳 404（原 F068 route 前綴）', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/codes');
    expect(res.status).toBe(404);
  });

  it('TS-F068-DEP-002：GET /api/v1/assignment/codes/:tblId 回傳 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/codes/PROD_KIND');
    expect(res.status).toBe(404);
  });

  it('TS-F068-DEP-003：POST /api/v1/assignment/codes 回傳 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes')
      .send({ tblId: 'PROD_KIND', tblCd: '99', tblDesc1: '測試' });
    expect(res.status).toBe(404);
  });

  it('PUT /api/v1/assignment/codes/:tblId/:tblCd 回傳 404', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/assignment/codes/PROD_KIND/99')
      .send({ tblDesc1: '改名' });
    expect(res.status).toBe(404);
  });

  it('POST /api/v1/assignment/codes/:tblId/:tblCd/disable 回傳 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes/PROD_KIND/99/disable')
      .send({});
    expect(res.status).toBe(404);
  });
});
