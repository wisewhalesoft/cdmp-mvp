# CDMP MVP — 產品需求總覽

> **專案名稱**：CDMP（Customer Data Management Platform）企業客戶資料治理平台
> **版本**：v1.0 (MVP)
> **最後更新**：2026-04-21

## 快速統計

| 指標 | 數量 |
|------|------|
| Epic 總數 | 7 |
| User Story 總數 | 66 |
| 非功能需求（NFR）總數 | 5 |
| 目標階段 | Phase 1（MVP）+ Phase 2（Customer 360） |
| 目標使用者 | 企業內部團隊（500+ 人） |
| 主要角色 | Admin（管理者）、User（使用者）、業務主管（Sales Manager） |
| 最後更新 | 2026-04-21（新增 E07 客戶名單分派 18 個 Story；新增 NFR-003/004/005；Epic 索引加入「類型」欄） |

## Epic 索引

| Epic ID | Epic 名稱 | 類型 | 階段 | Stories 數量 | Epic Brief |
|---------|-----------|------|------|-------------|------------|
| E01 | [驗證與登入](epics/E01-auth-and-login/epic-brief.md) | 平台能力 | 1（MVP） | 3 | [epic-brief.md](epics/E01-auth-and-login/epic-brief.md) |
| E02 | [帳號與角色管理](epics/E02-account-role-management/epic-brief.md) | 平台能力 | 1（MVP） | 8 | [epic-brief.md](epics/E02-account-role-management/epic-brief.md) |
| E03 | [資料來源管理](epics/E03-datasource-management/epic-brief.md) | 平台能力 | 1（MVP） | 6 | [epic-brief.md](epics/E03-datasource-management/epic-brief.md) |
| E04 | [資料擷取管理](epics/E04-data-extraction/epic-brief.md) | 平台能力 | 1（MVP） | 11 | [epic-brief.md](epics/E04-data-extraction/epic-brief.md) |
| E05 | [ETL Pipeline 管理](epics/E05-etl-pipeline/epic-brief.md) | 平台能力 | 1（MVP） | 18 | [epic-brief.md](epics/E05-etl-pipeline/epic-brief.md) |
| E06 | [Customer 360](epics/E06-customer-360/epic-brief.md) | 下游應用 | 2 | 2 | [epic-brief.md](epics/E06-customer-360/epic-brief.md) |
| E07 | [客戶名單分派](epics/E07-app-customer-list-assignment/epic-brief.md) | 下游應用 | 1（MVP） | 18 | [epic-brief.md](epics/E07-app-customer-list-assignment/epic-brief.md) |

## Story 地圖

