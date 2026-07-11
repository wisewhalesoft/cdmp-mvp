---
spec-id: F064
title: 匯出分派結果（對齊 legacy 23 欄明細）
feature-id: F064
source-story: US-155
supersedes-story: US-084
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "2.1"
date: 2026-06-17
status: Draft
blocked-by: F102
related: F061, F063, F067, F094, F101, F102
---

# F064: 匯出分派結果

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-17

> ⚠️ **血緣修正警告（v2.1 必讀）**：v2.0 之 BR-F064-01 將 pool 欄 join `ob_pool_data_list`（per-list 去重表）為**錯誤**——月名單分派 Stage 1 `INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data o`（共享池，PK = `orgno + appl_no`，**無 `list_no`**）衍生 result 列，`ob_pool_data_list` 僅於 Stage 1 被 LEFT JOIN 取 CR 三欄。匯出若 INNER JOIN `ob_pool_data_list`，**11.5% 案件不在該去重表 → 掉列**（live 驗證：join `ob_pool_data` 55,863/55,863 全對；join `ob_pool_data_list` 掉 11.5%）。**v2.1 修正：pool 欄 join 源改 `ob_pool_data`（by `orgno + appl_no`）**，並新增血緣不變式 **I-EXP-LINEAGE-01**（匯出列數 = 該 run 之 `ob_monthly_run_result` 列數，不掉列）。
>
> ⚠️ **破壞性修正警告（必讀）**：v2.0 對齊 legacy `reference/202606 分派名單.xlsx` 工作表 1 之 **23 欄明細**，與 v1.1 之 8~9 欄輸出**不相容**。三項 SCHEMA GAP 修正（§11）：(GAP-1) 刪除誤列之 `custo_no` / `cust_name`、改以 `appl_no`（案號）；(GAP-2) 資料來源由 `assignment_run_snapshot.payload`（8 欄瘦投影）改為 `ob_monthly_run_result`（by `run_id`）多表 join；(GAP-3) 進件日 source = `ob_pool_data.appl_date`（v2.1 修正：原 v2.0 寫 `ob_pool_data_list.appl_date`）。下游 TDD agent 必須以本 v2.1 spec 為準，否則匯出欄位錯誤或掉列。
>
> **v2.1（2026-06-17 / live 匯出血緣 bug 修正）**：pool 欄 join 源由 `ob_pool_data_list` 改 `ob_pool_data`（by `orgno + appl_no`，維持 INNER JOIN 不掉列）；AC-2 欄位表 10 個 pool 欄來源 `ob_pool_data_list.*` → `ob_pool_data.*`（欄名不變）；進件日（欄 6）source 改 `ob_pool_data.appl_date`（**注意 `dateColumnType`：PG=timestamp / SQLite=datetime，格式化只取日期部分 `YYYY/MM/DD`**）；新增 BR-F064-16 + I-EXP-LINEAGE-01（不掉列）。architect 同步修 AD（pool 源改 `ob_pool_data`）。其餘 v2.0 內容不變。
>
> **v2.0（2026-06-17 / US-155，supersedes US-084）**：依 US-155（已核可，supersedes US-084）落地 legacy 23 欄對齊。範圍：
> - **AC-2 重寫**為 legacy 23 欄表（含欄序 / 來源 / join 鍵 / 格式），移除 `custo_no` / `cust_name` / `card_level` / `score`。
> - **BR-1 資料來源**改 `ob_monthly_run_result` join pool（v2.1 = `ob_pool_data`）/ `ob_emphire` / `ob_list_definition`。
> - **BR-2** 明訂 xlsx **與 CSV 皆 streaming**（補回 v1.1 CSV 未實作之 in-memory 拼接問題）。
> - 新增格式轉換 BR（指派日 `YYYYMMDD` / 進件日 `YYYY/MM/DD`）、`ob_emphire` join-miss fallback BR、`overdue_day` 恆空保留欄 BR。
> - 保留 v1.1 AC-3（422 阻擋）/ AC-5（稽核）/ AC-6（處長 scope filter）。
> - **樞紐 sheet 先不做**（另案，§7 legacy 差異表）。
>
> **刻意未動（邊界，交 system-architect）**：不撰寫架構決策文件（AD-* / `architecture-spec.md`）；不撰寫 production / test 程式碼 / migration。多表 join 下推 SQL 設計、CSV streaming 實作機制、效能與 200k+ 背景 job 方案列為**架構師 OQ**（§12）。`data-model.md` 之 `ob_monthly_run_result` ↔ `ob_pool_data` / `ob_emphire` / `ob_list_definition` join 路徑文字補充亦列架構師 OQ。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_monthly_run_result` / `ob_pool_data`）+ [data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（姓名/職級/部門名稱 join）+ [error-handling.md#assignment-errors](../error-handling.md#assignment-errors)+ entity：`ob-monthly-run-result`（`run_id`/`list_no`/`orgno`/`appl_no`/`cr_id`/`cr_nm`/`is_cr`/`tier_level`/`dept_id`/`emplid`/`assignday`）/ **`ob-pool-data`**（PK `orgno`+`appl_no`；`dept_name`/`appl_date`(timestamp)/`project_tp`/`spec_name`/`overdue_day`/`pro_rate`/`sta_code`/`sta_code_na`/`brand_name`/`month_cnt`；**v2.1 pool 源；非 `ob_pool_data_list`**）/ `ob-emphire`（`emp_id`/`emp_nm`/`title_name`/`dept_name`）/ `ob-list-definition`（`list_no`/`list_nm`） |
| Test Designer | 本文件 §4 AC（AC-1~AC-9）+ §6 worked example + US-155 §測試案例（TC-155-01~09） |
| QA / Tester | 本文件 + `nfr.md`（匯出效能 / streaming）+ [error-handling.md#assignment-errors](../error-handling.md#assignment-errors) |
| UI/UX Designer | 本文件（§8 UI/UX 需求） |
| Architect | 本文件 §11 schema gap + §12 架構師 OQ（**4 項待裁：join 下推 SQL 設計 / CSV streaming 機制 / 200k+ 背景 job / data-model join 路徑補述**）+ `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長 / 業務處長將已完成月名單分派的分派結果，匯出為對齊 legacy 分派名單格式的 **Excel（xlsx）或 CSV** 檔案。匯出明細為 legacy `reference/202606 分派名單.xlsx` 工作表 1 之 **23 欄**，資料源為 `ob_monthly_run_result`（by `run_id`）配合 `ob_pool_data`（by `orgno + appl_no`，Stage 1 源表）/ `ob_emphire` / `ob_list_definition` 多表 join。xlsx 與 CSV 皆採 streaming 寫入避免記憶體溢出。匯出內容欄位與舊系統完全相容，可直接交付業務人員或上傳至 CRM / 電話系統，無需人工補欄。

