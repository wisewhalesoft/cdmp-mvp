# US-071：Stage 0 每日分派數量估算

> **Story ID**：US-071
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 查看 Stage 0（每日電訪名單）的每日預估分派數量
**So that** 可在觸發月跑前評估本月每日工作量配置是否合理，必要時調整比例設定

---

## 驗收標準

### AC-1：顯示 Stage 0 每日估算表

- **Given** 業務主管已進入名單定義頁面並選擇 Stage 0
- **When** 頁面載入估算資料
- **Then** 顯示本月每個工作日的預估分派件數，表格欄位包含：日期、星期、預估件數
- **And** 表格底部顯示本月預估總件數與實際工作天數

### AC-2：估算基準說明

- **Given** Stage 0 估算表已顯示
- **When** 業務主管查看估算說明區
- **Then** 顯示估算所使用的基準參數（例如：Pool 總筆數、每日分派比例係數、排除週末/國定假日邏輯）

### AC-3：估算資料不足時的警示

- **Given** Stage 0 的 Pool 資料（OBPOOLDATA）筆數低於設定門檻（例如 < 1000 筆）
- **When** 估算計算完成
- **Then** 在估算表上方顯示橘色警示：「Pool 資料筆數偏低（現有 N 筆），請確認資料擷取任務已正常執行」

---

## 技術備註

- Stage 0 每日估算邏輯參照：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` 中 Stage 0 相關邏輯
- Pool 資料來源：`reference/TableSchema/OB/OBPOOLDATA.sql`
- 工作日曆（排除假日）：`reference/TableSchema/OB/OBCALENDAR.sql`
- 估算僅為預覽，不寫入資料庫；實際件數以月跑執行結果為準

---

## 測試案例

### TC-071-01：正常顯示每日估算

- **Given**：本月有 22 個工作日，OBPOOLDATA 有 50,000 筆
- **When**：業務主管查看 Stage 0 估算
- **Then**：表格顯示 22 列，每列含日期、星期、預估件數；底部顯示總件數

### TC-071-02：Pool 資料不足警示

- **Given**：OBPOOLDATA 僅 800 筆
- **When**：載入估算頁
- **Then**：顯示橘色警示，提示現有筆數為 800

### TC-071-03：假日不列入估算

- **Given**：本月某日為國定假日（OBCALENDAR 標記）
- **When**：估算計算
- **Then**：該日不出現在估算表中，工作天數相應減少

---

## 依賴關係

- **Blocked By**：US-070（需先確認名單定義已就緒）
- **Blocks**：US-081（估算完成後業務主管才會決定是否觸發月跑）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)
- **相關 Stories**：US-070（名單定義清單）、US-081（觸發月跑）
- **Reference**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`、`reference/TableSchema/OB/OBPOOLDATA.sql`、`reference/TableSchema/OB/OBCALENDAR.sql`
