---
type: test-design-infrastructure
test-spec-id: AD-E07-39-P1b3
feature_name: MSSQL 全面遷移 P1b3 — Bootstrap/Seed 三支腳本改寫 + B2 npm alias 修復驗證
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-39-mssql-p1b-full-baseline.md（§7 Bootstrap/Seed 改動、§8 P1b3 DoD）
  - /docs/specs/implementation-log/AD-E07-39-P1b2-impl.md（§4.2 🔴 npm alias 於本機 Node 24 + workspace hoisting 下失效，B2 待裁示項，直接構成本輪 ALIAS 群組之修復目標）
  - /docs/specs/implementation-log/AD-E07-39-P1b1-impl.md（既有 `dropAllTablesInSchema` cleanup 模式，本輪擴充至 dbo 資料列清理）
covers: []
spec_version: "1.0"
date: 2026-07-07
last_updated: 2026-07-07
---

# AD-E07-39 P1b3：Bootstrap/Seed 三支腳本改寫 + B2 npm alias 修復驗證 — 測試設計

> 本文件覆蓋 AD-E07-39「MSSQL 全面遷移 P1b（全 36 Entity Baseline）」之 **P1b3 切片**（`seed.ts`／`seed-datasource.ts`／`prod-data-seed.ts` 三支腳本改寫使其對 MSSQL 可執行 + 修復 P1b2 impl log §4.2 記錄之 B2 `npm run migration:run`/`bootstrap` alias 失效問題）。
> P1（P1a/P1b/P1c）不經 spec-writer（AD-E07-38 §3 D-7 已裁定：純底層儲存/驅動置換，無新業務行為）；本文件依 system-architect 產出之 AD-E07-39 §7/§8 直接產出測試設計，銜接 P1b2（`infrastructure/AD-E07-39-P1b2-test.md`，39 場景，已完成）。
>
> **範圍**：§7 三支腳本之 raw SQL／DataSource 建構改動 + P1b2 impl log §4.2 之 npm script 修復。**明確排除**：`sp_getapplock`／Pattern B 引擎層 named param（P1c，`I-MSSQL-LOCK-01`/`I-MSSQL-PARAM-01`）；P1b1/P1b2 已完成之 entity 型別/baseline migration/parity 驗證本輪不重複。
>
> **⚠️ 本文件在 AD §7 既有分析（`$n`→named param、`LIMIT`→`TOP`）之外，逐檔實際 grep 三支腳本後新增查證出 5 類 AD 未列出但確認會阻擋 MSSQL 執行之站點**（詳見 §1），已一併納入測試範圍：(1) 三支腳本 `main()` 皆**硬編碼 `type: 'postgres'`**於自建 `DataSource`，完全無視 `DB_TYPE` 環境變數（比 raw SQL 語法問題更早發生、更根本，任何 SQL 轉換皆無意義直到此問題修復）；(2) PG 專屬函式 `NOW()`（10+ 處）；(3) PG 專屬子句 `RETURNING id`（1 處）；(4) PG 專屬型別轉換 `::text`（1 處）；(5) PG 專屬 NULL-safe 運算子 `IS NOT DISTINCT FROM`（reconcile 引擎核心，用於 6 張計分卡表）；(6) 布林字面值 `true`（1 處，MSSQL T-SQL 不接受裸 `TRUE`/`FALSE` 關鍵字，需轉 `1`/`0`）。**這些站點若未修復，`npm run bootstrap` 對 MSSQL 必定失敗**，故雖 AD §7 風險表未逐一列出，仍屬 P1b3 DoD #1（「全流程對 MSSQL 跑通」）之必要前提，本文件視為 P1b3 範圍內、非範圍外擴張。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部（尤其 §1 站點清單 + §0 Harness 設計）+ `apps/api/src/database/seeds/seed.ts`／`seed-datasource.ts`／`prod-data-seed.ts`（三支待改腳本）+ `apps/api/src/database/data-source.ts`（**既有可參考的 per-dialect DataSource 建構範例**，CLI migration 已正確依 `DB_TYPE` 切 `postgres`/`mssql` 分支，三支 seed 腳本應仿照此模式而非另立新邏輯）+ `apps/api/src/database/seeds/__tests__/prod-data-seed-reconcile.pg.spec.ts`（既有 PG reconcile 單元測試，本輪 MSSQL 對應版本應沿用相同「直接 import 並呼叫 exported 函式」測試風格）+ `apps/api/src/database/__tests__/mssql-p1b1.mssql.spec.ts`（`dropAllTablesInSchema` cleanup 模式，需擴充為含資料列的完整 dbo 清空） |
| DevOps / CI/CD | 本文件「零、測試環境與 Gating 設計 + Harness 方案」章節（**核心交付**，含 dbo 與 P1b2 共用資源之序列化執行要求） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P1b3 風險段落，含 🔴 SCOPE GAP 決策關卡） |

---

## 零、測試環境與 Gating 設計 + Harness 方案（★ 本文件核心交付，對應使用者問題 #7）

### 0.1 沿用既有 gating helper 與資料庫，不新增基礎設施

沿用 `mssql-env-preload.ts`（`mssqlPortReachable`/`SKIP_REASON`/`restoreDbType`）；連不上 MSSQL（`docker compose --profile mssql up -d mssql mssql-init`）→ 整檔 `describe.skip`，不假造綠燈。資料庫沿用 `CDMP_TEST`（`Chinese_Taiwan_Stroke_BIN`，`cdmp` login 僅 `db_owner`，**無 `dbcreator`**，此權限約束已由 P1b2 查證並記錄於 `risks-and-gaps.md` R-MSSQL-P1B2-01，本輪沿用同一結論）。

### 0.2 關鍵技術事實：raw SQL 腳本無法透過 TypeORM `schema` 選項重新導向 schema

