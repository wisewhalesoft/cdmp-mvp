---
type: test-design-feature
feature_id: F042
feature_name: ETL 執行引擎核心框架
priority: P0-MVP
related_spec: /docs/specs/features/F042-etl-execution-engine.md
related_story: US-055
last_updated: 2026-03-27
---

# F042: ETL 執行引擎核心框架 — 測試設計

## 測試策略

### 單元測試範疇
- **拓撲排序（Kahn's algorithm）**：純函數，無 DB 依賴，優先以單元測試覆蓋
- **Node Dispatcher 路由邏輯**：根據 nodeType 分派至對應 Executor，可 Mock Executor 進行單元測試
- **節點輸入收集邏輯**：根據 edge.targetHandle 組裝 inputs，純記憶體操作
- **記憶體回收邏輯（refCount）**：引用計數遞減與釋放，純記憶體操作

### 整合測試範疇
- **節點狀態即時回寫**：需要 DB（EtlPipelineLog），驗證 running → completed / failed 的實際資料庫寫入
- **節點失敗中止流程**：需要真實節點執行流程，驗證 skipped 批量標記
- **完整 Pipeline 執行（seed-pipeline）**：最高層次整合驗證

### Mock 策略
- 各 NodeExecutor 實作在框架測試中以 Mock 替代（回傳指定 DataSet 或拋出錯誤）
- DB 回寫在單元測試中以 Mock Repository 替代；整合測試使用 Test Container

---

## Mock 資料設計

### 簡單線性 Pipeline（3 節點）
```json
{
  "nodes": [
    { "id": "n1", "data": { "nodeType": "raw_data_extract", "label": "擷取" } },
    { "id": "n2", "data": { "nodeType": "dedup", "label": "去重" } },
    { "id": "n3", "data": { "nodeType": "target_load", "label": "載入" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" },
    { "id": "e2", "source": "n2", "target": "n3" }
  ]
}
```

### 合併型 Pipeline（含 left-input / right-input）
```json
{
  "nodes": [
    { "id": "left", "data": { "nodeType": "raw_data_extract", "label": "左側" } },
    { "id": "right", "data": { "nodeType": "raw_data_extract", "label": "右側" } },
    { "id": "m1", "data": { "nodeType": "merge", "label": "合併" } }
  ],
  "edges": [
    { "id": "e1", "source": "left", "target": "m1", "targetHandle": "left-input" },
    { "id": "e2", "source": "right", "target": "m1", "targetHandle": "right-input" }
  ]
}
```

### 循環依賴 Pipeline
```json
{
  "nodes": [
    { "id": "A", "data": { "nodeType": "dedup", "label": "A" } },
    { "id": "B", "data": { "nodeType": "dedup", "label": "B" } },
    { "id": "C", "data": { "nodeType": "dedup", "label": "C" } }
  ],
  "edges": [
    { "id": "e1", "source": "A", "target": "B" },
    { "id": "e2", "source": "B", "target": "C" },
    { "id": "e3", "source": "C", "target": "A" }
  ]
}
```

### 孤立節點 Pipeline（無 edges）
```json
{
  "nodes": [
    { "id": "x1", "data": { "nodeType": "dedup", "label": "X1" } },
    { "id": "x2", "data": { "nodeType": "dedup", "label": "X2" } }
  ],
  "edges": []
}
```

---

## 測試場景

### TS-F042-001: 線性 Pipeline 拓撲排序正確性

- **Related Requirement**: F042 AC-1 / US-055 TC-055-01
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: 線性 3 節點 Pipeline（n1 → n2 → n3）
- **Steps**:
  1. 以 nodes + edges 呼叫拓撲排序函式
  2. 取得排序結果陣列
- **Expected Result**:
  - 排序結果為 `["n1", "n2", "n3"]`
  - 任何節點的所有上游節點均出現在其前面

---

### TS-F042-002: Seed Pipeline 19 節點拓撲排序正確性

- **Related Requirement**: F042 AC-1 / US-055 TC-055-01
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: seed-pipeline-definition.json 的 nodes 與 edges
- **Steps**:
  1. 載入 seed-pipeline-definition.json
  2. 執行拓撲排序
  3. 驗證關鍵節點的先後順序
