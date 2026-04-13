import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveBusinessRoles1711360000011 implements MigrationInterface {
  name = 'RemoveBusinessRoles1711360000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove the 6 business roles that were part of the original 8-role design.
    // Any users currently assigned these roles should be migrated to 'user' first.
    await queryRunner.query(
      `UPDATE "user" SET role = 'user' WHERE role IN ('business', 'marketing', 'customer_service', 'analyst', 'supervisor', 'backend_ops')`,
    );

    await queryRunner.query(
      `DELETE FROM roles WHERE role_code IN ('business', 'marketing', 'customer_service', 'analyst', 'supervisor', 'backend_ops')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-insert the 6 business roles
    const roles = [
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
}
