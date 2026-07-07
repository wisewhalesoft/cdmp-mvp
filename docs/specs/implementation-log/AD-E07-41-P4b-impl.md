---
type: implementation-log
feature_id: AD-E07-41-P4b
feature_name: MSSQL 全面遷移 P4b — ETL Handler 群組二（merge / lookup，含 UPDATE...FROM 重構 + ALTER TABLE ADD COLUMN 修正）
status: complete
last_updated: 2026-07-08
---

# AD-E07-41 P4b — ETL Handler 群組二 MSSQL 化 實作紀錄

## 範圍

§3.2 對應 2 個 handler（merge / lookup）之 MSSQL 平行版。新增 `merge-handler-mssql.ts`、`lookup-handler-mssql.ts`（PG 原檔逐位元組不動）。**不碰** dedup/target-load（P4c）、53 節點端對端（P4d）、bulk-load（P4e）、`createDispatcher` DB_TYPE 分支（延續 P4a 選項甲，延後至 P4c）。共用 helper（`temp-table.util.ts`/`resolve-raw-table-mssql.ts`）唯讀複用，本輪未修改。

## 🔴🔴 真實 MSSQL 探測結論（實作前先行驗證，非假設）

於 CDMP_TEST（`cdmp-mssql` 容器）以 tedious driver 直接探測，鎖定四項 SQL 形狀：

1. **`ALTER TABLE ADD` 語法**：`ALTER TABLE ##t ADD COLUMN IF NOT EXISTS [x] TEXT`（naive PG 逐字）→ `Incorrect syntax near 'COLUMN'`（100% 編譯期錯誤，TRAP 佐證）。合法形式：`ALTER TABLE ##t ADD [alias] NVARCHAR(MAX)`（無 `COLUMN`、無 `IF NOT EXISTS`、非 `TEXT`）。
2. **UPDATE...FROM**：naive `UPDATE _src SET z=_lk.y FROM (sub) _lk WHERE ...`（`_src` 未於 FROM 宣告）→ `Invalid object name '_src'`（TRAP 佐證）。合法：`UPDATE _src SET ... FROM ##t AS _src JOIN (sub) _lk ON ...`；未命中列保持 NULL（null 策略語意保留）。
3. **🔴 DELETE 別名（推翻測試設計前提）**：`DELETE FROM ##t AS _src WHERE ...` → `Incorrect syntax near the keyword 'AS'`；`DELETE FROM ##t _src`（無 AS）→ `Incorrect syntax near '_src'`。**兩者皆語法錯誤**。唯一可宣告 target 別名之合法形式為**兩段式** `DELETE _src FROM ##t AS _src WHERE NOT EXISTS (...)`。詳見下方偏差段。
4. **idempotent ALTER（選項甲）**：以 `getMssqlTempTableColumns`（`tempdb.sys.columns`）預查欄位存在性，不存在才 ALTER；第二次呼叫略過、不拋 duplicate column 錯誤——冪等性成立。

（另探測確認：`SELECT ... INTO ##m FROM "##L" l FULL OUTER JOIN "##R" r ON ...` + COALESCE + `_left`/`_right` 於引號 `##` 名下正確運作；`lookupFilter` 子查詢 `WHERE "TBL_ID"='A2'` 正確排除同 `TBL_CD` 之他列；TRIM 去空白後比對成功；`UPDATE ##t SET "alias"=@0 WHERE "alias" IS NULL` 具名參數填預設值正確。）

## Files Changed

| File Path | Change | 說明 |
|-----------|--------|------|
| `src/modules/etl/engine/handlers/merge-handler-mssql.ts` | new | CTAS→`createMssqlTempTable`；`getColumns` 改 `getMssqlTempTableColumns`（查證發現 6）；`COUNT(*)::int`→`countMssqlTempTableRows`；`FULL OUTER JOIN`/COALESCE/`_left`_/`_right`/`findUniqueAlias`/鏈式跳過上游衍生欄 邏輯逐字保留 |
| `src/modules/etl/engine/handlers/lookup-handler-mssql.ts` | new | ALTER 冪等修正（選項甲）；UPDATE...FROM 重構；skip_row DELETE 兩段式；default_value `@0`；legacy 用 `resolveRawTableMssql`；raw 表存在性 `INFORMATION_SCHEMA.TABLES` 大寫+`@0`；`::text`→`TRY_CAST` |
| `src/modules/etl/engine/__tests__/p4b-mssql-unit.spec.ts` | new | ALTERCOL/UPDATEFROM/SKIP/DEFAULT/RESOLVE(unit)/LOOKUP/MERGE/DISPATCH UNIT（mock QueryRunner，CI 恆跑） |
| `src/modules/etl/engine/__tests__/p4b-mssql-static.spec.ts` | new | STATIC-001..004 / REG-002 / DISPATCH-002 / RESOLVE-001 / ALTERCOL-GATE-001（fs regex，CI 恆跑） |
| `src/modules/etl/engine/__tests__/p4b-mssql-cleanup.spec.ts` | new | CLEANUP-001/002（黑盒 spy 迷你 pipeline extract→lookup→merge） |
| `src/modules/etl/engine/__tests__/p4b-merge-handler.mssql.spec.ts` | new | MERGE-EQ-001..008（真實 MSSQL，`##` fixture，不落 dbo） |
| `src/modules/etl/engine/__tests__/p4b-lookup-handler.mssql.spec.ts` | new | ALTERCOL-MSSQL/TRAP、UPDATEFROM-EQ/TRAP、LOOKUP-EQ、SKIP-MSSQL、DEFAULT-MSSQL、RESOLVE-002/CLEANUP-003/004（真實 MSSQL，legacy mode 落 dbo raw fixture） |

