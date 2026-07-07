/**
 * AD-E07-41 P4-spike-2 — `##global temp` 補救方案（選項 A）之殘留風險去風險閘。
 *
 * 前提：P4-spike-1（`mssql-temp-foundation.mssql.spec.ts`，commit 75b6bb7）已證 `#local temp` 不跨
 *   `queryRunner.query()` 存活（封鎖級），架構師裁示改用 `##global temp`（AD §1.3 選項 A）。
 *   本 spike-2 為進入 P4a 大規模改寫「必須先全過」的閘，驗證選項 A 在真實併發/崩潰情境下的殘留風險。
 *
 * 四項驗證（AD §9 P4-spike-2 DoD + 本輪任務書）：
 *   POINT1 — `##` 跨節點鏈存活（於 pipeline 樣態重申 spike-1）：單一 QueryRunner 內 ##a→##b(SELECT INTO
 *            FROM ##a)→查詢，全程存活 + tempdb.sys.columns / OBJECT_ID('tempdb..##a') 內省正確。
 *   POINT2 — 🔴 併發不撞名/不互汙（封鎖級閘）：兩個不同 logId 的併發 pipeline（各自 DataSource＋
 *            QueryRunner，獨立連線池 ⇒ 真正並發、非被池排隊序列化，呼應 AD §9 連線池陷阱提醒），
 *            同時建同語意 `##` 表、寫不同資料、各自讀回 → 斷言互不干擾。含 instance-wide 可見性實證
 *            與「同名撞表」負向對照（證明 logId 唯一命名為 isolation 之唯一依據）。
 *   POINT3 — 🔴 崩潰清理（封鎖級閘）：pipeline 中途拋錯 → finally 路徑呼叫「真實 production helper」
 *            dropMssqlTempTableIfExists 後 OBJECT_ID 為 NULL；且對不存在的 `##` 再 drop 冪等不報錯。
 *   POINT4 — `##` 生命週期釐清（佐證 I-MSSQL-TEMPTABLE-CLEANUP-01 之必要性）：
 *            (a) QueryRunner.release()（連線歸還池、session 續存）後 `##` 仍殘留 → 顯式清理有其必要；
 *            (b) DataSource.destroy()（建立 session 真正結束）後 SQL Server 自動回收 → 隱性回收僅發生於
 *                session 結束，而非池化 release，正是 CLEANUP-01 要補安全網的原因。
 *
 * Gating：連不上 MSSQL（docker compose --profile mssql）→ 每個 test ctx.skip()，不偽造綠燈。
 *   DB_NAME=CDMP_TEST（與 dev 隔離）。所有暫存表落 tempdb 並於成功/失敗兩路徑顯式清理，不污染 dbo。
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
// 🔴 直接呼叫真實 production helper（P4-spike-2 先行落地於 handlers/mssql/temp-table.util.ts），
//    讓「崩潰清理」驗證跑的是 P4a 實際會用的程式路徑，而非測試檔內另寫一份等價 SQL。
import { dropMssqlTempTableIfExists } from '@/modules/etl/engine/handlers/mssql/temp-table.util';

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
    console.warn(`[AD-E07-41 P4-spike-2] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

/** 隨機 16 hex logId；makeTempTableName 取前 8 碼 → 併發/重跑不撞名（模擬 pipeline run 之 logId）。 */
function uniqueLogId(): string {
  return (
    Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '0000000000000000'
  ).slice(0, 16);
}

/** production 命名：`##` + 既有 makeTempTableName（僅前綴改 ##，makeTempTableName 本身不動）。 */
function tempName(nodeId: string, logId: string): string {
  return '##' + makeTempTableName(nodeId, logId);
}

/** OBJECT_ID('tempdb..name') 是否非 NULL（暫存表是否存在，可跨連線探測）。 */
async function objectExists(runner: QueryRunner, name: string): Promise<boolean> {
  const rows = await runner.query(`SELECT OBJECT_ID('tempdb..' + @0) AS oid`, [name]);
  return rows[0].oid != null;
}

