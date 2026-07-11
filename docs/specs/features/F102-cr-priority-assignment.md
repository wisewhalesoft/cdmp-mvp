---
spec-id: F102
title: 月名單分派 CR 優先分派（失效清空 + CR 優先指派 + 扣量 + per-list cr_enabled 閘控 + 廢除全域旗標）
feature-id: F102
source-story: US-152 / US-153 / US-154
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-06-12
status: Draft
blocked-by: F101
related: F059, F050, F051, F063, F064, F066, F101
---

# F102: 月名單分派 CR 優先分派

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-12

> ⚠️ **PRODUCTION 分派結果變更警告（必讀）**：F101 在「Legacy 差異聲明」（BR-F101-12）中刻意將 `is_cr` 簡化為被動標記，所有案件一律流入比例分配池，**未實作 CR 優先分配**。本 feature 補足此差距——在 F101 Stage 3/4 比例分派**之前**插入 CR 優先分派前置步驟（失效清空 → CR 優先指派 → 扣量）。上線後，啟用 CR（`cr_enabled=true`）之名單將出現約 1.9% 案件 `is_cr='Y'`、`emplid=cr_id`、`dept_id` / `cr_id` / `cr_nm` 有值，**改變該名單各電銷課 / 員工之案件分佈**（CR 案件從各課配額扣除）。現況 `ob_monthly_run_result` 之 `cr_id` / `cr_nm` 全空、`is_cr` 全 `'N'`（已查證，§10）。上線前須 deploy 後重跑 202606 驗證（§4 AC-13）並沿用 [F067](F067-compare-run-results.md) 差異報告 + 業務知會（§9 / NFR-005）。
>
> **v1.0（2026-06-12）**：依 3 個已核可 user story（US-152 CR 優先分派核心 / US-153 per-list cr_enabled 閘控 / US-154 廢除全域旗標）落地。範圍延伸 [F101](F101-stage3-4-proportional-assignment.md) Stage 3/4：CR 前置步驟先跑、扣量改 F101 比例分派只取 `is_cr<>'Y'`。確定性對齊 [AD-E07-29](../implementation-log/AD-E07-v3.2-f101-stage3-4-proportional-assignment.md) **I-DET-01**。
>
> **刻意未動（邊界，交 system-architect）**：不撰寫架構決策文件（AD-* / `architecture-spec.md`）；不撰寫 production / test 程式碼 / migration / docker；`data-model.md`（`cr_enabled` 預設值文字矛盾、CR 欄位流向）與 `architecture-spec.md`（US-154 AC-5 S2 稽核點）之修改列為**架構師 OQ**（§12）。本 feature **本身**負責修正 [F059](F059-toggle-cr-reassignment.md) doc body（US-154 AC-4，已執行）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F101](F101-stage3-4-proportional-assignment.md)（Stage 3/4 既有比例分派，扣量交互點）+ `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（**UTF-16LE，第 116–190 行 CR LIVE 段，ground truth；注意 `st3_emplid` 的 CR 段為 `/* */` 死碼勿引用**）+ entity：`ob-monthly-run-result`（`cr_id`/`cr_nm`/`is_cr`/`emplid`/`dept_id`/`emplid_deptid`/`tier_level`）/ `ob-pool-data-list`（`cr_id`/`cr_nm`/`is_cr`/`appl_date`）/ `ob-list-definition`（`cr_enabled`）/ `ob-empl-set`（`list_no`/`deptid_m`/`emplid`/`ration`/`prod_type`）/ `ob-emphire`（`emp_id`/`resign_date`） |
| Test Designer | 本文件 §4 AC（AC-1~AC-13）+ §6 worked example + §11 測試覆蓋點名 |
| Architect | 本文件 §10 schema gap + §12 架構師 OQ（**5 項待裁：CR 欄位流向 / ob_empl_set 多筆 deptid_m 取捨 / 機車 cr_enabled migration 初始值 + data-model 文字矛盾 / ob_assign_config 退役 / architecture-spec S2 稽核點**） |
| 圖表 | [diagrams/F102-cr-priority-flow.mmd](../diagrams/F102-cr-priority-flow.mmd) |

---

## 1. 功能摘要

以 legacy SP（`SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept`，第 116–190 行 CR LIVE 段，已 UTF-16LE 解碼）基底算法，在 [F101](F101-stage3-4-proportional-assignment.md) Stage 3/4 比例分派**之前**插入 CR 優先分派前置處理，並以 per-list `ob_list_definition.cr_enabled` 閘控、廢除全域 `ob_assign_config.cr_reassignment_enabled` 旗標：

- **閘控（US-153）**：月名單分派於 Stage 3 前置處理逐名單讀取 `ob_list_definition.cr_enabled` 快照值；`true` 才執行 CR 前置步驟，`false` 則跳過並將該名單所有案件 `is_cr` 強制為 `'N'`，全部進入 F101 標準比例分派池。
- **步驟 1 — 失效清空（逾2年）（US-152）**：CR 案件 `appl_date` 距名單月（`project_workym` + `'01'`）逾 2 年 → 清 `cr_id` / `cr_nm`、`is_cr='N'`。
- **步驟 2 — 失效清空（離職）（US-152）**：CR 業代（`cr_id` join `ob_emphire.emp_id`）之 `resign_date < 名單月` → 清 `cr_id` / `cr_nm`、`is_cr='N'`。
- **步驟 3 — CR 優先指派（US-152）**：剩餘 CR 案件（`cr_id` 非空），若該 CR 業代在本名單 `ob_empl_set`（`ration>0`）有設定 → 該案 `emplid=cr_id`、`dept_id` / `emplid_deptid` = 對應 `deptid_m`、`is_cr='Y'`。
- **步驟 4 — 扣量（US-152）**：F101 Stage 3/4 比例分派只取 `is_cr<>'Y'` 之案件（CR 案已預指派、從各電銷課 / 員工配額計數扣除）。
- **廢除全域旗標（US-154）**：`ob_assign_config.cr_reassignment_enabled` 全域開關正式廢棄，`ob_list_definition.cr_enabled`（per-list）為唯一有效 CR 開關來源。本 feature 修正 [F059](F059-toggle-cr-reassignment.md) doc body 之殘留「全域開關」誤述。
- **確定性**：步驟 1/2/3 全程無 `NEWID()` / `Math.random()`；對齊 [AD-E07-29](../implementation-log/AD-E07-v3.2-f101-stage3-4-proportional-assignment.md) **I-DET-01**。
- **純後端**：F102 為月名單分派 pipeline 內前置處理，**無新前端頁**。

## 2. 使用者故事

**As a** 業務主管
**I want** 月名單分派在 F101 Stage 3/4 比例分派之前，依各名單 `cr_enabled` 設定，先清空失效的 CR 標記（逾2年或業代離職）、將有效 CR 案件優先指派回原 CR 業代，並讓後續比例分派只處理尚未被 CR 預指派的案件
**So that** CR 客戶（曾被特定業代服務的歷史客戶）能回到原業代手中，月名單分派結果之 CR 三欄（`cr_id` / `cr_nm` / `is_cr`）有值，對齊 legacy 名單約 1.9% 的 CR 案件比例，且不同名單可獨立決定是否啟用 CR

## 3. 前置條件

- [F101](F101-stage3-4-proportional-assignment.md) 已交付（CR 前置步驟須在 Stage 3/4 之前執行；扣量改寫 F101 案件池過濾條件）。
- [F100](F100-stage2-4-sql-pushdown-scoring.md) Stage 2 已寫入 `ob_monthly_run_result.tier_level`（CR 步驟與 Stage 3 同處理迴圈，依賴 tier_level 已就緒）。
- `ob_monthly_run_result` 之 `cr_id` / `cr_nm` / `is_cr` 已從 `ob_pool_data_list` 帶入工作集（**現況：result 表此三欄全空 / 全 `'N'`，須 Stage 1 SELECT 帶入或 CR 步驟 join 回 pool — 欄位流向見 §10 / §12 OQ-1**）。
- `ob_list_definition.cr_enabled`（BOOLEAN NOT NULL DEFAULT false；migration `1711360000182`）有該名單設定值（月名單分派開始時快照，US-153 AC-4）。
- `ob_empl_set`（PK `list_no` + `deptid_m` + `emplid`；`ration` NUMERIC(10,2)）有該名單員工比例設定（US-112 / [F082](F082-set-personnel-ratio.md)）。
- `ob_emphire`（PK `emp_id` VARCHAR(10)；`resign_date` DATE NULL 表在職）由 E04 ETL 維護現況。

## 4. 業務規則與驗收標準

> **BR / AC 對照**：每條 AC 對應一或多條業務規則 BR-F102-xx。BR 為「實作必須遵守的規範」，AC 為「可驗證的 Given/When/Then 斷言」。

### 閘控（per-list cr_enabled）

**BR-F102-01（per-list 閘控）**：月名單分派於 Stage 3 前置處理逐名單讀取 `ob_list_definition.cr_enabled`（**月名單分派開始時之快照值**，與 F101 其他名單參數 `ob_dept_pct` / `ob_empl_set` 快照時機一致，US-153 AC-4）。`cr_enabled=true` → 執行步驟 1–3；`cr_enabled=false` → 跳過步驟 1–3。

**BR-F102-02（停用名單 is_cr 強制清 N）**：`cr_enabled=false` 之名單，其工作集所有案件 `is_cr` 強制為 `'N'`（執行 `UPDATE ob_monthly_run_result SET is_cr='N' WHERE list_no=:listNo AND run_id=:runId AND (is_cr IS NULL OR is_cr<>'N')`），避免來源 `ob_pool_data_list` 殘留之 `is_cr='Y'` 污染月名單分派結果；該名單所有案件進入 F101 標準比例分派池，不扣量。

**BR-F102-03（不讀全域旗標）**：閘控**不**讀取 `ob_assign_config.cr_reassignment_enabled`（已廢除，見 BR-F102-12）。閘控唯一來源 = `ob_list_definition.cr_enabled`。

#### AC-1：cr_enabled=true 時執行 CR 優先分派（US-153 AC-1）

- **Given** 名單 OB202606001 之 `ob_list_definition.cr_enabled=true`；月名單分派觸發、Stage 2 已完成
- **When** 月名單分派進入 Stage 3 前置 CR 處理
- **Then** 為 OB202606001 執行步驟 1（逾2年清空）、步驟 2（離職清空）、步驟 3（CR 優先指派）
- **And** 月名單分派執行日誌記錄「OB202606001：cr_enabled=true，執行 CR 優先分派」（BR-F102-01）

#### AC-2：cr_enabled=false 時跳過並 is_cr 強制為 'N'（US-153 AC-2 / AC-4）

- **Given** 名單 OB202606002 之 `cr_enabled=false`；其 `ob_pool_data_list` 有 `is_cr='Y'` 之來源案件
- **When** 月名單分派進入 Stage 3 前置 CR 處理
- **Then** 跳過 OB202606002 之步驟 1–3
- **And** OB202606002 工作集所有案件 `is_cr='N'`（無 `'Y'` 殘留），全部進入 F101 標準比例分派池（不扣量）
- **And** 日誌記錄「OB202606002：cr_enabled=false，跳過 CR 優先分派」（BR-F102-02）

#### AC-3：混合 cr_enabled 名單互不干擾（US-153 AC-3）

- **Given** 同一月名單分派含 OB202606001（`cr_enabled=true`）與 OB202606002（`cr_enabled=false`）
- **When** 月名單分派完整執行（Stage 0–4）
- **Then** OB202606001 有 `is_cr='Y'`、`emplid=cr_id` 之案件；OB202606002 所有案件 `is_cr='N'`、走標準比例分派
- **And** 兩份名單之 Stage 3/4 比例分派互不干擾，月名單分派整體 `status='completed'`（BR-F102-01/02）

#### AC-4：cr_enabled 月名單分派開始後鎖定（US-153 AC-4）

- **Given** 月名單分派開始時讀取 `cr_enabled` 快照
- **When** 月名單分派執行中（`status='running'`）管理員嘗試修改名單 `cr_enabled`
- **Then** 修改被月名單分派鎖阻擋（沿用 US-107 / US-104 鎖定機制）
- **And** 月名單分派全程使用開始時之 `cr_enabled` 快照值，不受後續變更影響（BR-F102-01）

### 步驟 1 — 失效清空（逾2年）

**BR-F102-04（逾2年清空）**：對 `cr_enabled=true` 名單之 CR 案件，若 `appl_date < DATEADD(YEAR, -2, @SYS_DT)`（`@SYS_DT = project_workym + '01'`，名單月第一天；對齊 SP 第 145 行 `DATEADD(YEAR, -2, @SYS_DT) > APPL_DATE`，**嚴格小於**）→ 設 `cr_id=NULL`（或空字串，與欄位流向裁示一致，§10）、`cr_nm=NULL`、`is_cr='N'`。

**BR-F102-05（限工作集）**：清空操作只作用於本次月名單分派之 `ob_monthly_run_result` 工作集（`run_id` 限定），**不修改** `ob_pool_data_list` 原始資料。

#### AC-5：逾2年失效規則觸發（US-152 AC-1 / TC-152-01）

- **Given** 名單月 `project_workym='202607'`、`@SYS_DT='2026-07-01'`；案件 A `appl_date='2024-06-30'`（< `2024-07-01`，逾 2 年）；案件 B `appl_date='2024-07-01'`（剛好 ≥ 2 年）；兩筆均有 `cr_id`
- **When** 步驟 1 執行
- **Then** 案件 A 之 `cr_id` / `cr_nm` 清空、`is_cr='N'`；案件 B 之 `cr_id` / `cr_nm` / `is_cr` 維持原值（BR-F102-04）
- **And** `ob_pool_data_list` 原始資料不被修改（BR-F102-05）

### 步驟 2 — 失效清空（離職）

**BR-F102-06（離職清空）**：對步驟 1 後剩餘之 CR 案件，以 `cr_id` join `ob_emphire.emp_id`，若 `ob_emphire.resign_date < @SYS_DT`（**嚴格小於**，對齊 SP 第 154 行；`resign_date IS NULL` 表在職、不觸發）→ 設 `cr_id`=NULL / `cr_nm`=NULL、`is_cr='N'`。

**BR-F102-07（兩規則皆執行、不短路）**：步驟 1 與步驟 2 均執行；同時滿足兩規則之案件，任一規則觸發即清空（結果相同）；步驟 1 執行後步驟 2 仍執行，不跳過。

**BR-F102-08（CR 業代查無 ob_emphire 記錄不清空）**：legacy 用 INNER JOIN `ob_emphire`，`cr_id` 在 `ob_emphire` 查無對應 `emp_id` 時 WHERE 不命中、等於不清空。**F102 沿用此行為**（查無 `resign_date` 可比較 → 不觸發步驟 2 清空）。此為 spec-writer 裁定（US-152 OPEN QUESTION-3），明文宣告。

#### AC-6：離職業代失效規則觸發（US-152 AC-2 / TC-152-02）

- **Given** 案件 C `cr_id='E001'`、`ob_emphire WHERE emp_id='E001'` 之 `resign_date='2026-06-15'`（< `2026-07-01`）；案件 D `cr_id='E002'`、E002 之 `resign_date IS NULL`（在職）
- **When** 步驟 2 執行
- **Then** 案件 C 之 `cr_id` / `cr_nm` 清空、`is_cr='N'`；案件 D 不受影響（BR-F102-06）

#### AC-7：兩規則皆執行、查無員工不清空（US-152 AC-3 / BR-F102-07/08）

- **Given** 案件 E 同時滿足「逾2年」與「業代離職」；案件 H `cr_id='E999'`、E999 不存在於 `ob_emphire`
- **When** 步驟 1 與步驟 2 執行
- **Then** 案件 E 之 CR 標記被清空（任一規則觸發即清空，結果相同），且步驟 1 執行後步驟 2 仍執行（不短路）
- **And** 案件 H 之 `cr_id` / `cr_nm` / `is_cr` **不因步驟 2 被清空**（INNER JOIN 不命中，BR-F102-08）

### 步驟 3 — CR 優先指派

**BR-F102-09（有 ration 設定才指派）**：對步驟 1/2 後剩餘且 `cr_id` 非空之案件，查 `ob_empl_set WHERE list_no=<案件所屬 list_no> AND emplid=<cr_id> AND ration>0`；**有對應記錄**（INNER JOIN 命中）才指派：`emplid=cr_id`、`dept_id`=對應 `deptid_m`、`emplid_deptid`=同 `deptid_m`、`is_cr='Y'`（對齊 SP 第 166–173 行）。查無記錄（或 `ration=0`）之案件不指派，`emplid` / `dept_id` 維持 NULL、`is_cr` 維持原值（非 `'Y'`），進入 F101 比例分派池。

**BR-F102-10（per-list 查詢鍵）**：`ob_empl_set` 查詢鍵 = 案件所屬 `list_no`（per-list 語意，與 [F101](F101-stage3-4-proportional-assignment.md) BR-F101-07 一致），**刻意捨棄** legacy 之 `LIST_NO=@LIST_NO`（同 prod_kind MIN(LIST_NO)）語意（§7 legacy 差異表）。

**BR-F102-11（確定性，align I-DET-01）**：步驟 1/2/3 全程使用確定性判斷與排序，無 `NEWID()` / `Math.random()` / `ORDER BY RANDOM()` / `crypto.randomUUID()`。同一 `cr_id` 在 `ob_empl_set` 對應多筆 `deptid_m`（不同 prod_type 或重複）時，取哪筆 `deptid_m` 之確定性鍵由架構師裁示（§12 OQ-2，建議 `deptid_m ASC`）。

#### AC-8：有 ration 設定才優先指派（US-152 AC-4 / TC-152-03）

- **Given** 步驟 1/2 後，案件 F `cr_id='E003'`、`ob_empl_set WHERE list_no=<F 所屬 list_no> AND emplid='E003' AND ration>0` 有記錄、`deptid_m='XVE1'`；案件 G `cr_id='E004'`、E004 在 `ob_empl_set` 無記錄（或 `ration=0`）
- **When** 步驟 3 執行
- **Then** 案件 F：`emplid='E003'`、`dept_id='XVE1'`、`emplid_deptid='XVE1'`、`is_cr='Y'`
- **And** 案件 G：`emplid` / `dept_id` 維持 NULL、`is_cr` 維持原值（非 `'Y'`），進入 F101 比例分派池（BR-F102-09）

### 步驟 4 — 扣量（F101 比例分派交互）

**BR-F102-12（F101 只跑 is_cr<>'Y'）**：F101 Stage 3 部門比例分派與 Stage 4 員工比例分派之「未分派案件池」只包含 `is_cr<>'Y'` 之案件（CR 案已於步驟 3 預指派）。各電銷課 / 員工之應分配件數計算**基數** = 該三維分組 / 課Tier 之 `is_cr<>'Y'` 案件總數（不含 CR 預指派件數）。F101 **不重新處理** `is_cr='Y'` 之案件、不覆蓋其已指派之 `emplid` / `dept_id`。

> **F101 交互說明**：本 BR 修改 F101 [BR-F101-01/05/07/10](F101-stage3-4-proportional-assignment.md#4-業務規則與驗收標準) 之案件池過濾條件——F101 原文（BR-F101-12）為 simplified is_cr「所有案件（含 `is_cr='Y'`）一律流入 ration 分配池」；F102 啟用後，`cr_enabled=true` 名單之 `is_cr='Y'` 案件**排除**於 ration 分配池外。`cr_enabled=false` 名單因 is_cr 已全清 `'N'`（BR-F102-02），F101 行為與其原 simplified is_cr 語意一致（全案件入池）。F101 之 Stage 3 前清除（BR-F101-06，清 `dept_id`/`emplid`/`assignday`、保留 `is_cr`）須在 CR 前置步驟**之前**或與其協調執行順序，避免清掉步驟 3 已寫入之 `emplid`/`dept_id`（執行順序見 §8 C-2 / §12 OQ-1）。

#### AC-9：扣量——F101 比例分派只跑 is_cr<>'Y'（US-152 AC-5 / TC-152-04）

- **Given** 名單 OB202606001 共 N 筆案件，其中 M 筆完成 CR 優先指派（`is_cr='Y'`）
- **When** F101 Stage 3 部門比例分派執行
- **Then** Stage 3「未分派案件池」只含 `is_cr<>'Y'` 之案件（N−M 筆）
- **And** F101 不重新處理 `is_cr='Y'` 之 M 筆（不覆蓋其 `emplid` / `dept_id`）
- **And** 各電銷課應分配件數計算基數 = `is_cr<>'Y'` 案件總數（不含 CR 預指派件數，BR-F102-12）

### 確定性

#### AC-10：確定性可重現（US-152 AC-6 / TC-152-05，align I-DET-01）

- **Given** 相同月名單分派設定（相同 `list_no` / `work_ym` / `ob_empl_set` / `ob_emphire` / `cr_enabled` 資料），以不同 `run_id` 執行兩次
- **When** CR 優先分派步驟 1/2/3 執行
- **Then** 兩次步驟 1/2 清空之案件集合完全相同；步驟 3 指派之 `emplid` / `dept_id` / `is_cr` 完全相同（以 `appl_no` 集合比對）
- **And** 步驟 1/2/3 全程無 `NEWID()` / `Math.random()` / `ORDER BY RANDOM()` / `crypto.randomUUID()`（靜態掃描為空，BR-F102-11）

### 全域旗標廢除（US-154）

**BR-F102-13（全域旗標廢除）**：全域 CR 旗標 `ob_assign_config.cr_reassignment_enabled` 正式廢棄。`ob_list_definition.cr_enabled`（per-list）為 F102 及所有後續功能之**唯一有效** CR 開關來源。本廢除涵蓋：(a) [F059](F059-toggle-cr-reassignment.md) doc body §1 / §6 殘留「全域開關」誤述之修正（本 feature 已執行，US-154 AC-4）；(b) seed / migration / entity 之 `[DEPRECATED-F102]` 標記（程式碼變更，tdd-implementation 範疇，US-154 AC-1/2/3）；(c) `architecture-spec.md` S2 稽核點更新（架構師範疇，US-154 AC-5 / §12 OQ-5）。

#### AC-11：F059 spec body 已修正（US-154 AC-4 / TC-154-03）

- **Given** [F059-toggle-cr-reassignment.md](F059-toggle-cr-reassignment.md) §1（功能摘要）與 §6（商業規則）BR-1
- **When** 文件審查
- **Then** §1「CR 回分規則為全域開關」加 `[DEPRECATED]` 標記，改述為「已改為 per-list 欄位 `ob_list_definition.cr_enabled`；詳見 F050 / F051 / F102」
- **And** §6 BR-1 加 `[DEPRECATED]` 標記並附 per-list 說明
- **And** DEPRECATED header 之 `supersededBy`（`F050, F051, ob_list_definition.cr_enabled`）維持不變（BR-F102-13）

#### AC-12：無 service / controller 讀取全域旗標（US-154 AC-6 / TC-154-04，靜態驗證）

- **Given** F102 上線後之 codebase
- **When** 靜態掃描 `apps/api/src/**/*.ts`（除 entity / migration / seed 外）與 `apps/web/src/**/*.ts` 之 `cr_reassignment_enabled`
- **Then** 命中為 0 筆（BR-F102-13；程式碼清理屬 tdd-implementation 範疇）

### 驗證（202606 重跑）

#### AC-13：F064 匯出驗證——CR 三欄有值、is_cr≈1.9%（US-152 AC-7 / TC-152-06）

- **Given** 202606 月名單分派（含 `cr_enabled=true` 名單）重跑後，[F064](F064-export-assignment-result.md) 匯出 `ob_monthly_run_result`
- **When** 以 `is_cr='Y'` 過濾
- **Then** CR 案件筆數約佔總筆數 1.9%（允許 ±0.3%，因失效規則清空部分案件）
- **And** 每筆 `is_cr='Y'` 案件之 `cr_id` / `cr_nm` 均非 NULL 且非空字串、`emplid=cr_id`（BR-F102-04~09）

## 5. API / Pipeline 規格

F102 為**純後端月名單分派 pipeline 前置處理**，無新 HTTP API 端點、無新前端頁、無新錯誤碼。

**Pipeline 執行順序（每名單 per-list 迴圈內，Stage 2 之後、F101 Stage 3 比例分派之前）**：

```
Stage 2（計分 + tier_level 寫入 ob_monthly_run_result，F100）
  → [F102 閘控] 讀 ob_list_definition.cr_enabled 快照
      ├─ cr_enabled=false → 強制 is_cr='N'（BR-F102-02）→ 全案件入 F101 池（跳過步驟 1–3）
      └─ cr_enabled=true →
            步驟 1：逾2年清空（appl_date < DATEADD(YEAR,-2,@SYS_DT)）→ cr_id/cr_nm=NULL, is_cr='N'
            步驟 2：離職清空（join ob_emphire, resign_date < @SYS_DT）→ cr_id/cr_nm=NULL, is_cr='N'
            步驟 3：CR 優先指派（join ob_empl_set ration>0）→ emplid=cr_id, dept_id=deptid_m, is_cr='Y'
  → [F101 Stage 3] 部門比例分派（案件池 WHERE is_cr<>'Y'，步驟 4 扣量，BR-F102-12）
  → [F101 Stage 4] 員工比例分派 + ASSIGNDAY（案件池 WHERE is_cr<>'Y'）