| Epic | Story ID | Story 名稱 | 優先級 |
|------|----------|-----------|--------|
| E01 | [US-001](epics/E01-auth-and-login/US-001-admin-login.md) | Admin 登入 | Must Have |
| E01 | [US-002](epics/E01-auth-and-login/US-002-user-login.md) | User 登入 | Must Have |
| E01 | [US-003](epics/E01-auth-and-login/US-003-logout.md) | 登出 | Must Have |
| E02 | [US-010](epics/E02-account-role-management/US-010-create-account.md) | 建立帳號 | Must Have |
| E02 | [US-011](epics/E02-account-role-management/US-011-view-account-list.md) | 查看帳號清單 | Must Have |
| E02 | [US-012](epics/E02-account-role-management/US-012-edit-account.md) | 編輯帳號 | Must Have |
| E02 | [US-013](epics/E02-account-role-management/US-013-disable-enable-account.md) | 停用／啟用帳號 | Should Have |
| E02 | [US-014](epics/E02-account-role-management/US-014-assign-change-role.md) | 指派／變更角色 | Must Have |
| E02 | [US-015](epics/E02-account-role-management/US-015-self-service-password-reset.md) | 自助式密碼重設 | Must Have |
| E02 | [US-016](epics/E02-account-role-management/US-016-admin-reset-password.md) | Admin 重設使用者密碼 | Must Have |
| E02 | [US-017](epics/E02-account-role-management/US-017-business-role-definitions.md) | 角色定義（系統預設角色） | Must Have |
| E03 | [US-020](epics/E03-datasource-management/US-020-add-datasource.md) | 新增資料來源 | Must Have |
| E03 | [US-021](epics/E03-datasource-management/US-021-view-datasource-list.md) | 查看資料來源清單 | Must Have |
| E03 | [US-022](epics/E03-datasource-management/US-022-edit-datasource.md) | 編輯資料來源 | Must Have |
| E03 | [US-023](epics/E03-datasource-management/US-023-delete-datasource.md) | 刪除資料來源 | Should Have |
| E03 | [US-024](epics/E03-datasource-management/US-024-test-datasource-connection.md) | 測試連線 | Must Have |
| E03 | [US-025](epics/E03-datasource-management/US-025-datasource-status-dashboard.md) | 狀態監控儀表板 | Should Have |
| E04 | [US-030](epics/E04-data-extraction/US-030-create-extraction-task.md) | 建立擷取任務 | Must Have |
| E04 | [US-031](epics/E04-data-extraction/US-031-view-extraction-task-list.md) | 查看擷取任務清單 | Must Have |
| E04 | [US-032](epics/E04-data-extraction/US-032-edit-extraction-task.md) | 編輯擷取任務 | Must Have |
| E04 | [US-033](epics/E04-data-extraction/US-033-toggle-extraction-task.md) | 啟用／停用擷取任務 | Must Have |
| E04 | [US-034](epics/E04-data-extraction/US-034-run-extraction-task.md) | 立即執行／重新執行擷取任務 | Must Have |
| E04 | [US-035](epics/E04-data-extraction/US-035-view-extraction-logs.md) | 查看擷取日誌 | Must Have |
| E04 | [US-036](epics/E04-data-extraction/US-036-scheduled-extraction.md) | 排程自動執行 | Must Have |
| E04 | [US-037](epics/E04-data-extraction/US-037-extraction-dashboard.md) | 擷取監控儀表板 | Should Have |
| E04 | [US-038](epics/E04-data-extraction/US-038-delete-extraction-task.md) | 刪除擷取任務 | Should Have |
| E04 | [US-039](epics/E04-data-extraction/US-039-preview-raw-data.md) | 查看擷取資料預覽 | Must Have |
| E04 | [US-051](epics/E04-data-extraction/US-051-orphan-task-recovery.md) | 孤兒任務回收（系統啟動自動修復） | Must Have |
| E05 | [US-040](epics/E05-etl-pipeline/US-040-pipeline-list.md) | 查看 Pipeline 列表 | Must Have |
| E05 | [US-041](epics/E05-etl-pipeline/US-041-create-pipeline.md) | 建立 Pipeline | Must Have |
| E05 | [US-042](epics/E05-etl-pipeline/US-042-pipeline-editor.md) | 視覺化轉換編輯器 | Must Have |
| E05 | [US-043](epics/E05-etl-pipeline/US-043-execute-pipeline.md) | 執行 Pipeline | Must Have |
| E05 | [US-044](epics/E05-etl-pipeline/US-044-toggle-pipeline.md) | 啟用／停用 Pipeline | Must Have |
| E05 | [US-045](epics/E05-etl-pipeline/US-045-pipeline-logs.md) | 查看 Pipeline 日誌 | Must Have |
| E05 | [US-046](epics/E05-etl-pipeline/US-046-pipeline-version.md) | Pipeline 版本管理 | Should Have |
| E05 | [US-047](epics/E05-etl-pipeline/US-047-delete-pipeline.md) | 刪除 Pipeline | Should Have |
| E05 | [US-048](epics/E05-etl-pipeline/US-048-monitor-dashboard.md) | Pipeline 監控儀表板 | Should Have |
| E05 | [US-049](epics/E05-etl-pipeline/US-049-target-tables.md) | 目標表 Domain-Oriented 規劃 | Could Have |
| E05 | [US-050](epics/E05-etl-pipeline/US-050-publish-pipeline-version.md) | 發布 Pipeline 版本 | Must Have |
| E05 | [US-052](epics/E05-etl-pipeline/US-052-node-column-change-badge.md) | 節點欄位變化統計 Badge | Must Have |
| E05 | [US-053](epics/E05-etl-pipeline/US-053-node-inspector-panel-diff.md) | 節點 Inspector Panel 欄位 Diff | Should Have |
| E05 | [US-054](epics/E05-etl-pipeline/US-054-node-badge-hover-tooltip.md) | 節點 Badge Hover Tooltip | Could Have |
| E05 | [US-055](epics/E05-etl-pipeline/US-055-etl-execution-engine-core.md) | ETL 執行引擎核心框架 | Must Have |
| E05 | [US-056](epics/E05-etl-pipeline/US-056-etl-nodes-extract-merge-dedup.md) | ETL 節點實作 — Extract、Merge、Dedup、TypeCast、DerivedField | Must Have |
| E05 | [US-057](epics/E05-etl-pipeline/US-057-etl-nodes-mapping-conditional-load.md) | ETL 節點實作 — FieldMapping、Conditional、TargetLoad | Must Have |
| E05 | [US-058](epics/E05-etl-pipeline/US-058-lookup-node-dual-input.md) | Lookup 節點雙輸入重設計 | Must Have |
| E06 | [US-060](epics/E06-customer-360/US-060-customer-search-list.md) | 客戶搜尋與清單 | Must Have |
| E06 | [US-061](epics/E06-customer-360/US-061-customer-360-view.md) | 單一客戶 360 檢視 | Must Have |
| E07 | [US-070](epics/E07-app-customer-list-assignment/US-070-M01-view-list-definition.md) | 查看本月名單定義清單 | Must Have |
| E07 | [US-071](epics/E07-app-customer-list-assignment/US-071-M01-stage0-daily-estimate.md) | Stage 0 每日分派數量估算 | Must Have |
| E07 | [US-072](epics/E07-app-customer-list-assignment/US-072-M02-view-scoring-dimensions.md) | 查看計分維度設定 | Must Have |
| E07 | [US-073](epics/E07-app-customer-list-assignment/US-073-M02-edit-scoring-dimension.md) | 編輯計分維度與分數 | Must Have |
| E07 | [US-074](epics/E07-app-customer-list-assignment/US-074-M02-edit-card-level-thresholds.md) | 編輯 CARD_LEVEL 分級門檻 | Must Have |
| E07 | [US-075](epics/E07-app-customer-list-assignment/US-075-M02-edit-tier-mapping.md) | 編輯 TIER_LEVEL 對應表 | Must Have |
| E07 | [US-076](epics/E07-app-customer-list-assignment/US-076-M03-view-dept-ratio.md) | 查看部門比例設定 | Must Have |
| E07 | [US-077](epics/E07-app-customer-list-assignment/US-077-M03-edit-dept-ratio.md) | 編輯部門比例設定 | Must Have |
| E07 | [US-078](epics/E07-app-customer-list-assignment/US-078-M03-view-personnel-ratio.md) | 查看人員比例設定 | Must Have |
| E07 | [US-079](epics/E07-app-customer-list-assignment/US-079-M03-edit-personnel-ratio.md) | 編輯人員比例設定 | Must Have |
| E07 | [US-080](epics/E07-app-customer-list-assignment/US-080-M03-toggle-cr-reassignment.md) | 開關 CR 回分規則 | Must Have |
| E07 | [US-081](epics/E07-app-customer-list-assignment/US-081-M04-trigger-assignment-run.md) | 觸發分派月跑 | Must Have |
| E07 | [US-082](epics/E07-app-customer-list-assignment/US-082-M04-view-run-progress.md) | 查看分派執行進度 | Must Have |
| E07 | [US-083](epics/E07-app-customer-list-assignment/US-083-M04-view-run-result-summary.md) | 查看分派結果摘要 | Must Have |
| E07 | [US-084](epics/E07-app-customer-list-assignment/US-084-M04-export-assignment-result.md) | 匯出分派結果 | Must Have |
| E07 | [US-085](epics/E07-app-customer-list-assignment/US-085-M05-view-run-history-list.md) | 查看歷史執行紀錄清單 | Must Have |
| E07 | [US-086](epics/E07-app-customer-list-assignment/US-086-M05-view-run-snapshot-detail.md) | 查看執行快照詳情 | Must Have |
| E07 | [US-087](epics/E07-app-customer-list-assignment/US-087-M05-compare-run-results.md) | 比對兩次執行結果差異 | Should Have |

