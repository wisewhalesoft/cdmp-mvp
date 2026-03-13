import { z } from 'zod';

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
  role: z.enum(['admin', 'user'], {
    errorMap: () => ({ message: '角色值無效' }),
  }),
});

export type CreateAccountFormData = z.infer<typeof createAccountSchema>;
