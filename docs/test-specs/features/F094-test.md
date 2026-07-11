---
type: test-design-feature
feature_id: F094
feature_name: 月名單分派結果表 ob_monthly_run_result（單源化 Phase A）
priority: P0-MVP
related_spec: /docs/specs/features/F094-monthly-run-result-table.md
spec_version: "1.0"
covers:
  - F094
  - AD-E07-25
last_updated: 2026-05-27
---

# F094：月名單分派結果表 ob_monthly_run_result（單源化 Phase A）— 測試設計

> ⚠️ **PRODUCTION 結構變更警告（必讀）**：本 feature 將月名單分派 Stage 1~4 之寫入 / 讀取目標由 `ob_pool_data_list`（`data_source='monthly_run'`）切換至新表 `ob_monthly_run_result`。**Stage 1 寫入切換（AC-2）與 Stage 3/4 讀取切換（AC-3）必須於同一 PR 完整完成**（AC-4），不可分批 deploy；與 F091 v2.0 + F095 同批 deploy（Phase A）。
>
> **測試設計重點**：
> 1. Migration m292（表結構 / PK / FK / nullable assignday）up/down 正確性
> 2. Stage 1 月名單分派寫入目標切換至本表（ob_pool_data_list 不再被寫入）
> 3. Stage 3/4 讀取目標切換至本表（與 Stage 1 落點一致）
> 4. snapshot type=result 短期雙軌保留（AC-5，DP-AD25-3）
> 5. FK ON DELETE CASCADE：assignment_run 刪除時自動清除對應 ob_monthly_run_result 列
> 6. 去重查詢仍只讀 ob_pool_data_list（不讀本表）

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F094-monthly-run-result-table.md`（v1.0）+ `architecture-spec.md` AD-E07-25 §25.4 / §25.6 / §25.7 + `data-model.md`（`ob_monthly_run_result` 欄位定義，唯一權威）+ `assignment-run-pipeline.service.ts`（Stage 1/3/4 寫入讀取路徑）+ F091-test.md（`executeStage1Chain` 回傳型別）|
| QA / Tester | 本文件（§3 AC / §5 Stage 3/4 切換）+ `error-handling.md#assignment-errors` |
| DBA | 本文件（§3 migration 驗證 / §6 FK + CASCADE）|

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Integration（PostgreSQL TestContainer：migration up/down + Stage 1 寫入切換 + FK CASCADE）；Unit（snapshot 雙軌靜態分析 / Regression guard）|
| 關鍵依賴 | F091 `executeStage1Chain({ dryRun: false })` 回傳 `Partial<ObMonthlyRunResult>[]`（F091 AC-7）；F094 migration m292 執行後方可驗證 Stage 1 寫入目標 |
| TIMESTAMP 欄位 | entity 日期欄位須使用專案 `dateColumnType` helper（記憶 feedback_typeorm_timestamp：PostgreSQL 不支援 `datetime`，須用 `timestamp`）|
| 原子性 | Stage 1 寫入切換與 Stage 3/4 讀取切換須同 PR 完成（AC-4），測試設計須覆蓋兩者切換後的整合路徑 |

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F094-MIG-001~003（migration m292）| 3 | 高（需 PG TC）| Integration | up/down / PK / FK CASCADE / nullable assignday |
| TS-F094-ENT-001~002（entity 靜態）| 2 | 高 | Unit（靜態）| TIMESTAMP 欄位 / PK 複合鍵 |
| TS-F094-ST1-001~003（Stage 1 寫入切換）| 3 | 高（需 PG TC）| Integration | 月名單分派寫入本表 / ob_pool_data_list 不被寫入 / run_id 關聯 |
| TS-F094-ST34-001~002（Stage 3/4 讀取切換）| 2 | 高（需 PG TC）| Integration | Stage 3/4 讀本表 / CR+分派結果欄位更新 |
| TS-F094-SN-001~002（snapshot 雙軌）| 2 | 高（混合）| Integration / Unit | snapshot type=result 仍寫 / collectCrCandidates 維持讀 snapshot |
| TS-F094-FK-001~002（FK + CASCADE）| 2 | 高（需 PG TC）| Integration | assignment_run 刪除 → 本表列 CASCADE 清除 |
| TS-F094-DEDUP-001（去重不讀本表）| 1 | 高 | Unit（mock / regression guard）| 去重查詢仍讀 ob_pool_data_list |

---

