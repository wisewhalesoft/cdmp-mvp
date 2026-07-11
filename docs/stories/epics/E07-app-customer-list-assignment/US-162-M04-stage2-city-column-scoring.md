---
last-updated: 2026-06-24
version: v1.0
change-summary: "新增 Story：計分引擎 HPOST/CPOST/CO_NUM_NM 改讀縣市名欄 + per-card default"
---

# US-162：計分引擎縣市欄修正（HPOST/CPOST/CO_NUM_NM 改讀縣市名 + per-card default）

> **Story ID**：US-162
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **Feature**：F104 計分引擎 + AD-E07-10-L 全欄對齊 legacy SP

---

## User Story

**As a** 業務主管（Sales Director）
**I want** 月名單分派 Stage 2 計分引擎對 `HPOST_NUM_NM`、`CPOST_NUM_NM`、`CO_NUM_NM` 三欄讀取正確的縣市名（而非郵遞號），並依 card_type 套用正確的缺值 default
**So that** 縣市維度的計分能正確命中 legacy score rows（score rows 使用縣市中文名如「臺北市」比對），而非因使用郵遞號而全部不命中導致 +0

---

## 背景說明

AD-E07-10-L（F103 版）記載：
- `HPOST_NUM_NM` → `customer_core.residential_zip`（郵遞號，缺值 `''`）
- `CPOST_NUM_NM` → `customer_core.mailing_zip`（郵遞號，缺值 `''`）
- `CO_NUM_NM` → `customer_core.company_zip`（郵遞號，缺值 `''`）

深度稽核 legacy SP 發現：
- 實際取值來源為 **HPOSTAL_ADD / CPOSTAL_ADD / POSTAL_ADD 的縣市名**（中文，如 `'臺北市'`）
- Score rows 的 LEVEL1 欄也是縣市中文名，用郵遞號比對永遠不中→三欄計分全部 +0
- Per-card default 也不同（並非全部空字串 `''`）：
  - `HPOST_NUM_NM`：H/S → `'臺北市'`；E → `'花蓮縣'`
  - `CPOST_NUM_NM`：全 card → `'臺南市'`
  - `CO_NUM_NM`：H → `'金門縣'`；S → `'高雄市'`

---

## Acceptance Criteria

### AC-1：HPOST_NUM_NM 改讀縣市名欄

- **Given** `customer_core.hpost_city`（US-161 定義，ETL 已引入縣市名）
- **When** 計分引擎計算 `HPOST_NUM_NM`（PG 下推 + JS oracle）
- **Then** 取 `cc.hpost_city`（字串，縣市中文名）；缺值 default 依 card_type：H/S → `'臺北市'`，E → `'花蓮縣'`，其他 card_type → `'臺北市'`（[OPEN QUESTION OQ-162-01]）；不再使用 `residential_zip`

### AC-2：CPOST_NUM_NM 改讀縣市名欄

- **Given** `customer_core.cpost_city`（US-161 定義）
- **When** 計分引擎計算 `CPOST_NUM_NM`
- **Then** 取 `cc.cpost_city`；缺值 default：所有 card_type → `'臺南市'`；不再使用 `mailing_zip`

### AC-3：CO_NUM_NM 改讀縣市名欄

- **Given** `customer_core.co_city`（US-161 定義）
- **When** 計分引擎計算 `CO_NUM_NM`
- **Then** 取 `cc.co_city`；缺值 default 依 card_type：H → `'金門縣'`，S → `'高雄市'`，其他 card_type → `'高雄市'`（[OPEN QUESTION OQ-162-01]）；不再使用 `company_zip`

### AC-4：per-card default 以 COALESCE 注入

- **Given** `cc` 為 NULL（無對應 `customer_core` 紀錄）或 `hpost_city`/`cpost_city`/`co_city` 為 NULL
- **When** 計算三欄計分
- **Then** PG 表達式使用 `COALESCE(cc.hpost_city, <card_default>)` 形式，`<card_default>` 由 `buildStage2ScoreExpr` 組裝時依 card_type 注入為字串常數；JS oracle 等價邏輯

### AC-5：EQ DoD 含縣市欄場景

- **Given** EQ 測試 fixture 含 hpost_city='臺北市'（有值）+ NULL（缺值，驗 default）兩種情況，各 card_type 分別測試
- **When** 執行 EQ 群組測試
- **Then** PG↔JS 等價；缺值各 card_type 命中對應 default；有值時命中 score rows 對應分數（若 score rows 中有 '臺北市' row）

### AC-6：廢用郵遞號欄（residential_zip / mailing_zip / company_zip）作為計分來源

- **Given** `HPOST_NUM_NM`/`CPOST_NUM_NM`/`CO_NUM_NM` 三欄已改讀縣市名欄
- **When** 完成引擎修正
- **Then** `resolveColumnSource` / `resolveColumnValue` 中三欄的 case 不再引用 `residential_zip`/`mailing_zip`/`company_zip`；相關舊測試（若有）更新；`CustomerCoreRow` interface 的郵遞號欄仍保留（其他可能用途），但計分路徑改用縣市名欄

---

## 技術備註

- **per-card default 實作**：`buildStage2ScoreExpr` 已接受 `cardType` 參數；per-card default 可建一個常數映射 `CITY_DEFAULTS`，依 `(column, cardType)` 查對應 default 字串，注入 `COALESCE` 第二參數
- **舊欄仍保留**：`residential_zip`/`mailing_zip`/`company_zip` 是 F103 引入的欄，可繼續存在於 `customer_core` 和 `CustomerCoreRow`，僅計分路徑改為不使用
- **ETL 依賴**：三縣市欄（`hpost_city`/`cpost_city`/`co_city`）須 ETL 引入後才能實作（依賴 US-161 完成及使用者 ETL 完成）

---

## [OPEN QUESTION]

- **OQ-162-01（per-card default 完整映射）**：現有 default 僅確認 H/S/E 的 `HPOST_NUM_NM` 及 H/S 的 `CO_NUM_NM`。S5/E5/M/HM 的各縣市欄 default 值為何？需比對各 SP 中對應 `ELSE` 條件的縣市值。若 legacy 未記載某 card_type，建議使用「最常見 default」（`'臺北市'`/`'臺南市'`/`'高雄市'`）並 log warning。

---

## Dependencies

- **Blocked By**：US-159（AD-E07-10-L 修正），US-161（cc 新欄 contract + ETL 引入縣市欄）
- **Blocks**：US-163（202606 重跑驗收）

---

## Definition of Done

- [ ] HPOST/CPOST/CO_NUM_NM 三欄改讀縣市名欄（非郵遞號）
- [ ] per-card default 依 card_type 正確套用（H/S/E/其他）
- [ ] `COALESCE` 表達式含 card_type 分支 default
- [ ] EQ DoD AC-5 通過
- [ ] 舊的郵遞號表達式從三欄 case 移除
- [ ] `tsc --noEmit -p tsconfig.build.json` 零錯誤

---

## Related

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Architecture Spec**：AD-E07-10-L（修正版，US-159 產出）
- **Legacy Ground Truth**：`reference/SP/SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`（`HPOST_NUM_NM` 等 `OR (C.COLUNM=...)` 區塊）
- **Related Stories**：US-159（AD 修正），US-161（cc 新欄 contract），US-160（CUS_SEX 分流引擎），US-163（驗收）
