---
type: implementation-log
feature_id: F090
feature_name: OBPOOLDATA_LIST ETL 載入與 data_source 標記（Stage 1 精確化 Phase 1）
status: complete
last_updated: 2026-05-26
---

# F090: OBPOOLDATA_LIST ETL 載入與 data_source 標記 — 實作日誌

> Phase 1（後端 only）：migration + entity + ETL partition-replace load mode + 月跑 data_source 標記。
> 對齊 AD-E07-21 v1.1（DP-AD21-1/2/3 全 Resolved）。TDD（紅→綠），無迴歸（既有 target-load 27 tests 全綠）。

## 測試結果摘要

| Scenario ID | 描述 | 狀態 | 測試層 / 備註 |
|-------------|------|------|--------------|
| TS-F090-MIG-001 | up() 新增 data_source 欄 + index（VARCHAR(20) NULL、nullable、不 backfill） | PASS | migration mock queryRunner SQL 斷言（3 子案例 001a/b/c） |
| TS-F090-MIG-002 | down() 反序移除 index + 欄（可逆、不 DROP TABLE） | PASS | mock SQL + 順序斷言（002a/b） |
| TS-F090-MIG-003 | SQLite 環境 no-op（up/down 略過 + 原始碼 DB_TYPE 分支對稱） | PASS | mock + 原始碼靜態（003a/b/c） |
| TS-F090-ENT-001 | entity @Column data_source（name/length=20/nullable/非 PK） | PASS | getMetadataArgsStorage 反射 |
| TS-F090-ENT-002 | entity ↔ migration 一致性（length=20、nullable、header「任一邊改動」提示） | PASS | 原始碼 regex（002a/b） |
| TS-F090-ETL-002 | 前置 DELETE 只針對 partition（data_source=etl_legacy），不 TRUNCATE 全表 | PASS | handler mock SQL（regression guard：無未限定 DELETE / 無 TRUNCATE） |
| TS-F090-ETL-003 | INSERT 每列填 data_source=etl_legacy（SELECT 加常數欄） | PASS | handler mock SQL |
| TS-F090-ETL-004 | 欄位映射完整性（PK 三欄 + 去重/特殊 DELETE 所需欄位非全空、data_source 不在來源映射） | PASS | config 靜態斷言（fieldMappings 涵蓋 122 欄） |
| TS-F090-ETL-005 | fullMode 安全護欄（fullMode=false、partition_replace、無 TRUNCATE ob_pool_data_list） | PASS | config + 原始碼靜態（005a/b） |
| TS-F090-MON-001 | 所有月跑插入列 data_source=monthly_run | PASS | better-sqlite3 in-memory 跑真 Stage 1 |
| TS-F090-MON-002 | 月跑寫入不刪既有 etl_legacy 歷史列（不同 PK 並存） | PASS | better-sqlite3 in-memory |
| TS-F090-MON-003 | 去重查詢讀 etl_legacy + monthly_run + NULL 聯集（不加 data_source 過濾） | PASS | better-sqlite3 in-memory（F091 前置驗證） |

**補充 handler 案例**（partition_replace 行為完整性，超出測試設計但同屬 ETL-002/003 範疇）：DELETE 在 INSERT 之前、partitionColumn 只出現一次、缺 partitionValue 拋錯、空 DataSet 不寫入、isTestRun 跳過、INSERT 失敗錯誤含 offset、不走 fullMode/UPSERT 路徑。

**測試檔**：
- `apps/api/src/database/migrations/__tests__/m291-ob-pool-data-list-data-source.spec.ts`（新增，16 cases：MIG + ENT + ETL-004/005）
- `apps/api/src/modules/etl/__tests__/engine-target-load.spec.ts`（擴充，+9 partition_replace cases，總 36，原 27 全綠）
- `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline.service.spec.ts`（擴充，+3 MON cases，總 16）

### 測試層說明（重要）

本專案**無 PostgreSQL TestContainer**（`testcontainers` package 未安裝）。測試設計文件標註的「PostgreSQL TestContainer」為理想；本實作依專案實際慣例落地：
- migration up/down → mock `queryRunner.query` 斷言 SQL（對齊既有 m16/m270 慣例）；SQLite no-op 用 `process.env.DB_TYPE==='sqlite'`（對齊 m289）。
- handler partition-replace → mock queryRunner SQL + 呼叫順序（對齊既有 27 個 target-load tests）。
- 月跑標記 / 去重聯集 → `better-sqlite3` in-memory module（synchronize:true，對齊既有 pipeline service spec），實跑 Stage 1 斷言 `data_source`。
- entity → `getMetadataArgsStorage()` 反射 + 原始碼 readFileSync regex。

