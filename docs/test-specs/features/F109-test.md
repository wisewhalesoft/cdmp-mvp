---
type: test-design-feature
feature_id: F109
feature_name: 新增「客戶資料」來源篩選欄位（customer_core 8 欄，data_source 概念 + 條件式 LEFT JOIN + NULL 排除語意）
priority: P1
related_spec: /docs/specs/features/F109-customer-source-filter-fields.md
source_ad: /docs/specs/implementation-log/AD-E07-37-f109-customer-source-filter.md
source_stories: [US-172]
spec_version: "1.0"
last_updated: 2026-07-02
blocked_by: [F075, F076, F050, F051]
related: [F100, F101, F102, F103, F104, F049]
---

# F109：新增「客戶資料」來源篩選欄位（customer_core 8 欄）— 測試設計

> ⚠️ **範圍**：本文件為測試設計（test design），是 tdd-implementation 的**可執行真值來源**。**不含** production code、測試實作碼（`.spec.ts`）、migration、entity 定義。依 CLAUDE.md Agent Workflow 邊界，test-designer 僅設計測試場景，不寫產品程式碼、不寫實際 test 檔。
>
> **驗收紅線（Definition of Done）**：
> 1. **NULLEXC 群組三變體全綠**（AC-8 / BR-3）：無對應客戶 / 客戶欄本身 NULL / 無客戶條件不觸發，三種情境獨立驗證且不可混淆 = 核心紅線。
> 2. **JOIN-003「EMPTY_CONDITIONS 陷阱」必過**（AD-E07-37 §5.2 步驟 3 特別點名）：僅含 customer_core 條件之名單**不可**被誤判為空條件而整批 skip = 高風險紅線。
> 3. **EQ 群組全綠**（BR-10）：`buildStage1Sql`（PG 下推）與 `executeStage1Chain`（同一 PG DB）對含 customer_core 條件之名單，count / 案件集合完全等價 = 三處消費一致 DoD。
> 4. **AGE-004 決定性**（BR-5）：同一 `project_workym` 重跑，年齡計算結果一致，供 F067 apples-to-apples 比對 = 紅線。
> 5. **REG 群組全綠**：純案件資料名單 SQL 與 F109 前完全相同、既有 40+ composer 單元測試不受影響、F100~F104 既有 pg.spec 不退化。
> 6. **`tsc --noEmit -p tsconfig.build.json` 零錯誤**（`Stage1SqlCore` 新增 `customerCoreJoin` 欄位、composer 新增 export 符號，feedback_vitest_no_typecheck 教訓：vitest 不做型別檢查，必跑）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F109 spec](../../specs/features/F109-customer-source-filter-fields.md)（§4 AC-1~11 / §5 欄位規格 / §6 BR-1~12）+ [AD-E07-37](../../specs/implementation-log/AD-E07-37-f109-customer-source-filter.md)（§3 五個 OQ 裁定 + §5 Stage 1 SQL 契約 + §6 寫入路徑契約 + §8 不變式 + §9 PG-only 測試邊界）+ `stage1-query-composer.ts` / `stage1-sql-builder.ts` / `stage1-sql-executor.ts` / `stage1-filter-chain.ts`（新檔 `stage1-customer-core-clause.ts`）+ `assignment-list.service.ts`（`stampConditionDataSource`）+ `pooldata-field-whitelist.service.ts` |
| QA / Tester | 本文件（§一 WL ~ §二十 STATIC 全部）+ error-handling.md#assignment-list-errors + error-handling.md#assignment-run-warnings |
| CI/CD Owner | 本文件「自動化就緒度」；**F109 PG 測試須與 F098/F099/F100/F101/F102/F103/F104 pg.spec 序列執行**（共用 `cdmp_test` DB，禁並行） |
| Product Analyst | §風險與缺口（殘留議題 + OQ-172 系列業務裁定回顧） |

---

## Glossary（防漂移 — 識別符一覽）

> 所有實作必須嚴格遵守下列識別符，不可替換為括號內的別名。此清單源自 AD-E07-37 §3/§5/§8 契約，防止多 agent TDD 流程下游擅自改名（feedback_tdd_naming_drift 教訓）。

| 識別符 | 不可改為 |
|---|---|
| `dataSource`（API camelCase）/ `data_source`（DB） | source / dataOrigin / origin |
| `'ob_pool_data'` / `'customer_core'`（合法值字面量） | 大小寫變體 / 縮寫 |
| `resolveConditionDataSource` | getDataSource / inferDataSource |
| `stampConditionDataSource` | tagConditionDataSource / annotateDataSource |
| `CUSTOMER_CORE_COLUMN_NAMES` | CC_COLUMNS / CUSTOMER_CORE_FIELDS |
| `buildCustomerCoreClause` | buildCcClause / buildCustomerJoin |
| `customerCoreJoin`（`Stage1SqlCore` 欄位） | ccJoin / customerJoin |
| 參數前綴 `cc`（`ccCat{n}` / `ccAgeMin` / `ccAgeMax` / `ccWorkdt`） | 不可與既有 `cat`/`numMin`/`numMax`/`pbCat`/`pbNum`/`caseyear` 前綴混用 |
| alias `cc`（SQL 別名，`LEFT JOIN customer_core cc ON …`） | customer_core（無 alias）/ c |
| `gender` / `date_of_birth` / `occupation_desc` / `education_desc` / `marital_status_desc` / `customer_type_desc` / `monthly_income_desc` / `cpost_city`（8 個 column_name） | 大小寫變體 / F104 之 `cus_sex`（**注意**：`gender` 與 `cus_sex` 為 `customer_core` 上兩個獨立欄位，互不影響，見 OQ-F109-03） |
| `EMPTY_CONDITIONS`（`skipReason`） | NO_CONDITIONS / SKIP_EMPTY |
| `INCOMPLETE_NUMERIC_RANGE` | NUMERIC_RANGE_INCOMPLETE |
| `INVALID_COLUMN_NAME` / `EMPTY_VALUES`（`buildCustomerCoreClause` warning code） | 不改字面值 |
| M06 badge 文字：「案件資料」/「客戶資料」 | 案件來源 / 客戶來源 / POOLDATA / CUSTOMER_CORE（不可用英文原字） |
| migration 檔名前綴 `1711360000305` / `1711360000306` | m305 / m306（口語代稱可用，但檔名須用完整時間戳） |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| **PG-only 核心限制**（AD-E07-37 §2/§9） | `customer_core` **僅存在於 PostgreSQL**（SQLite 測試 DB 無此表）。**所有含 customer_core 條件的測試一律寫在 `.pg.spec.ts`**，需要真實 PostgreSQL 連線。**不得**在既有 SQLite-backed composer/chain 單元測試中加入 customer_core 情境（會因表不存在直接失敗）。 |
| **「JS oracle」正名提醒** | AD 已澄清：`executeStage1Chain`（俗稱 JS oracle）本質上也是透過 TypeORM `qb.where()` / `qb.leftJoin()` 對**真實 DB** 執行 SQL，非記憶體 JS 述詞評估。因此「PG 下推 vs JS oracle 等價」測試（EQ 群組）**兩條路徑都必須連到同一個 PG DB**，不是「PG vs SQLite」比較。 |
| **迴歸邊界**（AD §9 第 4 點） | 純案件資料名單（無 customer_core 條件）之 regression guard（AC-11「不注入 JOIN」）**可以且應該**在 SQLite 測試中驗證（斷言 `customerCoreJoin === null`），不需要真的執行含 JOIN 的查詢。 |
| **PG 測試環境慣例** | 沿用 F098~F104 既有 `.pg.spec.ts` 慣例：每 spec 使用唯一 schema 隔離；`vi.setConfig({ testTimeout: 60000 })`（feedback_pg_spec_parallel_timeout 教訓：預設 5s 在 CPU 競爭下易誤判失敗）；**與 F098/F099/F100/F101/F102/F103/F104 pg.spec 序列執行**（共用 `cdmp_test` DB，禁並行）。 |
| **等價基準（EQ 群組 Oracle）** | 由「單一程式碼源」保證（`buildCustomerCoreClause` 被 `buildStage1Sql` 與 `executeStage1Chain` 兩處各自呼叫一次），EQ 測試主要作為 **regression guard**，非「發現新差異」的手段（AD §9 第 2 點）。 |
| **衍生欄位語意 Oracle** | 年齡（AGE）與居住城市（LEFT3）為**業務語意定義**（spec §5.3），非跑程式當 oracle；本文件以手算範例（spec §5.3 baseDate 2026-07-01 / 生日 1996-08-10 → age=29）驗證。 |
| **前端測試** | 使用 React Testing Library + MSW；沿用 F075/F050 既有 mock 慣例（`fieldsFixture` 含 `dataSource`）。 |

### PG 測試資料契約（三案例原型，供 NULLEXC / AGE / CITY / AND / EQ 群組共用）

> 呼應使用者需求：「PG 測試需 seed customer_core 測試資料（含：有對應客戶且欄位有值、有對應客戶但欄位 NULL、無對應客戶三種案件）」。以下三個原型貫穿全文件，以 **Case A / Case B / Case C** 引用。

| 原型 | `ob_pool_data.custo_no` | `customer_core` 對應列 | 用途 |
|---|---|---|---|
| **Case A（完整值）** | `'C001'` | `source_customer_no='C001'`；`gender='1'`、`date_of_birth='1996-08-10'`、`occupation_desc='工程師'`、`education_desc='大學'`、`marital_status_desc='已婚'`、`customer_type_desc='個人'`、`monthly_income_desc='50,001~60,000'`、`cpost_city='臺北市大安區'` | 正向命中案例（NULLEXC 對照組、AGE/CITY 命中、AND 全符合） |
| **Case B（客戶存在但目標欄位 NULL）** | `'C002'` | `source_customer_no='C002'`；`gender=NULL`（或視測項改為其他欄位 NULL，其餘欄位可有值） | NULLEXC-002（AC-8 第 2 點：客戶欄本身 NULL → 排除） |
| **Case C（無對應客戶）** | `'C003'` | `customer_core` 中**無**任何 `source_customer_no='C003'` 之列 | NULLEXC-001（AC-8 第 1 點：LEFT JOIN 無命中 → 排除） |

> `ob_pool_data.custo_no = customer_core.source_customer_no` 為唯一 JOIN key（F100/F103 已驗證，F109 沿用）。三案例之 `ob_pool_data` 其餘欄位（`prod_kind` 等）依各測項需要另行 seed，預設與白名單案件條件相容（如 `prod_kind='01'`）。

---

