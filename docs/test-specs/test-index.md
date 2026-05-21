---
type: test-design-index
version: "2.15"
status: draft
last_updated: 2026-05-21
covers: [F001, F002, F002SM, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012, F013, F014, F015, F016, F017, F018, F019, F020, F021, F022, F023, F024, F025, F026, F027, F028, F029, F030, F031, F032, F033, F034, F035, F036, F037, F038, F039, F040, F041, F042, F043, F044, F045, F046, F047, F048, F049, F050, F051, F052, F053, F054, F055, F056, F061, F068, F073, F074, F075, F076, F077, F081, F085, F089]
---

# CDMP MVP — 測試設計索引

> **專案**：CDMP（Customer Data Management Platform）v1.0 MVP
> **測試文件總數**：67 份（4 策略文件 + 56 Feature 測試文件 + F039 策略文件 1 份 + F040/F041 測試文件 2 份 + 整合測試 2 份 + Migration 測試 1 份 + Regression Guard 1 份）
> **總測試場景數**：1169 個（E01～E04 共 289 + F002SM 共 25 + E05 Pipeline 管理 11 Features 共 273 + F038 共 45 + F039 共 22 + F040 共 6 + F041 共 12 + F042 共 21 + F043 共 58 + F044 共 17 + E06 F046 共 31 + F047 共 38 + E07 M02 計分設定 F053 共 13 + F054 共 24 + F055 共 21 + F056 共 28 + **E07 M07 角色整合 F073/F074 E02 整合 共 63** + **E07 M06 篩選欄位管理 F075 共 53** + **E07 M08 Whitelist-Driven F050/F051/F076/F068-deprecated 共 116** + **M01 整合測試 21** + **M01-MIG Migration 測試 26**；另 F039-strategy 4 個策略場景另計）
> **M01 v2.0~v2.3 Kanban 重構 + Detail Snapshot + Signal（2026-05-21）**：新增 9 個 test spec 檔（F048/F049/F052/F061 v1.4/F077/F081/F085/F089；F050 升版 v2.2）。新增場景合計 **103 個**：F050 v2.2 +19（SS 群 12 + SIG 群 7）、F048 v2.0 新建 15（K 群 8 + 搜尋 2 + Drawer 3 + Banner 2）、F049 v1.1 新建 5（CTA-001~005）、F052 v2.1 新建 3（TXT-001~003）、F077 v1.3 新建 23（矩陣 15 + 橫切 6 + Integration 2）、F081 v1.3 新建 6（Integration 4 + Component 2）、F085 v1.3 新建 6（Integration 4 + Component 2）、F089 v1.3 新建 7（Integration 4 + Component 3）、F061 v1.4 新建 3（CTA-001~003）。Deprecated 標記：F048 v1.0 表格列 AC-1 + 頁籤 AC-5；F052 「停」縮寫按鈕斷言。
>
> **F050 v2.1.1 補強（2026-05-20）**：F050 新增 45 個場景（TS-F050-A01~K01c）：US-126 card-type dropdown 建立頁（A/D/E/H 群組）、US-127 card-type dropdown 編輯頁（I 群組）、US-128 prodBest 欄位移除（B/C/F 群組）、US-129 best_case Y/N options seed（A/G 群組）、E2E 整合（J 群組）、Regression Guard fs+regex（K 群組）。F076 v1.6 新增 3 個場景（TS-F076-009~011）：best_case Y/N seed 正確性、N 標籤覆寫驗證（UPSERT DO UPDATE）、冪等。F075 v1.6 新增 3 個場景（TS-F075-051~053）：M-A1 whitelist seed 驗證、冪等、API 整合。共 +50 個場景。
> **E07 M08 Whitelist-Driven 新增（2026-05-20）**：新增 F050 v2.1（30 場景）、F051 v2.1（19 場景）、F076 v1.5（8 場景）、F068-deprecated（9 場景）測試設計，共 66 個場景。新增 M01-whitelist-driven-integration-test.md（21 場景，含 OQ-TEST-001 caseyear wildcard 3 個 + OQ-TEST-002 _backfill_empty skip 2 個）及 M01-migration-test.md（26 場景，M1~M5）。M06-regression-guards.md 更新 v2.0（+3 個 F068 廢棄 guard）。F075 +2 個 v1.5 配套場景（TS-F075-049/050）。GAP 47/47 + §18.10 10/10 + K1~K5 100% 覆蓋。
> **E07 M06 篩選欄位管理新增（2026-05-18）**：新增 F075（POOLDATA 篩選欄位白名單管理 v1.4）測試設計，共 48 個場景。涵蓋 `GET /api/v1/pooldata-fields/available-columns` 端點（AC-10~AC-15）、`getAvailableColumns()` service 單元測試（4 場景）、`_inferSuggestedFieldType()` pure function 逐型別驗證（14 場景）、SQLite E2E 權限矩陣 / Feature Flag / 路由排序（8 場景）、PostgreSQL Test Container 過濾邏輯（2 場景）、前端 dropdown / hint 狀態機 / toast（16 場景）、跨模組整合（2 場景）、命名漂移 regression guard（2 場景）。環境策略：方案 C 分層（Guard/路由 → SQLite；過濾邏輯 → `pooldata-available-columns.integration-spec.ts`）。新增 M06 regression guard 文件（`regression/M06-regression-guards.md`）。
> **E07 M07 角色整合補修 v2.0（2026-05-16）**：business_role 合併重構對齊 AD-E07 v3.0。移除 TC-ORTHO-400~407（正交維度 section，is_sales_manager 廢棄）；TC-E02-100~108 endpoint 更名為 `/business-role`；TC-AUTH-200~205 claim 更名為 `businessRole`；Guard 更名為 DirectorOrAdminGuard / SectionChiefOrAboveGuard，移除 SalesManagerGuard 相關場景。新增：TC-MERGED（合併互斥約束，10 場景）、TC-MIG（m14 遷移，8 場景）、TC-LEGACY（legacy JWT，5 場景）、TC-DEPRECATED（廢棄端點，5 場景）。總場景數由 43 增至 63（+20）。Fixture builder 更新：新增 buildLegacyUser()、移除 buildUserOrthogonalSectionChief() / buildUserWithSalesManagerFlag() / buildUserE07Null()，更名 buildDirectorUser / buildSectionChiefUser / buildRegularUser。新增開放問題 OQ-MIG-001 / OQ-DEPR-001。
> **E07 M07 角色整合 v1.0（2026-05-16）**：初版 43 場景，涵蓋 PATCH `/accounts/:id/e07-role` 端點（TC-E02-100~112）、JWT payload e07_role claim（TC-AUTH-200~205）、Guard 單元測試（TC-GUARD-300~315）、正交維度 regression（TC-ORTHO-400~407）
> **E07 M02 計分設定新增（2026-05-13）**：新增 F053（查看計分維度，13 場景）、F054（編輯計分維度與分數，24 場景）、F055（編輯 CARD_LEVEL 門檻，21 場景）、F056（編輯 TIER_LEVEL 對應表，28 場景），涵蓋覆寫式編輯語意、月跑鎖（pending/running）、稽核 log before/after、Fallback CARD_TYPE（M5/M3/HC/C3）、fn_calc_tier_level NULL fallback 跨層整合、S5 兩級 vs H 四級等級數差異、BR-9 card_level 長度驗證、PUT/POST 端點語意分離
> **F002SM 新增（2026-05-13）**：新增 Sales Manager 旗標顯示於 Top Bar 測試設計（25 場景），涵蓋後端 Login API `isSalesManager` 欄位補充、Frontend TopBar Badge 元件、JWT payload 驗證、edge case（舊 token / 旗標升降級）
> **E06 Customer 360 新增（2026-04-13）**：新增 F046（客戶搜尋與清單，31 場景）與 F047（單一客戶詳情，38 場景），涵蓋 Full-Text Search、精確比對、遮罩規則（Admin/User）、風控旗標高亮、ETL 資料新鮮度、客戶類型適應顯示、404 錯誤處理
> **E06 角色精簡更新（2026-04-13）**：US-017 角色從 8 種（2 系統角色 + 6 業務角色）精簡為 2 種（admin / user）。F045 更新（15→13 場景）；F004 精簡（14→9 場景）；F005 精簡（14→10 場景）；F008 精簡（20→12 場景）；移除業務角色相關測試案例
> **F029/F043 更新（2026-03-31）**：新增 Lookup 節點雙輸入重設計測試：F029 補充 6 個前端 Lookup UI 場景（TS-F029-032~037，31→37 場景），F043 補充 14 個 LookupExecutor 場景（TS-F043-045~058，44→58 場景），涵蓋 US-042 AC-7a~7d 與 US-058 AC-1~6
> **F042~F044 新增**：2026-03-27 新增 ETL 執行引擎測試設計：F042 核心框架（21 場景）、F043 節點執行器（44 場景）、F044 Target Load（17 場景）
> **F039~F041 新增**：2026-03-27 新增 ETL Pipeline 編輯器「節點欄位變化」測試設計：F039 Badge（22 場景）、F040 Inspector Diff（6 場景）、F041 Tooltip（12 場景）
> **F036 更新**：2026-03-25 依 US-049 修訂版重新設計，目標表由 4 個改為 1 個（customer_core，85 欄位），場景數由 20 增至 40（新增 ETL 轉換規則、衝突解決、前端介面測試）
> **最後更新**：2026-05-13

