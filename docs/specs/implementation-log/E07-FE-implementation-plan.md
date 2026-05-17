---
type: implementation-plan
epic: E07
phase: Frontend
status: ready
created: 2026-05-17
total_effort: 12.5 人日
---

# E07 重構 — 前端 FE-1~FE-6 實作計畫

## A. 整體概要

| 批次 | 範圍 | 估算 | 依賴 |
|------|------|------|------|
| FE-1 | E02 帳號管理 4 角色 | 1.5 | 共用元件 |
| FE-2 | M01 名單定義五階段 | 2.0 | FE-1 |
| FE-3 | M02 評分對齊 | 0.5 | FE-1 |
| FE-4 | M03 月跑 + Stage 流程 | 2.5 | FE-2 |
| FE-5 | M04 白名單管理 | 1.0 | FE-1 |
| FE-6 | M05 快照歷史與比對 | 2.0 | FE-4 |
| 共用 | StageBadge/RoleBadge/Modal 等 | 3.0 | — |

**關鍵路徑**：共用元件 (3) → FE-1 (1.5) → FE-2 (2) → FE-4 (2.5) = 9 人日。FE-3/5/6 可在 FE-1/4 完成後並行。

## B. 技術棧 baseline

- React 18 + TypeScript + TanStack Query
- vitest + React Testing Library（`npx vitest run`）
- 既有 page pattern：`apps/web/src/pages/<feature>/`（含 `__tests__/`、`_components/`）
- 既有 API client：`apps/web/src/api/<resource>.ts`（已含 accounts/assignment-scoring/assignment-codes）
- 既有共用：`apps/web/src/components/layout/`（sidebar）、`components/ui/`（基礎）

## C. 6 個 FE 批次

### FE-1 E02 帳號管理（1.5 人日）

**Prototype**：`prototypes/07-account-list.html`
**Endpoint**：`PATCH /api/v1/accounts/:id/business-role`、`GET /api/v1/accounts`
**檔案**：
- `pages/accounts/account-list-page.tsx`：4 角色 column（admin/director/section_chief/user 單一值）
- `pages/accounts/_components/change-role-dialog.tsx`：radio 4 選 1 + before→after preview
- `pages/accounts/_components/edit-account-modal.tsx`：business_role read-only chip
- `api/accounts.ts`：新增 `updateBusinessRole(id, role)`
- 移除：正交 banner、林宥嘉非法 row

**測試**：4 角色 demo 場景、3 個錯誤碼 toast（409/422/403）。

### FE-2 M01 名單定義（2.0 人日）

**Prototype**：`27-list-definition.html` + `27a-list-create-draft.html` + `27b-list-edit-draft.html`
**Endpoint**：`GET /assignment/lists?ym=&stage=`、`GET /system/current-work-ym`、`POST/PUT /assignment/lists`、`PUT /:listNo/disable`、`DELETE /:listNo`
**檔案**：
- `pages/assignment/list-definition-page.tsx`：MonthPicker + 五階段 KPI + 角色×階段操作矩陣
- `pages/assignment/list-create-draft-page.tsx`：condition_payload builder + 從上月複製 + per-LIST CR
- `pages/assignment/list-edit-draft-page.tsx`：階段守衛（非 draft 顯示 RejectBanner）
- 內嵌 modal：停用 / 推進 / Rollback

**測試**：12 demo 觀察點對應（角色×階段顯示矩陣）。

### FE-3 M02 評分對齊（0.5 人日）

**Prototype**：`prototypes/28-scoring-config.html`
**狀態**：F055 v1.5 後端已就緒，對齊 4 角色：
- 既有 `pages/assignment/scoring-config-page.tsx` 換成 4 角色 RBAC
- M02 對 section_chief/user 整頁封鎖（顯示 ForbiddenPage）

### FE-4 M03 月跑 + Stage（2.5 人日）

