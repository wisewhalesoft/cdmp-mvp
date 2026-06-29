---
spec-id: F108
title: 匯出新增「樞紐分析」頁籤（靜態重現 legacy 工作表2 部門×員編×名單代號佔比交叉表）
feature-id: F108
source-story: US-171
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-06-29
status: Draft
blocked-by: F064
related: F063, F064, F067, F101, F102
related-stories: US-171
source-brief: "scratchpad/F108-ground-truth.md（F108 全流程事實基準，鎖定決策 §2 / 部門員編語意 §3 / 版面 §4 / 不變式 §7）"
reference: "reference/202606 分派名單.xlsx（工作表2 = 樞紐分析表3，% of parent row authority）"
---

# F108: 匯出新增「樞紐分析」頁籤

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-29

> **本 feature 範圍（後端 only）**：在既有 F064 v2.1 xlsx 匯出（端點 `GET /api/v1/assignment/runs/:runId/export?format=xlsx`）的第 1 頁籤 `assignment_result`（23 欄明細）之外，**新增第 2 頁籤「樞紐分析」**，靜態重現 legacy `reference/202606 分派名單.xlsx` 工作表2（`樞紐分析表3`）的「部門名稱 × 員編」列軸 × 「名單代號」欄軸、數值為 **% of parent row** 的交叉表。**無新頁面、無 route、無 sidebar、無前端變更**（匯出按鈕已存在於 `prototypes/33-run-summary.html`「匯出區塊（F064）」，`downloadRunExport(runId,'xlsx')` 無需改動）。
>
> **靜態交叉表（鎖定決策 D-1）**：exceljs 4.4.0 無原生樞紐表 API（無 `addPivotTable`，已驗證）。後端在既有匯出串流迴圈中同步累加聚合計數，預先計算 % of parent row 數值後寫成一般工作表，輸出數字與 legacy 樞紐一致。
>
> **刻意未動（邊界，交下游 agent）**：本文件僅撰寫 feature spec。架構決策文件（AD-*）、`architecture-spec.md`、`data-model.md` / `error-handling.md` 之補述、測試設計與 production 程式碼**不在本文件範圍**。聚合資料結構落點、WorkbookWriter 多頁籤 commit 順序之實作機制由 system-architect / tdd-implementation 承接（參考 source-brief §5，列為下游裁示）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F064-export-assignment-result.md](F064-export-assignment-result.md)（`buildExportQuery` 多表 join / `cursorRows` streaming / `formatRow` / `RawExportRow` 欄位）+ source-brief §5（實作落點）。聚合僅讀 `RawExportRow` 三欄：`emphire_dept_name`（明細欄 12）/ `emplid`（明細欄 13）/ `list_no`（明細欄 4） |
| Test Designer | 本文件 §4 AC（AC-1~AC-8）+ §6 Worked Example（唯一 oracle）+ US-171 §測試案例（TC-171-01~12）+ source-brief §6（測試要點）|
| QA / Tester | 本文件 + [F064-export-assignment-result.md](F064-export-assignment-result.md)（匯出 streaming / scope filter 基底）+ `nfr.md`（匯出記憶體峰值）|
| Architect | 本文件 §7 不變式 + §8 下游 OQ（聚合落點 / 多頁籤 commit 順序 / 空表語意）+ source-brief §5 |
| UI/UX Designer | **不適用**（無前端變更）|

---

## 1. 功能摘要

在分派結果 xlsx 匯出檔案中，於既有 23 欄明細頁籤（`assignment_result`）之後附加第 2 頁籤「樞紐分析」，呈現以「部門名稱（外層）× 員編（內層）」為列軸、「名單代號（`list_no`）」為欄軸的交叉表，數值為 **% of parent row（父列總和百分比，三層語意見 BR-F108-04）**，數字格式 `0.0%`，最右側附「總計」欄。業務部長 / 業務處長可在匯出檔案中直接掌握各部門 / 員編在各名單的分派佔比分布，並與 legacy 工作表2 對帳，免除人工建立樞紐表。彙總資料源重用既有 F064 `buildExportQuery` 串流列——處長 scope filter 自動沿用，樞紐只彙總 scoped 後的列（SCOPE 紅線）。**CSV 格式維持單頁籤不變，不含樞紐分析。**

## 2. 使用者故事

