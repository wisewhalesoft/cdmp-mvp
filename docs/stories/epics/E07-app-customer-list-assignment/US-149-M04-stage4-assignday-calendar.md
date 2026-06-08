---
last-updated: 2026-06-04
version: v1.0
change-summary: "新增 story：Stage 4 ASSIGNDAY 指派日分配，複用 ob_calendar（E07-OBCALENDAR-Load ETL）與 Stage 0 calculateDailyEstimate 邏輯計算千分比日曆，確保 estimate≡run 日曆基準一致（I-RUN-EST-01）。"
---

# US-149：月跑 Stage 4 — ASSIGNDAY 指派日分配

> **Story ID**：US-149
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **Feature**：F101 月跑 Stage 3/4 真實比例分派

---

## User Story

**As a** 業務主管
**I want** 每位業務員被分配到的案件，依工作日日曆的千分比設定，均攤至當月各工作日，並寫入 `assignday` 欄位
**So that** 業務員案件不在同一天全部到期，每天收到均勻的工作量，且指派日曆基準與 Stage 0 試算一致，不出現試算與執行日曆不符的矛盾

---

## 背景說明

### 日曆資料來源

指派日曆直接複用現有 `ob_calendar` 表（欄位 `calendar_date`, `rest_flg`，其中 `rest_flg='0'` 為工作日、`'1'` 為假日），由既有 ETL 任務 **E07-OBCALENDAR-Load**（raw OBCALENDAR → ob_calendar，full replace）維護資料。

### 千分比計算複用 Stage 0

千分比 ratio 計算**不另建計算邏輯**，複用 Stage 0 已存在的 `apps/api/src/modules/assignment-list/stage0-estimate.service.ts::calculateDailyEstimate(ym)` 方法（`calendarSource` 預設 `'weekday'`，採用 `resolveCalendarDay`）。其邏輯為：

- `baseRatio = FLOOR(1000 / workingDays)`
- 最後 `remainder` 個工作日（依 `calendar_date DESC`）各 +1（使總和 = 1000）
- 各工作日對應一個 (casedt, ratio_rate) 對

### estimate≡run 一致性原則（I-RUN-EST-01）

Stage 0 試算與月跑 ASSIGNDAY 使用同一個 `calculateDailyEstimate(ym)` 邏輯與同一份 `ob_calendar` 資料，確保業務主管看到的「每日試算件數」與實際執行後的「每日指派件數」在日曆基礎上保持一致。

---

## 驗收標準

### AC-1：依 ob_calendar 千分比計算各員工每日 ASSIGNDAY 件數

- **Given** 員工 E1 本月共 30 件案件；`ob_calendar` 中目標月份有 20 個工作日（rest_flg='0'）；`calculateDailyEstimate(ym)` 計算結果：baseRatio=50（FLOOR(1000/20)），最後 0 天補 1（1000 mod 20=0），20 個 casedt 各 ratio_rate=50
- **When** Stage 4 計算 E1 的 ASSIGNDAY
- **Then** 每個 casedt 分得 `FLOOR(30 × 50 / 1000)` = 1 件（共 20 × 1 = 20 件）；最後一個 casedt 吸收剩餘 10 件（30−20=10）
- **And** E1 所有 30 件案件均取得非空 `assignday`

### AC-2：最後一個 casedt 吸收所有 FLOOR 捨去差額

- **Given** 員工 E2 共 21 件案件；20 個工作日各 ratio_rate=50；FLOOR(21×50/1000)=1 件/日，20 日合計 20 件，差額=1
- **When** ASSIGNDAY 計算
- **Then** 前 19 個 casedt 各得 1 件；最後一個 casedt（最末工作日）得 2 件（1+差額 1）；合計 21 件

### AC-3：per-員工排序使用確定性鍵（EMP_ORD 分配）

- **Given** E1 的 30 件案件需先建立員工內排序（EMP_ORD）才能依序對應 casedt
- **When** 系統建立 E1 案件的 EMP_ORD 排序
- **Then** 排序使用確定性鍵（具體鍵由架構師決定），不使用 NEWID() 或 Math.random()
- **And** 相同輸入執行兩次，E1 每件案件對應的 `assignday` 完全一致

### AC-4：跨 Tier 剩餘案件補足（DIVIDE_LEFT 機制）

- **Given** 所有 Tier 的 ASSIGNDAY 主迴圈完成後，部分案件因 FLOOR 捨去而未取得 ASSIGNDAY（DIVIDE_LEFT）
- **When** 全 Tier 迴圈結束後執行補足步驟
- **Then** 每位員工的剩餘案件依 `(ASSIGN_ORDER−1) % workingDays + 1` 對應到第 N 個 casedt（round-robin），排序鍵使用確定性鍵（tier_level 升冪 + 案件排序鍵）
- **And** 補足後所有有 emplid 的案件均取得 `assignday`

