---
type: implementation-log
doc_id: AD-E07-38-pattern-b-site-inventory
title: Pattern B（$n 位置參數）完整站點清單與 Phase 分流
related: AD-E07-38-mssql-p1-driver-entity-schema.md（§3 D-5）、AD-E07-38-P1c-test.md（STATIC-001）
status: delivered
last_updated: 2026-07-07
---

# AD-E07-38 Pattern B 完整站點清單（STATIC-001 交付物）

> 本文件為 AD §3 D-5「其餘 ~40 站點分流建議」之落地清單，供未來 Phase 3a/4/6 之
> test-designer / tdd-implementation 直接引用，**不需重新 grep 全庫**。行號為 2026-07-07 快照，
> 之後可能漂移；引用前以檔名 + SQL 片段特徵二次定位（feedback_grep_negative_lookahead）。

## 一、P1c 已完成（本輪落地，不在後續 phase）

| # | 檔案:行 | 原 SQL | 改法 | 狀態 |
|---|---|---|---|---|
| 1 | `assignment-run-pipeline.service.ts`（`prefetchScoringSources`，customer_core） | `= ANY($1)` | `IN (:...custoNos)` + `escapeQueryWithParameters` | ✅ P1c |
| 2 | `assignment-run-pipeline.service.ts`（`prefetchScoringSources`，ob_arreturndf_min_cap） | `= ANY($1)` | `IN (:...applNos)` + `escapeQueryWithParameters` | ✅ P1c |
| 3 | `personnel-ratio.service.ts`（`tryAutoAdvance` [4a]） | `pg_advisory_xact_lock(hashtext($1)::bigint)` | 跨 driver 三分支 `auto-advance-lock.util.ts`（pg advisory / mssql `sp_getapplock` / sqlite no-op） | ✅ P1c |
| 4 | `assignment-run-report.service.ts`（`buildExportQuery`） | `WHERE r.run_id = $1` + scope 巢狀 `$2..$N` | `:runId` + `:...emplIds`，單一次 `escapeQueryWithParameters` | ✅ P1c |

## 二、明確排除（P1c 不動；移交 Phase 3/4）

| 站點 | 檔案:行 | 原因 | 歸屬 |
|---|---|---|---|
| 站點 5 | `assignment-run-report.service.ts:637`（`cursorRows`，`DECLARE ... CURSOR FOR ${query.sql}`） | PostgreSQL native cursor 機制本身（非單純參數改寫），須整體重寫串流 | **Phase 3/4（F064 匯出）** |

## 三、其餘 ~40 站點分流（AD §3 D-5 四分類）

### 3.1 → Phase 3a（Stage 1 / assignment-list / c360 raw SQL）

- `assignment/stage1/stage1-sql-executor.ts` — **已用** `escapeQueryWithParameters` 慣例（`$1` 僅存於註解），Pattern B 已合規；Phase 3a 僅需驗 mssql driver 展開等價，無需改碼。
- `c360/c360.service.ts:228` — `const param = isSqlite ? '?' : '$1';`（手寫 driver-conditional 位置參數）→ 改 `escapeQueryWithParameters` 具名慣例。**Phase 3a**（AD 註記「c360 服務待 Phase 3a 一併盤點」）。

### 3.2 → Phase 4（ETL pipeline node handler，多為 `information_schema` 查詢）

| 檔案:行 | SQL 特徵 |
|---|---|
| `etl/engine/handlers/target-load-handler.ts:22,69,238,288,304` | `information_schema.tables/columns` `WHERE table_name = $1`；nullable / PK 元資料查詢 |
| `etl/engine/handlers/type-cast-handler.ts:87` | `information_schema.columns ... = $1` |
| `etl/engine/handlers/resolve-raw-table.ts:42` | `WHERE ds.name = $1 AND et.source_table = $2` |
| `etl/engine/handlers/merge-handler.ts:115` | `information_schema.columns ... = $1` |
| `etl/engine/handlers/extract-handler.ts:44` | `information_schema.tables ... = $1` |
| `etl/engine/handlers/lookup-handler.ts:68,133` | `information_schema.tables ... = $1`；`UPDATE ... SET x = $1` |
| `etl/engine/handlers/derived-field-handler.ts:135` | `information_schema.columns ... = $1` |
| `etl/engine/handlers/field-mapping-handler.ts:88` | `information_schema.columns ... = $1` |
| `etl/engine/handlers/conditional-handler.ts:164` | `information_schema.columns ... = $1` |
| `etl/engine/handlers/dedup-handler.ts:51` | `information_schema.columns ... = $1` |
| `extraction-task/raw-data.service.ts:132,180,203,509,544` | `LIMIT $1 OFFSET $2`；`information_schema` / `pg_catalog` 元資料查詢（`$1`） |

> 註：ETL / extraction 大量使用 PostgreSQL `information_schema`/`pg_catalog` 元資料查詢，遷移 mssql 時
> **不只是參數改寫**，元資料來源本身需改 `sys.tables`/`sys.columns`/`INFORMATION_SCHEMA`（MSSQL 版），
> 故整批歸 Phase 4，與 ETL 引擎 mssql 化一併處理。

### 3.3 → Phase 6（cutover 前刪除，不需遷移）

- `extraction-task/executors/postgresql-executor.ts:57,75,86` — PostgreSQL 專屬 executor（`information_schema` + `$1/$2`）。屬 PG 來源抽取 executor，PG cutover 完成後刪除，不改寫。

### 3.4 非執行期站點（N/A）

- `database/seeds/seed-connection.ts` — seed 連線腳本；非 runtime 查詢路徑，隨 baseline/bootstrap 一併處理，不列入 Pattern B 遷移。

## 四、驗證方式

- 各站點是否殘留裸 `$n`：以 `fs.readFileSync` + `/\$\d+/`（非僅 Grep tool）掃描目標方法範圍，`cursorRows` 樣板插值 `${query.sql}` 除外。
- 具名參數展開等價：`driver.escapeQueryWithParameters` 三 driver 對照（PG `$n` / SQLite `?` / MSSQL `@n`），參數陣列順序一致。
