import { z } from 'zod';

// F113 / US-179：員工編號（登入識別碼二選一）前端格式驗證。
// 規則對齊 spec §3.2 FMT-1：英數字 + '-'/'_'，長度 1~32（trim 後），不含 '@'。
// 選填——留空（空字串／純空白）等同「未設定」，前端不視為錯誤；有值時才驗格式。
// 錯誤文案採 prototype 07-account-list.html 之單一合併訊息（後端 DTO 另有三段
// 優先序訊息，屬後端層職責）。
export const EMPLOYEE_NO_RE = /^[A-Za-z0-9_-]{1,32}$/;
export const EMPLOYEE_NO_FORMAT_ERROR =
  '員工編號格式不符（限英數、-、_，最多 32 字，不含 @）';

export const employeeNoField = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (value === undefined) return true;
      const trimmed = value.trim();
      if (trimmed === '') return true; // 留空＝未設定
      return EMPLOYEE_NO_RE.test(trimmed);
    },
    { message: EMPLOYEE_NO_FORMAT_ERROR },
  );
