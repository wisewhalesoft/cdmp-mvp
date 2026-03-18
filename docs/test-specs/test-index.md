---
type: test-design-index
version: "1.3"
status: draft
last_updated: 2026-03-18
covers: [F001, F002, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012, F013, F014, F015, F016, F017, F018, F019, F020, F021, F022, F023, F024, F025, F026]
---

# CDMP MVP — 測試設計索引

> **專案**：CDMP（Customer Data Management Platform）v1.0 MVP
> **測試文件總數**：30 份（4 策略文件 + 26 Feature 測試文件）
> **總測試場景數**：294 個（原 247 + sourceSchema/連鎖下拉選單需求新增 47）
> **最後更新**：2026-03-18

---

## 1. 範圍總覽

### 涵蓋範圍

- 26 個 Feature（F001–F026），分屬 4 個 Epic：
  - **E01 驗證與登入**：F001、F002、F003
  - **E02 帳號與角色管理**：F004、F005、F006、F007、F008、F009、F010
  - **E03 資料來源管理**：F011、F012、F013、F014、F015、F016
  - **E04 資料擷取**：F017、F018、F019、F020、F021、F022、F023、F024、F025、F026
- 2 項非功能需求（NFR-001 安全性、NFR-002 效能），共 10 個子需求（含 NFR-002.6 E04 清單、NFR-002.7 E04 儀表板、NFR-002.8 E04 排程；新增 F026 raw data 預覽效能）
- 53 個錯誤碼的驗證覆蓋（新增 DATASOURCE_SCHEMA_LOAD_FAILED、DATASOURCE_TABLE_LOAD_FAILED，累計含 EXTRACTION_RAW_TABLE_NOT_FOUND、EXTRACTION_TABLE_CREATE_FAILED、EXTRACTION_BATCH_WRITE_FAILED）

### 排除項目

- Phase 2 功能（SSO/LDAP、進階稽核日誌、連線池）
- 帳號鎖定機制（MVP 不提供）
- CSV 批量帳號匯入
- 特定技術棧的實作測試（規格維持技術中立）

### 假設

- JWT 為 Session 管理的唯一機制
- 系統僅有 Admin 與 User 兩種角色
- 資料來源僅支援三種 RDBMS（MySQL、PostgreSQL、SQL Server）
- 密碼規則僅有最小長度 8 字元（無複雜度要求）
- 前端為 SPA 架構
- Token 失效策略採用 Refresh Token + 短效 Access Token

---

## 2. 覆蓋率摘要表

| Feature ID | Feature Name | Priority | Test File | Scenarios | Status |
|------------|-------------|----------|-----------|-----------|--------|
| F001 | Admin 登入 | P0-MVP | [F001-test.md](features/F001-test.md) | 8 | Draft |
| F002 | User 登入 | P0-MVP | [F002-test.md](features/F002-test.md) | 7 | Draft |
| F003 | 登出 | P0-MVP | [F003-test.md](features/F003-test.md) | 6 | Draft |
| F004 | 建立帳號 | P0-MVP | [F004-test.md](features/F004-test.md) | 8 | Draft |
| F005 | 查看帳號清單 | P0-MVP | [F005-test.md](features/F005-test.md) | 7 | Draft |
| F006 | 編輯帳號 | P0-MVP | [F006-test.md](features/F006-test.md) | 8 | Draft |
| F007 | 停用／啟用帳號 | P1 | [F007-test.md](features/F007-test.md) | 7 | Draft |
| F008 | 指派／變更角色 | P0-MVP | [F008-test.md](features/F008-test.md) | 6 | Draft |
| F009 | 自助式密碼重設 | P0-MVP | [F009-test.md](features/F009-test.md) | 10 | Draft |
| F010 | Admin 重設使用者密碼 | P0-MVP | [F010-test.md](features/F010-test.md) | 6 | Draft |
| F011 | 新增資料來源 | P0-MVP | [F011-test.md](features/F011-test.md) | 8 | Draft |
| F012 | 查看資料來源清單 | P0-MVP | [F012-test.md](features/F012-test.md) | 7 | Draft |
| F013 | 編輯資料來源 | P0-MVP | [F013-test.md](features/F013-test.md) | 8 | Draft |
| F014 | 刪除資料來源 | P1 | [F014-test.md](features/F014-test.md) | 5 | Draft |
| F015 | 測試連線 | P0-MVP | [F015-test.md](features/F015-test.md) | 8 | Draft |
| F016 | 狀態監控儀表板 | P1 | [F016-test.md](features/F016-test.md) | 10 | Draft |
| **E04 資料擷取** | | | | | |
| F017 | 建立擷取任務 | P0-MVP | [F017-test.md](features/F017-test.md) | 26 | Draft |
| F018 | 查看擷取任務清單 | P0-MVP | [F018-test.md](features/F018-test.md) | 9 | Draft |
| F019 | 編輯擷取任務 | P0-MVP | [F019-test.md](features/F019-test.md) | 26 | Draft |
| F020 | 啟用／停用擷取任務 | P0-MVP | [F020-test.md](features/F020-test.md) | 8 | Draft |
| F021 | 立即執行／重新執行 | P0-MVP | [F021-test.md](features/F021-test.md) | 26 | Draft |
| F022 | 查看擷取日誌 | P0-MVP | [F022-test.md](features/F022-test.md) | 13 | Draft |
| F023 | 排程自動執行 | P0-MVP | [F023-test.md](features/F023-test.md) | 8 | Draft |
| F024 | 擷取監控儀表板 | P1 | [F024-test.md](features/F024-test.md) | 11 | Draft |
| F025 | 刪除擷取任務 | P1 | [F025-test.md](features/F025-test.md) | 7 | Draft |
| F026 | 查看擷取資料預覽 | P0-MVP | [F026-test.md](features/F026-test.md) | 41 | Draft |
| **合計** | | | **26 files** | **294** | |

