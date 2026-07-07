---
type: test-design-infrastructure
test-spec-id: AD-E07-38-P1c
feature_name: MSSQL 全面遷移 P1c — Pattern B（$n→具名參數）＋ sp_getapplock 跨 driver 鎖
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-38-mssql-p1-driver-entity-schema.md（§3 D-5 Pattern B 決策、§3 D-6 P1c 切片與 DoD、§5 不變式、§6 測試邊界）
covers: []
spec_version: "1.0"
date: 2026-07-07
last_updated: 2026-07-07
---

# AD-E07-38 P1c：Pattern B（$n→具名參數）＋ sp_getapplock 跨 driver 鎖 — 測試設計

> 本文件覆蓋 AD-E07-38「MSSQL 全面遷移 P1（Driver/Entity/Schema 基礎層）」之 **P1c 切片**（P1 最後一片）。
> P1（P1a/P1b/P1c）不經 spec-writer（AD §3 D-7 已裁定：純底層儲存/驅動置換，無新業務行為）；本文件依 system-architect
> 產出之 AD-E07-38 §3 D-5/D-6、§5、§6 直接產出測試設計，為 test-designer → tdd-implementation 精簡管線的最後一環。
>
> **範圍**：核心 4 檔 6 處中的站點 1/2/3/4（見 §0.1）。**明確排除**站點 5（`assignment-run-report.service.ts:637-654`
> 之 PostgreSQL native cursor 匯出串流，移交 Phase 3/4）與其餘約 40 個 `$n` 站點（Stage 1/ETL/postgresql-executor/c360，
> 分流至 Phase 3a/4/6，見 §0.1 STATIC-001 交付物）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-38-mssql-p1-driver-entity-schema.md`（§3 D-5/D-6、§5 不變式）+ `apps/api/src/modules/assignment/stage1/stage1-sql-executor.ts`（`escapeQueryWithParameters` 既有慣例樣板）+ `apps/api/src/modules/assignment-stage/personnel-ratio.service.ts`（`isPostgres()`/`isPgLockNotAvailable()` 既有 gate）+ `apps/api/src/modules/assignment-stage/__tests__/personnel-ratio-auto-advance.service.spec.ts`（既有 55P03 mock 樣板）+ `apps/api/src/database/__tests__/mssql-env-preload.ts` |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P1c 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Gating 設計」章節 |

> ⚠️ **AD 文件章節編號漂移沿用既有已知問題**：AD-E07-38 之 Agent Loading Guide 表所寫的 §6/§7/§8 與實際文件標題編號不符
> （Pattern B 決策實為 `## 3. 架構決策彙總` 之 `### D-5`；P1c DoD 實為 `### D-6`；不變式實為 `## 5.`；測試邊界實為 `## 6.`；無 §8）。
> 已於 `AD-E07-38-P1a-test.md` 首次記錄，本文件沿用相同處理原則（依標題文字定位，非依號碼），不重複記入 risks-and-gaps.md。

---

## 零、測試環境、範圍稽核與 Gating 設計

### 0.1 站點清單與範圍界定（test-designer 逐檔查證，非僅依 AD 文字）

| # | 檔案:行 | 現行 SQL | P1c 範圍 | 對應測試群組 |
|---|---|---|---|---|
| 1 | `assignment-run-pipeline.service.ts:1356-1363`（`prefetchScoringSources`） | `... FROM customer_core WHERE source_customer_no = ANY($1)` | ✅ 納入 | PARAM-001~004 |
| 2 | `assignment-run-pipeline.service.ts:1374-1377`（`prefetchScoringSources`） | `SELECT appl_no, add_un_capital FROM ob_arreturndf_min_cap WHERE appl_no = ANY($1)` | ✅ 納入 | PARAM-005~010 |
| 3 | `personnel-ratio.service.ts:488-501`（`tryAutoAdvance` [4a]） | `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)` | ✅ 納入（核心） | LOCK-001~012、DISPATCH-001~005 |
| 4 | `assignment-run-report.service.ts:554-621`（`buildExportQuery`） | `WHERE r.run_id = $1${scopeClause}`（**scopeClause 內含巢狀 $n，見 0.2**） | ✅ 納入 | PARAM-011~017 |
| 5 | `assignment-run-report.service.ts:637-654`（`cursorRows`） | `DECLARE export_cursor NO SCROLL CURSOR FOR ${query.sql}` | ❌ **明確排除**（PostgreSQL native cursor 機制本身不屬 P1，移交 Phase 3/4） | 不設計 |

**🔴 重要查證結果（影響站點 1/2 之可測性差異，AD 原文未區分）**：
- `customer_core`：全域 grep `apps/api/src/database/entities/` 與 `apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts` 均**零命中**——確認為 AD-E07-37 已裁定之 **PG-only 表**（無 entity、P1b 全 37 entity baseline 及 MSSQL baseline migration 皆不含此表）。故站點 1 在 MSSQL 上**恆定**因 `invalid object name 'customer_core'` 失敗，與具名參數轉換本身是否正確**無關**——這一點必須在測試設計中明確區分（見 PARAM-003），否則容易誤判為 Pattern B 轉換失敗。
- `ob_arreturndf_min_cap`：確認**有** entity（`ob-arreturndf-min-cap.entity.ts`）且**已在** MSSQL baseline migration 建表（`1751884800000-MssqlBaselineSchema.ts:74`：`CREATE TABLE "ob_arreturndf_min_cap" (...)`）。故站點 2 可在真實 MSSQL 上做**完整資料等價性**驗證（非僅語法驗證）。

