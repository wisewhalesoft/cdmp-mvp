---
type: implementation-log
feature_id: AD-E07-41-P4a
feature_name: MSSQL 全面遷移 P4a — ETL Handler 群組一（extract / field_mapping / derived_field / type_cast / conditional，CTAS → SELECT INTO ##global temp）
status: complete
last_updated: 2026-07-08
---

# AD-E07-41 P4a — ETL Handler 群組一 MSSQL 化 實作紀錄

## 範圍

§3.1 共用 temp helper 補齊（3 個新函式）＋ §3.2 對應 5 個 handler（extract / field_mapping / derived_field / type_cast / conditional）＋ `resolve-raw-table` 之 MSSQL 版（AD §3.2 遺漏、extract 依賴）＋ 顯式清理掛載。**不碰** merge/lookup（P4b）、dedup/target-load（P4c）、`createDispatcher` DB_TYPE 分支（延後 P4c）。PG 路徑逐位元組不動。

## 🔴 QUOTE 決策關卡結論（QUOTE-003，PASS 分支）

真實 MSSQL（CDMP_TEST，tedious 預設 `QUOTED_IDENTIFIER ON`）**接受**雙引號識別碼：`SELECT "id","MixedCase_Col" INTO ##t FROM (VALUES ...) AS v("id","MixedCase_Col")` 建表成功、大小寫原樣保留（`["id","MixedCase_Col"]`）、`WHERE "MixedCase_Col" = N'a'` 正確比較。

**結論＝PASS**（非封鎖級）：5 個 handler 之 mssql 版**逐字複用** PG 版私有方法內的雙引號識別碼組裝邏輯，僅替換外層 CREATE/CAST/正則/catalog 大小寫等關鍵字，**無需新增「雙引號→方括號」轉換層**。此結論對 P4b/P4c 亦適用。（覆蓋 QUOTE-001/002 整合測試 + 本結論記錄。）

附帶查證（同一探測）：本 DB 之欄位名（column identifier）繫結為**大小寫不敏感**（`table_name` 與 `TABLE_NAME` 皆可繫結至 `INFORMATION_SCHEMA.TABLES`），故 catalog 只需 schema/view 名大寫（I-MSSQL-CATALOG-CASE-01），欄位名沿用小寫即可，且 derived 之 CASE passthrough 未加引號的裸欄位參照可正常繫結。

## Driver 結構選擇

採 AD §1.2 之「平行 mssql 檔」：每個 PG handler 對應一個 `*-handler-mssql.ts` 新檔，PG 原檔不動。共用 temp helper 以 **additive Edit** 擴充既有 `handlers/mssql/temp-table.util.ts`（P4-spike-2 已落地 `dropMssqlTempTableIfExists`，未覆寫）。P4a 測試一律**直接實例化 handler class**（選項甲，DISPATCH-001），不透過 `NodeDispatcher`/`createDispatcher`。

## Files Changed

| File Path | Change | 說明 |
|-----------|--------|------|
| `src/modules/etl/engine/handlers/mssql/temp-table.util.ts` | modified (additive) | 追加 `createMssqlTempTable`/`getMssqlTempTableColumns`/`countMssqlTempTableRows` + 內部 `buildSelectIntoSql`（頂層 FROM 括號深度掃描插入 `INTO ##`）+ `MssqlTempTableColumn` 型別；既有 `dropMssqlTempTableIfExists` 逐字保留 |
| `src/modules/etl/engine/handlers/resolve-raw-table-mssql.ts` | new | resolve 之 mssql 版（`$1/$2→@0/@1`、`NULLS LAST→CASE WHEN`、`LIMIT 1→TOP (1)`） |
| `src/modules/etl/engine/handlers/extract-handler-mssql.ts` | new | CTAS→SELECT INTO ##；`INFORMATION_SCHEMA.TABLES` 大寫 + `@0`；`countMssqlTempTableRows` |
| `src/modules/etl/engine/handlers/field-mapping-handler-mssql.ts` | new | 欄位內省用 `getMssqlTempTableColumns`；boolean default→`CAST(1 AS BIT)`；零欄位 SELECT 顯式拋錯 |
| `src/modules/etl/engine/handlers/derived-field-handler-mssql.ts` | new | `gen_random_uuid()→NEWID()`；mergePhone 全零→`LEN>0 AND NOT LIKE '%[^0]%'`；padStart→含 LEFT 截斷分支 |
| `src/modules/etl/engine/handlers/type-cast-handler-mssql.ts` | new | `CAST→TRY_CAST`；正則→字元類別（含 `LEN>0` 空字串守門）；DATE 保持前綴寬鬆比對 |
| `src/modules/etl/engine/handlers/conditional-handler-mssql.ts` | new | CASE WHEN 邏輯不變，僅 helper/前綴 swap |
| `src/modules/etl/engine/node-output-store.ts` | modified | `cleanupAll` 新增 `DB_TYPE==='mssql'` 分支 + `createdTables` 累積集合（見 CLEANUP-003） |
| `src/modules/etl/engine/__tests__/p4a-*.spec.ts`（11 檔） | new | UNIT + STATIC + CLEANUP + QUOTE/HELPER/EXTRACT/FIELDMAP/DERIVED/CAST/COND 整合 + 共用 harness `_p4a-mssql-harness.ts`（非 spec） |

