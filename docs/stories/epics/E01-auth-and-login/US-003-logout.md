# US-003：登出

> **Story ID**：US-003
> **Epic**：[E01 — 驗證與登入](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** 已驗證的使用者（Admin 或 User）
**I want** 登出 CDMP 平台
**So that** 我的 Session 被終止，帳號不會遭到未授權存取

---

## 驗收標準

### AC-1：成功登出
- **Given** 使用者目前已完成驗證，並在平台任意頁面
- **When** 使用者點擊「登出」按鈕
- **Then** 系統使 Session Token 失效，清除用戶端 Session 資料，並將使用者重新導向至登入頁面

### AC-2：登出後阻擋存取
- **Given** 使用者剛完成登出
- **When** 使用者嘗試透過瀏覽器上一頁按鈕或直接輸入 URL 導航至受保護頁面
- **Then** 系統將使用者重新導向至登入頁面，且不顯示任何受保護內容

### AC-3：Token 失效驗證
- **Given** 使用者已完成登出
- **When** 使用任何 API 請求帶入舊的 Session Token
- **Then** 系統回傳 HTTP 401 Unauthorized

---

## Technical Notes

- 登出端點：`POST /api/auth/logout`
- 伺服器端：將 Token 加入封鎖清單（blocklist），或使用短效 Token 搭配 Refresh Token 撤銷機制
- 用戶端：清除 localStorage / sessionStorage 及 Cookie 中的 Token
- 登出按鈕應在所有頁面的主要導覽列（Header）中可見且可存取

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 點擊登出按鈕 | 重新導向至登入頁面，Token 已清除 |
| 2 | 登出後使用舊 Token | 回傳 401 Unauthorized |
| 3 | 登出後按瀏覽器上一頁 | 重新導向至登入頁面 |
| 4 | 登出後直接輸入 URL | 重新導向至登入頁面 |

---

## 依賴關係

- **Blocked By**：US-001 / US-002（需先實作登入功能）
- **Blocks**：無
- NFR-001：Token 失效安全性需求

---

## Definition of Done

- [ ] 登出按鈕顯示於導覽列 Header 中
- [ ] 後端登出端點使 Token 失效
- [ ] 登出時清除用戶端 Session 資料
- [ ] 登出後重新導向至登入頁面
- [ ] 登出後舊 Token 被拒絕
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E01 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-001、US-002
