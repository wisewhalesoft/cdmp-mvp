---
spec-id: F101
title: 月名單分派 Stage 3/4 真實比例分派（dept 比例分配 + empl 比例分配 + ASSIGNDAY 指派日，取代 F100 placeholder）
feature-id: F101
source-story: US-145 / US-146 / US-149 / US-150 / US-151
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-06-04
status: Draft
---

# F101: 月名單分派 Stage 3/4 真實比例分派

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-04

> ⚠️ **PRODUCTION 分派結果變更警告（必讀）**：本 feature 以 legacy SP（`st2_dept` / `st3_emplid`）基底算法**取代現行 placeholder Stage 4**——現行 `executeV2`（~L585~619）/ `executeStage2to4Pushdown`（~L653）/ `runStage4Sql`（stage2to4-sql-executor.ts）僅取 `ob_dept_pct` 第一列電銷課、單一 `defaultEmpl`，將全部案件指向同一員工。當該課（如 AI000）在 `ob_empl_set` 無員工設定時 `defaultEmpl=null`，造成全部案件 `emplid=NULL`（已於 OB202606001 名單驗證 = Bug C 根因）。本 feature 將 `dept_id` / `emplid` / `emplid_deptid` / `assignday` 改為依 `ob_dept_pct.ration`（電銷課比例）/ `ob_empl_set.ration`（員工比例）/ `ob_calendar` 千分比真實分派，**將顯著改變各名單之部門 / 員工 / 指派日分佈**。上線前須通過 **PG 真庫 JS↔SQL 逐 list 等價測試**（§4 AC-15，Definition of Done）+ 手算 oracle 等效性測試（AC-13/14），並業務知會分派結果變化（§9 / NFR-005）。
>
> **v1.0（2026-06-04）**：依 5 個已核可 user story（US-145 Stage 3 dept / US-146 Stage 4 empl / US-149 ASSIGNDAY / US-150 確定性 / US-151 calendar 來源）落地。範圍延伸 [F100](F100-stage2-4-sql-pushdown-scoring.md) 之 `Stage2to4ListContext` / `runStage4Sql` 比例分派；ASSIGNDAY 複用 [F049](F049-stage0-daily-estimate.md) `calculateDailyEstimate(ym)`（estimate≡run，I-RUN-EST-01）。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md` / AD 文件；不撰寫 production / test 程式碼 / migration / docker；Stage 1（[F099](F099-stage1-sql-pushdown.md)）/ Stage 2 計分 + Stage 3 CR `EXISTS` + score→level→tier（[F100](F100-stage2-4-sql-pushdown-scoring.md)）演算法不改——本 feature 僅替換 Stage 3 dept 分配與 Stage 4 員工 / ASSIGNDAY 分派。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（**UTF-16LE，Stage 3 ground truth**）+ `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`（**UTF-16LE，Stage 4 + ASSIGNDAY ground truth**）+ `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`executeV2` L517~ / `executeStage2to4Pushdown` L653~ 之 placeholder Stage 4）+ `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts` / `stage2to4-sql-executor.ts`（F100 set-based pattern，`runStage4Sql` 待擴）+ `apps/api/src/modules/assignment-list/stage0-estimate.service.ts`（`calculateDailyEstimate` / `resolveCalendarDay` 複用）+ entity：`ob-dept-pct` / `ob-empl-set` / `ob-monthly-run-result` / `ob-pool-data` / `ob-calendar` |
| Test Designer | 本文件 §4 AC（**AC-13/14 手算 oracle / AC-15 JS↔SQL 等價門檻 / AC-2 確定性**）+ §6 worked example + §11 測試覆蓋點名 |
| Architect | 本文件 + §12 Open Questions（**4 項待裁：確定性鍵 / st4_exchange 交互 / ob_assign_set 退役 / 冪等粒度**）+ §10 §5 兩個 schema-gap handoff |
| 圖表 | [diagrams/F101-stage3-4-proportional-flow.mmd](../diagrams/F101-stage3-4-proportional-flow.mmd) |

---

## 1. 功能摘要

以 legacy SP（`SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept` / `_st3_emplid`，已 UTF-16LE 解碼）基底算法取代現行 placeholder Stage 4，把 Stage 3 部門分配、Stage 4 員工分配、Stage 4 ASSIGNDAY 指派日，由「全案件指向 dept[0] 單一 defaultEmpl」改為「依比例真實分派」，並以確定性排序取代 legacy `NEWID()` 亂數：

