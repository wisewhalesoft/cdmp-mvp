# US-074：編輯 CARD_LEVEL 分級門檻

> **Story ID**：US-074
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 4 — CARD_LEVEL 門檻）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **版本**：v2（2026-05-14 — 補入 CARD_TYPE 範圍鎖 AC；Tab 位置從 Tab 3 改為 Tab 4，Tab 1 為新增的 CARD_TYPE 管理）

---

## User Story

**As a** 業務主管
**I want** 調整選定計分卡類型（CARD_TYPE）的 CARD_LEVEL 分級門檻（各等級的分數下限）
**So that** 可根據本月客戶評分分佈，重新劃定 A / B / C / D 等級的分界線，確保名單分配比例合理

---

## 驗收標準

### AC-1：依選中 CARD_TYPE 顯示 CARD_LEVEL 門檻設定

- **Given** 業務主管已在 Tab 1 選中某 CARD_TYPE，並切換至 Tab 4（CARD_LEVEL 門檻）
- **When** Tab 4 載入完成
- **Then** 顯示**選中 CARD_TYPE** 目前生效版本（`ob_levelcard_level WHERE card_type = :selectedCardType AND card_version = :activeVersion`）的各等級分數區間（`score_s` ~ `score_e`）與等級代碼（`card_level`），表格欄位：等級代碼、等級名稱、分數下限、分數上限
- **And** 不同 CARD_TYPE 的等級數可能不同（如 S5 僅 A/B 兩級，其餘 H/S/E/E5/M 為 A/B/C/D 四級），UI 與 API 不可硬編碼 4 級邏輯
- **And** Tab 4 頂部清楚標示目前操作的 CARD_TYPE（如「正在編輯：H — 汽車期中名單」）

### AC-2：修改門檻值並儲存

- **Given** 業務主管進入編輯模式，操作對象為 Tab 1 選中的 CARD_TYPE
- **When** 業務主管修改某等級的 `score_s` 或 `score_e`，點擊「儲存」
- **Then** `ob_levelcard_level` 對應列 UPDATE（`card_type` = 選中的 CARD_TYPE），頁面顯示儲存成功提示
- **And** 若修改後導致等級之間的區間重疊（例如 B 的 `score_s` ≤ A 的 `score_e`），顯示驗證錯誤「等級 {level} 的分數區間與 {otherLevel} 重疊，請調整後再儲存」，不允許儲存

### AC-3：門檻變更預覽影響

- **Given** 業務主管修改門檻值（尚未儲存）
- **When** 修改完成
- **Then** 頁面顯示預估影響：「預估各等級客戶分佈：A 級 N 人 / B 級 N 人 / C 級 N 人 / D 級 N 人」（以目前 Pool 資料套用新門檻計算，可非即時，允許最多 1 分鐘快取）

### AC-4：CARD_TYPE 範圍鎖 — 操作僅套用於選中 CARD_TYPE

- **Given** 業務主管在 Tab 4 進行任何修改操作
- **When** API 請求送出
- **Then** 所有寫入操作的 `card_type` 欄位值**固定為 Tab 1 當前選中的 CARD_TYPE**，後端不接受 request 中傳入不一致的 card_type

### AC-5：月名單分派執行中禁止修改（資料鎖）

- **Given** 目前有月名單分派正在執行（`assignment_run` status IN ('pending', 'running')）
- **When** 業務主管嘗試進入 Tab 4 編輯模式
- **Then** 編輯功能全部停用，頁面顯示「分派執行中，無法修改計分設定」提示
- **And** 月名單分派完成後，編輯功能自動恢復可用

### AC-6：未選中 CARD_TYPE 時的提示

- **Given** Tab 1 的 CARD_TYPE 清單為空，或業務主管尚未在 Tab 1 選中任何一筆
- **When** 業務主管切換至 Tab 4
- **Then** Tab 4 顯示提示：「請先在 Tab 1 選擇計分卡類型以查看設定」

---