/** 輪詢 OBJECT_ID 直到不存在（每次 query 為一 round-trip，天然間隔；不用 foreground sleep）。 */
async function waitObjectGone(runner: QueryRunner, name: string, tries = 15): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (!(await objectExists(runner, name))) return true;
  }
  return false;
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
    console.warn('[AD-E07-41 P4-spike-2] init failed → skip:', (e as Error)?.message);
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
// POINT1 — ## 跨節點鏈存活（pipeline 樣態）+ 內省正確（重申 spike-1 REM-01，補 OBJECT_ID/內省斷言）
// ===========================================================================
describe('AD-E07-41 P4-spike-2 POINT1（## 跨節點鏈存活 + tempdb 內省）', () => {
  it('P1-01：單一 QueryRunner 內 ##a → ##b(SELECT INTO FROM ##a) → 查詢，全程存活；OBJECT_ID/欄位內省正確', async (ctx) => {
    ensureMssql(ctx);
    const logId = uniqueLogId();
    const a = tempName('extract', logId);
    const b = tempName('filtered', logId);
    try {
      await qr!.query(
        `SELECT * INTO ${a} FROM (VALUES (1,N'借新還舊'),(2,N'中古車商'),(3,N'其他')) AS v(id, memo)`,
      );
      await qr!.query(`SELECT * INTO ${b} FROM ${a} WHERE id >= 2`);

      // 全程存活：兩表 OBJECT_ID 皆非 NULL。
      expect(await objectExists(qr!, a)).toBe(true);
      expect(await objectExists(qr!, b)).toBe(true);

      // ##b 由 ##a 篩出 → 2 列（id 2,3）。
      const cnt = await qr!.query(`SELECT COUNT(*) AS cnt FROM ${b}`);
      expect(Number(cnt[0].cnt)).toBe(2);

      // tempdb.sys.columns + OBJECT_ID('tempdb..##a') 內省欄位順序正確（I-MSSQL-TEMP-METADATA-01，對 ## 適用）。
      const cols = await qr!.query(
        `SELECT c.name AS column_name, c.column_id
           FROM tempdb.sys.columns c
          WHERE c.object_id = OBJECT_ID('tempdb..' + @0)
          ORDER BY c.column_id`,
        [a],
      );
      expect(cols.map((r: { column_name: string }) => r.column_name)).toEqual(['id', 'memo']);

      // 中文 round-trip 於 ## 正確（呼應 BIG5/BIN）。
      const data = await qr!.query(`SELECT id, memo FROM ${b} ORDER BY id`);
      expect(data.map((r: { memo: string }) => r.memo)).toEqual(['中古車商', '其他']);
    } finally {
      await dropMssqlTempTableIfExists(qr!, b);
      await dropMssqlTempTableIfExists(qr!, a);
    }
  });
});