- **Stage 3（dept）**：依（分處 `ob_pool_data.dept_id`、名單 `list_no`、Tier `ob_monthly_run_result.tier_level`）三維分組，各電銷課（`ob_dept_pct.obdeptid`）應得 `FLOOR(分組件數 × ration/100)`，差額以確定性順序補足，依配額循序指派 → 寫 `ob_monthly_run_result.dept_id`。
- **Stage 4（empl）**：在每（電銷課、Tier）內，各員工（`ob_empl_set.emplid`）應得 `FLOOR(課×Tier 總數 × ration/100)`，剩餘兩階段補足（均攤 + 前 N 各 +1）→ 寫 `emplid` / `emplid_deptid`。
- **Stage 4（ASSIGNDAY）**：複用 `calculateDailyEstimate(ym)` 千分比，per 員工 per casedt 分得 `FLOOR(員工件數 × ratio_rate/1000)`、最末 casedt 吸收餘額；跨 Tier 剩餘案件以 DIVIDE_LEFT round-robin 補足 → 寫 `assignday`。
- **確定性**：全程無 `NEWID()` / `Math.random()`；任一穩定排序鍵即可使 FLOOR-based oracle 件數可手算驗證（US-150）。
- **simplified is_cr**：所有案件（is_cr Y/N）一律流入比例分配池，無 legacy CR 優先預指、無 CR 超額移除（§4 BR-F101-12）。
- **DB gate / dual implementation**：與 F100 一致——PG 走 set-based SQL 下推（擴 stage2to4 builder/executor），SQLite/JS `executeV2` 為 golden oracle，兩者 deterministic 等價可測。

## 2. 使用者故事

**As a** 業務主管 / 分派維運人員
**I want** 月名單分派 Stage 3/4 依電銷課與員工的設定比例真實分派案件，並依工作日日曆均攤指派日，且結果可重現
**So that** 每間電銷課 / 每位業務員收到的案件量符合比例設定、案件不在同一天到期，且消除「全員 emplid=NULL」缺陷，使案件能正確匯出給各業務員處理

## 3. 前置條件

- [F099](F099-stage1-sql-pushdown.md)（P2）已交付：Stage 1 已 `INSERT…SELECT` 寫入 `ob_monthly_run_result`（含案件識別 + custo_no / settle_src）。
- [F100](F100-stage2-4-sql-pushdown-scoring.md)（P3）已交付：Stage 2 計分 + score→card_level→**tier_level** 已寫入 `ob_monthly_run_result`（**Stage 3 分組依賴 tier_level，必在 Stage 3 之前完成**；見 §5 schema gap）。
- `ob_dept_pct`（PK project_workym + list_no + obdeptid；`ration` numeric(9,2)）有該名單之部門比例設定（US-109 / F079）。
- `ob_empl_set`（PK list_no + deptid_m + emplid；`ration` numeric(10,2)；`prod_type` 存 'TIER:T*' 資深標記）有該名單之員工比例設定（US-112 / F082）。
- `ob_calendar`（`calendar_date` / `rest_flg`）由 ETL **E07-OBCALENDAR-Load** 維護有當月工作日資料（US-151）。
- 統一 Tier 集合 **T1–T5**（migration `1711360000162` 已收斂所有 legacy 變體；`tier_level` 不再出現 T1M / T52 / T32 等）。

## 4. 業務規則與驗收標準

> **BR / AC 對照**：每條 AC 對應一或多條業務規則 BR-F101-xx。BR 為「實作必須遵守的規範」，AC 為「可驗證的 Given/When/Then 斷言」。

### Stage 3 — 部門（電銷課）比例分配

**BR-F101-01（三維分組）**：Stage 3 以（`ob_pool_data.dept_id`〔分處〕、`list_no`、`ob_monthly_run_result.tier_level`）三維分組計件。**tier_level 來源為 Stage 2 已寫入之 `ob_monthly_run_result`，非 `ob_pool_data`**（ob_pool_data 無此欄，見 §5）。

**BR-F101-02（per-list ration 查詢鍵）**：`ob_dept_pct` 查詢鍵 = 案件所屬 `list_no`（`WHERE list_no=<案件 list_no> AND ration>0`）。**刻意捨棄** legacy `MIN(LIST_NO)` 語意（差異聲明 §7）。

**BR-F101-03（FLOOR 比例）**：各電銷課 `obdeptid` 初始應得 = `FLOOR(該三維分組總件數 × ration / 100)`（無條件捨去，對齊 SP `FLOOR(A.CNT*B.RATION/100)`）。

**BR-F101-04（確定性差額補足）**：差額 = 分組總件數 − Σ(各課 FLOOR)；差額件數以**確定性排序鍵**（具體鍵由架構師決定，align OQ-06，見 §12 OQ-F101-01）每課最多 +1 件，**不使用 `NEWID()` / 亂數**（取代 SP `ORDER BY NEWID()`）。

**BR-F101-05（依配額循序指派）**：各課最終件數確定後，依確定性排序鍵從該三維分組未分配案件池取出 N 件（N = 應得件數），寫 `dept_id`；已指派案件移出池，下一課續取。

**BR-F101-06（重跑清除）**：Stage 3 開始前，清空同月份、T1–T5 全 Tier 之 `ob_monthly_run_result.dept_id` / `emplid` / `assignday`；`is_cr` 標記不受影響（保留原值）。

#### AC-1：三維分組 + FLOOR 比例 + 確定性差額補足

