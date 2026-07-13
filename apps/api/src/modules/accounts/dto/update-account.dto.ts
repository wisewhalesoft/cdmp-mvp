import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { EMPLOYEE_NO_RE, employeeNoErrorMessage, normalizeEmployeeNo } from './employee-no.validator';

export class UpdateAccountDto {
  @IsString({ message: '姓名必須為字串' })
  @IsNotEmpty({ message: '請輸入姓名' })
  @MaxLength(100, { message: '姓名不得超過 100 個字元' })
  name: string;

  @IsEmail({}, { message: '請輸入有效的 Email 地址' })
  @IsNotEmpty({ message: '請輸入 Email' })
  email: string;

  // F113 AC-3/AC-4/AC-7/AC-8：選填員工編號（設值 / 變更 / 清空為 null）。
  // 裝飾器順序（@IsOptional → @Transform → @Matches）與 CreateAccountDto 逐字相同。
  @IsOptional()
  @Transform(({ value }) => normalizeEmployeeNo(value))
  @Matches(EMPLOYEE_NO_RE, { message: employeeNoErrorMessage })
  employeeNo?: string;
}
