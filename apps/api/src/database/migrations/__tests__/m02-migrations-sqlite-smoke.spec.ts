/**
 * Iter 1 / SQLite smoke test：
 *   驗證 4 個 M02 新 migration 在 better-sqlite3 in-memory 環境下：
 *     a) 依序執行 up() 成功
 *     b) 依序執行 down() 成功（1711360000162 down 為 unreversible 設計，預期 throw）
 *     c) 表結構 / seed 資料正確（SQLite 環境略過 PG-only CHECK constraint）
 *
 * 本 spec 與 unit mock spec 互補：unit spec 驗 SQL 字串，本 spec 驗真 DB 行為。
 * 不寫 PostgreSQL smoke（無真機可跑）；PostgreSQL 行為由 npm run migration:run 手動驗收。
 *
 * 設計說明：
 *   - 不依賴 1711360000100-CreateE07ObSettingsTables（內含 bigserial / timestamp 等
 *     PostgreSQL-specific 型別，且 SeedObTierFallback 之 `INSERT...SELECT...WHERE NOT EXISTS`
 *     在 better-sqlite3 driver 與 PG dialect 行為不同）；改用最小 ob_tier schema 直接建表，
 *     單純驗證 Iter 1 的 4 個 migration 行為。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataSource } from 'typeorm';
import { CreateObCardType1711360000160 } from '../1711360000160-CreateObCardType';
import { SeedObCardTypeNormative61711360000161 } from '../1711360000161-SeedObCardTypeNormative6';
import { MigrateObTierTierLevelSuffix1711360000162 } from '../1711360000162-MigrateObTierTierLevelSuffix';
import { AddObTierTierLevelCheck1711360000163 } from '../1711360000163-AddObTierTierLevelCheck';

describe('M02 Migrations — SQLite smoke (up + down)', () => {
  let dataSource: DataSource;
  const originalDbType = process.env.DB_TYPE;

  beforeEach(async () => {
    process.env.DB_TYPE = 'sqlite';

    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      logging: false,
      entities: [],
    });
    await dataSource.initialize();

    // 最小 ob_tier 表（Iter 1 不重建 schema，僅驗本 4 個 migration 行為）
    const qr = dataSource.createQueryRunner();
    try {
      await qr.query(
        `CREATE TABLE ob_tier (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           list_nm VARCHAR(30),
           card_type VARCHAR(5) NOT NULL,
           card_level VARCHAR(5),
           tier_level VARCHAR(5) NOT NULL
         )`,
      );
      // Seed 含舊後綴值，驗 1711360000162 遷移行為
      await qr.query(
        `INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
         VALUES ('M3', NULL, 'T5M', 'fallback M3'),
                ('HC', NULL, 'THC', 'fallback HC'),
                ('C3', NULL, 'T3C', 'fallback C3'),
                ('H',  'A',  'T1',  'standard H')`,
      );
    } finally {
      await qr.release();
    }
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (originalDbType === undefined) {
      delete process.env.DB_TYPE;
    } else {
      process.env.DB_TYPE = originalDbType;
    }
  });

  it('完整流程 up→down：4 個 migration 依序 up 成功，down 還原表結構（1711360000162 down 為設計 unreversible）', async () => {
    const qr = dataSource.createQueryRunner();
    try {
      // === UP ===
      // D-CT-01：建 ob_card_type
      await new CreateObCardType1711360000160().up(qr);
      const tableCheck = await qr.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='ob_card_type'`,
      );
      expect(tableCheck).toHaveLength(1);

      // D-CT-02：seed 6 個正規 CARD_TYPE
      await new SeedObCardTypeNormative61711360000161().up(qr);
      const seeded = await qr.query(
        `SELECT card_type, card_name, prod_kind FROM ob_card_type ORDER BY card_type`,
      );
      expect(seeded).toHaveLength(6);
      const codes = (seeded as Array<{ card_type: string }>).map((r) => r.card_type);
      expect(codes.sort()).toEqual(['E', 'E5', 'H', 'M', 'S', 'S5']);
      // PROD_KIND 對照驗證（H/S/E/S5/E5→01，M→02）
      const byCode = Object.fromEntries(
        (seeded as Array<{ card_type: string; prod_kind: string }>).map((r) => [
          r.card_type,
          r.prod_kind,
        ]),
      );
      expect(byCode.H).toBe('01');
      expect(byCode.S).toBe('01');
      expect(byCode.E).toBe('01');
      expect(byCode.S5).toBe('01');
      expect(byCode.E5).toBe('01');
      expect(byCode.M).toBe('02');

      // D-CT-02 idempotent：重跑不報錯且筆數不變（INSERT OR IGNORE）
      await new SeedObCardTypeNormative61711360000161().up(qr);
      const seededTwice = await qr.query(`SELECT COUNT(*) AS c FROM ob_card_type`);
      expect(Number((seededTwice as Array<{ c: number | string }>)[0].c)).toBe(6);

      // 1711360000162：TIER 後綴遷移
      await new MigrateObTierTierLevelSuffix1711360000162().up(qr);
      const m3 = await qr.query(
        `SELECT tier_level FROM ob_tier WHERE card_type='M3' AND card_level IS NULL`,
      );
      const hc = await qr.query(
        `SELECT tier_level FROM ob_tier WHERE card_type='HC' AND card_level IS NULL`,
      );
      const c3 = await qr.query(
        `SELECT tier_level FROM ob_tier WHERE card_type='C3' AND card_level IS NULL`,
      );
      const hStandard = await qr.query(
        `SELECT tier_level FROM ob_tier WHERE card_type='H' AND card_level='A'`,
      );
      expect((m3 as Array<{ tier_level: string }>)[0].tier_level).toBe('T5');
      expect((hc as Array<{ tier_level: string }>)[0].tier_level).toBe('T1'); // THC → T1 特例
      expect((c3 as Array<{ tier_level: string }>)[0].tier_level).toBe('T3');
      // 已在 T1~T10 內者不變
      expect((hStandard as Array<{ tier_level: string }>)[0].tier_level).toBe('T1');

      // D-CT-03：SQLite 環境 noop（不該 throw、不該 ALTER）
      await new AddObTierTierLevelCheck1711360000163().up(qr);

      // === DOWN ===
      // D-CT-03 SQLite noop
      await new AddObTierTierLevelCheck1711360000163().down(qr);

      // 1711360000162 down 是 unreversible（throw Error）— 設計如此
      await expect(
        new MigrateObTierTierLevelSuffix1711360000162().down(qr),
      ).rejects.toThrow(/not reversible/i);

      // D-CT-02：刪除 6 個正規 seed
      await new SeedObCardTypeNormative61711360000161().down(qr);
      const remaining = await qr.query(`SELECT COUNT(*) AS c FROM ob_card_type`);
      expect(Number((remaining as Array<{ c: number | string }>)[0].c)).toBe(0);

      // D-CT-01：drop ob_card_type table
      await new CreateObCardType1711360000160().down(qr);
      const tableAfterDrop = await qr.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='ob_card_type'`,
      );
      expect(tableAfterDrop).toHaveLength(0);
    } finally {
      await qr.release();
    }
  });

  it('D-CT-02 down() 不誤刪業務手動新增的紀錄（限定 IN (H,S,E,S5,E5,M))', async () => {
    const qr = dataSource.createQueryRunner();
    try {
      await new CreateObCardType1711360000160().up(qr);
      await new SeedObCardTypeNormative61711360000161().up(qr);

      // 模擬業務主管手動新增的 CARD_TYPE 'X'
      await qr.query(
        `INSERT INTO ob_card_type (card_type, card_name, prod_kind, status,
                                   created_at, created_by, updated_at, updated_by)
         VALUES ('X', '業務新增', '01', 'active',
                 CURRENT_TIMESTAMP, 'sm-user', CURRENT_TIMESTAMP, 'sm-user')`,
      );

      // 確認新增成功
      const before = await qr.query(`SELECT COUNT(*) AS c FROM ob_card_type`);
      expect(Number((before as Array<{ c: number | string }>)[0].c)).toBe(7);

      // 執行 down() → 應只刪 6 個正規值，保留 X
      await new SeedObCardTypeNormative61711360000161().down(qr);

      const after = await qr.query(`SELECT card_type FROM ob_card_type`);
      expect(after).toHaveLength(1);
      expect((after as Array<{ card_type: string }>)[0].card_type).toBe('X');
    } finally {
      await qr.release();
    }
  });
});