- **Given** Stage 2 完成、`ob_monthly_run_result` 已有計分完成之 T1–T5 案件
- **When** 對單一三維分組（例 `dept_id='XVF1'`, `list_no='OB202606001'`, `tier_level='T1'`）執行 Stage 3
- **Then** 讀 `ob_dept_pct WHERE list_no='OB202606001' AND ration>0`，各課初始應得 = `FLOOR(分組件數 × ration/100)`
- **And** 差額（分組件數 − ΣFLOOR）以確定性排序前 N 課各 +1，無亂數
- **And** 滿足 BR-F101-01~05

#### AC-2：確定性可重現（橫切，US-150）

- **Given** 固定種子（`ob_dept_pct` / `ob_empl_set` / `ob_calendar` / Stage 2 輸出不變），兩次執行用不同 `run_id`、相同月份與設定
- **When** Stage 3 + Stage 4（含 ASSIGNDAY）執行兩次
- **Then** 兩次 `(orgno, appl_no, dept_id, emplid, assignday)` 集合**完全相同**
- **And** Stage 3/4/ASSIGNDAY 全程不存在 `NEWID()` / `Math.random()` / `ORDER BY RANDOM()` / `crypto.randomUUID()`（靜態掃描為空，BR-F101-04/10/11）
- **And** 確定性鍵名於本 spec §12 明確記錄（架構師確認，align Stage 1 OQ-06）

#### AC-3：依配額循序指派、dept_id 不退化

- **Given** OB202606001 之 `ob_dept_pct` 含 8 課（如 AI000 / AM000 / B0000 / BD000 / XVE1~XVE4），其中 AI000 在 `ob_empl_set` 無員工
- **When** Stage 3 執行完畢
- **Then** `dept_id='AI000'` 件數 = `FLOOR(分組件數 × AI000_ration/100)` + 差額補足
- **And** `SELECT COUNT(DISTINCT dept_id)` = ration>0 之課數（不退化為單一課佔全部）
- **And** Stage 3 不因下游 Stage 4 員工存在性而調整分配（電銷課層 ⊥ 員工層，BR-F101-01）

#### AC-4：Stage 3 前清除前次分配（重跑安全）

- **Given** 月名單分派執行（含重跑）
- **When** Stage 3 開始
- **Then** 同月份 T1–T5 之 `dept_id` / `emplid` / `assignday` 清空；`is_cr` 保留（BR-F101-06）

#### AC-5：`ob_dept_pct` 無 ration 時不中斷、寫警告

- **Given** 某名單 / Tier 之 `ob_dept_pct` 無任何 ration>0 記錄
- **When** Stage 3 執行
- **Then** 月名單分派**不中斷**，該分組案件 `dept_id` 保持 NULL
- **And** 寫入月名單分派警告（`event='STAGE3_NO_DEPT_RATION'`, `list_no`, `tier_level`）—— **警告寫入通道見 §5 schema gap / OQ-F101-05**
- **And** 月名單分派完成摘要頁（US-083 / F063）顯示對應警告

### Stage 4 — 員工比例分配

**BR-F101-07（per-list / 課內 ration）**：`ob_empl_set` 查詢鍵 = 案件所屬 `list_no`；分配在每（`deptid_m`〔= Stage 3 寫入之電銷課〕、`tier_level`）內進行（`WHERE list_no=<案件 list_no> AND deptid_m=<課> AND ration>0`）。

**BR-F101-08（FLOOR 比例）**：各員工初始應得 = `FLOOR(該〔課,Tier〕案件總數 × ration / 100)`（對齊 SP `FLOOR(@r_APPL_TOTAL*RATION/100)`）。

**BR-F101-09（兩階段剩餘補足）**：剩餘 = 課Tier 總數 − Σ(各員工 FLOOR)；
- **階段 ①（均攤）**：`ADD_CNT = FLOOR(剩餘 / 員工數)`，若 >0 則每位員工各 +ADD_CNT，並重算剩餘（對齊 SP `@r_ADD_CNT = @r_LEFT_CNT / @count`）；
- **階段 ②（前 N 各 +1）**：重算後之剩餘件數，依確定性排序前 N 位員工各 +1（N = 剩餘）（對齊 SP `WHERE SEQ <= @r_LEFT_CNT`）。

**BR-F101-10（確定性 + 確定性指派）**：員工排序與案件指派順序使用確定性鍵（取代 SP `ORDER BY NEWID()`）；依各員工最終件數從課Tier 案件池循序指派，寫 `emplid` = 員工代號、`emplid_deptid` = 該課 `deptid_m`。

**BR-F101-11（T5 / 資深無分流）**：`ob_empl_set.prod_type`（slice(5) 取 'TIER:T*' 之 T*）僅供標記；F101 **不**因 T5 或資深而走不同 ration 邏輯——T1–T5 同一 ration 演算法。（資深交換之 F100 st4_exchange 交互見 §12 OQ-F101-02。）