```

- `@SYS_DT` = `project_workym + '01'`（名單月第一天，對齊 SP；與 [F097](F097-work-ym-semantics-unification.md) `project_workym = target_work_ym` 一致）。
- 閘控讀取時機：建議在月名單分派 Stage 3 前置處理之 per-list 迴圈開始時讀取，與 F101 Stage 3 比例分派之 per-list 讀取點一致（US-153 技術備註）。
- dual-path（PG SQL 下推 / SQLite JS oracle）：CR 前置步驟須與 F101 一致支援 `DB_TYPE` 雙路徑，確定性使兩路徑逐列等價可測（沿用 [AD-E07-29](../implementation-log/AD-E07-v3.2-f101-stage3-4-proportional-assignment.md) §3.6 gate；JS↔SQL 等價門檻為 tdd / test-designer 承接，§11）。

## 6. Worked Example（CR 前置 + 扣量逐步走查）

> 供 test-designer 對齊。確定性鍵以「`appl_no` 升冪」示意（最終鍵 align I-DET-01）。

**輸入**：名單 OB202606001（`cr_enabled=true`）、`project_workym='202606'`、`@SYS_DT='2026-06-01'`；某三維分組共 **100 件**，其中 8 件 `cr_id` 非空：

| 案件 | cr_id | appl_date | resign_date(該業代) | ob_empl_set(ration>0) | 步驟結果 |
|---|---|---|---|---|---|
| c1 | E003 | 2025-03-01 | NULL（在職） | 有（deptid_m=XVE1） | 步驟 3 指派：emplid=E003, dept_id=XVE1, is_cr='Y' |
| c2 | E003 | 2025-05-10 | NULL | 有（XVE1） | 步驟 3 指派：is_cr='Y' |
| c3 | E005 | 2023-12-31 | NULL | 有（XVE2） | **步驟 1 清空**（< 2024-06-01 逾2年）→ is_cr='N' |
| c4 | E006 | 2025-08-01 | 2026-05-20（離職） | 有（XVE2） | **步驟 2 清空**（< 2026-06-01）→ is_cr='N' |
| c5 | E007 | 2025-09-01 | NULL | **無**（ration=0） | 步驟 3 不指派 → is_cr 維持原值、入比例池 |
| c6 | E999 | 2025-10-01 | （ob_emphire 查無） | 有（XVE1） | 步驟 2 不清空（INNER JOIN 不命中，BR-F102-08）→ 步驟 3 指派 is_cr='Y' |
| c7 | E003 | 2025-11-01 | NULL | 有（XVE1） | 步驟 3 指派：is_cr='Y' |
| c8 | E003 | 2024-06-01 | NULL | 有（XVE1） | 剛好 ≥2 年（≥ 2024-06-01 非 <）→ 步驟 3 指派 is_cr='Y' |

**步驟結果統計**：`is_cr='Y'` 共 **5 件**（c1/c2/c6/c7/c8）；清空 2 件（c3/c4）；不指派 1 件（c5，入池）。

**步驟 4 扣量**：F101 Stage 3 案件池 = 100 − 5 = **95 件**（c1/c2/c6/c7/c8 已預指派，排除；c5 雖原為 CR 但未指派、`is_cr<>'Y'`、入池）。各電銷課應分配基數 = 95（不含 5 件 CR）。XVE1 已有 4 件 CR 預指派（c1/c2/c7/c8）、XVE2 已有 0 件（c3/c4 已清空回 is_cr='N' 入池）。F101 對 95 件依 `ob_dept_pct` / `ob_empl_set` 比例分派，CR 案件之 `emplid`/`dept_id` 不被覆蓋。

## 7. Legacy 差異聲明（F102 刻意偏離 legacy 之處）

| Legacy SP 行為（st2_dept 第 116–190 行） | F102 行為 | 原因 / BR |
|---|---|---|
| `#OBPOOLDATA_LIST` 僅取 `B.PROD_KIND='01'`（汽車名單，第 136 行）；機車 / 商品名單隱含排除於 CR 邏輯 | 取所有 `cr_enabled=true` 名單，**不限 PROD_KIND**；名單種類由 per-list `cr_enabled` 控制 | `PROD_KIND='01'` 限制為 legacy 汽機車分法之歷史遺留；F102 改 per-list 閘控（BR-F102-01；機車預設見 §12 OQ-3） |
| 第 124 / 135 / 162 行被註解之 `B.LIST_NM NOT LIKE '%機車%'`（機車名單排除）為**死碼**（`/* */` 或 `--` 註解） | 不複製此隱含全域機車過濾；機車排除改由機車名單 `cr_enabled` 預設 `false` 達成（§12 OQ-3） | legacy 隱含過濾已停用；F102 顯式 per-list（BR-F102-01） |
| `#DEPTID_EMPLID_RATION` 查詢鍵 `LIST_NO=@LIST_NO`（同 prod_kind 之 MIN(LIST_NO)，第 164 行） | 查詢鍵 = 案件所屬 `list_no`（per-list） | 用戶確認 per-list 為刻意設計（BR-F102-10，與 F101 BR-F101-07 一致） |
| 第 171 行被註解之 `JOIN tblCfg_Person ON A.CR_ID=A2.ACCOUNT`（「是電銷人員才分配」檢查）為**死碼** | **不做** `tblCfg_Person` 電銷人員檢查；CR 業代是否合格僅以 `ob_empl_set ration>0` 判定 | legacy 該 join 已註解停用；無對應 CDMP 表（BR-F102-09） |
| 差額補足 / 案件指派 `ORDER BY NEWID()`（隨機，於 Stage 3/4 比例分派段，非 CR 段） | （屬 F101 範疇）確定性鍵取代 | F102 CR 段本身為確定性 SET-based UPDATE，無排序亂數（BR-F102-11） |
| `st3_emplid` SP 之 CR 段（CNT_CR 計算 / CR 超額隨機移除） | **不引用**（該段為 `/* */` 死碼） | 輸入明確：st3_emplid CR 段死碼勿引用（§13 SP ground truth 範圍） |
| 全域旗標 `OBASSIGNSET` / `cr_reassignment_enabled` 控制 CR 是否啟用 | per-list `ob_list_definition.cr_enabled`；全域旗標廢除 | US-107 / US-120 確立 per-list 唯一來源（BR-F102-03/13） |

