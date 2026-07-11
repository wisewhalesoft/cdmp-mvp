# US-117：部長拒絕名單並退回個別業務比例設定（簽核拒絕）

> **Story ID**：US-117
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03c 簽核階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在名單簽核時發現比例設定不符合業務需求，能填寫拒絕原因並退回至「個別業務比例設定」階段，要求處長重新設定
**So that** 有明確的審核拒絕機制，處長能根據拒絕原因針對性修正，不需重走全部流程

---

## 背景說明

本 Story 是五階段流程（US-105）第四階段「簽核（Stage 4 / `approval`）」的拒絕操作。

**重要設計決策（OQ-C-02 確認）**：
- 簽核階段的「退回」以「拒絕（Reject）」操作實現，而非獨立的 Rollback button
- 拒絕操作**取代** Rollback：部長填寫拒絕原因後退回，名單回到個別業務比例設定階段
- 退回後，所有處長的個別業務比例**清空**，處長需重新設定
- 拒絕原因記錄於 `assignment_audit_log`，可供處長查閱

---

## 驗收標準

### AC-1：簽核階段名單顯示「拒絕」按鈕

- **Given** 部長或 Admin 在 M01 名單五階段總覽（US-105）查看某個 `stage = 'approval'` 的名單
- **When** 頁面顯示操作欄
- **Then** 顯示「拒絕」按鈕（與「核准」按鈕並排，見 US-116）
- **And** 處長帳號**不顯示「拒絕」按鈕**

### AC-2：拒絕輸入拒絕原因（必填）

- **Given** 部長或 Admin 點擊「拒絕」按鈕
- **When** 系統彈出拒絕對話框
- **Then** 對話框顯示拒絕原因文字輸入框（必填，max 500 字），並附說明：「請填寫拒絕原因，處長將可查閱此訊息」
- **And** 空白拒絕原因不允許提交（前端驗證：「請填寫拒絕原因」）
- **And** 對話框提供「確認拒絕」與「取消」兩個按鈕

### AC-3：確認拒絕後退回

- **Given** 部長或 Admin 填寫拒絕原因後點擊「確認拒絕」
- **When** 後端處理拒絕請求
- **Then** 系統將名單的 `stage` 從 'approval' 更新為 'personnel_ratio'
- **And** 清空該 LIST_NO **所有部門**的個別業務員 RATION（`ob_empl_set` 中對應 LIST_NO 的所有記錄刪除或設為 NULL）
- **And** 操作寫入 `assignment_audit_log`（action = 'REJECT'，before_payload 含 stage = 'approval'，after_payload 含 stage = 'personnel_ratio'，reject_reason 記錄於 metadata 或 after_payload）
- **And** 頁面成功提示「名單『{LIST_NM}』已拒絕並退回個別業務比例設定階段」，清單刷新

### AC-4：拒絕原因可供查閱

- **Given** 名單已退回至 'personnel_ratio' 階段
- **When** 處長或部長在名單詳情頁查看稽核日誌
- **Then** 顯示最近一筆 action = 'REJECT' 的記錄，包含拒絕原因文字、拒絕者帳號 ID 與拒絕時間

### AC-5：退回後個別業務比例清空，處長需重新設定

- **Given** 名單已退回至 'personnel_ratio'
- **When** 處長進入個別業務比例設定頁（US-112）
- **Then** 本部門所有業務員的 RATION 均顯示為空（或 0），需重新設定
- **And** 頁面可顯示最近一筆拒絕原因，提示處長調整方向（optional）

### AC-6：月名單分派執行中禁止拒絕

- **Given** 目前有 AssignmentRun status = 'running' 的月名單分派
- **When** 部長或 Admin 嘗試點擊「拒絕」按鈕
- **Then** 拒絕按鈕為停用狀態，hover 顯示提示「分派執行中，無法執行拒絕操作」

---

## 技術備註

- `stage` 欄位更新：`ob_list_definition.stage = 'personnel_ratio'`（從 'approval'）
- 清空個別業務比例：`DELETE FROM ob_empl_set WHERE list_no = {LIST_NO}`
- 部門比例（`ob_dept_pct`）**不清空**，保留原設定（拒絕僅退回至個別業務比例設定，部門比例不受影響）
- 拒絕原因儲存於 `assignment_audit_log.after_payload`（JSONB 欄位）或獨立的 `reject_reason` 欄位（由 system-architect 決策）
- **[通知 spec-writer]**：拒絕原因的 API schema 與 audit log 儲存格式由 spec-writer 在 F061 對應 spec 中確認

---

## 測試案例

### TC-117-01：正常拒絕並退回

- **Given**：LIST_NO = 'OB202506001'，stage = 'approval'，`ob_empl_set` 有 10 筆記錄；部長帳號
- **When**：部長點擊「拒絕」→ 填寫拒絕原因「XTC0 的 EMP001 比例需調整為 0%」→ 點擊「確認拒絕」
- **Then**：`stage` 更新為 'personnel_ratio'；`ob_empl_set` 10 筆記錄清空；稽核日誌新增 action = 'REJECT'，含拒絕原因；清單階段標籤更新

### TC-117-02：空白拒絕原因被阻擋

- **Given**：部長點擊「拒絕」，拒絕原因輸入框留空
- **When**：點擊「確認拒絕」
- **Then**：前端提示「請填寫拒絕原因」，不執行提交

### TC-117-03：處長無法拒絕

- **Given**：帳號持有「處長」角色
- **When**：嘗試呼叫拒絕 API
- **Then**：後端回 403 Forbidden；清單頁無「拒絕」按鈕

### TC-117-04：退回後處長可查閱拒絕原因

- **Given**：LIST_NO = 'OB202506001' 已退回至 'personnel_ratio'
- **When**：處長進入名單詳情頁查看稽核日誌
- **Then**：顯示最近一筆 REJECT 記錄，含拒絕原因「XTC0 的 EMP001 比例需調整為 0%」

### TC-117-05：退回後部門比例保留

- **Given**：LIST_NO = 'OB202506001' 已退回至 'personnel_ratio'
- **When**：部長進入部門比例設定頁
- **Then**：部門比例（RATION）保留原設定，未清空

### TC-117-06：月名單分派中禁止拒絕

- **Given**：AssignmentRun status = 'running'
- **When**：部長嘗試點擊「拒絕」
- **Then**：按鈕停用，顯示「分派執行中，無法執行拒絕操作」

---

## 依賴關係

- **Blocked By**：US-114（推進至簽核，才有 stage = 'approval' 名單）、US-100（部長角色定義）
- **Blocks**：（退回後，US-112 個別業務比例設定重新開放）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 正常拒絕並退回測試（TC-117-01）
- [ ] 空白拒絕原因阻擋測試（TC-117-02）
- [ ] 處長被拒測試（TC-117-03）
- [ ] 退回後拒絕原因可查閱測試（TC-117-04）
- [ ] 退回後部門比例保留測試（TC-117-05）
- [ ] 月名單分派中禁止拒絕測試（TC-117-06）
- [ ] AssignmentAuditLog 含拒絕原因寫入測試
- [ ] 個別業務比例清空驗證測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-105（五階段總覽）、US-114（推進至簽核）、US-116（核准）、US-112（個別業務比例設定，退回後重新開放）、US-101（處長角色，可查閱拒絕原因）
