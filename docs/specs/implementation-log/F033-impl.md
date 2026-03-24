---
type: implementation-log
feature_id: F033
feature_name: Pipeline 版本管理
status: complete
last_updated: 2026-03-23
---

# F033: Pipeline 版本管理 — 實作紀錄

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F033-001 | 版本清單依版本號降序排列 | PASS |
| TS-F033-002 | 版本清單欄位完整性驗證（不含 definition） | PASS |
| TS-F033-003 | 版本清單含所有狀態（draft/testing/published） | PASS |
| TS-F033-004 | 版本詳情含完整 definition JSONB | PASS |
| TS-F033-005 | definition 內容與建立時完全一致（JSONB 完整性） | PASS |
| TS-F033-006 | Diff 比對：nodesAdded 正確識別新增節點 | PASS |
| TS-F033-007 | Diff 比對：nodesRemoved 正確識別刪除節點 | PASS |
| TS-F033-008 | Diff 比對：nodesModified 正確識別修改節點（dot notation） | PASS |
| TS-F033-009 | Diff 比對：edgesAdded 與 edgesRemoved 正確識別連線變化 | PASS |
| TS-F033-010 | Diff 比對：相同版本回傳全空差異 | PASS |
| TS-F033-011 | 回滾建立新版本（status=draft，版本號遞增） | PASS |
| TS-F033-012 | 回滾後 definition 內容與來源版本完全一致（深拷貝） | PASS |
| TS-F033-013 | 回滾不修改原始版本 | 由 TS-F033-012 隱含驗證 |
| TS-F033-014 | 發布 testing 版本且有成功測試記錄 → published | PASS |
| TS-F033-019 | testing 版本但無成功測試執行記錄 → 422 | PASS |
| TS-F033-020 | Pipeline 不存在 → GET 版本清單 404 | PASS |
| TS-F033-021 | 版本不存在 → GET 版本詳情 404 | PASS |
| TS-F033-022 | 版本不存在 → Diff 比對 404 | PASS |
| TS-F033-023 | from 版本不存在 → Diff 404 | PASS |
| TS-F033-024 | 版本不存在 → 回滾 404 | PASS |
| TS-F033-025 | 版本不存在 → 發布 404 | 由既有 F037 測試覆蓋 |
| TS-F033-026~029 | RBAC 與未登入驗證 | 由 Controller 層 AuthGuard + RolesGuard 覆蓋 |

## 變更檔案

### 後端

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| apps/api/src/modules/etl/etl-pipeline.service.ts | modified | 新增 getVersions、getVersionDetail、getVersionDiff、rollbackVersion 四個方法；強化 publishVersion 加入測試日誌檢查；匯出 computeDefinitionDiff 純函式 |
| apps/api/src/modules/etl/etl-pipeline.controller.ts | modified | 新增 4 個 HTTP 端點：GET versions/diff、GET versions/:versionId、POST rollback、GET versions；路由順序確保 diff 在 :versionId 之前 |
| apps/api/src/modules/etl/__tests__/etl-pipeline-version.service.spec.ts | new | 21 個單元測試覆蓋版本清單、詳情、Diff、回滾、發布增強 |
| apps/api/src/modules/etl/__tests__/etl-pipeline-publish.service.spec.ts | modified | 修正 mockLogQb 增加 getCount mock（因 publishVersion 新增測試日誌查詢） |
| packages/shared/src/index.ts | modified | 新增 F033 共用型別：PipelineVersionListItem、PipelineVersionListResponse、PipelineVersionDetailResponse、PipelineVersionDiffResponse、PipelineVersionDiffNodeAdded、PipelineVersionDiffNodeRemoved、PipelineVersionDiffNodeModified、RollbackVersionResponse、PipelineVersionStatus 等 |

