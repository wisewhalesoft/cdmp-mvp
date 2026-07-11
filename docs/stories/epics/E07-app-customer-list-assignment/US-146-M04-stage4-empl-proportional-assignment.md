---
last-updated: 2026-06-04
version: v1.0
change-summary: "新增 story：月名單分派 Stage 4 依電銷課內員工比例（ob_empl_set.ration）分配案件，寫入 emplid/emplid_deptid；明確宣告 is_cr 簡化模型不執行 CR 優先分配，修復 OB202606001 全員 emplid=NULL 根本原因。"
---

# US-146：月名單分派 Stage 4 — 依員工比例分配案件（人員分配）

> **Story ID**：US-146
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8
> **Feature**：F101 月名單分派 Stage 3/4 真實比例分派

---

## User Story

**As a** 業務主管
**I want** Stage 4 在每間電銷課內依員工比例（`ob_empl_set.ration`）將案件指派給個別業務員，並同步寫入 `emplid` 與 `emplid_deptid`
**So that** 每位業務員收到的案件量符合其設定比例，消除現有 `emplid=NULL` 問題，案件可正確匯出給各業務員處理

---

## 背景說明

現有 placeholder 實作取 `ob_dept_pct` 第一列電銷課的第一位非 T3 員工作為 `defaultEmpl`，將所有 T1/T2 案件指向該員工，T3 案件指向第一位資深員工。當 dept[0]（如 AI000）在 `ob_empl_set` 無員工設定時，`defaultEmpl=null`，全部案件 `emplid=NULL`（已於 OB202606001 名單驗證）。

本 story 以 legacy `SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid` 基底算法為業務規則依據，並宣告 is_cr 簡化模型下與 legacy 的刻意偏差。

### Legacy 差異聲明

| Legacy 行為 | F101 行為 | 原因 |
|---|---|---|
| st3_emplid 讀 `OBEMPLSETMF` 比例鍵 = `MIN(LIST_NO, PROD_KIND)` | 讀 `ob_empl_set` 比例鍵 = 案件所屬 `list_no` | 用戶確認 per-list 語意（與 US-145 一致） |
| CR 優先分配：以 `cr_id` 查員工預指 `OB_EMPLID`，並從電銷課配額扣除已 CR 件數 | is_cr 僅為被動標記，所有案件（含 is_cr=Y）走相同比例分配流程 | `ob_monthly_run_result` 無 per-case `cr_id→emplid` 對應；簡化 is_cr 模型已鎖定 |
| CR 超額移除：某員工 CR 預分配件數超過其 ration 應得件數時，隨機移除超額件 | 此步驟不實作 | CR 優先分配機制不存在，超額問題不成立 |
| 差額補足與案件分配順序使用 `NEWID()` 亂數 | 使用確定性鍵排序（具體鍵由架構師決定，align OQ-06 先例） | 可重現性要求（US-150） |
| `ob_emphire.resign_date IS NULL` 過濾現職員工（st3 join OBEMPHIRE） | 依 `ob_empl_set.ration>0` 篩選；resign 判斷交由 E04 ETL 維護 `ob_empl_set` 資料現況 | ob_emphire 僅被 E04 通用擷取任務同步，F101 不直接 join |

---

## 驗收標準

### AC-1：依電銷課內員工比例計算應得件數

- **Given** Stage 3 完成後，電銷課 XVE1 的 T1 案件共 100 件；`ob_empl_set WHERE list_no='OB202606001' AND deptid_m='XVE1' AND ration>0` 有 3 位員工：E1(ration=50), E2(ration=30), E3(ration=20)
- **When** Stage 4 對（XVE1, T1）執行員工分配
- **Then** E1 初始應得 `FLOOR(100×50/100)`=50 件，E2=30 件，E3=20 件；差額=0

### AC-2：差額補足規則（兩階段）

- **Given** 電銷課 XVE2 的 T2 案件共 103 件；3 位員工 FLOOR 後合計 100 件，差額=3
- **When** Stage 4 計算差額補足
- **Then** 第一階段：`ADD_CNT = FLOOR(3/3) = 1`，每位員工均 +1 件（合計 103−0 差額消除），若仍有剩餘
- **And** 第二階段：剩餘差額以確定性排序讓前 N 位員工各 +1 件
- **And** 相同輸入重複執行，每位員工最終件數完全一致

### AC-3：is_cr=Y 案件與 is_cr=N 案件同等流入比例分配池（簡化 is_cr 模型）

- **Given** 電銷課 XVE3 的 T2 案件共 100 件，其中 40 件 `is_cr=Y`、60 件 `is_cr=N`
- **When** Stage 4 執行員工分配
- **Then** 100 件全部進入同一個比例分配池，依員工 ration 分配
- **And** 系統**不執行** legacy CR 優先指派（不依 `cr_id` 查員工並預指 `emplid`）
- **And** 系統**不執行** CR 超額移除（不因 is_cr=Y 件數超過 ration 應得件數而隨機移除案件）
- **And** `ob_monthly_run_result.is_cr` 欄位值保持原樣（標記保留，不影響分配邏輯）

> **設計說明**：legacy st2_dept + st3_emplid 透過 `cr_id` 將歷史成交客戶優先指回原業務員，並從電銷課配額扣除此部分件數。CDMP MVP 的 `ob_monthly_run_result` 無 per-case `cr_id→emplid` 對應，故此機制無法複製。is_cr=Y 為歷史標記，僅供業務員識別客戶性質，不驅動分配決策。此偏差為已確認的刻意設計。

