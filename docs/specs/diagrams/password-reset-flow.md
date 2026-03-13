---
spec-id: DIAG-005
title: 密碼重設流程圖 (Password Reset Flow)
version: "1.0"
date: 2026-03-06
status: Draft
---

# 密碼重設流程圖

本圖呈現兩種密碼重設途徑：使用者自助重設與管理員重設。

## 使用者自助密碼重設

```mermaid
sequenceDiagram
    autonumber
    actor 使用者
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫
    participant 郵件 as 電子郵件服務
    participant 黑名單 as Token Blocklist

    使用者->>前端: 點擊「忘記密碼」
    前端->>前端: 顯示輸入 email 表單
    使用者->>前端: 輸入 email
    前端->>API: POST /api/auth/forgot-password<br/>{email}

    API->>DB: 查詢 User (by email)

    alt email 不存在
        DB-->>API: null
        Note over API: 安全考量：不洩漏帳號是否存在
        API-->>前端: 200 "若信箱存在，重設郵件已寄出"
    else email 存在
        DB-->>API: User
        API->>API: 產生隨機 reset token
        API->>DB: 儲存 PasswordResetToken<br/>(expires_at = now + 24h)
        DB-->>API: 確認儲存
        API->>郵件: 發送重設郵件<br/>包含重設連結 (含 token)
        郵件-->>API: 發送成功
        API-->>前端: 200 "若信箱存在，重設郵件已寄出"
    end

    前端-->>使用者: 顯示統一成功訊息

    Note over 使用者,郵件: --- 使用者收到郵件後 ---

    使用者->>前端: 點擊郵件中的重設連結
    前端->>前端: 顯示新密碼輸入表單
    使用者->>前端: 輸入新密碼
    前端->>API: POST /api/auth/reset-password<br/>{token, newPassword}

    API->>DB: 查詢 PasswordResetToken (by token)

    alt Token 不存在
        DB-->>API: null
        API-->>前端: 400 "Token 無效"
    else Token 已過期 (> 24h)
        DB-->>API: Token (expired)
        API-->>前端: 400 "Token 已過期"
    else Token 已使用
        DB-->>API: Token (used_at != null)
        API-->>前端: 400 "Token 已使用"
    else Token 有效
        DB-->>API: Token (valid)
        API->>API: bcrypt.hash(newPassword)
        API->>DB: 更新 User.password_hash
        API->>DB: 標記 Token 已使用<br/>(used_at = now)
        API->>黑名單: 將該使用者所有現有 JWT 加入黑名單
        黑名單-->>API: 確認
        API-->>前端: 200 "密碼重設成功"
        前端->>前端: 導向登入頁面
        前端-->>使用者: 顯示登入頁面
    end
```

## 管理員重設使用者密碼

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 管理員
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫
    participant 黑名單 as Token Blocklist

    Admin->>前端: 在帳號管理中選擇「重設密碼」
    前端->>API: POST /api/accounts/{userId}/reset-password<br/>Header: Authorization: Bearer {AdminJWT}

    API->>API: 驗證請求者角色為 Admin
    API->>DB: 查詢目標 User
    DB-->>API: User

    alt 目標使用者不存在
        API-->>前端: 404 "使用者不存在"
    else 目標使用者存在
        API->>API: 產生臨時密碼或觸發重設流程
        API->>DB: 更新 User.password_hash
        DB-->>API: 確認更新
        API->>黑名單: 將該使用者所有現有 JWT 加入黑名單
        黑名單-->>API: 確認
        API-->>前端: 200 "密碼已重設"
        前端-->>Admin: 顯示重設成功訊息
    end

    Note over Admin,黑名單: 目標使用者的所有 Session 立即失效
```

## 安全設計要點

| 項目 | 說明 |
|------|------|
| 統一回應訊息 | `forgot-password` 無論 email 是否存在，皆回傳相同訊息，防止帳號列舉 |
| Token 有效期 | 24 小時，過期後不可使用 |
| Token 一次性 | 使用後標記 `used_at`，不可重複使用 |
| Session 失效 | 密碼重設成功後，該使用者所有現有 JWT 加入黑名單，強制重新登入 |
| 密碼雜湊 | 新密碼使用 bcrypt 雜湊後儲存 |
| 管理員權限 | 管理員重設密碼端點需驗證 Admin 角色 |
