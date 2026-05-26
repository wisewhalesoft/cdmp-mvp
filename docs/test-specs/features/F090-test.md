---
type: test-design-feature
feature_id: F090
feature_name: OBPOOLDATA_LIST ETL 載入與 data_source 標記
priority: P0-MVP
related_spec: /docs/specs/features/F090-obpooldata-list-etl.md
spec_version: "1.0"
covers:
  - F090
  - US-133
last_updated: 2026-05-26
---

# F090：OBPOOLDATA_LIST ETL 載入與 data_source 標記 — 測試設計

> **測試設計範圍（v1.0 / 2026-05-26）**：覆蓋 Stage 1 精確化工程 Phase 1 的 schema 變更（migration + entity）及 ETL 載入行為驗證。核心驗收方向：① migration m291 `data_source` 欄可逆；② ETL Load 歷史限定（`PROJECT_WORKYM < 本月`）、per-`data_source` 截斷不傷月跑資料；③ 月跑寫入標記 `'monthly_run'` 不傷 ETL 歷史；④ 欄位映射涵蓋 F091 去重 / 特殊 DELETE 所需欄位。
>
> **注意**：本 Phase（F090）對 production 月跑分派案件數**無影響**（[AD-E07-24 §24.2](../../../specs/architecture-spec.md)）。ETL 建立後月跑仍照舊，F091 才啟動去重過濾。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F090-obpooldata-list-etl.md` + `architecture-spec.md` AD-E07-21 §21.3~§21.4 + `ob-pool-data-list.entity.ts` + `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（SP L120~L140 欄位清單） |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Unit（pure function + schema 靜態驗證）、Integration（PostgreSQL TestContainer / SQLite no-op） |
| 關鍵依賴 | `ob-pool-data-list.entity.ts`（entity 欄位靜態驗證）；PostgreSQL TestContainer（migration up/down 行為、ETL Load 行為） |
| SQLite E2E 慣例 | migration 在 SQLite E2E 環境為 no-op（依既有慣例），不驗 SQLite 行為；migration up/down 需 PostgreSQL TestContainer |
| Mock 策略 | ETL Load Pipeline 行為需 mock E05 Pipeline 引擎（驗證 DELETE 順序）或直接對 PostgreSQL 做 seed + call + assert |

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F090-MIG-001~003 | 3 | 高（需 PG TC） | Integration | migration up/down + index；SQLite no-op 驗證 |
| TS-F090-ENT-001~002 | 2 | 高 | Unit（靜態） | entity @Column 屬性 + 型別驗證 |
| TS-F090-ETL-001~005 | 5 | 高（需 PG TC） | Integration | ETL Load 歷史限定 + DELETE 不傷月跑 + 欄位映射 |
| TS-F090-MON-001~003 | 3 | 高（需 PG TC） | Integration | 月跑寫入標記 'monthly_run' + 不傷 ETL 歷史 |

---

## 一、Migration 驗證（m291）

> **設計依據**：F090 AC-1；AD-E07-21 §21.3（migration 命名、欄位定義、索引）

---

### TS-F090-MIG-001：migration up() — 新增 data_source 欄與索引

- **關聯需求**：F090 AC-1；AD-E07-21 §21.3
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - PostgreSQL TestContainer 啟動
  - 已執行至 migration m111（`ob_pool_data_list` 表存在，但無 `data_source` 欄）
  - 尚未執行 migration m291
- **步驟**：
  1. 執行 migration `1711360000291-AddObPoolDataListDataSource` 的 `up()` 方法
  2. 查詢 information_schema.columns 確認欄位存在：`SELECT column_name, data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_name='ob_pool_data_list' AND column_name='data_source'`
  3. 查詢 information_schema.indexes 或 pg_indexes 確認索引存在：`SELECT indexname FROM pg_indexes WHERE tablename='ob_pool_data_list' AND indexname='idx_ob_pool_data_list_data_source'`
  4. 插入一筆 `data_source = NULL` 的測試資料（驗證 nullable）
  5. 插入一筆 `data_source = 'etl_legacy'` 與一筆 `data_source = 'monthly_run'` 的測試資料（驗證值域）
- **預期結果**：
  - `data_source` 欄存在，`data_type = 'character varying'`，`character_maximum_length = 20`，`is_nullable = 'YES'`
  - 索引 `idx_ob_pool_data_list_data_source` 存在
  - NULL、`'etl_legacy'`、`'monthly_run'` 三種值均可成功插入（無 CHECK constraint 阻擋）
  - migration 前既有資料之 `data_source` 為 NULL（舊列不受影響）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-MIG-002：migration down() — 移除 data_source 欄與索引（可逆驗證）

