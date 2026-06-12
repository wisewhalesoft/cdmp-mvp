---
type: architecture-decision
decision_id: AD-E07-30
title: F102 月跑 CR 優先分派（失效清空 + CR 優先指派 + 扣量 + per-list cr_enabled 閘控 + 廢除全域旗標）
status: proposed
last_updated: 2026-06-12
bug_fixes:
  - id: BUG-F102-ASSIGNDAY-01
    date: 2026-06-12
    description: "I-CR-DEDUCT-01 原設計錯誤地將 is_cr<>'Y' 過濾套用至 ASSIGNDAY CTE，導致 CR 案件 assignday 全 NULL（202606 驗證 2,073 筆）。拆分為 I-CR-DEDUCT-01（配額基數排除）+ I-CR-ASSIGNDAY-01（ASSIGNDAY 含 CR）兩層語意。"
oq_resolved: [OQ-F102-1, OQ-F102-2, OQ-F102-3, OQ-F102-4, OQ-F102-5]
oq_open: []
covers: [F102, US-152, US-153, US-154]
supersedes_partial: []
related: [AD-E07-29, AD-E07-28, AD-E07-27, AD-E07-26, AD-E07-25]
source_stories: [US-152, US-153, US-154]
---

# AD-E07-30　F102 月跑 CR 優先分派

> 本決策記錄為架構設計產出，**不含 production / test 程式碼**。落地由 test-designer（測試策略）、
> tdd-implementation（實作）後續承接。
>
> **前置 AD**：本 AD 直接延伸 AD-E07-29（F101 比例分派），所有 F101 不變式（I-DET-01 / I-IDEM-01 /
> I-PIPELINE-STAGE-ORDER 等）於本 AD 繼續有效並予延伸。

## 1. 問題陳述（Problem Statement）

F101 完成後，`runStage2and3Sql`（PG 下推路徑）與 `executeV2`（JS in-memory 路徑）之 CR 語意
均為 **simplified is_cr**（BR-F101-12）：

1. `ob_monthly_run_result.cr_id` / `cr_nm` 全空（即使 `ob_pool_data_list.cr_id` 有值 344,092 筆）。
2. `is_cr` 值由 `runStage2and3Sql` 以「歷史 snapshot 未成交同案件」的 EXISTS 邏輯寫入，
   與 legacy SP CR 優先指派邏輯（失效清空 + emplid=cr_id）完全不同。
3. F101 所有案件一律流入 Stage 3/4 ration 池（無 CR 預指派、無扣量），約 1.9% CR 案件的
   `emplid` 並非對應 CR 業代，偏離 legacy 業務語意。

F102 補足此差距：在 Stage 2 之後、F101 Stage 3 之前插入 **CR 優先分派前置步驟**，實作
legacy SP `st2_dept`（第 116–190 行 CR LIVE 段）之失效清空 + CR 優先指派邏輯。

## 2. 輸入與約束

### 2.1 已查證的資料現況

| 資料項目 | 現況 |
|---------|------|
| `ob_monthly_run_result.cr_id` / `cr_nm` | **全空**（F101 Stage 1 SELECT 未帶入） |
| `ob_monthly_run_result.is_cr` | 由 `runStage2and3Sql` EXISTS 邏輯寫（非 legacy 語意） |
| `ob_pool_data_list.cr_id` 非空 | 344,092 筆 |
| `ob_pool_data_list.is_cr='Y'` | 118,116 筆（≈1.5%） |
| 202606 active 名單 | OB202606001 / 002 / 003，皆 prod_kind=01、**cr_enabled=true** |
| entity 欄位 `cr_id` / `cr_nm` / `is_cr` | 已存在，無需建欄 |

### 2.2 前置依賴

- **F101（AD-E07-29）**：Stage 3/4 真實比例分派已完成（CR 前置步驟須在其之前執行）。
- **F100**：`tier_level` 已由 Stage 2 寫入 `ob_monthly_run_result`（CR 步驟與 Stage 3 同處理迴圈，
  依賴 tier_level 已就緒）。
- **`ob_list_definition.cr_enabled`**（migration `1711360000182`）：BOOLEAN NOT NULL DEFAULT **false**；
  202606 三名單皆設為 true。
- **`ob_empl_set`**（PK `list_no` + `deptid_m` + `emplid`；`ration` NUMERIC(10,2)）：F082 已維護。
- **`ob_emphire`**（PK `emp_id` VARCHAR(10)；`resign_date` DATE NULL）：E04 ETL 已維護。

## 3. 目標架構設計

### 3.1 OQ-1 裁示：CR 三欄欄位流向 + Pipeline 精確插入點（最關鍵）

**問題**：`cr_id` / `cr_nm` / `is_cr` 欄位目前未從 `ob_pool_data_list` 帶入 `ob_monthly_run_result`。
CR 步驟需讀這三欄，有兩種方案：

| 方案 | 做法 | 優劣 |
|------|------|------|
| **A（採用）**：Stage 1 SELECT 帶入 | Stage 1 INSERT…SELECT 同時 SELECT `ob_pool_data_list.cr_id`、`cr_nm`、`is_cr` 寫入 result 表 | CR 步驟直接 UPDATE result 工作集，最單純；與 F101 set-based 一致；符合 I-NOLOAD-01 |
| B：CR 步驟 JOIN 回 pool | 步驟 1/2/3 各自再 JOIN `ob_pool_data_list` 讀來源值 | 每步驟多一次 JOIN；PG 下推 SQL 複雜度提高；非必要 |

**裁定**：採**方案 A**——Stage 1 INSERT…SELECT 補帶 `ob_pool_data_list.cr_id`、`cr_nm`、
`is_cr` 進 result 表。tdd-implementation 須修改 `stage1-sql-executor.ts` 之 INSERT 語句。

**不變式 I-CR-COLSRC-01**：`ob_monthly_run_result.cr_id` / `cr_nm` / `is_cr` 來源為 Stage 1
從 `ob_pool_data_list` 帶入；CR 步驟只對 result 工作集 UPDATE，不讀回 `ob_pool_data_list`。

---

**CR 步驟在 Pipeline 的精確插入點**（C-1 / C-2 裁示）：

