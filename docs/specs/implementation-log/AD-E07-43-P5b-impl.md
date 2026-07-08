---
type: implementation-log
feature_id: AD-E07-43-P5b
feature_name: MSSQL 全面遷移 P5b — 其餘 5 條生產 ETL pipeline 端對端 MSSQL 驗證（獨立庫 CDMP_P5B 隔離 + ATOMIC 資料完整性 probe）
status: complete
last_updated: 2026-07-08
---

# AD-E07-43 P5b — 其餘 5 條生產 ETL pipeline 端對端 MSSQL 驗證 實作紀錄

## 範圍

P4a~P4c 交付通用 9 個 `*-handler-mssql.ts`；P4d 端對端驗證僅 customer_core 一條 pipeline。P5b 驗證**其餘 5 條生產 pipeline**（`E07-OBARRETURNDF_MIN_CAP-Load` / `E07-OBCALENDAR-Load` / `E07-OBEMPHIRE-Load` / `E07-OBPOOLDATA-Load` / `E07-OBPOOLDATA_LIST-Load`）於 `DB_TYPE=mssql` 透過真實 `NodeDispatcher` + `PipelineRunner.run()` 首次被端對端跑通，並以直接 `SELECT COUNT(*)` 交叉查實表驗證（非僅信 `nodeLogs`）。**只加測試 + fixture + impl log；未改任何 production 檔案**（`pipeline-runner.ts` / `target-load-handler-mssql.ts` / `node-dispatcher.ts` 為凍結清單，STATIC-004 守門）。**不含** P5c MONTHRUN-DIFF、bulk-load。

## 🔴🔴 端對端結論（DoD 核心，真實 MSSQL `cdmp-mssql` 容器、獨立庫 CDMP_P5B 實跑）

**5 條 pipeline 於 `DB_TYPE=mssql` 全數端對端跑通、目標表交叉查實表列數正確**（`p5b-e2e.mssql.spec.ts`：**53 測試全 PASS**，真實 MSSQL 實跑非 skip）：

| Pipeline | 目標表 | loadMode | 節點 | target COUNT(*) 交叉查 | 抽樣正確性 |
|---|---|---|---|---|---|
| `E07-OBARRETURNDF_MIN_CAP-Load` | `ob_arreturndf_min_cap` | fullMode | e1→fm1→tl1（3） | =3（唯一 appl_no） | `add_un_capital` numeric round-trip |
| `E07-OBCALENDAR-Load` | `ob_calendar` | fullMode | e1→fm1→tl1（3） | =5（唯一 calendar_date） | `calendar_date`(date PK)/`rest_flg` 0/1、閏年 2/29 |
| `E07-OBEMPHIRE-Load` | `ob_emphire` | fullMode | e1→fm1→cd1→tl1（4，含 conditional） | =4（唯一 emp_id） | 中文 emp_nm/dept_name/title_name；`resign_date` 哨兵→NULL |
| `E07-OBPOOLDATA-Load` | `ob_pool_data` | fullMode | e1→fm1→tl1（3） | =3（唯一 (orgno,appl_no) composite） | 114 欄：numeric/date/中文；NOT NULL 業務欄 |
| `E07-OBPOOLDATA_LIST-Load` | `ob_pool_data_list` | partition_replace | e1→fm1→tl1（3） | `data_source='etl_load'` =3（唯一 (list_no,orgno,appl_no)） | 122 欄；data_source stamp；score NULL |

- 全部節點 `status==='completed'`；含 emphire 唯一之 `conditional` 節點 `cd1`。
- **交叉查實表列數**（非僅信 `nodeLogs.outputRowCount`，防 `isTestRun` 假路徑）：`SELECT COUNT(*)` 直查目標表。
- ISTESTRUN 陷阱佐證（ISTESTRUN-002 fullMode / ISTESTRUN-003 partition_replace）：`isTestRun=true` → nodeLogs 全綠、`outputRowCount>0` 看似寫入，但實表零列。故 DoD 一律以 `isTestRun=false`（`runByKey` 顯式預設 false）+ 直查實表。

## 🔴 fullMode 全量替換 / partition_replace 分區替換（真實接線驗證）

