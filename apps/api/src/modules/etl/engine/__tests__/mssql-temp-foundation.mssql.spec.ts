/**
 * AD-E07-41 P4-spike — MSSQL ETL 引擎技術地基驗證（真實 TypeORM QueryRunner，非 standalone mssql 腳本）。
 *
 * 🔴🔴 封鎖級發現（本 spike 結論）：AD-E07-41 §1.1 / §3 之核心前提「單一 QueryRunner 貫穿 ⇒ 區域暫存表
 *      (#local temp) 可跨節點存活」在 TypeORM(0.3.x)+node-mssql(tedious) 下 **不成立**。
 *      實測（見下方 FINDING 群組 + scratchpad 探針）：
 *        • 連續 queryRunner.query() 落在「同一實體連線」（@@SPID 恆定）；
 *        • 然而 #local temp 於「下一次 .query()」即消失（Invalid object name）——driver 於每次 request
 *          之間重置 session 狀態（推測：node-mssql 連線池 reset）；
 *        • 即使明確 startTransaction() 亦無法保留（同 SPID 仍失敗）→ 「包一層交易」無法補救；
 *        • ##global temp 則可跨 query 存活（落 tempdb，instance-scoped，不受 session reset 影響）；
 *        • 單一 .query() 內多語句 batch（同一 round-trip）亦可存活。
 *      ⇒ 以 #local temp 作為節點間資料傳遞介質的 CTAS 架構無法照 AD 原設計搬到 mssql。需架構師裁示補救路線
 *        （候選：##global temp / 具名實體 staging 表 / 其他）後，方可進入 §9 P4 各子切片。**本 spike 未達 DoD。**
 *
 * 本檔性質：忠實鎖定「已實測驗證之事實」（characterization），不偽造綠燈、不擅自改採 ## 當定案：
 *   FINDING — 封鎖級：#temp 不跨 query 存活（含交易亦然）＋連線其實同一條（SPID 恆定）。
 *   TRAP/META — 與 #/## 無關之通用結論：INFORMATION_SCHEMA 抓不到暫存表（且 BIN 下須大寫）；
 *               tempdb.sys.columns+OBJECT_ID 可靠內省（I-MSSQL-TEMP-METADATA-01 機制本身成立）。
 *   REMEDY-EVIDENCE — 候選補救 ##global temp 之可行性證據（多節點鏈存活 + dedup ROW_NUMBER 改寫正確），
 *               供架構師裁示；**非**本 spike 逕自採用之定案。
 *
 * Gating：連不上 MSSQL（docker compose --profile mssql）→ 每個 test ctx.skip()，不偽造綠燈。
 *   DB_NAME=CDMP_TEST（與 dev 隔離）。暫存表落 tempdb，不污染 dbo。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql）；沿用既有慣例。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '@/database/__tests__/mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource, QueryRunner } from 'typeorm';
import { makeTempTableName } from '@/modules/etl/engine/types';

// feedback_pg_spec_parallel_timeout：首次連線握手 / CPU 競爭下預設 5s 易誤判逾時。
vi.setConfig({ testTimeout: 60000 });

function baseOptions() {
  return {
    type: 'mssql' as const,
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: MSSQL.database,
    options: {
      encrypt: MSSQL.encrypt,
      trustServerCertificate: MSSQL.trustServerCertificate,
    },
    entities: [],
    synchronize: false,
  };
}

let reachable = false;
let ds: DataSource | null = null;
let qr: QueryRunner | null = null;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !qr) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-41 P4-spike] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

/** 唯一化 ##global temp 名稱（避免同 instance 併發碰撞；模擬 makeTempTableName 之 logId 唯一性）。 */
function gname(tag: string): string {
  return '##' + tag + '_' + Math.random().toString(36).slice(2, 8);
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource(baseOptions());
    await ds.initialize();
    qr = ds.createQueryRunner();
    await qr.connect();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-41 P4-spike] init failed → skip:', (e as Error)?.message);
    reachable = false;
    qr = null;
  }
}, 60000);

afterAll(async () => {
  if (qr) await qr.release();
  await ds?.destroy();
  restoreDbType();
});