```
Stage 1（INSERT ob_monthly_run_result，帶入 cr_id/cr_nm/is_cr）
  → Stage 2（計分 + tier_level，runStage2and3Sql）
  → [Stage 3 前置] 清除既有分派（dept_id/emplid/assignday → NULL，is_cr 保留）← F101 BR-F101-06
  → [F102 CR 前置，依 cr_enabled per-list 閘控]
      ├─ cr_enabled=false → UPDATE is_cr='N' WHERE list_no=:listNo（強制清 N）
      └─ cr_enabled=true →
            步驟 1：逾2年清空（UPDATE WHERE appl_date < @SYS_DT - 2 year）→ cr_id=NULL,cr_nm=NULL,is_cr='N'
            步驟 2：離職清空（JOIN ob_emphire，resign_date < @SYS_DT）→ cr_id=NULL,cr_nm=NULL,is_cr='N'
            步驟 3：CR 優先指派（JOIN ob_empl_set ration>0）→ emplid=cr_id,dept_id=deptid_m,is_cr='Y'
  → [F101 Stage 3] dept ration 分派（WHERE is_cr<>'Y'，步驟 4 扣量）
  → [F101 Stage 4] empl ration + ASSIGNDAY（WHERE is_cr<>'Y'）
```

**關鍵序：F101 Stage 3 前清除** 必須在 **CR 前置步驟之前** 執行，否則步驟 3 寫入之
`emplid`/`dept_id` 會被清除覆蓋（C-2 裁示）。

**不變式 I-CR-ORDER-01**：Pipeline per-list 迴圈執行順序嚴格為：
1. F101 清除（dept_id/emplid/assignday=NULL，is_cr 保留）
2. F102 CR 前置步驟（閘控 → 步驟 1 → 步驟 2 → 步驟 3）
3. F101 Stage 3 ration 分派（案件池 WHERE is_cr<>'Y'）
4. F101 Stage 4 ration + ASSIGNDAY（案件池 WHERE is_cr<>'Y'）

任何跳過或亂序均為錯誤（延伸 I-PIPELINE-STAGE-ORDER）。

### 3.2 OQ-2 / OQ-4 裁示：多筆 ob_empl_set deptid_m 取捨（確定性鍵）

**問題**：同一 `cr_id` 在 `ob_empl_set` 可能對應多筆 `deptid_m`（不同 prod_type 或重複）。
步驟 3 指派時需確定性地選取一筆。

**裁定**：取 **`deptid_m ASC` 第一筆**（對齊 AD-E07-29 I-DET-01 決定性精神——使用穩定的自然鍵
升冪，消除 non-determinism）。

**不變式 I-DET-CR-01**：步驟 3 若同一 `cr_id` 在 `ob_empl_set` 命中多筆 `deptid_m`，取
`deptid_m ASC` 第一筆作為 `dept_id` / `emplid_deptid`。無 `NEWID()` / `Math.random()`。

此鍵適用於 JS oracle 與 PG 下推兩條路徑，確保等價。

### 3.3 OQ-3 裁示：cr_enabled 預設值文字矛盾修正

**問題**：`data-model.md` L967「`cr_enabled` 恢復預設 `true`」與 entity / migration
`1711360000182`（`DEFAULT false`）矛盾。

**裁定**：

1. `data-model.md` 文字錯誤，**不是** entity / migration 的錯誤——現行 `DEFAULT false` 符合
   業務需求（機車排除靠 default false；汽車名單若需 CR 由 admin 顯式設 true）。
2. **不需新增 migration**（entity / migration 已正確，OQ-3 建議確認）。
3. **修正 `data-model.md`**：將 L967 「`cr_enabled` 恢復預設 `true`」改為
   「`cr_enabled` 恢復預設 `false`（沿用 migration `1711360000182` 實際值；F102 US-154 確認）」。

202606 三名單（OB202606001/002/003）皆 prod_kind=01 且已顯式設為 true，與此裁定一致。

**不變式 I-CR-DEFAULT-01**：`ob_list_definition.cr_enabled` 欄位 DEFAULT 值為 `false`。
新建名單（含複製）預設不啟用 CR；汽車名單需 CR 時由 admin 於 F050/F051 名單設定頁面顯式設為 true。

### 3.4 OQ-4 裁示：ob_assign_config 表退役策略

**問題**：US-154 廢除 `cr_reassignment_enabled` 後，`ob_assign_config` 表是否 DROP TABLE。

**裁定**：F102 **不執行 DROP TABLE**，理由如下：

1. **TypeORM schema sync 安全**：保留表 / entity 避免 dev synchronize:true 的 DROP TABLE 副作用。
2. **其他 config_key 待查**：無法排除 `ob_assign_config` 是否有 `cr_reassignment_enabled`
   以外的其他使用中設定鍵（後續 sprint 查 `SELECT DISTINCT config_key FROM ob_assign_config`）。
3. **最小影響原則**：F102 範疇為 CR pipeline 邏輯；schema 清理屬獨立操作，不應捆綁。

**F102 實際行動**：
- `ob-assign-config.entity.ts`：class 加 `@Deprecated` JSDoc 注解（`[DEPRECATED-F102]`）。
- Seed / migration：若存在 `cr_reassignment_enabled` 初始 INSERT，加 `[DEPRECATED-F102]` 注解。
- **不刪欄位**、**不 DROP TABLE**。

**後續 sprint 評估**：查 `ob_assign_config` 所有 `config_key` 使用情況；若無其他有效 key，
以獨立 migration 執行 `DROP TABLE ob_assign_config` + 移除 entity 定義。

**不變式 I-CR-CONFIG-DEPR-01**：F102 後，`ob_assign_config.cr_reassignment_enabled` 為廢棄
設定值，不被任何 service / controller 讀取（靜態掃描 AC-12 為 DoD 門檻）。

### 3.5 OQ-5 裁示：architecture-spec.md S2 稽核點更新

**問題**：`architecture-spec.md` F-6 稽核點 S2 描述
「`ob_assign_config.config_key = 'cr_reassignment_enabled'` 為唯一真實來源」已過時。