## Architectural Decisions

### ALTERCOL-GATE-001 — 欄位存在性冪等檢查機制（決策記錄，MUST-FIX）

**選 選項甲**：JS 端於 `LookupHandlerMssql.addOutputColumns()` 先呼叫既有 `getMssqlTempTableColumns`（`tempdb.sys.columns`）取現有欄位集合，僅對「尚不存在」之 alias 發出純 `ALTER TABLE "${inputTable}" ADD "${alias}" NVARCHAR(MAX)`（無條件式 DDL）。

理由：(a) 重用 P4a 既有 helper，零新 SQL 站點；(b) DDL 不混入 `IF EXISTS(...) BEGIN ... END` 條件邏輯，可讀性高；(c) 真實 MSSQL 探測證此機制冪等（第二次呼叫略過、不拋 duplicate column）；(d) 忠實保留 PG `ADD COLUMN IF NOT EXISTS` 之冪等語意。單一 lookup 節點執行內同 alias 重複亦以就地 `existing.add(alias)` 去重。

### DISPATCH-001 — createDispatcher 不於 P4b 接 DB_TYPE 分支（延續 P4a 選項甲）

`createDispatcher()` 維持註冊 9 個 PG handler 不動，延後至 P4c（9 handler 到齊）一次接上。P4b 測試一律直接實例化 handler class。

## 偏差（deviation）

### 🔴 DEV-P4B-01：skip_row 之 DELETE 須兩段式，推翻測試設計 SKIP-UNIT-001 之前提

測試設計 §七 SKIP-UNIT-001 敘明「`DELETE FROM ##input AS _src WHERE NOT EXISTS (...)` 為 T-SQL 原生合法語法，不需如 UPDATE 般把 target 併入外層 FROM」，並列為「本文件唯一 AD 判定不需改且經查證屬實之站點」。

**真實 MSSQL 探測推翻此前提**：`DELETE FROM ##t AS _src`（`Incorrect syntax near 'AS'`）與 `DELETE FROM ##t _src`（`Incorrect syntax near '_src'`）**皆語法錯誤**。T-SQL 唯一可為 DELETE target 宣告別名之合法形式為兩段式 `DELETE _src FROM ##t AS _src WHERE NOT EXISTS (...)`（`DELETE <alias> FROM <table> AS <alias>`）。

**處置**：實作採兩段式 DELETE（target 併入 `FROM`，與 UPDATE 同）。UNIT（SKIP-UNIT-001）與 STATIC-004 皆斷言此「正確可執行」之兩段式結構，而非測試設計原述之單段式。此為「測試設計對真實系統 contract 假設有誤」之修正——測試須反映真實 MSSQL 行為，非逐字沿用未經真實驗證之敘述。SKIP-MSSQL-001/002/003 於真實 MSSQL 執行驗證此形式刪除語意正確（未命中列刪除、命中列保留值正確、全刪/全留邊界）。

### DEV-P4B-02：lookup EQ 之 legacy 對照表以 static `lookupSource` 為主（免 extraction_tasks 依賴）

真實 customer_core 31 個 lookup 節點皆帶 `lookupRef`（動態解析）；但 `resolveRawTableMssql` 在「有 `lookupSource` 靜態表名、無 `lookupRef`」時直接回傳靜態表名（不查 `extraction_tasks`）。故多數 LOOKUP-EQ/UPDATEFROM-EQ 案例以 static `lookupSource` 指向自建 dbo raw fixture，降低 fixture 複雜度。RESOLVE-002 另以 `lookupRef` + 自建最小 `extraction_tasks`/`datasources`（比照 P4a EXTRACT-RESOLVE 手法，afterAll 清除）專測動態解析路徑。

## Test Results Summary（實跑，2026-07-08，CDMP_TEST `cdmp-mssql` 容器）

