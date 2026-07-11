---
type: implementation-log
feature_id: F101
feature_name: 月名單分派 Stage 3/4 真實比例分派（dept ration + empl ration + ASSIGNDAY 確定性設計）
status: complete
last_updated: 2026-06-05
---

# F101：月名單分派 Stage 3/4 真實比例分派 — Implementation Log

以 legacy SP（`st2_dept` / `st3_emplid`）基底算法取代 F100 P3 placeholder Stage 4
（dept[0] + 單一 defaultEmpl + st4_exchange 10% senior swap，Bug C 根因），改為依
`ob_dept_pct.ration` / `ob_empl_set.ration` / `ob_calendar` 千分比之真實確定性分派。
JS executeV2（golden oracle）與 PG SQL 下推**逐列四元組等價**（AC-15 DoD，已於真庫驗收）。

## Test Results Summary

> PG Integration 群組於真 Postgres（cdmp-postgres-test，5433/cdmp_test）執行並全綠。

| 群組 | 案例 | 測試層 | 狀態 |
|------|------|--------|------|
| 純函式 oracle（DEPT/EMPL/ASGD/FALL，`stage3to4-ration.spec.ts`） | 23 | Unit（JS，SQLite-free） | PASS |
| DET 靜態掃描（DET-001/002/003） | 3 | Unit（grep） | PASS |
| DEPT（Stage 3 dept ration，PG） | 8 | PG Integration | PASS |
| EMPL（Stage 4 empl ration，PG） | 5 | PG Integration | PASS |
| ASGD（ASSIGNDAY 千分比，PG） | 3 | PG Integration | PASS |
| EQ（JS↔SQL 逐列四元組等價，DoD） | 4 | PG Integration | PASS |
| IDEM（兩次 run 四元組相同） | 1 | PG Integration | PASS |
| FALL（警告不寫 audit_log） | 1 | PG Integration | PASS |
| REG（emplid≠NULL / is_cr 不改 / no swap） | 2 + 2(JS) | PG + Unit | PASS |

主要 oracle 數值（手算 = 實測，誤差 0）：

| 場景 | 期望 | 結果 |
|------|------|------|
| TS-F101-DEPT-001（101 件，diff=1） | AI000=51 / AM000=30 / B0000=20 | PASS |
| TS-F101-DEPT-002（73 件，diff=2） | 37 / 22 / 14 | PASS |
| TS-F101-DEPT-003（40 件，diff=0） | 20 / 12 / 8 | PASS |
| TS-F101-EMPL-001（Seed A 51 件） | E1=21 / E2=18 / E3=12 | PASS |
| TS-F101-EMPL-003（Seed C 103 件） | G1=36 / G2=34 / G3=33 | PASS |
| TS-F101-ASGD-001（E1 21 件 / 20 工作日） | 19 日各 1 + 末日 2 | PASS |
| TS-F101-ASGD-002（E2 18 件，FLOOR=0） | 全 18 件落末日 | PASS |
| TS-F101-EQ-001（基準逐列） | sort(S_sql) === sort(S_js) | PASS |

