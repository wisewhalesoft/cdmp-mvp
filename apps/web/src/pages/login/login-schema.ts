import { z } from 'zod';

export const loginSchema = z.object({
  // F113 / US-179：識別碼欄位維持名為 email，語意擴充為「Email 或員工編號」。
  // 放寬 .email() 約束，改為僅要求非空字串——員工編號（如 'A0001'）不含 '@'，
  // 若維持 Email 格式驗證會在前端即被擋下，永遠到不了後端分支判斷。
  email: z.string().min(1, '請輸入 Email 或員工編號'),
  password: z.string().min(1, '請輸入密碼'),
  rememberMe: z.boolean().optional(),
});

export type LoginFormData = z.infer<typeof loginSchema>;
