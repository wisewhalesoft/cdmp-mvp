---
ad-id: AD-E07-v3.7
title: F108 匯出新增「樞紐分析」頁籤（% of parent row 靜態交叉表）
feature-id: F108
source-stories: US-171
epic: E07
module: M04 分派執行
version: "1.0"
date: 2026-06-29
status: proposed
author: system-architect
covers: [F108, US-171]
depends-on: [AD-E07-v3.4, F064-v2.1]
related: [AD-E07-v3.2, AD-E07-v3.3, AD-E07-v3.4]
invariants:
  - I-PIV-SHEET-01
  - I-PIV-PARENTROW-01
  - I-PIV-SOURCE-01
  - I-PIV-MEM-01
  - I-PIV-DET-01
---

# AD-E07-v3.7　F108 匯出新增「樞紐分析」頁籤

> 本決策記錄為架構設計產出，**不含 production / test 程式碼**。落地由 test-designer（測試策略）、
> tdd-implementation（實作）後續承接。
>
> **前置 AD**：直接延伸 AD-E07-v3.4（F064 v2.1 23 欄匯出），沿用其 `buildExportXlsxStreaming`、
> `cursorRows`、`formatRow`、`RawExportRow` 等既有設計。exceljs WorkbookWriter streaming
> 技術選型於 AD-E07-v3.4 已確立，本 AD 確認繼續有效並在其上新增第 2 頁籤寫入機制。

---

## 1. 問題陳述

F064 v2.1（AD-E07-v3.4，commit on main）xlsx 匯出僅包含單一工作表 `assignment_result`（23 欄明細）。業務需求（F108 / US-171）要求在同一 xlsx 匯出中附加第 2 工作表「樞紐分析」，以**靜態交叉表**（非 Excel 原生 PivotTable）重現 `reference/202606 分派名單.xlsx` 工作表2 的 `樞紐分析表3` 輸出——部門名稱 × 員編（列軸）× 名單代號（欄軸）、數值為 **% of parent row**，格式 `0.0%`。

**核心限制（D-1，已鎖定）**：exceljs 4.4.0 無原生 `addPivotTable` API（已驗證）。後端需預先計算 % of parent row 數值後，寫成一般 worksheet，與 legacy 樞紐輸出數字一致。

**CSV 路徑不受影響**（D-5）：`buildExportCsvStreaming` 維持 F064 v2.1 行為，不含樞紐分析，本 AD 不討論 CSV。

---

## 2. 聚合資料結構（I-PIV-MEM-01）

### 2.1 `PivotAggregation` 型別設計

在 `buildExportXlsxStreaming` 的 cursor 串流迴圈中，以下結構於記憶體累加計數（**只存計數，不保留 7.7 萬筆明細列**）：

```typescript
// 供 tdd-implementation 參考（型別定義，非 production code 原文）
interface PivotAggregation {
  /** 原子計數：cell[deptName][emplid][listNo] = count */
  cell: Map<string, Map<string, Map<string, number>>>;

  /** 部門 × 名單 小計：deptByList[deptName][listNo] = sum(cell[dept][*][listNo]) */
  deptByList: Map<string, Map<string, number>>;

  /** 全體 × 名單 欄總計：grandByList[listNo] = sum(deptByList[*][listNo]) */
  grandByList: Map<string, number>;

  /** 部門跨名單總計（「總計欄」分母）：deptTotal[deptName] = sum(deptByList[dept][*]) */
  deptTotal: Map<string, number>;

  /** 員編跨名單總計（「總計欄」分子）：cellTotal[deptName][emplid] = sum(cell[dept][emplid][*]) */
  cellTotal: Map<string, Map<string, number>>;

  /** 全體跨名單總計（grand total）*/
  grandTotal: number;

  /** 出現過的名單代號集合（用於確定性排序後的欄軸）*/
  listNos: Set<string>;

  /** 出現過的部門名稱集合（用於確定性排序後的外層列軸）*/
  deptNames: Set<string>;

  /** 各部門出現過的員編集合（用於確定性排序後的內層列軸）*/
  emplidsPerDept: Map<string, Set<string>>;
}
```

### 2.2 記憶體安全論證（I-PIV-MEM-01）

