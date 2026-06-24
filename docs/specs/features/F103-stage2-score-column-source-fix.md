---
spec-id: F103
title: 月跑計分引擎欄位來源修正（ADD_UN_CAPITAL 補 JOIN + 通用 fallback + PROJECT_TP 衍生 + 移除 COMMISSION 死碼 + JS oracle 補齊 customer_core + 202606 重跑驗收）
feature-id: F103
source-story: US-156 / US-157 / US-158
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-06-24
status: Draft
blocked-by: F100, F101
related: F100, F101, F102, F064, F067
---

# F103: 月跑計分引擎欄位來源修正

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-24

> ⚠️ **PRODUCTION 分派結果變更警告（必讀）**：本 feature 修正 Stage 2 計分引擎之欄位來源映射缺漏。現況計分系統性低估（H 卡 score 範圍 81–152，理論上界 255），無任何案件達 card C 門檻（185 分）→ 全部落 card D → tier 全部退化為 T3，與 legacy T1/T2/T3 分佈不符。上線後，`ADD_UN_CAPITAL`（最高 +36 分）與全部 `customer_core` 客戶屬性欄位（CUS_SEX / CAREA / CELLULAR / AGE 等）將正確計分，**改變各名單之 score / card_level / tier_level 分佈**（部分案件升至 card C/B/A → T2/T1）。此為「修正系統低估 bug」之分派結果變更，**非演算法變更**，但對下游 Stage 3/4（[F101](F101-stage3-4-proportional-assignment.md) 比例分派以 tier_level 分組）與匯出（[F064](F064-export-assignment-result.md)）皆有實質影響。上線前須以 dev 重跑 202606 驗收 tier spread（§4 AC-9~AC-12），並沿用 [F067](F067-compare-run-results.md) 差異報告 + 業務知會（§9 / NFR-005）。
>
> **v1.0（2026-06-24）**：依 3 個已核可 user story（US-156 PG 下推逐欄稽核 + ADD_UN_CAPITAL 補齊 / US-157 JS oracle 補齊 customer_core / US-158 202606 重跑 tier spread 驗收）落地。引擎兩條路徑（PG 下推 `buildStage2ScoreExpr` + JS oracle `computeScore`/`resolveColumnValue`）須**完全對齊** [AD-E07-10-L](../architecture-spec.md)（`architecture-spec.md` §4063–4093 映射規則表，line 4074–4091 完整 column_name→來源+缺值 default 表）。兩路徑須 JS↔SQL 等價（EQ DoD，`stage2to4-sql-builder.spec.ts`）。
>
> **OQ 裁定（已和使用者確認，寫進本 spec）**：OQ-156-02 通用 fallback **納入本輪、不留債**（§6 BR-F103-04）；OQ-158-02 資料品質根因 **納入本輪、不推延**（§4 AC-12）；OQ-158-01 tier spread 驗收為**定性**（§4 AC-11）；OQ-156-01 幽靈欄位＝通用 fallback 取不到值靜默 +0 + log、不阻擋月跑（§6 BR-F103-08）；OQ-157-01 AGE＝JS 與 PG 統一演算法確保 EQ（§6 BR-F103-09）。
>
> **刻意未動（邊界，交 system-architect）**：不撰寫架構決策文件（AD-* / `architecture-spec.md`）；不撰寫 production / test 程式碼 / migration / docker；`computeScore` 函式簽章設計（SCHEMA GAP-157-01）、JS oracle 取 `ob_arreturndf_min_cap` 之資料流（SCHEMA GAP-157-02）、SQLite 測試 customer_core mock 策略（OQ-157-02）皆列為**架構師 OQ**（§12），附建議。AD-E07-10-L 已是 system-architect 既有權威映射表，本 feature **對齊**它、不修改它（如稽核發現 AD 本身落差，列入 §12 交 architect 修正）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [AD-E07-10-L](../architecture-spec.md)（`architecture-spec.md` §4063–4093，**line 4074–4091 權威映射表 + line 4091 通用 fallback + line 4093 ADD_UN_CAPITAL ETL 前置警示**）+ `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts`（`resolveColumnSource` switch / `buildStage2ScoreExpr`）+ `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`computeScore` line ~1030 / `resolveColumnValue` line ~1073）+ entity：`customer-core`（無 TypeORM entity，raw SQL；AD-E06-1）/ `ob-arreturndf-min-cap`（`appl_no` / `add_un_capital`）/ `ob-levelcard-column` / `ob-levelcard-score` / `ob-pool-data` |
| Test Designer | 本文件 §4 AC（AC-1~AC-13）+ §6 BR + §8 逐欄稽核清單範本 + §11 測試覆蓋點名（EQ DoD：JS↔SQL 逐列等價 + ADD_UN_CAPITAL / 通用 fallback / 移除 COMMISSION 場景） |
| Architect | 本文件 §10 schema gap + §12 架構師 OQ（**3 項待裁：computeScore 簽章 vs 呼叫端 pre-fetch merge / JS oracle 取 arreturndf 資料流 / SQLite customer_core mock 策略**） |
| QA / Tester | 本文件 §4 AC + §13 驗收（202606 重跑 card_level / tier spread 定性門檻 + 資料品質根因檢核） |

---

## 1. 功能摘要

Stage 2 計分引擎有兩條平行路徑：

| 路徑 | 入口 | 環境 | 計分欄位取值 |
|------|------|------|-------------|
| PG 下推 SQL | `buildStage2ScoreExpr` → `resolveColumnSource`（`stage2to4-sql-builder.ts`） | 正式月跑（`DB_TYPE='postgres'`） | switch case 回 SQL 表達式 |
| JS oracle | `computeScore` → `resolveColumnValue`（`assignment-run-pipeline.service.ts`） | 單元測試 golden path / 非 PG 環境 | switch case 回 JS 值 |

兩路徑現行皆**未完全對齊** [AD-E07-10-L](../architecture-spec.md)（`architecture-spec.md` line 4074–4091）映射規則表，導致 Stage 2 計分系統性低估、card_level / tier 退化為單一值。本 feature 將兩路徑**完全對齊 AD-E07-10-L**，涵蓋下列六項修正：

1. **ADD_UN_CAPITAL 補 JOIN（US-156）**：PG 下推 `resolveColumnSource` 無對應 case → 回 `undefined` → 靜默 +0；實為 legacy H 卡最高 36 分項。補 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no`，表達式 `COALESCE(ar.add_un_capital, 0)`（range 型，AD line 4085）。
2. **通用 fallback（US-156 / OQ-156-02，本輪納入、不留債）**：取代 `resolveColumnSource` 之 `default: return undefined` → 實作 AD line 4091 通用引擎 `to_jsonb(o)->>lower(column_name)` cast numeric BETWEEN `level2_s`/`level2_e`（缺值 0）。讓任何 `ob_pool_data` 欄位被計分卡引用時都取得到值，杜絕「未 hardcode 的欄位靜默 +0」。
3. **PROJECT_TP 衍生邏輯（US-156，稽核項）**：AD line 4088 規定 `spec_name LIKE '%專案%'` → 衍生 `LEVEL1='A'`。稽核現行兩路徑是否漏實作此衍生，補齊或文件化。
4. **移除 COMMISSION 死碼（US-156 / US-157）**：`COMMISSION` 不在 AD-E07-10-L 映射表、legacy `OBLEVELCARD_COLUNM_20260505.csv` dump 完全無此欄位（0 筆）→ 兩路徑 switch 皆移除 `case 'COMMISSION'`。
5. **JS oracle 補齊 customer_core（US-157）**：`resolveColumnValue` 現行僅處理 `LIST_MONTH`/`PROJECT_TP`/`CAR_YEAR`/`COMMISSION`（死碼），其餘走 default 回 `''`（含全部 customer_core 欄位 + ADD_UN_CAPITAL）→ 不計分。補齊 CUS_SEX / AGE / CAREA_NO1 / CAREA_NO2 / CELLULAR / EDUCAT_BACK / HPOST_NUM_NM / CPOST_NUM_NM / CO_NUM_NM / LOAN_RATE + ADD_UN_CAPITAL，達 JS↔SQL EQ 等價。
6. **逐欄稽核 + 202606 重跑驗收（US-156 / US-158）**：產出全 card_type（H/S/S5/E/E5/M）逐欄稽核清單（§8），確認每個 active 欄依 AD-E07-10-L 取到正確來源且實際計分；dev 重跑 202606 驗證 card_level 不全 D、tier 含 T1/T2（定性），若仍異常則本輪內根因（引擎 vs customer_core 資料品質）。

