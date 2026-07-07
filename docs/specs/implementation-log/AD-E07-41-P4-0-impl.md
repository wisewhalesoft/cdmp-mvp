---
type: implementation-log
feature_id: AD-E07-41-P4-0
feature_name: MSSQL baseline 補 customer_core 空表 schema（P4c/P4d 前置）
status: complete
last_updated: 2026-07-08
---

# AD-E07-41 P4-0：customer_core 併入 MSSQL baseline migration — 實作日誌

## 範圍與動機
- customer_core 為 **PG-only 表、無 TypeORM entity**（AD-E06-1），P1b 之 37/36-entity synchronize 天生不建。
- 目的：把其**空表 schema + unique index** 機械翻譯進 MSSQL baseline，解除 P4c/P4d「customer_core 表不存在 → 硬錯誤」風險。
- 只做 schema + parity 白名單例外 + 驗證測試；不碰 handler（P4a）、不動 ETL 資料流。

## 檔案異動
| 檔案 | 類型 | 說明 |
|------|------|------|
| `src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts` | modified | up() 新增 `CREATE TABLE "customer_core"`（92 欄 + PK + UNIQUE）；down() 對稱補 `DROP TABLE "customer_core"` |
| `src/database/__tests__/mssql-p1b2.mssql.spec.ts` | modified | `EXCLUDED_TABLES` 加 `'customer_core'`（parity 白名單例外）；新增 CUSTOMER-CORE 驗證群組（CC-001~008） |
| `src/database/__tests__/mssql-p1b3.mssql.spec.ts` | modified | `dboBusinessTableCount()` 排除清單加 `'customer_core'`，維持「migration:run 後 dbo 業務表 = 36」斷言 |

## DDL 翻譯要點（PG BaselineSchema1711360000000 → MSSQL）
忠實逐欄翻譯 PG customer_core 完整 92 欄，型別對照沿用 P1b 慣例：
- `uuid` → `uniqueidentifier`（customer_id、_etl_pipeline_id）
- `DEFAULT gen_random_uuid()`（PG 隨機 uuid 預設）→ `DEFAULT NEWID()`
- `DEFAULT now()` → `DEFAULT getdate()`（_etl_loaded_at）
- `timestamp without time zone`（裸 timestamp）→ `datetime2`
- `character varying(N)` → `varchar(N)`（長度保真）
- **`character(1)`（固定長）→ `char(1)`**（debt_flag / fine_flag；非 varchar，忠實保留固定長語意）
- `smallint` → `smallint`、`integer` → `int`、`numeric(p,s)` → `numeric(p,s)`、`date` → `date`
- UNIQUE：`source_customer_no`（inline `CONSTRAINT UNIQUE`，MSSQL 實作為 unique index，對齊 PG `customer_core_source_customer_no_key`）
- PK：`customer_id`
- 無 FK（PG 端 customer_core 亦僅 pkey + unique，無外鍵）
- 字串欄位 collation 一律繼承 DB 層級 `Chinese_Taiwan_Stroke_BIN`（無逐欄 COLLATE）
- 未觸犯任何 P1b2 靜態守門：無 `gen_random_uuid`/`NOW()`/`::`/`SERIAL`/`RETURNING`/`COLLATE`/`sp_executesql`/filtered index（相關字樣已從註解移除）

## Parity 例外處理（🔴 核心）
- customer_core 為 **migration-only 表**：Path B（baseline migration → dbo）建之、Path A（synchronize → p1b2_sync，無 entity）不建。若納入 parity 會使兩軌表集合不相等，破壞 **I-MSSQL-BASELINE-PARITY-01** 而誤報。
- 處理方式**比照既有 queue_job 之精神**（同為刻意只存在於某一軌的表）：加入 dbo 讀取端的 `EXCLUDED_TABLES` / `dboBusinessTableCount()` 排除清單，使 parity 讀取端看不到 customer_core → 兩軌仍相等（36 = 36），不誤報。
- customer_core 之**物理存在與結構正確性**改由 P1b2 新增之 CUSTOMER-CORE 群組**獨立正向驗證**，並以 CC-006/CC-007 明確閉環證明「物理存在於 dbo，但自 parity 讀取端被排除」與「synchronize 路徑不建」。

