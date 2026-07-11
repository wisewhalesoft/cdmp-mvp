# US-080：開關 CR 回分規則

> **Story ID**：US-080
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03 分派比例
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** 業務主管
**I want** 切換 CR（Customer Recycling，回收客戶）回分規則的啟用或停用狀態
**So that** 靈活控制本月是否將曾被分派但未成交的客戶重新納入分派名單，而不需要 IT 修改程式邏輯

---

## 驗收標準

### AC-1：顯示 CR 回分規則目前狀態

- **Given** 業務主管進入分派比例頁面的 CR 回分設定區塊
- **When** 頁面載入完成
- **Then** 顯示 CR 回分規則的目前狀態（啟用 / 停用）及生效年月

### AC-2：切換 CR 回分規則狀態

- **Given** 業務主管查看 CR 回分規則區塊
- **When** 業務主管點擊切換開關，並在確認對話框中確認操作
- **Then** CR 回分規則狀態切換（啟用 → 停用 或 停用 → 啟用），並更新 OBASSIGNSET 對應設定欄位
- **And** 記錄操作者與操作時間，頁面顯示切換成功提示

### AC-3：月名單分派執行中禁止切換

- **Given** 目前有月名單分派正在執行
- **When** 業務主管嘗試點擊 CR 回分切換開關
- **Then** 切換開關為停用狀態，提示「分派執行中，無法變更 CR 回分規則」

---

## 技術備註

- CR 回分規則設定儲存於：`reference/TableSchema/OB/OBASSIGNSET.sql`（系統分派設定表）
- Stage 4 名單交換邏輯：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（CR 回分發生在此階段）
- CR 回分規則為全域開關，影響所有部門的本月分派

---

## 測試案例

### TC-080-01：顯示目前 CR 狀態

- **Given**：OBASSIGNSET CR 回分設定為啟用
- **When**：業務主管進入 CR 設定區塊
- **Then**：顯示「CR 回分：啟用」，切換開關顯示為開啟狀態

### TC-080-02：切換 CR 狀態

- **Given**：CR 回分目前為啟用
- **When**：業務主管點擊切換開關並確認
- **Then**：OBASSIGNSET 更新為停用，頁面顯示切換成功，狀態顯示「CR 回分：停用」

### TC-080-03：月名單分派執行中鎖定

- **Given**：AssignmentRun status = 'running'
- **When**：業務主管嘗試點擊切換開關
- **Then**：開關停用，顯示鎖定提示

---

## 依賴關係

- **Blocked By**：US-001（登入驗證）
- **Blocks**：US-081（月名單分派的 Stage 4 CR 回分邏輯受此開關控制）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 切換確認對話框測試
- [ ] 月名單分派執行中鎖定測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-081（觸發月名單分派，CR 設定影響 Stage 4）
- **Reference**：`reference/TableSchema/OB/OBASSIGNSET.sql`、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`