**純後端**：本 feature 為月跑 pipeline 內計分邏輯修正，**無新前端頁、無新錯誤碼**。

## 2. 使用者故事

**As a** 業務主管（Sales Director）
**I want** 月跑 Stage 2 計分引擎（PG 下推 + JS oracle 兩條路徑）依 AD-E07-10-L 對每個 active 計分欄取到正確來源並實際計分，補齊 ADD_UN_CAPITAL 與全部 customer_core 客戶屬性欄位、移除 COMMISSION 死碼、並對未 hardcode 的 pool 欄位提供通用 fallback
**So that** 最終 card_level / tier 分佈能反映客戶真實屬性，重跑 202606 後不再因系統低估使全部案件退化為最低 tier（D / T3），而能呈現與 legacy 應有 T1/T2/T3 一致之 spread，讓下游 Stage 3/4 比例分派與匯出有意義

## 3. 前置條件

- [F100](F100-stage2-4-sql-pushdown-scoring.md) Stage 2 計分引擎（`buildStage2ScoreExpr` + `customer_core` LEFT JOIN）已交付（本 feature 在其上補 `ob_arreturndf_min_cap` JOIN + 通用 fallback）。
- [F101](F101-stage3-4-proportional-assignment.md) Stage 3/4 比例分派以 `ob_monthly_run_result.tier_level` 分組（本 feature 修正 Stage 2 之 tier_level 後，Stage 3/4 分組結果隨之改變）。
- **ADD_UN_CAPITAL ETL 前置依賴（AD line 4093）**：`ob_arreturndf_min_cap` ETL 同步須於月跑前完成；若該表為空，所有案件 `ADD_UN_CAPITAL` fallback 為 0，計分結果偏差。已查證：ETL 重做後對 pool 覆蓋 ~100%（§10）。
- `customer_core` ETL 已重做，對 pool ~100% 覆蓋；TEST_* 污染欄已清（§10）。
- `customer_core` 依 AD-E06-1 **不建 TypeORM entity**，PG 路徑以 raw SQL LEFT JOIN；JOIN key = `ob_pool_data.custo_no = customer_core.source_customer_no`。
- 兩條計分路徑須 JS↔SQL 等價（EQ DoD 測試 `stage2to4-sql-builder.spec.ts`）。

