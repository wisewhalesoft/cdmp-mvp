---
last-updated: 2026-06-04
version: v1.0
change-summary: "新增 story：Stage 3/4/ASSIGNDAY 全程使用確定性排序（取代 NEWID()），確保相同輸入可重現、可用手算 oracle 驗證，align Stage 1 OQ-06 先例。"
---

# US-150：Stage 3/4 確定性可重現性保證

> **Story ID**：US-150
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **Feature**：F101 月跑 Stage 3/4 真實比例分派

---

## User Story

**As a** 技術團隊
**I want** Stage 3、Stage 4 員工分配、Stage 4 ASSIGNDAY 分配在相同輸入條件下完全可重現
**So that** 可撰寫手算 oracle 等效性測試（預期值 ↔ 程式實際輸出），驗證算法與業務規則一致，並防止未來實作改動引入回歸

---

## 背景說明

Legacy SP 的差額補足（`NEWID()` 亂數補電銷課/員工）與案件分配順序（`ORDER BY NEWID()`）均為非確定性。此特性在 TypeScript/PostgreSQL 重新實作時**必須以確定性鍵替換**，原因有二：

1. **可測試性**：確定性輸出才能撰寫 oracle 等效性測試（手算 FLOOR 公式 → 對應測試斷言）
2. **JS↔SQL 等效驗證**：Stage 0 試算（JS）與月跑執行（SQL）需使用相同算法邏輯，確定性是等效驗證的前提

本 story 為 US-145/US-146/US-149 的橫切約束，不單獨 block 任何 story，但須在三個 story 實作中同步落地。具體確定性鍵名由架構師決定（align 現有 Stage 1 OQ-06 先例）。

---

## 驗收標準

### AC-1：Stage 3/4/ASSIGNDAY 中不存在任何不確定性排序

- **Given** Stage 3（部門分配）、Stage 4 員工分配、Stage 4 ASSIGNDAY 分配的完整實作
- **When** 代碼審查
- **Then** 不存在任何 `NEWID()`、`Math.random()`、`ORDER BY RANDOM()`、`crypto.randomUUID()` 或其他在相同輸入下產生不同排序的機制
- **And** 所有「差額補足」、「案件分配順序」、「剩餘案件 round-robin」均使用確定性鍵排序
- **And** 確定性鍵名在 F101 spec 中明確記錄（不隱含於實作）

### AC-2：相同輸入執行兩次，結果完全一致

- **Given** 固定測試種子：`ob_dept_pct`、`ob_empl_set`、`ob_calendar`、`ob_monthly_run_result`（Stage 1/2 輸出）輸入不變；兩次執行使用不同 `run_id` 但相同月份與設定
- **When** Stage 3 + Stage 4（含 ASSIGNDAY）執行兩次
- **Then** 兩次的 `(appl_no, dept_id, emplid, assignday)` 四元組集合完全相同，無任何差異
- **And** 此為 automated integration test，可在 CI 中重複執行

### AC-3：Stage 3 手算 oracle 等效性測試

- **Given** 測試種子定義：2 個分處 × 2 個 Tier × 3 間電銷課，`ob_dept_pct` ration 各已知；手算各（`dept_id`, `list_no`, `tier_level`, `obdeptid`）組合的期望件數（FLOOR 公式 + 確定性差額補足規則）
- **When** Stage 3 執行
- **Then** 每個（`dept_id`, `list_no`, `tier_level`, `obdeptid`）組合的實際分配件數 = oracle 期望值，誤差 = 0

### AC-4：Stage 4 手算 oracle 等效性測試

- **Given** 測試種子定義：2 間電銷課 × 2 個 Tier × 各 3 位員工，`ob_empl_set` ration 各已知；手算各（`deptid_m`, `tier_level`, `emplid`）組合的期望件數（FLOOR + ADD_CNT + 剩餘補足規則）
- **When** Stage 4 執行
- **Then** 每個（`deptid_m`, `tier_level`, `emplid`）組合的實際分配件數 = oracle 期望值，誤差 = 0

### AC-5：與 Stage 1 確定性排序先例（OQ-06）保持一致

- **Given** 現有 Stage 1 已採用確定性排序實作（OQ-06 先例，以特定欄位升冪作為排序鍵）
- **When** Stage 3/4 實作選擇確定性鍵
- **Then** 鍵的選擇策略與 Stage 1 保持一致（由架構師在 F101 spec 中明確對齊並記錄）
- **And** 不同排序層級（電銷課層、員工層、案件層）各自使用對應粒度的確定性鍵

---

## 技術備註

- 此 story 為橫切約束，不新增獨立的產品功能，而是對 US-145/US-146/US-149 的實作施加可測試性要求
- 確定性鍵名的選擇由架構師在 F101 spec 撰寫時決定，候選鍵包含（但不限於）：
  - Stage 3 差額補足：`obdeptid` 升冪
  - Stage 4 差額補足：`emplid` 升冪
  - 案件分配順序：`appl_no` 升冪
  - ASSIGNDAY EMP_ORD：`appl_no` 升冪（per-emplid partition）
- `NEWID()` 替換為確定性鍵對最終業務分配結果的**整體統計比例不產生影響**（各課/各員工件數仍由 FLOOR 公式決定）；差異僅在於「哪幾件案件」落入餘數補足的前 N 個電銷課/員工

---

## 測試案例

### TC-150-01：Stage 3 確定性驗證

- **Given**：固定種子（3 課，ration=40/35/25，分組共 100 件）
- **When**：Stage 3 執行兩次（不同 run_id）
- **Then**：兩次每課分配件數完全相同；第二次執行結果 diff = 0

### TC-150-02：Stage 4 確定性驗證

- **Given**：固定種子（2 員工，ration=60/40，電銷課共 101 件）
- **When**：Stage 4 執行兩次（不同 run_id）
- **Then**：兩次每位員工分配件數完全相同；差額補足分配給同一員工

### TC-150-03：Oracle 等效性（Stage 3）

- **Given**：已知 FLOOR 期望值 = {課A: 40, 課B: 35, 課C: 25}，差額=0
- **When**：Stage 3 執行
- **Then**：實際值與 oracle 值完全一致

### TC-150-04：NEWID() 不存在驗證

- **Given**：F101 Stage 3/4/ASSIGNDAY 相關實作檔案
- **When**：靜態代碼掃描（Grep）
- **Then**：搜尋 `NEWID()` / `Math.random()` / `ORDER BY RANDOM()` 結果為空

---

## 依賴關係

- **Blocked By**：US-145（Stage 3 實作，確定性約束須同步落地）
- **Parallel With**：US-146、US-149（三個 story 均須同步實作確定性排序）
- **Blocks**：無

---

## Definition of Done

- [ ] AC-1 代碼審查通過：Stage 3/4/ASSIGNDAY 無任何不確定性排序
- [ ] TC-150-01 ~ TC-150-04 全部通過
- [ ] AC-2 automated integration test 可在 CI 重複執行且穩定通過
- [ ] AC-3 Stage 3 oracle 等效性測試通過（手算值與實際值誤差=0）
- [ ] AC-4 Stage 4 oracle 等效性測試通過
- [ ] 確定性鍵名在 F101 spec 中明確記錄（AC-5 架構師確認）
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)（結果準確性，確定性是可驗證的前提）
- **相關 Stories**：US-145（Stage 3，橫切對象）、US-146（Stage 4，橫切對象）、US-149（ASSIGNDAY，橫切對象）
