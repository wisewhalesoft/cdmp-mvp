---
spec-id: F107
title: 計分卡設定頁顯示衍生碼業務語意（decode UI）
feature-id: F107
source-story: US-165
epic: E07
module: M02 計分設定
priority: P1
date: 2026-06-25
status: Draft
version: "1.0"
---

# F107: 計分卡設定頁顯示衍生碼業務語意（decode UI）

Priority: P1 | Status: Draft | Last Updated: 2026-06-25

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `scorecard-derived-code-dictionary.md`（AD-E07-10-S，decode 內容真值）+ `apps/api/.../stage1/stage2to4-sql-builder.ts`（`resolveColumnSource`，decode 同源依據） |
| QA / Tester | 本文件（特別是 §4 AC-4 / §6 BR-4 同步斷言 + §11 DoD）+ `scorecard-derived-code-dictionary.md` |
| UI/UX Designer | 本文件（§7 UI/UX 需求）+ `prototypes/28-scoring-config.html` Tab 3「分數設定」/ Tab 2「計分維度」 |
| Architect | 本文件 + `architecture-spec.md` §3.10（M02 計分設定）+ AD-E07-10-L / AD-E07-10-S（decode 常數落點為架構師 OQ） |

---

## 1. 功能摘要

把已存在的 decode 對照（AD-E07-10-S `scorecard-derived-code-dictionary.md`）呈現在計分卡設定頁，落實「計分卡 config 的每個衍生碼必須可回溯到來源欄 + 衍生規則 + 業務語意」之設計原則的 **UI 層**。

CDMP 計分的分界：**config**（業務在「計分卡設定」可見/可設：哪些欄計分、各 bracket 的分數）與 **引擎衍生規則**（每欄的「值怎麼從原始資料衍生」——例如 PROJECT_TP `level1='A'` 代表「借新還舊」，只寫在引擎 `resolveColumnSource` 與 AD-E07-10-S 文件裡）。目前業務看 config 那一列 `A|06|06|37`，無法從 `'A'` 反推「借新還舊」；本功能補上這個「碼 → 來源欄 + 規則 + 業務語意」的呈現缺口。

三項變更（皆為**唯讀疊加說明**，不改既有 config 編輯能力、不改計分採計）：

1. **後端供給（decode 同源）**：`getScoring()` 回傳結構新增 decode 說明。decode map 為**與引擎衍生規則同源的後端共用對照常數**（與 `resolveColumnSource` 同模組或被其參照 / 被同一份常數綁定），**非前端常數、非 config 資料表**。回傳之 decode **唯讀**。
2. **前端 Tab 3「分數設定」**：每列在原始碼（`level1`，或 PROJECT_TP 的 `level1` + `level2` 複合碼）旁，並陳對應**業務語意**（原始碼保留以利稽核對照）。
3. **前端 Tab 2「計分維度」**：欄層顯示該欄的「**來源欄 + 衍生規則**」摘要（讓業務知道「值怎麼來的」）。

decode 涵蓋**全部衍生欄**（OQ-decode-2 拍板）：PROJECT_TP / SALES_STS / CUS_SEX / 三縣市（HPOST_NUM_NM / CPOST_NUM_NM / CO_NUM_NM）/ 個人法人分流 gating。

> **本功能不改計分採計**：decode 是純說明層，不影響 score / card_level / tier 計算。計分引擎兩路徑（`stage2to4-sql-builder.ts` / `assignment-run-pipeline.service.ts`）邏輯不變。

## 2. 使用者故事

