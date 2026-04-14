---
spec-id: CDMP-INDEX
title: SPEC 文件索引
version: "2.2"
date: 2026-04-13
status: Draft
---

# CDMP MVP — SPEC 文件索引

> **專案**：CDMP（Customer Data Management Platform）v1.0 MVP
> **文件總數**：79 份（7 支援文件 + 47 Feature 文件 + 25 圖表文件）
> **最後更新**：2026-04-13

---

## 快速統計

| 類別 | 數量 |
|------|------|
| 核心支援文件 | 7 |
| Feature 文件（E01） | 3 |
| Feature 文件（E02） | 8 |
| Feature 文件（E03） | 6 |
| Feature 文件（E04） | 10 |
| Feature 文件（E05） | 17 |
| Feature 文件（E06） | 2 |
| Feature 文件（E04/E05 跨模組） | 1 |
| Mermaid 圖表 | 25 |
| **總計** | **79** |

---

## 核心支援文件

| 文件 | 說明 | 主要使用者 |
|------|------|-----------|
| [overview.md](overview.md) | 系統總覽、產品願景、目標使用者 | 所有 Agent |
| [scope.md](scope.md) | MVP 範圍定義、Feature 對照表、階段規劃 | 所有 Agent |
| [nfr.md](nfr.md) | 非功能需求（安全性、效能） | Architect, TDD, QA |
| [data-model.md](data-model.md) | 資料模型、實體定義、欄位約束 | Architect, TDD |
| [error-handling.md](error-handling.md) | 錯誤處理慣例、錯誤碼目錄 | TDD, QA, UI |
| [open-questions.md](open-questions.md) | 待決事項、假設清單 | Architect, Product |
| [spec-index.md](spec-index.md) | 本文件 — SPEC 索引與導覽 | 所有 Agent |

---

## Feature 文件

### E01 — 驗證與登入

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F001 | [F001-admin-login.md](features/F001-admin-login.md) | Admin 登入 | US-001 | P0-MVP |
| F002 | [F002-user-login.md](features/F002-user-login.md) | User 登入 | US-002 | P0-MVP |
| F003 | [F003-logout.md](features/F003-logout.md) | 登出 | US-003 | P0-MVP |

### E02 — 帳號與角色管理

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F004 | [F004-create-account.md](features/F004-create-account.md) | 建立帳號 | US-010 | P0-MVP |
| F005 | [F005-view-account-list.md](features/F005-view-account-list.md) | 查看帳號清單 | US-011 | P0-MVP |
| F006 | [F006-edit-account.md](features/F006-edit-account.md) | 編輯帳號 | US-012 | P0-MVP |
| F007 | [F007-disable-enable-account.md](features/F007-disable-enable-account.md) | 停用／啟用帳號 | US-013 | P1 |
| F008 | [F008-assign-change-role.md](features/F008-assign-change-role.md) | 指派／變更角色（8 種角色） | US-014 | P0-MVP |
| F009 | [F009-self-service-password-reset.md](features/F009-self-service-password-reset.md) | 自助式密碼重設 | US-015 | P0-MVP |
| F010 | [F010-admin-reset-password.md](features/F010-admin-reset-password.md) | Admin 重設使用者密碼 | US-016 | P0-MVP |
| F045 | [F045-business-role-definitions.md](features/F045-business-role-definitions.md) | 業務角色定義（系統預設角色） | US-017 | P0-MVP |

### E03 — 資料來源管理

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F011 | [F011-add-datasource.md](features/F011-add-datasource.md) | 新增資料來源 | US-020 | P0-MVP |
| F012 | [F012-list-datasources.md](features/F012-list-datasources.md) | 查看資料來源清單 | US-021 | P0-MVP |
| F013 | [F013-edit-datasource.md](features/F013-edit-datasource.md) | 編輯資料來源 | US-022 | P0-MVP |
| F014 | [F014-delete-datasource.md](features/F014-delete-datasource.md) | 刪除資料來源 | US-023 | P1 |
| F015 | [F015-test-datasource-connection.md](features/F015-test-datasource-connection.md) | 測試資料來源連線 | US-024 | P0-MVP |
| F016 | [F016-datasource-status-dashboard.md](features/F016-datasource-status-dashboard.md) | 資料來源狀態監控儀表板 | US-025 | P1 |

