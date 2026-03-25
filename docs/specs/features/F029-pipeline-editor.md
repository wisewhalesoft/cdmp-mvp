---
spec-id: F029
title: 視覺化轉換編輯器
feature-id: F029
source-story: US-042
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-19
status: Draft
---

# F029: 視覺化轉換編輯器

## 1. 功能摘要

提供 Admin 使用視覺化拖拉式編輯器設計 Pipeline 的 ETL 流程。編輯器分為三個區域：左側節點工具箱（Extract / Transform / Load）、中央拖拉畫布、右側屬性編輯面板。Admin 可拖拉新增節點、建立連線、設定各節點屬性，完成後以 JSONB 格式儲存 Pipeline 定義。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 使用視覺化拖拉式編輯器設計 Pipeline 的 ETL 流程
**So that** 我能直觀地定義資料從擷取、轉換到載入的完整流程，無需撰寫程式碼

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標 Pipeline 存在且未被軟刪除

## 4. 驗收標準

### AC-1: 節點工具箱

- **Given** Admin 進入 Pipeline 編輯器頁面
- **When** 頁面載入完成
- **Then** 左側顯示節點工具箱，分為 Extract、Transform（13 種）、Load 三個分類，各分類下列出可用節點

### AC-2: 拖拉新增節點至畫布

- **Given** 左側工具箱中有可用節點
- **When** Admin 將節點拖拉至中央畫布
- **Then** 節點出現在畫布上的放置位置，顯示節點名稱與類型圖示

### AC-3: 節點連線

- **Given** 畫布上有兩個以上節點
- **When** Admin 從一個節點的輸出端拖拉至另一個節點的輸入端
- **Then** 兩個節點之間建立連線，以箭頭表示資料流向

### AC-4: 連線驗證

- **Given** 畫布上有節點
- **When** Admin 嘗試建立不合法的連線（如 Load 連到 Extract、逆向連線）
- **Then** 系統阻止連線建立，並顯示提示訊息說明連線規則

### AC-5: 右側屬性面板

- **Given** 畫布上有節點
- **When** Admin 點擊某個節點
- **Then** 右側顯示該節點的屬性編輯面板，包含該節點類型對應的設定表單

### AC-6: Extract 節點設定

- **Given** Admin 點擊一個 Extract 節點
- **When** 右側屬性面板載入
- **Then** 顯示下拉選單列出所有可用的 raw data 表（來自 E04 ExtractionTask），Admin 可選擇一個作為資料來源

### AC-7: Transform 節點設定

- **Given** Admin 點擊一個 Transform 節點
- **When** 右側屬性面板載入
- **Then** 根據 Transform 類型顯示對應的設定表單（詳見第 8.4 節）

### AC-8: Load 節點設定

- **Given** Admin 點擊一個 Load 節點
- **When** 右側屬性面板載入
- **Then** 顯示目標表選擇（Phase 1 MVP：customer_core）及欄位對應設定

### AC-9: 存檔為草稿

- **Given** Admin 已編輯 Pipeline 定義（新增節點、連線、設定屬性）
- **When** 點擊「儲存」按鈕
- **Then** Pipeline 定義以 JSONB 格式儲存至當前版本，狀態維持 draft，顯示儲存成功提示，`step_count` 更新為節點數量

### AC-10: 載入已儲存的 Pipeline 定義

- **Given** 某 Pipeline 已有儲存的定義
- **When** Admin 進入該 Pipeline 的編輯器
- **Then** 畫布還原所有節點、連線與屬性設定

## 5. 主要流程

1. Admin 從 Pipeline 列表點擊「編輯」或從建立後導向進入編輯器
2. 系統載入 Pipeline 定義（若有），還原畫布狀態
3. Admin 從左側工具箱拖拉節點至畫布
4. Admin 建立節點間的連線
5. Admin 點擊節點，在右側面板設定屬性
6. Admin 點擊「儲存」按鈕
7. 系統驗證連線規則，儲存 definition 至 EtlPipelineVersion

## 6. 替代流程

