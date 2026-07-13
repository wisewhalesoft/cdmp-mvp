---
type: test-design-feature
feature_id: F113
feature_name: 員工編號作為登入識別碼（employee_no，登入識別碼二選一）
priority: P1
related_spec: /docs/specs/features/F113-employee-no-login-identifier.md
source_ad: /docs/specs/implementation-log/AD-E02-5-employee-no-login-identifier.md
source_stories: [US-179]
spec_version: "1.0"
last_updated: 2026-07-13
blocked_by: [F001, F002, F004, F005, F006]
---

# F113：員工編號作為登入識別碼 — 測試設計

> **範圍**：本文件為測試設計（test design），是 tdd-implementation 的**可執行真值來源**。**不含** production code、測試實作碼（`.spec.ts`/`.test.tsx`）、migration、entity 定義。依 CLAUDE.md Agent Workflow 邊界，test-designer 僅設計測試場景，不寫產品程式碼、不寫實際 test 檔。
>
> **權威來源優先序**：AD-E02-5 > F113 spec v1.0 > US-179。AD 已明確裁定並修正任務指示中的數處建議（見下方「Glossary」），本文件一律採 AD 裁定值。

## 驗收紅線（Definition of Done）

1. **登入識別碼分支絕不 trim**（I-EMPNO-LOGIN-EXACT-NO-TRIM-01，⚠️ regression 高風險）：`identifier` 恆為 `dto.email` 原始值；員工編號分支不 `.trim()`、不 `.toLowerCase()`；僅含 `'@'` 之 Email 分支才 `.toLowerCase()`。前後含空白之員工編號輸入**必須**比對不到（回統一 401），此為**刻意行為非 bug**——AD §3.3.2 明文修正了任務指示原建議之 `trim()`，此紅線用以防止 tdd-implementation 誤植回原建議。
2. **登入比對大小寫敏感、清單搜尋大小寫不敏感 — 兩者不可混用**（I-EMPNO-CASE-SENSITIVE-UNIQUE-01 / BR-8）：`'E12345'` 與 `'e12345'` 於登入與唯一性檢查中視為不同值；於清單搜尋中視為相同（`LOWER()` 兩側轉換）。
3. **⚠️⚠️ 既有 `auth.service.spec.ts` 之 `TS-F001-007` SQL Injection 測試必須同步修改**（本文件已逐行查證，非臆測）：現行斷言 `expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email: sqlInjectionEmail.toLowerCase() } })`（`apps/api/src/modules/auth/__tests__/auth.service.spec.ts:346-348`），其注入字串 `"' OR '1'='1'; DROP TABLE users; --"` **不含 `'@'`**——本次變更後該字串會被路由至 `employee_no` 分支（`findOne({where:{employee_no: identifier}})`，且不轉小寫），此斷言必然失敗。詳見 §十一 REGX-001。
4. **⚠️⚠️ `mssql-p1b2.mssql.spec.ts` 五項既有測試為 CI 阻斷風險，非選擇性**（AD §3.2.4/§10）：`BASELINE-003`／`STATIC-004` 為機械式數字調整；`FILTER-001`／`PARITY-004`／`PARITY-005` 需要新增「索引層級白名單」機制（非 `EXCLUDED_TABLES` 整表排除，會誤傷 `users` 既有 PK/email unique index 覆蓋）。詳見 §十 P1B2 companion 群組（**本文件最高優先度章節**）。
5. **忘記密碼完全不動**（I-EMPNO-FORGOT-PW-UNCHANGED-01）：`forgot-password.dto.ts` 仍 `@IsEmail`；純員工編號輸入回既有 400 格式錯誤（**非** AC-13 字面之 200），此為 AD §3.7 對 spec AC-13 字面的裁定修正，非本 Feature 之缺陷。
6. **兩軌唯一性之 SQLite/dev 邊界**：dev/sqlite/單元測試環境**僅有軌道 A（service 層檢查）**；filtered unique index（軌道 B）僅存在於 MSSQL migration，SQLite `synchronize` 不產生。單元測試對「有值時唯一」之保護 100% 依賴 service 層，需明確測案佐證此邊界（非臆測 DB 會擋）。
7. **`tsc --noEmit -p tsconfig.build.json` 零錯誤**（新增 entity 欄位、6 個 shared interface、4 個 api-local interface、新 validator 檔、2 個 DTO、1 個 migration，feedback_vitest_no_typecheck 教訓：vitest 不做型別檢查，必跑）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F113 spec](../../specs/features/F113-employee-no-login-identifier.md)（§3 欄位契約 / §5 登入分支 / §6 AC / §7 API 增量 / §8 BR）+ [AD-E02-5](../../specs/implementation-log/AD-E02-5-employee-no-login-identifier.md)（§3 全部裁定含程式碼契約 / §7 不變式 / §8 測試邊界建議 / §9 檔案異動清單）+ `apps/api/src/modules/auth/__tests__/auth.service.spec.ts`（本文件已標註之必要修改點）+ `apps/api/src/database/__tests__/mssql-p1b2.mssql.spec.ts`（本文件已標註之必要修改點）|
| QA / Tester | 本文件全部 + `error-handling.md#account-errors`（`ACCOUNT_EMPLOYEE_NO_EXISTS` 於本文件寫作當下尚未登錄，屬 F113 spec §14 已知待辦）|
| CI/CD Owner | 本文件「測試層與自動化就緒度」——絕大多數案例可全數併入既有 unit 測試套件；僅 SCHEMA 群組之 live 存在性斷言與 P1B2 companion 群組需要 `.mssql.spec.ts` gating（`mssqlPortReachable`），與既有慣例一致 |
| Product Analyst | 「殘留風險與待決問題」 |
| UI/UX Designer | FE-LOGIN/FE-CREATE/FE-EDIT/FE-LIST 群組 + spec §3.2「多重違規之錯誤訊息優先序」（最終文案交 ui-ux-designer，本文件僅約束語意與優先序） |

---

## Glossary — spec/AD 落差鎖定（防漂移）

> 本表為 test-designer 逐行比對任務指示、F113 spec v1.0 與 AD-E02-5 v1.0 後鎖定之權威值。多 agent TDD 流程下游若僅讀 spec 表面文字或任務指示原始建議，容易誤用已被 AD 推翻的舊值（feedback_tdd_naming_drift 教訓）。

| 項目 | 任務指示 / spec 原文 | 本文件採用值（已查證） | 依據 |
|---|---|---|---|
| 登入分支是否 `trim()` | 任務指示原建議 `const raw = dto.email.trim(); if (raw.includes('@')) ...` | **不 trim**——`identifier` 恆為 `dto.email` 原始值，僅 Email 分支 `.toLowerCase()`，員工編號分支不做任何字元轉換 | AD §3.3.2「Auto-Challenge：修正任務指示建議之 trim()」，明文依 spec §5.3「登入端刻意不 trim」裁定 |
| filtered unique index 命名 | 任務指示 `1751884800004-MssqlAddUsersEmployeeNo.ts`（索引名未明定，早期草案曾提及 `UX_users_employee_no`） | **`uq_users_employee_no`**（小寫 `uq_` 前綴，比照本專案唯一既有 UNIQUE INDEX 前例 `uq_assignment_run_stage_log_run_stage`） | AD §3.2.2「索引命名修正」——`UX_` 大寫前綴在本庫無任何先例 |
| Entity 是否需要一般 `@Index` | 比照 `queue_job`（AD-E07-40）雙形狀（entity 一般索引 + migration filtered index） | **不需要**——`users` 表基數小（數十至數百列），不需疊加一般索引 | AD §3.1「是否需要一般 `@Index`」Auto-Challenge |
| Entity 欄位型別 | 是否需要 `nvarcharColumnType` helper（中文欄位防截斷） | **不需要**——`employee_no` 格式恆為 ASCII（`^[A-Za-z0-9_-]{1,32}$`），維持裸 `type:'varchar'`，與 `email` 欄位既有慣例一致 | AD §3.1「型別選擇」Auto-Challenge |
| `mssql-p1b2.mssql.spec.ts` 修法機制 | 未明定 | **索引層級白名單**（`AND NOT (t.name='users' AND i.name='uq_users_employee_no')`），**不可**比照 `queue_job` 之整表 `EXCLUDED_TABLES` 排除（會誤傷 `users` 既有 PK/email unique index 之 parity 覆蓋） | AD §3.2.4「裁定（架構建議）」；本文件已直接查證 `EXCLUDED_TABLES` 現行為表級排除機制（`mssql-p1b2.mssql.spec.ts:231`） |
| RBAC 拒絕碼 | US-179 AC-16 泛稱「403 Forbidden」 | **403 `AUTH_FORBIDDEN`**（`ERROR_CODES.FORBIDDEN`，`RolesGuard` 實際拋出，訊息「您沒有權限執行此操作。」） | 本文件已直接查證 `apps/api/src/common/guards/roles.guard.ts:36-39` 與 `error-codes.ts:5,153`——與 F112 案例不同，本 Feature 沿用**單一、既有、通用**的 `RolesGuard`（非 E07 系列之角色細分 Guard），碼值與 spec/AC 字面描述一致，**無落差**，此列僅作查證記錄用 |
| forgot-password AC-13 結果 | US-179/spec AC-13 字面期望「200 通用成功訊息」 | **維持現況 400 格式錯誤**（`@IsEmail` 攔截）；兩者對 BR-4「不洩漏帳號存在」皆等效，AD 裁定不擴大變更面 | AD §3.7「裁定：完全不修改」，spec AC-13「註」段已預告此落差並交 system-architect 定案 |

---

## 測試層與自動化就緒度

