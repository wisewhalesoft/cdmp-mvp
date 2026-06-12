---
type: test-design-feature
feature_id: F102
feature_name: 月跑 CR 優先分派（失效清空 + CR 優先指派 + 扣量 + per-list cr_enabled 閘控 + 廢除全域旗標）
priority: P0-MVP
related_spec: /docs/specs/features/F102-cr-priority-assignment.md
source_ad: /docs/specs/implementation-log/AD-E07-v3.3-f102-cr-priority-assignment.md
source_stories: [US-152, US-153, US-154]
spec_version: "1.0"
last_updated: 2026-06-12
blocked_by: F101
---

# F102：月跑 CR 優先分派 — 測試設計

> ⚠️ **範圍**：本文件為測試設計（test design），**不含** production code、測試實作碼（spec 檔）、migration、entity 定義，由 tdd-implementation agent 承接落地。
>
> **驗收紅線（Definition of Done）**：
> 1. **EQ 群組**（JS `applyCrPriority` ↔ PG `runCrPrioritySql`，`(cr_id, cr_nm, is_cr, emplid, dept_id, emplid_deptid)` 逐列等價，PG 真庫）= 必須全綠，未過不得上線。
> 2. **邊界 oracle 群組**（步驟 1 逾2年嚴格小於、步驟 2 離職嚴格小於）= 誤差為 0。
> 3. **I-CR-ORDER-01 執行順序驗證**（clearStage3Fields 在 runCrPrioritySql 之前）= 回歸紅線。
> 4. **I-CR-STAGE2-CLEAN-01**（Stage 2 不寫 is_cr）= 必測回歸。
> 5. **AC-12 靜態掃描**（cr_reassignment_enabled service/web 引用 = 0）= DoD 門檻。
>
> **已裁定決策（所有 OQ 已 RESOLVED，測試據此驗收）**：
> - **OQ-F102-1**（CR 三欄欄位流向）= 採方案 A：Stage 1 INSERT…SELECT 帶入 cr_id/cr_nm/is_cr；CR 步驟只對 result 工作集 UPDATE（I-CR-COLSRC-01）。
> - **OQ-F102-2**（多筆 deptid_m 取捨）= `deptid_m ASC` 第一筆（I-DET-CR-01）。
> - **OQ-F102-3**（cr_enabled 預設值）= DEFAULT false，data-model.md 文字矛盾已裁定更正（I-CR-DEFAULT-01）。
> - **OQ-F102-4**（ob_assign_config 退役）= F102 不 DROP TABLE；加 `[DEPRECATED-F102]` 注解（I-CR-CONFIG-DEPR-01）。
> - **OQ-F102-5**（architecture-spec.md S2 更新）= 由 system-architect 修正。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F102 spec](../../specs/features/F102-cr-priority-assignment.md)（§4 AC-1~13 / §6 worked example / §12 OQ）+ [AD-E07-30](../../specs/implementation-log/AD-E07-v3.3-f102-cr-priority-assignment.md)（所有 OQ 已裁定，**權威**）+ [F101 test spec](F101-test.md)（EQ 架構 + clearStage3Fields 語意）+ 新增模組：`cr-priority.ts`（JS oracle）/ `cr-priority-sql.ts`（PG 下推）+ 修改：`stage1-sql-executor.ts`（I-CR-COLSRC-01）/ `assignment-run-pipeline.service.ts`（I-CR-ORDER-01）/ `stage3to4-ration.ts`（步驟4扣量）/ `stage3to4-ration-sql.ts`（步驟4扣量） |
| QA / Tester | 本文件（特別 §一 邊界 oracle + §四 EQ 等價矩陣 + §七 回歸保護 + §八 靜態掃描） |
| CI/CD Owner | 本文件「自動化就緒度」；F102 pg.spec 需序列執行（共用 cdmp_test DB，與 F098/F099/F100/F101 同）|
| Product Analyst / 業務 | §九 UPGR — 202606 重跑差異報告 + F067 驗收 gate（AC-13）|

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| **驗收紅線** | EQ 群組（JS↔SQL 逐列六欄等價，PG 真庫）+ 步驟 1/2 邊界 oracle 誤差=0 + I-CR-ORDER-01 靜態驗證 為 DoD 門檻 |
| **主要測試層** | ① **PG Integration（強制 Postgres）**：EQ 逐列等價、邊界 oracle（步驟 1/2）、步驟 3 指派、步驟 4 扣量、I-IDEM-01 冪等、混合名單互不干擾、Stage 2 不寫 is_cr ② **Unit（純函式 / 靜態）**：I-DET-CR-01 確定性掃描（無 random）、cr_reassignment_enabled 引用為零、I-CR-ORDER-01 呼叫順序、applyCrPriority JS oracle 行為 ③ **Integration（SQLite + JS oracle）**：JS cr-priority.ts golden oracle 行為驗證 |
| **等價基準（Oracle）** | **邊界日期手算（嚴格小於，字串比較）**：appl_date < twoYearsAgo / resign_date < sysDate。oracle 件數寫死於本文件 §一~§三，由人複核後視為 ground truth。禁止「SQL 自我斷言」（同錯假綠）。 |
| **Mock / Seed 注意** | seed 須含 Stage 1 已帶入的 cr_id/cr_nm/is_cr 欄位（I-CR-COLSRC-01 前置）；`ob_emphire.resign_date` 為 DATE NULL（NULL=在職）；`ob_empl_set.ration` 為 NUMERIC(10,2)；日期使用 'YYYY-MM-DD' 字串比較（feedback_typeorm_between_timezone 教訓）。 |
| **CI 序列執行** | F102 pg.spec 與 F098/F099/F100/F101 共用 cdmp_test DB，**必須序列執行**，禁並行。 |
| **型別 gate** | 實作後必須跑 `tsc --noEmit -p tsconfig.build.json`（feedback_vitest_no_typecheck 教訓）。 |
| **SP 解碼** | ground truth 為 `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql` **第 116–190 行 CR LIVE 段**（UTF-16LE；`st3_emplid` CR 段為 `/* */` 死碼，**不引用**）。解碼：`node -e "require('fs').readFileSync(path).toString('utf16le')"`（feedback_sp_utf16le_decode 教訓）。 |

### 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 自動化適合度 | 說明 |
|---|---|---|---|---|---|
| GATE（閘控 cr_enabled，AC-1/2/3/4） | 6 | PG Integration + Unit | **是** | 高 | true/false 路徑；混合名單；快照鎖定；is_cr 強制清 N |
| STEP1（逾2年清空邊界，AC-5） | 5 | PG Integration | **是** | 高 | 嚴格小於邊界；不改 pool；pool 原始資料不動 |
| STEP2（離職清空 + 查無不清，AC-6/7） | 5 | PG Integration | **是** | 高 | 嚴格小於；NULL=在職；INNER JOIN 不命中不清（BR-F102-08） |
| STEP3（CR 優先指派 + I-DET-CR-01，AC-8） | 5 | PG Integration | **是** | 高 | ration>0 命中才指派；deptid_m ASC 第一筆；查無不指派 |
| DEDUCT（扣量 + ASSIGNDAY，AC-9 / I-CR-ASSIGNDAY-01） | 7 | PG Integration | **是** | 高 | Stage 3/4 配額扣量 + CR 案 assignday 非空 + 雙重斷言（I-CR-DEDUCT-01 修正 + I-CR-ASSIGNDAY-01） |
| EQ（JS↔SQL 逐列等價，DoD） | 7 | PG Integration | **是** | 高 | **DoD 門檻**；六欄位逐列精確比對；含 I-DET-CR-01 + I-CR-ASSIGNDAY-01（EQ-007） |
| IDEM（重跑安全，AC-10） | 3 | PG Integration | **是** | 高 | 兩次不同 run_id 結果相同；Stage 1 帶入前置必須可重現 |
| S2CLEAN（Stage 2 不寫 is_cr，I-CR-STAGE2-CLEAN-01） | 2 | PG Integration | **是** | 高 | Stage 2 後 is_cr = Stage 1 帶入原值 |
| S1SRC（Stage 1 帶入 cr_id/cr_nm/is_cr，I-CR-COLSRC-01） | 3 | PG Integration | **是** | 高 | result 表三欄與 pool 來源值一致；非全空 |
| ORDER（執行順序 I-CR-ORDER-01） | 2 | Unit（靜態）+ Integration | 是（Integration 子案） | 高 | clearStage3Fields 在 runCrPrioritySql 之前；靜態程式碼驗證 |
| DET（確定性靜態掃描，AC-10 / I-DET-CR-01） | 3 | Unit（靜態） | 否 | 高 | grep：NEWID/random 為空；collectCrCandidates 移除；cr_reassignment_enabled 引用=0 |
| REG（回歸保護，F101 AC-8 更新） | 4 | PG Integration + Unit | **是** | 高 | F101 EMPL-005 is_cr 行為更新；Stage 3/4 不覆蓋 CR 案 emplid |
| UPGR（202606 重跑驗收，AC-13） | 3 | PG Integration + 人工 | **是** | 中（報告自動、驗收人工） | CR 三欄有值；is_cr='Y'≈1.9%；F067 差異報告 |
| **合計** | **55** | — | **52 案例需 Postgres** | — | GATE(PG 5) + STEP1 5 + STEP2 5 + STEP3 5 + DEDUCT 7 + EQ 7 + IDEM 3 + S2CLEAN 2 + S1SRC 3 + ORDER(PG 1) + REG(PG 4) + UPGR 2 = 49 PG；DET 3（靜態）；ORDER 靜態 1 |

---

## 一、GATE — 閘控 cr_enabled（AC-1/2/3/4）

> **設計依據**：F102 §4 AC-1/2/3/4；BR-F102-01/02/03；AD-E07-30 §3.3 I-CR-SNAPSHOT-01。
>
> **前置條件（GATE 群組共用）**：ob_monthly_run_result 工作集已由 Stage 1 帶入 cr_id/cr_nm/is_cr（I-CR-COLSRC-01）；Stage 2 已完成（tier_level 已寫入）；Stage 3 前清除（dept_id/emplid/assignday=NULL，is_cr 保留）已執行。

### TS-F102-GATE-001：cr_enabled=true 時執行 CR 前置步驟（AC-1）

