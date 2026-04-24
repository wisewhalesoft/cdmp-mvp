---
spec-id: F001
title: Admin 登入
feature-id: F001
source-story: US-001
epic: E01 — 驗證與登入
priority: P0-MVP
version: "1.1"
date: 2026-04-24
status: Draft
---

# F001: Admin 登入

**Priority:** P0-MVP | **Status:** Draft | **Last Updated:** 2026-04-24

---

## 1. 功能摘要

提供 Admin（管理者）角色透過 Email 與密碼憑證登入 CDMP 平台的功能。系統驗證身份後發行 JWT Token，並根據角色將使用者重新導向至管理後台首頁。支援「記住我」選項以延長 Session 有效期。

---

## 2. User Story

**As a** Admin（管理者）
**I want** 使用我的帳號憑證登入 CDMP 平台
**So that** 我可以存取管理後台，管理帳號與資料來源

---

## 3. 驗收標準

### AC-1：成功登入

- **Given** Admin 擁有一個有效且啟用中的帳號
- **When** Admin 在登入頁面輸入正確的 Email 與密碼，並點擊「登入」
- **Then** 系統驗證 Admin 身份，發行 JWT Token，並重新導向至管理後台首頁

### AC-2：無效憑證

- **Given** Admin 在登入頁面
- **When** Admin 輸入錯誤的 Email 或密碼，並點擊「登入」
- **Then** 系統顯示通用錯誤訊息「Email 或密碼錯誤」，且不揭示是哪個欄位有誤

### AC-3：「記住我」功能

- **Given** Admin 在登入頁面
- **When** Admin 勾選「記住我」後成功登入
- **Then** 系統發行長效 Token（有效期 30 天），下次開啟瀏覽器時自動維持登入狀態；若未勾選，Token 於瀏覽器關閉或閒置 8 小時後失效

### AC-4：帳號已停用

- **Given** Admin 帳號已被停用
- **When** Admin 以正確憑證嘗試登入
- **Then** 系統顯示「您的帳號已被停用，請聯絡管理員。」，且不發行 JWT Token

---

## 4. API 規格

### 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/login` | 使用者登入（Admin 與 User 共用） |

### Request

**Content-Type:** `application/json`

```json
{
  "email": "string (required, email format)",
  "password": "string (required, non-empty)",
  "rememberMe": "boolean (optional, default: false)"
}
```

**前端欄位驗證規則：**

| 欄位 | 規則 | 錯誤訊息 |
|------|------|---------|
| email | 必填、合法 Email 格式 | 「請輸入有效的 Email 地址」 |
| password | 必填、不可為空 | 「請輸入密碼」 |

### Response — 成功（HTTP 200）

```json
{
  "token": "string (JWT)",
  "user": {
    "id": "string (UUID)",
    "name": "string",
    "email": "string",
    "role": "admin"
  }
}
```

### JWT Payload 結構

| 欄位 | 型別 | 說明 |
|------|------|------|
| userId | string (UUID) | 使用者唯一識別碼 |
| role | string | 角色代碼：`admin` 或 `user`（系統預設 Seed Data，詳見 F045） |
| is_sales_manager | boolean | 業務主管旗標；Admin 角色下此欄位仍會寫入但 RBAC 不依賴它判斷權限（Admin 為超集）；User 角色下 `true` 表示可存取 E07 分派全流程與 E06 Customer 360 |
| iat | number (Unix timestamp) | Token 發行時間 |
| exp | number (Unix timestamp) | Token 到期時間 |

**旗標時效性**：`is_sales_manager` 於登入時由後端從 `users.is_sales_manager` 欄位寫入 Payload；帳號旗標變更後，舊 JWT 仍有效直至過期（參考 AD-E02-1）。

### Token 有效期策略

| 情境 | 有效期 |
|------|--------|
| `rememberMe: true` | 30 天 |
| `rememberMe: false`（或未提供） | 閒置 8 小時後失效 |

### Response — 錯誤

| HTTP 狀態碼 | 錯誤情境 | Response Body |
|-------------|---------|---------------|
| 400 | 缺少必要欄位或格式錯誤 | `{ "error": "VALIDATION_ERROR", "message": "請提供有效的 Email 與密碼" }` |
| 401 | Email 不存在或密碼錯誤 | `{ "error": "INVALID_CREDENTIALS", "message": "Email 或密碼錯誤" }` |
| 403 | 帳號已停用 | `{ "error": "ACCOUNT_DISABLED", "message": "您的帳號已被停用，請聯絡管理員。" }` |
| 429 | 超過 Rate Limit | `{ "error": "RATE_LIMITED", "message": "登入嘗試過於頻繁，請稍後再試。" }` |

