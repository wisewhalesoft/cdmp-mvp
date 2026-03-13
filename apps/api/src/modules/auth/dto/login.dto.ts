import { IsEmail, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: '請輸入有效的 Email 地址' })
  @IsNotEmpty({ message: '請輸入有效的 Email 地址' })
  email: string;

  @IsNotEmpty({ message: '請輸入密碼' })
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
