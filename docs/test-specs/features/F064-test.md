---
type: test-design-feature
feature_id: F064
feature_name: 匯出分派結果（對齊 legacy 23 欄明細）
priority: P0-MVP
related_spec: /docs/specs/features/F064-export-assignment-result.md
source_ad: /docs/specs/implementation-log/AD-E07-v3.4-f064-23col-export.md
source_stories: [US-155]
spec_version: "2.1"
last_updated: 2026-06-17
blocked_by: F102
supersedes: F064-v1.1
pool_table_correction: ob_pool_data_list → ob_pool_data (v2.1)
---

# F064：匯出分派結果（23 欄 legacy 對齊）— 測試設計

> ⚠️ **破壞性修正警告（v2.1）**：本文件對應 F064 v2.1 spec（supersedes v2.0 / US-084）。
> 三項 SCHEMA GAP + v2.1 pool 源血緣修正均已裁定：
> - **GAP-1**：移除 `custo_no` / `cust_name` / `card_level` / `score`（BR-F064-04，I-EXP-COLSRC-01）
> - **GAP-2**：資料來源由 `assignment_run_snapshot.payload` 改為 `ob_monthly_run_result` 多表 join（BR-F064-01）
> - **GAP-3**：進件日 source = `ob_pool_data.appl_date`（I-EXP-APLDATE-01；v2.1 更正：pool 表為 `ob_pool_data`）
> - **v2.1 pool 源修正（BR-F064-16 / I-EXP-LINEAGE-01）**：pool join 表由 `ob_pool_data_list`（三欄複合鍵）改為 `ob_pool_data`（雙欄 orgno+appl_no）。原因：Stage 1 INSERT 源表為 `ob_pool_data`（共享池 PK=orgno+appl_no），`ob_pool_data_list` 為 per-list 去重表，INNER JOIN 掉列約 11.5%（live 驗證：55,863→49,425）。`ob_pool_data` 保證 ⊇ `ob_monthly_run_result`，INNER JOIN 不掉列（55,863/55,863）。
>
> **所有 OQ 均已裁定（AD-E07-31，2026-06-17）**：OQ-F064-1（多表 join SQL）/ OQ-F064-2（CSV streaming）/ OQ-F064-3（同步 streaming 不做背景 job）/ OQ-F064-4（data-model 補述）/ US-155 OPEN QUESTION 1~4 全部裁定。
>
> **前置依賴**：F102 已 commit on main（`e3c839b7`），`ob_monthly_run_result.cr_id` / `cr_nm` / `is_cr` / `emplid` / `assignday` 全部有值，join 條件全齊。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F064 spec v2.1](../../specs/features/F064-export-assignment-result.md)（§4 AC-1~9、AC-2b、BR-F064-16 / §6 worked example）+ [AD-E07-31](../../specs/implementation-log/AD-E07-v3.4-f064-23col-export.md)（join SQL 形狀 / CSV streaming / 不變式 I-EXP-* 全覽）+ [F102 test spec](F102-test.md)（CR 三欄前置語意）**⚠️ pool join 表 = ob_pool_data（非 ob_pool_data_list）** |
| QA / Tester | 本文件（特別 §三 REGRESSION DoD 紅線 + §十六 LINEAGE 不掉列 DoD + §二 欄位完整性 + §四 格式轉換邊界 + §八 streaming 驗證） |
| CI/CD Owner | 本文件「自動化就緒度」；COLSRC / LINEAGE / SCOPE / CR / DET / APLDATE 群組需 Postgres |
| Product Analyst / 業務 | LINEAGE-001 不掉列驗收（live 55,863/55,863）+ TC-155-09 regression + AC-2 legacy 23 欄對齊 gate |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| **驗收紅線（DoD）** | ① Regression 群組（表頭/資料列不含 `custo_no`/`cust_name`/`card_level`/`score`，COLSRC-001~004）= 必須全綠，未過不得上線 ② 23 欄表頭完整性逐欄比對（COLSEQ-001）= DoD 門檻 ③ **LINEAGE-001（I-EXP-LINEAGE-01 不掉列）**：匯出列數 = ob_monthly_run_result 列數 = DoD 門檻（live 55,863/55,863） ④ join SQL 形狀靜態驗證（不讀 snapshot JSONB，不 SELECT 禁止欄位，查 ob_pool_data 非 ob_pool_data_list，STATIC-001~002 + LINEAGE-003 靜態）= DoD 門檻 ⑤ `tsc --noEmit -p tsconfig.build.json` 乾淨（feedback_vitest_no_typecheck 教訓）|
| **主要測試層** | ① **Unit（純函式 / 靜態）**：`formatRow()` 日期格式、join-miss fallback、表頭常數 `EXPORT_HEADER_V2`、SQL 形狀靜態 grep（含 ob_pool_data 換表驗證）② **PG Integration（強制 Postgres）**：23 欄資料欄序、不掉列計數、scope WHERE 注入、INNER JOIN ob_pool_data / LEFT JOIN emphire / list_def、ORDER BY 確定性 ③ **Integration（SQLite）**：422 阻擋、稽核 log `after_value`、join-miss WARNING log ④ **回歸（Regression）**：表頭/資料列不含舊 4 欄靜態與 runtime 雙重驗證 |
| **Mock 策略換向** | F064 v2.1 測試 mock 策略由 `snapshotRepo.find()` → `DataSource.query()` / `queryRunner.stream()`。raw row 構造含 **ob_pool_data**（非 ob_pool_data_list）+ emphire + list_def 完整 23 欄位（AD-E07-31 §3.3 `EXPORT_HEADER_V2` 常數逐欄對應）。unit test mock queryRunner 回傳 AsyncIterable rows；PG integration test 使用 `cdmp_test` DB 真庫。 |
| **確定性驗證** | `ORDER BY r.list_no, r.orgno, r.appl_no`（I-EXP-DET-01）；同 run_id 兩次匯出結果完全相同 |
| **CI 序列執行** | F064 PG spec 與 F101/F102 共用 `cdmp_test` DB，**必須序列執行**，禁並行 |
| **型別 gate** | 實作後必須跑 `tsc --noEmit -p tsconfig.build.json`（feedback_vitest_no_typecheck 教訓） |

### 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 自動化適合度 | 說明 |
|---|---|---|---|---|---|
| COLSRC（資料來源 + join 路徑，AC-2 / I-EXP-COLSRC-01）| 6 | PG Integration | **是** | 高 | INNER JOIN **ob_pool_data**（orgno+appl_no）/ LEFT JOIN emphire / LEFT JOIN list_def；不讀 snapshot JSONB |
| LINEAGE（不掉列，BR-F064-16 / I-EXP-LINEAGE-01）| **5（含 DoD 紅線）** | PG Integration + Unit 靜態 | **是（PG 3）** | 高 | 匯出列數 = result 列數（55,863/55,863）；ob_pool_data ⊇ result；ob_pool_data_list 不用；pool 屬性值回歸 |
| COLSEQ（23 欄表頭與欄序，AC-2 / BR-F064-03）| 4 | Unit + PG Integration | 部分 | 高 | 表頭逐欄比對；欄序嚴格對齊 legacy |
| REGRESSION（破壞性排除，AC-2 / BR-F064-04 / I-EXP-COLSRC-01）| 6 | Unit（靜態 + runtime）| 否 | 高 | **DoD 紅線**；表頭/資料列均不含舊 4 欄；xlsx / CSV 雙格式 |
| FMT（日期格式轉換，AC-3 / BR-F064-05 / I-EXP-FMT-01）| 8 | Unit | 否 | 高 | assignday 整數/ISO 字串→YYYYMMDD；appl_date Date/字串→YYYY/MM/DD；防 Excel locale |
| CR（CR 三欄呈現，AC-4 / BR-F064-08）| 4 | PG Integration | **是** | 高 | is_cr='Y' 列 CR_ID/CR_NM 非空；'N' 列空值；NULL→空字串 |
| JOINMISS（ob_emphire join-miss fallback，AC-5 / BR-F064-06 / I-EXP-JOINMISS-01）| 5 | Integration | 否 | 高 | 欄 12/14/15 空；欄 13 emplid 仍輸出；WARNING log 彙總；不中斷匯出 |
| OVERDUE（逾期天數恆空保留欄，BR-F064-07）| 2 | Unit | 否 | 高 | overdue_day NULL→空字串；表頭仍保留「逾期天數」 |
| STREAM（streaming / NoOffset，AC-6 / BR-F064-09 / I-EXP-STREAM-01 / I-EXP-NOOFFSET-01）| 5 | Integration + NFR | 否（Unit）/ 是（PG NFR）| 中 | CSV PassThrough 無全量拼接；xlsx/CSV 共用 row-producer；不用 OFFSET；記憶體峰值斷言 |
| SCOPE（處長 scope WHERE 注入，AC-8 / BR-F064-13 / I-EXP-SCOPE-01）| 5 | PG Integration | **是** | 高 | section_chief → SQL 含 scope WHERE；director → 不含；無資料列→僅表頭 |
| STATUS（月名單分派未完成阻擋，AC-7 / BR-F064-12）| 4 | Integration | 否 | 高 | pending/running/failed → 422；completed → 允許；前端按鈕 disabled |
| AUDIT（稽核 log，AC-9 / BR-F064-15）| 3 | Integration | 否 | 高 | action='EXPORT'；after_value 含 format/actorBusinessRole/scopedByCreator/exportedRowCount |
| DET（確定性排序，I-EXP-DET-01）| 2 | PG Integration | **是** | 高 | ORDER BY list_no, orgno, appl_no；同 run_id 兩次結果相同 |
| APLDATE（進件日 source，I-EXP-APLDATE-01）| 2 | PG Integration | **是** | 高 | 取 **ob_pool_data**.appl_date（timestamp→日期），非 run_result.appl_date（GAP-3 + v2.1 裁定）|
| STATIC（靜態掃描，I-EXP-COLSRC-01 / I-EXP-NOOFFSET-01 / I-EXP-LINEAGE-01）| **5** | Unit（靜態 grep）| 否 | 高 | 無 OFFSET；無 snapshot.payload；無 `custo_no` SELECT；CSV 無 lines.join()；**join 表為 ob_pool_data 非 ob_pool_data_list** |
| AUTH（認證 / RBAC，API 5.1）| 3 | Integration | 否 | 高 | 401 未登入；403 非 Director/SectionChief；200 正常 |
| **合計** | **68** | — | **約 26 案例需 Postgres** | — | COLSRC 6 + LINEAGE(PG 3) + CR 4 + SCOPE 5 + DET 2 + APLDATE 2 + COLSEQ(PG 2) + STREAM(PG NFR 2) = 26 PG |

