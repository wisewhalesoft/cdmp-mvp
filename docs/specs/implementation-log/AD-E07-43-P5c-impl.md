---
type: implementation-log
feature_id: AD-E07-43-P5c
feature_name: MSSQL 全面遷移 P5c — MONTHRUN-DIFF 真實完整月名單分派跨引擎逐列比對（F067 式簽核之技術底稿）
status: complete
last_updated: 2026-07-08
---

# AD-E07-43 P5c — MONTHRUN-DIFF 真實 PG vs MSSQL 逐列比對 實作紀錄

> 本文件為 **P5e F067 式業務簽核報告之技術附件**（非報告本體），亦是 **I-MSSQL-SIGNOFF-GATE-01** 條件 (a)
> 之直接證據來源。定調（AD §3.1）：manual/script，比照 F101/F102/F104 前例（觸發真實月名單分派鏈路、SQL 直接
> 查表比對、輸出人工可讀差異記錄），**非新 CI 測試套件**。
>
> **🔴🔴 方法論升級（相對於 test-spec 撰寫時之環境假設）**：test-spec AD-E07-43-P5c-test.md 撰寫時
> `postgres-test`(5433) 不可達，故裁定 Tier 1（JS oracle 代理）為主要可行路徑、真實 PG（Tier 2）為 degradable
> 加強。**本輪實作時 dev PG（localhost:5432 / cdmp_dev）唯讀可達且存有真實生產月名單分派結果**，故直接執行 Tier 2
> ——**真實 PG run 逐列比對**，取代 JS oracle 代理。此使 **I-MSSQL-SIGNOFF-GATE-01 條文字面「PG/MSSQL 結果
> 一致」可被字面滿足**（非僅 JS 代理），大幅強於 test-spec §0.2 GATE-002 所憂慮之 proxy 性質。

---

## 1. 方法論（真實 PG run 唯讀 + 案件集釘選 + Approach A）

### 1.1 比對基準

| 項目 | 值 |
|---|---|
| PG 生產月名單分派 run | `07944a82-cc59-4d30-bda5-f9a873cba197`（`project_workym=202607`，完成於 2026-07-06 09:00） |
| PG run 規模 | 115,197 案 / 12 名單（含案件之 13 名單定義，1 名單 0 案）|
| pool 覆蓋率 | 現行 PG `ob_pool_data` **100% 覆蓋**該 run 案件集（115,197 / 115,197）→ 無 pool 輸入漂移 |
| MSSQL 隔離窗 | `CDMP_TEST` dbo（SQL Server 2022，`Chinese_Taiwan_Stroke_BIN`），前綴 `run_id=a5c00000-…-05c1`，收尾清理 |
| PG 存取 | **全程唯讀**（`SET default_transaction_read_only=on` 保險；僅 `SELECT`）|

（另評估 84486ddd/202606：pool 覆蓋 75,983/77,208 = 98.4%，有 1.6% 輸入漂移 → 不選。）

### 1.2 Approach A — 案件集釘選 PG 輸出，隔離 Stage 2~4/CR 引擎

比對標的收斂於 **Stage 2~4/CR 全鏈組合**（test-spec §0.8：Stage 1 選案正確性已由 P3a 窮盡驗證，非本文件範圍）。
故釘選 PG run 之案件集，避免 Stage 1 選案漂移污染診斷。四步：

1. **唯讀擷取** PG run 之 `ob_monthly_run_result`（＝案件集＋每列預期 10 欄）＋輸入表
   （`ob_pool_data`/`customer_core`/`ob_arreturndf_min_cap`/`ob_emphire`/`ob_dept_pct`/`ob_empl_set`/
   `ob_calendar`/`ob_list_definition`/計分卡 config 6 表）。