| 群組 | 檔案 | 結果 |
|------|------|------|
| ALTERCOL/UPDATEFROM/SKIP/DEFAULT/RESOLVE(unit)/LOOKUP/MERGE/DISPATCH UNIT | `p4b-mssql-unit.spec.ts` | PASS（23） |
| STATIC-001..004 / RESOLVE-001 / REG-002 / DISPATCH-002 / STATIC-003 / ALTERCOL-GATE-001 | `p4b-mssql-static.spec.ts` | PASS（15） |
| CLEANUP-001/002（黑盒 spy 迷你 pipeline extract→lookup→merge） | `p4b-mssql-cleanup.spec.ts` | PASS（2） |
| MERGE-EQ-001..008（真實 MSSQL，`##` fixture） | `p4b-merge-handler.mssql.spec.ts` | PASS（8） |
| ALTERCOL-MSSQL-001..003 / ALTERCOL-TRAP-001 / UPDATEFROM-TRAP-001 / UPDATEFROM-EQ-001..006 / LOOKUP-EQ-001..005 / SKIP-MSSQL-001..003 / DEFAULT-MSSQL-001 / RESOLVE-002 / CLEANUP-003..004 | `p4b-lookup-handler.mssql.spec.ts` | PASS（23） |

**合計 P4b：71 測試全綠**（涵蓋測試設計 66 案 + 少量額外防禦守門：ALTERCOL 冪等選項甲 unit、RESOLVE-003b 不存在拋錯、SKIP-UNIT-002 交叉驗證）。真實 MSSQL 全數實跑（非 skip）；RESOLVE-002 於本輪由 lookup spec 自建最小 `extraction_tasks`/`datasources` 並實跑通過。

### DoD / 回歸

- **REG-001（DoD 紅線）** `npx tsc --noEmit -p tsconfig.build.json` **乾淨**。
- **REG-002** PG 原檔 `merge-handler.ts`/`lookup-handler.ts` 逐位元組未變（git 未列於變更；STATIC-004/REG-002 綠）。
- **REG-003** PG `engine-node-executors.spec.ts` **61 測試全綠**（含 merge/lookup PG 案例；同時覆蓋 REG-005 sqlite 路徑）。
- **REG-004** P4a 全套件（`temp-table.util.ts`/`resolve-raw-table-mssql.ts` 既有簽章）不回歸；整個 `engine/__tests__/` 目錄 **178 passed / 4 skipped**（skip=P4a EXTRACT-RESOLVE 因 dbo `extraction_tasks` 被本輪 lookup spec 先行擁有，屬既有 dbo 競用行為 R-MSSQL-P4A-05，非回歸）。
- **additive-only**：本輪只新增 8 檔（2 handler + 5 spec + 1 impl log），未修改任何既有追蹤檔（含 `node-output-store.ts`/`pipeline-runner.ts`/`types.ts`/PG handler/P4a 產出）。
- 既有 10 項技術債失敗（target-table-schemas / fn_calc customer_core drift）與本切片無關、未擴大（本輪零修改共用碼、零新增依賴）。

### 真實 MSSQL 關鍵佐證（節錄實跑）

- **UPDATE-FROM enrich 等價**：UPDATEFROM-EQ-001 5 列 input（代碼 1/2/3/2/9）逐列取得自身對應 desc（重複代碼 '2' 兩列皆 '二'、'9' 為 NULL、列數不變 5）→ 防笛卡兒積成立。
- **lookupFilter 正確排除**：UPDATEFROM-EQ-003 同 `TBL_CD='1'` 之 `A2`(國小)/`A4`(排除)，filter `"TBL_ID"='A2'` → 輸出「國小」，絕未誤配「排除」。
- **ALTER 冪等**：ALTERCOL-MSSQL-002 同表同 alias 兩次呼叫不拋錯、欄位僅一份；ALTERCOL-MSSQL-001 型別實測為 `nvarchar`（非 text）。
- **merge chained**：MERGE-EQ-005 m2→m3，輸出欄位集合恰 `{CUSTID, CUSTID_left, CUSTID_right, ldata, rdata}`（m2 殘留 30/31 被跳過，`_left`/`_right` 值為 m3 這層的 3/3）。
- **清理後 OBJECT_ID NULL**：CLEANUP-003 成功 pipeline 後 `##e1/##e2/##m1` 之 `OBJECT_ID` 皆 NULL；CLEANUP-004 merge 失敗後 lookup 原地修改之 `##e1` + `##e2` 仍被清理。
- **TRAP 佐證**：ALTERCOL-TRAP-001（naive `ADD COLUMN IF NOT EXISTS ... TEXT`）與 UPDATEFROM-TRAP-001（naive `UPDATE _src ... FROM (sub)`）對真實 MSSQL 皆拋語法錯誤 → 證兩處必改站點為真實陷阱。
