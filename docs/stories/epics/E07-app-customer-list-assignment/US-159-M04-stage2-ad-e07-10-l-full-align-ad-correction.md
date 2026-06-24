---
last-updated: 2026-06-24
version: v1.0
change-summary: "新增 Story：AD-E07-10-L 全欄對齊 legacy SP——修正 AD 本身欄位語意（F103 所對齊的 AD 有 12 欄偏差）"
---

# US-159：AD-E07-10-L 計分欄位映射全面修正（對齊 legacy SP 真語意）

> **Story ID**：US-159
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8
> **Feature**：F104 計分引擎 + AD-E07-10-L 全欄對齊 legacy SP

---

## User Story

**As a** 業務主管（Sales Director）
**I want** 月跑 Stage 2 計分引擎的欄位映射規則（AD-E07-10-L）完整對齊 legacy SP（`SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`）的真實語意
**So that** 計分結果不因 AD 本身的欄位語意錯誤而系統性偏差，重跑 202606 後能呈現與 legacy 更接近的 tier spread

---

## 背景說明

F103（US-156/157/158）以 AD-E07-10-L 為對齊目標並已實作。事後深度稽核 legacy SP（UTF-16LE `reference/SP/SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`）發現：**AD-E07-10-L 本身有 12 欄語意偏差**，F103 等於對齊了一個有錯誤的 AD。

稽核發現偏差欄位彙整：

| 欄位 | AD-E07-10-L（現況，有誤） | Legacy SP 真語意 |
|------|--------------------------|-----------------|
| `PROJECT_TP` | `spec_name LIKE '%專案%'` → `'A'` | `spec_name LIKE '%借新還舊%'` → `'A'` |
| `CAREA_NO1` | `home_phone IS NOT NULL` | CUS_SEX 分流：個人→CAREA_NO1 區碼欄有無（0/1）；法人→保證人（停用→恆 0） |
| `CAREA_NO2` | `contact_phone IS NOT NULL` | CUS_SEX 分流：個人→CAREA_NO2 區碼欄有無（0/1）；法人→保證人（停用→恆 0） |
| `CELLULAR` | `mobile_phone IS NOT NULL` | CUS_SEX 分流：個人→CELLULAR 欄有無（0/1）；法人→保證人（停用→恆 0） |
| `AGE` | `EXTRACT(YEAR FROM age(date_of_birth))` | CUS_SEX 分流：個人→BITBE_DATE + 年齡計算 + **>100 排除**；法人→保證人（停用→恆 0） |
| `EDUCAT_BACK` | `education_code`，缺值 `''` | CUS_SEX 分流：個人→`RIGHT('0'+EDUCAT_BACK,2)` 補零，缺值 **`'02'`**；法人→保證人（停用→恆 `'02'`） |
| `HPOST_NUM_NM` | `residential_zip`（郵遞號）| **HPOSTAL_ADD 縣市名**（`customer_core` 新欄），per-card default：H/S→`'臺北市'`，E→`'花蓮縣'` |
| `CPOST_NUM_NM` | `mailing_zip`（郵遞號）| **CPOSTAL_ADD 縣市名**（`customer_core` 新欄），per-card default：`'臺南市'` |
| `CO_NUM_NM` | `company_zip`（郵遞號）| **POSTAL_ADD 縣市名**（`customer_core` 新欄），per-card default：H→`'金門縣'`，S→`'高雄市'` |
| `LIST_MONTH` | 缺值 default 固定 25 | **per-card default**：H/S→25；E/E5/M/HM→12 |
| `LOAN_RATE` | 缺值 default 固定 0 | **per-card default**：E/E5→12；S5→77；其他→0 |
| `CUS_SEX` | `gender` 欄值直接比對 LEVEL1（類別相等） | `ISNULL(CUS_SEX,3) BETWEEN LEVEL1_S AND LEVEL1_E`（range 比對） |

此外：
- `SALES_STS`：AD 記載來源為 pool 欄 `sales_sts_na` 再做 CASE 轉換；legacy SP 記載 `D.SALES_STS = LEVEL1`（上游 `SP_GET_CUSTATTRIB` 已轉換）。兩者語意是否等價需確認。[OPEN QUESTION OQ-159-01]

