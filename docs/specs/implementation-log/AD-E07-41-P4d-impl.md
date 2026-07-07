---
type: implementation-log
feature_id: AD-E07-41-P4d
feature_name: MSSQL 全面遷移 P4d — customer_core 56 節點端對端（真實 DAG 執行 + tie-breaker 業務級偵測 + PG EQ degradable，P4 收官驗證）
status: complete
last_updated: 2026-07-08
---

# AD-E07-41 P4d — customer_core 56 節點端對端 實作紀錄

## 範圍

P4a/b/c 已落地全 9 個 `*-handler-mssql.ts` 之單元/整合測試（各 handler 內部 SQL 方言正確性）。P4d **不重測任一 handler 內部 SQL**，專注於「全部 9 個 handler 首次於真實、未簡化的 56 節點 DAG 中透過真實 `NodeDispatcher`＋`PipelineRunner.run()` 依序協同執行」是否成立，以及 customer_core 端對端落地結果之正確性 / tie-breaker 決定性 / 冪等 / `##` 全清。**只加測試 + fixture，未改任何 handler production 碼**（AD §1.2 凍結清單四檔 `pipeline-runner.ts`/`node-dispatcher.ts`/`node-output-store.ts`/`types.ts` 本輪逐位元組不動；9 個 handler 亦未改）。**不含** bulk-load（P4e）、其他 5 條 pipeline。

## 🔴🔴 端對端結論（DoD 核心，真實 MSSQL CDMP_TEST `cdmp-mssql` 容器實跑）

**56 節點於 `DB_TYPE=mssql` 完整跑通、零錯誤完成**（非 `isTestRun`/`triggerTest` 假路徑，見下 §ISTESTRUN）：

- `nodeLogs.length === 56`，全部 `status==='completed'`，無 `failed`/`skipped`（E2E-001）。
- 9 種 handler 類型（`raw_data_extract` / `derived_field` / `lookup` / `merge` / `dedup` / `type_cast` / `field_mapping` / `conditional` / `target_load`）皆出現且皆 completed（E2E-002）。
- `##global temp` 貫穿：於 `m4` running 時取樣其上游 `##etl_tmp_fm1_<logId>` 仍存在，證明資料確實透過全域暫存表在節點間傳遞（非測試繞過）；結束後全清（E2E-003 / CLEANUP-E2E）。
- **customer_core 實際寫入 5 列**（交叉查實表列數，非僅信 `nodeLogs.outputRowCount`）：`P4DZH001`（C-ZZIP-HAPPY+中文）/`P4DZM001`（C-ZZIP-MISS）/`P4DTIE01`（C-TIE）/`P4DBOTH1`（C-BOTH）/`P4DML001`（C-MLMC-HAPPY）；`P4DNB001`（C-NULLBIZ，name 來源 NULL）正確整列排除（E2E-004 / NULLEXC-001）。
- 56 節點端對端耗時約 **2.3–2.5 秒**（觀察性，非門檻，E2E-006）。
- 真實資料事實驗證（節錄）：C-BOTH 於 `m4` FULL OUTER JOIN + `cd1` 以「較新者為準」→ ZZIP 側（UPDATE_DATE 較新）勝出、`data_source='ZZIP_BAMCUST_M+MLMCUSTOMER'`；C-MLMC-HAPPY 之 MLMC INDUID lookup 命中 `industry_desc='資訊服務業'`、`customer_type_code` 經 `df_mlmc_ctype_map` `'1'→'01'`；C-ZZIP-MISS `education_desc` 未命中為 NULL 但整列不排除、其餘 lookup 正常；中文姓名/地址逐字 round-trip。

## 🔴🔴 ISTESTRUN 陷阱處理（MUST-FIX，查證發現 4）

