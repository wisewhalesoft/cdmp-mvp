---
type: test-design-feature
feature_id: F090
feature_name: OBPOOLDATA_LIST ETL 載入與 data_source 單源化標記
priority: P0-MVP
related_spec: /docs/specs/features/F090-obpooldata-list-etl.md
spec_version: "2.0"
covers:
  - F090
  - US-133
last_updated: 2026-05-27
---

# F090：OBPOOLDATA_LIST ETL 載入與 data_source 單源化標記 — 測試設計

> **v2.0 更新（2026-05-27）**：依 F090 spec v2.0（AD-E07-25 單源化）升版。核心變更：
>
> **【v2.0 變更 1】data_source 值域單源化（DP-AD25-1 方案 A）**
> - 值域由 `'etl_legacy'` / `'monthly_run'` 雙值改為**單一值 `'etl_load'`**
> - `ob_pool_data_list` 不再混入月跑資料；月跑改寫 `ob_monthly_run_result`（F094）
> - **v2.0 不新建 migration**：`1711360000291` 已於 v1.0 建立，值域單一化為應用層說明變更
>
> **【v2.0 變更 2】ETL Load 前置 DELETE 放寬**
> - v1.0：`DELETE WHERE data_source='etl_legacy'`（保護 `monthly_run` 列）
> - v2.0：全量 `DELETE FROM ob_pool_data_list`（或等效 `DELETE WHERE data_source='etl_load'`）— 因本表不再有月跑資料需保護
>
> **【v2.0 變更 3】歷史限定過濾欄位修正（v1.0.1 已修正）**
> - 來源表 `OBPOOLDATA_LIST` **無 `PROJECT_WORKYM` 欄位**；唯一可用時間欄為 `ASSIGNDAY`
> - 歷史限定過濾條件：`WHERE ASSIGNDAY < 本月第一天 (yyyyMMdd)`（`本月第一天 = WORKYM + '01'`）
>
> **對既有 F090 test spec（v1.0）的影響**：
> - TS-F090-ETL-001（歷史限定過濾）：更新過濾欄位為 `ASSIGNDAY` 而非 `PROJECT_WORKYM`
> - TS-F090-ETL-002（DELETE 不傷 monthly_run）：**廢棄**（v2.0 無月跑資料需保護；全量 DELETE 合法）
> - TS-F090-ETL-003（插入標記）：更新期望值為 `data_source = 'etl_load'`（取代 `'etl_legacy'`）
> - TS-F090-ETL-004（欄位映射）：更新期望 `data_source = 'etl_load'`
> - TS-F090-MON-001~002（月跑標記）：**廢棄**（月跑不再寫入本表，改寫 F094 `ob_monthly_run_result`）
> - TS-F090-MON-003（去重聯集）：更新說明（去重來源僅 `'etl_load'` 單值）
> - 新增 Regression 場景：月跑不再寫入本表

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F090-obpooldata-list-etl.md`（v2.0）+ `architecture-spec.md` AD-E07-21 / AD-E07-25 + `data-model.md`（`ob_pool_data_list` v1.15）+ `scripts/e07-etl-config.json` + `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（欄位映射 ground truth） |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Unit（schema 靜態驗證 + fullMode 護欄）、Integration（PostgreSQL TestContainer：migration up/down + ETL Load 行為） |
| v2.0 重點 | `data_source = 'etl_load'`（單值）；Load 前置全量 DELETE；月跑不再寫入本表（regression）；歷史限定過濾使用 `ASSIGNDAY` 欄位 |
| SQLite E2E 慣例 | migration 在 SQLite E2E 環境為 no-op（既有慣例）；migration up/down 需 PostgreSQL TestContainer |

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F090-MIG-001~003（migration，v1.0 維持）| 3 | 高（需 PG TC）| Integration | 不受 v2.0 影響（migration 在 v1.0 建立，v2.0 不新建）|
| TS-F090-ENT-001~002（entity 靜態，v2.0 更新）| 2 | 高 | Unit（靜態）| 更新 entity 值域說明驗證 |
| TS-F090-ETL-001v2~ETL-004v2（ETL Load，v2.0 更新）| 4 | 高（需 PG TC）| Integration | 歷史限定用 ASSIGNDAY；DELETE 全量；標記 `etl_load` |
| TS-F090-ETL-005（fullMode 護欄，維持）| 1 | 高 | Unit（靜態）| 不受 v2.0 影響 |
| TS-F090-RGv2-001~003（月跑不再寫入，v2.0 新增）| 3 | 高（需 PG TC）| Integration / Unit | 確認月跑寫入改至 F094 表，本表無月跑資料 |

