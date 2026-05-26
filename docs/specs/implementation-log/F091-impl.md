---
type: implementation-log
feature_id: F091
feature_name: Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE）
status: complete
last_updated: 2026-05-26
---

# F091：Stage 1 補完整 — 實作日誌

> ⚠️ **PRODUCTION 行為變更**：本實作改變正式月跑 Stage 1 分派案件數（無 feature flag，deploy 後直接生效 — DP-AD23-2）。月跑案件數將**減少**（過濾不符期別 / 近期已派 / 特殊業務排除之案件）。後端 only。

## 測試結果摘要

| Scenario ID | 說明 | 測試層 | 狀態 |
|---|---|---|---|
| TS-F091-MC-001 | interval=1（start=1, end=6）→ [1..6] | Unit | PASS |
| TS-F091-MC-002 | interval=2 → [1,3,5] | Unit | PASS |
| TS-F091-MC-003 | start=end=6 → [6] | Unit | PASS |
| TS-F091-MC-004 | interval > (end-start) → [start] | Unit | PASS |
| TS-F091-MC-005 | list_period_* 缺值 / interval<=0 → skip + warning（不 throw） | Unit | PASS（5a/5b/5c/5c-2 四子場景） |
| TS-F091-MC-006 | month_cnt fragment 以 AND 連接至欄位篩選 | Unit（mock SQL 組合） | PASS |
| TS-F091-DD-001 | 去重視窗計算（workdt-3月 ~ workdt-1日，yyyyMMdd） | Unit | PASS |
| TS-F091-DD-002 | custo_no 在去重集合 → 排除 | Unit（mock repo） | PASS |
| TS-F091-DD-003 | custo_no IS NULL 不誤排 + SQL 含 IS NOT NULL | Unit（mock repo） | PASS |
| TS-F091-DD-004 | 無歷史（空集合）→ 不過濾（退化行為） | Unit（mock repo） | PASS |
| TS-F091-DD-005 | 去重來源聯集 etl_legacy + monthly_run + NULL，SQL 不加 data_source 過濾 | Integration（better-sqlite3） | PASS |
| TS-F091-SD-001 | 詐騙白牌（無條件，不依賴 list_nm） | Unit | PASS |
| TS-F091-SD-002 | 中結強案 payt_term>=deal_num-3 / appl_no T·Y 開頭 | Unit | PASS |
| TS-F091-SD-003 | 中結強案邊界（deal_num-4 保留 / deal_num-3 排除） | Unit | PASS |
| TS-F091-SD-004 | 中結 payt_num>deal_num-8 AND spec_name 含滿 | Unit | PASS |
| TS-F091-SD-005 | 年資 year_produ<當年-15（字串比較）；null→1900 排除 | Unit | PASS |
| TS-F091-SD-006 | 中結強案 + 中結雙重套用（不合併，依 SP 順序） | Unit | PASS |
| TS-F091-SD-007 | 非觸發名單不受 list_nm 規則影響（詐騙白牌仍套用） | Unit | PASS |
| TS-F091-SD-008 | deal_num string 含小數需 Number() 轉換（regression guard） | Unit | PASS |
| TS-F091-CH-001 | 執行順序：詐騙白牌在去重之前；去重 query 被呼叫 | Unit | PASS |
| TS-F091-CH-002 | EMPTY_CONDITIONS skip 保留（不撈 pool / 不去重） | Unit | PASS |
| TS-F091-CH-003 | 月跑模式回完整案件列（MONTH_CNT + 去重交互） | Integration | PASS |
| TS-F091-CH-004 | 月跑 vs dry-run 同 fixture 回相同 count（F092 前置） | Integration | PASS |
| TS-F091-CH-005 | MONTH_CNT skip（list_period_* null）→ 月跑仍繼續 + warning | Unit | PASS |
| TS-F091-RG-001 | 既有 buildStage1WhereConditions 不變更（純函式無副作用） | Regression | PASS（stage1-query-composer 36 tests 不破） |
| TS-F091-RG-002 | 既有 pipeline Integration test 案件數 baseline 更新 | Regression | DONE（見下「既有測試 baseline 更新」） |
| TS-F091-RG-003 | Stage0EstimateService 未升級（F092 才升級） | Regression（標注） | N/A 本階段不動 estimate |