**裁定**：更新 S2 為：
```
| S2 | [DEPRECATED-F102] 全域 CR 旗標 `ob_assign_config.cr_reassignment_enabled` 已由 F102 US-154 廢棄；
     CR 開關唯一有效來源 = `ob_list_definition.cr_enabled`（per-list）。
     F059 doc body §1/§6 已加 [DEPRECATED] 標記（F102 spec 已執行）。 |
     ✅ 廢棄並更新（F102 US-154） | |
```

（本文件完成後由 system-architect 直接修改 `architecture-spec.md`。）

## 4. 新檔規劃與既有檔修改

### 4.1 新增檔案

**方案決定：獨立新檔（不併入 stage3to4 系列）**

理由：
- CR 邏輯（失效清空 + 優先指派）是語意獨立的「預指派」步驟，與 stage3to4-ration 的「比例分派」
  職責不同；合併後單一模組職責不清，不利未來維護與測試隔離。
- F101 stage3to4-ration.ts / stage3to4-ration-sql.ts 已穩定，不應修改增加回歸風險。
- 新檔命名清晰反映功能邊界。

**新增兩個檔案**：

| 檔案路徑 | 職責 |
|---------|------|
| `apps/api/src/modules/assignment/stage1/cr-priority.ts` | **JS oracle**：純函式群組，實作 CR 失效清空（步驟 1/2）+ CR 優先指派（步驟 3），輸入 result 工作集（含 cr_id/cr_nm/is_cr）、ob_empl_set、ob_emphire、@SYS_DT，輸出 per-case CR 指派結果（emplid/dept_id/is_cr/cr_id/cr_nm）。供 JS golden oracle + 單元測試。 |
| `apps/api/src/modules/assignment/stage1/cr-priority-sql.ts` | **PG 下推**：set-based SQL UPDATE 版本，對 `ob_monthly_run_result` 直接更新，與 JS oracle 逐列確定性等價（DoD EQ 測試）。實作三道 UPDATE：步驟 1（逾2年清空）、步驟 2（離職清空）、步驟 3（CR 優先指派）。 |

### 4.2 修改既有檔案

| 檔案路徑 | 修改說明 |
|---------|---------|
| `apps/api/src/modules/assignment/stage1/stage1-sql-executor.ts` | INSERT…SELECT 補帶 `ob_pool_data_list.cr_id`、`cr_nm`、`is_cr`（方案 A，I-CR-COLSRC-01） |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | `executeStage2to4Pushdown`：在 `runStage2and3Sql` 之後、`runStage3to4RationSql` 之前，插入 F102 CR 前置步驟呼叫（PG 下推路徑）；`executeV2`：在 `distributeStage3to4` 之前插入 CR 前置步驟（JS in-memory 路徑）；並修改 Stage 3 前清除時機至 CR 步驟之前（I-CR-ORDER-01） |
| `apps/api/src/modules/assignment/stage1/stage3to4-ration.ts` | `distributeStage3to4` 函式簽名加入 `isCrPreassigned` 過濾參數，或改從 cases 中以 `is_cr<>'Y'` 過濾（步驟 4 扣量，BR-F102-12） |
| `apps/api/src/modules/assignment/stage1/stage3to4-ration-sql.ts` | `runStage3DeptSql` / `runStage4EmplSql` 的案件池 WHERE 條件加 `AND (r.is_cr IS NULL OR r.is_cr <> 'Y')`（步驟 4 扣量） |
| `apps/api/src/database/entities/ob-assign-config.entity.ts` | class 加 `[DEPRECATED-F102]` JSDoc（OQ-4） |
| `docs/specs/data-model.md` | L967 文字修正（OQ-3，see §3.3） |
| `docs/specs/architecture-spec.md` | F-6 S2 更新（OQ-5，see §3.5） |

> **JS executeV2 路徑的 is_cr 來源變更**：`executeV2` 現行的 `collectCrCandidates`（歷史 snapshot
> 掃描）+ `isCr = list.cr_enabled && crApplPerList.has(...)` 邏輯須改為「**直接從 pool 帶入之**
> `p.is_cr` 讀取，不再比對歷史 snapshot」。CR 真實業務語意（失效規則 + emplid 指派）由 `cr-priority.ts`
> 接管；`collectCrCandidates` 及其 `crApplPerList` 相關邏輯**整體移除**（F102 後不再使用）。
> 此為 tdd-implementation 須執行的**必要清理**，非選項。

### 4.3 Stage 3 前清除時機協調（I-CR-ORDER-01 落地）

F101 `executeStage2to4Pushdown` 現況：
```
runStage2and3Sql(manager, ctx)      ← Stage 2 計分 + old CR logic
runStage3to4RationSql(manager, ctx) ← 內部先清除再比例分派
```

F101 `runStage3to4RationSql` 現況（`stage3to4-ration-sql.ts`）：
```
runStage3DeptSql  ← 內部已包含 dept_id / emplid / assignday 清除
runStage4EmplSql
runAssignDaySql
```

F102 修改後（I-CR-ORDER-01 強制執行順序）：
```
runStage2and3Sql(manager, ctx)       ← Stage 2：score/tier（CR is_cr 計算邏輯移除）
clearStage3Fields(manager, ctx)      ← 提取為獨立函式：dept_id/emplid/assignday→NULL（is_cr 保留）
runCrPriorityStep(manager, ctx)      ← F102 新增：CR 前置三步驟（cr-priority-sql.ts）
runStage3to4RationSql(manager, ctx)  ← F101 比例分派（案件池 WHERE is_cr<>'Y'）
```

`clearStage3Fields` 需從 `runStage3DeptSql` 內部**提取**至外層，確保在 CR 步驟之前執行。

## 5. cr-priority.ts 模組規格（JS Oracle）

### 5.1 介面定義

