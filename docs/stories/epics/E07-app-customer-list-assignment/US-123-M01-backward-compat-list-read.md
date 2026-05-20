---
story-id: US-123
title: 舊名單 backward-compat 讀取（condition_payload IS NULL fallback）
epic: E07 — 客戶名單分派
module: M01 名單定義
priority: Must Have
status: Draft
date: 2026-05-19
version: "1.0"
source-feature-spec: F050-create-list-definition, F051-edit-list-definition
---

# US-123：舊名單 backward-compat 讀取（condition_payload IS NULL fallback）

> **Story ID**：US-123
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）、Admin 或處長（Section Chief）
**I want** 在 v2.1 系統上線後，仍能正常查看遷移自舊系統的名單定義，且這些舊名單不會因格式差異而造成月跑中斷
**So that** 系統上線後業務操作不受舊資料遷移進度影響，月跑可正常執行

---

## 背景說明

F050 v2.1 重構後，`condition_payload` 成為名單篩選條件的唯一來源。然而，舊系統遷移的既有名單（`ob_list_definition` 中 `condition_payload IS NULL` 的記錄）在 Phase 3a **E2 backfill migration** 完成前，仍以 6 個 entity column（`prod_kind` / `caseyear` / `spec_tp` / `settle_src` / `case_status` / `card_type`）儲存篩選條件。

**設計決策（J6）**：
- 6 個 entity column 保留為 **backward-compat 讀取欄位**，不立即刪除
- 舊名單在清單頁、詳情頁以 entity column fallback **唯讀顯示**
- 舊名單的篩選條件**不可在新介面中直接編輯**，需等 Phase 3a E2 backfill migration 一次性轉換後方可
- 月跑 Stage 1 自動 fallback 讀取 entity column（詳見 US-122 AC-4）

**涵蓋 GAP-LIST 項目**：D4、E2、G6、J6

---

## 驗收標準

### AC-1：清單頁舊名單顯示 fallback 摘要

- **Given** 業務主管在 M01 名單定義清單頁（US-105）查看本月名單列表
- **When** 清單中某名單的 `condition_payload` 為 NULL（舊遷移名單）
- **Then** 該名單的「篩選條件摘要」欄位以 fallback 格式呈現 entity column 的值，例如：「（舊格式）PROD_KIND=01$$02；SPEC_TP=02$$04；CASE_STATUS=01$$02」
- **And** 此 fallback 摘要以明顯標示區分（例如灰色字體或「舊格式」前綴標籤），讓使用者知道此名單尚未轉換為新格式
- **And** 摘要顯示只是呈現用途，不代表 condition_payload 已存在

> **業務意義（E2/G6）**：遷移期間業務主管仍可看到舊名單的篩選條件，不會因欄位格式不同而出現空白或錯誤。

---

### AC-2：舊名單篩選條件在新介面中為唯讀（不可編輯）

- **Given** `condition_payload` 為 NULL 的舊名單，且該名單 `stage = 'draft'`
- **When** 部長或 Admin 在清單頁點擊該名單的「編輯」
- **Then** 篩選條件區塊顯示為**唯讀模式**，呈現 entity column 的值，但**所有篩選條件欄位不可修改**（輸入框與操作按鈕均為停用或隱藏）
- **And** 頁面顯示提示訊息：「此名單使用舊格式儲存，篩選條件暫時無法編輯。待系統完成資料轉換後，即可在此介面修改篩選條件。」
- **And** 名單的**其他欄位**（LIST_NM、list_period_start / end / interval）仍可正常編輯儲存
- **And** 部長或 Admin 仍可操作：推進階段、設定 CR 回分開關、停用名單

> **業務意義（E2/J6）**：舊名單的篩選條件轉換為 condition_payload 是一次性的 migration 作業（Phase 3a E2），須由 system-architect 設計 backfill 腳本一次性轉換，不由個別使用者確認觸發。此設計避免部分名單轉換、部分未轉換的混亂狀態。

---

### AC-3：舊名單月跑 fallback 不報錯

