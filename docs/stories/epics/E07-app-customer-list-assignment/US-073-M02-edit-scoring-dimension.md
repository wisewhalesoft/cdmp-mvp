# US-073：編輯計分維度與分數

> **Story ID**：US-073
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 2 — 計分維度）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8
> **版本**：v3（2026-05-18 — 補入 AC-7：修改 match_type 自動清空 scores；補入 match_type 三模式定義）

---

## User Story

**As a** 業務主管
**I want** 新增、修改或停用計分維度，以及調整各維度的分數區間設定
**So that** 可在不依賴 IT 的情況下，根據當月業務策略靈活調整客戶評分邏輯

---

## 驗收標準

### AC-1：查看與直接編輯現行計分維度清單（依選中 CARD_TYPE）

- **Given** 業務主管在 Tab 1 已選中某 CARD_TYPE，並切換至 Tab 2（計分維度）
- **When** 頁面載入完成
- **Then** 顯示**選中 CARD_TYPE** 目前生效版本的所有計分維度清單，可直接點擊進入編輯模式
- **And** 頁面顯示「現行設定」單一視圖，不存在草稿版本或版本切換選單
- **And** Tab 2 頂部清楚標示目前操作的 CARD_TYPE（如「正在編輯：H — 汽車期中名單」）

### AC-2：修改維度分數區間並即時儲存

- **Given** 業務主管修改選中 CARD_TYPE 某維度的分數區間（新增區間、調整條件值或分數）
- **When** 業務主管點擊「儲存」
- **Then** 修改直接寫入生效設定（`ob_levelcard_score` 對應列更新），無草稿暫存流程
- **And** 頁面顯示儲存成功的確認 toast，並即時反映最新設定

### AC-3：新增維度直接生效（隸屬選中 CARD_TYPE）

- **Given** 業務主管點擊「新增維度」，填入維度名稱（column_label）、來源欄位（column_name）、分數區間
- **When** 業務主管點擊「確認新增」
- **Then** 新維度直接寫入 `ob_levelcard_column`（`card_type` = 選中的 CARD_TYPE，`card_version` = active 版本號，`status` = 'active'），立即出現於現行設定清單中
- **And** 新增動作記錄操作者與時間至 `assignment_audit_log`

### AC-4：停用維度（Soft Delete）

- **Given** 業務主管點擊選中 CARD_TYPE 某維度的「停用」按鈕並確認
- **When** 確認停用動作
- **Then** 該維度標記為 status = 'inactive'，不再參與後續月跑的評分計算
- **And** 不刪除既有資料，停用後仍可透過 US-086 快照詳情查詢歷史月跑中該維度的使用記錄

### AC-5：月跑執行中禁止修改（資料鎖）

- **Given** 目前有月跑正在執行（`assignment_run` status IN ('pending', 'running')）
- **When** 業務主管嘗試進入計分設定編輯模式（Tab 2）
- **Then** 編輯功能全部停用，頁面顯示「分派執行中，無法修改計分設定」提示
- **And** 月跑完成後，編輯功能自動恢復可用

### AC-7：修改 match_type 自動清空 scores（強制重設）

- **Given** 業務主管將某計分維度的 `match_type` 從現有值（`CATEGORY` / `RANGE` / `COMPOSITE`）改為另一值
- **When** 業務主管儲存修改
- **Then** 系統**自動刪除**該維度在 `ob_levelcard_score` 中的所有現有分數列，不保留任何舊 scores
- **And** 頁面顯示警告訊息「比對模式已變更，原有分數設定已清除，請重新填入分數區間」
- **And** 業務主管須重新輸入該維度所有分數區間後才能完成設定
- **And** 清空動作與 match_type 更新在同一 DB transaction 中執行（原子性）；若任一失敗則整體 rollback

> **業務理由**：CATEGORY / RANGE / COMPOSITE 三種模式的分數資料結構不相容（欄位語意不同），允許保留舊 scores 會導致後續月跑計分邏輯錯誤。自動清空比手動警告提示更能防止資料污染。

> **三模式定義**：
> - `CATEGORY`（類別符合）：level1 欄位為離散類別值（如字串代碼），score 依完全比對 level1 值給予。level2_s / level2_e 不使用，存 NULL。
> - `RANGE`（區間符合）：level1 為 NULL（區間無分群），level2_s / level2_e 定義數值區間（左閉右開或依業務設定），score 依落點給予。
> - `COMPOSITE`（複合條件）：level1 為第一層分群類別（如 PROJECT_TP），相同 level1 內再以 level2_s / level2_e 定義數值子區間；level1 為 partition key，重疊查核範圍限定在相同 level1 內。

### AC-6：CARD_TYPE 範圍鎖 — 操作僅套用於選中 CARD_TYPE

- **Given** 業務主管在 Tab 2 進行任何新增 / 修改 / 停用操作
- **When** API 請求送出
- **Then** 所有寫入操作的 `card_type` 欄位值**固定為 Tab 1 當前選中的 CARD_TYPE**，後端 API 不接受 request body 中自行傳入不同的 card_type（若傳入與 URL/session 不一致的 card_type 則回傳 400 或忽略）
- **And** 如果業務主管在 Tab 2 操作過程中，Tab 1 的選中 CARD_TYPE 發生變動（例如另開分頁），系統顯示「計分卡類型已變更，請重新整理頁面」提示

