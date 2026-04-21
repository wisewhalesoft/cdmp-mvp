# US-075：編輯 TIER_LEVEL 對應表

> **Story ID**：US-075
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 維護 TIER_LEVEL（客戶等級代碼）與 CARD_LEVEL（計分等級）之間的對應關係
**So that** 確保外部系統（如 CRM）使用的客戶等級代碼能正確對應到本系統的評分等級，避免分派錯誤

---

## 驗收標準

### AC-1：顯示目前 TIER_LEVEL 對應表

- **Given** 業務主管進入 TIER_LEVEL 對應設定頁
- **When** 頁面載入完成
- **Then** 顯示目前所有 TIER_LEVEL 代碼與對應 CARD_LEVEL 的對應清單，欄位包含：TIER_LEVEL 代碼、TIER_LEVEL 名稱、對應 CARD_LEVEL

### AC-2：修改對應關係

- **Given** 對應表已顯示
- **When** 業務主管修改某 TIER_LEVEL 的對應 CARD_LEVEL（下拉選單選擇），點擊儲存
- **Then** 對應關係更新，顯示儲存成功提示
- **And** 修改記錄保留操作者與時間

### AC-3：新增 TIER_LEVEL 對應

- **Given** 對應表已顯示
- **When** 業務主管點擊「新增」，填入 TIER_LEVEL 代碼、名稱、對應 CARD_LEVEL
- **Then** 新增一列對應關係，顯示新增成功提示
- **And** 若 TIER_LEVEL 代碼已存在，顯示錯誤「代碼已存在，請修改現有對應」

---

## 技術備註

- TIER_LEVEL 對應資料：`reference/TableSchema/OB/OBLEVELCARD.sql`（OBLEVELCARD 主表）
- CARD_LEVEL 等級清單來自 US-074 的 OBLEVELCARD_LEVEL 設定
- 此對應表為靜態設定，與計分版本草稿機制無關，直接修改生效版本

---

## 測試案例

### TC-075-01：顯示現有對應清單

- **Given**：OBLEVELCARD 有 5 筆 TIER_LEVEL 對應
- **When**：業務主管進入對應設定頁
- **Then**：顯示 5 列，含代碼、名稱、對應 CARD_LEVEL

### TC-075-02：修改對應成功

- **Given**：TIER_LEVEL「VIP」目前對應 CARD_LEVEL「B」
- **When**：業務主管改為對應「A」，點擊儲存
- **Then**：OBLEVELCARD 對應列更新為 A，顯示儲存成功

### TC-075-03：重複代碼驗證

- **Given**：TIER_LEVEL「VIP」已存在
- **When**：業務主管新增代碼「VIP」
- **Then**：顯示錯誤「代碼 VIP 已存在」

---

## 依賴關係

- **Blocked By**：US-074（需先確認 CARD_LEVEL 等級定義）
- **Blocks**：US-081（月跑的 TIER 對應邏輯依賴此設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 重複代碼驗證測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-074（CARD_LEVEL 門檻）、US-081（觸發月跑）
- **Reference**：`reference/TableSchema/OB/OBLEVELCARD.sql`、`reference/TableSchema/OB/OBLEVELCARD_LEVEL.sql`