## 4. Acceptance Criteria

### US-156：PG 下推逐欄稽核 + ADD_UN_CAPITAL 補齊

#### AC-1（ADD_UN_CAPITAL 補 ob_arreturndf_min_cap LEFT JOIN）
- **Given** `ob_levelcard_column` 中有 `column_name = 'ADD_UN_CAPITAL'` 之 active 欄（card_type H）
- **When** `buildStage2ScoreExpr` 組裝 Stage 2 計分 SQL
- **Then** 生成的 SQL 含 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no`；`ADD_UN_CAPITAL` 對應表達式為 `COALESCE(ar.add_un_capital, 0)`（numeric，range 型）；該欄以 range 型參與計分加總；`needsArCapital`（或等效旗標）為 `true` 時才注入 JOIN（無 active ADD_UN_CAPITAL 欄則不注入，避免無謂 JOIN）

#### AC-2（通用 fallback 取代 default undefined，OQ-156-02 納入）
- **Given** `resolveColumnSource` 收到一個未 hardcode 於 switch、但存在於 `ob_pool_data` 之 `column_name`（例如某個只在特定 card 啟用的 pool 數值欄）
- **When** 該欄為某 card_type 之 active 計分欄
- **Then** `resolveColumnSource` 不再回 `undefined`，而是回傳 AD line 4091 通用引擎表達式：`COALESCE((to_jsonb(o)->>lower('<column_name>'))::numeric, 0)`（range 型，缺值 0），使該欄落入 `level2_s`/`level2_e` 區間時取分；通用 fallback 僅適用 range 型（數值維度），category 維度（字串相等）不在通用 fallback 範圍（AD line 4091 限定 cast numeric BETWEEN）

#### AC-3（PROJECT_TP 衍生邏輯稽核）
- **Given** AD line 4088 規定 `PROJECT_TP` 取 `spec_tp`，且若 `spec_name LIKE '%專案%'` 則衍生 `LEVEL1='A'`
- **When** 稽核兩路徑現行 `PROJECT_TP` 實作（現行 PG 為 `COALESCE(o.spec_tp, '01')`、JS 為 `pool.spec_tp ?? '01'`，**皆未實作 spec_name 衍生**）
- **Then** 稽核報告記錄此衍生缺漏；補齊 PROJECT_TP 表達式為「若 `spec_name LIKE '%專案%'` 則取 `'A'`，否則 `COALESCE(spec_tp, '01')`」（PG `CASE WHEN o.spec_name LIKE '%專案%' THEN 'A' ELSE COALESCE(o.spec_tp, '01') END`；JS 等價），兩路徑等價

#### AC-4（COMMISSION 死碼從 resolveColumnSource 移除）
- **Given** `COMMISSION` 在 legacy `OBLEVELCARD_COLUNM_20260505.csv` 完全不存在（任何 card_type 皆無，0 筆）且不在 AD-E07-10-L 映射表
- **When** 完成稽核後清理 `stage2to4-sql-builder.ts`
- **Then** `resolveColumnSource` switch 移除 `case 'COMMISSION'`；`MAPPED_SCORING_COLUMNS` 等公開集合移除 `'COMMISSION'`；移除後所有既有測試仍通過（若 COMMISSION 出現於 active column，改由 AC-2 通用 fallback 取值——但 legacy dump 證實不會出現）

#### AC-5（全 card_type 逐欄覆蓋稽核清單）
- **Given** legacy dump（`OBLEVELCARD_COLUNM_20260505.csv`）列出各 card_type（H/S/S5/E/E5/M）之 active 欄
- **When** 完成稽核
- **Then** 產出 §8 格式之逐欄稽核清單，每個 active 欄之「稽核結果」欄必須為「已驗證」或「已修正」，不得有「需補」或「待確認」留至上線

#### AC-6（PG 下推計分 SQL 無映射錯誤的幽靈欄位）
- **Given** 稽核後之 `resolveColumnSource`（含通用 fallback）
- **When** 以任意 card_type 執行 `buildStage2ScoreExpr`
- **Then** 每個 active 欄要麼有明確 hardcode SQL 表達式、要麼經 AC-2 通用 fallback 取值；若通用 fallback 亦取不到值（`to_jsonb(o)` 無此 key，即 AD 無映射且 pool 無此欄＝幽靈欄位），則靜默貢獻 +0 並 log warning（BR-F103-08），不阻擋月跑

#### AC-7（CAREA_NO1 / CAREA_NO2 語意確認）
- **Given** `CAREA_NO1` / `CAREA_NO2` 之 AD-E07-10-L 來源為 `(customer_core.home_phone IS NOT NULL)::int` / `(customer_core.contact_phone IS NOT NULL)::int`（電話有無 → 0 or 1），score rows level2_s/level2_e = {0,0} / {1,1}
- **When** 稽核現行 PG 表達式 `(cc.home_phone IS NOT NULL)::int` / `(cc.contact_phone IS NOT NULL)::int`
- **Then** 語意吻合，稽核清單記為「已驗證，無需修改」；無需更動 PG 路徑此兩欄（JS 路徑須補齊，AC-8）

### US-157：JS oracle 補齊 customer_core 欄位

#### AC-8（resolveColumnValue 補齊全部 customer_core 欄位）
- **Given** 月跑 JS oracle 路徑（`DB_TYPE != 'postgres'` 或單元測試環境）呼叫 `computeScore`
- **When** active 欄含 CUS_SEX / AGE / CAREA_NO1 / CAREA_NO2 / CELLULAR / EDUCAT_BACK / HPOST_NUM_NM / CPOST_NUM_NM / CO_NUM_NM / LOAN_RATE
- **Then** `resolveColumnValue` 對上述每欄回傳符合 AD-E07-10-L 語意之值（非空字串 `''`），且與 PG `resolveColumnSource` 表達式等價（對照表見 §8）；CUS_SEX→`gender ?? '3'`、CAREA_NO1→`home_phone ? 1 : 0`（對應 PG `(cc.home_phone IS NOT NULL)::int`）、AGE→統一演算法（BR-F103-09）、EDUCAT_BACK / *_NUM_NM→字串直接取（缺值 `''`）、LOAN_RATE→`pool.loan_rate ?? 0`

#### AC-9（ADD_UN_CAPITAL JS oracle 取值）
- **Given** JS oracle 路徑且 active 欄含 `ADD_UN_CAPITAL`
- **When** `computeScore` 計分
- **Then** `resolveColumnValue`（或等效路徑）回傳該案件 `ob_arreturndf_min_cap.add_un_capital`（缺值 `0`），與 PG `COALESCE(ar.add_un_capital, 0)` 等價；JS oracle 之 `ob_arreturndf_min_cap` 資料流由 SCHEMA GAP-157-02 / §12 架構師 OQ 決議後實作

#### AC-10（JS oracle 計分結果與 PG 下推 EQ 等價）
- **Given** 相同案件資料（pool + customer_core + arreturndf 欄位值）
- **When** 分別以 JS oracle（`computeScore`）與 PG 下推（`buildStage2ScoreExpr` 生成 SQL）計分
- **Then** 兩者計分結果相同（EQ DoD 容許誤差內）；`stage2to4-sql-builder.spec.ts` EQ 群組測試全部通過，含 ADD_UN_CAPITAL / 全 customer_core 欄位 / 通用 fallback 場景；既有測試不退化

### US-158：202606 重跑 tier spread 驗收

#### AC-11（重跑 202606 後 card_level / tier 分佈定性合理，OQ-158-01 定性）
- **Given** US-156 / US-157 修正已部署到 dev；`ob_arreturndf_min_cap` 與 `customer_core` ETL 已就緒（覆蓋 ~100%）
- **When** 在 dev 環境觸發 202606 月跑並查詢 `ob_monthly_run_result`（`GROUP BY card_level, tier_level`）
- **Then** card_level 分佈出現至少 2 種值（不再 100% 為 D）；tier_level 含至少部分 `'T1'` 或 `'T2'`（T3 非唯一值）；分佈方向與 legacy 202606 大致一致（T1 佔比 > 0%、T3 非 100%）；**定性驗收**，因案件集不完全相同允許數量差異，但不允許 T1/T2 全部消失（OQ-158-01）

#### AC-12（重跑後仍異常時本輪根因，OQ-158-02 納入、不推延）
- **Given** AC-11 重跑後 card_level 分佈仍異常（例如 ≥ 90% 為 D）
- **When** 進行根因分析
- **Then** **本輪內**判定根因屬「引擎欄位映射」（回 §8 稽核補漏）或「`customer_core` 資料品質」（量測 pool 案件對應 customer_core 各屬性欄之空值率／NULL 率，並記錄於驗收文件）；不另開 story 推延；若根因為資料品質（空值率過高使多數案件屬性無法取分），記錄為 ETL 範疇 follow-up 並於驗收文件明示，但本 feature 之引擎修正仍須通過 §8 稽核（引擎本身正確）

#### AC-13（既有測試全部通過，無回歸）
- **Given** US-156 / US-157 修改完成
- **When** 執行完整測試套件（`pnpm test`）+ `tsc --noEmit -p tsconfig.build.json`
- **Then** 全部測試通過、型別檢查零錯誤、無回歸

## 5. 計分欄位來源對齊（AD-E07-10-L 對齊聲明）

本 feature 之**唯一權威映射來源**為 [AD-E07-10-L](../architecture-spec.md)（`architecture-spec.md` line 4074–4091）。兩條引擎路徑（PG 下推 `resolveColumnSource` + JS oracle `resolveColumnValue`）修正後須與下表逐欄一致：

| column_name | AD-E07-10-L 來源 | 缺值 default | 型別 | 現行 PG 狀態 | 現行 JS 狀態 | 本輪動作 |
|-------------|------------------|-------------|------|--------------|--------------|---------|
| `CUS_SEX` | `customer_core.gender` | `'3'` | category | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| `CAREA_NO1` | `(customer_core.home_phone IS NOT NULL)::int` | `0` | range | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| `CAREA_NO2` | `(customer_core.contact_phone IS NOT NULL)::int` | `0` | range | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| `CELLULAR` | `(customer_core.mobile_phone IS NOT NULL)::int` | `0` | range | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| `AGE` | `EXTRACT(YEAR FROM age(customer_core.date_of_birth))` | `0` | range | 已映射 ✅ | default `''` ❌ | JS 補齊（統一演算法 BR-09）|
| `EDUCAT_BACK` | `customer_core.education_code` | `''` | category | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| `HPOST_NUM_NM` | `customer_core.residential_zip` | `''` | category | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| `CPOST_NUM_NM` | `customer_core.mailing_zip` | `''` | category | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| `CO_NUM_NM` | `customer_core.company_zip` | `''` | category | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| `ADD_UN_CAPITAL` | `ob_arreturndf_min_cap.add_un_capital` | `0` | range | **缺 → undefined ❌** | default `''` ❌ | **PG 補 JOIN + JS 補齊** |
| `CAR_YEAR` | `EXTRACT(YEAR FROM CURRENT_DATE) - year_produ::int` | `0` | range | 已映射 ✅ | 已映射 ✅ | 不動 |
| `LIST_MONTH` | `(p_pool_data).month_cnt` | `25` | range | 已映射 ✅ | 已映射 ✅ | 不動 |
| `PROJECT_TP` | `spec_tp`；`spec_name LIKE '%專案%'` 則 `LEVEL1='A'` | spec_tp `'01'` | category | **衍生缺漏 ❌** | **衍生缺漏 ❌** | **兩路徑補衍生** |
| `SALES_STS` | `CASE sales_sts_na ... END` 比對 `LEVEL1` | `'HFC'` | category | 已映射 ✅ | default `''` ❌（稽核）| JS 補齊（如為 active）|
| `LOAN_RATE` | `(p_pool_data).loan_rate` | `0` | range | 已映射 ✅ | default `''` ❌ | JS 補齊 |
| （其餘維度） | 通用引擎 `to_jsonb(p_pool_data)->>lower(column_name)` cast numeric BETWEEN level2_s/level2_e | `0` | range | **default undefined（未實作）❌** | default `''` ❌ | **PG 實作通用 fallback（BR-04）；JS 評估（OQ-157-02）** |
| ~~`COMMISSION`~~ | **不在 AD-E07-10-L、legacy dump 0 筆** | — | — | 死碼 case ❌ | 死碼 case ❌ | **兩路徑移除** |

> **稽核發現（交 architect）**：AD-E07-10-L line 4089 `SALES_STS` 取 `p_pool_data.sales_sts_na`（pool 欄），但現行 JS `resolveColumnValue` 走 default 回 `''`。若 `SALES_STS` 在任一 card_type 為 active 欄，JS 路徑亦需補齊（PG 已映射）。是否為 active 欄須由 §8 稽核 legacy dump 確認。

## 6. 業務規則（Business Rules）

- **BR-F103-01（ADD_UN_CAPITAL LEFT JOIN）**：PG 下推當任一 active 欄為 `ADD_UN_CAPITAL` 時，於 Stage 2 計分查詢注入 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no`（LEFT JOIN，無對應案件 fallback 0 分，不掉列）；表達式 `COALESCE(ar.add_un_capital, 0)`。JOIN 別名固定 `ar`，避免與 `o`（pool）/ `cc`（customer_core）衝突。無 active ADD_UN_CAPITAL 欄則不注入 JOIN（避免無謂查詢）。