**As a** 業務主管 / 稽核人員（部長 / 處長）
**I want** 在計分卡設定頁看到每個衍生碼的「業務語意」以及「該欄的值怎麼來的（來源欄 + 衍生規則）」
**So that** 我看 config 那一列（如 `A|06|06|37`）時，能直接讀懂 `'A'` 代表「借新還舊」、`AGENT/UCD/HFC` 代表代理商/中古車商/和潤自家，不必去翻引擎程式碼或單獨的 markdown 文件，達成衍生碼可回溯、可被業務與稽核自行確認

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token。
- 讀取（含查看 decode）：`businessRole IN ('director', 'section_chief', 'admin')`（沿用 Tab 3 / `GET /assignment/scoring` 既有讀取規則，class 級 `DirectorOrSectionChiefGuard`；讀取開放至處長，不因 decode 收緊）。
- F069 Tab 1 已選中某 CARD_TYPE，且該 CARD_TYPE 於 `ob_card_type.status='active'`。
- 該 CARD_TYPE 於 `ob_levelcard_version` 至少有一筆 `status='active'` 版本紀錄（否則沿用既有空狀態，見 AC-5）。
- 本功能**無寫入動作**，故無月跑鎖、無寫入權限（部長）前置；decode 一律唯讀。

## 4. 驗收標準

### AC-1：Tab 3 每列衍生碼旁顯示業務語意（decode）

- **Given** 業務主管在 Tab 1 已選中某 CARD_TYPE，切換至 Tab 3（分數設定）且資料載入完成
- **When** 該 CARD_TYPE 的分數列含有「不透明衍生碼」的維度（PROJECT_TP / SALES_STS / CUS_SEX / 三縣市）
- **Then** 每列在原始碼旁顯示對應的**業務語意**：
  - **PROJECT_TP**（composite）：`level1='A'` → 顯示「借新還舊」；`level1=NULL`（空）→ 顯示「非借新還舊」；`level2_s`（=`level2_e`）兩碼 → 標示為「專案代碼 `spec_tp`」
  - **SALES_STS**（category）：`AGENT` → 「代理商」；`UCD` → 「中古車商」；`HFC` → 「和潤自家」
  - **CUS_SEX**（range，性別碼）：`1` → 「男（個人）」；`2` → 「女（個人）」；`3` → 「法人」
  - **三縣市欄**（category）：`level1` 即縣市名（3 字，如「臺北市」「花蓮縣」），decode 標示「縣市名（取 customer_core 縣市欄前 3 字比對）」
- **And** decode 文字與原始碼**並陳**（原始碼不被取代，仍可見），以利稽核對照
- **And** 該維度若無對應 decode（一般 fallback 數值欄，如 LIST_MONTH / CAR_YEAR / AGE / LOAN_RATE / ADD_UN_CAPITAL 等純數值區間欄）→ **不顯示 decode 文字、亦不報錯**（優雅降級）

### AC-2：顯示「該欄的來源欄 + 衍生規則」摘要

- **Given** 業務主管檢視 Tab 2 某個有 decode 的維度（或其維度層說明），或 Tab 3 該維度之欄層說明
- **When** 該維度具備 AD-E07-10-S 定義的來源欄與衍生規則
- **Then** 顯示該欄的**來源欄**與**衍生規則摘要**，例如：
  - PROJECT_TP：來源 `spec_tp` + `spec_name`；規則「spec_tp 代碼 **且** 是否借新還舊」
  - SALES_STS：來源 `ob_pool_data.sales_sts_na`；規則「轉成 AGENT / UCD / HFC」
  - CUS_SEX：來源 `customer_core.cus_sex`；規則「性別碼；缺值/髒值計分 default 3」
  - 三縣市：來源 `customer_core.hpost_city`（/ `cpost_city` / `co_city`）；規則「取縣市（前 3 字）；缺值 per-card default」
- **And** 個人/法人分流（gating）之 5 欄（CAREA_NO1 / CAREA_NO2 / CELLULAR / AGE / EDUCAT_BACK）於欄層摘要標示「取值前先判個人/法人（法人多數恆 0 / default）」
- **And** 呈現形式（inline 欄 / tooltip / 可展開區塊 / 維度層摘要 vs 碼層 inline）細節由 UI/UX 階段定稿；本 AC 只要求「業務能在設定頁讀到來源欄 + 規則」這個結果可達成

### AC-3：decode 為唯讀，不可編輯

- **Given** 業務主管（即使具部長寫入權限）檢視 Tab 3 / Tab 2 的 decode 內容
- **When** 嘗試與 decode 文字 / 來源欄 / 規則摘要互動
- **Then** decode 一律為**唯讀展示**，無任何新增 / 編輯 / 刪除入口
- **And** 既有 config 編輯入口（Tab 2 維度編輯、Tab 3 分數區間設定等）行為**不受本功能影響**（decode 只是疊加說明層）
- **And** 後端 decode 由 `getScoring()`（`GET`，唯讀端點）回傳；**不新增任何寫入端點**

