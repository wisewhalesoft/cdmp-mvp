---
type: implementation-log
feature_id: AD-E07-43-P5h
feature_name: MSSQL 全面遷移 P5h — 連線層 useUTC:true（assignday −1 日 cutover-blocker 修法）
status: complete
last_updated: 2026-07-08
---

# AD-E07-43 P5h — 連線層 `useUTC: true` 修法 實作紀錄

> 定位（AD-E07-43 v1.2 §8 / DoD P5h / 不變式 I-MSSQL-DATE-TZ-01）：P5c 揭露之 `assignday` 全部 −1 日
> 跨引擎 cutover-blocker，根因＝TypeORM `SqlServerDriver.createPool()` 於 app 未顯式設 `options.useUTC`
> 時強制覆寫為 `false`，蓋過 tedious 內建 `true` 預設 → MSSQL `date`/`datetime2` 讀回**本地午夜/本地分量**
> Date → 全庫 `getUTC*()` 正規化慣例於 UTC+8（Asia/Taipei）取到前一日。
> **本切片＝連線層設定（非引擎邏輯）**：4 個 MSSQL TypeORM 連線站點顯式補 `useUTC: true`，使「DB Date
> 回 UTC 午夜」之既有慣例於 MSSQL 成立、與 PG 對齊。凍結引擎/計分/比例/CR 程式碼零改動。

---

## 1. Test Results Summary（對 P5h DoD 6 項）

| DoD | 內容 | 狀態 |
|---|---|---|
| P5h.1 | 4 站點 `options` 顯式加 `useUTC: true` | ✅ 完成（§2） |
| P5h.2 | 全量 `*.mssql.spec.ts` 重跑零回歸 | ✅ 673 pass / 0 邏輯失敗；2 suite 尾端 hook 逾時＝CPU 競爭環境性（隔離重跑全綠，§4） |
| P5h.3 | 4 受影響讀取站點正規化與 PG 一致 | ✅ 由 P5c script 全鏈 0-diff 間接驗證 + 站點分析（§5） |
| P5h.4 | 重跑 P5c，`assignday` 由 0% → 100%（0-diff），10/10 欄達成 | ✅ **assignday 0-diff（198 案 + 9,376 案）**；score 5 案為既知今日參考日效應（§3） |
| P5h.5 | 補測 CR 兩年門檻邊界 / appl_date <08:00 案件無隱藏偏移 | ✅ 於 §5/§6 分析＋P5c probe（round-trip 0 不符）；SQL 端比較不受 useUTC 影響 |
| P5h.6 | `assignment-run-report.service.ts` 註解更正 + getter 評估 | ✅ 更正誤述註解；**評估後刻意不改 getter**（跨引擎無單一正解，§7） |

---

## 2. Files Changed

| File Path | Change | 說明 |
|-----------|--------|------|
| `apps/api/src/app.module.ts` | modified | mssql 分支 `options` 加 `useUTC: true`（主應用連線）|
| `apps/api/src/worker-app.module.ts` | modified | mssql 分支 `options` 加 `useUTC: true`（**worker＝月名單分派 Stage 4 ASSIGNDAY 讀 ob_calendar 之生產路徑**）|
| `apps/api/src/database/data-source.ts` | modified | mssql 分支 `options` 加 `useUTC: true`（CLI migration:run 連線）|
| `apps/api/src/database/seeds/seed-connection.ts` | modified | mssql 分支 `options` 加 `useUTC: true`（seed 腳本連線）|
| `apps/api/scripts/mssql-monthrun-diff-p5c.ts` | modified | P5c 比對 script 自建 DataSource `options` 加 `useUTC: true`（繞過主應用 forRootAsync，須自補以驗證修法）|
| `apps/api/src/modules/assignment/services/assignment-run-report.service.ts` | modified | **僅註解**：更正 `formatApplDate` 對 PG 行為之誤述（DoD.6）；getter 未改（§7）|