## 2. 使用者故事

**As a** 業務部長 / 業務處長
**I want** 將本月分派結果匯出為 Excel 或 CSV 檔案，內容完整對齊 legacy 分派名單的 23 欄格式
**So that** 匯出內容可直接交付業務人員或上傳 CRM / 電話系統，欄位與舊系統完全相容，無需人工補欄

## 3. 前置條件

- 業務部長 / 業務處長已登入並持有有效 JWT Token，且通過 `DirectorOrSectionChiefGuard`（依 F002 §4.6.2）。
- 目標 `run_id` 存在於 `assignment_run` 且 `status = 'completed'`。
- [F102](F102-cr-priority-assignment.md)（commit on main）已補齊 `ob_monthly_run_result` 之 `cr_id` / `cr_nm` / `is_cr` / `emplid` / `assignday`；join 條件全齊（CR 三欄非空、`emplid` 有值）。
- `ob_emphire`（PK `emp_id`）由 E04 + E05 雙層 ETL 維護（姓名 / 職級 / 部門名稱 join 來源）。
- `ob_list_definition`（PK `list_no`）有名單名稱（`list_nm`）。

## 4. 業務規則與驗收標準

> **BR / AC 對照**：每條 AC 對應一或多條業務規則 BR-F064-xx。BR 為「實作必須遵守的規範」，AC 為「可驗證的 Given/When/Then 斷言」。

### 資料來源與 join（GAP-2 修正；v2.1 pool 源血緣修正）

**BR-F064-01（資料來源——多表 join，取代 snapshot payload）**：匯出資料來源為 `ob_monthly_run_result`（`WHERE run_id = :runId`），配合以下 join：

```
ob_monthly_run_result r  (by run_id)
  → JOIN ob_pool_data p                                 -- v2.1：pool 源 = ob_pool_data（非 ob_pool_data_list）
        ON p.orgno = r.orgno AND p.appl_no = r.appl_no   -- by (orgno, appl_no)，與 Stage 1 INSERT 源表一致 → 不掉列
  → LEFT JOIN ob_emphire e
        ON e.emp_id = r.emplid                          [join-miss → fallback，BR-F064-06]
  → LEFT JOIN ob_list_definition d
        ON d.list_no = r.list_no                        [join key = list_no，OQ 裁定]
```

**血緣理由（v2.1，I-EXP-LINEAGE-01）**：月名單分派 Stage 1 之 `INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data o`（共享池，PK = `orgno + appl_no`，**無 `list_no`**）衍生 result 列；`ob_pool_data_list`（per-list 去重表）僅於 Stage 1 被 LEFT JOIN 取 CR 三欄（`cr_id` / `cr_nm` / `is_cr`），**非** result 列的母體。匯出 pool 欄因此必須 join **`ob_pool_data`**（by `orgno + appl_no`）才能保證 `ob_pool_data` ⊇ `ob_monthly_run_result`、INNER JOIN 不掉列。若誤 join `ob_pool_data_list`，約 11.5% 案件不在該去重表 → INNER JOIN 掉列（live 驗證：`ob_pool_data` 55,863/55,863 全對；`ob_pool_data_list` 掉 11.5%）。`ob_pool_data` 具備全部 10 個匯出 pool 欄屬性（`dept_name` / `appl_date` / `pro_rate` / `sta_code` / `sta_code_na` / `project_tp` / `spec_name` / `brand_name` / `overdue_day` / `month_cnt`），matched 列值與 `ob_pool_data_list` 逐欄相同（無回歸）。

**不從** `assignment_run_snapshot.payload`（`snapshot_type = 'result'`）JSONB 讀取——該 snapshot 為 8 欄瘦投影（僅 `list_no` / `appl_no` / `card_level` / `tier_level` / `dept_id` / `emplid` / `score` / `is_cr`），無法提供 23 欄所需之 `cr_nm` / `assignday` / `appl_date` / `pro_rate` / `emp_nm` / `title_name` / `dept_name` / `list_nm` 等欄位（GAP-2，§11）。

**BR-F064-02（每列一筆分派紀錄）**：匯出檔每一資料列代表 `ob_monthly_run_result` 之一筆分派紀錄（一個 `run_id` + `list_no` + `orgno` + `appl_no` 組合）。

