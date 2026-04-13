# US-014：指派／變更角色

> **Story ID**：US-014
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **變更說明（2026-04-13）**：角色選項從 8 種簡化為 2 種（Admin / User），移除六種業務角色與 US-068 依賴

---

## User Story

**As a** Admin（管理者）
**I want** 指派或變更使用者帳號的角色
**So that** 我可以依組織職能需求為每位使用者賦予適當的存取範圍，並在人員調動時即時更新

---

## 驗收標準

### AC-1：角色變更選單顯示全部 2 種角色
- **Given** Admin 正在查看某帳號的角色設定
- **When** Admin 展開角色選擇下拉選單
- **Then** 選單顯示全部 2 種角色：管理者（Admin）、使用者（User）

### AC-2：變更為 User
- **Given** Admin 正在查看一個角色為「Admin」的帳號（系統中有其他 Admin）
- **When** Admin 將角色變更為「使用者（User）」並確認
- **Then** 系統更新角色為 `user`，顯示成功訊息

### AC-3：變更為 Admin
- **Given** Admin 正在查看一個角色為「User」的帳號
- **When** Admin 將角色變更為「管理者（Admin）」並確認
- **Then** 系統更新角色為 `admin`，顯示成功訊息

### AC-4：防止最後一位 Admin 降級
- **Given** 系統中僅有一個 Admin 帳號
- **When** 該 Admin 嘗試將自己的角色變更為 User
- **Then** 系統阻止此操作，並顯示「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」

### AC-5：角色變更確認
- **Given** Admin 正在變更某帳號的角色
- **When** Admin 選擇新角色
- **Then** 系統顯示確認對話框，說明目前角色（顯示中文名稱）與新角色（顯示中文名稱），待 Admin 確認後才執行變更

### AC-6：角色變更生效時機
- **Given** Admin 已成功變更某使用者的角色
- **When** 該使用者的 Token 下次刷新或重新登入後
- **Then** 新角色的存取設定即時生效

---

## Technical Notes

- 端點：`PATCH /api/accounts/:id/role`
- Request body：`{ role: "admin" | "user" }`
- 後端必須驗證傳入的 role_code 為 US-017 定義的有效值，無效時回傳 `400 Bad Request`
- 後端必須強制執行「至少一位 Admin」的限制
- 角色變更於 Token 下次刷新或重新登入後生效
- 角色變更不影響帳號的密碼、姓名、Email 等資料

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 將 User 角色改為 Admin | 角色更新成功 |
| 2 | 將 Admin 角色改為 User（其他 Admin 仍存在） | 角色更新成功 |
| 3 | 降級最後一位 Admin | 操作被阻止，顯示錯誤訊息 |
| 4 | 傳入無效 role_code（如「analyst」） | 回傳 400 Bad Request |
| 5 | 未確認即變更角色 | 操作未執行 |
| 6 | 非 Admin 嘗試變更角色 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-010（帳號必須存在且具有當前角色）、US-017（角色 Seed Data 必須存在）
- **Blocks**：無
- E01：Admin 必須先完成驗證
- NFR-001：RBAC 強制執行

---

## Definition of Done

- [ ] 帳號詳細頁或清單中的角色選擇器／下拉選單，顯示全部 2 種角色
- [ ] 角色顯示中文名稱（「管理者」、「使用者」）
- [ ] 角色變更的確認對話框
- [ ] 後端強制執行「至少一位 Admin」規則
- [ ] 後端驗證 role_code 有效性
- [ ] UI 中正確反映角色變更
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-010、US-011、US-012、US-017
