/**
 * F075 v1.4.7 — PooldataFieldWhitelistController integration tests（HTTP body shape）
 *
 * 補測 columnDescription 出現在 HTTP 200 body 內，確保 controller → service → DTO 不漏 field。
 *
 * 採用 Test.createTestingModule + 直接呼叫 controller method 模式（與既有 service spec 一致），
 * 避免引入 supertest / full HTTP stack 開銷。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { PooldataFieldWhitelistController } from '../controllers/pooldata-field-whitelist.controller';
import { PooldataFieldWhitelistService } from '../services/pooldata-field-whitelist.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorGuard } from '@/common/guards/director.guard';
import { DirectorOrSectionChiefGuard } from '@/common/guards/director-or-section-chief.guard';
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';

describe('PooldataFieldWhitelistController (F075 v1.4.7 — INT)', () => {
  let controller: PooldataFieldWhitelistController;
  let service: any;

  beforeEach(async () => {
    service = {
      getAvailableColumns: vi.fn(),
    };

    const passThroughGuard = { canActivate: () => true };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PooldataFieldWhitelistController],
      providers: [
        { provide: PooldataFieldWhitelistService, useValue: service },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(passThroughGuard)
      .overrideGuard(DirectorGuard)
      .useValue(passThroughGuard)
      .overrideGuard(DirectorOrSectionChiefGuard)
      .useValue(passThroughGuard)
      .overrideGuard(FeatureFlagGuard)
      .useValue(passThroughGuard)
      .compile();

    controller = module.get(PooldataFieldWhitelistController);
  });

  it('TS-F075-BE-V147-INT-01：GET /available-columns 200 body 含 columnDescription（有描述者）+ omit（無描述者）', async () => {
    service.getAvailableColumns.mockResolvedValue({
      availableColumns: [
        {
          columnName: 'birth_date',
          dataType: 'date',
          suggestedFieldType: 'date',
          columnDescription: '出生日期',
        },
        {
          columnName: 'cust_age',
          dataType: 'integer',
          suggestedFieldType: 'numeric',
          // columnDescription 故意 omit
        },
      ],
    });

    const result = await controller.getAvailableColumns();

    expect(result.availableColumns).toHaveLength(2);
    const [first, second] = result.availableColumns;
    expect(first.columnName).toBe('birth_date');
    expect((first as any).columnDescription).toBe('出生日期');
    expect(second.columnName).toBe('cust_age');
    expect(second).not.toHaveProperty('columnDescription');

    // JSON.stringify 也不會帶上 columnDescription（omit 而非 null）
    const serialized = JSON.stringify(result);
    const reparsed = JSON.parse(serialized);
    expect(reparsed.availableColumns[1]).not.toHaveProperty('columnDescription');
  });
});