2. **複製輸入至 MSSQL 隔離窗**（前綴 run_id；收尾清理；varchar byte 溢位之顯示欄 byte-aware 截斷，見 §6）。
3. **重建 Stage 1 seed 列**：釘選 PG 案件集之 (list_no, orgno, appl_no, custo_no, settle_src, appl_date)，
   並依 `stage1-sql-executor.ts:96-107` **逐字複刻 CR 來源規則**填初始 `cr_id`/`cr_nm`/`is_cr`：
   `cr_id = 在職 ob_emphire(id_no = ob_pool_data.agent_id).emp_id`（在職＝`resign_date IS NULL OR >= 名單月首日`），
   `cr_nm = 'CR' + emp_nm`，`is_cr='N'` 初始。（active emphire 有 1 個重複 id_no → `ROW_NUMBER` 去重取 MIN(emp_id)
   決定性；PG 案件集實際 1:1，去重不改結果。）
4. **跑真實生產碼** `AssignmentRunPipelineService.executeStage2to3PushdownMssql`（未修改；經 `Object.create` +
   私有方法存取取得實例，沿用 F104 pg spec 手法），內含 P3b 計分 → `clearStage3Fields` → P3d
   `runCrPrioritySqlMssql` → P3c `runStage3to4RationSqlMssql` **全 4 步 MSSQL 下推**。
5. **逐列比對** MSSQL 輸出 vs PG run 輸出（10 欄，鍵 = (list_no, orgno, appl_no)）。

### 1.3 🔴 時區安全（關鍵前置修正）

node-postgres 預設把 `timestamp`/`date` 解析為「本機時區 JS Date」，經 tedious 寫入 MSSQL `datetime2`/`date`
會位移 8 小時（Asia/Taipei）→ 破壞 appl_date/日期欄。修法：**覆寫 pg typeParser（OID 1082/1114/1184/1083/1266）
讓 temporal 欄回傳原字面 wall-clock 字串**，以字串插入 MSSQL → 零位移、忠實保存 wall-clock。此亦使 datetime2
probe（§5）之 round-trip 0 不符成立。

---

## 2. 🔴🔴 10 欄逐列 diff 結果（真實 PG vs MSSQL）

### 2.1 主樣本：6 名單 / 9,376 案（涵蓋 card HB/SEB/HC/SEC/S5/HM、tier T1/T2/T3/T5、CR、4 部門、78 員工）

案件集：PG=9,376　MSSQL=9,376　**onlyPG=0 / onlyMSSQL=0**（案件集完全相同）。

| 欄位 | diffs | 一致率 | 結論 |
|---|---|---|---|
| `card_level` | **0** | 100.000% | ✅ 逐列相同 |
| `tier_level` | **0** | 100.000% | ✅ 逐列相同（分佈 T1 38.5/T2 22.5/T3 13.7/T5 25.3% 兩側一致）|
| `is_cr` | **0** | 100.000% | ✅（is_cr='Y'：PG=11 = MSSQL 11）|
| `cr_id` | **0** | 100.000% | ✅ CR 前置指派逐列相同 |
| `cr_nm` | **0** | 100.000% | ✅ |
| `dept_id` | **0** | 100.000% | ✅ 比例分派逐列相同（XVE1 36.1/XVE2 29.0/XVE3 16.4/XVE4 18.5% 兩側一致）|
| `emplid` | **0** | 100.000% | ✅ |
| `emplid_deptid` | **0** | 100.000% | ✅ |
| `custo_no`(鍵) | **0** | — | ✅ 無漂移 |
| `score` | **5** | 99.947% | ⚠️ 5 案，**全屬 AGE 今日參考日漂移**（見 §3，非引擎不符）|
| `assignday` | **9,376** | 0.000% | 🔴 **全部 −1 日**，跨引擎缺陷（見 §4，cutover-blocker，report-not-fix）|

**→ 8/10 欄完全 0-diff（含 CR 三欄與比例分派三欄全鏈）；score 唯一差異為今日參考日效應；assignday 為
單一 date 正規化缺陷。**

### 2.2 輔助小樣本：2 名單 / 198 案（OB202607012 HB + OB202607013 SEB）

9/10 欄 0-diff（僅 assignday −1 日）；dept 分佈 XVE1-4 35.9/29.8/18.2/16.2% 兩側完全一致。

### 2.3 大 CR 名單：OB202607001（H 卡，27,796 案，PG is_cr='Y'=1,996）— 🔴 CR 全鏈強化證據