**BR-F064-16（匯出列數不掉列，I-EXP-LINEAGE-01）**：匯出之資料列數**必須等於**該 `run_id` 之 `ob_monthly_run_result` 列數（扣除處長 scope filter 縮列後之列數，BR-F064-13）。pool join 為 INNER JOIN 但因 `ob_pool_data` 為 Stage 1 源表、保證涵蓋全部 result 列，故不得有任何 result 列因 pool join 失配而遺漏。此為 DoD 驗收門檻（對齊 live 驗證 55,863/55,863）。`ob_emphire` / `ob_list_definition` 為 LEFT JOIN，join-miss 不掉列（輸出空值，BR-F064-06）。

#### AC-1：觸發匯出並下載檔案（維持 v1.1 AC-1）

- **Given** 月名單分派已完成（`assignment_run.status = 'completed'`）
- **When** 業務部長 / 業務處長點擊「匯出結果」並選擇格式（Excel / CSV）
- **Then** 系統產生對應格式檔案，瀏覽器觸發下載
- **And** 檔案名稱格式：`assignment_result_{YYYYMM}_{run_id 前 8 碼}.xlsx`（或 `.csv`）

### 匯出欄位（23 欄，GAP-1 修正）

**BR-F064-03（匯出欄位 = legacy 23 欄明細）**：匯出檔第一列為表頭，依下表欄序輸出 **23 欄**（authority = `reference/202606 分派名單.xlsx` 工作表 1）。每欄之資料來源、join 鍵與輸出格式如下：

| 欄序 | 欄位名稱（表頭） | 資料來源（欄位） | join 鍵 / 備註 | 輸出格式 |
|------|----------------|------------------|----------------|----------|
| 1 | 分處 | `ob_pool_data.dept_name` | pool（orgno+appl_no）| 原值字串 |
| 2 | 案號 | `ob_monthly_run_result.appl_no`（= `ob_pool_data.appl_no`）| 取代誤列之 `custo_no` | 原值字串 |
| 3 | 指派日 | `ob_monthly_run_result.assignday` | F102 已填值 | **`YYYYMMDD`**（8 位數字字串，BR-F064-05）|
| 4 | 名單代號 | `ob_monthly_run_result.list_no` | — | 原值字串 |
| 5 | 名單名稱 | `ob_list_definition.list_nm` | LEFT JOIN，key = `list_no` | 原值字串 |
| 6 | 進件日 | `ob_pool_data.appl_date` | pool（GAP-3，v2.1）；`dateColumnType`（timestamp）| **`YYYY/MM/DD`**（斜線分隔、只取日期，BR-F064-05）|
| 7 | CR_ID | `ob_monthly_run_result.cr_id` | F102 已填值；非 CR 案為 NULL | 原值 / NULL→空 |
| 8 | CR_NM | `ob_monthly_run_result.cr_nm` | F102 已填值；非 CR 案為 NULL | 原值 / NULL→空 |
| 9 | 是否分配CR | `ob_monthly_run_result.is_cr` | 值域 `'Y'` / `'N'` | 原值字串 |
| 10 | TIER | `ob_monthly_run_result.tier_level` | F100 Stage 2 寫入 | 原值字串 |
| 11 | 部門代號 | `ob_monthly_run_result.dept_id` | 電銷課代號 | 原值字串 |
| 12 | 部門名稱 | `ob_emphire.dept_name` | LEFT JOIN，key = `r.emplid = e.emp_id`；join-miss→空（BR-F064-06）| 原值 / 空 |
| 13 | 員編 | `ob_monthly_run_result.emplid` | F101/F102 已填值；不受 join 失敗影響 | 原值字串 |
| 14 | 姓名 | `ob_emphire.emp_nm` | LEFT JOIN，key 同欄 12；join-miss→空 | 原值 / 空 |
| 15 | 職級 | `ob_emphire.title_name` | LEFT JOIN，key 同欄 12；join-miss→空 | 原值 / 空 |
| 16 | 專案類別 | `ob_pool_data.project_tp` | pool | 原值字串 |
| 17 | 專案名稱 | `ob_pool_data.spec_name` | pool | 原值字串 |
| 18 | 逾期天數 | `ob_pool_data.overdue_day` | pool；legacy 恆 NULL（BR-F064-07）| 保留欄、輸出空值 |
| 19 | 客戶利率 | `ob_pool_data.pro_rate` | pool；**非** `loan_rate`（已裁定）| 原值 |
| 20 | STA_CODE | `ob_pool_data.sta_code` | pool | 原值字串 |
| 21 | 案件狀態 | `ob_pool_data.sta_code_na` | pool | 原值字串 |
| 22 | 廠牌名稱 | `ob_pool_data.brand_name` | pool | 原值字串 |
| 23 | 名單週期月數 | `ob_pool_data.month_cnt` | pool | 原值 |

**BR-F064-04（明確排除欄位）**：匯出**不包含** `custo_no`、`cust_name`（legacy 工作表 1 無客戶編號 / 客戶姓名欄，US-084 AC-2 誤列，GAP-1）、亦**不包含** `card_level`、`score`（legacy 工作表 1 無此二欄）。表頭與資料列均不得出現此四欄。

#### AC-2：匯出欄位對齊 legacy 23 欄（破壞性修正 US-084 AC-2）

