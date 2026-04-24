---
spec-id: F002
title: User 登入
feature-id: F002
source-story: US-002
epic: E01 — 驗證與登入
priority: P0-MVP
version: "1.1"
date: 2026-04-24
status: Draft
---

# F002: User 登入

**Priority:** P0-MVP | **Status:** Draft | **Last Updated:** 2026-04-24

---

## 1. 功能摘要

提供 User（使用者）角色透過 Email 與密碼憑證登入 CDMP 平台的功能。由於 MVP 階段尚無 User 角色可使用的功能，登入成功後系統將導向一個說明頁面，告知目前無可用功能。User 角色必須被阻擋存取 Admin 專屬路由。此功能與 F001（Admin 登入）共用同一個 API 端點，透過 JWT 中的角色欄位區分導向邏輯。

---

## 2. User Story

**As a** User（使用者）
**I want** 使用我的帳號憑證登入 CDMP 平台
**So that** 我可以存取我的帳號，並瀏覽平台（即使 MVP 階段尚無可用功能）

---

## 3. 驗收標準

### AC-1：成功登入

- **Given** User 擁有一個有效且啟用中的帳號
- **When** User 在登入頁面輸入正確的 Email 與密碼，並點擊「登入」
- **Then** 系統驗證 User 身份，發行 JWT Token，並重新導向至顯示「目前尚無可用功能，請聯絡您的管理員。」訊息的說明頁面

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
- **Then** 系統顯示「您的帳號已被停用，請聯絡管理員。」，且不發行 JWT Token

---

## 4. API 規格

### 共用端點