## 8. 假設與約束

- **[CONSTRAINT] C-1**：CR 前置步驟（步驟 1→2→3）在 Stage 2（`tier_level` 已寫）之後、F101 Stage 3 比例分派之前執行；步驟內部嚴格序 1→2→3（BR-F102-04~09）。
- **[CONSTRAINT] C-2**：F101 之 Stage 3 前清除（BR-F101-06，清 `dept_id`/`emplid`/`assignday`、保留 `is_cr`）與 F102 步驟 3（寫入 `emplid`/`dept_id`/`is_cr`）之執行順序須協調——**步驟 3 須在 F101 清除之後執行**，否則步驟 3 寫入之 `emplid`/`dept_id` 會被清掉。具體實作順序（清除 → CR 步驟 → 比例分派）由架構師於 pipeline 設計確認（§12 OQ-1 附帶）。
- **[ASSUMPTION] A-1**：`cr_id` / `cr_nm` / `is_cr` 在 Stage 1 已從 `ob_pool_data_list` SELECT 帶入 `ob_monthly_run_result`（**建議預設**，§10 / §12 OQ-1）；若未帶入，步驟 1/2 清空改為「確保值為 NULL」、步驟 3 指派來源改 join `ob_pool_data_list` 讀取——此分歧由架構師裁示。
- **[ASSUMPTION] A-2**：同一 `cr_id` 對應多筆 `ob_empl_set` 記錄（多 `deptid_m`）時，取 `deptid_m ASC` 第一筆（建議，§12 OQ-2）；最終鍵由架構師定。
- **[ASSUMPTION] A-3**：機車名單（`ob_list_definition.prod_kind` 含「機車」/ `'02'`）之 `cr_enabled` 預設 `false`，與 legacy 機車排除一致；是否需差異化 migration 初始值由架構師裁示（§10 / §12 OQ-3）。
- **[ASSUMPTION] A-4**：F102 沿用 [AD-E07-29](../implementation-log/AD-E07-v3.2-f101-stage3-4-proportional-assignment.md) 之 I-IDEM-01（per-list 清除 + per-run 冪等）與 dual-path gate；CR 步驟為冪等 SET-based UPDATE，重跑結果一致。