---

## 1. 範圍總覽

### 涵蓋範圍

- 45 個 Feature（F001–F026、F027、F028、F029、F030、F031、F032、F033、F034、F035、F036、F037、F038、F045、F046、F047、F053–F056），分屬 7 個 Epic（F038 跨 E04/E05）：
  - **E01 驗證與登入**：F001、F002、F003
  - **E02 帳號與角色管理**：F004、F005、F006、F007、F008、F009、F010、F045
  - **E03 資料來源管理**：F011、F012、F013、F014、F015、F016
  - **E04 資料擷取**：F017、F018、F019、F020、F021、F022、F023、F024、F025、F026
  - **E05 ETL Pipeline 管理**：F027、F028、F029、F030、F031、F032、F033、F034、F035、F036、F037
  - **E04+E05 系統啟動修復**：F038（孤兒任務回收，跨 E04/E05）
  - **E06 Customer 360**：F046（客戶搜尋與清單）、F047（單一客戶詳情）
  - **E07 客戶名單分派（M01 名單定義）**：F048（查看本月名單清單 Kanban v2.0）、F049（Stage 0 每日估算 v1.1）、F050（新增名單定義 v2.2）、F051（編輯名單定義 v2.1）、F052（停用名單定義 v2.1）、F061（月跑計分執行 v1.4）、F077（月份切換與五階段總覽 v1.3）、F081（Rollback 至草稿 v1.3）、F085（Rollback 至部門比例 v1.3）、F089（Rollback 至簽核 v1.3）
  - **E07 客戶名單分派（M02 計分設定）**：F053（查看計分維度）、F054（編輯計分維度與分數）、F055（編輯 CARD_LEVEL 門檻）、F056（編輯 TIER_LEVEL 對應表）
  - **E07 客戶名單分派（M06 篩選欄位管理）**：F075（POOLDATA 篩選欄位白名單管理 v1.6）、F076（類別型欄位可選值管理 v1.6）
  - **E07 客戶名單分派（M07 角色整合）**：F073/F074（E02 角色整合）
- 2 項非功能需求（NFR-001 安全性、NFR-002 效能），共 10 個子需求（含 NFR-002.6 E04 清單、NFR-002.7 E04 儀表板、NFR-002.8 E04 排程；新增 F026 raw data 預覽效能）
- 65 個錯誤碼的驗證覆蓋（新增 C360_CUSTOMER_NOT_FOUND、C360_SEARCH_MIN_LENGTH for E06；新增 PIPELINE_VERSION_ALREADY_PUBLISHED for F037；累計含 PIPELINE_VERSION_NOT_FOUND、PIPELINE_PUBLISH_REQUIRES_TEST、PIPELINE_INVALID_CONNECTION、PIPELINE_NAME_EXISTS、PIPELINE_NOT_FOUND、PIPELINE_RUNNING、PIPELINE_NO_DEFINITION、PIPELINE_DRAFT_CANNOT_ENABLE、PIPELINE_TARGET_TABLE_NOT_FOUND、VALIDATION_INVALID_CRON、DATASOURCE_SCHEMA_LOAD_FAILED、DATASOURCE_TABLE_LOAD_FAILED、EXTRACTION_RAW_TABLE_NOT_FOUND、EXTRACTION_TABLE_CREATE_FAILED、EXTRACTION_BATCH_WRITE_FAILED）

### 排除項目

- Phase 2 功能（SSO/LDAP、進階稽核日誌、連線池）
- 帳號鎖定機制（MVP 不提供）
- CSV 批量帳號匯入
- 特定技術棧的實作測試（規格維持技術中立）

### 假設

