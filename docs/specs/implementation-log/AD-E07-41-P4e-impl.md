---
type: implementation-log
feature_id: AD-E07-41-P4e
feature_name: MSSQL 全面遷移 P4e — raw Staging Bulk-Load 寫入端（pg-copy-streams → tedious bulk，P4 最後一片）
status: complete
last_updated: 2026-07-08
---

# AD-E07-41 P4e：raw Staging Bulk-Load 寫入端 — Implementation Log

> 對應測試設計 `docs/test-specs/infrastructure/AD-E07-41-P4e-test.md`（65 案）與 AD-E07-41 v1.2 §6 / §9 P4e DoD。
> 範圍：raw `raw_*` staging 表在 MSSQL 上的建立/偵測/清空（ISPG-GATE 三方法）＋ tedious bulk 寫入端；
> 取代 PostgreSQL `COPY FROM STDIN`。**不含** ETL customer_core pipeline（P4a~d 已覆蓋）與來源端讀取
> （`mssql-executor.ts` 已相容）。

## 一、改動 / 新增檔案

| 檔案 | 類型 | 說明 |
|---|---|---|
| `apps/api/src/modules/extraction-task/raw-data.service.ts` | modified | 二元 `isPostgres` → 三態 `dbType`；`createRawTable`/`tableExists`/`getTableColumns` 補 mssql 分支；新增 `supportsBulk()`/`openBulkWriter()`/`mapToMssqlType()`/`mapToBulkColumnType()`/`buildMssqlConnectionConfig()` |
| `apps/api/src/modules/extraction-task/extraction-execution.service.ts` | modified | `canStream` 認識 `supportsBulk()`（DISPATCH）；`streamExtractWithCopy` → `streamExtractWithWriter`，依能力分派 `openCopyWriter` / `openBulkWriter` |
| `apps/api/.../extraction-task/__tests__/raw-data.service.mssql-unit.spec.ts` | new | TYPEMAP 矩陣、createRawTable DDL 三分支字串佐證、supportsBulk 三態、guard、STATIC（CI 恆跑，免真實連線） |
| `apps/api/.../extraction-task/__tests__/extraction-execution.service.mssql-dispatch.spec.ts` | new | DISPATCH-001..005（mock-based，CI 恆跑） |
| `apps/api/.../extraction-task/__tests__/raw-data.service.mssql.spec.ts` | new | ISPG-GATE / BULK-WRITE / NOESCAPE-CHARSET / BATCH / E2E-EXTRACT / PIPELINE-READ / PERF / PROBE-013（真實 MSSQL，不可達則 skip） |

## 二、🔴 MUST-FIX ISPG-GATE（三態改法，決策關卡 ISPG-GATE-001）

**改法**：建構子 `isPostgres: boolean` → `dbType: 'postgres' | 'mssql' | 'sqlite'`（由 driver `type` 導出）；
同時保留導出的 `isPostgres`/`isMssql` 兩個 boolean。三方法 `createRawTable`/`tableExists`/`getTableColumns`
改為 `if (isPostgres) … else if (isMssql) … else (sqlite)` 平行三分支（**非**在 SQLite else 內巢狀插 mssql）。

- `tableExists`：mssql 用 `SELECT OBJECT_ID('dbo.' + @0, 'U')`（既有 P1a/harness `objectExists` 慣例），非 `sqlite_master`。
- `getTableColumns`：mssql 用 **大寫** `INFORMATION_SCHEMA.COLUMNS`（I-MSSQL-CATALOG-CASE-01），非 `PRAGMA table_info`。
- `createRawTable`：mssql `_cdmp_id INT IDENTITY(1,1) PRIMARY KEY`、`_cdmp_extracted_at DATETIME2 DEFAULT SYSUTCDATETIME()`、
  欄型別走 `mapToMssqlType`。**T-SQL 無 `CREATE TABLE IF NOT EXISTS`** → 改 `IF OBJECT_ID('dbo.<t>','U') IS NULL CREATE TABLE …` 守門（冪等）。

**out-of-scope 家族保留既有行為**：`getRawData`（`LIMIT ? OFFSET ?`）、`getColumnMetadata`、`getIndexedColumns`
仍以導出的 `isPostgres` 二選一（mssql 落 sqlite 分支＝既有行為），不在 P4e 寫入路徑之直接依賴，未改動。
postgres/sqlite 兩分支逐字不變（見 §八 回歸）。