**As a** 業務部長 / 業務處長
**I want** 在分派結果 xlsx 匯出檔案中，除既有 23 欄明細頁籤外，另附一個「樞紐分析」彙總頁籤，呈現各部門、各員編在每個名單代號的案件數佔比交叉表
**So that** 我能一眼掌握各部門 / 員編在各名單的分派佔比分布，並直接與 legacy `reference/202606 分派名單.xlsx` 工作表2 對帳，免除人工加工計算

## 3. 前置條件

- 業務部長 / 業務處長已登入並持有有效 JWT Token，且通過 `DirectorOrSectionChiefGuard`（依 F002 §4.6.2，沿用 F064）。
- 目標 `run_id` 存在於 `assignment_run` 且 `status = 'completed'`。
- [F064](F064-export-assignment-result.md) v2.1（commit on main）之 `buildExportQuery` 多表 join 串流、`cursorRows` streaming、`formatRow`、`RawExportRow` 為前置依賴。
- [F101](F101-stage3-4-proportional-assignment.md) / [F102](F102-cr-priority-assignment.md)（commit on main）已填 `ob_monthly_run_result.emplid`；舊 snapshot 之 `emplid` 可能為 NULL（員編空 → 歸「(空白)」員編列，BR-F108-03）。

## 4. 業務規則與驗收標準

> **BR / AC 對照**：每條 AC 對應一或多條業務規則 BR-F108-xx。BR 為「實作必須遵守的規範」，AC 為「可驗證的 Given/When/Then 斷言」。AC 編號與 US-171 一對一對齊，方便 test-designer 映射。

### 頁籤結構與順序

**BR-F108-01（僅 xlsx 含樞紐頁籤；CSV 不變，D-5）**：「樞紐分析」頁籤**只在 `format=xlsx` 時產生**。`format=csv` 維持 F064 v2.1 之單頁籤格式（23 欄明細），欄位、格式、streaming 行為與 F064 AC-6 完全一致，**不含任何樞紐分析內容**。CSV 路徑（`buildExportCsvStreaming`）不得因 F108 改動。

**BR-F108-07（頁籤順序與命名，D-7）**：xlsx workbook 必含且僅含 2 個工作表，依序為：(1) `assignment_result`（第 1 頁，F064 v2.1 之 23 欄明細，內容、欄序、列數不受 F108 影響）；(2) `樞紐分析`（第 2 頁）。第 2 頁須在第 1 頁 commit 後再 add/write/commit（WorkbookWriter streaming 限制，實作細節見 source-brief §5，交 tdd）。

#### AC-1：xlsx 匯出新增第 2 頁籤「樞紐分析」

- **Given** 月跑已完成（`assignment_run.status = 'completed'`）
- **When** 業務部長 / 業務處長觸發 xlsx 匯出（`GET /api/v1/assignment/runs/:runId/export?format=xlsx`）
- **Then** 回傳的 xlsx 檔案恰含 **2 個工作表**
- **And** 第 1 個工作表名稱為 `assignment_result`，內容為 23 欄明細（與 F064 v2.1 一致，不受影響）
- **And** 第 2 個工作表名稱為 **`樞紐分析`**（BR-F108-07）

### 頁籤版面與標頭列

**BR-F108-08（版面與標頭列，對齊 legacy 工作表2，D-4）**：「樞紐分析」頁籤版面（1-based 列號為新頁籤內位置）：

| 列 | 左欄（A） | 其後儲存格 |
|----|----------|-----------|
| R1 | `部門代號` | `(全部)`（對齊 legacy 頁篩選 axisPage = 部門代號設「(全部)」）|
| R2 | （空列）| — |
| R3 | `計數 - 案號` | `欄標籤`（對齊 legacy dataField「計數 - 案號」）|
| R4 | `列標籤` | 各名單代號（升冪）… → 最右欄 `總計` |
| R5… | 資料列：部門列 → 其全部員編列循環 | 各欄為 0.0% 數值 |
| R末 | `總計` | 各欄 100.0% |

- 列軸採「部門名稱（外層）→ 員編（內層）」兩層全部展開，每個部門列出其全部員編（不做收合，D-2）。
- legacy 存檔當下僅展開一個部門純屬版面快照，**不複製**；F108 一律全展開。

#### AC-2：「樞紐分析」頁籤版面與標頭列

