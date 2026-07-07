---
type: test-design-infrastructure
test-spec-id: AD-E07-38-P1a
feature_name: MSSQL 全面遷移 P1a — 最小可連線＋登入（Driver/Entity/Schema 基礎層 Smoke Slice）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-38-mssql-p1-driver-entity-schema.md（§3 D-1~D-7、§5 不變式、§6 測試邊界、§7 風險）
covers: []
spec_version: "1.0"
date: 2026-07-07
last_updated: 2026-07-07
---

# AD-E07-38 P1a：MSSQL 全面遷移最小可連線＋登入 — 測試設計

> 本文件覆蓋 AD-E07-38「MSSQL 全面遷移 P1（Driver/Entity/Schema 基礎層）」之 **P1a 切片**（最小可連線＋登入 smoke slice）。
> P1（P1a/P1b/P1c）不經 spec-writer（AD §3 D-7 已裁定：純底層儲存/驅動置換，無新業務行為，不需 acceptance criteria）；
> 本文件依 system-architect 產出之 AD-E07-38 §3/§5/§6/§7 直接產出測試設計，為 test-designer → tdd-implementation 精簡管線的一環。
>
> **範圍**：僅 P1a（三處 TypeORM 設定點 mssql 分支 + auth 最小 4-entity 子集 + `column-types.ts` 既有 3 helper 擴充 mssql 分支 + 2 個「不可假設」型別探測點）。
> **明確排除**（分別由後續 P1b/P1c 各自一棒設計）：全 37 entity baseline / dev-prod 兩軌 schema 比對（`I-MSSQL-BASELINE-PARITY-01`）/ filtered index / bootstrap-seed 四支腳本 / `fn_calc_tier_level` / Pattern B（`$n`→named param）/ `sp_getapplock`（`I-MSSQL-LOCK-01`/`I-MSSQL-PARAM-01`）/ collation 全表一致性守門（`I-MSSQL-COLLATE-01`，P1b 範圍）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-38-mssql-p1-driver-entity-schema.md`（§3 D-1/D-2/D-6、§5 不變式）+ `apps/api/src/common/database/column-types.ts` + `apps/api/test/auth.e2e-spec.ts`（登入 e2e 樣板）+ `apps/api/src/modules/assignment/stage1/__tests__/pg-env-preload.ts`（gating helper 樣板） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P1a 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Gating 設計」章節 + `docker-compose.yml`（`mssql`/`mssql-init` profile）|

> ⚠️ **AD 文件本身章節編號有漂移**：AD 的 Agent Loading Guide 表寫「§6（P1a/P1b/P1c 切片與 DoD）、§7（不變式）、§8（測試邊界）」，但實際文件標題為 `## 3. 架構決策彙總（D-1~D-7）`（P1a/b/c DoD 其實是 §3 的 D-6 子節）、`## 5. 不變式`、`## 6. 測試邊界`（無 §8）。本測試設計已直接依**實際內容**（非依錯位的章節號）產出，此處僅記錄供未來讀者避免依號碼誤讀；已同步記入 `risks-and-gaps.md`（低嚴重度，僅文件可讀性問題，不影響本測試設計正確性）。

---

## 零、測試環境與 Gating 設計（供 tdd-implementation 落地依循）

### 0.1 檔名慣例：`*.mssql.spec.ts`

比照既有 `*.pg.spec.ts` 慣例（`vitest.config.ts` 之 `include: ['src/**/*.spec.ts', 'test/**/*.spec.ts']` 本身即涵蓋 `*.mssql.spec.ts`，不需另開 vitest project）。**不可**在 CI 未起 MSSQL 時偽造綠燈——連不上時整檔 `describe.skip` + 印出 SKIP_REASON，比照 `stage1-customer-core-clause.pg.spec.ts` 之 `SKIP_REASON` 慣例。

### 0.2 Gating helper：`mssql-env-preload.ts`（比照 `pg-env-preload.ts`）

建議與既有 `pg-env-preload.ts` 同模式，side-effect 將 `process.env.DB_TYPE` 覆寫為 `'mssql'`（供 `column-types.ts` 之 `dateColumnType`/`jsonColumnType`/`surrogatePkType`/（新增之）`uuidColumnType`/`longTextColumnType` 於 entity 首次 import 時解析為 mssql 分支值），並提供 `restoreDbType()` 供 `afterAll` 還原（避免同 worker 後續 sqlite spec 之 synchronize 被污染）。

