# US-055：ETL 執行引擎核心框架

> **Story ID**：US-055
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** Admin（管理者）
**I want** Pipeline 執行時真正跑完每個節點的 ETL 邏輯，而非模擬標記
**So that** 資料能從 5 個 raw table 經過轉換後確實寫入 customer_core，不再只是假完成

---

## 背景與現況

`etl-pipeline-execution.service.ts` 中的 `executePipeline()` 目前是模擬實作：逐節點將 status 標記為 `completed`，但未執行任何真正的 ETL 邏輯。

本 Story 定義執行引擎的**核心框架**：圖遍歷（拓撲排序）、節點分派機制（Node Dispatcher）、節點間資料傳遞、進度回寫、錯誤邊界。各節點的具體業務邏輯分散在 US-056、US-057 中定義。

---

## 驗收標準

### AC-1：拓撲排序決定節點執行順序

- **Given** Pipeline 定義含有 `nodes` 陣列與 `edges` 陣列
- **When** 引擎開始執行
- **Then** 根據 edges 進行拓撲排序（Kahn's algorithm），得出每個節點的執行順序，確保上游節點先於下游節點執行
- **And** 若 edges 中存在循環依賴（cycle），引擎拋出錯誤並將 Pipeline 標記為 `failed`，不執行任何節點

### AC-2：節點資料透過記憶體 Map 傳遞

- **Given** 節點 A 執行完成，輸出資料集 DataSet_A
- **When** 節點 B（A 的下游）開始執行
- **Then** 引擎透過以 `nodeId` 為 key 的記憶體 Map（`nodeOutputMap`）將 DataSet_A 傳入 B，B 可存取完整的上游輸出
- **And** 節點完成後，不再被後續節點使用的上游資料可從 Map 中移除以釋放記憶體

### AC-3：節點執行前取得正確的輸入資料

- **Given** 一個 merge 節點有 `left-input` 與 `right-input` 兩個上游
- **When** merge 節點被分派執行
- **Then** 引擎根據 edge 的 `targetHandle` 屬性（`left-input` / `right-input`）分別從 `nodeOutputMap` 取得兩路輸入，以具名方式傳入節點處理器
- **And** 其他非 merge 節點（單一輸入）直接取 edge 對應的單一上游輸出

### AC-4：節點執行狀態即時回寫

- **Given** 節點 N 開始執行
- **When** 節點進入 running 狀態
- **Then** 立即將 `EtlPipelineLog.node_logs[N].status` 更新為 `'running'`，並儲存至資料庫
- **And** 節點完成後，更新 status 為 `'completed'`，記錄 `durationMs`、`inputRowCount`、`outputRowCount`
- **And** 節點失敗後，更新 status 為 `'failed'`，記錄 `errorMessage`

### AC-5：節點失敗立即中止整個 Pipeline

- **Given** 節點 N 執行時拋出例外
- **When** 引擎捕獲例外
- **Then** 停止執行後續所有節點，將所有尚未執行的節點 status 標記為 `'skipped'`
- **And** 將 `EtlPipelineLog.status` 設為 `'failed'`，填寫 `error_message`（含節點 ID 與錯誤訊息）
- **And** 將 `EtlPipeline.status` 設為 `'failed'`

### AC-6：節點分派機制（Node Dispatcher）

- **Given** 引擎逐一處理拓撲排序後的節點
- **When** 取出節點的 `data.nodeType`
- **Then** 根據 `nodeType` 分派到對應的節點處理器（Handler），支援下列類型：
  - `raw_data_extract`
  - `merge`
  - `dedup`
  - `derived_field`
  - `field_mapping`
  - `type_cast`
  - `conditional`
  - `target_load`
- **And** 若 `nodeType` 不在上述清單中，標記該節點為 `'failed'`，錯誤訊息為「未知的節點類型：{nodeType}」

### AC-7：測試執行（is_test_run = true）不寫入目標表

- **Given** Pipeline 以 `is_test_run = true` 觸發
- **When** 引擎執行到 `target_load` 節點
- **Then** 跳過實際寫入目標表的動作，節點仍標記為 `'completed'`，記錄預計寫入的筆數（`outputRowCount`）作為驗證資訊