---

## 一、Migration 驗證（m291）

> **v2.0 說明**：migration `1711360000291` 已於 v1.0 建立，v2.0 **不新建 migration**（DP-AD25-1）。以下 TS-F090-MIG-001~003 與 v1.0 定義相同，不重複展開。
>
> 場景編號：TS-F090-MIG-001（up() 新增 data_source 欄與索引）、TS-F090-MIG-002（down() 可逆驗證）、TS-F090-MIG-003（SQLite no-op 靜態驗證）。
>
> **SP 對照**：AD-E07-21 §21.3；migration `1711360000291-AddObPoolDataListDataSource`。

---

## 二、Entity 欄位驗證（v2.0 更新值域說明）

---

### TS-F090-ENT-001v2：ob-pool-data-list.entity.ts — @Column data_source 屬性（v2.0 值域說明更新）

- **關聯需求**：F090 v2.0 AC-1（entity 值域說明更新為 `'etl_load'`，DP-AD25-1）
- **測試類型**：Positive / Unit（靜態）
- **測試層**：Unit（TypeORM metadata 反射或原始碼 grep）
- **前置條件**：`ob-pool-data-list.entity.ts` 已依 v2.0 更新 `data_source` 欄位之 JSDoc 或 `comment` 屬性
- **步驟**：
  1. 確認 `data_source` property 存在，`@Column` 屬性：`name: 'data_source'`、`type: 'varchar'`、`length: 20`、`nullable: true`（結構與 v1.0 相同）
  2. 確認 `@Column` 的 `comment` / 欄位 JSDoc 含「值域 `'etl_load'`（單一來源 ETL 批次標記，AD-E07-25 DP-AD25-1）」或等效說明
  3. 確認**不含** `'etl_legacy'` 或 `'monthly_run'` 作為正式值域說明（已廢棄）
- **預期結果**：
  - entity 欄位定義結構正確（length=20、nullable=true）
  - 值域說明反映 v2.0 單源化（`'etl_load'`）
  - 廢棄值域（`'etl_legacy'` / `'monthly_run'`）不出現於正式說明

---

### TS-F090-ENT-002（v1.0 維持）：entity 與 migration 一致性

> 不受 v2.0 影響，定義與 v1.0 完全相同。

---

## 三、ETL Load 行為驗證（v2.0 更新）

> **設計依據**：F090 v2.0 AC-2 / AC-3 / AC-4；AD-E07-21 §21.2 / §21.3 + AD-E07-25 §25.3

---

### TS-F090-ETL-001v2：歷史限定過濾 — 僅載入 ASSIGNDAY < 本月第一天

- **關聯需求**：F090 v2.0 AC-3（`WHERE ASSIGNDAY < :currentMonthFirstDay`，schema 事實修正）；AD-E07-21 DP-AD21-1（v1.0.1 修正版）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - PostgreSQL TestContainer 啟動，migration 至 m291 已執行
  - 模擬 raw staging 資料（或 mock ETL Load 節點的 SELECT 查詢）：
    - 3 筆歷史資料：`ASSIGNDAY = '20250401'`、`'20250501'`、`'20250501'`（均 < `'20260501'`，本月第一天）
    - 2 筆本月資料：`ASSIGNDAY = '20260501'`（即 `currentMonthFirstDay`，`>=` 邊界）
    - 1 筆本月後資料：`ASSIGNDAY = '20260615'`（> 本月第一天）
  - `workym = '202605'`；`currentMonthFirstDay = '20260501'`
- **步驟**：
  1. 執行 ETL Load 節點（或等效 service method），帶入 `currentMonthFirstDay`
  2. 查詢 `ob_pool_data_list WHERE data_source = 'etl_load'`，統計筆數
  3. 確認插入資料的 `ASSIGNDAY` 值範圍
