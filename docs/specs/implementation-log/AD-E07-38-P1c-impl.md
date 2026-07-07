---
type: implementation-log
feature_id: AD-E07-38-P1c
feature_name: MSSQL 全面遷移 P1c — Pattern B（$n→具名參數）＋ sp_getapplock 跨 driver 鎖
status: complete
last_updated: 2026-07-07
---

# AD-E07-38 P1c — 實作紀錄（P1 最後一片）

落地核心 4 檔 6 處中之站點 1/2/3/4（站點 5 native cursor 明確排除，移交 Phase 3/4）。
Pattern B `$n`→具名參數（`escapeQueryWithParameters` 慣例，I-MSSQL-PARAM-01）＋
`pg_advisory_xact_lock`→`sp_getapplock` 跨 driver 三分支鎖（I-MSSQL-LOCK-01）。

## 一、Pattern B 逐站點結果

| 站點 | 檔案 | 改法 | 驗證 |
|---|---|---|---|
| 1 | `assignment-run-pipeline.service.ts`（`prefetchScoringSources`，customer_core） | `= ANY($1)` → `IN (:...custoNos)` + `manager.connection.driver.escapeQueryWithParameters` | PARAM-001（static）、PARAM-003（mssql 錯誤分類=表不存在，非語法/繫結錯誤）、PARAM-004/010（sqlite degrade） |
| 2 | `assignment-run-pipeline.service.ts`（`prefetchScoringSources`，ob_arreturndf_min_cap） | `= ANY($1)` → `IN (:...applNos)` + escape | PARAM-005（static）、PARAM-007（**真 mssql 資料等價** `IN (@0,@1,@2)`）、PARAM-008/009（sqlite 邊界：空陣列 guard / 長度 1） |
| 3 | `personnel-ratio.service.ts`（`tryAutoAdvance` [4a]） | 二元 `isPostgres()` gate → 三分支 `acquireAutoAdvanceLock`（新 util） | DISPATCH-001~005、LOCK-001/009 決策關卡、LOCK-006/007/008 rethrow（unit） |
| 4 | `assignment-run-report.service.ts`（`buildExportQuery`） | `WHERE r.run_id = $1` + scope 巢狀 `$2..$N` → `:runId` + `:...emplIds`，**單一次** escape（PARAM-012） | PARAM-011/012/017（static）、**PARAM-016/016b（真 mssql `buildExportQuery` SQL 執行 + scope）**、TC-SCOPE-004~006（既有 sqlite 回歸不破） |

新檔：`apps/api/src/modules/assignment-stage/auto-advance-lock.util.ts`
（`resolveLockDbKind` / `buildLockResource` / `extractLockCode` / `mapMssqlLockCode` /
`acquireAutoAdvanceLock` / `assertMssqlLockPrecondition` / `isPgLockNotAvailable`）。

## 二、鎖三分支（站點 3）

- **postgres**：`SET LOCAL lock_timeout` + `pg_advisory_xact_lock(hashtext($1)::bigint)`；55P03 → `'timeout'`（降級 no-op），其餘 rethrow（行為與改寫前**完全一致**）。
- **mssql**：`sp_getapplock @Resource=@0 @LockMode='Exclusive' @LockOwner='Transaction' @LockTimeout=@1`；回傳碼 `0/1`→acquired、`-1`→timeout（↔55P03 降級 no-op）、`-2/-3/-999`→rethrow。呼叫前 `assertMssqlLockPrecondition`（LOCK-010 防禦性斷言）。
- **other（sqlite）**：no-op（跳過鎖，直接偵測+推進）——與改寫前 `DB_TYPE!=='postgres'` 分支行為一致。

移除死碼：原 `private isPostgres()` / `private isPgLockNotAvailable()`（併入 util）。

## 三、兩個決策探測（真 MSSQL 實測，2026-07-07，SQL2022-Linux RTM-CU25 16.0.4255.1）

### LOCK-001（回傳碼可否經 `manager.query` 取回）→ 可行

`DECLARE @res INT; EXEC @res = sp_getapplock ...; SELECT @res AS lockResult;` 經
`manager.query()` 回傳形狀 **`[{ lockResult: number }]`**（以交易外 -999 路徑實證，該路徑不觸發 DLL）。
**結論**：純 SQL 字串 + `SELECT @res` 取回回傳碼**可行**，不需改用 `mssql` 套件 `Request.output()`。

### LOCK-009（`@LockOwner='Transaction'` 於交易外之真實行為）→ 回傳 -999，不 raise

實測：交易外呼叫回傳碼 **-999**（非拋例外）。AD 原文「直接報錯」不完全精確——
資料庫回的是**錯誤回傳碼**而非 raise。**結論**：I-MSSQL-LOCK-01 為**程式碼契約**，
資料庫不會為呼叫端主動擋下違規使用 → 已於 `tryAutoAdvance` 呼叫鎖前加入
`assertMssqlLockPrecondition`（偵測 `queryRunner.isTransactionActive===false` 即拋）作縱深防禦（LOCK-010）。

