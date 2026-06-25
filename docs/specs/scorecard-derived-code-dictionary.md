# AD-E07-10-S：計分衍生碼 Decode Dictionary（業務簽核用）

> 補充於 [AD-E07-10-L](architecture-spec.md)（工程面 column→source 映射）。
> 用途：讓**業務 / 稽核**能在不讀引擎程式碼的前提下，**確認**每個計分欄的「值怎麼算出來、config 裡的碼是什麼意思」。
> 最後更新：2026-06-25（對應引擎 F104 + m302 + F105）。

## 為什麼需要這份文件

CDMP 計分的分界是：

- **config（業務在「計分卡設定」可見/可設）**：哪些欄計分（計分維度）、各 bracket 的分數（`ob_levelcard_score` 的 level1/level2→score）、card_level 區間、tier 映射。
- **引擎（寫死、業務不可見）**：每個欄的「值怎麼從原始資料**衍生**出來」——例如 PROJECT_TP 的 `level1='A'` 其實代表「借新還舊」，但這個對應只寫在引擎 `resolveColumnSource`/`resolveColumnValue` 裡。

→ 後果：業務看 config 那一列 `A|06|06|37`，**無法從 'A' 反推「借新還舊」**。本文件即「**衍生碼 → 來源欄 + 規則 + 業務語意**」的 decode 層，補上這個可回溯性缺口（設計原則：計分卡 config 的每個衍生碼都必須可回溯）。

> ⚠️ legacy 碼（如 'A'）的值不可更改（值來自 legacy config）；本文件以「對照表」方式維護其語意，並隨引擎衍生邏輯同步更新。

---

## 1. 計分欄總表（15 個明確映射欄）

| 計分欄 | 中文 | 比對型 | 來源欄 | 衍生規則（業務語意）| legacy SP |
|---|---|---|---|---|---|
| LIST_MONTH | 中結/滿期/撥款與分案月數差 | range | `ob_pool_data.month_cnt` | 月數差直接取值；缺值 per-card default | OBLEVELCARD_* |
| **PROJECT_TP** | 專案類別 | **composite** | `spec_tp` + `spec_name` | spec_tp 代碼 **且** 是否借新還舊（見 §2.1）| SP_OBLEVELCARD_{H,S,E,E5} |
| CAR_YEAR | 車齡 | range | `year_produ` | 當年 − 出廠年；缺值 0 | OBLEVELCARD_* |
| **CUS_SEX** | 客戶性別 | range | `customer_core.cus_sex` | 性別碼（見 §2.2）；缺值/髒值 default 3 | #CASE_CUS |
| AGE | 年齡 | range | `customer_core.date_of_birth` | 個人→由生日推年齡（>100/<0 視為無效取 0）；法人→0（見 §3 分流）| #CASE_CUS |
| EDUCAT_BACK | 學歷 | range | `customer_core.education_code` | 個人→補零兩碼學歷碼；法人/缺值→per-card default（S→'02' / S5→'08' / E·E5→'02'）| #CASE_CUS |
| CAREA_NO1 | 有無戶籍電話 | range | `customer_core.carea_no1` | 個人→有區碼=1 / 無=0；法人→0（見 §3）| #CASE_CUS |
| CAREA_NO2 | 有無通訊電話 | range | `customer_core.carea_no2` | 個人→有區碼=1 / 無=0；法人→0 | #CASE_CUS |
| CELLULAR | 有無行動電話 | range | `customer_core.cellular` | 個人→有=1 / 無=0；法人→0 | #CASE_CUS |
| **HPOST_NUM_NM** | 戶籍縣市 | category | `customer_core.hpost_city` | 取縣市（縣市+區的前 3 字）；缺值 per-card default（S5→花蓮縣 / M·HM→臺北市）（見 §2.3）| OBLEVELCARD_* |
| **CPOST_NUM_NM** | 通訊縣市 | category | `customer_core.cpost_city` | 同上；缺值 default（M·HM→臺南市）| OBLEVELCARD_* |
| **CO_NUM_NM** | 公司縣市 | category | `customer_core.co_city` | 同上；缺值 default（S5·E5→金門縣 / M·HM→高雄市）| OBLEVELCARD_* |
| **SALES_STS** | 業務註記 | category | `ob_pool_data.sales_sts_na` | 轉成 AGENT/UCD/HFC（見 §2.4）| SP_OBLEVELCARD_H |
| LOAN_RATE | 貸款成數 | range | `loan_rate` | 直接取值；缺值 per-card default（S5→77 / E·E5→12 / 其他→0）| OBLEVELCARD_* |
| ADD_UN_CAPITAL | 累積未償本金（驗收）| range | `ob_arreturndf_min_cap.add_un_capital` | 直接取值；缺值 0 | OBLEVELCARD_* |