```typescript
/** CR 前置步驟案件輸入（Stage 1 已帶入 cr_id/cr_nm/is_cr/appl_date） */
export interface CrCase {
  orgno: string;
  appl_no: string;
  cr_id: string | null;
  cr_nm: string | null;
  is_cr: string;         // 'Y' | 'N' | '' 等來源原值
  appl_date: string;     // 'YYYY-MM-DD'
}

/** ob_empl_set（list_no 已過濾，ration>0） */
export interface CrEmplSet {
  emplid: string;
  deptid_m: string;
  ration: number;
}

/** ob_emphire（resign_date 為 null 表在職） */
export interface CrEmphire {
  emp_id: string;
  resign_date: string | null; // 'YYYY-MM-DD' or null
}

/** CR 前置步驟結果（per case） */
export interface CrAssignment {
  orgno: string;
  appl_no: string;
  cr_id: string | null;
  cr_nm: string | null;
  is_cr: string;          // 步驟後結果：'Y' | 'N'
  emplid: string | null;  // 步驟 3 指派後有值；否則 null
  dept_id: string | null; // 步驟 3 指派後有值；否則 null
  emplid_deptid: string | null;
}

/**
 * CR 優先分派前置步驟（F102，per-list）。
 *
 * @param cases        本 list 工作集案件（Stage 1 已帶入 cr_id/cr_nm/is_cr/appl_date）
 * @param emplSet      ob_empl_set（list_no + ration>0，已過濾）
 * @param emphire      ob_emphire（全量或 cr_id 相關子集）
 * @param sysDate      @SYS_DT = project_workym + '01'（'YYYY-MM-DD'）
 * @returns            per-case CR 指派結果
 */
export function applyCrPriority(
  cases: CrCase[],
  emplSet: CrEmplSet[],
  emphire: CrEmphire[],
  sysDate: string,
): CrAssignment[];
```

### 5.2 步驟實作規則

**步驟 1（逾2年清空）**：

```
twoYearsAgo = YYYY-MM-DD（sysDate - 2 年）
IF case.cr_id IS NOT NULL AND case.appl_date < twoYearsAgo:
    → cr_id = null, cr_nm = null, is_cr = 'N'
```

嚴格小於（`<`），對齊 SP 第 145 行 `DATEADD(YEAR, -2, @SYS_DT) > APPL_DATE` 語意。

**步驟 2（離職清空）**：

```
emphireMap = { emp_id → resign_date }
IF case.cr_id IS NOT NULL（步驟 1 後剩餘）:
    rec = emphireMap.get(case.cr_id)
    IF rec EXISTS AND rec.resign_date IS NOT NULL AND rec.resign_date < sysDate:
        → cr_id = null, cr_nm = null, is_cr = 'N'
    IF rec NOT EXISTS: 不清空（BR-F102-08，INNER JOIN 不命中語意）
    IF rec.resign_date IS NULL: 不清空（在職）
```

**步驟 3（CR 優先指派）**：

```
emplSetByEmplid = index ob_empl_set by emplid
IF case.cr_id IS NOT NULL（步驟 1/2 後剩餘）:
    matches = emplSetByEmplid.get(case.cr_id).filter(ration > 0)
    IF matches IS NOT EMPTY:
        chosen = matches.sort(deptid_m ASC)[0]  ← I-DET-CR-01
        → emplid = case.cr_id, dept_id = chosen.deptid_m,
          emplid_deptid = chosen.deptid_m, is_cr = 'Y'
    ELSE: 維持原值（is_cr 不改，案件進比例池）
```

### 5.3 cr_enabled=false 閘控

閘控邏輯由 pipeline 呼叫端（`assignment-run-pipeline.service.ts`）處理，不在 `cr-priority.ts`
內部實作，以保持純函式可測試性：

```typescript
// pipeline per-list 迴圈（executeV2 路徑）
if (list.cr_enabled) {
  const crResults = applyCrPriority(crCases, emplSet, emphire, sysDate);
  // merge crResults 到 scoredPool
} else {
  // 將所有案件 is_cr 強制設 'N'（BR-F102-02）
}
```

## 6. cr-priority-sql.ts 模組規格（PG 下推）

### 6.1 三道 SQL UPDATE

**步驟 1 SQL（逾2年清空）**：
```sql
UPDATE ob_monthly_run_result
   SET cr_id = NULL, cr_nm = NULL, is_cr = 'N', updated_at = CURRENT_TIMESTAMP
 WHERE run_id = :runId AND list_no = :listNo
   AND cr_id IS NOT NULL
   AND appl_date < :twoYearsAgo::date
```
`:twoYearsAgo` = JS 計算之 sysDate minus 2 年（'YYYY-MM-DD'），傳入 SQL 避免 DB 端日期計算差異。

**步驟 2 SQL（離職清空）**：
```sql
UPDATE ob_monthly_run_result r
   SET cr_id = NULL, cr_nm = NULL, is_cr = 'N', updated_at = CURRENT_TIMESTAMP
  FROM ob_emphire e
 WHERE r.run_id = :runId AND r.list_no = :listNo
   AND r.cr_id IS NOT NULL
   AND r.cr_id = e.emp_id
   AND e.resign_date IS NOT NULL
   AND e.resign_date < :sysDate::date
```
INNER JOIN（隱式於 FROM + WHERE）確保 `ob_emphire` 查無記錄時不清空（BR-F102-08）。

**步驟 3 SQL（CR 優先指派，含 I-DET-CR-01）**：
```sql
WITH empl_set_ranked AS (
  SELECT emplid, deptid_m,
         ROW_NUMBER() OVER (
           PARTITION BY emplid
           ORDER BY deptid_m ASC         -- I-DET-CR-01：deptid_m ASC 取第一筆
         ) AS rn
    FROM ob_empl_set
   WHERE list_no = :listNo AND ration > 0
),
first_dept AS (
  SELECT emplid, deptid_m FROM empl_set_ranked WHERE rn = 1
)
UPDATE ob_monthly_run_result r
   SET emplid       = r.cr_id,
       dept_id      = fd.deptid_m,
       emplid_deptid = fd.deptid_m,
       is_cr        = 'Y',
       updated_at   = CURRENT_TIMESTAMP
  FROM first_dept fd
 WHERE r.run_id = :runId AND r.list_no = :listNo
   AND r.cr_id IS NOT NULL
   AND r.cr_id = fd.emplid
```

**cr_enabled=false 的 SQL**（強制清 N，BR-F102-02）：
```sql
UPDATE ob_monthly_run_result
   SET is_cr = 'N', updated_at = CURRENT_TIMESTAMP
 WHERE run_id = :runId AND list_no = :listNo
   AND (is_cr IS NULL OR is_cr <> 'N')
```

### 6.2 函式介面