## 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 說明 |
|---|---|---|---|---|
| WL（白名單 8 欄 + data_source + API dataSource，AC-1/2） | 8 | Migration Integration + Supertest | 否 | 僅涉及 `pooldata_field_whitelist`，不需 `customer_core` 表 |
| OPT（F076 可選值 seed 7 欄，AC-4） | 10 | Migration Integration | 否 | `pooldata_field_option`，同上 |
| DESC（6 個 `_desc` 欄 value=label 查詢層對比，BR-7） | 2 | PG Integration | **是** | 需實際對 `cc.<col>` 查詢 |
| GENDER（性別 code→label 查詢層，AC-5） | 3 | PG Integration + Component | 部分 | code 比對需 PG；表單顯示為前端 |
| DATASRC（`data_source` 判定機制，OQ-F109-01） | 7 | Unit（SQLite） | 否 | 純函式 + service 寫入路徑，白名單為 mock/in-memory |
| JOIN（條件式 JOIN 觸發 + EMPTY_CONDITIONS 陷阱，AC-11/BR-2） | 8 | PG Integration + Unit（SQLite regression） | 部分 | ⚠️ 高風險群組，見 JOIN-003 |
| NULLEXC（NULL 排除三變體，AC-8/BR-3/BR-4） | 7 | PG Integration + 靜態 | **是** | 核心紅線群組 |
| AGE（年齡衍生語意，AC-6/BR-5） | 8 | PG Integration + Component | 部分 | 決定性驗證需 PG；前端驗證為 Component |
| CITY（居住城市 LEFT3，AC-7/BR-6） | 4 | PG Integration | **是** | |
| AND（跨來源 AND 邏輯，AC-10/BR-8） | 3 | PG Integration | **是** | |
| DEACT（欄位/可選值停用不回溯，AC-9/BR-9） | 3 | Unit + PG Integration | 部分 | |
| EQ（PG 下推 ↔ chain 等價 DoD，BR-10） | 6 | PG Integration | **是** | DoD 門檻 |
| PARAM（命名空間隔離，I-CC-PARAM-NS-01） | 2 | Unit（靜態）+ PG | 部分 | |
| JOINCARD（JOIN 基數不變式，I-CC-JOIN-CARD-01） | 2 | PG Integration | **是** | |
| COMPSCOPE（composer 職責邊界，I-CC-COMPOSER-SCOPE-01） | 2 | Unit（靜態） | 否 | |
| API（API 契約，§7） | 2 | Supertest | 否 | |
| MIGSEED（migration 冪等） | 3 | Migration Integration | 否 | |
| FRONTEND（前端 UI，AC-3/4/6/§7） | 7 | Component（RTL + MSW） | 否 | |
| REG（迴歸防護） | 5 | Unit + PG + 型別 gate | 部分 | |
| STATIC（靜態掃描 / 命名鎖定） | 2 | Unit（靜態） | 否 | |
| **合計** | **94** | — | **約 38 案例需 Postgres** | |

---

## 一、WL — 白名單 8 欄 + `data_source` 概念 + API `dataSource`（AC-1/AC-2，BR-1/BR-12）

> **設計依據**：F109 spec §4 AC-1/AC-2；§5.1；BR-1/BR-12；AD-E07-37 §4（schema/migration）+ §7.1（API）。

### TS-F109-WL-001：migration `1711360000305` 執行後 `pooldata_field_whitelist` 新增 `data_source` 欄位，既有 7 筆 backfill `'ob_pool_data'`
- **Related Requirement**：AC-1 / BR-1 / AD §4.1
- **Test Type**：Positive / Migration Integration
- **Preconditions**：m305 up() 已執行；既有 7 筆白名單（prod_kind / spec_tp / caseyear / settle_src / case_status / list_type / best_case）已存在
- **Steps**：查詢 `SELECT column_name, data_source FROM pooldata_field_whitelist`
- **Expected Result**：所有既有 7 筆 `data_source = 'ob_pool_data'`；欄位 `NOT NULL`（無 NULL 值）；PG 環境另存在 CHECK constraint `chk_pooldata_whitelist_data_source`

---

### TS-F109-WL-002：migration `1711360000306` 執行後新增 8 筆 `customer_core` 白名單欄位，逐欄核對 `field_type` / `data_source` / `is_active` / `is_system_fixed`
- **Related Requirement**：AC-1 / BR-1 / spec §5.2
- **Test Type**：Positive / Migration Integration
- **Preconditions**：m305 + m306 up() 已執行
- **Steps**：查詢 `SELECT column_name, field_type, data_source, is_active, is_system_fixed FROM pooldata_field_whitelist WHERE data_source='customer_core' ORDER BY column_name`
- **Expected Result**：回傳 8 筆；`gender`/`occupation_desc`/`education_desc`/`marital_status_desc`/`customer_type_desc`/`monthly_income_desc`/`cpost_city` 之 `field_type='categorical'`；`date_of_birth` 之 `field_type='numeric'`；全部 `data_source='customer_core'`、`is_active=true`、`is_system_fixed=false`

---

### TS-F109-WL-003：`GET /api/v1/pooldata-fields` 回應每筆含 `dataSource`；8 客戶欄位為 `'customer_core'`，既有 7 筆為 `'ob_pool_data'`
- **Related Requirement**：AC-2 / TC-172-01
- **Test Type**：Positive / Integration（Supertest）
- **Preconditions**：m305+m306 已執行；部長 JWT
- **Steps**：GET `/api/v1/pooldata-fields`
- **Expected Result**：HTTP 200；`fields[]` 共 15 筆；每筆含 `dataSource` key（camelCase，非 `data_source`）；8 筆客戶欄位 `dataSource='customer_core'`；既有 7 筆 `dataSource='ob_pool_data'`

---

### TS-F109-WL-004：`GET /api/v1/pooldata-fields?active=true` 同樣回傳 `dataSource`（不受 filter 參數影響）
- **Related Requirement**：AC-2 / F050 v2.3 dropdown 依 `dataSource` 分組所需
- **Test Type**：Positive / Integration（Supertest）
- **Steps**：GET `/api/v1/pooldata-fields?active=true`
- **Expected Result**：同 TS-F109-WL-003 之 `dataSource` 欄位存在性；`active=true` 過濾邏輯與 `dataSource` 回傳互不干擾

---

### TS-F109-WL-005：既有案件資料欄位（`prod_kind`/`case_status`/`best_case` 等）不受影響
- **Related Requirement**：AC-1 第 2 點
- **Test Type**：Regression / Migration Integration
- **Steps**：m306 up() 前後比對 `prod_kind`/`case_status`/`best_case` 等既有 7 筆之 `is_active`/`is_system_fixed`/`field_type`
- **Expected Result**：7 筆既有欄位所有既有屬性值不變，僅新增 `data_source='ob_pool_data'`（WL-001 已驗證）

---

### TS-F109-WL-006：白名單 8 欄 seed 冪等 — m306 重複執行 up() 不增列
- **Related Requirement**：BR-12
- **Test Type**：Boundary / Migration Integration
- **Preconditions**：m306 up() 已執行一次
- **Steps**：再次執行 m306 up()；查詢 `SELECT COUNT(*) FROM pooldata_field_whitelist WHERE data_source='customer_core'`
- **Expected Result**：count = 8（`ON CONFLICT (column_name) DO NOTHING` 冪等，不新增、不報錯）

---

### TS-F109-WL-007：`GET /api/v1/pooldata-fields/available-columns` 端點維持不變，不含任何 `customer_core` 欄位
- **Related Requirement**：AD OQ-F109-05（維持 seed-only）/ spec §5.5
- **Test Type**：Regression / Integration（Supertest）
- **Preconditions**：`ob_pool_data` schema 含未列入白名單之欄位（如 `risk_level`）；`customer_core` 表存在（PG）但**不應**被此端點掃描
- **Steps**：GET `/api/v1/pooldata-fields/available-columns`
- **Expected Result**：`availableColumns[]` 僅含 `ob_pool_data` 未列入白名單之欄位；不含 `gender`/`occupation_desc` 等 8 個 customer_core 欄名（即使 `customer_core` 表存在同名欄位亦不應出現，因端點僅查 `information_schema` 之 `ob_pool_data` table_name）

---

### TS-F109-WL-008：`POST /api/v1/pooldata-fields` 建立新欄位時 DTO 不接受 `dataSource`，DB 一律套用 `DEFAULT 'ob_pool_data'`
- **Related Requirement**：AD OQ-F109-05 / §7.1
- **Test Type**：Negative / Integration（Supertest）
- **Preconditions**：部長 JWT
- **Steps**：POST `/api/v1/pooldata-fields`，body 含 `{ columnName: 'risk_level', displayName: '風險等級', fieldType: 'categorical', dataSource: 'customer_core' }`（嘗試注入 dataSource）
- **Expected Result**：HTTP 201（`dataSource` 欄位被 DTO 忽略，非驗證錯誤）；DB 中該筆 `data_source = 'ob_pool_data'`（DEFAULT），**不為** `'customer_core'`（防止繞過 seed-only 裁定）

---

## 二、OPT — F076 可選值 seed（AC-4，BR-7/BR-12）

> **設計依據**：spec §5.4；AD §4.2 m306 步驟 2；[[f104-stage2-legacy-alignment-patterns]] / feedback_mock_real_system_contract（seed 值須為 dev distinct 真實值，非臆造）。

### TS-F109-OPT-001：`gender` seed 3 筆 code→label（`1`/男、`2`/女、`3`/法人）
- **Related Requirement**：AC-5 / spec §5.4
- **Test Type**：Positive / Migration Integration
- **Steps**：查詢 `SELECT option_value, option_label FROM pooldata_field_option WHERE column_name='gender' ORDER BY option_value`
- **Expected Result**：3 筆；`('1','男')`、`('2','女')`、`('3','法人')`；`option_value ≠ option_label`（唯一 code→label 欄位）

---

