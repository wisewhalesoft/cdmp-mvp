---
type: test-design-feature
feature_id: F101
feature_name: 月名單分派 Stage 3/4 真實比例分派（dept ration + empl ration + ASSIGNDAY 確定性設計）
priority: P0-MVP
related_spec: /docs/specs/features/F101-stage3-4-proportional-assignment.md
spec_version: "1.0"
covers:
  - F101
source_ad: /docs/specs/implementation-log/AD-E07-v3.2-f101-stage3-4-proportional-assignment.md
source_stories: [US-145, US-146, US-149, US-150, US-151]
last_updated: 2026-06-05
---

# F101：月名單分派 Stage 3/4 真實比例分派 — 測試設計

> ⚠️ **範圍**：本文件為測試設計（test design），**不含** production code、測試實作碼（spec 檔）、migration、entity 定義，由 tdd-implementation agent 承接落地。
>
> **驗收紅線（Definition of Done）**：
> 1. **EQ 群組**（JS `executeV2` ↔ PG SQL 下推，`(dept_id, emplid, emplid_deptid, assignday)` 逐列等價，PG 真庫）= AC-15 DoD 門檻，未全綠不得上線。
> 2. **手算 oracle 群組**（Stage 3 DEPT / Stage 4 EMPL / ASSIGNDAY）= 誤差為 0，oracle 數值寫死於本文件，由人複核。
> 3. **I-DET-01 靜態掃描**（Stage 3/4/ASSIGNDAY 全程無 NEWID/random）= 回歸紅線。
> 4. **I-NO-ST4-EXCHANGE**（senior swap 不執行）= 必測回歸。
>
> **已裁定決策（所有 OQ 已 RESOLVED，測試據此驗收）**：
> - **OQ-F101-01**（確定性鍵）= Stage 3 差額：`obdeptid ASC`；Stage 3/4 案件：`(orgno ASC, appl_no ASC)`；Stage 4 差額：`emplid ASC`；EMP_ORD：`PARTITION BY emplid ORDER BY orgno, appl_no`；DIVIDE_LEFT：`PARTITION BY emplid ORDER BY tier_level ASC, orgno ASC, appl_no ASC`。
> - **OQ-F101-02**（st4_exchange）= 廢除，SP 自 202408 已硬編碼停用（`IF @LIST_YEAR_MONTH >= '202408' RETURN`）。
> - **OQ-F101-03**（ob_assign_set 退役）= F101 不引用，不在本 feature 執行 DROP TABLE。
> - **OQ-F101-04**（冪等粒度）= 沿用 I-IDEM-01：run 級清除 + Stage 3 前清 dept_id/emplid/assignday，per-list auto-commit。
> - **OQ-F101-05**（警告通道）= 三類警告寫 `assignment_run.skipped_cases.warnings[]`（JSONB）+ `warning_summary`（VARCHAR 100），不擴展 `assignment_audit_log.action` enum。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F101 spec](../../specs/features/F101-stage3-4-proportional-assignment.md)（§4 AC-1~18 / §6 worked example / §12 OQ）+ [AD-E07-29](../../specs/implementation-log/AD-E07-v3.2-f101-stage3-4-proportional-assignment.md)（**所有 OQ 已裁定，權威**）+ `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`executeV2` L517~ placeholder Stage 4）+ `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts` / `stage2to4-sql-executor.ts` / `stage2to4-sql-pushdown.pg.spec.ts`（F100 等價哈尼斯，F101 沿用此架構）+ `apps/api/src/modules/assignment-list/stage0-estimate.service.ts`（`calculateDailyEstimate` / `resolveCalendarDay` 複用）+ entity：`ob-dept-pct` / `ob-empl-set` / `ob-monthly-run-result` / `ob-pool-data` / `ob-calendar` |
| QA / Tester | 本文件（特別 §一 手算 oracle 矩陣 + §二 EQ 等價矩陣 + §五 regression 保護 + §六 確定性掃描） |
| CI/CD Owner | 本文件「自動化就緒度」+「需 Postgres 案例彙整」；⚠️ F098/F099/F100/F101 pg.spec 共用單一 cdmp_test DB（DROP/synchronize），CI 必須序列執行（不可並行） |
| Product Analyst / 業務 | §八 UPGR — 比例分派上線差異量化 + F067 驗收 gate（NFR-005） |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| **驗收紅線** | EQ 群組 JS↔SQL 逐列等價（AC-15）+ 手算 oracle Stage 3/4/ASSIGNDAY 誤差=0（AC-13/14/12）為 DoD 門檻 |
| **主要測試層** | ① **PG Integration（強制 Postgres）**：EQ 逐列等價、手算 oracle Stage 3/4/ASSIGNDAY、I-IDEM-01 冪等、OB202606001 回歸保護、st4_exchange 廢除回歸 ② **Unit（純函式/靜態）**：I-DET-01 靜態掃描（無 random）、ob_assign_set 無引用 grep（AC-18）、is_cr 值不改單元驗證、estimate≡run 路徑斷言 ③ **Integration（SQLite oracle）**：JS executeV2 golden oracle 行為驗證（DB_TYPE != postgres 路徑） |
| **等價基準（Oracle）** | **手算預期值（FLOOR + 確定性差額補足）**。oracle 件數寫死於本文件 §一~§三，由人複核後視為 ground truth。禁止以「跑舊 JS placeholder」當 oracle（舊 placeholder 為單一 dept[0] / defaultEmpl，非比例分派）；禁止「SQL 自我斷言」（同錯假綠）。 |
| **Mock / Seed 注意** | seed 須反映真實 contract（`feedback_mock_real_system_contract`）：`ob_dept_pct.ration` 為 `numeric(9,2)`；`ob_empl_set.ration` 為 `numeric(10,2)`；`ob_calendar.rest_flg = '0'` 代表工作日；`ob_monthly_run_result.tier_level` 值域為 T1–T5（migration 162 收斂，無變體）；`ob_pool_data.dept_id` 為分處代碼（varchar6），非電銷課。 |
| **CI 序列執行** | F098/F099/F100/F101 pg.spec 共用 cdmp_test DB 並執行 DROP/synchronize，**必須一次跑一個檔案，禁止並行**。 |
| **型別 gate** | 實作後必須跑 `tsc --noEmit -p tsconfig.build.json`（vitest 不檢型別，`feedback_vitest_no_typecheck` 教訓）。 |
| **SP 解碼** | `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql` / `_st3_emplid.sql` 均為 **UTF-16LE**，須 `node -e "require('fs').readFileSync(f).toString('utf16le')"` 解碼（`feedback_sp_utf16le_decode` 教訓）。 |

### 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 自動化適合度 | 說明 |
|---|---|---|---|---|---|
| DEPT（Stage 3 手算 oracle，AC-1/2/3/13） | 8 | PG Integration | **是** | 高 | FLOOR + 差額補足；2 分處×2 Tier×3 課；multi-dept 不退化；OB202606001 回歸 |
| EMPL（Stage 4 手算 oracle，AC-6/7/8/9/14） | 9 | PG Integration | **是** | 高 | FLOOR + ADD_CNT + 前 N；is_cr Y/N 同池；emplid/emplid_deptid 寫入 |
| ASGD（ASSIGNDAY 千分比，AC-12/16） | 5 | PG Integration | **是** | 高 | per-casedt FLOOR；最末吸收；DIVIDE_LEFT round-robin；estimate≡run |
| EQ（JS↔SQL 逐列等價，AC-15，DoD） | 8 | PG Integration | **是** | 高 | **DoD 門檻**；代表性名單矩陣；四欄位逐列精確比對 |
| IDEM（重跑安全 / 冪等，AC-4） | 3 | PG Integration | **是** | 高 | Stage 3 前清除；is_cr 保留；兩次執行四元組相同 |
| FALL（Fallback / 警告通道，AC-5/11/17） | 6 | PG Integration + Unit | **是** | 高 | 無 ration / 無 empl / 無 calendar → NULL + 警告；月名單分派不中斷 |
| REG（回歸保護，AC-10/AC-2/I-NO-ST4-EXCHANGE） | 5 | PG Integration + Unit | **是** | 高 | emplid 不為 NULL（有員工設定）；determinism 兩次相同；senior swap 不發生 |
| DET（確定性靜態掃描，AC-2/I-DET-01） | 3 | Unit（靜態） | 否 | 高 | grep：NEWID/random/randomUUID 為空；ob_assign_set 無引用；AC-18 |
| UPGR（分派差異報告 + 業務驗收，NFR-005） | 4 | PG Integration + 人工 | **是** | 中（報告自動、驗收人工） | 上線前硬性前置 |
| **合計** | **51** | — | **44 案例需 Postgres** | — | DEPT 8 + EMPL 9 + ASGD 5 + EQ 8 + IDEM 3 + FALL(PG) 5 + REG(PG) 4 + UPGR 2 = 44 強制需 PG |

---

## 一、DEPT — Stage 3 手算 Oracle（AC-1/2/3/13）

> **設計依據**：F101 §4 AC-1/2/3/13；AD-E07-29 §3.2（SQL 骨架）/ §3.3（確定性鍵）。
>
> **黃金 Oracle 建立法**：以下所有期望件數為 FLOOR 公式 + 確定性差額補足（`obdeptid ASC` 前 N 課各 +1）之**手算結果，寫死於文件**。任何穩定排序鍵的 FLOOR 件數（ΣFLOOR = N−diff）不變；差異僅在「哪幾課拿到差額 +1」，因此 `obdeptid ASC` 鍵已完全決定結果。
>
> **通用 seed 設定（DEPT 群組共用）**：
> - 2 分處（`dept_id`）：`XVF1` / `XVG1`（模擬 OB202606001 實際分處）
> - 2 Tier：`T1` / `T2`（各分處各 Tier 均有案件）
> - `ob_dept_pct`（list_no='OB202606001', ration>0）= 課A=`AI000`(50) / 課B=`AM000`(30) / 課C=`B0000`(20)
>   - 額外設定課D=`AI000`在 `ob_empl_set` 無員工（用於 OB202606001 回歸驗證）
>
> **手算預期矩陣（Stage 3 — 各（分處, list_no, tier_level, obdeptid）期望件數）**

### Seed 1：XVF1 / OB202606001 / T1 — 共 101 件

| 課（obdeptid） | ration | FLOOR(101×ration/100) | 差額補足（obdeptid ASC 前 1 課 +1） | 最終件數 |
|---|---|---|---|---|
| AI000 | 50 | 50 | +1（obdeptid ASC 第 1） | **51** |
| AM000 | 30 | 30 | 0 | **30** |
| B0000 | 20 | 20 | 0 | **20** |
| **合計** | 100 | 100 | 差額=1 | **101** ✓ |

> 驗算：ΣFLOOR = 50+30+20 = 100；diff = 101−100 = 1；`obdeptid ASC` → AI000 最小 → AI000 +1。

### Seed 2：XVF1 / OB202606001 / T2 — 共 73 件

| 課（obdeptid） | ration | FLOOR(73×ration/100) | 差額補足（obdeptid ASC 前 1 課 +1） | 最終件數 |
|---|---|---|---|---|
| AI000 | 50 | 36 | +1 | **37** |
| AM000 | 30 | 21 | 0 | **21** |
| B0000 | 20 | 14 | 0 | **14** |
| **合計** | 100 | 71 | 差額=2，+1給 AI000, AM000 | **73** ✓ |

> 驗算：FLOOR(73×50/100)=36，FLOOR(73×30/100)=21，FLOOR(73×20/100)=14；Σ=71；diff=2；`obdeptid ASC`→AI000(+1)、AM000(+1)。最終 AI000=37, AM000=22, B0000=14。

**修正上表（diff=2）**：

| 課（obdeptid） | 最終件數 |
|---|---|
| AI000 | **37** |
| AM000 | **22** |
| B0000 | **14** |
| **合計** | **73** ✓ |

### Seed 3：XVG1 / OB202606001 / T1 — 共 58 件

| 課（obdeptid） | ration | FLOOR(58×ration/100) | 差額補足（obdeptid ASC 前 0 課 +1） | 最終件數 |
|---|---|---|---|---|
| AI000 | 50 | 29 | 0 | **29** |
| AM000 | 30 | 17 | +1 | **18** |
| B0000 | 20 | 11 | +1 | **12** |
| **合計** | 100 | 57 | 差額=1 | **58** ✓ |

> 驗算：FLOOR(58×50/100)=29，FLOOR(58×30/100)=17，FLOOR(58×20/100)=11；Σ=57；diff=1；AI000(+1)。最終 AI000=30, AM000=17, B0000=11。

**修正上表（diff=1，AI000 排序最小 +1）**：

| 課（obdeptid） | 最終件數 |
|---|---|
| AI000 | **30** |
| AM000 | **17** |
| B0000 | **11** |
| **合計** | **58** ✓ |

### Seed 4：XVG1 / OB202606001 / T2 — 共 40 件

| 課（obdeptid） | ration | FLOOR(40×ration/100) | 差額補足 | 最終件數 |
|---|---|---|---|---|
| AI000 | 50 | 20 | 0 | **20** |
| AM000 | 30 | 12 | 0 | **12** |
| B0000 | 20 | 8 | 0 | **8** |
| **合計** | 100 | 40 | 差額=0 | **40** ✓ |

---

### TS-F101-DEPT-001：Stage 3 FLOOR + 確定性差額補足（Seed 1，101 件黃金 case）

- **相關 AC**：AC-1 / AC-13 / BR-F101-01/02/03/04/05
- **測試類型**：正向 / 手算 Oracle
- **測試層**：PG Integration（強制 Postgres）
- **前置條件**：Stage 2 完成（`ob_monthly_run_result` 已有 tier_level='T1'）；Seed 1 種子資料（XVF1/OB202606001/T1，101 件；`ob_dept_pct` 三課 50/30/20）
- **步驟**：
  1. 建立 Seed 1 資料（ob_pool_data + ob_monthly_run_result 含 tier_level）
  2. 執行 Stage 3（dept ration 分配）
  3. 查詢 `ob_monthly_run_result WHERE run_id=:runId AND tier_level='T1'` 之 dept_id 分佈
- **期望結果**：
  - AI000 件數 = **51**（FLOOR(101×50/100)+差額+1）
  - AM000 件數 = **30**（FLOOR(101×30/100)）
  - B0000 件數 = **20**（FLOOR(101×20/100)）
  - 合計 = **101**，誤差 = 0
  - dept_id 非 NULL 比例 = 100%（全部案件均有 dept_id）

---

### TS-F101-DEPT-002：Stage 3 多 diff — Seed 2（73 件，diff=2）

- **相關 AC**：AC-1 / AC-13 / BR-F101-04
- **測試類型**：正向 / 手算 Oracle（差額=2 邊界）
- **測試層**：PG Integration
- **前置條件**：Seed 2（XVF1/OB202606001/T2，73 件；三課 50/30/20）
- **步驟**：執行 Stage 3；查詢 dept_id 分佈
- **期望結果**：
  - AI000 = **37**；AM000 = **22**；B0000 = **14**；合計 = **73**；誤差 = 0
  - 確認：兩課各 +1（AI000 第 1、AM000 第 2，依 `obdeptid ASC`）

---

### TS-F101-DEPT-003：Stage 3 diff=0（整除，無需差額補足）— Seed 4（40 件）

- **相關 AC**：AC-1 / AC-13 / BR-F101-03
- **測試類型**：正向 / 邊界（ΣFLOOR = 分組總數）
- **測試層**：PG Integration
- **前置條件**：Seed 4（XVG1/OB202606001/T2，40 件；三課 50/30/20）
- **步驟**：執行 Stage 3；查詢 dept_id 分佈
- **期望結果**：
  - AI000 = **20**；AM000 = **12**；B0000 = **8**；合計 = **40**；誤差 = 0
  - 確認：不存在任何差額補足行為（diff=0）

---

### TS-F101-DEPT-004：2 分處 × 2 Tier 四組全矩陣 Oracle 等效性（AC-13）

- **相關 AC**：AC-13 / BR-F101-01
- **測試類型**：正向 / 手算 Oracle（完整矩陣，2×2×3）
- **測試層**：PG Integration
- **前置條件**：同時植入 Seed 1+2+3+4 種子資料，共 272 件
- **步驟**：
  1. 執行 Stage 3（一次跑完所有分組）
  2. 依（dept_id, list_no, tier_level, obdeptid）GROUP BY 統計件數
- **期望結果**：下表所有格均精確吻合，誤差 = 0

| 分處 | Tier | AI000 | AM000 | B0000 | 合計 |
|---|---|---|---|---|---|
| XVF1 | T1 | 51 | 30 | 20 | 101 |
| XVF1 | T2 | 37 | 22 | 14 | 73 |
| XVG1 | T1 | 30 | 17 | 11 | 58 |
| XVG1 | T2 | 20 | 12 | 8 | 40 |

---

### TS-F101-DEPT-005：多分處不退化（OB202606001 型回歸，AC-3）

- **相關 AC**：AC-3 / BR-F101-01/05 / I-DEPT-EMPL-SEPARATION
- **測試類型**：回歸保護（Bug C 根因：AI000 在 ob_empl_set 無員工）
- **測試層**：PG Integration
- **前置條件**：
  - `ob_dept_pct`：AI000(50) / AM000(30) / B0000(20)
  - `ob_empl_set WHERE deptid_m='AI000'`：**無任何記錄**（Stage 4 員工層缺失）
  - Stage 2 完成；任一分組共 X 件
- **步驟**：執行 Stage 3；查詢 distinct dept_id 數量
- **期望結果**：
  - `SELECT COUNT(DISTINCT dept_id)` = **3**（AI000 / AM000 / B0000 均出現）
  - Stage 3 **不因** AI000 在 Stage 4 無員工而跳過或減少配額（Stage 3 ⊥ Stage 4，I-DEPT-EMPL-SEPARATION）
  - AI000 件數 = FLOOR(X×50/100) + 差額補足，非 0

---

### TS-F101-DEPT-006：依配額循序指派 + 案件排序 (orgno, appl_no) ASC

- **相關 AC**：AC-1 / BR-F101-05 / OQ-F101-01
- **測試類型**：正向（確定性指派順序）
- **測試層**：PG Integration
- **前置條件**：Seed 1 資料；10 件案件 appl_no 排序已知（0001~0010）；AI000 配額=6，AM000=3，B0000=1
- **步驟**：執行 Stage 3；取各案件 (appl_no, dept_id)
- **期望結果**：
  - appl_no 0001~0006 → `dept_id = 'AI000'`（前 6 件）
  - appl_no 0007~0009 → `dept_id = 'AM000'`（次 3 件）
  - appl_no 0010 → `dept_id = 'B0000'`（末 1 件）
  - 確認：案件按 `(orgno ASC, appl_no ASC)` 取件，指派為確定性

---

### TS-F101-DEPT-007：ob_dept_pct 無 ration > 0 → dept_id NULL + 警告（AC-5）

- **相關 AC**：AC-5 / BR-F101 / I-WARNING-CHANNEL
- **測試類型**：負向（無 ration 設定 fallback）
- **測試層**：PG Integration
- **前置條件**：某 (dept_id, list_no, tier_level) 分組，`ob_dept_pct WHERE list_no=<list_no>` 無任何 ration>0 記錄（或整個 list_no 缺席）
- **步驟**：執行 Stage 3；查詢 assignment_run.skipped_cases 及月名單分派最終 status
- **期望結果**：
  - 月名單分派 `status = 'completed'`（**不中斷**）
  - 該分組案件 `dept_id` 保持 NULL（不指派）
  - `assignment_run.skipped_cases` JSONB 內含：
    ```json
    { "warnings": [{ "event": "STAGE3_NO_DEPT_RATION", "list_no": "<list_no>", "tier_level": "<tier>" }] }
    ```
  - `assignment_run.warning_summary` 含字串 `"STAGE3_NO_DEPT_RATION"`

---

### TS-F101-DEPT-008：Stage 3 Pipeline 順序不變式（Stage 2 必在前，AC-1 前置條件）

- **相關 AC**：AC-1 / BR-F101-01 / I-PIPELINE-STAGE-ORDER
- **測試類型**：負向（依序執行驗證）
- **測試層**：Unit / Integration
- **前置條件**：`ob_monthly_run_result` 中 tier_level 全為 NULL（Stage 2 尚未執行）
- **步驟**：在 tier_level 未寫入的狀態下嘗試 Stage 3 分組
- **期望結果**：
  - Stage 3 回傳 0 件分配（tier_level IN ('T1'…'T5') 條件無命中）
  - 或系統拋出可辨識的前置條件錯誤，阻止 Stage 3 執行
  - Stage 3 不製造誤判結果

---

## 二、EMPL — Stage 4 員工比例手算 Oracle（AC-6/7/8/9/14）

> **設計依據**：F101 §4 AC-6/7/8/9/14；AD-E07-29 §2.2（STEP 09 SP 邏輯）/ §3.3（確定性鍵）。
>
> **Stage 4 通用 seed**（接續 DEPT Seed 1，XVF1/OB202606001/T1，AI000 取得 51 件）：
>
> **Seed A（AI000 / T1）**：`ob_empl_set`（list_no=OB202606001, deptid_m='AI000', ration>0）= E1(40) / E2(35) / E3(25)
>
> **手算（AI000 / T1，共 51 件）**：
> - FLOOR：E1=`FLOOR(51×40/100)`=20；E2=`FLOOR(51×35/100)`=17；E3=`FLOOR(51×25/100)`=12；ΣFLOOR=49
> - 剩餘 = 51−49 = 2；① ADD_CNT=`FLOOR(2/3)`=0（不均攤）；② 剩餘 2，`emplid ASC` 前 2 人各 +1 → E1(+1)、E2(+1)
> - 最終：**E1=21, E2=18, E3=12**（Σ=51 ✓）
>
> **Seed B（AM000 / T1）**：`ob_empl_set`（list_no=OB202606001, deptid_m='AM000', ration>0）= F1(50) / F2(30) / F3(20)；AM000 T1 件數=30
>
> **手算（AM000 / T1，共 30 件）**：
> - FLOOR：F1=15；F2=9；F3=6；ΣFLOOR=30
> - 剩餘 = 0；最終：**F1=15, F2=9, F3=6**（Σ=30 ✓，整除，無需補足）
>
> **Seed C（XVE2 / T2，ADD_CNT 均攤觸發）**：電銷課 XVE2 / T2 案件 103 件；`ob_empl_set`（XVE2）= G1(34) / G2(33) / G3(33)
>
> **手算（XVE2 / T2，共 103 件）**：
> - FLOOR：G1=`FLOOR(103×34/100)`=35；G2=`FLOOR(103×33/100)`=33；G3=`FLOOR(103×33/100)`=33；ΣFLOOR=101
> - 剩餘 = 2；① ADD_CNT=`FLOOR(2/3)`=0（不均攤）；② `emplid ASC` 前 2 人各 +1 → G1(+1)、G2(+1)（假設 G1 < G2 < G3 字母序）
> - 最終：**G1=36, G2=34, G3=33**（Σ=103 ✓）
>
> **Seed D（ADD_CNT > 0 觸發情境）**：課 XVE3 / T3，共 13 件；3 員工 H1(34)/H2(33)/H3(33)
>
> **手算（XVE3 / T3，共 13 件）**：
> - FLOOR：H1=`FLOOR(13×34/100)`=4；H2=`FLOOR(13×33/100)`=4；H3=`FLOOR(13×33/100)`=4；ΣFLOOR=12
> - 剩餘 = 1；① ADD_CNT=`FLOOR(1/3)`=0；② 前 1 人 +1 → H1+1
> - 最終：**H1=5, H2=4, H3=4**（Σ=13 ✓）

---

### TS-F101-EMPL-001：Stage 4 員工 FLOOR 比例（Seed A，51 件）

- **相關 AC**：AC-6 / AC-14 / BR-F101-08
- **測試類型**：正向 / 手算 Oracle
- **測試層**：PG Integration
- **前置條件**：Stage 3 完成後 AI000 / T1 案件 = 51 件；Seed A 員工設定（E1=40%、E2=35%、E3=25%）
- **步驟**：執行 Stage 4（empl 分配）；查詢 `emplid` / `emplid_deptid` 分佈
- **期望結果**：
  - E1 件數 = **21**；E2 件數 = **18**；E3 件數 = **12**；合計 = **51**；誤差 = 0
  - 所有 51 件之 `emplid_deptid = 'AI000'`

---

### TS-F101-EMPL-002：整除情況（Seed B，30 件，diff=0）

- **相關 AC**：AC-6 / AC-14 / BR-F101-08/09
- **測試類型**：正向 / 邊界（無差額補足）
- **測試層**：PG Integration
- **前置條件**：Seed B（AM000 / T1，30 件；F1=50%、F2=30%、F3=20%）
- **步驟**：執行 Stage 4；查詢 emplid 分佈
- **期望結果**：
  - F1=**15**；F2=**9**；F3=**6**；合計=**30**；誤差=0
  - 確認：無任何 ADD_CNT 或前 N 補足觸發（ΣFLOOR=30=總數）

---

### TS-F101-EMPL-003：兩階段剩餘補足 — 前 N 各 +1（Seed C，103 件）

- **相關 AC**：AC-7 / AC-14 / BR-F101-09
- **測試類型**：正向（diff=2，前 2 人各 +1）
- **測試層**：PG Integration
- **前置條件**：Seed C（XVE2 / T2，103 件；G1=34%、G2=33%、G3=33%；`emplid ASC` 順序 G1<G2<G3）
- **步驟**：執行 Stage 4 補足；查詢 emplid 分佈
- **期望結果**：
  - G1=**36**；G2=**34**；G3=**33**；合計=**103**；誤差=0
  - 確認：G1 在 `emplid ASC` 排序為第 1，G2 為第 2，兩者各 +1（BR-F101-09 階段②）

---

### TS-F101-EMPL-004：兩次執行結果確定性一致（AC-7 / AC-2）

- **相關 AC**：AC-7 / AC-2 / BR-F101-10 / I-DET-01
- **測試類型**：確定性驗證
- **測試層**：PG Integration
- **前置條件**：Seed C；第一次執行（run_id=R1）完成後，重置並用 run_id=R2 再跑
- **步驟**：
  1. run_id=R1 執行 Stage 4 → 取 (emplid, 件數) 統計
  2. 清除 R1 結果；run_id=R2 重新執行 Stage 4
  3. 取 R2 的 (emplid, 件數) 統計
- **期望結果**：
  - R1 與 R2 的 emplid 件數統計完全相同（同 oracle 數值）
  - 相同案件（`(orgno, appl_no)` 相同）的 `emplid` 也相同（確定性指派）

---

### TS-F101-EMPL-005：simplified is_cr — Y/N 同池，不分流（AC-8）

- **相關 AC**：AC-8 / BR-F101-12
- **測試類型**：負向（CR 優先不發生）
- **測試層**：PG Integration
- **前置條件**：課 XVE3 / T2 案件 100 件（其中 40 件 `is_cr='Y'`、60 件 `is_cr='N'`）；2 員工 J1(60%)/J2(40%)
- **步驟**：執行 Stage 4；查詢 emplid 分佈與 is_cr 值
- **期望結果**：
  - J1 件數 = **60**（FLOOR(100×60/100)=60）；J2 件數 = **40**；合計 = **100**
  - is_cr='Y' 的 40 件**混入**比例池，非優先預指給特定員工
  - `is_cr` 欄位值保持原樣（Y 仍為 Y，N 仍為 N），Stage 4 **不改** is_cr 值
  - **不存在** per-case cr_id→emplid 對應指派行為

---

### TS-F101-EMPL-006：emplid / emplid_deptid 正確寫入（AC-9）

- **相關 AC**：AC-9 / BR-F101-10
- **測試類型**：正向（欄位寫入正確性）
- **測試層**：PG Integration
- **前置條件**：Seed A（AI000 / E1 分得 21 件）
- **步驟**：執行 Stage 4；查 21 件案件之 emplid / emplid_deptid
- **期望結果**：
  - 21 件中每件 `emplid = <E1 的員工代號>`
  - 21 件中每件 `emplid_deptid = 'AI000'`（= Stage 3 寫入之電銷課）

---

### TS-F101-EMPL-007：課有 dept_id 但無員工設定 → emplid NULL + 警告（AC-11）

- **相關 AC**：AC-11 / BR-F101-07 / I-WARNING-CHANNEL
- **測試類型**：負向（無員工 fallback）
- **測試層**：PG Integration
- **前置條件**：Stage 3 後 AI000 / T1 有 51 件；`ob_empl_set WHERE deptid_m='AI000' AND ration>0` = **空集合**
- **步驟**：執行 Stage 4（AI000 / T1）；查詢 emplid 值 + skipped_cases
- **期望結果**：
  - 月名單分派 `status = 'completed'`（**不中斷**）
  - 51 件 `emplid` = NULL（無員工可指派）
  - `skipped_cases.warnings[]` 含：
    ```json
    { "event": "STAGE4_NO_EMPL_WARN", "dept_id": "AI000", "list_no": "OB202606001", "tier_level": "T1", "case_count": 51 }
    ```
  - `warning_summary` 含 `"STAGE4_NO_EMPL_WARN"`

---

### TS-F101-EMPL-008：2 課 × 2 Tier 全矩陣 Oracle 等效性（AC-14）

- **相關 AC**：AC-14 / BR-F101-07/08/09
- **測試類型**：正向 / 手算 Oracle（完整矩陣，2×2×3）
- **測試層**：PG Integration
- **前置條件**：AI000（T1=51件, T2=37件）、AM000（T1=30件, T2=22件）；Seed A 員工設定
- **步驟**：執行 Stage 4 全矩陣；依（deptid_m, tier_level, emplid）GROUP BY
- **期望結果（手算）**：

| deptid_m | tier_level | E1(40%) | E2(35%) | E3(25%) | 合計 |
|---|---|---|---|---|---|
| AI000 | T1 | 21 | 18 | 12 | 51 |
| AI000 | T2 | 15 | 13 | 9 | 37 |

> AI000/T2 手算：FLOOR(37×40/100)=14；FLOOR(37×35/100)=12；FLOOR(37×25/100)=9；Σ=35；diff=2；emplid ASC 前 2 各 +1 → E1=15, E2=13, E3=9（Σ=37 ✓）

| deptid_m | tier_level | F1(50%) | F2(30%) | F3(20%) | 合計 |
|---|---|---|---|---|---|
| AM000 | T1 | 15 | 9 | 6 | 30 |
| AM000 | T2 | 11 | 6 | 4 | 21 |

> AM000/T2 手算：FLOOR(22×50/100)=11；FLOOR(22×30/100)=6；FLOOR(22×20/100)=4；Σ=21；diff=1；emplid ASC 前 1 各 +1 → F1=12, F2=6, F3=4（Σ=22 ✓）

**修正 AM000/T2（diff=1）**：

| deptid_m | tier_level | F1(50%) | F2(30%) | F3(20%) | 合計 |
|---|---|---|---|---|---|
| AM000 | T2 | **12** | **6** | **4** | **22** |

---

### TS-F101-EMPL-009：T5 員工不走分流 ration 邏輯（BR-F101-11）

- **相關 AC**：AC-6 / BR-F101-11
- **測試類型**：正向（T5 員工 prod_type 不影響分配邏輯）
- **測試層**：Unit / PG Integration
- **前置條件**：課 XVE4 / T5 案件 20 件；員工 K1(prod_type='TIER:T5', ration=60%) / K2(prod_type='TIER:T1', ration=40%)
- **步驟**：執行 Stage 4；查詢 emplid 分佈
- **期望結果**：
  - K1 = **12**（FLOOR(20×60/100)=12）；K2 = **8**（FLOOR(20×40/100)=8）；合計=20
  - T5 / T1 標記僅為被動標記，**不影響** ration 計算或分配邏輯
  - 沒有因 prod_type 而走不同 ration 演算法的分支

---

## 三、ASGD — ASSIGNDAY 千分比手算 Oracle（AC-12/16）

> **設計依據**：F101 §4 AC-12/16/17；AD-E07-29 §3.4（ASSIGNDAY 共享路徑）；BR-F101-13/14/15/16/17。
>
> **通用 ASSIGNDAY seed**（延續 EMPL Seed A，E1=21 件）：
> - 當月工作日：20 天（`ob_calendar` 20 筆 `rest_flg='0'`）
> - `calculateDailyEstimate(ym)` 輸出：baseRatio=`FLOOR(1000/20)`=50；remainder=1000 mod 20=0；20 casedt 各 ratioPerMille=50
>
> **手算（E1，21 件，20 工作日）**：
> - per casedt = `FLOOR(21×50/1000)` = 1 件 × 20 casedt = 20 件
> - 最末 casedt 吸收餘額 = 21−20 = 1 → **最末日 2 件，其餘 19 日各 1 件**（Σ=21 ✓）
>
> **手算（E2，18 件，20 工作日，ratioPerMille=50）**：
> - per casedt = `FLOOR(18×50/1000)` = 0 件（全部落入 FLOOR=0）
> - 最末 casedt 吸收餘額 = 18−0 = 18 → **全 18 件落入最末日**
>
> **手算（DIVIDE_LEFT — 跨 Tier 剩餘 round-robin）**：假設 E3（12 件，`FLOOR(12×50/1000)`=0，全 12 件為 DIVIDE_LEFT）；ASSIGN_ORDER 1~12 依 `(tier_level ASC, orgno ASC, appl_no ASC)` 排序；workingDays=20；`((ASSIGN_ORDER−1)%20)+1` → 第 1 件=casedt[0]、第 2 件=casedt[1]、…第 12 件=casedt[11]（round-robin 不超過一圈）

---

### TS-F101-ASGD-001：per-casedt FLOOR + 最末吸收餘額（E1，21 件）

- **相關 AC**：AC-12 / BR-F101-14
- **測試類型**：正向 / 手算 Oracle
- **測試層**：PG Integration
- **前置條件**：E1 分得 21 件；20 工作日（ratioPerMille=50）
- **步驟**：執行 ASSIGNDAY 分配；查詢 E1 之 `(assignday, COUNT(*))` 分佈
- **期望結果**：
  - 19 個工作日各 1 件；最末工作日（`ob_calendar` 最後一筆 `rest_flg='0'` 之日期）= **2 件**
  - 全 21 件 `assignday IS NOT NULL`
  - `SUM(件數)` = 21

---

### TS-F101-ASGD-002：全落末日情境（FLOOR=0，最末吸收全部）

- **相關 AC**：AC-12 / BR-F101-14（最末吸收語意）
- **測試類型**：正向 / 邊界
- **測試層**：PG Integration
- **前置條件**：E2 分得 18 件；20 工作日（ratioPerMille=50）；FLOOR(18×50/1000)=0
- **步驟**：執行 ASSIGNDAY；查詢 E2 之 assignday 分佈
- **期望結果**：
  - 19 個工作日各 **0 件**；最末工作日 = **18 件**（最末吸收全部餘額）
  - 全 18 件 `assignday IS NOT NULL`

---

### TS-F101-ASGD-003：DIVIDE_LEFT round-robin（跨 Tier 剩餘按 ASSIGN_ORDER）

- **相關 AC**：AC-12 / BR-F101-15
- **測試類型**：正向 / 手算 Oracle（round-robin 案件對應）
- **測試層**：PG Integration
- **前置條件**：E3 有 12 件（FLOOR=0，全為 DIVIDE_LEFT）；20 工作日；ASSIGN_ORDER 以 `(tier_level ASC, orgno ASC, appl_no ASC)` per-emplid 排序
- **步驟**：執行 ASSIGNDAY DIVIDE_LEFT；查詢 assignday
- **期望結果**：
  - ASSIGN_ORDER=1 → casedt[0]（第 1 個工作日）
  - ASSIGN_ORDER=2 → casedt[1]（第 2 個工作日）
  - ASSIGN_ORDER=12 → casedt[11]（第 12 個工作日）
  - 全 12 件 `assignday IS NOT NULL`（round-robin 不超過一圈，12 ≤ 20）

---

### TS-F101-ASGD-004：estimate≡run — 共用 calculateDailyEstimate 路徑（AC-16）

- **相關 AC**：AC-16 / BR-F101-16 / I-RUN-EST-01
- **測試類型**：正向（路徑共用性斷言）
- **測試層**：Unit / Integration
- **前置條件**：同一 ym（如 202607）；`ob_calendar` 已植入工作日資料
- **步驟**：
  1. 呼叫 Stage 0 `calculateDailyEstimate('202607')` → 取工作日清單 `days_estimate`
  2. 呼叫 Stage 4 ASSIGNDAY 使用之工作日來源 → 取工作日清單 `days_run`
- **期望結果**：
  - `days_estimate` 與 `days_run` 的日期清單完全一致
  - `ob_calendar` 未變更時各日期 ratioPerMille 相同
  - **不存在** Stage 4 自建一套獨立日曆邏輯（共享同一 `calculateDailyEstimate` 呼叫路徑）

---

### TS-F101-ASGD-005：ob_calendar 無工作日 → assignday NULL + 警告（AC-17）

- **相關 AC**：AC-17 / BR-F101-17 / I-WARNING-CHANNEL
- **測試類型**：負向（無 calendar fallback）
- **測試層**：PG Integration
- **前置條件**：`ob_calendar` 該月（ym='202607'）無任何 `rest_flg='0'` 記錄
- **步驟**：執行 ASSIGNDAY；查詢月名單分派 status + skipped_cases
- **期望結果**：
  - `calculateDailyEstimate` 返回空清單（workingDays=0）
  - 全部案件 `assignday` 保持 NULL
  - 月名單分派 `status = 'completed'`（**不中斷**）
  - `skipped_cases.warnings[]` 含 `{ "event": "ASSIGNDAY_NO_CALENDAR_WARN", "list_no": "<list_no>", "work_ym": "202607" }`
  - `warning_summary` 含 `"ASSIGNDAY_NO_CALENDAR_WARN"`

---

## 四、EQ — JS↔SQL 逐列等價（AC-15，DoD 驗收門檻）

> **設計依據**：F101 §4 AC-15；AD-E07-29 §3.6（dual-path gate）。
>
> **共用測試骨架（給 tdd-implementation）**：對每張代表性名單 `L`，在同一 postgres-test 容器、同一份 seed 資料上：
> 1. 跑 JS `executeV2(runId, L, ym)` → 取 `ob_monthly_run_result` 之四元組集合 `S_js = { (orgno, appl_no, dept_id, emplid, emplid_deptid, assignday) }`。
> 2. 跑 PG SQL 下推路徑（`DB_TYPE='postgres'`）→ 取同一表 `S_sql`。
> 3. **斷言 `S_js` 與 `S_sql` 逐列相同**：`expect(sort(S_sql)).toEqual(sort(S_js))`（以 `(orgno, appl_no)` 為主鍵排序）。
> 4. 確定性保證：因排序鍵全為確定性鍵，**哪幾件落入差額補足**可精確比對（非僅統計件數）。
>
> **覆蓋要求**：代表性名單矩陣須包含以下所有情境各至少一個樣本：
> (a) 多分處 multi-dept；(b) 多 Tier；(c) Stage 3 差額補足觸發（diff>0）；(d) Stage 4 兩階段補足觸發（diff>0，ADD_CNT 均攤或前 N）；(e) 無 ration 課（dept_id NULL fallback）；(f) 無員工課（emplid NULL fallback）；(g) ob_calendar 無資料（assignday NULL fallback）；(h) is_cr Y/N 混合。
>
> **參照現有哈尼斯**：`apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-pushdown.pg.spec.ts`（F100 PG 等價測試），F101 以同架構擴展 Stage 3/4/ASSIGNDAY 之四欄位。

### 代表性名單矩陣（EQ 群組，8 個 list 情境）

| 案例 | 覆蓋情境 | 關鍵 seed 設定 | 驗收重點 |
|---|---|---|---|
| **EQ-001** | 基準（單分處單 Tier，無 fallback） | XVF1/T1/101件；3課有ration；3員工有ration；calendar 20天 | 四元組 JS==SQL；Seed 1 oracle 件數 |
| **EQ-002** | 多分處（2分處 × 1 Tier） | XVF1+XVG1/T1；各有 dept_id 分組 | 兩分處 dept_id 均出現；Stage 3 不退化 |
| **EQ-003** | 多 Tier（1分處 × T1+T2+T3） | 同一名單 3 個 tier；各 tier 獨立 FLOOR | 跨 Tier 件數不混；emplid 分配各自獨立 |
| **EQ-004** | 差額補足觸發（Stage 3 diff>0） | 101件（Seed 1）；diff=1；確認 AI000+1 | 精確哪課取得差額補足（AI000，`obdeptid ASC`） |
| **EQ-005** | Stage 4 兩階段補足（diff>0，ADD_CNT=0+前N） | AI000/T1/51件；E1(40%)/E2(35%)/E3(25%)，diff=2 | E1=21, E2=18, E3=12（Seed A oracle） |
| **EQ-006** | 無 ration 課（dept_id NULL fallback，AC-5） | 某 list_no 在 ob_dept_pct 無記錄 | dept_id NULL 案件在 JS 與 SQL 均 NULL |
| **EQ-007** | 無員工課（emplid NULL fallback，AC-11） | AI000 有 dept_id 但 ob_empl_set 無員工 | emplid NULL 案件在 JS 與 SQL 均 NULL；警告出現 |
| **EQ-008** | is_cr Y/N 混合 + ob_calendar 有資料 | 100件（40件 is_cr='Y'，60件 is_cr='N'）；20工作日 | is_cr 不影響 emplid 分配；assignday 均非 NULL |

---

### TS-F101-EQ-001：基準 list 逐列等價（EQ-001）

- **相關 AC**：AC-15 / BR-F101 整體 / I-DET-01
- **測試類型**：正向 / DoD 驗收
- **測試層**：PG Integration（**強制 Postgres**）
- **前置條件**：EQ-001 seed（XVF1/OB202606001/T1/101件；3課；3員工；20工作日）
- **步驟**：
  1. 同一 postgres-test 容器，同一 seed
  2. 跑 JS `executeV2`（`DB_TYPE` 非 postgres）→ 取四元組 `S_js`
  3. 跑 PG SQL 下推（`DB_TYPE='postgres'`）→ 取四元組 `S_sql`
  4. 比對 `sort(S_sql) toEqual sort(S_js)` 以 (orgno, appl_no) 排序
- **期望結果**：
  - `S_js` 與 `S_sql` 四元組（dept_id, emplid, emplid_deptid, assignday）**逐列完全相同**
  - dept_id 分佈 = Seed 1 oracle（AI000=51, AM000=30, B0000=20）
  - emplid 分佈 = Seed A oracle（E1=21, E2=18, E3=12 於 AI000/T1）
  - assignday 分佈 = 19日各1件 + 末日2件（E1 手算）

---

### TS-F101-EQ-002 ~ EQ-008

（其餘 7 個 EQ 案例使用上述矩陣各對應情境，每案固定 seed → JS 與 SQL 逐列 toEqual；此處不逐一展開步驟，結構與 EQ-001 完全相同，僅 seed / 覆蓋情境不同。tdd-implementation 依矩陣補完各案。）

---

## 五、IDEM — 重跑安全與冪等（AC-4）

> **設計依據**：F101 §4 AC-4；AD-E07-29 §3.5（Stage 3 清除）/ §4 OQ-F101-04。

### TS-F101-IDEM-001：Stage 3 前清除 dept_id/emplid/assignday，is_cr 保留（AC-4）

- **相關 AC**：AC-4 / BR-F101-06 / I-IDEM-01
- **測試類型**：正向（重跑安全）
- **測試層**：PG Integration
- **前置條件**：
  1. 第一次月名單分派（run_id=R1）完成，ob_monthly_run_result 有 dept_id / emplid / assignday 值
  2. 某些案件 is_cr='Y'
- **步驟**：
  1. 觸發同月份第二次月名單分派（run_id=R2）
  2. 驗證 Stage 3 開始前（Stage 3 清除 UPDATE 後）之 ob_monthly_run_result 狀態
  3. 驗證 Stage 3/4 完成後結果
- **期望結果**：
  - Stage 3 開始前：`dept_id = NULL`、`emplid = NULL`、`assignday = NULL`（已清除）
  - Stage 3 開始前：`is_cr` 值保持**原樣**（Y 仍 Y，N 仍 N）
  - R2 完成後四元組 = R1 完成後四元組（相同種子 → 相同結果）

---

### TS-F101-IDEM-002：兩次不同 run_id 四元組集合完全相同（AC-2）

- **相關 AC**：AC-2 / BR-F101-04/10/15 / I-DET-01
- **測試類型**：確定性驗證（兩次執行結果一致）
- **測試層**：PG Integration
- **前置條件**：固定 seed（ob_dept_pct / ob_empl_set / ob_calendar / Stage 2 輸出不變）；R1 與 R2 使用不同 run_id
- **步驟**：
  1. run_id=R1 完成 Stage 3/4/ASSIGNDAY → 取 `(orgno, appl_no, dept_id, emplid, emplid_deptid, assignday)` 集合 S1
  2. 清除 R1；run_id=R2 完成 Stage 3/4/ASSIGNDAY → 取 S2
  3. 比對 `sort(S1) toEqual sort(S2)`
- **期望結果**：S1 = S2（逐列完全相同，包含四元組的**精確值**）

---

### TS-F101-IDEM-003：per-list auto-commit 可中斷邊界（I-IDEM-01 延伸）

- **相關 AC**：AC-4 / I-IDEM-01
- **測試類型**：冪等（list 間中斷後重跑）
- **測試層**：PG Integration
- **前置條件**：2 張名單（L1 / L2）；L1 完成後模擬中斷（L2 未執行）
- **步驟**：重新觸發，L1 重跑（Stage 3 清除語意），L2 正常執行
- **期望結果**：
  - L1 重跑後結果與第一次 L1 結果相同
  - L2 結果正確（不受 L1 重跑影響）
  - 月名單分派最終 status = completed

---

## 六、FALL — Fallback / 警告通道（AC-5/11/17）

> 警告格式依 AD-E07-29 §4 OQ-F101-05 裁示：`assignment_run.skipped_cases.warnings[]`（JSONB）+ `warning_summary`（VARCHAR 100）。

### TS-F101-FALL-001：STAGE3_NO_DEPT_RATION — 無 ration 記錄

（已於 DEPT 群組 TS-F101-DEPT-007 覆蓋，此處標記 cross-reference。）

---

### TS-F101-FALL-002：STAGE4_NO_EMPL_WARN — 課有案件但無員工

（已於 EMPL 群組 TS-F101-EMPL-007 覆蓋，cross-reference。）

---

### TS-F101-FALL-003：ASSIGNDAY_NO_CALENDAR_WARN — 無工作日記錄

（已於 ASGD 群組 TS-F101-ASGD-005 覆蓋，cross-reference。）

---

### TS-F101-FALL-004：多類型警告同時發生（Stage 3 + Stage 4 + ASSIGNDAY 同一 run）

- **相關 AC**：AC-5 / AC-11 / AC-17
- **測試類型**：負向（複合 fallback）
- **測試層**：PG Integration
- **前置條件**：
  - 名單 L1：`ob_dept_pct` 無 ration → STAGE3_NO_DEPT_RATION
  - 名單 L2：ob_empl_set 無員工 → STAGE4_NO_EMPL_WARN
  - 名單 L3：ob_calendar 無工作日 → ASSIGNDAY_NO_CALENDAR_WARN
- **步驟**：執行含 L1/L2/L3 的月名單分派；查詢 skipped_cases + warning_summary + status
- **期望結果**：
  - 月名單分派 `status = 'completed'`（全程不中斷）
  - `skipped_cases.warnings[]` 含三類事件碼（各一筆以上）
  - `warning_summary` 含 `"STAGE3_NO_DEPT_RATION|STAGE4_NO_EMPL_WARN|ASSIGNDAY_NO_CALENDAR_WARN"`
  - 對應 null 欄位：dept_id NULL / emplid NULL / assignday NULL（不寫錯值）

---

### TS-F101-FALL-005：skipped_cases.warnings[] 與既有 cases 鍵不衝突

- **相關 AC**：AC-5/11/17（警告通道設計）
- **測試類型**：回歸（JSONB 結構合并）
- **測試層**：PG Integration
- **前置條件**：月名單分派已有 `skipped_cases = { "cases": [...] }`（先前其他步驟寫入）；F101 寫入 warnings
- **步驟**：檢查月名單分派完成後 `skipped_cases` JSONB 結構
- **期望結果**：
  - `skipped_cases.cases` 陣列保持原值（不被覆蓋）
  - `skipped_cases.warnings` 為新增子鍵（JSONB merge，非覆蓋）
  - 兩個子鍵共存於同一 JSONB 欄位

---

### TS-F101-FALL-006：警告不寫 assignment_audit_log（I-WARNING-CHANNEL 邊界）

- **相關 AC**：AC-5/11/17 / I-WARNING-CHANNEL
- **測試類型**：負向（audit_log 不汙染）
- **測試層**：PG Integration
- **前置條件**：觸發 STAGE3_NO_DEPT_RATION 警告
- **步驟**：月名單分派完成後查詢 `assignment_audit_log WHERE action IN ('STAGE3_NO_DEPT_RATION', 'STAGE4_NO_EMPL_WARN', 'ASSIGNDAY_NO_CALENDAR_WARN')`
- **期望結果**：查詢結果 = **空集合**（警告不寫 audit_log，僅寫 skipped_cases/warning_summary）

---

## 七、REG — 回歸保護（AC-10 / I-NO-ST4-EXCHANGE）

### TS-F101-REG-001：有 dept_id 且有員工設定的案件 emplid 不為 NULL（AC-10，Bug C 防護）

- **相關 AC**：AC-10 / BR-F101-07/10
- **測試類型**：回歸保護（OB202606001 型 defaultEmpl=null 缺陷防護）
- **測試層**：PG Integration
- **前置條件**：Stage 4 完成；種子含有 dept_id 且對應課有 ob_empl_set 員工的案件
- **步驟**：執行以下查核查詢
  ```sql
  SELECT COUNT(*) FROM ob_monthly_run_result
  WHERE run_id = :runId
    AND dept_id IS NOT NULL
    AND dept_id IN (
      SELECT DISTINCT deptid_m FROM ob_empl_set
      WHERE list_no = :listNo AND ration > 0
    )
    AND emplid IS NULL
  ```
- **期望結果**：查詢結果 = **0**（有員工設定的課，案件的 emplid 不可為 NULL）

---

### TS-F101-REG-002：no-st4-exchange — senior swap 不發生（I-NO-ST4-EXCHANGE）

- **相關 AC**：AC-2 / I-NO-ST4-EXCHANGE（AD-E07-29 §4 OQ-F101-02）
- **測試類型**：回歸（廢除 F100 10% senior swap）
- **測試層**：PG Integration
- **前置條件**：
  - 種子包含 T3 員工（`ob_empl_set.prod_type = 'TIER:T3'`）
  - T1/T2 案件共 100 件；T3（senior）員工 S1（ration=30%）
  - 如有 st4_exchange：T1/T2 案件的 10% 會交換給 S1 → S1 應得至少 10 件超出 ration
- **步驟**：執行 Stage 4；查詢 S1 的 emplid 件數
- **期望結果**：
  - S1 件數 = **FLOOR(其課件數 × 30/100) + 差額補足**（純 ration 結果）
  - S1 件數 **不等於** FLOOR + 10%（10% swap 不發生）
  - T3 員工不存在任何特殊待遇（prod_type 為被動標記，BR-F101-11）

---

### TS-F101-REG-003：emplid 分配來源純為 ration，不含任何 swap 邏輯

- **相關 AC**：I-NO-ST4-EXCHANGE / BR-F101-11
- **測試類型**：回歸（确認 runStage4Sql 中 senior swap CTE 已移除）
- **測試層**：Unit（行為斷言）
- **前置條件**：執行 Stage 4 PG 路徑
- **步驟**：
  1. 擷取 EXPLAIN 或查看 SQL 結構（或以行為驗證：T3 員工在 T1/T2 ration 池中無超額件數）
  2. 確認無 `seniorEmplid` / `defaultEmplid` / `10%` / `CEIL` / `senior swap` 相關邏輯路徑
- **期望結果**：
  - T1/T2 案件的 emplid 分配不包含「轉給 T3 senior」的行為
  - `runStage4Sql` 不存在 senior swap CTE（靜態代碼層由 DET-003 守）

---

### TS-F101-REG-004：is_cr 值不被 Stage 4 修改（is_cr 為被動標記）

- **相關 AC**：AC-8 / BR-F101-12
- **測試類型**：回歸（is_cr 不改值）
- **測試層**：PG Integration
- **前置條件**：種子含 `is_cr='Y'` 與 `is_cr='N'` 各若干件
- **步驟**：Stage 3/4 完成後，查詢各案件 is_cr 值
- **期望結果**：
  - 所有案件的 `is_cr` 值與 Stage 2 完成後（Stage 3 前）值完全相同
  - Stage 3/4 執行**不改** is_cr 欄位值（UPDATE 清除動作不清 is_cr，BR-F101-06/12 ✓）

---

### TS-F101-REG-005：Stage 3/4 設定 dept_id/emplid/assignday 不影響 is_cr 保留（同 IDEM-001，cross-reference）

（IDEM-001 已涵蓋，此處標記 cross-reference。）

---

## 八、DET — 確定性靜態掃描（AC-2 / I-DET-01 / AC-18）

> **設計依據**：F101 §4 AC-2/18；AD-E07-29 §3.3（I-DET-01）。靜態掃描為純 grep，無需 DB。

### TS-F101-DET-001：Stage 3/4/ASSIGNDAY 全程無亂數函式（I-DET-01）

- **相關 AC**：AC-2 / I-DET-01
- **測試類型**：靜態掃描（Static Analysis）
- **測試層**：Unit（靜態）
- **前置條件**：F101 新增 / 修改之檔案（stage2to4-sql-builder.ts / executor.ts / assignment-run-pipeline.service.ts 等）
- **步驟**：對 F101 修改範圍之 TypeScript 檔案執行以下 grep：
  - `grep -rE "NEWID\(\)|Math\.random\(\)|ORDER BY RANDOM\(\)|crypto\.randomUUID\(\)" <F101-files>`
- **期望結果**：命中數 = **0**（全程無亂數）

---

### TS-F101-DET-002：ob_assign_set 無引用（AC-18）

- **相關 AC**：AC-18 / BR-F101-18
- **測試類型**：靜態掃描
- **測試層**：Unit（靜態）
- **前置條件**：F101 新增 / 修改之檔案
- **步驟**：執行以下 grep：
  - `grep -rE "ob_assign_set|ObAssignSet|OBASSIGNSET" <F101-files>`
- **期望結果**：命中數 = **0**（F101 程式碼無任何 ob_assign_set 引用）

---

### TS-F101-DET-003：runStage4Sql 中 senior swap CTE 已移除（I-NO-ST4-EXCHANGE 靜態面）

- **相關 AC**：I-NO-ST4-EXCHANGE / BR-F101-11
- **測試類型**：靜態掃描
- **測試層**：Unit（靜態）
- **前置條件**：F101 修改後的 stage2to4-sql-builder.ts / executor.ts
- **步驟**：執行以下 grep：
  - `grep -rE "seniorEmplid|defaultEmplid|senior.*swap|10.*percent|0\.1\b|Math\.ceil.*0\.1|CEIL.*0\.1" <F101-files>`
  - `grep -rE "st4_exchange|seniorEmpls" <F101-files>`
- **期望結果**：命中數 = **0**（senior swap / st4_exchange 邏輯完全移除）

---

## 九、UPGR — 分派差異報告 + 業務驗收（NFR-005）

> **設計依據**：F101 §9（Production 分派變化知會）；AD-E07-29 OQ-F101-02 Production 行為變化聲明。上線前**硬性前置**（NFR-005）。

### TS-F101-UPGR-001：比例分派 vs placeholder 分派差異報告產生

- **測試類型**：Integration + 人工
- **測試層**：PG Integration（報告自動）+ 人工驗收
- **前置條件**：代表性名單以 F101（比例分派）執行一次；同一名單以 placeholder 邏輯（dept[0] + defaultEmpl）記錄舊分佈（或以 F067 對比工具）
- **步驟**：
  1. 跑 F101 比例分派結果
  2. 輸出 `(dept_id, emplid, assignday)` 件數分佈報告
  3. 與 placeholder 分佈比對（使用 F067 compare-run-results 工具）
- **期望結果**：
  - 差異報告成功產生（非空）
  - dept_id 從 「全部 = dept[0]」→「多課按比例分佈」（分佈應顯著差異）
  - emplid 從「全部 = defaultEmplid 或 NULL」→「多員工按比例分佈」
  - assignday 從「全部 NULL」→「20 個工作日分散分佈」

---

### TS-F101-UPGR-002：業務驗收 — 部門件數比例符合 ob_dept_pct 設定

- **測試類型**：人工驗收（業務知會）
- **測試層**：人工
- **步驟**：業務人員對照 `ob_dept_pct.ration` 設定，確認各課實際件數占比在合理誤差內（FLOOR 誤差最大 ±1/總數）
- **期望結果**：業務驗收簽核，確認分派比例符合設定意圖

---

### TS-F101-UPGR-003：業務驗收 — 員工件數比例符合 ob_empl_set 設定

- **測試類型**：人工驗收
- **測試層**：人工
- **步驟**：業務人員對照各課 `ob_empl_set.ration` 設定，確認各員工實際件數占比合理
- **期望結果**：業務驗收簽核

---

### TS-F101-UPGR-004：assignday 工作日分散性驗收

- **測試類型**：Integration（自動）
- **測試層**：PG Integration
- **步驟**：
  1. 查詢 `SELECT assignday, COUNT(*) FROM ob_monthly_run_result WHERE run_id=:runId AND assignday IS NOT NULL GROUP BY assignday ORDER BY assignday`
  2. 驗證 assignday 出現的日期均屬 ob_calendar.rest_flg='0' 的工作日
  3. 驗證最末工作日的件數 = 基本 FLOOR 件數 + 各員工餘額（最末吸收）
- **期望結果**：
  - assignday 只包含工作日（無假日或 NULL 當 calendar 有資料）
  - 各工作日件數分佈符合 ASSIGNDAY oracle 邏輯

---

## 十、測試資料策略

### 種子資料工廠原則

| 資料表 | 關鍵設定 | 注意事項 |
|---|---|---|
| `ob_pool_data` | `dept_id`（分處）= 'XVF1' / 'XVG1'；`orgno` / `appl_no` 為確定性排序主鍵 | Stage 3 JOIN 依據（orgno, appl_no）；不含 tier_level 欄 |
| `ob_monthly_run_result` | `tier_level` 由 Stage 2 寫入（T1~T5 精確字串，無變體）；`is_cr` = 'Y'/'N' 各若干 | Stage 3 必在 tier_level 寫入後執行（I-PIPELINE-STAGE-ORDER） |
| `ob_dept_pct` | `list_no` = 案件所屬 list_no（per-list，非 MIN(LIST_NO)）；`ration` numeric(9,2)；ΣRATION=100（建議）| 測試須包含 ration=0 過濾（BR-F101-02）與全部缺席情境 |
| `ob_empl_set` | `list_no` per-list；`deptid_m` = Stage 3 寫入的電銷課代碼；`ration` numeric(10,2)；`prod_type='TIER:T*'` 被動標記 | 測試須包含全部缺席情境（STAGE4_NO_EMPL_WARN） |
| `ob_calendar` | `calendar_date`；`rest_flg='0'` = 工作日；工作日數影響 ratioPerMille 計算 | 測試須包含該月全無工作日情境（ASSIGNDAY_NO_CALENDAR_WARN） |

### 邊界值設計

| 邊界場景 | 輸入值 | 期望行為 |
|---|---|---|
| Stage 3 diff=0（整除） | 40件 × 50/30/20，ΣFLOOR=40 | 無差額補足，件數精確 |
| Stage 3 diff=1（前 1 課 +1） | 101件 × 50/30/20，diff=1 | AI000（obdeptid ASC 最小）+1 |
| Stage 3 diff=2（前 2 課 +1） | 73件 × 50/30/20，diff=2 | AI000(+1)、AM000(+1) |
| Stage 4 ADD_CNT=0，前 N 補足 | 51件 × 40/35/25，diff=2，ADD_CNT=FLOOR(2/3)=0 | 前 2 員工各 +1 |
| Stage 4 ADD_CNT>0 | 13件 × 34/33/33，diff=1，ADD_CNT=FLOOR(1/3)=0 | 前 1 員工 +1 |
| ASSIGNDAY 最末吸收全部 | 18件 × 20工作日，FLOOR(18×50/1000)=0 | 全 18 件落末日 |
| DIVIDE_LEFT 不超 workingDays | 12件 DIVIDE_LEFT，workingDays=20 | ASSIGN_ORDER 1~12 → casedt[0]~[11] |

### 環境依賴

| 依賴項 | 影響場景 | 策略 |
|---|---|---|
| Postgres Test Container | EQ / DEPT / EMPL / ASGD / IDEM / FALL / REG 群組（44案例） | 沿用 `docker-compose.test.yml` postgres-test 容器（F098/F099/F100 慣例） |
| CI 序列執行 | F101 pg.spec + F098/F099/F100 pg.spec 共用 cdmp_test DB | CI pipeline 必須序列：`--runInBand` 或分 step 執行，禁並行 |
| ob_calendar ETL | ASGD 群組需真實 calendar 資料 | 測試 seed 直接寫入 ob_calendar，不依賴 E07-OBCALENDAR-Load ETL 執行時機 |
| UTF-16LE SP | SP 解碼對照分析 | `node -e "require('fs').readFileSync(path).toString('utf16le')"` 解碼，僅用英文版主檔 |

---

## 十一、測試覆蓋追溯矩陣

| AC ID | 描述 | 覆蓋案例 | 群組 |
|---|---|---|---|
| AC-1 | 三維分組 + FLOOR + 確定性差額補足 | DEPT-001/002/003/004/006 | DEPT |
| AC-2 | 確定性可重現（不同 run_id 相同結果） | DEPT-004、EMPL-004、IDEM-002、DET-001 | DEPT/EMPL/IDEM/DET |
| AC-3 | 多分處不退化（OB202606001 回歸） | DEPT-005 | DEPT |
| AC-4 | Stage 3 前清除（重跑安全）、is_cr 保留 | IDEM-001、IDEM-002 | IDEM |
| AC-5 | 無 ration → dept_id NULL + 警告 | DEPT-007、FALL-001（ref）、FALL-004 | DEPT/FALL |
| AC-6 | 課內員工 FLOOR 比例 | EMPL-001/002 | EMPL |
| AC-7 | 兩階段剩餘補足（確定性） | EMPL-003、EMPL-004 | EMPL |
| AC-8 | simplified is_cr — Y/N 同池 | EMPL-005、REG-004 | EMPL/REG |
| AC-9 | 寫入 emplid / emplid_deptid | EMPL-006 | EMPL |
| AC-10 | 回歸保護 — 有 dept_id + empl_set → emplid≠NULL | REG-001 | REG |
| AC-11 | 無員工 → emplid NULL + 警告 | EMPL-007、FALL-002（ref）、FALL-004 | EMPL/FALL |
| AC-12 | ASSIGNDAY 千分比 + 最末吸收 + DIVIDE_LEFT | ASGD-001/002/003 | ASGD |
| AC-13 | Stage 3 手算 oracle（2分處×2Tier×3課） | DEPT-001/002/003/004 | DEPT |
| AC-14 | Stage 4 手算 oracle（2課×2Tier×3員工） | EMPL-001/002/003/008 | EMPL |
| AC-15 | JS↔SQL 逐列等價（DoD 門檻） | EQ-001~008 | EQ |
| AC-16 | estimate≡run 一致性 | ASGD-004 | ASGD |
| AC-17 | ob_calendar 無資料 → assignday NULL + 警告 | ASGD-005、FALL-003（ref）、FALL-004 | ASGD/FALL |
| AC-18 | ob_assign_set 無引用 | DET-002 | DET |
| I-DET-01 | 全程無亂數 | DET-001 | DET |
| I-NO-ST4-EXCHANGE | senior swap 不發生 | REG-002、REG-003、DET-003 | REG/DET |
| I-WARNING-CHANNEL | 警告寫 skipped_cases/warning_summary，不寫 audit_log | FALL-001~006 | FALL |
| I-IDEM-01 | 重跑冪等 | IDEM-001/002/003 | IDEM |
| I-PIPELINE-STAGE-ORDER | Stage 2→3→4 順序不變式 | DEPT-008 | DEPT |
| I-DEPT-EMPL-SEPARATION | Stage 3 ⊥ Stage 4（不因員工存在性調整配額） | DEPT-005 | DEPT |
| NFR-005 | Production 分派差異報告 + 業務驗收 | UPGR-001/002/003/004 | UPGR |

---

## 十二、風險與待決問題

### 測試設計層風險

| 風險 | 等級 | 緩解策略 |
|---|---|---|
| JS↔SQL 等價失敗（FLOOR 邊界、per-list scope 差異） | 高 | EQ-001~008 為 DoD 門檻；所有 EQ 案例在 PG 真庫逐列 toEqual；未過不上線 |
| ob_calendar ETL 未在月名單分派前執行 → assignday 全 NULL | 中 | ASGD-005 fallback 測試驗證不中斷行為；seed 直接寫 ob_calendar 不依賴 ETL 時機 |
| skipped_cases JSONB merge 衝突（warnings 與 cases 鍵） | 低 | FALL-005 明確驗證兩鍵共存；tdd 實作時使用 JSONB 合并（非覆蓋） |
| F101 測試修改 F100 st4_exchange 行為 | 中 | REG-002/003/DET-003 確認 senior swap 完全移除；EMPL 群組全以 oracle 手算（非 F100 baseline）驗收 |
| CI 並行執行 DB 衝突 | 高 | 明確要求 `--runInBand` 或分 step 序列執行 F098/F099/F100/F101 pg.spec |

### 開放問題（已全部解決）

所有 F101 OQ（OQ-F101-01~05）已於 AD-E07-29 全部裁定，**本測試設計無待確認開放問題**。tdd-implementation 可直接據此落地。