案件集：PG=27,796　MSSQL=27,796　**onlyPG=0 / onlyMSSQL=0**。Stage 1 seed 初始 CR 候選（cr_id IS NOT NULL）
= **3,638**，經 P3d CR 前置 4 步（步驟1 逾2年清空 → 步驟2 離職清空 → 步驟3 優先指派 → is_cr='Y'）後
→ 最終 is_cr='Y' = **1,996，與 PG 完全一致**。

| 欄位 | diffs | 一致率 | 欄位 | diffs | 一致率 |
|---|---|---|---|---|---|
| `score` | **0** | 100.000% | `dept_id` | **0** | 100.000% |
| `card_level` | **0** | 100.000% | `emplid` | **0** | 100.000% |
| `tier_level` | **0** | 100.000% | `emplid_deptid` | **0** | 100.000% |
| `is_cr` | **0** | 100.000% | `cr_id` | **0** | 100.000% |
| `cr_nm` | **0** | 100.000% | `assignday` | 27,796 | 0.000%（−1 日）|

**→ 9/10 欄完全 0-diff（含 score 本名單 0 差異）；CR 三欄逐列相同、1,996 CR 案 emplid(=cr_id) 逐列相同。**
分佈兩側完全一致：tier（T1 67.7/T2 22.8/T3 9.5%）、card（A 67.7/B 22.8/C 9.4/D 0.1%）、
dept（XVE1 34.2/XVE2 33.0/XVE3 15.2/XVE4 17.6%）、is_cr='Y'（1,996）。

> 本名單 score **0 差異**（相對 §2.1 之 5 案）：本名單案件中無客戶生日落在 (07-06, 07-08] 且跨 AGE 級距者
> → 進一步佐證 §3「score 差異純為今日參考日效應、非引擎不符」（不同名單之差異數依其客戶生日分佈而定）。

### 2.4 綜合（三樣本，真實 PG vs MSSQL）

| 樣本 | 案數 | 0-diff 欄 | score | assignday | CR 驗證 |
|---|---|---|---|---|---|
| 2 名單（HB/SEB） | 198 | 9/10 | 0 | −1 全 | 0 CR |
| 6 名單（HB/SEB/HC/SEC/S5/HM） | 9,376 | 8/10 | 5（AGE 漂移）| −1 全 | 11 CR 0-diff |
| 大 CR 名單（H, OB202607001） | 27,796 | **9/10** | **0** | −1 全 | **1,996 CR 0-diff** |

**跨三樣本一致結論**：除 `assignday`（單一 date 正規化缺陷）與 score 之今日參考日效應（5 案，非 bug）外，
**Stage 2~4 計分/CR/比例分派全鏈 PG≡MSSQL 逐列等價**。

---

## 3. score 5-diff 根因分類（🔴 關乎簽核結論）

**假設**＝AGE 今日參考日漂移：MSSQL 計分 AGE 用 `SYSDATETIME()`（今日 2026-07-08），PG run 於其執行日
（2026-07-06）計算；兩日之間生日者年齡 +1 → 跨 AGE 計分級距 → score 變動。

**逐案查證（5/5 全部符合假設）**：

| case (orgno+appl_no) | custo_no | dob | PG score | MSSQL score | 判定 |
|---|---|---|---|---|---|
| 02 C107110162 | V120325801 | **1964-07-08** | 192 | 188 | 生日 07-08 ∈ (07-06, 07-08] → 年齡 +1 跨級距 |
| 02 C109031059 | F222198810 | **1964-07-08** | 181 | 177 | 同上 |
| 02 C924071083 | Q124360132 | **2000-07-08** | 153 | 157 | 同上 |
| 02 F124120047 | R122744471 | **1978-07-08** | 205 | 200 | 同上 |
| 02 F724090029 | F130776639 | **2000-07-07** | 177 | 181 | 生日 07-07 ∈ (07-06, 07-08] → 年齡 +1 跨級距 |

**結論**：**5/5 全部**為 AGE 今日參考日漂移——5 名客戶生日（07-07 或 07-08）恰落在 PG run 日（07-06）與
本輪重現日（07-08）之間，年齡 +1 跨越計分 AGE 級距。**score 計分邏輯 PG≡MSSQL 等價；此 5 案差異是「今日
參考日」之預期確定性效果（若於 PG run 同一日 2026-07-06 重現則為 0-diff），非引擎邏輯 bug**。此對稱 P3b
AGESCORE-META-001（MSSQL AGE 用 `SYSDATETIME()`）之既有驗證。**無任何一案屬引擎邏輯不符。**

