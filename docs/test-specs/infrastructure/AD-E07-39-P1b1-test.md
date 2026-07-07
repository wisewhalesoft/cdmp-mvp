---
type: test-design-infrastructure
test-spec-id: AD-E07-39-P1b1
feature_name: MSSQL 全面遷移 P1b1 — 全 Entity 型別修正＋索引鍵修正＋D1 全 Entity 載入＋Synchronize 全表建成
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-39-mssql-p1b-full-baseline.md（§0 F-1~F-5、§2 900-byte 掃描、§3 B1 hash 裁定、§4.4 varchar 編碼 test-first、§8 P1b1 DoD、§9 不變式）
  - /docs/specs/implementation-log/AD-E07-38-mssql-p1-driver-entity-schema.md（§11 Errata、既有不變式 I-MSSQL-CASE-01/COLLATE-01/HELPER-SCOPE-01）
covers: []
spec_version: "1.0"
date: 2026-07-07
last_updated: 2026-07-07
---

# AD-E07-39 P1b1：MSSQL 全面遷移全 Entity 型別修正 — 測試設計

> 本文件覆蓋 AD-E07-39「MSSQL 全面遷移 P1b（全 37 Entity Baseline）」之 **P1b1 切片**（全 Entity 型別修正 + 索引鍵修正 + D1 全 Entity 載入 + Synchronize 全表建成）。
> P1（P1a/P1b/P1c）不經 spec-writer（AD-E07-38 §3 D-7 已裁定：純底層儲存/驅動置換，無新業務行為，不需 acceptance criteria）；本文件依 system-architect 產出之 AD-E07-39 §0/§2/§3/§4.4/§8/§9 直接產出測試設計，銜接 P1a（`infrastructure/AD-E07-38-P1a-test.md`，30 場景，已完成）。
>
> **範圍**：§1 全部 47 處 helper 替換（uuid 18 + text 17 + boolean 8 + **timestamp bare 4，F-1**）；§2 900-byte 索引鍵掃描結論驗證；§3 B1 `token_blocklist` 改 `token_hash binary(32)`；§4.4 varchar 中文編碼 smoke test（**test-first**，決定是否需系統性 varchar→nvarchar 轉換）；§5 D1 三處 TypeORM 設定點統一載入全 37 entity；§6 之 `CURRENT_TIMESTAMP` default smoke（步驟 3 人工稽核清單一項，非全部兩軌流程）。
> **明確排除**（分別由 P1b2/P1b3 各自一棒設計）：prod baseline migration 產出 + dev/prod 兩軌 parity 驗證腳本（`I-MSSQL-BASELINE-PARITY-01`，P1b2）／`fn_calc_tier_level` 不建立之最終驗證（P1b2，本輪僅延用既有裁定不重複驗證）／bootstrap-seed 三支腳本改寫（`seed-datasource.ts`/`prod-data-seed.ts`/`seed.ts`，P1b3）／Pattern B（`$n`→named param）與 `sp_getapplock`（P1c，`I-MSSQL-LOCK-01`/`I-MSSQL-PARAM-01`）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-39-mssql-p1b-full-baseline.md`（§1 型別轉換清單、§3 `hashColumnType`/`TokenBlocklistService` 契約、§5 `ALL_ENTITIES` 寫法、§6 CURRENT_TIMESTAMP 清單）+ `apps/api/src/common/database/column-types.ts`（既有 5 helper：`dateColumnType`/`jsonColumnType`/`surrogatePkType`/`boolColumnType`/`uuidColumnType`/`longTextColumnType`，P1b1 新增 `hashColumnType`）+ `apps/api/src/database/__tests__/mssql-env-preload.ts`（gating helper，沿用）+ `apps/api/src/database/__tests__/mssql-p1a.mssql.spec.ts`（P1a 樣板，含已知失敗案例 `TS-MSSQL-P1A-CRUD-003b`，需於 P1b1 處置，見七、REG-003）+ `apps/api/src/database/entities/token-blocklist.entity.ts`／`apps/api/src/modules/auth/auth.service.ts`／`apps/api/src/common/guards/auth.guard.ts`（B1 三個修改點）+ `apps/api/src/app.module.ts`／`apps/api/src/worker-app.module.ts`（D1 修改點） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P1b1 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Gating 設計」章節 |

---

## 零、測試環境與 Gating 設計（延伸 P1a，不新增基礎設施）

### 0.1 沿用既有 gating helper，不新增檔案

`apps/api/src/database/__tests__/mssql-env-preload.ts`（`mssqlPortReachable()`/`restoreDbType()`/`SKIP_REASON`/`MSSQL` 連線常數）已於 P1a 建立，且已解決 P1a 遺留風險 **R-MSSQL-P1A-01**（`DB_NAME` 預設改為 `CDMP_TEST`，與 dev 用 `CDMP` 隔離）。P1b1 **直接沿用**，不需新增或修改此檔案。

### 0.2 SQL Schema 隔離：新建 `p1b1`（比照 P1a 之 `p1a`）

P1a 之 `mssql-p1a.mssql.spec.ts` 已建立「每個 `.mssql.spec.ts` 檔案使用專屬 SQL schema」慣例（`CREATE SCHEMA p1a` + 逐表 `DROP TABLE IF EXISTS` 清理）。P1b1 測試檔須採用**新的專屬 schema（建議 `p1b1`）**，與 P1a 之 `p1a` schema 並存不互相污染，兩份測試套件皆可獨立重跑。

### 0.3 全 37 表 synchronize 之逾時考量（新增於 P1a 之上）

P1a 之 `vi.setConfig({ testTimeout: 60000 })`（`feedback_pg_spec_parallel_timeout` 教訓）僅需覆蓋 4 表。P1b1 全 37 表 `synchronize:true` 於首次執行（含索引/FK 建立）預期耗時明顯更長，**建議 tdd-implementation 評估是否需要提高 `beforeAll` 專用 timeout**（例如 120000ms），而非僅沿用 P1a 的全域 60000ms 沒有實測驗證是否足夠——此為建議事項，非測試案例本身的斷言內容。

### 0.4 CHI 群組（二、）獨立於 ENTITY 群組（四、），可最先執行

依 AD §4.4「test-first」裁定，**CHI 群組不依賴 TYPE/ENTITY 群組是否完成**，可用測試檔內定義之拋棄式合成 probe 表（比照 P1a `TYPE-002`/`TYPE-003` 之 `queryRunner.createTable`/`dropTable` 模式）獨立對一個全新 MSSQL 容器執行，不需等待全 37 entity 型別修正或全表 synchronize 完成。**建議 tdd-implementation 將 CHI 群組排在實作順序最前面**，其結論（I-MSSQL-VARCHAR-ENCODING-01）直接決定 P1b1 其餘工作是否需要擴大範圍（AD §10.1 風險）。

---

## 一、CHI — F-4 中文編碼 smoke test（test-first 決策閘門，優先執行）

> **對應**：AD §4.4／§0 F-4／不變式 **I-MSSQL-VARCHAR-ENCODING-01**。
> **核心原則**：本群組**不預先假設**驗證結果為「相符」或「不符」——每個案例斷言的是「已取得確定性、可歸類的觀察結果」，其分支走向本身即為後續工作範圍的裁決依據（比照 P1a TYPE-001/002 之 Probe 設計哲學）。
> **測試替身**：使用測試檔內定義之拋棄式合成 probe 表（`schema p1b1`），型別為裸 `varchar`（非 `nvarchar`），**非** production entity 的一部分，測試結束即 `DROP TABLE`。

### TS-MSSQL-P1B1-CHI-001：varchar 欄位寫入「借新還舊」逐字元 round-trip
- **Related Requirement**：AD §4.4 步驟 1／F-4
- **Test Type**：Positive / Probe（真實 MSSQL，`Chinese_Taiwan_Stroke_BIN` collation）
- **Preconditions**：全新 MSSQL 容器可連線；建立 `varchar(20)` 拋棄式 probe 欄位
- **Steps**：以 TypeORM repository 或 raw `INSERT` 寫入字串 `'借新還舊'`（本專案 PROJECT_TP 關鍵衍生碼字面值，見 `feedback_scorecard_derived_code_traceability`）；`SELECT` 讀回
- **Expected Result**：讀回字串與寫入字串**逐字元完全相等**（`===`），無亂碼、無截斷、無問號替代字元（`?`/`�`）

---

### TS-MSSQL-P1B1-CHI-002：varchar 欄位寫入「中古車商」逐字元 round-trip（第二樣本，降低巧合風險）
- **Related Requirement**：AD §4.4 步驟 1／F-4
- **Test Type**：Positive / Probe
- **Steps**：同 CHI-001，改用第二組獨立字面值 `'中古車商'`（SALES_STS 關鍵衍生碼），與 CHI-001 使用**不同字元集合**（避免單一樣本恰好通過但其他 Big5 碼頁區段仍有問題而漏判）
- **Expected Result**：逐字元完全相等，與 CHI-001 之結論一致（同為相符或同為不符，不應一個過一個不過——若出現分歧，須視為更嚴重的訊號並在決策關卡中特別記錄）

---

### TS-MSSQL-P1B1-CHI-003：`LIKE '%借新還舊%'` 子字串查詢正確命中
- **Related Requirement**：AD §4.4「一魚兩吃」備註（同時驗證未來 raw SQL 引擎 `LIKE` 比對邏輯之編碼先行可行性）
- **Test Type**：Positive / Probe
- **Preconditions**：CHI-001 之 probe 資料已寫入
- **Steps**：對 probe 表執行 `SELECT * FROM p1b1.<probe> WHERE <col> LIKE '%借新還舊%'`
- **Expected Result**：查詢命中該筆資料（非僅儲存正確，比對邏輯——本專案大量業務規則依賴之 `LIKE '%關鍵字%'`——亦須正確，此為 CHI-001 儲存正確性之上一層驗證，兩者若有分歧屬更嚴重訊號）

---

### TS-MSSQL-P1B1-CHI-004（對照組）：BIN collation 下中文字串比較語意與既有 PostgreSQL 行為一致（非新風險，佐證維持現狀）
- **Related Requirement**：AD-E07-38 D-3.1（BIN collation 字串比較語意 byte-exact，與 PG `=` 行為一致）
- **Test Type**：Positive / Regression（對照組）
- **Steps**：寫入 `'借新還舊'` 與 `'借新還舊 '`（尾隨半形空白）兩筆；分別以 `=` 精確比對與 `ORDER BY` 排序
- **Expected Result**：`=` 比對兩者視為不同值（byte-exact，不 trim）；`ORDER BY` 結果為逐 byte 排序（非中文筆畫/拼音排序）——確認 varchar 中文儲存正確之餘，比較語意不因 varchar 而偏離既有 PG 行為預期

---

### TS-MSSQL-P1B1-CHI-DECISION-001（決策關卡）：依 CHI-001~004 結果記錄 I-MSSQL-VARCHAR-ENCODING-01 結論
- **Related Requirement**：AD §4.4 步驟 2/3／不變式 I-MSSQL-VARCHAR-ENCODING-01
- **Test Type**：Decision Gate（非傳統 pass/fail，為驗收流程關卡，比照 P1a TYPE-007 設計）
- **Steps**：彙整 CHI-001~004 之實測結果
- **Expected Result**（兩分支皆已定義，不會卡住後續進度）：
  - **若全數相符**：現行 `varchar` 宣告維持不變，**I-MSSQL-VARCHAR-ENCODING-01 記錄「已驗證相符」**；P1b1 其餘工作範圍不變（僅 §1 之 uuid/text/boolean/timestamp 47 處）。
  - **若任一不符（mojibake）**：裁定觸發「全面 `varchar`→`nvarchar` 轉換」（AD §4.4 步驟 3）。**此為 P1b1 完成後的即時決策點**，後續測試設計方向（本輪不寫，僅標出供未來 test-designer 接手）須涵蓋：
    1. 全庫 varchar 欄位盤點清單（波及面預估遠大於本輪 47 處總和，`ob_pool_data`/`ob_pool_data_list` 等寬表單表可達百餘欄，需一次性 codemod 而非逐檔手改，AD §10.1）；
    2. 比照本文件 TYPE-003（text helper 矩陣）之「helper 化後逐欄型別驗證」模式，新增 `varcharColumnType(length)` helper 後之全欄矩陣驗證；
    3. 因 `nvarchar` 每字元佔用位元組數為 `varchar` 兩倍，**須重新執行本文件七、PKWIDTH 群組**（900-byte 索引鍵掃描為動態查詢設計，會自動涵蓋此變化，見七、PKWIDTH-002 之設計動機）；
    4. dev DB 既有資料若已在 mojibake 狀態下寫入，需評估是否需要重新從來源 ETL 抽取（非單純欄位型別 `ALTER`，因既有位元組序列本身已損毀）；
    5. 交叉檢查 F098~F109 一系列 Stage 1/2 SQL 下推之 `LIKE`/`=` 中文比對邏輯（`stage1-sql-builder.ts` 等）於 nvarchar 化後是否仍等價。

---

## 二、TYPE — 全 37 Entity 型別轉換驗證（§1 全部 47 處 + F-1 4 處紅線）

> **核心原則**：本群組驗證 AD §1 表格列出之**全部**型別轉換點；具體 entity/欄位清單**以 AD-E07-39 §1 表格為唯一輸入來源**（本文件不重複抄錄 47 筆明細，避免與 AD 表格產生兩份清單漂移風險，比照 `feedback_spec_schema_gap_first` 教訓）。tdd-implementation 應直接以 §1 表格逐列產生測試資料陣列，對每一列執行下方矩陣測試之斷言邏輯。

### TS-MSSQL-P1B1-TYPE-001：uuid helper 全 18 處欄位 → `uniqueidentifier`（矩陣驗證）
- **Related Requirement**：AD §1（uuid 18 處／14 檔）；沿用 P1a 已鎖定之 `uuidColumnType='uniqueidentifier'`
- **Test Type**：Positive / Integration（真實 MSSQL，資料驅動）
- **Preconditions**：全 37 entity 已完成 §1 之 helper 替換並 synchronize
- **Steps**：對 AD §1 表格列出之全部 18 個 uuid 欄位（含 `assignment-run-snapshot.run_id`／`assignment-approval.approver_id`／`assignment-audit-log.actor_id`／`assignment-run.triggered_by`／`assignment-run-stage-log.run_id`／`ob-monthly-run-result.run_id`(PK) 等），逐一查詢 `sys.columns`/`INFORMATION_SCHEMA.COLUMNS.DATA_TYPE`
- **Expected Result**：全部 18 個欄位 `DATA_TYPE = 'uniqueidentifier'`，0 例外

---

### TS-MSSQL-P1B1-TYPE-002（回歸）：P1a 既有 uuid PK 產生策略裁決維持不變
- **Related Requirement**：P1a TYPE-007 決策結果（`User.id`/`PasswordResetToken.id` 之 `@PrimaryGeneratedColumn('uuid')` 維持裸字面值，不需改 helper）
- **Test Type**：Regression
- **Steps**：查詢 `users.id`／`password_reset_tokens.id` 之 `DATA_TYPE`
- **Expected Result**：仍為 `uniqueidentifier`（P1b1 對其餘 33 entity 的擴大載入不影響 P1a 既有 4 entity 之型別行為）

---

### TS-MSSQL-P1B1-TYPE-003：longText helper 全 17 處欄位 → `nvarchar(MAX)`（矩陣驗證）
- **Related Requirement**：AD §1（text 17 處／13 檔）；沿用 P1a 已鎖定之 `longTextColumnType='nvarchar'`/`longTextColumnLength='MAX'`
- **Test Type**：Positive / Integration（資料驅動）
- **Steps**：對 AD §1 表格列出之全部 17 個 text 欄位（含 `assignment-run.error_message`／`ob-pool-data.apmacc_memo`/`settle_src`／`ob-pool-data-list.apmacc_memo`/`settle_src`／`etl-pipeline.description` 等），逐一查詢 `DATA_TYPE` 與 `CHARACTER_MAXIMUM_LENGTH`
- **Expected Result**：全部 17 個欄位 `DATA_TYPE = 'nvarchar'` 且 `CHARACTER_MAXIMUM_LENGTH = -1`（即 `MAX`），**不得**為已棄用之 `'text'`

---

### TS-MSSQL-P1B1-TYPE-004：boolean helper 全 8 處欄位 → `bit`（矩陣驗證）
- **Related Requirement**：AD §1（boolean 8 處）；沿用 P1a 已鎖定之 `boolColumnType='bit'`
- **Test Type**：Positive / Integration（資料驅動）
- **Steps**：對 AD §1 表格列出之全部 8 個 boolean 欄位（含 `datasource-health-log.success`／`etl-pipeline-log.is_test_run`／`etl-pipeline.enabled`／`extraction-task.enabled`／`ob-list-definition.cr_enabled`／`pooldata-field-whitelist.is_active`/`is_system_fixed`／`pooldata-field-option.is_active`），逐一查詢 `DATA_TYPE`
- **Expected Result**：全部 8 個欄位 `DATA_TYPE = 'bit'`；寫入 JS `true`/`false` 讀回後仍為 JS boolean（driver 層自動轉換）

---

### TS-MSSQL-P1B1-TYPE-005（🔴 F-1 最高優先紅線）：4 處裸 `type:'timestamp'` 改 `dateColumnType` 後 → `datetime2`（非 `rowversion`）
- **Related Requirement**：AD §0 F-1／§1／P1b1 DoD #3（「timestamp bare→正確變 datetime2 而非 rowversion」）
- **Test Type**：Positive / Boundary（**核心紅線**，靜默地雷防線）
- **Preconditions**：`ob-assign-config.entity.ts:25`（`updated_at`）、`ob-arreturndf-min-cap.entity.ts:16`（`_cdmp_extracted_at`）、`assignment-run-stage-log.entity.ts:27,30`（`started_at`/`finished_at`）4 處已由裸 `'timestamp'` 字面值改為 `dateColumnType`
- **Steps**：查詢上述 4 個欄位之 `DATA_TYPE`
- **Expected Result**：**全部 4 個欄位 `DATA_TYPE = 'datetime2'`**；**明確斷言非 `'timestamp'`、非 `'rowversion'`**（MSSQL 字面值 `timestamp` 為 `rowversion` 舊式同義詞，唯讀 8-byte 二進位版本戳記——此為本案例存在的核心理由：驗證修復生效，而非單純「型別存在」的弱斷言）

---

### TS-MSSQL-P1B1-TYPE-006（🔴 F-1 全域守門，防止遺漏其他未知裸 timestamp 站點）：全 37 表 `sys.columns` 掃描，不得出現 `timestamp`/`rowversion` 型別
- **Related Requirement**：AD §0 F-1（風險等級「高」，因「不保證拋錯，可能靜默建出錯誤欄位」——此案例正是為此風險設計的全域安全網）
- **Test Type**：Positive / Guard（全表掃描，非僅 4 處已知站點）
- **Steps**：查詢 `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE DATA_TYPE IN ('timestamp','rowversion')`（限定 37 個業務表所在 schema）
- **Expected Result**：**0 筆命中**。此案例之設計動機：TYPE-005 僅驗證 AD 已知列舉的 4 處，本案例則是不依賴人工清單的全域掃描，可攔截任何 AD §1 表格遺漏或未來新增 entity 誤用裸 `'timestamp'` 字面值的情況（比照 PKWIDTH 群組「動態掃描優於寫死清單」設計哲學）

---

### TS-MSSQL-P1B1-TYPE-007（🔴 F-1 修復佐證）：修復後之 F-1 欄位可正確寫入/讀回 JS `Date` 物件
- **Related Requirement**：AD §0 F-1（「`rowversion` 唯讀、無法寫入 Date 值」——本案例以正面寫入驗證佐證修復真正生效，而非僅型別名稱正確）
- **Test Type**：Positive / Integration
- **Preconditions**：TYPE-005 已通過（型別確認為 `datetime2`）
- **Steps**：以 `assignment_run_stage_log.started_at`/`finished_at` 為代表，透過 `AssignmentRunStageLog` repository 寫入含毫秒之 `new Date(...)`；讀回比對
- **Expected Result**：寫入不拋例外（若欄位仍為 `rowversion`，TypeORM 嘗試寫入 JS `Date` 會直接拋型別轉換錯誤或被資料庫拒絕）；讀回之 `Date` 物件毫秒值與寫入值相等

---

### TS-MSSQL-P1B1-TYPE-008：兩處生產 `bigint` 欄位（`ob-assign-set.entity.ts`／`assignment-run-stage-log.entity.ts.id`）→ `bigint`
- **Related Requirement**：AD-E07-38 D-2（bigint 2 處／2 檔）；延伸 P1a 合成 probe（TYPE-003/CRUD-007）至正式 production 案例
- **Test Type**：Positive / Integration
- **Steps**：查詢兩欄位之 `DATA_TYPE`；寫入超過 `Number.MAX_SAFE_INTEGER` 之數值後讀回
- **Expected Result**：`DATA_TYPE = 'bigint'`；tedious driver 讀回為**字串**（非 JS number，避免精度流失，比照既有 `pg` driver 行為與 P1a TYPE-003/CRUD-007 之既有結論）

---

## 三、HASH — B1 正式裁定：`token_blocklist` 改用 Hash(Token) 作為 PK

> **對應**：AD §3／不變式 **I-MSSQL-HASH-DETERMINISM-01**／**I-MSSQL-PK-BYTELIMIT-01**／P1b1 DoD #5（「至少一次真實 JWT 撤銷流程端對端測試」，**DoD 核心紅線**）。
> **背景（P1a 已實測發現，非本輪新猜測）**：既有 `TS-MSSQL-P1A-CRUD-003b` 已於真實 MSSQL 容器驗證：`token_blocklist.token`（`nvarchar(2048)` clustered PK）於 mssql 因超過 900-byte 索引鍵上限，2048 字元 JWT 直接 INSERT 失敗。本群組驗證 B1（`token`→`token_hash binary(32)`）確實解決此問題，且不引入新的行為回歸。

### TS-MSSQL-P1B1-HASH-001（I-MSSQL-HASH-DETERMINISM-01）：`hashToken` 決定性——同輸入多次呼叫輸出相同
- **Related Requirement**：AD §3.3／不變式 I-MSSQL-HASH-DETERMINISM-01
- **Test Type**：Positive / Unit（純函式，無需 DB）
- **Steps**：以相同 JWT 字串呼叫 `hashToken()` 三次（同一程序內）
- **Expected Result**：三次輸出（`Buffer`）逐 byte 完全相等

---

### TS-MSSQL-P1B1-HASH-002：`hashToken` 輸出為 32-byte SHA-256 摘要，與參考實作一致
- **Related Requirement**：AD §3.3（`crypto.createHash('sha256').update(token,'utf8').digest()`）
- **Test Type**：Positive / Unit
- **Steps**：呼叫 `hashToken('sample-jwt-token')`；獨立以 Node `crypto` 模組計算同一字串之 SHA-256 摘要作為參考值
- **Expected Result**：`hashToken()` 輸出 `Buffer.length === 32`；與獨立計算之參考摘要逐 byte 相等（非重新實作邏輯本身，而是驗證輸出格式與演算法正確對應）

---

### TS-MSSQL-P1B1-HASH-003：不同輸入產生不同 hash（差異性 sanity check，非碰撞測試）
- **Related Requirement**：AD §3.4（「不需要 hash 碰撞測試，SHA-256 碰撞機率視為業務可接受風險」——本案例僅驗證基本可用性，非碰撞防護）
- **Test Type**：Positive / Unit
- **Steps**：對兩個不同字串（差異僅 1 字元）分別呼叫 `hashToken()`
- **Expected Result**：兩個輸出不相等（雪崩效應基本檢查，非密碼學強度驗證）

---

### TS-MSSQL-P1B1-HASH-004：`token_blocklist.token_hash` 型別 = `binary(32)`，欄名確認非 `token`
- **Related Requirement**：AD §3.1／§3.3（Entity 定義：`@PrimaryColumn({name:'token_hash', type:hashColumnType, length:hashColumnLength})`）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Steps**：查詢 `token_blocklist` 表之 `sys.columns`
- **Expected Result**：欄位名為 `token_hash`（**不存在**名為 `token` 之明文欄位，AD §3.3 刻意改名以 fail-loud）；`DATA_TYPE = 'binary'`，`CHARACTER_MAXIMUM_LENGTH = 32`

---

### TS-MSSQL-P1B1-HASH-005（I-MSSQL-PK-BYTELIMIT-01 正面驗證）：`token_hash` 32-byte PK 不受 900-byte 限制，長 JWT 可正常 INSERT
- **Related Requirement**：AD §2 結論（token_blocklist 為全庫唯一超限案例）／§3.1（binary(32) 索引鍵僅 32 bytes，遠低於 900）
- **Test Type**：Positive / Boundary（**與 P1a CRUD-003b 直接對照**）
- **Preconditions**：`TokenBlocklist` entity 已改為 `token_hash binary(32)` PK
- **Steps**：以一個 2048 字元（甚至更長）之合成 JWT 字串呼叫 `hashToken()` 取得 32-byte hash，寫入 `token_blocklist`
- **Expected Result**：INSERT **成功**（不拋出 P1a `CRUD-003b` 所見之「exceeds the maximum length」/「900 bytes」錯誤）——此案例即為 B1 修復生效的直接證據，且結果與 token 原始長度**完全無關**（32-byte 定長雜湊）

---

### TS-MSSQL-P1B1-HASH-006（既有測試遷移，非新設計）：`auth.service.spec.ts` + `auth.guard.spec.ts` 之 mock 斷言由 `token` 明文改為 `token_hash`
- **Related Requirement**：AD §3.4（「既有測試若直接斷言 token 等於原始 JWT 字串，改為斷言 token_hash 等於 hashToken(原始JWT) 結果」）
- **Test Type**：Regression（既有測試遷移）
- **範圍確認（已查證，非猜測）**：
  1. `apps/api/src/modules/auth/__tests__/auth.service.spec.ts`：`logout` 測試群組（約行 470-501，含「idempotent」案例）+ `isTokenRevoked` 測試群組（約行 504-520）之 `mockTokenBlocklistRepository.findOne.mockResolvedValue({ token: ... })` 需改為 `{ token_hash: ... }`；`logout()` 呼叫端寫入邏輯之 `repository.create({ token, ... })` 斷言需改為 `{ token_hash: hashToken(token), ... }`
  2. `apps/api/src/common/__tests__/auth.guard.spec.ts`：約行 143-159「should throw AUTH_TOKEN_REVOKED when token is in blocklist」案例之 `mockTokenBlocklistRepository.findOne.mockResolvedValue({ token: 'revoked-token' })` 需改為斷言 guard 內部以 `token_hash` 查詢（`findOne({ where: { token_hash: hashToken(rawToken) } })`）
- **Expected Result**：兩檔既有測試改寫後全綠；`AuthGuard.canActivate()` 與 `AuthService.logout()`/`isTokenRevoked()` 內部查詢/寫入邏輯一律經由 service 層單一入口點轉換為 hash（呼叫端不需知道底層已改 hash，AD §3.3）

---

### TS-MSSQL-P1B1-HASH-E2E-001（🔴 P1b1 DoD #5 核心紅線）：login → logout → 同 token 再次請求保護端點 → 401 TOKEN_REVOKED
- **Related Requirement**：P1b1 DoD #5（「`token_blocklist` 新結構通過至少一次真實 JWT 撤銷流程端對端測試」）
- **Test Type**：Positive / E2E（真實 MSSQL，比照 P1a LOGIN 群組樣板）
- **Preconditions**：MSSQL 容器可連線；已種子一筆 admin 帳號
- **Steps**：
  1. `POST /api/v1/auth/login` 取得合法 JWT
  2. 以該 JWT 呼叫任一受保護端點（如 `GET /api/v1/accounts/me` 或既有 smoke 端點）→ 應成功（200）
  3. `POST /api/v1/auth/logout`（帶該 JWT）
  4. 以**同一** JWT 再次呼叫步驟 2 之受保護端點
- **Expected Result**：步驟 2 為 200；步驟 4 為 **401**，錯誤碼 `TOKEN_REVOKED`（`AuthGuard` 查 `token_hash` 命中）

---

### TS-MSSQL-P1B1-HASH-E2E-002：長 JWT（模擬多 claim，明文長度接近/超過原 900-byte 限制）撤銷流程仍正確
- **Related Requirement**：B1 修復佐證（對照 P1a CRUD-003a「448 字元安全」與 CRUD-003b「2048 字元失敗」之既有邊界）
- **Test Type**：Boundary / E2E
- **Steps**：以含較多 claim（`businessRole`/`isSalesManager`/長 email 等）之真實 JWT（明文長度可能超過 900 bytes）執行 HASH-E2E-001 完整流程
- **Expected Result**：全流程正確（login→保護端點 200→logout→保護端點 401），**證明撤銷流程不再受 JWT 明文長度限制**（因索引鍵已改為定長 32-byte hash，與 token 原始長度脫鉤）

---

### TS-MSSQL-P1B1-HASH-E2E-003：未撤銷 token 正常通過 `AuthGuard`（避免誤傷）
- **Related Requirement**：Regression（B1 變更不得誤判正常 token 為已撤銷）
- **Test Type**：Negative（對照組）
- **Steps**：兩個不同使用者分別登入取得 JWT A／JWT B；僅撤銷 JWT A；以 JWT B 呼叫受保護端點
- **Expected Result**：JWT B 請求成功（200），確認 `token_hash` 查詢精確比對（非誤傷其他未撤銷 token 或全域封鎖）

---

### TS-MSSQL-P1B1-HASH-E2E-004：`logout` 冪等——同一 token 呼叫兩次不重複寫入/不拋錯
- **Related Requirement**：AD §3.4 既有邏輯遷移（既有「idempotent」單元測試行為於 hash 化後語意不變）
- **Test Type**：Positive / Integration
- **Steps**：以同一 JWT 連續呼叫 `POST /api/v1/auth/logout` 兩次
- **Expected Result**：兩次皆回 200（或既有語意的成功回應）；`token_blocklist` 表中該 `token_hash` 僅有 1 筆紀錄（`findOne` 存在性檢查 + 條件式 INSERT 邏輯不因欄位改名/型別改變而破壞）

---

### TS-MSSQL-P1B1-HASH-REG-001：`hashColumnType`/`hashColumnLength` 三分支純函式回傳值正確
- **Related Requirement**：AD §3.1（`mssql='binary'`／`sqlite='blob'`／`postgres='bytea'`）
- **Test Type**：Unit / Regression
- **Steps**：分別以 `DB_TYPE=mssql`/`sqlite`/`postgres` 匯入 `column-types.ts`，讀取 `hashColumnType`/`hashColumnLength`
- **Expected Result**：`mssql`→`'binary'`+`32`；`sqlite`→`'blob'`+`undefined`；`postgres`→`'bytea'`+`undefined`

---

### TS-MSSQL-P1B1-HASH-REG-002：sqlite／postgres 既有登入/登出/撤銷 e2e 全綠，不因欄位改名/型別改變回歸
- **Related Requirement**：AD §3.2（「三個 driver 一致改 hash，不做 driver-conditional 分岔」——理由 3 之一即避免兩套程式碼路徑，故 sqlite/postgres 亦必須改動且必須驗證不回歸）
- **Test Type**：Regression（三 driver 一致性）
- **Steps**：以 `DB_TYPE=sqlite` 與 `DB_TYPE=postgres`（既有 `test/auth.e2e-spec.ts` 與既有 pg 套件之對應案例，如涉及 logout）分別重跑 HASH-E2E-001 之流程
- **Expected Result**：三個 driver（sqlite/postgres/mssql）之登入→登出→撤銷後拒絕行為**完全一致**（僅底層儲存格式不同：明文欄位改 hash 欄位，對外可觀察行為零差異）

---

## 四、ENTITY — D1 全 37 Entity 載入 + I-MSSQL-ENTITY-LIST-PARITY-01

> **背景（已查證現況，非假設）**：`app.module.ts`／`worker-app.module.ts` 之 mssql 分支目前**仍**硬寫 `entities: [User, Role, TokenBlocklist, PasswordResetToken]`（P1a 過渡態，程式碼註解已明確標註「P1a 過渡態」）；`data-source.ts`（CLI-only）本身以 glob 載入（`entities/*.entity.{ts,js}`），**不受此問題影響**，故 D1 修法範圍僅涉及 `app.module.ts`（改為 `ALL_ENTITIES` 顯式陣列，供 sqlite/mssql/postgres 三分支共用）與 `worker-app.module.ts`（mssql 分支應改回引用既有 glob `entities` 變數，與 sqlite/postgres 分支一致，而非另外硬寫 4-entity 陣列）。

### TS-MSSQL-P1B1-ENTITY-001：`app.module.ts` mssql 分支 synchronize 建出全 37 張表（非僅 P1a 之 4 張）
- **Related Requirement**：AD §5／P1b1 DoD #2
- **Test Type**：Positive / Integration（真實 MSSQL，**刻意與 P1a `CONN-004` 斷言相反**——此為有意擴大範圍，非回歸）
- **Steps**：以 `DB_TYPE=mssql` 啟動含 `ALL_ENTITIES` 之 `TypeOrmModule`，`synchronize:true`；查詢 `INFORMATION_SCHEMA.TABLES`
- **Expected Result**：恰好 37 張使用者資料表（含 `token_blocklist` 之新結構）；**明確記錄**此結果與 P1a `TS-MSSQL-P1A-CONN-004`（斷言恰 4 表）呈現相反結果，屬 P1b1 有意擴大範圍後的**新基準**，非回歸（P1a 該案例已於 P1a 範圍內完成其歷史使命）

---

### TS-MSSQL-P1B1-ENTITY-002：完整 `AppModule` 啟動，各業務模組 `forFeature` 全數解析成功
- **Related Requirement**：AD §5 驗收方式 #1／P1b1 DoD #1
- **Test Type**：Positive / Integration
- **Steps**：以 `DB_TYPE=mssql` 啟動**完整** `AppModule`（非 P1a 之 auth-only slice），涵蓋 `AssignmentModule`/`AssignmentStageModule`/`AssignmentListModule`/`AssignmentScoringModule`/`EtlModule`/`ExtractionTaskModule`/`PooldataFieldModule`/`SystemModule`/`C360Module`/`RolesModule`/`DatasourceModule`/`OrphanRecoveryModule`/`SchedulerModule` 等全部模組
- **Expected Result**：`app.init()` 不拋例外；所有模組之 `TypeOrmModule.forFeature([...])` 皆能成功解析對應 entity（無 `EntityMetadataNotFoundError` 等 DI 解析錯誤）

---

### TS-MSSQL-P1B1-ENTITY-003：`WorkerAppModule` mssql 分支載入全 37 entity，`AssignmentWorkerModule` 成功注入
- **Related Requirement**：AD §5 驗收方式 #2／P1b1 DoD #1
- **Test Type**：Positive / Integration
- **Steps**：以 `DB_TYPE=mssql` 建構 `WorkerAppModule`；驗證依賴 `AssignmentRun`/`AssignmentRunSnapshot`/`AssignmentRunStageLog` 等 entity 之 `AssignmentWorkerModule` 成功初始化
- **Expected Result**：不拋例外；`DataSource.isInitialized === true`；worker 分支（glob 載入）與 app 分支（`ALL_ENTITIES` 陣列）之 entity 集合**元素數量一致**（37），不因載入方式不同產生集合差異

---

### TS-MSSQL-P1B1-ENTITY-004（I-MSSQL-ENTITY-LIST-PARITY-01 靜態守門）：三個 TypeORM 設定點之 mssql 分支不得各自維護獨立 entity 子集清單
- **Related Requirement**：不變式 I-MSSQL-ENTITY-LIST-PARITY-01
- **Test Type**：Static Gate（Grep / 原始碼結構檢查）
- **Steps**：
  1. 靜態掃描 `app.module.ts`：mssql 分支之 `entities:` 陣列**必須**與 sqlite/postgres 分支引用**同一個變數**（如 `ALL_ENTITIES`），而非各自獨立的字面量陣列
  2. 靜態掃描 `worker-app.module.ts`：mssql 分支**不得**另外硬寫 entity 陣列字面量，須直接使用該檔案既有之 `entities`（glob）變數，與 sqlite/postgres 分支寫法一致
  3. 確認 `data-source.ts` 維持 glob 載入，postgres/mssql 兩分支共用同一 `commonOptions.entities`
- **Expected Result**：三個設定點各自的三個 dialect 分支，其 entity 清單來源均為單一變數（顯式陣列）或天然共用（glob）；0 處重複硬寫子集清單

---

### TS-MSSQL-P1B1-ENTITY-005（回歸）：sqlite in-memory／postgres 既有分支之 entity 集合不因本次調整而減少或改變
- **Related Requirement**：Regression（AD §1「不引入任何業務行為變更」前提）
- **Test Type**：Regression
- **Steps**：比對 D1 修法前後，`app.module.ts` sqlite 分支與 postgres 分支各自載入之 entity 陣列內容（名稱集合）
- **Expected Result**：修法前後完全相同（37 個 entity，含既有測試已依賴之集合），既有 F098~F109 一系列 `.pg.spec.ts` 套件與 sqlite e2e 套件不受影響

---

### TS-MSSQL-P1B1-ENTITY-006：37 張表零錯誤 synchronize，`sys.tables` 計數精確 = 37（排除系統表雜訊）
- **Related Requirement**：P1b1 DoD #2（「`synchronize:true` 建出全 37 entity 對應表，零錯誤」）
- **Test Type**：Positive / Integration（**P1b1 headline DoD**）
- **Steps**：全新空白 `p1b1` schema 執行一次 `synchronize:true`；查詢 `sys.tables`（限定該 schema，排除 MSSQL 系統表）
- **Expected Result**：**恰好 37 張**使用者資料表，與 AD §1「未列出、確認無需改動」14 個 entity + 表格列出 23 個需改動 entity 之總數一致；synchronize 過程 0 例外（含索引/FK/複合鍵/`assignment_run_stage_log` 之 unique composite index 皆正確建立）

---

## 五、DEFAULT — `CURRENT_TIMESTAMP` default smoke（§6 6 檔 8 欄）

> **對應**：AD §6 步驟 3 人工稽核清單項目「`default:()=>'CURRENT_TIMESTAMP'`（6 處）：T-SQL 原生支援... 列入 P1b1 smoke test 一併驗證」。**實際欄位數為 8**（`assignment_approval` 有 2 處、`ob_monthly_run_result` 有 2 處），已逐檔查證。

### TS-MSSQL-P1B1-DEFAULT-001：8 個 `CURRENT_TIMESTAMP` 欄位於 INSERT 不提供值時由資料庫自動填入
- **Related Requirement**：AD §6 步驟 3
- **Test Type**：Positive / Integration
- **Preconditions**：全 37 表已 synchronize
- **Steps**：對以下 8 個欄位分別執行 INSERT（不提供該欄位值）：`ob_assign_config.updated_at`／`ob_monthly_run_result.created_at`／`ob_monthly_run_result.updated_at`／`assignment_run_snapshot.created_at`／`assignment_approval.approved_at`／`assignment_approval.created_at`／`assignment_audit_log.created_at`／`assignment_run.created_at`
- **Expected Result**：全部 8 個欄位皆由資料庫自動填入非 NULL 之目前時間（T-SQL `CURRENT_TIMESTAMP` 作為 ODBC/ANSI 相容關鍵字，等同 `GETDATE()`，不需改寫）

---

### TS-MSSQL-P1B1-DEFAULT-002：資料庫端自動填入之時間戳與應用程式時區語意跨 driver 一致
- **Related Requirement**：Regression（`feedback_typeorm_between_timezone` 教訓：避免 Date 物件跨時區比較誤判邊界）
- **Test Type**：Positive / Boundary
- **Steps**：以其中一欄位（如 `assignment_run.created_at`）為代表，插入後立即讀回，與應用程式端 `new Date()` 取得之時間比對誤差範圍
- **Expected Result**：誤差在合理秒級容差內（非日期偏移級的時區錯誤）；不因 mssql `CURRENT_TIMESTAMP` 產生時間戳的方式與 sqlite/postgres 分支（`dateColumnType` 預設值行為，若有對應）產生語意分歧

---

## 六、CASE／COLLATE — 全表大小寫與 Collation 一致性守門

> **對應**：AD §6 步驟 3「大小寫一致性守門 + collation 一致性掃描」；擴大 P1a 之 4 表驗證範圍至全 37 表（不變式 **I-MSSQL-CASE-01**／**I-MSSQL-COLLATE-01**）。

### TS-MSSQL-P1B1-CASE-001：全 37 表 `sys.tables` 名稱皆為小寫
- **Related Requirement**：I-MSSQL-CASE-01
- **Test Type**：Positive / Guard
- **Steps**：查詢全 37 表之 `sys.tables.name`
- **Expected Result**：全部符合 `^[a-z_]+$`，0 例外（P1a CASE-001 之全量版本，含 P1a 未涵蓋之 33 個業務表）

---

### TS-MSSQL-P1B1-CASE-002：全 37 表所有欄位 `sys.columns` 名稱皆為小寫 snake_case
- **Related Requirement**：I-MSSQL-CASE-01
- **Test Type**：Positive / Guard
- **Steps**：查詢全 37 表之全部 `sys.columns.name`
- **Expected Result**：全部符合 `^[a-z_]+$`，0 例外

---

### TS-MSSQL-P1B1-COLLATE-001（I-MSSQL-COLLATE-01）：`sys.columns.collation_name` 全表全欄一致為 `Chinese_Taiwan_Stroke_BIN`
- **Related Requirement**：AD-E07-38 D-3.4／不變式 I-MSSQL-COLLATE-01
- **Test Type**：Positive / Guard
- **Preconditions**：資料庫建立時已於 `CREATE DATABASE` 層級指定 collation
- **Steps**：查詢 `SELECT DISTINCT collation_name FROM sys.columns WHERE collation_name IS NOT NULL`（限定 37 個業務表）
- **Expected Result**：**唯一一種值** `'Chinese_Taiwan_Stroke_BIN'`（字串型別欄位皆繼承一致，無跨欄位 collation 衝突之可能）

---

### TS-MSSQL-P1B1-COLLATE-002：無任何欄位層級 `COLLATE` 子句殘留
- **Related Requirement**：AD-E07-38 D-3.3（「Collation 設定層級 = CREATE DATABASE，非逐欄 COLLATE」）
- **Test Type**：Positive / Guard（草稿 DDL 稽核）
- **Steps**：檢視 `synchronize:true` 產生之草稿 DDL（或以 `migration:generate` 取得草稿），掃描是否含逐欄 `COLLATE` 子句
- **Expected Result**：草稿 DDL 不含任何欄位層級 `COLLATE` 子句，確認皆繼承資料庫層級設定（此為 §6 步驟 3 人工稽核清單之明確驗證，供 P1b2 baseline migration 定案前參考）

---

## 七、PKWIDTH — I-MSSQL-PK-BYTELIMIT-01 全表索引鍵寬度守門

> **對應**：不變式 **I-MSSQL-PK-BYTELIMIT-01**（「新增欄位時須重新計算，不得假設以前沒事就一直沒事」）。AD §2 已用人工估算全表位元組寬度並結論「僅 token_blocklist 超限」，但**人工估算不具備長期防禦力**——本群組設計為**動態查詢守門測試**，取代人工試算表，未來任何 entity 新增 PK/unique index 欄位皆會自動被此測試涵蓋。

### TS-MSSQL-P1B1-PKWIDTH-001：通用查詢掃描全 37 表 PK/unique index 實際位元組寬度，全數 ≤ 900(clustered)/1700(nonclustered)
- **Related Requirement**：I-MSSQL-PK-BYTELIMIT-01／AD §2 結論驗證
- **Test Type**：Positive / Guard（動態掃描，非寫死清單）
- **Steps**：以 `sys.indexes` JOIN `sys.index_columns` JOIN `sys.columns` 動態計算全 37 表每個 PK（`is_primary_key=1`）與 unique nonclustered index（`is_unique=1`）之欄位總位元組寬度（依 `max_length`/型別加總，`nvarchar`/`nchar` 以 2 bytes/字元計、`varchar`/`char` 以 1 byte/字元計、定長型別依 `max_length` 原值）
- **Expected Result**：clustered PK（含 `token_blocklist` 新結構 `token_hash binary(32)` = 32 bytes）全數 ≤ 900 bytes；nonclustered unique index（如 `assignment_run_stage_log` 之 `(run_id, stage_no)` = 16+2=18 bytes）全數 ≤ 1700 bytes；驗證結果與 AD §2 表格人工估算結論一致（僅 B1 修復前的 token_blocklist 曾超限，修復後全數合格）

---

### TS-MSSQL-P1B1-PKWIDTH-002：本守門測試具動態掃描特性，非寫死表格（設計品質驗證）
- **Related Requirement**：I-MSSQL-PK-BYTELIMIT-01（「不得假設以前沒事就一直沒事」——本案例驗證測試本身的可持續防禦性）
- **Test Type**：Meta / Design Verification
- **Steps**：檢視 PKWIDTH-001 之實作，確認其邏輯來源為 `sys.indexes`/`sys.index_columns`/`sys.columns` 之即時查詢，**而非**寫死 AD §2 表格中列舉的 entity 名稱清單
- **Expected Result**：未來任何新增 entity 或既有 entity 新增 PK/unique index 欄位，**不需修改本測試程式碼**即會被自動掃描並驗證；此設計亦直接呼應 CHI-DECISION-001 之後續動作 3（若 F-4 判定需要 varchar→nvarchar 全面轉換，nvarchar 欄寬加倍後，本測試會自動重新驗證所有索引鍵是否仍在門檻內，不需要人工重算 AD §2 表格）

---

## 八、REG — 跨分支回歸與型別檢查閘

### TS-MSSQL-P1B1-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：`feedback_vitest_no_typecheck`（vitest 不做型別檢查，需另跑 tsc 避免 prod build 掛掉）
- **Test Type**：Static Gate
- **Steps**：執行 `tsc --noEmit -p tsconfig.build.json`
- **Expected Result**：0 錯誤（含新增 `hashColumnType`/`hashColumnLength`/`ALL_ENTITIES` 之型別簽章正確；`TokenBlocklist.token_hash: Buffer` 型別變更後所有呼叫端型別正確）

---

### TS-MSSQL-P1B1-REG-002：既有 sqlite/postgres 套件（含 F098~F109 一系列 `.pg.spec.ts`）不因本次調整回歸
- **Related Requirement**：Regression（AD §1「不引入任何業務行為變更」前提）
- **Test Type**：Regression（既有套件全量重跑）
- **Steps**：重跑既有 sqlite e2e（`test/auth.e2e-spec.ts` 等）與既有 `.pg.spec.ts` 全套件（F098/F099/F100/F101/F102/F103/F104/F108/F109 等）
- **Expected Result**：全數維持既有綠燈狀態（除 P1a/P1b1 明確記錄之既有 pre-existing baseline 失敗，如 `ObEmphireRepository DI` 相關，與本次無關者不計入）

---

### TS-MSSQL-P1B1-REG-003（P1a 既有案例處置，避免遺留矛盾案例）：`TS-MSSQL-P1A-CRUD-003b` 於 B1 修復後之淘汰標記
- **Related Requirement**：Regression（測試套件自我一致性）
- **Test Type**：Meta / Housekeeping
- **背景**：`mssql-p1a.mssql.spec.ts` 現有 `TS-MSSQL-P1A-CRUD-003b`（「2048 字元 token 作為 clustered PK 超過 mssql 900-byte 索引鍵上限而 INSERT 失敗」）之測試對象為**改名前**的 `TokenBlocklist.token`（`nvarchar(2048)` PK）。B1 完成後該欄位已不存在（改名為 `token_hash binary(32)`），此案例若原封不動保留於 `mssql-p1a.mssql.spec.ts`，將因參照已不存在的 `token` 欄位而編譯/執行失敗，形成遺留矛盾案例
- **Steps**：tdd-implementation 於 B1 落地時，應將 `TS-MSSQL-P1A-CRUD-003b` 改為以下其一：(a) 移除並於本文件 HASH-005 取代其驗證意圖（**建議採此方案**，因 HASH-005 已完整涵蓋「原問題不再發生」之正面驗證）；(b) 保留但明確改寫為「歷史回歸註記」型態，斷言新結構下相同資料量不再拋錯（即退化為 HASH-005 的重複）
- **Expected Result**：`mssql-p1a.mssql.spec.ts` 全檔可正常編譯執行，不因 B1 之 entity 改動而產生因欄位不存在導致的編譯錯誤或誤導性測試案例

---

### TS-MSSQL-P1B1-REG-004（I-MSSQL-HELPER-SCOPE-01 延伸）：全 37 entity 內無重複 `process.env.DB_TYPE` 條件判斷
- **Related Requirement**：I-MSSQL-HELPER-SCOPE-01
- **Test Type**：Static Gate（Grep，P1a HELPER-001 之全量延伸）
- **Steps**：靜態掃描全 37 個 `*.entity.ts` 檔案，搜尋 `process.env.DB_TYPE`
- **Expected Result**：0 命中（P1a 僅驗證 4 個 auth entity，本案例延伸至全 37 個，確保 §1 之 47 處型別轉換全數透過 `column-types.ts` helper 匯入，無任何 entity 內重複寫條件判斷）

---

## 九、Traceability Matrix（P1b1 DoD ↔ 不變式 ↔ 測試案例）

| P1b1 DoD 項目（AD §8） | 對應不變式 | 對應測試案例 |
|---|---|---|
| #1 `DB_TYPE=mssql` 啟動完整 `AppModule`/`WorkerAppModule` 成功 | I-MSSQL-ENTITY-LIST-PARITY-01 | ENTITY-002、ENTITY-003 |
| #2 `synchronize:true` 建出全 37 entity 對應表，零錯誤 | — | ENTITY-001、ENTITY-006 |
| #3 `sys.columns` 查詢確認全部欄位型別符合 §1 預期 | — | TYPE-001~008 |
| #4 中文編碼 smoke test 結果明確記錄 | I-MSSQL-VARCHAR-ENCODING-01 | CHI-001~004、CHI-DECISION-001 |
| #5 `token_blocklist` 新結構通過真實 JWT 撤銷流程端對端測試 | I-MSSQL-HASH-DETERMINISM-01、I-MSSQL-PK-BYTELIMIT-01 | HASH-001~006、HASH-E2E-001~004 |
| #6 I-MSSQL-CASE-01 + collation 一致性守門測試通過 | I-MSSQL-CASE-01、I-MSSQL-COLLATE-01 | CASE-001/002、COLLATE-001/002 |
| （跨案通用）§6 步驟 3 人工稽核清單之 `CURRENT_TIMESTAMP` 一項 | — | DEFAULT-001/002 |
| （跨案通用）§2 900-byte 掃描結論之長期防禦 | I-MSSQL-PK-BYTELIMIT-01 | PKWIDTH-001/002 |
| （跨案通用）不引入業務行為變更 | — | ENTITY-005、HASH-REG-001/002、REG-001~004 |

**P1b1 範圍明確不涵蓋之項目**（由 P1b2/P1b3/P1c 各自測試設計覆蓋，此處僅記錄邊界，避免誤判遺漏）：

| 項目 | 歸屬階段 | 原因 |
|---|---|---|
| I-MSSQL-BASELINE-PARITY-01（dev synchronize vs prod baseline migration 結構化 diff） | P1b2 | 需先產出手寫 T-SQL baseline migration，P1b1 僅有 synchronize 路徑 |
| `fn_calc_tier_level` 不建立之最終驗證 | P1b2 | 沿用既有裁定（AD-E07-38 已裁定不建立），P1b2 於 baseline migration 產出時一併驗證 `OBJECT_ID(...)` 應回 NULL |
| bootstrap/seed 三支腳本改寫（`seed-datasource.ts`/`prod-data-seed.ts`/`seed.ts`）+ 冪等性驗證 | P1b3 | AD §7 明確歸屬 P1b3；P1b1 完全不涉及 seed 腳本 |
| `sp_getapplock` / Pattern B（`$n`→named param） | P1c | I-MSSQL-LOCK-01／I-MSSQL-PARAM-01，AD-E07-38 §3 D-5/D-6 明確歸屬 P1c |

---

## 十、測試替身（Mocks / Stubs / Test Doubles）說明

- **CHI 群組之拋棄式 probe 表**：測試檔內定義之合成表（`schema p1b1`），非 production entity，測試結束即 `DROP TABLE`。用途：驗證 varchar 中文編碼行為，不依賴 P1b1 其餘 entity 型別修正是否完成（可最先執行，比照 P1a TYPE-002/003 之既有模式）。
- **HASH-001~003 之純函式單元測試**：`hashToken()` 不需真實 DB 連線，直接以 vitest 呼叫驗證（Unit 層級，加速回饋）；HASH-004 以降之案例才需真實 MSSQL 容器。
- **HASH-E2E 群組**：比照 P1a LOGIN 群組樣板（`Test.createTestingModule` + `supertest`），不 mock 任何應用邏輯層，屬真實 MSSQL 容器之端對端測試；`AuthGuard`/`AuthService` 皆為真實實例，僅 DB 為真實 MSSQL。
- **ENTITY-002 之完整 `AppModule` 啟動**：不 mock 任何模組（與 P1a 刻意限定 auth-only slice 相反，P1b1 之核心驗收目的即「完整啟動」，Mock 任何模組將使此驗證失去意義）。

---

## 十一、命名鎖定（避免下游 agent 擅自改名，比照 `feedback_tdd_naming_drift` 教訓）

- Schema 隔離慣例：`p1b1`（比照 P1a 之 `p1a`，兩者並存不衝突）
- 新增第 5 個 helper（AD §3.1 已鎖定）：`hashColumnType` / `hashColumnLength`（**不得**另創他名如 `tokenHashType`）
- 純函式命名（AD §3.3 已鎖定）：`hashToken(token: string): Buffer`
- Entity 欄位改名（AD §3.3 已鎖定，刻意非沿用舊名）：`TokenBlocklist.token` → `TokenBlocklist.token_hash`（型別 `Buffer`）
- D1 顯式陣列建議命名（AD §5 pseudocode 已使用）：`ALL_ENTITIES`（供 `app.module.ts` 三分支共用；`worker-app.module.ts` 維持既有 glob `entities` 變數名稱不變，僅移除 mssql 分支之額外硬寫陣列）
- 既有 5 個 helper（P1a 已建立，P1b1 沿用不重複定義）：`dateColumnType`／`jsonColumnType`／`surrogatePkType`／`boolColumnType`／`uuidColumnType`／`longTextColumnType`／`longTextColumnLength`
- Gating helper／SKIP_REASON／`.env.test.mssql`：完全沿用 P1a 既有命名，不新增

---

## 更新紀錄

| 日期 | 變更內容 |
|------|---------|
| 2026-07-07 | 初版建立：AD-E07-39 P1b1 測試設計，43 個測試案例（CHI 5 + TYPE 8 + HASH 12 + ENTITY 6 + DEFAULT 2 + CASE/COLLATE 4 + PKWIDTH 2 + REG 4）+ Traceability Matrix + 測試環境/Gating 設計（沿用 P1a 基礎設施，新增 `p1b1` schema 隔離慣例）。核心紅線：TYPE-005/006/007（F-1 rowversion 靜默地雷防線）+ CHI-DECISION-001（F-4 test-first 決策閘門，含「若不符」後續測試設計方向）+ HASH-E2E-001（B1 JWT 撤銷流程端對端 DoD）+ PKWIDTH-001/002（I-MSSQL-PK-BYTELIMIT-01 動態守門，取代人工試算）。已處置 P1a 既有案例 `TS-MSSQL-P1A-CRUD-003b` 因 B1 欄位改名產生之遺留矛盾（REG-003）。 |