## 9. Production 分派變化知會

- F102 啟用後，`cr_enabled=true` 名單之 `cr_id` / `cr_nm` / `is_cr` / `emplid` / `dept_id` 由「現況全空 / 全 N」改為「約 1.9% CR 案件有值且預指派」，**改變該名單各電銷課 / 員工之案件分佈**（CR 案件從各課 / 員工配額扣除，BR-F102-12）。
- **deploy 前須**：(a) 對代表性名單跑「F101 純比例分派 vs F102 CR 優先 + 比例」差異報告，量化 CR 案件數、各課 / 各員工件數分佈變化；(b) 業務知會並驗收（沿用 [F067](F067-compare-run-results.md) 比對工具，NFR-005 主驗收）；(c) deploy 後重跑 202606 驗證 CR 三欄有值、`is_cr='Y'`≈1.9%（AC-13）。

## 10. Schema Gap handoff（spec-writer 主動標示，交架構師裁示）

> 撰寫 spec 時對照 entity 實檔 + 已查證資料發現以下落差，**不臆造對齊、明確 flag**（feedback_spec_schema_gap_first）：

| Gap | 描述 | 現況（已查 entity / 資料） | F102 spec 處置 | handoff |
|-----|------|---------------------------|----------------|---------|
| **G-1：CR 三欄欄位流向** | CR 步驟須讀寫 `ob_monthly_run_result.cr_id`/`cr_nm`/`is_cr`，但這三欄在現行 Stage 1 是否已從 `ob_pool_data_list` 帶入 result 表？ | **已查證**：`ob_monthly_run_result` 之 `cr_id`/`cr_nm` **全空**、`is_cr` 全 `'N'`；`ob_pool_data_list` 之 `cr_id` 非空 344,092 筆、`is_cr='Y'` 118,116 筆（≈1.5%）。→ **目前未帶進 result 表**。entity 三欄皆已存在（`cr_id` VARCHAR(20) / `cr_nm` VARCHAR(50) / `is_cr` VARCHAR(1)，無需建欄） | A-1 建議：Stage 1 SELECT 帶入 `cr_id`/`cr_nm`/`is_cr` 至 result 表；CR 步驟直接在 result 工作集 UPDATE。若不帶入，步驟 3 改 join `ob_pool_data_list` 讀來源值 | 架構師確認 CR 三欄流向（§12 OQ-1，附建議：Stage 1 SELECT 帶入） |
| **G-2：cr_enabled 預設值文字矛盾** | `data-model.md` 與 US-153 背景多處描述 `cr_enabled` 預設 `true`，與實際 entity / migration 不符 | **已查證**：entity `ob-list-definition.entity.ts` 與 migration `1711360000182` 均為 `BOOLEAN NOT NULL DEFAULT false`；但 `data-model.md` L967「`cr_enabled` 恢復預設 `true`」、US-153 背景「預設為 `true`」 | F102 spec 一律以實際 `DEFAULT false` 為準（§3 / BR-F102-01）；**不自行修改 data-model.md**（system-architect 範疇） | 架構師修正 `data-model.md` 文字（§12 OQ-3 附帶；與機車預設 OQ 合併處理） |
| **G-3：ob_assign_config 退役** | US-154 廢除 `cr_reassignment_enabled` 後，`ob_assign_config` 表 / entity 是否完全閒置可 DROP？ | entity `ob-assign-config.entity.ts` 存在；US-154 不刪表 / 不刪 entity（保 TypeORM schema sync） | F102 spec 不裁定退役；標 `[DEPRECATED-F102]` 由 tdd-implementation 加注解（US-154 AC-2/3） | 架構師評估後續 sprint 是否 DROP TABLE + 廢 entity（§12 OQ-4） |

