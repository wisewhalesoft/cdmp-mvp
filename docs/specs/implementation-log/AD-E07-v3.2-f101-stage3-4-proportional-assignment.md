---
type: architecture-decision
decision_id: AD-E07-29
title: F101 月名單分派 Stage 3/4 真實比例分派（dept ration + empl ration + ASSIGNDAY 確定性設計）
status: proposed
last_updated: 2026-06-05
oq_resolved: [OQ-F101-01, OQ-F101-02, OQ-F101-03, OQ-F101-04, OQ-F101-05]
oq_open: []
covers: [F101]
supersedes_partial: [AD-E07-28]
related: [AD-E07-28, AD-E07-27, AD-E07-26, AD-E07-25]
source_stories: [US-145, US-146, US-149, US-150, US-151]
---

# AD-E07-29　F101 月名單分派 Stage 3/4 真實比例分派

> 本決策記錄為架構設計產出，**不含 production / test 程式碼**。落地由 spec-writer（feature spec）、
> test-designer（測試策略）、tdd-implementation（實作）後續承接。

## 1. 問題陳述（Problem Statement）

現行 `runStage4Sql`（`stage2to4-sql-executor.ts`）為 P3 placeholder：

1. **全部案件指向 dept[0] 唯一課**（`ob_dept_pct` 第一筆 `obdeptid`），不依比例分配。
2. **全部案件指向 `defaultEmplid`**（`ob_empl_set` 取第一位非 T3 員工），不依比例分配。
3. 當 dept[0]（如 AI000）在 `ob_empl_set` 無任何員工設定時，`defaultEmplid = null` → 全部案件
   `emplid = NULL`（**Bug C**，已於 OB202606001 名單驗證）。
4. `assignday` 恆 `NULL`（Stage 1 INSERT 已寫 NULL，Stage 4 placeholder 未填）。

本 AD 以 legacy SP（`st2_dept` / `st3_emplid`，已 UTF-16LE 解碼）基底算法取代上述 placeholder，
並解析 5 個 F101 spec Open Questions。

## 2. 已確認的 SP 行為（UTF-16LE 解碼後對照分析）

### 2.1 st2_dept SP — Stage 3（部門分配）核心邏輯

```
#DEPT：GROUP BY (DEPT_ID, LIST_NO, TIER_LEVEL)  →  各分組件數 CNT
#RATION：JOIN #DIST_RATION (OBDEPTID, RATION, FLOOR(CNT*RATION/100) AS OB_DEPT_CNT)
差額補足（游標 cur_dept）：DIFF = CNT - ΣFLOOR → ORDER BY NEWID()（亂數）取前 DIFF 課各 +1
案件指派（游標 cur_assign）：ORDER BY NEWID()（亂數）取前 OB_DEPT_CNT 件 → 寫 OB_DEPT
```

**F101 對應**：NEWID() 全部以確定性鍵取代（OQ-F101-01）；CR 優先預指邏輯整段移除（BR-F101-12）；
`ob_dept_pct` 查詢鍵由 SP 的 `MIN(LIST_NO)` 改為案件所屬 `list_no`（per-list，BR-F101-02）。

### 2.2 st3_emplid SP — Stage 4（員工分配 + ASSIGNDAY）核心邏輯

```
STEP 02：#DEPTID_EMPLID_RATION (EMPLID, RATION, DEPTID_M)
STEP 09-1-1：CNT_ORIGIN = FLOOR(@r_APPL_TOTAL * RATION / 100)
STEP 09-1-2：@r_LEFT_CNT = @r_APPL_TOTAL - Σ CNT_ORIGIN
STEP 09-1-3：@r_ADD_CNT  = @r_LEFT_CNT / @count（員工數）；若>0 每人 +ADD_CNT，重算 LEFT
STEP 09-1-4：SEQ<=@r_LEFT_CNT 之員工各 +1（ORDER BY NEWID() → F101 改確定性）
STEP 09-5  ：依 CNT_FINAL 循序 TOP(@r_EMPLID_COUNTS) 分配案件（ORDER BY SEQ = NEWID()）
STEP 10    ：EMP_ORD = ROW_NUMBER() OVER (PARTITION BY EMPLID ORDER BY NEWID())
STEP 11    ：per casedt = FLOOR(M_EMP_ORD * ratio_rate / 1000) + CNT_already（累進）；最末吸收
STEP 13    ：DIVIDE_LEFT → ASSIGN_ORDER = ROW_NUMBER() OVER (PARTITION BY EMPLID ORDER BY TIER_LEVEL, EMP_ORD)
             ASSIGNDAY = SEQ((ASSIGN_ORDER-1)%@WORKDAYS+1) → round-robin
```