---

## 5. 業務規則

| 規則編號 | 規則說明 |
|---------|---------|
| BR-001 | 密碼驗證必須透過 bcrypt compare 執行，最低 cost factor 為 10 |
| BR-002 | 無效憑證的錯誤訊息必須為通用訊息，不得揭示是 Email 或密碼錯誤 |
| BR-003 | 帳號停用狀態的檢查必須在密碼驗證成功之後進行（避免洩漏帳號是否存在） |
| BR-004 | 登入端點建議啟用 Rate Limiting，防止暴力破解攻擊 |
| BR-005 | 帳號必須已透過 US-010（建立帳號）由其他 Admin 預先建立 |
| BR-006 | JWT Token 中的 `role` 欄位決定前端路由導向：`admin` 導向管理後台 |

---

## 6. UI/UX 需求

### 頁面元素

| 元素 | 類型 | 說明 |
|------|------|------|
| Email 輸入欄 | text input | 必填，支援 Email 格式驗證 |
| 密碼輸入欄 | password input | 必填，輸入內容遮罩顯示 |
| 「記住我」勾選框 | checkbox | 預設未勾選 |
| 「登入」按鈕 | button | 送出表單，觸發 API 請求 |
| 錯誤訊息區域 | alert / message | 顯示 API 回傳的錯誤訊息 |

### 互動狀態

| 狀態 | 行為 |
|------|------|
| 初始狀態 | 表單欄位為空，登入按鈕可點擊 |
| 載入中 | 送出後顯示載入指示器，登入按鈕停用，防止重複送出 |
| 驗證失敗（前端） | 顯示對應欄位的驗證錯誤訊息 |
| 驗證失敗（後端） | 清空密碼欄位，顯示 API 錯誤訊息 |
| 成功 | 重新導向至管理後台首頁 |

---

## 7. 錯誤場景

| 錯誤情境 | 錯誤代碼 | 使用者可見訊息 | 系統行為 |
|---------|---------|--------------|---------|
| Email 或密碼欄位為空 | VALIDATION_ERROR | 「請輸入有效的 Email 與密碼」 | 前端攔截，不送出 API 請求 |
| Email 格式不正確 | VALIDATION_ERROR | 「請輸入有效的 Email 地址」 | 前端攔截，不送出 API 請求 |
| 帳號不存在 | INVALID_CREDENTIALS | 「Email 或密碼錯誤」 | 回傳 HTTP 401，不發行 Token |
| 密碼錯誤 | INVALID_CREDENTIALS | 「Email 或密碼錯誤」 | 回傳 HTTP 401，不發行 Token |
| 帳號已停用 | ACCOUNT_DISABLED | 「您的帳號已被停用，請聯絡管理員。」 | 回傳 HTTP 403，不發行 Token |
| Rate Limit 超過 | RATE_LIMITED | 「登入嘗試過於頻繁，請稍後再試。」 | 回傳 HTTP 429 |
| SQL Injection 嘗試 | INVALID_CREDENTIALS | 「Email 或密碼錯誤」 | 輸入消毒，回傳 HTTP 401 |