- **fullMode（4 條）＝TRUNCATE + INSERT 全量替換**（FULLMODE-001）：4 張目標表各預置 2 筆與 fixture PK 不重疊之陳舊列 → 端對端跑後總列數恰等 fixture 唯一鍵數、陳舊列全消。composite PK 旗艦（FULLMODE-002）：`ob_pool_data` (orgno,appl_no) 重複列經真實 `e1→fm1→tl1` 後恰 1 列（`_seq` tie-breaker，真實欄名 orgno/appl_no 餵入 `getPrimaryKeyColumns` 仍正確辨識）；連跑 3 次勝出列 `cust_name` 一致（FULLMODE-004 決定性）；`ob_calendar` date PK 隱式轉換月初/月底/閏年 2/29 皆正確 round-trip（FULLMODE-005）。
- **partition_replace（1 條）＝DELETE WHERE data_source='etl_load' + INSERT 標記 etl_load**（PARTITION-001/002）：`data_source≠'etl_load'`（`_P5B_OTHER_`）之既存列跑後不受影響（他分區保留）；`data_source='etl_load'` 既存舊列被本次 fixture 全量取代（非疊加）。
- **partition_replace 無內部去重**（PARTITION-003，負向對照）：來源含重複 (list_no,orgno,appl_no) → INSERT 撞 PK → `tl1.status==='failed'`（既有設計、非本輪缺陷；對稱 P4c PARTITION 群組）。

## 🔴🔴 ATOMIC probe — TRUNCATE/DELETE 後 INSERT 失敗之資料完整性（report-not-fix；MUST-FIX 探測；結論：分支 A 資料遺失，需升級 system-architect）

**前提**（★發現 2、3）：`pipeline-runner.ts` 逐行查證全檔無 `startTransaction`/`commitTransaction`/`rollbackTransaction`；5 條 pipeline 皆無 `type_cast` 節點防線；fullMode/partition_replace 路徑無 NOT NULL 業務欄防呆（ghostGate 僅 UPSERT 路徑）。**本群組凍結 `target-load-handler-mssql.ts` / `pipeline-runner.ts`、不修復、僅探測既有引擎行為之實際後果**。

### 實測結論（真實 MSSQL / CDMP_P5B，`p5b-e2e.mssql.spec.ts` §六，全 PASS）

**分支 A（資料遺失）確認成立**——四種目標表形狀（單欄 PK / composite PK / 數值溢位 / partition_replace）一致：

| Probe | 情境 | 預置既存列 | tl1 失敗訊息（實測字面） | 失敗後目標表列數 |
|---|---|---|---|---|
| **ATOMIC-001** | `ob_calendar` 單欄 PK、`rest_flg` 空字串 `NULLIF(TRIM())`→NULL | 3 | `fullMode INSERT 失敗：Cannot insert the value NULL into column 'rest_flg', table 'CDMP_P5B.dbo.ob_calendar'; column does not allow nulls. INSERT fails.` | **0（3 筆既存列全數遺失）** |
| **ATOMIC-002** | `ob_pool_data` composite PK、`custo_no` 空字串→NULL | 3 | `fullMode INSERT 失敗：Cannot insert the value NULL into column 'custo_no', table 'CDMP_P5B.dbo.ob_pool_data'; column does not allow nulls. INSERT fails.` | **0（資料遺失，結論不因表結構複雜度改變）** |
| **ATOMIC-003** | `ob_arreturndf_min_cap.add_un_capital numeric(15,0)`、16 位數字串隱式轉換溢位 | 3 | `fullMode INSERT 失敗：Arithmetic overflow error converting nvarchar to data type numeric.` | **0（資料遺失；隱式轉換非 TRY_CAST，無優雅降級）** |
| **ATOMIC-004** | `ob_pool_data_list` partition_replace、來源重複 PK 撞鍵 | etl_load 3 + 他分區 1 | INSERT 撞 PK 失敗（PARTITION-003 延伸） | **etl_load 分區 0（DELETE 已提交、INSERT 整句失敗）；他分區保留 1** |

### 根因（真實 MSSQL 觀察）

- **TypeORM `QueryRunner` 無顯式 `startTransaction` → autocommit 模式**：`TRUNCATE TABLE`（fullMode）/ `DELETE WHERE partition`（partition_replace）為獨立陳述式、**先提交**；後續單一 `INSERT INTO target SELECT ...`（單句、非逐列容錯）因 NOT NULL 違反或隱式轉換溢位整句失敗、拋出後**不回滾已提交之 TRUNCATE/DELETE**。
- 目標表被留在「已清空、未重新填入」狀態 → **既存生產資料遺失**。
- **partition_replace 之他分區安全**：DELETE 僅刪 `data_source='etl_load'`，故 `_P5B_OTHER_` 分區不受影響（ATOMIC-004 other=1 佐證）；但**目標分區（etl_load）本身資料遺失**。