## 11. 測試覆蓋點名（test-designer / tdd 承接）

| 項目 | 承接 agent | 覆蓋要求 |
|------|-----------|---------|
| **閘控 cr_enabled=true / false**（AC-1/2/3/4） | test-designer | true 執行步驟 1–3；false 跳過 + is_cr 強制 N；混合名單互不干擾；快照鎖定 |
| **步驟 1 逾2年清空**（AC-5） | test-designer | `appl_date < DATEADD(YEAR,-2,@SYS_DT)` 嚴格小於邊界；不改 pool 原始資料 |
| **步驟 2 離職清空 + 查無員工不清**（AC-6/7） | test-designer | `resign_date < @SYS_DT` 嚴格小於；NULL 在職不觸發；INNER JOIN 查無不清空（BR-F102-08） |
| **兩規則皆執行不短路**（AC-7） | test-designer | 同時滿足兩規則仍清空；步驟 1 後步驟 2 續跑 |
| **步驟 3 有 ration 才指派**（AC-8） | test-designer | ration>0 命中才寫 emplid/dept_id/is_cr='Y'；無記錄不指派入池 |
| **步驟 4 扣量**（AC-9） | test-designer | F101 案件池 WHERE is_cr<>'Y'；基數扣 CR；不覆蓋 CR 案 emplid/dept_id |
| **確定性可重現**（AC-10） | test-designer | 不同 run_id 兩次 is_cr='Y' 集合相同；I-DET-01 靜態掃描為空 |
| **F059 doc 修正 / 無 service 讀全域旗標**（AC-11/12） | test-designer / tdd | F059 §1/§6 含 [DEPRECATED]；grep cr_reassignment_enabled service/web=0 |
| **202606 重跑 CR 三欄有值 ≈1.9%**（AC-13） | test-designer + 業務 | F064 匯出 regression；is_cr='Y' 每筆 cr_id 非空、emplid=cr_id |
| CR 欄位流向 / deptid_m 多筆取捨 / 清除順序 schema | tdd-implementation | 對齊架構師 §12 OQ-1/2 裁示 |
| Production 分派差異報告（§9） | test-designer + 業務 | F067 比對 |

