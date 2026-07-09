---
type: implementation-log
feature_id: AD-E07-P6c
feature_name: MSSQL 遷移 P6c — raw staging 日期欄 bulk-load 缺陷修復（FINDING-P6C-01）
status: complete
last_updated: 2026-07-09
---

# AD-E07-P6c：raw staging 日期欄 bulk-load 缺陷修復 — Implementation Log

## 摘要

P6c 首次以真實 legacy 來源觸發 ETL 灌入時，MSSQL 生產庫的 raw staging 擷取在
**~1,024,000 / 3,615,694 列**失敗，tedious bulk 拋：

```
OLE DB provider 'STREAM' for linked server '(null)' returned invalid data
for column '[!BulkInsert].UPDATE_DATE'.
```

根因：`raw-data.service.ts::mapToMssqlType` 將來源 date/datetime/timestamp 欄映射為
typed `DATETIME2` raw 欄，`openBulkWriter::mapToBulkColumnType` 據此將 bulk `Table`
該欄宣告為 `DateTime2`。真實 legacy 某 `UPDATE_DATE` 值塞不進 datetime2 → bulk 崩潰。

此為 **FINDING-P4D-01 同型缺陷家族**：decimal/numeric/money 早已改 `NVARCHAR(MAX)` 保真
（TYPEMAP-003），date 家族當時漏掉；P4e 只用乾淨 synthetic fixture 測、未碰真實髒日期。

## 根因驗證（真庫 probe，dev CDMP 172.20.202.212 / DB=CDMP / 2022 / BIN）

以 `mssql`(tedious) 對 dev CDMP 逐值 probe（自建拋棄式 raw_ 表 + 即清），實測：

| 值型態 | DATETIME2 bulk 欄 | NVARCHAR(MAX) bulk 欄 |
|---|---|---|
| 乾淨 `Date`（2024-01-15） | OK | OK |
| **UTC 位移 year0 哨兵** `new Date('0000-12-31T16:00Z')` | **FAIL — `returned invalid data for column '[!BulkInsert].d'`（重現任務所述精確錯誤）** | OK |
| 字串化零日期 `'0000-00-00'` | FAIL — `Invalid date value passed to bulk rows` | OK |
| 字串 `'00000000'` / `'99991231'` / `'9999-12-31'` | 部分 OK 部分 FAIL（不可靠） | OK |
| 空字串 / 全空白 | FAIL | OK |

**精確根因**：來源 date 欄經 tedious（`useUTC:true`）讀出後，legacy 最小日哨兵（近 year 1）
被 UTC 位移至 **year < 0001**，落在 `datetime2` 支援下界（0001-01-01）之外 → bulk STREAM
編碼拋 `returned invalid data`。`NVARCHAR(MAX)` 對所有型態一律成功（保真存字串）。

## 修法

### 1. `mapToMssqlType`：date/datetime/timestamp/**time** 家族 → `NVARCHAR(MAX)`

比照 decimal（FINDING-P4D-01）文字保真。`time` 一併納入（同屬時序傳輸風險家族：legacy
time 值亦可能髒；真庫判斷風險同型，故一併保真）。

- `_cdmp_extracted_at` **不動**：仍為 `DATETIME2 DEFAULT SYSUTCDATETIME()`（CDMP 自身欄、
  恆 SYSUTCDATETIME 有效值）。此欄由 `createRawTable` 硬寫，不經 `mapToMssqlType`。
- `mapToBulkColumnType` **不動**：其 datetime/date 分支（→ `sql.DateTime2`）仍必要——
  `allColumns` 含 `_cdmp_extracted_at`（真實 datetime2 欄），bulk `Table` 須宣告相符型別
  （PROBE-013：bcp 拒收型別不符欄）。業務日期欄改 nvarchar 後，其 `DATA_TYPE` 回報
  `'nvarchar'` → 落 `mapToBulkColumnType` 之 default NVARCHAR 分支（isString=true）→
  `coerce` 對 `Date` 呼 `toISOString()`、對字串原樣、對 null → null。coerce **不動**（既有邏輯
  已正確涵蓋）。

### 2. `insertBatch`：MSSQL 分支對 `Date` 值先 `toISOString()`（兩寫入路徑一致性）

真庫發現：raw 日期欄改 nvarchar 後，**參數化慢路徑**（incremental / 非串流 full 之
`insertBatch`）綁定 JS `Date` 參數時，SQL Server 以 locale-default **style-0** 隱式轉入
nvarchar（`'Mar  4 2020  5:06AM'` — **掉秒、非 ISO、`new Date()` 無法解析**），與 bulk 快路徑
之 ISO coerce **不一致且失真**。故於 `insertBatch` 之 MSSQL 分支對 `Date` 值先
`toISOString()`，使兩路徑存相同忠實 ISO 字串。**pg/sqlite 分支不觸碰**（其 raw 日期欄仍為
TIMESTAMP/TEXT，繼續綁原生 `Date`，零回歸）。

