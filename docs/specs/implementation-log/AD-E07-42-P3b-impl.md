---
type: implementation-log
feature_id: AD-E07-42-P3b
feature_name: MSSQL 全面遷移 P3b — Stage 2~3 計分 raw SQL 引擎移植（JS↔MSSQL 逐列等價）
status: complete
last_updated: 2026-07-08
---

# AD-E07-42 P3b：Stage 2~3 計分 raw SQL 引擎 MSSQL 移植 — Implementation Log

將 Stage 2~3 計分之 PG set-based SQL 下推（`resolveColumnSource` / `buildStage2ScoreExpr` /
`runStage2and3Sql`）平行移植至 MSSQL，維持 JS golden oracle（`computeScore`）↔ MSSQL 下推逐列等價。
**PG 兩核心檔完全不動（byte-identical，`git diff` 空），新增平行 `*-mssql.ts`，pipeline 服務層三態化 dispatch。**
**範圍限 P3b（`runStage2and3Sql`＝score/card_level/tier_level）；不含 3c/3d/3e（比例分派/CR/tier 收尾，屬 P3c/P3d）。**

## Test Results Summary

真 MSSQL 實測（`localhost:1433` / `CDMP_TEST` / dbo）：**52 test blocks 全綠**（涵蓋 131 case ID；
邊界變體合併、MONTHRUN-DIFF 為 manual/script）。**連續執行兩次皆全綠（冪等，HARNESS-004）。**

| 群組 | 案例 → block | 狀態 |
|---|---|---|
| 一、GATE | GATE-001（12 表探測分流）/003（型別事實）/004（LOAN_RATE 精度決策）/006（cc 殘留探測）| PASS |
| 二、DISPATCH | DISPATCH-001（mssql→pushdownMssql）/002（三態互斥全組合）/003（真實下推寫入 score）/004+STATIC-006（字面掃描）| PASS |
| 三/四/五、REGEX | SAFESEX-001~005 / GATING-001~005（五欄同步）/ EDUCAT-001~005（巢狀補零）| PASS（真庫 EQ）|
| 六、REGEX-META | META-001（全字串驗證非 PATINDEX）/002（TRY_CAST）| PASS |
| 七、FALLBACK | FALLBACK-001（存在欄）/002+002b（幽靈→字面 0）/003（非數值→0）/004（大寫目錄）/005（O(1) 恰 1 次）/006（精度）/007（三態混合 EQ）| PASS |
| 八、AGESCORE | META-001（SYSDATETIME 非 ccWorkdt，ym 不影響）/002/004/005/006（100/101/法人/NULL/多筆 EQ）/003（閏年）| PASS |
| 九、CARYEAR | 001/002（複用 mssqlLeadingYearExpr + YEAR(SYSDATETIME)）/004/005（EQ）| PASS |
| 十、PJTP | 001（NVARCHAR cast）/002/003/004（借新還舊 keyword + 區間 + NULL COALESCE 多 row EQ）| PASS |
| 十一/十二、CROSSAPPLY/DISTINCTFROM | 001/003（命中/fallback）/004（不誤觸）/CROSSAPPLY-003（NULL 不掉列）/SCORE-006/007 | PASS |
| 十三、UPDATEFROM | 001/003（併入 FROM + join key）/002（防跨 run 污染）| PASS |
| 十四、DECIMAL | LOANRATE-001（12.50 命中 [12.00,12.99]）/002+ARCAP-001（整數 regression）| PASS |
| 十五、CCDIM | SEX/BRANCH（五欄同步）/CITY（LEFT3+default）/SALES+PCD | PASS（逐列 EQ）|
| 十七/十八/十九、CJOIN/AR/S2CLEAN | CJOIN-002/AR-004/S2CLEAN-001/002（不寫 is_cr）| PASS |
| 二十、FULLEQ | FULLEQ-008（S5 卡 6 維度 + LOAN_RATE 小數綜合，誤差 0）| PASS |
| 二十二、CHARSET | 001/002/003（中古車商 + 借新還舊 LIKE + 花蓮縣 LEFT3）| PASS |
| 二十三、STATIC | 001（無 DROP/TRUNCATE 共用表）/002（PG byte-identical）/003/004（無 PG token）/007（精度字面）| PASS |
| 二十四、HARNESS | 001/004（12 表就緒+冪等）/005（零 drift DDL）| PASS |