TCP 連線可達性檢查函式（比照 `pgPortReachable`）：`mssqlPortReachable(timeoutMs=1000)`，對 `DB_HOST:DB_PORT`（預設 `localhost:1433`）建立 `net.connect`，逾時/錯誤視為不可達 → `beforeAll` 內 `describe.skip` 全檔並印出 SKIP_REASON（例如：`'需 MSSQL（docker compose --profile mssql up -d mssql mssql-init）— 未實跑'`）。

### 0.3 建議新增 `.env.test.mssql`（比照 `.env.test` 之 PG 版本）

```
NODE_ENV=test
DB_TYPE=mssql
DB_HOST=localhost
DB_PORT=1433
DB_USERNAME=cdmp
DB_PASSWORD=Cdmp_Dev_2026!
DB_NAME=CDMP
DB_MSSQL_ENCRYPT=true
DB_MSSQL_TRUST_CERT=true
JWT_SECRET=cdmp-test-jwt-secret-key
PORT=3001
```

沿用 P0 已起之本機 dev 容器連線資訊（`docker compose --profile mssql up -d mssql mssql-init`）。**注意**（見風險段落）：目前 `docker-compose.yml` 的 `mssql`/`mssql-init` 僅建立單一 `CDMP` 資料庫（dev 用途），**無**如 `postgres-test`（5433/`cdmp_test`）之獨立 test-only port/DB 分離設計；P1a 測試若直接對 `CDMP` 執行 `synchronize:true`，有與開發者手動測試資料互相污染之風險，建議見 §風險 R-MSSQL-P1A-01。

### 0.4 建議測試檔案配置（供 tdd-implementation 參考，非強制檔名）

- `src/database/__tests__/mssql-p1a-connectivity.mssql.spec.ts`（CONN + TYPE + CASE 群組，皆為 schema/synchronize 層級驗證）
- `test/auth-mssql.e2e-mssql.spec.ts` 或併入既有 e2e 目錄下的獨立檔（LOGIN + CRUD 群組，比照 `test/auth.e2e-spec.ts` 樣板但 `TypeOrmModule.forRoot` 改 `type:'mssql'`）

實際檔名由 tdd-implementation 依專案慣例定案；本文件僅要求「群組邏輯分離、皆可獨立 gating skip」。

---

## 一、CONN — 三處 TypeORM 設定點 mssql 分支可啟動

> **對應**：P1a DoD #1（前半：app 啟動 + synchronize 建表）；AD §3 D-1。
> **實作邊界提醒（重要）**：P1a 範圍內，`app.module.ts`/`worker-app.module.ts` 的 mssql 分支之 `entities` 陣列**必須刻意限定為 4 個 auth entity**（`User`/`Role`/`TokenBlocklist`/`PasswordResetToken`），**不可**沿用 sqlite/postgres 分支的完整 37-entity 陣列——其餘 33 個 entity 尚未完成型別修正（D-2 之 37 處 uuid/bigint/text 字面值），若在 P1a 就對 mssql 全量 synchronize 會因未修正型別而失敗，或誤把 P1b 範圍提前納入。此為 P1a 過渡態設計，非最終狀態。

### TS-MSSQL-P1A-CONN-001：`app.module.ts` mssql 分支使 NestJS API 成功啟動
- **Related Requirement**：AD §3 D-1 三分支決策 / P1a DoD #1
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：MSSQL 容器可連線；`DB_TYPE=mssql`
- **Steps**：以 `DB_TYPE=mssql` 啟動 `AppModule`（`Test.createTestingModule` 或完整 `NestFactory.create`）
- **Expected Result**：模組編譯與 `app.init()` 皆不拋例外；`TypeOrmModule` 回報連線成功（`DataSource.isInitialized === true`）

---

### TS-MSSQL-P1A-CONN-002：`worker-app.module.ts` mssql 分支使 Worker 模組成功啟動
- **Related Requirement**：AD §2（worker 設定點）/ P1a DoD #1
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：同上
- **Steps**：以 `DB_TYPE=mssql` 建構 `WorkerAppModule`（無需啟動 HTTP，僅驗證 `DataSource` 初始化）
- **Expected Result**：不拋例外；`DataSource.isInitialized === true`；worker 分支之 entities 載入方式（glob，依 AD §2 現況）與 app 分支保持一致結果（不因載入方式不同產生 entity 集合差異）

---