### AC-4：decode 內容與 AD-E07-10-S / 引擎衍生規則一致（可回溯性 + 同步斷言）

- **Given** decode UI 已顯示，且後端 decode 來源為單一共用常數
- **When** 對照 `scorecard-derived-code-dictionary.md`（AD-E07-10-S）的碼意義與引擎 `resolveColumnSource` 的衍生規則
- **Then** UI 顯示之碼意義 / 來源欄 / 衍生規則**與該文件及引擎一致**（不得出現與文件或引擎矛盾、或自創的語意）
- **And** 後端 decode 常數為**單一資料來源**（與引擎衍生規則同源），**必須有一條測試斷言**「`getScoring()` 回傳 / UI 消費的 decode ≡ 引擎衍生規則對照（`resolveColumnSource` 之 source/kind/keyword）」——防「UI 說 A、引擎做 B」走鐘（OQ-decode-4 拍板，見 BR-4）
- **And** 此一致性斷言納入本功能 DoD（§11）

### AC-5：未選中 CARD_TYPE / 無分數資料時優雅降級

- **Given** Tab 1 尚未選中 CARD_TYPE，或選中 CARD_TYPE 無生效版本 / 無分數列
- **When** 業務主管切換至 Tab 3 / Tab 2
- **Then** 沿用既有空狀態 / 提示行為（如「請先在 Tab 1 選擇計分卡類型」、「目前無分數區間設定」），decode 層**不產生額外錯誤或空白區塊**
- **And** 維度有分數列但該維度無對應 decode（純數值欄）時，僅原始碼顯示、無 decode（與 AC-1 末項一致）

### AC-6：權限——讀取開放至處長

- **Given** 使用者以「處長 / section_chief」（僅讀）身分進入 Tab 3 / Tab 2
- **When** 檢視 decode 內容
- **Then** 可正常看到 decode（碼意義 + 來源欄 + 規則）——decode 為唯讀說明，讀取權限沿用 `GET /assignment/scoring` 既有讀取規則（開放至處長），不因 decode 而收緊或放寬

## 5. API 契約

> 路由前綴 `assignment/scoring`（global prefix `api/v1`，最終 `/api/v1/assignment/scoring/...`）。本功能**只變更既有 `GET /assignment/scoring` 之回傳**，不新增端點。

### 5.1 GET /assignment/scoring（既有端點，新增 decode 回傳）

| 項目 | 內容 |
|------|------|
| Method / Path | `GET /api/v1/assignment/scoring` |
| Query | `cardType`（必填，既有） |
| 權限 | class 級 `DirectorOrSectionChiefGuard`（讀取開放至處長，既有） |
| 變更 | 每個 dimension 物件**新增 decode 說明欄位**（見下），其餘維持既有（`columnName` / `columnLabel` / `matchType` / `status`（F106）/ `scoreSummary` / `scores`） |

#### 5.1.1 decode 資料結構（後端回傳，唯讀）

decode 附於**每個 dimension 物件**（欄層）。設計理由：decode 與「哪個維度」一一對應，附於維度層讓前端 Tab 2（欄層摘要）與 Tab 3（碼層 inline）皆能取用同一份。

每個 dimension 新增一個可選欄位 `decode`（無對應 decode 之維度此欄 `null` / 省略 → 前端優雅降級不顯示）：

```jsonc
{
  "columnName": "PROJECT_TP",
  "columnLabel": "專案類別",
  "matchType": "COMPOSITE",
  "status": "active",
  "scoreSummary": "8 個區間",
  "scores": [ /* 既有：level1 / level2S / level2E / score */ ],
  "decode": {                                  // ★ 新增（唯讀；無 decode 之維度為 null/省略）
    "sourceField": "spec_tp + spec_name",      // 來源欄（人類可讀，對齊 AD-E07-10-S §1）
    "derivationRule": "spec_tp 代碼且是否借新還舊",  // 衍生規則摘要（人類可讀）
    "codes": [                                 // 碼 → 業務語意 對照（無碼之維度可為空陣列）
      { "level": "level1", "code": "A",    "meaning": "借新還舊" },
      { "level": "level1", "code": null,   "meaning": "非借新還舊" },
      { "level": "level2", "code": null,   "meaning": "專案代碼 spec_tp（兩碼，level2_s=level2_e）" }
    ]
  }
}
```