#### AC-6：課內員工 FLOOR 比例

- **Given** Stage 3 完成，電銷課 XVE1 之 T1 案件共 100 件；`ob_empl_set WHERE list_no='OB202606001' AND deptid_m='XVE1' AND ration>0` = E1(50) / E2(30) / E3(20)
- **When** Stage 4 對（XVE1, T1）分配
- **Then** E1=`FLOOR(100×50/100)`=50、E2=30、E3=20，差額=0（BR-F101-08）

#### AC-7：兩階段剩餘補足（確定性）

- **Given** 電銷課 XVE2 之 T2 案件 103 件、3 員工 FLOOR 後合計 100、剩餘=3
- **When** Stage 4 補足
- **Then** ① `ADD_CNT=FLOOR(3/3)=1`，每員工 +1（合計 103，剩餘消除）；② 若仍有剩餘，依確定性排序前 N 位各 +1
- **And** 相同輸入兩次執行件數完全一致（BR-F101-09/10）

#### AC-8：simplified is_cr — is_cr=Y/N 同池

- **Given** XVE3 之 T2 案件 100 件，其中 40 件 `is_cr='Y'`、60 件 `is_cr='N'`
- **When** Stage 4 分配
- **Then** 100 件全部進入同一比例分配池，依 ration 分配
- **And** 系統**不執行** legacy CR 優先指派（不依 `cr_id` 預指 `emplid`）、**不執行** CR 超額移除
- **And** `ob_monthly_run_result.is_cr` 值保持原樣（BR-F101-12）

#### AC-9：寫入 emplid / emplid_deptid

- **Given** E1 被分配 50 件、E1 隸屬 XVE1
- **When** Stage 4 寫入
- **Then** 這 50 件 `emplid` = E1 代號、`emplid_deptid` = 'XVE1'（BR-F101-10）

#### AC-10：回歸保護 — 有 dept_id 且有員工設定者 emplid 不為 NULL

- **Given** Stage 4 完畢
- **When** 查核
- **Then** 下列查詢結果 = 0：
  ```
  SELECT COUNT(*) FROM ob_monthly_run_result
  WHERE dept_id IS NOT NULL
    AND dept_id IN (SELECT DISTINCT deptid_m FROM ob_empl_set WHERE list_no=<current_list_no> AND ration>0)
    AND emplid IS NULL
  ```
- **And** 此斷言防止 OB202606001 型 `defaultEmpl=null` 缺陷再發（US-146 AC-5）

#### AC-11：課有 dept_id 但無員工設定 → 不中斷、寫警告

- **Given** Stage 3 將 50 件分配至 AI000，但 `ob_empl_set WHERE deptid_m='AI000' AND ration>0` 無記錄
- **When** Stage 4 分配 AI000
- **Then** 月名單分派**不中斷**，這 50 件 `emplid` 保持 NULL
- **And** 寫入月名單分派警告（`event='STAGE4_NO_EMPL_WARN'`, `dept_id='AI000'`, `list_no`, `tier_level`, `case_count=50`，通道見 §5 / OQ-F101-05）
- **And** 摘要頁（US-083）顯示「人員分配警告」區塊

### Stage 4 — ASSIGNDAY 指派日

**BR-F101-13（複用 calculateDailyEstimate）**：ASSIGNDAY 千分比 ratio 複用 `Stage0EstimateService.calculateDailyEstimate(ym)`（`calendarSource='weekday'` + `resolveCalendarDay`），不另建計算邏輯。其輸出每工作日一組 `(calendar_date, ratioPerMille)`：`baseRatio=FLOOR(1000/workingDays)`、按 `calendar_date DESC` 前 `remainder` 個 +1，Σ工作日=1000。

**BR-F101-14（per 員工 per casedt FLOOR + 最末吸收）**：對每位員工，依其案件之確定性 EMP_ORD 排序，每個 casedt 分得 `FLOOR(員工總件數 × ratioPerMille / 1000)`；最末 casedt 吸收所有 FLOOR 捨去餘額（對齊 SP STEP 11 之 `EMP_ORD <= FLOOR(M_EMP_ORD*ratio_rate/1000)+CNT` 累進 + 最後一筆吸收）。

**BR-F101-15（跨 Tier DIVIDE_LEFT round-robin）**：所有 Tier 主迴圈完成後，因 FLOOR 捨去未取得 assignday 之剩餘案件，每員工依 `ASSIGN_ORDER` 對應第 `((ASSIGN_ORDER−1) % workingDays) + 1` 個 casedt（round-robin）；`ASSIGN_ORDER` = 確定性排序（`tier_level` 升冪 + 案件確定性鍵，per-emplid partition）（對齊 SP STEP 13 `#DIVIDE_LEFT_ORDER` + `SEQ=((ASSIGN_ORDER-1)%@WORKDAYS)+1`）。

