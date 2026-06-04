---
type: implementation-log
feature_id: F099
feature_name: Stage 1 SQL 下推（set-based INSERT…SELECT + estimate≡run 共用 buildStage1Sql）
status: complete
last_updated: 2026-06-02
---

# F099：Stage 1 SQL 下推（AD-E07-28 P2）— Implementation Log

> 範圍限定 **P2（F099）**。P1（F098，已完成）與 P3（F100 Stage 2~4 下推）不在本次範圍。
> 核心：將 `executeStage1Chain` 的「全載 ob_pool_data + 應用層 filter + 全載去重 Set」改寫為單一
> set-based SQL（`buildStage1Sql`），run（`INSERT…SELECT`）與 estimate（`SELECT COUNT(*)`）共用同一 core。
> `executeStage1Chain` JS 版**保留為 golden oracle**（EQ 群組逐 list 比對基準），未刪除。

## Test Results Summary

### EQ — JS↔SQL 逐 list 結果集精確等價（PG 真庫，P2 DoD，全綠）
| Scenario | 覆蓋 | Status |
|----------|------|--------|
| EQ-001~005 | 純欄位篩選 / month_cnt（IN / 步進 / 缺值 skip / interval=0 skip） | PASS（PG） |
| EQ-006 | 詐騙白牌（含 spec_name NULL 保留） | PASS（PG） |
| EQ-007 | 機車期中（payt_term>=deal_num-3 OR appl_no T/Y）+ 邊界 | PASS（PG） |
| EQ-008 | 期中小資（payt_num>deal_num-8 AND 含小資）+ 邊界 | PASS（PG） |
| EQ-009 | year-above 正常值（cutoff 2011） | PASS（PG） |
| EQ-010 | year-above 退化 / 非數字 / 短整數（對齊 JS parseInt） | PASS（PG） |
| EQ-011 | 四規則疊加（BR-1 不合併） | PASS（PG） |
| EQ-012 | 近 3 月去重（NOT EXISTS）+ NULL custo_no 安全 | PASS（PG） |
| EQ-013 | 去重上界封頂（未來日 / 歷史空集） | PASS（PG） |
| EQ-014 | EMPTY_CONDITIONS → 整 list skip（0 列，不 INSERT） | PASS（PG） |

### PORT — year-above 前導數字 PG 可移植（oracle=現行 JS，全綠）
| Scenario | year_produ | 期望 | Status |
|----------|-----------|------|--------|
| PORT-001 | '2010' | 排除 | PASS（PG） |
| PORT-002 | '2011' | 保留（cutoff 邊界） | PASS（PG） |
| PORT-003 | null | 排除（?? 1900） | PASS（PG） |
| PORT-004 | '' | **保留**（NaN）⚠️陷阱① | PASS（PG） |
| PORT-005 | 'N/A' | **保留**（NaN）⚠️陷阱① | PASS（PG） |
| PORT-006 | '200' | 排除 | PASS（PG） |
| PORT-007 | '1980abc' | **排除**（前導數字 1980）⚠️陷阱② | PASS（PG） |

### RUNEST / IDEM（PG，全綠）
| Scenario | 覆蓋 | Status |
|----------|------|--------|
| RUNEST-001 | run/estimate 共用 buildStage1Sql core（確定性結構斷言，unit） | PASS |
| RUNEST-002/003 | run 列數 === estimate COUNT；year-above estimate 不漏套 | PASS（PG） |
| IDEM-001~003 | 同 run_id 重跑列集合一致 / FK CASCADE / 兩 run_id 互不污染 | PASS（PG） |

### Unit（不需 PG，全綠）
| Scenario | 覆蓋 | Status |
|----------|------|--------|
| SQLG-001~004 | 欄位篩選 / month_cnt 沿用既有 fragment；WHERE NOT 兩態；注入防禦沿用 | PASS |
| NOLOAD-001~002 | 下推 builder 無 getMany()/find() 全載；year-above 無應用層 filter（靜態 guard） | PASS |
| GMT-001/003 | RGv2-005 grep-pin 移除；special-rules trigger 仍 JS | PASS |

**合計**：F099 新增 46 案（PG 26 + unit 20）全綠；postgres-test 容器實跑（非 skip）。

