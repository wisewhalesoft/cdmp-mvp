---
type: implementation-log
feature_id: AD-E07-41-P4-followup
feature_name: MSSQL 遷移 P4 收尾 — raw-data.service 完整性（CREATETABLE-FINDING 候選 b + extraction 家族 mssql 三分支）
status: complete
last_updated: 2026-07-09
---

# AD-E07-41 P4-followup：raw-data.service 完整性 — 實作日誌

落地依據：`docs/test-specs/infrastructure/AD-E07-41-P4-followup-rawdata-test.md`（含 test-designer
真庫已驗事實 V1-V13，直接採用）。連線：**dev CDMP**（`.env.test.mssql` = `172.20.202.212/CDMP`，
SQL Server 2022 Standard、`Chinese_Taiwan_Stroke_BIN`），`npx vitest run --no-file-parallelism`
不加 inline env（由 `mssql-env-preload` 的 dotenv 載入）。全部測試自建/清理 `raw_*` staging 表，
未觸碰任何已部署 baseline 表；afterAll 後複查 dev CDMP 零 `raw_*`/`probe_*`/`p4*` 殘留。

## Test Results Summary

| Scenario ID | 說明 | Status |
|-------------|------|--------|
| PKFINDING-GATE-001 | 候選選型（裁定＝候選 b）＋理由 | PASS（本日誌記錄，見下） |
| PKFINDING-002 | 既有 CREATETABLE-FINDING 陷阱測試 → 更新為候選 b 目標行為 | PASS（dev CDMP） |
| PKFINDING-006 | 單一字串 PK → `_cdmp_id` surrogate、來源欄非 PK NVARCHAR(MAX)、>900byte round-trip | PASS |
| PKFINDING-008 | 純 int 來源 PK（單一/複合）不受影響（範圍＝僅字串/MAX 型別觸發 surrogate） | PASS |
| PKFINDING-009 | 無 PK/非字串欄情境不受影響 | PASS |
| PKFINDING-010 | 混合複合 PK（int+字串）→ 整組降級 surrogate | PASS |
| PKFINDING-003/004/005/007 | 候選 (a)/(c) 專屬（900/1700-byte 邊界） | N/A（候選 b，見裁定） |
| GETCOLMETA-001 | 現行 PRAGMA 對 MSSQL 拋 #102（陷阱佐證） | PASS |
| GETCOLMETA-002 | mssql 分支正確回傳 metadata（順序/isSystem/欄位數） | PASS |
| GETCOLMETA-003 | dataType 回傳 INFORMATION_SCHEMA 原生字面 | PASS |
| GETCOLMETA-004 | postgres/sqlite 基準 | PASS（REG-003/004 runBaseline 涵蓋） |
| GETIDXCOLS-001 | 現行 PRAGMA index_list 對 MSSQL 拋 #102 | PASS |
| GETIDXCOLS-002 | 已索引 vs 未索引正確辨識 | PASS |
| GETIDXCOLS-003 | 僅 PK、無額外索引 | PASS |
| GETIDXCOLS-004 | >100,000 列警告完整 E2E 路徑 | DEFERRED（Observability、非阻擋、重量級 fixture） |
| GETRAWPAGE-001 | 現行 `LIMIT ? OFFSET ?` 對 MSSQL 拋 #102 | PASS |
| GETRAWPAGE-002 | sortBy 跨頁分頁正確 | PASS |
| GETRAWPAGE-003 | 無 sortBy — 有來源 PK / 有 `_cdmp_id` 兩表皆不拋 #153、確定性結果 | PASS |
| GETRAWPAGE-004 | page 超界 → data=[] | PASS |
| GETRAWPAGE-005 | limit 50/100/200 | PASS |
| GETRAWPAGE-006 | sortOrder=desc | PASS |
| GETRAWPAGE-007 | 空表 totalPages=0 | PASS |
| GETRAWPAGE-008 | postgres/sqlite 基準 | PASS（REG-003/004 涵蓋） |
| INSERTBATCH-GATE-001/002 | 佔位符設計（Pattern B）＋2098 切片門檻 | PASS（本日誌記錄，見下） |
| INSERTBATCH-001 | 現行 `?` 佔位符對 MSSQL 拋 #102 | PASS |
| INSERTBATCH-002 | 逐欄值一致（字串/整數/中文/NULL/日期/decimal-as-text） | PASS |
| INSERTBATCH-003 | 21 欄×101 列自動切片跨越 2098、總數/回傳=101 | PASS |
| INSERTBATCH-004 | 恰達門檻（20×100=2000 單批）與略超（101 跨批） | PASS |
| INSERTBATCH-005 | 空 rows → 回傳 0、不執行 SQL | PASS |
| INSERTBATCH-006 | postgres/sqlite 基準（含 PG_PARAM_LIMIT） | PASS（REG-003/004 涵蓋） |
| INSERTBATCH-007 | 中文/單引號特殊字元具名參數化天然防注入 | PASS |
| E2EAPI-001/002 | getRawData 公開全鏈路 + columns 一致 | PASS |
| E2EAPI-003 | insertBatch incremental 模式真實 wiring | PASS |
| E2EAPI-004 | full-mode 但來源不支援 streaming → insertBatch fallback | PASS |
| E2EAPI-005 | full-mode + streaming → bulk 路徑（回歸） | PASS |
| REG-001 | `tsc --noEmit -p tsconfig.build.json` 乾淨 | PASS |
| REG-002 | P4e 既有 mssql 套件不回歸（含更新後 FINDING/CREATETABLE-003） | PASS（16+20） |
| REG-003 | postgres 4 方法新建基準 | PASS（**dev postgres 真跑**，非 skip） |
| REG-004 | sqlite 4 方法新建基準 | PASS（better-sqlite3 :memory:） |
| REG-005 | 其餘 mssql 套件（dispatch）不回歸 | PASS |
| STATIC-001/002/003 | 簽章不變＋決策記錄 | PASS（本日誌） |