| 維度 | 典型 prod 值 | 上界估計 |
|------|------------|---------|
| 部門數 (`deptNames`) | 4 | ≤ 50 |
| 每部門員編數 | 25 | ≤ 200 |
| 名單代號數 (`listNos`) | 13 | ≤ 50 |
| 總 cell 數 | 4 × 25 × 13 = 1,300 | 50 × 200 × 50 = 500,000 |
| 記憶體估計（上界）| < 1 MB | < 50 MB（仍可接受） |

**上界 50 萬格仍遠小於 7.7 萬列 × 23 欄字串之明細記憶體消耗**。7.7 萬筆明細列**不保留**——cursor 迴圈每列讀取後即格式化寫入 sheet 並拋棄，`accumulatePivot` 只讀取三欄（`emphire_dept_name`、`emplid`、`list_no`）的原始值做計數。

**不變式 I-PIV-MEM-01 成立**：匯出記憶體峰值不因明細列數線性增長。

---

## 3. % of parent row 演算法（I-PIV-PARENTROW-01）

### 3.1 分組鍵正規化

`accumulatePivot` 讀取 `RawExportRow` 三欄時做以下正規化（對齊 BR-F108-03）：

```
deptKey  = raw.emphire_dept_name（null / 空字串 → '(空白)'）
emplidKey = raw.emplid（null / 空字串 → '(空白)'）
listKey  = raw.list_no（null / 空字串 → 跳過，不計入聚合）
```

### 3.2 三層 % of parent row 公式

以下以 `L` 代表某名單代號、`D` 代表部門名稱、`E` 代表員編：

#### 部門列（外層，`÷ 欄總計`）

| 欄 | 公式 | 除零保護 |
|----|------|---------|
| 名單代號 `L` | `deptByList[D][L] / grandByList[L]` | 見 §3.3 |
| 總計欄 | `deptTotal[D] / grandTotal` | 見 §3.3 |

**驗證（worked example §6.2 北區電銷1）**：  
L1 = 8/10 = 0.800 → `80.0%` ✓；L2 = 2/10 = 0.200 → `20.0%` ✓；總計 = 10/20 = 0.500 → `50.0%` ✓

#### 員編列（內層，`÷ 所屬部門同欄值`）

| 欄 | 公式 | 除零保護 |
|----|------|---------|
| 名單代號 `L` | `cell[D][E][L] / deptByList[D][L]` | 見 §3.3 |
| 總計欄 | `cellTotal[D][E] / deptTotal[D]` | 見 §3.3 |

**驗證（worked example §6.2 E1、E2）**：  
E1-L1 = 6/8 = 0.750 → `75.0%` ✓；E1-L2 = 2/2 = 1.000 → `100.0%` ✓；E1-總計 = 8/10 = 0.800 → `80.0%` ✓  
E2-L1 = 2/8 = 0.250 → `25.0%` ✓；E2-L2 = 0/2 = 0.000 → `0.0%`（分子 0，分母 2 > 0）✓；E2-總計 = 2/10 = 0.200 → `20.0%` ✓

**驗證（worked example §6.2 E3）**：  
E3-L1 = 2/2 = 1.000 ✓；E3-L2 = 8/8 = 1.000 ✓；E3-總計 = 10/10 = 1.000 ✓

#### 總計列（最末列）

每欄（含總計欄）固定輸出 `1`（= `grandByList[L] / grandByList[L]`），Excel `numFmt='0.0%'` 顯示為 `100.0%`。

> **邊界**：空結果（0 列）時 `grandTotal = 0`，總計欄為 0/0 → 輸出空白（見 §3.3）。

**驗證（worked example §6.2 總計列）**：  
L1 = 10/10 = 1.000 → `100.0%` ✓；L2 = 10/10 = 1.000 → `100.0%` ✓；總計 = 20/20 = 1.000 → `100.0%` ✓

### 3.3 除零保護（BR-F108-11）

```
function pctOrBlank(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;   // 0/0 → 空白儲存格
  return numerator / denominator;       // 0/正數 → 0.0%；正數/正數 → 正常百分比
}
```

