---
spec-id: CDMP-INDEX
title: SPEC 文件索引
version: "3.1"
date: 2026-05-17
status: Draft
---

# CDMP MVP — SPEC 文件索引

> **專案**：CDMP（Customer Data Management Platform）v1.0 MVP
> **文件總數**：132 份（7 支援文件含 spec-index 本檔 + 86 Feature 文件含新建 F006a + 39 圖表文件）
> **最後更新**：2026-05-16（**v3.0 / E07 合併重構 AD-E07 v3.0 — 破壞性大改**）

> **v3.0 / 2026-05-16 破壞性變更摘要**：依 system-architect AD-E07 v3.0 合併重構決議，廢除 v1.x 「`users.is_sales_manager` BOOLEAN + `users.e07_role` VARCHAR」正交雙欄位設計，整合為**單一欄位** `users.business_role VARCHAR(20) NULL`（enum：`'director'` / `'section_chief'` / `NULL`，DB CHECK constraint 強制）。系統實質身份共 **4 種 label**：「系統管理者」/「業務部長」/「業務處長」/「一般使用者」（廢除 v1.x「業務主管」中間語意層）。`SalesManagerGuard` 全數廢除，改用 `DirectorGuard` / `SectionChiefGuard` / `DirectorOrSectionChiefGuard` 三 Guard 體系。新增錯誤碼 `E07_ROLE_NOT_ASSIGNED`（403）取代未指派時的模糊 `AUTH_FORBIDDEN`。
>
> **本輪受影響檔案清單**：
> - **新建**：[F006a-update-business-role.md](features/F006a-update-business-role.md) v1.0（PATCH `/business-role` 唯一寫入入口）
> - **重寫 v2.0**：[F073-define-director-role.md](features/F073-define-director-role.md)、[F074-define-section-chief-role.md](features/F074-define-section-chief-role.md)
> - **DEPRECATED**：[F008-assign-change-role.md](features/F008-assign-change-role.md) v3.0-DEPRECATED（PATCH `/sales-manager-flag` 與 v1.4 短期過渡 PATCH `/e07-role` 端點均廢除）
> - **補修 banner**：F002 v2.0 / F005 v3.2 / F006 v2.3（核心欄位變更聲明 + 變更指向 F006a；§4.5 / §4.6 之完整重寫請以 F006a + F073 v2.0 + F074 v2.0 三 spec 為主要權威來源）
> - **支援文件**：data-model.md（User 實體 + m14 migration 規範）、error-handling.md v1.14（新增 `E07_ROLE_NOT_ASSIGNED` / `ACCOUNT_BUSINESS_ROLE_INVALID`；標 DEPRECATED：`ACCOUNT_E07_ROLE_INVALID` / `ACCOUNT_E07_ROLE_FORBIDDEN` / `E07_FORBIDDEN_DIRECTOR_ONLY`）、architecture-spec.md v2.11（§3.10 補 `AccountsService.updateBusinessRole()` + Guard 三元件清單）
> - **F050~F072 批次**：23 個 spec 中之 ASCII 識別字（`SalesManagerGuard` → `DirectorOrSectionChiefGuard` / `is_sales_manager` → `business_role` / `e07_role` → `business_role`）需於下一輪批次補修；本輪因 PowerShell 編碼事故（見下方 Known Issues）已 git checkout 還原；改採「依 demand 逐 spec 補修」策略，下游 TDD developer / QA 應以 [F002 v2.0 §4.6](features/F002-user-login.md#e07-角色矩陣) + [F006a](features/F006a-update-business-role.md) + [F073 v2.0](features/F073-define-director-role.md) + [F074 v2.0](features/F074-define-section-chief-role.md) 四檔為**唯一權威來源**，凡這四檔與其他 E07 spec 衝突時以這四檔為準
>
> **⚠️ Known Issues（本輪事故記錄）**：spec-writer agent 於 2026-05-16 嘗試以 PowerShell 5.1 批次替換 23 個 spec 之識別字時，因 `Get-Content -Raw` 預設 cp950 解碼導致 15 個 untracked 新檔（F075~F089）之中文段落損壞（識別字、結構、code 區塊、英文 ASCII 內容**仍正確**，僅中文文字段落變為亂碼或 `?` 替代字元）。F083 受兩次 PowerShell 操作疊加破壞，亂碼最重。**這 15 個 spec 之 ASCII 識別字、API 端點、欄位名、Guard 名、錯誤碼名等技術內容仍可信賴**；中文敘述、AC 描述、BR 文字部分需用戶提供原始備份或重新生成。已 commit 至 HEAD 之 31 個 spec（F048 / F049 / F050~F072 / F002 / F005 / F006 / F008 等）已透過 `git checkout -- ...` 完整還原至 HEAD 版（v1.x），未受編碼事故影響；其中 F002 / F005 / F006 / F008 已重新加上 v3.0 補修 banner（核心變更聲明）。
>
> **下一輪建議（給 spec-writer）**：(1) 用戶確認 F075~F089 救援策略（從本機備份恢復 / 從 `.claude/projects/.../*.jsonl` 對話記錄抓回 / 重新生成）；(2) F048~F072 之 23 個 spec 之識別字批次補修，**禁用 PowerShell**，改用 Edit 工具或 Git Bash sed（具備 LANG=zh_TW.UTF-8 環境）；(3) 補 F002 §4.5 / §4.6 完整重寫（目前僅 banner，矩陣詳細表格須以 [F002 v2.0 ${EDITOR_RESCUE}] 之既有編輯為基礎重作 — 由於 git checkout 還原，這些細節已遺失，需重做）。
>
> **本輪更新**：2026-05-16（**TDD P0 完成後 schema/spec 修補（AD-E07-17 三議題決議）**：architecture-spec 升至 v2.12（新增 AD-E07-17 三議題決議）；data-model 升至 v1.12（`assignment_audit_log.action` VARCHAR(10)→VARCHAR(30) + stage 系列 action；`ob_empl_set.created_at/updated_at` 補 dateColumnType helper 強制說明；`ob_list_definition.stage` 補 migration 歸屬明示為 m100 / m12 backfill 仍有效））
>
> **上一輪更新**：2026-05-16（**E07 重構衍生 spec 補修第二輪（system-architect Phase 1 / 6 項風險決議落地）**：F082 升至 v1.3（決議 #1 全員離職邊界選項 D + 決議 #2 503 + `FEATURE_NOT_ENABLED` + 決議 #4 `SectionChiefScopeGuard` method 分支 + 決議 #5 fixture factory 策略 + 決議 #6 `AssignmentRunGuardService.assertNoRunningRun()` 集中實作）；F079 / F081 升至 v1.1、F080 升至 v1.1、F083 升至 v1.2、F084 升至 v1.2、F085 升至 v1.2、F086 升至 v1.1、F087 升至 v1.1、F089 升至 v1.1（統一補入 BR-`AssignmentRunGuardService` cross-ref + Feature Flag fallback 503，相關 [ASSUMPTION] 升 ✅ Resolved）；F050 v2.0 §13.2 升 v2.0.1（Feature Flag Gating [ASSUMPTION] → [RESOLVED]，明確 flag = false 回 503 + `FEATURE_NOT_ENABLED`）；error-handling 升至 v1.12（新增 #feature-flag-errors 段落 + `FEATURE_NOT_ENABLED` 503 + `PERSONNEL_RATIO_OUT_OF_SCOPE` 補「僅適用 PUT/POST」備註 + `ASSIGNMENT_RUN_ALREADY_RUNNING` 補「`AssignmentRunGuardService` 集中拋出」備註）；data-model 補修（`ob_list_definition.stage` m12 migration 範圍說明 + `ob_emphire` 補 CI fixture 策略指引）；architecture-spec §3.10 補登 `AssignmentRunGuardService` / `StageTransitionService` / `PersonnelRatioValidationService` / `RatioValidationService` / `FeatureFlagGuard` / `SectionChiefScopeGuard` 6 個共用元件說明）

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
| Feature 文件（E07） | 38 |
| Mermaid 圖表 | 39 |
| **總計** | **131** |

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
| F005 | [F005-view-account-list.md](features/F005-view-account-list.md) | 查看帳號清單（**v3.2 / 2026-05-16 補 banner — `business_role` 欄位**）| US-011 | P0-MVP |
| F006 | [F006-edit-account.md](features/F006-edit-account.md) | 編輯帳號（**v2.3 / 2026-05-16 — 不含 `business_role` 寫入；變更入口走 F006a**）| US-012 | P0-MVP |
| **F006a** | [**F006a-update-business-role.md**](features/F006a-update-business-role.md) | **變更帳號業務角色（business_role）— PATCH `/api/v1/accounts/:id/business-role` 唯一寫入入口** | **US-014（接續，取代 F008 v3.x 之 sales-manager-flag / e07-role 端點）** | **P0-MVP（v1.0 新建 / 2026-05-16）** |
| F007 | [F007-disable-enable-account.md](features/F007-disable-enable-account.md) | 停用／啟用帳號 | US-013 | P1 |
| ~~F008~~ | ~~[F008-assign-change-role.md](features/F008-assign-change-role.md)~~ | ~~指派／變更角色（Admin / User）＋ 業務主管旗標切換~~ | ~~US-014~~ | **DEPRECATED v3.0-DEPRECATED / 2026-05-16**（PATCH `/sales-manager-flag` 與 v1.4 短期過渡 PATCH `/e07-role` 端點均廢除；業務角色變更改走 F006a；系統角色變更如需重啟動請另起 spec） |
| F009 | [F009-self-service-password-reset.md](features/F009-self-service-password-reset.md) | 自助式密碼重設 | US-015 | P0-MVP |
| F010 | [F010-admin-reset-password.md](features/F010-admin-reset-password.md) | Admin 重設使用者密碼 | US-016 | P0-MVP |
| F045 | [F045-business-role-definitions.md](features/F045-business-role-definitions.md) | 系統角色定義（系統預設角色 admin / user） | US-017 | P0-MVP |

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
| F048 | [F048-view-list-definition.md](features/F048-view-list-definition.md) | M01 名單定義入口（月份 + 階段總覽，v2.0 升版合併 US-104/105 入口骨架） | US-070, US-104, US-105 | P0-MVP |
| F049 | [F049-stage0-daily-estimate.md](features/F049-stage0-daily-estimate.md) | Stage 0 每日分派數量估算（含單一 LIST_NO 案件試算） | US-071 | P0-MVP |
| F050 | [F050-create-list-definition.md](features/F050-create-list-definition.md) | **草稿階段建立名單定義（動態篩選條件 + per-LIST_NO `cr_enabled` + 從上月複製，v2.0 重寫合併 US-106 / US-107 / US-120）** | US-106, US-107, US-120 | P0-MVP（**v2.0**）|
| F051 | [F051-edit-list-definition.md](features/F051-edit-list-definition.md) | **草稿階段編輯名單定義（限 `stage = 'draft'`，v2.0 重寫合併 US-106 AC-7 + US-107 AC-2/AC-5）** | US-106, US-107 | P0-MVP（**v2.0**）|
| F052 | [F052-disable-list-definition.md](features/F052-disable-list-definition.md) | **草稿階段停用名單定義（軟刪除，限 `stage = 'draft'`，v2.0 重寫）** | US-090, US-106 | P0-MVP（**v2.0**）|
| F077 | [F077-month-switch-and-stage-overview.md](features/F077-month-switch-and-stage-overview.md) | 月份切換與名單五階段總覽（M01 入口互動補強，合併 US-104 + US-105） | US-104, US-105 | P0-MVP |
| F078 | [F078-draft-advance-to-dept-ratio.md](features/F078-draft-advance-to-dept-ratio.md) | **草稿階段推進至部門比例設定（五階段流程引擎之第一個推進操作）** | US-108 | P0-MVP（**新增 v1.0**）|

#### M02 計分設定（5 Tab 結構，2026-05-14 擴充）

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 | 版本 |
|------------|------|------|-----------|--------|------|
| F069 | [F069-view-card-type-list.md](features/F069-view-card-type-list.md) | 查看 CARD_TYPE 計分卡類型清單（M02 Tab 1） | US-093 | P0-MVP | v1.0 |
| F070 | [F070-create-card-type.md](features/F070-create-card-type.md) | 新增 CARD_TYPE 計分卡類型 | US-094 | P0-MVP | v1.0 |
| F071 | [F071-edit-card-type.md](features/F071-edit-card-type.md) | 編輯 CARD_TYPE 計分卡類型 | US-095 | P0-MVP | v1.0 |
| F072 | [F072-disable-card-type.md](features/F072-disable-card-type.md) | 停用 CARD_TYPE 計分卡類型（級聯刪除） | US-096 | P0-MVP | v1.0 |
| F053 | [F053-view-scoring-dimensions.md](features/F053-view-scoring-dimensions.md) | 查看計分維度設定（M02 Tab 2） | US-072 | P0-MVP | v1.2 |
| F054 | [F054-edit-scoring-dimension.md](features/F054-edit-scoring-dimension.md) | 編輯計分維度與分數（M02 Tab 2 寫入） | US-073 | P0-MVP | v1.2 |
| F055 | [F055-edit-card-level-thresholds.md](features/F055-edit-card-level-thresholds.md) | 編輯 CARD_LEVEL 分級門檻（M02 Tab 4） | US-074、US-097 | P0-MVP | v1.6 |
| F056 | [F056-edit-tier-mapping.md](features/F056-edit-tier-mapping.md) | 編輯 TIER_LEVEL 對應表（M02 Tab 5） | US-075 | P0-MVP | v1.5 |

> M02 5 Tab 結構：Tab 1 = F069 CARD_TYPE 清單（含 F070/F071/F072 操作入口）、Tab 2 = F053 唯讀 + F054 寫入、Tab 3 = F054 分數設定子視圖、Tab 4 = F055 CARD_LEVEL 門檻、Tab 5 = F056 TIER 對應；Tab 1 selectedCardType 驅動 Tab 2~5 篩選。

#### M03 分派比例（重構後拆分，2026-05-15）

> **[通知 spec-writer]**：M03 分派比例模組已依五階段流程拆分為 M03a/M03b/M03c/M03d，需新增對應 Feature spec。F058（US-079）與 F060（US-091）標記 DEPRECATED。

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 | 狀態 |
|------------|------|------|-----------|--------|------|
| F057 | [F057-view-personnel-ratio.md](features/F057-view-personnel-ratio.md) | **查看人員比例設定（流程外快速查詢入口，v1.1 修訂；明確與 F088 分工 + 角色限縮為部長 / 處長 / Admin + 處長轄區過濾）** | US-078 | P0-MVP | **v1.1** |
| ~~F058~~ | ~~[F058-edit-personnel-ratio.md](features/F058-edit-personnel-ratio.md)~~ | ~~編輯人員比例設定~~ | ~~US-079~~ | P0-MVP | **DEPRECATED v2.0（2026-05-15 / E07 重構批次 5，由 F082 / F083 / F084 / F085 取代；限 `stage = 'personnel_ratio'` + 處長轄區 Guard + per-DEPT 加總驗證 + 獎懲模板獨立 spec）** |
| ~~F059~~ | ~~[F059-toggle-cr-reassignment.md](features/F059-toggle-cr-reassignment.md)~~ | ~~開關 CR 回分規則（全域開關）~~ | ~~US-080~~ + US-120 | P0-MVP | **DEPRECATED v2.0（2026-05-15 / E07 重構批次 3，由 F050 v2.0 per-LIST_NO `cr_enabled` 取代；US-120 spec 落差修正）** |
| ~~F060~~ | ~~[F060-edit-per-list-dept-ratio.md](features/F060-edit-per-list-dept-ratio.md)~~ | ~~設定 per-LIST_NO 部門比例~~ | ~~US-091~~ | P0-MVP | **DEPRECATED v2.0（2026-05-15 / E07 重構批次 4，由 F079 / F080 / F081 取代；限 `stage = 'dept_ratio'` 寫入 + 部長 + Admin 限制 + I-8 容忍誤差語意）** |

**M03a — 部門比例設定階段（E07 重構批次 4，2026-05-15 新增）**

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F079 | [F079-set-dept-ratio.md](features/F079-set-dept-ratio.md) | 部門比例設定（per-LIST_NO 各部門分配比例，限 `stage = 'dept_ratio'`） | US-109 | P0-MVP |
| F080 | [F080-advance-to-personnel-ratio.md](features/F080-advance-to-personnel-ratio.md) | 部門比例設定階段推進至個別業務比例設定 | US-110 | P0-MVP |
| F081 | [F081-rollback-to-draft.md](features/F081-rollback-to-draft.md) | 部門比例設定階段 Rollback 至草稿（清空 `ob_dept_pct`） | US-111 | P0-MVP |

**M03b — 個別業務比例設定階段（E07 重構批次 5，2026-05-15 新增）**

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F082 | [F082-set-personnel-ratio.md](features/F082-set-personnel-ratio.md) | **個別業務比例設定（per-LIST_NO 各部門業務員 RATION，處長轄區 + 部長代操作；v1.2 PO 決議 F082-A：離職員工保留顯示 + isResigned flag + 比例驗算排除 + ETL E07-OBEMPHIRE-Load pipeline 來源明確化）** | US-112 | P0-MVP（**v1.2**）|
| F083 | [F083-quick-ratio-template.md](features/F083-quick-ratio-template.md) | 獎懲快速比例模板（相對均等預設值之 ±10/20% 調整，OQ-E07-20 落地；v1.1 PO 決議 F083-A 覆蓋式模板落地） | US-113 | P0-MVP（**v1.1**）|
| F084 | [F084-advance-to-approval.md](features/F084-advance-to-approval.md) | 個別業務比例設定階段推進至簽核（多角色 Actor + per-DEPT 加總驗證；v1.1 PO 決議 F084-A 無代理推進 + 不增加 is_proxy_set 欄位 + F088 cross-ref） | US-114 | P0-MVP（**v1.1**）|
| F085 | [F085-rollback-to-dept-ratio.md](features/F085-rollback-to-dept-ratio.md) | 個別業務比例設定階段 Rollback 至部門比例（限部長 + Admin，跨轄區清空 `ob_empl_set`；v1.1 PO 決議 F085-B 跨轄區清空不需處長同意 + audit log 完整紀錄） | US-115 | P0-MVP（**v1.1**）|

**M03c — 簽核階段（E07 重構批次 6，2026-05-15 新增）**

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F086 | [F086-approve-to-ready.md](features/F086-approve-to-ready.md) | **部長核准名單（簽核 → 準備完成；限部長 + Admin；新建 `assignment_approval` 表）** | US-116 | P0-MVP |
| F087 | [F087-reject-to-personnel-ratio.md](features/F087-reject-to-personnel-ratio.md) | **部長拒絕並退回個別業務比例設定（簽核拒絕；限部長 + Admin；拒絕原因必填 1~500 字；觸發 F082 banner OQ-E07-21 落地）** | US-117 | P0-MVP |

**M03d — 準備完成階段（E07 重構批次 6，2026-05-15 新增）**

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F088 | [F088-ready-stage-summary.md](features/F088-ready-stage-summary.md) | **準備完成階段查詢摘要（部長 + 處長 + Admin 唯讀；含篩選 / 部門比例 / 個別業務比例 / CR 開關四區塊；處長轄區過濾；月跑前置條件即時計算；v1.1 補 `proxyStatus` 欄位 schema 對應 F084-A 落地）** | US-118 | P0-MVP（**v1.1**）|
| F089 | [F089-rollback-to-approval.md](features/F089-rollback-to-approval.md) | **準備完成階段 Rollback 至簽核（限部長 + Admin；保留設定資料；清空 `assignment_approval`）** | US-119 | P0-MVP |

#### M04 分派執行

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F061 | [F061-trigger-assignment-run.md](features/F061-trigger-assignment-run.md) | **觸發分派月跑（Stage 0~4 + 三份快照原子性寫入；v1.2 PO 決議 OQ-E07-29-A 邊緣 CARD_TYPE HB/SEB/SEC 跳過 + report_payload.skippedCases JSONB + 月跑仍 completed；v1.1 補「所有 active 名單 stage = 'ready'」前置條件 + Stage 3 CR 路徑改 per-LIST_NO `cr_enabled` + `MONTHLY_RUN_BLOCKED_LIST_NOT_READY` 錯誤碼）** | US-081 | P0-MVP（**v1.2**）|
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

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 | 版本 |
|------------|------|------|-----------|--------|------|
| F068 | [F068-edit-base-code.md](features/F068-edit-base-code.md) | E07 相關代碼維護（PROD_KIND / SPEC_TP / CASE_STATUS） | US-092 | P0-MVP | v1.2 |
| F075 | [F075-manage-pooldata-field-whitelist.md](features/F075-manage-pooldata-field-whitelist.md) | POOLDATA 篩選欄位白名單管理（含 `field_type` metadata；v1.3 補回 PO 決議 F076-C 軟停用機制 — BR-7 service 層批次 SET `is_active=false` + `deactivation_reason='field_type_changed'` 同 transaction） | US-102 | P0-MVP | **v1.3** |
| F076 | [F076-manage-categorical-field-values.md](features/F076-manage-categorical-field-values.md) | 類別型欄位可選值管理（v1.3 補回 PO 決議 F076-C 軟停用機制：§5.0 schema 補 `deactivation_reason` ENUM `'manual'`/`'field_type_changed'` + §5.4 新增 deactivate 端點 + AC-6 reason 必填 200 字 + BR-11/12/13 + `WHITELIST_OPTION_INACTIVE` 警告紀錄 cross-ref） | US-103 | P0-MVP | **v1.3** |

#### M07 角色與可見範圍（E07 重構批次 1，2026-05-15）

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 | 版本 |
|------------|------|------|-----------|--------|------|
| F073 | [F073-define-director-role.md](features/F073-define-director-role.md) | **部長角色定義與 E07 全模組權限（v1.1：§E02 整合 — PATCH `/accounts/:id/e07-role` 唯一寫入端點 + Token revoke 沿用 `password_changed_at` + 並存正交 BR）** | US-100 | P0-MVP | **v1.1** |
| F074 | [F074-define-section-chief-role.md](features/F074-define-section-chief-role.md) | **處長角色定義與轄區（`created_by`）限縮（v1.1：§E02 整合沿用 F073 §5.4 + 並存正交 BR）** | US-101 | P0-MVP | **v1.1** |

> **E07 角色矩陣權威來源**：[F002 §4.6](features/F002-user-login.md#e07-角色矩陣)（v1.4 補入「`is_sales_manager` 與 `e07_role` 正交維度說明」+ JWT Payload `e07_role` claim 規範 + Guard `req.user.e07_role` 暴露機制；v1.3 由 F073 / F074 導入定義部長 / 處長 / Admin × M01~M06 之 CRUD 矩陣與三層 Guard 行為）。F068（v1.2）/ F055（v1.6）/ F069~F072 / F075 / F076 / 後續 M03a~d spec 一律引用本節。

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
| [diagrams/F073-role-matrix.mmd](diagrams/F073-role-matrix.mmd) | E07 角色 × 模組權限矩陣決策流程（Guard 檢查順序） | Flowchart | F073, F074, F002 §4.6 |
| [diagrams/F075-whitelist-flow.mmd](diagrams/F075-whitelist-flow.mmd) | POOLDATA 篩選欄位白名單管理流程（seed / 列表 / CRUD） | Flowchart | F075, F076 |
| [diagrams/F077-month-switch-flow.mmd](diagrams/F077-month-switch-flow.mmd) | M01 月份切換 + 唯讀判斷 + lockState 渲染流程 | Flowchart | F077, F048 |
| [diagrams/F050-draft-create-flow.mmd](diagrams/F050-draft-create-flow.mmd) | F050 v2.0 草稿建立名單流程（含「從上月複製」分支與 feature flag gating） | Flowchart | F050 v2.0, F077 |
| [diagrams/F078-draft-advance-flow.mmd](diagrams/F078-draft-advance-flow.mmd) | F078 v1.0 草稿推進至部門比例設定流程（含 6 項前置條件嚴格驗證 + feature flag gating） | Flowchart | F078, F050 v2.0, F077 |
| [diagrams/F079-dept-ratio-flow.mmd](diagrams/F079-dept-ratio-flow.mmd) | F079 / F080 / F081 v1.0 部門比例設定整合流程（含 advance / rollback 分支 + service 層共用 helper 註記） | Flowchart | F079, F080, F081, F077 |
| [diagrams/F082-personnel-ratio-flow.mmd](diagrams/F082-personnel-ratio-flow.mmd) | F082 / F083 / F084 / F085 v1.0 個別業務比例設定整合流程（含轄區 Guard / 模板套用 / advance / rollback + service 層共用 helper 註記） | Flowchart | F082, F083, F084, F085, F077 |
| [diagrams/F086-approval-flow.mmd](diagrams/F086-approval-flow.mmd) | **F086 / F087 v1.0 簽核階段流程（核准 → ready / 拒絕 → personnel_ratio 兩條分支 + banner 觸發機制）** | Flowchart | F086, F087, F082 v1.1 |
| [diagrams/F088-ready-summary.mmd](diagrams/F088-ready-summary.mmd) | **F088 / F089 v1.0 準備完成階段查詢摘要與 Rollback 資訊架構（三角色 × 四區塊 + 月跑前置條件耦合 + monthlyRunReady 即時更新）** | Flowchart | F088, F089, F061 v1.1, F082 v1.1 |

### 狀態圖

| 文件 | 說明 | 圖表類型 | 相關 Feature |
|------|------|---------|-------------|
| [diagrams/account-states.md](diagrams/account-states.md) | 帳號狀態轉換 | State | F004, F007 |
| [diagrams/datasource-states.md](diagrams/datasource-states.md) | 資料來源狀態轉換 | State | F011, F013, F014, F015 |
| [diagrams/extraction-task-states.md](diagrams/extraction-task-states.md) | 擷取任務狀態轉換 | State | F017, F020, F021, F023, F025 |
| [diagrams/pipeline-states.md](diagrams/pipeline-states.md) | Pipeline 狀態轉換 | State | F028, F030, F031, F034 |
| [diagrams/pipeline-version-states.md](diagrams/pipeline-version-states.md) | Pipeline 版本狀態轉換 | State | F029, F030, F033, F037 |
| [diagrams/F061-assignment-run-states.mmd](diagrams/F061-assignment-run-states.mmd) | AssignmentRun 狀態轉換（pending/running/completed/failed） | State | F061, F062 |
| [diagrams/F077-stage-overview.mmd](diagrams/F077-stage-overview.mmd) | 名單定義五階段狀態轉換（draft → dept_ratio → personnel_ratio → approval → ready，含 advance / rollback / 拒絕 / 停用 / 遷移分支） | State | F077, F048, F050, F052, F061 |

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
   - **E07 建議順序**：**F073->F074**（M07 角色定義，E07 重構批次 1 前置依賴）->F068->**F075->F076**（M06 進階白名單）->**F048 v2.0->F077**（M01 入口 + 月份 / 階段總覽，E07 重構批次 2）->**F050 v2.0->F051 v2.0->F052 v2.0->F078**（M01 草稿階段建立 / 編輯 / 停用 / 推進，E07 重構批次 3；含 F059 同批次標 DEPRECATED + 移除舊路徑程式碼 + feature flag `ENABLE_E07_REFACTOR_PHASE3` 上線；原子性 I-1）->**F079->F080->F081**（M03a 部門比例設定 + 推進 + Rollback，E07 重構批次 4；含 F060 同批次標 DEPRECATED + service 層共用 `StageTransitionService` + `RatioValidationService` helper；建議與 F050 v2.0 §13 同套 flag gating，OQ-E07-37）->**F082 v1.1->F083->F084->F085**（M03b 個別業務比例 + 獎懲模板 + 推進至簽核 + Rollback 至部門比例，E07 重構批次 5；含 F058 同批次標 DEPRECATED + 新 `SectionChiefScopeGuard` + `PersonnelRatioValidationService` helper + `BONUS_PENALTY_TEMPLATE_INVALID` 等 4 個新錯誤碼；F082 v1.1 補 banner 渲染 OQ-E07-21）->**F086->F087->F088->F089**（M03c 簽核 + M03d 準備完成 + Rollback，E07 重構批次 6 最後一批；含新建 `assignment_approval` 表 + `MonthlyRunReadinessService` helper + `StageTransitionService.rejectTo` 新 helper + 4 個新錯誤碼 `MONTHLY_RUN_BLOCKED_LIST_NOT_READY` / `APPROVAL_INVALID_STAGE` / `APPROVAL_REJECT_REASON_REQUIRED` / `APPROVAL_REJECT_REASON_TOO_LONG`）->F049->**F069->F070->F071->F072**（CARD_TYPE CRUD，M02 入口）->F053->F054->F055->F056（M02 Tab 2~5）->F057 v1.1->~~F058~~（DEPRECATED 不實作）->~~F059~~（DEPRECATED 不實作）->~~F060~~（DEPRECATED 不實作）->**F061 v1.1**（補 ready 名單前置條件 + Stage 3 CR per-LIST_NO 路徑 + `MONTHLY_RUN_BLOCKED_LIST_NOT_READY` 錯誤碼）->F062->F063->F064->F065->F066->F067

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

**E07 新增**（42 個，2026-05-14 M02 計分設定擴充 +4，2026-05-15 M07 角色 + M06 進階 +4，2026-05-15 重構批次 2 +1，2026-05-15 重構批次 3 +1 含 F059 標 DEPRECATED，2026-05-15 重構批次 4 +3 含 F060 標 DEPRECATED，2026-05-15 重構批次 5 +4 含 F058 標 DEPRECATED，2026-05-15 重構批次 6 +4 M03c/d）：
F048, F049, F050（v2.0.1）, F051（v2.0）, F052（v2.0）, F053, F054, F055, F056, F057（v1.1）, ~~F058（v2.0 DEPRECATED）~~, ~~F059（v2.0 DEPRECATED）~~, ~~F060（v2.0 DEPRECATED）~~, F061（v1.2）, F062, F063, F064, F065, F066, F067, F068, F069, F070, F071, F072, F073, F074, F075, F076（v1.1）, F077, **F078**, **F079（v1.1）**, **F080（v1.1）**, **F081（v1.1）**, **F082（v1.3）**, **F083（v1.2）**, **F084（v1.2）**, **F085（v1.2）**, **F086（v1.1）**, **F087（v1.1）**, **F088（v1.1）**, **F089（v1.1）**

**P0-MVP 總計：78 個 Feature**（37 既有 + 42 E07 新增 - 1 既有 F058 計入但已標 DEPRECATED 不再實作；實際新建構數 37 既有 + 41 E07 = 78。F058 / F059 / F060 標 DEPRECATED 之既有計算保留於索引以供脈絡追溯，但不重複實作）

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
F002 v1.3 §4.6 ──權威定義──> F073, F074, F068, F055, F069~F072, F075, F076（E07 角色矩陣）
F073 ──> F074（處長以部長為對比基準）、F075、F076、F068 v1.2、F055 v1.6（部長 / 處長 Guard 行為導入）
F074 ──> F068 v1.2（處長對 M06 唯讀 cross-ref）、F055 v1.6（M02 處長 Nav 完全不可見 cross-ref）
F075 ──> F076（categorical 欄位可選值掛父表）、後續 US-106 spec（新名單動態篩選欄位來源）
F076 ──> 後續 US-106 spec（新名單多選元件選項來源）
F068 ──> F050, F051（PROD_KIND / SPEC_TP / CASE_STATUS 代碼就緒；CASEYEAR 為前端 hard-coded 不阻擋）
F048 v2.0 ──> F077（互動補強：月份切換 + 階段總覽）
F048 v2.0 + F077 ──> F049（Stage 0 估算於清單頁觸發）
F048 v2.0 + F077 ──> F050, F051, F052, F060（清單頁為入口；操作按鈕渲染依 F077 角色 × 階段矩陣）
F077 ──> F050 v2.0（新建名單預設 stage = 'draft'）、F052 v2.0（停用僅在草稿階段）、F061（月跑前置條件 stage = 'ready'）、F078（草稿推進）、後續批次 4+ Rollback / 簽核 spec
F050 v2.0 ──> F051 v2.0, F052 v2.0, F078, F060（需先有草稿名單才能編輯/停用/推進/設定比例）
F050 v2.0 + F078 + F059 程式碼移除 ──原子性上線（I-1）──> 受 feature flag ENABLE_E07_REFACTOR_PHASE3 統一控制；違反順序回 500 LIST_DRAFT_ADVANCE_BLOCKED_LEGACY_F059
F050 v2.0 ──取代──> ~~F059~~（per-LIST_NO `cr_enabled` 取代全域 OBASSIGNSET CR 開關；US-120 spec 落差修正）
F075, F076 ──> F050 v2.0（動態篩選條件欄位來源 + categorical 可選值來源）

# E07 重構批次 4 — M03a 部門比例設定（2026-05-15）
F078 ──> F079（推進至 dept_ratio 後才能設定部門比例）
F079 ──> F080（部門比例加總 = 100% 才可推進至個別業務比例設定）
F079 ──> F081（Rollback 至草稿時清空 ob_dept_pct）
F080 ──> F082（推進至 personnel_ratio 後才能設定個別業務比例）
F081 ──> F050 v2.0 / F051 v2.0 / F052 v2.0 / F078（Rollback 後重新可用）
F079 / F080 / F081 ──取代──> ~~F060~~（限 stage = 'dept_ratio' + 部長 + Admin + I-8 容忍誤差語意；DEPRECATED v2.0）
F079 / F080 / F081 ──共用 service helper──> StageTransitionService.assertStageEquals / advanceTo / rollbackTo + RatioValidationService.assertSumEquals100 + assertEachInRange（system-architect 抽出，與後續 M03b/c/d 共用）
F079 / F080 / F081 ──[ASSUMPTION] 與 F050 v2.0 §13 同套 ENABLE_E07_REFACTOR_PHASE3 flag gating──> 詳見 OQ-E07-37

# E07 重構批次 5 — M03b 個別業務比例（2026-05-15）
F080 ──> F082（推進至 personnel_ratio 後處長 / 部長 / Admin 設定業務員比例）
F079 / F080 ──> F082（前置 ob_dept_pct 加總 = 100% 為 F082 寫入前置條件）
F082 ──> F083（獎懲快速模板為 F082 之 UI 子模組；計算結果透過 F082 PUT 儲存）
F082 ──> F084（per-DEPT 加總 = 100% 為推進至 approval 之前置條件）
F082 ──> F085（Rollback 清空 ob_empl_set 跨轄區所有紀錄）
F084 ──> F086 / F087（推進至 approval 後可核准或拒絕）
F085 ──> F079 / F080（Rollback 後重新可寫入 / 重新推進）
F082 / F083 / F084 / F085 ──取代──> ~~F058~~（限 stage = 'personnel_ratio' + 處長轄區 Guard + per-DEPT 加總 + 獎懲模板獨立；DEPRECATED v2.0）
F082 / F084 ──共用 service helper──> SectionChiefScopeGuard（新）+ PersonnelRatioValidationService.assertDeptSumEquals100 / assertAllDeptsSumEquals100（system-architect 抽出，與後續 M03d 共用）
F085 ──共用 service helper──> StageTransitionService.rollbackTo cleanupFn = DELETE ob_empl_set WHERE list_no（與 F081 共用 helper）
F082 / F083 / F084 / F085 ──[ASSUMPTION] 與 F050 v2.0 §13 同套 ENABLE_E07_REFACTOR_PHASE3 flag gating──> 詳見 OQ-E07-37

# E07 重構批次 6 — M03c 簽核 + M03d 準備完成（2026-05-15，最後一批）
F084 ──> F086（推進至 approval 後部長 / Admin 核准 → ready）
F084 ──> F087（推進至 approval 後部長 / Admin 拒絕 → personnel_ratio + 清空 ob_empl_set）
F086 ──> F088（核准後名單出現於 ready 清單供查詢）
F086 ──> F061 v1.1（核准後 stage = 'ready'，月跑前置條件 BR-6 達成）
F086 ──> F089（核准後可 Rollback 至 approval）
F087 ──> F082 v1.1（拒絕觸發 banner 顯示於 F082 頁面，OQ-E07-21 落地；資料來源 GET response latestRejection 欄位）
F088 ──> F061 v1.1（monthlyRunReady.allReady 為月跑前置條件 1 之核心入口）
F088 ──> F089（提供「退回簽核」按鈕入口）
F089 ──> F086 / F087（Rollback 後重新可核准 / 拒絕）
F089 ──連動──> F088 monthlyRunReady 即時更新（從 ready 清單移出）+ F082 latestRejection = null（清空 assignment_approval）
F086 / F087 ──共用 DB 表──> assignment_approval（新建表，data-model #assignment_approval）
F086 / F087 ──共用 service helper──> StageTransitionService 擴充 advanceTo + 新增 rejectTo（含 postActionFn = INSERT assignment_approval；建議由 system-architect 抽出）
F089 ──共用 service helper──> StageTransitionService.rollbackTo cleanupFn = DELETE assignment_approval WHERE list_no（與 F081 / F085 共用 helper）
F088 ──新建 helper──> MonthlyRunReadinessService.calculateReadiness(workYm)（建議由 system-architect 抽出）
F086 / F087 / F088 / F089 ──[ASSUMPTION] 與 F050 v2.0 §13 同套 ENABLE_E07_REFACTOR_PHASE3 flag gating──> 詳見 OQ-E07-37
F057 v1.1 ──分工──> F088（F057 流程外快速查詢；F088 流程內最終確認）
F061 v1.1 ──取代──> ~~OBASSIGNSET 全域 CR 路徑~~（Stage 3 改讀 per-LIST_NO ob_list_definition.cr_enabled，對齊 F050 v2.0 / F059 廢棄）
F068 ──> F069（PROD_KIND 代碼為 CARD_TYPE 綁定來源）
F069 ──> F070, F071, F072（CARD_TYPE CRUD 鏈）
F069 ──> F053, F054, F055, F056（Tab 1 selectedCardType 驅動 Tab 2~5 篩選）
F070 ──> F054, F055, F056（新建 CARD_TYPE 後才能設定維度 / CARD_LEVEL / TIER 對應）
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
| 2026-05-15 | **E07 重構批次 1**（4 個新 spec + 3 個既有 spec 升版 + 連帶更新）：新增 F073（部長角色定義，US-100）、F074（處長角色定義 + `created_by` 轄區限縮，US-101）、F075（POOLDATA 篩選欄位白名單，US-102）、F076（類別型欄位可選值，US-103）；新增 2 個圖表（F073 角色矩陣決策、F075 白名單流程）；F002 升至 v1.3（新增 §4.6 E07 角色矩陣作為權威來源 + Director / SectionChief 應用層角色定義 + 三層 Guard 規格）；F068 升至 v1.2（補 BR-6 處長禁用寫入 + 處長視圖規則）；F055 升至 v1.6（補 BR-10 處長對 M02 完全不可見，OQ-C-03 決議）；data-model.md 新增 `field_whitelist`（#field-whitelist-entity）+ `categorical_field_value`（#categorical-field-value-entity）兩表 schema；error-handling.md 新增 `E07_FORBIDDEN_DIRECTOR_ONLY`（403）/ `E07_FORBIDDEN_SECTION_CHIEF_SCOPE`（403）/ `WHITELIST_FIELD_DUPLICATE`（422）/ `WHITELIST_FIELD_NOT_FOUND`（404）/ `OPTION_VALUE_DUPLICATE`（422）/ `OPTION_VALUE_NOT_FOUND`（404）/ `OPTION_FIELD_TYPE_MISMATCH`（422）共 7 個錯誤碼；P0-MVP 增至 66 個 Feature；新增 M07 角色與可見範圍模組（F073/F074）與 M06 進階段落（F075/F076）；TDD 順序前置 F073->F074->F068->F075->F076 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 2 — M01 流程基礎**（1 個新 spec + 1 個既有 spec 升版 + 連帶更新）：新增 F077（月份切換與名單五階段總覽，合併 US-104 + US-105 為單一 M01 入口互動補強 spec）；F048 升至 v2.0（從「查看本月名單定義清單」升版為「M01 名單定義入口（月份 + 階段總覽）」，雙頁籤改由 `stage` 篩選器涵蓋，新增 `stage` / `readonly` / `currentWorkYm` / `selectedYm` 欄位，操作按鈕渲染改依 F077 角色 × 階段矩陣）；新增 2 個圖表（F077-stage-overview 五階段狀態轉換 stateDiagram-v2、F077-month-switch-flow 月份切換 + 唯讀判斷流程）；data-model.md `ob_list_definition` 新增 `stage VARCHAR(20)`（5 值 CHECK constraint）+ `status VARCHAR(10)` 明確定義、新增「舊名單遷移規則（I-5）」段落（既有 OBMLISTDF 全數初始 `stage = 'ready'`）、新增 §`current_work_ym` 規則（每月 1 號 0:00 UTC+8 切換 / ±12 個月範圍 / 後端唯一計算來源）、新增 `(project_workym, stage, status)` 與 `(created_by)` 兩個索引；error-handling.md 新增 `WORK_YM_OUT_OF_RANGE`（422）/ `WORK_YM_INVALID_FORMAT`（422）/ `LIST_HISTORICAL_READONLY`（403）共 3 個錯誤碼；P0-MVP 增至 67 個 Feature；TDD 順序補入 F048 v2.0->F077；下游 F050/F051/F052/F061 將於批次 3 統一補入「歷史月份寫入 → 403」cross-ref 與 `stage` 流轉行為 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 5 — M03b 個別業務比例設定 + F058 廢棄**（4 個新 spec + 1 個既有 spec 標 DEPRECATED + 連帶更新）：新增 F082（個別業務比例設定 / US-112，per-LIST_NO + per-DEPT 業務員 RATION，處長轄區 Guard + 部長 / Admin 跨轄區）、F083（獎懲快速比例模板 / US-113，OQ-E07-20 落地：均等分配 + 相對 ±10/20% 調整 + 邊界阻擋 + 前端計算 + 後端防呆）、F084（推進至簽核 / US-114，多角色 Actor + per-DEPT 加總 = 100% 驗證 + 處長 / 部長 / Admin 三角色推進邏輯 + 無代理處長時部長代推進）、F085（Rollback 至部門比例 / US-115，限部長 + Admin + 跨轄區清空 `ob_empl_set` + 保留 `ob_dept_pct`）；F058 標 DEPRECATED v2.0（保留 v1.0 內容 + 頂部 banner + cross-ref F082 / F083 / F084 / F085）；新增 1 個圖表 F082 個別業務比例整合流程（含轄區 Guard + 模板套用 + advance / rollback）；data-model.md `ob_empl_set` 補入「比例驗證規則（per-DEPT 加總）」「轄區規則（I-3）」「stage 鎖定規則」「FK 級聯規則」「`project_workym` 補建決策」5 個段落；error-handling.md 新增 `PERSONNEL_RATIO_SUM_NOT_100`（422，per-DEPT，取代 `PERSONNEL_RATIO_SUM_INVALID`）/ `PERSONNEL_RATIO_DEPT_NOT_FOUND`（422）/ `PERSONNEL_RATIO_OUT_OF_SCOPE`（403）/ `BONUS_PENALTY_TEMPLATE_INVALID`（422）共 4 個錯誤碼；標 `PERSONNEL_RATIO_SUM_INVALID` 為 DEPRECATED；`STAGE_ROLLBACK_BLOCKED` 補入 F085 為相關功能；`E07_FORBIDDEN_SECTION_CHIEF_SCOPE` 註明 F082 採更具體之 `PERSONNEL_RATIO_OUT_OF_SCOPE`；P0-MVP 增至 74 個 Feature；新增 OQ-E07-40（F083 「相對預設值 vs 相對部門佔比 ÷ 人數」之語意確認，待 PO）；TDD 順序補入 F082 → F083 → F084 → F085；F058 加入「DEPRECATED 不實作」清單；提示批次 6 進入 M03c/d 簽核 + 準備完成 + F061/F057 修訂 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 3 — M01 草稿階段（最高風險批次，含 F059 廢棄與原子性上線約束）**（1 個新 spec + 3 個既有 spec 升版 + 1 個既有 spec 標 DEPRECATED + 連帶更新）：新增 F078（草稿推進至部門比例設定，US-108）；F050 升至 v2.0（重大改寫：取代來源 US-088 → US-106 / US-107 / US-120；Actor 收斂為部長 + Admin；篩選條件改為 F075 白名單動態驅動 + `condition_payload` JSONB 欄位；新增 per-LIST_NO `cr_enabled` 欄位取代 F059 OBASSIGNSET 全域路徑；新增「從上月名單複製」AC-10 OQ-D-01 決議；建立後 `stage = 'draft'`；§13 完整描述原子性上線約束 + feature flag `ENABLE_E07_REFACTOR_PHASE3` gating + 部署順序 T0-T3 + 失敗回滾路徑）；F051 升至 v2.0（僅 `stage = 'draft'` 可編輯篩選條件 + CR 開關；非草稿階段回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`；表單欄位規範指向 F050 v2.0 共用）；F052 升至 v2.0（僅 `stage = 'draft'` 可停用；非草稿階段回 422 `LIST_STAGE_NOT_DRAFT`，提示先 Rollback）；F059 標 DEPRECATED v2.0（保留歷史脈絡與 v1.0 內容、頂部加廢棄 banner、cross-ref F050 v2.0 / F051 v2.0 / F061 / data-model `cr_enabled` / US-120）；新增 2 個圖表（F050-draft-create-flow 含「從上月複製」分支 + feature flag gating；F078-draft-advance-flow 含 6 項前置條件嚴格驗證 + feature flag gating）；data-model.md `ob_list_definition` 新增 `cr_enabled BOOLEAN NOT NULL DEFAULT TRUE` + `condition_payload JSONB NULL` 兩個欄位；新增「草稿階段欄位編輯規則」表格段落（哪些欄位草稿可改 / 推進後鎖定）；新增「從上月名單複製」API 行為規則段落（OQ-D-01）；error-handling.md 新增 `LIST_FILTER_FIELD_NOT_IN_WHITELIST`（422，置於 assignment-list-errors）+ 新增 `assignment-stage-transition-errors` 子段落（4 個錯誤碼：`LIST_STAGE_NOT_DRAFT`、`LIST_STAGE_TRANSITION_FORBIDDEN`、`LIST_DRAFT_NO_CONDITIONS`、`LIST_DRAFT_ADVANCE_BLOCKED_LEGACY_F059`）共 5 個新錯誤碼；P0-MVP 增至 68 個 Feature；依賴鏈補入「F050 v2.0 + F078 + F059 程式碼移除原子性上線（I-1）」、「F050 v2.0 取代 F059」、「F075/F076 ──> F050 v2.0 動態篩選來源」；提示批次 4 進入 M03a 部門比例 + F060 廢棄 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 6 — M03c 簽核 + M03d 準備完成 + F061/F057 修訂（最後一批）**（4 個新 spec + 3 個既有 spec 升版 + 連帶更新）：新增 F086（部長核准名單 / US-116，簽核 → ready，限部長 + Admin，新建 `assignment_approval` 表）、F087（部長拒絕並退回個別業務比例設定 / US-117，簽核 → personnel_ratio + 跨轄區清空 `ob_empl_set`，拒絕原因必填 1~500 字，OQ-E07-21 用戶決議落地：F082 GET response 補 `latestRejection` 欄位作為 banner 觸發資料來源）、F088（準備完成階段查詢摘要 / US-118，部長 / 處長 / Admin 三角色唯讀，含篩選 / 部門比例 / 個別業務比例 / CR 開關四區塊摘要，處長轄區過濾，月跑前置條件 `monthlyRunReady` 即時計算，與 F086 共用 GET `summary/{listNo}` 端點，與 F057 並存分工）、F089（準備完成 Rollback 至簽核 / US-119，限部長 + Admin，保留設定資料 + DELETE `assignment_approval`）；F082 升至 v1.1（OQ-E07-21 落地：補 §7.x「拒絕 banner 渲染與互動」UI 規範 + GET response 補 `latestRejection` 欄位 + BR-2a「相對 %」UI 顯示語意 OQ-E07-40 落地）；F083 補 BR-2a「相對 %」UI 顯示語意（OQ-E07-40 用戶決議落地）；F061 升至 v1.1（OQ Q6.1=A 用戶決議落地：AC-1 第 2 項新增「所有 active 名單需 `stage = 'ready'`」前置條件 + Stage 3 CR 回分讀取路徑改為 per-LIST_NO `ob_list_definition.cr_enabled` 欄位 + 快照 `config` 內容含 per-LIST_NO `cr_enabled` 取代全域開關 + 新增錯誤碼 `MONTHLY_RUN_BLOCKED_LIST_NOT_READY`）；F057 升至 v1.1（明確「流程外快速查詢入口」定位 + 與 F088 分工說明 + 角色限縮為部長 / 處長 / Admin + 處長轄區過濾 + Response 補 `stage` / `viewerRole` / `isInScope` 欄位 + 「stage 篩選器」+ 「LIST_NO 連結依 stage 跳轉至 F082 / F088 / F048」）；新增 2 個圖表（F086-approval-flow 簽核流程含核准 → ready / 拒絕 → personnel_ratio 兩條分支 + banner 觸發機制；F088-ready-summary 準備完成階段查詢摘要與 Rollback 資訊架構含三角色 × 四區塊 × 月跑前置條件耦合）；data-model.md 新增 `assignment_approval` 表完整 schema（含 PK / FK / 索引建議 / 多次拒絕 / 重複核准場景處理表 / [ASSUMPTION] 4 項待 system-architect 決議）；error-handling.md 新增 `MONTHLY_RUN_BLOCKED_LIST_NOT_READY`（422，含 `details.notReadyLists` 陣列）+ 新增 `assignment-approval-errors` 子段落（3 個錯誤碼 `APPROVAL_INVALID_STAGE` / `APPROVAL_REJECT_REASON_REQUIRED` / `APPROVAL_REJECT_REASON_TOO_LONG`）共 4 個新錯誤碼 + 補 `STAGE_ROLLBACK_BLOCKED` 沿用至 F089 描述 + 補 `E07_FORBIDDEN_DIRECTOR_ONLY` 適用範圍含 F086 / F087 / F089；P0-MVP 增至 78 個 Feature；依賴鏈補入「批次 6 — M03c/d」完整鏈、「F057 v1.1 vs F088 分工」、「F061 v1.1 取代 OBASSIGNSET 全域 CR 路徑」；TDD 順序補入 F082 v1.1->F083->F084->F085->**F086->F087->F088->F089**->F057 v1.1->F061 v1.1；**E07 重構 spec-writer 階段 100% 完成**（剩餘事項移交 system-architect 處理 [ASSUMPTION] 與 helper 抽出 / OQ-E07-37 flag gating 決議 / OQ-E07-40 DB 儲存值語意） | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 4 — M03a 部門比例設定階段（含 F060 廢棄）**（3 個新 spec + 1 個既有 spec 標 DEPRECATED + 連帶更新）：新增 F079（部門比例設定 per-LIST_NO，US-109）/ F080（部門比例設定階段推進至個別業務比例設定，US-110）/ F081（部門比例設定階段 Rollback 至草稿，US-111）；3 個 spec 統一沿用 `DirectorGuard`（部長 + Admin，處長一律 403 `E07_FORBIDDEN_DIRECTOR_ONLY`）；F079 限 `stage = 'dept_ratio'` 寫入（非此階段 422 `LIST_STAGE_TRANSITION_FORBIDDEN`）；F079 比例驗證採容忍 ±0.01% 浮點誤差（沿用 Invariant I-8）；F080 採 7 項前置條件嚴格驗證（沿用 F078 模式）；F081 採嚴格單階 Rollback（不允許跨階捷徑，OQ-E07-26）；F060 標 DEPRECATED v2.0（保留 v1.x 歷史內容、頂部加廢棄 banner + 取代路徑摘要 + 語意變更對照表 + 原子性上線 [ASSUMPTION] 沿用 F050 v2.0 §13 flag gating，OQ-E07-37）；新增 1 個圖表（F079-dept-ratio-flow 整合 F079 / F080 / F081 三 spec 含 advance / rollback / cleanup 子流程 + service 層共用 helper 註記）；data-model.md `ob_dept_pct` 新增「比例驗證規則（I-8）」+「stage 鎖定規則」+「FK 級聯規則 [ASSUMPTION]」3 個段落；error-handling.md 新增 `assignment-ratio-errors` 之 `RATIO_SUM_NOT_100`（取代舊 `RATIO_SUM_INVALID`，後者標 deprecated）+ `RATIO_OUT_OF_RANGE` 共 2 個；新增 `assignment-stage-transition-errors` 之 `STAGE_ADVANCE_PRECONDITION_FAILED`（含 `details.reason` / `details.actualSum`）+ `STAGE_ROLLBACK_BLOCKED`（含 `details.reason` = `already_at_first_stage` / `wrong_source_stage`）共 2 個；總計 4 個新錯誤碼；P0-MVP 增至 71 個 Feature；依賴鏈補入「F079 / F080 / F081 取代 F060」、「F079 / F080 / F081 共用 service helper」、「F079 / F080 / F081 與 F050 v2.0 §13 同套 flag gating [ASSUMPTION]」；spec 中明確要求 system-architect 抽出 `StageTransitionService`（`assertStageEquals` / `advanceTo` / `rollbackTo`）+ `RatioValidationService`（`assertSumEquals100` / `assertEachInRange`）兩個 service helper 供後續 M03b/c/d 共用；提示批次 5 進入 M03b 個別業務比例 + F058 廢棄 | Spec Writer Agent |
| 2026-05-16 | **E07 重構衍生 spec 補修（system-architect Phase 1 / 6 個 PO 決策落地）**（7 份 spec 升版 + 2 個支援文件連帶更新）：F082 v1.1 → v1.2（PO 決議 F082-A：業務員清單從 `resign_date IS NULL` 改為「全取，含已離職員工帶 `isResigned = true` flag」+ UI 顯示「離職」badge + per-DEPT 比例驗算排除離職員工 + 既有 ration 紀錄保留供歷史 + 明確 `appdb.ob_emphire` 由 ETL E07-OBEMPHIRE-Load pipeline 載入；BLOCKING 議題解除）；F083 v1.0 → v1.1（PO 決議 F083-A：模板覆蓋式 — 每次以均等值 100/N 為基準重新計算，非疊加 + UI 顯示目前套用模板名稱 + §12 A-2 [RESOLVED]）；F084 v1.0 → v1.1（PO 決議 F084-A：無代理處長允許推進 + 不增加 `is_proxy_set` 欄位 + 推進條件以 `ob_empl_set` 加總合法為唯一判斷 + AC-9 補 F088 cross-ref + §12 A-6 [RESOLVED]）；F085 v1.0 → v1.1（PO 決議 F085-B：跨轄區清空不需處長同意 + 直接執行 + audit log 完整紀錄 + §12 A-5 [RESOLVED]）；F088 v1.0 → v1.1（補 `personnelRatios[].proxyStatus` schema：`{ isProxySet, setBy, setByRole }` + service 層即時計算 `ob_empl_set.created_by` 對應角色，無需新增 DB 欄位 + UI 顯示「此部門由 {setByRole} 代為設定」標示）；F061 v1.1 → v1.2（PO 決議 OQ-E07-29-A：Stage 2 邊緣 CARD_TYPE HB/SEB/SEC 跳過該案件不拋錯 + `report_payload.skippedCases[]` JSONB 結構 BR-12/BR-13 + 月跑仍 `status = 'completed'` + §8 補警告紀錄行為）；F076 v1.0 → v1.1（PO 決議 F076-C：F075 切換 `field_type` 離開 categorical 時批次 SET `is_active = false` 軟停用，**不 CASCADE 刪除** + 補 `deactivation_reason ENUM('manual', 'field_type_changed') DEFAULT 'manual'` 欄位於 m10 一次到位 + 歷史保留供追溯 + 既有名單月跑沿用 BR-3 不阻擋 + §12 A-5 [RESOLVED]）；error-handling v1.10 → v1.11（新增 `#assignment-run-warnings` 段落 + `RUN_REPORT_SKIPPED_CASES` 警告紀錄（F061 v1.2 引入）+ `WHITELIST_OPTION_INACTIVE` 警告紀錄（F076 v1.1 引入）+ 前端展示建議）；data-model 連帶更新（`assignment_run.report_payload` JSONB 欄位 + 結構範例與欄位說明 + `categorical_field_value.deactivation_reason` ENUM 欄位 + F076 v1.1 BR-7/BR-10 業務規則更新 + `ob_emphire` blockquote 補 ETL pipeline 識別碼 `E07-OBEMPHIRE-Load` 與 F082 v1.2 使用模式說明）；spec-index 升至 v2.15；Feature 版本標註對應更新；**spec-writer 階段補修完成，等用戶確認後可交棒 test-designer 規劃測試策略** | Spec Writer Agent |
| 2026-05-16 | **E07 重構衍生 spec 補修第二輪（system-architect Phase 1 / 6 項風險決議落地）**（11 份 spec 升版 + 3 個支援文件連帶更新 + architecture-spec 元件補登）：F082 v1.2 → v1.3（**決議 #1 全員離職邊界選項 D**：per-DEPT sum=0% 允許 + `PersonnelRatioValidationService.assertDeptSumEquals100()` 短路 return + GET response 補 `activeCount` / `sumValidated` / `allResigned` 欄位 + 新增 AC-14；**決議 #2 503 + `FEATURE_NOT_ENABLED`** 新增 BR-16 + AC-15；**決議 #4 `SectionChiefScopeGuard` method 分支**：GET 不攔截、PUT/POST 攔截 + 新增 §5.x 對照表 + BR-14 改寫 + §12 A-1 [RESOLVED]；**決議 #5 fixture factory 策略**：§11 補測試 Fixture 策略章節（`apps/api/test/fixtures/ob-emphire.fixture.ts` + ob_emphire 必要欄位清單）；**決議 #6 `AssignmentRunGuardService.assertNoRunningRun()` 集中實作**：新增 BR-15 + AC-11 補充 + §11 實作 Checklist 補 5 項；§12 A-6 [RESOLVED]）；F079 v1.0 → v1.1、F080 v1.0 → v1.1、F081 v1.0 → v1.1、F083 v1.1 → v1.2、F084 v1.1 → v1.2、F085 v1.1 → v1.2、F086 v1.0 → v1.1、F087 v1.0 → v1.1、F089 v1.0 → v1.1（統一補入 BR-`AssignmentRunGuardService` cross-ref + Feature Flag fallback 503 BR + 相關 [ASSUMPTION] 升 ✅ Resolved）；F050 v2.0 → v2.0.1（§13.2 Feature Flag Gating [ASSUMPTION] → [RESOLVED]，明確 flag = false 回 503 + `FEATURE_NOT_ENABLED`，統一套用至 F078 / F079~F089）；error-handling v1.11 → v1.12（新增 `#feature-flag-errors` 段落 + `FEATURE_NOT_ENABLED`（503）+ `PERSONNEL_RATIO_OUT_OF_SCOPE` 補「僅適用 PUT/POST；GET 對越權回 200 空陣列」備註 + `ASSIGNMENT_RUN_ALREADY_RUNNING` 補「由 `AssignmentRunGuardService.assertNoRunningRun()` 集中拋出」備註 + 套用範圍清單）；data-model 補修（`ob_list_definition.stage` m12 migration `status != 'inactive'` AND `stage = 'draft'` 範圍規則表 + `ob_emphire` 補 CI fixture 策略指引 / fixture factory 對應 / 必要欄位清單）；architecture-spec §3.10 E07 Assignment Module 補登 6 個共用元件說明：`AssignmentRunGuardService`（新增 / 決議 #6）/ `StageTransitionService` / `PersonnelRatioValidationService`（補全員離職邊界）/ `RatioValidationService` / `FeatureFlagGuard`（補登 / 決議 #2）/ `SectionChiefScopeGuard`（補 method 分支 / 決議 #4）；spec-index 升至 v2.16；Feature 版本標註對應更新；**spec-writer 階段補修第二輪完成，等用戶確認後可正式進入 TDD developer 實作** | Spec Writer Agent |
| 2026-05-16 | **E07 重構衍生 spec 補修第三輪（§E02 整合 PO 三項決議落地）**（5 份 spec 升版 + 3 個支援文件連帶更新）：tdd-implementation 提出 E02 整合範圍，PO 確認 3 個關鍵決議：**(A) 新增專用 PATCH `/accounts/:id/e07-role`** — 沿用 F008 sales-manager-flag 端點對稱模式，不擴充既有 PUT `/accounts/:id`；**(C) Token revoke 沿用 F009 / F010 既有 `password_changed_at` 機制** — 不新建 token blocklist 表、不新增 `AuthService.revokeAllUserTokens(userId)` method，最低跨模組耦合；**(D) `is_sales_manager` 與 `e07_role` 完全並存不遷移** — 兩欄位語意正交，`is_sales_manager` 管「業務主管讀寫權」、`e07_role` 管「E07 月度流程審批層級」，獨立 Guard 檢查可同時存在於同一 user 帳號。本批次：**F073 v1.0 → v1.1**（新增 §5.4「§E02 整合」+ §5.4.2 Token revoke 機制詳述 + 2 個錯誤碼 `ACCOUNT_E07_ROLE_INVALID`（422）/ `ACCOUNT_E07_ROLE_FORBIDDEN`（403）+ BR-9（角色變更入口唯一性）/ BR-10（Token revoke 同步觸發）/ BR-11（正交維度並存）+ AC-7 升級為 [RESOLVED]（明確 `password_changed_at` 比對流程與 audit log 結構）+ §12 假設 A-1 / A-2 升 ✅ Resolved）；**F074 v1.0 → v1.1**（新增 §5.4 沿用 F073 §5.4 規格 + BR-10（正交並存）/ BR-11（Token revoke 同步觸發）+ AC-7 升 [RESOLVED] + §12 假設 A-1 升 ✅ Resolved）；**F002 v1.3 → v1.4**（§4.6 補入「`is_sales_manager` 與 `e07_role` 正交維度說明」+ JWT Payload 補充「`e07_role` claim 型別 + `req.user.e07_role` 暴露」+ E07 模組 × 角色 CRUD 權限矩陣前補「欄位對應 `e07_role` 維度」說明 + E07 應用層角色定義表三欄調整指派入口為 PATCH `/accounts/:id/e07-role` + Guard 規格補 `req.user` 比對寫法）；**F006 v2.1 → v2.2**（功能摘要明確列示「`e07_role` 不在 PUT 範圍」+ BR-9 變更入口為 PATCH `/accounts/:id/e07-role` 專用端點 + 交叉參考補 F073 / F074 + §更新紀錄補建）；**architecture-spec v2.9 → v2.10**（§3.10 Account Service 元件補登 `AccountsService.updateE07Role()` method 完整規格表 + [RESOLVED] `AuthService.revokeAllUserTokens()` 不新增決策說明 + covers list 補入 F073 / F074）；**data-model.md** `users` 表 E07 新增欄位區塊補 `e07_role` 欄位定義（VARCHAR(20) NULL，CHECK 限三值）+ 5 條業務規則（`e07_role` 由 Admin 設定 / 並存正交 / 變更觸發 `password_changed_at` / 不在 PUT 範圍 / 對應 PATCH `/accounts/:id/e07-role` 端點）+ 索引建議 `(e07_role) WHERE NOT NULL` + Migration `[ASSUMPTION]` m06 待 system-architect 確認；**error-handling v1.12 → v1.13**（ACCOUNT 領域新增 `ACCOUNT_E07_ROLE_INVALID`（422）/ `ACCOUNT_E07_ROLE_FORBIDDEN`（403）共 2 個錯誤碼）；spec-index 升至 v2.17；F073 / F074 / F002 / F006 版本標註更新；**spec-writer §E02 整合補修完成，等用戶確認後可進入 ui-ux-designer 補 07-account-list.html prototype 對應端點 UI** | Spec Writer Agent |
| 2026-05-17 | **E07 重構 spec 補修第四輪（F075 / F076 v1.3 — 補回 v1.2 救援過程遺失之 PO 決議 F076-C 軟停用機制）**（2 份 spec 升版 + spec-index 連帶更新；data-model / error-handling 已於 2026-05-16 完成不重複動工）：**F075 v1.2 → v1.3**（BR-7 從「保留紀錄不刪除」強化為「service 層批次 SET `is_active = false` + `deactivation_reason = field_type_changed`，同 PATCH transaction」+ AC-6 confirm Modal 文字補「將自動停用 N 個可選值」（N 由 `GET options?active=true` 預查）+ 稽核 details 補 `deactivatedOptionCount` + §7 UI Modal 文字升級 + 與 F076 v1.3 BR-11/BR-12 對齊）；**F076 v1.2 → v1.3**（§5.0 新增概念 schema 區塊明列 `deactivation_reason VARCHAR(30) NULL` ENUM `manual` / `field_type_changed` + AC-6 停用流程 reason 改為必填 textarea 200 字（OQ-E07-21 Resolved）+ §5.1 GET 補 `includeInactive=true` query 供歷史追溯 + §5.3 PATCH 改為「啟用專用」、§5.4 新增 deactivate 專屬端點 `PATCH /:columnName/options/:optionValue/deactivate` + DTO `{ isActive: false, reason: string }` 200 字驗證 + 新增 BR-11（F076-C 批次軟停用）/ BR-12（歷史保留 + `includeInactive` 查詢）/ BR-13（manual 停用 reason 必填）+ 跨參照 data-model `pooldata_field_option.deactivation_reason` + error-handling `WHITELIST_OPTION_INACTIVE` 警告碼）；**data-model.md（無需動工）**：`pooldata_field_option.deactivation_reason VARCHAR(30) NULL` ENUM 規範已於 2026-05-16 第一輪補修時寫入（v1.1 / data-model 行 1973+1984），與本輪 F075/F076 v1.3 spec 完全一致；**error-handling.md（無需動工）**：`WHITELIST_OPTION_INACTIVE` 警告碼已於 2026-05-16 第一輪補修時寫入 `#assignment-run-warnings` 段落（行 322），與本輪 F076 v1.3 cross-ref 完全一致；spec-index 升至 v3.1；**提示：等用戶確認後 TDD 可啟動 B5（含 F076-C 軟停用實作 — F075 service 層批次 UPDATE + F076 deactivate 端點 + reason 必填驗證）** | Spec Writer Agent |
