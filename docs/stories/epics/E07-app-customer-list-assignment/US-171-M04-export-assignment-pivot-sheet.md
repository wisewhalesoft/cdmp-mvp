---
last-updated: 2026-06-29
version: v1.0
change-summary: "F108：xlsx 匯出新增第 2 頁籤「樞紐分析」——靜態重現 legacy 分派名單.xlsx 工作表2 的部門×員編×名單代號案件數佔比交叉表；CSV 格式與既有明細頁不受影響。"
---

# US-171：xlsx 匯出新增「樞紐分析」頁籤（F108）

> **Story ID**：US-171
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **Feature**：F108 匯出新增「樞紐分析」頁籤

---

## User Story

**As a** 業務部長 / 業務處長
**I want** 在分派結果 xlsx 匯出檔案中，除了既有 23 欄明細頁籤外，另附一個「樞紐分析」彙總頁籤，呈現各部門、各員編在每個名單代號的案件數佔比交叉表
**So that** 業務主管可以一眼掌握各部門 / 員編在各名單的分派佔比分布，並直接與 legacy `reference/202606 分派名單.xlsx` 的工作表 2 對帳，免除人工加工計算

---

## 背景說明

Legacy `reference/202606 分派名單.xlsx` 的工作表 2 為一張樞紐分析表（`樞紐分析表3`），以「部門名稱 × 員編」為列軸、「名單代號」為欄軸，數值顯示 **% of parent row（父列總和百分比）**：

- **部門列**：該部門在每個名單代號的案件數 ÷ 該名單代號的總案件數（佔總計 %，各部門每欄加總 = 100%）
- **員編列**：該員編在每個名單代號的案件數 ÷ 其所屬部門在該名單代號的案件數（佔部門 %，同部門員編每欄加總 ≈ 100%）
- **總計列**：100.0%（每欄皆 1）

CDMP 目前的 xlsx 匯出（F064 v2.1，US-155）僅包含 23 欄明細頁籤（`assignment_result`），缺少上述彙總視圖，業務主管無法直接在匯出檔案中查看部門 / 員編分派佔比，需另行在 Excel 手動建立樞紐表。

> **實作性質：後端 only**。匯出按鈕 UI 已存在於 `prototypes/33-run-summary.html`「匯出區塊（F064）」→「匯出 Excel (streaming)」，前端 `downloadRunExport(runId,'xlsx')` 無需改動。無新頁面、無 route、無 sidebar 變更。

> **靜態交叉表**（鎖定決策 §2-1）：exceljs 4.4.0 無原生樞紐表 API，後端預先計算 % of parent row 數值後寫成一般工作表，數字與 legacy 樞紐輸出一致。

---

## 鎖定決策參照（F108 ground-truth §2）

| 決策編號 | 內容 | 影響 |
|---------|------|------|
| D-1 | 靜態交叉表：後端預算 % of parent row，寫一般工作表（非原生樞紐） | 實作不依賴 exceljs pivot API |
| D-2 | 列全部展開：每個部門都列出其全部員編 | 不做收合 |
| D-3 | 數值 = % of parent row，格式 `0.0%` | 部門/員編/總計三層語意如背景說明 |
| D-4 | 欄 = 名單代號（升冪）＋「總計」欄 | 對齊 legacy 工作表 2 版面 |
| D-5 | 僅 xlsx 含樞紐頁籤；CSV 維持單頁籤，不含樞紐 | CSV 路徑不改 |
| D-6 | 資料源重用既有 `buildExportQuery` 串流列；處長 scope filter 自動沿用 | 樞紐只彙總 scoped 後的列，不洩漏轄區外資料（SCOPE 紅線） |
| D-7 | 頁籤順序：`assignment_result`（第 1 頁） → `樞紐分析`（第 2 頁） | 既有明細頁不受影響 |

---

## 部門 / 員編語意對映（F108 ground-truth §3）

