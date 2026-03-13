---
spec-id: F009
title: 自助式密碼重設
feature-id: F009
source-story: US-015
epic: E02
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F009: 自助式密碼重設

Priority: P0-MVP | Status: Draft | Last Updated: 2026-03-06

## 功能摘要

任何使用者（Admin 或 User）可透過「忘記密碼」流程自行重設密碼。系統發送包含重設連結的 Email，使用者點擊連結後設定新密碼。整個流程設計上不揭露帳號是否存在，以防止帳號列舉攻擊。

## User Story

**As a** 使用者（Admin 或 User）
**I want** 透過「忘記密碼」流程自行重設我的密碼
**So that** 我在忘記密碼時不需要依賴管理員協助，即可恢復平台存取權

## 驗收標準

### AC-1：發送重設連結（已註冊 Email）

- Given 使用者在登入頁面點擊「忘記密碼」
- When 使用者輸入已註冊的 Email 並點擊「發送重設連結」
- Then 系統發送一封包含密碼重設連結的 Email 至該信箱，頁面顯示「若此 Email 存在，重設連結已寄出」

### AC-2：不揭露帳號是否存在

- Given 使用者輸入一個未註冊的 Email
- When 使用者點擊「發送重設連結」
- Then 系統不寄出 Email，但仍顯示相同的成功訊息「若此 Email 存在，重設連結已寄出」，不揭露該 Email 是否已註冊

### AC-3：成功重設密碼

- Given 使用者點擊 Email 中的有效重設連結
- When 使用者輸入新密碼（最少 8 字元）並確認
- Then 系統以 bcrypt 雜湊儲存新密碼、失效所有該使用者現有的 Session Token，並重新導向至登入頁面顯示「密碼已成功重設，請重新登入」

### AC-4：重設連結過期

- Given 重設連結已超過有效期限（24 小時）
- When 使用者點擊該過期連結
- Then 系統顯示「此連結已過期，請重新申請密碼重設」，並提供返回忘記密碼頁面的連結

## API 規格

### POST /api/auth/forgot-password

發送密碼重設 Email。此端點不需驗證（公開端點）。

**Headers:**
- `Content-Type: application/json`

**Request Body:**

```json
{
  "email": "string (必填，Email 格式)"
}
```

**Response - 200 OK（無論 Email 是否存在，一律回傳相同回應）:**

```json
{
  "message": "若此 Email 存在，重設連結已寄出"
}
```

**Status Codes:**
| Code | 說明 |
|------|------|
| 200 | 請求已處理（不論 Email 是否存在） |
| 400 | Email 格式不正確 |
| 429 | 請求頻率過高（Rate Limiting） |
| 500 | 伺服器內部錯誤 |

---

### POST /api/auth/reset-password

使用重設 Token 設定新密碼。此端點不需驗證（公開端點）。

**Headers:**
- `Content-Type: application/json`

**Request Body:**

```json
{
  "token": "string (必填，重設 Token)",
  "newPassword": "string (必填，最少 8 字元)"
}
```

**Response - 200 OK:**

```json
{
  "message": "密碼已成功重設，請重新登入"
}
```

**Response - 400 Bad Request (Token 無效或過期):**

```json
{
  "error": "INVALID_OR_EXPIRED_TOKEN",
  "message": "此連結已過期，請重新申請密碼重設"
}
```

**Response - 400 Bad Request (密碼驗證失敗):**

```json
{
  "error": "VALIDATION_ERROR",
  "message": "輸入資料驗證失敗",
  "details": [
    { "field": "newPassword", "message": "密碼長度不得少於 8 個字元" }
  ]
}
```