- JWT 為 Session 管理的唯一機制
- 系統共有 2 種角色：admin、user，均為 Seed Data，不開放 Admin 自訂新增或刪除（US-017）
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
| F002SM | Sales Manager 旗標顯示於 Top Bar | P0-MVP | [F002SM-test.md](features/F002SM-test.md) | 25 | Draft |
| F003 | 登出 | P0-MVP | [F003-test.md](features/F003-test.md) | 6 | Draft |
| F004 | 建立帳號 | P0-MVP | [F004-test.md](features/F004-test.md) | 9 | Draft |
| F005 | 查看帳號清單 | P0-MVP | [F005-test.md](features/F005-test.md) | 10 | Draft |
| F006 | 編輯帳號 | P0-MVP | [F006-test.md](features/F006-test.md) | 8 | Draft |
| F007 | 停用／啟用帳號 | P1 | [F007-test.md](features/F007-test.md) | 7 | Draft |
| F008 | 指派／變更角色 | P0-MVP | [F008-test.md](features/F008-test.md) | 12 | Draft |
| F045 | 系統角色定義（系統預設角色） | P0-MVP | [F045-test.md](features/F045-test.md) | 13 | Draft |
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
| **E05 ETL Pipeline 管理** | | | | | |
| F027 | 查看 Pipeline 列表 | P0-MVP | [F027-test.md](features/F027-test.md) | 22 | Draft |
| F028 | 建立 Pipeline | P0-MVP | [F028-test.md](features/F028-test.md) | 17 | Draft |
| F029 | 視覺化轉換編輯器 | P0-MVP | [F029-test.md](features/F029-test.md) | 37 | Draft |
| F030 | 執行 Pipeline | P0-MVP | [F030-test.md](features/F030-test.md) | 20 | Draft |
| F031 | 啟用／停用 Pipeline | P0-MVP | [F031-test.md](features/F031-test.md) | 14 | Draft |
| F032 | 查看 Pipeline 日誌 | P0-MVP | [F032-test.md](features/F032-test.md) | 21 | Draft |
| F033 | Pipeline 版本管理 | P1 | [F033-test.md](features/F033-test.md) | 29 | Draft |
| F034 | 刪除 Pipeline | P1 | [F034-test.md](features/F034-test.md) | 15 | Draft |
| F035 | Pipeline 監控儀表板 | P1 | [F035-test.md](features/F035-test.md) | 21 | Draft |
| F036 | 目標表 Domain-Oriented 規劃 | P0-MVP | [F036-test.md](features/F036-test.md) | 40 | Draft |
| F037 | 發布 Pipeline 版本 | P0-MVP | [F037-test.md](features/F037-test.md) | 37 | Draft |
| **E05 小計** | | | **11 files** | **273** | |
| **E04+E05 系統啟動修復** | | | | | |
| F038 | 孤兒任務回收（系統啟動時自動修復 running 狀態） | P0-MVP | [F038-test.md](features/F038-test.md) | 45 | Draft |
| **ETL Editor 前端功能** | | | | | |
| F039 | 節點欄位變化統計 Badge | P0-MVP | [F039-test.md](features/F039-test.md) + [F039-test-strategy.md](features/F039-test-strategy.md) | 22 | Draft |
| F040 | Inspector Panel 欄位 Diff | P1 | [F040-test.md](features/F040-test.md) | 6 | Draft |
| F041 | Badge Hover Tooltip | P2 | [F041-test.md](features/F041-test.md) | 12 | Draft |
| **E05 ETL 執行引擎** | | | | | |
| F042 | ETL 執行引擎核心框架 | P0-MVP | [F042-test.md](features/F042-test.md) | 21 | Draft |
| F043 | ETL 節點執行器（8 種節點含 Lookup） | P0-MVP | [F043-test.md](features/F043-test.md) | 58 | Draft |
| F044 | ETL Target Load + UPSERT | P0-MVP | [F044-test.md](features/F044-test.md) | 17 | Draft |
| **E06 Customer 360** | | | | | |
| F046 | Customer 360 — 客戶搜尋與清單 | P0-MVP | [F046-test.md](features/F046-test.md) | 31 | Draft |
| F047 | Customer 360 — 單一客戶詳情 | P0-MVP | [F047-test.md](features/F047-test.md) | 38 | Draft |
| **E06 小計** | | | **2 files** | **69** | |
| **E07 M02 計分設定** | | | | | |
| F053 | 查看計分維度設定 | P0-MVP | [F053-test.md](features/F053-test.md) | 13 | Draft |
| F054 | 編輯計分維度與分數 | P0-MVP | [F054-test.md](features/F054-test.md) | 24 | Draft |
| F055 | 編輯 CARD_LEVEL 分級門檻 | P0-MVP | [F055-test.md](features/F055-test.md) | 21 | Draft |
| F056 | 編輯 TIER_LEVEL 對應表 | P0-MVP | [F056-test.md](features/F056-test.md) | 28 | Draft |
| **E07 M02 小計** | | | **4 files** | **86** | |
| **E07 M07 角色整合（E02 整合）** | | | | | |
| F073-F074-E02 | E07 角色指派 E02 整合（PATCH /business-role / Guard / JWT / 合併約束 / m14 遷移 / legacy / deprecated） | P0-MVP | [F073-F074-e02-integration-test.md](features/F073-F074-e02-integration-test.md) | 63 | Draft |
| **E07 M07 小計** | | | **1 file** | **63** | |
| **E07 M06 篩選欄位管理** | | | | | |
| F075 | POOLDATA 篩選欄位白名單管理（含 v1.4 available-columns 端點、suggestedFieldType 推斷、dropdown Modal；v1.5 +2 場景；v1.6 +3 場景 M-A1 seed 配套） | P0-MVP | [F075-test.md](features/F075-test.md) | 53 | Draft |
| **E07 M06 小計** | | | **1 file** | **53** | |
| **E07 M08 Whitelist-Driven 重構** | | | | | |
| F050 | 建立名單定義（v2.1 whitelist-driven condition_payload；v2.1.1 +45 場景：US-126/127/128/129 card-type dropdown、prodBest 移除、best_case seed） | P0-MVP | [F050-test.md](features/F050-test.md) | 75 | Draft |
| F051 | 編輯名單定義（v2.1 whitelist-driven condition_payload） | P0-MVP | [F051-test.md](features/F051-test.md) | 19 | Draft |
| F076 | 類別型欄位可選值管理（v1.5 seed 重構 +8 場景；v1.6 +3 場景 best_case Y/N options 配套） | P0-MVP | [F076-test.md](features/F076-test.md) | 11 | Draft |
| F068-deprecated | 指派代碼查詢（已廢棄，9 個廢棄驗證場景） | P0-MVP | [F068-deprecated-test.md](features/F068-deprecated-test.md) | 9 | Draft |
| M01-INT | Whitelist-Driven 條件 Payload 端對端整合測試（含 OQ-TEST-001/002） | P0-MVP | [integration/M01-whitelist-driven-integration-test.md](integration/M01-whitelist-driven-integration-test.md) | 21 | Draft |
| M01-MIG | F050 v2.1 Migration M1~M5 測試設計 | P0-MVP | [migration/M01-migration-test.md](migration/M01-migration-test.md) | 26 | Draft |
| **E07 M08 小計** | | | **6 files** | **161** | |
| **總合計** | | | **60 files** | **1169** | |

---

## 3. 自動化就緒度評估

### 適合自動化的場景

