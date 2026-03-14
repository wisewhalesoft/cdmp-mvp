import { z } from 'zod';

export const createDatasourceSchema = z.object({
  name: z
    .string()
    .min(1, '請輸入資料來源名稱')
    .max(100, '名稱最多 100 個字元'),
  type: z.enum(['mysql', 'postgresql', 'sqlserver'], {
    errorMap: () => ({ message: '請選擇資料來源類型' }),
  }),
  host: z
    .string()
    .min(1, '請輸入主機位址')
    .max(255, '主機位址最多 255 個字元'),
  port: z
    .number({ invalid_type_error: '請輸入連接埠' })
    .int('連接埠必須為整數')
    .min(1, '連接埠必須介於 1 到 65535 之間')
    .max(65535, '連接埠必須介於 1 到 65535 之間'),
  databaseName: z
    .string()
    .min(1, '請輸入資料庫名稱')
    .max(100, '資料庫名稱最多 100 個字元'),
  username: z
    .string()
    .min(1, '請輸入使用者名稱')
    .max(100, '使用者名稱最多 100 個字元'),
  password: z
    .string()
    .min(1, '請輸入密碼'),
  description: z
    .string()
    .max(500, '描述最多 500 個字元')
    .optional()
    .or(z.literal('')),
});

export type CreateDatasourceFormData = z.infer<typeof createDatasourceSchema>;