- **BR-F103-02（ADD_UN_CAPITAL ETL 前置依賴，AD line 4093）**：`ADD_UN_CAPITAL` 維度僅在 `ob_arreturndf_min_cap` ETL 同步資料就緒時有意義。月跑前置檢核應確認 `OB_ARRETURNDF_MIN_CAP` ETL 已同步；若該表為空，所有案件 `ADD_UN_CAPITAL` fallback 為 0，計分偏差。本 feature 不實作 ETL（ETL 已重做、覆蓋 ~100%，§10），但 spec 明示此前置依賴為月跑必要檢核項。

- **BR-F103-03（PROJECT_TP 衍生）**：`PROJECT_TP` 取值規則為「若 `spec_name LIKE '%專案%'` 則 LEVEL1 衍生為 `'A'`，否則取 `COALESCE(spec_tp, '01')`」（AD line 4088）。PG 與 JS 兩路徑須等價實作此衍生。

- **BR-F103-04（通用 fallback，OQ-156-02 納入、不留債）**：`resolveColumnSource` 之 `default` 分支不再回 `undefined`，改回傳 AD line 4091 通用引擎表達式 `COALESCE((to_jsonb(o)->>lower('<column_name>'))::numeric, 0)`（range 型，缺值 0）。適用範圍＝**未 hardcode 於 switch 之 `ob_pool_data` 數值欄位**。category 維度（字串相等）不在通用 fallback（AD line 4091 限定 cast numeric BETWEEN）；非 pool 欄位（customer_core / arreturndf）已由 hardcode case 處理，不走 default。

