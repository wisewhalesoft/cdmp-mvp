# US-002：User 登入

> **Story ID**：US-002
> **Epic**：[E01 — 驗證與登入](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** User（使用者）
**I want** 使用我的帳號憑證登入 CDMP 平台
**So that** 我可以存取我的帳號，並瀏覽平台（即使 MVP 階段尚無可用功能）

---

## 驗收標準

### AC-1：成功登入
- **Given** User 擁有一個有效且啟用中的帳號
- **When** User 在登入頁面輸入正確的 Email 與密碼，並點擊「登入」
- **Then** 系統驗證 User 身份，發行 Session Token，並重新導向至顯示「目前尚無可用功能，請聯絡您的管理員。」訊息的說明頁面

### AC-2：無效憑證
- **Given** User 在登入頁面
- **When** User 輸入錯誤的 Email 或密碼，並點擊「登入」
- **Then** 系統顯示通用錯誤訊息「Email 或密碼錯誤」，且不揭示是哪個欄位有誤

### AC-3：「記住我」功能
- **Given** User 在登入頁面
- **When** User 勾選「記住我」後成功登入
- **Then** 系統發行長效 Token（有效期 30 天），下次開啟瀏覽器時自動維持登入狀態；若未勾選，Token 於瀏覽器關閉或閒置 8 小時後失效

### AC-4：帳號已停用
- **Given** User 帳號已被停用
- **When** User 以正確憑證嘗試登入
- **Then** 系統顯示「您的帳號已被停用，請聯絡管理員。」，且不發行 Session Token

---

## Technical Notes

- 與 Admin 共用同一個登入端點：`POST /api/auth/login`
- JWT Token 中的角色（role）決定 UI 路由（Admin 導向管理後台，User 導向說明頁面）
- User 說明頁面應為簡潔的品牌化頁面，清楚說明 MVP 限制
- 密碼驗證與 Token 管理機制與 US-001 相同

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 有效的 User 憑證 | 重新導向至 User 說明頁面，Token 已發行 |
| 2 | 錯誤密碼 | 錯誤訊息，無 Token |
| 3 | 已停用的 User 帳號 | 顯示帳號停用訊息 |
| 4 | User 嘗試存取 Admin 路由 | 重新導向至 User 說明頁面或回傳 403 |
| 5 | 勾選「記住我」後登入 | Token 有效期為 30 天 |
| 6 | 未勾選「記住我」登入 | Token 於閒置 8 小時後失效 |

---

## 依賴關係

- **Blocked By**：無
- **Blocks**：US-003（需先有登入才能登出）
- 帳號必須已透過 US-010 由 Admin 建立
- US-001：共用登入基礎建設
- NFR-001：密碼雜湊與 Token 安全性需求

---

## Definition of Done

- [ ] User 說明頁面實作完成，含 MVP 限制說明訊息
- [ ] 登入後正確將 User 路由至說明頁面（非管理後台）
- [ ] 阻擋 User 存取 Admin 路由的機制實作完成
- [ ] 所有驗收標準的單元測試通過
- [ ] 角色路由邏輯測試通過

---

## 相關文件

- **Epic Brief**：[E01 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-001、US-003、US-010
