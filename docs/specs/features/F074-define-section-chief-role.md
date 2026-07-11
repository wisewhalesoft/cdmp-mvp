---
spec-id: F074
title: 處長角色定義與轄區（created_by）限縮
feature-id: F074
source-story: US-101
epic: E07
module: M07 角色與可見範圍
priority: P0-MVP
version: "2.0"
date: 2026-05-16
status: Draft
---

# F074: 處長角色定義與轄區（`created_by`）限縮

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

> **v2.0 / 2026-05-16 破壞性重寫（E07 合併重構 AD-E07 v3.0）**：本版本廢除 v1.1 「`e07_role` 欄位」與 `SalesManagerGuard` 設計，改採**單一欄位** `users.business_role VARCHAR(20) NULL`；指派入口由 v1.1 之 PATCH `/e07-role` 改為 [F006a](F006a-update-business-role.md) 之 PATCH `/business-role`；處長與部長**互斥**（單一欄位設計）；廢除 `SalesManagerGuard`，改用 `DirectorOrSectionChiefGuard` 為 E07 入口檢查、`DirectorGuard` 阻擋處長存取部長專屬功能。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F073-define-director-role.md` v2.0 + `F002-user-login.md` v2.0 §4.6 + `F006a-update-business-role.md` + `data-model.md#user-entity` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `F073-define-director-role.md` v2.0 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件 §7 UI/UX 需求 |
| Architect | 本文件 + `architecture-spec.md` v2.11 §3.10 + AD-E07 v3.0 |

---

## 對應 User Story