## 12. 架構師 OQ（交 system-architect 裁示，spec-writer 附建議預設）

| ID | 問題 | 影響 | 建議預設 |
|----|------|------|---------|
| **OQ-1** | CR 三欄（`cr_id`/`cr_nm`/`is_cr`）欄位流向：Stage 1 SELECT 帶入 `ob_monthly_run_result` vs CR 步驟 join 回 `ob_pool_data_list`？並確認 F101 Stage 3 前清除（保留 is_cr）與 F102 步驟 3 寫入之執行順序（C-2） | CR 步驟讀寫來源；步驟 3 寫入是否被 F101 清除覆蓋 | **Stage 1 SELECT 帶入**（result 工作集 UPDATE 最單純、與 F101 set-based 一致）；執行順序 = F101 清除 → F102 CR 步驟 → F101 比例分派（§8 C-2） |
| **OQ-2** | 同一 `cr_id` 對應多筆 `ob_empl_set`（多 `deptid_m`）時取哪筆？legacy 無此分支 | 步驟 3 之 `dept_id` 決定性 | **`deptid_m ASC` 第一筆**（最具確定性，align I-DET-01） |
| **OQ-3** | 機車名單 `cr_enabled` migration 初始值是否需差異化為 `false`？且 `data-model.md` L967 / US-153「預設 true」文字與實際 `DEFAULT false` 矛盾須一併修正（§10 G-2） | 機車名單 CR 行為；文件一致性 | **不需新 migration**（現行 `DEFAULT false` 已符合機車排除；非機車名單若需 CR 由 admin 顯式設 `true`）；**修正 data-model.md** 文字為 `DEFAULT false`（system-architect 範疇） |
| **OQ-4** | `ob_assign_config` 表 / entity 在 `cr_reassignment_enabled` 廢除後是否完全閒置可 DROP TABLE + 廢 entity？（US-154 OPEN QUESTION-7） | schema 清理 | F102 不 DROP（保 TypeORM schema sync）；由架構師於後續 sprint 評估是否有其他 `config_key` 使用後再決定 |
| **OQ-5** | `architecture-spec.md` S2 稽核點「`cr_reassignment_enabled` 為唯一真實來源」須更新為 per-list `cr_enabled`（US-154 AC-5）——此檔由 system-architect 維護，spec-writer 不改 | 架構稽核點正確性 | 更新為「`[DEPRECATED-F102]` 全域旗標已廢棄；CR 開關唯一來源 = `ob_list_definition.cr_enabled`（per-list）；F102 US-154 已清理殘留」；狀態 `✅ 廢棄並更新（F102 US-154）` |

