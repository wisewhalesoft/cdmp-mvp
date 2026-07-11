---
type: implementation-log
feature_id: F061
feature_name: Trigger Assignment Run — v2.0 真實邏輯（B4 留項補完）
status: complete
last_updated: 2026-05-17
---

# AD-E07 v3.0 P1 B4 v2.0 — Pipeline 真實邏輯升級（Stage 2 / 3 / 4）

## 任務範圍

承接 B4 補完中標記為「v1.0 簡化版」的三段邏輯：
1. **Stage 2**：score = commission → **真實 fn_calc_tier_level 等價（純 JS）**
2. **Stage 4**：round-robin 第一筆 → **真實 st4_exchange（T1/T2 10% 轉 T3 資深）**
3. **Stage 3**：cr_enabled flag → **CR 動態回分（讀歷史 result snapshot 未成交案件）**

## 升級策略

採**漸進式 + feature flag**：
- 新增 ENV `ASSIGNMENT_PIPELINE_V2=true` 啟用 v2.0
- **預設 OFF（保留 v1.0 行為）**：避免破壞既有 13 PASS 與生產既有月名單分派邏輯
- v2.0 邏輯獨立於 `executeV2()` private method
- v1.0 邏輯封裝於 `executeV1()` private method（向後相容）

理由：v2.0 邏輯依賴新 entity（ObLevelcardColumn / ObLevelcardScore / ObLevelcardVersion）與
新欄位（empl_set.prod_type='TIER:T*'），生產 DB 未必齊備，flag 提供安全的漸進啟用機制。

## fn_calc_tier_level 實作層級

**純 JS 等價邏輯**（架構 spec L3459 明示「Function 為純計算函式，不直接寫入任何表，
副作用由呼叫方 UPDATE 負責」→ JS 純函式語意對齊）。

涵蓋範圍：
- ob_levelcard_version (status='active') → 取 active card_version
- ob_levelcard_column (status='active') → 取啟用維度（AD-E07-4 disabled 過濾）
- ob_levelcard_score → 區間型（level2_s/e）與類別型（level1）權重計分
- ob_levelcard_level (score_s / score_e) → score → card_level
- ob_tier (card_type, card_level) → card_level → tier_level（含 card_level IS NULL fallback）

**column_name 對應子集**（架構 spec L3542 表中可從 ob_pool_data 直接取的欄位）：
- LIST_MONTH → pool.month_cnt（缺值 25）
- PROJECT_TP → pool.spec_tp（缺值 '01'）
- CAR_YEAR   → CURRENT_YEAR - pool.year_produ（缺值 0）
- COMMISSION → pool.commission（缺值 0）

**未涵蓋（待 v2.1）**：CUS_SEX / CAREA_NO* / CELLULAR / AGE / EDUCAT_BACK /
HPOST_NUM_NM / CPOST_NUM_NM / CO_NUM_NM / ADD_UN_CAPITAL 等需 LEFT JOIN
customer_core / ob_arreturndf_min_cap 的欄位，此處回傳空字串視為不匹配（不加分）。

切換至 RAW SQL `SELECT fn_calc_tier_level(...)` 的條件：
1. PostgreSQL function 部署（spec L3860 P1 BLOCKER）
2. customer_core 與 ob_arreturndf_min_cap 表完整 ETL（spec L3540 join key）

## TDD Cycle 數量：3 cycle

| Cycle | RED 測試 | GREEN 實作 |
|-------|----------|------------|
| 1 | TC-V2-STAGE2 × 3（區間 + 類別 + disabled 過濾 + 無 version fallback） | `executeV2().computeScore() + resolveColumnValue()` |
| 2 | TC-V2-STAGE4 × 3（10% 轉 + 保底 1 件 + T3 案件不轉） | `executeV2()` 內 exchangeable 分組 + senior 分流 |
| 3 | TC-V2-STAGE3 × 2（cr_enabled 開 / 關 × 歷史 snapshot 比對） | `collectCrCandidates()` 掃 result snapshot 找 PENDING |

合併寫入單一 spec 檔（`assignment-run-pipeline-v2.service.spec.ts`），同 module 內測試。

## 完成元件清單

