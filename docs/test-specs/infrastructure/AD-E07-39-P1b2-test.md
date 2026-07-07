---
type: test-design-infrastructure
test-spec-id: AD-E07-39-P1b2
feature_name: MSSQL 全面遷移 P1b2 — Prod Baseline Migration + Dev/Prod Parity 驗證
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-39-mssql-p1b-full-baseline.md（§6 schema 兩軌流程、§8 P1b2 DoD、§9 不變式 I-MSSQL-BASELINE-PARITY-01/COLLATE-01/CASE-01、§2 900-byte 掃描含 B1 token_hash）
  - /docs/specs/implementation-log/AD-E07-39-P1b1-impl.md（§5.6 本機 MSSQL 容器 sp_executesql 拋 17750 之測試基礎設施避讓，直接影響本輪 STATIC 群組）
  - /docs/specs/implementation-log/AD-E07-38-mssql-p1-driver-entity-schema.md（既有不變式 I-MSSQL-CASE-01/COLLATE-01 之原始定義）
covers: []
spec_version: "1.0"
date: 2026-07-07
last_updated: 2026-07-07
---

# AD-E07-39 P1b2：MSSQL 全面遷移 Prod Baseline Migration + Dev/Prod Parity 驗證 — 測試設計

> 本文件覆蓋 AD-E07-39「MSSQL 全面遷移 P1b（全 36 Entity Baseline）」之 **P1b2 切片**（prod 手寫 T-SQL baseline migration 產出 + dev/prod 兩軌結構化 parity 驗證）。
> P1（P1a/P1b/P1c）不經 spec-writer（AD-E07-38 §3 D-7 已裁定：純底層儲存/驅動置換，無新業務行為）；本文件依 system-architect 產出之 AD-E07-39 §6/§8/§9 直接產出測試設計，銜接 P1b1（`infrastructure/AD-E07-39-P1b1-test.md`，43 場景，已完成，全 entity 型別修正 + B1 + D1 + synchronize 全表建成）。
>
> **表數修正**：AD §6/§8 沿用「全 37 entity」用語，但 P1b1 impl log 已查證實際為 **36**（算術 off-by-one：14 未改 + 22 已改 = 36，非 23→37）。本文件全部計數斷言一律動態對齊 `entityMetadatas.length`／`ALL_ENTITIES.length`（= 36），不寫死 37，比照 P1b1 既有處置慣例。
>
> **範圍**：§6 步驟 2~5（synchronize 草稿 → 人工稽核 → 定案 prod baseline migration → dev/prod parity 比對腳本）；P1b1 impl log §5.6 caveat（本機 MSSQL 容器 `sp_executesql` 拋 17750）直接構成本輪 STATIC 群組的靜態守門依據。
> **明確排除**（分別由 P1b3/P1c 各自一棒設計）：bootstrap/seed 三支腳本改寫（`seed-datasource.ts`/`prod-data-seed.ts`/`seed.ts`，P1b3）／`sp_getapplock` 與 Pattern B（`$n`→named param，P1c，`I-MSSQL-LOCK-01`/`I-MSSQL-PARAM-01`）。P1b1 已完成之全 entity 型別修正/B1/D1 本輪不重複驗證，僅在必要處（HASH-BASELINE 群組）驗證其在**新路徑**（baseline migration）下同樣正確。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-39-mssql-p1b-full-baseline.md`（§6 兩軌流程步驟 2~5）+ `apps/api/src/database/data-source.ts`（CLI migration datasource，mssql 分支已由 P1a 加入，`migrations` glob 已存在）+ `apps/api/src/database/migrations/1711360000000-BaselineSchema.ts`（**僅供理解舊 PG baseline 檔案結構，不可直接複製其 SQL 語法**，pg_dump 產物含大量 PG-only 語法）+ `apps/api/src/database/__tests__/mssql-env-preload.ts`（gating helper，沿用）+ `apps/api/src/database/__tests__/mssql-p1b1.mssql.spec.ts`（`dropAllTablesInSchema` 之「JS 列舉 sys 目錄 + 逐句 plain DDL、不用 sp_executesql」模式，本輪 cleanup 邏輯須延伸此模式至 `dbo` schema） |
| DevOps / CI/CD | 本文件「零、測試環境與 Gating 設計 + 兩路徑 Harness 方案」章節（**核心交付**，含 `dbo` schema 保留慣例與權限約束說明） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P1b2 風險段落） |

---

## 零、測試環境與 Gating 設計 + 兩路徑 Harness 方案（★ 本文件核心交付）

### 0.1 沿用既有 gating helper 與資料庫，不新增基礎設施

沿用 P1a/P1b1 既有 `apps/api/src/database/__tests__/mssql-env-preload.ts`（`mssqlPortReachable()`/`restoreDbType()`/`SKIP_REASON`/`MSSQL` 連線常數）與 `CDMP_TEST` 資料庫，**不需要新資料庫、新 docker service、新 login**。連不上 MSSQL 容器 → 整檔 `describe.skip`，不假造綠燈（`feedback_mock_real_system_contract`）。

### 0.2 權限約束（已查證，非假設）：`cdmp` login 無法 `CREATE DATABASE`

查證 `docker/mssql-init.sql`：`cdmp` login 於 `CDMP`／`CDMP_TEST` 兩個資料庫皆僅被加入 **`db_owner`（資料庫層級角色）**，並**未**被授予任何伺服器層級角色（`dbcreator`/`sysadmin`）或 `CREATE ANY DATABASE` 權限。`db_owner` 角色成員資格**不**隱含 `CREATE DATABASE` 權限（後者是伺服器層級權限，與特定資料庫內的 `db_owner` 是兩件事）。

**結論**：本輪 parity harness **不得**採用「兩個獨立資料庫」方案（會因權限不足於真實 MSSQL 容器直接失敗，形同假造測試環境）；必須在**同一個 `CDMP_TEST` 資料庫**內以 **schema 區隔**兩條路徑（`db_owner` 有權 `CREATE SCHEMA`）。此為 P1a/P1b1 選擇 schema 隔離而非獨立 DB 的既有慣例延續，非本文件新創。

### 0.3 兩路徑 Harness 設計（回答任務要求「兩路徑 schema 如何各自建置以供比對」）

**核心洞察**：TypeORM 的 `schema` 連線選項只對「TypeORM 自己產生 DDL 的路徑」（`synchronize()`／`queryRunner.createTable()` 等結構化 API）生效，會自動把 schema 前綴進生成的 SQL。但 baseline migration 是**手寫的 raw SQL**（`queryRunner.query('CREATE TABLE token_blocklist (...)')`），TypeORM **不會**改寫這段字串裡的表名；它會直接落在**目前連線 session 的 default schema**（即 `dbo`，因 `mssql-init.sql` 建立 `cdmp` user 時未指定 `WITH DEFAULT_SCHEMA`，SQL Server 預設即 `dbo`——這也正是 prod 部署的真實情況：prod 的 `migration:run` 同樣會落在 `dbo`，因 `data-source.ts` 的 mssql 分支同樣未設定 `schema` 選項）。

利用此差異，兩路徑分工如下，**不需要任何 `ALTER USER ... WITH DEFAULT_SCHEMA` 之類的 session 層級 trick**：

| 路徑 | Schema | 建置方式 | 與 prod 的對應關係 |
|---|---|---|---|
| **A（synchronize）** | `p1b2_sync`（新建專屬 schema，比照 `p1a`/`p1b1` 慣例） | `new DataSource({...mssqlOptions('p1b2_sync'), entities: ALL_ENTITIES, synchronize: true})`，`schema:'p1b2_sync'` 連線選項使 TypeORM 自動把全部 DDL 前綴至該 schema | 對應「dev 環境跑 `synchronize:true`」 |
| **B（baseline migration）** | `dbo`（**不新建 schema，直接沿用資料庫預設 schema**） | 執行實際 baseline migration 的 `up(queryRunner)`（見 0.4 兩種呼叫方式），該檔案的 raw SQL 落在連線 session 的 default schema = `dbo` | 對應「prod 環境跑 `NODE_ENV=production` 下 `migration:run`」，**與實際部署路徑完全一致**（非模擬近似） |

**`dbo` schema 保留慣例（新增，須寫入命名鎖定）**：P1a/P1b1 既有測試套件（schema `p1a`／`p1b1`）與其他既有 `.mssql.spec.ts` 從未使用 `dbo`，故 `CDMP_TEST.dbo` 目前應為空。**本文件之 BASELINE/PARITY 群組獨佔使用 `dbo`**，`beforeAll` 須先斷言 `dbo` 目前為空（防止其他套件不慎污染或前次失敗殘留），`afterAll` 須清空回空（見 0.5），維持此 schema 對其餘測試套件的乾淨承諾。

### 0.4 Baseline Migration 的兩種呼叫方式（依群組分工使用，非二選一）

1. **字面 CLI 呼叫**（用於 BASELINE 群組，最貼近 AD §8 DoD #1 原文「`NODE_ENV=production` 下 `migration:run`」）：以子行程執行 `npm run migration:run`（實際呼叫 `apps/api/src/database/data-source.ts` 之 `AppDataSource`），透過環境變數將 `DB_HOST`/`DB_PORT`/`DB_NAME=CDMP_TEST`/`DB_TYPE=mssql`/`NODE_ENV=production` 指向測試容器；驗證行程 exit code、stdout 是否有 SQL 錯誤字樣。此法完整驗證「CLI 工具 + `data-source.ts` 設定 + migration 檔案」三者串接無誤，是唯一能忠實重現 prod 部署動作的呼叫方式。
2. **程式化呼叫**（用於 PARITY 群組，需要在同一支 `.mssql.spec.ts` 的 `beforeAll`/`afterAll` 生命週期內重複建置/清除，子行程呼叫較不便於此目的）：`new DataSource({...mssqlOptions('dbo' 或省略 schema), migrations: [BaselineSchemaMssql], migrationsTableName: 'typeorm_migrations', synchronize: false})`，呼叫 `await ds.runMigrations()`。**須直接 import 實際的 migration 匯出 class**（而非重新謄寫 SQL 字串），確保測試驗證的是「真正會被 `migration:run` 執行的同一份程式碼」，而非另一份影子副本。

兩種呼叫方式建置出的 schema 結構應完全一致（同一份 `up()` 邏輯）；BASELINE 群組驗證方式 1（流程真實性），PARITY 群組使用方式 2（可重複執行、可程式化清理）。

### 0.5 Cleanup／冪等性（沿用 P1b1 established pattern，延伸至 `dbo`）

`afterAll` 必須：
1. 對 `dbo`：以 P1b1 `dropAllTablesInSchema` 相同手法（**JS 列舉 `sys.foreign_keys`/`sys.tables` + 逐句 plain DDL 刪除**，**不可用 `sp_executesql`**——本機 SQL Server 2022 Linux 容器對 `EXEC sp_executesql` 拋 17750，見 P1b1 impl log §5.6）依序：解 FK → DROP TABLE 全部 36 張表 → **額外 `DROP TABLE typeorm_migrations`**（baseline migration 專屬的 bookkeeping 表，P1b1 之 `dropAllTablesInSchema` 未處理此表，因 P1b1 從未跑過 migration）。
2. 對 `p1b2_sync`：比照 P1b1 對 `p1b1` schema 的既有清理流程。
3. 清理完成後**重新查詢並斷言 `dbo` 資料表數 = 0**（見 REG-005），確保下次重跑或其他工程師之後續測試執行時 `dbo` 維持乾淨承諾。

### 0.6 Parity Comparator 設計原則（回應 AD §6 步驟 5「可保留供未來每次 entity 變更後的漂移檢查複用」）

建議 comparator（比對 `INFORMATION_SCHEMA.COLUMNS`／`sys.indexes`+`sys.index_columns`／`sys.check_constraints`）實作為**獨立可重用的純函式模組**（非僅內嵌於測試檔案的一次性程式碼），輸入為兩組結構化查詢結果、輸出為結構化 diff 陣列（見 PARITY-010）。理由：AD 本身已明確標註此腳本應「保留供未來每次 entity 變更後的漂移檢查複用」，故不宜寫成僅供本次測試消費的內聯邏輯。**比對 key 必須為 `(table_name, column_name)`／`(table_name, index_name, key_ordinal)`，而非 `(schema, table, column)`**——因兩路徑刻意使用不同 schema 名稱（`p1b2_sync` vs `dbo`），schema 名稱本身的差異是**設計上刻意、預期的**，不應被 comparator 誤判為結構差異。

### 0.7 全 36 表 migration 執行之逾時考量

比照 P1b1 §0.3，全 36 表之 migration `up()`（含索引/FK/複合鍵）執行時間可能與 synchronize 相近或更久（純 SQL 逐句執行 vs. TypeORM 內部批次生成 DDL），建議 `beforeAll` 專用 timeout 沿用 P1b1 之 120000ms 起跳，實測後依需要調整。

### 0.8 CI 平行執行風險（記錄，非本文件測試案例本身）

若 CI 未來將 `.mssql.spec.ts` 多檔平行跑於同一 `CDMP_TEST` 資料庫，`dbo` 為本文件獨佔使用之 schema，其餘既有套件（`p1a`/`p1b1`）皆已養成「raw SQL 一律明確 schema 前綴」的習慣，故目前無交叉污染風險；但若未來新增另一支同樣使用 `dbo` 的測試檔，將產生衝突。此為約定俗成的紀律，非程式碼強制，已記入 `risks-and-gaps.md`。

---

## 一、BASELINE — Baseline Migration 建置成功

> **對應**：AD §8 P1b2 DoD #1（「Baseline migration 對全新 MSSQL 容器建表成功，`NODE_ENV=production`（synchronize 關閉）下驗證」）。

### TS-MSSQL-P1B2-BASELINE-001（🔴 DoD #1 核心）：`NODE_ENV=production` 下 `npm run migration:run` 對全新 `dbo` 成功建出全 36 表，零錯誤
- **Related Requirement**：AD §8 P1b2 DoD #1
- **Test Type**：Positive / Integration（真實 MSSQL，字面 CLI 呼叫，見 §0.4 方式 1）
- **Preconditions**：`CDMP_TEST.dbo` 目前為空（見 BASELINE-006）；環境變數 `DB_TYPE=mssql`／`DB_NAME=CDMP_TEST`／`NODE_ENV=production` 指向測試容器
- **Steps**：以子行程執行 `npm run migration:run`；擷取 exit code 與 stdout/stderr
- **Expected Result**：exit code 0；stdout/stderr 不含 SQL 錯誤訊息；查詢 `dbo` 之 `INFORMATION_SCHEMA.TABLES` 確認建出資料表

---

### TS-MSSQL-P1B2-BASELINE-002：`dbo` 建出之資料表數量 = 36（動態對齊 `ALL_ENTITIES.length`，非寫死 37）
- **Related Requirement**：AD §8 DoD #1／P1b1 表數修正（36 非 37）
- **Test Type**：Positive / Integration
- **Steps**：查詢 `dbo` 之 `sys.tables`（排除 `typeorm_migrations` bookkeeping 表本身）計數
- **Expected Result**：恰好 36 張業務資料表，與 `ALL_ENTITIES.length`（P1b1 已建立之顯式陣列，可直接 import 複用）相等

---

### TS-MSSQL-P1B2-BASELINE-003：`typeorm_migrations` 記錄恰 1 筆，第二次 `migration:run` 為 no-op（0 錯誤、0 新增列）
- **Related Requirement**：TypeORM migration 追蹤機制之標準冪等契約
- **Test Type**：Positive / Idempotency
- **Steps**：BASELINE-001 完成後，查詢 `typeorm_migrations` 列數；再次執行 `npm run migration:run`；重新查詢列數
- **Expected Result**：第一次執行後恰 1 筆（本 baseline migration 之 timestamp+name）；第二次執行 exit code 0 且列數不變（TypeORM 偵測已套用，跳過）

---

### TS-MSSQL-P1B2-BASELINE-004：`NODE_ENV=production` 確實停用 `synchronize`（防止 migration 缺口被 synchronize 靜默補齊而遮蔽真實 bug）
- **Related Requirement**：AD §8 DoD #1 明確要求之驗證前提，防止「migration 本身有缺陷但因 synchronize 仍開著而被掩蓋」的偽陽性
- **Test Type**：Positive / Guard（環境設定驗證）
- **Steps**：確認執行 BASELINE-001 之子行程環境變數含 `NODE_ENV=production`；靜態檢視 `app.module.ts`／CLI 啟動路徑於 `NODE_ENV=production` 時 `synchronize` 分支為 `false`
- **Expected Result**：`synchronize:false` 生效，本群組所有建表行為完全歸因於 migration 檔案本身，無 synchronize 混淆變因

---

### TS-MSSQL-P1B2-BASELINE-005：關鍵 FK 約束正確建立（以 `assignment_run_stage_log.run_id → assignment_run.run_id` 為代表）
- **Related Requirement**：AD §8 DoD #1（「所有約束/索引，零錯誤」）
- **Test Type**：Positive / Integration
- **Steps**：查詢 `dbo` 之 `sys.foreign_keys`（`OBJECT_NAME(parent_object_id)='assignment_run_stage_log'`）
- **Expected Result**：存在對應 FK，`referenced_object_id` 指向 `assignment_run`

---

### TS-MSSQL-P1B2-BASELINE-006（前置守門，meta）：測試開始前 `CDMP_TEST.dbo` 為空（`dbo` 保留慣例守門）
- **Related Requirement**：§0.3「`dbo` schema 保留慣例」
- **Test Type**：Meta / Guard（fail-fast，避免在已污染狀態上疊加建置產生誤判）
- **Steps**：`beforeAll` 最前置步驟查詢 `dbo` 之 `sys.tables` 計數
- **Expected Result**：若非 0，**測試應明確失敗並提示「dbo 非乾淨狀態，可能為前次失敗殘留或其他套件誤用」**，而非靜默清空後繼續（避免掩蓋真實的環境污染問題）

---

## 二、PARITY — Dev/Prod 結構化 Parity 核心比對（I-MSSQL-BASELINE-PARITY-01）

> **對應**：AD §8 P1b2 DoD #2（🔴 核心）／不變式 **I-MSSQL-BASELINE-PARITY-01**。比對來源：Path A = `p1b2_sync`（synchronize）、Path B = `dbo`（baseline migration）。

### TS-MSSQL-P1B2-PARITY-001：`INFORMATION_SCHEMA.COLUMNS` 逐欄屬性（data_type/長度/precision/scale/is_nullable/column_default）於兩路徑交集欄位上完全相等
- **Related Requirement**：AD §6 步驟 5／I-MSSQL-BASELINE-PARITY-01
- **Test Type**：Positive / Integration（**DoD 核心紅線**）
- **Preconditions**：Path A（`p1b2_sync`）與 Path B（`dbo`）皆已完整建置（依賴 ENTITY-like synchronize 與 BASELINE 群組）
- **Steps**：分別查詢 `INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='p1b2_sync'` 與 `WHERE TABLE_SCHEMA='dbo'`；以 `(table_name, column_name)` 為 key 做交集比對 `DATA_TYPE`/`CHARACTER_MAXIMUM_LENGTH`/`NUMERIC_PRECISION`/`NUMERIC_SCALE`/`DATETIME_PRECISION`/`IS_NULLABLE`/`COLUMN_DEFAULT`
- **Expected Result**：交集欄位之全部比對屬性逐一相等，diff 陣列為空

---

### TS-MSSQL-P1B2-PARITY-002：欄位集合對稱差為空（無任一路徑獨有欄位）
- **Related Requirement**：I-MSSQL-BASELINE-PARITY-01（「parity」不僅是「交集屬性相同」，亦要求「集合本身相同」）
- **Test Type**：Positive / Integration（**設計動機**：若 comparator 僅比對交集，會漏掉「migration 忘記某欄位」或「migration 多出某欄位」的情況——此為 PARITY-001 之必要補充，缺一則 parity 驗證不完整）
- **Steps**：計算 `(table_name, column_name)` 集合之對稱差（Path A − Path B）∪（Path B − Path A）
- **Expected Result**：對稱差集合為空（36 表 × 各表欄位數，兩路徑完全一致）

---

### TS-MSSQL-P1B2-PARITY-003：資料表集合對稱差為空（36 = 36，同名同集合）
- **Related Requirement**：I-MSSQL-BASELINE-PARITY-01（表格層級之集合對齊，PARITY-002 的上一層）
- **Test Type**：Positive / Integration
- **Steps**：比對 `INFORMATION_SCHEMA.TABLES` 之 `TABLE_NAME` 集合（`p1b2_sync` vs `dbo`）
- **Expected Result**：兩集合完全相同（各 36 個，名稱逐一相符）

---

### TS-MSSQL-P1B2-PARITY-004：`sys.indexes` + `sys.index_columns` 索引定義（PK／unique／一般索引）兩路徑結構化 diff 為空
- **Related Requirement**：AD §6 步驟 5
- **Test Type**：Positive / Integration（**DoD 核心紅線**）
- **Steps**：分別查詢兩 schema 之 `sys.indexes` JOIN `sys.index_columns` JOIN `sys.columns`（含 `is_primary_key`/`is_unique`/`type_desc`/欄位組成），以 `(table_name, index 邏輯特徵)` 為 key 比對（**index 實體名稱本身若因產生方式不同而不同名，不視為差異**，比對重點為「是否存在等價定義的索引」，見設計註記）
- **Expected Result**：diff 為空；特別驗證 `token_blocklist` PK（`token_hash`，binary(32)，見 HASH-BASELINE）與 `assignment_run_stage_log` 之 `(run_id, stage_no)` unique composite index 兩路徑一致

---

### TS-MSSQL-P1B2-PARITY-005：索引集合對稱差為空（無任一路徑獨有索引，PARITY-004 之集合層補充）
- **Related Requirement**：I-MSSQL-BASELINE-PARITY-01（同 PARITY-002 之設計動機，套用至索引維度）
- **Test Type**：Positive / Integration
- **Steps**：以「表名 + 索引邏輯角色（PK/該欄位組合之 unique）」為 key，計算對稱差
- **Expected Result**：對稱差為空

---

### TS-MSSQL-P1B2-PARITY-006：`sys.check_constraints` 兩路徑皆恰為 0 筆（非 diff 比對，為聯合零值斷言）
- **Related Requirement**：AD §6 步驟 5（「本次盤點為零，驗證腳本應斷言兩路徑皆為零」）
- **Test Type**：Positive / Guard
- **Steps**：分別查詢 `sys.check_constraints`（限定各自 schema 之表）
- **Expected Result**：Path A 與 Path B 皆為 **0 筆**（非僅比較兩者相等，而是明確斷言絕對值為零，因 AD 已明確記錄此為已知盤點結果，非開放式比對）

---

### TS-MSSQL-P1B2-PARITY-007：複合索引欄位順序（`key_ordinal`）逐一比對相同（順序守門，非僅成員集合）
- **Related Requirement**：I-MSSQL-BASELINE-PARITY-01（索引欄位順序影響查詢計畫與唯一性語意，屬結構的一部分，非僅「有哪些欄位」）
- **Test Type**：Positive / Boundary
- **Preconditions**：以 `assignment_run_stage_log` 之 `(run_id, stage_no)` unique composite index 為代表案例
- **Steps**：查詢兩路徑之 `sys.index_columns.key_ordinal`，確認欄位出現順序一致
- **Expected Result**：Path A 與 Path B 之欄位順序（`run_id` 為第 1 順位、`stage_no` 為第 2 順位）完全相同——**此案例設計動機**：若 migration 手寫時不慎將複合索引欄位順序寫反，PARITY-004/005 之集合比對可能因「兩個欄位都在」而誤判通過，唯有順序比對能攔截此類 bug

---

### TS-MSSQL-P1B2-PARITY-008（meta，comparator 自我一致性）：comparator 對同一來源自比對（Path A vs Path A）必為空 diff
- **Related Requirement**：Meta（驗證比對工具本身邏輯正確，非直接驗證 production 結構）
- **Test Type**：Meta / Design Verification
- **Steps**：將 Path A 之查詢結果分別作為「來源一」與「來源二」餵給同一組 comparator（PARITY-001/004 之底層邏輯）
- **Expected Result**：diff 為空——確認 comparator 本身邏輯自洽（若 comparator 實作有 bug 導致「同一份資料比對出差異」，屬 comparator 本身損壞，必須先排除此可能性，此案例即為排除依據）

---

### TS-MSSQL-P1B2-PARITY-009（🔴 meta，敏感度驗證，重要）：comparator 對人工注入的合成差異必須偵測到非空 diff
- **Related Requirement**：Meta（**核心設計原則**：一個「永遠回報空 diff」的 comparator 也會讓 PARITY-001~007 全部「通過」，但毫無驗證價值——本案例證明 comparator 具備真實的偵測能力，而非形同虛設的 no-op）
- **Test Type**：Meta / Negative（合成資料，不觸碰真實 DB 結構）
- **Steps**：取 Path A 之查詢結果複本，在記憶體中人工竄改一筆欄位屬性（例如將某欄之 `CHARACTER_MAXIMUM_LENGTH` 由 -1 改為 100），與未竄改之 Path A 原始結果送入同一 comparator
- **Expected Result**：comparator 回報**恰好 1 筆**非空 diff，且該筆 diff 之 `table`/`column`/`field`/兩側數值皆準確對應到人工竄改的那一處——**本案例未通過，則 PARITY-001~007 的所有「diff 為空」結論皆不可信**，須列為本群組最優先驗證的案例之一

---

### TS-MSSQL-P1B2-PARITY-010：diff 報告為結構化格式（非布林），每筆含可定位資訊
- **Related Requirement**：AD §6 步驟 5（工具需「可保留供未來每次 entity 變更後的漂移檢查複用」，結構化輸出是可複用的前提）
- **Test Type**：Design Verification
- **Steps**：檢視 comparator 輸出格式
- **Expected Result**：輸出為陣列，每一元素至少含 `{ table, column（或 index 名稱）, field, valueA, valueB }`，可直接定位問題所在，而非僅回傳 `true`/`false` 或籠統的錯誤訊息字串

---

## 三、TIERFN — `fn_calc_tier_level` 未建立

> **對應**：AD §8 P1b2 DoD #3（「`fn_calc_tier_level` 確認未被建立，`OBJECT_ID('dbo.fn_calc_tier_level')` 應回 NULL」，沿用 AD-E07-38 原始裁定：死碼，不建立）。

### TS-MSSQL-P1B2-TIERFN-001（🔴 DoD #3）：`OBJECT_ID('dbo.fn_calc_tier_level')` 於 baseline migration 建置後為 NULL
- **Related Requirement**：AD §8 DoD #3
- **Test Type**：Positive / Guard
- **Steps**：BASELINE-001 完成後執行 `SELECT OBJECT_ID('dbo.fn_calc_tier_level')`
- **Expected Result**：回傳 `NULL`

---

### TS-MSSQL-P1B2-TIERFN-002（靜態守門，防止未來複製舊 SP 素材時誤帶入）：baseline migration 原始碼檔案不含字串 `fn_calc_tier_level`
- **Related Requirement**：AD §8 DoD #3（動態檢查僅驗證「當下建置結果」，靜態掃描才能防止未來修改 migration 檔案時意外重新引入）
- **Test Type**：Static Gate（Grep）
- **Steps**：讀取 baseline migration 原始碼檔案全文，搜尋 `fn_calc_tier_level`
- **Expected Result**：0 命中

---

### TS-MSSQL-P1B2-TIERFN-003（對照組，記錄非差異）：`p1b2_sync`（synchronize 路徑）同樣未建立此函式
- **Related Requirement**：Regression / 對照確認（TypeORM synchronize 從不管理 stored function，此為既有已知行為，非本輪新驗證重點，僅作為 PARITY 群組之外的顯式雙路徑對照記錄）
- **Test Type**：Regression（對照組）
- **Steps**：於 `p1b2_sync` schema 執行 `SELECT OBJECT_ID('p1b2_sync.fn_calc_tier_level')`
- **Expected Result**：`NULL`（與 Path B 結果一致，兩路徑皆不存在此函式，無需 PARITY 群組另外處理，因 TypeORM 完全不涉及 function 物件）

---

## 四、FILTER — 無 Filtered Index（F-2）

> **對應**：AD §0 F-2（「舊 PG baseline 唯一的 filtered/partial index 已於 2026-07-07 移除，全文掃描零命中」）；任務要求「斷言 baseline 與 synchronize 兩路徑皆零 filtered index」。

### TS-MSSQL-P1B2-FILTER-001：Path B（`dbo`，baseline migration）之 `sys.indexes.has_filter=1` 計數為 0
- **Related Requirement**：AD §0 F-2
- **Test Type**：Positive / Guard
- **Steps**：查詢 `SELECT COUNT(*) FROM sys.indexes WHERE has_filter=1`（限定 `dbo` 之 36 表）
- **Expected Result**：0

---

### TS-MSSQL-P1B2-FILTER-002：Path A（`p1b2_sync`，synchronize）之 `sys.indexes.has_filter=1` 計數同樣為 0
- **Related Requirement**：AD §0 F-2（與 P1b1 既有 entity 層盤點結論交叉確認）
- **Test Type**：Regression（對照組）
- **Steps**：同 FILTER-001，限定 `p1b2_sync`
- **Expected Result**：0（與 Path B 一致，亦隱含於 PARITY-005 之索引集合對稱差為空）

---

### TS-MSSQL-P1B2-FILTER-003（靜態守門）：baseline migration 原始碼不含 `CREATE INDEX ... WHERE` 樣式之 filtered index 語法
- **Related Requirement**：AD §0 F-2（防止未來複製舊 SP/舊 baseline 素材時誤帶回 filtered index 語法）
- **Test Type**：Static Gate（Grep，正規表示式偵測 `CREATE ... INDEX` 陳述式後方接續 `WHERE` 子句）
- **Steps**：靜態掃描 baseline migration 原始碼
- **Expected Result**：0 命中

---

## 五、COLLATE-BASELINE — Collation 繼承（I-MSSQL-COLLATE-01，Baseline 路徑）

> **對應**：不變式 **I-MSSQL-COLLATE-01**（「migration 建出的所有字串欄 collation 皆 `Chinese_Taiwan_Stroke_BIN`，DB 層級設定，非逐欄 COLLATE」）。P1b1 已於 synchronize 路徑（`p1b1` schema）驗證此不變式；本群組驗證 baseline migration 路徑（`dbo`）**同樣正確**，因手寫 SQL 存在「複製舊 PG baseline 素材時意外帶入錯誤 collation 字面值」的獨立風險（PG baseline 檔案本身不含 collation 概念，但若參考其他舊系統 SQL 語法片段，仍有風險）。

### TS-MSSQL-P1B2-COLLATE-BASELINE-001：`dbo` 全表全欄 `sys.columns.collation_name` 唯一值 = `Chinese_Taiwan_Stroke_BIN`
- **Related Requirement**：I-MSSQL-COLLATE-01
- **Test Type**：Positive / Guard
- **Steps**：查詢 `SELECT DISTINCT collation_name FROM sys.columns`（限定 `dbo` 之 36 表，`collation_name IS NOT NULL`）
- **Expected Result**：唯一一種值 `'Chinese_Taiwan_Stroke_BIN'`

---

### TS-MSSQL-P1B2-COLLATE-BASELINE-002：`dbo` 無任何欄位層級 `COLLATE` 覆寫（皆繼承資料庫層級設定）
- **Related Requirement**：I-MSSQL-COLLATE-01（「資料庫層級設定，非逐欄 COLLATE」）
- **Test Type**：Positive / Guard
- **Steps**：比對每個字串欄位之 `collation_name` 與 `DATABASEPROPERTYEX(DB_NAME(),'Collation')` 是否相同
- **Expected Result**：0 筆不相同（0 處覆寫）

---

### TS-MSSQL-P1B2-COLLATE-BASELINE-003（靜態守門，本群組風險核心）：baseline migration 原始碼**完全不含** `COLLATE` 關鍵字
- **Related Requirement**：I-MSSQL-COLLATE-01（**本案例存在的理由**：手寫 migration 若複製貼上舊系統/其他 SQL 片段，最容易意外帶入逐欄 `COLLATE` 覆寫，動態檢查 COLLATE-BASELINE-001/002 僅能驗證「當下建置結果」，靜態掃描才能在 code review 階段即攔截）
- **Test Type**：Static Gate（Grep，大小寫不敏感）
- **Steps**：靜態掃描 baseline migration 原始碼，搜尋 `COLLATE`
- **Expected Result**：0 命中

---

## 六、CASE-BASELINE — 大小寫守門（I-MSSQL-CASE-01，Baseline 路徑）

> **對應**：不變式 **I-MSSQL-CASE-01**。P1b1 已於 synchronize 路徑全面驗證；本群組驗證 baseline migration 路徑（手寫 SQL 更容易因人為疏忽帶入大寫，如複製 PG baseline 之雙引號識別字或舊系統 SP 之大寫慣例）。

### TS-MSSQL-P1B2-CASE-BASELINE-001：`dbo` 全表名稱皆為小寫
- **Related Requirement**：I-MSSQL-CASE-01
- **Test Type**：Positive / Guard
- **Steps**：查詢 `dbo` 之 `sys.tables.name`
- **Expected Result**：全部符合 `^[a-z0-9_]+$`（允許數字，比照 P1b1 CASE-001 已修正之正規表示式，涵蓋 legacy OB 欄如 `order1`/`addr1`），0 例外

---

### TS-MSSQL-P1B2-CASE-BASELINE-002：`dbo` 全表所有欄位名稱皆為小寫 snake_case
- **Related Requirement**：I-MSSQL-CASE-01
- **Test Type**：Positive / Guard
- **Steps**：查詢 `dbo` 之 `sys.columns.name`
- **Expected Result**：全部符合 `^[a-z0-9_]+$`，0 例外（此動態檢查已足夠定案，本群組不另設靜態 grep 案例，因 P1a/P1b1 既有慣例亦僅靠動態 sys.* 查詢作為 CASE 守門之唯一依據，非疏漏）

---

## 七、HASH-BASELINE — B1 結構正確（Baseline 路徑）

> **對應**：任務要求「migration 建出的 `token_blocklist` PK 為 `token_hash binary(32)`（非 `nvarchar(2048)`）」；P1b1 已於 synchronize 路徑驗證，本群組驗證 baseline migration 路徑（B1 是全案改動最大的單一結構性變更，值得獨立命名案例而非僅依賴 PARITY 群組的通用 diff）。

### TS-MSSQL-P1B2-HASH-BASELINE-001：`dbo.token_blocklist` PK 欄位為 `token_hash`，型別 `binary(32)`，無明文 `token` 欄位
- **Related Requirement**：AD-E07-39 §3（B1 裁定）
- **Test Type**：Positive / Integration
- **Steps**：查詢 `dbo.token_blocklist` 之 `sys.columns`/`INFORMATION_SCHEMA.COLUMNS`
- **Expected Result**：欄位名 `token_hash`，`DATA_TYPE='binary'`，`CHARACTER_MAXIMUM_LENGTH=32`；**不存在**名為 `token` 之欄位

---

### TS-MSSQL-P1B2-HASH-BASELINE-002：`dbo.token_blocklist` PK 索引鍵寬度 = 32 bytes（遠低於 900-byte 上限）
- **Related Requirement**：不變式 I-MSSQL-PK-BYTELIMIT-01（P1b1 已建立之動態掃描查詢，本案例將同一查詢套用於 `dbo`）
- **Test Type**：Positive / Boundary
- **Steps**：以 P1b1 `PKWIDTH-001` 相同之 `sys.indexes`+`sys.index_columns`+`sys.columns` 動態查詢，限定 `dbo`
- **Expected Result**：`token_blocklist` PK 之 `key_bytes = 32`，≤ 900 bytes 上限

---

### TS-MSSQL-P1B2-HASH-BASELINE-003（與 PARITY 群組交叉引用）：`token_blocklist` 之欄位/索引定義於 Path A／Path B 之 parity diff 恰為 0 筆
- **Related Requirement**：I-MSSQL-BASELINE-PARITY-01（B1 是全案結構最複雜的單一 entity 改動，值得從 PARITY-001/004 的全表 diff 結果中額外抽出並明確命名此表之交叉引用斷言）
- **Test Type**：Positive / Integration（PARITY-001/004 之針對性子集）
- **Steps**：從 PARITY-001/004 產出之全域 diff 結果中，篩選 `table_name='token_blocklist'` 之項目
- **Expected Result**：0 筆——確認 B1 這個全案最複雜的結構性變更，兩路徑（synchronize helper 化 vs 手寫 SQL）完全一致，非僅靠全域 diff 的「整體為空」間接推論

---

## 八、STATIC — 靜態檢查：`sp_executesql` 規避 + 非 pg_dump 專屬語法

> **對應**：任務要求「靜態檢查：baseline migration 不含 `sp_executesql`；且不依賴 pg_dump 專屬語法」；直接依據 P1b1 impl log §5.6（本機 MSSQL 容器 `EXEC sp_executesql` 拋 17750，一般 DDL/`EXEC('...')` 正常）。

### TS-MSSQL-P1B2-STATIC-001（🔴 P1b1 caveat 直接對應）：baseline migration 原始碼**完全不含** `sp_executesql`
- **Related Requirement**：P1b1 impl log §5.6（本機容器已知限制，直接影響本 migration 是否可於本機測試環境正確執行）
- **Test Type**：Static Gate（Grep，大小寫不敏感）
- **Steps**：靜態掃描 baseline migration 原始碼，搜尋 `sp_executesql`
- **Expected Result**：0 命中——**此案例失敗代表 migration 本身於本機 MSSQL 測試容器無法正確執行**（非 migration 邏輯錯誤，而是已知容器限制），須在 code review／CI 階段即攔截，而非等到 BASELINE-001 執行期間才發現拋出不易理解的 17750 錯誤

---

### TS-MSSQL-P1B2-STATIC-002：baseline migration 原始碼不含常見 PostgreSQL 專屬語法標記（防止naive複製 `BaselineSchema.ts`）
- **Related Requirement**：任務要求「不依賴 pg_dump 專屬語法」；`BaselineSchema.ts` 為 pg_dump 產物，明確標註「不可直用」
- **Test Type**：Static Gate（Grep，多樣式清單）
- **Steps**：靜態掃描 baseline migration 原始碼，逐一搜尋以下 PostgreSQL 專屬標記：`::`（型別轉換運算子）、`SERIAL`、`RETURNING`、`gen_random_uuid()`、`uuid_generate_v4()`、`NOW()`（PG 慣用，MSSQL 應為 `GETDATE()`/`CURRENT_TIMESTAMP`）、`"public".`（PG schema 慣用雙引號識別字）、`CREATE EXTENSION`
- **Expected Result**：以上樣式全部 0 命中

---

### TS-MSSQL-P1B2-STATIC-003：baseline migration 為合法 TypeORM `MigrationInterface` 實作，且被 `data-source.ts` 既有 glob 掃描納入
- **Related Requirement**：確保 migration 檔案實際會被 `migration:run` 拾取，不需額外接線
- **Test Type**：Static Gate / Design Verification
- **Steps**：檢視 migration 檔案匯出結構（`implements MigrationInterface`，含 `up(queryRunner)`/`down(queryRunner)`）；確認檔案路徑符合 `data-source.ts` 之 `migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')]` glob
- **Expected Result**：檔案位於 `apps/api/src/database/migrations/` 目錄下，命名符合 TypeORM timestamp-prefixed 慣例，`migration:show` 可列出此 migration