- **預期結果**：
  - `ob_pool_data_list` 中 `data_source = 'etl_load'` 的列共 3 筆（`'20250401'` × 1 + `'20250501'` × 2，均 < `'20260501'`）
  - `ASSIGNDAY = '20260501'`（本月第一天，邊界，`>=` 不符條件）的資料**不存在**
  - `ASSIGNDAY = '20260615'`（本月後）的資料**不存在**
- **⚠️ v1.0 差異**：v1.0 使用 `PROJECT_WORKYM` 欄位過濾；v2.0 確認改用 `ASSIGNDAY < currentMonthFirstDay`
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-ETL-002v2：ETL Load 前置 DELETE 全量（v2.0 放寬，不含月跑保護）

- **關聯需求**：F090 v2.0 AC-3（「全量 `DELETE FROM ob_pool_data_list`，無需 per-data_source 保護性截斷」）；AD-E07-25 §25.3
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_pool_data_list` 預先 seed：
    - 10 筆 `data_source = 'etl_load'`
    - 3 筆 `data_source = NULL`（migration 前的舊資料，DP-AD25-5 自然淘汰對象）
    - 5 筆 `data_source = 'monthly_run'`（v1.0 過渡期殘留資料，DP-AD25-5 自然淘汰對象）
- **步驟**：
  1. 執行 ETL Load（觸發前置 DELETE 後 INSERT 新 etl_load 歷史）
  2. 查詢 `ob_pool_data_list WHERE data_source = 'monthly_run'`，統計筆數
  3. 查詢 `ob_pool_data_list WHERE data_source IS NULL`，統計筆數
  4. 查詢 `ob_pool_data_list WHERE data_source = 'etl_load'`，確認為新插入資料
- **預期結果**：
  - **全量 DELETE 後，`monthly_run` 列與 NULL 列均已清除**（v2.0 全量覆寫，舊殘留資料自然淘汰）
  - `data_source = 'etl_load'` 為新 INSERT 的歷史資料
  - **不存在** `DELETE WHERE data_source='etl_load' AND ...` 之 per-data_source 保護性截斷（v2.0 全量 DELETE）
- **⚠️ v1.0 差異**：v1.0 要求 DELETE 不傷 `monthly_run` 列（TS-F090-ETL-002 廢棄）；v2.0 全量覆寫合法
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-ETL-003v2：ETL Load 插入列標記 'etl_load'（v2.0 更新值域）

- **關聯需求**：F090 v2.0 AC-3（「所有 ETL 插入列 `data_source = 'etl_load'`」）；AD-E07-25 §25.3
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_pool_data_list` 初始為空
  - 準備 5 筆 `ASSIGNDAY < currentMonthFirstDay` 的 raw 來源資料
- **步驟**：
  1. 執行 ETL Load
  2. 查詢 `SELECT data_source, COUNT(*) FROM ob_pool_data_list GROUP BY data_source`
  3. 從插入資料中隨機抽取一筆，確認 `data_source = 'etl_load'`
- **預期結果**：
  - 所有 ETL 插入列均為 `data_source = 'etl_load'`（**不含** `'etl_legacy'` / `'monthly_run'` / NULL）
  - 插入筆數 = 來源資料筆數（無遺漏）
- **⚠️ v1.0 差異**：v1.0 期望標記為 `'etl_legacy'`；v2.0 改為 `'etl_load'`（grep `'etl_legacy'` 確認原始碼已替換）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-ETL-004v2：欄位映射完整性（v2.0 更新 data_source 預期值）

- **關聯需求**：F090 v2.0 AC-4；AD-E07-21 §21.4（欄位對照表）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - 準備一筆來源資料，各關鍵欄位有已知值：
    - `CUSTO_NO = 'C000012345'`、`ASSIGNDAY = '20250401'`、`PAYT_TERM = 12`、`DEAL_NUM = '24'`
    - `APPL_NO = 'T2024001'`（T 開頭，特例 DELETE 規則相關）、`SPEC_NAME = '小資優惠分期'`（含「小資」，特例規則相關）
    - `YEAR_PRODU = '2008'`（距今 > 15 年）、`MONTH_CNT = 3`、`LIST_NO = 'OB202605001'`、`ORGNO = 'OB01'`
    - `PAYT_NUM = 20`、`LIST_TYPE = '01'`