實跑指令與結果（全綠、零 skip 於可達環境）：
- `raw-data.service.p4fu.mssql.spec.ts` → **27 passed**（dev CDMP）
- `raw-data.service.mssql.spec.ts`（更新後）→ **16 passed**（dev CDMP）
- `raw-data.service.mssql-unit.spec.ts`（更新後）→ **20 passed**（fake DS）
- `raw-data.service.p4fu.spec.ts` → **2 passed**（sqlite 真跑 + postgres 真跑）
- `raw-data.service.spec.ts` → 8 passed；`extraction-execution.service.spec.ts` → 5 passed；
  `extraction-execution.service.mssql-dispatch.spec.ts` → 5 passed
- `npx tsc --noEmit -p tsconfig.build.json` → exit 0（乾淨）

## Files Changed

| File Path | Change Type | Description |
|-----------|-------------|-------------|
| `apps/api/src/modules/extraction-task/raw-data.service.ts` | modified | createRawTable 候選 b（MSSQL MAX 型別來源 PK → `_cdmp_id` surrogate）；getColumnMetadata / getIndexedColumns 新增 mssql 分支；getRawData 新增 mssql `OFFSET...FETCH` 分頁 + `defaultMssqlOrderBy` helper；insertBatch 統一 Pattern B + per-driver 參數上限切片 |
| `apps/api/src/database/__tests__/mssql-env-preload.ts` | modified | `MSSQL.database` fallback 增 `?? process.env.DB_NAME`（見偏差 D-1；讓 `.env.test.mssql` 之 DB_NAME=CDMP 生效） |
| `apps/api/src/modules/extraction-task/__tests__/raw-data.service.p4fu.mssql.spec.ts` | new | 主整合 spec（27 案，dev CDMP）：PKFINDING/GETCOLMETA/GETIDXCOLS/GETRAWPAGE/INSERTBATCH/E2EAPI |
| `apps/api/src/modules/extraction-task/__tests__/raw-data.service.p4fu.spec.ts` | new | REG-003/004 postgres+sqlite 基準（runBaseline 涵蓋 5 方法） |
| `apps/api/src/modules/extraction-task/__tests__/raw-data.service.mssql.spec.ts` | modified | PKFINDING-002：CREATETABLE-FINDING 陷阱 `rejects.toThrow` → 候選 b 目標行為驗證 |
| `apps/api/src/modules/extraction-task/__tests__/raw-data.service.mssql-unit.spec.ts` | modified | CREATETABLE-003 複合改純 int/bigint（保留原意）；新增 CREATETABLE-003b（PKFINDING-010 mixed → surrogate 之 DDL 字串佐證） |