```typescript
export interface CrPriorityContext {
  runId: string;
  listNo: string;
  crEnabled: boolean;
  /** @SYS_DT = project_workym + '01' ('YYYY-MM-DD') */
  sysDate: string;
}

/**
 * F102 CR 優先分派前置步驟 SQL 下推（PG 真庫）。
 * - crEnabled=false → 僅執行強制 is_cr='N' UPDATE（BR-F102-02）
 * - crEnabled=true  → 步驟 1 → 步驟 2 → 步驟 3
 */
export async function runCrPrioritySql(
  manager: EntityManager,
  ctx: CrPriorityContext,
): Promise<void>;
```

## 7. Stage 3/4 扣量修改規格（步驟 4 / BR-F102-12）

> **Bug 修正（2026-06-12 live 重跑驗證）**：原始設計錯誤地將 `is_cr<>'Y'` 過濾一律套用至
> Stage 3/4/ASSIGNDAY 全部 CTE，導致 CR 案件（`is_cr='Y'`，共 2,073 筆）的 `assignday` 全為
> NULL。**根因**：「數量配額扣除」與「工作日散佈」是兩件不同的事，不可混用同一過濾條件。
> 本節依此修正，拆分為兩層語意。

### 7.0 兩層語意的正確界定

| 操作 | CR 案件（is_cr='Y'）應納入？ | 理由 |
|------|---------------------------|------|
| **Stage 3 dept ration 配額計算**（分組件數 group_cnt、課件數 FLOOR/diff） | **排除** | CR 案已有 emplid=cr_id，不參與電銷課配額分配；否則 CR 案件佔用課的配額使非 CR 案件不夠分 |
| **Stage 4 empl ration 配額計算**（grp_cnt、員工件數 FLOOR/diff） | **排除** | CR 案已有 emplid，不參與員工配額分配；FR-F102-12 扣量語意在此 |
| **ASSIGNDAY 工作日散佈**（per emplid 案件散佈到各工作日） | **納入** | CR 案已有 emplid，應隨其 emplid 依千分比散佈至工作日，與非 CR 案相同的 calendar/ration 基準；legacy 202606 驗證 2,079/2,079 CR 案全有指派日 |

**核心原則**：扣量（`is_cr<>'Y'`）只作用於「還需要分配的案件池」（Stage 3 dept ration 基數 +
Stage 4 empl ration 基數）；ASSIGNDAY 作用於「所有已有 emplid 的案件」（CR + 非 CR 皆是）。

### 7.1 PG 下推（stage3to4-ration-sql.ts）

#### Stage 3 `runStage3DeptSql`——cases CTE 加 is_cr<>'Y'

```sql
-- cases CTE（runStage3DeptSql）修改後（數量配額用，排除 CR 案）
SELECT r.orgno, r.appl_no, r.tier_level, o.dept_id AS pool_dept_id
  FROM ob_monthly_run_result r
  JOIN ob_pool_data o ON o.orgno = r.orgno AND o.appl_no = r.appl_no
 WHERE r.run_id = :runId AND r.list_no = :listNo
   AND r.tier_level IN ('T1','T2','T3','T4','T5')
   AND (r.is_cr IS NULL OR r.is_cr <> 'Y')   -- ← 扣量：CR 預指派件不參與 dept 配額
```

#### Stage 4 `runStage4EmplSql`——grp CTE 加 is_cr<>'Y'

```sql
-- 分組件數計算（grp CTE）修改後（數量配額用，排除 CR 案）
SELECT r.dept_id, r.tier_level, COUNT(*)::int AS grp_cnt
  FROM ob_monthly_run_result r
 WHERE r.run_id = :runId AND r.list_no = :listNo
   AND r.dept_id IS NOT NULL
   AND r.tier_level IN ('T1','T2','T3','T4','T5')
   AND (r.is_cr IS NULL OR r.is_cr <> 'Y')   -- ← 扣量：CR 預指派件不參與 empl 配額
 GROUP BY r.dept_id, r.tier_level
```

同樣地，Stage 4 的 `ranked` CTE（取件指派）也需加此條件，確保 CR 案不被 Stage 4 重新指派
（覆蓋其已由 CR 步驟設定的 emplid）：

```sql
-- ranked CTE（runStage4EmplSql）修改後
SELECT orgno, appl_no, dept_id, tier_level,
       (ROW_NUMBER() OVER (
          PARTITION BY dept_id, tier_level
          ORDER BY orgno, appl_no) - 1) AS rn0
  FROM ob_monthly_run_result
 WHERE run_id = :runId AND list_no = :listNo
   AND dept_id IS NOT NULL
   AND tier_level IN ('T1','T2','T3','T4','T5')
   AND (is_cr IS NULL OR is_cr <> 'Y')        -- ← 確保 CR 案不被重新指派 emplid
```

#### ASSIGNDAY `runAssignDaySql`——**不加** is_cr 過濾，涵蓋全部已有 emplid 案件

```sql
-- empl_total CTE（runAssignDaySql）——維持原條件，不加 is_cr 過濾
SELECT emplid, COUNT(*)::int AS total
  FROM ob_monthly_run_result
 WHERE run_id = :runId AND list_no = :listNo AND emplid IS NOT NULL
 GROUP BY emplid

-- ranked CTE（runAssignDaySql）——維持原條件，CR 案同樣納入 EMP_ORD 編號
SELECT orgno, appl_no, emplid,
       (ROW_NUMBER() OVER (
          PARTITION BY emplid ORDER BY orgno, appl_no) - 1) AS emp_ord0
  FROM ob_monthly_run_result
 WHERE run_id = :runId AND list_no = :listNo AND emplid IS NOT NULL
 -- ← 無 is_cr 過濾：CR 案（is_cr='Y'，emplid=cr_id）與非 CR 案同樣依 emplid 分組散佈
```

**ASSIGNDAY 語意**：per emplid，其轄下所有案件（CR + 非 CR）按 `(orgno, appl_no) ASC` EMP_ORD
排序，再依工作日千分比 FLOOR(total × ratioPerMille/1000) 散佈。CR 案件的 total 計入該員工的
整體件數，分攤至各工作日，與非 CR 案件相同基準（I-CR-ASSIGNDAY-01）。

### 7.2 JS oracle（stage3to4-ration.ts）