---

## 技術備註

- 計分維度定義：`reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql`（AppDB：`ob_levelcard_column`）
- 計分分數設定：`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`（AppDB：`ob_levelcard_score`）
- 計分邏輯範例 Stored Procedure：`reference/SP/SP_OBLEVELCARD_S.sql`（可參照業務邏輯）
- **覆寫式編輯**：計分設定採覆寫式更新，無草稿版本、無發布流程、無 rollback 機制；「舊設定」僅透過每次月跑自動產生的快照（US-086）查詢，不提供設定版本切換 UI
- **CARD_TYPE 篩選脈絡**：由 Tab 1（US-093）的選中狀態提供，API 請求帶入 `cardType` param；F054 spec 的 API 設計需反映此變更
- 月跑執行中禁止修改屬於**資料鎖保護**（防止運算中途參數異動），與版本管理概念無關
- 此 Story 的計分結果直接影響 US-081 的 Stage 2 計分流程

> **[ASSUMPTION]** OBLEVELCARD_VERSION 原表無 STATUS 欄位（原表以 SDATE/EDATE 兩個 VARCHAR(8) 欄位表達計分版本生效期間，dump 中 6 筆全部 EDATE='20991231'）。遷移至 AppDB 時補加 `status VARCHAR(10) NOT NULL DEFAULT 'active'`，初值由 SDATE/EDATE 計算（SDATE ≤ 今日 < EDATE 者設為 'active'，否則設為 'inactive'）。本 Story 中「現行設定」視圖即讀取 status='active' 版本，基於此遷移後欄位。

---

## 測試案例

### TC-073-01：直接修改分數並儲存（特定 CARD_TYPE）

- **Given**：Tab 1 選中 CARD_TYPE = 'H'；H 的計分設定「帳齡 > 12 個月」分數為 10
- **When**：業務主管將分數改為 15 並點擊儲存
- **Then**：`ob_levelcard_score` 中 card_type='H' 對應列更新為 15；頁面顯示儲存成功 toast；無版本草稿建立；稽核日誌記錄 CARD_TYPE='H' 的修改

### TC-073-02：新增維度直接生效（隸屬選中 CARD_TYPE）

- **Given**：Tab 1 選中 CARD_TYPE = 'H'；目前有 8 個生效維度
- **When**：業務主管新增維度「持卡年資」並設定分數區間後確認
- **Then**：`ob_levelcard_column` 新增一列（card_type='H', status='active'），頁面立即顯示 9 個維度

### TC-073-03：停用維度

- **Given**：Tab 1 選中 CARD_TYPE = 'H'；維度「帳齡」目前為啟用狀態
- **When**：業務主管點擊「停用」並確認
- **Then**：`ob_levelcard_column` 該維度 status 更新為 'inactive'，清單中不再顯示（或標示已停用）

### TC-073-04：月跑執行中禁止修改

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管嘗試點擊「編輯」任何維度
- **Then**：編輯功能停用，顯示「分派執行中，無法修改計分設定」提示，無法進行任何修改

### TC-073-06：修改 match_type 自動清空 scores

- **Given**：Tab 1 選中 CARD_TYPE = 'H'；維度「帳齡」的 match_type = 'RANGE'，且 `ob_levelcard_score` 中該維度已有 5 筆分數列
- **When**：業務主管將 match_type 改為 'CATEGORY' 並點擊儲存
- **Then**：`ob_levelcard_score` 中該維度的 5 筆分數列全部刪除；頁面顯示「比對模式已變更，原有分數設定已清除，請重新填入分數區間」；業務主管需重新填入 CATEGORY 模式的分數設定

### TC-073-07：match_type 清空與更新失敗時整體 rollback

- **Given**：維度「帳齡」的 match_type = 'RANGE'，有 5 筆分數列；scores 清空成功但 match_type 更新因 DB 錯誤失敗
- **When**：transaction rollback
- **Then**：`ob_levelcard_score` 5 筆分數列仍然存在，`match_type` 仍為 'RANGE'，無部分寫入殘留

### TC-073-05：CARD_TYPE 範圍鎖 — 後端拒絕錯誤的 card_type

- **Given**：Tab 1 選中 CARD_TYPE = 'H'
- **When**：前端送出的 API 請求中 card_type 帶入 'S'（模擬異常情境）
- **Then**：後端回傳 400 或忽略，不寫入 CARD_TYPE='S' 的資料

---

## 依賴關係

- **Blocked By**：US-072（需先查看現有設定）、US-093（CARD_TYPE 選中狀態來源）
- **Blocks**：US-081（Stage 2 計分邏輯使用現行生效設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 覆寫式修改邏輯測試（無草稿版本產生）
- [ ] CARD_TYPE 範圍鎖測試通過（TC-073-05）
- [ ] match_type 變更自動清空 scores 測試（TC-073-06）
- [ ] match_type 清空 rollback 測試（TC-073-07）
- [ ] 新增 / 修改 / 停用維度功能測試
- [ ] 月跑執行中資料鎖保護測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F054（編輯計分維度與分數）
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-072（查看計分設定）、US-093（Tab 1 CARD_TYPE 選中狀態）、US-081（觸發月跑）、US-086（快照詳情，查詢歷史月跑使用的設定）
- **Reference**：`reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql`、`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`、`reference/SP/SP_OBLEVELCARD_S.sql`