## 測試結果（真 mssql 實測，cdmp-mssql 容器 localhost:1433 / CDMP_TEST）
| Scenario | 說明 | 結果 |
|----------|------|------|
| TS-MSSQL-P4-0-CC-001 | migration:run 後 `OBJECT_ID('dbo.customer_core')` 非 NULL | PASS |
| TS-MSSQL-P4-0-CC-002 | dbo.customer_core 欄位數 = 92 | PASS |
| TS-MSSQL-P4-0-CC-003 | 關鍵欄位型別（uniqueidentifier/varchar(N)/char(1)/smallint/int/numeric(8,2)/datetime2/date）符合 | PASS |
| TS-MSSQL-P4-0-CC-004 | NOT NULL 約束對齊（7 必填 NO、其餘 YES） | PASS |
| TS-MSSQL-P4-0-CC-005 | PK = customer_id、UNIQUE 索引 = source_customer_no | PASS |
| TS-MSSQL-P4-0-CC-006 | synchronize 路徑（p1b2_sync）不建 customer_core（migration-only 證明） | PASS |
| TS-MSSQL-P4-0-CC-007 | 物理存在於 dbo，但自 parity 讀取端排除（白名單例外閉環） | PASS |
| TS-MSSQL-P4-0-CC-008 | 靜態守門：migration 源碼含 customer_core CREATE + NEWID/getdate + UNIQUE + 對稱 DROP | PASS |

實跑摘要（皆對真 mssql）：
- `mssql-p1b2.mssql.spec.ts`：**43 passed / 43**（含新增 8 案 + 既有 PARITY 全綠 → I-MSSQL-BASELINE-PARITY-01 維持；STATIC-004 revert 逐一逆轉三支 baseline 後 dbo 乾淨）
- `mssql-p1b3.mssql.spec.ts`：**50 passed / 50**（ALIAS-001「migration:run → dbo 業務表 = 36」不因 customer_core 誤增）
- `mssql-p1b1.mssql.spec.ts`：**39 passed / 39**（synchronize 路徑無 entity → 天生不受影響）
- `ad-e07-40-p2a.mssql.spec.ts`：**59 passed / 59**（含 REG-004 靜態守門）
- `stage1-customer-core-clause.spec.ts`（sqlite）：**21 passed / 21**（無 sqlite 回歸）
- `npx tsc --noEmit -p tsconfig.build.json`：**exit 0**（乾淨）

## 過程偏差 / 修正
1. 初版 migration 註解含字面 `gen_random_uuid()` 與 `now()` → 觸發 P1b2 STATIC-002（源碼禁 PG 專屬語法字樣）。改以「PG 隨機 uuid 預設值→NEWID()／PG 當下時戳預設值→getdate()」描述，移除字面 token。
2. 初版 migration 註解含字面 `queue_job` → 觸發 P2a REG-004（非 spec 業務碼引用 queue_job 白名單僅 3 檔）。改以「比照 P2a 佇列基礎建設表之精神」描述，移除字面 token。
   （兩者皆為註解措辭問題，非 DDL / 邏輯缺陷；spec 檔本身含 queue_job 字樣不受 REG-004 影響，因其排除 `.spec.ts`。）

## 架構決策
- 採「inline UNIQUE 約束」而非獨立 `CREATE UNIQUE INDEX`：對齊既有 baseline 對 email/token 之 UNIQUE 慣例，且忠實對映 PG 之 UNIQUE constraint；MSSQL 實作仍為 unique index（CC-005 驗證）。down 為單純 `DROP TABLE`（約束隨表移除）。
- customer_core 加入既有 schema migration（1751884800000）而非新建 migration 檔：故 typeorm_migrations 仍恰 3 筆（P1b2 BASELINE-003 / P1b3 ALIAS-001 不受影響）。

## Blocking Issues
- 無。
