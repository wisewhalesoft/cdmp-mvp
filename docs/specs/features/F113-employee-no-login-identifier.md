---
spec-id: F113
title: 員工編號作為登入識別碼
feature-id: F113
source-story: US-179
epic: E02 — 帳號與角色管理（跨 E01 驗證與登入）
priority: P1
version: "1.0"
date: 2026-07-13
status: Draft
---

# F113: 員工編號作為登入識別碼

Priority: P1（Should Have） | Status: Draft | Last Updated: 2026-07-13

> **本 spec 為 `employee_no` 欄位與「以員工編號登入」之權威來源**。E01（F001 / F002）與 E02（F004 / F005 / F006）之相關章節僅作**表面補充並反向引用本檔**；凡欄位契約、登入分支邏輯、唯一性設計、格式驗證、錯誤碼與 forgot-password 行為之細節，皆以本檔為準。

---

## 1. 功能摘要

為使用者帳號新增一個**選填、可為 null** 的 `employee_no`（員工編號）屬性，由 Admin 於帳號管理（建立 F004 / 編輯 F006）設定。設定後，該帳號的使用者於登入頁面（F001 / F002）可輸入 **Email 或員工編號（擇一）** 加上密碼登入；系統依輸入值是否含 `@` 自動判斷識別碼類型，兩種登入方式效果完全相同（相同規則的 JWT Token、依角色導向相同頁面）。

員工編號為 Admin 專屬可維護欄位，一般使用者無法自助設定或編輯（沿用既有帳號管理 RBAC，本 Feature 不新增 Guard）。是否設定員工編號完全選填；未設定的帳號僅能繼續以 Email 登入，行為與現況完全相同。

「忘記密碼」流程本次**不**納入員工編號支援，維持僅以 Email 申請重設（見 §9 與 §11 OQ-179-01）。

---

## 2. User Story

**As a** Admin（管理者）
**I want** 在建立或編輯使用者帳號時，選填設定該帳號的員工編號
**So that** 使用者除了 Email 外，也能以組織內部熟悉的員工編號作為登入識別碼，降低記憶／輸入 Email 的負擔

*（第二視角）*
**As a** 使用者（Admin 或 User）
**I want** 在登入時可以輸入我的 Email 或員工編號（擇一）加上密碼
**So that** 我不需要每次都記得或查找自己的 Email，也能順利登入

---

## 3. 欄位契約（`employee_no`）

### 3.1 資料欄位定義

| 項目 | 值 |
|------|----|
| DB 欄位名 | `users.employee_no` |
| API 欄位名（駝峰） | `employeeNo`（請求 body）／`employee_no`（回應 body，對齊既有 snake_case 回應慣例） |
| 型別 | `VARCHAR(32)` |
| NULL | 允許（NULL 表示未設定；未設定的帳號僅能以 Email 登入） |
| 預設值 | NULL |
| DB 層 plain UNIQUE | **不建立**（MSSQL 之 plain `UNIQUE` 僅允許單一 NULL，與「多個未設定帳號」需求衝突，見 §3.3） |
| 唯一性 | **有值時唯一**（unique-when-present），透過雙軌機制強制（見 §3.3） |

### 3.2 格式規範

| 規則編號 | 規則 |
|---------|------|
| FMT-1 | 允許字元集：英數字與 `-`、`_`，正規表示式 `^[A-Za-z0-9_-]{1,32}$` |
| FMT-2 | **不可包含 `@`**（避免與 Email 登入分支判斷衝突，見 §5；此規則已由 FMT-1 字元集隱含，但須提供專屬錯誤訊息以區分違規原因） |
| FMT-3 | 長度為 1~32 字元（trim 後計算） |
| FMT-4 | **儲存與驗證前一律去除首尾空白（trim）**；以 trim 後的值進行格式驗證、唯一性檢查與儲存 |
| FMT-5 | **大小寫敏感、原樣儲存**：不轉大小寫；`E12345` 與 `e12345` 視為不同值（與 Email 一律轉小寫的規則**相反**，見 §4 對照表） |
| FMT-6 | 空字串 `""` 與純空白字串（trim 後為空）於**建立／編輯**時等同「未設定」，一律正規化為 NULL（用於編輯時清除既有員工編號，見 F006 AC-4） |

**多重違規之錯誤訊息（建議優先序，最終文案交 ui-ux-designer）**：
1. 含 `@` → 「員工編號不可包含 @」
2. 長度 > 32 → 「員工編號長度不可超過 32 字元」
3. 其他不合法字元（空格、`#`、中文等）→ 「員工編號僅允許英數字、- 與 _」

