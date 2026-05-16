# US-120：CR 回分儲存位置 spec 落差修正

> **Story ID**：US-120
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** 系統架構師（system-architect）與 spec-writer
**I want** 正式宣告「CR 回分開關」的儲存位置為名單定義實體欄位（`ob_list_definition.cr_enabled`），並明確廢棄透過 OBASSIGNSET 路徑讀取 CR 設定的方式
**So that** 月跑 Stage 3 實作有唯一、明確的 CR 開關來源，消除舊 F059 路徑與新路徑並存的技術債，並確保 CR 開關可在草稿階段 per-LIST_NO 設定

---

## 背景說明

**問題根源**：

現有 F059 spec 描述的 CR 回分邏輯，其開關設定透過 OBASSIGNSET 表路徑讀取（舊系統遺留路徑）。本次 E07 重構（US-107）引入新的 per-LIST_NO CR 開關，儲存於 `ob_list_definition` 實體欄位中。

若兩種路徑並存，月跑 Stage 3 將面臨歧義：
- 讀 OBASSIGNSET → 舊路徑，無 per-LIST_NO 區分
- 讀 `ob_list_definition.cr_enabled` → 新路徑，per-LIST_NO 精確控制

**本 Story 的目的**：
1. 正式宣告新路徑為唯一有效儲存位置
2. 廢棄 F059 程式碼中對 OBASSIGNSET CR 設定的讀取路徑
3. 確立「F059 廢棄」與「US-107 上線」的原子性同步要求

**與 US-107 的關係**：
- US-120 為規格層宣告 story，US-107 為功能實作 story
- 兩者必須同一批次上線（原子性），廢棄 F059 的實作變更由開發者依本 Story 的 AC 執行

---

## 驗收標準

### AC-1：正式宣告 CR 開關儲存位置

- **Given** spec-writer 更新相關 spec 文件（F059 spec 及 data-model.md）
- **When** 文件更新完成
- **Then** F059 spec 明確標記「CR 開關讀取路徑已廢棄，改為 `ob_list_definition.cr_enabled` 欄位」
- **And** data-model.md 中 `ob_list_definition` 表描述新增 `cr_enabled BOOLEAN NOT NULL DEFAULT TRUE` 欄位說明
- **And** 任何 spec 或 story 中對 OBASSIGNSET CR 設定路徑的引用均加入 `[DEPRECATED]` 標記

### AC-2：月跑 Stage 3 實作讀取新路徑

- **Given** 月跑 Stage 3 的實作（F059）已依新路徑重構
- **When** 月跑執行至 Stage 3
- **Then** Stage 3 從 `ob_list_definition.cr_enabled` 讀取每筆名單的 CR 開關值
- **And** Stage 3 **不再**讀取 OBASSIGNSET 的任何欄位以決定 CR 回分邏輯
- **And** 整合測試確認：cr_enabled = true → 執行 CR 回分；cr_enabled = false → 跳過 CR 回分

### AC-3：F059 舊路徑程式碼移除

- **Given** F059 廢棄 PR 完成 code review
- **When** PR 合併至主分支
- **Then** F059 中所有讀取 OBASSIGNSET CR 設定的程式碼已移除（無 dead code 殘留）
- **And** 移除後不影響其他月跑 Stage 的正常運作（Stage 1 / 2 / 4 不受影響）

### AC-4：US-107 與 F059 廢棄的原子性上線保證

- **Given** US-107（per-LIST_NO CR 開關設定）與 US-120（本 story）實作完成
- **When** 準備部署至 Production
- **Then** 部署計劃必須包含：
  1. US-107 新功能 PR（per-LIST_NO CR 開關設定）
  2. F059 廢棄 PR（OBASSIGNSET 舊路徑移除）
  3. US-120 spec 更新（data-model.md / F059 spec 文件）
  上述三項必須在**同一次部署批次**中完成，不得分批上線
- **And** 若任一項未就緒，整批上線取消，月跑 Stage 3 暫停執行

### AC-5：空窗期保護機制