### 兩引擎共通（★發現 3、8）— 非 MSSQL 遷移回歸

- PG 版 `target-load-handler.ts` 逐行結構對稱（同樣 TRUNCATE+INSERT 兩段式、partition_replace 無 dedup、零交易保護）；`pipeline-runner.ts` 全檔無 transaction API（`p5b-eqpg.mssql.spec.ts` EQPG-ATOMIC-STRUCT 以 fs 佐證，離線可驗、不依賴 5433）。
- 故此為**引擎既有架構特性、兩引擎共通、非本輪 mssql 化引入之回歸**。

### 🔴🔴 升級 system-architect（潛在封鎖級）

**現象**：任何一批含「壞值（非數字進 numeric / 非日期進 date / NOT NULL 欄空值）」之來源資料，會使 fullMode（TRUNCATE 後）或 partition_replace（DELETE 後）之 INSERT 整句失敗，導致該目標表（或該分區）之既存生產資料被清空且未重建。生產月度 ETL 若遇單筆髒資料，**整張 `ob_pool_data` / `ob_calendar` 等來源表可能被清空**，直接影響下游月跑（Stage 1-4 讀空表）。

**本輪處置**：依測試設計 §六 report-not-fix 原則，**不修改凍結檔**（加交易保護屬架構層決策）。忠實記錄證據於本段，交 system-architect 裁定修法方向（建議候選，非本輪實作）：

1. target_load 之「先破壞後重建」以顯式交易包裝（`startTransaction` → TRUNCATE/DELETE + INSERT → `commit`；失敗 `rollback`），或
2. 改「先建暫存全量、驗證通過後 rename/swap」（zero-downtime 全量替換），或
3. INSERT 前對 numeric/date/NOT NULL 欄以 `TRY_CAST` + 前置驗證，將髒列導向 `skipped` 而非整批失敗。

**PG 亦適用**（同一架構）；修法應兩引擎對稱。此為 P4~P5 全系列第一次以真實 fullMode/partition_replace pipeline 端對端實際觸發並觀察此風險路徑後果之落地證據。

## 🔴 隔離方案（REG-006）— 獨立庫 CDMP_P5B（承 P5a I-MSSQL-CI-BOOTSTRAP-01）

**問題**：P5b 之 4 條 fullMode pipeline target_load 走 `TRUNCATE TABLE`，其目標表 `ob_pool_data` / `ob_pool_data_list` / `ob_emphire` / `ob_calendar` 恰與 CI `mssql-specs` lane 之 P3a/P3c/P3d 依賴之 `CDMP_TEST.dbo` 共用 baseline 表高度重疊。若 P5b 於 `CDMP_TEST.dbo` 執行 TRUNCATE，會在 `--no-file-parallelism` 序列中清空後續 P3 系列所需之共用表 → 跨 spec 干擾。

**裁定：選用獨立庫 CDMP_P5B（測試設計 §四建議選項 b，最穩健）**，比照 P5a 既有 CDMP_P1B2/P1B3/PATTERNB 隔離先例：

1. `docker/mssql-init.sql` 新增 `CDMP_P5B`（`Chinese_Taiwan_Stroke_BIN` collation + `cdmp` db_owner）——CI（跑 `docker/mssql-init.sql`）與本機 dev（`docker compose --profile mssql up mssql-init`）皆自動建庫。
2. `_p5b-fixtures.ts::connectMssqlP5b()` 覆寫 `MSSQL.database='CDMP_P5B'`（DataSource 指向 CDMP_P5B，**物理上不連 CDMP_TEST**）→ P5b 之 TRUNCATE 恆作用於 CDMP_P5B、與 CDMP_TEST.dbo 完全解耦。
3. 5 張目標表 + `datasources`/`extraction_tasks` 由 harness idempotent 自建（DDL 逐字取自 `1751884800000-MssqlBaselineSchema.ts`；`ob_pool_data`/`ob_pool_data_list` line 50/51，其餘 3 表複用 `_p4c-target-tables.ts`）→ **不需為 CDMP_P5B 跑 `migration:run`**（自建即可，比照 P4c/P4d DEV-P4C-TABLES 先例），故 `ci.yml` 無需新增步驟（CDMP_P5B 由既有 `mssql-init` step 建庫即足）。
4. **CDMP_P5B 不存在**（本機未重跑 mssql-init）→ 連線失敗 → spec 全檔 skip（不偽綠）。本輪已於本機 `cdmp-mssql` 容器以 sa 建妥 CDMP_P5B 並實跑全綠。