- **Expected Result**:
  - `e1`, `e2` 在排序結果中均早於 `m1`
  - `m1` 早於 `d1`
  - `d1` 早於 `df1`
  - `df1` 早於 `fm1`
  - `fm1`, `fm2` 均早於 `m4`
  - `m4` 早於 `cd1`
  - `cd1` 早於 `df3`
  - `df3` 早於 `tl1`

---

### TS-F042-003: 循環依賴偵測

- **Related Requirement**: F042 AC-2 / US-055 TC-055-02 / F042 Section 5.1
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**: 含有 A→B→C→A 循環依賴的 Pipeline 定義
- **Steps**:
  1. 以循環依賴 Pipeline 定義呼叫拓撲排序函式
  2. 捕獲回傳結果
- **Expected Result**:
  - 排序函式回傳「循環依賴」錯誤（或特殊回傳值）
  - 排序結果長度 < 節點總數（3）

---

### TS-F042-004: 無 edges Pipeline（孤立節點）按陣列順序執行

- **Related Requirement**: F042 Section 6 邊界情況
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: 2 個節點，無任何 edges
- **Steps**:
  1. 以孤立節點 Pipeline 執行拓撲排序
- **Expected Result**:
  - 排序成功（無循環依賴錯誤）
  - 排序結果長度 = 2
  - 順序與原始 nodes 陣列順序一致（`x1`, `x2`）

---

### TS-F042-005: 空 nodes Pipeline 直接完成

- **Related Requirement**: F042 Section 6 邊界情況
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: Pipeline 定義中 nodes 為空陣列
- **Steps**:
  1. 執行 PipelineRunner.run()
- **Expected Result**:
  - 不執行任何節點
  - Pipeline 標記為 `'completed'`

---

### TS-F042-006: 節點輸入收集 — 單路上游（無 targetHandle）

- **Related Requirement**: F042 AC-3 / Section 4.3
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - n1 的輸出 DataSet 已在 nodeOutputMap 中
  - n2 以一條無 targetHandle 的 edge 接收 n1 的輸出
- **Steps**:
  1. 呼叫節點輸入收集邏輯，傳入 n2 與當前 nodeOutputMap
- **Expected Result**:
  - `inputs` 結構為 `{ default: DataSet_n1 }`

---

### TS-F042-007: 節點輸入收集 — 雙路上游（left-input / right-input）

- **Related Requirement**: F042 AC-4 / US-055 AC-3
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - left 節點輸出 DataSet_L，right 節點輸出 DataSet_R，均在 nodeOutputMap 中
  - merge 節點以 `targetHandle: "left-input"` 與 `targetHandle: "right-input"` 分別連接兩個上游
- **Steps**:
  1. 呼叫節點輸入收集邏輯，傳入 merge 節點與當前 nodeOutputMap
- **Expected Result**:
  - `context.inputs['left-input']` = DataSet_L
  - `context.inputs['right-input']` = DataSet_R
  - 兩者不互換

---

### TS-F042-008: 上游節點輸出不存在於 nodeOutputMap 時以空 DataSet 補充

- **Related Requirement**: F042 Section 6 邊界情況
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - 節點 n2 的上游 n1 未在 nodeOutputMap 中（模擬第一個根節點）
- **Steps**:
  1. 呼叫節點輸入收集邏輯
- **Expected Result**:
  - `inputs['default']` 為空 DataSet：`{ rows: [], rowCount: 0 }`

---

### TS-F042-009: Node Dispatcher 根據 nodeType 分派正確 Executor

- **Related Requirement**: F042 AC-7 / US-055 AC-6
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: Node Dispatcher 已完成 8 種 Executor 的註冊
- **Steps**:
  1. 依次分派 nodeType = `raw_data_extract`, `merge`, `dedup`, `type_cast`, `derived_field`, `field_mapping`, `conditional`, `target_load` 的節點
  2. 記錄各次分派到的 Executor 類別
- **Expected Result**:
  - 每種 nodeType 分派到正確的 Executor
  - 不發生跨類型混亂