---

## Acceptance Criteria

### AC-1：PROJECT_TP 關鍵字修正為「借新還舊」

- **Given** legacy SP `OR (C.COLUNM='PROJECT_TP' AND ...)` 區塊中衍生條件為 `spec_name LIKE '%借新還舊%'`（非 `%專案%`）
- **When** 修正 AD-E07-10-L `PROJECT_TP` 映射規則及兩條引擎路徑（PG 下推 `resolveColumnSource` + JS oracle `resolveColumnValue`）
- **Then** PG 表達式改為 `CASE WHEN o.spec_name LIKE '%借新還舊%' THEN 'A' ELSE COALESCE(o.spec_tp, '01') END`；JS oracle 等價實作；F103 已實作的 `%專案%` 版本全面替換；EQ DoD 測試覆蓋此修正

### AC-2：CUS_SEX 改為 range 比對語意

- **Given** legacy SP `ISNULL(CUS_SEX,3) BETWEEN LEVEL1_S AND LEVEL1_E`（range 型，缺值補 3）
- **When** 修正 AD-E07-10-L `CUS_SEX` 欄及兩條引擎路徑
- **Then** `CUS_SEX` 欄型別由 category（字串相等）改為 range（BETWEEN `level2_s` / `level2_e`）；PG 表達式為 `COALESCE(cc.cus_sex::int, 3)`（或對應 raw 欄位 cast，見 [SCHEMA GAP SG-159-01]）；缺值 default 為 `3`；JS oracle 等價；既有測試不退化

> [SCHEMA GAP SG-159-01]：`customer_core` 目前無獨立 `cus_sex` 欄（AD-E07-10-L 記錄 `gender`）。legacy raw 欄位名為 `CUS_SEX`（整數型，1/2/3）。ETL 是否已轉為 `gender` 字串？若 raw 欄仍為整數、ETL 已改名為 `gender` 且為字串，需確認 `customer_core.gender` 的原始值為 `'1'`/`'2'`/`'3'` 字串還是整數 1/2/3，以確定 BETWEEN 表達式的正確 cast。交下游架構師/ETL 團隊確認。

### AC-3：CAREA_NO1/NO2 改讀區碼欄（CUS_SEX 分流）

- **Given** legacy SP CAREA_NO1/NO2 語意為：個人客戶（CUS_SEX IN 1,2）→ raw 欄 `CAREA_NO1`/`CAREA_NO2` 有無（`IS NOT NULL` 或非空→1，否→0）；法人（CUS_SEX=3）→ 保證人已停用→恆 0
- **When** 修正 AD-E07-10-L `CAREA_NO1`/`CAREA_NO2` 映射規則及兩條引擎路徑
- **Then**
  - PG 表達式（個人分支）：`CASE WHEN cc.cus_sex IN (1,2) THEN (CASE WHEN cc.carea_no1 IS NOT NULL AND cc.carea_no1 <> '' THEN 1 ELSE 0 END) ELSE 0 END`（具體欄名見 [SCHEMA GAP SG-159-02]）
  - 法人分支恆 0（保證人停用複刻）
  - JS oracle 等價；EQ DoD 覆蓋個人/法人兩分支

> [SCHEMA GAP SG-159-02]：`customer_core` ETL 是否已引入 raw `CAREA_NO1`/`CAREA_NO2` 欄？目前 AD-E07-10-L 只記錄 `home_phone`/`contact_phone`。需使用者 ETL 確認並命名新欄位（見 US-161 cc 新欄 contract）。

### AC-4：CELLULAR 改讀區碼欄（CUS_SEX 分流）

- **Given** legacy SP CELLULAR 語意為：個人客戶→raw `CELLULAR` 欄有無；法人→保證人停用→恆 0（與 CAREA 同模式）
- **When** 修正 AD-E07-10-L `CELLULAR` 映射規則及兩條引擎路徑
- **Then** 引擎分流邏輯同 AC-3（個人→cc.cellular IS NOT NULL → 1/0；法人→0）；[SCHEMA GAP SG-159-02] 同樣適用 cellular 欄