### 0.2 🔴 scopeClause 巢狀 `$n` 稽核結果（AD 要求之稽核項，交付 tdd-implementation）

逐行查證 `buildExportQuery`（`assignment-run-report.service.ts:554-576`）：

```ts
const params: unknown[] = [runId];          // params[0] = runId，對應 $1
let scopeClause = '';
if (this.scope.shouldFilter(actor)) {
  const scope = await this.scope.getScopeEmplIds(actor!.userId);
  const emplids = [...scope];
  if (emplids.length === 0) {
    scopeClause = ' AND 1 = 0';              // 無巢狀 $n
  } else {
    const placeholders = emplids
      .map((_, i) => `$${params.length + i + 1}`)   // ⚠️ 動態產生 $2, $3, ... $(1+N)
      .join(', ');
    scopeClause = ` AND r.emplid IN (${placeholders})`;
    params.push(...emplids);
  }
}
```

**結論：scopeClause 內確實內嵌巢狀 `$n`**——當 `scope.shouldFilter(actor)===true` 且該使用者轄區 `emplids.length>0`（section_chief 有轄區的一般情形）時，`scopeClause` 會產生 `$2, $3, ..., $(1+N)`（N=轄區員編數，動態編號，非固定寬度）。共三個互斥分支：

| 分支 | scopeClause 內容 | 是否有巢狀 $n |
|---|---|---|
| `shouldFilter=false`（director/admin bypass） | `''` | 否，僅主參數 `$1` |
| `shouldFilter=true` 且 `emplids.length===0`（無轄區） | `' AND 1 = 0'` | 否 |
| `shouldFilter=true` 且 `emplids.length>0`（一般 section_chief） | `' AND r.emplid IN ($2, $3, ...)'` | **是**，動態數量 |

**對 tdd-implementation 的硬性要求（I-MSSQL-PARAM-01）**：`runId` 與 `emplids` 必須組成**同一個**具名參數 SQL 字串（例如 `WHERE r.run_id = :runId AND r.emplid IN (:...emplIds)`），交給**單一次** `escapeQueryWithParameters` 呼叫展開，**不可**將 `$1`（主參數）與巢狀 `$2..$N`（scope 子句）分開用兩套機制個別處理——否則兩段落之間的位置編號基準會不一致（`:...arr` 展開的參數起始序號依該次呼叫內字串中出現順序決定，見 ESCAPE-003 之驗證）。

### 0.3 既有可攜慣例：`escapeQueryWithParameters`（不可另創新風格，I-MSSQL-PARAM-01）

`stage1-sql-executor.ts:28-44` 已建立專案標準寫法：

```ts
function escape(manager: EntityManager, sqlWithNamedParams: string, params: Record<string, unknown>): [string, unknown[]] {
  const [sql, parameters] = manager.connection.driver.escapeQueryWithParameters(sqlWithNamedParams, params, {});
  return [sql, parameters];
}
```

此函式**不需要真實資料庫連線**——`driver.escapeQueryWithParameters` 是純字串轉換方法（PG→`$1,$2,...`／SQLite→`?,?,...`／MSSQL→`@0,@1,...`），只要 `DataSource` 建構出對應 driver 物件即可呼叫，這是 §一 ESCAPE 群組全數可離線驗證的依據（詳見 §一）。

### 0.4 檔名慣例與 Gating

- 需要真實 MSSQL 連線的群組（LOCK 核心行為、PARAM 站點 2/4 之 MSSQL 資料等價性）沿用既有 `*.mssql.spec.ts` + `mssql-env-preload.ts` + `mssqlPortReachable()` gating（連不上整檔 `describe.skip` + SKIP_REASON，不可假造綠燈）；沿用既有 `.env.test.mssql`，**不需新增**環境設定檔。
- 需要真實 PostgreSQL 連線的群組（PARAM 站點 1/2/4 之 PG 等價性 baseline）沿用既有 `*.pg.spec.ts` + `pg-env-preload.ts`，與 F098~F109 序列執行。
- **ESCAPE 群組例外**：全數為純函式驗證（`driver.escapeQueryWithParameters`，不連線任何資料庫），**不需**任何 gating，建議獨立為一般 `.spec.ts`（無 `.mssql.`/`.pg.` 中綴），CI 恆常執行，是本輪 CI 成本最低、訊號最快的測試群組。
- **建議測試檔案配置**（非強制檔名，供 tdd-implementation 參考）：
  - `src/modules/assignment/services/__tests__/pattern-b-escape.spec.ts`（ESCAPE 群組，永遠執行）
  - `src/modules/assignment/services/__tests__/assignment-run-pipeline-pattern-b.pg.spec.ts`（PARAM 站點 1/2 之 PG 等價性）
  - `src/modules/assignment/services/__tests__/pattern-b-mssql.mssql.spec.ts`（PARAM 站點 2/4 之 MSSQL 資料等價性，station 1 因 customer_core PG-only 僅做「錯誤被正確分類」驗證）
  - `src/modules/assignment-stage/__tests__/personnel-ratio-sp-getapplock.mssql.spec.ts`（LOCK 群組核心，真實 MSSQL 雙連線並發）
  - `personnel-ratio-auto-advance.service.spec.ts`（既有檔案擴充 DISPATCH 群組之 mock 部分，比照既有 TC-F084-014~016 模式）
  - `assignment-run-report.scope.spec.ts`（既有檔案擴充 PARAM 站點 4 靜態掃描斷言）