### AC-4：分配完成後寫入 emplid 與 emplid_deptid

- **Given** 員工 E1 被分配到 50 件案件，E1 隸屬電銷課 XVE1
- **When** Stage 4 寫入結果
- **Then** 這 50 件案件的 `ob_monthly_run_result.emplid` = E1 的員工代號
- **And** `ob_monthly_run_result.emplid_deptid` = 'XVE1'

### AC-5：有 dept_id 且 ob_empl_set 有員工設定者，emplid 不得為 NULL（回歸保護）

- **Given** Stage 4 執行完畢
- **When** 查核 `ob_monthly_run_result`
- **Then** 以下查詢結果 = 0：
  ```
  SELECT COUNT(*)
  FROM ob_monthly_run_result
  WHERE dept_id IS NOT NULL
    AND dept_id IN (
      SELECT DISTINCT deptid_m FROM ob_empl_set
      WHERE list_no = <current_list_no> AND ration > 0
    )
    AND emplid IS NULL
  ```
- **And** 此斷言專門防止 OB202606001 型態的 `defaultEmpl=null` 缺陷再度發生

### AC-6：電銷課有 dept_id 但 ob_empl_set 無員工設定時，不中斷月名單分派，寫入 audit warning

- **Given** Stage 3 將 50 件案件分配至電銷課 AI000，但 `ob_empl_set WHERE deptid_m='AI000' AND ration>0` 無任何記錄
- **When** Stage 4 試圖分配 AI000 的案件
- **Then** 月名單分派**不因此中斷**，這 50 件案件的 `emplid` 保持 NULL
- **And** 寫入 `assignment_audit_log`（`event='STAGE4_NO_EMPL_WARN'`, `dept_id='AI000'`, `list_no`, `tier_level`, `case_count=50`）
- **And** 月名單分派完成摘要頁（US-083）顯示「人員分配警告」區塊，列出哪些電銷課有案件未能分配員工

---

## 技術備註

- 業務規則依據：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`（UTF-16LE 編碼，需以 `node toString('utf16le')` 解碼）
- 統一 Tier 集合：T1–T5（同 US-145；不再有 T1M/T52 等變體分支）
- `ob_empl_set` 查詢鍵：案件所屬 `list_no`（per-list）
- `ob_empl_set.prod_type` 欄位（儲存 'TIER:T*' 標記）不用於 F101 變體分流，T5 與 T1–T4 使用相同 ration 比例邏輯
- 確定性排序鍵由架構師決定（align Stage 1 OQ-06 先例）
- ASSIGNDAY 指派日計算由 US-149 負責（Stage 4 末段）；本 story 範圍至 `emplid`/`emplid_deptid` 寫入完成為止

---

## 測試案例

### TC-146-01：標準員工比例計算

- **Given**：電銷課 XVE3, T3, 100 件；2 位員工 E1(ration=60), E2(ration=40)
- **When**：Stage 4 執行
- **Then**：E1=60 件、E2=40 件；`emplid` 欄位無 NULL；`emplid_deptid` 均為 XVE3

### TC-146-02：is_cr=Y 案件不走 CR 優先路徑

- **Given**：XVE1, T1, 共 80 件，其中 20 件 is_cr=Y；員工 E1(ration=50), E2(ration=50)
- **When**：Stage 4 執行
- **Then**：E1、E2 各分配約 40 件（含部分 is_cr=Y 案件）；無任何案件因 is_cr=Y 被「優先指向特定員工」；`is_cr` 欄位值不變

### TC-146-03：OB202606001 回歸 — 有員工分處 emplid 不為 NULL

- **Given**：OB202606001 名單，XVE1~XVE4 均有 ob_empl_set 設定，AI000 無設定
- **When**：Stage 4 執行完畢
- **Then**：`dept_id IN (XVE1,XVE2,XVE3,XVE4) AND emplid IS NULL` = 0 件；AI000 的案件 `emplid=NULL` 且 audit_log 有對應 `STAGE4_NO_EMPL_WARN` 記錄

### TC-146-04：差額補足兩階段確定性

- **Given**：電銷課 5 位員工各 ration=20，案件數=103；FLOOR 後每人 20 件，差額=3
- **When**：Stage 4 計算
- **Then**：ADD_CNT=0（FLOOR(3/5)=0）；剩餘差額 3，依確定性排序前 3 位各 +1 件；第 4、5 位維持 20 件

---

## 依賴關係

- **Blocked By**：US-145（Stage 3 dept_id 必須已填入）、US-112（ob_empl_set 人員比例設定）
- **Blocks**：US-149（ASSIGNDAY 指派日，依賴 emplid 已填入）

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-6 全部通過
- [ ] TC-146-01 ~ TC-146-04 全部通過
- [ ] 回歸斷言（AC-5 查詢）以 automated test 形式存在
- [ ] Legacy 差異聲明中的五項偏差均有對應測試或說明
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)、[NFR-004](../../non-functional/NFR-004-snapshot-integrity.md)、[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-145（Stage 3 部門分配，前置）、US-149（ASSIGNDAY 指派日，後續）、US-150（確定性保證）
- **Reference SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`
