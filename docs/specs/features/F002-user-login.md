---
spec-id: F002
title: User 登入
feature-id: F002
source-story: US-002
epic: E01 — 驗證與登入
priority: P0-MVP
version: "2.1.1"
date: 2026-07-13
status: Draft
---

# F002: User 登入

**Priority:** P0-MVP | **Status:** Draft | **Last Updated:** 2026-07-13

> **v2.1.1（2026-07-13 / 登入識別碼擴充：Email 或員工編號，ref US-179 / [F113](F113-employee-no-login-identifier.md)）**：登入端點（與 F001 共用）之識別碼欄位語意擴充——**維持既有欄位名 `email`**（不改名為 `identifier`），可承載 **Email 或員工編號（`employee_no`）擇一**。後端 `LoginDto` 由 `@IsEmail()` 放寬為 `@IsNotEmpty() @IsString()`；`auth.service.login()` 依輸入值是否含 `@` 分支：含 `@` → Email 邏輯（小寫化）；否則 → `employee_no` **精確、大小寫敏感**比對（不轉小寫）。失敗一律回既有通用 `AUTH_INVALID_CREDENTIALS`（不新增登入錯誤碼、不洩漏）；停用帳號、Token 發行、角色導向（§4.5 / §4.6 矩陣）皆**不變**。成功 Response 之 `user` 物件新增 `employee_no`（nullable）。**忘記密碼（F009）維持 email-only、不支援員工編號**（[F113 §9](F113-employee-no-login-identifier.md#9-忘記密碼行為維持不變--oq-179-01)）。分支邏輯與欄位契約權威來源為 [F113](F113-employee-no-login-identifier.md)；本次不影響 RBAC / 導向。

> **v2.1.0（2026-07-12 / 業務角色移除 Customer 360 + 預設導向改分派總覽，ref US-177 / F111）**：**業務部長**（`business_role='director'`）與**業務處長**（`business_role='section_chief'`）不再具備 Customer 360（E06）存取權——sidebar 不顯示 Customer 360 群組、前端路由守衛攔截 `/c360/**`；且登入後預設導向由 `/c360/customers` 改為 `/assignment/overview`（分派總覽儀表板，客戶名單分派模組 landing，見 [F111](F111-assignment-overview-dashboard.md)）。**一般使用者**（`business_role IS NULL`）與**系統管理者**（`admin`）不受影響：一般使用者仍導向 `/c360/customers`、admin 仍導向 `/`，且兩者保有 Customer 360。本次強制為**純前端 RBAC**（sidebar 可見性 + 路由守衛 + 角色感知導向）；後端 Customer 360（E06）端點維持 `authenticated`，**不新增 Guard**。影響章節：§1 / §4 / §4.5 / AC-1 / AC-5 / AC-5b / AC-6 / §6 / §7 / §8 / BR-Redirect。

> **v2.0.1（2026-06-26 / US-168 對齊 F049 v2.0）**：§4.6.2 Controller Guard 對應表將原「名單瀏覽 F048~F049 GET」拆分——F049 Stage 0 試算（部門矩陣 + per-list COUNT）獨立成列，授權為 `DirectorOrSectionChiefGuard` + service 層 dept scope filter（處長唯讀、限縮轄區 `obdeptid`），取代 v1.x 之 `DirectorGuard`（部長專屬）。其餘 §4.6 內容不變。

> **v2.0 / 2026-05-16 破壞性變更（E07 合併重構 AD-E07 v3.0）**：本版本廢除舊 `users.is_sales_manager` 欄位（DROP）並廢除 v1.4 短期過渡 `users.e07_role` 欄位，整合為**單一欄位** `users.business_role VARCHAR(20) NULL`（enum：`'director'` / `'section_chief'` / `NULL`，DB CHECK constraint 強制）。系統實質身份共 **4 種 label**：「系統管理者」/「業務部長」/「業務處長」/「一般使用者」（廢除 v1.x「業務主管」中間語意層）。`SalesManagerGuard` 全數廢除，改用 `DirectorGuard` / `SectionChiefGuard` / `DirectorOrSectionChiefGuard` 三 Guard 體系。新增錯誤碼 `E07_ROLE_NOT_ASSIGNED`（403，明示需聯絡 admin 補設）取代舊 `AUTH_FORBIDDEN` 攔截一般使用者時的模糊語意。詳見 §4.5 / §4.6 / §11；變更入口統一走 [F006a](F006a-update-business-role.md) PATCH `/api/v1/accounts/:id/business-role`。

> **本 v2.0 補修受 PowerShell 編碼事故影響**：原 spec-writer agent 於 2026-05-16 嘗試以 PowerShell 5.1 批次替換 23 個 spec 之 `is_sales_manager` / `SalesManagerGuard` / `e07_role` 等識別字，因 `Get-Content -Raw` 預設 cp950 解碼導致 18 個 untracked 新檔（F075~F089）損壞且不可救援。已 commit 至 HEAD 之 31 個檔（含本 F002）已透過 `git checkout` 還原至 v1.x；本 v2.0 banner 為**精簡補修**，§4.5 / §4.6 / §11 等大幅重寫請參照 [F006a](F006a-update-business-role.md) / [F073 v2.0](F073-define-director-role.md) / [F074 v2.0](F074-define-section-chief-role.md) 之新 spec；F075~F089 待用戶決定救援策略後再補修。

---

## 1. 功能摘要

提供 User（使用者）角色透過 Email 與密碼憑證登入 CDMP 平台的功能。系統角色維持 Admin / User 兩種（參考 F045），User 帳號可額外持有業務角色 `business_role`（enum: `'director'` / `'section_chief'` / `NULL`，由 [F006a](F006a-update-business-role.md) 寫入）。系統實質身份共 **4 種 label**：「系統管理者」/「業務部長」/「業務處長」/「一般使用者」（v2.0 廢除 v1.x「業務主管」中間語意層）。登入後的導向行為與 sidebar 可用功能須依此 4 種**實質身份**分別處理（詳見 §4.5 / §4.6 與 architecture-spec.md AD-E07 v3.0）。

此功能與 F001（Admin 登入）共用同一個 API 端點，透過 JWT 中的 `role` + `businessRole` 組合決定前端導向目標。MVP 階段 Customer 360（E06）僅對**系統管理者**與**一般使用者**開放：**一般使用者**登入後直接導向 Customer 360（`/c360/customers`），不再使用「無可用功能」說明頁面作為預設目的地。**業務部長**與**業務處長**不具 Customer 360 存取權，登入後改導向**分派總覽**（`/assignment/overview`，客戶名單分派模組 landing，見 [F111](F111-assignment-overview-dashboard.md) / US-177）作為營運首頁。

---

## 2. User Story

**As a** User（使用者）
**I want** 使用我的帳號憑證登入 CDMP 平台
**So that** 我可以存取我的帳號，並瀏覽平台（即使 MVP 階段尚無可用功能）

---

## 3. 驗收標準

### AC-1：一般使用者登入後導向 Customer 360

- **Given** User 帳號 `business_role IS NULL` 且已啟用
- **When** User 在登入頁面輸入正確的 Email 與密碼，並點擊「登入」
- **Then** 系統驗證 User 身份、發行 JWT Token（payload 含 `role=user`、`businessRole=null`），並重新導向至 `/c360/customers`
- **And** sidebar 僅顯示 Customer 360 群組（不顯示客戶名單分派、帳號管理等 admin / 業務部長 / 業務處長專屬項目）
- **註：** 此 AC 取代 v1.1 之前「導向說明頁面」的行為。MVP 階段 Customer 360 已可用，原 `/user-info` 不再作為預設導向目的地（保留作為 fallback 路由，詳見 §6 UI/UX 需求）
- **註（v2.1.0 未變更）：** 一般使用者的預設導向維持 `/c360/customers`，且 Customer 360 為其唯一可見功能；v2.1.0 之變更僅影響業務部長 / 業務處長（見 AC-5 / AC-5b）

### AC-2：無效憑證

- **Given** User 在登入頁面
- **When** User 輸入錯誤的 Email 或密碼，並點擊「登入」
- **Then** 系統顯示通用錯誤訊息「Email 或密碼錯誤」，且不揭示是哪個欄位有誤

### AC-3：「記住我」功能

- **Given** User 在登入頁面
- **When** User 勾選「記住我」後成功登入
- **Then** 系統發行長效 Token（有效期 30 天），下次開啟瀏覽器時自動維持登入狀態；若未勾選，Token 於瀏覽器關閉或閒置 8 小時後失效

### AC-4：帳號已停用

- **Given** User 帳號已被停用
- **When** User 以正確憑證嘗試登入
- **Then** 系統顯示「您的帳號已被停用，請聯絡管理員。」，且不發行 JWT Token

### AC-5：業務部長登入後導向分派總覽

- **Given** User 帳號 `business_role='director'` 且已啟用
- **When** User 以正確憑證成功登入
- **Then** 系統發行 JWT Token（payload 含 `role=user`、`businessRole='director'`），並重新導向至 `/assignment/overview`（分派總覽儀表板，客戶名單分派模組 landing，見 [F111](F111-assignment-overview-dashboard.md) / US-177）
- **And** sidebar 顯示「客戶名單分派」群組（含 M01~M07 全部子項，依 E07 相關 Feature 規格），但**不顯示** Customer 360 群組（業務角色無 Customer 360 存取權，v2.1.0）
- **And** 業務部長可透過 sidebar 自由進入分派相關頁面（含名單 CRUD、計分卡寫入、月名單分派觸發、簽核等部長專屬入口），不會被路由守衛阻擋；若嘗試存取 Customer 360 前端路由（`/c360/**`）則被前端路由守衛攔截並重導向回 `/assignment/overview`

### AC-5b：業務處長登入後導向分派總覽

- **Given** User 帳號 `business_role='section_chief'` 且已啟用
- **When** User 以正確憑證成功登入
- **Then** 系統發行 JWT Token（payload 含 `role=user`、`businessRole='section_chief'`），並重新導向至 `/assignment/overview`（分派總覽儀表板，客戶名單分派模組 landing，見 [F111](F111-assignment-overview-dashboard.md) / US-177）
- **And** sidebar 顯示「客戶名單分派」群組（僅顯示處長可存取之子項：名單瀏覽、計分卡 GET、個別業務比例、快照歷史等；隱藏部長專屬入口如名單建立、月名單分派觸發、部門比例編輯、簽核），但**不顯示** Customer 360 群組（業務角色無 Customer 360 存取權，v2.1.0）
- **And** 處長存取「個別業務比例」（F082）時，後端 service 層以 `scopeByCreator()` 限縮為該處長轄區資料
- **And** 若嘗試存取 Customer 360 前端路由（`/c360/**`）則被前端路由守衛攔截並重導向回 `/assignment/overview`

### AC-6：sidebar 依實質身份動態顯示

- **Given** 任一已登入身份（系統管理者 / 業務部長 / 業務處長 / 一般使用者）
- **When** 進入任何受保護頁面
- **Then** sidebar 僅渲染該身份可存取的選單項目；不可見項目**完全不渲染**（非 `disabled` 也非隱藏 CSS），避免任何揭露未授權功能存在的痕跡
- **And** 「客戶名單分派」群組僅在 `role=admin` 或 `businessRole IN ('director','section_chief')` 時顯示；組內個別子項依 §4.6 矩陣決定可見性
- **And** 「Customer 360」群組僅在 `role=admin` 或 `businessRole IS NULL`（一般使用者）時顯示；業務部長 / 業務處長**不顯示**（v2.1.0，US-177 / F111）
- **And** 「帳號管理」「資料來源」「資料擷取」「ETL Pipeline」等管理者專屬群組僅在 `role=admin` 時顯示

---

## 4. API 規格

### 共用端點

此功能與 F001（Admin 登入）共用同一個登入端點。完整 API 規格請參閱 [F001-admin-login.md#4-api-規格](F001-admin-login.md#4-api-規格)。

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/login` | 使用者登入（Admin 與 User 共用） |

### 差異說明

- Request / Response 結構與 F001 完全相同（含 v1.2/v2.1.1 之識別碼欄位語意擴充：`email` 欄位承載 Email 或員工編號，依 `@` 分支；DTO 放寬；`user` 物件新增 `employee_no`，見 [F113](F113-employee-no-login-identifier.md)）
- 成功 Response 中 `user.role` 值為 `"user"`（而非 `"admin"`）
- JWT Payload 中 `businessRole` 欄位反映該 User 的業務角色（`"director"` / `"section_chief"` / `null`）
- 前端根據 `role` + `businessRole` 組合決定導向目標與 sidebar 內容（完整規則見 §4.5 與 §4.6）

### RBAC 路由保護

| 情境 | 行為 |
|------|------|
| 一般使用者嘗試存取 admin 專屬前端路由 | 前端路由守衛攔截，重新導向至 `/c360/customers` |
| 一般使用者嘗試存取業務角色專屬前端路由（`/assignment/**`） | 前端路由守衛攔截，重新導向至 `/c360/customers` |
| 業務部長 / 業務處長嘗試存取 admin 專屬前端路由 | 前端路由守衛攔截，重新導向至 `/assignment/overview`（業務角色預設 landing，v2.1.0） |
| 業務部長 / 業務處長嘗試存取 Customer 360 前端路由（`/c360/**`） | 前端路由守衛攔截，重新導向至 `/assignment/overview`（業務角色無 Customer 360 存取權，US-177 / F111） |
| 業務處長嘗試存取部長專屬前端路由（如 `/assignment/lists/create`、`/assignment/runs/trigger`） | 前端路由守衛攔截，重新導向至處長可達的預設頁（如 `/assignment/lists`） |
| 任何 User 嘗試呼叫 admin 專屬 API 端點 | 後端回傳 HTTP 403 Forbidden，並記錄至日誌 |
| 一般使用者呼叫 `/api/v1/assignment/**` 端點 | 後端 `DirectorGuard` 或 `DirectorOrSectionChiefGuard` 回傳 HTTP 403 + 錯誤碼 `E07_ROLE_NOT_ASSIGNED`（AD-E07 v3.0） |
| 業務處長呼叫部長專屬端點（如名單 CRUD、月名單分派觸發） | 後端 `DirectorGuard` 回傳 HTTP 403 + 錯誤碼 `E07_REQUIRES_DIRECTOR` |

### Admin 專屬 API 端點保護 — Response（HTTP 403）

```json
{
  "error": "FORBIDDEN",
  "message": "您沒有權限執行此操作。"
}
```

---

## 4.5 帳號角色定義（v2.0 / AD-E07 v3.0）

本節為 spec 層級**唯一權威來源**，定義 4 種實質身份 label 與其底層欄位對應。架構決策依據為 architecture-spec.md AD-E07 v3.0（`users.business_role` 單欄位設計，廢除 v1.x `is_sales_manager` 與 v1.4 短期過渡 `e07_role`）。

### 4 角色 label 矩陣

| 實質身份 label | 系統層 `users.role` | 業務層 `users.business_role` | JWT `role` claim | JWT `businessRole` claim | 登入後預設導向 |
|---------------|---------------------|------------------------------|------------------|-------------------------|---------------|
| **系統管理者** | `admin` | 不適用（DB 可為 NULL，後端忽略） | `"admin"` | `null`（或忽略） | `/`（帳號管理） |
| **業務部長** | `user` | `'director'` | `"user"` | `"director"` | `/assignment/overview` |
| **業務處長** | `user` | `'section_chief'` | `"user"` | `"section_chief"` | `/assignment/overview` |
| **一般使用者** | `user` | `NULL` | `"user"` | `null` | `/c360/customers` |

> **Customer 360（E06）可用性矩陣（v2.1.0，US-177 / F111）**：系統管理者 ✓ ／ 業務部長 ✗ ／ 業務處長 ✗ ／ 一般使用者 ✓。設計理由：**業務角色使用者（部長 / 處長）的營運首頁為分派總覽（`/assignment/overview`），Customer 360 對其非日常功能，故自 sidebar 與前端路由移除**。此為**純前端 RBAC**（sidebar 可見性 + 路由守衛 + 角色感知導向）；後端 Customer 360（E06）端點維持 `authenticated`，不因本矩陣新增 Guard。

### 欄位語意說明

- **4 角色為「系統角色 × 業務角色」之組合視圖**：DB 實際儲存兩個獨立欄位（`users.role` + `users.business_role`），label 為 UI 顯示與 spec 溝通用語，後端授權邏輯一律以 raw 欄位（或 JWT claim）為準
- **`users.business_role`**：`VARCHAR(20) NULL` enum：`'director'` / `'section_chief'` / `NULL`；DB CHECK constraint 強制（詳見 data-model.md）
- **互斥性**：`'director'` 與 `'section_chief'` 為 enum 單值，DB 層 CHECK + DTO 層 `@IsIn(['director','section_chief'])` 兩層保護
- **單一寫入入口**：`business_role` 唯一寫入端點為 [F006a](F006a-update-business-role.md) PATCH `/api/v1/accounts/:id/business-role`（admin only）；其他端點即使 body 含此欄位亦應忽略
- **admin 帳號的 business_role**：邏輯上不適用；DB 可為 NULL；即使被誤設為 `'director'` / `'section_chief'`，後端 `role='admin'` 即享有 admin 全部權限（不疊加業務角色限制）

### 設計約束

- **唯一權威性**：其他文件（前端路由設定、sidebar 元件、F006 / F006a / F045 / F073 / F074 / scope.md / error-handling.md / E07 全系列 spec）涉及角色 label、登入後導向、sidebar 顯示、Guard 套用規則時，必須引用本節（§4.5）與下方 §4.6 而非另行定義
- **與後端對齊**：本節為前端 UX + JWT claim 規則；後端 Guard 體系（DirectorGuard / SectionChiefGuard / DirectorOrSectionChiefGuard）詳見 §4.6 與 AD-E07 v3.0，兩層必須對同一矩陣達成共識
- **不可見項目不渲染**：sidebar 對該身份不可見的項目必須完全不出現在 DOM（不可僅用 `disabled` 或 CSS `hidden`），參考 AC-6
- **客戶名單分派分組**：僅在 `role=admin` 或 `businessRole IN ('director','section_chief')` 時顯示；組內個別子項依 §4.6 矩陣決定可見性
- **Customer 360 分組（v2.1.0）**：僅在 `role=admin` 或 `businessRole IS NULL`（一般使用者）時顯示；業務部長 / 業務處長不顯示，且前端路由守衛攔截其對 `/c360/**` 的存取並重導向 `/assignment/overview`（純前端強制；後端 E06 端點維持 `authenticated`）

---

## 4.6 角色 × 模組權限矩陣與 Guard 對應（v2.0 / AD-E07 v3.0）

本節為 E07 全系列 Feature（F048~F072 / F075~F089）**Controller Guard 套用之權威指引**。下游 spec 與實作不得另行定義 Guard 規則，發現衝突時以本節為準並回頭修正下游 spec。

### 4.6.1 角色 × 模組權限矩陣

行為 4 種實質身份；列為 E07 模組（M01~M07）。內容代表「該身份對該模組可執行之 CRUD 動作」：`C`=建立、`R`=讀取、`U`=更新、`D`=刪除、`-`=無權。

| 模組 | 系統管理者 (admin) | 業務部長 (director) | 業務處長 (section_chief) | 一般使用者 (NULL) |
|------|------|------|------|------|
| **M01 名單定義**（F048~F052、F077） | C/R/U/D | C/R/U/D | R | - |
| **M02 計分卡**（F053~F060、F069） | C/R/U/D | C/R/U/D | R | - |
| **M03a 部門比例**（F079~F081） | C/R/U/D | C/R/U/D | R | - |
| **M03b 個別業務比例**（F082~F085） | C/R/U/D | C/R/U/D | C/R/U/D（轄區內） | - |
| **M03c 簽核**（F086~F087） | C/R/U/D | C/R/U/D | R | - |
| **M03d 準備完成 / Rollback**（F088~F089） | C/R/U/D | C/R/U/D | R | - |
| **M04 月名單分派觸發**（F061） | C/R/U/D | C/R/U/D | R（跑歷史） | - |
| **M05 快照 / 歷史查詢**（F062~F067） | R | R | R | - |
| **M06 代碼維護 / 白名單**（F075~F076） | C/R/U/D | C/R/U/D（寫入端） | R | - |
| **M07 角色管理**（F006a、F073、F074） | C/R/U/D | - | - | - |

> **M03b 處長轄區限縮說明**：處長對「個別業務比例」具完整 CRUD，但 service 層必須以 `scopeByCreator()` 過濾 `created_by = currentUser.id`（即僅可操作自己建立的紀錄）。Controller 層 Guard 僅檢查 `DirectorOrSectionChiefGuard`，**轄區過濾為 service 層責任**。

### 4.6.2 Controller Guard 對應表

下游 E07 Feature 之 Controller 必須依下表套用 Guard。Guard 名稱以 `@nestjs/common` decorator 形式套用（`@UseGuards(...)` + `@RequireBusinessRole(...)`）。

| 端點分類 | Feature ID | HTTP Method | Guard | 備註 |
|---------|-----------|-------------|-------|------|
| **名單 CRUD（寫入）** | F050~F052、F077（寫入） | POST/PUT/DELETE | `DirectorGuard` | 處長僅讀，不可建立/修改/刪除名單 |
| **名單瀏覽** | F048、F077（GET） | GET | `DirectorOrSectionChiefGuard` | 部長 + 處長皆可瀏覽 |
| **Stage 0 試算（部門矩陣 + per-list COUNT）** | F049（GET，v2.0 / US-168） | GET | `DirectorOrSectionChiefGuard` + service 層 dept scope filter | 部長 / admin 看全部門；處長唯讀且 service 強制限縮至其轄區 `obdeptid`（複用 `getScopeDeptCode → ob_dept_pct.obdeptid`）；scope=null → 200 空結果非 403。取代 v1.x `DirectorGuard`（部長專屬）|
| **M02 計分卡寫入** | F053~F060（POST/PUT/DELETE）、F069（寫入） | POST/PUT/DELETE | `DirectorGuard` | |
| **M02 計分卡讀取** | F053~F060（GET）、F069（GET） | GET | `DirectorOrSectionChiefGuard` | |
| **M03a 部門比例 CRUD** | F079~F081 | 全 method | `DirectorGuard` | 處長僅讀（GET 拆分後改用 `DirectorOrSectionChiefGuard`） |
| **M03b 個別業務比例 CRUD** | F082~F085 | 全 method | `DirectorOrSectionChiefGuard` + service `scopeByCreator()` | 處長僅可操作自己轄區紀錄 |
| **M03c 簽核** | F086~F087 | POST/PUT | `DirectorGuard` | 處長無簽核權 |
| **M03d 準備完成** | F088 | POST | `DirectorOrSectionChiefGuard` | 依 user story 推進至下階段 |
| **M03d Rollback** | F089 | POST/DELETE | `DirectorGuard` | 僅部長可回退 |
| **M04 月名單分派觸發** | F061 | POST | `DirectorGuard` | 處長無觸發權 |
| **M04 月名單分派歷史 GET** | F061（GET 子端點） | GET | `DirectorOrSectionChiefGuard` | |
| **M05 快照歷史 GET** | F062~F067（GET） | GET | `DirectorOrSectionChiefGuard` | 全 GET 端點 |
| **M06 代碼維護 GET** | F075~F076（GET） | GET | `DirectorOrSectionChiefGuard` | |
| **M06 白名單寫入** | F075~F076（POST/PUT/DELETE） | POST/PUT/DELETE | `DirectorGuard` | |
| **M07 角色管理寫入** | F006a、F073~F074（寫入） | PATCH/POST | `AdminGuard`（系統內建） | 業務角色不適用，admin only |
| **推進至下階段** | F078、F080、F084 | POST | `DirectorOrSectionChiefGuard` | 依 user story Actor，部長處長皆可 |

### 4.6.3 Guard 體系（廢除 SalesManagerGuard）

| Guard 名稱 | 通過條件（JWT claim） | 失敗錯誤碼 |
|-----------|---------------------|----------|
| `DirectorGuard` | `role='user'` 且 `businessRole='director'` | `E07_REQUIRES_DIRECTOR`（HTTP 403） |
| `SectionChiefGuard` | `role='user'` 且 `businessRole='section_chief'` | `E07_REQUIRES_SECTION_CHIEF`（HTTP 403）（保留供未來純處長端點使用） |
| `DirectorOrSectionChiefGuard` | `role='user'` 且 `businessRole IN ('director','section_chief')` | `E07_ROLE_NOT_ASSIGNED`（HTTP 403） |

> **admin 帳號處理**：上述三 Guard 皆**不**自動放行 admin。若 admin 需存取 E07 端點（例如系統巡檢），須由 Controller 額外套用 `@PublicForAdmin()` decorator 或在 Guard 內加 `if (user.role==='admin') return true` 短路（實作層由 system-architect 決議；spec 僅規範端點對「業務角色身份」的要求）。

### 4.6.4 JWT Payload 規格（v2.0 破壞性變更）

```json
{
  "sub": "<userId UUID>",
  "email": "<email>",
  "role": "admin" | "user",
  "businessRole": "director" | "section_chief" | null,
  "iat": <unix timestamp>,
  "exp": <unix timestamp>,
  "passwordChangedAt": <unix timestamp>
}
```

**變更摘要**：
- **新增** claim：`businessRole`（取代 v1.x `isSalesManager` + v1.4 `e07Role`）
- **廢除** claim：`isSalesManager`、`e07Role`（後端發 token 時不再寫入；前端解析時忽略）
- **Legacy JWT 處理**：若舊 token 不含 `businessRole` claim，Guard 與前端一律視為 `null`（一般使用者語意），行為一致；不阻擋登入、不強制 re-login（待自然過期或 password_changed_at 觸發失效）
- **Token revoke 機制**：沿用 F010 `password_changed_at` 機制——admin 透過 [F006a](F006a-update-business-role.md) 變更 `business_role` 時，同 transaction 觸發 `password_changed_at = NOW()`，使該 user 既有 JWT 全數失效（下次 API 請求時 Guard 比對 `JWT.passwordChangedAt < user.password_changed_at` 拒絕）

### 4.6.5 既有矩陣的下游引用

| 下游文件 | 引用內容 |
|---------|---------|
| architecture-spec.md AD-E07 v3.0 | 後端 Guard 體系與 Schema 設計對應本節 §4.6.2 / §4.6.3 |
| [F006a](F006a-update-business-role.md) | `business_role` 唯一寫入入口；同 transaction 觸發 token revoke |
| F045（系統角色定義） | 提供 `role` 的有效值範圍（admin / user） |
| [F073](F073-define-director-role.md) / [F074](F074-define-section-chief-role.md) | 業務角色語意與權限定義 |
| F048~F072 / F075~F089 | E07 全系列 Controller 必須引用 §4.6.2 套用對應 Guard |
| scope.md | 模組存取範圍（E01~E07）對應本矩陣 |
| error-handling.md | `E07_ROLE_NOT_ASSIGNED` / `E07_REQUIRES_DIRECTOR` / `E07_REQUIRES_SECTION_CHIEF` 錯誤碼定義 |

---

## 5. 業務規則

| 規則編號 | 規則說明 |
|---------|---------|
| BR-001 | 密碼驗證邏輯與 F001 完全相同（bcrypt compare，cost factor >= 10） |
| BR-002 | 無效憑證的錯誤訊息與 F001 一致，使用通用訊息 |
| BR-003 | JWT Payload 中 `role` + `businessRole` 組合決定前端登入後導向與 sidebar 顯示（詳見 §4.5 / §4.6 矩陣） |
| BR-004 | 一般使用者（`role=user`, `businessRole=null`）不可存取 admin 專屬功能與業務角色專屬功能（觸碰 `/api/v1/assignment/**` 時後端回 `E07_ROLE_NOT_ASSIGNED`） |
| BR-005 | RBAC 強制執行必須同時在前端路由層、前端 sidebar 渲染層與後端 API 層（Guard）實施（三層對齊 §4.5 / §4.6 矩陣） |
| BR-006 | `/user-info` 說明頁面在 MVP 階段不作為任何身份的預設導向目的地；保留為極端 fallback 路由（無 sidebar 項可顯示時使用） |
| BR-RBAC | §4.5「角色 label 矩陣」+ §4.6「Controller Guard 對應表」為 spec 層級**唯一權威來源**；架構層（Guard）與實作層（前端 router / sidebar / 後端 controller decorator）所有 RBAC 行為必須對齊此二矩陣，矩陣變更時須同步檢視 AD-E07 v3.0 |
| BR-Redirect | 登入後預設導向遵循 §4.5 矩陣最後一欄：`admin` 導向 `/`（帳號管理）；`businessRole IN ('director','section_chief')` 導向 `/assignment/overview`（分派總覽，見 [F111](F111-assignment-overview-dashboard.md) / US-177）；`businessRole=null`（一般使用者）導向 `/c360/customers`。導向與 Customer 360 存取限制之強制皆為**純前端**（sidebar 可見性 + 路由守衛 + 角色感知導向）；後端 Customer 360（E06）端點維持 `authenticated`，不因本規則新增 Guard（v2.1.0） |
| BR-Revoke | admin 透過 [F006a](F006a-update-business-role.md) 變更 `business_role` 時，同 transaction 將 `users.password_changed_at = NOW()`；該 user 既有 JWT 全數失效，下次 API 請求須重新登入（沿用 F010 機制） |
| BR-LegacyJWT | 舊 JWT 不含 `businessRole` claim 時，後端 Guard 與前端一律視為 `null`；不阻擋既有 session、不強制 re-login，待自然過期或 `password_changed_at` 觸發 |

---

## 6. UI/UX 需求

### 登入頁面

登入頁面與 F001 共用同一個介面，無需區分角色。所有 UI 元素請參閱 [F001-admin-login.md#6-uiux-需求](F001-admin-login.md#6-uiux-需求)。

### 登入後預設頁面

依 §4.5 矩陣決定，使用者登入成功後直接進入該身份的預設頁面（admin → `/`、業務部長 / 業務處長 → `/assignment/overview`、一般使用者 → `/c360/customers`）。預設頁面本身的 UI/UX 由對應 Feature spec 規範（帳號管理 F005、分派總覽 [F111](F111-assignment-overview-dashboard.md)、Customer 360 E06 相關 Feature），本節不重複定義。

### Sidebar（跨頁共用元件）

| 項目 | 要求 |
|------|------|
| 共用範圍 | sidebar 為**跨頁共用元件**，所有受保護頁面（含 admin、業務部長、業務處長、一般使用者可存取的頁面）共用同一份元件實作；不可在個別頁面重複實作或硬編寫死選單 |
| 動態渲染 | sidebar 依登入身份（JWT 解析後的 `role` + `businessRole`）動態決定可見項目，遵循 §4.5 + §4.6 矩陣 |
| 不可見即不渲染 | 對該身份不可見的項目必須完全不出現在 DOM（不可僅 `disabled` 或 CSS hidden），參考 AC-6 |
| 群組摺疊 | 多子項的群組（如「客戶名單分派」含 M01~M07）支援摺疊；摺疊狀態屬 UI 偏好，不影響 RBAC |
| 路由高亮 | 當前路由對應的 sidebar 項目須有視覺高亮（具體樣式參考既有 prototype `/prototypes/sidebar` 與 Customer 360 prototype） |
| 登出按鈕 | sidebar 或頂部 Header 須提供登出入口，觸發 F003 登出流程 |

### `/user-info` 頁面（極端 fallback，MVP 階段不應觸及）

| 項目 | 說明 |
|------|------|
| 用途 | 僅在「無任何 sidebar 項可對該身份顯示」的極端情境下作為 fallback 目的地 |
| MVP 階段預期 | **不應發生**，因 §4.5 矩陣保證所有合法登入身份至少擁有一個預設 landing（admin → 帳號管理、業務部長 / 業務處長 → 分派總覽、一般使用者 → Customer 360） |
| 內容 | 簡潔的品牌化頁面，顯示「目前尚無可用功能，請聯絡您的管理員。」與登出按鈕 |
| 架構層處理 | 若 system-architect 評估後決議移除此 fallback 路由，本 spec 不阻擋；移除前須確認 §4.5 矩陣中無任何身份會落入「零可見 sidebar 項」狀態 |

### 互動狀態

| 狀態 | 行為 |
|------|------|
| 登入成功（admin） | 重新導向至 `/`，sidebar 顯示完整系統管理者選單 |
| 登入成功（user, businessRole='director'） | 重新導向至 `/assignment/overview`，sidebar 顯示客戶名單分派（M01~M07 全部子項），**不顯示** Customer 360 |
| 登入成功（user, businessRole='section_chief'） | 重新導向至 `/assignment/overview`，sidebar 顯示客戶名單分派（僅處長可達子項，依 §4.6 矩陣），**不顯示** Customer 360 |
| 登入成功（user, businessRole=null） | 重新導向至 `/c360/customers`，sidebar 僅顯示 Customer 360 |
| 一般使用者導航至 admin 路由 | 路由守衛攔截，重新導向至 `/c360/customers` |
| 一般使用者導航至業務角色專屬路由（`/assignment/**`） | 路由守衛攔截，重新導向至 `/c360/customers` |
| 業務部長 / 業務處長導航至 admin 路由 | 路由守衛攔截，重新導向至 `/assignment/overview` |
| 業務部長 / 業務處長導航至 Customer 360 路由（`/c360/**`） | 路由守衛攔截，重新導向至 `/assignment/overview` |
| 業務處長導航至部長專屬路由（如 `/assignment/lists/create`） | 路由守衛攔截，重新導向至處長預設頁（如 `/assignment/lists`） |

---

## 7. 錯誤場景

登入相關錯誤場景與 F001 完全一致，請參閱 [F001-admin-login.md#7-錯誤場景](F001-admin-login.md#7-錯誤場景)。

以下為 F002 特有的錯誤場景：

| 錯誤情境 | 錯誤代碼 | 使用者可見訊息 | 系統行為 |
|---------|---------|--------------|---------|
| 一般使用者存取 admin 前端路由 | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至 `/c360/customers` |
| 一般使用者存取業務角色專屬前端路由 | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至 `/c360/customers` |
| 業務部長 / 業務處長存取 admin 前端路由 | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至 `/assignment/overview` |
| 業務部長 / 業務處長存取 Customer 360 前端路由（`/c360/**`） | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至 `/assignment/overview`（業務角色無 Customer 360 存取權，US-177 / F111） |
| 業務處長存取部長專屬前端路由 | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至處長預設頁 |
| User 呼叫 admin 專屬 API | FORBIDDEN | 「您沒有權限執行此操作。」 | 回傳 HTTP 403，記錄存取嘗試至日誌 |
| 一般使用者呼叫 `/api/v1/assignment/**` | E07_ROLE_NOT_ASSIGNED | 「您尚未被指派業務角色，請聯絡管理員。」 | 後端 `DirectorGuard` 或 `DirectorOrSectionChiefGuard` 回傳 HTTP 403，記錄至日誌 |
| 業務處長呼叫部長專屬端點 | E07_REQUIRES_DIRECTOR | 「此操作需業務部長權限。」 | 後端 `DirectorGuard` 回傳 HTTP 403，記錄至日誌 |
| 登入後 JWT 解析時 `businessRole` 欄位缺失（legacy JWT） | N/A（前端容錯） | 無錯誤訊息 | **保守視為 `null`** 並導向 `/c360/customers`（一般使用者視角，sidebar 不顯示客戶名單分派群組）；**不阻擋登入**；前端記錄 console warning 供 DevTools 觀察 |

詳細 Retry / Fallback 策略請參閱 [error-handling.md](../error-handling.md#auth-errors)。

---

## 8. 測試案例

| # | 測試案例 | 前置條件 | 操作 | 預期結果 |
|---|---------|---------|------|---------|
| T-001 | 一般使用者登入後導向 Customer 360 | User 帳號（`business_role IS NULL`）已建立且啟用 | 輸入正確 Email 與密碼，點擊登入 | HTTP 200，JWT 發行（payload `role=user`, `businessRole=null`），重新導向至 `/c360/customers`，sidebar 僅顯示 Customer 360 |
| T-002 | 錯誤密碼 | User 帳號已建立且啟用 | 輸入正確 Email 與錯誤密碼 | HTTP 401，顯示「Email 或密碼錯誤」 |
| T-003 | 已停用的 User 帳號 | User 帳號已停用 | 輸入正確 Email 與密碼 | HTTP 403，顯示帳號停用訊息 |
| T-004 | 一般使用者嘗試存取 admin 前端路由 | User（`businessRole=null`）已登入 | 瀏覽器直接輸入 admin 路由 URL（如 `/`） | 路由守衛攔截，重新導向至 `/c360/customers` |
| T-005 | User 呼叫 admin 專屬 API | User 已登入 | 以 User Token 呼叫 admin API 端點 | HTTP 403 Forbidden，日誌記錄存取嘗試 |
| T-006 | 勾選「記住我」 | User 帳號已建立且啟用 | 勾選後成功登入 | Token 有效期為 30 天 |
| T-007 | 未勾選「記住我」 | User 帳號已建立且啟用 | 不勾選，成功登入 | Token 於閒置 8 小時後失效 |
| T-008 | 業務部長登入後導向分派總覽 | User 帳號（`business_role='director'`）已建立且啟用 | 輸入正確 Email 與密碼，點擊登入 | HTTP 200，JWT 發行（payload `role=user`, `businessRole='director'`），重新導向至 `/assignment/overview`，sidebar 顯示客戶名單分派（M01~M07 全部子項），**不顯示** Customer 360 |
| T-008b | 業務處長登入後導向分派總覽 | User 帳號（`business_role='section_chief'`）已建立且啟用 | 輸入正確 Email 與密碼，點擊登入 | HTTP 200，JWT 發行（payload `role=user`, `businessRole='section_chief'`），重新導向至 `/assignment/overview`，sidebar 顯示客戶名單分派（僅處長可達子項），**不顯示** Customer 360 |
| T-009 | 業務部長可存取分派路由 | User（`businessRole='director'`）已登入 | 點擊 sidebar 「客戶名單分派」項目 | 成功進入分派頁面，路由守衛不攔截 |
| T-009b | 業務處長存取部長專屬路由被攔截 | User（`businessRole='section_chief'`）已登入 | 瀏覽器直接輸入 `/assignment/lists/create` | 路由守衛攔截，重新導向至處長預設頁；若直接呼叫對應 API 則後端 `DirectorGuard` 回 HTTP 403 + `E07_REQUIRES_DIRECTOR` |
| T-010 | 業務角色嘗試存取 admin 路由 | User（`businessRole='director'` 或 `'section_chief'`）已登入 | 瀏覽器直接輸入 admin 路由 URL | 路由守衛攔截，重新導向至 `/assignment/overview` |
| T-011 | 一般使用者嘗試存取分派路由 | User（`businessRole=null`）已登入 | 瀏覽器直接輸入 `/assignment/**` 路由 | 路由守衛攔截，重新導向至 `/c360/customers`；若直接呼叫 API 則後端回 HTTP 403 + `E07_ROLE_NOT_ASSIGNED` |
| T-012 | sidebar 不渲染未授權項目 | User（`businessRole=null`）已登入 | 檢查 DOM 中 sidebar 結構 | 客戶名單分派與 admin 專屬群組完全不出現在 DOM（非 disabled、非 CSS hidden） |
| T-013 | JWT 缺 `businessRole` 欄位（legacy）保守降級 | 後端發出舊版 JWT（payload 無 `businessRole` 欄位） | User 登入並由前端解析 JWT | 不阻擋登入；前端視為 `null`，導向 `/c360/customers`，sidebar 僅顯示 Customer 360；console 輸出 warning |
| T-014 | admin 變更 business_role 觸發 token revoke | 業務部長 A 已登入並持有有效 JWT；admin 透過 F006a 將 A 改為 `section_chief` | A 嘗試以原 JWT 呼叫部長專屬端點 | 後端比對 `JWT.passwordChangedAt < user.password_changed_at` 回傳 HTTP 401，要求 re-login |
| T-015 | 業務角色存取 Customer 360 路由被攔截 | User（`businessRole='director'` 或 `'section_chief'`）已登入 | 瀏覽器直接輸入 `/c360/customers`（或任一 `/c360/**`） | 前端路由守衛攔截，重新導向至 `/assignment/overview`；sidebar 不渲染 Customer 360 群組（後端 E06 端點本身仍為 `authenticated`，前端不呼叫） |

---

## 9. 依賴關係

| 類型 | 項目 | 說明 |
|------|------|------|
| Blocked By | 無 | 此為基礎功能，無前置依賴 |
| Blocks | F003（登出） | 需先有登入才能登出 |
| 資料依賴 | US-010（建立帳號） | 帳號須透過 Admin 帳號管理功能預先建立 |
| 共用基礎建設 | F001（Admin 登入） | 共用同一個 API 端點、驗證邏輯與 Token 管理機制 |
| NFR | NFR-001（安全性） | JWT Token 管理、bcrypt 密碼雜湊、RBAC 強制執行 |
| NFR | NFR-001.2（授權強制執行） | User 存取 Admin 端點時回傳 HTTP 403 並記錄日誌 |
| NFR | NFR-002（效能） | API 回應時間 P95 低於 500ms |

---

## 10. 資料需求

### 涉及實體

| 實體 | 操作 | 說明 |
|------|------|------|
| User | 讀取 | 依 Email 查詢使用者記錄，驗證密碼與帳號狀態 |
| Session / Token | 建立 | 登入成功後發行 JWT Token（role: user） |

### 相關欄位

與 F001 相同，完整欄位清單請參閱 [F001-admin-login.md#10-資料需求](F001-admin-login.md#10-資料需求)。

關鍵差異：
- `user.role` 值為 `"user"`，與 `business_role` 組合決定前端登入後導向（詳見 §4.5 / §4.6）
- `user.business_role` 為 `VARCHAR(20) NULL` enum（`'director'` / `'section_chief'` / `NULL`）；後端 Guard 體系（`DirectorGuard` / `SectionChiefGuard` / `DirectorOrSectionChiefGuard`）以 JWT `businessRole` claim 判斷 E07 端點存取權限（參考 AD-E07 v3.0）
- 前端 sidebar 渲染同樣依 `role` + `businessRole` 決定可見項目，三層（前端路由 / sidebar / 後端 Guard）必須對齊 §4.5 + §4.6 矩陣

詳細資料模型請參閱 [data-model.md#user-entity](../data-model.md#user-entity)。

---

## 11. 安全性考量

所有登入安全性要求與 F001 相同，請參閱 [F001-admin-login.md#11-安全性考量](F001-admin-login.md#11-安全性考量)。

F002 特有的安全性要求：

| 項目 | 要求 |
|------|------|
| RBAC 前端路由保護 | 前端路由守衛必須阻擋一般使用者存取 admin 路由與業務角色專屬路由；業務部長 / 業務處長存取 admin 路由同樣攔截；業務處長存取部長專屬路由同樣攔截；業務部長 / 業務處長存取 Customer 360 路由（`/c360/**`）同樣攔截並重導向 `/assignment/overview`（v2.1.0，純前端強制；後端 E06 端點維持 `authenticated`）（依 §4.5 / §4.6 矩陣） |
| RBAC 前端 sidebar 保護 | sidebar 元件不可渲染當前身份無權存取的項目（不可僅 disable），避免揭露未授權功能存在 |
| RBAC 後端 API 保護 | 後端 Guard 體系（DirectorGuard / SectionChiefGuard / DirectorOrSectionChiefGuard）依 §4.6.2 對應表套用；違反者回傳 HTTP 403 + 對應錯誤碼（`E07_ROLE_NOT_ASSIGNED` / `E07_REQUIRES_DIRECTOR` / `E07_REQUIRES_SECTION_CHIEF`） |
| Token revoke | admin 變更 `business_role` 同 transaction 觸發 `password_changed_at = NOW()` 使既有 JWT 失效，沿用 F010 機制（詳見 BR-Revoke） |
| 存取日誌 | 未授權的 API 端點存取嘗試必須記錄至日誌（含 userId、嘗試存取的端點、Guard 失敗類型、時間戳記） |

完整安全性需求請參閱 [NFR-001](../stories/non-functional/NFR-001-security.md)。

---

## 12. 效能需求

與 F001 相同，請參閱 [F001-admin-login.md#12-效能需求](F001-admin-login.md#12-效能需求)。

---

## 13. 交叉參考

| 類型 | 連結 |
|------|------|
| 來源 Story | [US-002-user-login.md](../stories/epics/E01-auth-and-login/US-002-user-login.md) |
| Epic Brief | [E01 epic-brief.md](../stories/epics/E01-auth-and-login/epic-brief.md) |
| 相關 Feature | [F001-admin-login.md](F001-admin-login.md)、[F003-logout.md](F003-logout.md)、[F006a-update-business-role.md](F006a-update-business-role.md)、[F010-admin-reset-password.md](F010-admin-reset-password.md)、[F113-employee-no-login-identifier.md](F113-employee-no-login-identifier.md)（員工編號登入識別碼，登入分支權威來源）、~~[F008-assign-change-role.md](F008-assign-change-role.md)~~（DEPRECATED v3.0）、[F045-business-role-definitions.md](F045-business-role-definitions.md)、[F073-define-director-role.md](F073-define-director-role.md)、[F074-define-section-chief-role.md](F074-define-section-chief-role.md) |
| 架構決策 | architecture-spec.md AD-E07 v3.0（`users.business_role` 單欄位 + Guard 體系） |
| 安全性 NFR | [NFR-001-security.md](../stories/non-functional/NFR-001-security.md) |
| 效能 NFR | [NFR-002-performance.md](../stories/non-functional/NFR-002-performance.md) |
| 流程圖 | [diagrams/F002-user-login.mmd](../diagrams/F002-user-login.mmd) |
| 資料模型 | [data-model.md#user-entity](../data-model.md#user-entity) |
| 錯誤處理 | [error-handling.md#auth-errors](../error-handling.md#auth-errors) |

---

## 14. 更新紀錄

| 版本 | 日期 | 變更摘要 |
|------|------|---------|
| **v2.1.1** | **2026-07-13** | **【登入識別碼擴充：Email 或員工編號，ref US-179 / F113】** 登入端點（與 F001 共用）識別碼欄位維持名 `email`，語意擴充為承載 Email 或員工編號擇一；後端 DTO 由 `@IsEmail` 放寬為 `@IsNotEmpty + @IsString`；`auth.service.login()` 依 `@` 分支（含 `@` → Email 小寫化；否則 → `employee_no` 精確、大小寫敏感）；失敗一律回既有 `AUTH_INVALID_CREDENTIALS`；`user` 物件新增 `employee_no`（nullable）。忘記密碼維持 email-only、不支援員工編號。RBAC / 導向不受影響。影響章節：頂部 banner、§4 差異說明、§13 交叉參考。分支與欄位契約權威來源＝[F113](F113-employee-no-login-identifier.md)。 |
| v1.0 | 2026-04-02 | 初版（與 F001 拆分） |
| v1.1 | 2026-04-24 | 補 `is_sales_manager` 旗標說明與 JWT payload 差異 |
| v1.2 | 2026-05-13 | 彙整 RBAC 矩陣與登入導向邏輯（解決 `manager@cdmp.test` 登入後被導向無 sidebar 的 `/user-info`、無法導覽至 Customer 360 的 bug）：新增 §4.5「登入後導向與可用功能」實質身份矩陣作為唯一權威來源；修訂 AC-1（一般使用者導向 `/c360/customers`）；新增 AC-5（業務主管導向）、AC-6（sidebar 動態渲染）；新增 BR-RBAC、BR-Redirect；補強 §6 UI/UX 章節（sidebar 為共用元件、`/user-info` 改為極端 fallback）；§7 補 JWT `is_sales_manager` 解析失敗保守降級規則；新增 T-008~T-013 測試案例 |
| **v2.1.0** | **2026-07-12** | **【業務角色移除 Customer 360 + 預設導向改分派總覽，ref US-177 / F111】** 業務部長（`business_role='director'`）與業務處長（`business_role='section_chief'`）不再具備 Customer 360（E06）存取權：sidebar 不顯示 Customer 360 群組、前端路由守衛攔截 `/c360/**` 並重導向 `/assignment/overview`；登入後預設導向由 `/c360/customers` 改為 `/assignment/overview`（分派總覽儀表板，客戶名單分派模組 landing）。一般使用者（`businessRole IS NULL`）與系統管理者（`admin`）不受影響（一般使用者仍 `/c360/customers`、admin 仍 `/` 且保有 Customer 360）。強制為**純前端 RBAC**（sidebar 可見性 + 路由守衛 + 角色感知導向），後端 Customer 360（E06）端點維持 `authenticated`、不新增 Guard。影響章節：§1 功能摘要；§4 RBAC 路由保護表（新增 `/c360/**` 攔截列 + 業務角色 admin 路由攔截改導向 `/assignment/overview`）；§4.5（業務部長 / 業務處長「登入後預設導向」欄改 `/assignment/overview` + 新增 Customer 360 可用性矩陣 + Customer 360 分組規則）；AC-1（補未變更註）；AC-5 / AC-5b（改導向分派總覽 + 移除 Customer 360）；AC-6（新增 Customer 360 群組可見性規則）；§6 UI/UX（登入後預設頁面 + `/user-info` fallback 說明 + 互動狀態表）；§7 錯誤場景（新增 `/c360/**` 攔截列）；§8 測試案例（T-008 / T-008b / T-010 更新 + 新增 T-015）；BR-Redirect（改寫）。 |
| **v2.0** | **2026-05-16** | **【E07 合併重構 AD-E07 v3.0 — 破壞性變更】** 廢除 `users.is_sales_manager`（v1.x）與 `users.e07_role`（v1.4 短期過渡），整合為單一欄位 `users.business_role VARCHAR(20) NULL`（enum: `'director'` / `'section_chief'` / `NULL` + DB CHECK constraint）。實質身份由 3 種改為 **4 種 label**：「系統管理者」/「業務部長」/「業務處長」/「一般使用者」。**§4.5 完整重寫**為「4 角色 label 矩陣」，新增欄位語意說明、互斥性規則、單一寫入入口（F006a）。**新增 §4.6**「角色 × 模組權限矩陣與 Guard 對應」作為 E07 全系列 Feature（F048~F072 / F075~F089）Controller Guard 套用之**權威指引**：含 §4.6.1 模組權限矩陣（M01~M07）、§4.6.2 Controller Guard 對應表、§4.6.3 Guard 體系（DirectorGuard / SectionChiefGuard / DirectorOrSectionChiefGuard 取代 SalesManagerGuard）、§4.6.4 JWT payload 規格（`businessRole` claim 取代 `isSalesManager` + `e07Role`，含 legacy JWT 處理 + token revoke 機制）、§4.6.5 下游引用清單。AC-5 拆為 AC-5（部長）+ AC-5b（處長）；AC-6 改寫為 4 身份。BR-003/004/005/RBAC/Redirect 全面改寫；新增 BR-Revoke（`password_changed_at` 觸發）、BR-LegacyJWT（不阻擋既有 session）。§4 RBAC 路由保護表新增「業務處長存取部長路由攔截」與新錯誤碼（`E07_ROLE_NOT_ASSIGNED` / `E07_REQUIRES_DIRECTOR`）。§7 錯誤場景、§8 測試案例 T-008b/T-009b/T-014 補充處長與 token revoke 場景。§13 交叉參考新增 F006a / F073 / F074，F008 標 DEPRECATED。 |