- 回傳 `null` → `worksheet.getCell(...).value = null`（空白，不輸出 `0.0%`）
- 回傳 `number` → 儲存格值設為此數值，`numFmt = '0.0%'`（Excel 負責格式化為 1 位小數）

**典型 0/0 情境**：某名單代號欄所有案件均屬其他部門（本部門在該欄計數 = 0 → `deptByList[D][L] = 0`），則本部門下所有員編在該欄的員編列為 0/0 → 空白。

---

## 4. 單一迴圈整合點（I-PIV-SOURCE-01）

### 4.1 設計決策

**樞紐聚合嵌入既有 `buildExportXlsxStreaming` 的 `for await` 迴圈**（不新增 SQL 查詢、不重掃資料表）。處長 scope filter 已內建於 `buildExportQuery` 的 WHERE 條件（`r.emplid IN (…)`），`cursorRows(query)` 回傳的串流已是 scoped 子集——樞紐自動只彙總 scoped 後的列（SCOPE 紅線自動滿足，I-PIV-SOURCE-01 成立）。

### 4.2 整合位置（偽碼）

```typescript
// buildExportXlsxStreaming 修改後偽碼（非 production code）

private async buildExportXlsxStreaming(
  query: ExportQuerySpec,
  timeoutMs: number,
  onRow: (formatted: FormattedExportRow) => void,
): Promise<Buffer> {

  // ... sink / workbook 初始化（不變）...

  const sheet = workbook.addWorksheet('assignment_result');
  // ... header row 寫入（不變）...

  // ← 新增：初始化樞紐聚合狀態
  const pivotAgg = this.createPivotAggregation();

  const writeAndFinish = (async () => {
    const source = await this.cursorRows(query);

    for await (const raw of source as AsyncIterable<RawExportRow>) {
      const formatted = this.formatRow(raw);
      onRow(formatted);
      sheet.addRow(formatted.row).commit();    // 既有明細寫入（不變）

      this.accumulatePivot(raw, pivotAgg);     // ← 新增：同步累加樞紐計數
    }

    sheet.commit();                             // 第 1 頁 commit（不變）

    // ← 新增：第 2 頁（樞紐分析），必須在 sheet 1 commit 後再 add
    const pivotSheet = workbook.addWorksheet('樞紐分析');
    this.writePivotSheet(pivotSheet, pivotAgg);
    pivotSheet.commit();

    await workbook.commit();                    // 最後 workbook commit（不變）
    await sinkEnd;
  })();

  await this.raceTimeout(writeAndFinish, timeoutMs);
  return Buffer.concat(chunks);
}
```

**不變式 I-PIV-SOURCE-01 成立**：`accumulatePivot` 讀取的 `raw`（`RawExportRow`）與明細列逐一對應，來源相同——`cursorRows(query)` 已套 scope，樞紐無法取得 scope 外資料。

---

## 5. WorkbookWriter 多頁籤寫入順序

### 5.1 序列要求

exceljs `stream.xlsx.WorkbookWriter` 採流式 ZIP 寫入——**每個 worksheet XML 在 `sheet.commit()` 時即壓入 ZIP 串流**，而非全部緩衝後批次壓縮。因此：

1. **Sheet 1（`assignment_result`）** 必須在 cursor 迴圈結束後呼叫 `sheet.commit()`，才能保證明細列全數壓入。
2. **Sheet 2（`樞紐分析`）** 必須在 Sheet 1 `commit()` **之後** 呼叫 `workbook.addWorksheet()`——此時聚合也已完成（cursor 迴圈結束）。
3. Sheet 2 寫入完成後呼叫 `pivotSheet.commit()`。
4. 最後呼叫 `workbook.commit()`（寫入 ZIP 的 `[Content_Types].xml` 等 workbook-level XML），再等待 `sinkEnd`。

### 5.2 精確時序

