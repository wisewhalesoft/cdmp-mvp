/**
 * F070 AC-5 / F071 AC-6 / F050 v2.1 重構（AD-E07-18 §18.2.7 / §18.7）：
 *   assertProdKindActive 已從 ob_code_df 遷移至 pooldata_field_option。
 *
 * 對應 test spec：
 *   - MT-M5-001：F069 / helper 不再讀取 ob_code_df（regression-guard 靜態驗證 + behavior）
 *   - TS-F068-DEP-006：M5 閘門驗證（F069 / helper 改用 pooldata_field_option）
 *
 * 涵蓋 cases：
 *   - assertProdKindActive 接 Repository<PooldataFieldOption>，查詢條件
 *     column_name='prod_kind' AND option_value=:prodKind AND is_active=true
 *   - 有對應 active option → 通過
 *   - 無對應 option → 422 VALIDATION_ERROR
 *   - option is_active=false → 422 VALIDATION_ERROR
 *   - error.details 含 field='prodKind' 與 value
 */

import { describe, it, expect, vi } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { assertProdKindActive } from '../prod-kind.helper';
import type { Repository } from 'typeorm';
import type { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';

function mockOptionRepo(impl: Partial<Repository<PooldataFieldOption>> = {}): Repository<PooldataFieldOption> {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    ...impl,
  } as unknown as Repository<PooldataFieldOption>;
}

describe('assertProdKindActive (v2.1 / pooldata_field_option 來源)', () => {
  it('有對應 active option → 通過（不拋）', async () => {
    const repo = mockOptionRepo({
      findOne: vi.fn().mockResolvedValue({
        column_name: 'prod_kind',
        option_value: '01',
        option_label: '汽車',
        is_active: true,
      }) as any,
    });

    await expect(assertProdKindActive(repo, '01')).resolves.toBeUndefined();
  });

  it('查詢條件必含 column_name=prod_kind AND option_value=:prodKind AND is_active=true', async () => {
    const findOne = vi.fn().mockResolvedValue({
      column_name: 'prod_kind',
      option_value: '01',
      option_label: '汽車',
      is_active: true,
    });
    const repo = mockOptionRepo({ findOne: findOne as any });

    await assertProdKindActive(repo, '01');

    expect(findOne).toHaveBeenCalledTimes(1);
    const args = findOne.mock.calls[0][0];
    expect(args.where.column_name).toBe('prod_kind');
    expect(args.where.option_value).toBe('01');
    expect(args.where.is_active).toBe(true);
  });

  it('無對應 option → 422 VALIDATION_ERROR + field=prodKind', async () => {
    const repo = mockOptionRepo({
      findOne: vi.fn().mockResolvedValue(null) as any,
    });

    let caught: any;
    try {
      await assertProdKindActive(repo, '99');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body: any = caught.getResponse();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details.field).toBe('prodKind');
    expect(body.details.value).toBe('99');
  });

  it('option is_active=false → 422（is_active 過濾於 where 條件中，findOne 回 null）', async () => {
    // 設計上 is_active=true 已寫進 where；若 DB option is_active=false，findOne 自然回 null
    const repo = mockOptionRepo({
      findOne: vi.fn().mockResolvedValue(null) as any,
    });

    await expect(assertProdKindActive(repo, '99')).rejects.toThrow(UnprocessableEntityException);
  });
});