### TS-MSSQL-P1A-CONN-003：`data-source.ts`（CLI-only）mssql 分支可建構與初始化
- **Related Requirement**：AD §3 D-1（「`data-source.ts` 直接依 `DB_TYPE` 切 `'postgres'|'mssql'`，不吃 sqlite 分支」）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：`DB_TYPE=mssql`
- **Steps**：`new DataSource(mssqlOptions)` → `await dataSource.initialize()`
- **Expected Result**：不拋例外；可執行 `dataSource.query('SELECT 1 AS ok')` 取得結果（驗證此 CLI datasource 供未來 `migration:generate`/`migration:run` 可用）

---

### TS-MSSQL-P1A-CONN-004：`synchronize:true` 僅建出 P1a 範圍之 4 張 auth 表
- **Related Requirement**：P1a DoD #1（「建出 4 張 auth 表」）
- **Test Type**：Positive / Boundary
- **Preconditions**：全新空白 schema（測試前清空/重建 `CDMP` 資料庫或使用專屬測試 schema，見風險 R-MSSQL-P1A-01）
- **Steps**：`synchronize:true` 執行後，查詢 `sys.tables`（排除系統表）
- **Expected Result**：恰好 4 張使用者資料表：`users` / `roles` / `token_blocklist` / `password_reset_tokens`；**不存在**任何其餘 33 個業務 entity 對應的表（驗證 P1a 範圍未被無意擴大）

---

### TS-MSSQL-P1A-CONN-005：`encrypt`/`trustServerCertificate` 各自獨立可由環境變數配置
- **Related Requirement**：AD §3 D-1（`DB_MSSQL_ENCRYPT`/`DB_MSSQL_TRUST_CERT` 獨立環境變數）
- **Test Type**：Positive + Negative / Integration
- **Preconditions**：dev 容器為自簽憑證
- **Steps**：(a) `DB_MSSQL_ENCRYPT=true, DB_MSSQL_TRUST_CERT=true` 連線；(b) `DB_MSSQL_TRUST_CERT=false` 連線（自簽憑證應被拒）
- **Expected Result**：(a) 連線成功；(b) 連線失敗並拋出憑證驗證相關錯誤（證明兩參數確實獨立生效，非恆為 true 的死參數）

---

### TS-MSSQL-P1A-CONN-006（Regression）：sqlite / postgres 既有分支行為不受 mssql 分支新增影響
- **Related Requirement**：AD §1（「不引入任何業務行為變更」前提）
- **Test Type**：Regression / Static + Integration
- **Steps**：(a) 靜態檢視三分支改為 `if/if/if` 顯式結構後，sqlite 與 postgres 分支程式碼區塊本身未被修改（僅新增 mssql 分支）；(b) 既有 sqlite e2e（`test/auth.e2e-spec.ts`）與既有 `.pg.spec.ts` 套件維持全綠
- **Expected Result**：既有兩分支行為 0 回歸

---

## 二、TYPE — 型別映射實測（D-1 兩個「不可假設」實測點 + P1a DoD #1/#5）

> **核心紅線**：TYPE-001（uuid）與 TYPE-002（text）為 AD 明確標註「不可假設，須以真實容器驗證」之探測點；其結果直接決定 `uuidColumnType`/`longTextColumnType` 兩個新 helper 是否為必要（P1a DoD #5，§7.2 殘留議題）。**兩案例皆先以「記錄實際觀察值」設計，不預先斷定其中一分支為期望值**——測試斷言的是「已擷取到確定性、可歸類的結果」，其分支走向本身即為 tdd-implementation 之驗收依據。

### TS-MSSQL-P1A-TYPE-001：裸 `type:'uuid'` 字面值（`User.id` via `@PrimaryGeneratedColumn('uuid')`）之實際 MSSQL 型別探測
- **Related Requirement**：AD §3 D-1 assumption #1 / P1a DoD #1（`uniqueidentifier`）
- **Test Type**：Positive / Probe（真實 MSSQL，使用既有 production entity，不新增/修改 entity）
- **Preconditions**：`User` entity 已 synchronize 至 mssql
- **Steps**：查詢 `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='users' AND COLUMN_NAME='id'`（或等價 `sys.columns` + `TYPE_NAME(system_type_id)`）
- **Expected Result**：**斷言結果 = `'uniqueidentifier'`**（依 AD 假設之期望值）。若實測不等於 `'uniqueidentifier'`，本案例判定 FAIL，且此 FAIL 本身即為訊號：`uuidColumnType` helper 為必要，`User.id` 之 `@PrimaryGeneratedColumn('uuid')` 須改為顯式 `uuidColumnType`

---