**測試統計**：
- F091 新增：`stage1-filter-chain.spec.ts`（25 tests）+ `stage1-filter-chain.integration.spec.ts`（4 tests）= 29 tests，全綠。
- 受影響既有 pipeline spec：`assignment-run-pipeline.service.spec.ts`（16）/ `-stage1-dynamic.spec.ts`（7）/ `-v2.service.spec.ts`（8）= 31 tests，baseline 更新後全綠。
- 全套 `npx vitest run`（apps/api）：1690 passed / 14 failed（**全部為 pre-existing，與 F091 無關**，已 git stash 驗證 baseline 同樣失敗）。
  - pre-existing 失敗檔（與 F091 無關）：`extraction-task/executors/{mssql,mysql,postgresql}-executor.spec.ts`（SQL 分頁 ORDER BY/OFFSET）、`etl/target-table{,-schemas}.service.spec.ts`（customer_core 欄位數）、`assignment-run-report{,.scope}.service.spec.ts` + `assignment-run-snapshot.service.spec.ts`（NestJS DI `ObEmphireRepository` 缺失）。
- engine-target-load.spec.ts（36 tests）✓ 不破；stage1-query-composer.spec.ts（36 tests）✓ 不破。

## 檔案異動

| 檔案路徑 | 異動類型 | 說明 |
|---|---|---|
| `apps/api/src/modules/assignment/stage1/stage1-filter-chain.ts` | new | Stage1FilterChain 純函式群組 + async 主入口 `executeStage1Chain`（AC-1~AC-8） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage1-filter-chain.spec.ts` | new | MC/DD/SD/CH 純函式 + mock 單元測試（25） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage1-filter-chain.integration.spec.ts` | new | DD-005 聯集 + CH-003/004 一致性（better-sqlite3 in-memory，4） |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | `runStage1ForList(list, workdt)` 改呼叫 `executeStage1Chain(...,{dryRun:false})`；新增 `parseWorkdt(ym)` helper；移除 `buildStage1WhereConditions` 直接 import |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline.service.spec.ts` | modified | RG-002 baseline：`list_interval` '030'→'001'、seedPool 預設 `month_cnt=1` |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-v2.service.spec.ts` | modified | RG-002 baseline：`list_interval` '030'→'001'、seedPool 預設 `month_cnt=1`（原 null） |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-stage1-dynamic.spec.ts` | modified | RG-002 baseline：seedPool 新增 `monthCnt` 參數，預設 `month_cnt=1` |

## Stage1FilterChain 結構（AD-E07-23 §23.2）+ 四步驟關鍵實作

`stage1-filter-chain.ts` 為純函式群組 + 一個 async 主入口，**非 NestJS Injectable**。主入口設計為「接受 repo 參數的 async 純函式」，呼叫端以自身已注入的 `poolRepo` / `poolDataListRepo` 傳入，避免 `AssignmentListModule` → `AssignmentRunModule` 循環依賴（AD-E07-23 §23.5 建議）。

```
executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun }) → Stage1ChainResult
  ├── buildStage1WhereConditions(list)   ← 既有（stage1-query-composer.ts，複用、不 fork）
  ├── buildMonthCntFragment(list, warnings)
  ├── computeDedupWindow(workdt)
  ├── queryRecentAssignedCustoNos(poolDataListRepo, start, end)
  └── applySpecialDeletes(pool, list, workdt)
        ├── applyFraudWhiteboardDelete()   （詐騙白牌，無條件）
        └── applyListNmSpecialDeletes()     （中結強案 / 中結 / 年資，list_nm 觸發）
