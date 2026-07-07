/**
 * MSSQL 連線 Smoke Test（P0 / throwaway spike）
 *
 * 目的：拿到 MSSQL 連線字串後，最低風險驗證「連得上 + 拿到關鍵事實」：
 *   1. 連線握手成功（驗證連線字串 / 帳密 / TLS 設定）
 *   2. @@VERSION / 產品版本 / Edition（確認 2019 vs 2022 → 決定 OPENJSON/STRING_AGG 等特性）
 *   3. 伺服器 / 資料庫 Collation（決定字串比較/大小寫敏感度，影響 raw SQL 引擎的值比對）
 *   4. 自建佇列核心語法煙霧測試：UPDLOCK + READPAST + ROWLOCK + OUTPUT（Phase 2 最高風險項）
 *
 * 診斷：若目標 DB 登入失敗，會自動改連 master 以分辨
 *   (a) 帳密錯 / SQL 驗證未啟用   vs   (b) 帳密對但目標 DB 不存在/無權限。
 *
 * 用法（不進 git；密碼只留本機 .env）：
 *   cd apps/api
 *   # 在 apps/api/.env 填：DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME
 *   #   (+ DB_ENCRYPT=true / DB_TRUST_SERVER_CERT=true)；或單一 DB_CONNECTION_STRING
 *   node scripts/mssql-smoke.mjs
 */
import mssql from 'mssql';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1); // 注意：不 trim 值，避免砍掉密碼中的有意義空白
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv(path.resolve(__dirname, '../.env.cli'));
loadDotEnv(path.resolve(__dirname, '../.env'));

const USING_CONN_STR = !!(process.env.DB_CONNECTION_STRING || process.env.MSSQL_CONNECTION_STRING);
const bool = (v, dflt) => (v == null ? dflt : /^(1|true|yes)$/i.test(String(v)));

function buildConfig(databaseOverride) {
  if (USING_CONN_STR) return process.env.DB_CONNECTION_STRING || process.env.MSSQL_CONNECTION_STRING;
  return {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: databaseOverride || process.env.DB_NAME,
    options: {
      encrypt: bool(process.env.DB_ENCRYPT, true),
      trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERT, true),
      ...(process.env.DB_INSTANCE ? { instanceName: process.env.DB_INSTANCE } : {}),
    },
    connectionTimeout: 15000,
    requestTimeout: 15000,
  };
}

function redact(cfg) {
  if (typeof cfg === 'string') return cfg.replace(/(Password|Pwd)\s*=\s*[^;]*/gi, '$1=***');
  return { ...cfg, password: cfg.password ? `*** (len=${cfg.password.length})` : '(unset)' };
}

async function connect(cfg) {
  const pool = new mssql.ConnectionPool(cfg);
  await pool.connect();
  return pool;
}

async function runDiagnostics(pool) {
  const info = await pool.request().query(`
    SELECT
      @@VERSION                                   AS version_full,
      SERVERPROPERTY('ProductVersion')            AS product_version,
      SERVERPROPERTY('ProductLevel')              AS product_level,
      SERVERPROPERTY('Edition')                   AS edition,
      SERVERPROPERTY('Collation')                 AS server_collation,
      DB_NAME()                                   AS current_db,
      DATABASEPROPERTYEX(DB_NAME(),'Collation')   AS db_collation
  `);
  const r = info.recordset[0];
  console.log('版本(@@VERSION)   :', String(r.version_full).split('\n')[0].trim());
  console.log('ProductVersion    :', r.product_version, '  Level:', r.product_level);
  console.log('Edition           :', r.edition);
  console.log('目前資料庫        :', r.current_db);
  console.log('伺服器 Collation  :', r.server_collation);
  console.log('資料庫 Collation  :', r.db_collation);

  try {
    const j = await pool.request().query(`SELECT COUNT(*) AS c FROM OPENJSON('[1,2,3]')`);
    console.log('OPENJSON 可用     : 是 (回傳', j.recordset[0].c, '列)');
  } catch (e) {
    console.log('OPENJSON 可用     : 否 —', e.message);
  }

  try {
    await pool.request().batch(`
      CREATE TABLE #q (id INT IDENTITY(1,1) PRIMARY KEY, state VARCHAR(20), created_at DATETIME2(3) DEFAULT SYSUTCDATETIME());
      INSERT INTO #q(state) VALUES ('created'),('created');
      ;WITH candidate AS (
        SELECT TOP (1) id, state FROM #q WITH (READPAST, ROWLOCK, UPDLOCK)
        WHERE state = 'created' ORDER BY created_at ASC
      )
      UPDATE candidate SET state = 'active'
      OUTPUT inserted.id, inserted.state;
      DROP TABLE #q;
    `);
    console.log('佇列 hint 語法    : ✅ UPDLOCK/READPAST/ROWLOCK/OUTPUT 全部被接受（自建佇列方案可行）');
  } catch (e) {
    console.log('佇列 hint 語法    : ⚠️ 失敗 —', e.message);
  }
}

function isLoginError(msg) {
  return /login failed|登入失敗|18456/i.test(msg || '');
}

async function main() {
  console.log('=== MSSQL Smoke Test ===');
  console.log('連線設定：', JSON.stringify(redact(buildConfig())));

  // 第一次：連目標 DB
  let pool;
  try {
    pool = await connect(buildConfig());
  } catch (e) {
    console.error('\n❌ 連目標資料庫失敗：', e.message);

    if (isLoginError(e.message) && !USING_CONN_STR && (process.env.DB_NAME || '').toLowerCase() !== 'master') {
      console.log('\n🔎 自動改連 master 以隔離「帳密錯」vs「目標 DB 不存在/無權限」…');
      try {
        const mpool = await connect(buildConfig('master'));
        console.log('\n✅ 連 master 成功 → 帳密正確！問題是登入帳號無法開啟目標資料庫。');
        console.log('   → 目標 DB「' + (process.env.DB_NAME || '') + '」可能尚未建立，或此 login 無存取權/非其預設 DB。');
        console.log('   → 需 IT/DBA：建立該資料庫或授權（GRANT CONNECT / 加 db_owner 等）。以下為 master 上的伺服器資訊：\n');
        await runDiagnostics(mpool);
        await mpool.close();
        console.log('\n=== Smoke 完成（帳密 OK，待授權/建 DB）===');
        return;
      } catch (e2) {
        console.error('\n❌ 連 master 也失敗：', e2.message);
        console.error('   → 判定：帳密本身被拒（密碼錯 / SQL 驗證未啟用 / login 不存在 / 帳號被鎖）。');
        console.error('   → 檢查：1) 密碼是否正確且無特殊字元被 .env 誤解');
        console.error('           2) 伺服器是否為 Mixed Mode（允許 SQL 驗證，非僅 Windows 驗證）');
        console.error("           3) 'CDMP' 是 SQL login 還是 Windows 網域帳號（後者 tedious 需改 NTLM 驗證）");
        process.exitCode = 1;
        return;
      }
    }

    console.error('   常見原因：TLS(encrypt/trustServerCertificate)、帳密、防火牆/port、named instance 未設 DB_INSTANCE。');
    process.exitCode = 1;
    return;
  }

  try {
    console.log('\n✅ 連目標資料庫握手成功\n');
    await runDiagnostics(pool);
    console.log('\n=== Smoke Test 完成 ===');
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error('未預期錯誤：', e);
  process.exitCode = 1;
});