### 3.3 唯一性雙軌設計（Two-Track Uniqueness）

`employee_no` 之「有值時唯一」由**兩個獨立機制**共同強制，兩者皆須落地：

| 軌道 | 機制 | 落點 | 角色 |
|------|------|------|------|
| **軌道 A（主要防線）** | **Service 層重複檢查** | `AccountsService.createAccount()` / `updateAccount()`，比照既有 Email 唯一性檢查（`findOne({ where: { employee_no } })`；編輯時排除自身 `existing.id !== id`）。重複時拋 `ConflictException` + 錯誤碼 `ACCOUNT_EMPLOYEE_NO_EXISTS`（HTTP 409） | 應用層 | **dev / sqlite / 測試環境之唯一權威守衛**（見下方軌道 B 的環境差異） |
| **軌道 B（資料庫防線）** | **Filtered Unique Index（新 MSSQL migration）** | 新增 migration：`CREATE UNIQUE INDEX ux_users_employee_no ON users (employee_no) WHERE employee_no IS NOT NULL;`（比照 `queue_job` 之手寫 baseline 兩軌策略——**entity 保持 plain `@Column({ nullable: true })`，不宣告 unique**，避免 dev synchronize 產生錯誤約束） | DB（僅 MSSQL 生產／dev MSSQL 容器） | 防止並發 race condition 下的重複寫入（軌道 A 之 check-then-write 非原子） |

**設計要點（必須明列於實作與測試）**：
- Entity 定義維持 plain `@Column({ type: <varchar helper>, length: 32, nullable: true })`，**不加** `unique: true`；filtered unique index **僅存在於手寫 MSSQL migration**，不由 TypeORM `synchronize` 產生。
- 因 dev / sqlite 之 `synchronize:true` 建表流程**不會**套用 filtered index，**軌道 A（service 層檢查）為 dev / 測試環境的主要且唯一唯一性守衛**；測試須直接驗證 service 層重複檢查行為（不可假設 DB 會擋）。
- 生產（MSSQL）同時具備兩軌：service 層先攔（給出友善錯誤碼），DB filtered index 為並發最後防線（若觸發，屬非預期並發，回 500／由既有 DB 例外處理層轉譯，非正常路徑）。
- Filtered index 之過濾條件 `WHERE employee_no IS NOT NULL` 允許任意數量的 NULL 列共存（多個未設定員工編號的帳號皆合法）。

> **架構交辦**：filtered unique index 之 migration 檔命名／編號、MSSQL collation 下的比較語意（本欄採大小寫敏感比對，須確認目標 collation `Chinese_Taiwan_Stroke_BIN` 對 ASCII 英數字之大小寫敏感行為與 service 層 JS 精確比對一致）、以及 filtered index 在既有列 backfill 時是否需前置去重掃描，均交 system-architect（見 §11 OQ-F113-01）。

### 3.4 回應曝露（Response Surfacing）

`employee_no`（nullable）須加入以下回應形狀，供前端顯示：

| 端點／情境 | 回應欄位 | 說明 |
|-----------|---------|------|
| `POST /api/accounts`（F004 建立） | `employee_no: string \| null` | 建立結果 |
| `PUT /api/accounts/:id`（F006 編輯） | `employee_no: string \| null` | 更新結果 |
| `GET /api/accounts`（F005 清單） | 每筆 `AccountListItem.employee_no: string \| null` | 清單顯示欄 |
| `POST /api/auth/login`（F001 / F002 登入） | `user.employee_no: string \| null`（`UserInfo`） | 登入成功後前端可顯示 |

**型別落點（契約層，實作機制交 AD／impl）**：
- Web 端型別定義於 `@cdmp/shared`（`UserInfo`、帳號回應型別新增 `employee_no?: string \| null`）。
- **`apps/api` 不可 import `@cdmp/shared`**（見既有工程約束）；api 端須維護**本地型別副本**，兩處須同步新增 `employee_no`。
- 本 spec 僅規範契約（欄位存在、型別、nullable）；兩處型別副本之同步機制由 system-architect / tdd-implementation 處理。

---

## 4. 識別碼比對規則對照（Email vs 員工編號）

