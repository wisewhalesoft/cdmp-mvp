# US-052：節點欄位變化統計 Badge

> **Story ID**：US-052
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（ETL 設計者）
**I want** 在 Pipeline 編輯器畫布上的每個節點底部，看到一行簡短的欄位變化統計
**So that** 我能在不點開屬性面板的情況下，一眼辨識每個節點對欄位做了什麼變化，加快 Pipeline 的設計與審查速度

---

## 背景說明

前端已實作 `computeNodeOutputColumns()` 函式，可遞迴計算任意節點的輸出欄位列表。本 Story 在此基礎上，為各節點類型計算「輸入欄位數」、「輸出欄位數」與「差異數」，並以輕量 Badge 形式常駐於節點底部。

---

## 驗收標準

### AC-1：raw_data_extract 節點 Badge

- **Given** Admin 進入 Pipeline 編輯器，畫布上有一個已設定資料來源的 `raw_data_extract` 節點（例如該 raw table 有 12 個欄位）
- **When** 頁面渲染完成
- **Then** 節點底部顯示灰色 Badge，內容為 `→ 12 欄位`

### AC-2：merge 節點 Badge

- **Given** 畫布上有一個 `merge` 節點，左側輸入為 12 欄、右側輸入為 8 欄，合併後輸出 18 欄（有 2 欄重名合併）
- **When** 頁面渲染完成
- **Then** 節點底部顯示橘色 Badge，內容為 `左 12 + 右 8 → 18`

### AC-3：derived_field 節點 Badge

- **Given** 畫布上有一個 `derived_field` 節點，設定了 3 條衍生欄位規則
- **When** 頁面渲染完成
- **Then** 節點底部顯示綠色 Badge，內容為 `+3 衍生欄位`

### AC-4：field_mapping 節點 Badge（dropUnmapped=true）

- **Given** 畫布上有一個 `field_mapping` 節點，輸入 18 欄，映射規則定義了 10 組對應，且 `dropUnmapped=true`
- **When** 頁面渲染完成
- **Then** 節點底部顯示紅色 Badge，內容為 `18 → 10（-8）`

### AC-5：type_cast 節點 Badge

- **Given** 畫布上有一個 `type_cast` 節點，設定了 4 條型別轉換規則
- **When** 頁面渲染完成
- **Then** 節點底部顯示灰色 Badge，內容為 `4 型別轉換`

### AC-6：conditional 節點 Badge

- **Given** 畫布上有一個 `conditional` 節點，設定了 2 條條件規則
- **When** 頁面渲染完成
- **Then** 節點底部顯示橘色 Badge，內容為 `2 條件規則`

### AC-7：target_load 節點 Badge

- **Given** 畫布上有一個 `target_load` 節點，目標表設定了 54 個欄位，但僅映射了 20 個
- **When** 頁面渲染完成
- **Then** 節點底部顯示灰色 Badge，內容為 `載入 20 欄位`

### AC-8：透傳型節點（dedup、type_cast、filter 等）Badge

- **Given** 畫布上有一個 `dedup` 節點，輸入 18 欄，輸出同樣為 18 欄（不增不減）
- **When** 頁面渲染完成
- **Then** 節點底部顯示灰色 Badge，內容為 `→ 18`，或視覺上明顯較其他 Badge 暗淡

### AC-9：節點尚未完成設定時不顯示 Badge

- **Given** 畫布上有一個 `raw_data_extract` 節點，但尚未選擇資料來源（或上游節點尚未設定）
- **When** 頁面渲染完成
- **Then** 該節點底部不顯示 Badge（不顯示 `→ 0 欄位` 或任何預設值）

### AC-10：Badge 語義色彩規範

- **Given** 畫布上有各種類型的節點
- **When** 頁面渲染完成
- **Then** 各 Badge 顏色符合以下規範：
  - 綠色：欄位純增加（`derived_field`）
  - 紅色：欄位純減少（`field_mapping` with `dropUnmapped=true`）
  - 橘色：合併或條件轉換（`merge`、`conditional`）
  - 灰色：保留 / 透傳（`dedup`、`type_cast`、`raw_data_extract`、`target_load`）

### AC-11：Badge 不干擾節點點擊與連線操作

- **Given** 節點底部有 Badge 顯示
- **When** Admin 點擊該節點（開啟屬性面板）或拖拉節點
- **Then** Badge 區域不干擾點擊事件；點擊 Badge 區域等同於點擊節點本體，照常開啟屬性面板

---

## 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | Badge 依賴 `computeNodeOutputColumns()` 的計算結果，若函式回傳 `null` 或空陣列（代表節點未完整設定），則不顯示 Badge |
| BR-2 | Badge 為唯讀展示元素，不提供任何可點擊的導航行為（點擊後行為與節點本體相同） |
| BR-3 | Badge 顯示的欄位數為即時計算值，當使用者修改節點設定並儲存後，Badge 需即時更新 |
| BR-4 | 各節點類型的 Badge 格式固定，不可由使用者自訂 |

---

## 各節點類型 Badge 格式對照表

