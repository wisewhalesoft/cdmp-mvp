---
last-updated: 2026-06-04
version: v1.0
change-summary: "新增 story：月名單分派 Stage 3 依（分處、名單、Tier）三維分組，按 ob_dept_pct.ration 比例分配電銷課；修復現有 placeholder 實作（所有案件指向 dept[0]）導致 OB202606001 emplid=NULL 的根本原因。"
---

# US-145：月名單分派 Stage 3 — 依電銷課比例分配案件（部門分配）

> **Story ID**：US-145
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8
> **Feature**：F101 月名單分派 Stage 3/4 真實比例分派

---

## User Story

**As a** 業務主管
**I want** 月名單分派 Stage 3 依各分處（`dept_id`）、名單（`list_no`）、Tier（`tier_level`）三維分組，按各電銷課的設定比例（`ob_dept_pct.ration`）將案件分配至對應電銷課
**So that** 每間電銷課收到的案件量符合比例設定，所有案件均取得 `dept_id`，不再因 placeholder 邏輯只取 dept[0] 而導致後續 Stage 4 `emplid=NULL`

---

## 背景說明

現有實作（`assignment-run-pipeline.service.ts` `executeV2` ~L586–619 及 `stage2to4-sql-executor.ts` `runStage4Sql`）為 placeholder：僅取 `ob_dept_pct` 第一列（dept[0]），將所有案件指向同一電銷課，再從該課取第一位非 T3 員工作為 `defaultEmpl`。當 dept[0]（如 AI000）在 `ob_empl_set` 無任何員工設定時，`defaultEmpl=null`，導致全部案件 `emplid=NULL`（已於 OB202606001 名單驗證）。

本 story 以 legacy `SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept` 基底算法為業務規則依據，以確定性排序取代 `NEWID()` 亂數，並以案件所屬 `list_no` 為比例查詢鍵（per-list 語意；與 legacy 取 `MIN(LIST_NO)` 的刻意偏差，詳見下方「Legacy 差異聲明」）。

### Legacy 差異聲明

| Legacy 行為 | F101 行為 | 原因 |
|---|---|---|
| `ob_dept_pct` 查詢鍵 = 同月同 PROD_KIND 的 `MIN(LIST_NO)` | 查詢鍵 = 案件所屬 `list_no` | 用戶確認 per-list 語意為刻意設計 |
| 差額補足使用 `NEWID()` 亂數排序 | 使用確定性鍵排序（具體鍵由架構師決定，align OQ-06 先例） | 可重現性要求（US-150） |
| st2_dept 以 CR 優先分配：以 `cr_id` 查員工預指 `ob_emplid`，並從電銷課配額扣除 | is_cr 僅為被動標記，所有案件走相同比例分配流程 | `ob_monthly_run_result` 無 per-case `cr_id→emplid` 對應；簡化 is_cr 模型已鎖定 |

---

## 驗收標準

### AC-1：依（分處、名單、Tier）三維分組並計算各電銷課應得件數

- **Given** Stage 3 執行，`ob_monthly_run_result` 中已有計分完成的 T1–T5 案件
- **When** 系統對單一三維分組（例：`dept_id='XVF1'`, `list_no='OB202606001'`, `tier_level='T1'`）執行 Stage 3
- **Then** 系統讀取 `ob_dept_pct WHERE list_no='OB202606001' AND ration>0`，取得各 `obdeptid` 的比例
- **And** 各電銷課初始應得件數 = `FLOOR(該三維分組總件數 × ration / 100)`
- **And** 差額件數（= 分組總件數 − 各課 FLOOR 值之和）以**確定性順序**補足，每課最多 +1 件，不使用亂數

### AC-2：確定性差額補足規則

- **Given** 某三維分組共 10 件，2 間電銷課比例各 33（FLOOR(10×33/100)=3），差額 = 10−6 = 4
- **When** 系統分配差額
- **Then** 差額件數依確定性排序（具體鍵由架構師決定）補足，前 4 課各 +1 件
- **And** 相同輸入重複執行，差額分配結果完全一致（可驗證性測試，詳見 US-150 AC-2）

### AC-3：依電銷課配額循序從未分配案件池指派

- **Given** 各課已計算出最終應得件數
- **When** 系統從該三維分組的未分配案件池指派
- **Then** 依確定性排序鍵從案件池取出 N 件（N = 該課應得件數），更新 `ob_monthly_run_result.dept_id`
- **And** 已分配案件從池中移除，下一課繼續從剩餘案件取件
- **And** 全部三維分組處理完畢後，每筆案件 `dept_id` 不為 NULL（`ration>0` 且案件屬該分組者）

### AC-4：OB202606001 多分處回歸情境 — 電銷課分配不受下游員工存在性影響