- **刪除節點**：Admin 選中節點後按 Delete 鍵或右鍵選單刪除
- **刪除連線**：Admin 點擊連線後按 Delete 鍵刪除
- **取消編輯**：Admin 點擊「返回」按鈕，若有未儲存變更，顯示確認對話框

## 7. 邊界情況

- 畫布為空時仍可儲存（空定義）
- 節點未完成設定時可儲存（草稿狀態允許不完整的設定）
- 拖拉至畫布外的節點不生效
- 同一 Pipeline 不可有兩個相同的 Extract 來源（同一 raw data 表）

## 8. API 規格

### 8.1 GET /api/v1/etl/pipelines/:id/definition

取得 Pipeline 當前版本的定義。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response -- 200 OK:**

```json
{
  "versionId": "uuid",
  "version": 1,
  "status": "draft",
  "definition": {
    "nodes": [
      {
        "id": "node-1",
        "type": "extract",
        "position": { "x": 100, "y": 200 },
        "data": {
          "rawTableId": "uuid",
          "rawTableName": "raw_a3f2c1d4",
          "taskName": "每日客戶同步"
        }
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "source": "node-1",
        "target": "node-2"
      }
    ]
  }
}
```

### 8.2 PUT /api/v1/etl/pipelines/:id/definition

儲存 Pipeline 定義至當前草稿版本。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |
| Content-Type  | application/json         | 是   |

**Request Body:**

```json
{
  "definition": {
    "nodes": [],
    "edges": []
  },
  "changeSummary": "string (選填, 最大 500 字元)"
}
```

**Response -- 200 OK:**

```json
{
  "message": "Pipeline 定義已儲存",
  "versionId": "uuid",
  "version": 1,
  "stepCount": 3
}
```

### 8.3 GET /api/v1/extraction-tasks/raw-tables

取得可用 raw data 表清單（供 Extract 節點選擇）。

**Response -- 200 OK:**

```json
{
  "data": [
    {
      "taskId": "uuid",
      "taskName": "每日客戶同步",
      "rawTableName": "raw_a3f2c1d4",
      "datasourceName": "客戶 DB",
      "sourceTable": "customers",
      "lastExecutionAt": "ISO 8601 | null",
      "status": "completed"
    }
  ]
}
```

### 8.4 Transform 節點類型與 JSONB definition 結構

以下定義 13 種 Transform 節點在 `node.data` 中的 JSONB 結構：

#### 8.4.1 合併（Merge） — `transform-merge`

```json
{
  "joinType": "INNER | LEFT | RIGHT | FULL",
  "leftInput": "string (來源節點 ID)",
  "rightInput": "string (來源節點 ID)",
  "conditions": [
    {
      "leftColumn": "string",
      "rightColumn": "string",
      "operator": "= | != | > | < | >= | <="
    }
  ]
}
```

**設定表單**：JOIN 類型下拉選單、左右輸入來源選擇、條件列表（可新增多組）。

#### 8.4.2 欄位對應（Field Mapping） — `transform-field-mapping`

```json
{
  "mappings": [
    {
      "sourceColumn": "string",
      "targetColumn": "string",
      "defaultValue": "string | null"
    }
  ],
  "dropUnmapped": false
}
```

**設定表單**：來源欄位 → 目標欄位的對應表格，可新增/刪除對應行，`dropUnmapped` 核取方塊。

#### 8.4.3 格式轉換（Format） — `transform-format`

```json
{
  "rules": [
    {
      "column": "string",
      "formatType": "date | number | string",
      "sourceFormat": "string (例: MM/DD/YYYY)",
      "targetFormat": "string (例: YYYY-MM-DD)"
    }
  ]
}
```

**設定表單**：欄位選擇、格式類型、來源格式、目標格式，可新增多組規則。

#### 8.4.4 條件轉換（Conditional） — `transform-conditional`

```json
{
  "targetColumn": "string",
  "conditions": [
    {
      "when": {
        "column": "string",
        "operator": "= | != | > | < | >= | <= | IS_NULL | IS_NOT_NULL | CONTAINS | STARTS_WITH",
        "value": "string | null"
      },
      "then": "string (設定值)"
    }
  ],
  "elseValue": "string | null"
}
```