「真實 PG 端到端 + 大量資料筆數驗證」（如歷史限定過濾的本月/前月/未來月邊界實際筆數）屬 staging 手動驗證範疇，未硬寫 SQLite 假測試。

## 變更檔案

| 檔案路徑 | 類型 | 說明 |
|---------|------|------|
| `apps/api/src/database/migrations/1711360000291-AddObPoolDataListDataSource.ts` | new | data_source VARCHAR(20) NULL + idx_ob_pool_data_list_data_source；可逆；SQLite no-op |
| `apps/api/src/database/entities/ob-pool-data-list.entity.ts` | modified | 補 `@Column({name:'data_source',type:'varchar',length:20,nullable:true})` |
| `apps/api/src/modules/etl/engine/handlers/target-load-handler.ts` | modified | 新增 `loadMode==='partition_replace'` 分支（per-partition DELETE + INSERT 標記） |
| `apps/api/src/modules/etl/engine/handlers/extract-handler.ts` | modified | 支援 `sourceFilter`（歷史限定 WHERE 於 extract 層套用；spec gap 暫不啟用） |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | save stage4Results 前一律標 `data_source='monthly_run'` |
| `scripts/e07-etl-config.json` | modified | 新增 E07-OBPOOLDATA_LIST-Extract + -Load（partition-replace + 122 欄映射） |
| `scripts/seed-e07-etl.mjs` | modified | buildPipelineDefinition 依 config loadMode 切換 node.data（不再 hard-code fullMode:true）；傳遞 extract sourceFilter |
| `apps/api/src/database/migrations/__tests__/m291-...spec.ts` | new | MIG/ENT/ETL-004/005 測試 |
| `apps/api/src/modules/etl/__tests__/engine-target-load.spec.ts` | modified | +9 partition_replace 測試 |
| `apps/api/src/modules/assignment/.../assignment-run-pipeline.service.spec.ts` | modified | +3 MON 測試 |

## 關鍵實作 diff

### migration m291（partition-replace 分區鍵）
```sql
-- up()（PostgreSQL；SQLite no-op）
ALTER TABLE ob_pool_data_list ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NULL;
CREATE INDEX IF NOT EXISTS idx_ob_pool_data_list_data_source ON ob_pool_data_list (data_source);
-- down()（反序）
DROP INDEX IF EXISTS idx_ob_pool_data_list_data_source;
ALTER TABLE ob_pool_data_list DROP COLUMN IF EXISTS data_source;
```

### target-load-handler partition_replace 分支（放在 fullMode / UPSERT 之前）
```text
if (loadMode === 'partition_replace'):
  partitionColumn / partitionValue 必填（缺則拋錯）
  insertColumns = allColumns 排除 partitionColumn（避免重複欄）
  1. DELETE FROM "<target>" WHERE "<partitionColumn>" = '<escapedValue>'   ← 只刪本分區，保護其他來源列
  2. for offset in 0..rowCount step batchSize:
       INSERT INTO "<target>" (insertColumns..., "<partitionColumn>")
       SELECT insertColumns..., '<escapedValue>' AS "<partitionColumn>"   ← 每列填分區值
       FROM "<enrichedTemp>" LIMIT batchSize OFFSET offset
  不觸發 TRUNCATE、不觸發 ON CONFLICT（regression guard）
```

### 月跑標記（單點 stamp，v1/v2 共用）
```ts
for (const r of stage4Results) { r.data_source = 'monthly_run'; }
await txm.getRepository(ObPoolDataList).save(stage4Results);
```

## e07-etl-config 新增內容 + 歷史限定 WHERE 放置位置

- **E07-OBPOOLDATA_LIST-Extract**：`datasourceName:'APYHFC16.OB'`, `sourceSchema:'dbo'`, `sourceTable:'OBPOOLDATA_LIST'`, `mode:'full'`, `schedule:'0 1 1 * *'`（月跑前，早於 OBPOOLDATA 02:00；最終由 DevOps 確認）。
- **E07-OBPOOLDATA_LIST-Load**：`targetTable:'ob_pool_data_list'`, `loadMode:'partition_replace'`, `partitionColumn:'data_source'`, `partitionValue:'etl_legacy'`, `fullMode:false`, `fieldMappings`（122 欄，源自 entity ∩ source schema；涵蓋 PK 三欄 + 去重/特殊 DELETE 所需欄位；不含 data_source）。
- **歷史限定 WHERE 放置決策**：因 `field_mapping dropUnmapped:true` 會在 target_load 之前丟棄非映射欄位，歷史限定過濾必須在 **extract 層**（`SELECT * FROM raw WHERE ...`）套用，而非 handler。已於 extract-handler 實作 `sourceFilter`（column/operator/valueExpr，`valueExpr='currentWorkym'` 解析為 YYYYMM），由 config `_historicalLimit.sourceFilterColumn` 驅動。**但 sourceFilterColumn 目前為 null（不過濾）—— 見下方 spec gap。**