詳細 Retry / Fallback 策略請參閱 [error-handling.md](../error-handling.md#auth-errors)。

---

## 8. 測試案例

| # | 測試案例 | 前置條件 | 操作 | 預期結果 |
|---|---------|---------|------|---------|
| T-001 | 有效的 Admin 憑證登入 | Admin 帳號已建立且啟用 | 輸入正確 Email 與密碼，點擊登入 | HTTP 200，JWT Token 已發行，重新導向至管理後台 |
| T-002 | 錯誤密碼 | Admin 帳號已建立且啟用 | 輸入正確 Email 與錯誤密碼 | HTTP 401，顯示「Email 或密碼錯誤」 |
| T-003 | 不存在的 Email | 無對應帳號 | 輸入不存在的 Email | HTTP 401，顯示「Email 或密碼錯誤」 |
| T-004 | Email 欄位為空 | 無 | 不輸入 Email，點擊登入 | 前端驗證錯誤，不送出請求 |
| T-005 | 密碼欄位為空 | 無 | 不輸入密碼，點擊登入 | 前端驗證錯誤，不送出請求 |
| T-006 | 已停用帳號 | Admin 帳號已停用 | 輸入正確 Email 與密碼 | HTTP 403，顯示帳號停用訊息 |
| T-007 | SQL Injection 攻擊 | 無 | Email 欄位輸入 SQL 注入字串 | 輸入已消毒，回傳 HTTP 401 |
| T-008 | 勾選「記住我」 | Admin 帳號已建立且啟用 | 勾選後成功登入 | Token 有效期為 30 天 |
| T-009 | 未勾選「記住我」 | Admin 帳號已建立且啟用 | 不勾選，成功登入 | Token 於閒置 8 小時後失效 |

---

## 9. 依賴關係

| 類型 | 項目 | 說明 |
|------|------|------|
| Blocked By | 無 | 此為基礎功能，無前置依賴 |
| Blocks | F003（登出） | 需先有登入才能登出 |
| 資料依賴 | US-010（建立帳號） | 帳號須透過帳號管理功能預先建立 |
| 共用基礎建設 | F002（User 登入） | 共用同一個 API 端點與驗證邏輯 |
| NFR | NFR-001（安全性） | JWT Token 管理、bcrypt 密碼雜湊、明文密碼不可出現在日誌 |
| NFR | NFR-002（效能） | API 回應時間 P95 低於 500ms |

---

## 10. 資料需求

### 涉及實體

| 實體 | 操作 | 說明 |
|------|------|------|
| User | 讀取 | 依 Email 查詢使用者記錄，驗證密碼與帳號狀態 |
| Session / Token | 建立 | 登入成功後發行 JWT Token |

### 相關欄位

| 欄位 | 用途 |
|------|------|
| `user.email` | 登入識別 |
| `user.password_hash` | bcrypt 雜湊密碼，用於比對驗證 |
| `user.role` | 角色判斷（`admin` / `user`），決定導向頁面 |
| `user.is_active` | 帳號啟用狀態，停用帳號不可登入 |
| `user.id` | JWT Payload 中的 userId |
| `user.name` | 登入成功 Response 中回傳 |

詳細資料模型請參閱 [data-model.md](../data-model.md#user-entity)。

---

## 11. 安全性考量

| 項目 | 要求 |
|------|------|
| 密碼儲存 | bcrypt 雜湊，cost factor >= 10，絕不儲存明文 |
| 密碼傳輸 | 僅透過 HTTPS（TLS 1.2+）傳輸 |
| 日誌安全 | 明文密碼絕不可出現在任何伺服器日誌或錯誤日誌中 |
| 錯誤訊息 | 通用錯誤訊息，不揭示帳號是否存在 |
| Rate Limiting | 建議對登入端點實施請求速率限制，防止暴力破解 |
| 輸入消毒 | 所有輸入欄位必須進行消毒處理，防止 SQL Injection 與 XSS |

完整安全性需求請參閱 [NFR-001](../stories/non-functional/NFR-001-security.md)。

---

## 12. 效能需求

| 指標 | 目標 |
|------|------|
| 登入 API 回應時間（P95） | 低於 500ms |
| 並發登入支援 | 至少 100 位並發使用者 |

完整效能需求請參閱 [NFR-002](../stories/non-functional/NFR-002-performance.md)。

---

## 13. 交叉參考

| 類型 | 連結 |
|------|------|
| 來源 Story | [US-001-admin-login.md](../stories/epics/E01-auth-and-login/US-001-admin-login.md) |
| Epic Brief | [E01 epic-brief.md](../stories/epics/E01-auth-and-login/epic-brief.md) |
| 相關 Feature | [F002-user-login.md](F002-user-login.md)、[F003-logout.md](F003-logout.md) |
| 安全性 NFR | [NFR-001-security.md](../stories/non-functional/NFR-001-security.md) |
| 效能 NFR | [NFR-002-performance.md](../stories/non-functional/NFR-002-performance.md) |
| 流程圖 | [diagrams/F001-admin-login.mmd](../diagrams/F001-admin-login.mmd) |
| 資料模型 | [data-model.md#user-entity](../data-model.md#user-entity) |
| 錯誤處理 | [error-handling.md#auth-errors](../error-handling.md#auth-errors) |