P1b2 之所以能用「Path A=`p1b2_sync` schema／Path B=`dbo`」達成隔離，是因為 Path A 走 **TypeORM `synchronize()`**（DDL 由 TypeORM 產生，會自動依 DataSource 之 `schema` 選項加前綴）。**本輪三支 seed 腳本的 SQL 全部是手寫字串（`qr.query('SELECT ... FROM ob_card_type', ...)`），皆為未加 schema 前綴的裸表名**，TypeORM 的 `schema` 連線選項**不會**改寫這類字串內容——SQL Server 對未加前綴的物件名稱一律依「目前登入使用者的 `DEFAULT_SCHEMA` 屬性」解析（`docker/mssql-init.sql` 建立 `cdmp` user 時未指定 `WITH DEFAULT_SCHEMA`，故為 `dbo`）。**這與 Postgres 的 `SET search_path` 可於連線期動態切換不同**，SQL Server 無等價的「連線期臨時 schema 覆寫」機制。

**結論**：本輪 ALIAS／SITE／BOOT／COUNT／IDEM 五個測試群組，凡呼叫 `seed.ts`/`seed-datasource.ts`/`prod-data-seed.ts` 或其匯出函式者，**必定**落在 `dbo`（無法像 P1b1/P1b2 的 entity 層測試一樣切到專屬 schema）。

### 0.3 🔴 dbo 資源競爭：P1b3 與 P1b2 必須序列化執行，不可平行

P1b2 已將 `dbo` 設計為其測試套件「獨佔保留」（`beforeAll` 斷言空、`afterAll` 清空）。本輪 P1b3 同樣需要對 `dbo` 進行「先跑 baseline migration 建表 → 執行 bootstrap 寫入大量資料列 → 驗證 → 清空」的完整流程，**與 P1b2 的獨佔假設直接衝突**：若 vitest 依預設 file-parallelism 把 `mssql-p1b2.mssql.spec.ts` 與 `mssql-p1b3.mssql.spec.ts` 排到不同 worker 平行執行，兩者會在同一 `dbo` 同時建表/插資料，造成 `CREATE TABLE` 物件已存在錯誤或資料錯亂（且各自的「執行前斷言 dbo 為空」檢查在平行啟動的時間窗內可能同時通過，無法攔截此競爭）。

**Harness 建議（DevOps 需落地，非測試程式碼本身能防禦）**：
1. 新增 npm script（例如 `"test:mssql:serial": "vitest run --no-file-parallelism src/database/__tests__/*.mssql.spec.ts"`，實際旗標依 vitest 版本 API 為準），將全部 `*.mssql.spec.ts`（含既有 P1a/P1b1/P1b2 + 本輪新增 P1b3）納入**同一序列化執行 lane**，比照既有 `.pg.spec.ts` 之 F098~F109 序列執行慣例（`feedback_pg_spec_parallel_timeout` 記憶）。
2. 此建議**提升**了 P1b2 test 文件既有 `R-MSSQL-P1B2-03`（原標記「低風險、現況無實際污染」）之嚴重度——P1b3 是第二個需要獨佔 `dbo` 的套件，理論風險在本輪成為**現實存在**的執行順序需求，已於 `risks-and-gaps.md` 新增對應風險項並交叉引用升級。
3. 測試逾時：比照 PG reconcile spec 慣例，`beforeAll`/涉及大量列 INSERT 的案例統一設 60s timeout（`feedback_pg_spec_parallel_timeout`）。

### 0.4 建議測試結構：單次 bootstrap 建置 + 多群組唯讀斷言 + IDEM 群組獨立二次呼叫

為避免每個測試案例各自重跑一次完整 36 表 + 全量 seed（成本過高），建議：
1. `beforeAll`：斷言 `dbo` 為空（沿用 P1b2 fail-fast 慣例）→ 以子行程呼叫 `npm run migration:run`（**字面 CLI**，見 §2 ALIAS 群組本身就是要驗證此指令能跑）建出 36 表 → 以子行程依序呼叫 `npm run seed && npm run seed-datasource && npm run data-seed`（或 `npm run bootstrap` 一次到位，見 ALIAS-006）→ 建立完成的 dbo 狀態供 SITE/BOOT/COUNT 群組共用唯讀斷言。
2. SITE/BOOT/COUNT 三群組對同一份 `beforeAll` 建置結果做唯讀斷言，不重複建置。
3. IDEM 群組在自己的 `it()` 內明確**再次**呼叫 bootstrap 相關步驟（第二次執行），驗證冪等後不需要重建（冪等定義即「不變」）。
4. 部分 SITE 案例（漂移偵測、NULL-safe 比對）需要對已建置資料**額外主動竄改一列**再重跑對應 seed 函式一次，驗證 WARN/repair 行為——此類案例安排在 IDEM 群組**之後**執行（因會改動資料，避免影響其他群組的唯讀假設順序）。
5. `afterAll`：完整清空 `dbo`（擴充 P1b1 `dropAllTablesInSchema` 模式，除 DROP 所有 TABLE 外，本輪因資料列本身也是驗證目標，建議直接 `DROP TABLE`＋重建或單純逐表 `DELETE`/`DROP` 皆可回到「空」，並確認 `typeorm_migrations` 一併清空，讓下次任何 mssql 套件執行时前置斷言通過）。

---

## 一、Seed Raw SQL 站點清單（DoD #4 草稿，供 tdd-implementation 逐站點改寫核對）

> 以下為本文件實際逐檔 grep 之精確站點清單（檔案:行號）。「建議轉換方向」為行為對照示例，**非強制字面語法**——只要轉換後行為等價（見對應 TS-ID 之 Given/When/Then），語法可由 tdd-implementation 自行決定（例如 `NOW()` 站點亦可選擇改為 JS 端 `new Date()` 綁定參數，三 driver 皆可攜，未必需要逐個換成 `GETDATE()`）。

### A. DataSource 建構（🔴 AD 未列出，阻擋一切後續轉換）

| 檔案:行號 | 現況 | 問題 | 對應 TS-ID |
|---|---|---|---|
| `seed.ts:60-69` | `new DataSource({ type: 'postgres', ... })` | 硬編碼，完全無視 `DB_TYPE`；`dbType` 變數（L59）宣告後未使用（死碼線索） | DIALECT-001 |
| `seed-datasource.ts:104-112` | 同上 | 同上 | DIALECT-002 |
| `prod-data-seed.ts:720-729` | 同上 | 同上 | DIALECT-003 |

### B. 具名參數化查詢（`$n` → named/bound param）