- **DoD 驗證一律以實際寫入模式跑**：`runPipeline` 建構 `PipelineRunnerConfig` 顯式 `isTestRun: opts.isTestRun ?? false`（預設 false，非依賴介面預設值——`PipelineRunnerConfig` 無預設）。DoD 核心群組（E2E/TIEBREAK/CHARSET/NULLEXC/LOOKUP/IDEMPOTENT/CLEANUP/DISPATCH）全數 `isTestRun=false`（STATIC-003 / ISTESTRUN-001 靜態掃描：全檔 `isTestRun: true` 僅出現 1 次，且位於 ISTESTRUN-002 陷阱脈絡）。
- **交叉驗證**：所有列數斷言皆直接 `SELECT COUNT(*) FROM customer_core`，非只信 `nodeLogs.outputRowCount`（E2E-004/007）。
- **陷阱佐證（ISTESTRUN-002）**：以 `isTestRun=true` 跑同一 pipeline → `nodeLogs` 全綠（含 `tl1`，`outputRowCount>0` 看似正常），但 `customer_core` 對應本次 fixture **查無任何列**（實測 count=0）。直接證明「僅信 nodeLogs 不足以驗 DoD」，故 E2E-004 必須直查實表。
- ISTESTRUN-003（跨 dialect 契約回歸）：PG 與 MSSQL 兩版 `target-load-handler` 皆有 `if (context.isTestRun)` 早退。

## 🔴🔴 tie-breaker 業務級偵測（PG vs MSSQL）

- **MSSQL 端硬斷言（TIEBREAK-001/002）**：C-TIE fixture（`e1` 內 2 筆列，`CUSTO_NO=P4DTIE01`、`UPDATE_DATE` 完全相同、`CUS_NAME` 分別為 `王一`/`王二`）於全 56 節點 DAG 端對端後 `customer_core` **恰一列**（觸發 `d1` 之 `_seq IDENTITY` tie-breaker）；連跑 3 次（各自獨立 `logId`）皆恰一列且勝出列內容一致（決定性勝出者 `王一` ＝首寫入序 `_seq` 最小），證明 `_seq` 於全 DAG 情境下仍決定性（非查詢計畫隨每次執行變動）。
- **NULLS LAST（TIEBREAK-005）**：C-TIE 其一列 `UPDATE_DATE` 設 NULL → 非 NULL 者（`王一`）決定性勝出，§4.2 於全 DAG 落地。
- **跨引擎（PG vs MSSQL）比對（TIEBREAK-003）＝DEFERRED（degradable，非失敗）**：依 §0.5 政策 + P4a RESOLVE-002 先例，PG 對照側 `postgres-test`（5433）本機**實測不可達**（`docker-compose.test.yml` 之 `postgres-test` 未起；唯一可達 PG 為 dev DB 5432，政策明令不可注入測試列污染 dev）。故 §五 TIEBREAK-003（跨引擎勝出列比對）與 §六 EQ-PG 全組 `describe.skip` + 明確 `SKIP_REASON`，**不構成 P4d DoD 未達成**（§三 MSSQL-only E2E 為唯一硬性 DoD）。
  - **待回報使用者**：AD §4.3 明載 `_seq`（MSSQL）與 `ctid`（PG）皆為「無業務含義之隱性排序」，保證決定性選出恰一列、非保證選出同一實體列。本輪因 5433 不可達，**跨引擎勝出列是否為同一實體列尚未實測比對**；若日後 5433 可用，EQ-PG 群組（已實作、gated）可直接執行揭露。目前無「觀察到分支 B（不一致）」之事實可回報（未跑），僅記錄此比對為 DEFERRED。

## 🔴 FINDING-P4D-01（業務級跨引擎差異，需回報使用者）

