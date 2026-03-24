---
type: implementation-log
feature_id: F015
feature_name: 測試連線 - Bug 修復：連線狀態未更新
status: complete
last_updated: 2026-03-24
---

# F015: 測試連線狀態更新 Bug 修復

## Bug 描述

在新增/編輯資料來源的表單中，點擊「測試連線」按鈕執行成功後，資料來源的連線狀態（connection status）沒有被更新。

## 根本原因分析

1. **後端 `TestConnectionResponse` 缺少 `status` 和 `lastTestedAt` 欄位**：`POST /api/datasources/:id/test` API 回應只包含 `{success, message, responseTime}`，不包含更新後的 `status` 和 `lastTestedAt`。前端必須自行推斷狀態，無法從 API 取得權威性的狀態資訊。

2. **前端編輯頁面未追蹤或顯示連線狀態**：`EditDatasourcePage` 的 `handleTestConnection` 僅顯示 Toast 訊息，不更新任何本地狀態，也不顯示連線狀態指示器。

3. **前端清單頁面使用推斷式狀態更新**：`DatasourceListPage` 的 `handleTestConnection` 根據 `result.success` 推斷狀態（optimistic update），而非使用後端回傳的權威值。

## 修復方案

### 後端
- 在 `TestConnectionResult` 介面新增 `status` 和 `lastTestedAt` 欄位
- 在 `testConnection` service 方法中，於回傳值加入已更新的 `status` 和 `lastTestedAt`（ISO 8601 格式）

### 共用套件
- 更新 `TestConnectionResponse` 介面，新增 `status: DatasourceStatus` 和 `lastTestedAt: string`

### 前端
- **編輯頁面**：新增 `connectionStatus` 狀態，載入時初始化為資料來源的現有狀態，測試連線後從 API 回應更新，並在表單中顯示狀態標籤
- **清單頁面**：改用 API 回應中的 `result.status` 和 `result.lastTestedAt`（權威值），取代原本的推斷式更新

## 測試結果摘要

| Scenario | Description | Status |
|----------|------------|--------|
| Unit: MySQL 連線成功 | 回傳 status=connected, lastTestedAt | PASS |
| Unit: 主機不可達 | 回傳 status=disconnected | PASS |
| E2E: 連線成功回應 | 回應包含 status=connected, lastTestedAt | PASS |
| E2E: 連線失敗回應 | 回應包含 status=disconnected, lastTestedAt | PASS |
| Frontend: 測試成功後更新狀態 | 編輯頁面顯示 connected 狀態 | PASS |
| Frontend: 測試失敗後更新狀態 | 編輯頁面顯示 disconnected 狀態 | PASS |
| 全部後端 Unit | 237 tests | PASS |
| 全部後端 E2E | 398 tests | PASS |
| 全部前端 | 506 tests | PASS |

## 變更檔案

| File Path | Change Type | Description |
|-----------|------------|-------------|
| packages/shared/src/index.ts | modified | `TestConnectionResponse` 新增 `status`, `lastTestedAt` 欄位 |
| apps/api/src/modules/datasource/datasource.service.ts | modified | `TestConnectionResult` 新增欄位，`testConnection` 回傳 `status`, `lastTestedAt` |
| apps/api/src/modules/datasource/datasource.service.spec.ts | modified | 新增 `status`, `lastTestedAt` 斷言 |
| apps/api/test/datasource.e2e-spec.ts | modified | E2E 測試新增 `status`, `lastTestedAt` 驗證 |
| apps/web/src/pages/datasources/edit-datasource-page.tsx | modified | 新增 `connectionStatus` 狀態、狀態標籤 UI、測試後更新狀態 |
| apps/web/src/pages/datasources/datasource-list-page.tsx | modified | 改用 API 回應的權威 `status`/`lastTestedAt` |
| apps/web/src/pages/datasources/__tests__/edit-datasource-page.test.tsx | modified | 新增 2 個狀態更新測試，更新 mock 回傳值 |
| apps/web/src/pages/datasources/__tests__/datasource-list-page.test.tsx | modified | 更新 mock 回傳值 |
| apps/web/src/pages/datasources/__tests__/dashboard-tab.test.tsx | modified | 更新 mock 回傳值 |

## 架構決策

- 選擇在 API 回應中加入 `status` 和 `lastTestedAt` 而非讓前端推斷，確保所有消費者取得一致的權威狀態
- 編輯頁面的狀態標籤使用與清單頁面相同的視覺樣式，保持 UI 一致性
