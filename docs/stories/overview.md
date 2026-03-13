# CDMP MVP — 產品需求總覽

> **專案名稱**：CDMP（Customer Data Management Platform）企業客戶資料治理平台
> **版本**：v1.0 (MVP)
> **最後更新**：2026-03-06

## 快速統計

| 指標 | 數量 |
|------|------|
| Epic 總數 | 3 |
| User Story 總數 | 16 |
| 非功能需求（NFR）總數 | 2 |
| 目標階段 | Phase 1（MVP） |
| 目標使用者 | 企業內部團隊（500+ 人） |
| 主要角色 | Admin（管理者）、User（使用者） |

## Epic 索引

| Epic ID | Epic 名稱 | 階段 | Stories 數量 | Epic Brief |
|---------|-----------|------|-------------|------------|
| E01 | [驗證與登入](epics/E01-auth-and-login/epic-brief.md) | 1（MVP） | 3 | [epic-brief.md](epics/E01-auth-and-login/epic-brief.md) |
| E02 | [帳號與角色管理](epics/E02-account-role-management/epic-brief.md) | 1（MVP） | 7 | [epic-brief.md](epics/E02-account-role-management/epic-brief.md) |
| E03 | [資料來源管理](epics/E03-datasource-management/epic-brief.md) | 1（MVP） | 6 | [epic-brief.md](epics/E03-datasource-management/epic-brief.md) |

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
| E03 | [US-020](epics/E03-datasource-management/US-020-add-datasource.md) | 新增資料來源 | Must Have |
| E03 | [US-021](epics/E03-datasource-management/US-021-view-datasource-list.md) | 查看資料來源清單 | Must Have |
| E03 | [US-022](epics/E03-datasource-management/US-022-edit-datasource.md) | 編輯資料來源 | Must Have |
| E03 | [US-023](epics/E03-datasource-management/US-023-delete-datasource.md) | 刪除資料來源 | Should Have |
| E03 | [US-024](epics/E03-datasource-management/US-024-test-datasource-connection.md) | 測試連線 | Must Have |
| E03 | [US-025](epics/E03-datasource-management/US-025-datasource-status-dashboard.md) | 狀態監控儀表板 | Should Have |

## 非功能需求（NFR）

| NFR ID | 名稱 | 連結 |
|--------|------|------|
| NFR-001 | [安全性](non-functional/NFR-001-security.md) | 驗證、授權、資料加密 |
| NFR-002 | [效能](non-functional/NFR-002-performance.md) | 回應時間、並發數、可用性 |

## 階段規劃

### Phase 1 — MVP（當前）
重點：核心 CRUD、驗證登入、基礎 RBAC 權限管控、資料來源管理

- E01 全部 Stories（US-001 ~ US-003）
- E02 全部 Stories（US-010 ~ US-016）
- E03 全部 Stories（US-020 ~ US-025）
- NFR-001、NFR-002

### Phase 2 — 進階規劃（未來）
重點：使用者角色功能存取控制、資料同步排程、進階資料來源類型、稽核日誌

- User 角色的功能存取權管控
- 資料同步排程
- 進階資料來源類型（API、檔案上傳）
- 稽核日誌與操作歷程

## AI Agent 導覽指南

| Agent 角色 | 起始點 | 關鍵檔案 |
|-----------|--------|---------|
| SDD（規格撰寫） | 本檔案 | 各 epic-brief.md |
| 系統架構師 | 本檔案 + NFR | 各 US-*.md 的 Technical Notes |
| 測試設計師 | 各 epic-brief.md | 各 US-*.md 的 AC 與 Test Cases |
| TDD（實作） | 各 US-*.md | Given/When/Then AC 作為測試規格 |
| UI/UX 設計師 | 各 US-*.md | AC 細節作為互動流程參考 |
