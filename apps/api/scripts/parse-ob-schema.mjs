#!/usr/bin/env node
/**
 * 解析 reference/TableSchema/OB/*.sql（SQL Server CREATE TABLE）
 * 輸出 TypeORM Table column 陣列（ts 片段，貼進 migration 檔）。
 *
 * 用法：
 *   cd apps/api && node scripts/parse-ob-schema.mjs <sql_path> [--add-cdmp-extracted-at]
 *
 * 範例：
 *   node scripts/parse-ob-schema.mjs ../../reference/TableSchema/OB/OBPOOLDATA.sql --add-cdmp-extracted-at
 *
 * 輸出規則：
 *   - SQL Server identifier (CAPS) → snake_case
 *   - nvarchar/varchar(N) → varchar(N)；N>255 改 text
 *   - nvarchar(MAX) → text
 *   - datetime → timestamp
 *   - numeric(p,s) → numeric(p,s)
 *   - money → numeric(19,4)
 *   - int → integer
 *   - 稽核欄位 (A_PRGID 等) 重命名：
 *       A_PRGID → created_by_prog, A_USERID → created_by, A_SYSDT → created_at,
 *       U_PRGID → updated_by_prog, U_USERID → updated_by, U_SYSDT → updated_at
 *       並全部設為 isNullable: true（dump 觀察符合）
 */

import { readFileSync } from 'node:fs';
import { argv } from 'node:process';

const sqlPath = argv[2];
const addCdmpExtractedAt = argv.includes('--add-cdmp-extracted-at');

// Entity 輸出模式
// 用法：node parse-ob-schema.mjs <sql> --entity --name=ob_emphire --class=ObEmphire --pk=emp_id [--rename=ID:id_no,FOO:bar]
const entityMode = argv.includes('--entity');
// fieldMappings 輸出模式（給 e07-etl-config.json 用）
// 用法：node parse-ob-schema.mjs <sql> --mappings [--rename=A:b]
//   - 排除稽核欄位（A_PRGID 等 6 個）— ETL pipeline 不映射稽核欄位（target 表自帶 created_at/updated_at）
//   - 保留 sourceColumn 為 SQL Server CAPS 原名（raw 表保留原大小寫）
//   - targetColumn 為 snake_case（target ob_* 表欄位）
const mappingsMode = argv.includes('--mappings');
const flagValue = (k) => {
  const arg = argv.find((a) => a.startsWith(`--${k}=`));
  return arg ? arg.slice(k.length + 3) : null;
};
const tableName = flagValue('name');
const className = flagValue('class');
const pkCols = (flagValue('pk') || '').split(',').filter(Boolean);
const renameMap = Object.fromEntries(
  (flagValue('rename') || '').split(',').filter(Boolean).map((p) => p.split(':')),
);

if (!sqlPath) {
  console.error('Usage:');
  console.error('  node parse-ob-schema.mjs <sql_path> [--add-cdmp-extracted-at]              # Migration columns');
  console.error('  node parse-ob-schema.mjs <sql_path> --entity --name=<tbl> --class=<Cls> --pk=<col1,col2> [--rename=A:b,C:d] [--add-cdmp-extracted-at]');
  process.exit(1);
}
if (entityMode && (!tableName || !className)) {
  console.error('--entity 模式需要 --name 與 --class 旗標');
  process.exit(1);
}

const AUDIT_RENAMES = {
  A_PRGID: 'created_by_prog',
  A_USERID: 'created_by',
  A_SYSDT: 'created_at',
  U_PRGID: 'updated_by_prog',
  U_USERID: 'updated_by',
  U_SYSDT: 'updated_at',
};

function toSnakeCase(name) {
  if (AUDIT_RENAMES[name]) return AUDIT_RENAMES[name];
  return name.toLowerCase();
}

function mapType(sqlType, length, precision, scale) {
  const t = sqlType.toLowerCase();
  switch (t) {
    case 'nvarchar':
    case 'varchar': {
      const lenStr = length != null ? String(length).toUpperCase() : null;
      if (lenStr === null || lenStr === 'MAX' || lenStr === '-1') return { type: 'text' };
      const n = parseInt(lenStr, 10);
      if (Number.isNaN(n) || n > 255) return { type: 'text' };
      return { type: 'varchar', length: String(n) };
    }
    case 'char':
    case 'nchar': {
      const n = parseInt(length, 10);
      return { type: 'char', length: String(n) };
    }
    case 'text':
    case 'ntext':
      return { type: 'text' };
    case 'datetime':
    case 'datetime2':
    case 'smalldatetime':
      return { type: 'timestamp' };
    case 'date':
      return { type: 'date' };
    case 'time':
      return { type: 'time' };
    case 'int':
      return { type: 'integer' };
    case 'bigint':
      return { type: 'bigint' };
    case 'smallint':
      return { type: 'smallint' };
    case 'tinyint':
      return { type: 'smallint' }; // PostgreSQL 無 tinyint
    case 'bit':
      return { type: 'boolean' };
    case 'decimal':
    case 'numeric':
      if (precision != null && scale != null) {
        return { type: 'numeric', precision: Number(precision), scale: Number(scale) };
      }
      return { type: 'numeric' };
    case 'money':
      return { type: 'numeric', precision: 19, scale: 4 };
    case 'float':
    case 'real':
      return { type: 'double precision' };
    case 'uniqueidentifier':
      return { type: 'uuid' };
    case 'binary':
    case 'varbinary':
    case 'image':
      return { type: 'bytea' };
    default:
      console.warn(`⚠ 未知型別: ${sqlType}（保留原樣）`);
      return { type: t };
  }
}