### TS-F109-OPT-002：`occupation_desc` seed 55 筆，`option_value = option_label`
- **Related Requirement**：AC-4 / BR-7
- **Test Type**：Positive / Migration Integration
- **Steps**：查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name='occupation_desc'`；抽樣核對 `option_value = option_label`
- **Expected Result**：count = 55；每筆 `option_value = option_label`；含樣本值「軍公教」「教師」「醫師」「工程師」等（**TDD Developer 注意**：完整 55 筆須以 dev `SELECT DISTINCT occupation_desc FROM customer_core` 完整枚舉核對，本測試僅示範性抽樣，非逐一列舉）

---

### TS-F109-OPT-003：`education_desc` seed 8 筆（高中/大學/專科/未定/國中/碩士/小學/博士），`option_value = option_label`
- **Related Requirement**：AC-4 / BR-7 / spec §5.4 A-3
- **Test Type**：Positive / Migration Integration
- **Steps**：查詢 `SELECT option_value FROM pooldata_field_option WHERE column_name='education_desc' ORDER BY option_value`
- **Expected Result**：count=8；值集合恰為 `{高中,大學,專科,未定,國中,碩士,小學,博士}`（dev 實測 distinct，非教育程度常見排序如「國小/國中/高中」）

---

### TS-F109-OPT-004：`marital_status_desc` seed 5 筆（已婚/未婚/離婚/未定/同居）
- **Related Requirement**：AC-4 / BR-7
- **Test Type**：Positive / Migration Integration
- **Steps**：查詢 count + 值集合
- **Expected Result**：count=5；值集合恰為 `{已婚,未婚,離婚,未定,同居}`

---

### TS-F109-OPT-005：`customer_type_desc` seed 4 筆（個人/法人/外籍人士/虛擬車商編號）
- **Related Requirement**：AC-4 / BR-7
- **Test Type**：Positive / Migration Integration
- **Steps**：查詢 count + 值集合
- **Expected Result**：count=4；值集合恰為 `{個人,法人,外籍人士,虛擬車商編號}`

---

### TS-F109-OPT-006：`monthly_income_desc` seed 9 筆（含級距字串）
- **Related Requirement**：AC-4 / BR-7
- **Test Type**：Positive / Migration Integration
- **Steps**：查詢 count + 值集合
- **Expected Result**：count=9；值集合恰為 `{20,000以下, 20,001~30,000, 30,001~40,000, 40,001~50,000, 50,001~60,000, 60,001~70,000, 70,001~80,000, 80,001以上, 未確定}`（含逗號千分位符號，須精確比對字串）

---

### TS-F109-OPT-007：`cpost_city` seed 22 筆縣市（臺字形，非「台」字形）
- **Related Requirement**：AC-7 / BR-7 / OQ-172-02
- **Test Type**：Positive / Migration Integration
- **Steps**：查詢 count + 值集合
- **Expected Result**：count=22；含 `臺北市`/`臺中市`/`臺南市`/`臺東縣`（**必為「臺」字**，非「台北市」等「台」字形，防止與月跑 `LEFT(cpost_city,3)` 比對時因字形不一致而全數落空）；不含釣魚臺/南海諸/空白等邊界值（OQ-172-02 裁示不 seed）

---

### TS-F109-OPT-008：7 個 categorical 欄位可選值 seed 冪等 — 重複執行 up() 總數不變
- **Related Requirement**：BR-12
- **Test Type**：Boundary / Migration Integration
- **Preconditions**：m306 up() 已執行一次（options 總數 = 3+55+8+5+4+9+22 = 106）
- **Steps**：再次執行 m306 up()；查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name IN (7 個客戶 categorical 欄名)`
- **Expected Result**：count = 106（不變，`ON CONFLICT (column_name, option_value) DO NOTHING`）

---

### TS-F109-OPT-009：`date_of_birth`（年齡，numeric）不 seed 可選值
- **Related Requirement**：spec §5.4 備註
- **Test Type**：Negative / Migration Integration
- **Steps**：查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name='date_of_birth'`
- **Expected Result**：count = 0（numeric 欄位無 options，符合 F075/F076 既有 numeric 欄位慣例）

---

### TS-F109-OPT-010：Admin 可修改「性別」label（AC-5 第 4 點，走標準 F076 機制，OQ-172-03）
- **Related Requirement**：AC-5 / OQ-172-03 已裁示
- **Test Type**：Positive / Integration（Supertest）
- **Preconditions**：`gender` option `('1','男')` 已 seed；部長 JWT
- **Steps**：PATCH 可選值管理端點（沿用 F076 既有 PATCH options 端點），將 `option_value='1'` 之 `option_label` 改為「男性」
- **Expected Result**：HTTP 200；DB `option_label='男性'`；行為與其他 categorical 欄位無特殊限制（無額外業務規則攔阻）

---

## 三、DESC — 6 個 `_desc` 欄 value=label 查詢層對比（BR-7）

> **設計依據**：BR-7；spec §5.3 尾段「其餘 6 個 `_desc` 欄位為直接欄位比較，無衍生運算式」；與 GENDER 群組（唯一 code→label）形成對照。

### TS-F109-DESC-001：條件「教育程度 IN [大學]」→ SQL fragment 為 `cc.education_desc IN (:...values)`，`values=['大學']`（非代碼）
- **Related Requirement**：BR-7 / AC-4
- **Test Type**：Positive / PG Integration
- **Preconditions**：Case A（`education_desc='大學'`）已 seed 於 `customer_core`
- **Steps**：`buildCustomerCoreClause` 傳入 condition `{columnName:'education_desc', values:['大學']}`；斷言產出 fragment 與 params
- **Expected Result**：fragment 為 `(cc.education_desc IN (:...ccCat0))`；`params.ccCat0 = ['大學']`（中文值直接比對，無對照表轉換）；Case A 案件符合，被納入

---

### TS-F109-DESC-002：6 個 `_desc` 欄（含衍生之 `cpost_city`）與 `gender` 對照 — 僅 `gender` 之 `values` 為代碼，其餘為中文值
- **Related Requirement**：BR-7
- **Test Type**：Positive / PG Integration
- **Steps**：同一次查詢分別對 `gender`（values=['1']）與 `customer_type_desc`（values=['個人']）建構 fragment
- **Expected Result**：`gender` fragment 值為單字元代碼；`customer_type_desc` fragment 值為完整中文字串；兩者共存於同一 `whereFragments` 陣列，互不影響（驗證 BR-7「僅性別為 code→label」之邊界）

---

## 四、GENDER — 性別 code→label 查詢層（AC-5，TC-172-03）

> **設計依據**：spec §5.2 #1；AC-5；OQ-F109-03（RESOLVED，遵循 story 使用 `gender` 非 `cus_sex`）。

### TS-F109-GENDER-001：條件「性別 IN [1]」→ fragment 為 `cc.gender IN (:...values)`，`values=['1']`
- **Related Requirement**：AC-5 / BR-7
- **Test Type**：Positive / PG Integration
- **Steps**：`buildCustomerCoreClause` 傳入 `{columnName:'gender', values:['1']}`
- **Expected Result**：fragment 為 `(cc.gender IN (:...ccCat0))`；`params.ccCat0=['1']`（存 code，非「男」字串）

---

### TS-F109-GENDER-002：`cc.gender='1'` 案件符合、`='2'` 不符合（僅比對 code）
- **Related Requirement**：AC-5
- **Test Type**：Positive/Negative / PG Integration
- **Preconditions**：Case A 的 `gender='1'`；另一 fixture case D（`gender='2'`）
- **Steps**：條件「性別 IN [1]」查詢
- **Expected Result**：Case A 入選；case D 排除

---

### TS-F109-GENDER-003：名單定義表單顯示 label（男/女/法人），儲存時 payload `values` 寫代碼（`1`/`2`/`3`）
- **Related Requirement**：AC-5 第 2 點 / TC-172-03
- **Test Type**：Positive / Component（RTL）
- **Preconditions**：`gender` options fixture `[{value:'1',label:'男'},{value:'2',label:'女'},{value:'3',label:'法人'}]`；名單建立頁已渲染
- **Steps**：新增「性別」條件；勾選「男」；點儲存
- **Expected Result**：多選元件顯示文字為「男」「女」「法人」（不顯示 `1`/`2`/`3`）；`mockedCreateList` 呼叫時 `conditionPayload.conditions` 含 `{ columnName:'gender', fieldType:'categorical', values:['1'] }`

---

## 五、DATASRC — `data_source` 判定機制（OQ-F109-01 RESOLVED，I-CC-DATASOURCE-01）

> **設計依據**：AD §3 OQ-F109-01；§6 寫入路徑契約；§8 I-CC-DATASOURCE-01。純函式 + service 層測試，**不需要** `customer_core` 表（白名單以 in-memory mock/fixture 提供）。

### TS-F109-DATASRC-001：`resolveConditionDataSource` — `cond.dataSource` 已固化為 `'customer_core'` → 直接採用，不查白名單
- **Related Requirement**：OQ-F109-01 / I-CC-DATASOURCE-01
- **Test Type**：Positive / Unit
- **Steps**：`resolveConditionDataSource({ columnName:'gender', dataSource:'customer_core' })`
- **Expected Result**：回傳 `'customer_core'`；函式內部不觸發任何 DB 查詢（純函式特性）

---

### TS-F109-DATASRC-002：`cond.dataSource` 缺漏 + `columnName` 屬於 `CUSTOMER_CORE_COLUMN_NAMES` → fallback `'customer_core'`
- **Related Requirement**：OQ-F109-01 fallback 機制 / AC-9 決定性
- **Test Type**：Positive / Unit
- **Steps**：`resolveConditionDataSource({ columnName:'cpost_city' })`（無 `dataSource` key）
- **Expected Result**：回傳 `'customer_core'`（靜態 Set 命中）

---

### TS-F109-DATASRC-003：`cond.dataSource` 缺漏 + `columnName` 不屬於集合 → fallback `'ob_pool_data'`（涵蓋舊名單）
- **Related Requirement**：OQ-F109-01 fallback / AD §3 理由「F109 上線前 condition_payload 天然不含 8 個新欄名」
- **Test Type**：Positive / Unit
- **Steps**：`resolveConditionDataSource({ columnName:'prod_kind' })`
- **Expected Result**：回傳 `'ob_pool_data'`（不需 backfill migration 即可正確解析舊資料）

---

### TS-F109-DATASRC-004：`CUSTOMER_CORE_COLUMN_NAMES` 恰為 8 個欄名，無多無少
- **Related Requirement**：spec §5.2 8 欄逐字對照 / STATIC-001 前置
- **Test Type**：Positive / Unit（靜態）
- **Steps**：斷言 `CUSTOMER_CORE_COLUMN_NAMES.size === 8`；逐一比對 `{gender, date_of_birth, occupation_desc, education_desc, marital_status_desc, customer_type_desc, monthly_income_desc, cpost_city}`
- **Expected Result**：集合完全相符，無多餘或缺漏欄名

---

### TS-F109-DATASRC-005：`stampConditionDataSource` — `createList` 寫入時每個 condition 蓋上 `dataSource`，含系統固定 `best_case` 條件
- **Related Requirement**：AD §6「須在 `injectSystemFixedConditions` 之後」
- **Test Type**：Positive / Unit（service，白名單 repo mock）
- **Preconditions**：mock `whitelistRepo.find({is_active:true})` 回傳含 `best_case`（`dataSource:'ob_pool_data'`）與 `gender`（`dataSource:'customer_core'`）
- **Steps**：`createList` 呼叫鏈中，`injectSystemFixedConditions` 注入 `best_case` 條件後，`stampConditionDataSource` 執行
- **Expected Result**：最終 `condition_payload.conditions` 中 `best_case` 條件含 `dataSource:'ob_pool_data'`；使用者自選之 `gender` 條件含 `dataSource:'customer_core'`（系統注入條件也被正確蓋章，非遺漏）

---

### TS-F109-DATASRC-006：`stampConditionDataSource` — `updateList` 同樣蓋章
- **Related Requirement**：AD §6
- **Test Type**：Positive / Unit
- **Steps**：`updateList` 呼叫含 1 個 customer_core 條件之 payload
- **Expected Result**：回傳 payload 之 condition 含正確 `dataSource`（同 createList 邏輯）

---

### TS-F109-DATASRC-007：事後停用白名單欄位 → 既有名單 `condition_payload.dataSource` 已固化不受影響（AC-9 決定性核心）
- **Related Requirement**：AC-9 / I-CC-DATASOURCE-01「Stage 1 讀取路徑永不 runtime 查詢白名單」
- **Test Type**：Positive / Unit
- **Preconditions**：既有名單 `condition_payload.conditions` 已含 `{columnName:'gender', dataSource:'customer_core', values:['1']}`（建立時已固化）；白名單 `gender.is_active` 現改為 `false`
- **Steps**：`resolveConditionDataSource` 讀取此 condition（不查詢白名單 repo，僅讀 `cond.dataSource` 固化值）
- **Expected Result**：回傳 `'customer_core'`（不受 `is_active=false` 影響，因固化值優先且判定不 runtime 查白名單）

---

## 六、JOIN — 條件式 JOIN 觸發 + EMPTY_CONDITIONS 陷阱（AC-11，BR-2）

> **設計依據**：spec AC-11；BR-2；AD §5.2/§5.4「統一 EMPTY_CONDITIONS 判定」。**JOIN-003 為 AD-E07-37 特別點名之高風險陷阱案例**：composer 對純 customer_core 名單本身會回報 `EMPTY_CONDITIONS`（因迴圈全部 `continue`），若呼叫端未同時檢查 `customerCoreClause.whereFragments`，會誤判整批 skip。

### TS-F109-JOIN-001：`buildStage1Sql` — 名單含 ≥1 customer_core 條件 → `customerCoreJoin` 非 null，SQL 含 `LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no`
- **Related Requirement**：AC-11 / BR-2
- **Test Type**：Positive / PG Integration
- **Preconditions**：名單 condition_payload 含 1 個 `gender` 條件（`dataSource:'customer_core'`）
- **Steps**：呼叫 `buildStage1Sql(list, workdt, poolDataListRepo)`
- **Expected Result**：`core.customerCoreJoin === 'LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no'`；`core.skip === false`

---

### TS-F109-JOIN-002：`buildStage1Sql` — 純案件資料名單 → `customerCoreJoin === null`，SQL 與 F109 前完全相同（SQLite regression）
- **Related Requirement**：AC-11 第 2 點
- **Test Type**：Regression / Unit（SQLite，不需真的執行含 JOIN 查詢）
- **Preconditions**：名單 condition_payload 僅含 `prod_kind` 條件
- **Steps**：呼叫 `buildStage1Sql`
- **Expected Result**：`core.customerCoreJoin === null`；`core.where` 字串不含 `cc.` 或 `customer_core` 字樣

---

### TS-F109-JOIN-003：⚠️【EMPTY_CONDITIONS 陷阱】名單僅含 1 個 customer_core 條件（如「性別 IN [1]」，無任何案件條件）→ 不可誤判整批 skip
- **Related Requirement**：AC-11 / AD §5.2 步驟 3
- **Test Type**：Positive / PG Integration（**紅線案例**）
- **Preconditions**：名單 `condition_payload.conditions = [{columnName:'gender', dataSource:'customer_core', values:['1']}]`（composer 側對此條件 `continue`，`fieldFragment.where === null`，`skipReason` 內部觸發但**不代表**整體 skip）
- **Steps**：呼叫 `buildStage1Sql`
- **Expected Result**：`core.skip === false`（**不得**為 `true`）；`core.skipReason` 未定義；`core.customerCoreJoin` 非 null；`core.where` 含 `(cc.gender IN (:...ccCat0))`；查詢正確執行並依 `gender='1'` 過濾（非全數放行也非全數排除）

---

### TS-F109-JOIN-004：composer `buildPathA` 對 customer_core 條件靜默 skip（不建 fragment、不發 warning）
- **Related Requirement**：AD §5.1 / I-CC-COMPOSER-SCOPE-01
- **Test Type**：Positive / Unit（SQLite）
- **Steps**：`buildStage1WhereConditions(list)`（condition 含 1 個 `gender` customer_core 條件 + 0 個 ob_pool_data 條件）
- **Expected Result**：回傳 `fragments.length === 0`；`warnings` 陣列**不含**任何與 `gender` 相關之 warning（非 `INVALID_COLUMN_NAME` 等錯誤訊息，純粹靜默 `continue`）

---

### TS-F109-JOIN-005：多個 customer_core 條件共用同一 JOIN（不重複注入）
- **Related Requirement**：BR-2「多個客戶條件共用同一 JOIN」
- **Test Type**：Positive / PG Integration
- **Preconditions**：名單含 `gender` + `education_desc` 兩個 customer_core 條件
- **Steps**：呼叫 `buildStage1Sql`；統計最終 SQL 字串中 `LEFT JOIN customer_core` 出現次數
- **Expected Result**：`LEFT JOIN customer_core` 僅出現 1 次；`whereFragments` 含 2 個獨立 fragment（`ccCat0` / `ccCat1`，不同參數名）

---

### TS-F109-JOIN-006：混合案件 + 客戶條件仍只注入 1 個 JOIN
- **Related Requirement**：AC-10 / BR-2
- **Test Type**：Positive / PG Integration
- **Preconditions**：名單含 `prod_kind`（ob_pool_data）+ `gender`（customer_core）
- **Steps**：呼叫 `buildStage1Sql`
- **Expected Result**：`core.where` 同時含裸欄名 fragment（`"prod_kind" IN (...)`）與 `cc.` 前綴 fragment；`customerCoreJoin` 恰 1 個

---

### TS-F109-JOIN-007：`executeStage1Chain`（TypeORM `qb.leftJoin`）條件式觸發，行為與 `buildStage1Sql` 對稱
- **Related Requirement**：AD §5.4 / AC-11（第二消費路徑）
- **Test Type**：Positive / PG Integration（因 `customer_core` 僅存在 PG，此路徑測試必須連 PG，非 SQLite）
- **Preconditions**：同 JOIN-001 fixture，但呼叫 `executeStage1Chain`
- **Steps**：呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, opts)`；觀察 `qb.leftJoin('customer_core', 'cc', ...)` 是否被呼叫
- **Expected Result**：`customerCoreClause.join` 非 null 時，`qb` 確實已 `leftJoin`；`getMany()` 回傳結果與 JOIN-001 之 `buildStage1Sql` 結果集合一致（初步等價，完整 DoD 見 EQ 群組）

