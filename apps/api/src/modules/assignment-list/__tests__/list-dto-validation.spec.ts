/**
 * F050 v2.1 / F051 v2.1：CreateListDto / UpdateListDto class-validator schema 單元測試
 *
 * Phase 5a 波 3：
 *   - DTO 移除 prodKind / caseYear / specTp / caseStatus / settleSrc 5 個欄位
 *   - conditionPayload 改為 ConditionPayloadDto nested validated（CreateListDto 必填 / UpdateListDto 選填）
 *   - ConditionItemDto 依 fieldType 分流 categorical / numeric / date 欄位驗證
 *
 * 對應 spec / test design：
 *   - F050 §5.4 condition_payload JSON Schema
 *   - F050 §AC-7 v2.1 必填欄位範圍縮減
 *   - error-handling.md：RESERVED_FIELD_IN_CONDITIONS 由 service 層擲（非 DTO）
 *   - TS-F050-001 / 002 / 012 / 029 / 030 之 DTO 層
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateListDto } from '../dto/create-list.dto';
import { UpdateListDto } from '../dto/update-list.dto';

function flattenConstraints(errs: ValidationError[]): string[] {
  const out: string[] = [];
  const walk = (e: ValidationError) => {
    if (e.constraints) {
      out.push(...Object.values(e.constraints));
    }
    if (e.children && e.children.length) {
      e.children.forEach(walk);
    }
  };
  errs.forEach(walk);
  return out;
}

function baseCreate(overrides: Partial<any> = {}) {
  return {
    listNm: '車貸月名單分派名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: '01',
    prodBest: null,
    crEnabled: false,
    conditionPayload: {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    },
    copyFromListNo: null,
    ...overrides,
  };
}

function baseUpdate(overrides: Partial<any> = {}) {
  const dto = baseCreate(overrides);
  delete (dto as any).copyFromListNo;
  return dto;
}

describe('CreateListDto v2.1 validation', () => {
  it('DTO-CREATE-001：conditionPayload 缺欄位 → 失敗', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({ conditionPayload: undefined }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
    const messages = flattenConstraints(errs).join('|');
    expect(messages.toLowerCase()).toMatch(/conditionpayload|object|defined/i);
  });

  it('DTO-CREATE-002：conditionPayload.conditions = [] → 失敗', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: { conditions: [], logic: 'AND' },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
    const messages = flattenConstraints(errs).join('|');
    expect(messages).toMatch(/篩選條件不得為空|conditions/i);
  });

  it('DTO-CREATE-003：columnName 為大寫 PROD_KIND → 失敗（lowercase snake_case regex）', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [{ columnName: 'PROD_KIND', fieldType: 'categorical', values: ['01'] }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
    const messages = flattenConstraints(errs).join('|');
    expect(messages).toMatch(/columnName|lowercase|snake/i);
  });

  it('DTO-CREATE-004：fieldType = "unknown" → 失敗', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [{ columnName: 'prod_kind', fieldType: 'unknown', values: ['01'] }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
    const messages = flattenConstraints(errs).join('|');
    expect(messages).toMatch(/fieldType|categorical|numeric|date/i);
  });

  it('DTO-CREATE-005：categorical 條件 values 為空陣列 → 失敗', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: [] }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('DTO-CREATE-006a：numeric 條件無 min / max → 失敗', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [{ columnName: 'month_cnt', fieldType: 'numeric' }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('DTO-CREATE-006b：numeric 條件 max < min → 失敗', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [{ columnName: 'month_cnt', fieldType: 'numeric', min: 5, max: 3 }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('DTO-CREATE-007：date 條件 dateStart > dateEnd → 失敗', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [{ columnName: 'birth_date', fieldType: 'date', dateStart: '2005-01-01', dateEnd: '2000-01-01' }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('DTO-CREATE-008：listNm 留空 → 失敗', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({ listNm: '' }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('DTO-CREATE-010：不含 prodKind / caseYear / specTp / caseStatus / settleSrc 但 conditionPayload 合法 → 通過', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate());
    // 確認 baseCreate 不含舊欄位
    expect((dto as any).prodKind).toBeUndefined();
    expect((dto as any).caseYear).toBeUndefined();
    expect((dto as any).specTp).toBeUndefined();
    expect((dto as any).caseStatus).toBeUndefined();
    expect((dto as any).settleSrc).toBeUndefined();
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('DTO-CREATE-011：合法 date 條件 → 通過', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [{ columnName: 'birth_date', fieldType: 'date', dateStart: '2000-01-01', dateEnd: '2005-12-31' }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('DTO-CREATE-012：合法 numeric 條件 → 通過', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [{ columnName: 'month_cnt', fieldType: 'numeric', min: 1, max: 6 }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('DTO-CREATE-013：合法 mixed 條件（categorical + numeric + date）→ 通過', async () => {
    const dto = plainToInstance(CreateListDto, baseCreate({
      conditionPayload: {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          { columnName: 'month_cnt', fieldType: 'numeric', min: 1, max: 6 },
          { columnName: 'birth_date', fieldType: 'date', dateStart: '2000-01-01', dateEnd: '2005-12-31' },
        ],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });
});

describe('UpdateListDto v2.1 validation', () => {
  it('DTO-UPDATE-001：conditionPayload 缺欄位 → 通過（optional；舊名單允許只送 listNm）', async () => {
    const dto = plainToInstance(UpdateListDto, baseUpdate({ conditionPayload: undefined }));
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('DTO-UPDATE-002：conditionPayload.conditions = [] → 失敗', async () => {
    const dto = plainToInstance(UpdateListDto, baseUpdate({
      conditionPayload: { conditions: [], logic: 'AND' },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('DTO-UPDATE-003：UpdateListDto 不接受 copyFromListNo（屬 Create 專屬）— 合法 schema 通過', async () => {
    const dto = plainToInstance(UpdateListDto, baseUpdate());
    expect((dto as any).copyFromListNo).toBeUndefined();
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('DTO-UPDATE-004：columnName 大寫 → 失敗', async () => {
    const dto = plainToInstance(UpdateListDto, baseUpdate({
      conditionPayload: {
        conditions: [{ columnName: 'PROD_KIND', fieldType: 'categorical', values: ['01'] }],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('DTO-UPDATE-005：合法 mixed conditions → 通過', async () => {
    const dto = plainToInstance(UpdateListDto, baseUpdate({
      conditionPayload: {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] },
          { columnName: 'month_cnt', fieldType: 'numeric', min: 1, max: 6 },
        ],
        logic: 'AND',
      },
    }));
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });
});

/**
 * v2.1.1 補強（US-126 / US-128 / architecture-spec §18.11.6）：
 *   E 群組 — DTO prodBest 採方案 Y backward-compat（保留 @IsOptional 接受 null/empty/undefined，
 *   service 層 ignore 不寫入 entity）+ cardType @MaxLength(5) 對齊 ob_card_type.card_type
 *
 * 對應 test spec：F050-test.md §十四 E 群組（TS-F050-E01 ~ E06）
 */