> **附帶（spec-writer 裁定，非交架構師）**：US-152 OQ-3（CR 業代查無 `ob_emphire` 不清空）已於 BR-F102-08 裁定沿用 legacy INNER JOIN 行為；US-153 OQ-6（月名單分派快照是否記每名單 `cr_enabled`）建議記入快照（呼應 [F066](F066-view-run-snapshot-detail.md) 稽核，與 F101 `ob_dept_pct`/`ob_empl_set` 快照一致）；US-154 OQ-8（prod 刪全域旗標 checklist）= deploy 文件列「查 `SELECT * FROM ob_assign_config WHERE config_key='cr_reassignment_enabled'`，若有舊記錄提供清理 SQL（不自動執行，避免誤刪其他 config）」（US-154 AC-1 備註）。

## 13. 相關

- 來源 story：US-152 / US-153 / US-154（`docs/stories/epics/E07-app-customer-list-assignment/`）
- 前置 / 交互：[F101](F101-stage3-4-proportional-assignment.md)（Stage 3/4 比例分派，扣量交互）、[AD-E07-29](../implementation-log/AD-E07-v3.2-f101-stage3-4-proportional-assignment.md)（I-DET-01 確定性鍵）、[F100](F100-stage2-4-sql-pushdown-scoring.md)（tier_level / Stage 2）
- 廢除 / 修正：[F059](F059-toggle-cr-reassignment.md)（DEPRECATED，全域開關誤述已修正）、[F050](F050-create-list-definition.md) / [F051](F051-edit-list-definition.md)（`cr_enabled` per-list 設定來源）
- 比例設定：[F082](F082-set-personnel-ratio.md)（ob_empl_set）
- 快照 / 匯出 / 差異：[F066](F066-view-run-snapshot-detail.md)（快照）、[F064](F064-export-assignment-result.md)（匯出驗證 AC-13）、[F067](F067-compare-run-results.md)（差異驗收 NFR-005）
- SP ground truth（UTF-16LE）：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（**第 116–190 行 CR LIVE 段**；`st3_emplid` 之 CR 段為 `/* */` 死碼，**不引用**）
- 圖表：[diagrams/F102-cr-priority-flow.mmd](../diagrams/F102-cr-priority-flow.mmd)
