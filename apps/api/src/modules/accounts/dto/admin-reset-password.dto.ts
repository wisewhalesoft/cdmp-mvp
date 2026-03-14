import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminResetPasswordDto {
  @IsString({ message: '密碼必須為字串' })
  @IsNotEmpty({ message: '請輸入新密碼' })
  @MinLength(8, { message: '密碼長度不得少於 8 個字元' })
  newPassword: string;
}