## 一、Migration m292 驗證

> **設計依據**：F094 AC-1；AD-E07-25 §25.4；data-model.md `ob_monthly_run_result`（PK / FK / 欄位定義，唯一權威）

---

### TS-F094-MIG-001：migration up() — 建立 ob_monthly_run_result 表與 PK / FK / 索引

- **關聯需求**：F094 AC-1；AD-E07-25 §25.4；data-model.md（`ob_monthly_run_result` 欄位定義）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - PostgreSQL TestContainer 啟動
  - `assignment_run` 表已存在（`run_id` UUID PK）
  - 尚未執行 migration m292
- **步驟**：
  1. 執行 migration `1711360000292-CreateObMonthlyRunResult` 的 `up()` 方法
  2. 查詢 `information_schema.tables` 確認 `ob_monthly_run_result` 表存在
  3. 查詢 `information_schema.table_constraints` 確認 PK 為 `(run_id, list_no, orgno, appl_no)` 複合主鍵
  4. 查詢 `information_schema.referential_constraints` 確認 FK `fk_omrr_run` → `assignment_run(run_id)` `ON DELETE CASCADE`
  5. 插入一筆 `assignday = NULL`（驗證 nullable）
  6. 插入一筆 `assignday = '20260501'`（驗證 yyyyMMdd 字串型別）
  7. 確認 `result_status` 預設值為 `'PENDING'`（依 data-model.md 定義）
- **預期結果**：
  - 表存在；PK 正確為複合鍵四欄；FK 存在且 `ON DELETE CASCADE`
  - `assignday` 欄 `is_nullable = 'YES'`（AD-E07-25 DP-AD25-6）
  - `result_status = 'PENDING'`（initial default）
  - 兩筆插入均成功
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F094-MIG-002：migration down() — DROP TABLE 可逆驗證

- **關聯需求**：F094 AC-1（migration down() DROP TABLE）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：migration up() 已執行，`ob_monthly_run_result` 含 1 筆資料
- **步驟**：
  1. 執行 migration m292 `down()` 方法
  2. 查詢 `information_schema.tables` 確認 `ob_monthly_run_result` 表**不存在**
  3. 確認 `assignment_run` 表仍存在（down 不應刪除 FK 目標表）
- **預期結果**：
  - `ob_monthly_run_result` 不存在（DROP TABLE 成功）
  - `assignment_run` 不受影響
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F094-MIG-003：SQLite E2E 環境 no-op 慣例驗證

- **關聯需求**：F094 AC-1（SQLite no-op 慣例，對齊 F090 MIG-003）
- **測試類型**：Positive / Unit（靜態）
- **測試層**：Unit（原始碼結構分析）
- **前置條件**：migration `1711360000292-CreateObMonthlyRunResult` 實作完成
- **步驟**：
  1. 讀取 migration 原始碼，確認 `up()` 含 `if (this.dataSource.options.type === 'sqlite') return;`（或等效分支）
  2. 確認 `down()` 含相同 SQLite 分支
- **預期結果**：
  - migration 在 SQLite 環境為 no-op（CREATE TABLE / DROP TABLE 均 skip）
- **DB 需求**：無

---

## 二、Entity 欄位驗證

---

### TS-F094-ENT-001：ob-monthly-run-result.entity.ts — TIMESTAMP 欄位使用 dateColumnType helper

- **關聯需求**：F094 AC-1（entity 對齊 data-model.md）；記憶 feedback_typeorm_timestamp（PostgreSQL 須用 `timestamp`，不可用 `datetime`）
- **測試類型**：Positive / Unit（靜態）
- **測試層**：Unit（原始碼 grep）
- **前置條件**：`ob-monthly-run-result.entity.ts` 已建立
- **步驟**：
  1. grep entity 中所有 `@Column` 裝飾器，確認日期類型欄位（如 `created_at`、若有 `assigned_at` 等）使用 `dateColumnType` helper 或 `type: 'timestamp'`
  2. 確認**不存在** `type: 'datetime'` 的欄位定義
  3. 確認 `assignday` 欄定義為字串型別（`varchar` / `text`，非 DATE 型別），nullable=true
- **預期結果**：
  - 所有日期欄位使用 `timestamp`（非 `datetime`）
  - `assignday` 定義為字串型別、nullable
  - **不存在** `type: 'datetime'`

---

### TS-F094-ENT-002：entity 複合 PK 與 FK 定義正確

