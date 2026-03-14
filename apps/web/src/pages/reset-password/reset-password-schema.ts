import { z } from 'zod';

export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(1, '請輸入新密碼')
      .min(8, '密碼長度不得少於 8 個字元'),
    confirmPassword: z.string().min(1, '請確認新密碼'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '密碼與確認密碼不一致',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
