# US-054：節點 Badge Hover Tooltip

> **Story ID**：US-054
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Could Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（ETL 設計者）
**I want** 將滑鼠懸停在節點底部的欄位變化 Badge 上時，看到一個詳細的 Tooltip 彈窗
**So that** 我能在不點開屬性面板的情況下，快速預覽欄位列表與轉換摘要，加快 Pipeline 審查流程

---

## 背景說明

US-052 提供的 Badge 僅顯示統計數字（如 `左 12 + 右 8 → 18`）。本 Story 在 Badge Hover 時展示完整欄位列表或差異摘要，作為「點擊節點開啟 Inspector Panel（US-053）」前的快速預覽層。

---

## 驗收標準

### AC-1：Hover Badge 後延遲顯示 Tooltip

- **Given** 畫布上有一個帶有 Badge 的節點
- **When** Admin 將滑鼠懸停在 Badge 文字上超過 300ms
- **Then** 顯示一個 320px 寬的 Tooltip 彈窗，內容為該節點類型對應的欄位摘要

### AC-2：離開 Badge 後 Tooltip 消失

- **Given** Tooltip 正在顯示
- **When** Admin 將滑鼠移離 Badge 區域（且不移入 Tooltip 本身）
- **Then** Tooltip 在 150ms 延遲後消失

### AC-3：Tooltip 內容可互動（滾動與選取）

- **Given** Tooltip 已顯示
- **When** Admin 將滑鼠從 Badge 移入 Tooltip 內部
- **Then** Tooltip 保持顯示不消失；Admin 可在 Tooltip 內捲動內容，並可選取文字

### AC-4：按 Esc 鍵關閉 Tooltip

- **Given** Tooltip 正在顯示
- **When** Admin 按下 Esc 鍵
- **Then** Tooltip 立即關閉

### AC-5：同時最多顯示 1 個 Tooltip

- **Given** 已有一個 Tooltip 顯示中
- **When** Admin 將滑鼠移至另一個節點的 Badge
- **Then** 前一個 Tooltip 立即關閉，新的 Tooltip 於 300ms 後顯示

### AC-6：Tooltip 定位 — 預設顯示於 Badge 下方

- **Given** Tooltip 觸發，且畫布下方有足夠空間（Badge 距視窗底部 > 320px）
- **When** Tooltip 顯示
- **Then** Tooltip 出現在 Badge 正下方，與 Badge 有 8px 間距

### AC-7：Tooltip 碰觸視窗邊界時翻轉

- **Given** Badge 距視窗底部 < 320px（空間不足以顯示 Tooltip）
- **When** Tooltip 觸發
- **Then** Tooltip 翻轉至 Badge 上方顯示，同樣保持 8px 間距

### AC-8：raw_data_extract 節點 Tooltip 內容

- **Given** `raw_data_extract` 節點，輸出 12 個欄位
- **When** Hover Badge 超過 300ms
- **Then** Tooltip 顯示：
  - 標題：「輸出欄位（12）」
  - 列表：欄位名稱列表（最多 8 筆，超過則截斷並顯示「⋯ 還有 N 個欄位，點擊節點查看完整」）

### AC-9：merge 節點 Tooltip 內容

- **Given** `merge` 節點，左輸入 12 欄、右輸入 8 欄、輸出 18 欄
- **When** Hover Badge 超過 300ms
- **Then** Tooltip 顯示：
  - 標題：「合併摘要」
  - 左輸入列表（最多 8 筆，含截斷提示）
  - 右輸入列表（最多 8 筆，含截斷提示）
  - 輸出欄位數：`→ 18 欄位`

### AC-10：field_mapping 節點 Tooltip 內容（dropUnmapped=true）

- **Given** `field_mapping` 節點，輸入 18 欄，輸出 10 欄，移除 8 欄
- **When** Hover Badge 超過 300ms
- **Then** Tooltip 顯示：
  - 標題：「欄位映射摘要」
  - 「已映射（10）」列表：以 `來源欄位 → 目標欄位` 格式列出（最多 8 筆，含截斷提示）
  - 「已移除（8）」列表：以紅色標記列出被丟棄的欄位（最多 4 筆，含截斷提示）