- **關聯需求**：F094 AC-1；AD-E07-25 §25.4
- **測試類型**：Positive / Unit（靜態）
- **測試層**：Unit（TypeORM metadata 反射或原始碼 grep）
- **前置條件**：entity 已建立
- **步驟**：
  1. 確認 `run_id`、`list_no`、`orgno`、`appl_no` 四欄均有 `@PrimaryColumn` 裝飾（複合 PK）
  2. 確認 `run_id` 有 `@ManyToOne` 或 `@JoinColumn` 指向 `AssignmentRun`，含 `onDelete: 'CASCADE'`（對應 FK ON DELETE CASCADE）
  3. 確認 entity 名稱為 `ObMonthlyRunResult`（避免命名漂移）
- **預期結果**：
  - 四欄複合 PK 正確定義
  - FK 含 `onDelete: 'CASCADE'`
  - entity class 名稱為 `ObMonthlyRunResult`

---

## 三、Stage 1 寫入目標切換

> **設計依據**：F094 AC-2；AD-E07-25 §25.6

---

### TS-F094-ST1-001：月名單分派 Stage 1 寫入 ob_monthly_run_result（不再寫 ob_pool_data_list）

- **關聯需求**：F094 AC-2；F094 AC-4（同一 PR 完整切換）；AD-E07-25 §25.6 / §25.7 Phase A
- **測試類型**：Positive / Integration（關鍵場景）
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - migration m292 已執行（`ob_monthly_run_result` 存在）
  - migration m291 已執行（`ob_pool_data_list` 存在，含 `data_source` 欄）
  - `ob_pool_data_list` 預先 seed 3 筆 `data_source='etl_load'`（ETL 歷史）
  - `ob_monthly_run_result` 初始為空
  - `ob_pool_data` seed 足夠 Stage 1 挑案的案件（含 `month_cnt` 等必要欄位）
  - 建立一個 `assignment_run`（`run_id = 'test-run-001'`）
- **步驟**：
  1. 執行月名單分派 Stage 1（`executeStage1Chain({ dryRun: false })`）對某名單
  2. 查詢 `ob_monthly_run_result WHERE run_id = 'test-run-001'`，統計筆數
  3. 查詢 `ob_pool_data_list WHERE data_source = 'monthly_run'`，統計筆數
  4. 驗證 `ob_monthly_run_result` 每列含 `run_id`、`list_no`、`orgno`、`appl_no`（PK 四欄）
- **預期結果**：
  - `ob_monthly_run_result` 含月名單分派 Stage 1 提案列，`run_id = 'test-run-001'`，筆數 > 0
  - `ob_pool_data_list WHERE data_source = 'monthly_run'` = **0 筆**（regression guard：月名單分派不再寫本表）
  - `ob_pool_data_list WHERE data_source = 'etl_load'` 仍為 3 筆（ETL 歷史未被影響）
  - 每列 `result_status = 'PENDING'`（初始值）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F094-ST1-002：Stage 1 寫入精簡欄位集合（不複製業務欄位）

- **關聯需求**：F094 AC-2（「寫入欄位為精簡集合：PK 四欄 + custo_no + settle_src + Stage 2~4 結果欄位 + assignday；業務欄位由 ob_pool_data 取得，不複製進本表」）；AD-E07-25 DP-AD25-2 方案 A
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：同 ST1-001
- **步驟**：
  1. 執行月名單分派 Stage 1 後查詢一筆 `ob_monthly_run_result`
  2. 驗證 response 物件欄位集合
- **預期結果**：
  - 包含 PK 四欄（`run_id` / `list_no` / `orgno` / `appl_no`）
  - 包含 `custo_no`、`settle_src`、`assignday`（nullable）
  - **不包含** `spec_name` / `year_produ` / `payt_term` 等 Stage 2 業務欄位（DP-AD25-2 不複製）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F094-ST1-003：Stage 1 executeV1() / executeV2() 回傳型別更新（Partial<ObMonthlyRunResult>[]）

- **關聯需求**：F094 AC-2（「`executeV1()` / `executeV2()` 回傳型別由 `Partial<ObPoolDataList>[]` 改為 `Partial<ObMonthlyRunResult>[]`」）
- **測試類型**：Positive / Unit（靜態型別）
- **測試層**：Unit（TypeScript 型別靜態分析）
- **前置條件**：`assignment-run-pipeline.service.ts` 已依 F094 修改
- **步驟**：
  1. 確認 `executeV1()` / `executeV2()` 的回傳型別聲明為 `Partial<ObMonthlyRunResult>[]`（或等效型別）
  2. 確認**不存在** `Partial<ObPoolDataList>[]` 作為回傳型別（grep 驗證）
