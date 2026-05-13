---
spec-id: CDMP-INDEX
title: SPEC 文件索引
version: "2.8"
date: 2026-05-06
status: Draft
---

# CDMP MVP — SPEC 文件索引

> **專案**：CDMP（Customer Data Management Platform）v1.0 MVP
> **文件總數**：104 份（7 支援文件含 spec-index 本檔 + 68 Feature 文件 + 29 圖表文件）
> **最後更新**：2026-05-06

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
| Feature 文件（E04/E05 跨模組） | 1 |
| Feature 文件（E06） | 2 |
| Feature 文件（E07） | 21 |
| Mermaid 圖表 | 29 |
| **總計** | **104** |

---

## 核心支援文件

| 文件 | 說明 | 主要使用者 |
|------|------|-----------|
| [overview.md](overview.md) | 系統總覽、產品願景、目標使用者 | 所有 Agent |
| [scope.md](scope.md) | MVP 範圍定義、Feature 對照表、階段規劃 | 所有 Agent |
| [nfr.md](nfr.md) | 非功能需求（安全性、效能、E07 月跑執行效能/快照原子性/結果準確性） | Architect, TDD, QA |
| [data-model.md](data-model.md) | 資料模型、實體定義、欄位約束（含 E07 `ob_*` 表與 `assignment_*` 表） | Architect, TDD |
| [error-handling.md](error-handling.md) | 錯誤處理慣例、錯誤碼目錄（含 ASSIGNMENT 領域錯誤） | TDD, QA, UI |
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
| F008 | [F008-assign-change-role.md](features/F008-assign-change-role.md) | 指派／變更角色（Admin / User）＋ 業務主管旗標切換 | US-014 | P0-MVP |
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

### E04/E05 — 跨模組系統維運

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F038 | [F038-orphan-task-recovery.md](features/F038-orphan-task-recovery.md) | 孤兒任務回收（系統啟動時自動修復 running 狀態） | US-051 | P0-MVP |

### E06 — Customer 360

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F046 | [F046-customer-search-list.md](features/F046-customer-search-list.md) | Customer 360 — 客戶搜尋與清單 | US-060 | P0-MVP |
| F047 | [F047-customer-360-detail.md](features/F047-customer-360-detail.md) | Customer 360 — 單一客戶詳情 | US-061 | P0-MVP |

### E07 — 客戶名單分派

#### M01 名單定義

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F048 | [F048-view-list-definition.md](features/F048-view-list-definition.md) | 查看本月名單定義清單（M01 入口） | US-070 | P0-MVP |
| F049 | [F049-stage0-daily-estimate.md](features/F049-stage0-daily-estimate.md) | Stage 0 每日分派數量估算（含單一 LIST_NO 案件試算） | US-071 | P0-MVP |
| F050 | [F050-create-list-definition.md](features/F050-create-list-definition.md) | 新增名單定義（LIST_NO 自動產生） | US-088 | P0-MVP |
| F051 | [F051-edit-list-definition.md](features/F051-edit-list-definition.md) | 編輯名單定義（覆寫式） | US-089 | P0-MVP |
| F052 | [F052-disable-list-definition.md](features/F052-disable-list-definition.md) | 停用名單定義（軟刪除） | US-090 | P0-MVP |

#### M02 計分設定

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F053 | [F053-view-scoring-dimensions.md](features/F053-view-scoring-dimensions.md) | 查看計分維度設定 | US-072 | P0-MVP |
| F054 | [F054-edit-scoring-dimension.md](features/F054-edit-scoring-dimension.md) | 編輯計分維度與分數 | US-073 | P0-MVP |
| F055 | [F055-edit-card-level-thresholds.md](features/F055-edit-card-level-thresholds.md) | 編輯 CARD_LEVEL 分級門檻 | US-074 | P0-MVP |
| F056 | [F056-edit-tier-mapping.md](features/F056-edit-tier-mapping.md) | 編輯 TIER_LEVEL 對應表 | US-075 | P0-MVP |

