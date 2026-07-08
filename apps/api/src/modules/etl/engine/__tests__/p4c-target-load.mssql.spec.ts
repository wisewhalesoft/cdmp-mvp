/**
 * AD-E07-41 P4c — TargetLoadHandlerMssql 真實 MSSQL 整合測試（dbo target 表）。
 *
 * 覆蓋：
 *   UPSERT-TRAP-001 / UPSERT-EQ-001..007；
 *   TLDEDUP-MSSQL-001..003 / TLDEDUP-EQ-001..003 / TLDEDUP-TRAP-001；
 *   FULLMODE-MSSQL-001..002 / FULLMODE-EQ-001..004 / FULLMODE-REG-001；
 *   PARTITION-MSSQL-001 / PARTITION-EQ-001..002；
 *   CLEANUP-MSSQL-001..002 / CATALOG-MSSQL-001。
 *
 * ⚠️ 偏差 DEV-P4C-TABLES：baseline target 表不存在於 CDMP_TEST → 於 beforeAll 自建（見 _p4c-target-tables）。
 *    customer_core 列以唯一 source_customer_no 前綴隔離 + afterEach 精準刪除；fullMode 表 TRUNCATE 語意天然獨立。
 *    本檔為唯一觸及 customer_core/ob_calendar/ob_arreturndf_min_cap 之 P4c spec（避免跨檔競態）。
 * ⚠️ MSSQL 不可達 → 全檔 skip（不造假）。
 */
import '@/database/__tests__/mssql-env-preload';
import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import { vi } from 'vitest';
import { restoreDbType } from '@/database/__tests__/mssql-env-preload';
import { connectMssql, teardownMssql, uniqueLogId, objectExists, MssqlHarness } from './_p4a-mssql-harness';
import { ensureTargetTable } from './_p4c-target-tables';
import { TargetLoadHandlerMssql } from '../handlers/target-load-handler-mssql';
import { makeTempTableName, NodeExecutionContext, DataSet } from '../types';

vi.setConfig({ testTimeout: 60000 });

const GUID = '11111111-2222-3333-4444-555555555555';
let h: MssqlHarness;
const cleanupPrefixes: string[] = [];
const dropTables: string[] = [];

beforeAll(async () => {
  h = await connectMssql();
  if (h.reachable && h.qr) {
    await ensureTargetTable(h.qr, 'customer_core');
    await ensureTargetTable(h.qr, 'ob_calendar');
    await ensureTargetTable(h.qr, 'ob_arreturndf_min_cap');
  }
});
afterEach(async () => {
  if (!h?.qr) return;
  for (const pfx of cleanupPrefixes.splice(0)) {
    await h.qr.query(`DELETE FROM customer_core WHERE source_customer_no LIKE '${pfx}%'`);
  }
  for (const t of dropTables.splice(0)) {
    try {
      await h.qr.query(`DROP TABLE dbo.${t}`);
    } catch {
      /* ignore */
    }
  }
});
afterAll(async () => {
  await teardownMssql(h);
  restoreDbType();
});
const gate = () => !h?.reachable || !h?.qr;