```
addWorksheet('assignment_result')
│
├─ header 列寫入 + commit
│
├─ for await raw of cursorRows(query):
│    formatRow(raw) → addRow().commit()
│    accumulatePivot(raw, pivotAgg)
│
├─ sheet.commit()                       ← sheet 1 完成，此刻 pivotAgg 亦完整
│
├─ addWorksheet('樞紐分析')             ← sheet 2 在此加入（必須在 sheet 1 commit 後）
│    writePivotSheet(pivotSheet, pivotAgg):
│      │  寫 R1（部門代號 / (全部)）
│      │  寫 R2（空列）
│      │  寫 R3（計數 - 案號 / 欄標籤）
│      │  寫 R4（列標籤 / listNo_1 / ... / 總計）
│      │  for each dept:
│      │    寫部門列（dept% 各欄，numFmt='0.0%'）
│      │    for each emplid:
│      │      寫員編列（emplid% 各欄，numFmt='0.0%'）
│      │  寫總計列（100.0% 各欄，或 0/0→空白）
│    pivotSheet.commit()                ← sheet 2 完成
│
└─ workbook.commit()                    ← ZIP workbook-level 結束
   await sinkEnd                        ← 確認 PassThrough sink 資料全部送出
```

### 5.3 WorkbookWriter 限制確認

參考既有 `buildCompareXlsxStreaming`（服務同檔，3 個 sheet）：可確認 WorkbookWriter 支援在前一 sheet `commit()` 後再 `addWorksheet()`（該實作在同一 `async` 函式中依序操作 3 個 sheet，不需特殊 API；F108 採相同模式）。

**差異點**：F108 第 1 頁採 cursor 串流（非全量 in-memory），第 2 頁資料只有在 cursor 串流**結束後**方可計算，故必須先 `sheet.commit()` 再 `addWorksheet('樞紐分析')`。`buildCompareXlsxStreaming` 可 add/write/commit 3 個 sheet 連貫，是因資料在記憶體中已齊備；F108 第 2 頁依賴第 1 頁串流的副作用（聚合），兩者存在因果順序。

---

## 6. 確定性排序（I-PIV-DET-01）

`writePivotSheet` 在寫入前，先對三個維度排序：

### 6.1 欄軸（名單代號）

```typescript
const sortedListNos = [...agg.listNos].sort();
// 字串升冪（'OB202606001' < 'OB202606007'）
// 最右固定附加「總計」欄（不放入 sortedListNos）
```

### 6.2 列軸外層（部門名稱）

```typescript
const sortedDepts = [...agg.deptNames].sort((a, b) => {
  if (a === '(空白)') return 1;   // (空白) 固定排最後（OQ-F108-01 裁定）
  if (b === '(空白)') return -1;
  return a.localeCompare(b);      // 其餘依 localeCompare 升冪
});
```

**驗證（worked example）**：`北區電銷1 localeCompare 南區電銷 < 0`，故 `北區電銷1` 先出現 → 對齊 §6.2 期望輸出 R5 = 北區電銷1，R8 = 南區電銷 ✓

### 6.3 列軸內層（員編）

```typescript
const sortedEmplids = [...(agg.emplidsPerDept.get(dept) ?? [])].sort();
// 字串升冪（OQ-F108-02 裁定；數字員編呈數值升冪效果）
// emplid null/空字串 → '(空白)' emplid 列（OQ-F108-04 裁定）
```

**驗證（worked example）**：`E1 < E2`（字串升冪），對齊 R6 = E1，R7 = E2 ✓

---

## 7. 空結果邊界處理（BR-F108-09）

當 cursor 串流回傳 0 列（月跑 0 筆 或 scope filter 後無轄區資料）：

- `pivotAgg.listNos` 為空 → `sortedListNos = []`
- `pivotAgg.deptNames` 為空 → 無資料列
- `pivotAgg.grandTotal = 0`

`writePivotSheet` 仍依正常路徑寫入：

| 列 | 內容 |
|----|------|
| R1 | `部門代號` \| `(全部)` |
| R2 | （空列）|
| R3 | `計數 - 案號` \| `欄標籤` |
| R4 | `列標籤` \| `總計`（無名單代號欄） |
| 總計列 | `總計` \| `null`（0/0 → 空白，BR-F108-11）|

**不輸出 500**：`writePivotSheet` 純記憶體運算，無網路或 DB IO，不會拋錯。

---

## 8. 私有方法簽名（供 tdd-implementation 參考）

> **重要**：以下僅為方法簽名與語意說明，不含實作細節。tdd-implementation 自行實作 body。