| 面向 | Email | 員工編號（employee_no） |
|------|-------|------------------------|
| 儲存正規化 | 一律 `toLowerCase()` 轉小寫 | **原樣儲存**（不轉大小寫），僅 trim 首尾空白 |
| 唯一性比對 | 大小寫不敏感（小寫化後比對） | **有值時唯一**，大小寫敏感（精確比對） |
| **登入比對** | 大小寫不敏感（輸入轉小寫後 `findOne({ where: { email } })`） | **精確、大小寫敏感**（`findOne({ where: { employee_no } })`，**不**轉小寫） |
| **帳號清單搜尋**（F005） | 大小寫不敏感、部分匹配（`LOWER(...) LIKE`） | **大小寫不敏感、部分匹配**（`LOWER(...) LIKE`，與登入的精確比對**刻意不同**，見 §11 OQ-179-02） |
| 忘記密碼 | 支援（email-only） | **不支援**（見 §9 / OQ-179-01） |

> **關鍵區辨（避免下游混淆）**：登入時員工編號為**精確、大小寫敏感**比對；帳號清單搜尋時員工編號為**大小寫不敏感、部分匹配**。兩者為**不同情境的獨立設計**，不可互相套用。此差異已於 OQ-179-02 裁定並保留（清單搜尋以便利為先，登入以精確為先）。

---

## 5. 登入識別碼分支邏輯（F001 / F002）

### 5.1 請求欄位

登入請求**維持既有欄位名 `email`**（per 使用者決策，**不**改名為 `identifier`）；該欄位語意擴充為「承載 Email 或員工編號」。前端登入頁識別碼欄位 label 由「Email」relabel 為「Email / 員工編號」（UI 文案交 ui-ux-designer）。

### 5.2 後端 DTO 驗證放寬

`LoginDto` 之識別碼欄位驗證由 `@IsEmail()` **放寬**為 `@IsNotEmpty() @IsString()`（可另加寬鬆格式守衛，如長度上限）：

| 變更前 | 變更後 |
|--------|--------|
| `@IsEmail({}, { message: '請輸入有效的 Email 地址' })` | `@IsNotEmpty()` + `@IsString()`（識別碼必填、為字串；不再強制 Email 格式） |

> 放寬 DTO 是「以員工編號登入」的**前置條件**：若維持 `@IsEmail`，員工編號（不含 `@`）會在 DTO 層即被 400 拒絕，永遠到不了 service 分支。

### 5.3 Service 分支演算法（`auth.service.login()`）

以提交的識別碼值（記為 `identifier`）判斷：

```
identifier 含 '@'  → 視為 Email：
                      email = identifier.toLowerCase()
                      user  = findOne({ where: { email } })
否則（不含 '@'）    → 視為員工編號：
                      user  = findOne({ where: { employee_no: identifier } })   // 不轉小寫、精確比對
```

- 後續流程（bcrypt 密碼比對 → 停用檢查 → 發行 JWT → 角色導向）**完全沿用** F001 / F002 既有機制，不因識別碼類型而改變。
- 停用帳號處理（`status === 'disabled'` → HTTP 403 `ACCOUNT_DISABLED`）不變，且在密碼驗證成功之後才檢查（沿用 BR-003 不洩漏帳號存在原則）。
- **員工編號比對不做小寫化**；因儲存值已於寫入時 trim，登入時以提交值精確比對（若使用者輸入含首尾空白或大小寫不符，將比對不到 → 回統一 `INVALID_CREDENTIALS`，屬預期行為、不洩漏帳號存在）。

### 5.4 失敗一律回通用錯誤（不洩漏資訊）

| 情境 | 回應 |
|------|------|
| 識別碼（Email 或員工編號）不存在 | HTTP 401，錯誤碼 `AUTH_INVALID_CREDENTIALS`，訊息「Email 或密碼錯誤」 |
| 密碼錯誤 | HTTP 401，錯誤碼 `AUTH_INVALID_CREDENTIALS`，訊息「Email 或密碼錯誤」 |

**重用既有 `AUTH_INVALID_CREDENTIALS`（不新增登入錯誤碼）**；無論是識別碼不存在或密碼錯誤，一律回相同通用訊息，不揭示是「識別碼不存在」還是「密碼錯誤」。

---

## 6. 驗收標準

> 對應 US-179 AC-1~AC-16。以下逐條落為可測條件。

### AC-1：建立帳號時可選填員工編號
- **Given** Admin 在建立帳號表單已填妥必填欄位（姓名、Email、密碼、角色）
- **When** 於「員工編號」欄位輸入尚未被使用、格式合法的值（如「E12345」）後提交
- **Then** 系統建立帳號並儲存員工編號（原樣、trim 後），回應含 `employee_no`，新帳號出現於清單且員工編號正確顯示

