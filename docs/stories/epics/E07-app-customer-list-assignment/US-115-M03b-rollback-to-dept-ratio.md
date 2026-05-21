# US-115：個別業務比例設定階段 Rollback 至部門比例設定

> **Story ID**：US-115
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03b 個別業務比例設定階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 將一份處於「個別業務比例設定」階段的名單退回至「部門比例設定」階段
**So that** 當部門比例策略需要重新調整時，能清空所有處長的個別業務比例設定，從部門比例重新開始

---

## 背景說明

本 Story 實作五階段流程（US-105）中，「個別業務比例設定（Stage 3 / `personnel_ratio`）」退回至「部門比例設定（Stage 2 / `dept_ratio`）」的 Rollback 機制。

**Rollback 語意（OQ-C-02 確認）**：
- Rollback 是「退回（回到上一階段）」，非「取消（刪除）」
- **清空本階段資料**：所有處長已設定的個別業務員 RATION **全部清空**（不僅限於某一部門）
- 部門比例（US-109 設定的 `ob_dept_pct`）保留，不清空（退回至 dept_ratio 階段後可重新修改）
- 僅部長 / Admin 可執行 Rollback（處長無 Rollback 權限）

---

## 驗收標準

### AC-1：個別業務比例設定階段顯示「退回部門比例設定」按鈕

- **Given** 部長或 Admin 在 M01 名單五階段總覽（US-105）查看某個 `stage = 'personnel_ratio'` 的名單
- **When** 頁面顯示操作欄
- **Then** 顯示「退回部門比例設定」按鈕
- **And** 處長帳號**不顯示「退回」按鈕**

### AC-2：Rollback 確認對話框

- **Given** 部長或 Admin 點擊「退回部門比例設定」按鈕
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{LIST_NM}』（{LIST_NO}）退回部門比例設定階段？退回後，**所有部門的個別業務比例設定將全部清空**，各處長需重新設定。部門比例設定保留不受影響。」
- **And** 對話框提供「確認退回」與「取消」兩個按鈕

### AC-3：執行 Rollback

- **Given** 部長或 Admin 在確認對話框點擊「確認退回」
- **When** 後端處理 Rollback 請求
- **Then** 系統將名單的 `stage` 從 'personnel_ratio' 更新為 'dept_ratio'
- **And** 清空該 LIST_NO **所有部門**的個別業務員 RATION（`ob_empl_set` 中對應 LIST_NO 的所有記錄刪除或設為 NULL）
- **And** 部門比例（`ob_dept_pct`）**不清空**，保留原設定
- **And** 部門比例欄位解鎖（`dept_ratio` 階段允許修改 `ob_dept_pct`）
- **And** 操作寫入 `assignment_audit_log`（action = 'ROLLBACK_STAGE'，before_payload 含 stage = 'personnel_ratio'，after_payload 含 stage = 'dept_ratio'）
- **And** 頁面成功提示「名單『{LIST_NM}』已退回部門比例設定階段，個別業務比例已全部清空」，清單刷新

### AC-4：Rollback 後部門比例可再修改

- **Given** 名單已執行 Rollback 至 'dept_ratio'
- **When** 部長在部門比例設定頁（US-109）查看
- **Then** 部門比例（RATION）顯示（保留原值，未清空），可再度進入編輯模式修改

### AC-5：Rollback 後個別業務比例為空

- **Given** 名單已執行 Rollback 至 'dept_ratio'
- **When** 部長或處長嘗試進入個別業務比例設定頁（此時 stage = 'dept_ratio'，非 personnel_ratio）
- **Then** 系統不允許進入（stage 不符），頁面顯示「此名單目前處於部門比例設定階段，尚未進入個別業務比例設定」

### AC-6：月跑執行中禁止 Rollback

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 部長或 Admin 嘗試點擊「退回部門比例設定」按鈕
- **Then** 按鈕為停用狀態，hover 顯示提示「分派執行中，無法退回階段」

---

## 技術備註

