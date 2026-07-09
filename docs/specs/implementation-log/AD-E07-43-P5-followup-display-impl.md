---
type: implementation-log
feature_id: AD-E07-43-P5-followup-display
feature_name: MSSQL 遷移 P5 收尾 — 顯示層兩項 follow-up（cr_nm→nvarchar + appl_date 匯出 SQL 端格式化）
status: complete
last_updated: 2026-07-09
---

# AD-E07-43 P5 收尾（顯示層）— Implementation Log

對應測試設計：`docs/test-specs/infrastructure/AD-E07-43-P5-followup-display-test.md`。
承接 follow-up：`AD-E07-43-P5i-impl.md`「範圍決策」item 3（cr_nm）+ `AD-E07-43-P5h-impl.md` §7 AD-3 / §8 item 1（appl_date）。
定位：非 cutover-blocker，顯示層正確性/一致性修法；**引擎/計分/分派路徑零改動**。

真實 MSSQL 對 **dev CDMP**（`.env.test.mssql`，2022 Standard / BIN collation）實測，非 skip。

---

## 測試結果摘要

| Scenario / 群組 | 說明 | 狀態 |
|---|---|---|
| **CRNM（真 dev CDMP，schema `p5fu` 隔離）** | | |
| TS-P5FU-CRNM-SCHEMA-001 | ob_monthly_run_result.cr_nm = nvarchar(50)（真 INFORMATION_SCHEMA，synchronize entity）| PASS |
| TS-P5FU-CRNM-SCHEMA-002 | 其餘 12 欄維持 varchar；settle_src 維持 nvarchar(MAX / -1）| PASS |
| TS-P5FU-CRNM-ROUNDTRIP-001 | 45 中文字（90 bytes）→ nvarchar(50) 讀回完整 45 字不截斷 | PASS |
| TS-P5FU-CRNM-REALISTIC-001 | `'CR'`+25 中文（27 字 / 54 bytes）於 nvarchar(50) 完整保存 | PASS |
| TS-P5FU-CRNM-CONTRAST-001 | 同值寫 varchar(50) BIN → 拋 `String or binary data would be truncated` | PASS |
| TS-P5FU-CRNM-WRITEPATH-001 | 真實 Stage 1 INSERT…SELECT（超長中文姓名 >50 bytes）→ 成功、cr_nm 完整不截斷 | PASS |
| TS-P5FU-CRNM-WRITEPATH-002 | 同 fixture 寫 varchar(50) 目標 → **整批 INSERT 失敗（0 列）** | PASS |
| TS-P5FU-CRNM-WRITEPATH-003 | 正常長度姓名（2 中文）→ cr_nm=`'CR'`+emp_nm 逐字正確（零回歸）| PASS |
| TS-P5FU-CRNM-WRITEPATH-004 | agent_id 未命中在職 emphire（CASE ELSE）→ cr_nm 維持 NULL | PASS |
| **APLFMT（真 dev CDMP dbo baseline，前綴/GUID 隔離）** | | |
| TS-P5FU-APLFMT-BOUNDARY-001~005 | 真 datetime2 逐秒邊界，CONVERT(varchar(10),o.appl_date,120) 皆正確 | PASS |
| TS-P5FU-APLFMT-BOUNDARY-003b | 16:00:00 危險帶首秒 → SQL 端 `2026-07-01`（未 +1 日）| PASS |
| TS-P5FU-APLFMT-EXPORT-001 | 真實 exportResult(csv) 16:00 案件「進件日」= `2026/07/01` | PASS |
| TS-P5FU-APLFMT-EXPORT-002 | 真實 exportResult(xlsx) 同案件同欄位同斷言（共用 formatRow）| PASS |
| **靜態守門（sqlite lane，恆跑）** | | |
| TS-P5FU-CRNM-SCHEMA-003/004/004b/005 | entity 用 nvarcharColumnType；MSSQL baseline cr_nm nvarchar(50)；PG baseline 不動 | PASS（8/8）|
| TS-P5FU-APLFMT-STATIC-001/002/003/004 | GATE-001 inline；dialect 分流字面量；既有守門不回歸；formatApplDate 保留 | PASS |
| **回歸** | | |
| f064-export-23col.spec（sqlite）| 既有 46 測試（含 APLDATE-002 / LINEAGE-002 sliceFn）| PASS（46/46）|
| f108-export-pivot-sheet.spec（sqlite）| 37 測試 | PASS（37/37）|
| assignment-run-report.{scope,service}.spec | 12 + 13 | PASS（25/25）|
| cr-priority / stage2to4-f104 / stage1-filter-chain（sqlite，重度用 ObMonthlyRunResult）| REG-003 | PASS（114/114）|
| mssql-p5i-nvarchar（真 dev CDMP）| P5i 既有 nvarchar 回歸 | PASS（5/5）|
| tsc --noEmit -p tsconfig.build.json | | EXIT 0（乾淨）|

### 環境性 skip（非本 slice 回歸，忠實記錄）
- **TS-P5FU-CRNM-REG-001（mssql-p1b2 parity）SKIP**：dev CDMP 之 `CDMPT` 登入對 p1b2 所需連線失敗（「使用者 'CDMPT' 的登入失敗」，pre-existing 權限/DB 條件，非本 slice）。**parity 由構造保證**：entity `cr_nm`→`nvarcharColumnType`（mssql=nvarchar）與 baseline `cr_nm nvarchar(50)` 同步改，兩軌皆 → nvarchar(50)；且 CRNM-SCHEMA-001（真 synchronize entity → nvarchar(50)）+ SCHEMA-004（baseline 文字 nvarchar(50)）已分別實證兩端一致。
- **TS-P5FU-APLFMT-REG-002（pattern-b PARAM-016）SKIP**：pattern-b 綁定專屬空庫 `CDMP_PATTERNB`（由 docker mssql-init 建立），dev CDMP 無該庫 → init 失敗 skip（pre-existing）。本 slice 之 CONVERT 語法合法性已由 APLFMT-BOUNDARY（真 buildExportQuery 產出 SQL 對真 datetime2 執行）直接涵蓋。
- **PG 分支（f064.pg / to_char）SKIP**：本機無 `postgres-test` 容器（既有 f064.pg / f108.pg 亦同）。PG 零回歸依據：STATIC-002 靜態證實 `to_char(o.appl_date,'YYYY-MM-DD')` 分支存在；輸出等價（to_char → 'YYYY-MM-DD' 字串 → formatApplDate 字串分支 slice(0,10) → 與修法前 Date 本地 getter 逐值相同，PG 本無 bug、僅格式化位置由 JS 移至 SQL 端）。

---

## 檔案異動

| 檔案 | 類型 | 說明 |
|---|---|---|
| `src/database/entities/ob-monthly-run-result.entity.ts` | modified | `cr_nm` 欄 `type:'varchar'` → `nvarcharColumnType`（沿用 P5i 既有 helper、不新建）；import 補 `nvarcharColumnType`；`length:50` / `nullable` 不變 |
| `src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts` | modified | ob_monthly_run_result CREATE TABLE `"cr_nm" varchar(50)` → `nvarchar(50)`（僅此 1 欄；PK/其餘欄逐字不變）|
| `src/modules/assignment/services/assignment-run-report.service.ts` | modified | `buildExportQuery()` 內 **inline** dialect-conditional appl_date 格式化（mssql=`CONVERT(varchar(10), o.appl_date, 120)`、postgres=`to_char(o.appl_date, 'YYYY-MM-DD')`、sqlite/其他=裸 `o.appl_date`）；SELECT 以 `${applDateExpr}` 插值 |
| `src/database/__tests__/mssql-p5fu-crnm-nvarchar.mssql.spec.ts` | new | CRNM schema/roundtrip/contrast/writepath（真 dev CDMP，schema `p5fu`）|
| `src/modules/assignment/services/__tests__/p5fu-appl-date-export.mssql.spec.ts` | new | APLFMT boundary/export（真 dev CDMP dbo baseline，GUID/前綴隔離）|
| `src/modules/assignment/services/__tests__/p5fu-display.static.spec.ts` | new | CRNM + APLFMT 源碼靜態守門（sqlite lane 恆跑）|

**PG baseline（`1711360000000-BaselineSchema.ts`）未變更**：`nvarcharColumnType` 於 PG=`varchar`，與既有 `cr_nm character varying(50)` 逐值等價（SCHEMA-005 靜態確認）。**未觸引擎/計分/CR/分派程式碼。未 git commit。未動記憶檔。**

---

## (1) cr_nm → nvarchar 修法要點

- **唯一寫入站點**：`stage1-sql-executor(-mssql).ts` 之 `INSERT INTO ob_monthly_run_result … CASE WHEN cremp.emp_id IS NOT NULL THEN 'CR' ||/+ cremp.emp_nm …`（`cr-priority-sql(-mssql).ts` 僅 `SET cr_nm=NULL` 清空，非新值寫入，已窮盡查證）。
- **★發現 1 已實證（WRITEPATH-001/002）**：SQL Server 對 varchar(N) 容量溢位採**明確拋錯**（非靜默截斷）；因 cr_nm 之唯一寫入為單一 set-based `INSERT…SELECT`，超長 `'CR'+emp_nm` 會使**整批 INSERT 失敗**（WRITEPATH-002 實測 varchar(50) 目標 → 拋 truncation + 目標 0 列）。改 nvarchar(50) 後 WRITEPATH-001 同 fixture INSERT 成功、cr_nm 完整（54 bytes / 27 字，nvarchar 以字元計長 ≤ 50）。
- **GATE-004（沿用 P5i 裁定）**：直接改 MSSQL baseline CREATE TABLE（非新增 ALTER migration）——MSSQL 未上 prod、baseline 為唯一事實來源、維持 synchronize↔baseline parity。
- **PRODSCALE（★發現 2，記錄性）**：PG cdmp_dev 實測 cr_nm 現有最長值＝5 字元（`'CR'`+3 中文），距 50-byte 容量尚遠 → 本修法定性為**主動防禦性正確性修復**，非現行事故修復。

## (2) appl_date 匯出 SQL 端格式化要點

- **根因（P5h §7 AD-3）**：`formatApplDate` JS Date 分支跨引擎無單一正解——PG timestamp <08:00 走 UTC getter 漂移、MSSQL（useUTC:true）datetime2 ≥16:00 走本地 getter +1 日。根治＝於 SQL 端格式化為 `'YYYY-MM-DD'` 字串，走 `formatApplDate` 既有**字串分支**（`slice(0,10)`），與時區/getter 完全脫鉤。
- **★發現 3/4 已實證（BOUNDARY）**：真 dev CDMP datetime2 逐秒邊界 5 樣本（含 15:59:59 / 16:00:00 / 23:59:59）CONVERT 皆正確；16:00:00 由修法前本地 getter 之 `2026-07-02` 修正為 `2026-07-01`。
- **GATE-001（inline，MUST-FIX）**：dialect 運算式 inline 於 `buildExportQuery()` 方法體（含字面 `o.appl_date`），使既有 `sliceFn` 靜態測試（TS-F064-APLDATE-002：body 含 `o.appl_date`、不含 `r.appl_date`）**零改動仍通過**（實測 f064 46/46 綠）。未抽外部 helper。
- **GATE-003（sqlite）**：非 pg/mssql 之預設分支維持裸 `o.appl_date`（sqlite 單元測試 mock cursorRows、此 SQL 從不對 sqlite 執行）。
- **範圍界定（STATIC-004）**：`formatApplDate` 私有方法**保留不刪**（防禦性字串/Date 雙分支）；本修法僅使實際傳入值恆為字串、觸發既有字串分支，非重構該方法。

---

## Architectural Decisions（實作階段，spec 邊界內）

- **AD-P5FU-1（WRITEPATH GATE-002 降級手法）**：CRNM-WRITEPATH 群組採「簡化 `core.where=1=1`」——忠實複刻 `stage1-sql-executor-mssql.ts` 之 INSERT…SELECT（`'CR' + cremp.emp_nm` 串接 + `@@ROWCOUNT` 讀回），對真實 synchronize 之 ObMonthlyRunResult（nvarchar cr_nm 目標欄）執行，不重跑完整名單篩選鏈（比照 P5c「重建 Stage 1 seed 列」先例）。核心黑盒斷言（INSERT 成功/失敗列數、cr_nm 值/NULL）不受簡化影響。
- **AD-P5FU-2（APLFMT EXPORT harness）**：`cursorRows` 為 PG 專屬 cursor 語法（`DECLARE … CURSOR FOR` / `FETCH n`），MSSQL 不可用 → EXPORT 群組 spy `cursorRows` 改以 `manager.query` 執行**真實 buildExportQuery 產出之 SQL**（CONVERT 對真 datetime2 運算）並回 `Readable.from(rows)`；`exportResult` / `formatRow` / CSV·xlsx streaming 皆為真實生產路徑，僅替換 engine-specific streaming plumbing。`writeAudit` 於未帶 actorId 時早退，故 runRepo 以 stub（completed run）即可、無需 audit repo。
- **AD-P5FU-3（APLFMT 對真 dbo baseline 表 seed）**：buildExportQuery 表名為裸名（生產碼不可改），連線池 raw query 預設 schema=dbo → 必解析到已部署 baseline 表；且 baseline `run_id` 為 uniqueidentifier。故依任務指示「自建 probe 列 + 前綴 DELETE，不 DROP/TRUNCATE baseline」：對真實 dbo baseline 表 seed 一組 valid-GUID run + P5FU 前綴列（appl_date 為原生 datetime2 邊界值），跑真實 buildExportQuery（`WHERE run_id=@guid` 隔離），afterAll 精準 DELETE（含 FK 母表 assignment_run）。appl_date 為 baseline 原生 datetime2 → CONVERT 對真實日期型別運算、非字串短路。

---

## 偏差（deviation）

- **無材料性偏差**。修法嚴限於顯示層（cr_nm 型別 + appl_date 匯出 SELECT 運算式），引擎/計分/CR/分派凍結。
- **harness 隔離手法差異（記錄）**：CRNM 用專屬 schema `p5fu` + synchronize entity（驗真實 entity 型別）；APLFMT 用 dbo baseline + GUID/前綴（因 buildExportQuery 裸名必落 dbo）。二者皆自建/自清、不 DROP/TRUNCATE baseline。實測過程於 harness 抓到並修正「連線池不同 pooled connection 預設 schema 非決定性 → 裸表名落回 dbo」之測試陷阱（WRITEPATH 表名改為 `${SCHEMA}.` 完整限定；生產執行器走 entity default schema 無此問題）。
- **3 項環境性 skip**（p1b2 / PARAM-016 / PG to_char）已於上「測試結果摘要」逐項說明替代佐證，非本 slice 回歸、未掩飾。

---

## 驗收對照

- 真 mssql（dev CDMP）實測：cr_nm 長中文 round-trip（45 字/27 字皆不截斷）✅、appl_date CONVERT 邊界（16:00 → 2026-07-01）✅、buildExportQuery 執行 ✅、exportResult csv/xlsx 進件日 = 2026/07/01 ✅。
- `tsc --noEmit -p tsconfig.build.json`：✅ EXIT 0。
- pg/sqlite 零回歸：✅（sqlite f064 46 + f108 37 + report 25 + 重度消費 114 全綠；PG to_char 分支靜態+等價論證，本機無 postgres-test 故 live skip）。
- 既有 f064/f108 匯出測試 + APLDATE-002 sliceFn 靜態：✅ 不破。
- p1b2 parity：構造保證 + SCHEMA-001/004 分別實證（live 因 CDMPT 登入 pre-existing 限制 skip）。