#### M03 分派比例

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F057 | [F057-view-personnel-ratio.md](features/F057-view-personnel-ratio.md) | 查看人員比例設定 | US-078 | P0-MVP |
| F058 | [F058-edit-personnel-ratio.md](features/F058-edit-personnel-ratio.md) | 編輯人員比例設定（加總 = 100%） | US-079 | P0-MVP |
| F059 | [F059-toggle-cr-reassignment.md](features/F059-toggle-cr-reassignment.md) | 開關 CR 回分規則 | US-080 | P0-MVP |
| F060 | [F060-edit-per-list-dept-ratio.md](features/F060-edit-per-list-dept-ratio.md) | 設定 per-LIST_NO 部門比例 | US-091 | P0-MVP |

#### M04 分派執行

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F061 | [F061-trigger-assignment-run.md](features/F061-trigger-assignment-run.md) | 觸發分派月跑（Stage 0~4 + 三份快照原子性寫入） | US-081 | P0-MVP |
| F062 | [F062-view-run-progress.md](features/F062-view-run-progress.md) | 查看分派執行進度（3 秒 Polling） | US-082 | P0-MVP |
| F063 | [F063-view-run-result-summary.md](features/F063-view-run-result-summary.md) | 查看分派結果摘要（部門偏差 / 等級分佈） | US-083 | P0-MVP |
| F064 | [F064-export-assignment-result.md](features/F064-export-assignment-result.md) | 匯出分派結果（Excel / CSV streaming） | US-084 | P0-MVP |

#### M05 快照歷史

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F065 | [F065-view-run-history-list.md](features/F065-view-run-history-list.md) | 查看歷史執行紀錄清單 | US-085 | P0-MVP |
| F066 | [F066-view-run-snapshot-detail.md](features/F066-view-run-snapshot-detail.md) | 查看執行快照詳情（config / input_list / result） | US-086 | P0-MVP |
| F067 | [F067-compare-run-results.md](features/F067-compare-run-results.md) | 比對兩次執行結果差異（含人員配對 diff，NFR-005 主驗收工具） | US-087 | **P0-MVP**（使用者升級） |

#### M06 基礎代碼維護

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F068 | [F068-edit-base-code.md](features/F068-edit-base-code.md) | E07 相關代碼維護（PROD_KIND / SPEC_TP / CASE_STATUS） | US-092 | P0-MVP |

---

## 圖表文件

### 系統架構

| 文件 | 說明 | 圖表類型 |
|------|------|---------|
| [diagrams/system-context.md](diagrams/system-context.md) | C4 Level 1 系統上下文圖 | Flowchart |
| [diagrams/container-architecture.md](diagrams/container-architecture.md) | 容器架構圖 | Flowchart |
| [diagrams/er-diagram.md](diagrams/er-diagram.md) | 實體關聯圖 | erDiagram |

### 流程圖（E01~E06）

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

### 流程圖（E07）

| 文件 | 說明 | 圖表類型 | 相關 Feature |
|------|------|---------|-------------|
| [diagrams/F049-stage0-estimate-flow.mmd](diagrams/F049-stage0-estimate-flow.mmd) | Stage 0 每日分派數量估算流程 | Sequence | F049 |
| [diagrams/F061-assignment-run-flow.mmd](diagrams/F061-assignment-run-flow.mmd) | 月跑 Stage 0~4 執行引擎流程 | Flowchart | F061 |
| [diagrams/F066-snapshot-detail-flow.mmd](diagrams/F066-snapshot-detail-flow.mmd) | 執行快照詳情載入流程 | Sequence | F066 |
| [diagrams/F067-run-comparison-flow.mmd](diagrams/F067-run-comparison-flow.mmd) | 兩次執行結果差異比對流程 | Sequence | F067 |

### 狀態圖

