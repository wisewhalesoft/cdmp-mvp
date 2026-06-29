---
type: test-design-feature
feature_id: F108
feature_name: 匯出新增「樞紐分析」頁籤（靜態重現 legacy 工作表2 部門×員編×名單代號佔比交叉表）
priority: P0-MVP
related_spec: /docs/specs/features/F108-export-assignment-pivot-sheet.md
source_ad: /docs/specs/implementation-log/AD-E07-v3.7-f108-pivot-sheet.md
source_stories: [US-171]
source_brief: scratchpad/F108-ground-truth.md
spec_version: "1.0"
last_updated: 2026-06-29
blocked_by: F064
related: [F063, F064, F067, F101, F102]
invariants:
  - I-PIV-SHEET-01
  - I-PIV-PARENTROW-01
  - I-PIV-SOURCE-01
  - I-PIV-MEM-01
  - I-PIV-DET-01
oracle_source: "F108 spec §6（Worked Example）+ AD-E07-v3.7 §9（逐格驗算表）"
---

# F108：匯出新增「樞紐分析」頁籤 — 測試設計

> **範圍（後端 only）**：在既有 F064 v2.1 xlsx 匯出（`GET /api/v1/assignment/runs/:runId/export?format=xlsx`）的第 1 頁籤 `assignment_result`（23 欄明細）之外，新增第 2 頁籤「樞紐分析」。靜態交叉表，數值為 **% of parent row**，格式 `0.0%`。無新頁面、無 route、無 sidebar、無前端變更。
>
> **Oracle 唯一來源**：spec §6 Worked Example（2 部門 / 3 員編 / 2 名單代號 合成資料集，含逐格 oracle）+ §6.4 (空白)群組補充示例。所有 PARENTROW / ZEROBLANK / DET / BLANK 組的逐格斷言必須以此 oracle 為準。
>
> **Mock 策略延伸**：沿用 `f064-export-23col.spec.ts` 模式：mock protected method `cursorRows` 回傳固定 `RawExportRow[]`（AsyncIterable）→ 呼叫 `exportResult(runId,'xlsx')` → 以 `new ExcelJS.Workbook(); await wb.xlsx.load(buffer)` 讀回 Buffer → 斷言第 2 個 worksheet。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F108 spec](../../specs/features/F108-export-assignment-pivot-sheet.md)（§4 AC-1~8、§6 Worked Example、§7 不變式）+ [AD-E07-v3.7](../../specs/implementation-log/AD-E07-v3.7-f108-pivot-sheet.md)（PivotAggregation 型別 §2 / 演算法 §3 / 時序 §5 / 方法簽名 §8）+ [F064 test spec](F064-test.md)（mock 策略與 `f064-export-23col.spec.ts` 樣板） |
| QA / Tester | 本文件 §REGRESSION DoD 紅線 + §三 PARENTROW Oracle 表 + §一 SHEET + §十 STATIC |
| CI/CD Owner | 本文件「自動化就緒度彙整」；SCOPE-001/002 為關鍵安全驗收；PG-001/002 為選配慢速套件 |
| Product Analyst / 業務 | TS-F108-PG-002（部門分佈與 F063 摘要一致）+ REGRESSION DoD 紅線 |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| **驗收紅線（DoD）** | ① REGRESSION 群組（第 1 頁 23 欄未受影響、CSV 不含樞紐）= 必須全綠，未過不得上線 ② PARENTROW-001 逐格 oracle（spec §6.2 全 9 格含浮點誤差 < 1e-9）= DoD 門檻 ③ SCOPE-001 SCOPE 紅線（樞紐不洩漏轄區外部門 / 員編）= 安全 DoD 門檻 ④ `tsc --noEmit -p tsconfig.build.json` 乾淨（feedback_vitest_no_typecheck 教訓）|
| **主要測試層** | ① **Unit**：SHEET、HEADER、PARENTROW、ZEROBLANK、DET、BLANK、SCOPE、EMPTY、REGRESSION、STATIC（均 mock `cursorRows`，用 exceljs 讀回 Buffer 斷言）② **Integration（SQLite）**：EMPTY-003（HTTP 200 OK 不回 500，需 NestJS 測試模組）③ **PG Integration**：PG-001 / PG-002（選配，真實 run `84486ddd-1a54-4eaf-a4d0-096ba9bdde58`）|
| **Mock 策略** | 與 `f064-export-23col.spec.ts` 相同：`vi.spyOn(service, 'cursorRows' as any).mockReturnValue(makeAsyncIterable(rows))`；餵入 `RawExportRow[]`（只有 `emphire_dept_name`、`emplid`、`list_no` 三欄對 pivot 有意義，其他欄填入合理預設值供明細頁用）|
| **ExcelJS 讀回模式** | `const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);`<br>`const pivotWs = wb.worksheets[1]; // 0-based index`<br>斷言：`pivotWs.getCell('A1').value`、`.numFmt` 等 |
| **浮點斷言容錯** | 儲存格數值斷言：`Math.abs(cell.value as number - expected) < 1e-9`<br>加總驗收（部門 / 員編合計 = 100%）：`Math.abs(sum - 1.0) < 1e-3` |
| **CI 執行** | Unit 群組（SHEET~STATIC）不需 PG，可與既有 f064-export-23col.spec.ts 同一 suite 執行；PG 群組獨立於 f064-export-23col.pg.spec.ts 模式 |
| **型別 gate** | 實作後必須跑 `tsc --noEmit -p tsconfig.build.json`（STATIC-003）|

### 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 自動化適合度 | TC-171 對應 |
|---|---|---|---|---|---|
| SHEET（頁籤結構）| 4 | Unit + 靜態 | 否 | 高 | TC-171-01 / TC-171-10 |
| HEADER（版面標頭）| 4 | Unit | 否 | 高 | TC-171-02 |
| PARENTROW（% of parent row 逐格 oracle）| 7 | Unit | 否 | 高 | TC-171-03 |
| ZEROBLANK（除零保護）| 3 | Unit | 否 | 高 | TC-171-04 / TC-171-05 |
| DET（確定性排序）| 4 | Unit | 否 | 高 | TC-171-06 / TC-171-07 |
| BLANK（join-miss 與空值歸組）| 3 | Unit | 否 | 高 | TC-171-08 |
| SCOPE（處長 scope，SCOPE 紅線）| 3 | Unit + 靜態 | 否 | 高（關鍵安全）| TC-171-09 |
| EMPTY（空結果邊界）| 3 | Unit + Integration（SQLite）| 否 | 高 | TC-171-11 |
| REGRESSION（DoD 紅線，明細頁 + CSV）| 4 | Unit + 靜態 | 否 | 高（DoD 阻擋）| TC-171-12 |
| STATIC（靜態掃描）| 3 | Unit（靜態 grep）| 否 | 高 | — |
| PG（端對端，選配）| 2 | PG Integration | **是** | 中（需真實月跑 DB）| — |
| **合計** | **40** | — | **2** | — | TC-171-01~12 全覆蓋 |