| 類別 | 場景數 | 說明 |
|------|--------|------|
| API 端點測試（Unit + Integration） | ~192 | 所有 CRUD 操作、驗證邏輯、錯誤碼回傳（含 E04 擷取任務 API、F026 raw data 預覽 API、新增 GET /datasources/:id/schemas 及 GET /datasources/:id/schemas/:schema/tables；新增 F027 統計 API 與列表 API；新增 F029 GET/PUT definition API、GET raw-tables API；新增 F033 版本清單/詳情/Diff/回滾/發布 5 個端點，涵蓋 PIPELINE_VERSION_NOT_FOUND 與 PIPELINE_PUBLISH_REQUIRES_TEST 錯誤碼；新增 F037 PATCH publish 端點，涵蓋 PIPELINE_VERSION_ALREADY_PUBLISHED 錯誤碼） |
| 安全性測試（RBAC / Token / SQL Injection） | ~26 | 角色權限驗證、Token 失效、輸入消毒；新增 raw data 表名安全（BR-13）與欄位名稱 sanitize；F027 RBAC（User 403）；F029 RBAC（User 403 for GET/PUT definition）；F033 RBAC（User 403 for 全部版本管理端點） |
| 資料驗證（邊界值、格式） | ~26 | 密碼長度、Port 範圍、Email 格式、cron 格式；新增 F026 分頁 limit 白名單驗證；F027 todayProcessed 時區邊界；F029 changeSummary 500 字元邊界 |
| 排程邏輯測試（E04） | ~8 | 使用 scanAndExecute(fakeNow) injectable time 參數直接呼叫排程邏輯 |
| raw data 落地驗證（E04 F021） | ~12 | 動態建表、批次寫入、全量 TRUNCATE、增量追加，使用 Test Container 驗證 AppDB 資料 |
| F026 raw data 預覽 API | ~16 | 分頁、排序、錯誤碼；使用 Test Container 建立受控 raw data 表 |
| F042 ETL 執行引擎核心單元測試 | ~14 | 拓撲排序、Dispatcher 分派、輸入收集邏輯、記憶體回收均為純函數，不需 DB，可全部自動化 |
| F042 節點狀態回寫整合測試 | ~7 | 需要 Test Container 驗證 node_logs 即時回寫 DB；含 running/completed/failed/skipped 狀態轉移 |
| F043 節點執行器單元測試 | ~52 | 除 RawDataExtract 外，其他 7 種節點（含 Lookup）均為 In-Memory 純函數，全部可不依賴 DB 自動化；Lookup 向下相容模式需 Mock queryRunner（~10 場景） |
| F043 RawDataExtract 整合測試 | ~4 | 需 Mock queryRunner 或 Test Container 驗證批次 SELECT 與表存在性檢查 |
| F043 LookupExecutor 整合測試 | ~2 | TS-F043-058（扇出場景）需 F042 ExecutionEngine 框架支援，屬整合測試範疇 |
| F044 Target Load 整合測試 | ~13 | UPSERT INSERT/UPDATE、customer_id 不覆蓋、ETL 追蹤欄位、批次邊界均需 Test Container |

### 需手動或半自動測試的場景

| 類別 | 場景數 | 說明 |
|------|--------|------|
| E2E 瀏覽器流程 | ~18 | 完整登入→操作→登出流程；新增 F026 從日誌 Drawer 導航至預覽頁面的 E2E 流程；新增 F029 視覺化編輯器前端場景（未儲存離開確認對話框、非法連線視覺提示） |
| 視覺驗證 | ~8 | 儀表板圖表渲染、狀態色彩標示；F026 水平捲動表格；F027 狀態 Badge 顏色；F029 畫布節點顏色/圖示（Extract=藍色、Transform=橘色、Load=綠色）、連線箭頭、紅色非法連線提示 |
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
| 時區（E04 / E05） | F018 今日統計、F024 今日統計、F027 todayProcessed | todayInTaipei() 種子資料工廠函式，CI 設定 TZ=Asia/Taipei |
| 視覺化畫布函式庫（F029） | F029 前端 E2E 場景（TS-F029-029 ~ 031） | 依賴 React Flow（或同等函式庫）；建議搭配 Playwright 或 Cypress 進行拖拉操作模擬 |
| ETL 執行引擎（F042-F044） | 節點狀態回寫、UPSERT 寫入、customer_core 驗證 | Test Container（AppDB PostgreSQL）；F043 RawDataExtract 需額外 raw table 模擬；F044 部分批次失敗需 Mock queryRunner 或注入錯誤觸發機制 |

---

## 4. Agent Loading Guide

### TDD Developer Agent

**必讀檔案：**
1. `test-index.md`（本文件）— 瞭解整體範圍與優先級
2. 對應的 `features/F###-test.md` — 取得具體測試場景

**建議載入順序：** F001 → F002 → **F002SM** → F003 → **F045** → F004 → F005 → F006 → F008 → **F073-F074-E02**（E07 角色整合先行，Guard 設計影響後續 E07 實作） → F009 → F010 → F007 → F011 → F012 → F013 → F015 → F014 → F016 → F017 → F018 → F019 → F020 → F021 → F022 → F023 → F024 → F025 → F026 → F027 → F028 → F029 → F030 → F031 → F032 → F033 → F037 → F034 → F035 → F036 → F038 → F042 → F043 → F044 → **F046 → F047** → **F053 → F054 → F055 → F056** → **F075**

**F002SM Sales Manager Badge 特殊注意：**
- 後端 `LoginResult.user` DTO 須補充 `isSalesManager: boolean`；TS-F002SM-001 / TS-F002SM-006 驗證欄位存在性與 boolean 型別（不可為字串）
- 前端 auth-store `User` interface 須新增 `isSalesManager?: boolean`（optional，相容舊 token）
- Badge className 必須完整符合 prototype 27 line 123：`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-50 text-warning rounded-md border border-amber-200`；`text-warning` 非標準 Tailwind class，需確認 tailwind.config 已定義（RISK-F002SM-004）
- DOM 不渲染原則：TS-F002SM-010 ~ 013 驗證 `false` / `undefined` / `null` / admin 角色時 badge 元素在 DOM 中完全不存在，非 `display:none`
- 建議 Badge 元素掛 `data-testid="sales-manager-badge"` 供自動化定位
- 種子帳號：manager@cdmp.test / P@ssw0rd123（role=user, is_sales_manager=true）已存在於 dev seed

**E07 M07 角色整合特殊注意（F073-F074-E02，v2.0 AD-E07 v3.0 對齊）：**
- **重構重點**：`is_sales_manager` + `e07_role` 已合併為 `business_role` enum；SalesManagerGuard 廢棄；Guard 名稱更名為 DirectorOrAdminGuard / SectionChiefOrAboveGuard
- **端點更名**：PATCH `/accounts/:id/business-role`（舊 `/e07-role` 已廢棄，TC-DEPRECATED-002 驗證回 404）
- **JWT claim 更名**：`businessRole`（舊 `e07_role` claim 不再出現）
- **廢棄端點 regression**：TC-DEPRECATED-001~005 含 Static Analysis grep test，確認 SalesManagerGuard / is_sales_manager / e07_role 在 src/ 為零存在
- **Fixture 更新**：使用 buildAdminUser / buildDirectorUser / buildSectionChiefUser / buildRegularUser / buildLegacyUser；移除 buildUserOrthogonalSectionChief（正交已廢棄）
- **Legacy JWT**：TC-LEGACY-001~005 驗證無 businessRole claim 的舊 token 不導致 500；TC-LEGACY-003 確認 admin role bypass 仍有效（不依賴 claim）
- **m14 遷移隔離**：TC-MIG-m14-001~008 需獨立 migration test DB（與主 test suite 隔離，確保 schema 狀態可控）
- **冪等性行為（TC-E02-103）**：待 OQ-E02-001 確認；TDD Developer 需在 F073 v1.2 更新後才能最終實作
- **三欄位原子性（TC-E02-100~102）**：須在同一斷言中驗證 `business_role` + `password_changed_at` + audit_log 同時更新（transaction 原子性保證）

**E02 角色定義特殊注意（F045 / F004 / F005 / F008）：**
- F045 必須先於 F004/F005/F008 載入：F045 的 Seed Data 初始化（TS-F045-001）是後三者所有角色相關測試的前置條件
- 系統角色僅有 2 種：admin、user；role_code 超出此範圍回傳 422 VALIDATION_INVALID_ROLE
- F005 角色篩選 `?role=` 參數支援 admin / user；回傳欄位格式為 `{ roleCode, displayName }` 而非單純字串
- F008 最後 Admin 保護（AC-2）：系統僅 1 個 Admin 時，降級為 user 回傳 HTTP 422 ACCOUNT_LAST_ADMIN
- F008 前端確認對話框（TS-F008-FE-002）：對話框須顯示中文顯示名稱（含括號別名），不顯示 role_code

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