- **Given** 匯出動作觸發
- **When** 檔案產生完成
- **Then** 匯出檔第一列為表頭，依序包含 BR-F064-03 之 **23 欄**：分處、案號、指派日、名單代號、名單名稱、進件日、CR_ID、CR_NM、是否分配CR、TIER、部門代號、部門名稱、員編、姓名、職級、專案類別、專案名稱、逾期天數、客戶利率、STA_CODE、案件狀態、廠牌名稱、名單週期月數
- **And** 資料自 `ob_monthly_run_result` + join `ob_pool_data`（by orgno+appl_no）/ `ob_emphire` / `ob_list_definition` 讀取（不從 snapshot JSONB 讀取，BR-F064-01）
- **And** 匯出欄位**不包含** `custo_no` / `cust_name` / `card_level` / `score`（BR-F064-04）
- **And** 每一列代表一筆分派紀錄（BR-F064-02）
- **And** 匯出列數 = 該 run 之 `ob_monthly_run_result` 列數（不掉列，BR-F064-16 / I-EXP-LINEAGE-01）

#### AC-2b：匯出不掉列（pool 血緣，I-EXP-LINEAGE-01，v2.1 新增）

- **Given** 某 `run_id` 之 `ob_monthly_run_result` 有 N 筆（其中部分 `appl_no` 不在該名單之 `ob_pool_data_list` 去重表，但全數在 `ob_pool_data` 共享池）
- **When** 匯出（pool 欄 INNER JOIN `ob_pool_data` by `orgno + appl_no`）
- **Then** 匯出資料列數恰為 N 筆（扣除處長 scope filter 縮列後之列數），無任何 result 列因 pool join 失配遺漏（BR-F064-16）
- **And** 改用 `ob_pool_data_list` 為 pool 源時會掉約 11.5% 列——此為**禁止**之實作（live 驗證：`ob_pool_data` 55,863/55,863 全對）

### 欄位格式轉換

**BR-F064-05（日期格式轉換）**：
- 欄 3「指派日」：`ob_monthly_run_result.assignday`（原始整數或字串，例 `20260601` 或 DATE `2026-06-01`）→ 輸出 **`YYYYMMDD`**（8 位數字字串、無分隔符，例 `"20260601"`）。
- 欄 6「進件日」：`ob_pool_data.appl_date`（`dateColumnType`：PG = `timestamp` / SQLite = `datetime`，可能含時分秒，例 `2026-03-15 00:00:00`）→ **只取日期部分**輸出 **`YYYY/MM/DD`**（斜線分隔，例 `"2026/03/15"`；忽略 time 部分）。
- 兩欄輸出為字串以避免試算表軟體將其誤判為數字 / 日期序號（防 leading zero 遺失與 locale 解析差異）。

#### AC-3：欄位格式轉換

- **Given** 匯出資料含 `assignday`（原始整數或字串）與 `appl_date`（原始 DATE 型別）
- **When** 匯出檔案產生
- **Then** 「指派日」欄輸出格式為 `YYYYMMDD`（8 位數字字串，例 `20260601`）
- **And** 「進件日」欄輸出格式為 `YYYY/MM/DD`（斜線分隔，例 `2026/03/15`；timestamp 來源只取日期部分）

### CR 三欄呈現

**BR-F064-08（CR 三欄來源）**：欄 7/8/9（CR_ID / CR_NM / 是否分配CR）來源為 `ob_monthly_run_result.cr_id` / `cr_nm` / `is_cr`（F102 已填值）。`is_cr='Y'` 案件之 `cr_id` / `cr_nm` 非 NULL 且非空字串；`is_cr='N'` 案件之 `cr_id` / `cr_nm` 為 NULL → 輸出空字串。

#### AC-4：CR 三欄正確呈現

- **Given** 月名單分派已執行 [F102](F102-cr-priority-assignment.md) CR 優先分派（commit on main）
- **When** 匯出 `is_cr='Y'` 的案件
- **Then** `CR_ID` 欄 = `ob_monthly_run_result.cr_id`（非 NULL 且非空字串）
- **And** `CR_NM` 欄 = `ob_monthly_run_result.cr_nm`（非 NULL 且非空字串）
- **And** `是否分配CR` 欄 = `'Y'`
- **And** 非 CR 案件（`is_cr='N'`）之 `CR_ID` / `CR_NM` 輸出空值（NULL → 空字串）

### ob_emphire join-miss fallback

**BR-F064-06（ob_emphire join-miss fallback）**：欄 12（部門名稱）/ 14（姓名）/ 15（職級）以 `r.emplid = e.emp_id` LEFT JOIN `ob_emphire` 取得。若某筆 `emplid` 在 `ob_emphire` 查無對應 `emp_id`（ETL 尚未同步或員工不存在）→ 此三欄輸出**空值**，**不中斷整體匯出**。欄 13（員編）仍輸出 `r.emplid` 原值（不受 join 失敗影響）。
**並且**：後端記錄 **WARNING level log**（內容含 `emplid` 值與 `run_id`，供稽核追溯），每筆 join-miss 記一筆或彙總計數（彙總方式由架構師 / tdd 決定，但 log level = WARNING 為 spec 裁定，OQ 裁定）。匯出流程不因 join-miss 失敗回 500。

#### AC-5：ob_emphire join 不到時的 fallback 處理

- **Given** 某筆 `ob_monthly_run_result.emplid` 在 `ob_emphire` 中查無對應 `emp_id`
- **When** 產生匯出檔
- **Then** 該列之「部門名稱」、「姓名」、「職級」三欄輸出空值（不中斷整體匯出，BR-F064-06）
- **And** 「員編」欄仍輸出 `emplid` 原值
- **And** 後端記錄 WARNING log（含 `emplid` 與 `run_id`）