### AC-11：derived_field 節點 Tooltip 內容

- **Given** `derived_field` 節點，設定 3 條衍生欄位規則
- **When** Hover Badge 超過 300ms
- **Then** Tooltip 顯示：
  - 標題：「衍生欄位（3）」
  - 列表：每條規則以 `欄位名稱：運算式` 格式列出（最多 8 筆，含截斷提示）

### AC-12：透傳型節點 Tooltip 內容（dedup、type_cast 等）

- **Given** `dedup` 節點，輸入/輸出皆為 15 欄
- **When** Hover Badge 超過 300ms
- **Then** Tooltip 顯示：
  - 標題：「輸出欄位（15）— 透傳」
  - 欄位列表（最多 8 筆，含截斷提示）
  - 說明文字：「此節點不增減欄位」

### AC-13：欄位列表截斷提示可引導用戶點擊節點

- **Given** Tooltip 中的欄位列表被截斷（超過上限）
- **When** Tooltip 顯示截斷提示文字
- **Then** 截斷提示文字為「點擊節點查看完整」，且該文字不需要是可點擊的連結（純提示文字）

### AC-14：Tooltip 採用 position fixed 定位

- **Given** Pipeline 畫布有水平或垂直捲動
- **When** Tooltip 顯示後 Admin 捲動畫布
- **Then** Tooltip 跟隨對應的 Badge 位置移動（不固定在視窗某角落），或在畫布捲動時自動關閉

---

## 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | Tooltip 的資料來源與 US-052 Badge 及 US-053 Inspector Panel 相同，均使用 `computeNodeOutputColumns()` |
| BR-2 | 欄位列表最多顯示 8 筆，差異列表（如映射規則、移除欄位）最多顯示 4 筆 |
| BR-3 | Tooltip 為唯讀展示，不提供任何可編輯功能 |
| BR-4 | Tooltip hover 延遲為 300ms（進入），消失延遲為 150ms（離開），不可由使用者調整 |
| BR-5 | 同一時間最多顯示 1 個 Tooltip |

---

## 各節點類型 Tooltip 內容規格

| 節點類型 | Tooltip 標題 | 列表內容 | 截斷上限 |
|----------|------------|---------|---------|
| `raw_data_extract` | 輸出欄位（N） | 欄位名稱列表 | 8 筆 |
| `merge` | 合併摘要 | 左輸入列表 + 右輸入列表 + 輸出欄位數 | 各 8 筆 |
| `derived_field` | 衍生欄位（N） | `欄位名稱：運算式` 列表 | 8 筆 |
| `field_mapping`（dropUnmapped=true） | 欄位映射摘要 | 映射規則列表 + 移除欄位列表（紅色） | 映射 8 筆、移除 4 筆 |
| `field_mapping`（dropUnmapped=false） | 欄位映射摘要 | 映射規則列表 | 8 筆 |
| `type_cast` | 型別轉換（N） | `欄位名稱：原型別 → 目標型別` 列表 | 8 筆 |
| `conditional` | 條件規則（N） | 條件規則名稱或摘要列表 | 8 筆 |
| `target_load` | 載入欄位（N） | `來源欄位 → 目標欄位` 映射列表 | 8 筆 |
| 透傳型（`dedup`、`filter` 等） | 輸出欄位（N）— 透傳 | 欄位名稱列表 + 「此節點不增減欄位」說明 | 8 筆 |

---

## Technical Notes

- Tooltip 元件建議使用 Floating UI（或同等定位函式庫）處理自動翻轉（flip）與溢出（overflow）邊界偵測
- Tooltip 以 `position: fixed` 渲染於 `document.body`（Portal），避免被 React Flow 畫布的 `overflow: hidden` 裁切
- 畫布捲動時 Tooltip 應立即關閉（監聽 React Flow 的 `onMoveStart` 事件）
- Hover 延遲管理建議使用 `useRef` 搭配 `setTimeout`/`clearTimeout`，而非 CSS `transition-delay`（CSS 方案難以實現「移入 Tooltip 後保持顯示」邏輯）
- Tooltip 顯示時設定 `aria-label` 或 `role="tooltip"` 以符合無障礙規範

