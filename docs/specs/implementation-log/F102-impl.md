---
type: implementation-log
feature_id: F102
feature_name: 月跑 CR 優先分派（失效清空 + CR 優先指派 + 扣量 + per-list cr_enabled 閘控 + 廢除全域旗標）
status: complete
last_updated: 2026-06-12
---

# F102: 月跑 CR 優先分派 — Implementation Log

## v1.1（2026-06-12）— I-CR-ASSIGNDAY-01 bug 修正（live 202606 抓到）

**Bug**：CR 案（is_cr='Y'）assignday 全 NULL（live 202606：2,073 筆 CR 全空；legacy 2,079/2,079 全有指派日、散佈全 21 工作日）。
**根因**：扣量過濾（is_cr<>'Y'）錯誤地也套到 ASSIGNDAY 階段 → CR 案被排除於工作日散佈外。
**修法**（依架構師 AD 修正）：
- **PG**：`runAssignDaySql` 之 `hasEmplRows` / `empl_total` / `ranked` CTE **移除** `is_cr<>'Y'`，只留 `emplid IS NOT NULL`
  （扣量仍只作用於 Stage 3 cases/ranked + Stage 4 grp/ranked 四個配額 CTE）。
- **JS**：`distributeStage3to4` 新增 `crPreassigned: CrPreassignedCase[]` 參數——CR 案預先寫入 result Map（emplid/dept_id 已定），
  ASSIGNDAY 散佈池 = 非 CR tieredCases + CR 案；dept/empl 配額仍只算非 CR。pipeline `executeV2` 組 crPreassigned 傳入，
  CR 案 assignday 改讀 distributeStage3to4 結果（非寫死 null）。
- **新 invariant I-CR-ASSIGNDAY-01**：is_cr='Y' 案件納入 ASSIGNDAY 散佈（不扣量），與同 emplid 非 CR 案同基準；
  扣量（is_cr<>'Y'）僅作用於 dept/empl 數量配額。
- **新測試**：PG ASGD-CR-001（21 CR → assignday 全非 NULL 散佈全 20 工作日）/ ASGD-CR-002（CR+非CR 同 emplid 同基準）/
  ASGD-CR-EQ（JS↔SQL 逐案件 assignday 等價，DoD）；JS oracle ASGD-CR-001/002。
- **確認**：F102 PG 21 PASS（含 3 新 assignday）；JS oracle 25 PASS（含 2 新）；CR 案 assignday 測試中**非空**。
- **回歸**：F101 ration-pushdown 24 / F100 19 / F099 26 / p3 7 / bugfix 4 全綠（F101 assignday 用 is_cr='N' default，移除過濾為 no-op）；tsc 乾淨。

---

## 測試結果摘要

| 群組 | 案例 | 測試層 | Status |
|------|------|--------|--------|
| applyCrPriority JS oracle（步驟 1/2/3 + worked example） | cr-priority.spec.ts（7 it） | Unit | PASS |
| computeCrSysDates（STEP1-004，含跨年） | cr-priority.spec.ts | Unit | PASS |
| DET-001/002/002b/003 + S1SRC-003 確定性/清理靜態掃描 | cr-priority.spec.ts（5 it） | Unit（靜態） | PASS |
| ORDER-001 執行順序靜態驗證（pushdown + v2） | cr-priority.spec.ts（2 it） | Unit（靜態） | PASS |
| GATE-001/002/006 閘控 cr_enabled | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| STEP1-001/002/003/005 逾2年清空邊界 | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| STEP2-001/002/003/004 離職清空 + 查無不清 | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| STEP3-001/002/003/004 ration>0 + deptid_m ASC | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| DEDUCT-001/002 扣量 + CR 不被覆蓋 | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| EQ-005/006 JS↔SQL 六元組逐列等價（DoD） | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| IDEM-001/002 重跑冪等 | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| S2CLEAN-001 Stage 2 不寫 is_cr | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| S1SRC-001/002 Stage 1 帶入 cr_id/cr_nm/is_cr/appl_date | cr-priority-pushdown.pg.spec.ts | PG | PASS |
| ORDER-002 CR 寫入後不被 Stage 3 覆蓋 | cr-priority-pushdown.pg.spec.ts | PG | PASS |

**F102 PG spec 共 18 PASS；F102 unit spec 共 16 PASS。**

### F101 既有測試更新（test spec §17）
| F101 測試 | 更新 | Status |
|-----------|------|--------|
| EMPL-005（stage3to4-ration.spec.ts） | JS oracle 純 ration（不含 is_cr）→ 語意不變，無需改 | PASS（不變） |
| REG-004（stage3to4-ration-pushdown.pg.spec.ts） | 加 is_cr<>'Y' 過濾後仍保留 is_cr 值 → 期望不變 | PASS |
| IDEM-001/IDEM-002（pushdown pg） | clearStage3Fields 提取 + is_cr 保留語意不變 | PASS |
| EQ-008 等（F100 CR-001~005） | 移除歷史 snapshot 動態回分，改 S2CLEAN-001/002（Stage 2 不寫 is_cr） | PASS |
| F100 p3 EQ-006/007 | 改測端到端 CR 優先分派（cr_enabled true/false） | PASS |
| v2 service TC-V2-STAGE3 | 改測 F102 CR 優先分派（cr_enabled + 逾2年清空） | PASS |

