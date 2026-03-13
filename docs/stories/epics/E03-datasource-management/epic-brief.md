# Epic Brief：E03 — 資料來源管理

> **Epic ID**：E03
> **優先級**：P0（Critical）
> **階段**：Phase 1（MVP）
> **Stories 數量**：6

## Epic 目標

讓 Admin 能夠在 CDMP 平台內設定、管理與監控資料庫連線（MySQL、PostgreSQL、SQL Server），提供完整的 CRUD 操作、連線測試，以及連線健康狀態監控功能。

資料來源是 CDMP 平台的核心基礎，所有後續的資料治理功能皆依賴正確設定且可存取的資料庫連線。連線憑證的安全儲存是此 Epic 的核心安全需求。

## User Stories

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-020 | 新增資料來源 | Must Have | [US-020-add-datasource.md](US-020-add-datasource.md) |
| US-021 | 查看資料來源清單 | Must Have | [US-021-view-datasource-list.md](US-021-view-datasource-list.md) |
| US-022 | 編輯資料來源 | Must Have | [US-022-edit-datasource.md](US-022-edit-datasource.md) |
| US-023 | 刪除資料來源 | Should Have | [US-023-delete-datasource.md](US-023-delete-datasource.md) |
| US-024 | 測試連線 | Must Have | [US-024-test-datasource-connection.md](US-024-test-datasource-connection.md) |
| US-025 | 狀態監控儀表板 | Should Have | [US-025-datasource-status-dashboard.md](US-025-datasource-status-dashboard.md) |

## 依賴關係

- **封鎖下游**：無（此為 MVP 最終 Epic）
- **依賴**：E01（Admin 必須完成驗證才能管理資料來源）
- **NFR 關聯**：NFR-001（資料庫憑證必須加密儲存）、NFR-002（連線測試逾時與儀表板效能需求）

## 成功標準

- Admin 能夠新增包含所有必要參數的資料庫連線
- Admin 能夠以清單或卡片格式查看所有資料來源
- Admin 能夠編輯與刪除現有資料來源
- Admin 能夠測試任何已設定資料來源的連線能力
- 儀表板提供所有資料來源的即時健康狀態總覽
- 資料庫憑證以安全加密方式儲存

## 待解決問題

- [x] 資料來源刪除應為軟刪除（soft-delete）還是硬刪除（hard-delete）？ → **軟刪除，設定 `deleted_at` 時間戳記，從清單排除但資料保留於資料庫中可供復原**
- [x] 自動健康檢查應以多高的頻率執行？ → **每 30 分鐘自動執行一次，結果更新至儀表板**
- [x] MVP 是否需要支援連線池（Connection Pooling）設定？ → **不需要，MVP 連線使用頻率低（手動測試 + 每 30 分鐘健康檢查），延後至有資料同步排程需求時再引入**
