---
type: implementation-log
feature_id: F049
feature_name: Stage 0 per-list 案件試算修正（複用月名單分派 Stage 1 演算法）
status: complete
last_updated: 2026-05-26
---

# F049（v1.2）：Stage 0 per-list 案件試算 bug 修正 — 實作日誌

## 1. 背景與根因

Stage 0 單一 `list_no` 案件試算回傳錯誤的 `0`（實測 OB202605004 應為 ≈241,978）。

根因位於 `Stage0EstimateService.buildPoolCountQuery()`，為 F050 v2.1 重構前的舊實作：

- 以 `=` 比對多值 `$$` 分隔字串（如 `prod_kind='01$$N'`），整串比對永不命中
- 欄位映射錯誤：`caseyear` 比到 `ob_pool_data.caseyear`（4 位數西元年），而非 `ob_pool_data.year_cnt`（整數年數）
- `case_status` 未映射至 `ob_pool_data.list_type`
- 完全忽略 `condition_payload`（F050 v2.1 後之 source of truth）

## 2. 修法（已拍板）

讓 `buildPoolCountQuery()` **直接複用** 月名單分派 Stage 1 之純函式 `buildStage1WhereConditions()`
（`assignment/stage1/stage1-query-composer.ts`），消除兩套平行篩選邏輯，確保
estimate ≡ 月名單分派 Stage 1。用法與 `AssignmentRunPipelineService.runStage1ForList()` 完全一致：

- composer 回 `skipReason='EMPTY_CONDITIONS'`（含空 conditions / `_backfill_empty` / wildcard 後零 fragment）→ 試算回 `count = 0`（BR-5，與 Stage 1 skip 一致）
- 否則 `poolRepo.createQueryBuilder('ob_pool_data').where(fragment.where, fragment.params).getCount()`
- composer 產生 bare quoted 欄位名（如 `"year_cnt" IN (...)`，無 alias 前綴），故 alias 名稱不影響 where

### 連帶修正 composer 路徑 A 既有缺陷（與本 bug 同類）

實作 TS-F049-EST-003 時發現：composer 路徑 A 的 categorical fragment 只對 `caseyear → year_cnt`
做特殊映射，**漏掉 `case_status → list_type`**——路徑 A 名單（F050 v2.1 後建立、condition_payload
帶 `columnName: 'case_status'`）會產生 `"case_status" IN (...)` 打到 `ob_pool_data` 不存在的欄位。
此為**月名單分派 Stage 1 本身的潛在 bug**（非僅試算）。

依 Source of Truth 優先序（F049-test > F049 spec > architecture）修正：

- F049 v1.2 AC-4 欄位映射表 L91 明列「欄位映射（路徑 A 與路徑 B 共用）：caseyear → year_cnt、case_status → list_type」
- architecture §18.5 流程圖 D 節點（L4102）+ 共用映射表（L4169）一致要求

於 composer 新增 `PATH_A_COLUMN_MAPPING`（`case_status → list_type`），由 `buildCategoricalFragment`
套用；其餘欄位（不在表中者）沿用原 columnName，行為不變。此修正同時讓月名單分派 Stage 1 與 estimate
逐欄位一致，符合「estimate ≡ Stage 1」目標。

## 3. Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/api/src/modules/assignment-list/stage0-estimate.service.ts | modified | `buildPoolCountQuery` 改為複用 `buildStage1WhereConditions`；EMPTY_CONDITIONS → count=0；warnings 記錄。新增 composer import。`estimateListCount`（404/timeout/timeoutMs<=0）與 `calculateDailyEstimate` 完全未動 |
| apps/api/src/modules/assignment/stage1/stage1-query-composer.ts | modified | 新增 `PATH_A_COLUMN_MAPPING`（case_status → list_type）；`buildCategoricalFragment` 套用路徑 A 共用欄位映射。caseyear→year_cnt 與 wildcard 規則維持原樣 |
| apps/api/src/modules/assignment-list/__tests__/stage0-estimate.service.spec.ts | modified | 改寫既有 AC-4 測試對齊新正確映射（路徑 B 多值 IN + case_status→list_type）；新增路徑 A categorical 多值 COUNT、EST-005c（EMPTY→0）、EST-007（路徑 B COUNT）、EST-001~008 純函式群組 |
| apps/api/src/modules/assignment/stage1/__tests__/stage1-query-composer.spec.ts | modified | 新增 UCQ-005b：路徑 A case_status → list_type 映射（補既有盲區） |

## 4. Test Results Summary

| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F049-EST-001 | 路徑 A categorical 多值 → IN（regression：非 `=`） | PASS |
| TS-F049-EST-002 | 路徑 A caseyear → year_cnt 整數映射 | PASS |
| TS-F049-EST-003 | 路徑 A case_status → list_type 映射 | PASS |
| TS-F049-EST-004a/b | caseyear='99' wildcard（唯一→EMPTY；並存→跳過 year_cnt） | PASS |
| TS-F049-EST-005a/b | EMPTY_CONDITIONS（conditions=[] / _backfill_empty） | PASS |
| TS-F049-EST-005c | Service 層 EMPTY_CONDITIONS → count=0（HTTP 200，BR-5） | PASS |
| TS-F049-EST-006a/b/c | numeric/date BETWEEN；numeric 缺 max → skip+warning 不 throw | PASS |
| TS-F049-EST-007a~d | 路徑 B `$$` split → IN；caseyear 整數；wildcard；全空→EMPTY | PASS |
| TS-F049-EST-008 | SAFE_COLUMN_NAME_RE 防注入 skip+warning 不 throw | PASS |
| TS-F049-EST-009（9a/b/c） | 既有 regression：404 不存在/inactive；timeout=0 → 500 | PASS |
| TS-F049-EST-010 | Integration 真實 ob_pool_data ≈241,978 | DEFERRED（見 §6） |
| UCQ-005b（composer） | 路徑 A case_status → list_type（補盲區） | PASS |

聚焦回歸（assignment-list + assignment/stage1 + assignment-stage）：**20 檔 328 測試全綠**。
其中 stage0-estimate.service.spec.ts 由 8 → 26 測試全綠；stage1-query-composer.spec.ts 35 → 36 全綠。

## 5. api 全套測試結果（pre-existing 失敗區分）

全套：**1609 passed / 17 failed / 67 skipped / 15 todo**。17 個失敗全為 **pre-existing 且與本次修改無關**，
已透過 `git stash` 於乾淨 HEAD 樹逐一複現確認：

| 失敗 spec 檔 | 根因 | 與本次修改關係 |
|---|---|---|
| assignment/services/__tests__/assignment-run-snapshot.service.spec.ts | DI 缺 `ObEmphireRepository`（SectionChiefScopeService） | 無關（未 import 本次改檔，乾淨樹同樣失敗） |
| assignment/services/__tests__/assignment-run-report.service.spec.ts | 同上 | 無關 |
| assignment/services/__tests__/assignment-run-report.scope.spec.ts | 同上 | 無關 |
| etl/__tests__/engine-target-load.spec.ts | 工作樹未提交 etl 變更（target-load-handler.ts，任務明示不碰） | 無關 |
| etl/__tests__/fn-calc-tier-level.spec.ts | etl/target-table schema 相關 | 無關（乾淨樹同樣失敗） |
| etl/__tests__/target-table.service.spec.ts | 同上 | 無關 |
| etl/__tests__/target-table-schemas.spec.ts | 同上 | 無關 |
| extraction-task/executors/__tests__/postgresql-executor.spec.ts | SQL 產生格式期望差異（ORDER BY/LIMIT vs LIMIT/OFFSET） | 無關 |
| extraction-task/executors/__tests__/mssql-executor.spec.ts | 同上 | 無關 |
| extraction-task/executors/__tests__/mysql-executor.spec.ts | 同上 | 無關 |

> 註：全套輸出曾將 `assignment-stage/__tests__/legacy-grep-regression.spec.ts` 列入失敗清單，
> 但單獨執行為 3 passed 全綠——係全套並行模式下被其他失敗檔 stack trace 污染輸出所致，非真失敗。

## 6. TS-F049-EST-010 處置

標記 **DEFERRED — 需真實 PostgreSQL**。理由：

- 該案例需 PostgreSQL TestContainer + 真實 202605 月份 ob_pool_data（E04+E05 ETL seed，數十萬列）驗證 COUNT ≈ 241,978
- 現有 api 測試框架為 vitest + better-sqlite3 in-memory，無 PG TestContainer 基礎設施
- 依 memory：SQLite 對 `year_cnt` integer IN 之型別親和性與 PG 不同，硬接 SQLite 假測試無法保證 PG 行為

替代覆蓋：篩選演算法一致性已由 EST-001~009 純函式 + SQLite COUNT 充分驗證（estimate 與月名單分派共用同一
`buildStage1WhereConditions` 純函式，邏輯一致性可保證）；241,978 之真實基準建議於 staging / E2E
PostgreSQL 環境手動驗證。

## 7. 架構決策與範圍說明