- **關聯需求**：F090 AC-1；BR-3（ETL Load 不可全表 TRUNCATE，down() 必須安全可逆）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - 已執行 up()（同 MIG-001 狀態後）
  - `ob_pool_data_list` 中含 `data_source` 為 `NULL`、`'etl_legacy'`、`'monthly_run'` 的資料各一筆
- **步驟**：
  1. 執行 migration m291 `down()` 方法
  2. 查詢 information_schema.columns 確認 `data_source` 欄已消失
  3. 查詢 pg_indexes 確認 `idx_ob_pool_data_list_data_source` 索引已消失
  4. 驗證 `ob_pool_data_list` 表本身仍存在（down 不應 DROP TABLE）
  5. 驗證既有列中非 `data_source` 的其他欄位資料完整無損（`list_no` / `appl_no` 等 PK 仍存在）
- **預期結果**：
  - `data_source` 欄不存在（query 回 0 rows）
  - `idx_ob_pool_data_list_data_source` 索引不存在
  - 表其他欄位資料完整
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-MIG-003：SQLite E2E 環境 no-op 慣例驗證

- **關聯需求**：F090 AC-1（「TypeORM 實作注意：DB_TYPE 分支由 tdd-implementation 處理」）；既有 SQLite no-op 慣例
- **測試類型**：Positive / Unit（靜態）
- **測試層**：Unit（原始碼結構分析）
- **前置條件**：migration `1711360000291-AddObPoolDataListDataSource` 實作完成
- **步驟**：
  1. 讀取 migration 原始碼，確認 `up()` 含 `if (this.dataSource.options.type === 'sqlite') return;`（或等效 DB_TYPE 分支）
  2. 確認 `down()` 含相同 SQLite 分支（對稱設計）
- **預期結果**：
  - migration 在 SQLite 環境下為 no-op（直接 return，不執行 ALTER TABLE）
  - 不含 `ALTER TABLE ob_pool_data_list ADD COLUMN data_source ...` 的 raw SQL（SQLite 無 DROP COLUMN 支援，故 no-op 必要）
- **DB 需求**：無（靜態原始碼分析）

---

## 二、Entity 欄位驗證

> **設計依據**：F090 AC-1（entity `@Column` 定義）；AD-E07-21 §21.3

---

### TS-F090-ENT-001：ob-pool-data-list.entity.ts — @Column data_source 屬性

- **關聯需求**：F090 AC-1（`@Column({ name: 'data_source', type: 'varchar', length: 20, nullable: true })`）
- **測試類型**：Positive / Unit（靜態）
- **測試層**：Unit（TypeORM metadata 反射或原始碼 grep）
- **前置條件**：`ob-pool-data-list.entity.ts` 已補入 `data_source` 欄位
- **步驟**：
  1. 直接讀取 entity 原始碼（或透過 TypeORM `getMetadataArgsStorage()`），確認 `data_source` property 存在
  2. 確認 `@Column` 裝飾器屬性：`name: 'data_source'`、`type: 'varchar'`（或 `character varying`）、`length: 20`、`nullable: true`
  3. 確認 TypeScript 宣告型別為 `string | null`（含 null）
- **預期結果**：
  - entity property `data_source: string | null` 存在
  - `@Column` metadata：`name='data_source'`、`length=20`、`nullable=true`
  - 不為 `@PrimaryColumn`、不為 `@Index`（index 由 migration 管理）
- **DB 需求**：無

---

### TS-F090-ENT-002：entity 與 migration 一致性（entity header 「任一邊改動，另一邊同步修」）

- **關聯需求**：F090 AC-1（entity 與 migration 須保持一致）；AD-E07-21 §21.3
- **測試類型**：Regression / Unit（靜態）
- **測試層**：Unit（原始碼雙向 grep）
- **前置條件**：entity 與 migration 均已實作
- **步驟**：
  1. 確認 `ob-pool-data-list.entity.ts` 的 `data_source` column 定義與 migration SQL `ADD COLUMN data_source VARCHAR(20) NULL` 語意一致（length=20、nullable）
  2. 確認 entity 不含 `@Column` 定義但 migration 未新增的欄位（防止 schema drift）
  3. 確認 entity header 或 JSDoc 含「任一邊改動，另一邊同步修」或等效提示
- **預期結果**：
  - entity length 為 20；migration `VARCHAR(20)`；兩者一致
  - 不存在 entity 有但 migration 無的 `data_source` 相關欄位定義
- **DB 需求**：無

---

## 三、ETL Load 行為驗證

