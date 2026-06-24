---
type: test-design-feature
feature_id: F103
feature_name: 月跑計分引擎欄位來源修正（ADD_UN_CAPITAL 補 JOIN + 通用 fallback + PROJECT_TP 衍生 + 移除 COMMISSION 死碼 + JS oracle 補齊 customer_core + 202606 重跑驗收）
priority: P0-MVP
related_spec: /docs/specs/features/F103-stage2-score-column-source-fix.md
source_ad: /docs/specs/implementation-log/AD-E07-v3.5-f103-stage2-score-column-source-fix.md
source_stories: [US-156, US-157, US-158]
spec_version: "1.0"
last_updated: 2026-06-24
blocked_by: [F100, F101]
---

# F103：月跑計分引擎欄位來源修正 — 測試設計

> ⚠️ **範圍**：本文件為測試設計（test design），**不含** production code、測試實作碼（spec 檔）、migration、entity 定義，由 tdd-implementation agent 承接落地。
>
> **驗收紅線（Definition of Done）**：
> 1. **EQ 群組**（I-SCORE-EQ-01：JS `computeScore` ↔ PG `buildStage2ScoreExpr` 生成 SQL，相同輸入下 score 完全相等，誤差容許 = 0）= 必須全綠，未過不得上線。
> 2. **AR-JOIN 群組**（I-SCORE-AR-JOIN-01：ADD_UN_CAPITAL active → `needsArCapital=true` → executor 注入 LEFT JOIN ob_arreturndf_min_cap）= DoD 紅線。
> 3. **FALLBACK 群組**（I-SCORE-FALLBACK-01：`resolveColumnSource` default 永不回 undefined）= 回歸紅線。
> 4. **COMMISSION 移除**（I-SCORE-COMMISSION-01：兩路徑 switch + `MAPPED_SCORING_COLUMNS` 全清）= 靜態掃描紅線。
> 5. **AGE 統一演算法**（I-SCORE-AGE-01：生日前一天/當天/後一天三邊界，JS = PG）= EQ 子項必測。
> 6. **幽靈欄位**（I-SCORE-GHOST-01：+0 + logger.warn，不拋例外，不阻擋月跑）= 行為紅線。
> 7. **`pnpm test` 全綠 + `tsc --noEmit -p tsconfig.build.json` 零錯誤**（AC-13）= 回歸門檻。
>
> **已裁定決策（所有 OQ 已 RESOLVED，測試據此驗收）**：
> - **OQ-1（computeScore 簽章）** = 呼叫端 batch pre-fetch merge，`cc: CustomerCoreRow | null` + `arCap: ArCapitalRow | null` 兩個新參數（AD-E07-v3.5 §3 OQ-1）。
> - **OQ-2（JS oracle 取 arreturndf 資料流）** = 同 OQ-1 單一 pre-fetch 流程（AD-E07-v3.5 §3 OQ-2）。
> - **OQ-3（SQLite 測試策略）** = 單元測試直接傳入 cc/arCap fixture，無需建 customer_core / arreturndf 表（AD-E07-v3.5 §3 OQ-3）。
> - **OQ-156-02（通用 fallback）** = 納入本輪，不留債（BR-F103-04）。
> - **OQ-157-01（AGE 統一演算法）** = JS 對齊 PG age() 精確語意（BR-F103-09 / I-SCORE-AGE-01）。
> - **OQ-158-01（202606 tier spread）** = 定性驗收（AC-11，BR-F103-10）。
> - **OQ-158-02（資料品質根因）** = 本輪內判定（AC-12，不推延）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F103 spec](../../specs/features/F103-stage2-score-column-source-fix.md)（§4 AC-1~13 / §5 欄位對齊表 / §6 BR-F103-01~10）+ [AD-E07-v3.5](../../specs/implementation-log/AD-E07-v3.5-f103-stage2-score-column-source-fix.md)（§3 OQ 定案 + §4 PG 改法 + §5 JS 改法 + §6 interface + §7 invariant + §8 測試注意事項）+ [architecture-spec.md §4074–4091]（AD-E07-10-L 映射表）+ `stage2to4-sql-builder.ts` + `assignment-run-pipeline.service.ts` |
| QA / Tester | 本文件（特別§二 EQ 等價矩陣 + §三 AGE 邊界 + §四 通用 fallback + §七 AUDIT 稽核 + §八 UPGRADE 驗收 + §九 回歸保護） |
| CI/CD Owner | 本文件「自動化就緒度」；F103 pg.spec 需序列執行（共用 cdmp_test DB，與 F098/F099/F100/F101/F102 同） |
| Product Analyst / 業務 | §八 UPGRADE — 202606 重跑 tier spread 定性驗收 + 資料品質根因 + F067 差異報告（AC-11/12） |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| **驗收紅線** | EQ 群組（JS↔SQL score 相等，PG 真庫）+ AR-JOIN flag 正確性 + COMMISSION 靜態移除 為 DoD 門檻 |
| **主要測試層** | ① **PG Integration（強制 Postgres）**：EQ 逐列等價（ADD_UN_CAPITAL / 全 cc 欄 / 通用 fallback / PROJECT_TP 衍生 / AGE 三邊界 / SALES_STS）、AR-JOIN 注入條件、needsArCapital flag 正確性 ② **Unit（純函式 / 靜態）**：JS `resolveColumnValue` 各欄取值、`calcAgeYears` 三邊界、COMMISSION 靜態移除、幽靈欄位 logger.warn、`MAPPED_SCORING_COLUMNS` 集合驗證 ③ **Integration（SQLite + JS oracle）**：`computeScore` 整合行為（cc=null / arCap=null 各欄 default）|
| **等價基準（Oracle）** | **EQ DoD**：相同 pool + cc + arCap fixture，JS `computeScore` 與 PG `buildStage2ScoreExpr` 生成 SQL 之 score 整數值完全相等（差異=0）。Oracle 手算驗算，禁止「SQL 自我斷言」（同錯假綠）。 |
| **Mock / Seed 注意** | OQ-3 裁定：單元測試直接傳 cc / arCap fixture（`CustomerCoreRow | null` / `ArCapitalRow | null`），**無需建 customer_core / ob_arreturndf_min_cap 表**。PG EQ 測試走真庫（PG-only gate，與 F100/F101/F102 pattern 一致）。AGE 測試須固定 `today` 基準（PG `CURRENT_DATE` 與 JS `new Date()` 同步）。 |
| **CI 序列執行** | F103 pg.spec 與 F098/F099/F100/F101/F102 共用 cdmp_test DB，**必須序列執行**，禁並行。 |
| **型別 gate** | 實作後必須跑 `tsc --noEmit -p tsconfig.build.json`（feedback_vitest_no_typecheck 教訓）。 |
| **幽靈欄位** | 幽靈欄位不拋例外、不阻擋月跑；PG 端靠 `COALESCE(NULL::numeric, 0)` 靜默=0；JS 端靠 `logger.warn` + 回傳 0。兩路徑行為各別驗測。 |

