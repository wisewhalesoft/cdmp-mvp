---
spec-id: DIAG-002
title: 容器架構圖 (Container Architecture)
version: "1.1"
date: 2026-04-13
status: Draft
---

# 容器架構圖

本圖呈現 CDMP 系統內部的主要容器（元件）及其互動關係。

```mermaid
graph TB
    Admin["管理員（Admin）"]
    User["一般使用者（User）"]

    subgraph CDMP["CDMP 系統邊界"]
        Frontend["前端應用（SPA）<br/>使用者介面<br/>含 Customer 360 頁面（E06）"]

        subgraph BackendModules["後端 API 伺服器（Modular Monolith）"]
            CoreAPI["核心 API 模組<br/>Auth / Account / Datasource<br/>Extraction / ETL Pipeline"]
            C360API["Customer 360 模組（E06）<br/>GET /api/v1/c360/customers/stats<br/>GET /api/v1/c360/customers<br/>GET /api/v1/c360/customers/:id<br/>唯讀查詢、敏感資料遮罩"]
            Scheduler["Scheduler 模組<br/>健康檢查、擷取排程<br/>Pipeline 排程、清理 Cron Job"]
        end

        AppDB["應用資料庫（PostgreSQL）<br/>User / Datasource / ExtractionTask<br/>EtlPipeline / EtlPipelineVersion<br/>customer_core（ETL 目標表，E06 唯讀）<br/>raw_{task_id} 動態資料表"]
        TokenStore["Token Blocklist Store<br/>已登出 JWT 儲存"]
    end

    subgraph 外部服務["外部服務"]
        EmailService["電子郵件服務<br/>（SMTP / SendGrid）"]
    end

    subgraph 外部資料源["受管理的外部資料源"]
        MySQL["MySQL（Port 3306）"]
        PostgreSQL["PostgreSQL（Port 5432）"]
        SQLServer["SQL Server（Port 1433）"]
    end

    Admin -- "HTTPS" --> Frontend
    User -- "HTTPS（含 Customer 360）" --> Frontend

    Frontend -- "REST API（JSON / JWT）" --> CoreAPI
    Frontend -- "REST API（JSON / JWT）<br/>GET /api/v1/c360/**" --> C360API

    CoreAPI -- "SQL 查詢<br/>讀寫（User/Datasource/ExtractionTask/EtlPipeline/raw_*）" --> AppDB
    C360API -- "SQL 查詢（唯讀）<br/>customer_core FTS / 精確搜尋 / 詳情" --> AppDB
    CoreAPI -- "查詢/寫入 Token 黑名單" --> TokenStore
    CoreAPI -- "SMTP/API 密碼重設郵件" --> EmailService

    CoreAPI -- "TCP 連線測試（SELECT 1）<br/>批次資料擷取" --> MySQL
    CoreAPI -- "TCP 連線測試（SELECT 1）<br/>批次資料擷取" --> PostgreSQL
    CoreAPI -- "TCP 連線測試（SELECT 1）<br/>批次資料擷取" --> SQLServer

    Scheduler -- "觸發健康檢查 / 排程任務" --> CoreAPI

    classDef actor fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    classDef c360 fill:#e0f2fe,stroke:#0284c7,stroke-width:2px
    classDef core fill:#dcfce7,stroke:#16a34a
    classDef db fill:#fef9c3,stroke:#ca8a04
    classDef ext fill:#fef2f2,stroke:#ef4444
    class Admin,User actor
    class C360API c360
    class CoreAPI,Scheduler,Frontend core
    class AppDB,TokenStore db
    class EmailService,MySQL,PostgreSQL,SQLServer ext
```

## 容器說明

| 容器 | 職責 | 備註 |
|------|------|------|
| 前端應用（SPA） | 提供使用者介面，處理路由與角色導向；含 Customer 360 客戶清單與詳情頁（E06） | Admin 登入後導向管理儀表板；User 可存取 Customer 360 功能 |
| 核心 API 模組 | 處理 Auth、Account、Datasource、Extraction、ETL Pipeline 等業務邏輯與 API 端點 | JWT 驗證、bcrypt 密碼雜湊、AES-256 憑證加密 |
| Customer 360 模組（E06） | 提供客戶搜尋清單（含 FTS / 精確搜尋 / 類型篩選）與 360 詳情查詢；唯讀存取 `customer_core`；依角色遮罩敏感欄位 | Admin / User 均可存取；不寫入任何資料表 |
| Scheduler 模組 | 定時觸發資料源健康檢查（30 分鐘）、擷取排程掃描（1 分鐘）、Pipeline 排程掃描（1 分鐘）、Cron 清理工作 | 模組內部方法呼叫，不對外暴露 API |
| 應用資料庫（PostgreSQL） | 儲存 CDMP 所有持久資料，包含 ETL 目標表 `customer_core`（E06 唯讀查詢來源） | `customer_core` 由 ETL Pipeline 寫入，由 C360 模組唯讀查詢 |
| Token Blocklist Store | 儲存已登出的 JWT token | 用於 Logout 時將 token 加入黑名單 |
| 電子郵件服務 | 發送密碼重設通知郵件 | 外部服務，透過 SMTP 或 SendGrid API |
| 外部資料源 | CDMP 管理的目標資料庫實例 | 支援 MySQL、PostgreSQL、SQL Server；僅 CoreAPI 連線（C360 不連線外部資料源） |

## 版本說明

- v1.0（2026-03-06）：初始版本，包含核心模組（Auth / Account / Datasource / Extraction）
- v1.1（2026-04-13）：新增 Customer 360 模組（E06），更新圖表區分 CoreAPI 與 C360API，更新應用資料庫說明（含 customer_core E06 唯讀），標示 User 角色可存取 Customer 360 功能
