import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Iter 1 / F056 v1.5 / architecture-spec §E07-G:
 *   1711360000163-AddObTierTierLevelCheck (D-CT-03)
 *
 * 為 ob_tier.tier_level 加上 CHECK constraint `tier_level IN ('T1','T2',...,'T10')`，
 * 將 T1~T10 列舉約束從應用層保證升級為 DB 層保證。
 *
 * 執行依序（依架構規格 §3680）：
 *   D3 OBTIER 遷移 → 1711360000150 fallback seed → 1711360000162 後綴遷移 → 本 migration
 *
 * Pre-condition guard（避免風險 14：D-CT-03 早於後綴 UPDATE 執行）：
 *   - up() 開頭執行 D11 驗證 SQL：
 *       SELECT tier_level, COUNT(*) FROM ob_tier
 *        WHERE tier_level NOT IN ('T1'..'T10') GROUP BY tier_level
 *   - 若回傳非空陣列（任一違規列存在）→ throw Error 中止 migration，並指引應先執行
 *     1711360000162-MigrateObTierTierLevelSuffix。
 *
 * 環境差異：
 *   - PostgreSQL：完整執行 D11 驗證 + ALTER TABLE ADD CONSTRAINT
 *   - SQLite：略過所有 DDL（SQLite 對 ALTER TABLE ADD CONSTRAINT 支援不全；
 *     列舉約束由應用層 TIER_LEVEL_ENUM 守護，與架構規格一致）
 *
 * Down：
 *   - PostgreSQL：ALTER TABLE ob_tier DROP CONSTRAINT chk_ob_tier_tier_level
 *   - SQLite：noop
 */
export class AddObTierTierLevelCheck1711360000163
  implements MigrationInterface
{
  name = 'AddObTierTierLevelCheck1711360000163';

  /** T1~T10 列舉（與 constants/card-type.constants.ts 之 TIER_LEVEL_ENUM 同步） */
  private static readonly TIER_LEVELS = [
    'T1',
    'T2',
    'T3',
    'T4',
    'T5',
    'T6',
    'T7',
    'T8',
    'T9',
    'T10',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) {
      // SQLite 環境：略過 DDL，由應用層守護
      return;
    }

    const enumList = AddObTierTierLevelCheck1711360000163.TIER_LEVELS.map(
      (v) => `'${v}'`,
    ).join(',');

    // Pre-condition guard：D11 驗證 SQL
    const violations = (await queryRunner.query(
      `SELECT tier_level, COUNT(*) AS violation_count
         FROM ob_tier
        WHERE tier_level NOT IN (${enumList})
        GROUP BY tier_level`,
    )) as Array<{ tier_level: string; violation_count: number | string }>;

    if (Array.isArray(violations) && violations.length > 0) {
      const summary = violations
        .map((v) => `${v.tier_level} (${v.violation_count} rows)`)
        .join(', ');
      throw new Error(
        `D11 pre-condition failed for migration 1711360000163-AddObTierTierLevelCheck: ` +
          `ob_tier contains rows with invalid tier_level values: ${summary}. ` +
          `Please run 1711360000162-MigrateObTierTierLevelSuffix first to migrate ` +
          `old suffix values (T1M/T1HM/T2HM/T3M/T3HM/T32/T3C/T4M/T51/T52/T5M/THC) into T1..T10.`,
      );
    }

    // D11 通過 → ALTER TABLE ADD CONSTRAINT
    await queryRunner.query(
      `ALTER TABLE ob_tier
         ADD CONSTRAINT chk_ob_tier_tier_level
         CHECK (tier_level IN (${enumList}))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) {
      // SQLite 環境：up() 為 noop，down() 同樣 noop
      return;
    }

    await queryRunner.query(
      `ALTER TABLE ob_tier DROP CONSTRAINT IF EXISTS chk_ob_tier_tier_level`,
    );
  }
}
