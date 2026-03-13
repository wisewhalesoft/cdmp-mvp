---
spec-id: DIAG-003
title: 實體關聯圖 (Entity-Relationship Diagram)
version: "1.0"
date: 2026-03-06
status: Draft
---

# 實體關聯圖

本圖呈現 CDMP 系統的核心資料模型及實體間的關聯關係。

```mermaid
erDiagram
    User {
        UUID id PK "主鍵"
        String name "使用者名稱"
        String email UK "電子郵件（唯一）"
        String password_hash "bcrypt 密碼雜湊"
        Enum role "角色: Admin / User"
        Enum status "狀態: Active / Disabled"
        DateTime created_at "建立時間"
        DateTime updated_at "更新時間"
    }

    Datasource {
        UUID id PK "主鍵"
        String name "資料源名稱"
        Enum type "類型: MySQL / PostgreSQL / SQLServer"
        String host "主機位址"
        Integer port "連接埠（3306/5432/1433）"
        String database_name "資料庫名稱"
        String username "連線帳號"
        String encrypted_password "AES-256 加密密碼"
        String description "描述（選填）"
        Enum status "狀態: Unknown / Connected / Disconnected"
        DateTime last_tested_at "最後測試時間"
        DateTime deleted_at "軟刪除時間（nullable）"
        DateTime created_at "建立時間"
        DateTime updated_at "更新時間"
        UUID created_by FK "建立者 User ID"
    }

    PasswordResetToken {
        UUID id PK "主鍵"
        UUID user_id FK "使用者 ID"
        String token UK "重設 Token（唯一）"
        DateTime expires_at "到期時間（24 小時）"
        DateTime used_at "使用時間（nullable）"
        DateTime created_at "建立時間"
    }

    DatasourceHealthLog {
        UUID id PK "主鍵"
        UUID datasource_id FK "資料源 ID"
        Boolean success "檢查是否成功"
        Integer response_time_ms "回應時間（毫秒）"
        String error_message "錯誤訊息（nullable）"
        DateTime checked_at "檢查時間"
    }

    User ||--o{ Datasource : "建立"
    User ||--o{ PasswordResetToken : "擁有"
    Datasource ||--o{ DatasourceHealthLog : "產生"
```

## 實體說明

### User（使用者）

系統使用者帳號，分為 Admin 與 User 兩種角色。

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| id | UUID | 是 | 主鍵 |
| name | String | 是 | 使用者顯示名稱 |
| email | String | 是 | 唯一，用於登入與密碼重設 |
| password_hash | String | 是 | bcrypt 雜湊後的密碼 |
| role | Enum | 是 | `Admin` 或 `User` |
| status | Enum | 是 | `Active` 或 `Disabled` |
| created_at | DateTime | 是 | 自動產生 |
| updated_at | DateTime | 是 | 自動更新 |

### Datasource（資料源）

CDMP 管理的外部資料庫連線設定。

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| id | UUID | 是 | 主鍵 |
| name | String | 是 | 資料源顯示名稱 |
| type | Enum | 是 | `MySQL` / `PostgreSQL` / `SQLServer` |
| host | String | 是 | 資料庫主機位址 |
| port | Integer | 是 | 預設依類型：3306 / 5432 / 1433 |
| database_name | String | 是 | 目標資料庫名稱 |
| username | String | 是 | 連線帳號 |
| encrypted_password | String | 是 | AES-256 加密後的連線密碼 |
| description | String | 否 | 選填描述 |
| status | Enum | 是 | `Unknown` / `Connected` / `Disconnected` |
| last_tested_at | DateTime | 否 | 最近一次測試時間 |
| deleted_at | DateTime | 否 | 軟刪除時間戳（null 表示未刪除） |
| created_at | DateTime | 是 | 自動產生 |
| updated_at | DateTime | 是 | 自動更新 |
| created_by | UUID (FK) | 是 | 建立此資料源的 User ID |

### PasswordResetToken（密碼重設 Token）

密碼重設流程中產生的一次性 Token。

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| id | UUID | 是 | 主鍵 |
| user_id | UUID (FK) | 是 | 對應的使用者 |
| token | String | 是 | 唯一 Token 值 |
| expires_at | DateTime | 是 | 到期時間（建立後 24 小時） |
| used_at | DateTime | 否 | 使用時間（null 表示未使用） |
| created_at | DateTime | 是 | 自動產生 |

### DatasourceHealthLog（資料源健康檢查紀錄）

每次健康檢查或手動測試的結果紀錄。

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| id | UUID | 是 | 主鍵 |
| datasource_id | UUID (FK) | 是 | 對應的資料源 |
| success | Boolean | 是 | 檢查是否成功 |
| response_time_ms | Integer | 否 | 回應時間（毫秒），失敗時可能為 null |
| error_message | String | 否 | 失敗時的錯誤訊息 |
| checked_at | DateTime | 是 | 檢查執行時間 |

## 關聯關係

| 關聯 | 基數 | 說明 |
|------|------|------|
| User → Datasource | 1:N | 一個使用者可建立多個資料源 |
| User → PasswordResetToken | 1:N | 一個使用者可擁有多個重設 Token（歷史紀錄） |
| Datasource → DatasourceHealthLog | 1:N | 一個資料源可有多筆健康檢查紀錄 |