### TS-MSSQL-P1A-TYPE-002：裸 `type:'text'` 字面值之實際 MSSQL 型別探測（合成 probe 表，不修改 production entity）
- **Related Requirement**：AD §3 D-1 assumption #2 / §7.2 殘留議題
- **Test Type**：Positive / Probe（真實 MSSQL，測試檔內定義之拋棄式合成 table，非 production entity — 見「測試替身」段落）
- **Preconditions**：P1a 範圍之 4 個 auth entity **皆未使用**裸 `'text'` 字面值（`TokenBlocklist.token` 為 `length:2048` 之 `varchar`，非 `text`）；本案例須用測試專屬合成表補齊此探測，見下方說明
- **Steps**：測試檔內定義一個拋棄式 `EntitySchema`（或等價：直接以 `queryRunner.createTable` 建一張僅供測試之表）含一欄 `type:'text'`；synchronize/建表後查詢其 `INFORMATION_SCHEMA.COLUMNS.DATA_TYPE`；測試結束後 `DROP TABLE`
- **Expected Result**：**斷言結果須為 `'nvarchar'`（且 `CHARACTER_MAXIMUM_LENGTH = -1`，即 `MAX`）**，**不得**為已棄用之 `'text'` 型別。若實測為 `'text'`，本案例判定 FAIL，且此 FAIL 即為訊號：`longTextColumnType`（`nvarchar` + `length:'MAX'`）為必要，17 處裸 `'text'` 字面值須全數改用此 helper，不可信任裸字面值

---

### TS-MSSQL-P1A-TYPE-003：`bigint` 字面值之實際 MSSQL 型別探測（合成 probe 表；P1a 範圍無 production 案例可用）
- **Related Requirement**：P1a DoD #1（明列 `bigint` 為預期驗證型別之一）
- **Test Type**：Positive / Probe（合成表）
- **Preconditions**：**範圍缺口說明**：4 個 P1a auth entity 皆未使用裸 `bigint`/`surrogatePkType` helper（該 helper 用於其餘 ~5 個 entity，不在 P1a 範圍）；P1a DoD #1 文字仍列出 `bigint` 作為預期驗證型別，故以合成 probe 表補齊（可與 TYPE-002 共用同一拋棄式表，另加一欄）
- **Steps**：合成表新增一欄 `type:'bigint'`，寫入一個超過 `Number.MAX_SAFE_INTEGER`（即超過 2^53-1）之數值；讀回並檢查 (a) `INFORMATION_SCHEMA.COLUMNS.DATA_TYPE`、(b) tedious driver 讀回之 JS 型別與精確值
- **Expected Result**：(a) `DATA_TYPE = 'bigint'`；(b) 讀回值為 **字串**（非 JS `number`，避免超過安全整數範圍精度流失，比照現行 `pg` driver 行為，見 D-2 備註）且與寫入值逐字元相等

---

### TS-MSSQL-P1A-TYPE-004：`dateColumnType` helper（mssql 分支值）於三個 production 欄位之實際型別
- **Related Requirement**：P1a DoD #1（`datetime2`）/ AD §3 D-2（`datetime2(3)`）
- **Test Type**：Positive / Integration
- **Preconditions**：`column-types.ts` 之 `dateColumnType` 已加上 mssql 分支（`'datetime2'`）
- **Steps**：查詢 `User.password_changed_at` / `TokenBlocklist.expires_at` / `PasswordResetToken.used_at` 三欄之 `DATA_TYPE`
- **Expected Result**：三欄皆為 `'datetime2'`；`DATETIME_PRECISION` 為 3（毫秒精度，對齊 D-2「若既有測試斷言更細精度需求可升 `datetime2(7)`」備註 — 本案例僅驗證 P1a 現行預設 3 位精度足夠，暫不要求 7 位）

---

### TS-MSSQL-P1A-TYPE-005：`boolean` 型別欄位（`User.is_sales_manager`）之實際 MSSQL 型別
- **Related Requirement**：P1a DoD #1（`bit`）
- **Test Type**：Positive / Integration
- **Steps**：查詢 `User.is_sales_manager` 之 `DATA_TYPE`
- **Expected Result**：`DATA_TYPE = 'bit'`；寫入 JS `true`/`false` 讀回後仍為 JS boolean（driver 層自動轉換 1/0 ↔ true/false，對齊 D-2 備註）

---