### 0.5 🔴 已查證之現行程式碼缺口（非 AD 明文要求，但直接影響 I-MSSQL-LOCK-01 是否成立，需 tdd-implementation 必修）

`personnel-ratio.service.ts:565-568` 現行 `isPostgres()`：

```ts
private isPostgres(): boolean {
  const dbType = (process.env.DB_TYPE ?? 'postgres').toLowerCase();
  return dbType === 'postgres' || dbType === 'postgresql' || dbType === 'pg';
}
```

`tryAutoAdvance` [4a] 目前是 `if (this.isPostgres()) { ...走鎖... }`（**二元 gate，無 else 分支**）——這代表 `DB_TYPE='mssql'` 在**現行未修改的程式碼**下會被 `isPostgres()` 判為 `false`，與 `sqlite` 落入**同一個**「完全跳過鎖」路徑，而非呼叫 `sp_getapplock`。若 P1c 僅新增一個 `sp_getapplock` SQL 片段而未同步把這個二元 gate 改為三分支（`postgres`→advisory lock／`mssql`→`sp_getapplock`／其餘→no-op），`sp_getapplock` 程式碼會是死碼、永遠不會被觸發。**DISPATCH-001 即為此缺口的直接守門測試**，設計上刻意針對「目標狀態」斷言（對現行未修改程式碼會 FAIL，這是預期中的紅燈，用以確保 tdd-implementation 確實把 gate 改為三分支，而非只加程式碼但忘記接線）。

---

## 一、ESCAPE — driver 具名參數展開（I-MSSQL-PARAM-01，免真實 MSSQL 連線）

> **對應**：AD §3 D-5「改用專案既有慣例 `:...arr` + `escapeQueryWithParameters`」；I-MSSQL-PARAM-01。
> **可執行性**：全數**不需**真實 MSSQL/PG 連線，僅需 `new DataSource({type:'mssql'|'postgres'|'sqlite', ...})` 建構出 driver 物件（不呼叫 `.initialize()`）。

### TS-MSSQL-P1C-ESCAPE-001：`IN (:...arr)` 於 mssql driver 展開為合法 `@0,@1,@2...`
- **Test Type**：Positive / Unit（純函式，離線）
- **Steps**：`new DataSource({type:'mssql', entities:[], ...} as any).driver.escapeQueryWithParameters('SELECT * FROM t WHERE x IN (:...custoNos)', { custoNos: ['A','B','C'] }, {})`
- **Expected Result**：回傳 `[sql, params]`；`sql` 含 `IN (@0, @1, @2)`（或 driver 實際慣例之等價合法語法，逐一比對非假設）；`params` 陣列依序為 `['A','B','C']`

### TS-MSSQL-P1C-ESCAPE-002：`:runId` 單一具名參數展開為 `@0`
- **Test Type**：Positive / Unit
- **Steps**：同上，SQL 改為 `WHERE run_id = :runId`，`{ runId: 'RUN001' }`
- **Expected Result**：`sql` 含 `run_id = @0`；`params` = `['RUN001']`

### TS-MSSQL-P1C-ESCAPE-003：🔴 混合情境——`:runId` + `:...emplIds` 同字串展開之編號順序（對應 §0.2 稽核結論）
- **Test Type**：Positive / Unit（決定性驗證，非假設）
- **Steps**：`escapeQueryWithParameters('WHERE r.run_id = :runId AND r.emplid IN (:...emplIds)', { runId: 'RUN001', emplIds: ['E1','E2'] }, {})`
- **Expected Result**：`sql` 依字串內**出現順序**展開（`run_id = @0 AND r.emplid IN (@1, @2)`），`params` = `['RUN001','E1','E2']`；本案例之實測結果即為 §0.2 要求「單一次 escapeQueryWithParameters 呼叫」設計的直接依據——**若實測順序與此不符，須更新本文件與 tdd-implementation 溝通之編號假設，不可事後才發現**

### TS-MSSQL-P1C-ESCAPE-004：空陣列 `:...arr` 之 `IN ()` 陷阱——確認既有 guard 仍是必要防線
- **Test Type**：Negative / Boundary
- **Preconditions**：`emplIds: []`
- **Steps**：呼叫 `escapeQueryWithParameters('... IN (:...emplIds)', { emplIds: [] }, {})`
- **Expected Result**：記錄實際輸出（`IN ()` 在多數 SQL dialect 為語法錯誤）；本案例**不要求** `escapeQueryWithParameters` 自行防禦空陣列——目的是確認 `buildExportQuery` 既有 `emplids.length===0 → ' AND 1=0'` 分支（§0.2）在 Pattern B 改寫後**仍必須保留**，不可誤以為具名參數機制會自動處理此邊界

### TS-MSSQL-P1C-ESCAPE-005：三 driver 對照——同一 SQL 片段分別以 pg/sqlite/mssql escape，語法合法且參數順序一致
- **Test Type**：Positive / Cross-driver Regression
- **Steps**：同一字串 `IN (:...arr)` 分別以 `type:'postgres'`／`type:'sqlite'`／`type:'mssql'` 三個 DataSource 之 driver 呼叫
- **Expected Result**：PG→`$1,$2,$3`；SQLite→`?,?,?`；MSSQL→`@0,@1,@2`；三者 `params` 陣列元素順序完全相同（僅佔位符文法不同，語意等價）

---