- **相關 AC**：AC-1 / BR-F102-01
- **測試類型**：正向
- **測試層**：PG Integration
- **前置條件**：
  - 名單 OB202606001：`ob_list_definition.cr_enabled = true`
  - 工作集有 5 筆案件，其中 3 筆 `cr_id IS NOT NULL`（含逾2年/離職/有效各一情境）
  - Stage 2 完成；Stage 3 前清除已執行
- **步驟**：
  1. 執行 F102 CR 前置步驟（閘控 → 步驟 1 → 步驟 2 → 步驟 3）
  2. 查詢 ob_monthly_run_result 之 is_cr / emplid / cr_id 分佈
  3. 查詢執行日誌（assignment_run.skipped_cases 或 log）
- **期望結果**：
  - 逾2年案件：`cr_id = NULL`、`is_cr = 'N'`
  - 離職業代案件：`cr_id = NULL`、`is_cr = 'N'`
  - 有效 CR 案件（ob_empl_set ration>0）：`emplid = cr_id`、`is_cr = 'Y'`
  - 日誌記錄含 `cr_enabled=true` 之執行標記（BR-F102-01）

---

### TS-F102-GATE-002：cr_enabled=false 時跳過步驟 1–3 且 is_cr 強制清 N（AC-2）

- **相關 AC**：AC-2 / BR-F102-02
- **測試類型**：負向
- **測試層**：PG Integration
- **前置條件**：
  - 名單 OB202606002：`ob_list_definition.cr_enabled = false`
  - 工作集有 5 筆案件，其中 3 筆在 ob_pool_data_list 來源為 `is_cr = 'Y'`（Stage 1 帶入後 result 表有值）
- **步驟**：
  1. 執行 F102 CR 前置步驟（閘控）
  2. 查詢 ob_monthly_run_result 之 is_cr 值
- **期望結果**：
  - 全 5 筆案件 `is_cr = 'N'`（原 is_cr='Y' 的 3 筆被強制清 N，BR-F102-02）
  - 步驟 1/2/3 **不執行**（cr_id/cr_nm 不改動，無任何業代被指派）
  - 全 5 筆案件 emplid / dept_id 維持 NULL（進入 F101 標準比例分派池）

---

### TS-F102-GATE-003：cr_enabled=false 不讀全域旗標（AC-2 延伸 / BR-F102-03）

- **相關 AC**：AC-2 / BR-F102-03
- **測試類型**：負向（全域旗標廢除驗證）
- **測試層**：Unit / Integration
- **前置條件**：
  - `ob_assign_config` 有一筆 `config_key='cr_reassignment_enabled', config_value='true'` 記錄
  - 名單 `cr_enabled = false`
- **步驟**：
  1. 執行 CR 前置步驟閘控
  2. 驗證閘控決策來源
- **期望結果**：
  - 閘控結果 = false（跳過 CR 步驟），**不因** ob_assign_config 中全域旗標為 'true' 而改變
  - 閘控程式碼不讀取 `ob_assign_config`（靜態驗證：TS-F102-DET-003 搭配）

---

### TS-F102-GATE-004：混合 cr_enabled 名單同一月跑互不干擾（AC-3）

- **相關 AC**：AC-3 / BR-F102-01/02
- **測試類型**：正向（混合名單）
- **測試層**：PG Integration
- **前置條件**：
  - 同一月跑（run_id=R1）含 OB202606001（cr_enabled=true）與 OB202606002（cr_enabled=false）
  - OB202606001 工作集：10 筆案件，其中 3 筆有效 CR（ob_empl_set ration>0）
  - OB202606002 工作集：10 筆案件，其中 3 筆 Stage 1 帶入 is_cr='Y'
- **步驟**：
  1. 執行月跑完整流程（Stage 0–4）
  2. 分別查詢兩名單之 is_cr 分佈與 emplid 非空筆數
  3. 驗證月跑最終 status
- **期望結果**：
  - OB202606001：至少 3 筆 `is_cr = 'Y'`、`emplid = cr_id`（有效 CR 已指派）
  - OB202606002：**全 10 筆** `is_cr = 'N'`（強制清 N，無 is_cr='Y' 殘留）
  - 月跑 `status = 'completed'`
  - 兩名單 Stage 3/4 比例分派結果互不污染（各自獨立 WHERE list_no = :listNo）

---

### TS-F102-GATE-005：cr_enabled 月跑開始後鎖定（AC-4 / I-CR-SNAPSHOT-01）

- **相關 AC**：AC-4 / BR-F102-01 / I-CR-SNAPSHOT-01
- **測試類型**：負向（快照鎖定）
- **測試層**：Integration
- **前置條件**：月跑 status='running'；月跑開始時 cr_enabled=true 已快照
- **步驟**：
  1. 月跑執行中，嘗試修改 ob_list_definition.cr_enabled = false
  2. 修改被月跑鎖阻擋（沿用 US-107 / US-104 鎖定機制）
  3. 驗證月跑繼續使用 cr_enabled=true 快照完成
- **期望結果**：
  - 修改被阻擋（HTTP 409 或對應錯誤碼）
  - 月跑結果以 cr_enabled=true 執行（有 is_cr='Y' 案件）
  - 快照時機與 ob_dept_pct / ob_empl_set 一致（I-CR-SNAPSHOT-01）

---

### TS-F102-GATE-006：cr_enabled=false 名單全案件進 F101 比例分派池（AC-2 延伸）

- **相關 AC**：AC-2 / BR-F102-02 / BR-F102-12
- **測試類型**：正向（扣量不發生）
- **測試層**：PG Integration
- **前置條件**：cr_enabled=false 名單 OB202606002，10 筆案件；ob_dept_pct 有 ration>0 設定
- **步驟**：
  1. 執行完整 Stage 3 部門比例分派
  2. 查詢 Stage 3 案件池大小與 dept_id 非空筆數
- **期望結果**：
  - Stage 3 案件池 = **10 筆**（全部，無扣量）
  - 所有 10 筆案件均分配到 dept_id（比例分派正常執行，無 CR 干擾）

---

## 二、STEP1 — 步驟 1 逾2年清空邊界（AC-5）

> **設計依據**：F102 §4 AC-5；BR-F102-04/05；AD-E07-30 §5.2 步驟 1 規則；§10 @SYS_DT 計算。
>
> **Oracle 建立法（嚴格小於）**：
> - `@SYS_DT = project_workym + '01'`（名單月第一天）
> - `twoYearsAgo` = @SYS_DT 往回推 2 年之同月 1 日（'YYYY-MM-DD'）
> - **觸發條件**：`appl_date < twoYearsAgo`（嚴格小於，< 非 <=）
> - 例：project_workym='202607'，@SYS_DT='2026-07-01'，twoYearsAgo='2024-07-01'
>   - appl_date='2024-06-30'（< 2024-07-01）→ **觸發清空**
>   - appl_date='2024-07-01'（= 2024-07-01，非嚴格小於）→ **不清空**
>   - appl_date='2024-07-02'（> 2024-07-01）→ 不清空

### TS-F102-STEP1-001：逾2年嚴格小於邊界——觸發清空（AC-5，案件 A）

- **相關 AC**：AC-5 / BR-F102-04
- **測試類型**：負向 / 邊界
- **測試層**：PG Integration
- **前置條件**：
  - project_workym='202607'，@SYS_DT='2026-07-01'，twoYearsAgo='2024-07-01'
  - 案件 A：`appl_date = '2024-06-30'`（< twoYearsAgo）；`cr_id = 'E003'`；`is_cr = 'Y'`（Stage 1 帶入）
- **步驟**：執行步驟 1（逾2年清空）；查詢案件 A 之 cr_id / cr_nm / is_cr
- **期望結果**：
  - 案件 A：`cr_id = NULL`、`cr_nm = NULL`、`is_cr = 'N'`

---

### TS-F102-STEP1-002：逾2年嚴格小於邊界——不觸發（AC-5，案件 B 剛好等於）

- **相關 AC**：AC-5 / BR-F102-04
- **測試類型**：正向 / 邊界（精確等於不清空）
- **測試層**：PG Integration
- **前置條件**：
  - 同 STEP1-001 設定
  - 案件 B：`appl_date = '2024-07-01'`（= twoYearsAgo，非嚴格小於）；`cr_id = 'E004'`
- **步驟**：執行步驟 1；查詢案件 B 之 cr_id / is_cr
- **期望結果**：
  - 案件 B：`cr_id = 'E004'`（**不清空**）、`is_cr` 維持 Stage 1 帶入原值

---

### TS-F102-STEP1-003：ob_pool_data_list 原始資料不被修改（AC-5 / BR-F102-05）

- **相關 AC**：AC-5 / BR-F102-05
- **測試類型**：負向（pool 不可變性）
- **測試層**：PG Integration
- **前置條件**：案件 A（STEP1-001）執行清空後
- **步驟**：查詢 `ob_pool_data_list WHERE appl_no = 案件A.appl_no` 之 cr_id / is_cr
- **期望結果**：
  - ob_pool_data_list 中案件 A 之 `cr_id` **維持原值**（非 NULL）
  - ob_pool_data_list 中案件 A 之 `is_cr` **維持原值**
  - 清空操作限於 ob_monthly_run_result（run_id 限定工作集）

---

### TS-F102-STEP1-004：@SYS_DT 正確計算為名單月第一天

- **相關 AC**：AC-5 / BR-F102-04
- **測試類型**：正向（@SYS_DT 語意驗證）
- **測試層**：Unit
- **前置條件**：project_workym = '202606'
- **步驟**：呼叫 @SYS_DT 計算函式，取得 sysDate 與 twoYearsAgo
- **期望結果**：
  - sysDate = `'2026-06-01'`（名單月第一天）
  - twoYearsAgo = `'2024-06-01'`（往回推 2 年之同月 1 日）
  - 驗算：project_workym='202612' → sysDate='2026-12-01'，twoYearsAgo='2024-12-01'（跨年邊界）

---

### TS-F102-STEP1-005：逾2年邊界——兩天差異同組驗證（一觸發一不觸發）