### 8.1 `createPivotAggregation`

```typescript
/** 初始化空的 PivotAggregation 結構 */
private createPivotAggregation(): PivotAggregation;
```

### 8.2 `accumulatePivot`

```typescript
/**
 * 讀取 RawExportRow 三欄（emphire_dept_name / emplid / list_no），
 * 正規化分組鍵（null/空 → '(空白)'），更新 agg 各計數器。
 *
 * @param raw  cursor 串流中的原始列（僅讀取三欄，不修改）
 * @param agg  待累加的 PivotAggregation 狀態（in-place 更新）
 *
 * 正規化規則（I-PIV-SOURCE-01）：
 *   deptKey   = raw.emphire_dept_name ?? '' → falsy → '(空白)'
 *   emplidKey = raw.emplid ?? '' → falsy → '(空白)'
 *   listKey   = raw.list_no ?? '' → falsy → 跳過（不計入）
 */
private accumulatePivot(raw: RawExportRow, agg: PivotAggregation): void;
```

### 8.3 `writePivotSheet`

```typescript
/**
 * 將已完成的 PivotAggregation 寫入 WorkbookWriter 的第 2 個 worksheet。
 * 必須在 sheet 1（assignment_result）commit() 後、workbook.commit() 前呼叫。
 *
 * @param pivotSheet  workbook.addWorksheet('樞紐分析') 回傳的 WorksheetWriter
 * @param agg         accumulatePivot 完成後的聚合結果
 *
 * 寫入順序：
 *   1. R1（部門代號 / (全部)）
 *   2. R2（空列）
 *   3. R3（計數 - 案號 / 欄標籤）
 *   4. R4（列標籤 / sortedListNos / 總計）
 *   5. 各部門列 + 各員編列（numFmt='0.0%'，§3 演算法）
 *   6. 總計列（1.0 或 null）
 *   每列呼叫 row.commit()（WorkbookWriter streaming 要求）
 *
 * 確定性排序在本方法內執行（§6），不依賴 Map/Set 插入順序（I-PIV-DET-01）。
 */
private writePivotSheet(
  pivotSheet: ExcelJS.stream.xlsx.WorksheetWriter,
  agg: PivotAggregation,
): void;
```

---

## 9. Worked Example 驗算確認

以 F108 spec §6.1 合成資料集（2 部門、3 員編、2 名單）逐格驗算：

**聚合完成後：**

```
grandByList  = { L1: 10, L2: 10 }
grandTotal   = 20

deptByList   = { 北區電銷1: { L1: 8, L2: 2 }, 南區電銷: { L1: 2, L2: 8 } }
deptTotal    = { 北區電銷1: 10, 南區電銷: 10 }

cell         = { 北區電銷1: { E1: { L1: 6, L2: 2 }, E2: { L1: 2, L2: 0 } },
                 南區電銷:  { E3: { L1: 2, L2: 8 } } }
cellTotal    = { 北區電銷1: { E1: 8, E2: 2 }, 南區電銷: { E3: 10 } }
```

**輸出驗算（與 spec §6.2 逐格對比）：**