STEP 02 `ob_empl_set` 查詢鍵由 SP 的 `MIN(LIST_NO, PROD_KIND)` 改為案件所屬 `list_no`（BR-F101-07）；
CR 相關 STEP（CNT_CR 計算、超額隨機移除）整段移除（BR-F101-12）；
ASSIGNDAY 日曆來源由 `OBASSIGNSET` 改為 `ob_calendar` + `calculateDailyEstimate`（BR-F101-13/18）；
NEWID() 全部以確定性鍵取代（OQ-F101-01）。

### 2.3 st4_exchange SP — 關鍵發現（OQ-F101-02 決策依據）

st4_exchange SP 開頭有以下**硬編碼停用邏輯**：

```sql
IF @LIST_YEAR_MONTH >= '202408'
BEGIN
    PRINT '202408起停止交換'
    RETURN
END
```

**結論**：st4_exchange（課長主任 T1/T2/T3 案件 ↔ 專員 T32/T4 案件雙向交換）**自 2024 年 8 月起已
永久停用**，現行 production 月名單分派從未執行交換邏輯。F100 P3 中以 `runStage4Sql` 實作的 10% senior swap
是對一個**已死碼（dead code）** legacy SP 的近似複刻，其 production 意義已消失。

## 3. 目標架構設計

### 3.1 Pipeline 執行順序不變式（延伸 I-PIPELINE-01）

```
Stage 1 → Stage 2（計分+tier） → Stage 3（dept ration） → Stage 4（empl ration + ASSIGNDAY）
```

此順序為**強制前置條件鏈**（C-1，BR-F101-01）：Stage 3 依賴 `ob_monthly_run_result.tier_level`
（Stage 2 輸出）；Stage 4 依賴 `ob_monthly_run_result.dept_id`（Stage 3 輸出）；ASSIGNDAY 依賴
`ob_monthly_run_result.emplid`（Stage 4 員工分配輸出）。**任何跳過或亂序執行皆為錯誤。**

### 3.2 Schema Gap G-1 — tier_level 來源裁示

`ob_pool_data` 無 `tier_level` 欄位。Stage 3 三維分組之 `tier_level` **讀 `ob_monthly_run_result`**
（Stage 2 已寫入），分處（`dept_id`）讀 `ob_pool_data`（Stage 1 寫入時帶入 result 時以 JOIN 取得）。

Stage 3 set-based SQL 骨架：

```sql
-- Stage 3 分組：GROUP BY ob_pool_data.dept_id, r.list_no, r.tier_level
-- 其中 dept_id 需從 ob_pool_data JOIN 取得（r JOIN ob_pool_data o ON r.orgno=o.orgno AND r.appl_no=o.appl_no）
WITH grouped AS (
    SELECT o.dept_id, r.list_no, r.tier_level,
           COUNT(*)                               AS group_cnt,
           d.obdeptid, d.ration,
           FLOOR(COUNT(*) * d.ration / 100)       AS floor_cnt,
           ROW_NUMBER() OVER (
               PARTITION BY o.dept_id, r.list_no, r.tier_level
               ORDER BY d.obdeptid ASC            -- OQ-F101-01 確定性鍵
           )                                      AS dept_seq
    FROM ob_monthly_run_result r
    JOIN ob_pool_data o ON o.orgno = r.orgno AND o.appl_no = r.appl_no
    JOIN ob_dept_pct d ON d.list_no = r.list_no AND d.ration > 0
    WHERE r.run_id = :runId AND r.tier_level IN ('T1','T2','T3','T4','T5')
),
remainder AS (
    SELECT dept_id, list_no, tier_level,
           group_cnt - SUM(floor_cnt) OVER (PARTITION BY dept_id, list_no, tier_level) AS diff
    FROM grouped GROUP BY dept_id, list_no, tier_level, group_cnt
),
final_quota AS (
    SELECT g.*, g.floor_cnt + CASE WHEN g.dept_seq <= r.diff THEN 1 ELSE 0 END AS final_cnt
    FROM grouped g JOIN remainder r USING (dept_id, list_no, tier_level)
)
-- 案件指派（ROW_NUMBER per 分組，取前 final_cnt 件，ORDER BY orgno, appl_no）
```