| 檔案:行號 | 現況 | 建議轉換方向（示例） | 對應 TS-ID |
|---|---|---|---|
| `seed-datasource.ts:42` / `prod-data-seed.ts:140` | `WHERE email = $1 LIMIT 1` | `WHERE email = @0`（或 TypeORM 具名參數語法）+ `TOP(1)` | SITE-001/002 |
| `seed-datasource.ts:46` / `prod-data-seed.ts:146` | `WHERE id = $1` | 同上（無 LIMIT） | SITE-001 |
| `seed-datasource.ts:67` / `prod-data-seed.ts:527,544,595,617,635` | 多處 `WHERE col = $1 ... LIMIT 1` | `TOP(1)` + 具名參數 | SITE-002 |
| `seed-datasource.ts:74-91`（INSERT，10 個 `$n`） | `VALUES ($1,...,$10, ...)` | 具名參數逐一對應 | SITE-001 |
| `prod-data-seed.ts:283-286`（`reconcileTable` 泛用 INSERT，6 張計分卡表共用） | 動態產生 `$${params.length}` | 動態產生具名參數等價寫法 | SITE-006 |
| `prod-data-seed.ts:552-561`（etl_pipelines/etl_pipeline_versions INSERT） | `$1..$8` | 具名參數 | SITE-009/010 |
| `prod-data-seed.ts:644-647`（extraction_tasks INSERT） | `$1..$9` | 具名參數 | SITE-011 |
| `prod-data-seed.ts:708`（deriveMatchType UPDATE） | `$1,$2,$3` | 具名參數 | SITE-012 |

### C. `LIMIT` → `TOP`

| 檔案:行號 | 現況 | 建議轉換方向 | 對應 TS-ID |
|---|---|---|---|
| `seed-datasource.ts:42,49,67` / `prod-data-seed.ts:140,149,527,544,595,617,635` | `... LIMIT 1` 或 `ORDER BY created_at ASC LIMIT 1` | `TOP(1)` 置於 `SELECT` 之後、欄位清單之前；含 `ORDER BY` 者 `ORDER BY` 維持在最後（**常見誤植陷阱：`TOP` 不可放在 `ORDER BY` 之後**） | SITE-002 |

### D. PG 專屬函式 `NOW()`（🔴 AD 未列出）

| 檔案:行號 | 現況 | 建議轉換方向 | 對應 TS-ID |
|---|---|---|---|
| `seed-datasource.ts:78`（×2） | `NOW(), NOW()` | `GETDATE()`/`SYSDATETIME()`，或改為 JS `new Date()` 綁定參數（三 driver 可攜，建議優先考慮） | SITE-004 |
| `prod-data-seed.ts:367,369,390,391,423,424,477,478,499,500`（`reconcileTable extraInsert` sql 片段，共 10 處，5 張表） | `{ sql: 'NOW()' }` | 同上 | SITE-004 |
| `prod-data-seed.ts:441`（column_label UPDATE） | `updated_at = NOW()` | 同上 | SITE-008 |
| `prod-data-seed.ts:554,561,647`（etl_pipelines/versions/extraction_tasks INSERT，共 4 處） | `NOW(), NOW()` | 同上 | SITE-009/010/011 |

### E. PG 專屬子句 `RETURNING id`（🔴 AD 未列出）

| 檔案:行號 | 現況 | 建議轉換方向 | 對應 TS-ID |
|---|---|---|---|
| `prod-data-seed.ts:552-556` | `INSERT INTO etl_pipelines (...) VALUES (...) RETURNING id` | `OUTPUT INSERTED.id`（MSSQL 語法）或改為 INSERT 後緊接一次 `SELECT ... WHERE name=@name` 取回 id（跨 driver 可攜但多一次往返） | SITE-009 |

### F. PG 專屬型別轉換 `::text`（🔴 AD 未列出）

| 檔案:行號 | 現況 | 建議轉換方向 | 對應 TS-ID |
|---|---|---|---|
| `prod-data-seed.ts:560-561` | `VALUES ($1,$2,$3::text,$4,$5,$6, NOW())`（`definition` 欄，值為 `JSON.stringify(...)` 字串） | 目標欄位本身若已是文字型別（`ntext`/`nvarchar(MAX)`），直接移除 cast 即可；若需顯式轉型可用 `CAST($3 AS NVARCHAR(MAX))` | SITE-010 |

### G. PG 專屬 NULL-safe 運算子 `IS NOT DISTINCT FROM`（🔴 AD 未列出，reconcile 引擎核心）

| 檔案:行號 | 現況 | 建議轉換方向 | 對應 TS-ID |
|---|---|---|---|
| `prod-data-seed.ts:225`（`findByKey`，6 張計分卡表共用存在性判斷） | `${col} IS NOT DISTINCT FROM $${params.length}` | `(col = @p OR (col IS NULL AND @p IS NULL))`（標準 SQL，PG/sqlite/mssql 皆可攜，**不需要 driver-conditional 分支**） | SITE-005/006 |
| `prod-data-seed.ts:319`（repair UPDATE 之 WHERE） | 同上 | 同上 | SITE-007 |

### H. 布林字面值 `true`（🔴 AD 未列出，T-SQL 不接受裸關鍵字）

| 檔案:行號 | 現況 | 問題 | 建議轉換方向 | 對應 TS-ID |
|---|---|---|---|---|
| `prod-data-seed.ts:647` | `VALUES (..., true, ...)`（`extraction_tasks.enabled`） | SQL Server T-SQL **無**裸 `TRUE`/`FALSE` 字面值關鍵字（與 PG/MySQL 不同），會被解析為未知識別字，導致 `Invalid column name 'true'` 或等價語法錯誤 | 改為具名/綁定參數傳入 JS `true`（由 driver 轉譯為 `1`），或直接寫字面 `1` | SITE-011 |

### I. 驅動回傳形狀（探測型，非阻擋，僅影響 log 訊息準確度）

| 檔案:行號 | 現況 | 說明 | 對應 TS-ID |
|---|---|---|---|
| `prod-data-seed.ts:446`（`labelUpdated += res[1] ?? 0`）／`prod-data-seed.ts:711`（`updated += res[1] ?? 0`） | 依賴 PG driver 對 UPDATE 之 `qr.query()` 回傳 `[rows, affectedCount]` tuple 慣例 | mssql driver 之回傳形狀**未經本專案驗證**，若非相同 tuple 形狀，`res[1]` 恆為 `undefined`（`?? 0` 已防禦不拋錯，僅 log 訊息可能恆顯示 0 筆，不影響實際 UPDATE 是否成功） | PROBE-001 |

