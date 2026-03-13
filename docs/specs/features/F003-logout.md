---
spec-id: F003
title: 登出
feature-id: F003
source-story: US-003
epic: E01 — 驗證與登入
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F003: 登出

**Priority:** P0-MVP | **Status:** Draft | **Last Updated:** 2026-03-06

---

## 1. 功能摘要

提供已驗證的使用者（Admin 或 User）安全登出 CDMP 平台的功能。登出時系統在伺服器端使 Token 失效，同時清除用戶端所有 Session 資料，並將使用者重新導向至登入頁面。登出後，任何使用舊 Token 的請求皆應被拒絕。

---

## 2. User Story

**As a** 已驗證的使用者（Admin 或 User）
**I want** 登出 CDMP 平台
**So that** 我的 Session 被終止，帳號不會遭到未授權存取

---

## 3. 驗收標準

### AC-1：成功登出

- **Given** 使用者目前已完成驗證，並在平台任意頁面
- **When** 使用者點擊「登出」按鈕
- **Then** 系統使 Session Token 失效（伺服器端），清除用戶端 Session 資料，並將使用者重新導向至登入頁面

### AC-2：登出後阻擋存取

- **Given** 使用者剛完成登出
- **When** 使用者嘗試透過瀏覽器上一頁按鈕或直接輸入 URL 導航至受保護頁面
- **Then** 系統將使用者重新導向至登入頁面，且不顯示任何受保護內容

### AC-3：Token 失效驗證

- **Given** 使用者已完成登出
- **When** 使用任何 API 請求帶入舊的 Session Token
- **Then** 系統回傳 HTTP 401 Unauthorized

---

## 4. API 規格

### 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/logout` | 使用者登出 |

### Request

**Headers:**

| Header | 值 | 說明 |
|--------|---|------|
| Authorization | `Bearer <token>` | 當前有效的 JWT Token |

**Body:** 無（空 body 或不需要 body）

### Response — 成功（HTTP 200）

```json
{
  "message": "登出成功"
}
```

### Response — 錯誤

| HTTP 狀態碼 | 錯誤情境 | Response Body |
|-------------|---------|---------------|
| 401 | 未提供 Token 或 Token 已失效 | `{ "error": "UNAUTHORIZED", "message": "請重新登入。" }` |

### 伺服器端 Token 失效策略

系統必須確保登出後的 Token 不可再被使用。以下為兩種可接受的實作方案（擇一即可）：

| 方案 | 說明 |
|------|------|
| Token Blocklist | 將已登出的 Token 加入封鎖清單，API 驗證中介層檢查 Token 是否在清單中 |
| Refresh Token 撤銷 | 使用短效 Access Token + Refresh Token 架構，登出時撤銷 Refresh Token |

**[ASSUMPTION]** 具體 Token 失效實作方案由架構師決定。規格僅要求登出後舊 Token 必須被拒絕（HTTP 401）。

### 用戶端清除作業

登出時用戶端必須清除以下所有 Session 資料：

| 儲存位置 | 清除項目 |
|---------|---------|
| localStorage | JWT Token、使用者資訊 |
| sessionStorage | JWT Token、使用者資訊 |
| Cookie | 所有與驗證相關的 Cookie |

---

## 5. 業務規則

| 規則編號 | 規則說明 |
|---------|---------|
| BR-001 | 登出操作必須同時在伺服器端與用戶端執行——僅清除用戶端資料不足夠 |
| BR-002 | 登出後的 Token 必須在伺服器端被拒絕，回傳 HTTP 401 |
| BR-003 | 登出按鈕必須在所有已驗證頁面的主要導覽列（Header）中可見 |
| BR-004 | 登出功能適用於所有角色（Admin 與 User） |
| BR-005 | 登出後瀏覽器快取不應顯示受保護內容（設定適當的 Cache-Control Header） |

---

## 6. UI/UX 需求

### 登出按鈕

| 元素 | 類型 | 說明 |
|------|------|------|
| 登出按鈕 | button / link | 位於所有頁面的 Header 導覽列中，始終可見且可點擊 |

### 互動狀態

| 狀態 | 行為 |
|------|------|
| 點擊登出 | 立即觸發登出 API 請求，同時清除用戶端資料 |
| 登出處理中 | 可選：顯示短暫載入指示器 |
| 登出成功 | 重新導向至登入頁面 |
| 登出 API 失敗 | 仍清除用戶端資料並重新導向至登入頁面（降級處理） |

### 登出後行為

| 情境 | 行為 |
|------|------|
| 使用者按瀏覽器上一頁 | 重新導向至登入頁面，不顯示任何受保護內容 |
| 使用者直接輸入受保護頁面 URL | 重新導向至登入頁面 |
| 使用者重新開啟瀏覽器 | 顯示登入頁面（Session 已清除） |

---

## 7. 錯誤場景

| 錯誤情境 | 錯誤代碼 | 使用者可見訊息 | 系統行為 |
|---------|---------|--------------|---------|
| 登出 API 請求失敗（網路錯誤） | N/A | 無錯誤訊息 | 用戶端仍清除本地 Session 資料，重新導向至登入頁面（降級處理） |
| 登出 API 請求失敗（伺服器錯誤） | N/A | 無錯誤訊息 | 同上，用戶端清除資料並重新導向 |
| 已過期 Token 嘗試登出 | UNAUTHORIZED | 「請重新登入。」 | 回傳 HTTP 401，用戶端清除資料並重新導向 |