---

## 3. 自動化就緒度評估

### 適合自動化的場景

| 類別 | 場景數 | 說明 |
|------|--------|------|
| API 端點測試（Unit + Integration） | ~155 | 所有 CRUD 操作、驗證邏輯、錯誤碼回傳（含 E04 擷取任務 API、F026 raw data 預覽 API、新增 GET /datasources/:id/schemas 及 GET /datasources/:id/schemas/:schema/tables） |
| 安全性測試（RBAC / Token / SQL Injection） | ~18 | 角色權限驗證、Token 失效、輸入消毒；新增 raw data 表名安全（BR-13）與欄位名稱 sanitize |
| 資料驗證（邊界值、格式） | ~22 | 密碼長度、Port 範圍、Email 格式、cron 格式；新增 F026 分頁 limit 白名單驗證 |
| 排程邏輯測試（E04） | ~8 | 使用 scanAndExecute(fakeNow) injectable time 參數直接呼叫排程邏輯 |
| raw data 落地驗證（E04 F021） | ~12 | 動態建表、批次寫入、全量 TRUNCATE、增量追加，使用 Test Container 驗證 AppDB 資料 |
| F026 raw data 預覽 API | ~16 | 分頁、排序、錯誤碼；使用 Test Container 建立受控 raw data 表 |

### 需手動或半自動測試的場景

| 類別 | 場景數 | 說明 |
|------|--------|------|
| E2E 瀏覽器流程 | ~15 | 完整登入→操作→登出流程；新增 F026 從日誌 Drawer 導航至預覽頁面的 E2E 流程 |
| 視覺驗證 | ~5 | 儀表板圖表渲染、狀態色彩標示；F026 水平捲動表格 |
| 效能測試 | ~8 | 負載測試、並發測試需專用工具；F026 百萬筆分頁查詢效能（需 Test Container + 1,000,000 筆受控資料集） |

### 環境依賴

| 依賴項 | 測試影響 | Mock 策略 |
|--------|---------|-----------|
| 目標資料庫（MySQL / PostgreSQL / SQL Server） | F015、F016 連線測試 | Mock DB Driver 或 Test Container |
| Email 服務（SMTP / SendGrid） | F009 密碼重設 Email | Mock Email Service |
| 時鐘 | Token 過期、Reset Token 過期 | Clock Mock / Time Travel |
| 排程計時器（E04） | F023 排程觸發 | scanAndExecute(fakeNow) injectable time 參數，無需真實計時器 |
| 非同步執行（E04） | F021 執行結果驗證 | waitForTaskStatus(taskId, status, timeoutMs=5000) polling helper，interval=300ms |
| 外部資料庫（E04 F021） | raw data 動態建表、批次寫入驗證 | 使用 Test Container（MySQL / PostgreSQL）模擬外部來源，搭配 AppDB Test Container 驗證資料落地 |
| 外部資料庫（E04 F017/F019 schema/table 查詢） | GET /schemas 及 GET /tables 端點連線失敗場景 | Mock Datasource Service 的 `getSchemas()` / `getTables()` 方法；或使用 DS_PG_DISCONNECTED 搭配 Test Container 停用 PG 實例 |
| raw data 效能測試（E04 F026） | F026 百萬筆分頁查詢 | Test Container + controlled dataset（1,000,000 筆）；僅於 QA 環境執行，不納入 CI Pipeline |
| 時區（E04） | F018 今日統計、F024 今日統計 | todayInTaipei() 種子資料工廠函式，CI 設定 TZ=Asia/Taipei |

---

## 4. Agent Loading Guide

### TDD Developer Agent

**必讀檔案：**
1. `test-index.md`（本文件）— 瞭解整體範圍與優先級
2. 對應的 `features/F###-test.md` — 取得具體測試場景

**建議載入順序：** F001 → F002 → F003 → F004 → F005 → F006 → F008 → F009 → F010 → F007 → F011 → F012 → F013 → F015 → F014 → F016 → F017 → F018 → F019 → F020 → F021 → F022 → F023 → F024 → F025 → F026