### AC-2：員工編號為選填（可留空）
- **Given** Admin 已填妥必填欄位
- **When** 未填員工編號（留空）直接提交
- **Then** 帳號建立成功，`employee_no = null`，不視為驗證錯誤

### AC-3：編輯帳號新增員工編號
- **Given** Admin 編輯一個目前 `employee_no = null` 的帳號
- **When** 輸入合法且未被使用的值後儲存
- **Then** 系統更新 `employee_no`，回應反映新值

### AC-4：編輯帳號變更或清除員工編號
- **Given** Admin 編輯一個已設定 `employee_no` 的帳號
- **When** 改為另一合法未被使用的值，或將欄位清空後儲存
- **Then** 系統更新為新值，或清空為 NULL（FMT-6：空字串／純空白正規化為 NULL）

### AC-5：防止重複 — 建立（含值時唯一）
- **Given** 員工編號「E12345」已被帳號 A 使用
- **When** Admin 以「E12345」建立新帳號
- **Then** HTTP 409，錯誤碼 `ACCOUNT_EMPLOYEE_NO_EXISTS`，訊息「此員工編號已被使用」，不建立帳號

### AC-6：防止重複 — 編輯（排除自身）
- **Given** 員工編號「E12345」已被帳號 A 使用，Admin 正在編輯帳號 B
- **When** 將帳號 B 的 `employee_no` 改為「E12345」
- **Then** HTTP 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`「此員工編號已被使用」，不儲存
- **And** 若改為編輯帳號 A 本身、保留其原有「E12345」不變並儲存其他欄位，唯一性檢查排除自身（`existing.id !== id`），正常儲存

### AC-7：格式驗證
- **Given** Admin 在建立／編輯表單填寫員工編號
- **When** 輸入含 `@`、或長度 > 32、或含英數字與 `-`／`_` 以外字元
- **Then** 顯示對應具體格式錯誤訊息（區分違規原因，見 §3.2），不建立／不儲存

### AC-8：前後空白自動去除
- **Given** 輸入值前後含空白（如「 E12345 」）
- **When** 提交
- **Then** 系統於驗證與儲存前 trim，以「E12345」進行格式／唯一性驗證與儲存

### AC-9：Email 登入行為維持不變（回歸）
- **Given** 帳號已設定 Email 與密碼（不論是否設定員工編號）
- **When** 於識別碼欄位輸入含 `@` 的正確 Email 與正確密碼
- **Then** 系統判定含 `@` → 以既有 Email 邏輯（小寫化）驗證，發行 Token 並依角色導向，行為與 F001 / F002 一致

### AC-10：以員工編號成功登入
- **Given** 帳號已設定員工編號「E12345」與密碼，帳號啟用中
- **When** 於識別碼欄位輸入「E12345」（不含 `@`）與正確密碼
- **Then** 系統判定不含 `@` → 以 `employee_no` 精確（大小寫敏感、不轉小寫）比對驗證，成功後發行與 Email 登入相同規則之 Token，依角色導向

### AC-11：不存在的員工編號或錯誤密碼 → 通用錯誤（不洩漏）
- **Given** 系統不存在員工編號「E99999」；或員工編號為「E12345」但密碼錯誤
- **When** 以上述任一情境登入
- **Then** 一律回 HTTP 401 `AUTH_INVALID_CREDENTIALS`「Email 或密碼錯誤」，不發行 Token，不揭示是識別碼不存在或密碼錯誤

### AC-12：帳號停用時以員工編號登入 → 沿用既有停用行為
- **Given** 員工編號「E12345」之帳號已停用
- **When** 以「E12345」與正確密碼登入
- **Then** HTTP 403 `ACCOUNT_DISABLED`「您的帳號已被停用，請聯絡管理員。」，不發行 Token（與既有 Email 停用情境一致）

### AC-13：忘記密碼不支援員工編號（維持 email-only）
- **Given** 使用者在「忘記密碼」頁面（欄位維持僅標示「Email」，不採登入頁之合併識別碼欄位）
- **When** 於欄位輸入自己的員工編號（而非 Email）
- **Then** 忘記密碼流程**維持不變、email-only、無員工編號特別處理、無新錯誤碼**；因員工編號不含 `@`、永不會是合法 Email，既有流程不會比對到任何帳號、不寄出任何重設連結，且不洩漏帳號是否存在（沿用 F009 不洩漏原則）
- **註**：此為 OQ-179-01 裁定之預設行為（reuse existing generic response）。**實作細節須知**：現行 `forgot-password.dto.ts` 保留 `@IsEmail` 驗證；一個「純員工編號」輸入將被該 DTO 以 400 格式錯誤（「請輸入有效的 Email 地址」）攔截，而非 AC-13 字面所述之 200 通用成功訊息——兩種結果**皆不洩漏帳號存在與否**。本 spec 裁定 forgot-password **維持現況、不改**（見 §9 與 §11 OQ-F113-02，該 200/400 差異交 system-architect / UX 定案）

### AC-14：帳號清單顯示員工編號欄
- **Given** Admin 導覽至帳號清單
- **When** 頁面載入
- **Then** 清單新增「員工編號」欄，顯示各帳號 `employee_no`；未設定者該欄空白

### AC-15：帳號清單搜尋涵蓋員工編號
- **Given** Admin 查看帳號清單
- **When** 於既有搜尋欄輸入員工編號全部或部分（如「E123」）
- **Then** 搜尋範圍除姓名、Email 外，亦以**大小寫不敏感、部分匹配**比對 `employee_no`，清單僅顯示匹配帳號（此規則與登入之精確比對不同，見 §4 / OQ-179-02）

### AC-16：僅 Admin 可設定／編輯員工編號（RBAC）
- **Given** 非 Admin 使用者
- **When** 嘗試存取帳號管理頁面，或透過建立／編輯帳號 API 設定 `employeeNo`
- **Then** 沿用既有帳號管理 RBAC（`AuthGuard` + `RolesGuard` `@Roles('admin')`）回 HTTP 403；本 Feature **不新增 Guard**

---

## 7. API 規格（差異增量）

> 完整既有規格見各來源 Feature；本節僅列 F113 之**增量**。

### 7.1 `POST /api/accounts`（F004）

**Request Body 新增**：
```json
{
  "...": "既有欄位（name / email / password / role / isSalesManager）不變",
  "employeeNo": "string | null（選填；格式見 §3.2；缺省或 null 表示未設定）"
}
```
- Service 於 `email` 唯一性檢查之後、儲存之前，新增 `employee_no` 重複檢查（僅在提交值非 NULL 時）；重複 → 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`。
- 全域 `ValidationPipe` 具 whitelist；`employeeNo` **必須**加入 `CreateAccountDto`，否則會被 strip。

