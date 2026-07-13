import type { ValidationArguments } from 'class-validator';

/**
 * F113 / AD-E02-5 §3.4.1：員工編號（employee_no）格式驗證與正規化共用邏輯。
 * CreateAccountDto 與 UpdateAccountDto 皆 import，避免同模組內重複兩份正則／訊息。
 */

// F113 §3.2 FMT-1：英數字 + '-'/'_'，長度 1~32（trim 後）。
export const EMPLOYEE_NO_RE = /^[A-Za-z0-9_-]{1,32}$/;

// F113 §3.2：多重違規之錯誤訊息優先序——1) 含 '@' 2) 長度 > 32 3) 其他不合法字元。
// 三種情境皆會使同一個 EMPLOYEE_NO_RE 失敗（'@' 與中文/空格皆不在字元集內），
// 故需一個依 args.value 動態判斷違規類別的訊息函式，而非讓多個獨立驗證器各自
// 產生訊息（那樣會失去 spec 指定的優先序、且 class-validator 預設回傳所有失敗
// 訊息的陣列，無法保證僅顯示最優先的一則）。
export function employeeNoErrorMessage(args: ValidationArguments): string {
  const value = typeof args.value === 'string' ? args.value : '';
  if (value.includes('@')) return '員工編號不可包含 @';
  if (value.length > 32) return '員工編號長度不可超過 32 字元';
  return '員工編號僅允許英數字、- 與 _';
}

// F113 FMT-4/FMT-6：trim 首尾空白；trim 後為空字串 → undefined（等同未提供，
// 使 @IsOptional() 跳過驗證）。undefined 於 create/update 兩端點皆統一映射為
// employee_no = null（AD §3.4.2/§3.4.3，PUT 全量替換語意，無「維持原值」第三態）。
export function normalizeEmployeeNo(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