| 儲存格 | 公式 | 計算 | 期望值 | 比對 |
|--------|------|------|--------|------|
| 北區電銷1, L1 | `deptByList[北][L1] / grandByList[L1]` | 8/10 | 80.0% | ✓ |
| 北區電銷1, L2 | `deptByList[北][L2] / grandByList[L2]` | 2/10 | 20.0% | ✓ |
| 北區電銷1, 總計 | `deptTotal[北] / grandTotal` | 10/20 | 50.0% | ✓ |
| E1, L1 | `cell[北][E1][L1] / deptByList[北][L1]` | 6/8 | 75.0% | ✓ |
| E1, L2 | `cell[北][E1][L2] / deptByList[北][L2]` | 2/2 | 100.0% | ✓ |
| E1, 總計 | `cellTotal[北][E1] / deptTotal[北]` | 8/10 | 80.0% | ✓ |
| E2, L1 | `cell[北][E2][L1] / deptByList[北][L1]` | 2/8 | 25.0% | ✓ |
| E2, L2 | `cell[北][E2][L2] / deptByList[北][L2]` | 0/2 = 0 | 0.0% | ✓ |
| E2, 總計 | `cellTotal[北][E2] / deptTotal[北]` | 2/10 | 20.0% | ✓ |
| 南區電銷, L1 | `deptByList[南][L1] / grandByList[L1]` | 2/10 | 20.0% | ✓ |
| 南區電銷, L2 | `deptByList[南][L2] / grandByList[L2]` | 8/10 | 80.0% | ✓ |
| 南區電銷, 總計 | `deptTotal[南] / grandTotal` | 10/20 | 50.0% | ✓ |
| E3, L1 | `cell[南][E3][L1] / deptByList[南][L1]` | 2/2 | 100.0% | ✓ |
| E3, L2 | `cell[南][E3][L2] / deptByList[南][L2]` | 8/8 | 100.0% | ✓ |
| E3, 總計 | `cellTotal[南][E3] / deptTotal[南]` | 10/10 | 100.0% | ✓ |
| 總計, L1 | `grandByList[L1] / grandByList[L1]` | 10/10 | 100.0% | ✓ |
| 總計, L2 | `grandByList[L2] / grandByList[L2]` | 10/10 | 100.0% | ✓ |
| 總計, 總計 | `grandTotal / grandTotal` | 20/20 | 100.0% | ✓ |

**E2-L2（0.0% vs 空白的邊界確認）**：  
`cell[北][E2][L2] = 0`，`deptByList[北][L2] = 2 > 0` → `pctOrBlank(0, 2) = 0`（非 null）→ 輸出 `0.0%`（BR-F108-11 分子 0、分母 > 0 的情境）✓

---

## 10. 風險與邊界案例

### 10.1 emphire join-miss「(空白)」部門群組

**風險**：員工無 emphire 記錄（`emphire_dept_name = null`）導致樞紐出現「(空白)」部門群組，影響部門層加總。

**緩解**：
- `accumulatePivot` 將 `emphire_dept_name` 為 null / 空字串的列歸入 `'(空白)'` deptKey，視為正常部門群組（I-PIV-SOURCE-01 繼承 F064 BR-F064-06 join-miss 設計）。
- `'(空白)'` 部門排序在最後（`localeCompare` 比較前的特判，§6.2）。
- 如 spec §6.4 worked example 所示，「(空白)」出現時欄總計隨之重算，既有部門列百分比下降，加總仍 = 100%（正確）。
- **不中斷匯出**：join-miss 已由 F064 的 WARNING log 機制（`I-EXP-JOINMISS-01`）記錄，F108 不重複 log。

### 10.2 emplid 為空的「(空白)」員編列

**風險**：舊 snapshot 的 `ob_monthly_run_result.emplid` 可能為 NULL（F101 補值前的歷史資料）。

**緩解**：`accumulatePivot` 將 `emplid` 為 null / 空字串的列歸入 `'(空白)'` emplidKey，對應部門下的 `'(空白)'` 員編列（OQ-F108-04 裁定）。

### 10.3 浮點精度（0.0% 顯示）

**風險**：`numerator / denominator` 為 IEEE 754 double，可能產生 `0.24999...` 而非精確 `0.25`，測試斷言需容錯。

**緩解**：
- **儲存格值**：直接寫入 JS number 浮點數（不做 `Math.round`）；Excel `numFmt='0.0%'` 負責顯示捨入，`0.2499... × 100 = 24.99...` → 顯示 `25.0%`（可接受）。
- **測試斷言**：用 `Math.abs(actual - expected) < 1e-9`，不直接比較 `=== 0.25`。
- spec §4 AC-3：「容浮點誤差 < 0.001」——同部門同欄員編加總 ≈ 100%，以此容限驗證即可。

### 10.4 員編基數上界（記憶體）

**風險**：若某電銷部門人員異常多（例如 500+ 員工），`emplidsPerDept` 可能增大。

**緩解**：即使 500 員工 × 50 名單 × 10 部門 = 250,000 cell，仍為純數字 Map（~25 MB），遠低於明細串流記憶體（7.7 萬 × 23 欄字串）。不需設上界 guard，I-PIV-MEM-01 論據足夠。