- **Given** 月跑 xlsx 匯出被觸發
- **When** 「樞紐分析」工作表產生完成
- **Then** R1 左欄顯示 `部門代號`、右欄顯示 `(全部)`
- **And** R2 為空列
- **And** R3 左欄顯示 `計數 - 案號`、右側起始儲存格顯示 `欄標籤`
- **And** R4 左欄顯示 `列標籤`，其後依升冪排序列出各名單代號，最右欄顯示 `總計`
- **And** R4 之後為資料列（部門列 → 員編列循環），最後一列為 `總計` 列（BR-F108-08）

### % of parent row 三層數值語意

**BR-F108-04（% of parent row 三層語意 + 數字格式，D-3，I-PIV-PARENTROW-01）**：每個數值儲存格 = % of parent row，三層語意如下，數字格式一律設 `numFmt = '0.0%'`：

1. **部門列**（外層）：該部門在該名單代號的案件數 ÷ **該名單代號的全部案件數**（即「佔總計 %」）。同一名單代號欄，所有部門列加總 = 100%。
2. **員編列**（內層）：該員編在該名單代號的案件數 ÷ **其所屬部門在該名單代號的案件數**（即「佔該部門 %」）。同一部門內、同一名單代號欄，所有員編列加總 ≈ 100%（容浮點誤差 < 0.001）。
3. **總計列**（最末列）：每欄數值 = 100.0%（每欄皆 1）。
4. **總計欄**（最右欄）：跨所有名單代號彙總後套用同樣 % of parent row——部門列總計欄 = 該部門全部案件數 ÷ 全體案件數；員編列總計欄 = 該員編全部案件數 ÷ 其所屬部門全部案件數；總計列總計欄 = 100.0%。

**BR-F108-11（除零保護）**：計算 % of parent row 時，若分母（父列在該欄的案件數）> 0、分子 = 0 → 輸出 `0.0%`；若分母 = 0（即父列在該欄無任何案件，分子必亦為 0，0/0）→ 輸出**空白儲存格**（不輸出 `0.0%`、不報錯）。此情境發生於某名單代號欄為其他部門所有、本部門在該欄計數為 0 時的員編列。

#### AC-3：% of parent row 三層數值語意

- **Given** 「樞紐分析」頁籤資料列已產生
- **When** 任一名單代號欄（含「總計」欄）的數值被讀取
- **Then** **部門列**數值 = 該部門在該名單代號的案件數 ÷ 該名單代號的**全部**案件數（同欄各部門加總 = 100%）
- **And** **員編列**數值 = 該員編在該名單代號的案件數 ÷ 其**所屬部門**在該名單代號的案件數（同部門各員編同欄加總 ≈ 100%，誤差 < 0.001）
- **And** **總計列**每欄數值 = 100.0%（每欄皆 1）
- **And** 所有數值儲存格的數字格式為 `0.0%`（BR-F108-04）
- **And** 分母為 0 的儲存格（0/0）輸出空白（BR-F108-11）

### 欄與列的確定性排序

**BR-F108-06（確定性排序，I-PIV-DET-01）**：
- **欄軸（名單代號）**：去重後依**字串升冪**排列；最右欄固定為 `總計`。
- **列軸外層（部門名稱）**：依 `localeCompare` 升冪排列；emphire join-miss 的「(空白)」部門群組固定排在**最後**。
- **列軸內層（員編）**：在各部門群組內依**字串升冪**排列（數字員編即呈數值升冪效果）；emplid 為空者歸入該部門的「(空白)」員編列。
- 排序須完全確定（不依賴 Map / Set 插入順序的非確定性），俾測試可逐格斷言。

#### AC-4：欄與列的確定性排序

- **Given** 「樞紐分析」頁籤資料列已產生
- **When** 欄軸與列軸排序被驗證
- **Then** **欄軸**（名單代號）依字串升冪排列，最右欄為 `總計`
- **And** **列軸外層**（部門名稱）依 `localeCompare` 升冪排列；「(空白)」群組排在最後
- **And** **列軸內層**（員編）在各部門群組內依字串升冪排列；emplid 為空者歸「(空白)」員編列（BR-F108-06）

### 資料源與處長 scope（SCOPE 紅線）