---

## 二、測試場景

### DIALECT 群組（4 案例）——DataSource 建構必須依 `DB_TYPE` 切換，一切轉換的前提

#### TS-MSSQL-P1B3-DIALECT-001：`seed.ts` 之 DataSource 依 `DB_TYPE=mssql` 建立 MSSQL 連線
- **Given**：環境變數 `DB_TYPE=mssql` 及對應 `DB_HOST`/`DB_PORT`/`MSSQL_TEST_*` 指向可達之 `CDMP_TEST`。
- **When**：以子行程執行 `npm run seed`（或直接呼叫 `seed()` 匯出函式，若腳本改為可測試的匯出結構）。
- **Then**：程序成功連線並完成（非嘗試以 PG wire protocol 連向 MSSQL socket 而立即拋出協定層錯誤）；4 個測試帳號寫入 `users` 表。
- **對應 DoD**：P1b3 DoD #1 前提（AD 未列出但邏輯必要）。

#### TS-MSSQL-P1B3-DIALECT-002：`seed-datasource.ts` 之 DataSource 依 `DB_TYPE=mssql` 建立 MSSQL 連線
- **Given/When/Then**：同上，對象為 `seed-datasource.ts` 之 `main()`；驗證 `datasources` 表寫入空殼列。

#### TS-MSSQL-P1B3-DIALECT-003：`prod-data-seed.ts` 之 DataSource 依 `DB_TYPE=mssql` 建立 MSSQL 連線
- **Given/When/Then**：同上，對象為 `prod-data-seed.ts` 之 `main()`；驗證計分卡 6 表寫入。

#### TS-MSSQL-P1B3-DIALECT-004（靜態）：三支腳本零殘留硬編碼 `type: 'postgres'`
- **Given**：三支腳本改寫完成之原始碼。
- **When**：靜態掃描 `type: 'postgres'` 字面值（排除註解/測試 mock 檔）。
- **Then**：三支腳本之 `new DataSource({...})` 建構皆改為依環境變數/共用 helper 決定 dialect，零殘留裸字面值。

---

### ALIAS 群組（6 案例）——B2 npm alias 修復驗證（DoD #1 核心）

#### TS-MSSQL-P1B3-ALIAS-001：字面 `npm run migration:run`（非 P1b2 之 node launcher workaround）對 MSSQL 成功
- **Given**：`CDMP_TEST.dbo` 為空；`DB_TYPE=mssql` 環境變數；package.json 之 `typeorm`/`migration:run` script 已修復（P1b2 impl log §4.2 記錄之 Node 24 + workspace hoisting 失效問題已解決）。
- **When**：以子行程字面執行 `npm run migration:run`（**不**使用 P1b2 之 `node -r tsconfig-paths/register -r ts-node/register/transpile-only <root>/node_modules/typeorm/cli.js ...` 替代寫法）。
- **Then**：exit code 0；36 表建立；`typeorm_migrations` 恰 1 筆。
- **對應 DoD**：P1b3 DoD #1（🔴 核心紅線，直接驗證 P1b2 §4.2 之「需裁示」項目已解決）。

#### TS-MSSQL-P1B3-ALIAS-002：字面 `npm run migration:revert` 對稱可用
- **Given/When/Then**：延續 ALIAS-001 建出的 schema，執行 `npm run migration:revert`，exit 0，36 表移除、`typeorm_migrations` 恰 0 筆。

#### TS-MSSQL-P1B3-ALIAS-003：字面 `npm run seed` 對 MSSQL exit 0
- **Given**：dbo 已有 36 表（ALIAS-001 之後）。
- **When**：執行 `npm run seed`。
- **Then**：exit 0；4 個測試帳號建立。

#### TS-MSSQL-P1B3-ALIAS-004：字面 `npm run seed-datasource` 對 MSSQL exit 0
- **Given**：ALIAS-003 之後（需先有至少 1 個 admin 帳號供 `created_by` 解析）。
- **When/Then**：exit 0；9 筆 datasource 空殼建立。

#### TS-MSSQL-P1B3-ALIAS-005：字面 `npm run data-seed` 對 MSSQL exit 0
- **Given**：ALIAS-004 之後。
- **When/Then**：exit 0；6 張計分卡表 + etl_pipelines + extraction_tasks 寫入。

#### TS-MSSQL-P1B3-ALIAS-006：字面 `npm run bootstrap`（一次性整鏈呼叫）對 MSSQL exit 0
- **Given**：dbo 為空（重新清空後）。
- **When**：執行**單一**指令 `npm run bootstrap`（其內部 `migration:run && seed && seed-datasource && data-seed` 全鏈，非本文件手動拆成 ALIAS-001~005 分步驗證的方式）。
- **Then**：exit code 0；四步驟依序完成之 log 皆出現；資料庫最終狀態與 ALIAS-001~005 分步執行結果一致。
- **對應 DoD**：P1b3 DoD #1（🔴 唯一直接對應「全流程」文字的字面驗證；ALIAS-001~005 為輔助診斷，此案例為 DoD 判定依據）。

---

### SITE 群組（12 案例）——逐站點語法轉換之行為驗證（DoD #4）

> 全數採「行為驗證」而非「SQL 文字比對」（除 STATIC 群組外），對應 quality rule「優先行為驗證而非實作細節檢查」。

#### TS-MSSQL-P1B3-SITE-001：具名參數化查詢於 MSSQL 正確綁定
- **Given**：`users` 表已有 1 筆 email 已知之帳號。
- **When**：呼叫 `resolveCreatedBy`/`resolveSeedUserId`（以該 email 設 `ETL_SEED_USER_EMAIL`）。
- **Then**：回傳正確 `id`；若 email 不存在應 fail-fast 拋出等價錯誤訊息（跨 driver 行為一致）。

#### TS-MSSQL-P1B3-SITE-002：`TOP(1)` 存在性檢查語意等價 `LIMIT 1`
- **Given**：`datasources` 表已有 1 筆 name 已知列。
- **When**：呼叫 `seedDatasources` 對同名 datasource 重跑一次。
- **Then**：判定「已存在」並 SKIP（不重複 INSERT）；反向情境（name 不存在）判定「不存在」並正確 INSERT。

