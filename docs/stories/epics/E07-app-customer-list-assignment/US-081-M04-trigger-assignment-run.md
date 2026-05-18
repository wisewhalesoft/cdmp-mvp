# US-081：觸發分派月跑

> **Story ID**：US-081
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **版本**：v2（2026-05-18 — 補入 AC-6：分數完整性 soft check；明確 audit log 寫入規則）

---

## User Story

**As a** 業務主管
**I want** 點擊一個按鈕觸發本月的名單分派月跑
**So that** 系統根據目前的名單定義、計分設定、部門比例與人員比例，自動完成全流程分派計算，無需 IT 手動執行 SQL

---

## 驗收標準

### AC-1：前置條件檢查

- **Given** 業務主管在分派執行頁面點擊「執行月跑」按鈕
- **When** 系統進行前置條件驗證
- **Then** 依序檢查以下條件：
  1. **所有本月 active 名單（LIST_NO）均需處於「準備完成（ready）」階段**（OQ-C-02 / US-118 決議：月跑只允許在所有 active 名單皆為 ready 時觸發；任一名單未達 ready 則阻擋月跑）
  2. 本月名單定義已就緒（至少一筆 active + ready 狀態的名單）
  3. 每個 ready 名單（LIST_NO）均有部門比例設定，且各自加總 = 100%（per-LIST_NO，於部門比例設定階段確認）
  4. 所有部門的人員比例加總各自 = 100%（OBEMPLSETMF，於個別業務比例設定階段確認）
  5. 計分版本有生效版本（OBLEVELCARD_VERSION status = 'active'）
  6. 目前無 running 狀態的月跑（防止併發執行）
- **And** 若任一條件未滿足，顯示具體的失敗原因清單，不啟動月跑

> **[OQ-C-02 衍生]**：前置條件 1 的「所有 active 名單均需 ready 」由 US-118（準備完成查詢摘要）流程管理；業務主管可在 US-118 介面中確認所有名單狀態後，再觸發月跑。

### AC-2：月跑啟動並產生 run_id

- **Given** 所有前置條件均已通過
- **When** 業務主管確認執行對話框並點擊「確認執行」
- **Then** 系統建立 AssignmentRun 記錄（status = 'pending'），產生唯一 `run_id`
- **And** 頁面跳轉至執行進度頁（US-082），顯示 `run_id` 與 pending 狀態

### AC-3：月跑依 Stage 順序執行

- **Given** 月跑已啟動
- **When** 後端非同步執行月跑
- **Then** 依序執行各 Stage：
  - Stage 1：建立原始名單（SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list）
  - Stage 2：計分與等級劃分（套用 OBLEVELCARD 計分邏輯）
  - Stage 3：部門分配（SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept，含 motor/motor_c/T5M 變體）；讀取 OBMDEPTPCT 取得部門比例設定，計算結果寫入 OBPOOLDATA_LIST 的 OB_DEPT 欄位。**CR 回分**為部門分配中的優先指定機制，在此 Stage 執行（依 US-080 開關狀態）
  - Stage 4：人員分配（SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid，含 T5/T5M/Motor 等變體）+ **st4_exchange** 10% 交換（SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange，將 T1/T2/T3 新件轉至資深業務員）
- **And** 每個 Stage 完成後更新 AssignmentRun 進度狀態

### AC-4：三份快照原子性寫入

- **Given** 月跑執行完成（所有 Stage 成功）
- **When** 系統寫入執行快照
- **Then** 原子性寫入三份快照至 AssignmentRunSnapshot：
  - config 快照：記錄本次執行時的所有設定參數（計分版本 / 部門比例 / 人員比例 / CR 開關狀態）
  - input_list 快照：記錄進入分派前的原始名單（Stage 1 輸出）
  - result 快照：記錄最終分派結果明細（Stage 4 輸出）
- **And** 三份快照在同一 transaction 中寫入；任一快照寫入失敗則整體回滾，月跑標記為 'failed'

### AC-6：分數完整性 soft check（警告不阻擋）

- **Given** 月跑在 Stage 2（計分）開始前
- **When** 系統針對所有 active CARD_TYPE 執行分數完整性查核
- **Then** 系統檢查以下完整性規則，違規者**不阻擋月跑繼續執行**，但寫入 `assignment_audit_log`：
  1. **有 match_type 但無任何 score 列**：某維度存在 match_type 設定，但 `ob_levelcard_score` 中該維度無任何有效分數列
  2. **RANGE/COMPOSITE 模式中 level2_s > level2_e**：區間起始值大於結束值（邏輯反轉）
  3. **COMPOSITE 模式中相同 level1 partition 內存在 level2 區間重疊**：相同 level1 值下多個 score 列的 level2_s ~ level2_e 區間有交集
- **And** audit log 記錄格式：`{ event: 'SCORE_INTEGRITY_WARN', card_type, column_name, match_type, rule_violated, run_id }`
- **And** 月跑完成後的結果摘要頁（US-083）顯示「分數設定警告」區塊，列出所有違規維度，提示業務主管確認設定是否符合預期
- **And** 若當月無任何 active 維度有 score 設定（全部為空），仍執行月跑但 audit log 記錄 `SCORE_INTEGRITY_WARN` 等級最高警示

> **業務理由**：分數設定異常屬於計分參數問題，不是系統錯誤；阻擋月跑會造成業務流程中斷。soft check + audit log 讓業務主管在事後確認結果，而非事前被阻擋。

### AC-5：月跑失敗處理

- **Given** 月跑執行過程中某 Stage 發生錯誤
- **When** 錯誤被捕獲
- **Then** AssignmentRun status 更新為 'failed'，error_message 記錄失敗 Stage 與錯誤原因
- **And** 快照不寫入（或已寫入部分快照的 transaction 回滾）
- **And** 頁面顯示失敗提示，允許業務主管在修正問題後重新觸發