- 樞紐**外層分組鍵 = 部門名稱**（對應明細欄 12：`RawExportRow.emphire_dept_name`，即 `ob_emphire.dept_name`）
- emphire join-miss（`emphire_dept_name` 為 null / 空字串）→ 歸入「**(空白)**」部門群組（對齊 Excel 樞紐空白項行為）
- **欄 4（`list_no`，名單代號）** 為樞紐欄軸

---

## 驗收標準

### AC-1：xlsx 匯出新增第 2 頁籤「樞紐分析」

- **Given** 月名單分派已完成（`assignment_run.status = 'completed'`）
- **When** 業務部長 / 業務處長觸發 xlsx 匯出（`GET /api/v1/assignment/runs/:runId/export?format=xlsx`）
- **Then** 回傳的 xlsx 檔案包含 **2 個工作表**
- **And** 第 1 個工作表名稱為 `assignment_result`，內容為 23 欄明細（與 US-155 一致，不受影響）
- **And** 第 2 個工作表名稱為 **`樞紐分析`**

### AC-2：「樞紐分析」頁籤版面與標頭列

- **Given** 月名單分派 xlsx 匯出被觸發
- **When** 「樞紐分析」工作表產生完成
- **Then** R1（第 1 列）左欄顯示「部門代號」、右欄顯示「(全部)」（對齊 legacy 頁篩選標示）
- **And** R2（第 2 列）為空列
- **And** R3（第 3 列）左欄顯示「計數 - 案號」、右側起始儲存格顯示「欄標籤」
- **And** R4（第 4 列）左欄顯示「列標籤」，其後依升冪排序列出各名單代號，最右欄顯示「總計」
- **And** R4 之後為資料列（部門列 → 員編列循環），最後一列顯示「總計」

### AC-3：% of parent row 三層數值語意

- **Given** 「樞紐分析」頁籤資料列已產生
- **When** 任一名單代號欄（含「總計」欄）的數值被讀取
- **Then** **部門列**數值 = 該部門在該名單代號的案件數 ÷ 該名單代號的**全部**案件數（四個部門每欄加總 = 100%）
- **And** **員編列**數值 = 該員編在該名單代號的案件數 ÷ 其**所屬部門**在該名單代號的案件數（同部門員編每欄加總 ≈ 100%）
- **And** **總計列**每欄數值 = 100.0%（每欄皆 1）
- **And** 所有數值儲存格的數字格式設為 `0.0%`

### AC-4：欄與列的確定性排序

- **Given** 「樞紐分析」頁籤資料列已產生
- **When** 欄軸與列軸排序被驗證
- **Then** **欄軸**（名單代號）依字串升冪排列，最右欄為「總計」
- **And** **列軸外層**（部門名稱）依 `localeCompare` 升冪排列；emphire join-miss 的「(空白)」群組排在最後
- **And** **列軸內層**（員編）在各部門群組內依字串升冪排列；emplid 為空者歸入「(空白)」員編列

### AC-5：處長 scope 沿用（SCOPE 紅線）

- **Given** 登入者 `businessRole = 'section_chief'`（業務處長）
- **When** 業務處長觸發 xlsx 匯出
- **Then** 「樞紐分析」頁籤**只彙總**處長轄區 scoped 後的資料列（與明細頁使用同一 `buildExportQuery` 串流）
- **And** 樞紐頁籤**不出現**轄區外的部門名稱或員編
- **And** 整體匯出不被阻擋（回 200 OK，含 2 個頁籤）
- **And** `businessRole = 'director'` / `role = 'admin'`：bypass filter，樞紐彙總全公司資料

### AC-6：CSV 格式不含樞紐頁籤

- **Given** 月名單分派已完成
- **When** 業務部長 / 業務處長觸發 CSV 匯出（`format=csv`）
- **Then** 回傳 CSV 為**單一頁籤**格式（23 欄明細），不包含任何樞紐分析內容
- **And** CSV 的欄位、格式、streaming 行為與 US-155 AC-6 完全一致，不受 F108 影響

### AC-7：emphire join-miss 歸「(空白)」部門群組