---

## 一、COLSRC — 資料來源與 join 路徑（AC-2 / I-EXP-COLSRC-01）

> **設計依據**：F064 v2.1 §4 BR-F064-01/02；AD-E07-31 §2.1 join SQL 形狀；I-EXP-COLSRC-01。
>
> **核心驗證目標**：匯出不從 `assignment_run_snapshot.payload` JSONB 讀取；資料來源為 `ob_monthly_run_result` 搭配三方 join；**pool join 表 = `ob_pool_data`（orgno+appl_no），非 `ob_pool_data_list`**。
>
> **前置條件（COLSRC 群組共用）**：PG 真庫；`assignment_run.status = 'completed'`；`ob_monthly_run_result` 有至少 3 筆 seed（含 pool join 命中 / emphire join 命中 / emphire join-miss 各一）；**`ob_pool_data`**（非 ob_pool_data_list）有對應 (orgno, appl_no) 紀錄；`ob_list_definition` 有對應 `list_no` 紀錄。

### TS-F064-COLSRC-001：INNER JOIN ob_pool_data 雙欄鍵命中（v2.1 修正）

- **相關 AC / BR**：AC-2 / BR-F064-01 / I-EXP-COLSRC-01 / BR-F064-16
- **測試類型**：正向
- **測試層**：PG Integration
- **前置條件**：
  - seed 一筆 `ob_monthly_run_result`（run_id=R1, list_no='OB202606001', orgno='ORG01', appl_no='A001'）
  - **`ob_pool_data`**（非 ob_pool_data_list）有 (orgno='ORG01', appl_no='A001') 記錄，含 dept_name='台北分處'、appl_date='2025-03-01'、pro_rate=12.5
  - ⚠️ `ob_pool_data_list` 不需存在對應記錄（pool join 不再依賴此表）
- **步驟**：
  1. 呼叫 `GET /api/v1/assignment/runs/R1/export?format=csv`
  2. 解析 CSV，取第一筆資料列
- **期望結果**：
  - 欄 1（分處）= `'台北分處'`（來自 ob_pool_data.dept_name）
  - 欄 19（客戶利率）= `'12.5'`（來自 ob_pool_data.pro_rate）
  - 回應 HTTP 200，Content-Type 含 `text/csv`
  - 確認：資料非 snapshot payload（snapshot 中無 dept_name / pro_rate）

---

### TS-F064-COLSRC-002：LEFT JOIN ob_emphire 命中時三欄正確填入

- **相關 AC / BR**：AC-2 / BR-F064-01 / BR-F064-06
- **測試類型**：正向
- **測試層**：PG Integration
- **前置條件**：
  - seed `ob_monthly_run_result` emplid='E003'
  - `ob_emphire` emp_id='E003'，emp_nm='王小明'，title_name='專員'，dept_name='電銷一課'
- **步驟**：
  1. 觸發匯出；解析輸出資料列
- **期望結果**：
  - 欄 12（部門名稱）= `'電銷一課'`（emphire.dept_name）
  - 欄 14（姓名）= `'王小明'`（emphire.emp_nm）
  - 欄 15（職級）= `'專員'`（emphire.title_name）
  - 欄 13（員編）= `'E003'`（run_result.emplid）

---

### TS-F064-COLSRC-003：LEFT JOIN ob_list_definition 命中時名單名稱正確填入

- **相關 AC / BR**：AC-2 / BR-F064-01 / BR-F064-03 欄 5
- **測試類型**：正向
- **測試層**：PG Integration
- **前置條件**：
  - `ob_list_definition` list_no='OB202606001'，list_nm='2026年6月汽車名單'
- **步驟**：
  1. 觸發匯出；解析輸出資料列
- **期望結果**：
  - 欄 4（名單代號）= `'OB202606001'`（run_result.list_no）
  - 欄 5（名單名稱）= `'2026年6月汽車名單'`（list_def.list_nm）

---

### TS-F064-COLSRC-004：ob_list_definition join-miss 時名單名稱輸出空值不中斷

- **相關 AC / BR**：AC-2 / BR-F064-01 / BR-F064-03 欄 5
- **測試類型**：負向（LEFT JOIN miss）
- **測試層**：Integration（SQLite）
- **前置條件**：
  - mock queryRunner 回傳 raw row，`list_nm = null`（ob_list_definition 查無）
- **步驟**：
  1. 執行 `formatRow(rawRow)`；取欄 5 輸出值
- **期望結果**：
  - 欄 5（名單名稱）= `''`（空字串，null → 空）
  - 匯出不拋例外

---

### TS-F064-COLSRC-005：不從 assignment_run_snapshot.payload JSONB 讀取（I-EXP-COLSRC-01）

- **相關 AC / BR**：AC-2 / I-EXP-COLSRC-01 / GAP-2
- **測試類型**：回歸（資料來源換向驗證）
- **測試層**：Integration（SQLite）
- **前置條件**：
  - mock `snapshotRepo.find()` 注入 spy；若被呼叫則測試失敗
  - mock `DataSource.query()` / `queryRunner` 回傳正確 raw rows
- **步驟**：
  1. 觸發 `exportResult(runId, 'csv', ...)`
  2. 驗證 `snapshotRepo.find()` 呼叫次數
- **期望結果**：
  - `snapshotRepo.find()` 呼叫次數 = **0**
  - CSV 輸出含正確 23 欄資料（來自 mock queryRunner）

---

### TS-F064-COLSRC-006：每列一筆分派紀錄（BR-F064-02）

- **相關 AC / BR**：AC-2 / BR-F064-02
- **測試類型**：正向（計數驗證）
- **測試層**：PG Integration
- **前置條件**：`ob_monthly_run_result` 有恰好 10 筆 run_id=R1 的記錄
- **步驟**：
  1. 匯出 CSV；計算資料列數（排除表頭）
- **期望結果**：
  - 資料列數 = **10**（每筆 run_result 各一列，無重複/遺漏）

---

## 一之一、LINEAGE — 不掉列驗證（BR-F064-16 / I-EXP-LINEAGE-01）

> **設計依據**：F064 v2.1 §4 BR-F064-16 / AC-2b；v2.1 pool 源血緣修正。
>
> **驗收紅線（DoD）**：匯出列數必須等於該 run_id 之 `ob_monthly_run_result` 總列數（扣除處長 scope filter 後）。live 驗證基準：202606 月名單分派 55,863/55,863 全數匯出，無任何掉列。
>
> **血緣保證機制**：Stage 1 `INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data`（PK = orgno+appl_no），因此 `ob_pool_data` ⊇ `ob_monthly_run_result`，INNER JOIN 必然 100% 命中。
>
> **前置條件（LINEAGE 群組共用）**：PG 真庫；seed `ob_monthly_run_result` N 筆；**`ob_pool_data`** 有對應 (orgno, appl_no) 記錄（保證 N/N 命中）；`ob_pool_data_list` 不需要有對應記錄（已換表）。

### TS-F064-LINEAGE-001：匯出列數等於 result 列數（I-EXP-LINEAGE-01 核心，DoD）

- **相關 AC / BR**：BR-F064-16 / AC-2b / I-EXP-LINEAGE-01
- **測試類型**：正向 / DoD 驗收（不掉列核心斷言）
- **測試層**：PG Integration
- **前置條件**：
  - seed run_id=R1，`ob_monthly_run_result` 恰好 50 筆
  - **`ob_pool_data`** 有全部 50 筆對應 (orgno, appl_no) 記錄
  - `ob_pool_data_list` 僅有其中 40 筆（模擬 11.5% 缺少情境，用以區分兩表行為）
  - director actor（無 scope filter）
- **步驟**：
  1. 匯出 CSV；計算資料列數（排除表頭）
  2. 查詢 `SELECT COUNT(*) FROM ob_monthly_run_result WHERE run_id='R1'`
- **期望結果**：
  - CSV 資料列數 = **50**（= ob_monthly_run_result 列數，無掉列）
  - 確認：若誤用 ob_pool_data_list，CSV 列數應為 40（差 10 列）——此為區分測試

---

### TS-F064-LINEAGE-002：ob_pool_data_list 缺列不影響匯出（血緣保護驗證）

