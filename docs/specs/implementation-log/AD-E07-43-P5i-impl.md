---
type: implementation-log
feature_id: AD-E07-43-P5i
feature_name: MSSQL 遷移 P5i — 中文顯示欄 varchar→nvarchar
status: complete
last_updated: 2026-07-08
---

# AD-E07-43 P5i：中文顯示欄 varchar→nvarchar — Implementation Log

對應裁定：`AD-E07-43-mssql-p5-ci-signoff.md` §9、不變式 **I-MSSQL-NVARCHAR-DISPLAY-01**。
定位：非 cutover-blocker，不影響核心 10 欄計分/CR/分派結果；修復 legacy nvarchar 顯示欄於 MSSQL BIN collation 下之 byte-length 截斷風險。

## 測試結果摘要

| Scenario / 群組 | 說明 | 狀態 |
|---|---|---|
| REG-002（mssql-p1a-unit）| `nvarcharColumnType` 於 sqlite/postgres='varchar'、mssql='nvarchar' | PASS（10/10） |
| P5i SCHEMA-001 | ob_emphire 顯示欄=nvarchar、代碼欄維持 varchar（真 MSSQL INFORMATION_SCHEMA）| PASS |
| P5i SCHEMA-002 | ob_pool_data 顯示欄=nvarchar；legacy varchar 對照組(dlr_name/brnh_name/prod_kind_name)維持 varchar；PK/代碼欄維持 varchar | PASS |
| P5i ROUNDTRIP-001 | 45 個中文字寫入 nvarchar(50) → 讀回完整 45 字不截斷（真 MSSQL）| PASS |
| P5i CONTRAST-001 | 同 45 中文字寫入 varchar(50) BIN → 溢位截斷錯誤（證明未修法之真實風險）| PASS |
| mssql-p1b1（CRUD/型別）| 既有 MSSQL entity 型別/CRUD 全數 | PASS（39/39）|
| **mssql-p1b2（BASELINE PARITY）** | **synchronize(entity) ↔ baseline migration 逐欄結構等價** | **PASS（43/43）** |
| mssql-p1b3（seed/bootstrap/revert）| 一鍵 bootstrap + revert 全流程 | PASS（50/50）|
| Stage1 / Stage2~4 / Stage3~4 / CR pushdown（真 MSSQL）| 計分/比例/CR 逐列等價 DoD | PASS（206/206）|

真 MSSQL 容器（cdmp-mssql，SQL Server 2022，Chinese_Taiwan_Stroke_BIN）實測，非 skip。

## 交付物

### 1. `nvarcharColumnType` dialect-aware helper
`apps/api/src/common/database/column-types.ts` 新增：
```ts
export const nvarcharColumnType: ColumnType =
  process.env.DB_TYPE === 'mssql' ? 'nvarchar' : 'varchar';
```
- mssql → `'nvarchar'`（Unicode 安全）；postgres / sqlite → `'varchar'`（與現行 literal `'varchar'` **逐值等價 → 零回歸**）。
- 用法比照既有 `longTextColumnType`：`@Column({ type: nvarcharColumnType, length: N })`，length 由 @Column 選項承載。

### 2. 產生器 `parse-ob-schema.mjs::mapType()` 修正
- 保留 legacy **逐欄 nvarchar vs varchar 區分**（不再一律收斂為 `'varchar'`）：來源 `nvarchar(N≤255)` 標記 `isNvarchar`，entity 模式輸出 `type: nvarcharColumnType`（並自動補 import）；來源 `varchar(N≤255)` 維持 literal `'varchar'`。
- `nvarchar(MAX)/varchar(N>255)` 維持 `text`（entity 端既走 `longTextColumnType` → mssql=nvarchar(MAX)，本就 Unicode 安全）。
- migration 陣列模式對 nvarchar 欄加 `← nvarchar` 註記（供手寫 MSSQL baseline 稽核）。

### 3. 完整 nvarchar 欄清單（機械掃描全部來源 DDL）
機械掃描 14 個 `ob_*` entity 對應之 legacy DDL，`nvarchar(N≤255)` 候選共 **140 欄**：

| entity | 來源 DDL | 候選 nvarchar 數 |
|---|---|---|
| ob_pool_data | OBPOOLDATA.sql | 58 |
| ob_pool_data_list | OBPOOLDATA_LIST.sql | 60 |
| ob_emphire | OBEMPHIRE.sql | 4 |
| ob_code_df | OBMCODEDF.sql | 11 |
| ob_dept_pct | OBMDEPTPCT.sql | 1 |
| ob_empl_set | OBEMPLSETMF.sql | 1 |
| ob_tier | OBTIER.sql | 1 |
| ob_list_definition | OBMLISTDF.sql | 4 |
| ob_calendar / ob_levelcard_version/column/level/score / ob_arreturndf_min_cap | — | 0 |