- **Given** 某筆分派結果的 `emplid` 在 `ob_emphire` 中無對應 `emp_id`（`emphire_dept_name` 為 null / 空字串）
- **When** 「樞紐分析」頁籤產生
- **Then** 該筆資料歸入部門名稱為「**(空白)**」的群組（不中斷匯出）
- **And** 該筆資料的員編欄仍按 `emplid` 原值顯示（或「(空白)」若 emplid 亦為空）

### AC-8：空結果邊界處理

- **Given** 月名單分派已完成，但分派結果為 0 筆（或處長 scoped 後無轄區資料）
- **When** 觸發 xlsx 匯出
- **Then** 「樞紐分析」頁籤仍存在（檔案含 2 個頁籤）
- **And** 頁籤內容包含標頭列（R1～R4）與總計列，資料區為空（或僅總計列顯示 100.0% 但無資料行）
- **And** 整體匯出回 200 OK，不回 500

---

## 測試案例

### TC-171-01：xlsx 含 2 個頁籤，名稱正確

- **Given**：月名單分派 completed，結果 100 筆（含多個部門 / 員編 / 名單代號）
- **When**：業務部長觸發 xlsx 匯出
- **Then**：xlsx 工作表數量 = 2；第 1 頁名稱 = `assignment_result`；第 2 頁名稱 = `樞紐分析`

### TC-171-02：CSV 不含樞紐頁籤

- **Given**：月名單分派 completed，結果 100 筆
- **When**：業務部長觸發 CSV 匯出
- **Then**：回傳純文字 CSV（無工作表概念），內容為 23 欄明細，字串中不含「樞紐分析」字樣

### TC-171-03：% of parent row 數值正確性——部門列

- **Given**：合成資料：2 個部門（A / B）、1 個名單代號（LIST-1）；A 有 30 筆、B 有 70 筆
- **When**：「樞紐分析」頁籤產生
- **Then**：部門 A 的 LIST-1 欄數值 ≈ 30%（0.300）；部門 B 的 LIST-1 欄數值 ≈ 70%（0.700）
- **And**：A + B 的 LIST-1 欄數值 = 100%（容浮點誤差 < 0.001）

### TC-171-04：% of parent row 數值正確性——員編列

- **Given**：合成資料：部門 A 有員編 E1（20 筆）、E2（10 筆），共 30 筆；名單代號 LIST-1
- **When**：「樞紐分析」頁籤產生
- **Then**：E1 在 LIST-1 欄數值 ≈ 66.7%（20÷30）；E2 在 LIST-1 欄數值 ≈ 33.3%（10÷30）
- **And**：E1 + E2 的 LIST-1 欄數值 ≈ 100%（容浮點誤差 < 0.001）

### TC-171-05：總計列每欄為 100.0%

- **Given**：任意合成資料（≥ 1 筆）
- **When**：「樞紐分析」頁籤產生
- **Then**：最末「總計」列的每個名單代號欄及「總計」欄數值均為 1.0（100.0%）

### TC-171-06：數字格式為 0.0%

- **Given**：「樞紐分析」頁籤資料區已產生
- **When**：讀取任一數值儲存格的 `numFmt` 屬性
- **Then**：`numFmt = '0.0%'`

### TC-171-07：確定性排序——欄軸名單代號升冪

- **Given**：合成資料含 3 個名單代號：`OB202606013`、`OB202606001`、`OB202606007`
- **When**：「樞紐分析」頁籤產生
- **Then**：欄軸順序為 `OB202606001` → `OB202606007` → `OB202606013` → `總計`

### TC-171-08：確定性排序——列軸部門 localeCompare 升冪，(空白) 排最後

- **Given**：合成資料含部門名稱「南區電銷」、「北區電銷1」及 emphire join-miss（歸(空白)）
- **When**：「樞紐分析」頁籤產生
- **Then**：部門列順序為「北區電銷1」→「南區電銷」→「(空白)」→（總計）

### TC-171-09：處長 scope——樞紐不包含轄區外資料

- **Given**：業務處長（section_chief）轄區只有部門 A 的 50 筆資料；系統中尚有部門 B 的 100 筆
- **When**：業務處長觸發 xlsx 匯出
- **Then**：「樞紐分析」頁籤**只出現**部門 A 的列，不出現部門 B 的列
- **And**：23 欄明細頁同樣只含 50 列（一致性驗證）