**BR-F101-16（estimate≡run，I-RUN-EST-01）**：Stage 0 試算與 Stage 4 ASSIGNDAY 使用同一個 `calculateDailyEstimate(ym)` 邏輯與同一份 `ob_calendar`；日曆未變更時，兩者各日期件數比例一致。

**BR-F101-17（ob_calendar 無資料 fallback）**：當月無 `rest_flg='0'` 工作日時，`assignday` 保持 NULL，月名單分派**不中斷**，寫警告 `ASSIGNDAY_NO_CALENDAR_WARN`。

**BR-F101-18（ob_assign_set 不引用）**：F101 **不查 `ob_assign_set`**（legacy SP 之 `OBASSIGNSET` 日曆來源由 `ob_calendar` + `calculateDailyEstimate` 取代）；`ob_assign_set` 為 vestigial（是否退役見 §12 OQ-F101-03）。

#### AC-12：ASSIGNDAY 千分比 + 最末吸收餘額

- **Given** E1 本月 30 件；`ob_calendar` 該月 20 工作日；`calculateDailyEstimate` 得 baseRatio=50、remainder=0、20 casedt 各 ratioPerMille=50
- **When** Stage 4 計算 E1 的 ASSIGNDAY
- **Then** 每 casedt 得 `FLOOR(30×50/1000)`=1 件（共 20）；最末 casedt 吸收剩 10 件（30−20）
- **And** E1 全 30 件均取得非空 `assignday`（BR-F101-14）

#### AC-13：Stage 3 手算 oracle 等效性（US-150 AC-3）

- **Given** 種子：2 分處 × 2 Tier × 3 課，`ob_dept_pct` ration 已知；手算各（dept_id, list_no, tier_level, obdeptid）期望件數（FLOOR + 確定性差額補足）
- **When** Stage 3 執行
- **Then** 各組合實際件數 = oracle 期望值，誤差 = 0

#### AC-14：Stage 4 手算 oracle 等效性（US-150 AC-4）

- **Given** 種子：2 課 × 2 Tier × 各 3 員工，`ob_empl_set` ration 已知；手算各（deptid_m, tier_level, emplid）期望件數（FLOOR + ADD_CNT + 前 N 補足）
- **When** Stage 4 執行
- **Then** 各組合實際件數 = oracle 期望值，誤差 = 0

#### AC-15：JS↔SQL 逐 list 等價測試（Definition of Done）

- **Given** 一組代表性名單（含：多分處 / 多 Tier / 差額補足觸發 / 兩階段補足觸發 / 無 ration 課 / 無員工課 / ob_calendar 無資料 fallback / is_cr 混合）
- **When** 對同一輸入分別跑 JS `executeV2`（golden oracle）與 PG SQL 下推
- **Then** 兩者 `ob_monthly_run_result` 之 `(dept_id, emplid, emplid_deptid, assignday)` **逐列等價**
- **And** 於 **PG 真庫**執行，為 SQL 版上線**驗收門檻**
- **And** 因 Stage 3/4/ASSIGNDAY 全確定性，「哪幾件落入餘數補足 / 哪天 assignday」可精確比對

#### AC-16：estimate≡run 一致性（US-149 AC-6 / US-151 AC-2）

- **Given** Stage 0 試算用 `calculateDailyEstimate(ym='202607')` 之 casedt 清單
- **When** 月名單分派 Stage 4 計算同月 ASSIGNDAY
- **Then** 兩者工作日清單來自同一 `calculateDailyEstimate` 呼叫（或等效共享路徑）
- **And** `ob_calendar` 未變更時，各日期比例一致（BR-F101-16）

#### AC-17：ob_calendar 無資料 fallback（US-149 AC-5 / US-151 AC-4）

- **Given** `ob_calendar` 該月無 `rest_flg='0'` 記錄
- **When** Stage 4 計算 ASSIGNDAY
- **Then** `calculateDailyEstimate` 返回空清單；`assignday` 保持 NULL；月名單分派狀態 `completed`（非 failed）
- **And** 寫警告 `ASSIGNDAY_NO_CALENDAR_WARN`（`list_no`, `work_ym`，通道見 §5）

#### AC-18：ob_assign_set 無引用（US-151 AC-3）

- **Given** F101 新增 / 修改之檔案
- **When** 靜態掃描
- **Then** `ob_assign_set` / `ObAssignSet` / `OBASSIGNSET` 命中為空（BR-F101-18）

### simplified is_cr

**BR-F101-12（is_cr = 被動標記）**：所有案件（含 `is_cr='Y'`）一律流入 ration 分配池；**不**執行 legacy CR 優先 pre-assign（無 per-case `cr_id→emplid`）、**不**執行 CR 超額移除、**不**從電銷課 / 員工配額扣 CR 件數。`is_cr` 由 [F100](F100-stage2-4-sql-pushdown-scoring.md) Stage 3 `EXISTS` 標記後保持原值，F101 不改其值、不依其值分流。

## 5. Schema gap handoff（spec-writer 主動標示，交架構師裁示）

