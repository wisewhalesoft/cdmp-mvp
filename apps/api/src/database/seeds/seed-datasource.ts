/**
 * Datasource seed（空殼、冪等）
 *
 * 從 `seeds/data/datasources.json` 建立所有 ETL 來源連線（名稱/主機/埠/資料庫/帳號），
 * 密碼一律留空（placeholder，加密空字串），**由部署者於 UI「資料來源」逐一補密碼並測試連線**。
 * 中繼資料非機密可入 repo；密碼不落地（不進 git / 不進 env / 不進 DB 明文）。
 *
 * 名稱固定對齊 seeds/data/extraction-tasks.json / etl-pipelines.json 的 datasourceName
 * （尤其 `APYHFC16.OB`；prod-data-seed 的 seedExtractionTasks 依名查找，找不到即 fail-fast）。
 *
 * 冪等：以 name（排除軟刪除）判存在 → 已存在則 SKIP（**不覆寫使用者已在 UI 補好的密碼**）。
 * created_by：ETL_SEED_USER_EMAIL → dev admin UUID → 任一 active admin，故須在 seed.ts 之後跑。
 *
 * 用法：npm run seed-datasource（bootstrap 內串接）。需 AES_ENCRYPTION_KEY（加密 placeholder）。
 */
import { DataSource, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { seedConnectionOptions, pquery, top1 } from './seed-connection';

const DEV_ADMIN_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

interface DatasourceSeed {
  name: string;
  type: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  description: string | null;
}

function loadDatasources(): DatasourceSeed[] {
  const raw = readFileSync(resolve(__dirname, 'data', 'datasources.json'), 'utf-8');
  return JSON.parse(raw) as DatasourceSeed[];
}

export async function resolveCreatedBy(qr: QueryRunner): Promise<string> {
  const t1 = top1();
  const envEmail = process.env.ETL_SEED_USER_EMAIL?.trim();
  if (envEmail) {
    const r = await pquery(
      qr,
      `SELECT ${t1.prefix}id FROM users WHERE email = ?${t1.suffix}`,
      [envEmail],
    );
    if (r[0]?.id) return r[0].id;
    throw new Error(`seed-datasource 中止：ETL_SEED_USER_EMAIL='${envEmail}' 對應 user 不存在。`);
  }
  const devCheck = await pquery(qr, `SELECT id FROM users WHERE id = ?`, [DEV_ADMIN_UUID]);
  if (devCheck[0]?.id) return DEV_ADMIN_UUID;
  const fallback = await pquery(
    qr,
    `SELECT ${t1.prefix}id FROM users WHERE role='admin' AND status='active' ORDER BY created_at ASC${t1.suffix}`,
  );
  if (fallback[0]?.id) return fallback[0].id;
  throw new Error(
    `seed-datasource 中止：找不到可用 admin user（請先跑 seed 建立帳號，或設 ETL_SEED_USER_EMAIL）。`,
  );
}

export async function seedDatasources(qr: QueryRunner): Promise<void> {
  const rows = loadDatasources();
  const createdBy = await resolveCreatedBy(qr);
  // placeholder：加密空字串（decrypt → ''）；使用者於 UI 補真實密碼後即覆蓋
  const placeholderPassword = CryptoUtil.encrypt('');

  let created = 0;
  let skipped = 0;
  const t1 = top1();
  const now = new Date();
  for (const ds of rows) {
    const existing = await pquery(
      qr,
      `SELECT ${t1.prefix}id FROM datasources WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL${t1.suffix}`,
      [ds.name],
    );
    if (existing[0]?.id) {
      skipped++;
      continue; // 不覆寫既有（保住 UI 已補的密碼）
    }
    // NOW() → JS Date bind（三 driver 可攜，免 SQL 端函式差異）。
    await pquery(
      qr,
      `INSERT INTO datasources
         (id, name, type, host, port, database_name, username, encrypted_password,
          description, status, last_tested_at, created_by, created_at, updated_at, deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?,'unknown',NULL,?,?,?,NULL)`,
      [
        randomUUID(),
        ds.name,
        ds.type,
        ds.host,
        ds.port,
        ds.database_name,
        ds.username,
        placeholderPassword,
        ds.description ?? null,
        createdBy,
        now,
        now,
      ],
    );
    created++;
  }
  console.log(`  datasources: ${created} 新增（空殼）/ ${skipped} 已存在（未動）`);
  if (created > 0) {
    console.warn(
      `  ⚠ 已建立 ${created} 個 datasource 空殼（密碼留空）。請於 UI「資料來源」逐一補密碼並「測試連線」後才能跑 ETL。`,
    );
  }
}

async function main(): Promise<void> {
  console.log('Datasource seed starting...');
  // AD-E07-39 P1b3：依 DB_TYPE 切 postgres / mssql（原硬編碼 'postgres'）。seed 僅資料、synchronize:false。
  const dataSource = new DataSource({
    ...seedConnectionOptions(),
    synchronize: false,
  } as any);
  await dataSource.initialize();
  console.log(`Connected to ${process.env.DB_NAME || 'cdmp_dev'}.`);

  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await seedDatasources(qr);
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