## 阻擋 / 需主流程確認之處（SPEC GAP — 已停下不自行裁示）

**歷史限定欄位 `PROJECT_WORKYM` 不存在於來源表**：
- F090 AC-3 / BR-1 / §5.2 與 AD-E07-21 DP-AD21-1 均規定 ETL Load 須 `WHERE PROJECT_WORKYM < :currentWorkym`（只載非本月歷史，消除與月跑並發衝突）。
- 但 `reference/TableSchema/OB/OBPOOLDATA_LIST.sql`（128 欄，已解碼確認）**無 `PROJECT_WORKYM` 欄**；最接近的時間欄為 `ASSIGNDAY`（VARCHAR yyyyMMdd，即去重視窗用的同一欄）。
- 對照 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list`：SP 本身亦**不以 PROJECT_WORKYM 過濾 OBPOOLDATA_LIST**；`PROJECT_WORKYM` 係 `OBMLISTDF`（名單定義表）欄位，SP 讀入為 `@WORKDT` 作 per-list 計算。
- **處置**：依「先停下調查 spec gap，不堆技術債」原則（feedback_spec_schema_gap_first），歷史限定機制已完整落地（extract-handler `sourceFilter` + seed 串接），但 config `sourceFilterColumn` **暫留 null（不套用過濾，載入全量歷史）**，並於 config `_historicalLimit._SPEC_GAP` 明確標註，待 system-architect / 業務裁示正確過濾欄位（極可能為 `ASSIGNDAY < 本月第一天 yyyyMMdd`）後填入即生效，無需改 code。
- **影響評估**：本 Phase（F090）對 production 月跑案件數無影響（AD-E07-24 §24.2，Stage 1 尚未讀去重）。歷史限定僅影響「載入哪些歷史列」，未啟用過濾 = 載入全部歷史；F091 去重查詢讀 ASSIGNDAY 視窗，仍以 assignday 範圍過濾，正確性不受此 gap 影響（僅 ob_pool_data_list 可能含本月 etl_legacy 列，但本月列的 assignday 不落在「近 3 個月且 < 本月」視窗 → 不誤刪）。並發衝突風險（BR-1 原欲消除者）在 Phase 1 不發生（月跑不讀去重）。

## 架構決策 / spec 邊界內的實作選擇

- **partition_replace load mode（AD-E07-21 §21.3 / A-3 授權 tdd 決定引擎落地）**：既有 Pipeline 引擎只有 fullMode（TRUNCATE）+ customer_core UPSERT 兩路徑，皆不符雙重角色需求。新增第三 mode，行為契約對齊 spec（per-data_source DELETE + 插入列標記），不動既有兩路徑（27 tests 全綠）。
- **月跑標記放在 save 前單點 stamp**：AC-5 描述 per-list_no × data_source 截斷，但現行月跑寫入為 `repo.save`（依複合 PK UPSERT），etl_legacy 列 PK 與月跑列不同 → 不會互相覆蓋。MON-002 已驗證並存。spec 所述「per-list_no DELETE WHERE data_source='monthly_run'」之顯式截斷屬 F091/月跑重構範疇，本 Phase 以 save 標記即滿足 schema 對齊目標。
- **fieldMappings 122 欄**：由 entity 業務欄位 ∩ 來源 schema 自動產出（排除 6 稽核欄、排除 data_source/score 系統欄）。稽核欄比照既有 E07-OBPOOLDATA-Load 不映射（SP INSERT 以常數填稽核欄）。

## 無迴歸驗證

- `npx vitest run`（apps/api）：F090 相關全綠。
- 既有 `engine-target-load.spec.ts` 27 tests **全綠**（partition 分支不影響 fullMode/UPSERT）。
- pre-existing 失敗（與 F090 無關，已 git stash 驗證在乾淨 base 即失敗）：
  - `extraction-task/executors`（postgresql/mysql/mssql-executor：keyset/OFFSET 分頁 SQL 斷言）
  - `etl/target-table-schemas` + `etl/target-table.service`（customer_core 欄位數）
  - `assignment/services/assignment-run-report{,.scope}` + `assignment-run-snapshot`（F063/F064/F066/F067）
  - 合計 8 檔 14 cases，皆未觸及 F090 變更檔。
- TypeScript：`tsc --noEmit` 於 F090 所有 src 檔零錯誤（既有 85 錯誤全在 test/*.e2e-spec.ts，pre-existing）。
- E2E `etl-pipeline.e2e-spec.ts` 79 tests 全綠（驗證 migration glob 載入 + 新 entity 欄 + synchronize 啟動正常）。