**Response（201）新增** `employee_no: string | null`。

**新增錯誤回應（409）**：
```json
{ "error": "ACCOUNT_EMPLOYEE_NO_EXISTS", "message": "此員工編號已被使用" }
```

### 7.2 `PUT /api/accounts/:id`（F006）

**Request Body 新增**：
```json
{
  "name": "string（既有，必填）",
  "email": "string（既有，必填）",
  "employeeNo": "string | null（選填；設值 / 變更 / 清空為 null）"
}
```
- `employeeNo` **必須**加入 `UpdateAccountDto`（whitelist 同上）。
- Service 於 email 唯一性檢查後，新增 `employee_no` 唯一性檢查（**排除自身** `existing.id !== id`）；重複 → 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`。
- Service 依提交值設定 `user.employee_no`（含設為 NULL 以清除；FMT-6）。
- 此變更**擴充 F006 BR-1「只能編輯姓名與 Email」為「姓名、Email 與員工編號」**（見 F006 更新）。

**Response（200）新增** `employee_no: string | null`。

### 7.3 `GET /api/accounts`（F005）

- QueryBuilder `.select([...])` 新增 `user.employee_no`。
- `AccountListItem` 回應新增 `employee_no: string | null`。
- 搜尋 `search` 之 `WHERE` 由「姓名 OR Email」擴充為「姓名 OR Email OR 員工編號」，皆 `LOWER(...) LIKE :search`（大小寫不敏感、部分匹配）：
  ```
  (LOWER(user.name) LIKE :search OR LOWER(user.email) LIKE :search OR LOWER(user.employee_no) LIKE :search)
  ```
  （NULL `employee_no` 於 `LOWER(...) LIKE` 自然不匹配，無需特別處理）

### 7.4 `POST /api/auth/login`（F001 / F002）

- Request 欄位名維持 `email`（承載 Email 或員工編號）；DTO 放寬（§5.2）。
- Service 分支（§5.3）。
- Response `user` 物件新增 `employee_no: string | null`（`UserInfo`）。
- 失敗一律 `AUTH_INVALID_CREDENTIALS`（§5.4）。

---

## 8. 業務規則彙整

| 編號 | 規則 |
|------|------|
| BR-1 | `employee_no` 選填、可為 NULL；未設定不影響既有 Email 登入 |
| BR-2 | 格式 `^[A-Za-z0-9_-]{1,32}$`、不含 `@`、trim 首尾空白（§3.2） |
| BR-3 | 儲存原樣（不轉大小寫）；空字串／純空白正規化為 NULL |
| BR-4 | 唯一性為「有值時唯一」，由 service 層檢查（軌道 A）+ MSSQL filtered unique index（軌道 B）雙軌強制；dev/sqlite 僅軌道 A（§3.3） |
| BR-5 | 建立重複 / 編輯重複（排除自身）→ 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`「此員工編號已被使用」 |
| BR-6 | 登入識別碼欄位維持名為 `email`；含 `@` 走 Email（小寫化），否則走 `employee_no`（精確、大小寫敏感、不轉小寫） |
| BR-7 | 登入失敗（識別碼不存在／密碼錯誤）一律 `AUTH_INVALID_CREDENTIALS`，不洩漏；停用檢查於密碼驗證後（沿用 F001 BR-002/BR-003） |
| BR-8 | 帳號清單搜尋比對 `employee_no` 為大小寫不敏感、部分匹配（與登入精確比對刻意不同，OQ-179-02） |
| BR-9 | 忘記密碼維持 email-only、不支援員工編號、無新錯誤碼（OQ-179-01；§9） |
| BR-10 | 僅 Admin 可設定／編輯 `employee_no`（沿用 `AuthGuard` + `RolesGuard @Roles('admin')`），不新增 Guard |
| BR-11 | `employee_no` **非**外部人資系統識別碼；與 `ob_emphire` / EMPHIRE `emplid` 無關聯、不比對（OQ-179-04；§10 非目標） |