**設定表單**：目標欄位、條件列表（IF/THEN）、ELSE 預設值。

#### 8.4.5 NULL 處理（Null Handler） — `transform-null-handler`

```json
{
  "columns": ["string"],
  "strategy": "default_value | delete_row | fill_forward | fill_backward | fixed_value",
  "defaultValue": "string | null",
  "fixedValue": "string | null"
}
```

**設定表單**：欄位多選、策略下拉選單（預設值/刪除列/前值填充/後值填充/固定值）、對應值輸入。

#### 8.4.6 型別轉換（Type Cast） — `transform-type-cast`

```json
{
  "casts": [
    {
      "column": "string",
      "sourceType": "string",
      "targetType": "VARCHAR | INTEGER | DECIMAL | BOOLEAN | DATE | TIMESTAMP | TEXT | UUID"
    }
  ]
}
```

**設定表單**：欄位選擇、來源型別（顯示用）、目標型別下拉選單，可新增多組。

#### 8.4.7 篩選（Filter） — `transform-filter`

```json
{
  "logic": "AND | OR",
  "conditions": [
    {
      "column": "string",
      "operator": "= | != | > | < | >= | <= | IS_NULL | IS_NOT_NULL | IN | NOT_IN | CONTAINS | STARTS_WITH | ENDS_WITH",
      "value": "string | null"
    }
  ]
}
```

**設定表單**：邏輯運算子（AND/OR）、條件列表（欄位、運算子、值），可新增多組。

#### 8.4.8 去重（Deduplicate） — `transform-deduplicate`

```json
{
  "keyColumns": ["string"],
  "keepStrategy": "first | last | latest_timestamp",
  "timestampColumn": "string | null"
}
```

**設定表單**：去重依據欄位多選、保留策略下拉選單（首筆/末筆/最新時間戳記）、時間戳記欄位選擇（僅 `latest_timestamp` 時顯示）。

#### 8.4.9 查找（Lookup） — `transform-lookup`

```json
{
  "lookupSource": "string (raw data 表名或靜態對照表名)",
  "lookupSourceId": "uuid | null (若為 raw data 表則為 taskId)",
  "matchColumn": "string (當前資料的比對欄位)",
  "lookupMatchColumn": "string (對照表的比對欄位)",
  "outputColumns": [
    {
      "lookupColumn": "string (對照表欄位)",
      "outputAlias": "string (輸出欄位名稱)"
    }
  ],
  "noMatchStrategy": "null | default_value | skip_row",
  "defaultValue": "string | null"
}
```

**設定表單**：對照來源選擇（raw data 表下拉）、比對欄位、輸出欄位對應表格、無匹配策略。

#### 8.4.10 字串處理（String） — `transform-string`

```json
{
  "operations": [
    {
      "column": "string",
      "operation": "trim | upper | lower | substring | concat | regex_replace | normalize",
      "params": {
        "start": 0,
        "length": 10,
        "concatWith": "string",
        "concatColumns": ["string"],
        "pattern": "string (正則)",
        "replacement": "string"
      }
    }
  ]
}
```

**設定表單**：欄位選擇、操作類型下拉選單（Trim/大小寫/子字串擷取/串接/正則替換/正規化），各操作依類型動態顯示對應參數欄位。

#### 8.4.11 加密脫敏（Masking） — `transform-masking`

```json
{
  "rules": [
    {
      "column": "string",
      "method": "aes_encrypt | partial_mask",
      "maskPattern": "string | null (例: ***-****-{last4})",
      "visibleStart": 0,
      "visibleEnd": 0
    }
  ]
}
```

**設定表單**：欄位選擇、方法下拉選單（AES 加密/部分遮罩）、遮罩模式設定（可見起始/結束位置）。

#### 8.4.12 聚合（Aggregate） — `transform-aggregate`

```json
{
  "groupByColumns": ["string"],
  "aggregations": [
    {
      "column": "string",
      "function": "SUM | COUNT | AVG | MAX | MIN",
      "outputAlias": "string"
    }
  ]
}
```

**設定表單**：GROUP BY 欄位多選、聚合函數列表（欄位、函數類型、輸出別名），可新增多組。

