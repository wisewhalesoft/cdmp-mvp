import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: '請提供重設 Token' })
  token: string;

  @IsString()
  @IsNotEmpty({ message: '請輸入新密碼' })
  @MinLength(8, { message: '密碼長度不得少於 8 個字元' })
  newPassword: string;
}