function newPfx(): string {
  const p = '_P' + uniqueLogId().slice(0, 6);
  cleanupPrefixes.push(p);
  return p;
}
async function fixture(valuesSql: string, cols: string): Promise<string> {
  const name = '##fx_' + uniqueLogId().slice(0, 10);
  await h.qr!.query(`SELECT * INTO ${name} FROM (VALUES ${valuesSql}) AS v(${cols})`);
  return name;
}
function tlCtx(
  data: Record<string, unknown>,
  inputTable: string,
  rowCount: number,
  opts: { nodeId?: string; logId?: string; pipelineId?: string; queryRunner?: any } = {},
): NodeExecutionContext {
  return {
    node: { id: opts.nodeId ?? 'tl1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'target_load', label: 'T', ...data } },
    inputs: { default: { tempTable: inputTable, rowCount } as DataSet },
    pipelineId: opts.pipelineId ?? GUID,
    logId: opts.logId ?? uniqueLogId(),
    isTestRun: false,
    queryRunner: opts.queryRunner ?? h.qr!,
  };
}
async function syntheticTable(ddlCols: string): Promise<string> {
  const name = `tl_p4c_${uniqueLogId().replace(/-/g, '').slice(0, 10)}`;
  await h.qr!.query(`CREATE TABLE dbo.${name} (${ddlCols})`);
  dropTables.push(name);
  return name;
}

// =====================================================================
// UPSERT
// =====================================================================
describe('P4c UPSERT (customer_core 兩段式)', () => {
  it('TRAP-001：naive ON CONFLICT DO UPDATE 對真實 MSSQL 拋語法錯誤', async (ctx) => {
    if (gate()) return ctx.skip();
    await expect(
      h.qr!.query(`INSERT INTO customer_core (source_customer_no) SELECT 'X' ON CONFLICT ("source_customer_no") DO UPDATE SET name='y'`),
    ).rejects.toThrow(/Incorrect syntax near the keyword 'ON'/);
  });

  it('EQ-001（DoD）：新列 INSERT 成功，欄位值正確', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const fx = await fixture(`(N'${p}001',N'01',N'Alice',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 1));
    expect(res.rowCount).toBe(1);
    const rows = await h.qr!.query(`SELECT source_customer_no, customer_type_code, name FROM customer_core WHERE source_customer_no=N'${p}001'`);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].customer_type_code).toBe('01');
  });

  it('EQ-002（DoD）：既有列 UPDATE，customer_id(PK) 與 source_customer_no 不被覆寫', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const fx1 = await fixture(`(N'${p}001',N'01',N'Before',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx1, 1, { nodeId: 'a' }));
    const before = await h.qr!.query(`SELECT customer_id FROM customer_core WHERE source_customer_no=N'${p}001'`);
    const cid = before[0].customer_id;
    const fx2 = await fixture(`(N'${p}001',N'02',N'After',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx2, 1, { nodeId: 'b' }));
    const after = await h.qr!.query(`SELECT customer_id, source_customer_no, name, customer_type_code FROM customer_core WHERE source_customer_no=N'${p}001'`);
    expect(after.length).toBe(1);
    expect(after[0].customer_id).toBe(cid); // PK 不變
    expect(after[0].source_customer_no).toBe(`${p}001`);
    expect(after[0].name).toBe('After'); // 已更新
    expect(after[0].customer_type_code).toBe('02');
  });

  it('EQ-003（DoD）：ghost gate 排除過短 source_customer_no（LEN(TRIM)<5）', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const fx = await fixture(
      `(N'${p}001',N'01',N'Valid',N'etl_load'),(N'AB',N'01',N'TooShort',N'etl_load')`,
      'source_customer_no,customer_type_code,name,data_source',
    );
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 2));
    expect(res.rowCount).toBe(1); // 僅 valid 列
    const shortRow = await h.qr!.query(`SELECT * FROM customer_core WHERE source_customer_no=N'AB'`);
    expect(shortRow.length).toBe(0); // 過短列未落地
  });

  it('EQ-004：NOT NULL 業務欄（name）為 null → 整列排除，不影響其餘合法列', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const fx = await fixture(
      `(N'${p}001',N'01',N'Good',N'etl_load'),(N'${p}002',N'01',CAST(NULL AS nvarchar(100)),N'etl_load')`,
      'source_customer_no,customer_type_code,name,data_source',
    );
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 2));
    expect(res.rowCount).toBe(1);
    const rows = await h.qr!.query(`SELECT source_customer_no FROM customer_core WHERE source_customer_no LIKE N'${p}%'`);
    expect(rows.map((r: any) => r.source_customer_no)).toEqual([`${p}001`]);
  });

  it('EQ-005（DoD 冪等）：同輸入跑兩次 → 不新增列、純覆寫', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const mk = () => fixture(`(N'${p}001',N'01',N'X',N'etl_load'),(N'${p}002',N'01',N'Y',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, await mk(), 2, { nodeId: 'a' }));
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, await mk(), 2, { nodeId: 'b' }));
    const cnt = await h.qr!.query(`SELECT COUNT(*) c FROM customer_core WHERE source_customer_no LIKE N'${p}%'`);
    expect(cnt[0].c).toBe(2); // 無重複疊加
  });

  it('EQ-006：_etl_loaded_at / _etl_pipeline_id 系統字面值 cast 正確寫入', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const fx = await fixture(`(N'${p}001',N'01',N'Z',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 1));
    const rows = await h.qr!.query(`SELECT _etl_pipeline_id, _etl_loaded_at FROM customer_core WHERE source_customer_no=N'${p}001'`);
    expect(String(rows[0]._etl_pipeline_id).toLowerCase()).toBe(GUID);
    expect(rows[0]._etl_loaded_at).toBeTruthy();
  });

  it('EQ-007：中文欄位值 UPSERT 後正確 round-trip', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const fx = await fixture(`(N'${p}001',N'01',N'王小明',N'etl_load',N'台積電股份有限公司')`, 'source_customer_no,customer_type_code,name,data_source,company_name');
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 1));
    const rows = await h.qr!.query(`SELECT name, company_name FROM customer_core WHERE source_customer_no=N'${p}001'`);
    expect(rows[0].name).toBe('王小明');
    expect(rows[0].company_name).toBe('台積電股份有限公司');
  });
});

// =====================================================================
// TLDEDUP（內部 DISTINCT ON tie-breaker）
// =====================================================================
describe('P4c TLDEDUP (內部去重決定性)', () => {
  it('MSSQL-001（DoD）：fullMode composite PK dedup 決定性、多跑一致', async (ctx) => {
    if (gate()) return ctx.skip();
    const winners = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const t = await syntheticTable('col_a varchar(10) NOT NULL, col_b varchar(10) NOT NULL, payload varchar(20), CONSTRAINT PK_dd' + i + '_' + uniqueLogId().slice(0, 6) + ' PRIMARY KEY (col_a, col_b)');
      const fx = await fixture(`('01','X','first'),('01','X','second'),('02','Y','solo')`, 'col_a,col_b,payload');
      const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: t, fullMode: true }, fx, 3));
      expect(res.rowCount).toBe(2);
      const rows = await h.qr!.query(`SELECT col_a,col_b,payload FROM dbo.${t} WHERE col_a='01'`);
      winners.add(rows[0].payload);
    }
    expect(winners.size).toBe(1);
    expect([...winners][0]).toBe('first');
  });

  it('MSSQL-002（DoD）：customer_core source_customer_no dedup 決定性', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    // 同 source_customer_no 兩列（其餘欄不同）→ dedup 到一列
    const fx = await fixture(`(N'${p}001',N'01',N'First',N'etl_load'),(N'${p}001',N'02',N'Second',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 2));
    expect(res.rowCount).toBe(1);
    const rows = await h.qr!.query(`SELECT name FROM customer_core WHERE source_customer_no=N'${p}001'`);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('First'); // _seq 較小勝出
  });

  it('MSSQL-003：連續 3 次結果穩定一致（決定性回歸）', async (ctx) => {
    if (gate()) return ctx.skip();
    const names = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const p = newPfx();
      const fx = await fixture(`(N'${p}001',N'01',N'Alpha',N'etl_load'),(N'${p}001',N'02',N'Beta',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
      await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 2));
      const r = await h.qr!.query(`SELECT name FROM customer_core WHERE source_customer_no=N'${p}001'`);
      names.add(r[0].name);
    }
    expect(names.size).toBe(1);
    expect([...names][0]).toBe('Alpha');
  });

  it('EQ-001（旗艦，DoD）：TRIM 正規化碰撞 — "A12345 " 與 "A12345" 去重後僅一列', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx(); // p 長度 8 → p+'1' 長度 9 ≥5
    const k = `${p}1`;
    // 上游 d3 視原始字串不同放行兩列；target-load 內 TRIM 正規化後碰撞
    const fx = await fixture(`(N'${k} ',N'01',N'First',N'etl_load'),(N'${k}',N'02',N'Second',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 2));
    expect(res.rowCount).toBe(1);
    const rows = await h.qr!.query(`SELECT source_customer_no, name FROM customer_core WHERE source_customer_no=N'${k}'`);
    expect(rows.length).toBe(1);
    expect(rows[0].source_customer_no).toBe(k); // 已 TRIM
    expect(rows[0].name).toBe('First'); // 決定性（首列）
  });

  it('EQ-002：composite PK（col_a+col_b）dedup — PARTITION BY 涵蓋兩欄，appl_no 相同但 orgno 不同不誤併', async (ctx) => {
    if (gate()) return ctx.skip();
    const t = await syntheticTable('col_a varchar(10) NOT NULL, col_b varchar(10) NOT NULL, payload varchar(20), CONSTRAINT PK_c_' + uniqueLogId().slice(0, 8) + ' PRIMARY KEY (col_a, col_b)');
    const fx = await fixture(`('01','X','a'),('01','X','b'),('01','Y','c'),('02','X','d')`, 'col_a,col_b,payload');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: t, fullMode: true }, fx, 4));
    expect(res.rowCount).toBe(3); // 非 2：01/Y、02/X 不可誤併
  });

  it('EQ-003：全部 key 唯一 → 不誤刪任何列（防呆對照組）', async (ctx) => {
    if (gate()) return ctx.skip();
    const t = await syntheticTable('col_a varchar(10) NOT NULL, col_b varchar(10) NOT NULL, payload varchar(20), CONSTRAINT PK_u_' + uniqueLogId().slice(0, 8) + ' PRIMARY KEY (col_a, col_b)');
    const fx = await fixture(`('01','X','a'),('01','Y','b'),('02','X','c')`, 'col_a,col_b,payload');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: t, fullMode: true }, fx, 3));
    expect(res.rowCount).toBe(3);
  });

  it('TRAP-001（陷阱佐證，論證型）：naive ROW_NUMBER(PARTITION BY pk ORDER BY pk) 之勝出列（20 次實測記錄）', async (ctx) => {
    if (gate()) return ctx.skip();
    const fx = await fixture(`('01','X','w1'),('01','X','w2'),('01','X','w3')`, 'pk_a,pk_b,payload');
    const winners = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const w = await h.qr!.query(`SELECT payload FROM (SELECT payload, ROW_NUMBER() OVER (PARTITION BY pk_a, pk_b ORDER BY pk_a, pk_b) rn FROM ${fx}) x WHERE rn=1`);
      winners.add(w[0]?.payload);
    }
    // 論證型：記錄實測（本環境查詢計畫是否穩定），不反向斷言「安全」。SQL Server 官方文件：ORDER BY 排序鍵有
    // 相同值時排序未定義 → 顯式 _seq tie-breaker 仍為必要（TLDEDUP-UNIT-001/002 之正當性依據）。
    // eslint-disable-next-line no-console
    console.log('[P4c TLDEDUP-TRAP-001] naive ROW_NUMBER winners over 20 runs =>', [...winners].join('|'), '(size=' + winners.size + ')');
    expect(winners.size).toBeGreaterThanOrEqual(1);
  });
});

