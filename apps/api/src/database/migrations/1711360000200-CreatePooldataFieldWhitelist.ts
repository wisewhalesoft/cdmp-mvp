import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * P1 B5 / m20 / F075 v1.3 / architecture-spec §E07 M06：
 *   D-PFW-01：建立 pooldata_field_whitelist 表
 *
 * 結構：
 *   - column_name   VARCHAR(64)  PK（OBPOOLDATA 欄位名稱字串，無 FK 至 OBPOOLDATA）
 *   - display_name  VARCHAR(100) NOT NULL
 *   - field_type    VARCHAR(20)  NOT NULL（'numeric'/'categorical'/'date'）
 *   - is_active     BOOLEAN      NOT NULL DEFAULT true
 *   - created_at    TIMESTAMP    NOT NULL
 *   - updated_at    TIMESTAMP    NOT NULL
 *
 * CHECK constraint（DB_TYPE 條件分支）：
 *   - PostgreSQL：
 *       chk_pooldata_field_whitelist_field_type
 *         CHECK (field_type IN ('numeric','categorical','date'))
 *   - SQLite：應用層保證
 *
 * Index：
 *   - idx_pooldata_field_whitelist_is_active ON pooldata_field_whitelist (is_active)
 *
 * Down：DROP TABLE pooldata_field_whitelist
 */
export class CreatePooldataFieldWhitelist1711360000200 implements MigrationInterface {
  name = 'CreatePooldataFieldWhitelist1711360000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const dateType = isSqlite ? 'datetime' : 'timestamp';

    await queryRunner.createTable(
      new Table({
        name: 'pooldata_field_whitelist',
        columns: [
          {
            name: 'column_name',
            type: 'varchar',
            length: '64',
            isPrimary: true,
            isNullable: false,
          },
          { name: 'display_name', type: 'varchar', length: '100', isNullable: false },
          { name: 'field_type', type: 'varchar', length: '20', isNullable: false },
          {
            name: 'is_active',
            type: 'boolean',
            isNullable: false,
            default: true,
          },
          { name: 'created_at', type: dateType, isNullable: false },
          { name: 'updated_at', type: dateType, isNullable: false },
        ],
      }),
      true,
    );

    if (!isSqlite) {
      await queryRunner.query(
        `ALTER TABLE pooldata_field_whitelist
           ADD CONSTRAINT chk_pooldata_field_whitelist_field_type
           CHECK (field_type IN ('numeric','categorical','date'))`,
      );
    }

    await queryRunner.query(
      `CREATE INDEX idx_pooldata_field_whitelist_is_active ON pooldata_field_whitelist (is_active)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('pooldata_field_whitelist', true);
  }
}
