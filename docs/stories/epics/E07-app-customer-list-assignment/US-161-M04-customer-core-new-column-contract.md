---
last-updated: 2026-06-24
version: v1.0
change-summary: "新增 Story：定義 customer_core 新欄 contract（供使用者 ETL 對齊）——含 CAREA_NO1/NO2/CELLULAR/縣市欄/cus_sex"
---

# US-161：定義 `customer_core` 新欄 Contract（供 ETL 引入區碼欄與縣市欄）

> **Story ID**：US-161
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行（ETL 前置條件）
> **優先級**：Must Have（P0——引擎修正的前置依賴）
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **Feature**：F104 計分引擎 + AD-E07-10-L 全欄對齊 legacy SP

---

## User Story

**As a** ETL 工程師（Data Engineer / 使用者）
**I want** 取得 `customer_core` 資料表需新增的欄位清單（名稱、資料型別、語意、對應 raw 欄位），以便建立新 extract job 或修改 ETL 管線
**So that** 計分引擎（F104，US-159/US-160）能正確讀取 CAREA_NO1/NO2 區碼欄、CELLULAR 欄、縣市名欄及 CUS_SEX 數值欄，完成 CUS_SEX 分流計分

---

## 背景說明

F103 的 `customer_core` ETL 僅引入：
`gender`（字串）、`date_of_birth`（Date）、`education_code`（字串）、`residential_zip`、`mailing_zip`、`company_zip`（郵遞號字串）、`home_phone`、`contact_phone`、`mobile_phone`（電話字串）

深度稽核 legacy SP 後，計分引擎需要以下**尚未在 `customer_core` 中的欄位**：

| 新欄位（`customer_core` 中的命名）| 對應 raw 來源欄 | 語意 | 資料型別建議 |
|----------------------------------|----------------|------|------------|
| `cus_sex` | `CUS_SEX` | 客戶性別/法人別（1=男、2=女、3=法人；缺值→3） | `smallint` |
| `carea_no1` | `CAREA_NO1` | 戶籍電話區碼（個人客戶）；法人停用 | `varchar(10)` |
| `carea_no2` | `CAREA_NO2` | 聯絡電話區碼（個人客戶）；法人停用 | `varchar(10)` |
| `cellular` | `CELLULAR` | 行動電話號碼（個人客戶）；法人停用 | `varchar(20)` |
| `hpost_city` | `HPOSTAL_ADD` 前段（縣市） | 戶籍地縣市名 | `varchar(10)` |
| `cpost_city` | `CPOSTAL_ADD` 前段（縣市） | 通訊地縣市名 | `varchar(10)` |
| `co_city` | `POSTAL_ADD` 前段（縣市） | 公司地縣市名 | `varchar(10)` |

> **注意**：`BITBE_DATE`（生日）在 F103 已以 `date_of_birth` 引入（`Date` 型別，UTC 安全儲存），引擎直接沿用，**不需新欄**。

此 Story 定義新欄 contract，是引擎修正（US-159/160/162）的 **P0 前置依賴**。Contract 由本 Story 凍結，ETL 實作由使用者負責，引擎實作以本 contract 為準。

---

## Acceptance Criteria

### AC-1：新欄 contract 確認（`cus_sex`）

- **Given** legacy raw `CUS_SEX` 值域：1（男）、2（女）、3 或 NULL（法人/不明）
- **When** ETL 引入 `customer_core.cus_sex`
- **Then** 欄型別為整數（`smallint` 或等效），值為 raw `CUS_SEX` 直接映射（不轉字串）；NULL raw 值 → ETL 保持 NULL（引擎端以 `COALESCE(cus_sex, 3)` 處理）

> **[SCHEMA GAP SG-161-01]**：`customer_core` 現有 `gender` 欄（字串，`'M'`/`'F'`/... 或 `'1'`/`'2'`/...）。若 `gender` 即為 `CUS_SEX` 字串化結果，下游 spec-writer 需確認是否棄用 `gender` 欄（由 `cus_sex` 取代），或兩欄並存。建議：新增 `cus_sex`（整數）、保留 `gender`（F103 現有計分路徑相容），待 F105 統一清理。

### AC-2：新欄 contract 確認（`carea_no1` / `carea_no2`）

- **Given** legacy raw `CAREA_NO1`/`CAREA_NO2`（戶籍/聯絡電話區碼，個人客戶有值，法人為 NULL）
- **When** ETL 引入 `customer_core.carea_no1` / `customer_core.carea_no2`
- **Then** 欄型別為字串（`varchar(10)` 或等效）；raw 有值→保留原值；raw NULL→NULL；引擎端「有無」判斷：`IS NOT NULL AND <> ''` → 1，否則 → 0

### AC-3：新欄 contract 確認（`cellular`）

- **Given** legacy raw `CELLULAR`（行動電話，個人客戶有值，法人為 NULL）
- **When** ETL 引入 `customer_core.cellular`
- **Then** 欄型別字串（`varchar(20)` 或等效）；raw 有值→保留原值；raw NULL→NULL；引擎端「有無」判斷同 AC-2

### AC-4：新欄 contract 確認（縣市欄 `hpost_city` / `cpost_city` / `co_city`）

