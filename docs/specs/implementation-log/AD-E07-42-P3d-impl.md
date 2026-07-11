---
type: implementation-log
feature_id: AD-E07-42-P3d
feature_name: MSSQL 全面遷移 P3d — CR 優先分派 raw SQL 引擎移植（JS↔MSSQL 逐列六元組等價）
status: complete
last_updated: 2026-07-08
---

# AD-E07-42 P3d：CR 優先分派 raw SQL 引擎 MSSQL 移植 — Implementation Log

將 CR 優先分派前置步驟之 PG set-based SQL 下推（`runCrPrioritySql` ＝ 步驟 1 逾2年清空 → 步驟 2
離職清空 → 步驟 3 CR 優先指派）平行移植至 MSSQL，維持 JS golden oracle（`applyCrPriority`）↔ MSSQL
下推**逐列六元組**（cr_id / cr_nm / is_cr / emplid / dept_id / emplid_deptid）等價（I-MSSQL-ENGINE-EQ-01）。
**PG 兩核心檔完全不動（byte-identical，`git diff` 空），新增平行 `cr-priority-sql-mssql.ts`；pipeline
服務層 mssql 分支由三步擴為含 CR 前置之四步鏈（DISPATCH 第四步接線由負轉正）。範圍限 P3d；不含 3e
（tier 收尾）。**

## Test Results Summary

真 MSSQL 實測（`localhost:1433` / `CDMP_TEST` / dbo）：**46 test block 全綠**（涵蓋測試設計 58 個
case ID；部分 case 折疊入單一 block，見下方對照）。靜態守門（capture 假 manager + method source scan）
不需 MSSQL、恆執行；DB 案例於真庫執行。