### E04 — 資料擷取管理

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F017 | [F017-create-extraction-task.md](features/F017-create-extraction-task.md) | 建立擷取任務（含來源 Schema / 資料表動態選擇） | US-030 | P0-MVP |
| F018 | [F018-view-extraction-task-list.md](features/F018-view-extraction-task-list.md) | 查看擷取任務清單 | US-031 | P0-MVP |
| F019 | [F019-edit-extraction-task.md](features/F019-edit-extraction-task.md) | 編輯擷取任務（含來源 Schema / 資料表動態選擇） | US-032 | P0-MVP |
| F020 | [F020-toggle-extraction-task.md](features/F020-toggle-extraction-task.md) | 啟用／停用擷取任務 | US-033 | P0-MVP |
| F021 | [F021-run-extraction-task.md](features/F021-run-extraction-task.md) | 立即執行／重新執行擷取任務（含動態建表與批次寫入） | US-034 | P0-MVP |
| F022 | [F022-view-extraction-logs.md](features/F022-view-extraction-logs.md) | 查看擷取日誌 | US-035 | P0-MVP |
| F023 | [F023-scheduled-extraction.md](features/F023-scheduled-extraction.md) | 排程自動執行 | US-036 | P0-MVP |
| F024 | [F024-extraction-dashboard.md](features/F024-extraction-dashboard.md) | 擷取監控儀表板 | US-037 | P1 |
| F025 | [F025-delete-extraction-task.md](features/F025-delete-extraction-task.md) | 刪除擷取任務 | US-038 | P1 |
| F026 | [F026-preview-raw-data.md](features/F026-preview-raw-data.md) | 查看擷取資料預覽 | US-039 | P0-MVP |

### E05 — ETL Pipeline 管理

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F027 | [F027-pipeline-list.md](features/F027-pipeline-list.md) | 查看 Pipeline 列表 | US-040 | P0-MVP |
| F028 | [F028-create-pipeline.md](features/F028-create-pipeline.md) | 建立 Pipeline | US-041 | P0-MVP |
| F029 | [F029-pipeline-editor.md](features/F029-pipeline-editor.md) | 視覺化轉換編輯器（13 種 Transform 節點，Lookup 雙輸入模式） | US-042, US-058 | P0-MVP |
| F030 | [F030-execute-pipeline.md](features/F030-execute-pipeline.md) | 執行 Pipeline（手動/測試/排程） | US-043 | P0-MVP |
| F031 | [F031-toggle-pipeline.md](features/F031-toggle-pipeline.md) | 啟用／停用 Pipeline | US-044 | P0-MVP |
| F032 | [F032-pipeline-logs.md](features/F032-pipeline-logs.md) | 查看 Pipeline 日誌 | US-045 | P0-MVP |
| F033 | [F033-pipeline-version.md](features/F033-pipeline-version.md) | Pipeline 版本管理（Diff/回滾/發布） | US-046 | P1 |
| F034 | [F034-delete-pipeline.md](features/F034-delete-pipeline.md) | 刪除 Pipeline | US-047 | P1 |
| F035 | [F035-pipeline-dashboard.md](features/F035-pipeline-dashboard.md) | Pipeline 監控儀表板 | US-048 | P1 |
| F036 | [F036-target-tables.md](features/F036-target-tables.md) | 目標表 Domain-Oriented 規劃（customer_core 85 欄位） | US-049 | P0-MVP |
| F037 | [F037-publish-pipeline-version.md](features/F037-publish-pipeline-version.md) | 發布 Pipeline 版本 | US-050 | P0-MVP |
| F039 | [F039-node-field-badge.md](features/F039-node-field-badge.md) | 節點欄位變化統計 Badge | US-042 (擴充) | P0-MVP |
| F040 | [F040-field-inspector-diff.md](features/F040-field-inspector-diff.md) | Inspector Panel 欄位 Diff | US-042 (擴充) | P1 |
| F041 | [F041-badge-hover-tooltip.md](features/F041-badge-hover-tooltip.md) | Badge Hover Tooltip | US-042 (擴充) | P2 |
| F042 | [F042-etl-execution-engine.md](features/F042-etl-execution-engine.md) | ETL 執行引擎核心框架（DAG 排序、Node Dispatcher、nodeOutputMap） | US-055 | P0-MVP |
| F043 | [F043-etl-node-executors.md](features/F043-etl-node-executors.md) | ETL 節點執行器（8 種節點處理邏輯與 TypeScript interfaces，含 Lookup 雙輸入模式） | US-056, US-057, US-058 | P0-MVP |
| F044 | [F044-etl-target-load.md](features/F044-etl-target-load.md) | Target Load + UPSERT（批次寫入、ETL 追蹤欄位） | US-057 | P0-MVP |

