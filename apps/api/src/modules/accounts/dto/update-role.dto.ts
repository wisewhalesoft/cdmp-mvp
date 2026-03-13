import { IsIn, IsNotEmpty } from 'class-validator';

export class UpdateRoleDto {
  @IsIn(['admin', 'user'], { message: '角色必須為 admin 或 user' })
  @IsNotEmpty({ message: '請輸入角色' })
  role: 'admin' | 'user';
}