**BR-F108-02（聚合源 = 同一 scoped 串流列，D-6，I-PIV-SOURCE-01）**：樞紐聚合**重用既有 F064 `buildExportQuery` 串流列**，於既有 `for await (const raw of source)` 明細寫入迴圈中**同步累加**計數（無額外查詢、不額外掃表）。因處長 scope filter（`r.emplid IN (...)`，BR-F064-13 `scopeByCreator`）已內建於 `buildExportQuery` 之 WHERE 條件，樞紐**僅彙總 scoped 後的列**，自動繼承 scope。**SCOPE 紅線：樞紐頁籤不得出現轄區外的部門名稱或員編。**

#### AC-5：處長 scope 沿用（SCOPE 紅線）

- **Given** 登入者 `businessRole = 'section_chief'`（業務處長）
- **When** 業務處長觸發 xlsx 匯出
- **Then** 「樞紐分析」頁籤**只彙總**處長轄區 scoped 後的資料列（與明細頁同一 `buildExportQuery` 串流）
- **And** 樞紐頁籤**不出現**轄區外的部門名稱或員編（BR-F108-02）
- **And** 整體匯出不被阻擋（回 200 OK，含 2 個頁籤）
- **And** `businessRole = 'director'` / `role = 'admin'`：bypass filter，樞紐彙總全公司資料

### CSV 不含樞紐

#### AC-6：CSV 格式不含樞紐頁籤

- **Given** 月跑已完成
- **When** 業務部長 / 業務處長觸發 CSV 匯出（`format=csv`）
- **Then** 回傳 CSV 為**單一頁籤**格式（23 欄明細），不含任何樞紐分析內容
- **And** CSV 的欄位、格式、streaming 行為與 F064 AC-6 完全一致，不受 F108 影響（BR-F108-01）

### 部門 / 員編分組鍵與 join-miss

**BR-F108-03（部門分組鍵與 join-miss 歸「(空白)」）**：樞紐外層分組鍵 = **部門名稱**（`RawExportRow.emphire_dept_name`，即明細欄 12 = `ob_emphire.dept_name`，by `emplid → emp_id` LEFT JOIN，沿用 F064 BR-F064-06 fallback）。**注意**：分組鍵為「部門名稱」（員工所屬電銷單位）而**非**明細欄 1「分處」（`ob_pool_data.dept_name`，案件營業分處），二者不可混用（對齊 legacy field 11）。
- `emphire_dept_name` 為 null / 空字串（emphire join-miss）→ 該列歸入部門名稱「**(空白)**」群組（對齊 Excel 樞紐空白項行為），不中斷匯出。
- 該列員編欄仍按 `emplid` 原值顯示；`emplid` 亦為 null / 空字串 → 歸入該部門的「**(空白)**」員編列。

#### AC-7：emphire join-miss 歸「(空白)」部門群組

- **Given** 某筆分派結果的 `emplid` 在 `ob_emphire` 中無對應 `emp_id`（`emphire_dept_name` 為 null / 空字串）
- **When** 「樞紐分析」頁籤產生
- **Then** 該筆資料歸入部門名稱「**(空白)**」的群組（不中斷匯出）
- **And** 該筆資料的員編欄仍按 `emplid` 原值顯示（或「(空白)」若 emplid 亦為空，BR-F108-03）

### 空結果邊界

**BR-F108-09（空結果邊界）**：月跑已完成但分派結果 0 筆（或處長 scoped 後無轄區資料）時，「樞紐分析」頁籤仍須存在（檔案含 2 個頁籤）。頁籤包含標頭列 R1~R4 與 `總計` 列；無名單代號欄（除 `總計` 欄外無資料欄）、無部門 / 員編資料列。`總計` 列之 `總計` 欄因全體案件數 = 0（0/0）依 BR-F108-11 輸出**空白**。整體匯出回 200 OK，不回 500。

#### AC-8：空結果邊界處理

- **Given** 月跑已完成，但分派結果為 0 筆（或處長 scoped 後無轄區資料）
- **When** 觸發 xlsx 匯出
- **Then** 「樞紐分析」頁籤仍存在（檔案含 2 個頁籤）
- **And** 頁籤包含標頭列 R1~R4 與 `總計` 列，資料區為空（BR-F108-09）
- **And** 整體匯出回 200 OK，不回 500

### 記憶體安全與稽核語意

**BR-F108-05（記憶體安全聚合，I-PIV-MEM-01）**：樞紐聚合在記憶體中**只保留小型聚合計數**，不全載明細列。聚合結構為巢狀計數（`cell[deptName][emplid][listNo] = count`）與其衍生（`deptByList` / `grandByList` / 各「總計」欄），規模為「部門數 × 員編數 × 名單代號數」量級（數百～數千格），**遠小於** 7.7 萬筆明細列。匯出記憶體峰值不因明細列數線性增長（沿用 F064 BR-F064-09 streaming 不退化）。