## Architectural Decisions

### CLEANUP-003 — 清理掛載點（決策記錄，MUST-FIX）

**選 (a)：`NodeOutputStore.cleanupAll()` 內依 `DB_TYPE` 分支。** 該方法為現行**唯一**天然貫穿 pipeline-runner 成功（`:164`）與失敗（`:158`）兩路徑的收斂點，且 `node-output-store.ts` 不在 AD §1.2 明文凍結清單（凍結者為 `NodeDispatcher`/`node-dispatcher.ts`/`types.ts`/`pipeline-runner.ts`）。mssql 分支呼叫真實 `dropMssqlTempTableIfExists`。

**AD 缺漏補正（重要）**：`cleanupAll` 原僅清 `store`（釋放引用集合），但 pipeline-runner 於下游消費完上游後會 `release()` 移除引用——PG `CREATE TEMP TABLE` 於交易/session 結束自動回收，已釋放的中間表不需顯式 DROP；但 MSSQL `##global temp` 於連線池 `release()` 後**仍殘留**（P4-spike-2 POINT4 實證）。若 mssql 分支仍只走 `store`，已釋放的中間節點暫存表會洩漏到 session 結束。故新增 `createdTables: Set` 累積「本 run 曾建立過」的所有 `##` 名，mssql 分支清空整個集合。PG/sqlite 分支維持原 `store` 行為逐位元組不變。CLEANUP-004 真實 pipeline 實測 5 節點全清、CLEANUP-005 同 logId 重跑不撞名，均綠。

### DISPATCH-001 — createDispatcher 不於 P4a 接 DB_TYPE 分支（選項甲）

`createDispatcher()`（`etl-pipeline-execution.service.ts`）維持註冊 9 個 PG handler 不動，DB_TYPE 分支延後至 P4c（全部 9 handler 到齊）一次接上。理由：customer_core 53 節點 pipeline 需全節點一致 driver，P4a 僅完成 5 種 nodeType，提前接分支會在 merge/lookup/dedup/target_load 節點崩潰。P4a 測試全數直接實例化 handler class 驗證。

### AD 缺漏補正清單

1. **LPAD 公式方向錯誤（DERIVED-EQ-001，🔴）**：AD §3.2 建議 `RIGHT(REPLICATE(char,n)+col,n)` 在輸入長度 ≥ n 時保留「後」n 碼，與 PG `LPAD` 保留「前」n 碼相反。實作改為 `CASE WHEN LEN(sv) >= n THEN LEFT(sv,n) ELSE RIGHT(REPLICATE(char,n)+sv,n) END`。真實 MSSQL 實測 `padStart('ABC',2,'0')='AB'`（非 'BC'）。
2. **`resolve-raw-table` 需獨立 mssql 版**：AD §3.2 未列此檔，為 extract 依賴，新增 `resolve-raw-table-mssql.ts`。`NULLS LAST` 以 `CASE WHEN et.last_execution_at IS NULL THEN 1 ELSE 0 END ASC` 為主排序鍵（不依賴引擎 NULL 預設順序）。`LIMIT 1`→`TOP (1)`。
3. **mergePhone `~ '^0+$'` 正則**：AD §3.2 未列（真實 customer_core 最高頻，7 次）。改 `LEN(col) > 0 AND col NOT LIKE '%[^0]%'`。實測 `'000'→NULL`、`'102'→保留`。
4. **`gen_random_uuid()`**：AD 正文缺漏。→ `NEWID()`。
5. **boolean defaultValue 裸 TRUE/FALSE**：T-SQL 無此關鍵字。→ `CAST(1 AS BIT)`/`CAST(0 AS BIT)`（FIELDMAP-UNIT-004）。
6. **空字串 LIKE 陷阱（CAST-EQ-002，🔴）**：`'' NOT LIKE '%[^0-9]%'` 求值為 TRUE（探測實證 naive=1）；加 `LEN(col) > 0` 守門後正確拒絕（guarded=0）。與 PG `+` 量詞語意一致。

### 其他實作選擇

