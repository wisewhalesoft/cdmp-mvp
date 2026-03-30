---
spec-id: F042
title: ETL 執行引擎核心框架
feature-id: F042
source-story: US-055
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-27
status: Draft
---

# F042: ETL 執行引擎核心框架

Priority: P0-MVP | Status: Draft | Last Updated: 2026-03-27

## 1. 功能摘要

ETL 執行引擎核心框架負責將 Pipeline 定義中的 DAG（有向無環圖）轉換為可執行的節點序列。引擎以拓撲排序決定執行順序，透過 Node Dispatcher 分派各節點至對應的處理器，並以記憶體內的 `nodeOutputMap` 在節點之間傳遞資料集（DataSet）。引擎同時負責節點狀態即時回寫、錯誤中止、測試執行模式等橫切關注點。

本規格定義引擎框架與核心介面；各節點的具體業務邏輯定義於 [F043](F043-etl-node-executors.md) 與 [F044](F044-etl-target-load.md)。

## 2. 前置條件

- Pipeline 已建立且有至少一個版本定義（nodes + edges）
- Pipeline status 非 `running`
- F030（執行觸發機制）已完成，提供 `triggerExecute` / `triggerTest` / `triggerSchedule` 入口

## 3. TypeScript 核心介面

### 3.1 DataSet — 節點間資料傳遞格式

```typescript
interface DataSet {
  rows: Record<string, unknown>[];
  rowCount: number;
}
```

所有節點的輸入與輸出皆為 `DataSet`。`rowCount` 必須等於 `rows.length`。

### 3.2 NodeExecutionContext — 節點執行上下文

```typescript
interface NodeExecutionContext {
  /** 節點定義（來自 Pipeline definition JSON） */
  node: PipelineNode;

  /** 節點輸入資料，key 為 edge 的 targetHandle 或 'default' */
  inputs: Record<string, DataSet>;

  /** 當前 Pipeline 的 ID */
  pipelineId: string;

  /** 當前執行 Log 的 ID */
  logId: string;

  /** 是否為測試執行 */
  isTestRun: boolean;

  /** TypeORM QueryRunner（供需要資料庫操作的節點使用） */
  queryRunner: QueryRunner;
}
```

### 3.3 NodeExecutor — 節點處理器介面

```typescript
interface NodeExecutor {
  /** 支援的節點類型 */
  readonly nodeType: string;

  /** 執行節點邏輯，回傳輸出 DataSet */
  execute(context: NodeExecutionContext): Promise<DataSet>;
}
```

### 3.4 PipelineNode — Pipeline 定義中的節點結構

```typescript
interface PipelineNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    nodeType: string;
    label: string;
    subtitle?: string;
    [key: string]: unknown;
  };
}
```

### 3.5 PipelineEdge — Pipeline 定義中的連線結構

```typescript
interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  targetHandle?: string;  // 'left-input' | 'right-input' | undefined
}
```

### 3.6 NodeLogEntry — 節點執行記錄

```typescript
interface NodeLogEntry {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  durationMs: number;
  inputRowCount?: number;
  outputRowCount?: number;
  errorMessage?: string | null;
}
```

## 4. 主要流程

### 4.1 拓撲排序（Kahn's Algorithm）

1. 從 Pipeline 定義中取出 `nodes` 與 `edges`
2. 建立鄰接表（adjacency list）與入度表（in-degree map）
3. 將所有入度為 0 的節點放入佇列
4. 逐一取出佇列中的節點，加入排序結果，並將其下游節點的入度減 1
5. 若下游節點入度歸 0，加入佇列
6. 排序完成後，若排序結果長度不等於節點總數，表示存在循環依賴

### 4.2 Pipeline 執行主流程

1. 取得最新版本的 Pipeline 定義（nodes + edges）
2. 執行拓撲排序，取得節點執行順序
3. 若偵測到循環依賴，立即將 Pipeline 標記為 `failed`，結束執行
4. 初始化 `nodeOutputMap: Map<string, DataSet>`
5. 初始化 `nodeLogs: NodeLogEntry[]`，所有節點 status 為 `'pending'`
6. 依拓撲順序逐一執行節點：
   a. 更新節點 status 為 `'running'`，回寫資料庫
   b. 根據 edges 從 `nodeOutputMap` 收集該節點的輸入資料
   c. 組裝 `NodeExecutionContext`
   d. 透過 Node Dispatcher 取得對應的 `NodeExecutor`
   e. 呼叫 `executor.execute(context)` 取得輸出 DataSet
   f. 將輸出存入 `nodeOutputMap[nodeId]`
   g. 更新節點 status 為 `'completed'`，記錄 `durationMs`、`inputRowCount`、`outputRowCount`
   h. 回寫資料庫
