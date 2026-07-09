/**
 * AD-E07-43 P5 收尾 — ob_monthly_run_result.cr_nm varchar→nvarchar round-trip 驗證（真實 dev CDMP MSSQL）。
 * 不變式 I-MSSQL-NVARCHAR-DISPLAY-01；承 P5i 手法（mssql-p5i-nvarchar.mssql.spec.ts）。
 *
 * 對應 docs/test-specs/infrastructure/AD-E07-43-P5-followup-display-test.md：
 *   §二 CRNM-SCHEMA-001：ob_monthly_run_result.cr_nm 修法後 = nvarchar(50)。
 *   §二 CRNM-SCHEMA-002：同表其餘 12 欄維持 varchar；settle_src 維持 nvarchar(MAX)（-1）。
 *   §三 CRNM-ROUNDTRIP-001：45 中文字（90 bytes）寫入 nvarchar(50) → 讀回完整不截斷。
 *   §三 CRNM-CONTRAST-001：同值寫入 varchar(50) BIN → 拋 truncation（未修法真實風險逐字證據）。
 *   §三 CRNM-REALISTIC-001：'CR' + 25 中文字（27 字 / 54 bytes）於 nvarchar(50) 正確保存。
 *   §四 CRNM-WRITEPATH-001/002/003/004：真實 Stage 1 INSERT…SELECT 寫入路徑（cr_nm = 'CR' + emp_nm）。
 *
 * §一 GATE-002 決策：WRITEPATH 群組採「簡化 core.where=1=1」——忠實複刻 `stage1-sql-executor-mssql.ts`
 *   之 INSERT…SELECT set-based 陳述式（'CR' + cremp.emp_nm 串接 + @@ROWCOUNT 讀回），對真實
 *   ob_monthly_run_result（本 slice 修為 nvarchar 之目標欄）執行，不重跑完整名單篩選鏈（比照 P5c
 *   「重建 Stage 1 seed 列」先例）。核心黑盒斷言（INSERT 成功/失敗、cr_nm 值）不受簡化影響。
 *
 * 隔離：專屬 schema `p5fu`（自建/自清、try/finally DROP，不觸 dbo 已部署 baseline）。
 * Gating：連不上 dev CDMP → ctx.skip（不偽造綠燈，feedback_mock_real_system_contract）。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 entity column-types helper 解析 mssql 分支）。
import { restoreDbType, MSSQL, mssqlPortReachable, SKIP_REASON } from './mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';

import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { nvarcharColumnType } from '@/common/database/column-types';

vi.setConfig({ testTimeout: 60000 });

const SCHEMA = 'p5fu';
let reachable = false;
let ds: DataSource | null = null;
let runId = '';

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-43 P5FU CRNM] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

const LONG_ZH = '測'.repeat(45); // 45 中文字 = 90 bytes（> varchar(50)，≤ nvarchar(50)）
const NAME_25 = '長'.repeat(25); // 'CR' + 25 中文 = 27 字 / 54 bytes（略超 50-byte varchar 容量）

/** 建立最小 source 探針表（不 synchronize 全 100 欄 ObPoolData/ObEmphire，僅寫入路徑必要欄）。 */
async function createSourceProbes(): Promise<void> {
  await ds!.query(
    `IF OBJECT_ID('${SCHEMA}.ob_pool_data','U') IS NULL CREATE TABLE ${SCHEMA}.ob_pool_data (
       orgno varchar(2), appl_no varchar(10), custo_no varchar(11),
       settle_src nvarchar(max), appl_date datetime2 NULL, agent_id varchar(11))`,
  );
  await ds!.query(
    `IF OBJECT_ID('${SCHEMA}.ob_emphire','U') IS NULL CREATE TABLE ${SCHEMA}.ob_emphire (
       id_no varchar(10), emp_id varchar(10), emp_nm nvarchar(50), resign_date date NULL)`,
  );
  await ds!.query(
    `IF OBJECT_ID('${SCHEMA}.p5fu_probe_varchar','U') IS NULL CREATE TABLE ${SCHEMA}.p5fu_probe_varchar (cr_nm varchar(50) NULL)`,
  );
}