- **相關 AC / BR**：BR-F064-16 / I-EXP-LINEAGE-01
- **測試類型**：負向（錯誤表使用的後果演示 + 正確表使用驗收）
- **測試層**：PG Integration
- **前置條件**：
  - 同 LINEAGE-001 seed：ob_pool_data 50 筆，ob_pool_data_list 40 筆
- **步驟**：
  1. 確認 v2.1 實作 join `ob_pool_data`；匯出 CSV
  2. 比對 CSV 列數 vs ob_monthly_run_result 列數
- **期望結果**：
  - CSV 列數 = **50**（全部命中，無掉列）
  - 若此案例失敗（列數 < 50），代表實作仍查 ob_pool_data_list → regression bug

---

### TS-F064-LINEAGE-003：靜態掃描——buildExportQuery 查 ob_pool_data 非 ob_pool_data_list（I-EXP-LINEAGE-01 靜態）

- **相關 AC / BR**：BR-F064-16 / I-EXP-LINEAGE-01
- **測試類型**：Regression（靜態掃描，**DoD 門檻**）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `buildExportQuery()` 函式體中 `FROM` 子句
  2. 確認 join `ob_pool_data`（非 `ob_pool_data_list`）
  3. 確認 join 鍵為 `(orgno, appl_no)` 雙欄（非三欄 `list_no+orgno+appl_no`）
- **期望結果**：
  - 函式體含 `ob_pool_data`（不含 `ob_pool_data_list`）
  - join 條件：`p.orgno = r.orgno AND p.appl_no = r.appl_no`（雙欄，無 list_no）
  - **不含** `JOIN ob_pool_data_list`（任何別名形式）

---

### TS-F064-LINEAGE-004：pool 屬性值與 ob_pool_data 完全一致（回歸——換表後值不變）

- **相關 AC / BR**：BR-F064-16 / BR-F064-03 欄 1/6/16~23
- **測試類型**：回歸（換表後欄位值對齊）
- **測試層**：PG Integration
- **前置條件**：
  - seed `ob_pool_data`：(orgno='ORG01', appl_no='A001')，dept_name='台北分處', pro_rate=12.5, month_cnt=3, sta_code='A1', brand_name='Toyota'
  - seed 相同 (orgno, appl_no) 的 `ob_pool_data_list`（list_no='OB202606001'）：相同欄位值（用以確認 matched 列值不因換表而改變）
- **步驟**：
  1. 觸發匯出；解析對應資料列
- **期望結果**：
  - 欄 1（分處）= `'台北分處'`
  - 欄 19（客戶利率）= `'12.5'`
  - 欄 22（廠牌名稱）= `'Toyota'`
  - 欄 23（名單週期月數）= `'3'`
  - 欄 20（STA_CODE）= `'A1'`
  - 所有 pool 欄值與 ob_pool_data 記錄完全一致（確認換表不改變 matched 列業務值）

---

### TS-F064-LINEAGE-005：appl_date 來源為 ob_pool_data.appl_date（timestamp 取日期，I-EXP-APLDATE-01 + I-EXP-LINEAGE-01 聯合）

- **相關 AC / BR**：BR-F064-03 欄 6 / I-EXP-APLDATE-01 / BR-F064-16
- **測試類型**：正向（進件日來源 + 型別轉換）
- **測試層**：Unit
- **前置條件**：
  - mock raw row：`appl_date = new Date('2025-03-01T00:00:00.000Z')`（TypeORM 對 timestamp 欄位的 Date 物件輸出）
  - 注意：ob_pool_data.appl_date 為 timestamp 型別（`dateColumnType`），TypeORM 傳入為 Date 物件
- **步驟**：
  1. 執行 `formatRow(rawRow)`；取欄 6（進件日）
- **期望結果**：
  - 欄 6 = `'2025/03/01'`（取 ISO 字串前 10 碼，replace `-` → `/`）
  - 時間部分被截除（不輸出 `'2025/03/01T00:00:00'`）
  - 型別 = `string`

---

## 二、COLSEQ — 23 欄表頭完整性與欄序（AC-2 / BR-F064-03）

> **設計依據**：F064 v2.1 §4 BR-F064-03 表；AD-E07-31 §3.3 `EXPORT_HEADER_V2` 常數。
>
> **驗收紅線**：表頭欄序必須與 BR-F064-03 表及 `EXPORT_HEADER_V2` 常數完全一致，任何欄位位移均視為缺陷。

### TS-F064-COLSEQ-001：xlsx 匯出表頭恰好 23 欄且欄序正確（TC-155-01 延伸）

- **相關 AC / BR**：AC-2 / BR-F064-03 / TC-155-01
- **測試類型**：正向
- **測試層**：Unit（表頭常數驗證）+ PG Integration（xlsx 實際輸出）
- **前置條件**（Unit 子案）：直接讀取 `EXPORT_HEADER_V2` 常數
- **前置條件**（PG 子案）：任一 completed run_id，seed 至少 1 筆資料
- **步驟**：
  1. （Unit）取 `EXPORT_HEADER_V2.length` 與逐欄欄名
  2. （PG）觸發 xlsx 匯出；解析第一列
- **期望結果**：
  - `EXPORT_HEADER_V2.length` = **23**
  - 欄序嚴格對齊（逐欄比對）：
    1. 分處 / 2. 案號 / 3. 指派日 / 4. 名單代號 / 5. 名單名稱 / 6. 進件日 /
    7. CR_ID / 8. CR_NM / 9. 是否分配CR / 10. TIER / 11. 部門代號 / 12. 部門名稱 /
    13. 員編 / 14. 姓名 / 15. 職級 / 16. 專案類別 / 17. 專案名稱 / 18. 逾期天數 /
    19. 客戶利率 / 20. STA_CODE / 21. 案件狀態 / 22. 廠牌名稱 / 23. 名單週期月數
  - xlsx 第一列字串陣列 `toEqual(EXPORT_HEADER_V2)`

---

### TS-F064-COLSEQ-002：CSV 匯出表頭恰好 23 欄且欄序正確

- **相關 AC / BR**：AC-2 / BR-F064-03
- **測試類型**：正向
- **測試層**：Unit（mock queryRunner）
- **前置條件**：mock 回傳 1 筆 raw row；觸發 CSV 路徑
- **步驟**：
  1. 觸發 `exportResult(runId, 'csv', ...)`；解析 CSV 第一列
- **期望結果**：
  - 分割後欄數 = **23**
  - 欄序與 `EXPORT_HEADER_V2` 完全一致

---

### TS-F064-COLSEQ-003：Worked example 兩筆案件完整 23 欄資料走查（§6 對齊）

- **相關 AC / BR**：AC-2 / BR-F064-03 / F064 §6 worked example
- **測試類型**：正向（端到端 23 欄逐欄驗證）
- **測試層**：PG Integration
- **前置條件**（對齊 spec §6）：
  - CR 案件（c1）：emplid='E003'；pool.dept_name='台北分處'；appl_no='A2026060001'；assignday='20260601'；pool.appl_date='2025-03-01'；cr_id='E003'；cr_nm='王小明'；is_cr='Y'；tier_level='T2'；dept_id='XVE1'；emphire 命中（emp_nm='王小明', title_name='專員', dept_name='電銷一課'）；pool.project_tp='01'；spec_name='優質專案'；overdue_day=NULL；pro_rate=12.5；sta_code='A1'；sta_code_na='正常'；brand_name='Toyota'；month_cnt=3；list_nm='2026年6月汽車名單'
  - 一般案件（c2）：emplid='X999'（emphire join-miss）；pool.dept_name='台中分處'；appl_no='A2026060099'；assignday='20260603'；is_cr='N'；cr_id=NULL
- **步驟**：
  1. 觸發匯出；解析第 1、2 列資料
- **期望結果（逐欄對齊 spec §6）**：

  | 欄 | c1 期望 | c2 期望 |
  |---|---|---|
  | 1 分處 | `'台北分處'` | `'台中分處'` |
  | 2 案號 | `'A2026060001'` | `'A2026060099'` |
  | 3 指派日 | `'20260601'` | `'20260603'` |
  | 4 名單代號 | `'OB202606001'` | `'OB202606001'` |
  | 5 名單名稱 | `'2026年6月汽車名單'` | `'2026年6月汽車名單'` |
  | 6 進件日 | `'2025/03/01'` | `'2025/08/15'` |
  | 7 CR_ID | `'E003'` | `''` |
  | 8 CR_NM | `'王小明'` | `''` |
  | 9 是否分配CR | `'Y'` | `'N'` |
  | 10 TIER | `'T2'` | `'T3'` |
  | 11 部門代號 | `'XVE1'` | `'XVE2'` |
  | 12 部門名稱 | `'電銷一課'` | `''`（join-miss）|
  | 13 員編 | `'E003'` | `'X999'` |
  | 14 姓名 | `'王小明'` | `''`（join-miss）|
  | 15 職級 | `'專員'` | `''`（join-miss）|
  | 16 專案類別 | `'01'` | `'02'` |
  | 17 專案名稱 | `'優質專案'` | `'一般專案'` |
  | 18 逾期天數 | `''` | `''` |
  | 19 客戶利率 | `'12.5'` | `'8.88'` |
  | 20 STA_CODE | `'A1'` | `'B2'` |
  | 21 案件狀態 | `'正常'` | `'催收中'` |
  | 22 廠牌名稱 | `'Toyota'` | `'Honda'` |
  | 23 名單週期月數 | `'3'` | `'6'` |

---