- **預期結果**：
  - 回傳型別已更新為 `ObMonthlyRunResult` 相關型別
  - 舊型別 `ObPoolDataList` 不作為 Stage 1 回傳型別出現

---

## 四、Stage 3/4 讀取目標切換

> **設計依據**：F094 AC-3；AD-E07-25 §25.6

---

### TS-F094-ST34-001：Stage 3 CR 回分結果寫入 ob_monthly_run_result

- **關聯需求**：F094 AC-3（「Stage 3 結果寫入 `is_cr` / `cr_id` / `cr_nm`」）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_monthly_run_result` 含 Stage 1 寫入的提案列（run_id + list_no + 案件）
  - Stage 3 CR 回分邏輯已依 F094 改讀本表（不再讀 `ob_pool_data_list`）
- **步驟**：
  1. 執行月名單分派 Stage 3（CR 回分）
  2. 查詢 `ob_monthly_run_result WHERE run_id = :runId AND is_cr = true`，統計筆數
  3. 驗證 `cr_id`、`cr_nm` 欄位已填入
- **預期結果**：
  - `is_cr = true` 的列存在，`cr_id` / `cr_nm` 非 NULL（Stage 3 寫入正確）
  - Stage 3 讀取目標為 `ob_monthly_run_result`（不再讀 `ob_pool_data_list`）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F094-ST34-002：Stage 4 部門 / 業務員分配結果寫入 ob_monthly_run_result

- **關聯需求**：F094 AC-3（「Stage 4 結果寫入 `dept_id` / `emplid` / `emplid_deptid`」）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `ob_monthly_run_result` 含 Stage 1 + Stage 3 完成後的提案列
  - Stage 4 分派邏輯已依 F094 改讀本表
- **步驟**：
  1. 執行月名單分派 Stage 4（部門 / 業務員分配）
  2. 查詢 `ob_monthly_run_result WHERE run_id = :runId`，驗證 `dept_id` / `emplid` / `emplid_deptid` 欄位
- **預期結果**：
  - `dept_id` / `emplid` / `emplid_deptid` 至少部分列非 NULL（Stage 4 寫入）
  - Stage 4 讀取目標為 `ob_monthly_run_result`
- **DB 需求**：PostgreSQL TestContainer

---

## 五、Snapshot 短期雙軌保留

> **設計依據**：F094 AC-5；AD-E07-25 DP-AD25-3 方案 A（短期保留雙軌）

---

### TS-F094-SN-001：月名單分派完成後仍寫 assignment_run_snapshot type=result（雙軌保留）

- **關聯需求**：F094 AC-5（「月名單分派 Stage 4 完成後仍寫 `assignment_run_snapshot`（type=result）作為稽核快照」）；DP-AD25-3
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：完整月名單分派（Stage 1~4）已執行完畢
- **步驟**：
  1. 查詢 `assignment_run_snapshot WHERE run_id = :runId AND type = 'result'`
  2. 確認快照存在
- **預期結果**：
  - `assignment_run_snapshot type=result` 仍存在（短期雙軌，未移除）
  - 同時 `ob_monthly_run_result` 也存在對應 run_id 的列（雙軌並存）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F094-SN-002：collectCrCandidates 維持讀 assignment_run_snapshot（本 feature 不改動）

- **關聯需求**：F094 AC-5（「`collectCrCandidates()` 維持讀 snapshot，本 feature 不改動」）
- **測試類型**：Positive / Unit（靜態分析）
- **測試層**：Unit（原始碼 grep）
- **前置條件**：`assignment-run-pipeline.service.ts`（或 `cr-candidate.service.ts`）已依 F094 修改
- **步驟**：
  1. 在 `collectCrCandidates()` 函式原始碼中確認仍查詢 `assignment_run_snapshot`
  2. 確認**不存在** `collectCrCandidates` 查詢 `ob_monthly_run_result` 的程式碼（本輪不改動，Phase C follow-up）
- **預期結果**：
  - `collectCrCandidates()` 讀取目標為 `assignment_run_snapshot`（維持現狀）
  - 不存在改查 `ob_monthly_run_result` 的程式碼（Phase C 未交付）

---

## 六、FK ON DELETE CASCADE

> **設計依據**：F094 AC-6；AD-E07-25 §25.4

---

### TS-F094-FK-001：assignment_run 刪除 → ob_monthly_run_result 對應列 CASCADE 清除

- **關聯需求**：F094 AC-6（「FK `ON DELETE CASCADE`，不需應用層額外清除邏輯」）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - `assignment_run run_id='run-cascade-001'` 已存在
  - `ob_monthly_run_result` 含 3 筆 `run_id='run-cascade-001'` 的列
  - `ob_monthly_run_result` 另含 2 筆 `run_id='run-other-001'` 的列（不應受影響）
- **步驟**：
  1. 執行 `DELETE FROM assignment_run WHERE run_id='run-cascade-001'`
  2. 查詢 `ob_monthly_run_result WHERE run_id='run-cascade-001'`，統計筆數
  3. 查詢 `ob_monthly_run_result WHERE run_id='run-other-001'`，統計筆數
- **預期結果**：
  - `run_id='run-cascade-001'` 的 3 筆自動清除（CASCADE）
  - `run_id='run-other-001'` 的 2 筆不受影響
  - **不需應用層額外清除邏輯**（FK CASCADE 自動處理）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F094-FK-002：orphan 保護 — 不可插入不存在的 run_id

- **關聯需求**：F094 AC-1（FK 完整性）
- **測試類型**：Negative / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：`assignment_run` 不含 `run_id='non-existent-run'`
- **步驟**：
  1. 嘗試向 `ob_monthly_run_result` 插入 `run_id='non-existent-run'` 的列
  2. 驗證 PostgreSQL FK 約束錯誤
- **預期結果**：
  - 插入失敗，PostgreSQL 回傳 FK constraint violation 錯誤
  - 資料庫完整性保持
- **DB 需求**：PostgreSQL TestContainer

---

## 七、去重查詢不讀 ob_monthly_run_result

> **設計依據**：F094 AC-7；AD-E07-25 §25.6（「`queryRecentAssignedCustoNos()` 無需修改邏輯」）

---

### TS-F094-DEDUP-001：去重查詢仍只讀 ob_pool_data_list（不讀 ob_monthly_run_result）

- **關聯需求**：F094 AC-7（「去重以業務系統歷史真相（ETL）為準，不以本系統提案為準」）；AD-E07-25 §25.6
- **測試類型**：Regression / Unit（靜態 + 行為）
- **測試層**：Unit（mock + 靜態 grep）
- **前置條件**：`queryRecentAssignedCustoNos()` / `computeDedupWindow()` 函式已依 F091 v2.0 實作
- **步驟**：
  1. grep `queryRecentAssignedCustoNos` / 去重相關查詢函式，確認查詢目標為 `ob_pool_data_list`
  2. 確認**不存在** `FROM ob_monthly_run_result`（或等效 entity 查詢）在去重邏輯中
  3. 以 mock 驗證：即使 `ob_monthly_run_result` 含提案列，去重集合不含 `ob_monthly_run_result` 的 custo_no
- **預期結果**：
  - 去重查詢目標為 `ob_pool_data_list`（ETL 來源）
  - `ob_monthly_run_result` 的 custo_no 不被納入去重集合
  - 此設計確認「提案非真相」語意（AC-7 業務設計意圖）

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F094-MIG-001~002（migration up/down）| 高（需 PG TC）| PK / FK / CASCADE / nullable assignday |
| TS-F094-MIG-003（SQLite no-op）| 高 | 靜態分析 |
| TS-F094-ENT-001~002（entity 靜態）| 高 | dateColumnType + PK + FK grep |
| TS-F094-ST1-001~003（Stage 1 寫入切換）| 高（需 PG TC）| 最關鍵：月名單分派不再寫 ob_pool_data_list；本表含 run_id 提案 |
| TS-F094-ST34-001~002（Stage 3/4 讀取切換）| 高（需 PG TC）| 需月名單分派 Stage 1 先完成 seed |
| TS-F094-SN-001~002（snapshot 雙軌）| 高（SN-001 PG TC / SN-002 靜態）| 雙軌保留驗證 |
| TS-F094-FK-001~002（FK + CASCADE）| 高（需 PG TC）| 資料庫 FK 行為驗證 |
| TS-F094-DEDUP-001（去重不讀本表）| 高 | mock + grep；無真實 DB 依賴 |
