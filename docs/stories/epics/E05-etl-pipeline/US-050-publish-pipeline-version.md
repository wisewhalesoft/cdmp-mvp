# US-050：發布 Pipeline 版本

> **Story ID**：US-050
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 在 Pipeline 完成測試執行後，將該版本正式發布
**So that** 我能啟用 Pipeline 投入排程自動執行，確保只有經過驗證的版本才能被排程觸發

---

## 背景說明

目前系統中 `EtlPipelineVersion.status` 的生命週期為 `draft → testing → published`，但：

1. F030（測試執行成功）會自動將版本狀態從 `draft` 升為 `testing`
2. 沒有任何 API 或 UI 可以將版本狀態改為 `published`
3. 因此 F031（啟用 Pipeline）永遠被 `PIPELINE_DRAFT_CANNOT_ENABLE` 阻擋

本 Story 補全這個缺口，實作「發布」操作。

---

## 驗收標準

### AC-1：成功發布 testing 版本

- **Given** 一個版本狀態為 `testing` 的 Pipeline 版本（已完成至少一次成功的測試執行）
- **When** Admin 在版本管理頁面點擊該版本的「發布」圖示按鈕，並在確認對話框中點擊「確認發布」
- **Then** 該版本的 `status` 更新為 `published`；`EtlPipeline.version` 更新為該版本號；頁面顯示成功 Toast「版本已發布，Pipeline 現在可以啟用排程」

### AC-2：發布後 Pipeline 可以被啟用

- **Given** 一個 Pipeline 已有至少一個 `published` 版本，Pipeline `status` 仍為 `draft`
- **When** Admin 前往 Pipeline 列表點擊「啟用」
- **Then** 啟用操作成功，Pipeline `status` 變為 `active`，不再出現 `PIPELINE_DRAFT_CANNOT_ENABLE` 錯誤

### AC-3：阻止發布 draft 版本

- **Given** 一個版本狀態為 `draft` 的 Pipeline 版本
- **When** Admin 嘗試發布（UI 操作或直接呼叫 API）
- **Then** 系統回傳 HTTP 422，錯誤碼 `PIPELINE_PUBLISH_REQUIRES_TEST`，顯示「請先完成測試執行」

### AC-4：確認對話框在點擊「發布」按鈕後出現

- **Given** 版本管理頁面中有一個 `testing` 狀態的版本
- **When** Admin 點擊該版本的「發布」圖示按鈕（rocket icon）
- **Then** 系統顯示確認對話框，包含：版本號（如「確定要發布版本 v3 嗎？」）、影響說明（「發布後此版本將成為排程執行的版本。Pipeline 狀態將可設為啟用。」）、「取消」與「確認發布」兩個按鈕

### AC-5：draft 版本的發布按鈕為停用狀態

- **Given** 版本管理清單中有一個 `draft` 狀態的版本
- **When** Admin 查看操作欄
- **Then** 發布圖示按鈕顯示為 disabled，滑鼠移至其上顯示 tooltip「請先完成測試執行」

### AC-6：published 版本無法重複發布

- **Given** 一個已是 `published` 狀態的版本
- **When** Admin 嘗試再次對該版本呼叫發布 API
- **Then** 系統回傳 HTTP 422，錯誤碼 `PIPELINE_VERSION_ALREADY_PUBLISHED`，提示「此版本已發布」

### AC-7：編輯器工具列發布按鈕

- **Given** Admin 在 Pipeline 編輯器頁面，當前版本狀態為 `testing`
- **When** Admin 點擊工具列中的「發布」按鈕，於確認對話框中確認
- **Then** 發布成功，工具列的版本狀態 Badge 即時更新為 `published`（綠色）

### AC-8：發布中防止重複提交

- **Given** Admin 點擊「確認發布」後系統正在處理請求
- **When** 請求尚未完成
- **Then** 「確認發布」按鈕顯示 Loading spinner 且不可再次點擊

---

## 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可執行版本發布 |
| BR-2 | 版本狀態流程為單向：`draft` → `testing` → `published`，不可逆向降級 |
| BR-3 | 僅 `testing` 狀態的版本可以被發布 |
| BR-4 | 測試執行成功（F030 AC-7）後版本自動從 `draft` 升為 `testing`，此為發布的前置條件 |
| BR-5 | 發布時同步更新 `EtlPipeline.version` 為新版本號 |
| BR-6 | 舊的 `published` 版本保留原狀態（歷史保存），不自動降級 |
| BR-7 | 發布後 Pipeline `status` 不會自動變更；Admin 需另行執行 F031 啟用操作 |