---

### TS-F042-010: Node Dispatcher 遇到未知 nodeType 時回傳錯誤

- **Related Requirement**: F042 AC-7 / Section 5.2
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**: 節點 `data.nodeType = "unknown_type"`
- **Steps**:
  1. 呼叫 Node Dispatcher 嘗試分派此節點
- **Expected Result**:
  - 回傳錯誤或拋出例外，errorMessage = `未知的節點類型：unknown_type`

---

### TS-F042-011: 節點狀態 running 於執行前立即回寫 DB

- **Related Requirement**: F042 AC-5 / US-055 AC-4 / US-055 TC-055-05
- **Test Type**: 正向
- **測試層次**: 整合測試
- **Preconditions**:
  - 使用 Test Container / Mock Repository
  - Mock Executor 設定為延遲 100ms 後回傳
- **Steps**:
  1. 啟動 Pipeline 執行
  2. 在 Mock Executor 延遲期間查詢 DB 中節點狀態
- **Expected Result**:
  - 節點進入 Executor 之前，DB 中 `node_logs[N].status` 已為 `'running'`
  - 不等待 Executor 完成

---

### TS-F042-012: 節點完成後回寫 completed 狀態與統計資訊

- **Related Requirement**: F042 AC-5
- **Test Type**: 正向
- **測試層次**: 整合測試
- **Preconditions**: Mock Executor 回傳 `{ rows: [{a: 1}, {a: 2}], rowCount: 2 }`
- **Steps**:
  1. 執行包含一個節點的 Pipeline
  2. 執行完成後查詢 DB 中 node_logs
- **Expected Result**:
  - `node_logs[N].status = 'completed'`
  - `node_logs[N].outputRowCount = 2`
  - `node_logs[N].durationMs > 0`
  - `node_logs[N].inputRowCount` 有值（即使為 0）

---

### TS-F042-013: 節點執行失敗 — 標記 failed 並中止後續節點

- **Related Requirement**: F042 AC-6 / US-055 AC-5 / US-055 TC-055-03
- **Test Type**: 負向
- **測試層次**: 整合測試
- **Preconditions**:
  - Pipeline: n1 → n2 → n3，共 3 個節點
  - n1 的 Mock Executor 設定為拋出錯誤 `Error("n1 執行失敗")`
- **Steps**:
  1. 執行 Pipeline
  2. 等待執行完成
  3. 查詢 DB 中 EtlPipelineLog 與 EtlPipeline
- **Expected Result**:
  - `node_logs[n1].status = 'failed'`
  - `node_logs[n1].errorMessage` 包含 "n1 執行失敗"
  - `node_logs[n2].status = 'skipped'`
  - `node_logs[n3].status = 'skipped'`
  - `EtlPipelineLog.status = 'failed'`
  - `EtlPipelineLog.error_message` 包含節點 ID `n1` 與錯誤訊息
  - `EtlPipeline.status = 'failed'`

---

### TS-F042-014: 循環依賴導致 Pipeline 失敗（完整引擎流程）

- **Related Requirement**: F042 AC-2 / US-055 TC-055-02
- **Test Type**: 負向
- **測試層次**: 整合測試
- **Preconditions**: 循環依賴 Pipeline（A→B→C→A）
- **Steps**:
  1. 呼叫 PipelineRunner.run()
  2. 查詢 EtlPipelineLog 與 EtlPipeline
- **Expected Result**:
  - `EtlPipelineLog.status = 'failed'`
  - `EtlPipelineLog.error_message` 包含 "循環依賴" 字樣
  - 所有節點 `status` 維持 `'pending'`（未執行任何節點）

---

### TS-F042-015: 未知 nodeType 導致節點 failed 並中止 Pipeline

- **Related Requirement**: F042 Section 5.2 / F042 AC-7
- **Test Type**: 負向
- **測試層次**: 整合測試
- **Preconditions**:
  - Pipeline: n_unknown → n2
  - n_unknown.data.nodeType = "unsupported_node"
- **Steps**:
  1. 執行 Pipeline