- **未動**：`estimateListCount` 的 404/timeout/timeoutMs<=0 流程、`calculateDailyEstimate`（AC-1/2/3）
- **超出「僅改 buildPoolCountQuery 內部」明面範圍的一處**：composer 路徑 A case_status→list_type 映射。
  屬與本 bug 同類的既有缺陷（影響月名單分派 Stage 1），且為 F049 v1.2 AC-4 + architecture §18.5 明確要求、
  TS-F049-EST-003 列為實作清單之測試；非自行詮釋，為達成「estimate ≡ Stage 1」之必要修正。
- **未提交且未碰**：apps/api/src/modules/etl/.../target-load-handler.ts 及其 spec（任務明示不碰）

## 8. Ground-truth SP 溯源驗證（2026-05-26 補）

使用者要求以原系統 stored procedure 驗證 `case_status` 映射。已比對 `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（Stage 1「依名單設定撈案」實際 SP）之 WHERE 子句：

| 名單欄位（OBMLISTDF） | 比對 OBPOOLDATA 欄位 | composer 對應 | 一致？ |
|---|---|---|---|
| `PROD_KIND` | `o.PROD_KIND` IN(split $$) | `prod_kind` IN | ✓ |
| `LIST_TYPE`（原系統存期別值） | `o.LIST_TYPE` IN(split $$) | `case_status → list_type` IN | ✓ |
| `SPEC_TP` | `o.SPEC_TP` IN(split $$) | `spec_tp` IN | ✓ |
| `CASEYEAR` | `o.YEAR_CNT` IN(split $$) + '99' 特例 | `caseyear → year_cnt` IN | ✓（'99' 見下） |
| `SETTLE_SRC` | `o.SETTLE_SRC` IN(split $$) | `settle_src` IN | ✓ |
| `PROD_BEST` | `o.BEST_CASE` IN(split $$) | `best_case`（同名，pool 有此欄） | ✓ |

- **`case_status → list_type` 經 SP 證實**：原系統把期別篩選存於 `OBMLISTDF.LIST_TYPE`、比對 `OBPOOLDATA.LIST_TYPE`；新系統（AD-E07-14）將該期別語意拆為 `case_status` 欄位、`list_type` 改填常數 '01'，故映射至 `ob_pool_data.list_type` 與 SP 逐欄位吻合。
- **白名單完整性**：9 個可篩選欄位中，`case_status` 是唯一不存在於 `ob_pool_data` 的欄位（已映射），`caseyear` 是唯一語意差異欄位（→ year_cnt 特例處理），其餘同名。composer 修正為完整解，非局部補丁。

### Follow-up（與 SP 的已知差異，本次未變更）

- **caseyear `'99'` wildcard**：SP 為 `o.YEAR_CNT >= 0 AND o.YEAR_CNT < 15`（0–14 封頂）；composer 採 architecture §18.5.1 決策「完全跳過 year_cnt 條件」。因 '99' 在原系統前端為停用選項（有效僅 0–10）、且當前無名單使用，屬理論邊界。**維持 §18.5.1 skip 決策，標記為未來與 SP 對齊之待決議項。**

### 估算範圍澄清

Stage 0 per-list 試算僅套用名單「欄位篩選條件」，**不含** SP 後段另施加的 `MONTH_CNT`（list_period 區間）、近 3 月已派案去重、詐騙/中結/滿期特殊 DELETE 規則。故試算值為「符合名單欄位條件之上界」，實際分派數更少 —— 與 BR-1「實際件數以月名單分派結果為準」一致。

## 9. 既有 ready 名單資料回填（backfill）

改 code 不回填既有資料。以修正後同一演算法（`buildStage1WhereConditions`）撰一次性腳本
`apps/api/src/database/scripts/backfill-stage0-estimate.ts`，對所有 `stage='ready'` 名單重算並 UPDATE
`stage0_estimate_count` / `stage0_estimated_at`。dev 執行結果（已於 UI 準備完成摘要頁確認顯示）：

| list_no | 修復前 | 修復後 |
|---|---|---|
| OB202605001 | 0 | 132,116 |
| OB202605002 | NULL（—） | 138,635 |
| OB202605003 | 0 | 157,451 |
| OB202605004 | 0 | **241,978** |

> OB202605004 = 241,978 與 §6 TS-F049-EST-010 之預期基準**完全吻合** —— 雖未自動化，已於真實
> PostgreSQL dev 資料經 backfill 實測確認。prod / staging 既有 ready 名單需同樣執行此腳本（或下次
> re-approve 由 F086 hook 自動物化）。