describe('v2.1.1 補強 — E 群組 DTO prodBest backward-compat + cardType @MaxLength(5)', () => {
  describe('TS-F050-E01~E03：CreateListDto prodBest 方案 Y backward-compat', () => {
    it('TS-F050-E01：prodBest: null 不產生 validation error', async () => {
      const dto = plainToInstance(CreateListDto, baseCreate({ prodBest: null }));
      const errs = await validate(dto);
      const messages = flattenConstraints(errs).join('|');
      expect(messages).not.toMatch(/prodBest/i);
    });

    it('TS-F050-E02：prodBest: \'\' (空字串) 不產生 validation error', async () => {
      const dto = plainToInstance(CreateListDto, baseCreate({ prodBest: '' }));
      const errs = await validate(dto);
      const messages = flattenConstraints(errs).join('|');
      expect(messages).not.toMatch(/prodBest/i);
    });

    it('TS-F050-E03：prodBest 欄位不傳（undefined）不產生 validation error', async () => {
      const data = baseCreate();
      delete (data as any).prodBest;
      const dto = plainToInstance(CreateListDto, data);
      const errs = await validate(dto);
      const messages = flattenConstraints(errs).join('|');
      expect(messages).not.toMatch(/prodBest/i);
    });
  });

  describe('TS-F050-E04：UpdateListDto prodBest 方案 Y backward-compat', () => {
    it('TS-F050-E04a：UpdateListDto prodBest: null 不產生 validation error', async () => {
      const dto = plainToInstance(UpdateListDto, baseUpdate({ prodBest: null }));
      const errs = await validate(dto);
      const messages = flattenConstraints(errs).join('|');
      expect(messages).not.toMatch(/prodBest/i);
    });

    it('TS-F050-E04b：UpdateListDto prodBest: undefined 不產生 validation error', async () => {
      const data = baseUpdate();
      delete (data as any).prodBest;
      const dto = plainToInstance(UpdateListDto, data);
      const errs = await validate(dto);
      const messages = flattenConstraints(errs).join('|');
      expect(messages).not.toMatch(/prodBest/i);
    });
  });

  describe('TS-F050-E05/E06：CreateListDto cardType @MaxLength(5)', () => {
    it('TS-F050-E05：cardType 6 字元（超過上限）→ 422 errors 含 cardType', async () => {
      const dto = plainToInstance(CreateListDto, baseCreate({ cardType: 'ABCDEF' }));
      const errs = await validate(dto);
      expect(errs.length).toBeGreaterThan(0);
      const cardTypeErr = errs.find((e) => e.property === 'cardType');
      expect(cardTypeErr).toBeDefined();
      // class-validator MaxLength 標準 constraint key 為 'maxLength'，訊息含
      // "must be shorter than or equal to 5 characters"
      expect(cardTypeErr!.constraints).toBeDefined();
      expect(Object.keys(cardTypeErr!.constraints!)).toContain('maxLength');
    });

    it('TS-F050-E06：cardType 5 字元（邊界正向）→ 通過驗證', async () => {
      const dto = plainToInstance(CreateListDto, baseCreate({ cardType: 'ABCDE' }));
      const errs = await validate(dto);
      const messages = flattenConstraints(errs).join('|');
      expect(messages).not.toMatch(/cardType/);
    });
  });
});