> tdd-implementation 依此骨架補完；精確 SQL 由 PG 等價測試驗收（AC-15 DoD）。

### 3.3 確定性排序鍵（OQ-F101-01 裁示）

| 排序場景 | 確定性鍵 | 說明 |
|---------|---------|------|
| Stage 3 差額補足（課 +1 順序） | `obdeptid ASC` | 電銷課代碼字母升冪，穩定且無 NULL |
| Stage 3 案件指派（各課取件順序） | `(orgno ASC, appl_no ASC)` | 對齊 Stage 1 OQ-06 先例（`ORDER BY orgno, appl_no`，OQ-AD28-06） |
| Stage 4 差額補足——前 N 各 +1（員工 +1 順序） | `emplid ASC` | 員工代碼字母升冪，穩定且無 NULL |
| Stage 4 案件指派（各員工取件順序） | `(orgno ASC, appl_no ASC)` | 同 Stage 1 OQ-06 先例 |
| Stage 4 ASSIGNDAY EMP_ORD | `ROW_NUMBER() OVER (PARTITION BY emplid ORDER BY orgno ASC, appl_no ASC)` | per-emplid partition，確定性散佈 |
| DIVIDE_LEFT ASSIGN_ORDER | `ROW_NUMBER() OVER (PARTITION BY emplid ORDER BY tier_level ASC, orgno ASC, appl_no ASC)` | 對齊 SP STEP 13 之 `TIER_LEVEL, EMP_ORD` 語意；`tier_level ASC` 確保跨 Tier 順序 |

**不變式 I-DET-01**：Stage 3/4/ASSIGNDAY 全程不存在 `NEWID()` / `Math.random()` /
`ORDER BY RANDOM()` / `crypto.randomUUID()`。test-designer 須以靜態掃描 AC（AC-2）守住。

### 3.4 Stage 4 ASSIGNDAY — calculateDailyEstimate 共享路徑

ASSIGNDAY 計算複用既有 `Stage0EstimateService.calculateDailyEstimate(ym)`（F049，`ob_calendar` +
`rest_flg='0'` 工作日），不另建邏輯（BR-F101-13/16，US-151 AC-2）。

**不變式 I-RUN-EST-01（延伸）**：月名單分派 Stage 4 ASSIGNDAY 日曆來源 = Stage 0 試算日曆來源，同一份
`calculateDailyEstimate(ym)` 呼叫結果；`ob_calendar` 未變更時兩者比例一致。

```
per casedt：FLOOR(員工總件數 × ratioPerMille / 1000)
最末 casedt：吸收所有 FLOOR 捨去餘額（對齊 SP STEP 11 游標最後一筆全吸收語意）
跨 Tier DIVIDE_LEFT：((ASSIGN_ORDER−1) % workingDays) + 1 → 對應第 N 個 casedt（round-robin）
```

### 3.5 資料清除不變式（重跑安全）

Stage 3 開始前清除：`UPDATE ob_monthly_run_result SET dept_id=NULL, emplid=NULL, assignday=NULL WHERE run_id=:runId AND tier_level IN ('T1','T2','T3','T4','T5')`；`is_cr` 保留（BR-F101-06）。
此清除動作覆蓋 Stage 3 + Stage 4 全部輸出欄位，使重跑結果一致。

### 3.6 dual-path gate 維持一致

DB_TYPE gate 與 F099/F100 一致：`DB_TYPE === 'postgres'` → PG set-based SQL 下推；
`else` → JS `executeV2` golden oracle。確定性使兩路徑**逐列等價可測**（AC-15 DoD）。

## 4. Open Questions 裁示

### OQ-F101-01 — 確定性排序鍵（已裁定）

見 §3.3 確定性排序鍵表格。採用 Stage 1 OQ-06 先例（`ORDER BY orgno, appl_no`）為案件層基礎，
差額補足層以自然鍵升冪（`obdeptid` / `emplid`）確保每次補足相同課/員工。

**裁定原則**：任一穩定欄位升冪均使 FLOOR 件數計算結果相同；差異僅在「哪幾件落入餘數補足」，
不影響業務整體比例分配（BR-F101-04/10 明確）。US-150 AC-5 要求此鍵在 spec 明確記錄 ✓。

### OQ-F101-02 — st4_exchange 交互（已裁定）

**裁定：st4_exchange 在 F101 範疇內不執行，F100 `runStage4Sql` 中的 10% senior swap 邏輯廢除。**

理由（三重佐證）：

