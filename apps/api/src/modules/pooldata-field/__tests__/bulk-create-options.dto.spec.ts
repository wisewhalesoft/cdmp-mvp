/**
 * F112 / AD-E07-47 §3.11：BulkCreateOptionsDto 驗證測試（class-validator）
 *
 * 涵蓋 F112-test.md：
 *   BULK-009  options 空陣列 → ArrayMinSize(1) 失敗（→ 422 VALIDATION_ERROR）
 *   BULK-010  options.length > DISTINCT_VALUES_CAP(201) → ArrayMaxSize 失敗；
 *             且 ArrayMaxSize 上限與 DISTINCT_VALUES_CAP 為同一常數（非字面量）
 *   BULK-011  optionValue > 64 / optionLabel > 100 → 巢狀驗證失敗
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkCreateOptionsDto } from '../dto/bulk-create-options.dto';
import { DISTINCT_VALUES_CAP } from '../pooldata-field.constants';

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    optionValue: `v${i}`,
    optionLabel: `v${i}`,
  }));

describe('BulkCreateOptionsDto (F112)', () => {
  it('BULK-009：options 空陣列 → 驗證失敗（ArrayMinSize）', async () => {
    const dto = plainToInstance(BulkCreateOptionsDto, { options: [] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.join('\n')).toMatch(/至少需 1 筆/);
  });

  it('BULK-010：options 超過 CAP（CAP+1 筆）→ 驗證失敗（ArrayMaxSize）', async () => {
    const dto = plainToInstance(BulkCreateOptionsDto, {
      options: makeItems(DISTINCT_VALUES_CAP + 1),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.join('\n')).toMatch(/不得超過/);
  });

  it('BULK-010b：ArrayMaxSize 上限恰等於 DISTINCT_VALUES_CAP（同一常數，非字面量 200）— CAP 筆通過、CAP+1 失敗', async () => {
    const atCap = plainToInstance(BulkCreateOptionsDto, {
      options: makeItems(DISTINCT_VALUES_CAP),
    });
    expect(await validate(atCap)).toEqual([]);

    const overCap = plainToInstance(BulkCreateOptionsDto, {
      options: makeItems(DISTINCT_VALUES_CAP + 1),
    });
    expect((await validate(overCap)).length).toBeGreaterThan(0);
  });

  it('BULK-011a：optionValue 超過 64 字元 → 巢狀驗證失敗', async () => {
    const dto = plainToInstance(BulkCreateOptionsDto, {
      options: [{ optionValue: 'A'.repeat(65), optionLabel: 'x' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('BULK-011b：optionLabel 超過 100 字元 → 巢狀驗證失敗', async () => {
    const dto = plainToInstance(BulkCreateOptionsDto, {
      options: [{ optionValue: 'x', optionLabel: 'A'.repeat(101) }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('合法最小 payload（1 筆、長度合規）→ 通過', async () => {
    const dto = plainToInstance(BulkCreateOptionsDto, {
      options: [{ optionValue: '工程師', optionLabel: '工程師' }],
    });
    expect(await validate(dto)).toEqual([]);
  });
});