- 來源 Story：[US-101-M07-define-section-chief-role.md](../../stories/epics/E07-app-customer-list-assignment/US-101-M07-define-section-chief-role.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M07 角色與可見範圍

---

## 1. 功能摘要

定義 E07「業務處長（SectionChief）」應用層角色（v2.0 由 v1.x 之「業務主管 / SalesManager」概念正式重新命名）。處長僅能操作「個別業務比例設定」（M03b，F082~F085）並**唯讀查詢**「準備完成階段」（M03d，F088~F089）；對 M02 計分設定**完全不可見**（Nav 隱藏 + 後端 Guard 防禦），其他 E07 功能（白名單、計分寫入、月名單分派觸發、名單 CRUD…）一律無權。轄區識別採 `created_by` 欄位過濾，不引入獨立 `section_id` 欄位。

## 2. 使用者故事

**As a** Admin
**I want** 在 E07 系統中定義「業務處長（SectionChief）」角色，確立其**嚴格限縮**的操作範圍
**So that** 處長僅能操作「個別業務比例設定」並查詢「準備完成階段」，無法誤觸其他 E07 功能，系統資料安全可控

## 3. 前置條件

- F073 v2.0（部長角色定義）已就緒，Director 作為對比基準
- E01 / E02 / [F006a](F006a-update-business-role.md) / F045 已就緒
- `assignment_audit_log` 已建立
- `users.business_role` 欄位已透過 m14 migration 建立 + CHECK constraint

## 4. 驗收標準

### AC-1：Admin 透過 F006a 指派處長角色

- **Given** Admin 已登入並進入 E02 帳號管理頁
- **When** Admin 對某帳號透過 F006a 寫入 `business_role = 'section_chief'`
- **Then** 該帳號取得「個別業務比例設定」寫入權限與「準備完成階段查詢」唯讀權限
- **And** 指派操作之 audit log 由 F006a 統一寫入（`action = 'ASSIGN_ROLE'`、`entity_type = 'business_role'`、`entity_id = '{userId}|section_chief'`）
- **And** E07 內部頁面**不**提供任何角色指派 UI

### AC-2：處長「個別業務比例設定」操作範圍限轄區

- **Given** 帳號 `business_role = 'section_chief'` 並登入
- **When** 進入「個別業務比例設定」頁面（M03b，F082）
- **Then** 僅顯示「`created_by = 該處長帳號 ID`」之業務員比例設定紀錄
- **And** 其他處長轄區之業務員資料**不顯示**，亦**不可存取**

### AC-3：處長嘗試存取他人轄區資料被拒

- **Given** 帳號 `business_role = 'section_chief'`
- **When** 嘗試透過 API 修改他人轄區（`created_by != 該處長帳號 ID`）之個別業務比例資料
- **Then** 後端回傳 HTTP 403，錯誤碼 `E07_FORBIDDEN_SECTION_CHIEF_SCOPE`
- **And** 不執行任何寫入操作
- **And** 前端不渲染他人轄區之編輯按鈕或連結

### AC-4：處長對 M02 計分設定完全不可見（Nav 隱藏 + 後端防禦）

- **Given** 帳號 `business_role = 'section_chief'`（非 admin）
- **When** 頁面載入 sidebar
- **Then** **M02 計分設定入口完全不顯示**於 sidebar（DOM 中不存在，非 disabled、非 CSS hidden）
- **And** 若處長透過直接輸入 URL 嘗試進入 M02 任意頁面，前端路由守衛攔截並導向「無存取權限」頁面
- **And** 若處長直接呼叫 M02 任意端點（含 GET 讀取與 PUT/POST/DELETE 寫入），後端 `DirectorGuard` 回傳 HTTP 403 `AUTH_FORBIDDEN`

### AC-5：處長無法進行部長專屬功能的任何操作

- **Given** 帳號 `business_role = 'section_chief'`
- **When** 嘗試存取以下任一功能：M01 名單新增（F050）/ 編輯（F051）/ 停用（F052）/ M02 全部端點 / M03a 部門比例設定 / M06 白名單維護（F075）/ M06 可選值管理（F076）/ 月名單分派觸發（F061）/ M03c 簽核（F086 / F087）
- **Then** 後端 `DirectorGuard` 回 403 `AUTH_FORBIDDEN`
- **And** 前端 sidebar 對 M02 完全不渲染入口；其他部長專屬功能對應操作按鈕不顯示（或顯示為停用狀態並附提示）

### AC-6：處長查看「準備完成階段」（唯讀，限轄區）

- **Given** 帳號 `business_role = 'section_chief'`
- **When** 進入「準備完成階段」查詢頁面（M03d，F088）
- **Then** 可查看「`created_by = 該處長帳號 ID`」之準備完成階段資料
- **And** 頁面為唯讀，不顯示任何可修改控件
- **And** 無法查看其他處長轄區之準備完成階段資料（後端依 BR-1 過濾）

### AC-7：撤銷處長角色後立即失效

- **Given** Admin 透過 F006a 將某帳號的 `business_role` 設為 `NULL`（撤銷 SectionChief）
- **When** 該帳號於變更後的下一次 API 請求帶入舊 JWT
- **Then** AuthGuard 因 `JWT.iat * 1000 < users.password_changed_at` 比對成立，回 401 `AUTH_TOKEN_REVOKED`
- **And** 該帳號重新登入後新 JWT `businessRole = null`，後續 E07 API 由 `DirectorOrSectionChiefGuard` 攔截回 403 `E07_ROLE_NOT_ASSIGNED`

### AC-8：處長 ↔ 部長角色互斥切換

- **Given** 帳號 `business_role = 'section_chief'`
- **When** Admin 透過 F006a 將其改為 `business_role = 'director'`
- **Then** 直接覆寫成功（單一欄位互斥，無需先撤銷）
- **And** 舊 JWT 立即失效（沿用 F006a token revoke 機制）
- **And** 重新登入後該帳號取得部長全範圍存取（不再受 `created_by` 轄區限制）

## 5. API 規格

### 5.1 角色指派端點（沿用 E02 F006a）

同 F073 v2.0，沿用 [F006a](F006a-update-business-role.md) 之 PATCH `/api/v1/accounts/:id/business-role`（Body `{ "business_role": "section_chief" }`，Admin only）。

### 5.2 Guard 行為規範

| Guard | 通過條件 | 適用範圍 |
|---|---|---|
| `DirectorOrSectionChiefGuard`（v2.0 新增） | `role = 'admin'` OR `business_role IN ('director', 'section_chief')` | E07 全部 controller 入口（M02 除外） |
| `DirectorGuard`（v2.0 新增） | `role = 'admin'` OR `business_role = 'director'` | 部長專屬功能 + **M02 全部端點**（含 GET，因處長對 M02 完全不可見） |
| `SectionChiefGuard`（v2.0 新增） | `business_role = 'section_chief'` | 處長專用端點（少數明確標記）|

**處長轄區判定邏輯**（v2.1 / 2026-05-21 修訂；廢除 `created_by` 過濾，改 ob_emphire 反查）：

- **新邏輯**：處長帳號 → `users.email` ↔ `ob_emphire.email` 比對 → 取該員工之 `dept_code` 作為轄區
  - 要求該員工 `resign_date IS NULL`（在職）且 `TRIM(jfun_nm) = '處長'`
  - 一個處長帳號精確對應一個 `dept_code`；對應不到回 null（視同無轄區，回空清單）
  - 實作位置：service 層 helper（建議命名 `resolveSectionChiefScope(userId): Promise<string | null>`，由 M03b / M03d 引用）
- **廢除原因**（chicken-and-egg）：原 `scopeByCreator(query, currentUser)` 邏輯依賴 `ob_empl_set.created_by`，但首次 GET 時 `ob_empl_set` 為空 → 處長視角永遠回空清單 → 無法建立第一筆紀錄
- 部長 + Admin 視角：不過濾轄區
- 前提：HR 同步進 `ob_emphire` 之處長員工 email 必須與 `users.email` 一致（部署時須由 admin / ops 確保）

### 5.3 錯誤碼

| HTTP | 錯誤碼 | 觸發情境 |
|---|---|---|
| 401 | `AUTH_TOKEN_MISSING` / `AUTH_TOKEN_EXPIRED` / `AUTH_TOKEN_REVOKED` | 未登入 / Token 失效 |
| 403 | `E07_ROLE_NOT_ASSIGNED` | 無 admin / Director / SectionChief 任一身份（`business_role = NULL` 且 `role = 'user'`） |
| 403 | `AUTH_FORBIDDEN` | 處長存取部長專屬功能（含 M02 全部端點，由 `DirectorGuard` 攔截） |
| 403 | `E07_FORBIDDEN_SECTION_CHIEF_SCOPE` | 處長嘗試存取他人轄區資料（業務層 `scopeByCreator()` 攔截） |
| 422 | `ACCOUNT_BUSINESS_ROLE_INVALID` | F006a PATCH `/business-role` 傳入非允許值 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **轄區識別（v2.1 修訂 / 2026-05-21）**：以 `users.email ↔ ob_emphire.email + jfun_nm='處長' + 在職` 反查 `dept_code` 作為轄區；一個處長帳號 = 一個 `dept_code`；**不**引入獨立 `section_id` 欄位或 `users.dept_code` 欄位。**廢除 v2.0 之 `created_by` 過濾**（chicken-and-egg：首次 GET 時 ob_empl_set 為空無法建立第一筆）。實作 helper：`resolveSectionChiefScope(userId)`，由 M03b/d service 共用 |
| BR-2 | 處長**唯一**可寫入功能：個別業務比例設定（M03b，F082~F085） |
| BR-3 | 處長**唯一**可查詢（唯讀）功能：準備完成階段（M03d，F088~F089） |
| BR-4 | M02 對處長完全不可見：Nav 隱藏（DOM 不渲染）+ 後端 `DirectorGuard` 防禦（GET 也回 403）+ 前端路由守衛攔截 |
| BR-5 | **部長與處長互斥**（單一欄位設計）：不可同時持有；切換時 F006a 直接覆寫即可（v1.x 之並任規則已廢除） |
| BR-6 | 角色指派 / 撤銷之 audit log 由 [F006a](F006a-update-business-role.md) 統一寫入（本 spec 不獨立寫入） |
| BR-7 | 處長對個別業務比例設定 / 準備完成階段以外的所有 E07 功能：後端回 403 `AUTH_FORBIDDEN`（由 `DirectorGuard` 攔截），前端不渲染對應操作入口 |
| BR-8 | 跨轄區存取防護（v2.1 修訂）：service 層必須在所有處長身份的查詢與寫入路徑呼叫 `resolveSectionChiefScope(userId)` 取得轄區 dept_code 後過濾；scope=null 視同越權回空清單 / 403；遺漏者視為高優先 bug |
| BR-9 | E07 角色矩陣之**唯一權威來源**為 [F002 v2.0 §4.6](F002-user-login.md#e07-角色矩陣) |
| BR-10 | **業務角色變更入口唯一性（v2.0 / E07 合併重構）**：`users.business_role` 欄位之**唯一**寫入入口為 [F006a](F006a-update-business-role.md) PATCH `/business-role`（Admin only） |
| BR-11 | **Token revoke 同步觸發**：由 F006a 統一規範（本 spec 不重複描述） |

## 7. UI/UX 需求

- 處長登入後 sidebar **完全不渲染**：M02 計分設定群組、M06 白名單維護入口、M06 可選值管理入口、M03 部門比例設定入口、月名單分派觸發入口、名單新增 / 編輯 / 停用按鈕、M03c 簽核入口
- 處長 sidebar **可見**：個別業務比例設定（M03b，F082）入口、準備完成階段查詢（M03d，F088）入口、M06 GET 唯讀入口（F068 / F075 / F076 唯讀視圖）
- 處長進入 M03b 頁面時，所有列表 / 編輯 UI 自動以該處長轄區為範圍（無需處長手動篩選）
- 處長進入 M03d 頁面時，僅顯示唯讀視圖，無「編輯」「儲存」「Rollback」等控件
- 處長若透過直接 URL 訪問被禁功能頁面（如 M02 / M06 白名單），前端路由守衛攔截並顯示「無存取權限」頁面
- 全 UI 統一使用 label「業務處長」（不再使用「業務主管」/「SectionChief」中英混雜寫法）
- 視覺風格與互動細節由 UI/UX Designer 設計

## 8. 相依性

- **Blocked By**：F073 v2.0（部長角色定義，作為對比基準）、F001 / F002 v2.0 / [F006a](F006a-update-business-role.md) / F045 / m14 migration
- **Blocks**：F082 / F083 / F084 / F085（M03b 個別業務比例設定）、F088 / F089（M03d 準備完成階段）、F075 / F076（白名單 / 可選值維護需阻擋處長寫入）、F068 / F069~F072 / F053~F056（M02 對處長完全不可見之 cross-ref）
- **連帶修訂**：F068 v1.3、F055 v1.6、F082~F089 等 spec 之 Guard 引用批次補修

## 9. 交叉參考

- **權威矩陣**：[F002 v2.0 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **業務角色指派端點**：[F006a-update-business-role.md](F006a-update-business-role.md)
- **資料模型**：[data-model.md#user-entity](../data-model.md#user-entity)（`business_role` 欄位）、[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`created_by` 欄位於 `ob_list_definition` / `ob_dept_pct` / `ob_empl_set` 等）
- **錯誤處理**：[error-handling.md v1.14 #assignment-errors](../error-handling.md#assignment-errors)（`E07_ROLE_NOT_ASSIGNED` v2.0 新增 / `AUTH_FORBIDDEN` / `E07_FORBIDDEN_SECTION_CHIEF_SCOPE`）
- **架構決策**：AD-E02-1 v2.11、AD-E07 v3.0
- **DEPRECATED**：~~F008（DEPRECATED v3.x）~~、v1.x `SalesManagerGuard`（v2.0 已廢除）
- **相關功能**：[F073 v2.0](F073-define-director-role.md)、[F002 v2.0](F002-user-login.md)、[F006a](F006a-update-business-role.md)、[F068](F068-edit-base-code.md)、[F055](F055-edit-card-level-thresholds.md)、[F069](F069-view-card-type-list.md)、[F075](F075-manage-pooldata-field-whitelist.md)、[F076](F076-manage-categorical-field-values.md)

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- E2E 測試必須覆蓋：
  - 處長進入個別業務比例設定頁面僅看到自身轄區資料
  - 處長嘗試 PUT 他人轄區比例 → 403 `E07_FORBIDDEN_SECTION_CHIEF_SCOPE`
  - 處長 GET M02 任意端點（如 `GET /api/v1/assignment/scoring/card-types`） → 403 `AUTH_FORBIDDEN`（由 `DirectorGuard` 攔截）
  - 處長透過直接 URL 訪問 M02 頁面 → 前端路由守衛攔截
  - 處長嘗試呼叫 `POST /api/v1/assignment/runs`（月名單分派觸發）→ 403 `AUTH_FORBIDDEN`
  - 未指派 `business_role` 之 user 呼叫 E07 任一端點 → 403 `E07_ROLE_NOT_ASSIGNED`
  - Admin 撤銷處長角色 → 下次請求 401 `AUTH_TOKEN_REVOKED`
  - 處長 ↔ 部長互斥切換（F006a 覆寫）後 JWT 失效並依新角色執行

## 11. 實作 Checklist

- [ ] 後端新增 `DirectorOrSectionChiefGuard`（取代舊 `SalesManagerGuard`）
- [ ] 後端新增 `DirectorGuard`（含套用至 M02 全部 controller，含 GET）
- [ ] 後端新增 `SectionChiefGuard`（少數處長 only 端點）
- [ ] service 層新增 `scopeByCreator(query, currentUser)` helper，套用於 M03b / M03d 查詢
- [ ] 前端 sidebar 渲染依 F002 v2.0 §4.5 矩陣對齊處長最小可見集
- [ ] 前端路由守衛攔截處長對 M02 / M06 白名單 / 月名單分派觸發等 URL
- [ ] error-handling.md 新增 `E07_ROLE_NOT_ASSIGNED`（v1.14）；保留既有 `E07_FORBIDDEN_SECTION_CHIEF_SCOPE`
- [ ] F068 / F055 cross-ref 補 M02 / M06 處長禁用 / Nav 隱藏
- [ ] F002 v2.0 §4.6 矩陣已更新（本 spec 為下游引用方）
- [ ] 廢除既有 `SalesManagerGuard` 與 `@RequireSalesManager()` 引用（批次替換為新 Guard）

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | E07 應用層角色（含 `section_chief`）採單一欄位 `users.business_role`；Token revoke 沿用 F006a 統一機制 | ✅ Resolved（v2.0） |
| A-2 | 月名單分派 `triggered_by` 是否標示處長身份：同 F073 A-3，暫定僅記錄帳號 ID | [ASSUMPTION] 交 product-analyst |
| A-3 | M03b / M03d 之 `created_by` 過濾語意（究竟是名單建立者、業務員建立者、或比例設定建立者）由各 M03b/d spec 明確化；本 spec 採「該紀錄之 `created_by` 等於目前處長帳號 ID」之通則 | [ASSUMPTION] 交 M03b/d spec-writer |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（對應 US-101，E07 重構批次 1） |
| v1.1 | 2026-05-16 | §E02 整合補修：新增 §5.4「§E02 整合」沿用 F073 §5.4 規格；2 個錯誤碼補入 §5.3；BR-10 / BR-11；AC-7 [RESOLVED] |
| **v2.0** | **2026-05-16** | **【破壞性重寫 / E07 合併重構 AD-E07 v3.0】**：(1) 廢除 v1.x `e07_role` 欄位設計，改採單一 `users.business_role VARCHAR(20) NULL`（與部長互斥）；(2) 廢除 `SalesManagerGuard`，改用 `DirectorOrSectionChiefGuard` / `DirectorGuard` / `SectionChiefGuard` 三 Guard 體系；(3) 角色指派端點由 v1.1 之 PATCH `/e07-role` 改為 [F006a](F006a-update-business-role.md) 之 PATCH `/business-role`；(4) §5.4 「§E02 整合」整節刪除；(5) 錯誤碼整理：v1.0 `E07_FORBIDDEN_DIRECTOR_ONLY` 改為 `AUTH_FORBIDDEN`（由 `DirectorGuard` 拋出）；新增 `E07_ROLE_NOT_ASSIGNED`（取代舊 `AUTH_FORBIDDEN` 之未指派語意）；保留 `E07_FORBIDDEN_SECTION_CHIEF_SCOPE`；(6) BR-5 改寫為部長處長互斥；BR-10 / BR-11 改引 F006a 統一規範；(7) 新增 AC-8（處長 ↔ 部長互斥切換）；(8) audit log entity_type 由 `e07_role` 改 `business_role`；(9) UI label 統一「業務處長」 |