#### TS-MSSQL-P1B3-SITE-003：`LOWER()` 大小寫比對跨 driver 行為一致
- **Given**：`datasources.json` 內某筆 name 為 `APYHFC16.OB`；DB 內已存在同名但大小寫不同之列（如 `apyhfc16.ob`）。
- **When**：重跑 `seedDatasources`。
- **Then**：判定為已存在（大小寫不敏感比對）並 SKIP，不因大小寫差異誤判為新列而重複 INSERT（**注意**：MSSQL BIN collation 本身大小寫敏感，此案例特別驗證 `LOWER()` 函式層面的顯式正規化在 BIN collation 下仍正確抵消大小寫差異）。

#### TS-MSSQL-P1B3-SITE-004：時間戳記寫入值落在測試執行時間窗（NOW() 站點，行為驗證非文字比對）
- **Given**：測試開始前記錄 `testStart = new Date()`。
- **When**：執行任一觸發 INSERT 的 seed 函式（如 `seedDatasources`、`seedCardTypes` 空表全插）。
- **Then**：新插入列之 `created_at`/`updated_at` 讀回值介於 `testStart` 與測試結束時刻之間（容忍時鐘漂移數秒），且非 NULL、非 1970 epoch 等異常值。

#### TS-MSSQL-P1B3-SITE-005：NULL-safe 自然鍵比對正確處理 NULL 分量（`IS NOT DISTINCT FROM` 站點）
- **Given**：`ob_levelcard_score.json` 中存在 `level1=null` 且 `level2_s`/`level2_e` 有值之列（真實 seed 資料，449 筆中 212 筆 `level1=NULL`），已完成一次全插。
- **When**：重跑 `seedScores`（第二次呼叫，資料未變）。
- **Then**：所有 `level1=NULL` 之列皆被判定「已存在」（NULL 視為與 NULL 相等）並 SKIP，**不得**因 NULL 分量比對失敗（若誤用 `=` 取代 `IS NOT DISTINCT FROM` 會導致 `NULL = NULL` 恆為 unknown，每次重跑都誤判為新列而重複 INSERT）而產生重複列。
- **對應 DoD**：本案例為 SITE 群組最高風險項——真實生產種子資料大量依賴此 NULL-safe 語意，若轉換有誤，`ob_levelcard_score` 表每次重跑 bootstrap 會累積出重複列（違反 DoD #3 冪等性）。

#### TS-MSSQL-P1B3-SITE-006：`reconcileTable` 加法式 INSERT 路徑於六張計分卡表皆正確運作
- **Given**：`ob_card_type`/`ob_levelcard_version`/`ob_levelcard_column`/`ob_levelcard_score`/`ob_levelcard_level`/`ob_tier` 六表為空。
- **When**：依序呼叫 `seedCardTypes`/`seedVersions`/`seedColumns`/`seedScores`/`seedLevels`/`seedTiers`。
- **Then**：六表列數分別等於對應 JSON 筆數（6/7/53/449/26/27，見 COUNT 群組交叉引用）；`onInserted` 回呼機制（`seedColumns` 之 `insertedKeys`）正確收集新插入列鍵值。

#### TS-MSSQL-P1B3-SITE-007：`reconcileTable` 漂移偵測 + repair UPDATE 路徑於 MSSQL 正確運作
- **Given**：SITE-006 執行後之六表；手動竄改 `ob_card_type` 一筆 `card_name`（模擬業務 UI 已改動）。
- **When**：(a) 預設環境（無 `SEED_REPAIR_DRIFT`）重跑 `seedCardTypes` → 斷言 console.warn 觸發、資料庫值不變；(b) 設 `SEED_REPAIR_DRIFT=true` 重跑 → 斷言值被修回 seed 值。
- **Then**：兩情境行為與既有 PG reconcile spec（`prod-data-seed-reconcile.pg.spec.ts`）之對應案例完全一致。

#### TS-MSSQL-P1B3-SITE-008：`ob_levelcard_column.column_label` 條件式 UPDATE 於 MSSQL 正確運作
- **Given**：`seedColumns` 完成後，某列 `column_label` 為 NULL（新插入時之佔位值）。
- **When**：`seedColumns` 內建之「補 `column_label IS NULL` 」邏輯執行。
- **Then**：僅 `column_label IS NULL` 之列被更新為 seed 值；已有非 NULL `column_label`（模擬業務已手動調整）之列不被覆寫。

#### TS-MSSQL-P1B3-SITE-009：etl_pipelines INSERT 後可正確取得新插入列 id（`RETURNING id` 站點）
- **Given**：`etl_pipelines` 表為空。
- **When**：呼叫 `seedEtlPipelines`（內部依序 INSERT `etl_pipelines` 取回 `pipelineId`，再用該 id INSERT `etl_pipeline_versions`）。
- **Then**：`etl_pipeline_versions.pipeline_id` 之 FK 值等於對應 `etl_pipelines.id`（透過 JOIN 查詢驗證，而非檢查轉換後的 SQL 文字是否為 `OUTPUT INSERTED.id` 或其他寫法——行為契約＝「取回的 id 可正確用於下一筆 INSERT 的 FK」）。

#### TS-MSSQL-P1B3-SITE-010：etl_pipeline_versions 之 `definition` JSON 欄位正確寫入讀回（`::text` cast 站點）
- **Given**：`etl-pipelines.json` 某筆 `definition` 為含中英文與巢狀結構之物件。
- **When**：`seedEtlPipelines` 寫入該筆。
- **Then**：讀回 `etl_pipeline_versions.definition` 並 `JSON.parse()`，與原始 `definition` 物件深度相等（涵蓋中文字元，順手驗證與 F-4 varchar 中文編碼結論一致——本欄位為 `simple-json`/`ntext`，非 `varchar`，故不直接受 F-4 varchar 分支影響，但同樣須驗證中文不 mojibake）。

#### TS-MSSQL-P1B3-SITE-011：extraction_tasks 之布林欄位正確寫入（布林字面值 `true` 站點）
- **Given**：`extraction-tasks.json` 19 筆，皆需寫入 `enabled=true`。
- **When**：呼叫 `seedExtractionTasks`。
- **Then**：19 筆全數 `enabled` 讀回為 `true`（JS boolean，非字串 `'true'` 或拋語法錯誤）；此案例若轉換前直接對 MSSQL 執行應重現 AD 未列出之語法錯誤，轉換後不應再出現。