---

### TS-MSSQL-P1B2-STATIC-004（建議項，非 AD 硬性 DoD，但屬合理 migration 契約延伸）：`down()` 正確逆轉 `up()` — `migration:revert` 後全 36 表與 `typeorm_migrations` 紀錄乾淨移除
- **Related Requirement**：TypeORM migration 標準 up/down 契約（AD 未明文要求，但作為完整 migration 檔案的基本品質保證，建議納入而非略過；tdd-implementation 可視工作量權衡是否本輪納入，或標記為 P1b2 之外的技術債）
- **Test Type**：Positive / Round-trip（**建議，非阻擋項**）
- **Steps**：BASELINE-001 完成後執行 `npm run migration:revert`
- **Expected Result**：exit code 0；`dbo` 之 36 表全數移除；`typeorm_migrations` 該筆紀錄移除；不留孤兒物件（FK/索引隨表刪除自動清除）

---

## 九、REG — 回歸與型別檢查閘

### TS-MSSQL-P1B2-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：`feedback_vitest_no_typecheck`
- **Test Type**：Static Gate
- **Steps**：執行 `tsc --noEmit -p tsconfig.build.json`
- **Expected Result**：0 錯誤（新增 migration 檔案之型別簽章正確、comparator 工具模組型別正確）

---