> 撰寫 spec 時對照 entity 實檔發現兩處 story 描述與現行 schema 不符，**不臆造對齊、明確 flag**（feedback_spec_schema_gap_first）：

| Gap | story 描述 | 現況（已查 entity） | F101 spec 處置 | handoff |
|-----|-----------|---------------------|----------------|---------|
| **G-1：tier_level 來源** | US-145/146 寫「group by (分處 dept_id, list_no, **tier_level**)」隱含 tier_level 可從案件直接取 | `ob_pool_data` **無 tier_level 欄**；tier_level 是 Stage 2 產出、只存在 `ob_monthly_run_result`。分處 = `ob_pool_data.dept_id`(varchar6) | BR-F101-01 明定 tier_level **讀 `ob_monthly_run_result`（Stage 2 之後）**；分處需 join `ob_pool_data.dept_id`（或 Stage 1 已帶入 result 之等價欄） | 架構師確認 Stage 3 SQL 之 tier_level / dept_id 來源 join；**Stage 3 必排在 Stage 2 之後**（前置條件 §3） |
| **G-2：警告事件碼通道** | US-145/146/149 寫入 `assignment_audit_log`（`event='STAGE3_NO_DEPT_RATION'` 等三碼） | `assignment_audit_log.action` 為 **VARCHAR(30) 固定 union enum**，**不含**這三碼（現含 CREATE/UPDATE/…/SCORING_INTEGRITY_WARN）。既有 run 級警告通道 = `assignment_run.report_payload` / `skipped_cases` / `warning_summary`，由 `assignment-run-report.service.getSummary()` 表面化（US-083/F063） | AC-5/11/17 之警告**寫 `assignment_run.skipped_cases`（JSONB `warnings[]` 子鍵）+ `warning_summary`**（與摘要頁既有機制一致），**不**擴 audit_log enum | ✅ OQ-F101-05 **已裁定（AD-E07-29）**：落點 = `skipped_cases.warnings[]` + `warning_summary`（`assignment_run` 無 `report_payload` 欄；不擴 enum、免 migration） |

## 6. FLOOR + 餘數數學（worked example）

> 以一個三維分組逐步走完 Stage 3 → Stage 4 → ASSIGNDAY，供 test-designer 對齊 oracle。確定性鍵以「`appl_no` 升冪」示意（最終鍵由架構師定，OQ-F101-01；任一穩定鍵 FLOOR 件數相同）。

**輸入**：分組（`dept_id='XVF1'`, `list_no='OB202606001'`, `tier_level='T1'`）共 **101 件**；`ob_dept_pct`（list_no=OB202606001, ration>0）= 課A(50) / 課B(30) / 課C(20)。

**Stage 3（dept）**：
- FLOOR：A=`FLOOR(101×50/100)`=50、B=`FLOOR(101×30/100)`=30、C=`FLOOR(101×20/100)`=20 → Σ=100
- 差額 = 101−100 = 1 → 確定性排序（obdeptid 升冪 A,B,C）前 1 課 +1 → **A=51, B=30, C=20**（Σ=101 ✓）
- 依配額循序指派：案件池按 appl_no 升冪，A 取前 51、B 取次 30、C 取末 20 → 各案件寫 `dept_id`

**Stage 4（empl）**（以課 A 之 51 件 T1 為例）：`ob_empl_set`（list_no, deptid_m='A', ration>0）= E1(40) / E2(35) / E3(25)
- FLOOR：E1=`FLOOR(51×40/100)`=20、E2=`FLOOR(51×35/100)`=17、E3=`FLOOR(51×25/100)`=12 → Σ=49
- 剩餘 = 51−49 = 2；① `ADD_CNT=FLOOR(2/3)=0`（不均攤）；② 剩餘 2，確定性排序前 2 員工各 +1 → **E1=21, E2=18, E3=12**（Σ=51 ✓）
- 各員工件數寫 `emplid` / `emplid_deptid='A'`

**ASSIGNDAY**（以 E1 之 21 件為例）：當月 20 工作日、`calculateDailyEstimate` baseRatio=50、remainder=0（1000 mod 20=0），20 casedt 各 ratioPerMille=50
- per casedt = `FLOOR(21×50/1000)` = 1 件 × 20 casedt = 20 件
- 最末 casedt 吸收餘額 21−20 = 1 → 最末日 2 件、其餘各 1 件（Σ=21 ✓）
- 若 E1 因 FLOOR 捨去仍有未派案件（跨 Tier 合計），進 DIVIDE_LEFT round-robin（BR-F101-15）

## 7. Legacy 差異聲明（story 差異表結轉）