**BR-F108-10（稽核與 rowCount 語意不變）**：匯出稽核（`assignment_audit_log`，F064 BR-F064-15）與 `exportedRowCount` 語意**不變**，`exportedRowCount` 仍 = 明細列數（`ob_monthly_run_result` scoped 後列數），**不**因新增樞紐頁籤而改變。F108 不新增錯誤碼，沿用 F064 v2.1 錯誤碼集合。

---

## 5. 影響範圍與非目標

### 5.1 影響範圍

- 僅後端 `xlsx` 匯出路徑新增第 2 頁籤；端點、Query 參數、Response header、檔名格式（`assignment_result_{YYYYMM}_{run_id 前 8 碼}.xlsx`）皆沿用 F064 v2.1，不變。
- 聚合於既有匯出串流迴圈內同步累加；不新增 SQL 查詢、不新增掃表。

### 5.2 非目標（Non-Goals）

| 非目標 | 說明 |
|--------|------|
| 原生 / 可再樞紐的 pivot table | exceljs 無原生樞紐 API；F108 輸出**靜態交叉表**（一般工作表 + 預算數值），非 Excel 可再拖拉的 PivotTable（D-1）|
| 前端變更 | 無新頁面 / route / sidebar；匯出按鈕與 `downloadRunExport(runId,'xlsx')` 不改動 |
| CSV 變更 | CSV 維持單頁籤、不含樞紐（BR-F108-01）|
| 複製 legacy 版面快照 | legacy 存檔之部門顯示順序 / 收合狀態非業務關鍵，不複製；改採 BR-F108-06 確定性排序 |
| 明細頁變更 | 第 1 頁 `assignment_result` 23 欄內容、欄序、列數、rowCount 不受影響（BR-F108-07 / BR-F108-10）|

---

## 6. Worked Example（樞紐交叉表逐格走查 — test-designer / TDD oracle）

> 供下游 test-designer / tdd-implementation 作為**無歧義 oracle**。合成小型資料集：**2 部門、3 員編、2 名單代號**。

### 6.1 原始計數（聚合 `cell[deptName][emplid][listNo] = count`）

部門名稱 / 員編 / 名單代號（`list_no`）：

| 部門名稱 | 員編 | OB202606001 (L1) | OB202606007 (L2) | 員編列小計 |
|----------|------|------------------|------------------|-----------|
| 北區電銷1 | E1 | 6 | 2 | 8 |
| 北區電銷1 | E2 | 2 | 0 | 2 |
| **北區電銷1（部門小計）** | — | **8** | **2** | **10** |
| 南區電銷 | E3 | 2 | 8 | 10 |
| **南區電銷（部門小計）** | — | **2** | **8** | **10** |
| **欄總計（grandByList）** | — | **10** | **10** | **20** |

排序驗證：欄軸 `OB202606001 < OB202606007`（字串升冪）；部門外層 `北區電銷1 < 南區電銷`（localeCompare 升冪）；員編內層 `E1 < E2`（字串升冪）。

### 6.2 輸出頁籤「樞紐分析」逐格期望值（% of parent row，格式 `0.0%`）

| 列 | 左欄（列標籤）| OB202606001 | OB202606007 | 總計 |
|----|--------------|-------------|-------------|------|
| R1 | `部門代號` | `(全部)` | | |
| R2 | （空） | | | |
| R3 | `計數 - 案號` | `欄標籤` | | |
| R4 | `列標籤` | `OB202606001` | `OB202606007` | `總計` |
| R5 | `北區電銷1` | **80.0%** | **20.0%** | **50.0%** |
| R6 | `E1` | **75.0%** | **100.0%** | **80.0%** |
| R7 | `E2` | **25.0%** | **0.0%** | **20.0%** |
| R8 | `南區電銷` | **20.0%** | **80.0%** | **50.0%** |
| R9 | `E3` | **100.0%** | **100.0%** | **100.0%** |
| R10 | `總計` | **100.0%** | **100.0%** | **100.0%** |

### 6.3 推導說明（驗算）