// ===========================================================================
// POINT2 — 🔴 併發不撞名/不互汙（封鎖級閘）
// ===========================================================================
describe('AD-E07-41 P4-spike-2 POINT2（🔴 併發 isolation — 全域命名空間關鍵風險點）', () => {
  /** 一條迷你 pipeline：extract → filtered(SELECT INTO) → 讀回；回傳表名與讀回列，供外層斷言 isolation。 */
  async function runMiniPipeline(
    runner: QueryRunner,
    logId: string,
    label: string,
  ): Promise<{ extractName: string; filteredName: string; rows: Array<{ id: number; memo: string }> }> {
    const extractName = tempName('extract', logId);
    const filteredName = tempName('filtered', logId);
    // label 為測試控制之 'A'/'B'（非外來輸入），可安全內插入 N'...'。
    await runner.query(
      `SELECT * INTO ${extractName} FROM (VALUES
         (1,N'${label}-1'),(2,N'${label}-2'),(3,N'${label}-3')) AS v(id, memo)`,
    );
    await runner.query(`SELECT * INTO ${filteredName} FROM ${extractName} WHERE id >= 2`);
    const rows = await runner.query(`SELECT id, memo FROM ${filteredName} ORDER BY id`);
    return { extractName, filteredName, rows };
  }

  it('P2-01：🔴 兩個不同 logId 的 pipeline 真正並發（獨立連線池）→ 各自讀到自己的資料、互不污染', async (ctx) => {
    ensureMssql(ctx);
    const dsA = new DataSource(baseOptions());
    const dsB = new DataSource(baseOptions());
    await dsA.initialize();
    await dsB.initialize();
    const qrA = dsA.createQueryRunner();
    const qrB = dsB.createQueryRunner();
    await qrA.connect();
    await qrB.connect();

    const logIdA = uniqueLogId();
    const logIdB = uniqueLogId();
    let resA: Awaited<ReturnType<typeof runMiniPipeline>> | null = null;
    let resB: Awaited<ReturnType<typeof runMiniPipeline>> | null = null;
    try {
      // 真正並發：兩條 pipeline 同時執行（各自獨立池，不被排隊序列化）。
      [resA, resB] = await Promise.all([
        runMiniPipeline(qrA, logIdA, 'A'),
        runMiniPipeline(qrB, logIdB, 'B'),
      ]);

      // 命名不撞：同語意（nodeId='extract'/'filtered'）但因 logId 不同 → `##` 名互異。
      expect(resA.extractName).not.toBe(resB.extractName);
      expect(resA.filteredName).not.toBe(resB.filteredName);

      // 互不污染：A 只讀到 A 的資料、B 只讀到 B 的資料（各 2 列：id 2,3）。
      expect(resA.rows.map((r) => r.memo)).toEqual(['A-2', 'A-3']);
      expect(resB.rows.map((r) => r.memo)).toEqual(['B-2', 'B-3']);
      expect(resA.rows.every((r) => r.memo.startsWith('A-'))).toBe(true);
      expect(resB.rows.every((r) => r.memo.startsWith('B-'))).toBe(true);

      // instance-wide 可見性「是真的」：此刻兩組 ## 表同時存在於共享 tempdb —
      //   qrA 反向讀 B 的表得 B 的資料、qrB 反向讀 A 的表得 A 的資料
      //   ⇒ 證明「並發真的重疊發生」（非先後序列化後前者已消失）；isolation 純靠命名不同而非時間錯開。
      const aSeesB = await qrA.query(`SELECT memo FROM ${resB.filteredName} ORDER BY id`);
      const bSeesA = await qrB.query(`SELECT memo FROM ${resA.filteredName} ORDER BY id`);
      expect(aSeesB.map((r: { memo: string }) => r.memo)).toEqual(['B-2', 'B-3']);
      expect(bSeesA.map((r: { memo: string }) => r.memo)).toEqual(['A-2', 'A-3']);
    } finally {
      // 顯式清理（CLEANUP-01 樣態）：各自於自己的 runner drop 自己的兩張表。
      if (resA) {
        await dropMssqlTempTableIfExists(qrA, resA.filteredName);
        await dropMssqlTempTableIfExists(qrA, resA.extractName);
      }
      if (resB) {
        await dropMssqlTempTableIfExists(qrB, resB.filteredName);
        await dropMssqlTempTableIfExists(qrB, resB.extractName);
      }
      await qrA.release();
      await qrB.release();
      await dsA.destroy();
      await dsB.destroy();
    }
  });

  it('P2-02：負向對照 — 兩連線用「相同 ## 名」會撞表（⇒ makeTempTableName 之 logId 唯一性為 isolation 唯一依據）', async (ctx) => {
    ensureMssql(ctx);
    const dsA = new DataSource(baseOptions());
    const dsB = new DataSource(baseOptions());
    await dsA.initialize();
    await dsB.initialize();
    const qrA = dsA.createQueryRunner();
    const qrB = dsB.createQueryRunner();
    await qrA.connect();
    await qrB.connect();

    // 蓄意讓兩者共用「同一 logId」→ 同一 `##` 名（模擬「若命名未含唯一 logId」的假想情境）。
    const sharedLogId = uniqueLogId();
    const clash = tempName('extract', sharedLogId);
    try {
      await qrA.query(`SELECT * INTO ${clash} FROM (VALUES (1,N'A')) AS v(id, memo)`);
      // qrB 用相同名建表 → SQL Server 拋「已存在同名物件」（全域命名空間下確會撞）。
      await expect(
        qrB.query(`SELECT * INTO ${clash} FROM (VALUES (2,N'B')) AS v(id, memo)`),
      ).rejects.toThrow(/there is already an object named|already an object/i);
    } finally {
      await dropMssqlTempTableIfExists(qrA, clash);
      await qrA.release();
      await qrB.release();
      await dsA.destroy();
      await dsB.destroy();
    }
  });
});