## Files Changed
| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/stage1/stage1-sql-builder.ts` | new | `buildStage1Sql(list, workdt, pdlRepo)` 純函式：唯一 WHERE/JOIN core（欄位+month_cnt+四特例 WHERE NOT+去重 NOT EXISTS），run/estimate 共用 |
| `apps/api/src/modules/assignment/stage1/stage1-sql-executor.ts` | new | `runStage1SqlInsert`（INSERT…SELECT + I-IDEM-01 前置 DELETE）/ `estimateStage1SqlCount`（SELECT COUNT）；named→positional 由 driver.escapeQueryWithParameters |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | `runStage1ForList` 加 DB_TYPE gate：PG 走 `runStage1SqlPushdown`（INSERT…SELECT + re-hydrate 有界子集供 Stage 2~4）；非 PG 沿用 `executeStage1Chain` |
| `apps/api/src/modules/assignment-list/stage0-estimate.service.ts` | modified | `dryRunChainCount` 加 DB_TYPE gate：PG 走 `estimateStage1SqlCount`（與 run 共用 core）；非 PG 沿用 `executeStage1Chain` dry-run |
| `apps/api/src/modules/assignment/stage1/__tests__/stage1-sql-builder.spec.ts` | new | 20 unit 案（SQLG/NOLOAD/GMT/RUNEST-001 結構） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage1-sql-pushdown.pg.spec.ts` | new | 26 PG 案（EQ/PORT/RUNEST/IDEM）；postgres-test 容器，JS oracle vs SQL 逐列 PK 比對 |
| `apps/api/src/modules/assignment/stage1/__tests__/pg-env-preload.ts` | new | PG spec 前置 side-effect 設 DB_TYPE=postgres（供 entity dateColumnType 解析 PG 型別）+ afterAll 還原（防同 worker 污染） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage1-filter-chain.spec.ts` | modified | 移除 RGv2-005 grep-pin（CHAIN_SRC 含 includes('小資')/includes('白牌')）；保留 special-rules trigger guard（GMT-001/003，移除前已確認 EQ-006/008 綠） |

## Architectural Decisions（spec 邊界內）

1. **run/estimate 不分叉（I-RUN-EST-01）**：唯一 `buildStage1Sql(list, workdt, pdlRepo)` 產出 `<core>`（WHERE+params，alias `o`）。`runStage1SqlInsert` 與 `estimateStage1SqlCount` 各自呼叫一次同函式，分叉僅在最外層 `INSERT…SELECT` vs `SELECT COUNT(*)`（F049 老坑不重演）。RUNEST-002/003 PG 驗 run 列數===COUNT。

2. **DB_TYPE gate 分流（PG-only 下推）**：下推 SQL 之 `::int` / `SUBSTRING(... FROM '^[0-9]+')` / `CAST(... AS numeric)` 為 PG 專屬且 SQLite 不具代表性（I-PORT-01）。production `runStage1ForList` / `dryRunChainCount` 以 `process.env.DB_TYPE==='postgres'` 分流：PG 走 SQL 下推；SQLite（既有 pipeline / estimate 整合測試）沿用 `executeStage1Chain`（JS oracle）。兩路徑等價由 PG EQ 群組證明。與既有 pg-boss / advisory-lock 之 DB_TYPE gate 慣例一致。

3. **Stage 2~4 演算法不改（C-3）**：PG 路徑 Stage 1 以 `INSERT…SELECT` 寫入 `ob_monthly_run_result`（案件識別，assignday=NULL），再 **re-hydrate 有界子集**（依寫入 PK 查 ob_pool_data）回 heap 供 `executeV1/executeV2/computeScore` 計分（演算法零變更）。re-hydrate 為 Stage 1 大幅收斂後之案件子集（非全 pool）→ 非 I-NOLOAD-01 違反。最終 `save(stage4Results)` 以同 PK upsert 補計分欄。

4. **year-above 前導數字解析（AC-8，禁 strict 正則）**：`CASE WHEN year_produ IS NULL THEN 1900 ELSE NULLIF(SUBSTRING(year_produ FROM '^[0-9]+'), '')::int END`；keep = `NOT (yearval IS NOT NULL AND yearval < :cutoff)`。`yearval IS NOT NULL` 條件為**關鍵 NULL 等價護欄**：`''`/`'N/A'`→yearval=NULL→保留（對應 JS `parseInt('')=NaN`，`NaN<cutoff=false`）；若寫成 `NOT (yearval < cutoff)`，yearval=NULL 時 `NULL<cutoff`=NULL→`NOT NULL`=NULL（非 true）→列誤排。PORT-004/005/007 三案守此三個陷阱。

5. **特例規則 NULL 等價（COALESCE）**：詐騙白牌 / 期中小資之 `spec_name` 以 `COALESCE(spec_name,'')` 對應 JS `(spec_name ?? '')`；機車期中 / 期中小資之數值比較以 `COALESCE(CAST(... AS numeric),0)` 對應 JS `Number(null)=0`。否則 PG `NULL LIKE`/`NULL >=` = NULL → `NOT(...)` 整體 NULL → 列誤排（這正是初版令全 EQ 回 [] 的 root cause）。

6. **去重 anti-join 用 NOT EXISTS（A-1）**：`NOT EXISTS (SELECT 1 FROM ob_pool_data_list pdl WHERE pdl.custo_no=o.custo_no AND pdl.custo_no IS NOT NULL AND pdl.assignday BETWEEN ...)`。`o.custo_no=NULL` 時子查詢恆不 match → 保留（NULL-safe，非 `NOT IN` 之全 false 陷阱）。去重視窗上界沿用 `computeDedupWindow`（MIN(MAX(assignday), workdt−1)，語意不變 C-2）。EQ-012/013 守。

7. **assignday 恆 NULL（OQ-F099-03）**：`ob_pool_data` 無 assignday 欄；INSERT 欄位清單不含 assignday（寫 NULL）。EQ 共用骨架斷言 `assignday IS NULL`。

8. **冪等清理（I-IDEM-01 / AC-9）**：`runStage1SqlInsert` 實質 INSERT 前先 `DELETE FROM ob_monthly_run_result WHERE run_id=:runId AND list_no=:listNo`；整 run 清除由 FK ON DELETE CASCADE 補強。IDEM-001~003 守。

9. **guard 移轉防假綠（GMT-001）**：移除 RGv2-005（grep CHAIN_SRC 含 includes('小資')/includes('白牌')）**前已確認 EQ-006/EQ-008 PG 綠燈**，保護目標移轉至 PG 等價測試 + special-rules trigger 單元測試（trigger 仍 JS，C-1）。SDv2-* 純函式測試保留（JS oracle 自我驗證，未刪）。

## 驗證
- **PG 實跑**：postgres-test 容器（docker-compose.test.yml，5433/cdmp_test）實起；EQ 14 + PORT 7 + RUNEST(PG) 2 + IDEM 3 ＝ 26 案**真 Postgres 全綠**（非 skip）。
- **tsc**：`tsc --noEmit -p tsconfig.build.json`（cwd=apps/api）exit 0；F099 新增 / 修改檔於全專案 tsc 零錯（其餘全專案 tsc 錯誤均為 pre-existing 無關 spec）。
- **回歸**：stage1（含 chain / composer / special-rules / integration）+ stage0-estimate + pipeline（service / stage1-dynamic / v2）+ run service + queue（含 F098 PG）合計 530+ 案綠；既有 estimate≡run 行為不回歸。

## 已知偏差 / Follow-up（不阻擋 P2）
- **F-1（cancel 後 Stage-1 identity 列殘留）**：PG 路徑 Stage 1 `INSERT…SELECT` 為 per-list auto-commit（非最終 transaction）。若後續 list / Stage 2~4 失敗或 F098 取消，已寫入之 Stage-1 identity 列會殘留（run 標 failed）。由同 run_id 重觸發之 `DELETE`（I-IDEM-01）+ FK CASCADE（run 刪除）清理；符合 AC-9「寫入前清理」語意。如需「失敗即回滾 Stage-1 列」可於 P3 將整 pipeline 納單一 transaction（建議 follow-up，非 P2 DoD）。
- **F-2（pre-existing 測試 flake，非本次）**：`assignment-run-report.scope/.service` + `assignment-run-snapshot.service` 三 spec 於同 worker 共跑時有 NestJS DI 交叉污染（`SectionChiefScopeService` 解析失敗）失敗；經 `git stash` 驗證為 **pre-existing**（與 F099 無關），單獨跑各自綠。
- **全專案 tsc test-file 既有型別錯誤**（f054/f055/etl 等 spec）為 pre-existing，與 F099 無關；production build config（tsconfig.build.json）零錯。
