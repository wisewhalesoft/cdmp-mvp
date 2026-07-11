---
last-updated: 2026-06-12
version: v1.0
change-summary: "新增 story：F102 CR 優先分派核心——失效規則兩條（逾2年 + 離職）＋ CR 優先指派（ob_empl_set ration>0 前提）＋ 扣量（F101 Stage 3/4 只跑 is_cr<>'Y' 案件）；跑在 F101 比例分派之前。"
---

# US-152：月名單分派 CR 優先分派核心（失效清空 + 優先指派 + 扣量）

> **Story ID**：US-152
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8
> **Feature**：F102 月名單分派 CR 優先分派

---

## User Story

**As a** 業務主管
**I want** 月名單分派在 Stage 3 比例分派之前，先執行 CR 優先分派邏輯——清空失效的 CR 標記（逾2年或業代已離職），再將有效 CR 案件優先指派給原 CR 業代，並讓後續 Stage 3/4 比例分派只跑尚未被 CR 預指派的案件
**So that** CR 客戶（曾被特定業代服務的歷史客戶）能回到原業代手中，月名單分派結果中 CR 三欄（`cr_id`/`cr_nm`/`is_cr`）有值，對齊 legacy 名單約 1.9% 的 CR 案件比例

---

## 背景說明

F101（月名單分派 Stage 3/4 真實比例分派，commit `1ac93da`）在「Legacy 差異聲明」中刻意將 `is_cr` 簡化為被動標記，未實作 CR 優先分配機制。本 story 補足此差距。

**Legacy 依據**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（第 116–310 行，UTF-16LE；`@SYS_DT = PROJECT_WORKYM+'01'`，即名單月第一天），四個步驟跑在 Stage 3 比例分派之前：

| 步驟 | 說明 |
|---|---|
| 步驟 1（失效規則—逾2年） | `DATEADD(YEAR, -2, @SYS_DT) > APPL_DATE` → 清 `cr_id`/`cr_nm`、`is_cr='N'` |
| 步驟 2（失效規則—離職） | `ob_emphire.resign_date < @SYS_DT` → 清 `cr_id`/`cr_nm`、`is_cr='N'` |
| 步驟 3（CR 優先指派） | 剩餘 CR 案件（`cr_id` 非空）且 `ob_empl_set WHERE list_no=@LIST_NO AND ration>0` 能查到該 CR 業代 → `emplid=cr_id`、`dept_id=對應 deptid_m`、`is_cr='Y'` |
| 步驟 4（扣量） | F101 Stage 3/4 比例分派只取 `is_cr <> 'Y'` 的案件（CR 案已預指派，從各電銷課應分配量中扣除） |

**注意**：legacy `st3_emplid` 的 CR 段為死碼（`RETURN` 後），勿引用。

### Legacy 差異聲明

| Legacy 行為 | F102 行為 | 原因 |
|---|---|---|
| `#OBPOOLDATA_LIST` 只取 `PROD_KIND='01'`（汽車名單）| 取所有 `cr_enabled=true` 的名單，不限 PROD_KIND | 名單種類由 per-list `cr_enabled` 控制（詳見 US-153）；`PROD_KIND='01'` 限制是 legacy 汽機車分法的歷史遺留，F102 不複製 |
| `#DEPTID_EMPLID_RATION` 查詢鍵：`LIST_NO = @LIST_NO`（同月同 prod_kind 的 MIN(LIST_NO)） | 查詢鍵：案件所屬 `list_no`（per-list 語意，與 US-145/US-146 一致） | 用戶確認 per-list 語意為刻意設計 |
| 步驟 3 同時回寫 `OBPOOLDATA_LIST.OB_DEPT` 與 `OB_EMPLID` | 同時寫入 `ob_monthly_run_result.dept_id`、`emplid`、`emplid_deptid`（= `deptid_m`）、`is_cr='Y'` | `ob_monthly_run_result` 的欄位語意對應 |
| 失效規則中 `resign_date < @SYS_DT`（嚴格小於） | 沿用嚴格小於語意 | 對齊 legacy |

