---
type: implementation-log
feature_id: F103
feature_name: 月名單分派計分引擎欄位來源修正（ADD_UN_CAPITAL 補 JOIN + 通用 fallback + PROJECT_TP 衍生 + 移除 COMMISSION 死碼 + JS oracle 補齊 customer_core）
status: complete
last_updated: 2026-06-24
---

# F103：月名單分派計分引擎欄位來源修正 — Implementation Log

> 對齊 [F103 spec](../features/F103-stage2-score-column-source-fix.md) + [AD-E07-v3.5](AD-E07-v3.5-f103-stage2-score-column-source-fix.md) + [F103-test.md](../../test-specs/features/F103-test.md)。
> 兩條計分路徑（PG 下推 `buildStage2ScoreExpr` + JS oracle `computeScore`）完全對齊 AD-E07-10-L；EQ DoD 逐列等價（誤差=0）全綠。

## Test Results Summary

### F103 新增 / 修改測試（共 63 案，全綠）

| 測試群組 | 案例 | 檔案 | 結果 |
|---------|------|------|------|
| AR（ADD_UN_CAPITAL JOIN flag + 取分） | AR-001~004（PG）/ AR-005（JS×3） | f103.pg.spec / f103.spec | PASS |
| **EQ（JS↔SQL 逐列等價，DoD 紅線）** | EQ-001~008（PG 真庫，誤差=0） | f103.pg.spec | **PASS** |
| AGE（統一演算法三邊界 + cc=null） | AGE-001~004 + 字串 + EQ-007 | f103.spec / f103.pg.spec | PASS |
| FALLBACK（通用 fallback 三邊界） | FALLBACK-001~005（PG 3 + JS 2） | f103.pg.spec / f103.spec | PASS |
| GHOST（幽靈欄位不拋例外 +0 + warn） | GHOST-002/003（PG）/ 001/004（JS） | f103.pg.spec / f103.spec | PASS |
| COMMISSION（兩路徑靜態移除） | COMMISSION-001~004 | f103.spec | PASS |
| CC（customer_core 各欄 JS 取值） | CC-001~010 + SALES_STS | f103.spec | PASS |
| PROJECT_TP（衍生邏輯兩路徑） | PJTP-001~004 + EQ-004/005 | f103.spec / f103.pg.spec | PASS |
| AUDIT（映射完整性靜態稽核） | AUDIT-001~005 | f103.spec | PASS |
| PREFETCH（batch IN N+1 禁止） | PREFETCH-001~003（一案驗 10 案件各查 1 次） | f103.pg.spec | PASS |
| UPGRADE（202606 重跑 tier spread） | UPGR-001~003 | — | **DEFERRED**（需業務 live 重跑驗收，見下） |

實跑結果：
- `stage2to4-score-source-f103.spec.ts`：**39 passed**
- `stage2to4-score-source-f103.pg.spec.ts`：**16 passed**（含 8 EQ DoD）
- `stage2to4-sql-builder.spec.ts`（F100 既有 + F103 改 2 案）：**14 passed**

### 回歸（無退化）

| 範圍 | 結果 |
|------|------|
| 全 `src/modules/assignment` + `assignment-list` / `assignment-scoring` / `assignment-stage` 相關 | **92 files passed / 1 skipped；1246 tests passed / 1 skipped / 11 todo**（0 fail） |
| F100 PG 下推計分（stage2to4-sql-pushdown.pg.spec） | 19 passed |
| F100 P3 pipeline（assignment-run-pipeline-p3.pg.spec） | 7 passed |
| F101 ration / F102 cr-priority / F064 export | 全綠（含於上述 92 files） |
| v2 SQLite pipeline（assignment-run-pipeline-v2.service.spec） | 8 passed |
| `tsc --noEmit -p tsconfig.build.json`（production build gate） | **exit 0，零錯誤** |