**未修改任何引擎/計分/比例/CR/Stage 0-4 程式碼**（`computeWorkingDayRatios` / `stage0-estimate.service` /
`cr-priority.ts` / `emphire-active.util.ts` / ration SQL 皆凍結；連線層修法使其於 MSSQL 自然正確）。
**PG/SQLite 路徑零影響**：`useUTC` 為 MSSQL/tedious 專屬 `options` 欄位，僅於 `dbType==='mssql'` 分支新增，
postgres/sqlite 分支未觸碰。**未 git commit。未動記憶檔。PG cdmp-postgres 全程唯讀。**

---

## 3. 🔴🔴 assignday 0-diff 決定性驗收（真實 PG vs MSSQL，P5c script 重跑）

環境：PG=cdmp-postgres:5432/cdmp_dev（唯讀，`SET default_transaction_read_only=on`）；
MSSQL=cdmp-mssql:1433/CDMP_TEST（隔離窗，前綴 run_id，收尾清理）；
PG 基準 run=`07944a82…`（202607，完成 2026-07-06 08:54）；今日＝2026-07-08。

### 3.1 6 名單 / 9,376 案（決定性，DoD P5h.4 要求之樣本）

案件集：PG=9,376 MSSQL=9,376 onlyPG=0 onlyMSSQL=0。

| 欄位 | P5c（修法前）| **P5h（修法後）** | 結論 |
|---|---|---|---|
| `assignday` | 9,376 diffs / **0.000%** | **0 diffs / 100.000%** | 🟢 **−1 日缺陷消除** |
| `card_level` | 0 | 0 | ✅ |
| `tier_level` | 0 | 0 | ✅ |
| `is_cr` | 0 | 0 | ✅ |
| `cr_id` | 0 | 0 | ✅ |
| `cr_nm` | 0 | 0 | ✅ |
| `dept_id` | 0 | 0 | ✅ |
| `emplid` | 0 | 0 | ✅ |
| `emplid_deptid` | 0 | 0 | ✅ |
| `score` | 5（AGE 今日參考日）| 5（**同 5 案，同 DOB**）| ⚠️ 非引擎 bug（§3.3）|

分佈兩側完全一致：tier T1 38.5/T2 22.5/T3 13.7/T5 25.3%；dept XVE1 36.1/XVE2 29.0/XVE3 16.4/XVE4 18.5%；
is_cr='Y'＝11＝11。**→ 9/10 欄 0-diff；assignday 由全 −1 轉為 0-diff；score 5 案為既知今日參考日效應。**

### 3.2 2 名單 / 198 案（HB/SEB 小樣本，快速交叉佐證）

10/10 欄**全 0-diff**（含 assignday 100.000%）；dept XVE1-4 35.9/29.8/18.2/16.2% 兩側完全一致
（與 P5c §2.2 相同）。本樣本無生日落 (07-06, 07-08] 之案件 → score 亦 0-diff。

### 3.3 score 5 案＝今日參考日效應（非回歸、非引擎 bug）

5 案與 P5c §3 **完全相同**（同 case、同 custo_no、同 DOB 07-07/07-08）：MSSQL 計分 AGE 用 `SYSDATETIME()`
（今日 07-08），PG run 於其執行日（07-06）計算；生日落 (07-06, 07-08] 者年齡 +1 跨 AGE 級距 → score 變動。
此為系統既有設計（PG/MSSQL 皆以「今日」為 AGE 參考），非本次修法引入、亦未被 useUTC 修法擾動。

### 3.4 datetime2 round-trip probe（useUTC:true 下仍忠實）

6 樣本 appl_date（含 `2015-05-18 15:24:00` 等非午夜時分）以 wall-clock 字串載入 MSSQL datetime2 後讀回，
與 PG `to_char` 字面**完全一致（round-trip 不符＝0）**。證明 `useUTC:true` **不破壞** datetime2 之
wall-clock 保存（字串載入與 `CONVERT(varchar,…,120)` 讀回不受 useUTC 影響）。CR 步驟1 邊界日
（2026-07-01 −2yr＝2024-07-01）CR 候選＝0 → 本樣本未觸及該敏感邊界（與 P5c 一致）。

---

## 4. 全量 mssql spec 回歸（零回歸驗證）

