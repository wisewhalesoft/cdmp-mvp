import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateAccountDto {
  @IsString({ message: '姓名必須為字串' })
  @IsNotEmpty({ message: '請輸入姓名' })
  @MaxLength(100, { message: '姓名不得超過 100 個字元' })
  name: string;

  @IsEmail({}, { message: '請輸入有效的 Email 地址' })
  @IsNotEmpty({ message: '請輸入 Email' })
  email: string;
}