### AC-5：AGE 加入 CUS_SEX 分流與 >100 排除

- **Given** legacy SP AGE 語意：個人（CUS_SEX IN 1,2）→ `BITBE_DATE`（生日欄）推算年齡，且 **>100 歲排除**（視為無效，取 0 或不參與計分）；法人→保證人停用→恆 0
- **When** 修正 AD-E07-10-L `AGE` 映射規則及兩條引擎路徑
- **Then**
  - PG 表達式：`CASE WHEN cc.cus_sex IN (1,2) THEN CASE WHEN EXTRACT(YEAR FROM age(cc.bitbe_date)) > 100 THEN 0 ELSE COALESCE(EXTRACT(YEAR FROM age(cc.bitbe_date)), 0) END ELSE 0 END`（具體欄名 `bitbe_date` 見 [SCHEMA GAP SG-159-02]）
  - JS oracle 等價（>100 排除邏輯同步）
  - EQ DoD 含 >100 邊界測試案例

> [SCHEMA GAP SG-159-02]（延伸）：`customer_core` 目前 AD 記錄 `date_of_birth`。legacy raw 欄名為 `BITBE_DATE`。ETL 是否已改名為 `date_of_birth`？欄位語意相同則引擎沿用 `date_of_birth` 欄名即可，無需 ETL 改動。

### AC-6：EDUCAT_BACK 補零格式化與 per-card default `'02'`

- **Given** legacy SP EDUCAT_BACK 語意：個人（CUS_SEX IN 1,2）→ `RIGHT('0'+EDUCAT_BACK,2)`（補左補零至 2 碼），缺值 default `'02'`（非空字串）；法人→保證人停用→恆 `'02'`
- **When** 修正 AD-E07-10-L `EDUCAT_BACK` 缺值 default 及兩條引擎路徑
- **Then**
  - PG 表達式（個人）：`CASE WHEN cc.cus_sex IN (1,2) THEN COALESCE(RIGHT('0'||cc.education_code, 2), '02') ELSE '02' END`
  - 法人分支恆 `'02'`
  - 缺值 default 從空字串 `''` 修正為 `'02'`
  - JS oracle 等價（補零邏輯一致）

### AC-7：LIST_MONTH per-card default 修正

- **Given** legacy SP `LIST_MONTH` 的缺值 default 依 card 類型不同：H/S→25；E/E5/M/HM→12（AD-E07-10-L 現況固定 25）
- **When** 修正 AD-E07-10-L `LIST_MONTH` 規則及兩條引擎路徑
- **Then** 計分引擎在 `LIST_MONTH` 欄位的 `month_cnt` 為 NULL 時，依當前 card_type 套用對應 default（H/S→25，E/E5/M/HM→12）；PG 與 JS 兩路徑等價；EQ DoD 含各 card_type default 測試案例

### AC-8：LOAN_RATE per-card default 修正

- **Given** legacy SP `LOAN_RATE` 缺值 default：E/E5→12；S5→77；其他→0（AD-E07-10-L 現況固定 0）
- **When** 修正 AD-E07-10-L `LOAN_RATE` 規則及兩條引擎路徑
- **Then** 計分引擎在 `loan_rate` 為 NULL 時，依 card_type 套用對應 default（E/E5→12，S5→77，其他→0）；PG 與 JS 兩路徑等價；EQ DoD 含各 card_type default 測試案例

### AC-9：AD-E07-10-L 全欄修正版本產出

- **Given** AC-1～AC-8 所有欄位語意修正已確認
- **When** 系統架構師更新 `architecture-spec.md` AD-E07-10-L 映射表
- **Then** 映射表逐欄反映 legacy SP 真語意（包含 CUS_SEX 分流、per-card default、關鍵字修正）；標注 F104 修正版本與日期；舊有 F103 授權補述仍保留但標注「部分已被 F104 覆蓋」

### AC-10：EQ DoD（JS↔SQL 全欄等價）

- **Given** AC-1～AC-8 兩條引擎路徑修正完成
- **When** 執行 `stage2to4-sql-builder.spec.ts` EQ 群組測試（含所有修正欄位場景）
- **Then** JS oracle 與 PG 下推對相同輸入產生相同計分結果；EQ 測試全部通過；既有 F103 EQ 測試在新語意下仍通過（或已更新反映新語意）