| 項目 | 說明 |
|---|---|
| **絕大多數案例免真實 MSSQL 連線** | LOGIN／LOGINDTO／FORGOT／DTOVAL／CREATE／UPDATE／LIST／GUARD／STATIC／REGX 十群組全數以 SQLite（或 mocked repository，沿用既有 `auth.service.spec.ts`/`accounts.service.spec.ts` 慣例）驗證，CI 常駐、無需序列化或 gating。 |
| **兩軌唯一性之分層測試邊界（本 Feature 核心測試邊界，需向下游明確傳達）** | **軌道 A**（service 層 `findOne` 重複檢查）於 SQLite/mock 環境**可完整驗證**（CREATE/UPDATE 群組）。**軌道 B**（MSSQL filtered unique index 之真實 DB 級唯一性防護）**僅能於 `.mssql.spec.ts` 驗證其「結構存在」**（SCHEMA-006：`sys.indexes.has_filter=1` + `filter_definition` 含 `employee_no`）——**真實併發競態防護本身（兩個近乎同時的 INSERT 是否被 DB 擋下）不在本輪測試設計範圍**，比照 AD §8「若 MVP 階段未特別設計併發測試，至少應驗證 migration 執行後 filtered index 確實存在」之最低要求，已記入 §十二 殘留風險。 |
| **SCHEMA 群組內部再分兩層** | (a) 純**靜態**源碼文字斷言（不需 DB 連線，讀取 migration `.ts` 檔案內容比對字串，CI 常駐）；(b) **live** 結構存在性斷言（需真實 MSSQL，`.mssql.spec.ts` gating）。兩者在 §八 SCHEMA 群組內以子標籤區分，勿混淆執行層級。 |
| **P1B2 companion 群組**（§十）| 全數為對既有 `mssql-p1b2.mssql.spec.ts` 之**必要修改**，該檔案本身即為 `.mssql.spec.ts`，gating 沿用其既有 `ensureMssql(ctx)`/`mssqlPortReachable()` 機制，不新增基礎設施。 |
| **PG-only 邊界** | 不適用（PG 已於 2026-07-11 全面移除，本 Feature 僅 sqlite + mssql 兩個 driver 邊界，AD §3.2.3 已載明）。 |
| **前端測試層** | React Testing Library + 現有元件測試慣例（`vi.mock` API 呼叫或既有 MSW 慣例，沿用 F001/F002/F004/F006 既有前端測試慣例）。 |

### 案例群組彙總

| 群組 | 說明 | 案例數 |
|---|---|---|
| LOGIN | 登入識別碼分支邏輯（Email vs employee_no）+ 大小寫/trim/停用/回應形狀 | 14 |
| LOGINDTO | `LoginDto` 放寬驗證 | 4 |
| FORGOT | 忘記密碼維持不變（AC-13） | 3 |
| DTOVAL | `employee-no.validator.ts` 格式驗證 + 正規化 | 15 |
| CREATE | `createAccount()` 唯一性 + 持久化 | 7 |
| UPDATE | `updateAccount()` 唯一性（排除自身）+ 持久化 | 8 |
| LIST | `findAll()` 顯示欄 + 搜尋擴充 | 8 |
| SCHEMA | Migration 結構（靜態 + live） | 6 |
| GUARD | RBAC（沿用既有 `RolesGuard`） | 4 |
| STATIC | tsc / 型別同步 / 源碼靜態掃描 | 4 |
| REGX | 既有測試**必要**修改（非 mssql-p1b2） | 5 |
| **後端小計** | | **78** |
| P1B2 | ⚠️⚠️ `mssql-p1b2.mssql.spec.ts` 必要修改（CI 阻斷風險） | 7 |
| **後端合計（含 P1B2）** | | **85** |
| FE-LOGIN | 登入頁（F001/F002） | 6 |
| FE-CREATE | 建立帳號 Modal（F004） | 6 |
| FE-EDIT | 編輯帳號 Modal（F006） | 5 |
| FE-LIST | 帳號清單（F005） | 3 |
| **前端小計** | | **20** |
| **總計** | | **105** |

---

## 追溯矩陣（AC / TC / BR / Invariant → Test ID）

| 來源 | 對應 Test ID |
|---|---|
| AC-1 / TC-179-01 | CREATE-001, FE-CREATE-002 |
| AC-2 / TC-179-02 / BR-1 | CREATE-002, CREATE-004, DTOVAL-010, DTOVAL-011, DTOVAL-015, FE-CREATE-003 |
| AC-3 / TC-179-03 | UPDATE-001, FE-EDIT-002 |
| AC-4 / TC-179-04 / TC-179-05 | UPDATE-002, UPDATE-003, FE-EDIT-002, FE-EDIT-003 |
| AC-5 / TC-179-06 / BR-5 | CREATE-003, FE-CREATE-004 |
| AC-6 / TC-179-07 / TC-179-07a / BR-4 | UPDATE-004, UPDATE-005, UPDATE-008, FE-EDIT-004, FE-EDIT-005 |
| AC-7 / TC-179-08~10 / BR-2 | DTOVAL-004~009, FE-CREATE-005 |
| AC-8 / TC-179-11 / BR-3 | DTOVAL-012 |
| AC-9 / TC-179-12 / BR-6 | LOGIN-001, LOGIN-002, LOGINDTO-004, REGX-001, FE-LOGIN-006 |
| AC-10 / TC-179-13 / BR-6 | LOGIN-003, LOGIN-004, LOGIN-013 |
| AC-11 / TC-179-14 / TC-179-15 / T-21 / T-22 / BR-7 | LOGIN-005~010 |
| AC-12 / TC-179-16 | LOGIN-011, LOGIN-012 |
| AC-13 / TC-179-17 / BR-9 | FORGOT-001, FORGOT-002, FORGOT-003 |
| AC-14 / TC-179-18 | LIST-001, LIST-002, FE-LIST-001, FE-LIST-002 |
| AC-15 / TC-179-19 / BR-8 | LIST-004, LIST-005, LIST-006, LIST-007, FE-LIST-003 |
| AC-16 / TC-179-20 / BR-10 | GUARD-001~004 |
| T-23（回歸） | LIST-008, LOGINDTO-004, STATIC-002, REGX-003~005 |
| BR-11（非目標，無對應測試） | 見「殘留風險」— 無 HR/EMPHIRE 關聯測試（設計上不存在） |
| I-EMPNO-TWO-TRACK-01 | SCHEMA-002, SCHEMA-004, SCHEMA-006 |
| I-EMPNO-NO-COLLATE-OVERRIDE-01 | SCHEMA-003 |
| I-EMPNO-LOGIN-EXACT-NO-TRIM-01 | LOGIN-006, STATIC-003 |
| I-EMPNO-CREATE-NORMALIZE-01 | DTOVAL-010~012, LOGIN-006（對照，證明正規化不套用於登入端） |
| I-EMPNO-CASE-SENSITIVE-UNIQUE-01 | LOGIN-005, CREATE-007, UPDATE-008, LIST-005（對照） |
| I-EMPNO-FORGOT-PW-UNCHANGED-01 | FORGOT-001~003 |
| I-EMPNO-RBAC-UNCHANGED-01 | GUARD-001~004 |
| I-EMPNO-SHARED-DUAL-MAINTAIN-01 | STATIC-004 |

---

## 一、LOGIN — 登入識別碼分支邏輯（`AuthService.login()`）

> **設計依據**：AD §3.3.2；spec §5.3；BR-6/BR-7。

### TS-F113-LOGIN-001：identifier 含 `'@'` → Email 分支，`toLowerCase()` 後精確比對（回歸）
- **關聯**：AC-9 / TC-179-12
- **類型**：Positive / Regression
- **前置**：帳號 Email 為 `admin@cdmp.test`（已存於 DB，任意大小寫儲存）
- **步驟**：`POST /auth/login`，`email: 'Admin@CDMP.test'`（含 `'@'`，混合大小寫）
- **預期**：`findOne({where:{email:'admin@cdmp.test'}})`（已轉小寫）；比對成功，行為與 F001/F002 既有機制完全一致

---

### TS-F113-LOGIN-002：帳號同時設有 `employee_no`，仍以 Email 登入成功（不受新欄位影響）
- **關聯**：AC-9
- **類型**：Positive / Regression
- **前置**：帳號同時具備 `email='user@cdmp.test'` 與 `employee_no='E10001'`
- **步驟**：以 `email` 欄位輸入含 `'@'` 之 Email + 正確密碼登入
- **預期**：走 Email 分支成功，`employee_no` 欄位存在與否不影響 Email 登入路徑

---

### TS-F113-LOGIN-003：identifier 不含 `'@'` → employee_no 分支，`findOne({where:{employee_no: identifier}})`，不轉小寫
- **關聯**：AC-10 / TC-179-13 / BR-6
- **類型**：Positive
- **前置**：帳號 `employee_no='A0001'`
- **步驟**：`POST /auth/login`，`email: 'A0001'`（不含 `'@'`）+ 正確密碼
- **預期**：`findOne` 呼叫參數精確為 `{where:{employee_no:'A0001'}}`（**非** `{where:{email:...}}`，且值未經任何轉換）

---

### TS-F113-LOGIN-004：employee_no 精確比對成功 → 回應含 `user.employee_no` 與正確 JWT
- **關聯**：AC-10
- **類型**：Positive
- **步驟**：同 LOGIN-003 成功路徑
- **預期**：HTTP 200；`LoginResult.user.employee_no === 'A0001'`；JWT 發行規則（`exp-iat`、payload 結構）與 Email 登入完全相同

---

