---
last-updated: 2026-06-17
version: v1.0
change-summary: "F064 v2：對齊 legacy 23 欄匯出——移除 custo_no/cust_name/card_level/score 誤列欄位；資料來源從 snapshot payload 改為 ob_monthly_run_result 多表 join；新增 CR 三欄/指派日/進件日格式/名單名稱等欄位；CSV/xlsx 皆 streaming；supersedes US-084。"
supersedes: US-084
---

# US-155：匯出分派結果對齊 Legacy 23 欄（F064 v2）

> **Story ID**：US-155
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8
> **Feature**：F064 v2 匯出分派結果 23 欄對齊
> **取代**：[US-084](US-084-M04-export-assignment-result.md)（已 superseded）

---

## User Story

**As a** 業務部長 / 業務處長
**I want** 將本月分派結果匯出為 Excel 或 CSV 檔案，內容完整對齊 legacy 分派名單的 23 欄格式
**So that** 匯出內容可直接交付業務人員或上傳 CRM / 電話系統，欄位與舊系統完全相容，無需人工補欄

---

## 背景說明

US-084（F064 v1）匯出的欄位清單有兩個嚴重問題：

1. **AC-2 誤列欄位**：列出 `custo_no`（客戶編號）、`cust_name`（客戶姓名），但 legacy `reference/202606 分派名單.xlsx` 工作表 1 根本無此兩欄；實際對應欄為 `appl_no`（案號）。
2. **欄位數嚴重不足**：舊 spec 僅 8~9 欄，legacy 實際 23 欄，缺少名單名稱、進件日、CR 三欄、姓名/職級/部門名稱、專案類別/專案名稱、逾期天數、客戶利率、STA_CODE 等資訊。
3. **資料來源錯誤**：BR-1 指定從 `assignment_run_snapshot.payload` JSONB 讀取，但 snapshot 是瘦投影（僅 list_no/appl_no/card_level/tier_level/dept_id/emplid/score/is_cr），無法提供完整 23 欄。正確來源應為 `ob_monthly_run_result` 配合多表 join。

前置依賴已就緒：F102（commit on main）補齊月名單分派結果的 `cr_id`/`cr_nm`/`is_cr`/`emplid`/`assignday`，join 條件全齊。

---

## 23 欄定義（Authority Reference）

| 欄序 | 欄位名稱（中文）     | 資料來源                                       | 備註 |
|------|------------------|----------------------------------------------|------|
| 1    | 分處               | `ob_pool_data_list.dept_name`               | 分處，不調整（使用者已裁定）|
| 2    | 案號               | `ob_monthly_run_result.appl_no`（= `ob_pool_data_list.appl_no`）| 替代錯誤的 custo_no |
| 3    | 指派日             | `ob_monthly_run_result.assignday`           | 格式：`YYYYMMDD`（8位數字字串）|
| 4    | 名單代號           | `ob_monthly_run_result.list_no`             | |
| 5    | 名單名稱           | `ob_list_definition.list_nm`                | join 鍵：`list_no` |
| 6    | 進件日             | `ob_pool_data_list.appl_date`               | 格式：`YYYY/MM/DD`（斜線分隔）|
| 7    | CR_ID              | `ob_monthly_run_result.cr_id`               | 非 CR 案為 NULL |
| 8    | CR_NM              | `ob_monthly_run_result.cr_nm`               | 非 CR 案為 NULL |
| 9    | 是否分配CR         | `ob_monthly_run_result.is_cr`               | 值域：'Y' / 'N' |
| 10   | TIER               | `ob_monthly_run_result.tier_level`          | |
| 11   | 部門代號           | `ob_monthly_run_result.dept_id`             | 電銷課代號 |
| 12   | 部門名稱           | `ob_emphire.dept_name`                      | join 鍵：`ob_monthly_run_result.emplid = ob_emphire.emp_id` |
| 13   | 員編               | `ob_monthly_run_result.emplid`              | |
| 14   | 姓名               | `ob_emphire.emp_nm`                         | join 鍵同欄 12 |
| 15   | 職級               | `ob_emphire.title_name`                     | join 鍵同欄 12 |
| 16   | 專案類別           | `ob_pool_data_list.project_tp`              | |
| 17   | 專案名稱           | `ob_pool_data_list.spec_name`               | |
| 18   | 逾期天數           | `ob_pool_data_list.overdue_day`             | legacy 恆 NULL，輸出空欄（見 [OPEN QUESTION-1]）|
| 19   | 客戶利率           | `ob_pool_data_list.pro_rate`                | 非 `loan_rate`（已裁定）|
| 20   | STA_CODE           | `ob_pool_data_list.sta_code`                | |
| 21   | 案件狀態           | `ob_pool_data_list.sta_code_na`             | |
| 22   | 廠牌名稱           | `ob_pool_data_list.brand_name`              | |
| 23   | 名單週期月數       | `ob_pool_data_list.month_cnt`               | |

