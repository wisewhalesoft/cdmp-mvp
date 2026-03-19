# US-042：視覺化轉換編輯器

> **Story ID**：US-042
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：13

---

## User Story

**As a** Admin（管理者）
**I want** 使用視覺化拖拉式編輯器設計 Pipeline 的 ETL 流程
**So that** 我能直觀地定義資料從擷取、轉換到載入的完整流程，無需撰寫程式碼

---

## 驗收標準

### AC-1：節點工具箱
- **Given** Admin 進入 Pipeline 編輯器頁面
- **When** 頁面載入完成
- **Then** 左側顯示節點工具箱，分為 Extract、Transform、Load 三個分類，各分類下列出可用節點

### AC-2：拖拉新增節點至畫布
- **Given** 左側工具箱中有可用節點
- **When** Admin 將節點拖拉至中央畫布
- **Then** 節點出現在畫布上的放置位置，顯示節點名稱與類型圖示

### AC-3：節點連線
- **Given** 畫布上有兩個以上節點
- **When** Admin 從一個節點的輸出端拖拉至另一個節點的輸入端
- **Then** 兩個節點之間建立連線，以箭頭表示資料流向

### AC-4：連線驗證
- **Given** 畫布上有節點
- **When** Admin 嘗試建立不合法的連線（如 Load 連到 Extract、逆向連線）
- **Then** 系統阻止連線建立，並顯示提示訊息說明連線規則

### AC-5：右側屬性面板
- **Given** 畫布上有節點
- **When** Admin 點擊某個節點
- **Then** 右側顯示該節點的屬性編輯面板，包含該節點類型對應的設定表單

### AC-6：Extract 節點設定
- **Given** Admin 點擊一個 Extract 節點
- **When** 右側屬性面板載入
- **Then** 顯示下拉選單列出所有可用的 raw data 表（來自 E04 ExtractionTask），Admin 可選擇一個作為資料來源

### AC-7：Transform 節點設定
- **Given** Admin 點擊一個 Transform 節點
- **When** 右側屬性面板載入
- **Then** 根據 Transform 類型（Merge / Field Mapping / Format / Conditional / Null Handler / Type Cast / Filter / Deduplicate / Lookup / String / Masking / Aggregate / Derived Column）顯示對應的設定表單

### AC-8：Load 節點設定
- **Given** Admin 點擊一個 Load 節點
- **When** 右側屬性面板載入
- **Then** 顯示目標表選擇（customer_core / customer_interaction / customer_financial / customer_service）及欄位對應設定

### AC-9：存檔為草稿
- **Given** Admin 已編輯 Pipeline 定義（新增節點、連線、設定屬性）
- **When** 點擊「儲存」按鈕
- **Then** Pipeline 定義以 JSONB 格式儲存，狀態維持 draft，顯示儲存成功提示

### AC-10：載入已儲存的 Pipeline 定義
- **Given** 某 Pipeline 已有儲存的定義
- **When** Admin 進入該 Pipeline 的編輯器
- **Then** 畫布還原所有節點、連線與屬性設定

---

## Technical Notes

- 建議使用 React Flow 實作視覺化畫布
- Pipeline definition 以 JSONB 欄位儲存於資料庫

### 節點工具箱分類

1. **Extract 節點**：選取資料擷取任務產生的 raw data table（來自 E04 ExtractionTask）
2. **Transform 節點**（13 種）：
   - 合併（Merge）：多表 JOIN，設定 JOIN 類型（INNER/LEFT/RIGHT/FULL）與 JOIN 條件
   - 欄位對應（Field Mapping）：來源欄位 → 目標欄位的對應
   - 格式轉換（Format）：日期格式、數字格式等轉換規則
   - 條件轉換（Conditional）：IF/THEN/ELSE 條件邏輯，修改欄位值
   - NULL 處理（Null Handler）：預設值、刪除列、填充策略（前值填充/後值填充/固定值）
   - 型別轉換（Type Cast）：資料型別轉換規則（VARCHAR→INTEGER、STRING→DATE 等）
   - 篩選（Filter）：依條件過濾列，保留或排除符合條件的資料（例：只匯入有效合約、排除測試資料）
   - 去重（Deduplicate）：依指定欄位去除重複記錄，可選保留策略（首筆/末筆/最新時間戳記）
   - 查找（Lookup）：參照對照表替換代碼值（類似 VLOOKUP），設定對照來源、比對欄位與輸出欄位
   - 字串處理（String）：Trim / 大小寫轉換 / 子字串擷取 / 串接 / 正則替換 / 文字正規化
   - 加密脫敏（Masking）：PII 欄位加密（AES）或遮罩處理（部分隱碼），適用身分證號、電話等個資欄位
   - 聚合（Aggregate）：GROUP BY 分組 + 聚合函數（SUM/COUNT/AVG/MAX/MIN），產生統計衍生欄位
   - 衍生欄位（Derived Column）：透過運算式產生新欄位（數學運算、日期計算、字串組合等）