### TS-F113-LOGIN-005：⚠️【紅線】大小寫不符 → 401（regression guard，防止未來誤加 `.toLowerCase()`）
- **關聯**：AC-11 / T-21 / I-EMPNO-CASE-SENSITIVE-UNIQUE-01
- **類型**：Negative / Regression
- **前置**：帳號 `employee_no='E12345'`
- **步驟**：以 `email: 'e12345'`（全小寫）+ 正確密碼登入
- **預期**：`findOne({where:{employee_no:'e12345'}})` 查無結果（SQLite `TEXT` 預設 `BINARY` 定序天然大小寫敏感，MSSQL `Chinese_Taiwan_Stroke_BIN` 同理）→ 401 `AUTH_INVALID_CREDENTIALS`

---

### TS-F113-LOGIN-006：⚠️【紅線】前後含空白 → 不 trim，比對不到 → 401（I-EMPNO-LOGIN-EXACT-NO-TRIM-01 核心）
- **關聯**：I-EMPNO-LOGIN-EXACT-NO-TRIM-01
- **類型**：Negative / Regression（**本文件最核心之 regression guard 之一**）
- **前置**：帳號 `employee_no='A0001'`
- **步驟**：以 `email: ' A0001'`（前導空白）+ 正確密碼登入
- **預期**：`findOne({where:{employee_no:' A0001'}})`（原樣傳遞，未 trim）→ 查無結果 → 401 `AUTH_INVALID_CREDENTIALS`；**明確禁止**未來實作為求「使用者體驗友善」而在登入分支加入 `.trim()`（該行為屬帳號建立/編輯之 DTO 層正規化專屬，見 I-EMPNO-CREATE-NORMALIZE-01）

---

### TS-F113-LOGIN-007：不存在的 employee_no → 401 `AUTH_INVALID_CREDENTIALS`「Email 或密碼錯誤」
- **關聯**：AC-11 / TC-179-14
- **類型**：Negative
- **步驟**：`email: 'E99999'`（系統無此員工編號）+ 任意密碼
- **預期**：401，`error==='AUTH_INVALID_CREDENTIALS'`，`message==='Email 或密碼錯誤'`

---

### TS-F113-LOGIN-008：employee_no 存在但密碼錯誤 → 同一 401 訊息
- **關聯**：AC-11 / TC-179-15
- **類型**：Negative
- **前置**：帳號 `employee_no='E12345'`
- **步驟**：正確 `employee_no` + 錯誤密碼
- **預期**：401 `AUTH_INVALID_CREDENTIALS`「Email 或密碼錯誤」

---

### TS-F113-LOGIN-009：不洩漏資訊 — LOGIN-007 與 LOGIN-008 回應完全一致
- **關聯**：AC-11 / BR-7
- **類型**：Negative（安全性）
- **步驟**：比對 LOGIN-007（識別碼不存在）與 LOGIN-008（識別碼存在但密碼錯）之回應 body
- **預期**：HTTP status、`error`、`message` 三者逐一相同，無法從回應區分兩種失敗原因

---

### TS-F113-LOGIN-010：identifier 含 `'@'` 但查無此 Email（T-22，驗證分支判斷本身）
- **關聯**：T-22
- **類型**：Negative / Regression
- **步驟**：`email: 'nonexist@cdmp.test'`（含 `'@'` 但不存在）+ 任意密碼
- **預期**：走 **Email 分支**（`findOne({where:{email:...}}）`）非誤入 employee_no 分支；查無 → 401（驗證的是分支判斷邏輯本身，非僅最終結果）

---

### TS-F113-LOGIN-011：以 employee_no 登入、帳號已停用 → 403 `AUTH_ACCOUNT_DISABLED`
- **關聯**：AC-12 / TC-179-16
- **類型**：Negative
- **前置**：帳號 `employee_no='E12345'`，`status='disabled'`
- **步驟**：正確 `employee_no` + 正確密碼
- **預期**：403，`error==='AUTH_ACCOUNT_DISABLED'`，「您的帳號已被停用，請聯絡管理員。」；不發行 JWT

---

### TS-F113-LOGIN-012：停用帳號 + employee_no 正確但密碼錯誤 → 仍為 401（非 403，驗證順序不變）
- **關聯**：AC-12（順序 regression）
- **類型**：Negative / Regression
- **前置**：帳號同 LOGIN-011（disabled）
- **步驟**：正確 `employee_no` + **錯誤**密碼
- **預期**：401 `AUTH_INVALID_CREDENTIALS`（**非** 403）——密碼驗證仍先於停用檢查（BR-002/BR-003 順序沿用不變），employee_no 分支不改變此既有順序

---

### TS-F113-LOGIN-013：employee_no 登入之 JWT `exp-iat` 規則與 Email 登入相同（含 `rememberMe`）
- **關聯**：AC-10
- **類型**：Positive / Regression
- **步驟**：分別以 employee_no 登入（`rememberMe:true`/`false`）
- **預期**：`exp-iat` 分別為 30 天／8 小時，與既有 Email 登入規則（F001 AC-3）完全一致，識別碼類型不影響 Token 規則

---

### TS-F113-LOGIN-014：`employee_no=null` 之帳號不可能被 employee_no 分支匹配到
- **關聯**：BR-1（未設定不影響登入）
- **類型**：Negative / 對照組
- **前置**：帳號 A `employee_no=null`
- **步驟**：以任意不含 `'@'` 字串登入（非帳號 A 之 Email 本地部分）
- **預期**：`findOne({where:{employee_no: <輸入值>}})` 天然查無結果（SQL `= NULL` 不成立，帳號 A 不會被此值誤配對）→ 401；帳號 A 仍可正常以 Email 登入（不受影響）

---

## 二、LOGINDTO — `LoginDto` 放寬驗證

> **設計依據**：AD §3.3.1；spec §5.2。

### TS-F113-LOGINDTO-001：identifier 不含 `'@'`（如 `'A0001'`）通過 DTO 驗證
- **關聯**：spec §5.2（放寬前置條件）
- **類型**：Positive
- **步驟**：DTO 驗證 `{email:'A0001', password:'x'}`
- **預期**：不拋 400（`@IsEmail` 已移除，改 `@IsString`+`@IsNotEmpty`）

---

### TS-F113-LOGINDTO-002：identifier 為空字串 → 400（`@IsNotEmpty` 仍生效）
- **關聯**：DTO 必填語意不變
- **類型**：Negative / Boundary
- **步驟**：DTO 驗證 `{email:'', password:'x'}`
- **預期**：400，訊息「請輸入 Email 或員工編號」

---

### TS-F113-LOGINDTO-003：identifier 長度 256 字元 → 400（`@MaxLength(255)` 防禦性上限）
- **關聯**：AD §3.3.1「寬鬆防禦性上限」
- **類型**：Boundary
- **步驟**：DTO 驗證含 256 字元之 `email` 值
- **預期**：400「長度不可超過 255 字元」；**明確區隔**此上限與 employee_no 本身格式邊界（32 字元）為不同層級的防禦——登入端刻意不做 employee_no 格式檢查（避免 400 vs 401 差異洩漏「輸入值是否長得像合法員工編號」）

---

### TS-F113-LOGINDTO-004：regression — 合法 Email 格式仍正常通過（既有行為不受影響）
- **關聯**：AC-9 / T-23
- **類型**：Regression
- **步驟**：DTO 驗證 `{email:'admin@cdmp.test', password:'x'}`
- **預期**：不拋 400，既有 F001/F002 登入 DTO 測試套件全綠

---

## 三、FORGOT — 忘記密碼維持不變（AC-13 / I-EMPNO-FORGOT-PW-UNCHANGED-01）

> **設計依據**：AD §3.7；spec §9。**本群組之核心價值是「證明沒有改動」，而非驗證新行為。**

### TS-F113-FORGOT-001：純員工編號輸入 → 沿用既有 `@IsEmail` 攔截，400 格式錯誤（非 spec AC-13 字面之 200）
- **關聯**：AC-13 / TC-179-17
- **類型**：Negative / Regression（**AD 對 spec 字面之明確修正，需在測案中顯式標註以防未來誤判為缺陷**）
- **步驟**：`POST /auth/forgot-password`，`{email:'E12345'}`（純員工編號，不含 `'@'`）
- **預期**：400，既有「請輸入有效的 Email 地址」格式錯誤訊息（`forgot-password.dto.ts` 之 `@IsEmail` 攔截，非新錯誤碼）；**不**回 200 通用成功訊息

---

### TS-F113-FORGOT-002：regression — 合法 Email 輸入之既有通用成功回應不受影響
- **關聯**：AC-13（對照組）
- **類型**：Regression
- **步驟**：`POST /auth/forgot-password`，`{email:'user@cdmp.test'}`（不論帳號是否存在）
- **預期**：200，既有通用訊息「若此 Email 存在，重設連結已寄出」，行為與 F009 既有機制逐字不變

---

### TS-F113-FORGOT-003：靜態 regression — `forgot-password.dto.ts` 與 `AuthService.forgotPassword()` 未新增任何 employee_no 相關程式碼
- **關聯**：I-EMPNO-FORGOT-PW-UNCHANGED-01
- **類型**：Regression（靜態源碼掃描）
- **步驟**：讀取 `forgot-password.dto.ts` 原始碼，正則掃描 `employee_no`/`employeeNo` 字面值；讀取 `AuthService.forgotPassword()` 方法體，確認未新增任何 `identifier.includes('@')` 式分支
- **預期**：兩處皆無匹配（防止未來重構「順手」把登入分支邏輯複製貼上至忘記密碼流程，破壞本 Feature 明確的範圍邊界）

---

## 四、DTOVAL — `employee-no.validator.ts` 格式驗證 + 正規化

> **設計依據**：AD §3.4.1；spec §3.2（FMT-1~6）。

### TS-F113-DTOVAL-001：合法值 `'A0001'`（英數字）通過
- **關聯**：AC-7（正向控制組）
- **類型**：Positive