> 註：AGE 以「今日」為參考本身是既有設計（PG/MSSQL 皆然），故同一份輸入於不同日重跑本就可能因跨生日而
> score 微變——此為系統既有性質，非本次遷移引入。

---

## 4. 🔴🔴 assignday 全部 −1 日（真實跨引擎缺陷，cutover-blocker，report-not-fix）

### 4.1 現象

MSSQL 全鏈之 `assignday` 相對 PG **系統性早一日**（PG=2026-07-01 → MSSQL=2026-06-30；PG=2026-07-31 →
MSSQL=2026-07-30；…全 9,376 案一致 −1 日）。`dept_id`/`emplid` 分派**正確 0-diff**（分派本身正確，僅日期
標籤 −1）。

### 4.2 根因鏈（實測佐證）

1. `ob_calendar.calendar_date` 為 `date` 欄。**tedious（MSSQL 驅動）把 `date` `2026-07-01` 回傳為 JS Date
   `2026-06-30T16:00:00.000Z`**——即以 **Asia/Taipei 本地午夜**（2026-07-01T00:00+08:00）建構 Date（實測：
   `getUTCDate()=30`、`getDate()(local)=1`、`getTimezoneOffset()=-480`）。
2. `computeWorkingDayRatios.toUtc()`（`stage0-estimate.service.ts:207-212`）以
   **`Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())`** 正規化 → 對本地午夜 Date 取到
   **前一日（06-30）**。同理 `fmt()` 用 `getUTCDate()` 輸出。
3. node-postgres 對 `date` 預設回傳 **UTC 午夜** Date（`2026-07-01T00:00:00Z`），`getUTCDate()=1` 正確，
   故 **PG 端無此偏移**。
4. `computeWorkingDayRatios` 之工作日**集合大小/比例不變**（每日均勻 −1 標籤），故 `dept_id`/`emplid` 分派
   0-diff、僅 `assignday` **日期字串** 整體 −1。

### 4.3 影響面

- **月名單分派 Stage 4 ASSIGNDAY**（`loadWorkingDayRatios` → `computeWorkingDayRatios` → `distributeStage3to4` /
  `runStage3to4RationSqlMssql`）：**於 UTC+ 時區（如 Asia/Taipei）之 MSSQL 部署，每案分派日全早一天**。
- **Stage 0 每日負荷試算**（`calculateDailyEstimate` / `toUtcDate` / `formatDate`，同 `getUTC*` 模式）：
  日期標籤同樣 −1，逐日部門投影錯位。
- 時區相依：若 MSSQL worker 程序執行於 **UTC** 時區，tedious 之本地午夜＝UTC 午夜 → 無偏移；於 **UTC+**
  時區則 −1。本專案為台灣銀行業（Asia/Taipei），生產程序時區極可能為 UTC+8 → **高風險命中**。

### 4.4 建議修法（凍結檔不改，另路由 architect）

擇一（皆兩引擎對稱、低成本）：
1. **`computeWorkingDayRatios.toUtc()` / `stage0-estimate.service.toUtcDate()` 日期正規化改用本地分量**
   （當驅動回傳「代表某日曆日之 Date」時，用 `getFullYear/getMonth/getDate` 而非 `getUTC*`），或統一在讀取端
   把 `calendar_date` 轉為 `'YYYY-MM-DD'` 字串再處理（本專案 `calculateDailyEstimate` 之 `Between(startYmd,endYmd)`
   已有「以字串為界避免 ±1」先例，可延伸至 casedt 計算）。
2. **tedious 連線層統一 `date` 解析**（如設定連線時區/`useUTC`，或自訂 type parser 回傳字串），使 MSSQL `date`
   與 PG 一致回 UTC 午夜。
3. 於 `ObCalendar` entity 之 `calendar_date` 讀取路徑加 driver 感知正規化 helper（比照既有
   `feedback_typeorm_between_timezone` 記憶之教訓）。

