#!/usr/bin/env node
/**
 * E07 ETL Seed Script
 * 依據 e07-etl-config.json 建立 3 個 E04 擷取任務 + 3 個 E05 Pipeline，
 * 對齊 AD-E07-12 雙層 ETL 架構（OB DB → raw_xxx → E05 Pipeline → ob_*）。
 *
 * 用法：
 *   1. 複製 scripts/.env.example 為 scripts/.env.local 並填入實際值
 *   2. 確認 datasource APYHFC16.OB 已存在於 CDMP（手動建立）
 *   3. 確認 ob_pool_data / ob_emphire / ob_calendar migration 已執行
 *   4. cd scripts && node seed-e07-etl.mjs
 *
 * 特性：
 *   - Idempotent：已存在的 task / pipeline 會跳過建立並改為驗證設定
 *   - Fail fast：任一步失敗立即停止並印出原因
 *   - 不執行 ETL：僅建立設定，需另行手動觸發 task / pipeline
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, 'e07-etl-config.json');
const ENV_PATH = resolve(__dirname, '.env.local');

// === 環境變數載入（最小化 dotenv） ===
function loadEnv() {
  try {
    const raw = readFileSync(ENV_PATH, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`✗ 找不到 ${ENV_PATH}，請複製 .env.example 為 .env.local 後填入。`);
      process.exit(1);
    }
    throw err;
  }
}

loadEnv();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('✗ ADMIN_EMAIL / ADMIN_PASSWORD 未設定');
  process.exit(1);
}

// === HTTP Client ===
let JWT = null;

async function api(method, path, body) {
  const url = `${API_BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (JWT) headers['Authorization'] = `Bearer ${JWT}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${typeof parsed === 'object' ? JSON.stringify(parsed) : parsed}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }

  return parsed;
}

// === 流程 ===

async function login() {
  console.log(`▸ Login as ${ADMIN_EMAIL}`);
  const { token } = await api('POST', '/api/v1/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  JWT = token;
  console.log('  ✓ JWT 取得');
}

async function ensureDatasource(config) {
  const { name, expectedId } = config.datasourceRef;
  console.log(`▸ 查詢 datasource ${name}`);
  const { data } = await api('GET', '/api/v1/datasources');
  const ds = data.find((d) => d.name === name);
  if (!ds) {
    throw new Error(`Datasource ${name} 不存在於 CDMP；請先在 UI 上手動建立或擴充本 script`);
  }
  if (expectedId && ds.id !== expectedId) {
    console.warn(`  ⚠ datasource id 不符 expected (${expectedId})，實際 ${ds.id}（不阻擋執行）`);
  }
  if (ds.status !== 'connected') {
    console.warn(`  ⚠ datasource status=${ds.status}（建議手動 POST /datasources/:id/test）`);
  }
  console.log(`  ✓ datasource id=${ds.id}, status=${ds.status}`);
  return ds;
}

async function ensureExtractionTask(taskCfg, datasourceId) {
  console.log(`▸ 確認擷取任務 ${taskCfg.name}`);
  const list = await api('GET', `/api/v1/extraction-tasks?search=${encodeURIComponent(taskCfg.name)}`);
  const existingStub = (list.data || []).find((t) => t.name === taskCfg.name);

  if (existingStub) {
    // List response 不含 rawTableName，需要 GET by id 取得完整 detail
    const detail = await api('GET', `/api/v1/extraction-tasks/${existingStub.id}`);
    console.log(`  ✓ 已存在 id=${detail.id}, rawTable=${detail.rawTableName}`);
    return detail;
  }

  const created = await api('POST', '/api/v1/extraction-tasks', {
    name: taskCfg.name,
    datasourceId,
    mode: taskCfg.mode,
    sourceSchema: taskCfg.sourceSchema,
    sourceTable: taskCfg.sourceTable,
    schedule: taskCfg.schedule,
  });
  console.log(`  ✓ 建立 id=${created.id}, rawTable=${created.rawTableName}`);
  return created;
}

function buildPipelineDefinition(pipelineCfg, rawTableName, datasourceName) {
  const fmMappings = pipelineCfg.fieldMappings.map((m) => ({
    sourceColumn: m.sourceColumn,
    targetColumn: m.targetColumn,
    defaultValue: null,
  }));

  // F090 / AD-E07-21：partition-replace 載入模式（ob_pool_data_list 雙重角色表）。
  // 預設沿用 AD-E07-12 fullMode 全量替換；config 顯式設 loadMode='partition_replace'
  // 時改走 per-partition 截斷（DELETE WHERE <col>=<val> 後 INSERT 並標記），不全表 TRUNCATE。
  const isPartitionReplace = pipelineCfg.loadMode === 'partition_replace';
  const targetLoadData = isPartitionReplace
    ? {
        nodeType: 'target_load',
        label: `載入 ${pipelineCfg.targetTable}`,
        subtitle: pipelineCfg.targetTable,
        targetTable: pipelineCfg.targetTable,
        loadMode: 'partition_replace',
        partitionColumn: pipelineCfg.partitionColumn,
        partitionValue: pipelineCfg.partitionValue,
      }
    : {
        nodeType: 'target_load',
        label: `載入 ${pipelineCfg.targetTable}`,
        subtitle: pipelineCfg.targetTable,
        targetTable: pipelineCfg.targetTable,
        fullMode: true,
      };

  // F090 / AD-E07-21 DP-AD21-1：歷史限定（PROJECT_WORKYM < 本月）於 extract 層套用，
  // 必須在 field_mapping dropUnmapped 丟掉過濾欄位之前過濾。當 sourceFilterColumn 為 null
  // 時不套用（spec gap：來源表實際無 PROJECT_WORKYM 欄，待裁示後填正確欄位）。
  const hl = pipelineCfg._historicalLimit;
  const extractData = {
    nodeType: 'raw_data_extract',
    label: `${pipelineCfg.targetTable} 來源`,
    rawTable: rawTableName,
    subtitle: `${datasourceName} / ${rawTableName}`,
    extractionRef: {
      datasourceName,
      sourceTable: rawTableName,
    },
  };
  if (hl && hl.sourceFilterColumn) {
    extractData.sourceFilter = {
      column: hl.sourceFilterColumn,
      operator: hl.sourceFilterOperator || '<',
      valueExpr: hl.sourceFilterValueExpr,
    };
  }

  return {
    nodes: [
      {
        id: 'e1',
        type: 'pipelineNode',
        position: { x: 0, y: 50 },
        data: extractData,
      },
      {
        id: 'fm1',
        type: 'pipelineNode',
        position: { x: 250, y: 50 },
        data: {
          nodeType: 'field_mapping',
          label: 'CAPS → snake_case',
          subtitle: `${fmMappings.length} 欄位`,
          mappings: fmMappings,
          dropUnmapped: true,
        },
      },
      {
        id: 'tl1',
        type: 'pipelineNode',
        position: { x: 500, y: 50 },
        data: targetLoadData,
      },
    ],
    edges: [
      { id: 'e1-fm1', source: 'e1', target: 'fm1' },
      { id: 'fm1-tl1', source: 'fm1', target: 'tl1' },
    ],
  };
}

async function ensurePipeline(pipelineCfg, extractionTask, datasourceName) {
  console.log(`▸ 確認 Pipeline ${pipelineCfg.name}`);
  // 注意：pipeline list API 用 keyword（非 search，與 extraction-task 不同）
  const list = await api('GET', `/api/v1/etl/pipelines?keyword=${encodeURIComponent(pipelineCfg.name)}`);
  let pipeline = (list.data || []).find((p) => p.name === pipelineCfg.name);

  if (!pipeline) {
    pipeline = await api('POST', '/api/v1/etl/pipelines', {
      name: pipelineCfg.name,
      description: pipelineCfg.description,
      schedule: pipelineCfg.schedule,
    });
    console.log(`  ✓ 建立 pipeline id=${pipeline.id}`);
  } else {
    console.log(`  ✓ 已存在 pipeline id=${pipeline.id}`);
  }

  const definition = buildPipelineDefinition(
    pipelineCfg,
    extractionTask.rawTableName,
    datasourceName,
  );

  const result = await api('PUT', `/api/v1/etl/pipelines/${pipeline.id}/definition`, {
    definition,
    changeSummary:
      pipelineCfg.loadMode === 'partition_replace'
        ? `[seed] F090 / AD-E07-21 雙層 ETL：${pipelineCfg.targetTable} partition-replace（${pipelineCfg.partitionColumn}=${pipelineCfg.partitionValue}）`
        : `[seed] AD-E07-12 雙層 ETL：${pipelineCfg.targetTable} fullMode 全量替換`,
  });
  console.log(`  ✓ definition 已寫入 (versionId=${result.versionId}, stepCount=${result.stepCount})`);
  return pipeline;
}

async function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  console.log(`E07 ETL Seed (config: ${CONFIG_PATH})`);
  console.log('='.repeat(60));

  await login();
  const datasource = await ensureDatasource(config);

  console.log('\n--- E04 擷取任務 (3) ---');
  const tasks = {};
  for (const taskCfg of config.extractionTasks) {
    tasks[taskCfg.name] = await ensureExtractionTask(taskCfg, datasource.id);
  }

  console.log('\n--- E05 Pipeline (3) ---');
  for (const pipelineCfg of config.pipelines) {
    const task = tasks[pipelineCfg.extractionTaskName];
    if (!task) {
      throw new Error(`Pipeline ${pipelineCfg.name} 引用的 extraction task ${pipelineCfg.extractionTaskName} 不存在`);
    }
    if (!task.rawTableName) {
      throw new Error(
        `Extraction task ${task.name} 尚未產生 rawTableName，請先觸發一次 task run（POST /extraction-tasks/${task.id}/run）後再跑本 script`,
      );
    }
    await ensurePipeline(pipelineCfg, task, datasource.name);
  }

  console.log('\n='.repeat(60));
  console.log('✓ E07 ETL Seed 完成');
  console.log('\n下一步：');
  console.log('  1. 執行 ob_pool_data / ob_emphire / ob_calendar 的 TypeORM migration');
  console.log('  2. 為每個 extraction task 觸發一次首跑 (POST /extraction-tasks/:id/run)');
  console.log('  3. 觸發每個 pipeline 執行 (POST /etl/pipelines/:id/execute)');
  console.log('  4. 驗證 ob_* 表有資料');
}

main().catch((err) => {
  console.error('\n✗ ERROR:', err.message);
  if (err.status) console.error(`  HTTP ${err.status}`);
  if (err.body) console.error('  Body:', JSON.stringify(err.body, null, 2));
  process.exit(1);
});