## 二、PARAM — Pattern B `$n`→具名參數等價性（站點 1/2/4）

### 站點 1（`customer_core`，PG-only，見 §0.1）

> ⚠️ 站點 1 因來源表本身為 PG-only，**無法**在 MSSQL 上做「資料列等價性」驗證，僅能驗證「轉換未引入新的錯誤型態」。

### TS-MSSQL-P1C-PARAM-001：靜態掃描——站點 1 已改為具名參數慣例
- **Test Type**：Static / Regex Guard
- **Steps**：讀取 `assignment-run-pipeline.service.ts` 原始碼，正則比對
- **Expected Result**：不再含 `= ANY($1)` 字面值；含 `IN (:...custoNos)`（或等價具名寫法）+ 呼叫 `escapeQueryWithParameters`（比照 `assignment-list.service.ts` 既有 `IN (:...nos)` 慣例）

### TS-MSSQL-P1C-PARAM-002：[PG 可跑] PG 等價性——改寫前後查詢回傳列數/內容一致
- **Test Type**：Positive / Integration（真實 PostgreSQL）
- **Preconditions**：seed `customer_core` 3+ 筆已知 `source_customer_no`
- **Steps**：以改寫後 `prefetchScoringSources` 對同一批 pool 資料查詢
- **Expected Result**：`ccMap` 內容（欄位值、命中筆數）與改寫前 `ANY($1)` 版本完全相同（沿用 `assignment-run-pipeline-p3.pg.spec.ts`/`-bugfix.pg.spec.ts` 既有 fixture）

### TS-MSSQL-P1C-PARAM-003：🔴 [MSSQL 可跑，但驗證的是「錯誤被正確分類」而非資料等價] customer_core 不存在時之錯誤路徑
- **Test Type**：Negative / Integration（真實 MSSQL）
- **Preconditions**：MSSQL baseline（不含 `customer_core`）
- **Steps**：以 `DB_TYPE=mssql` 呼叫改寫後 `prefetchScoringSources`（`custoNos.length>0`）
- **Expected Result**：查詢拋出「invalid object name 'customer_core'」類錯誤 → 既有 `try/catch` graceful degrade 邏輯捕捉 → `ccMap` 為空 Map，**不拋出例外中斷月跑**（與現行 SQLite 分支行為結構相同）；**斷言重點是「捕捉到的是表不存在錯誤，非參數繫結/語法錯誤」**——若捕捉到的是 SQL 語法錯誤（如 `Incorrect syntax near '$1'`），代表具名參數轉換本身失敗，須視為本案例 FAIL，不可與「表不存在」錯誤混為一談

### TS-MSSQL-P1C-PARAM-004：SQLite 回歸——站點 1 改寫後於 SQLite 仍走既有 graceful degrade
- **Test Type**：Regression
- **Expected Result**：行為與現行（`ANY($1)` 版本）完全相同，`ccMap` 為空 Map，不拋例外

### 站點 2（`ob_arreturndf_min_cap`，已在 MSSQL baseline，可完整跨 driver 驗證）

### TS-MSSQL-P1C-PARAM-005：靜態掃描——站點 2 已改為具名參數慣例
- **Test Type**：Static / Regex Guard
- **Expected Result**：不再含 `appl_no = ANY($1)`；含 `IN (:...applNos)` + `escapeQueryWithParameters`

### TS-MSSQL-P1C-PARAM-006：[PG 可跑] PG 等價性
- **Test Type**：Positive / Integration（真實 PostgreSQL）
- **Preconditions**：seed `ob_arreturndf_min_cap` 3+ 筆
- **Expected Result**：`arMap` 內容與改寫前完全相同

### TS-MSSQL-P1C-PARAM-007：🔴 [MSSQL 可跑，真正的跨 driver 資料等價性] MSSQL 完整資料驗證
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：MSSQL baseline 已含 `ob_arreturndf_min_cap` 表（P1b 已建立）；seed 與 PARAM-006 相同批次資料（`appl_no`/`add_un_capital`）
- **Steps**：以 `DB_TYPE=mssql` 呼叫改寫後 `prefetchScoringSources`
- **Expected Result**：`IN (:...applNos)` 正確展開為 MSSQL 的 `@0,@1,@2...`；`arMap` 內容（`appl_no`→`add_un_capital`）與同批次 fixture 在 PG 之結果**跨 driver 語意等價**（本案例是站點 1/2 中**唯一**可以真正做到「MSSQL 資料列等價性」的案例，因表已跨平台存在）

### TS-MSSQL-P1C-PARAM-008：邊界——`applNos` 空陣列不觸發查詢（三 driver 共通 guard 不變）
- **Test Type**：Boundary
- **Expected Result**：`if (applNos.length > 0)` guard 改寫後仍存在，空陣列時不執行查詢，`arMap` 為空 Map，非因查詢失敗而空

### TS-MSSQL-P1C-PARAM-009：邊界——`applNos` 恰 1 筆時 `IN` 子句退化為單一值仍正確展開
- **Test Type**：Boundary
- **Expected Result**：`escapeQueryWithParameters` 對長度 1 的 `:...arr` 正確展開（非 off-by-one，`IN (@0)` 合法）

### TS-MSSQL-P1C-PARAM-010：SQLite 回歸——站點 2（表不存在）仍走 graceful degrade
- **Test Type**：Regression
- **Expected Result**：行為不變

### 站點 4（`assignment-run-report.service.ts` `buildExportQuery`，含 §0.2 巢狀 $n）