**現象**：`monthly_income_code`（customer_core `varchar(5)`）之來源鏈為 `MONTH_INCOME`（ZZIP 原始碼）→ `tc_zzip` type_cast `VARCHAR→DECIMAL` → `fm1` 映射 → `tl1` UPSERT。P4a 之 `toMssqlType('DECIMAL')` 固定回 `DECIMAL(38,10)`（為對齊 PG 無界 NUMERIC 之小數保留）。**若 `MONTH_INCOME` 為數字碼（真實 legacy 所得級距碼為數字）**，`TRY_CAST('3' AS DECIMAL(38,10))` = `3.0000000000`（強制 10 位小數），隱式轉 `varchar(5)` 時 MSSQL 拋 `Arithmetic overflow error converting numeric to data type varchar.` → `tl1` 節點失敗 → 整條 pipeline 失敗。

**真實 MSSQL 實測佐證**（FINDING-P4D-01 測試）：將 fixture `MONTH_INCOME` 改為數字 `'3'` 後端對端，`tl1.status==='failed'`、錯誤訊息含 `overflow`。

**PG 不受影響**：PG `CAST('3' AS NUMERIC)` 保留輸入 scale（→`3`，非 `3.0000000000`），轉 `varchar(5)` 為 `'3'` 不溢位。故此為 **P4a `DECIMAL(38,10)` 選型於「type_cast 產物流入短 varchar 目標欄」情境下之 MSSQL 專屬溢位**——正是 P4d 端對端整合（type_cast→field_mapping→target_load 組合）才會暴露、而 P4a/P4c 孤立單元測試（各自不組合到 `varchar(5)` 目標）無法發現的缺陷。

**影響評估**：`customer_core.monthly_income_code` 為 legacy 系統所得級距碼（數字）。**MSSQL 正式遷移時，任何具數字 `MONTH_INCOME` 之客戶皆會使 customer_core ETL 失敗**——屬需在 P4 收官前解決之潛在封鎖級議題（非本輪 e2e fixture 造假掩蓋）。

**本輪處置（不修 handler，勿擴大重寫）**：P4d fixture 之 `MONTH_INCOME` 採**非數字碼 `'B3'`**（income lookup 仍命中 `monthly_income_desc='中所得'`；type_cast 對非數字回 NULL → `monthly_income_code` 為 NULL、規避溢位；PG 對 `'B3'` 亦回 NULL，EQ 一致）。此使端對端機制得以完整驗證，同時以 FINDING-P4D-01 專案測試鎖定並回報缺陷。**建議修法方向（交使用者/system-architect 裁定，非本輪實作）**：type_cast `DECIMAL` 目標型別依目標欄實際寬度/scale 推導，或於 target-load 對「decimal→短 varchar」顯式 `CAST(... AS varchar)` 前先去除無意義尾零 / 依目標欄寬度轉型。

## Architectural Decisions

### GATE-001 — 14 張 raw fixture 表欄位清單衍生方法（決策記錄）

**程式化掃描** `etl-pipelines.json`「ETL for Customer Core」定義（`_p4d-fixtures.ts::deriveExtractSchemas`）：以 reachability 從 `e1/e2`（ZZIP）與 `e3/e4/e5`（MLMC）出發、於 `m4`（最終合併）之前停止，逐節點收集來源欄位聯集——`lookup.matchColumn`（主表側）、`dedup.keyColumns`+`timestampColumn`、`type_cast.castRules[].column`、`derived_field.expression` 之全大寫 token、`field_mapping.mappings[].sourceColumn` 之全大寫者、`merge.conditions[].leftColumn/rightColumn`。**全大寫 = legacy 來源欄**（建於 raw 表）；**小寫 = 下游節點產生欄**（lookup outputAlias / derived outputColumn / merge `_left`/`_right` 衍生欄，不建於 raw）。實測 ZZIP 54 欄、MLMC 40 欄。lookup 對照表 schema 為已知固定 4 種（BAMCODE_D=`{TBL_ID,TBL_CD,TBL_DESC1}` / BAMPOST_M=`{POSTAL_NO,POSTAL_ADD}` / MLMCODE=`{SYSCD,DATAID,MCODE,MNAME1}` / MLSTDINDUMF=`{INDUID,INDUNM}`），直接硬編。此法保證即使 pipeline 定義變更，raw 表恆含被引用欄（避免「缺欄 → lookup/dedup/type_cast/derived 節點靜默取 NULL 或拋錯」腐蝕端對端可信度）。

