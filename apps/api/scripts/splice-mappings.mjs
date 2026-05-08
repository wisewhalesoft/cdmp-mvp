// 一次性工具：將 OBPOOLDATA 完整 mappings 替換到 e07-etl-config.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfgPath = resolve(__dirname, '../../../scripts/e07-etl-config.json');
const sqlPath = resolve(__dirname, '../../../reference/TableSchema/OB/OBPOOLDATA.sql');

// 直接呼叫 parse-ob-schema.mjs --mappings
const parserPath = resolve(__dirname, 'parse-ob-schema.mjs');
const mappingsJson = execSync(`node "${parserPath}" "${sqlPath}" --mappings`, { encoding: 'utf-8' });
const mappings = JSON.parse(mappingsJson);

const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
const pl = cfg.pipelines.find((p) => p.name === 'E07-OBPOOLDATA-Load');
if (!pl) {
  console.error('E07-OBPOOLDATA-Load pipeline not found');
  process.exit(1);
}
console.log(`替換前：${pl.fieldMappings.length} 個 mappings`);
pl.fieldMappings = mappings;
pl._TODO = 'ob_pool_data 完整映射 OBPOOLDATA 120 欄（排除 6 稽核欄位 + _cdmp_extracted_at 系統欄位）= 114 mappings；自動產出 by parse-ob-schema.mjs --mappings';

writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
console.log(`替換後：${pl.fieldMappings.length} 個 mappings ✓`);