---

## 一、SHEET — 頁籤結構與 CSV 不含樞紐（AC-1 / AC-6 / I-PIV-SHEET-01 / BR-F108-01 / BR-F108-07）

> **設計依據**：F108 spec §4 AC-1 / AC-6 / BR-F108-01 / BR-F108-07；AD-E07-v3.7 §5 WorkbookWriter 多頁籤寫入順序。
>
> **核心驗收目標**：xlsx workbook 恰好 2 個工作表（`assignment_result` 第 1、`樞紐分析` 第 2）；CSV 路徑完全不受 F108 影響。
>
> **前置條件（SHEET 群組共用）**：mock `cursorRows` 回傳 spec §6.1 合成資料集（20 筆 `RawExportRow`，其他欄填預設值）；director actor；completed run。

### TS-F108-SHEET-001：xlsx workbook 恰好含 2 個工作表（TC-171-01）

- **相關 AC / BR**：AC-1 / BR-F108-07 / I-PIV-SHEET-01
- **測試類型**：正向
- **測試層**：Unit
- **步驟**：
  1. mock `cursorRows` 回傳 20 筆合成資料；呼叫 `exportResult(runId, 'xlsx')`
  2. 以 `wb.xlsx.load(buffer)` 讀回；取 `wb.worksheets.length`
- **期望結果**：
  - `wb.worksheets.length === 2`（恰好 2 個，不多不少）

---

### TS-F108-SHEET-002：頁籤名稱與順序正確（TC-171-01）

- **相關 AC / BR**：AC-1 / BR-F108-07 / I-PIV-SHEET-01
- **測試類型**：正向
- **測試層**：Unit
- **步驟**：
  1. 同 SHEET-001；讀回 `wb.worksheets[0].name` 與 `wb.worksheets[1].name`
- **期望結果**：
  - `wb.worksheets[0].name === 'assignment_result'`（第 1 頁，F064 v2.1 明細，不變）
  - `wb.worksheets[1].name === '樞紐分析'`（第 2 頁，F108 新增）

---

### TS-F108-SHEET-003：CSV 匯出不含樞紐頁籤（TC-171-10）

- **相關 AC / BR**：AC-6 / BR-F108-01 / I-PIV-SHEET-01
- **測試類型**：正向（CSV 不含樞紐）
- **測試層**：Unit
- **步驟**：
  1. mock `cursorRows` 回傳 5 筆合成資料；呼叫 `exportResult(runId, 'csv')`
  2. 取回應 body（字串）；嘗試以 exceljs 解析（預期無法讀為多 sheet xlsx）或直接驗證 CSV 欄位
- **期望結果**：
  - body 為純文字 CSV 格式（Content-Type `text/csv`）
  - CSV 表頭列欄數 = 23（F064 v2.1 欄序，與 F108 前一致）
  - **不含** `'樞紐分析'`、`'部門代號'`、`'計數 - 案號'`、`'列標籤'` 等樞紐專用欄名
  - CSV 第一列分割後欄名陣列 `toEqual(EXPORT_HEADER_V2)`（未因 F108 改動）

---

### TS-F108-SHEET-004：靜態掃描——buildExportCsvStreaming 不含 pivot 相關呼叫（TC-171-10 靜態補強）

- **相關 AC / BR**：BR-F108-01 / I-PIV-SHEET-01
- **測試類型**：Regression（靜態程式碼掃描）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `assignment-run-report.service.ts` 中 `buildExportCsvStreaming` 函式體
  2. 搜尋 `addWorksheet` / `accumulatePivot` / `createPivotAggregation` / `writePivotSheet`
- **期望結果**：
  - `buildExportCsvStreaming` 函式體內上述關鍵字 = **0 個 match**
  - CSV 路徑與 pivot 邏輯完全隔離（I-PIV-SHEET-01 靜態確認）

---

## 二、HEADER — 版面標頭列（AC-2 / BR-F108-08）

> **設計依據**：F108 spec §4 AC-2 / BR-F108-08；AD-E07-v3.7 §5.2 `writePivotSheet` 寫入順序（R1~R4）。
>
> **核心驗收目標**：「樞紐分析」第 2 頁籤前 4 列版面與 legacy 工作表2 對齊。
>
> **前置條件（HEADER 群組共用）**：mock `cursorRows` 回傳 spec §6.1 合成資料集（20 筆；2 個 listNo = OB202606001 / OB202606007）；讀取 `wb.worksheets[1]`。

### TS-F108-HEADER-001：R1 = 部門代號 / (全部)

- **相關 AC / BR**：AC-2 / BR-F108-08
- **測試類型**：正向
- **測試層**：Unit
- **步驟**：
  1. 呼叫 `exportResult(runId,'xlsx')`；讀回 `pivotWs = wb.worksheets[1]`
  2. 取 `pivotWs.getCell('A1').value` 與 `pivotWs.getCell('B1').value`
- **期望結果**：
  - `A1 === '部門代號'`
  - `B1 === '(全部)'`

---

### TS-F108-HEADER-002：R2 為空列

- **相關 AC / BR**：AC-2 / BR-F108-08
- **測試類型**：正向
- **測試層**：Unit
- **步驟**：
  1. 取 `pivotWs.getRow(2)` 的所有非空儲存格
- **期望結果**：
  - R2 所有儲存格 value = `null` / `undefined` / `''`（空列，無任何非空值）

---

### TS-F108-HEADER-003：R3 = 計數 - 案號 / 欄標籤

- **相關 AC / BR**：AC-2 / BR-F108-08
- **測試類型**：正向
- **測試層**：Unit
- **步驟**：
  1. 取 `pivotWs.getCell('A3').value` 與 `pivotWs.getCell('B3').value`
- **期望結果**：
  - `A3 === '計數 - 案號'`
  - `B3 === '欄標籤'`

---

### TS-F108-HEADER-004：R4 = 列標籤 / listNo 升冪 / 總計

- **相關 AC / BR**：AC-2 / BR-F108-08 / BR-F108-06 / I-PIV-DET-01
- **測試類型**：正向（標頭欄序）
- **測試層**：Unit
- **步驟**：
  1. 取 `pivotWs.getRow(4)` 各欄值（`A4`~最右欄）
- **期望結果**：
  - `A4 === '列標籤'`
  - `B4 === 'OB202606001'`（升冪第 1 個）
  - `C4 === 'OB202606007'`（升冪第 2 個）
  - `D4 === '總計'`（最右欄固定）
  - 欄軸共 4 欄（A=列標籤、B=L1、C=L2、D=總計）

---

## 三、PARENTROW — % of parent row 逐格數值斷言（AC-3 / BR-F108-04 / I-PIV-PARENTROW-01）