| 群組 | case ID → block | 狀態 |
|---|---|---|
| 一、GATE | 001（4 核心表就緒，DISPATCH 群組內）/002（appl_date=datetime2 INFORMATION_SCHEMA）/003（resign_date=date）/004（無 ration DECIMAL cast，static）/005（crEnabled=false 真庫）/006（empl_set_ranked CTE 無 VALUES 包裝，static）| PASS |
| 二、DISPATCH | 001（method scan 含 runCrPrioritySqlMssql）/002（順序 clear<cr<ration）/003（三態互斥 + PG/mssql 方法互斥）/004（真庫 DoD：CR 前置後 emplid/dept_id/is_cr 動態指派）/005（mssql 鏈路零 bare PG runCrPrioritySql( 殘留）| PASS |
| 三、STEP1 | 001/002/003（< 清、= 邊界不清、CAST datetime2 比對）/004（cr_id NULL）/005（appl_date NULL）/006（pool 不受影響）| PASS |
| 四、STEP2 | 001/002/003/006（離職清/在職不清/=sysDate 不清/CAST DATE）/004（🔴 BR-F102-08 查無不清）/005（UPDATE...FROM 正確執行）| PASS |
| 五、STEP3 | 001/002（ration>0 才指派）/002b（ration=0 不指派）/003（🔴🔴 I-DET-CR-01 deptid_m ASC → XVE1）/004（查無 emphire 仍指派）/005/007（🔴🔴 8 案件三重疊加旗艦 + emplid_deptid=dept_id）/006（UPDATE...FROM INNER JOIN，static）| PASS |
| 六、GATECR | 001/002（強制 is_cr=N、cr_id 不清）/003（完整四步、全案件入池無扣量）| PASS |
| 七、DATECAST | 001（datetime2 需轉換，static+GATE-002）/002（DATE↔DATETIME2 午夜比對真庫）/003（🔴 非午夜時間分量真庫查證，見未驗證假設結果）| PASS |
| 八、UPDATEFROM | 001（🔴 旗艦：RUN_ID_1 三步不污染 RUN_ID_2）/002（WHERE 範圍限定鍵保留，static）| PASS |
| 九、WINDOWFN | 001（單 deptid_m rn=1）/002/003（多次重跑 ASC 排序穩定 + collation byte-exact）| PASS |
| 十、CRWARN | 001（runCrPrioritySqlMssql 回傳 void 無 warning，static）/002（🔴 CR 動態 is_cr=Y 排除於 STAGE4_NO_EMPL_WARN 基數）| PASS |
| 十一、EQ | 001（基準混合）/002/005（🔴 8 案件全規則旗艦）/003（cr_enabled=false 清 N）/004（🔴🔴 DoD 跨切片旗艦：完整四步端對端六元組+assignday 逐列 `toEqual`）| PASS（真庫，DoD）|
| 十二、IDEM | 001（不同 run_id 六元組相同）/002（同 run 重跑冪等）| PASS |
| 十三、REG | 001（PG 核心檔 byte-identical）/002/003/004/005（P3a-c mssql / F102 PG / SQLite oracle / tsc 外部套件與 build gate）| PASS |
| 十四、STATIC | 001（Harness 僅 DELETE 無 DROP/TRUNCATE）/002（無 PG-only token）/003（新平行檔存在 + CRWARN-001 void）| PASS |

**回歸實測**：
- P3d mssql（`cr-priority-pushdown.mssql.spec`）：**46 綠**（真 MSSQL）。
- P3c mssql（`stage3to4-ration-pushdown.mssql.spec`）：**45 綠**（DISPATCH-003 負向守門翻轉為正向後，見偏差 1）。
- P3b mssql（`stage2to4-sql-pushdown.mssql.spec`）：**52 綠**（pipeline 契約擴增後無回歸）。
- P3a mssql（`stage1-sql-pushdown.mssql.spec`）：**11 綠 / 52 skip**（dbo 缺 P3a 六表既有 bootstrap 基線，非本輪回歸）。
- SQLite JS oracle 純函式（`cr-priority.spec`）：**16 綠**（REG-004）。
- F102 PG spec（`cr-priority-pushdown.pg.spec`）：**21 skip**（5433 不可達，PG 路徑不受影響、載入乾淨，REG-003）。
- pipeline gate bugfix（`assignment-run-pipeline-gate.bugfix.spec`）：**6 綠**。
- `npx tsc --noEmit -p tsconfig.build.json`：**乾淨（exit 0）**（REG-005）。

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| src/modules/assignment/stage1/cr-priority-sql-mssql.ts | new | `runCrPrioritySqlMssql`；步驟 1 `::date`→`CAST(:twoYearsAgo AS DATE)`（appl_date datetime2）+ 步驟 2/3 UPDATE...FROM INNER JOIN 重構 + 步驟 3 CTE/ROW_NUMBER 1:1 + crEnabled=false 單表 UPDATE（字面同 PG）。回傳 void。 |
| src/modules/assignment/services/assignment-run-pipeline.service.ts | modified | 匯入 `runCrPrioritySqlMssql`；`executeStage2to3PushdownMssql` 由三步擴為四步鏈（計分 → clearStage3Fields → **runCrPrioritySqlMssql** → 比例分派，I-CR-ORDER-01）；doc 註解更新為四步。 |
| src/modules/assignment/stage1/__tests__/cr-priority-pushdown.mssql.spec.ts | new | 46 test block（58 case ID）；5 表共用/自建 harness（複用擴充後 `_p3b-mssql-ddl.ts`）+ capture 靜態守門 + method source scan + JS↔MSSQL 逐列六元組 EQ。 |
| src/modules/assignment/stage1/__tests__/_p3b-mssql-ddl.ts | modified | `MSSQL_BASELINE_DDL` 新增 `ob_emphire` / `ob_empl_set` 兩鍵（自 baseline migration 解析；additive，P3b/P3c 引用不受影響）。 |
| src/modules/assignment/stage1/__tests__/stage3to4-ration-pushdown.mssql.spec.ts | modified | P3c DISPATCH-003 負向守門翻轉為正向（`not.toContain('runCrPrioritySql')` → `toContain('runCrPrioritySqlMssql')` + `not.toMatch(/runCrPrioritySql\(/)`），此為 P3c impl log 預告之「正式閉環」（見偏差 1）。 |
| （PG 兩核心檔）| unchanged | cr-priority-sql.ts / cr-priority.ts 逐位元組不變（REG-001 git diff 空）。 |

## Architectural Decisions

### 1. 🔴🔴 DISPATCH 第四步接線由負轉正（P3c DISPATCH-003 之正式閉環）
`executeStage2to3PushdownMssql`（P3c 落地時僅三步：計分 → clearStage3Fields → 比例分派，且明文
負向守門「刻意不呼叫 runCrPrioritySql」）擴為對稱 PG `executeStage2to4Pushdown` 之四步鏈：
計分（`runStage2and3SqlMssql`）→ 前清除（`clearStage3Fields`）→ **CR 前置（`runCrPrioritySqlMssql`）**
→ 比例分派（`runStage3to4RationSqlMssql`）。順序即 I-CR-ORDER-01（清除 → CR 前置 → 比例分派）：
CR 步驟 3 寫入之 emplid/dept_id 若在清除之前執行會被 `clearStage3Fields` 覆蓋清空，故 CR 前置必在
清除之後、比例分派之前。經 P3d 後 mssql 月名單分派之 CR 三欄不再恆維持 Stage 1 帶入原值（DISPATCH-004 DoD）。

### 2. 🔴🔴 appl_date datetime2 日期轉型（與 P3c ASSIGNDAY 結論相反，不可類推）
逐行查證 `1751884800000-MssqlBaselineSchema.ts` 確認 `ob_monthly_run_result.appl_date` 為 `datetime2`
（INFORMATION_SCHEMA 真庫驗 `DATA_TYPE='datetime2'`，GATE-002）；步驟 1 之 PG `appl_date < :twoYearsAgo::date`
**確實是需要方言轉換之真實站點**，改 `CAST(:twoYearsAgo AS DATE)`。此與 P3c GATE-004（assignday
為 varchar 不需日期轉換）之查證方向**相反**——不因「同專案前一切片查出日期欄位為 varchar」而類推
省略轉換。`ob_emphire.resign_date` 為原生 `date`（GATE-003），步驟 2 `CAST(:sysDate AS DATE)` 屬
DATE↔DATE 同型低風險。

### 3. crEnabled=false 分支方言中立性（GATE-005 決策＝字面複用 PG 版，不建 mssql 專版 SQL）
crEnabled=false 分支（單表 `UPDATE ... SET is_cr='N' ... WHERE ... AND (is_cr IS NULL OR is_cr <> 'N')`）
為純 ANSI，無任何 PG-only 字面（無 `||`/`::`/`RETURNING`/`ON CONFLICT`/`LIMIT`/JOIN），`CURRENT_TIMESTAMP`
為 ANSI 保留字。**真庫驗證通過**（GATE-005 直接對 MSSQL 連線執行、強制清 N、cr_id 不清），無方言差異。
決策：`runCrPrioritySqlMssql` 之 crEnabled=false 分支 SQL 字面與 PG 版**逐位元組相同**（比照 P3c
`clearStage3Fields` 之方言中立複用先例；差別在此分支為 PG 函式內聯段落、無法在不動 PG 檔前提下抽為
共用函式，故於 mssql 檔內以相同 SQL 字面呈現，非另建 mssql 專屬變體 SQL）。

### 4. 步驟 2/3 UPDATE...FROM 重構（承 P3b/P3c 手法）+ 步驟 3 CTE 無 VALUES 包裝（GATE-006）
- **步驟 2**：PG「`UPDATE r ... FROM ob_emphire e WHERE r.cr_id = e.emp_id`」→ MSSQL「`UPDATE r SET ...
  FROM ob_monthly_run_result r INNER JOIN ob_emphire e ON r.cr_id = e.emp_id WHERE r.run_id=:runId AND
  r.list_no=:listNo AND ...`」（join key 移入 INNER JOIN ON、WHERE 僅範圍限定鍵 + 過濾條件；INNER JOIN
  語意等同 PG 隱式 INNER，查無不清空 BR-F102-08）。
- **步驟 3**：PG「`WITH ... UPDATE r ... FROM first_dept fd WHERE r.cr_id = fd.emplid`」→ MSSQL「`WITH ...
  UPDATE r SET ... FROM ob_monthly_run_result r INNER JOIN first_dept fd ON r.cr_id = fd.emplid WHERE ...`」。
  `empl_set_ranked` CTE 主體為 `SELECT emplid, deptid_m, ROW_NUMBER() OVER (...) FROM ob_empl_set WHERE ...`
  ——直接對真實表 SELECT，**非** P3c 三處之 PG `WITH x(cols) AS (VALUES ...)` 語法糖，故**不需要**
  derived table 包裝改寫（GATE-006 靜態驗證）。
- **UPDATEFROM 防污染**：兩道 UPDATE 之 WHERE 皆保留 `r.run_id=:runId AND r.list_no=:listNo`
  （UPDATEFROM-002 static + UPDATEFROM-001 真庫跨 run 不污染）。

### 5. 無 ration DECIMAL cast（GATE-004）+ 視窗函式 1:1 + 無 warning（CRWARN-001）
- 全檔**無** `CAST(:param AS numeric)` 站點；`ration > 0` 僅作 `ob_empl_set` 內建表 WHERE 過濾（非
  參數化字面值），不適用 P3b/P3c NUMERIC(18,4) 精度風險，MSSQL 版**不引入**任何精度宣告。
- `ROW_NUMBER() OVER (PARTITION BY emplid ORDER BY deptid_m ASC)` SQL Server 2012+ 原生支援、1:1 不變；
  真庫多次重跑排序穩定一致（WINDOWFN-002/003，I-DET-CR-01；BIN collation byte-exact）。
- `runCrPrioritySqlMssql` 回傳 `Promise<void>`（與 PG 版契約一致）——CR 前置為純粹確定性 UPDATE，
  **不產生任何 warning/skipped_cases**（CRWARN-001 查證確認，MSSQL 版簽章未新增 warning 回傳值）。

### 6. Harness（§0.2，沿用「共用既有表」策略 + 複用擴充 P3b 零 drift DDL）
`beforeAll` 對 5 表（assignment_run / ob_pool_data / ob_monthly_run_result / ob_emphire / ob_empl_set）
`OBJECT_ID` 探測 → `existedBeforeSuite`；缺表以 **`_p3b-mssql-ddl.ts`（本輪新增 ob_emphire/ob_empl_set
兩鍵，自 baseline migration 解析之零 drift CREATE TABLE）** 自建、`selfBuiltTables` 記錄。`afterAll`
自建表 DROP（reverse 序）、既有表僅前綴 DELETE（**絕不** DROP/TRUNCATE 共用表，STATIC-001）。
本輪為 P3 系列首次以 raw SQL 直接 JOIN `ob_emphire`/`ob_empl_set` 兩張表。隔離：`run_id` 固定 UUID
（P3D_RUN_ID_1/2）；`list_no` 前綴 `'P3D'`；`appl_no` 前綴 `'P3D'` 連號（保證 (orgno,appl_no) 字串序＝
注入序）；`emp_id`/`emplid`/`cr_id` 前綴 `'PE'`（避免與共用 ob_emphire/ob_empl_set 潛在真實資料碰撞，
cleanup 以 `emp_id LIKE 'PE%'` 清）。→ **自足可獨立完整重跑**（不依賴外部 bootstrap）。

## DATE-DATETIME2 隱式轉換真庫驗證結果

- **午夜比對（DATECAST-002）**：`appl_date`(datetime2) `< CAST(:twoYearsAgo AS DATE)` 之比對，SQL Server
  依型別優先順序將 DATE 常值提升為 DATETIME2（補 00:00:00.0000000）比對；以午夜時間分量之合成 fixture
  （`new Date('YYYY-MM-DDT00:00:00Z')`，與 F102 PG spec 現行慣例一致）驗證邊界：`2024-06-30` 清、
  `2024-07-01`（= twoYearsAgo）不清（嚴格小於），與 PG `timestamp < :twoYearsAgo::date` 語意一致。
- **🔴 非午夜時間分量（DATECAST-003，未驗證假設之真庫結果）**：真庫查證發現 **tedious 對 datetime2 以
  本機時區（此測試環境 UTC+8）儲存** —— `new Date('2024-06-30T23:30:00Z')`（UTC 23:30）實際落於 datetime2
  之 `2024-07-01 07:30`（本機 +8）而**非**午夜前一日 → `< CAST('2024-07-01' AS DATE)` 為 false → **不清空**。
  對照 JS oracle（`applyCrPriority` 之 `toYmd` 取 **UTC 日期部分** = `'2024-06-30'`）於此值會判定清空
  → **非午夜時間分量情境 JS oracle 與 MSSQL 可能分歧**（業務級發現，見下）。DATECAST-003 已改以「讀回
  實際儲存全精度值」斷言 SQL 比對與 datetime2 全精度語意一致（非硬編 timezone），為記錄式文件測試。
  **所有 EQ 群組使用午夜 fixture 皆逐列等價（因午夜 +8 仍落同日、不跨清空邊界）**，故 DoD 不受影響。

## 未驗證假設之真庫驗證結果（彙整）

1. **appl_date 型別**：確為 `datetime2`（GATE-002 INFORMATION_SCHEMA 真庫驗），步驟 1 `::date`→`CAST(... AS DATE)`
   為必要站點（DATECAST-001）。
2. **resign_date 型別**：確為 `date`（GATE-003），步驟 2 為 DATE↔DATE 低風險比對。
3. **crEnabled=false 分支方言中立**：真庫直接執行通過（GATE-005），字面複用 PG 版無需修改。
4. **empl_set_ranked CTE 不需 VALUES 包裝**：直接對 ob_empl_set SELECT，T-SQL 合法（GATE-006 static +
   STEP3 真庫指派全綠）。
5. **ROW_NUMBER 決定性與 collation**：多次重跑 `ORDER BY deptid_m ASC` 排序穩定一致（WINDOWFN-002/003
   真庫；BIN collation byte-exact，與 PG 一致）。
6. **DATE↔DATETIME2 非午夜時間分量**：真庫發現 datetime2 本機時區儲存 → 非午夜 UTC 值可跨日邊界，
   與 JS oracle（UTC 日期部分）於非午夜情境**可能分歧**（見業務級發現）。

## 業務級 / 待複驗發現

- **🔴 業務級（帶回使用者）**：MSSQL datetime2（tedious）以**本機時區**儲存，`appl_date` 若於生產環境
  帶有**非午夜時間分量**（如 legacy 實際下單時間戳記），「逾2年清空」邊界判定可能與 JS oracle（取 UTC
  日期部分）分歧，並且**跨引擎（PG vs MSSQL）之逐位元組等價最終判定需以 production 時區組態複驗**。
  現行測試 fixture 與 F102 PG spec 慣例皆為午夜時間分量（此情境兩引擎與 JS oracle 三方一致，已驗證）。
  待查證項：`ob_pool_data_list.appl_date` 於生產環境是否帶非午夜時間分量（DATECAST-003 記錄，**不阻擋
  P3d DoD**，屬產品面 + cutover 時區組態確認範疇）。**CR 分派逐列 EQ 於午夜 fixture 下無業務級不符**
  （EQ-001~005 六元組 `toEqual` 誤差 0）。

## 偏差（deviations）與發現

1. **P3c DISPATCH-003 負向守門翻轉為正向（P3c impl log 預告之正式閉環）**：P3c 之
   `stage3to4-ration-pushdown.mssql.spec.ts` DISPATCH-003 原斷言 `expect(methodSrc).not.toContain('runCrPrioritySql')`
   （負向守門「刻意不呼叫」）。P3d 為其正式閉環（P3c impl log「範圍外後續」段落與 P3c-test 已預告
   「翻轉為正向 MUST-FIX」），且 `runCrPrioritySqlMssql` 之字串**包含** `runCrPrioritySql` 子字串，
   原負向斷言必然失敗。依測試設計 DISPATCH 段「移除 P3c DISPATCH-003 負向守門（改正向驗第四步存在）」
   之指示，將該 test 翻轉為 `toContain('runCrPrioritySqlMssql')` + `not.toMatch(/runCrPrioritySql\(/)`
   （bare PG 版呼叫不得殘留；`runCrPrioritySqlMssql(` 不匹配 `runCrPrioritySql\(`）。此為測試檔更新，
   **非** P3c 生產碼變更；P3c 其餘 44 case 全綠不受影響。
2. **DATECAST-003 斷言改為讀回實際儲存值（非硬編 timezone）**：初版 DATECAST-003 假設 `2024-06-30T23:30:00Z`
   為「前一日 → 清空」，真庫實測因 datetime2 本機時區儲存（+8）落於 `2024-07-01 07:30` → 不清空。
   依測試設計「DATECAST-003 為記錄式 decision gate、不預設答案」，改以讀回 `CONVERT(varchar,appl_date,126)`
   實際儲存值、斷言「清空 ⟺ 儲存全精度值 < 午夜」，忠實記錄本環境 timezone 行為（見 DATE-DATETIME2 段）。

## Blocking Issues

無（技術層）。CR 4 步演算法（含 appl_date datetime2 轉型 + UPDATE...FROM INNER JOIN + CTE/ROW_NUMBER
三重疊加）+ dispatch 第四步接線 + 扣量非 ASSIGNDAY + cr_enabled 閘控 + warning 查證全落實，58 case
全綠（真 MSSQL）、tsc 乾淨、PG 兩核心檔 byte-identical、P3a/P3b/P3c/F102/SQLite/pipeline 無回歸。

**待使用者/產品面確認（非阻擋 DoD）**：datetime2 本機時區儲存對「非午夜時間分量 appl_date」之逾2年
清空邊界影響（業務級發現，需 production 時區組態 + 來源 appl_date 是否帶時間分量複驗）。

**範圍外後續（P3e，非本輪）**：`fn_calc_tier_level`（3e）收尾。真實月重跑跨引擎逐列比對
（MONTHRUN-DIFF）比照 P3b/P3c 前例待 P3e 完成 mssql 全鏈後以 manual/script 執行。