> 其餘未列於上的 `column_name` → 引擎走「通用 fallback」（從 ob_pool_data 同名數值欄取值、缺值 0），不另設衍生。

---

## 2. 碼意義解碼（config 看不出語意的欄）

### 2.1 PROJECT_TP（composite — 最需要解碼）
config row 形如 `level1 | level2_s | level2_e | score`，例 `A|06|06|37`、`<NULL>|12|12|28`。

| config 欄 | 實際意義 |
|---|---|
| **level1 = `'A'`** | **此 row 適用「借新還舊」案件**（`spec_name` 含「借新還舊」）|
| **level1 = `NULL`（空）** | **此 row 適用「非借新還舊」案件** |
| **level2_s = level2_e** | **專案代碼 `spec_tp`**（兩碼，如 '06'、'12'、'23'）|

**命中規則**：案件的 `spec_tp` 等於該 row 的代碼 **且** 案件的借新還舊旗標等於該 row 的 level1（'A' 或空）→ 取該 row 分數。
- 借新還舊 + spec_tp 06 → 命中 `A|06|06` → 37 分
- 非借新還舊 + spec_tp 06 → 命中 `NULL|06|06` → 35 分
- 非借新還舊 + spec_tp 12 → 命中 `NULL|12|12` → 28 分

### 2.2 CUS_SEX（性別碼）
| 碼 | 意義 |
|---|---|
| 1 | 男（個人）|
| 2 | 女（個人）|
| 3 | 法人 |
| 空 / NULL / 髒值 | 計分時 default 3 |

### 2.3 三縣市欄（HPOST/CPOST/CO_NUM_NM）
- config `level1` = **縣市名（3 字，如「臺北市」「花蓮縣」）**。
- 引擎取 `customer_core` 的縣市欄（值為「縣市+區」6 字，如「臺北市中正區」），**取前 3 字**比對 level1。
- 缺值時依卡別套 per-card default 縣市（見 §1 表）。

### 2.4 SALES_STS（業務註記碼）
config `level1` 為下列碼，來源 `sales_sts_na` 經轉換：
| 碼 | 來源值 → | 意義 |
|---|---|---|
| `AGENT` | `sales_sts_na = 'AGENT'` | 代理商案件 |
| `UCD` | `sales_sts_na = '中古車商'` | 中古車商案件（F104 修正：舊版誤用「經銷商」key→永不命中）|
| `HFC` | 其他（含「和潤」自家）| 和潤自家案件 |

---

## 3. 個人/法人分流（gating）

下列 5 欄的取值會先判斷客戶是「個人」或「法人」：
**CAREA_NO1 / CAREA_NO2 / CELLULAR / AGE / EDUCAT_BACK**

| cus_sex | 判定 | 取值來源 |
|---|---|---|
| 1 或 2 | **個人** | 讀客戶**自身屬性**（電話有無、年齡、學歷）|
| 3 或數值非 1/2 | **法人** | 讀保證人——但 legacy 已停用保證人 → **恆 0 / per-card default** |
| 空 / NULL | **個人**（gating default '1'）| 同個人 |
| 非數字髒值（'C'/'D'）| **法人** | 同法人 |

> 注意：分流用的 default（空值→個人）與 CUS_SEX **計分欄**的 default（空值→3 法人）**刻意分離**——這是 legacy 真語意，兩處不可混用。

---

## 4. 維護規則

- 本文件隨引擎 `resolveColumnSource`（`stage2to4-sql-builder.ts`）/ `resolveColumnValue`（`assignment-run-pipeline.service.ts`）變更同步更新。
- 衍生碼新增/變更時（如新關鍵字、新轉換），必須在 §2 補上碼意義。
- 相關設計約束見 memory `feedback_scorecard_derived_code_traceability`。