### 10.5 WorkbookWriter 第 2 頁 add 時機

**風險**：若在 sheet 1 `commit()` 前呼叫 `addWorksheet('樞紐分析')`，exceljs streaming writer 可能交錯 XML，產生損毀的 xlsx。

**緩解**：§5.2 精確時序已明確規定「sheet 1 commit 後再 add sheet 2」，`writeAndFinish` 是單一 async 函式，不存在並行競爭。tdd-implementation 需嚴格遵守此順序。

**驗證點**：可於 PG spec 測試中以 exceljs `Workbook.xlsx.load(buffer)` 讀回 buffer，驗證 `workbook.worksheets.length === 2` 且 `workbook.worksheets[1].name === '樞紐分析'`（非損毀）。

---

## 11. Schema 影響評估

| 項目 | 動作 | 理由 |
|------|------|------|
| `ob_monthly_run_result` | **不變** | 聚合直接讀取已有 `emplid` / `list_no` / `dept_id` 欄位；emphire join 由 F064 `buildExportQuery` LEFT JOIN 提供 `emphire_dept_name`，不需額外欄 |
| Migration | **不需新增** | 純邏輯層變更（`buildExportXlsxStreaming` 內部），不改 DB schema |
| Index | **不需新增** | 無新 SQL 查詢；復用既有 `buildExportQuery` cursor（I-PIV-SOURCE-01）|

---

## 12. 不變式彙總（F108 新增）

| 不變式 ID | 內容 | 來源 |
|----------|------|------|
| **I-PIV-SHEET-01** | xlsx workbook 第 2 頁名稱為「樞紐分析」；CSV 格式不含此頁；頁籤 add/commit 順序：sheet 1 commit → sheet 2 add/write/commit → workbook.commit() | BR-F108-01 / BR-F108-07 |
| **I-PIV-PARENTROW-01** | 數值 = % of parent row（§3 公式）；格式 `numFmt='0.0%'`；0/0 → null（空白），0/正數 → 0（0.0%）| BR-F108-04 / BR-F108-11 |
| **I-PIV-SOURCE-01** | 聚合源 = 與明細同一 scoped `cursorRows(query)` 串流；`accumulatePivot` 在 `for await` 迴圈內同步累加；scope filter 自動繼承，樞紐不洩漏轄區外資料 | BR-F108-02 |
| **I-PIV-MEM-01** | 記憶體中只保留 `PivotAggregation` 計數結構（部門 × 員編 × 名單代號量級），不全載 7.7 萬筆明細列；匯出記憶體峰值不因明細列數線性增長 | BR-F108-05 |
| **I-PIV-DET-01** | 排序完全確定：listNo 字串升冪 / 部門 `localeCompare`（`'(空白)'` 最後）/ 員編字串升冪；不依賴 Map/Set 插入順序 | BR-F108-06 |

---

## 13. 修改既有檔案

| 檔案路徑 | 修改說明 |
|---------|---------|
| `apps/api/src/modules/assignment/services/assignment-run-report.service.ts` | **新增** `PivotAggregation` interface + `createPivotAggregation()` + `accumulatePivot()` + `writePivotSheet()`；**修改** `buildExportXlsxStreaming()`（在 `for await` 迴圈追加 `accumulatePivot` 呼叫；`sheet.commit()` 後追加 sheet 2 add/write/commit；`workbook.commit()` 前移至 sheet 2 commit 後）|
| `apps/api/src/modules/assignment/services/__tests__/f064-export-23col.spec.ts` | 擴充 F108 測試案例（TC-171-01~12）：mock `cursorRows` 餵入合成列 → 呼叫 `exportResult(runId,'xlsx')` → 以 exceljs `Workbook.xlsx.load(buffer)` 讀回 → 斷言第 2 頁存在、格子值、排序、格式 |

**不修改**：
- `buildExportCsvStreaming`（CSV 路徑，D-5）
- `buildExportQuery` / `cursorRows` / `formatRow`（F064 v2.1 已定，F108 直接消費）
- `getSummary()` / `compareRuns()` / `compareRunsExport()`（與匯出路徑無關）
- F108 不新增錯誤碼（沿用 F064 v2.1 錯誤碼集合）