### TS-MSSQL-P1C-PARAM-011：靜態掃描——主參數改為 `:runId`
- **Test Type**：Static / Regex Guard
- **Expected Result**：不再含 `r.run_id = $1`；含 `r.run_id = :runId`

### TS-MSSQL-P1C-PARAM-012：🔴 巢狀 `$n`（scope 子句）同步改為具名參數，且與主參數同一次 `escapeQueryWithParameters` 呼叫展開（對應 §0.2 稽核 + I-MSSQL-PARAM-01）
- **Test Type**：Static + Positive / Integration
- **Steps**：`scopedByCreator=true` 且轄區有 3 名員編時，檢視改寫後 `buildExportQuery` 內部組出的具名參數 SQL 字串（非最終展開結果）
- **Expected Result**：SQL 字串同時含 `:runId` 與 `:...emplIds`（或等價單一具名參數風格），**由同一次** `escapeQueryWithParameters` 呼叫展開，不得拆成兩段分別呼叫（若 tdd-implementation 拆成兩段，展開後之編號基準會不同步，實務上會產生錯誤的 SQL，本案例即為此風險的直接守門）

### TS-MSSQL-P1C-PARAM-013：[PG 可跑] `scopedByCreator=true` + 有轄區 — 等價性
- **Test Type**：Positive / Integration（真實 PostgreSQL）
- **Expected Result**：回傳列數與改寫前 `$1+$2..$N` 版本完全相同（沿用 `assignment-run-report.scope.spec.ts` TC-SCOPE-004 fixture）

### TS-MSSQL-P1C-PARAM-014：[PG 可跑] `scopedByCreator=true` + 無轄區（`AND 1=0` 分支）— 不受影響
- **Test Type**：Regression / Boundary
- **Expected Result**：此分支無巢狀 $n，僅 `:runId` 主參數改寫；回傳 0 列、HTTP 200（BR-F064-14 不回歸）

### TS-MSSQL-P1C-PARAM-015：[PG 可跑] `scopedByCreator=false`（director/admin bypass）— 等價性
- **Test Type**：Regression
- **Expected Result**：僅 `:runId` 單一具名參數，回傳列數與改寫前相同

### TS-MSSQL-P1C-PARAM-016：🔴 [MSSQL 可跑，僅 SQL 本身，不含 cursor 包裝] `buildExportQuery` 產出之 SQL 於 MSSQL 語法合法且資料等價
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：`ob_monthly_run_result`/`ob_pool_data`/`ob_emphire`/`ob_list_definition` 皆已在 MSSQL baseline（P1b 已建立）；seed 對應資料
- **Steps**：以 `DB_TYPE=mssql` 呼叫 `(svc as any).buildExportQuery(runId, actor)` 取得 `{sql, params}`，**直接**以 `manager.query(sql, params)` 執行（**不經過** `cursorRows`，因 `DECLARE...CURSOR` 為站點 5、明確排除）
- **Expected Result**：SQL 可執行、無語法錯誤；回傳列數與內容與同批次 fixture 在 PG 之結果語意等價；本案例明確證明「站點 4 的具名參數轉換」與「站點 5 的 cursor 排除」互不耦合——SQL 本體轉換完成後即可獨立驗證，不需等 Phase 3/4 cursor 重寫才能測試

### TS-MSSQL-P1C-PARAM-017：靜態守門——`buildExportQuery` 全路徑不再殘留裸 `$` 位置參數字面值
- **Test Type**：Static / Regex Guard（fs + regex，非僅 Grep tool，見 `feedback_grep_negative_lookahead` 教訓）
- **Steps**：讀取 `assignment-run-report.service.ts` 原始碼，正則 `/\$\d+/` 掃描 `buildExportQuery` 方法範圍內
- **Expected Result**：零命中（`cursorRows` 之 `${query.sql}` 樣板字串插值本身不算裸 `$n` 位置參數，不誤判）

---

## 三、LOCK — `sp_getapplock` 跨 driver 鎖核心行為（I-MSSQL-LOCK-01，需真實 MSSQL）

> **對應**：AD §3 D-5 `sp_getapplock` 對應表；D-6 P1c DoD #2（a/b/c）；I-MSSQL-LOCK-01。
> **並發 harness 設計**（比照既有 `f084-advisory-lock-patterns.md` 之 PG 雙連線模式，跨 driver 延伸）：
> 兩個獨立 `dataSource.createQueryRunner()`（各自 `.connect()` + `.startTransaction()`），分別在各自交易內呼叫鎖定 SQL 片段，
> 以 `Promise.all()` / 交錯 `await` 控制時序。**本群組直接測試鎖原語本身**（比照 AD §3 D-5 之 T-SQL 片段），
> 使用**測試專用縮短逾時**（如 500ms，取代 production 之 5000ms）以加速測試套件；production 字面值 5000ms 的驗證另見 DISPATCH 群組（黑箱、不需真實等待 5 秒）。

### TS-MSSQL-P1C-LOCK-001：🔴 前提探測——`DECLARE @lockResult INT; EXEC @lockResult = sp_getapplock ...; SELECT @lockResult` 批次可經 `manager.query()` 正確取得回傳碼
- **Test Type**：Probe / 決策關卡（不預設答案）
- **Preconditions**：MSSQL 容器可連線，於顯式交易內
- **Steps**：以 `queryRunner.manager.query()` 執行上述多陳述式批次
- **Expected Result**：記錄實際回傳形狀（是否為 `[{ lockResult: 0 }]` 或其他形狀）；**本案例是後續 LOCK-002~012 能否採用「純 SQL 字串」（而非改用 `mssql` 套件 `Request.output()` 繞過 TypeORM `.query()`）的先決條件**——若此形狀不可靠，tdd-implementation 須改用底層 driver 的 output 參數機制，且本群組後續案例的斷言方式需同步調整（記入 risks-and-gaps.md 之 OQ-MSSQL-P1C-01）