7. 所有節點完成後，更新 `EtlPipelineLog.status = 'completed'`
8. 清理 `nodeOutputMap`

### 4.3 節點輸入收集邏輯

```
對於目標節點 N：
  找出所有 target === N.id 的 edges
  對於每條 edge：
    handleKey = edge.targetHandle ?? 'default'
    inputs[handleKey] = nodeOutputMap.get(edge.source)
```

- 若節點只有一個上游（無 targetHandle），`inputs` 結構為 `{ default: DataSet }`
- 若節點有多個上游（如 merge 節點），`inputs` 結構為 `{ 'left-input': DataSet, 'right-input': DataSet }`

### 4.4 記憶體回收

節點完成後，檢查其輸出是否仍被後續未執行的節點所需。若所有下游節點均已完成，從 `nodeOutputMap` 中移除該節點的輸出以釋放記憶體。

## 5. 替代流程

### 5.1 循環依賴偵測

- 拓撲排序後，若排序結果長度 < 節點總數
- Pipeline 立即標記為 `failed`
- `error_message` 包含「循環依賴」字樣
- 不執行任何節點，所有節點 status 維持 `'pending'`

### 5.2 未知節點類型

- Node Dispatcher 無法找到對應的 `NodeExecutor`
- 該節點標記為 `'failed'`，`errorMessage` 為「未知的節點類型：{nodeType}」
- 觸發 Pipeline 中止流程（見 5.3）

### 5.3 節點執行失敗

- 任何節點拋出例外，引擎捕獲後：
  1. 該節點 status 設為 `'failed'`，記錄 `errorMessage`
  2. 所有尚未執行的節點 status 設為 `'skipped'`
  3. `EtlPipelineLog.status` 設為 `'failed'`，`error_message` 包含節點 ID 與錯誤訊息
  4. `EtlPipeline.status` 設為 `'failed'`

## 6. 邊界情況

| 情境 | 預期行為 |
|------|---------|
| Pipeline 定義無節點（nodes 為空陣列） | Pipeline 直接標記為 `completed`，不執行任何動作 |
| Pipeline 定義無 edges（所有節點獨立） | 所有節點按陣列順序依序執行 |
| 節點的上游輸出不存在於 `nodeOutputMap` | 該節點以空 DataSet（`{ rows: [], rowCount: 0 }`）作為輸入 |
| 拓撲排序中同層多節點 | 按 Kahn's algorithm 佇列的入隊順序（即原始 nodes 陣列順序）決定先後 |

## 7. 後置條件

- `EtlPipelineLog` 記錄完整的 `node_logs`（JSON 陣列），包含每個節點的執行狀態
- `EtlPipelineLog.status` 為 `'completed'` 或 `'failed'`
- `EtlPipelineLog.finished_at` 與 `duration_ms` 已填寫
- `EtlPipeline.status` 已更新（成功：`'active'`；失敗：`'failed'`；測試執行：恢復先前狀態）
- `nodeOutputMap` 已清理

## 8. Node Dispatcher 註冊表

| nodeType | NodeExecutor 類別 | 定義於 |
|----------|------------------|--------|
| `raw_data_extract` | RawDataExtractExecutor | F043 |
| `merge` | MergeExecutor | F043 |
| `dedup` | DedupExecutor | F043 |
| `type_cast` | TypeCastExecutor | F043 |
| `derived_field` | DerivedFieldExecutor | F043 |
| `field_mapping` | FieldMappingExecutor | F043 |
| `conditional` | ConditionalExecutor | F043 |
| `target_load` | TargetLoadExecutor | F044 |

Node Dispatcher 以 `Map<string, NodeExecutor>` 儲存註冊表，啟動時由各 Executor 自行註冊。

## 9. 測試執行模式（is_test_run = true）