---

## 技術備註

### 節點輸出資料格式（DataSet）

```typescript
interface DataSet {
  rows: Record<string, unknown>[];  // 記憶體內資料列陣列
  rowCount: number;
}
```

每個節點的輸入與輸出皆為 `DataSet`。

### nodeOutputMap 結構

```typescript
const nodeOutputMap = new Map<string, DataSet>();
// key: nodeId (e.g., "e1", "m1", "d1")
// value: DataSet（上游節點的輸出）
```

### node_logs 結構（每個節點的記錄項目）

```json
{
  "nodeId": "m1",
  "nodeType": "merge",
  "nodeName": "ZZIP合併",
  "status": "completed",
  "durationMs": 1234,
  "inputRowCount": 2150000,
  "outputRowCount": 2155000,
  "errorMessage": null
}
```

### 目前模擬實作位置

`apps/api/src/modules/etl/etl-pipeline-execution.service.ts`
— 方法：`executePipeline()`（第 229 行）
— 目前邏輯：迴圈逐節點 sleep → 標記 completed，需替換為真實 ETL 邏輯

---

## 測試案例

### TC-055-01：拓撲排序正確性

- **Given**：seed-pipeline-definition.json 中的 19 個節點與 18 條 edges
- **When**：執行拓撲排序
- **Then**：e1, e2 先於 m1；m1 先於 d1；d1 先於 df1；df1 先於 fm1；fm1、fm2 先於 m4；m4 先於 cd1；cd1 先於 df3；df3 先於 tl1

### TC-055-02：循環依賴偵測

- **Given**：edges 中存在 A→B→C→A 的循環
- **When**：開始執行
- **Then**：Pipeline 立即標記為 `failed`，error_message 包含「循環依賴」字樣，無任何節點執行

### TC-055-03：節點失敗中止後續節點

- **Given**：節點 m1 被設定為拋出錯誤
- **When**：m1 執行失敗
- **Then**：d1、df1、fm1 等所有下游節點 status 為 `'skipped'`；Pipeline 整體 status 為 `failed`

### TC-055-04：測試執行不寫入目標表

- **Given**：is_test_run = true
- **When**：執行到 tl1（target_load）節點
- **Then**：customer_core 表資料筆數不變；tl1 節點 status 為 `'completed'`，outputRowCount 記錄預計寫入筆數

### TC-055-05：node_logs 即時更新

- **Given**：Pipeline 正在執行
- **When**：呼叫 GET /api/v1/etl/pipelines/:id/progress
- **Then**：回傳的 `currentNode` 為目前 running 狀態的節點 ID

---

## 依賴關係

- **Blocked By**：US-043（執行觸發機制已完成，本 Story 替換其模擬邏輯）
- **Blocks**：US-056（節點業務邏輯需要本 Story 的框架）、US-057（同上）、US-058（批次策略需要本框架的資料流）

---

## Definition of Done

- [ ] 拓撲排序演算法實作完成（Kahn's algorithm）
- [ ] Node Dispatcher 分派機制實作完成
- [ ] nodeOutputMap 記憶體傳遞機制實作完成
- [ ] node_logs 狀態欄位（running / completed / failed / skipped）即時更新至資料庫
- [ ] 測試執行跳過 target_load 寫入邏輯正確
- [ ] 循環依賴偵測正確
- [ ] 單元測試覆蓋率 ≥ 80%（拓撲排序、Dispatcher 分派）
- [ ] 整合測試：完整執行 seed-pipeline-definition.json 不拋出未捕獲例外

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **目前模擬實作**：`apps/api/src/modules/etl/etl-pipeline-execution.service.ts`
- **Pipeline 定義**：`scripts/seed-pipeline-definition.json`
- **相關 Stories**：US-056（Extract/Merge/Dedup/TypeCast/DerivedField 節點）、US-057（FieldMapping/Conditional/TargetLoad 節點）、US-058（批次處理策略）
