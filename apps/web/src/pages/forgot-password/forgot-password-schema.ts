import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, '請輸入有效的 Email 地址')
    .email('請輸入有效的 Email 地址'),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