- **相關 AC**：AC-5 / BR-F102-04
- **測試類型**：正向 / 邊界（一案觸發、一案不觸發，同 run_id）
- **測試層**：PG Integration
- **前置條件**：
  - project_workym='202607'；兩筆案件同一 run_id / list_no
  - 案件 A：`appl_date = '2024-06-30'`（觸發）；`cr_id = 'E010'`
  - 案件 B：`appl_date = '2024-07-01'`（不觸發）；`cr_id = 'E010'`
- **步驟**：執行步驟 1；查詢兩筆案件 cr_id / is_cr
- **期望結果**：
  - 案件 A：cr_id = NULL、is_cr = 'N'
  - 案件 B：cr_id = 'E010'（維持）、is_cr 維持原值
  - 驗證兩案件 cr_id 同為 'E010' 但結果不同（日期邊界為唯一決定因素）

---

## 三、STEP2 — 步驟 2 離職清空 + 查無不清（AC-6/7）

> **設計依據**：F102 §4 AC-6/7；BR-F102-06/07/08；AD-E07-30 §5.2 步驟 2 規則。
>
> **Oracle 建立法（嚴格小於）**：
> - **觸發條件**：`resign_date IS NOT NULL` AND `resign_date < sysDate`（嚴格小於）
> - `resign_date = sysDate`（等於）→ **不清空**
> - `resign_date IS NULL`（在職）→ **不清空**
> - `cr_id` 在 ob_emphire 查無 emp_id → **不清空**（INNER JOIN 不命中，BR-F102-08）

### TS-F102-STEP2-001：離職清空——resign_date < sysDate（AC-6，案件 C）

- **相關 AC**：AC-6 / BR-F102-06
- **測試類型**：負向 / 邊界
- **測試層**：PG Integration
- **前置條件**：
  - sysDate='2026-07-01'（project_workym='202607'）
  - ob_emphire：emp_id='E001'，resign_date='2026-06-15'（< '2026-07-01'）
  - 案件 C：`cr_id = 'E001'`（步驟 1 後 cr_id 非空）
- **步驟**：執行步驟 2（離職清空）；查詢案件 C 之 cr_id / is_cr
- **期望結果**：
  - 案件 C：`cr_id = NULL`、`cr_nm = NULL`、`is_cr = 'N'`

---

### TS-F102-STEP2-002：在職業代不清空——resign_date IS NULL（AC-6，案件 D）

- **相關 AC**：AC-6 / BR-F102-06
- **測試類型**：正向 / 邊界（在職）
- **測試層**：PG Integration
- **前置條件**：
  - ob_emphire：emp_id='E002'，resign_date = NULL
  - 案件 D：`cr_id = 'E002'`
- **步驟**：執行步驟 2；查詢案件 D 之 cr_id
- **期望結果**：案件 D：`cr_id = 'E002'`（維持，在職不清空）

---

### TS-F102-STEP2-003：離職日期等於 sysDate 不清空（resign_date = sysDate 邊界）

- **相關 AC**：AC-6 / BR-F102-06
- **測試類型**：正向 / 邊界（等於不觸發嚴格小於）
- **測試層**：PG Integration
- **前置條件**：
  - sysDate='2026-07-01'
  - ob_emphire：emp_id='E003'，resign_date='2026-07-01'（= sysDate）
  - 案件 E：`cr_id = 'E003'`
- **步驟**：執行步驟 2；查詢案件 E 之 cr_id
- **期望結果**：案件 E：`cr_id = 'E003'`（**不清空**；嚴格小於，等於不觸發）

---

### TS-F102-STEP2-004：CR 業代查無 ob_emphire 記錄不清空（AC-7 / BR-F102-08）

- **相關 AC**：AC-7 / BR-F102-08
- **測試類型**：負向（INNER JOIN 不命中語意）
- **測試層**：PG Integration
- **前置條件**：
  - ob_emphire：無任何 emp_id='E999' 之記錄
  - 案件 H：`cr_id = 'E999'`（cr_id 非空，但業代不存在於 ob_emphire）
- **步驟**：執行步驟 2；查詢案件 H 之 cr_id / is_cr
- **期望結果**：
  - 案件 H：`cr_id = 'E999'`（**不清空**）、`is_cr` 維持原值
  - 說明：INNER JOIN ob_emphire 不命中 → WHERE 不命中 → 不觸發清空（BR-F102-08 沿用 legacy INNER JOIN 語意）

---

### TS-F102-STEP2-005：兩規則皆執行不短路——步驟 1 清空後步驟 2 仍執行（AC-7 / BR-F102-07）

- **相關 AC**：AC-7 / BR-F102-07
- **測試類型**：正向（非短路）
- **測試層**：PG Integration
- **前置條件**：
  - 案件 E：同時滿足步驟 1（appl_date < twoYearsAgo）和步驟 2（resign_date < sysDate）
  - 案件 F：只滿足步驟 2（resign_date < sysDate），不滿足步驟 1
- **步驟**：
  1. 執行步驟 1（案件 E 被清空；案件 F cr_id 未清空）
  2. 驗證步驟 2 **仍執行**（不因步驟 1 已清空案件 E 而整體跳過步驟 2）
  3. 查詢案件 F 之 cr_id / is_cr（步驟 2 應清空案件 F）
- **期望結果**：
  - 案件 E：步驟 1 清空後，`cr_id = NULL`（步驟 2 無 cr_id 可比較，結果相同）
  - 案件 F：步驟 2 清空，`cr_id = NULL`、`is_cr = 'N'`
  - 確認：步驟 2 不因步驟 1 執行而跳過（BR-F102-07 兩規則皆執行）

---

## 四、STEP3 — CR 優先指派 + I-DET-CR-01（AC-8）

> **設計依據**：F102 §4 AC-8；BR-F102-09/10/11；AD-E07-30 §5.2 步驟 3 / §3.2 I-DET-CR-01。
>
> **前置條件（STEP3 群組共用）**：步驟 1/2 後，剩餘案件 cr_id 非空。

### TS-F102-STEP3-001：有 ration>0 設定才優先指派（AC-8，案件 F）

- **相關 AC**：AC-8 / BR-F102-09
- **測試類型**：正向
- **測試層**：PG Integration
- **前置條件**：
  - 案件 F：`cr_id = 'E003'`（步驟 1/2 後仍非空）
  - ob_empl_set：list_no=OB202606001，emplid='E003'，deptid_m='XVE1'，ration=30（> 0）
- **步驟**：執行步驟 3；查詢案件 F 之 emplid / dept_id / emplid_deptid / is_cr
- **期望結果**：
  - `emplid = 'E003'`、`dept_id = 'XVE1'`、`emplid_deptid = 'XVE1'`、`is_cr = 'Y'`

---

### TS-F102-STEP3-002：ob_empl_set 無記錄或 ration=0 不指派（AC-8，案件 G）

- **相關 AC**：AC-8 / BR-F102-09
- **測試類型**：負向
- **測試層**：PG Integration
- **前置條件**：
  - 案件 G：`cr_id = 'E004'`；ob_empl_set 無 emplid='E004' 之 ration>0 記錄（ration=0 或全無記錄）
- **步驟**：執行步驟 3；查詢案件 G 之 emplid / is_cr
- **期望結果**：
  - 案件 G：`emplid = NULL`、`dept_id = NULL`、`is_cr` 維持原值（非 'Y'）
  - 案件 G 進入 F101 比例分派池（未被 CR 預指派）

---

### TS-F102-STEP3-003：多筆 deptid_m 取 deptid_m ASC 第一筆（I-DET-CR-01）

- **相關 AC**：AC-8 / AC-10（確定性）/ BR-F102-11 / I-DET-CR-01
- **測試類型**：正向 / 確定性（多筆 deptid_m 選取）
- **測試層**：PG Integration
- **前置條件**：
  - 案件 I：`cr_id = 'E005'`
  - ob_empl_set（list_no=OB202606001，emplid='E005'，ration>0）有兩筆記錄：
    - 記錄 1：deptid_m='XVE2'，ration=20
    - 記錄 2：deptid_m='XVE1'，ration=30（deptid_m ASC 排序 XVE1 < XVE2）
- **步驟**：執行步驟 3；查詢案件 I 之 dept_id
- **期望結果**：
  - `dept_id = 'XVE1'`（deptid_m ASC 第一筆，非 'XVE2'）
  - `emplid_deptid = 'XVE1'`
  - `is_cr = 'Y'`
  - 確認：與 JS oracle 結果一致（I-DET-CR-01 確定性）

---

### TS-F102-STEP3-004：ob_emphire 查無記錄（BR-F102-08）的案件可通過步驟 3 指派

- **相關 AC**：AC-7 / AC-8 / BR-F102-08
- **測試類型**：正向（查無員工仍可 CR 指派）
- **測試層**：PG Integration
- **前置條件**：
  - 案件 H：`cr_id = 'E999'`；ob_emphire 無 emp_id='E999'（步驟 2 不清空）
  - ob_empl_set：list_no=OB202606001，emplid='E999'，ration=25，deptid_m='XVE1'
- **步驟**：步驟 2 不清空案件 H（INNER JOIN 不命中）→ 步驟 3 執行；查詢案件 H 之 emplid / is_cr
- **期望結果**：
  - 步驟 2 後：案件 H `cr_id = 'E999'`（不清空，BR-F102-08）
  - 步驟 3 後：案件 H `emplid = 'E999'`、`dept_id = 'XVE1'`、`is_cr = 'Y'`（ob_empl_set 命中，正常指派）
  - 說明：查無 ob_emphire 不代表無效，只代表步驟 2 不觸發；步驟 3 仍可指派

---

### TS-F102-STEP3-005：Worked Example 整體走查（§6 完整 8 案件驗證）

- **相關 AC**：AC-5/6/7/8 / BR-F102-04~11
- **測試類型**：正向 / 整合（worked example 驗證）
- **測試層**：PG Integration
- **前置條件**：依 F102 spec §6 完整 worked example 設定：
  - project_workym='202606'，@SYS_DT='2026-06-01'，twoYearsAgo='2024-06-01'
  - 8 筆案件（c1~c8）依 spec §6 表格設定 cr_id / appl_date / resign_date / ob_empl_set
- **步驟**：依序執行步驟 1 → 步驟 2 → 步驟 3；查詢 8 筆案件最終狀態
- **期望結果（對齊 §6 oracle）**：