- **步驟**：
  1. 執行 ETL Load（含此筆資料，`ASSIGNDAY < currentMonthFirstDay`）
  2. 查詢 `ob_pool_data_list WHERE appl_no = 'T2024001'`，取得插入結果
  3. 逐欄位比對映射結果
- **預期結果**：
  - `custo_no = 'C000012345'`、`assignday = '20250401'`（yyyyMMdd 格式保持）
  - `payt_term = 12`（INTEGER）、`deal_num = '24'`（NUMERIC → entity `string | null`）
  - `appl_no = 'T2024001'`、`spec_name = '小資優惠分期'`
  - `year_produ = '2008'`、`month_cnt = 3`、`list_no = 'OB202605001'`、`orgno = 'OB01'`
  - `payt_num = 20`、`list_type = '01'`
  - `data_source = 'etl_load'`（v2.0 單一值，自動填入）
  - `data_source` 欄不出現於 `fieldMappings` 的來源對映（非來自 legacy 欄位）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-ETL-005（v1.0 維持）：ETL fullMode 安全護欄 — 不可使用 TRUNCATE

> 不受 v2.0 影響，定義與 v1.0 完全相同。
> 注意：v2.0 改為全量 `DELETE FROM ob_pool_data_list`（非 TRUNCATE），fullMode 護欄場景驗證的是「Engine 層不用 TRUNCATE」，與應用層 SQL DELETE 不衝突。

---

## 四、月跑不再寫入本表（v2.0 Regression 群組）

> **設計依據**：F090 v2.0 AC-3（「本表不再有月跑提案資料需保護」）；AD-E07-25 §25.1 / §25.3；F094（月跑改寫 `ob_monthly_run_result`）

---

### TS-F090-RGv2-001：月跑 Stage 1 不再寫入 ob_pool_data_list（regression guard）

- **關聯需求**：F090 v2.0 AC-3（「月跑改寫 F094 `ob_monthly_run_result`」）；AD-E07-25 DP-AD25-1 / §25.7 Phase A；F094 AC-2
- **測試類型**：Regression / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_pool_data_list` 初始含 3 筆 `data_source = 'etl_load'`（ETL 歷史，不應被改動）
  - `ob_monthly_run_result` 表已建立（F094 migration m292 已執行）
  - 月跑 Stage 1（`AssignmentRunPipelineService.runStage1ForList` / `executeStage1Chain({ dryRun: false })`）已依 F094 修改寫入目標
- **步驟**：
  1. 執行月跑 Stage 1 對某名單（seed 足夠的 `ob_pool_data` 案件）
  2. 查詢 `ob_pool_data_list WHERE data_source = 'etl_load'`，統計筆數（應不變）
  3. 查詢 `ob_pool_data_list WHERE data_source = 'monthly_run'`，統計筆數（應為 0）
  4. 查詢 `ob_monthly_run_result`，確認月跑提案寫入此表
- **預期結果**：
  - `ob_pool_data_list` 中 `'etl_load'` 仍為 3 筆（未受月跑影響）
  - `ob_pool_data_list` 中**不存在** `data_source = 'monthly_run'` 的列（regression guard）
  - `ob_monthly_run_result` 含當次月跑的提案列（run_id 對應）
- **DB 需求**：PostgreSQL TestContainer
- **關聯**：與 F094 TS-F094-ST1-001 聯合驗收

---

### TS-F090-RGv2-002：去重查詢來源僅 etl_load（單源化後語意清晰）

- **關聯需求**：F090 v2.0 BR-5（「去重查詢不加 `data_source` 過濾，涵蓋本表全量，單源化後等同 etl_load」）；F091 v2.0 AC-2
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_pool_data_list` seed：
    - `custo_no = 'CE001'`，`data_source = 'etl_load'`，`assignday = '20260401'`（在去重視窗內）
    - `custo_no = 'CN001'`，`data_source = NULL`（v1.0 殘留，DP-AD25-5 自然淘汰前尚存），`assignday = '20260420'`
  - `workdt = new Date('2026-06-01')`；視窗 `assigndayStart='20260301'`、`assigndayEnd='20260531'`（或動態計算）
  - pool 含 2 筆：`custo_no = 'CE001'`（應被去重）、`custo_no = 'CX001'`（不在去重集合）