## 三、🔴 bulk-load 機制 + 4 Probe 真庫結論

新增 `openBulkWriter(rawTableName, columns)`，回傳與 `openCopyWriter` **相同的 `CopyWriter` 介面**
（`writeRows`/`finish`/`abort` 簽章不變，最小化 orchestrator 改動）。核心＝`mssql` 套件 `sql.Table` + `request.bulk(table)`。

### Probe 結論（真實 SQL Server 2022 / CDMP_TEST，實測，非臆測）

- **BULKWRITE-GATE-001（databaseConnection 取用手法）**：TypeORM mssql 之
  `(queryRunner as any).databaseConnection` **為 `undefined`**（與 PG 之 node-postgres client **不對稱**）——
  PG 手法**不可移植**。且 `request.bulk()` 要求 `Table` 與 `request` 出自**同一個 `mssql` 模組實例**：
  `getTediousType` 以物件 identity 對映 tedious 型別，跨實例（例如借 TypeORM 內部 pool）會落 `default` 分支回傳
  外來型別 → 拋 `c.type.declaration is not a function`。**採用測試設計預先核可之替代方案**：
  `openBulkWriter` 內以 `require('mssql')`（與 Table 同實例）自建專屬 `ConnectionPool`
  （連線資訊由 `this.dataSource.options` 導出，見 `buildMssqlConnectionConfig`），生命週期比照 PG 版 dedicated queryRunner
  （open 於 openWriter、close 於 finish/abort）。
- **BATCH-GATE-001（跨多次 bulk 可行性）**：對**同一物理表**以兩個獨立 `Table` 各呼叫一次 `request.bulk()`
  **皆成功且累加**（實測 2+1 列 → COUNT=3）。故 `writeRows` 每批建立新 `Table` 觸發獨立 bulk → **記憶體有界**
  （無單一累積 in-memory 結構直到 finish；符合 CLAUDE.md ETL 紅線）。BATCH-001 真庫實測列數逐批 50→100→150 遞增。
- **PROBE-013（型別寬容度）**：對 `NVARCHAR(MAX)` 目標欄刻意以較窄 `sql.NVarChar(100)` 宣告並寫 250 字元
  → **(a) bcp 拋 `Invalid column type from bcp client`（非靜默截斷）**。故 `openBulkWriter` 於 open 時查
  `INFORMATION_SCHEMA.COLUMNS` 取目標實際型別，宣告 bulk `Table` 與目標**逐欄一致**，避免此類拒絕。
- **BULKWRITE-006（abort 殘留，Probe）**：`abort()` 為硬性契約 **never throws**（僅 close pool）；已 flush 的批次
  （各 `writeRows` 為獨立 bulk、非交易）**留存**於目標表（真庫實測 abort 後 COUNT=1），據實記錄、不預設全有全無。

### DATETIME2 時區（實測 finding，已修）

首次實測 DATETIME2 round-trip 出現 8 小時（UTC+8）偏移——bulk 寫入池與讀回連線 `useUTC` 不一致所致
（JS `Date` 為 UTC instant，寫/讀 tz 不一致會位移日期欄）。修法：`buildMssqlConnectionConfig` 顯式 pin
`options.useUTC: true`（= tedious/`mssql-executor` 預設），使寫入的 DATETIME2 wall-clock 與 app 讀回一致；
修後逐欄 round-trip 精確相等。

## 四、型別對應（三層一致，TYPEMAP-GATE-001 / GATE-012）

| 來源型別家族 | raw DDL（`mapToMssqlType`） | bulk `Table`（`mapToBulkColumnType`） |
|---|---|---|
| int/integer | `INT` | `sql.Int` |
| bigint | `BIGINT` | `sql.BigInt`（讀回 string，>2^53 精度） |
| smallint / tinyint | `SMALLINT` / `TINYINT` | `sql.SmallInt` / `sql.TinyInt` |
| bit/bool/boolean | `BIT` | `sql.Bit` |
| **decimal/numeric/money** | **`NVARCHAR(MAX)`** 🔴 | `sql.NVarChar(sql.MAX)`（string 保真） |
| float/double | `FLOAT` | `sql.Float` |
| real | `REAL` | `sql.Real` |
| varchar/nvarchar/char/nchar/text/ntext/xml | `NVARCHAR(MAX)`（N-prefix，I-MSSQL-COLLATE-01） | `sql.NVarChar(sql.MAX)` |
| date/datetime/datetime2/smalldatetime/timestamp | `DATETIME2` | `sql.DateTime2` |
| time | `TIME` | `sql.Time` |
| binary/varbinary/image/bytea/blob | `VARBINARY(MAX)` | `sql.VarBinary(sql.MAX)` |
| uniqueidentifier/uuid | `UNIQUEIDENTIFIER` | `sql.UniqueIdentifier` |
| serial（PG 防禦分支） | `INT` | — |
| 未知 fallback | `NVARCHAR(MAX)`（非拋錯） | `sql.NVarChar(sql.MAX)` |

