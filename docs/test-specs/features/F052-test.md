---
type: test-design-feature
feature_id: F052
feature_name: 停用名單定義（v2.1）
priority: P0-MVP
related_spec: /docs/specs/features/F052-disable-list-definition.md
spec_version: "2.1"
covers:
  - F052
  - US-090
  - US-105
date: 2026-05-21
last_updated: 2026-05-21
---

# F052：停用名單定義（v2.1）— 測試設計

> **v2.1 測試設計範圍（2026-05-21）**：本文件覆蓋 F052 v2.1 核心變更 ——
> 1. 按鈕文字「停」→「停用」全寫（US-105 v2.3 修正，v1.0 縮寫廢止）
> 2. 入口由 F048 v1.0 表格列改為 F048 v2.0 Kanban 主頁 `draft` 階段卡片操作欄
>
> 既有業務邏輯（API endpoint / 軟刪除語意 / 月跑鎖 / 重複停用阻擋）不在 v2.1 變更範圍內。
> 本文件覆蓋 3 個前端 Component 場景，聚焦於按鈕文字正確性 / 確認對話框一致性 / 停用後卡片消失。
> 若既有 E2E 有對應按鈕文字「停」的 test，應標記為 `@deprecated`（詳見第一節）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F052-disable-list-definition.md` v2.1 + `F077-month-switch-and-stage-overview.md`（BR-7 矩陣：`draft` 階段才有停用按鈕）|
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 前端 Component（RTL）；停用 API 行為（軟刪除 / 月跑鎖）由既有後端 Integration test 覆蓋 |
| 測試檔案 | `apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（追加 F052 群組）|
| 關鍵 AC 變更 | 按鈕文字必須為「停用」（全寫），不可為「停」（縮寫）|
| Mock 注意 | `stage` 值用 PG ENUM 小寫 `'draft'`；MSW stub PATCH/DELETE 軟刪除 API |

---

## 一、v1.0 Deprecated 場景宣告

> 以下場景因 v2.1 按鈕文字修正而廢止。若既有 E2E 或 Component test 有 `getByText('停')` 或 `getByRole('button', { name: '停' })` 形式的斷言，應標記 `@deprecated` 並更新為 `'停用'`。

| 廢止場景 | 廢止原因 | v2.1 替代場景 |
|---|---|---|
| 斷言按鈕文字為「停」（縮寫） | v2.1 全寫「停用」取代 | TS-F052-TXT-001 |

---

## 二、停用按鈕與確認對話框測試

### TS-F052-TXT-001：Kanban draft 欄卡片「停用」按鈕文字為全寫（非縮寫「停」）

- **關聯需求**：F052 v2.1 AC-1 / US-105 v2.3（按鈕文字「停用」全寫）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - 使用 DirectorToken（`businessRole='director'`）
  - MSW stub `GET /api/v1/assignment/lists` 回 1 筆 `stage='draft'`、`status='active'` 名單
  - 非歷史月份；無月跑鎖
- **步驟**：
  1. render `<ListKanbanPage />` with director context
  2. 定位「草稿」欄中的卡片操作區
  3. 驗證按鈕文字
- **預期結果**：
  - 存在 `role='button'` 且文字為「停用」的按鈕（`getByRole('button', { name: '停用' })` 成功）
  - 不存在文字為「停」（縮寫）的獨立按鈕（`queryByRole('button', { name: /^停$/ }) === null`）

---

### TS-F052-TXT-002：點擊「停用」→ 確認對話框標題與警告文字包含「停用」全寫

- **關聯需求**：F052 v2.1 AC-1（確認對話框文字一致性）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：同 TS-F052-TXT-001
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 點擊草稿欄卡片上的「停用」按鈕
  3. 驗證彈出的確認對話框
- **預期結果**：
  - 對話框標題含「停用」全寫（如「確認停用名單 OB202605001？」）
  - 對話框警告文字含「停用」或「軟刪除」相關說明
  - 對話框確認按鈕文字也為「停用」或「確認停用」（全寫，非縮寫「停」）

---

### TS-F052-TXT-003：確認停用 → API 200 → 卡片從 Kanban 草稿欄消失（status=inactive 不渲染）

- **關聯需求**：F052 v2.1 AC-2 / F077 v1.3 BR-7 C-3（已停用名單不渲染於 Kanban 主視圖）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - 頁面渲染「草稿」欄含 `listNo='OB202605001'` 卡片
  - MSW stub 停用 API（`PATCH /api/v1/assignment/list-definitions/OB202605001/disable` 或對應端點）回 200
  - MSW stub 停用後 GET lists 刷新回 `status='inactive'`（`stageCounts.draft` 減 1）
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 點擊「停用」按鈕，確認對話框點擊「確認」
  3. 等待 API 回應及頁面更新
  4. 驗證 Kanban 狀態
- **預期結果**：
  - `OB202605001` 卡片從「草稿」欄**消失**（DOM 不存在）
  - 「草稿」欄 badge 數字減 1
  - KPI「名單總數」卡數字減 1

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F052-TXT-001~003（按鈕文字 / Dialog / 卡片消失） | 高 | RTL + MSW；核心驗證點為 DOM 文字，確定性高 |
| 既有業務邏輯（軟刪除 / 月跑鎖 / 重複停用） | 高（後端 Integration 既有覆蓋） | v2.1 不新增後端 test |