> **設計依據**：F108 spec §6 Worked Example（唯一 oracle）；AD-E07-v3.7 §9（逐格驗算表）。
>
> **Oracle 確認（spec §6.2 期望值全 18 格）**：
>
> | 列 | 列標籤 | OB202606001 (L1) | OB202606007 (L2) | 總計 |
> |---|---|---|---|---|
> | R5 | 北區電銷1 | **0.800** | **0.200** | **0.500** |
> | R6 | E1 | **0.750** | **1.000** | **0.800** |
> | R7 | E2 | **0.250** | **0.000** | **0.200** |
> | R8 | 南區電銷 | **0.200** | **0.800** | **0.500** |
> | R9 | E3 | **1.000** | **1.000** | **1.000** |
> | R10 | 總計 | **1.000** | **1.000** | **1.000** |
>
> **合成輸入資料集（20 筆 RawExportRow）**：
> - `{emphire_dept_name:'北區電銷1', emplid:'E1', list_no:'OB202606001'}` × 6
> - `{emphire_dept_name:'北區電銷1', emplid:'E1', list_no:'OB202606007'}` × 2
> - `{emphire_dept_name:'北區電銷1', emplid:'E2', list_no:'OB202606001'}` × 2
> - `{emphire_dept_name:'南區電銷', emplid:'E3', list_no:'OB202606001'}` × 2
> - `{emphire_dept_name:'南區電銷', emplid:'E3', list_no:'OB202606007'}` × 8
> （注意：E2 在 OB202606007 無任何列，產生 cell[北][E2][L2]=0，deptByList[北][L2]=2 → 0.0%）
>
> **前置條件（PARENTROW 群組共用）**：mock `cursorRows` 餵入上述 20 筆；`exportResult(runId,'xlsx')`；讀取 `pivotWs = wb.worksheets[1]`。
>
> **斷言方式**：`Math.abs((pivotWs.getCell(addr).value as number) - expected) < 1e-9`

### TS-F108-PARENTROW-001：部門列 + 員編列 + 總計列逐格 oracle（spec §6.2 全 18 格，TC-171-03）

- **相關 AC / BR**：AC-3 / BR-F108-04 / I-PIV-PARENTROW-01
- **測試類型**：正向（oracle 全覆蓋）
- **測試層**：Unit
- **步驟**：
  1. 讀取 R5~R10、B~D 欄各儲存格數值
  2. 逐格比對 oracle（容 < 1e-9）
- **期望結果**：
  - R5（北區電銷1）：B5 ≈ 0.800；C5 ≈ 0.200；D5 ≈ 0.500
  - R6（E1）：B6 ≈ 0.750；C6 ≈ 1.000；D6 ≈ 0.800
  - R7（E2）：B7 ≈ 0.250；C7 ≈ 0.000（**非 null**，因分子 0 分母 2 > 0）；D7 ≈ 0.200
  - R8（南區電銷）：B8 ≈ 0.200；C8 ≈ 0.800；D8 ≈ 0.500
  - R9（E3）：B9 ≈ 1.000；C9 ≈ 1.000；D9 ≈ 1.000
  - R10（總計）：B10 ≈ 1.000；C10 ≈ 1.000；D10 ≈ 1.000
  - 共 18 格全部在 oracle ±1e-9 內

---

### TS-F108-PARENTROW-002：同欄各部門列加總 = 100%（列軸外層加總不變式，TC-171-03）

- **相關 AC / BR**：AC-3 / BR-F108-04（部門列語意）/ I-PIV-PARENTROW-01
- **測試類型**：正向（不變式驗證）
- **測試層**：Unit
- **步驟**：
  1. 讀取 B5（北區電銷1-L1）+ B8（南區電銷-L1）；計算 sum1
  2. 讀取 C5 + C8；計算 sum2
  3. 讀取 D5 + D8；計算 sum3
- **期望結果**：
  - `Math.abs(sum1 - 1.0) < 1e-3`（L1 欄部門加總）
  - `Math.abs(sum2 - 1.0) < 1e-3`（L2 欄部門加總）
  - `Math.abs(sum3 - 1.0) < 1e-3`（總計欄部門加總）
  - （驗算：0.800+0.200=1.000；0.200+0.800=1.000；0.500+0.500=1.000 ✓）

---

### TS-F108-PARENTROW-003：同部門同欄員編列加總 ≈ 100%（列軸內層加總不變式，TC-171-03）

- **相關 AC / BR**：AC-3 / BR-F108-04（員編列語意）/ I-PIV-PARENTROW-01
- **測試類型**：正向（不變式驗證）
- **測試層**：Unit
- **步驟**：
  1. 北區電銷1-L1：B6 + B7；北區電銷1-L2：C6 + C7；北區電銷1-總計：D6 + D7
  2. 南區電銷-L1：B9；南區電銷-L2：C9；南區電銷-總計：D9
- **期望結果**：
  - 北區電銷1：L1 合計 ≈ 1.000（0.750+0.250）；L2 合計 ≈ 1.000（1.000+0.000）；總計欄 ≈ 1.000（0.800+0.200）
  - 南區電銷：E3 單一員編，L1/L2/總計各均 ≈ 1.000
  - 所有 `Math.abs(sum - 1.0) < 1e-3`

---

### TS-F108-PARENTROW-004：總計列每欄值 = 1.000（TC-171-03）

- **相關 AC / BR**：AC-3 / BR-F108-04（總計列語意）/ I-PIV-PARENTROW-01
- **測試類型**：正向
- **測試層**：Unit
- **步驟**：
  1. 讀取 B10、C10、D10（總計列 L1 / L2 / 總計欄）
- **期望結果**：
  - `Math.abs(B10 - 1.0) < 1e-9`
  - `Math.abs(C10 - 1.0) < 1e-9`
  - `Math.abs(D10 - 1.0) < 1e-9`

---

### TS-F108-PARENTROW-005：部門列總計欄 = 該部門全部案件 ÷ 全體案件（TC-171-03）

- **相關 AC / BR**：AC-3 / BR-F108-04 §4（總計欄語意）/ I-PIV-PARENTROW-01
- **測試類型**：正向（總計欄部門層語意）
- **測試層**：Unit
- **步驟**：
  1. 讀取 D5（北區電銷1 總計欄）與 D8（南區電銷 總計欄）
- **期望結果**：
  - D5 ≈ 10/20 = 0.500（deptTotal[北]/grandTotal）
  - D8 ≈ 10/20 = 0.500（deptTotal[南]/grandTotal）
  - D5 + D8 ≈ 1.000（容 1e-3）

---

### TS-F108-PARENTROW-006：員編列總計欄 = 該員編全部案件 ÷ 所屬部門全部案件（TC-171-03）

- **相關 AC / BR**：AC-3 / BR-F108-04 §4（總計欄員編層語意）/ I-PIV-PARENTROW-01
- **測試類型**：正向（總計欄員編層語意）
- **測試層**：Unit
- **步驟**：
  1. 讀取 D6（E1 總計欄）/ D7（E2 總計欄）/ D9（E3 總計欄）
