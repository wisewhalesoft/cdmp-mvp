---
spec-id: F037
title: 發布 Pipeline 版本
feature-id: F037
source-story: US-050
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-23
status: Draft
---

# F037: 發布 Pipeline 版本

## 1. 功能摘要

提供 Admin 將狀態為 `testing` 的 Pipeline 版本正式發布為 `published`，補全版本生命週期 `draft -> testing -> published` 的最後一步。發布後 `EtlPipeline.version` 同步更新為該版本號，Pipeline 可被啟用（F031）投入排程自動執行。此功能提供兩個 UI 入口：版本管理頁面與 Pipeline 編輯器工具列。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 在 Pipeline 完成測試執行後，將該版本正式發布
**So that** 我能啟用 Pipeline 投入排程自動執行，確保只有經過驗證的版本才能被排程觸發

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標 Pipeline 存在且未被軟刪除（`deleted_at IS NULL`）
- 目標版本存在且 `pipeline_id` 與路徑參數一致
- 目標版本狀態為 `testing`（已透過 F030 測試執行成功，從 `draft` 升為 `testing`）

## 4. 驗收標準

### AC-1: 成功發布 testing 版本

- **Given** 一個版本狀態為 `testing` 的 Pipeline 版本（已完成至少一次成功的測試執行）
- **When** Admin 在版本管理頁面點擊該版本的「發布」圖示按鈕，並在確認對話框中點擊「確認發布」
- **Then** 該版本的 `status` 更新為 `published`；`EtlPipeline.version` 更新為該版本號；頁面顯示成功 Toast「版本已發布，Pipeline 現在可以啟用排程」

### AC-2: 發布後 Pipeline 可以被啟用

- **Given** 一個 Pipeline 已有至少一個 `published` 版本，Pipeline `status` 仍為 `draft`
- **When** Admin 前往 Pipeline 列表點擊「啟用」
- **Then** 啟用操作成功，Pipeline `status` 變為 `active`，不再出現 `PIPELINE_DRAFT_CANNOT_ENABLE` 錯誤

### AC-3: 阻止發布 draft 版本

- **Given** 一個版本狀態為 `draft` 的 Pipeline 版本
- **When** Admin 嘗試發布（UI 操作或直接呼叫 API）
- **Then** 系統回傳 HTTP 422，錯誤碼 `PIPELINE_PUBLISH_REQUIRES_TEST`，顯示「請先完成測試執行」

### AC-4: 確認對話框

- **Given** 版本管理頁面中有一個 `testing` 狀態的版本
- **When** Admin 點擊該版本的「發布」圖示按鈕（rocket icon）
- **Then** 系統顯示確認對話框，包含：版本號（如「確定要發布版本 v3 嗎？」）、影響說明（「發布後此版本將成為排程執行的版本。Pipeline 狀態將可設為啟用。」）、「取消」與「確認發布」兩個按鈕

### AC-5: draft 版本的發布按鈕為停用狀態

- **Given** 版本管理清單中有一個 `draft` 狀態的版本
- **When** Admin 查看操作欄
- **Then** 發布圖示按鈕顯示為 disabled，滑鼠移至其上顯示 tooltip「請先完成測試執行」

### AC-6: published 版本無法重複發布

- **Given** 一個已是 `published` 狀態的版本
- **When** Admin 嘗試再次對該版本呼叫發布 API
- **Then** 系統回傳 HTTP 422，錯誤碼 `PIPELINE_VERSION_ALREADY_PUBLISHED`，提示「此版本已發布」

### AC-7: 編輯器工具列發布按鈕

- **Given** Admin 在 Pipeline 編輯器頁面，當前版本狀態為 `testing`
- **When** Admin 點擊工具列中的「發布」按鈕，於確認對話框中確認
- **Then** 發布成功，工具列的版本狀態 Badge 即時更新為 `published`（綠色）

### AC-8: 發布中防止重複提交

- **Given** Admin 點擊「確認發布」後系統正在處理請求
- **When** 請求尚未完成
- **Then** 「確認發布」按鈕顯示 Loading spinner 且不可再次點擊

## 5. 主要流程

1. Admin 在版本管理頁面或編輯器工具列點擊「發布」按鈕
2. 系統顯示確認對話框，包含版本號與影響說明
3. Admin 點擊「確認發布」
4. 前端發送 `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish`
5. 後端驗證 Pipeline 存在且未被軟刪除
6. 後端驗證版本存在且 `pipeline_id` 匹配
7. 後端驗證版本狀態為 `testing`
8. 後端在同一 Transaction 中：更新 `EtlPipelineVersion.status = 'published'`；更新 `EtlPipeline.version = versionNumber`
9. 後端回傳 200 OK 與更新後的版本資訊
10. 前端顯示成功 Toast 並更新版本狀態 Badge