/** 清 source 探針 + 前綴 result 列（保留 synchronize 之表結構）。 */
async function resetSourceRows(): Promise<void> {
  await ds!.query(`DELETE FROM ${SCHEMA}.ob_pool_data`);
  await ds!.query(`DELETE FROM ${SCHEMA}.ob_emphire`);
  await ds!.query(`DELETE FROM ${SCHEMA}.p5fu_probe_varchar`);
  await ds!.query(`DELETE FROM ${SCHEMA}.ob_monthly_run_result WHERE list_no LIKE 'P5FU_%'`);
}

/**
 * 忠實複刻 stage1-sql-executor-mssql.ts::runStage1SqlInsertMssql 之 INSERT…SELECT（core.where=1=1）。
 * @@ROWCOUNT 讀回影響列數。cr_nm 串接 = `'CR' + cremp.emp_nm`（T-SQL；NULL 傳播與 PG `||` 等價）。
 *
 * ⚠️ 表名一律 `${SCHEMA}.` 完整限定：連線池不同 pooled connection 之預設 schema 未必為 p5fu，
 *   裸表名會非決定性落回 dbo（已部署 baseline 空表）→ INSERT…SELECT 讀 0 列。生產執行器走 entity
 *   default schema 無此問題；本 harness（raw ds.query）須顯式限定。
 */
async function runFaithfulStage1Insert(listNo: string, crSysDate: string): Promise<number> {
  const sql =
    `INSERT INTO ${SCHEMA}.ob_monthly_run_result ` +
    `(run_id, list_no, orgno, appl_no, custo_no, settle_src, cr_id, cr_nm, is_cr, appl_date, result_status, created_at, updated_at) ` +
    `SELECT @0, @1, o.orgno, o.appl_no, o.custo_no, o.settle_src, ` +
    `cremp.emp_id, CASE WHEN cremp.emp_id IS NOT NULL THEN 'CR' + cremp.emp_nm ELSE NULL END, 'N', o.appl_date, 'PENDING', ` +
    `CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ` +
    `FROM ${SCHEMA}.ob_pool_data o ` +
    `LEFT JOIN (SELECT TRIM(id_no) AS agent_ref, emp_id, emp_nm FROM ${SCHEMA}.ob_emphire ` +
    `WHERE resign_date IS NULL OR resign_date >= @2) cremp ` +
    `ON COALESCE(TRIM(o.agent_id), '') <> '' AND cremp.agent_ref = TRIM(o.agent_id) ` +
    `WHERE 1=1; ` +
    `SELECT @@ROWCOUNT AS affected`;
  const rows = (await ds!.query(sql, [runId, listNo, crSysDate])) as
    | Array<{ affected: string | number }>
    | undefined;
  return Array.isArray(rows) && rows[0]?.affected != null ? Number(rows[0].affected) : 0;
}

async function dataType(
  table: string,
  column: string,
): Promise<{ type: string; len: number | null }> {
  const rows: Array<{ DATA_TYPE: string; CHARACTER_MAXIMUM_LENGTH: number | null }> =
    await ds!.query(
      `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @0 AND TABLE_NAME = @1 AND COLUMN_NAME = @2`,
      [SCHEMA, table, column],
    );
  return { type: rows[0]?.DATA_TYPE, len: rows[0]?.CHARACTER_MAXIMUM_LENGTH ?? null };
}

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
        useUTC: true, // 對齊 P5h（本 slice 為字串欄；appl_date datetime2 亦沿用生產設定）
      },
      entities: [AssignmentRun, ObMonthlyRunResult],
      synchronize: false,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-43 P5FU CRNM] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  await ds.query(`IF SCHEMA_ID('${SCHEMA}') IS NULL EXEC('CREATE SCHEMA ${SCHEMA}')`);
  // 先丟 FK 依賴子表再丟母表
  for (const t of ['ob_monthly_run_result', 'assignment_run']) {
    await ds.query(`IF OBJECT_ID('${SCHEMA}.${t}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${t}`);
  }
  await ds.synchronize();
  await createSourceProbes();
  // 建 assignment_run 母列（FK），供 ob_monthly_run_result.run_id 參照
  const run = await ds
    .getRepository(AssignmentRun)
    .save(
      ds.getRepository(AssignmentRun).create({
        project_workym: '202607',
        status: 'completed',
        triggered_by: '00000000-0000-0000-0000-000000000001',
      } as Partial<AssignmentRun>),
    );
  runId = run.run_id;
}, 60000);