| Legacy SP 行為 | F101 行為 | 原因 / BR |
|---|---|---|
| `ob_dept_pct` / `ob_empl_set` 查詢鍵 = `MIN(LIST_NO)` / `MIN(LIST_NO,PROD_KIND)` | 查詢鍵 = 案件所屬 `list_no`（per-list） | 用戶確認 per-list 為刻意設計（BR-F101-02/07） |
| 差額補足 / 案件分配 / ASSIGNDAY EMP_ORD 用 `NEWID()` 亂數 | 確定性鍵排序（架構師定，OQ-06 先例） | 可重現性 + oracle 等效測試（BR-F101-04/10/15，US-150） |
| st2_dept / st3_emplid CR 優先：`cr_id` 查員工預指、扣配額 | is_cr 僅被動標記，全案件走相同 ration 分配 | `ob_monthly_run_result` 無 per-case `cr_id→emplid`（BR-F101-12） |
| CR 超額移除：員工 CR 件數超 ration 應得 → 隨機移除 | 不實作（CR 優先不存在，超額不成立） | 同上（BR-F101-12） |
| `ob_emphire.resign_date IS NULL` 過濾現職（join OBEMPHIRE） | 依 `ob_empl_set.ration>0`；resign 由 E04 ETL 維護 `ob_empl_set` 現況 | ob_emphire 僅 E04 同步，F101 不直接 join（BR-F101-07） |
| ASSIGNDAY 日曆來源 `OBASSIGNSET` | `ob_calendar` + `calculateDailyEstimate(ym)` | estimate≡run + 免新建 ETL（BR-F101-13/18，US-151） |
| Tier 含 T1M/T32/T4/T52 等變體分支 | 統一 T1–T5 單一演算法 | migration `1711360000162` 已收斂；無變體分流（BR-F101-11） |

## 8. 假設與約束

- **[CONSTRAINT] C-1**：Stage 3 在 Stage 2（tier_level 已寫）之後、Stage 4 之前執行（依賴鏈 Stage 2 → Stage 3 → Stage 4 empl → Stage 4 ASSIGNDAY）。
- **[CONSTRAINT] C-2**：員工資深標記沿用 `ob_empl_set.prod_type='TIER:T*'` slice(5)（與 F100 C-2 一致）；F101 不依其分流 ration（BR-F101-11）。
- **[CONSTRAINT] C-3**：dual-path gate = `DB_TYPE==='postgres'`（PG 下推 / SQLite=executeV2 golden oracle），與 F099/F100 一致；確定性使兩路徑逐列等價可測（AC-15）。
- **[ASSUMPTION] A-1**：確定性排序鍵之**具體欄位**（電銷課層 / 員工層 / 案件層 / EMP_ORD / ASSIGN_ORDER 各粒度）由架構師定（OQ-F101-01）；本 spec 之 FLOOR-based oracle 件數對任一穩定鍵皆成立，差異僅「哪幾件落入餘數補足」。
- **[RESOLVED] A-2**（AD-E07-29）：警告通道 = `assignment_run.skipped_cases`（JSONB `warnings[]`）+ `warning_summary`（§5 G-2 / OQ-F101-05），非擴 `assignment_audit_log.action` enum（`assignment_run` 無 `report_payload` 欄）。
- **[ASSUMPTION] A-3**：F101 Stage 4 ration 分派與 F100 st4_exchange senior-swap 之交互 / 取代關係待架構師裁定（OQ-F101-02）。

## 9. Production 分派變化知會

- F101 改變 `dept_id` / `emplid` / `emplid_deptid` / `assignday` 之真實分佈（由 placeholder 單一 default → 比例分派）。
- **deploy 前須**：(a) 對代表性名單跑「placeholder vs ration 分派」差異報告，量化各課 / 各員工件數分佈與指派日分佈變化；(b) 業務知會並驗收（沿用 [F067](F067-compare-run-results.md) 比對工具，NFR-005 主驗收）。

## 10. 相依關係

- **前置**：[F100](F100-stage2-4-sql-pushdown-scoring.md)（P3，tier_level 已寫）、[F099](F099-stage1-sql-pushdown.md)（P2，案件已寫）、[F098](F098-monthly-run-worker-extraction.md)（P1，worker）、[F049](F049-stage0-daily-estimate.md)（`calculateDailyEstimate` 共享）、US-109/F079（ob_dept_pct）、US-112/F082（ob_empl_set）、E07-OBCALENDAR-Load（ob_calendar）。
- **取代**：現行 placeholder Stage 4（`executeV2` L585~619 / `runStage4Sql`）之 dept[0] + 單一 defaultEmpl 邏輯。
- **不影響**：[F100](F100-stage2-4-sql-pushdown-scoring.md) Stage 2 計分 / Stage 3 CR `EXISTS` / score→level→tier（F101 只換 dept / empl / ASSIGNDAY 分派）。

## 11. 測試覆蓋點名（test-designer / tdd 承接）

