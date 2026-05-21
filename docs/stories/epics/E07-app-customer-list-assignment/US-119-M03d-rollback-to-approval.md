# US-119：準備完成階段 Rollback 至簽核（月跑前重新審核）

> **Story ID**：US-119
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03d 準備完成階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **來源**：OQ-C-02 確認新增（2026-05-15）

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在月跑執行前發現問題，將「準備完成」階段的名單退回至「簽核」階段，讓部長重新審核設定
**So that** 在月跑前有最後一道退回機制，避免帶著錯誤設定執行月跑；退回後名單從準備完成清單移出

---

## 背景說明

本 Story 實作五階段流程（US-105）中，「準備完成（Stage 5 / `ready`）」退回至「簽核（Stage 4 / `approval`）」的 Rollback 機制。

**此 Story 來源（OQ-C-02 確認）**：
- 除草稿（第一階段，不可 Rollback）與簽核（用「拒絕」取代 Rollback）外，其餘三個非草稿階段均需提供 Rollback
- 準備完成 → 簽核的 Rollback 用於「月跑前發現問題需重新審核」的場景
- Rollback 語意：「退回（回到上一階段）」，非「取消（刪除名單）」

**退回規則**：
- 退回後名單 `stage` 更新為 'approval'（重回簽核），等待部長重新核准或拒絕
- 退回後名單**從準備完成清單移出**（US-118 不再顯示）
- 設定資料（篩選條件、部門比例、個別業務比例、CR 開關）**全部保留**，不清空
- 退回後部長可直接核准（US-116）或拒絕（US-117）

---

## 驗收標準

### AC-1：準備完成階段名單顯示「退回簽核」按鈕

- **Given** 部長或 Admin 在 M01 名單五階段總覽（US-105）或準備完成清單頁（US-118）查看某個 `stage = 'ready'` 的名單
- **When** 頁面顯示操作欄
- **Then** 顯示「退回簽核」按鈕
- **And** 處長帳號**不顯示「退回簽核」按鈕**

### AC-2：Rollback 確認對話框

- **Given** 部長或 Admin 點擊「退回簽核」按鈕
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{LIST_NM}』（{LIST_NO}）退回簽核階段？退回後名單將從準備完成清單移出，需重新核准才能再次進入準備完成。設定資料不受影響。」
- **And** 對話框提供「確認退回」與「取消」兩個按鈕

### AC-3：執行 Rollback

- **Given** 部長或 Admin 在確認對話框點擊「確認退回」
- **When** 後端處理 Rollback 請求
- **Then** 系統將名單的 `stage` 從 'ready' 更新為 'approval'
- **And** 所有設定資料（`ob_list_definition` 篩選條件、`ob_dept_pct` 部門比例、`ob_empl_set` 個別業務比例、CR 開關）**全部保留不清空**
- **And** 操作寫入 `assignment_audit_log`（action = 'ROLLBACK_STAGE'，before_payload 含 stage = 'ready'，after_payload 含 stage = 'approval'）
- **And** 頁面成功提示「名單『{LIST_NM}』已退回簽核階段，設定資料保留」，清單刷新

### AC-4：退回後名單從準備完成清單移出

- **Given** 名單已執行 Rollback 至 'approval'
- **When** 部長或處長進入 US-118 準備完成查詢頁
- **Then** 該名單**不再出現**於準備完成清單
- **And** 在 US-105 五階段總覽中，該名單階段標籤更新為「簽核」

### AC-5：退回後可重新核准或拒絕（設定資料保留）

- **Given** 名單已退回至 'approval'
- **When** 部長在簽核階段查看該名單
- **Then** 可直接核准（US-116）或拒絕（US-117）
- **And** 查看設定摘要時，篩選條件、部門比例、個別業務比例、CR 開關均顯示為退回前的原設定值（資料保留）

### AC-6：月跑執行中禁止 Rollback

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 部長或 Admin 嘗試點擊「退回簽核」按鈕
- **Then** 按鈕為停用狀態，hover 顯示提示「分派執行中，無法退回階段」

---

## 技術備註

- `stage` 欄位更新：`ob_list_definition.stage = 'approval'`（從 'ready'）
- 設定資料保留：退回時**不刪除**任何 `ob_dept_pct` / `ob_empl_set` / `ob_list_definition` 設定欄位資料
- US-118 的「月跑前置條件提示」（AC-4）依此 Story 的退回操作動態更新：名單退回後，提示重新計算未就緒名單
- 月跑中資料鎖判斷：查詢 `assignment_run` 是否有 status = 'running' 記錄

