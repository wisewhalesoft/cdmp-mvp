/**
 * Users 測試資料 fixture（F073 / F074 / AD-E07 v3.0）
 *
 * 提供 5 個 builder，覆蓋 E07 業務角色矩陣：
 *   1. buildAdmin()              — role='admin' / business_role=null（自動繼承全範圍）
 *   2. buildDirector()           — role='user' / business_role='director'
 *   3. buildSectionChief()       — role='user' / business_role='section_chief'
 *   4. buildRegularUser()        — role='user' / business_role=null（E07 全無權）
 *   5. buildLegacySalesManager() — role='user' / is_sales_manager=true / business_role=null
 *                                  （回溯相容；m14 之後欄位 DROP，本 builder 保留供測 legacy detection）
 *
 * 對應 spec：F002 v2.0 §4.6 角色矩陣 / architecture-spec §E07 後端 Guard 元件清單
 */

import type { User } from '@/database/entities/user.entity';

export interface BuildUserOptions {
  id?: string;
  name?: string;
  email?: string;
  password_hash?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'disabled';
  business_role?: 'director' | 'section_chief' | null;
  is_sales_manager?: boolean;
  password_changed_at?: Date | null;
}

let counter = 1000;

function baseUser(opts: BuildUserOptions): User {
  const id = opts.id ?? `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;
  return {
    id,
    name: opts.name ?? '測試使用者',
    email: opts.email ?? `${id}@cdmp.test`,
    password_hash: opts.password_hash ?? '$2b$10$placeholder.hash.value.for.testing.only.32chars.x',
    role: opts.role ?? 'user',
    status: opts.status ?? 'active',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    password_changed_at: opts.password_changed_at ?? null,
    is_sales_manager: opts.is_sales_manager ?? false,
    business_role: opts.business_role ?? null,
  };
}

/** Admin 帳號（admin 一律放行 E07 全 Guard，無需 business_role）。 */
export function buildAdmin(opts: BuildUserOptions = {}): User {
  return baseUser({
    ...opts,
    role: 'admin',
    business_role: opts.business_role ?? null,
    name: opts.name ?? 'Admin 帳號',
  });
}

/** 業務部長（E07 全模組 RW）。 */
export function buildDirector(opts: BuildUserOptions = {}): User {
  return baseUser({
    ...opts,
    role: 'user',
    business_role: 'director',
    name: opts.name ?? '業務部長',
  });
}

/** 業務處長（限轄區 RW；M02 完全不可見）。 */
export function buildSectionChief(opts: BuildUserOptions = {}): User {
  return baseUser({
    ...opts,
    role: 'user',
    business_role: 'section_chief',
    name: opts.name ?? '業務處長',
  });
}

/** 一般 user（無 E07 角色 → DirectorOrSectionChiefGuard 攔截 E07_ROLE_NOT_ASSIGNED）。 */
export function buildRegularUser(opts: BuildUserOptions = {}): User {
  return baseUser({
    ...opts,
    role: 'user',
    business_role: null,
    name: opts.name ?? '一般使用者',
  });
}

/**
 * v1.x 殘留：is_sales_manager=true 但無 business_role。
 * 供 LegacyDetectionService 測試使用；m14 之後 is_sales_manager column 應已 DROP。
 */
export function buildLegacySalesManager(opts: BuildUserOptions = {}): User {
  return baseUser({
    ...opts,
    role: 'user',
    is_sales_manager: true,
    business_role: null,
    name: opts.name ?? 'Legacy 業務主管殘留',
  });
}

/** 重置 counter（測試之間隔離用） */
export function resetUserCounter(): void {
  counter = 1000;
}