### GATE-003 — lookup fixture 值域覆蓋（決策記錄）

31 個 lookup 節點依 `lookupSource` 分屬 9 張對照表；fixture 於各對照表塞入涵蓋 §八 LOOKUPHIT 基準客戶（C-ZZIP-HAPPY / C-MLMC-HAPPY）全部 `matchColumn` 值 × 對應 `lookupFilter`（`TBL_ID`/`TRIM(SYSCD)`+`TRIM(DATAID)`）之有效配對：

| lookup 群 | 對照表 | fixture 覆蓋（TBL_CD/MCODE → desc） |
|---|---|---|
| ZZIP edu/occ/job/marry/ctype/incsrc/indus/joblv/income | raw_e5a2345c / raw_6fce5258 | `A2:E1→高中`/`A4:V1→工程師`/`A5:J1→經理`/`33:1→已婚`/`55:01→個人`/`Y0:S1→薪資所得`/`AA:I1→製造業`/`A6:L1→中級主管`/`A3:B3→中所得` |
| ZZIP 郵遞 hcity/ccity/cocity | raw_b4a48f10 | `POSTAL_NO 100→台北市中正區` |
| MLMC ctype/emp/listed | raw_8b80671e/9dd0eca5/9dcaf414 | `CF/CU/1→個人戶`、`CF/BM/E1→1-10人`、`CF/03/L1→未上市` |
| MLMC indus | raw_b9558d10/3acd58e7/afe6a874 | `INDUID IND1→資訊服務業` |

C-ZZIP-MISS（C-ZZIP-HAPPY 之對照）以 `EDUCAT_BACK='E9'`（不在對照表值域）觸發單欄未命中 → `education_desc` NULL、整列不排除。實測 LOOKUPHIT-001（ZH 8 個 desc 欄皆非 NULL）與 LOOKUPMISS-001（ZM `education_desc` NULL、其餘正常）形成有意義對比。

### DISPATCHE2E-GATE-001 — 方案甲/乙分工（決策記錄）

- **DoD 核心＝方案乙**（§0.2 建議）：手動 `new NodeDispatcher()` + register 9 個 `*HandlerMssql`（與 `createDispatcher()` mssql 分支完全一致的 handler 集合）+ `PipelineRunner.run(definition, config, realQueryRunner, onLogUpdate)`，`definition` 直接讀自 `etl-pipelines.json`。可精確控制 `isTestRun=false`、無 `EtlPipeline*` entity 依賴、執行快穩。
- **方案甲補充（DISPATCHE2E-001）＝以真實生產碼 `createDispatcher()` 為準之精簡版**：實例化真實 `EtlPipelineExecutionService`（repos 傳 null——`createDispatcher` 僅用 `configService`；`ConfigService` stub 回 `DB_TYPE='mssql'`），呼叫其 `createDispatcher()` 取得 dispatcher，再以真實 `PipelineRunner` 跑同一 56 節點 DAG，斷言 56 節點全 completed + customer_core 有列（間接證明 `isTestRun` 未被誤設 true）。**與測試設計原述方案甲（`triggerExecute` + `EtlPipelineLog` 輪詢）之偏差理由**：CDMP_TEST 實測**無** `etl_pipelines`/`etl_pipeline_logs`/`etl_pipeline_versions` base table（僅 customer_core/ob_calendar/ob_arreturndf_min_cap/users 等 7 張，比照 DEV-P4C-TABLES 事實），`triggerExecute` 全路徑需另建 3 張 etl_pipeline* 表 fixture；本輪改以「直接呼叫真實 `createDispatcher()` 生產方法」達成同一驗證目的（真實 DB_TYPE 分支接線 + 9 mssql handler 跑通真實 DAG），避免不必要之 entity fixture。DISPATCH-001 接線邏輯本身已於 P4c 獨立守門。

