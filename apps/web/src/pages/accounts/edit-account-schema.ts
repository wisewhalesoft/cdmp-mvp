import { z } from 'zod';

export const editAccountSchema = z.object({
  name: z
    .string()
    .min(1, '請輸入姓名（1-100 個字元）')
    .max(100, '請輸入姓名（1-100 個字元）'),
  email: z
    .string()
    .min(1, '請輸入有效的 Email 地址')
    .email('請輸入有效的 Email 地址'),
});

export type EditAccountFormData = z.infer<typeof editAccountSchema>;