---

### TS-F109-JOIN-008：真正空條件（`conditions: []`）→ 兩側皆維持既有 `skip=true` 行為（regression）
- **Related Requirement**：AD §5.2 步驟 3「對既有 ob_pool_data-only 名單零行為改變」
- **Test Type**：Regression / Unit（SQLite）
- **Preconditions**：`condition_payload.conditions = []`
- **Steps**：呼叫 `buildStage1Sql`
- **Expected Result**：`core.skip === true`；`core.skipReason === 'EMPTY_CONDITIONS'`；`core.customerCoreJoin === null`（與 F109 前行為完全相同）

---

## 七、NULLEXC — NULL 排除語意三變體（AC-8，BR-3/BR-4，TC-172-06/07/08）

> **設計依據**：spec AC-8；BR-3；BR-4；§6.2 詳述；AD §3 OQ-F109-02「NULL 排除語意如何自動成立」+ §8 I-CC-NULL-EXCLUDE-01。**核心紅線群組**，三個變體必須各自獨立驗證，不可用單一測試混淆覆蓋。

### TS-F109-NULLEXC-001：【變體 a】無對應客戶（Case C）→ LEFT JOIN 後 `cc.*` 全 NULL → 排除（TC-172-06）
- **Related Requirement**：AC-8 第 1 點 / TC-172-06
- **Test Type**：Negative / PG Integration
- **Preconditions**：Case C（`ob_pool_data.custo_no='C003'`，`customer_core` 無對應列）；名單條件「性別 IN [1]」
- **Steps**：執行含此條件之 Stage 1 查詢（count 或 insert）
- **Expected Result**：Case C **不**入選（`cc.gender` 求值為 NULL，`NULL IN (...)` 為 NULL，WHERE 過濾為 false）

---

### TS-F109-NULLEXC-002：【變體 b】客戶存在但目標欄位本身 NULL（Case B）→ 排除（TC-172-07）
- **Related Requirement**：AC-8 第 2 點 / TC-172-07
- **Test Type**：Negative / PG Integration
- **Preconditions**：Case B（`customer_core.source_customer_no='C002'` 存在，`gender=NULL`）；名單條件「性別 IN [1]」
- **Steps**：同上
- **Expected Result**：Case B **不**入選（JOIN 有結果但 `gender IS NULL` 不符合 IN 任何值）

---

### TS-F109-NULLEXC-003：【變體 c】無客戶條件時 NULL 不影響入選，且不注入 JOIN（TC-172-08，AC-11 反向）
- **Related Requirement**：AC-8 第 3 點 / TC-172-08 / BR-4
- **Test Type**：Positive / PG Integration
- **Preconditions**：名單條件**僅含** `prod_kind IN ['01']`（無任何 customer_core 條件）；Case A/B/C 之 `ob_pool_data.prod_kind` 均 `'01'`
- **Steps**：執行 Stage 1 查詢；同時斷言 `core.customerCoreJoin === null`
- **Expected Result**：Case A、B、C **全數入選**（customer_core 的 NULL 完全不影響案件入選，因未注入 JOIN、未產生任何 `cc.` fragment）

---

### TS-F109-NULLEXC-004：`cpost_city` NULL → `LEFT(NULL,3)` 為 NULL → 不符合 `IN` → 排除（呼應 AC-7 第 3 點）
- **Related Requirement**：AC-7 第 3 點 / AC-8
- **Test Type**：Negative / PG Integration
- **Preconditions**：case E（`customer_core.cpost_city=NULL`）；名單條件「居住城市 IN [臺北市]」
- **Steps**：執行查詢
- **Expected Result**：case E 排除

---

