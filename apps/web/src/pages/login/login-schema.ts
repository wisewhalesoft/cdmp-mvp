import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, '請輸入有效的 Email 地址').email('請輸入有效的 Email 地址'),
  password: z.string().min(1, '請輸入密碼'),
  rememberMe: z.boolean().optional(),
});

export type LoginFormData = z.infer<typeof loginSchema>;