- **Expected Result**:
  - `node_logs[n_unknown].status = 'failed'`
  - `node_logs[n_unknown].errorMessage = '未知的節點類型：unsupported_node'`
  - `node_logs[n2].status = 'skipped'`
  - Pipeline 標記為 `'failed'`

---

### TS-F042-016: 測試執行模式（is_test_run = true）不寫入目標表

- **Related Requirement**: F042 AC-8 / F042 Section 9 / US-055 TC-055-04
- **Test Type**: 正向
- **測試層次**: 整合測試
- **Preconditions**:
  - Pipeline 包含 `target_load` 節點（Mock TargetLoadExecutor 追蹤呼叫）
  - `isTestRun = true`
- **Steps**:
  1. 執行 Pipeline（`isTestRun = true`）
  2. 查詢 Mock TargetLoadExecutor 是否收到 `isTestRun = true`
  3. 查詢 customer_core 筆數變化
- **Expected Result**:
  - Mock TargetLoadExecutor 的 `context.isTestRun === true`
  - customer_core 筆數不變
  - `target_load` 節點 `status = 'completed'`

---

### TS-F042-017: Pipeline 完成後 nodeOutputMap 清理

- **Related Requirement**: F042 Section 4.4 / Section 7 後置條件
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: 線性 3 節點 Pipeline 執行完畢
- **Steps**:
  1. 執行 Pipeline
  2. 執行完成後查詢 NodeOutputStore
- **Expected Result**:
  - NodeOutputStore 中所有節點的輸出均已釋放（Map 為空）

---

### TS-F042-018: 記憶體回收 — 節點輸出在所有下游完成後釋放

- **Related Requirement**: F042 Section 4.4 架構 5.3
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - Pipeline: n1 → n2, n1 → n3（n1 有兩個下游）
  - 追蹤 `outputStore.release()` 的呼叫時機
- **Steps**:
  1. 執行 Pipeline
  2. 在 n2 完成後檢查 n1 的輸出是否已釋放
  3. 在 n3 完成後再次檢查
- **Expected Result**:
  - n2 完成後，n1 的輸出尚未釋放（仍被 n3 需要）
  - n3 完成後，n1 的輸出才被釋放（refCount 歸零）

---

### TS-F042-019: 同層多節點按原始陣列順序執行

- **Related Requirement**: F042 Section 6 邊界情況（拓撲排序同層順序）
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - Pipeline 中 `a`, `b`, `c` 三個互不依賴的根節點（無 edges），在 nodes 陣列中順序為 a, b, c
- **Steps**:
  1. 執行拓撲排序
  2. 記錄排序結果
- **Expected Result**:
  - 排序結果為 `["a", "b", "c"]`（保持原始 nodes 陣列順序）

---

### TS-F042-020: Pipeline 成功後 EtlPipeline.status 更新為 active

- **Related Requirement**: F042 Section 7 後置條件 / 架構 Section 6.4
- **Test Type**: 正向
- **測試層次**: 整合測試
- **Preconditions**:
  - Pipeline 處於 `'idle'` 狀態
  - 所有節點 Mock Executor 正常回傳
  - `isTestRun = false`
- **Steps**:
  1. 執行 Pipeline
  2. 查詢 EtlPipeline 與 EtlPipelineLog
- **Expected Result**:
  - `EtlPipeline.status = 'active'`
  - `EtlPipelineLog.status = 'completed'`
  - `EtlPipelineLog.finished_at` 有值
  - `EtlPipelineLog.duration_ms > 0`

---

### TS-F042-021: 測試執行完成後 Pipeline status 恢復原狀

- **Related Requirement**: F042 Section 9 / F042 Section 7 後置條件
- **Test Type**: 正向
- **測試層次**: 整合測試
- **Preconditions**:
  - Pipeline 執行前狀態為 `'active'`
  - `isTestRun = true`
- **Steps**:
  1. 執行 Pipeline（isTestRun = true）
  2. 查詢 EtlPipeline 狀態
- **Expected Result**:
  - Pipeline 執行完成後 status 恢復為 `'active'`（不變為其他狀態）
  - `EtlPipelineLog.status = 'completed'`