// =====================================================================
// FULLMODE
// =====================================================================
describe('P4c FULLMODE (TRUNCATE + INSERT)', () => {
  it('MSSQL-001（DoD，單一 PK ob_calendar）：無重複 TRUNCATE+INSERT 正確', async (ctx) => {
    if (gate()) return ctx.skip();
    await h.qr!.query(`DELETE FROM ob_calendar`);
    const fx = await fixture(`('2026-01-01','N'),('2026-01-02','Y')`, 'calendar_date,rest_flg');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'ob_calendar', fullMode: true }, fx, 2));
    expect(res.rowCount).toBe(2);
    const rows = await h.qr!.query(`SELECT rest_flg FROM ob_calendar WHERE calendar_date='2026-01-02'`);
    expect(rows[0].rest_flg).toBe('Y');
    await h.qr!.query(`DELETE FROM ob_calendar`);
  });

  it('MSSQL-002（旗艦，composite PK）：PK dedup + TRUNCATE + INSERT 正確處理 composite 重複列', async (ctx) => {
    if (gate()) return ctx.skip();
    const t = await syntheticTable('col_a varchar(10) NOT NULL, col_b varchar(10) NOT NULL, payload varchar(20), CONSTRAINT PK_fm_' + uniqueLogId().slice(0, 8) + ' PRIMARY KEY (col_a, col_b)');
    await h.qr!.query(`INSERT INTO dbo.${t} (col_a,col_b,payload) VALUES ('99','99','stale')`);
    const fx = await fixture(`('01','X','p1'),('01','X','p2'),('02','Y','p3')`, 'col_a,col_b,payload');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: t, fullMode: true }, fx, 3));
    expect(res.rowCount).toBe(2);
    const stale = await h.qr!.query(`SELECT * FROM dbo.${t} WHERE col_a='99'`);
    expect(stale.length).toBe(0); // TRUNCATE 全量替換
  });

  it('EQ-001：PK 無重複 → 全部列原樣寫入', async (ctx) => {
    if (gate()) return ctx.skip();
    await h.qr!.query(`DELETE FROM ob_calendar`);
    const fx = await fixture(`('2026-02-01','N'),('2026-02-02','Y'),('2026-02-03','N')`, 'calendar_date,rest_flg');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'ob_calendar', fullMode: true }, fx, 3));
    expect(res.rowCount).toBe(3);
    const c = await h.qr!.query(`SELECT COUNT(*) c FROM ob_calendar`);
    expect(c[0].c).toBe(3);
    await h.qr!.query(`DELETE FROM ob_calendar`);
  });

  it('EQ-002：PK 重複（來源髒資料）→ 去重後寫入，不因撞 PK 整批失敗', async (ctx) => {
    if (gate()) return ctx.skip();
    await h.qr!.query(`DELETE FROM ob_calendar`);
    const fx = await fixture(`('2026-03-01','N'),('2026-03-01','Y'),('2026-03-02','N')`, 'calendar_date,rest_flg');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'ob_calendar', fullMode: true }, fx, 3));
    expect(res.rowCount).toBe(2); // 2026-03-01 去重
    const c = await h.qr!.query(`SELECT COUNT(*) c FROM ob_calendar`);
    expect(c[0].c).toBe(2);
    await h.qr!.query(`DELETE FROM ob_calendar`);
  });

  it('EQ-003：ob_arreturndf_min_cap 之 _cdmp_extracted_at NOT NULL 自動補值（input 未帶）', async (ctx) => {
    if (gate()) return ctx.skip();
    await h.qr!.query(`DELETE FROM ob_arreturndf_min_cap`);
    const fx = await fixture(`('A001',100),('A002',200)`, 'appl_no,add_un_capital');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'ob_arreturndf_min_cap', fullMode: true }, fx, 2));
    expect(res.rowCount).toBe(2);
    const rows = await h.qr!.query(`SELECT appl_no, _cdmp_extracted_at FROM ob_arreturndf_min_cap ORDER BY appl_no`);
    expect(rows[0]._cdmp_extracted_at).toBeTruthy(); // NOT NULL 補值成功
    await h.qr!.query(`DELETE FROM ob_arreturndf_min_cap`);
  });

  it('EQ-004：重跑 → TRUNCATE 語意全量覆蓋（非疊加）', async (ctx) => {
    if (gate()) return ctx.skip();
    await h.qr!.query(`DELETE FROM ob_calendar`);
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'ob_calendar', fullMode: true }, await fixture(`('2026-04-01','N')`, 'calendar_date,rest_flg'), 1, { nodeId: 'a' }));
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'ob_calendar', fullMode: true }, await fixture(`('2026-05-01','Y'),('2026-05-02','N')`, 'calendar_date,rest_flg'), 2, { nodeId: 'b' }));
    const rows = await h.qr!.query(`SELECT calendar_date FROM ob_calendar ORDER BY calendar_date`);
    expect(rows.length).toBe(2); // 僅第二批
    const first = await h.qr!.query(`SELECT COUNT(*) c FROM ob_calendar WHERE calendar_date='2026-04-01'`);
    expect(first[0].c).toBe(0);
    await h.qr!.query(`DELETE FROM ob_calendar`);
  });

  it('REG-001（安全網）：rowCount===0 → emptyDataSet 短路，不 TRUNCATE 既有資料', async (ctx) => {
    if (gate()) return ctx.skip();
    await h.qr!.query(`DELETE FROM ob_calendar`);
    await h.qr!.query(`INSERT INTO ob_calendar (calendar_date, rest_flg) VALUES ('2026-06-01','N')`);
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'ob_calendar', fullMode: true }, '', 0));
    expect(res).toEqual({ tempTable: '', rowCount: 0 });
    const c = await h.qr!.query(`SELECT COUNT(*) c FROM ob_calendar`);
    expect(c[0].c).toBe(1); // 未被清空
    await h.qr!.query(`DELETE FROM ob_calendar`);
  });
});