### 4. 實際套用（display-only，72 欄）— 見「範圍決策」
自 140 候選移除 68 個 PK/join/decision key/純 ASCII 代碼欄後，套用 **72 個中文自由文字顯示欄**（entity + baseline migration 同步）：

| entity | 轉換數 | 轉換欄位 |
|---|---|---|
| ob_pool_data | 27 | cust_name, sta_code_na, project_tp, spec_name, dept_name, pay_resouc, commute, cycle_pay_na, pay_way_na, broker, broker_agent, sales, promoter_dept, promoter, brand_name, car_name, spec_mk_na, spec_type_na, sales_sts_na, per_info, prod_type_name, prod_class_name, coll_empl, car_model, pay_user, pay_add, memo1 |
| ob_pool_data_list | 28 | （同上 27）＋ cr_nm |
| ob_emphire | 4 | emp_nm, dept_name, title_name, jfun_nm |
| ob_code_df | 8 | tbl_desc1, tbl_desc2, tbl_val3~8 |
| ob_dept_pct | 1 | obdeptnm |
| ob_empl_set | 0 | （deptid_m 為 PK/key，保留 varchar）|
| ob_tier | 1 | list_nm |
| ob_list_definition | 3 | list_nm, name, caseyearnm |

保留為 varchar（PK/join/decision key/純 ASCII 代碼，共 68 欄）代表例：orgno, appl_no, custo_no, list_no, dept_id, sta_code, spec_no, sales_no, emplid, system_id/tbl_id/tbl_cd, casenumber, deptid_m…。
**legacy 本就 varchar（AD §9.3 對照組）之 dlr_name / brnh_name / prod_kind_name 正確維持 varchar，未誤轉。**

### 5. Baseline 更新方式＋理由
- **直接改 MSSQL baseline migration**（`migrations/mssql/1751884800000-MssqlBaselineSchema.ts`）之 CREATE TABLE T-SQL：受影響欄 `varchar(N)` → `nvarchar(N)`，**非**新增 ALTER COLUMN migration。
- 理由：(a) MSSQL 尚未上 prod（AD/使用者裁示「未上 prod 傾向直接改 baseline 最乾淨」）；(b) baseline 為 MSSQL schema 唯一事實來源，parity 驗收（I-MSSQL-BASELINE-PARITY-01 / mssql-p1b2）比對「synchronize(entity) ↔ 單一 baseline」——若改走 ALTER migration，synchronize 直接建 nvarchar 但 baseline 仍 varchar 會使 parity 破。直接改 baseline 使兩軌一致（p1b2 43/43 綠）。
- **PG baseline migration 未改**：`nvarcharColumnType` 於 PG=varchar，與 PG baseline 既有 varchar 逐值相同 → PG 零 migration 變更、零回歸。

## 檔案異動

| 檔案 | 類型 | 說明 |
|---|---|---|
| src/common/database/column-types.ts | modified | 新增 `nvarcharColumnType` helper |
| scripts/parse-ob-schema.mjs | modified | mapType 保留 nvarchar 區分；entity/migration 輸出模式 |
| src/database/entities/ob-pool-data.entity.ts | modified | 27 顯示欄 → nvarcharColumnType |
| src/database/entities/ob-pool-data-list.entity.ts | modified | 28 顯示欄 → nvarcharColumnType |
| src/database/entities/ob-emphire.entity.ts | modified | 4 顯示欄 |
| src/database/entities/ob-code-df.entity.ts | modified | 8 顯示欄 |
| src/database/entities/ob-dept-pct.entity.ts | modified | 1 顯示欄 |
| src/database/entities/ob-tier.entity.ts | modified | 1 顯示欄 |
| src/database/entities/ob-list-definition.entity.ts | modified | 3 顯示欄 |
| src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts | modified | 72 欄 varchar(N)→nvarchar(N)（8 表）|
| src/database/__tests__/mssql-p1a-unit.spec.ts | modified | 新增 nvarcharColumnType 三分支斷言 |
| src/database/__tests__/mssql-p5i-nvarchar.mssql.spec.ts | new | round-trip + schema + contrast 驗收（真 MSSQL）|

（ob-empl-set.entity.ts 無異動：唯一候選 deptid_m 為 PK/key，保留 varchar。）