### TS-MSSQL-P1B2-REG-002：P1b1 既有 `.mssql.spec.ts`（`p1b1` schema）不因本輪新增 migration 檔案/`dbo` 使用而回歸
- **Related Requirement**：Regression（schema 隔離承諾）
- **Test Type**：Regression
- **Steps**：重跑 `mssql-p1b1.mssql.spec.ts` 全套件
- **Expected Result**：39/39 維持綠燈（P1b1 impl log 已記錄之既有基準）

---

### TS-MSSQL-P1B2-REG-003：P1a 既有 `.mssql.spec.ts`（`p1a` schema）同樣不受影響
- **Related Requirement**：Regression
- **Test Type**：Regression
- **Steps**：重跑 `mssql-p1a.mssql.spec.ts` 全套件
- **Expected Result**：25/25 維持綠燈（P1b1 impl log 已記錄之既有基準）

---

### TS-MSSQL-P1B2-REG-004：既有 sqlite/postgres 套件（含 F098~F109 一系列 `.pg.spec.ts`）不受影響
- **Related Requirement**：Regression（新增一支 migration 檔案不改變任何應用程式行為）
- **Test Type**：Regression
- **Steps**：重跑既有 sqlite e2e 與既有 `.pg.spec.ts` 全套件
- **Expected Result**：全數維持既有綠燈狀態（既有 pre-existing baseline 失敗不計入，見 P1b1 impl log §6）