| 項目 | 承接 agent | 覆蓋要求 |
|------|-----------|---------|
| **Stage 3 手算 oracle**（AC-13） | test-designer | FLOOR + 差額補足；2 分處×2 Tier×3 課，誤差=0 |
| **Stage 4 手算 oracle**（AC-14） | test-designer | FLOOR + ADD_CNT 均攤 + 前 N 補足；誤差=0 |
| **ASSIGNDAY 千分比 + 最末吸收**（AC-12） | test-designer | per casedt FLOOR；最末吸收餘額；DIVIDE_LEFT round-robin |
| **JS↔SQL 逐列等價**（AC-15，DoD） | test-designer | PG 真庫；dept_id/emplid/emplid_deptid/assignday 逐列等價 |
| **確定性可重現**（AC-2） | test-designer | 不同 run_id 兩次四元組集合相同；NEWID/random 靜態掃描為空 |
| **simplified is_cr**（AC-8） | test-designer | is_cr Y/N 同池；無 CR 優先 / 超額移除；is_cr 值不變 |
| **回歸保護 emplid≠NULL**（AC-10） | test-designer | automated；OB202606001 型 defaultEmpl=null 防護 |
| **無 ration / 無員工 / 無 calendar fallback**（AC-5/11/17） | test-designer | 月名單分派不中斷；NULL 保持；警告寫入 skipped_cases.warnings[] + warning_summary |
| **estimate≡run**（AC-16） | test-designer | 同 calculateDailyEstimate 來源；比例一致 |
| **ob_assign_set 無引用**（AC-18） | test-designer | Grep 為空 |
| 確定性鍵 / tier_level 來源 / 警告通道 schema | tdd-implementation | 對齊架構師 OQ-F101-01/05 裁示 |
| Production 分派差異報告（§9） | test-designer + 業務 | F067 比對 |

## 12. Open Questions（交 system-architect 裁示）

| ID | 問題 | 影響 | 建議 |
|----|------|------|------|
| **OQ-F101-01** | 確定性排序鍵之具體欄位（電銷課層差額 / 員工層差額 / 案件指派 / ASSIGNDAY EMP_ORD / 跨 Tier ASSIGN_ORDER 各粒度）？align Stage 1 OQ-06 | 哪幾件落入餘數補足 / 哪天 assignday（統計件數不變） | align OQ-06：差額 `obdeptid`/`emplid` 升冪；案件 `(orgno, appl_no)` 升冪；EMP_ORD `(orgno,appl_no)` per-emplid；ASSIGN_ORDER `tier_level + (orgno,appl_no)`。架構師於 spec 明確記錄（US-150 AC-5） |
| **OQ-F101-02** | F101 Stage 4 ration 分派與 F100 st4_exchange（T1/T2 → senior 10% swap）如何交互？取代 or 疊加？ | Stage 4 員工分派最終語意 | **預設**：F101 ration 分派**取代** placeholder defaultEmpl 指派；F100 st4_exchange（10% T1/T2→senior）為**獨立既有行為**，建議架構師裁定執行順序（ration 先分派 → st4_exchange 再交換 10%，或 st4_exchange 併入 ration）。spec 不自決，明列待裁 |
| **OQ-F101-03** | `ob_assign_set` 是否正式退役（drop table / soft-delete entity）？ | schema 清理 | F101 不引用（BR-F101-18）；退役超出 F101 scope，由架構師於 AD 決策（US-151 技術備註） |
| **OQ-F101-04** | 單一大 transaction vs per-list 冪等（複用 F100 I-IDEM-01 模型）？ | 重跑一致性 / 可中斷邊界 | 建議沿用 F100/F099 之 I-IDEM-01（run 開始前清 result / 重觸發前 DELETE run_id）+ 可中斷邊界「list 與 list / Stage 與 Stage 之間」 |
| **OQ-F101-05** | 警告事件（STAGE3_NO_DEPT_RATION / STAGE4_NO_EMPL_WARN / ASSIGNDAY_NO_CALENDAR_WARN）落點 = `report_payload`/`warning_summary` 或擴 `assignment_audit_log.action` enum + migration？ | 警告表面化機制（§5 G-2） | ✅ **已裁定（AD-E07-29）= `skipped_cases.warnings[]` + `warning_summary`**（`assignment_run` 無 `report_payload` 欄；與 US-083/F063 摘要頁既有機制一致，免擴 enum、免 migration） |

## 13. 相關

- 來源 story：US-145 / US-146 / US-149 / US-150 / US-151（`docs/stories/epics/E07-app-customer-list-assignment/`）
- SP ground truth（UTF-16LE）：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（Stage 3）、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`（Stage 4 + ASSIGNDAY）
- 前置：[F100](F100-stage2-4-sql-pushdown-scoring.md) / [F099](F099-stage1-sql-pushdown.md) / [F098](F098-monthly-run-worker-extraction.md) / [F049](F049-stage0-daily-estimate.md)
- 比例設定：[F079](F079-set-department-ratio.md)（ob_dept_pct）、[F082](F082-set-personnel-ratio.md)（ob_empl_set）
- 差異驗收：[F067](F067-compare-run-results.md)（NFR-005）
- 圖表：[diagrams/F101-stage3-4-proportional-flow.mmd](../diagrams/F101-stage3-4-proportional-flow.mmd)