**欄位語意**（命名與精確型別由 system-architect / TDD 定稿，本表為契約意圖）：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `decode` | object \| null | 該維度之 decode 說明；無對應 decode（純數值欄）→ `null` 或省略（前端優雅降級） |
| `decode.sourceField` | string | 來源欄（人類可讀，對齊 AD-E07-10-S §1「來源欄」欄），如 `spec_tp + spec_name`、`ob_pool_data.sales_sts_na`、`customer_core.cus_sex` |
| `decode.derivationRule` | string | 衍生規則摘要（人類可讀），對齊 AD-E07-10-S §1「衍生規則（業務語意）」欄之摘要 |
| `decode.codes` | array | 碼 → 業務語意 對照；每項 `{ level, code, meaning }`。純數值區間欄（如 LIST_MONTH）`codes` 為空陣列 / 該維度 `decode=null`（見下「涵蓋面」） |
| `decode.codes[].level` | string | 該碼所屬層（`'level1'` / `'level2'`），對應 `scores[]` 的 `level1` / `level2S`(=`level2E`) |
| `decode.codes[].code` | string \| null | 原始碼（`'A'` / `'AGENT'` / `'1'` / `'臺北市'` …）；`null` 表「空 / NULL 碼」的語意（如 PROJECT_TP `level1=NULL` → 非借新還舊） |
| `decode.codes[].meaning` | string | 該碼之業務語意（中文），對齊 AD-E07-10-S §2 |

#### 5.1.2 decode 涵蓋面（OQ-decode-2 拍板：全部衍生欄）

| 計分欄 | 比對型 | `sourceField`（對齊 AD §1）| `codes` 內容（對齊 AD §2 / §3）|
|--------|--------|------|------|
| PROJECT_TP | composite | `spec_tp + spec_name` | level1 `A`→借新還舊；level1 `null`→非借新還舊；level2→專案代碼 `spec_tp`（§2.1）|
| SALES_STS | category | `ob_pool_data.sales_sts_na` | level1 `AGENT`→代理商；`UCD`→中古車商；`HFC`→和潤自家（§2.4）|
| CUS_SEX | range | `customer_core.cus_sex` | level1 `1`→男（個人）；`2`→女（個人）；`3`→法人；缺值/髒值計分 default 3（§2.2）|
| HPOST_NUM_NM | category | `customer_core.hpost_city` | level1=縣市名（3 字）；規則「取前 3 字比對；缺值 per-card default」（§2.3）|
| CPOST_NUM_NM | category | `customer_core.cpost_city` | 同上（§2.3）|
| CO_NUM_NM | category | `customer_core.co_city` | 同上（§2.3）|

個人/法人分流（§3）為**欄層衍生規則摘要**（非碼層 codes），套用於 **CAREA_NO1 / CAREA_NO2 / CELLULAR / AGE / EDUCAT_BACK** 五欄：這些欄的 `decode.sourceField` + `decode.derivationRule` 帶分流摘要（「取值前先判個人/法人；法人多數恆 0 / per-card default」），`codes` 為空陣列（其值為純數值區間、無類別碼）。其餘純數值欄（LIST_MONTH / CAR_YEAR / LOAN_RATE / ADD_UN_CAPITAL）`decode=null`（無衍生語意需解碼）。

> **decode 不含 per-card default 的卡別細目展開**（如「S5→花蓮縣」）——避免與 Tab 中「值的計分設定」混淆；decode 摘要僅述「缺值套 per-card default」，完整 default 矩陣留在 AD-E07-10-S §1 / 引擎 `CARD_DEFAULTS` 為工程真值。

## 6. 商業規則

