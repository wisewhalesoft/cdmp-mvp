# US-073：編輯計分維度與分數

> **Story ID**：US-073
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** 業務主管
**I want** 新增、修改或停用計分維度，以及調整各維度的分數區間設定
**So that** 可在不依賴 IT 的情況下，根據當月業務策略靈活調整客戶評分邏輯

---

## 驗收標準

### AC-1：查看與直接編輯現行計分維度清單

- **Given** 業務主管進入計分設定頁面
- **When** 頁面載入完成
- **Then** 顯示目前生效的所有計分維度清單，可直接點擊進入編輯模式
- **And** 頁面顯示「現行設定」單一視圖，不存在草稿版本或版本切換選單

### AC-2：修改維度分數區間並即時儲存

- **Given** 業務主管修改某維度的分數區間（新增區間、調整條件值或分數）
- **When** 業務主管點擊「儲存」
- **Then** 修改直接寫入生效設定（OBLEVELCARD_SCORE 對應列更新），無草稿暫存流程
- **And** 頁面顯示儲存成功的確認 toast，並即時反映最新設定

### AC-3：新增維度直接生效

- **Given** 業務主管點擊「新增維度」，填入維度名稱、來源欄位、分數區間
- **When** 業務主管點擊「確認新增」
- **Then** 新維度直接寫入 OBLEVELCARD_COLUNM（status = 'active'），立即出現於現行設定清單中
- **And** 新增動作記錄操作者與時間

### AC-4：停用維度（Soft Delete）

- **Given** 業務主管點擊某維度的「停用」按鈕並確認
- **When** 確認停用動作
- **Then** 該維度標記為 status = 'inactive'，不再參與後續月跑的評分計算
- **And** 不刪除既有資料，停用後仍可透過 US-086 快照詳情查詢歷史月跑中該維度的使用記錄

### AC-5：月跑執行中禁止修改（資料鎖）

- **Given** 目前有月跑正在執行（AssignmentRun status = 'running'）
- **When** 業務主管嘗試進入計分設定編輯模式
- **Then** 編輯功能全部停用，頁面顯示「分派執行中，無法修改計分設定」提示
- **And** 月跑完成後，編輯功能自動恢復可用

---

## 技術備註

- 計分維度定義：`reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql`
- 計分分數設定：`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`
- 計分邏輯範例 Stored Procedure：`reference/SP/SP_OBLEVELCARD_S.sql`（可參照業務邏輯）
- **覆寫式編輯**：計分設定採覆寫式更新，無草稿版本、無發布流程、無 rollback 機制；「舊設定」僅透過每次月跑自動產生的快照（US-086）查詢，不提供設定版本切換 UI
- OBLEVELCARD_VERSION 資料表如存在（schema 層面由 system-architect 決定），業務主管介面只顯示「現行設定」一個視圖
- 月跑執行中禁止修改屬於**資料鎖保護**（防止運算中途參數異動），與版本管理概念無關
- 此 Story 的計分結果直接影響 US-081 的 Stage 2 計分流程

> **[ASSUMPTION]** OBLEVELCARD_VERSION 原表無 STATUS 欄位（原表以 SDATE/EDATE 兩個 VARCHAR(8) 欄位表達計分版本生效期間，dump 中 6 筆全部 EDATE='20991231'）。遷移至 AppDB 時補加 `status VARCHAR(10) NOT NULL DEFAULT 'active'`，初值由 SDATE/EDATE 計算（SDATE ≤ 今日 < EDATE 者設為 'active'，否則設為 'inactive'）。本 Story 中「現行設定」視圖即讀取 status='active' 版本，邏輯不變，基於此遷移後欄位。

---

## 測試案例

### TC-073-01：直接修改分數並儲存

- **Given**：目前計分設定「帳齡 > 12 個月」分數為 10
- **When**：業務主管將分數改為 15 並點擊儲存
- **Then**：OBLEVELCARD_SCORE 對應列更新為 15，頁面顯示儲存成功 toast，無版本草稿建立

### TC-073-02：新增維度直接生效

- **Given**：目前有 8 個生效維度
- **When**：業務主管新增維度「持卡年資」並設定分數區間後確認
- **Then**：OBLEVELCARD_COLUNM 新增一列（status = 'active'），頁面立即顯示 9 個維度

### TC-073-03：停用維度

- **Given**：維度「帳齡」目前為啟用狀態
- **When**：業務主管點擊「停用」並確認
- **Then**：OBLEVELCARD_COLUNM 該維度 status 更新為 'inactive'，清單中不再顯示（或標示已停用）

### TC-073-04：月跑執行中禁止修改

- **Given**：目前有月跑正在執行（AssignmentRun status = 'running'）
- **When**：業務主管嘗試點擊「編輯」任何維度
- **Then**：編輯功能停用，顯示「分派執行中，無法修改計分設定」提示，無法進行任何修改

---

## 依賴關係

- **Blocked By**：US-072（需先查看現有設定）
- **Blocks**：US-081（Stage 2 計分邏輯使用現行生效設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 覆寫式修改邏輯測試（無草稿版本產生）
- [ ] 新增 / 修改 / 停用維度功能測試
- [ ] 月跑執行中資料鎖保護測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-072（查看計分設定）、US-081（觸發月跑）、US-086（快照詳情，查詢歷史月跑使用的設定）
- **Reference**：`reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql`、`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`、`reference/SP/SP_OBLEVELCARD_S.sql`
