import pg from 'pg';
const { Client } = pg;

const expected = [
  'ob_code_df', 'ob_list_definition', 'ob_dept_pct', 'ob_empl_set',
  'ob_levelcard_version', 'ob_levelcard_column', 'ob_levelcard_score', 'ob_levelcard_level',
  'ob_tier', 'ob_emphire', 'ob_calendar', 'ob_pool_data', 'ob_pool_data_list',
  'assignment_run', 'assignment_run_snapshot', 'assignment_run_stage_log', 'assignment_audit_log',
  'ob_assign_config', 'ob_assign_set',
];

const client = new Client({
  host: 'localhost', port: 5432,
  user: 'cdmp', password: 'cdmp_secret', database: 'cdmp_dev',
});

await client.connect();

const res = await client.query(`
  SELECT table_name
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name = ANY($1)
   ORDER BY table_name`, [expected]);

const found = new Set(res.rows.map(r => r.table_name));
console.log(`找到 ${found.size}/${expected.length} 個 E07 表`);
for (const t of expected) {
  console.log(`  ${found.has(t) ? '✓' : '✗'} ${t}`);
}

// 額外驗證：users.is_sales_manager 欄位
const userCol = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_sales_manager'`);
console.log(`\nusers.is_sales_manager: ${userCol.rows.length > 0 ? '✓ 存在' : '✗ 不存在'}`);
if (userCol.rows.length > 0) console.log('  ', JSON.stringify(userCol.rows[0]));

// ob_pool_data 欄位數
const cnt = await client.query(`
  SELECT COUNT(*)::int AS c FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ob_pool_data'`);
console.log(`\nob_pool_data 欄位數：${cnt.rows[0].c}（預期 121）`);

const cnt2 = await client.query(`
  SELECT COUNT(*)::int AS c FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ob_pool_data_list'`);
console.log(`ob_pool_data_list 欄位數：${cnt2.rows[0].c}（預期 128）`);

// ob_tier 確認 PK 索引
const idx = await client.query(`
  SELECT indexname, indexdef FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'ob_tier'`);
console.log(`\nob_tier 索引（${idx.rows.length} 個）：`);
for (const r of idx.rows) console.log(`  ${r.indexname}: ${r.indexdef}`);

// ob_assign_config seed
const seed = await client.query(`SELECT * FROM ob_assign_config WHERE config_key = 'cr_reassignment_enabled'`);
console.log(`\nob_assign_config Seed: ${seed.rows.length > 0 ? '✓' : '✗（migration M3 才有 seed，dev synchronize 不跑）'}`);

await client.end();