#### distributeStage3to4 呼叫端：只過濾數量 ration 的 rationCases

```typescript
// pipeline service（executeV2）——CR 步驟後、ration 分派前
// 只排除 is_cr='Y' 的案件進入 rationCases（配額計算用）
const rationCases: RationCase[] = scoredPool
  .filter(c => c.is_cr !== 'Y')  // BR-F102-12 扣量：配額計算排除 CR 預指派件
  .map(({ pool: p, tierLevel }) => ({
    orgno: p.orgno,
    appl_no: p.appl_no,
    tier_level: tierLevel,
    pool_dept_id: p.dept_id,
  }));

// CR 案件另外收集，供 ASSIGNDAY 合併
const crAssignedCases: RationCase[] = scoredPool
  .filter(c => c.is_cr === 'Y')
  .map(({ pool: p, tierLevel }) => ({
    orgno: p.orgno,
    appl_no: p.appl_no,
    tier_level: tierLevel,
    pool_dept_id: p.dept_id,
  }));

// ration 分派只處理非 CR 案件
const { assignments, warnings } = distributeStage3to4(
  list.list_no, ym, rationCases, deptRations, emplRations, workingDays
);
```

#### distributeStage3to4 與 assignDays 修改：ASSIGNDAY 補入 CR 案件

`distributeStage3to4` 的 `assignDays` 呼叫需補入 CR 已指派案件（`is_cr='Y'`，已有 emplid）：

```typescript
// distributeStage3to4 尾段（stage3to4-ration.ts）
// CR 案件不經 Stage 3/4 ration 分配，但需要 ASSIGNDAY 散佈
// 做法：在 assignDays 呼叫前，把 CR 案件的 emplid/dept_id 合併進 result Map

// 選項 A（建議）：pipeline service 呼叫端傳入 allCasesForAssignDay
//   = rationCases（非 CR）+ crAssignedCases（CR，已有 emplid from CR 步驟結果）
// distributeStage3to4 函式簽名加 crPreassignedCases 參數：
export function distributeStage3to4(
  listNo: string,
  ym: string,
  cases: RationCase[],           // 非 CR 案件（is_cr<>'Y'），用於 Stage 3/4 配額分配
  deptRations: DeptRation[],
  emplRations: EmplRation[],
  workingDays: WorkingDay[],
  crPreassigned?: CrPreassigned[], // ← 新增：CR 預指派案件（is_cr='Y'），僅用於 ASSIGNDAY
): RationResult
```

`CrPreassigned` 介面（新增，傳入 assignDays 合併用）：

```typescript
export interface CrPreassigned {
  orgno: string;
  appl_no: string;
  emplid: string;       // 已由 CR 步驟指派
  tier_level: string | null;
}
```

`assignDays` 函式內部：將 `crPreassigned` 案件的 emplid 加入 `result Map`（僅設 emplid，
不覆蓋 dept_id，供 per-emplid 分組），然後以全部有 emplid 案件（ration 分派 + CR 預指派）
計算工作日散佈。

**選擇「傳入 crPreassignedCases」方案理由**：
- `distributeStage3to4` 仍保持無外部副作用純函式，可獨立測試。
- ASSIGNDAY 邏輯不需知道「CR 是什麼」，只需知道「哪些案件已有 emplid 需要 assignday」。
- 合併點集中於 `assignDays`，Stage 3/4 配額分配路徑不受影響。

### 7.3 不變式 I-CR-DEDUCT-01（修正版）

**不變式 I-CR-DEDUCT-01**（修正）：`is_cr='Y'` 的 CR 預指派案件**僅**排除於 Stage 3 dept ration
配額計算基數（`group_cnt`）與 Stage 4 empl ration 配額計算基數（`grp_cnt`）之外；
**不**影響 ASSIGNDAY 工作日散佈的案件池。CR 預指派案件的 `emplid` / `dept_id` 不被 Stage 3/4
ration 覆蓋（BR-F102-12）。

**不變式 I-CR-ASSIGNDAY-01**（新增）：ASSIGNDAY 工作日散佈的案件池為**所有已有 `emplid`
的案件**（`emplid IS NOT NULL`），含 `is_cr='Y'` CR 預指派案件。CR 案件依其 `emplid`
分組，以相同的 `calculateDailyEstimate` 工作日千分比散佈至各工作日，與非 CR 案件相同基準。
legacy 202606 驗證：2,079/2,079 CR 案件均有指派日，散佈於全月 21 個工作日。

## 8. runStage2and3Sql CR 邏輯移除

**現況**：`runStage2and3Sql`（`stage2to4-sql-executor.ts`）有 `crExpr`：EXISTS 歷史 snapshot
查詢寫 `is_cr='Y'/'N'`。此邏輯在 F102 後語意錯誤（legacy CR 邏輯由 `runCrPrioritySql` 接管）。

**裁定**：`runStage2and3Sql` 內 `crExpr` / `crEnabled` 相關邏輯**全部移除**；Stage 2 只負責
`score` / `card_level` / `tier_level` 三欄更新；`is_cr` 欄位由 Stage 1 帶入（來源值），
由 F102 `runCrPrioritySql` 依業務規則修改。

同樣地，`executeV2` 內 `collectCrCandidates`、`crApplPerList`、`crEnabledListNos` 相關邏輯
全部移除，改由 `applyCrPriority` 接管。

**不變式 I-CR-STAGE2-CLEAN-01**：Stage 2 `runStage2and3Sql` 不寫 `is_cr` 欄位；`is_cr` 寫入
路徑為：(a) Stage 1 帶入原始值；(b) F102 CR 前置步驟依業務規則修改。

## 9. 確定性與冪等不變式彙總（F102 新增 / 延伸）