### TS-F113-DTOVAL-002：合法值 `'EMP-1001'`（含連字號）通過
- **關聯**：AC-7（正向控制組）
- **類型**：Positive

### TS-F113-DTOVAL-003：合法值 `'emp_1'`（含底線、小寫、短字串）通過
- **關聯**：AC-7（正向控制組）
- **類型**：Positive

---

### TS-F113-DTOVAL-004：含 `'@'` → 訊息「員工編號不可包含 @」（優先序 1）
- **關聯**：AC-7 / TC-179-08
- **類型**：Negative
- **步驟**：輸入 `'A0001@x'`
- **預期**：400，錯誤訊息恰為「員工編號不可包含 @」

---

### TS-F113-DTOVAL-005：長度 33 字元（合法字元集內）→ 訊息「員工編號長度不可超過 32 字元」（優先序 2）
- **關聯**：AC-7 / TC-179-09 / FMT-3
- **類型**：Boundary
- **步驟**：輸入 33 個英數字元（不含 `'@'`）
- **預期**：400，錯誤訊息恰為「員工編號長度不可超過 32 字元」

---

### TS-F113-DTOVAL-006：⚠️ 優先序驗證 — 同時違反「含 `'@'`」與「長度 > 32」→ `'@'` 訊息優先
- **關聯**：spec §3.2「多重違規之錯誤訊息優先序」
- **類型**：Negative（**優先序 regression，需獨立測案，不可與 DTOVAL-004/005 合併**）
- **步驟**：輸入 40 字元、含 `'@'` 之字串
- **預期**：錯誤訊息為「員工編號不可包含 @」（**非**「長度不可超過 32 字元」），驗證 `employeeNoErrorMessage()` 之判斷順序（`@` 檢查在長度檢查之前）不因未來重構而漂移

---

### TS-F113-DTOVAL-007：含空格 → 訊息「員工編號僅允許英數字、- 與 _」（優先序 3）
- **關聯**：AC-7 / TC-179-10
- **類型**：Negative
- **步驟**：輸入 `'A0001 X'`（含空格）
- **預期**：400，訊息恰為「員工編號僅允許英數字、- 與 _」

### TS-F113-DTOVAL-008：含中文 → 同優先序 3 訊息
- **關聯**：AC-7 / TC-179-10
- **類型**：Negative
- **步驟**：輸入 `'員工001'`
- **預期**：400，訊息恰為「員工編號僅允許英數字、- 與 _」

### TS-F113-DTOVAL-009：含 `'#'` → 同優先序 3 訊息
- **關聯**：AC-7 / TC-179-10
- **類型**：Negative
- **步驟**：輸入 `'A0001#'`
- **預期**：400，訊息恰為「員工編號僅允許英數字、- 與 _」

---

### TS-F113-DTOVAL-010：空字串 `''` → 正規化為 `undefined`（`@IsOptional` 跳過驗證）
- **關聯**：AC-2 / FMT-6 / I-EMPNO-CREATE-NORMALIZE-01
- **類型**：Positive / Boundary
- **步驟**：`normalizeEmployeeNo('')`
- **預期**：回傳 `undefined`；不觸發 `@Matches` 驗證，不視為錯誤

### TS-F113-DTOVAL-011：純空白字串 `'   '` → 正規化為 `undefined`（同上）
- **關聯**：FMT-6
- **類型**：Positive / Boundary
- **步驟**：`normalizeEmployeeNo('   ')`
- **預期**：`trim()` 後為空字串 → `undefined`

---

### TS-F113-DTOVAL-012：⚠️【紅線】前後含空白 → trim 後以去空白值驗證與儲存（AC-8，與 LOGIN-006 形成關鍵對照）
- **關聯**：AC-8 / TC-179-11 / FMT-4 / I-EMPNO-CREATE-NORMALIZE-01
- **類型**：Positive（**與 LOGIN-006 為同一常數之相反行為，兩案例須並列理解**：trim 僅發生於建立/編輯之 DTO 層，登入端刻意不 trim）
- **步驟**：`normalizeEmployeeNo(' E12345 ')`
- **預期**：回傳 `'E12345'`（已 trim）；後續 `@Matches` 對 trim 後之值驗證；持久化值為 `'E12345'`（非含空白之原始輸入）

---

### TS-F113-DTOVAL-013：邊界 — 長度恰 32 字元 → 合法通過
- **關聯**：FMT-3 邊界
- **類型**：Boundary
- **步驟**：輸入恰 32 個合法字元
- **預期**：不拋錯，正常通過

### TS-F113-DTOVAL-014：邊界 — 長度恰 1 字元 → 合法通過
- **關聯**：FMT-3 邊界
- **類型**：Boundary
- **步驟**：輸入單一字元 `'A'`
- **預期**：不拋錯，正常通過

---

### TS-F113-DTOVAL-015：欄位完全省略（`employeeNo` key 未出現於 request body）→ `@IsOptional` 跳過，不視為錯誤
- **關聯**：AC-2 / TC-179-02
- **類型**：Positive / Boundary
- **步驟**：Request body 不含 `employeeNo` key
- **預期**：DTO 驗證通過；service 端 `dto.employeeNo ?? null` 收斂為 `null`

---

## 五、CREATE — `AccountsService.createAccount()`

> **設計依據**：AD §3.4.2；spec §7.1；BR-4/BR-5。

### TS-F113-CREATE-001：合法未被使用之 employeeNo → 建立成功，持久化並回應正確值
- **關聯**：AC-1 / TC-179-01
- **類型**：Positive
- **步驟**：`POST /accounts`，`{...,employeeNo:'E20001'}`（未被使用）
- **預期**：201，回應 `employee_no==='E20001'`；DB 持久化該值

---

### TS-F113-CREATE-002：employeeNo 未提供 → 建立成功，`employee_no=null`，不視為驗證錯誤
- **關聯**：AC-2 / TC-179-02
- **類型**：Positive
- **步驟**：`POST /accounts`（不含 `employeeNo`）
- **預期**：201，`employee_no===null`

---

### TS-F113-CREATE-003：重複 employeeNo（已被帳號 A 使用）→ 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`，不建立
- **關聯**：AC-5 / TC-179-06 / BR-5
- **類型**：Negative
- **前置**：帳號 A 已用 `employeeNo='E12345'`
- **步驟**：`POST /accounts`，`{...,employeeNo:'E12345'}`
- **預期**：409，`error==='ACCOUNT_EMPLOYEE_NO_EXISTS'`，`message==='此員工編號已被使用'`；DB 未新增帳號（`userRepository.save` 未被呼叫）

---

### TS-F113-CREATE-004：兩個帳號皆未提供 employeeNo（皆為 `null`）→ 皆建立成功，不誤判為重複
- **關聯**：AC-2 / BR-4「有值時唯一」
- **類型**：Positive / Boundary（**核心紅線：確保 `employee_no !== null` 之守門正確生效**）
- **步驟**：連續建立兩個帳號，皆不提供 `employeeNo`
- **預期**：兩者皆 201 成功，`employee_no` 皆為 `null`；`userRepository.findOne({where:{employee_no}})` 因守門條件（`employeeNo !== null` 才查）從未以 `null` 作為查詢值被呼叫

---

### TS-F113-CREATE-005：檢查順序 regression — Email 重複優先於 employeeNo 重複被回報
- **關聯**：spec §7.1「email 唯一性檢查之後」
- **類型**：Negative / Regression
- **前置**：帳號 A 已用 `email='dup@cdmp.test'` 且 `employeeNo='E12345'`
- **步驟**：`POST /accounts`，`{email:'dup@cdmp.test', employeeNo:'E12345', ...}`（兩者皆重複）
- **預期**：409 `ACCOUNT_EMAIL_EXISTS`（**非** `ACCOUNT_EMPLOYEE_NO_EXISTS`）——email 檢查在前，employee_no 檢查從未執行到（`userRepository.findOne({where:{employee_no}})` 未被呼叫）

---

### TS-F113-CREATE-006：回應形狀含 `employee_no`（201）
- **關聯**：spec §3.4 回應曝露表
- **類型**：Positive
- **步驟**：檢視 CREATE-001 回應 body 完整形狀
- **預期**：`CreateAccountResult` 含 `employee_no: string | null`，與既有欄位（`id`/`name`/`email`/`role`/`status`/`created_at`）並列

---

### TS-F113-CREATE-007：⚠️ 大小寫視為不同值 — 已存在 `'E12345'`，新建 `'e12345'` → 不視為重複，成功建立
- **關聯**：I-EMPNO-CASE-SENSITIVE-UNIQUE-01 / BR-4
- **類型**：Positive / Boundary（**SQLite `BINARY` 定序 regression，防止未來誤加大小寫不敏感比對**）
- **前置**：帳號 A 已用 `employeeNo='E12345'`
- **步驟**：`POST /accounts`，`{...,employeeNo:'e12345'}`（小寫）
- **預期**：201 成功建立（`findOne({where:{employee_no:'e12345'}})` 於 SQLite `BINARY`/MSSQL `_BIN` 定序下查無結果，兩者視為不同值可並存）

---

## 六、UPDATE — `AccountsService.updateAccount()`

> **設計依據**：AD §3.4.3；spec §7.2；BR-4/BR-5（排除自身）。

### TS-F113-UPDATE-001：既有 `employee_no=null` 之帳號新增合法未使用值 → 更新成功
- **關聯**：AC-3 / TC-179-03
- **類型**：Positive
- **步驟**：`PUT /accounts/:id`，`{...,employeeNo:'E30001'}`
- **預期**：200，回應 `employee_no==='E30001'`

---