---

## 技術備註

- Stage 1 邏輯：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`
- Stage 2（計分）：套用 OBLEVELCARD 計分邏輯（參照 `reference/SP/SP_OBLEVELCARD_S.sql`）
- Stage 3（部門分配 + CR 回分）：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（含 motor/motor_c/T5M 變體）；CR 回分為部門分配中的優先指定機制
- Stage 4（人員分配 + st4_exchange）：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`（含 T5/T5M/Motor 等變體）+ `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（T1/T2/T3 新件轉資深業務員 10% 交換）。**Stage 4 員工資訊（姓名、部門等）join AppDB `ob_emphire`（透過 E04 通用擷取任務每日從 OB DB 同步），過濾條件 RESIGN_DATE IS NULL 確保僅分配予在職人員。**
- 月跑為非同步執行，前端透過輪詢或 WebSocket 取得進度（由 US-082 負責進度顯示）
- **執行觸發不受日期限制**：舊系統 SP 要求每月 21 日後才能執行的硬編碼限制已移除，業務主管可隨時觸發（A13）
- **允許整批覆蓋重跑**：同月可多次觸發月跑，每次產生新 run_id，前次結果保留於快照歷史（不刪除）；只阻擋併發執行（running 狀態中禁止再次觸發），不阻擋重跑（A5）
- NFR-003（執行效能）、NFR-004（快照原子性）、NFR-005（結果準確性）均直接約束本 Story

---

## 測試案例

### TC-081-01：前置條件驗證失敗

- **Given**：某個 active 名單（例 LIST_NO 'OB202605001'）在 OBMDEPTPCT 中的部門比例加總為 95%
- **When**：業務主管點擊「執行月跑」
- **Then**：顯示錯誤清單「LIST_NO 'OB202605001' 的部門比例加總為 95%，需調整至 100%」，月跑不啟動

### TC-081-02：月跑成功啟動

- **Given**：所有前置條件通過
- **When**：業務主管確認執行
- **Then**：AssignmentRun 建立，run_id 產生，頁面跳轉至進度頁

### TC-081-03：允許整批覆蓋重跑

- **Given**：本月已有 status = 'completed' 的月跑（run_id = 'prev-001'）
- **When**：業務主管再次點擊「執行月跑」並確認
- **Then**：前置條件通過（completed 狀態不阻擋重跑），系統建立新月跑並產生新 run_id（'new-002'）
- **And**：前次月跑快照（'prev-001'）完整保留於快照歷史，不被覆蓋或刪除

### TC-081-03b：併發執行防護

- **Given**：目前有 status = 'running' 的月跑
- **When**：業務主管嘗試再次點擊「執行月跑」
- **Then**：前置條件失敗，提示「分派執行中，請等待目前月跑完成後再觸發」，新月跑不啟動

### TC-081-05：分數完整性 soft check — 有違規但月跑繼續執行

- **Given**：CARD_TYPE = 'H' 的某維度 match_type = 'RANGE'，但 `ob_levelcard_score` 中無任何對應 score 列
- **When**：月跑啟動，Stage 2 開始前執行 soft check
- **Then**：月跑**繼續執行**（不阻擋）；`assignment_audit_log` 新增一筆 `event='SCORE_INTEGRITY_WARN'` 的記錄，包含 card_type='H'、rule_violated='NO_SCORE_ROWS'；US-083 結果摘要頁顯示「分數設定警告」區塊

### TC-081-06：分數完整性 soft check — COMPOSITE 模式區間重疊

- **Given**：CARD_TYPE = 'H' 某維度 match_type = 'COMPOSITE'，level1 = 'A' 下有兩筆 score：level2_s=0/level2_e=100 與 level2_s=80/level2_e=200（重疊 80-100）
- **When**：Stage 2 soft check 執行
- **Then**：月跑繼續；audit log 記錄 rule_violated='COMPOSITE_LEVEL2_OVERLAP'；結果摘要顯示警告

### TC-081-04：快照原子性（失敗回滾）

- **Given**：月跑執行成功，但寫入 result 快照時發生 DB 錯誤
- **When**：transaction 回滾
- **Then**：三份快照均未寫入，AssignmentRun status 為 'failed'，錯誤訊息記錄快照寫入失敗

---

## 依賴關係

- **Blocked By**：**US-118**（準備完成階段：所有 active 名單需處於「準備完成」階段才可觸發月跑，OQ-C-02）、US-109（部門比例設定）、US-112（個別業務比例設定）、US-079（舊版人員比例設定，現由 US-112 取代）
- **Blocks**：US-082（查看執行進度）、US-083（查看結果摘要）、US-084（匯出結果）、US-085（歷史清單）、US-086（快照詳情）、US-087（差異比對）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 五項前置條件驗證邏輯測試
- [ ] 快照原子性 transaction 測試
- [ ] 併發執行防護測試（running 狀態阻擋）
- [ ] 整批覆蓋重跑測試（completed 狀態允許重跑、舊快照保留）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] 整合測試：完整月跑流程（Stage 1 ~ Stage 4）不拋出未捕獲例外
- [ ] 分數完整性 soft check 測試（TC-081-05、TC-081-06）：違規寫 audit log、月跑不阻擋
- [ ] US-083 結果摘要頁顯示「分數設定警告」區塊（有違規時）
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)、[NFR-004](../../non-functional/NFR-004-snapshot-integrity.md)、[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-070（名單定義）、US-073（計分維度）、US-091（per-LIST_NO 部門比例）、US-079（人員比例）、US-080（CR 設定）、US-082（執行進度）
- **Reference**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（Stage 3 部門分配）、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`（Stage 4 人員分配）、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（Stage 4 st4_exchange）