- **BR-1（decode 由後端 `getScoring()` 供給）**：decode 由後端在 `getScoring()` 每個 dimension 物件附 `decode` 欄位回傳（唯讀）。前端不自建 decode 常數表、不新建 config 資料表（OQ-decode-1 拍板採方案 (a)：後端同源供給）。
- **BR-2（decode 為與引擎同源之共用常數）**：decode map 為後端共用對照常數，放於引擎衍生模組可參照之位置（理想：與 `resolveColumnSource`（`stage2to4-sql-builder.ts`）同模組 / 同目錄之共用常數檔，或由其匯出之 metadata），使「decode 說的」與「引擎做的」**同一份真值**。常數精確落點（同檔 export vs 新增 `scoring-decode.constants.ts` 並被引擎與 service 共用）為 system-architect OQ（見 §10）；無論落點，BR-4 同步斷言為硬性約束。
- **BR-3（decode 唯讀、無寫入）**：本功能不新增任何寫入端點、不改任何既有寫入端點；decode 純由 `GET /assignment/scoring` 回傳。legacy 碼（如 `'A'`）之值不可在 UI 更改（值來自 legacy config，AD-E07-10-S 開宗即述）。
- **BR-4（同步斷言——decode ≡ 引擎衍生規則 + AD-E07-10-S，核心驗收）**：**必須有測試斷言** decode 常數與引擎衍生規則一致，至少涵蓋：
  1. decode `codes` 之碼集合與意義 ≡ AD-E07-10-S §2 對照（PROJECT_TP `A`/null、SALES_STS `AGENT`/`UCD`/`HFC`、CUS_SEX `1`/`2`/`3`）。
  2. decode `sourceField` ≡ 引擎 `resolveColumnSource` 取值來源（例：SALES_STS 來源 `o.sales_sts_na`、CUS_SEX 來源 `cc.cus_sex`、PROJECT_TP `spec_tp + spec_name`）；若引擎 keyword（如 SALES_STS `'中古車商'→'UCD'`、PROJECT_TP `'%借新還舊%'→'A'`）變更，斷言應失敗以提示同步更新 decode。
  3. decode 涵蓋之欄集合 ⊆ 引擎 `MAPPED_SCORING_COLUMNS`（不對引擎未映射之欄產生 decode）。
  此斷言防「引擎衍生邏輯變更而 decode 未同步」之走鐘，呼應 traceability 設計原則與 AD-E07-10-S §4 維護規則。
- **BR-5（不改計分採計範圍）**：本功能純 UI 呈現；計分引擎兩路徑（`stage2to4-sql-builder.ts` / `assignment-run-pipeline.service.ts`）、`fn_calc_tier_level`、score/card_level/tier 計算邏輯**均不變**。
- **BR-6（無 decode 之維度優雅降級）**：`getScoring()` 對無對應 decode 之維度回 `decode=null`（或省略）；前端對 `null`/省略一律不渲染 decode、不報錯（純數值欄、引擎 fallback 欄皆走此路徑）。
- **BR-7（無新錯誤碼、無新 DB 欄位 / migration）**：decode 為記憶體中之共用常數導出，不落 DB；不新增 error code、不需 migration / seed。

## 7. UI/UX 需求

> 對齊 `prototypes/28-scoring-config.html`：Tab 3「分數設定」（表頭 6 欄：column_name / 比對模式 / level1 / level2_s / level2_e / score）、Tab 2「計分維度」（表頭：column_name / column_label / 類型 / 比對模式 / 分數區間摘要 / 狀態 / 操作）。
>
> **原型現況（Phase 0 結論）**：原型 Tab 3 與現行 React `ScoresTab` 皆只顯示原始碼、**無 decode**；本功能為**原型外的新增功能**（落實 2026-06-25 設計原則），**非「補實作原型」**。設計意圖回寫原型由 UI/UX 階段處理（**本功能不改原型 HTML**）。
>
> 側欄導覽：沿用既有 `/assignment/scoring` 路由（`App.tsx` 既有、側欄「計分卡設定」既有），**無需新增任何 route 或側欄項目**。