### 其他實作選擇

- **fixture 客戶置於分支最左 extract**：`merge` 為 FULL OUTER JOIN 且以左側為 canonical（右側同名欄轉 `_left`/`_right` 後由 `fm1`/`fm2` `dropUnmapped` 丟棄；`cd1` 之 NULL-safety guard 使 `m4` 右側-only 列仍能取回 name/customer_type_code）。故存活客戶置於 `e1`（ZZIP 最左）/`e3`（MLMC 最左）以保證產生有效列；`e2`/`e4`/`e5` 以「與最左相同 key 之碰撞列」驅動其 extract+lookup+merge-右側（真實資料覆蓋），不新增幽靈客戶、不干擾列數。此為真實 pipeline 之既有語意（PG≡MSSQL），非本輪引入。
- **短 varchar 目標欄之碼寬對齊**：`marital_status_code` 為 `varchar(1)` → fixture `CMARRY_MK` 用 1 碼 `'1'`（原 2 碼 `'M1'` 會於 tl1 觸發 `String or binary data would be truncated`）。其餘碼寬（education_code varchar(2)、occupation_code varchar(4) 等）已核對 fixture 值不溢位。
- **customer_core / datasources / extraction_tasks 前置存在性**：customer_core 複用 P4c `ensureTargetTable`（baseline DDL）；`datasources`/`extraction_tasks` 依 GATE-002 僅建**存在性**（最小欄位、不塞資料，走 `resolveRawTable` 空表 fallback 路徑——動態解析成功路徑已由 P4a/P4b handler 單元層驗證，不在本文件重複）。
- **隔離與清理**：fixture 客戶代號一律前綴 `P4D`（source_customer_no 8 碼 >= 5 過 ghost gate）；`afterAll` DROP 14 張 raw 表 + `DELETE FROM customer_core WHERE source_customer_no LIKE 'P4D%'`（不 TRUNCATE，該表 P4c 共用）。破壞性案例（ISTESTRUN-002 / TIEBREAK-005 / E2E-005 / FINDING-P4D-01）各自 `restoreMainState()`（重建 fixture + 重跑）自癒，置於檔案最後之 describe。

## 偏差（deviation）

- **EQ-PG（§六）與 TIEBREAK-CROSSDB（TIEBREAK-003）整組 DEFERRED（degradable）**：`postgres-test`(5433) 本機不可達（實測 down；dev 5432 up 但政策不可寫）。依 §0.5 政策 `describe.skip` + `SKIP_REASON`，不回退 5432。EQ-PG 群組已實作 gating + 自我驗證（EQPG-006 確認 gating 機制本身運作、非假裝通過），待 5433 可用即可執行。**此非 DoD 未達成**（AD §9 P4d「與 PG 逐欄逐列比對」之執行前提為 PG 可達；MSSQL-only E2E 為唯一硬性 DoD，已達成）。
- **節點數 56（非 AD/任務書所述 53）**：實測 nodeType 分佈 `{raw_data_extract:5, derived_field:7, lookup:31, merge:4, dedup:3, type_cast:2, field_mapping:2, conditional:1, target_load:1}`＝56 節點、55 邊。本輪以真實 56 為準（STATIC-001 鎖定），提醒未來 AD 修訂同步（非阻擋）。

## Files Changed