**回歸證據**：P5b 之 DataSource `database='CDMP_P5B'`，架構上不可能觸及 `CDMP_TEST.dbo`；CI 序列中 P3a/P3c/P3d 之 CDMP_TEST.dbo 共用 baseline 不被 P5b TRUNCATE 影響（REG-006 達成）。既有 P4a~P4d（連 CDMP_TEST）與 P3 系列不受本輪影響。

## ★發現 5 修正（測試設計事實有誤 → 以真實 etl-pipelines.json 為準）

**測試設計 ★發現 5 宣稱**：`ob_pool_data_list` 之 `score`/`tier_level`/`card_level`/`cr_id`/`cr_nm`/`is_cr`/`assignday` **7 欄皆不在** field_mapping 對映範圍內。

**逐一核對 `etl-pipelines.json`（測試設計自身宣告之唯一真實資料來源）實測**：pooldata_list `fm1.mappings` **實際映射 6 欄**——`ASSIGNDAY→assignday`(L1599)、`CARD_LEVEL→card_level`(L1614)、`TIER_LEVEL→tier_level`(L1619)、`CR_ID→cr_id`(L1629)、`CR_NM→cr_nm`(L1634)、`IS_CR→is_cr`(L1639)；**僅 `score` 未映射**（全檔無 `"targetColumn": "score"`），`data_source` 亦未映射（由 partition_replace handler stamp `partitionValue`）。

**處置**（依 source-of-truth 優先序：測試設計宣告 etl-pipelines.json 為唯一真實資料來源 → JSON 勝出，且 production 行為依 JSON）：
- 測試以真實 JSON 為準（STATIC-006 / PARTITION-004 斷言「僅 score 未映射、其餘 6 欄有映射」；E2E-pooldata_list-003 僅斷言 `data_source='etl_load'` + `score IS NULL`，不再誤斷 6 欄為 NULL）。
- **交 test-designer 修訂 ★發現 5**（將「7 欄」更正為「僅 score（+ data_source）未映射」）；非封鎖，本輪已對齊真實 pipeline 定義。

## ob_emphire resign_date 哨兵（FIELD-003 決策關卡）— EQ 忠實遷移 + 張力，交裁示

- **cd1 conditional 行為（FIELD-001/002 實測 PASS）**：來源 `RESIGN_DATE='9999-12-31'`（在職哨兵）→ 端對端後 `ob_emphire.resign_date` 確為 **NULL**（cd1 rule `when left.resign_date='9999-12-31' then NULL` 按定義正確執行）；離職員工（實際日期）保留原值（elseValue）。冪等重跑穩定（IDEMPOTENT-004）。
- **PG==MSSQL 一致性**：`p5b-eqpg.mssql.spec.ts` EQPG-003 已寫（PG 側同樣 `resign_date IS NULL`）；degradable（5433 不可達 → skip，見下）。cd1 handler 為純字串 CASE、PG/MSSQL 邏輯相同，EQ 忠實遷移（本 pipeline ETL 產出本身正確）。
- **🔴 張力（交 architect / 使用者裁示，非本切片改 production）**：與既有專案記憶 `feedback_emphire_active_resign_sentinel`（「在職＝resign_date NULL 或 >= 系統日〔哨兵 9999-12-31〕；**禁用 `IS NULL`，真實資料無 NULL**」）字面衝突——本 ETL pipeline 確實將在職員工 `resign_date` 產出為 **NULL**。若下游 `@/common/emphire/emphire-active.util` 假設「真實資料無 NULL」，可能與本 pipeline 之 MSSQL/PG 實際產出不一致。**本輪不裁定何者為準**（test-designer/tdd-implementation 職責範圍外），忠實記錄：ETL 依定義正確、兩引擎一致；資料契約落差是否需修正交 system-architect / 使用者裁定。

## Files Changed

