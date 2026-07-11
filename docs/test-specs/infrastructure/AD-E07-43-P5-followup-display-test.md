---
type: test-design-infrastructure
test-spec-id: AD-E07-43-P5-followup-display
feature_name: MSSQL 全面遷移 P5 收尾 — 顯示層兩項 follow-up（cr_nm varchar→nvarchar + appl_date 匯出 SQL 端格式化）測試設計
priority: P2-TechDebt（非阻擋 cutover；使用者裁定「兩個小 follow-up」，正確性/一致性修法，非 cutover-blocker）
related_spec:
  - /docs/specs/implementation-log/AD-E07-43-mssql-p5-ci-signoff.md（§6 不變式 I-MSSQL-NVARCHAR-DISPLAY-01；§9 P5i 裁定；§8 P5h assignday/useUTC 修法）
  - /docs/specs/implementation-log/AD-E07-43-P5i-impl.md（§「範圍決策與偏差」item 3：明文記錄 `ob_monthly_run_result.cr_nm` 為 out-of-scope follow-up，本文件為其正式解凍）
  - /docs/specs/implementation-log/AD-E07-43-P5h-impl.md（§7 AD-3、§8 Follow-up item 1：`assignment-run-report.service.ts::formatApplDate` 跨引擎 getter 殘餘風險，本文件為其正式解凍）
  - apps/api/src/common/database/column-types.ts（`nvarcharColumnType` 既有 helper，本次沿用不新建，見 line 111-112）
  - apps/api/src/database/entities/ob-monthly-run-result.entity.ts（cr_nm 現況 `type:'varchar', length:50`，line 83-84；本輪待修欄位）
  - apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts（line 55：`ob_monthly_run_result` CREATE TABLE，`cr_nm varchar(50)`；對照 line 51 `ob_pool_data_list.cr_nm nvarchar(50)`，P5i 已修，同表其餘欄位型別範本）
  - apps/api/src/modules/assignment/stage1/stage1-sql-executor.ts（line 96-107：`cr_nm` PG 唯一寫入站點，`'CR' || cremp.emp_nm`）
  - apps/api/src/modules/assignment/stage1/stage1-sql-executor-mssql.ts（line 75-92：MSSQL 對稱站點，`'CR' + cremp.emp_nm`，`@@ROWCOUNT` 讀回列數）
  - apps/api/src/modules/assignment/stage1/cr-priority-sql.ts / cr-priority-sql-mssql.ts（唯二其餘觸及 `cr_nm` 之站點，皆為 `SET cr_nm = NULL` 清空，非新值寫入，已查證窮盡）
  - apps/api/src/modules/assignment/services/assignment-run-report.service.ts（`formatApplDate` line 787-800；`buildExportQuery` line 554-633；`formatRow` line 714-752）
  - apps/api/src/modules/assignment/services/__tests__/f064-export-23col.spec.ts（既有 sliceFn 靜態測試，`TS-F064-APLDATE-002`/`REGRESSION-005`/`DET-002`/`LINEAGE-002`/`SCOPE-005`，本文件之修法須與其共存）
  - apps/api/src/modules/assignment/services/__tests__/pattern-b.mssql.spec.ts（`TS-MSSQL-P1C-PARAM-016`/`016b`：既有真 MSSQL 執行 `buildExportQuery()` 語法合法性驗證，天然涵蓋本文件 appl_date 表達式修法之語法回歸）
  - apps/api/src/database/__tests__/mssql-p5i-nvarchar.mssql.spec.ts（P5i 既有 ROUNDTRIP/CONTRAST/SCHEMA 手法，本文件 §三 沿用同一方法論）
covers: []
spec_version: "1.0"
date: 2026-07-09
last_updated: 2026-07-09
---

# AD-E07-43 P5 收尾：顯示層兩項 follow-up — 測試設計

