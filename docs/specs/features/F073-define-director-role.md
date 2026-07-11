---
spec-id: F073
title: 部長角色定義與 E07 全模組權限
feature-id: F073
source-story: US-100
epic: E07
module: M07 角色與可見範圍
priority: P0-MVP
version: "2.0"
date: 2026-05-16
status: Draft
---

# F073: 部長角色定義與 E07 全模組權限

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

> **v2.0 / 2026-05-16 破壞性重寫（E07 合併重構 AD-E07 v3.0）**：本版本廢除 v1.1 「`is_sales_manager` + `e07_role` 正交雙欄位」與 `SalesManagerGuard` 設計，改採**單一欄位** `users.business_role VARCHAR(20) NULL`（enum：`'director'` / `'section_chief'` / `NULL`，DB CHECK constraint）；變更入口由 v1.1 之 PATCH `/e07-role` 改為 [F006a](F006a-update-business-role.md) 之 PATCH `/business-role`；廢除 `SalesManagerGuard`，改用 `DirectorGuard` / `DirectorOrSectionChiefGuard` / `SectionChiefGuard` 三 Guard 體系；新增錯誤碼 `E07_ROLE_NOT_ASSIGNED`（403，明示需聯絡 admin 補設）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F002-user-login.md` v2.0 §4.6 E07 角色矩陣 + `F006a-update-business-role.md` + `data-model.md#user-entity` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `F074-define-section-chief-role.md` + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件 §7 UI/UX 需求 |
| Architect | 本文件 + `architecture-spec.md` v2.11 §3.10 + AD-E07 v3.0 |

---

## 對應 User Story