1. **SP 硬編碼停用（最強依據）**：`st4_exchange` SP 首行 `IF @LIST_YEAR_MONTH >= '202408' RETURN`，
   自 2024 年 8 月起任何名單皆直接返回，production 從未執行交換。繼續複刻等同移植一個已死的 legacy 行為。

2. **業務語意衝突**：st4_exchange 的核心假設是「課長主任持有 T1/T2/T3 案件，換給同處專員的 T32/T4」，
   前提是存在「課長主任」與「電話行銷專員」兩種員工類別差異分流。F101 採 simplified is_cr（BR-F101-11/12），
   所有員工 T1–T5 使用同一 ration 演算法，交換的業務意義已消失。

3. **F100 OQ-F100-01 裁定**：OQ-F100-01 已說明 F100 senior swap 為「對齊現行 JS 簡化版」，
   明確排除了「復刻 SP 配對語意、寄信告警、整批回滾等副作用」，並非精確複刻 st4_exchange。
   這本身即表示 F100 P3 的 senior swap 是過渡 placeholder，而非最終設計。

**最終 Stage 4 員工分配順序**：

```
Stage 3（dept ration 分配）
  → Stage 4（empl ration 分配，寫 emplid / emplid_deptid）
  → Stage 4（ASSIGNDAY 千分比，寫 assignday）
  ─── st4_exchange：不執行 ───
```

`runStage4Sql` 將被 F101 完整取代：移除 default/senior 雙路徑，改為 per-list FLOOR + 兩階段補足。

> **Production 行為變化聲明**：F100 P3 上線後之月名單分派 `dept_id = dept[0]`，`emplid = defaultEmplid 或
> seniorEmplid`（10% 交換），`assignday = NULL`。F101 上線後改為比例真實分派 + 工作日分散 assignday，
> **分佈將顯著改變**。上線前須以 F067 比對工具量化差異並業務知會（§9 NFR-005）。

### OQ-F101-03 — ob_assign_set 退役（已裁定）

**裁定：`ob_assign_set` 標記為 vestigial，F101 不引用，但不在 F101 執行 DROP TABLE。**

理由：
- `ob_assign_set` 在 CDMP 系統中從未有任何資料來源（ETL 從未寫入），entity 定義存在但表為空。
- F101 ASSIGNDAY 日曆改用 `ob_calendar`（BR-F101-18），`ob_assign_set` 在現行及未來均不需要。
- DROP TABLE + migration 為獨立 schema 清理操作，影響範圍需另評估是否有其他程式碼隱性引用。
- **後續處置**：在下一次 schema 清理 sprint 中，以 migration 執行 `DROP TABLE ob_assign_set`，
  同時移除 TypeORM entity 定義。此操作超出 F101 code scope，獨立排程。

### OQ-F101-04 — transaction / 冪等粒度（已裁定）

**裁定：沿用 F100 / F099 之 I-IDEM-01 模型（per-list 清除 + per-run 冪等）。**

具體設計：
- **run 級冪等**：`triggerRun` 重觸發前 `DELETE FROM ob_monthly_run_result WHERE run_id = :runId`
  （FK ON DELETE CASCADE 同時清快照），與 I-IDEM-01 一致。
- **Stage 3 清除**：Stage 3 開始時先執行 `dept_id / emplid / assignday → NULL`（§3.5），不等待
  整 run 刪除，使 Stage 3 可在 run 部分完成後單獨重跑（§9.3 可中斷邊界）。
- **per-list auto-commit**：沿用 AD-E07-28 §9.3——Stage 3/4 以每份 list 為可中斷邊界，
  list 之間允許 CancellationPoller 查 status；單一 list 的 SQL 為原子大查詢（DB 內完成）。
- **不使用單一大 transaction 跨所有 list**：與 F099/F100 一致，避免長 transaction 鎖定競爭。

### OQ-F101-05 — 警告通道（已裁定）

**裁定：三類警告（`STAGE3_NO_DEPT_RATION` / `STAGE4_NO_EMPL_WARN` / `ASSIGNDAY_NO_CALENDAR_WARN`）
寫入 `assignment_run.skipped_cases`（JSONB）+ `warning_summary`（VARCHAR 100），不擴展
`assignment_audit_log.action` enum。**