此功能與 F001（Admin 登入）共用同一個登入端點。完整 API 規格請參閱 [F001-admin-login.md#4-api-規格](F001-admin-login.md#4-api-規格)。

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/login` | 使用者登入（Admin 與 User 共用） |

### 差異說明

- Request / Response 結構與 F001 完全相同
- 成功 Response 中 `user.role` 值為 `"user"`（而非 `"admin"`）
- JWT Payload 中 `is_sales_manager` 欄位反映該 User 的業務主管旗標狀態（`true` / `false`）；前端可據此決定是否顯示 E07 分派相關導覽入口（詳見 F001 JWT Payload 結構）
- 前端根據 `role` 欄位決定導向目標：`user` 導向 User 說明頁面（若 `is_sales_manager=true`，導向目標依 E07 相關 Feature 規格處理）

### RBAC 路由保護

| 情境 | 行為 |
|------|------|
| User 嘗試存取 Admin 專屬前端路由 | 前端路由守衛攔截，重新導向至 User 說明頁面 |
| User 嘗試呼叫 Admin 專屬 API 端點 | 後端回傳 HTTP 403 Forbidden，並記錄至日誌 |

### Admin 專屬 API 端點保護 — Response（HTTP 403）

```json
{
  "error": "FORBIDDEN",
  "message": "您沒有權限執行此操作。"
}
```

---

## 5. 業務規則

| 規則編號 | 規則說明 |
|---------|---------|
| BR-001 | 密碼驗證邏輯與 F001 完全相同（bcrypt compare，cost factor >= 10） |
| BR-002 | 無效憑證的錯誤訊息與 F001 一致，使用通用訊息 |
| BR-003 | JWT Token 中 `role: "user"` 決定前端導向 User 說明頁面 |
| BR-004 | User 角色不可存取任何 Admin 專屬功能（帳號管理、資料來源管理等） |
| BR-005 | RBAC 強制執行必須同時在前端路由層與後端 API 層實施 |
| BR-006 | User 說明頁面為簡潔的品牌化頁面，清楚說明 MVP 限制 |

---

## 6. UI/UX 需求

### 登入頁面

登入頁面與 F001 共用同一個介面，無需區分角色。所有 UI 元素請參閱 [F001-admin-login.md#6-uiux-需求](F001-admin-login.md#6-uiux-需求)。

### User 說明頁面（登入後導向）

| 元素 | 類型 | 說明 |
|------|------|------|
| 說明訊息 | 文字 | 顯示「目前尚無可用功能，請聯絡您的管理員。」 |
| 登出按鈕 | button | 可見於頁面 Header，觸發登出流程（參閱 F003） |
| 品牌標識 | 圖片/文字 | 平台品牌標識，維持一致視覺風格 |

### 互動狀態

| 狀態 | 行為 |
|------|------|
| 登入成功（role: user） | 重新導向至 User 說明頁面 |
| User 嘗試導航至 Admin 路由 | 自動重新導向至 User 說明頁面 |

---

## 7. 錯誤場景

登入相關錯誤場景與 F001 完全一致，請參閱 [F001-admin-login.md#7-錯誤場景](F001-admin-login.md#7-錯誤場景)。

以下為 F002 特有的錯誤場景：

| 錯誤情境 | 錯誤代碼 | 使用者可見訊息 | 系統行為 |
|---------|---------|--------------|---------|
| User 存取 Admin 前端路由 | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至 User 說明頁面 |
| User 呼叫 Admin 專屬 API | FORBIDDEN | 「您沒有權限執行此操作。」 | 回傳 HTTP 403，記錄存取嘗試至日誌 |

詳細 Retry / Fallback 策略請參閱 [error-handling.md](../error-handling.md#auth-errors)。

---

## 8. 測試案例

| # | 測試案例 | 前置條件 | 操作 | 預期結果 |
|---|---------|---------|------|---------|
| T-001 | 有效的 User 憑證登入 | User 帳號已建立且啟用 | 輸入正確 Email 與密碼，點擊登入 | HTTP 200，JWT Token 已發行，重新導向至 User 說明頁面 |
| T-002 | 錯誤密碼 | User 帳號已建立且啟用 | 輸入正確 Email 與錯誤密碼 | HTTP 401，顯示「Email 或密碼錯誤」 |
| T-003 | 已停用的 User 帳號 | User 帳號已停用 | 輸入正確 Email 與密碼 | HTTP 403，顯示帳號停用訊息 |
| T-004 | User 嘗試存取 Admin 前端路由 | User 已登入 | 瀏覽器直接輸入 Admin 路由 URL | 重新導向至 User 說明頁面 |
| T-005 | User 呼叫 Admin 專屬 API | User 已登入 | 以 User Token 呼叫 Admin API 端點 | HTTP 403 Forbidden，日誌記錄存取嘗試 |
| T-006 | 勾選「記住我」 | User 帳號已建立且啟用 | 勾選後成功登入 | Token 有效期為 30 天 |
| T-007 | 未勾選「記住我」 | User 帳號已建立且啟用 | 不勾選，成功登入 | Token 於閒置 8 小時後失效 |

---

## 9. 依賴關係

| 類型 | 項目 | 說明 |
|------|------|------|
| Blocked By | 無 | 此為基礎功能，無前置依賴 |
| Blocks | F003（登出） | 需先有登入才能登出 |
| 資料依賴 | US-010（建立帳號） | 帳號須透過 Admin 帳號管理功能預先建立 |
| 共用基礎建設 | F001（Admin 登入） | 共用同一個 API 端點、驗證邏輯與 Token 管理機制 |
| NFR | NFR-001（安全性） | JWT Token 管理、bcrypt 密碼雜湊、RBAC 強制執行 |
| NFR | NFR-001.2（授權強制執行） | User 存取 Admin 端點時回傳 HTTP 403 並記錄日誌 |
| NFR | NFR-002（效能） | API 回應時間 P95 低於 500ms |

---

## 10. 資料需求

### 涉及實體

| 實體 | 操作 | 說明 |
|------|------|------|
| User | 讀取 | 依 Email 查詢使用者記錄，驗證密碼與帳號狀態 |
| Session / Token | 建立 | 登入成功後發行 JWT Token（role: user） |

### 相關欄位

與 F001 相同，完整欄位清單請參閱 [F001-admin-login.md#10-資料需求](F001-admin-login.md#10-資料需求)。

關鍵差異：
- `user.role` 值為 `"user"`，決定前端導向 User 說明頁面
- `user.is_sales_manager` 布林旗標反映該帳號是否為業務主管；RBAC 中介層以 `role` + `is_sales_manager` 組合判斷 API 端點存取權限（參考 AD-E02-1）
- RBAC 中介層根據角色值判斷 API 端點存取權限

詳細資料模型請參閱 [data-model.md#user-entity](../data-model.md#user-entity)。

---

## 11. 安全性考量

所有登入安全性要求與 F001 相同，請參閱 [F001-admin-login.md#11-安全性考量](F001-admin-login.md#11-安全性考量)。

F002 特有的安全性要求：

| 項目 | 要求 |
|------|------|
| RBAC 前端保護 | 前端路由守衛必須阻擋 User 角色存取 Admin 專屬路由 |
| RBAC 後端保護 | 後端 API 中介層必須對每個 Admin 專屬端點驗證角色，User 角色回傳 HTTP 403 |
| 存取日誌 | 未授權的 Admin 端點存取嘗試必須記錄至日誌（含 userId、嘗試存取的端點、時間戳記） |

完整安全性需求請參閱 [NFR-001](../stories/non-functional/NFR-001-security.md)。

---

## 12. 效能需求

與 F001 相同，請參閱 [F001-admin-login.md#12-效能需求](F001-admin-login.md#12-效能需求)。

---

## 13. 交叉參考

| 類型 | 連結 |
|------|------|
| 來源 Story | [US-002-user-login.md](../stories/epics/E01-auth-and-login/US-002-user-login.md) |
| Epic Brief | [E01 epic-brief.md](../stories/epics/E01-auth-and-login/epic-brief.md) |
| 相關 Feature | [F001-admin-login.md](F001-admin-login.md)、[F003-logout.md](F003-logout.md) |
| 安全性 NFR | [NFR-001-security.md](../stories/non-functional/NFR-001-security.md) |
| 效能 NFR | [NFR-002-performance.md](../stories/non-functional/NFR-002-performance.md) |
| 流程圖 | [diagrams/F002-user-login.mmd](../diagrams/F002-user-login.mmd) |
| 資料模型 | [data-model.md#user-entity](../data-model.md#user-entity) |
| 錯誤處理 | [error-handling.md#auth-errors](../error-handling.md#auth-errors) |