**E05 ETL Pipeline 管理特殊注意（F027 / F030 / F031 / F032 / F033 / F035）：**
- F027 todayProcessed 時區邊界測試與 F018/F024 相同，使用 `todayInTaipei()` 工廠函式，CI 設定 TZ=Asia/Taipei
- F027 統計卡片需驗證 total = active + running + draft + failed + disabled（數值一致性）
- F027 軟刪除驗證：stats API（total）與列表 data 兩處均不能出現 deleted_at IS NOT NULL 的記錄
- F027 伺服器錯誤降級：stub DB 拋出例外，驗證回傳 SYSTEM_INTERNAL_ERROR 且不含 stack trace
- F030 排程測試使用 `scanAndExecute(fakeNow: Date)` injectable time 參數（與 F023 相同模式，不依賴真實計時器）
- F030 非同步執行使用 `waitForPipelineStatus(logId, expectedStatus, timeoutMs=10000)` polling helper（interval=300ms）
- F030 測試執行（is_test_run=true）的 processed_count 不計入 EtlPipeline.processed_count 累計；EtlPipelineVersion.status 成功後從 draft 更新為 testing
- F030 狀態回歸驗證：active→running→active（執行成功）；draft→running→draft（測試執行成功）；running→failed（執行失敗）
- F031 排程引擎測試 seam：停用（removeJob）與啟用（addJob/registerJob）的排程引擎呼叫需透過 spy/mock 驗證；排程引擎若無法注入，TS-F031-002 / TS-F031-004 / TS-F031-006 應退為手動整合測試
- F031 冪等性行為：對已 disabled 的 Pipeline 再送出 enabled=false 的預期結果未定義，需向 Architecture 確認後補充場景
- F031 狀態轉換邊界：`draft → disabled` 是否允許、以及 running Pipeline 的後端 toggle 防護均為待確認項目（見 F031-test.md Risks and Notes）
- F032 軟刪除 Pipeline 日誌存取（BR-5 vs PIPELINE_NOT_FOUND）：`GET /api/v1/etl/pipelines/:id/logs` 在 Pipeline 已軟刪除時，規格 BR-5 說明日誌不清除，但錯誤碼表定義「已刪除」回傳 404；兩者衝突，需向 Architecture 確認（見 TS-F032-015）
- F032 logId 不存在的錯誤碼（TS-F032-018）：`GET /api/v1/etl/logs/:logId` 的 404 錯誤碼未定義（PIPELINE_LOG_NOT_FOUND vs PIPELINE_NOT_FOUND），需向 Architecture 確認後補充
- F032 nodeLogs 節點排列順序：規格未說明是按 definition 節點順序或實際執行起始時間排列，需確認後更新 TS-F032-006 驗證邏輯
- F035 儀表板統計（stats / trend / failures / slowest）均須排除 `is_test_run = true` 的 EtlPipelineLog；測試資料集必須同時含兩種 is_test_run 值以驗證隔離邏輯
- F035 今日統計時區邊界：今日 / 昨日邊界種子資料使用 `todayInTaipei()` 工廠函式，CI 設定 TZ=Asia/Taipei（與 F018/F024/F027 相同模式）
- F035 Polling 測試（TS-F035-021）：使用 fake timer（sinon / jest fake timers）控制 5 秒間隔，不依賴真實計時器
- F035 progressPercent 邊界：totalCount=0 時 progressPercent=0.0，不發生除以零錯誤（TS-F035-016）
- F035 successRate 精度：保留一位小數且四捨五入（75.0、88.9），分母為零時回傳 0.0（TS-F035-020）
- F033 版本清單（GET /versions）不含 `definition` 欄位；版本詳情（GET /versions/:versionId）才回傳完整 JSONB definition
- F033 Diff API 路由：`GET /versions/diff?from=N&to=M`；路由器需確保 "diff" 字串不被誤解為 versionId（路由優先順序需在實作層驗證）
- F033 回滾（POST /versions/:versionId/rollback）建立新版本，版本號為現有最大版本號 + 1；changeSummary 格式為「回滾自版本 N」
- F033 發布前置條件：版本 status 必須為 "testing"（代表已有 is_test_run=true AND status="completed" 的 EtlPipelineLog），否則回傳 PIPELINE_PUBLISH_REQUIRES_TEST（422）
- F033 發布後需驗證兩處：etl_pipeline_versions.status="published" 且 etl_pipelines.version=新版本號（BR-6）
- F033 發布新版本不改變舊 published 版本狀態（同一 Pipeline 可同時有多個 published 版本，排程以最大 version 號為準）
- F033 排程引擎選版本邏輯（TS-F033-017）：以 version 欄位最大值（非 created_at）選取最新 published 版本，與 F030 TS-F030-010 相同模式
- F037 發布版本（PATCH /versions/:versionId/publish）：僅允許 testing 狀態版本發布；draft → 422 PIPELINE_PUBLISH_REQUIRES_TEST；published → 422 PIPELINE_VERSION_ALREADY_PUBLISHED（新增錯誤碼）
- F037 Transaction 原子性（TS-F037-003 / TS-F037-020）：version.status 更新與 pipeline.version 更新必須在同一 Transaction；失敗需完整回滾，驗證需使用 Test Container（不可純 mock）
- F037 published_at 欄位：現有 EtlPipelineVersion entity 僅有 created_at，規格回應含 publishedAt 欄位；實作前需確認是否新增欄位或重用 created_at，已列為 Risks
- F037 前端 Toast 計時器（TS-F037-032）：使用 fake timer 控制 3 秒，不依賴真實計時器
- F037 端到端發布→啟用流程（TS-F037-008）：驗證發布後 F031 toggle 不再阻擋（PIPELINE_DRAFT_CANNOT_ENABLE 消除）