### TS-F064-COLSEQ-004：欄 1「分處」與欄 12「部門名稱」來源不同（A-4 假設驗證）

- **相關 AC / BR**：AC-2 / BR-F064-03 欄 1 / 欄 12 / A-4（假設）
- **測試類型**：負向（來源區分）
- **測試層**：Unit
- **前置條件**：
  - mock raw row：pool.dept_name='台北分處'；emphire.dept_name='電銷一課'
  - 注意：兩者同名欄位但 SQL 中別名為 `emphire_dept_name`
- **步驟**：
  1. 執行 `formatRow(rawRow)`；取欄 1 與欄 12 輸出
- **期望結果**：
  - 欄 1 = `'台北分處'`（pool.dept_name）
  - 欄 12 = `'電銷一課'`（emphire_dept_name，emphire 別名）
  - 兩值不同（確認來源獨立，不互相混用）

---

## 三、REGRESSION — 破壞性排除驗證（AC-2 / BR-F064-04 / I-EXP-COLSRC-01）

> **設計依據**：F064 v2.0 §4 BR-F064-04；AD-E07-31 §7 不變式 I-EXP-COLSRC-01；GAP-1 修正。
>
> **驗收紅線（必須全綠）**：表頭與資料列均不得出現 `custo_no` / `cust_name` / `card_level` / `score`（任何大小寫變體）。此為回歸防護紅線，任一案例失敗即阻擋上線。
>
> **雙重驗證策略**：靜態掃描（grep 確認 SELECT 子句無禁止欄位）+ runtime 驗證（解析實際輸出確認表頭/資料列）。

### TS-F064-REGRESSION-001：xlsx 表頭不含 `custo_no` / `cust_name`（TC-155-09 延伸）

- **相關 AC / BR**：AC-2 / BR-F064-04 / TC-155-09 / GAP-1
- **測試類型**：Regression（破壞性排除）
- **測試層**：Unit（mock queryRunner）
- **前置條件**：mock 回傳任意 1 筆 raw row；觸發 xlsx 路徑
- **步驟**：
  1. 觸發 xlsx 匯出；解析第一列（表頭）
  2. 逐欄檢查是否含禁止字串
- **期望結果**：
  - 表頭陣列不含字串 `'custo_no'`（含任何大小寫）
  - 表頭陣列不含字串 `'cust_name'`（含任何大小寫）
  - 斷言：`headers.some(h => /custo_no/i.test(h)) === false`

---

### TS-F064-REGRESSION-002：xlsx 表頭不含 `card_level` / `score`

- **相關 AC / BR**：AC-2 / BR-F064-04 / TC-155-09 / GAP-1
- **測試類型**：Regression（破壞性排除）
- **測試層**：Unit（mock queryRunner）
- **步驟**：同 REGRESSION-001，對象改為 `card_level` / `score`
- **期望結果**：
  - 表頭陣列不含 `'card_level'`（含任何大小寫、含 `CARD_LEVEL`）
  - 表頭陣列不含 `'score'`（含任何大小寫）

---

### TS-F064-REGRESSION-003：CSV 表頭不含四禁止欄位（TC-155-09 CSV 版）

- **相關 AC / BR**：AC-2 / BR-F064-04 / TC-155-09
- **測試類型**：Regression（破壞性排除）
- **測試層**：Unit（mock queryRunner）
- **前置條件**：觸發 CSV 路徑
- **步驟**：
  1. 觸發 CSV 匯出；解析 CSV 第一列表頭
- **期望結果**：
  - CSV 第一列分割後欄名陣列不含 `custo_no` / `cust_name` / `card_level` / `score`（任何大小寫）
  - 此為與 REGRESSION-001/002 獨立的 CSV runtime 驗證

---

### TS-F064-REGRESSION-004：資料列不含四禁止欄位的資料

- **相關 AC / BR**：AC-2 / BR-F064-04 / I-EXP-COLSRC-01
- **測試類型**：Regression（資料層驗證）
- **測試層**：Unit
- **前置條件**：
  - mock raw row 含欄位：**禁止欄位不存在**（SQL SELECT 子句不含 custo_no 等）
  - `formatRow()` 輸出陣列長度 = 23
- **步驟**：
  1. 執行 `formatRow(rawRow)`；驗證輸出陣列
- **期望結果**：
  - 輸出陣列長度 = **23**（無多餘欄位）
  - 陣列無任何元素的 key 對應到禁止欄位

---

### TS-F064-REGRESSION-005：靜態掃描——join SQL 不 SELECT 禁止欄位（I-EXP-COLSRC-01 靜態）

- **相關 AC / BR**：I-EXP-COLSRC-01 / BR-F064-04 / GAP-1
- **測試類型**：Regression（靜態程式碼掃描）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `assignment-run-report.service.ts` 中 `buildExportQuery` 函式定義範圍
  2. 確認 SELECT 子句不含 `custo_no` / `cust_name` / `card_level` / `score`
- **期望結果**：
  - grep 搜尋 `/(custo_no|cust_name|card_level|score)/i` 在 `buildExportQuery` 函式體 = **0 個 match**
  - 搜尋 `assignment_run_snapshot` / `payload` 在 `exportResult` 呼叫鏈 = **0 個 match**（不讀 snapshot）

---

### TS-F064-REGRESSION-006：靜態掃描——CSV 路徑無 lines.join() 全量拼接（I-EXP-STREAM-01 靜態）

- **相關 AC / BR**：BR-F064-09 / I-EXP-STREAM-01 / OQ-F064-2 裁定
- **測試類型**：Regression（靜態程式碼掃描）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `assignment-run-report.service.ts` 中 CSV 路徑（`buildExportCsvStreaming` 函式）
  2. 確認無 `lines.push` / `lines.join` 全量拼接模式
- **期望結果**：
  - 函式體內不含 `lines.push(` 或 `lines.join(` 字串
  - 存在 `PassThrough` / `csvSink.push(` 等 streaming 寫入模式（確認換向）

---

## 四、FMT — 日期格式轉換邊界（AC-3 / BR-F064-05 / I-EXP-FMT-01）

> **設計依據**：F064 v2.0 §4 BR-F064-05；AD-E07-31 §2.6 日期格式轉換層。
>
> **核心原則**：兩欄均以**純字串型別**寫入，防止 Excel 自動轉型。`assignday` 原始值有兩種型態（整數字串 `'20260601'` 或 ISO 字串 `'2026-06-01'`），兩種都必須正確轉換。

### TS-F064-FMT-001：assignday 整數字串格式 → YYYYMMDD（TC-155-02，整數路徑）

- **相關 AC / BR**：AC-3 / BR-F064-05 / I-EXP-FMT-01 / TC-155-02
- **測試類型**：正向 / 邊界
- **測試層**：Unit（`formatRow()` pure function）
- **前置條件**：raw row `assignday = '20260601'`（8 位整數字串）
- **步驟**：執行 `formatRow(rawRow)`；取欄 3（指派日）輸出
- **期望結果**：
  - 欄 3 = `'20260601'`（不變，已是正確格式）
  - 型別 = `string`（非 number）

---

### TS-F064-FMT-002：assignday ISO 字串格式 → YYYYMMDD（TC-155-02，ISO 路徑）

- **相關 AC / BR**：AC-3 / BR-F064-05 / I-EXP-FMT-01 / TC-155-02
- **測試類型**：正向 / 邊界（ISO 輸入）
- **測試層**：Unit
- **前置條件**：raw row `assignday = '2026-06-01'`（ISO 格式字串）
- **步驟**：執行 `formatRow(rawRow)`；取欄 3
- **期望結果**：
  - 欄 3 = `'20260601'`（移除 `-`，8 位數字字串）
  - 不含任何 `-` 分隔符

---

### TS-F064-FMT-003：assignday 月份 leading-zero 不遺失（邊界，月=06）

- **相關 AC / BR**：AC-3 / BR-F064-05 / I-EXP-FMT-01
- **測試類型**：邊界（leading-zero 防護）
- **測試層**：Unit
- **前置條件**：raw row `assignday = '2026-06-01'`（月份 06 有 leading zero）
- **步驟**：執行 `formatRow(rawRow)`；取欄 3
- **期望結果**：
  - 欄 3 = `'20260601'`（**非** `'2026601'`，leading zero 保留）

---

### TS-F064-FMT-004：assignday 日份 leading-zero 不遺失（邊界，日=01）

- **相關 AC / BR**：AC-3 / BR-F064-05 / I-EXP-FMT-01
- **測試類型**：邊界（leading-zero 防護）
- **測試層**：Unit
- **前置條件**：raw row `assignday = '20260601'`（日期 01）
- **步驟**：取欄 3
- **期望結果**：欄 3 = `'20260601'`（非 `'2026061'` 或數值 `20260601`，保持 8 位字串）

---

### TS-F064-FMT-005：appl_date Date 物件 → YYYY/MM/DD（TC-155-03，Date 物件路徑）

- **相關 AC / BR**：AC-3 / BR-F064-05 / I-EXP-FMT-01 / TC-155-03
- **測試類型**：正向
- **測試層**：Unit
- **前置條件**：raw row `appl_date = new Date('2026-03-15')`（TypeORM Date 物件）
- **步驟**：執行 `formatRow(rawRow)`；取欄 6（進件日）
- **期望結果**：
  - 欄 6 = `'2026/03/15'`（斜線分隔）
  - 不含 `-`，不為 Date 序號

---

### TS-F064-FMT-006：appl_date 字串 → YYYY/MM/DD（'YYYY-MM-DD' 字串路徑）