| File Path | Lines | 變更類型 |
|-----------|-------|---------|
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | 477 | 重寫（v1.0 保留為 `executeV1()`，新增 `executeV2()`/`computeScore()`/`resolveColumnValue()`/`collectCrCandidates()`） |
| `apps/api/src/modules/assignment/assignment.module.ts` | 85 | 新增 ObLevelcardVersion/Column/Score 至 TypeOrmModule.forFeature |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline.service.spec.ts` | 605 | 更新 imports + forFeature 加入 Column/Score（v1.0 13 PASS 不變） |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-v2.service.spec.ts` | 691 | **新增** — 8 個 v2.0 真實邏輯測試 |

## 測試結果

| Scope | Before | After |
|-------|--------|-------|
| `assignment-run-pipeline.service.spec.ts`（v1.0） | 13 PASS | **13 PASS（未破壞）** |
| `assignment-run-pipeline-v2.service.spec.ts`（v2.0） | — | **8 PASS（新增）** |
| 整個 assignment + assignment-scoring 模組 | 500 PASS | **508 PASS（+8）** |

## 架構決策

1. **Feature flag 漸進式啟用**：v2.0 邏輯透過 `ASSIGNMENT_PIPELINE_V2=true` 啟用，
   預設 OFF。理由：v2.0 依賴 customer_core ETL（spec P1 BLOCKER 未完成），生產環境
   未就緒前必須能回退至 v1.0。

2. **員工 tier 標記暫存方式（OQ-E07-26 過渡方案）**：用 `ob_empl_set.prod_type`
   欄位前綴 `'TIER:T1|T2|T3'` 暫存。v2.1 補完後改讀 user.metadata 或新建
   `ob_empl_tier_map` 表。本次未動 entity schema，避免 migration 連動風險。

3. **CR 回分判定「未成交」採 result snapshot `status` 欄位**：
   - `status === 'PENDING'` 或 `undefined` / `null` → 視為未成交
   - 預設新寫入的 result snapshot assignments 含 `status: 'PENDING'`
   - 業務後續回填（F068 後續流程）時改為 `'SUCCESS' / 'FAILED'`
   - 此設計確保 v2.0 首次啟用時不會把已成交案件誤回分

4. **歷史比對範圍**：`project_workym < ym` 字串比較（YYYYMM 6 字串遞增等價時序）。
   無時間視窗限制（規格未明確上限），生產資料量大時可加 `project_workym >= ym - 6`
   等視窗條件。

## 未完成元件

| Item | 原因 | 後續 |
|------|-----|-----|
| `customer_core` LEFT JOIN 客戶屬性計分（CUS_SEX / AGE 等 9 個維度） | 依賴 E04 customer_core ETL；spec P1 BLOCKER | v2.1 補完 |
| `ob_arreturndf_min_cap` LEFT JOIN（ADD_UN_CAPITAL 計分） | 依賴對應表 ETL | v2.1 補完 |
| 切換至 RAW SQL `SELECT fn_calc_tier_level()` 呼叫 PG function | PG function 尚未部署（spec L3860 P1 BLOCKER） | v2.2 切換 |
| 員工 tier 永久儲存方案 | OQ-E07-26 仍 OPEN | v2.1 設計新 entity 或 user.metadata 擴充 |
| OBMLISTDF 真實 condition_payload Stage 1 篩選 | spec L83 v2.0 留項 | v2.1 / B5 補完 |

## 提示下一步

**B6 xlsx 框架**：F064 結果匯出 — 採 exceljs streaming mode（AD-E07-11），
為下次 sprint 開工項。對應 spec L3863 P4「效能測試：10 萬筆 LATERAL JOIN < 10 分鐘」可
合併規劃。

## 完成標準

- [x] lint 通過（無 lint script，使用 tsc --noEmit 驗證；新增檔無 TS 錯誤）
- [x] v1.0 簡化版 tests 不破壞（13/13 PASS）
- [x] v2.0 新 tests PASS（8/8 PASS）
- [x] 整體 assignment 模組 500+/500+ PASS（508/508 PASS）
- [x] 對應 spec 對齊：架構 L3459~L3522（fn_calc_tier_level）+ L3542 column 對應表
- [x] 實作日誌建立於 `/docs/specs/implementation-log/`