### overdue_day 恆空保留欄

**BR-F064-07（逾期天數恆空保留欄）**：欄 18（逾期天數）來源 `ob_pool_data.overdue_day` legacy 恆 NULL。匯出**保留此欄**（欄序對齊 legacy 工作表 1，不可省略），資料列一律輸出**空值**（NULL → 空字串 / 空格）。表頭仍含「逾期天數」。

### Streaming（GAP / BR-2 補回 CSV streaming）

**BR-F064-09（xlsx 與 CSV 皆 streaming）**：分派結果量大時（> 50,000 筆），xlsx 與 CSV **皆**採 streaming 寫入，不將全部結果讀入記憶體：
- **xlsx**：使用 exceljs stream mode（或功能等效之 streaming 庫）。
- **CSV**：採 streaming 字串逐批輸出（**取代 v1.1 之 in-memory 全量拼接字串**）。
- 整個匯出過程後端記憶體峰值不因資料量線性增長（50k 與 200k 筆時峰值差異 < 2×）。

**BR-F064-10（匯出逾時上限）**：匯出逾時上限 5 分鐘；超過回傳 500 `EXPORT_FILE_EXPIRED`，訊息：「檔案產生逾時，請稍後再試或聯繫 IT」。（200k+ 筆是否足夠 5 分鐘、是否需背景 job，列架構師 OQ-3，§12。）

**BR-F064-11（檔案命名）**：檔案名稱包含 `YYYYMM` + `run_id 前 8 碼`（`assignment_result_{YYYYMM}_{run_id 前 8 碼}.{xlsx|csv}`），便於識別；處長視角不額外附加處長識別碼，避免檔名洩漏 ID。

#### AC-6：xlsx 與 CSV 皆採 streaming 寫入（修正 US-084 BR-2 未實作問題）

- **Given** 分派結果超過 50,000 筆
- **When** 業務部長 / 業務處長觸發匯出（任一格式）
- **Then** 後端採 streaming 方式產生檔案（不將全部結果讀入記憶體，BR-F064-09）
- **And** xlsx：使用 exceljs stream mode（或功能等效之 streaming 庫）
- **And** CSV：採 streaming 字串逐批輸出（取代現行 in-memory 全量拼接字串）
- **And** 整個匯出過程後端記憶體峰值不因資料量線性增長（50k 與 200k 筆時峰值差異 < 2×）
- **And** 前端顯示「正在產生檔案，請稍候…」提示（loading 狀態）
- **And** 若超過 5 分鐘仍未完成，中斷並回傳 500 `EXPORT_FILE_EXPIRED`（BR-F064-10）

### 月名單分派未完成阻擋（維持 v1.1 AC-3）

**BR-F064-12（月名單分派未完成阻擋匯出）**：目標 `run_id` 之 `status` 為 `pending` / `running` / `failed` 時，後端回傳 422 `ASSIGNMENT_RUN_NOT_COMPLETED`，前端匯出按鈕為 disabled 狀態。

#### AC-7：月名單分派未完成阻擋匯出（維持 v1.1 AC-3）

- **Given** 目標 `run_id` 的 `status` 為 `pending` / `running` / `failed`
- **When** 業務部長 / 業務處長嘗試匯出
- **Then** 後端回傳 422 `ASSIGNMENT_RUN_NOT_COMPLETED`
- **And** 前端匯出按鈕為 disabled 狀態，並顯示提示「分派執行中，完成後才能匯出」

### 處長視角 scope filter（維持 v1.1 AC-6）

**BR-F064-13（處長轄區過濾）**：service 層使用 `scopeByCreator(actorUser)` helper 統一過濾（與 F063 BR-6 / F057 v1.1 / F082 BR-3 一致 pattern）；`businessRole = 'section_chief'` 自動於匯出 streaming query 之 WHERE 條件限縮至處長轄區內資料列；`businessRole = 'director'` / `role = 'admin'` bypass filter（匯出全公司資料）。

**BR-F064-14（過濾語意）**：過濾為「縮小資料列」而非「拒絕請求」；不回 403 / 422；若處長轄區內無任何分派紀錄，仍回 200 OK + 僅含表頭之檔案（不回 404）；一般使用者已於 `DirectorOrSectionChiefGuard` 階段被擋下（403 `E07_ROLE_NOT_ASSIGNED`）。

#### AC-8：處長視角匯出僅含轄區內資料列（維持 v1.1 AC-6）

- **Given** 登入者 `businessRole = 'section_chief'`（業務處長）且通過 `DirectorOrSectionChiefGuard`
- **When** 業務處長呼叫 `GET /api/v1/assignment/runs/:runId/export?format=xlsx`（或 csv）
- **Then** service 層執行 `scopeByCreator(actorUser)` helper，匯出 streaming query 之 WHERE 條件限縮至處長轄區資料列（BR-F064-13）
- **And** 整體匯出不被阻擋（回 200 OK + streaming 檔案，不回 403）
- **And** 產出檔僅含轄區內資料列，欄位與 AC-2 之 23 欄一致
- **And** 若轄區內無任何分派紀錄，仍回 200 OK + 僅含表頭之檔案（BR-F064-14）
- **And** `businessRole = 'director'` / `role = 'admin'`：bypass filter，匯出全公司資料
- **And** `assignment_audit_log.after_value` 記錄 `{ format, actorBusinessRole, scopedByCreator: true/false, exportedRowCount }`

### 匯出稽核（維持 v1.1 AC-5）