- **期望結果**：
  - D6 ≈ 8/10 = 0.800（cellTotal[北][E1]/deptTotal[北]）
  - D7 ≈ 2/10 = 0.200（cellTotal[北][E2]/deptTotal[北]）
  - D9 ≈ 10/10 = 1.000（cellTotal[南][E3]/deptTotal[南]）

---

### TS-F108-PARENTROW-007：所有數值儲存格 numFmt = '0.0%'（TC-171-03）

- **相關 AC / BR**：AC-3 / BR-F108-04 / I-PIV-PARENTROW-01
- **測試類型**：正向（格式驗證）
- **測試層**：Unit
- **步驟**：
  1. 讀取 R5~R10 中所有含數值的儲存格（B5~D10，排除空列及標頭）
  2. 對每個儲存格取 `.numFmt`
- **期望結果**：
  - 所有含數值儲存格：`cell.numFmt === '0.0%'`
  - **含** E2-L2（B7：值 = 0.000，不為 null）的 numFmt 亦為 `'0.0%'`

---

## 四、ZEROBLANK — 除零保護（BR-F108-11 / AC-3）

> **設計依據**：F108 spec §4 BR-F108-11；AD-E07-v3.7 §3.3 `pctOrBlank()`。
>
> **規則**：`denominator > 0, numerator = 0` → 儲存格值 = 0（0.0%，**非 null**）；`denominator = 0`（0/0）→ 儲存格值 = null（空白）。
>
> **注意**：exceljs 空白儲存格 = `.value === null` 或 `.value === undefined`；值為 0 的儲存格 = `.value === 0`（不為 null）。

### TS-F108-ZEROBLANK-001：分子=0、分母>0 → 儲存格值=0（0.0%），非 null（TC-171-05）

- **相關 AC / BR**：AC-3 / BR-F108-11
- **測試類型**：正向 / 邊界（0/positive 路徑）
- **測試層**：Unit
- **步驟**：
  1. 使用 PARENTROW 群組同一 20 筆輸入（E2 在 L2 無案件）
  2. 讀取 C7（E2 的 OB202606007 欄位）
- **期望結果**：
  - `C7 !== null` && `C7 !== undefined`（**非空白**）
  - `Math.abs((C7 as number) - 0.0) < 1e-9`（值 = 0）
  - `pivotWs.getCell('C7').numFmt === '0.0%'`（格式仍設定）
  - （驗算：cell[北][E2][L2]=0，deptByList[北][L2]=2 > 0 → pctOrBlank(0,2)=0 → 0.0%，非 null）

---

### TS-F108-ZEROBLANK-002：部門在某欄 deptByList=0 → 員編列對應欄為空白（TC-171-04）

- **相關 AC / BR**：AC-3 / BR-F108-11（0/0 路徑）
- **測試類型**：邊界（員編層 0/0）
- **測試層**：Unit
- **前置條件**：
  - 合成輸入：部門甲（員編 EA）在 L1 有 3 筆；部門乙（員編 EB）在 L2 有 2 筆；無任何甲-L2 或乙-L1 列
  - 共 5 筆 RawExportRow：`{甲,EA,L1}×3, {乙,EB,L2}×2`
  - listNos = [L1, L2]；grandByList[L1]=3, grandByList[L2]=2
  - deptByList[甲][L1]=3, deptByList[甲][L2]=0（部門甲在 L2 無任何案件）
- **步驟**：
  1. 呼叫 `exportResult(runId,'xlsx')`；讀回 `pivotWs`
  2. 找到 EA 所在列；取 L2 欄儲存格值
- **期望結果**：
  - EA 列，L2 欄：`value === null`（空白，不為 0）
  - （驗算：cell[甲][EA][L2]=0，deptByList[甲][L2]=0 → pctOrBlank(0,0)=null → 空白）
  - 同列 L1 欄正常：`Math.abs(value - 1.0) < 1e-9`（3/3=100%）

---

### TS-F108-ZEROBLANK-003：部門列分子=0、分母>0 → 0.0%，非空白（TC-171-04 區分）

- **相關 AC / BR**：AC-3 / BR-F108-11
- **測試類型**：邊界（部門層 0/positive 區分）
- **測試層**：Unit
- **前置條件**：
  - 同 ZEROBLANK-002 合成輸入（5 筆）
- **步驟**：
  1. 找到「甲」部門所在列；取 L2 欄（部門層）儲存格值
- **期望結果**：
  - 甲部門列，L2 欄：值 = 0（非 null，因 grandByList[L2]=2 > 0 → deptByList[甲][L2]/grandByList[L2] = 0/2 = 0）
  - numFmt = `'0.0%'`
  - （此格與 EA 員編列 L2 欄空白的對比：部門層 0/positive→0.0%，員編層 0/0→空白）

---

## 五、DET — 確定性排序（AC-4 / BR-F108-06 / I-PIV-DET-01）

> **設計依據**：F108 spec §4 BR-F108-06；AD-E07-v3.7 §6（排序演算法）；OQ-F108-01/02 裁定（(空白) 最後 / 字串升冪）。
>
> **核心驗收目標**：欄軸 listNo 字串升冪；列軸外層部門 localeCompare；列軸內層員編字串升冪；(空白) 部門固定最後。

### TS-F108-DET-001：欄軸 listNo 字串升冪排列，最右欄固定為「總計」（TC-171-06）

- **相關 AC / BR**：AC-4 / BR-F108-06 / I-PIV-DET-01
- **測試類型**：正向（欄軸順序）
- **測試層**：Unit
- **前置條件**：
  - 合成輸入含 3 個 listNo：`OB202606013`、`OB202606001`、`OB202606007`（刻意打亂輸入順序）
  - 各 listNo 至少 1 筆資料
- **步驟**：
  1. 呼叫 `exportResult(runId,'xlsx')`；讀取 R4 各欄值
- **期望結果**：
  - B4 = `'OB202606001'`（最小）
  - C4 = `'OB202606007'`
  - D4 = `'OB202606013'`
  - E4 = `'總計'`（最右，固定）
  - 排序為字串升冪（字典序），與輸入列出現順序無關

---

### TS-F108-DET-002：列軸外層部門 localeCompare 升冪（TC-171-06）

- **相關 AC / BR**：AC-4 / BR-F108-06 / I-PIV-DET-01
- **測試類型**：正向（列軸外層順序）
- **測試層**：Unit
- **前置條件**：
  - 合成輸入含 2 部門：`南區電銷`（南）、`北區電銷1`（北）（刻意南在前）
  - 各部門至少 1 筆資料
- **步驟**：
  1. 讀取 R5（第一個部門列）與 R8（第二個部門列）的 A 欄值