### TS-F109-NULLEXC-005：`date_of_birth` NULL → `AGE(...,NULL)` 為 NULL → `BETWEEN` 求值 NULL → 排除；**不得** COALESCE 為預設歲數
- **Related Requirement**：AC-6 / BR-5 / BR-3「不得 COALESCE」
- **Test Type**：Negative / PG Integration
- **Preconditions**：case F（`customer_core.date_of_birth=NULL`）；名單條件「年齡 min=20 max=60」
- **Steps**：執行查詢
- **Expected Result**：case F 排除（不因某個「預設歲數」而誤入選任何區間，包含極寬區間 `min=0,max=150` 亦排除）

---

### TS-F109-NULLEXC-006：靜態驗證 — `buildCustomerCoreClause` 原始碼不含任何 `COALESCE` 包裹 `cc.*` 欄位
- **Related Requirement**：BR-3 硬性要求 / I-CC-NULL-EXCLUDE-01
- **Test Type**：Positive / Unit（靜態掃描）
- **Steps**：讀取 `stage1-customer-core-clause.ts` 原始碼；正則掃描 `COALESCE(cc\.` 或 `COALESCE\(\s*cc\.` pattern
- **Expected Result**：無匹配（防止未來實作誤加 COALESCE 破壞 NULL 排除語意）

---

### TS-F109-NULLEXC-007：同一次查詢中，Case A（正向命中）、Case B（欄位 NULL）、Case C（無客戶）三者結果互不干擾
- **Related Requirement**：AC-8 綜合驗證（非重複計數陷阱）
- **Test Type**：Positive / PG Integration
- **Preconditions**：Case A/B/C 皆有 `prod_kind='01'`；名單條件「`prod_kind IN ['01']` AND 性別 IN [1]」
- **Steps**：執行查詢，取得入選案件清單
- **Expected Result**：僅 Case A 入選（`gender='1'`）；Case B（`gender=NULL`）與 Case C（無客戶）皆排除；入選數恰為 1（非重複計數或誤放行）

---

## 八、AGE — 年齡衍生語意（AC-6，BR-5）

> **設計依據**：spec §5.3(1)；BR-5；AD §3 OQ-F109-02 契約（`EXTRACT(YEAR FROM AGE(:ccWorkdt::date, cc.date_of_birth))::int BETWEEN :ccAgeMin AND :ccAgeMax`）；OQ-172-01（已裁示：基準日=作業月首日）。

### TS-F109-AGE-001：baseDate=workdt=作業月首日；`date_of_birth` 恰於 baseDate 當天滿 min 歲 → 納入（含界）
- **Related Requirement**：AC-6 / BR-5
- **Test Type**：Positive / PG Integration
- **Preconditions**：`workdt='2026-07-01'`；`date_of_birth='1996-07-01'`（恰滿 30 歲）；條件 min=30, max=35
- **Steps**：執行含此年齡條件之查詢
- **Expected Result**：age 計算 = 30；30 BETWEEN 30 AND 35 為 true → 入選

---

### TS-F109-AGE-002：未達當年生日者不計入整年差（spec §5.3 範例：baseDate 2026-07-01、生日 1996-08-10 → age=29）
- **Related Requirement**：BR-5 / spec §5.3 範例
- **Test Type**：Positive / PG Integration
- **Preconditions**：`workdt='2026-07-01'`；`date_of_birth='1996-08-10'`；條件 min=29, max=29
- **Steps**：執行查詢
- **Expected Result**：age = 29（非 30，因生日 8/10 尚未到達 baseDate 7/1）→ 入選

---

### TS-F109-AGE-003：`BETWEEN` 邊界 — age=max 納入、age=max+1 排除
- **Related Requirement**：BR-5「含界」
- **Test Type**：Boundary / PG Integration
- **Preconditions**：workdt='2026-07-01'；case G（`date_of_birth='1996-07-02'` → age=29，尚未到生日）條件 min=25,max=29；case H（`date_of_birth='1996-06-30'` → age=30，已過生日）條件同上
- **Steps**：執行查詢
- **Expected Result**：case G（age=29）入選；case H（age=30）排除（30 > max=29）

---

### TS-F109-AGE-004：決定性 — 同一 `project_workym` 重跑兩次，年齡計算結果一致（BR-10 / F067 apples-to-apples）
- **Related Requirement**：BR-5「決定性」/ AC-6 第 3 點
- **Test Type**：Positive / PG Integration（**紅線**）
- **Preconditions**：同一 `project_workym`（故 `workdt` 相同）；固定 `date_of_birth`
- **Steps**：執行查詢兩次（模擬月跑重跑）
- **Expected Result**：兩次計算之 age 值完全相同，入選案件集合完全相同（不隨執行日期時鐘漂移）

---

### TS-F109-AGE-005：不同 `project_workym`（不同 `workdt`）對同一 `date_of_birth` 可能得到不同 age（驗證 baseDate 確實驅動計算，非執行日）
- **Related Requirement**：BR-5 / OQ-172-01 裁定驗證
- **Test Type**：Positive / PG Integration
- **Preconditions**：`date_of_birth='1996-07-15'`；workdt 分別為 `'2026-07-01'`（age=29，生日未到）與 `'2026-08-01'`（age=30，生日已過）
- **Steps**：分別以兩個 workdt 執行查詢
- **Expected Result**：age 值隨 workdt 不同而不同（29 vs 30），驗證基準確為作業月首日而非查詢執行當下系統時間

---

### TS-F109-AGE-006：前端 — min=50, max=30（不合法）→ 顯示「最大年齡需大於等於最小年齡」，儲存按鈕停用（TC-172-04）
- **Related Requirement**：AC-6 / TC-172-04
- **Test Type**：Negative / Component（RTL）
- **Preconditions**：名單建立頁已渲染；已新增「年齡」條件
- **Steps**：輸入 min=50、max=30
- **Expected Result**：`screen.getByText('最大年齡需大於等於最小年齡')` 存在；儲存按鈕 `disabled === true`

---

### TS-F109-AGE-007：前端 — min=30, max=50（合法）→ 無錯誤訊息，儲存按鈕可用
- **Related Requirement**：AC-6
- **Test Type**：Positive / Component（RTL）
- **Steps**：輸入 min=30、max=50
- **Expected Result**：無錯誤文字；儲存按鈕 `disabled === false`（假設其他必填欄位已滿足）

---

### TS-F109-AGE-008：`min`/`max` 缺一 → `INCOMPLETE_NUMERIC_RANGE` warning，`continue`（不建 fragment）
- **Related Requirement**：AD §3 OQ-F109-02 契約 / 沿用既有 numeric range 不完整處理慣例
- **Test Type**：Boundary / PG Integration
- **Preconditions**：condition `{columnName:'date_of_birth', min:30}`（缺 `max`）
- **Steps**：呼叫 `buildCustomerCoreClause`
- **Expected Result**：`warnings` 含 `{code:'INCOMPLETE_NUMERIC_RANGE', columnName:'date_of_birth'}`；`whereFragments` 不含年齡 fragment（該條件被跳過，不影響其他條件）

---

## 九、CITY — 居住城市 LEFT3（AC-7，BR-6，TC-172-05）

> **設計依據**：spec §5.3(2)；BR-6；AD §3 OQ-F109-02 契約（`LEFT(cc.cpost_city, 3) IN (:...values)`）。

### TS-F109-CITY-001：`cpost_city='臺北市大安區'`，條件「居住城市 IN [臺北市]」→ LEFT3 符合，不排除（TC-172-05）
- **Related Requirement**：AC-7 / TC-172-05
- **Test Type**：Positive / PG Integration
- **Preconditions**：Case A（`cpost_city='臺北市大安區'`）；條件 values=['臺北市']
- **Steps**：執行查詢
- **Expected Result**：Case A 入選（`LEFT('臺北市大安區',3)='臺北市'`，在 IN 清單內）

---

### TS-F109-CITY-002：`cpost_city='新北市板橋區'`，條件僅含 `[臺北市]` → 不符合，排除
- **Related Requirement**：AC-7
- **Test Type**：Negative / PG Integration
- **Steps**：執行查詢
- **Expected Result**：排除（`LEFT(...)='新北市'` 不在 `[臺北市]` 內）

---

### TS-F109-CITY-003：`cpost_city` 為邊界值（非標準值，如空白字串）→ LEFT3 結果不落於 22 縣市選項 → 該類客戶被排除（設計已知，非 bug）
- **Related Requirement**：spec §5.3(2)「邊界值不 seed，自然被排除」/ OQ-172-02
- **Test Type**：Boundary / PG Integration
- **Preconditions**：case I（`cpost_city=''` 空字串，非 NULL）；條件 values=['臺北市']
- **Steps**：執行查詢
- **Expected Result**：case I 排除（`LEFT('',3)=''`，不在 IN 清單內；注意此為「空字串」情境，區別於 NULLEXC-004 的「NULL」情境，兩者結果皆排除但路徑不同）

---

### TS-F109-CITY-004：`cpost_city` 恰為 3 字（無「區」後綴）→ LEFT3 取全部 3 字仍可比對成功
- **Related Requirement**：AC-7 / 邊界
- **Test Type**：Boundary / PG Integration
- **Preconditions**：case J（`cpost_city='臺北市'`，恰 3 字）；條件 values=['臺北市']
- **Steps**：執行查詢
- **Expected Result**：入選（`LEFT('臺北市',3)='臺北市'`，長度不足 3 時 `LEFT` 不報錯，直接回傳全字串）

---

## 十、AND — 跨來源 AND 邏輯（AC-10，BR-8，TC-172-10）

> **設計依據**：spec AC-10；BR-8「沿用 F050 v2.1 BR-7 `fragments.join(' AND ')`」；TC-172-10。

### TS-F109-AND-001：`prod_kind IN ['01']` AND `gender IN ['2']` → 僅同時符合兩者的案件入選（TC-172-10）
- **Related Requirement**：AC-10 / TC-172-10
- **Test Type**：Positive / PG Integration
- **Preconditions**：case K（`prod_kind='01'`, `gender='2'`）符合兩者；case L（`prod_kind='01'`, `gender='1'`）僅符合案件條件；case M（`prod_kind='02'`, `gender='2'`）僅符合客戶條件
- **Steps**：執行查詢
- **Expected Result**：僅 case K 入選；case L、case M 皆排除

---

### TS-F109-AND-002：任一條件不符合（含 NULL）均排除
- **Related Requirement**：AC-10 第 2 點
- **Test Type**：Negative / PG Integration
- **Preconditions**：case N（`prod_kind='01'`，`gender=NULL`）
- **Steps**：條件同 AND-001
- **Expected Result**：case N 排除（NULL 不符合 AND 中任一子句）

---

