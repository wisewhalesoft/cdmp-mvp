import { IsIn, IsNotEmpty } from 'class-validator';
import { VALID_ROLES, type UserRole } from '@/common/constants/roles';

export class UpdateRoleDto {
  @IsIn([...VALID_ROLES], { message: '角色值無效，必須為系統定義的 8 種角色之一' })
  @IsNotEmpty({ message: '請輸入角色' })
  role: UserRole;
}
