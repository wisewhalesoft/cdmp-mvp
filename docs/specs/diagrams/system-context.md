---
spec-id: DIAG-001
title: 系統上下文圖 (System Context Diagram)
version: "1.0"
date: 2026-03-06
status: Draft
---

# 系統上下文圖 (C4 Level 1)

本圖呈現 CDMP 系統與外部角色、外部系統之間的互動關係。

```mermaid
graph TB
    subgraph 使用者["使用者"]
        Admin["👤 管理員 (Admin)<br/>管理帳號、資料源、<br/>系統監控"]
        User["👤 一般使用者 (User)<br/>檢視個人資訊"]
    end

    subgraph CDMP["CDMP 客戶資料管理平台"]
        System["CDMP System<br/>帳號管理 / 資料源管理 /<br/>身份驗證 / 健康檢查"]
    end

    subgraph 外部系統["外部系統"]
        Email["📧 電子郵件服務<br/>(SMTP / SendGrid)<br/>密碼重設通知"]
        MySQL["🗄️ MySQL 資料庫<br/>Port 3306"]
        PostgreSQL["🗄️ PostgreSQL 資料庫<br/>Port 5432"]
        SQLServer["🗄️ SQL Server 資料庫<br/>Port 1433"]
    end

    Admin -- "HTTPS<br/>登入 / 帳號管理 /<br/>資料源 CRUD /<br/>連線測試 / 儀表板" --> System
    User -- "HTTPS<br/>登入 / 檢視個人資訊" --> System

    System -- "SMTP/API<br/>發送密碼重設郵件" --> Email
    System -- "TCP<br/>連線測試 / 健康檢查" --> MySQL
    System -- "TCP<br/>連線測試 / 健康檢查" --> PostgreSQL
    System -- "TCP<br/>連線測試 / 健康檢查" --> SQLServer
```

## 說明

| 元素 | 類型 | 描述 |
|------|------|------|
| 管理員 (Admin) | 使用者角色 | 具備完整系統管理權限，可管理帳號、資料源、檢視儀表板 |
| 一般使用者 (User) | 使用者角色 | 僅可登入並檢視個人相關資訊 |
| CDMP System | 系統邊界 | 核心平台，涵蓋身份驗證、帳號管理、資料源管理、自動健康檢查 |
| 電子郵件服務 | 外部服務 | 透過 SMTP 或 SendGrid API 發送密碼重設郵件 |
| MySQL / PostgreSQL / SQL Server | 外部資料庫 | 由 CDMP 管理的外部資料源，系統透過 TCP 進行連線測試與定期健康檢查 |