| 文件 | 說明 | 圖表類型 | 相關 Feature |
|------|------|---------|-------------|
| [diagrams/account-states.md](diagrams/account-states.md) | 帳號狀態轉換 | State | F004, F007 |
| [diagrams/datasource-states.md](diagrams/datasource-states.md) | 資料來源狀態轉換 | State | F011, F013, F014, F015 |
| [diagrams/extraction-task-states.md](diagrams/extraction-task-states.md) | 擷取任務狀態轉換 | State | F017, F020, F021, F023, F025 |
| [diagrams/pipeline-states.md](diagrams/pipeline-states.md) | Pipeline 狀態轉換 | State | F028, F030, F031, F034 |
| [diagrams/pipeline-version-states.md](diagrams/pipeline-version-states.md) | Pipeline 版本狀態轉換 | State | F029, F030, F033, F037 |
| [diagrams/F061-assignment-run-states.mmd](diagrams/F061-assignment-run-states.mmd) | AssignmentRun 狀態轉換（pending/running/completed/failed） | State | F061, F062 |

---

## Agent 導覽指南

各下游 Agent 的建議載入策略：

### Architect Agent
1. 必讀：`overview.md`, `scope.md`, `nfr.md`, `data-model.md`, `open-questions.md`
2. 必讀圖表：`system-context.md`, `container-architecture.md`, `er-diagram.md`
3. 視需求載入：個別 Feature 文件（特別是 E07 F061/F066/F067 涉及跨模組整合）

### TDD Agent
1. 必讀：`data-model.md`, `error-handling.md`, `nfr.md`
2. 依實作順序載入對應 Feature 文件
3. 建議順序：
   - E01/E02：F001->F002->F003->F045->F004->F005->F006->F008->F009->F010->F007
   - E03：F011->F012->F013->F015->F014->F016
   - E04：F017->F018->F019->F020->F021->F022->F023->F024->F025->F026
   - E05：F027->F028->F029->F036->F030->F037->F031->F032->F033->F034->F035
   - 跨模組：F038
   - E05 執行引擎：F042->F043->F044
   - E06：F046->F047
   - **E07 建議順序**：F068（代碼維護，前置依賴）->F048->F050->F051->F052->F049->F053->F054->F055->F056->F057->F058->F059->F060->F061->F062->F063->F064->F065->F066->F067

### QA / Test Design Agent
1. 必讀：`scope.md`, `error-handling.md`, `nfr.md`
2. 載入所有 Feature 文件的 Acceptance Criteria 區段
3. E07 特別注意：NFR-003 月跑執行效能、NFR-004 快照原子性、NFR-005 結果準確性（F067 為主驗收工具）

### UI/UX Agent
1. 必讀：`overview.md`, `error-handling.md`
2. 依畫面載入對應 Feature 文件的 UI/UX Requirements 區段
3. E07 重點：F048 雙頁籤、F061 確認對話框、F062 Polling 進度、F066 三分頁快照、F067 比對視圖

### DevOps Agent
1. 必讀：`nfr.md`（含 NFR-003/004/005 E07 效能）
2. 視需求：`architecture-spec.md` §3.10 E07 Assignment Module

### E07 TDD Developer
1. 必讀：本索引 + `architecture-spec.md` §3.10（AD-E07-1~3）+ `data-model.md#e07-data-model` + `error-handling.md#assignment-errors`
2. 必讀圖表：`F061-assignment-run-flow.mmd`, `F061-assignment-run-states.mmd`, `F066-snapshot-detail-flow.mmd`, `F067-run-comparison-flow.mmd`
3. 依 M01→M06 順序實作（參見「TDD Agent 建議順序」E07 段）

---

## 優先級分類

### P0-MVP（Must Have）

**E01~E06 既有**（37 個）：
F001, F002, F003, F004, F005, F006, F008, F009, F010, F011, F012, F013, F015, F017, F018, F019, F020, F021, F022, F023, F026, F027, F028, F029, F030, F031, F032, F036, F037, F038, F039, F042, F043, F044, F045, F046, F047

**E07 新增**（21 個）：
F048, F049, F050, F051, F052, F053, F054, F055, F056, F057, F058, F059, F060, F061, F062, F063, F064, F065, F066, F067, F068