---

## 9. 忘記密碼行為（維持不變 / OQ-179-01）

- 忘記密碼（F009）**維持現況、email-only、不改**；不新增員工編號支援、不新增錯誤碼。
- `forgot-password.dto.ts` 保留既有 `@IsEmail` 驗證。
- 員工編號依格式**永不含 `@`**，故永不為合法 Email：
  - 若 DTO 層 `@IsEmail` 攔截 → 回既有 400 格式錯誤（「請輸入有效的 Email 地址」）。
  - 此結果**不洩漏帳號是否存在**（純格式錯誤，與帳號無關）。
- **裁定**：本 Feature 不觸碰 forgot-password；AC-13 之「200 通用成功」vs「400 格式錯誤」差異屬既有 forgot-password 之驗證行為，非 F113 引入的變更，交 system-architect / UX 於 OQ-F113-02 定案（見 §11）。

---

## 10. 非目標（Non-Goals）

| 項目 | 裁定 |
|------|------|
| **與人資系統對齊（OQ-179-04）** | `employee_no` 為 Admin 手動輸入之**獨立自由格式字串登入識別碼**，**不**與 `ob_emphire`（在職資料）等來源表之 `emplid` 關聯或比對一致性。若業務需與 HR / EMPHIRE 對齊，須另立 Story。 |
| **帳號建立通知機制（OQ-179-03）** | 系統無使用者主動通知機制（沿用現況不寄帳號建立通知信）。使用者如何得知可用員工編號登入，由 Admin 線下告知。**本 Feature 不含通知功能。** |
| 使用者自助編輯員工編號 | 不支援（MVP 無使用者自助個人資料編輯；沿用現況）。 |
| 登入頁採用 `identifier` 欄位名 | 不採用；維持 `email` 欄位名（使用者決策）。 |
| 員工編號忘記密碼 | 不支援（§9）。 |

---

## 11. 待解決問題（Open Questions）

### 已裁定（源自 US-179 四個 OQ）

| OQ | 裁定 |
|----|------|
| **OQ-179-01**（忘記密碼輸入員工編號） | **裁定：reuse existing generic response**——忘記密碼維持 email-only、不改、不新增錯誤碼（§9）。殘留實作細節見 OQ-F113-02。 |
| **OQ-179-02**（清單搜尋規則） | **裁定：清單搜尋員工編號採大小寫不敏感、部分匹配**（與登入之精確、大小寫敏感刻意不同）；兩規則並存為不同情境設計，須於 UI／文件清楚區辨（§4）。是否加使用者說明文案交 ui-ux-designer。 |
| **OQ-179-03**（帳號建立通知） | **裁定：out of scope**——無使用者通知系統，Admin 線下告知（§10 非目標）。 |
| **OQ-179-04**（與 HR/EMPHIRE 對應） | **裁定：獨立自由格式字串、與 `ob_emphire` 無關聯**（§10 非目標；BR-11）。 |