**回歸實測**：
- SQLite 計分單元（`stage2to4-sql-builder.spec` 15 + `f103.spec` 39 + `f104.spec` 49）：**103 綠**。
- gate bugfix（`assignment-run-pipeline-gate.bugfix.spec`，已更新 `pushdown`→`pushdownPg`）：**6 綠**。
- pipeline 服務全 non-pg/non-mssql spec（18 檔）：**231 綠**。
- P3a Stage 1 mssql（`stage1-sql-pushdown.mssql.spec`）：**11 綠 / 52 skip**（純函式綠；DB 案例因本機 dbo 缺 P3a 六表而 skip——P3a impl log 明載之非 bootstrap 基線行為，非本輪迴歸）。
- PG 計分 spec（f100/f103/f104 `.pg.spec`）：5433 不可達 → degradable skip；PG 兩核心檔 byte-identical（STATIC-002 綠）。
- `npx tsc --noEmit -p tsconfig.build.json`：**乾淨（exit 0）**。

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| src/modules/assignment/stage1/stage2to4-sql-builder-mssql.ts | new | `resolveColumnSourceMssql`/`buildStage2ScoreExprMssql`/`mssqlAllDigits`/`mssqlAgeTodayExpr`；3 正則站點 + fallback schema 注入 + LOAN_RATE 精度 + AGE/CAR_YEAR 今日參考日 |
| src/modules/assignment/stage1/stage2to4-sql-executor-mssql.ts | new | `runStage2and3SqlMssql`/`fetchPoolDataColumnsMssql`；UPDATE...FROM 重構 + CROSS APPLY + OR-NULL tier + CAST(NULL AS INT) |
| src/modules/assignment/services/assignment-run-pipeline.service.ts | modified | `Stage2to4Strategy` 三態化（`pushdown`→`pushdownPg` + 新增 `pushdownMssql`）+ `resolveStage2to4Strategy` 三分支 + `useStage2to4Pushdown` 二值 + 新增 `executeStage2to3PushdownMssql`（僅 Stage 2~3） |
| src/modules/assignment/services/__tests__/assignment-run-pipeline-gate.bugfix.spec.ts | modified | postgres 斷言 `pushdown`→`pushdownPg`（三態化連帶更新，非行為變更） |
| src/modules/assignment/stage1/__tests__/stage2to4-sql-pushdown.mssql.spec.ts | new | 52 test block（131 case）；12 表自建/清理 harness + JS↔MSSQL EQ |
| src/modules/assignment/stage1/__tests__/_p3b-mssql-ddl.ts | new | 零 drift DDL：載入時自 baseline migration 解析 12 表 CREATE TABLE（非手抄，HARNESS-005） |
| （PG 兩核心檔）| unchanged | stage2to4-sql-builder.ts / stage2to4-sql-executor.ts 逐位元組不變（STATIC-002 驗） |

## Architectural Decisions

### 5 個 MUST-FIX 落實

1. **🔴 三處 `~ '^[0-9]+$'` 全字串驗證（SAFE_INT_CUS_SEX / IS_PERSONAL_GATING / EDUCAT_BACK numExpr）**：
   直接複用 P4a 已驗證公式（非 P3a year-above 之 PATINDEX 擷取）——`mssqlAllDigits(x)` =
   `(x IS NOT NULL AND LEN(x) > 0 AND x NOT LIKE '%[^0-9]%')` + `TRY_CAST`。三處**組合輸入各異**且逐一驗邊界：
   - 站點 1（cus_sex 原值）：NULL/''/'C'/'9' → NULL → default 3；SAFESEX-001~005 真庫 EQ。
   - 站點 2（`COALESCE(NULLIF(cus_sex,''),'1')` 包裝）：因包裝後恆非空，空字串陷阱不觸發；'C'→NULL→`NULL IN(1,2)` unknown→法人（MSSQL CASE WHEN 對 unknown 走 ELSE，等價 PG `COALESCE(...,FALSE)`）；GATING-001~005 五欄同步驗證。
   - 站點 3（EDUCAT 巢狀 `RIGHT('0' + code,2)`；PG `||`→T-SQL `+` NULL 傳播一致）：'AB'→非數字→NULL→不命中（對齊 JS `Number('AB')=NaN`）；EDUCAT-001~005。
   REGEX-META-001 靜態守門確認三處皆走 `mssqlAllDigits`（≥3 次呼叫）、非 PATINDEX 擷取。
