# US-107：草稿階段 per-LIST_NO CR 回分開關設定

> **Story ID**：US-107
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在草稿階段為每份名單獨立設定「CR 回分開關」（啟用 / 停用），預設為啟用
**So that** 可精確控制月跑 Stage 3 中哪些名單需執行 CR 回分邏輯，不同名單可有不同設定

---

## 背景說明

CR（Car Recycle，或稱 CR 回分）是月跑 Stage 3 的一項分派邏輯：將符合條件的案件回分給原持有的業務員（CR 業務員），而非依一般比例分派。

**與 F059 移除的原子性同步要求（用戶 Q7.1 = B 的決策）**：
本 Story（US-107）與 US-120（CR 儲存位置 spec 落差修正）**必須與「廢棄 F059 程式碼」同一次上線**，三者構成原子性同步：
- F059 廢棄前，US-107 的新 CR 開關功能不得上線
- US-107 / US-120 上線前，必須已通過整合測試覆蓋月跑 Stage 3 的 CR 回分路徑
- 上線後若新 CR 開關功能尚未實作完成，月跑 Stage 3 不得執行（避免空窗期）

**儲存位置**：CR 開關的值儲存於名單定義實體（`ob_list_definition`）的欄位中，**不再使用 OBASSIGNSET 路徑**（詳見 US-120）。

---

## 驗收標準

### AC-1：草稿階段名單顯示 CR 回分開關（預設啟用）

- **Given** 部長或 Admin 在草稿階段建立名單（US-106）完成後，或進入草稿名單的編輯頁
- **When** 頁面顯示名單設定表單
- **Then** 顯示「CR 回分開關」設定項，預設值為「啟用（On）」
- **And** 開關以 Toggle 或 Radio Button 呈現（「啟用」/ 「停用」兩個選項）

### AC-2：部長 / Admin 可修改 CR 回分開關

- **Given** 部長或 Admin 在草稿名單的編輯頁
- **When** 將 CR 回分開關從「啟用」切換至「停用」（或反向），並點擊「儲存」
- **Then** 系統更新 `ob_list_definition` 對應欄位的 CR 開關值
- **And** 操作寫入 AssignmentAuditLog（action = 'UPDATE'、entity_type = 'list_definition'，after_payload 含 CR 開關值）

### AC-3：處長無法修改 CR 回分開關

- **Given** 帳號持有「處長」角色
- **When** 進入草稿名單的設定頁（若有查看權限）
- **Then** CR 回分開關顯示為唯讀（顯示目前值，但無法切換）
- **And** 若處長直接呼叫更新 CR 開關的 API，後端回 403 Forbidden

### AC-4：月跑 Stage 3 讀取 CR 開關值

- **Given** 名單定義 LIST_NO `OB202506001` 的 CR 開關值為「停用」
- **When** 月跑進入 Stage 3（CR 回分邏輯）
- **Then** Stage 3 讀取 `ob_list_definition` 的 CR 開關欄位，若為「停用」則跳過 CR 回分邏輯，直接以一般比例分派

### AC-5：CR 開關值隨名單推進各階段保持不變（鎖定後唯讀）

- **Given** 草稿名單已設定 CR 開關值（啟用或停用）並推進至草稿以外的階段
- **When** 名單進入部門比例設定或後續階段
- **Then** CR 開關值**鎖定不可修改**（顯示但無切換控件）
- **And** 若需修改，需退回至草稿階段（Rollback 機制，非本 Story 範圍）

### AC-6：與 F059 廢棄的原子性上線

- **Given** US-107 的 per-LIST_NO CR 開關功能已實作完成
- **When** 準備上線前
- **Then** 上線計劃必須包含「同步廢棄 F059 程式碼」
- **And** 若 F059 尚未廢棄，US-107 不得部署至 Production
- **And** 上線前必須已通過整合測試，覆蓋月跑 Stage 3 的 CR 回分路徑（含「開關啟用」與「開關停用」兩種情境）

---