---

## 測試案例

### TC-119-01：正常 Rollback 至簽核（設定資料保留）

- **Given**：LIST_NO = 'OB202506001'，stage = 'ready'，有完整設定（3 部門、8 業務員、CR 啟用）；部長帳號
- **When**：部長點擊「退回簽核」→ 確認退回
- **Then**：`stage` 更新為 'approval'；`ob_dept_pct` / `ob_empl_set` 資料均保留；稽核日誌新增 ROLLBACK_STAGE；名單從 US-118 清單移出；US-105 清單顯示「簽核」標籤

### TC-119-02：退回後可直接重新核准

- **Given**：LIST_NO = 'OB202506001' 已退回至 'approval'
- **When**：部長在簽核階段點擊「核准」
- **Then**：名單重新進入 ready 狀態，重新出現於 US-118 清單

### TC-119-03：處長無法執行 Rollback

- **Given**：帳號持有「處長」角色
- **When**：嘗試呼叫 Rollback API
- **Then**：後端回 403 Forbidden；頁面無「退回簽核」按鈕

### TC-119-04：月跑中禁止 Rollback

- **Given**：AssignmentRun status = 'running'；LIST_NO = 'OB202506001'，stage = 'ready'
- **When**：部長嘗試點擊「退回簽核」
- **Then**：按鈕停用，顯示「分派執行中，無法退回階段」

### TC-119-05：US-118 月跑前置條件提示即時更新

- **Given**：本月 3 份名單原本均為 ready（US-118 顯示「所有名單已就緒」）
- **When**：部長對其中 1 份執行退回簽核
- **Then**：US-118 頁面提示更新為「以下名單尚未就緒：{LIST_NM_X}（簽核）」警告提示

---

## 依賴關係

- **Blocked By**：US-116（核准，才有 stage = 'ready' 名單）、US-100（部長角色定義）
- **Blocks**：（退回後，US-116 核准或 US-117 拒絕操作重新開放）
- **月跑關聯**：US-081（月跑觸發）依賴所有名單為 ready；退回後此名單不再計入 ready，月跑前提條件重新失效

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 正常 Rollback 測試（TC-119-01）
- [ ] 退回後重新核准測試（TC-119-02）
- [ ] 處長被拒測試（TC-119-03）
- [ ] 月跑中禁止 Rollback 測試（TC-119-04）
- [ ] US-118 月跑前提示即時更新測試（TC-119-05）
- [ ] 設定資料保留驗證測試（ob_dept_pct / ob_empl_set 均未清空）
- [ ] AssignmentAuditLog 寫入（before/after stage）測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-105（五階段總覽，退回入口）、US-116（核准，Rollback 的逆操作）、US-117（拒絕，退回後可執行）、US-118（準備完成查詢，退回後移出清單）、US-081（月跑觸發，受退回影響的前置條件）

---

## v2.0 / v2.2 更新（2026-05-21）

> **變更來源**：v2.0 Kanban 重構（操作入口調整）+ v2.2 移除 per-card 月跑觸發

### AC-1 修訂（v2.0）：操作入口改為 Kanban 卡片按鈕

> 取代原 AC-1 中「在 M01 名單五階段總覽（US-105）或準備完成清單頁（US-118）」的操作欄描述。

- **Given** 部長或 Admin 在 M01 名單定義主頁（Kanban，US-130）查看 `ready` 欄的名單卡片
- **When** 頁面渲染卡片操作按鈕
- **Then** 卡片上顯示「退回」按鈕（灰色邊框，undo-2 icon）
- **And** 處長帳號的 `ready` 卡片**不顯示「退回」按鈕**
- **And** `ready` 卡片上**不存在**任何「觸發月跑」或「執行」相關按鈕（v2.2 移除，月跑唯一入口為 US-132 Ready CTA banner）

### AC-3 補充（v2.0）：Rollback 完成後留在 Kanban 主頁

> 補充 AC-3 的 UI 結果行為（原版未指定頁面行為）。

- **Given** 部長或 Admin 確認退回簽核
- **When** 後端處理成功
- **Then** 名單卡片從 `ready` 欄移動至 `approval` 欄（Kanban 即時刷新，無跳頁）
- **And** 頁面顯示 info toast：「{LIST_NO} 已退回簽核階段，設定資料保留」
- **And** Ready 欄頂 CTA banner 的名單數量即時更新（N-1）