### 交 system-architect（HOW，附建議預設）

| OQ | 議題 | 建議預設 |
|----|------|---------|
| **OQ-F113-01** | Filtered unique index migration 之檔名／編號、MSSQL `Chinese_Taiwan_Stroke_BIN` collation 下 `employee_no` 比較之大小寫敏感語意須與 service 層 JS 精確比對一致、既有列 backfill 是否需前置去重掃描 | 新 MSSQL migration 建 `ux_users_employee_no ... WHERE employee_no IS NOT NULL`；entity 維持 plain column；因現況所有列 `employee_no` 皆 NULL，backfill 無重複風險 |
| **OQ-F113-02** | forgot-password 輸入純員工編號時，維持既有 `@IsEmail` 400 攔截（現況），或放寬為與登入一致並於 service 回 200 通用成功以嚴格符合 AC-13 字面 | 建議**維持現況（400 格式錯誤）**——不擴大 forgot-password 變更面、且不洩漏帳號存在；若 UX 要求嚴格 200 一致，再評估放寬 forgot-password DTO |
| **OQ-F113-03** | `@cdmp/shared`（web）與 api-local 型別副本之 `employee_no` 同步落點與防漂移 | 兩處各自新增 `employee_no?: string \| null`；比照既有跨端 DTO 副本慣例 |

---

## 12. 測試案例（對應 US-179 TC-1~TC-20）

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| T-01 | 建立帳號填合法員工編號 | 建立成功，`employee_no` 正確儲存並回傳 |
| T-02 | 建立帳號不填員工編號 | 建立成功，`employee_no = null` |
| T-03 | 編輯帳號新增員工編號 | 更新成功，回應新值 |
| T-04 | 編輯帳號變更員工編號為新值 | 更新成功，顯示新值 |
| T-05 | 編輯帳號清空既有員工編號 | 更新成功，`employee_no = null`（FMT-6） |
| T-06 | 建立使用已存在員工編號 | 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`「此員工編號已被使用」，不建立 |
| T-07 | 編輯帳號 B 為帳號 A 已用的值 | 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`，不儲存 |
| T-07a | 編輯帳號 A 保留其原員工編號並儲存其他欄位 | 儲存成功（排除自身 `existing.id !== id`） |
| T-08 | 員工編號含 `@` | 格式錯誤「員工編號不可包含 @」，不建立／不儲存 |
| T-09 | 員工編號 > 32 字元 | 格式錯誤「員工編號長度不可超過 32 字元」 |
| T-10 | 員工編號含不合法字元（空格 / `#` / 中文） | 格式錯誤「員工編號僅允許英數字、- 與 _」 |
| T-11 | 員工編號前後含空白「 E12345 」 | trim 後以「E12345」驗證與儲存 |
| T-12 | 正確 Email + 正確密碼登入（帳號有員工編號） | 登入成功，走 Email 分支（回歸），行為同 F002 |
| T-13 | 正確員工編號 + 正確密碼登入 | 登入成功，走 employee_no 精確比對，發 Token 並導向 |
| T-14 | 不存在的員工編號登入 | 401 `AUTH_INVALID_CREDENTIALS`「Email 或密碼錯誤」，無 Token |
| T-15 | 正確員工編號 + 錯誤密碼登入 | 401 `AUTH_INVALID_CREDENTIALS`，無 Token |
| T-16 | 帳號停用，員工編號 + 正確密碼登入 | 403 `ACCOUNT_DISABLED`，無 Token |
| T-17 | 忘記密碼輸入員工編號（非 Email） | 忘記密碼不支援員工編號、不寄重設連結、不洩漏帳號存在（現況 email-only 行為，見 §9） |
| T-18 | 帳號清單載入，有／無員工編號並存 | 有值者正確顯示，無者顯示空白 |
| T-19 | 帳號清單依員工編號關鍵字搜尋 | 大小寫不敏感、部分匹配，顯示匹配帳號 |
| T-20 | 非 Admin 建立／編輯設定 employeeNo | 403 Forbidden |
| T-21（新增，登入大小寫敏感） | 儲存「E12345」，以「e12345」登入 | 401 `AUTH_INVALID_CREDENTIALS`（登入精確、大小寫敏感，不轉小寫；不洩漏） |
| T-22（新增，識別碼含 `@` 走 Email 分支） | 以含 `@` 的不存在字串登入 | 走 Email 分支、`findOne` 無果 → 401（驗證分支正確性） |
| T-23（回歸，Email 唯一性不受影響） | 既有 Email 唯一性、清單既有搜尋 | 行為不變 |