> **設計依據**：F090 AC-2 / AC-3 / AC-4；AD-E07-21 §21.2 / §21.3

---

### TS-F090-ETL-001：歷史限定過濾 — 僅載入 PROJECT_WORKYM < 本月

- **關聯需求**：F090 AC-3（`WHERE PROJECT_WORKYM < :currentWorkym`）；AD-E07-21 DP-AD21-1
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer；模擬 ETL raw 來源資料）
- **前置條件**：
  - PostgreSQL TestContainer 啟動，migration 至 m291 已執行
  - 模擬 raw staging 資料（或直接 mock ETL Load 節點的 SELECT 查詢）：
    - 3 筆歷史資料：`PROJECT_WORKYM = '202503'`、`'202504'`、`'202504'`（均為本月前）
    - 2 筆本月資料：`PROJECT_WORKYM = '202605'`（即 currentWorkym）
    - 1 筆未來資料：`PROJECT_WORKYM = '202606'`
  - 設定 `currentWorkym = '202605'`
- **步驟**：
  1. 執行 ETL Load 節點（或等效 service method），帶入 `currentWorkym`
  2. 查詢 `ob_pool_data_list WHERE data_source = 'etl_legacy'`，統計筆數
  3. 確認插入資料的 `PROJECT_WORKYM` 值範圍
- **預期結果**：
  - `ob_pool_data_list` 中 `data_source = 'etl_legacy'` 的列共 3 筆（`'202503'` × 1 + `'202504'` × 2）
  - `PROJECT_WORKYM = '202605'` 的資料**不存在**於 `ob_pool_data_list`（本月資料被過濾）
  - `PROJECT_WORKYM = '202606'` 的資料**不存在**（未來資料被過濾）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-ETL-002：ETL Load 前置 DELETE 不傷 monthly_run 列

- **關聯需求**：F090 AC-3（`DELETE FROM ob_pool_data_list WHERE data_source = 'etl_legacy'`，不得清除 `'monthly_run'`）；BR-3 / BR-4
- **測試類型**：Negative / Integration（隔離驗證）
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - PostgreSQL TestContainer 啟動，`ob_pool_data_list` 預先 seed：
    - 10 筆 `data_source = 'etl_legacy'`（不同 `list_no`，含 `assignday`）
    - 5 筆 `data_source = 'monthly_run'`（模擬本系統月跑已寫入）
    - 3 筆 `data_source = NULL`（migration 前的既有資料）
- **步驟**：
  1. 執行 ETL Load（觸發前置 DELETE 後 INSERT 新 legacy 歷史）
  2. 查詢 `ob_pool_data_list WHERE data_source = 'monthly_run'`，統計筆數
  3. 查詢 `ob_pool_data_list WHERE data_source IS NULL`，統計筆數
  4. 查詢 `ob_pool_data_list WHERE data_source = 'etl_legacy'`，確認為新插入的歷史資料
- **預期結果**：
  - `data_source = 'monthly_run'` 仍有 5 筆（未被 DELETE 影響）
  - `data_source IS NULL` 仍有 3 筆（未被 DELETE 影響）
  - `data_source = 'etl_legacy'` 的舊 10 筆已刪除，取而代之為新 INSERT 的歷史資料
  - **不存在** `DELETE WHERE data_source = 'monthly_run'` 或 `DELETE WHERE list_no = :listNo` 的 ETL 操作行為（regression guard）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-ETL-003：ETL Load 插入列標記 'etl_legacy'