## 非功能需求（NFR）

| NFR ID | 名稱 | 連結 |
|--------|------|------|
| NFR-001 | [安全性](non-functional/NFR-001-security.md) | 驗證、授權、資料加密 |
| NFR-002 | [效能](non-functional/NFR-002-performance.md) | 回應時間、並發數、可用性 |
| NFR-003 | [分派執行效能](non-functional/NFR-003-assignment-execution-perf.md) | 月跑端對端執行時間上限 |
| NFR-004 | [快照原子性](non-functional/NFR-004-snapshot-integrity.md) | 三份快照原子性寫入保證 |
| NFR-005 | [結果準確性](non-functional/NFR-005-result-accuracy.md) | 新舊系統誤差 < 3% 可驗證 |

## 階段規劃

### Phase 1 — MVP（當前）
重點：核心 CRUD、驗證登入、基礎 RBAC 權限管控（Admin/User）、資料來源管理、資料擷取管理、ETL Pipeline 管理

- E01 全部 Stories（US-001 ~ US-003）
- E02 全部 Stories（US-010 ~ US-017）— 含 US-017 角色定義（Admin/User）
- E03 全部 Stories（US-020 ~ US-025）
- E04 全部 Stories（US-030 ~ US-039、US-051）
- E05 全部 Stories（US-040 ~ US-050、US-052 ~ US-058）
- NFR-001、NFR-002