#### TS-MSSQL-P1B3-SITE-012：`deriveMatchType` 之 `UPDATE ... AS alias` + 相關 `EXISTS` 子查詢於 MSSQL 正確運作
- **Given**：SITE-006 完成後之 `ob_levelcard_column`/`ob_levelcard_score`；已知至少 1 筆新插入 column（`insertedKeys` 非空）。
- **When**：呼叫 `deriveMatchType(qr, insertedKeys)`。
- **Then**：該新插入 column 之 `match_type` 依其對應 `ob_levelcard_score` 資料形態正確推導為 `COMPOSITE`/`CATEGORY`/`RANGE` 三者之一（依 SQL Server 是否支援 `UPDATE tablename AS alias SET ... WHERE` 語法 + 相關 `EXISTS` 子查詢引用外層 alias 之結果為準——**探測型案例**，若 SQL Server 不支援此寫法應在此處明確失敗並記錄，而非在其他案例間接觀察到症狀）。

---

### BOOT 群組（5 案例）——Bootstrap 全流程 End-to-End（DoD #1/#3）

#### TS-MSSQL-P1B3-BOOT-001：乾淨 MSSQL dbo 之 `npm run bootstrap` 全流程零錯誤
- 同 ALIAS-006，此處作為 BOOT 群組之基準前提重複引用（不重複執行，共用 §0.4 建議之單次建置結果）。

#### TS-MSSQL-P1B3-BOOT-002：Bootstrap 完成後 4 個測試帳號可用密碼登入
- **Given**：bootstrap 完成。
- **When**：以 `admin@cdmp.test`／`P@ssw0rd123` 呼叫既有登入流程（bcrypt 比對）。
- **Then**：登入成功，回傳合法 JWT（跨 driver bcrypt hash round-trip 一致，比照 P1a `LOGIN` 群組既有驗證模式）。

#### TS-MSSQL-P1B3-BOOT-003：Bootstrap 完成後 datasources 空殼結構正確
- **Given/When**：bootstrap 完成。
- **Then**：9 筆 datasource，`encrypted_password` 皆為加密空字串 placeholder（`CryptoUtil.decrypt(...) === ''`），`status='unknown'`，`last_tested_at IS NULL`。

#### TS-MSSQL-P1B3-BOOT-004：Bootstrap 完成後 etl_pipelines/versions FK 完整
- **Then**：`etl_pipelines` 列數 = `etl-pipelines.json` 筆數；每筆皆有至少 1 筆對應 `etl_pipeline_versions`，`created_by` FK 指向存在的 `users.id`。

#### TS-MSSQL-P1B3-BOOT-005：Bootstrap 完成後 extraction_tasks 無懸空 FK
- **Then**：19 筆 `extraction_tasks`，每筆 `datasource_id` 皆能 JOIN 到 `datasources` 表現存列（`resolveDs` 之 fail-fast 邏輯未被觸發，即整個 bootstrap 過程無拋錯中止）。

---

### COUNT 群組（12 案例）——參考資料筆數對齊 PG 版本（DoD #2）

> COUNT-001~010 對應 P1b3 三支腳本**實際覆蓋**之表；COUNT-011/012 為 🔴 **SCOPE GAP 決策關卡**（見下方說明與 `risks-and-gaps.md`）。

| TS-ID | 表 | 預期筆數 | 資料來源 |
|---|---|---|---|
| COUNT-001 | `users` | 4 | `seed.ts SEED_ACCOUNTS` |
| COUNT-002 | `datasources` | 9 | `datasources.json` |
| COUNT-003 | `ob_card_type` | 6 | `ob-card-type.json` |
| COUNT-004 | `ob_levelcard_version` | 7 | `ob-levelcard-version.json` |
| COUNT-005 | `ob_levelcard_column` | 53 | `ob-levelcard-column.json` |
| COUNT-006 | `ob_levelcard_score` | 449 | `ob-levelcard-score.json` |
| COUNT-007 | `ob_levelcard_level` | 26 | `ob-levelcard-level.json` |
| COUNT-008 | `ob_tier` | 27 | `ob-tier.json` |
| COUNT-009 | `etl_pipelines` | 6 | `etl-pipelines.json` |
| COUNT-010 | `extraction_tasks` | 19 | `extraction-tasks.json` |

各案例 Given/When/Then 一致模式：**Given** bootstrap 已完成於乾淨 dbo；**When** `SELECT COUNT(*)`；**Then** 等於上表預期筆數，且與同一套 JSON/程式碼在 PG 容器上跑出之筆數一致（不寫死雙份數字，建議測試程式碼直接 `require` 對應 JSON 檔案取 `.length` 作為 oracle，避免未來 JSON 內容變動需同步改兩處）。

#### TS-MSSQL-P1B3-COUNT-011（🔴 SCOPE GAP 決策關卡）：`roles` 表筆數
- **Given**：bootstrap（`migration:run && seed && seed-datasource && data-seed`）已完成於乾淨 dbo。
- **When**：`SELECT COUNT(*) FROM roles`。
- **Then（探測，兩種可能結果皆需記錄，不預設何者為「正確」）**：
  - 若結果為 **0**：確認本案例之假設成立——`roles` 資料**不由 P1b3 任何腳本寫入**（`admin`/`user` 兩筆角色資料現況唯一來源是 PG-only 之 `1711360000001-BaselineReferenceData.ts` migration，其 `up()` 使用 `INSERT INTO public.roles ... ON CONFLICT (role_code) DO NOTHING`，**該檔案完全不在 P1b1/P1b2/P1b3 任何一輪 AD 的改動範圍內**，且 P1b2 之 MSSQL baseline migration 僅含 DDL、不含此類參考資料 INSERT）。此結果代表 AD-E07-39 §8 P1b3 DoD #2 原文列出的「roles...筆數與 PG 版本一致」**在現有三支腳本 + 現有 MSSQL baseline migration 範圍內無法達成**，需回報決策（見下方風險說明）。
  - 若結果非 0：代表已有其他改動（可能是 tdd-implementation 主動擴大範圍）補上此資料，須額外驗證筆數與 PG 版本（2 筆：`admin`/`user`）一致、`role_code` 唯一。
