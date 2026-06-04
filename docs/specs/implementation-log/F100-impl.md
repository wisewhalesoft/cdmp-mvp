---
type: implementation-log
feature_id: F100
feature_name: Stage 2~4 SQL 下推 + v2 真實計分引擎（AD-E07-28 P3）
status: complete
last_updated: 2026-06-04
---

# F100：Stage 2~4 SQL 下推 + v2 真實計分引擎 — Implementation Log

---

## Bug A 修復（2026-06-04，branch feat/monthly-run-execution-model-refactor）

> app 實測迴歸：**PG + ASSIGNMENT_PIPELINE_V2 未設**（dev/prod 預設）時月跑只產生無計分 identity 列。

### 根因

原 gate `useStage2to4Pushdown = useV2 && DB_TYPE==='postgres'`。當 PG 但 `ASSIGNMENT_PIPELINE_V2`
未設 → gate=false → 走壞掉的 v1-PG fallback `executeV1(stage1Cases)`。但 PG 模式下 Stage 1 是
SQL INSERT 寫表、`stage1Cases` 之 pool 為 `skipHydration=true` 之空陣列 → `executeV1` 計分 0 筆。
實測：寫了 55,863 列但 `score/tier/emplid` 全 NULL、`total_cases=0`（v2 on 時 totalCases=55863 正確）。
PG 模式並無「v1 簡化計分的 SQL 版」（P3 僅建 v2 真實版）。

### 修法（使用者 2026-06-04 拍板：PG 一律走 SQL 下推）

| 項目 | 修法 |
|---|---|
| **gate** | 抽出純函式 `resolveStage2to4Strategy(env)`；PG 一律 `pushdown`（gate = `DB_TYPE==='postgres'`，拿掉 `useV2 &&`）；非 PG 依 `ASSIGNMENT_PIPELINE_V2` 選 `v2Inmemory`/`v1Inmemory`。`ASSIGNMENT_PIPELINE_V2` 在 PG **已 deprecated / 無意義**（docstring 標明）。 |
| **total_cases** | 下推路徑改取 `resultRepo.count({where:{run_id}})`（SQL COUNT）；不再用 `stage4Results.length`（下推路徑該陣列為快照用之讀回，且全載違反 I-NOLOAD）。非 PG 路徑維持 `.length`（in-memory 全列）。 |
| **快照讀回有界** | `executeStage2to4Pushdown` 末段 `resultRepo.find({where:{run_id}})`（entity hydration 全列）→ 抽 `readResultRowsForSnapshot`，改 `createQueryBuilder().select([需要欄位]).getRawMany()`（無 entity 變更追蹤 metadata），PG numeric 經 raw 回字串 → `Number()` 正規化。 |
| **docker-compose** | worker service 移除 `ASSIGNMENT_PIPELINE_V2: "true"`（L72 附近）；註解改「PG 一律走 v2 SQL 下推（gate=DB_TYPE）；flag 僅非 PG in-memory 用」。 |

### 快照 bound 後語意（**需知會**）

`result` / `input_list` 快照 payload 之 `assignments` / `cases` **仍為完整 per-case 記錄（非 sample）**
—— 這是其契約：下游 **F063 摘要 / F064 匯出 / F066 快照詳情 / F067 比對 / Stage 3 CR 偵測**
（`collectCrCandidates` 讀歷史 result snapshot 全 assignments 找未成交案件）皆依賴完整資料集。
故**不可**把快照裁切成 LIMIT N sample（會破壞上述全部用途）。本次 bound 僅作用於**讀回機制**：
`getRawMany`（輕量 raw，只取所需欄位、不 hydrate entity）取代 `find()`（每列帶 ORM metadata），
消除全列 entity 物化之 heap 放大；**資料集本身不變、語意不變**。

> ⚠️ 殘留 latent：快照 payload 本質仍是「完整 per-case JSON 寫進一個 JSONB 欄位」。對 55k 列而言，
> 組裝該 JSON + 寫入時仍會一次性持有完整陣列（此為快照設計之固有成本，非本次 gate bug）。若未來
> 需對超大 run 進一步降 heap，須重新設計快照儲存（如改存 per-list 分片或直接以 `ob_monthly_run_result`
> 表為快照來源），屬獨立 follow-up，已超出 Bug A 範圍。

### Bug A 測試（紅→綠）