**BR-F064-15（匯出稽核 log）**：每次匯出成功寫入 `assignment_audit_log`（`action = 'EXPORT'`, `entity_type = 'assignment_run'`, `entity_id = run_id`）；`after_value` 記錄 `{ format, actorBusinessRole, scopedByCreator, exportedRowCount }`。

#### AC-9：匯出操作稽核 log（維持 v1.1 AC-5）

- **Given** 匯出成功完成
- **When** 後端處理完成
- **Then** 寫入 `assignment_audit_log`（`action = 'EXPORT'`, `entity_type = 'assignment_run'`, `entity_id = run_id`）
- **And** `after_value` 記錄 `{ format, actorBusinessRole, scopedByCreator, exportedRowCount }`（BR-F064-15）

## 5. API 規格

### 5.1 GET /api/v1/assignment/runs/:runId/export

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| format | string | 是 | `xlsx` / `csv` |

**Response — 200 OK**

- `Content-Type`：`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`（xlsx）或 `text/csv`
- `Content-Disposition`：`attachment; filename="assignment_result_202606_550e8400.xlsx"`
- Response body：檔案二進位 / 文字內容（streaming，BR-F064-09）

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_ROLE_NOT_ASSIGNED | `businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，依 F002 §4.6.2）|
| 404 | ASSIGNMENT_RUN_NOT_FOUND | `run_id` 不存在 |
| 422 | ASSIGNMENT_RUN_NOT_COMPLETED | 月名單分派尚未完成（BR-F064-12）|
| 500 | EXPORT_FILE_EXPIRED | 匯出超過 5 分鐘 timeout（BR-F064-10）|

> **無新錯誤碼**：v2.0 沿用 v1.1 之錯誤碼集合，未新增。`ob_emphire` join-miss 為 fallback（空值 + WARNING log，BR-F064-06），**不**回錯誤碼。

## 6. Worked Example（23 欄逐列走查）

> 供 test-designer 對齊。以 202606 月名單分派 `run_id='e3c839b7-…'` 之兩筆代表案件示意。

| 欄序/欄名 | CR 案件（c1）| 一般案件（c2，emphire join-miss）|
|---|---|---|
| 1 分處 | `pool.dept_name='台北分處'` | `'台中分處'` |
| 2 案號 | `appl_no='A2026060001'` | `'A2026060099'` |
| 3 指派日 | `assignday=20260601` → `"20260601"` | `assignday=20260603` → `"20260603"` |
| 4 名單代號 | `list_no='OB202606001'` | `'OB202606001'` |
| 5 名單名稱 | `list_definition.list_nm='2026年6月汽車名單'` | 同 |
| 6 進件日 | `ob_pool_data.appl_date=2025-03-01 00:00:00` → `"2025/03/01"`（只取日期）| `2025-08-15 …` → `"2025/08/15"` |
| 7 CR_ID | `cr_id='E003'` | `cr_id=NULL` → 空 |
| 8 CR_NM | `cr_nm='王小明'` | 空 |
| 9 是否分配CR | `is_cr='Y'` | `is_cr='N'` |
| 10 TIER | `tier_level='T2'` | `'T3'` |
| 11 部門代號 | `dept_id='XVE1'` | `dept_id='XVE2'` |
| 12 部門名稱 | `emphire.dept_name='電銷一課'`（emplid=E003 join 命中）| **空**（emplid='X999' join-miss → BR-F064-06）|
| 13 員編 | `emplid='E003'` | `emplid='X999'`（原值仍輸出）|
| 14 姓名 | `emphire.emp_nm='王小明'` | **空** |
| 15 職級 | `emphire.title_name='專員'` | **空** |
| 16 專案類別 | `pool.project_tp='01'` | `'02'` |
| 17 專案名稱 | `pool.spec_name='優質專案'` | `'一般專案'` |
| 18 逾期天數 | **空**（legacy 恆 NULL，BR-F064-07）| **空** |
| 19 客戶利率 | `pool.pro_rate=12.5` | `8.88` |
| 20 STA_CODE | `pool.sta_code='A1'` | `'B2'` |
| 21 案件狀態 | `pool.sta_code_na='正常'` | `'催收中'` |
| 22 廠牌名稱 | `pool.brand_name='Toyota'` | `'Honda'` |
| 23 名單週期月數 | `pool.month_cnt=3` | `6` |

c2 之 emphire join-miss：欄 12/14/15 空、欄 13 仍輸出 `'X999'`、後端記 WARNING log `{ emplid:'X999', run_id }`（BR-F064-06）。

## 7. Legacy 差異聲明（F064 v2.x 刻意偏離 legacy 之處）

| Legacy `reference/202606 分派名單.xlsx` 行為 | F064 v2.x 行為 | 原因 / BR |
|---|---|---|
| Excel 含多工作表（工作表 1 = 23 欄明細 + 樞紐分析 sheet）| **僅匯出工作表 1（23 欄明細）**；不產生樞紐分析 sheet | 樞紐 sheet 另案處理（使用者裁定）；本 feature 範圍限明細匯出（§12 OQ-4 旁註，非阻擋）|
| 「逾期天數」欄在 legacy 工作表 1 有欄位但值全空 | 保留欄（欄序對齊）、資料列一律輸出空值 | `overdue_day` 來源恆 NULL（BR-F064-07）|
| legacy 由 SP 系列（`st1_list` / `st2_dept` / `st3_emplid` / `st4_exchange`）產生明細 | CDMP 由 `ob_monthly_run_result` 多表 join 即時匯出（分派邏輯已由 F101/F102 落地至 result 表）| 分派計算與匯出解耦；匯出僅讀 result 表 + 維度表（BR-F064-01）|
| legacy 客戶利率欄可能對應多個利率欄位 | 固定取 `ob_pool_data.pro_rate`（**非** `loan_rate`）| 使用者已裁定 `pro_rate` 為客戶利率正確來源（BR-F064-03 欄 19）|
| —（v2.0 內部設計缺陷，非 legacy 差異）| pool 欄 join 源 = `ob_pool_data`（**非** `ob_pool_data_list`），by `orgno + appl_no` | v2.0 誤 join 去重表掉 11.5% 列；result 列源自 Stage 1 `FROM ob_pool_data`（BR-F064-01 / BR-F064-16 / I-EXP-LINEAGE-01）|

## 8. UI/UX 需求

- 「匯出結果」按鈕：顯示格式選擇下拉（Excel / CSV）。
- 匯出進行中：顯示 loading spinner + 「正在產生檔案，請稍候…」訊息（streaming 期間，AC-6）。
- 匯出失敗（500 `EXPORT_FILE_EXPIRED`）：顯示錯誤 toast + 「重試」按鈕。
- 月名單分派未完成：匯出按鈕 disabled，hover 顯示提示「分派執行中，完成後才能匯出」（AC-7）。

## 9. 相依性

- **Blocked By**：[F102](F102-cr-priority-assignment.md)（CR 三欄 / `emplid` / `assignday` 已填值，commit on main）、[F061](F061-trigger-assignment-run.md)（月名單分派完成、`assignment_run.status` 管理）、[F101](F101-stage3-4-proportional-assignment.md)（`emplid` / `tier_level` / `dept_id` 由 Stage 3/4 寫入）。
- **Blocks**：無。

## 10. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | `ob_emphire` 之 `emp_nm` / `title_name` / `dept_name` 由 E04 + E05 雙層 ETL 從舊 OB DB `OBEMPHIRE` 同步至 AppDB（E04 抓 raw → E05 Pipeline TargetLoad full replace）；join 鍵 `ob_monthly_run_result.emplid = ob_emphire.emp_id`。詳見 [data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)。 | Resolved（2026-05-05）|
| A-2 | 匯出格式支援 xlsx 與 csv；xlsx 使用 streaming 庫（如 `exceljs` stream mode），CSV 採 streaming 字串逐批輸出。 | [ASSUMPTION] |
| A-3 | `ob_pool_data`（PK `orgno + appl_no`）為月名單分派 Stage 1 之源表（`INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data`），故 `ob_pool_data` ⊇ `ob_monthly_run_result`（同 run 之每筆 result 列必在 pool 中）；匯出 pool 欄 join 鍵 = `orgno + appl_no`（不含 `list_no`）。`ob_pool_data_list`（per-list 去重表）**非** result 列母體，匯出不得以其為 pool 源（v2.1 修正）。 | Resolved（2026-06-17，live 驗證）|
| A-4 | 欄 12「部門名稱」取自 `ob_emphire.dept_name`（員工所屬電銷單位名稱，by emplid）；與欄 1「分處」（`ob_pool_data.dept_name`，案件所屬營業分處）為**不同**來源、不可混用。 | [ASSUMPTION] |

## 11. Schema Gap handoff（spec-writer 主動標示，US-155 已裁定，交架構師確認落地）

> US-155 已列三項 SCHEMA GAP（GAP-1~3），均已由使用者裁定；v2.1 因 live 匯出血緣 bug 增列 GAP-2b（pool 源）。本節彙整現況與 F064 spec 處置，交架構師於 join 下推 SQL 設計時確認 schema 對齊：

| Gap | 描述 | 現況 / 裁定 | F064 spec 處置 | handoff |
|-----|------|-----------|----------------|---------|
| **GAP-1：AC-2 誤列 custo_no / cust_name** | v1.1 AC-2 列出 `custo_no`（客戶編號）/ `cust_name`（客戶姓名），但 legacy 工作表 1 無此兩欄 | 已裁定：刪除此兩欄，案號改 `appl_no`；欄位數 9 → 23 | AC-2 重寫為 23 欄表（BR-F064-03）；明確排除（BR-F064-04）| 架構師確認 join SQL 不 SELECT `custo_no` / `cust_name` |
| **GAP-2：BR-1 資料來源錯誤** | v1.1 BR-1 指定 `assignment_run_snapshot.payload`（8 欄瘦投影），無法提供 23 欄所需欄位 | 已裁定：改 `ob_monthly_run_result`（by run_id）join **`ob_pool_data`（orgno+appl_no，v2.1 修正）** + `ob_emphire`（emplid→emp_id）+ `ob_list_definition`（list_no）| BR-F064-01 重寫 join 路徑 | 架構師設計多表 join 下推 SQL（OQ-1，§12）|
| **GAP-2b：pool 源血緣（v2.1 新增）** | v2.0 誤以 `ob_pool_data_list`（per-list 去重表）為 pool 源 → INNER JOIN 掉 11.5% 列 | 已查證 + live 驗證：result 列源自 Stage 1 `FROM ob_pool_data`（PK orgno+appl_no）；pool 源改 `ob_pool_data`，55,863/55,863 全對 | BR-F064-01 血緣理由 + BR-F064-16（I-EXP-LINEAGE-01）+ AC-2b | 架構師已同步修 AD（pool 源改 `ob_pool_data`）；確認 join 下推 SQL 用 `ob_pool_data` by (orgno,appl_no) |
| **GAP-3：進件日 source** | 欄 6「進件日」來源須確認 | 已裁定：source = **`ob_pool_data.appl_date`（v2.1，dateColumnType timestamp）**（已 join pool；與其他 pool 欄一致；與 F102 m300 補的 `ob_monthly_run_result.appl_date` 同值）| BR-F064-03 欄 6 標 source = `ob_pool_data.appl_date`；格式化只取日期（BR-F064-05）| 架構師確認 join 後取 `ob_pool_data.appl_date`（非 run_result.appl_date，雖同值，統一從 pool 取以與其他 pool 欄一致）|

## 12. 架構師 OQ（交 system-architect 裁示，spec-writer 附建議預設）

| ID | 問題 | 影響 | 建議預設 |
|----|------|------|---------|
| **OQ-1** | 多表 join 下推 SQL 設計：`ob_monthly_run_result` join **`ob_pool_data`（PK orgno+appl_no，v2.1）** + LEFT JOIN `ob_emphire`（emplid→emp_id）+ LEFT JOIN `ob_list_definition`（list_no）之 streaming query 如何下推？是否需索引支援（大資料量 join 效能）？ | 匯出 SQL 正確性（不掉列，I-EXP-LINEAGE-01）與效能；大資料量 join 不逾時 | 單一 SQL 多表 join，cursor / server-side stream 逐批 fetch；`ob_pool_data` PK(orgno,appl_no) 即 join 鍵（覆蓋率 100%、不掉列），`ob_emphire(emp_id)` PK 可支援 LEFT JOIN；若 join 後逾時，評估補索引（比照 m297/m298 模式）。AD 已同步改 pool 源為 `ob_pool_data` |
| **OQ-2** | CSV streaming 實作機制：v1.1 CSV 為 in-memory 全量拼接字串（OOM 風險）；改 streaming 後採何種庫 / 機制（Node stream / csv-stringify stream / 手動逐批 write）？xlsx 與 CSV 是否共用同一 row-producer（單一 query 餵兩種 writer）？ | CSV 記憶體峰值；xlsx/CSV 程式碼複用 | 單一 row-producer（streaming query cursor）餵 format-specific writer（exceljs stream / csv stream）；CSV 用 Node Transform stream 逐列 escape + write，不全量拼接 |
| **OQ-3** | 200k+ 筆背景 job 方案：5 分鐘 streaming timeout 對 200k+ 筆是否足夠？若不夠，是否改非同步背景 job（先回 202 Accepted，背景產檔 + 通知下載 URL）？需額外 API 設計（job 狀態查詢 / 下載端點）。 | 大資料量匯出可行性；API 介面 | **目前維持 streaming 同步下載（5 min timeout，BR-F064-10）**；背景 job 為另案（不阻擋本 feature）；若 deploy 後實測 200k+ 逾時，另開 story 走 pg-boss worker + 202 Accepted 模式（比照月名單分派 worker 抽離）|
| **OQ-4** | `data-model.md` 是否需補述 `ob_monthly_run_result` ↔ **`ob_pool_data`（orgno+appl_no）** / `ob_emphire` / `ob_list_definition` 之匯出 join 路徑（含 pool 血緣 + LEFT JOIN 語意）？此檔由 system-architect 維護，spec-writer 不改。 | data-model 文件完整性 | 補一段「F064 匯出 join 路徑」於 `ob_monthly_run_result` entity 章節，引用 BR-F064-01 / I-EXP-LINEAGE-01；標 pool 源 = `ob_pool_data`（非 `ob_pool_data_list`）、join 鍵與 LEFT JOIN fallback 語意 |

> **附帶（spec-writer 裁定，非交架構師）**：
> - US-155 OPEN QUESTION-1（`overdue_day` 恆空處理）已於 BR-F064-07 裁定：**保留欄、輸出空值**（欄序對齊 legacy）。
> - US-155 OPEN QUESTION-2（`ob_emphire` join-miss log level）已於 BR-F064-06 裁定：**fallback 輸出空值 + 後端 WARNING log（含 emplid）**，不中斷匯出。
> - US-155 OPEN QUESTION-3（`ob_list_definition` join key）已裁定：**join key = `list_no`**（單鍵；BR-F064-01 / BR-F064-03 欄 5）。
> - 樞紐分析 sheet：**先不做**（另案，§7 legacy 差異表；非本 feature 範圍）。

## 13. 相關

- 來源 story：[US-155](../../stories/epics/E07-app-customer-list-assignment/US-155-M04-export-assignment-result-23col.md)（supersedes US-084）
- 前置 / 交互：[F102](F102-cr-priority-assignment.md)（CR 三欄 / emplid / assignday 來源）、[F101](F101-stage3-4-proportional-assignment.md)（emplid / tier_level / dept_id 來源）、[F094](F094-monthly-run-result-table.md)（`ob_monthly_run_result` 表）、[F061](F061-trigger-assignment-run.md)（月名單分派完成）
- 結果驗收 / 差異：[F063](F063-view-run-result-summary.md)（結果摘要）、[F067](F067-compare-run-results.md)（差異報告）
- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_monthly_run_result` / `ob_pool_data`，v2.1 pool 源）、[data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（姓名 / 職級 / 部門名稱 join）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-2（匯出基底）；本 v2.x 之 join 下推 SQL（**pool 源 = `ob_pool_data`，v2.1 已同步修 AD**）/ CSV streaming / 背景 job 由 system-architect 承接（§12 OQ）
- Reference：`reference/202606 分派名單.xlsx`（工作表 1，23 欄 authority）；`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（legacy 分派欄位輸出參考，UTF-16LE）