// ===========================================================================
// FINDING — 🔴 封鎖級：#local temp 不跨 query 存活（即使同一連線 / 交易內）
// ===========================================================================
describe('AD-E07-41 P4-spike FINDING（#temp 不跨 query 存活 — 動搖 CTAS 方案）', () => {
  it('FIND-01：連續 queryRunner.query() 落在同一實體連線（@@SPID 恆定）— 排除「連線切換」為主因', async (ctx) => {
    ensureMssql(ctx);
    const s1 = Number((await qr!.query('SELECT @@SPID AS s'))[0].s);
    const s2 = Number((await qr!.query('SELECT @@SPID AS s'))[0].s);
    const s3 = Number((await qr!.query('SELECT @@SPID AS s'))[0].s);
    expect(s1).toBe(s2);
    expect(s2).toBe(s3);
  });

  it('FIND-02：🔴 SELECT INTO #foo 後，下一次 .query() 已看不到 #foo（session 狀態於 request 間被重置）', async (ctx) => {
    ensureMssql(ctx);
    // SELECT INTO 本身成功（CTAS 語法可行）；問題在於「跨 .query() 不存活」。
    await qr!.query(`SELECT * INTO #foo FROM (VALUES (1,N'借新還舊'),(2,N'中古車商')) AS v(id, memo)`);
    await expect(qr!.query('SELECT COUNT(*) AS cnt FROM #foo')).rejects.toThrow(/invalid object name/i);
  });

  it('FIND-03：🔴 即使 startTransaction() 釘住連線（同 SPID），#tx 仍不跨 query 存活 →「包交易」無法補救', async (ctx) => {
    ensureMssql(ctx);
    const txQr = ds!.createQueryRunner();
    await txQr.connect();
    await txQr.startTransaction();
    try {
      const s1 = Number((await txQr.query('SELECT @@SPID AS s'))[0].s);
      await txQr.query(`SELECT * INTO #tx FROM (VALUES (1),(2)) AS v(id)`);
      const s2 = Number((await txQr.query('SELECT @@SPID AS s'))[0].s);
      expect(s1).toBe(s2); // 交易內確為同一連線
      await expect(txQr.query('SELECT COUNT(*) AS cnt FROM #tx')).rejects.toThrow(/invalid object name/i);
      await txQr.commitTransaction();
    } catch (e) {
      if (txQr.isTransactionActive) await txQr.rollbackTransaction();
      throw e;
    } finally {
      await txQr.release();
    }
  });

  it('FIND-04：CTAS 語法本身可行 — 單一 .query() 內「建表+計數」同一 round-trip 得 2（證明是存活性而非語法問題）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await qr!.query(
      `SELECT * INTO #b FROM (VALUES (1),(2)) AS v(id); SELECT COUNT(*) AS cnt FROM #b; DROP TABLE #b;`,
    );
    // 多語句 batch 回傳最後一個 recordset。
    expect(Number(rows[0].cnt)).toBe(2);
  });
});