---

## 14. 與既有 AD 的關係

- **直接延伸 AD-E07-v3.4（F064 v2.1）**：繼承 `buildExportXlsxStreaming` / `cursorRows` / `formatRow` / `RawExportRow` / `EXPORT_HEADER_V2` 設計；補充第 2 頁籤寫入機制，不修改既有邏輯。
- **繼承 AD-E07-v3.2（F101）/ AD-E07-v3.3（F102）**：`ob_monthly_run_result.emplid` 已由 F101/F102 填值，F108 聚合可讀取 `emplid`；舊 snapshot NULL 歸「(空白)」（A-4）。
- **不影響 AD-E07-v3.1（月跑 worker 抽離）**：匯出為獨立 GET 端點，不在 pg-boss job 內。
- **不影響 AD-E07-v3.6（F049 Stage 0）**：不同模組，互不干涉。

---

## 15. 測試策略點名（test-designer / tdd-implementation）

| 測試項目 | 不變式 / AC | 核心要求 |
|---------|------------|---------|
| **xlsx 第 2 頁存在（TC-171-01）** | I-PIV-SHEET-01 / AC-1 | `workbook.worksheets[0].name='assignment_result'`；`workbook.worksheets[1].name='樞紐分析'`；共 2 頁 |
| **標頭列（TC-171-02）** | AC-2 | R1 A1=`部門代號` B1=`(全部)`；R2 空；R3 A=`計數 - 案號` B=`欄標籤`；R4 A=`列標籤` 後接 listNo 升冪 + `總計` |
| **% of parent row 數值（TC-171-03）** | I-PIV-PARENTROW-01 / AC-3 | 對 worked example 合成資料逐格斷言（§9 表格全 18 格；允許誤差 < 1e-9）|
| **0/0 → 空白（TC-171-04）** | BR-F108-11 | 空結果（0 列）→ 總計列總計欄 = null；有資料但某部門在某欄 0 筆時員編列 = null |
| **0/正數 → 0.0%（TC-171-05）** | BR-F108-11 | E2-L2（0/2）→ 儲存格值 = 0，numFmt='0.0%'（不為 null）|
| **確定性排序（TC-171-06）** | I-PIV-DET-01 / AC-4 | listNo 升冪、部門 localeCompare 升冪、員編字串升冪；可逐列斷言行順序 |
| **`(空白)` 部門排最後（TC-171-07）** | I-PIV-DET-01 / OQ-F108-01 | 餵入 emphire_dept_name=null 的列 → `(空白)` 群組在 `南區電銷` 之後 |
| **emphire join-miss（TC-171-08）** | BR-F108-03 / AC-7 | `emphire_dept_name=null` → 歸 `'(空白)'` 部門；員編仍正常顯示 |
| **處長 scope（TC-171-09）** | I-PIV-SOURCE-01 / AC-5 | 以 `section_chief` actor → `buildExportQuery` 已注入 scope WHERE → mock `cursorRows` 只回傳轄區列 → 樞紐僅含轄區部門 |
| **CSV 不含樞紐（TC-171-10）** | I-PIV-SHEET-01 / AC-6 | `exportResult(runId,'csv')` → body 為字串，無法解析為含多 sheet 的 xlsx（或以欄位驗證無樞紐欄）|
| **空結果邊界（TC-171-11）** | BR-F108-09 / AC-8 | `cursorRows` 回傳 0 列 → xlsx 仍含 2 頁；第 2 頁含 R1~R4 + 總計列（總計欄空白）；回 200 OK |
| **明細頁不受影響（TC-171-12）** | BR-F108-07 | `worksheets[0]` 的 rowCount / 欄序與 F064 v2.1 原本測試結果相同；F108 修改不破壞既有 TC-155-* |
| **tsc --noEmit 乾淨** | — | `tsc --noEmit -p tsconfig.build.json` 無型別錯誤（feedback_vitest_no_typecheck 教訓）|

---

*本文件由 System Architect Agent 於 2026-06-29 依據 F108 spec（US-171）、ground-truth brief（F108-ground-truth.md）、現行 `assignment-run-report.service.ts`（AD-E07-v3.4 落地後狀態）撰寫。*