- **關聯需求**：F090 AC-3（「所有 ETL 插入列 `data_source = 'etl_legacy'`」）；AD-E07-21 §21.3
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_pool_data_list` 初始為空（或僅含 `monthly_run` 資料）
  - 準備 5 筆 `PROJECT_WORKYM < currentWorkym` 的 raw 來源資料（含 `custo_no`、`assignday`、`list_no` 等必要欄位）
- **步驟**：
  1. 執行 ETL Load
  2. 查詢 `SELECT data_source, COUNT(*) FROM ob_pool_data_list GROUP BY data_source`
  3. 從插入資料中隨機抽取一筆，確認 `data_source = 'etl_legacy'`
- **預期結果**：
  - 所有 ETL 插入列均為 `data_source = 'etl_legacy'`（無 NULL、無 `'monthly_run'`）
  - 插入筆數 = 來源資料筆數（無遺漏）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-ETL-004：欄位映射完整性 — 去重 / 特殊 DELETE 所需欄位非全空

- **關聯需求**：F090 AC-4；AD-E07-21 §21.4（欄位對照表，特別是 `custo_no` / `assignday` / `payt_term` / `deal_num` / `appl_no` / `spec_name` / `year_produ` / `month_cnt`）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer；mock 來源資料含具體值）
- **前置條件**：
  - 準備一筆來源資料（模擬 raw 表），各關鍵欄位有已知值：
    - `CUSTO_NO = 'C000012345'`
    - `ASSIGNDAY = '20250401'`（yyyyMMdd 字串，驗證格式）
    - `PAYT_TERM = 12`
    - `DEAL_NUM = '24'`
    - `APPL_NO = 'T2024001'`（以 T 開頭，特殊 DELETE 規則用）
    - `SPEC_NAME = '信貸滿期方案'`（含「滿」）
    - `YEAR_PRODU = '2008'`（距今 > 15 年）
    - `MONTH_CNT = 3`
    - `LIST_NO = 'OB202605001'`
    - `ORGNO = 'OB01'`
    - `PROJECT_WORKYM = '202504'`（歷史月份）
- **步驟**：
  1. 執行 ETL Load（含此筆資料）
  2. 查詢 `ob_pool_data_list WHERE appl_no = 'T2024001'`，取得插入結果
  3. 逐欄位比對映射結果
- **預期結果**：
  - `custo_no = 'C000012345'`
  - `assignday = '20250401'`（yyyyMMdd 格式保持，未被轉換為 DATE 型別）
  - `payt_term = 12`（INTEGER）
  - `deal_num = '24'`（NUMERIC → entity `string | null`）
  - `appl_no = 'T2024001'`
  - `spec_name = '信貸滿期方案'`
  - `year_produ = '2008'`
  - `month_cnt = 3`
  - `list_no = 'OB202605001'`
  - `orgno = 'OB01'`
  - `data_source = 'etl_legacy'`（自動填入）
  - `data_source` 欄不出現於 `fieldMappings` 的來源對映（非來自 legacy 欄位）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-ETL-005：ETL fullMode 安全護欄 — 不可使用 TRUNCATE

- **關聯需求**：F090 AC-3（`fullMode: false`，**關鍵**）；BR-3（「若誤用 `fullMode: true` 會清除月跑輸出」）
- **測試類型**：Negative / Unit（靜態）
- **測試層**：Unit（原始碼 / 設定檔靜態分析）
- **前置條件**：`E07-OBPOOLDATA_LIST-Load` Pipeline 設定（`scripts/e07-etl-config.json`）已實作
- **步驟**：
  1. 讀取 `scripts/e07-etl-config.json`，找到 `E07-OBPOOLDATA_LIST-Load` 項目
  2. 確認 `fullMode: false`（或等效設定）
  3. **Regression Guard**：確認設定中不存在 `fullMode: true`（防止未來誤改）
  4. 若 Pipeline 引擎有對應 integration test，確認 E07-OBPOOLDATA_LIST-Load 的 test fixture 亦為 `fullMode: false`
- **預期結果**：
  - `E07-OBPOOLDATA_LIST-Load.fullMode === false`
  - 不存在 `TRUNCATE ob_pool_data_list` 的 SQL 操作（grep 驗證）
- **DB 需求**：無（靜態分析）

---

## 四、月跑寫入標記驗證

> **設計依據**：F090 AC-5；AD-E07-21 §21.3（月跑 Stage 1 per-`list_no` × `data_source` 截斷）

---

### TS-F090-MON-001：月跑寫入標記 'monthly_run'

- **關聯需求**：F090 AC-5（「所有月跑插入列 `data_source = 'monthly_run'`」）；BR-4
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_pool_data_list` 初始為空
  - 月跑 Stage 1（`AssignmentRunPipelineService.runStage1ForList` 或等效 service）已修改支援 `data_source = 'monthly_run'`
  - 準備一個名單 `list_no = 'OB202605001'`，月跑 Stage 1 為此名單挑案後寫入
- **步驟**：
  1. 執行月跑 Stage 1 對 `list_no = 'OB202605001'`（seed 足夠的 ob_pool_data 案件）
  2. 查詢 `ob_pool_data_list WHERE list_no = 'OB202605001'`，取所有插入列
  3. 確認所有列的 `data_source` 值
- **預期結果**：
  - 所有月跑插入列 `data_source = 'monthly_run'`（無 NULL、無 `'etl_legacy'`）
  - 插入筆數 > 0（有實際案件寫入）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-MON-002：月跑 per-list_no 截斷不傷 etl_legacy 列

