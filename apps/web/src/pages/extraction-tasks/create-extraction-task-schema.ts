import { z } from 'zod';

const CRON_REGEX = /^(\S+\s+){4}\S+$/;

export const createExtractionTaskSchema = z
  .object({
    name: z
      .string()
      .min(1, '請輸入任務名稱')
      .max(255, '任務名稱最多 255 個字元'),
    datasourceId: z
      .string()
      .min(1, '請選擇資料來源'),
    mode: z.enum(['full', 'incremental'], {
      errorMap: () => ({ message: '請選擇擷取模式' }),
    }),
    sourceSchema: z
      .string()
      .max(255)
      .optional()
      .or(z.literal('')),
    sourceTable: z
      .string()
      .min(1, '請選擇來源資料表')
      .max(255, '來源資料表最多 255 個字元'),
    schedule: z
      .string()
      .min(1, '請設定排程')
      .regex(CRON_REGEX, '排程格式不正確，請輸入合法的 cron 表達式'),
    incrementalColumn: z
      .string()
      .max(255, '增量欄位最多 255 個字元')
      .optional()
      .or(z.literal('')),
    lastIncrementalValue: z
      .string()
      .max(255, '增量起始值最多 255 個字元')
      .optional()
      .or(z.literal('')),
  })
  .refine(
    (data) => {
      if (data.mode === 'incremental') {
        return !!data.incrementalColumn && data.incrementalColumn.trim().length > 0;
      }
      return true;
    },
    {
      message: '增量模式必須指定增量欄位',
      path: ['incrementalColumn'],
    },
  );

export type CreateExtractionTaskFormData = z.infer<typeof createExtractionTaskSchema>;