**E05 ETL Pipeline 管理特殊注意（F029）：**
- F029 連線驗證（BR-2 ~ BR-5）在後端 PUT definition 時執行：Extract 只能連 Transform；Transform 可連 Transform 或 Load；Load 為終端節點；禁止逆向循環連線
- F029 連線驗證錯誤碼：PIPELINE_INVALID_CONNECTION（HTTP 422），detail 欄位說明具體違反規則
- F029 step_count 更新（BR-6）：每次 PUT definition 後，etl_pipelines.step_count = definition.nodes.length；需同時驗證 API 回應 stepCount 與 DB 欄位
- F029 Transform 節點採樣策略：13 種 Transform 節點中，Lookup 已因雙輸入重設計（US-042 AC-7a~7d）提升為獨立覆蓋（TS-F029-032~037）；其餘採樣 Merge、Filter、Masking 三種進行 JSONB 儲存/還原完整性驗證（TS-F029-019~021），其餘 9 種節點結構以規格文件為準
- F029 重複 Extract 來源（BR-8 邊界）：同一 rawTableId 出現兩次時回傳 PIPELINE_INVALID_CONNECTION（422）；需向 Arch 確認是否有獨立錯誤碼
- F029 前端 E2E 場景（TS-F029-029 ~ 031、TS-F029-032 ~ 036）：依賴畫布函式庫（建議 React Flow）行為，需搭配 Playwright/Cypress 執行
- F029 changeSummary 邊界：500 字元合法（TS-F029-027），501 字元回傳 VALIDATION_ERROR（TS-F029-028）
- **F029 Lookup 雙輸入 UI（US-042 AC-7a~7d，2026-03-31 新增）**：
  - TS-F029-032：Lookup 節點兩個輸入端口（main-input top:33%, lookup-input top:67%）
  - TS-F029-033：lookup-input 連線後 edge 含 `targetHandle:"lookup-input"`；連線視覺樣式須與主資料流區別
  - TS-F029-034：雙輸入模式時 `lookupSource` / `lookupFilter` **不渲染於 DOM**（非 CSS 隱藏）
  - TS-F029-035：向下相容模式顯示 `lookupSource` / `lookupFilter` 及升級提示訊息
  - TS-F029-036：刪除 lookup-input 連線後面板自動回到向下相容模式
  - TS-F029-037：雙輸入模式 Lookup JSONB 儲存與還原（Integration，需驗證 edge.targetHandle="lookup-input"）

**E05 ETL 執行引擎特殊注意（F042 / F043 / F044）：**
- F042 拓撲排序與 Dispatcher 分派邏輯為純函數，不需 DB，可直接以 Vitest 進行單元測試，不需 Test Container
- F042 節點狀態回寫整合測試需使用 Test Container（AppDB PostgreSQL），驗證 running/completed/failed/skipped 四種 node_logs 狀態轉移
- F042 循環依賴偵測：排序結果長度 < 節點總數即為循環，驗證 error_message 包含「循環依賴」字樣
- F043 RawDataExtractExecutor：Mock queryRunner.query 時需分別 Mock 表存在性查詢（information_schema）與資料查詢（SELECT *）兩種 SQL 行為
- F043 MergeExecutor：FULL JOIN 欄位命名規則為左側欄位保留原名，右側衝突欄位加 `_right` 後綴；JOIN key 同名時僅保留一個欄位（取非 null 者，left 優先）
- F043 DedupExecutor：null timestampColumn 視為最舊（排在最後，不被保留）；時間戳相同時保留 index 最小者
- F043 DerivedFieldExecutor：gen_random_uuid 每列產生獨立 UUID，不可複用；CASE WHEN 中 `right.{col}` 對應 `{col}_right` 欄位（_right 後綴為 merge 節點輸出的欄位命名慣例）
- **F043 LookupExecutor（US-058，2026-03-31 新增）**：
  - 雙輸入模式（TS-F043-045~049）：`inputs['lookup-input']` 存在時，LEFT JOIN 純記憶體執行，不查詢 DB；重複 key 取首筆；null key 無匹配補 null；空對照集全部補 null
  - 向下相容模式（TS-F043-050~052）：`inputs['lookup-input']` 不存在時，Mock queryRunner.query 回傳 lookupSource 表資料；lookupFilter 空字串時不加 WHERE
  - 模式切換驗證（TS-F043-053~054）：舊版 Pipeline 定義可正常執行；雙輸入模式下 queryRunner 不被呼叫
  - 錯誤處理（TS-F043-055~057）：主資料流缺失 → `inputs` 無 `default` 亦無 `main-input`；matchColumn 不存在 → message 含欄位名與「主資料集」；lookupMatchColumn 不存在 → message 含欄位名與「對照資料集」
  - 扇出整合測試（TS-F043-058）：1 Extract → 3 Filter → 3 Lookup（各自 lookup-input 獨立）；需 F042 ExecutionEngine 框架支援
- F044 TargetLoadExecutor：customer_id 不在 DO UPDATE SET 中（保留原值）；_etl_loaded_at 與 _etl_pipeline_id 由引擎自動附加，不從輸入資料列取得
- F044 批次大小公式：`actualBatchSize = min(configuredBatchSize, floor(65535 / columnsPerRow))`；customer_core 欄位數 85，實際 batch size = 771
- F044 部分批次失敗：已寫入批次不回滾，outputRowCount 記錄已成功筆數；需注入錯誤機制（Mock queryRunner.query 在第 N 次呼叫拋錯）
- F044 is_test_run=true：目標表存在性仍需驗證（步驟 1-2 執行），僅跳過 UPSERT SQL（步驟 4-8）

**F038 孤兒任務回收特殊注意（跨 E04/E05）：**
- F038 無 HTTP 端點，測試入口為 `OrphanRecoveryService.onApplicationBootstrap()`
- Unit 測試使用 Jest + mock Repository（4 個）+ mock DataSource；Integration 測試使用 Test Container PostgreSQL（僅 AppDB，無需外部 DB）
- Integration 測試需透過 `@nestjs/testing` 的 `Test.createTestingModule()` 建立完整模組，不可直接 `new OrphanRecoveryService()`
- `duration_ms` 計算使用 PostgreSQL 專屬語法 `EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000`，SQLite 不相容；Integration 測試只驗證 `IS NOT NULL`（不驗證精確值），需使用 Test Container PostgreSQL
- `etl_pipelines` 無 `error_message` 欄位（BR-10）：測試需驗證 update `.set()` 中**不含** `error_message` 鍵
- E04 和 E05 回收各自獨立 Transaction；E04 失敗不阻斷 E05，測試需覆蓋雙向獨立失敗場景（TS-F038-021, TS-F038-022）
- 冪等性測試（TS-F038-027, TS-F038-044）：第二次執行時 DB 中無 `status='running'` 記錄，回收靜默通過，驗證無副作用
- Module 順序驗證（TS-F038-040）：`AppModule.imports` 中 `OrphanRecoveryModule` 必須在 `SchedulerModule` 之前（架構靜態驗證）
- 回收後操作驗證（TS-F038-041 ~ 043）：觸發 `triggerRun`、`deleteTask`、`triggerExecute` 時不應再拋出 `EXTRACTION_RUNNING` / `PIPELINE_RUNNING`，需依賴 E04 和 E05 的業務 Service