---

### TS-MSSQL-P1B2-REG-005（`dbo` 保留慣例的閉環驗證）：測試套件 `afterAll` 清理後，`CDMP_TEST.dbo` 資料表數量歸零
- **Related Requirement**：§0.3／§0.5「`dbo` schema 保留慣例」
- **Test Type**：Regression / Cleanup Verification
- **Steps**：全套件執行完畢後，獨立查詢 `dbo` 之 `sys.tables` 計數
- **Expected Result**：0（含 `typeorm_migrations` 表本身亦須移除），確保本文件之測試執行不會對其他工程師或後續 CI 執行留下污染狀態

---

## 十、Traceability Matrix（P1b2 DoD ↔ 不變式 ↔ 測試案例）

| P1b2 DoD 項目（AD §8）／任務額外要求 | 對應不變式 | 對應測試案例 |
|---|---|---|
| #1 Baseline migration 對全新 MSSQL 容器建表成功，`NODE_ENV=production` 下驗證 | — | BASELINE-001~006 |
| #2 Parity 驗證腳本執行，兩路徑結構化 diff 為空（🔴 核心） | **I-MSSQL-BASELINE-PARITY-01** | PARITY-001~010 |
| #3 `fn_calc_tier_level` 確認未被建立 | — | TIERFN-001~003 |
| （任務額外）無 filtered index（F-2） | — | FILTER-001~003 |
| （任務額外）Collation 繼承（DB 層級，非逐欄） | **I-MSSQL-COLLATE-01** | COLLATE-BASELINE-001~003 |
| （任務額外）大小寫守門 | **I-MSSQL-CASE-01** | CASE-BASELINE-001~002 |
| （任務額外）B1 結構正確（`token_hash binary(32)`） | I-MSSQL-PK-BYTELIMIT-01（延伸自 P1b1） | HASH-BASELINE-001~003 |
| （任務額外）靜態檢查：不含 `sp_executesql`／不依賴 pg_dump 語法 | — | STATIC-001~004 |
| （跨案通用）不引入回歸 | — | REG-001~005 |