- **UI-1（Tab 3 碼層 decode 並陳）**：`ScoresTab`（`scoring-config-page.tsx` L1186-1361）之 `level1` 欄（及 PROJECT_TP 之 `level1`+`level2` 複合）在原始碼旁並陳 decode 業務語意（碼旁灰字 / 新增一 decode 說明欄，**原始碼保留**）。PROJECT_TP composite 列需說明 `level2_s`(=`level2_e`) 為「專案代碼 `spec_tp`」。原始碼欄（`level1` / `level2_s` / `level2_e` / `score`）維持既有，不被取代。
- **UI-2（Tab 2 欄層摘要）**：`DimensionsTab`（L894+）於有 decode 之維度欄層加「來源欄 + 衍生規則」摘要（一行說明 / tooltip / 可展開）。摘要取自 `decode.sourceField` + `decode.derivationRule`。
- **UI-3（呈現形式採 PA 建議，視覺交 UI/UX）**：Tab 3 碼層採「原始碼 + 並陳 decode 文字」；Tab 2 維度層加「來源欄 + 衍生規則」摘要。tooltip 可作次選（資訊密度高時）。具體 token（顏色 / 字級 / 是否 tooltip vs inline vs 可展開）由 UI/UX 階段依設計系統定稿；本功能僅界定「業務能於設定頁讀到 碼意義 / 來源欄 / 規則」之結果。
- **UI-4（唯讀，無互動入口）**：decode 文字 / 來源欄 / 規則摘要一律唯讀，無任何新增 / 編輯 / 刪除控制項；不影響既有編輯入口（Tab 2 維度編輯、Tab 3 分數設定）。
- **UI-5（優雅降級）**：維度 `decode=null`/省略時不渲染 decode 區塊（無空白佔位、無 `—` 以外的多餘標記）；未選 CARD_TYPE / 無分數列沿用既有空狀態（AC-5）。
- **UI-6（API client 型別補 decode）**：`apps/web/src/api/assignment-scoring.ts` 之 `ScoringDimensionItem` 補可選 `decode` 欄位（型別鏡像 §5.1.1），前端純消費後端回傳、不自建 decode 常數。前端 build / 型別檢查（`tsc`）通過。
- **UI-7（與 F106 / matchType 正交）**：本功能之 decode 與既有 `MATCH_TYPE_DESC`（比對型說明）、F106 之 `status` chip **正交**——「比對型」說明「怎麼比對（類別/區間/複合）」，decode 說明「碼是什麼意思 + 值怎麼來」，兩者並存不互相取代。decode 不混入 US-164/F106 之「啟用維度」功能。

## 8. 錯誤處理

> 本功能**不新增任何 error code**。`GET /assignment/scoring` 既有錯誤體系不變（cardType 不存在 → 404 `CARD_TYPE_NOT_FOUND`、無 active 版本 → 404 `SCORING_VERSION_NOT_FOUND`），decode 僅為其回傳之附加唯讀欄位，不引入新失敗模式。詳見 `error-handling.md#assignment-scoring-errors`。

| 情境 | 行為 |
|------|------|
| cardType 不存在 / 已停用 | 沿用既有 404 `CARD_TYPE_NOT_FOUND`（`assertCardTypeActive`），與 decode 無關 |
| 無 active 計分版本 | 沿用既有 404 `SCORING_VERSION_NOT_FOUND`，前端既有空狀態（AC-5）|
| 維度無對應 decode | `decode=null`/省略，前端優雅降級不渲染（非錯誤，BR-6）|

## 9. 資料模型

> 詳見 `data-model.md#e07-data-model`。本功能**不新增 entity、不新增欄位、不需 migration**。

- decode 為**記憶體中之後端共用常數**（與引擎衍生模組同源），**不落 DB**。其內容真值對齊 `scorecard-derived-code-dictionary.md`（AD-E07-10-S）與引擎 `resolveColumnSource`（`stage2to4-sql-builder.ts`，含 `CARD_DEFAULTS` / `MAPPED_SCORING_COLUMNS` / SALES_STS·PROJECT_TP·CUS_SEX·縣市衍生表達式）。
- 既有 `ob_levelcard_column` / `ob_levelcard_score` 之查詢與映射不變；decode 疊加於 `getScoring()` mapper 輸出（依 `column_name` 對應 decode 常數）。