- **相關 AC / BR**：AC-3 / BR-F064-05 / I-EXP-FMT-01
- **測試類型**：正向（字串輸入）
- **測試層**：Unit
- **前置條件**：raw row `appl_date = '2025-08-15'`（字串）
- **步驟**：執行 `formatRow(rawRow)`；取欄 6
- **期望結果**：欄 6 = `'2025/08/15'`

---

### TS-F064-FMT-007：appl_date 月份 leading-zero 保留（邊界，月=03）

- **相關 AC / BR**：AC-3 / BR-F064-05 / I-EXP-FMT-01
- **測試類型**：邊界（leading-zero 防護）
- **測試層**：Unit
- **前置條件**：raw row `appl_date = '2025-03-01'`（月 03）
- **步驟**：取欄 6
- **期望結果**：欄 6 = `'2025/03/01'`（**非** `'2025/3/1'`）

---

### TS-F064-FMT-008：兩日期欄位輸出為字串型別（防 Excel 自動轉型）

- **相關 AC / BR**：BR-F064-05 / I-EXP-FMT-01
- **測試類型**：正向（型別強制）
- **測試層**：Unit
- **前置條件**：raw row 含 assignday + appl_date
- **步驟**：執行 `formatRow(rawRow)`；取欄 3 / 欄 6 值
- **期望結果**：
  - `typeof row[2] === 'string'`（欄 3，指派日）
  - `typeof row[5] === 'string'`（欄 6，進件日）
  - 兩值不為 `number` / `Date`（防 Excel 誤判整數序號）

---

## 五、CR — CR 三欄正確呈現（AC-4 / BR-F064-08）

> **設計依據**：F064 v2.0 §4 AC-4 / BR-F064-08；F102 已 commit on main（CR 三欄有值）。
>
> **前提**：欄 7/8/9 資料來源為 `ob_monthly_run_result.cr_id` / `cr_nm` / `is_cr`（F102 已填值）。

### TS-F064-CR-001：is_cr='Y' 案件三欄均有值（AC-4）

- **相關 AC / BR**：AC-4 / BR-F064-08 / TC-155-04
- **測試類型**：正向
- **測試層**：PG Integration
- **前置條件**：
  - seed 一筆 is_cr='Y'，cr_id='E003'，cr_nm='王小明'
- **步驟**：
  1. 觸發匯出；解析對應資料列
- **期望結果**：
  - 欄 7（CR_ID）= `'E003'`（非空）
  - 欄 8（CR_NM）= `'王小明'`（非空）
  - 欄 9（是否分配CR）= `'Y'`

---

### TS-F064-CR-002：is_cr='N' 案件 CR_ID / CR_NM 輸出空字串（AC-4）

- **相關 AC / BR**：AC-4 / BR-F064-08 / TC-155-04
- **測試類型**：負向（NULL→空字串）
- **測試層**：Unit
- **前置條件**：raw row is_cr='N'，cr_id=null，cr_nm=null
- **步驟**：執行 `formatRow(rawRow)`；取欄 7/8/9
- **期望結果**：
  - 欄 7 = `''`（null → 空字串）
  - 欄 8 = `''`（null → 空字串）
  - 欄 9 = `'N'`

---

### TS-F064-CR-003：同一匯出含 is_cr='Y' 與 'N' 兩種案件（TC-155-04 完整版）

- **相關 AC / BR**：AC-4 / TC-155-04
- **測試類型**：正向（混合案件）
- **測試層**：PG Integration
- **前置條件**：同一 run_id 含至少 1 筆 is_cr='Y' + 1 筆 is_cr='N'
- **步驟**：
  1. 觸發匯出；分別篩選兩種案件列
- **期望結果**：
  - is_cr='Y' 列：CR_ID 非空、CR_NM 非空
  - is_cr='N' 列：CR_ID 空、CR_NM 空
  - 兩種案件共存不互相影響

---

### TS-F064-CR-004：202606 月名單分派 2,073 筆 CR 案件 CR_ID 均非空（TC-155-04 legacy 規模）

- **相關 AC / BR**：AC-4 / F102 legacy 驗證
- **測試類型**：正向（規模驗證）
- **測試層**：PG Integration（或人工驗收）
- **前置條件**：202606 月名單分派 completed（run_id 含 F102 已執行結果）
- **步驟**：
  1. 匯出 CSV；篩選 is_cr='Y' 列
  2. 統計 CR_ID 空值筆數
- **期望結果**：
  - is_cr='Y' 筆數 ≈ 2,073（容許 ±10%）
  - is_cr='Y' 列中 CR_ID 空值筆數 = **0**（全非空）

---

## 六、JOINMISS — ob_emphire join-miss fallback（AC-5 / BR-F064-06 / I-EXP-JOINMISS-01）

> **設計依據**：F064 v2.0 §4 AC-5 / BR-F064-06；AD-E07-31 §2.7 WARNING log 策略。
>
> **WARNING log 彙總機制**：join-miss 不 per-row log；row-producer 結束後一次彙總（最多記 100 個 emplid；超過補 `truncated to 100 of N` 標示）。

### TS-F064-JOINMISS-001：emphire join-miss 時欄 12/14/15 輸出空值（AC-5 / TC-155-05）

- **相關 AC / BR**：AC-5 / BR-F064-06 / I-EXP-JOINMISS-01 / TC-155-05
- **測試類型**：負向（join-miss fallback）
- **測試層**：Unit
- **前置條件**：
  - mock raw row：emplid='X999'；emphire_dept_name=null；emp_nm=null；title_name=null
- **步驟**：
  1. 執行 `formatRow(rawRow)`；取欄 12/13/14/15
- **期望結果**：
  - 欄 12（部門名稱）= `''`（null → 空字串）
  - 欄 13（員編）= `'X999'`（仍輸出 emplid 原值，不受 join-miss 影響）
  - 欄 14（姓名）= `''`
  - 欄 15（職級）= `''`

---

### TS-F064-JOINMISS-002：欄 13 員編在 join-miss 時仍輸出 emplid 原值

- **相關 AC / BR**：AC-5 / BR-F064-06 / I-EXP-JOINMISS-01
- **測試類型**：正向（不受 join-miss 影響）
- **測試層**：Unit
- **前置條件**：raw row emplid='X999'，emphire 全欄 null
- **步驟**：取欄 13
- **期望結果**：欄 13 = `'X999'`（原值，不為空）

---

### TS-F064-JOINMISS-003：join-miss 不中斷整體匯出（AC-5）

- **相關 AC / BR**：AC-5 / BR-F064-06
- **測試類型**：負向（不中斷驗證）
- **測試層**：Integration（SQLite）
- **前置條件**：
  - mock queryRunner 回傳 3 筆 rows：第 2 筆 emphire 欄全 null（join-miss）；第 1/3 筆 emphire 命中
- **步驟**：
  1. 觸發 `exportResult(runId, 'csv', ...)`
  2. 解析 CSV 資料列數
- **期望結果**：
  - CSV 資料列數 = **3**（join-miss 不跳過；不中斷）
  - 第 1/3 列 emphire 欄有值；第 2 列欄 12/14/15 = 空字串

---

### TS-F064-JOINMISS-004：join-miss 後記一筆 WARNING log 彙總（BR-F064-06 / AD-E07-31 §2.7）

- **相關 AC / BR**：AC-5 / BR-F064-06
- **測試類型**：正向（WARNING log 驗證）
- **測試層**：Integration（SQLite）
- **前置條件**：
  - mock 2 筆 join-miss rows（emplid='X999', emplid='Y888'）
  - spy `logger.warn()`
- **步驟**：
  1. 觸發匯出；等待完成
  2. 取 `logger.warn()` 呼叫次數與參數
- **期望結果**：
  - `logger.warn()` 呼叫次數 = **1**（彙總，非 per-row 2 次）
  - log 訊息含 emplid 清單（`['X999', 'Y888']` 或等效格式）
  - log 訊息含 run_id

---

### TS-F064-JOINMISS-005：join-miss 超過 100 筆時 log 補 truncated 標示

- **相關 AC / BR**：BR-F064-06 / AD-E07-31 §2.7
- **測試類型**：邊界（大量 join-miss 彙總截斷）
- **測試層**：Unit
- **前置條件**：
  - mock 150 筆 join-miss rows
  - spy `logger.warn()`
- **步驟**：
  1. row-producer loop 結束後檢查 WARNING log
- **期望結果**：
  - log 呼叫次數 = **1**
  - log 訊息含 `truncated to 100 of 150` 或等效標示
  - log 中 emplid 清單長度 ≤ 100

---

## 七、OVERDUE — 逾期天數恆空保留欄（BR-F064-07）

> **設計依據**：F064 v2.0 §4 BR-F064-07；US-155 OPEN QUESTION-1 裁定（保留欄、輸出空值）。

### TS-F064-OVERDUE-001：overdue_day NULL → 輸出空值（BR-F064-07）

- **相關 AC / BR**：BR-F064-07
- **測試類型**：正向（恆空欄）
- **測試層**：Unit
- **前置條件**：raw row `overdue_day = null`（legacy 恆 NULL）
- **步驟**：執行 `formatRow(rawRow)`；取欄 18（逾期天數）
- **期望結果**：欄 18 = `''`（空字串；非 `'null'` 字串）

---

### TS-F064-OVERDUE-002：表頭仍保留「逾期天數」欄（欄序對齊 legacy）