## Architectural Decisions（決策關卡落地）

### CREATETABLE-FINDING GATE-001＝候選 (b)（STATIC-002）
裁定＝候選 b（使用者指定）：**MSSQL 上「映射為 MAX 型別（NVARCHAR(MAX)/VARBINARY(MAX)）」的來源 PK
欄無法作 index key（#1919，V1）→ 降級為一般欄，改由 `_cdmp_id IDENTITY(1,1)` surrogate 承載 PK；
不對來源鍵設 DB 唯一約束**（raw staging 為 ETL 中繼，唯一性由 pipeline dedup 負責）。
- **觸發判定**：`mssqlSourcePkUnusable = isMssql && primaryColumns.some(c => mapToMssqlType(c.dataType).includes('(MAX)'))`。
  以「映射型別是否為 MAX」為準（涵蓋字串家族 + decimal/numeric/money + binary 家族），比字面「字串」更精確。
- **「一律」範圍（GATE-001 第 4 項 / PKFINDING-008）**：**僅 MAX 型別來源 PK 觸發 surrogate；int/bigint/bit/
  datetime/uniqueidentifier 等非 MAX 型別來源 PK 維持原生 PK 不變** → 既有 `CREATETABLE-003`（int/bigint）
  行為不變（斷言未破）。混合複合 PK 只要含任一 MAX 鍵欄，整組降級（PKFINDING-010，因複合 PK 無法只保留部分鍵）。
- **候選 (a)/(c) 之 900/1700-byte 風險（V3/V4/V5）於候選 b 天生不存在**：來源欄為非 index-key 的
  NVARCHAR(MAX)，INSERT 任意 byte 長度值皆可（PKFINDING-006 已用 1200-byte 中文值真庫驗證 round-trip），
  故本輪**不需**任何應用層前置長度檢查。V2「宣告 n 值不影響 DDL 成敗」之澄清於候選 b 下不適用（不宣告有界 n）。
- 為何不選 (a)：宣告 `NVARCHAR(≤450)` 不能保證真實客編 ≤900 bytes（V4），仍會於 INSERT 拋 #1946；
  為何不選 (c)：`NONCLUSTERED PK` 雖放寬至 1700 bytes 仍有上限、且多一個索引的寫入/儲存成本。候選 b 無 byte 上限、
  最 robust、與 P4e 之 `_cdmp_id` surrogate 慣例一致。

### extraction 家族 mssql 三分支（承 P4e ISPG-GATE）
- **getColumnMetadata**：新增 `if (isMssql)` 分支 → `INFORMATION_SCHEMA.COLUMNS`（**大寫**，V12 小寫拋 #208；
  `TABLE_SCHEMA='dbo'`、`ORDER BY ORDINAL_POSITION`、`@0` 具名）；`dataType` 取 `DATA_TYPE` 原生小寫字面
  （V10：int/nvarchar/bigint/bit/datetime2），與 postgres 分支語意對稱。非巢狀插入 postgres else，維持三分支對稱。
- **getIndexedColumns**：新增 `else if (isMssql)` 分支 → `sys.indexes + sys.index_columns + sys.columns` join
  （V11 已驗形狀），`OBJECT_ID('dbo.'+@0)`；回傳全部索引（PK 隱含 index + 顯式 CREATE INDEX）之欄位集合。
- **getRawData 分頁**：新增 `else if (isMssql)` 分支 → `OFFSET @0 ROWS FETCH NEXT @1 ROWS ONLY`（參數序＝[offset, limit]）。
  T-SQL 之 OFFSET...FETCH **強制 ORDER BY**（#153，V8）→ 新增 `defaultMssqlOrderBy(rawTableName, columns)`：
  優先 `_cdmp_id`（存在時；唯一單調）→ 否則查 `sys.indexes is_primary_key=1` 取來源 PK 欄（確定性）→ 最終
  fallback `_cdmp_extracted_at`。**不假設 `_cdmp_id` 恆存在**（GATE-001 GETRAWPAGE 澄清：來源有 PK 之表無 `_cdmp_id`）。
  postgres/sqlite 之無 sortBy 無 ORDER BY 行為刻意不動（僅 MSSQL 語法強制需要）。

