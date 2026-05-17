import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

/**
 * P1 B5 / m21 / F076 v1.3 / architecture-spec §E07 M06：
 *   D-PFO-01：建立 pooldata_field_option 表（複合 PK + FK CASCADE）
 *
 * 結構：
 *   - column_name        VARCHAR(64)  NOT NULL（複合 PK 第 1 欄；FK → pooldata_field_whitelist）
 *   - option_value       VARCHAR(64)  NOT NULL（複合 PK 第 2 欄）
 *   - option_label       VARCHAR(100) NOT NULL
 *   - is_active          BOOLEAN      NOT NULL DEFAULT true
 *   - deactivation_reason VARCHAR(30) NULL（'manual'/'field_type_changed'；F076 v1.3）
 *   - created_at         TIMESTAMP    NOT NULL
 *   - updated_at         TIMESTAMP    NOT NULL
 *
 * FK：
 *   - fk_pooldata_field_option_column_name
 *     FOREIGN KEY (column_name) REFERENCES pooldata_field_whitelist (column_name)
 *     ON DELETE CASCADE  ← 白名單欄位刪除（hard delete）時級聯；軟停用不觸發
 *
 * CHECK constraint（PostgreSQL 限定，SQLite 應用層保證）：
 *   - chk_pooldata_field_option_deactivation_reason
 *       CHECK (deactivation_reason IS NULL
 *              OR deactivation_reason IN ('manual','field_type_changed'))
 *
 * Index：
 *   - idx_pooldata_field_option_column_active ON (column_name, is_active)
 *     ← 加速 GET ?active=true / F050 多選來源查詢
 *
 * Down：DROP TABLE pooldata_field_option
 */
export class CreatePooldataFieldOption1711360000210 implements MigrationInterface {
  name = 'CreatePooldataFieldOption1711360000210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const dateType = isSqlite ? 'datetime' : 'timestamp';

    await queryRunner.createTable(
      new Table({
        name: 'pooldata_field_option',
        columns: [
          {
            name: 'column_name',
            type: 'varchar',
            length: '64',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'option_value',
            type: 'varchar',
            length: '64',
            isPrimary: true,
            isNullable: false,
          },
          { name: 'option_label', type: 'varchar', length: '100', isNullable: false },
          {
            name: 'is_active',
            type: 'boolean',
            isNullable: false,
            default: true,
          },
          {
            name: 'deactivation_reason',
            type: 'varchar',
            length: '30',
            isNullable: true,
          },
          { name: 'created_at', type: dateType, isNullable: false },
          { name: 'updated_at', type: dateType, isNullable: false },
        ],
        foreignKeys: [
          {
            name: 'fk_pooldata_field_option_column_name',
            columnNames: ['column_name'],
            referencedTableName: 'pooldata_field_whitelist',
            referencedColumnNames: ['column_name'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    if (!isSqlite) {
      await queryRunner.query(
        `ALTER TABLE pooldata_field_option
           ADD CONSTRAINT chk_pooldata_field_option_deactivation_reason
           CHECK (deactivation_reason IS NULL
                  OR deactivation_reason IN ('manual','field_type_changed'))`,
      );
    }

    await queryRunner.query(
      `CREATE INDEX idx_pooldata_field_option_column_active
         ON pooldata_field_option (column_name, is_active)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('pooldata_field_option', true);
  }
}