## round-trip 證據（真 MSSQL）
- ROUNDTRIP-001：`emp_nm` = 45 個「測」（90 bytes）寫入 nvarchar(50) → 讀回 `.length===45`、逐字相等。
- CONTRAST-001：同值寫入 varchar(50) BIN → 拋「String or binary data would be truncated」——具體證明 AD §9.4「未修法(varchar)之截斷風險為真、非測試 harness 假象」。
- SCHEMA-001/002：INFORMATION_SCHEMA 實查——顯示欄 DATA_TYPE='nvarchar'、代碼/PK/legacy-varchar 對照欄='varchar'。

## postgres / sqlite 零回歸證據
- REG-002 單元斷言：`nvarcharColumnType`→ sqlite='varchar'、postgres='varchar'（與現行 literal `'varchar'` 逐值等價，TypeORM 欄位 metadata byte-identical）。
- sqlite 回歸批次（stage1-filter-chain integration / customer-core-clause / stage2to4-score-source-f104 / cr-priority）99 測試全綠——皆重度使用受改 entity（ob_pool_data/list、ob_emphire、ob_dept_pct、ob_empl_set）。
- `npx tsc --noEmit -p tsconfig.build.json` 乾淨（exit 0）。

## 既有 pre-existing 失敗影響（未擴大）
git stash 前後對照：
- 原始碼（stash）：fn-calc 1 + target-table-schemas 7 + target-table.service 2 = **10 失敗**。
- 套用 P5i 後：仍 **10 失敗**（同集合，皆 customer_core 欄數 drift / tier 業務邏輯，與本 slice 無關；本 slice 未觸 target-table-schemas.ts / target-table.service.ts / fn_calc）。
- 結論：pre-existing 失敗數**未擴大**。

## 範圍決策與偏差（供 review）
1. **display-only（72）而非 categorical-all（140）**：不變式 I-MSSQL-NVARCHAR-DISPLAY-01 文字為「任何 legacy nvarchar 欄」，但其**目的**為避免「Unicode 顯示內容截斷」，且本 slice 任務範圍明訂為「中文顯示欄」、預估「ob_pool_data/list 各~20+、ob_emphire 4」。純 ASCII 代碼/PK/join key（orgno/custo_no/dept_id/list_no…）在 BIN collation 下 byte 計長＝字元計長、**永不截斷**，轉 nvarchar 無 Unicode 益處，且會與未轉之對手表（ob_monthly_run_result / customer_core，本 slice 不含）varchar 欄產生 cross-type join，觸及 cutover-gating 路徑而無法於本機完整重驗（無 115k 全月名單分派）。故採**目的性解讀**：自完整機械掃描(140)移除 PK/join/decision key/純代碼欄，套用 72 個中文自由文字顯示欄。emphire 得 4（與預估相符）、pool 得 27/28（符合「~20+」）。
2. **產生器維持 categorical**：`parse-ob-schema.mjs` 對**所有** legacy nvarchar 輸出 nvarcharColumnType（工具層忠實保留 legacy 訊號、不做 display/code 判斷、§9.5「機械掃描以免遺漏」）。故產生器草稿（pool 58）較 entity 實套（27）為廣——與本專案既有「產生器草稿 → 人工 reconcile entity（nullable/dateColumnType/length 擴充…）」慣例一致；未來 regen 時代碼欄之 nvarcharColumnType 由人工依本決策 reconcile。
3. **out-of-scope 觀察（未處理）**：`ob_monthly_run_result`（CDMP 內部表、非產生器 entity）之顯示欄 `cr_nm varchar(50)` 承接自 ob_pool_data_list.cr_nm（Chinese），MSSQL 下理論上有截斷風險；CR 姓名 ≤5 中文字（10 bytes）實務不觸頂，且該表非本 slice「產生器 entity」範圍，列為 follow-up 不擴大範圍。
4. 未觸 P6 / P5f；未 git commit；未動記憶檔（依指示）。

## 驗收對照
- 真 MSSQL round-trip 不截斷、受影響欄清單、baseline 更新方式：✅（上列）。
- `tsc --noEmit -p tsconfig.build.json`：✅ 乾淨。
- postgres/sqlite 零回歸：✅（nvarcharColumnType=varchar 逐值等價 + sqlite 批次綠 + tsc）。
- 既有 mssql spec 不破：✅（p1b1/p1b2/p1b3 132 綠 + Stage 1~4 pushdown 206 綠）。
- pre-existing 10 失敗未擴大：✅（stash 前後皆 10）。