### INSERTBATCH GATE-001/002（Pattern B + 2098 切片，STATIC-003）
- **GATE-001＝Pattern B**（採納建議）：援用 `assignment-run-pipeline.service.ts:1517` 具名參數 +
  `driver.escapeQueryWithParameters(sql, paramsObject, {})`，VALUES 子句改 `:r{row}c{col}` 具名參數，一次
  讓 PG($n)/MSSQL(@n)/SQLite(?) 三路徑統一展開 —— **取代**原 postgres/else 手刻兩分支（消除 `?`/#102 陷阱、
  型別化參數天生防注入）。postgres 分支行為經 REG-003 真跑驗證等價（$n 展開 + 65000 切片保留）。
- **GATE-002＝切片門檻 2000**（保守 buffer）：V7 實測 MSSQL RPC 安全上限＝**2098**（官方訊息寫 2100，但 mssql/tedious
  堆疊 off-by-2）。取門檻 **2000**（明顯低於 2098，比照 PG_PARAM_LIMIT=65000 之 buffer 慣例）為版本差異保留餘裕。
  per-driver：`paramLimit = isPostgres?65000 : isMssql?2000 : null(sqlite 維持不切片)`；
  `maxRowsPerInsert = paramLimit ? max(1, floor(paramLimit/colCount)) : rows.length`。

### E2E-API Harness（GATE-001）
`getRawData` 測試以 `new RawDataService(真實 mssql DataSource, mock taskRepo, mock logRepo)` 建構（比照既有手法，
非 Nest TestingModule）；`insertBatch` wiring（E2EAPI-003/004/005）以 mock executor 直驅
`ExtractionExecutionService.executeExtraction`，spy `openBulkWriter`/`insertBatch` 驗證 dispatch 分流。

## 偏差（Deviations）

- **D-1（測試基礎設施，必要）**：`mssql-env-preload.ts` 之 `MSSQL.database` 原為
  `process.env.MSSQL_TEST_DB ?? 'CDMP_TEST'`，會忽略 `.env.test.mssql` 的 `DB_NAME`。實測 dev 172.20.202.212
  **無 `CDMP_TEST` 資料庫**（只有 `CDMP`）→ 若不改，所有 `.mssql.spec.ts` 對 dev 連線失敗而全數 skip，無法滿足
  「改用 `.env.test.mssql` 跑測試」之指示。改為 `?? process.env.DB_NAME ?? 'CDMP_TEST'`（向後相容：localhost
  inline env 之 DB_NAME=CDMP_TEST 仍→CDMP_TEST；純預設仍→CDMP_TEST）。影響全部 mssql specs 一致指向 `.env.test.mssql`
  之 DB，符合使用者「先都用 CDMP 沒問題」裁示。
- **D-2**：候選 b 使 `mssql-unit.spec.ts` 既有 `CREATETABLE-003` 複合案例（原 int + varchar）行為改變
  （varchar 鍵為 MAX → 整組降級 surrogate）。依 PKFINDING-008/010 為**刻意變更**：將原案改為純 int/bigint 複合
  （保留「複合 PK 語法正確」原意，且與 `mssql.spec.ts` 整合 CREATETABLE-003 的 int+bigint 一致），另新增
  `CREATETABLE-003b` 專測混合鍵降級。非意外回歸。
- **D-3（非阻擋）**：GETIDXCOLS-004（>100,000 列警告完整 E2E 路徑）為 Observability，重量級 fixture 未建置；
  `getIndexedColumns()` 方法正確性已由 GETIDXCOLS-002/003 + V11 查詢形狀佐證，DoD 核心不受影響。

## Blocking Issues

無。全部 DoD 核心案例對 dev CDMP 真庫綠燈、postgres/sqlite 基準真跑綠燈、tsc 乾淨、dev CDMP 零殘留。