- **相關 AC / BR**：BR-F064-07 / BR-F064-03 欄 18
- **測試類型**：正向（欄保留驗證）
- **測試層**：Unit
- **步驟**：
  1. 取 `EXPORT_HEADER_V2[17]`（索引 17 = 第 18 欄）
- **期望結果**：
  - `EXPORT_HEADER_V2[17] === '逾期天數'`
  - 欄 17 `STA_CODE` / 欄 19 `客戶利率` 欄序不因此改變

---

## 八、STREAM — Streaming 與 NoOffset 驗證（AC-6 / I-EXP-STREAM-01 / I-EXP-NOOFFSET-01）

> **設計依據**：F064 v2.0 §4 AC-6 / BR-F064-09；AD-E07-31 §2.2 / §2.2.1 CSV streaming 機制；I-EXP-STREAM-01 / I-EXP-NOOFFSET-01。

### TS-F064-STREAM-001：xlsx/CSV 共用 row-producer（I-EXP-STREAM-01）

- **相關 AC / BR**：AC-6 / BR-F064-09 / I-EXP-STREAM-01
- **測試類型**：正向（共用 producer 驗證）
- **測試層**：Unit
- **前置條件**：
  - spy `buildExportQuery` / cursor 呼叫；mock 回傳相同 10 筆 rows
  - 分別呼叫 xlsx 路徑與 CSV 路徑
- **步驟**：
  1. 呼叫 xlsx 路徑；記錄 `buildExportQuery()` 呼叫次數
  2. 呼叫 CSV 路徑；記錄同一函式呼叫次數
- **期望結果**：
  - 兩個路徑均呼叫 `buildExportQuery()` 一次（共用相同 SQL 建構邏輯）
  - 兩個路徑的資料列數相同（= 10）
  - 輸出格式不同（xlsx body 非文字；CSV body 為文字）

---

### TS-F064-STREAM-002：CSV 路徑使用 PassThrough streaming 非全量拼接（I-EXP-STREAM-01）

- **相關 AC / BR**：AC-6 / BR-F064-09 / I-EXP-STREAM-01 / OQ-F064-2 裁定
- **測試類型**：正向（streaming 換向驗證）
- **測試層**：Integration（SQLite）
- **前置條件**：mock 100 筆 rows；spy `PassThrough.push()` 呼叫次數
- **步驟**：
  1. 觸發 CSV 路徑；統計 `PassThrough.push()` 呼叫次數（應 = 1 表頭 + 100 資料列 = 101）
- **期望結果**：
  - `PassThrough.push()` 呼叫次數 ≥ 101（逐列 push，非一次性全量）
  - 無 `lines.join('\n')` 相關呼叫（REGRESSION-006 靜態驗證補強）

---

### TS-F064-STREAM-003：row-producer 不使用 OFFSET 分頁（I-EXP-NOOFFSET-01 靜態）

- **相關 AC / BR**：I-EXP-NOOFFSET-01 / OQ-F064-2 裁定
- **測試類型**：Regression（靜態掃描）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `buildExportQuery()` 與 `buildExportCsvStreaming()` 函式體
  2. 搜尋 `OFFSET` / `offset` 關鍵字
- **期望結果**：
  - grep 結果 = **0 個 match**（無 OFFSET 分頁）
  - 存在 cursor / stream 相關呼叫（TypeORM stream() 或 DECLARE cursor）

---

### TS-F064-STREAM-004：50k 筆 xlsx 匯出不 OOM（AC-6 / TC-155-06）

- **相關 AC / BR**：AC-6 / BR-F064-09 / TC-155-06
- **測試類型**：NFR（記憶體峰值）
- **測試層**：PG Integration（需 Postgres）
- **前置條件**：seed 50,000 筆 `ob_monthly_run_result`；記錄前後 `process.memoryUsage().heapUsed`
- **步驟**：
  1. 記錄 heapUsed 基準值
  2. 觸發 xlsx 匯出（等待完成）
  3. 記錄峰值 heapUsed
- **期望結果**：
  - 匯出在 5 分鐘內完成（BR-F064-10 timeout 上限）
  - 記憶體峰值增量 < 2GB（可接受範圍；200k × 23 欄 CSV ~100MB）
  - HTTP 回應 200 OK

---

### TS-F064-STREAM-005：50k 筆 CSV 匯出不 OOM（AC-6 / TC-155-06 CSV 版）

- **相關 AC / BR**：AC-6 / BR-F064-09 / TC-155-06
- **測試類型**：NFR（記憶體峰值）
- **測試層**：PG Integration（需 Postgres）
- **前置條件**：同 STREAM-004，格式改 CSV
- **步驟**：同 STREAM-004，對象改 CSV
- **期望結果**：
  - 記憶體峰值增量 < 2GB
  - 匯出在 5 分鐘內完成

---

## 九、SCOPE — 處長 scope WHERE 注入（AC-8 / BR-F064-13 / I-EXP-SCOPE-01）

> **設計依據**：F064 v2.0 §4 AC-8 / BR-F064-13/14；AD-E07-31 §2.5 scopeByCreator 套入 join SQL；I-EXP-SCOPE-01。
>
> **核心驗收**：scope filter 必須在 query 階段以 SQL WHERE 條件注入，不得 streaming fetch 後 in-memory 過濾（否則 exportedRowCount 不可信，且違反 streaming 記憶體 invariant）。

### TS-F064-SCOPE-001：section_chief actor → SQL 含 scope WHERE 子句（I-EXP-SCOPE-01）

- **相關 AC / BR**：AC-8 / BR-F064-13 / I-EXP-SCOPE-01 / TC-155-08
- **測試類型**：正向（WHERE 注入驗證）
- **測試層**：PG Integration
- **前置條件**：
  - actor `businessRole = 'section_chief'`；actorId = 'actor-uuid'
  - spy `DataSource.query()` 或 `queryRunner.manager.createQueryBuilder()`
- **步驟**：
  1. 以 section_chief actor 呼叫 `exportResult()`
  2. 捕捉實際執行的 SQL 字串
- **期望結果**：
  - SQL 含 `emplid IN (SELECT emplid FROM ob_empl_set WHERE created_by = ...)`（或等效 scope WHERE）
  - scope WHERE 出現在 `WHERE r.run_id = :runId` 之後（不在 post-fetch）

---

### TS-F064-SCOPE-002：director actor → SQL 不含 scope WHERE（bypass filter）

- **相關 AC / BR**：AC-8 / BR-F064-13 / I-EXP-SCOPE-01
- **測試類型**：正向（bypass 驗證）
- **測試層**：PG Integration
- **前置條件**：actor `businessRole = 'director'`
- **步驟**：
  1. 以 director actor 呼叫 `exportResult()`；捕捉 SQL
- **期望結果**：
  - SQL 不含 `created_by` / scope 子查詢
  - 回傳全公司資料列（不過濾）

---

### TS-F064-SCOPE-003：section_chief 匯出結果僅含轄區內資料列（TC-155-08 runtime 驗證）

- **相關 AC / BR**：AC-8 / BR-F064-13 / TC-155-08
- **測試類型**：正向（資料過濾正確性）
- **測試層**：PG Integration
- **前置條件**：
  - run_id=R1 共 100 筆；section_chief actorId='A01' 轄區內 50 筆（`ob_empl_set.created_by='A01'`）
- **步驟**：
  1. 以 section_chief 觸發匯出；解析資料列數
  2. 以 director 觸發相同 run_id 匯出；解析資料列數
- **期望結果**：
  - section_chief 匯出：**50 列**（轄區過濾）
  - director 匯出：**100 列**（全量）

---

### TS-F064-SCOPE-004：section_chief 轄區內無資料列仍回 200 + 僅表頭（BR-F064-14）

- **相關 AC / BR**：AC-8 / BR-F064-14
- **測試類型**：邊界（空結果）
- **測試層**：PG Integration
- **前置條件**：
  - run_id=R1 有 50 筆；section_chief actorId='B02' 轄區內 **0 筆**
- **步驟**：
  1. 以 section_chief (B02) 觸發匯出
- **期望結果**：
  - HTTP 200 OK（不回 404）
  - 回應含表頭列；資料列數 = **0**
  - `exportedRowCount = 0` 記入稽核 log

---

### TS-F064-SCOPE-005：scope filter 在 SQL WHERE 注入非 in-memory 過濾（I-EXP-SCOPE-01 靜態）

- **相關 AC / BR**：I-EXP-SCOPE-01
- **測試類型**：Regression（靜態掃描）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `exportResult()` 與 `buildExportCsvStreaming()` / `buildExportXlsxStreaming()` 函式體
  2. 搜尋 `filterByEmplId` / `filter(` / `in-memory` 等 post-fetch 過濾模式
- **期望結果**：
  - `filterByEmplId` 在 `exportResult` 呼叫鏈 = **0 個 match**（已換向為 SQL WHERE）
  - scope WHERE 在 `buildExportQuery` 中注入（靜態確認）

---

## 十、STATUS — 月名單分派未完成阻擋（AC-7 / BR-F064-12）

> **設計依據**：F064 v2.0 §4 AC-7 / BR-F064-12；維持 v1.1 AC-3 行為。

### TS-F064-STATUS-001：status='pending' → 422 ASSIGNMENT_RUN_NOT_COMPLETED