| File Path | Change | 說明 |
|-----------|--------|------|
| `docker/mssql-init.sql` | modified | 新增 `CDMP_P5B` 資料庫（BIN collation + cdmp db_owner），比照 P5a 隔離庫先例 |
| `src/modules/etl/engine/__tests__/_p5b-fixtures.ts` | new | P5b fixture helper：connectMssqlP5b(CDMP_P5B) + 程式化衍生 raw 欄位（GATE-001）+ 5 目標表/aux idempotent 自建 + 各 pipeline fixture 資料。非 .spec |
| `src/modules/etl/engine/__tests__/p5b-e2e.mssql.spec.ts` | new | 真實 MSSQL 端對端（方案乙）：GATE/DISPATCH-E2E/E2E-RUN(5×3)/FULLMODE/PARTITION/ATOMIC probe/ISTESTRUN/FIELD/IDEMPOTENT/CLEANUP。53 測試 |
| `src/modules/etl/engine/__tests__/p5b-static.mssql.spec.ts` | new | 非 gated（CI 恆跑）：STATIC-001..006 / GATE-005 / HANDLERTYPES / PARTITION-004 / ISTESTRUN-001 / REG-002 / 決策關卡文件守門 |
| `src/modules/etl/engine/__tests__/p5b-eqpg.mssql.spec.ts` | new | §十一 EQ-PG：非 gated ATOMIC 結構等價佐證 + gated PG 實跑（degradable，需專用庫 P5B_PG_DB） |
| `docs/specs/implementation-log/AD-E07-43-P5b-impl.md` | new | 本檔 |

**未修改任何凍結 production 檔**（`pipeline-runner.ts` / `target-load-handler-mssql.ts` / `node-dispatcher.ts` / 9 handler / PG 版 handler；STATIC-004 守門綠）。`ci.yml` 未改（CDMP_P5B 由 mssql-init 建庫、harness 自建表，無需 migration:run）。

## Architectural Decisions

### GATE-001 — 114/122 欄 raw fixture 表欄位清單衍生方法（決策記錄）

**程式化掃描** `fm1.mappings[].sourceColumn`（`_p5b-fixtures.ts::deriveRawColumns`，去重）產生 raw 表欄位，不人工列舉（114/122 欄人工易遺漏、缺欄會使 field_mapping `dropUnmapped:true` 靜默丟棄）。fixture 列以「目標欄名」表達業務語意，再經 `invertMappings`（targetColumn→sourceColumn）翻譯為 source 欄插入 raw 表。

### SOURCEFILTER — pooldata_list 之 F090 歷史過濾（實作發現）

`E07-OBPOOLDATA_LIST-Load` 之 `e1` extract 具 `sourceFilter: { column:'ASSIGNDAY', operator:'<', valueExpr:'currentMonthFirstDay' }`（F090 v2.0 歷史過濾：僅納入 ASSIGNDAY < 當月月首之案件）。fixture 若不設 `assignday`，`NULL < '20260701'`→NULL→整列被濾掉（extract 0 列 → target_load `input.rowCount===0` 短路、不寫入且不 DELETE）。**修正**：pooldata_list happy/dupPk 列皆設 `assignday='20200101'`（恆 < 任何當月月首 YYYYMM01，跨月穩定）。此為真實 production pipeline 語意（非本輪引入），fixture 須尊重。

### EQ-PG — degradable + 專用庫隔離（決策記錄）

PG 側 fullMode `TRUNCATE ob_pool_data` 會污染 CI `pg-specs` lane 共用之 `cdmp_test`（與 MSSQL 側 CDMP_P5B 隔離同理）。故 PG 實跑比對僅在 **env `P5B_PG_DB`（專用庫、非 cdmp_test）已設 + 5433 可達** 時執行；否則 `ctx.skip()` + SKIP_REASON（DEFERRED，非 DoD 未達成，比照 P4d EQ-PG 先例）。另含**非 gated 結構等價**（EQPG-ATOMIC-STRUCT，fs 讀 PG handler/runner）佐證 ATOMIC 兩引擎共通、離線可驗。

## 偏差（deviation）