```

**執行順序（AC-8 / 對齊 SP）**：① 欄位篩選 → ② MONTH_CNT 期別過濾（AND 連接）→ ③ 撈 pool → ④ 詐騙白牌 DELETE（去重前，對齊 SP L69）→ ⑤ 近 3 個月去重 → ⑥ 特殊 DELETE 中結強案/中結/年資（依 SP L90~L112 順序）。

### (a) 欄位篩選（複用）
直接呼叫既有 `buildStage1WhereConditions(list)`，EMPTY_CONDITIONS → 整 list skip（`{count:0, skipped:true, skipReason}`），不繼續下游步驟（CH-002）。

### (b) MONTH_CNT 期別（SP L38~L65）
```
for (let m = start; m <= end; m += interval) months.push(m)
→ { fragment: '"month_cnt" IN (:...monthCntVals)', params: { monthCntVals: months } }
```
以 `AND` 連接至欄位篩選 fragment：`(<欄位篩選>) AND ("month_cnt" IN (:...monthCntVals))`。
邊界：start/end/interval 缺值 → `MONTH_CNT_PERIOD_INCOMPLETE` warning + skip；interval<=0 → `MONTH_CNT_INTERVAL_INVALID` warning + skip（防 infinite loop）；空集合 → skip。**skip 不阻擋月跑**（BR-4 / CH-005）。

### (c) 近 3 個月去重（SP L73~L87）
```
assigndayStart = workdt − 3 月（yyyyMMdd）；assigndayEnd = workdt − 1 日（DP-AD21-3 近似上界）
SELECT DISTINCT custo_no FROM ob_pool_data_list
  WHERE assignday >= :start AND assignday <= :end AND custo_no IS NOT NULL   ← 不加 data_source 過濾（BR-3 聯集）