- **期望結果**：
  - R5 A欄 = `'北區電銷1'`（localeCompare 升冪較小）
  - R8 A欄 = `'南區電銷'`
  - 排序與輸入時出現順序無關（I-PIV-DET-01 不依賴 Map 插入順序）

---

### TS-F108-DET-003：列軸內層員編字串升冪（TC-171-06）

- **相關 AC / BR**：AC-4 / BR-F108-06 / I-PIV-DET-01
- **測試類型**：正向（列軸內層順序）
- **測試層**：Unit
- **前置條件**：
  - 合成輸入：部門「北區電銷1」下含員編 E3、E1、E2（刻意 E3 最先出現在輸入中）
- **步驟**：
  1. 讀取部門「北區電銷1」列之後的連續員編列 A 欄值
- **期望結果**：
  - 員編列順序：E1 → E2 → E3（字串升冪，'E1' < 'E2' < 'E3'）
  - 不依賴員編在輸入資料中首次出現的順序

---

### TS-F108-DET-004：(空白) 部門群組固定排在最後（TC-171-07 / OQ-F108-01 裁定）

- **相關 AC / BR**：AC-4 / BR-F108-06 / I-PIV-DET-01
- **測試類型**：正向（(空白) 排序位置）
- **測試層**：Unit
- **前置條件**：
  - 合成輸入：部門「北區電銷1」（E1，2 筆）、`emphire_dept_name=null`（X999，1 筆）、部門「南區電銷」（E3，2 筆）
- **步驟**：
  1. 讀取所有部門列（A 欄值含 '北區電銷1' / '南區電銷' / '(空白)'）的行號
- **期望結果**：
  - 行號：北區電銷1 < 南區電銷 < (空白)（`'(空白)'` 最後）
  - `'(空白)'` 部門群組出現在所有正常部門群組之後

---

## 六、BLANK — join-miss 與空值歸組（AC-7 / BR-F108-03）

> **設計依據**：F108 spec §4 AC-7 / BR-F108-03；§6.4 (空白)群組補充示例（唯一 oracle）；AD-E07-v3.7 §10.1 / §10.2。
>
> **Oracle（§6.4，加入 X999 後的期望值）**：
> - grandByList[L1] = 11；grandByList[L2] = 10；grandTotal = 21
> - 北區電銷1, L1 ≈ 8/11 ≈ 0.7273；南區電銷, L1 ≈ 2/11 ≈ 0.1818；(空白), L1 ≈ 1/11 ≈ 0.0909
> - X999 在 (空白) 部門下，L1 = 1/1 = 1.000；L2 = 0/0 → null（空白）
>
> **合成輸入**：原 20 筆 + 1 筆 `{emphire_dept_name:null, emplid:'X999', list_no:'OB202606001'}`（共 21 筆）

### TS-F108-BLANK-001：emphire join-miss（emphire_dept_name=null）→ 歸 (空白) 部門群組，匯出不中斷（TC-171-08）

- **相關 AC / BR**：AC-7 / BR-F108-03
- **測試類型**：負向（join-miss fallback）
- **測試層**：Unit
- **步驟**：
  1. mock `cursorRows` 回傳 21 筆（含 1 筆 emphire_dept_name=null）；呼叫 `exportResult(runId,'xlsx')`
  2. 讀取 pivotWs；找含 `'(空白)'` 的部門列
- **期望結果**：
  - 存在部門列 A 欄值 = `'(空白)'`（歸組成功）
  - 匯出不拋例外；回傳 Buffer 可正常解析（不中斷）
  - `(空白)` 部門群組下含員編列 `'X999'`

---

### TS-F108-BLANK-002：(空白) 群組加入後既有部門百分比隨欄總計重算正確（TC-171-08，§6.4 oracle）

- **相關 AC / BR**：AC-7 / BR-F108-03 / BR-F108-04 / I-PIV-PARENTROW-01
- **測試類型**：正向（重算正確性 oracle）
- **測試層**：Unit
- **前置條件**：21 筆輸入（含 X999 null-dept）
- **步驟**：
  1. 讀取 L1 欄（OB202606001）各部門列值（北區電銷1、南區電銷、(空白)）
  2. 讀取 X999 員編列，L1 欄與 L2 欄
- **期望結果**：
  - 北區電銷1, L1：`Math.abs(value - 8/11) < 1e-9`（≈ 0.7273）
  - 南區電銷, L1：`Math.abs(value - 2/11) < 1e-9`（≈ 0.1818）
  - (空白), L1：`Math.abs(value - 1/11) < 1e-9`（≈ 0.0909）
  - L1 欄三部門加總 ≈ 1.000（容 1e-3）
  - X999, L1：`Math.abs(value - 1.0) < 1e-9`（1/1 = 100%）
  - X999, L2：值 = null（0/0，deptByList['(空白)'][L2]=0 → 空白）

---

### TS-F108-BLANK-003：emplid=null → 歸入該部門「(空白)」員編列（OQ-F108-04 裁定）

- **相關 AC / BR**：BR-F108-03 / OQ-F108-04
- **測試類型**：邊界（emplid 為空）
- **測試層**：Unit
- **前置條件**：
  - 合成輸入含 1 筆 `{emphire_dept_name:'北區電銷1', emplid:null, list_no:'OB202606001'}`（emplid=null）
- **步驟**：
  1. 呼叫 `exportResult(runId,'xlsx')`；找北區電銷1 部門群組的員編列
- **期望結果**：
  - 北區電銷1 部門群組下存在員編列，A 欄值 = `'(空白)'`（emplid null → `'(空白)'` emplidKey）
  - 該列在 L1 欄有正常計數百分比（非 null）

---

## 七、SCOPE — 處長 scope（AC-5 / BR-F108-02 / I-PIV-SOURCE-01 / SCOPE 紅線）

> **設計依據**：F108 spec §4 AC-5 / BR-F108-02；AD-E07-v3.7 §4 單一迴圈整合點；ground-truth brief §2 決策 D-6。
>
> **SCOPE 紅線**：樞紐頁籤**不得出現**轄區外的部門名稱或員編。此為安全 DoD 門檻，未通過不得上線。
>
> **Mock 策略說明**：F108 的 SCOPE 紅線由 `cursorRows(query)` 已套 scope filter 自動保證（I-PIV-SOURCE-01）。Unit test 藉由控制 mock `cursorRows` 的回傳內容，驗證 pivot 只聚合其中資料——即若 cursorRows 只回傳轄區列，pivot 就只含轄區數據。F064 的 SQL WHERE 注入已由 F064 SCOPE 群組（PG 層）獨立驗證；F108 不重複此 SQL 層驗證。

### TS-F108-SCOPE-001：section_chief actor — 樞紐只含轄區內部門，不洩漏轄區外（TC-171-09）