// ===========================================================================
// POINT3 — 🔴 崩潰清理（封鎖級閘）：呼叫真實 production helper
// ===========================================================================
describe('AD-E07-41 P4-spike-2 POINT3（🔴 崩潰清理 + 冪等 — 真實 dropMssqlTempTableIfExists）', () => {
  it('P3-01：pipeline 中途拋錯 → finally 呼叫 dropMssqlTempTableIfExists 後 OBJECT_ID 為 NULL', async (ctx) => {
    ensureMssql(ctx);
    const name = tempName('crash', uniqueLogId());
    let caught: Error | null = null;
    try {
      await qr!.query(`SELECT * INTO ${name} FROM (VALUES (1,N'x'),(2,N'y')) AS v(id, memo)`);
      // 崩潰前確實已建表（存在）。
      expect(await objectExists(qr!, name)).toBe(true);
      throw new Error('simulated mid-pipeline failure');
    } catch (e) {
      caught = e as Error;
    } finally {
      // 失敗路徑顯式清理（I-MSSQL-TEMPTABLE-CLEANUP-01）。
      await dropMssqlTempTableIfExists(qr!, name);
    }
    expect(caught?.message).toMatch(/simulated mid-pipeline failure/);
    // 崩潰後 ## 已被顯式清理。
    expect(await objectExists(qr!, name)).toBe(false);
  });

  it('P3-02：冪等 — 對「不存在的 ##」再 drop 不報錯（含對已 drop 者重複呼叫）', async (ctx) => {
    ensureMssql(ctx);
    const never = tempName('never_created', uniqueLogId());
    // 從未建立 → drop 應 resolve、不 throw。
    await expect(dropMssqlTempTableIfExists(qr!, never)).resolves.toBeUndefined();

    // 建立後 drop 兩次：第一次真的 drop、第二次對已不存在者仍不報錯。
    const name = tempName('twice', uniqueLogId());
    await qr!.query(`SELECT * INTO ${name} FROM (VALUES (1)) AS v(id)`);
    await dropMssqlTempTableIfExists(qr!, name);
    expect(await objectExists(qr!, name)).toBe(false);
    await expect(dropMssqlTempTableIfExists(qr!, name)).resolves.toBeUndefined();
  });
});

// ===========================================================================
// POINT4 — ## 生命週期釐清（characterization；佐證 CLEANUP-01 必要性）
// ===========================================================================
describe('AD-E07-41 P4-spike-2 POINT4（## 生命週期 — release 殘留 vs destroy 回收）', () => {
  it('P4-01：QueryRunner.release()（連線歸還池、session 續存）後 `##` 仍殘留 → 顯式清理有其必要', async (ctx) => {
    ensureMssql(ctx);
    const lifeDs = new DataSource(baseOptions());
    await lifeDs.initialize();
    const lifeQr = lifeDs.createQueryRunner();
    await lifeQr.connect();
    const name = tempName('life_release', uniqueLogId());
    try {
      await lifeQr.query(`SELECT * INTO ${name} FROM (VALUES (1,N'a')) AS v(id, memo)`);
      // 建立後於「另一條連線」（主 qr）即可見 → 全域可見性成立。
      expect(await objectExists(qr!, name)).toBe(true);

      // 歸還連線至池（release ≠ 結束 session；池保留實體連線）。
      await lifeQr.release();

      // 📌 實測記錄：release 後 `##` 是否仍在？（CLEANUP-01 之核心佐證）
      const persistsAfterRelease = await objectExists(qr!, name);
      // eslint-disable-next-line no-console
      console.log(`[P4-01] ## 於 QueryRunner.release() 後是否殘留 = ${persistsAfterRelease}`);
      // 池化 release 不結束建立 session → `##` 殘留 ⇒ 不能只靠隱性回收，必須顯式清理。
      expect(persistsAfterRelease).toBe(true);

      // 顯式清理可跨連線生效（由主 qr drop 掉另一 session 建的 ##）。
      await dropMssqlTempTableIfExists(qr!, name);
      expect(await objectExists(qr!, name)).toBe(false);
    } finally {
      // 保險：若上面提前失敗，仍嘗試由主 qr 清掉。
      await dropMssqlTempTableIfExists(qr!, name);
      await lifeDs.destroy();
    }
  });

  it('P4-02：DataSource.destroy()（建立 session 真正結束）後 SQL Server 自動回收 `##` → 隱性回收僅於 session 結束', async (ctx) => {
    ensureMssql(ctx);
    const life2Ds = new DataSource(baseOptions());
    await life2Ds.initialize();
    const life2Qr = life2Ds.createQueryRunner();
    await life2Qr.connect();
    const name = tempName('life_destroy', uniqueLogId());
    try {
      await life2Qr.query(`SELECT * INTO ${name} FROM (VALUES (1,N'a')) AS v(id, memo)`);
      expect(await objectExists(qr!, name)).toBe(true);

      // 關閉整個 DataSource（池全數關閉 → 建立 session 真正結束）。
      await life2Ds.destroy();

      // session 結束且無其他引用 → SQL Server 自動 drop（可能有極短 async gap，故輪詢）。
      const gone = await waitObjectGone(qr!, name);
      // eslint-disable-next-line no-console
      console.log(`[P4-02] ## 於 DataSource.destroy() 後是否已自動回收 = ${gone}`);
      expect(gone).toBe(true);
    } finally {
      // 若（意外）尚未回收，由主 qr 補清；已回收則冪等不報錯。
      await dropMssqlTempTableIfExists(qr!, name);
    }
  });
});