- **BR-F103-05（移除 COMMISSION 死碼）**：兩路徑 switch 移除 `case 'COMMISSION'`；`MAPPED_SCORING_COLUMNS` 公開集合移除 `'COMMISSION'`。依據：legacy `OBLEVELCARD_COLUNM_20260505.csv` 0 筆 COMMISSION、不在 AD-E07-10-L。

- **BR-F103-06（JS oracle customer_core 補齊）**：`resolveColumnValue` 補齊 §5 表中所有「JS default ❌」欄位，取值與 PG 表達式逐欄等價（§8 對照）。

- **BR-F103-07（JS↔SQL EQ 等價，DoD 門檻）**：兩路徑修正後計分結果須等價（EQ DoD）。`stage2to4-sql-builder.spec.ts` EQ 群組測試（含 ADD_UN_CAPITAL / 全 customer_core / 通用 fallback / PROJECT_TP 衍生）為硬性 DoD，未通過不得上線。

- **BR-F103-08（幽靈欄位處置，OQ-156-01 裁定）**：若某 active `column_name` 既不在 AD-E07-10-L hardcode 映射、通用 fallback 亦取不到值（`to_jsonb(o)` 無此 key、且非 customer_core / arreturndf）＝幽靈欄位，則靜默貢獻 +0 並 `logger.warn`（含 column_name + card_type，供稽核），**不阻擋月跑**。理由：避免管理者自訂 card 或 dump 未涵蓋之 card_type 引用未知欄時整支月跑中斷。