### 🔴 額外關鍵發現（環境層，非程式碼）：本容器 sp_getapplock 取鎖路徑 17750 DLL 缺失

本機 MSSQL 容器對 `sp_getapplock` 之**實際取鎖路徑**（Session/Transaction、Exclusive/Shared 皆然）
一律拋 **17750「Could not load the DLL, Reason 126」**——與既有 `sp_executesql` 17750 同一容器層缺陷
（見 `typeorm-mssql-driver-realities` 記憶）。`SELECT 1` / 參數繫結 / 交易外 -999 皆正常，僅 lock-manager DLL 缺失。
屬**環境層 DLL 缺失**，非程式碼契約問題；**生產 Windows SQL Server 不受影響**。
記入 **OQ-MSSQL-P1C-01**。因此 LOCK-002/003/004/005/011/012（需真實取鎖）於偵測到 17750 時 `ctx.skip`，
不偽造綠燈；回傳碼映射（-1/-2/-3/-999）改由 `auto-advance-lock.util.spec.ts` unit mock 完整覆蓋（不需真 DLL）。

## 四、Pattern B 完整站點清單交付物（STATIC-001）

`docs/specs/implementation-log/AD-E07-38-pattern-b-site-inventory.md`——涵蓋 AD §3 D-5 四分類分流
（Stage 1/c360 → Phase 3a；ETL handler + extraction → Phase 4；`postgresql-executor.ts` → Phase 6 刪除；
seed → N/A），每站點含檔案:行。

## 五、測試實跑（pass / skip）

| 群組 | 檔案 | 結果 |
|---|---|---|
| ESCAPE 5 | `pattern-b-escape.spec.ts`（offline） | 5 pass |
| LOCK util / mapping / DISPATCH（helper 層）| `auto-advance-lock.util.spec.ts`（offline） | pass（含 -2/-3/-999 rethrow、55P03、precondition） |
| STATIC/PARAM static 8 | `pattern-b-static.spec.ts`（offline） | 8 pass |
| PARAM sqlite 3 | `pattern-b-param-sqlite.spec.ts`（offline） | 3 pass |
| DISPATCH 5 + F084 auto-advance | `personnel-ratio-auto-advance.service.spec.ts` | pass（DISPATCH-001 MUST-FIX 守門綠 + TC-F084 全數不回歸） |
| LOCK 群組（真 mssql） | `personnel-ratio-sp-getapplock.mssql.spec.ts` | 2 pass（LOCK-001/009 決策關卡）+ **6 skip**（LOCK-002~012 真實取鎖，OQ-MSSQL-P1C-01 DLL） |
| PARAM 站點 1/2/4（真 mssql） | `pattern-b.mssql.spec.ts` | 5 pass（PARAM-003/007/009/016/016b） |
| PARAM PG 等價 | `assignment-run-pipeline-pattern-b.pg.spec.ts` | 5 skip（PG 5433 未起） |
| REG 既有回歸 | report.service / report.scope（TC-SCOPE-001~012）/ personnel-ratio.service / pipeline(sqlite ×3) | 全 pass |
| tsc gate | `tsc --noEmit -p tsconfig.build.json` | EXIT=0 乾淨 |

跨 driver 回歸：sqlite（DISPATCH-003、param-sqlite、pipeline ×3、scope）全綠；mssql 站點 2/4 資料等價實證；
pg 端 5433 未起→ 5 案 skip（不偽造）。

## 六、偏差 / 需裁示

1. **OQ-MSSQL-P1C-01（環境層，非程式碼阻擋）**：本機容器 `sp_getapplock` 取鎖 17750 DLL 缺失，
   LOCK 真實並發 6 案在此環境無法實跑（已 skip-with-reason）。程式碼契約正確、生產 Windows SQL Server 應正常；
   建議 P1c cutover 前於**真實 Windows SQL Server / 修復 DLL 之容器**補跑 LOCK-002~012 完整並發驗證。
2. PG 5433 未起 → 站點 1/2/4 之 PG 等價 5 案 skip；ESCAPE-003 已證 PG `$1/$2/$3` 與改寫前手動編號一致，
   `buildExportQuery` 於 PG 端展開行為不變（cursorRows 沿用 `$n` + positional），既有 TC-SCOPE 綠燈佐證無回歸。
3. 站點 1（`customer_core`）為 AD-E07-37 裁定之 PG-only 表，mssql 上僅能驗「錯誤被正確分類」（PARAM-003），
   非資料等價——為表本身不存在，與 Pattern B 轉換無關（符合測試設計 §0.1）。

## 七、範圍界線（未動）

站點 5（`cursorRows` native cursor）與其餘 ~40 `$n` 站點（Stage 1/ETL/postgresql-executor/c360）**未改**，
僅由站點清單交付物記錄分流 Phase 3a/4/6。周邊 engine SQL 未動。
