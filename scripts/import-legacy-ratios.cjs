/**
 * import-legacy-ratios.cjs — 匯入 legacy 部門/個別分配比例至 CDMP
 *
 * 用途：把 legacy OB 系統的 OBMDEPTPCT（部門比例）/ OBEMPLSETMF（個別比例）
 *       匯入 CDMP 的 ob_dept_pct / ob_empl_set，使月跑分派分佈可與 legacy 對齊驗證。
 *
 * ⚠️ 這是「驗證用一次性 dev 資料載入」。CDMP 的 prod 設計是業務於 app 內
 *    （F079 設部門比例 / F082 設個別比例）自行設定，不是長期 ETL legacy。
 *    （目前 CDMP 無 OBMDEPTPCT/OBEMPLSETMF 的 ETL pipeline — 見 prod gap 記錄。）
 *
 * Legacy fallback 規則（依 SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept + 業務確認）：
 *   per-list 優先；某名單未設比例時，fallback 至「同月份(LEFT(LIST_NO,8)) + 同產品(PROD_KIND)」
 *   群組中 MIN(LIST_NO)（有設比例者）的比例。本腳本對每張目標名單套此規則攤平寫入
 *   per-list 儲存（對齊 F101 既定的 per-list 模型）。
 *
 * 用法：
 *   node scripts/import-legacy-ratios.cjs <workym> <csvDate> [plan|apply]
 *   例：node scripts/import-legacy-ratios.cjs 202606 20260618 plan
 *
 * CSV 來源：reference/DumpData/OBMDEPTPCT_<csvDate>.csv、OBEMPLSETMF_<csvDate>.csv（UTF-8 BOM）
 * DB 連線：env DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME（預設 localhost:5432 cdmp/cdmp_secret/cdmp_dev）
 */
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'node_modules', 'pg'));

const WORKYM = process.argv[2] || '202606';
const CSV_DATE = process.argv[3] || '20260618';
const MODE = process.argv[4] || 'plan';
const DIR = path.join(__dirname, '..', 'reference', 'DumpData');
// created_by/updated_by 必須為「有效 user UUID」——F079 部門比例 GET（DeptRatioService.getDeptRatios，
//   F088 BR-11 設定者解析）會把 created_by 當 users.id(UUID) 做 In() 查找；非 UUID（如舊版 'legacy-import'）
//   → PG `invalid input syntax for type uuid` → 500。預設用 dev seed admin（系統管理員）。
const IMPORT_USER_ID =
  process.env.IMPORT_USER_ID || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function parseCsv(file) {
  const txt = fs.readFileSync(path.join(DIR, file)).toString('utf8').replace(/^﻿/, '');
  const lines = txt.split(/\r?\n/).filter((l) => l.trim().length);
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cols = l.split(',');
    const o = {};
    header.forEach((h, i) => (o[h] = (cols[i] || '').trim()));
    return o;
  });
}
function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r[key])) m.set(r[key], []);
    m.get(r[key]).push(r);
  }
  return m;
}

const dept = parseCsv(`OBMDEPTPCT_${CSV_DATE}.csv`);
const empl = parseCsv(`OBEMPLSETMF_${CSV_DATE}.csv`);
const deptByList = groupBy(dept, 'LIST_NO');
const emplByList = groupBy(empl, 'LIST_NO');
// fallback base = 同群組中 MIN(LIST_NO) 有比例者（CSV 已限定同月；如需嚴格同 PROD_KIND 可再過濾）
const deptFallback = [...deptByList.keys()].filter((k) => k.startsWith('OB' + WORKYM)).sort()[0];
const emplFallback = [...emplByList.keys()].filter((k) => k.startsWith('OB' + WORKYM)).sort()[0];

async function getTargetLists() {
  const c = new Client(conn());
  await c.connect();
  const r = await c.query(
    "SELECT list_no FROM ob_list_definition WHERE list_no LIKE $1 ORDER BY list_no",
    [`OB${WORKYM}%`],
  );
  await c.end();
  return r.rows.map((x) => x.list_no);
}
function conn() {
  return {
    host: process.env.DB_HOST_LOCAL || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'cdmp',
    password: process.env.DB_PASSWORD || 'cdmp_secret',
    database: process.env.DB_NAME || 'cdmp_dev',
  };
}

(async () => {
  const targets = await getTargetLists();
  console.log(`workym=${WORKYM} csvDate=${CSV_DATE} mode=${MODE}`);
  console.log('legacy dept lists:', [...deptByList.keys()].sort().join(','), '| fallback=', deptFallback);
  console.log('legacy empl lists:', [...emplByList.keys()].sort().join(','), '| fallback=', emplFallback);
  const plan = targets.map((L) => {
    const dSrc = deptByList.has(L) ? L : deptFallback;
    const eSrc = emplByList.has(L) ? L : emplFallback;
    const dRows = deptByList.get(dSrc) || [];
    const eRows = emplByList.get(eSrc) || [];
    console.log(`${L}: dept←${dSrc}(${dRows.length}) empl←${eSrc}(${eRows.length})`);
    return { L, dRows, eRows };
  });

  if (MODE !== 'apply') {
    console.log('[PLAN ONLY] 未寫 DB。');
    return;
  }

  const c = new Client(conn());
  await c.connect();
  const now = new Date().toISOString();
  try {
    await c.query('BEGIN');
    for (const { L, dRows } of plan) {
      await c.query('DELETE FROM ob_dept_pct WHERE project_workym=$1 AND list_no=$2', [WORKYM, L]);
      for (const r of dRows) {
        await c.query(
          'INSERT INTO ob_dept_pct (created_by_prog,created_by,created_at,updated_by_prog,updated_by,updated_at,project_workym,list_no,obdeptid,obdeptnm,ration) VALUES ($1,$2,$3,$1,$2,$3,$4,$5,$6,$7,$8)',
          ['IMPORT', IMPORT_USER_ID, now, WORKYM, L, r.OBDEPTID, r.OBDEPTNM, r.RATION],
        );
      }
    }
    for (const { L, eRows } of plan) {
      await c.query('DELETE FROM ob_empl_set WHERE list_no=$1', [L]);
      for (const r of eRows) {
        await c.query(
          'INSERT INTO ob_empl_set (created_by_prog,created_by,created_at,updated_by_prog,updated_by,updated_at,list_no,deptid_m,emplid,ration,prod_type) VALUES ($1,$2,$3,$1,$2,$3,$4,$5,$6,$7,$8)',
          ['IMPORT', IMPORT_USER_ID, now, L, r.DEPTID_M, r.EMPLID, r.RATION, r.PROD_TYPE || null],
        );
      }
    }
    await c.query('COMMIT');
    console.log('[APPLIED] COMMIT。');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