## 10. 架構師 OQ（交 system-architect，附 spec-writer 建議預設）

> 以下涉及 `architecture-spec.md` / AD 文件 / 引擎模組常數落點，屬 system-architect 範疇；spec-writer 不改該等檔，列為 OQ 並附建議。

- **OQ-F107-01（decode 共用常數落點）**：decode 常數放哪、如何與引擎 `resolveColumnSource` 同源？
  **建議**：新增 `scoring-decode.constants.ts`（與 `stage2to4-sql-builder.ts` 同目錄 `assignment/stage1/`），匯出 `SCORING_DECODE: Record<columnName, DecodeEntry>`；引擎 `resolveColumnSource` 之 SALES_STS / PROJECT_TP / CUS_SEX / 縣市 衍生關鍵字與來源由此常數**參照或反向被斷言**（BR-4），避免雙寫。`getScoring()`（`assignment-scoring.service.ts`）import 同一常數附於回傳。請 architect 定稿落點並於 AD 補一節（decode 契約）。
- **OQ-F107-02（AD-E07-10-S 對 UI decode 之權威關係）**：AD-E07-10-S 文件、引擎常數、UI 三者同步契約如何在架構文件定錨？
  **建議**：AD-E07-10-S §4「維護規則」已要求隨引擎變更同步更新；建議 architect 於 AD 明列「decode 共用常數為 code 端單一真值，AD-E07-10-S 文件為其人類可讀對照，BR-4 測試斷言為兩者一致性閘」，使三方同步有明確 owner 與檢核點。
- **OQ-F107-03（decode 回傳粒度：維度層 vs 頂層 map）**：decode 附於每個 dimension（§5.1.1 採此）vs 頂層獨立 `decodeMap`？
  **建議**：採**維度層**（本 spec §5.1.1）——decode 與維度一一對應，前端 Tab 2/Tab 3 皆按維度取用，無需 join 頂層 map；回傳體積增量小（僅有 decode 之 6 欄 + 5 gating 欄帶輕量物件）。若 architect 認為頂層 map 更利快取，可改頂層並由前端 by columnName 查；不影響 AC（請 architect 拍板回傳形狀，§5.1.1 為建議預設）。

## 11. Definition of Done（下游驗收）

- AC-1 ~ AC-6 全部滿足。
- 後端 `getScoring()` 每個 dimension 回傳 `decode`（有 decode 之欄含 `sourceField` / `derivationRule` / `codes`；無 decode 之欄為 `null`/省略），涵蓋 OQ-decode-2 拍板之全部衍生欄（PROJECT_TP / SALES_STS / CUS_SEX / 三縣市 + 五欄分流 gating 摘要）。
- **decode 來源為與引擎同源之單一共用常數**（非前端常數、非 config 表）；**§6 BR-4 同步斷言已實作**（decode `codes`/`sourceField` ≡ AD-E07-10-S §2 + 引擎 `resolveColumnSource`；引擎衍生 keyword 變更時斷言失敗）——此斷言為本功能**核心 DoD**。
- 前端 Tab 3 碼層並陳 decode（原始碼保留）；Tab 2 欄層顯示來源欄 + 衍生規則摘要；皆唯讀。
- 無對應 decode 之維度優雅降級（不渲染、不報錯）；未選 CARD_TYPE / 無分數列空狀態正確（AC-5）。
- 計分採計範圍未變更（純 UI 呈現）之回歸確認（BR-5）。
- 不新增 error code、DB 欄位、migration（BR-7）；沿用既有 `/assignment/scoring` 路由、無新側欄項。
- OQ-decode-1 ~ OQ-decode-4 已落入本 spec（§13 Resolved Decisions）；OQ-F107-01 ~ 03 由 architect 裁定並記錄於 architecture decision。
- 設計意圖回寫原型之需求已交付 UI/UX 階段（本功能不改原型）。
- 後端 `tsc --noEmit -p tsconfig.build.json` 乾淨（vitest 不做型別檢查）；前端 build / 型別檢查通過。
- Code review 通過。

## 12. 範圍邊界（明確 out of scope）

