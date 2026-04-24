# US-070：查看本月名單定義清單

> **Story ID**：US-070
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 查看本月各 Stage 的名單定義條件清單
**So that** 在觸發月跑之前，確認每個 Stage 的篩選條件與預期涵蓋範圍符合本月業務策略

---

## 驗收標準

### AC-1：顯示本月名單定義清單（含操作欄與新增按鈕）

- **Given** 業務主管已登入系統並進入名單定義頁面
- **When** 頁面載入完成
- **Then** 顯示本作業年月（YYYYMM）下所有 STATUS = 'active' 名單定義列表，每列包含：LIST_NO、LIST_NM（名單名稱）、PROD_KIND（產品類別）、篩選條件摘要、預估客戶數量，以及「編輯」、「停用」操作欄
- **And** 清單依 LIST_NO 升序排列
- **And** 頁面標頭顯示「新增名單定義」按鈕，點擊進入 US-088 新增流程

### AC-2：查看單一 Stage 條件詳情

- **Given** 名單定義清單已顯示
- **When** 業務主管點擊某一 Stage 列
- **Then** 展開或跳至詳情頁，顯示該 Stage 的完整篩選條件（包含每個條件欄位名稱、運算子、條件值）

### AC-3：無資料時的引導提示

- **Given** 本月名單定義尚未建立（OBMLISTDF 無本月 STATUS = 'active' 記錄）
- **When** 頁面載入完成
- **Then** 顯示空白狀態提示：「本月（YYYYMM）尚無名單定義，請點擊『新增名單定義』建立本月分派條件」

### AC-4：月跑執行中所有操作按鈕停用

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 業務主管在名單定義清單頁面
- **Then** 「新增名單定義」按鈕、每列的「編輯」按鈕、「停用」按鈕均為停用（disabled）狀態
- **And** 頁面頂部顯示橘色通知列：「分派執行中，名單定義暫時鎖定，無法進行新增、編輯或停用操作」

### AC-5：「使用中」／「已停用」獨立頁籤切換

- **Given** 業務主管已進入名單定義頁面
- **When** 頁面載入完成
- **Then** 頁面顯示兩個獨立頁籤：「使用中」（STATUS = 'active'）與「已停用」（STATUS = 'inactive'）
- **And** 預設顯示「使用中」頁籤，「已停用」頁籤中的名單列表僅供唯讀查閱，不顯示「編輯」或「停用」按鈕

---

## 技術備註

- 名單定義資料來源：`reference/TableSchema/OB/OBMLISTDF.sql`（OBMLISTDF 表，含 STATUS 欄位，需 system-architect 新增 ENUM('active','inactive')）
- 各 Stage 條件欄位定義可參照：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（Stage 1 名單篩選邏輯）
- 本頁為 M01 功能的入口頁，各操作功能對應入口：
  - 「新增名單定義」按鈕 → US-088
  - 每列「編輯」按鈕 → US-089
  - 每列「停用」按鈕 → US-090
  - 「設定部門比例」入口 → US-091（per-LIST_NO 比例）
- 「使用中」頁籤顯示 STATUS = 'active' 記錄；「已停用」頁籤顯示 STATUS = 'inactive' 記錄
- 月跑中資料鎖判斷：查詢 AssignmentRun 是否有 status = 'running' 記錄
- 預估客戶數量可由 US-071 的每日估算邏輯衍生（Stage 0 計算案件數量按鈕整合）

---

## 測試案例

### TC-070-01：正常顯示本月 Stage 清單

- **Given**：OBMLISTDF 中本月有 3 個 Stage 定義
- **When**：業務主管進入名單定義頁面
- **Then**：顯示 3 列，Stage 編號分別為 0、1、2，依序排列

### TC-070-02：展開 Stage 詳情

- **Given**：清單中 Stage 1 有 5 個篩選條件
- **When**：業務主管點擊 Stage 1
- **Then**：詳情區顯示 5 個條件，含欄位名稱、運算子（如 =、>=、IN）、條件值

### TC-070-03：無資料空白狀態（引導新增）

- **Given**：當月 OBMLISTDF 查無 STATUS = 'active' 資料
- **When**：頁面載入
- **Then**：顯示空白引導提示文字，含「新增名單定義」按鈕引導，不顯示錯誤訊息

### TC-070-04：月跑執行中按鈕全部停用

- **Given**：AssignmentRun status = 'running'
- **When**：業務主管進入名單定義清單頁
- **Then**：「新增名單定義」、各列「編輯」、各列「停用」按鈕均為 disabled，頁面頂部顯示橘色通知列

### TC-070-05：「已停用」頁籤查閱

- **Given**：OBMLISTDF 有 2 筆 STATUS = 'inactive' 的名單
- **When**：業務主管點擊「已停用」頁籤
- **Then**：顯示 2 筆停用名單，每列無「編輯」或「停用」按鈕

---

## 依賴關係

- **Blocked By**：US-001（登入驗證）
- **Blocks**：US-071（Stage 0 估算需要名單定義已就緒）、US-088（新增名單定義）、US-089（編輯名單定義）、US-090（停用名單定義）、US-091（per-LIST_NO 比例設定入口）、US-081（觸發月跑前需確認名單定義）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)
- **相關 Stories**：US-071（Stage 0 估算）、US-088（新增名單）、US-089（編輯名單）、US-090（停用名單）、US-091（per-LIST_NO 比例）、US-081（觸發月跑）
- **Reference**：`reference/TableSchema/OB/OBMLISTDF.sql`、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`