---

## 驗收標準

### AC-1：失效規則——逾2年清空 CR 標記

- **Given** 名單月（`project_workym`）為 '202607'；`@SYS_DT = '2026-07-01'`；案件 A 的 `appl_date = '2024-06-30'`（距名單月 > 2 年）；案件 B 的 `appl_date = '2024-07-01'`（距名單月剛好 ≤ 2 年）
- **When** CR 優先分派前置步驟（步驟 1）執行
- **Then** 案件 A 的 `cr_id` 清空為 NULL（或空字串）、`cr_nm` 清空、`is_cr = 'N'`
- **And** 案件 B 的 `cr_id`/`cr_nm`/`is_cr` **不受影響**，維持原值
- **And** 清空操作限於目前月名單分派的 `ob_monthly_run_result` 工作集，不修改 `ob_pool_data_list` 原始資料

### AC-2：失效規則——CR 業代已離職清空 CR 標記

- **Given** 案件 C 的 `cr_id = 'E001'`；`ob_emphire WHERE emp_id='E001'` 的 `resign_date = '2026-06-15'`（< '2026-07-01'）；案件 D 的 `cr_id = 'E002'`；E002 的 `resign_date IS NULL`（在職）
- **When** CR 優先分派前置步驟（步驟 2）執行
- **Then** 案件 C 的 `cr_id` 清空、`cr_nm` 清空、`is_cr = 'N'`
- **And** 案件 D 的 `cr_id`/`cr_nm`/`is_cr` 不受影響

### AC-3：失效規則順序——兩條規則均執行，互不跳過

- **Given** 案件 E 同時滿足「逾2年」且「業代已離職」
- **When** 步驟 1 與步驟 2 執行
- **Then** 案件 E 的 CR 標記被清空（任一規則觸發即清空，結果相同）
- **And** 步驟 1 執行後步驟 2 仍執行（不短路跳過）

### AC-4：CR 優先指派——業代在 ob_empl_set 有比例設定才指派

- **Given** 步驟 1、2 執行後，案件 F 的 `cr_id = 'E003'`（未被清空）；`ob_empl_set WHERE list_no = 案件所屬 list_no AND emplid = 'E003' AND ration > 0` 有對應記錄，`deptid_m = 'XVE1'`；案件 G 的 `cr_id = 'E004'`（未被清空），但 `ob_empl_set` 中 E004 無對應記錄（或 ration=0）
- **When** 步驟 3 執行
- **Then** 案件 F：`ob_monthly_run_result.emplid = 'E003'`、`dept_id` = （E003 在 ob_empl_set 對應的電銷課代號）、`emplid_deptid` = 同電銷課代號、`is_cr = 'Y'`
- **And** 案件 G：`emplid`/`dept_id` 維持 NULL（不指派）、`is_cr` 維持原值（非 'Y'）；案件 G 進入後續 Stage 3/4 比例分派池

### AC-5：扣量——F101 Stage 3/4 比例分派只跑 is_cr <> 'Y' 案件

- **Given** 名單 OB202606001 共 109,685 筆案件，其中 2,079 筆完成 CR 優先指派（is_cr='Y'）
- **When** Stage 3 部門比例分派執行
- **Then** Stage 3 的「未分派案件池」只包含 `is_cr <> 'Y'` 的案件（約 107,606 筆）
- **And** Stage 3 不重新處理 `is_cr = 'Y'` 的案件（不覆蓋已指派的 `emplid`/`dept_id`）
- **And** 各電銷課的應分配件數計算基數 = `is_cr <> 'Y'` 的案件總數（不含 CR 預指派件數）

### AC-6：確定性可重現（align F101 I-DET-01）