**Prototype**：`30-stage0-estimate.html` + `31-trigger-run.html` + `32-run-progress.html`
**Endpoint**：`GET /lists/:listNo/stage-0-estimate`、`POST /assignment/runs`、`GET /runs/:id`（polling）、`PUT /:listNo/dept-ratios`、`PUT /:listNo/personnel-ratios`、`POST /approve|reject|rollback-*`
**檔案**：
- `pages/assignment/stage0-estimate-page.tsx`
- `pages/assignment/trigger-run-page.tsx`（檢查 `ENABLE_E07_REFACTOR_PHASE3`）
- `pages/assignment/run-progress-page.tsx`（3 秒 polling，F062 BR-1）
- `pages/assignment/_components/dept-ratio-form.tsx`（M03a）
- `pages/assignment/_components/personnel-ratio-form.tsx`（M03b）
- `pages/assignment/_components/approve-reject-bar.tsx`（M03c/d）

### FE-5 M04 白名單（1.0 人日）

**Prototype**：`37a-pooldata-whitelist.html` + `37b-categorical-field-values.html`
**Endpoint**：`GET/POST/PATCH/DELETE /pooldata-fields`、`GET/POST/PATCH/DELETE /:col/options`、`GET /:columnName/active-options-count`（F076-C）
**檔案**：
- `pages/assignment/field-whitelist-page.tsx`
- `pages/assignment/field-options-page.tsx`（深連結 `?col=` 整合）
- `_components/category-switch-confirm-modal.tsx`（F076-C 預查）

### FE-6 M05 快照歷史（2.0 人日）

**Prototype**：`33-run-summary.html` + `34-run-history.html` + `35-snapshot-detail.html` + `36-run-compare.html`
**Endpoint**：`GET /assignment/runs`、`GET /runs/:id/progress|summary|export?format=csv|xlsx`、`GET /runs/:id/snapshot/:type`、`GET /runs/compare?runA=&runB=`
**檔案**：
- `pages/assignment/run-summary-page.tsx`
- `pages/assignment/run-history-page.tsx`
- `pages/assignment/snapshot-detail-page.tsx`
- `pages/assignment/run-compare-page.tsx`

## D. 共用 React 元件（3 人日）

路徑：`apps/web/src/components/e07/`

- `StageBadge.tsx`（5 階段色 token）
- `RoleBadge.tsx`（4 角色色 token）
- `MonthPicker.tsx`（前後 1 年）
- `RatioInput.tsx`（即時加總 + 容忍誤差）
- `RejectBanner.tsx`（LocalStorage 記憶 + 折疊）
- `ConfirmModal.tsx`（4 變體：info/warning/danger/success）
- `ResignedEmployeeBadge.tsx`
- `ProxyStatusIndicator.tsx`

## E. 重要設計約束

1. **嚴格遵守 prototype 樣式**：除 demo 元件（角色切換器）外，所有 page/modal/form/table 必須對照 `prototypes/` HTML（layout、color token、間距、字級一致）。
2. 4 角色 dropdown 一致：`admin / director / section_chief / user`。
3. 預設 `setRole('director')`（業務部長視角，最常用 demo）。
4. Section chief 轄區自動 filter。
5. 新頁面 sidebar 已含對應 nav 連結（B9 已對齊），但仍須驗證每個新 route。

## F. 工作量估算

- FE 9.5 人日 + 共用元件 3 人日 = **12.5 人日**
- 並行可能性：FE-3/5/6 在 FE-1/4 完成後互不依賴可並行
- 關鍵路徑：共用 (3) + FE-1 (1.5) + FE-2 (2) + FE-4 (2.5) = 9 人日

## G. 新 Session 啟動 Checklist

1. 讀 `docs/specs/implementation-log/E07-FE-implementation-plan.md`（本文件）
2. 讀 `docs/specs/spec-index.md` v3.3
3. 讀 F002 v2.0 §4.6.2 Controller Guard 對應表
4. 從共用元件開始 → FE-1 E02
5. TDD 紅綠重構流程：先寫 vitest 測試 → RED → 實作 → GREEN → 重構

## H. 風險與依賴

- `ENABLE_E07_REFACTOR_PHASE3` flag 預設 **true**（v3.0 已上線）
- `ASSIGNMENT_PIPELINE_V2` flag 預設 **false**（v2.0 Stage 2/4 不啟用，避免影響既有 v1.0 行為）
- 既有 prototype 已 sidebar 對齊（B9）— 新頁面 sidebar 已含對應 nav 連結
- `ob_emphire` ETL 未上線 → F082 個別業務比例會缺員工姓名（fixture mock）
- 後端 709 PASS 為基準，FE 不得引發 API 行為變更
