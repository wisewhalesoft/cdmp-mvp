---
spec-id: F090
title: OBPOOLDATA_LIST ETL 載入與 data_source 標記
feature-id: F090
source-story: US-133
epic: E07
module: M04 分派執行（Stage 1 精確化工程 Phase 1）
priority: P0-MVP
version: "2.0"
date: 2026-05-27
status: Draft
---

# F090: OBPOOLDATA_LIST ETL 載入與 data_source 單源化標記（Stage 1 精確化 Phase 1 / Phase B 單源化）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-27

> **v2.0（2026-05-27 / AD-E07-25 ob_pool_data_list 單源化）**：依 [architecture-spec.md AD-E07-25 v1.1](../architecture-spec.md)（全 DP Resolved）落地「`ob_pool_data_list` 回歸 ETL 單一來源」。核心變更：
> 1. **`data_source` 值域單源化**（DP-AD25-1 方案 A）：值域由 `'etl_legacy'` / `'monthly_run'` 雙值改為**單一值 `'etl_load'`**。`ob_pool_data_list` 自此**只承載 ETL 載入之 legacy 派案歷史**，不再混入本系統月名單分派提案；月名單分派提案結果改寫入新表 **`ob_monthly_run_result`**（見 [F094](F094-monthly-run-result-table.md)）。migration `1711360000291` 已存在（v1.0 建立），**v2.0 不新建 migration，僅更新應用層值域說明 + entity 註記**。
> 2. **ETL Load 刪除邊界放寬**（AD-E07-25 §25.3）：因本表不再有月名單分派資料需保護，`E07-OBPOOLDATA_LIST-Load` 之前置 DELETE 可改全量 `DELETE FROM ob_pool_data_list`（或維持 `DELETE WHERE data_source='etl_load'`，二者等效，因表內僅此一值）。
> 3. **既有 `monthly_run` / NULL 資料自然淘汰**（DP-AD25-5）：不需額外 data migration；待下次 ETL 全量覆寫自動清除。
>
> **Phase 對應**：`data_source` 值域 + 去重來源單源化屬 **Phase B**（[AD-E07-25 §25.7](../architecture-spec.md)）；月名單分派寫入目標切換至 `ob_monthly_run_result` 屬 **Phase A**（見 [F094](F094-monthly-run-result-table.md)，與 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 同批 deploy）。本 feature 之 v2.0 變更（值域說明 + Load 邊界放寬）可隨 Phase A/B 任一批落地，因表語意以 F094 完成「月名單分派不再寫入本表」為前提。
>
> **v1.0.1（2026-05-26 / 歷史限定過濾欄位修正）**：實作發現來源表 `OBPOOLDATA_LIST` **無 `PROJECT_WORKYM` 欄位**（`PROJECT_WORKYM` 係名單定義表 `OBMLISTDF` 之欄位），其唯一可用之時間欄為 `ASSIGNDAY`（派案日，yyyyMMdd 字串）。故歷史限定過濾條件由 `WHERE PROJECT_WORKYM < 本月` 修正為 **`WHERE ASSIGNDAY < 本月第一天 (yyyyMMdd)`**（`本月第一天 = WORKYM + '01'`）。此修正源於源表 schema 事實、已與 AD-E07-21 同步裁示。影響段落：AC-3、§5.2 Load Pipeline 表、BR-1、§7 錯誤場景、§8.1 / A-3。**其餘設計不變。**
>
> **v1.0（2026-05-26 / Stage 1 精確化工程 Phase 1）**：本 feature 為「Stage 1 精確化工程」三階段交付之第一階段（F090 → F091 → F092），依 [architecture-spec.md AD-E07-21 v1.1](../architecture-spec.md)（全部 DP 已 Resolved）落地。核心目標：比照 `ob_pool_data` 既有雙層 ETL（E04 Extract + E05 Pipeline Load），為 legacy 派案歷史表 `OBPOOLDATA_LIST` 建立 ETL，使 `ob_pool_data_list` 取得歷史派案紀錄，供 F091 Phase 2「近 3 個月去重」查詢使用；並引入 `data_source` 欄解決「ETL 歷史」與「本系統月名單分派輸出」共存於同一表的衝突。
>
> **Phase 邊界**：本 feature **僅交付 ETL 建立 + schema 變更**，不改變月名單分派 Stage 1 篩選行為（Stage 1 補完整為 F091）。依 [AD-E07-24 §24.2](../architecture-spec.md)，Phase 1 交付**不影響 production 月名單分派**（Stage 1 此時尚未讀取 `ob_pool_data_list` 去重）。
>
> **刻意未動（邊界）**：本 feature 不變更 `architecture-spec.md`（AD-E07-21 為權威來源，由 system-architect 維護）、不變更 `data-model.md`（`data_source` 欄已由 system-architect 於 data-model.md v1.15 寫入）；不撰寫 code / test（由 tdd-implementation 落地）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [architecture-spec.md AD-E07-21](../architecture-spec.md) + `data-model.md`（`ob_pool_data_list` 欄位表 v1.15）+ `scripts/e07-etl-config.json`（E07-OBPOOLDATA 範本）+ `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（欄位映射 ground truth） |
| QA / Tester | 本文件 + [error-handling.md#assignment-errors](../error-handling.md#assignment-errors) |
| Architect | 本文件 + [architecture-spec.md AD-E07-21 / AD-E07-24](../architecture-spec.md) |
| DevOps | 本文件（§5 ETL 設定 + §9 執行頻率） |

---

## 1. 功能摘要

為 legacy 派案歷史表 `OBPOOLDATA_LIST` 建立雙層 ETL（E04 Extract + E05 Pipeline Load），將舊 OB DB 的歷史派案紀錄載入本系統的 `ob_pool_data_list`，並以 `data_source VARCHAR(20) NULL` 欄位標記 ETL 批次。

> **v2.0 單源化（AD-E07-25）**：`ob_pool_data_list` 自 v2.0 起為 **ETL 單一來源**，只承載 legacy 派案歷史，`data_source` 值域單一化為 `'etl_load'`。本系統月名單分派提案結果改寫入 `ob_monthly_run_result`（[F094](F094-monthly-run-result-table.md)），不再與 ETL 歷史混存於本表（消除 v1.0 雙重角色設計之語意污染）。

此歷史資料是 [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)「近 3 個月已派案去重」步驟的查詢來源；在 F090 完成前，去重查詢永遠回空集合（`ob_pool_data_list` 現為 0 筆 legacy 歷史），導致大量已派案件無法被過濾。

## 2. 使用者故事

**As a** 系統管理者 / 分派維運人員
**I want** 將舊 OB 系統的歷史派案紀錄（`OBPOOLDATA_LIST`）透過 ETL 載入本系統，並可靠地與本系統月名單分派輸出共存
**So that** 月名單分派 Stage 1（F091）的近 3 個月去重查詢能讀到真實的歷史派案資料，避免重複派案

## 3. 前置條件

- migration m111（`ob_pool_data_list` 表）已存在（[data-model.md](../data-model.md)）
- E04 擷取引擎與 E05 Pipeline 引擎可用（[architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）
- Datasource `APYHFC16.OB` 已建立（`scripts/e07-etl-config.json` `datasourceRef`）
- 舊 OB DB 之 `dbo.OBPOOLDATA_LIST` 表可被擷取

## 4. 驗收標準

### AC-1：新增 `data_source` 欄位（migration + entity）

- **Given** `ob_pool_data_list` 表與 entity 既有定義
- **When** migration `1711360000291-AddObPoolDataListDataSource` 執行
- **Then** `ob_pool_data_list` 含欄位 `data_source VARCHAR(20) NULL`（**v2.0 值域單一化為 `'etl_load'`**；舊值域 `'etl_legacy'` / `'monthly_run'` / NULL 為 Phase A 前過渡值，deploy 後廢止，DP-AD25-1）
- **And** 索引 `idx_ob_pool_data_list_data_source ON ob_pool_data_list (data_source)` 已建立（v1.0；ETL DELETE 用）
- **And** entity `ob-pool-data-list.entity.ts` 之 `@Column({ name: 'data_source', type: 'varchar', length: 20, nullable: true }) data_source: string | null;` 註記更新為「值域 `'etl_load'`（單一來源 ETL 批次標記，AD-E07-25 DP-AD25-1）」
- **And**（資料相容）migration 前既有資料之 `data_source` 為 `NULL` 或舊值 `'monthly_run'` → **自然淘汰**（DP-AD25-5），待下次 ETL 全量覆寫清除；去重查詢不依賴 `data_source` 過濾（見 AC-5 / [F091 BR-3](F091-stage1-complete-month-cnt-dedup-special-delete.md)），故不影響去重正確性
- **And** **v2.0 不新建 migration**：`1711360000291` 已於 v1.0 建立；值域單一化僅為應用層說明變更（DP-AD25-1）

> **[ASSUMPTION] A-1**：`data_source` 之 migration 命名（`1711360000291-AddObPoolDataListDataSource`）、欄位定義、索引由 [AD-E07-21 §21.3](../architecture-spec.md) 拍板；v2.0 值域單一化為 `'etl_load'` 由 [AD-E07-25 DP-AD25-1](../architecture-spec.md) 拍板，本 feature 引用其權威定義；`data-model.md` v1.15（含 AD-E07-25 註記）已同步（系統架構師維護）。

### AC-2：建立 E04 擷取任務 `E07-OBPOOLDATA_LIST-Extract`

- **Given** `scripts/e07-etl-config.json` 既有 `E07-OBPOOLDATA-Extract` 範本
- **When** 比照建立 `E07-OBPOOLDATA_LIST-Extract` 擷取任務
- **Then** 擷取任務設定為：`datasourceName: 'APYHFC16.OB'`、`sourceSchema: 'dbo'`、`sourceTable: 'OBPOOLDATA_LIST'`、`mode: 'full'`
- **And** 該任務執行後，raw 資料表載入舊 OB DB 之 `OBPOOLDATA_LIST` 全量資料

### AC-3：建立 E05 Pipeline `E07-OBPOOLDATA_LIST-Load`（非 fullMode，歷史限定）

- **Given** AC-2 之 raw 擷取資料可用
- **When** 比照 `E07-OBPOOLDATA-Load` 建立 `E07-OBPOOLDATA_LIST-Load` Pipeline
- **Then** Pipeline 設定為：`extractionTaskName: 'E07-OBPOOLDATA_LIST-Extract'`、`targetTable: 'ob_pool_data_list'`、**非 `fullMode`（不可 TRUNCATE 全表）**
- **And** Pipeline Load 節點僅載入 **`ASSIGNDAY < 本月第一天 (yyyyMMdd)`** 之歷史記錄（DP-AD21-1 歷史限定；SELECT 加 `WHERE ASSIGNDAY < :currentMonthFirstDay` 過濾，排除本月資料以消除與月名單分派並發衝突）
- **And**（schema 事實修正）來源表 `OBPOOLDATA_LIST` **無 `PROJECT_WORKYM` 欄位**（`PROJECT_WORKYM` 係 `OBMLISTDF` 名單定義表之欄位）；`OBPOOLDATA_LIST` 唯一可用之時間欄為 `ASSIGNDAY`（派案日，yyyyMMdd 字串）。故歷史限定過濾改以 `ASSIGNDAY < 本月第一天 (yyyyMMdd)` 達成（與 AD-E07-21 同步裁示）。`本月第一天` = `WORKYM + '01'`（如 `'20260501'`）
- **And**（**v2.0 單源化**）Load 前置 DELETE 採全量 `DELETE FROM ob_pool_data_list`（或等效 `DELETE WHERE data_source='etl_load'`，因單源化後表內僅此一值），再批次 INSERT，**所有 ETL 插入列 `data_source = 'etl_load'`**（AD-E07-25 §25.3）
- **And**（v2.0）本表不再有月名單分派提案資料需保護（月名單分派改寫 [F094](F094-monthly-run-result-table.md) `ob_monthly_run_result`），故無需 v1.0 之 per-`data_source` 保護性截斷；既有殘留 `'monthly_run'` / NULL 列由全量覆寫自然淘汰（DP-AD25-5）

### AC-4：欄位映射對照 SP INSERT 清單

- **Given** SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 之 INSERT 欄位清單（SP L120~L140）與 `ob-pool-data-list.entity.ts`
- **When** 設定 `E07-OBPOOLDATA_LIST-Load` 之 `fieldMappings`
- **Then** 欄位映射涵蓋 [AD-E07-21 §21.4](../architecture-spec.md) 欄位對照表所列來源欄位（`LIST_NO` / `ORGNO` / `APPL_NO`（PK 三欄）/ `CUSTO_NO` / `MONTH_CNT` / `YEAR_CNT` / `SETTLE_SRC` / `ASSIGNDAY` / `SPEC_TP` / `PAYT_TERM` / `DEAL_NUM` / `PAYT_NUM` / `SPEC_NAME` / `YEAR_PRODU` / `LIST_TYPE` 等），命名規範 snake_case（如 `LIST_NO` → `list_no`）
- **And** F091「特殊 DELETE」與「近 3 個月去重」所需欄位（`assignday` / `custo_no` / `payt_term` / `deal_num` / `payt_num` / `spec_name` / `appl_no` / `year_produ` / `month_cnt`）均完整映射且非全空（§21.4 已確認 entity 全部存在）
- **And** `data_source` 為本系統新增欄位（非 legacy 來源欄位），由 Load 策略自動填 `'etl_legacy'`，不出現在 `fieldMappings` 之來源對映中（見 AC-3）

### AC-5：月名單分派 Stage 1 寫入目標改為 `ob_monthly_run_result`（v2.0 單源化）

- **Given** 月名單分派 Stage 1（`AssignmentRunPipelineService`）寫入本月分派提案
- **When** 月名單分派為某 `list_no` 寫入本月分派結果
- **Then**（**v2.0 變更**）月名單分派寫入目標改為 **`ob_monthly_run_result`**（見 [F094](F094-monthly-run-result-table.md)），**不再寫入 `ob_pool_data_list`**（AD-E07-25 §25.2）
- **And** `ob_pool_data_list` 自此為純 ETL 單一來源（僅 `data_source='etl_load'`），不含月名單分派提案
- **And** 去重查詢（[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)）讀 `ob_pool_data_list` 時**不加 `data_source` 過濾**（單源化後本即僅 `'etl_load'`，語意更清晰；[AD-E07-25 §25.3](../architecture-spec.md)）

> **Phase 邊界提示**：AC-5 之「月名單分派寫入目標切換至 `ob_monthly_run_result`」屬 **Phase A**（資料落點切換，與 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 同批 deploy），其完整資料契約（schema / pipeline 寫入 / Stage 3/4 讀取切換）見 [F094](F094-monthly-run-result-table.md)。本 feature（F090）之 ETL 載入與去重來源單源化屬 Phase 1 / Phase B；F090 ETL 本身不影響 production 月名單分派案件數（去重讀取行為屬 F091 Phase 2）。

## 5. ETL 設定（`scripts/e07-etl-config.json` 擴充）

> 比照既有 `E07-OBPOOLDATA-Extract` / `E07-OBPOOLDATA-Load` 範本（同檔案）。實際 `fieldMappings` 完整清單依 §21.4 對照表 + entity 欄位產出。

### 5.1 Extract 任務

| 欄位 | 值 |
|---|---|
| `name` | `E07-OBPOOLDATA_LIST-Extract` |
| `datasourceName` | `APYHFC16.OB` |
| `sourceSchema` | `dbo` |
| `sourceTable` | `OBPOOLDATA_LIST` |
| `mode` | `full` |
| `schedule` | `[ASSUMPTION] A-2` — 月名單分派前手動執行為主（建議 `0 1 1 * *`，月名單分派 02:00 前先抓；最終排程由 DevOps 與業務確認，見 §9） |

### 5.2 Load Pipeline

| 欄位 | 值 |
|---|---|
| `name` | `E07-OBPOOLDATA_LIST-Load` |
| `extractionTaskName` | `E07-OBPOOLDATA_LIST-Extract` |
| `targetTable` | `ob_pool_data_list` |
| `fullMode` | `false`（**不於引擎層 TRUNCATE 重建表**，見 AC-3 / BR-3） |
| Load 過濾 | `WHERE ASSIGNDAY < :currentMonthFirstDay`（歷史限定，DP-AD21-1；`本月第一天 = WORKYM + '01'` yyyyMMdd。**schema 事實**：來源表無 `PROJECT_WORKYM`，唯一時間欄為 `ASSIGNDAY`，見 AC-3） |
| Load 前置 DELETE | **（v2.0）** 全量 `DELETE FROM ob_pool_data_list`（或等效 `DELETE WHERE data_source='etl_load'`）；本表不再有月名單分派提案需保護（AD-E07-25 §25.3） |
| 插入列 `data_source` | **（v2.0）** 固定 `'etl_load'`（單一值）|
| `fieldMappings` | 依 §21.4 對照表（snake_case 映射，涵蓋 PK 三欄 + 去重 / 特例 DELETE 所需欄位） |

> **[ASSUMPTION] A-3**：`E07-OBPOOLDATA_LIST-Load` 因採「歷史限定 + 全量前置 DELETE」之客製化 Load 策略，**與既有 `fullMode: true`（引擎 TRUNCATE）行為不同**。此客製 Load 行為（`ASSIGNDAY < 本月第一天 (yyyyMMdd)` 過濾 + 前置全量 DELETE + 插入列填 `'etl_load'`）之引擎落地方式（既有 Pipeline 引擎是否支援，或需新增 Load mode）由 tdd-implementation 依 [AD-E07-21 §21.3](../architecture-spec.md) 與 E05 引擎現況決定；本 feature 定義對外行為契約。

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **歷史限定**（DP-AD21-1）：ETL 僅載入 `ASSIGNDAY < 本月第一天 (yyyyMMdd)` 之記錄，完全排除本月資料，消除與月名單分派的並發 race condition。**schema 事實修正**：來源表 `OBPOOLDATA_LIST` 無 `PROJECT_WORKYM` 欄位（該欄屬 `OBMLISTDF`），唯一時間欄為 `ASSIGNDAY`，故以 `ASSIGNDAY` 作歷史限定過濾（與 AD-E07-21 同步裁示） |
| BR-2 | **單一來源（v2.0，AD-E07-25 §25.2）**：`ob_pool_data_list` 自 v2.0 起**僅承載 ETL 歷史派案紀錄**（去重查詢用），`data_source` 值域單一化 `'etl_load'`。本系統月名單分派提案結果改寫入 `ob_monthly_run_result`（[F094](F094-monthly-run-result-table.md)），不再混存於本表（消除 v1.0 雙重角色之語意污染）|
| BR-3 | **ETL Load 不可全表 TRUNCATE（但前置 DELETE 可全量）**：`E07-OBPOOLDATA_LIST-Load` 之 `fullMode` 仍應為 `false`（避免引擎層 TRUNCATE 重建表結構/索引）；前置 DELETE 自 v2.0 可全量 `DELETE FROM ob_pool_data_list`（或 `DELETE WHERE data_source='etl_load'`，等效），因本表不再有月名單分派提案需保護 |
| BR-4 | **月名單分派寫入目標切換（v2.0）**：月名單分派 Stage 1 寫入目標改為 `ob_monthly_run_result`（[F094](F094-monthly-run-result-table.md)），不再寫入 `ob_pool_data_list`；本表不再被月名單分派寫入 |
| BR-5 | **去重查詢單源（v2.0）**：近 3 個月去重查詢（[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)）讀 `ob_pool_data_list WHERE assignday BETWEEN :start AND :end`，**不加 `data_source` 過濾**；單源化後本表僅 `'etl_load'`，語意清晰；殘留 NULL / `'monthly_run'` 舊列由全量覆寫自然淘汰（DP-AD25-5）|
| BR-6 | **ETL 不於月名單分派進行中執行**：ETL（全量 DELETE + INSERT）不應與月名單分派並發，避免讀寫干擾；月名單分派前手動完成 ETL（§9） |

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| ETL 載入與月名單分派同時操作 | 本設計以「歷史限定（`ASSIGNDAY < 本月第一天`）」+ v2.0 月名單分派改寫 `ob_monthly_run_result`（不再寫本表）消除衝突（BR-1 / BR-4）；理論上不再發生 | [AD-E07-25 §25.2](../architecture-spec.md) |
| 殘留舊 `'monthly_run'` / NULL 列未清除 | v2.0 預期由全量前置 DELETE 自然淘汰（DP-AD25-5）；不需額外 data migration；去重不依賴 `data_source` 過濾故不影響正確性 | [AD-E07-25 §25.8 DP-AD25-5](../architecture-spec.md) |
| `OBPOOLDATA_LIST` 來源無 `data_source` 欄 | 預期行為：來源無此欄，Load 策略自動填 `'etl_load'`（AC-4 / AC-3） | — |
| ETL 載入後 `assignday` 格式與去重查詢不一致 | `assignday` 為 `VARCHAR(100)`，字串比對須與 ETL 載入格式一致（yyyyMMdd）；格式不一致將致 F091 去重 miss（見 F091 OQ） | [AD-E07-22 §22.3](../architecture-spec.md) |

## 8. 資料契約 / Schema 變更

### 8.1 migration `1711360000291-AddObPoolDataListDataSource`

```sql
-- up()
ALTER TABLE ob_pool_data_list ADD COLUMN data_source VARCHAR(20) NULL;
CREATE INDEX idx_ob_pool_data_list_data_source ON ob_pool_data_list (data_source);

