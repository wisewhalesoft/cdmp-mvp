import { IsNotEmpty, IsOptional, IsBoolean, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  // F113 §5.2 / AD-E02-5 §3.3.1：由 @IsEmail 放寬為 @IsNotEmpty + @IsString，使員工編號
  // （不含 '@'）可通過 DTO 層、進入 service 分支判斷。MaxLength(255) 為寬鬆防禦性上限——
  // 沿用 email 欄位長度（255），非 employee_no 之 32 字元格式邊界；employee_no 之格式驗證
  // （^[A-Za-z0-9_-]{1,32}$）僅於帳號建立/編輯時執行，登入端刻意不做格式檢查（避免以
  // 400 vs 401 之差異洩漏「輸入值是否長得像合法員工編號」）。欄位仍名為 `email`（承載
  // Email 或員工編號；spec §5.1 使用者決策：不改名為 identifier）。
  @IsString({ message: '請輸入 Email 或員工編號' })
  @IsNotEmpty({ message: '請輸入 Email 或員工編號' })
  @MaxLength(255, { message: '長度不可超過 255 字元' })
  email: string;

  @IsNotEmpty({ message: '請輸入密碼' })
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