### TS-MSSQL-P1A-TYPE-006：`@CreateDateColumn()`/`@UpdateDateColumn()`（無顯式 type，TypeORM 預設推斷）於 mssql driver 之實際型別
- **Related Requirement**：補充探測（AD 未逐字列出，但四個 auth entity 皆使用此兩個 decorator，屬 P1a 範圍內未被 helper 控制之型別來源，risk of surprise）
- **Test Type**：Positive / Probe
- **Steps**：查詢 `users.created_at` / `users.updated_at` / `roles.created_at` / `token_blocklist.revoked_at` / `password_reset_tokens.created_at` 之 `DATA_TYPE`
- **Expected Result**：記錄實際型別（預期為 `datetime2`，因 TypeORM mssql driver 對 `@CreateDateColumn`/`@UpdateDateColumn` 預設型別通常對齊 driver 慣例）；若與 `dateColumnType` helper 產出型別不一致（例如落為 `datetime` 而非 `datetime2`），列為需回報 tdd-implementation 之發現項，不視為本案例失敗（此為探索性驗證，非既定假設）

---

### TS-MSSQL-P1A-TYPE-007（決策關卡）：依 TYPE-001/002/003 結果，判定並記錄兩個新 helper 是否採用
- **Related Requirement**：P1a DoD #5（「確認是否真的需要，以實測結果為準，不預先斷定」）/ §7.2
- **Test Type**：Decision Gate（非傳統 pass/fail，為驗收流程關卡）
- **Steps**：彙整 TYPE-001（uuid）與 TYPE-002（text）之實測結果
- **Expected Result**：
  - 若 TYPE-001 通過（裸 `'uuid'` 已正確映射 `uniqueidentifier`）→ `uuidColumnType` helper **不需新增**，`User.id`/`PasswordResetToken.id` 維持裸 `'uuid'` 字面值
  - 若 TYPE-001 失敗 → 必須新增 `uuidColumnType` helper 並改寫兩處 `@PrimaryGeneratedColumn('uuid')` 為顯式 helper（PK decorator 語法需相應調整，由 tdd-implementation 決定）
  - 若 TYPE-002 失敗（裸 `'text'` 落入已棄用 `TEXT`）→ 必須新增 `longTextColumnType`/`longTextColumnLength`，並於 P1b 全 17 處逐檔套用（P1a 本身無裸 `'text'` production 欄位需修改，但 helper 本身須於 P1a 階段建立以供 P1b 直接使用）
  - 此決策結果須寫回 tdd-implementation 之實作紀錄（如 implementation-log），供 P1b 直接引用，不重新探測

---

## 三、LOGIN — 種子 admin，登入 e2e（P1a DoD #2）

### TS-MSSQL-P1A-LOGIN-001：種子 admin 帳號，`POST /api/v1/auth/login` 回傳合法 JWT
- **Related Requirement**：P1a DoD #2
- **Test Type**：Positive / E2E（比照 `test/auth.e2e-spec.ts` 樣板，`TypeOrmModule.forRoot` 改 `type:'mssql'`）
- **Preconditions**：MSSQL 容器可連線；`AuthModule`/`AccountsModule` 掛載；已 seed 一筆 `role='admin', status='active'` 使用者（bcrypt hash 密碼）
- **Steps**：`POST /api/v1/auth/login` body `{ email, password }`（正確密碼）
- **Expected Result**：HTTP 200；回應含合法 JWT（可用既有 `JWT_SECRET` 驗簽通過）；JWT payload 含 `sub`/`email`/`role` 等既有 claim 結構

---

### TS-MSSQL-P1A-LOGIN-002（Negative）：密碼錯誤回傳 401，與既有 sqlite/postgres 分支行為一致
- **Related Requirement**：Regression（跨 driver 行為等價）
- **Test Type**：Negative / E2E
- **Steps**：`POST /api/v1/auth/login` body 含錯誤密碼
- **Expected Result**：HTTP 401；錯誤碼與 sqlite/postgres 分支既有一致（`AUTH_INVALID_CREDENTIALS`），不因 driver 切換而改變錯誤語意或帳號列舉防護行為

---

### TS-MSSQL-P1A-LOGIN-003：JWT payload 內容跨三個 driver 分支等價
- **Related Requirement**：Regression（行為不變）
- **Test Type**：Positive / Cross-driver 比對
- **Steps**：以相同種子資料分別對 sqlite / postgres / mssql 三分支執行登入，解碼三份 JWT payload
- **Expected Result**：扣除簽發時間戳（`iat`/`exp`）外，payload 其餘欄位（`sub`/`email`/`role`/`isSalesManager` 等）完全相同