- **BR-F103-09（AGE 統一演算法，OQ-157-01 裁定）**：JS 與 PG 兩路徑 AGE 計算採**同一演算法**確保 EQ。AD line 4080 為 PG `EXTRACT(YEAR FROM age(date_of_birth))`（精確到月，未過生日者不計當年）。JS 路徑須對齊此精確語意（依當前日期判斷是否已過生日），**不得**用 `getFullYear() 差` 之近似法（會與 PG 差 1 歲、破壞 EQ）。實作細節（JS 端是否以同一日期基準計算）由 tdd 依此規則落地，EQ 測試驗證。

- **BR-F103-10（202606 重跑驗收為定性，OQ-158-01）**：tier spread 驗收採定性門檻（card_level 不全 D、tier 含 T1/T2、方向對 legacy）；不設量化比例門檻（如 T1 ≥ 5%），因 CDMP 與 legacy 案件集不完全相同（[F067](F067-compare-run-results.md) 為差異報告依據）。

## 7. 計分流程（修正後）

```
（每名單 card_type 之 active version）
  ├─ 取 active ob_levelcard_column（status='active'）
  ├─ 對每個 active column：
  │    ├─ resolveColumnSource(column_name) / resolveColumnValue(column_name)
  │    │    ├─ hardcode case（LIST_MONTH/PROJECT_TP/CAR_YEAR/CUS_SEX/AGE/CAREA_*/CELLULAR/
  │    │    │   EDUCAT_BACK/*_NUM_NM/SALES_STS/LOAN_RATE/ADD_UN_CAPITAL）→ 對齊 AD-E07-10-L 表達式
  │    │    └─ default → 通用 fallback：COALESCE((to_jsonb(o)->>lower(col))::numeric, 0)
  │    │          └─ 取不到（幽靈欄位）→ +0 + logger.warn（BR-08）
  │    ├─ ADD_UN_CAPITAL active → 注入 LEFT JOIN ob_arreturndf_min_cap ar（BR-01）
  │    ├─ customer_core 欄 active → LEFT JOIN customer_core cc（F100 既有）
  │    └─ 取得值 → 比對 ob_levelcard_score（range: BETWEEN level2_s/level2_e；category: TRIM 相等）
  │         → 命中第一個 score row 取分（break 語意）
  ├─ SUM(各欄取分) → score
  ├─ score → card_level（ob_levelcard_level 區間）
  └─ card_level → tier_level（ob_tier，NULL-aware）
```

> 移除 `case 'COMMISSION'`（死碼，BR-05）。PROJECT_TP 補 spec_name 衍生（BR-03）。

## 8. 逐欄稽核清單範本（AC-5 產出格式）

稽核時對每個 card_type（H/S/S5/E/E5/M）之 active 欄產出下表，所有「稽核結果」須為「已驗證」或「已修正」：

| card_type | column_name | AD-E07-10-L 應有來源 | PG resolveColumnSource 現狀 | JS resolveColumnValue 現狀 | 稽核結果 |
|-----------|-------------|---------------------|----------------------------|----------------------------|---------|
| H | ADD_UN_CAPITAL | `ob_arreturndf_min_cap.add_un_capital` | 缺 case → undefined | default `''` | **已修正**（PG 補 JOIN + JS 補齊）|
| H | CAREA_NO1 | `(cc.home_phone IS NOT NULL)::int` | 有，正確 | default `''` | **已修正**（JS 補齊；PG 已驗證）|
| H | LIST_MONTH | `o.month_cnt`（缺值 25）| 有，正確 | 有，正確 | 已驗證 |
| H | PROJECT_TP | `spec_tp` + `spec_name LIKE '%專案%'→'A'` | 衍生缺漏 | 衍生缺漏 | **已修正**（兩路徑補衍生）|
| … | … | … | … | … | … |

> **稽核資料來源**：legacy `reference/DumpData/OBLEVELCARD_COLUNM_20260505.csv`（各 card_type active 欄名單）+ `OBLEVELCARD_SCORE_20260505.csv`（score rows 型別 range/category）+ dev DB `ob_levelcard_column`（status='active'）。**JS↔PG「現狀」欄逐欄對照**確保兩路徑修正後等價（BR-07 EQ）。

