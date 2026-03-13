import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

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

  @IsEnum(['admin', 'user'], { message: '角色值無效，僅允許 admin 或 user' })
  role: 'admin' | 'user';
}
