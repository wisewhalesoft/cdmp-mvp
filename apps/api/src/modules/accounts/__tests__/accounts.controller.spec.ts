/**
 * F006a / AD-E07 v3.0 / E07 重構 P1 B1 / 2026-05-16
 *
 * AccountsController 行為驗證：
 *   TC-DEPRECATED-1  PATCH /sales-manager-flag → 410 Gone + ENDPOINT_GONE + 引導訊息
 *   TC-DEPRECATED-2  PATCH /e07-role → 410 Gone + ENDPOINT_GONE + 引導訊息
 *   TC-CTRL-BR-1     PATCH /:id/business-role 委派至 service.updateBusinessRole(id, dto.business_role, actorId)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoneException } from '@nestjs/common';
import { AccountsController } from '../accounts.controller';
import { AccountsService } from '../accounts.service';

describe('AccountsController — F006a + DEPRECATED endpoints', () => {
  let controller: AccountsController;
  let svc: { updateBusinessRole: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    svc = {
      updateBusinessRole: vi.fn().mockResolvedValue({
        id: 'u1',
        business_role: 'director',
      }),
    };
    controller = new AccountsController(svc as unknown as AccountsService);
  });

  it('TC-DEPRECATED-1 PATCH /:id/sales-manager-flag → 410 Gone (ENDPOINT_GONE)', () => {
    try {
      controller.updateSalesManagerFlag();
      throw new Error('預期拋出 GoneException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(GoneException);
      expect(err.getStatus()).toBe(410);
      const resp = err.getResponse();
      expect(resp.error).toBe('ENDPOINT_GONE');
      expect(resp.message).toMatch(/business-role/);
    }
  });

  it('TC-DEPRECATED-2 PATCH /:id/e07-role → 410 Gone (ENDPOINT_GONE)', () => {
    try {
      controller.updateE07Role();
      throw new Error('預期拋出 GoneException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(GoneException);
      expect(err.getStatus()).toBe(410);
      const resp = err.getResponse();
      expect(resp.error).toBe('ENDPOINT_GONE');
      expect(resp.message).toMatch(/business-role/);
    }
  });

  it('TC-CTRL-BR-1 PATCH /:id/business-role 委派至 service.updateBusinessRole', async () => {
    const req = { user: { userId: 'admin-1' } };
    await controller.updateBusinessRole(
      'target-1',
      { business_role: 'director' } as any,
      req as any,
    );
    expect(svc.updateBusinessRole).toHaveBeenCalledWith('target-1', 'director', 'admin-1');
  });

  it('TC-CTRL-BR-2 PATCH /:id/business-role 傳 null 撤銷', async () => {
    const req = { user: { userId: 'admin-1' } };
    await controller.updateBusinessRole(
      'target-1',
      { business_role: null } as any,
      req as any,
    );
    expect(svc.updateBusinessRole).toHaveBeenCalledWith('target-1', null, 'admin-1');
  });
});
