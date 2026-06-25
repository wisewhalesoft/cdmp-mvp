---
type: implementation-log
feature_id: F107
feature_name: 計分卡設定頁顯示衍生碼業務語意（decode UI）
status: complete
last_updated: 2026-06-25
---

# F107: 計分卡設定頁顯示衍生碼業務語意（decode UI）— Implementation Log

## 摘要

把已存在的 decode 對照（AD-E07-10-S）呈現在計分卡設定頁，落實「計分卡 config 的每個衍生碼可回溯到來源欄 + 衍生規則 + 業務語意」之 UI 層。三項變更皆為**唯讀疊加說明**，不改既有 config 編輯能力、不改計分採計（BR-5）：

1. **後端供給（decode 同源）**：新增與引擎衍生規則同源之共用對照常數 `scoring-decode.constants.ts`；`getScoring()` 每維度附唯讀 `decode`。
2. **前端 Tab 3「分數設定」（ScoresTab）**：level1 原始碼旁並陳業務語意（原始碼保留）；PROJECT_TP composite 標示 level2=專案代碼 spec_tp。
3. **前端 Tab 2「計分維度」（DimensionsTab）**：展開列顯示「來源欄 + 衍生規則」摘要。

## Test Results Summary

### 後端（apps/api，vitest）

| Scenario ID | 說明 | Status |
|-------------|------|--------|
| TS-F107-B01 | PROJECT_TP 維度附 decode（composite 碼意義 + 來源欄 + level2 專案代碼）| PASS |
| TS-F107-B02 | SALES_STS decode 含 AGENT/UCD/HFC 業務語意 | PASS |
| TS-F107-B03 | CUS_SEX decode 含 1男/2女/3法人 | PASS |
| TS-F107-B04 | 個人/法人分流欄（AGE）decode 欄層摘要、codes 空陣列 | PASS |
| TS-F107-B05 | 純數值欄（LIST_MONTH / CAR_YEAR）decode=null（BR-6）| PASS |
| TS-F107-B06 | 每個 dimension 均含 decode 鍵（有 decode 物件 / 無則 null）| PASS |
| 同步斷言 (iii) | decode 涵蓋欄 ⊆ 引擎 MAPPED_SCORING_COLUMNS | PASS |
| 同步斷言 (i) | decode codes 碼集合與意義 ≡ AD-E07-10-S §2（PROJECT_TP / SALES_STS / CUS_SEX / 三縣市）| PASS |
| 同步斷言 (ii) | decode sourceField ≡ 引擎 resolveColumnSource 取值來源（含 keyword 「中古車商」→UCD / 「借新還舊」→A 同步）| PASS |
| 同步補充 | 五欄分流摘要 codes 空陣列、純數值欄/未映射欄 null、getDecodeForColumn deep copy（唯讀）| PASS |

- 新增測試：`scoring-decode.constants.spec.ts`（13 個，含核心同步斷言 BR-4 / AC-4）+ `assignment-scoring-f053.service.spec.ts` 新增 6 個 F107 decode。
- 既有 `assignment-scoring` 單元測試全綠（278 passed / 11 todo / 1 skipped，無退化）。

### 前端（apps/web，vitest + testing-library）

| Scenario ID | 說明 | Status |
|-------------|------|--------|
| TS-F107-FE-01 | Tab 3 SALES_STS 列碼旁並陳 decode（代理商 / 中古車商，原始碼保留）| PASS |
| TS-F107-FE-02 | Tab 3 PROJECT_TP composite — A→借新還舊 / null→非借新還舊 / level2→專案代碼 | PASS |
| TS-F107-FE-03 | Tab 3 純數值欄（LOAN_RATE，decode=null）不渲染 decode（優雅降級 BR-6 / UI-5）| PASS |
| TS-F107-FE-04 | Tab 2 展開有 decode 維度顯示「來源欄 + 衍生規則」摘要 | PASS |
| TS-F107-FE-05 | Tab 2 展開純數值欄（decode=null）不渲染 decode 摘要 | PASS |
| TS-F107-FE-06 | decode 為唯讀展示，無 input / button 編輯入口（AC-3 / UI-4）| PASS |

