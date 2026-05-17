/**
 * F076 v1.3 / P1 B5：DTO 驗證測試（class-validator）
 *
 * 涵蓋 TC：
 *   TC-PATCH-DEFENSE     UpdatePooldataOptionDto：isActive=false → 422
 *   TC-PATCH-DEFENSE-2   UpdatePooldataOptionDto：isActive=true → 通過
 *   TC-DEACTIVATE-REASON DeactivatePooldataOptionDto：reason 空 / 超長 / 正常
 *   TC-DEACTIVATE-ISACTIVE-DEFENSE：isActive=true 傳給 deactivate → 422
 */

import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePooldataOptionDto } from '../dto/update-pooldata-option.dto';
import { DeactivatePooldataOptionDto } from '../dto/deactivate-pooldata-option.dto';

describe('UpdatePooldataOptionDto (TC-PATCH-DEFENSE)', () => {
  it('TC-PATCH-DEFENSE：isActive=false → validation fail', async () => {
    const dto = plainToInstance(UpdatePooldataOptionDto, { isActive: false });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.join('\n')).toMatch(/僅支援重新啟用/);
  });

  it('TC-PATCH-DEFENSE-2：isActive=true → 通過', async () => {
    const dto = plainToInstance(UpdatePooldataOptionDto, { isActive: true });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('TC-PATCH-DEFENSE-3：isActive 缺失 → validation fail', async () => {
    const dto = plainToInstance(UpdatePooldataOptionDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TC-PATCH-DEFENSE-4：optionLabel 超 100 字 → fail', async () => {
    const dto = plainToInstance(UpdatePooldataOptionDto, {
      isActive: true,
      optionLabel: 'A'.repeat(101),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('DeactivatePooldataOptionDto (TC-DEACTIVATE-REASON)', () => {
  it('TC-DEACTIVATE-REASON-EMPTY：reason 空字串 → fail', async () => {
    const dto = plainToInstance(DeactivatePooldataOptionDto, {
      isActive: false,
      reason: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.join('\n')).toMatch(/原因/);
  });

  it('TC-DEACTIVATE-REASON-MISSING：reason 缺失 → fail', async () => {
    const dto = plainToInstance(DeactivatePooldataOptionDto, { isActive: false });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TC-DEACTIVATE-REASON-OVER-200：reason 201 字 → fail', async () => {
    const dto = plainToInstance(DeactivatePooldataOptionDto, {
      isActive: false,
      reason: 'A'.repeat(201),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.join('\n')).toMatch(/不得超過 200 字/);
  });

  it('TC-DEACTIVATE-REASON-EXACTLY-200：reason 200 字 → 通過（邊界）', async () => {
    const dto = plainToInstance(DeactivatePooldataOptionDto, {
      isActive: false,
      reason: 'A'.repeat(200),
    });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('TC-DEACTIVATE-REASON-1CHAR：reason 1 字 → 通過（最小邊界）', async () => {
    const dto = plainToInstance(DeactivatePooldataOptionDto, {
      isActive: false,
      reason: 'X',
    });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('TC-DEACTIVATE-REASON-NORMAL：合法輸入通過', async () => {
    const dto = plainToInstance(DeactivatePooldataOptionDto, {
      isActive: false,
      reason: '本產品 2026 起停售，可選值不再使用',
    });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('TC-DEACTIVATE-ISACTIVE-DEFENSE：isActive=true 傳給 deactivate → fail', async () => {
    const dto = plainToInstance(DeactivatePooldataOptionDto, {
      isActive: true,
      reason: '理由',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.join('\n')).toMatch(/僅支援停用/);
  });
});