### 回歸驗證（PG specs 序列執行，共用 cdmp_test DB）
| Spec | Tests | Status |
|------|-------|--------|
| stage1-sql-pushdown.pg（F099） | 26 | PASS |
| stage2to4-sql-pushdown.pg（F100） | 19（4 CR 移除 + 2 S2CLEAN 新增） | PASS |
| stage3to4-ration-pushdown.pg（F101） | 24 | PASS |
| assignment-run-pipeline-p3.pg（F100 端到端） | 7 | PASS |
| assignment-run-pipeline-bugfix.pg（Bug A） | 4 | PASS |
| assignment-run-pipeline-v2.service（SQLite） | 8 | PASS |

`tsc --noEmit -p tsconfig.build.json` 乾淨。

> ⚠️ PG specs 必須**序列**執行（CI `--runInBand` 或分 step）；並行跑會因共用 cdmp_test DB 之 DELETE/FK
> 競態互相干擾（同 test-index 之 F098/F099/F100/F101 慣例）。本實作每個 PG spec 檔單獨重跑全綠。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/api/src/modules/assignment/stage1/cr-priority.ts | new | JS oracle：applyCrPriority（步驟 1/2/3）+ computeCrSysDates |
| apps/api/src/modules/assignment/stage1/cr-priority-sql.ts | new | PG 下推 runCrPrioritySql（三道 UPDATE + cr_enabled=false 強制清 N） |
| apps/api/src/modules/assignment/stage1/stage1-sql-executor.ts | modified | INSERT…SELECT 補帶 cr_id/cr_nm/is_cr/appl_date（scoped LEFT JOIN ob_pool_data_list） |
| apps/api/src/modules/assignment/stage1/stage2to4-sql-executor.ts | modified | runStage2and3Sql 移除 crExpr/crEnabled EXISTS；Stage 2 不寫 is_cr |
| apps/api/src/modules/assignment/stage1/stage3to4-ration-sql.ts | modified | Stage 3/4/ASSIGNDAY 案件池加 is_cr<>'Y' 扣量；新增 clearStage3Fields |
| apps/api/src/modules/assignment/stage1/stage3to4-ration.ts | unchanged | JS oracle 由呼叫端過濾 is_cr<>'Y'（AD §7.2），本檔無需改 |
| apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts | modified | executeStage2to4Pushdown 插 clearStage3Fields+runCrPrioritySql；executeV2 移除 collectCrCandidates 改 applyCrPriority；注入 ObEmphire repo；快照帶 cr_id/cr_nm |
| apps/api/src/database/entities/ob-monthly-run-result.entity.ts | modified | 新增 appl_date 欄（CR 失效規則步驟 1 來源） |
| apps/api/src/database/entities/ob-assign-config.entity.ts | modified | class 加 [DEPRECATED-F102] JSDoc |
| apps/api/src/database/migrations/1711360000300-AddObMonthlyRunResultApplDate.ts | new | ob_monthly_run_result.appl_date migration（PG ALTER；SQLite no-op） |
| apps/api/src/database/seeds/seed.ts | modified | 移除 cr_reassignment_enabled config row（US-154 AC-1） |
| apps/api/.../cr-priority.spec.ts | new | JS oracle + 確定性/清理靜態掃描 unit 測試 |
| apps/api/.../cr-priority-pushdown.pg.spec.ts | new | F102 PG 整合測試（GATE/STEP/DEDUCT/EQ/IDEM/S2CLEAN/S1SRC/ORDER） |
| apps/api/.../assignment-run-pipeline-v2.service.spec.ts | modified | TC-V2-STAGE3 改測 F102 CR 優先分派；註冊 ObEmphire；補 seedPoolList/seedEmphire |
| apps/api/.../assignment-run-pipeline-p3.pg.spec.ts | modified | EQ-006/007 改測端到端 CR 優先分派；註冊 ObEmphire + ObPoolDataList repo |
| apps/api/.../stage2to4-sql-pushdown.pg.spec.ts | modified | CR-001~005 移除改 S2CLEAN-001/002；pushdown helper 移除 crEnabled |
| apps/api/.../assignment-run-pipeline.service.spec.ts | modified | 註冊 ObEmphire（service 新增非選依賴） |
| apps/api/.../assignment-run-pipeline-stage1-dynamic.spec.ts | modified | 註冊 ObEmphire |
| apps/api/.../assignment-run-pipeline-bugfix.pg.spec.ts | modified | ENTITIES 加 ObEmphire |
| apps/api/.../queue/__tests__/f098-cancellation.spec.ts | modified | ENTITIES 加 ObEmphire |