## int/bigint/float/bit 是否一併廣義 NVARCHAR — 決策：**保守，僅改 date/time**

**裁定：僅時序家族（date/datetime/timestamp/time）改 NVARCHAR(MAX)；int/bigint/smallint/
tinyint/bit/float/real 維持 typed。** 理由：

1. **僅時序有已證傳輸風險**：probe 精確重現的失敗機制為時序特有——(a) 跨 DBMS 日期範圍
   落差（datetime2 之 year-0001 下界）+ (b) `useUTC` 位移 + (c) legacy 字串化髒日期。
   數值型別（int/bigint/float/bit）**無對應風險**：無時區變換、無範圍收窄；來源欄若宣告
   int/float，其自身 DBMS 已保證僅含合法值，tedious 回傳合法 JS number/boolean，無損 bulk 進
   typed 欄。
2. **下游「能容」全 nvarchar，但非「必要」**：已查證下游可吃 nvarchar 數值來源——
   `type_cast` handler 以 `TRY_CAST(col AS NVARCHAR(4000))` 讀字串驗證，4 條 DECIMAL type_cast
   規則本即讀 nvarchar decimal raw 欄（P4d 已如此）；`field_mapping` 直通；target_load 對乾淨
   數值字串隱式轉入 typed 目標亦可。故廣義化為「raw 一律 NVARCHAR」**安全但非必需**。
3. **廣義化更具侵入性**：會使全資料集 raw 欄由 typed 轉 text，失去 raw 上的原生數值排序/查詢，
   並把「字串比較 vs 數值/時序語意」的下游隱憂擴及數值欄。
4. **對齊 FINDING-P4D-01 家族之漸進式作法**：decimal 因 decimal 壞而改、date 因 date 壞而改；
   int/float 廣義化列為 **follow-up**，待真實髒數值事件觸發再擴，不預先擴大 blast radius。

## 下游相容確認（重要 — 修正任務前提）

任務原假設「讀該 raw 表的 ETL 仍能 type_cast 轉換該日期（P4a DATE handler TRY_CAST）」。
**實查 5 條 pipeline 定義（`etl-pipelines.json`）：全域 0 條 DATE `type_cast` 規則**（僅 4 條
DECIMAL）。即**所有日期欄係經 `field_mapping` 直通、於 target_load 以隱式轉換落入 typed
date/datetime2 目標欄**（customer_core：`date_of_birth date`、`source_updated_at/id_issue_date/
highest_transaction_date/source_created_at datetime2`；及 4 條 fullMode pipeline 之日期欄）。

真庫佐證（probe §三，見測試 P6C-BULKDATE-006/007）：

- **乾淨 ISO 字串**（多數列）→ `INSERT...SELECT` 隱式轉入 datetime2/date typed 目標**成功**
  （raw 改 nvarchar 對絕大多數列下游無礙、byte-一致）。
- **髒日期字串**（如 `'0000-00-00'`、`'0000-12-31T16:00Z'`）→ 隱式轉換**失敗**
  （`Conversion failed when converting date and/or time`），但 `TRY_CAST(dt AS date)` → **NULL**。

**結論與 follow-up（不在本 raw 修法範圍，屬 ETL engine / pipeline-config 層，另案處理）**：

- 本 raw 修法為 P6c 擷取解除封鎖之**必要且充分**條件（3.6M 列擷取現可完成，忠實入庫）。
- 但**若被灌欄位含真實髒日期，customer_core 等 target_load 的隱式轉換會令整批 INSERT 失敗**
  （atomic）。此為修好 raw 後**新曝光**的下游議題，非本層可解。建議 follow-up 擇一：
  (a) 對這些日期欄新增 DATE `type_cast` 節點（TRY_CAST → 髒值轉 NULL）；或
  (b) `target-load-handler` 對 typed date/datetime2 目標欄改防禦性 `TRY_CAST`。