---

## 錯誤場景與邊界條件

| 場景 | 預期行為 |
|------|---------|
| 版本狀態為 `draft`（未測試） | 拒絕發布，HTTP 422，Toast 顯示「請先完成測試執行才能發布此版本」 |
| 版本已是 `published` | 拒絕發布，HTTP 422，Toast 顯示「此版本已發布」 |
| Pipeline 不存在（已軟刪除） | HTTP 404，Toast 顯示「找不到指定的 Pipeline」 |
| 版本 ID 不屬於該 Pipeline | HTTP 404，Toast 顯示「找不到指定的版本」 |
| 非 Admin 角色嘗試操作 | HTTP 403，Toast 顯示「您沒有權限執行此操作」 |
| 網路錯誤 / 伺服器錯誤 | HTTP 500，Toast 顯示「系統發生非預期錯誤，請稍後再試」 |
| Pipeline 執行中（`status = running`）時發布 | 允許（發布與執行狀態無衝突） |

---

## UI/UX 需求描述

### 入口一：版本管理頁面（`/etl-pipelines/:id/versions`）

版本清單每一列的操作欄根據版本狀態顯示對應按鈕：

- **`draft` 版本**：rocket icon 按鈕為 disabled 狀態（淺灰色、cursor-not-allowed），hover tooltip 顯示「請先完成測試執行」
- **`testing` 版本**：rocket icon 按鈕為可點擊狀態，hover 顯示綠色（`hover:text-success`），點擊後開啟確認對話框
- **`published` 版本**：不顯示發布按鈕，改顯示回滾按鈕（history icon）

確認對話框設計（參考原型 `20-pipeline-versions.html` Publish Dialog，第 271-295 行）：

- 標題：「確認發布版本」
- 圖示：綠色圓形背景的 rocket icon
- 內容：「確定要發布版本 vN 嗎？」；「發布後此版本將成為排程執行的版本。Pipeline 狀態將可設為啟用。」
- 按鈕：「取消」（灰色框線）、「確認發布」（綠色實心，確認中顯示 Loading spinner 且 disabled）

成功後 Toast 通知（左側綠色邊框）：
- 主標：「版本已發布」
- 副標：「vN 已發布，Pipeline 現在可以啟用排程」
- 自動 3 秒後消失

### 入口二：Pipeline 編輯器頁面（`/etl-pipelines/:id/editor`）

工具列（參考原型 `18-pipeline-editor.html` Header，第 42-61 行）新增「發布」按鈕：

- 位置：位於「儲存」按鈕右側、「版本」連結左側
- 按鈕標籤：rocket icon + 「發布」文字
- 視覺層級：與「測試執行」按鈕相同（灰色框線樣式 `border border-border rounded-lg`）
- 狀態邏輯：
  - 當前版本為 `testing`：可點擊，點擊後開啟與版本管理頁相同的確認對話框
  - 當前版本為 `draft`：disabled，tooltip「請先完成測試執行」
  - 當前版本為 `published`：隱藏或顯示為 disabled 灰色

頂部版本狀態 Badge（如 `v3 (draft)` 區塊）：
- 發布成功後即時更新為 `vN (published)`，Badge 顏色由灰色改為綠色

---

## Technical Notes

- API 端點：`PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish`（無 Request Body）
- 後端需驗證：
  1. Pipeline 存在且 `deleted_at IS NULL`
  2. Version 存在且 `pipeline_id` 符合
  3. `EtlPipelineVersion.status === 'testing'`（非 `draft`、非 `published`）
- 後端需於同一 Transaction 中：
  1. 更新 `EtlPipelineVersion.status = 'published'`
  2. 更新 `EtlPipeline.version = versionNumber`
- 成功回應（200 OK）：
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
- 此端點已定義於 F033 的 API 規格中，本 Story 為前端實作與商業邏輯驗證的完整定義
- 前端於發布成功後呼叫版本清單 API 重新取得最新資料，或直接更新本地狀態以減少 Round Trip

---

## 測試案例

### TC-050-01：成功發布 testing 版本（Happy Path）

- **Given** 版本 v3 狀態為 `testing`
- **When** Admin 點擊「發布」→ 確認對話框出現 → 點擊「確認發布」
- **Then** API 回傳 200，版本狀態 Badge 更新為 `published`（綠色），Toast 顯示「版本已發布」，`EtlPipeline.version = 3`

### TC-050-02：阻止發布 draft 版本