| 節點類型 | Badge 格式 | 顏色 | 數值來源 |
|----------|-----------|------|---------|
| `raw_data_extract` | `→ N 欄位` | 灰色 | N = raw table 欄位數 |
| `merge` | `左 N + 右 M → K` | 橘色 | N = 左輸入欄位數，M = 右輸入欄位數，K = 合併後輸出欄位數 |
| `derived_field` | `+N 衍生欄位` | 綠色 | N = expressions 陣列長度 |
| `field_mapping`（dropUnmapped=true） | `N → M（-K）` | 紅色 | N = 輸入欄位數，M = 映射輸出欄位數，K = N - M |
| `field_mapping`（dropUnmapped=false） | `→ N 欄位` | 灰色 | N = 輸出欄位數 |
| `type_cast` | `N 型別轉換` | 灰色 | N = 型別轉換規則數 |
| `conditional` | `N 條件規則` | 橘色 | N = 條件規則數 |
| `target_load` | `載入 N 欄位` | 灰色 | N = 已映射的欄位數 |
| `dedup`（透傳型） | `→ N` | 灰色（暗淡） | N = 輸入欄位數（透傳） |
| `filter`（透傳型） | `→ N` | 灰色（暗淡） | N = 輸入欄位數（透傳） |
| `null_handler`（透傳型） | `→ N` | 灰色（暗淡） | N = 輸入欄位數（透傳） |

---

## Technical Notes

- Badge 元件為純前端計算，無需呼叫後端 API
- 依賴前端已存在的 `computeNodeOutputColumns(nodeId, nodes, edges)` 函式
- Badge 應在 React Flow 節點元件的 render 邏輯中，於節點 label 區塊下方增加一個獨立的 `<div>` 區塊
- Badge 的計算時機：節點初始渲染時、及任何 `nodes` 或 `edges` state 發生變更時（透過 React 的 useMemo 或 useCallback 避免不必要的重算）
- 透傳型節點（`dedup`、`filter`、`null_handler`、`type_cast`、`string`、`masking`、`lookup`、`aggregate`）的輸出欄位數即為輸入欄位數

---

## 測試案例

### TC-052-01：raw_data_extract 節點選定資料來源後顯示 Badge

- **Given** 新增 `raw_data_extract` 節點並選擇一個有 10 個欄位的 raw table
- **When** 儲存設定後
- **Then** Badge 顯示 `→ 10 欄位`（灰色）

### TC-052-02：未設定的節點不顯示 Badge

- **Given** 新增 `raw_data_extract` 節點但未選擇資料來源
- **When** 節點出現在畫布上
- **Then** 節點底部無 Badge 顯示

### TC-052-03：merge 節點計算正確

- **Given** merge 節點，左側連接 10 欄節點，右側連接 8 欄節點，合併後輸出 15 欄
- **When** 節點渲染完成
- **Then** Badge 顯示 `左 10 + 右 8 → 15`（橘色）

### TC-052-04：field_mapping dropUnmapped=true 顯示減少欄位

- **Given** field_mapping 節點，輸入 20 欄，`dropUnmapped=true`，僅映射 12 欄
- **When** 節點渲染完成
- **Then** Badge 顯示 `20 → 12（-8）`（紅色）

### TC-052-05：修改節點設定後 Badge 即時更新

- **Given** derived_field 節點顯示 `+2 衍生欄位`
- **When** Admin 在屬性面板新增第 3 條衍生欄位規則並儲存
- **Then** Badge 即時更新為 `+3 衍生欄位`

### TC-052-06：點擊 Badge 區域可正常開啟屬性面板

- **Given** 畫布上有一個帶有 Badge 的節點
- **When** Admin 點擊 Badge 文字區域
- **Then** 右側屬性面板正常開啟，不發生任何錯誤

---

## 依賴關係

- **Blocked By**：US-042（視覺化轉換編輯器，`computeNodeOutputColumns()` 需在此基礎上存在）
- **Blocks**：US-053（節點 Inspector Panel 欄位 Diff）、US-054（Badge Hover Tooltip）

---

## Definition of Done

- [ ] 所有節點類型的 Badge 顯示邏輯實作完成（參照格式對照表）
- [ ] Badge 語義色彩規範正確套用
- [ ] 節點未完整設定時不顯示 Badge（無 `→ 0` 殘影）
- [ ] Badge 即時更新（節點設定變更後無需重新整理頁面）
- [ ] Badge 點擊行為與節點本體一致
- [ ] 單元測試覆蓋各節點類型的 Badge 計算邏輯（覆蓋率 >80%）
- [ ] 程式碼審查通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **相關 Stories**：
  - [US-042 視覺化轉換編輯器](US-042-pipeline-editor.md)（前置依賴）
  - [US-053 節點 Inspector Panel 欄位 Diff](US-053-node-inspector-panel-diff.md)（P1 延伸功能）
  - [US-054 Badge Hover Tooltip](US-054-node-badge-hover-tooltip.md)（P2 延伸功能）
- **NFR**：[NFR-002 效能](../../non-functional/NFR-002-performance.md)
