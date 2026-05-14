import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Iter 1 / F069~F072 / architecture-spec §E07-G:
 *   D-CT-01：建立 ob_card_type 表
 *
 * 結構（依架構規格 §3611）：
 *   - card_type   VARCHAR(5)  PK
 *   - card_name   VARCHAR(20) NOT NULL
 *   - prod_kind   VARCHAR(4)  NOT NULL（業務層 1:1 綁定 ob_code_df.PROD_KIND；不建 FK）
 *   - status      VARCHAR(10) NOT NULL DEFAULT 'active'
 *   - created_at  TIMESTAMP / datetime  NOT NULL
 *   - created_by  VARCHAR(50) NOT NULL
 *   - updated_at  TIMESTAMP / datetime  NOT NULL
 *   - updated_by  VARCHAR(50) NOT NULL
 *
 * CHECK constraint（DB_TYPE 條件分支）：
 *   - PostgreSQL：
 *       chk_ob_card_type_status      CHECK (status IN ('active','inactive'))
 *       chk_ob_card_type_code_format CHECK (card_type ~ '^[A-Z0-9]{1,5}$')
 *   - SQLite：
 *       略過 regex CHECK（SQLite 不支援 `~` 運算子）；由應用層保證格式
 *
 * Index：
 *   - idx_ob_card_type_status ON ob_card_type (status)
 *
 * 級聯刪除設計（F072 / AD-E07-16）：採應用層 transaction，不建 ON DELETE CASCADE。
 *
 * Down：DROP TABLE ob_card_type
 */
export class CreateObCardType1711360000160 implements MigrationInterface {
  name = 'CreateObCardType1711360000160';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const dateType = isSqlite ? 'datetime' : 'timestamp';

    await queryRunner.createTable(
      new Table({
        name: 'ob_card_type',
        columns: [
          {
            name: 'card_type',
            type: 'varchar',
            length: '5',
            isPrimary: true,
            isNullable: false,
          },
          { name: 'card_name', type: 'varchar', length: '20', isNullable: false },
          { name: 'prod_kind', type: 'varchar', length: '4', isNullable: false },
          {
            name: 'status',
            type: 'varchar',
            length: '10',
            isNullable: false,
            default: "'active'",
          },
          { name: 'created_at', type: dateType, isNullable: false },
          { name: 'created_by', type: 'varchar', length: '50', isNullable: false },
          { name: 'updated_at', type: dateType, isNullable: false },
          { name: 'updated_by', type: 'varchar', length: '50', isNullable: false },
        ],
      }),
      true,
    );

    // CHECK constraints — 僅 PostgreSQL；SQLite 由應用層保證
    if (!isSqlite) {
      await queryRunner.query(
        `ALTER TABLE ob_card_type
           ADD CONSTRAINT chk_ob_card_type_status
           CHECK (status IN ('active','inactive'))`,
      );
      await queryRunner.query(
        `ALTER TABLE ob_card_type
           ADD CONSTRAINT chk_ob_card_type_code_format
           CHECK (card_type ~ '^[A-Z0-9]{1,5}$')`,
      );
    }

    // status 查詢索引
    await queryRunner.query(
      `CREATE INDEX idx_ob_card_type_status ON ob_card_type (status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // dropTable 會連同 index/constraint 一併刪除
    await queryRunner.dropTable('ob_card_type', true);
  }
}