**型別 gate**：`tsc --noEmit -p tsconfig.build.json` 乾淨（production code 無型別錯誤）；F101 新增 /
修改之檔案於完整 `tsc --noEmit` 無新增錯誤（其餘為 repo 既有 baseline noise）。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/stage1/stage3to4-ration.ts` | new | Stage 3/4/ASSIGNDAY 純函式比例分派核心（`distributeStage3to4` + `buildWarningSummary`），JS golden oracle |
| `apps/api/src/modules/assignment/stage1/stage3to4-ration-sql.ts` | new | PG set-based SQL 下推（dept→empl→ASSIGNDAY 三道 UPDATE，`runStage3to4RationSql`） |
| `apps/api/src/modules/assignment/stage1/stage2to4-sql-executor.ts` | modified | 移除 `runStage4Sql`（st4_exchange placeholder）+ `runStage2to4Sql` 包裝；`Stage2to4ListContext` 移除 deptId/senior/default 欄位（I-NO-ST4-EXCHANGE） |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | `executeV2` / `executeStage2to4Pushdown` 改用比例分派；注入 `ObCalendar`；`loadWorkingDayRatios`；ration 警告 → skipped_cases.warnings[] + warning_summary；snapshot 加 emplidDeptid/assignday |
| `apps/api/src/modules/assignment-list/stage0-estimate.service.ts` | modified | 抽出純函式 `computeWorkingDayRatios`（estimate≡run 同算法共用，I-RUN-EST-01） |
| `apps/api/src/modules/assignment/assignment.module.ts` | modified | forFeature 註冊 `ObCalendar`（pipeline ASSIGNDAY 依賴） |
| `apps/web/src/pages/assignment/_components/scoring-warning-banner.tsx` | modified | `ISSUE_TYPE_DESCRIPTIONS` 加 3 個 F101 警告類別 key（無頁面重設計） |
| `prototypes/33-run-summary.html` | modified | `SCORING_WARN_CATEGORIES` 加 3 個 F101 警告分類（對齊既有 entry shape） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage3to4-ration.spec.ts` | new | DEPT/EMPL/ASGD/FALL 純函式 oracle（23 案） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage3to4-ration-pushdown.pg.spec.ts` | new | F101 PG 整合（DEPT/EMPL/ASGD/EQ/IDEM/FALL/REG，24 案） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage3to4-ration-det.spec.ts` | new | DET 確定性靜態掃描（3 案） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-pushdown.pg.spec.ts` | modified | 移除已廢除 EXCH 群組；`pushdown` 改呼 `runStage2and3Sql`（SCORE/CJOIN/LEVTIER/CR/EQ 21 案不變） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-builder.spec.ts` | modified | NOLOAD-001 靜態斷言改驗 `runStage2and3Sql` + `runStage3to4RationSql` |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-v2.service.spec.ts` | modified | st4_exchange 測試改為 F101 ration 行為（REG-002 純比例 7/3 / REG-004 is_cr 不改）+ 註冊 ObCalendar |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline.service.spec.ts` | modified | 註冊 ObCalendar |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-stage1-dynamic.spec.ts` | modified | 註冊 ObCalendar |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-p3.pg.spec.ts` | modified | 註冊 ObCalendar；EQ-005（無 active version → tier NULL → emplid NULL，語意演進） |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-bugfix.pg.spec.ts` | modified | 註冊 ObCalendar |
| `apps/api/src/modules/assignment/queue/__tests__/f098-cancellation.spec.ts` | modified | 註冊 ObCalendar |

## Architectural Decisions

- **確定性鍵（AD-E07-29 §3.3）忠實落地**：dept 差額 `obdeptid ASC`；案件 `(orgno, appl_no) ASC`；
  empl 差額 `emplid ASC`；EMP_ORD per-emplid `(orgno, appl_no)`；DIVIDE_LEFT
  `(tier_level, orgno, appl_no)`。全程無 NEWID / random（I-DET-01，DET-001 守）。
- **JS↔SQL 等價策略**：SQL 下推以 window function 累積邊界 `[lo, hi)` 對應案件 ROW_NUMBER，與 JS
  「依配額循序切片」逐列等價；EQ 群組於同 seed、同 PG 庫比對四元組 `toEqual`（已驗 byte-identical）。
- **ASSIGNDAY 共用日曆**：抽出純函式 `computeWorkingDayRatios`，Stage 0 試算（`calculateDailyEstimate`）
  與月名單分派 Stage 4 共用同算法 + 同 `ob_calendar`（I-RUN-EST-01），避免模組循環依賴（不互 import module）。
- **警告通道（OQ-F101-05）**：三類警告寫 `assignment_run.skipped_cases.warnings[]`（JSONB merge，與既有
  `cases`/`integrityIssues`/`lists` 共存）+ `warning_summary`（pipe 連接事件碼，VARCHAR 100 截斷）；
  **不**擴展 `assignment_audit_log.action` enum（FALL-006 守）。月名單分派保持 `completed`。
- **st4_exchange 廢除（I-NO-ST4-EXCHANGE）**：`runStage4Sql` senior swap CTE + `executeV2` senior 分組
  邏輯整段移除；emplid 純由 ration 決定。`Stage2to4ListContext` 之 deptId/senior/default 欄位刪除。
- **語意演進（非 regression）**：F101 Stage 3/4 只分派 `tier_level IN ('T1'..'T5')` 案件（BR-F101-01）。
  無 active version（tier NULL）之案件不再被 placeholder 指向單一 defaultEmpl，dept_id/emplid 保持 NULL。
  受影響既有測試（F100 EQ-005）已對齊新語意。

## 已知事項 / 後續

- **pre-existing baseline 失敗（非 F101）**：`assignment-run-report.service` /
  `assignment-run-report.scope` / `assignment-run-snapshot.service` 三 suite 因
  `SectionChiefScopeService` 之 `ObEmphireRepository` DI 未提供而 fail；已用 git stash 對 baseline
  重跑確認為既有問題（與 F101 無關），未在本 feature scope 修。
- **UPGR（NFR-005）人工驗收 + F067 分派差異報告**：屬上線前硬性前置（業務簽核），非本實作自動化範疇；
  自動化部分（UPGR-004 assignday 工作日分散性）由 PG 整合 ASGD 群組涵蓋。
- **F098/F099/F100/F101 pg.spec 共用 cdmp_test DB**：CI 須序列執行（一次一檔，DROP/synchronize），
  不可並行。本次驗證均逐檔執行通過。
