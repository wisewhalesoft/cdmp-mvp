# US-084：匯出分派結果

> **Story ID**：US-084
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 將本月分派結果匯出為 Excel 或 CSV 檔案
**So that** 可將名單交付給業務人員使用，或上傳至 CRM / 電話系統，完成最後一哩路

---

## 驗收標準

### AC-1：觸發匯出

- **Given** 月跑已完成（status = 'completed'）
- **When** 業務主管點擊「匯出結果」並選擇格式（Excel / CSV）
- **Then** 系統產生對應格式的檔案，瀏覽器觸發下載
- **And** 匯出檔案名稱格式為：`assignment_result_{YYYYMM}_{run_id 前 8 碼}.xlsx`（或 .csv）

### AC-2：匯出欄位包含關鍵資訊

- **Given** 匯出動作觸發
- **When** 檔案產生完成
- **Then** 匯出檔案包含以下欄位：客戶編號、客戶姓名、CARD_LEVEL 等級、TIER_LEVEL 代碼、分配部門代碼、分配人員工號、分配人員姓名、分配日期
- **And** 每一列代表一筆分派紀錄

### AC-3：匯出大量資料的處理

- **Given** 分派結果超過 50,000 筆
- **When** 業務主管觸發匯出
- **Then** 系統顯示「正在產生檔案，請稍候...」提示，檔案產生完成後自動下載（非阻塞操作）
- **And** 若超過 5 分鐘仍未完成，顯示「檔案產生逾時，請稍後再試或聯繫 IT」

---

## 技術備註

- 匯出資料來源：AssignmentRunSnapshot result 快照（JSONB payload 轉換為表格行）
- 匯出邏輯參照舊系統：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql` 的輸出欄位
- **分配人員姓名（EMP_NM）**：快照 payload 中若已含 EMP_NM 欄位則直接取用；若快照僅存 EMP_ID，匯出時 join AppDB `ob_emphire.EMP_NM`（`ob_emphire` 透過 E04 通用擷取任務每日同步自 OB DB，E07 不另建員工維護功能）。
- 大量資料匯出建議採用串流寫入（streaming）方式，避免記憶體溢出
- 匯出操作記錄至 AssignmentRunExportLog（操作者、匯出時間、格式、檔案大小）

---

## 測試案例

### TC-084-01：正常匯出 CSV

- **Given**：月跑 completed，結果 5,000 筆
- **When**：業務主管選擇 CSV 格式並點擊匯出
- **Then**：瀏覽器下載名稱為 `assignment_result_202505_{run_id前8碼}.csv` 的檔案，含 5,000 列資料

### TC-084-02：匯出欄位驗證

- **Given**：CSV 匯出完成
- **When**：開啟檔案
- **Then**：第一列為表頭，包含客戶編號、客戶姓名、CARD_LEVEL 等級、TIER_LEVEL 代碼、分配部門代碼、分配人員工號、分配人員姓名、分配日期

### TC-084-03：月跑未完成時禁止匯出

- **Given**：AssignmentRun status = 'running'
- **When**：業務主管嘗試匯出
- **Then**：匯出按鈕停用，提示「分派執行中，完成後才能匯出」

---

## 依賴關係

- **Blocked By**：US-081（月跑已完成，快照已寫入）
- **Blocks**：（無）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 匯出欄位完整性測試
- [ ] 大量資料串流測試
- [ ] 月跑執行中禁止匯出測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-081（觸發月跑）、US-083（結果摘要）
- **Reference**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`
