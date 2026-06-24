---
last-updated: 2026-06-24
version: v1.0
change-summary: "新增 Story：計分引擎 CUS_SEX 分流邏輯——個人/法人分支 + 保證人停用複刻"
---

# US-160：計分引擎 CUS_SEX 分流引擎邏輯（個人/法人分支 + 保證人停用複刻）

> **Story ID**：US-160
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **Feature**：F104 計分引擎 + AD-E07-10-L 全欄對齊 legacy SP

---

## User Story

**As a** 業務主管（Sales Director）
**I want** 月跑 Stage 2 計分引擎對 `CAREA_NO1`/`CAREA_NO2`/`CELLULAR`/`AGE`/`EDUCAT_BACK` 五欄正確依 `CUS_SEX`（個人/法人）分流取值
**So that** 個人客戶使用自身屬性計分、法人客戶因保證人已停用而取 0/default，符合 legacy SP 實際行為，避免個人客戶五欄全部取到 0

---

## 背景說明

Legacy SP（`SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`）對上述五欄的推導邏輯均含 `CUS_SEX` 分流：

```
-- 偽代碼（各 SP 共同模式）
CASE
  WHEN CUS_SEX IN (1,2) THEN
    -- 個人客戶：使用自身屬性（CAREA_NO1/NO2/CELLULAR/BITBE_DATE/EDUCAT_BACK）
  ELSE
    -- 法人客戶：原本使用保證人屬性，但保證人資料已停用 → 恆 0/default
END
```

F103（US-156/157/158）實作的 AD-E07-10-L 並未包含此分流——`CAREA_NO1` 直接映射 `home_phone IS NOT NULL`（未分流，個人/法人同等處理），導致法人案件可能因有 home_phone 而取到非預期的 1，同時個人案件也無法使用正確的區碼欄。

本 Story 落地分流引擎邏輯，為 US-159（AD 修正）的引擎實作部分。

---

## Acceptance Criteria

### AC-1：CAREA_NO1 個人分支取區碼欄有無

- **Given** 個人客戶（`cc.cus_sex IN (1, 2)`），且 `customer_core` 已有 `carea_no1` 欄（見 US-161）
- **When** 計分引擎（PG 下推 + JS oracle）計算 `CAREA_NO1`
- **Then** 取 `cc.carea_no1 IS NOT NULL AND cc.carea_no1 <> ''`（或對應 raw 欄語意）→ 1，否則 → 0；與 legacy `CAREA_NO1 區碼欄有無` 語意等價

### AC-2：CAREA_NO2 個人分支取區碼欄有無

- **Given** 個人客戶，且 `customer_core` 已有 `carea_no2` 欄
- **When** 計分引擎計算 `CAREA_NO2`
- **Then** 同 AC-1 邏輯對應 `cc.carea_no2`；範圍、預設值等與 CAREA_NO1 對稱

### AC-3：CELLULAR 個人分支取 CELLULAR 欄有無

- **Given** 個人客戶，且 `customer_core` 已有 `cellular` 欄（或等效欄，見 US-161）
- **When** 計分引擎計算 `CELLULAR`
- **Then** 取 `cc.cellular IS NOT NULL AND cc.cellular <> ''` → 1，否則 → 0（非 `mobile_phone IS NOT NULL`）

### AC-4：法人分支五欄恆 0/default（保證人停用複刻）

- **Given** 法人客戶（`cc.cus_sex NOT IN (1, 2)` 或 `cus_sex IS NULL`）
- **When** 計分引擎計算 CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK
- **Then**
  - CAREA_NO1/NO2/CELLULAR → 0
  - AGE → 0
  - EDUCAT_BACK → `'02'`（per AC-6 of US-159）
  - 不查保證人任何欄位（保證人資料在 raw 中亦為 0 筆，無需 JOIN）

### AC-5：AGE 個人分支含 >100 排除