### TS-MSSQL-P1C-LOCK-002：單次呼叫成功取鎖，`COMMIT` 後自動釋放（`@LockOwner='Transaction'`）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Steps**：QueryRunner A 交易內取鎖（resource=`'personnel-ratio:LISTNO1'`）→ 回傳碼 0 或 1 → `commitTransaction()` → 新的 QueryRunner B 立即以同一 resource 再次嘗試取鎖
- **Expected Result**：A 取鎖成功（回傳碼 ∈ {0,1}）；A commit 後 B **立即**（不需等待 `@LockTimeout`）取得鎖成功，證明鎖隨交易結束自動釋放，無需顯式 `sp_releaseapplock`

### TS-MSSQL-P1C-LOCK-003：`ROLLBACK` 後同樣自動釋放
- **Test Type**：Positive / Integration
- **Expected Result**：與 LOCK-002 相同結論，但以 `rollbackTransaction()` 觸發釋放（驗證釋放時機綁定「交易結束」，非僅 `COMMIT` 一種路徑）

### TS-MSSQL-P1C-LOCK-004：兩並發交易競爭同一 resource — 逾時降級（對應 PG `55P03`）
- **Test Type**：Negative / Integration（並發）
- **Preconditions**：QueryRunner A 先取得鎖並持有（不 commit）；QueryRunner B 以縮短 `@LockTimeout`（如 500ms）嘗試同一 resource
- **Steps**：`Promise.all([A 持鎖不放, B 嘗試取鎖並等待])`，B 逾時後 A 才 commit
- **Expected Result**：B 之回傳碼 = `-1`（逾時）；比照 PG `55P03` 之現行降級語意，`tryAutoAdvance` 對應分支應回傳 `noAdvance`（`autoAdvanced:false`，不帶 `failReason`），**不 rethrow**，tx 照常 commit（[1]~[3] 寫入保留）

### TS-MSSQL-P1C-LOCK-005：兩並發交易競爭同一 resource — 等待後取得視為成功（回傳碼 `1`）
- **Test Type**：Positive / Integration（並發）
- **Preconditions**：QueryRunner A 先取鎖，B 以**足夠長**的 `@LockTimeout`（大於 A 預計持有時間）等待；A 於 B 逾時之前主動 commit 釋放
- **Steps**：`Promise.all([A 持鎖 200ms 後 commit, B 立即嘗試並等待])`
- **Expected Result**：B 之回傳碼 = `1`（等待後取得）；依 AD §3 D-5「`0`=立即取得、`1`=等待後取得皆視為成功」，此分支**不得**被誤判為逾時或錯誤

### TS-MSSQL-P1C-LOCK-006：非鎖相關錯誤碼 `-2`（cancelled）仍正確 rethrow
- **Test Type**：Negative / Integration 或 Unit（依 LOCK-001 決策關卡結果擇一）
- **Steps**：模擬回傳碼 `-2`（若真實 MSSQL 難以自然觸發 cancelled，改採 unit mock `mgr.query` 回傳 `[{ lockResult: -2 }]`，比照既有 TC-F084-014~016 之 55P03 mock 模式）
- **Expected Result**：`tryAutoAdvance` **不**降級為 no-op，正確 rethrow 例外（維持現行「其餘一律 rethrow」語意）

### TS-MSSQL-P1C-LOCK-007：非鎖相關錯誤碼 `-3`（deadlock victim）仍正確 rethrow
- **Test Type**：同上（unit mock）
- **Expected Result**：同 LOCK-006

### TS-MSSQL-P1C-LOCK-008：非鎖相關錯誤碼 `-999`（參數或其他錯誤）仍正確 rethrow
- **Test Type**：同上（unit mock，或真實觸發：`@Resource` 傳入超過 255 字元字串）
- **Expected Result**：同 LOCK-006；若採真實觸發（`@Resource` 超長），額外驗證 `listNo` 本身很短（AD 已指出）不會自然產生此邊界，需人工建構超長字串測試專用場景

### TS-MSSQL-P1C-LOCK-009：🔴 前置條件探測——`@LockOwner='Transaction'` 呼叫端未處於顯式交易之真實行為（I-MSSQL-LOCK-01，決策關卡，AD 聲稱「直接報錯」但不預設答案）
- **Test Type**：Probe / 決策關卡
- **Preconditions**：MSSQL 容器可連線，**不** `startTransaction()`（autocommit 模式）
- **Steps**：以未開交易之連線直接呼叫 `sp_getapplock @LockOwner='Transaction'`
- **Expected Result**：記錄真實結果，不預設答案，依兩種可能分支給出後續行動：
  - **若真實拋出例外**：確認 AD §3 D-5「否則直接報錯（可視為額外安全網）」之描述屬實，資料庫層級已提供保護，tdd-implementation 仍建議在程式碼層補一道防禦性斷言（見 LOCK-010）作縱深防禦，但非資料庫行為本身之阻擋項
  - **若未拋出例外**（例如 SQL Server 將呼叫視為隱含單陳述式交易、鎖於陳述式結束後立即自動釋放而非等到外層交易結束）：**代表 I-MSSQL-LOCK-01 是一個純程式碼契約，資料庫不會為呼叫端擋下違規使用**，tdd-implementation **必須**在 `tryAutoAdvance` 呼叫 `sp_getapplock` 前加入明確斷言（例如檢查 `queryRunner.isTransactionActive`），否則未來若有人誤在交易外呼叫此方法，鎖會在單一陳述式後就釋放、完全失去保護效果且不會有任何錯誤提示——此分支風險等級為高，記入 risks-and-gaps.md