- **相關 AC / BR**：AC-5 / BR-F108-02 / I-PIV-SOURCE-01
- **測試類型**：正向（SCOPE 紅線）
- **測試層**：Unit
- **前置條件**：
  - mock `cursorRows` 只回傳轄區內員編 E1（屬「北區電銷1」）的 3 筆資料；模擬 section_chief scope filter 已過濾 E2/E3
  - actor `businessRole = 'section_chief'`
- **步驟**：
  1. 呼叫 `exportResult(runId,'xlsx')`；讀取 pivotWs 所有部門列 A 欄值
- **期望結果**：
  - 僅出現「北區電銷1」部門列（E1 的部門）
  - **不出現**「南區電銷」（轄區外，E3 的部門）
  - **不出現**員編 E2、E3（轄區外員編）
  - 整體匯出不被阻擋（回 200 OK，workbook 含 2 頁）

---

### TS-F108-SCOPE-002：director actor — bypass scope，樞紐含全公司部門（TC-171-09）

- **相關 AC / BR**：AC-5 / BR-F108-02 / I-PIV-SOURCE-01
- **測試類型**：正向（bypass 驗證）
- **測試層**：Unit
- **前置條件**：
  - mock `cursorRows` 回傳全 20 筆（含 E1/E2/E3 三員編，兩部門）
  - actor `businessRole = 'director'`（bypass filter）
- **步驟**：
  1. 讀取 pivotWs 所有部門列 A 欄值
- **期望結果**：
  - 出現「北區電銷1」與「南區電銷」兩個部門列
  - E1、E2（北區電銷1 下）與 E3（南區電銷 下）均出現

---

### TS-F108-SCOPE-003：靜態確認——accumulatePivot 在 for await 迴圈內、與 addRow 同層呼叫（I-PIV-SOURCE-01 靜態）

- **相關 AC / BR**：I-PIV-SOURCE-01 / BR-F108-02
- **測試類型**：Regression（靜態程式碼掃描）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `buildExportXlsxStreaming` 函式體，取 `for await` 迴圈主體
  2. 確認 `accumulatePivot(raw, pivotAgg)` 在迴圈體內（與 `sheet.addRow` 同層）
  3. 確認無任何「第 2 次查詢」（無 `buildExportQuery` 或 `cursorRows` 的第 2 次呼叫）
- **期望結果**：
  - `accumulatePivot` 呼叫在 `for await (const raw of source)` 迴圈體內 = **1 個 match**
  - `cursorRows` / `buildExportQuery` 在 `buildExportXlsxStreaming` 函式體內 = **1 個呼叫**（不重複呼叫）
  - SCOPE 紅線靜態保證：聚合源 = 與明細列同一 scoped cursor

---

## 八、EMPTY — 空結果邊界（AC-8 / BR-F108-09 / BR-F108-11）

> **設計依據**：F108 spec §4 AC-8 / BR-F108-09 / BR-F108-11；AD-E07-v3.7 §7 空結果邊界處理。
>
> **期望頁籤版面**（0 列時）：
> - R1: `部門代號` / `(全部)`
> - R2: （空）
> - R3: `計數 - 案號` / `欄標籤`
> - R4: `列標籤` / `總計`（無 listNo 欄，因 `sortedListNos=[]`）
> - 總計列: `總計` / null（0/0 → 空白，BR-F108-11）
> - 無任何部門列 / 員編列
>
> **注意**：OQ-F108-03 裁定：標頭 R1~R4 + 總計列均存在；總計列總計欄因 grandTotal=0 → 0/0 → null。

### TS-F108-EMPTY-001：0 列輸入 → xlsx 仍含 2 個工作表（TC-171-11）

- **相關 AC / BR**：AC-8 / BR-F108-09 / I-PIV-SHEET-01
- **測試類型**：邊界
- **測試層**：Unit
- **前置條件**：mock `cursorRows` 回傳空陣列（0 筆）
- **步驟**：
  1. 呼叫 `exportResult(runId,'xlsx')`；讀回 workbook
- **期望結果**：
  - `wb.worksheets.length === 2`（xlsx 仍有 2 個工作表，F108 不因無資料退化為 1 頁）

---

### TS-F108-EMPTY-002：空結果時第 2 頁含 R1~R4 + 總計列；無 listNo 欄；總計列總計欄 = null（TC-171-11）

- **相關 AC / BR**：AC-8 / BR-F108-09 / BR-F108-11
- **測試類型**：邊界（空表版面）
- **測試層**：Unit
- **前置條件**：mock `cursorRows` 回傳 0 筆
- **步驟**：
  1. 讀取 pivotWs R1~最後列
- **期望結果**：
  - `A1 = '部門代號'`；`B1 = '(全部)'`
  - R2 為空
  - `A3 = '計數 - 案號'`；`B3 = '欄標籤'`
  - `A4 = '列標籤'`；`B4 = '總計'`（無 listNo 欄，因空結果 `sortedListNos=[]`；總計直接在 B4）
  - 存在總計列：A 欄 = `'總計'`；B 欄（總計欄）= `null`（0/0 → 空白，BR-F108-11）
  - 無任何部門列 / 員編列（R4 後只有總計列）
  - 整個 pivotWs 列數 = 5（R1~R4 + 總計列）

---

### TS-F108-EMPTY-003：0 列輸入整體匯出回 200 OK，不回 500（TC-171-11）

- **相關 AC / BR**：AC-8 / BR-F108-09
- **測試類型**：邊界（HTTP 狀態）
- **測試層**：Integration（SQLite，NestJS TestingModule）
- **前置條件**：
  - `assignment_run.status = 'completed'`（seed 一筆 completed run）
  - mock `cursorRows` 回傳 0 筆（或 `ob_monthly_run_result` 無該 runId 的資料）
- **步驟**：
  1. 以 director actor 呼叫 `GET /api/v1/assignment/runs/:runId/export?format=xlsx`
- **期望結果**：
  - HTTP 200 OK（不回 500）
  - Content-Type 含 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - Response body 為非空 Buffer（可被 exceljs 解析）

---

## 九、REGRESSION — DoD 紅線（明細頁不受影響 + CSV 不含樞紐）

> **設計依據**：F108 spec §4 BR-F108-07 / BR-F108-01 / BR-F108-10；AD-E07-v3.7 §13（不修改清單）。
>
> **REGRESSION DoD 紅線（所有案例必須全綠，任一失敗即阻擋上線）**：
>
> | 紅線項目 | 驗證方式 | 對應案例 |
> |---|---|---|
> | 第 1 頁 `assignment_result` 表頭恰好 23 欄，欄序與 F064 v2.1 `EXPORT_HEADER_V2` 完全一致 | Unit runtime 讀回 xlsx `wb.worksheets[0]` | REGRESSION-001 |
> | 第 1 頁資料列數 = mock `cursorRows` 回傳筆數（F108 修改不改變明細列數）| Unit runtime | REGRESSION-002 |
> | CSV 格式輸出與 F064 v2.1 完全一致（23 欄，不含樞紐）| Unit runtime | REGRESSION-003 |
> | `buildExportCsvStreaming` 靜態確認不含 pivot 呼叫 | 靜態 grep | SHEET-004（已在一、節）|
>
> **前置條件（REGRESSION 群組共用）**：mock `cursorRows` 回傳 spec §6.1 合成資料集（20 筆）。