## 9. 與下游 / NFR 關係

- **下游影響**：Stage 2 tier_level 修正後，[F101](F101-stage3-4-proportional-assignment.md) Stage 3/4 比例分派（以 tier_level 分組）結果改變、[F064](F064-export-assignment-result.md) 匯出之分派結果改變。
- **驗收前置**：[F067](F067-compare-run-results.md) 差異報告唯有在 tier spread 正常後（AC-11）才有意義的 apples-to-apples 比對（目前 CDMP 全 T3 vs legacy T1/T2/T3，差異無法比對）。
- **NFR-003（Stage 2 效能 < 10 分鐘）**：新增 `ob_arreturndf_min_cap` LEFT JOIN（`ar.appl_no` index scan，PK on `appl_no`）與通用 fallback `to_jsonb(o)` 不得顯著升高 Stage 2 耗時；AD line 4098 預估 100K 案件 Stage 2 < 30 秒（含 customer_core + arreturndf 雙 lookup）。
- **NFR-005（分派結果變更須業務知會）**：本 feature 改變 score / card_level / tier 分佈，上線前須 F067 差異報告 + 業務知會。

## 10. 已查證事實（直接採用，不重新驗證）

- `customer_core` / `ob_arreturndf_min_cap` ETL **已重做**，對 pool **~100% 覆蓋**；TEST_* 污染欄已清。
- 現況計分低估：H 卡 max 理論分 = 255，目前 score 範圍 **81–152**（ADD_UN_CAPITAL +0、多個 customer_core 欄 +0）；card C 門檻 185 → 無案件達標 → 全 card D → 全 T3。
- `COMMISSION` 在 legacy `OBLEVELCARD_COLUNM_20260505.csv` **0 筆**，100% 死碼。
- `customer_core` 依 **AD-E06-1 不建 TypeORM entity**（PG raw SQL LEFT JOIN，JOIN key `custo_no = source_customer_no`）。
- `ob_arreturndf_min_cap` 遷移時補建 PK on `appl_no`（index scan）。
- 現行 PG `resolveColumnSource` 已映射 13 欄（含全部 customer_core）+ `COMMISSION` 死碼；`default` 回 `undefined`（無通用 fallback）。
- 現行 JS `resolveColumnValue` 僅映射 `LIST_MONTH`/`PROJECT_TP`/`CAR_YEAR`/`COMMISSION`（死碼），其餘回 `''`。
- `computeScore` 現行簽章：`(pool: ObPoolData, cardType, cardVersion, activeColumns, allScores)` — **無 customer_core / arreturndf 參數**（SCHEMA GAP-157-01 / -02）。

## 11. 測試覆蓋點名（交 test-designer）

- **PG 下推（`stage2to4-sql-builder.spec.ts`）**：(a) ADD_UN_CAPITAL active → SQL 含 `LEFT JOIN ob_arreturndf_min_cap ar` + `COALESCE(ar.add_un_capital, 0)`；(b) 通用 fallback：未 hardcode 之 pool 數值欄 active → SQL 含 `to_jsonb(o)->>lower(...)::numeric`；(c) PROJECT_TP active + spec_name `'%專案%'` → 取 `'A'`；(d) COMMISSION 不再出現於生成 SQL；(e) 無 active ADD_UN_CAPITAL 欄 → 不注入 ar JOIN。
- **JS oracle（pipeline service spec）**：(a) 全 customer_core 欄回正確值（非 `''`）；(b) AGE 統一演算法（未過生日者 −1，對齊 PG `age()`）；(c) COMMISSION case 移除；(d) ADD_UN_CAPITAL JS 取值（依 GAP-157-02 資料流）。
- **EQ DoD（PG 真庫，JS↔SQL 逐列等價）**：同案件資料兩路徑 score 相同，含 ADD_UN_CAPITAL / 全 customer_core / 通用 fallback / PROJECT_TP 衍生場景。
- **型別**：`tsc --noEmit -p tsconfig.build.json` 零錯誤（vitest 不做型別檢查，必跑）。
- **回歸**：`pnpm test` 全綠（無退化）。
- **驗收（US-158）**：dev 重跑 202606，`GROUP BY card_level, tier_level` 查詢 → card_level ≥ 2 值、tier 含 T1/T2；若仍異常，量測 customer_core 屬性欄空值率（AC-12）。

## 12. 架構師 OQ（交 system-architect，附建議）

> 以下需動 `computeScore` 函式簽章 / 資料流 / 測試 mock 策略，屬架構決策範疇。spec-writer 附建議預設值，由 system-architect 裁定後 tdd 落地。

- **架構師 OQ-1（SCHEMA GAP-157-01：computeScore 簽章）**：`computeScore` 現行無 customer_core 參數。補齊 JS oracle customer_core 取值需決定：(a) 擴充函式簽章加 `customerCore?: CustomerCore` 參數，或 (b) 呼叫端（pipeline `scoredPool` map，line ~624）pre-fetch 後將客戶屬性 merge 至 pool 物件自訂欄位。
  **建議＝(b) 呼叫端 pre-fetch merge**：JS oracle 僅單元測試 / 非 PG 環境使用（正式月跑走 PG 下推），呼叫端已逐 list 迴圈 pool；以 batch 查 customer_core（by custo_no 集合）後 merge 至 pool wrapper，可同時涵蓋 ADD_UN_CAPITAL（GAP-157-02），且不改 `computeScore` 純函式簽章對既有測試衝擊最小。`resolveColumnValue` 改讀 merge 後物件之擴充欄位。