---

## 13. 依賴關係

| 類型 | 項目 | 說明 |
|------|------|------|
| 前置依賴 | F001 / F002（登入）、F004（建立帳號）、F005（清單）、F006（編輯帳號）、F045（角色 Seed） | 欄位擴充與識別碼邏輯擴充之基礎 |
| 修改既有 | F001、F002、F004、F005、F006、data-model.md（User 實體） | 見 §14 影響清單 |
| 資料依賴 | `users` 表新增 `employee_no` 欄位 + MSSQL filtered unique index migration | §3 |
| NFR | NFR-001（安全性） | 不洩漏帳號存在、密碼機制不變、RBAC 沿用 |
| Blocks | 無 | |

---

## 14. 本 Feature 對既有 spec 之影響（surgical）

| 檔案 | 變更 |
|------|------|
| `features/F001-admin-login.md` | 登入識別碼接受 Email 或員工編號（`@` 分支）、DTO 放寬、forgot-password 維持 email-only；交叉引用 F113。版本 bump。 |
| `features/F002-user-login.md` | 同上（共用登入端點）；交叉引用 F113。版本 bump + changelog。 |
| `features/F004-create-account.md` | 新增選填 `employeeNo`（格式 + 唯一性 + 回應曝露）；交叉引用 F113。 |
| `features/F005-view-account-list.md` | 新增 `employee_no` 欄 + 搜尋納入；交叉引用 F113。 |
| `features/F006-edit-account.md` | 可編輯欄位擴充含 `employeeNo`（更新 BR-1）+ 唯一性排除自身 + 回應曝露；交叉引用 F113。 |
| `data-model.md`（User 實體） | 新增 `employee_no` 欄位（nullable varchar(32)、有值時唯一 via filtered index、格式）。 |
| `error-handling.md`（#account-errors） | 新增 `ACCOUNT_EMPLOYEE_NO_EXISTS`（409）。 |

---

## 15. 種子資料建議（非強制）

建議於 dev 種子帳號中，為 1~2 個既有帳號設定 `employee_no`（如 admin 帳號設「A0001」、業務帳號設「E12345」），以利手動驗證「以員工編號登入」與清單顯示／搜尋。**非強制**，由 tdd-implementation / DevOps 斟酌。

---

## 16. 交叉參考

- User Story：[US-179-employee-no-login-identifier.md](../../stories/epics/E02-account-role-management/US-179-employee-no-login-identifier.md)
- 登入：[F001-admin-login.md](F001-admin-login.md)、[F002-user-login.md](F002-user-login.md)
- 帳號管理：[F004-create-account.md](F004-create-account.md)、[F005-view-account-list.md](F005-view-account-list.md)、[F006-edit-account.md](F006-edit-account.md)
- 忘記密碼：[F009-self-service-password-reset.md](F009-self-service-password-reset.md)
- 資料模型：[data-model.md#user-entity](../data-model.md#user-entity)
- 錯誤處理：[error-handling.md#account-errors](../error-handling.md#account-errors)、[error-handling.md#auth-errors](../error-handling.md#auth-errors)
- 安全性 NFR：[NFR-001-security.md](../../stories/non-functional/NFR-001-security.md)

---

## 17. 更新紀錄

| 版本 | 日期 | 變更摘要 |
|------|------|---------|
| v1.0 | 2026-07-13 | 初版：新增選填 nullable `users.employee_no`（VARCHAR(32)、格式 `^[A-Za-z0-9_-]{1,32}$`、不含 `@`、trim、原樣儲存）；有值時唯一之雙軌設計（service 檢查 + MSSQL filtered unique index）；登入識別碼欄位維持名 `email`、依 `@` 分支 Email（小寫）/ employee_no（精確、大小寫敏感）；DTO 放寬；失敗一律 `AUTH_INVALID_CREDENTIALS`；帳號建立／編輯／清單增量；新增錯誤碼 `ACCOUNT_EMPLOYEE_NO_EXISTS`（409）；forgot-password 維持 email-only（OQ-179-01）；清單搜尋大小寫不敏感、部分匹配（OQ-179-02）；通知 out of scope（OQ-179-03）；與 EMPHIRE 無關（OQ-179-04）。 |