### TS-F113-UPDATE-002：既有值變更為另一合法未使用值 → 更新成功
- **關聯**：AC-4 / TC-179-04
- **類型**：Positive
- **前置**：帳號現有 `employee_no='E10001'`
- **步驟**：`PUT /accounts/:id`，`{...,employeeNo:'E10002'}`
- **預期**：200，回應 `employee_no==='E10002'`

---

### TS-F113-UPDATE-003：清空既有值（提交空字串）→ `employee_no=null`
- **關聯**：AC-4 / TC-179-05 / FMT-6
- **類型**：Positive / Boundary
- **前置**：帳號現有 `employee_no='E10001'`
- **步驟**：`PUT /accounts/:id`，`{...,employeeNo:''}`
- **預期**：200，回應 `employee_no===null`（`normalizeEmployeeNo('')→undefined`，service 端 `dto.employeeNo ?? null → null`）

---

### TS-F113-UPDATE-004：重複 employeeNo（帳號 A 已使用）→ 帳號 B 更新為此值 → 409，不儲存
- **關聯**：AC-6 / TC-179-07 / BR-5
- **類型**：Negative
- **前置**：帳號 A `employee_no='E12345'`；編輯帳號 B（非 A）
- **步驟**：`PUT /accounts/:idB`，`{...,employeeNo:'E12345'}`
- **預期**：409 `ACCOUNT_EMPLOYEE_NO_EXISTS`；帳號 B 之 `employee_no` 未變更（維持編輯前之值）

---

### TS-F113-UPDATE-005：⚠️ 排除自身 — 帳號 A 保留原有 employeeNo 並更新其他欄位 → 儲存成功
- **關聯**：AC-6（第二句）/ TC-179-07a
- **類型**：Positive（**核心紅線：`existing.id !== id` 排除條件**）
- **前置**：帳號 A `employee_no='E12345'`
- **步驟**：`PUT /accounts/:idA`，`{...,employeeNo:'E12345', name:'新姓名'}`（employeeNo 不變，其他欄位變更）
- **預期**：200，成功儲存（`findOne` 找到的正是帳號 A 自身，`existingEmployeeNo.id===id` → 不視為重複）；`name` 更新為新值

---

### TS-F113-UPDATE-006：回應形狀含 `employee_no`（200）
- **關聯**：spec §3.4 回應曝露表
- **類型**：Positive
- **步驟**：檢視 UPDATE-002 回應 body
- **預期**：`UpdateAccountResult` 含 `employee_no: string | null`

---

### TS-F113-UPDATE-007：檢查順序 regression — Email 重複優先於 employeeNo 重複被回報（鏡射 CREATE-005）
- **關聯**：spec §7.2「email 唯一性檢查後」
- **類型**：Negative / Regression
- **前置**：帳號 A 已用兩者皆重複之 email/employeeNo；編輯帳號 B
- **步驟**：`PUT /accounts/:idB`，email 與 employeeNo 皆與帳號 A 重複
- **預期**：409 `ACCOUNT_EMAIL_IN_USE`（**非** `ACCOUNT_EMPLOYEE_NO_EXISTS`），employee_no 檢查從未執行

---

### TS-F113-UPDATE-008：⚠️ 跨帳號大小寫不同視為不同值 — 帳號 A 用 `'E12345'`，帳號 B 更新為 `'e12345'` → 不視為重複，成功
- **關聯**：I-EMPNO-CASE-SENSITIVE-UNIQUE-01 / BR-4
- **類型**：Positive / Boundary
- **前置**：帳號 A `employee_no='E12345'`；編輯帳號 B
- **步驟**：`PUT /accounts/:idB`，`{...,employeeNo:'e12345'}`
- **預期**：200，成功更新（帳號 A 之 `'E12345'` 與帳號 B 之 `'e12345'` 於大小寫敏感比對下視為不同值，可並存）

---

## 七、LIST — `AccountsService.findAll()`（F005）

> **設計依據**：AD §3.5；spec §7.3；BR-8。

### TS-F113-LIST-001：查詢 select 包含 `user.employee_no`，回應 `AccountListItem.employee_no` 存在
- **關聯**：AC-14 / TC-179-18
- **類型**：Positive
- **步驟**：`GET /accounts`（無 search）
- **預期**：每筆回應含 `employee_no: string | null` 欄位

---

### TS-F113-LIST-002：`employee_no=null` 之帳號正確顯示為 `null`（非拋錯、非空字串誤植）
- **關聯**：AC-14
- **類型**：Positive
- **前置**：清單含有／無 employee_no 之帳號並存
- **步驟**：`GET /accounts`
- **預期**：有值帳號正確顯示原值；無值帳號 `employee_no===null`

---

### TS-F113-LIST-003：搜尋完整 employee_no（原樣大小寫）→ 命中
- **關聯**：AC-15（基準組）
- **類型**：Positive
- **前置**：帳號 `employee_no='E12345'`
- **步驟**：`GET /accounts?search=E12345`
- **預期**：回應含該帳號

---

### TS-F113-LIST-004：搜尋部分 employee_no（如 `'E123'`）→ 部分匹配命中
- **關聯**：AC-15 / TC-179-19 / BR-8
- **類型**：Positive
- **前置**：帳號 `employee_no='E12345'`
- **步驟**：`GET /accounts?search=E123`
- **預期**：回應含該帳號（`LOWER(user.employee_no) LIKE '%e123%'`）

---

### TS-F113-LIST-005：⚠️ 搜尋大小寫不敏感（`'e123'` 命中 `'E12345'`）— 與登入之大小寫敏感刻意不同（對照組）
- **關聯**：AC-15 / BR-8 / I-EMPNO-CASE-SENSITIVE-UNIQUE-01（對照）
- **類型**：Positive（**與 LOGIN-005 並列理解：同一組資料，登入用大小寫敏感比對會 401，清單搜尋用大小寫不敏感比對會命中，兩者刻意不同機制**）
- **前置**：帳號 `employee_no='E12345'`
- **步驟**：`GET /accounts?search=e123`（小寫）
- **預期**：回應含該帳號（`LOWER()` 雙側轉換，與 collation 無關）

---

### TS-F113-LIST-006：搜尋條件為 OR 邏輯 — 姓名/Email 不匹配但 employee_no 匹配仍列出
- **關聯**：spec §7.3 SQL（三欄 OR）
- **類型**：Positive
- **前置**：帳號姓名/Email 與搜尋字串無關，但 `employee_no` 含搜尋字串
- **步驟**：`GET /accounts?search=<employee_no片段>`
- **預期**：該帳號仍出現於結果（OR 邏輯正確涵蓋三欄）

---

### TS-F113-LIST-007：`employee_no IS NULL` 之列於搜尋子句下確實不匹配（非拋錯、非誤配對所有列）
- **關聯**：spec §7.3「NULL 於 LIKE 自然不匹配」
- **類型**：Negative / Boundary
- **前置**：帳號 A `employee_no=null`
- **步驟**：`GET /accounts?search=<任意字串>`（帳號 A 之姓名/Email 亦不匹配）
- **預期**：帳號 A 不出現於結果；查詢不拋任何例外（`LOWER(NULL) LIKE ...` 恆為假，非 error）

---

### TS-F113-LIST-008：regression — 既有姓名／Email 搜尋行為不受影響
- **關聯**：T-23（回歸）
- **類型**：Regression
- **步驟**：既有 F005 姓名/Email 搜尋測案套件重跑
- **預期**：全數通過，`employee_no` 之加入未改變既有搜尋 SQL 之 OR 語意

---

## 八、SCHEMA — Migration 結構（`1751884800004-MssqlAddUsersEmployeeNo.ts`）

> **設計依據**：AD §3.1/§3.2；I-EMPNO-TWO-TRACK-01 / I-EMPNO-NO-COLLATE-OVERRIDE-01。**(靜態) 標籤 = 純源碼文字斷言，免 DB 連線；(live) 標籤 = 需真實 MSSQL。**

### TS-F113-SCHEMA-001（靜態）：migration `up()` 之 DDL 含新增欄位陳述
- **關聯**：spec §3.1 / AD §3.2.2
- **類型**：Positive / 靜態
- **步驟**：讀取 migration 檔原始碼，正則掃描 `ALTER TABLE "users" ADD "employee_no"`
- **預期**：匹配存在，且欄位型別為 `varchar(32) NULL`（無 `NOT NULL`）

---

### TS-F113-SCHEMA-002（靜態）：migration `up()` 之索引建立陳述使用指定名稱與 filter 條件
- **關聯**：I-EMPNO-TWO-TRACK-01 / OQ-F113-01
- **類型**：Positive / 靜態
- **步驟**：正則掃描 `CREATE UNIQUE INDEX "uq_users_employee_no" ON "users" ("employee_no") WHERE "employee_no" IS NOT NULL`
- **預期**：匹配存在（索引名精確為 `uq_users_employee_no`，非任務指示原建議之 `UX_` 前綴）

---

### TS-F113-SCHEMA-003（靜態）：⚠️ migration 檔全文不含任何 `COLLATE` 關鍵字（I-EMPNO-NO-COLLATE-OVERRIDE-01）
- **關聯**：I-EMPNO-NO-COLLATE-OVERRIDE-01
- **類型**：Negative / 靜態 regression
- **步驟**：讀取 migration 檔全文，掃描 `COLLATE` 字面值（不分大小寫）
- **預期**：零匹配——新欄位須繼承資料庫層級 `Chinese_Taiwan_Stroke_BIN`，不得於欄位層級覆寫

---

### TS-F113-SCHEMA-004（靜態）：Entity `User.employee_no` 欄位定義不含 `unique: true`
- **關聯**：I-EMPNO-TWO-TRACK-01（核心）
- **類型**：Negative / 靜態 regression
- **步驟**：讀取 `user.entity.ts` 原始碼，定位 `employee_no` 欄位之 `@Column(...)` decorator 參數
- **預期**：decorator 參數物件不含 `unique: true`（維持 plain nullable column，避免 SQLite `synchronize` 產生非預期的 plain UNIQUE 約束——後者僅允許單一 `NULL`，與多帳號並存未設定員工編號之需求衝突）