**降級處理原則：** 即使登出 API 請求失敗，用戶端仍必須清除所有本地 Session 資料並重新導向至登入頁面。伺服器端 Token 將在其自然到期時間後自動失效。

詳細 Retry / Fallback 策略請參閱 [error-handling.md](../error-handling.md#auth-errors)。

---

## 8. 測試案例

| # | 測試案例 | 前置條件 | 操作 | 預期結果 |
|---|---------|---------|------|---------|
| T-001 | 成功登出 | 使用者已登入（Admin 或 User） | 點擊登出按鈕 | Token 伺服器端失效，用戶端 Session 清除，重新導向至登入頁面 |
| T-002 | 登出後使用舊 Token | 使用者已登出，保留舊 Token | 以舊 Token 呼叫任意 API | HTTP 401 Unauthorized |
| T-003 | 登出後按瀏覽器上一頁 | 使用者已登出 | 點擊瀏覽器上一頁按鈕 | 重新導向至登入頁面，無受保護內容顯示 |
| T-004 | 登出後直接輸入 URL | 使用者已登出 | 在瀏覽器輸入受保護頁面 URL | 重新導向至登入頁面 |
| T-005 | 登出 API 失敗降級 | 使用者已登入，伺服器無法回應 | 點擊登出按鈕 | 用戶端 Session 資料仍被清除，重新導向至登入頁面 |
| T-006 | Admin 登出 | Admin 已登入 | 點擊登出按鈕 | 登出成功，重新導向至登入頁面 |
| T-007 | User 登出 | User 已登入 | 點擊登出按鈕 | 登出成功，重新導向至登入頁面 |

---

## 9. 依賴關係

| 類型 | 項目 | 說明 |
|------|------|------|
| Blocked By | F001（Admin 登入） | 需先實作登入功能才能登出 |
| Blocked By | F002（User 登入） | 需先實作登入功能才能登出 |
| Blocks | 無 | |
| NFR | NFR-001（安全性） | Token 失效安全性需求 |
| NFR | NFR-001.1（驗證安全性） | Token 必須在伺服器端被正確失效 |

---

## 10. 資料需求

### 涉及實體

| 實體 | 操作 | 說明 |
|------|------|------|
| Session / Token | 更新/刪除 | 將 Token 標記為失效（加入 Blocklist 或撤銷 Refresh Token） |
| Token Blocklist | 建立 | 若採用 Blocklist 方案，新增一筆已失效 Token 記錄 |

### Token Blocklist 實體（若採用此方案）

| 欄位 | 型別 | 說明 |
|------|------|------|
| token_id | string | Token 唯一識別碼（JWT `jti` 或 Token 雜湊值） |
| expired_at | datetime | Token 原始到期時間（到期後可從 Blocklist 移除） |
| created_at | datetime | 加入 Blocklist 的時間 |

**[ASSUMPTION]** Token Blocklist 實體僅在採用 Blocklist 方案時需要。若採用 Refresh Token 撤銷方案，則需要 Refresh Token 實體。具體方案由架構師決定。

詳細資料模型請參閱 [data-model.md#token-entity](../data-model.md#token-entity)。

---

## 11. 安全性考量

| 項目 | 要求 |
|------|------|
| 伺服器端失效 | Token 必須在伺服器端被正確失效，不可僅依賴用戶端清除 |
| Cache-Control | 受保護頁面必須設定適當的 HTTP Cache-Control Header（`no-store`, `no-cache`），防止登出後瀏覽器快取顯示受保護內容 |
| 降級安全性 | 即使登出 API 失敗，用戶端仍必須清除所有 Session 資料 |
| Token 自然到期 | 伺服器端失效的 Blocklist 記錄可在 Token 原始到期時間後清除（降低儲存開銷） |

完整安全性需求請參閱 [NFR-001](../stories/non-functional/NFR-001-security.md)。

---

## 12. 效能需求

| 指標 | 目標 |
|------|------|
| 登出 API 回應時間（P95） | 低於 500ms |
| Token Blocklist 查詢效能 | 每次 API 請求的 Blocklist 查詢不得增加超過 10ms 延遲 |

**[ASSUMPTION]** Token Blocklist 查詢效能指標為建議值。若採用記憶體快取（如 Redis）儲存 Blocklist，此延遲應可輕易達成。

完整效能需求請參閱 [NFR-002](../stories/non-functional/NFR-002-performance.md)。

---

## 13. 交叉參考

| 類型 | 連結 |
|------|------|
| 來源 Story | [US-003-logout.md](../stories/epics/E01-auth-and-login/US-003-logout.md) |
| Epic Brief | [E01 epic-brief.md](../stories/epics/E01-auth-and-login/epic-brief.md) |
| 相關 Feature | [F001-admin-login.md](F001-admin-login.md)、[F002-user-login.md](F002-user-login.md) |
| 安全性 NFR | [NFR-001-security.md](../stories/non-functional/NFR-001-security.md) |
| 效能 NFR | [NFR-002-performance.md](../stories/non-functional/NFR-002-performance.md) |
| 流程圖 | [diagrams/F003-logout.mmd](../diagrams/F003-logout.mmd) |
| 資料模型 | [data-model.md#token-entity](../data-model.md#token-entity) |
| 錯誤處理 | [error-handling.md#auth-errors](../error-handling.md#auth-errors) |