- 引擎正常執行所有節點（包含 `target_load`）
- `target_load` 節點跳過實際資料庫寫入，僅記錄預計寫入筆數
- 其餘節點行為不變
- Pipeline 完成後，status 恢復為觸發前狀態（不設為 `'active'`）

## 10. 驗收標準

### AC-1: 拓撲排序決定節點執行順序

- Given Pipeline 定義含有 `nodes` 陣列與 `edges` 陣列
- When 引擎開始執行
- Then 根據 edges 進行拓撲排序（Kahn's algorithm），確保上游節點先於下游節點執行
- And 對於 seed-pipeline-definition.json 的 19 個節點，執行順序滿足：e1, e2 先於 m1；m1 先於 d1；d1 先於 df1；df1 先於 fm1；fm1, fm2 先於 m4；m4 先於 cd1；cd1 先於 df3；df3 先於 tl1

### AC-2: 循環依賴偵測

- Given edges 中存在 A→B→C→A 的循環
- When 引擎開始執行
- Then Pipeline 立即標記為 `failed`，`error_message` 包含「循環依賴」字樣
- And 無任何節點執行（所有 status 維持 `'pending'`）

### AC-3: 節點資料透過 nodeOutputMap 傳遞

- Given 節點 A 執行完成，輸出 DataSet_A
- When 節點 B（A 的下游）開始執行
- Then 引擎透過 `nodeOutputMap` 將 DataSet_A 傳入 B 的 inputs

### AC-4: merge 節點正確接收雙路輸入

- Given merge 節點有 `left-input` 與 `right-input` 兩個上游
- When merge 節點被分派執行
- Then `context.inputs['left-input']` 與 `context.inputs['right-input']` 分別為兩路上游的 DataSet

### AC-5: 節點執行狀態即時回寫

- Given 節點 N 開始執行
- When 節點進入 running 狀態
- Then 立即將 `node_logs[N].status` 更新為 `'running'` 並儲存至資料庫
- And 完成後更新為 `'completed'`，記錄 `durationMs`、`inputRowCount`、`outputRowCount`
- And 失敗後更新為 `'failed'`，記錄 `errorMessage`

### AC-6: 節點失敗立即中止

- Given 節點 N 執行時拋出例外
- When 引擎捕獲例外
- Then 停止後續節點，未執行節點 status 標記為 `'skipped'`
- And `EtlPipelineLog.status` 設為 `'failed'`
- And `EtlPipeline.status` 設為 `'failed'`

### AC-7: Node Dispatcher 分派正確

- Given 節點 `data.nodeType` 為 `merge`
- When 引擎分派該節點
- Then 呼叫 MergeExecutor 處理
- And 若 nodeType 不在支援清單中，標記為 `'failed'`，錯誤訊息為「未知的節點類型：{nodeType}」

### AC-8: 測試執行不寫入目標表

- Given Pipeline 以 `is_test_run = true` 觸發
- When 執行到 `target_load` 節點
- Then 跳過實際寫入，節點仍標記為 `'completed'`，記錄預計寫入筆數

## 11. 錯誤場景

| 場景 | 系統回應 | 參考 |
|------|---------|------|
| 循環依賴 | Pipeline `failed`，錯誤訊息含「循環依賴」 | error-handling.md#etl-pipeline-errors |
| 未知節點類型 | 節點 `failed`，Pipeline 中止 | error-handling.md#etl-pipeline-errors |
| 節點執行拋出例外 | 節點 `failed`，後續節點 `skipped`，Pipeline `failed` | error-handling.md#etl-pipeline-errors |
| 資料庫回寫失敗 | 記錄 error log，Pipeline `failed` | error-handling.md#etl-pipeline-errors |

## 12. 相關文件

- 節點處理器：[F043-etl-node-executors.md](F043-etl-node-executors.md)
- Target Load：[F044-etl-target-load.md](F044-etl-target-load.md)
- 執行觸發：[F030-execute-pipeline.md](F030-execute-pipeline.md)
- 目標表定義：[F036-target-tables.md](F036-target-tables.md)
- Pipeline 定義：`scripts/seed-pipeline-definition.json`
- 目前模擬實作：`apps/api/src/modules/etl/etl-pipeline-execution.service.ts`
- 資料模型：[data-model.md](../data-model.md)
- 圖表：[diagrams/F042-etl-execution-engine.mmd](../diagrams/F042-etl-execution-engine.mmd)