### TS-F109-AND-003：三來源組合 — 2 個 ob_pool_data 條件 + 1 個 customer_core 條件全部 AND 正確
- **Related Requirement**：AC-10 / BR-8
- **Test Type**：Positive / PG Integration
- **Preconditions**：條件「`prod_kind IN ['01']` AND `case_status IN ['open']` AND `gender IN ['1']`」
- **Steps**：執行查詢，以 4 種案件（全符合 / 缺 1 項 / 缺 2 項 / 全不符合）驗證
- **Expected Result**：僅全符合案件入選；其餘排除

---

## 十一、DEACT — 客戶欄位 / 可選值停用不回溯（AC-9，BR-9，TC-172-09）

> **設計依據**：spec AC-9；BR-9；沿用 F075 BR-4 / F076 BR-4。

### TS-F109-DEACT-001：白名單「性別」欄位停用（`is_active=false`）後，新建名單「新增條件」選單不再顯示性別
- **Related Requirement**：AC-9 第 2 點
- **Test Type**：Positive / Component（RTL）或 Integration
- **Preconditions**：`gender.is_active=false`
- **Steps**：GET `/api/v1/pooldata-fields?active=true`；或前端渲染「新增條件」dropdown
- **Expected Result**：`gender` 不出現於 `active=true` 結果 / dropdown 選項中

---

### TS-F109-DEACT-002：既有名單 `OB202607001`（「性別 IN [1]」已固化）於欄位停用後觸發月跑 → 仍正確過濾，不報錯（TC-172-09）
- **Related Requirement**：AC-9 / TC-172-09 / I-CC-DATASOURCE-01
- **Test Type**：Positive / PG Integration
- **Preconditions**：名單 `OB202607001` 之 `condition_payload` 已含 `{columnName:'gender', dataSource:'customer_core', values:['1']}`（建立時已固化）；隨後 `gender.is_active` 改為 `false`
- **Steps**：呼叫 `buildStage1Sql` / 觸發月跑該名單
- **Expected Result**：查詢正確組裝並執行（`customerCoreJoin` 非 null、`WHERE cc.gender IN ('1')` 生效）；不因欄位停用而拋錯或被跳過

---

### TS-F109-DEACT-003：可選值停用後既有名單仍可用該值過濾（`WHITELIST_OPTION_INACTIVE` 警告，非阻擋，BR-9 第 2 句）
- **Related Requirement**：BR-9
- **Test Type**：Positive / PG Integration
- **Preconditions**：`gender` option `'1'` 之 `is_active=false`（可選值停用，非欄位停用）；既有名單條件含 `gender IN ['1']`
- **Steps**：觸發月跑
- **Expected Result**：月跑不阻擋，正確過濾；若既有機制產生 `WHITELIST_OPTION_INACTIVE` 警告則加入 `skipped_cases.warnings[]`（非硬性錯誤）

---

## 十二、EQ — PG 下推 ↔ chain 等價 DoD（BR-10）

> **設計依據**：BR-10；AD §5「單一程式碼源」保證；§9「兩路徑皆連同一 PG DB」。**DoD 門檻群組**。

### TS-F109-EQ-001：純 customer_core 條件名單（「性別 IN [1]」）→ `estimateStage1SqlCount` 與 `executeStage1Chain` count 相等
- **Related Requirement**：BR-10 / DoD
- **Test Type**：Positive / PG Integration（**DoD**）
- **Preconditions**：Case A/B/C + 額外多筆混合 fixture；同一 PG DB
- **Steps**：分別呼叫 `estimateStage1SqlCount(list, workdt, poolDataListRepo)` 與 `executeStage1Chain(list, workdt, ...)`（`opts.dryRun` 或取 `.length`）
- **Expected Result**：兩者 count 完全相等

---

### TS-F109-EQ-002：`ob_pool_data` + `customer_core` AND 名單 → 兩路徑 count 相等 + 案件 PK 集合相等
- **Related Requirement**：BR-10 / DoD
- **Test Type**：Positive / PG Integration（**DoD**）
- **Preconditions**：條件同 AND-001
- **Steps**：分別執行兩路徑，取得完整案件 PK 清單（非僅 count）
- **Expected Result**：兩案件 PK 集合經排序後 `toEqual`（逐列等價，非僅數量相同）

---

### TS-F109-EQ-003：含 AGE 衍生條件的名單 → 兩路徑等價
- **Related Requirement**：BR-10 / BR-5
- **Test Type**：Positive / PG Integration（**DoD**）
- **Preconditions**：條件同 AGE-002
- **Steps**：兩路徑執行並比對
- **Expected Result**：count 與案件集合相等

---

### TS-F109-EQ-004：含 `cpost_city` LEFT3 條件的名單 → 兩路徑等價
- **Related Requirement**：BR-10 / BR-6
- **Test Type**：Positive / PG Integration（**DoD**）
- **Steps**：條件同 CITY-001；兩路徑比對
- **Expected Result**：count 與案件集合相等

---

### TS-F109-EQ-005：純 `ob_pool_data` 名單（無 customer_core 條件）→ 兩路徑等價（regression，既有行為不變）
- **Related Requirement**：BR-10 regression
- **Test Type**：Regression / PG Integration
- **Steps**：純案件資料條件執行兩路徑
- **Expected Result**：等價（F109 前既有行為延續，未因新增功能破壞既有等價關係）

---

### TS-F109-EQ-006：Stage 0 試算 count 與月跑 Stage 1 實際入選案件數一致（I-RUN-EST-01 延伸，三處消費一致 BR-10 具體化）
- **Related Requirement**：BR-10 / spec §6.3 消費點對照表
- **Test Type**：Positive / PG Integration（**DoD**）
- **Preconditions**：含 customer_core 條件之名單
- **Steps**：呼叫 `Stage0EstimateService.estimateListCount`（試算路徑）；另呼叫實際月跑 Stage 1 insert 後查詢 `ob_monthly_run_result` 該名單筆數
- **Expected Result**：試算 count = 月跑實際入選案件數（三處消費一致最終驗證）

---

## 十三、PARAM — 命名空間隔離（I-CC-PARAM-NS-01）

### TS-F109-PARAM-001：靜態 — `buildCustomerCoreClause` 產出 params key 一律 `cc` 前綴，與 composer 既有前綴零碰撞
- **Related Requirement**：I-CC-PARAM-NS-01
- **Test Type**：Positive / Unit（靜態 + 行為混合）
- **Preconditions**：名單同時含 2 個 ob_pool_data 條件（觸發 composer `cat0`/`cat1`）與 2 個 customer_core 條件（觸發 `ccCat0`/`ccCat1`）
- **Steps**：合併 `fieldFragment.params` 與 `customerCoreClause.params` 至同一物件；檢查 key 集合
- **Expected Result**：合併後 6 個 key（`cat0`/`cat1`/`ccCat0`/`ccCat1` + composer 其他既有前綴視情況）皆唯一，無任何 key 被覆寫（`Object.keys(merged).length` = 各自 key 數量總和）

---

### TS-F109-PARAM-002：PG 行為驗證 — 2 個 customer_core categorical 條件（gender + education_desc）各自使用獨立 `ccCat0`/`ccCat1`，查詢結果正確
- **Related Requirement**：I-CC-PARAM-NS-01
- **Test Type**：Positive / PG Integration
- **Steps**：條件「性別 IN [1] AND 教育程度 IN [大學]」執行查詢
- **Expected Result**：查詢正確執行無參數覆寫錯誤（若 `ccCat0`/`ccCat1` 命名衝突，會導致其中一個條件的 values 被覆蓋，本測試可偵測此類 bug）

---

## 十四、JOINCARD — JOIN 基數不變式（I-CC-JOIN-CARD-01）

### TS-F109-JOINCARD-001：`customer_core.source_customer_no` 存在 UNIQUE 索引約束
- **Related Requirement**：I-CC-JOIN-CARD-01 / AD §OQ-F109-04
- **Test Type**：Positive / PG Integration（schema 驗證）
- **Steps**：查詢 PG `pg_indexes` 或 `information_schema` 確認 `idx_customer_core_source_no` 為 UNIQUE
- **Expected Result**：索引存在且為 UNIQUE（防止未來 ETL 破壞此約束導致 JOIN 列膨脹）

---

### TS-F109-JOINCARD-002：LEFT JOIN 後單一 `ob_pool_data` 案件最多對應 1 筆 `customer_core`（COUNT 不因 JOIN 膨脹）
- **Related Requirement**：I-CC-JOIN-CARD-01
- **Test Type**：Positive / PG Integration
- **Preconditions**：3 筆 `ob_pool_data` 各自不同 `custo_no`，皆對應同一批（互不重複的）`customer_core` 列；名單含 1 個 customer_core 條件（寬鬆，全部符合）
- **Steps**：`estimateStage1SqlCount` 取得 count
- **Expected Result**：count = 3（不因 JOIN 產生額外列，1:1 或 1:0 基數保證）

---

## 十五、COMPSCOPE — composer 職責邊界（I-CC-COMPOSER-SCOPE-01）

### TS-F109-COMPSCOPE-001：靜態 — `buildStage1WhereConditions` 原始碼不含任何 `cc.` 前綴字串
- **Related Requirement**：I-CC-COMPOSER-SCOPE-01
- **Test Type**：Positive / Unit（靜態掃描）
- **Steps**：讀取 `stage1-query-composer.ts` 原始碼；正則掃描 `` `cc\.` `` 或 `'cc.'` pattern（排除註解與 import 語句）
- **Expected Result**：composer 主體邏輯不含 `cc.` 前綴（customer_core 側邏輯完全外置於 `buildCustomerCoreClause`）

---

### TS-F109-COMPSCOPE-002：composer 對 customer_core 條件僅 `continue` skip，不產出 fragment 或非預期 warning（區別於 unrecognized column）
- **Related Requirement**：I-CC-COMPOSER-SCOPE-01
- **Test Type**：Positive / Unit
- **Steps**：同 JOIN-004；額外比對「未知欄名」（如 `columnName:'unknown_xyz'`）情境下 composer 是否產生不同的 warning
- **Expected Result**：customer_core 條件（已知 8 欄）靜默 continue；未知欄名（非白名單、非 customer_core）仍走既有 composer 錯誤處理路徑（兩者行為不可混淆）

---

## 十六、API — API 契約（§7）

### TS-F109-API-001：`CreatePooldataFieldInput` / `UpdatePooldataFieldInput` 不含可寫 `dataSource` 欄位（型別層 + 執行時雙重確認）
- **Related Requirement**：AD OQ-F109-05 / §7.1
- **Test Type**：Positive / Unit（型別）+ Integration
- **Steps**：靜態檢查 DTO class 定義；執行時同 WL-008
- **Expected Result**：DTO 型別定義不含 `dataSource` 屬性（`tsc` 若有人誤加會在別處編譯錯誤時捕捉）

---

