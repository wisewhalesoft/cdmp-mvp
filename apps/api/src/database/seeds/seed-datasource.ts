/**
 * Datasource seed（env 驅動，冪等）
 *
 * 建立 ETL 來源資料庫連線 `APYHFC16.OB`（名稱固定：extraction-tasks.json / etl-pipelines.json
 * 以此名查找，`prod-data-seed.ts::seedExtractionTasks` 找不到即 fail-fast）。
 * 密碼以 `CryptoUtil.encrypt`（AES-256-GCM）寫入 encrypted_password，須與 API 同一把
 * `AES_ENCRYPTION_KEY`，否則 UI「測試連線」會解密失敗。
 *
 * 連線來源（env）：
 *   OB_DS_HOST / OB_DS_PORT(預設 1433) / OB_DS_DATABASE / OB_DS_USERNAME / OB_DS_PASSWORD
 *   OB_DS_TYPE(預設 sqlserver)
 * 若 OB_DS_HOST 未設 → 建立 placeholder（host/database='CHANGE_ME'），bootstrap 仍完成、
 *   資料來源資源存在，部署者於 UI 補連線並「測試連線」即可（不阻擋一鍵部署）。
 *
 * created_by：ETL_SEED_USER_EMAIL → dev admin UUID → 任一 active admin（同 prod-data-seed 規則），
 *   故須在 seed.ts（users）之後執行。
 *
 * 用法：npm run seed-datasource（bootstrap 內串接）
 */
import { DataSource, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';
import { CryptoUtil } from '../../common/crypto/crypto.util';

// 名稱固定，對齊 seeds/data/extraction-tasks.json 與 etl-pipelines.json 的 datasourceName
const DATASOURCE_NAME = 'APYHFC16.OB';
const DEV_ADMIN_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function resolveCreatedBy(qr: QueryRunner): Promise<string> {
  const envEmail = process.env.ETL_SEED_USER_EMAIL?.trim();
  if (envEmail) {
    const r = await qr.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [envEmail]);
    if (r[0]?.id) return r[0].id;
    throw new Error(`seed-datasource 中止：ETL_SEED_USER_EMAIL='${envEmail}' 對應 user 不存在。`);
  }
  const devCheck = await qr.query(`SELECT id FROM users WHERE id = $1`, [DEV_ADMIN_UUID]);
  if (devCheck[0]?.id) return DEV_ADMIN_UUID;
  const fallback = await qr.query(
    `SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY created_at ASC LIMIT 1`,
  );
  if (fallback[0]?.id) return fallback[0].id;
  throw new Error(
    `seed-datasource 中止：找不到可用 admin user（請先跑 seed 建立帳號，或設 ETL_SEED_USER_EMAIL）。`,
  );
}

async function seedDatasource(qr: QueryRunner): Promise<void> {
  const host = process.env.OB_DS_HOST?.trim() || 'CHANGE_ME';
  const databaseName = process.env.OB_DS_DATABASE?.trim() || 'CHANGE_ME';
  const isPlaceholder = host === 'CHANGE_ME' || databaseName === 'CHANGE_ME';
  const type = process.env.OB_DS_TYPE?.trim() || 'sqlserver';
  const port = parseInt(process.env.OB_DS_PORT || '1433', 10);
  const username = process.env.OB_DS_USERNAME?.trim() || 'CHANGE_ME';
  const password = process.env.OB_DS_PASSWORD ?? '';

  // 冪等：(name, database_name) 大小寫不敏感、排除軟刪除（對齊 datasource.service.createDatasource）
  const existing = await qr.query(
    `SELECT id FROM datasources
      WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL
      LIMIT 1`,
    [DATASOURCE_NAME],
  );
  if (existing[0]?.id) {
    console.log(`  Skip: datasource '${DATASOURCE_NAME}' 已存在 (id=${existing[0].id})`);
    return;
  }

  const createdBy = await resolveCreatedBy(qr);
  const encryptedPassword = CryptoUtil.encrypt(password);

  await qr.query(
    `INSERT INTO datasources
       (id, name, type, host, port, database_name, username, encrypted_password,
        description, status, last_tested_at, created_by, created_at, updated_at, deleted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'unknown',NULL,$10,NOW(),NOW(),NULL)`,
    [
      randomUUID(),
      DATASOURCE_NAME,
      type,
      host,
      port,
      databaseName,
      username,
      encryptedPassword,
      isPlaceholder
        ? 'OB 來源資料庫（bootstrap placeholder，請於 UI 補連線並測試）'
        : 'OB 來源資料庫（bootstrap 自動建立）',
      createdBy,
    ],
  );

  if (isPlaceholder) {
    console.warn(
      `  ⚠ 建立 placeholder datasource '${DATASOURCE_NAME}'（未設 OB_DS_HOST/OB_DS_DATABASE）。\n` +
        `    請在 UI「資料來源」補上實際 OB 連線並「測試連線」後才能跑 ETL。`,
    );
  } else {
    console.log(`  Created: datasource '${DATASOURCE_NAME}' (${type} ${host}:${port}/${databaseName})`);
  }
}

async function main(): Promise<void> {
  console.log('Datasource seed starting...');
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'cdmp',
    password: process.env.DB_PASSWORD || 'cdmp_secret',
    database: process.env.DB_NAME || 'cdmp_dev',
    synchronize: false,
  });
  await dataSource.initialize();
  console.log(`Connected to ${process.env.DB_NAME || 'cdmp_dev'}.`);

  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await seedDatasource(qr);
    await qr.commitTransaction();
    console.log('Datasource seed complete.');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('Datasource seed failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main();
}
