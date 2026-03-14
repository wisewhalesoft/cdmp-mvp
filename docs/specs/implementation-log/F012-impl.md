# F012: 查看資料來源清單 — 實作紀錄

## 實作日期
2026-03-14

## 變更檔案

| 檔案 | 類型 | 說明 |
|------|------|------|
| `packages/shared/src/index.ts` | modified | 新增 `DatasourceStatus`, `DatasourceListQuery`, `DatasourceListItem`, `DatasourceListResponse` 型別 |
| `apps/api/src/modules/datasource/dto/list-datasource.dto.ts` | new | 查詢參數 DTO（分頁、搜尋、類型/狀態篩選） |
| `apps/api/src/modules/datasource/datasource.service.ts` | modified | 新增 `findAll` 方法（QueryBuilder + 分頁 + 篩選 + 排序） |
| `apps/api/src/modules/datasource/datasource.controller.ts` | modified | 新增 `GET /api/v1/datasources` 路由 |
| `apps/api/src/modules/datasource/datasource.service.spec.ts` | modified | 新增 7 個 findAll 單元測試 |
| `apps/api/test/datasource.e2e-spec.ts` | modified | 新增 8 個 F012 E2E 測試 |
| `apps/web/src/api/datasources.ts` | modified | 新增 `getDatasources` API 函式 |
| `apps/web/src/pages/datasources/datasource-list-page.tsx` | new | 資料來源清單頁面（表格/卡片雙模式） |
| `apps/web/src/pages/datasources/__tests__/datasource-list-page.test.tsx` | new | 17 個前端單元測試 |
| `apps/web/src/App.tsx` | modified | 新增 `/datasources` 路由 |

## API 規格

### GET /api/v1/datasources

**Query Parameters:**
| 參數 | 類型 | 預設 | 說明 |
|------|------|------|------|
| page | number | 1 | 頁碼 |
| limit | number | 20 | 每頁筆數 (max 100) |
| search | string | - | 名稱模糊搜尋 (case-insensitive) |
| type | string | - | mysql / postgresql / sqlserver |
| status | string | - | connected / disconnected / unknown |

**Response:**
```json
{
  "data": [{ "id", "name", "type", "host", "port", "databaseName", "username", "description", "status", "lastTestedAt", "createdAt", "updatedAt" }],
  "pagination": { "page", "limit", "total", "totalPages" }
}
```

## 測試結果

- API Unit Tests: 85 passed (含 10 個 datasource service tests)
- API E2E Tests: 97 passed (含 8 個 F012 tests + 11 個 F011 tests)
- Web Tests: 206 passed (含 17 個 datasource list page tests)

## 設計決策

1. **分頁格式**: 採用 `pagination` 物件結構 `{ page, limit, total, totalPages }`，與 F005 的 flat 結構不同，提供更好的語義化
2. **操作欄預留**: 表格操作欄 (編輯/測試連線/刪除) 目前為 disabled placeholder，待 F013/F014/F015 實作時啟用
3. **類型 Badge 顏色**: MySQL=橘色, PostgreSQL=藍色, SQL Server=紫色，與原型一致
4. **狀態 Badge**: connected=綠色, disconnected=紅色, unknown=灰色
5. **檢視模式**: 列表/卡片雙模式，偏好設定存於 localStorage (`datasource-view-mode`)
6. **不含頁籤**: F016 (狀態監控) 為 P1，本次不實作頁籤切換
