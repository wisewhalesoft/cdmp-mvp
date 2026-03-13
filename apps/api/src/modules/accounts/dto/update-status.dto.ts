import { IsIn, IsNotEmpty } from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['active', 'disabled'], { message: '狀態必須為 active 或 disabled' })
  @IsNotEmpty({ message: '請輸入狀態' })
  status: 'active' | 'disabled';
}