-- down()
DROP INDEX idx_ob_pool_data_list_data_source;
ALTER TABLE ob_pool_data_list DROP COLUMN data_source;
```

> TypeORM 實作注意：依專案慣例，DB_TYPE 分支（PostgreSQL / SQLite）由 tdd-implementation 處理；entity 與 migration 須保持一致（entity header 註記「任一邊改動，另一邊同步修」）。

### 8.2 entity 變更（`ob-pool-data-list.entity.ts`）

```typescript
@Column({ name: 'data_source', type: 'varchar', length: 20, nullable: true })
data_source: string | null;
```

### 8.3 `data_source` 值域

| 值 | 語意 | 寫入者 | 狀態 |
|---|---|---|---|
| `'etl_load'` | **（v2.0 唯一值）** ETL 載入的 legacy 派案歷史（單一來源批次標記） | `E07-OBPOOLDATA_LIST-Load` | 現行（AD-E07-25 DP-AD25-1）|
| ~~`'etl_legacy'`~~ | ~~ETL 載入的 legacy 派案歷史~~ | ~~`E07-OBPOOLDATA_LIST-Load`~~ | **廢止（v1.0 過渡值）** |
| ~~`'monthly_run'`~~ | ~~本系統月名單分派 Stage 1 寫入的本月分派結果~~ | ~~月名單分派（v1.0）~~ | **廢止（月名單分派改寫 `ob_monthly_run_result`，[F094](F094-monthly-run-result-table.md)）** |
| `NULL` | migration 前既有資料 | — | 自然淘汰（DP-AD25-5）|

## 9. ETL 執行頻率與月名單分派前置條件

| 時機 | 操作 |
|---|---|
| 月名單分派前（月初手動）| 執行 `E07-OBPOOLDATA_LIST-Extract` + `E07-OBPOOLDATA_LIST-Load`，確保去重歷史最新 |
| 月名單分派執行（Stage 1）| **（v2.0）** 寫入 `ob_monthly_run_result`（[F094](F094-monthly-run-result-table.md)），**不再寫入 `ob_pool_data_list`** |

> **注意**：ETL 不應於月名單分派進行中執行（避免讀寫干擾）。月名單分派前手動完成 ETL 後才啟動月名單分派（BR-6）。

## 10. 相依性

- **Blocked By**：migration m111（`ob_pool_data_list`）、E04 + E05 雙層 ETL 引擎、Datasource `APYHFC16.OB`
- **Blocks**：[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Phase 2 近 3 個月去重需此歷史資料）、[F092](F092-stage1-dry-run-estimate.md)（Phase 3 dry-run 去重精確度依賴）

## 11. 交叉參考

- 架構決策：[architecture-spec.md AD-E07-25 v1.1](../architecture-spec.md)（`ob_pool_data_list` 單源化 + `data_source='etl_load'` + 月名單分派改寫 `ob_monthly_run_result`，**權威來源**）、[AD-E07-21 v1.1](../architecture-spec.md)（OBPOOLDATA_LIST ETL 原始設計）、[AD-E07-24 §24.2](../architecture-spec.md)（Phase 影響）
- 資料模型：[data-model.md](../data-model.md)（`ob_pool_data_list` 欄位表 v1.15，含 `data_source` v2.0 值域 `'etl_load'` + AD-E07-25 註記；`ob_monthly_run_result` 新表，由系統架構師維護）
- 欄位映射 ground truth：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（SP L117~L140 INSERT 欄位清單）
- ETL 範本：`scripts/e07-etl-config.json`（`E07-OBPOOLDATA-Extract` / `E07-OBPOOLDATA-Load`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 相關功能：[F094](F094-monthly-run-result-table.md)（月名單分派改寫之結果表）、[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（去重來源）、[F092](F092-stage1-dry-run-estimate.md)、[F061](F061-trigger-assignment-run.md)（月名單分派觸發）

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | `data_source` migration 命名 / 欄位定義 / 索引由 AD-E07-21 §21.3 拍板；v2.0 值域單一化 `'etl_load'` 由 AD-E07-25 DP-AD25-1 拍板，data-model.md v1.15 已同步 | Resolved（引用 AD-E07-25） |
| A-2 | `E07-OBPOOLDATA_LIST-Extract` 排程（cron）由 DevOps 與業務確認；本 feature 預設「月名單分派前手動 / 月初定時」皆可，因 ETL 不可於月名單分派進行中執行（BR-6） | [ASSUMPTION] |
| A-3 | `E07-OBPOOLDATA_LIST-Load` 之「歷史限定 + 全量前置 DELETE」客製 Load 行為之引擎落地方式由 tdd-implementation 依 AD-E07-21 §21.3 + E05 引擎現況決定 | [ASSUMPTION] |

## 13. Production 影響標注

- **本 Phase（F090 ETL 建立 + 去重來源單源化）對 production 月名單分派案件數無影響**（[AD-E07-24 §24.2](../architecture-spec.md)）：F090 僅建立 ETL 與單源化 schema 語意；去重讀取行為屬 [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) Phase 2。
- **v2.0 之月名單分派寫入目標切換**（`ob_pool_data_list` → `ob_monthly_run_result`）屬 **Phase A** 結構變更，其 production 影響見 [F094 §13](F094-monthly-run-result-table.md)（與 [F091 v2.0 §13](F091-stage1-complete-month-cnt-dedup-special-delete.md) 同批 deploy）。
- 改變 production 月名單分派案件數的階段為 **F091（Stage 1 補完整 + 特例規則 SP 修正）**，依 DP-AD23-2 / DP-AD26-1 **無 feature flag、deploy 後直接生效**（詳見 [F091 §13](F091-stage1-complete-month-cnt-dedup-special-delete.md)）。