### TS-F109-API-002：`GET /api/v1/pooldata-fields/available-columns` 回應格式（`availableColumns[]`）不受 F109 影響
- **Related Requirement**：§7.2 regression
- **Test Type**：Regression / Integration（Supertest）
- **Steps**：GET 此端點；比對回應 schema 與 F075 v1.4 既有格式
- **Expected Result**：回應格式（`columnName`/`dataType`/`suggestedFieldType`）完全不變，不新增 `dataSource` key（此端點本就只服務 `ob_pool_data`）

---

## 十七、MIGSEED — Migration 冪等整體驗證

### TS-F109-MIGSEED-001：m305 重複執行不報錯
- **Related Requirement**：BR-12 / AD §4.2
- **Test Type**：Boundary / Migration Integration
- **Steps**：連續執行 m305 up() 兩次
- **Expected Result**：第二次執行不拋出例外（PG：`ADD COLUMN IF NOT EXISTS`；SQLite：需視實際 migration runner 冪等保護機制，若非 idempotent 需在測試中註明此為已知限制並由 migration 框架的「已執行記錄」防止重跑）

---

### TS-F109-MIGSEED-002：m306 重複執行後白名單 8 筆 + 可選值 106 筆總數不變
- **Related Requirement**：BR-12
- **Test Type**：Boundary / Migration Integration
- **Steps**：綜合 WL-006 + OPT-008，同一測試中一次驗證兩張表
- **Expected Result**：`pooldata_field_whitelist`（customer_core 部分）= 8；`pooldata_field_option`（7 個客戶欄位部分）= 106；兩次執行後皆不變

---

### TS-F109-MIGSEED-003：`down()` 驗證 — 先刪 options 再刪 whitelist（FK 安全），執行後 8 個客戶欄位完全移除
- **Related Requirement**：AD §4.2「down()：DELETE options → DELETE whitelist」
- **Test Type**：Positive / Migration Integration
- **Preconditions**：m306 up() 已執行
- **Steps**：執行 m306 down()
- **Expected Result**：`pooldata_field_option WHERE column_name IN (8個客戶欄名)` 與 `pooldata_field_whitelist WHERE column_name IN (8個客戶欄名)` 皆為 0 筆；執行過程不因 FK 約束報錯（子表先清空）

---

## 十八、FRONTEND — 前端 UI（AC-3/AC-4/AC-6，§7）

> **設計依據**：spec §7；prototype `37-base-code.html` / `27a-list-create-draft.html` / `27b-list-edit-draft.html`（依 CLAUDE.md「前端開發須對照 prototype」規則）；沿用 F075/F050 既有 mock 慣例（`add-field-dropdown` testid 已於 F050-test.md TS-F050-H07 使用）。

### TS-F109-FE-001：M06 白名單列表「資料來源」欄 — `customer_core` 顯示綠色「客戶資料」badge，`ob_pool_data` 顯示灰色「案件資料」badge（TC-172-01）
- **Related Requirement**：AC-2 / TC-172-01 / §7.1
- **Test Type**：Positive / Component（RTL）
- **Preconditions**：`fieldsFixture` 含 `dataSource` 欄位（8 筆 `customer_core` + 7 筆 `ob_pool_data`）
- **Steps**：render M06 篩選欄位管理頁；查詢每列 badge
- **Expected Result**：`dataSource='customer_core'` 之列 badge 文字為「客戶資料」；`dataSource='ob_pool_data'` 之列 badge 文字為「案件資料」；依 `dataSource` 旗標渲染（不 hardcode 欄位字串比對）

---

### TS-F109-FE-002：M06 工具列「資料來源」篩選 dropdown — 選「客戶資料」只顯示 8 筆
- **Related Requirement**：§7.1
- **Test Type**：Positive / Component（RTL）
- **Steps**：選取工具列「資料來源」dropdown 之「客戶資料」選項
- **Expected Result**：列表僅顯示 8 筆 `dataSource='customer_core'` 之列，`ob_pool_data` 7 筆隱藏

---

### TS-F109-FE-003：M06 8 個客戶欄位除 `date_of_birth` 外顯示「管理可選值」入口；`date_of_birth` 無此入口
- **Related Requirement**：§7.1 第 3 點
- **Test Type**：Positive / Component（RTL）
- **Steps**：查詢各列「管理可選值」連結是否存在
- **Expected Result**：7 個 categorical 客戶欄位有連結；`date_of_birth`（numeric）無連結（沿用既有 numeric 欄位慣例）

---

### TS-F109-FE-004：F050/F051「新增條件」選單依 `dataSource` 分組，至少含「案件資料」「客戶資料」兩群組，可跨群組選取並存（AC-3，TC-172-02）
- **Related Requirement**：AC-3 / TC-172-02
- **Test Type**：Positive / Component（RTL）
- **Preconditions**：`fieldsFixture` 含 `prod_kind`（`ob_pool_data`）與 `gender`（`customer_core`）
- **Steps**：點擊「新增條件」按鈕；`await waitFor(() => screen.getByTestId('add-field-dropdown'))`；查詢分組標題與各群組內選項
- **Expected Result**：dropdown 內可見「案件資料」分組標題，內含 `prod_kind`（顯示「產品類別」）；「客戶資料」分組標題，內含 `gender`（顯示「性別」）；使用者可先選 `prod_kind` 再選 `gender`，兩條件同時存在於畫面上的條件列表

---

### TS-F109-FE-005：`is_system_fixed=true` 欄位（`best_case`）排除於可選池，與來源分組正交（BR-11）
- **Related Requirement**：BR-11 / 沿用 F075 BR-16 / F050 TS-F050-Q04
- **Test Type**：Regression / Component（RTL）
- **Preconditions**：`fieldsFixture` 含 `best_case`（`dataSource:'ob_pool_data'`, `isSystemFixed:true`）
- **Steps**：展開「新增條件」dropdown，查詢「案件資料」分組內容
- **Expected Result**：「案件資料」分組**不含** `best_case`（即使群組本身存在，`isSystemFixed=true` 之欄位仍被排除，兩個過濾條件正交運作）

---

### TS-F109-FE-006：年齡欄位表單元件顯示 min/max 整數輸入框（非多選元件）
- **Related Requirement**：AC-6 / §7.3
- **Test Type**：Positive / Component（RTL）
- **Steps**：新增「年齡」條件
- **Expected Result**：渲染兩個 number input（`data-testid` 建議 `age-min-input` / `age-max-input`），非 checkbox/multi-select 元件

---

### TS-F109-FE-007：Tab 2 可選值管理 — 性別顯示 code chip + label；其餘 `_desc` 欄僅顯示 value=label（無 code chip）
- **Related Requirement**：AC-5 / §7.2
- **Test Type**：Positive / Component（RTL）
- **Preconditions**：進入 `gender` 可選值管理頁與 `education_desc` 可選值管理頁
- **Steps**：查詢各自選項列的渲染內容
- **Expected Result**：`gender` 選項列顯示 `option_value` chip（如「1」）+ `option_label`（「男」）；`education_desc` 選項列僅顯示單一文字（「大學」），無額外 code chip

---

## 十九、REG — 迴歸防護

### TS-F109-REG-001：既有 40+ composer 單元測試（無 customer_core 條件）行為不變
- **Related Requirement**：AD §5.1「零風險破壞既有測試」
- **Test Type**：Regression / Unit（SQLite）
- **Steps**：執行既有 `stage1-query-composer.spec.ts` 全部案例
- **Expected Result**：全數通過；`resolveConditionDataSource` 對所有既有測試 fixture（純 `ob_pool_data` 欄名）恆回傳 `'ob_pool_data'`

---

### TS-F109-REG-002：純案件資料名單 Stage 1 SQL 字串與 F109 部署前完全相同
- **Related Requirement**：AC-11 regression
- **Test Type**：Regression / Unit（SQLite，字串快照比對）
- **Steps**：對固定案件資料名單呼叫 `buildStage1Sql`；比對產出 SQL 字串
- **Expected Result**：SQL 字串（含 FROM 子句、WHERE 子句）與 F109 前基準快照完全一致，無多餘空白或 JOIN 片段插入

---

### TS-F109-REG-003：`normalizeConditionPayload`（名單重複偵測）簽章不受 `dataSource` 欄位影響（AD §10.3）
- **Related Requirement**：AD §10.3
- **Test Type**：Regression / Unit
- **Preconditions**：兩份 `condition_payload`，欄位條件完全相同但其中一份多帶 `dataSource` key
- **Steps**：呼叫 `normalizeConditionPayload` 分別產生簽章字串
- **Expected Result**：兩份簽章字串完全相同（`dataSource` 不影響重複偵測判斷，`findActiveConditionDuplicate` 邏輯不受影響）

---

### TS-F109-REG-004：F100/F101/F102/F103/F104 既有 pg.spec 全綠（Stage1SqlCore 新增欄位 + composer 新增 export 不破壞既有下游）
- **Related Requirement**：REG 群組整體
- **Test Type**：Regression / PG Integration
- **Steps**：執行既有 F100~F104 pg.spec 系列（`stage2to4-*.pg.spec.ts` 等）
- **Expected Result**：全數通過，不因 F109 對 `stage1-sql-builder.ts`/`stage1-query-composer.ts` 的異動而回歸

---

### TS-F109-REG-005：`tsc --noEmit -p tsconfig.build.json` 零錯誤
- **Related Requirement**：DoD 紅線 6 / feedback_vitest_no_typecheck
- **Test Type**：Regression / 型別 gate
- **Steps**：執行 `tsc --noEmit -p tsconfig.build.json`
- **Expected Result**：零編譯錯誤（`Stage1SqlCore.customerCoreJoin` 新增欄位、composer 新增 export 符號、`ObListDefinitionConditionItem.dataSource?` 新增屬性皆需型別檢查通過）

---

## 二十、STATIC — 靜態掃描 / 命名鎖定

### TS-F109-STATIC-001：`CUSTOMER_CORE_COLUMN_NAMES` 集合與 spec §5.2 8 欄逐字相符（防漂移）
- **Related Requirement**：Glossary / DATASRC-004 延伸
- **Test Type**：Positive / Unit（靜態，同 DATASRC-004，於此處作為獨立命名鎖定守門重申）
- **Steps**：比對原始碼常數與本文件 Glossary 表列之 8 個欄名字面值
- **Expected Result**：完全相符，無別名替換（如 `birth_date` 誤代 `date_of_birth`）

---

### TS-F109-STATIC-002：`buildCustomerCoreClause` 存在於 AD 指定路徑 `apps/api/src/modules/assignment/stage1/stage1-customer-core-clause.ts`
- **Related Requirement**：AD §3 OQ-F109-02 契約
- **Test Type**：Positive / Unit（檔案存在性）
- **Steps**：`fs.existsSync` 檢查檔案路徑；檢查該檔案 export `buildCustomerCoreClause` 函式
- **Expected Result**：檔案存在且路徑正確；export 符號名稱正確（不可改為 `buildCcClause` 等別名，見 Glossary）