## Architectural Decisions（spec/AD 邊界內之實作選擇）

1. **clearStage3Fields 為新建函式**：AD §4.3 假設 F101 runStage3DeptSql 內已含清除，但實檔無 —— F101 下推路徑靠 Stage 1 DELETE+INSERT 產生全 NULL dept 欄，無獨立清除步驟。為滿足 I-CR-ORDER-01 + ORDER-001 靜態驗證，於 stage3to4-ration-sql.ts 新增 `clearStage3Fields`（清 dept_id/emplid/emplid_deptid/assignday，保留 is_cr），pipeline 在 runCrPrioritySql 之前呼叫。對下推路徑為冪等護欄（無害）。
2. **executeV2 CR 三欄來源**：JS 路徑（SQLite）由 `poolDataListRepo`（ob_pool_data_list）讀回 cr_id/cr_nm/is_cr/appl_date（與 PG Stage 1 帶入同源），再呼叫 applyCrPriority。
3. **快照帶 cr_id/cr_nm**：readResultRowsForSnapshot + resultPayload 補 cr_id/cr_nm（F064 匯出 / F067 比對 AC-13 需要）。

## 偏離 spec/AD 之處（已記錄，未自行裁示重大變更）

> 以下兩處 AD 文字與實際 entity/源表不符；為使 legacy SP 語意忠實落地且測試可綠，採最小忠實補足，
> **明確記錄供架構師事後審視**（feedback_spec_schema_gap_first）。

### 偏離 1：ob_monthly_run_result 缺 appl_date 欄（AD §13「不需新增 migration」為疏漏）
- **問題**：AD §6.1 步驟 1 SQL 以 `ob_monthly_run_result.appl_date < :twoYearsAgo::date` 比對，但該表
  m292 建表時**無 appl_date 欄**（cr_id/cr_nm/is_cr 已存在）。AD §13 宣稱「所有所需欄位已存在、不需新增 migration」與此矛盾。
- **處置**：新增 `appl_date`（dateColumnType nullable）至 entity + migration m300（PG ALTER；SQLite synchronize no-op）。
  Stage 1 INSERT 由 ob_pool_data_list 帶入。**此為新增欄位 + migration，超出 AD §13 範圍**。
- **建議架構師**：確認 m300 + entity 欄位；或裁示改 CR 步驟 1 JOIN 回 ob_pool_data_list 取 appl_date（不建議，違反 I-CR-COLSRC-01「只對 result UPDATE」）。

### 偏離 2：Stage 1 SELECT 源表為 ob_pool_data（非 ob_pool_data_list），CR 三欄須 LEFT JOIN 帶入
- **問題**：AD §3.1 述「Stage 1 INSERT…SELECT 補帶 ob_pool_data_list.cr_id/cr_nm/is_cr」，但
  stage1-sql-executor.ts 之 INSERT…SELECT 源表為 `ob_pool_data o`（Stage 1 篩選表），該表**無 cr_id/cr_nm/is_cr 三欄**
  （僅 appl_date）。三欄存於 ob_pool_data_list（legacy 派案歷史，同 PK），對齊 legacy SP `#OBPOOLDATA_LIST` 取自 OBPOOLDATA_LIST。
- **處置**：INSERT…SELECT 加 **scoped 子查詢 LEFT JOIN**
  `LEFT JOIN (SELECT orgno, appl_no, cr_id, cr_nm, is_cr, appl_date FROM ob_pool_data_list WHERE list_no = :insListNo) pdl ON pdl.orgno=o.orgno AND pdl.appl_no=o.appl_no`。
  is_cr COALESCE 'N'；appl_date 取 pdl 優先、退 o.appl_date。
- **真 bug 發現**：原以**整表** `LEFT JOIN ob_pool_data_list pdl` 觸發 PG `column reference "prod_kind" is ambiguous`
  ——兩表數十同名欄位，composer WHERE 以無 alias `"col"` 引用（單表時無歧義）。改 scoped 子查詢只暴露 CR 四欄後解決。
- **建議架構師**：確認此 LEFT JOIN 語意（CR 案件之 cr_id 來自 ob_pool_data_list，與 legacy SP 一致）；
  ob_pool_data_list 對本 list_no 之同案件無對應列時三欄 NULL（is_cr→'N'），不影響非 CR 案件。

## Blocking Issues

無。

### 既有 baseline 失敗（與 F102 無關，已用 git stash 驗證）
- `assignment-run-snapshot.service.spec.ts` / `assignment-run-report.scope.spec.ts`：suite-level Nest DI 失敗
  `SectionChiefScopeService` 需 `ObEmphireRepository`（index [1]），該 spec 之 TestingModule 未註冊 ObEmphire。
  **stash 掉 F102 全部變更後此 2 檔仍同樣失敗** → 確認為 pre-existing，非 F102 引入。建議另案修這 2 個測試模組之 entity 註冊。