### AC-5：ob_calendar 當月無工作日資料時，ASSIGNDAY 保持 NULL，月跑不中斷

- **Given** `ob_calendar` 中目標月份無任何 rest_flg='0' 的工作日記錄
- **When** Stage 4 試圖計算 ASSIGNDAY
- **Then** 月跑**不中斷**，所有案件 `assignday` 保持 NULL（或空字串）
- **And** 寫入 `assignment_audit_log`（`event='ASSIGNDAY_NO_CALENDAR_WARN'`, `list_no`, `work_ym`）
- **And** 月跑完成摘要頁（US-083）顯示「指派日警告：{work_ym} 月份尚無工作日曆資料，所有案件指派日為空」

### AC-6：estimate≡run 一致性（I-RUN-EST-01）

- **Given** Stage 0 試算使用 `calculateDailyEstimate(ym='202607')` 計算的 casedt 清單
- **When** 月跑 Stage 4 計算同月份的 ASSIGNDAY
- **Then** 月跑 ASSIGNDAY 使用的工作日清單與 Stage 0 試算使用的工作日清單來自同一次 `calculateDailyEstimate(ym='202607')` 呼叫（或等效的共享計算路徑）
- **And** 若 `ob_calendar` 資料未在兩次計算之間發生變更，Stage 0 試算中各日期的案件件數比例與月跑 ASSIGNDAY 的分配比例保持一致

---

## 技術備註

- 日曆資料來源：`ob_calendar` 表（不使用 `ob_assign_set`；`ob_assign_set` 在 F101 中為 vestigial，是否移除交由架構師決定）
- 千分比計算：複用 `apps/api/src/modules/assignment-list/stage0-estimate.service.ts::calculateDailyEstimate(ym)`；不另建計算邏輯
- `calendarSource` 預設值 `'weekday'`；`resolveCalendarDay` 根據 `ob_calendar.rest_flg` 判斷工作日
- 業務規則依據：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql` STEP 10–13（ASSIGNDAY 分配段，含 OBASSIGNSET 查詢 + DIVIDE_LEFT 補足機制）
- 確定性排序鍵由架構師決定（align OQ-06 先例）
- 此 story 緊接 US-146（emplid 已寫入）之後執行，同屬 Stage 4 事務範圍

---

## 測試案例

### TC-149-01：標準千分比等分（無餘數）

- **Given**：E1 共 1000 件；20 個工作日各 ratio_rate=50
- **When**：ASSIGNDAY 計算
- **Then**：每個 casedt 各得 `FLOOR(1000×50/1000)=50` 件；總和=1000

### TC-149-02：最後一筆吸收 FLOOR 差額

- **Given**：E1 共 1001 件；20 個工作日各 ratio_rate=50（1000/20=50，無餘數）
- **When**：ASSIGNDAY 計算
- **Then**：前 19 個 casedt 各得 50 件；最後一個 casedt 得 51 件（50 + 差額 1）；合計 1001 件

### TC-149-03：ob_calendar 無資料 fallback

- **Given**：ob_calendar 無目標月份 rest_flg='0' 的記錄
- **When**：Stage 4 執行
- **Then**：月跑正常完成；`ob_monthly_run_result.assignday` = NULL；audit_log 含 `ASSIGNDAY_NO_CALENDAR_WARN`

### TC-149-04：estimate≡run 一致性驗證

- **Given**：ob_calendar 含 202607 月份 22 個工作日；Stage 0 試算與月跑使用同一 calculateDailyEstimate(ym='202607')
- **When**：Stage 0 試算後執行月跑（ob_calendar 未變更）
- **Then**：Stage 0 試算中第 N 個工作日的 ratio_rate 與月跑 ASSIGNDAY 分配中第 N 個 casedt 的 ratio_rate 相同

---

## 依賴關係

- **Blocked By**：US-146（emplid 必須已寫入）、US-151（ob_calendar 有當月工作日資料；無資料時以 AC-5 fallback 降級）
- **Blocks**：無（月跑流程最後一步）

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-6 全部通過
- [ ] TC-149-01 ~ TC-149-04 全部通過
- [ ] ASSIGNDAY 計算複用 `calculateDailyEstimate(ym)` 而非另建邏輯（code review 確認）
- [ ] `ob_assign_set` 未被 F101 引用（vestigial 狀態，不新增任何對它的查詢）
- [ ] ob_calendar 無資料 fallback：月跑不中斷，ASSIGNDAY=NULL，audit_log 有記錄
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)、[NFR-004](../../non-functional/NFR-004-snapshot-integrity.md)、[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-146（Stage 4 員工分配，前置）、US-150（確定性保證）、US-151（ob_calendar 資料來源依賴）
- **共享邏輯**：`apps/api/src/modules/assignment-list/stage0-estimate.service.ts::calculateDailyEstimate`
- **Reference SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`（STEP 10–13 ASSIGNDAY 段）