| 案件 | 期望 is_cr | 期望 emplid | 說明 |
|---|---|---|---|
| c1（E003，2025-03-01，在職，XVE1） | Y | E003 | 步驟 3 指派 |
| c2（E003，2025-05-10，在職，XVE1） | Y | E003 | 步驟 3 指派 |
| c3（E005，2023-12-31，在職，XVE2） | N | NULL | 步驟 1 清空（< 2024-06-01） |
| c4（E006，2025-08-01，離職 2026-05-20，XVE2） | N | NULL | 步驟 2 清空（< 2026-06-01） |
| c5（E007，2025-09-01，在職，ration=0） | 維持原值（非Y） | NULL | 步驟 3 不指派（ration=0） |
| c6（E999，2025-10-01，ob_emphire查無，XVE1） | Y | E999 | 步驟 2 不清空（BR-F102-08）→ 步驟 3 指派 |
| c7（E003，2025-11-01，在職，XVE1） | Y | E003 | 步驟 3 指派 |
| c8（E003，2024-06-01，在職，XVE1） | Y | E003 | 剛好 ≥2年（= twoYearsAgo 不清空）→ 步驟 3 指派 |

- `is_cr = 'Y'` 共 5 件（c1/c2/c6/c7/c8）；清空 2 件（c3/c4）；不指派 1 件（c5）

---

## 五、DEDUCT — 步驟 4 扣量 + ASSIGNDAY 含 CR 案（AC-9 / I-CR-DEDUCT-01 修正版 / I-CR-ASSIGNDAY-01）

> **設計依據**：F102 §4 AC-9；BR-F102-12；AD-E07-30 §7（含 Bug 修正：兩層語意拆分）/ I-CR-DEDUCT-01（修正）/ I-CR-ASSIGNDAY-01（新增）。
>
> **⚠️ Bug 修正說明（2026-06-12 live 重跑驗證）**：原始設計錯誤地將 `is_cr<>'Y'` 過濾一律套用至 Stage 3/4/ASSIGNDAY 全部 CTE，導致 2,073 筆 CR 案件的 `assignday` 全為 NULL。根因：「**數量配額扣除**」與「**工作日散佈**」是兩件不同的事，不可混用同一過濾條件：
>
> | 操作 | CR 案件（is_cr='Y'）納入？ | 理由 |
> |---|---|---|
> | Stage 3 dept ration **配額計算** | **排除**（is_cr<>'Y'） | CR 案已有 emplid，不佔課的配額基數 |
> | Stage 4 empl ration **配額計算** | **排除**（is_cr<>'Y'） | CR 案已有 emplid，不佔員工配額基數 |
> | **ASSIGNDAY 工作日散佈** | **納入**（emplid IS NOT NULL） | CR 案已有 emplid，應隨 emplid 依千分比散佈工作日 |

### TS-F102-DEDUCT-001：F101 Stage 3 案件池 WHERE is_cr<>'Y'（AC-9）

- **相關 AC**：AC-9 / BR-F102-12 / I-CR-DEDUCT-01
- **測試類型**：正向
- **測試層**：PG Integration
- **前置條件**：
  - 名單 OB202606001：100 筆案件，其中 5 筆 CR 已指派（is_cr='Y'）
  - ob_dept_pct 有 ration>0 設定；ob_empl_set 有員工設定
- **步驟**：
  1. CR 前置步驟完成（5 筆 is_cr='Y'）
  2. 執行 F101 Stage 3 部門比例分派
  3. 查詢 Stage 3 分配總件數（dept_id 非 NULL 件數）
- **期望結果**：
  - Stage 3 分配件數 = **95 件**（100 − 5 = 95，扣除 CR 預指派 5 件）
  - 5 筆 is_cr='Y' 案件之 dept_id = CR 步驟 3 寫入值（非 NULL），Stage 3 **不覆蓋**

---

### TS-F102-DEDUCT-002：CR 案件 emplid/dept_id 不被 Stage 3/4 覆蓋（AC-9）

- **相關 AC**：AC-9 / I-CR-DEDUCT-01
- **測試類型**：回歸（不覆蓋驗證）
- **測試層**：PG Integration
- **前置條件**：CR 步驟 3 已指派 5 筆（emplid=cr_id，dept_id=deptid_m，is_cr='Y'）；Stage 3/4 完成
- **步驟**：Stage 3/4 完成後，查詢 5 筆 is_cr='Y' 案件之 emplid / dept_id
- **期望結果**：
  - 5 筆案件的 emplid = CR 步驟寫入值（不被 Stage 4 比例分派覆蓋）
  - 5 筆案件的 dept_id = CR 步驟寫入值（不被 Stage 3 比例分派覆蓋）
  - 確認：F101 Stage 3/4 的 UPDATE 有 `AND (r.is_cr IS NULL OR r.is_cr <> 'Y')` 條件

---

### TS-F102-DEDUCT-003：Stage 4 員工比例分派計算基數不含 CR 案（AC-9 延伸）

- **相關 AC**：AC-9 / BR-F102-12
- **測試類型**：正向（基數驗證）
- **測試層**：PG Integration
- **前置條件**：
  - 課 XVE1 / T1：共 51 件，其中 4 件 is_cr='Y'（CR 預指派）
  - ob_empl_set（XVE1）= E1(40%), E2(35%), E3(25%)