- **不改計分引擎採計邏輯**（decode 純說明、不影響 score/card_level/tier）。
- **不做 decode 的編輯能力**（legacy 碼值不可改；無任何新增/編輯/刪除入口）。
- **不改原型 HTML**（設計意圖回寫由 UI/UX 階段處理）。
- **不混入 US-164/F106「啟用維度」功能**（兩者正交；本功能不碰 `status` chip / enable 端點）。
- **不展開 per-card default 卡別細目於 decode**（如「S5→花蓮縣」），僅述「缺值套 per-card default」；完整矩陣為引擎 `CARD_DEFAULTS` / AD-E07-10-S §1 工程真值。
- **不改 `architecture-spec.md` / AD-E07-10-S / AD-E07-10-L / data-model.md**（system-architect 範疇，列為 §10 OQ）。

## 13. 已拍板決議（Resolved Decisions）

| 編號 | 決議 | 落點 |
|------|------|------|
| OQ-decode-1 | decode **由後端 `getScoring()` 同源供給**；decode map 為與引擎同源之後端共用對照常數（**非前端常數、非 config 表**）| BR-1 / BR-2 / §5.1 |
| OQ-decode-2 | decode 涵蓋**全部衍生欄**（PROJECT_TP / SALES_STS / CUS_SEX / 三縣市 / 個人法人分流）| §5.1.2 / AC-1 / AC-2 |
| OQ-decode-3 | 呈現採 PA 建議：Tab 3 碼層「原始碼 + 並陳 decode」（碼保留利稽核）；Tab 2 欄層加「來源欄 + 衍生規則」摘要；tooltip/視覺交 UI/UX | UI-1 / UI-2 / UI-3 |
| OQ-decode-4 | **同步斷言（關鍵）**：decode 來源為單一共用常數，且**必須有測試斷言「UI/API decode ≡ 引擎衍生規則 + AD-E07-10-S 一致」**，納入 DoD | AC-4 / BR-4 / §11 |

> 本功能對使用者**無殘留 open question**（OQ-decode-1~4 已全數拍板）。殘留 §10 OQ-F107-01~03 屬 system-architect 範疇（decode 常數落點 / AD 同步契約定錨 / 回傳粒度），均附建議預設值。

## 相關文件

- **來源 Story**：[US-165](../../stories/epics/E07-app-customer-list-assignment/US-165-M02-decode-derived-code-business-meaning.md)
- **decode 內容真值**：[scorecard-derived-code-dictionary.md](../scorecard-derived-code-dictionary.md)（AD-E07-10-S）
- **引擎衍生規則來源**：`apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts`（`resolveColumnSource` / `CARD_DEFAULTS` / `MAPPED_SCORING_COLUMNS`）；JS oracle `assignment-run-pipeline.service.ts`（`resolveColumnValue`）；對齊 AD-E07-10-L
- **拆分來源**：[F106](F106-show-inactive-dimension-and-enable.md) §10 / OQ-164-1（decode UI 明確 out-of-scope、另立本獨立 Story）
- **同 Tab 既有功能**：[F053 查看計分維度設定](F053-view-scoring-dimensions.md)（`getScoring` 消費端）、[F054 編輯計分維度與分數](F054-edit-scoring-dimension.md)（Tab 2/3 編輯入口）、[F106 顯示停用維度並啟用](F106-show-inactive-dimension-and-enable.md)（`status` chip，正交）
- **錯誤碼**：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)
- **資料模型**：[data-model.md#e07-data-model](../data-model.md#e07-data-model)
- **流程圖**：[diagrams/F107-decode-ui-flow.mmd](../diagrams/F107-decode-ui-flow.mmd)
- **設計原則**：agent memory `feedback_scorecard_derived_code_traceability`（2026-06-25 使用者拍板）
- **原型**：`prototypes/28-scoring-config.html`（Tab 3 分數設定 / Tab 2 計分維度；目前無 decode）
- **前端**：`apps/web/src/pages/assignment/scoring-config-page.tsx`（`ScoresTab` / `DimensionsTab`）、`apps/web/src/api/assignment-scoring.ts`（`getScoring` / `ScoringDimensionItem`）