> **F100 EQ oracle 確認（test-designer 提問）**：F100 PG EQ 群組（EQ-002/EQ-004）全綠 — F100 既有 customer_core 計分（CUS_SEX/AGE/CAREA…）之 PG 表達式 F103 未更動，故 F100 oracle 不變、無需重算。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts` | modified | `resolveColumnSource`：補 `ADD_UN_CAPITAL` case（`COALESCE(ar.add_un_capital,0)`）、移除 `COMMISSION` 死碼、`PROJECT_TP` 補 `spec_name LIKE '%專案%'→'A'` 衍生、`default` 改通用 fallback `COALESCE((to_jsonb(o)->>lower(col))::numeric,0)`（永不回 undefined）；`Stage2ScoreSql` 加 `needsArCapital`；`buildStage2ScoreExpr` 追蹤 `needsArCapital`；`MAPPED_SCORING_COLUMNS` 移除 COMMISSION、加 ADD_UN_CAPITAL；`resolveColumnSource` / `ColumnSource` 改 export（供靜態測試）。 |
| `apps/api/src/modules/assignment/stage1/stage2to4-sql-executor.ts` | modified | `runStage2and3Sql`：解構 `needsArCapital`，為 true 時注入 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no`（緊接 customer_core JOIN 後）。 |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | 新增 export `CustomerCoreRow` / `ArCapitalRow` interface + `calcAgeYears(dob, now)` 純函式；`computeScore` 簽章加 `cc` / `arCap`；`resolveColumnValue` 全面補齊（customer_core 全欄 + ADD_UN_CAPITAL + SALES_STS + LOAN_RATE + PROJECT_TP spec_name 衍生；移除 COMMISSION；default 通用 fallback + 幽靈欄位 logger.warn）；新增 `prefetchScoringSources` 私有方法（每 list 各一次 customer_core / ob_arreturndf_min_cap IN 查詢，I-SCORE-PREFETCH-01）；`executeV2` scoredPool.map 前呼叫 pre-fetch、傳 cc/arCap。 |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-builder.spec.ts` | modified | 2 案 F100→F103 演進更新（ADD_UN_CAPITAL 改已映射、COMMISSION 移除、未 hardcode 欄走通用 fallback）。 |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f103.spec.ts` | new | F103 單元 / 靜態 39 案（AGE / AR / CC / PROJECT_TP / FALLBACK / GHOST / COMMISSION / AUDIT + resolveColumnSource 靜態）。 |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f103.pg.spec.ts` | new | F103 PG 真庫 16 案（AR + EQ DoD×8 + AGE EQ 三邊界 + FALLBACK/GHOST PG + PREFETCH）。 |

> **無 migration**（AD-E07-v3.5 §9）：`ob_arreturndf_min_cap` PK 與 `customer_core` index 先前 ETL migration 已建。
> **`assignment.module.ts` 未改**：JS oracle pre-fetch 採 `manager.query` raw SQL（非注入 repo），無需 forFeature 註冊 `ObArreturndfMinCap`，對既有測試 TestingModule 零衝擊。

## Architectural Decisions（spec/AD 邊界內）

1. **JS oracle pre-fetch 用 raw SQL，非注入 repo**：AD 建議 `arreturndfRepo.find()`，但注入新 repo 會迫使所有既有 pipeline 測試 TestingModule 補註冊 entity。改以 `this.dataSource.manager.query`（與 customer_core 同模式）→ 零建構子變更、零測試模組衝擊，仍守 I-SCORE-PREFETCH-01（每來源恰一次 IN 查詢）。
2. **SQLite graceful degrade**：`prefetchScoringSources` 二查詢以 try/catch 包覆；SQLite 測試環境二表不存在 → 空 Map → cc/arCap=null → 屬性走 default（等價舊行為，OQ-3）。`executeV2` 不在 transaction 內，try/catch 安全。
3. **`ArCapitalRow.add_un_capital` 型別 = `string | number | null`**：entity 之 `add_un_capital` 為 numeric→TypeORM string；JS 端 `Number(...)` 強制轉數值，對齊 PG `COALESCE(ar.add_un_capital,0)`。
4. **通用 fallback 落地驗證**：`LOAN_AMOUNT`（test-designer 範例）非 ob_pool_data DB 欄位 → 改用真實未 hardcode 數值欄 `LOAN_TOTAMT`（DB column `loan_totamt`）為 FALLBACK 正向案例；`LOAN_AMOUNT` 類欄位走幽靈欄位路徑（+0）。
5. **`resolveColumnSource` / `ColumnSource` 改 export**：test-designer 之 PJTP-004 / AUDIT-002~005 / COMMISSION-001 / FALLBACK-001~003 直接呼叫 `resolveColumnSource` 斷言 expr 字串 → 需 export（純函式，無副作用，安全）。

## Deviations / 真 bug

- **無偏離 spec/AD**。所有 invariant（I-SCORE-COLSRC-01 / FALLBACK-01 / EQ-01 / AR-JOIN-01 / PREFETCH-01 / GHOST-01 / AGE-01 / COMMISSION-01）皆落地並有對應測試。
- **F100 既有測試 2 案演進更新（非 regression）**：`stage2to4-sql-builder.spec.ts` 原 F100 斷言「ADD_UN_CAPITAL 未映射 / 不在 MAPPED_SCORING_COLUMNS」為 F103 刻意反轉之行為（spec 演進），已更新為 F103 期望值。
- **真 bug 觀察（無，僅設計確認）**：`needsArCapital=true` 但該欄無 score row 時，`scoreExpr` 不含 `ar.add_un_capital`（無 CASE fragment）。此為既有 builder 語意（無 score row 之欄不產生 fragment），JOIN 仍正確注入（LEFT JOIN 無害）；AR-001 測試已補 score row 以反映真實 active 計分欄情境。

## 「202606 重跑驗收」執行指引（UPGRADE 群組，交 QA / 業務 live 驗收）

UPGR-001~003 為 dev live 重跑定性驗收（AC-11/12，非自動化單元測試），需在 dev 觸發 202606 月名單分派後執行。前置：`ob_arreturndf_min_cap` + `customer_core` ETL ~100% 覆蓋（§10 已查證）。

**步驟 1 — 觸發 202606 月名單分派**（dev，PG 一律走下推 + v2 計分）：
```
# 經 UI（月名單分派看板）觸發 202606，或既有 worker 重跑既有 run。
# 改 code 後須 docker restart cdmp-api cdmp-worker（Windows→Docker watch HMR 不可靠）。
docker restart cdmp-api cdmp-worker
```

**步驟 2 — card_level / tier spread 定性驗收（AC-11）**：
```sql
SELECT card_level, tier_level, COUNT(*) AS cnt
FROM ob_monthly_run_result
WHERE run_id = '<202606 run_id>'
GROUP BY card_level, tier_level
ORDER BY card_level, tier_level;
```
通過門檻：card_level distinct ≥ 2（不再 100% D）；tier_level 含 T1 或 T2（非 100% T3）。

**步驟 3 — score 上界提升確認（UPGR-003）**：
```sql
SELECT MIN(score), MAX(score), AVG(score)
FROM ob_monthly_run_result WHERE run_id = '<202606 run_id>';
```
預期 MAX(score) > 152（修正前上界；ADD_UN_CAPITAL +36 + customer_core 各欄已實際貢獻）。

**步驟 4 — 若仍異常（card_level ≥ 90% D，AC-12 本輪根因）**：量測 customer_core 空值率：
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
- cc_matched/pool_total < 80% → 根因＝ETL 覆蓋（資料品質），記錄於驗收文件。
- ≥ 80% 仍全 D → 回 §8 AUDIT 稽核（引擎映射）。引擎正確性已由本輪 63 測試（含 8 EQ DoD）證明。

**上 prod 前置（NFR-005）**：本 feature 改變 score / card_level / tier 分佈 → 須 F067 差異報告 + 業務知會後方可上線。