- **Given** 相同月名單分派設定（相同 list_no、work_ym、ob_empl_set、ob_emphire 資料）執行兩次
- **When** CR 優先分派步驟執行
- **Then** 兩次執行中，步驟 1/2 清空的案件集合完全相同（確定性判斷）
- **And** 步驟 3 指派的 emplid/dept_id/is_cr 完全相同
- **And** 不存在任何不確定性排序（`NEWID()`、`Math.random()` 等）

### AC-7：F064 匯出驗證——CR 三欄有值（對齊 legacy 1.9%）

- **Given** 202606 月名單分派重跑後，F064 匯出 `ob_monthly_run_result`
- **When** 以 `is_cr = 'Y'` 過濾
- **Then** CR 案件筆數約佔總筆數 1.9%（允許 ±0.3%，因失效規則清空部分案件）
- **And** `is_cr = 'Y'` 的每筆案件，`cr_id`/`cr_nm` 均非 NULL 且非空字串
- **And** `is_cr = 'Y'` 的每筆案件，`emplid` = `cr_id`（業代已正確指派）

---

## 技術備註

- **業務規則依據**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（UTF-16LE 編碼；`@SYS_DT = PROJECT_WORKYM+'01'`；第 128–182 行為 CR 段，第 259–308 行為扣量段）
- **ob_monthly_run_result 欄位**：`cr_id`/`cr_nm`/`is_cr` 已存在（無需新增欄位）；`dept_id`/`emplid`/`emplid_deptid` 同 F101
- **ob_emphire.resign_date**：DATE 型別，NULL 表示在職中；`resign_date < @SYS_DT`（嚴格小於，非 `<=`）
- **ob_empl_set 查詢鍵**：案件所屬 `list_no`（per-list）；ration 型別 NUMERIC(10,2)
- **執行順序**：步驟 1 → 步驟 2 → 步驟 3 → （F101 Stage 3 比例分派，只取 is_cr<>'Y'） → （F101 Stage 4）
- **US-153 依賴**：本 story 的執行必須先由 US-153 確認 `cr_enabled = true`，否則全名單跳過（詳見 US-153 AC-1）
- **確定性鍵**：步驟 3 若同一案件 `cr_id` 對應多筆 `ob_empl_set` 記錄（同員工多行），具體排序鍵由架構師決定（align F101 I-DET-01）

---

## [SCHEMA GAP] / [OPEN QUESTION]

- **[SCHEMA GAP-1]**：`ob_monthly_run_result` 中 `cr_id`/`cr_nm` 的型別是 VARCHAR(20)/VARCHAR(50)（對應 `ob_pool_data_list` 的來源欄位），需 spec-writer 確認這兩欄在 Stage 1 輸出後是否已從 `ob_pool_data_list` 正確複製至 `ob_monthly_run_result`，或需在月名單分派開始時補填。**若此欄在月名單分派開始時為 NULL，步驟 1/2 的清空邏輯須改為「確保值為 NULL」，步驟 3 的指派來源須從 `ob_pool_data_list` join 讀取。**

- **[OPEN QUESTION-1]**：`ob_pool_data_list.cr_id` 在 Stage 1 之後是否已複製到 `ob_monthly_run_result`？現有 Stage 1 SQL 是否 SELECT `cr_id`/`cr_nm`/`is_cr` 到 result 表？需架構師確認欄位流向。

- **[OPEN QUESTION-2]**：步驟 3 同一 CR 業代在同一名單有多筆 ob_empl_set 記錄（不同 prod_type 或重複）時，應取哪筆的 `deptid_m`？legacy 無此邏輯分支，需架構師以現有 I-DET-01 鍵決策。

- **[OPEN QUESTION-3]**：`ob_emphire` 中若 `cr_id` 查無對應員工記錄（即該員工從未進入 ob_emphire，也不在 ETL 歷史中），步驟 2 應視為「不觸發清空（因無 resign_date 可比較）」或「視同異常而清空」？legacy 用 JOIN，故查無記錄時 WHERE 不命中，等於不清空——F102 沿用此行為需在 spec 明確宣告。