**P1b2 範圍明確不涵蓋之項目**（由 P1b3/P1c 各自測試設計覆蓋，此處僅記錄邊界）：

| 項目 | 歸屬階段 | 原因 |
|---|---|---|
| bootstrap/seed 三支腳本改寫（`seed-datasource.ts`/`prod-data-seed.ts`/`seed.ts`）+ 冪等性驗證 | P1b3 | AD §7/§8 明確歸屬 P1b3 |
| `sp_getapplock` / Pattern B（`$n`→named param） | P1c | I-MSSQL-LOCK-01／I-MSSQL-PARAM-01，AD-E07-38 明確歸屬 P1c |
| 全 entity 型別轉換/B1 entity 層/D1 全 entity 載入之**原始**驗證 | P1b1（已完成） | 本文件僅在 HASH-BASELINE 群組驗證 B1 於**新路徑**（baseline migration）之正確性，不重複 P1b1 對 entity/synchronize 路徑的驗證 |

---

## 十一、測試替身（Mocks / Stubs / Test Doubles）說明

- **PARITY-008/009 之合成竄改資料**：完全於記憶體中操作既有查詢結果之複本（不重新連線 DB、不建立額外表），用途為驗證 comparator 工具本身的正確性（自我一致性 + 敏感度），非驗證 production 結構。
- **BASELINE-001 之子行程呼叫**：直接呼叫真實 `npm run migration:run`（無 mock），驗證的是「CLI 工具 + `data-source.ts` + migration 檔案」三者串接之真實行為；此為刻意選擇，若改為程式化呼叫將無法驗證 CLI 層本身（環境變數讀取、`.env.cli` 載入邏輯等）是否正確銜接。
- **PARITY 群組其餘案例之程式化呼叫（§0.4 方式 2）**：直接 import 真實 migration class 執行 `runMigrations()`，非重新謄寫 SQL 字串或 mock migration 邏輯，確保驗證的是「真正會被 `migration:run` 執行的同一份程式碼」。