| ID | 內容 | 來源 |
|----|------|------|
| **I-CR-COLSRC-01** | `ob_monthly_run_result.cr_id` / `cr_nm` / `is_cr` 來源為 Stage 1 從 `ob_pool_data_list` 帶入；CR 步驟只對 result 工作集 UPDATE | OQ-1 裁示 |
| **I-CR-ORDER-01** | per-list 迴圈執行順序：F101清除 → F102 CR前置 → F101 Stage3 ration → F101 Stage4 ration；不得跳過或亂序 | OQ-1 / C-2 |
| **I-DET-CR-01** | 步驟 3 多筆 `deptid_m` 命中時，取 `deptid_m ASC` 第一筆；無 `NEWID()` / `Math.random()` | OQ-2 裁示 |
| **I-CR-DEFAULT-01** | `ob_list_definition.cr_enabled` DEFAULT false；新建名單預設不啟用 CR | OQ-3 裁示 |
| **I-CR-CONFIG-DEPR-01** | `ob_assign_config.cr_reassignment_enabled` 廢棄；不被任何 service / controller 讀取 | OQ-4 裁示 |
| **I-CR-DEDUCT-01**（修正） | `is_cr='Y'` 排除僅作用於 Stage 3 dept ration **配額基數**（`group_cnt`）與 Stage 4 empl ration **配額基數**（`grp_cnt`）及案件指派 `ranked` CTE；CR 案件 `emplid`/`dept_id` 不被 Stage 3/4 覆蓋。**ASSIGNDAY 不套此過濾**（見 I-CR-ASSIGNDAY-01） | §7 / BR-F102-12 |
| **I-CR-ASSIGNDAY-01**（新增） | ASSIGNDAY 散佈案件池 = `emplid IS NOT NULL`（含 `is_cr='Y'` CR 預指派案件）；CR 案件依其 emplid 分組，以相同工作日千分比散佈至各工作日；legacy 202606 驗證 2,079/2,079 CR 案全有指派日 | §7 / 202606 live 驗證 |
| **I-CR-STAGE2-CLEAN-01** | Stage 2 不寫 `is_cr`；`is_cr` 僅由 Stage 1 帶入 + F102 CR前置步驟修改 | §8 |
| **I-DET-01（繼承）** | Stage 3/4/ASSIGNDAY + CR 步驟全程無 `NEWID()` / `Math.random()` / `ORDER BY RANDOM()` / `crypto.randomUUID()` | AD-E07-29 |
| **I-IDEM-01（繼承 + 延伸）** | run 級：重觸發前 DELETE run_id；Stage 3 前：清 dept_id/emplid/assignday + CR 步驟冪等（SET-based UPDATE 重跑結果一致）；is_cr 保留（F101 §3.5） | AD-E07-29 |
| **I-CR-SNAPSHOT-01** | per-list `cr_enabled` 快照時機與 F101 `ob_dept_pct` / `ob_empl_set` 一致（月跑開始時讀取，月跑期間不受後續變更影響；US-153 AC-4 / BR-F102-01）| US-153 技術備註 |

## 10. @SYS_DT 計算與日期比較規格

**@SYS_DT 定義**：`project_workym + '01'`（名單月第一天，'YYYY-MM-DD'）。

- 對齊 legacy SP `@SYS_DT = PROJECT_WORKYM + '01'`（SP 第 145/154 行）。
- 對齊 F097（`project_workym = target_work_ym`）語意。

**JS 計算**（在 pipeline service 或 cr-priority.ts 呼叫端）：
```typescript
const sysDate = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`; // 'YYYY-MM-DD'
const twoYearsAgo = new Date(parseInt(ym.slice(0,4))-2, parseInt(ym.slice(4,6))-1, 1)
  .toISOString().slice(0, 10); // 嚴格 2 年前當月 1 日