**本輪處置**：依 test-spec「凍結生產碼、report-not-fix」原則，**不修改** `stage0-estimate.service.ts` /
`assignment-run-pipeline.service.ts` / ration SQL；忠實記錄，交 system-architect 裁定修法。**此為 P5c 揭露之
最重要發現，屬 cutover 前必修之真實跨引擎缺陷（非 test 環境 artifact——根因在生產讀取路徑）。**

---

## 5. datetime2 邊界 probe（appl_date）

- **appl_date wall-clock round-trip = 0 不符**：6 樣本（`2015-05-18 15:24:00` 等含非午夜時分）以字串載入
  MSSQL `datetime2` 後讀回，與 PG `to_char` 字面完全一致 → 以 wall-clock 字串載入時 datetime2 忠實保存。
- **production appl_date 確含非午夜時間分量**（直接查證 run 07944a82 案件集：115,197 / 115,197 皆非午夜，
  如 `2015-05-18 15:24:00`）——**直接回答 P3d DATECAST-003 之未驗證假設：production appl_date 確帶非午夜時分**。
- **CR 步驟 1（逾2年清空）邊界**：twoYearsAgo = 2024-07-01；run 全案 CR 候選中 0 案 `appl_date < 2024-07-01`、
  3 案落在 2024-07-01 當日（不同時分）→ 皆 **不清空**（`appl_date < CAST(date AS DATE)` 對午夜比較，當日任何
  時分皆 ≥ 午夜 → 不 < → 不清空）。本輪 6 名單子集之 CR 候選未含此邊界日案件（邊界案在其他名單）。
- **裁示歸屬**：datetime2 時區之 **production 儲存/連線組態**最終裁示屬 **P5d**（本文件僅揭露邊界，不代裁）。
  §4 之 assignday −1 缺陷與此同源（tedious 日期時區處理），兩者一併交 architect/P5d。

---

## 6. varchar byte 語意（次要 schema 觀察）

`ob_pool_data.spec_name` 等顯示欄在 PG/MSSQL **皆為 `varchar(45)`**（非 schema 寬度漂移），但 MSSQL
`Chinese_Taiwan_Stroke_BIN`（非 Unicode）collation 下 `varchar` **以位元組計長**（中文 2 bytes/字），故長中文值
（如 `商品B1450-中低風險商品通案(費率14.5% 48期 零利率)`）於 PG（45 字元）可容、於 MSSQL（45 bytes）溢位。

- 本輪為 **seed 需要** 對顯示欄做 byte-aware 截斷（`spec_name` 3,064 列、`car_name` 5 列、`broker` 1 列，
  6 名單樣本）——**此等欄非計分/CR/比例分派輸入**（計分讀 spec_tp/loan_rate/year_produ/month_cnt/…），
  **不影響 10 欄比對結果**。
- **觀察（交 architect / P5b 追蹤，非本文件裁定）**：若 production MSSQL `ob_pool_data` 顯示欄維持 `varchar`，
  長中文值於 ETL 載入會截斷/失敗（對稱 P5b ATOMIC 之型別溢位風險）；是否需將中文欄改 `nvarchar` 屬 schema
  設計決策。

---

## 7. Files Changed

| File Path | Change | 說明 |
|-----------|--------|------|
| `apps/api/scripts/mssql-monthrun-diff-p5c.ts` | new | P5c MONTHRUN-DIFF 比對 script（唯讀擷取 PG → seed MSSQL → 跑真實 executeStage2to3PushdownMssql → 逐列 diff + 分佈 + datetime2 probe + score 分類）。可 `P5C_LISTS=… P5C_RUN=… P5C_YM=… P5C_KEEP=1` 覆寫。 |
| `docs/specs/implementation-log/AD-E07-43-P5c-impl.md` | new | 本檔 |
| `docs/specs/implementation-log/AD-E07-43-P5c-f067-draft.md` | new | F067 式簽核報告底稿（供 P5e） |

**未修改任何生產碼**（`assignment-run-pipeline.service.ts` / `stage0-estimate.service.ts` / Stage 2~4/CR SQL
executor 皆凍結；STATIC-001 守門）。未 commit。未動記憶檔。