## 技術備註

- CR 開關欄位：建議在 `ob_list_definition` 新增 `cr_enabled BOOLEAN NOT NULL DEFAULT TRUE`；schema 由 system-architect 決定
- 儲存位置：**`ob_list_definition.cr_enabled`**，不使用 OBASSIGNSET 路徑（US-120 正式宣告此規格）
- 月跑 Stage 3 讀取邏輯：`IF list.cr_enabled = false THEN SKIP CR REASSIGNMENT`
- **[重要]** F059 廢棄與本 Story 為原子性同步，禁止分批上線；上線審核需確認 F059 廢棄 PR 與本 Story PR 同批合併
- 整合測試需覆蓋：CR 開關啟用時 Stage 3 執行 CR 邏輯；CR 開關停用時 Stage 3 跳過 CR 邏輯
- 操作寫入 AssignmentAuditLog（entity_type = 'list_definition'，after_payload 含 `cr_enabled` 欄位值）

---

## 測試案例

### TC-107-01：草稿名單建立後 CR 開關預設啟用

- **Given**：部長透過 US-106 建立草稿名單 LIST_NO = 'OB202506001'
- **When**：進入該名單的設定頁
- **Then**：CR 回分開關顯示「啟用（On）」為預設狀態；`ob_list_definition.cr_enabled = true`

### TC-107-02：部長停用 CR 開關並儲存

- **Given**：LIST_NO = 'OB202506001'，stage = 'draft'，cr_enabled = true
- **When**：部長將 CR 回分開關切換至「停用」並儲存
- **Then**：`ob_list_definition.cr_enabled` 更新為 false；稽核日誌新增 UPDATE 記錄，after_payload 含 cr_enabled = false

### TC-107-03：處長嘗試修改 CR 開關被拒

- **Given**：帳號持有「處長」角色；LIST_NO = 'OB202506001'，stage = 'draft'
- **When**：處長嘗試呼叫修改 CR 開關的 API
- **Then**：後端回 403 Forbidden

### TC-107-04：月跑 Stage 3 跳過停用 CR 開關的名單

- **Given**：LIST_NO = 'OB202506001'，cr_enabled = false；月跑觸發
- **When**：月跑 Stage 3 處理 OB202506001
- **Then**：Stage 3 跳過 OB202506001 的 CR 回分邏輯，直接以一般比例分派；執行日誌記錄「OB202506001：CR 回分已停用，跳過」

### TC-107-05：名單推進後 CR 開關鎖定

- **Given**：LIST_NO = 'OB202506001'，cr_enabled = true；名單推進至「部門比例設定」階段
- **When**：部長進入該名單的詳情頁
- **Then**：CR 回分開關顯示「啟用」但無切換控件（唯讀顯示）

---

## 依賴關係

- **Blocked By**：US-106（草稿階段建立名單，需先有草稿名單）、US-120（CR 儲存位置規格宣告，需先確認儲存路徑）、US-100（部長角色定義，確立操作權限）
- **Blocks**：US-108（推進至部門比例，名單設定的一部分）
- **與 F059 廢棄原子性同步**：US-107 必須與「廢棄 F059 程式碼」同一次上線（詳見 AC-6）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 草稿名單 CR 開關預設啟用測試（TC-107-01）
- [ ] 部長修改 CR 開關測試（TC-107-02）
- [ ] 處長修改被拒測試（TC-107-03）
- [ ] 月跑 Stage 3 讀取 CR 開關並跳過測試（TC-107-04）
- [ ] 名單推進後 CR 開關鎖定測試（TC-107-05）
- [ ] 整合測試覆蓋月跑 Stage 3 CR 啟用 / 停用兩種情境
- [ ] **F059 廢棄 PR 與本 Story PR 確認為同批上線**
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-106（草稿建立名單）、US-120（CR 儲存位置 spec 落差修正）、US-108（推進至部門比例）、US-081（月跑觸發，Stage 3 執行 CR 回分）、US-100（部長角色定義）
