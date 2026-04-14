import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F046: Add GIN full-text search index on customer_core
 * Enables PostgreSQL native tsvector/tsquery search on name + english_name
 */
export class AddCustomerCoreFullTextIndex1711360000020 implements MigrationInterface {
  name = 'AddCustomerCoreFullTextIndex1711360000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_core_fulltext
        ON customer_core
        USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(english_name, '')));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_customer_core_fulltext;`);
  }
}