- **手算（Stage 4 基數）**：
  - Stage 4 計算基數 = 51 − 4 = **47 件**（扣除 CR 4 件）
  - FLOOR(47×40/100)=18；FLOOR(47×35/100)=16；FLOOR(47×25/100)=11；Σ=45；diff=2
  - deptid_m ASC 補足：E1(+1)、E2(+1）
  - 最終：E1=19, E2=17, E3=11（Σ=47 ✓）
- **步驟**：執行 Stage 4；查詢 XVE1 / T1 之 emplid 分佈（排除 is_cr='Y' 的 4 件）
- **期望結果**：
  - E1 = **19**；E2 = **17**；E3 = **11**；合計 = **47**（非全 51 件）
  - CR 4 件之 emplid = CR 步驟寫入值（不被 Stage 4 計算）

---

### TS-F102-DEDUCT-004：cr_enabled=false 名單扣量不發生（AC-2/9 聯合）

- **相關 AC**：AC-2 / AC-9 / BR-F102-02/12
- **測試類型**：負向（扣量不發生情境）
- **測試層**：PG Integration
- **前置條件**：
  - cr_enabled=false 名單 OB202606002：50 筆案件，is_cr 全清 N
  - ob_dept_pct（OB202606002）= 課A(50), 課B(30), 課C(20)
- **步驟**：Stage 3 完成；查詢 dept_id 分佈
- **期望結果**：
  - Stage 3 案件池 = **50 件**（全部，無扣量）
  - dept_id 分佈：課A=25, 課B=15, 課C=10（FLOOR 100% 基數）
  - 無任何 is_cr='Y' 案件（BR-F102-02 已強制清 N）

---

### TS-F102-DEDUCT-005：CR 案件 assignday 全非 NULL（I-CR-ASSIGNDAY-01 核心斷言）

- **相關 AC**：AC-9 / I-CR-ASSIGNDAY-01
- **測試類型**：正向（ASSIGNDAY 含 CR 案）
- **測試層**：PG Integration
- **前置條件**：
  - 名單 OB202606001：100 筆案件，其中 5 筆 CR 已指派（is_cr='Y'，emplid=cr_id）
  - ob_calendar（202606）有 20 個工作日（rest_flg='0'）
  - CR 業代（cr_id）在 ob_empl_set 中有 ration>0 設定
- **步驟**：
  1. CR 前置步驟完成（5 筆 is_cr='Y'，emplid 有值）
  2. Stage 3/4 完成（95 筆非 CR 案件分配 dept_id/emplid）
  3. ASSIGNDAY 散佈執行
  4. 查詢 5 筆 is_cr='Y' 案件之 assignday
- **期望結果**：
  - 5 筆 is_cr='Y' 案件之 `assignday` **全非 NULL**（I-CR-ASSIGNDAY-01）
  - assignday 日期均屬 ob_calendar 中 rest_flg='0' 的工作日（無假日）
  - 確認：ASSIGNDAY 案件池 `WHERE emplid IS NOT NULL`（含 CR 案件，無 is_cr 過濾）

---

### TS-F102-DEDUCT-006：CR 案 assignday 散佈正確——依 emplid 與千分比（I-CR-ASSIGNDAY-01）

- **相關 AC**：AC-9 / I-CR-ASSIGNDAY-01
- **測試類型**：正向（ASSIGNDAY 散佈驗證）
- **測試層**：PG Integration
- **前置條件**：
  - 員工 E003（cr_id='E003'）：CR 案件 4 筆（is_cr='Y'）+ 非 CR 案件（Stage 4 比例分派）共計 21 筆（emplid='E003'）
  - ob_calendar（202606）：20 工作日，ratioPerMille = FLOOR(1000/20) = 50
- **手算（E003 共 21 件，工作日 20 天）**：
  - per casedt = FLOOR(21×50/1000) = 1 件 × 20 casedt = 20 件
  - 最末 casedt 吸收餘額 = 21−20 = 1 → **最末日 2 件，其餘 19 日各 1 件**（Σ=21 ✓）
  - 4 筆 CR 案件（is_cr='Y'）按 `(orgno, appl_no) ASC` 之 EMP_ORD 納入 21 件計算
- **步驟**：ASSIGNDAY 完成後，查詢 E003 之 `(assignday, COUNT(*))` 分佈（含 is_cr='Y' 和 is_cr<>'Y' 的 E003 案件）
- **期望結果**：
  - 19 個工作日各 1 件；最末工作日 = **2 件**（手算 oracle）
  - 全 21 件 `assignday IS NOT NULL`（含 CR 4 件）
  - CR 4 件散佈於不同工作日（**不集中於同一日**）
  - 確認：ASSIGNDAY total 計算包含 CR 案件（emplid IS NOT NULL 無 is_cr 過濾）

---

### TS-F102-DEDUCT-007：雙重斷言——配額基數不含 CR、ASSIGNDAY 含 CR（I-CR-DEDUCT-01 + I-CR-ASSIGNDAY-01 聯合）

- **相關 AC**：AC-9 / I-CR-DEDUCT-01（修正）/ I-CR-ASSIGNDAY-01
- **測試類型**：正向（兩層語意聯合驗收，DoD 雙重斷言）
- **測試層**：PG Integration
- **前置條件**：
  - 名單 OB202606001：課 XVE1 / T1，共 51 件（其中 4 件 is_cr='Y'）
  - ob_empl_set（XVE1）= E1(40%), E2(35%), E3(25%)；E003 為 CR 業代（4 件 is_cr='Y'，emplid=E1）
  - ob_calendar：20 工作日
- **步驟**：完整執行 Stage 3 + Stage 4 + ASSIGNDAY；分別查詢：
  - (a) Stage 4 empl 配額計算基數（XVE1 / T1）
  - (b) ASSIGNDAY 散佈案件池（emplid IS NOT NULL 的案件集合）
- **期望結果**：
  - **(a) 配額基數 = 47 件**（51 − 4 CR 件，is_cr<>'Y' 計算，I-CR-DEDUCT-01）
    - E1=19, E2=17, E3=11（手算：FLOOR(47×40/100)+diff1，對齊 DEDUCT-003 oracle）
  - **(b) ASSIGNDAY 案件池 = 51 件**（含 4 件 is_cr='Y'，I-CR-ASSIGNDAY-01）
    - `SELECT COUNT(*) FROM ob_monthly_run_result WHERE run_id=:runId AND list_no=:listNo AND emplid IS NOT NULL` = **51**
    - 全 51 件 assignday IS NOT NULL
  - 兩斷言在同一 run_id 同時成立（兩層語意互不矛盾）

---

## 六、EQ — JS↔SQL 逐列等價（DoD 驗收門檻）

> **設計依據**：F102 §5 dual-path gate；AD-E07-30 §11；比照 F101 AC-15 EQ 架構（F101-test.md §四）。
>
> **共用測試骨架（給 tdd-implementation）**：對每個代表性情境，在 PG 真庫同一份 seed 上：
> 1. 跑 JS `applyCrPriority(crCases, emplSet, emphire, sysDate)` → 取六元組集合 `S_js = { (orgno, appl_no, cr_id, cr_nm, is_cr, emplid, dept_id, emplid_deptid) }`。
> 2. 跑 PG `runCrPrioritySql(manager, ctx)` 後 SELECT 同一表 → 取 `S_sql`。
> 3. **斷言 `S_js` 與 `S_sql` 逐列相同**：`expect(sort(S_sql)).toEqual(sort(S_js))` 以 `(orgno, appl_no)` 為主鍵排序。
>
> **覆蓋要求（7 個情境）**：
> (a) 逾2年清空（步驟 1）；(b) 離職清空（步驟 2）；(c) 查無 ob_emphire 不清空（BR-F102-08）；
> (d) CR 指派（步驟 3，ration>0 命中）；(e) 多筆 deptid_m 取 ASC 第一筆（I-DET-CR-01）；
> (f) cr_enabled=false 強制清 N；(g) CR 案件 ASSIGNDAY 散佈（I-CR-ASSIGNDAY-01）。

### TS-F102-EQ-001：步驟 1 逾2年清空逐列等價

- **相關 AC**：AC-5 / AC-10 / DoD
- **測試類型**：正向 / DoD 驗收
- **測試層**：PG Integration（**強制 Postgres**）
- **前置條件**：EQ-001 seed：3 筆案件（一筆 appl_date < twoYearsAgo，兩筆 >= twoYearsAgo）；均有 cr_id
- **步驟**：同架構跑 JS + PG；比對 `sort(S_sql) toEqual sort(S_js)`
- **期望結果**：
  - JS 與 SQL 六元組逐列相同
  - 觸發清空案件：JS 與 SQL 均 cr_id=NULL, is_cr='N'
  - 未觸發案件：JS 與 SQL 均維持原值

---

### TS-F102-EQ-002：步驟 2 離職清空逐列等價（含 BR-F102-08 查無不清）

- **相關 AC**：AC-6/7 / DoD
- **測試類型**：正向 / DoD 驗收
- **測試層**：PG Integration
- **前置條件**：EQ-002 seed：3 筆案件（resign_date < sysDate / resign_date IS NULL / emp_id 查無）
- **步驟**：同架構跑 JS + PG；比對逐列等價
- **期望結果**：
  - 離職案件：JS 與 SQL 均清空
  - 在職案件：JS 與 SQL 均維持
  - 查無 ob_emphire 案件：JS 與 SQL **均不清空**

---

### TS-F102-EQ-003：步驟 3 CR 優先指派逐列等價（ration>0 命中）

- **相關 AC**：AC-8 / DoD
- **測試類型**：正向 / DoD 驗收
- **測試層**：PG Integration
- **前置條件**：EQ-003 seed：2 筆案件（ob_empl_set ration>0 有記錄 / 無記錄或 ration=0）
- **步驟**：同架構跑 JS + PG；比對六元組逐列等價
- **期望結果**：
  - 有 ration 案件：JS 與 SQL 均 emplid=cr_id, dept_id=deptid_m, is_cr='Y'
  - 無 ration 案件：JS 與 SQL 均維持原值（is_cr 非 'Y'）

---

### TS-F102-EQ-004：多筆 deptid_m I-DET-CR-01 取捨等價

- **相關 AC**：AC-8 / AC-10 / I-DET-CR-01 / DoD
- **測試類型**：正向 / DoD 驗收（確定性）
- **測試層**：PG Integration
- **前置條件**：EQ-004 seed：1 筆案件 cr_id='E005'；ob_empl_set 兩筆（deptid_m='XVE1' / 'XVE2'，均 ration>0）
- **步驟**：同架構跑 JS + PG；比對六元組逐列等價
- **期望結果**：
  - JS oracle：`dept_id = 'XVE1'`（deptid_m ASC 排序，'XVE1' < 'XVE2'）
  - PG SQL：CTE `ROW_NUMBER() OVER (PARTITION BY emplid ORDER BY deptid_m ASC)` rn=1 = 'XVE1'
  - JS 與 SQL 六元組完全相同（確定性等價 I-DET-CR-01）

---

### TS-F102-EQ-005：cr_enabled=false 強制清 N 等價

- **相關 AC**：AC-2 / DoD
- **測試類型**：正向 / DoD 驗收
- **測試層**：PG Integration
- **前置條件**：EQ-005 seed：5 筆案件，其中 3 筆 Stage 1 帶入 is_cr='Y'；cr_enabled=false
- **步驟**：同架構跑 JS（if (!cr_enabled) 強制清 N）+ PG；比對 is_cr 逐列等價
- **期望結果**：
  - JS 與 SQL：全 5 筆案件 is_cr='N'（3 筆 is_cr='Y' 均被清 N）
  - JS 與 SQL 六元組完全相同

---

### TS-F102-EQ-006：完整 worked example 逐列等價（§6 8 案件）

- **相關 AC**：AC-5~9 / AC-10 / DoD
- **測試類型**：正向 / DoD 驗收（完整端到端）
- **測試層**：PG Integration
- **前置條件**：EQ-006 seed：完整 §6 worked example 8 筆案件（c1~c8）
- **步驟**：同架構跑 JS `applyCrPriority` + PG `runCrPrioritySql`；比對六元組逐列等價
- **期望結果**：
  - JS 與 SQL 六元組（cr_id/cr_nm/is_cr/emplid/dept_id/emplid_deptid）**逐列完全相同**
  - is_cr='Y' 案件集合：{c1, c2, c6, c7, c8}（JS 與 SQL 相同）
  - is_cr='N' 清空案件集合：{c3, c4}（JS 與 SQL 相同）
  - is_cr 維持原值案件：{c5}（JS 與 SQL 相同）

---

### TS-F102-EQ-007：CR 案件 ASSIGNDAY 散佈逐列等價（I-CR-ASSIGNDAY-01 / DoD）

- **相關 AC**：AC-9 / I-CR-ASSIGNDAY-01 / DoD
- **測試類型**：正向 / DoD 驗收（ASSIGNDAY 含 CR 案件等價）
- **測試層**：PG Integration（**強制 Postgres**）
- **前置條件**：
  - EQ-007 seed：10 筆案件，其中 3 筆 is_cr='Y'（emplid='E003'）、7 筆非 CR（emplid='E003' 或其他）
  - ob_calendar：該月 20 工作日
  - 共用 seed 確保 JS oracle 與 PG SQL 使用相同 emplid 分組
- **步驟**：
  1. 同一 PG 真庫，同一份 seed
  2. 跑 JS `distributeStage3to4`（含 `crPreassigned` 參數補入 CR 案件）→ 取 `(orgno, appl_no, assignday)` 集合 `S_js`
  3. 跑 PG `runAssignDaySql`（`WHERE emplid IS NOT NULL`，無 is_cr 過濾）→ 取 `S_sql`
  4. 比對 `sort(S_sql) toEqual sort(S_js)` 以 `(orgno, appl_no)` 排序
- **期望結果**：
  - `S_js` 與 `S_sql` 之 assignday **逐列完全相同**（含 3 筆 is_cr='Y' 案件）
  - 3 筆 is_cr='Y' 案件：JS 與 SQL 均 `assignday IS NOT NULL`
  - 確認：JS 路徑 `assignDays` 函式合併了 `crPreassigned` 案件；PG 路徑 `ranked` CTE 不過濾 is_cr

---

## 七、IDEM — 重跑安全（AC-10 延伸）

> **設計依據**：F102 §8 A-4；AD-E07-30 §9 I-IDEM-01 延伸；BR-F102-05（不改 pool）。

### TS-F102-IDEM-001：兩次不同 run_id 逐列等價（確定性可重現，AC-10）

- **相關 AC**：AC-10 / BR-F102-11 / I-DET-CR-01 / I-DET-01
- **測試類型**：確定性驗證
- **測試層**：PG Integration
- **前置條件**：固定 seed（ob_empl_set / ob_emphire / cr_id/appl_date 不變）；R1 / R2 使用不同 run_id
- **步驟**：
  1. run_id=R1 執行 CR 前置步驟 → 取六元組集合 S1
  2. 清除 R1（DELETE ob_monthly_run_result WHERE run_id=R1）；run_id=R2 重新執行
  3. 取 R2 六元組集合 S2；比對 `sort(S1) toEqual sort(S2)`
- **期望結果**：S1 = S2（逐列完全相同，包含六元組精確值）

---

### TS-F102-IDEM-002：CR 步驟 SET-based UPDATE 冪等（同 run_id 重複執行）

- **相關 AC**：AC-10 / I-IDEM-01
- **測試類型**：冪等（重複執行結果不變）
- **測試層**：PG Integration
- **前置條件**：run_id=R1 已執行一次 CR 前置步驟（有 is_cr='Y' 案件）
- **步驟**：
  1. 對同一 run_id 重複執行 CR 前置步驟
  2. 查詢 is_cr='Y' 案件集合
- **期望結果**：
  - 兩次執行後 is_cr='Y' 案件集合相同（SET-based UPDATE 冪等，BR-F102-05 / I-IDEM-01）
  - 重複執行不改變 ob_pool_data_list 原始資料

---

### TS-F102-IDEM-003：月跑重觸發（per-list auto-commit + CR 步驟冪等）

- **相關 AC**：AC-10 / I-IDEM-01 延伸
- **測試類型**：冪等（list 間中斷後重跑）
- **測試層**：PG Integration
- **前置條件**：2 張名單（L1 cr_enabled=true / L2 cr_enabled=false）；L1 完成 CR 步驟後模擬中斷
- **步驟**：重新觸發，L1 重跑（Stage 3 前清除 + CR 步驟重執行），L2 正常執行
- **期望結果**：
  - L1 重跑後 CR 指派結果與第一次相同（is_cr='Y' 案件集合一致）
  - L2 結果正確（is_cr 全 N，不受 L1 重跑影響）
  - 月跑最終 status = completed

---

## 八、S2CLEAN — Stage 2 不寫 is_cr（I-CR-STAGE2-CLEAN-01）

> **設計依據**：AD-E07-30 §8 / I-CR-STAGE2-CLEAN-01；移除 runStage2and3Sql 之 crExpr 邏輯。

### TS-F102-S2CLEAN-001：Stage 2 執行後 is_cr 仍為 Stage 1 帶入原值

- **相關 AC**：I-CR-STAGE2-CLEAN-01 / BR-F102-01~05
- **測試類型**：回歸（Stage 2 不寫 is_cr）
- **測試層**：PG Integration
- **前置條件**：
  - Stage 1 帶入 3 筆：`is_cr = 'Y'`（pool 原始 is_cr='Y'）；2 筆：`is_cr = 'N'`
  - Stage 2 執行（計分 + tier_level 更新）
- **步驟**：Stage 2 完成後（Stage 3 前），查詢 ob_monthly_run_result.is_cr 值
- **期望結果**：
  - 3 筆 is_cr = 'Y'（與 Stage 1 帶入值相同，Stage 2 **未修改**）
  - 2 筆 is_cr = 'N'（維持）
  - Stage 2 的 `runStage2and3Sql` UPDATE 語句不含 is_cr 欄位（靜態驗證見 TS-F102-DET-002）

---

### TS-F102-S2CLEAN-002：Stage 2 只寫 score / card_level / tier_level（靜態行為斷言）

- **相關 AC**：I-CR-STAGE2-CLEAN-01
- **測試類型**：回歸（欄位寫入範圍）
- **測試層**：Unit（靜態）
- **前置條件**：F102 實作後的 stage2to4-sql-executor.ts
- **步驟**：
  1. 確認 `runStage2and3Sql` 之 UPDATE SET 子句中包含：score / card_level / tier_level
  2. 確認 UPDATE SET 子句中**不包含** is_cr（grep 驗證）
- **期望結果**：
  - `grep -n "is_cr" <runStage2and3Sql 函式範圍>` 命中 = 0（Stage 2 不更新 is_cr）
  - crExpr / crEnabled 相關變數已移除（I-CR-STAGE2-CLEAN-01）

---

## 九、S1SRC — Stage 1 帶入 cr_id/cr_nm/is_cr（I-CR-COLSRC-01）

> **設計依據**：AD-E07-30 §3.1 I-CR-COLSRC-01；方案 A 裁示（Stage 1 INSERT…SELECT 帶入）。

### TS-F102-S1SRC-001：Stage 1 INSERT 後 result 表 cr_id/cr_nm/is_cr 非全空

- **相關 AC**：AC-1（前置）/ I-CR-COLSRC-01
- **測試類型**：正向（欄位流向驗證）
- **測試層**：PG Integration
- **前置條件**：
  - ob_pool_data_list 有 3 筆 cr_id 非空（cr_nm 非空，is_cr='Y'/'N' 混合）
  - Stage 1 INSERT…SELECT 執行
- **步驟**：查詢 ob_monthly_run_result 中對應案件之 cr_id / cr_nm / is_cr
- **期望結果**：
  - 對應 pool 中 cr_id 非空之案件：result 表 cr_id = pool.cr_id（非 NULL）
  - cr_nm 對應一致；is_cr 對應一致（Y/N 各案）
  - ob_monthly_run_result 三欄**不全為空**（I-CR-COLSRC-01 驗證）

---

### TS-F102-S1SRC-002：pool cr_id=NULL 之案件 result 表 cr_id 亦為 NULL

- **相關 AC**：I-CR-COLSRC-01
- **測試類型**：正向（NULL 傳遞驗證）
- **測試層**：PG Integration
- **前置條件**：ob_pool_data_list 有 2 筆 cr_id = NULL
- **步驟**：Stage 1 INSERT 後，查詢對應 result 表之 cr_id
- **期望結果**：result 表 cr_id = NULL（NULL 正確傳遞，非誤填任何值）

---

### TS-F102-S1SRC-003：Stage 1 帶入後 CR 步驟只對 result 工作集 UPDATE（不讀回 pool）

- **相關 AC**：I-CR-COLSRC-01
- **測試類型**：回歸（資料流向）
- **測試層**：Unit（靜態）
- **前置條件**：F102 cr-priority.ts / cr-priority-sql.ts 實作後
- **步驟**：
  - `grep -rn "ob_pool_data_list" <cr-priority.ts>` 與 `<cr-priority-sql.ts>`
- **期望結果**：命中 = **0**（CR 步驟不直接讀取 ob_pool_data_list，僅對 result 工作集操作）

---

## 十、ORDER — 執行順序 I-CR-ORDER-01

> **設計依據**：AD-E07-30 §3.1 / §4.3 I-CR-ORDER-01；C-2 裁示（clearStage3Fields 在 CR 步驟之前）。

### TS-F102-ORDER-001：clearStage3Fields 在 runCrPrioritySql 之前（靜態驗證）

- **相關 AC**：I-CR-ORDER-01 / BR-F102-12
- **測試類型**：回歸（執行順序靜態驗證）
- **測試層**：Unit（靜態）
- **前置條件**：F102 修改後的 assignment-run-pipeline.service.ts（executeStage2to4Pushdown / executeV2）
- **步驟**：
  1. 在 `executeStage2to4Pushdown` 函式中確認呼叫順序：`clearStage3Fields` 出現行號 < `runCrPrioritySql` 出現行號
  2. 在 `executeV2` 函式中確認：`applyCrPriority` 呼叫在 `distributeStage3to4` 之前
- **期望結果**：
  - PG 路徑：`clearStage3Fields` 在 `runCrPrioritySql` 之前被呼叫（行號比較）
  - JS 路徑：`applyCrPriority` 在 `distributeStage3to4` 之前被呼叫
  - I-CR-ORDER-01：F101清除 → F102 CR前置 → F101 Stage3 ration → F101 Stage4 ration（嚴格序）

---

### TS-F102-ORDER-002：步驟 3 寫入後不被 Stage 3 清除覆蓋（行為驗證）

- **相關 AC**：I-CR-ORDER-01 / AC-9 / BR-F102-12
- **測試類型**：回歸（CR emplid/dept_id 不被清除覆蓋）
- **測試層**：PG Integration
- **前置條件**：
  - CR 步驟 3 完成，3 筆 is_cr='Y'，emplid/dept_id 有值
  - 執行 Stage 3 部門比例分派（含 Stage 3 前清除，清 dept_id/emplid/assignday，保留 is_cr）
- **步驟**：Stage 3 完成後，查詢 3 筆 is_cr='Y' 案件之 emplid / dept_id
- **期望結果**：
  - 3 筆案件 emplid = CR 步驟寫入值（**非 NULL**，非 Stage 3 重新分派）
  - 3 筆案件 dept_id = CR 步驟寫入值（非 NULL，非 Stage 3 重新分派）
  - 確認：Stage 3 的 UPDATE 條件 `AND (r.is_cr IS NULL OR r.is_cr <> 'Y')` 正確排除 CR 案件

---

## 十一、DET — 確定性靜態掃描（AC-10 / I-DET-CR-01 / AC-12）

> **設計依據**：F102 §4 AC-10/12；AD-E07-30 §9 I-DET-01（繼承）/ I-DET-CR-01。

### TS-F102-DET-001：CR 步驟全程無亂數函式（I-DET-01 / I-DET-CR-01）

- **相關 AC**：AC-10 / I-DET-01 / I-DET-CR-01 / BR-F102-11
- **測試類型**：靜態掃描（Static Analysis）
- **測試層**：Unit（靜態）
- **前置條件**：F102 新增 / 修改之檔案（cr-priority.ts / cr-priority-sql.ts / assignment-run-pipeline.service.ts 等）
- **步驟**：
  - `grep -rE "NEWID\(\)|Math\.random\(\)|ORDER BY RANDOM\(\)|crypto\.randomUUID\(\)" <F102-files>`
- **期望結果**：命中數 = **0**（全程無亂數）

---

### TS-F102-DET-002：Stage 2 移除 crExpr / collectCrCandidates（I-CR-STAGE2-CLEAN-01 靜態面）

- **相關 AC**：I-CR-STAGE2-CLEAN-01
- **測試類型**：靜態掃描
- **測試層**：Unit（靜態）
- **前置條件**：F102 修改後的 stage2to4-sql-executor.ts / assignment-run-pipeline.service.ts
- **步驟**：
  - `grep -rE "crExpr|crEnabled.*stage2|collectCrCandidates|crApplPerList|crEnabledListNos" <F102-modified-files>`
- **期望結果**：命中數 = **0**（F102 後 Stage 2 舊 CR 邏輯完全移除）

---

### TS-F102-DET-003：無 service / controller 讀取全域旗標（AC-12 / I-CR-CONFIG-DEPR-01）

- **相關 AC**：AC-12 / BR-F102-13 / I-CR-CONFIG-DEPR-01
- **測試類型**：靜態掃描（Static Analysis）
- **測試層**：Unit（靜態）
- **前置條件**：F102 上線後之 codebase（entity / migration / seed 除外）
- **步驟**：
  - `grep -rE "cr_reassignment_enabled" apps/api/src/**/*.ts`（排除 entity / migration / seed）
  - `grep -rE "cr_reassignment_enabled" apps/web/src/**/*.ts`
- **期望結果**：
  - apps/api/src 命中（排除 entity/migration/seed）= **0**
  - apps/web/src 命中 = **0**
  - 說明：entity class 加 `[DEPRECATED-F102]` 注解不算引用，此 grep 排除 entity 檔案

---

## 十二、REG — 回歸保護（F101 AC-8 更新 + CR 指派保護）

> **設計依據**：F101 BR-F101-12（simplified is_cr 廢除）；AD-E07-30 §4.2 collectCrCandidates 移除；F101 TS-F101-EMPL-005 需更新期望值。
>
> **⚠️ F101 EMPL-005 期望值更新說明（重要）**：
> F101 TS-F101-EMPL-005「simplified is_cr — Y/N 同池，不分流（AC-8）」的測試情境在 F102 後語意變更：
> - **F101 original (simplified is_cr)**：is_cr='Y' 的 40 件「混入」比例池，Stage 4 不優先指派
> - **F102 after (cr_enabled=true)**：is_cr='Y' 案件**排除**於 Stage 4 比例池外（步驟 4 扣量）
> - **F102 after (cr_enabled=false)**：is_cr 全清 N → 全部入池，行為與 simplified is_cr 一致
>
> tdd-implementation 須依 cr_enabled 設定修改 TS-F101-EMPL-005 的 seed 與期望值（見 TS-F102-REG-001）。

### TS-F102-REG-001：F101 EMPL-005 期望值更新——cr_enabled=false 維持 simplified 語意

- **相關 AC**：F101 AC-8 / BR-F101-12 更新
- **測試類型**：回歸（F101 測試更新）
- **測試層**：PG Integration
- **前置條件**：
  - 課 XVE3 / T2，100 件；2 員工 J1(60%)/J2(40%)
  - **cr_enabled = false**（強制 is_cr='N'）
- **步驟**：執行完整 F101 Stage 4；查詢 J1/J2 件數
- **期望結果（更新後）**：
  - J1 = **60**；J2 = **40**；合計 = **100**（全部案件入池，因 cr_enabled=false）
  - is_cr 欄位全為 'N'（GATE-002 強制清 N）
  - 說明：此案例須指定 cr_enabled=false，確保 simplified is_cr 語意延續（F101 EMPL-005 原始語意等效）

---

### TS-F102-REG-002：cr_enabled=true 時 is_cr='Y' 案件扣除後 Stage 4 比例分佈（扣量回歸）

- **相關 AC**：AC-9 / BR-F102-12 / I-CR-DEDUCT-01
- **測試類型**：回歸（扣量後比例正確性）
- **測試層**：PG Integration
- **前置條件**：
  - 課 XVE3 / T2：原 100 件，其中 10 件 is_cr='Y'（CR 已指派）
  - 2 員工 J1(60%)/J2(40%)
- **手算（基數 = 90）**：FLOOR(90×60/100)=54；FLOOR(90×40/100)=36；Σ=90；diff=0
- **步驟**：Stage 4 完成後，查詢 J1/J2 件數（排除 is_cr='Y' 的 10 件）
- **期望結果**：
  - J1 = **54**；J2 = **36**；合計 = **90**（非 100）
  - CR 10 件之 emplid = CR 步驟寫入值（不被 Stage 4 覆蓋）

---

### TS-F102-REG-003：Stage 3 前清除不清 is_cr（延伸 F101 IDEM-001 回歸）

- **相關 AC**：F101 AC-4 / I-IDEM-01 / I-CR-ORDER-01
- **測試類型**：回歸（clearStage3Fields 不清 is_cr）
- **測試層**：PG Integration
- **前置條件**：Stage 1 帶入 3 筆 is_cr='Y'；執行 clearStage3Fields
- **步驟**：clearStage3Fields 後，查詢 ob_monthly_run_result.is_cr
- **期望結果**：
  - dept_id = NULL（已清除）
  - emplid = NULL（已清除）
  - assignday = NULL（已清除）
  - is_cr = **'Y'**（3 筆**保留**，clearStage3Fields 不清 is_cr）

---

### TS-F102-REG-004：F059 doc body 已修正（AC-11）

- **相關 AC**：AC-11 / BR-F102-13 / US-154 AC-4
- **測試類型**：文件驗證（靜態）
- **測試層**：Unit（靜態文件掃描）
- **前置條件**：F102 上線後之 F059-toggle-cr-reassignment.md
- **步驟**：
  1. 讀取 F059 §1（功能摘要）—確認含 `[DEPRECATED]` 標記
  2. 讀取 F059 §6 BR-1 — 確認含 `[DEPRECATED]` 標記及 per-list 說明
  3. 確認 DEPRECATED header `supersededBy` 含 F050, F051, ob_list_definition.cr_enabled
- **期望結果**：
  - F059 §1 含「`[DEPRECATED]`」且提及「per-list 欄位 `ob_list_definition.cr_enabled`」
  - F059 §6 BR-1 含「`[DEPRECATED]`」及 per-list 說明
  - DEPRECATED header 完整（BR-F102-13）

---

## 十三、UPGR — 202606 重跑驗收（AC-13）

> **設計依據**：F102 §4 AC-13；F102 §9（Production 分派變化知會）；NFR-005（F067 差異報告硬性前置）。

### TS-F102-UPGR-001：202606 重跑——CR 三欄有值（AC-13）

- **相關 AC**：AC-13 / BR-F102-09
- **測試類型**：Integration（自動）+ 人工驗收
- **測試層**：PG Integration
- **前置條件**：202606 含 cr_enabled=true 之代表性名單（OB202606001）重跑完成
- **步驟**：
  1. 查詢 `SELECT cr_id, cr_nm, is_cr, emplid FROM ob_monthly_run_result WHERE run_id=:runId AND is_cr='Y'`
  2. 計算 is_cr='Y' 占總筆數比例
- **期望結果**：
  - is_cr='Y' 筆數佔總筆數 **1.9% ± 0.3%**（允許誤差因失效清空）
  - 每筆 is_cr='Y' 案件：`cr_id IS NOT NULL`、`cr_nm IS NOT NULL`（均非空字串）
  - 每筆 is_cr='Y' 案件：`emplid = cr_id`（業代正確指派）

---

### TS-F102-UPGR-002：F067 比對——CR 優先 vs 純比例分派差異報告（NFR-005）

- **相關 AC**：AC-13 / NFR-005
- **測試類型**：Integration（自動）+ 人工驗收（業務知會）
- **測試層**：PG Integration + 人工
- **步驟**：
  1. 以 F102（CR 優先 + 比例）執行 202606 重跑結果
  2. 以 F101 純比例分派（cr_enabled=false 等效）執行對比
  3. 使用 F067 compare-run-results 工具輸出差異報告
- **期望結果**：
  - 差異報告成功產生（非空）
  - 啟用 CR 後各課 / 員工件數分佈變化可量化（CR 案件從各課配額扣除效果可見）
  - 業務人員知會並簽核（上線前硬性前置，NFR-005）

---

### TS-F102-UPGR-003：202606 重跑——ob_assign_config 廢棄不影響月跑（US-154）

- **相關 AC**：AC-11/12 / US-154 AC-1~3
- **測試類型**：負向（廢棄旗標不影響）
- **測試層**：PG Integration
- **前置條件**：`ob_assign_config` 存在 `cr_reassignment_enabled` 記錄（歷史存量）；月跑執行
- **步驟**：執行月跑；確認月跑結果不受 ob_assign_config 影響
- **期望結果**：
  - 月跑 status = 'completed'
  - ob_assign_config.cr_reassignment_enabled 未被任何 service 讀取（AC-12 靜態掃描驗證）
  - CR 行為由 ob_list_definition.cr_enabled 唯一控制（BR-F102-03）

---

## 十四、測試資料策略

### 種子資料工廠原則

| 資料表 | 關鍵設定 | 注意事項 |
|---|---|---|
| `ob_monthly_run_result` | `cr_id` / `cr_nm` / `is_cr` 由 Stage 1 帶入（I-CR-COLSRC-01 前置）；`tier_level` 由 Stage 2 寫入（T1~T5）| CR 步驟前須確認三欄已帶入（非全空）；is_cr 來源值為 pool 原始值 |
| `ob_pool_data_list` | `cr_id` VARCHAR(20)；`cr_nm` VARCHAR(50)；`is_cr` VARCHAR(1)='Y'/'N'；`appl_date` DATE | pool 資料不被修改（BR-F102-05）；seed 需含 cr_id 非空 / 空兩種 |
| `ob_emphire` | `emp_id` VARCHAR(10)（PK）；`resign_date` DATE NULL（NULL=在職）| 測試須包含：resign_date < sysDate / IS NULL / 查無記錄 三種情境 |
| `ob_empl_set` | `list_no` + `deptid_m` + `emplid`（PK）；`ration` NUMERIC(10,2) | 測試須包含：ration>0 / ration=0 / 無記錄 三種；多筆 deptid_m 情境須確保 ASC 排序可驗 |
| `ob_list_definition` | `cr_enabled` BOOLEAN NOT NULL DEFAULT **false** | 測試須覆蓋 true / false 兩種；注意 DEFAULT false（OQ-3 裁定，entity 正確） |

### 邊界值設計

| 邊界場景 | 輸入值 | 期望行為 |
|---|---|---|
| 步驟 1 剛好觸發（appl_date 嚴格小於） | project_workym='202607'，appl_date='2024-06-30' | 清空（< twoYearsAgo='2024-07-01'） |
| 步驟 1 剛好不觸發（等於邊界） | project_workym='202607'，appl_date='2024-07-01' | 不清空（= twoYearsAgo，非嚴格小於） |
| 步驟 2 剛好觸發（resign_date 嚴格小於） | resign_date='2026-06-30'，sysDate='2026-07-01' | 清空（< sysDate） |
| 步驟 2 剛好不觸發（等於邊界） | resign_date='2026-07-01'，sysDate='2026-07-01' | 不清空（= sysDate，非嚴格小於） |
| 步驟 2 在職 | resign_date = NULL | 不清空（在職） |
| 步驟 2 查無 ob_emphire | cr_id='E999'，ob_emphire 無 emp_id='E999' | 不清空（INNER JOIN 不命中，BR-F102-08） |
| 步驟 3 多 deptid_m | emplid='E005'，deptid_m='XVE1'/'XVE2' | 取 'XVE1'（ASC 第一筆，I-DET-CR-01） |
| 扣量計算基數 | 100 件，5 件 is_cr='Y' | Stage 3/4 基數 = 95 |
| 跨年 @SYS_DT 計算 | project_workym='202612' | sysDate='2026-12-01'，twoYearsAgo='2024-12-01' |

### 環境依賴

| 依賴項 | 影響場景 | 策略 |
|---|---|---|
| Postgres Test Container | EQ / GATE / STEP1~3 / DEDUCT / IDEM / S2CLEAN / S1SRC / ORDER(PG) / REG(PG) / UPGR（48案例） | 沿用 docker-compose.test.yml postgres-test 容器（F098/F099/F100/F101 慣例） |
| CI 序列執行 | F102 pg.spec + F098/F099/F100/F101 共用 cdmp_test DB | CI pipeline 必須序列：`--runInBand` 或分 step，禁並行 |
| ob_emphire ETL | STEP2 群組需真實 resign_date 資料 | seed 直接寫入 ob_emphire，不依賴 E04 ETL 執行時機 |
| UTF-16LE SP | SP ground truth 對照分析 | `node -e "require('fs').readFileSync(path).toString('utf16le')"` |

---

## 十五、測試覆蓋追溯矩陣

| AC / Invariant ID | 描述 | 覆蓋案例 | 群組 |
|---|---|---|---|
| AC-1 | cr_enabled=true 時執行 CR 前置步驟 | GATE-001 | GATE |
| AC-2 | cr_enabled=false 跳過 + is_cr 強制清 N | GATE-002/003/006 | GATE |
| AC-3 | 混合 cr_enabled 名單互不干擾 | GATE-004 | GATE |
| AC-4 | cr_enabled 快照鎖定（月跑期間不受後續變更影響） | GATE-005 | GATE |
| AC-5 | 逾2年清空（嚴格小於邊界） | STEP1-001/002/003/004/005 | STEP1 |
| AC-6 | 離職清空（resign_date < sysDate）+ 在職不清 | STEP2-001/002/003 | STEP2 |
| AC-7 | 兩規則皆執行不短路 + 查無 ob_emphire 不清空 | STEP2-004/005 | STEP2 |
| AC-8 | ration>0 才指派 + deptid_m ASC 第一筆 | STEP3-001~005 | STEP3 |
| AC-9 | 扣量——Stage 3/4 只跑 is_cr<>'Y'；CR 案 assignday 非空 | DEDUCT-001/002/003/004/005/006/007 | DEDUCT |
| AC-10 | 確定性可重現（不同 run_id 相同結果）+ 靜態掃描 | IDEM-001、DET-001、EQ-004、STEP3-003 | IDEM/DET/EQ/STEP3 |
| AC-11 | F059 doc body 已修正 | REG-004 | REG |
| AC-12 | 無 service/controller 讀取全域旗標 | DET-003 | DET |
| AC-13 | 202606 重跑——CR 三欄有值 ≈1.9% | UPGR-001/002/003 | UPGR |
| I-CR-COLSRC-01 | Stage 1 帶入 cr_id/cr_nm/is_cr | S1SRC-001/002/003 | S1SRC |
| I-CR-ORDER-01 | 執行順序：clearStage3Fields → CR → Stage3 ration | ORDER-001/002 | ORDER |
| I-DET-CR-01 | 多筆 deptid_m 取 ASC 第一筆（確定性） | STEP3-003、EQ-004、DET-001 | STEP3/EQ/DET |
| I-CR-STAGE2-CLEAN-01 | Stage 2 不寫 is_cr | S2CLEAN-001/002 | S2CLEAN |
| I-CR-CONFIG-DEPR-01 | ob_assign_config 廢棄不被 service 讀取 | DET-003、GATE-003 | DET/GATE |
| I-CR-DEDUCT-01（修正） | Stage 3/4 配額基數排除 is_cr='Y'；CR 案不被覆蓋；ASSIGNDAY 不套此過濾 | DEDUCT-001/002/005/007、REG-002、ORDER-002 | DEDUCT/REG/ORDER |
| I-CR-ASSIGNDAY-01（新增） | ASSIGNDAY 散佈案件池含 is_cr='Y'；CR 案 assignday 全非 NULL | DEDUCT-005/006/007、EQ-007 | DEDUCT/EQ |
| I-IDEM-01（延伸） | 重跑冪等 | IDEM-001/002/003 | IDEM |
| BR-F102-05 | 清空不改 ob_pool_data_list 原始資料 | STEP1-003、IDEM-002 | STEP1/IDEM |
| BR-F102-07 | 兩規則皆執行不短路 | STEP2-005 | STEP2 |
| BR-F102-08 | CR 業代查無 ob_emphire 不清空（INNER JOIN 語意） | STEP2-004、STEP3-004、EQ-002 | STEP2/STEP3/EQ |
| BR-F102-13 | 全域旗標廢除（不被任何 service 讀取） | DET-003、REG-004 | DET/REG |
| NFR-005 | Production 差異報告 + 業務驗收 | UPGR-002 | UPGR |
| DoD EQ | JS↔SQL 逐列等價（六欄位） | EQ-001~006 | EQ |

---

## 十六、風險與待決問題

### 測試設計層風險

| 風險 | 等級 | 緩解策略 |
|---|---|---|
| Stage 1 帶入三欄後 JS oracle / SQLite 路徑 fixture 未同步更新（I-CR-COLSRC-01） | 高 | S1SRC-001~003 明確驗證三欄帶入；tdd-implementation 須同步更新 executeStage1Chain 相關 fixture |
| JS↔SQL 日期比較不等價（timezone / string vs date 型別） | 高 | 步驟 1/2 均使用字串比較 'YYYY-MM-DD'（feedback_typeorm_between_timezone 教訓）；EQ-001/002 含邊界日期 |
| collectCrCandidates 移除影響 F101 EMPL-005 等舊測試 | 中 | REG-001 / 本文件 §十二 明列需更新案例；tdd-implementation 須確認受影響測試後修改期望值 |
| clearStage3Fields 提取後 F101 Stage 3/4 回歸（欄位清除範圍） | 中 | ORDER-002 / REG-003 驗證 is_cr 保留；F101 AC-4（IDEM-001）為回歸保護 |
| ob_assign_config 保留造成誤讀（舊記錄存在） | 低 | DET-003 靜態掃描；UPGR-003 月跑驗收 |
| CR 步驟後 Stage 3 比例分派件數 < 預期（CR 扣量過多） | 低-中 | DEDUCT-001/003 驗收（基數計算正確）；UPGR-001 驗收（≈1.9% 比例）；F067 差異報告量化 |

### 開放問題（全部已由 AD-E07-30 解決）

所有 F102 OQ（OQ-F102-1~5）已於 AD-E07-30 全部裁定（oq_open: []），**本測試設計無待確認開放問題**。tdd-implementation 可直接據此落地。

---

## 十七、須更新期望值的既有 F101 測試清單

以下 F101 測試案例因 F102 引入「步驟 4 扣量（is_cr='Y' 排除）」與「collectCrCandidates 移除」，需由 tdd-implementation 更新期望值或 seed 設定：

| F101 測試 ID | 原始語意 | F102 後變更點 | 更新方式 |
|---|---|---|---|
| **TS-F101-EMPL-005** | simplified is_cr — Y/N 同池（AC-8）：100件（含 40件 is_cr='Y'），J1=60, J2=40 | F102 後：若 cr_enabled=true，40 件 is_cr='Y' 排除於 Stage 4 池外（扣量）；若 cr_enabled=false，行為與原語意一致 | **更新 seed**：指定 cr_enabled=false，確保 is_cr='Y' 已被強制清 N（GATE-002）；期望值維持 J1=60, J2=40 |
| **TS-F101-REG-004** | is_cr 值不被 Stage 4 修改（is_cr 為被動標記） | F102 後：is_cr='Y' 由 CR 步驟 3 主動寫入；Stage 3/4 不覆蓋（已符合）；Stage 2 不寫 is_cr（I-CR-STAGE2-CLEAN-01）| **補充前置條件說明**：明示 is_cr='Y' 案件來源為 F102 CR 步驟 3 指派（非 Stage 2 寫入）；期望值結構不變 |
| **TS-F101-IDEM-001** | Stage 3 前清除，is_cr 保留（AC-4）| F102 後：clearStage3Fields 提取為獨立函式；is_cr 保留語意不變 | **補充前置條件**：Stage 1 帶入 cr_id/cr_nm/is_cr（I-CR-COLSRC-01）；CR 步驟在清除後執行；期望值結構不變 |
| **TS-F101-EQ-008** | is_cr Y/N 混合 + ob_calendar | F102 後：EQ-008 若 cr_enabled=true，is_cr='Y' 案件進入扣量邏輯（非混入比例池）| **更新 seed**：指定 cr_enabled=false，確保 is_cr='Y' 全清 N；或明確此案為 cr_enabled=false 路徑；四元組期望值須重算 |

> **重要說明**：F101 AC-8（simplified is_cr — Y/N 同池）在 F102 語意變更後，**cr_enabled=false 名單**行為與 simplified is_cr 完全一致（is_cr 強制清 N，全入池）；因此 F101 相關測試只需調整 seed 指定 cr_enabled=false 即可維持原有期望值，無需重新計算 oracle。