- **架構師 OQ-2（SCHEMA GAP-157-02：JS oracle 取 arreturndf 資料流）**：JS oracle 無 `ob_arreturndf_min_cap` 存取路徑。ADD_UN_CAPITAL JS 取值需決定資料流：(a) `computeScore` 另傳 `arCapital?: number`，或 (b) 呼叫端 batch 查 `ob_arreturndf_min_cap`（by appl_no 集合）後 merge 至 pool wrapper。
  **建議＝(b) 與 OQ-1 同一 merge 流程**：呼叫端 batch 查 arreturndf（by appl_no）併入同一 pool wrapper 擴充欄位（如 `__add_un_capital`），`resolveColumnValue` 統一從 wrapper 讀。單一 pre-fetch merge 同時解 OQ-1 + OQ-2，資料流一致、易測。

- **架構師 OQ-3（OQ-157-02：SQLite 測試 customer_core mock 策略）**：`resolveColumnValue` 補齊後，非 PG 路徑（SQLite 測試環境）是否有 customer_core / arreturndf 表可查，或需 mock。
  **建議**：依 OQ-1/OQ-2 建議 (b)，JS oracle 不直接查表、改讀 pool wrapper 擴充欄位，則 SQLite 測試**無需建 customer_core / arreturndf 表**，僅需於測試 fixture 將屬性值塞入 pool wrapper（與現行 ObPoolData fixture 同源）。此設計使 EQ 測試（PG 真庫）與 JS 單元測試（fixture）解耦，呼應 F100 之 customer_core LEFT JOIN PG-only gate。

> **稽核衍生（如 AD 本身需修）**：若 §8 逐欄稽核發現 AD-E07-10-L line 4074–4091 映射表本身與 legacy dump / score rows 有落差（例如某 card_type active 欄之來源 AD 未列），列為架構師 OQ-4 交 system-architect 修正 AD（本 feature 對齊 AD、不改 AD）。

## 13. 假設（Assumptions）

- **[A-1]** `ob_arreturndf_min_cap` 之欄位名為 `appl_no`（JOIN key）與 `add_un_capital`（值），與 AD line 4069 / 4085 一致；tdd 落地前以 entity（`ob-arreturndf-min-cap.entity.ts`）查證確認。
- **[A-2]** AD line 4091 通用引擎 `to_jsonb(p_pool_data)->>lower(column_name)` 之 `p_pool_data` 在 PG 下推路徑對應 alias `o`（`ob_pool_data`），即 `to_jsonb(o)`；通用 fallback 僅對 `ob_pool_data` 欄位有效（customer_core / arreturndf 已 hardcode）。
- **[A-3]** legacy `OBLEVELCARD_COLUNM_20260505.csv` 涵蓋全部 production card_type（H/S/S5/E/E5/M）之 active 欄；dev DB 若有 dump 未列之 custom card_type，其未知欄走 BR-F103-08 幽靈欄位處置（+0 + log，不阻擋）。
- **[A-4]** `spec_name` 為 `ob_pool_data` 既有欄位（PROJECT_TP 衍生 BR-03 依賴）；tdd 落地前查證 entity 確認欄名（若實際欄名非 `spec_name`，依 entity 修正表達式）。
- **[A-5]** 202606 之 `ob_arreturndf_min_cap` / `customer_core` ETL 於 dev 已就緒且覆蓋 ~100%（§10），AC-11 重跑不受 ETL 缺資料干擾。

## 14. Related

- **權威映射表**：[AD-E07-10-L](../architecture-spec.md)（`architecture-spec.md` §4063–4093，line 4074–4091 映射表 + line 4091 通用 fallback + line 4093 ADD_UN_CAPITAL ETL 前置警示）
- **上游 feature**：[F100](F100-stage2-4-sql-pushdown-scoring.md)（Stage 2 計分引擎 + customer_core LEFT JOIN）、[F101](F101-stage3-4-proportional-assignment.md)（Stage 3/4 比例分派，依 tier_level）
- **下游 feature**：[F064](F064-export-assignment-result.md)（匯出分派結果，含 card_level / tier）、[F067](F067-compare-run-results.md)（差異報告，tier spread 正常後才有意義）
- **來源 Story**：[US-156](../../stories/epics/E07-app-customer-list-assignment/US-156-M04-stage2-score-column-source-audit.md) / [US-157](../../stories/epics/E07-app-customer-list-assignment/US-157-M04-stage2-score-js-oracle-customer-core.md) / [US-158](../../stories/epics/E07-app-customer-list-assignment/US-158-M04-stage2-tier-spread-validation.md)
- **Legacy Ground Truth**：`reference/DumpData/OBLEVELCARD_COLUNM_20260505.csv`（active 欄名單）、`OBLEVELCARD_SCORE_20260505.csv`（score rows）
- **引擎檔案**：`apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts`、`apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`
- **NFRs**：NFR-003（Stage 2 < 10 分鐘）、NFR-005（分派結果變更須業務知會）