- **相關 AC / BR**：AC-7 / BR-F064-12 / TC-155-07
- **測試類型**：負向
- **測試層**：Integration（SQLite）
- **前置條件**：`assignment_run.status = 'pending'`
- **步驟**：呼叫 `GET /api/v1/assignment/runs/:runId/export?format=xlsx`
- **期望結果**：
  - HTTP 422
  - 回應體含錯誤碼 `ASSIGNMENT_RUN_NOT_COMPLETED`

---

### TS-F064-STATUS-002：status='running' → 422 ASSIGNMENT_RUN_NOT_COMPLETED

- **相關 AC / BR**：AC-7 / BR-F064-12 / TC-155-07
- **測試類型**：負向
- **測試層**：Integration（SQLite）
- **前置條件**：`assignment_run.status = 'running'`
- **步驟**：同 STATUS-001
- **期望結果**：HTTP 422 + `ASSIGNMENT_RUN_NOT_COMPLETED`

---

### TS-F064-STATUS-003：status='failed' → 422 ASSIGNMENT_RUN_NOT_COMPLETED

- **相關 AC / BR**：AC-7 / BR-F064-12
- **測試類型**：負向
- **測試層**：Integration（SQLite）
- **前置條件**：`assignment_run.status = 'failed'`
- **步驟**：同 STATUS-001
- **期望結果**：HTTP 422 + `ASSIGNMENT_RUN_NOT_COMPLETED`

---

### TS-F064-STATUS-004：status='completed' → 允許匯出（正向阻擋解除）

- **相關 AC / BR**：AC-7 / BR-F064-12
- **測試類型**：正向（阻擋解除）
- **測試層**：Integration（SQLite）
- **前置條件**：`assignment_run.status = 'completed'`
- **步驟**：同 STATUS-001
- **期望結果**：HTTP 200 OK（不回 422）；回應含檔案 body

---

## 十一、AUDIT — 匯出稽核 log（AC-9 / BR-F064-15）

> **設計依據**：F064 v2.0 §4 AC-9 / BR-F064-15；AD-E07-31 §2.8 after_value 結構。

### TS-F064-AUDIT-001：xlsx 匯出成功後寫入 assignment_audit_log

- **相關 AC / BR**：AC-9 / BR-F064-15
- **測試類型**：正向
- **測試層**：Integration（SQLite）
- **前置條件**：director actor；completed run；mock queryRunner 回傳 5 筆
- **步驟**：
  1. 觸發 xlsx 匯出
  2. 查詢 `assignment_audit_log`（action='EXPORT', entity_id=runId）
- **期望結果**：
  - 存在一筆 log：`action = 'EXPORT'`、`entity_type = 'assignment_run'`、`entity_id = runId`
  - `after_value` JSON 含：
    - `format: 'xlsx'`
    - `actorBusinessRole: 'director'`
    - `scopedByCreator: false`
    - `exportedRowCount: 5`

---

### TS-F064-AUDIT-002：section_chief 匯出稽核 log scopedByCreator=true

- **相關 AC / BR**：AC-9 / BR-F064-15 / AC-8 聯合
- **測試類型**：正向（scope 稽核）
- **測試層**：Integration（SQLite）
- **前置條件**：section_chief actor；mock scope 回傳 30 筆
- **步驟**：
  1. 觸發 CSV 匯出
  2. 查詢稽核 log
- **期望結果**：
  - `after_value.format = 'csv'`
  - `after_value.actorBusinessRole = 'section_chief'`
  - `after_value.scopedByCreator = true`
  - `after_value.exportedRowCount = 30`

---

### TS-F064-AUDIT-003：匯出失敗不寫稽核 log（500 timeout 情境）

- **相關 AC / BR**：AC-9 / BR-F064-10
- **測試類型**：負向（失敗不記錄）
- **測試層**：Integration（SQLite）
- **前置條件**：mock queryRunner timeout 超過 5 min（注入 error）
- **步驟**：
  1. 觸發匯出；預期回應 500 `EXPORT_FILE_EXPIRED`
  2. 查詢稽核 log
- **期望結果**：
  - HTTP 500 + `EXPORT_FILE_EXPIRED`
  - `assignment_audit_log` 無對應 action='EXPORT' 記錄（失敗不寫 log）

---

## 十二、DET — 確定性排序（I-EXP-DET-01）

> **設計依據**：AD-E07-31 §7 不變式 I-EXP-DET-01；`ORDER BY r.list_no, r.orgno, r.appl_no`。

### TS-F064-DET-001：同 run_id 兩次匯出列序完全相同

- **相關 AC / BR**：I-EXP-DET-01
- **測試類型**：確定性驗證
- **測試層**：PG Integration
- **前置條件**：seed 10 筆 run_id=R1（不同 list_no / orgno / appl_no 組合）
- **步驟**：
  1. 第一次觸發匯出；取 CSV 各列第 2 欄（案號）順序
  2. 第二次觸發相同 run_id 匯出；取相同欄位順序
- **期望結果**：
  - 兩次結果**逐列完全相同**（ORDER BY 確定性，I-EXP-DET-01）

---

### TS-F064-DET-002：ORDER BY 靜態確認——SQL 含 list_no, orgno, appl_no 排序

- **相關 AC / BR**：I-EXP-DET-01
- **測試類型**：靜態掃描
- **測試層**：Unit（靜態 grep）
- **步驟**：grep `buildExportQuery()` 函式體中 `ORDER BY` 子句
- **期望結果**：
  - 含 `ORDER BY r.list_no, r.orgno, r.appl_no`（或等效欄別名）
  - 不含 `ORDER BY RANDOM()` / `NEWID()` 等非確定性排序

---

## 十三、APLDATE — 進件日 source 驗證（I-EXP-APLDATE-01）

> **設計依據**：F064 v2.1 §4 BR-F064-03 欄 6 / GAP-3 裁定 / I-EXP-APLDATE-01；取 **ob_pool_data**.appl_date（timestamp 型別，取日期部分）非 run_result.appl_date。
>
> **v2.1 補充**：ob_pool_data.appl_date 為 timestamp（`dateColumnType`），TypeORM 傳入為 Date 物件，`formatRow()` 以 `toISOString().slice(0,10)` 取日期部分後轉 `YYYY/MM/DD`。詳見 LINEAGE-005。

### TS-F064-APLDATE-001：進件日取 ob_pool_data.appl_date 非 run_result.appl_date（I-EXP-APLDATE-01）

- **相關 AC / BR**：BR-F064-03 欄 6 / I-EXP-APLDATE-01 / GAP-3 / BR-F064-16
- **測試類型**：正向（來源驗證）
- **測試層**：PG Integration
- **前置條件**：
  - seed **`ob_pool_data`** (orgno='ORG01', appl_no='A001')：appl_date = `2025-03-01`
  - seed `ob_monthly_run_result`：appl_date = `2025-04-01`（F102 m300 補欄，不同值用以區分）
- **步驟**：
  1. 觸發匯出；取欄 6（進件日）值
- **期望結果**：
  - 欄 6 = `'2025/03/01'`（ob_pool_data 端值，非 `'2025/04/01'`）
  - 確認：GAP-3 + v2.1 裁定，統一 ob_pool_data 端

---

### TS-F064-APLDATE-002：靜態確認——SELECT 子句取 p.appl_date 來自 ob_pool_data（I-EXP-APLDATE-01 靜態）

- **相關 AC / BR**：I-EXP-APLDATE-01 / BR-F064-16
- **測試類型**：靜態掃描
- **測試層**：Unit（靜態 grep）
- **步驟**：grep `buildExportQuery()` SELECT 子句與 FROM 子句
- **期望結果**：
  - SELECT 含 `p.appl_date`（pool alias p，來自 `ob_pool_data`）
  - 不含 `r.appl_date`（run_result alias r）用於欄 6 位置
  - FROM 子句確認 p 為 `ob_pool_data`（不為 `ob_pool_data_list`）

---

## 十四、STATIC — 靜態掃描彙整（I-EXP-COLSRC-01 / I-EXP-NOOFFSET-01 / I-EXP-LINEAGE-01）

> 本群組彙整所有靜態 grep 斷言。REGRESSION-005/006、DET-002、APLDATE-002、SCOPE-005、STREAM-003、**LINEAGE-003** 之靜態斷言亦可歸入本群組共同執行。

### TS-F064-STATIC-001：export 函式不呼叫 loadAllPayloads（I-EXP-COLSRC-01）

- **相關 AC / BR**：I-EXP-COLSRC-01 / AD-E07-31 §3.1
- **測試類型**：靜態掃描
- **測試層**：Unit（靜態 grep）
- **步驟**：grep `exportResult()` 函式體
- **期望結果**：不含 `loadAllPayloads(` 呼叫（已移除）

---

### TS-F064-STATIC-002：EXPORT_HEADER_V2 常數 23 欄驗證（表頭定義靜態）

- **相關 AC / BR**：BR-F064-03 / AC-2
- **測試類型**：靜態掃描（常數驗證）
- **測試層**：Unit
- **步驟**：import `EXPORT_HEADER_V2`；取 length 與各欄值
- **期望結果**：
  - `EXPORT_HEADER_V2` 長度 = 23
  - 完整欄名陣列 `toEqual(['分處', '案號', '指派日', '名單代號', '名單名稱', '進件日', 'CR_ID', 'CR_NM', '是否分配CR', 'TIER', '部門代號', '部門名稱', '員編', '姓名', '職級', '專案類別', '專案名稱', '逾期天數', '客戶利率', 'STA_CODE', '案件狀態', '廠牌名稱', '名單週期月數'])`

---

