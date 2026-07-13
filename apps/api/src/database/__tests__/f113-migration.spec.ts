/**
 * F113 / AD-E02-5 — Migration + Entity + 型別同步 靜態守門。
 *
 * 覆蓋 F113-test.md：SCHEMA 靜態（001~005）+ STATIC-003（登入 employee_no 分支不 trim）
 *   + STATIC-004（10 interface 型別同步）。
 * （SCHEMA-006 live 結構斷言屬 .mssql.spec.ts，本機 SQLite 無法執行，見報告說明。）
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const API_SRC = join(__dirname, '..', '..');
const MIGRATION_PATH = join(
  API_SRC,
  'database',
  'migrations',
  'mssql',
  '1751884800004-MssqlAddUsersEmployeeNo.ts',
);
const ENTITY_PATH = join(API_SRC, 'database', 'entities', 'user.entity.ts');
const AUTH_SERVICE_PATH = join(API_SRC, 'modules', 'auth', 'auth.service.ts');
const ACCOUNTS_SERVICE_PATH = join(API_SRC, 'modules', 'accounts', 'accounts.service.ts');
const SHARED_PATH = join(API_SRC, '..', '..', '..', 'packages', 'shared', 'src', 'index.ts');

const migrationSrc = readFileSync(MIGRATION_PATH, 'utf8');
const entitySrc = readFileSync(ENTITY_PATH, 'utf8');

// 擷取 marker 起至下一個 export/宣告邊界的區塊。
function sectionAfter(src: string, marker: string): string {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  const rest = src.slice(i + marker.length);
  const m = rest.search(/\nexport (interface|type|const|class|function)\b|\n@Injectable/);
  return m >= 0 ? rest.slice(0, m) : rest;
}

describe('F113 — Migration 1751884800004（SCHEMA 靜態）', () => {
  // TS-F113-SCHEMA-001
  it('SCHEMA-001: up() 含 ALTER TABLE users ADD employee_no varchar(32) NULL（非 NOT NULL）', () => {
    expect(migrationSrc).toMatch(/ALTER TABLE "users" ADD "employee_no" varchar\(32\) NULL/);
    expect(migrationSrc).not.toMatch(/employee_no" varchar\(32\) NOT NULL/);
  });

  // TS-F113-SCHEMA-002
  it('SCHEMA-002: up() 建 filtered unique index uq_users_employee_no ... WHERE employee_no IS NOT NULL', () => {
    expect(migrationSrc).toMatch(
      /CREATE UNIQUE INDEX "uq_users_employee_no" ON "users" \("employee_no"\) WHERE "employee_no" IS NOT NULL/,
    );
    // 命名修正：非任務指示原建議之 UX_ 前綴
    expect(migrationSrc).not.toContain('UX_users_employee_no');
  });

  // TS-F113-SCHEMA-003 ⚠️ 無 COLLATE
  it('SCHEMA-003: migration 全文不含任何 COLLATE 關鍵字（I-EMPNO-NO-COLLATE-OVERRIDE-01）', () => {
    expect(migrationSrc.toUpperCase().includes('COLLATE')).toBe(false);
  });

  // TS-F113-SCHEMA-005
  it('SCHEMA-005: down() 先 DROP INDEX 後 DROP COLUMN', () => {
    const dropIndexIdx = migrationSrc.indexOf('DROP INDEX "uq_users_employee_no" ON "users"');
    const dropColIdx = migrationSrc.indexOf('DROP COLUMN "employee_no"');
    expect(dropIndexIdx).toBeGreaterThanOrEqual(0);
    expect(dropColIdx).toBeGreaterThanOrEqual(0);
    expect(dropIndexIdx).toBeLessThan(dropColIdx);
  });
});

describe('F113 — Entity 兩軌唯一性守門（SCHEMA-004）', () => {
  // TS-F113-SCHEMA-004 ⚠️ entity 不含 unique:true
  it('SCHEMA-004: User.employee_no @Column 不含 unique: true（plain column）', () => {
    // 定位 employee_no 欄位之 @Column decorator（緊鄰宣告前一行）
    const declIdx = entitySrc.indexOf('employee_no: string | null;');
    expect(declIdx).toBeGreaterThanOrEqual(0);
    // 取宣告前 300 字元涵蓋其 @Column(...)
    const around = entitySrc.slice(Math.max(0, declIdx - 300), declIdx);
    const colMatch = around.match(/@Column\(\{[^}]*\}\)\s*$/);
    expect(colMatch, 'employee_no @Column decorator 未定位到').toBeTruthy();
    expect(colMatch![0]).toContain("type: 'varchar'");
    expect(colMatch![0]).toContain('length: 32');
    expect(colMatch![0]).toContain('nullable: true');
    expect(colMatch![0]).not.toContain('unique');
  });
});

describe('F113 — 登入分支不 trim（STATIC-003）', () => {
  // TS-F113-STATIC-003
  it('STATIC-003: AuthService.login() 之 employee_no 分支不含 .trim()', () => {
    const src = readFileSync(AUTH_SERVICE_PATH, 'utf8');
    const loginBody = sectionAfter(src, 'async login(');
    // 定位到 login 方法體結束前（下一個 async 方法）
    const endIdx = loginBody.indexOf('\n  async ');
    const body = endIdx >= 0 ? loginBody.slice(0, endIdx) : loginBody;
    expect(body).toContain('employee_no');
    expect(body.includes('.trim(')).toBe(false);
    // identifier 為 dto.email 原始值
    expect(body).toMatch(/const identifier = dto\.email;/);
  });
});

describe('F113 — 型別同步（STATIC-004，10 interface）', () => {
  const sharedSrc = readFileSync(SHARED_PATH, 'utf8');
  const authSrc = readFileSync(AUTH_SERVICE_PATH, 'utf8');
  const accountsSrc = readFileSync(ACCOUNTS_SERVICE_PATH, 'utf8');

  it('STATIC-004: packages/shared 6 個 interface 皆含 employee_no/employeeNo', () => {
    expect(sectionAfter(sharedSrc, 'export interface UserInfo')).toContain('employee_no');
    expect(sectionAfter(sharedSrc, 'export interface CreateAccountRequest')).toContain('employeeNo');
    expect(sectionAfter(sharedSrc, 'export interface CreateAccountResponse')).toContain('employee_no');
    expect(sectionAfter(sharedSrc, 'export interface UpdateAccountRequest')).toContain('employeeNo');
    expect(sectionAfter(sharedSrc, 'export interface UpdateAccountResponse')).toContain('employee_no');
    expect(sectionAfter(sharedSrc, 'export interface AccountListItem')).toContain('employee_no');
  });

  it('STATIC-004: api-local 4 個 interface 皆含 employee_no', () => {
    expect(sectionAfter(authSrc, 'export interface LoginResult')).toContain('employee_no');
    expect(sectionAfter(accountsSrc, 'export interface CreateAccountResult')).toContain('employee_no');
    expect(sectionAfter(accountsSrc, 'export interface UpdateAccountResult')).toContain('employee_no');
    expect(sectionAfter(accountsSrc, 'export interface AccountListItem')).toContain('employee_no');
  });

  it('STATIC-004: LoginRequest 明確不變更（不改名為 identifier）', () => {
    const loginReq = sectionAfter(sharedSrc, 'export interface LoginRequest');
    expect(loginReq).toContain('email');
    expect(loginReq).not.toContain('identifier');
  });
});