- **Given** 版本 v4 狀態為 `draft`
- **When** Admin 直接呼叫 `PATCH .../v4-uuid/publish`
- **Then** API 回傳 422，錯誤碼 `PIPELINE_PUBLISH_REQUIRES_TEST`

### TC-050-03：UI 阻止 draft 版本點擊發布

- **Given** 版本清單中 v4 狀態為 `draft`
- **When** Admin 查看操作欄
- **Then** rocket icon 按鈕為 disabled，tooltip 顯示「請先完成測試執行」

### TC-050-04：published 版本無發布按鈕

- **Given** 版本 v2 狀態為 `published`
- **When** Admin 查看操作欄
- **Then** 無 rocket icon 按鈕，顯示 history（回滾）按鈕

### TC-050-05：重複發布 published 版本

- **Given** 版本 v3 狀態為 `published`
- **When** Admin 呼叫 `PATCH .../v3-uuid/publish`
- **Then** API 回傳 422，錯誤碼 `PIPELINE_VERSION_ALREADY_PUBLISHED`

### TC-050-06：發布後 Pipeline 可被啟用

- **Given** Pipeline 狀態為 `draft`（無 `published` 版本），執行測試後版本升為 `testing`，Admin 發布後版本為 `published`
- **When** Admin 呼叫 `PATCH .../toggle` 設定 `enabled: true`
- **Then** API 回傳 200，Pipeline `status = 'active'`

### TC-050-07：取消發布對話框

- **Given** Admin 點擊「發布」後確認對話框出現
- **When** Admin 點擊「取消」
- **Then** 對話框關閉，版本狀態不變

### TC-050-08：編輯器工具列發布（入口二）

- **Given** 編輯器頁面顯示版本 v3 狀態為 `testing`
- **When** Admin 點擊工具列「發布」按鈕 → 確認 → 成功
- **Then** 頂部 Badge 更新為 `v3 (published)`（綠色）

---

## 依賴關係

- **Blocked By**：
  - US-043（執行 Pipeline）— 測試執行成功後版本由 `draft` 升為 `testing`，為本 Story 前置條件
  - US-046（Pipeline 版本管理）— 版本清單頁面為本 Story 的主要 UI 入口
- **Blocks**：
  - US-044（啟用／停用 Pipeline）— 發布後 Pipeline 才能通過 `PIPELINE_DRAFT_CANNOT_ENABLE` 驗證

---

## Definition of Done

- [ ] `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish` 後端實作完成
- [ ] 後端驗證版本狀態為 `testing` 才允許發布
- [ ] 後端在同一 Transaction 中更新 `EtlPipelineVersion.status` 與 `EtlPipeline.version`
- [ ] 後端錯誤碼 `PIPELINE_PUBLISH_REQUIRES_TEST`、`PIPELINE_VERSION_ALREADY_PUBLISHED` 正確回傳
- [ ] 單元測試覆蓋所有 AC 場景（覆蓋率 >80%）
- [ ] 版本管理頁面（前端）：`testing` 版本顯示可點擊的發布按鈕，`draft` 版本顯示 disabled 且帶 tooltip
- [ ] 版本管理頁面（前端）：確認對話框含版本號與影響說明
- [ ] 版本管理頁面（前端）：發布成功後 Badge 即時更新為 `published`（綠色）
- [ ] 版本管理頁面（前端）：成功 Toast 通知顯示
- [ ] 編輯器頁面（前端）：工具列新增「發布」按鈕，狀態邏輯正確
- [ ] 編輯器頁面（前端）：發布成功後頂部版本 Badge 即時更新
- [ ] E2E 測試：完整流程「測試執行成功 → 發布版本 → 啟用 Pipeline」通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **Feature Spec**：[F037 發布 Pipeline 版本](../../../specs/features/F037-publish-pipeline-version.md)
- **相關 Stories**：
  - [US-043 執行 Pipeline](US-043-execute-pipeline.md)（測試執行 → 版本升為 testing）
  - [US-044 啟用／停用 Pipeline](US-044-toggle-pipeline.md)（需發布後才能啟用）
  - [US-046 Pipeline 版本管理](US-046-pipeline-version.md)（版本清單頁 UI 入口）
- **NFR**：[NFR-001 安全性](../../non-functional/NFR-001-security.md)
- **原型**：
  - `prototypes/18-pipeline-editor.html`（編輯器工具列）
  - `prototypes/20-pipeline-versions.html`（版本管理頁，含 Publish Dialog）