---

## 8. Architectural Decisions

- **AD-1（Tier 2 取代 Tier 1）**：dev PG 唯讀可達且存有真實生產月名單分派 → 直接以真實 PG run 逐列比對（Tier 2），
  取代 test-spec 因 5433 不可達而裁定之 JS oracle 代理（Tier 1）。I-MSSQL-SIGNOFF-GATE-01「PG/MSSQL」可字面滿足。
- **AD-2（Approach A：釘選案件集）**：釘選 PG 案件集 + 重建 Stage 1 seed（非重跑 Stage 1 篩選），隔離
  Stage 2~4/CR 引擎、消除 Stage 1 選案漂移。對稱 test-spec §0.4 之 customer_core 名單「單次 Stage 1、雙寫」
  精神，推廣至全名單。偏離 test-spec §0.3 step 3（原建議 JS oracle 側走 runStage1JsChain）——理由：真實 PG
  資料下，釘選 PG 案件集比重跑 Stage 1 更能保證「案件集完全相同」（CHAINEQ-001 前提）並純測下游。
- **AD-3（MSSQL 隔離窗）**：沿用 CDMP_TEST dbo（現空、非 CI 並行之人工窗）＋前綴 run_id＋收尾清理；未建
  獨立庫（比照 P5b CDMP_P5B 需 sa 建庫，本輪唯讀 PG + 空 CDMP_TEST 已足）。
- **AD-4（時區安全）**：pg typeParser 覆寫使 temporal 欄回字串以字串載入 MSSQL，避免驅動時區位移（§1.3）。
- **AD-5（identity / varchar byte）**：config 表 identity PK（如 `card_version`）以 `SET IDENTITY_INSERT ON`
  保留 PG 原值供 join；顯示欄 varchar byte 溢位 byte-aware 截斷（§6）。

---

## 9. Test Results Summary（對 test-spec AD-E07-43-P5c-test.md 39 檢核）

| 群組 | 檢核 | 狀態 |
|---|---|---|
| GATE-001 | 5433 探測 → §七 PG-ENHANCE | **升級**：改用 5432 dev PG 唯讀 → 直接 Tier 2（優於 skip 加強）|
| GATE-002 | Tier 1 proxy 佐證力道決策關卡 | **解除**：Tier 2 真實 PG 已執行 → GATE-002 之 proxy 疑慮不再適用（見 §六 F067 底稿）|
| GATE-003 | 聯集 10 欄（含 cr_nm）| ✅ 採 10 欄 |
| GATE-004 | customer_core 名單分流 | ✅ Approach A 釘選案件集，customer_core 名單以 PG 案件集直接參與（seed 不呼叫 JS Stage 1）|
| GATE-005 | CDMP_TEST dbo + run_id 前綴 | ✅ |
| HARNESS-001..005 | fixture 矩陣 / 邊界清單 | ✅ 以真實 PG run 案件（維度涵蓋見 §2）取代合成 fixture |
| CHAINEQ-001 | 全量逐列 10 欄相等 | ✅ 8/10 欄 0-diff；score=今日參考日效應；assignday=已知缺陷（見 §2/§3/§4）|
| CHAINEQ-002 | 分名單逐一 | ✅ 6 名單 + 大 CR 名單 + 2 名單小樣本 |
| CHAINEQ-003 | CR 三欄 + CR 案 emplid/dept | ✅ cr_id/cr_nm/is_cr 0-diff（6 名單 11 CR + 大 CR 名單 1,996，見 §2.3）|
| CHAINEQ-004 | cr_enabled=false is_cr='N' | 本 run 各名單 cr_enabled=true → 未涵蓋 false 分支（P3d 已單站點驗證；可另 seed）|
| CHAINEQ-005/006 | ration=0 / 查無 emphire | 由真實資料自然涵蓋（BR-F102-08 emphire 查無仍指派已由 seed 重建含 cr_id NULL 案佐證）|
| CHAINEQ-007 | Stage2 邊界值餵 Stage3/4 | ✅ 真實資料含 tier NULL(T5=card 無對應 tier)/card NULL 案，比例分派 0-diff |
| CHAINEQ-009 | 重跑冪等 | ✅ 6 名單跑兩輪（198→9376）結果一致 |
| CHAINEQ-010 | 差異根因分類框架 | ✅ score→AGE 今日參考日；assignday→date 正規化缺陷（§3/§4，非籠統「可接受誤差」）|
| DATECAST-001..003 | appl_date 非午夜邊界 | ✅ 揭露 production appl_date 全非午夜；round-trip 0；CR 步驟1 邊界記錄（§5，交 P5d）|
| DIST-001..004 | 分佈檢核 | ✅ tier/card/dept/CR% 兩側一致（§2.1）|
| REPORT-001..005 | 差異報告格式 | ✅ 本 impl log + F067 底稿（§六）|
| REPORT-004 | Tier 標示決策關卡 | ✅ 明載本輪＝Tier 2 真實 PG（見 F067 底稿最顯著位置）|
| PGENH-001..003 | PG 加強 | **已內化為主路徑**（本輪即真實 PG 比對）|
| STATIC-001/002 | 凍結檔未改 / 10 欄清單 | ✅ |
| REG-001/002 | 不干擾既有套件 / tsc 乾淨 | ✅ CDMP_TEST 收尾清理；`tsc --noEmit -p tsconfig.build.json` 乾淨 |