**Status Codes:**
| Code | 說明 |
|------|------|
| 200 | 密碼重設成功 |
| 400 | Token 無效/過期，或密碼驗證失敗 |
| 429 | 請求頻率過高（Rate Limiting） |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 重設 Token 使用 UUID 或 JWT 格式，有效期 24 小時 |
| BR-2 | 重設 Token 為一次性使用，成功重設後立即失效 |
| BR-3 | 已使用或已過期的 Token 視為無效，統一回傳相同的錯誤訊息 |
| BR-4 | 無論輸入的 Email 是否已註冊，API 回應一律相同（防止帳號列舉攻擊） |
| BR-5 | 新密碼須符合既有密碼規則（最少 8 字元） |
| BR-6 | 新密碼以 bcrypt 雜湊處理後儲存（成本因子 >= 10） |
| BR-7 | 重設成功後，該使用者所有現有 Session Token 必須失效 |
| BR-8 | Email 寄送可使用 SMTP 或第三方服務（如 SendGrid） |
| BR-9 | 對同一 Email 短時間內多次請求重設，應實施 Rate Limiting |
| BR-10 | 此功能為公開端點，不需要已登入狀態 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 登入頁面中的「忘記密碼」連結 |
| 忘記密碼頁面 | Email 輸入欄位 + 「發送重設連結」按鈕 + 返回登入頁面連結 |
| 發送後畫面 | 顯示「若此 Email 存在，重設連結已寄出」訊息 + 返回登入頁面連結 |
| 重設密碼頁面 | 新密碼輸入欄位 + 確認密碼欄位 + 「重設密碼」按鈕 |
| 密碼規則提示 | 在密碼輸入欄位旁顯示密碼最短長度要求 |
| 成功畫面 | 顯示「密碼已成功重設，請重新登入」+ 自動或手動導向登入頁面 |
| 過期連結畫面 | 顯示「此連結已過期，請重新申請密碼重設」+ 返回忘記密碼頁面的連結 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| Email 格式不正確 | 顯示「Email 格式不正確」 | 400 |
| 未註冊的 Email | 回傳與已註冊 Email 相同的訊息（不揭露帳號是否存在） | 200 |
| 過期的重設 Token（超過 24 小時） | 顯示「此連結已過期，請重新申請密碼重設」 | 400 |
| 已使用過的重設 Token | 顯示「此連結已失效」 | 400 |
| 新密碼少於 8 字元 | 顯示「密碼長度不得少於 8 個字元」 | 400 |
| 短時間內過多重設請求 | 顯示「請求過於頻繁，請稍後再試」 | 429 |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | F004（帳號必須存在才能接收重設 Email） |
| 被依賴 | 無 |
| 外部依賴 | Email 寄送服務（SMTP 或 SendGrid） |
| NFR 關聯 | NFR-001.3（密碼雜湊安全性）、NFR-001.1（Session Token 失效） |

## 資料需求

### Password Reset Token

此功能需要儲存重設 Token 資料：

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID | Token 唯一識別碼 |
| account_id | UUID (FK) | 關聯的帳號 ID |
| token | string | 重設 Token 值（UUID 或 JWT） |
| expires_at | timestamp | Token 過期時間（建立時間 + 24 小時） |
| used_at | timestamp (nullable) | Token 使用時間（null 表示未使用） |
| created_at | timestamp | Token 建立時間 |

重設成功後需更新 Account Entity 的：
- password_hash, updated_at

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- 無論 Email 是否存在，API 回應一律相同（防止帳號列舉攻擊）
- 重設 Token 須為高強度隨機值（UUID v4 或加密安全的隨機字串）
- 重設 Token 為一次性使用，使用後立即標記為已使用
- 新密碼以 bcrypt 雜湊處理（成本因子 >= 10），明文密碼絕不儲存或記錄
- 重設成功後，所有現有 Session Token 必須失效
- 重設連結應透過 HTTPS 傳輸
- 實施 Rate Limiting 防止暴力破解 Token
- Email 內容不應包含密碼或其他敏感資訊，僅包含重設連結

## 效能需求

- forgot-password API 回應時間應一致（無論 Email 是否存在），避免透過回應時間差異推測帳號是否存在
- Email 寄送可為非同步操作，不阻塞 API 回應

## 交叉參考

- User Story：[US-015-self-service-password-reset.md](../stories/epics/E02-account-role-management/US-015-self-service-password-reset.md)
- Epic Brief：[E02 Epic Brief](../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004（帳號建立）、F010（Admin 重設密碼，獨立流程）