// =====================================================================
// PARTITION
// =====================================================================
describe('P4c PARTITION (partition_replace)', () => {
  it('MSSQL-001（DoD）：僅覆寫指定分區，其餘分區不受影響', async (ctx) => {
    if (gate()) return ctx.skip();
    const t = await syntheticTable('id varchar(10) NOT NULL, data_source varchar(20) NOT NULL, val varchar(20)');
    await h.qr!.query(`INSERT INTO dbo.${t} (id,data_source,val) VALUES ('m1','monthly_run','keep'),('m2','monthly_run','keep2'),('e1','etl_load','old')`);
    const fx = await fixture(`('n1','new1'),('n2','new2')`, 'id,val');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: t, loadMode: 'partition_replace', partitionColumn: 'data_source', partitionValue: 'etl_load' }, fx, 2));
    expect(res.rowCount).toBe(2);
    const monthly = await h.qr!.query(`SELECT COUNT(*) c FROM dbo.${t} WHERE data_source='monthly_run'`);
    expect(monthly[0].c).toBe(2); // monthly_run 不變
    const etl = await h.qr!.query(`SELECT id FROM dbo.${t} WHERE data_source='etl_load' ORDER BY id`);
    expect(etl.map((r: any) => r.id)).toEqual(['n1', 'n2']); // etl_load 被取代
  });

  it('EQ-001：重跑同分區 → 該分區列數為新輸入列數（非疊加），其他分區不變', async (ctx) => {
    if (gate()) return ctx.skip();
    const t = await syntheticTable('id varchar(10) NOT NULL, data_source varchar(20) NOT NULL, val varchar(20)');
    await h.qr!.query(`INSERT INTO dbo.${t} (id,data_source,val) VALUES ('m1','monthly_run','keep')`);
    const run = async (n: number) => new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: t, loadMode: 'partition_replace', partitionColumn: 'data_source', partitionValue: 'etl_load' }, await fixture(`('r${n}','v${n}')`, 'id,val'), 1, { nodeId: 'r' + n }));
    await run(1);
    await run(2);
    const etl = await h.qr!.query(`SELECT COUNT(*) c FROM dbo.${t} WHERE data_source='etl_load'`);
    expect(etl[0].c).toBe(1); // 非疊加
    const monthly = await h.qr!.query(`SELECT COUNT(*) c FROM dbo.${t} WHERE data_source='monthly_run'`);
    expect(monthly[0].c).toBe(1);
  });

  it('EQ-002：partitionValue 含單引號 → 逸出正確（防注入回歸）', async (ctx) => {
    if (gate()) return ctx.skip();
    const t = await syntheticTable('id varchar(10) NOT NULL, data_source varchar(20) NOT NULL, val varchar(20)');
    await h.qr!.query(`INSERT INTO dbo.${t} (id,data_source,val) VALUES ('x',N'a''b','old')`);
    const fx = await fixture(`('n1','new')`, 'id,val');
    const res = await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: t, loadMode: 'partition_replace', partitionColumn: 'data_source', partitionValue: "a'b" }, fx, 1));
    expect(res.rowCount).toBe(1);
    const rows = await h.qr!.query(`SELECT id, val FROM dbo.${t} WHERE data_source=N'a''b'`);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('n1'); // 舊 'old' 被取代、無注入
  });
});

