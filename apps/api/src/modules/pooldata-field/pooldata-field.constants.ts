/**
 * F112 / AD-E07-47 §3.3 / §3.5：類別型篩選欄位可選值自動建議之共用常數
 *
 * - `DISTINCT_VALUES_CAP`：distinct 值回傳上限（預設 200；查詢取 CAP+1 筆偵測 truncation）。
 *   MAY 由環境變數 `POOLDATA_DISTINCT_VALUES_CAP` 覆寫（部署層），但預設固定、不開放 Admin UI 調整
 *   （OQ-178-01 裁示）。GET distinct-values 回傳上限與 POST options/bulk 之 ArrayMaxSize 共用此常數，
 *   確保 env 覆寫情境下兩端點上限恆一致（AD §3.11）。
 *
 * - `DISTINCT_VALUES_TIMEOUT_MS`：distinct 查詢之 app-level 逾時（獨立於全域 driver requestTimeout）。
 *   AD §1 / §3.5：全域 tedious requestTimeout 已於 P6c 效能修復調高為 1 小時（`data-source.ts`），
 *   若沿用該值，緩慢 DISTINCT 查詢會讓部長端 HTTP 請求掛起長達 1 小時，對同步互動 UI 不可接受；
 *   故以 `Promise.race` 於應用層界定獨立逾時（比照 `Stage0EstimateService.estimateListCount` 前例），
 *   預設 15000ms（延續 spec OQ-178-02 原本假設之「約 15s」使用體驗預算），MAY 由環境變數
 *   `POOLDATA_DISTINCT_VALUES_TIMEOUT_MS` 覆寫。
 *
 * - `SAFE_COLUMN_NAME_RE`：SQL 識別字白名單正則（與 F075 `CreatePooldataFieldDto` / F109
 *   `stage1-query-composer.ts` 同值，AD §3.3 裁定於 pooldata-field 模組內部獨立宣告、不跨模組 import）。
 *   `columnName` 為 SQL 識別字不可參數化，須先以此正則驗證、再以 INFORMATION_SCHEMA 存在性確認，
 *   最後才可安全內插進 raw SQL（I-DVAL-SAFE-INTERP-01）。
 */

export const DISTINCT_VALUES_CAP = Number(
  process.env.POOLDATA_DISTINCT_VALUES_CAP ?? 200,
);

export const DISTINCT_VALUES_TIMEOUT_MS = Number(
  process.env.POOLDATA_DISTINCT_VALUES_TIMEOUT_MS ?? 15_000,
);

export const SAFE_COLUMN_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