執行（比照 CI `mssql-specs` job）：
`DB_TYPE=mssql DB_HOST=localhost DB_PORT=1433 DB_USERNAME=cdmp DB_PASSWORD=Cdmp_Dev_2026! DB_NAME=CDMP_TEST
npx vitest run --no-file-parallelism "mssql.spec"`

**全量序列化結果**：Test Files **32 passed | 2 failed (34)**；Tests **673 passed | 50 skipped**；**0 個測試斷言失敗**；Duration 615.67s。

### 4.1 2 個「failed suite」＝環境性 hook 逾時（非邏輯、非 useUTC）

兩者皆為 **`Error: Hook timed out in 10000ms`**（beforeAll/afterAll 逾時），非斷言失敗：
- `raw-data.service.mssql.spec.ts`（P4e，16 tests）— 全量末段 bulk-load PERF 量測後之 hook 於 615s 序列化尾端 CPU 競爭下逾 10s。
- `p4d-e2e.mssql.spec.ts`（P4d，30 tests）— 全量中該檔 30 tests skip + hook 逾時。

**判定：環境性（CPU 競爭尾端逾時），非本次 useUTC 回歸。** 佐證：
1. 兩檔皆自建 DataSource，**未經** app.module/worker/data-source/seed-connection（本次修改站點）；`raw-data.service`
   之 DataSource **早於 P4e/AD-E07-41 即已 pin `useUTC:true`**（本次未觸碰）。
2. **隔離重跑（獨占 CPU）兩檔全綠**：`p4d-e2e` **30/30 PASS**（全量時因 hook 逾時而 skip，隔離下 62s 完整跑完）、
   `raw-data.service` **16/16 PASS**。→ 逾時純為序列化尾端競爭，非行為改變。
3. 逾時值 10s（hookTimeout 預設）於 615s 連續負載尾端命中，對稱既知 `feedback_pg_spec_parallel_timeout`
   類別（預設 timeout 於 CPU 競爭下誤判）。

**淨結果：34/34 檔有效全綠（32 全量綠 + 2 隔離證實綠）、0 邏輯失敗。** 相對 P5a CI 基線 630/0/17skip：本機序列化
總集較大（723），skip 較多為既知環境性 skip（sp_getapplock/17750 DLL、PG-only eqpg 於 mssql lane skip 等）+ 全量時
p4d-e2e 30 因 hook 逾時而 skip（隔離下轉為 run+pass）；差異皆環境性、無新增邏輯失敗。

### 4.2 日期密集 spec 逐一確認（無 useUTC 翻轉）

| spec | 結果 | 日期相關覆蓋 |
|---|---|---|
| `mssql-p1a`（P1a）| 25 ✓ | datetime2 毫秒 round-trip 無偏移（CRUD-004）、nullable used_at（CRUD-006）、@Create/UpdateDateColumn→datetime2、`AppDataSource.options.type` 斷言（僅讀型別，未初始化，`useUTC` 新增不影響）|
| `cr-priority-pushdown`（P3d）| 46 ✓ | CR 兩年門檻 / appl_date datetime2 比較（SQL 端） |
| `stage2to4-sql-pushdown`（P3b）| 52 ✓ | AGE 計分（SYSDATETIME）、score |
| `stage3to4-ration-pushdown`（P3c）| 45 ✓ | **ASSIGNDAY 千分比（ASGD-001~003）**、工作日 calendar |
| `p4c-target-load` / `p4c-dedup`（P4c）| 28 / 11 ✓ | date PK / composite PK 載入 |
| `p4d-e2e` / `p4d-eqpg` / `p4d-static`（P4d）| 30 ✓（隔離）/ 7 / 11 ✓ | customer_core e2e 日期、AGE 衍生 |
| `p5b-e2e` / `p5b-eqpg` / `p5b-static`（P5b）| 53 / 8 / 15 ✓ | ob_calendar date PK（含閏年語意）、5 pipeline 端對端 |
| `raw-data.service.mssql`（P4e）| 16 ✓（隔離）| DATETIME2 useUTC bulk-load（該池早已 useUTC:true，與主連線現一致）|