- **步驟**：
  1. 執行去重查詢（真實 PostgreSQL，不加 `data_source` 過濾）
  2. 確認去重集合含 `'CE001'`（etl_load）與 `'CN001'`（NULL 殘留，仍在視窗內）
  3. 執行 filter 後驗證 pool
- **預期結果**：
  - 去重集合大小 = 2（`'CE001'` 和 `'CN001'` 均被納入，不加 data_source 過濾）
  - pool filter 後 `'CE001'` 被排除，`'CX001'` 保留
  - 去重 SQL **不含** `AND data_source = ...`（regression guard）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-RGv2-003：Grep guard — 原始碼不含 'etl_legacy' 作為插入值

- **關聯需求**：F090 v2.0 AC-3（「所有 ETL 插入列 `data_source = 'etl_load'`」）；DP-AD25-1
- **測試類型**：Regression / Unit（靜態 grep）
- **測試層**：Unit（原始碼靜態分析）
- **前置條件**：`e07-etl-config.json`、`ob-pool-data-list.entity.ts`、相關 service / pipeline 原始碼已依 v2.0 更新
- **步驟**：
  1. 在 `scripts/e07-etl-config.json` 與 ETL Load 相關原始碼中 grep `'etl_legacy'`
  2. 確認**不存在** `data_source = 'etl_legacy'` 或 `'etl_legacy'` 作為插入值的使用
  3. 確認存在 `data_source = 'etl_load'` 或 `'etl_load'` 作為 ETL 插入值
- **預期結果**：
  - `'etl_legacy'` 在 ETL Load 相關程式碼中不作為插入值（僅可出現於 migration / entity 的歷史值說明）
  - `'etl_load'` 確實作為 ETL 插入標記存在
- **DB 需求**：無（靜態分析）

---

## 五、v1.0 廢棄場景聲明

以下 v1.0 場景已廢棄，**不應實作或執行**：

| 廢棄場景 | 廢棄原因 | v2.0 替代 |
|---|---|---|
| TS-F090-ETL-002（DELETE 不傷 monthly_run）| v2.0 全量 DELETE，月跑資料已改寫 F094 | TS-F090-ETL-002v2（全量 DELETE 合法）|
| TS-F090-MON-001（月跑標記 'monthly_run'）| 月跑不再寫入本表（F094）| TS-F090-RGv2-001（regression guard）|
| TS-F090-MON-002（月跑不傷 etl_legacy 列）| 同上 | 同上 |
| TS-F090-MON-003（去重聯集 etl_legacy + monthly_run）| 單源化後無 monthly_run 來源 | TS-F090-RGv2-002（單源化去重驗證）|

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F090-MIG-001~002（migration up/down）| 高（需 PG TC）| 與 v2.0 無關（migration v1.0 已建立）|
| TS-F090-MIG-003（SQLite no-op）| 高 | 靜態分析，無 DB |
| TS-F090-ENT-001v2~002（entity 靜態）| 高 | TypeORM metadata + JSDoc 驗證 |
| TS-F090-ETL-001v2~004v2（ETL Load 行為）| 高（需 PG TC）| 歷史限定 `ASSIGNDAY` + 全量 DELETE + `etl_load` 標記 |
| TS-F090-ETL-005（fullMode 護欄）| 高 | 靜態 grep，無 DB |
| TS-F090-RGv2-001（月跑不再寫入）| 高（需 PG TC）| 需 F094 migration 配套；與 F094 TS 聯合驗收 |
| TS-F090-RGv2-002（去重單源化）| 高（需 PG TC）| 真實 PostgreSQL SQL 驗證 |
| TS-F090-RGv2-003（Grep etl_legacy）| 高 | 靜態 grep，無 DB |
