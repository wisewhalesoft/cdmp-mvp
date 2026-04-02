import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { VALID_ROLES, type UserRole } from '@/common/constants/roles';

export class CreateAccountDto {
  @IsString({ message: '姓名必須為字串' })
  @IsNotEmpty({ message: '請輸入姓名' })
  @MaxLength(100, { message: '姓名不得超過 100 個字元' })
  name: string;

  @IsEmail({}, { message: '請輸入有效的 Email 地址' })
  @IsNotEmpty({ message: '請輸入 Email' })
  email: string;

  @IsString({ message: '密碼必須為字串' })
  @IsNotEmpty({ message: '請輸入密碼' })
  @MinLength(8, { message: '密碼長度至少需要 8 個字元' })
  password: string;

  @IsIn([...VALID_ROLES], { message: '角色值無效，必須為系統定義的 8 種角色之一' })
  role: UserRole;
}