### TS-F108-REGRESSION-001：F108 修改後第 1 頁表頭仍為 23 欄且欄序不變（TC-171-12，DoD 紅線）

- **相關 AC / BR**：BR-F108-07 / AC-1 / I-PIV-SHEET-01
- **測試類型**：Regression（DoD 紅線）
- **測試層**：Unit
- **步驟**：
  1. 呼叫 `exportResult(runId,'xlsx')`；讀回 `wb.worksheets[0]`
  2. 取第 1 列（表頭列）各欄值
- **期望結果**：
  - 表頭列長度 = **23**（不多不少）
  - 表頭列 `toEqual(EXPORT_HEADER_V2)`（逐欄比對，與 F064 v2.1 完全一致，無任何位移）
  - **不含** `'樞紐分析'` / `'部門代號'` / `'計數 - 案號'` / `'列標籤'` 等樞紐欄名
  - 此為 DoD 阻擋門檻，任何表頭偏差均視為缺陷

---

### TS-F108-REGRESSION-002：F108 修改後第 1 頁資料列數 = cursorRows 輸入筆數（TC-171-12，DoD 紅線）

- **相關 AC / BR**：BR-F108-07 / BR-F108-10（rowCount 語意不變）
- **測試類型**：Regression（DoD 紅線）
- **測試層**：Unit
- **步驟**：
  1. mock `cursorRows` 回傳 20 筆（spec §6.1 資料集）；讀回 `wb.worksheets[0]`
  2. 計算資料列數（排除表頭列）
- **期望結果**：
  - `wb.worksheets[0]` 資料列數 = **20**（與 cursorRows 輸入筆數相同，不因新增 pivot 而改變）
  - 第 1 頁 rowCount 與 F064 v2.1 原本測試結果一致（BR-F108-10 稽核語意不變）

---

### TS-F108-REGRESSION-003：CSV 路徑輸出與 F064 v2.1 完全一致，不含樞紐（TC-171-10 + DoD 紅線）

- **相關 AC / BR**：AC-6 / BR-F108-01 / I-PIV-SHEET-01
- **測試類型**：Regression（DoD 紅線）
- **測試層**：Unit
- **前置條件**：mock `cursorRows` 回傳 5 筆合成資料（含必要欄位以生成 23 欄 CSV）
- **步驟**：
  1. 呼叫 `exportResult(runId,'csv')`；解析 CSV 第 1 列（表頭）與資料列數
- **期望結果**：
  - CSV 表頭欄數 = 23
  - 表頭欄名 `toEqual(EXPORT_HEADER_V2)`（F064 v2.1 欄序，不受 F108 影響）
  - CSV 資料列數 = 5（= cursorRows 輸入筆數，無多餘列）
  - **不含** `'部門代號'` / `'計數 - 案號'` / `'列標籤'` / `'總計'` 等樞紐欄名

---

### TS-F108-REGRESSION-004：靜態確認——`buildExportCsvStreaming` 不含 pivotAgg 初始化或寫入呼叫（DoD 紅線靜態補強）

- **相關 AC / BR**：BR-F108-01 / I-PIV-SHEET-01
- **測試類型**：Regression（靜態掃描，DoD 門檻）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `assignment-run-report.service.ts` 中 `buildExportCsvStreaming` 函式體
  2. 搜尋 `pivotAgg` / `createPivotAggregation` / `accumulatePivot` / `writePivotSheet` / `addWorksheet('樞紐分析')`
- **期望結果**：
  - 上述關鍵字在 `buildExportCsvStreaming` 函式體 = **0 個 match**（CSV 路徑與 pivot 完全隔離）

---

## 十、STATIC — 靜態掃描（I-PIV-SOURCE-01 / I-PIV-MEM-01）

> **設計依據**：AD-E07-v3.7 §4.2（整合位置偽碼）/ §5.2（時序）/ §2.2（記憶體安全）。

### TS-F108-STATIC-001：addWorksheet('樞紐分析') 在 sheet.commit() 之後（WorkbookWriter 時序靜態）

- **相關 AC / BR**：I-PIV-SHEET-01 / BR-F108-07 / AD-E07-v3.7 §5.2
- **測試類型**：靜態掃描（時序保護）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. 讀取 `buildExportXlsxStreaming` 函式體；取 `sheet.commit()` 與 `addWorksheet('樞紐分析')` 的行號
- **期望結果**：
  - `sheet.commit()` 行號 < `addWorksheet('樞紐分析')` 行號（sheet 1 先 commit，再 add sheet 2）
  - `pivotSheet.commit()` 行號 < `workbook.commit()` 行號（sheet 2 先 commit，再 workbook commit）

---

### TS-F108-STATIC-002：聚合結構只存計數，不全載明細列（I-PIV-MEM-01 靜態）

- **相關 AC / BR**：I-PIV-MEM-01 / BR-F108-05
- **測試類型**：靜態掃描（記憶體安全）
- **測試層**：Unit（靜態 grep）
- **步驟**：
  1. grep `accumulatePivot` 函式體；確認無 `rows.push(raw)` / `allRows` / `Buffer.concat(formatted)` 等全量累積模式
  2. 確認只更新 Map 計數（`Map.set` / `++ count` 等）
- **期望結果**：
  - `accumulatePivot` 函式體不含任何「全量累積明細列」模式
  - 函式體含 Map 計數更新（`map.set(key, (map.get(key) ?? 0) + 1)` 或等效）

---

### TS-F108-STATIC-003：tsc gate — TypeScript 型別無錯誤（feedback_vitest_no_typecheck 教訓）

- **相關 AC / BR**：F108 DoD
- **測試類型**：靜態（型別）
- **測試層**：Unit（型別檢查）
- **步驟**：執行 `tsc --noEmit -p tsconfig.build.json`
- **期望結果**：
  - 退出碼 = 0（無型別錯誤）
  - 特別確認 `PivotAggregation` 型別定義、`accumulatePivot` / `writePivotSheet` 方法簽名與 `RawExportRow` 相容

---

## 十一、PG — Postgres 端對端驗收（選配）

> **設計依據**：ground-truth brief §6（PG spec 可選）；F108 spec §11（相關）。
>
> **適用條件**：僅在 `cdmp_test` Postgres DB 環境下執行；CI 可設為選配慢速套件（slow suite），不阻擋一般 push。對真實月跑 run_id = `84486ddd-1a54-4eaf-a4d0-096ba9bdde58`（202606 月跑）斷言。