---

## 十二、命名鎖定（避免下游 agent 擅自改名，比照 `feedback_tdd_naming_drift` 教訓）

- Path A schema：`p1b2_sync`（新建，比照既有 `p1a`/`p1b1` 命名慣例）
- Path B schema：`dbo`（**不新建**，直接使用資料庫預設 schema，刻意對應 prod 真實部署路徑，不得改用其他自訂 schema 名稱，否則失去「與 prod 實際路徑一致」之驗證意義）
- `dbo` 於 `CDMP_TEST` 之保留慣例：本文件之 BASELINE/PARITY/TIERFN/FILTER/COLLATE-BASELINE/CASE-BASELINE/HASH-BASELINE 群組獨佔使用，其餘既有/未來測試套件不得使用 `dbo`
- Parity comparator 建議命名：無強制規定確切檔名，但**邏輯上須為獨立可重用模組**（非內嵌於單一測試檔案），供 AD §6 步驟 5 所述「未來每次 entity 變更後的漂移檢查複用」
- 既有 helper 沿用（不重複定義）：`mssqlPortReachable()`/`restoreDbType()`/`SKIP_REASON`/`MSSQL`（`mssql-env-preload.ts`）、`ALL_ENTITIES`（P1b1 已建立之顯式陣列）、`dropAllTablesInSchema` 之「JS 列舉 sys 目錄 + 逐句 plain DDL」模式（本輪延伸套用至 `dbo`，並新增 `typeorm_migrations` 表之額外清理）

---

## 更新紀錄

| 日期 | 變更內容 |
|------|---------|
| 2026-07-07 | 初版建立：AD-E07-39 P1b2 測試設計，39 個測試案例（BASELINE 6 + PARITY 10 + TIERFN 3 + FILTER 3 + COLLATE-BASELINE 3 + CASE-BASELINE 2 + HASH-BASELINE 3 + STATIC 4 + REG 5）+ Traceability Matrix + 測試環境/兩路徑 Harness 方案（★核心交付：schema 隔離而非獨立 DB，因 `cdmp` login 僅 `db_owner` 無 `CREATE DATABASE` 權限；Path A=`p1b2_sync` schema／Path B=`dbo` 直接對應 prod 真實部署路徑）。核心紅線：PARITY-001~007（I-MSSQL-BASELINE-PARITY-01 結構化 diff 為空）+ **PARITY-009（🔴 comparator 敏感度驗證，防止「永遠回報空 diff」的無效工具）**+ STATIC-001（🔴 P1b1 impl log §5.6 `sp_executesql` 17750 caveat 直接對應）。表數修正沿用 P1b1 慣例（36 非 37）。 |