> **命名說明（任務指示「確認命名/編號一致」之查證結果）**：任務指示原建議檔名含 `P4-followup`，但逐行查證兩項 follow-up 之來源皆為 **AD-E07-43（P5 階段）**——follow-up 1（`cr_nm`）明文記錄於 `AD-E07-43-P5i-impl.md`「範圍決策與偏差」item 3；follow-up 2（`appl_date` 匯出）明文記錄於 `AD-E07-43-P5h-impl.md` §7 AD-3 / §8 item 1。與既有 `AD-E07-41-P4-followup-rawdata-test.md`（P4 階段收尾）為**不同階段**之收尾切片，非同一份文件的延伸。故本文件更正採用 `AD-E07-43-P5-followup-display`（P5 收尾，主題＝顯示層），與既有 `<AD>-<phase>-followup-<topic>` 命名慣例一致，僅將 phase 由 P4 更正為 P5。
>
> 本文件覆蓋兩項獨立、低風險、非 cutover-blocker 之顯示層 follow-up：
> 1. **CRNM**：`ob_monthly_run_result.cr_nm` 於 MSSQL baseline 現為 `varchar(50)`，其唯一資料來源 `ob_pool_data_list.cr_nm`／`ob_emphire.emp_nm` 已於 P5i 修為 `nvarchar`，本表因「非 schema 產生器 entity」而未被 P5i 之機械掃描涵蓋，造成同一資料血緣鏈中間出現型別斷點。
> 2. **APLFMT**：`assignment-run-report.service.ts::formatApplDate()` 於 P5h（連線層 `useUTC:true`）修法後，JS `Date` 分支之本地/UTC getter 對 PG/MSSQL 兩引擎無單一正解（P5h §7 AD-3 已逐行論證），P5h 刻意不改此匯出顯示層程式碼，列為 follow-up；本文件之修法方向＝「SQL 端格式化為字串，繞開 JS Date getter 完全」。
>
> **★★ test-designer 設計階段真庫查證（dev CDMP，`172.20.202.212`/`DB=CDMP`，2026-07-09，唯讀 + 自建/自清探針，未動 baseline）之關鍵發現，改變兩項 follow-up 之風險定性**：
>
> 1. **🔴🔴 CRNM 並非單純「顯示截斷」風險，而是潛在的 Stage 1 月名單分派批次寫入失敗風險**：真庫探針證實 SQL Server 對 `varchar(N)` 容量溢位之 `INSERT` 採**明確拋錯**（`String or binary data would be truncated`），非靜默截斷（見 §三 CONTRAST-001 逐字錯誤訊息）。`cr_nm` 之唯一寫入站點（`stage1-sql-executor(-mssql).ts`）為**單一 `INSERT INTO ... SELECT ... FROM ... WHERE ...` set-based 陳述式**（非逐列 cursor）——若任一列之 `'CR'+emp_nm` 超過 50 bytes，會使**整批 Stage 1 INSERT 失敗**（該名單整批案件寫入失敗），而非僅該列顯示錯誤。此為比「顯示截斷」更嚴重的可用性風險等級，已獨立設計 §四 CRNM-WRITEPATH 群組透過**真實生產寫入路徑**（非孤立探針表）驗證。
> 2. **cr_nm 現行實際風險機率極低（已用真實生產資料驗證，非臆測）**：PG `cdmp_dev`（production-representative）實測 `ob_pool_data_list.cr_nm` 現有最長值＝**5 字元**（`'CR'+3 中文字`），距 50-byte（25 中文字）容量上限尚遠；`ob_monthly_run_result.cr_nm` 現有 **26,695** 筆非空值列，確認此為真實高頻使用路徑而非死欄位。本修法定性為**主動防禦性正確性修復**（對齊 P5i 已建立之全域慣例），非現行事故修復。
> 3. **🔴🔴 APLFMT 之真實曝險面遠高於「邊界案例」framing——production 資料 15.4% 落在危險帶**：PG `cdmp_dev` 實測 `ob_pool_data.appl_date`（1,679,489 列，100% 非 NULL）之小時分佈，wall-clock **≥16:00** 者共 **258,461 列（15.4%）**——P5h code comment 描述之「MSSQL ≥16:00 漂移」危險帶並非罕見邊界，而是**近六分之一真實生產資料**。cutover 後若不修，這些案件之 MSSQL 匯出「進件日」欄將系統性 +1 日。
> 4. **🔴🔴 精確邊界已用真 MSSQL 逐秒驗證，且 SQL 端格式化方案已證實兩引擎皆正確**：以 dev CDMP MSSQL（`useUTC:true`）對 5 個 wall-clock 樣本執行 `CONVERT(varchar(10),...,120)`／`FORMAT(...,'yyyy-MM-dd')` 與現行 `formatApplDate` 本地 getter 對照（見 §六 APLFMT-BOUNDARY 逐案例真實輸出值），確認：(a) 危險帶精確邊界為 `15:59:59`（現行 getter 仍正確）→`16:00:00`（現行 getter 首次錯誤，+1 日）；(b) `CONVERT`/`FORMAT` 兩函式於全部 5 樣本（含兩個邊界樣本）**皆正確**，證實 SQL 端格式化方案可行且無需在 `CONVERT`/`FORMAT` 間二選一（皆可）。
> 5. **既有 sliceFn 靜態測試對修法位置有隱性約束**：`f064-export-23col.spec.ts` 之 `TS-F064-APLDATE-002` 等測試以字串切片（非執行）比對 `buildExportQuery()` 原始碼文字，若 appl_date 之 dialect-aware 運算式改由**外部 helper 函式**組裝（而非在 `buildExportQuery()` 方法體內以 inline 字面常數/三元運算式組裝），會使 `o.appl_date` 子字串從切片文字消失、既有靜態測試誤判回歸。已設計 §一 GATE-001 決策關卡明確要求 inline 組裝。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-43-P5i-impl.md`「範圍決策與偏差」item 3 + `AD-E07-43-P5h-impl.md` §7 AD-3/§8 item 1 + `column-types.ts`（`nvarcharColumnType`，直接沿用）+ `ob-monthly-run-result.entity.ts`／`1751884800000-MssqlBaselineSchema.ts`（本輪待修）+ `stage1-sql-executor(.ts/-mssql.ts)`（CRNM 唯一寫入站點）+ `assignment-run-report.service.ts`（APLFMT 待修）+ `f064-export-23col.spec.ts`（既有靜態測試相容性紅線） |
| QA / Tester | 本文件 + `mssql-p5i-nvarchar.mssql.spec.ts`（沿用同一 round-trip/contrast 方法論） |
| DevOps / CI/CD | 本文件 §零 Harness（沿用 dev CDMP `.env.test.mssql` + docker `cdmp-postgres` 唯讀對照，不新建基礎設施） |
| Product Analyst / Architect | ★發現 1（CRNM 可用性風險重新定性）、★發現 3（APLFMT 真實曝險面 15.4%）——建議二者於下次 AD 修訂時同步調整風險等級敘述 |

---

## 零、測試環境與 Harness 設計

### 0.1 MSSQL：dev CDMP（沿用，不新建）

沿用 `.env.test.mssql`（`172.20.202.212`/`DB=CDMP`，由 `mssql-env-preload.ts` dotenv 自動載入）。**dev CDMP 現況為空庫**（本文件設計階段真庫查證：`ob_pool_data`/`ob_monthly_run_result`/`ob_emphire`/`assignment_run` 皆 0 列，MSSQL 尚未上 prod、僅完成 P6a 部署 bootstrap）——意即本文件所有測試案例皆須**自建最小 fixture**（無既有業務資料可供唯讀查詢），但仍須遵守「自建/自清、前綴隔離、禁 DROP/TRUNCATE baseline 表結構」原則（僅 DML INSERT/DELETE 自建列，不動 DDL/其餘 seed 設定資料如 users/datasources/計分卡）——為未來 dev CDMP 已載入資料後本文件仍可安全重跑之前提。`vi.setConfig({ testTimeout: 60000 })`（比照既有 mssql spec 慣例）。

### 0.2 PG：docker `cdmp-postgres`（唯讀，生產資料代表性樣本來源）

**MSSQL 尚無業務資料，故本文件之「真實生產規模／分佈」佐證改以 PG `cdmp-postgres`（`cdmp_dev`）唯讀查詢取得**（PG 為現行生產系統資料來源，MSSQL 為遷移目標尚未回填）。本文件 §三/§六 之產量分佈數字（cr_nm 最長 5 字元、appl_date 危險帶 15.4%）已於設計階段以唯讀 SQL 取得（見文件開頭★發現），tdd-implementation 若需重驗可比照相同唯讀查詢重跑，**不得對 `cdmp-postgres` 做任何 DML**。

### 0.3 CRNM-WRITEPATH 群組專屬 Harness：最小 Stage 1 fixture

§四 CRNM-WRITEPATH 群組驅動真實 `runStage1SqlInsert`/`runStage1SqlInsertMssql`（非孤立探針表、非完整 pipeline），需最小 fixture：1 筆 `assignment_run`（`status` 任意，僅供 FK 滿足）+ 1 筆 `ob_pool_data`（`agent_id` 指向下方 emphire 列，必要 NOT NULL 欄補最小值）+ 1 筆 `ob_emphire`（`id_no` 對應 `agent_id`、`resign_date` 為 NULL 或未來日期以滿足在職判定、`emp_nm` 為超長中文姓名 fixture）。全部以 `P5FU_` 前綴標記寫入列，`afterAll` 精準 `DELETE WHERE ... LIKE 'P5FU_%'`（比照 P5b/P5g「共用既有表＋前綴隔離＋精準 DELETE」慣例，非 TRUNCATE）。**決策關卡**：若 `Stage1FilterChain`/`core.where` 之篩選條件建構成本過高（需完整名單設定），允許退化為直接呼叫 `runStage1SqlInsert(Mssql)` 底層函式並自行建構最簡單 `core.where='1=1'` 等價條件，不需通過上層完整名單篩選鏈（比照 P5c script「重建 Stage 1 seed 列，不重跑 Stage 1 篩選」之既有先例，見 §一 GATE-002）。

### 0.4 CRNM-SCHEMA / ROUNDTRIP 群組 Harness：沿用 P5i 手法

比照 `mssql-p5i-nvarchar.mssql.spec.ts` 既有方法論：INFORMATION_SCHEMA 查詢（schema 現況鎖定）+ 自建 probe 表（`dbo.P5FU_PROBE_*`，`try/finally DROP`，非既有業務表）驗證 round-trip/contrast。

---

## 一、GATE — 決策關卡

### TS-P5FU-GATE-001（🔴🔴 MUST-FIX 決策關卡）：APLFMT 修法之 dialect-aware 運算式**必須 inline 於 `buildExportQuery()` 方法體內**組裝（三元運算式或 if-else 建構區域字串常數），不得抽為外部 helper 函式呼叫
- **Related Requirement**：★發現 5；`f064-export-23col.spec.ts` 之 `TS-F064-APLDATE-002`（`sliceFn` 對 `buildExportQuery(` 方法體做字串切片後 `expect(body).toContain('o.appl_date')`）
- **Test Type**：Decision Gate（文件化守門，MUST-FIX）
- **Expected Result**：`buildExportQuery()` 原始碼文字本身（非執行後展開值）須仍可被 `sliceFn` 擷取到字面 `o.appl_date` 子字串（即 `CONVERT(varchar(10), o.appl_date, 120)`／`to_char(o.appl_date, 'YYYY-MM-DD')` 等分支字面量須直接寫在該方法體內，而非 `${someExternalHelper(...)}` 間接引用）；若 impl 選擇抽外部 helper，**必須**同步更新 `TS-F064-APLDATE-002` 之斷言方式（如改為執行期斷言而非 sliceFn 靜態切片），並於 impl log 記錄理由——本案例預設建議「inline」以維持既有測試零改動，但不排他

---

### TS-P5FU-GATE-002（決策關卡）：CRNM-WRITEPATH 群組之 Stage 1 fixture 建置深度——完整篩選鏈 vs 簡化 `core.where`
- **Related Requirement**：§零 0.3
- **Test Type**：Decision Gate
- **Expected Result**：impl log 記錄選擇；兩者皆須使 §四 WRITEPATH-001/002 之核心斷言（INSERT 成功/失敗、`cr_nm` 值正確性）可黑盒驗證，不影響判定結果

---

### TS-P5FU-GATE-003：APLFMT sqlite 分支處理方式——維持裸 `o.appl_date`（不新增 sqlite date 函式分支）
- **Related Requirement**：現行 `f064-export-23col.spec.ts`（sqlite）entirely mock `cursorRows()`，SQL 文字之 sqlite 分支從未真正對 sqlite 執行（`sliceFn` 僅做靜態文字檢查，非執行）；sqlite 於本專案僅作單元測試 in-memory 替身，非匯出功能之生產 runtime target
- **Test Type**：Decision Gate
- **Expected Result**：`dataSource.options.type` 分流時，sqlite（或非 `mssql`/`postgres` 之預設分支）採**原樣 `o.appl_date`**（現行行為，交由 JS `formatApplDate` 之既有雙分支處理，不強行對齊）；若 impl 認為需要 sqlite 專屬格式化亦可（更保守），但不得因此使 pg/mssql 分支之字面量位置不滿足 GATE-001

---

### TS-P5FU-GATE-004：CRNM baseline migration 更新方式——直接改既有 MSSQL baseline CREATE TABLE 陳述式（非新增 ALTER migration）
- **Related Requirement**：對稱 P5i 既有裁定理由（MSSQL 尚未上 prod；baseline 為唯一事實來源；`mssql-p1b2` parity 驗收要求 synchronize↔baseline 單一基準一致）
- **Test Type**：Decision Gate（沿用既有裁定，非本文件新決策，僅記錄確認）
- **Expected Result**：`1751884800000-MssqlBaselineSchema.ts` 之 `ob_monthly_run_result` CREATE TABLE 陳述式內 `cr_nm varchar(50)` 直接改為 `cr_nm nvarchar(50)`；PG baseline migration（`1711360000000-BaselineSchema.ts`）**不變更**（`nvarcharColumnType` 於 PG 分支＝`varchar`，與現行 `character varying(50)` 逐值等價）

---

## 二、CRNM-SCHEMA — Schema 現況與修法後鎖定（事實鎖定 + 靜態守門）

### TS-P5FU-CRNM-SCHEMA-001（🔴🔴 MUST-FIX，已用真庫驗證現況）：修法後 `ob_monthly_run_result.cr_nm` 於 MSSQL（真實 INFORMATION_SCHEMA 查詢）＝ `nvarchar(50)`
- **Related Requirement**：I-MSSQL-NVARCHAR-DISPLAY-01
- **Test Type**：Positive / Integration — **DoD 核心**
- **設計階段已驗證現況（修法前基準值，2026-07-09，dev CDMP 真庫）**：`DATA_TYPE='varchar'`, `CHARACTER_MAXIMUM_LENGTH=50`
- **Expected Result（修法後）**：`DATA_TYPE='nvarchar'`, `CHARACTER_MAXIMUM_LENGTH=50`

---

### TS-P5FU-CRNM-SCHEMA-002（🔴 MUST-FIX，防範圍誤擴大）：同表其餘 12 個既存欄位（`custo_no`/`settle_src`/`card_level`/`tier_level`/`is_cr`/`cr_id`/`appl_date`/`dept_id`/`emplid`/`emplid_deptid`/`result_status`/`assignday`）型別**不受本輪修法影響**
- **Related Requirement**：P5i 既有「display-only」範圍原則（純 ASCII 代碼/PK/join key 不轉 nvarchar，見 P5i impl log「範圍決策」item 1）——本表除 `cr_nm` 外皆為純 ASCII 代碼或系統列舉值，逐欄核對非中文顯示欄
- **Test Type**：Negative / Regression — **防止修法誤擴大之靜態守門**
- **設計階段已驗證現況**：12 欄皆 `DATA_TYPE='varchar'`；`settle_src` 為 `nvarchar(MAX)`（經既有 `longTextColumnType`，非本輪異動、本就 Unicode 安全，需排除於「不得變動」斷言外）
- **Expected Result**：修法後 12 欄仍為 `varchar`（含長度不變）；`settle_src` 仍為 `nvarchar(-1)`（MAX，不變）

---

### TS-P5FU-CRNM-SCHEMA-003（🔴 MUST-FIX，靜態）：entity `ob-monthly-run-result.entity.ts` 之 `cr_nm` `@Column` 改用 `nvarcharColumnType`（沿用既有 helper，不新建）
- **Related Requirement**：column-types.ts line 111-112
- **Test Type**：Regression / Unit — 靜態掃描
- **Expected Result**：entity 檔 import `nvarcharColumnType`；`cr_nm` 欄 `type: nvarcharColumnType`（`length: 50` 不變）；其餘 12 欄 `@Column` 之 literal `'varchar'` 字面量不變（非全數改用 helper，對稱 SCHEMA-002 範圍界定）

---

### TS-P5FU-CRNM-SCHEMA-004（🔴 MUST-FIX，靜態）：baseline migration `cr_nm varchar(50)`→`nvarchar(50)`，其餘欄位陳述式逐字不變
- **Related Requirement**：GATE-004
- **Test Type**：Regression / Unit — 靜態掃描（migration 檔 CREATE TABLE 陳述式逐欄比對）
- **Expected Result**：僅 `cr_nm` 型別文字改變；PK/index/FK 陳述式（`PK_ae7626a9cdbb4815d2dc08ead13`、4 個 index）不變

---

### TS-P5FU-CRNM-SCHEMA-005（回歸）：PG baseline migration（`1711360000000-BaselineSchema.ts` line 1080/1223 一帶）未變更
- **Related Requirement**：GATE-004；`nvarcharColumnType` PG 分支＝`varchar`，逐值等價
- **Test Type**：Regression — PG 零回歸確認

---

## 三、CRNM-ROUNDTRIP — Unicode round-trip 與截斷風險驗證（沿用 P5i 方法論）

### TS-P5FU-CRNM-ROUNDTRIP-001（🔴🔴 MUST-FIX，真 MSSQL，已於設計階段驗證雛形）：45 個中文字（90 bytes）寫入 `nvarchar(50)` → 讀回完整 45 字不截斷
- **Related Requirement**：I-MSSQL-NVARCHAR-DISPLAY-01
- **Test Type**：Positive / Integration — **DoD 核心**
- **設計階段已驗證（自建 `dbo.P5FU_PROBE_crnm` 探針表，`try/finally DROP`）**：nvarchar(50) 欄位寫入 `'測'.repeat(45)` → 讀回 `.length===45`
- **Expected Result**：`ob_monthly_run_result.cr_nm`（修法後 nvarchar(50)）同手法驗證同結果

---

### TS-P5FU-CRNM-CONTRAST-001（🔴 對照組，已於設計階段真庫驗證，★發現 1 之逐字證據）：同 45 中文字寫入 `varchar(50)` BIN collation → SQL Server **明確拋錯**，非靜默截斷
- **Related Requirement**：★發現 1；I-MSSQL-NVARCHAR-DISPLAY-01「避免截斷」動機之精確化（真實失敗模式為「INSERT 拒絕」而非「資料悄悄變短」）
- **Test Type**：Negative / Integration — 修法前風險之逐字證據對照
- **設計階段已驗證逐字錯誤訊息**：`String or binary data would be truncated in table 'CDMP.dbo.P5FU_PROBE_crnm', column 'v_varchar'. Truncated value: '測測測測測測測測測測測測測測測測測測測測測測測測測'.`
- **Expected Result**：本案例為既有事實記錄（修法前基準），非阻擋；用途為佐證 §四 WRITEPATH-002 之「整批 INSERT 失敗」機制根因

---

### TS-P5FU-CRNM-REALISTIC-001：貼近真實資料形態邊界（`'CR'` + 25 中文字 = 27 字元 / 54 bytes，剛好略超 50-byte 容量）於 nvarchar(50) 正確保存；此值於現行 varchar(50) 會觸發 CONTRAST-001 同型拋錯
- **Related Requirement**：★發現 1；比 45-全中文更貼近真實 `'CR'+emp_nm` 寫入格式（ASCII 前綴 + 中文姓名）
- **Test Type**：Boundary / Integration
- **Expected Result**：nvarchar(50) 側完整保存 27 字元；varchar(50) 側（修法前對照，選配）同 CONTRAST-001 拋錯模式

---

### TS-P5FU-CRNM-PRODSCALE-001（記錄性，非阻擋，★發現 2 之量化依據）：production 實測 `cr_nm` 現有最長值（PG `cdmp_dev`，2026-07-09 唯讀查詢）＝ **5 字元**（`'CR'+3 中文字`），距 50-byte 容量上限（25 中文字）尚遠
- **Related Requirement**：★發現 2；佐證本修法定性為主動防禦性正確性修復，非現行事故修復
- **Test Type**：Observability（記錄性，非阻擋）
- **Expected Result**：impl log 記錄此數字供 architect/業務參考修法優先度判斷；不作為測試斷言

---

## 四、CRNM-WRITEPATH — 真實 Stage 1 SQL pushdown 寫入路徑驗證（★發現 1 核心，非孤立探針表）

> **前言**：`cr_nm` 之唯一寫入站點為 `stage1-sql-executor(.ts/-mssql.ts)` 之 `INSERT INTO ob_monthly_run_result ... SELECT ..., CASE WHEN cremp.emp_id IS NOT NULL THEN 'CR'||/+cremp.emp_nm ELSE NULL END, ...`（已逐行查證窮盡，`cr-priority-sql(-mssql).ts` 僅有 `SET cr_nm = NULL` 清空語句、無其他新值寫入站點）。本群組透過此**真實生產程式碼路徑**（非獨立 probe 表）驗證修法效果，比照 P5g/P5c「修法驗證須貼近真實寫入路徑」之既有設計原則。

### TS-P5FU-CRNM-WRITEPATH-001（🔴🔴 MUST-FIX DoD 核心，MSSQL）：構造 `ob_emphire.emp_nm` 超長中文姓名 fixture（使 `'CR'+emp_nm` > 50 bytes），透過真實 `runStage1SqlInsertMssql()` 執行，驗證修法後 Stage 1 INSERT 成功、`cr_nm` 完整寫入不截斷
- **Related Requirement**：★發現 1；I-MSSQL-NVARCHAR-DISPLAY-01
- **Preconditions**：§零 0.3 最小 fixture（`P5FU_` 前綴，`agent_id` 命中 `ob_emphire.id_no`、在職、`emp_nm`=25+ 中文字）
- **Test Type**：Positive / Integration — **DoD 核心**
- **Expected Result**：`inserted` 回傳列數 = 1（非 0/拋錯）；查詢寫入列之 `cr_nm` = `'CR'+emp_nm` 逐字完整（非截斷、非 NULL）

---

### TS-P5FU-CRNM-WRITEPATH-002（🔴🔴 MUST-FIX，對照組，★發現 1 之決定性佐證）：同一 fixture 於**修法前**（`cr_nm varchar(50)`）執行同一真實 Stage 1 INSERT，確認**整批 INSERT 失敗**（非僅該列被跳過），佐證此為批次可用性風險而非純顯示風險
- **Related Requirement**：★發現 1；CONTRAST-001 根因於真實寫入路徑之延伸驗證
- **Test Type**：Negative / Integration — 修法前基準之决定性佐證（比照 P5g「修法前後對照」設計手法）
- **Expected Result**：`runStage1SqlInsertMssql()` 拋出錯誤（訊息含 `String or binary data would be truncated` 或對應 T-SQL 錯誤碼）；查詢目標表確認**該批次全部列（含未超長之其他案件列，若 fixture 含多列）皆未寫入**（set-based INSERT 全批失敗語意，非部分成功）
- **決策關卡（若窮舉後修法前基準環境已不可重現，如 baseline 已先行修改）**：退化為文件化記錄 CONTRAST-001 之表級證據 + 程式碼靜態論證（set-based INSERT...SELECT 陳述式語意），不可略過此案例整體之風險記錄義務

---

### TS-P5FU-CRNM-WRITEPATH-003（回歸，DoD 核心）：真實案例（正常長度姓名，如 2-4 中文字）Stage 1 INSERT 寫入後 `cr_nm` 值 = `'CR'+emp_nm` 逐字正確，與修法前行為一致（修法不改變正常情境結果）
- **Related Requirement**：型別修法對合法範圍內資料零回歸
- **Test Type**：Regression / Integration — **DoD 核心**

---

### TS-P5FU-CRNM-WRITEPATH-004：`agent_id` 未命中在職 `ob_emphire`（CASE ELSE 分支）情境，`cr_nm` 正確維持 `NULL`，不受型別修法影響
- **Related Requirement**：CASE 表達式 ELSE 分支之型別中立性回歸

---

### TS-P5FU-CRNM-WRITEPATH-005（PG 對稱回歸）：PG 側 `runStage1SqlInsert()` 以 WRITEPATH-001 同 fixture（超長姓名）執行，確認 PG 本就無截斷風險（`character varying` 以字元計長而非 byte）、且本輪 MSSQL-only 修法不影響 PG 既有正確行為
- **Related Requirement**：GATE-004；PG 側 `nvarcharColumnType`＝`varchar`，型別本身未變更
- **Test Type**：Regression / Integration（degradable，若 `cdmp-postgres` 唯讀限制不允許寫入測試資料，可改用既有 `P5B_PG_DB`/隔離測試庫，不得寫入 `cdmp_dev`）

---

## 五、CRNM-REG — 回歸

### TS-P5FU-CRNM-REG-001（🔴 MUST-FIX）：`mssql-p1b2`（synchronize(entity) ↔ baseline migration 結構等價 parity 驗收套件）納入 `ob_monthly_run_result` 型別修法後仍全綠
- **Related Requirement**：GATE-004 之落地確認；沿用 P5i 已驗證之 parity 機制（P5i SCHEMA/PARITY 43/43 PASS 先例）

---

### TS-P5FU-CRNM-REG-002：`npx tsc --noEmit -p tsconfig.build.json` 乾淨

---

### TS-P5FU-CRNM-REG-003：既有涉及 `ob_monthly_run_result`（F098/F101/F102/F104 相關）之 sqlite 套件不回歸（型別 helper 於 sqlite 分支＝`varchar`，逐值等價現行 literal）

---

### TS-P5FU-CRNM-REG-004：F064/F108 匯出既有套件（`cr_nm`＝匯出欄 8「CR_NM」）不受型別修法影響——值本身不變，僅底層欄位型別變更，`formatRow()` 之 `s(raw.cr_nm)` 字串轉換邏輯與型別無關

---

## 六、APLFMT-BOUNDARY — appl_date 邊界精確驗證（已用真 MSSQL 逐秒驗證，★發現 3/4 核心證據）

> 本群組所有樣本已於設計階段實際對 dev CDMP MSSQL（`useUTC:true`）執行 `CONVERT(varchar(10), CAST(@0 AS datetime2), 120)`／`FORMAT(CAST(@0 AS datetime2),'yyyy-MM-dd')` 與現行 `formatApplDate` 邏輯之本地/UTC getter 對照，取得下表逐案例真實輸出值（非理論推導）：

| wall-clock 輸入 | `CONVERT(...,120)` | `FORMAT(...)` | 現行本地 getter（修法前，MSSQL 實際行為） | UTC getter（僅供對照，非採用方案） |
|---|---|---|---|---|
| `2015-05-18 15:24:00` | `2015-05-18` ✅ | `2015-05-18` ✅ | `2015-05-18` ✅（危險帶前） | `2015-05-18` |
| `2026-07-01 15:59:59`（危險帶前一秒） | `2026-07-01` ✅ | `2026-07-01` ✅ | `2026-07-01` ✅ | `2026-07-01` |
| `2026-07-01 16:00:00`（危險帶首秒） | `2026-07-01` ✅ | `2026-07-01` ✅ | `2026-07-02` ❌（+1 日） | `2026-07-01` |
| `2026-07-01 23:59:59`（全天最危險） | `2026-07-01` ✅ | `2026-07-01` ✅ | `2026-07-02` ❌（+1 日） | `2026-07-01` |
| `2026-07-01 00:00:00`（安全帶內） | `2026-07-01` ✅ | `2026-07-01` ✅ | `2026-07-01` ✅ | `2026-07-01` |

### TS-P5FU-APLFMT-BOUNDARY-001（🔴🔴 MUST-FIX DoD 核心）：wall-clock `16:00:00` 樣本，SQL 端格式化（`CONVERT`/`FORMAT` 任一）皆正確回傳 `'2026-07-01'`；現行本地 getter 之 `'2026-07-02'` 錯誤已由上表真庫驗證消除
- **Related Requirement**：★發現 3/4；AD-E07-43-P5h-impl.md §7 AD-3

---

### TS-P5FU-APLFMT-BOUNDARY-002（🔴 MUST-FIX，精確邊界另一側）：wall-clock `15:59:59`（危險帶前一秒）修法後 SQL 端格式化仍正確，不因修法引入新偏差
- **Related Requirement**：回歸——修法不可只修「已知錯誤側」而意外破壞「原本正確側」

---

### TS-P5FU-APLFMT-BOUNDARY-003（🔴 MUST-FIX）：wall-clock `23:59:59`（全天危险带最大者）SQL 端格式化正確
- **Related Requirement**：同上，邊界另一極值

---

### TS-P5FU-APLFMT-BOUNDARY-004（回歸）：wall-clock `00:00:00`（安全帶內，現行本就正確）SQL 端格式化後仍正確，不劣化既有正確案例

---

### TS-P5FU-APLFMT-BOUNDARY-005（歷史對照回歸）：P5h §3.4 既有已驗收樣本 `2015-05-18 15:24:00` SQL 端格式化後仍為 `'2015-05-18'`，與既有 P5h round-trip 驗收結論一致不回歸

---

### TS-P5FU-APLFMT-BOUNDARY-006（★發現 3，記錄性，量化曝險面）：production `ob_pool_data.appl_date` 小時分佈實測（PG `cdmp_dev`，2026-07-09，1,679,489 列，appl_date 100% 非 NULL）——`hour=0` 佔 160,802 列（legacy 日期無時分預設值）；`hour>=16`（危險帶）共 **258,461 列（15.4%）**；`hour∈[8,15]`（安全帶，業務時段主體）佔約 78.5%
- **Related Requirement**：★發現 3；量化 P5h 遺留 follow-up 於 cutover 後之實際使用者體感影響面
- **Test Type**：Observability（記錄性，非阻擋，供 architect/業務評估修法優先度）
- **Expected Result**：impl log 記錄此分佈數字；不作為測試斷言，但建議寫入 risks-and-gaps 供未來 P5e 式簽核報告參考（若尚未結案）

---

## 七、APLFMT-EXPORT — F064 端對端匯出驗證

### TS-P5FU-APLFMT-EXPORT-001（🔴🔴 MUST-FIX DoD 核心）：真實 `exportResult(runId, 'csv')`，run 內含 `appl_date` wall-clock `>=16:00` 之案件，匯出「進件日」欄（`YYYY/MM/DD`）修法後與同案件 PG 匯出結果逐字相等
- **Related Requirement**：★發現 3/4；跨引擎一致性為本修法核心 DoD
- **Test Type**：Positive / Integration — **DoD 核心**
- **Preconditions**：MSSQL 側以 §零 0.3 同型 fixture 建構 1 筆 `ob_monthly_run_result` + 對應 `ob_pool_data`（`appl_date`=`2026-07-01 16:00:00`），跑通 `AssignmentRunReportService.exportResult()`
- **Expected Result**：CSV 第 6 欄「進件日」= `'2026/07/01'`（修法前為 `'2026/07/02'`，MUST-FIX 紅燈對照）

---

### TS-P5FU-APLFMT-EXPORT-002（DoD 核心）：xlsx 匯出同案件同欄位同斷言（`xlsx`/`csv` 共用同一 row-producer `cursorRows`+`formatRow`，一次修法兩路徑皆生效，非需分別修改）
- **Related Requirement**：`buildExportXlsxStreaming`/`buildExportCsvStreaming` 共用 `formatRow()` 之既有架構

---

### TS-P5FU-APLFMT-EXPORT-003（回歸）：既有 `f064-export-23col.spec.ts`（sqlite mock `cursorRows`）全綠不受影響——`cursorRows()` 被 spy 取代，`buildExportQuery()` 內之 SQL 文字於此套件從未真正對 sqlite 執行
- **Related Requirement**：GATE-003

---

### TS-P5FU-APLFMT-EXPORT-004（回歸，degradable）：既有 `f064-export-23col.pg.spec.ts`（若可達真 PG）appl_date 匯出值不變——PG 分支由「裸欄位交 JS 本地 getter」改為「`to_char` SQL 端字串」，僅格式化執行位置轉移，最終字串輸出（經 `formatApplDate` 字串分支 `String(v).slice(0,10)`）逐字一致
- **Related Requirement**：跨路徑等價（SQL 端 to_char 產出 `'YYYY-MM-DD'` 字串 → `formatApplDate` 字串分支取前 10 碼 → 與原始 Date 分支之本地 getter 輸出理論值相同，PG 側本無 bug、僅執行位置改變）

---

### TS-P5FU-APLFMT-EXPORT-005（回歸）：F108「樞紐分析」頁不受本修法影響——`accumulatePivot()`/`writePivotSheet()` 不使用 `appl_date` 欄位（僅用 `emphire_dept_name`/`emplid`/`list_no`），回歸確認二者程式碼路徑無交集

---

## 八、APLFMT-STATIC — 既有靜態測試相容性守門（🔴🔴 MUST-FIX，★發現 5）

### TS-P5FU-APLFMT-STATIC-001（🔴🔴 MUST-FIX）：既有 `TS-F064-APLDATE-002`（`sliceFn(SERVICE_SRC,'private async buildExportQuery(')` 後 `expect(body).toContain('o.appl_date')` 且 `not.toContain('r.appl_date')`）修法後仍通過，不需修改斷言本身
- **Related Requirement**：GATE-001 落地確認
- **Test Type**：Regression — **MUST-FIX 静态守门**

---

### TS-P5FU-APLFMT-STATIC-002（🔴 MUST-FIX，新增）：`buildExportQuery()` 之 appl_date SELECT 表達式依 `dataSource.options.type` 分流之靜態掃描——mssql 分支含 `CONVERT`/`120`（或 `FORMAT`）字樣、postgres 分支含 `to_char` 字樣
- **Related Requirement**：修法落地之最基本靜態守門（比照既有 P5g STATIC-001「交易呼叫靜態掃描」慣例）

---

### TS-P5FU-APLFMT-STATIC-003（回歸）：既有 4 項 sliceFn 靜態測試（`TS-F064-REGRESSION-005`/`DET-002`/`LINEAGE-002`/`SCOPE-005`）不因本修法回歸——`ORDER BY`、禁用欄位掃描、`INNER JOIN ob_pool_data`、scope 注入皆與 appl_date 表達式改動無交集

---

### TS-P5FU-APLFMT-STATIC-004：`formatApplDate()` 私有方法本身**不刪除**，Date 分支防禦性保留（理論上仍可能收到 Date 物件之呼叫情境，如未來若有其他呼叫端未經 SQL 端格式化）；本修法僅改變 `buildExportQuery()` 之 SELECT 表達式使**實際傳入值恆為字串**、觸發既有字串分支，非重構 `formatApplDate()` 本身
- **Related Requirement**：範圍界定，避免過度重構

---

## 九、REG — 回歸（APLFMT 收尾）

### TS-P5FU-APLFMT-REG-001（🔴 MUST-FIX）：`npx tsc --noEmit -p tsconfig.build.json` 乾淨

---

### TS-P5FU-APLFMT-REG-002（🔴 MUST-FIX，天然既有回歸網）：既有 `pattern-b.mssql.spec.ts` 之 `TS-MSSQL-P1C-PARAM-016`/`016b`（站點 4，直接對真 MSSQL 執行 `buildExportQuery()` 產出之完整 SQL，驗證語法合法性 + 資料等價）修法後仍通過——新增之 `CONVERT(varchar(10), o.appl_date, 120)` 表達式天然被此既有套件之真實 MSSQL 語法檢查涵蓋，無需新增獨立語法驗證套件
- **Related Requirement**：既有測試資產之天然涵蓋範圍確認（比照專案既有「不重複造輪」原則）

---

### TS-P5FU-APLFMT-REG-003：PG/sqlite 路徑既有行為對稱既有 dispatch 慣例（如 P1c/P2b/P3a-d 系列之 `dataSource.options.type`/`DB_TYPE` 三分支判斷模式），不新增二元 gate 陷阱

---

## 附：與 P5h/P5i follow-up 逐條對應

| 來源 follow-up 原文 | 對應測試群組 |
|---|---|
| P5i impl log「範圍決策」item 3：`ob_monthly_run_result.cr_nm varchar(50)` 承接自 `ob_pool_data_list.cr_nm`（已 nvarchar），MSSQL 下理論上有截斷風險，CR 姓名 ≤5 中文字實務不觸頂，列為 follow-up | §二 CRNM-SCHEMA、§三 CRNM-ROUNDTRIP、§五 CRNM-REG |
| test-designer 本輪新查證：★發現 1（set-based INSERT 整批失敗風險，非僅顯示截斷） | §四 CRNM-WRITEPATH（本文件核心新增群組，P5i 原文未涵蓋此角度） |
| P5h impl log §7 AD-3 / §8 item 1：`formatApplDate` 跨引擎 getter 無單一正解，根治方向＝SQL 端格式化為字串，列為 follow-up（非阻擋） | §六 APLFMT-BOUNDARY、§七 APLFMT-EXPORT |
| test-designer 本輪新查證：★發現 3（productive 資料 15.4% 落危險帶，非邊緣案例）+ ★發現 4（真 MSSQL 逐秒邊界驗證 + SQL 端格式化兩函式皆正確） | §六 APLFMT-BOUNDARY（BOUNDARY-006 量化 + 上表逐案例真實輸出值） |
| test-designer 本輪新查證：★發現 5（既有 sliceFn 靜態測試對修法程式碼位置之隱性約束） | §一 GATE-001；§八 APLFMT-STATIC |