| Scenario ID | Description | Status |
|---|---|---|
| resolveStage2to4Strategy ×6 | PG（v2 未設/true/false）→ pushdown；非 PG（v2 true/未設）→ v2/v1 Inmemory | PASS（unit，純函式）|
| BUGA-000 | 環境前提：DB_TYPE=postgres 且 ASSIGNMENT_PIPELINE_V2 未設 | PASS（PG）|
| BUGA-001 | PG + v2 未設 → 計分正確（score/level/tier 正確、非全 NULL，走 P3 非 v1 fallback）| PASS（PG）|
| BUGA-002 | total_cases == 實際寫入列數（非 0；== `resultRepo.count`，資料驅動）| PASS（PG）|
| BUGA-003 | result/input_list 快照 assignments/cases 為完整 per-case（== 表內列數，非 sample）| PASS（PG）|

> RED 驗證：暫將 gate 還原為 `useV2 && DB_TYPE==='postgres'`，BUGA-001/002/003 失敗
> （total_cases=0、score NULL、快照 assignments=0），與 app 實測一致；還原修法後全綠。

### Bug A Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | 新增 export `resolveStage2to4Strategy` 純函式 + `Stage2to4Strategy` type；`runPipeline` gate 改用之；Stage 2~4 分支由 `useV2` 改 `strategy`；`total_cases` 下推路徑改 `resultRepo.count`；新增 `readResultRowsForSnapshot`（getRawMany 輕量讀回）取代 `executeStage2to4Pushdown` 末段 `resultRepo.find`；class/gate docstring 標 PG flag deprecation |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-gate.bugfix.spec.ts` | new | `resolveStage2to4Strategy` 純函式 gate 決策 6 案（unit，免真 PG）|
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-bugfix.pg.spec.ts` | new | PG + v2 未設 → 下推 / 真實計分 / total_cases / 完整快照 4 案（PG 真庫，逐檔執行）|
| `docker-compose.yml` | modified | worker service 移除 `ASSIGNMENT_PIPELINE_V2: "true"` + 更新註解 |

### Bug A 回歸狀況（逐檔，F-D 隔離）

- 新 PG：`assignment-run-pipeline-bugfix.pg.spec.ts` 4/4 綠。
- 既有 PG 等價（維持綠）：`assignment-run-pipeline-p3.pg.spec.ts` 7/7、`stage1-sql-pushdown.pg.spec.ts` 26/26、`stage2to4-sql-pushdown.pg.spec.ts` 28/28。
- 非 PG（維持綠）：`assignment-run-pipeline.service.spec.ts` 20/20（v1）、`assignment-run-pipeline-v2.service.spec.ts` 8/8（v2 in-memory，DB_TYPE=sqlite → 不受 gate 改動影響）、`stage1-dynamic` 7/7、`f098-static-guards` 8/8（docker-compose 改動後仍綠）。
- 非 PG assignment 全套件：962 passed / 40 skipped / 11 todo；**3 failed 為 pre-existing**（F-E `assignment-run-report.scope` / `assignment-run-report.service` / `assignment-run-snapshot.service` 之 `SectionChiefScopeService` DI 缺 `ObEmphireRepository`）——已用 `git stash` 對 baseline 重跑確認同樣失敗、與 Bug A 無關。
- `tsc --noEmit -p tsconfig.build.json`（cwd=apps/api）：**EXIT 0**。

### Rollout 含意（已認可）

PG 一律 v2 真實計分 → **F067 計分差異報告 + 業務簽核為「本重構 deploy 上 prod 的 GO/NO-GO 閘」**（非每跑 flag）。
原 `ASSIGNMENT_PIPELINE_V2` 之「漸進 rollout 開關」語意在 PG 失效；漸進控制改由「是否 deploy 本 branch」承擔。

---

## 原始 P3 實作（AD-E07-28）

> 範圍 P3。P1（F098 worker）/ P2（F099 Stage 1 `buildStage1Sql`）核心契約未動，僅於 pipeline
> 整合層調整呼叫方式（Stage 2~4 改走 SQL 下推路徑，gate = `DB_TYPE='postgres'` + `ASSIGNMENT_PIPELINE_V2='true'`）。

## Test Results Summary

> 全 EQ/SCORE/CJOIN/LEVTIER/CR/EXCH 群組對**真 Postgres**（postgres-test 5433/cdmp_test）實跑、實綠。

| Scenario ID | Description | Status |
|-------------|------------|--------|
| SCORE-001~007 | Stage 2 SUM(CASE…) 區間/類別/邊界/disabled/NULL vs 0 | PASS（PG 實跑）|
| CJOIN-001/002/004 | LEFT JOIN customer_core match / 無 match / 混合維度 | PASS（PG 實跑）|
| LEVTIER-002/003/004/005 | score→level→tier；NULL fallback 分歧（OQ-F100-T2 採 JS 推導）| PASS（PG 實跑）|
| CR-001~004 | Stage 3 EXISTS（cr 開/關；未成交 PENDING/null 語意）| PASS（PG 實跑）|
| EXCH-001~006/008 | st4_exchange CEIL/保底 1/partition/deterministic 選案 | PASS（PG 實跑）|
| EQ-001 | 純 ob_pool_data 卡（區間+類別）→ 手算 oracle（(b) 下推等價）| PASS（runPipeline 端到端 PG）|
| EQ-002/004 | customer_core join match（P-03/04）/ trim 邊界（P-05）| PASS（PG 實跑）|
| EQ-003 | 含 customer_core 卡 + 部分無 match（混合 (a)/(b)）| PASS（runPipeline 端到端 PG）|
| EQ-005 | 無 active version → score/level/tier NULL（案件仍寫入）| PASS（runPipeline 端到端 PG）|
| EQ-006/007 | CR 開（歷史未成交→Y）/ 關（→N）| PASS（runPipeline 端到端 PG）|
| IDEM-001 | 同 run_id 重跑 → 計分/分派列集合一致 | PASS（runPipeline 端到端 PG）|
| RUNEST-001 | Stage 2~4 UPDATE 不改變列集合（estimate≡run 延續）| PASS（runPipeline 端到端 PG）|
| NOLOAD-001 | 下推路徑不 re-hydrate 全 pool（skipHydration / 無 computeScore）| PASS（靜態原始碼 guard，unit）|
| SCORE builder | buildStage2ScoreExpr NULL vs 0 vs 累加 / customer_core / 未映射不取分 | PASS（unit）|
| RG 命名鎖定 | MAPPED_SCORING_COLUMNS / CUSTOMER_CORE_COLUMNS | PASS（unit）|

合計：14 unit + 28 PG（builder/executor）+ 7 PG（端到端 runPipeline）= **49 案，全綠**。

### 暫緩 / 人工 gate（非本次實作可全自動完成）

- **UPGR-001~004（F067 計分升級差異報告 + 業務驗收）**：差異報告能力可複用既有 F067 比對
  （`assignment-run-report` / compare）；UPGR-004 業務簽核為**上線人工 gate**，記於上線 checklist，
  非本次程式碼可關閉。**上線前置：EQ 全綠（已達成）+ UPGR-004 業務簽核（待業務）。**
- **IDEM-003（單一 transaction 全回滾）**：OQ-F100-T1 已釘死採「既有冪等模型 I-IDEM-01」
  （重觸發先 DELETE by run_id+list_no，run.status 把關下游消費），**不引入單一長交易** → 此案 N/A。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts` | new | Stage 2 計分 SQL builder：`buildStage2ScoreExpr`（SUM CASE WHEN，區間/類別）+ `resolveColumnSource`（§3.10 column_name→ob_pool_data/customer_core 映射）+ `MAPPED_SCORING_COLUMNS` / `CUSTOMER_CORE_COLUMNS` |