---

## 四、CRUD — Entity Round-trip（P1a DoD #3）

### TS-MSSQL-P1A-CRUD-001：`User` 建立→查詢，uuid PK 序列化/反序列化正確
- **Related Requirement**：P1a DoD #3
- **Test Type**：Positive / Integration
- **Steps**：`userRepo.save(userRepo.create({...}))` → 以回傳之 `id` 執行 `userRepo.findOneBy({ id })`
- **Expected Result**：查詢成功取回同一筆；`id` 為合法 UUID 字串格式（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）；可作為後續 `WHERE id = :id` 查詢條件正確使用（非僅存取正確，亦可查詢定位正確）

---

### TS-MSSQL-P1A-CRUD-002：`password_hash`（bcrypt 60 字元字串）寫入/讀出逐字元相等
- **Related Requirement**：P1a DoD #3（「密碼欄位存取正常」）
- **Test Type**：Positive / Integration
- **Steps**：寫入一組真實 `HashUtil.hash()` 產出之 bcrypt hash（含 `$2b$` 開頭特殊字元）；讀回比對
- **Expected Result**：讀回字串與寫入字串逐字元完全相等（無截斷、無編碼轉換問題）；`HashUtil.compare(plainPassword, 讀回值)` 驗證通過

---

### TS-MSSQL-P1A-CRUD-003：`TokenBlocklist.token`（`length:2048` varchar）長字串 round-trip 無截斷
- **Related Requirement**：P1a DoD #3
- **Test Type**：Boundary / Integration
- **Steps**：寫入一個真實長度 JWT（或填充至 2048 字元邊界）；讀回比對
- **Expected Result**：讀回長度與寫入長度相等，無截斷；2048 字元邊界值可正確存取（2049 字元應被 DB 層拒絕或截斷，視 driver 行為記錄，非本案例斷言重點）

---

### TS-MSSQL-P1A-CRUD-004：`dateColumnType` 欄位寫入 JS `Date` 物件，讀回後之時間精度
- **Related Requirement**：P1a DoD #3；AD §3 D-2 `datetime2(3)` 精度備註
- **Test Type**：Positive / Boundary
- **Steps**：寫入含毫秒之 `new Date('2026-07-07T12:00:00.123Z')` 至 `User.password_changed_at`；讀回轉換
- **Expected Result**：讀回之 `Date` 物件毫秒值與寫入值相等（誤差 0ms，`datetime2(3)` 精度足夠涵蓋毫秒），時區轉換不產生日期偏移（比照 `feedback_typeorm_between_timezone` 既有教訓，驗證非以 Date 物件跨時區比較 boundary）

---

### TS-MSSQL-P1A-CRUD-005：`Role`（varchar PK `role_code`）建立→查詢
- **Related Requirement**：P1a DoD #3（entity round-trip 涵蓋非 uuid PK 案例）
- **Test Type**：Positive / Integration
- **Steps**：`roleRepo.save({role_code:'admin', display_name:'管理員', type:'system'})` → `roleRepo.findOneBy({role_code:'admin'})`
- **Expected Result**：查詢成功取回；中文 `display_name`（`Chinese_Taiwan_Stroke_BIN` collation 下）寫入/讀出逐字元相等（驗證 BIN collation 不影響一般讀寫，僅影響比較語意）

---

### TS-MSSQL-P1A-CRUD-006：`PasswordResetToken`（uuid PK + nullable `used_at`）建立→查詢→更新
- **Related Requirement**：P1a DoD #3
- **Test Type**：Positive / Integration
- **Steps**：建立一筆 `used_at:null`；查詢確認為 `null`（非空字串或特殊值）；更新 `used_at` 為目前時間；再次查詢
- **Expected Result**：初始查詢 `used_at === null`；更新後查詢取得正確時間值（驗證 nullable `dateColumnType` 欄位 null↔有值雙向正確）

---

### TS-MSSQL-P1A-CRUD-007：合成 probe 表之 `bigint` 欄位邊界值 round-trip（呼應 TYPE-003）
- **Related Requirement**：P1a DoD #3 + D-2「需驗證 tedious driver 是否也將 bigint 序列化為 string」
- **Test Type**：Boundary / Integration
- **Steps**：寫入 `9223372036854775807`（`bigint` 上界，`BIGINT_MAX`）；讀回比對字串值
- **Expected Result**：讀回字串與寫入字串完全相等（無科學記號、無精度流失）；驗證即使在型別上界仍保持精確

---