**E04 資料擷取特殊注意：**
- F017/F019 連鎖下拉選單：新增 `GET /datasources/:id/schemas` 與 `GET /datasources/:id/schemas/:schema/tables` 兩個端點測試；連線失敗回傳 503（DATASOURCE_SCHEMA_LOAD_FAILED / DATASOURCE_TABLE_LOAD_FAILED）
- F017/F019 前端測試：驗證連鎖下拉選單的初始停用狀態、載入順序、重置邏輯、連線失敗停用、無手動輸入 fallback
- F019 前端特殊：編輯表單初始化時並行呼叫兩個 API（GET /schemas + GET /tables），預選既有值；已執行任務變更 schema/table 時顯示警告 Modal
- F021 非同步測試使用 `waitForTaskStatus(taskId, expectedStatus, timeoutMs=5000)`（interval=300ms）
- F021 SQL 組合格式：`"source_schema"."source_table"`（含雙引號）；sourceSchema=null 時僅使用 `"source_table"`
- F021 raw data 落地驗證需雙 Test Container（外部 DB + AppDB）；測試完成後驗證 AppDB 中 `raw_{task_id_short}` 表內容
- F021 SQL Injection 安全測試（TS-F021-SEC-001、TS-F021-SEC-002、TS-F021-SEC-003）驗證表名格式、欄位名稱 sanitize 及 SQL 保留字引用
- F022 前端測試（TS-F022-009 ~ TS-F022-013）驗證「預覽資料」連結的顯示條件
- F023 排程測試使用 `scanAndExecute(fakeNow)` injectable time 參數（不依賴真實計時器）
- F026 meta 回應新增 sourceSchema 欄位；前端顯示格式為 `sourceSchema.sourceTable`（sourceSchema=null 時僅顯示 sourceTable）
- F026 效能測試（TS-F026-PERF-001 ~ 003）需 1,000,000 筆受控資料集，僅在 QA 環境執行
- F018 / F024 今日統計種子資料使用 `todayInTaipei()` 工廠函式（CI 設定 TZ=Asia/Taipei）

**輔助參考：**
- `test-data-strategy.md` — 測試資料準備
- `test-levels.md` — 各層級測試策略

### QA Agent

**必讀檔案：**
1. `test-index.md`（本文件）
2. `test-levels.md` — 測試層級與 NFR 驗證策略
3. `risks-and-gaps.md` — 風險與待決問題
4. 所有 `features/F###-test.md`

### CI/CD Agent

**必讀檔案：**
1. `test-index.md`（本文件）— 取得覆蓋率目標
2. `test-levels.md` — Unit / Integration / E2E 分層執行策略

### Product Analyst

**必讀檔案：**
1. `test-index.md`（本文件）— 確認覆蓋率
2. `risks-and-gaps.md` — 確認風險與待決問題是否可接受

---

## 5. 相關文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 測試層級策略 | [test-levels.md](test-levels.md) | Unit / Integration / E2E / NFR 策略 |
| 測試資料策略 | [test-data-strategy.md](test-data-strategy.md) | 種子資料、邊界值、Mock 策略 |
| 風險與缺口 | [risks-and-gaps.md](risks-and-gaps.md) | 不可測需求、架構限制、待決問題 |
| 功能規格索引 | [../spec-index.md](../spec-index.md) | 所有功能規格入口 |
| 架構規格 | [../architecture-spec.md](../architecture-spec.md) | 系統架構與模組定義 |
| 錯誤處理規範 | [../error-handling.md](../error-handling.md) | 49 個錯誤碼定義 |
| 非功能需求 | [../nfr.md](../nfr.md) | 安全性與效能閾值 |

---

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-12 | 初版建立，16 個 Feature 測試設計 + 4 個策略文件 | Test Designer Agent |
| 2026-03-18 | 新增 E04 資料擷取（F017–F025）9 個 Feature 測試文件，共 79 個測試場景 | Test Designer Agent |
| 2026-03-18 | raw data 落地需求變更：更新 F017/F019（targetTable → sourceTable, rawTableName）、大幅更新 F021（動態建表/批次寫入/全量截斷/增量追加/SQL Injection）、更新 F022（「預覽資料」連結顯示條件）、新增 F026（raw data 預覽，36 個測試場景）；總測試場景數由 196 增至 247 | Test Designer Agent |
| 2026-03-18 | 連鎖下拉選單需求變更（v1.2）：sourceTable 單欄位 → sourceSchema + sourceTable；新增 GET /datasources/:id/schemas 與 GET /datasources/:id/schemas/:schema/tables 兩端點測試；更新 F017（+15 場景）、F019（+15 場景）、F021（+3 場景）、F026（+5 場景）；新增 4 項 SCHEMA-RISK；總場景數由 247 增至 294 | Test Designer Agent |
