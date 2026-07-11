# US-082：查看分派執行進度

> **Story ID**：US-082
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 在月名單分派執行期間即時查看各 Stage 的執行進度
**So that** 了解月名單分派目前跑到哪個步驟、預估完成時間，不需要不斷詢問 IT

---

## 驗收標準

### AC-1：顯示目前月名單分派執行狀態

- **Given** 月名單分派已觸發（status = 'running'）
- **When** 業務主管進入執行進度頁
- **Then** 顯示目前月名單分派的資訊：run_id、作業年月、觸發時間、目前狀態、已執行時間
- **And** 顯示各 Stage 的執行進度列表（Stage 1 ~ Stage 4），每個 Stage 顯示：Stage 名稱、狀態（pending / running / completed / failed / skipped）、開始時間、結束時間（完成後）、處理筆數（完成後）

### AC-2：進度即時刷新

- **Given** 進度頁已開啟，月名單分派正在執行
- **When** 後端 Stage 狀態更新
- **Then** 頁面每 5 秒自動重新整理進度（或透過 polling API），無需業務主管手動重新整理

### AC-3：月名單分派完成後顯示結果入口

- **Given** 月名單分派所有 Stage 均已完成（status = 'completed'）
- **When** 進度頁偵測到完成狀態
- **Then** 顯示「執行完成」提示，並提供快速連結「查看結果摘要」（跳轉至 US-083）與「匯出結果」（跳轉至 US-084）

### AC-4：月名單分派失敗顯示錯誤

- **Given** 月名單分派某 Stage 失敗（status = 'failed'）
- **When** 進度頁偵測到失敗狀態
- **Then** 顯示失敗提示，標示失敗的 Stage，並顯示 error_message 內容
- **And** 提供「重新觸發」按鈕（業務主管修正問題後可重試）

---

## 技術備註

- 進度資料來源：AssignmentRun 表（整體狀態）+ AssignmentRunStageLog 表（各 Stage 進度）
- 建議採用輪詢 API（GET /api/v1/assignment/runs/:run_id/progress）每 5 秒查詢一次，避免 WebSocket 複雜度
- 頁面在月名單分派完成後停止輪詢

---

## 測試案例

### TC-082-01：顯示執行中狀態

- **Given**：AssignmentRun status = 'running'，Stage 1 completed，Stage 2 running
- **When**：業務主管進入進度頁
- **Then**：Stage 1 顯示綠色勾選，Stage 2 顯示轉動圖示，Stage 3/4 顯示 pending

### TC-082-02：完成後顯示結果入口

- **Given**：AssignmentRun status = 'completed'
- **When**：進度頁偵測完成
- **Then**：顯示「執行完成」提示，出現「查看結果摘要」與「匯出結果」連結

### TC-082-03：失敗顯示錯誤訊息

- **Given**：Stage 2 失敗，error_message = '計分資料異常：維度 COL_001 無分數設定'
- **When**：進度頁偵測失敗
- **Then**：Stage 2 標記為失敗，顯示錯誤訊息內容

---

## 依賴關係

- **Blocked By**：US-081（月名單分派已觸發）
- **Blocks**：（無，進度頁為獨立查看功能）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 輪詢機制測試（5 秒間隔）
- [ ] 完成 / 失敗狀態偵測測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-081（觸發月名單分派）、US-083（結果摘要）、US-084（匯出結果）