- **★發現 5 事實更正**（見上段）：測試設計宣稱 7 欄未映射，實際僅 score（+data_source）；測試以真實 JSON 為準、交 test-designer 修訂。
- **EQ-PG（§十一）gated 部分 DEFERRED**：本機 5433 不可達 + 無專用 PG 庫（P5B_PG_DB 未設）→ gated PG 實跑 skip（非偽綠；EQPG-006 自我驗證 gating、EQPG-ATOMIC-STRUCT 非 gated 佐證兩引擎結構等價）。待專用 PG 庫可用即可揭露逐欄比對。
- **ci.yml 未改**：CDMP_P5B 由 `mssql-init.sql` 建庫、5 表由 harness 自建，無需為 CDMP_P5B 跑 `migration:run`（比照 P4c/P4d 自建先例）；I-MSSQL-CI-BOOTSTRAP-01 之精神（隔離會 wipe 共用 dbo 之測試）已由獨立庫達成。

## Test Results Summary（實跑，2026-07-08，CDMP_P5B `cdmp-mssql` 容器）

| 群組 | 檔案 | 結果 |
|------|------|------|
| GATE-002/003/004、DISPATCH-E2E-001/002、E2E-RUN(5×3)、FULLMODE-001..005、PARTITION-001/002/003、ATOMIC-001..005、ISTESTRUN-002/003、FIELD-001..010、IDEMPOTENT-001..005、CLEANUP-001..004 | `p5b-e2e.mssql.spec.ts` | **PASS（53，真實 MSSQL 實跑）** |
| STATIC-001..006、GATE-005、HANDLERTYPES-001、PARTITION-004、ISTESTRUN-001、REG-002、GATE-001/ATOMIC-006/FIELD-003/REG-006/★發現5 文件守門 | `p5b-static.mssql.spec.ts` | **PASS（CI 恆跑，不需 MSSQL）** |
| EQPG-ATOMIC-STRUCT / EQPG-005 / EQPG-006（非 gated）；EQPG-001/002/003/004（gated 實跑） | `p5b-eqpg.mssql.spec.ts` | 非 gated PASS；gated SKIP（5433/專用庫不可達，degradable、非偽綠） |

### ATOMIC probe 最終結論（ATOMIC-006 決策關卡）

**分支 A（資料遺失）成立**——4 種目標表形狀一致：TRUNCATE/DELETE 已提交後 INSERT 因 NOT NULL 違反 / 隱式轉換溢位 / PK 撞鍵整句失敗 → 目標表（或目標分區）被清空且未重建。**標註「潛在封鎖級」，已列入待回報 system-architect / 使用者事項**（見上「升級 system-architect」段）；兩引擎共通、非 mssql 遷移回歸。

### DoD / 回歸

- **REG-001（DoD 紅線）** `npx tsc --noEmit -p tsconfig.build.json` **乾淨**。
- **REG-002** PG 版 `target-load-handler.ts` 未含 MSSQL 專屬內省（`getMssqlTempTableColumns`/`IDENTITY(INT`）——STATIC 綠。
- **REG-006（🔴 執行順序協調）** P5b 連 CDMP_P5B 獨立庫，架構上不觸 CDMP_TEST.dbo → CI 序列中 P3a/P3c/P3d 之共用 dbo baseline 不被 P5b TRUNCATE 污染。
- **postgres 路徑不變**：本輪零修改任何 handler / 凍結檔；PG 5 條 pipeline 黑箱契約不變。
- 既有技術債（target-table-schemas / ETL schema drift / web tsc）與本切片無關、未擴大。

## 需回報使用者之重點

1. **🔴🔴 ATOMIC 資料完整性（潛在封鎖級，交 system-architect）**：fullMode（TRUNCATE 後）/ partition_replace（DELETE 後）之 INSERT 遇單筆髒資料整句失敗 → 目標表/分區既存生產資料遺失（實測分支 A，4 形狀一致）。引擎既有架構、PG/MSSQL 共通、非本輪回歸；需裁定是否加交易保護 / swap 全量 / TRY_CAST 前置驗證。
2. **測試設計 ★發現 5 事實有誤**：pooldata_list field_mapping 實映射 6 個月跑欄位（僅 score/data_source 未映射）；交 test-designer 修訂（非封鎖）。
3. **ob_emphire resign_date 哨兵→NULL 張力**：ETL（PG≡MSSQL）確將在職員工 resign_date 產出 NULL，與記憶 `feedback_emphire_active_resign_sentinel`（真實資料無 NULL）張力；交 architect/使用者裁定資料契約。
4. **EQ-PG 逐欄比對 DEFERRED**：需專用 PG 庫（P5B_PG_DB）+ 5433 可達；本機不可達 → skip（非偽綠）。ATOMIC 兩引擎共通已由結構等價離線佐證。