- **Given** legacy raw `HPOSTAL_ADD`（戶籍地完整地址）、`CPOSTAL_ADD`（通訊地完整地址）、`POSTAL_ADD`（公司地完整地址）
- **When** ETL 從地址字串萃取縣市名（或直接查郵遞號對應表）
- **Then**
  - `hpost_city`：HPOSTAL_ADD 對應縣市名（如 `'臺北市'`、`'新北市'` 等）
  - `cpost_city`：CPOSTAL_ADD 對應縣市名
  - `co_city`：POSTAL_ADD 對應縣市名
  - 欄型別：`varchar(10)`
  - 萃取方式：[OPEN QUESTION OQ-161-01]

  > **[SCHEMA GAP SG-161-02]**：raw `HPOSTAL_ADD` 等為完整地址字串（如 `'臺北市信義區...'`）還是僅縣市代碼（如 `'63'`）？若為地址字串，縣市萃取需取前 3 碼（3 字元縣市名）或透過郵遞號對應表；若已有縣市代碼，則對應中文縣市名需查表。確認 raw 格式後 ETL 方案才能確定。若 raw 無直接可用欄，需確認 SP_GET_CUSTATTRIB 如何取得縣市名（是否已有縣市欄位）。

### AC-5：引擎新欄 interface 定義（`CustomerCoreRow` 擴充）

- **Given** F103 已定義 `CustomerCoreRow` interface（含 gender/date_of_birth 等欄）
- **When** 本 Story 完成 contract 確認
- **Then** `CustomerCoreRow` interface 擴充以下欄位（型別依 AC-1～AC-4）：
  ```typescript
  interface CustomerCoreRow {
    // F103 既有欄位
    source_customer_no: string;
    gender: string | null;
    date_of_birth: Date | null;
    education_code: string | null;
    residential_zip: string | null;
    mailing_zip: string | null;
    company_zip: string | null;
    home_phone: string | null;
    contact_phone: string | null;
    mobile_phone: string | null;
    // F104 新增欄位（本 Story contract）
    cus_sex: number | null;        // [SG-161-01] 整數型
    carea_no1: string | null;      // 戶籍電話區碼
    carea_no2: string | null;      // 聯絡電話區碼
    cellular: string | null;       // 行動電話
    hpost_city: string | null;     // 戶籍地縣市名
    cpost_city: string | null;     // 通訊地縣市名
    co_city: string | null;        // 公司地縣市名
  }
  ```
  此 interface 定義為引擎與 ETL 的 **binding contract**；ETL 輸出欄名須完全對齊。

### AC-6：batch pre-fetch 查詢包含新欄

- **Given** F103 已實作 batch pre-fetch `SELECT ... FROM customer_core WHERE source_customer_no IN (...)`
- **When** 引擎修正（F104）落地
- **Then** SELECT 欄清單補入所有 AC-5 新欄（cus_sex/carea_no1/carea_no2/cellular/hpost_city/cpost_city/co_city）；PG LEFT JOIN 查詢同步擴充；測試 fixture 補入對應欄位值

---

## 技術備註

- **縣市萃取建議方案**（待 OQ-161-01 確認後定案）：
  - 方案 A：地址字串取前 3 字元（`SUBSTRING(HPOSTAL_ADD, 1, 3)`），適用「縣市名在地址開頭」情況（如 `'臺北市...'` → `'臺北市'`）
  - 方案 B：透過郵遞號（`HPOST_NUM`）查縣市對應表（`ob_postal_code_city` 或等效靜態表）
  - 方案 C：SP_GET_CUSTATTRIB 已有縣市欄，直接引入
- **非 CDMP 引擎工作**：縣市萃取在 **ETL 端**完成，引擎只讀取 `customer_core.hpost_city` 等已萃取的結果欄，不在引擎做地址解析

---

## [OPEN QUESTION]

- **OQ-161-01（縣市欄萃取方案）**：raw `HPOSTAL_ADD`/`CPOSTAL_ADD`/`POSTAL_ADD` 的格式為何（完整地址字串 vs 縣市代碼）？ETL 萃取縣市名的最可靠方案為何？是否有郵遞號→縣市名對照表可用（`ob_postal_code_city` 或其他）？**由使用者/ETL 工程師確認並決定萃取方案，確認後 contract 才能凍結。**
- **OQ-161-02（`gender` 欄位保留或廢棄）**：F103 引入 `customer_core.gender`（字串），F104 新增整數型 `cus_sex`。若兩欄語意相同（皆來自 raw `CUS_SEX`），是否合併？建議：F104 保留兩欄並存，以 F105 清理（避免 F104 scope creep）。

---

## Dependencies

- **Blocked By**：US-159（AD-E07-10-L 修正，確立哪些欄需要）
- **Blocks**：US-160（CUS_SEX 分流引擎，需 cus_sex/carea_no1 等欄）；US-162（縣市欄引擎，需 hpost_city 等欄）

---

## Definition of Done

- [ ] AC-5 `CustomerCoreRow` interface 新欄定義完成並 merge 至 codebase
- [ ] OQ-161-01 縣市萃取方案已確認（ETL 使用者決議）
- [ ] OQ-161-02 gender vs cus_sex 保留策略已決議
- [ ] SG-161-01 / SG-161-02 已記錄在 AD-E07-10-L 或對應 spec
- [ ] ETL 工程師確認新欄 contract（欄名、型別、語意）並簽核，作為 ETL 實作的 binding spec

---

## Related

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Architecture Spec**：AD-E07-10-L（修正版，US-159 產出）；AD-E06-1（customer_core ETL 規範）
- **Related Stories**：US-159（AD 修正），US-160（CUS_SEX 分流引擎），US-162（縣市欄引擎修正），US-163（驗收）
- **ETL 負責方**：使用者（Data Engineer），本 Story 僅定義 contract，不實作 ETL
