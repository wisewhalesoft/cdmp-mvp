/**
 * F050 v2.1 / AD-E07-18 §18.6：deriveBackwardCompatColumns / extractProdKindValues 純函數測試
 *
 * Phase 5a 波 5：5 個 backward-compat entity column 衍生規則 + prod_kind 唯一性所需 values 抽取
 *
 * 對應 spec：
 *   - AD-E07-18 §18.6 衍生規則表（NOT NULL 邊界：prod_kind / case_status → ''；其他 → null）
 *   - AD-E07-18 §18.8 prod_kind 交集唯一性語意
 *   - test design：TS-F050-008~011；TS-F051-012；TS-F050-013~016
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
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

async function buildEnv() {
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
  return app;
}

describe('AssignmentListService.deriveBackwardCompatColumns + extractProdKindValues (Phase 5a 波5)', () => {
  let app: TestingModule;
  let service: AssignmentListService;

  beforeAll(async () => {
    app = await buildEnv();
    service = app.get(AssignmentListService);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('deriveBackwardCompatColumns（§18.6 衍生規則）', () => {
    it('DBC-001：conditions 含 prod_kind categorical values=["01","02"] → derived.prod_kind = "01$$02"', () => {
      const payload = {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['01', '02'] }],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      expect(derived.prod_kind).toBe('01$$02');
    });

    it('DBC-002：conditions 不含 prod_kind → derived.prod_kind = "" （NOT NULL 邊界）', () => {
      const payload = {
        conditions: [{ columnName: 'caseyear', fieldType: 'categorical' as const, values: ['1'] }],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      expect(derived.prod_kind).toBe('');
    });

    it('DBC-003：conditions 不含 caseyear → derived.caseyear = null', () => {
      const payload = {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['01'] }],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      expect(derived.caseyear).toBeNull();
    });

    it('DBC-004：conditions 不含 case_status → derived.case_status = "" （§18.6 NOT NULL 邊界）', () => {
      const payload = {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['01'] }],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      expect(derived.case_status).toBe('');
    });

    it('DBC-005：conditions 含 month_cnt numeric → 不衍生（不在 5 個 backward-compat 範圍）', () => {
      const payload = {
        conditions: [{ columnName: 'month_cnt', fieldType: 'numeric' as const, min: 1, max: 6 }],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      // 5 個 backward-compat 欄位保持邊界值
      expect(derived).toEqual({
        prod_kind: '',
        caseyear: null,
        spec_tp: null,
        case_status: '',
        settle_src: null,
      });
    });

    it('DBC-006：conditions 含 birth_date date → 不衍生', () => {
      const payload = {
        conditions: [
          { columnName: 'birth_date', fieldType: 'date' as const, dateStart: '2000-01-01', dateEnd: '2005-12-31' },
        ],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      expect(derived).toEqual({
        prod_kind: '',
        caseyear: null,
        spec_tp: null,
        case_status: '',
        settle_src: null,
      });
    });

    it('DBC-007：conditions 含 spec_tp categorical values=["11","12","13"] → derived.spec_tp = "11$$12$$13"', () => {
      const payload = {
        conditions: [{ columnName: 'spec_tp', fieldType: 'categorical' as const, values: ['11', '12', '13'] }],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      expect(derived.spec_tp).toBe('11$$12$$13');
    });

    it('DBC-008：conditions 含 settle_src categorical values=["Y"] → derived.settle_src = "Y"', () => {
      const payload = {
        conditions: [{ columnName: 'settle_src', fieldType: 'categorical' as const, values: ['Y'] }],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      expect(derived.settle_src).toBe('Y');
    });

    it('DBC-009：5 個 backward-compat 欄位全衍生', () => {
      const payload = {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['01'] },
          { columnName: 'caseyear', fieldType: 'categorical' as const, values: ['1', '2'] },
          { columnName: 'spec_tp', fieldType: 'categorical' as const, values: ['02', '04'] },
          { columnName: 'case_status', fieldType: 'categorical' as const, values: ['01', '02'] },
          { columnName: 'settle_src', fieldType: 'categorical' as const, values: ['Y'] },
        ],
        logic: 'AND' as const,
      };
      const derived = (service as any).deriveBackwardCompatColumns(payload);
      expect(derived).toEqual({
        prod_kind: '01',
        caseyear: '1$$2',
        spec_tp: '02$$04',
        case_status: '01$$02',
        settle_src: 'Y',
      });
    });

    it('DBC-010：payload = null → 全部邊界值', () => {
      const derived = (service as any).deriveBackwardCompatColumns(null);
      expect(derived).toEqual({
        prod_kind: '',
        caseyear: null,
        spec_tp: null,
        case_status: '',
        settle_src: null,
      });
    });
  });

  describe('extractProdKindValues（§18.8）', () => {
    it('EPK-001：conditions 含 prod_kind categorical values=["01","02"] → ["01","02"]', () => {
      const payload = {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['01', '02'] }],
        logic: 'AND' as const,
      };
      const out = (service as any).extractProdKindValues(payload);
      expect(out).toEqual(['01', '02']);
    });

    it('EPK-002：conditions 無 prod_kind → []', () => {
      const payload = {
        conditions: [{ columnName: 'caseyear', fieldType: 'categorical' as const, values: ['1'] }],
        logic: 'AND' as const,
      };
      const out = (service as any).extractProdKindValues(payload);
      expect(out).toEqual([]);
    });

    it('EPK-003：conditions 之 prod_kind fieldType=numeric（防禦）→ []', () => {
      const payload = {
        conditions: [{ columnName: 'prod_kind', fieldType: 'numeric' as const, min: 1, max: 2 }],
        logic: 'AND' as const,
      };
      const out = (service as any).extractProdKindValues(payload);
      expect(out).toEqual([]);
    });

    it('EPK-004：prod_kind values 含空字串 → 過濾掉', () => {
      const payload = {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['01', '', '02'] }],
        logic: 'AND' as const,
      };
      const out = (service as any).extractProdKindValues(payload);
      expect(out).toEqual(['01', '02']);
    });

    it('EPK-005：payload = null → []', () => {
      const out = (service as any).extractProdKindValues(null);
      expect(out).toEqual([]);
    });
  });
});