**P0-MVP 總計：58 個 Feature**（37 既有 + 21 E07 新增）

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
E01（驗證）──封鎖──> E06（Customer 360）
E01（驗證）──封鎖──> E07（客戶名單分派）
E02（角色管理）──封鎖──> E07（業務主管旗標 is_sales_manager）
E03（資料來源管理）──封鎖──> E04（資料擷取管理）
E04（資料擷取管理）──封鎖──> E05（ETL Pipeline 管理）
E04（資料擷取管理）──封鎖──> E07（ob_pool_data 由 E04 匯入）

F001/F002 ──> F003（登出需登入）
F045 ──> F004, F005, F008（角色 Seed Data）
F045 ──> F048, F061（業務主管旗標）
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

# E07 依賴鏈
F068 ──> F050, F051（PROD_KIND / SPEC_TP / CASE_STATUS 代碼就緒；CASEYEAR 為前端 hard-coded 不阻擋）
F048 ──> F049（Stage 0 估算於清單頁觸發）
F048 ──> F050, F051, F052, F060（清單頁為入口）
F050 ──> F051, F052, F060（需先有名單才能編輯/停用/設定比例）
F053 ──> F054, F055, F056（需先查看現有設定）
F055 ──> F056（TIER 對應依賴 CARD_LEVEL）
F057 ──> F058（編輯需先查看）
F048, F050, F054, F055, F056, F058, F059, F060 ──> F061（月跑前置條件）
E04 + E05 雙層 ETL ──> F061（ob_pool_data / ob_emphire / ob_calendar 由 E04 抓 raw → E05 Pipeline TargetLoad 載入，AD-E07-12）
F061 ──> F062（進度查詢）、F063（結果摘要）、F064（匯出）、F065（歷史清單）
F065 ──> F066（快照詳情入口）
F066 ──> F067（比對需讀取個別快照）
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
| 2026-04-24 | E02 `is_sales_manager` 旗標同步：F001 v1.1、F002 v1.1、F004 v3.1、F005 v3.1、F006 v2.1、F008 v3.1 更新，對應業務主管旗標與 Token Blocklist 處理 | Spec Writer Agent |
| 2026-04-24 | 新增 E07 客戶名單分派 21 個 Feature（F048~F068）+ 5 個圖表（F049/F061 flow+states/F066/F067）；新增 ASSIGNMENT 領域錯誤碼區段（LIST_NO_LIMIT_EXCEEDED / LIST_NO_DUPLICATE / ASSIGNMENT_RUN_ALREADY_RUNNING 等 20+ 項）；新增 NFR-003（月跑執行效能 < 30 min）、NFR-004（快照原子性 ACID）、NFR-005（分派結果準確性 < 3%，F067 為主驗收工具）；更新 scope/overview/open-questions；F067 優先級由 Should Have 升級為 P0-MVP；Feature 順序重排為 E01→E02→E03→E04→E05→E04/E05 跨模組→E06→E07；P0-MVP 增至 58 個；文件總數 104 份 | Spec Writer Agent |
| 2026-05-04 | 修正 F056 TIER_LEVEL 對應表資料來源誤標為 `ob_levelcard_level`，實際應為 `ob_tier`（OBTIER 舊表，SP `reference/SP/Stage2_依照CardType分類TierLevel.sql` 證據）；data-model.md 新增 `ob_tier` 假設定義（含 anchor `#ob-tier-entity`、SP 推論依據對照表、與 `ob_levelcard_level` 用途差異說明）；F056 升至 v1.1（API schema 改為 `cardType/cardLevel/tierLevel`、複合 PK `(card_type, card_level)`、acceptance criteria 對齊 ob_tier 寫入語意）；open-questions 新增 OQ-E07-14（OBTIER schema 待索取）+ 假設 A53 | Spec Writer Agent |
| 2026-05-04 | OBEMPHIRE / OBCALENDAR 採 E04 通用擷取任務同步至 AppDB（`ob_emphire` / `ob_calendar`）；data-model.md 新增 `ob_emphire`（含 anchor `#ob-emphire-entity`、PK 補建 `emp_id`、`(dept_code)` / `(resign_date)` 索引）與 `ob_calendar`（含 anchor `#ob-calendar-entity`、`rest_flg` 為 VARCHAR(1)）兩張表正式定義；F049（Stage 0 工作日表）/ F058（員工下拉清單）/ F061（Stage 4 員工 join）/ F063（部門 / 員工分布資料來源）/ F064（員工姓名 join）內 `[ASSUMPTION]` 升級為 Resolved；scope.md 補入 E04 擷取範圍涵蓋 OBPOOLDATA / OBEMPHIRE / OBCALENDAR；open-questions 新增 OQ-E07-15（同步機制決議），同時解決 OQ-E07-10 與 OQ-E07-12，假設 A50 / A52 標為 Resolved | Spec Writer Agent |
| 2026-05-05 | OBTIER schema 已取得（`reference/TableSchema/OB/OBTIER.sql`）→ data-model `ob_tier` 修正型別與欄位（移除推論的 6 個稽核欄位、補入 `list_nm` VARCHAR(30) NULL、`card_type` / `card_level` 修為 VARCHAR(5)）；OQ-E07-14 / 假設 A53 標為 ✅ Resolved；新增假設 A54（PK `(card_type, card_level)` 為遷移時補建）保留 [ASSUMPTION]；F056 升至 v1.2（補入 `listNm` 欄位、cardType/cardLevel 約束、新增 BR-7 稽核策略）。ARRETURNDF schema 已取得（`reference/TableSchema/ZZIPPROD/ARRETURNDF.sql`，OQ-E07-16 直接 ✅ Resolved）→ 屬 E04 ETL 範圍（OBPOOLDATA 上游來源），**E07 specs 不為個別來源表新增表定義** | Spec Writer Agent |
| 2026-05-05 | dump 資料驗證 9 表（`reference/DumpData/*_20260505.csv`），發現 5 項與 spec 假設差異並修正：(1) `OBLEVELCARD_VERSION` STATUS 欄位遷移補建（原表無，依 SDATE/EDATE 計算初值；data-model 補入欄位 + blockquote，F054/F055 補 BR）；(2) `OBTIER` 接受計分卡體系外的 CARD_TYPE（H/S/E/S5/E5/M/HM/M5 共 8 種，M5 → T5M 為 fallback 規則 CARD_LEVEL 可 NULL；data-model `ob_tier` `card_level` 改回 NULL + PK 補建邏輯更新 `(card_type, COALESCE(card_level, ''))` + Fallback CARD_TYPE 觀察表；F056 新增 AC-4a + BR-8；F061 Stage 2 補 fallback join 語意）；(3) `ob_levelcard_*` 系列稽核欄位 NULL 化驗證（既有設定無誤）；(4) `OBEMPLSETMF.DEPTID_M` 遷移時 RTRIM（dump 觀察 4 字元代碼被 padded 至 50 字元；data-model `ob_empl_set` 補註腳）；(5) `OBMLISTDF` 多值欄位 `$$` 分隔（`prod_kind` / `spec_tp` / `settle_src` / `caseyear`；data-model 補多值欄位儲存規範段落，F050/F051 UI/UX 補多選序列化規範）；OQ-E07-11（OBMCODEDF.SYSTEM_ID）✅ Resolved（dump 全表 = `'OB'`，F068 同步更新）；新增 OQ-E07-17（dump 驗證決議彙整 ✅ Resolved）；假設 A51 / A54 同步更新 | Spec Writer Agent |
| 2026-05-05 | 修正 E04 ETL 描述：`ob_pool_data` / `ob_emphire` / `ob_calendar` 改為 **E04 + E05 雙層 ETL** 流程（AD-E07-12）— E04 通用擷取任務從舊 OB DB 抓取至 raw_{task_id_short} 中介表（既有機制），再由 E05 Pipeline TargetLoad 載入目標表（full replace 模式，沿用 F044 customer_core 機制）；OBEMPHIRE 同步策略改為 **full 全量重抓**（每日重抓全表，員工數 < 1 萬筆無效能壓力）；data-model.md 三表 blockquote 「資料同步機制」更新（`ob_emphire` / `ob_calendar` / `ob_pool_data`）；F049（Stage 0 前置條件 + BR-2 + 假設 A-1）/ F058（BR-6 員工下拉清單來源）/ F061（Stage 0 前置條件 + Stage 4 員工 join + Blocked By）/ F063（BR-5 部門名稱 + ob_emphire 引用）/ F064（員工姓名 join 來源 + 假設 A-1）引用文字對齊；scope.md Epic 依賴圖補入 E05 → E07 封鎖關係 + E04 擷取任務範圍說明改寫為雙層 ETL 描述；E07 整體不新增 ETL Feature（pipeline 設定屬部署文件，由 Admin 於系統初始化建立 E04 + E05 並設定排程） | Spec Writer Agent |
| 2026-05-05 | 修正 E07-C ETL 設計：改為 E04 raw 擷取 + E05 Pipeline TargetLoad 雙層架構（AD-E07-12）；OBEMPHIRE 同步策略改為 full 全量（移除增量同步描述）；E07-F 檢核清單 E 類項目重組為 9 項（E1/E2/E4/E5/E7/E8 為 BLOCKER）；新增 AD-E07-12 架構決策；architecture-spec.md 升至 v2.1；open-questions OQ-E07-15 解決方案補入 E04 + E05 雙層流程說明及引用 AD-E07-12 | System Architect Agent |
| 2026-05-06 | 修正 `ob_pool_data` 結構：移除誤含的 `list_no` 欄位、PK 重設為 `(orgno, appl_no)`（system-architect 並行處理 AD-E07-13），blockquote 補「共享案件池」說明（120 欄無 LIST_NO，per-LIST_NO 候選由 Stage 1 join `ob_list_definition` 篩選條件動態取得），索引重構為 `(orgno, appl_no)` / `(custo_no)` / `(prod_kind)` / `(settle_src)` / `(card_type, card_level)`；F049 AC-4 文字明確化（讀 `ob_list_definition` 取篩選條件後對 `ob_pool_data` 套用 WHERE 子句，非按 list_no 過濾）；F061 / F063 檢視後語意正確不需改。新增 OQ-E07-18（`ob_pool_data` 結構落差，與 system-architect 並行處理）與 OQ-E07-19（`is_sales_manager` 實作完全缺漏 — migration / Entity / Auth Service / JWT payload 全無；spec 描述本身正確無需修改；Open，待 Phase 1 Track A M3 補建） | Spec Writer Agent |
| 2026-05-08 | 修正 ob_pool_data 結構落差（AD-E07-13）：移除 list_no（OBPOOLDATA 來源無此欄）、PK 重設為 `(orgno, appl_no)`；確立 ob_pool_data（L2 共享案件池）與 ob_pool_data_list（L3 分派結果）的「池/結果」分離架構；E07-D 補充 Stage 1 演算法說明（ob_pool_data 無 list_no，per-list 透過 JOIN ob_list_definition 篩選條件取候選）；新增 OQ-E07-18（schema 落差盤點，直接 ✅ Resolved，含 4 項落差處置）；architecture-spec.md 升至 v2.2 | System Architect Agent |
| 2026-05-06 | 清理 data-model `ob_pool_data` 章節殘留：移除 4 個 `ob_pool_data_list` 才有的欄位（`card_level` / `tier_level` / `card_type` / `case_type`）與對應 `(card_type, card_level)` 索引；對齊 AD-E07-13 完整映射 OBPOOLDATA（120 欄 + `_cdmp_extracted_at` = 121 欄，**無 LIST_NO 欄位**）。`ob_pool_data_list` 章節正確列示這些欄位不受影響 | Spec Writer Agent |
| 2026-05-06 | 修正 ob_list_definition.card_type VARCHAR(2) → VARCHAR(5)（dump 含 3 字元值如 SEC/SEB）；對齊 ob_levelcard_* 系列 | Spec Writer Agent |