- **對應 DoD**：P1b3 DoD #2 文字要求，但**與現有程式碼範圍衝突**，本案例設計為「決策關卡」而非「必過」案例——測試結果本身即是需要回報給人類決策者的訊號。

#### TS-MSSQL-P1B3-COUNT-012（🔴 SCOPE GAP 決策關卡）：`pooldata_field_whitelist`／`pooldata_field_option` 表筆數
- **Given/When**：同上，`SELECT COUNT(*) FROM pooldata_field_whitelist` 與 `SELECT COUNT(*) FROM pooldata_field_option`。
- **Then（探測）**：與 COUNT-011 同一結構之決策關卡——PG 版本應為 17／186（`1711360000001-BaselineReferenceData.ts` 檔案開頭註解自述之筆數），現況預期 MSSQL 側為 **0**（同一根因：此資料來自 PG-only reference-data migration，不在 P1b1/P1b2/P1b3 任何腳本改動範圍）。
- **對應 DoD**：同 COUNT-011，決策關卡而非必過案例。

---

### IDEM 群組（5 案例）——冪等性（DoD #3）

#### TS-MSSQL-P1B3-IDEM-001：對同一 dbo 重跑 bootstrap 兩次，六表 + users/datasources/etl_pipelines/extraction_tasks 總列數不變
- **Given**：BOOT 群組完成後之 dbo（第一次 bootstrap 結果）。
- **When**：再次執行 `npm run seed && npm run seed-datasource && npm run data-seed`（`migration:run` 不重跑，因表已存在；且 `migration:run` 本身對已套用之 migration 天然冪等，不在本群組重複驗證）。
- **Then**：所有表列數與第一次執行後完全相同（COUNT 群組之全部數字不變）。

#### TS-MSSQL-P1B3-IDEM-002：第二次執行 console 訊息呈現「0 新增／N 已存在」而非重複 INSERT 拋錯
- **Given/When**：同上。
- **Then**：子行程標準輸出包含各表「0 新增」或等價「已存在，SKIP」訊息；子行程 exit code 仍為 0（非因唯一鍵衝突而拋錯中止）。

#### TS-MSSQL-P1B3-IDEM-003：漂移偵測邏輯在值未變動情況下第二次執行不重複 WARN
- **Given**：IDEM-001 之後，資料值皆與 seed JSON 一致（無人為竄改）。
- **When**：再次執行 `data-seed`。
- **Then**：console 輸出不包含「[漂移]」字樣（因所有既有列值與 seed 值相等，不觸發 drift 分支）。

#### TS-MSSQL-P1B3-IDEM-004：`SEED_REPAIR_DRIFT=true` 情境下漂移修復後之第二次執行偵測 0 筆漂移
- **Given**：SITE-007 情境（人為竄改 `ob_card_type` 一筆後以 `SEED_REPAIR_DRIFT=true` 修復）。
- **When**：修復完成後再次以 `SEED_REPAIR_DRIFT=true` 執行 `seedCardTypes`。
- **Then**：`driftDetected === 0`（已修復，不再重複偵測到差異）。

#### TS-MSSQL-P1B3-IDEM-005：`seed.ts` 對既有帳號之 drift-repair（role/status/is_sales_manager）第二次執行冪等
- **Given**：`seed.ts` 已建立 4 帳號且欄位與 `SEED_ACCOUNTS` 定義一致。
- **When**：再次執行 `npm run seed`。
- **Then**：console 輸出 4 筆皆為「Skip: ... (already correct)」，`users` 表列數不變、`updated_at` 等欄位未被無謂觸碰（若有此類欄位）。

---

### REG 群組（5 案例）——回歸（DoD #6 + tsc）

#### TS-MSSQL-P1B3-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨
- 沿用 `feedback_vitest_no_typecheck` 教訓，三支腳本改寫後之型別檢查閘門。

#### TS-MSSQL-P1B3-REG-002：既有 PG reconcile spec（`prod-data-seed-reconcile.pg.spec.ts`）改寫後仍全綠
- **Given**：`prod-data-seed.ts` 之 `IS NOT DISTINCT FROM`→NULL-safe 等價寫法、`NOW()`→（若改為 JS `Date` 綁定）等轉換已套用。
- **When**：對 PG 容器（`docker compose -f docker-compose.test.yml up -d postgres-test`）重跑既有 PG reconcile spec。
- **Then**：全部既有案例維持綠燈（NULL-safe 轉換後之寫法在 PG driver 上必須仍正確，不可只顧 MSSQL 相容而破壞 PG 既有行為——此為「三 driver 共用同一份可攜 SQL」設計若可行時的驗證閘門；若 tdd-implementation 選擇 driver-conditional 分支寫法，本案例改為驗證 PG 分支未被誤改）。

#### TS-MSSQL-P1B3-REG-003：sqlite 端代表性 regression（因三腳本本身不支援 sqlite 執行路徑）
- **說明**：`seed.ts`/`seed-datasource.ts`/`prod-data-seed.ts` 現況與改寫後皆設計為僅供 postgres/mssql 部署使用（sqlite 為測試/開發記憶體 DB，不透過這三支腳本 seed），故本案例比照 P1b2 REG-004 慣例，改驗證**受影響的共用模組**（如 `CryptoUtil`、`User`/`Role` entity 之 sqlite 分支）未因本輪改動受影響：跑 `auth.guard`/`auth.service` 代表性既有 sqlite 單元測試套件，確認全綠。

#### TS-MSSQL-P1B3-REG-004：P1a/P1b1/P1b2 既有 mssql spec 套件不回歸
- **When**：依 §0.3 序列化執行慣例，依序跑 `mssql-p1a.mssql.spec.ts`（25）+ `mssql-p1b1.mssql.spec.ts`（43）+ `mssql-p1b2.mssql.spec.ts`（39）。
- **Then**：107 案例全綠（三檔案總和，沿用各自 impl log 已記錄之基準）。