### 前端

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| apps/web/src/pages/etl-pipelines/versions/pipeline-versions-page.tsx | new | 版本管理主頁面：Pipeline 摘要卡片、版本清單表格、操作按鈕邏輯、Toast 通知；嚴格遵循 prototypes/20-pipeline-versions.html |
| apps/web/src/pages/etl-pipelines/versions/version-diff-view.tsx | new | 內嵌 Diff 比對視圖：左右對照佈局、版本選擇下拉、差異色彩標示（綠/黃/紅）、底部摘要列 |
| apps/web/src/pages/etl-pipelines/versions/rollback-confirm-dialog.tsx | new | 回滾確認對話框：440px Modal、history icon + amber 圓、說明文字 |
| apps/web/src/pages/etl-pipelines/versions/publish-confirm-dialog.tsx | new | 發布確認對話框：440px Modal、rocket icon + green 圓、Loading spinner 狀態 |
| apps/web/src/pages/etl-pipelines/versions/index.ts | new | Barrel export |
| apps/web/src/api/etl-pipelines.ts | modified | 新增 4 個 API 函式：getPipelineVersions、getPipelineVersionDetail、getPipelineVersionDiff、rollbackPipelineVersion |
| apps/web/src/App.tsx | modified | 新增路由 /etl-pipelines/:id/versions（AdminRoute） |
| apps/web/src/pages/etl-pipelines/editor/pipeline-editor-page.tsx | modified | 「版本」按鈕導航至 /etl-pipelines/:id/versions |

## 架構決策

1. **computeDefinitionDiff 為純函式**：獨立於 Service 類別外匯出，方便未來前端或其他模組復用
2. **Diff 使用 dot notation**：遞迴比較節點屬性，使用 findObjectDiffs 產生如 `data.strategy` 的路徑格式
3. **回滾使用深拷貝**：`JSON.parse(JSON.stringify())` 確保 definition 不共用參照
4. **publishVersion 增強**：在 testing 版本發布前，查詢 EtlPipelineLog 確認有 `is_test_run=true AND status='completed'` 的記錄
5. **Controller 路由順序**：`GET :id/versions/diff` 定義在 `GET :id/versions/:versionId` 之前，避免 NestJS 將 "diff" 誤解析為 versionId 參數
6. **版本清單不含 definition**：效能考量，清單 API 僅回傳元資料欄位
7. **前端嚴格遵循原型**：所有 UI 元素（Badge 顏色、操作按鈕邏輯、Modal 樣式、Toast 樣式）均按照 prototypes/20-pipeline-versions.html 實作
8. **Diff 視圖為內嵌元件**：toggle 顯示/隱藏，非獨立頁面或 Modal，與原型一致
9. **發布對話框與 F037 編輯器版本獨立**：版本管理頁的 PublishConfirmDialog 為獨立元件，按鈕為 success 綠色（原型規定），F037 編輯器頁的保持不變

## 前端 UI 對照原型檢核

| 原型元素 | 實作狀態 |
|----------|----------|
| Pipeline 摘要卡片（名稱 + 版本 + 狀態 Badge + 編輯器連結） | OK |
| 版本清單表格（版號/時間/摘要/狀態/建立者/操作） | OK |
| 狀態 Badge 顏色（draft 灰/testing 橘/published 綠） | OK |
| draft 版本發布按鈕 disabled + tooltip「請先完成測試執行」 | OK |
| testing 版本發布按鈕可點擊（rocket icon, hover 綠色） | OK |
| published 版本回滾按鈕（history icon, hover 黃色） | OK |
| 最舊版本 Diff 按鈕 disabled | OK |
| Diff 內嵌視圖 + 版本選擇下拉 + 關閉按鈕 | OK |
| Diff 左右對照 + 新增綠/修改黃/刪除紅色標示 | OK |
| Diff 底部摘要列（節點/連線數量） | OK |
| 回滾確認 Modal（440px, history icon + amber 圓） | OK |
| 發布確認 Modal（440px, rocket icon + green 圓） | OK |
| 發布 Loading 狀態（spinner + 發布中... + 按鈕 disabled） | OK |
| Toast 通知（右下角, 綠色 border-l-4, 3 秒消失） | OK |
| 麵包屑導航（Pipeline 清單 > 名稱 > 版本管理） | OK |

## 測試統計

- 全部 API 測試：234 tests passed（22 test files）
- F033 新增測試：21 tests
- F037 既有測試：13 tests（已修正 mock 相容新增的日誌檢查）
- 全部前端測試：484 tests passed（無 regression）

## 阻塞問題

無