- **[OPEN QUESTION-4]**：若同一案件 `cr_id = 'E003'` 在 `ob_empl_set` 有多筆記錄（分屬不同 `deptid_m`），步驟 3 應指派至哪個電銷課？請架構師決定排序鍵（建議 `deptid_m ASC` 最具確定性）。

---

## 測試案例

### TC-152-01：逾2年失效規則觸發

- **Given**：名單月 202607，案件 A `appl_date='2024-06-30'`（> 2 年），案件 B `appl_date='2024-07-01'`（≤ 2 年）；兩筆均有 cr_id
- **When**：步驟 1 執行
- **Then**：A 的 cr_id/cr_nm=NULL、is_cr='N'；B 維持原 cr_id/cr_nm/is_cr

### TC-152-02：離職業代失效規則觸發

- **Given**：E001 resign_date='2026-06-15'（< '2026-07-01'）；E002 resign_date IS NULL
- **When**：步驟 2 執行
- **Then**：cr_id='E001' 的案件清空；cr_id='E002' 的案件不受影響

### TC-152-03：CR 業代有 ration 設定才優先指派

- **Given**：E003 在 ob_empl_set LIST_NO='OB202606001' 有 ration>0、deptid_m='XVE1'；E004 無對應 ob_empl_set 記錄
- **When**：步驟 3 執行
- **Then**：cr_id='E003' 的案件 emplid='E003'、dept_id='XVE1'、is_cr='Y'；cr_id='E004' 的案件不指派，進入比例分派池

### TC-152-04：Stage 3 扣量——CR 案不進比例池

- **Given**：名單 100 件，20 件 is_cr='Y'（步驟 3 已指派）
- **When**：F101 Stage 3 執行
- **Then**：Stage 3 案件池大小 = 80 件；is_cr='Y' 的 20 件 emplid/dept_id 不被覆蓋

### TC-152-05：兩次執行結果一致（確定性）

- **Given**：固定測試種子（ob_empl_set、ob_emphire、ob_monthly_run_result 不變），執行兩次
- **When**：CR 優先分派步驟執行
- **Then**：兩次 is_cr='Y' 的案件集合完全相同（appl_no 列表一致）

### TC-152-06：F064 202606 CR 三欄有值回歸

- **Given**：202606 月名單分派已完成 CR 優先分派
- **When**：F064 匯出
- **Then**：is_cr='Y' 筆數約佔 1.9%；所有 is_cr='Y' 案件 cr_id 非空、emplid=cr_id

---

## 依賴關係

- **Blocked By**：US-146（F101 Stage 4，CR 優先分派須在 Stage 3/4 之前執行）、US-153（per-list cr_enabled gate）
- **Blocks**：US-145/US-146 的扣量修改（Stage 3/4 案件池需排除 is_cr='Y'）

---

## Definition of Done

- [ ] AC-1 ~ AC-7 全部通過
- [ ] TC-152-01 ~ TC-152-06 全部通過
- [ ] 確定性驗證：grep Stage 3/4 前置步驟無 NEWID()/Math.random()（TC-152-05 輔助）
- [ ] US-153 cr_enabled=false 時本 story 步驟完全跳過（整合測試）
- [ ] F064 202606 CR 三欄有值 regression 測試（TC-152-06）
- [ ] OPEN QUESTION-1（ob_monthly_run_result cr_id 來源）由架構師確認並記錄於 spec
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-004](../../non-functional/NFR-004-snapshot-integrity.md)、[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-153（per-list cr_enabled gate，前置）、US-154（全域旗標廢除）、US-145（Stage 3 扣量修改）、US-146（Stage 4 扣量修改）、US-150（確定性保證）
- **Reference SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（行 116–310）