**部門列（÷ 欄總計）**：
- 北區電銷1：L1 = 8/10 = 80.0%；L2 = 2/10 = 20.0%；總計欄 = 10/20 = 50.0%
- 南區電銷：L1 = 2/10 = 20.0%；L2 = 8/10 = 80.0%；總計欄 = 10/20 = 50.0%
- 同欄部門加總：L1 = 80.0% + 20.0% = 100%；L2 = 20.0% + 80.0% = 100%；總計欄 = 50.0% + 50.0% = 100% ✓

**員編列（÷ 所屬部門列）**：
- E1（屬北區電銷1）：L1 = 6/8 = 75.0%；L2 = 2/2 = 100.0%；總計欄 = 8/10 = 80.0%
- E2（屬北區電銷1）：L1 = 2/8 = 25.0%；L2 = 0/2 = **0.0%**（分子 0、分母 2 > 0 → `0.0%`，BR-F108-11）；總計欄 = 2/10 = 20.0%
- 同部門同欄員編加總：L1 = 75.0% + 25.0% = 100%；L2 = 100.0% + 0.0% = 100%；總計欄 = 80.0% + 20.0% = 100% ✓
- E3（屬南區電銷，該部門唯一員編）：L1 = 2/2 = 100.0%；L2 = 8/8 = 100.0%；總計欄 = 10/10 = 100.0% ✓

**總計列**：每欄皆 100.0%（grandByList ÷ 自身 = 1；總計欄 = 20/20 = 1）✓

### 6.4 「(空白)」群組補充示例（AC-7 / BR-F108-03）

若於上述資料集再加入 1 筆 `emplid = 'X999'`、其 `emphire_dept_name` 為 null、`list_no = OB202606001`、計數 1：
- 該列歸入部門名稱「**(空白)**」群組，排序在「南區電銷」之後（最後，BR-F108-06）。
- 「(空白)」群組下含員編列 `X999`。
- 此時欄總計 L1 改為 11，各既有部門列 L1 百分比隨之重算（北區電銷1 = 8/11 ≈ 72.7%、南區電銷 = 2/11 ≈ 18.2%、(空白) = 1/11 ≈ 9.1%，加總 = 100%）。
- 員編 `X999` 在「(空白)」部門下、L1 = 1/1 = 100.0%。
- 匯出不中斷，其他部門資料正常輸出。

---

## 7. 不變式（與 F064 I-EXP-* 對齊風格）

| 不變式 ID | 描述 | 對應 BR / AC |
|----------|------|--------------|
| `I-PIV-SHEET-01` | xlsx 第 2 頁名稱為「樞紐分析」、第 1 頁為 23 欄明細不受影響；CSV 格式不含此頁 | BR-F108-01 / BR-F108-07 / AC-1 / AC-6 |
| `I-PIV-PARENTROW-01` | 數值 = % of parent row（部門列 = 佔總計 % / 員編列 = 佔所屬部門 % / 總計列 = 100% / 總計欄套同語意），格式 `0.0%` | BR-F108-04 / BR-F108-11 / AC-3 |
| `I-PIV-SOURCE-01` | 聚合源 = 與明細同一 scoped `buildExportQuery` 串流列；處長 scope filter 自動沿用，樞紐不洩漏轄區外部門 / 員編 | BR-F108-02 / AC-5 |
| `I-PIV-MEM-01` | 記憶體中只保留小型聚合計數（部門 × 員編 × 名單代號量級），不全載 7.7 萬筆明細列 | BR-F108-05 |
| `I-PIV-DET-01` | 部門（`localeCompare` 升冪，(空白) 最後）/ 員編（字串升冪）/ 名單代號（字串升冪）確定性排序 | BR-F108-06 / AC-4 |

---

## 8. 下游待裁問題（spec-writer 已附建議預設，逐項預設以解除阻擋）

> 每項皆已給定**預設決策**使實作不被阻擋；列出供 system-architect / test-designer 於各自階段確認或推翻。