- **次要（多屬良性）漣漪**，一併記錄供 follow-up 評估：
  - `merge`/`dedup` 以 `source_updated_at`（現 nvarchar）做「取最新」比較 → 字串比較。coerce 恆
    產出 ISO 8601 格式，字典序 == 時序，**一般良性**；僅當同欄格式混雜才可能誤選。
  - `ob_emphire` 之 `conditional`「`resign_date = '9999-12-31'` 哨兵歸一」→ 來源 `Date`
    coerce 為 `'9999-12-31T00:00:00.000Z'`，與字面 `'9999-12-31'` 字串比較為 FALSE → 哨兵不再
    歸一為 NULL、改直存 9999-12-31。因 emphire-active 語意（resign_date NULL 或 >= 系統日 = 在職）
    對 9999-12-31 與 NULL 同判「在職」，**在職判定結果不變**、僅儲存表徵不同（低風險）。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/extraction-task/raw-data.service.ts` | modified | `mapToMssqlType` date/datetime/timestamp/time → `NVARCHAR(MAX)`（+ 類別註解 FINDING-P6C-01）；`insertBatch` MSSQL 分支對 `Date` 值先 `toISOString()`。`mapToBulkColumnType`/`coerce`/`createRawTable`(_cdmp_extracted_at) 皆未動。 |
| `apps/api/src/modules/extraction-task/__tests__/raw-data.service.p6c-bulk-date.mssql.spec.ts` | new | 重現 + 修復 + 下游相容真庫測試（7 案）。 |
| `apps/api/src/modules/extraction-task/__tests__/raw-data.service.mssql-unit.spec.ts` | modified | TYPEMAP-005：date 家族 + time → `NVARCHAR(MAX)`（原斷言 DATETIME2/TIME 為缺陷行為，依修法更新）。 |
| `apps/api/src/modules/extraction-task/__tests__/raw-data.service.p4fu.mssql.spec.ts` | modified | GETCOLMETA-003：`dt`（來源 datetime）現回報 `'nvarchar'`；MIXED_COLS 註解更新。 |
| `apps/api/src/modules/extraction-task/__tests__/raw-data.service.mssql.spec.ts` | modified | MIXED_COLS 註解更新（`dt` → NVARCHAR(MAX)）；BULKWRITE round-trip 斷言不變仍通過。 |

## Test Results Summary（真庫 = dev CDMP）

| Scenario ID | Description | Status |
|-------------|------------|--------|
| P6C-BULKDATE-001 | Repro：DATETIME2 欄 bulk year0 哨兵 → `returned invalid data`（重現精確錯誤） | PASS |
| P6C-BULKDATE-002 | Repro：DATETIME2 欄 bulk `'0000-00-00'` → 拒收 | PASS |
| P6C-BULKDATE-003 | Fix/DDL：date/datetime/timestamp/time → NVARCHAR(MAX)；系統欄仍 datetime2 | PASS |
| P6C-BULKDATE-004 | Fix/DoD：openBulkWriter 對 NVARCHAR 欄吃 髒Date/髒字串/乾淨Date/NULL、保真存字串 | PASS |
| P6C-BULKDATE-005 | Fix：insertBatch Date → ISO（非 style-0 lossy），兩路徑一致 | PASS |
| P6C-BULKDATE-006 | Downstream：乾淨 ISO 字串 → 隱式轉入 datetime2/date typed 目標成功 | PASS |
| P6C-BULKDATE-007 | Downstream：髒日期隱式轉失敗但 TRY_CAST → NULL（防禦機制存在） | PASS |

回歸與型檢：

- `npx tsc --noEmit -p tsconfig.build.json` — **乾淨**。
- 全 `src/modules/extraction-task` 套件 — **147/147 PASS**（含全 MSSQL 真庫 spec：raw-data.service.mssql 16 + p4fu.mssql 27 + p6c-bulk-date.mssql 7 + mssql-unit 20 + executors/dispatch/pg-sqlite 等）。
- pg/sqlite 零回歸：`raw-data.service.spec`(8)/`raw-data.service.p4fu.spec`(2) — PASS（`mapToMssqlType` 為 MSSQL 專屬，pg/sqlite 走各自 mapper；`insertBatch` coercion 以 `this.isMssql` 圈定）。
- ETL 下游 sanity：`p4a-type-cast-handler.mssql`(12) — PASS（type_cast 讀字串經 TRY_CAST，不受 raw 欄型別變更影響）。

## Architectural Decisions

- **AD-P6C-1**：raw staging 時序欄一律 NVARCHAR(MAX) 保真（FINDING-P6C-01），與 decimal 保真同家族。
- **AD-P6C-2**：僅時序家族改 nvarchar；數值/布林維持 typed（無傳輸風險，見上決策）。int/float 廣義化列 follow-up。
- **AD-P6C-3**：`insertBatch` 於 MSSQL 對 Date 統一 ISO 化，令 bulk 與參數化兩路徑對 nvarchar 日期欄存值一致。
- **AD-P6C-4**：`mapToBulkColumnType`/`coerce`/`_cdmp_extracted_at` 刻意不動（系統 datetime2 欄仍需 DateTime2 bulk 型別；業務欄自動落 nvarchar 分支）。

## Blocking Issues / 需使用者處置

1. **生效需 rebuild api image**：此修改屬後端服務程式碼，須 rebuild `cdmp-api` image 才生效於使用者
   運行的 app。**完整驗證（重跑 3.6M 列真實擷取）由使用者 rebuild 後觸發**；本次已於 dev CDMP 以
   小規模真源（自建 probe raw 表 + 髒值 bulk）佐證重現與修復，未觸發 3.6M 全量。
2. **下游 follow-up（另案、非本 raw 層）**：P6c 完整成功尚需處理「髒日期經隱式轉換落 typed 目標欄
   會令 target_load 整批失敗」——建議新增 DATE type_cast 節點，或 target-load 對日期欄改防禦性
   TRY_CAST。詳見上「下游相容確認」。