---

## 測試案例

### TC-054-01：Hover 300ms 後 Tooltip 出現

- **Given** 畫布上有帶 Badge 的 derived_field 節點
- **When** Admin 將滑鼠懸停在 Badge 上 300ms
- **Then** Tooltip 出現，顯示衍生欄位列表

### TC-054-02：Hover 不足 300ms 不顯示 Tooltip

- **Given** 畫布上有帶 Badge 的節點
- **When** Admin 將滑鼠懸停在 Badge 上 200ms 後離開
- **Then** Tooltip 不出現

### TC-054-03：移入 Tooltip 內部後保持顯示

- **Given** Tooltip 正在顯示
- **When** Admin 將滑鼠從 Badge 移入 Tooltip 內部
- **Then** Tooltip 持續顯示，不消失

### TC-054-04：Esc 鍵關閉 Tooltip

- **Given** Tooltip 正在顯示
- **When** Admin 按下 Esc 鍵
- **Then** Tooltip 立即關閉

### TC-054-05：欄位超過 8 筆時顯示截斷提示

- **Given** raw_data_extract 節點，輸出 15 個欄位
- **When** Hover Tooltip 顯示
- **Then** 列表只顯示前 8 個欄位，底部顯示「⋯ 還有 7 個欄位，點擊節點查看完整」

### TC-054-06：同時只顯示 1 個 Tooltip

- **Given** 節點 A 的 Tooltip 正在顯示
- **When** Admin 將滑鼠移至節點 B 的 Badge
- **Then** 節點 A 的 Tooltip 立即關閉，節點 B 的 Tooltip 於 300ms 後顯示

### TC-054-07：邊界翻轉 — 下方空間不足時 Tooltip 翻至上方

- **Given** 節點位於畫布底部，Badge 距視窗底部空間不足
- **When** Hover Tooltip 觸發
- **Then** Tooltip 出現在 Badge 上方，而非下方

### TC-054-08：畫布捲動時 Tooltip 關閉

- **Given** Tooltip 正在顯示
- **When** Admin 拖動畫布進行捲動
- **Then** Tooltip 立即關閉

---

## 依賴關係

- **Blocked By**：
  - US-052（節點欄位變化統計 Badge，Tooltip 依附於 Badge 之上）
  - US-053（節點 Inspector Panel 欄位 Diff，共用資料計算邏輯，且 Tooltip 引導用戶前往 Inspector Panel）
- **Blocks**：無

---

## Definition of Done

- [ ] Hover 300ms 後 Tooltip 出現，150ms 延遲後消失
- [ ] 移入 Tooltip 內部後保持顯示（可滾動、可選取文字）
- [ ] Esc 鍵可關閉 Tooltip
- [ ] 同時最多顯示 1 個 Tooltip
- [ ] 預設顯示於 Badge 下方，空間不足時翻轉至上方
- [ ] 欄位列表截斷上限（8 筆一般列表、4 筆差異列表）與截斷提示文字正確顯示
- [ ] 各節點類型 Tooltip 內容符合規格表
- [ ] Tooltip 以 Portal（position: fixed）渲染，不被畫布裁切
- [ ] 畫布捲動時 Tooltip 自動關閉
- [ ] 單元測試覆蓋 Hover 延遲邏輯與截斷邏輯（覆蓋率 >80%）
- [ ] 程式碼審查通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **相關 Stories**：
  - [US-052 節點欄位變化統計 Badge](US-052-node-column-change-badge.md)（前置依賴，Badge 是 Tooltip 的觸發元素）
  - [US-053 節點 Inspector Panel 欄位 Diff](US-053-node-inspector-panel-diff.md)（完整欄位檢視的入口）
- **NFR**：[NFR-002 效能](../../non-functional/NFR-002-performance.md)
