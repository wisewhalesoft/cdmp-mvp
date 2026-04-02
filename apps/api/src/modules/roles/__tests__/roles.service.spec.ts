import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RolesService } from '../roles.service';
import { Role } from '@/database/entities/role.entity';

describe('RolesService', () => {
  let service: RolesService;
  let roleRepository: {
    find: ReturnType<typeof vi.fn>;
  };

  const seedRoles: Role[] = [
    { role_code: 'admin', display_name: '管理者', alias: 'Admin', type: 'system', created_at: new Date() },
    { role_code: 'user', display_name: '使用者', alias: 'User', type: 'system', created_at: new Date() },
    { role_code: 'analyst', display_name: '分析師', alias: null, type: 'business', created_at: new Date() },
    { role_code: 'backend_ops', display_name: '後端作業', alias: '作服', type: 'business', created_at: new Date() },
    { role_code: 'business', display_name: '業務', alias: null, type: 'business', created_at: new Date() },
    { role_code: 'customer_service', display_name: '客服', alias: null, type: 'business', created_at: new Date() },
    { role_code: 'marketing', display_name: '行銷', alias: '企劃', type: 'business', created_at: new Date() },
    { role_code: 'supervisor', display_name: '主管', alias: null, type: 'business', created_at: new Date() },
  ];

  beforeEach(async () => {
    roleRepository = {
      find: vi.fn().mockResolvedValue(seedRoles),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(Role), useValue: roleRepository },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  // TS-F045-001: Seed Data 完整性驗證 — 8 種角色全部存在
  it('should return all 8 roles (TS-F045-001)', async () => {
    const result = await service.findAll();
    expect(result).toHaveLength(8);
    const roleCodes = result.map((r) => r.roleCode);
    expect(roleCodes).toContain('admin');
    expect(roleCodes).toContain('user');
    expect(roleCodes).toContain('business');
    expect(roleCodes).toContain('marketing');
    expect(roleCodes).toContain('customer_service');
    expect(roleCodes).toContain('analyst');
    expect(roleCodes).toContain('supervisor');
    expect(roleCodes).toContain('backend_ops');
  });

  // TS-F045-003: 系統角色欄位正確性驗證
  it('should return correct system role fields (TS-F045-003)', async () => {
    const result = await service.findAll();
    const admin = result.find((r) => r.roleCode === 'admin');
    expect(admin).toEqual({
      roleCode: 'admin',
      displayName: '管理者',
      alias: 'Admin',
      type: 'system',
    });

    const user = result.find((r) => r.roleCode === 'user');
    expect(user).toEqual({
      roleCode: 'user',
      displayName: '使用者',
      alias: 'User',
      type: 'system',
    });
  });

  // TS-F045-004: 業務角色欄位正確性驗證（含別名）
  it('should return correct business role fields with aliases (TS-F045-004)', async () => {
    const result = await service.findAll();

    const marketing = result.find((r) => r.roleCode === 'marketing');
    expect(marketing?.displayName).toBe('行銷');
    expect(marketing?.alias).toBe('企劃');
    expect(marketing?.type).toBe('business');

    const backendOps = result.find((r) => r.roleCode === 'backend_ops');
    expect(backendOps?.displayName).toBe('後端作業');
    expect(backendOps?.alias).toBe('作服');
    expect(backendOps?.type).toBe('business');

    const analyst = result.find((r) => r.roleCode === 'analyst');
    expect(analyst?.alias).toBeNull();

    const business = result.find((r) => r.roleCode === 'business');
    expect(business?.alias).toBeNull();
  });

  // TS-F045-013: Response 不含敏感欄位
  it('should not include internal fields like created_at (TS-F045-013)', async () => {
    const result = await service.findAll();
    for (const role of result) {
      expect(role).toHaveProperty('roleCode');
      expect(role).toHaveProperty('displayName');
      expect(role).toHaveProperty('alias');
      expect(role).toHaveProperty('type');
      expect(role).not.toHaveProperty('created_at');
      expect(role).not.toHaveProperty('role_code');
      expect(role).not.toHaveProperty('display_name');
    }
  });
});
