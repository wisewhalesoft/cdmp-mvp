# US-116：部長核准名單（簽核通過 → 準備完成）

> **Story ID**：US-116
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03c 簽核階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在確認名單的設定（篩選條件、部門比例、個別業務比例、CR 開關）均正確後，正式核准名單，使其進入「準備完成」階段
**So that** 名單通過最終審核，標記為可用於月名單分派的狀態，並在確認清單中可見

---

## 背景說明

本 Story 是五階段流程（US-105）第四階段「簽核（Stage 4 / `approval`）」的核准操作。

名單由 US-114 推進至簽核後，由部長或 Admin 審核並核准。核准後名單進入第五階段「準備完成（ready）」。

**簽核階段的二分法**：
- **核准（本 Story，US-116）**：名單 → ready，等待月名單分派
- **拒絕（US-117）**：名單退回至個別業務比例設定階段，處長重新設定
- **無獨立 Rollback button**：簽核階段的「退回」以「拒絕」操作取代

---

## 驗收標準

### AC-1：簽核階段名單顯示「核准」按鈕

- **Given** 部長或 Admin 在 M01 名單五階段總覽（US-105）查看某個 `stage = 'approval'` 的名單
- **When** 頁面顯示操作欄
- **Then** 顯示「核准」按鈕（與「拒絕」按鈕並排，見 US-117）
- **And** 處長帳號**不顯示「核准」或「拒絕」按鈕**

### AC-2：核准前摘要確認（部長可查看完整設定）

- **Given** 部長點擊「核准」前，可先查看名單的完整設定摘要
- **When** 進入名單詳情頁或摘要面板
- **Then** 顯示完整設定摘要（參見 US-118：篩選條件 + 部門比例 + 個別業務比例 + CR 開關）
- **And** 摘要為唯讀，不提供修改入口

### AC-3：核准確認對話框

- **Given** 部長或 Admin 在確認名單設定無誤後點擊「核准」按鈕
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認核准名單『{LIST_NM}』（{LIST_NO}）？核准後名單將進入準備完成階段，可用於月名單分派。」
- **And** 對話框提供「確認核准」與「取消」兩個按鈕

### AC-4：執行核准

- **Given** 部長或 Admin 在確認對話框點擊「確認核准」
- **When** 後端處理核准請求
- **Then** 系統將名單的 `stage` 從 'approval' 更新為 'ready'
- **And** 操作寫入 `assignment_audit_log`（action = 'APPROVE'，entity_type = 'list_definition'，after_payload 含 stage = 'ready'，operator_id = 部長帳號 ID）
- **And** 頁面成功提示「名單『{LIST_NM}』已核准，進入準備完成階段」，清單刷新

### AC-5：核准後名單出現在「準備完成」清單

- **Given** 名單 `stage` 已更新為 'ready'
- **When** 部長或處長進入 US-118（準備完成階段查詢摘要）
- **Then** 該名單出現在準備完成清單中，可查看完整摘要

### AC-6：月名單分派執行中禁止核准

- **Given** 目前有 AssignmentRun status = 'running' 的月名單分派
- **When** 部長或 Admin 嘗試點擊「核准」按鈕
- **Then** 核准按鈕為停用狀態，hover 顯示提示「分派執行中，無法核准名單」

---

## 技術備註

- `stage` 欄位更新：`ob_list_definition.stage = 'ready'`（從 'approval'）
- 核准後不提供修改任何設定資料（所有欄位為唯讀，直至月名單分派後歸入歷史月份）
- 若需在核准後修改，需透過 US-119（準備完成 Rollback 至簽核）退回後再由 US-117（拒絕）退回至個別業務比例設定
- **[通知 spec-writer]**：F002（auth/permission spec）需確認部長在簽核階段的核准操作使用 `DirectorGuard`

---

## 測試案例

### TC-116-01：正常核准

- **Given**：LIST_NO = 'OB202506001'，stage = 'approval'；部長帳號
- **When**：部長點擊「核准」→ 確認對話框 → 點擊「確認核准」
- **Then**：`stage` 更新為 'ready'；稽核日誌新增 action = 'APPROVE'；清單階段標籤更新為「準備完成」

### TC-116-02：處長無法核准

- **Given**：帳號持有「處長」角色；LIST_NO = 'OB202506001'，stage = 'approval'
- **When**：處長嘗試呼叫核准 API
- **Then**：後端回 403 Forbidden；清單頁無「核准」按鈕

### TC-116-03：核准後名單出現在準備完成清單

- **Given**：LIST_NO = 'OB202506001' 剛完成核准，`stage = 'ready'`
- **When**：部長進入 US-118 準備完成查詢頁
- **Then**：LIST_NO = 'OB202506001' 出現在清單中

### TC-116-04：月名單分派中禁止核准

- **Given**：AssignmentRun status = 'running'
- **When**：部長嘗試點擊「核准」
- **Then**：按鈕停用，顯示「分派執行中，無法核准名單」

---

## 依賴關係

- **Blocked By**：US-114（推進至簽核，才有 stage = 'approval' 名單）、US-100（部長角色定義）
- **Blocks**：US-118（準備完成階段查詢摘要，核准後名單在此可見）、US-081（月名單分派觸發，依賴 ready 名單）
- **Rollback 反向**：US-119（準備完成 Rollback 至簽核，可退回本 Story 的核准操作）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 正常核准測試（TC-116-01）
- [ ] 處長被拒測試（TC-116-02）
- [ ] 核准後準備完成清單顯示測試（TC-116-03）
- [ ] 月名單分派中禁止核准測試（TC-116-04）
- [ ] AssignmentAuditLog 寫入測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-105（五階段總覽）、US-114（推進至簽核）、US-117（拒絕 = 退回簽核）、US-118（準備完成查詢摘要）、US-119（準備完成 Rollback）、US-081（月名單分派觸發）