2. **🔴 to_jsonb 動態 fallback（I-MSSQL-DYNAMIC-FALLBACK-01）**：SQL 生成前 TS 端查大寫
   `INFORMATION_SCHEMA.COLUMNS`（欄名 LOWER 正規化）決定欄位存在。命中→`COALESCE(TRY_CAST(o.[col] AS NUMERIC(18,4)),0)`；
   幽靈欄位→生成期烤入字面 `0`（非執行期動態，最終 SQL 不含 INFORMATION_SCHEMA/to_jsonb/->> token）。
   **GATE-002 決策＝選項甲**：executor `fetchPoolDataColumnsMssql` 一次性查回 `Set<string>` 注入 builder
   純函式第 3 參數（`existingColumns`）。理由：保持 builder 為同步純函式（可脫離 DB 單元測試）、schema 查詢
   O(1)（FALLBACK-005 spy 實測恰 1 次）、跨 list 於 `executeStage2to3PushdownMssql` 共用一次查詢。
3. **🔴 `resolveStage2to4Strategy` dispatch 三態化（I-NOLOAD-01）**：原二元 gate 使 mssql 落 else→靜默走
   in-memory JS（executeV2/V1，re-hydrate 全 pool 回 heap；功能正確但架構退化、最難被功能測試揪出）。
   升級 `'pushdown'`→`'pushdownPg'` + 新增 `'pushdownMssql'`；`useStage2to4Pushdown` 涵蓋兩下推值；
   mssql 走新 `executeStage2to3PushdownMssql`（Stage 2~3 SQL 下推）。DISPATCH-001~004 全綠。
4. **🔴 LOAN_RATE DECIMAL（DECIMAL-LOANRATE-001）**：**GATE-004 決策＝`NUMERIC(18,4)`**（非裸 `NUMERIC`＝
   `NUMERIC(18,0)` 會四捨五入 12.50→13）。選 (18,4) 而非來源對齊之 (5,2)：保留小數 + 對 fallback 未知精度欄位
   亦安全（不整數化、防溢位回 NULL 之靜默 miss）。DECIMAL-LOANRATE-001 實測 12.50 命中 [12.00,12.99]。
5. **🔴 UPDATE...FROM 重構（UPDATEFROM-001/002/003）**：PG「目標就地宣告別名不入 FROM」→ MSSQL
   `UPDATE r SET ... FROM ob_monthly_run_result r INNER JOIN ob_pool_data o ON o.orgno=r.orgno AND o.appl_no=r.appl_no ...`；
   join key 移入 INNER JOIN ON、WHERE 僅保留 `run_id/list_no`。UPDATEFROM-002 實測同 list_no+appl_no 之
   RUN_ID2 列完全不受 RUN_ID 更新影響（防跨 run 污染）。

### 其餘方言轉換
- **AGE / CAR_YEAR 參考日＝今日**（`CAST(SYSDATETIME() AS DATE)` / `YEAR(SYSDATETIME())`）——**非** P3a 之
  `@ccWorkdt`（工作月）。對齊 PG `age(dob)`（單引數＝CURRENT_DATE）/ JS `calcAgeYears(dob,new Date())` /
  `new Date().getFullYear()`。AGESCORE-META-001 以非當月 ym 兩次跑證 score 不隨 ym 變（若誤植 ccWorkdt 會漂移）。
- **CAR_YEAR 前導擷取**複用 P3a `mssqlLeadingYearExpr`（PATINDEX）；`o.year_produ IS NULL` 外層攔截使
  NULL→0（mssqlLeadingYearExpr NULL→1900 被優先 guard 蓋過），''/'N/A'→NULL→0，與 JS 一致。
- **CROSS JOIN LATERAL → CROSS APPLY**（純量子查詢恆 1 列，score NULL 亦不掉列，CROSSAPPLY-003 驗）。
- **IS NOT DISTINCT FROM → `(a=b OR (a IS NULL AND b IS NULL))`**（mirror F100；DISTINCTFROM-003 fallback
  命中、004 有效 card_level 不誤觸 fallback）。
- **`::int` → `CAST(... AS INT)`；`NULL::int` → `CAST(NULL AS INT)`；`AS text` → `AS NVARCHAR(4000)`**（composite/category TRIM）。