| ID | 問題 | 預設決策（解除阻擋）| 交辦 |
|----|------|---------------------|------|
| **OQ-F108-01** | 「(空白)」部門群組排序位置（最前 vs 最後）| **預設：排最後**（對齊 US-171 AC-4 / TC-171-08 之斷言「北區電銷1 → 南區電銷 → (空白)」）| test-designer 固定斷言 |
| **OQ-F108-02** | 員編排序 tiebreak（數值 vs 字串）| **預設：字串升冪**（source-brief §4；數字員編呈數值升冪效果；混合英數員編一致可排序）| test-designer / tdd |
| **OQ-F108-03** | 空結果（0 列）頁籤內容（只標頭 vs 標頭 + 總計列）| **預設：標頭 R1~R4 + `總計` 列均存在；無資料欄與資料列；`總計` 欄因 0/0 留空白**（BR-F108-09 / BR-F108-11）| test-designer 固定斷言 |
| **OQ-F108-04** | 員編 null / 空字串之內層列標籤顯示 | **預設：歸入該部門「(空白)」員編列**（label 顯示「(空白)」；BR-F108-03）| test-designer / tdd |
| **OQ-F108-05** | 聚合資料結構落點與多頁籤 commit 順序之實作機制 | **預設：於既有 `for await (const raw of source)` 迴圈同步累加；明細頁 commit 後再 `addWorksheet('樞紐分析')` 寫入並 commit，最後 `workbook.commit()`**（source-brief §5）| system-architect / tdd |

> **附帶裁定（spec-writer，非交下游）**：
> - 數值除零（0/0）→ 空白；分子 0、分母 > 0 → `0.0%`（BR-F108-11，已鎖定）。
> - 數字格式固定 `0.0%`（D-3，已鎖定）。
> - CSV 不含樞紐（D-5，已鎖定，無討論空間）。

---

## 9. 相依性

- **Blocked By**：
  - [F064](F064-export-assignment-result.md) v2.1（US-155，23 欄明細匯出 commit on main；`buildExportQuery` 多表 join 串流、`cursorRows`、`formatRow`、`RawExportRow` 為前置依賴）。
  - [F101](F101-stage3-4-proportional-assignment.md)（US-145/146，Stage 3/4 分派，`ob_monthly_run_result.emplid` 已有值）。
  - [F102](F102-cr-priority-assignment.md)（US-152，CR 優先分派，`emplid` / `assignday` 補齊）。
- **Blocks**：無。

## 10. 假設

| # | 假設 | 標記 |
|---|------|------|
| A-1 | 樞紐外層分組鍵 = `RawExportRow.emphire_dept_name`（明細欄 12 = `ob_emphire.dept_name`，員工所屬電銷單位）；對齊 legacy 工作表2 field 11。**非**明細欄 1「分處」（`ob_pool_data.dept_name`，案件營業分處）。 | Resolved（source-brief §3）|
| A-2 | 樞紐欄軸 = `RawExportRow.list_no`（明細欄 4，名單代號）；對齊 legacy field 3。 | Resolved（source-brief §1）|
| A-3 | exceljs 4.4.0 無原生樞紐 API；採靜態交叉表（後端預算 % of parent row 寫一般工作表）。 | Resolved（D-1，已驗證）|
| A-4 | 舊 snapshot 之 `emplid` 可能為 NULL（新月跑由 F101/F102 已填值）；員編空 → 歸該部門「(空白)」員編列。 | Resolved（source-brief §8）|
| A-5 | legacy 工作表2 數字格式為 `0.0%`、數值語意為 `percentOfParentRow`（已以實資料驗證）。 | Resolved（source-brief §1）|

## 11. 相關

- 來源 story：[US-171](../../stories/epics/E07-app-customer-list-assignment/US-171-M04-export-assignment-pivot-sheet.md)（F108）
- 前置 feature：[F064](F064-export-assignment-result.md) v2.1（23 欄明細匯出，`buildExportQuery` / `cursorRows` / `formatRow` / `RawExportRow` 來源）、[F101](F101-stage3-4-proportional-assignment.md)（`emplid` 來源）、[F102](F102-cr-priority-assignment.md)（`emplid` / `cr_id` 來源）
- 對帳 / 驗證：[F063](F063-view-run-result-summary.md)（結果摘要——樞紐部門分佈應與摘要部門百分比一致）、[F067](F067-compare-run-results.md)（差異報告——可交叉驗證樞紐部門分佈是否對齊 legacy 32/34/15/18% 量級）
- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_monthly_run_result`）、[data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（`dept_name` 分組鍵來源）
- Ground-Truth Brief：`scratchpad/F108-ground-truth.md`（全流程事實基準；鎖定決策 §2 / 語意對映 §3 / 版面 §4 / 實作落點 §5 / 不變式 §7）
- Reference：`reference/202606 分派名單.xlsx`（工作表2 = `樞紐分析表3`，% of parent row authority）
