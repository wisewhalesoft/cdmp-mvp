/**
 * F110 / US-173 — `ETL for Customer Core` pipeline definition 收斂之單一事實來源。
 *
 * AD-E07-41 §13.6.2：PG／MSSQL 兩支 data-update migration 皆從本模組匯入同一份
 * `definition` 物件參照（非各自複製維護兩份字面 JSON），確保 `JSON.stringify()` 結果
 * byte-identical（I-CODEDECODE-MIGRATION-01）。
 *
 * 刻意放在 `migrations/shared/` 子目錄：`data-source.ts` 的兩軌 glob 為
 *   - postgres：`migrations/*.{ts,js}`（單層 `*` 不含子目錄）
 *   - mssql：`migrations/mssql/*.{ts,js}`
 * 皆不會匹配 `migrations/shared/*`，故 `migration:run` 不會誤把本檔當成缺少
 * `MigrationInterface` 實作的 migration。
 *
 * 讀取方式：沿用專案既有 `prod-data-seed.ts` 之 `loadJson`（`readFileSync` + `JSON.parse`）
 * 慣例，於 module load 時一次性讀入並解析 `etl-pipelines.json`。ts-node（migration:run）
 * 與 vitest（測試）下 `__dirname` 皆指向本檔所在目錄，相對路徑 `../../seeds/data` 均可解析；
 * 亦免除對 `resolveJsonModule` 之 tsconfig 依賴（專案現行未啟用）。module 快取保證兩支
 * migration 取得同一物件參照。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CustomerCorePipelineDefinition {
  nodes: any[];
  edges: any[];
}

interface EtlPipelineSeed {
  name: string;
  version: number;
  step_count: number;
  definition: CustomerCorePipelineDefinition;
  [key: string]: unknown;
}

const CUSTOMER_CORE_PIPELINE_NAME = 'ETL for Customer Core';

const ETL_PIPELINES_JSON_PATH = resolve(
  __dirname,
  '..',
  '..',
  'seeds',
  'data',
  'etl-pipelines.json',
);

const etlPipelines: EtlPipelineSeed[] = JSON.parse(
  readFileSync(ETL_PIPELINES_JSON_PATH, 'utf-8'),
);

const pipeline = etlPipelines.find(
  (p) => p.name === CUSTOMER_CORE_PIPELINE_NAME,
);
if (!pipeline) {
  throw new Error(
    `customer-core-code-decode-definition: 找不到 etl-pipelines.json 中 ` +
      `name='${CUSTOMER_CORE_PIPELINE_NAME}' 的 pipeline —— ` +
      `本模組假設 AD-E07-41 §13.6.1 之 JSON 編輯已先落地（definition 已含 9 個 code_decode 節點）`,
  );
}

/**
 * §13.6.1 編輯後的新 definition（單一事實來源，PG/MSSQL migration 皆從此匯入，
 * 確保 JSON.stringify 結果 byte-identical）。
 */
export const CUSTOMER_CORE_CODE_DECODE_DEFINITION: CustomerCorePipelineDefinition =
  pipeline.definition;

/** 收斂後 step_count（34 = 56 − 31 + 9，§13.6.1）。 */
export const CUSTOMER_CORE_NEW_STEP_COUNT: number = pipeline.step_count;

/** 收斂後 version（14，§13.6.1）。 */
export const CUSTOMER_CORE_NEW_VERSION: number = pipeline.version;

/** pipeline 名稱（migration guard 查詢用）。 */
export const CUSTOMER_CORE_PIPELINE_NAME_EXPORT = CUSTOMER_CORE_PIPELINE_NAME;

/**
 * down() 還原用：收斂前（31-lookup）之既有版本號 13。
 */
export const CUSTOMER_CORE_PRE_MIGRATION_VERSION = 13;

/**
 * down() 還原用：收斂前 etl_pipelines.step_count 之「既有（過時）值」53
 * —— down() 還原「修改前的既有狀態」（53），非「修改前的正確值」（56）。
 */
export const CUSTOMER_CORE_PRE_MIGRATION_STEP_COUNT = 53;