### E06 — Customer 360

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F046 | [F046-customer-search-list.md](features/F046-customer-search-list.md) | Customer 360 — 客戶搜尋與清單 | US-060 | P0-MVP |
| F047 | [F047-customer-360-detail.md](features/F047-customer-360-detail.md) | Customer 360 — 單一客戶詳情 | US-061 | P0-MVP |

### E04/E05 — 跨模組系統維運

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F038 | [F038-orphan-task-recovery.md](features/F038-orphan-task-recovery.md) | 孤兒任務回收（系統啟動時自動修復 running 狀態） | US-051 | P0-MVP |

---

## 圖表文件

### 系統架構

| 文件 | 說明 | 圖表類型 |
|------|------|---------|
| [diagrams/system-context.md](diagrams/system-context.md) | C4 Level 1 系統上下文圖 | Flowchart |
| [diagrams/container-architecture.md](diagrams/container-architecture.md) | 容器架構圖 | Flowchart |
| [diagrams/er-diagram.md](diagrams/er-diagram.md) | 實體關聯圖 | erDiagram |

### 流程圖

| 文件 | 說明 | 圖表類型 | 相關 Feature |
|------|------|---------|-------------|
| [diagrams/auth-flow.md](diagrams/auth-flow.md) | 身份驗證流程 | Sequence | F001, F002, F003 |
| [diagrams/password-reset-flow.md](diagrams/password-reset-flow.md) | 密碼重設流程 | Sequence | F009, F010 |
| [diagrams/datasource-crud-flow.md](diagrams/datasource-crud-flow.md) | 資料來源 CRUD 流程 | Sequence | F011, F013, F014 |
| [diagrams/connection-test-flow.md](diagrams/connection-test-flow.md) | 連線測試流程 | Sequence | F015 |
| [diagrams/health-check-flow.md](diagrams/health-check-flow.md) | 自動健康檢查流程 | Sequence | F016 |
| [diagrams/extraction-crud-flow.md](diagrams/extraction-crud-flow.md) | 擷取任務 CRUD 流程 | Sequence | F017, F019, F025 |
| [diagrams/extraction-execution-flow.md](diagrams/extraction-execution-flow.md) | 擷取任務執行流程 | Sequence | F021, F023 |
| [diagrams/pipeline-crud-flow.md](diagrams/pipeline-crud-flow.md) | Pipeline CRUD 流程 | Sequence | F027, F028, F034 |
| [diagrams/pipeline-execution-flow.md](diagrams/pipeline-execution-flow.md) | Pipeline 執行流程 | Sequence | F030 |
| [diagrams/pipeline-editor-flow.md](diagrams/pipeline-editor-flow.md) | Pipeline 編輯器流程 | Flowchart | F029 |
| [diagrams/target-table-etl-flow.md](diagrams/target-table-etl-flow.md) | 目標表 ETL 轉換流程 | Flowchart | F036 |
| [diagrams/F039-node-field-badge.mmd](diagrams/F039-node-field-badge.mmd) | 節點欄位 Badge 資料流與元件結構 | Flowchart | F039 |
| [diagrams/F041-badge-hover-tooltip.mmd](diagrams/F041-badge-hover-tooltip.mmd) | Badge Hover Tooltip 互動時序 | Sequence | F041 |
| [diagrams/F042-etl-execution-engine.mmd](diagrams/F042-etl-execution-engine.mmd) | ETL 執行引擎流程與 Node Dispatcher 架構 | Flowchart | F042 |
| [diagrams/F046-customer-search-list.mmd](diagrams/F046-customer-search-list.mmd) | 客戶搜尋與清單流程 | Sequence | F046 |
| [diagrams/F047-customer-360-detail.mmd](diagrams/F047-customer-360-detail.mmd) | 單一客戶 360 詳情載入流程 | Sequence | F047 |

### 狀態圖

| 文件 | 說明 | 圖表類型 | 相關 Feature |
|------|------|---------|-------------|
| [diagrams/account-states.md](diagrams/account-states.md) | 帳號狀態轉換 | State | F004, F007 |
| [diagrams/datasource-states.md](diagrams/datasource-states.md) | 資料來源狀態轉換 | State | F011, F013, F014, F015 |
| [diagrams/extraction-task-states.md](diagrams/extraction-task-states.md) | 擷取任務狀態轉換 | State | F017, F020, F021, F023, F025 |
| [diagrams/pipeline-states.md](diagrams/pipeline-states.md) | Pipeline 狀態轉換 | State | F028, F030, F031, F034 |
| [diagrams/pipeline-version-states.md](diagrams/pipeline-version-states.md) | Pipeline 版本狀態轉換 | State | F029, F030, F033, F037 |

