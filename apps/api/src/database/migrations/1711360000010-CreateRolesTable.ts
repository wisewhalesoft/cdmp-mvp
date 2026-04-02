import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateRolesTable1711360000010 implements MigrationInterface {
  name = 'CreateRolesTable1711360000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          {
            name: 'role_code',
            type: 'varchar',
            length: '30',
            isPrimary: true,
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'alias',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'varchar',
            length: '10',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Seed 8 roles (idempotent: INSERT ... ON CONFLICT DO NOTHING)
    const roles = [
      { role_code: 'admin', display_name: '管理者', alias: 'Admin', type: 'system' },
      { role_code: 'user', display_name: '使用者', alias: 'User', type: 'system' },
      { role_code: 'business', display_name: '業務', alias: null, type: 'business' },
      { role_code: 'marketing', display_name: '行銷', alias: '企劃', type: 'business' },
      { role_code: 'customer_service', display_name: '客服', alias: null, type: 'business' },
      { role_code: 'analyst', display_name: '分析師', alias: null, type: 'business' },
      { role_code: 'supervisor', display_name: '主管', alias: null, type: 'business' },
      { role_code: 'backend_ops', display_name: '後端作業', alias: '作服', type: 'business' },
    ];

    for (const role of roles) {
      const aliasVal = role.alias ? `'${role.alias}'` : 'NULL';
      await queryRunner.query(
        `INSERT INTO roles (role_code, display_name, alias, type) VALUES ('${role.role_code}', '${role.display_name}', ${aliasVal}, '${role.type}') ON CONFLICT (role_code) DO NOTHING`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('roles', true);
  }
}