**🔴 TYPEMAP-003 MUST-FIX（FINDING-P4D-01 同型缺陷家族防線）**：decimal/numeric/money **不映射固定精度
`DECIMAL(p,s)`**，一律 `NVARCHAR(MAX)`。理由：MSSQL 無無界小數型別；固定 `DECIMAL(38,10)` 會在 raw DDL 層級重演
FINDING-P4D-01（補零 → 流入下游窄欄溢位）。文字型別忠實保留來源字面精度（對稱 PG 無界 `NUMERIC`）。

`mapToBulkColumnType` 由目標欄實際 `DATA_TYPE`（INFORMATION_SCHEMA）反查，與 raw DDL 逐欄對齊（PROBE-013 要求）。
bulk 值轉換 `coerce`：`undefined`/`null`→SQL NULL；字串欄把非字串 stringify（數字型來源欄映射 NVARCHAR(MAX) 時）；
空字串保留 `''`。

## 五、🔴 formatCopyValue 隔離（NOESCAPE-GATE-001 / STATIC-003）

`openBulkWriter` **絕不呼叫 `formatCopyValue`**（PG COPY TEXT 反斜線跳脫，型別化 bulk 誤用會把真實 tab/newline
損毀為字面兩字元）。值前處理為獨立 `coerce`（不含任何跳脫）。STATIC-003 以原始碼掃描 `openBulkWriter` 方法本體，
斷言**完全不含 `formatCopyValue` 識別字**（連註解都不出現，最強防線）。NOESCAPE-001 真庫實測：含真實 `\t`/`\n`/`\`
之字串逐字元 round-trip，且反證 `s.includes('\\t') === false`。

## 六、🔴 DISPATCH 接線（DISPATCH-GATE-001）

`extraction-execution.service.ts`：
- `canStream` 之目標能力判定由 `supportsCopy()` 擴為
  `supportsCopy() || (supportsBulk?.() === true)`（`targetSupportsBulkLoad`）。**採 optional chaining `?.()`**
  → 既有測試之 rawDataService mock（無 `supportsBulk`）**無需修改**即維持既有語意（REG-003 零 mock 改動，回歸更安全）。
- 快速路徑 `streamExtractWithCopy` 更名 `streamExtractWithWriter`，內部
  `supportsBulk?.() === true ? openBulkWriter : openCopyWriter`。其餘 streaming/進度/abort 邏輯不變。
- `supportsBulk()`：mssql=true、postgres/sqlite=false（與 `supportsCopy()` 互斥）。

DISPATCH-003 真庫 E2E + mock 皆確認 mssql full+streaming → 走 `openBulkWriter`（spy 驗證呼叫依賴，非僅回傳值）；
未接線則 bulk 為死碼。

## 七、範圍外家族清單（記入待後續切片，非本輪擴大）

1. **同缺陷家族之 `getColumnMetadata` / `getIndexedColumns` / `getRawData`（`LIMIT ? OFFSET ?`）**：
   `isPostgres` 二元下 mssql 仍落 sqlite 分支（`PRAGMA` / `?` 佔位）。非 bulk 寫入路徑之直接依賴（僅 raw data 瀏覽 API），
   本輪不改，維持既有行為。
2. **incremental 模式 mssql `insertBatch`**：`?` 佔位符 / T-SQL 參數上限 2100 之相容性未處理（P4e 僅擴充 full-mode 快速路徑）。
3. **🔴 CREATETABLE-FINDING（本輪真庫新發現，flag 非自行重設計）**：字串型**來源 PK** 欄映射 `NVARCHAR(MAX)`，
   而 MSSQL **MAX 型別不可作 PRIMARY KEY / index key**（`Could not create constraint or index`）。真實來源客戶編號多為
   字串型 PK → 於 MSSQL 走 `createRawTable` 會在建表拋錯。**建議後續**：PK 字串欄改有界 `NVARCHAR(≤450)`，或 mssql 一律
   忽略來源 PK 改用 `_cdmp_id`。依「flag it, don't self-redesign」原則本輪僅以測試 `CREATETABLE-FINDING` 鎖定並記錄，
   未擅自改 PK 策略（P4e DoD 之合成來源表無 PK，用 `_cdmp_id` IDENTITY，不受此限）。

## 八、回歸

- **REG-001**：`npx tsc --noEmit -p tsconfig.build.json` **乾淨**（exit 0）。
- **REG-002（PG COPY 路徑不變）**：`raw-data.service.spec.ts` 三 describe（formatCopyValue / supportsCopy+openCopyWriter guards /
  openCopyWriter COPY round-trip 含 dev PG 實跑）**逐字未改、8/8 全綠**（byte-identical）。
- **REG-003（DISPATCH 回歸）**：`extraction-execution.service.spec.ts` **5/5 全綠、mock 零改動**（optional chaining）。
- **REG-004（P4a/b/c/d etl-engine mssql）**：`src/modules/etl/engine/__tests__` 26 檔 **318 passed / 11 skipped**（baseline）——
  raw-data.service 屬不同模組，未受影響。
- **REG-005（SQLite raw-data 路徑）**：三態改法之 sqlite 分支由 unit（createRawTable DDL＝AUTOINCREMENT/`datetime('now')` 不變）
  + 既有 `raw-data.service.spec.ts` supportsCopy/guards 覆蓋，行為不變。

## 九、測試結果

CI 恆跑（免真實連線）：`raw-data.service.mssql-unit.spec.ts` 19、`extraction-execution.service.mssql-dispatch.spec.ts` 5 → 全綠。
真實 MSSQL（CDMP_TEST 可達）：`raw-data.service.mssql.spec.ts` 16 → 全綠。extraction-task 模組整體 **110/110**。

| 測試群組 | 代表案例 | 狀態 |
|---|---|---|
| §一 TYPEMAP | 001~008 矩陣、GATE-001/012、PROBE-013 | PASS |
| §二 ISPG-GATE | CREATETABLE-002/003、TABLEEXISTS-002、GETTABLECOLUMNS-001、DROPTABLE-001、SANITIZE-001 | PASS |
| §三 DISPATCH | 001~005、GATE-001 | PASS |
| §四 BULK-WRITE | 001~004（列數/逐欄/NULL/空字串）、005 guard、006 abort、GATE-001 | PASS |
| §五 NOESCAPE-CHARSET | NOESCAPE-001、CHARSET-001/002/003、GATE-001 | PASS |
| §六 BATCH | 001/002 逐批遞增、003 邊界、GATE-001 | PASS |
| §七 E2E-EXTRACT | 001/002/005（bulk 路徑/列數/狀態/冪等）、GATE-001 | PASS |
| §八 PIPELINE-READ | 001/002/003（ExtractHandlerMssql 讀 bulk 產出、中文/NULL） | PASS |
| §九 PERF | 001/002（10,000 列 ~200ms，≈46k~48k rows/s） | PASS（觀察性） |
| §十一 STATIC | 001 版本、002 簽章、003 formatCopyValue 隔離 | PASS |

**PERF 觀察值**：bulk-load 10,000 列耗時約 206~217ms（≈46,000~48,500 rows/s）。不設門檻，供未來優化參考。

## 十、偏差 / 決策

- **DATETIME2 時區**：pin `useUTC: true`（決策，非測試設計預列）——避免寫/讀 tz 不一致位移日期欄；已於 §三記錄。
- **CREATETABLE-FINDING（字串 PK）**：範圍外真庫發現，以測試鎖定並 flag，未自行改 PK 策略（§七.3）。
- **陷阱佐證案（TYPEMAP-009 / ISPG-*-001 / DISPATCH-001 / NOESCAPE-001）**：「斷言未修改程式碼為紅燈」與「本輪即修正」
  互斥於單一交付。改以其正向對應案（TYPEMAP-010、CREATETABLE-002、TABLEEXISTS-002、DISPATCH-003）＋
  DDL 字串反證（`not.toContain('AUTOINCREMENT'/'SERIAL'/'NOW()')`）＋ DISPATCH-001（supportsCopy=supportsBulk=false → 落 insertBatch）
  達成同等「缺口已封」佐證。
- **REG-003 mock**：因採 optional chaining，既有 `extraction-execution.service.spec.ts` mock **無需補 `supportsBulk`**（比測試設計預期更保守、回歸更安全）。