afterAll(async () => {
  if (ds) {
    for (const t of [
      'ob_monthly_run_result',
      'assignment_run',
      'ob_pool_data',
      'ob_emphire',
      'p5fu_probe_varchar',
    ]) {
      await ds
        .query(`IF OBJECT_ID('${SCHEMA}.${t}','U') IS NOT NULL DROP TABLE ${SCHEMA}.${t}`)
        .catch(() => undefined);
    }
    await ds.destroy();
  }
  restoreDbType();
});

describe('AD-E07-43 P5FU — ob_monthly_run_result.cr_nm nvarchar（I-MSSQL-NVARCHAR-DISPLAY-01）', () => {
  it('helper 於 mssql 分支解析為 nvarchar（前置健全性）', () => {
    expect(nvarcharColumnType).toBe('nvarchar');
  });

  it('TS-P5FU-CRNM-SCHEMA-001：cr_nm = nvarchar(50)（真 INFORMATION_SCHEMA）', async (ctx) => {
    ensureMssql(ctx);
    const t = await dataType('ob_monthly_run_result', 'cr_nm');
    expect(t.type).toBe('nvarchar');
    expect(t.len).toBe(50);
  });

  it('TS-P5FU-CRNM-SCHEMA-002：其餘 12 欄維持 varchar；settle_src 維持 nvarchar(MAX)', async (ctx) => {
    ensureMssql(ctx);
    for (const col of [
      'custo_no',
      'card_level',
      'tier_level',
      'is_cr',
      'cr_id',
      'dept_id',
      'emplid',
      'emplid_deptid',
      'result_status',
      'assignday',
      'list_no',
      'orgno',
    ]) {
      expect((await dataType('ob_monthly_run_result', col)).type).toBe('varchar');
    }
    const settle = await dataType('ob_monthly_run_result', 'settle_src');
    expect(settle.type).toBe('nvarchar');
    expect(settle.len).toBe(-1); // nvarchar(MAX)
  });

  it('TS-P5FU-CRNM-ROUNDTRIP-001：45 中文字寫入 nvarchar(50) cr_nm → 讀回完整 45 字不截斷', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(ObMonthlyRunResult);
    await repo.query(`DELETE FROM ${SCHEMA}.ob_monthly_run_result WHERE list_no = 'P5FU_RT'`);
    await repo.save(
      repo.create({
        run_id: runId,
        list_no: 'P5FU_RT',
        orgno: 'OB',
        appl_no: 'RT0000001',
        cr_nm: LONG_ZH,
        settle_src: 'N',
      } as Partial<ObMonthlyRunResult>),
    );
    const back = await repo.findOneByOrFail({
      run_id: runId,
      list_no: 'P5FU_RT',
      orgno: 'OB',
      appl_no: 'RT0000001',
    });
    expect(back.cr_nm).toBe(LONG_ZH);
    expect(back.cr_nm!.length).toBe(45);
  });

  it('TS-P5FU-CRNM-REALISTIC-001：\'CR\' + 25 中文字（27 字 / 54 bytes）於 nvarchar(50) 完整保存', async (ctx) => {
    ensureMssql(ctx);
    const repo = ds!.getRepository(ObMonthlyRunResult);
    const value = 'CR' + NAME_25; // 27 字
    await repo.query(`DELETE FROM ${SCHEMA}.ob_monthly_run_result WHERE list_no = 'P5FU_RE'`);
    await repo.save(
      repo.create({
        run_id: runId,
        list_no: 'P5FU_RE',
        orgno: 'OB',
        appl_no: 'RE0000001',
        cr_nm: value,
        settle_src: 'N',
      } as Partial<ObMonthlyRunResult>),
    );
    const back = await repo.findOneByOrFail({
      run_id: runId,
      list_no: 'P5FU_RE',
      orgno: 'OB',
      appl_no: 'RE0000001',
    });
    expect(back.cr_nm).toBe(value);
    expect(back.cr_nm!.length).toBe(27);
  });

  it('TS-P5FU-CRNM-CONTRAST-001：同 45 中文字寫入 varchar(50) BIN → 拋 truncation（未修法真實風險）', async (ctx) => {
    ensureMssql(ctx);
    let threw = false;
    try {
      await ds!.query(`INSERT INTO ${SCHEMA}.p5fu_probe_varchar (cr_nm) VALUES (@0)`, [LONG_ZH]);
    } catch (e) {
      threw = true;
      expect(String((e as Error).message)).toMatch(/truncat|String or binary/i);
    }
    expect(threw).toBe(true);
  });

  // -----------------------------------------------------------------------
  // §四 WRITEPATH — 真實 Stage 1 INSERT…SELECT 寫入路徑（GATE-002：core.where=1=1 簡化）
  // -----------------------------------------------------------------------
  describe('WRITEPATH（真實 INSERT…SELECT set-based，cr_nm = \'CR\' + emp_nm）', () => {
    it('TS-P5FU-CRNM-WRITEPATH-001：超長中文姓名（>50 bytes）→ INSERT 成功、cr_nm 完整不截斷', async (ctx) => {
      ensureMssql(ctx);
      await resetSourceRows();
      // in-service emphire（resign_date NULL）、emp_nm = 25 中文；agent_id 命中 id_no
      await ds!.query(
        `INSERT INTO ${SCHEMA}.ob_emphire (id_no, emp_id, emp_nm, resign_date) VALUES (@0,@1,@2,NULL)`,
        ['A123456789', 'E0001', NAME_25],
      );
      await ds!.query(
        `INSERT INTO ${SCHEMA}.ob_pool_data (orgno, appl_no, custo_no, settle_src, appl_date, agent_id)
         VALUES ('OB','WP0000001','C0000000001','N','2026-07-01 10:00:00','A123456789')`,
      );
      const inserted = await runFaithfulStage1Insert('P5FU_WP1', '2026-07-01');
      expect(inserted).toBe(1);
      const rows: Array<{ cr_nm: string }> = await ds!.query(
        `SELECT cr_nm FROM ${SCHEMA}.ob_monthly_run_result WHERE list_no='P5FU_WP1'`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].cr_nm).toBe('CR' + NAME_25);
      expect(rows[0].cr_nm.length).toBe(27);
    });

    it('TS-P5FU-CRNM-WRITEPATH-002：同 fixture 寫入 varchar(50) 目標 → 整批 INSERT 失敗（0 列寫入）', async (ctx) => {
      ensureMssql(ctx);
      await resetSourceRows();
      await ds!.query(
        `INSERT INTO ${SCHEMA}.ob_emphire (id_no, emp_id, emp_nm, resign_date) VALUES (@0,@1,@2,NULL)`,
        ['A123456789', 'E0001', NAME_25],
      );
      await ds!.query(
        `INSERT INTO ${SCHEMA}.ob_pool_data (orgno, appl_no, custo_no, settle_src, appl_date, agent_id)
         VALUES ('OB','WP0000002','C0000000001','N','2026-07-01 10:00:00','A123456789')`,
      );
      // 目標 cr_nm varchar(50)：set-based INSERT…SELECT 對超長中文 → 整批拋 truncation
      const sql =
        `INSERT INTO ${SCHEMA}.p5fu_probe_varchar (cr_nm) ` +
        `SELECT CASE WHEN cremp.emp_id IS NOT NULL THEN 'CR' + cremp.emp_nm ELSE NULL END ` +
        `FROM ${SCHEMA}.ob_pool_data o ` +
        `LEFT JOIN (SELECT TRIM(id_no) AS agent_ref, emp_id, emp_nm FROM ${SCHEMA}.ob_emphire ` +
        `WHERE resign_date IS NULL OR resign_date >= '2026-07-01') cremp ` +
        `ON COALESCE(TRIM(o.agent_id), '') <> '' AND cremp.agent_ref = TRIM(o.agent_id) WHERE 1=1`;
      let threw = false;
      try {
        await ds!.query(sql);
      } catch (e) {
        threw = true;
        expect(String((e as Error).message)).toMatch(/truncat|String or binary/i);
      }
      expect(threw).toBe(true);
      const cnt: Array<{ c: number }> = await ds!.query(
        `SELECT COUNT(*) AS c FROM ${SCHEMA}.p5fu_probe_varchar`,
      );
      expect(Number(cnt[0].c)).toBe(0); // 整批失敗，非部分成功
    });

    it('TS-P5FU-CRNM-WRITEPATH-003：正常長度姓名（2 中文）→ cr_nm = \'CR\' + emp_nm 逐字正確（零回歸）', async (ctx) => {
      ensureMssql(ctx);
      await resetSourceRows();
      await ds!.query(
        `INSERT INTO ${SCHEMA}.ob_emphire (id_no, emp_id, emp_nm, resign_date) VALUES (@0,@1,@2,NULL)`,
        ['B987654321', 'E0002', '張三'],
      );
      await ds!.query(
        `INSERT INTO ${SCHEMA}.ob_pool_data (orgno, appl_no, custo_no, settle_src, appl_date, agent_id)
         VALUES ('OB','WP0000003','C0000000002','N','2026-07-01 10:00:00','B987654321')`,
      );
      const inserted = await runFaithfulStage1Insert('P5FU_WP3', '2026-07-01');
      expect(inserted).toBe(1);
      const rows: Array<{ cr_nm: string; cr_id: string }> = await ds!.query(
        `SELECT cr_nm, cr_id FROM ${SCHEMA}.ob_monthly_run_result WHERE list_no='P5FU_WP3'`,
      );
      expect(rows[0].cr_nm).toBe('CR張三');
      expect(rows[0].cr_id).toBe('E0002');
    });

    it('TS-P5FU-CRNM-WRITEPATH-004：agent_id 未命中在職 emphire（CASE ELSE）→ cr_nm 維持 NULL', async (ctx) => {
      ensureMssql(ctx);
      await resetSourceRows();
      // pool 有 agent_id，但 emphire 無對應 id_no → LEFT JOIN 未命中 → emp_id NULL → CASE ELSE
      await ds!.query(
        `INSERT INTO ${SCHEMA}.ob_pool_data (orgno, appl_no, custo_no, settle_src, appl_date, agent_id)
         VALUES ('OB','WP0000004','C0000000003','N','2026-07-01 10:00:00','Z000000000')`,
      );
      const inserted = await runFaithfulStage1Insert('P5FU_WP4', '2026-07-01');
      expect(inserted).toBe(1);
      const rows: Array<{ cr_nm: string | null; cr_id: string | null }> = await ds!.query(
        `SELECT cr_nm, cr_id FROM ${SCHEMA}.ob_monthly_run_result WHERE list_no='P5FU_WP4'`,
      );
      expect(rows[0].cr_nm).toBeNull();
      expect(rows[0].cr_id).toBeNull();
    });
  });
});