- **Given** `condition_payload` 為 NULL 的舊名單，且 `stage = 'ready'`
- **When** 月跑 Stage 1 執行，讀取此名單
- **Then** Stage 1 自動以 entity column fallback 組合 WHERE 條件（見 US-122 AC-4）
- **And** 月跑執行完成，不因 condition_payload 為 NULL 而報錯或中斷
- **And** 月跑執行後名單資料不被修改（condition_payload 仍為 NULL）

> **業務意義（D4/J6）**：E2 backfill migration 完成前，舊名單的月跑不受影響，業務主管可正常執行月跑，不需等待資料轉換。

---

## 技術備註

- 舊名單的 E2 backfill migration（entity column → condition_payload 轉換腳本）由 **Phase 3a system-architect** 設計與執行，不在本 Story 範圍內
- backfill 完成後，所有名單 condition_payload 均有值，US-123 的 fallback 路徑僅作為過渡期保障，長期不再觸發
- 「唯讀模式」的 UI 細節（如何視覺呈現、提示文字格式）由 **Phase 3b ui-ux-designer** 設計
- condition_payload 為 NULL 的判斷邏輯：後端 API 回應中以 `condition_format: "legacy"` 標記舊名單，前端依此決定顯示模式

---

## 測試案例

### TC-123-01：清單頁舊名單顯示 fallback 摘要

- **Given**：名單 `OB202504001` condition_payload = NULL；entity column prod_kind='01'、spec_tp='02$$04'、case_status='01'
- **When**：業務主管進入清單頁
- **Then**：該名單篩選條件欄位顯示「（舊格式）PROD_KIND=01；SPEC_TP=02$$04；CASE_STATUS=01」，有「舊格式」標籤

### TC-123-02：舊名單詳情頁篩選條件為唯讀

- **Given**：名單 `OB202504001` condition_payload = NULL，stage = 'draft'
- **When**：部長點擊「編輯」
- **Then**：篩選條件區塊以唯讀模式顯示，所有條件輸入框停用；顯示提示「此名單使用舊格式儲存，篩選條件暫時無法編輯。」

### TC-123-03：舊名單仍可編輯 LIST_NM 等非篩選欄位

- **Given**：名單 `OB202504001` condition_payload = NULL，stage = 'draft'
- **When**：部長修改 LIST_NM 為「修改後名稱」並儲存
- **Then**：LIST_NM 成功更新；condition_payload 仍為 NULL；篩選條件 entity column 不變

### TC-123-04：舊名單月跑 Stage 1 正常執行

- **Given**：名單 `OB202504001` condition_payload = NULL，stage = 'ready'；entity column prod_kind='01'
- **When**：月跑觸發，Stage 1 讀取此名單
- **Then**：Stage 1 以 entity column fallback 執行，月跑完成不報錯；condition_payload 仍為 NULL

### TC-123-05：新名單（condition_payload 有值）不受影響

- **Given**：名單 `OB202507001` condition_payload 有有效 JSON 條件
- **When**：業務主管進入清單頁或詳情頁
- **Then**：顯示正常條件摘要，無「舊格式」標籤；編輯介面可正常操作

---

## 依賴關係

- **Blocked By**：US-121（condition_payload 的 source of truth 語意定義，舊名單 fallback 是其例外情境）、US-070（修改版，清單頁摘要顯示邏輯需支援 fallback 摘要）
- **Blocks**：（無，為最下游 backward-compat 保障 Story）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 清單頁 fallback 摘要顯示測試（TC-123-01）
- [ ] 編輯頁篩選條件唯讀測試（TC-123-02）
- [ ] 非篩選欄位仍可編輯測試（TC-123-03）
- [ ] 月跑 Stage 1 fallback 不報錯測試（TC-123-04）
- [ ] 新名單不受影響測試（TC-123-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（D4、E2、G6、J6）
- **相關 Stories**：US-070（清單頁，補 fallback 摘要顯示）、US-121（condition_payload 驗證規則）、US-122（月跑 Stage 1 fallback 路徑）
- **Feature Spec**：`docs/specs/features/F050-create-list-definition.md`、`docs/specs/features/F051-edit-list-definition.md`