### TS-F064-STATIC-003：getSummary / compareRuns 仍讀 snapshot（非 F064 路徑不受影響）

- **相關 AC / BR**：AD-E07-31 §3.2（不修改範圍）
- **測試類型**：Regression（不受影響驗證）
- **測試層**：Unit（靜態 grep）
- **步驟**：grep `getSummary()` / `compareRuns()` 函式體
- **期望結果**：
  - 兩函式仍含 `loadAllPayloads(` 或 `snapshotRepo` 呼叫（未被本次重構刪除）
  - 確認：只有 `exportResult()` 路徑換向，其他函式不受影響

---

### TS-F064-STATIC-004：tsc gate — TypeScript 型別無錯誤

- **相關 AC / BR**：F064 DoD / feedback_vitest_no_typecheck 教訓
- **測試類型**：靜態（型別）
- **測試層**：Unit（型別檢查）
- **步驟**：執行 `tsc --noEmit -p tsconfig.build.json`
- **期望結果**：退出碼 = 0（無型別錯誤）

---

### TS-F064-STATIC-005：靜態掃描——ob_pool_data_list 未被 exportResult 路徑引用（I-EXP-LINEAGE-01 靜態補強）

- **相關 AC / BR**：BR-F064-16 / I-EXP-LINEAGE-01
- **測試類型**：Regression（靜態掃描，**DoD 門檻**）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `assignment-run-report.service.ts` 中 `buildExportQuery()` 函式體
  2. 搜尋 `ob_pool_data_list`（任何拼法）
  3. 搜尋 `list_no = r.list_no AND orgno` 或三欄複合鍵模式（ob_pool_data_list 的 join 條件特徵）
- **期望結果**：
  - `ob_pool_data_list` 在 `buildExportQuery()` 函式體 = **0 個 match**
  - 三欄複合鍵 join 條件（含 list_no 的 pool join）= **0 個 match**
  - 存在 `ob_pool_data`（僅雙欄 orgno+appl_no join 形式）

---

## 十五、AUTH — 認證與 RBAC（API §5.1）

> **設計依據**：F064 v2.0 §5.1 API 錯誤回應；F002 §4.6.2 `DirectorOrSectionChiefGuard`。

### TS-F064-AUTH-001：未登入 → 401 AUTH_TOKEN_MISSING

- **相關 AC / BR**：API §5.1
- **測試類型**：負向
- **測試層**：Integration（SQLite）
- **前置條件**：無 Authorization header
- **步驟**：呼叫 `GET /api/v1/assignment/runs/:runId/export?format=xlsx`
- **期望結果**：HTTP 401 + `AUTH_TOKEN_MISSING`

---

### TS-F064-AUTH-002：businessRole 非 director / section_chief → 403 E07_ROLE_NOT_ASSIGNED

- **相關 AC / BR**：API §5.1 / F002 §4.6.2
- **測試類型**：負向（RBAC）
- **測試層**：Integration（SQLite）
- **前置條件**：actor role='user'（非 E07 業務角色）
- **步驟**：以 user token 呼叫匯出端點
- **期望結果**：HTTP 403 + `E07_ROLE_NOT_ASSIGNED`

---

### TS-F064-AUTH-003：run_id 不存在 → 404 ASSIGNMENT_RUN_NOT_FOUND

- **相關 AC / BR**：API §5.1
- **測試類型**：負向
- **測試層**：Integration（SQLite）
- **前置條件**：run_id='nonexistent-uuid'
- **步驟**：以合法 director token 呼叫匯出端點
- **期望結果**：HTTP 404 + `ASSIGNMENT_RUN_NOT_FOUND`

---

## 十六、自動化就緒度彙整

| 群組 | 案例數 | 自動化適合度 | 說明 |
|---|---|---|---|
| COLSRC | 6 | 高 | PG 真庫；pool 換表（ob_pool_data）seed 設計清晰 |
| LINEAGE | **5（DoD 紅線）** | 高 | LINEAGE-001/002 PG 不掉列計數；LINEAGE-003/005 Unit 靜態+formatRow |
| COLSEQ | 4 | 高 | 表頭常數驗證易自動化 |
| REGRESSION | 6 | 高 | **DoD 紅線**；靜態 grep + runtime 雙驗 |
| FMT | 8 | 高 | pure function，無外部依賴 |
| CR | 4 | 高 | PG Integration；seed 設計簡單 |
| JOINMISS | 5 | 高 | Integration + Unit；mock 清晰 |
| OVERDUE | 2 | 高 | pure function |
| STREAM | 5 | 中（NFR 2 案需 50k seed）| NFR 案例需大 seed，可週期跑 |
| SCOPE | 5 | 高 | PG Integration；scope WHERE 可捕捉 |
| STATUS | 4 | 高 | 輕量 Integration |
| AUDIT | 3 | 高 | Integration；spy writeAudit |
| DET | 2 | 高（1 PG + 1 靜態）| 確定性可自動化 |
| APLDATE | 2 | 高（1 PG + 1 靜態）| GAP-3 + v2.1 ob_pool_data 驗證 |
| STATIC | **5** | 高 | grep 自動化；含 STATIC-005 ob_pool_data_list 未引用 |
| AUTH | 3 | 高 | 標準 RBAC 模式 |
| **合計** | **68** | — | REGRESSION + LINEAGE 群組均為 DoD 阻擋門檻 |

### 手動驗收項目

| 項目 | 原因 |
|---|---|
| TC-155-06 OOM 大規模（> 200k 筆）| 需 prod 環境規模 seed，CI 環境難以模擬 |
| TC-155-04 202606 legacy 2,073 筆 CR 規模驗收 | 需真實月名單分派資料（PG Integration 可半自動化）|
| LINEAGE-001 202606 live 55,863/55,863 驗收 | 需真實 202606 月名單分派資料（LINEAGE-001 CI 版用 50 筆受控 seed）|

---

## 十七、測試缺口與開放問題（回報 spec-writer / architect）

以下問題尚待釐清，可能影響測試設計精確度：

| ID | 類別 | 問題描述 | 影響群組 | 建議處置 |
|---|---|---|---|---|
| GAP-TEST-001 | 架構實作細節 | `SectionChiefScopeService.buildScopeWhereClause()` 是否已實作？若不存在，SCOPE-001 mock 策略需調整（改 spy `buildExportQuery()` SQL 字串含 scope WHERE）。| SCOPE | tdd-implementation 確認後更新 SCOPE-001 前置條件 |
| GAP-TEST-002 | 測試環境 | `TypeORM queryRunner.stream()` 在 SQLite 不可用（AD-E07-31 §9 風險）。Unit/Integration（SQLite）測試必須 mock queryRunner；PG Integration 才跑真實 cursor。FMT/JOINMISS/OVERDUE/STATUS/AUDIT 群組改用 mock strategy；STREAM-004/005 需 PG 真庫。| STREAM / FMT | 已在各案例標示測試層；tdd-implementation 對齊 |
| GAP-TEST-003 | ~~Spec 細節~~ | ~~ob_pool_data_list INNER JOIN miss 問題~~（**已解：v2.1 換表為 ob_pool_data，血緣保證不掉列，此問題作廢**）| 已關閉 | 見 LINEAGE 群組 |
| GAP-TEST-004 | Spec 細節 | 檔案命名 `assignment_result_{YYYYMM}_{run_id 前 8 碼}.xlsx`：YYYYMM 取自何處？spec §4 AC-1 說明不夠明確（是 `project_workym` 還是匯出當下的系統時間？）。| 未設計（AC-1 覆蓋） | spec-writer 確認後補 AC-1 相關測試案例 |
| GAP-TEST-005 | 效能邊界 | BR-F064-10 timeout 5 min 在 CI 環境難以測試（CI job 不等 5 分鐘）。AUDIT-003 超時情境須 mock timeout injection（非真實等待）。| AUDIT-003 / STATUS | tdd-implementation 實作 injectable `EXPORT_TIMEOUT_MS` 參數 |
| GAP-TEST-006 | v2.1 新增 | ob_pool_data.appl_date 為 timestamp 型別（非 date）；LINEAGE-005 / APLDATE-001 須確認 TypeORM 實際傳入型別為 Date 物件（timestamp）而非字串。若 appl_date 在 PG 為 `date` 型別（非 timestamp），`toISOString()` 策略仍可用但 formatRow 實作細節需與 tdd-implementation 確認。| LINEAGE-005 / FMT-005/006 | tdd-implementation 確認欄位 DDL 型別後更新 formatRow 策略 |

---

## 十八、Worked Example 對齊確認（F064 §6）

本文件 COLSEQ-003 完整走查 spec §6 worked example 之 23 欄逐列輸出。oracle 由 spec-writer 提供，test-designer 確認對齊。

**確認項目**：
- c2 案件（emplid='X999'，emphire join-miss）：欄 12/14/15 空、欄 13='X999'——對齊 BR-F064-06
- 欄 18（逾期天數）兩案件均空——對齊 BR-F064-07
- c1 指派日 `'20260601'`（整數字串路徑）——對齊 I-EXP-FMT-01
- c1 進件日 `'2025/03/01'`（斜線分隔）——對齊 I-EXP-FMT-01
- 欄 1（分處）= pool.dept_name；欄 12（部門名稱）= emphire.dept_name——對齊 A-4 假設

---

*本文件由 Test Designer Agent 於 2026-06-17 依據 F064 v2.0 spec（US-155）、AD-E07-31（2026-06-17）、F102 test spec 體例撰寫。*