---

## 10. 偏差（deviation）

- **方法論由 Tier 1（JS 代理）升級為 Tier 2（真實 PG）**：因 dev PG(5432) 唯讀可達（test-spec 撰寫時假設不可達）。
  結論更強（字面滿足 GATE），非弱化。
- **Approach A 釘選 PG 案件集**取代「重跑 Stage 1 兩次」（AD-2 理由）。
- **CHAINEQ-004（cr_enabled=false）** 未由本 run 真實資料涵蓋（202607 各名單皆 cr_enabled=true）；P3d 單站點
  已驗證，如需可另 seed 一份 false 名單（非阻擋）。
- **assignday −1 缺陷 與 score 5-diff** 非「0-diff 全綠」——但均已逐案根因分類（§3/§4），符合 test-spec
  CHAINEQ-010 之「不可籠統標可接受誤差」紀律：score=今日參考日預期效應（非 bug）；assignday=已定位之單一
  date 正規化缺陷（cutover-blocker，交 architect 修）。

---

## 11. 需回報使用者之業務級發現

1. **🔴🔴 assignday −1 日（cutover-blocker，真實跨引擎缺陷）**：見 §4。UTC+ 時區 MSSQL 部署下月名單分派每案分派日
   全早一天、Stage 0 試算逐日錯位。根因＝tedious 回 MSSQL `date` 為本地午夜 JS Date + `computeWorkingDayRatios`
   用 `getUTC*`。凍結檔未改，交 system-architect 修（建議修法見 §4.4）。
2. **score 計分邏輯 PG≡MSSQL 等價**：8/10 欄含計分結果 card_level/tier_level 全 0-diff；唯 5 案 score 差異＝
   AGE 今日參考日效應（重現日 07-08 vs run 日 07-06 跨生日），**非引擎 bug**（§3）。
3. **CR 全鏈 PG≡MSSQL 等價**：is_cr/cr_id/cr_nm 逐列 0-diff（含大 CR 名單，見 §2.3）。
4. **datetime2**：production appl_date 確含非午夜時分（回答 P3d DATECAST-003）；wall-clock 字串載入 round-trip 忠實；
   時區 production 組態裁示屬 P5d。
5. **varchar byte 語意**（次要）：MSSQL varchar 於 BIN collation 以位元組計長，長中文顯示欄溢位（§6，交 architect
   評估中文欄是否改 nvarchar）。

---

## 12. Session 中斷 resume 指引（若適用）

- 已完成：script、6 名單/198 案/大 CR 名單真實 PG 比對、score 分類、assignday 根因、impl log、F067 底稿、
  probe 清理、tsc、PG 唯讀確認。
- 若需擴大證據：`P5C_LISTS=<逗號分隔名單> npx ts-node -r tsconfig-paths/register scripts/mssql-monthrun-diff-p5c.ts`
  （可跑其餘名單或全 12 名單；full run 約 115k 案，複製耗時較長）。