#### TS-MSSQL-P1B3-REG-005：`bootstrap` npm script 之步驟順序文字未被更動
- **Given**：`package.json` 之 `"bootstrap": "npm run migration:run && npm run seed && npm run seed-datasource && npm run data-seed"`。
- **When**：改寫完成後讀取該行。
- **Then**：四步驟順序與既有文字完全相同（本輪僅修復 `typeorm`/`migration:run` 底層 alias 與三支腳本內容，未變更編排順序本身，避免範圍蔓延至架構層決策）。

---

### PROBE 群組（2 案例）——探測型/決策關卡

#### TS-MSSQL-P1B3-PROBE-001：`qr.query()` 對 UPDATE 語句於 mssql driver 之回傳形狀
- **Given**：`ob_levelcard_column` 已有至少 1 筆 `column_label IS NULL` 之列。
- **When**：執行觸發該 UPDATE 分支之 seed 邏輯，並直接檢視 `qr.query()` 之回傳值結構。
- **Then（探測，不預設哪個結果「正確」）**：記錄回傳值是否為 `[rows, affectedCount]` tuple 形式（PG 慣例）、純陣列、或 `{rowsAffected}` 物件；若非 PG 慣例形式，`res[1] ?? 0` 恆為 0——**此結論僅記錄為已知限制**（log 訊息筆數可能不準確），因該數值不影響任何後續邏輯分支（純 log 用途），**不構成阻擋**。

#### TS-MSSQL-P1B3-PROBE-002（決策關卡彙整）：P1b3 完成後仍缺的資料範圍總結
- **Given**：COUNT-011、COUNT-012、PROBE-001 之探測結果。
- **When**：彙整三者結論。
- **Then**：產出明確結論陳述（供 tdd-implementation 直接引用，不需重新推導）：「P1b3 三支腳本改寫完成後，MSSQL 側 `roles`（預期 2 筆）與 `pooldata_field_whitelist`/`pooldata_field_option`（預期 17/186 筆）**仍為 0 筆**，因此兩張表之參考資料來源（PG-only `1711360000001-BaselineReferenceData.ts`）不在 P1b1/P1b2/P1b3 任一輪改動範圍內；`qr.query()` UPDATE 回傳形狀差異僅影響 log 訊息準確度，不影響功能正確性」。此結論直接對應 `risks-and-gaps.md` 新增風險項，需人類決策後續處置方向（納入 P1b3 收尾、另開 P1b4、或明確記錄為已知技術債延後處理）。

---

### STATIC 群組（3 案例）——靜態掃描

#### TS-MSSQL-P1B3-STATIC-001：三支腳本轉換後零殘留 PG-only 語法
- **Given**：三支腳本改寫完成之原始碼。
- **When**：靜態掃描 `::`（型別轉換）、`RETURNING`、未經處理之裸 `NOW()`（若選擇全面改為 JS Date 綁定則應零殘留；若選擇改 `GETDATE()` 則改為掃描零殘留 `NOW()`）、`IS NOT DISTINCT FROM`（若改為可攜寫法則應零殘留）、`VALUES (...true...)`／`VALUES (...false...)` 裸字面值、`LIMIT`。
- **Then**：依 tdd-implementation 實際選擇之轉換路徑，逐項零命中（本案例之掃描清單需在實作階段依實際選擇的轉換方式調整，非一成不變）。

#### TS-MSSQL-P1B3-STATIC-002：三支腳本零殘留硬編碼 `type: 'postgres'`
- 同 DIALECT-004，此處作為 STATIC 群組交叉引用。

#### TS-MSSQL-P1B3-STATIC-003：Seed Raw SQL 站點清單文件存在且逐站點對應
- **Given**：P1b3 DoD #4 要求「產出『seed raw SQL 站點清單』文件（檔案路徑+行號+轉換前後對照）」。
- **When**：檢視 tdd-implementation 產出之 implementation log 或獨立文件。
- **Then**：涵蓋本文件 §1 列出之全部站點類別（A~H，含 5 類 AD 未列出但本文件新增查證之類別），逐站點標明「轉換前 SQL 片段」與「轉換後 SQL 片段」，不得僅涵蓋 AD 原文提及的 `$n`/`LIMIT` 兩類而遺漏 `NOW()`/`RETURNING`/`::text`/`IS NOT DISTINCT FROM`/布林字面值五類。

---

## 三、場景數彙總

| 群組 | 案例數 | 對應 DoD |
|---|---|---|
| DIALECT | 4 | 前提（AD 未列出但邏輯必要） |
| ALIAS | 6 | DoD #1（B2 npm alias 修復，核心紅線） |
| SITE | 12 | DoD #4（站點清單逐站點驗證） |
| BOOT | 5 | DoD #1/#3（全流程 E2E） |
| COUNT | 12（含 2 🔴 決策關卡） | DoD #2（含已知範圍衝突） |
| IDEM | 5 | DoD #3（冪等性） |
| REG | 5 | DoD #6 + tsc gate |
| PROBE | 2 | 探測型，非阻擋 |
| STATIC | 3 | DoD #4 產出物驗收 |
| **合計** | **54** | |

---

## 四、與 AD-E07-39 §7/§8 之落差總結（供 risks-and-gaps.md 交叉引用）

1. **AD §7 風險評估低估轉換範圍**：僅列出 `$n`→named param、`LIMIT`→`TOP` 兩類「純語法轉換」，實際逐檔查證後另有 5 類必須處理才能使 DoD #1 成立的站點（`NOW()`/`RETURNING`/`::text`/`IS NOT DISTINCT FROM`/布林字面值），且三支腳本之 `DataSource` 建構本身硬編碼 `type:'postgres'`，比任何 SQL 語法問題更早阻擋整個 P1b3。
2. **DoD #2 文字範圍與現有程式碼範圍不一致**：`roles`/`pooldata_field_whitelist`/`pooldata_field_option` 三表資料現況唯一來源為 PG-only 之 `1711360000001-BaselineReferenceData.ts`，不在任何一輪 P1b AD 改動範圍內，MSSQL 側 bootstrap 完成後這三表預期仍為 0 筆——此落差已透過 COUNT-011/012 決策關卡設計顯性化，避免 tdd-implementation 誤判「腳本改完即滿足 DoD #2」。

（詳細風險條目見 `docs/test-specs/risks-and-gaps.md` 新增之「MSSQL 全面遷移 P1b3 風險與待決問題」段落。）
