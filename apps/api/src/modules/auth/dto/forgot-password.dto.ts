import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: '請輸入有效的 Email 地址' })
  @IsNotEmpty({ message: '請輸入有效的 Email 地址' })
  email: string;
}