// =====================================================================
// CLEANUP / CATALOG（真實 MSSQL）
// =====================================================================
describe('P4c CLEANUP / CATALOG (真實 MSSQL)', () => {
  it('CLEANUP-MSSQL-001：UPSERT 成功後 enriched tempTable/dedupTable 皆不殘留', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const logId = uniqueLogId();
    const fx = await fixture(`(N'${p}001',N'01',N'X',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    await new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 1, { nodeId: 'clean1', logId }));
    const base = '##' + makeTempTableName('clean1', logId);
    expect(await objectExists(h.qr!, base)).toBe(false);
    expect(await objectExists(h.qr!, base + '_dq')).toBe(false);
    expect(await objectExists(h.qr!, base + '_dq_seq')).toBe(false);
  });

  it('CLEANUP-MSSQL-002：UPSERT 階段人為失敗 → enriched tempTable/dedupTable 仍被清理', async (ctx) => {
    if (gate()) return ctx.skip();
    const p = newPfx();
    const logId = uniqueLogId();
    const realQr = h.qr!;
    // 令 UPDATE/INSERT customer_core 階段拋錯，驗證 finally 清理仍執行
    const proxy: any = {
      query: (sql: string, params?: any[]) =>
        /INSERT INTO "customer_core"|UPDATE tgt SET/.test(sql) ? Promise.reject(new Error('forced upsert failure')) : realQr.query(sql, params),
      // P5g：交易 API 委派真實 QueryRunner（真實 rollback，確保失敗後 ## 清理仍成功）。
      startTransaction: () => realQr.startTransaction(),
      commitTransaction: () => realQr.commitTransaction(),
      rollbackTransaction: () => realQr.rollbackTransaction(),
      get isTransactionActive() { return realQr.isTransactionActive; },
    };
    const fx = await fixture(`(N'${p}001',N'01',N'X',N'etl_load')`, 'source_customer_no,customer_type_code,name,data_source');
    await expect(
      new TargetLoadHandlerMssql().execute(tlCtx({ targetTable: 'customer_core', fullMode: false }, fx, 1, { nodeId: 'clean2', logId, queryRunner: proxy })),
    ).rejects.toThrow(/UPSERT 失敗|forced upsert/);
    const base = '##' + makeTempTableName('clean2', logId);
    expect(await objectExists(realQr, base)).toBe(false);
    expect(await objectExists(realQr, base + '_dq')).toBe(false);
  });

  it('CATALOG-MSSQL-001：notNullTargetCols 之小寫 is_nullable 正確繫結 IS_NULLABLE（真庫個別確認）', async (ctx) => {
    if (gate()) return ctx.skip();
    const rows = await h.qr!.query(
      `SELECT column_name FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name=@0 AND is_nullable='NO' AND column_name NOT IN ('customer_id','_etl_loaded_at','_etl_pipeline_id','data_source')`,
      ['customer_core'],
    );
    const cols = rows.map((r: any) => r.column_name).sort();
    expect(cols).toEqual(['customer_type_code', 'name', 'source_customer_no']);
  });
});