---

### TS-F113-SCHEMA-005（靜態）：`down()` 之陳述順序 — 先 `DROP INDEX` 後 `DROP COLUMN`
- **關聯**：AD §3.2.2 註解「MSSQL 不允許在欄位仍持有索引時直接 DROP COLUMN」
- **類型**：Positive / 靜態
- **步驟**：讀取 `down()` 方法體，確認 `DROP INDEX "uq_users_employee_no" ON "users"` 陳述式出現在 `DROP COLUMN "employee_no"` 之前
- **預期**：順序正確；此順序性另由 P1B2-002（STATIC-004 revert 迴圈）於真實 MSSQL 上做 live 驗證

---

### TS-F113-SCHEMA-006（live，MSSQL-only）：migration 執行後，filtered unique index 確實存在且定義正確
- **關聯**：I-EMPNO-TWO-TRACK-01 / AD §8「至少應驗證 filtered index 確實存在」
- **類型**：Positive / Integration（需真實 MSSQL 連線，`.mssql.spec.ts`）
- **步驟**：`migration:run` 後查詢 `sys.indexes` WHERE `name='uq_users_employee_no'`
- **預期**：索引存在；`has_filter=1`；`filter_definition` 含 `employee_no IS NOT NULL`；`is_unique=1`；**此為軌道 B 於本輪測試設計中唯一被驗證的層面**（真實併發競態防護本身不在範圍，見「殘留風險」）

---

## 九、GUARD — RBAC（沿用既有 `RolesGuard`）

> **設計依據**：spec §6 AC-16；BR-10；I-EMPNO-RBAC-UNCHANGED-01。**已查證**：`AccountsController` 沿用既有 `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('admin')`（class 級），本 Feature 不新增任何 Guard。

### TS-F113-GUARD-001：非 Admin（`role='user'`）呼叫 `POST /accounts` 帶 `employeeNo` → 403 `AUTH_FORBIDDEN`
- **關聯**：AC-16 / TC-179-20
- **類型**：Negative
- **步驟**：`role='user'` JWT，`POST /accounts`，body 含 `employeeNo`
- **預期**：403，`error==='AUTH_FORBIDDEN'`，`message==='您沒有權限執行此操作。'`（`RolesGuard` 實際拋出，已查證 `roles.guard.ts:36-39`）

---

### TS-F113-GUARD-002：非 Admin 呼叫 `PUT /accounts/:id` 帶 `employeeNo` → 403 `AUTH_FORBIDDEN`
- **關聯**：AC-16 / TC-179-20
- **類型**：Negative
- **預期**：同 GUARD-001，403 `AUTH_FORBIDDEN`

---

### TS-F113-GUARD-003：Admin 呼叫兩端點帶 `employeeNo` → 正常通過 Guard（正向控制組）
- **關聯**：AC-16（對照）
- **類型**：Positive
- **步驟**：`role='admin'` JWT，分別呼叫 `POST`/`PUT /accounts`
- **預期**：Guard 通過（201/200，非 403），證明本 Feature 未意外收緊或鬆綁既有 Admin 存取

---

### TS-F113-GUARD-004：regression — `GET /accounts`（清單）既有 Guard 行為不受影響
- **關聯**：I-EMPNO-RBAC-UNCHANGED-01
- **類型**：Regression
- **步驟**：既有 F005 清單端點 RBAC 測案套件重跑
- **預期**：全數通過，新增 `employee_no` 欄位/搜尋邏輯未變更既有 Guard 堆疊

---

## 十、STATIC — tsc / 型別同步 / 源碼靜態掃描

### TS-F113-STATIC-001：`tsc --noEmit -p tsconfig.build.json` 零錯誤
- **關聯**：DoD #7
- **類型**：Regression（feedback_vitest_no_typecheck 教訓）
- **步驟**：實作完成後執行型別檢查
- **預期**：零錯誤——涵蓋 entity 新欄位、6 個 `packages/shared` interface、4 個 api-local interface（`LoginResult`/`CreateAccountResult`/`UpdateAccountResult`/`AccountListItem`）、新 validator 檔、2 個 DTO、1 個 migration

---

### TS-F113-STATIC-002：regression — 既有 `accounts.service.spec.ts`／`auth.service.spec.ts`（REGX-001 修改後）全套件通過
- **關聯**：T-23
- **類型**：Regression
- **步驟**：重跑兩份既有測試套件
- **預期**：除 REGX-001 已標註之**必要**修改外，其餘既有案例全數不受影響、綠燈通過

---

### TS-F113-STATIC-003：靜態掃描 — `AuthService.login()` 之 employee_no 分支不含 `.trim()`
- **關聯**：I-EMPNO-LOGIN-EXACT-NO-TRIM-01（LOGIN-006 之靜態輔助防線）
- **類型**：Regression（靜態源碼掃描）
- **步驟**：讀取 `auth.service.ts` 之 `login()` 方法體，定位 `identifier` 變數宣告與 `employee_no` 分支之 `findOne(...)` 呼叫區塊，掃描該區塊內是否含 `.trim()`
- **預期**：零匹配；此為 LOGIN-006 行為性測案之補充靜態防線（behavioral test 為主要防線，static scan 為輔助，兩者皆需存在）

---

### TS-F113-STATIC-004：型別同步 — 10 個 interface 皆含 `employee_no`/`employeeNo`
- **關聯**：I-EMPNO-SHARED-DUAL-MAINTAIN-01 / OQ-F113-03
- **類型**：Positive（靜態存在性檢查，非深度相等——`apps/api` 不 import `@cdmp/shared`，兩處型別副本各自獨立維護）
- **步驟**：靜態檢視 `packages/shared/src/index.ts`（`UserInfo`/`CreateAccountRequest`/`CreateAccountResponse`/`UpdateAccountRequest`/`UpdateAccountResponse`/`AccountListItem`）與 api-local（`auth.service.ts` 之 `LoginResult`、`accounts.service.ts` 之 `CreateAccountResult`/`UpdateAccountResult`/`AccountListItem`）
- **預期**：10 個 interface 皆含對應欄位（前者依請求/回應慣例分別為 camelCase 可選／snake_case 必要，見 AD §3.8 對照表）；**明確不變更** `LoginRequest`（`email`/`password`/`rememberMe` 形狀不變，欄位不改名為 `identifier`）

---

## 十一、REGX — 既有測試必要修改（非 mssql-p1b2，見 §十 P1B2 群組另計）

> ⚠️ **本群組所有案例皆為「既有測試檔案的必要修改」，非新增行為驗證。若遺漏，對應既有測試套件將於本 Feature 合併後轉紅。**

### TS-F113-REGX-001：⚠️⚠️【CI 阻斷】`auth.service.spec.ts` 之 `TS-F001-007` SQL Injection 測試斷言必須更新
- **關聯**：DoD #3（本文件已逐行查證，非臆測）
- **檔案**：`apps/api/src/modules/auth/__tests__/auth.service.spec.ts:332-349`
- **現行斷言**（變更前，將失敗）：
  ```
  const sqlInjectionEmail = "' OR '1'='1'; DROP TABLE users; --";
  ...
  expect(mockUserRepository.findOne).toHaveBeenCalledWith({
    where: { email: sqlInjectionEmail.toLowerCase() },
  });
  ```
- **失敗原因**：`sqlInjectionEmail` 字面值**不含 `'@'`**，本次變更後該識別碼會被路由至 `employee_no` 分支（`findOne({where:{employee_no: identifier}})`，**不**轉小寫），現行斷言之 `{where:{email:...}}` 形狀不再符合實際呼叫參數
- **必要修改（測試設計指引，供 tdd-implementation 落地）**：斷言應改為 `expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { employee_no: sqlInjectionEmail } })`（**原樣未小寫化**之注入字串），驗證要旨不變（SQL injection 字串以參數化查詢傳遞、不拼接 SQL 字串），僅比對分支與欄位隨本次變更調整。**或**（測試設計備選方案，交 tdd-implementation 擇一）改用一個含 `'@'` 的注入字串（如 `"' OR '1'='1'@x; --"`）以維持原測試對「Email 分支」之驗證意圖不變，兩者皆可達成「SQL injection 經參數化查詢安全處理」之驗證目的，惟後者需同步調整測試描述文字以避免與 employee_no 分支之注入防護產生驗證空缺

---

### TS-F113-REGX-002：⚠️ `login-page.test.tsx` 之 `getByLabelText('Email')` 查詢必須更新
- **檔案**：`apps/web/src/pages/login/__tests__/login-page.test.tsx`
- **失敗原因**：登入頁欄位 label 由「Email」relabel 為「Email / 員工編號」（AD §6），既有以精確字串 `'Email'` 查找該欄位的測試查詢將失效（`getByLabelText` 精確比對）
- **必要修改**：既有查詢改為 `getByLabelText('Email / 員工編號')`（或改用 `getByLabelText(/Email/)` 等寬鬆比對，惟需與 UI/UX 定案之最終文案保持一致）；所有引用該欄位之既有測試案例（含既有 Email 登入成功/失敗案例）需同步更新查詢方式，行為斷言本身不變

---

### TS-F113-REGX-003：regression — 建立帳號 Modal 既有必填欄位測試不受新選填欄位影響
- **檔案**：建立帳號 Modal 既有測試（F004）
- **類型**：Regression
- **預期**：既有姓名/Email/密碼/角色必填驗證案例全數不受影響；新增之員工編號選填欄位不改變既有欄位之驗證時機或錯誤呈現方式