### TC-171-10：emphire join-miss 歸「(空白)」部門群組

- **Given**：合成資料含 1 筆 `emplid = 'X999'`，其 `emphire_dept_name` 為 null
- **When**：「樞紐分析」頁籤產生
- **Then**：資料區出現部門名稱為「(空白)」的群組，其下含員編 `X999` 的列
- **And**：匯出不中斷，其他部門資料正常輸出

### TC-171-11：空結果邊界——頁籤存在且有標頭

- **Given**：月名單分派 completed，分派結果 0 筆
- **When**：業務部長觸發 xlsx 匯出
- **Then**：xlsx 仍含 2 個頁籤；第 2 頁「樞紐分析」存在
- **And**：頁籤包含 R1～R4 標頭列及總計列，回 200 OK

### TC-171-12：既有明細頁不受影響（回歸驗證）

- **Given**：202606 月名單分派 completed 資料
- **When**：業務部長觸發 xlsx 匯出
- **Then**：第 1 頁 `assignment_result` 的 23 欄欄序、欄位名稱、資料列數與 F064 v2.1 規格完全一致
- **And**：TC-155-01 所有斷言仍通過

---

## 不變式（與 F064 I-EXP-* 對齊）

| 不變式 ID | 描述 |
|----------|------|
| `I-PIV-SHEET-01` | xlsx 第 2 頁名稱為「樞紐分析」；CSV 格式不含此頁 |
| `I-PIV-PARENTROW-01` | 數值 = % of parent row（部門列 / 員編列 / 總計列三層語意依 §背景說明） |
| `I-PIV-SOURCE-01` | 聚合源 = 與明細同一 scoped query 串流列（處長 scope filter 自動沿用） |
| `I-PIV-MEM-01` | 記憶體中只保留小型聚合計數，不全載明細列 |
| `I-PIV-DET-01` | 部門（localeCompare）/ 員編（字串升冪）/ 名單代號（字串升冪）確定性排序 |

---

## 依賴關係

- **Blocked By**：
  - US-155（F064 v2.1，23 欄明細匯出已 commit on main，`buildExportQuery` 串流為前置依賴）
  - US-145 / US-146（F101 Stage 3/4 分派，`ob_monthly_run_result.emplid` 已有值）
  - US-152（F102 CR 優先分派，`emplid` / `assignday` 欄已補齊）
- **Blocks**：無

---

## Definition of Done

- [ ] AC-1 ~ AC-8 全部通過
- [ ] TC-171-01 ~ TC-171-12 全部通過
- [ ] TC-171-12 回歸驗證：第 1 頁明細內容 100% 與 F064 v2.1 一致
- [ ] `I-PIV-SHEET-01`：CSV 匯出確認無第 2 頁籤（regression guard）
- [ ] `I-PIV-PARENTROW-01`：部門 / 員編 / 總計三層數值精度驗證（容浮點誤差 < 0.001）
- [ ] 處長 scope 隔離測試：樞紐不洩漏轄區外部門 / 員編（TC-171-09）
- [ ] emphire join-miss 情境測試（TC-171-10）
- [ ] 空結果邊界測試（TC-171-11）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨通過
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **前置 Story**：[US-155](US-155-M04-export-assignment-result-23col.md)（F064 v2.1，23 欄明細匯出）
- **相關 Features**：
  - F063（分派結果摘要）— 樞紐部門分佈應與摘要部門百分比一致（對帳基準）
  - F067（差異報告）— 可交叉驗證樞紐部門分佈是否對齊 legacy
  - F101（Stage 3/4 分派，US-145/146）— emplid 資料來源
  - F102（CR 優先分派，US-152）— emplid / cr_id 資料來源
- **Reference**：`reference/202606 分派名單.xlsx`（工作表 2，樞紐分析 authority）
- **Ground-Truth Brief**：`F108-ground-truth.md`（實作 ground truth，所有下游 agent 以此為準）