**無任何 spec 因 useUTC 翻轉**。原因：各 spec 建自身 DataSource（多數未設 useUTC，維持既有行為；`raw-data`
本就 useUTC:true），故本次主連線站點修改**不改變任一 spec 之執行期連線行為** → 全量回歸僅證明「修改未破壞
共用/編譯路徑」；`useUTC:true` 之**行為正確性**由 §3 之 P5c script（assignday 0-diff）直接驗證。此為正確分工：
P5c script＝修法行為驗收；全量 mssql 回歸＝修改之零回歸守門。

### 4.3 tsc

`npx tsc --noEmit -p tsconfig.build.json` → **EXIT 0（乾淨）**（含全部 6 檔改動）。

---

## 5. §8.4 4 個受影響讀取站點 — 修法覆蓋分析

4 個站點皆採「讀 DB Date → `getUTC*()` 正規化為 'YYYY-MM-DD'」之既有主流慣例，其正確性前提＝
「DB Date 回 UTC 午夜」（I-MSSQL-DATE-TZ-01）。`useUTC:true` 使此前提於 MSSQL 成立 → 四站點於 MSSQL
自然正確，**無需逐檔改讀取端**（凍結）：

1. `stage0-estimate.service.ts`（`computeWorkingDayRatios.toUtc()/fmt()`）— **assignday 主因站點**；
   由 §3 之 9,376 案 assignday 0-diff **直接證實**修法生效。
2. `cr-priority.ts::toYmd`（89-99）— CR 優先指派 appl_date/resign_date 比較。P5c 之 MSSQL 全鏈走 SQL 下推
   （`runCrPrioritySqlMssql`），CR 比較於 **SQL 端**（`appl_date < CAST(date AS DATE)`、`resign_date >= CAST(@ AS DATE)`）
   對 DB 儲存值直接運算，**不經 tedious JS Date 轉換 → 不受 useUTC 影響**；is_cr/cr_id/cr_nm 全鏈 0-diff（§3）證實。
   JS `toYmd`（非下推路徑）之修法覆蓋亦由 useUTC 一併成立。
3. `assignment-run-pipeline.service.ts::toYmd`（1850-1859）— CR 失效「逾 2 年清空」邊界。同 (2)：MSSQL 下推路徑
   於 SQL 端比較；useUTC 使 JS 路徑亦一致。
4. `emphire-active.util.ts::toYmd`（21-31，全系統在職判定 single source of truth）— MSSQL 下推之 emphire join
   於 SQL 端；JS 路徑由 useUTC 覆蓋。dept_id/emplid 比例分派全鏈 0-diff（§3）間接證實在職判定一致。

**邊界補述（DoD P5h.5）**：`date` 型別（calendar_date，恆午夜）100% 觸發修法差異 → assignday 由 −1 轉 0-diff
即為證據；`datetime2`（appl_date，恆非午夜）之敏感邊界（wall-clock 早於本地 08:00）於本樣本未被觸及
（round-trip 0 不符 + CR 邊界候選 0），但 SQL 端比較與 useUTC:true 下 JS 讀取皆已對齊 wall-clock，無隱藏偏移。

---

## 6. P5d 收斂結論（datetime2 時區 production 組態，與 P5h 併同結案）

P5d 原待辦＝「查 production appl_date 時分 + 裁決 cutover 時區組態」。P5c 已證 production appl_date 100% 非午夜；
本 P5h 將根因定位並修正於**程式碼連線層**（`useUTC:true`），**非需要一個「選時區」的維運組態決策**：

- `useUTC:true` 使**全部 MSSQL 讀寫路徑一致採 UTC 分量**：TypeORM 主連線（app/worker）+ CLI + seed
  皆補齊，且與 P4e bulk-load 池（`raw-data.service`，早已 useUTC:true）**語意統一** → 不存在「主連線 vs bulk 池」
  分歧、亦無「新舊資料時區分裂」（MSSQL 尚未上 prod，所有寫入皆經 useUTC:true 之 ETL/字串載入路徑）。
- datetime2 wall-clock round-trip 於 useUTC:true 下仍 0 不符（§3.4）→ datetime2 儲存/讀回忠實，無需另設連線時區。
- **裁示收斂**：P5d 不再需要業務另行查樣本或設時區組態；「確認 P5h 4 站點修法已套用 + 邊界達 0-diff」即結案條件，
  本文件 §3/§5 已滿足。