## 五、CASE — 大小寫一致性守門（P1a DoD #4，I-MSSQL-CASE-01）

### TS-MSSQL-P1A-CASE-001：`sys.tables` 確認 4 張 auth 表名稱皆為小寫
- **Related Requirement**：I-MSSQL-CASE-01 / P1a DoD #4
- **Test Type**：Positive / Guard
- **Steps**：查詢 `SELECT name FROM sys.tables`（排除系統表）
- **Expected Result**：所有回傳表名均符合 `^[a-z_]+$`（正則掃描，無任何大寫字元）；具體應為 `users`/`roles`/`token_blocklist`/`password_reset_tokens`

---

### TS-MSSQL-P1A-CASE-002：`sys.columns` 確認 4 張表全部欄位名稱皆為小寫 snake_case
- **Related Requirement**：I-MSSQL-CASE-01 / P1a DoD #4
- **Test Type**：Positive / Guard
- **Steps**：查詢 `SELECT c.name FROM sys.columns c JOIN sys.tables t ON c.object_id=t.object_id`（限定 4 張 auth 表）
- **Expected Result**：所有欄位名稱皆符合 `^[a-z_]+$`；無任何大寫字元殘留（此為 P1a 範圍內對 I-MSSQL-CASE-01 之早期實例，P1b 將擴大至全 37 表）

---

### TS-MSSQL-P1A-CASE-003（陽性對照組）：以大寫查詢表名於 BIN collation 下應失敗，佐證大小寫敏感確實生效
- **Related Requirement**：I-MSSQL-CASE-01 / AD §3 D-3.2（BIN collation 下識別碼大小寫敏感）
- **Test Type**：Negative / Guard（對照組）
- **Steps**：執行 `SELECT * FROM USERS`（全大寫，而實際表名為小寫 `users`）
- **Expected Result**：查詢失敗（「Invalid object name 'USERS'」），證明 CASE-001/002 之「全小寫」結果並非巧合命名一致，而是 BIN collation 確實使物件名稱解析具大小寫敏感性

---

## 六、REG — 跨分支回歸與型別檢查閘

### TS-MSSQL-P1A-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：專案既有慣例（`feedback_vitest_no_typecheck`：vitest 不做型別檢查，需另跑 tsc 避免 prod build 掛掉）
- **Test Type**：Static Gate
- **Steps**：執行 `tsc --noEmit -p tsconfig.build.json`
- **Expected Result**：0 錯誤（含新增 `uuidColumnType`/`longTextColumnType`（若採用）之型別簽章正確）

---

### TS-MSSQL-P1A-REG-002：`column-types.ts` 既有 3 個 helper 新增 mssql 分支後，sqlite/postgres 既有回傳值不變
- **Related Requirement**：Regression（純函式輸出不可變）
- **Test Type**：Unit / Regression
- **Steps**：分別以 `DB_TYPE=sqlite`/`DB_TYPE=postgres` 匯入 `column-types.ts`，比對 `dateColumnType`/`jsonColumnType`/`surrogatePkType` 三值
- **Expected Result**：與新增 mssql 分支前之既有值完全相同（`datetime`/`timestamp`、`simple-json`/`jsonb`、`integer`/`bigint`），新增 mssql 分支不改變既有兩分支行為

---

### TS-MSSQL-P1A-REG-003：三設定點顯式三分支重構後，非 sqlite/mssql/postgres 之未知 `DB_TYPE` 值行為（待確認，記錄現況非新斷言）
- **Related Requirement**：AD §3 D-1 pseudocode 之隱式 fallback（見風險 R-MSSQL-P1A-02）
- **Test Type**：Negative / Boundary（探索性）
- **Steps**：設定 `DB_TYPE='unknown'`，觀察三個設定點之行為
- **Expected Result**：記錄實際行為（依 AD pseudocode 現況，預期落入最後 `return {type:'postgres',...}` 之隱式 fallback，過渡期保留）；本案例不斷言此為「正確」行為，僅記錄現況供風險追蹤（見 R-MSSQL-P1A-02，是否需改為顯式拋錯留待未來裁定）

---

## 七、HELPER — I-MSSQL-HELPER-SCOPE-01 收斂驗證