- `scoring-config-page.test.tsx`：52 passed / 12 skipped（pre-existing skip），無退化。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/stage1/scoring-decode.constants.ts` | new | decode 共用對照常數（與引擎同源，AD-E07-10-S §1/§2/§3）；export `SCORING_DECODE` / `getDecodeForColumn` / 型別 `DecodeEntry`、`DecodeCodeEntry` |
| `apps/api/src/modules/assignment-scoring/assignment-scoring.service.ts` | modified | import decode 常數；`ScoringDimensionItem` 加 `decode`；`getScoring()` mapper 每維度附 `getDecodeForColumn()` |
| `apps/api/src/modules/assignment/stage1/__tests__/scoring-decode.constants.spec.ts` | new | 同步斷言測試（BR-4 / AC-4 三項一致 + 五欄分流 / null / 唯讀 deep copy）|
| `apps/api/src/modules/assignment-scoring/__tests__/assignment-scoring-f053.service.spec.ts` | modified | 新增 F107 decode getScoring 6 個測試 |
| `apps/web/src/api/assignment-scoring.ts` | modified | `ScoringDimensionItem` 加可選 `decode`；新增型別 `DecodeEntry` / `DecodeCodeEntry`（鏡像後端）|
| `apps/web/src/pages/assignment/scoring-config-page.tsx` | modified | `ScoringDimUI` 加 `decode`；decode 解析 helper；Tab 3 碼旁並陳 decode；Tab 2 展開列 decode 摘要 |
| `apps/web/src/pages/assignment/__tests__/scoring-config-page.test.tsx` | modified | 新增 F107 decode UI 6 個測試 + decode fixture |

## Architectural Decisions（spec 範圍內）

- **decode 常數落點**（OQ-F107-01 建議採用）：新增 `scoring-decode.constants.ts` 與 `stage2to4-sql-builder.ts` 同目錄（`assignment/stage1/`），由引擎模組與 `assignment-scoring` service 共用，作為 decode 唯一真值來源（非前端常數、非 config 表）。
- **同源斷言**（BR-4 / AC-4，核心紅線）：`scoring-decode.constants.spec.ts` 斷言三項一致 —— (i) decode codes ≡ AD-E07-10-S §2；(ii) decode `sourceField` ≡ 引擎 `resolveColumnSource` 取值來源（直接讀引擎 expr 字串比對來源欄與衍生 keyword，故引擎將 SALES_STS '中古車商'/PROJECT_TP '借新還舊' 等 keyword 改名時斷言失敗以提示同步 decode）；(iii) decode 涵蓋欄 ⊆ `MAPPED_SCORING_COLUMNS`。
- **回傳粒度**（OQ-F107-03）：採維度層（decode 附於每個 dimension 物件，§5.1.1 建議預設），前端 Tab 2 / Tab 3 共用同一份。
- **decode 唯讀**：`getDecodeForColumn` 回傳 deep copy（避免外部變更凍結之 `Object.freeze` 常數）；前端 decode 僅為純文字 span（無互動入口）。
- **個人/法人分流欄**（CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK）：欄層摘要帶分流語意（`derivationRule` 含「個人/法人」），`codes` 為空陣列（其值為純數值區間、無類別碼，§3）。
- **未改動範圍（驗證）**：引擎計分採計（`resolveColumnSource` / `buildStage2ScoreExpr` / pipeline）零變更（只讀作 decode 同源依據，BR-5）；無 migration、無新 error code、無新路由、無新側欄項（沿用既有 `GET /assignment/scoring` 與既有路由 / 側欄）。

## 型別 / Build

- 後端 `tsc --noEmit -p tsconfig.build.json`：**乾淨（exit 0，零錯誤）**。
- 前端 `tsc -p tsconfig.json`：F107 觸碰之檔（`scoring-config-page.tsx` / `assignment-scoring.ts`）**零新增型別錯誤**。
  - `scoring-config-page.tsx` 唯一報告之 `DimensionScoreRow` unused-variable（TS6133）經 git stash 對照確認為 **pre-existing baseline**（基線在 L2423，本次新增程式碼後位移至 L2543，非 F107 引入）。
  - `etl-pipelines` / `extraction-tasks` 等模組之既有型別錯誤與本次無關（pre-existing baseline）。

## Pre-existing baseline（誠實揭露，與本次無關）

- 前端 `etl-pipelines/`、`extraction-tasks/` 模組既有 tsc 錯誤；`scoring-config-page.tsx` 之 `DimensionScoreRow` 未使用變數 —— 三者皆 pre-existing，未由 F107 引入。
- `assignment-scoring.e2e-spec.ts`（DB 依賴）未於本次執行（需真實 DB）；e2e 既有以 `toMatchObject` / `toHaveLength` 之非嚴格斷言，新增的可選 `decode` 欄位為 additive、不破壞既有斷言。

## Definition of Done 對照

- AC-1 ~ AC-6 全部滿足（Tab 3 碼層並陳 / Tab 2 欄層摘要 / 唯讀 / 同步斷言 / 空狀態降級 / 讀取沿用既有權限）。
- decode 來源為與引擎同源之單一共用常數；BR-4 同步斷言已實作（核心 DoD）。
- 無對應 decode 之維度優雅降級（不渲染、不報錯）；計分採計範圍未變更。
- 不新增 error code / DB 欄位 / migration；沿用既有路由、無新側欄項。
- 後端 tsc 乾淨；前端 F107 新碼零型別錯。
