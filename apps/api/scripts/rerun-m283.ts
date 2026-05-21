/**
 * 一次性腳本：重跑 m283（UpsertSpecTpOptions32）up() 將 spec_tp options
 * 從舊 32 筆（TBL_ID='02' 筆誤）升級為新 52 筆（TBL_ID='12'）。
 *
 * 使用流程（從 host）：
 *   powershell> docker cp apps/api/scripts/rerun-m283.ts cdmp-api:/app/src/database/__rerun-m283.ts
 *   powershell> docker exec cdmp-api npx ts-node -r tsconfig-paths/register src/database/__rerun-m283.ts
 *
 * 注意：腳本在容器內以 /app/src/database/__rerun-m283.ts 執行，故 import 路徑為
 *      ./migrations/1711360000283-UpsertSpecTpOptions32（不是 ../src/database/migrations/...）。
 *
 * 安全性：m283.up() = DELETE column_name='spec_tp' + INSERT 52 筆 UPSERT，冪等。
 * 不動其他欄位資料；不動 schema；不動 typeorm_migrations table。
 */

import { DataSource } from 'typeorm';
import { UpsertSpecTpOptions321711360000283 } from './migrations/1711360000283-UpsertSpecTpOptions32';

async function main(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'cdmp',
    password: process.env.DB_PASSWORD || 'cdmp_secret',
    database: process.env.DB_NAME || 'cdmp_dev',
    entities: [],
    synchronize: false,
    logging: ['error', 'warn'],
  });

  await ds.initialize();
  console.log(`[rerun-m283] connected to ${ds.options.database}@${(ds.options as { host?: string }).host}`);

  const before = await ds.query<Array<{ cnt: string }>>(
    `SELECT COUNT(*)::text AS cnt FROM pooldata_field_option WHERE column_name = 'spec_tp'`,
  );
  console.log(`[rerun-m283] before: spec_tp count = ${before[0].cnt}`);

  const migration = new UpsertSpecTpOptions321711360000283();
  const qr = ds.createQueryRunner();
  try {
    await qr.startTransaction();
    await migration.up(qr);
    await qr.commitTransaction();
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
  }

  const after = await ds.query<Array<{ cnt: string }>>(
    `SELECT COUNT(*)::text AS cnt FROM pooldata_field_option WHERE column_name = 'spec_tp'`,
  );
  const sample = await ds.query<Array<{ option_value: string; option_label: string }>>(
    `SELECT option_value, option_label
       FROM pooldata_field_option
      WHERE column_name = 'spec_tp'
        AND option_value IN ('01', '11', '42', '48', '99')
      ORDER BY option_value`,
  );
  console.log(`[rerun-m283] after:  spec_tp count = ${after[0].cnt} (expected 52)`);
  console.log(`[rerun-m283] sample rows:`);
  for (const r of sample) {
    console.log(`              ${r.option_value} = ${r.option_label}`);
  }

  await ds.destroy();
  console.log(`[rerun-m283] done.`);
}

main().catch((err) => {
  console.error('[rerun-m283] failed:', err);
  process.exit(1);
});
