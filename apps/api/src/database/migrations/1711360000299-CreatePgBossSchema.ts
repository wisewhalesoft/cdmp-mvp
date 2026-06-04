import { MigrationInterface, QueryRunner } from 'typeorm';
// pg-boss 為 CommonJS（`export = PgBoss`）：migration runner 走 ts-node，
// 須用 `import = require`，否則 `PgBoss.getConstructionPlans` 在 ts-node 下為 undefined。
import PgBoss = require('pg-boss');

/**
 * m299 / F098 v1.0 / AD-E07-28 §7（OQ-AD28-01 RESOLVED）
 * ── 固定 pg-boss `pgboss` schema 之 DDL 版本（prod / 新 DB）。
 *
 * 月跑 worker 抽離（P1）以 pg-boss（靠既有 Postgres）為佇列。pg-boss 之 schema 非 TypeORM entity，
 * dev 靠 `boss.start()` 首啟自建；但 prod 多 worker 同時首啟會 race（並行 CREATE SCHEMA / TYPE / TABLE）。
 * 故以本 migration 在部署期先固定其 DDL，使 schema 版本化、可重現、防多 worker 首啟 race。
 *
 * 實作：直接套用 `PgBoss.getConstructionPlans('pgboss')` 產出的官方 DDL。該 DDL 為**冪等**
 * （內含 `CREATE SCHEMA IF NOT EXISTS` + `pg_advisory_xact_lock`），且與 worker 端 `boss.start()`
 * 同源 — 先跑 migration 後，worker `start()` 對既有 schema 冪等不衝突。
 *
 * SQLite e2e（DB_TYPE=sqlite）：pg-boss 僅支援 Postgres，本 migration up/down no-op
 * （對齊 m289 / m291 / m292 慣例）。
 *
 * down：DROP SCHEMA pgboss CASCADE（移除佇列與其所有 job / archive 資料）。
 */
export class CreatePgBossSchema1711360000299 implements MigrationInterface {
  name = 'CreatePgBossSchema1711360000299';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    // 官方冪等 DDL（含 advisory lock，防並行首啟 race）
    const plans = PgBoss.getConstructionPlans('pgboss');
    await queryRunner.query(plans);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
  }
}