理由：
1. **entity 確認**：`assignment_audit_log.action` 為 TypeScript union type（`'CREATE' | 'UPDATE' |
   'DELETE' | 'RUN' | 'EXPORT' | 'CANCEL' | 'STAGE_ADVANCE' | 'STAGE_ROLLBACK' | 'STAGE_REJECT' |
   'ASSIGN_ROLE' | 'REVOKE_ROLE' | 'SCORING_INTEGRITY_WARN'`）+ `VARCHAR(30)` column constraint。
   擴展需要同時改 TypeScript enum 定義 + migration，且 `audit_log` 語意為「使用者/系統操作軌跡」，
   pipeline 執行期警告不屬此語意範疇。
2. **assignment_run 無 report_payload 欄位**：現行 `assignment_run` entity 只有 `skipped_cases`
   (JSONB) 和 `warning_summary` (VARCHAR 100)，無 `report_payload` 欄位（F101 spec §5 G-2 預設
   「report_payload」為概念性描述，實際落點為這兩欄）。
3. **既有機制一致**：`skipped_cases` / `warning_summary` 已被 F063 摘要頁（US-083）的
   `AssignmentRunReportService.getSummary()` `warnings` 段讀取，無需新增 API 端點。

**寫入格式**：

```json
// skipped_cases JSONB 新增 warnings 陣列
{
  "warnings": [
    {
      "event": "STAGE3_NO_DEPT_RATION",
      "list_no": "OB202606001",
      "tier_level": "T2",
      "case_count": 45
    },
    {
      "event": "STAGE4_NO_EMPL_WARN",
      "dept_id": "AI000",
      "list_no": "OB202606001",
      "tier_level": "T1",
      "case_count": 50
    },
    {
      "event": "ASSIGNDAY_NO_CALENDAR_WARN",
      "list_no": "OB202606001",
      "work_ym": "202606"
    }
  ]
}
```

```
// warning_summary VARCHAR 100（有任何警告時填入，無則 null）
"STAGE3_NO_DEPT_RATION|STAGE4_NO_EMPL_WARN|ASSIGNDAY_NO_CALENDAR_WARN"
```

`assignment_run.skipped_cases` 現有結構 `{ cases: [...] }` 不衝突；tdd-implementation 在
existing payload 中**合併**（而非覆蓋）`warnings` 陣列。若 `skipped_cases` 已有 `cases` 欄位，
warning 另存 `warnings` 子鍵。

> **不新增 migration**：`skipped_cases` / `warning_summary` 欄位已存在（migration `1711360000190`），
> F101 僅改寫入內容的 JSON 結構，無 schema 變更。

## 5. Schema Gap G-1 架構確認

| Gap 項目 | 架構裁示 |
|---------|---------|
| `ob_pool_data` 無 `tier_level` | Stage 3 SQL 中 `tier_level` 讀 `ob_monthly_run_result.tier_level`（Stage 2 已寫），分處 `dept_id` 讀 `ob_pool_data.dept_id`（透過 JOIN orgno + appl_no） |
| Stage 3 前置條件 | **不變式 I-PIPELINE-STAGE-ORDER**：Stage 2（tier_level 寫入）→ Stage 3（dept ration）→ Stage 4（empl ration）→ ASSIGNDAY；任何實作必須保持此順序，CancellationPoller 的中斷邊界不得在 Stage 2 與 Stage 3 之間插入「部分 Stage 2」的中間狀態 |

## 6. 不變式彙總（F101 新增 / 延伸）

| ID | 內容 | 來源 |
|----|------|------|
| **I-DET-01** | Stage 3/4/ASSIGNDAY 全程無 `NEWID()` / `Math.random()` / `ORDER BY RANDOM()` / `crypto.randomUUID()` | OQ-F101-01 |
| **I-PIPELINE-STAGE-ORDER** | Stage 2 → Stage 3 → Stage 4(empl) → Stage 4(ASSIGNDAY)；不得跳過或亂序 | §3.1 / BR-F101-01 |
| **I-DEPT-EMPL-SEPARATION** | Stage 3 dept 分配層與 Stage 4 empl 分配層完全分離；Stage 3 不因下游員工存在性調整配額（BR-F101-01 / AC-3） | US-145 AC-4 |
| **I-RUN-EST-01（延伸）** | Stage 4 ASSIGNDAY 與 Stage 0 試算共享同一 `calculateDailyEstimate(ym)` 呼叫路徑；日曆未變更時比例一致 | BR-F101-16 / US-151 |
| **I-IDEM-01（沿用+延伸）** | run 級：重觸發前 DELETE run_id；Stage 3 級：Stage 3 開始前清 dept_id/emplid/assignday；IS_CR 保留 | OQ-F101-04 |
| **I-NO-ST4-EXCHANGE** | st4_exchange（T1/T2→senior swap）不執行；`runStage4Sql` 中 senior swap CTE 由 F101 移除 | OQ-F101-02 |
| **I-WARNING-CHANNEL** | Stage 3/4/ASSIGNDAY 警告寫 `assignment_run.skipped_cases.warnings[]` + `warning_summary`；不寫 `assignment_audit_log` | OQ-F101-05 |

