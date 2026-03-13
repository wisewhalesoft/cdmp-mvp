---
spec-id: DIAG-004
title: 身份驗證流程圖 (Authentication Flow)
version: "1.0"
date: 2026-03-06
status: Draft
---

# 身份驗證流程圖

本圖呈現登入、Token 驗證、登出的完整互動流程，涵蓋成功與失敗情境。

## 登入流程

```mermaid
sequenceDiagram
    autonumber
    actor 使用者
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫
    participant 黑名單 as Token Blocklist

    使用者->>前端: 輸入 email / 密碼 / Remember Me
    前端->>API: POST /api/auth/login<br/>{email, password, rememberMe}
    API->>DB: 查詢 User (by email)

    alt 帳號不存在
        DB-->>API: null
        API-->>前端: 401 "帳號或密碼錯誤"
        前端-->>使用者: 顯示錯誤訊息
    else 帳號已停用 (Disabled)
        DB-->>API: User (status: Disabled)
        API-->>前端: 403 "帳號已被停用"
        前端-->>使用者: 顯示帳號停用訊息
    else 密碼錯誤
        DB-->>API: User (status: Active)
        API->>API: bcrypt.compare 失敗
        API-->>前端: 401 "帳號或密碼錯誤"
        前端-->>使用者: 顯示錯誤訊息
    else 登入成功
        DB-->>API: User (status: Active)
        API->>API: bcrypt.compare 成功
        alt Remember Me = true
            API->>API: 簽發 JWT (效期 7 天)
        else Remember Me = false
            API->>API: 簽發 JWT (效期較短)
        end
        API-->>前端: 200 {token, user: {id, name, role}}

        alt role = Admin
            前端->>前端: 導向管理儀表板
        else role = User
            前端->>前端: 導向個人資訊頁
        end
        前端->>前端: 儲存 JWT 至 Client Storage
        前端-->>使用者: 顯示對應首頁
    end
```

## Token 驗證流程（受保護端點）

```mermaid
sequenceDiagram
    autonumber
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant 黑名單 as Token Blocklist

    前端->>API: 請求受保護端點<br/>Header: Authorization: Bearer {JWT}

    alt 無 Token 或格式錯誤
        API-->>前端: 401 "未授權"
    else Token 已過期
        API->>API: 驗證 JWT 簽章與過期時間
        API-->>前端: 401 "Token 已過期"
    else Token 在黑名單中
        API->>黑名單: 檢查 Token 是否存在
        黑名單-->>API: 存在（已登出）
        API-->>前端: 401 "Token 已失效"
    else Token 有效
        API->>黑名單: 檢查 Token 是否存在
        黑名單-->>API: 不存在
        API->>API: 解析 JWT payload (userId, role)
        API->>API: 執行業務邏輯
        API-->>前端: 200 回應資料
    end
```

## 登出流程

```mermaid
sequenceDiagram
    autonumber
    actor 使用者
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant 黑名單 as Token Blocklist

    使用者->>前端: 點擊登出
    前端->>API: POST /api/auth/logout<br/>Header: Authorization: Bearer {JWT}
    API->>API: 解析 JWT 取得 token ID 與到期時間
    API->>黑名單: 將 Token 加入黑名單<br/>（TTL = Token 剩餘有效期）
    黑名單-->>API: 確認寫入
    API-->>前端: 200 "登出成功"
    前端->>前端: 清除 Client Storage 中的 JWT
    前端->>前端: 導向登入頁面
    前端-->>使用者: 顯示登入頁面
```

## 流程說明

### 登入安全考量

| 項目 | 說明 |
|------|------|
| 密碼驗證 | 使用 bcrypt 比對密碼雜湊 |
| 錯誤訊息 | 帳號不存在與密碼錯誤回傳相同訊息，防止帳號列舉攻擊 |
| 停用帳號 | 獨立錯誤碼 403，明確告知帳號已停用 |
| Remember Me | 影響 JWT 有效期長度 |
| 角色路由 | Admin 導向儀表板，User 導向個人資訊頁 |

### Token 管理

| 項目 | 說明 |
|------|------|
| Token 格式 | JWT，包含 userId、role、到期時間 |
| 黑名單機制 | 登出時將 Token 加入 Blocklist，TTL 與 Token 剩餘有效期一致 |
| 驗證順序 | 簽章 → 過期 → 黑名單 → 解析 payload |