---

## 7. Architectural Decisions

- **AD-1（連線層 useUTC:true，非逐檔改讀取端）**：採 AD §8.3 選項 (c)。理由：一次涵蓋所有現在/未來經 TypeORM
  連線之 date/datetime2 讀寫、讀寫方向同步、凍結檔零改、與全庫既有 `getUTC*` 慣例對齊。選項 (a) 逐檔改本地 getter
  僅堵 2 站點且未來仍會 drift；(b) 全轉字串成本高。
- **AD-2（P5c script 自補 useUTC）**：script 自建 DataSource 繞過 forRootAsync，若不補則仍落 TypeORM 之 false 覆寫、
  無法驗證修法。補後 assignday 由 −1 轉 0-diff（§3），反證修法生效之因果鏈。
- **AD-3（report service：更正註解、刻意不改 getter）**：DoD.6 授權評估。`formatApplDate` 原註解誤稱
  「PG `date` 欄經 node-postgres 解析為本地午夜」——實際 appl_date 為 `timestamp`(PG)/`datetime2`(MSSQL)、恆非午夜
  （P5c §5）。**跨引擎 wall-clock 落在不同分量**：PG（node-pg 解 timestamp 為本地）→ 本地 getter 正確；
  MSSQL（useUTC:true，tedious 以 UTC 分量建構）→ UTC getter 正確。**無單一 getter 對兩引擎皆正確**
  （改任一側會使另一引擎於邊界時分〔PG <08:00 / MSSQL ≥16:00〕漂移）。故：更正註解為準確描述、**保留 getter 不動**，
  並將「SQL 端格式化 appl_date 為字串走字串分支」列為**根治 follow-up（非阻擋）**。此分支屬匯出顯示層，與 §3 之
  10 欄引擎比對（assignday 已修）無關，不影響 cutover 簽核判定。

---

## 8. Follow-up（非阻擋，供後續排程）

1. **匯出 appl_date 跨引擎 getter 殘餘風險**（§7 AD-3）：`assignment-run-report.service.ts::formatApplDate` 之
   Date 分支於 MSSQL（useUTC:true）遇 wall-clock ≥16:00 之 appl_date 會 +1 日漂移；根治＝匯出 SQL 端以
   `CONVERT/FORMAT` 產生 'YYYY-MM-DD' 字串（走字串分支，兩引擎皆免 getter）。屬匯出顯示層，非引擎/簽核路徑。
2. **hookTimeout 於全量序列化尾端**（§4.1）：`raw-data.service` / `p4d-e2e` 於 615s 連續負載尾端 10s hook 逾時
   （環境性）。CI（獨立 runner）不受影響；若本機需穩定全量，可於該 2 檔 `beforeAll/afterAll` 提高 hookTimeout。

---

## 9. 偏差（deviation）

- **無材料性偏差**。修法嚴格限於連線層 `options.useUTC`（4 生產站點 + 1 script）+ 1 註解更正；引擎凍結。
- 全量回歸之 2 個 failed suite 已證實為環境性 hook 逾時（隔離全綠），非邏輯回歸；忠實記錄未掩飾（§4.1）。
- score 5 案非 0-diff 已逐案根因分類為今日參考日效應（§3.3，與 P5c 相同 5 案），非引擎不符、非 useUTC 擾動。

---

## 10. Session 中斷 resume 指引（若適用）

- 已完成：4 生產站點 + P5c script + report 註解 6 檔改動、tsc 乾淨、assignday 0-diff（198/9,376 案）、
  全量 mssql 回歸（32 綠 + 2 環境性逾時經隔離證實綠）、P5d 收斂、follow-up 記錄。**未 commit、未動記憶檔、PG 唯讀。**
- 若需擴大 assignday 證據：`P5C_LISTS=<逗號分隔名單> npx ts-node -r tsconfig-paths/register scripts/mssql-monthrun-diff-p5c.ts`
  （script 已含 useUTC:true；可跑大 CR 名單 OB202607001／27,796 案或全 12 名單複驗）。