**E06 Customer 360 特殊注意（F046 / F047）：**
- F046 前置條件：GIN 全文搜尋索引（AddCustomerCoreFullTextIndex Migration）必須在測試環境執行完畢，否則 Full-Text Search 場景（TS-F046-004、TS-F046-005、TS-F046-010）將失敗
- F046 / F047 遮罩測試：需分別建立 Admin Token 與 User Token 兩組種子帳號（與 E01 相同模式）；遮罩邏輯在 API 層（Service/Serializer）處理，前端直接渲染 API 回傳值
- F046 搜尋優先邏輯（BR-3）：同時傳入 keyword 與 idNumber 時，idNumber 優先；TS-F046-007 需種子資料同時含符合 keyword 但不符合 idNumber 的客戶，才能驗證 keyword 確實被忽略
- F046 type 篩選：後端 API 查詢（非前端本地過濾）；前端測試需以 spy 驗證 API 呼叫含正確 type 參數
- F047 欄位映射：85 欄位分 8 個分類（A=5、B=13、C=10、D=10、E=12、F=14、G=15、H=5）；欄位名稱使用 camelCase；時間欄位回傳 ISO 8601 UTC 格式
- F047 風控旗標：只以 CHAR(1) 值 `'Y'`（大寫）觸發警告色 Badge；`'N'`、`'1'`、null 均不觸發；address_anomaly_flag 與 mainland_flag（SMALLINT 型別）不列入風控高亮
- F047 資料新鮮度：計算公式 `Math.ceil((now - _etl_loaded_at) / (24 * 60 * 60 * 1000))`；前端測試使用 clock mock 控制當前時間；閾值為 7 天（超過則顯示警告）
- F047 客戶類型適應：customer_type_code='01'（個人）與 '04'（外籍）均在 G 分類顯示「本分類不適用」；'02'（企業）才顯示企業欄位
- F046 / F047 共用遮罩函式：maskIdNumber（前 3 + 後 2）、maskPhone（前 4 + 後 2）、maskEmail（@ 前保留前 2 字元）；NULL 值回傳 null，不套用遮罩
- F047 UUID 路徑參數驗證：非 UUID 格式的 customerId（如 'invalid-id'）應回傳 400 或 422，不得回傳 500

**E07 M02 計分設定特殊注意（F053 / F054 / F055 / F056）：**
- 所有 E07 計分設定 API 均需 `is_sales_manager = true`（SalesManagerGuard + @RequireSalesManager()）；非 Sales Manager Token 回傳 403 AUTH_FORBIDDEN
- 月跑鎖適用 F054 / F055 / F056 的全部寫入端點：`assignment_run.status IN ('pending', 'running')` 時回 409 SCORING_VERSION_LOCKED；兩種狀態均需各自測試（TS-F054-010/011、TS-F055-007/008、TS-F056-010/011）
- ob_levelcard_column.status 欄位由 Migration 1711360000143 補建（VARCHAR(10) NOT NULL DEFAULT 'active'）；測試 seed 不依賴 dev DB 狀態，直接植入已知 status 值
- ob_levelcard_version 的 active 判斷以 `status='active'` 為準（非 sdate/edate 計算），seed 直接寫 status='active'，避免時鐘依賴
- F054 PUT 覆寫語意：card_version 不遞增（BR-2，dump 觀察 6 種 CARD_TYPE 均為 v1）；TS-F054-001 需顯式驗證 DB card_version 仍為 1
- F055 等級數差異：S5 型 2 級（A/B）vs H/S/E/E5/M 型 4 級（A/B/C/D）；TS-F055-002/004 使用 S5 seed，驗證 API/UI 不硬編碼 4 級邏輯
- F055 PUT 依 `(card_type, card_version, card_level)` 三欄定位 UPDATE，不傳 surrogate id；TS-F055-005 顯式驗證此行為
- F055 preview 快取（BR-2，60 秒）：CI 只驗計算正確性（TS-F055-013/014）；快取行為移至 Manual QA（除非實作提供 injectable TTL）
- F055 preview URL encoded levels 參數：直接使用 spec 5.2 範例字串（`levels=%5B%7B%22cardLevel%22%3A%22A%22...%7D%5D`）
- F056 PUT（批次 UPSERT） vs POST（單筆 INSERT）語意分離：TIER_LEVEL_DUPLICATE 在 PUT 是「body 內 PK 重複」（TS-F056-007），在 POST 是「DB 已存在」（TS-F056-013）
- F056 Fallback CARD_TYPE：M5（標準 fallback，OBTIER dump 第 28 列）、M3/HC/C3（過渡期 fallback，OQ-E07-28 決策，OBMLISTDF 仍有名單）；HM 不再為 fallback（OQ-E07-27 決策，需補獨立計分卡）
- F056 BR-9 card_level 長度檢查：ob_tier.card_level VARCHAR(5) vs ob_levelcard_level.card_level VARCHAR(1)；輸入 'AB'（2 字元）應回 422 CARD_LEVEL_NOT_FOUND（TS-F056-015）
- F056 BR-10 fn_calc_tier_level NULL fallback：跨層整合測試（TS-F056-019/020）需直接以 SQL 呼叫 PostgreSQL function；Migration 1711360000141 必須先執行於 Test Container
- Audit Log 通用驗證：所有 F054/F055/F056 寫入操作後，查詢 assignment_audit_log 最新一筆確認 action / entity_type / entity_id / before_value / after_value；before_value 不可為 null（需記錄舊值）
- F053 BE-F053-001（停用維度連鎖）應在 F054 的整合 test suite 中串聯：F054 停用維度 → 呼叫 F053 GET /scoring 確認該維度不出現（TS-F054-009）
- F054 停用維度端點路徑：spec 未明確定義（PATCH vs DELETE），測試設計標記為待確認；實作後對齊測試

**E07 M06 篩選欄位管理特殊注意（F075 v1.4/v1.5）：**
- `GET /api/v1/pooldata-fields/available-columns` 受 `DirectorGuard`（非 `DirectorOrSectionChiefGuard`）+ `FeatureFlagGuard('ENABLE_E07_REFACTOR_PHASE3')` 雙重保護；處長呼叫回 403，Feature Flag 關閉回 503
- **路由排序**：Controller 內 `@Get('available-columns')` 必須宣告在 `@Get(':columnName')` 之前（NestJS 靜態路由優先）；TS-F075-E2E-008 為路由排序回歸測試
- **information_schema 環境限制**：`_inferSuggestedFieldType` 純函數單元測試使用 mock；過濾邏輯（TS-F075-INT-BE-001/002）需在獨立 PostgreSQL Test Container（`pooldata-available-columns.integration-spec.ts`）執行，**不可**在 SQLite E2E 測試
- **decimal 邊界（TS-F075-BE-024）**：spec §5.5 文件列 `decimal`，但 PostgreSQL information_schema 實際回傳 `numeric`；`'decimal'` 字串輸入期望 `categorical`（保守原則），正確生產路徑由 TS-F075-BE-010（`'numeric'` → `'numeric'`）覆蓋
- **hint 狀態機**：React state 需維持 `hasUserOverridden: boolean` flag；`dropdown` 重選時 `setHasUserOverridden(false)`（重置 suggested）；radio `onChange` 一律 `setHasUserOverridden(true)`；**點回原 suggestedFieldType 值不重置 state**（TS-F075-FE-010 驗證此行為）
- **dropdown-column-name-empty testid 缺失**：prototype 原始空態元素（`#columnDropdownEmpty`）無 data-testid；實作時需補充 `data-testid="dropdown-column-name-empty"`（RISK-F075-004）
- **Regression Guard v2.0**：`regression/M06-regression-guards.md` v2.0 含 5 個 guard（NAMING-001/002 + F068-001/002 + SIDEBAR-001），每次 F075 / F068 相關 PR 後需重新執行
- **v1.5 新增（2026-05-20）**：TS-F075-049（whitelist seed 含 case_status，共 6 筆）、TS-F075-050（GET /whitelist?active=true 回傳 case_status）