### TS-MSSQL-P1C-LOCK-010：（依 LOCK-009 決策結果條件觸發）程式碼層防禦性斷言驗證
- **Test Type**：Positive / Unit（僅當 LOCK-009 判定資料庫不主動報錯時才需納入實作與此測試）
- **Expected Result**：`tryAutoAdvance` 於偵測到傳入之 `EntityManager`/`QueryRunner` 非來自 `dataSource.transaction()`（或等價未在交易內）時，拋出明確錯誤（而非靜默呼叫 `sp_getapplock` 後於陳述式結束瞬間失去鎖保護）

### TS-MSSQL-P1C-LOCK-011：`@Resource` 字串組成正確性——同一 `listNo` 於不同呼叫間鎖住同一資源（免 `hashtext`）
- **Test Type**：Positive / Functional Equivalence
- **Steps**：兩次呼叫皆使用 `listNo='OB202606001'`（不同交易），驗證第二次呼叫必須等待/或逾時（因與第一次鎖住同一 resource）
- **Expected Result**：確認 `@Resource` 直接使用字串（如 `'personnel-ratio:' + listNo`）即可達到與 PG `hashtext($1)::bigint` 版本**功能等價**（同一 `listNo` 互斥）；不需雜湊步驟

### TS-MSSQL-P1C-LOCK-012：不同 `listNo`（不同 `@Resource`）不互相阻塞
- **Test Type**：Positive / Functional Equivalence
- **Steps**：QueryRunner A 鎖 `listNo=X`，QueryRunner B **同時**鎖 `listNo=Y`
- **Expected Result**：兩者皆立即成功（回傳碼 0），互不等待

---

## 四、DISPATCH — 跨 driver 分派契約（I-MSSQL-LOCK-01，含 §0.5 現行缺口守門）

> **設計原則**：黑箱驗證 `tryAutoAdvance` 對外可觀察行為（回傳值形狀），MSSQL 逾時情境改用 unit mock（比照既有 TC-F084-014~016
> 之 55P03 mock 模式，模擬 `mgr.query` 回傳 sp_getapplock 逾時形狀），避免真實等待 production 5000ms 拖慢套件；
> 僅 DISPATCH-001/002 之「成功路徑」需要真實連線驗證分支確實被呼叫（可用極短時間完成）。

### TS-MSSQL-P1C-DISPATCH-001：🔴 `DB_TYPE='mssql'` 時 `tryAutoAdvance` 確實呼叫 `sp_getapplock`（非略過，守住 §0.5 缺口）
- **Test Type**：Positive / MUST-FIX 守門（對現行未修改程式碼預期為紅燈）
- **Preconditions**：`process.env.DB_TYPE='mssql'`
- **Steps**：spy `mgr.query`，呼叫 `tryAutoAdvance`
- **Expected Result**：`mgr.query` 之呼叫參數中出現 `sp_getapplock` 字串（證明分支被觸發，而非如現行 `isPostgres()` 二元 gate 般直接跳過）；**此案例對照 §0.5 所述現行程式碼缺口，tdd-implementation 必須將 `isPostgres()`-only 二元 gate 改為三分支（postgres/mssql/其餘）才能通過**

### TS-MSSQL-P1C-DISPATCH-002：`DB_TYPE='postgres'` 分支不回歸（仍呼叫 `pg_advisory_xact_lock`）
- **Test Type**：Regression
- **Expected Result**：與現行行為完全相同，`mgr.query` 呼叫含 `pg_advisory_xact_lock`

### TS-MSSQL-P1C-DISPATCH-003：`DB_TYPE='sqlite'`（或未知值）分支不回歸（仍跳過鎖）
- **Test Type**：Regression
- **Expected Result**：與現行行為完全相同，`mgr.query` 不含鎖相關 SQL，直接進入 [4b]

### TS-MSSQL-P1C-DISPATCH-004：三分支「成功取鎖」情境之對外回傳值形狀一致
- **Test Type**：Positive / Cross-driver Contract
- **Expected Result**：postgres（真實取鎖成功）／mssql（真實或 mock 取鎖成功）／sqlite（無鎖直接通過）三種情境下，只要後續 [4b]~[4d] 條件相同，`tryAutoAdvance` 回傳 `{ autoAdvanced:true, newStage:'approval', autoAdvanceFailReason:null }` 完全一致

### TS-MSSQL-P1C-DISPATCH-005：postgres 與 mssql 分支「逾時降級 no-op」情境之對外回傳值形狀一致
- **Test Type**：Positive / Cross-driver Contract（mock）
- **Steps**：postgres 分支 mock `mgr.query` 拋 `{code:'55P03'}`；mssql 分支 mock `mgr.query` 回傳 `[{lockResult:-1}]`（依 LOCK-001 決策結果調整 mock 形狀）
- **Expected Result**：兩分支皆回傳 `{ autoAdvanced:false, newStage:null, autoAdvanceFailReason:null }`（**不帶** failReason），且皆不 rethrow，寫入保留（tx 照常 commit）——與現行 PG-only 契約完全對齊，新增 mssql 分支未破壞既有語意