- `stage` 欄位更新：`ob_list_definition.stage = 'dept_ratio'`（從 'personnel_ratio'）
- 清空個別業務比例：`DELETE FROM ob_empl_set WHERE list_no = {LIST_NO}`（清空所有部門）
- 部門比例保留：`ob_dept_pct` 中對應 LIST_NO 的記錄**不刪除**
- Rollback 操作的 `assignment_audit_log` 需記錄 before/after stage

---

## 測試案例

### TC-115-01：正常 Rollback 至部門比例設定

- **Given**：LIST_NO = 'OB202506001'，stage = 'personnel_ratio'，`ob_empl_set` 有 3 個部門共 10 筆記錄；部長帳號
- **When**：部長點擊「退回部門比例設定」→ 確認退回
- **Then**：`stage` 更新為 'dept_ratio'；`ob_empl_set` 的 10 筆記錄被清空；`ob_dept_pct` 保留原 3 部門比例記錄；稽核日誌新增 ROLLBACK_STAGE

### TC-115-02：Rollback 後部門比例可再修改

- **Given**：LIST_NO = 'OB202506001' 已執行 Rollback 至 'dept_ratio'；`ob_dept_pct` 保有原設定
- **When**：部長進入部門比例設定頁，修改 XTC0 的 RATION 並儲存
- **Then**：修改成功，`ob_dept_pct` 更新

### TC-115-03：處長無法執行 Rollback

- **Given**：帳號持有「處長」角色
- **When**：嘗試呼叫 Rollback API
- **Then**：後端回 403 Forbidden；清單頁無「退回」按鈕

### TC-115-04：月跑中禁止 Rollback

- **Given**：AssignmentRun status = 'running'
- **When**：部長嘗試點擊「退回部門比例設定」
- **Then**：按鈕停用，顯示「分派執行中，無法退回階段」

---

## 依賴關係

- **Blocked By**：US-112（個別業務比例設定，退回時清空此 Story 產生的資料）、US-110（推進至個別業務比例，Rollback 此操作）、US-100（部長角色定義）
- **Blocks**：（退回後，US-109 部門比例設定重新開放修改）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 正常 Rollback 測試（TC-115-01）
- [ ] Rollback 後部門比例保留且可修改測試（TC-115-02）
- [ ] 處長被拒測試（TC-115-03）
- [ ] 月跑中禁止 Rollback 測試（TC-115-04）
- [ ] AssignmentAuditLog 寫入（before/after stage）測試
- [ ] 個別業務比例清空驗證測試
- [ ] 部門比例保留驗證測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-105（五階段總覽，退回入口）、US-110（推進至此階段，Rollback 的逆操作）、US-112（個別業務比例設定，清空其資料）、US-109（部門比例設定，退回後重新開放修改）

---

## v2.0 更新（2026-05-21）

> **變更來源**：M01 主頁改為 Kanban 看板（US-130），操作入口隨之調整

### AC-1 修訂（v2.0）：操作入口改為 Kanban 卡片按鈕

> 取代原 AC-1 中「在 M01 名單五階段總覽（US-105）查看操作欄」的描述。

- **Given** 部長或 Admin 在 M01 名單定義主頁（Kanban，US-130）查看 `personnel_ratio` 欄的名單卡片
- **When** 頁面渲染卡片操作按鈕
- **Then** 卡片上顯示「退回」按鈕（灰色邊框，undo-2 icon）
- **And** 處長帳號的 `personnel_ratio` 卡片**不顯示「退回」按鈕**

### AC-3 補充（v2.0）：Rollback 完成後留在 Kanban 主頁

> 補充 AC-3 的 UI 結果行為（原版未指定頁面行為）。

- **Given** 部長或 Admin 確認退回部門比例設定
- **When** 後端處理成功
- **Then** 名單卡片從 `personnel_ratio` 欄移動至 `dept_ratio` 欄（Kanban 即時刷新，無跳頁）
- **And** 頁面顯示 info toast：「{LIST_NO} 已退回部門比例設定，個別業務比例已全部清空」
