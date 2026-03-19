# US-046：Pipeline 版本管理

> **Story ID**：US-046
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Should Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** Admin（管理者）
**I want** 管理 Pipeline 的版本歷史，包括查看差異、回滾與發布流程
**So that** 我能安全地迭代 Pipeline 設定，並確保只有經過測試驗證的版本才會被排程執行

---

## 驗收標準

### AC-1：版本歷史清單
- **Given** 一個已有多個版本的 Pipeline
- **When** 我進入版本管理頁面
- **Then** 系統顯示版本歷史清單，包含版號、時間、變更摘要、狀態（draft/testing/published）、建立者

### AC-2：版本 Diff 比對視圖
- **Given** 一個有兩個以上版本的 Pipeline
- **When** 我選擇兩個版本進行比對
- **Then** 系統以左右對照方式顯示節點的增刪改差異

### AC-3：回滾到指定版本
- **Given** 一個有歷史版本的 Pipeline
- **When** 我選擇某個舊版本並點擊「回滾」
- **Then** 系統建立一個新版本，內容複製自該舊版本（非覆蓋），狀態為 draft

### AC-4：發布版本
- **Given** 一個狀態為 testing 且已通過測試執行的版本
- **When** 我點擊「發布」
- **Then** 該版本狀態變為 published，成為排程執行的版本

### AC-5：發布前需通過測試執行
- **Given** 一個狀態為 draft 或 testing 但尚未通過測試的版本
- **When** 我嘗試發布該版本
- **Then** 系統阻止發布並提示「請先完成測試執行」

### AC-6：僅 published 版本被排程執行
- **Given** 一個 Pipeline 有多個版本
- **When** 排程引擎觸發執行
- **Then** 系統使用最新的 published 版本執行，draft 和 testing 版本不會被執行

---

## Technical Notes

- 端點：
  - `GET /api/v1/etl/pipelines/:id/versions` — 版本列表
  - `GET /api/v1/etl/pipelines/:id/versions/:versionId` — 版本詳情
  - `GET /api/v1/etl/pipelines/:id/versions/diff?from=1&to=2` — 版本 Diff
  - `POST /api/v1/etl/pipelines/:id/versions/:versionId/rollback` — 回滾
  - `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish` — 發布
- Version List Response：
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "version": 1,
        "status": "published",
        "changeSummary": "初始版本",
        "createdBy": "string",
        "createdAt": "ISO8601"
      }
    ]
  }
  ```
- Diff Response：
  ```json
  {
    "from": 1,
    "to": 2,
    "changes": {
      "nodesAdded": [],
      "nodesRemoved": [],
      "nodesModified": [
        {
          "nodeId": "node-2",
          "field": "data.strategy",
          "oldValue": "default_value",
          "newValue": "remove_row"
        }
      ],
      "edgesAdded": [],
      "edgesRemoved": []
    }
  }
  ```
- Rollback Response：`201 Created`，回傳新建的版本物件
- 版本狀態流程：`draft` → `testing` → `published`
- 回滾產生的新版本初始狀態為 `draft`

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 查看有多個版本的 Pipeline 版本清單 | 顯示所有版本，含版號、時間、摘要、狀態、建立者 |
| 2 | 選擇版本 1 和版本 2 進行 Diff 比對 | 左右對照顯示節點增刪改差異 |
| 3 | 回滾到版本 1 | 建立新版本（如版本 3），內容與版本 1 相同，狀態為 draft |
| 4 | 發布已通過測試的 testing 版本 | 版本狀態變為 published |
| 5 | 嘗試發布未通過測試的版本 | 系統阻止發布並提示需先完成測試 |
| 6 | 排程觸發執行 Pipeline | 使用最新 published 版本執行 |
| 7 | 查看只有一個版本的 Pipeline 版本清單 | 正常顯示，Diff 功能不可用（需至少兩個版本） |

---

## 依賴關係

- **Blocked By**：US-042（需有 Pipeline 定義）
- **Blocks**：無

---

## Definition of Done

- [ ] 版本列表 API 實作完成並通過單元測試
- [ ] 版本詳情 API 實作完成並通過單元測試
- [ ] 版本 Diff API 實作完成並通過單元測試
- [ ] 回滾 API 實作完成並通過單元測試
- [ ] 發布 API 實作完成並通過單元測試（含測試通過檢查）
- [ ] 前端版本歷史清單頁面實作完成
- [ ] 前端 Diff 比對視圖實作完成（左右對照）
- [ ] 前端回滾確認流程實作完成
- [ ] 排程引擎僅使用 published 版本
- [ ] E2E 測試通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
