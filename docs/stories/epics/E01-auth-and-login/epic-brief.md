# Epic Brief：E01 — 驗證與登入

> **Epic ID**：E01
> **優先級**：P0（Critical）
> **階段**：Phase 1（MVP）
> **Stories 數量**：3

## Epic 目標

為 Admin 與 User 兩種角色提供安全的驗證機制，讓使用者能夠以適當的角色身份登入 CDMP 平台，並建立基於角色的 Session 管理機制。

登入是整個平台的入口，所有功能均以完成驗證為前提。此 Epic 亦確立了 Token 生命週期管理與登出安全性的基礎。

## User Stories

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-001 | Admin 登入 | Must Have | [US-001-admin-login.md](US-001-admin-login.md) |
| US-002 | User 登入 | Must Have | [US-002-user-login.md](US-002-user-login.md) |
| US-003 | 登出 | Must Have | [US-003-logout.md](US-003-logout.md) |

## 依賴關係

- **封鎖下游**：E02（帳號管理需要 Admin 已完成驗證）、E03（資料來源管理需要 Admin 已完成驗證）
- **依賴**：無（此為基礎 Epic）
- **NFR 關聯**：NFR-001（Token 管理與密碼雜湊安全性需求）

## 成功標準

- Admin 能夠成功登入並存取管理後台功能
- User 能夠成功登入並看到 MVP 說明頁面（目前無可用功能）
- 兩種角色皆能安全登出，且 Token 在伺服器端完成失效處理
- 登入失敗（錯誤憑證、帳號停用）以明確的錯誤訊息處理，不洩漏具體原因
- Session Token 在設定的閒置逾時後自動失效

## 待解決問題

- [x] 是否需要「記住我」功能以延長 Session 時效？ → **是，MVP 需提供「記住我」選項**
- [x] 是否有登入嘗試失敗次數上限與帳號鎖定政策？ → **MVP 不提供，延後至後續版本規劃**
- [x] Phase 2 是否需要 SSO 或 LDAP 整合？ → **是，Phase 2 整合 Microsoft Entra ID（Azure AD）登入**