- **Given** 名單 OB202606001 的 `ob_dept_pct` 含 8 個電銷課（如 AI000/AM000/B0000/BD000/XVE1~XVE4），其中 AI000 在 `ob_empl_set` 無任何員工設定
- **When** Stage 3 執行完畢
- **Then** `dept_id='AI000'` 的案件件數等於 `FLOOR(分組件數 × AI000_ration/100)` + 差額補足
- **And** 不發生所有案件集中至同一電銷課的退化情況（SELECT DISTINCT dept_id 數量 = ration>0 的課數）
- **And** Stage 3 不因下游 Stage 4 的員工存在性而調整分配邏輯（電銷課層級與員工層級嚴格分離）

### AC-5：Stage 3 執行前清除同月份 T1–T5 案件的前次電銷課分配

- **Given** 月名單分派執行（含重跑情境）
- **When** Stage 3 開始
- **Then** 同月份、T1–T5 全部 Tier 的 `ob_monthly_run_result` 中 `dept_id`、`emplid`、`assignday` 欄位清空
- **And** `is_cr` 標記不受清空影響，保留原值

### AC-6：ob_dept_pct 無對應資料時月名單分派不中斷，寫入 audit warning

- **Given** 某名單的 `ob_dept_pct` 無任何 ration>0 的記錄
- **When** Stage 3 執行
- **Then** 月名單分派**不中斷**，該名單該 Tier 所有案件 `dept_id` 保持 NULL
- **And** 寫入 `assignment_audit_log`（`event='STAGE3_NO_DEPT_RATION'`, `list_no`, `tier_level`）
- **And** 月名單分派完成摘要頁（US-083）顯示對應警告

---

## 技術備註

- 業務規則依據：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（UTF-16LE 編碼，需以 `node toString('utf16le')` 解碼）
- 統一 Tier 集合：T1–T5（migration `1711360000162-MigrateObTierTierLevelSuffix.ts` 已將所有 legacy 變體代碼收斂；`ob_monthly_run_result.tier_level` 不再出現 T1M/THC/T52 等）
- `ob_dept_pct` 查詢鍵：案件所屬 `list_no`（per-list；legacy `MIN(LIST_NO)` 語意已刻意捨棄）
- 確定性排序鍵由架構師決定（align Stage 1 OQ-06 先例）；spec-writer 撰寫 F101 spec 時須明確記錄選用的鍵
- 此 story 不觸及 Stage 4 員工分配邏輯（由 US-146 負責）

---

## 測試案例

### TC-145-01：標準三維分組比例計算

- **Given**：dept_id='XVF1', list_no='OB202606001', tier_level='T2'，總件數=100；ob_dept_pct 有 3 課：A(ration=50), B(ration=30), C(ration=20)
- **When**：Stage 3 執行
- **Then**：A=50 件、B=30 件、C=20 件；差額=0；3 課合計=100

### TC-145-02：差額補足確定性

- **Given**：同上但總件數=101
- **When**：Stage 3 執行
- **Then**：差額=1，依確定性排序第 1 課 +1 件；相同輸入執行兩次，各課件數完全一致

### TC-145-03：OB202606001 八電銷課分配不退化（回歸測試）

- **Given**：ob_dept_pct 含 8 課各有 ration 設定；AI000 在 ob_empl_set 無員工
- **When**：Stage 3 執行
- **Then**：`SELECT COUNT(DISTINCT dept_id) FROM ob_monthly_run_result WHERE list_no='OB202606001'` = 8；不出現 `dept_id` 單一值佔全部案件情況

### TC-145-04：ob_dept_pct 無資料不中斷

- **Given**：名單 OB202606001 的 ob_dept_pct 無任何記錄
- **When**：Stage 3 執行
- **Then**：月名單分派繼續；`dept_id` = NULL；audit_log 含 `STAGE3_NO_DEPT_RATION`

---

## 依賴關係

- **Blocked By**：US-109（部門比例設定 ob_dept_pct）、US-081（月名單分派觸發）
- **Blocks**：US-146（Stage 4 員工分配依賴 dept_id 已填入）

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-6 全部通過
- [ ] TC-145-01 ~ TC-145-04 全部通過
- [ ] OB202606001 回歸測試：8 分處各有案件，`emplid=NULL` 問題不再發生
- [ ] Legacy 差異聲明中的三項偏差均有對應測試（is_cr 被動標記、per-list 查詢鍵、確定性排序）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)、[NFR-004](../../non-functional/NFR-004-snapshot-integrity.md)、[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-146（Stage 4 員工分配）、US-149（ASSIGNDAY 指派日）、US-150（確定性保證）
- **Reference SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`