pool.filter(c => c.custo_no === null || !recentSet.has(c.custo_no))          ← custo_no=null 不誤排（DD-003）
```

### (d) 特殊 DELETE（SP L69 / L90~L112，忠實複刻 BR-1）
- 詐騙白牌（L69，無條件）：`list_type==='01' && spec_name.includes('白牌')`
- 中結強案（L90，list_nm 含「中結」且「強案」）：`Number(payt_term) >= Number(deal_num)-3 || appl_no startsWith 'T'/'Y'`
- 中結（L98，list_nm 含「中結」，不與上條合併）：`Number(payt_num) > Number(deal_num)-8 && spec_name.includes('滿')`
- 年資（L108，list_nm 含「年資」）：`(year_produ ?? '1900') < String(當年-15)`（字串比較）
- NUMERIC 欄位（deal_num，entity `string|null`）以 `Number()` 轉換比較（SD-008 regression guard）。

**dryRun:true** → 回 `{count, skipped, warnings}`，`cases=undefined`（不回傳完整案件列）；**dryRun:false** → 回 `{count, cases, ...}`。兩者套用相同篩選鏈，故 count 精確一致（CH-004，F092 前置）。

## pipeline 接線

`runStage1ForList(list, workdt)` 改為呼叫 `executeStage1Chain(list, workdt, this.poolRepo, this.resultRepo, { dryRun: false })`（`this.resultRepo` 即 `Repository<ObPoolDataList>`，去重查詢用）。warning 統一 `logger.warn`。`runPipeline` 內以 `parseWorkdt(ym)`（`ym`='YYYYMM' → `new Date(year, month-1, 1)`，對應 SP `@WORKDT = PROJECT_WORKYM + '01'`）算出 workdt 傳入。

## 既有測試 baseline 更新（RG-002，案件數變化）

三個 pipeline integration spec 原本 seed 的 `ob_pool_data` 案件**未設 month_cnt（→null）**，F091 補入 MONTH_CNT 過濾後會被排除（案件數 →0）。為維持既有測試案件數 baseline（非真實業務數字變化，而是測試 fixture 補完整），調整如下：

| spec | 原行為 | 更新 | 案件數影響 |
|---|---|---|---|
| `assignment-run-pipeline.service.spec.ts` | `list_interval='030'`（months=[1]）、seedPool 無 month_cnt | `list_interval='001'`（months=[1..30]）、seedPool 預設 `month_cnt=1` | 維持原案件數（無變化） |
| `assignment-run-pipeline-v2.service.spec.ts` | 同上，且部分案例顯式 `monthCnt:2/10`（落在 [1] 外會被排除） | `list_interval='001'`（涵蓋 1/2/10）、seedPool 預設 `month_cnt=1` | 維持原案件數 + v2 計分案例（month_cnt 2/10 入選不變） |
| `assignment-run-pipeline-stage1-dynamic.spec.ts` | `list_interval='001'`、seedPool 無 month_cnt | seedPool 新增 `monthCnt` 參數，預設 `month_cnt=1` | 維持原案件數 |

> 註：此屬「測試 fixture 補上 F091 新過濾維度所需欄位」，非業務案件數變化。真實 production 月跑案件數變化（過濾真實不符期別 / 近期已派 / 特殊業務案件）為本 feature 的預期效果（§13 / DP-AD23-2），依 staging dry-run 驗證（F092 完成後）。

## 架構決策

- **模組歸屬**：`Stage1FilterChain` 採「純函式群組 + 接受 repo 參數的 async 主入口」，非 Injectable。理由：契約簽名 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, {dryRun})` 本就傳入 repo，呼叫端（月跑 pipeline / 未來 F092 estimate）以自身 repo 注入即可共用，無需新增 module / 處理循環依賴（AD-E07-23 §23.5 目標達成，且比獨立 Injectable 更輕量）。
- **詐騙白牌去重前套用 + applySpecialDeletes idempotent**：`executeStage1Chain` 內以 `applyFraudWhiteboardDelete()`（去重前）+ `applyListNmSpecialDeletes()`（去重後）拆開套用，精確對齊 SP L69→L77→L90 順序，無重複；`applySpecialDeletes()` 仍組合兩者作為「完整特殊 DELETE 純函式」供 SD 單元測試獨立驗證。

## 偏離 SP / 需確認之處（spec gap）

1. **`list_period_*` / `list_interval` entity 型別與 spec 不符**：F091 spec §3 + AD-E07-22 §22.2 稱「INTEGER 一級欄位」，但 `ob-list-definition.entity.ts` 實際為 **VARCHAR(3)**（`list_period_start`/`list_period_end`/`list_interval`）。實作以 `parseInt()` 轉換（與 stage1-query-composer path B caseyear 處理風格一致），缺值 / 非數字 → skip + warning。**不阻擋落地**，但建議 system-architect / data-model 確認 entity 型別是否應改 INTEGER，或 spec 文字改為「VARCHAR 數字字串」。（不影響行為正確性。）

2. **去重上界近似（DP-AD21-3 已拍板接受）**：`assigndayEnd = workdt − 1 日`，未建 OBASSSIGNSET ETL 取精確 `MAX(CASEDT)`。屬已拍板 trade-off（OQ-STAGE1-02 follow-up）。

3. **無 PG TestContainer**：DD-005（聯集）+ CH-003/004（一致性）以 better-sqlite3 in-memory 跑真實 Stage 1 chain（assignday 字串比對 + custo_no 去重 + month_cnt 整數過濾 + data_source nullable 聯集），SQLite / PG 行為一致，無需 PG TestContainer。

## 邊界（刻意未動）

- 未改 `architecture-spec.md` / `data-model.md`（權威來源，由 architect 維護）。
- 未改 etl `target-load-handler` 的 fullMode / customer_core / partition_replace 既有行為。
- 未升級 `Stage0EstimateService.estimateListCount()`（F092 Phase 3 才複用 `executeStage1Chain` dry-run，RG-003）。
- 未 commit（交回主流程）。