### TS-MSSQL-P1A-HELPER-001：型別分歧一律收斂進 `column-types.ts`，4 個 auth entity 內無重複 `process.env.DB_TYPE` 條件判斷
- **Related Requirement**：I-MSSQL-HELPER-SCOPE-01
- **Test Type**：Static Gate（Grep）
- **Steps**：靜態掃描 `user.entity.ts`/`role.entity.ts`/`token-blocklist.entity.ts`/`password-reset-token.entity.ts` 四檔，搜尋 `process.env.DB_TYPE`
- **Expected Result**：0 命中（所有型別分歧一律透過 `column-types.ts` helper 匯入使用，不得在個別 entity 內重複寫條件判斷）

---

## 八、Traceability Matrix（P1a DoD ↔ 不變式 ↔ 測試案例）

| P1a DoD 項目 | 對應不變式 | 對應測試案例 |
|---|---|---|
| #1 三分支啟動 + 4 表 synchronize + 型別確認（uniqueidentifier/bigint/nvarchar(max)/datetime2/bit） | — | CONN-001~006、TYPE-001~006 |
| #2 種子 admin，登入回傳合法 JWT | — | LOGIN-001~003 |
| #3 entity round-trip（uuid PK 序列化 + 密碼欄位存取） | — | CRUD-001~007 |
| #4 大小寫一致性守門測試 | **I-MSSQL-CASE-01** | CASE-001~003 |
| #5 兩個新 helper 是否需要（以實測為準） | **I-MSSQL-HELPER-SCOPE-01** | TYPE-001/002/003/007、HELPER-001 |
| （跨案通用）不引入業務行為變更 | — | CONN-006、LOGIN-002/003、REG-001~003 |

**P1a 範圍明確不涵蓋之不變式**（由 P1b/P1c 各自測試設計覆蓋，此處僅記錄邊界，避免誤判遺漏）：

| 不變式 | 歸屬階段 | 原因 |
|---|---|---|
| I-MSSQL-COLLATE-01 | P1b | 需全 37 表 `sys.columns.collation_name` 一致性掃描，P1a 僅 4 表非代表性全量驗證 |
| I-MSSQL-BASELINE-PARITY-01 | P1b | 需 baseline migration（dev/prod 兩軌）存在，P1a 僅用 `synchronize:true`，無對應 migration 可比對 |
| I-MSSQL-LOCK-01 | P1c | `sp_getapplock` 屬 Pattern B 轉換範圍 |
| I-MSSQL-PARAM-01 | P1c | `$n`→named param 轉換範圍 |

---

## 九、測試替身（Mocks / Stubs / Test Doubles）說明

- **TYPE-002/003/CRUD-007 之合成 probe 表**：測試檔內定義之拋棄式表（透過 `queryRunner.createTable`/`dropTable` 或臨時 `EntitySchema`），**非** production entity 的一部分，測試結束即清除。用途：P1a 之 4 個 auth entity 範圍內查無裸 `'text'`/`bigint` 字面值可供探測，為驗證 AD 明確要求之「不可假設」假設與 P1a DoD #1 明列型別清單，須以測試專屬 schema 補齊，不擴大 production entity 範圍。
- **登入 e2e（LOGIN 群組）**：比照 `test/auth.e2e-spec.ts` 既有樣板，僅將 `TypeOrmModule.forRoot` 之 `type` 由 `'better-sqlite3'` 改為 `'mssql'` 並補上連線參數；不 mock 任何應用邏輯層，屬真實 MSSQL 容器之端對端測試。

---

## 十、命名鎖定（避免下游 agent 擅自改名）

- Gating helper：`mssqlPortReachable()`／檔名 `mssql-env-preload.ts`（比照 `pg-env-preload.ts` 之 `restoreDbType()` 命名模式）
- 測試檔案副檔名慣例：`*.mssql.spec.ts`
- 測試環境設定檔：`.env.test.mssql`
- 環境變數（AD §3 D-1 已鎖定）：`DB_MSSQL_ENCRYPT` / `DB_MSSQL_TRUST_CERT`
- 新 helper（若 TYPE-001/002 判定需要）：`uuidColumnType` / `longTextColumnType` / `longTextColumnLength`（AD §3 D-1 已鎖定命名，不得另創他名）
- SKIP_REASON 文字慣例比照既有 `.pg.spec.ts`：`'需 MSSQL（docker compose --profile mssql up -d mssql mssql-init）— 未實跑'`

---

## 更新紀錄

| 日期 | 變更內容 |
|------|---------|
| 2026-07-07 | 初版建立：AD-E07-38 P1a 測試設計，30 個測試案例（CONN 6 + TYPE 7 + LOGIN 3 + CRUD 7 + CASE 3 + REG 3 + HELPER 1）+ Traceability Matrix + 測試環境/Gating 設計 |
