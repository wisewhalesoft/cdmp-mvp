# US-096：停用 CARD_TYPE 計分卡類型（級聯刪除）

> **Story ID**：US-096
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 1 — CARD_TYPE 計分卡類型）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 停用已不再使用的計分卡類型，並自動清除其所有下游計分設定紀錄
**So that** 系統不再將該 CARD_TYPE 納入月名單分派計算，且資料保持一致，不留孤兒紀錄

---

## 背景說明

停用 CARD_TYPE 屬於**不可復原的破壞性操作**，需二次確認並顯示影響範圍。級聯刪除範圍限定為計分設定的 5 張下游表（`ob_levelcard_version` / `ob_levelcard_column` / `ob_levelcard_score` / `ob_levelcard_level` / `ob_tier`），不影響歷史月名單分派快照（`assignment_run_snapshot`）及 `ob_pool_data_list` 歷史分派結果。`ob_card_type` 採 hard delete，操作完整紀錄寫入 `assignment_audit_log` 之 before_payload，供歷史追溯。

---

## 驗收標準

### AC-1：停用前顯示影響範圍警示

- **Given** 業務主管在 Tab 1 點擊某 CARD_TYPE 的「停用」按鈕
- **When** 系統開啟確認對話框
- **Then** 對話框顯示以下內容：
  - 操作說明：「停用計分卡類型「{card_type} — {card_name}」後，以下資料將被永久刪除，此操作不可復原：」
  - 各下游表的即將刪除筆數：「計分版本（ob_levelcard_version）：N 筆 / 計分維度（ob_levelcard_column）：N 筆 / 分數設定（ob_levelcard_score）：N 筆 / 等級門檻（ob_levelcard_level）：N 筆 / TIER 對應（ob_tier）：N 筆」
- **And** 對話框包含「確認停用」（紅色危險按鈕）及「取消」兩個選項

### AC-2：有 ob_list_definition 引用時的額外警示

- **Given** `ob_list_definition` 中有 status = 'active' 的名單定義引用了該 card_type
- **When** 系統開啟確認對話框
- **Then** 對話框額外顯示警示文字：「注意：該計分卡仍有 N 筆有效名單定義（ob_list_definition）。停用後這些名單定義的月名單分派將因無計分設定而無法執行，請確認已妥善處理相關名單定義後再停用」
- **And** 「確認停用」按鈕仍可點擊（不強制攔截，但需業務主管自行評估風險）

### AC-3：確認後執行級聯刪除（Hard Delete）

- **Given** 業務主管閱讀警示後點擊「確認停用」
- **When** 系統執行停用
- **Then** 在同一 transaction 中，依序執行：
  1. 刪除 `ob_tier` 中 card_type = :cardType 的所有紀錄
  2. 刪除 `ob_levelcard_score` 中 card_type = :cardType 的所有紀錄
  3. 刪除 `ob_levelcard_level` 中 card_type = :cardType 的所有紀錄
  4. 刪除 `ob_levelcard_column` 中 card_type = :cardType 的所有紀錄
  5. 刪除 `ob_levelcard_version` 中 card_type = :cardType 的所有紀錄
  6. 刪除 `ob_card_type` 中 card_type = :cardType 的紀錄（hard delete）
- **And** 以上全部操作在同一 transaction 完成，任一步驟失敗則全部 rollback
- **And** 完整的停用操作記錄寫入 `assignment_audit_log`（action = 'DELETE', entity_type = 'ob_card_type', entity_id = card_type 值，before_payload 含各表刪除筆數統計）

### AC-4：級聯刪除範圍明確排除項目

- **Given** 停用操作成功執行
- **When** 系統完成 transaction
- **Then** 以下資料**不被刪除，保持原狀**：
  - `assignment_run_snapshot`：歷史月名單分派快照中包含該 CARD_TYPE 的 payload 保留，供歷史查詢（US-086）
  - `ob_pool_data_list`：歷史分派結果中 card_type / tier_level 欄位值保留
  - `ob_list_definition`：名單定義紀錄保留（包含引用該 CARD_TYPE 的 active 名單定義，交由業務主管自行處理）

### AC-5：停用後清單更新

- **Given** 停用成功
- **When** 頁面操作完成（對話框關閉）
- **Then** 已刪除的 CARD_TYPE 不再顯示於 Tab 1 清單（紀錄已不存在）
- **And** 若該 CARD_TYPE 是目前 Tab 1 的選中狀態，則清除選中，Tab 2~5 顯示空狀態提示：「請選擇計分卡類型以查看設定」
- **And** 若清單仍有其他 CARD_TYPE，頁面不自動選中任何一筆（由業務主管主動選擇）

### AC-6：月名單分派執行中禁止停用