- **關聯需求**：F090 AC-5（「月跑寫入不得刪除 `data_source = 'etl_legacy'` 之列」）；BR-4
- **測試類型**：Negative / Integration（隔離驗證）
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_pool_data_list` 預先 seed：
    - 10 筆 `data_source = 'etl_legacy'`，其中 3 筆屬於 `list_no = 'OB202605001'`（歷史月份 ETL 資料）
    - 5 筆 `data_source = 'monthly_run'`，其中 2 筆屬於 `list_no = 'OB202605001'`（舊月跑資料，應被替換）
    - 8 筆 `data_source = 'etl_legacy'`，屬於其他 `list_no`（應完全不受影響）
- **步驟**：
  1. 執行月跑 Stage 1 對 `list_no = 'OB202605001'`（觸發 DELETE + INSERT）
  2. 查詢 `ob_pool_data_list WHERE data_source = 'etl_legacy'`，統計筆數
  3. 查詢 `ob_pool_data_list WHERE list_no = 'OB202605001' AND data_source = 'etl_legacy'`，統計筆數
  4. 查詢 `ob_pool_data_list WHERE list_no = 'OB202605001' AND data_source = 'monthly_run'`，統計筆數（應為新插入的月跑數）
- **預期結果**：
  - `data_source = 'etl_legacy'` 總計仍為 10 筆（ETL 歷史完全不受月跑影響）
  - `list_no = 'OB202605001' AND data_source = 'etl_legacy'` 仍為 3 筆
  - `list_no = 'OB202605001' AND data_source = 'monthly_run'` 的舊 2 筆已刪除，取而代之為本次月跑新插入的資料
  - 不存在 `DELETE WHERE list_no = :listNo`（不加 `data_source` 條件）的操作，即月跑 DELETE 精確只針對 `monthly_run`（**regression guard**）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F090-MON-003：去重查詢讀取 etl_legacy + monthly_run 聯集（不加 data_source 過濾）

- **關聯需求**：F090 AC-5 / BR-5（「去重查詢不加 `data_source` 過濾，涵蓋兩來源聯集」）；AD-E07-21 §21.6
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer；為 F091 去重前置驗證）
- **前置條件**：
  - `ob_pool_data_list` seed 同 MON-002 狀態後（含 `etl_legacy` + `monthly_run` + NULL 各類資料）
  - 設定去重視窗：`assigndayStart = '20250201'`；`assigndayEnd = '20250531'`
  - Seed 各來源的 `assignday` 均落在 `['20250201', '20250531']` 範圍內
  - Seed 各來源的 `custo_no` 各不相同（`etl_legacy` custo_no = `'CE001'`；`monthly_run` custo_no = `'CM001'`；NULL custo_no = `'CN001'`）
- **步驟**：
  1. 執行去重查詢：`SELECT DISTINCT custo_no FROM ob_pool_data_list WHERE assignday >= '20250201' AND assignday <= '20250531' AND custo_no IS NOT NULL`
  2. 確認結果集涵蓋三類來源
- **預期結果**：
  - 查詢結果包含 `'CE001'`（來自 `etl_legacy`）
  - 查詢結果包含 `'CM001'`（來自 `monthly_run`）
  - 查詢結果包含 `'CN001'`（來自 `data_source IS NULL` 的既有資料）
  - 查詢 SQL **不含** `AND data_source = ...` 過濾條件（regression guard：確認實作未誤加 data_source 過濾）
- **DB 需求**：PostgreSQL TestContainer
- **備註**：此案例是 F091 去重邏輯的前置驗證；F091 正式去重場景見 F091-test.md。

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F090-MIG-001~002（migration up/down） | 高（需 PG TC） | 需 PostgreSQL TestContainer；information_schema 查詢確認欄位 / 索引 |
| TS-F090-MIG-003（SQLite no-op） | 高 | 原始碼靜態分析；無 DB 依賴 |
| TS-F090-ENT-001~002（entity 靜態） | 高 | TypeORM metadata 反射或原始碼分析；無 DB 依賴 |
| TS-F090-ETL-001~004（ETL Load 行為） | 高（需 PG TC） | 需 PostgreSQL TestContainer + mock raw 來源；歷史限定過濾的邊界驗證（本月 / 前月 / 未來月）是關鍵 |
| TS-F090-ETL-005（fullMode 護欄） | 高 | 靜態 grep；無 DB 依賴 |
| TS-F090-MON-001~002（月跑標記） | 高（需 PG TC） | 需 PostgreSQL TestContainer + ob_pool_data seed（Stage 1 實際挑案） |
| TS-F090-MON-003（去重聯集） | 高（需 PG TC） | 直接執行 SQL 查詢；F091 前置驗證，建議與 F091 Integration suite 合併執行 |
