/**
 * AD-E07-43 P5i — 中文顯示欄 nvarchar round-trip 驗證（真實 SQL Server 2022 容器）。
 * 不變式 I-MSSQL-NVARCHAR-DISPLAY-01：來源 legacy nvarchar 之中文顯示欄，於 MSSQL 目標須為 nvarchar，
 * 不得收斂為 byte 計長之 varchar（BIN collation 下長中文截斷/溢位）。
 *
 * 覆蓋：
 *   SCHEMA-001：ObEmphire / ObPoolData synchronize 後，顯示欄 DATA_TYPE='nvarchar'、代碼欄維持 'varchar'
 *               （證明 nvarcharColumnType helper + entity 於 mssql 分支落 nvarchar）。
 *   ROUNDTRIP-001：45 個中文字寫入 nvarchar(50) 顯示欄 → 讀回完整 45 字不截斷。
 *   CONTRAST-001：同一 45 中文字寫入 varchar(50) BIN 欄 → 溢位（String or binary data would be truncated），
 *               具體證明「未修法（varchar）之截斷風險」為真、非測試假象（AD §9.4）。
 *
 * Gating：連不上 MSSQL → ctx.skip()，不偽造綠燈（feedback_mock_real_system_contract）。
 * 專屬 schema `p5i`（跨檔隔離、不污染 dbo）。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 entity 之 column-types helper 解析 mssql 分支值）。
import { restoreDbType, MSSQL, mssqlPortReachable, SKIP_REASON } from './mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';

import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { nvarcharColumnType } from '@/common/database/column-types';

// feedback_pg_spec_parallel_timeout：首次連線握手 / synchronize 於 CPU 競爭下易誤判逾時。
vi.setConfig({ testTimeout: 60000 });

const SCHEMA = 'p5i';
let reachable = false;
let ds: DataSource | null = null;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-43 P5i] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

// 45 個中文字（＝90 bytes）：> varchar(50) 之 50-byte 容量，但 ≤ nvarchar(50) 之 50-字元容量。
const LONG_ZH = '測'.repeat(45);

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: MSSQL.database,
      schema: SCHEMA,
      options: {
        encrypt: MSSQL.encrypt,
        trustServerCertificate: MSSQL.trustServerCertificate,
        useUTC: true, // 對齊 P5h I-MSSQL-DATE-TZ-01（本 slice 為字串欄、與時區無關，維持一致）
      },
      entities: [ObEmphire, ObPoolData],
      synchronize: false,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-43 P5i] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  await ds.query(`IF SCHEMA_ID('${SCHEMA}') IS NULL EXEC('CREATE SCHEMA ${SCHEMA}')`);
  for (const t of ['ob_emphire', 'ob_pool_data']) {
    await ds.query(`IF OBJECT_ID('${SCHEMA}.${t}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${t}`);
  }
  await ds.synchronize();
}, 60000);

afterAll(async () => {
  if (ds) {
    for (const t of ['ob_emphire', 'ob_pool_data', 'p5i_probe']) {
      await ds.query(`IF OBJECT_ID('${SCHEMA}.${t}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${t}`).catch(() => undefined);
    }
    await ds.destroy();
  }
  restoreDbType();
});

async function dataType(table: string, column: string): Promise<{ type: string; len: number | null }> {
  const rows: Array<{ DATA_TYPE: string; CHARACTER_MAXIMUM_LENGTH: number | null }> = await ds!.query(
    `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @0 AND TABLE_NAME = @1 AND COLUMN_NAME = @2`,
    [SCHEMA, table, column],
  );
  return { type: rows[0]?.DATA_TYPE, len: rows[0]?.CHARACTER_MAXIMUM_LENGTH ?? null };
}

describe('AD-E07-43 P5i — 中文顯示欄 nvarchar（I-MSSQL-NVARCHAR-DISPLAY-01）', () => {
  it('helper 於 mssql 分支解析為 nvarchar（前置健全性）', () => {
    expect(nvarcharColumnType).toBe('nvarchar');
  });

  it('SCHEMA-001：ob_emphire 顯示欄=nvarchar、代碼欄維持 varchar', async (ctx) => {
    ensureMssql(ctx);
    // 轉換之顯示欄
    for (const col of ['emp_nm', 'dept_name', 'title_name', 'jfun_nm']) {
      expect((await dataType('ob_emphire', col)).type).toBe('nvarchar');
    }
    // 保留為代碼/鍵之欄位
    for (const col of ['emp_id', 'id_no', 'dept_code', 'title_code', 'jfun_id', 'is_auth']) {
      expect((await dataType('ob_emphire', col)).type).toBe('varchar');
    }
  });

  it('SCHEMA-002：ob_pool_data 顯示欄=nvarchar；legacy varchar 對照組（dlr_name/brnh_name）維持 varchar；PK/代碼欄維持 varchar', async (ctx) => {
    ensureMssql(ctx);
    for (const col of ['spec_name', 'cust_name', 'broker', 'car_name', 'memo1', 'coll_empl', 'dept_name']) {
      expect((await dataType('ob_pool_data', col)).type).toBe('nvarchar');
    }
    // AD §9.3 對照組：legacy 本就宣告 varchar，須維持 varchar（不誤轉）
    for (const col of ['dlr_name', 'brnh_name', 'prod_kind_name']) {
      expect((await dataType('ob_pool_data', col)).type).toBe('varchar');
    }
    // PK / 決策 / 代碼欄維持 varchar（不觸及 cutover-gating join key）
    for (const col of ['orgno', 'appl_no', 'custo_no', 'dept_id', 'sta_code', 'emplid']) {
      expect((await dataType('ob_pool_data', col)).type).toBe('varchar');
    }
  });

  it('ROUNDTRIP-001：45 中文字寫入 nvarchar(50) emp_nm → 讀回完整不截斷', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(ObEmphire);
    await repo.query(`DELETE FROM ${SCHEMA}.ob_emphire WHERE emp_id = 'P5I001'`);
    await repo.save(repo.create({ emp_id: 'P5I001', emp_nm: LONG_ZH }));
    const back = await repo.findOneByOrFail({ emp_id: 'P5I001' });
    expect(back.emp_nm).toBe(LONG_ZH);
    expect(back.emp_nm!.length).toBe(45);
  });

  it('CONTRAST-001：同一 45 中文字寫入 varchar(50) BIN 欄 → 溢位截斷錯誤（證明未修法之真實風險）', async (ctx) => {
    ensureMssql(ctx);
    await ds!.query(
      `IF OBJECT_ID('${SCHEMA}.p5i_probe','U') IS NULL CREATE TABLE ${SCHEMA}.p5i_probe (v varchar(50) NULL)`,
    );
    let threw = false;
    try {
      await ds!.query(`INSERT INTO ${SCHEMA}.p5i_probe (v) VALUES (@0)`, [LONG_ZH]);
    } catch (e) {
      threw = true;
      expect(String((e as Error).message)).toMatch(/truncat|String or binary/i);
    }
    expect(threw).toBe(true);
  });
});