- 來源 Story：[US-100-M07-define-director-role.md](../../stories/epics/E07-app-customer-list-assignment/US-100-M07-define-director-role.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M07 角色與可見範圍

---

## 1. 功能摘要

定義 E07「業務部長（Director）」應用層角色之語意 / 權限矩陣 / Guard 行為 / 稽核要求。部長對 E07 全模組（M01 名單定義 / M02 計分設定 / M03 分派比例 / M04 分派執行 / M05 快照歷史 / M06 代碼維護）擁有完整 CRUD 權限。Admin 自動繼承部長全範圍存取，無需額外指派；持有 `role = 'admin'` 即視為已擁有 Director 範圍。E07 部長角色之指派入口位於 E02 帳號管理頁透過 [F006a](F006a-update-business-role.md)（PATCH `/api/v1/accounts/:id/business-role`），E07 內部不另設角色指派 UI。具體 Guard 實作與 RBAC 檢查順序由 [F002 v2.0 §4.6](F002-user-login.md#e07-角色矩陣) 作為唯一權威來源。

## 2. 使用者故事

**As a** Admin
**I want** 在 E07 系統中定義「業務部長（Director）」角色，確立其對 E07 全模組的完整操作權限
**So that** 部長可透過 CDMP 平台跨處瀏覽與操作所有 E07 配置面板（白名單維護、計分設定、部門比例、簽核、月名單分派觸發、名單 CRUD…），無需逐一向各處長索取資料

## 3. 前置條件

- E01 驗證登入功能已就緒（F001 / F002 v2.0）
- E02 系統角色已定義（F045）
- E02 業務角色指派端點已就緒（[F006a](F006a-update-business-role.md) PATCH `/business-role`）
- `users` 表已建立 `business_role VARCHAR(20) NULL` 欄位 + CHECK constraint（m14 migration）
- `assignment_audit_log` 表已建立

## 4. 驗收標準

### AC-1：Admin 透過 F006a 指派部長角色

- **Given** Admin 已登入並進入 E02 帳號管理頁
- **When** Admin 對某帳號透過 F006a 端點寫入 `business_role = 'director'`
- **Then** 該帳號取得 E07 全模組讀取與寫入權限
- **And** 部長的可見範圍涵蓋**所有**處長所管轄之名單、計分設定、分派比例、執行紀錄、代碼維護
- **And** 角色指派操作寫入 `assignment_audit_log`（`action = 'ASSIGN_ROLE'`、`entity_type = 'business_role'`、`entity_id = '{userId}|director'`、`after_value = { business_role: 'director' }`，由 F006a 統一寫入）
- **And** E07 內部頁面**不**提供任何角色指派 UI

### AC-2：部長對 E07 全模組擁有完整操作權限

- **Given** 帳號 `business_role = 'director'` 並登入 CDMP
- **When** 進入 E07 任意模組（M01 / M02 / M03 / M04 / M05 / M06）
- **Then** 顯示**所有**處長所設定之資料，不受處長轄區（`created_by`）篩選限制
- **And** 所有寫入按鈕（新增 / 編輯 / 停用 / 白名單維護 / 計分設定 / 部門比例設定 / 簽核 / 觸發月名單分派）均可使用
- **And** M06 白名單維護（F075）、M02 計分設定（F069~F072 / F053~F056）等部長專屬功能擁有完整寫入權限

### AC-3：Admin 自動繼承 E07 全範圍存取

- **Given** 帳號持有 `role = 'admin'`，`business_role` 為任意值（含 NULL）
- **When** 進入 E07 任意模組或呼叫任意 E07 API
- **Then** 系統視同 Director，自動具備全範圍存取
- **And** 系統不需要（也不應要求）Admin 另行被指派 `business_role = 'director'`
- **And** 後端 `DirectorGuard` 通過條件為「`role = 'admin'` OR `business_role = 'director'`」，避免硬編碼

### AC-4：部長與處長互斥

- **Given** 帳號 `business_role = 'section_chief'`
- **When** Admin 透過 F006a 將其改為 `business_role = 'director'`
- **Then** 直接覆寫成功（單一欄位設計，部長與處長不可同時持有）
- **And** 該帳號舊 JWT 立即失效（沿用 F006a token revoke 機制），重新登入後新 JWT `businessRole = 'director'`，獲得 E07 全範圍存取
- **And** audit log `before_value = { business_role: 'section_chief' }`、`after_value = { business_role: 'director' }`

### AC-5：未指派 business_role 帳號無法進入 E07 模組

- **Given** 帳號 `business_role = NULL` 且 `role = 'user'`
- **When** 嘗試存取 E07 任意頁面或 API
- **Then** 後端 `DirectorOrSectionChiefGuard` 攔截，回 HTTP 403，錯誤碼 `E07_ROLE_NOT_ASSIGNED`，訊息「您尚未被指派 E07 業務角色，請聯絡系統管理員補設。」
- **And** 前端依 F002 v2.0 §4.5 矩陣不渲染「客戶名單分派」sidebar 群組
- **And** 不洩漏任何 E07 資料

### AC-6：處長無法操作部長專屬功能

- **Given** 帳號 `business_role = 'section_chief'`（非 Director、非 Admin）
- **When** 嘗試進入或操作以下任一部長專屬功能：M06 白名單維護（F075）/ M06 類別型欄位可選值管理（F076）/ M02 計分設定全部端點（F069~F072 / F053~F056，含 GET）/ M03a 部門比例設定（F079）/ 月名單分派觸發（F061）/ 名單新增（F050）/ 編輯（F051）/ 停用（F052）/ M03c 簽核（F086 / F087）
- **Then** 後端 `DirectorGuard` 攔截，回 HTTP 403，錯誤碼 `AUTH_FORBIDDEN`
- **And** 前端不渲染對應操作按鈕（F074 v2.0 進一步定義處長 UI 規則）

### AC-7：撤銷部長角色後立即失效

- **Given** Admin 透過 F006a 將某帳號的 `business_role` 設為 `NULL`（撤銷 Director）
- **When** 該帳號於變更後的下一次 API 請求帶入舊 JWT
- **Then** AuthGuard 因 `JWT.iat * 1000 < users.password_changed_at` 比對成立，回 401 `AUTH_TOKEN_REVOKED`（舊 token 全數失效）
- **And** 該帳號重新登入後，新 JWT payload `businessRole = null`，下次發 E07 API 請求時若該帳號亦無 `role = 'admin'`，由 `DirectorOrSectionChiefGuard` 攔截回 403 `E07_ROLE_NOT_ASSIGNED`
- **And** 撤銷操作之 audit log 由 F006a 統一寫入（`action = 'REVOKE_ROLE'`、`entity_type = 'business_role'`、`before_value = { business_role: 'director' }`、`after_value = { business_role: null }`）

## 5. API 規格

### 5.1 角色指派端點（沿用 E02 F006a）

部長角色指派**不**新增專屬 API；唯一指派入口為 [F006a](F006a-update-business-role.md) 之 PATCH `/api/v1/accounts/:id/business-role`（Body `{ "business_role": "director" }`，Admin only）。

### 5.2 Guard 行為規範（後端共用）

E07 所有 controller 使用以下 Guard 組合（具體實作規格由 F002 v2.0 §4.6 定義為唯一權威來源）：

| Guard 名稱 | 適用範圍 | 通過條件 |
|---|---|---|
| `DirectorOrSectionChiefGuard`（v2.0 新增，取代 `SalesManagerGuard`） | E07 全部 controller 入口檢查（M02 除外） | `role = 'admin'` OR `business_role IN ('director', 'section_chief')` |
| `DirectorGuard`（v2.0 新增） | 部長專屬功能（M02 全部端點含 GET、M06 寫入、月名單分派觸發、名單 CRUD、M03a 寫入、M03b 推進至簽核、M03c 核准 / 拒絕、M03d Rollback） | `role = 'admin'` OR `business_role = 'director'` |
| `SectionChiefGuard`（v2.0 新增） | 處長專用端點（少數明確標記） | `business_role = 'section_chief'` |

**檢查順序**（與 F002 v2.0 §4.6 對齊）：
1. JWT 驗證（`AUTH_TOKEN_MISSING` / `AUTH_TOKEN_EXPIRED` / `AUTH_TOKEN_REVOKED`）
2. E07 入口檢查（`DirectorOrSectionChiefGuard`，失敗回 `E07_ROLE_NOT_ASSIGNED`）
3. 部長專屬功能再次檢查（`DirectorGuard`，失敗回 `AUTH_FORBIDDEN`）

### 5.3 錯誤碼

| HTTP | 錯誤碼 | 觸發情境 |
|---|---|---|
| 401 | `AUTH_TOKEN_MISSING` / `AUTH_TOKEN_EXPIRED` / `AUTH_TOKEN_REVOKED` | 未登入 / Token 過期 / Token 因 password_changed_at 失效 |
| 403 | `E07_ROLE_NOT_ASSIGNED` | 一般 E07 入口檢查失敗（`role = 'user'` AND `business_role IS NULL`）— **v2.0 新增**（取代舊 `AUTH_FORBIDDEN` 之 SalesManagerGuard 攔截語意） |
| 403 | `AUTH_FORBIDDEN` | 處長嘗試存取部長專屬功能（`DirectorGuard` 攔截） |
| 422 | `ACCOUNT_BUSINESS_ROLE_INVALID` | F006a PATCH `/business-role` 傳入非允許值（由 F006a 處理；本 spec 不獨立拋出） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | E07 Director 角色為應用層自訂角色，與 E02 系統層 `role`（admin / user）分層管理，不互相污染 |
| BR-2 | Admin 繼承規則：`role = 'admin'` 自動視為 Director，無需額外指派；判斷邏輯為「`role = 'admin'` OR `business_role = 'director'`」（避免硬編碼於各 Guard） |
| BR-3 | 部長與處長**互斥**（單一欄位設計）：不可同時持有；切換時 F006a 直接覆寫即可（v1.1 之「並任 Director + SectionChief」規則已廢除） |
| BR-4 | 角色指派入口唯一：必須走 [F006a](F006a-update-business-role.md) PATCH `/business-role`；E07 內部頁面不提供任何指派 UI |
| BR-5 | 部長對 E07 之可見範圍**不受 `created_by` 篩選**（與處長相反，見 F074 v2.0 BR-1） |
| BR-6 | 角色指派 / 撤銷必須寫入 `assignment_audit_log`（`action = 'ASSIGN_ROLE'` / `'REVOKE_ROLE'`、`entity_type = 'business_role'`，由 F006a 統一寫入；本 spec 不獨立寫入） |
| BR-7 | 部長專屬功能列表（適用 `DirectorGuard`）：M06 白名單維護（F075）、M06 可選值管理（F076）、M02 計分設定全部端點含 GET（F053 / F054 / F055 / F056 / F069 / F070 / F071 / F072）、M03a 部門比例設定寫入（F079 / F080 / F081）、M03c 簽核（F086 / F087）、M03d Rollback（F089）、月名單分派觸發（F061）、名單新增（F050）、編輯（F051）、停用（F052）|
| BR-8 | E07 角色矩陣之**唯一權威來源**為 [F002 v2.0 §4.6](F002-user-login.md#e07-角色矩陣)；本 Feature 僅定義 Director 語意，矩陣異動須回 F002 修訂 |
| BR-9 | **業務角色變更入口唯一性（v2.0 / E07 合併重構）**：`users.business_role` 欄位之**唯一**寫入入口為 PATCH `/api/v1/accounts/:id/business-role`（[F006a](F006a-update-business-role.md) Admin only）；既有 PUT `/api/accounts/:id`（F006）**不**包含此欄位之變更能力 |
| BR-10 | **Token revoke 同步觸發**：由 [F006a](F006a-update-business-role.md) BR-4 / §5.5 統一規範（本 spec 不重複描述機制細節） |
| BR-11 | ~~`is_sales_manager` 與 `e07_role` 正交維度~~（**v2.0 廢除**：兩欄位均 DROP；改採單一 `business_role` 欄位） |

## 7. UI/UX 需求

- E07 內部頁面**完全不**顯示角色指派 UI；任何「指派 / 撤銷部長」操作須由 Admin 於 E02 帳號管理頁透過 [F006a](F006a-update-business-role.md) 執行
- 部長登入後 sidebar 顯示完整 E07 群組（M01~M07 全部子項），對齊 [F002 v2.0 §4.5](F002-user-login.md#45-登入後導向與可用功能rbac--實質身份矩陣) 「業務部長」實質身份列
- 部長進入任一 E07 模組之頁面時，所有寫入按鈕均處於可用狀態（不受 `created_by` 篩選或處長層級限制）
- 月名單分派執行中（`assignment_run.status IN ('pending', 'running')`）部分按鈕仍可能 disabled（沿用各 Feature 既有月名單分派鎖規則，如 F055 BR-3、F068 等）
- 全 UI 統一使用 label「業務部長」（不再使用「業務主管」/「Director」中英混雜寫法）
- 視覺風格與互動細節由 UI/UX Designer 設計

## 8. 相依性

- **Blocked By**：F001、F002 v2.0（RBAC 矩陣權威來源）、[F006a](F006a-update-business-role.md)（業務角色指派入口）、F045、m14 migration（`users.business_role` 欄位）
- **Blocks**：F074 v2.0（處長角色定義需 Director 作為對比基準）、F075（白名單維護需 `DirectorGuard`）、F076（可選值管理需 `DirectorGuard`）、所有 E07 寫入端點（M01~M06）需依本 Feature 重新檢視 Guard 設定
- **連帶修訂**：F002 v2.0（§4.6 完全重寫）、F006 v2.3、F068 v1.3、F055 v1.6、F050~F089（批次補修 Guard 引用）

## 9. 交叉參考

- **權威矩陣**：[F002 v2.0 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **業務角色指派端點**：[F006a-update-business-role.md](F006a-update-business-role.md)
- **資料模型**：[data-model.md#user-entity](../data-model.md#user-entity)（`business_role` 欄位）、[data-model.md#role-entity](../data-model.md#role-entity)、[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_audit_log`）
- **錯誤處理**：[error-handling.md v1.14 #assignment-errors](../error-handling.md#assignment-errors)（`E07_ROLE_NOT_ASSIGNED` v2.0 新增）、[#account-errors](../error-handling.md#account-errors)（`ACCOUNT_BUSINESS_ROLE_INVALID` v2.0 新增）
- **架構決策**：AD-E02-1 v2.11（角色 + `business_role` 欄位 RBAC 模型）、AD-E07 v3.0（合併重構）
- **DEPRECATED**：~~[F008-assign-change-role.md](F008-assign-change-role.md)（DEPRECATED v3.x）~~
- **相關功能**：[F002 v2.0](F002-user-login.md)、[F006a](F006a-update-business-role.md)、[F045](F045-business-role-definitions.md)、[F074 v2.0](F074-define-section-chief-role.md)、[F075](F075-manage-pooldata-field-whitelist.md)、[F076](F076-manage-categorical-field-values.md)、[F068](F068-edit-base-code.md)、[F055](F055-edit-card-level-thresholds.md)、[F050](F050-create-list-definition.md)、[F051](F051-edit-list-definition.md)、[F052](F052-disable-list-definition.md)、[F061](F061-trigger-assignment-run.md)
- **Memory 參照**：`feedback_e07_controllers_use_sales_manager_guard.md`（v2.0 後請改 `DirectorGuard` / `DirectorOrSectionChiefGuard`）
- **圖表**：[diagrams/F073-role-matrix.mmd](../diagrams/F073-role-matrix.mmd)（v2.0 重繪）

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%（Guard 邏輯為核心，須涵蓋 Admin 繼承、處長禁入、未指派 business_role 禁入三大路徑）
- E2E 測試必須覆蓋：
  - Admin 透過 F006a 指派 `business_role='director'` 後該帳號可進入 M06 白名單寫入端點（F075）
  - Admin 直接呼叫部長專屬端點通過（無需指派 `business_role`）
  - 處長（`business_role='section_chief'`）呼叫月名單分派觸發 API 回 403 `AUTH_FORBIDDEN`
  - 一般使用者（`business_role=NULL`）呼叫 E07 任一端點回 403 `E07_ROLE_NOT_ASSIGNED`
  - 撤銷部長角色（`business_role=NULL`）後下次請求 401 `AUTH_TOKEN_REVOKED`
  - 部長 ↔ 處長切換（`business_role` 互斥覆寫）後 JWT 失效並依新角色執行

## 11. 實作 Checklist

- [ ] 後端新增 `DirectorGuard`（部長專屬功能用）
- [ ] 後端新增 `DirectorOrSectionChiefGuard`（取代舊 `SalesManagerGuard` 之入口檢查語意）
- [ ] 後端新增 `SectionChiefGuard`（處長專屬端點用）
- [ ] 部長專屬功能 controller（依 BR-7 列表）統一套用 `@RequireDirector()` decorator
- [ ] 廢除既有 `SalesManagerGuard` 與 `@RequireSalesManager()` 引用（批次替換為新 Guard）
- [ ] F002 v2.0 §4.6 矩陣已更新（本 spec 為下游引用方）
- [ ] error-handling.md 新增 `E07_ROLE_NOT_ASSIGNED`（v1.14）
- [ ] data-model.md 確認 `users.business_role` 欄位 + CHECK constraint + DROP 舊 `is_sales_manager` / `e07_role`
- [ ] sidebar 渲染依 F002 v2.0 §4.5 矩陣對齊「業務部長」實質身份完整可見性

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | E07 應用層角色資料模型採**單一欄位** `users.business_role`（VARCHAR(20) NULL + CHECK constraint enum；m14 migration 同 transaction DROP 舊 `is_sales_manager` / `e07_role`）| ✅ Resolved（v2.0） |
| A-2 | 撤銷 / 變更部長後既有 JWT 之失效機制：由 F006a 統一處理（沿用 F009 / F010 `password_changed_at` 機制） | ✅ Resolved（v2.0） |
| A-3 | 月名單分派 `triggered_by` 之角色標示：暫定僅記錄帳號 ID，不額外標示業務角色；待業務確認後可補強 | [ASSUMPTION] 交 product-analyst |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（對應 US-100，E07 重構批次 1） |
| v1.1 | 2026-05-16 | §E02 整合補修：新增 §5.4「§E02 整合」+ §5.4.2 Token revoke 機制 + 2 個錯誤碼 `ACCOUNT_E07_ROLE_INVALID` / `ACCOUNT_E07_ROLE_FORBIDDEN` + BR-9/BR-10/BR-11 + AC-7 [RESOLVED] |
| **v2.0** | **2026-05-16** | **【破壞性重寫 / E07 合併重構 AD-E07 v3.0】**：(1) 廢除 v1.1「`is_sales_manager` + `e07_role` 正交雙欄位」設計與「Director + SectionChief 並任」規則，改採**單一欄位** `users.business_role VARCHAR(20) NULL`（部長與處長互斥）；(2) 廢除 `SalesManagerGuard`，新增三 Guard 體系 `DirectorGuard` / `DirectorOrSectionChiefGuard` / `SectionChiefGuard`；(3) 角色指派端點由 v1.1 之 PATCH `/e07-role` 改為 [F006a](F006a-update-business-role.md) 之 PATCH `/business-role`（同名 `users.business_role` 欄位）；(4) §5.4 「§E02 整合」整節刪除（指派端點與 token revoke 機制由 F006a 統一規範）；(5) 新增錯誤碼 `E07_ROLE_NOT_ASSIGNED`（403，明示需聯絡 admin 補設）取代舊 `AUTH_FORBIDDEN` 之未指派語意；(6) BR-3 改寫（互斥規則）；BR-11 標廢除；audit log entity_type 由 `e07_role` 改 `business_role`；(7) AC-4 由 v1.1 並任規則改為互斥切換；(8) F008 / F073 v1.1 端點全 cross-ref 更新指向 F006a |