---

## 五、REG — 回歸與 tsc gate

### TS-MSSQL-P1C-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨
- **Test Type**：Static Gate
- **Expected Result**：無新增型別錯誤（`feedback_vitest_no_typecheck`：vitest 不做型別檢查，此為獨立必跑步驟）

### TS-MSSQL-P1C-REG-002：既有 `personnel-ratio-auto-advance.service.spec.ts`（TC-F084-001~030）全數通過
- **Test Type**：Regression
- **Expected Result**：全綠，尤其 TC-F084-014~016（55P03 mock 路徑）不因鎖抽象重構而壞

### TS-MSSQL-P1C-REG-003：既有 `personnel-ratio.service.spec.ts` 全數通過
- **Test Type**：Regression

### TS-MSSQL-P1C-REG-004：既有 `assignment-run-report.service.spec.ts` 全數通過
- **Test Type**：Regression

### TS-MSSQL-P1C-REG-005：既有 `assignment-run-report.scope.spec.ts`（TC-SCOPE-001~012）全數通過
- **Test Type**：Regression
- **Expected Result**：尤其 TC-SCOPE-004~006（匯出 SQL scope 子句斷言）不因具名參數改寫而壞——若既有斷言直接檢查字串 `$2` 之類位置參數字面值，需同步更新斷言方式（改為檢查具名參數或最終展開結果），非本案例本身失敗，而是提醒 tdd-implementation 此耦合點

### TS-MSSQL-P1C-REG-006：既有 F103/F104 `.pg.spec.ts`（站點 1/2 呼叫端 `prefetchScoringSources`）序列執行不退化
- **Test Type**：Regression
- **Expected Result**：`assignment-run-pipeline-p3.pg.spec.ts`、`assignment-run-pipeline-bugfix.pg.spec.ts`、`stage2to4-score-source-f103.pg.spec.ts`、`stage2to4-score-source-f104.pg.spec.ts` 全綠，與 F098~F109 既有序列執行慣例共用 `cdmp_test` DB，禁並行

---

## 六、STATIC — 站點清單交付物與殘留字面值稽核

### TS-MSSQL-P1C-STATIC-001：🔴「Pattern B 完整站點清單」交付物驗收（AD §3 D-5 P1c 交付物）
- **Test Type**：Static / Deliverable Acceptance
- **Steps**：確認 tdd-implementation 產出之站點清單文件（建議路徑 `docs/specs/implementation-log/AD-E07-38-pattern-b-site-inventory.md` 或併入本文件 §0.1 延伸，由 tdd-implementation 決定實際位置）
- **Expected Result**：文件內容涵蓋 AD §3 D-5「其餘 ~40 站點分流建議」四分類（Stage 1/assignment-list raw SQL → Phase 3a；ETL pipeline node handler → Phase 4；`postgresql-executor.ts` → Phase 6 cutover 前刪除；c360 服務 → 待 Phase 3a 一併盤點），每一站點含檔案路徑+行號+建議歸屬 phase，供未來 Phase 3/4 test-designer 直接引用不需重新 grep 全庫

### TS-MSSQL-P1C-STATIC-002：殘留 `$n` 位置參數字面值 regex 守門（fs + regex，非僅 Grep tool）
- **Test Type**：Static / Regex Guard
- **Steps**：對 `assignment-run-pipeline.service.ts`／`personnel-ratio.service.ts`／`assignment-run-report.service.ts`（`buildExportQuery` 範圍，`cursorRows` 除外）以 Node `fs.readFileSync` + 正則 `/\$\d+/` 掃描（比照 `feedback_grep_negative_lookahead` 教訓，不可僅靠 Grep tool 人工判讀）
- **Expected Result**：零命中（`cursorRows` 之樣板字串插值 `${query.sql}` 不算，明確排除）

### TS-MSSQL-P1C-STATIC-003：命名與檔案配置鎖定
- **Test Type**：Static
- **Expected Result**：tdd-implementation 若對 §0.4 建議之檔案配置有調整，本文件之群組編號（PARAM/LOCK/DISPATCH/REG/STATIC）與 test-index.md 之 scenario 計數仍需可追溯（一一對應 TS-ID，不因檔案切分方式改變而遺漏案例）

---

## 附：不變式對應總表

| 不變式 | 對應測試群組 |
|---|---|
| I-MSSQL-PARAM-01（具名參數慣例，不得另創新風格） | ESCAPE 全組、PARAM 全組 |
| I-MSSQL-LOCK-01（`sp_getapplock` 前置條件須在顯式交易內） | LOCK-009/010、DISPATCH 全組 |

## 附：範圍邊界重申

**明確排除**（不在本文件範圍，勿提前設計）：
- 站點 5（`assignment-run-report.service.ts:637-654` PostgreSQL native cursor）→ Phase 3/4（F064 匯出）
- 其餘約 40 個 `$n` 站點（Stage 1/assignment-list raw SQL、ETL pipeline node handler、`postgresql-executor.ts`、c360 服務）→ Phase 3a/4/6，僅由 STATIC-001 交付物記錄清單，不在本輪設計測試
- `fn_calc_tier_level`、collation、baseline parity、bootstrap/seed 腳本 → 已由 P1a/P1b1/P1b2/P1b3 完成，本輪不重複