### TS-F108-PG-001：對真實 202606 月跑匯出，xlsx 含 2 個工作表且第 2 頁可正常解析

- **相關 AC / BR**：AC-1 / BR-F108-07 / I-PIV-SHEET-01
- **測試類型**：端對端（PG 規模驗收）
- **測試層**：PG Integration
- **前置條件**：
  - `cdmp_test` 含 202606 月跑資料（run_id = `84486ddd-1a54-4eaf-a4d0-096ba9bdde58`，status='completed'）
  - F101 / F102 已 commit（`ob_monthly_run_result.emplid` 有值）
  - director actor（bypass scope）
- **步驟**：
  1. 觸發 `GET /api/v1/assignment/runs/84486ddd.../export?format=xlsx`
  2. 以 exceljs 讀回 Buffer
- **期望結果**：
  - `wb.worksheets.length === 2`
  - `wb.worksheets[0].name === 'assignment_result'`
  - `wb.worksheets[1].name === '樞紐分析'`
  - pivotWs A1 = `'部門代號'`；R4 含若干 listNo 欄（≥ 1）+ `'總計'`
  - 總計列每欄值 ≈ 1.000（容 1e-3）
  - HTTP 200 OK，無 500

---

### TS-F108-PG-002：真實月跑樞紐部門分佈量級與 F063 摘要一致（32/34/15/18%）

- **相關 AC / BR**：AC-3 / BR-F108-04 / I-PIV-PARENTROW-01（規模驗證）
- **測試類型**：端對端（業務語意驗收，選配）
- **測試層**：PG Integration
- **前置條件**：
  - 同 PG-001；202606 月跑（有 F049 Stage 0 已驗算的部門分佈：XVE1-4 ≈ 32.3/34.3/15.4/18.0%）
- **步驟**：
  1. 讀取 pivotWs 各部門列，取「總計欄」值
  2. 與 F063 摘要 API（`GET /assignment/runs/:runId/summary`）回傳的部門百分比比對
- **期望結果**：
  - 各部門「總計欄」值與 F063 摘要對應部門百分比差距 < 0.5%（容浮點與 scope 差異）
  - 四個電銷部門的「總計欄」加總 ≈ 1.000（容 1e-3）
  - XVE1 ≈ 0.320~0.335（32~33.5%）；XVE2 ≈ 0.340~0.350（34~35%）；XVE3 ≈ 0.150~0.160（15~16%）；XVE4 ≈ 0.175~0.185（17.5~18.5%）
  - （選配：若 F067 部門差異報告可讀，數字應對齊 F067 部門分佈列）

---

## 十二、自動化就緒度彙整

| 群組 | 案例數 | 自動化適合度 | 說明 |
|---|---|---|---|
| SHEET | 4 | 高 | 3 Unit + 1 靜態 grep；無外部依賴 |
| HEADER | 4 | 高 | pure Unit；mock 清晰 |
| PARENTROW | 7 | 高（DoD 核心）| pure Unit；oracle 逐格確定；容浮點 1e-9 |
| ZEROBLANK | 3 | 高 | pure Unit；邊界設計清晰 |
| DET | 4 | 高 | pure Unit；輸入刻意打亂確認排序 |
| BLANK | 3 | 高 | Unit；§6.4 oracle 明確 |
| SCOPE | 3 | 高（安全 DoD）| 2 Unit + 1 靜態 grep；mock cursorRows 控制 scoped 輸入 |
| EMPTY | 3 | 高 | 2 Unit + 1 SQLite Integration |
| REGRESSION | 4 | 高（DoD 阻擋）| 3 Unit + 1 靜態 grep；DoD 紅線 |
| STATIC | 3 | 高 | 靜態 grep；確定性強 |
| PG | 2 | 中（選配）| 需 Postgres；可設慢速套件；PG-002 含業務容差 |
| **合計** | **40** | — | 38 Unit/靜態（無需 PG）+ 2 PG |

### 手動驗收項目

| 項目 | 原因 |
|---|---|
| TS-F108-PG-002 部門分佈 legacy 對照（F067 差異報告）| 需 legacy `reference/202606 分派名單.xlsx` 工作表2 實際數字對照；量級驗收可自動化，逐格精確對照為人工 |
| 真實月跑 55,863 筆 OOM 防護驗收 | 需 prod 環境規模；CI 以 EMPTY / STREAM（F064 既有）代替 |

---

## 十三、測試缺口與開放問題

| ID | 類別 | 問題描述 | 影響群組 | 建議處置 |
|---|---|---|---|---|
| GAP-F108-001 | 架構實作細節 | exceljs `WorksheetWriter`（streaming）vs `Worksheet`（in-memory）的 `getCell()` 讀取 API 是否相同？write-only WorksheetWriter 可能無 `getCell` 讀取支援。測試若用 `wb.xlsx.load(buffer)` 讀回（非 streaming writer），則不存在此問題。 | 所有 Unit 群組 | tdd-implementation 確認：Unit test 用 `wb.xlsx.load(buffer)` 非 streaming mode 讀回；若 WorksheetWriter 在讀回時已序列化，getCell 應可用 |
| GAP-F108-002 | 測試環境 | `numFmt` 讀回行為：`wb.xlsx.load(buffer)` 後 `cell.numFmt` 是否保留 `'0.0%'`，還是由 exceljs 轉換為其他格式？ | PARENTROW-007 / ZEROBLANK-001 | tdd-implementation 實際驗證 exceljs 讀回 numFmt 格式字串；若格式不保留，改斷言 cell.style.numFmt |
| GAP-F108-003 | Spec 細節 | 空結果時 R4（列標籤行）的 B4 是否直接為 `'總計'`？還是 B4 也空、總計列的 B 欄才是 `'總計'`？BR-F108-09 與 AD-E07-v3.7 §7 說明略有差異。 | EMPTY-002 | test-designer 裁定：R4 B4 = `'總計'`（無 listNo 欄時，總計欄直接是 R4 的第 2 欄）；tdd-implementation 依此實作 |
| GAP-F108-004 | 效能邊界 | 樞紐頁籤寫入耗時（50 萬格上界）是否影響 `EXPORT_TIMEOUT_MS`？若 timeout 設定過短，大型 pivotAgg 可能觸發超時。 | PG-001 / PG-002 | tdd-implementation 確認 `writePivotSheet` 在 prod 規模（4 部門 × 25 員編 × 13 名單 ≈ 1,300 格）耗時 < 100ms；在 PG-001 中觀察完整匯出時間 |

---

*本文件由 Test Designer Agent 於 2026-06-29 依據 F108 spec v1.0（US-171）、AD-E07-v3.7（2026-06-29）、F108-ground-truth.md、F064-test.md 體例撰寫。TC-171-01~12 全部覆蓋。PARENTROW 數值 oracle 來自 spec §6.2 + §6.4 + AD-E07-v3.7 §9 逐格驗算表（已確認一致）。*
