# US-072：查看計分維度設定

> **Story ID**：US-072
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 2 — 計分維度）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2
> **版本**：v2（2026-05-14 — 補入 CARD_TYPE 篩選聯動、PROD_KIND 提示、Tab 切換 AC；原 Tab 1 改為 Tab 2，CARD_TYPE selector 移至 Tab 1 US-093）

---

## User Story

**As a** 業務主管
**I want** 查看目前選定計分卡類型（CARD_TYPE）的生效計分維度設定清單
**So that** 了解該計分卡如何替客戶評分，並評估是否需要調整維度權重或分數

---

## 驗收標準

### AC-1：依選中 CARD_TYPE 顯示計分維度清單

- **Given** 業務主管已在 Tab 1（CARD_TYPE 計分卡類型）選中某 CARD_TYPE，並切換至 Tab 2（計分維度）
- **When** Tab 2 載入完成
- **Then** 顯示該 CARD_TYPE 目前生效版本（`ob_levelcard_version` 中 `card_type = :selectedCardType AND status = 'active'`）的所有計分維度，每列包含：維度欄位（`column_name`）、維度顯示名稱（`column_label`）、各區間分數設定摘要
- **And** 清單依 `column_name` 升序排列

### AC-2：顯示版本資訊與 PROD_KIND 提示

- **Given** 計分維度清單已顯示
- **When** 業務主管查看 Tab 2 頂部
- **Then** 顯示目前選中 CARD_TYPE 的生效版本資訊：`card_type`、`card_name`、`card_version`、`sdate` / `edate`、`created_by` / `created_at`
- **And** `created_by` / `created_at` 於 dump 中常為 NULL（OBLEVELCARD_VERSION 6 筆中 4 筆稽核欄位為 NULL），null 時 UI 顯示為「—」
- **And** 版本資訊旁顯示該 CARD_TYPE 對應的 PROD_KIND badge（prod_kind 的 code_nm，來自 `ob_code_df WHERE tbl_id = 'PROD_KIND'`），作為視覺提示

### AC-3：查看維度詳細分數表

- **Given** 計分維度清單已顯示
- **When** 業務主管點擊某一維度列
- **Then** 展開詳細分數表，顯示各分數區間的條件值與對應分數（來源：`ob_levelcard_score`）

### AC-4：Tab 切換聯動 — 切換 CARD_TYPE 時 Tab 2 自動刷新

- **Given** 業務主管已在 Tab 2 查看某 CARD_TYPE 的計分維度
- **When** 業務主管切換回 Tab 1，選中不同的 CARD_TYPE，再切換回 Tab 2
- **Then** Tab 2 自動依新選中的 CARD_TYPE 重新載入計分維度清單
- **And** 展開的分數詳情（如有）收合，顯示新 CARD_TYPE 的維度清單

### AC-5：該 CARD_TYPE 無生效版本時的空狀態

- **Given** 選中的 CARD_TYPE 在 `ob_levelcard_version` 中無 status = 'active' 的版本（如新建 CARD_TYPE 且版本尚未有維度設定）
- **When** Tab 2 載入完成
- **Then** 顯示空狀態提示：「目前無計分維度，請點擊「新增維度」開始設定」，而非顯示錯誤

### AC-6：未選中任何 CARD_TYPE 時的提示

- **Given** Tab 1 的 CARD_TYPE 清單為空，或業務主管尚未在 Tab 1 選中任何一筆
- **When** 業務主管切換至 Tab 2
- **Then** Tab 2 顯示提示：「請先在 Tab 1 選擇計分卡類型以查看設定」

---

## 技術備註

- 計分版本管理：`reference/TableSchema/OB/OBLEVELCARD_VERSION.sql`（AppDB：`ob_levelcard_version`）
- 計分維度定義：`reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql`（AppDB：`ob_levelcard_column`）
- 計分分數設定：`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`（AppDB：`ob_levelcard_score`）
- 此頁面（Tab 2）為唯讀查看；修改操作由 US-073（Tab 2 編輯）處理
- **CARD_TYPE 篩選脈絡**：由 Tab 1（US-093）的選中狀態提供，透過頁面層級 State / Context 傳遞，Tab 2 的 API 請求帶入 `cardType` query param
- **API**：`GET /api/v1/assignment/scoring/dimensions?cardType=:selectedCardType`（詳見 F053 §5）

> **[ASSUMPTION]** OBLEVELCARD_VERSION 原表無 STATUS 欄位（原表以 SDATE/EDATE 兩個 VARCHAR(8) 欄位表達計分版本生效期間，dump 中 6 筆全部 EDATE='20991231'）。遷移至 AppDB 時補加 `status VARCHAR(10) NOT NULL DEFAULT 'active'`，初值由 SDATE/EDATE 計算（SDATE ≤ 今日 < EDATE 者設為 'active'，否則設為 'inactive'）。Story 層所有 status='active' 之描述均基於此遷移後欄位，非原表欄位。

---

## 測試案例

### TC-072-01：正常顯示選中 CARD_TYPE 的生效版本維度

- **Given**：Tab 1 選中 CARD_TYPE = 'H'；`ob_levelcard_version` 中 H 有一筆 status = 'active'，含 8 個維度
- **When**：業務主管切換至 Tab 2
- **Then**：顯示 H 的 8 個維度列，版本資訊顯示於 Tab 2 頂部，PROD_KIND badge 顯示「汽車」

### TC-072-02：展開維度分數詳情

- **Given**：CARD_TYPE = 'H' 的維度「帳齡」有 4 個分數區間
- **When**：業務主管點擊「帳齡」列
- **Then**：展開顯示 4 個區間，含區間條件與對應分數

### TC-072-03：切換 CARD_TYPE 後 Tab 2 自動刷新

- **Given**：Tab 2 目前顯示 CARD_TYPE = 'H' 的維度（8 個）
- **When**：業務主管切換回 Tab 1 選中 'S'，再切回 Tab 2
- **Then**：Tab 2 顯示 'S' 的維度清單（維度數可能不同），版本資訊更新為 'S' 的版本

### TC-072-04：新建 CARD_TYPE 無維度時顯示空狀態

- **Given**：Tab 1 選中剛新建的 CARD_TYPE = 'X1'，`ob_levelcard_column` 無 X1 的維度
- **When**：業務主管切換至 Tab 2
- **Then**：顯示「目前無計分維度，請點擊「新增維度」開始設定」

### TC-072-05：未選中 CARD_TYPE 時切換至 Tab 2

- **Given**：Tab 1 的 CARD_TYPE 清單為空
- **When**：業務主管切換至 Tab 2
- **Then**：顯示「請先在 Tab 1 選擇計分卡類型以查看設定」

---

## 依賴關係

- **Blocked By**：US-001（登入驗證）、US-093（Tab 1 CARD_TYPE 選中狀態來源）
- **Blocks**：US-073（編輯計分維度需先知道現有設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] Tab 聯動刷新（AC-4）測試通過
- [ ] 空狀態（AC-5 / AC-6）測試通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F053（查看計分維度設定）
- **相關 Stories**：US-093（Tab 1 CARD_TYPE 選中狀態）、US-073（編輯計分維度）、US-074（CARD_LEVEL 門檻）
- **Reference**：`reference/TableSchema/OB/OBLEVELCARD_VERSION.sql`、`reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql`、`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`
