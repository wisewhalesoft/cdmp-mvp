/**
 * F119 / US-183 — AssignmentListService.createList/updateList 之文字運算子驗證層黑箱測試。
 *
 * 撰寫依據：F119 spec AC-1/AC-6/AC-8/BR-2/BR-3 + AD-E07-50 §3.9（I-CATOP-VALIDATION-LAYER-01：
 * 互斥檢查置於 service 層而非 DTO 層）。**未**開啟 `assignment-list.service.ts` /
 * `condition-item.dto.ts` 生產碼；buildEnv / baseDto / 錯誤斷言慣例取自既有測試檔
 * `create-list-v2.1.spec.ts` / `validate-condition-payload.spec.ts`（允許範圍：既有測試檔）。
 *
 * 覆蓋：
 *   - AC-1/T-10：numeric/date 條件帶 operator 或 keyword → 422
 *   - AC-6/BR-3/T-9：互斥違規（文字運算子 + values 非空；in/缺漏 + keyword 非空）→ 422，
 *     訊息含 columnName
 *   - AC-8/BR-2/T-8：keyword 缺漏/純空白（半形+全形 U+3000）/超長(101) → 422；100 為合法邊界
 *   - BR-2/T-19：keyword 前後空白 trim 後落庫，內部空白保留
 *   - I-CATOP-CASEYEAR-EXCLUDE-01：createList 對 caseyear + 文字運算子 → 422
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentListService } from '../assignment-list.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { User } from '@/database/entities/user.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202608';
const ACTOR = { userId: 'dir-001', ipAddress: '127.0.0.1' };

interface Env {
  app: TestingModule;
  service: AssignmentListService;
  listRepo: Repository<ObListDefinition>;
  whitelistRepo: Repository<PooldataFieldWhitelist>;
}

async function buildEnv(): Promise<Env> {
  const app = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption,
          PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User, ObPoolData,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption,
        PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User, ObPoolData,
      ]),
    ],
    providers: [AssignmentListService, AssignmentRunGuardService, { provide: SectionChiefScopeService, useValue: { getScopeDeptCode: () => Promise.resolve(null) } }],
  }).compile();
  await app.init();

  const ds = app.get(DataSource);
  return {
    app,
    service: app.get(AssignmentListService),
    listRepo: ds.getRepository(ObListDefinition),
    whitelistRepo: ds.getRepository(PooldataFieldWhitelist),
  };
}

function baseDto(overrides: Partial<any> = {}) {
  return {
    listNm: 'F119 驗證測試名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: '01',
    prodBest: null,
    crEnabled: false,
    copyFromListNo: null,
    conditionPayload: {
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '勁便利' }],
      logic: 'AND',
    },
    ...overrides,
  };
}

async function seedWhitelist(repo: Repository<PooldataFieldWhitelist>) {
  const now = new Date();
  const rows = [
    { column_name: 'spec_name', field_type: 'categorical' as const, is_active: true },
    { column_name: 'prod_kind', field_type: 'categorical' as const, is_active: true },
    { column_name: 'caseyear', field_type: 'categorical' as const, is_active: true },
    { column_name: 'month_cnt', field_type: 'numeric' as const, is_active: true },
    { column_name: 'birth_date', field_type: 'date' as const, is_active: true },
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

async function expectValidationError(promise: Promise<unknown>, columnName?: string) {
  try {
    await promise;
    throw new Error('expected throw');
  } catch (e: any) {
    expect(e).toBeInstanceOf(UnprocessableEntityException);
    expect(e.getResponse().error).toBe(ERROR_CODES.VALIDATION_ERROR);
    if (columnName) {
      // AC-6/AC-8：訊息須明確指出違反之 columnName，供多條件表單中定位是哪一列
      const details = e.getResponse().details;
      const message: string = e.getResponse().message ?? '';
      const columnHint =
        (details && typeof details === 'object' && 'columnName' in details && details.columnName) ||
        message;
      expect(String(columnHint)).toContain(columnName);
    }
  }
}

describe('F119 條件驗證層（AC-1/AC-6/AC-8/BR-2/BR-3，createList 黑箱）', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildEnv();
  });

  afterAll(async () => {
    await env.app?.close();
  });

  beforeEach(async () => {
    await env.whitelistRepo.clear();
    await env.listRepo.createQueryBuilder().delete().execute();
    await seedWhitelist(env.whitelistRepo);
  });

  // ── AC-1 / T-10：numeric/date 帶 operator 或 keyword → 422 ──────────────
  it('T-10a：numeric 欄位帶 operator=contains → 422', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'month_cnt', fieldType: 'numeric', min: 1, max: 6, operator: 'contains', keyword: 'x' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
    );
  });

  it('T-10b：date 欄位帶 keyword（無 operator）→ 422', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'birth_date', fieldType: 'date', dateStart: '2000-01-01', dateEnd: '2005-12-31', keyword: 'x' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
    );
  });

  // ── AC-6 / BR-3 / T-9：互斥違規 → 422，含 columnName ─────────────────────
  it('T-9a（★核心）：文字運算子 + 非空 values 同時存在 → 422，訊息含 columnName', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [
              { columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '勁便利', values: ['01'] },
            ],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
      'spec_name',
    );
  });

  it('T-9b（★核心）：operator=in（顯式）+ 非空 keyword 同時存在 → 422', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [
              { columnName: 'prod_kind', fieldType: 'categorical', operator: 'in', values: ['01'], keyword: '勁便利' },
            ],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
      'prod_kind',
    );
  });

  it('T-9c：operator 缺漏（視為 in）+ 非空 keyword 同時存在 → 422（fallback 後仍受互斥檢查）', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], keyword: '勁便利' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
      'prod_kind',
    );
  });

  // ── AC-8 / BR-2 / T-8：keyword 驗證 ───────────────────────────────────
  it('T-8a：keyword 缺漏（文字運算子）→ 422', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
      'spec_name',
    );
  });

  it('T-8b：keyword 為純半形空白 → 422', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '   ' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
      'spec_name',
    );
  });

  it('T-8c：keyword 為純全形空白 U+3000 → 422', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '　　' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
      'spec_name',
    );
  });

  it('T-8d：keyword trim 後長度 101（超長）→ 422', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: 'A'.repeat(101) }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
      'spec_name',
    );
  });

  it('T-8e（正控制組 / 邊界）：keyword trim 後長度恰 100 → 合法，不拋 422', async () => {
    await expect(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: 'A'.repeat(100) }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
    ).resolves.toBeDefined();
  });

  // ── BR-2 / T-19：trim 落庫，內部空白保留 ─────────────────────────────
  it('T-19（★核心）：keyword 前後空白（半形+全形+Tab）trim 後落庫，內部空白保留（"勁 便利" ≠ "勁便利"）', async () => {
    const res = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '　 \t勁 便利\t 　' }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const row = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(row).not.toBeNull();
    const savedKeyword = (row!.condition_payload as any).conditions[0].keyword;
    expect(savedKeyword).toBe('勁 便利');
  });

  // ── I-CATOP-CASEYEAR-EXCLUDE-01：createList 亦須擋下 ───────────────────
  it('CASEYEAR-CREATE-001：caseyear + operator=equals → 422', async () => {
    await expectValidationError(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'caseyear', fieldType: 'categorical', operator: 'equals', keyword: '1' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
      'caseyear',
    );
  });

  // ── 正控制組：合法文字運算子條件應可正常建立 ─────────────────────────
  it('POSITIVE-001（正控制組）：合法 contains 條件正常建立，不拋錯', async () => {
    const res = await env.service.createList(baseDto() as any, ACTOR, YM);
    expect((res as any).listNo).toBeDefined();
  });
});