---

### TS-F113-REGX-004：regression — 編輯帳號 Modal 既有測試不受新選填欄位影響
- **檔案**：編輯帳號 Modal 既有測試（F006）
- **類型**：Regression
- **預期**：既有姓名/Email 編輯案例全數不受影響（F006 BR-1 由「僅姓名/Email」擴充為「姓名/Email/員工編號」，既有兩欄位之編輯行為本身不變）

---

### TS-F113-REGX-005：regression — 帳號清單既有欄位/搜尋測試不受新欄位影響
- **檔案**：帳號清單既有測試（F005）
- **類型**：Regression
- **預期**：既有欄位顯示順序、既有姓名/Email 搜尋案例全數不受影響（新增「員工編號」欄與搜尋範圍擴充為 additive，非替換既有邏輯）

---

## 十二、P1B2 companion — ⚠️⚠️ `mssql-p1b2.mssql.spec.ts` 必要修改（CI 阻斷風險，最高優先度）

> **設計依據**：AD §3.2.4／§10／§11（本文件已直接查證現行原始碼，行號皆對應本文件寫作當下之 `apps/api/src/database/__tests__/mssql-p1b2.mssql.spec.ts`）。
>
> **背景**：`1751884800004-MssqlAddUsersEmployeeNo.ts` 會被既有套件之 `runTypeormCli('migration:run')`（依 glob 掃描 `migrations/mssql/*`，執行全部待處理 migration）一併套用於該套件之 `dbo` 建置流程。若本群組之修改未與 migration 檔於**同一 PR** 內一併落地，以下五個既有測試將於 CI 轉紅，且非本 migration 邏輯錯誤，而是既有測試斷言假設過時所致。
>
> **核心設計原則（AD §3.2.4 裁定，本文件據此展開為可執行測試設計）**：`FILTER-001`／`PARITY-004`／`PARITY-005` 三者的修法**不可**比照既有 `EXCLUDED_TABLES`（`mssql-p1b2.mssql.spec.ts:231`）之**整表**排除機制——後者用於 `queue_job`/`customer_core` 這類「兩軌索引形狀本質不同的全新表」，整表排除不損失既有覆蓋；但 `users` 是既有 36 表 baseline 之一，若對其整表排除，會**意外連帶停止驗證其既有 PK（`id`）與 `email` unique index 之 parity**，屬既有覆蓋範圍的倒退。正確機制為新增一個**索引層級**（而非表層級）的已知分歧白名單，套用於 `countFiltered()`（`mssql-p1b2.mssql.spec.ts:546-557`）與 `fetchIndexRows()`（`mssql-p1b2.mssql.spec.ts:244-258`）兩處查詢述詞，追加謂詞：
>   ```sql
>   AND NOT (t.name = 'users' AND i.name = 'uq_users_employee_no')
>   ```
>   （或等價地在既有 `EXCLUDED_TABLES` 常數旁新增 `KNOWN_FILTERED_INDEX_EXCEPTIONS: Array<{table:string; index:string}>`，於 SQL 組裝或後製過濾階段套用；兩種實作路徑皆可，本文件僅規範**行為契約**：`users` 表除 `uq_users_employee_no` 外之其餘索引，覆蓋範圍不得倒退。）

### TS-F113-P1B2-001（對應既有 `TS-MSSQL-P1B2-BASELINE-003`）：`typeorm_migrations` 計數斷言 3→4
- **檔案位置**：`mssql-p1b2.mssql.spec.ts:346-360`
- **現行斷言**：`expect(Number(before[0].n)).toBe(3)` / `expect(Number(after[0].n)).toBe(3)`
- **必要修改**：兩處 `toBe(3)` 改為 `toBe(4)`；緊鄰註解由「schema + reference-data + queue_job baseline」更新為「+ users employee_no（`1751884800004`）」
- **類型**：機械式（低風險）

---

### TS-F113-P1B2-002（對應既有 `TS-MSSQL-P1B2-STATIC-004`）：revert 迴圈上限 3→4，驗證 LIFO 逆轉順序涵蓋新 migration
- **檔案位置**：`mssql-p1b2.mssql.spec.ts:875-890`
- **現行邏輯**：`for (let i = 1; i <= 3; i++) { ... }` 逆轉三支 baseline（queue_job → reference-data → schema）
- **必要修改**：迴圈上限 `3` 改為 `4`；因本 migration 時間戳（`1751884800004`）為現行最新，`migration:revert` 依 TypeORM 由新到舊逆轉之慣例，**第 1 次**逆轉呼叫即優先逆轉本 migration（`DROP INDEX uq_users_employee_no` + `DROP COLUMN employee_no`），其餘三支 baseline 逆轉順序依序順延（第 2~4 次）；更新註解說明四支逆轉對應關係
- **預期**：全數逆轉完成後 `dbo.typeorm_migrations` 歸零、業務表≤1（既有終態斷言邏輯不變，僅計數與順序描述更新）
- **類型**：機械式（低風險）

---

### TS-F113-P1B2-003（對應既有 `TS-MSSQL-P1B2-FILTER-001`）：Path B filtered index 計數 0→1，經單一具名索引排除機制修正
- **檔案位置**：`mssql-p1b2.mssql.spec.ts:546-561`（`countFiltered()` 函式 + `FILTER-001` 測案本體）
- **現行斷言**：`expect(await countFiltered(DBO)).toBe(0)`
- **失敗原因**：`uq_users_employee_no` 為刻意新增之 filtered index（`has_filter=1`），現行 `countFiltered()` 之 `WHERE ... AND t.name NOT IN ${EXCLUDED_TABLES}` 僅表級排除，不涵蓋此索引
- **必要修改**：`countFiltered()` 之 SQL 述詞追加單一具名索引排除謂詞（見本節上方核心設計原則之 SQL 片段）；`FILTER-001` 斷言值改為 `toBe(1)`
- **⚠️ 反向驗證要求（regression guard，防止修法過度）**：修改後須另行確認 `users` 表本身（PK `id`、`email` unique index）**仍計入**其餘涉及 `users` 表之 parity 相關統計（不因本次修法而被連帶排除）——此點由 P1B2-006 獨立斷言
- **類型**：非機械式（中風險，需設計判斷）

---

### TS-F113-P1B2-004（對應既有 `TS-MSSQL-P1B2-PARITY-004`）：索引結構化 diff 排除已知刻意分歧後仍為空
- **檔案位置**：`mssql-p1b2.mssql.spec.ts:418-433`
- **現行斷言**：`cmp.fieldDiffs` / `cmp.setDiffs` 皆須 `toEqual([])`
- **失敗原因**：entity 未宣告 `@Index`（Glossary 已載明「不需要一般 `@Index`」之裁定），Path A（`p1b2_sync`，純 synchronize）不會產生 `uq_users_employee_no`；Path B（`dbo`，本 migration）會產生——`diffIndexSets` 之 `setDiffs.onlyB` 集合將非空，違反現行斷言
- **必要修改**：`fetchIndexRows()` 之 SQL 述詞（`mssql-p1b2.mssql.spec.ts:244-258`）追加與 P1B2-003 相同的單一具名索引排除謂詞——**兩處使用同一份排除邏輯，不可各自維護一份不同步的白名單**（regression 風險：若日後新增第二個此類刻意分歧索引，僅改一處會遺漏另一處）
- **預期**：修法後 `uq_users_employee_no` 於兩側 `fetchIndexRows()` 結果集皆不出現，`diffIndexSets` 迴歸空 diff；既有 `token_blocklist` PK 與 `assignment_run_stage_log` unique index 之具名交叉驗證（原斷言 L426-432）不受影響、繼續通過
- **類型**：非機械式（中風險）

---

### TS-F113-P1B2-005（對應既有 `TS-MSSQL-P1B2-PARITY-005`）：索引集合對稱差維持為空
- **檔案位置**：`mssql-p1b2.mssql.spec.ts:435-441`
- **現行斷言**：`cmp.setDiffs` 須 `toEqual([])`
- **必要修改**：與 P1B2-004 共用同一次 `fetchIndexRows()` 修法（同一函式，兩個測案皆受益，非各自獨立修改）
- **預期**：`onlyA`/`onlyB` 皆為空陣列
- **類型**：非機械式（中風險，惟修法本體與 P1B2-004 共用，非獨立工作量）

---

### TS-F113-P1B2-006：⚠️ regression guard — 索引層級白名單機制未誤傷 `users` 既有索引之 parity 覆蓋
- **關聯**：AD §3.2.4「不可整表排除」之核心關切，本文件新增之獨立驗證項（非既有測案，是對 P1B2-003/004/005 修法本身的正確性驗證）
- **類型**：Positive / Regression（**MUST-FIX，防止 tdd-implementation 圖方便直接把 `users` 加入 `EXCLUDED_TABLES` 整表排除**）
- **步驟**：修法完成後，於 `fetchIndexRows(DBO)` 結果集中檢查 `table_name==='users'` 之列
- **預期**：`users` 表之 **PK（`id`）** 與**既有 `email` unique index** 兩者**仍出現**於結果集中（僅 `uq_users_employee_no` 被排除）；若 `users` 整表消失於結果集，判定為錯誤修法（整表排除而非索引層級排除），本案例即為區辨兩種修法路徑正確性的直接證據

---