3. **Load 節點**：目標表（customer_core / customer_interaction / customer_financial / customer_service），系統預定義 schema

### 連線驗證規則

- Extract 只能連接到 Transform
- Transform 可連接到 Transform 或 Load
- Load 不可連接到任何節點（終端節點）
- 不可逆向連線

### API 端點

**取得 Pipeline 定義**

- 端點：`GET /api/v1/etl/pipelines/:id/definition`
- Response：
```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "extract",
      "position": { "x": 0, "y": 0 },
      "data": {
        "rawTableId": "uuid",
        "rawTableName": "raw_a3f2c1d4"
      }
    },
    {
      "id": "node-2",
      "type": "transform-null-handler",
      "position": { "x": 300, "y": 0 },
      "data": {
        "strategy": "default_value",
        "defaultValue": "N/A",
        "columns": ["col1"]
      }
    },
    {
      "id": "node-3",
      "type": "load",
      "position": { "x": 600, "y": 0 },
      "data": {
        "targetTable": "customer_core",
        "fieldMapping": [
          { "source": "col1", "target": "customer_name" }
        ]
      }
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-1", "target": "node-2" },
    { "id": "edge-2", "source": "node-2", "target": "node-3" }
  ]
}
```

**儲存 Pipeline 定義**

- 端點：`PUT /api/v1/etl/pipelines/:id/definition`
- Request：同上方 definition 結構
- Response：`200 OK`

**取得可用 raw data 表清單**

- 端點：`GET /api/v1/extraction-tasks/raw-tables`
- Response：raw data 表清單

**取得目標表 schema**

- 端點：`GET /api/v1/etl/target-tables`
- Response：目標表 schema 定義

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 頁面載入，查看左側工具箱 | 顯示 Extract、Transform（13 種）、Load 三個分類 |
| 2 | 拖拉 Extract 節點至畫布 | 節點出現在畫布指定位置 |
| 3 | 從 Extract 節點連線至 Transform 節點 | 成功建立連線 |
| 4 | 嘗試從 Load 節點連線至 Extract 節點 | 連線被阻止，顯示錯誤提示 |
| 5 | 點擊 Extract 節點，選擇 raw data table | 右側面板顯示下拉選單，選擇後節點更新 |
| 6 | 點擊 Null Handler Transform 節點 | 右側面板顯示策略選擇（default_value / delete_row / fill） |
| 7 | 點擊 Load 節點，選擇目標表 | 顯示目標表選單與欄位對應設定 |
| 8 | 編輯後點擊儲存 | Pipeline 定義成功儲存，顯示成功提示 |
| 9 | 重新進入已儲存的 Pipeline 編輯器 | 畫布還原所有節點、連線與設定 |
| 10 | 嘗試 Transform 連 Extract | 連線被阻止 |
| 11 | 建立 Merge Transform 節點並設定 JOIN 條件 | 設定表單正確顯示，可選擇 JOIN 類型與條件 |
| 12 | 建立 Field Mapping Transform 節點 | 可設定來源欄位與目標欄位的對應 |
| 13 | 建立 Filter 節點，設定篩選條件 | 可設定欄位、運算子、值，支援 AND/OR 組合 |
| 14 | 建立 Deduplicate 節點，設定去重欄位 | 可選擇去重依據欄位與保留策略（首筆/末筆/最新） |
| 15 | 建立 Lookup 節點，設定對照表 | 可選擇對照來源表、比對欄位、輸出欄位 |
| 16 | 建立 String 節點，設定字串操作 | 可選擇操作類型（Trim/大小寫/擷取/串接/正則替換） |
| 17 | 建立 Masking 節點，設定加密脫敏 | 可選擇加密或遮罩模式，指定目標欄位 |
| 18 | 建立 Aggregate 節點，設定分組與聚合 | 可設定 GROUP BY 欄位與聚合函數（SUM/COUNT/AVG/MAX/MIN） |
| 19 | 建立 Derived Column 節點，設定運算式 | 可輸入欄位運算式產生新欄位 |

---

## 依賴關係

- **Blocked By**：US-041（需有 Pipeline 存在）
- **Blocks**：US-043、US-046、US-049

---

## Definition of Done

- [ ] React Flow 畫布元件整合完成
- [ ] 左側節點工具箱（E/T/L 三分類）實作
- [ ] 拖拉新增節點功能
- [ ] 節點連線與連線驗證規則
- [ ] 右側屬性編輯面板（所有節點類型）
- [ ] Extract 節點：串接 raw data table API
- [ ] Transform 節點：13 種類型的設定表單
- [ ] Load 節點：目標表選擇與欄位對應
- [ ] Pipeline definition JSONB 儲存與載入
- [ ] 單元測試覆蓋率達標
- [ ] E2E 測試撰寫完成

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
