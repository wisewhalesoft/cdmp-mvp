import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '@/database/entities/role.entity';
import type { UserRole } from '@/common/constants/roles';

export interface RoleDefinition {
  roleCode: UserRole;
  displayName: string;
  alias: string | null;
  type: 'system' | 'business';
}

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async findAll(): Promise<RoleDefinition[]> {
    const roles = await this.roleRepository.find({
      order: { type: 'ASC', role_code: 'ASC' },
    });

    return roles.map((role) => ({
      roleCode: role.role_code as UserRole,
      displayName: role.display_name,
      alias: role.alias,
      type: role.type,
    }));
  }
}