**Join 路徑**：
```
ob_monthly_run_result (by run_id)
  → ob_pool_data_list (list_no + orgno + appl_no)
  → ob_emphire (ob_monthly_run_result.emplid = ob_emphire.emp_id) [LEFT JOIN]
  → ob_list_definition (list_no) [LEFT JOIN]
```

---

## 驗收標準

### AC-1：觸發匯出並下載檔案

- **Given** 月名單分派已完成（`assignment_run.status = 'completed'`）
- **When** 業務部長 / 業務處長點擊「匯出結果」並選擇格式（Excel / CSV）
- **Then** 系統產生對應格式檔案，瀏覽器觸發下載
- **And** 檔案名稱格式：`assignment_result_{YYYYMM}_{run_id 前 8 碼}.xlsx`（或 `.csv`）

### AC-2：匯出欄位對齊 legacy 23 欄（破壞性修正 US-084 AC-2）

- **Given** 匯出動作觸發
- **When** 檔案產生完成
- **Then** 匯出檔案第一列為表頭，包含**以下 23 欄**（依序）：分處、案號、指派日、名單代號、名單名稱、進件日、CR_ID、CR_NM、是否分配CR、TIER、部門代號、部門名稱、員編、姓名、職級、專案類別、專案名稱、逾期天數、客戶利率、STA_CODE、案件狀態、廠牌名稱、名單週期月數
- **And** 資料從 `ob_monthly_run_result` + join `ob_pool_data_list` / `ob_emphire` / `ob_list_definition` 讀取（不從 snapshot JSONB 讀取）
- **And** 匯出欄位**不包含** `card_level`、`score`（legacy 工作表 1 無此二欄，移除）
- **And** 匯出欄位**不包含** `custo_no`、`cust_name`（legacy 無客戶編號/姓名欄位，US-084 AC-2 誤列）
- **And** 每一列代表一筆分派紀錄

### AC-3：欄位格式轉換

- **Given** 匯出資料含 `assignday`（原始整數或字串）與 `appl_date`（原始 DATE 型別）
- **When** 匯出檔案產生
- **Then** 「指派日」欄輸出格式為 `YYYYMMDD`（8 位數字字串，例：`20260601`）
- **And** 「進件日」欄輸出格式為 `YYYY/MM/DD`（斜線分隔，例：`2026/06/01`）

### AC-4：CR 三欄正確呈現

- **Given** 月名單分派已執行 F102 CR 優先分派（commit on main）
- **When** 匯出 is_cr = 'Y' 的案件
- **Then** `CR_ID` 欄 = `ob_monthly_run_result.cr_id`（非 NULL 且非空字串）
- **And** `CR_NM` 欄 = `ob_monthly_run_result.cr_nm`（非 NULL 且非空字串）
- **And** `是否分配CR` 欄 = 'Y'
- **And** 非 CR 案件（is_cr = 'N'）的 `CR_ID`/`CR_NM` 欄輸出空值（NULL → 空字串或空格）

### AC-5：ob_emphire join 不到時的 fallback 處理

- **Given** 某筆 `ob_monthly_run_result.emplid` 在 `ob_emphire` 中查無對應 `emp_id`（ETL 尚未同步或員工不存在）
- **When** 產生匯出檔
- **Then** 該列的「部門名稱」、「姓名」、「職級」三欄輸出空值（不中斷整體匯出）
- **And** 「員編」欄仍輸出 `emplid` 原值（不受 join 失敗影響）

> [OPEN QUESTION-2]：ob_emphire join 失敗是否需要於後端 log 警告記錄？請 spec-writer / 架構師裁定 fallback 嚴重程度與 log level。

### AC-6：xlsx 與 CSV 皆採 streaming 寫入（修正 US-084 BR-2 未實作問題）

- **Given** 分派結果超過 50,000 筆
- **When** 業務部長 / 業務處長觸發匯出（任一格式）
- **Then** 後端採 streaming 方式產生檔案（不將全部結果讀入記憶體）
- **And** xlsx：使用 exceljs stream mode（或功能等效的 streaming 庫）
- **And** CSV：採 streaming 字串逐批輸出（取代現行 in-memory 全量拼接字串）
- **And** 整個匯出過程後端記憶體峰值不因資料量線性增長（50k 與 200k 筆時峰值差異 < 2×）
- **And** 顯示「正在產生檔案，請稍候…」提示（前端 loading 狀態）
- **And** 若超過 5 分鐘仍未完成，中斷並回傳 500 `EXPORT_FILE_EXPIRED`

### AC-7：月名單分派未完成阻擋匯出（維持 US-084 AC-3）

