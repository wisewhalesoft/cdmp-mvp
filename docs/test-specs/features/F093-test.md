---
type: test-design-feature
feature_id: F093
feature_name: 編輯 Pipeline 中繼資料（名稱 / 排程 / 描述）
priority: P0-MVP
related_spec: /docs/specs/features/F093-edit-pipeline-metadata.md (待建立)
related_prototype: /prototypes/17-pipeline-management.html (#editModal)
related_source:
  - apps/api/src/modules/etl/etl-pipeline.controller.ts
  - apps/api/src/modules/etl/etl-pipeline.service.ts
  - apps/api/src/modules/etl/dto/create-pipeline.dto.ts
  - apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx
  - apps/web/src/pages/etl-pipelines/create-pipeline-modal.tsx
last_updated: 2026-05-27
---

# F093: 編輯 Pipeline 中繼資料 — 測試設計

---

## 功能摘要

在 Pipeline 管理列表頁面，每列 Pipeline 的操作欄位加入「⚙️ 設定」按鈕（lucide `settings`，`title="設定"`），點擊後開啟「編輯 Pipeline」Modal，允許修改：
- **Pipeline 名稱**（必填，最多 255 字元）
- **描述**（選填）
- **排程 / Cron**（選填）

儲存後呼叫 `PATCH /api/v1/etl/pipelines/:id`，**不觸碰** Pipeline 定義（nodes / edges / versions）。

---

## 開放決策清單（OPEN DECISIONS）

> 以下三個決策點尚未由 PM / 架構師拍板，測試設計已為每個可能的答案各準備對應場景；**實作前必須確認**。

| 決策 ID | 問題 | 選項 A（建議）| 選項 B |
|---------|------|-------------|--------|
| **OD-F093-01** | `status=running` 時是否可呼叫 PATCH 端點？ | 後端回 `PIPELINE_RUNNING` (409)，API 與 UI 一致禁止 | 後端允許（僅 UI 禁止），但需文件化例外 |
| **OD-F093-02** | 更新 `schedule` 後是否重新計算 `next_execution_at`？ | 是：服務層在儲存後立即根據新 cron 計算並更新 `next_execution_at` | 否：由排程器下次掃描時更新（可能有分鐘級延遲） |
| **OD-F093-03** | 將名稱改為**與自身目前名稱相同**（無實質變更）時，是否允許？ | 允許（唯一性查詢需 `AND id != :self` 排除自身） | 拒絕（視同重複 → 409） |

---

## Acceptance Test Design

### AC-1：更新名稱

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；存在 Pipeline ID=`p-001`（名稱「舊名稱」，非 running 狀態） |
| When | `PATCH /api/v1/etl/pipelines/p-001` Body: `{ "name": "新名稱" }` |
| Then | HTTP 200；回應含 `name: "新名稱"`；DB 中 `etl_pipelines.name = '新名稱'`；`updated_at` 更新 |

### AC-2：更新排程

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；存在 Pipeline ID=`p-001`（schedule=null，非 running） |
| When | `PATCH /api/v1/etl/pipelines/p-001` Body: `{ "schedule": "0 2 * * *" }` |
| Then | HTTP 200；回應含 `schedule: "0 2 * * *"`；DB 更新 |

### AC-3：清除排程

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；Pipeline ID=`p-001` schedule=`"0 2 * * *"` |
| When | `PATCH /api/v1/etl/pipelines/p-001` Body: `{ "schedule": null }` |
| Then | HTTP 200；回應 `schedule: null`；DB `schedule IS NULL` |

### AC-4：前端 UI — gear 按鈕渲染與 Modal 預填

| 項目 | 內容 |
|------|------|
| Given | 列表頁載入完成，第一列為非 running Pipeline（名稱「A」，描述「desc A」，schedule=`"30 8 * * *"`） |
| When | 使用者點擊該列 ⚙️設定 按鈕 |
| Then | `#editModal`（`data-testid="edit-pipeline-modal"`）可見；名稱欄位值為「A」；描述欄位值為「desc A」；cron builder 對應至每日 08:30 或 manual cron 呈現 `30 8 * * *` |

---

## 測試場景

---

### 後端 — Service 單元測試（updateMetadata）

---

#### TS-F093-SVC-001：僅更新名稱 — Happy Path

- **相關需求**：AC-1
- **測試類型**：Positive
- **前置條件**：
  - mock `pipelineRepository.createQueryBuilder` 找到 `p-001`（status=`draft`）
  - mock 唯一性查詢回傳 `null`（無衝突）
  - mock `pipelineRepository.save` 回傳更新後物件
- **步驟**：
  1. 呼叫 `updateMetadata('p-001', { name: '新名稱' }, 'admin-user')`
- **預期結果**：
  - 回傳物件含 `name: '新名稱'`
  - `save` 被呼叫一次，所傳入的 entity `name = '新名稱'`
  - `description` 與 `schedule` 維持原值（PATCH 語意：不傳的欄位不覆寫）
  - **版本定義（nodes/edges）不被觸碰**

---

#### TS-F093-SVC-002：僅更新 schedule（5 欄位 cron）— Happy Path

- **相關需求**：AC-2，BR-4
- **測試類型**：Positive
- **前置條件**：mock Pipeline 找到；唯一性查詢回傳 null
- **步驟**：
  1. 呼叫 `updateMetadata('p-001', { schedule: '0 2 * * *' })`
- **預期結果**：
  - 回傳 `schedule: '0 2 * * *'`
  - CronExpressionParser.parse 被呼叫且不拋出例外

---

#### TS-F093-SVC-003：更新 schedule（6 欄位 cron）— Happy Path

- **相關需求**：BR-4（5 或 6 欄位均合法）
- **測試類型**：Boundary
- **前置條件**：同 SVC-002
- **步驟**：
  1. `updateMetadata('p-001', { schedule: '0 2 * * * *' })` （6 欄位）
- **預期結果**：HTTP 200；無驗證錯誤

---

#### TS-F093-SVC-004：清除 schedule（傳 null）— Happy Path

- **相關需求**：AC-3
- **測試類型**：Positive
- **前置條件**：Pipeline schedule=`"0 2 * * *"`；mock 找到
- **步驟**：
  1. `updateMetadata('p-001', { schedule: null })`
- **預期結果**：
  - save 傳入 entity 之 `schedule` 為 `null`
  - 回傳 `schedule: null`
  - CronExpressionParser **不被呼叫**（null 跳過驗證）

---

#### TS-F093-SVC-005：清除 schedule（傳空字串）— Happy Path

- **相關需求**：AC-3（空字串等同 null 語意）
- **測試類型**：Boundary
- **前置條件**：同 SVC-004
- **步驟**：
  1. `updateMetadata('p-001', { schedule: '' })`
- **預期結果**：
  - `schedule` 儲存為 `null`（空字串正規化為 null，與 create 相同慣例）
  - CronExpressionParser **不被呼叫**

---

#### TS-F093-SVC-006：同時更新名稱 + 描述 + schedule — Happy Path

- **相關需求**：AC-1、AC-2
- **測試類型**：Positive
- **前置條件**：Pipeline 存在（所有欄位有舊值）；唯一性查詢回傳 null
- **步驟**：
  1. `updateMetadata('p-001', { name: 'A', description: 'B', schedule: '0 8 * * 1' })`
- **預期結果**：
  - `name=A`、`description=B`、`schedule='0 8 * * 1'` 均持久化
  - 回傳 `{ id, name, description, schedule, status, updatedAt }`（至少這些欄位）

---

#### TS-F093-SVC-007：Pipeline 不存在 → 404

- **相關需求**：錯誤處理
- **測試類型**：Negative
- **前置條件**：mock `createQueryBuilder.getOne` 回傳 `null`
- **步驟**：
  1. `updateMetadata('non-existent', { name: 'X' })`
- **預期結果**：
  - 拋出 `NotFoundException`
  - `error: 'PIPELINE_NOT_FOUND'`

---

#### TS-F093-SVC-008：Pipeline 已軟刪除 → 404

- **相關需求**：錯誤處理
- **測試類型**：Negative
- **前置條件**：mock 查詢過濾條件含 `deleted_at IS NULL`，因此軟刪除的 Pipeline 回傳 null
- **步驟**：
  1. `updateMetadata('deleted-id', { name: 'X' })`
- **預期結果**：拋出 `NotFoundException`（`PIPELINE_NOT_FOUND`）

---

#### TS-F093-SVC-009：名稱與**另一個** Pipeline 衝突 → 409

- **相關需求**：唯一性規則（參考 create 的實作）
- **測試類型**：Negative
- **前置條件**：
  - mock 唯一性查詢回傳另一個 Pipeline（`id='p-999'`，`name='衝突名稱'`）
- **步驟**：
  1. `updateMetadata('p-001', { name: '衝突名稱' })`
- **預期結果**：
  - 拋出 `ConflictException`（HTTP 409）
  - `error: 'PIPELINE_NAME_EXISTS'`

---

#### TS-F093-SVC-010：[OD-F093-03] 名稱改為**自身目前名稱** → 允許（選項 A）

- **相關需求**：OD-F093-03（自排除邏輯）
- **測試類型**：Boundary / Bug-防護
- **前置條件**：
  - Pipeline `p-001` 目前名稱為「既有名稱」
  - 唯一性查詢若**未排除自身**，將回傳 `p-001` 本身 → 錯誤拋出 409（bug）
  - **正確實作**：唯一性查詢須附加 `AND p.id != :selfId` 條件，使查詢回傳 null
- **步驟**：
  1. `updateMetadata('p-001', { name: '既有名稱' })`
- **預期結果（選項 A）**：
  - **不**拋出例外；HTTP 200；儲存成功
  - 唯一性查詢的 SQL 含 `AND p.id != 'p-001'` 條件
- **注意**：若選項 B 拍板（相同名稱拒絕），將此場景的預期結果改為 409 `PIPELINE_NAME_EXISTS`
- **重點**：這是容易引入 silent bug 的邊界，**測試必須明確驗證 self-exclusion 條件**

---

#### TS-F093-SVC-011：Cron 欄位數不足（4 欄位）→ 422

- **相關需求**：BR-4（cron 必須 5 或 6 欄位）
- **測試類型**：Negative / Boundary
- **前置條件**：Pipeline 存在；mock 準備好
- **步驟**：
  1. `updateMetadata('p-001', { schedule: '0 2 * *' })` （4 欄位）
- **預期結果**：
  - 拋出 `UnprocessableEntityException`（HTTP 422）
  - `error: 'VALIDATION_INVALID_CRON'`

---

#### TS-F093-SVC-012：Cron 欄位數過多（7 欄位）→ 422

- **相關需求**：BR-4
- **測試類型**：Boundary
- **步驟**：
  1. `updateMetadata('p-001', { schedule: '0 2 * * * * *' })` （7 欄位）
- **預期結果**：`VALIDATION_INVALID_CRON`（422）

---

#### TS-F093-SVC-013：Cron 格式可解析但語意無效 → 422

- **相關需求**：BR-4（CronExpressionParser.parse 失敗）
- **測試類型**：Negative
- **步驟**：
  1. `updateMetadata('p-001', { schedule: '99 99 * * *' })` （分/時超出範圍）
- **預期結果**：`VALIDATION_INVALID_CRON`（422）

---

#### TS-F093-SVC-014：空白名稱（純空白字串）→ 驗證錯誤

- **相關需求**：名稱必填規則
- **測試類型**：Negative
- **前置條件**：Pipeline 存在
- **步驟**：
  1. `updateMetadata('p-001', { name: '   ' })`（全空白）
- **預期結果**：
  - DTO 層 `@IsNotEmpty` 或 service 層 trim 後檢查，拋出驗證錯誤（HTTP 400 或 422）
  - **注意**：空白名稱不可成功儲存；error code 為 `VALIDATION_ERROR` 或 `PIPELINE_NAME_REQUIRED`（待 DTO 設計確認）

---

#### TS-F093-SVC-015：空字串名稱 → 驗證錯誤

- **相關需求**：名稱必填規則
- **測試類型**：Negative
- **步驟**：
  1. `updateMetadata('p-001', { name: '' })`
- **預期結果**：HTTP 400/422；名稱驗證失敗

---

#### TS-F093-SVC-016：名稱超過 255 字元 → 驗證錯誤

- **相關需求**：`@MaxLength(255)` 對應 create DTO 設計
- **測試類型**：Boundary
- **步驟**：
  1. `updateMetadata('p-001', { name: 'A'.repeat(256) })`
- **預期結果**：HTTP 400/422；`VALIDATION_ERROR`

---

#### TS-F093-SVC-017：名稱 255 字元（邊界值）→ 允許

- **相關需求**：`@MaxLength(255)` 上界
- **測試類型**：Boundary
- **步驟**：
  1. `updateMetadata('p-001', { name: 'A'.repeat(255) })`
- **預期結果**：HTTP 200；儲存成功

---

#### TS-F093-SVC-018：[OD-F093-01] status=running 時呼叫 PATCH → 409（選項 A）

- **相關需求**：OD-F093-01（與 UI gear 禁用一致）
- **測試類型**：Negative
- **前置條件**：mock Pipeline status=`running`
- **步驟**：
  1. `updateMetadata('running-pipeline', { name: '新名稱' })`
- **預期結果（選項 A）**：
  - 拋出 `ConflictException`（HTTP 409）
  - `error: 'PIPELINE_RUNNING'`（複用現有 error code）
- **注意**：若選項 B 拍板（允許後端），刪除此場景或改為 positive test

---

#### TS-F093-SVC-019：[OD-F093-02] 更新 schedule 後 next_execution_at 重算（選項 A）

- **相關需求**：OD-F093-02
- **測試類型**：Positive / 決策點驗證
- **前置條件**：Pipeline `next_execution_at = null`；新 schedule = `'0 2 * * *'`；mock 時間為固定值（可使用 vi.setSystemTime）
- **步驟**：
  1. `updateMetadata('p-001', { schedule: '0 2 * * *' })`
- **預期結果（選項 A）**：
  - 回傳（或儲存）的 `next_execution_at` 為依 `'0 2 * * *'` 計算的下一個執行時間（非 null）
  - 使用 CronExpressionParser 計算出的 UTC 時間戳
- **選項 B 的預期結果**：`next_execution_at` 維持原值（null 或舊值），不在本次 PATCH 更新

---

#### TS-F093-SVC-020：清除 schedule 後 next_execution_at 歸 null

- **相關需求**：OD-F093-02（無論哪個選項，清除排程後 next 應為 null）
- **測試類型**：Positive
- **前置條件**：Pipeline `schedule='0 2 * * *'`，`next_execution_at` 為某日期
- **步驟**：
  1. `updateMetadata('p-001', { schedule: null })`
- **預期結果**：儲存的 `next_execution_at` 為 `null`

---

### 後端 — Controller / E2E 測試

---

#### TS-F093-E2E-001：PATCH 端點存在且路徑正確

- **相關需求**：端點設計
- **測試類型**：Smoke
- **步驟**：
  1. `PATCH /api/v1/etl/pipelines/:id`（admin token，合法 body）
- **預期結果**：HTTP 200（非 404 Not Found，確認路由已掛載）

---

#### TS-F093-E2E-002：未認證請求 → 401

- **相關需求**：AuthGuard
- **測試類型**：Negative / Security
- **前置條件**：不附 Authorization header
- **步驟**：
  1. `PATCH /api/v1/etl/pipelines/p-001` 無 token，body `{ "name": "X" }`
- **預期結果**：HTTP 401；`error: 'AUTH_TOKEN_MISSING'`

---

#### TS-F093-E2E-003：已認證但非 admin 角色 → 403

- **相關需求**：`@Roles('admin')`（class-level guard，與 `GET /etl/pipelines` 相同）
- **測試類型**：Negative / Security / RBAC
- **前置條件**：以 `user` 角色 token 呼叫
- **步驟**：
  1. `PATCH /api/v1/etl/pipelines/p-001`（user token）
- **預期結果**：HTTP 403；`error: 'AUTH_FORBIDDEN'`

---

#### TS-F093-E2E-004：合法更新（整合驗證 DB 持久化）

- **相關需求**：AC-1 至 AC-3 端對端驗證
- **測試類型**：Positive / Integration
- **前置條件**：
  - DB 中存在 Pipeline `p-001`（name='原始名稱'，schedule=null）
  - admin token 有效
- **步驟**：
  1. `PATCH /api/v1/etl/pipelines/p-001`，body `{ "name": "更新後", "schedule": "0 8 * * *", "description": "新描述" }`
  2. `GET /api/v1/etl/pipelines/p-001`（或從列表取得）
- **預期結果**：
  - PATCH 回傳 HTTP 200，body 含 `name`, `description`, `schedule`, `updatedAt`
  - GET 結果中 `name='更新後'`、`description='新描述'`、`schedule='0 8 * * *'`
  - **版本 `definition`（nodes/edges）不變**

---

#### TS-F093-E2E-005：名稱衝突（另一 Pipeline 已用此名稱）→ 409

- **相關需求**：PIPELINE_NAME_EXISTS
- **測試類型**：Negative / Integration
- **前置條件**：DB 中 `p-002` 名稱為「已存在名稱」
- **步驟**：
  1. `PATCH /api/v1/etl/pipelines/p-001`，body `{ "name": "已存在名稱" }`
- **預期結果**：HTTP 409；`{ "error": "PIPELINE_NAME_EXISTS" }`

---

#### TS-F093-E2E-006：無效 cron → 422

- **相關需求**：VALIDATION_INVALID_CRON
- **測試類型**：Negative / Integration
- **步驟**：
  1. `PATCH /api/v1/etl/pipelines/p-001`，body `{ "schedule": "not-a-cron" }`
- **預期結果**：HTTP 422；`{ "error": "VALIDATION_INVALID_CRON" }`

---

#### TS-F093-E2E-007：Pipeline 不存在 → 404

- **相關需求**：PIPELINE_NOT_FOUND
- **測試類型**：Negative / Integration
- **步驟**：
  1. `PATCH /api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000`，body `{ "name": "X" }`
- **預期結果**：HTTP 404；`{ "error": "PIPELINE_NOT_FOUND" }`

---

### 前端 — Component 測試（RTL / Vitest）

---

#### TS-F093-FE-001：gear 按鈕出現在每列 pencil 之後

- **相關需求**：prototype `#editModal` / gear icon 位置
- **測試類型**：Positive / UI
- **前置條件**：
  - render `PipelineListPage`，mock API 回傳 3 筆 Pipeline（status 分別為 draft / active / disabled）
- **步驟**：
  1. 查詢各列 `data-testid="settings-pipeline-{id}"` 按鈕
- **預期結果**：
  - 3 列各有 1 個 settings 按鈕
  - settings 按鈕在 DOM 中位於 pencil 按鈕（`data-testid="edit-pipeline-{id}"`）**之後**、toggle 按鈕之前
  - 按鈕 `title` 屬性為「設定」

---

#### TS-F093-FE-002：running Pipeline 的 gear 按鈕為 disabled

- **相關需求**：OD-F093-01（UI 層保護）；prototype 第 486 行 `disabled` 按鈕
- **測試類型**：Positive / UI
- **前置條件**：mock 回傳 1 筆 Pipeline（status=`running`）
- **步驟**：
  1. 查詢 `data-testid="settings-pipeline-{id}"`
- **預期結果**：
  - `disabled` 屬性為 true
  - 點擊後 Modal **不**開啟（`data-testid="edit-pipeline-modal"` 不在 DOM 中或 `aria-hidden=true`）
  - 按鈕有 `cursor-not-allowed` 樣式（或等效的視覺禁用標示）

---

#### TS-F093-FE-003：非 running Pipeline 點擊 gear → Modal 開啟

- **相關需求**：AC-4 前端部分
- **測試類型**：Positive / UI
- **前置條件**：mock 回傳 1 筆 Pipeline（status=`active`，name='Pipeline A'，description='desc'，schedule=`'0 2 * * *'`）
- **步驟**：
  1. 點擊 `data-testid="settings-pipeline-{id}"`
- **預期結果**：
  - `data-testid="edit-pipeline-modal"` 可見
  - Modal 標題為「編輯 Pipeline」

---

#### TS-F093-FE-004：Modal 預填名稱與描述

- **相關需求**：AC-4（pre-filled）
- **測試類型**：Positive / UI
- **前置條件**：同 FE-003
- **步驟**：
  1. 點擊 gear 按鈕
  2. 讀取 `data-testid="pipeline-name-input"` 的值
  3. 讀取 `data-testid="pipeline-description-input"` 的值
- **預期結果**：
  - 名稱輸入框值為「Pipeline A」
  - 描述輸入框值為「desc」

---

#### TS-F093-FE-005：Modal 預填排程（可識別為已知 frequency 時）

- **相關需求**：AC-4（cron pre-mapped to frequency builder）
- **測試類型**：Positive / UI
- **前置條件**：Pipeline schedule=`'0 2 * * *'`（對應每日 02:00）
- **步驟**：
  1. 點擊 gear，Modal 開啟
  2. 讀取 frequency selector 選擇值
  3. 讀取 hour / minute 輸入值
- **預期結果**：
  - frequency 選擇「每日」
  - hour = 2，minute = 0
  - cron preview 顯示「每日 02:00 UTC」及 Cron 預覽 `0 2 * * *`

---

#### TS-F093-FE-006：Modal 預填排程（schedule=null → 不設定排程）

- **相關需求**：AC-4 / no schedule case
- **測試類型**：Positive / UI
- **前置條件**：Pipeline schedule=`null`
- **步驟**：
  1. 點擊 gear，Modal 開啟
- **預期結果**：
  - frequency selector 選擇「不設定排程」
  - cron preview 區域**不顯示** cron 值（或顯示「無排程」）

---

#### TS-F093-FE-007：cron builder — 選每日 02:00 產生正確 cron

- **相關需求**：`buildCronExpression` 函式行為（鏡像 create modal）
- **測試類型**：Positive / Unit（Component）
- **前置條件**：EditPipelineModal 已開啟
- **步驟**：
  1. frequency 選「每日」
  2. hour 設 2，minute 設 0
  3. 讀取 cron preview
- **預期結果**：
  - cron expression 為 `0 2 * * *`
  - preview 文字顯示「每日 02:00 UTC」

---

#### TS-F093-FE-008：cron builder — 每小時第 30 分

- **相關需求**：`buildCronExpression` hourly case
- **測試類型**：Positive / Unit（Component）
- **步驟**：
  1. frequency 選「每小時」，minute = 30
- **預期結果**：cron expression = `30 * * * *`

---

#### TS-F093-FE-009：cron builder — 每週一 09:00

- **相關需求**：`buildCronExpression` weekly case
- **測試類型**：Positive / Unit（Component）
- **步驟**：
  1. frequency 選「每週」，weekday = 1（一），hour = 9，minute = 0
- **預期結果**：cron expression = `0 9 * * 1`

---

#### TS-F093-FE-010：cron builder — 每月 15 日 00:00

- **相關需求**：`buildCronExpression` monthly case
- **測試類型**：Positive / Unit（Component）
- **步驟**：
  1. frequency 選「每月」，dayOfMonth = 15，hour = 0，minute = 0
- **預期結果**：cron expression = `0 0 15 * *`

---

#### TS-F093-FE-011：手動 cron 模式切換

- **相關需求**：prototype `editCronManualToggle`
- **測試類型**：Positive / UI
- **步驟**：
  1. 勾選「手動輸入 Cron 表達式」checkbox
  2. 確認 manual cron input 顯示
  3. 輸入 `5 4 * * 0`
- **預期結果**：
  - manual input 呈現（之前為 hidden）
  - cron preview 顯示 `Cron: 5 4 * * 0`
  - frequency 下拉選單**隱藏或 disabled**（避免混淆）

---

#### TS-F093-FE-012：不設定排程 → 送出 schedule=null

- **相關需求**：AC-3 前端
- **測試類型**：Positive / UI
- **前置條件**：Modal 開啟；frequency = '不設定排程'
- **步驟**：
  1. 點擊「儲存」
- **預期結果**：
  - API 呼叫 `updatePipeline(id, { name: '...', schedule: null })`（schedule 傳 null）

---

#### TS-F093-FE-013：儲存按鈕在名稱為空時 disabled

- **相關需求**：名稱必填規則（對應 create modal `isNameEmpty`）
- **測試類型**：Negative / UI
- **前置條件**：Modal 開啟；名稱欄位清空
- **步驟**：
  1. 清除名稱輸入框
  2. 讀取「儲存」按鈕狀態
- **預期結果**：
  - 儲存按鈕 `disabled` 為 true
  - 點擊無效（API 不被呼叫）

---

#### TS-F093-FE-014：儲存成功 → Modal 關閉 + Toast + 列表重整

- **相關需求**：成功路徑 UX
- **測試類型**：Positive / UI / Integration
- **前置條件**：
  - mock `updatePipeline` API 回傳 HTTP 200
  - Modal 開啟，名稱填「已更新」
- **步驟**：
  1. 點擊「儲存」
- **預期結果**：
  - `data-testid="edit-pipeline-modal"` 消失（Modal 關閉）
  - 成功 toast 出現（文字含「已更新」或類似成功訊息）
  - `getPipelines` API 被**再次呼叫**（列表重整）

---

#### TS-F093-FE-015：API 回傳 PIPELINE_NAME_EXISTS → 內嵌錯誤訊息

- **相關需求**：錯誤映射（鏡像 create modal）
- **測試類型**：Negative / UI
- **前置條件**：mock API 回傳 409 `{ error: 'PIPELINE_NAME_EXISTS' }`
- **步驟**：
  1. 填入名稱，點擊「儲存」
- **預期結果**：
  - Modal **不關閉**
  - Alert 元件顯示「此名稱的 Pipeline 已存在」
  - Modal 仍維持可填寫狀態

---

#### TS-F093-FE-016：API 回傳 VALIDATION_INVALID_CRON → cron 格式錯誤訊息

- **相關需求**：錯誤映射
- **測試類型**：Negative / UI
- **前置條件**：mock API 回傳 422 `{ error: 'VALIDATION_INVALID_CRON' }`
- **步驟**：
  1. 填入 manual cron（無效值），點擊「儲存」
- **預期結果**：Alert 顯示「排程格式不正確，請輸入合法的 cron 表達式」

---

#### TS-F093-FE-017：API 回傳 422（其他 VALIDATION_ERROR）→ 通用錯誤訊息

- **相關需求**：fallback 錯誤處理（鏡像 create modal 422 fallback）
- **測試類型**：Negative / UI
- **前置條件**：mock API 回傳 422 `{ error: 'VALIDATION_ERROR', message: '欄位驗證失敗' }`
- **步驟**：
  1. 點擊「儲存」
- **預期結果**：Alert 顯示 message 內容「欄位驗證失敗」

---

#### TS-F093-FE-018：API 回傳 500 → 通用系統錯誤訊息

- **相關需求**：fallback 錯誤處理
- **測試類型**：Negative / UI
- **前置條件**：mock API 拋出 500 error
- **步驟**：
  1. 點擊「儲存」
- **預期結果**：Alert 顯示「系統發生非預期錯誤，請稍後再試」

---

#### TS-F093-FE-019：取消按鈕關閉 Modal 且不呼叫 API

- **相關需求**：UX 基本行為
- **測試類型**：Positive / UI
- **步驟**：
  1. 點擊 gear 開啟 Modal
  2. 修改名稱（但不儲存）
  3. 點擊「取消」
- **預期結果**：
  - Modal 關閉（不在 DOM 中或 hidden）
  - `updatePipeline` API **未被呼叫**
  - 列表頁資料**不重整**

---

#### TS-F093-FE-020：Backdrop 點擊關閉 Modal 且不呼叫 API

- **相關需求**：Modal 行為（鏡像 create modal `data-testid="modal-backdrop"`）
- **測試類型**：Positive / UI
- **步驟**：
  1. 點擊 gear 開啟 Modal
  2. 點擊 `data-testid="modal-backdrop"`（遮罩）
- **預期結果**：Modal 關閉；API 未被呼叫

---

#### TS-F093-FE-021：關閉後重開 Modal 狀態重置

- **相關需求**：表單重置（避免殘留前次錯誤或修改值）
- **測試類型**：Positive / UI
- **前置條件**：
  - 第一次開啟後觸發 API 錯誤，Alert 顯示錯誤訊息
  - 關閉 Modal
- **步驟**：
  1. 再次點擊 gear（同一列）
- **預期結果**：
  - Alert 錯誤訊息**不顯示**（狀態重置）
  - 名稱欄位恢復為 Pipeline 原始名稱（非前次填寫的錯誤內容）

---

#### TS-F093-FE-022：[OD-F093-01] running Pipeline gear 點擊 — UI 層阻擋

- **相關需求**：OD-F093-01（與 SVC-018 對應的前端保護）
- **測試類型**：Negative / UI（Security boundary）
- **前置條件**：mock 回傳 1 筆 Pipeline（status=`running`）
- **步驟**：
  1. 嘗試 click `data-testid="settings-pipeline-{id}"`
- **預期結果**：
  - Modal **不開啟**（`updatePipeline` 絕對不被呼叫）
  - 按鈕 `disabled` 為 true（DOM 層阻擋，非單純 CSS）

---

## 測試矩陣總覽

| 場景 ID | 測試層 | 類型 | 決策依賴 |
|---------|--------|------|----------|
| SVC-001~006 | Service 單元 | Positive / Happy Path | — |
| SVC-007~008 | Service 單元 | Negative（Not Found） | — |
| SVC-009 | Service 單元 | Negative（Conflict） | — |
| **SVC-010** | Service 單元 | **Boundary / Bug-防護** | **OD-F093-03** |
| SVC-011~013 | Service 單元 | Negative（Cron 驗證） | — |
| SVC-014~017 | Service 單元 | Negative / Boundary（名稱驗證） | — |
| **SVC-018** | Service 單元 | **Negative（Running 鎖）** | **OD-F093-01** |
| **SVC-019** | Service 單元 | **Positive（next_execution_at）** | **OD-F093-02** |
| SVC-020 | Service 單元 | Positive（clear schedule） | — |
| E2E-001 | E2E Smoke | Smoke | — |
| E2E-002~003 | E2E | Security / RBAC | — |
| E2E-004~007 | E2E | Integration | — |
| FE-001~002 | 前端 Component | UI Render | — |
| FE-003~006 | 前端 Component | Modal 開啟 / 預填 | — |
| FE-007~011 | 前端 Component | Cron Builder 行為 | — |
| FE-012~013 | 前端 Component | Schedule null / disabled button | — |
| FE-014 | 前端 Component | 成功路徑 UX | — |
| FE-015~018 | 前端 Component | 錯誤映射 | — |
| FE-019~020 | 前端 Component | 關閉行為 | — |
| FE-021 | 前端 Component | 狀態重置 | — |
| **FE-022** | 前端 Component | **Running 鎖（UI）** | **OD-F093-01** |

**總計：42 個場景**（SVC ×20 + E2E ×7 + FE ×22，不含 OD 分叉的替代變體）

---

## 風險與開放問題補充

### OD-F093-01 — Running 時是否允許 PATCH

**為何需要決策**：prototype 明確禁用 gear（UI 層保護），但後端若無獨立 guard，直接呼叫 API 仍可成功 → 產生前後端不一致的行為縫隙。

**建議**：後端加上 status 檢查並回傳 `PIPELINE_RUNNING`（409），維持與 `togglePipeline` / `execute` 行為一致。

**對應場景**：SVC-018 / FE-022 / E2E（需補）

---

### OD-F093-02 — next_execution_at 重算

**為何需要決策**：若不重算，使用者更新排程後列表頁顯示的「下次執行」仍是舊值，造成資料誤導。

**建議**：更新 schedule 時，服務層使用 CronExpressionParser 計算下一個 UTC 執行時間並即時更新 `next_execution_at`；清除排程時設為 null。

**對應場景**：SVC-019 / SVC-020

---

### OD-F093-03 — 更名為相同名稱（Self-Exclusion）

**為何需要決策**：create 時的唯一性查詢是 `WHERE name = :name AND deleted_at IS NULL`，**未排除自身**。直接將同邏輯複製至 update，將在「名稱未變更」情況下錯誤返回 409，是最可能引入的 silent bug。

**建議**：唯一性查詢加上 `AND id != :selfId`，允許「更新為自身當前名稱」。

**對應場景**：SVC-010（必測項，為本功能最高風險場景之一）

---

### 架構約束備注

- `PATCH /etl/pipelines/:id` 路由需**插在** `PATCH :id/toggle` 之前，或使用精確路徑 `:id`（避免與 `:id/toggle` 混淆）；NestJS 路由解析順序需驗證（參考 F027 現有路由排列）。
- `UpdatePipelineDto` 應為 **所有欄位均 optional** 的 PATCH 語意（`@IsOptional` for all）；僅 `name` 在**有傳入**時才觸發 `@IsNotEmpty` 驗證。
- `next_execution_at` 欄位計算依賴 `CronExpressionParser.parse`，需確認與 create 流程共用同一個工具函式以維持一致性。