- **`toMssqlType` DECIMAL→`DECIMAL(38, 10)`**：AD/測試允許 NUMERIC 或 DECIMAL，但**裸** `NUMERIC` 預設 scale 0 會截斷小數（與 PG 無界 NUMERIC 不一致）→ 顯式高精度保留小數。CAST-EQ-010 `'0.055'/'1.5'` 逐列相符。INTEGER→`INT`、DATE→`DATE`。
- **type_cast 全程 `TRY_CAST`**：連字串轉型 `sv` 亦用 `TRY_CAST(col AS NVARCHAR(4000))`，使產出 SQL 對目標型別**零裸 CAST**（CAST-UNIT-001）；nvarchar 轉型必然合法，語意無差異。
- **`##` 前綴時機**：沿用 `makeTempTableName`（`types.ts` 不動），mssql handler 於組 SQL 與回傳 `DataSet.tempTable` 時前綴 `##`；downstream 直接引用該 `##` 名。
- **FIELDMAP-UNIT-006（決策關卡）**：`dropUnmapped=true 且 mappings=[]`（零欄位 SELECT）於 T-SQL `SELECT INTO` 不支援 → 顯式拋錯（真實 customer_core 7 個 field_mapping 節點 mappings 皆非空，不可達）。
- **HELPER-UNIT-004 微調**：測試設計原文之 mock 輸入（b,a）與期望輸出（a,b）互斥於「不重新排序」語意；實作忠實 AD（`rows.map` 不排序、信任 SQL `ORDER BY column_id`），測試改以已排序輸入驗證欄位改名與順序保留。

## 偏差（deviation）

- **EXTRACT-RESOLVE DUAL-DB（RESOLVE-002）PG 側降級**：CDMP_TEST 實測**缺** `extraction_tasks`/`datasources` baseline（P1b 未於此 DB 建置），本 spec 自建最小 dbo 版本（僅在兩表皆不存在時建立、afterAll DROP），對真實 MSSQL 驗證 NULLS-LAST 改寫「選非 NULL 最大」之行為（RESOLVE-002/002b/003/004 全綠）。PG 對照側**未執行**：唯一可達 PG 為 dev DB（5432，5433 不可達），不可注入測試列污染 dev。RESOLVE-001（unit）已鎖 SQL 文字結構，behavioral 風險（NULL 排序）由 MSSQL 側整合完整驗證。
- **測試檔命名**：整合 spec 依測試設計建議命名（`extract-handler.mssql.spec.ts` 等）加 `p4a-` 前綴避免與未來切片碰撞；UNIT/STATIC 另置 `p4a-mssql-unit.spec.ts`/`p4a-mssql-static.spec.ts`（非 gated，CI 恆跑）。共用連線 harness `_p4a-mssql-harness.ts`（`_` 前綴，vitest `*.spec.ts` include 不收集）。

## Test Results Summary

真實 MSSQL（CDMP_TEST，docker `--profile mssql`）全數實跑通過；UNIT/STATIC 非 gated 恆跑。

| 群組 | 檔案 | 結果 |
|------|------|------|
| QUOTE-001/002 | p4a-quote.mssql.spec.ts | PASS（2） |
| HELPER-UNIT-001..005 / EXTRACT/FIELDMAP/DERIVED/CAST/COND UNIT / RESOLVE-001 / DISPATCH-003 | p4a-mssql-unit.spec.ts | PASS（35） |
| STATIC-001..004 / CAST-UNIT-004 / REG-002 / DISPATCH-002 | p4a-mssql-static.spec.ts | PASS（9） |
| CLEANUP-001/002（黑盒 spy 迷你 pipeline） | p4a-mssql-cleanup.spec.ts | PASS（2） |
| HELPER-MSSQL-001..006 / CLEANUP-006 | p4a-temp-table-helpers.mssql.spec.ts | PASS（7） |
| EXTRACT-EQ-001..003 / EXTRACT-RESOLVE-002/002b/003/004 | p4a-extract-handler.mssql.spec.ts | PASS（7） |
| FIELDMAP-EQ-001..004 | p4a-field-mapping-handler.mssql.spec.ts | PASS（4） |
| DERIVED-EQ-001..010 | p4a-derived-field-handler.mssql.spec.ts | PASS（10） |
| CAST-EQ-001..011 | p4a-type-cast-handler.mssql.spec.ts | PASS（11） |
| COND-EQ-001..003 | p4a-conditional-handler.mssql.spec.ts | PASS（3） |
| CLEANUP-004/005（真實 pipeline） | p4a-cleanup.mssql.spec.ts | PASS（2） |
| CLEANUP-003 / DISPATCH-001 / QUOTE-003（文件化決策） | p4a-mssql-docgates.spec.ts | PASS（3） |

**REG-001** `tsc --noEmit -p tsconfig.build.json` 乾淨。**REG-003/004/005** 既有 engine spec + spike + sqlite 路徑不回歸。
