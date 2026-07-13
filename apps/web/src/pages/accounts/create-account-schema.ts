import { z } from 'zod';
import type { UserRole } from '@cdmp/shared';
import { employeeNoField } from './employee-no-field';

// F004: 帳號建立表單 schema
// role 必須對齊 UserRole = 'admin' | 'user'
export const createAccountSchema = z.object({
  name: z
    .string()
    .min(1, '請輸入姓名（1-100 個字元）')
    .max(100, '請輸入姓名（1-100 個字元）'),
  email: z
    .string()
    .min(1, '請輸入有效的 Email 地址')
    .email('請輸入有效的 Email 地址'),
  password: z
    .string()
    .min(8, '密碼長度至少需要 8 個字元'),
  role: z.enum(['admin', 'user'] as const, {
    errorMap: () => ({ message: '角色值無效' }),
  }),
  // F004 AC-6 / BR-9: 業務主管旗標
  // 預設 false；切換 admin 時前端會重置為 false（onChange 處理）
  isSalesManager: z.boolean().optional().default(false),
  // F113 / US-179: 選填員工編號（登入識別碼二選一）。留空＝未設定；
  // 有值時須符合格式（英數、-、_，1-32 字，不含 @）。
  employeeNo: employeeNoField,
});

export type CreateAccountFormData = z.infer<typeof createAccountSchema> & {
  role: UserRole;
};