- **Given** 目前 `assignment_run` 有 status IN ('pending', 'running') 的紀錄
- **When** 業務主管在 Tab 1 查看清單
- **Then** 所有列的「停用」按鈕均 disabled，不可點擊
- **And** hover 時顯示 tooltip：「分派執行中，無法修改計分設定」

---

## 技術備註

- **級聯刪除 scope（5 張下游表）**：
  - `ob_tier WHERE card_type = :cardType`
  - `ob_levelcard_score WHERE card_type = :cardType`
  - `ob_levelcard_level WHERE card_type = :cardType AND card_version IN (SELECT card_version FROM ob_levelcard_version WHERE card_type = :cardType)`
  - `ob_levelcard_column WHERE card_type = :cardType`
  - `ob_levelcard_version WHERE card_type = :cardType`
- **ob_card_type 本身**：hard delete，紀錄完全清除；歷史追溯透過 F066 月名單分派快照（`assignment_run_snapshot`）查詢
- **排除 scope**：`ob_pool_data_list`、`assignment_run_snapshot`、`ob_list_definition`（歷史資料保留原則）
- **刪除順序**：依 FK 約束順序由子表至父表（ob_tier / ob_levelcard_score → ob_levelcard_level → ob_levelcard_column → ob_levelcard_version → ob_card_type hard delete）
- **Transaction 保護**：6 個步驟同一 transaction，rollback 時所有步驟回復
- **API**：`DELETE /api/v1/assignment/scoring/card-types/:cardType`（詳見 F072 §5）
- **錯誤碼**：`CARD_TYPE_NOT_FOUND`（404）— 操作的 CARD_TYPE 不存在；`SCORING_VERSION_LOCKED`（409）— 月名單分派執行中

---

## 測試案例

### TC-096-01：顯示影響範圍統計

- **Given**：CARD_TYPE 'H' 有 ob_levelcard_version 1 筆 / ob_levelcard_column 8 筆 / ob_levelcard_score 40 筆 / ob_levelcard_level 4 筆 / ob_tier 4 筆
- **When**：業務主管點擊 'H' 的停用按鈕
- **Then**：確認對話框顯示各表筆數：版本 1 筆、維度 8 筆、分數 40 筆、等級門檻 4 筆、TIER 對應 4 筆

### TC-096-02：有 ob_list_definition 引用時顯示額外警示

- **Given**：`ob_list_definition` 有 3 筆 status='active' 且 card_type='H' 的名單定義
- **When**：業務主管點擊 'H' 的停用按鈕
- **Then**：對話框顯示額外警示「注意：該計分卡仍有 3 筆有效名單定義...」；「確認停用」按鈕仍可點擊

### TC-096-03：確認停用後級聯刪除成功

- **Given**：TC-096-01 情境，業務主管點擊「確認停用」
- **When**：系統執行 transaction
- **Then**：ob_tier / ob_levelcard_score / ob_levelcard_level / ob_levelcard_column / ob_levelcard_version 中 card_type='H' 的紀錄全部刪除；ob_card_type 中 card_type='H' 的紀錄被刪除；稽核日誌寫入 DELETE 紀錄

### TC-096-04：Transaction rollback（部分刪除失敗）

- **Given**：模擬 ob_levelcard_version 刪除因 DB constraint 失敗
- **When**：業務主管確認停用
- **Then**：所有已刪除步驟 rollback（ob_tier 等回復）；ob_card_type 紀錄未被刪除（保持原狀）；顯示通用錯誤提示

### TC-096-05：停用後歷史快照資料保留

- **Given**：`assignment_run_snapshot` 有包含 card_type='H' 計分設定的歷史快照
- **When**：停用 'H' 成功後
- **Then**：`assignment_run_snapshot` 中的快照 payload 保持不變，US-086 仍可查詢歷史快照中 'H' 的計分設定

### TC-096-06：月名單分派執行中停用按鈕 disabled

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管查看 Tab 1
- **Then**：所有列的「停用」按鈕均 disabled

---

## 依賴關係

- **Blocked By**：US-093（需先有 Tab 1 清單頁面）
- **Blocks**：無（停用是終點操作）

---

## 待解決問題

- [x] **OQ新-1（Resolved 2026-05-14）**：級聯刪除範圍不包含 ob_pool_data_list — 歷史分派結果保留，只清除計分設定 5 張表（ob_levelcard_version / column / score / level / ob_tier）。

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 影響範圍統計顯示正確（TC-096-01）
- [ ] Transaction rollback 測試通過（TC-096-04）
- [ ] 歷史快照資料保留驗證通過（TC-096-05）
- [ ] 月名單分派鎖定保護測試通過（TC-096-06）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F072（停用 CARD_TYPE / 級聯刪除）
- **相關 Stories**：US-093（查看清單）、US-094（新增）、US-095（編輯）、US-086（歷史快照查詢，確認歷史資料保留）
- **NFR**：[NFR-004](../../non-functional/NFR-004-snapshot-integrity.md)（快照完整性）、[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
