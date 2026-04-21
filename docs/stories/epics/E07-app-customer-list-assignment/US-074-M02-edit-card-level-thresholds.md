# US-074：編輯 CARD_LEVEL 分級門檻

> **Story ID**：US-074
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 調整 CARD_LEVEL 的分級門檻（各等級的分數下限）
**So that** 可根據本月客戶評分分佈，重新劃定 A / B / C / D 等級的分界線，確保名單分配比例合理

---

## 驗收標準

### AC-1：顯示目前 CARD_LEVEL 門檻設定

- **Given** 業務主管進入 CARD_LEVEL 設定頁面
- **When** 頁面載入完成
- **Then** 顯示目前各等級（如 A、B、C、D）的分數下限門檻，表格欄位包含：等級代碼、等級名稱、分數下限

### AC-2：修改門檻值並儲存

- **Given** 業務主管進入編輯模式
- **When** 業務主管修改某等級的分數下限，點擊儲存
- **Then** OBLEVELCARD_LEVEL 對應列更新，頁面顯示儲存成功提示
- **And** 若修改後導致等級之間的門檻重疊（例如 B 的下限 >= A 的下限），則顯示驗證錯誤，不允許儲存

### AC-3：門檻變更預覽影響

- **Given** 業務主管修改門檻值
- **When** 修改完成（尚未儲存）
- **Then** 頁面顯示預估影響：「預估各等級客戶分佈：A 級 N 人 / B 級 N 人 / C 級 N 人 / D 級 N 人」（以目前 Pool 資料套用新門檻計算）

---

## 技術備註

- CARD_LEVEL 設定資料：`reference/TableSchema/OB/OBLEVELCARD_LEVEL.sql`
- 計分分數資料：`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`
- 門檻設定與 US-073 的計分維度共享版本草稿機制；若有草稿版本存在，門檻修改亦套用至草稿版本
- 預覽影響計算需載入 OBPOOLDATA 現有客戶的評分分佈（可非即時，允許最多 1 分鐘的快取）

---

## 測試案例

### TC-074-01：顯示現有門檻

- **Given**：OBLEVELCARD_LEVEL 含 A=80、B=60、C=40、D=0
- **When**：業務主管進入 CARD_LEVEL 設定頁
- **Then**：顯示 4 列，等級依序為 A/B/C/D，對應分數下限

### TC-074-02：修改門檻成功

- **Given**：業務主管將 B 級門檻從 60 改為 65
- **When**：點擊儲存
- **Then**：OBLEVELCARD_LEVEL B 級下限更新為 65，頁面顯示儲存成功

### TC-074-03：門檻重疊驗證

- **Given**：A 級下限為 80
- **When**：業務主管將 B 級下限改為 85（高於 A 級）
- **Then**：顯示錯誤「B 級下限不可高於或等於 A 級下限（80）」，不允許儲存

---

## 依賴關係

- **Blocked By**：US-072（需先了解計分版本結構）
- **Blocks**：US-081（月跑的等級劃分依賴此設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 門檻重疊驗證邏輯測試
- [ ] 預覽影響計算測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-072（查看計分設定）、US-073（編輯計分維度）、US-081（觸發月跑）
- **Reference**：`reference/TableSchema/OB/OBLEVELCARD_LEVEL.sql`、`reference/TableSchema/OB/OBLEVELCARD_SCORE.sql`