**E07 M08 Whitelist-Driven 重構特殊注意（F050/F051/F076/F068-deprecated）：**
- **新 error codes（v2.1）**：`CONDITION_COLUMN_NOT_IN_WHITELIST`（422）、`RESERVED_FIELD_IN_CONDITIONS`（400）、`LEGACY_LIST_CONDITION_READONLY`（422）、`LEGACY_LIST_NOT_COPYABLE`（422）；`WHITELIST_OPTION_INACTIVE` 為非阻擋 warning（201/200 + warnings array）
- **廢棄 error codes**：`LIST_FILTER_FIELD_NOT_IN_WHITELIST`、`CASE_STATUS_REQUIRED`；仍可能共存於舊 code path，需確認刪除範圍
- **caseyear wildcard（OQ-TEST-001 解答）**：values 含 `99` → Stage 1 完全省略 year_cnt 條件（不加任何 IN / = / BETWEEN）；見 IT-M01-013/014/015
- **_backfill_empty（OQ-TEST-002 解答）**：conditions=[] 且 _backfill_empty=true → Stage 1 skip + Logger.warn + assignment_run 不 fail；result summary status='skipped' reason='EMPTY_CONDITIONS'；見 IT-M01-016/017、MT-M2-003
- **M5 不可逆 + 部署閘門**：M5（DELETE ob_code_df）需先確認 F069 已切換來源（TC-GUARD-M06-F068-001/TS-F068-DEP-008）；M5 只在 staging/CI 執行測試；M5 down() 為 no-op（不可還原，需備份）
- **spec_tp 32 筆確認（TEST-RISK-005）**：Phase 5 TDD Developer 需讀取 `reference/DumpData/OBMCODEDF_20260505.csv`（TBL_ID='09'）核實確切筆數；若非 32 筆，以 CSV 實際值為準並更新 MT-M3-001 / TS-F076-003 assertion
- **backward-compat 衍生規則**：categorical → `values.join('$')`；numeric → `${min}$${max}`；date_range → `${dateStart}$${dateEnd}`；欄位不在 conditions 中 → DB 欄位為 NULL
- **Path A/B Stage 1 切換**：condition_payload IS NOT NULL → Path A（conditions 解析）；IS NULL → Path B（entity 欄位 fallback）；兩條路徑均需獨立 IT-M01 驗證（IT-M01-009/011）
- **K1~K5 五階段保護**：condition_payload 僅允許在 draft stage 寫入（K1）；rollback 還原 draft 可編輯性（K3）；Stage 1 只讀 ready stage 名單（K5）
- **F068 廢棄驗證**：3 端點回 404（TS-F068-DEP-001~003）+ 模組目錄刪除（TC-GUARD-M06-F068-001）+ 錯誤碼刪除（TC-GUARD-M06-F068-002）+ Sidebar 入口刪除（TC-GUARD-M06-SIDEBAR-001）
- **整合測試位置**：M01 整合測試 → `integration/M01-whitelist-driven-integration-test.md`；Migration 測試 → `migration/M01-migration-test.md`
- **建議載入順序補充**：F050/F051 實作前需先完成 F075/F076 + M3/M4 migration；F068 廢棄需在 F069 切換完成後執行 M5

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
| 2026-03-20 | 新增 E05 ETL Pipeline 管理模組（F027–F036）共 10 個 Feature 測試文件，合計 210 個測試場景（F027:22、F028:17、F029:31、F030:20、F031:14、F032:21、F033:29、F034:15、F035:21、F036:20）；新增錯誤碼覆蓋：PIPELINE_NAME_EXISTS、VALIDATION_INVALID_CRON、PIPELINE_INVALID_CONNECTION、PIPELINE_DRAFT_CANNOT_ENABLE、PIPELINE_TARGET_TABLE_NOT_FOUND、PIPELINE_VERSION_NOT_FOUND、PIPELINE_PUBLISH_REQUIRES_TEST；總場景數由 308 增至 518 | Test Designer Agent |
| 2026-03-20 | 整合 test-index.md（v2.0）：統一版本號、修正場景合計、新增 E05 小計列；更新 test-levels.md（新增 E05 Unit/Integration/E2E/NFR 章節）；更新 test-data-strategy.md（新增 E05 種子資料與邊界值）；更新 risks-and-gaps.md（新增 E05-RISK-001~008） | Test Designer Agent |
| 2026-03-23 | 新增 F037 發布 Pipeline 版本測試設計（37 個測試場景，含後端 Unit/Integration、前端 Unit、端到端流程、邊界條件）；新增錯誤碼覆蓋：PIPELINE_VERSION_ALREADY_PUBLISHED；總場景數由 518 增至 531 | Test Designer Agent |
| 2026-03-25 | 新增 F038 孤兒任務回收測試設計（45 個測試場景：Unit 27 個 + Integration 17 個 + 效能 1 個）；涵蓋 E04 擷取任務回收、E05 Pipeline 回收、無孤兒靜默通過、Transaction 原子性、獨立 Transaction 隔離、Logger 驗證、冪等性、回收後操作解鎖（triggerRun/deleteTask/triggerExecute）及 NFR 效能閾值；總場景數由 531 增至 576 | Test Designer Agent |
| 2026-04-02 | E02 角色擴充（US-017 業務角色定義）：新增 F045 業務角色定義測試設計（15 個場景）；更新 F004（+6 場景，8→14，新增業務角色建立、無效 role_code、前端角色選單）；更新 F005（+7 場景，7→14，新增依業務角色篩選、角色欄位中文顯示名稱驗證）；更新 F008（+14 場景，6→20，新增業務角色間互相變更、Admin 降級為業務角色、最後 Admin 保護擴充、前端確認對話框）；移除「僅 Admin 與 User 兩種角色」的假設；總場景數由 736 增至 778 | Test Designer Agent |
| 2026-04-13 | E06 角色精簡（US-017 回歸 2 種角色）：業務角色（business/marketing/customer_service/analyst/supervisor/backend_ops）全部移除；F045（15→13 場景）、F004（14→9 場景）、F005（14→10 場景）、F008（20→12 場景）；移除業務角色相關測試案例；總場景數由 778 降至 743 | Test Designer Agent |
| 2026-05-13 | 新增 F002SM Sales Manager 旗標顯示於 Top Bar（25 場景）：涵蓋後端 Login API `isSalesManager` 欄位補充（6 場景）、前端 TopBar Badge 元件（7 場景）、前端整合（4 場景）、edge case（4 場景）、Manual E2E（4 場景）；補充 4 項風險（RISK-F002SM-001~004）；總場景數由 812 增至 837 | Test Designer Agent |
| 2026-05-18 | 新增 E07 M06 篩選欄位管理（F075 v1.4）測試設計（48 場景）：BE service 單元（18 場景，含 `getAvailableColumns` happy path / empty / 排序 / camelCase mapping + `_inferSuggestedFieldType` 15 dataType 逐型別驗證）；BE E2E SQLite（8 場景，Guard 矩陣 / Feature Flag / 路由排序回歸）；BE Integration PostgreSQL TC（2 場景，BR-13 含停用過濾 + 空陣列）；前端 Component（16 場景，dropdown / hint data-state / RISK-003 user-overridden 決議 / empty / toast / Edit regression）；跨模組整合（2 場景，F050 contract + F076 categorical）；命名漂移 regression（2 場景）。新增 `regression/M06-regression-guards.md`（TC-GUARD-M06-NAMING-001/002）。版本升至 v2.12；總場景數由 961 增至 1009 | Test Designer Agent |