// ===========================================================================
// TRAP / META — 與 #/## 無關之通用結論（point b + point c 之機制本身成立）
// ===========================================================================
describe('AD-E07-41 P4-spike TRAP/META（information_schema 地雷 + tempdb.sys.columns 內省）', () => {
  it('META-01：point(b) INFORMATION_SCHEMA.COLUMNS 抓不到暫存表（回 0 列）；且 BIN collation 下須大寫', async (ctx) => {
    ensureMssql(ctx);
    const g = gname('trap');
    await qr!.query(`SELECT * INTO ${g} FROM (VALUES (1,N'x')) AS v(id, memo)`);
    try {
      // 大寫版：可執行但對暫存表回 0 列（暫存表落 tempdb 且系統附隨機尾碼）。
      const rows = await qr!.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @0`,
        [g],
      );
      expect(rows.length).toBe(0);
      // 小寫版於 BIN collation 直接拋「Invalid object name」→ 佐證 P4a 須以大寫 catalog view。
      await expect(
        qr!.query(`SELECT column_name FROM information_schema.columns WHERE table_name = @0`, [g]),
      ).rejects.toThrow(/invalid object name/i);
    } finally {
      await qr!.query(`IF OBJECT_ID('tempdb..${g}') IS NOT NULL DROP TABLE ${g}`);
    }
  });

  it('META-02：point(c) tempdb.sys.columns + OBJECT_ID(\'tempdb..name\') 可靠解析欄位清單與型別（依 column_id 序）', async (ctx) => {
    ensureMssql(ctx);
    const g = gname('meta');
    await qr!.query(`SELECT * INTO ${g} FROM (VALUES (1,N'借新還舊'),(2,N'中古車商')) AS v(id, memo)`);
    try {
      const rows = await qr!.query(
        `SELECT c.name AS column_name, t.name AS typ, c.column_id
           FROM tempdb.sys.columns c
           JOIN tempdb.sys.types t ON c.user_type_id = t.user_type_id
          WHERE c.object_id = OBJECT_ID('tempdb..' + @0)
          ORDER BY c.column_id`,
        [g],
      );
      expect(rows.map((r: { column_name: string }) => r.column_name)).toEqual(['id', 'memo']);
      const byName = new Map(
        rows.map((r: { column_name: string; typ: string }) => [r.column_name, r.typ]),
      );
      expect(byName.get('id')).toBe('int');
      expect(byName.get('memo')).toBe('nvarchar');
    } finally {
      await qr!.query(`IF OBJECT_ID('tempdb..${g}') IS NOT NULL DROP TABLE ${g}`);
    }
  });

  it('META-03：中文 N\'…\' 於暫存表 round-trip 逐字元正確（BIG5/BIN 呼應）', async (ctx) => {
    ensureMssql(ctx);
    const g = gname('cjk');
    await qr!.query(`SELECT * INTO ${g} FROM (VALUES (1,N'借新還舊'),(2,N'中古車商')) AS v(id, memo)`);
    try {
      const rows = await qr!.query(`SELECT id, memo FROM ${g} ORDER BY id`);
      expect(rows.map((x: { memo: string }) => x.memo)).toEqual(['借新還舊', '中古車商']);
    } finally {
      await qr!.query(`IF OBJECT_ID('tempdb..${g}') IS NOT NULL DROP TABLE ${g}`);
    }
  });
});

// ===========================================================================
// REMEDY-EVIDENCE — 候選補救 ##global temp 可行性（供架構師裁示；非本 spike 逕自定案）
// ===========================================================================
describe('AD-E07-41 P4-spike REMEDY-EVIDENCE（##global temp 候選補救之可行性證據）', () => {
  it('REM-01：##global temp 多節點鏈 ##a → ##b(由 ##a 建) → 查 ##b，跨多次 .query() 全程存活', async (ctx) => {
    ensureMssql(ctx);
    const a = gname('a');
    const b = gname('b');
    try {
      await qr!.query(`SELECT * INTO ${a} FROM (VALUES (1,N'借新還舊'),(2,N'中古'),(3,N'x')) AS v(id, memo)`);
      await qr!.query(`SELECT * INTO ${b} FROM ${a} WHERE id >= 2`);
      const cnt = await qr!.query(`SELECT COUNT(*) AS cnt FROM ${b}`);
      expect(Number(cnt[0].cnt)).toBe(2);
      // 命名沿用 makeTempTableName 邏輯（僅前綴改 ##）— I-MSSQL-TEMPTABLE-PREFIX-01 若採 ## 需相應調整。
      const base = makeTempTableName('n1', 'abcdef1234567890');
      expect(base).toBe('etl_tmp_n1_abcdef12');
    } finally {
      await qr!.query(`IF OBJECT_ID('tempdb..${b}') IS NOT NULL DROP TABLE ${b}`);
      await qr!.query(`IF OBJECT_ID('tempdb..${a}') IS NOT NULL DROP TABLE ${a}`);
    }
  });

  it('REM-02：point(d) DISTINCT ON+ctid → ROW_NUMBER()+IDENTITY(_seq) 去重改寫，邏輯正確（每 key 最新 ts、NULL 最後）', async (ctx) => {
    ensureMssql(ctx);
    const raw = gname('dedup');
    try {
      // IDENTITY(INT,1,1) 之 _seq 捕捉列寫入順序（取代 PG ctid，I-MSSQL-DEDUP-TIEBREAK-01）。
      await qr!.query(
        `SELECT IDENTITY(INT,1,1) AS _seq, k, ts, payload
           INTO ${raw}
           FROM (VALUES
             ('A', CAST('2026-01-01' AS DATE), N'A-old'),
             ('A', CAST('2026-03-01' AS DATE), N'A-new'),
             ('B', CAST('2026-02-01' AS DATE), N'B-first'),
             ('B', CAST('2026-02-01' AS DATE), N'B-second'),
             ('C', CAST(NULL AS DATE),          N'C-null'),
             ('C', CAST('2026-01-15' AS DATE), N'C-dated')
           ) AS v(k, ts, payload)`,
      );
      const rankSql = `
        ;WITH ranked AS (
          SELECT k, ts, payload, _seq,
            ROW_NUMBER() OVER (
              PARTITION BY k
              ORDER BY ts DESC, CASE WHEN ts IS NULL THEN 1 ELSE 0 END, _seq ASC
            ) AS rn
          FROM ${raw}
        )
        SELECT k, ts, payload, _seq FROM ranked WHERE rn = 1 ORDER BY k`;

      const rawCnt = await qr!.query(`SELECT COUNT(*) AS cnt FROM ${raw}`);
      expect(Number(rawCnt[0].cnt)).toBe(6);

      const rows = await qr!.query(rankSql);
      expect(rows.length).toBe(3); // 每 key 恰 1 列
      const byKey = new Map(rows.map((r: { k: string; payload: string }) => [r.k, r.payload]));
      expect(byKey.get('A')).toBe('A-new'); // ts 不同 → 取最新
      expect(byKey.get('C')).toBe('C-dated'); // NULL 排最後 → 有值者勝

      // ts 並列（B）→ 以確定性 tie-breaker(_seq ASC) 取最小 _seq。
      const bWinner = rows.find((r: { k: string }) => r.k === 'B') as { payload: string; _seq: number };
      const minSeq = await qr!.query(`SELECT MIN(_seq) AS m FROM ${raw} WHERE k = 'B'`);
      expect(bWinner._seq).toBe(Number(minSeq[0].m));
      expect(['B-first', 'B-second']).toContain(bWinner.payload);

      // 決定性：重複執行結果一致（非隨機）。
      const again = await qr!.query(rankSql);
      const bAgain = again.find((r: { k: string }) => r.k === 'B') as { payload: string; _seq: number };
      expect(bAgain.payload).toBe(bWinner.payload);
      expect(bAgain._seq).toBe(bWinner._seq);
    } finally {
      await qr!.query(`IF OBJECT_ID('tempdb..${raw}') IS NOT NULL DROP TABLE ${raw}`);
    }
  });
});