---

## 技術備註

- **Legacy SP 位置**：`reference/SP/SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`（UTF-16LE 編碼，需以 Node `Buffer.toString('utf16le')` 解碼）
- **稽核方法**：每個 SP 中 `OR (C.COLUNM='<欄位名>' AND <推導>)` 區塊即為該欄的計分規則
- **F103 PROJECT_TP 實作須覆蓋**：F103 已實作 `%專案%`（錯），本 Story 須將 `stage2to4-sql-builder.ts` 及 `assignment-run-pipeline.service.ts` 中相關表達式全替換為 `%借新還舊%`
- **per-card default 實作位置**：`buildStage2ScoreExpr` 組裝時已知 card_type（由呼叫端傳入），per-card default 可在 `COALESCE` 第二參數帶入常數；JS oracle `computeScore` 已接受 `cardType` 參數，同樣可在 switch/case 中依 cardType 選 default

---

## [OPEN QUESTION]

- **OQ-159-01（SALES_STS 上游轉換語意）**：AD-E07-10-L 記載 `SALES_STS` 來源為 pool 欄 `sales_sts_na`，以 CASE 轉換後比對 LEVEL1（category 型）。Legacy SP 則為 `D.SALES_STS = LEVEL1`（`D` 來自上游 `SP_GET_CUSTATTRIB`，該 SP 已完成轉換）。兩者是否等價？需比對 `SP_GET_CUSTATTRIB` 的 SALES_STS 輸出值與 CDMP pool `sales_sts_na` 的原始值是否相同。若 AD 的 CASE 轉換語意完全複刻了 SP_GET_CUSTATTRIB，則 SALES_STS 無需修正；若有差異則需補入修正清單。**交架構師稽核 SP_GET_CUSTATTRIB。**
- **OQ-159-02（per-card default 完整 card_type 清單）**：目前已知的 per-card default 值來自 H/S/S5/E/E5/M/HM 共 7 種。CDMP 是否有 legacy dump 未列出的自訂 card_type？若有，這些 card 的 LIST_MONTH / LOAN_RATE 應 fallback 到哪個值？建議：未知 card_type 套用 H/S 的 default（LIST_MONTH=25，LOAN_RATE=0）並 log warning。

---

## Dependencies

- **Blocked By**：US-156（F103 PG 下推路徑已實作，本 Story 在其上覆蓋修正）；US-161（cc 新欄 contract 定義，CAREA_NO1/NO2/CELLULAR/BITBE_DATE 欄位命名）
- **Blocks**：US-160（CUS_SEX 分流引擎核心），US-162（縣市欄修正），US-163（202606 重跑驗收）

---

## Definition of Done

- [ ] AD-E07-10-L 映射表更新，反映 AC-1～AC-8 全欄修正，含 CUS_SEX 分流架構、per-card default、借新還舊關鍵字
- [ ] PG 下推 `resolveColumnSource` 中 PROJECT_TP 關鍵字修正完成（`%借新還舊%`）
- [ ] `CUS_SEX` 欄型別改為 range（BETWEEN）
- [ ] `LIST_MONTH` / `LOAN_RATE` per-card default 邏輯實作
- [ ] `EDUCAT_BACK` 缺值 default 改為 `'02'`、補零格式化
- [ ] OQ-159-01 / OQ-159-02 有架構師決議或記錄
- [ ] EQ DoD（AC-10）全部通過
- [ ] `tsc --noEmit -p tsconfig.build.json` 零錯誤

---

## Related

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Architecture Spec**：AD-E07-10-L（`architecture-spec.md` §4063–4093）
- **Legacy Ground Truth**：`reference/SP/SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`（UTF-16LE）
- **Related Stories**：US-160（CUS_SEX 分流引擎），US-161（cc 新欄 contract），US-162（縣市欄修正），US-163（驗收）
- **Supersedes（部分）**：F103 AC-3 PROJECT_TP 實作（`%專案%` → `%借新還舊%`）；F103 AC-7 CAREA_NO1/NO2 語意確認（推翻「已驗證無需修改」）
