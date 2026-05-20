/**
 * F050 v2.1 Phase 5d 波 7：assignment-list API client type 強化
 *
 * Schema 對齊 backend ConditionItemDto / ConditionPayloadDto（5a 落地）
 *
 * 涵蓋：
 *   - ConditionItem type 含 columnName + fieldType ('categorical' | 'numeric' | 'date')
 *     + values? / min? / max? / dateStart? / dateEnd?
 *   - ConditionPayload type 含 conditions: ConditionItem[] + logic: 'AND'
 *   - CreateListRequest 必填 listNm + conditionPayload；不含 prodKind/caseYear/specTp/caseStatus/settleSrc
 *   - UpdateListRequest optional 包含 conditionPayload
 *   - AssignmentListItem 補 conditionPayload?: ConditionPayload | null（v2.1 read-through）
 *
 * 注意：此檔以 type 層級驗證為主（編譯期），輔以執行期 schema sanity check。
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  AssignmentListItem,
  ConditionItem,
  ConditionPayload,
  CreateListRequest,
  UpdateListRequest,
} from '../assignment-list';

describe('assignment-list API client types — Phase 5d 波 7', () => {
  it('api-7-1：ConditionItem 含 columnName + fieldType 三種分支 + optional values/min/max/dateStart/dateEnd', () => {
    const categorical: ConditionItem = {
      columnName: 'prod_kind',
      fieldType: 'categorical',
      values: ['01', '02'],
    };
    const numeric: ConditionItem = {
      columnName: 'month_cnt',
      fieldType: 'numeric',
      min: 1,
      max: 12,
    };
    const date: ConditionItem = {
      columnName: 'birth_date',
      fieldType: 'date',
      dateStart: '1990-01-01',
      dateEnd: '2005-12-31',
    };
    // sanity 執行期斷言（type 層級的 contract 已由 declare 時的賦值驗證）
    expect(categorical.fieldType).toBe('categorical');
    expect(numeric.min).toBe(1);
    expect(date.dateEnd).toBe('2005-12-31');
  });

  it('api-7-2：ConditionPayload = { conditions: ConditionItem[]; logic: "AND" }', () => {
    const payload: ConditionPayload = {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    };
    expect(payload.logic).toBe('AND');
    expect(payload.conditions.length).toBe(1);
  });

  it('api-7-3：CreateListRequest 必填 listNm + conditionPayload；不含 prodKind/caseYear/specTp/caseStatus/settleSrc', () => {
    const dto: CreateListRequest = {
      listNm: '2026-05 主力催收',
      listPeriodStart: 1,
      listPeriodEnd: 6,
      listInterval: 1,
      crEnabled: true,
      conditionPayload: {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
        ],
        logic: 'AND',
      },
    };
    expect(dto.conditionPayload.conditions.length).toBe(1);
    // type 層級：DTO 不應允許 prodKind / caseYear 等 5 個一級欄位（5a 已從 DTO 移除）
    expectTypeOf(dto).not.toHaveProperty('prodKind' as never);
    expectTypeOf(dto).not.toHaveProperty('caseYear' as never);
    expectTypeOf(dto).not.toHaveProperty('specTp' as never);
    expectTypeOf(dto).not.toHaveProperty('caseStatus' as never);
    expectTypeOf(dto).not.toHaveProperty('settleSrc' as never);
  });

  it('api-7-4：UpdateListRequest 所有欄位 optional（含 conditionPayload）', () => {
    const dto1: UpdateListRequest = { listNm: '改名' };
    const dto2: UpdateListRequest = {
      conditionPayload: { conditions: [], logic: 'AND' },
    };
    const dto3: UpdateListRequest = {};
    expect(dto1.listNm).toBe('改名');
    expect(dto2.conditionPayload?.logic).toBe('AND');
    expect(Object.keys(dto3).length).toBe(0);
  });

  it('api-7-5：AssignmentListItem 補 conditionPayload?: ConditionPayload | null（v2.1 read-through）', () => {
    const item: AssignmentListItem = {
      listNo: 'OB202605001',
      listNm: '測試',
      prodKind: '01',
      caseYear: '1',
      specTp: '01',
      caseStatus: '01',
      crEnabled: true,
      listPeriodStart: 0,
      listPeriodEnd: 999,
      listInterval: 30,
      settleSrc: 'N',
      cardType: 'M3',
      prodBest: null,
      status: 'active',
      stage: 'draft',
      createdBy: 'd1',
      createdAt: '2026-05-01',
      updatedAt: '2026-05-01',
      conditionPayload: {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
        ],
        logic: 'AND',
      },
    };
    expect(item.conditionPayload?.conditions.length).toBe(1);

    const legacyItem: AssignmentListItem = {
      ...item,
      conditionPayload: null, // LEGACY 名單（v2.0 遷移資料）
    };
    expect(legacyItem.conditionPayload).toBeNull();
  });
});