- **Given** 目標 `run_id` 的 `status` 為 `pending` / `running` / `failed`
- **When** 業務部長 / 業務處長嘗試匯出
- **Then** 後端回傳 422 `ASSIGNMENT_RUN_NOT_COMPLETED`
- **And** 前端匯出按鈕為 disabled 狀態，並顯示提示「分派執行中，完成後才能匯出」

### AC-8：處長視角 scope filter 維持（維持 F064 v1.1 AC-6）

- **Given** 登入者 `businessRole = 'section_chief'`（業務處長）
- **When** 業務處長呼叫 `GET /api/v1/assignment/runs/:runId/export?format=xlsx`（或 csv）
- **Then** service 層執行 `scopeByCreator(actorUser)` helper，匯出 streaming query 的 WHERE 條件限縮至處長轄區資料列
- **And** 整體匯出不被阻擋（回 200 OK，不回 403）
- **And** 若轄區內無任何分派紀錄，仍回 200 OK + 僅含表頭之檔案
- **And** `businessRole = 'director'` / `role = 'admin'`：bypass filter，匯出全公司資料
- **And** `assignment_audit_log.after_value` 記錄 `{ format, actorBusinessRole, scopedByCreator: true/false, exportedRowCount }`

### AC-9：匯出操作稽核 log（維持 F064 v1.1 AC-5）

- **Given** 匯出成功完成
- **When** 後端處理完成
- **Then** 寫入 `assignment_audit_log`（`action = 'EXPORT'`, `entity_type = 'assignment_run'`, `entity_id = run_id`）
- **And** `after_value` 記錄 `{ format, actorBusinessRole, scopedByCreator, exportedRowCount }`

---

## [SCHEMA GAP] / [OPEN QUESTION]

- **[SCHEMA GAP-1]**：`F064 spec AC-2 現行誤列 custo_no + cust_name`——legacy 工作表 1 根本無此兩欄。spec-writer 必須刪除這兩欄並以 `appl_no`（案號）替代。本 story 已在 AC-2 明確標示，但 spec F064 本體需同步修正，否則 TDD agent 會以舊 spec 為準。

- **[SCHEMA GAP-2]**：`F064 spec BR-1 資料來源錯誤`——現行 BR-1 指定 `assignment_run_snapshot.payload` JSONB，但 snapshot payload 是 8 欄瘦投影，無法提供 23 欄所需的 `cr_nm`/`assignday`/`appl_date`/`pro_rate`/`emp_nm`/`title_name`/`dept_name` 等。spec-writer 必須將 BR-1 改為「資料來源：`ob_monthly_run_result` 配合 join ob_pool_data_list / ob_emphire / ob_list_definition」。

- **[SCHEMA GAP-3]**：`ob_monthly_run_result.appl_date` 欄是否存在？——F102 migration m300 補了 `appl_date` 欄（用於 CR 優先分派的 `DATEADD(YEAR,-2,@SYS_DT) > appl_date` 判斷）。spec-writer 需確認此欄在 `ob_monthly_run_result` 已存在，可直接用於欄 6「進件日」的輸出。若 migration m300 實際存的是 pool 的 appl_date，則 join 讀 `ob_pool_data_list.appl_date` 即可。請架構師確認哪個 table 是「進件日」的正確 source of truth。

- **[OPEN QUESTION-1]**：`overdue_day` 恆 NULL 處理方式——legacy 工作表 1 的「逾期天數」欄全部為空。本 story 指定輸出空欄（NULL → 空字串）。是否需要在表頭仍保留此欄（legacy 對齊，欄序不能錯），還是可以根本不輸出？**裁定建議：保留欄位（欄序對齊），輸出空值**，待 spec-writer 確認。

- **[OPEN QUESTION-2]**：`ob_emphire` join 不到時 fallback 的 log level——AC-5 已定義 fallback 為輸出空值不中斷，但是否要在後端記錄 WARNING log（含 emplid 值）？此決策影響 TDD agent 的測試斷言。請 spec-writer / 架構師裁定。

- **[OPEN QUESTION-3]**：`ob_list_definition` join 的 key 是否僅 `list_no`，還是需要加上 `orgno`？ob_list_definition 若有 multi-tenant key，left join 條件須調整。請 spec-writer 確認 schema。

- **[OPEN QUESTION-4]**：是否需支援**分頁匯出**或**非同步 job 下載**（先回應 202 Accepted，背景產檔再通知下載 URL）？月名單分派全量可能超過 200k 筆，5 分鐘 streaming timeout 是否足夠？若不夠，背景 job 方案需額外 API 設計。**目前決策維持 streaming 同步下載（5 min timeout）**，若未來發現不足再另開 story。

---

## 測試案例

### TC-155-01：23 欄表頭與欄序驗證

