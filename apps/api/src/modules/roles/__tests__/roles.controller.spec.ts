import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RolesController } from '../roles.controller';
import { RolesService } from '../roles.service';

// Mock guards to allow direct controller testing
vi.mock('@/common/guards/auth.guard', () => ({
  AuthGuard: class {
    canActivate() { return true; }
  },
}));
vi.mock('@/common/guards/roles.guard', () => ({
  RolesGuard: class {
    canActivate() { return true; }
  },
}));

describe('RolesController', () => {
  let controller: RolesController;
  let rolesService: { findAll: ReturnType<typeof vi.fn> };

  const mockRoles = [
    { roleCode: 'admin', displayName: '管理者', alias: 'Admin', type: 'system' },
    { roleCode: 'user', displayName: '使用者', alias: 'User', type: 'system' },
  ];

  beforeEach(async () => {
    rolesService = {
      findAll: vi.fn().mockResolvedValue(mockRoles),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: rolesService }],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  // TS-F045-002: GET /api/roles — Admin 可存取
  it('should return roles wrapped in data property (TS-F045-002)', async () => {
    const result = await controller.findAll();
    expect(result).toEqual({ data: mockRoles });
    expect(rolesService.findAll).toHaveBeenCalledOnce();
  });

  // TS-F045-008: POST /api/roles 嘗試新增角色 — 403
  it('should throw ForbiddenException for POST /api/roles (TS-F045-008)', async () => {
    await expect(controller.create()).rejects.toThrow(ForbiddenException);
  });

  // TS-F045-009: DELETE /api/roles/:code — 403
  it('should throw ForbiddenException for DELETE /api/roles/:code (TS-F045-009)', async () => {
    await expect(controller.remove('business')).rejects.toThrow(ForbiddenException);
  });

  // TS-F045-010: DELETE /api/roles/admin — 刪除系統角色也被拒
  it('should throw ForbiddenException for DELETE /api/roles/admin (TS-F045-010)', async () => {
    await expect(controller.remove('admin')).rejects.toThrow(ForbiddenException);
  });
});