const COLUMN_RE = /^\s*\[([A-Z_][A-Z0-9_]*)\]\s+\[([a-zA-Z]+)\](?:\((\d+|MAX|-1)(?:,\s*(\d+))?\))?\s+(NULL|NOT\s+NULL),?/i;

const sql = readFileSync(sqlPath, 'utf-8');
const lines = sql.split(/\r?\n/);
const cols = [];

for (const line of lines) {
  const m = line.match(COLUMN_RE);
  if (!m) continue;
  const [, rawName, sqlType, lengthOrPrec, scaleArg, nullness] = m;
  const isNullable = /^NULL$/i.test(nullness);
  // numeric 與 decimal 第一個括號參數是 precision，第二個是 scale
  const isNumericLike = ['decimal', 'numeric'].includes(sqlType.toLowerCase());
  const length = !isNumericLike ? lengthOrPrec : undefined;
  const precision = isNumericLike ? lengthOrPrec : undefined;
  const scale = isNumericLike ? scaleArg : undefined;
  const mapped = mapType(sqlType, length, precision, scale);
  cols.push({
    name: toSnakeCase(rawName),
    rawName,
    isNullable,
    ...mapped,
  });
}

if (addCdmpExtractedAt) {
  cols.push({
    name: '_cdmp_extracted_at',
    type: 'timestamp',
    isNullable: false,
    _comment: 'E04 ETL 系統欄位',
  });
}

if (mappingsMode) {
  // === fieldMappings 輸出（給 ETL pipeline）===
  const auditNames = new Set(Object.keys(AUDIT_RENAMES));
  const mappings = [];
  for (const c of cols) {
    if (!c.rawName) continue; // 跳過 _cdmp_extracted_at（無 rawName）
    if (auditNames.has(c.rawName)) continue; // 跳過稽核欄位
    const target = renameMap[c.rawName] || c.name;
    mappings.push({ sourceColumn: c.rawName, targetColumn: target });
  }
  console.log(JSON.stringify(mappings, null, 2));
  console.error(`\n✓ Mappings 解析完成：${mappings.length} 個（已排除稽核欄位與系統欄位）`);
} else if (entityMode) {
  // === Entity 輸出模式 ===
  // TypeORM @Column 對應 TypeScript 型別
  const tsTypeOf = (c) => {
    if (c.type === 'integer' || c.type === 'bigint' || c.type === 'smallint' || c.type === 'numeric' || c.type === 'double precision') {
      return c.type === 'numeric' ? 'string' : 'number'; // numeric → string（TypeORM postgres 慣例）
    }
    if (c.type === 'boolean') return 'boolean';
    if (c.type === 'timestamp' || c.type === 'date' || c.type === 'time') return 'Date';
    if (c.type === 'jsonb' || c.type === 'json') return 'Record<string, unknown>';
    if (c.type === 'bytea') return 'Buffer';
    return 'string'; // varchar, text, char, uuid
  };

  const lines = [];
  lines.push('// 自動產生 by parse-ob-schema.mjs --entity');
  lines.push(`// 來源：${sqlPath}`);
  lines.push(`// 對應 migration：apps/api/src/database/migrations/...`);
  lines.push('// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修');
  lines.push('');
  lines.push("import { Entity, Column, PrimaryColumn, Index } from 'typeorm';");
  lines.push('');
  lines.push(`@Entity('${tableName}')`);
  lines.push(`export class ${className} {`);
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const finalName = renameMap[c.rawName] || c.name;
    const isPk = pkCols.includes(finalName);
    const opts = [`name: '${finalName}'`, `type: '${c.type}'`];
    if (c.length) opts.push(`length: ${c.length}`);
    if (c.precision != null) opts.push(`precision: ${c.precision}`);
    if (c.scale != null) opts.push(`scale: ${c.scale}`);
    if (c.isNullable && !isPk) opts.push('nullable: true');
    const decoratorName = isPk ? 'PrimaryColumn' : 'Column';
    const tsType = tsTypeOf(c);
    const nullSuffix = c.isNullable && !isPk ? ' | null' : '';
    const commentSuffix = c.rawName && c.rawName.toUpperCase() !== finalName.toUpperCase() ? ` // ${c.rawName}` : '';
    lines.push(`  @${decoratorName}({ ${opts.join(', ')} })`);
    lines.push(`  ${finalName}: ${tsType}${nullSuffix};${commentSuffix}`);
    if (i < cols.length - 1) lines.push('');
  }
  lines.push('}');
  console.log(lines.join('\n'));
  console.error(`\n✓ Entity 解析完成：${cols.length} 欄位 (${pkCols.length} PK)`);
} else {
  // === 預設：TypeORM Table.columns 陣列形式（給 migration 用）===
  const tsLines = ['        // 自動產生 by parse-ob-schema.mjs ' + sqlPath];
  for (const c of cols) {
    const parts = [];
    parts.push(`name: '${c.name}'`);
    parts.push(`type: '${c.type}'`);
    if (c.length) parts.push(`length: '${c.length}'`);
    if (c.precision != null) parts.push(`precision: ${c.precision}`);
    if (c.scale != null) parts.push(`scale: ${c.scale}`);
    parts.push(`isNullable: ${c.isNullable}`);
    const commentSuffix = c.rawName ? `  // ${c.rawName}` : c._comment ? `  // ${c._comment}` : '';
    tsLines.push(`        { ${parts.join(', ')} },${commentSuffix}`);
  }
  console.log(tsLines.join('\n'));
  console.error(`\n✓ 解析完成：${cols.length} 欄位`);
}