## 技術備註

- CARD_LEVEL 設定資料：`reference/TableSchema/OB/OBLEVELCARD_LEVEL.sql`（AppDB：`ob_levelcard_level`）
- 計分分數資料：`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`（AppDB：`ob_levelcard_score`）
- **CARD_TYPE 篩選脈絡**：由 Tab 1（US-093）的選中狀態提供，API 請求帶入 `cardType` query param；F055 spec 的 API 設計需反映此變更
- **覆寫式編輯**：與 US-073 一致，無草稿版本機制；舊設定透過月名單分派快照（US-086）查詢
- 預覽影響計算需載入 `ob_pool_data` 現有客戶的評分分佈（可非即時，允許最多 1 分鐘的快取）
- `CARD_LEVEL` 有效值依 `ob_levelcard_level` 中選中 CARD_TYPE 的實際等級為準（不硬編碼 A/B/C/D）

> **[ASSUMPTION]** OBLEVELCARD_VERSION 原表無 STATUS 欄位（原表以 SDATE/EDATE 兩個 VARCHAR(8) 欄位表達計分版本生效期間，dump 中 6 筆全部 EDATE='20991231'）。遷移至 AppDB 時補加 `status VARCHAR(10) NOT NULL DEFAULT 'active'`，初值由 SDATE/EDATE 計算。本 Story 中「目前生效版本」的判斷依據為遷移後 status='active' 欄位。

---

## 測試案例

### TC-074-01：依選中 CARD_TYPE 顯示對應門檻

- **Given**：Tab 1 選中 CARD_TYPE = 'H'；`ob_levelcard_level` 中 H 有 A=80/B=60/C=40/D=0 四筆
- **When**：業務主管切換至 Tab 4
- **Then**：顯示 4 列，等級依序為 A/B/C/D，對應分數區間；頂部顯示「正在編輯：H」

### TC-074-02：S5 僅顯示 A/B 兩級

- **Given**：Tab 1 選中 CARD_TYPE = 'S5'；`ob_levelcard_level` 中 S5 僅 A/B 兩筆
- **When**：業務主管切換至 Tab 4
- **Then**：顯示 2 列（A/B），不顯示 C/D

### TC-074-03：修改門檻成功（特定 CARD_TYPE）

- **Given**：Tab 1 選中 'H'；業務主管將 H 的 B 級門檻從 60 改為 65
- **When**：點擊儲存
- **Then**：`ob_levelcard_level` 中 card_type='H' 的 B 級下限更新為 65，頁面顯示儲存成功

### TC-074-04：門檻重疊驗證

- **Given**：Tab 1 選中 'H'；A 級下限為 80
- **When**：業務主管將 B 級下限改為 85（高於 A 級）
- **Then**：顯示驗證錯誤，不允許儲存

### TC-074-05：月名單分派執行中禁止修改

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管切換至 Tab 4
- **Then**：編輯功能停用，顯示「分派執行中，無法修改計分設定」提示

---

## 依賴關係

- **Blocked By**：US-072（需先了解計分版本結構）、US-093（CARD_TYPE 選中狀態來源）
- **Blocks**：US-075（TIER 對應的 CARD_LEVEL 有效值來源）、US-081（月名單分派的等級劃分依賴此設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] CARD_TYPE 範圍鎖測試通過（AC-4）
- [ ] 門檻重疊驗證邏輯測試
- [ ] 預覽影響計算測試
- [ ] S5 僅 A/B 兩級的不硬編碼測試（TC-074-02）
- [ ] 月名單分派執行中資料鎖保護測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F055（編輯 CARD_LEVEL 分級門檻）
- **相關 Stories**：US-072（查看計分設定）、US-073（編輯計分維度）、US-093（Tab 1 CARD_TYPE 選中狀態）、US-075（TIER_LEVEL 對應）、US-081（觸發月名單分派）
- **Reference**：`reference/TableSchema/OB/OBLEVELCARD_LEVEL.sql`、`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`