---

## Agent 導覽指南

各下游 Agent 的建議載入策略：

### Architect Agent
1. 必讀：`overview.md`, `scope.md`, `nfr.md`, `data-model.md`, `open-questions.md`
2. 必讀圖表：`system-context.md`, `container-architecture.md`, `er-diagram.md`
3. 視需求載入：個別 Feature 文件

### TDD Agent
1. 必讀：`data-model.md`, `error-handling.md`, `nfr.md`
2. 依實作順序載入對應 Feature 文件
3. 建議順序：F001->F002->F003->F045->F004->F005->F006->F008->F009->F010->F007->F011->F012->F013->F015->F014->F016->F017->F018->F019->F020->F021->F022->F023->F024->F025->F026->F027->F028->F029->F036->F030->F037->F031->F032->F033->F034->F035->F038->F042->F043->F044->F046->F047

### QA / Test Design Agent
1. 必讀：`scope.md`, `error-handling.md`, `nfr.md`
2. 載入所有 Feature 文件的 Acceptance Criteria 區段
3. 參考圖表：流程圖與狀態圖

### UI/UX Agent
1. 必讀：`overview.md`, `error-handling.md`
2. 依畫面載入對應 Feature 文件的 UI/UX Requirements 區段
3. 參考圖表：`auth-flow.md`, `account-states.md`, `datasource-states.md`, `extraction-task-states.md`, `pipeline-states.md`, `pipeline-editor-flow.md`

---

## 優先級分類

### P0-MVP（Must Have）— 37 個 Feature

F001, F002, F003, F004, F005, F006, F008, F009, F010, F011, F012, F013, F015, F017, F018, F019, F020, F021, F022, F023, F026, F027, F028, F029, F030, F031, F032, F036, F037, F038, F039, F042, F043, F044, F045, F046, F047

### P1（Should Have）— 9 個 Feature

F007（停用／啟用帳號）, F014（刪除資料來源）, F016（狀態監控儀表板）, F024（擷取監控儀表板）, F025（刪除擷取任務）, F033（Pipeline 版本管理）, F034（刪除 Pipeline）, F035（Pipeline 監控儀表板）, F040（Inspector Panel 欄位 Diff）

### P2（Nice to Have）— 1 個 Feature

F041（Badge Hover Tooltip）

---

## 依賴鏈

```
E01（驗證）──封鎖──> E02（帳號管理）
E01（驗證）──封鎖──> E03（資料來源管理）
E01（驗證）──封鎖──> E04（資料擷取管理）
E01（驗證）──封鎖──> E05（ETL Pipeline 管理）
E03（資料來源管理）──封鎖──> E04（資料擷取管理）
E04（資料擷取管理）──封鎖──> E05（ETL Pipeline 管理）

F001/F002 ──> F003（登出需登入）
F045 ──> F004, F005, F008（角色 Seed Data）
F004 ──> F005 ──> F006, F007, F008, F010
F004 ──> F009
F011 ──> F012 ──> F013, F014
F011 ──> F015 ──> F016
F017 ──> F018 ──> F019, F025
F017 ──> F020, F021 ──> F022, F023, F024, F026
F027 ──> F028 ──> F029 ──> F030, F033, F036
F028 ──> F031, F034
F030 ──> F032, F035, F037
F037 ──> F031（發布後才能啟用）
F029 ──> F039（Badge 依賴編輯器畫布）
F039 ──> F040（欄位 Diff 共用計算邏輯）
F039 ──> F041（Tooltip 依賴 Badge）
F040 ──> F041（點擊查看完整導向欄位流分頁）
F030 ──> F042（執行引擎替換模擬邏輯）
F042 ──> F043（節點執行器依賴引擎框架）
F042 ──> F044（Target Load 依賴引擎框架）
F043 ──> F044（Target Load 依賴上游節點輸出）
F036 ──> F044（目標表 schema 定義）
F036 ──> F046（customer_core 85 欄位 Schema）
E01 ──> F046（使用者驗證）
F044 ──> F046（ETL TargetLoad 資料已載入）
F046 ──> F047（客戶清單為 360 詳情主要入口）
```