| File Path | Change | 說明 |
|-----------|--------|------|
| `src/modules/etl/engine/__tests__/_p4d-fixtures.ts` | new | fixture 建構 helper（程式化衍生 raw 欄位 GATE-001 + 14 raw 表 idempotent 建構 + 代表性資料 + datasources/extraction_tasks 存在性 + customer_core P4D 列清理）。非 spec |
| `src/modules/etl/engine/__tests__/p4d-e2e.mssql.spec.ts` | new | 真實 MSSQL 端對端（方案乙）：GATE-002/004、E2E-RUN-001..007、LOOKUPHIT/MISS、CHARSET、NULLEXC、TIEBREAK、IDEMPOTENT、CLEANUP-E2E、DISPATCH-E2E、ISTESTRUN-002、E2E-005、TIEBREAK-005、FINDING-P4D-01 |
| `src/modules/etl/engine/__tests__/p4d-static.mssql.spec.ts` | new | 非 gated（CI 恆跑）：STATIC-001..004、ISTESTRUN-001/003、REG-002、決策關卡 impl log 文件守門 |
| `src/modules/etl/engine/__tests__/p4d-eqpg.mssql.spec.ts` | new | §六 EQ-PG degradable（5433 不可達 → 全組 skip-with-reason + EQPG-006 meta 自我驗證） |
| `docs/specs/implementation-log/AD-E07-41-P4d-impl.md` | new | 本檔 |

**未修改任何既有追蹤檔**（含 AD §1.2 凍結四檔、9 個 handler、`etl-pipeline-execution.service.ts`、P4a/b/c 產出）——P4d 純加測試 + fixture + impl log。

## Test Results Summary（實跑，2026-07-08，CDMP_TEST `cdmp-mssql` 容器）

| 群組 | 檔案 | 結果 |
|------|------|------|
| GATE-002/004、E2E-RUN-001..007、LOOKUPHIT-001/LOOKUPMISS-001/002、CHARSET-001..003、NULLEXC-001..003、TIEBREAK-001/002/004、IDEMPOTENT-001..003、CLEANUP-E2E-001/003、DISPATCHE2E-001、ISTESTRUN-002、TIEBREAK-005、E2E-005（含 CLEANUP-E2E-002）、FINDING-P4D-01 | `p4d-e2e.mssql.spec.ts` | **PASS（30，真實 MSSQL 實跑）** |
| STATIC-001..004、ISTESTRUN-001/003、REG-002、GATE-001/003/DISPATCHE2E-GATE-001/FINDING 文件守門 | `p4d-static.mssql.spec.ts` | PASS（CI 恆跑，不需 MSSQL） |
| EQ-PG（EQPG-001..006 / TIEBREAK-003 跨引擎） | `p4d-eqpg.mssql.spec.ts` | SKIP（5433 不可達，degradable，非失敗；EQPG-006 gating 自我驗證 PASS） |

### DoD / 回歸

- **REG-001（DoD 紅線）** `npx tsc --noEmit -p tsconfig.build.json` 乾淨。
- **REG-002** PG 原檔 dedup/target-load 未 mssql 化（靜態守門綠）。
- **REG-003** P4a/P4b/P4c 全套件不回歸；PG `engine-node-executors.spec.ts` 不回歸（PG 路徑不變）。
- **REG-005** PG 56 節點 pipeline 於 PG dispatcher 之黑箱契約不變（本輪零修改 handler / 凍結四檔）。
- 既有 10 項技術債（target-table-schemas / fn_calc customer_core drift）與本切片無關、未擴大。

### 需回報使用者之重點

1. **FINDING-P4D-01（潛在封鎖級）**：`DECIMAL(38,10)` type_cast 產物流入 `varchar(5)` 之 `monthly_income_code` 於 MSSQL 溢位（PG 不受影響）；數字型 `MONTH_INCOME` 之客戶會使 customer_core ETL 失敗。需在 MSSQL 正式遷移前由 system-architect 裁定修法（type_cast 目標型別依欄寬推導 / target-load 顯式轉型去尾零）。
2. **tie-breaker 跨引擎（PG vs MSSQL）勝出列一致性 DEFERRED**：5433 不可達，尚未實測比對；AD §4.3 已明載兩引擎僅保證決定性選出恰一列、非同一實體列。待 5433 可用執行 EQ-PG 群組揭露。