#### 8.4.13 衍生欄位（Derived Column） — `transform-derived-column`

```json
{
  "derivations": [
    {
      "outputColumn": "string (新欄位名稱)",
      "expression": "string (運算式)",
      "outputType": "VARCHAR | INTEGER | DECIMAL | BOOLEAN | DATE | TIMESTAMP"
    }
  ]
}
```

**設定表單**：新欄位名稱、運算式輸入框（支援欄位參照如 `{column_a} + {column_b}`）、輸出型別下拉選單，可新增多組。

### 8.5 連線驗證規則

| 來源節點類型 | 可連接目標 | 不可連接目標 |
|-------------|-----------|-------------|
| Extract | Transform | Extract, Load |
| Transform | Transform, Load | Extract |
| Load | （無，終端節點） | Extract, Transform, Load |

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 404         | PIPELINE_NOT_FOUND     | Pipeline 不存在或已刪除            |
| 422         | PIPELINE_INVALID_CONNECTION | 連線規則違反                   |
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可編輯 Pipeline |
| BR-2 | Extract 只能連接到 Transform |
| BR-3 | Transform 可連接到 Transform 或 Load |
| BR-4 | Load 為終端節點，不可連接到任何節點 |
| BR-5 | 不可建立逆向連線（形成循環） |
| BR-6 | 儲存時更新 EtlPipeline.step_count 為 nodes 數量 |
| BR-7 | Pipeline definition 以 JSONB 格式儲存於 EtlPipelineVersion |
| BR-8 | Extract 節點的資料來源為 E04 ExtractionTask 產生的 raw data 表 |
| BR-9 | Load 節點的目標表為系統預定義的 Domain Data Product 表（Phase 1 MVP：customer_core） |
| BR-10 | 草稿狀態下允許不完整的設定（節點未完成配置仍可儲存） |

## 10. UI/UX 需求

- 三欄式佈局：左側節點工具箱（可折疊）、中央畫布、右側屬性面板（點擊節點時顯示）
- 節點工具箱按 Extract / Transform / Load 分類，Transform 類別可展開/收合
- 畫布支援拖拉新增節點、拖拉建立連線、縮放、平移
- 節點視覺設計：不同類型使用不同顏色與圖示（Extract=藍色、Transform=橘色、Load=綠色）
- 連線以箭頭表示資料流向
- 非法連線嘗試時顯示紅色提示
- 右側屬性面板根據選中節點類型動態切換表單
- 儲存按鈕常駐於頂部工具列
- 未儲存變更時離開頁面需確認對話框
- 建議使用 React Flow 實作畫布

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| Pipeline 不存在              | HTTP 404，「找不到指定的 Pipeline」                  | error-handling.md#etl-pipeline-errors    |
| 非法連線                     | 畫布上顯示紅色提示，不建立連線                       | error-handling.md#etl-pipeline-errors    |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |
| 伺服器錯誤                   | 「系統發生非預期錯誤，請稍後再試」                   | error-handling.md#system-errors          |

## 12. 相依性

- **F028（建立 Pipeline）**：需有 Pipeline 存在
- **F017-F026（E04 擷取任務）**：Extract 節點需讀取 raw data 表
- **F036（目標表）**：Load 節點需選擇目標表
- **認證系統**：需要有效的 Admin 登入 Session/Token
- 封鎖：F030, F033

## 13. 資料需求

- EtlPipelineVersion 實體：參見 [data-model.md#etl-pipeline-version-entity](../data-model.md#etl-pipeline-version-entity)
- Raw Data Table：參見 [data-model.md#raw-data-table](../data-model.md#raw-data-table)
- 目標表：參見 [data-model.md#target-tables](../data-model.md#target-tables)

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-version-entity](../data-model.md#etl-pipeline-version-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 非功能需求：[nfr.md](../nfr.md)
- 相關功能：[F028](F028-create-pipeline.md)、[F030](F030-execute-pipeline.md)、[F033](F033-pipeline-version.md)、[F036](F036-target-tables.md)
- 圖表：[diagrams/pipeline-editor-flow.md](../diagrams/pipeline-editor-flow.md)