- **Given**：月名單分派 completed，結果 100 筆
- **When**：業務部長觸發 xlsx 匯出
- **Then**：第一列表頭恰好 23 欄，欄序為「分處、案號、指派日、名單代號、名單名稱、進件日、CR_ID、CR_NM、是否分配CR、TIER、部門代號、部門名稱、員編、姓名、職級、專案類別、專案名稱、逾期天數、客戶利率、STA_CODE、案件狀態、廠牌名稱、名單週期月數」
- **And** 表頭不含「客戶編號」、「客戶姓名」、「CARD_LEVEL」、「score」

### TC-155-02：指派日 YYYYMMDD 格式

- **Given**：assignday 原始值為整數 `20260601` 或 DATE `2026-06-01`
- **When**：匯出產生
- **Then**：「指派日」欄輸出字串 `"20260601"`（8 位數，無分隔符）

### TC-155-03：進件日 YYYY/MM/DD 格式

- **Given**：appl_date 原始值為 `2026-03-15`（DATE 型別）
- **When**：匯出產生
- **Then**：「進件日」欄輸出字串 `"2026/03/15"`（斜線分隔）

### TC-155-04：CR 三欄正確輸出

- **Given**：202606 月名單分派含 2,073 筆 is_cr='Y' 案件（F102 已填值）
- **When**：匯出完整名單
- **Then**：is_cr='Y' 列的 CR_ID = cr_id（非空）、CR_NM = cr_nm（非空）、是否分配CR = 'Y'
- **And**：is_cr='N' 列的 CR_ID、CR_NM 輸出空值

### TC-155-05：ob_emphire join 不到時 fallback

- **Given**：某筆 emplid = 'X999' 在 ob_emphire 中無對應 emp_id
- **When**：匯出產生
- **Then**：「部門名稱」、「姓名」、「職級」三欄輸出空值，「員編」欄仍輸出 'X999'
- **And**：匯出不中斷，其他列正常輸出

### TC-155-06：streaming 大資料量不 OOM（> 50k 筆）

- **Given**：月名單分派 completed，結果 100,000 筆
- **When**：業務部長觸發 xlsx 匯出
- **Then**：後端在 5 分鐘內完成匯出，process 記憶體峰值 < 2GB
- **And**：CSV 匯出同一資料集，同樣在 5 分鐘內完成

### TC-155-07：月名單分派未完成阻擋

- **Given**：assignment_run.status = 'running'
- **When**：業務處長嘗試匯出
- **Then**：後端回 422 `ASSIGNMENT_RUN_NOT_COMPLETED`，前端匯出按鈕 disabled

### TC-155-08：處長視角 scope filter

- **Given**：業務處長（section_chief）登入，轄區只有 50 筆分派
- **When**：觸發匯出
- **Then**：匯出檔案含 50 列資料（不含轄區外資料）
- **And**：audit log `scopedByCreator = true`、`exportedRowCount = 50`

### TC-155-09：202606 回歸——欄位不含舊 custo_no/cust_name

- **Given**：已有 202606 月名單分派 completed 的資料
- **When**：匯出 CSV，以欄位名稱搜尋
- **Then**：表頭不含字串 "custo_no"、"cust_name"、"CARD_LEVEL"、"score"

---

## 依賴關係

- **Blocked By**：US-152（F102 CR 優先分派，補齊 cr_id/cr_nm/is_cr/emplid/assignday；已 commit on main）、US-081（月名單分派觸發，assignment_run.status 管理）
- **Blocks**：無

---

## Definition of Done

- [ ] AC-1 ~ AC-9 全部通過
- [ ] TC-155-01 ~ TC-155-09 全部通過
- [ ] 匯出表頭不含 custo_no / cust_name / card_level / score 的 regression 測試（TC-155-09）
- [ ] 23 欄欄序與 legacy 工作表 1 100% 對齊驗證
- [ ] streaming 記憶體峰值測試（> 50k 筆不 OOM，TC-155-06）
- [ ] SCHEMA GAP-1 ~ 3 由 spec-writer 確認並修正 F064 spec 後，才可啟動 TDD
- [ ] OPEN QUESTION-1 ~ 4 由 spec-writer / 架構師裁定後記入 spec
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨通過
- [ ] Code review 通過
- [ ] 文件已更新（F064 spec AC-2 欄位清單同步修正）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **取代**：[US-084](US-084-M04-export-assignment-result.md)（已 superseded）
- **相關 Stories**：US-152（F102 CR 優先分派，前置依賴）、US-081（月名單分派觸發）、US-083（結果摘要）
- **Spec（需修正）**：`docs/specs/features/F064-export-assignment-result.md`（AC-2 欄位 + BR-1 資料來源需同步更新）
- **Reference**：`reference/202606 分派名單.xlsx`（工作表 1，23 欄 authority）
- **Reference SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（legacy 欄位輸出參考）