### 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 自動化適合度 | 說明 |
|------|--------|--------|-------------|--------------|------|
| AR（ADD_UN_CAPITAL JOIN flag，AC-1） | 5 | PG Integration + Unit | **是** | 高 | `needsArCapital` true/false；SQL 含/不含 JOIN；COALESCE fallback 0 |
| EQ（JS↔SQL 逐列等價，DoD） | 8 | PG Integration | **是** | 高 | **DoD 門檻**；8 場景涵蓋全欄位；誤差=0 |
| AGE（統一演算法三邊界，I-SCORE-AGE-01） | 4 | Unit + PG Integration | 是（EQ 子集） | 高 | 生日前一天/當天/後一天；cc=null fallback 0 |
| FALLBACK（通用 fallback 三邊界，I-SCORE-FALLBACK-01） | 5 | PG Integration + Unit | **是** | 高 | pool 有值/幽靈 key/非數值文字；PG+JS 各測 |
| GHOST（幽靈欄位，I-SCORE-GHOST-01） | 4 | Unit + PG Integration | 是（行為） | 高 | 不拋例外；logger.warn；+0；月跑繼續 |
| COMMISSION（靜態移除，I-SCORE-COMMISSION-01） | 4 | Unit（靜態） | 否 | 高 | resolveColumnSource / resolveColumnValue / MAPPED_SCORING_COLUMNS 掃描 |
| CC（customer_core 各欄 JS 取值，AC-8） | 10 | Unit | 否 | 高 | 10 個欄位逐欄驗測（含 cc=null default）；與 EQ 配合 |
| PROJECT_TP（衍生邏輯兩路徑，AC-3） | 4 | Unit + PG Integration | 是（EQ 子集） | 高 | spec_name 含/不含「專案」；PG CASE WHEN；JS includes() |
| AUDIT（全 card_type 逐欄稽核，AC-5/7） | 5 | Unit（靜態） | 否 | 高 | MAPPED_SCORING_COLUMNS 完整性；CAREA 語意；AD-E07-10-L 對齊 |
| PREFETCH（batch pre-fetch N+1 禁止，I-SCORE-PREFETCH-01） | 3 | PG Integration | **是** | 高 | customer_core IN clause 1 次；arreturndf IN clause 1 次 |
| UPGRADE（202606 重跑驗收，AC-11/12） | 3 | PG Integration + 人工 | **是** | 中（查詢自動、驗收定性） | card_level ≥2 種；tier 含 T1/T2；異常時量測空值率 |
| REG（回歸保護，AC-13） | 4 | PG Integration + Unit | **是** | 高 | F100/F101/F102 計分相關測試不退化；tsc gate |
| **合計** | **59** | — | **43 案例需 Postgres** | — | AR 5 + EQ 8 + AGE 4 + FALLBACK 5 + GHOST 4 + COMMISSION 4 + CC 10 + PROJECT_TP 4 + AUDIT 5 + PREFETCH 3 + UPGRADE 3 + REG 4 |

---

## 一、AR — ADD_UN_CAPITAL JOIN flag（AC-1，I-SCORE-AR-JOIN-01）

> **設計依據**：F103 spec §4 AC-1；BR-F103-01/02；AD-E07-v3.5 §4.1/4.2(a)/4.3(e)；invariant I-SCORE-AR-JOIN-01。

### TS-F103-AR-001：ADD_UN_CAPITAL active → `needsArCapital=true`，生成 SQL 含 LEFT JOIN

- **Related Requirement**：AC-1 / BR-F103-01 / I-SCORE-AR-JOIN-01
- **Test Type**：Positive / PG Integration
- **Preconditions**：`ob_levelcard_column` 中存在 card_type='H'、column_name='ADD_UN_CAPITAL'、status='active' 的 active 欄；`resolveColumnSource` 已補齊 ADD_UN_CAPITAL case。
- **Steps**：
  1. 以含 ADD_UN_CAPITAL active 欄的 activeColumns 呼叫 `buildStage2ScoreExpr`
  2. 解構回傳值 `{ scoreExpr, needsArCapital }`
  3. 檢查 executor 依 `needsArCapital=true` 組裝的完整 SQL