### TS-F113-P1B2-007：regression — 既有 `COLLATE-BASELINE-001/002/003` collation 斷言不受本 migration 影響
- **關聯**：AD §3.2.3「新欄位繼承資料庫層級 collation」+ I-EMPNO-NO-COLLATE-OVERRIDE-01
- **類型**：Regression
- **步驟**：重跑既有 `TS-MSSQL-P1B2-COLLATE-BASELINE-001/002/003`（`dbo` 全欄 collation 唯一值斷言 + 逐欄無覆寫掃描）
- **預期**：全數通過不變——`employee_no` 新欄位之 collation 為 `Chinese_Taiwan_Stroke_BIN`（繼承資料庫層級），既有斷言邏輯（掃描全部欄位、非白名單制）天然涵蓋新欄位，SCHEMA-003（migration 檔無 `COLLATE` 關鍵字）為此處綠燈之前提保證

---

## 十三、FE-LOGIN — 登入頁（F001/F002）

### TS-F113-FE-LOGIN-001：識別碼欄位 label 顯示為「Email / 員工編號」
- **關聯**：AC-9/AC-10（UI 前提）
- **類型**：Positive
- **預期**：頁面渲染出 label 文字「Email / 員工編號」（取代既有「Email」）

### TS-F113-FE-LOGIN-002：輸入框 `type="text"`（非 `type="email"`）
- **關聯**：AD §6「HTML5 email 型別的瀏覽器原生格式驗證會擋下非 Email 格式輸入」
- **類型**：Positive / Regression guard
- **預期**：`<input>` 之 `type` 屬性為 `"text"`；輸入 `'A0001'` 不被瀏覽器原生驗證攔截

### TS-F113-FE-LOGIN-003：前端 schema 不再要求 Email 格式，非 Email 字串（`'A0001'`）通過前端驗證並可送出
- **關聯**：AC-10
- **類型**：Positive
- **預期**：`login-schema.ts` 移除 `.email()` 約束；輸入 `'A0001'` 通過 client-side 驗證，「登入」按鈕可點擊

### TS-F113-FE-LOGIN-004：送出 payload 欄位名固定為 `email`（不論內容為 Email 或員工編號）
- **關聯**：spec §5.1「欄位名維持 email」
- **類型**：Positive / Regression
- **預期**：無論輸入內容，送出之 request body 皆為 `{email: <輸入值>, password}`（欄位名不變）

### TS-F113-FE-LOGIN-005：員工編號錯誤與密碼錯誤顯示相同通用錯誤文案
- **關聯**：AC-11
- **類型**：Negative
- **預期**：401 回應時前端顯示與既有 Email 登入失敗相同之通用錯誤訊息，UI 上無法區分兩種失敗原因

### TS-F113-FE-LOGIN-006：regression — 合法 Email 登入既有端對端流程不受影響
- **關聯**：AC-9 / T-23
- **類型**：Regression
- **預期**：既有 F001/F002 Email 登入成功流程（含導向邏輯）逐字不變

---

## 十四、FE-CREATE — 建立帳號 Modal（F004）

### TS-F113-FE-CREATE-001：Modal 新增「員工編號」選填輸入框
- **關聯**：AC-1/AC-2（UI 前提）
- **類型**：Positive
- **預期**：表單渲染出員工編號欄位，未標示為必填（無 `*`/`required` 視覺標記）

### TS-F113-FE-CREATE-002：輸入合法值並送出 → payload 含 `employeeNo`
- **關聯**：AC-1
- **類型**：Positive
- **預期**：`POST /accounts` request body 含 `employeeNo: <輸入值>`

### TS-F113-FE-CREATE-003：留空並送出 → payload 不含或為 `undefined`，建立仍成功
- **關聯**：AC-2
- **類型**：Positive
- **預期**：留空提交不阻擋表單送出；後端回應成功後 Modal 關閉、清單刷新

### TS-F113-FE-CREATE-004：API 回應 409 `ACCOUNT_EMPLOYEE_NO_EXISTS` → 顯示「此員工編號已被使用」
- **關聯**：AC-5
- **類型**：Negative
- **預期**：inline 或 toast 錯誤訊息顯示「此員工編號已被使用」；Modal 不關閉，允許使用者修改後重試

### TS-F113-FE-CREATE-005：格式錯誤即時驗證（如輸入含 `@`）→ inline 錯誤訊息，阻擋送出
- **關聯**：AC-7
- **類型**：Negative
- **預期**：前端即時顯示對應格式錯誤訊息（三段優先序比照 §3.2），「建立帳號」按鈕停用或送出被前端攔截

### TS-F113-FE-CREATE-006：regression — 既有必填欄位（姓名/Email/密碼/角色）驗證行為不受影響
- **關聯**：REGX-003
- **類型**：Regression
- **預期**：既有必填驗證案例全數通過

---

## 十五、FE-EDIT — 編輯帳號 Modal（F006）

### TS-F113-FE-EDIT-001：開啟編輯 Modal 時，員工編號欄位預填既有值
- **關聯**：AC-3/AC-4（UI 前提）
- **類型**：Positive
- **預期**：既有 `employee_no` 值正確顯示於輸入框；若為 `null` 則欄位為空

### TS-F113-FE-EDIT-002：變更為新值並送出 → 更新成功
- **關聯**：AC-3/AC-4
- **類型**：Positive
- **預期**：`PUT /accounts/:id` payload 含新值；成功後畫面即時反映

### TS-F113-FE-EDIT-003：清空欄位並送出 → 更新為 `null`
- **關聯**：AC-4
- **類型**：Positive
- **預期**：送出空字串；成功後該帳號員工編號顯示為空

### TS-F113-FE-EDIT-004：保留原值不變、僅編輯其他欄位 → 不誤觸發重複錯誤
- **關聯**：AC-6（排除自身）
- **類型**：Positive / Regression
- **預期**：送出未變更之原員工編號值 + 變更後之其他欄位 → 成功儲存，無 409 錯誤

### TS-F113-FE-EDIT-005：變更為另一帳號已使用之值 → 顯示 409 錯誤
- **關聯**：AC-6
- **類型**：Negative
- **預期**：inline 顯示「此員工編號已被使用」，Modal 不關閉

---

## 十六、FE-LIST — 帳號清單（F005）

### TS-F113-FE-LIST-001：清單新增「員工編號」欄
- **關聯**：AC-14（UI 前提）
- **類型**：Positive
- **預期**：表格新增對應欄位標題與資料欄

### TS-F113-FE-LIST-002：未設定員工編號之帳號該欄顯示「—」
- **關聯**：AC-14
- **類型**：Positive
- **預期**：`employee_no===null` 時顯示佔位符（「—」，非空白字串或 `null` 字面文字）

### TS-F113-FE-LIST-003：既有搜尋框輸入員工編號關鍵字 → 清單正確過濾
- **關聯**：AC-15
- **類型**：Positive
- **預期**：既有搜尋輸入框（無需新增獨立欄位）輸入員工編號片段，觸發 `GET /accounts?search=...`，清單依 API 回應正確更新

---

## 殘留風險與待決問題

### A. 軌道 B（DB filtered unique index）之真實併發防護未被測試設計覆蓋（接受風險，非缺陷）
本輪測試設計對軌道 B 僅驗證「migration 執行後索引結構存在」（SCHEMA-006），**未**設計真實併發競態案例（兩個近乎同時的 `INSERT`/`UPDATE` 是否確實被 DB 擋下）。此與 AD §10 風險 #3「刻意接受」之風險等級一致——dev/sqlite 環境下唯一性 100% 依賴軌道 A（service 層 check-then-write），存在與其餘 F1xx 系列（如 `queue_job`）相同等級的競態窗口。若未來需要更高保證，建議另立測試設計輪次，比照 AD-E07-40 P2a `CONC` 群組之雙 `QueryRunner` 並發 harness 手法。

### B. `mssql-p1b2.mssql.spec.ts` 之索引層級白名單為架構建議，具體 SQL/常數落地方式未定案
AD §11「待裁決」已明列此項，本文件 §十二 P1B2 群組已將**行為契約**（`users` 表除 `uq_users_employee_no` 外之其餘索引覆蓋不得倒退）鎖定為可驗證斷言（P1B2-006），但**具體實作路徑**（SQL 述詞內嵌排除 vs 獨立白名單常數 + 後製過濾）留給 tdd-implementation 依現行程式碼風格擇一，兩者皆可通過本文件之驗收標準。

### C. 既有 `error-handling.md#account-errors` 尚未登錄 `ACCOUNT_EMPLOYEE_NO_EXISTS`
F113 spec §14 已列為待辦，非本文件範圍（屬 spec-writer 職責），QA 於閱讀本文件時應留意此碼於全域錯誤碼文件中暫缺登錄，不影響本文件測試案例本身之可執行性。

### D. `seed.ts` 之 employee_no 種子值與 drift-check 擴充為非強制項
AD §3.9 明文「非強制，由 tdd-implementation/DevOps 斟酌」，本文件不將其納入 DoD 或必要測試案例；若落地，建議至少確認既有 `seed.ts` drift-check 測試（若存在）不因新增比對欄位而破壞既有 4 筆種子帳號之冪等性，惟此非本輪強制項。

### E. BR-11（與 HR/EMPHIRE 無關聯）為設計上不存在的功能，無對應測試
`employee_no` 依 spec §10 非目標裁定為獨立自由格式字串，與 `ob_emphire.emplid` 無任何關聯或比對機制。本文件不設計「驗證兩者確實無關聯」之測試（無法對「不存在的功能」設計正面驗證，僅能以程式碼審查佐證，不屬測試設計範疇）。

### F. REGX-001（`auth.service.spec.ts` SQL Injection 測試修改）提供兩種修法路徑，未強制擇一
本文件基於「不確定 tdd-implementation 是否傾向保留原測試對 Email 分支之驗證意圖」，刻意提供兩種等效修法路徑（改用 employee_no 分支斷言 / 改用含 `@` 的注入字串維持 Email 分支），留待 tdd-implementation 依現場判斷擇一，皆滿足「SQL injection 經參數化查詢安全處理」之核心驗證目的。
