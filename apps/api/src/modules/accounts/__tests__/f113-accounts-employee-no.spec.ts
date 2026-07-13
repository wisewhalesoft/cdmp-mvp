/**
 * F113 / US-179 / AD-E02-5 — AccountsService employee_no（軌道 A：service 層唯一性）。
 *
 * 覆蓋 F113-test.md：CREATE（7）+ UPDATE（8）+ LIST（8）。
 * 使用真實 better-sqlite3 :memory: DataSource（非 mock），以驗證：
 *   - 大小寫敏感唯一性（SQLite BINARY 定序，對應 MSSQL _BIN；I-EMPNO-CASE-SENSITIVE-UNIQUE-01）
 *   - 清單搜尋大小寫不敏感、部分匹配 + NULL 安全（AC-15 / BR-8）
 *   - 軌道 A（service 層 findOne 重複檢查）為 dev/sqlite 唯一守衛（DoD #6）
 * DTO 一律經 plainToInstance 觸發 @Transform（trim / 空字串→undefined），忠實模擬 pipe 後之 service 輸入。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { AccountsService } from '../accounts.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { User } from '@/database/entities/user.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

let app: TestingModule;
let service: AccountsService;

function createDto(over: Record<string, unknown>): CreateAccountDto {
  return plainToInstance(CreateAccountDto, {
    name: 'Test',
    email: 'test@example.com',
    password: 'password123',
    role: 'user',
    ...over,
  });
}
function updateDto(over: Record<string, unknown>): UpdateAccountDto {
  return plainToInstance(UpdateAccountDto, {
    name: 'Test',
    email: 'test@example.com',
    ...over,
  });
}

beforeEach(async () => {
  app = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [User, AssignmentAuditLog],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([User, AssignmentAuditLog]),
    ],
    providers: [AccountsService],
  }).compile();
  service = app.get(AccountsService);
});

afterEach(async () => {
  await app.close();
});

describe('F113 — createAccount employee_no（CREATE）', () => {
  // TS-F113-CREATE-001
  it('CREATE-001: 合法未被使用之 employeeNo → 建立成功並持久化', async () => {
    const res = await service.createAccount(createDto({ email: 'a@x.com', employeeNo: 'E20001' }));
    expect(res.employee_no).toBe('E20001');

    const list = await service.findAll({} as any);
    expect(list.data.find((u) => u.id === res.id)?.employee_no).toBe('E20001');
  });

  // TS-F113-CREATE-002
  it('CREATE-002: employeeNo 未提供 → employee_no=null', async () => {
    const res = await service.createAccount(createDto({ email: 'b@x.com' }));
    expect(res.employee_no).toBeNull();
  });

  // TS-F113-CREATE-003
  it('CREATE-003: 重複 employeeNo → 409 ACCOUNT_EMPLOYEE_NO_EXISTS，不建立', async () => {
    await service.createAccount(createDto({ email: 'a@x.com', employeeNo: 'E12345' }));

    try {
      await service.createAccount(createDto({ email: 'b@x.com', employeeNo: 'E12345' }));
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.response.error).toBe(ERROR_CODES.ACCOUNT_EMPLOYEE_NO_EXISTS);
      expect(e.response.message).toBe('此員工編號已被使用');
    }
    // 未建立第二個帳號
    const list = await service.findAll({} as any);
    expect(list.total).toBe(1);
  });

  // TS-F113-CREATE-004 ⚠️ 守門：employee_no !== null 才查
  it('CREATE-004: 兩帳號皆未提供 employeeNo（皆 null）→ 皆建立成功，不誤判重複', async () => {
    const a = await service.createAccount(createDto({ email: 'a@x.com' }));
    const b = await service.createAccount(createDto({ email: 'b@x.com' }));
    expect(a.employee_no).toBeNull();
    expect(b.employee_no).toBeNull();
    const list = await service.findAll({} as any);
    expect(list.total).toBe(2);
  });

  // TS-F113-CREATE-005 順序 regression：email 重複優先
  it('CREATE-005: email 與 employeeNo 皆重複 → 回 ACCOUNT_EMAIL_EXISTS（email 檢查在前）', async () => {
    await service.createAccount(createDto({ email: 'dup@x.com', employeeNo: 'E12345' }));

    try {
      await service.createAccount(createDto({ email: 'dup@x.com', employeeNo: 'E12345' }));
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.ACCOUNT_EMAIL_EXISTS);
    }
  });

  // TS-F113-CREATE-006 回應形狀
  it('CREATE-006: 回應形狀含 employee_no', async () => {
    const res = await service.createAccount(createDto({ email: 'a@x.com', employeeNo: 'E1' }));
    expect(res).toHaveProperty('employee_no');
    expect(res).toHaveProperty('id');
    expect(res).toHaveProperty('created_at');
  });

  // TS-F113-CREATE-007 ⚠️ 大小寫敏感
  it('CREATE-007: 已存在 E12345、新建 e12345 → 不視為重複，成功建立', async () => {
    await service.createAccount(createDto({ email: 'a@x.com', employeeNo: 'E12345' }));
    const res = await service.createAccount(createDto({ email: 'b@x.com', employeeNo: 'e12345' }));
    expect(res.employee_no).toBe('e12345');
    const list = await service.findAll({} as any);
    expect(list.total).toBe(2);
  });
});

describe('F113 — updateAccount employee_no（UPDATE）', () => {
  async function seed(email: string, employeeNo?: string) {
    return service.createAccount(createDto({ email, ...(employeeNo ? { employeeNo } : {}) }));
  }

  // TS-F113-UPDATE-001
  it('UPDATE-001: 既有 null → 新增合法未使用值 → 更新成功', async () => {
    const a = await seed('a@x.com');
    const res = await service.updateAccount(a.id, updateDto({ email: 'a@x.com', employeeNo: 'E30001' }));
    expect(res.employee_no).toBe('E30001');
  });

  // TS-F113-UPDATE-002
  it('UPDATE-002: 既有值變更為另一合法未使用值 → 更新成功', async () => {
    const a = await seed('a@x.com', 'E10001');
    const res = await service.updateAccount(a.id, updateDto({ email: 'a@x.com', employeeNo: 'E10002' }));
    expect(res.employee_no).toBe('E10002');
  });

  // TS-F113-UPDATE-003 清空（空字串 → null）
  it('UPDATE-003: 清空既有值（提交空字串）→ employee_no=null', async () => {
    const a = await seed('a@x.com', 'E10001');
    const res = await service.updateAccount(a.id, updateDto({ email: 'a@x.com', employeeNo: '' }));
    expect(res.employee_no).toBeNull();
  });

  // TS-F113-UPDATE-004 重複 → 409
  it('UPDATE-004: 帳號 B 更新為帳號 A 已用值 → 409，不儲存', async () => {
    await seed('a@x.com', 'E12345');
    const b = await seed('b@x.com');

    try {
      await service.updateAccount(b.id, updateDto({ email: 'b@x.com', employeeNo: 'E12345' }));
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.response.error).toBe(ERROR_CODES.ACCOUNT_EMPLOYEE_NO_EXISTS);
    }
    // 帳號 B 未變更
    const list = await service.findAll({} as any);
    expect(list.data.find((u) => u.id === b.id)?.employee_no).toBeNull();
  });

  // TS-F113-UPDATE-005 ⚠️ 排除自身
  it('UPDATE-005: 帳號 A 保留原 employeeNo 並更新其他欄位 → 儲存成功', async () => {
    const a = await seed('a@x.com', 'E12345');
    const res = await service.updateAccount(a.id, updateDto({ email: 'a@x.com', employeeNo: 'E12345', name: '新姓名' }));
    expect(res.name).toBe('新姓名');
    expect(res.employee_no).toBe('E12345');
  });

  // TS-F113-UPDATE-006 回應形狀
  it('UPDATE-006: 回應形狀含 employee_no', async () => {
    const a = await seed('a@x.com', 'E10001');
    const res = await service.updateAccount(a.id, updateDto({ email: 'a@x.com', employeeNo: 'E10002' }));
    expect(res).toHaveProperty('employee_no');
    expect(res).toHaveProperty('updated_at');
  });

  // TS-F113-UPDATE-007 順序 regression：email 重複優先
  it('UPDATE-007: email 與 employeeNo 皆與帳號 A 重複 → 回 ACCOUNT_EMAIL_IN_USE', async () => {
    await seed('a@x.com', 'E12345');
    const b = await seed('b@x.com');

    try {
      await service.updateAccount(b.id, updateDto({ email: 'a@x.com', employeeNo: 'E12345' }));
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.ACCOUNT_EMAIL_IN_USE);
    }
  });

  // TS-F113-UPDATE-008 ⚠️ 跨帳號大小寫不同視為不同值
  it('UPDATE-008: 帳號 A 用 E12345、帳號 B 更新為 e12345 → 不視為重複，成功', async () => {
    await seed('a@x.com', 'E12345');
    const b = await seed('b@x.com');
    const res = await service.updateAccount(b.id, updateDto({ email: 'b@x.com', employeeNo: 'e12345' }));
    expect(res.employee_no).toBe('e12345');
  });
});

describe('F113 — findAll employee_no（LIST）', () => {
  async function seed(name: string, email: string, employeeNo?: string) {
    return service.createAccount(createDto({ name, email, ...(employeeNo ? { employeeNo } : {}) }));
  }

  // TS-F113-LIST-001 / LIST-002
  it('LIST-001/002: 回應含 employee_no，有值顯示原值、無值為 null', async () => {
    await seed('Alice', 'alice@x.com', 'E12345');
    await seed('Bob', 'bob@x.com'); // 無 employee_no

    const list = await service.findAll({} as any);
    const alice = list.data.find((u) => u.email === 'alice@x.com');
    const bob = list.data.find((u) => u.email === 'bob@x.com');
    expect(alice?.employee_no).toBe('E12345');
    expect(bob?.employee_no).toBeNull();
  });

  // TS-F113-LIST-003
  it('LIST-003: 搜尋完整 employee_no（原樣大小寫）→ 命中', async () => {
    await seed('Alice', 'alice@x.com', 'E12345');
    const list = await service.findAll({ search: 'E12345' } as any);
    expect(list.data.some((u) => u.email === 'alice@x.com')).toBe(true);
  });

  // TS-F113-LIST-004
  it('LIST-004: 搜尋部分 employee_no（E123）→ 部分匹配命中', async () => {
    await seed('Alice', 'alice@x.com', 'E12345');
    const list = await service.findAll({ search: 'E123' } as any);
    expect(list.data.some((u) => u.email === 'alice@x.com')).toBe(true);
  });

  // TS-F113-LIST-005 ⚠️ 大小寫不敏感（與登入刻意不同）
  it('LIST-005: 搜尋 e123（小寫）命中 E12345', async () => {
    await seed('Alice', 'alice@x.com', 'E12345');
    const list = await service.findAll({ search: 'e123' } as any);
    expect(list.data.some((u) => u.email === 'alice@x.com')).toBe(true);
  });

  // TS-F113-LIST-006 OR 邏輯（姓名/Email 不匹配但 employee_no 匹配）
  it('LIST-006: 姓名/Email 不匹配、employee_no 匹配 → 仍列出', async () => {
    await seed('Zoe', 'zoe@x.com', 'XK999');
    const list = await service.findAll({ search: 'XK9' } as any);
    expect(list.data.some((u) => u.email === 'zoe@x.com')).toBe(true);
  });

  // TS-F113-LIST-007 NULL 安全
  it('LIST-007: employee_no IS NULL 之列於搜尋下不匹配、不拋錯', async () => {
    await seed('NullEmp', 'nullemp@x.com'); // employee_no null, 姓名/Email 與搜尋無關
    await seed('Alice', 'alice@x.com', 'E12345');
    const list = await service.findAll({ search: 'E12345' } as any);
    expect(list.data.some((u) => u.email === 'nullemp@x.com')).toBe(false);
    expect(list.data.some((u) => u.email === 'alice@x.com')).toBe(true);
  });

  // TS-F113-LIST-008 regression：既有姓名/Email 搜尋不受影響
  it('LIST-008: 既有姓名/Email 搜尋行為不受影響', async () => {
    await seed('Charlie', 'charlie@x.com', 'E99');
    const byName = await service.findAll({ search: 'charlie' } as any);
    expect(byName.data.some((u) => u.email === 'charlie@x.com')).toBe(true);
    const byEmail = await service.findAll({ search: 'charlie@x' } as any);
    expect(byEmail.data.some((u) => u.email === 'charlie@x.com')).toBe(true);
  });
});
