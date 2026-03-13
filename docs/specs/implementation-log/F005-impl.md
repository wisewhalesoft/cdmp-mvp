---
feature_id: F005
feature_name: 查看帳號清單
status: completed
last_updated: 2026-03-13
---

# F005: 查看帳號清單 — 實作日誌

## 實作範圍

Admin 透過 `GET /api/v1/accounts` 取得帳號分頁清單，支援搜尋（大小寫不敏感）、角色篩選、狀態篩選。前端實作完整的帳號清單表格，含搜尋列、篩選下拉、分頁控制與空狀態顯示。

## 測試結果摘要

| 場景 ID | 說明 | 狀態 |
|---------|------|------|
| TS-F005-001 | 載入預設帳號清單 | PASS |
| TS-F005-002 | 依關鍵字搜尋（大小寫不敏感） | PASS |
| TS-F005-003 | 依角色篩選 | PASS |
| TS-F005-004 | 組合搜尋與篩選 | PASS |
| TS-F005-005 | 非 Admin 存取帳號清單 | PASS |
| TS-F005-006 | 搜尋無結果 | PASS |
| TS-F005-007 | 分頁超出總頁數 | PASS |

## 變更檔案

### Shared（packages/shared）

| 檔案 | 變更 |
|------|------|
| `src/index.ts` | 新增 `AccountListQuery`、`AccountListItem`、`AccountListResponse` 型別 |

### Backend（apps/api）

| 檔案 | 變更 |
|------|------|
| `src/modules/accounts/dto/list-accounts-query.dto.ts` | **新建** — 查詢參數 DTO（page, limit, search, role, status） |
| `src/modules/accounts/accounts.service.ts` | 新增 `findAll()` 方法（QueryBuilder 搜尋/篩選/排序/分頁） |
| `src/modules/accounts/accounts.controller.ts` | 更新 `GET /` 端點，注入 Query DTO 取代 stub |
| `test/accounts-list.e2e-spec.ts` | **新建** — 8 個 E2E 測試（7 個 spec 場景 + 1 個 limit 參數） |

### Frontend（apps/web）

| 檔案 | 變更 |
|------|------|
| `src/api/accounts.ts` | 新增 `getAccounts()` API 函式 |
| `src/pages/accounts/account-list-page.tsx` | 全面重構：實作完整清單表格、搜尋（debounce 300ms）、角色/狀態篩選、分頁、空狀態、Loading 狀態 |
| `src/pages/accounts/__tests__/account-list-page.test.tsx` | **新建** — 20 個元件測試 |

## 測試統計

| 層級 | 通過 | 總計 |
|------|------|------|
| Backend 單元測試 | 37 | 37 |
| Backend E2E 測試 | 35 | 35 |
| Frontend 測試 | 77 | 77 |

## 設計決策

1. **LOWER() + LIKE 替代 ILIKE**：SQLite 不支援 ILIKE，使用 `LOWER(column) LIKE` 確保 E2E 測試（better-sqlite3 in-memory）與 PostgreSQL 相容
2. **class-transformer @Type(() => Number)**：Query 參數預設為 string，需要型別轉換才能讓 class-validator 的 @IsInt() 正確驗證
3. **Debounce 300ms**：搜尋輸入使用 300ms debounce 避免過多 API 請求
4. **前端測試使用 vi.useFakeTimers()**：統一使用 fake timers 管理 debounce 行為，搭配 `fireEvent` 避免 userEvent 在 fake timer 下的 timeout 問題
5. **操作按鈕為 stub**：編輯/停用/變更角色/重設密碼按鈕已渲染但無功能，屬 F006/F007/F008/F010 範疇
6. **建立帳號整合**：建立成功後自動刷新清單（移除 F004 留下的 TODO 註解）