- **Expected Result**：
  - `needsArCapital` = `true`
  - 生成 SQL 含字串 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no`
  - ADD_UN_CAPITAL 對應 CASE 表達式含 `COALESCE(ar.add_un_capital, 0)`

### TS-F103-AR-002：無 ADD_UN_CAPITAL active 欄 → `needsArCapital=false`，SQL 不含 ar JOIN

- **Related Requirement**：AC-1 / BR-F103-01 / I-SCORE-AR-JOIN-01
- **Test Type**：Negative / PG Integration
- **Preconditions**：activeColumns 不含 ADD_UN_CAPITAL；其他 active 欄正常。
- **Steps**：
  1. 以不含 ADD_UN_CAPITAL 的 activeColumns 呼叫 `buildStage2ScoreExpr`
  2. 解構回傳值
  3. 確認 executor 組裝的 SQL
- **Expected Result**：
  - `needsArCapital` = `false`
  - 完整 SQL **不含** `ob_arreturndf_min_cap` 字串
  - 無多餘 JOIN 掃描（效能保護）

### TS-F103-AR-003：ADD_UN_CAPITAL 有對應 arreturndf 紀錄 → 取 add_un_capital 計分（PG 真庫）

- **Related Requirement**：AC-1 / AC-9（JS 對應）/ BR-F103-01
- **Test Type**：Positive / PG Integration
- **Preconditions**：seed pool 案件 appl_no='AP001'；`ob_arreturndf_min_cap` 含 `{ appl_no: 'AP001', add_un_capital: 20 }`；ADD_UN_CAPITAL score row：level2_s=10, level2_e=30, score=15（範例）。
- **Steps**：
  1. 執行包含 ADD_UN_CAPITAL 的 Stage 2 計分 SQL（PG 真庫）
  2. 查詢 `ob_monthly_run_result` 中 AP001 之 score
- **Expected Result**：
  - AP001 score 包含 ADD_UN_CAPITAL 貢獻的 15 分（命中 BETWEEN 10~30）
  - `COALESCE(ar.add_un_capital, 0)` = 20，落入計分區間 → +15

### TS-F103-AR-004：ADD_UN_CAPITAL 無對應 arreturndf 紀錄 → fallback 0，不掉列（PG 真庫）

- **Related Requirement**：AC-1 / BR-F103-01
- **Test Type**：Boundary / PG Integration
- **Preconditions**：seed pool 案件 appl_no='AP002'；`ob_arreturndf_min_cap` **不含** 'AP002'。
- **Steps**：
  1. 執行 Stage 2 計分 SQL
  2. 查詢 AP002 是否出現於結果集及其 score
- **Expected Result**：
  - AP002 **仍出現**於計分結果（LEFT JOIN 不掉列）
  - `COALESCE(ar.add_un_capital, 0)` = 0 → ADD_UN_CAPITAL 貢獻 0 分
  - 其餘欄位計分不受影響

### TS-F103-AR-005：JS oracle ADD_UN_CAPITAL — arCap=null → 回傳 0；arCap.add_un_capital=20 → 回傳 20

- **Related Requirement**：AC-9 / BR-F103-01 / OQ-2
- **Test Type**：Boundary / Unit
- **Preconditions**：`resolveColumnValue` 已補齊 ADD_UN_CAPITAL case；`computeScore` 簽章已擴充 `arCap` 參數。
- **Steps**：
  1. 呼叫 `resolveColumnValue(pool, 'ADD_UN_CAPITAL', cc=null, arCap=null)`，記錄回傳值
  2. 呼叫 `resolveColumnValue(pool, 'ADD_UN_CAPITAL', cc=null, arCap={ appl_no: 'AP001', add_un_capital: 20 })`，記錄回傳值
- **Expected Result**：
  - arCap=null → 回傳 `0`
  - arCap.add_un_capital=20 → 回傳 `20`

---

## 二、EQ — JS↔SQL 逐列等價 DoD（AC-10，I-SCORE-EQ-01）

> **設計依據**：F103 spec §4 AC-10；BR-F103-07；AD-E07-v3.5 §7 I-SCORE-EQ-01、§8.3；I-SCORE-EQ-01。
>
> **Oracle 說明**：每個場景在 PG 真庫執行 `buildStage2ScoreExpr` 生成 SQL，取得 PG score；同一 fixture 傳入 JS `computeScore`，取得 JS score。斷言 `jsScore === pgScore`（整數相等，誤差=0）。禁止「用 PG 跑完當 JS oracle」（同錯假綠）；oracle 應由手算或 fixture 約束使兩邊可獨立驗算。

### TS-F103-EQ-001：H 卡案件 — ADD_UN_CAPITAL > 0 + 全 customer_core 屬性有值

- **Related Requirement**：AC-10 / I-SCORE-EQ-01
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：
  - pool fixture: card_type='H'，spec_name='一般方案'，spec_tp='01'，month_cnt=12，year_produ=null，loan_rate=null，sales_sts_na='HFC'，appl_no='EQ001'，custo_no='C001'
  - cc fixture: gender='1', date_of_birth=生日已過（AGE 整數年齡 36），home_phone='02-12345678', contact_phone='0911', mobile_phone='0922', education_code='D', residential_zip='100', mailing_zip='200', company_zip='300'
  - arCap fixture: add_un_capital=20
  - ob_levelcard_column active 欄：ADD_UN_CAPITAL, CUS_SEX, AGE, CAREA_NO1, CAREA_NO2, CELLULAR, EDUCAT_BACK, HPOST_NUM_NM, CPOST_NUM_NM, CO_NUM_NM, LIST_MONTH
  - ob_levelcard_score：各欄對應 score row 已設定（手算目標分）
- **Steps**：
  1. PG 路徑：以 PG 真庫執行 Stage 2 計分 SQL，取得 pgScore
  2. JS 路徑：傳入上述 fixture 呼叫 `computeScore(pool, 'H', version, activeColumns, allScores, cc, arCap)`，取得 jsScore
  3. 斷言 `jsScore === pgScore`
- **Expected Result**：兩路徑 score 完全相等（整數相等，誤差=0）；ADD_UN_CAPITAL 貢獻非 0 分

### TS-F103-EQ-002：H 卡案件 — ADD_UN_CAPITAL null（無 arreturndf 對應）

- **Related Requirement**：AC-10 / I-SCORE-EQ-01
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：同 EQ-001，但 arCap=null（`ob_arreturndf_min_cap` 無 'EQ002' 紀錄）。
- **Steps**：
  1. PG 路徑取得 pgScore（ADD_UN_CAPITAL = COALESCE(null, 0) = 0）
  2. JS 路徑取得 jsScore（arCap=null → ADD_UN_CAPITAL 回 0）
  3. 斷言 `jsScore === pgScore`
- **Expected Result**：兩路徑 score 相等；ADD_UN_CAPITAL 貢獻 0 分

### TS-F103-EQ-003：H 卡案件 — cc=null（無 customer_core 對應，屬性全 default）

- **Related Requirement**：AC-10 / I-SCORE-EQ-01
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：pool custo_no='C_UNKNOWN'；`customer_core` **不含** 'C_UNKNOWN'（cc=null）；arCap=null。
- **Steps**：
  1. PG 路徑：customer_core LEFT JOIN 無命中，各 cc 欄走 COALESCE default（gender→'3'，phone→0，等）
  2. JS 路徑：cc=null，各欄走 default（gender→'3'，CAREA_NO1→0，等）
  3. 斷言 `jsScore === pgScore`
- **Expected Result**：兩路徑 score 相等；cc 相關欄全走 default，score 為合理基準值

### TS-F103-EQ-004：PROJECT_TP active + spec_name 含「專案」→ 衍生 'A'

- **Related Requirement**：AC-3 / AC-10 / BR-F103-03 / I-SCORE-EQ-01
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：pool.spec_name='汽車貸款專案'；active 欄含 PROJECT_TP；PROJECT_TP score row LEVEL1='A' 有對應分數。
- **Steps**：
  1. PG 路徑：`CASE WHEN o.spec_name LIKE '%專案%' THEN 'A' ELSE COALESCE(o.spec_tp, '01') END` = 'A'
  2. JS 路徑：`pool.spec_name?.includes('專案')` = true → 回傳 'A'
  3. 斷言 `jsScore === pgScore`
- **Expected Result**：兩路徑 PROJECT_TP 取值均為 'A'，score 相等

### TS-F103-EQ-005：PROJECT_TP active + spec_name 不含「專案」→ 取 spec_tp

- **Related Requirement**：AC-3 / AC-10 / BR-F103-03 / I-SCORE-EQ-01
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：pool.spec_name='一般房貸方案'（無「專案」）；pool.spec_tp='02'；active 欄含 PROJECT_TP；PROJECT_TP score row LEVEL1='02' 有對應分數。
- **Steps**：
  1. PG 路徑：`CASE WHEN ... LIKE '%專案%' THEN 'A' ELSE COALESCE(o.spec_tp, '01') END` = '02'
  2. JS 路徑：`pool.spec_name?.includes('專案')` = false → 回傳 `pool.spec_tp ?? '01'` = '02'
  3. 斷言 `jsScore === pgScore`
- **Expected Result**：兩路徑 PROJECT_TP 取值均為 '02'，score 相等

### TS-F103-EQ-006：SALES_STS active — sales_sts_na='AGENT' / '經銷商' / 其他（三值）

- **Related Requirement**：AC-10 / I-SCORE-EQ-01
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：三個 pool fixture，分別 sales_sts_na='AGENT' / '經銷商' / 'DIRECT'；active 欄含 SALES_STS；score row 對應 LEVEL1='AGENT'/'UCD'/'HFC' 各有分數。
- **Steps**：
  1. PG 路徑：CASE 表達式分別回傳 'AGENT' / 'UCD' / 'HFC'
  2. JS 路徑：switch case 分別回傳 'AGENT' / 'UCD' / 'HFC'
  3. 各 fixture 斷言 `jsScore === pgScore`
- **Expected Result**：三個案件兩路徑 score 均相等；SALES_STS 對應正確 LEVEL1 計分

### TS-F103-EQ-007：AGE 邊界（I-SCORE-AGE-01）—生日前一天/當天/後一天，JS=PG

- **Related Requirement**：AC-10 / BR-F103-09 / I-SCORE-AGE-01 / I-SCORE-EQ-01
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：
  - `today` 固定為 `2026-06-24`（PG 端以 `CAST('2026-06-24' AS DATE)` 替換 `CURRENT_DATE`，或在同一毫秒內執行兩路徑確保一致）
  - 三個 cc fixture：date_of_birth = 1990-06-23（已過）/ 1990-06-24（當天）/ 1990-06-25（未到）
  - active 欄含 AGE；AGE score row 對應年齡區間有分數
- **Steps**：
  1. 對三個 date_of_birth 分別執行 PG 路徑（EXTRACT(YEAR FROM age(...))）取得 pgAge
  2. 對三個 date_of_birth 分別執行 JS `calcAgeYears(dateOfBirth, today)` 取得 jsAge
  3. 斷言 pgAge === jsAge（三個均）
  4. 確認 `1990-06-23 → 36`、`1990-06-24 → 36`、`1990-06-25 → 35`
  5. 完整 score EQ：`jsScore === pgScore`
- **Expected Result**：
  - 生日前一天（1990-06-23）→ pgAge=36，jsAge=36
  - 生日當天（1990-06-24）→ pgAge=36，jsAge=36（當天算已過，不減 1）
  - 生日後一天（1990-06-25）→ pgAge=35，jsAge=35（未過，減 1）
  - 三個 fixture score 兩路徑完全相等

### TS-F103-EQ-008：通用 fallback — 未 hardcode 的 range pool 欄

- **Related Requirement**：AC-2 / AC-10 / BR-F103-04 / I-SCORE-FALLBACK-01 / I-SCORE-EQ-01
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：active 欄含 `LOAN_AMOUNT`（非 hardcode switch case）；pool 含 `loan_amount=50000` 欄位；score row BETWEEN 40000~60000 = score X。
- **Steps**：
  1. PG 路徑：`resolveColumnSource('LOAN_AMOUNT')` 走 default → `COALESCE((to_jsonb(o)->>'loan_amount')::numeric, 0)` = 50000 → 計分 X
  2. JS 路徑：`resolveColumnValue(pool, 'LOAN_AMOUNT', cc, arCap)` 走 default → `Number(pool.loan_amount)` = 50000 → 計分 X
  3. 斷言 `jsScore === pgScore`
- **Expected Result**：兩路徑 LOAN_AMOUNT 均取得 50000，score 相等

---

## 三、AGE — 統一演算法邊界（I-SCORE-AGE-01）

> **設計依據**：F103 spec §6 BR-F103-09；AD-E07-v3.5 §6.5 calcAgeYears；I-SCORE-AGE-01。
> **注意**：EQ-007 已覆蓋 PG+JS 等價；本群組另針對 JS `calcAgeYears` 純函式行為進行單元測試。

### TS-F103-AGE-001：生日前一天（1990-06-23，today=2026-06-24）→ age=36

- **Related Requirement**：BR-F103-09 / I-SCORE-AGE-01
- **Test Type**：Boundary / Unit
- **Steps**：呼叫 `calcAgeYears(new Date('1990-06-23'), new Date('2026-06-24'))`
- **Expected Result**：回傳 `36`（nowMonth > birthMonth → 不減 1）

### TS-F103-AGE-002：生日當天（1990-06-24，today=2026-06-24）→ age=36

- **Related Requirement**：BR-F103-09 / I-SCORE-AGE-01
- **Test Type**：Boundary / Unit
- **Steps**：呼叫 `calcAgeYears(new Date('1990-06-24'), new Date('2026-06-24'))`
- **Expected Result**：回傳 `36`（nowMonth===birthMonth && nowDay===birthDay → 條件 `nowDay < birthDay` 為 false → 不減 1）

### TS-F103-AGE-003：生日後一天（1990-06-25，today=2026-06-24）→ age=35

- **Related Requirement**：BR-F103-09 / I-SCORE-AGE-01
- **Test Type**：Boundary / Unit
- **Steps**：呼叫 `calcAgeYears(new Date('1990-06-25'), new Date('2026-06-24'))`
- **Expected Result**：回傳 `35`（nowMonth===birthMonth && nowDay(24) < birthDay(25) → 減 1）

### TS-F103-AGE-004：cc=null 時 AGE → resolveColumnValue 回傳 0

- **Related Requirement**：AC-8 / BR-F103-06
- **Test Type**：Boundary / Unit
- **Steps**：呼叫 `resolveColumnValue(pool, 'AGE', null, null)`
- **Expected Result**：回傳 `0`（`!cc?.date_of_birth` 為 true → 早返回 0）

---

## 四、FALLBACK — 通用 fallback 三邊界（I-SCORE-FALLBACK-01）

> **設計依據**：F103 spec §4 AC-2；BR-F103-04；AD-E07-v3.5 §4.2(d)、§6.4 default 分支、§8.5 通用 fallback 邊界測試；I-SCORE-FALLBACK-01。

### TS-F103-FALLBACK-001：PG — ob_pool_data 有值（loan_amount=50000）→ COALESCE numeric=50000

- **Related Requirement**：AC-2 / BR-F103-04 / I-SCORE-FALLBACK-01
- **Test Type**：Positive / PG Integration
- **Preconditions**：`ob_pool_data` 含 `loan_amount=50000` 欄位；active column 'LOAN_AMOUNT'（未 hardcode 於 switch）。
- **Steps**：
  1. 呼叫 `resolveColumnSource('LOAN_AMOUNT')`
  2. 驗證回傳值為 `{ kind: 'range', expr: "COALESCE((to_jsonb(o)->>'loan_amount')::numeric, 0)" }`
  3. 實際 PG 執行，確認 expr 取值 = 50000
- **Expected Result**：`resolveColumnSource` 不回 undefined；PG 取值 50000

### TS-F103-FALLBACK-002：PG — ob_pool_data 無此 key（幽靈欄位 XYZ_COL）→ COALESCE NULL → 0

- **Related Requirement**：AC-2 / AC-6 / BR-F103-04 / BR-F103-08 / I-SCORE-FALLBACK-01 / I-SCORE-GHOST-01
- **Test Type**：Boundary / PG Integration
- **Preconditions**：active column 'XYZ_COL'（ob_pool_data 完全無此欄）。
- **Steps**：
  1. 呼叫 `resolveColumnSource('XYZ_COL')`
  2. 驗證回傳 `{ kind: 'range', expr: "COALESCE((to_jsonb(o)->>'xyz_col')::numeric, 0)" }`
  3. 實際 PG 執行：`to_jsonb(o)->>'xyz_col'` = NULL → COALESCE 取 0
- **Expected Result**：PG 計分貢獻 0；月跑**不中斷**；`resolveColumnSource` 永不回 undefined（I-SCORE-FALLBACK-01）

### TS-F103-FALLBACK-003：PG — 非數值文字（pool 欄值為 'N/A'）→ cast numeric 失敗 → COALESCE → 0

- **Related Requirement**：AC-2 / BR-F103-04 / I-SCORE-FALLBACK-01
- **Test Type**：Boundary / PG Integration
- **Preconditions**：active column 'ABC_STR'；`ob_pool_data.abc_str` = 'N/A'（文字）。
- **Steps**：
  1. PG 執行 `COALESCE((to_jsonb(o)->>'abc_str')::numeric, 0)`
  2. 驗證 'N/A'::numeric 回傳 NULL（PG cast failure）→ COALESCE 取 0
- **Expected Result**：PG 計分貢獻 0；無例外；月跑繼續

### TS-F103-FALLBACK-004：JS — pool 有值（pool.loan_amount=50000）→ 回傳 50000

- **Related Requirement**：AC-2 / BR-F103-04 / I-SCORE-FALLBACK-01
- **Test Type**：Positive / Unit
- **Preconditions**：`pool.loan_amount = 50000`；column 'LOAN_AMOUNT' 不在 switch。
- **Steps**：呼叫 `resolveColumnValue(pool, 'LOAN_AMOUNT', null, null)`
- **Expected Result**：走 default → `key='loan_amount'` → `raw=50000` → `Number(50000)=50000` → 回傳 `50000`

### TS-F103-FALLBACK-005：JS — pool 無此 key（幽靈欄位 XYZ_COL）→ logger.warn + 回傳 0

- **Related Requirement**：AC-2 / AC-6 / BR-F103-08 / I-SCORE-GHOST-01
- **Test Type**：Boundary / Unit
- **Preconditions**：pool 完全無 'xyz_col' key；column 'XYZ_COL'；spy logger.warn。
- **Steps**：
  1. 呼叫 `resolveColumnValue(pool, 'XYZ_COL', null, null)`
  2. 捕獲回傳值
  3. 驗證 logger.warn 被呼叫（含 column_name 'XYZ_COL'）
- **Expected Result**：回傳 `0`；`logger.warn` 被呼叫一次，訊息含 'XYZ_COL'；**不拋例外**

---

## 五、GHOST — 幽靈欄位行為（I-SCORE-GHOST-01）

> **設計依據**：F103 spec §4 AC-6；BR-F103-08；AD-E07-v3.5 §7 I-SCORE-GHOST-01；OQ-156-01 裁定。

### TS-F103-GHOST-001：幽靈欄位不拋例外、月跑繼續（JS 路徑）

- **Related Requirement**：AC-6 / BR-F103-08 / I-SCORE-GHOST-01
- **Test Type**：Negative / Unit
- **Preconditions**：activeColumns 含幽靈欄位 'UNKNOWN_COL'（AD 無映射、pool 無此欄）；其他欄正常。
- **Steps**：
  1. 呼叫完整 `computeScore(pool, cardType, version, activeColumns, allScores, cc, arCap)`
  2. 確認不拋例外
  3. 確認 logger.warn 被呼叫（含 'UNKNOWN_COL'）
  4. 確認最終 score 為其他正常欄之總和（幽靈欄貢獻 0）
- **Expected Result**：不拋例外；logger.warn 含 column_name='UNKNOWN_COL' + card_type；幽靈欄貢獻 +0

### TS-F103-GHOST-002：幽靈欄位不拋例外、月跑繼續（PG 路徑，PG Integration）

- **Related Requirement**：AC-6 / BR-F103-08 / I-SCORE-GHOST-01
- **Test Type**：Negative / PG Integration
- **Preconditions**：ob_levelcard_column 含幽靈欄位 'UNKNOWN_COL'；ob_pool_data 無此欄。
- **Steps**：
  1. PG 執行 `buildStage2ScoreExpr` 含 'UNKNOWN_COL'
  2. 確認生成 SQL 含 `COALESCE((to_jsonb(o)->>'unknown_col')::numeric, 0)`（fallback 表達式）
  3. 實際 PG 執行，確認不報 SQL 錯誤，結果正常回傳
- **Expected Result**：PG 不拋例外；幽靈欄位貢獻 COALESCE(NULL,0)=0；月跑不中斷

### TS-F103-GHOST-003：非數值文字幽靈欄位（PG 端 cast 失敗靜默=0）

- **Related Requirement**：AC-6 / BR-F103-08 / I-SCORE-GHOST-01
- **Test Type**：Boundary / PG Integration
- **Preconditions**：ob_pool_data 含 'ghost_str'='XYZ'（文字）；active column 'GHOST_STR'。
- **Steps**：
  1. PG 執行含通用 fallback 的計分 SQL
  2. `'XYZ'::numeric` 回 NULL → COALESCE 取 0
- **Expected Result**：計分貢獻 0；無 PG 例外；月跑繼續

### TS-F103-GHOST-004：JS 端非數值文字幽靈欄位（Number.isNaN → 0）

- **Related Requirement**：AC-6 / BR-F103-08 / I-SCORE-GHOST-01
- **Test Type**：Boundary / Unit
- **Preconditions**：pool.ghost_str='XYZ'；column 'GHOST_STR'（非 hardcode）。
- **Steps**：呼叫 `resolveColumnValue(pool, 'GHOST_STR', null, null)`
- **Expected Result**：`Number('XYZ')` = NaN → `Number.isNaN(num)` → 回傳 `0`；不拋例外

---

## 六、COMMISSION — 靜態移除（I-SCORE-COMMISSION-01）

> **設計依據**：F103 spec §4 AC-4；BR-F103-05；AD-E07-v3.5 §4.2(b)、§7 I-SCORE-COMMISSION-01；legacy dump 0 筆確認。

### TS-F103-COMMISSION-001：resolveColumnSource('COMMISSION') 不走死碼 case，走通用 fallback

- **Related Requirement**：AC-4 / BR-F103-05 / I-SCORE-COMMISSION-01
- **Test Type**：Negative / Unit（靜態）
- **Steps**：
  1. 呼叫 `resolveColumnSource('COMMISSION')`
  2. 確認回傳值為通用 fallback 表達式（`COALESCE((to_jsonb(o)->>'commission')::numeric, 0)`），而非死碼 `COALESCE(CAST(o.commission AS numeric), 0)`
  3. 靜態掃描：`resolveColumnSource` switch 無 `case 'COMMISSION'` 字串
- **Expected Result**：COMMISSION 走 default 通用 fallback；switch 中無 COMMISSION 專屬 case

### TS-F103-COMMISSION-002：resolveColumnValue('COMMISSION') 不走死碼 case，走 default 通用 fallback

- **Related Requirement**：AC-4 / BR-F103-05 / I-SCORE-COMMISSION-01
- **Test Type**：Negative / Unit（靜態）
- **Steps**：
  1. 呼叫 `resolveColumnValue(pool, 'COMMISSION', cc=null, arCap=null)`
  2. 確認走 default 分支（logger.warn，因 pool 無 commission key）
  3. 靜態掃描：`resolveColumnValue` switch 無 `case 'COMMISSION'` 字串
- **Expected Result**：COMMISSION 走 default 幽靈欄位路徑；回傳 0 + logger.warn；switch 無死碼

### TS-F103-COMMISSION-003：`MAPPED_SCORING_COLUMNS` 不含 'COMMISSION'

- **Related Requirement**：AC-4 / BR-F103-05 / I-SCORE-COMMISSION-01
- **Test Type**：Negative / Unit（靜態）
- **Steps**：匯入 `MAPPED_SCORING_COLUMNS` 集合；斷言 `!MAPPED_SCORING_COLUMNS.includes('COMMISSION')`
- **Expected Result**：`MAPPED_SCORING_COLUMNS` 不包含 'COMMISSION'

### TS-F103-COMMISSION-004：`MAPPED_SCORING_COLUMNS` 含 'ADD_UN_CAPITAL'

- **Related Requirement**：AC-4 / BR-F103-05 / AD-E07-v3.5 §4.2(f)
- **Test Type**：Positive / Unit（靜態）
- **Steps**：匯入 `MAPPED_SCORING_COLUMNS`；斷言 `MAPPED_SCORING_COLUMNS.includes('ADD_UN_CAPITAL')`
- **Expected Result**：`MAPPED_SCORING_COLUMNS` 包含 'ADD_UN_CAPITAL'（新增後取代 COMMISSION）

---

## 七、CC — customer_core 各欄 JS 取值（AC-8）

> **設計依據**：F103 spec §4 AC-8；BR-F103-06；AD-E07-v3.5 §6.4 resolveColumnValue 全補齊。
> **注意**：本群組為單元測試，直接傳入 cc fixture，無需 DB。PG 對應欄位已驗證（AC-7），本群組重點在 JS 補齊後的行為正確性。

### TS-F103-CC-001：CUS_SEX — cc=null → '3'；cc.gender='1' → '1'

- **Related Requirement**：AC-8 / F103 spec §5 CUS_SEX 行
- **Steps**：
  1. `resolveColumnValue(pool, 'CUS_SEX', null, null)` → 驗證回傳 `'3'`
  2. `resolveColumnValue(pool, 'CUS_SEX', { gender: '1', ...restNull }, null)` → 驗證回傳 `'1'`
- **Expected Result**：cc=null → default '3'；cc.gender='1' → '1'

### TS-F103-CC-002：CAREA_NO1 — cc.home_phone=null → 0；cc.home_phone='02-1234' → 1

- **Related Requirement**：AC-7 / AC-8（JS 補齊）
- **Steps**：
  1. cc.home_phone=null → `resolveColumnValue(..., 'CAREA_NO1', cc, null)` = 0
  2. cc.home_phone='02-12345678' → = 1
- **Expected Result**：null → 0（IS NOT NULL = false = 0）；非 null → 1

### TS-F103-CC-003：CAREA_NO2 — cc.contact_phone=null → 0；有值 → 1

- **Related Requirement**：AC-7 / AC-8
- **Steps**：同 CC-002 邏輯，針對 CAREA_NO2 / contact_phone
- **Expected Result**：null → 0；有值 → 1

### TS-F103-CC-004：CELLULAR — cc.mobile_phone=null → 0；有值 → 1

- **Related Requirement**：AC-8
- **Steps**：同 CC-002 邏輯，針對 CELLULAR / mobile_phone
- **Expected Result**：null → 0；有值 → 1

### TS-F103-CC-005：AGE（cc=null → 0；cc.date_of_birth 生日已過 → 正確整數年齡）

- **Related Requirement**：AC-8 / BR-F103-09 / I-SCORE-AGE-01（詳細邊界在 AGE 群組）
- **Steps**：
  1. cc=null → 回傳 0
  2. cc.date_of_birth=1990-06-23（今天 2026-06-24，已過）→ 呼叫 `calcAgeYears`，回傳 36
- **Expected Result**：cc=null → 0；生日已過 → calcAgeYears 回傳正確年齡

### TS-F103-CC-006：EDUCAT_BACK — cc.education_code='D' → 'D'；cc=null → ''

- **Related Requirement**：AC-8 / F103 spec §5
- **Steps**：
  1. cc.education_code='D' → 回傳 `'D'`
  2. cc=null → 回傳 `''`（缺值 default ''）
- **Expected Result**：有值取值；cc=null 回 ''

### TS-F103-CC-007：HPOST_NUM_NM — cc.residential_zip='100' → '100'；cc=null → ''

- **Related Requirement**：AC-8 / F103 spec §5
- **Steps**：對應 HPOST_NUM_NM / residential_zip
- **Expected Result**：有值 → 取值；cc=null → ''

### TS-F103-CC-008：CPOST_NUM_NM — cc.mailing_zip='200' → '200'；cc=null → ''

- **Related Requirement**：AC-8 / F103 spec §5
- **Steps**：對應 CPOST_NUM_NM / mailing_zip
- **Expected Result**：有值 → 取值；cc=null → ''

### TS-F103-CC-009：CO_NUM_NM — cc.company_zip='300' → '300'；cc=null → ''

- **Related Requirement**：AC-8 / F103 spec §5
- **Steps**：對應 CO_NUM_NM / company_zip
- **Expected Result**：有值 → 取值；cc=null → ''

### TS-F103-CC-010：LOAN_RATE — pool.loan_rate=0.05 → 0.05（numeric）；pool.loan_rate=null → 0

- **Related Requirement**：AC-8 / F103 spec §5 LOAN_RATE 行
- **Steps**：
  1. pool.loan_rate=0.05 → `resolveColumnValue(..., 'LOAN_RATE', null, null)` = 0.05
  2. pool.loan_rate=null → = 0
- **Expected Result**：有值 → 數值；null → 0

---

## 八、PROJECT_TP — 衍生邏輯兩路徑（AC-3，BR-F103-03）

> **設計依據**：F103 spec §4 AC-3；BR-F103-03；AD-E07-v3.5 §4.2(c)（PG）§6.4 case 'PROJECT_TP'（JS）；architecture-spec.md line 4088。
> **注意**：EQ-004 / EQ-005 已涵蓋 PG+JS 等價；本群組補充獨立的 JS 單元測試。

### TS-F103-PJTP-001：JS — pool.spec_name 含「專案」→ resolveColumnValue 回傳 'A'

- **Related Requirement**：AC-3 / BR-F103-03
- **Test Type**：Positive / Unit
- **Steps**：`resolveColumnValue({ ...pool, spec_name: '汽車貸款專案' }, 'PROJECT_TP', null, null)`
- **Expected Result**：`pool.spec_name?.includes('專案')` = true → 回傳 `'A'`

### TS-F103-PJTP-002：JS — pool.spec_name 不含「專案」→ 回傳 spec_tp

- **Related Requirement**：AC-3 / BR-F103-03
- **Test Type**：Boundary / Unit
- **Steps**：`resolveColumnValue({ ...pool, spec_name: '一般方案', spec_tp: '02' }, 'PROJECT_TP', null, null)`
- **Expected Result**：`includes('專案')` = false → 回傳 `'02'`（pool.spec_tp）

### TS-F103-PJTP-003：JS — pool.spec_name=null → fallback spec_tp；spec_tp=null → '01'

- **Related Requirement**：AC-3 / BR-F103-03 / F103 spec §5 PROJECT_TP 缺值 default
- **Test Type**：Boundary / Unit
- **Steps**：
  1. pool.spec_name=null, pool.spec_tp='03' → 回傳 '03'
  2. pool.spec_name=null, pool.spec_tp=null → 回傳 '01'（雙重 null → default '01'）
- **Expected Result**：spec_name=null 不視為含「專案」；spec_tp=null 走 default '01'

### TS-F103-PJTP-004：PG — resolveColumnSource('PROJECT_TP') 表達式含 spec_name LIKE '%專案%'

- **Related Requirement**：AC-3 / BR-F103-03
- **Test Type**：Positive / Unit（靜態）
- **Steps**：
  1. 呼叫 `resolveColumnSource('PROJECT_TP')`
  2. 確認回傳 `expr` 含 `"o.spec_name LIKE '%專案%'"`
  3. 確認含 `"THEN 'A'"` 分支
  4. 確認含 `"COALESCE(o.spec_tp, '01')"` fallback
- **Expected Result**：`expr` = `"CASE WHEN o.spec_name LIKE '%專案%' THEN 'A' ELSE COALESCE(o.spec_tp, '01') END"`（或等效）

---

## 九、AUDIT — 全 card_type 逐欄稽核（AC-5/7）

> **設計依據**：F103 spec §4 AC-5、AC-7；BR-F103-06；AD-E07-v3.5 §1.2（稽核結論）；architecture-spec.md line 4074–4091。
> **注意**：本群組為靜態稽核驗證，確認 MAPPED_SCORING_COLUMNS 完整性與 AD-E07-10-L 對齊。

### TS-F103-AUDIT-001：MAPPED_SCORING_COLUMNS 包含全部 AD-E07-10-L 明確 hardcode 欄位

- **Related Requirement**：AC-5 / BR-F103-05 / AD-E07-v3.5 §4.2(f)
- **Test Type**：Positive / Unit（靜態）
- **Steps**：匯入 `MAPPED_SCORING_COLUMNS`；斷言包含以下所有欄位：
  `['LIST_MONTH', 'PROJECT_TP', 'CAR_YEAR', 'CUS_SEX', 'AGE', 'EDUCAT_BACK', 'CAREA_NO1', 'CAREA_NO2', 'CELLULAR', 'HPOST_NUM_NM', 'CPOST_NUM_NM', 'CO_NUM_NM', 'SALES_STS', 'LOAN_RATE', 'ADD_UN_CAPITAL']`
- **Expected Result**：全 15 欄均在集合中；COMMISSION 不在

### TS-F103-AUDIT-002：PG resolveColumnSource CAREA_NO1 語意正確（(home_phone IS NOT NULL)::int）

- **Related Requirement**：AC-7 / I-SCORE-COLSRC-01
- **Test Type**：Positive / Unit（靜態）
- **Steps**：呼叫 `resolveColumnSource('CAREA_NO1')`；斷言 `expr` 含 `(cc.home_phone IS NOT NULL)::int`（或等效 SQL）
- **Expected Result**：PG 表達式語意為「電話欄非 NULL 則為 1，否則為 0」；稽核結果「已驗證」

### TS-F103-AUDIT-003：PG resolveColumnSource CAREA_NO2 語意正確（(contact_phone IS NOT NULL)::int）

- **Related Requirement**：AC-7 / I-SCORE-COLSRC-01
- **Test Type**：Positive / Unit（靜態）
- **Steps**：同 AUDIT-002，針對 CAREA_NO2 / contact_phone
- **Expected Result**：語意正確；稽核結果「已驗證」

### TS-F103-AUDIT-004：resolveColumnSource('ADD_UN_CAPITAL') 回 range 型 + COALESCE(ar.add_un_capital, 0)

- **Related Requirement**：AC-1 / AC-5 / I-SCORE-AR-JOIN-01
- **Test Type**：Positive / Unit（靜態）
- **Steps**：呼叫 `resolveColumnSource('ADD_UN_CAPITAL')`；斷言 `kind = 'range'` 且 `expr` 含 `ar.add_un_capital`
- **Expected Result**：ADD_UN_CAPITAL 有明確 hardcode case，不走通用 fallback；alias `ar` 對應 ob_arreturndf_min_cap

### TS-F103-AUDIT-005：resolveColumnSource default 永不回 undefined（I-SCORE-FALLBACK-01 靜態掃描）

- **Related Requirement**：AC-2 / I-SCORE-FALLBACK-01
- **Test Type**：Positive / Unit（靜態）
- **Steps**：
  1. 以任意未 hardcode 欄位名呼叫 `resolveColumnSource('ANY_UNKNOWN')`
  2. 確認回傳值不為 `undefined` 也不為 `null`
  3. 靜態掃描：`stage2to4-sql-builder.ts` 中 switch default 分支不含 `return undefined` 字串
- **Expected Result**：`resolveColumnSource` 任何輸入均回傳有效 ColumnSource 物件；無 `return undefined`

---

## 十、PREFETCH — batch pre-fetch N+1 禁止（I-SCORE-PREFETCH-01）

> **設計依據**：AD-E07-v3.5 §3 OQ-1/OQ-2 定案；§7 I-SCORE-PREFETCH-01。
> **注意**：本群組驗證每個 list 恰好執行兩次 batch IN 查詢（customer_core 各一 + arreturndf 各一）；禁止 per-row lookup（N+1）。

### TS-F103-PREFETCH-001：每 list 執行 customer_core batch IN 查詢恰好一次

- **Related Requirement**：I-SCORE-PREFETCH-01 / OQ-1
- **Test Type**：PG Integration
- **Preconditions**：mock 或 spy `manager.query`（raw SQL）或 `ccRepo.find`；一個 list 含多個不同 custo_no 的 pool 案件。
- **Steps**：
  1. 執行 JS oracle 路徑的 scoredPool 計算（含 pre-fetch）
  2. 計算 `manager.query` 中 `WHERE source_customer_no = ANY(...)` 的呼叫次數
- **Expected Result**：customer_core 批次查詢恰好呼叫 **1 次**（IN clause 一次覆蓋全 list custo_no）

### TS-F103-PREFETCH-002：每 list 執行 ob_arreturndf_min_cap batch IN 查詢恰好一次

- **Related Requirement**：I-SCORE-PREFETCH-01 / OQ-2
- **Test Type**：PG Integration
- **Preconditions**：同 PREFETCH-001；spy `arreturndfRepo.find`（或 raw query）。
- **Steps**：
  1. 執行 scoredPool 計算
  2. 計算 arreturndfRepo.find（或 raw query WHERE appl_no IN(...)）的呼叫次數
- **Expected Result**：ob_arreturndf_min_cap 批次查詢恰好呼叫 **1 次**

### TS-F103-PREFETCH-003：pool 含 10 個案件時，pre-fetch 仍只各查一次（規模驗證）

- **Related Requirement**：I-SCORE-PREFETCH-01
- **Test Type**：PG Integration（邊界）
- **Preconditions**：pool = 10 個案件，各有不同 custo_no + appl_no。
- **Steps**：
  1. 執行 scoredPool 計算
  2. 確認 customer_core 查詢呼叫 1 次（IN 含 10 個 custo_no）
  3. 確認 arreturndf 查詢呼叫 1 次（IN 含 10 個 appl_no）
- **Expected Result**：兩個批次查詢各呼叫 1 次，不因案件數增加而增加（N+1 不發生）

---

## 十一、UPGRADE — 202606 重跑驗收（AC-11/12，BR-F103-10）

> **設計依據**：F103 spec §4 AC-11、AC-12；BR-F103-10；AD-E07-v3.5 §8.6；OQ-158-01/02 定案。
> **執行前置條件**：dev 環境，`ob_arreturndf_min_cap` ETL ~100% 覆蓋，`customer_core` ETL ~100% 覆蓋，TEST_* 污染欄已清。

### TS-F103-UPGR-001：202606 重跑後 card_level 出現至少 2 種值（定性，AC-11）

- **Related Requirement**：AC-11 / BR-F103-10
- **Test Type**：Positive / PG Integration（人工驗收）
- **Preconditions**：dev 環境，F103 修正已部署；202606 月跑已完成（含 Stage 2 計分修正）。
- **Steps**：
  1. 執行驗收 SQL：
     ```sql
     SELECT card_level, tier_level, COUNT(*) AS cnt
     FROM ob_monthly_run_result
     WHERE run_id = '<202606 run_id>'
     GROUP BY card_level, tier_level
     ORDER BY card_level, tier_level;
     ```
  2. 記錄 card_level 的 distinct 值個數
  3. 記錄 tier_level 中是否含 'T1' 或 'T2'
- **Expected Result**：
  - card_level distinct 值 **≥ 2**（不再 100% 為 'D'）
  - tier_level 含至少部分 'T1' 或 'T2'（T3 非唯一值）
  - 此為定性驗收，允許 CDMP vs legacy 案件集差異，但不允許 T1/T2 全部消失

### TS-F103-UPGR-002：202606 重跑仍異常時 — 量測 customer_core 空值率（AC-12）

- **Related Requirement**：AC-12 / OQ-158-02（本輪內判定，不推延）
- **Test Type**：Boundary / PG Integration（人工驗收，異常時執行）
- **Preconditions**：AC-11 驗收失敗（card_level ≥90% 為 D）；才執行此案例。
- **Steps**：
  1. 執行根因量測 SQL：
     ```sql
     SELECT
       COUNT(*) AS pool_total,
       COUNT(cc.source_customer_no) AS cc_matched,
       SUM(CASE WHEN cc.date_of_birth IS NULL THEN 1 ELSE 0 END) AS age_null,
       SUM(CASE WHEN cc.gender IS NULL THEN 1 ELSE 0 END) AS sex_null
     FROM ob_pool_data o
     LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no
     WHERE o.orgno || o.appl_no IN (
       SELECT orgno || appl_no FROM ob_monthly_run_result WHERE run_id = '<202606 run_id>'
     );
     ```
  2. 計算 cc_matched / pool_total 比例（匹配率）
  3. 計算 age_null / cc_matched 比例（age 空值率）
  4. 判定根因：引擎映射問題 vs 資料品質問題
- **Expected Result**：
  - 若 cc_matched/pool_total < 80%，根因為 ETL 覆蓋不足（資料品質）
  - 若 cc_matched/pool_total ≥ 80% 但仍全 D，回頭確認 §八 AUDIT 稽核（引擎映射）
  - 根因結論記錄於驗收文件，本 feature 引擎修正（§四 AUDIT）仍須通過（引擎正確性與資料品質獨立判定）

### TS-F103-UPGR-003：202606 重跑前後 score 分佈提升確認（定性對比）

- **Related Requirement**：AC-11 / F103 spec §1 現況說明（score 81~152 → 應含更高分）
- **Test Type**：Positive / PG Integration（定性）
- **Preconditions**：能對比修正前後的 score 分佈（或與舊快照對比）。
- **Steps**：
  1. 查詢修正後 202606 之 score 分佈：`SELECT MIN(score), MAX(score), AVG(score) FROM ob_monthly_run_result WHERE run_id='<202606>'`
  2. 確認 MAX(score) > 152（修正前上界）
- **Expected Result**：
  - MAX(score) 超過修正前上界 152（代表 ADD_UN_CAPITAL 與 customer_core 欄位有實際貢獻）
  - 此為定性指標，不設嚴格量化門檻

---

## 十二、REG — 回歸保護（AC-13）

> **設計依據**：F103 spec §4 AC-13；AD-E07-v3.5 §8.7；F098/F099/F100/F101/F102 test spec。

### TS-F103-REG-001：F100 EQ 群組無退化（Stage 2~4 SQL 下推相關測試全綠）

- **Related Requirement**：AC-13
- **Test Type**：Regression / PG Integration
- **Steps**：執行 `pnpm test` 或針對 `F100-*.spec.ts` 跑測試套件
- **Expected Result**：F100 所有 52 個案例通過（含 EQ 8 + SCORE 7 + CJOIN 4 + LEVTIER 5 等）；無退化

### TS-F103-REG-002：F101/F102 Stage 3/4 比例分派及 CR 優先分派相關測試全綠

- **Related Requirement**：AC-13
- **Test Type**：Regression / PG Integration
- **Steps**：執行 F101（51 案例）/ F102（55 案例）測試套件
- **Expected Result**：
  - F101 所有 51 個案例通過（特別確認 tier_level 分組邏輯不因 score 改變而破壞）
  - F102 所有 55 個案例通過（CR 優先分派邏輯不受計分修正影響）
  - **注意**：F103 修正後 tier_level 分佈改變，F101/F102 的 seed 固定 tier（如 T1/T2/T3 seed）不受影響，但若測試依賴「全 T3」假設，須檢查是否有隱性前提需更新

### TS-F103-REG-003：`computeScore` 現有呼叫端在新簽章下無型別錯誤

- **Related Requirement**：AC-13 / OQ-1
- **Test Type**：Regression / Unit（型別）
- **Steps**：執行 `tsc --noEmit -p tsconfig.build.json`
- **Expected Result**：零型別錯誤；`computeScore` 新增 `cc` / `arCap` 兩個參數後，所有呼叫端更新正確，舊呼叫端無漏補

### TS-F103-REG-004：`pnpm test` 全套測試通過（含 F098~F102 序列執行）

- **Related Requirement**：AC-13
- **Test Type**：Regression / 全套
- **Steps**：執行 `pnpm test`（含所有 pg.spec 序列執行）
- **Expected Result**：全部測試通過，無任何回歸；pg.spec 系列（F098/F099/F100/F101/F102/F103）序列完成

---

## 風險與缺口

### 已識別風險

| 風險 ID | 描述 | 嚴重度 | 緩解措施 |
|---------|------|--------|---------|
| RISK-F103-01 | AGE EQ 測試中 PG `CURRENT_DATE` 與 JS `new Date()` 若不在同一毫秒內執行，恰好跨日可能導致 AGE 差 1 年（邊界案件） | 中 | EQ 測試中 PG 端使用固定日期 `CAST('YYYY-MM-DD' AS DATE)` 替換 `CURRENT_DATE`，確保同一基準；calcAgeYears 第二個參數設計為 injectable（非 hardcode `new Date()`） |
| RISK-F103-02 | `ob_arreturndf_min_cap` ETL 若未在月跑前完成，ADD_UN_CAPITAL 全為 0，計分仍偏低（BR-F103-02） | 高 | 月跑前置條件檢核（文件化），UPGR-001 驗收時須確認 ETL 狀態；測試層可用 ~100% 覆蓋已確認（§3.2 前置條件）|
| RISK-F103-03 | `computeScore` 簽章擴充（新增 `cc` / `arCap` 參數）若呼叫端漏補，TypeScript 編譯報錯但 vitest 不攔截（feedback_vitest_no_typecheck 教訓） | 高 | REG-003 強制跑 `tsc --noEmit` 作型別 gate |
| RISK-F103-04 | EQ-007 AGE 測試中 JS `calcAgeYears` 第二個參數 `now` 若 hardcode `new Date()`，EQ 測試難以注入固定日期，造成非確定性 | 中 | `calcAgeYears(dateOfBirth, now: Date)` 設計為 injectable；EQ 測試傳入固定 today；AD-E07-v3.5 §6.5 已明示 |
| RISK-F103-05 | 通用 fallback `column_name.toLowerCase()` 與 PG `to_jsonb(o)->>'...'` 大小寫處理一致性（若 ob_pool_data 欄名為大寫） | 低 | 兩路徑均 lower()；FALLBACK-001 PG 整合測試驗證實際取值；假設 ObPoolData entity 欄名一致（小寫 snake_case）|

### 架構師 OQ 衍生（交 system-architect）

| OQ ID | 問題 | 影響 | 狀態 |
|-------|------|------|------|
| OQ-F103-AD-01 | SALES_STS 在哪些 card_type 為 active 欄（需查 legacy dump 確認）；若為 active，JS `resolveColumnValue` 中的 CASE WHEN 實作是否已完整對齊 AD line 4089 | 若 SALES_STS active 但 JS 路徑仍回 ''，影響 EQ | 已知在 PG 路徑有映射（spec §5 SALES_STS 行），JS 補齊邏輯已在 AD §6.4 定義；tdd 落地時確認 |
| OQ-F103-AD-02 | ob_pool_data entity 中 `spec_name` 欄位名稱確認（A-4 假設）；若欄名不同，PROJECT_TP 衍生表達式需調整 | AC-3 / BR-F103-03 / EQ-004/005 | tdd 落地前查證 ObPoolData entity；本 test spec 以 A-4 為假設基礎 |
| OQ-F103-AD-03 | `ob_arreturndf_min_cap` entity 欄位確認（appl_no / add_un_capital，A-1 假設）；若欄名不同，AR case expr 需調整 | AC-1 / AR-001~005 / EQ-001/002 | tdd 落地前查證 entity；本 test spec 以 A-1 為假設基礎 |

### 既有測試潛在更新需求（F103 後 score 分佈改變）

| 測試案例 | 潛在影響 | 建議行動 |
|---------|---------|---------|
| F100 EQ 群組（手算 oracle）| F103 修正後計分更高，若 F100 EQ oracle 以舊計分為基準，須確認 F100 oracle 是否已含 customer_core 正確取值 | F100 oracle 為「手算預期值（升級後）」，理論上已含正確 cc 欄；確認 F100 seed cc 欄取值是否與 F103 fixture 對齊 |
| F101 EMPL-005 / REG-004 | F101 測試 seed cr_enabled=false（F102 補強），score 改變後 tier_level 分組若有硬編碼假設需確認 | 執行 F101 套件確認全綠；若有 tier 硬前提，查是否影響 seed 設計 |
| F102 EQ-007（ASSIGNDAY）| ASSIGNDAY 計算依 tier pool，score 改變 tier 後計算基數改變；但 F102 seed 固定 cr_enabled=true/false，不依賴計分邏輯，應不受影響 | 執行 F102 套件確認全綠 |
