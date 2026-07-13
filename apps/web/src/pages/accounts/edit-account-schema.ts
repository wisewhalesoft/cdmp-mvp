import { z } from 'zod';
import { employeeNoField } from './employee-no-field';

export const editAccountSchema = z.object({
  name: z
    .string()
    .min(1, '請輸入姓名（1-100 個字元）')
    .max(100, '請輸入姓名（1-100 個字元）'),
  email: z
    .string()
    .min(1, '請輸入有效的 Email 地址')
    .email('請輸入有效的 Email 地址'),
  // F113 / US-179: 選填員工編號（設值 / 變更 / 清空為 null）。清空即移除。
  employeeNo: employeeNoField,
});

export type EditAccountFormData = z.infer<typeof editAccountSchema>;