- **Given** 新 CR 開關功能（US-107）尚未上線
- **When** 月跑 Stage 3 被觸發
- **Then** 若系統偵測到 `ob_list_definition.cr_enabled` 欄位不存在（尚未完成 migration），月跑 Stage 3 **不得執行**，回傳明確錯誤：「CR 回分設定尚未遷移完成，Stage 3 已暫停」
- **And** 月跑整體標記為 failed，錯誤訊息記錄於 AssignmentRun.error_message

---

## 技術備註

- **[通知 spec-writer]**：需更新以下文件：
  1. F059 spec：在 CR 回分章節加入「[DEPRECATED] OBASSIGNSET 路徑」標記，並新增「新路徑：ob_list_definition.cr_enabled」說明
  2. data-model.md：`ob_list_definition` 表結構新增 `cr_enabled BOOLEAN NOT NULL DEFAULT TRUE` 欄位描述
  3. 本 Story（US-120）可作為 spec-writer 的更新依據
- **[通知 system-architect]**：
  1. `ob_list_definition` 需新增 `cr_enabled` 欄位（migration script）
  2. migration script 須包含：所有既有名單的 `cr_enabled` 預設為 `true`（保持現行行為）
  3. F059 的 Stage 3 實作需重構，移除 OBASSIGNSET 讀取路徑
- 空窗期保護（AC-5）實作建議：在 Stage 3 前加入 `ob_list_definition.cr_enabled IS NOT NULL` 的 migration check

---

## 測試案例

### TC-120-01：月跑 Stage 3 讀取 cr_enabled 欄位

- **Given**：LIST_NO = 'OB202506001'，`ob_list_definition.cr_enabled = true`；月跑執行至 Stage 3
- **When**：Stage 3 處理 OB202506001
- **Then**：Stage 3 從 `ob_list_definition` 讀取 cr_enabled = true，執行 CR 回分邏輯；**不讀取** OBASSIGNSET 的任何欄位

### TC-120-02：月跑 Stage 3 跳過 cr_enabled = false 的名單

- **Given**：LIST_NO = 'OB202506002'，`ob_list_definition.cr_enabled = false`；月跑執行至 Stage 3
- **When**：Stage 3 處理 OB202506002
- **Then**：Stage 3 跳過 OB202506002 的 CR 回分邏輯；執行日誌記錄「CR 回分已停用」

### TC-120-03：F059 舊路徑移除後不影響其他 Stage

- **Given**：F059 廢棄 PR 合併後，月跑完整執行（Stage 0 ~ 4）
- **When**：月跑完整執行
- **Then**：Stage 1 / 2 / 4 正常完成；不受 F059 廢棄影響；月跑整體 status = 'completed'

### TC-120-04：空窗期保護觸發

- **Given**：`ob_list_definition.cr_enabled` 欄位尚未 migration（欄位不存在）
- **When**：月跑嘗試執行至 Stage 3
- **Then**：Stage 3 不執行；月跑 status = 'failed'；error_message = 「CR 回分設定尚未遷移完成，Stage 3 已暫停」

---

## 依賴關係

- **Blocked By**：無（本 Story 為規格宣告，先於實作確立）
- **Blocks**：US-107（per-LIST_NO CR 開關，依賴本 Story 確立儲存路徑）；F059 廢棄實作（依賴本 Story 作為廢棄依據）
- **與 US-107 原子性同步**：US-120 文件更新 + US-107 功能實作 + F059 廢棄 → 必須同一次部署

---

## Definition of Done

- [ ] AC-1：F059 spec 與 data-model.md 更新，舊路徑加 DEPRECATED 標記（by spec-writer）
- [ ] AC-2：月跑 Stage 3 整合測試通過（cr_enabled true / false 兩種情境）
- [ ] AC-3：F059 舊路徑程式碼 code review 確認已移除
- [ ] AC-4：部署計劃文件確認三項 PR 同批上線
- [ ] AC-5：空窗期保護整合測試通過
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-107（per-LIST_NO CR 回分開關，本 Story 的配套實作）、US-081（月跑觸發，Stage 3 執行）
- **需更新 Spec**：F059 spec（CR 回分舊路徑廢棄宣告）、data-model.md（ob_list_definition.cr_enabled 新增）