### Phase 1（新增）— 客戶名單分派（E07）
重點：業務主管可獨立操作名單定義、計分設定、分派比例、觸發月跑、匯出結果與查看歷史快照，IT 零介入

- E07 全部 Stories（US-070 ~ US-087）
- NFR-003（分派執行效能）、NFR-004（快照原子性）、NFR-005（結果準確性）

### Phase 2 — Customer 360
重點：Customer 360 客戶搜尋與單一客戶檢視

**業務決策（2026-04-13）**：E06 範圍精簡，僅保留核心客戶查詢功能。標籤管理、變更歷史、RBAC 細粒度存取、匯出、互動紀錄、報表、品質回報等功能移除。

- E06 Stories（US-060 ~ US-061）：
  - US-060 客戶搜尋與清單
  - US-061 單一客戶 360 檢視
- 多目標表整合（customer_interaction / customer_financial / customer_service）— 規劃中
- 稽核日誌與操作歷程 — 規劃中

## AI Agent 導覽指南

| Agent 角色 | 起始點 | 關鍵檔案 |
|-----------|--------|---------|
| SDD（規格撰寫） | 本檔案 | 各 epic-brief.md |
| 系統架構師 | 本檔案 + NFR | 各 US-*.md 的 Technical Notes |
| 測試設計師 | 各 epic-brief.md | 各 US-*.md 的 AC 與 Test Cases |
| TDD（實作） | 各 US-*.md | Given/When/Then AC 作為測試規格 |
| UI/UX 設計師 | 各 US-*.md | AC 細節作為互動流程參考 |