| `apps/api/src/modules/assignment/stage1/stage2to4-sql-executor.ts` | new | Stage 2~4 SQL executor：`runStage2and3Sql`（UPDATE score/level/tier/is_cr，含 customer_core LEFT JOIN / tier NULL-aware join / CR EXISTS）+ `runStage4Sql`（st4_exchange 視窗函式）+ `runStage2to4Sql` |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | 整合層：`useStage2to4Pushdown` gate；Stage 1 loop 收集 `stage1WrittenLists`；`runStage1ForList`/`runStage1SqlPushdown` 加 `skipHydration`（下推路徑不 re-hydrate）；新增 `executeStage2to4Pushdown`；input_list/result 快照與 save() 路徑分流（下推已寫表不再 save）|
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-pushdown.pg.spec.ts` | new | SCORE/CJOIN/LEVTIER/CR/EXCH/EQ executor 級 PG 真庫測試（28 案）|
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-builder.spec.ts` | new | builder 純函式 + NOLOAD 靜態 guard + RG 命名鎖定（14 案，unit）|
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-p3.pg.spec.ts` | new | runPipeline 端到端 EQ/IDEM/RUNEST PG 真庫（7 案）|

## v2 計分 SQL 結構

- **Stage 2 計分（`runStage2and3Sql`）**：`UPDATE ob_monthly_run_result r SET score=sub.score, card_level=lv.card_level, tier_level=ti.tier_level, is_cr=sub.is_cr FROM ob_pool_data o [LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no] CROSS JOIN LATERAL (SELECT <SUM CASE WHEN…> AS score, <CR EXISTS> AS is_cr) sub LEFT JOIN ob_levelcard_level lv … LEFT JOIN ob_tier ti … WHERE r.run_id=… AND o.orgno=r.orgno AND o.appl_no=r.appl_no`。
  - **SUM(CASE WHEN…)**：每個 active column 產巢狀 `CASE WHEN <區間命中>/<TRIM 類別相等> THEN :score … ELSE 0 END`，多維度以 ` + ` 累加（對齊 JS 逐 score row 第一個命中 break 語意）。
  - **customer_core LEFT JOIN**：JOIN key `cc.source_customer_no = o.custo_no`（OQ-F100-T3 釘死）；僅在有客戶屬性維度時 join；LEFT JOIN（非 INNER）→ 無 match 屬性 NULL 不取分、案件不消失（RISK-F100-002）。
  - **tier NULL-aware join（OQ-F100-T2）**：`ti.card_level IS NOT DISTINCT FROM lv.card_level AND (sub.score IS NOT NULL OR lv.card_level IS NOT NULL)`——score 有值落 level 區間外 → card_level NULL → 命中 `ob_tier` card_level=NULL fallback 列（T3，LEVTIER-003）；score NULL（無 active version）→ 不走 fallback（tier NULL，LEVTIER-004）。**資料驅動**：fallback tier 取該 NULL 列之 `tier_level`（非寫死 T3，修正 test 設計「鎖 T3」描述）。
  - **score NULL vs 0**：`buildStage2ScoreExpr` 回 `null`（無 active version → SQL 寫 `NULL::int`，SCORE-006）vs `'0'`（有 active 但 0 命中，SCORE-007）。
- **Stage 3 CR（`runStage2and3Sql` 內 sub.is_cr）**：`cr_enabled` 名單 → `EXISTS (SELECT 1 FROM assignment_run_snapshot s JOIN assignment_run ar … CROSS JOIN LATERAL jsonb_array_elements(s.payload->'assignments') WHERE s.snapshot_type='result' AND ar.status='completed' AND ar.project_workym < :ym AND elem->>'orgno'=o.orgno AND elem->>'applNo'=o.appl_no AND (elem->>'status' IS NULL OR elem->>'status'='PENDING'))` → 'Y'/'N'；`cr_enabled=false` → 一律 'N'。對齊 JS `collectCrCandidates`（snapshot type=result、未成交=PENDING/null，A-2）。
- **Stage 4 st4_exchange（`runStage4Sql`）**：① 全列先 UPDATE 為 default（`emplid=:defaultEmplid`）；② 有 senior 時 `WITH exchangeable AS (SELECT …, ROW_NUMBER() OVER (PARTITION BY list_no ORDER BY orgno, appl_no) rn, COUNT(*) OVER (PARTITION BY list_no) total FROM … WHERE tier_level IN ('T1','T2')) UPDATE … SET emplid=:seniorEmplid … WHERE e.rn <= GREATEST(1, CEIL(e.total*0.1))`。**CEIL（非 SP ROUND）+ GREATEST(1,…)（保底 1）**（OQ-F100-01 對齊 JS）；`PARTITION BY list_no`；deterministic `ORDER BY orgno, appl_no`；交換對象單一 senior。

## column_name 映射狀態

### 已映射（P3 計分生效）

| column_name | 來源 | 型別 | default |
|---|---|---|---|
| LIST_MONTH | `o.month_cnt` | range | 25 |
| PROJECT_TP | `o.spec_tp` | category | '01' |
| CAR_YEAR | 當年 − `o.year_produ`（前導數字解析）| range | 0 |
| COMMISSION | `o.commission` | range | 0 |
| CUS_SEX | `cc.gender`（customer_core LEFT JOIN）| category | '3' |
| AGE | `EXTRACT(YEAR FROM age(cc.date_of_birth))` | range | 0 |
| EDUCAT_BACK | `cc.education_code` | category | '' |
| CAREA_NO1 / CAREA_NO2 / CELLULAR | `(cc.home/contact/mobile_phone IS NOT NULL)::int` | range | 0 |
| HPOST_NUM_NM / CPOST_NUM_NM / CO_NUM_NM | `cc.residential/mailing/company_zip` | category | '' |
| SALES_STS | `o.sales_sts_na` CASE（AGENT/UCD/HFC）| category | 'HFC' |
| LOAN_RATE | `o.loan_rate` | range | 0 |

> 來源權威 = architecture-spec.md §3.10 AD-E07-10-L 對照表（解 OQ-F100-T4）。

### 未映射（比照 JS 不取分，**open item**，不臆造來源）

| column_name | 原因 | 處置 |
|---|---|---|
| `ADD_UN_CAPITAL` | 來源 `ob_arreturndf_min_cap`（非 customer_core，需額外 JOIN，§3.10 註明 ETL 同步前提）| 比照 JS `resolveColumnValue` default 不取分；若業務需此維度，須另補 `ob_arreturndf_min_cap` LEFT JOIN（follow-up F-A）|
| 其餘未列於 §3.10 之 column_name（如測試卡之 TEST_*）| §3.10 未列來源 | 不臆造，比照 JS default 不取分（spec-schema-gap-first）|

> ⚠️ **PROJECT_TP spec_name 衍生（open item F-B）**：§3.10 載「PROJECT_TP 若 spec_name LIKE '%專案%' 則衍生 LEVEL1='A'」。現行 JS `resolveColumnValue` 未實作此衍生（僅讀 spec_tp）。P3 **對齊 JS 簡化版**（只讀 spec_tp，不實作 spec_name 衍生），列為 follow-up。

## Architectural Decisions

- **DB_TYPE gate**：Stage 2~4 SQL 下推僅在 `DB_TYPE='postgres'` + `ASSIGNMENT_PIPELINE_V2='true'` 啟用；SQLite / 非 PG 沿用 JS `executeV2`（golden oracle / fallback）。視窗函式 / SUM(CASE…) / customer_core LEFT JOIN / EXISTS 在 SQLite 不具代表性（I-PORT-01）。
- **冪等（OQ-F100-T1）**：維持既有 I-IDEM-01——P2 `runStage1SqlInsert` 已於本 list 寫入前 `DELETE … WHERE run_id+list_no`；P3 Stage 2~4 為 in-place UPDATE 同列集合 → 重觸發自然一致（IDEM-001 驗）。**不引入單一長交易**。
- **下推不雙寫**：P3 路徑（`stage4ResultsPersisted=true`）後段 `save()` 跳過——列已由 Stage 1 INSERT + Stage 2~4 UPDATE 寫入；快照 payload 由讀回 `ob_monthly_run_result` 有界子集組（input_list / result）。
- **I-NOLOAD-01**：下推路徑 `skipHydration=true` → Stage 1 後不 re-hydrate pool（pool 為空陣列佔位）；`executeStage2to4Pushdown` 不呼叫 `hydratePoolByPk` / `computeScore` / `pool.map`（NOLOAD-001 靜態 guard 守）。
- **customer_core**：依 AD-E06-1 不建 entity，以 raw SQL LEFT JOIN（比照 `c360.service.ts`）；測試以 raw SQL 建 customer_core 表。

## Known Issues / Follow-up

| ID | 項目 | 狀態 |
|----|------|------|
| F-A | `ADD_UN_CAPITAL` 維度需 `ob_arreturndf_min_cap` LEFT JOIN | open（比照 JS 不取分；業務需此維度時補）|
| F-B | PROJECT_TP `spec_name LIKE '%專案%'` 衍生 LEVEL1='A'（§3.10）| open（P3 對齊 JS 簡化版未實作）|
| F-C | UPGR-004 業務驗收（F067 計分升級差異 + 簽核）| 上線人工 gate，記上線 checklist |
| F-D | PG integration 跨 spec 干擾 | **pre-existing**：F098/F099/F100 PG specs 共用 `cdmp_test` DB，同一 `vitest run` 併發會互相 DROP/synchronize 表 → 須逐檔執行（CI 慣例）。非本次引入 |
| F-E | `assignment-run-report/snapshot/scope` 3 spec DI 失敗（ObEmphireRepository）| **pre-existing**（git stash 驗證 baseline 同樣失敗），與 P3 無關 |

## 回歸狀況

- P2（F099）：`stage1-sql-pushdown.pg.spec.ts` 26 案、`stage1-sql-builder.spec.ts` 20 案 — 逐檔執行全綠。I-RUN-EST-01 未回歸（estimate 仍只跑 `estimateStage1SqlCount`，不含計分 join）。
- v2 SQLite（`assignment-run-pipeline-v2.service.spec.ts`）8 案全綠（非 PG → 走 JS `executeV2`，未受下推影響）。
- stage0 dryrun（`stage0-estimate-dryrun.*`）24 案全綠（estimate≡run 延續）。
- 非 PG assignment 套件 956 案全綠（0 assertion 失敗）。
- `tsc --noEmit -p tsconfig.build.json`（cwd=apps/api）：**EXIT 0**。
