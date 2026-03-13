---
spec-id: DIAG-002
title: 容器架構圖 (Container Architecture)
version: "1.0"
date: 2026-03-06
status: Draft
---

# 容器架構圖

本圖呈現 CDMP 系統內部的主要容器（元件）及其互動關係。

```mermaid
graph TB
    Admin["👤 管理員"]
    User["👤 一般使用者"]

    subgraph CDMP["CDMP 系統邊界"]
        Frontend["🖥️ 前端應用<br/>(SPA)<br/>使用者介面"]
        Backend["⚙️ 後端 API 伺服器<br/>RESTful API<br/>身份驗證 / 業務邏輯"]
        AppDB["🗄️ 應用資料庫<br/>User / Datasource /<br/>PasswordResetToken /<br/>DatasourceHealthLog"]
        TokenStore["🔑 Token Blocklist Store<br/>已登出 JWT 儲存"]
        Scheduler["⏰ 排程器<br/>健康檢查 Cron Job<br/>每 30 分鐘執行"]
    end

    subgraph 外部服務["外部服務"]
        EmailService["📧 電子郵件服務<br/>(SMTP / SendGrid)"]
    end

    subgraph 外部資料源["受管理的外部資料源"]
        MySQL["🗄️ MySQL<br/>Port 3306"]
        PostgreSQL["🗄️ PostgreSQL<br/>Port 5432"]
        SQLServer["🗄️ SQL Server<br/>Port 1433"]
    end

    Admin -- "HTTPS" --> Frontend
    User -- "HTTPS" --> Frontend

    Frontend -- "REST API<br/>(JSON / JWT)" --> Backend

    Backend -- "SQL 查詢<br/>讀寫資料" --> AppDB
    Backend -- "查詢/寫入<br/>Token 黑名單" --> TokenStore
    Backend -- "SMTP/API<br/>密碼重設郵件" --> EmailService

    Backend -- "TCP 連線測試<br/>SELECT 1" --> MySQL
    Backend -- "TCP 連線測試<br/>SELECT 1" --> PostgreSQL
    Backend -- "TCP 連線測試<br/>SELECT 1" --> SQLServer

    Scheduler -- "觸發健康檢查<br/>呼叫內部 API" --> Backend
```

## 容器說明

| 容器 | 職責 | 備註 |
|------|------|------|
| 前端應用 (SPA) | 提供使用者介面，處理路由與角色導向 | Admin 登入後導向儀表板；User 導向個人資訊頁 |
| 後端 API 伺服器 | 處理所有業務邏輯、身份驗證、API 端點 | JWT 驗證、bcrypt 密碼雜湊、AES-256 憑證加密 |
| 應用資料庫 | 儲存 CDMP 自身資料 | 包含 User、Datasource、PasswordResetToken、DatasourceHealthLog 實體 |
| Token Blocklist Store | 儲存已登出的 JWT token | 用於 Logout 時將 token 加入黑名單 |
| 排程器 | 定時觸發資料源健康檢查 | 每 30 分鐘執行一次，10 秒逾時限制 |
| 電子郵件服務 | 發送密碼重設通知郵件 | 外部服務，透過 SMTP 或 SendGrid API |
| 外部資料源 | CDMP 管理的目標資料庫實例 | 支援 MySQL、PostgreSQL、SQL Server |