## 7. 測試策略（點名 test-designer / tdd-implementation）

| 項目 | 承接 | 核心要求 |
|------|------|---------|
| Stage 3 手算 oracle（AC-13） | test-designer | 2分處×2Tier×3課，FLOOR+確定性差額補足，誤差=0 |
| Stage 4 手算 oracle（AC-14） | test-designer | 2課×2Tier×各3員工，FLOOR+ADD_CNT+前N補足，誤差=0 |
| ASSIGNDAY 千分比+最末吸收（AC-12） | test-designer | per casedt FLOOR；最末吸收餘額；DIVIDE_LEFT round-robin |
| JS↔SQL 逐列等價（AC-15，DoD） | test-designer | PG 真庫；dept_id/emplid/emplid_deptid/assignday 逐列等價 |
| 確定性可重現（AC-2） | test-designer | 不同 run_id 兩次四元組集合相同；I-DET-01 靜態掃描 |
| simplified is_cr（AC-8） | test-designer | is_cr Y/N 同池；無 CR 優先/超額移除；is_cr 值不變 |
| 回歸保護 emplid≠NULL（AC-10） | test-designer | automated；有 dept_id + empl_set 設定者 emplid≠NULL |
| 無 ration/無員工/無 calendar fallback（AC-5/11/17） | test-designer | 月名單分派不中斷；警告寫 skipped_cases.warnings |
| estimate≡run（AC-16） | test-designer | 同 calculateDailyEstimate 來源；比例一致 |
| ob_assign_set 無引用（AC-18） | test-designer | Grep 為空 |
| 確定性鍵/tier_level 來源/警告通道 schema | tdd-implementation | 對齊本 AD §3.3 / §4 OQ 裁示 |

## 8. 風險與緩解

| 風險 | 等級 | 緩解 |
|------|------|------|
| JS↔SQL 等價失敗（FLOOR 邊界、per-list vs per-run scope） | 高 | AC-15 PG 真庫逐列等價為 DoD 門檻；不過 DoD 不上 prod |
| ob_calendar ETL 未在月名單分派前執行 → ASSIGNDAY 全 NULL | 中 | AC-17 fallback：月名單分派不中斷，寫警告，业务確認後補跑 |
| skipped_cases.warnings 與現有 cases 結構合并衝突 | 低 | tdd-implementation 在 JSONB merge 時以 `|| jsonb_build_object('warnings', ...)` 合并；現有 cases 鍵不受影響 |
| ob_assign_set vestigial 殘留造成混淆 | 低 | 記錄退役決策（OQ-F101-03），排期獨立清理 sprint |
| 長名單 Stage 3/4 SQL 效能（M×N×T 三維組合） | 低-中 | set-based CTE 操作；需 EXPLAIN ANALYZE 驗證；必要時加 `(run_id, tier_level)` composite index on ob_monthly_run_result |

## 9. 與既有 AD 的關係

- **修訂 AD-E07-28 §5（P3 Stage 4 範圍）**：P3 `runStage4Sql` 的 senior swap（10% T1/T2→senior）
  被 F101 Stage 3/4 ration 分派整體取代；`Stage2to4ListContext` 的 `deptId` / `defaultEmplid` /
  `seniorEmplid` 等欄位在 F101 後廢棄，由 ration 查詢邏輯取代。
- **不影響 AD-E07-28 P1/P2**：worker 抽離、pg-boss、Stage 1 SQL 下推，均不受 F101 影響。
- **不影響 AD-E07-28 §6.1 I-RUN-EST-01**：F101 延伸 I-RUN-EST-01 至 ASSIGNDAY 層，與原定義不衝突。
- **不影響 AD-E07-27**：`project_workym` 語意（作業月 = `target_work_ym`）不變，Stage 4 `ym` 參數
  沿用此值計算 `calculateDailyEstimate(ym)` 與去重視窗。
- **不影響 AD-E07-26**：Stage 1 特例規則（matchesSpecialRule 仍 JS）不受影響。