- **Given** 個人客戶，`cc.date_of_birth`（或 `bitbe_date`，見 US-161）不為 NULL
- **When** 計算年齡
- **Then**
  - 依 `EXTRACT(YEAR FROM age(cc.date_of_birth))` 計算
  - 若結果 > 100：視為無效，取 0（legacy `>100 排除` 語意）
  - 若 `date_of_birth` 為 NULL：取 0

  - [SCHEMA GAP SG-160-01]：`customer_core` 欄名為 `date_of_birth`（F103 AD 語意）還是 `bitbe_date`（raw 語意）？若 ETL 已改名為 `date_of_birth` 且保持相同資料，引擎沿用 `date_of_birth` 即可。若仍為 `bitbe_date`，AD-E07-10-L 需更新欄名。交使用者 ETL 確認（US-161）。

### AC-6：EDUCAT_BACK 個人分支補零 + 缺值 `'02'`

- **Given** 個人客戶，`cc.education_code` 有值（可能為 1 碼或 2 碼字串）
- **When** 計算 EDUCAT_BACK
- **Then** PG：`RIGHT('0'||cc.education_code, 2)`（左補零至 2 碼）；JS oracle 等價；若 `education_code` 為 NULL → `'02'`

### AC-7：CUS_SEX 值語意確認（PG vs JS）

- **Given** `cc.cus_sex`（或 `cc.gender`）的值域：個人為 1 或 2，法人為其他（含 NULL，legacy `ISNULL(CUS_SEX,3)` 補 3）
- **When** 分流判斷
- **Then** PG 判斷式：`COALESCE(cc.cus_sex::int, 3) IN (1, 2)` 或等效表達式；JS oracle：`Number(cc.cus_sex ?? 3)` 在 [1,2] 內；兩路徑等價；[SCHEMA GAP SG-159-01] 的 cus_sex 欄型別需 ETL 確認

### AC-8：EQ DoD 含分流場景

- **Given** 含個人/法人分支的 EQ 測試 fixture
- **When** 執行 `stage2to4-sql-builder.spec.ts` EQ 群組
- **Then** 個人客戶（cus_sex=1/2）五欄取自身屬性；法人客戶（cus_sex=3/NULL）五欄取 0/default；PG↔JS 等價；邊界：AGE=101 → 0、EDUCAT_BACK=NULL → `'02'`

---

## 技術備註

- **分流位置**：`resolveColumnSource`（PG）/ `resolveColumnValue`（JS）各欄 case 內加 CASE WHEN 分流，或抽取 `isCorporate(cc)` helper 函式
- **保證人複刻**：legacy 有保證人 JOIN（`CUSTGUARANTEE` 表），但資料已全為 0 筆，因此複刻為「法人分支直接取 0/default」，不需 JOIN 保證人表（ETL 亦未引入）
- **CAREA_NO1/NO2 欄名**：依 US-161 cc 新欄 contract 確定後填入，引擎實作前需 US-161 完成

---

## [OPEN QUESTION]

- **OQ-160-01（CAREA_NO1 區碼欄的有無語意）**：legacy `CAREA_NO1` 區碼欄原始值為區碼字串（如 `'02'`）或純有無旗標？若為區碼字串，「有無」的判斷是否為 IS NOT NULL + 非空字串？確認後才能確定引擎 1/0 的 mapping 條件。

---

## Dependencies

- **Blocked By**：US-159（AD-E07-10-L 修正，確立分流架構），US-161（cc 新欄 contract，CAREA_NO1/NO2/CELLULAR/cus_sex/date_of_birth 欄名）
- **Blocks**：US-163（202606 重跑驗收）

---

## Definition of Done

- [ ] CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK 五欄均有 CUS_SEX 分流邏輯（PG + JS）
- [ ] 法人分支五欄恆 0/`'02'`（保證人停用複刻），無保證人 JOIN
- [ ] AGE >100 排除
- [ ] EDUCAT_BACK 補零 + 缺值 `'02'`
- [ ] EQ DoD AC-8 通過
- [ ] `tsc --noEmit -p tsconfig.build.json` 零錯誤

---

## Related

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Architecture Spec**：AD-E07-10-L（修正版，US-159 產出）
- **Legacy Ground Truth**：`reference/SP/SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`（`OR (C.COLUNM='CAREA_NO1' AND ...)` 等區塊）
- **Related Stories**：US-159（AD 修正），US-161（cc 新欄 contract），US-162（縣市欄修正），US-163（驗收）
