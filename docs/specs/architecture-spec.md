---
type: architecture-spec
version: 1.5
status: draft
last_updated: 2026-03-25
covers: [F001, F002, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012, F013, F014, F015, F016, F017, F018, F019, F020, F021, F022, F023, F024, F025, F026, F027, F028, F029, F030, F031, F032, F033, F034, F036, F038]
---

# 系統架構規格書

## Agent Loading Guide

| Agent 角色 | 建議閱讀章節 |
|-----------|------------|
| Test Designer | 2. 系統上下文、3. 邏輯架構（ETL Pipeline 模組）、5. 整合與通訊（5.6 Pipeline 執行流程）、10. 技術棧決策 |
| TDD Developer | 3. 邏輯架構（ETL Pipeline 模組 AD-E05-1~5）、4. 資料架構（EtlPipeline/Version/Log 實體）、5. 整合與通訊、6. NFR 對應、10. 技術棧決策 |
| UI/UX Designer | 2. 系統上下文、3. 邏輯架構（前端模組，Pipeline 視覺化編輯器）、10. 技術棧決策（React Flow） |
| DevOps / CI/CD | 7. 部署與執行時期視圖、10. 技術棧決策 |
| Product Analyst | 8. 風險（風險 6-9 為 E05 新增）、9. 待決事項（9.4 E05 已決議、9.5 E05 假設） |

## 目錄