```

**日期比較**：
- 步驟 1：`appl_date < twoYearsAgo`（嚴格小於，`appl_date = twoYearsAgo` 不清空）。
- 步驟 2：`resign_date < sysDate`（嚴格小於，`resign_date = sysDate` 不清空）。
- 兩者均對齊 legacy SP 的嚴格小於比較。

## 11. dual-path gate（JS oracle ↔ PG 下推 parity）

CR 邏輯比照 F101 採 dual-path 設計：

| 環境 | 執行路徑 |
|------|---------|
| DB_TYPE='postgres' | `runCrPrioritySql`（cr-priority-sql.ts）PG set-based UPDATE |
| 非 PG（SQLite 測試 / in-memory） | `applyCrPriority`（cr-priority.ts）JS golden oracle |

**DoD（Definition of Done）EQ 等價測試**：
- PG 真庫環境下，以相同輸入資料執行 JS oracle + PG 下推，逐列比對
  `cr_id` / `cr_nm` / `is_cr` / `emplid` / `dept_id` / `emplid_deptid` 完全相同。
- 對齊 AD-E07-29 §3.6 AC-15 模式。

**不變式 I-DET-01（繼承）**：CR 步驟全程無 non-deterministic 呼叫；兩條路徑確定性等價可測。

## 12. 警告通道（沿用 I-WARNING-CHANNEL）

F102 CR 步驟本身為確定性 SET-based 操作，正常業務情境不產生警告。以下情境 tdd-implementation
可選擇性記錄（非必填，DoD 不要求）：
- 「CR 業代在 ob_empl_set 無記錄」案件數（資訊性，供業務稽核）。
- 「ob_emphire 查無 emp_id」案件數（BR-F102-08 沿用 INNER JOIN 行為）。

若需記錄，沿用 `skipped_cases.warnings[]` 通道（I-WARNING-CHANNEL，AD-E07-29 §4 OQ-F101-05）。

## 13. Schema 影響評估

| Schema 項目 | 動作 | 理由 |
|------------|------|------|
| `ob_monthly_run_result.cr_id` / `cr_nm` / `is_cr` | 無需建欄（已存在）；Stage 1 改帶入原始值 | 欄位已存在，僅資料流改變 |
| `ob_list_definition.cr_enabled` | 無需修改欄位（DEFAULT false 已正確）；修正 data-model.md 文字 | OQ-3 裁示 |
| `ob_assign_config` | 保留表 / entity；加 deprecated 注解 | OQ-4 裁示 |
| `stage1-sql-executor.ts` INSERT | 補帶 `cr_id` / `cr_nm` / `is_cr` 三欄（從 `ob_pool_data_list`） | I-CR-COLSRC-01 |
| 其他表 | 無 schema 變更 | — |

**不需新增 migration**（所有所需欄位已存在；OQ-3 確認無新欄位）。

## 14. 風險與緩解

| 風險 | 等級 | 緩解 |
|------|------|------|
| Stage 1 INSERT 補三欄後 SQLite 單元測試路徑需同步更新 fixture | 中 | test-designer 明列 Stage 1 帶入欄位為 AC 前置條件；tdd-implementation 需同步更新 JS chain 路徑 |
| JS oracle ↔ PG SQL 日期比較不等價（timezone / string vs date 型別） | 高 | AC-10 EQ 測試以邊界日期（sysDate, twoYearsAgo）涵蓋嚴格小於邊界；使用字串比較（'YYYY-MM-DD'）消除 timezone 干擾；對齊 F101 feedback_typeorm_between_timezone |
| clearStage3Fields 提取後 F101 比例分派回歸 | 中 | F101 現有 AC-15 DoD EQ 測試為回歸保護；tdd-implementation 不得修改清除欄位範圍 |
| executeV2 collectCrCandidates 移除影響其他測試 | 低 | 靜態掃描確認 collectCrCandidates 無其他引用者；F101 AC-8（simplified is_cr）測試需更新期望值 |
| `ob_assign_config` 保留造成 TypeORM synchronize 在新環境建表 | 低 | 行為不變；已有 entity 定義；dev synchronize 不 DROP 既有表 |
| CR 步驟後 Stage 3 比例分派件數 < 預期（CR 扣量過多） | 低-中 | AC-9 / AC-13 驗收（≈1.9% CR 比例）；F067 差異報告量化 |
| **ASSIGNDAY CR 案件 NULL（I-CR-ASSIGNDAY-01 漏實作）** | **高**（已觸發）| `runAssignDaySql` 與 `assignDays` 的案件池條件不得加 `is_cr<>'Y'`；tdd-implementation 以「CR 案件 assignday 非 NULL」為 DoD 獨立 AC；test-designer 必須涵蓋 202606 CR 2,079 筆 assignday 全有值的驗收（AC-13 延伸） |

## 15. 與既有 AD 的關係

- **延伸 AD-E07-29（F101）**：本 AD 為 F101 的直接後繼；所有 F101 不變式繼續有效（I-DET-01 / I-IDEM-01 / I-PIPELINE-STAGE-ORDER 等）；新增 I-CR-* 系列不變式。
- **修訂 AD-E07-29 §3.6（simplified is_cr 語意）**：F101 BR-F101-12（simplified is_cr）為過渡設計；F102 上線後，`cr_enabled=true` 名單改用精確 CR 語意；`cr_enabled=false` 名單 is_cr 全清 N，行為與 simplified is_cr 一致（BR-F102-02）。
- **廢止 AD-E07-5（F059 全域 CR 開關）**：`ob_assign_config.cr_reassignment_enabled` 廢棄（OQ-4）；`ob_list_definition.cr_enabled` 為唯一有效 CR 開關（OQ-5）。
- **不影響 AD-E07-28 P1/P2**：worker 抽離、pg-boss、Stage 1 SQL 下推不受影響。
- **不影響 AD-E07-27**：project_workym 語意不變；@SYS_DT 計算沿用相同字串運算。

## 16. 測試策略點名（test-designer / tdd-implementation）

| 項目 | 承接 | 核心要求 |
|------|------|---------|
| **Stage 1 cr_id/cr_nm/is_cr 帶入驗證** | tdd-implementation | INSERT 後 result 表三欄非全空；與 pool 來源值一致 |
| **cr_enabled=true 執行 CR 前置** | test-designer | AC-1；日誌記錄 cr_enabled=true |
| **cr_enabled=false 跳過 + is_cr=N** | test-designer | AC-2；pool 原有 is_cr='Y' 被強制清 N |
| **混合 cr_enabled 互不干擾** | test-designer | AC-3；兩名單 Stage 3/4 比例分派結果正確 |
| **步驟 1 逾2年邊界（嚴格小於）** | test-designer | AC-5；appl_date = twoYearsAgo 不清空；< 清空 |
| **步驟 2 離職清空 + 查無不清** | test-designer | AC-6/7；resign_date=NULL 不清；INNER JOIN 不命中不清（BR-F102-08） |
| **步驟 3 有 ration 才指派** | test-designer | AC-8；ration=0 / 無記錄不指派；deptid_m ASC 取第一筆（I-DET-CR-01） |
| **扣量：Stage 3/4 配額排除 CR，ASSIGNDAY 納入 CR** | test-designer | AC-9；N−M 件入 Stage 3 dept ration 配額池；CR 案件 emplid/dept_id 不被覆蓋（I-CR-DEDUCT-01）；**並且** CR 案件 assignday 非 NULL（I-CR-ASSIGNDAY-01）——兩件事各有獨立 Given/Then |
| **CR 案件 assignday 有值且散佈正常** | test-designer | 新增 AC（I-CR-ASSIGNDAY-01）；Given：名單有 M 筆 is_cr='Y' 且各有 emplid；When：Pipeline 完整執行；Then：M 筆 assignday 全非 NULL；assignday 分佈與同一 emplid 的非 CR 案件使用相同工作日千分比 |
| **確定性可重現** | test-designer | AC-10；不同 run_id 兩次結果相同；I-DET-01 靜態掃描 + I-DET-CR-01 |
| **JS↔SQL 逐列等價（DoD EQ）** | test-designer | PG 真庫；cr_id/cr_nm/is_cr/emplid/dept_id/**assignday** 逐列等價（含 CR 案件 assignday 非 NULL） |
| **F059 doc 已修正 + 無 service 讀全域旗標** | test-designer | AC-11/12；grep cr_reassignment_enabled service/web=0 |
| **202606 重跑 CR 三欄有值 ≈1.9%** | test-designer + 業務 | AC-13；F064 匯出；is_cr='Y' 每筆 cr_id≠空、emplid=cr_id |
| **I-CR-ORDER-01 執行順序靜態驗證** | test-designer | clearStage3Fields 必在 runCrPrioritySql 之前呼叫 |
| **Stage 2 不寫 is_cr（I-CR-STAGE2-CLEAN-01）** | test-designer | runStage2and3Sql 後 is_cr 保持 Stage 1 原始值（未被 Stage 2 修改）|
| **ob_assign_config deprecated 注解** | tdd-implementation | entity class 含 [DEPRECATED-F102] 注解；AC-12 grep=0 |