---

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-06 | 初版建立，33 份文件索引完成 | Spec Writer Agent |
| 2026-03-17 | 新增 E04 資料擷取管理 9 個 Feature（F017-F025）、3 個圖表、更新支援文件 | Spec Writer Agent |
| 2026-03-18 | E04 raw data 落地重大更新：`target_table` -> `source_table`、動態建表、批次寫入、新增 F026 查看擷取資料預覽、新增 NFR-002.9/002.10/002.11 | Spec Writer Agent |
| 2026-03-18 | E04 來源資料表選擇方式變更：`source_table` 單一欄位拆分為 `source_schema` + `source_table`；新增 Datasource Schema/Table 查詢 API 端點；F017/F019 新增動態載入下拉選單；新增 DATASOURCE_SCHEMA_LOAD_FAILED / DATASOURCE_TABLE_LOAD_FAILED 錯誤碼 | Spec Writer Agent |
| 2026-03-19 | 新增 E05 ETL Pipeline 管理 10 個 Feature（F027-F036）、6 個圖表、更新支援文件（data-model、error-handling、scope、overview、open-questions） | Spec Writer Agent |
| 2026-03-23 | 新增 F037（發布 Pipeline 版本），對應 US-050；新增錯誤碼 PIPELINE_VERSION_ALREADY_PUBLISHED；更新 P0-MVP 為 29 個 Feature | Spec Writer Agent |
| 2026-03-25 | 新增 F038（孤兒任務回收），對應生產環境 Bug Fix；跨 E04/E05 模組；P0-MVP；更新總文件數為 64 份 | Product Analyst Agent |
| 2026-03-25 | F038 規格審閱完善：統一為標準 Feature 格式、修正 AC-4 移除不存在的 error_message 引用、OQ-3 決策（回收失敗不中止啟動）反映至 BR-11/AC-10/替代流程、新增 NFR-002.12 孤兒回收效能、來源 Story 修正為 US-051、OQ 編號對齊全域序列（OQ-39~41）、新增假設 A31~A33 | Spec Writer Agent |
| 2026-03-25 | F036（US-049）重大更新：4 個目標表縮減為 1 個（customer_core 約 45 欄位）、新增來源資料表定義（ZZIP_BAMCUST_M + MLMCUSTOMER）、新增 ETL 轉換規則（電話合併/衝突解決/代碼描述/型別轉換）、新增依賴（US-030/US-042）、更新 data-model/scope/overview/open-questions、新增 target-table-etl-flow 圖表、文件總數 65 份 | Spec Writer Agent |
| 2026-03-27 | 新增 F039（節點欄位 Badge, P0）、F040（Inspector Panel 欄位 Diff, P1）、F041（Badge Hover Tooltip, P2）；新增 2 個圖表（F039 資料流、F041 互動時序）；US-042 編輯器功能擴充三階段規格；文件總數 70 份 | Spec Writer Agent |
| 2026-03-27 | 新增 F042（ETL 執行引擎核心框架）、F043（ETL 節點執行器 7 種）、F044（Target Load + UPSERT）；新增 1 個圖表（F042 引擎流程）；對應 US-055/056/057；P0-MVP 增至 34 個 Feature；文件總數 74 份 | Spec Writer Agent |
| 2026-03-31 | Lookup 節點雙輸入重設計：F029 新增 AC-7a~7d（Lookup 雙輸入 UI）與更新 JSON schema；F043 新增第 8 種節點執行器 LookupExecutor（雙輸入模式 + 向下相容），新增 AC-18~AC-24；對應 US-058 | Spec Writer Agent |
| 2026-04-02 | E02 角色擴充：新增 F045（業務角色定義，US-017）；更新 F004/F005/F006/F008 支援 8 種角色（2 系統 + 6 業務）；新增 Role 實體至 data-model；新增 ROLE_MODIFICATION_FORBIDDEN/ROLE_NOT_FOUND 錯誤碼；更新 VALIDATION_INVALID_ROLE 訊息；P0-MVP 增至 35 個 Feature；文件總數 75 份 | Spec Writer Agent |
| 2026-04-13 | 新增 E06 Customer 360：F046（客戶搜尋與清單，US-060）、F047（單一客戶 360 詳情，US-061）；新增 2 個圖表（F046 搜尋流程、F047 詳情載入流程）；新增 C360_CUSTOMER_NOT_FOUND / C360_SEARCH_MIN_LENGTH 錯誤碼；更新 NFR-002.5 受影響功能；解決 G-01~G-08 所有缺口；P0-MVP 增至 37 個 Feature；文件總數 79 份 | Spec Writer Agent |