1. [架構總覽](#1-架構總覽)
2. [系統上下文](#2-系統上下文)
3. [邏輯架構](#3-邏輯架構)
4. [資料架構](#4-資料架構)
5. [整合與通訊](#5-整合與通訊)
6. [非功能需求架構對應](#6-非功能需求架構對應)
7. [部署與執行時期視圖](#7-部署與執行時期視圖)
8. [風險、取捨與替代方案](#8-風險取捨與替代方案)
9. [待決事項](#9-待決事項)
10. [技術棧決策](#10-技術棧決策)

---

## 1. 架構總覽

### 1.1 架構風格

CDMP MVP 採用 **Modular Monolith** 架構搭配 **SPA（Single Page Application）前端**。後端為單一部署單元，但內部依業務能力切分模組邊界（Auth、Account、Datasource、Extraction、ETL Pipeline），各模組明確定義職責範圍，避免跨模組直接耦合。

```mermaid
graph TD
    subgraph 用戶端["用戶端層"]
        Browser["瀏覽器 (SPA)"]
    end

    subgraph 後端["後端層 (Modular Monolith)"]
        API["REST API 閘道層<br/>路由、認證中介層、Rate Limiting"]
        AuthMod["Auth 模組<br/>登入、登出、密碼重設"]
        AccountMod["Account 模組<br/>帳號 CRUD、角色管理"]
        DatasourceMod["Datasource 模組<br/>連線設定、測試、監控"]
        ExtractionMod["Extraction 模組<br/>擷取任務 CRUD、執行調度、日誌管理"]
        ETLMod["ETL Pipeline 模組<br/>Pipeline CRUD、版本管理<br/>視覺化定義、執行引擎"]
        Scheduler["Scheduler 模組<br/>健康檢查、擷取排程掃描<br/>Pipeline 排程掃描、清理 Cron Job"]
        OrphanRecoveryMod["Orphan Recovery 模組<br/>啟動時孤兒任務回收"]
    end

    subgraph 持久層["持久層"]
        AppDB["應用資料庫<br/>(RDBMS)"]
        TokenStore["Token Blocklist<br/>(快取或 DB)"]
    end

    subgraph 外部["外部服務"]
        Email["Email 服務<br/>(SMTP / SendGrid)"]
        TargetDB["外部資料來源<br/>(MySQL / PostgreSQL / SQL Server)"]
    end

    Browser -->|"HTTPS REST API"| API
    API --> AuthMod
    API --> AccountMod
    API --> DatasourceMod
    API --> ExtractionMod
    API --> ETLMod
    Scheduler --> DatasourceMod
    Scheduler --> ExtractionMod
    Scheduler --> ETLMod
    OrphanRecoveryMod --> ExtractionMod
    OrphanRecoveryMod --> ETLMod
    ETLMod --> ExtractionMod
    AuthMod --> AppDB
    AuthMod --> TokenStore
    AuthMod --> Email
    AccountMod --> AppDB
    DatasourceMod --> AppDB
    DatasourceMod --> TargetDB
    ExtractionMod --> AppDB
    ExtractionMod --> TargetDB
    ETLMod --> AppDB

    classDef layer fill:#f0f4ff,stroke:#4f6ef7,stroke-width:2px
    classDef module fill:#e8f5e9,stroke:#388e3c,stroke-width:1px
    classDef external fill:#fff3e0,stroke:#e65100,stroke-width:1px
    class Browser layer
    class API,AuthMod,AccountMod,DatasourceMod,ExtractionMod,ETLMod,Scheduler,OrphanRecoveryMod module
    class Email,TargetDB,AppDB,TokenStore external
```

### 1.2 架構選擇理由

| 決策 | 選擇 | 理由 |
|------|------|------|
| 整體架構 | Modular Monolith | 使用者規模 500 人以下、開發團隊小、MVP 階段。Microservices 的操作複雜度在此規模不合理。 |
| 前端 | SPA | 規格書明確假設（A6）。Admin 後台需要豐富互動體驗（儀表板、即時狀態更新）。 |
| API 風格 | RESTful API | 標準、可預測，與 SPA 搭配成熟。規格書已定義所有端點路徑與 HTTP 方法。 |
| Session 管理 | JWT + Refresh Token | OQ-1 決議。支援無狀態水平擴展，短效 Access Token 降低洩漏風險。 |
| Token 失效 | Token Blocklist | NFR-001.1 明確要求。用於登出、帳號停用、密碼重設後強制失效。 |
| 排程 | 內建 Scheduler 模組 | MVP 排程需求包含靜態 Cron（健康檢查每 30 分鐘、清理每日）與動態 Cron 掃描（擷取排程每分鐘），引入獨立排程服務（如 BullMQ）過度複雜。 |
| 擷取執行模型 | Promise-based 非同步執行 | MVP 擷取為 I/O 密集（資料庫查詢），Node.js 非同步 I/O 足以應對；API 層回傳 `202 Accepted`，前端 Polling 取得進度。 |
| Pipeline 定義儲存 | JSONB 欄位 | Pipeline 節點與連線結構為非固定 schema，JSONB 提供靈活儲存並支援 PostgreSQL 原生 JSONB 查詢；版本 Diff 在應用層計算。 |
| Pipeline 執行引擎 | 同 Monolith 內的 Promise-based 循序執行 | MVP 規模下節點數量有限，I/O 密集型操作，Node.js 非同步 I/O 已足夠；BullMQ 等佇列系統引入 Redis 依賴，不符 MVP 複雜度預算。 |
| Pipeline 視覺化編輯器 | 前端 React Flow | 規格書 F029 明確建議；SPA 架構下純前端即可實現拖拉畫布；定義以 JSONB 序列化後傳送至後端儲存。 |
| 技術棧 | Node.js + NestJS + React + PostgreSQL | 詳見第 10 節技術棧決策。 |

### 1.3 關鍵取捨

- **選擇 Modular Monolith 而非 Microservices**：犧牲部分服務獨立擴展能力，換取顯著較低的開發與運維複雜度。MVP 並發需求（100 人）可由單機處理。
- **JWT 短效 Access Token + Refresh Token**：比純 blocklist 方案複雜，但安全性更佳，且支援未來 SSO 整合（Phase 2）。
- **Polling 而非 WebSocket**（儀表板更新）：OQ-9 決議。降低後端實作複雜度，30 秒輪詢對監控場景可接受。擷取任務進度 Polling 採 3 秒間隔（F021/F024）。
- **Promise-based 非同步執行而非 BullMQ / Worker Thread**（擷取作業與 Pipeline 執行）：MVP 任務為 I/O 密集（資料庫批次查詢），Node.js 事件循環可有效處理。BullMQ 引入 Redis 強依賴與額外運維複雜度，不符 MVP 規模。
- **Pipeline 定義以 JSONB 儲存而非正規化關聯表**：節點類型有 13 種（13 種 Transform + Extract + Load），各節點設定結構差異大，正規化設計需大量 JOIN 且擴展困難。JSONB 儲存允許應用層解析，版本 Diff 於後端計算後回傳 API。
- **Pipeline 排程複用 Extraction Scheduler 掃描模式**：每分鐘掃描符合排程條件的 Pipeline，避免引入動態 Cron Job 管理複雜度（每個 Pipeline 獨立 Cron 物件需追蹤生命週期）。

---

## 2. 系統上下文

### 2.1 外部參與者與整合點

```mermaid
graph TB
    subgraph 內部使用者["內部使用者"]
        Admin["Admin（管理員）<br/>IT 管理員、資料團隊主管"]
        User["User（一般使用者）<br/>資料分析師、業務人員"]
    end

    subgraph CDMP["CDMP 平台"]
        System["CDMP 系統<br/>(本系統)"]
    end

    subgraph 外部服務["外部依賴"]
        EmailSvc["Email 服務<br/>SMTP / SendGrid<br/>密碼重設郵件"]
        MySQL["MySQL 實例<br/>連線測試 / 資料擷取目標"]
        PostgreSQL["PostgreSQL 實例<br/>連線測試 / 資料擷取目標"]
        SQLServer["SQL Server 實例<br/>連線測試 / 資料擷取目標"]
    end

    Admin -->|"HTTPS — 管理後台<br/>帳號、資料來源、擷取任務、ETL Pipeline"| System
    User -->|"HTTPS — 登入<br/>查看說明頁面"| System
    System -->|"SMTP/API<br/>密碼重設連結"| EmailSvc
    System -->|"TCP<br/>連線測試（SELECT 1）<br/>資料擷取（SELECT * / WHERE）"| MySQL
    System -->|"TCP<br/>連線測試（SELECT 1）<br/>資料擷取（SELECT * / WHERE）"| PostgreSQL
    System -->|"TCP<br/>連線測試（SELECT 1）<br/>資料擷取（SELECT * / WHERE）"| SQLServer

    classDef actor fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    classDef system fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    classDef external fill:#fef9c3,stroke:#ca8a04,stroke-width:1px
    class Admin,User actor
    class System system
    class EmailSvc,MySQL,PostgreSQL,SQLServer external
```

### 2.2 信任邊界

```mermaid
graph TB
    subgraph TZ_Public["信任區域：公開（無需驗證）"]
        Login["POST /api/v1/auth/login"]
        ForgotPw["POST /api/v1/auth/forgot-password"]
        ResetPw["POST /api/v1/auth/reset-password"]
    end

    subgraph TZ_Auth["信任區域：已驗證使用者（JWT 必要）"]
        Logout["POST /api/v1/auth/logout"]
        UserEndpoints["User 可存取端點<br/>（目前為空，MVP 限制）"]
    end

    subgraph TZ_Admin["信任區域：Admin 角色（JWT + role=admin）"]
        AdminEndpoints["Admin 專屬端點<br/>帳號管理 /api/v1/accounts/**<br/>資料來源管理 /api/v1/datasources/**<br/>擷取任務管理 /api/v1/extraction-tasks/**<br/>ETL Pipeline 管理 /api/v1/etl/**"]
    end

    subgraph TZ_Internal["信任區域：系統內部（不對外暴露）"]
        Scheduler["Scheduler — 健康檢查、擷取排程、Pipeline 排程"]
        DB["應用資料庫"]
        TokenStore["Token Blocklist"]
    end

    Internet -->|"HTTPS (TLS 1.2+)"| TZ_Public
    Internet -->|"HTTPS + Bearer Token"| TZ_Auth
    Internet -->|"HTTPS + Bearer Token (role=admin)"| TZ_Admin
    TZ_Admin --> TZ_Internal
    TZ_Auth --> TZ_Internal
    TZ_Public --> TZ_Internal

    classDef public fill:#fef2f2,stroke:#ef4444
    classDef auth fill:#fef9c3,stroke:#ca8a04
    classDef admin fill:#dcfce7,stroke:#16a34a
    classDef internal fill:#f0f4ff,stroke:#4f6ef7
    class TZ_Public public
    class TZ_Auth auth
    class TZ_Admin admin
    class TZ_Internal internal
```

### 2.3 外部依賴摘要

| 外部依賴 | 通訊方式 | 用途 | 相關 Feature |
|---------|---------|------|-------------|
| Email 服務（SMTP / SendGrid） | SMTP 或 HTTPS API | 寄送密碼重設連結 | F009 |
| MySQL 實例 | TCP（Port 3306） | 連線測試（`SELECT 1`）、自動健康檢查、資料擷取（批次 SQL Query） | F015, F016, F021, F023 |
| PostgreSQL 實例 | TCP（Port 5432） | 連線測試（`SELECT 1`）、自動健康檢查、資料擷取（批次 SQL Query） | F015, F016, F021, F023 |
| SQL Server 實例 | TCP（Port 1433） | 連線測試（`SELECT 1`）、自動健康檢查、資料擷取（批次 SQL Query） | F015, F016, F021, F023 |
| 瀏覽器 | HTTPS | 使用者介面 | 全部 |

> **E05 新增說明**：ETL Pipeline 的 Extract 節點讀取 AppDB 內的 raw data 表（不直接連外部資料庫），Load 節點寫入 AppDB 內的目標表（Phase 1 MVP 為 `customer_core`，約 45 欄位，整合 ZZIP_BAMCUST_M 與 MLMCUSTOMER 兩個來源），因此 ETL Pipeline 執行不新增外部依賴，資料流閉合於 AppDB 內部。Target Table Registry 為 in-process 靜態定義，無額外依賴。

> **注意**：資料擷取（F021/F023）對目標資料庫的流量性質與連線測試（`SELECT 1`）顯著不同——擷取為批次資料讀取（`SELECT * FROM table` 或增量 `WHERE col > value`），可能涉及大量資料傳輸，對目標資料庫的負載影響需評估。

---

## 3. 邏輯架構

### 3.1 元件總覽

```mermaid
graph TB
    subgraph Frontend["前端 (SPA)"]
        Router["路由層<br/>角色導向 / 守護"]
        AuthPages["驗證頁面<br/>登入、忘記密碼、重設密碼"]
        AdminPages["Admin 管理頁面<br/>帳號清單、新增帳號、編輯帳號<br/>資料來源清單、新增、編輯<br/>資料來源狀態儀表板<br/>擷取任務儀表板、任務清單<br/>建立/編輯擷取任務、執行日誌<br/>Pipeline 列表、視覺化編輯器<br/>Pipeline 日誌、版本管理"]
        UserPage["User 說明頁面"]
        APIClient["API Client<br/>JWT 附加、錯誤處理、Retry"]
    end

    subgraph Backend["後端 (Modular Monolith)"]
        Middleware["中介層<br/>JWT 驗證、RBAC 守衛<br/>Rate Limiting、CORS、Input Sanitization"]

        subgraph AuthModule["Auth 模組"]
            LoginSvc["Login Service<br/>bcrypt 比對、JWT 發行"]
            LogoutSvc["Logout Service<br/>Token 加入 Blocklist"]
            PwResetSvc["Password Reset Service<br/>Token 產生/驗證、Email 觸發"]
        end

        subgraph AccountModule["Account 模組"]
            AccountSvc["Account Service<br/>CRUD、角色指派<br/>停用/啟用、密碼重設"]
        end

        subgraph DatasourceModule["Datasource 模組"]
            DsSvc["Datasource Service<br/>CRUD、AES-256 加密/解密<br/>連線測試邏輯"]
            DashboardSvc["Dashboard Service<br/>摘要統計、告警計算<br/>效能指標查詢"]
        end

        subgraph ExtractionModule["Extraction 模組"]
            ExtTaskSvc["ExtractionTask Service<br/>CRUD、啟用/停用、軟刪除"]
            ExtExecSvc["ExtractionExecution Service<br/>非同步執行引擎、進度更新<br/>手動/排程/重試 共用邏輯"]
            ExtDashSvc["ExtractionDashboard Service<br/>摘要統計、趨勢圖<br/>效能排名查詢"]
        end

        subgraph ETLModule["ETL Pipeline 模組"]
            PipelineSvc["Pipeline Service<br/>CRUD、啟用/停用、軟刪除<br/>版本管理（建立/回滾/發布）"]
            PipelineDefSvc["Pipeline Definition Service<br/>儲存/載入 JSONB definition<br/>連線規則驗證、step_count 更新"]
            PipelineExecSvc["Pipeline Execution Service<br/>非同步執行引擎（節點循序執行）<br/>Extract/Transform/Load 節點執行<br/>進度更新（5 秒 Polling）"]
            PipelineVersionSvc["Pipeline Version Service<br/>版本 Diff 計算<br/>發布前測試執行驗證"]
        end

        subgraph SchedulerModule["Scheduler 模組"]
            HealthCron["Health Check Cron<br/>每 30 分鐘<br/>呼叫 Datasource Service"]
            ExtractionCron["Extraction Scheduler Cron<br/>每分鐘<br/>掃描動態 Cron 任務"]
            PipelineCron["Pipeline Scheduler Cron<br/>每分鐘<br/>掃描 active + enabled Pipeline"]
            CleanupCron["Cleanup Cron<br/>清理過期 Token / HealthLog<br/>清理過期 ExtractionLog<br/>清理過期 EtlPipelineLog<br/>修復孤立 running 狀態"]
        end

        subgraph OrphanRecoveryModule["Orphan Recovery 模組（F038）"]
            OrphanSvc["OrphanRecovery Service<br/>OnApplicationBootstrap<br/>回收孤兒 ExtractionTask（E04）<br/>回收孤兒 EtlPipeline（E05）"]
        end

        subgraph SharedInfra["共用基礎建設"]
            CryptoUtil["Crypto Util<br/>AES-256 加解密"]
            HashUtil["Hash Util<br/>bcrypt 雜湊/比對"]
            JWTUtil["JWT Util<br/>簽發/驗證/Blocklist 查詢"]
            EmailUtil["Email Util<br/>SMTP/SendGrid 發送"]
            Logger["Logger<br/>結構化日誌（禁止記錄憑證）"]
        end
    end

    subgraph Persistence["持久層"]
        AppDB["應用資料庫<br/>User / Datasource<br/>PasswordResetToken / DatasourceHealthLog<br/>ExtractionTask / ExtractionLog<br/>raw_{task_id_short} 動態表<br/>EtlPipeline / EtlPipelineVersion / EtlPipelineLog<br/>customer_core（Phase 1 MVP 目標表）<br/>Phase 2: customer_financial / customer_interaction<br/>Phase 3: customer_service"]
        TokenStore["Token Blocklist Store"]
    end

    subgraph External["外部"]
        EmailExt["Email 服務"]
        TargetDBs["目標資料庫群"]
    end

    Router --> AuthPages
    Router --> AdminPages
    Router --> UserPage
    AuthPages --> APIClient
    AdminPages --> APIClient
    APIClient -->|"REST API HTTPS"| Middleware
    Middleware --> AuthModule
    Middleware --> AccountModule
    Middleware --> DatasourceModule
    Middleware --> ExtractionModule
    Middleware --> ETLModule
    SchedulerModule --> DatasourceModule
    SchedulerModule --> ExtractionModule
    SchedulerModule --> ETLModule
    OrphanRecoveryModule --> ExtractionModule
    OrphanRecoveryModule --> ETLModule
    ETLModule --> ExtractionModule
    AuthModule --> SharedInfra
    AccountModule --> SharedInfra
    DatasourceModule --> SharedInfra
    ExtractionModule --> SharedInfra
    ETLModule --> SharedInfra
    SharedInfra --> AppDB
    SharedInfra --> TokenStore
    EmailUtil --> EmailExt
    DsSvc -->|"TCP 連線測試"| TargetDBs
    ExtExecSvc -->|"TCP 批次資料擷取"| TargetDBs
    PipelineExecSvc -->|"讀取 raw_* 表<br/>寫入 customer_* 表"| AppDB

    classDef frontend fill:#dbeafe,stroke:#2563eb
    classDef module fill:#dcfce7,stroke:#16a34a
    classDef etlmodule fill:#fce7f3,stroke:#db2777
    classDef orphan fill:#e8f4fd,stroke:#2196F3,stroke-width:1px
    classDef shared fill:#f3e8ff,stroke:#9333ea
    classDef persist fill:#fef9c3,stroke:#ca8a04
    classDef external fill:#fef2f2,stroke:#ef4444
    class Frontend,Router,AuthPages,AdminPages,UserPage,APIClient frontend
    class AuthModule,AccountModule,DatasourceModule,ExtractionModule,SchedulerModule module
    class ETLModule,PipelineSvc,PipelineDefSvc,PipelineExecSvc,PipelineVersionSvc etlmodule
    class OrphanRecoveryModule,OrphanSvc orphan
    class SharedInfra,CryptoUtil,HashUtil,JWTUtil,EmailUtil,Logger shared
    class AppDB,TokenStore persist
    class EmailExt,TargetDBs external
```

### 3.2 各元件職責說明

#### 前端 SPA

| 子模組 | 職責 | 輸入 / 輸出 |
|--------|------|------------|
| 路由層 | 依 JWT 中的 `role` 欄位導向對應頁面；未驗證時導回登入頁 | JWT（localStorage / cookie）→ 路由決策 |
| 驗證頁面（AuthPages） | 登入表單、忘記密碼、重設密碼頁面；前端欄位驗證 | 使用者輸入 → API 請求 |
| Admin 管理頁面 | 帳號管理（F004-F010）、資料來源管理（F011-F016）、擷取任務管理（F017-F025）、ETL Pipeline 管理（F027-F034, F036）所有 UI | API 回應 → 畫面渲染 |
| User 說明頁面 | 靜態說明內容，無可操作功能（MVP 限制） | — |
| API Client | 統一附加 `Authorization: Bearer {token}` header；處理 401/403 回應；提供 Loading 狀態管理；支援不同 Polling 頻率（儀表板 30 秒、擷取進度 3 秒、Pipeline 執行進度 5 秒） | 業務邏輯請求 → HTTP 請求 |

**重要設計決策**：Access Token 的儲存位置（`localStorage` vs `httpOnly Cookie`）由實作團隊決定，但需注意：`localStorage` 面臨 XSS 風險；`httpOnly Cookie` 需處理 CSRF 防護。建議使用 `httpOnly Cookie`。

#### 後端中介層（Middleware）

| 中介層 | 職責 | 執行順序 |
|--------|------|---------|
| CORS | 限制允許的 Origin（OQ-12 決議，需要 CORS 設定） | 1 |
| Rate Limiting | 登入端點：5 次/分鐘/IP（OQ-5 決議）；密碼重設端點：同樣限制 | 2 |
| JWT 驗證 | 驗證 Bearer Token 格式、簽章、有效期；查詢 Token Blocklist | 3 |
| RBAC 守衛 | 依端點定義的角色需求比對 JWT payload 中的 `role` | 4 |
| Input Sanitization | 清除 XSS 與 SQL Injection 惡意字元 | 5 |

#### Auth 模組

| 服務 | 職責 | 關鍵函式 | 相關 Feature |
|------|------|---------|-------------|
| Login Service | 驗證 Email/密碼；發行 Access Token + Refresh Token | `login(email, password, rememberMe)` | F001, F002 |
| Logout Service | 將 Access Token 加入 Blocklist；撤銷 Refresh Token | `logout(userId, token)` | F003 |
| Password Reset Service | 產生 `PasswordResetToken`；觸發 Email 發送；驗證 Token；更新密碼 Hash；失效所有現有 Token | `requestReset(email)`, `resetPassword(token, newPassword)` | F009 |

**Access Token 策略**（依 OQ-1 決議）：
- 短效 Access Token（預設 8 小時；記住我 30 天）
- Refresh Token 用於無停機 JWT Secret 輪替（OQ-11 決議）
- 登出時 Access Token 加入 Blocklist，Refresh Token 撤銷

#### Account 模組

| 服務 | 職責 | 關鍵業務規則 | 相關 Feature |
|------|------|-----------|-------------|
| Account Service | 帳號 CRUD；角色指派；停用/啟用；Admin 代為重設密碼 | 最後一位 Admin 保護（ACCOUNT_LAST_ADMIN）；Admin 不可停用自己（ACCOUNT_SELF_DISABLE）；Email 大小寫不敏感唯一性；停用時失效所有 Session | F004-F010 |

**樂觀鎖定**（OQ-6 決議）：帳號編輯與資料來源編輯均採用 Optimistic Locking，以版本號或 `updated_at` 時間戳記偵測並發衝突，回傳 HTTP 409。

#### Datasource 模組

| 服務 | 職責 | 關鍵業務規則 | 相關 Feature |
|------|------|-----------|-------------|
| Datasource Service | 資料來源 CRUD；AES-256 加密密碼；執行連線測試（`SELECT 1`，10 秒逾時）；更新狀態與 `last_tested_at`；寫入 `DatasourceHealthLog`；查詢外部資料來源的 schema 列表與 table 列表（透過 `IExtractionExecutor.listSchemas()` / `listTables()`） | 密碼 API 回應遮罩；編輯後重設狀態為 `unknown`；軟刪除使用 `deleted_at`；schema/table 查詢設定 10 秒逾時 | F011-F015, F017, F019 |
| Dashboard Service | 彙整儀表板摘要統計；計算告警（連續 >= 2 次失敗）；查詢效能趨勢資料 | 軟刪除資料來源排除；告警依 `consecutiveFailures` 降序 | F016 |

**連線測試隔離**：每次連線測試使用獨立的短期連線，不占用應用程式連線池（MVP 不使用連線池，OQ-R9 決議）。AES-256 解密後的密碼僅在記憶體中存在，測試完成後立即釋放。

**Schema / Table 查詢端點**（AD-E04-10）：Datasource Controller 提供兩個端點，供建立/編輯擷取任務時動態載入來源 schema 與 table 列表：

| 端點 | 說明 | 回應格式 |
|------|------|---------|
| `GET /api/v1/datasources/:id/schemas` | 查詢指定資料來源的可用 schema（或 database）列表 | `{ schemas: string[] }` |
| `GET /api/v1/datasources/:id/schemas/:schema/tables` | 查詢指定 schema 下的資料表列表 | `{ tables: string[] }` |

- 兩個端點均透過 `IExtractionExecutor` 介面的 `listSchemas()` 與 `listTables()` 方法連線外部資料庫查詢
- 設定 10 秒連線逾時；連線失敗時回傳 `503 Service Unavailable`
- 不使用快取機制，每次請求均即時查詢外部資料庫
- 僅 Admin 角色可存取

#### Extraction 模組

| 服務 | 職責 | 關鍵業務規則 | 相關 Feature |
|------|------|-----------|-------------|
| ExtractionTask Service | 擷取任務 CRUD；啟用/停用（toggle）；軟刪除；欄位驗證（cron 格式、增量模式必填欄位）；名稱唯一性（排除軟刪除） | Optimistic Locking；`status=running` 時禁止編輯/停用/刪除；cron 表達式以 `cron-parser` 驗證（UTC）；必須參考存在且未刪除的 Datasource | F017, F018, F019, F020, F025 |
| ExtractionExecution Service | 建立 ExtractionLog（`status=running`）；更新 ExtractionTask（`status=running`）；非同步執行擷取作業（含動態建表、批次讀取外部來源、批次寫入 AppDB raw data 表）；批次更新進度（`extracted_count`、`progress_percent`）；完成後更新統計（`avg_duration_ms`、`execution_count`）；增量模式成功後更新 `last_incremental_value` | 並發控制（`status=running` 時拒絕重複觸發，回傳 409）；執行失敗需捕捉例外並更新狀態為 `failed`；手動觸發可繞過 `enabled` 旗標；全量模式先 TRUNCATE 再寫入；增量模式追加寫入 | F021, F023 |
| ExtractionDashboard Service | 摘要統計（今日成功/失敗以 UTC+8 計算）；趨勢圖（7/14/30 天聚合查詢）；效能排名（Top 5 by `avg_duration_ms DESC`）；執行中任務列表 | 軟刪除任務排除；無執行紀錄時成功率回傳 `0.0`；今日起訖以 UTC+8 (Asia/Taipei) 為邊界 | F018（summary）, F024 |

**非同步執行模型**（AD-E04-1）：

`POST /api/v1/extraction-tasks/:id/run` 回傳 `202 Accepted`，擷取作業在背景非同步執行。

- **選擇方案**：Promise-based 背景作業。API 層建立 ExtractionLog 並更新 Task 狀態後，立即回傳 202；擷取邏輯在背景 Promise chain 中執行。
- **理由**：MVP 擷取為 I/O 密集（非 CPU 密集），Node.js 事件循環可有效處理。BullMQ 需要 Redis 依賴，超出 MVP 規模需求。
- **進度更新機制**：每批次（預設 `batch_size`，可配置 100-10000，預設 1000）更新 `ExtractionTask.extracted_count` 與 `progress_percent` 至資料庫；前端以 3 秒 Polling 讀取進度。
- **逾時機制**：擷取執行最長 2 小時（AQ-9 決議）。超時由 Cleanup Cron 偵測並標記為 `failed`。
- **共用設計**（AD-E04-3）：`ExtractionExecutionService` 為獨立可注入服務，同時被手動觸發 API 端點（F021）與排程 Cron Job（F023）呼叫，差異僅在 `triggered_by` 欄位值（`manual` / `schedule` / `retry`）。

**並發控制**（AD-E04-4）：採用資料庫樂觀檢查（執行前查詢 `status != 'running'`），而非分散式鎖。MVP 單機部署下此方案足夠；水平擴展時需升級為資料庫鎖或分散式鎖（詳見第 8 節）。

#### Scheduler 模組

| Cron Job | 執行頻率 | 職責 |
|---------|---------|------|
| Health Check Cron | 每 30 分鐘 | 平行測試所有未軟刪除的資料來源；呼叫 Datasource Service 的測試邏輯；寫入 `DatasourceHealthLog` |
| Extraction Scheduler Cron | 每分鐘 | 掃描 `enabled=true AND deleted_at IS NULL AND status != 'running'` 的擷取任務；以 `cron-parser` 比對 cron 表達式與當前 UTC 時間；觸發符合條件的任務（呼叫 ExtractionExecution Service，`triggered_by='schedule'`） |
| Pipeline Scheduler Cron | 每分鐘 | 掃描 `enabled=true AND deleted_at IS NULL AND status != 'running'` 且 `status = 'active'` 的 ETL Pipeline；以 `cron-parser` 比對 cron 表達式與當前 UTC 時間；觸發符合條件的 Pipeline（呼叫 Pipeline Execution Service，`triggered_by='schedule'`，使用最新 `published` 版本） |
| Cleanup Cron | 每日 | 清理超過 90 天的 `DatasourceHealthLog`（OQ-10 決議）；清理超過 30 天的 `ExtractionLog`（AQ-10 決議）；清理超過 30 天的 `EtlPipelineLog`（AQ-14 決議）；清理已過期的 `PasswordResetToken`；清理已過期的 Token Blocklist 記錄；修復孤立 running 日誌——ExtractionLog（AD-E04-7）與 EtlPipelineLog（AD-E05-2） |

**孤立 running 日誌修復**（AD-E04-7）：Cleanup Cron 每次執行時，將 `started_at < NOW() - 2 hours AND finished_at IS NULL` 的 ExtractionLog 標記為 `failed`（error_message: `'Execution timeout: exceeded 2 hour limit'`），並同步更新對應 ExtractionTask.status 為 `failed`。

**Raw Data 動態表管理**（AD-E04-8）：擷取任務首次執行時，系統自動於 AppDB 建立 raw data 表（`raw_{task_id_short}`）。表結構從外部來源表的 metadata（`INFORMATION_SCHEMA`）推斷。表名由系統自動生成（`raw_` + task_id 前 8 碼），僅包含 hex 字元，不接受使用者輸入，避免 SQL Injection 風險。欄位名稱經 sanitize 處理（僅允許字母、數字、底線）。

**Raw Data 寫入模式**（AD-E04-9）：
- **全量（full）**：每次執行前 `TRUNCATE TABLE raw_{task_id_short}`，再重新批次寫入全部資料
- **增量（incremental）**：根據 `incremental_column > last_incremental_value` 篩選新增資料，追加寫入
- **批次大小**：預設 1,000 筆/批次（可透過 `EXTRACTION_BATCH_SIZE` 環境變數配置，範圍 100-10,000）

**Raw Data 預覽 API**（AD-E04-10）：`GET /api/v1/extraction-tasks/:id/raw-data` 透過動態 SQL 查詢 raw data 表，支援分頁（`LIMIT` + `OFFSET`）與單欄位排序。不使用 ORM Entity，直接以 Raw SQL 操作動態表。百萬筆資料場景下，依賴 `_cdmp_id`（或主鍵）索引確保分頁效能。非索引欄位排序時附帶效能警告。

#### ETL Pipeline 模組（E05 新增）

| 服務 | 職責 | 關鍵業務規則 | 相關 Feature |
|------|------|-----------|-------------|
| Pipeline Service | Pipeline CRUD；啟用/停用（toggle）；軟刪除；名稱唯一性（排除軟刪除）；與 Version 服務協作完成建立與狀態管理 | 建立時同步建立初始 EtlPipelineVersion（version=1, status=draft）；啟用前驗證有 `published` 版本；`status=running` 時禁止刪除；軟刪除後排程自動排除 | F027, F028, F031, F034 |
| Pipeline Definition Service | 儲存/載入 Pipeline JSONB definition；連線規則驗證（Extract→Transform→Load 方向；禁止逆向循環連線）；更新 `step_count` | 草稿狀態允許不完整設定（節點未填完仍可儲存）；儲存成功後更新 EtlPipeline.step_count 為 nodes 數量 | F029 |
| Pipeline Execution Service | 建立 EtlPipelineLog（`status=running`）；更新 EtlPipeline.status；非同步節點循序執行（Extract→Transform→Load）；進度更新（`processed_count`）；完成後更新統計；測試執行（`is_test_run=true`）不計入正式統計 | 並發控制：`status=running` 時拒絕重複觸發（409）；手動/排程/測試/重試共用執行邏輯，差異僅在 `triggered_by` 與 `is_test_run`；測試執行成功後更新版本狀態 `draft→testing`；排程執行使用最新 `published` 版本 | F030, F033 |
| Pipeline Version Service | 版本歷史查詢；Diff 計算（節點增刪改）；回滾（建立新版本，複製舊版本內容）；發布（`testing→published`，驗證有成功測試執行記錄）；更新 EtlPipeline.version | 版本狀態單向流轉：`draft→testing→published`；發布前必須有 `is_test_run=true` 的成功執行記錄；回滾不修改舊版本，建立新版本（版本號遞增）；排程引擎僅使用最新 `published` 版本 | F033 |
| Target Table Service | 提供目標表清單與 schema 查詢；管理 Target Table Registry（in-process 靜態定義）；為 Load 節點提供欄位對應所需的 schema；標記 ETL 追蹤欄位（`isEtlTracking`）供前端介面識別 | Phase 1 MVP 僅含 `customer_core`（約 45 欄位，分 A~H 八類）；schema 定義為靜態，不支援 Admin 自訂（BR-4）；查詢不存在的表名回傳 404；ETL 追蹤欄位（`data_source`、`_etl_loaded_at`、`_etl_pipeline_id`）由系統自動填充，不可手動對應 | F036 |

**Pipeline 非同步執行模型**（AD-E05-1）：

`POST /api/v1/etl/pipelines/:id/execute` 與 `POST /api/v1/etl/pipelines/:id/test` 均回傳 `202 Accepted`，Pipeline 在背景非同步執行。

- **執行方式**：Promise-based 背景作業；API 層建立 EtlPipelineLog 並更新 Pipeline 狀態後立即回傳 202；節點執行邏輯在背景 Promise chain 中循序執行
- **節點執行順序**：依 definition 的 edges（有向無環圖 DAG）進行拓撲排序後循序執行
- **Extract 節點**：讀取 AppDB 內的 `raw_{task_id_short}` 動態表，以 Raw SQL 查詢（不使用 ORM Entity）
- **Transform 節點**：在應用記憶體中執行 13 種轉換邏輯（Merge/FieldMapping/Format/Conditional/NullHandler/TypeCast/Filter/Deduplicate/Lookup/String/Masking/Aggregate/DerivedColumn）
- **Load 節點**：以 UPSERT（主鍵衝突時 UPDATE，否則 INSERT）寫入目標表（`customer_core` 等）；自動填充 ETL 追蹤欄位（`data_source`、`_etl_loaded_at`、`_etl_pipeline_id`）
- **進度更新**：每個節點執行完成後更新 EtlPipelineLog.node_logs（JSONB）與 processed_count；前端以 5 秒 Polling 讀取進度
- **逾時機制**：Pipeline 執行最長 2 小時；超時由 Cleanup Cron 偵測並標記為 `failed`
- **孤立狀態修復**（AD-E05-2）：Cleanup Cron 每日執行時，將 `started_at < NOW() - 2 hours AND finished_at IS NULL` 的 EtlPipelineLog 標記為 `failed`，並同步更新對應 EtlPipeline.status

**Pipeline 版本管理設計**（AD-E05-3）：

版本狀態流轉（單向）：`draft` → `testing` → `published`

```
建立 Pipeline    → 同時建立 version=1, status=draft 的 EtlPipelineVersion
儲存 definition  → 更新當前 draft 版本的 definition（不建立新版本號）
測試執行成功     → 版本狀態 draft→testing
發布             → 版本狀態 testing→published；更新 EtlPipeline.version
回滾             → 複製舊版本內容，建立新的 draft 版本（版本號遞增）
```

**節點連線規則**（AD-E05-4）：

| 來源節點類型 | 可連接目標 | 禁止連接 |
|-------------|-----------|---------|
| Extract | Transform | Extract、Load、自身 |
| Transform | Transform、Load | Extract、自身（禁止循環） |
| Load | 無（終端節點） | Extract、Transform、Load |

**目標表 UPSERT 策略**（AD-E05-5）：Load 節點執行時以目標表的主鍵（Phase 1 MVP 僅 `customer_core.customer_id`）判斷 INSERT 或 UPDATE（PostgreSQL `ON CONFLICT DO UPDATE`）。目標表不透過 TypeORM Entity 管理，使用動態 SQL 執行寫入操作。Phase 2/3 新增目標表時，無需修改執行引擎，僅需在 Target Table Registry 中新增 schema 定義。

**Target Table Registry 設計**（AD-E05-6）：

目標表的 schema 定義採用「靜態程式碼內嵌（hardcoded in-process registry）」方式管理，而非資料庫表或外部設定檔。

| 設計元素 | 說明 |
|---------|------|
| 實作位置 | `target-table.service.ts` 內以 TypeScript 物件陣列定義 |
| 擴展機制 | 新增 Phase 2/3 目標表時，在 Registry 陣列中新增一個物件即可；符合開放封閉原則（Open/Closed Principle） |
| API 讀取 | `TargetTableService.listTables()` 與 `TargetTableService.getSchema(tableName)` 均從 in-process 陣列讀取，無 DB 查詢，回應速度極快 |
| 冪等性 | GET 端點完全冪等；schema 定義不隨執行狀態改變 |
| 欄位分類 | `customer_core` 的 45 個欄位依 A~H 八個語意分類組織（識別與分類、個人屬性、聯絡資訊、地址、職業與就業、財務與風控、企業客戶專屬、稽核與 ETL 追蹤） |
| ETL 追蹤欄位標記 | `isEtlTracking: true` 欄位（`data_source`、`_etl_loaded_at`、`_etl_pipeline_id`）在欄位對應介面以灰色標示，不可手動對應，由 Pipeline Execution Service 自動填充 |

**選擇靜態 Registry 而非資料庫表的理由**：目標表 schema 在 MVP 階段為靜態定義（BR-4），不支援 Admin 自訂；程式碼版本控制即為 schema 的唯一真實來源（single source of truth）；避免引入 `target_table_definitions` 管理表與對應 CRUD API 的額外複雜度。Phase 2/3 擴展時，透過程式碼變更（Git PR）新增 schema 定義，可享有程式碼審查與測試保護。

**來源資料表至目標表的資料流（F036 / US-049）**：

`customer_core` 整合兩個來源系統的資料，ETL 轉換規則在 Transform 節點中執行，Load 節點負責最終寫入。

```mermaid
graph TD
    subgraph 來源系統["來源系統（外部）"]
        ZZIP["ZZIP_BAMCUST_M<br/>核心系統客戶主檔<br/>（個人/企業/外籍）"]
        MLMC["MLMCUSTOMER<br/>行銷/租賃系統客戶主檔<br/>（個人/企業）"]
    end

    subgraph ExtractionLayer["擷取層（E04）"]
        RawZZIP["raw_{zzip_task_id}<br/>（AppDB 動態表）"]
        RawMLMC["raw_{mlmc_task_id}<br/>（AppDB 動態表）"]
    end

    subgraph ETLLayer["ETL Pipeline 層（E05）"]
        ExtractNode1["Extract 節點<br/>讀取 raw_{zzip_task_id}"]
        ExtractNode2["Extract 節點<br/>讀取 raw_{mlmc_task_id}"]

        subgraph TransformNodes["Transform 節點群"]
            MergeNode["Merge 節點<br/>以 身分證/統編 為鍵合併兩來源<br/>衝突以 source_updated_at 較新者為準"]
            PhoneNode["FieldMapping / NullHandler<br/>電話欄位合併：{區碼}-{號碼}<br/>佔位值 → NULL"]
            CodeNode["Lookup 節點<br/>_code 欄位 → _desc 欄位<br/>（依賴 US-030 代碼對照表）"]
            TypeCastNode["TypeCast 節點<br/>varchar → DECIMAL<br/>（capital、established_capital）<br/>CUTYPE 1→01, 2→02"]
        end

        LoadNode["Load 節點<br/>寫入 customer_core<br/>UPSERT on customer_id<br/>自動填充 ETL 追蹤欄位"]
    end

    subgraph TargetLayer["目標層（AppDB）"]
        CustomerCore["customer_core<br/>（約 45 欄位，A~H 八分類）<br/>Phase 1 MVP 目標表"]
    end

    subgraph Registry["Target Table Registry（in-process）"]
        TargetSvc["TargetTableService<br/>listTables() / getSchema(tableName)<br/>靜態 TypeScript 定義"]
    end

    ZZIP -->|"E04 擷取任務"| RawZZIP
    MLMC -->|"E04 擷取任務"| RawMLMC
    RawZZIP --> ExtractNode1
    RawMLMC --> ExtractNode2
    ExtractNode1 --> MergeNode
    ExtractNode2 --> MergeNode
    MergeNode --> PhoneNode
    PhoneNode --> CodeNode
    CodeNode --> TypeCastNode
    TypeCastNode --> LoadNode
    LoadNode -->|"ON CONFLICT DO UPDATE"| CustomerCore
    TargetSvc -->|"提供欄位 schema<br/>供 Load 節點選擇器使用"| LoadNode

    classDef source fill:#fff3e0,stroke:#e65100
    classDef raw fill:#fce4ec,stroke:#c62828
    classDef etl fill:#e8f5e9,stroke:#2e7d32
    classDef target fill:#e3f2fd,stroke:#1565c0
    classDef registry fill:#f3e8ff,stroke:#7b1fa2
    class ZZIP,MLMC source
    class RawZZIP,RawMLMC raw
    class ExtractNode1,ExtractNode2,MergeNode,PhoneNode,CodeNode,TypeCastNode,LoadNode etl
    class CustomerCore target
    class TargetSvc registry
```

**Phase 2/3 擴展路徑**：

| Phase | 新增目標表 | 前提條件 | 擴展方式 |
|-------|---------|---------|---------|
| Phase 2 | `customer_financial` | 合約明細系統接入 | Target Table Registry 新增 schema 定義 + DB Migration 建表 |
| Phase 2 | `customer_interaction` | CRM / 行銷自動化接入 | 同上 |
| Phase 3 | `customer_service` | 客服工單系統接入 | 同上 |

擴展時執行引擎（Pipeline Execution Service）的 UPSERT 邏輯無需修改，僅需：①在 `target-table.service.ts` Registry 中新增 schema 物件、②執行 DB Migration 建立目標表、③新增對應的擷取任務（E04）。

**架構挑戰**：多實例部署時，Scheduler 可能同時執行導致重複健康檢查與重複擷取觸發。MVP 單機部署不受影響；若未來水平擴展，需引入分散式鎖定機制（見第 8 節）。

#### Orphan Recovery 模組（F038 新增）

**架構決策 AD-F038-1：獨立 Module 設計**

| 服務 | 職責 | 執行時機 | 相關 Feature |
|------|------|---------|-------------|
| OrphanRecovery Service | 在應用程式啟動時一次性回收孤兒任務；批次更新 `ExtractionTask`（E04）與 `EtlPipeline`（E05）的 `status=running` 記錄為 `failed`；同步更新對應的 Log 記錄 | `OnApplicationBootstrap`（HTTP Server 開始接受請求前執行） | F038 |

**為何建立獨立 Module 而非放入 Extraction 或 ETL Module**

- **職責分離**：回收邏輯是啟動時的系統行為，與 `ExtractionTaskModule`（業務 CRUD + 執行）和 `EtlModule`（Pipeline 管理）的業務職責無關。
- **跨模組依賴**：`OrphanRecoveryModule` 需同時注入 E04（`ExtractionTask`、`ExtractionLog`）與 E05（`EtlPipeline`、`EtlPipelineLog`）四個 Repository；若放入任一現有模組，另一方需被 import，產生不必要的模組耦合。
- **可測試性**：獨立 Module 可單獨進行整合測試，不需載入完整業務模組。
- **未來擴展性**：若需加入其他啟動時修復邏輯（如資料一致性檢查），可集中於此 Module。

**為何選擇 `OnApplicationBootstrap` 而非 `OnModuleInit`**

`OnApplicationBootstrap` 在**所有模組 DI 完成後**、HTTP Server 開始接受請求前觸發，確保 TypeORM Repository 均已就緒，且 HTTP 請求在回收完成前不被處理。`OnModuleInit` 在單一模組初始化完成後立即觸發，此時其他模組的 Repository 可能尚未就緒，不適用。

**Transaction 設計（AD-F038-2）**

E04（擷取任務）與 E05（ETL Pipeline）的回收在各自獨立的 Transaction 中執行：
- Transaction 1（E04）：批次更新 `extraction_tasks` + 批次更新對應 `extraction_logs`
- Transaction 2（E05）：批次更新 `etl_pipelines` + 批次更新對應 `etl_pipeline_logs`
- E04 Transaction 失敗不影響 E05 Transaction 的執行
- 兩組失敗均僅記錄 `Logger.error()`，不拋出例外，不中止應用程式啟動

**AppModule import 順序**

`OrphanRecoveryModule` 須在 `ExtractionTaskModule` 與 `EtlModule` 之後、`SchedulerModule` 之前 import，確保孤兒回收在排程引擎首次掃描前完成。

---

#### 共用基礎建設（Shared Infrastructure）

| 工具 | 職責 | 安全性注意事項 |
|------|------|--------------|
| Crypto Util | AES-256-GCM 加密/解密資料庫連線密碼 | 金鑰從環境變數讀取（OQ-4 決議），禁止硬編碼 |
| Hash Util | bcrypt 密碼雜湊（cost factor >= 10）與比對 | 明文密碼不得出現在日誌 |
| JWT Util | 發行/驗證 JWT；支援多 Secret 並行驗證（OQ-11 決議） | 支援無停機 Secret 輪替 |
| Email Util | 封裝 SMTP / SendGrid 呼叫；Email 寄送為非同步操作（不阻塞 API 回應） | Email 內容不含密碼 |
| Logger | 結構化日誌輸出；自動遮罩敏感欄位（password、token、encrypted_password） | Stack trace 禁止出現在 API 回應 |

---

## 4. 資料架構

### 4.1 核心資料實體（ER 圖）

```mermaid
erDiagram
    User {
        uuid id PK
        string name
        string email "唯一，小寫儲存"
        string password_hash "bcrypt, cost>=10"
        enum role "admin|user"
        enum status "active|disabled"
        timestamp created_at
        timestamp updated_at
    }

    TokenBlocklist {
        string token PK "完整 Token 或 JTI"
        uuid user_id FK
        timestamp revoked_at
        timestamp expires_at "用於定期清理"
    }

    PasswordResetToken {
        uuid id PK
        uuid user_id FK
        string token "UUID v4，唯一"
        timestamp expires_at "建立後 24 小時"
        timestamp used_at "NULL = 未使用"
        timestamp created_at
    }

    Datasource {
        uuid id PK
        string name "唯一（排除軟刪除）"
        enum type "mysql|postgresql|sqlserver"
        string host
        integer port "1-65535"
        string database_name
        string username
        string encrypted_password "AES-256-GCM"
        string description
        enum status "connected|disconnected|unknown"
        timestamp last_tested_at
        uuid created_by FK
        timestamp deleted_at "NULL = 未刪除（軟刪除）"
        timestamp created_at
        timestamp updated_at
    }

    DatasourceHealthLog {
        uuid id PK
        uuid datasource_id FK
        boolean success
        integer response_time_ms "成功時記錄"
        string error_message "失敗時記錄"
        timestamp checked_at
    }

    ExtractionTask {
        uuid id PK
        string name "唯一（排除軟刪除，max 255）"
        uuid datasource_id FK
        enum mode "full|incremental"
        enum status "running|scheduled|completed|failed|disabled"
        string source_schema "來源 Schema 名稱，max 255，nullable"
        string source_table "來源資料表名稱，max 255"
        string incremental_column "增量模式必填"
        string incremental_column_type "timestamp|integer|string，預設 timestamp"
        string last_incremental_value "max 255，string 儲存"
        string schedule "Cron 表達式（UTC），max 100"
        integer batch_size "100-10000，預設 1000"
        timestamp last_execution_at
        integer extracted_count "最近一次擷取筆數"
        integer total_count "來源總筆數"
        decimal progress_percent "0-100"
        integer avg_duration_ms "平均執行時間"
        integer execution_count "總執行次數"
        string error_message "最後錯誤訊息"
        boolean enabled "預設 true"
        uuid created_by FK
        timestamp deleted_at "NULL = 未刪除（軟刪除）"
        timestamp created_at
        timestamp updated_at
    }

    ExtractionLog {
        uuid id PK
        uuid task_id FK
        enum status "running|completed|failed"
        timestamp started_at "UTC"
        timestamp finished_at "UTC，nullable"
        integer duration_ms "finish - start"
        integer extracted_count
        integer total_count
        string error_message "失敗時記錄"
        enum triggered_by "schedule|manual|retry"
        uuid created_by FK
    }

    EtlPipeline {
        uuid id PK
        string name "唯一（排除軟刪除，max 255）"
        string description "TEXT，選填"
        integer version "當前版本號，預設 1"
        integer step_count "節點數量，預設 0"
        enum status "draft|active|running|failed|disabled"
        string schedule "Cron（UTC），max 100，選填"
        timestamp last_execution_at "nullable"
        timestamp next_execution_at "nullable"
        integer processed_count "累計處理筆數，預設 0"
        integer avg_duration_ms "平均執行時間，預設 0"
        integer execution_count "累計執行次數，預設 0"
        boolean enabled "預設 false"
        uuid created_by FK
        timestamp deleted_at "NULL=未刪除（軟刪除）"
        timestamp created_at
        timestamp updated_at
    }

    EtlPipelineVersion {
        uuid id PK
        uuid pipeline_id FK
        integer version "同 Pipeline 下遞增"
        jsonb definition "nodes + edges JSONB 結構"
        enum status "draft|testing|published"
        string change_summary "max 500，選填"
        uuid created_by FK
        timestamp created_at
    }

    EtlPipelineLog {
        uuid id PK
        uuid pipeline_id FK
        integer version "執行時使用的版本號"
        enum status "running|completed|failed"
        timestamp started_at "UTC"
        timestamp finished_at "UTC，nullable"
        integer duration_ms "nullable"
        integer processed_count "預設 0"
        string error_message "TEXT，nullable"
        jsonb node_logs "各節點執行記錄 JSONB，nullable"
        enum triggered_by "schedule|manual|test|retry"
        boolean is_test_run "預設 false"
        uuid created_by FK
    }

    User ||--o{ TokenBlocklist : "has revoked tokens"
    User ||--o{ PasswordResetToken : "has reset tokens"
    User ||--o{ Datasource : "creates (created_by)"
    User ||--o{ ExtractionTask : "creates (created_by)"
    User ||--o{ EtlPipeline : "creates (created_by)"
    Datasource ||--o{ DatasourceHealthLog : "has health logs"
    Datasource ||--o{ ExtractionTask : "referenced by"
    ExtractionTask ||--o{ ExtractionLog : "has execution logs"
    EtlPipeline ||--o{ EtlPipelineVersion : "has versions"
    EtlPipeline ||--o{ EtlPipelineLog : "has execution logs"
```

### 4.2 資料所有權

| 實體 | 擁有模組 | 其他模組存取方式 |
|------|---------|----------------|
| User | Account 模組 | Auth 模組讀取（驗證登入）；透過服務介面呼叫，不直接存取 Repository |
| TokenBlocklist | Auth 模組 | Middleware 查詢（驗證請求）；Account 模組透過 Auth Service 寫入（停用帳號） |
| PasswordResetToken | Auth 模組 | 不對其他模組開放 |
| Datasource | Datasource 模組 | Dashboard Service 讀取（彙整統計）；Extraction 模組透過 Datasource Service 介面查詢（驗證參照完整性） |
| DatasourceHealthLog | Datasource 模組 | Dashboard Service 讀取（趨勢圖、告警計算） |
| ExtractionTask | Extraction 模組 | Scheduler 模組透過 ExtractionExecution Service 介面呼叫；ETL Pipeline 模組透過 Extraction 模組介面查詢可用 raw data 表（Extract 節點來源選擇，F029 AC-6） |
| ExtractionLog | Extraction 模組 | 不對其他模組開放 |
| EtlPipeline | ETL Pipeline 模組 | Scheduler 模組透過 Pipeline Execution Service 介面呼叫 |
| EtlPipelineVersion | ETL Pipeline 模組 | 不對其他模組開放；Pipeline Execution Service 讀取最新 published 版本的 definition |
| EtlPipelineLog | ETL Pipeline 模組 | 不對其他模組開放 |
| 目標表（`customer_core` 等） | ETL Pipeline 模組（寫入）| 以動態 SQL 操作，不透過 TypeORM Entity；Phase 1 MVP 僅含 `customer_core`；Phase 2/3 擴展時新增目標表至 Registry；未來可供 BI 工具或下游系統讀取 |

### 4.3 資料一致性模型

| 操作 | 一致性需求 | 實作方式 |
|------|----------|---------|
| 登入驗證 | 強一致性 | 同步讀取 User 與 TokenBlocklist |
| 帳號停用 + Token 失效 | 強一致性 | 單一 DB 交易：更新 User.status + 批次寫入 TokenBlocklist |
| 密碼重設 + Token 失效 | 強一致性 | 單一 DB 交易：更新 password_hash + 撤銷所有現有 Token |
| 連線測試結果更新 | 強一致性 | 同步更新 Datasource.status + 寫入 DatasourceHealthLog |
| Email 寄送（密碼重設） | 最終一致性 | 非同步操作；API 在 Email 寄出前即回應成功訊息 |
| 健康檢查歷史清理 | 最終一致性 | 背景 Cron Job，不影響前台操作 |
| 觸發擷取執行（建立 Log + 更新 Task status） | 強一致性 | 同一 DB 交易：INSERT ExtractionLog + UPDATE ExtractionTask.status = 'running' |
| 擷取進度更新（extracted_count） | 最終一致性 | 非交易性批次更新（每 batch_size 筆一次）；Polling 容忍短暫延遲 |
| 擷取完成（更新 Log + Task） | 強一致性 | 同一 DB 交易：UPDATE ExtractionLog（finished_at, duration_ms）+ UPDATE ExtractionTask（status, last_execution_at, avg_duration_ms, execution_count）；增量模式同時更新 `last_incremental_value` |
| 排程掃描執行 | 最終一致性 | 掃描失敗記錄日誌，下次掃描重試 |
| ExtractionLog 清理 | 最終一致性 | 背景 Cron Job，不影響前台操作 |
| 觸發 Pipeline 執行（建立 Log + 更新狀態） | 強一致性 | 同一 DB 交易：INSERT EtlPipelineLog + UPDATE EtlPipeline.status = 'running' |
| Pipeline 進度更新（node_logs、processed_count） | 最終一致性 | 每個節點完成後以非交易性更新；前端 5 秒 Polling 容忍短暫延遲 |
| Pipeline 執行完成（更新 Log + Pipeline） | 強一致性 | 同一 DB 交易：UPDATE EtlPipelineLog（finished_at, duration_ms）+ UPDATE EtlPipeline（status, last_execution_at, processed_count, avg_duration_ms, execution_count）；測試執行同時更新 EtlPipelineVersion.status = 'testing' |
| Pipeline 版本發布 | 強一致性 | 同一 DB 交易：UPDATE EtlPipelineVersion.status = 'published' + UPDATE EtlPipeline.version |
| EtlPipelineLog 清理 | 最終一致性 | 背景 Cron Job，不影響前台操作 |

### 4.4 資料庫索引建議

| 表格 | 欄位 | 索引類型 | 理由 |
|------|------|---------|------|
| User | email | UNIQUE INDEX | 登入查詢；Email 唯一性檢查 |
| User | role, status | 複合 INDEX | 帳號清單篩選（F005） |
| TokenBlocklist | token | UNIQUE INDEX | Middleware 頻繁查詢 |
| TokenBlocklist | expires_at | INDEX | 定期清理查詢 |
| TokenBlocklist | user_id | INDEX | 帳號停用批次撤銷 |
| PasswordResetToken | token | UNIQUE INDEX | 重設流程查詢 |
| PasswordResetToken | expires_at | INDEX | 定期清理 |
| Datasource | name, database_name, deleted_at | 複合 INDEX | 名稱＋資料庫名稱複合唯一性檢查（排除軟刪除） |
| Datasource | deleted_at | INDEX | 所有清單查詢的過濾條件 |
| DatasourceHealthLog | datasource_id, checked_at | 複合 INDEX | 趨勢圖查詢、告警計算（NFR-002.4） |
| DatasourceHealthLog | checked_at | INDEX | 清理超過 90 天紀錄 |
| ExtractionTask | name, deleted_at | 複合 INDEX | 名稱唯一性檢查（排除軟刪除） |
| ExtractionTask | status, deleted_at | 複合 INDEX | 排程掃描查詢（每分鐘執行） |
| ExtractionTask | datasource_id | INDEX | 外鍵查詢；資料來源刪除影響檢查 |
| ExtractionTask | deleted_at | INDEX | 清單查詢過濾條件 |
| ExtractionLog | task_id, started_at | 複合 INDEX | 日誌查詢（倒序分頁）、趨勢圖聚合 |
| ExtractionLog | started_at | INDEX | 今日統計計算、清理查詢 |
| ExtractionLog | status, started_at | 複合 INDEX | 今日成功/失敗計數（F018 summary, F024 dashboard） |
| raw_{task_id_short} | _cdmp_id（若存在） | PRIMARY KEY INDEX | Raw data 預覽分頁與排序（F026），動態建表時自動建立 |
| etl_pipeline | name, deleted_at | 複合 INDEX | 名稱唯一性檢查（排除軟刪除） |
| etl_pipeline | status, deleted_at | 複合 INDEX | 排程掃描查詢（每分鐘執行，掃描 active + enabled + not running） |
| etl_pipeline | deleted_at | INDEX | 清單查詢過濾條件 |
| etl_pipeline | enabled, deleted_at | 複合 INDEX | 排程掃描輔助條件 |
| etl_pipeline_version | pipeline_id, version | 複合 INDEX | 版本清單查詢（倒序）；查詢最新 published 版本 |
| etl_pipeline_version | pipeline_id, status | 複合 INDEX | 查詢最新 published 版本（排程執行）；啟用前驗證是否有 published 版本 |
| etl_pipeline_log | pipeline_id, started_at | 複合 INDEX | 日誌查詢（倒序分頁）；趨勢圖聚合 |
| etl_pipeline_log | started_at | INDEX | 今日統計計算；清理查詢（30 天保留） |
| etl_pipeline_log | status, started_at | 複合 INDEX | 今日成功/失敗計數（F035 dashboard） |
| etl_pipeline_log | is_test_run, pipeline_id | 複合 INDEX | 版本發布前查詢是否有成功測試執行記錄 |
| customer_core | customer_id | PRIMARY KEY | UPSERT 主鍵衝突判斷（`ON CONFLICT(customer_id) DO UPDATE`） |
| customer_core | source_customer_no | UNIQUE INDEX | 身分證/統編唯一性保護；同一客戶來自不同來源時的 Merge 查詢 |
| customer_core | _etl_pipeline_id | INDEX | 追溯特定 Pipeline 執行載入的客戶筆數；Load 後稽核查詢 |

### 4.5 資料生命週期

| 資料 | 保留策略 | 清理機制 |
|------|---------|---------|
| DatasourceHealthLog | 90 天（OQ-10 決議） | Cleanup Cron Job 每日執行 |
| PasswordResetToken | 永久保留記錄（已使用/過期不刪除，僅標記狀態），或由 Cron 清理過期未使用的 Token | Cleanup Cron Job |
| TokenBlocklist | 保留至 `expires_at` 之後，Cron 定期清理 | Cleanup Cron Job |
| Datasource（軟刪除） | 永久保留（`deleted_at` 非 NULL），不自動清理 | 手動 DBA 操作（如需復原） |
| ExtractionLog | 30 天（AQ-10 決議） | Cleanup Cron Job 每日執行，刪除 `started_at < NOW() - 30 days` 的記錄 |
| ExtractionTask（軟刪除） | 永久保留（`deleted_at` 非 NULL），不自動清理 | 手動 DBA 操作（如需復原） |
| EtlPipelineLog | 30 天（AQ-14 決議）| Cleanup Cron Job 每日執行，刪除 `started_at < NOW() - 30 days` 的記錄 |
| EtlPipeline（軟刪除） | 永久保留（`deleted_at` 非 NULL），不自動清理 | 手動 DBA 操作（如需復原） |
| EtlPipelineVersion | 永久保留（隨 Pipeline 保留，不自動清理） | 版本紀錄為審計軌跡，不可自動清除 |
| 目標表資料（`customer_core` 等） | 永久保留（UPSERT 寫入，同一 `customer_id` 會被覆蓋更新），不自動清理 | 由 DBA 或下游系統管理；ETL 追蹤欄位（`_etl_loaded_at`、`_etl_pipeline_id`）記錄最近一次 Load 的時間與 Pipeline |

---

## 5. 整合與通訊

### 5.1 通訊模式總覽

| 整合點 | 方向 | 同步/非同步 | 協定 |
|--------|------|-----------|------|
| 瀏覽器 ↔ 後端 | 雙向 | 同步（Request/Response） | HTTPS REST API |
| 後端 → 應用資料庫 | 單向 | 同步 | ORM / SQL over TCP |
| 後端 → Token Blocklist | 雙向 | 同步 | 依實作（DB 或 Redis） |
| 後端 → Email 服務 | 單向 | 非同步（fire-and-forget） | SMTP / HTTPS |
| 後端 → 目標資料庫（連線測試） | 單向 | 同步（含 10 秒逾時） | TCP `SELECT 1` |
| 後端 → 目標資料庫（資料擷取） | 單向 | 非同步（背景執行，2 小時逾時） | TCP 批次 SQL Query |
| 後端 → AppDB raw data 表（ETL Extract） | 單向 | 非同步（Pipeline 執行中讀取） | Raw SQL（`SELECT`，Dynamic table name） |
| 後端 → AppDB target 表（ETL Load） | 單向 | 非同步（Pipeline 執行中寫入） | Raw SQL（`INSERT ON CONFLICT DO UPDATE`） |
| Scheduler → 後端邏輯 | 內部呼叫 | 同步 | 模組內部方法呼叫 |

### 5.2 驗證流程（Auth Flow）

```mermaid
sequenceDiagram
    participant Browser as 瀏覽器 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫
    participant Blocklist as Token Blocklist

    Browser->>API: POST /api/v1/auth/login<br/>{email, password, rememberMe}
    API->>API: Rate Limit 檢查（5次/分/IP）
    API->>DB: 查詢 User (email)
    DB-->>API: User 記錄（含 password_hash）
    API->>API: bcrypt.compare(password, password_hash)
    alt 憑證正確
        API->>API: 檢查 User.status
        alt 帳號啟用
            API->>API: 發行 Access Token + Refresh Token<br/>（依 rememberMe 決定有效期）
            API-->>Browser: 200 {token, user}
        else 帳號停用
            API-->>Browser: 403 AUTH_ACCOUNT_DISABLED
        end
    else 憑證錯誤
        API-->>Browser: 401 AUTH_INVALID_CREDENTIALS
    end

    Note over Browser,API: 後續 API 請求附加 Bearer Token

    Browser->>API: ANY /api/v1/*<br/>Authorization: Bearer {token}
    API->>Blocklist: 查詢 Token 是否在 Blocklist 中
    Blocklist-->>API: 查詢結果
    alt Token 有效且不在 Blocklist
        API->>API: 驗證 JWT 簽章與有效期
        API->>API: RBAC 角色檢查
        API-->>Browser: 200 / 業務回應
    else Token 無效或已撤銷
        API-->>Browser: 401 AUTH_TOKEN_REVOKED / AUTH_TOKEN_EXPIRED
    end
```

### 5.3 密碼重設流程

```mermaid
sequenceDiagram
    participant Browser as 瀏覽器
    participant API as 後端 API
    participant DB as 應用資料庫
    participant Email as Email 服務
    participant Blocklist as Token Blocklist

    Browser->>API: POST /api/v1/auth/forgot-password<br/>{email}
    API->>DB: 查詢 User (email)
    alt Email 已註冊
        API->>DB: 建立 PasswordResetToken<br/>(expires_at = now + 24h)
        API-->>Browser: 200 "若此 Email 存在，重設連結已寄出"
        API-)Email: 非同步寄送重設連結 Email
    else Email 未註冊
        API-->>Browser: 200 "若此 Email 存在，重設連結已寄出"
        Note over API: 不寄出 Email，但回應一致（防列舉攻擊）
    end

    Browser->>API: POST /api/v1/auth/reset-password<br/>{token, newPassword}
    API->>DB: 查詢 PasswordResetToken (token)
    alt Token 有效且未使用且未過期
        API->>API: bcrypt.hash(newPassword, 10)
        API->>DB: 交易：更新 User.password_hash<br/>更新 PasswordResetToken.used_at
        API->>Blocklist: 批次撤銷該 User 所有有效 Token
        API-->>Browser: 200 "密碼已成功重設，請重新登入"
    else Token 無效/過期/已使用
        API-->>Browser: 422 AUTH_RESET_TOKEN_EXPIRED / AUTH_RESET_TOKEN_USED
    end
```

### 5.4 連線測試流程（F015）

```mermaid
sequenceDiagram
    participant Browser as 瀏覽器
    participant API as 後端 API
    participant DB as 應用資料庫
    participant TargetDB as 目標資料庫

    Browser->>API: POST /api/v1/datasources/:id/test<br/>Authorization: Bearer {token}
    API->>API: JWT 驗證 + RBAC (role=admin)
    API->>DB: 查詢 Datasource (id, deleted_at IS NULL)
    alt 資料來源存在
        API->>API: AES-256 解密 encrypted_password
        API->>TargetDB: TCP 連線 + SELECT 1<br/>（逾時上限：10 秒）
        alt 連線成功
            TargetDB-->>API: 回應結果
            API->>DB: 更新 status=connected, last_tested_at=now<br/>寫入 DatasourceHealthLog (success=true)
            API->>API: 清除記憶體中的明文密碼
            API-->>Browser: 200 {success: true, responseTime: 120}
        else 連線失敗 / 逾時
            API->>DB: 更新 status=disconnected, last_tested_at=now<br/>寫入 DatasourceHealthLog (success=false, error_message)
            API->>API: 清除記憶體中的明文密碼
            API-->>Browser: 200 {success: false, message: "..."}
        end
    else 資料來源不存在或已刪除
        API-->>Browser: 404 DS_NOT_FOUND
    end
```

### 5.5 擷取任務執行流程（F021 / F023）

```mermaid
sequenceDiagram
    participant Browser as 瀏覽器
    participant API as 後端 API
    participant DB as 應用資料庫
    participant TargetDB as 目標資料庫
    participant Scheduler as Scheduler

    Note over Browser,API: 路徑 A：手動觸發（F021）
    Browser->>API: POST /api/v1/extraction-tasks/:id/run<br/>{triggeredBy: "manual"}<br/>Authorization: Bearer {token}
    API->>API: JWT 驗證 + RBAC (role=admin)
    API->>DB: 查詢 ExtractionTask (id, deleted_at IS NULL)
    alt 任務存在且 status != running
        API->>DB: 交易：INSERT ExtractionLog (status=running, triggered_by=manual)<br/>UPDATE ExtractionTask (status=running)
        API-->>Browser: 202 Accepted {logId, status: "running"}
        Note over API,TargetDB: 以下為背景非同步執行
    else status = running
        API-->>Browser: 409 EXTRACTION_RUNNING
    end

    Note over Scheduler,API: 路徑 B：排程觸發（F023）
    Scheduler->>DB: 每分鐘掃描 enabled=true<br/>AND deleted_at IS NULL<br/>AND status != running
    Scheduler->>Scheduler: cron-parser 比對當前 UTC 時間
    alt Cron 條件符合
        Scheduler->>DB: 交易：INSERT ExtractionLog (triggered_by=schedule)<br/>UPDATE ExtractionTask (status=running)
    end

    Note over API,TargetDB: 共用執行邏輯（ExtractionExecution Service）
    API->>DB: 讀取 Datasource 連線資訊<br/>AES-256 解密 encrypted_password
    API->>TargetDB: 連線至外部資料來源

    Note over API,DB: Step 1: 動態建表（首次執行）
    API->>DB: 檢查 AppDB 是否有 raw_{task_id_short} 表
    alt raw data 表不存在
        API->>TargetDB: 讀取 source_schema.source_table 欄位 metadata<br/>(INFORMATION_SCHEMA)
        TargetDB-->>API: 欄位名稱與資料型別
        API->>DB: CREATE TABLE raw_{task_id_short}<br/>(來源欄位 + _cdmp_id + _cdmp_extracted_at)
    end

    Note over API,TargetDB: Step 2: 全量模式先 TRUNCATE
    alt 全量模式 (mode=full)
        API->>DB: TRUNCATE TABLE raw_{task_id_short}
    end

    Note over API,TargetDB: Step 3: 批次讀取與寫入
    API->>TargetDB: 查詢 total_count<br/>(SELECT COUNT FROM "source_schema"."source_table"<br/>增量：WHERE col > last_value)
    API->>DB: 更新 ExtractionTask.total_count

    loop 批次擷取（每 batch_size 筆）
        API->>TargetDB: SELECT * FROM "source_schema"."source_table"<br/>LIMIT batch_size OFFSET n<br/>（增量模式：WHERE col > last_value）
        TargetDB-->>API: 批次資料
        API->>DB: INSERT INTO raw_{task_id_short}<br/>(批次 1000 筆)
        API->>DB: 更新 extracted_count, progress_percent
    end

    alt 執行成功
        API->>DB: 交易：UPDATE ExtractionLog (status=completed, finished_at, duration_ms)<br/>UPDATE ExtractionTask (status=completed/scheduled,<br/>last_execution_at, avg_duration_ms, execution_count)<br/>增量模式：更新 last_incremental_value
    else 執行失敗
        API->>DB: UPDATE ExtractionLog (status=failed, error_message)<br/>UPDATE ExtractionTask (status=failed, error_message)
    end

    Note over Browser,API: 前端 Polling（3 秒間隔）
    Browser->>API: GET /api/v1/extraction-tasks/:id
    API-->>Browser: 200 {status, progress_percent, extracted_count, total_count}
```

### 5.6 Pipeline 執行流程（F030 / F033）

```mermaid
sequenceDiagram
    participant Browser as 瀏覽器 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫

    Note over Browser,API: 路徑 A：手動執行（active Pipeline）
    Browser->>API: POST /api/v1/etl/pipelines/:id/execute<br/>Authorization: Bearer {token}
    API->>API: JWT 驗證 + RBAC (role=admin)
    API->>DB: 查詢 EtlPipeline (id, deleted_at IS NULL)
    alt Pipeline status = running
        API-->>Browser: 409 PIPELINE_RUNNING
    else Pipeline definition 無節點
        API-->>Browser: 422 PIPELINE_NO_DEFINITION
    else 可執行
        API->>DB: 查詢最新 published EtlPipelineVersion
        API->>DB: 交易：INSERT EtlPipelineLog (status=running, triggered_by=manual)<br/>UPDATE EtlPipeline (status=running)
        API-->>Browser: 202 Accepted {logId}
        Note over API,DB: 以下為背景非同步執行
    end

    Note over Browser,API: 路徑 B：測試執行（draft Pipeline）
    Browser->>API: POST /api/v1/etl/pipelines/:id/test
    API->>DB: 交易：INSERT EtlPipelineLog (is_test_run=true, triggered_by=test)<br/>UPDATE EtlPipeline (status=running)
    API-->>Browser: 202 Accepted {logId}

    Note over API,DB: 共用執行邏輯（Pipeline Execution Service）
    loop 依 DAG 拓撲排序循序執行各節點
        alt Extract 節點
            API->>DB: SELECT * FROM raw_{task_id_short}<br/>（Raw SQL，讀取擷取任務的 raw data 表）
        else Transform 節點（13 種）
            API->>API: 在記憶體中執行轉換邏輯<br/>（Merge / FieldMapping / Format 等）
        else Load 節點
            API->>DB: INSERT INTO customer_* ... ON CONFLICT DO UPDATE<br/>自動填充：data_source, _etl_loaded_at, _etl_pipeline_id
        end
        API->>DB: 更新 EtlPipelineLog.node_logs（JSONB）<br/>更新 EtlPipelineLog.processed_count
    end

    alt 執行成功
        API->>DB: 交易：UPDATE EtlPipelineLog (status=completed, finished_at, duration_ms)<br/>UPDATE EtlPipeline (status=active/draft, last_execution_at, processed_count, avg_duration_ms)<br/>若為測試執行：UPDATE EtlPipelineVersion (status=testing)
    else 執行失敗
        API->>DB: UPDATE EtlPipelineLog (status=failed, error_message)<br/>UPDATE EtlPipeline (status=failed, error_message)
    end

    Note over Browser,API: 前端 Polling（5 秒間隔）
    Browser->>API: GET /api/v1/etl/pipelines/:id/progress
    API-->>Browser: 200 {status, processedCount, progressPercent, currentNode}
```

### 5.7 應用程式啟動生命週期（F038 新增）

F038 `OrphanRecoveryModule` 透過 NestJS `OnApplicationBootstrap` 生命週期鉤子在啟動時執行孤兒回收，並在 HTTP Server 開始接受請求前完成。

```mermaid
sequenceDiagram
    participant NestJS as NestJS Runtime
    participant ORM as TypeORM DataSource
    participant ORS as OrphanRecoveryService
    participant Sched as SchedulerModule
    participant HTTP as HTTP Server

    NestJS->>ORM: 初始化 DataSource（連線 PostgreSQL）
    NestJS->>NestJS: 所有 Module DI 完成
    Note over NestJS: 依 AppModule import 順序依序觸發<br/>OnApplicationBootstrap
    NestJS->>ORS: onApplicationBootstrap()
    ORS->>ORS: recoverExtractionTasks()（Transaction 1 — E04）
    ORS->>ORS: recoverEtlPipelines()（Transaction 2 — E05）
    ORS->>NestJS: 回收完成（不論成功/失敗皆返回）
    NestJS->>Sched: SchedulerModule OnApplicationBootstrap<br/>（排程引擎啟動）
    NestJS->>HTTP: 開始監聽 HTTP 請求
```

**關鍵設計約束**：
- `OrphanRecoveryModule` 必須在 `SchedulerModule` **之前** import，確保排程引擎首次掃描時，孤兒狀態已被修復，不會發生「孤兒任務因 `status=running` 被排程器跳過」的問題。
- `OnApplicationBootstrap` 為同步阻塞執行，回收未完成前 HTTP Server 不會啟動；若回收耗時過長（NFR-002.12 要求 < 5 秒），應記錄警告。

### 5.8 錯誤處理與韌性

| 整合點 | 失敗場景 | 處理策略 |
|--------|---------|---------|
| 目標資料庫連線測試 | 逾時 / 拒絕連線 | 10 秒強制 timeout；回傳 success=false；更新狀態為 disconnected |
| Email 服務不可用 | SMTP 連線失敗 | 回傳 SYSTEM_EMAIL_SEND_FAILED（500）；非同步寄送失敗不影響 Token 生成 |
| 應用資料庫連線失敗 | DB 不可達 | 回傳 SYSTEM_INTERNAL_ERROR（500）；錯誤記錄至 Logger（不含敏感資訊） |
| Token Blocklist 查詢失敗 | Cache/DB 不可達 | **架構挑戰**：Fail-Open（允許請求通過）vs Fail-Closed（拒絕請求）。建議 Fail-Closed 以優先安全性。詳見第 8 節。 |
| 健康檢查 Cron 失敗 | 單次執行異常 | 記錄錯誤至日誌；下次排程正常繼續；不影響前台 API |
| 目標資料庫（資料擷取） | 執行中連線斷開 / 查詢失敗 | 捕捉例外；更新 ExtractionTask.status = 'failed' 與 error_message；更新 ExtractionLog；不自動重試（AD-E04-6），須 Admin 手動重試 |
| 目標資料庫（Schema/Table 列表查詢） | 逾時 / 拒絕連線 | 10 秒逾時；回傳 503 DATASOURCE_SCHEMA_LOAD_FAILED 或 DATASOURCE_TABLE_LOAD_FAILED；前端顯示錯誤，下拉停用；不使用快取 |
| 擷取排程掃描（每分鐘） | DB 查詢失敗 | 記錄 ERROR 日誌；跳過本次掃描；下次掃描正常繼續 |
| Pipeline 執行（節點執行失敗） | Transform 邏輯錯誤 / Load 寫入失敗 | 捕捉例外；更新失敗節點的 node_logs；更新 EtlPipelineLog.status = 'failed'；更新 EtlPipeline.status = 'failed'；不自動重試，須 Admin 手動重新執行 |
| Pipeline 排程掃描（每分鐘） | DB 查詢失敗 | 記錄 ERROR 日誌；跳過本次掃描；下次掃描正常繼續 |
| 版本發布驗證（無測試執行記錄） | 前置條件不滿足 | 回傳 422 PIPELINE_PUBLISH_REQUIRES_TEST；不執行發布操作 |

### 5.9 冪等性考量

| 端點 | 冪等性 | 說明 |
|------|-------|------|
| `POST /api/v1/auth/login` | 非冪等 | 每次呼叫產生新 Token |
| `POST /api/v1/auth/logout` | 冪等 | 重複呼叫結果相同（Token 已在 Blocklist） |
| `POST /api/v1/auth/forgot-password` | 冪等（行為一致） | 回應一致；多次呼叫產生多個 PasswordResetToken（舊的仍有效，但 24h 到期） |
| `POST /api/v1/datasources/:id/test` | 冪等（副作用重複） | 可重複呼叫；每次均產生新的 HealthLog 記錄 |
| `GET /api/v1/datasources/:id/schemas` | 冪等 | 唯讀查詢，即時查詢外部資料庫，不使用快取 |
| `GET /api/v1/datasources/:id/schemas/:schema/tables` | 冪等 | 唯讀查詢，即時查詢外部資料庫，不使用快取 |
| `DELETE /api/v1/datasources/:id` | 冪等 | 重複軟刪除結果相同 |
| `POST /api/v1/extraction-tasks/:id/run` | 非冪等 | 每次呼叫建立新的 ExtractionLog；`status=running` 時拒絕（409）避免重複觸發 |
| `PATCH /api/v1/extraction-tasks/:id/toggle` | 冪等 | 停用已停用的任務回傳成功，無額外副作用 |
| `DELETE /api/v1/extraction-tasks/:id` | 冪等 | 重複軟刪除結果相同 |
| `GET /api/v1/etl/pipelines` | 冪等 | 唯讀查詢 |
| `POST /api/v1/etl/pipelines` | 非冪等 | 每次呼叫建立新 Pipeline；名稱重複時回傳 409 |
| `POST /api/v1/etl/pipelines/:id/execute` | 非冪等 | 每次呼叫建立新的 EtlPipelineLog；`status=running` 時拒絕（409）|
| `POST /api/v1/etl/pipelines/:id/test` | 非冪等 | 每次呼叫建立新的測試 EtlPipelineLog；`status=running` 時拒絕（409）|
| `PATCH /api/v1/etl/pipelines/:id/toggle` | 冪等 | 停用已停用的 Pipeline 回傳成功，無額外副作用 |
| `DELETE /api/v1/etl/pipelines/:id` | 冪等 | 重複軟刪除結果相同 |
| `PUT /api/v1/etl/pipelines/:id/definition` | 冪等 | 相同 definition 重複儲存結果相同（覆寫） |
| `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish` | 冪等（重複發布相同版本結果相同） | 已 published 的版本重複發布無副作用 |
| `POST /api/v1/etl/pipelines/:id/versions/:versionId/rollback` | 非冪等 | 每次呼叫建立新版本 |
| `GET /api/v1/etl/target-tables` | 冪等 | 唯讀查詢，回傳靜態 Registry 資料，無 DB 查詢 |
| `GET /api/v1/etl/target-tables/:tableName/schema` | 冪等 | 唯讀查詢，回傳靜態 Registry 資料；不存在的 tableName 回傳 404 |

### 5.10 Target Table Registry API 流程（F036）

```mermaid
sequenceDiagram
    participant Browser as 瀏覽器 (Pipeline 編輯器)
    participant API as 後端 API
    participant Registry as TargetTableService<br/>（in-process Registry）

    Note over Browser,API: 開啟 Load 節點屬性面板時

    Browser->>API: GET /api/v1/etl/target-tables<br/>Authorization: Bearer {token}
    API->>API: JWT 驗證 + RBAC (role=admin)
    API->>Registry: listTables()
    Registry-->>API: [{tableName, displayName, domain,<br/>columnCount, description}]
    API-->>Browser: 200 {data: [{tableName: "customer_core",<br/>displayName: "Customer Core（客戶主檔）",<br/>domain: "core", columnCount: 45, ...}]}

    Note over Browser,API: Admin 選擇目標表後，載入欄位 schema

    Browser->>API: GET /api/v1/etl/target-tables/customer_core/schema<br/>Authorization: Bearer {token}
    API->>API: JWT 驗證 + RBAC (role=admin)
    API->>Registry: getSchema("customer_core")
    alt tableName 存在於 Registry
        Registry-->>API: {tableName, displayName, columns: [...45 欄位定義]}
        API-->>Browser: 200 {tableName, columns:<br/>[{name, type, nullable, isPrimaryKey,<br/>isEtlTracking, description}, ...]}
        Note over Browser: 前端渲染欄位對應介面<br/>isEtlTracking=true 欄位灰色標示，不可手動對應
    else tableName 不存在
        Registry-->>API: null
        API-->>Browser: 404 PIPELINE_TARGET_TABLE_NOT_FOUND
    end
```

**Load 節點執行時的 ETL 追蹤欄位自動填充**（AC-5）：

```mermaid
sequenceDiagram
    participant ExecSvc as Pipeline Execution Service
    participant Registry as TargetTableService
    participant DB as 應用資料庫 (AppDB)

    ExecSvc->>Registry: getSchema(targetTableName)
    Registry-->>ExecSvc: columns（含 isEtlTracking 欄位列表）

    ExecSvc->>ExecSvc: 分離使用者對應欄位 vs ETL 追蹤欄位
    Note over ExecSvc: ETL 追蹤欄位值：<br/>data_source = "cdmp-etl"<br/>_etl_loaded_at = NOW()<br/>_etl_pipeline_id = pipelineId（UUID）

    ExecSvc->>DB: INSERT INTO customer_core<br/>({使用者對應欄位} + {ETL 追蹤欄位})<br/>ON CONFLICT (customer_id) DO UPDATE<br/>SET {所有非 PK 欄位} = EXCLUDED.{欄位}
    DB-->>ExecSvc: 寫入成功（affected rows）
```

---

## 6. 非功能需求架構對應

### 6.1 安全性（NFR-001）

```mermaid
graph LR
    subgraph NFR["安全性 NFR"]
        N1["NFR-001.1<br/>Token 管理"]
        N2["NFR-001.2<br/>RBAC"]
        N3["NFR-001.3<br/>密碼安全"]
        N4["NFR-001.4<br/>憑證保護"]
        N5["NFR-001.5<br/>傳輸安全"]
    end

    subgraph ARCH["架構決策"]
        A1["JWT Access Token (短效)<br/>+ Refresh Token<br/>+ Token Blocklist"]
        A2["RBAC Middleware<br/>route-level 角色守衛<br/>403 + 日誌記錄"]
        A3["bcrypt Hash Util<br/>cost factor >= 10<br/>Logger 自動遮罩"]
        A4["AES-256-GCM Crypto Util<br/>金鑰來自環境變數<br/>API 回應遮罩"]
        A5["TLS 1.2+ 強制<br/>HTTP→HTTPS 重導<br/>HSTS 標頭"]
    end

    N1 --> A1
    N2 --> A2
    N3 --> A3
    N4 --> A4
    N5 --> A5
```

| NFR | 架構決策 | 實作位置 |
|-----|---------|---------|
| NFR-001.1 Token 管理 | JWT 短效 Access Token（8h/30d）+ Refresh Token；Token Blocklist 支援強制失效 | JWT Util、Auth 模組、Middleware |
| NFR-001.2 RBAC | 路由層級的角色守衛中介層；未授權回傳 403 並記錄至日誌 | RBAC Middleware |
| NFR-001.3 密碼安全 | bcrypt（cost >= 10）；Logger 自動遮罩密碼欄位；明文密碼絕不持久化 | Hash Util、Logger |
| NFR-001.4 憑證保護 | AES-256-GCM 加密儲存；金鑰從環境變數讀取；API 序列化層排除 `encrypted_password` 欄位；回傳遮罩字串 `****` | Crypto Util、Datasource Service、DTO 序列化層 |
| NFR-001.5 傳輸安全 | 強制 TLS 1.2+；HTTP 請求重導至 HTTPS；設定 HSTS 標頭；CORS 白名單（OQ-12） | 反向代理（Nginx/等）配置、後端中介層 |

**額外安全措施**（規格書中隱含）：
- API 路徑使用 `/api/v1/` 前綴（OQ-13 決議）
- Rate Limiting：登入端點 5 次/分鐘/IP（OQ-5 決議）
- 所有回應排除 Stack Trace；500 錯誤使用通用訊息
- 多 JWT Secret 並行支援無停機輪替（OQ-11 決議）

### 6.2 效能（NFR-002）

| NFR | 目標值 | 架構決策 |
|-----|--------|---------|
| NFR-002.1 API 回應時間 | p95 < 500ms | 資料庫索引（見 4.4）；避免 N+1 查詢；分頁強制執行 |
| NFR-002.2 並發使用者 | >= 100 人 | Modular Monolith 可於單機處理；JWT 無狀態驗證減少 DB 查詢；Token Blocklist 建議使用高效能存儲（Redis 或帶索引的 DB） |
| NFR-002.3 連線測試逾時 | <= 10 秒 | Datasource Service 強制 10 秒 TCP 連線 Timeout；每次測試使用獨立短期連線 |
| NFR-002.4 儀表板載入（資料來源） | < 2 秒（50 資料來源） | `datasource_health_logs` 上的複合索引（datasource_id, checked_at）；Dashboard Service 使用聚合查詢而非應用層計算；前端 Polling 間隔 30 秒（避免頻繁請求） |
| NFR-002.5 清單搜尋效能 | < 500ms（1,000 筆） | 分頁強制執行（預設 20 筆/頁）；搜尋欄位建立索引；`deleted_at IS NULL` 條件搭配索引 |
| NFR-002.6 擷取儀表板載入 | < 2 秒（50 任務） | ExtractionLog 上的 `(task_id, started_at)` 與 `(status, started_at)` 複合索引；今日統計使用 DB 聚合查詢（`DATE_TRUNC`）而非應用層計算；趨勢圖使用 `DATE_TRUNC` 聚合 |
| NFR-002.7 擷取任務清單 | < 500ms（1,000 筆） | 分頁強制執行（預設 10 筆/頁）；`(status, deleted_at)` 複合索引；搜尋欄位索引 |
| NFR-002.8 Pipeline 列表載入 | < 2 秒（F027） | `(status, deleted_at)` 複合索引；分頁強制執行（預設 10 筆/頁）；統計查詢（today processed）使用 DB 聚合（`DATE_TRUNC`，UTC+8 邊界換算） |
| NFR-002.9 Pipeline 執行進度查詢 | p95 < 500ms | EtlPipelineLog 主鍵查詢；`(pipeline_id, started_at)` 複合索引；前端 5 秒 Polling |
| NFR-002.10 Pipeline 版本 Diff | < 2 秒 | Diff 在應用層計算（比對兩個 JSONB definition）；版本數量有限（典型 < 50 版），應用層計算可接受 |
| NFR-002.12 孤兒回收耗時（F038） | < 5 秒 | `OrphanRecoveryService` 使用批次 QueryBuilder（`WHERE id IN (...)`）取代逐筆更新；典型場景（0 ~ 數筆孤兒）耗時可忽略不計；若耗時超過 5 秒，Logger 應記錄警告供後續調查 |

**效能風險**：
- `DatasourceHealthLog` 隨時間增長（每 30 分鐘 × 資料來源數），90 天保留期需確保 Cleanup Cron 正常執行，否則查詢效能將逐漸下降。
- `ExtractionLog` 保留 30 天（AQ-10 決議），Cleanup Cron 確保不會無限增長。
- `EtlPipelineLog` 保留 30 天（AQ-14 決議），若 Pipeline 執行頻繁（多個排程 Pipeline 每小時執行），Log 數量增長需 Cleanup Cron 正常運行。
- Pipeline Transform 節點在記憶體中執行，大型資料集（數百萬筆）的 Transform 可能導致記憶體壓力。MVP 規模下建議設定合理的 Extract 節點查詢上限。

### 6.3 可用性與可觀測性

| 面向 | 架構決策 |
|------|---------|
| 可用性 | MVP 單機部署；HTTPS 由反向代理（Nginx 等）終止；後端進程崩潰需 Process Manager（PM2 等）自動重啟 |
| 日誌（Logging） | 結構化日誌（JSON 格式建議）；敏感欄位自動遮罩；區分 INFO / WARN / ERROR 等級；錯誤包含 request ID 追蹤 |
| 健康端點 | 建議提供 `GET /api/health` 端點，供 Load Balancer / 部署平台健康檢查 |
| 監控 | MVP 階段最低需求：應用程式日誌集中收集；若部署雲端，利用雲端原生監控 |
| 擷取任務孤立狀態偵測 | 若後端 Process 在擷取執行中崩潰，ExtractionLog 將保持 `status=running`。Cleanup Cron 的孤立 running 修復邏輯（AD-E04-7）每日偵測並標記超過 2 小時的孤立記錄為 `failed` |

### 6.4 可維護性

| 面向 | 架構決策 |
|------|---------|
| 模組邊界 | 各模組透過服務介面互動，禁止跨模組直接存取資料庫 Repository |
| API 版本控制 | 路由使用 `/api/v1/` 前綴（OQ-13），為未來版本升級預留空間 |
| 設定管理 | 所有環境相關設定（DB 連線字串、JWT Secret、AES 金鑰）透過環境變數注入，不硬編碼 |
| Monorepo | 前後端同一 Repository（OQ-3 決議），統一 CI/CD 流程 |

---

## 7. 部署與執行時期視圖

### 7.1 部署單元

```mermaid
graph TB
    subgraph Server["伺服器（單機 MVP）"]
        subgraph ReverseProxy["反向代理（Nginx 等）"]
            TLSTermination["TLS 終止<br/>HTTP → HTTPS 重導<br/>HSTS 標頭"]
            StaticServe["靜態資源服務<br/>SPA 建置產出"]
        end

        subgraph AppServer["應用程式伺服器"]
            BackendProcess["後端 Process<br/>（含 Scheduler 模組）<br/>Process Manager 管理（PM2 等）"]
        end

        subgraph DataLayer["資料層"]
            AppDatabase["應用資料庫<br/>（PostgreSQL 16）"]
            TokenStore["Token Blocklist<br/>（PostgreSQL 同庫 或 Redis）"]
        end
    end

    subgraph External["外部服務（網路可達）"]
        EmailService["Email 服務<br/>SMTP / SendGrid"]
        TargetDatabases["目標資料庫群<br/>MySQL / PostgreSQL / SQL Server"]
    end

    Internet -->|"HTTPS 443"| ReverseProxy
    ReverseProxy -->|"HTTP 內部"| AppServer
    ReverseProxy -->|"靜態檔案"| StaticServe
    AppServer <-->|"DB 連線"| DataLayer
    AppServer -->|"SMTP / HTTPS"| EmailService
    AppServer -->|"TCP 連線測試 / 資料擷取"| TargetDatabases

    classDef proxy fill:#dbeafe,stroke:#2563eb
    classDef app fill:#dcfce7,stroke:#16a34a
    classDef data fill:#fef9c3,stroke:#ca8a04
    classDef external fill:#fef2f2,stroke:#ef4444
    class ReverseProxy,TLSTermination,StaticServe proxy
    class AppServer,BackendProcess app
    class DataLayer,AppDatabase,TokenStore data
    class External,EmailService,TargetDatabases external
```

### 7.2 環境分離

| 環境 | 用途 | 建議配置 |
|------|------|---------|
| Development | 本地開發 | 本機 DB；Mock Email 服務（如 Mailhog）；Docker Compose 啟動相依服務 |
| Test / CI | 自動化測試 | 獨立測試 DB（每次 CI 重建）；Mock 外部服務；執行 Unit + Integration Test |
| Production | 正式環境 | 企業內網或私有雲；HTTPS 強制；真實 Email 服務；DB 備份策略 |

### 7.3 擴展模型

| 情境 | 擴展策略 |
|------|---------|
| MVP（並發 <= 100 人） | 單機部署，垂直擴展（升級硬體規格） |
| 未來水平擴展（Phase 2+） | 多後端實例需：Token Blocklist 使用 Redis（跨實例共享）；Scheduler 引入分散式鎖（避免重複健康檢查與重複擷取觸發）；Session 無狀態（JWT 已滿足）；擷取並發控制需升級為資料庫 row-level lock 或分散式鎖（避免 status 競爭條件） |

### 7.4 設定與密鑰管理

所有敏感設定必須透過環境變數注入，禁止出現在程式碼或版本控制中：

| 設定項目 | 說明 |
|---------|------|
| `DATABASE_URL` | 應用資料庫連線字串 |
| `JWT_SECRET` | JWT 簽章 Secret（支援多個以逗號分隔，供輪替用） |
| `AES_ENCRYPTION_KEY` | AES-256 加密金鑰（Base64 編碼，256-bit） |
| `EMAIL_SMTP_HOST/PORT/USER/PASS` 或 `SENDGRID_API_KEY` | Email 服務設定 |
| `TOKEN_BLOCKLIST_REDIS_URL` | Token Blocklist Redis 連線（若使用 Redis） |
| `APP_BASE_URL` | 前端應用 URL（用於產生密碼重設連結） |

**Secret 輪替流程**（JWT Secret，OQ-11 決議）：
1. 新增新 Secret 至環境變數（保留舊 Secret）
2. 部署後端（JWT Util 支援多 Secret 並行驗證）
3. 等待所有現有 Token 到期（最多 30 天）
4. 移除舊 Secret

### 7.5 資料庫初始化

系統部署時需透過 Seed 機制建立至少一個 Admin 帳號（規格書假設 A1）：

```
Seed 流程：
1. 執行 Schema Migration
2. 檢查是否存在任何 Admin 帳號
3. 若不存在，建立預設 Admin（帳號資訊透過環境變數注入，非硬編碼）
4. 記錄 Seed 執行結果至日誌
```

---

## 8. 風險、取捨與替代方案

### 8.1 架構風險

#### 風險 1：Token Blocklist 查詢失敗時的 Fail-Open 問題

**描述**：若 Token Blocklist 存儲（Redis 或 DB）暫時不可用，中介層需決定是允許請求通過（Fail-Open）或拒絕（Fail-Closed）。

**影響**：Fail-Open 可能讓已登出的 Token 短暫重新有效，造成安全漏洞。Fail-Closed 可能導致系統整體不可用（可用性問題）。

**建議**：採用 Fail-Closed 策略，優先保障安全性。監控 Blocklist 存儲的可用性，建立告警機制。

**替代方案**：使用短效 Access Token（8h）減少 Blocklist 查詢頻率；大多數請求的 Token 到期後自動失效，Blocklist 只需在 Token 未到期時強制失效。

---

#### 風險 2：Scheduler 多實例重複執行

**描述**：MVP 為單機部署，Scheduler 無問題。但若未來水平擴展，多個後端實例將各自啟動 Scheduler，導致每 30 分鐘對同一資料來源執行多次健康檢查，以及每分鐘重複觸發擷取任務（擷取排程掃描的 `status != 'running'` 檢查存在競爭條件）。

**影響**：DatasourceHealthLog 產生重複記錄；目標資料庫接受多餘連線；擷取任務可能被多實例同時觸發。

**建議**：MVP 階段忽略此問題。水平擴展前引入分散式鎖（Redis SET NX EX）或改用獨立排程服務（如 BullMQ、Celery）。

**F038 的部分緩解**：F038 `OrphanRecoveryModule` 在單機架構下能有效處理進程崩潰後遺留的孤兒任務，確保重啟後排程器不會因 `status=running` 而跳過已中斷的任務。然而，F038 本身依賴單一進程假設（啟動時無其他執行中進程），在多副本部署時無法提供保護，反而可能造成多個實例同時執行回收邏輯（詳見風險 10）。

---

#### 風險 3：Email 服務可用性影響密碼重設流程

**描述**：密碼重設（F009）依賴外部 Email 服務，若 Email 服務不可用，使用者無法接收重設連結。

**影響**：使用者被鎖定，需聯絡 Admin 透過 F010 重設密碼。

**建議**：Email 寄送為非同步操作（不阻塞 API 回應）；記錄 Email 寄送失敗至日誌；考慮引入 Email 重試機制（指數退避）。

---

#### 風險 4：AES 加密金鑰遺失

**描述**：若 `AES_ENCRYPTION_KEY` 遺失，所有已儲存的資料來源密碼將無法解密，導致連線測試與資料擷取全數失敗。

**影響**：所有資料來源連線失效，需逐一重新輸入密碼。

**建議**：加密金鑰存放於安全的密鑰管理系統（企業內部可使用 HashiCorp Vault、AWS KMS 等），並建立金鑰備份程序。

---

#### 風險 5：非同步擷取執行的孤立 Running 狀態

**描述**：F021 採用 Promise-based 背景執行。若 Node.js Process 崩潰（OOM、硬體故障等），正在執行的擷取任務的 ExtractionLog 將永遠保持 `status=running`，`finished_at` 為 null。此孤立狀態會導致排程引擎跳過該任務（因為 `status=running`），且前端儀表板顯示永不完成的任務。

**影響**：受影響的任務無法被排程引擎自動重觸發；Admin 需手動識別並重新執行。

**建議**：Cleanup Cron 新增孤立 running 日誌修復邏輯（AD-E04-7）：將 `started_at < NOW() - 2 hours AND finished_at IS NULL` 的 ExtractionLog 標記為 `failed`，並同步更新對應 ExtractionTask.status。

---

#### 風險 6（E05 新增）：Pipeline Transform 記憶體消耗

**描述**：Pipeline Execution Service 在 Node.js 記憶體中執行所有 Transform 節點（Merge、Aggregate、Deduplicate 等）。若 Extract 節點載入數十萬筆 raw data，應用伺服器的 Heap 記憶體可能急遽上升，導致 OOM（Out of Memory）崩潰。

**影響**：Pipeline 執行失敗；若 Process 崩潰（OOM Kill），EtlPipelineLog 留下孤立 `status=running` 狀態，需 Cleanup Cron 修復。

**建議**：
- MVP 階段建立 Extract 節點的查詢筆數上限（建議 100,000 筆，可透過環境變數 `PIPELINE_MAX_EXTRACT_ROWS` 配置）
- 監控 Node.js Heap 使用量（PM2 metrics 或 cloud monitoring）
- 若未來需處理百萬筆資料，考慮升級為 Worker Thread 或獨立 Worker Process（Phase 2）

---

#### 風險 7（E05 新增）：Pipeline 排程與 Extraction 排程的競爭條件

**描述**：Pipeline Scheduler Cron 與 Extraction Scheduler Cron 均每分鐘執行，若兩個 Cron Job 在同一分鐘同時觸發大量任務，可能造成 DB 連線池壓力與 Node.js Event Loop 擁塞。

**影響**：API 請求延遲增加；Cron Job 本身執行時間超過一分鐘導致下次觸發重疊。

**建議**：MVP 階段不使用連線池（OQ-R9 決議），短暫高峰可接受。水平擴展前需評估引入 `pg-pool` 或 Prisma 連線池管理。

---

#### 風險 8（E05 新增）：Pipeline 孤立 running 狀態（Process 崩潰）

**描述**：與擷取任務孤立問題類似（風險 5），若 Node.js Process 在 Pipeline 執行中崩潰，EtlPipelineLog 將保持 `status=running`，導致排程無法再次觸發（掃描條件 `status != 'running'`）。

**影響**：受影響的 Pipeline 無法被排程觸發；Admin 需手動識別並重新執行。

**建議**：Cleanup Cron 的孤立修復邏輯（AD-E05-2）：每日偵測 `started_at < NOW() - 2 hours AND finished_at IS NULL` 的 EtlPipelineLog 並標記為 `failed`，同步更新 EtlPipeline.status。

---

#### 風險 10（F038 新增）：孤兒回收機制的單進程架構假設

**描述**：`OrphanRecoveryModule.onApplicationBootstrap()` 假設執行時系統中不存在其他正在運行的任務進程（即啟動即表示前一個進程已完全終止）。若未來採用多副本部署（水平擴展），多個實例同時啟動時將各自執行回收邏輯，對同一批孤兒任務進行重複更新（雖然結果冪等，不會造成資料錯誤，但存在不必要的競爭寫入）；更嚴重的是，若某個副本在另一個副本仍在執行任務時崩潰並重啟，回收邏輯可能錯誤地將仍在執行中（由其他副本負責）的任務標記為 `failed`。

**影響**：多副本部署下，孤兒回收可能誤傷正在執行中的任務，造成任務執行中斷與狀態不一致。

**建議**：MVP 單機部署不受影響。水平擴展前需將 `OrphanRecoveryModule` 改為基於**超時判斷**（`started_at < NOW() - 2 hours`，與 Cleanup Cron 的邏輯一致）或引入**分散式鎖**（Redis SET NX EX）確保只有一個實例執行回收。

---

#### 風險 11（F036 新增）：來源欄位結構假設與實際不符

**描述**：`customer_core` 的 45 個欄位定義（US-049）基於對 ZZIP_BAMCUST_M 與 MLMCUSTOMER 兩個來源表的欄位假設（如欄位名稱、資料型別、佔位值格式）。若實際來源表的欄位與假設不符（如欄位改名、型別不同、佔位值格式差異），ETL Transform 節點的轉換規則將產生錯誤或無效輸出。

具體高風險點包括：
- `MLMC.CUSTNOWCAPTIAL` / `CUSTCREATECAPTIAL` 的 varchar 值是否都能合法轉為 DECIMAL（可能含文字說明如「未填寫」）
- 電話欄位佔位值格式：假設為 `00-0000000000`，實際格式需以真實資料確認
- `ZZIP.CUSTO_NO` 與 `MLMC.CUSTID` 的值格式是否一致（Merge 鍵的準確性）

**影響**：TypeCast 節點執行時拋出型別轉換例外，導致 Pipeline 執行失敗；或 Merge 節點因鍵格式不一致產生重複客戶記錄。

**建議**：
- 開發前執行來源表欄位 Profile（`INFORMATION_SCHEMA` 查詢）確認欄位存在性與型別
- 對 varchar→DECIMAL 欄位執行資料品質掃描（`COUNT(*) WHERE column NOT REGEXP '^[0-9.]+$'`）
- 以實際資料樣本確認電話佔位值格式與 Merge 鍵格式
- TypeCast 節點加入錯誤容忍機制（無效值轉換為 NULL 而非拋出例外，可透過 `NullHandler` 節點前置處理）

---

#### 風險 9（E05 原有）：目標資料庫大量資料擷取的負載影響

**描述**：擷取任務（全量模式）執行時，對外部資料來源執行全表查詢（`SELECT * FROM "{source_schema}"."{source_table}"`），並將資料批次寫入 AppDB raw data 表。對於大型表（數百萬筆），此查詢可能對外部資料來源造成顯著負載，甚至影響其正常業務查詢。同時，大量批次 INSERT 至 AppDB 也會佔用資料庫資源。

**影響**：目標資料庫效能下降；若目標資料庫為生產系統，可能影響業務連續性。

**建議**：
- 擷取使用可配置的 `batch_size`（預設 1000，範圍 100-10000）分批讀取（AQ-11 決議）
- 建議在低峰時段設定 cron 排程
- 增量模式可顯著降低此風險（規格書已提供 `incremental` 模式）
- 擷取連線使用獨立短期連線，不占用應用程式連線池

---

### 8.2 已評估但放棄的替代方案

| 方案 | 放棄理由 |
|------|---------|
| Microservices 架構 | 使用者規模 500 人、MVP 階段，Microservices 的網路複雜度、服務發現、分散式追蹤等成本遠超收益 |
| Server-Side Rendering（SSR）前端 | 規格書假設 A6 明確為 SPA；Admin 後台需豐富互動（儀表板、即時更新），SSR 不適合 |
| WebSocket（儀表板即時更新） | OQ-9 已決議採用 Polling（30 秒間隔）。WebSocket 需要持久連線管理，在監控場景中 Polling 的延遲可接受 |
| 不使用 Token Blocklist（純 JWT 到期） | NFR-001.1 明確要求 Token 可主動失效（登出、帳號停用、密碼重設）；純到期機制無法滿足 |
| 使用 Cookie Session（非 JWT） | 規格書 F001 明確定義 JWT Token 機制；Phase 2 SSO 整合（OQ-R3）需要 JWT 相容性 |
| Redis 作為主要 Token Blocklist | MVP 不強制引入 Redis（增加依賴），以應用資料庫的 TokenBlocklist 表替代；若效能不足可升級 |
| BullMQ + Redis 作為擷取任務佇列 | 引入 Redis 強依賴；MVP 擷取任務數量有限，Promise-based 非同步足夠；BullMQ 的持久化佇列與重試機制雖有益，但超出 MVP 複雜度預算 |
| 每個擷取任務使用獨立動態 Cron Job | 任務數量變動時維護複雜（需追蹤每個 Job 的 reference）；不如「每分鐘掃描 + cron-parser 比對」模式穩定；F023 BR-1 明確定義固定頻率掃描方案 |
| Pipeline 定義使用正規化關聯表（節點表 + 連線表） | 13 種節點類型各有不同設定欄位，正規化需大量 JOIN 且擴展困難；JSONB 儲存允許彈性結構，版本 Diff 在應用層計算即可 |
| Pipeline 執行使用 Worker Thread / Worker Process | 對 I/O 密集的 Transform 操作不必要（CPU 密集才需要 Worker Thread）；增加 IPC（Inter-Process Communication）複雜度；MVP 規模不合理 |
| Pipeline 視覺化編輯器使用後端渲染 | 拖拉畫布需要豐富的前端互動，規格書 F029 明確建議 React Flow（前端庫）；後端無法實現拖拉式 UX |
| Pipeline 版本 Diff 使用資料庫層計算 | PostgreSQL JSONB Diff 需複雜 SQL 函數；應用層 JSON 比對更直觀且可維護；版本數有限，應用層計算效能可接受 |

### 8.3 需要驗證的領域

| 項目 | 風險等級 | 說明 |
|------|---------|------|
| Token Blocklist 查詢效能 | 中 | 每個 API 請求均查詢 Blocklist，需確認在 100 人並發下的查詢延遲（建議早期進行負載測試） |
| 連線測試並發安全性 | 中 | F016「Refresh All」觸發平行連線測試，50 個資料來源同時測試的資源消耗需驗證 |
| Email 非同步可靠性 | 低-中 | 非同步 Email 寄送的重試機制需定義（目前規格書未明確） |
| AES-256-GCM 實作正確性 | 高 | 加密金鑰管理與 IV（Initialization Vector）處理需要安全性審查 |
| 擷取任務並發數量 | 中 | 多個大型擷取任務同時執行時，Node.js Event Loop 的 I/O 吞吐量與記憶體使用需驗證 |
| Pipeline Transform 記憶體上限 | 高 | Transform 節點在記憶體中執行，100,000 筆資料的 Merge/Aggregate 操作的記憶體峰值需在開發初期量測，並設定合理上限 |
| Pipeline + Extraction 排程同時觸發 | 中 | 兩個每分鐘 Cron Job 同時觸發大量任務的 DB 連線壓力與 Event Loop 影響需驗證 |
| JSONB definition Diff 效能 | 低 | 版本 Diff 在應用層計算，典型 Pipeline 節點數量（< 20）效能可預期；若版本差異極大需確認回應時間 |

---

## 9. 待決事項

> 以下問題在撰寫本架構規格書時識別，需要在開發開始前確認。

### 9.1 架構層級待決事項

| # | 問題 | 影響範圍 | 建議方向 | 決策期限 |
|---|------|---------|---------|---------|
| AQ-1 | Access Token 儲存位置：`localStorage` 或 `httpOnly Cookie`？ | F001, F002, F003，前端整體安全性 | 建議 `httpOnly Cookie`（避免 XSS 風險），但需處理 CORS 和 CSRF 防護 | 開發前確認 |
| AQ-2 | Token Blocklist 實作：應用 DB 同庫 或 獨立 Redis？ | F003, F007, F009, F010，整體效能 | MVP 使用 DB 同庫；若並發測試顯示效能不足，升級至 Redis | 技術選型後確認 |
| AQ-3 | 健康端點（`GET /api/health`）的定義與回應格式 | DevOps、部署健康檢查 | 至少回傳 `{"status": "ok", "timestamp": "..."}` | 開發初期定義 |
| AQ-4 | Scheduler 的實作方式：框架內建 Cron 或 外部服務（BullMQ 等）？ | F016, F023, Cleanup 工作 | MVP 使用框架內建（`@nestjs/schedule`），降低依賴 | 技術選型後確認 |

### 9.2 功能層級待決事項

| # | 問題 | 影響範圍 | 建議方向 |
|---|------|---------|---------|
| AQ-5 | 「Refresh All」（F016）的平行測試是否有最大並行數限制（Concurrency Limit）？ | F016 效能與目標 DB 負載 | 建議設定上限（如最多 10 個並行連線），避免大量 TCP 連線同時建立 |
| AQ-6 | PasswordResetToken 過期後的保留策略：永久保留（僅標記）或 Cron 清理？ | 資料庫儲存空間 | 建議 Cron 清理超過 30 天且已使用/過期的記錄 |
| AQ-7 | Email 寄送失敗時是否需要重試機制？重試次數與退避策略？ | F009 可靠性 | 建議最多 3 次重試，指數退避 |
| AQ-8 | 帳號清單（F005）與資料來源清單（F012）的排序規則（預設排序欄位與方向）？ | F005, F012 | 建議預設依 `created_at DESC`，並支援前端指定排序欄位 |

### 9.3 已決議事項（E04 資料擷取）

> 以下為 E04 架構設計過程中提出並已決議的事項，記錄於此供實作參照。

| # | 問題 | 決議 | 決議日期 |
|---|------|------|---------|
| AQ-9 | 擷取執行是否有最長執行時間限制？ | **2 小時**。超時由 Cleanup Cron 偵測並標記為 `failed`（AD-E04-7） | 2026-03-17 |
| AQ-10 | ExtractionLog 保留策略 | **保留 30 天**。Cleanup Cron 每日清理 `started_at < NOW() - 30 days` 的記錄 | 2026-03-17 |
| AQ-11 | 批次讀取大小（Batch Size）是否可配置？ | **可配置**。ExtractionTask 新增 `batch_size` 欄位（integer, 預設 1000, 範圍 100-10000） | 2026-03-17 |
| AQ-12 | API 路徑前綴統一 | **使用 `/api/v1/extraction-tasks`**。依循現行程式碼慣例（`app.setGlobalPrefix('api/v1')`），Controller 宣告 `@Controller('extraction-tasks')` | 2026-03-17 |
| AQ-13 | `last_incremental_value` 資料型別處理 | **string 儲存 + `incremental_column_type` 欄位**。新增 `incremental_column_type`（enum: `timestamp`/`integer`/`string`，預設 `timestamp`），後端依型別決定 WHERE 比較方式與型別轉換，前端依型別決定顯示格式 | 2026-03-17 |

### 9.4 已決議事項（E05 ETL Pipeline）

> 以下為 E05 架構設計過程中提出並已決議的事項，記錄於此供實作參照。

| # | 問題 | 決議 | 決議日期 |
|---|------|------|---------|
| AQ-14 | EtlPipelineLog 保留策略 | **保留 30 天**。與 ExtractionLog 一致；Cleanup Cron 每日清理 `started_at < NOW() - 30 days` 的記錄 | 2026-03-20 |
| AQ-15 | Pipeline 執行最長時間限制 | **2 小時**。與擷取任務一致；超時由 Cleanup Cron 偵測（AD-E05-2） | 2026-03-20 |
| AQ-16 | ETL Pipeline API 路徑前綴 | **使用 `/api/v1/etl/`**。與擷取任務（`/api/v1/extraction-tasks/`）區隔；Controller 宣告 `@Controller('etl')`；子路由：`/etl/pipelines/**`、`/etl/target-tables/**`、`/etl/logs/**` | 2026-03-20 |
| AQ-17 | Pipeline Transform 執行位置 | **在 Node.js 主 Process 記憶體中執行**。MVP 規模（資料量 < 100,000 筆）可接受；需設定 `PIPELINE_MAX_EXTRACT_ROWS` 上限環境變數（建議預設 100,000）防止 OOM | 2026-03-20 |
| AQ-18 | Merge 節點（多輸入）的執行順序 | **左右兩個 Extract/Transform 輸入節點先並行執行，兩者完成後再執行 Merge**。DAG 拓撲排序時偵測多輸入節點，執行引擎使用 `Promise.all()` 等待所有輸入完成 | 2026-03-20 |
| AQ-19 | Pipeline 版本 Diff 的計算層 | **應用層計算**。後端讀取兩個版本的 JSONB definition，以 JavaScript 比對 nodes（id、type、data 差異）與 edges（source/target 差異），回傳結構化 diff 結果 | 2026-03-20 |

### 9.5 待確認假設（E05 新增）

| 假設 | 風險 | 確認方式 |
|------|------|---------|
| Pipeline Transform 節點在記憶體中執行的最大資料筆數（建議 100,000）足以滿足 MVP 業務需求 | 若業務資料量超過此限制，Pipeline 執行將受限或 OOM | 與業務部門確認典型資料量級（ZZIP_BAMCUST_M 與 MLMCUSTOMER 的客戶總筆數），並進行記憶體壓力測試 |
| `customer_core` 的約 45 欄位定義（US-049 A~H 分類）與實際來源欄位完全對應 | 若來源系統的欄位名稱或型別與假設不符，ETL 轉換規則需調整 | 在開發前確認 ZZIP_BAMCUST_M 與 MLMCUSTOMER 的實際欄位清單（`INFORMATION_SCHEMA` 驗證）；電話佔位值格式（如 `00-0000000000`）需以實際資料樣本確認 |
| 目標表 Schema 在 MVP 期間固定不變（Admin 無法自訂欄位）| 若業務需求變更，需透過 DB Migration 修改目標表 Schema 與 Registry 程式碼 | 確認 F036 BR-4（目標表 schema 為靜態定義）在 MVP 範圍內是否有例外 |
| `ZZIP.CUSTO_NO` 與 `MLMCUSTOMER.CUSTID` 在兩系統中均為身分證字號或統一編號，值格式一致可直接作為 Merge 鍵 | 若兩系統的客戶編號格式不一致（大小寫、空白、前綴差異），Merge 節點會產生重複客戶記錄 | 以實際資料樣本驗證兩欄位值的格式一致性；若有差異，需在 Merge 前加入 String 節點做格式正規化 |
| Pipeline 執行中，所有被 Extract 節點參照的 raw data 表均存在（ExtractionTask 已至少執行一次） | 若 raw data 表不存在，Extract 節點執行時將報錯 | 在 Pipeline 執行前加入前置檢查：驗證所有 Extract 節點參照的 raw data 表存在 |

### 9.6 待確認假設（原有）

| 假設 | 風險 | 確認方式 |
|------|------|---------|
| 部署環境具備 HTTPS 支援（TLS 憑證已配置） | 若部署環境無 TLS，傳輸安全性 NFR 無法滿足 | 確認目標部署平台的 TLS 配置方式 |
| 目標資料庫（連線測試目標）從 CDMP 伺服器網路可達 | 若有防火牆隔離，連線測試將全數失敗 | 確認網路拓樸與防火牆規則 |
| 應用資料庫的選擇（RDBMS 類型：PostgreSQL / MySQL / SQL Server） | 影響 ORM 選擇與 SQL 語法 | 技術選型階段確認 |
| 初始 Admin 帳號的建立機制（Seed Script 或手動） | 若無初始 Admin，系統無法使用 | 定義 Seed 機制與 Admin 密碼設定方式 |

---

## 10. 技術棧決策

### 10.1 技術棧總覽

```mermaid
graph TB
    subgraph Frontend["前端"]
        React["React 18+"]
        TypeScript_FE["TypeScript 5+"]
        Vite["Vite（建置工具）"]
        TailwindCSS["Tailwind CSS"]
        ReactRouter["React Router v6"]
        TanStack["TanStack Query<br/>（API 狀態管理）"]
        Recharts["Recharts<br/>（儀表板圖表）"]
        ReactFlow["React Flow<br/>（Pipeline 視覺化編輯器）"]
    end

    subgraph Backend["後端"]
        Node["Node.js 20 LTS"]
        TypeScript_BE["TypeScript 5+"]
        NestJS["NestJS<br/>（應用框架）"]
        TypeORM["TypeORM<br/>（ORM）"]
        Passport["Passport.js + JWT Strategy"]
        NodeCron["node-cron<br/>（排程）"]
        CronParser["cron-parser<br/>（動態 Cron 解析）"]
    end

    subgraph Database["資料層"]
        PostgreSQL["PostgreSQL 16"]
        Redis["Redis 7（選配）<br/>Token Blocklist"]
    end

    subgraph DevOps["開發與部署"]
        Docker["Docker + Docker Compose"]
        Nginx["Nginx（反向代理）"]
        PM2["PM2（Process Manager）"]
        Vitest["Vitest + Supertest<br/>（測試框架）"]
    end

    Frontend -->|"HTTPS REST API"| Backend
    Backend -->|"TypeORM"| Database
    Nginx -->|"反向代理"| Backend
    Nginx -->|"靜態資源"| Frontend

    classDef fe fill:#dbeafe,stroke:#2563eb
    classDef be fill:#dcfce7,stroke:#16a34a
    classDef db fill:#fef9c3,stroke:#ca8a04
    classDef ops fill:#f3e8ff,stroke:#9333ea
    class React,TypeScript_FE,Vite,TailwindCSS,ReactRouter,TanStack,Recharts fe
    class Node,TypeScript_BE,NestJS,TypeORM,Passport,NodeCron,CronParser be
    class PostgreSQL,Redis db
    class Docker,Nginx,PM2,Vitest ops
```

### 10.2 後端技術棧

| 層級 | 技術選擇 | 版本 | 選擇理由 |
|------|---------|------|---------|
| Runtime | Node.js | 20 LTS | 長期支援版本；非同步 I/O 模型適合 API 伺服器與並發連線測試；前後端統一語言降低認知負擔 |
| 語言 | TypeScript | 5+ | 型別安全降低執行時期錯誤；IDE 自動補全提升開發效率；與 NestJS 原生整合 |
| 框架 | NestJS | 10+ | 內建模組化架構，天然支援 Modular Monolith；內建 Guard、Middleware、Pipe 機制完整對應 RBAC、JWT 驗證、Input Validation 需求；內建 Scheduler 模組（`@nestjs/schedule`）；完善的 DI（Dependency Injection）容器便於測試 |
| ORM | TypeORM | 0.3+ | 支援 PostgreSQL；支援 Migration；Entity 定義與 TypeScript 整合良好；支援 Optimistic Locking（`@VersionColumn`） |
| 驗證 | Passport.js + `@nestjs/jwt` | — | JWT Strategy 成熟穩定；與 NestJS Guard 機制無縫整合 |
| 密碼雜湊 | bcrypt（`bcryptjs`） | — | 純 JavaScript 實作，避免原生編譯問題；滿足 NFR-001.3 cost factor >= 10 |
| 加密 | Node.js 原生 `crypto` 模組 | — | AES-256-GCM 原生支援，無需額外依賴；滿足 NFR-001.4 |
| 排程 | `@nestjs/schedule`（底層 `node-cron`） | — | NestJS 原生整合；宣告式 `@Cron()` 裝飾器；支援靜態 Cron（健康檢查、清理）與固定頻率掃描（擷取排程每分鐘） |
| Cron 解析 | `cron-parser` | 4+ | F017 BR-5 和 F023 BR-7 明確指定；用於驗證 cron 表達式格式與每分鐘排程掃描時比對觸發條件 |
| 驗證（Input） | `class-validator` + `class-transformer` | — | NestJS 內建 ValidationPipe 整合；宣告式 DTO 驗證；自動產生錯誤訊息 |
| Email | Nodemailer | — | SMTP 支援完整；可透過 adapter 切換至 SendGrid；非同步寄送 |
| 資料庫驅動 | `pg`（PostgreSQL）、`mysql2`、`mssql` | — | 連線測試與資料擷取需要三種驅動；`pg` 同時作為應用 DB 驅動 |

**NestJS 選擇理由補充**：

規格書定義了明確的模組邊界（Auth、Account、Datasource、Extraction、Scheduler），NestJS 的 `@Module()` 機制直接對應此設計。相較於 Express.js 需自行建立模組化架構，NestJS 內建結構減少架構決策成本，且強制模組間透過 exports/imports 互動，天然防止跨模組耦合。

**已評估但未採用的替代方案**：

| 替代方案 | 未採用理由 |
|---------|----------|
| Express.js | 缺乏內建結構，需自行實作模組化、DI、Guard 等機制，增加架構維護成本 |
| Fastify | 效能優異但生態系不如 Express/NestJS 成熟；NestJS 可在未來切換至 Fastify adapter |
| Python (Django / FastAPI) | 團隊需維護兩種語言棧（前端 TypeScript + 後端 Python）；Django 較重量，FastAPI 模組化需自行設計 |
| Go (Gin / Fiber) | 開發速度較慢；ORM 生態系不如 Node.js 成熟；團隊雙語言成本 |
| Prisma（替代 TypeORM） | Prisma 不原生支援 Optimistic Locking；Migration 機制較受限；TypeORM 的 Active Record / Data Mapper 雙模式更靈活 |

### 10.3 前端技術棧

| 層級 | 技術選擇 | 版本 | 選擇理由 |
|------|---------|------|---------|
| 框架 | React | 18+ | 生態系最成熟；元件化開發模式適合 Admin 後台；社群資源豐富 |
| 語言 | TypeScript | 5+ | 前後端統一語言；API 回應型別可共享（Monorepo 優勢） |
| 建置工具 | Vite | 5+ | 開發階段 HMR 極快；建置產出最佳化（Tree Shaking、Code Splitting）；ESM 原生支援 |
| CSS 方案 | Tailwind CSS | 3+ | Utility-first 減少 CSS 檔案膨脹；與元件化開發模式契合；內建 Responsive Design |
| 路由 | React Router | v6 | SPA 路由標準方案；支援巢狀路由與 Layout；守護路由（Protected Routes）實作直觀 |
| API 狀態管理 | TanStack Query（React Query） | v5 | 自動快取與失效管理；Loading / Error 狀態內建；儀表板 Polling（`refetchInterval: 30000`）與擷取進度 Polling（`refetchInterval: 3000`）原生支援 |
| 表單管理 | React Hook Form + Zod | — | 表單驗證效能優異（uncontrolled forms）；Zod schema 可與後端 DTO 驗證邏輯對齊 |
| 圖表 | Recharts | — | React 原生元件；支援圓餅圖（F016 狀態分佈）、折線圖（F016 趨勢圖、F024 擷取趨勢圖）；SVG 渲染效能良好 |
| HTTP Client | Axios | — | Interceptor 機制適合統一附加 JWT Token 與處理 401 回應；與 TanStack Query 整合良好 |
| 視覺化流程圖 | React Flow | 11+ | F029 規格書明確建議；支援拖拉節點、自訂節點類型、箭頭連線、縮放平移；處理 DAG 渲染與互動邏輯；MIT License |
| UI 元件庫 | 不強制指定 | — | 由 UI/UX Designer 依設計稿決定（建議 shadcn/ui 或 Ant Design，兩者皆與 Tailwind 相容） |

**已評估但未採用的替代方案**：

| 替代方案 | 未採用理由 |
|---------|----------|
| Vue.js | React 生態系更豐富，團隊技術棧統一性考量 |
| Angular | 學習曲線較陡；對 MVP 規模而言過於重量級 |
| Next.js | MVP 為純 SPA，不需 SSR/SSG；引入 Next.js 增加不必要的複雜度 |
| Redux / Zustand | TanStack Query 已處理 Server State；MVP 無複雜 Client State 需求，不需額外狀態管理庫 |

### 10.4 資料層技術棧

| 層級 | 技術選擇 | 版本 | 選擇理由 |
|------|---------|------|---------|
| 應用資料庫 | PostgreSQL | 16 | 功能完整的開源 RDBMS；JSON 支援佳（未來擴展用）；UUID 原生支援；穩定的企業級選擇 |
| Token Blocklist | PostgreSQL 同庫（MVP）/ Redis 7（效能升級路徑） | — | MVP 避免引入額外依賴；TokenBlocklist 表加上索引可應對 100 並發；若負載測試顯示不足，切換至 Redis |
| Migration 工具 | TypeORM Migration | — | 與 ORM 整合；版本化 Schema 變更；支援 up/down 回滾 |

**PostgreSQL 選擇理由補充**：

規格書的目標資料庫為 MySQL、PostgreSQL、SQL Server（連線測試對象），應用資料庫需獨立選擇。PostgreSQL 在以下面向優於 MySQL：
- UUID 型別原生支援（無需 `CHAR(36)`）
- 更完善的 JSON/JSONB 操作（Phase 2 擴展用）
- 更嚴格的型別檢查與資料完整性
- 更活躍的開源社群與企業採用率

### 10.5 開發與部署工具

| 用途 | 技術選擇 | 說明 |
|------|---------|------|
| 容器化 | Docker + Docker Compose | 開發環境一鍵啟動（PostgreSQL、Redis、Mailhog）；CI 環境一致性 |
| 反向代理 | Nginx | TLS 終止、靜態資源服務、API 反向代理；滿足 NFR-001.5 |
| Process Manager | PM2 | Node.js 進程管理；自動重啟；日誌管理；滿足可用性需求 |
| 測試框架 | Vitest（Unit）+ Supertest（Integration） | Vitest 與 Vite 共享設定；速度優於 Jest；Supertest 用於 API Integration Test |
| E2E 測試 | Playwright | 跨瀏覽器測試（Chrome、Firefox、Edge）；滿足瀏覽器相容性假設 |
| Linter / Formatter | ESLint + Prettier | 程式碼風格統一；TypeScript 規則支援 |
| API 文件 | Swagger（`@nestjs/swagger`） | NestJS 裝飾器自動產生 OpenAPI 規格；便於前後端協作 |
| 負載測試 | k6 | 輕量級負載測試工具；驗證 NFR-002 效能指標（p95 < 500ms、100 並發） |
| Email 開發 | Mailhog | 本地 SMTP 攔截；開發環境不寄出真實 Email |

### 10.6 Monorepo 結構

依 OQ-3 決議，前後端同一 Repository。建議使用以下結構：

```
cdmp-mvp/
├── apps/
│   ├── api/                    # NestJS 後端
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/       # Auth 模組
│   │   │   │   ├── account/    # Account 模組
│   │   │   │   ├── datasource/ # Datasource 模組
│   │   │   │   ├── extraction/ # Extraction 模組
│   │   │   │   │   ├── extraction-task.service.ts      # 任務 CRUD
│   │   │   │   │   ├── extraction-execution.service.ts # 執行邏輯（共用）
│   │   │   │   │   └── extraction-dashboard.service.ts # 儀表板統計
│   │   │   │   ├── etl/        # ETL Pipeline 模組（E05）
│   │   │   │   │   ├── pipeline.service.ts             # Pipeline CRUD、啟用/停用、軟刪除
│   │   │   │   │   ├── pipeline-definition.service.ts  # JSONB definition 儲存/載入/驗證
│   │   │   │   │   ├── pipeline-execution.service.ts   # 非同步執行引擎（節點循序執行）
│   │   │   │   │   ├── pipeline-version.service.ts     # 版本管理、Diff、回滾、發布
│   │   │   │   │   ├── target-table.service.ts         # Target Table Registry（listTables / getSchema）
│   │   │   │   │   ├── target-table.controller.ts      # GET /api/v1/etl/target-tables（F036）
│   │   │   │   │   ├── target-tables/                  # Target Table Registry 靜態定義
│   │   │   │   │   │   ├── index.ts                    # Registry 入口（匯出 ALL_TARGET_TABLES 陣列）
│   │   │   │   │   │   └── customer-core.definition.ts # customer_core 約 45 欄位定義（A~H 分類）
│   │   │   │   │   │   # Phase 2/3: customer-financial.definition.ts 等
│   │   │   │   │   └── transforms/                     # 13 種 Transform 節點實作
│   │   │   │   │       ├── merge.transform.ts
│   │   │   │   │       ├── field-mapping.transform.ts
│   │   │   │   │       └── ...（其餘 11 種）
│   │   │   │   └── scheduler/  # Scheduler 模組
│   │   │   ├── common/         # 共用基礎建設
│   │   │   │   ├── crypto/     # AES-256 Util
│   │   │   │   ├── hash/       # bcrypt Util
│   │   │   │   ├── jwt/        # JWT Util
│   │   │   │   ├── email/      # Email Util
│   │   │   │   └── logger/     # Logger
│   │   │   └── main.ts
│   │   ├── test/               # Integration Tests
│   │   └── tsconfig.json
│   └── web/                    # React SPA 前端
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── api/            # API Client + TanStack Query hooks
│       │   └── App.tsx
│       ├── test/
│       └── vite.config.ts
├── packages/
│   └── shared/                 # 共享型別定義（DTO、API 回應型別）
│       └── src/
├── docker-compose.yml          # 開發環境（PostgreSQL、Redis、Mailhog）
├── docker-compose.prod.yml     # 生產環境
├── nginx.conf                  # Nginx 設定
├── .env.example                # 環境變數範本
├── package.json                # Workspace root
└── turbo.json                  # Turborepo 設定（選配）
```

### 10.7 技術棧版本相容性矩陣

| 技術 | 最低版本 | 建議版本 | 生命週期結束 |
|------|---------|---------|------------|
| Node.js | 20.0 | 20 LTS（最新 Patch） | 2026-04-30 |
| TypeScript | 5.0 | 5.4+ | 持續更新 |
| NestJS | 10.0 | 10.x（最新 Minor） | 持續更新 |
| React | 18.0 | 18.x（最新 Minor） | 持續更新 |
| PostgreSQL | 15 | 16 | 2028-11 |
| Redis（選配） | 7.0 | 7.2+ | 持續更新 |
| Docker | 24.0 | 最新 Stable | 持續更新 |
| Nginx | 1.24 | 最新 Stable | 持續更新 |

### 10.8 技術棧風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| TypeORM 維護活躍度下降 | ORM 層可能缺乏新功能或安全修補 | TypeORM 可逐步替換為 Prisma 或 MikroORM，模組化架構使 Repository 層替換成本可控 |
| Node.js 20 LTS 於 2026-04 到期 | 需升級至 Node.js 22 LTS | 提前規劃升級；NestJS 對 Node 版本相容性良好 |
| 前端 UI 元件庫未鎖定 | 各開發者風格不一致 | 在 UI/UX 設計階段確定元件庫選擇（建議 shadcn/ui） |
| Monorepo 工具選擇 | 建置效率與快取管理 | 初期可不使用 Turborepo，專案規模增長後再引入 |

---

*本文件版本 1.3，由 System Architect Agent 依據 CDMP MVP 規格書（spec-index v1.4，2026-03-19；E05 ETL Pipeline 管理規格 F027-F036，2026-03-19）更新。*

*本文件版本 1.4，由 System Architect Agent 依據 F038 孤兒任務回收規格（2026-03-25）更新。新增 `OrphanRecoveryModule` 模組架構、啟動生命週期時序（5.7 節）、NFR-002.12 效能對應、風險 2 緩解補充及風險 10。*

*本文件版本 1.5，由 System Architect Agent 依據 US-049 目標表 Domain-Oriented 規劃重大修訂（2026-03-25）更新。主要變更：*
- *F036 目標表由 4 個縮減為 1 個（Phase 1 MVP 僅 `customer_core`，約 45 欄位），`customer_financial`、`customer_interaction`、`customer_service` 移至 Phase 2/3*
- *新增 Target Table Registry 架構設計（AD-E05-6）：in-process 靜態定義方式，擴展機制說明*
- *新增來源系統整合架構圖（ZZIP_BAMCUST_M + MLMCUSTOMER → customer_core 資料流）*
- *新增 ETL 轉換規則說明（電話合併、衝突解決、代碼描述轉換、型別轉換）*
- *新增 5.10 節 Target Table Registry API 流程與 ETL 追蹤欄位自動填充時序圖*
- *新增 customer_core 資料庫索引建議（source_customer_no UNIQUE、_etl_pipeline_id INDEX）*
- *新增風險 11：來源欄位結構假設與實際不符的風險與緩解措施*
- *更新 9.5 待確認假設（新增兩項 F036 特有假設：欄位對應確認、Merge 鍵格式一致性）*
- *更新 Monorepo 結構：新增 `target-tables/` 子目錄與 `customer-core.definition.ts` 定義檔架構*

*如有規格變更，本文件應同步更新。*