---

## 測試案例數統計

| 分區 | 案例 ID 範圍 | 數量 | 需 Postgres |
|------|------------|------|------|
| 一、WL（白名單 8 欄 + API dataSource） | TS-F109-WL-001~008 | 8 | 否 |
| 二、OPT（可選值 seed 7 欄） | TS-F109-OPT-001~010 | 10 | 否 |
| 三、DESC（6 個 _desc 欄查詢層） | TS-F109-DESC-001~002 | 2 | 是 |
| 四、GENDER（性別 code→label 查詢層） | TS-F109-GENDER-001~003 | 3 | 部分 |
| 五、DATASRC（data_source 判定機制） | TS-F109-DATASRC-001~007 | 7 | 否 |
| 六、JOIN（條件式 JOIN + EMPTY_CONDITIONS 陷阱） | TS-F109-JOIN-001~008 | 8 | 部分 |
| 七、NULLEXC（NULL 排除三變體，紅線） | TS-F109-NULLEXC-001~007 | 7 | 是 |
| 八、AGE（年齡衍生語意） | TS-F109-AGE-001~008 | 8 | 部分 |
| 九、CITY（居住城市 LEFT3） | TS-F109-CITY-001~004 | 4 | 是 |
| 十、AND（跨來源 AND） | TS-F109-AND-001~003 | 3 | 是 |
| 十一、DEACT（欄位/可選值停用不回溯） | TS-F109-DEACT-001~003 | 3 | 部分 |
| 十二、EQ（PG↔chain 等價，DoD） | TS-F109-EQ-001~006 | 6 | 是 |
| 十三、PARAM（命名空間隔離） | TS-F109-PARAM-001~002 | 2 | 部分 |
| 十四、JOINCARD（JOIN 基數不變式） | TS-F109-JOINCARD-001~002 | 2 | 是 |
| 十五、COMPSCOPE（composer 職責邊界） | TS-F109-COMPSCOPE-001~002 | 2 | 否 |
| 十六、API（API 契約） | TS-F109-API-001~002 | 2 | 否 |
| 十七、MIGSEED（migration 冪等） | TS-F109-MIGSEED-001~003 | 3 | 否 |
| 十八、FRONTEND（前端 UI） | TS-F109-FE-001~007 | 7 | 否 |
| 十九、REG（迴歸防護） | TS-F109-REG-001~005 | 5 | 部分 |
| 二十、STATIC（靜態掃描） | TS-F109-STATIC-001~002 | 2 | 否 |
| **合計** | | **94** | **約 38 案例需 Postgres** |

---

## AC / BR / TC → 測試場景覆蓋矩陣

| 對應項 | 說明 | 測試場景 |
|---|---|---|
| AC-1 / BR-1 | 白名單新增 8 欄 | WL-001~002, WL-005 |
| AC-2 / BR-1 | 資料來源欄 + API dataSource | WL-003~004, FE-001~002 |
| AC-3 | 名單定義來源分組 UI | FE-004（TC-172-02） |
| AC-4 / BR-7 / BR-12 | 可選值可維護 + seed | OPT-001~010 |
| AC-5 / BR-7 | 性別 code→label | OPT-001, GENDER-001~003, FE-007（TC-172-03） |
| AC-6 / BR-5 | 年齡 numeric 區間 + 決定性 | AGE-001~008（TC-172-04） |
| AC-7 / BR-6 | 居住城市 LEFT3 | CITY-001~004, NULLEXC-004（TC-172-05） |
| AC-8 / BR-3 / BR-4 | NULL 排除三變體 | NULLEXC-001~003（TC-172-06/07/08），NULLEXC-005~007 |
| AC-9 / BR-9 | 欄位/可選值停用不回溯 | DEACT-001~003（TC-172-09） |
| AC-10 / BR-8 | 跨來源 AND | AND-001~003（TC-172-10） |
| AC-11 / BR-2 | 條件式 JOIN 觸發 | JOIN-001~008 |
| BR-10 | 三處消費一致 | EQ-001~006 |
| BR-11 | is_system_fixed 正交 | FE-005 |
| I-CC-DATASOURCE-01 | data_source 決定性解析 | DATASRC-001~007 |
| I-CC-JOIN-CARD-01 | JOIN 基數不變式 | JOINCARD-001~002 |
| I-CC-NULL-EXCLUDE-01 | NULL 三值邏輯不 COALESCE | NULLEXC-006 |
| I-CC-COMPOSER-SCOPE-01 | composer 職責邊界 | COMPSCOPE-001~002 |
| I-CC-PARAM-NS-01 | 參數命名空間隔離 | PARAM-001~002 |
| OQ-F109-01 | data_source 判定機制 | DATASRC 全組 |
| OQ-F109-02 | 衍生運算式落點 | AGE 全組、CITY 全組、JOIN-007 |
| OQ-F109-03 | 性別欄位確認（gender 非 cus_sex） | GENDER 全組（Glossary 註記） |
| OQ-F109-04 | JOIN 效能/索引 | JOINCARD-001 |
| OQ-F109-05 | seed-only，不開放 UI 新增 | WL-007~008, API-001~002 |
| DoD 紅線 | 全部驗收 | NULLEXC + JOIN-003 + EQ + AGE-004 + REG-004/005 |

---

## 風險與缺口

### 已由 AD-E07-37 裁定並接受之殘留風險（本測試設計不重複建守門測試，僅記錄供 Product Analyst 參考）

| 項目 | AD 條款 | 說明 |
|---|---|---|
| 舊 `condition_payload` columnName 碰撞 | AD §10.1 | 理論上不存在（F109 前白名單僅 7 個 `ob_pool_data` 欄位，whitelist 驗證會拒絕不在白名單內的 columnName），已文件化為可接受風險，不需額外測試 |
| `customer_core` 未來欄位命名碰撞（歧義引用） | AD §10.2 | 若 `customer_core` 未來新增與現行 7 個 `ob_pool_data` 白名單欄名相同之欄位，PG 會拋出 `column reference "..." is ambiguous` 編譯期錯誤（fail-loud，非本 AD 需防禦） |
| JOIN 效能 EXPLAIN 觀察 | AD §10.4 | 建議 prod 上線後首次含 customer_core 條件之月跑人工 `EXPLAIN ANALYZE`，屬 post-deploy 觀察項，非自動化測試範圍（不納入本文件場景計數） |

### 待確認事項（非阻擋，供 tdd-implementation 落地時留意）

| ID | 描述 | 影響 | 建議動作 |
|---|---|---|---|
| RISK-F109-001 | `pooldata_field_whitelist` SQLite 環境 migration 重複執行冪等性未在 AD 中逐字保證（PG 用 `ADD COLUMN IF NOT EXISTS`，SQLite migration runner 是否天然防重跑視框架而定） | MIGSEED-001 若在 SQLite CI 環境失敗，需確認 migration runner 本身是否已阻擋重跑（而非 SQL 語句本身冪等） | tdd-implementation 落地時確認既有 migration runner 是否已有「已執行記錄」機制；若無，SQLite 分支需補 `PRAGMA table_info` 檢查欄位存在性後跳過 |
| RISK-F109-002 | `occupation_desc` 55 筆完整枚舉未逐一列於本文件（僅示範性抽樣） | OPT-002 若 dev distinct 實際值集合與示範樣本有出入，測試斷言需以實際枚舉為準 | tdd-implementation 執行 dev `SELECT DISTINCT occupation_desc FROM customer_core` 取得完整 55 筆後固化於測試 fixture，非臆造（feedback_mock_real_system_contract） |
| RISK-F109-003 | JOIN-007（`executeStage1Chain` 條件式 JOIN）與 EQ 群組部分重疊 | 兩群組皆驗證 chain 路徑行為，可能造成維護時需同步更新兩處 | 可接受：JOIN-007 聚焦「觸發判斷」，EQ 聚焦「與 PG 下推逐列等價」，測試目的不同，保留兩者 |

---

## 建議測試檔案對應（供 tdd-implementation 參考，非強制實作路徑）

| 群組 | 建議測試檔 |
|---|---|
| WL / OPT / MIGSEED | `apps/api/src/database/migrations/__tests__/1711360000305-AddDataSourceToPooldataFieldWhitelist.spec.ts`、`1711360000306-SeedCustomerCoreFilterFields.spec.ts` |
| DATASRC / COMPSCOPE / PARAM（靜態） / STATIC | `apps/api/src/modules/assignment/stage1/stage1-query-composer.spec.ts`（擴充） |
| JOIN（SQLite regression 部分）/ REG-001/002 | `stage1-query-composer.spec.ts` / `stage1-sql-builder.spec.ts`（既有檔擴充） |
| JOIN（PG）/ NULLEXC / AGE / CITY / AND / DEACT-002/003 / EQ / JOINCARD | `stage1-customer-core-clause.pg.spec.ts`（新建，比照 F104 `stage2to4-score-source-f104.pg.spec.ts` 慣例） |
| DESC / GENDER（查詢層） | 併入上述 `.pg.spec.ts` |
| DATASRC-005/006（寫入路徑） | `assignment-list.service.spec.ts`（擴充） |
| API / WL-003/004/007/008 | `pooldata-field-whitelist.e2e-spec.ts`（擴充） |
| FRONTEND | `field-whitelist-page.test.tsx`（擴充）、`list-create-draft-page.test.tsx` / `list-edit-draft-page.test.tsx`（擴充） |
| REG-004 | 既有 `F098~F104` pg.spec 系列（無需新檔，僅重跑驗證） |
| REG-005 | CI pipeline `tsc --noEmit` step（無測試檔） |

---

## 更新紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-07-02 | 初版（US-172 / F109 spec v1.0 / AD-E07-37 v1.0）：94 個測試場景，涵蓋 WL/OPT/DESC/GENDER/DATASRC/JOIN/NULLEXC/AGE/CITY/AND/DEACT/EQ/PARAM/JOINCARD/COMPSCOPE/API/MIGSEED/FRONTEND/REG/STATIC 共 20 群組。**PG-only 邊界**（AD-E07-37 裁定）：所有含 customer_core 條件之測試設計為 `.pg.spec.ts`（約 38 案例強制需 Postgres），純案件資料 regression guard 維持 SQLite。核心紅線：NULLEXC 三變體、JOIN-003 EMPTY_CONDITIONS 陷阱、EQ 群組 DoD、AGE-004 決定性。5 個架構不變式（I-CC-DATASOURCE-01/JOIN-CARD-01/NULL-EXCLUDE-01/COMPOSER-SCOPE-01/PARAM-NS-01）逐一對應測試場景。 |
