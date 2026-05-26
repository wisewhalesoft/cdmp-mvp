/**
 * F050 v2.1 / F051 v2.1：AssignmentListService.validateConditionPayload 純驗證單元測試
 *
 * Phase 5a 波 4：
 *   - 白名單 active check（CONDITION_COLUMN_NOT_IN_WHITELIST 422）
 *   - reserved field 防呆（RESERVED_FIELD_IN_CONDITIONS 400；list_period_start/end/interval）
 *   - 同 columnName 重複（VALIDATION_ERROR 422）
 *   - 優先序：reserved(400) > 重複(422) > whitelist(422)
 *
 * 對應 spec：
 *   - F050 §AC-11 / §AC-12 / §BR-6 / §BR-8 / §5.4
 *   - AD-E07-18 §18.4 validateConditionPayload algorithm
 *   - test design TS-F050-003 / 004 / 005 / 006 / 012；TS-F051-002 / 003
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
import { ERROR_CODES } from '@/common/errors/error-codes';

interface PayloadInput {
  conditions: Array<{
    columnName: string;
    fieldType: 'categorical' | 'numeric' | 'date';
    values?: string[];
    min?: number;
    max?: number;
    dateStart?: string;
    dateEnd?: string;
  }>;
  logic: 'AND';
}

async function buildEnv(): Promise<{
  app: TestingModule;
  service: AssignmentListService;
  whitelistRepo: Repository<PooldataFieldWhitelist>;
}> {
  const app = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ObListDefinition,
          AssignmentAuditLog,
          AssignmentRun,
          PooldataFieldOption,
          PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        AssignmentAuditLog,
        AssignmentRun,
        PooldataFieldOption,
        PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User,
      ]),
    ],
    providers: [AssignmentListService, AssignmentRunGuardService, { provide: SectionChiefScopeService, useValue: { getScopeDeptCode: () => Promise.resolve(null) } }],
  }).compile();
  await app.init();

  const ds = app.get(DataSource);
  const whitelistRepo = ds.getRepository(PooldataFieldWhitelist);
  const service = app.get(AssignmentListService);
  return { app, service, whitelistRepo };
}

async function seedWhitelist(
  repo: Repository<PooldataFieldWhitelist>,
  rows: Array<{ column_name: string; field_type: 'categorical' | 'numeric' | 'date'; is_active: boolean }>,
) {
  const now = new Date();
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

describe('AssignmentListService.validateConditionPayload (Phase 5a 波4)', () => {
  let app: TestingModule;
  let service: AssignmentListService;
  let whitelistRepo: Repository<PooldataFieldWhitelist>;

  beforeAll(async () => {
    const env = await buildEnv();
    app = env.app;
    service = env.service;
    whitelistRepo = env.whitelistRepo;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await whitelistRepo.clear();
    // 預設 seed：5 個 backward-compat 欄位 + 2 個額外（month_cnt numeric / birth_date date）全 active
    await seedWhitelist(whitelistRepo, [
      { column_name: 'prod_kind', field_type: 'categorical', is_active: true },
      { column_name: 'caseyear', field_type: 'categorical', is_active: true },
      { column_name: 'spec_tp', field_type: 'categorical', is_active: true },
      { column_name: 'case_status', field_type: 'categorical', is_active: true },
      { column_name: 'settle_src', field_type: 'categorical', is_active: true },
      { column_name: 'month_cnt', field_type: 'numeric', is_active: true },
      { column_name: 'birth_date', field_type: 'date', is_active: true },
    ]);
  });

  it('VCP-001：columnName 不在 whitelist → 422 CONDITION_COLUMN_NOT_IN_WHITELIST', async () => {
    const payload: PayloadInput = {
      conditions: [
        { columnName: 'invalid_field', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    };
    let thrown: any = null;
    try {
      await (service as any).validateConditionPayload(payload);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect(thrown.getResponse().error).toBe(ERROR_CODES.CONDITION_COLUMN_NOT_IN_WHITELIST);
    expect(thrown.getResponse().details.columnName).toBe('invalid_field');
  });

  it('VCP-002：columnName 對應 whitelist row is_active=false → 422 CONDITION_COLUMN_NOT_IN_WHITELIST', async () => {
    await whitelistRepo.update({ column_name: 'settle_src' }, { is_active: false });
    const payload: PayloadInput = {
      conditions: [
        { columnName: 'settle_src', fieldType: 'categorical', values: ['Y'] },
      ],
      logic: 'AND',
    };
    let thrown: any = null;
    try {
      await (service as any).validateConditionPayload(payload);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect(thrown.getResponse().error).toBe(ERROR_CODES.CONDITION_COLUMN_NOT_IN_WHITELIST);
    expect(thrown.getResponse().details.columnName).toBe('settle_src');
  });

  it('VCP-003a：columnName = list_period_start → 400 RESERVED_FIELD_IN_CONDITIONS', async () => {
    const payload: PayloadInput = {
      conditions: [
        { columnName: 'list_period_start', fieldType: 'numeric', min: 1, max: 12 },
      ],
      logic: 'AND',
    };
    let thrown: any = null;
    try {
      await (service as any).validateConditionPayload(payload);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown.getResponse().error).toBe(ERROR_CODES.RESERVED_FIELD_IN_CONDITIONS);
    expect(thrown.getResponse().details.reservedFields).toContain('list_period_start');
  });

  it('VCP-003b：columnName = list_period_end 或 list_interval → 400', async () => {
    for (const col of ['list_period_end', 'list_interval']) {
      const payload: PayloadInput = {
        conditions: [
          { columnName: col, fieldType: 'numeric', min: 1, max: 12 },
        ],
        logic: 'AND',
      };
      let thrown: any = null;
      try {
        await (service as any).validateConditionPayload(payload);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown.getResponse().error).toBe(ERROR_CODES.RESERVED_FIELD_IN_CONDITIONS);
    }
  });

  it('VCP-004：同一 columnName 重複出現 2 次 → 422 VALIDATION_ERROR', async () => {
    const payload: PayloadInput = {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] },
      ],
      logic: 'AND',
    };
    let thrown: any = null;
    try {
      await (service as any).validateConditionPayload(payload);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect(thrown.getResponse().error).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(thrown.getResponse().message).toMatch(/重複/);
  });

  it('VCP-005：所有條件合法（categorical + numeric + date）→ resolve void', async () => {
    const payload: PayloadInput = {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
        { columnName: 'month_cnt', fieldType: 'numeric', min: 1, max: 6 },
        { columnName: 'birth_date', fieldType: 'date', dateStart: '2000-01-01', dateEnd: '2005-12-31' },
      ],
      logic: 'AND',
    };
    await expect((service as any).validateConditionPayload(payload)).resolves.toBeUndefined();
  });

  it('VCP-006：reserved（400）優先於 whitelist（422）', async () => {
    // payload 同時含 reserved 與 not-in-whitelist
    const payload: PayloadInput = {
      conditions: [
        { columnName: 'list_period_start', fieldType: 'numeric', min: 1, max: 12 },
        { columnName: 'invalid_field', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    };
    let thrown: any = null;
    try {
      await (service as any).validateConditionPayload(payload);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown.getResponse().error).toBe(ERROR_CODES.RESERVED_FIELD_IN_CONDITIONS);
  });

  it('VCP-007：reserved 優先於同 columnName 重複（400 vs 422）', async () => {
    const payload: PayloadInput = {
      conditions: [
        { columnName: 'list_period_start', fieldType: 'numeric', min: 1, max: 12 },
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] },
      ],
      logic: 'AND',
    };
    let thrown: any = null;
    try {
      await (service as any).validateConditionPayload(payload);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown.getResponse().error).toBe(ERROR_CODES.RESERVED_FIELD_IN_CONDITIONS);
  });
});