## 6. 替代流程

- **取消發布**：Admin 在確認對話框中點擊「取消」，對話框關閉，版本狀態不變
- **從編輯器發布**：流程與版本管理頁面相同，差異僅在 UI 入口位置與發布後的 Badge 更新

## 7. 邊界情況

- Pipeline 執行中（`status = running`）時發布：允許（發布操作與執行狀態無衝突）
- 舊的 `published` 版本：保留原狀態不變（歷史保存），不自動降級
- 同一 Pipeline 可存在多個 `published` 版本，排程以 `version` 欄位最大值（非 `created_at`）選取最新 published 版本
- 發布後 Pipeline `status` 不會自動變更；Admin 需另行執行 F031 啟用操作

## 8. API 規格

### PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish

**說明：** 將指定版本的狀態從 `testing` 變更為 `published`。無 Request Body。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Path Parameters:**

| 參數      | 型別 | 必填 | 說明                    |
|-----------|------|------|-------------------------|
| id        | UUID | 是   | Pipeline ID             |
| versionId | UUID | 是   | Pipeline 版本 ID        |

**Response -- 200 OK:**

```json
{
  "id": "uuid",
  "pipelineId": "uuid",
  "version": 3,
  "status": "published",
  "changeSummary": "string",
  "publishedAt": "ISO 8601"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                               | 說明                               |
|-------------|--------------------------------------|------------------------------------|
| 404         | PIPELINE_NOT_FOUND                   | Pipeline 不存在或已刪除            |
| 404         | PIPELINE_VERSION_NOT_FOUND           | 版本不存在或不屬於該 Pipeline      |
| 422         | PIPELINE_PUBLISH_REQUIRES_TEST       | 版本狀態為 `draft`，需先完成測試執行 |
| 422         | PIPELINE_VERSION_ALREADY_PUBLISHED   | 版本已是 `published` 狀態          |
| 403         | AUTH_FORBIDDEN                       | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING                   | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR                | 伺服器內部錯誤                     |

**後端實作要點：**

1. 驗證 Pipeline 存在且 `deleted_at IS NULL`
2. 驗證版本存在且 `pipeline_id` 匹配
3. 驗證 `EtlPipelineVersion.status === 'testing'`
   - 若為 `draft`：回傳 422 `PIPELINE_PUBLISH_REQUIRES_TEST`
   - 若為 `published`：回傳 422 `PIPELINE_VERSION_ALREADY_PUBLISHED`
4. 於同一 Transaction 中執行：
   - `EtlPipelineVersion.status = 'published'`
   - `EtlPipeline.version = version.version`（版本號碼）

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可執行版本發布 |
| BR-2 | 版本狀態流程為單向：`draft` -> `testing` -> `published`，不可逆向降級 |
| BR-3 | 僅 `testing` 狀態的版本可以被發布；`draft` 與 `published` 均不可 |
| BR-4 | 測試執行成功（F030）後版本自動從 `draft` 升為 `testing`，此為發布的前置條件 |
| BR-5 | 發布時同步更新 `EtlPipeline.version` 為該版本號（同一 Transaction） |
| BR-6 | 舊的 `published` 版本保留原狀態（歷史保存），不自動降級 |
| BR-7 | 發布後 Pipeline `status` 不自動變更；Admin 需另行執行 F031 啟用操作 |
| BR-8 | 排程引擎選取 published 版本時，以 `version` 欄位最大值為準（非 `created_at`） |

## 10. UI/UX 需求

### 入口一：版本管理頁面（`/etl-pipelines/:id/versions`）

版本清單每一列的操作欄根據版本狀態顯示對應按鈕：

- **`draft` 版本**：rocket icon 按鈕為 disabled 狀態，hover tooltip 顯示「請先完成測試執行」
- **`testing` 版本**：rocket icon 按鈕為可點擊狀態，hover 變色，點擊後開啟確認對話框
- **`published` 版本**：不顯示發布按鈕，改顯示回滾按鈕（history icon）

確認對話框內容：

- 標題：「確認發布版本」
- 圖示：綠色圓形背景的 rocket icon
- 內容：「確定要發布版本 vN 嗎？」；「發布後此版本將成為排程執行的版本。Pipeline 狀態將可設為啟用。」
- 按鈕：「取消」（灰色框線）、「確認發布」（綠色實心，確認中顯示 Loading spinner 且 disabled）

成功後 Toast 通知：

- 主標：「版本已發布」
- 副標：「vN 已發布，Pipeline 現在可以啟用排程」
- 自動 3 秒後消失

### 入口二：Pipeline 編輯器頁面（`/etl-pipelines/:id/editor`）

工具列新增「發布」按鈕：

- 位置：位於「儲存」按鈕右側
- 按鈕標籤：rocket icon + 「發布」文字
- 狀態邏輯：
  - 當前版本為 `testing`：可點擊，點擊後開啟確認對話框
  - 當前版本為 `draft`：disabled，tooltip「請先完成測試執行」
  - 當前版本為 `published`：隱藏或顯示為 disabled

頂部版本狀態 Badge：

- 發布成功後即時更新為 `vN (published)`，Badge 顏色由灰色（draft）或橘色（testing）改為綠色

## 11. 錯誤場景

| 場景                                     | 系統回應                                                       | 參考                                    |
|------------------------------------------|----------------------------------------------------------------|-----------------------------------------|
| 版本狀態為 `draft`（未測試）             | HTTP 422，錯誤碼 `PIPELINE_PUBLISH_REQUIRES_TEST`，「請先完成測試執行才能發布此版本」 | error-handling.md#etl-pipeline-errors    |
| 版本已是 `published`                     | HTTP 422，錯誤碼 `PIPELINE_VERSION_ALREADY_PUBLISHED`，「此版本已發布」               | error-handling.md#etl-pipeline-errors    |
| Pipeline 不存在（已軟刪除）              | HTTP 404，錯誤碼 `PIPELINE_NOT_FOUND`，「找不到指定的 Pipeline」                     | error-handling.md#etl-pipeline-errors    |
| 版本 ID 不屬於該 Pipeline                | HTTP 404，錯誤碼 `PIPELINE_VERSION_NOT_FOUND`，「找不到指定的版本」                  | error-handling.md#etl-pipeline-errors    |
| 非 Admin 角色嘗試操作                    | HTTP 403，錯誤碼 `AUTH_FORBIDDEN`，「您沒有權限執行此操作」                          | error-handling.md#auth-errors            |
| 未登入或 Token 無效                      | HTTP 401，錯誤碼 `AUTH_TOKEN_MISSING`，「認證資訊無效或已過期」                      | error-handling.md#auth-errors            |
| 網路錯誤 / 伺服器錯誤                    | HTTP 500，錯誤碼 `SYSTEM_INTERNAL_ERROR`，「系統發生非預期錯誤，請稍後再試」         | error-handling.md#system-errors          |

## 12. 相依性

- **F030（執行 Pipeline）**：測試執行成功後版本由 `draft` 升為 `testing`，為本功能的前置條件
- **F033（版本管理）**：版本清單頁面為本功能的主要 UI 入口；發布 API 端點已在 F033 定義，本 F037 為完整實作規格與商業邏輯驗證
- **F031（啟用／停用 Pipeline）**：發布後 Pipeline 才能通過 `PIPELINE_DRAFT_CANNOT_ENABLE` 驗證被啟用
- **F029（Pipeline 編輯器）**：編輯器工具列為本功能的第二 UI 入口
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- EtlPipeline 實體：參見 [data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- EtlPipelineVersion 實體：參見 [data-model.md#etl-pipeline-version-entity](../data-model.md#etl-pipeline-version-entity)

## 14. 與 F033 的關係說明

F033（Pipeline 版本管理）定義了版本管理的整體功能，包括版本清單、Diff 比對、回滾與發布流程的 API 端點。F037 聚焦於「發布」這一具體操作的完整規格，補充以下 F033 未涵蓋的細節：

- 新增錯誤碼 `PIPELINE_VERSION_ALREADY_PUBLISHED`（重複發布防護）
- 完整的確認對話框 UI/UX 規格
- 編輯器工具列的發布按鈕規格
- 發布中防止重複提交的 Loading 狀態
- 發布後 Pipeline 啟用流程的端到端驗證（AC-2）

## 15. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)、[data-model.md#etl-pipeline-version-entity](../data-model.md#etl-pipeline-version-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 相關功能：[F029](F029-pipeline-editor.md)、[F030](F030-execute-pipeline.md)、[F031](F031-toggle-pipeline.md)、[F033](F033-pipeline-version.md)
- 圖表：[diagrams/pipeline-version-states.md](../diagrams/pipeline-version-states.md)
- 原型：`prototypes/18-pipeline-editor.html`（編輯器工具列）、`prototypes/20-pipeline-versions.html`（版本管理頁，含 Publish Dialog）