### Harness 自建（§0.2，本輪改善，消除 P3a bootstrap 依賴）
- `beforeAll` 對 12 表 `OBJECT_ID` 探測 → `existedBeforeSuite`；缺表以零 drift DDL 自建、`selfBuiltTables` 記錄。
- `afterAll` 自建表 `DROP`（reverse 序）、既有表僅前綴/`card_version=999001` `DELETE`（**絕不** DROP/TRUNCATE 共用表）。
- **零 drift 手法**：`_p3b-mssql-ddl.ts` 於載入時**自 baseline migration 直接解析** CREATE TABLE 陳述式（非手抄常數）
  → 未來 baseline 修訂自動同步（HARNESS-005 建議之最佳作法）。僅取 CREATE TABLE 本體（略次要索引/跨表 FK——
  本套件控制 insert/cleanup 序、不影響欄位/型別/PK 零 drift）。
- 隔離：`card_version=999001`（version-bearing 表）+ `ob_tier` card_type `ZP3B%` + pool/result/list/cc/ar 前綴 `P3B`。

## 未驗證假設之真庫驗證結果

1. **本機 dbo 實際只有 2/12 表**（`customer_core` + `ob_arreturndf_min_cap`）——真庫探測證實。P3b harness
   自建其餘 10 表 → 52 DB 案全綠 → `afterAll` DROP 還原至 2 表。**證 harness 自足可獨立完整重跑、不需外部 bootstrap**
   （P3a 已知盲點消除）。連續兩跑皆綠（冪等）。
2. **GATE-006 customer_core 殘留列＝0**（total=0；無 P4d 殘留、無生產規模資料）→ §二十一 MONTHRUN-DIFF 需
   **另行觸發真實 ETL pipeline 產生**（非既有列可用）。
3. **CROSS APPLY 純量子查詢對 score NULL 仍產 1 列**——CROSSAPPLY-003 真庫證實（`CAST(NULL AS INT)` 不掉列）。
4. **PG 非數字 JSON cast 對稱性**：MSSQL `TRY_CAST` 對非數值文字回 NULL（不拋例外），較 PG `::numeric`（會拋）
   之防禦性優於或等於；FALLBACK-003（list_type='XX'）逐列 EQ（皆→0）驗證。

## 業務級 EQ 結論

**9 個 customer_core 維度 + 3 正則站點 + fallback 三態 + AGE 今日參考日 + LOAN_RATE 小數 + PROJECT_TP composite
逐列 JS↔MSSQL 精確等價（誤差 0），無業務級不符。** FULLEQ-008 綜合大場景（S5 卡 AGE/CAREA/EDUCAT default/
LOAN_RATE 12.5/CO_NUM 金門縣 default/HPOST 臺北市 = 35）誤差 0。

- AGE 參考日：PG `age()`＝CURRENT_DATE、JS `new Date()`、MSSQL `SYSDATETIME()` 三者皆「今日」→ 一致，無漂移。
- LOAN_RATE：來源 `numeric(5,2)`，PG numeric 無限精度、MSSQL `NUMERIC(18,4)` 皆保留 2 位小數 → 一致。
- **輕微未觸及邊界（記錄非阻擋）**：若未來將 `numeric(19,4)`（如 `term_amt`/`overdue_amt`，19 位）配置為 fallback
  計分欄，MSSQL `NUMERIC(18,4)` 對 >18 位值 TRY_CAST 回 NULL→0，而 PG 保留原值 → 理論差異。**現行計分 config
  無此類欄位**（fallback 實務欄位皆 ≤18 位或整數）；如未來新增超寬精度計分欄需回頭調整精度宣告。

## Blocking Issues

無。5 MUST-FIX 全落實、52 case 全綠（真 MSSQL、冪等）、tsc 乾淨、PG 兩核心檔 byte-identical、
SQLite/pipeline 服務層/P3a 純函式無回歸。

**範圍外後續（P3c/P3d，非本輪）**：`executeStage2to3PushdownMssql` 僅補 score/card_level/tier_level；
Stage 3c 比例分派（`stage3to4-ration-sql`）/ 3d CR（`cr-priority-sql`）/ 3e tier 收尾之 MSSQL 化未移植，
mssql 月跑之 dept_id/emplid/assignday 暫留 NULL。§二十一 MONTHRUN-DIFF（真實月重跑跨引擎逐列比對）比照
F101/F102 前例以 manual/script 執行、待 P3c/P3d 完成 mssql 全鏈後方能完整比對（現階段 customer_core 無殘留資料，
需先觸發真實 ETL）。
