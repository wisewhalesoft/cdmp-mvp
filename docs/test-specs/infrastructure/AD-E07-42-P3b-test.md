---
type: test-design-infrastructure
test-spec-id: AD-E07-42-P3b
feature_name: MSSQL 全面遷移 P3b — Stage 2~3 計分 raw SQL 引擎移植（stage2to4-sql-builder / stage2to4-sql-executor MSSQL 化；JS↔MSSQL 逐列等價；~ 正則字元類別 3 站點 + to_jsonb 動態 fallback + 9 個 customer_core 計分維度；本 AD 風險最高單一區塊）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-42-mssql-p3-raw-sql-engine.md（§0 customer_core 缺口已解、§1 driver 組織原則、§2.2 Stage2~3 逐站點方言轉換清單、§4 EQ 等價測試策略、§5 P3b 範圍/DoD、§6.1/6.2 風險備註、§7 不變式 I-MSSQL-ENGINE-EQ-01/I-MSSQL-REGEX-CHARCLASS-01/I-MSSQL-DYNAMIC-FALLBACK-01）
  - /docs/specs/implementation-log/AD-E07-42-P3a-impl.md（Stage 1 篩選 MSSQL 化已完成之落地事實：CONCAT `||`→`+`、AGE `DATEDIFF` 公式 dob-為-start-引數、`mssqlLeadingYearExpr` PATINDEX 手法、dbo 共用表 harness 決策，本文件多處沿用/對照）
  - /docs/test-specs/infrastructure/AD-E07-42-P3a-test.md（格式模板、GATE/DISPATCH/Harness 群組設計手法沿用）
  - apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts（`resolveColumnSource`/`buildStage2ScoreExpr`/`CARD_DEFAULTS`/`SAFE_INT_CUS_SEX`/`IS_PERSONAL_GATING`，本文件全部站點行號依此檔逐行核對）
  - apps/api/src/modules/assignment/stage1/stage2to4-sql-executor.ts（`runStage2and3Sql`，UPDATE...FROM + CROSS JOIN LATERAL + IS NOT DISTINCT FROM 三站點來源）
  - apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts（`resolveStage2to4Strategy:174-180`〔DISPATCH 群組核心依賴〕、`resolveColumnValue`/`calcAgeYears`/`safeIntCusSex`/`isCorporateCusSex`〔JS golden oracle，AGESCORE/CCDIM/FALLBACK 群組比對基準；`resolveColumnValue` default 分支 `pool[columnName.toLowerCase()]` 讀取 + 幽靈欄位 warn+0，:1324-1335，FALLBACK 群組 JS oracle 依據〕）
  - apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-pushdown.pg.spec.ts（F100 SCORE/CJOIN/LEVTIER/S2CLEAN/EQ 群組之 MSSQL 對應版本模板）
  - apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f103.pg.spec.ts（F103 AR/EQ/FALLBACK/GHOST/PREFETCH 群組模板，FALLBACK 群組直接對稱）
  - apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f104.pg.spec.ts（F104 KW/SEX/SAFE/BRANCH/AGE100/EDU/CITY/PCD/EQ 群組 + F105 PJTP-EQ 群組模板，CCDIM 群組直接對稱）
  - apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts（test-designer 逐行查證：ob_levelcard_version/column/score/level、ob_tier、ob_arreturndf_min_cap 六表皆已於 dbo 建表；`loan_rate numeric(5,2)`／`year_produ varchar(4)`／`spec_tp varchar(2)` 精確型別為本文件 DECIMAL／CARYEAR 群組依據）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-42 P3b：MSSQL 全面遷移 — Stage 2~3 計分 raw SQL 引擎移植 — 測試設計

> 本文件覆蓋 AD-E07-42「MSSQL 全面遷移 P3（Raw SQL 引擎移植）」之 **P3b 切片**（AD §2.2 Stage 2~3 計分逐站點清單 + §5 P3b 範圍/DoD + §6.1「本 AD 風險最高單一區塊」）。P3 不經 spec-writer（AD §5「是否需要 spec-writer（RESOLVED：不需要）」已裁定，比照 P1/P2/P4/P3a 先例，本輪不重複論證）。
>
> **明確排除**：3c Stage 3/4 比例分派（`stage3to4-ration-sql.ts`）、3d CR 優先分派（`cr-priority-sql.ts`）、3e `fn_calc_tier_level` 收尾，皆**不在本文件範圍**。P3a（Stage 1 篩選）已完成，本文件視為已驗證黑盒依賴（Stage 1 已將案件 INSERT 至 `ob_monthly_run_result`，P3b 僅在其上 UPDATE score/card_level/tier_level）。
>
> **★ test-designer 逐檔查證發現之關鍵事實（本文件測試設計之核心依據，多項超出 AD §2.2 表格原始範圍）**：
>
> 1. **🔴🔴 三處 `~` 正則站點語意皆為 `^[0-9]+$`（含 `$` 錨點，全字串驗證），與 P3a year-above 之 `^[0-9]+`（無 `$` 錨點，前導擷取）語意層級不同——可直接複用 P4a `type-cast-handler-mssql.ts` 已驗證公式，非需要如 P3a 般自行推導新公式**：`SAFE_INT_CUS_SEX`（`stage2to4-sql-builder.ts:116`）、`IS_PERSONAL_GATING`（:124-126）、EDUCAT_BACK `numExpr`（:236）三處皆為 `X ~ '^[0-9]+$'` 形態（全字串數字驗證，回傳布林後接 `::int` 轉型），與 P4a `getValidationRegex` 已驗證解法（`NOT LIKE '%[^0-9]%'` + `LEN(x)>0` 守空字串陷阱 + `TRY_CAST`）**同一語意層級**，理論上可直接複用而非如 P3a year-above 般需要 `PATINDEX` 自行推導。AD §2.2 表格將此三站點標「高風險」，若僅因「風險」標籤誤判為需要全新設計，可能導致重工；但三處**組合輸入**互不相同（原始欄位 vs `COALESCE(NULLIF(...),'1')` 包裝 vs 巢狀 `CASE` 產生之補零字串），仍須逐一針對各自實際輸入分別驗證邊界（不可僅驗證一處就假設其餘兩處同樣正確）。已獨立立 §三/四/五 REGEX-SAFESEX/REGEX-GATING/REGEX-EDUCAT 三群組 + §六 REGEX-META 記錄此語意區分。
> 2. **🔴🔴 `resolveStage2to4Strategy`（`assignment-run-pipeline.service.ts:174-180`）現行為二元-ish gate，MSSQL 環境會落入 in-memory JS 執行路徑而非 SQL 下推，AD 完全未提及此站點，同型於 P3a/P1c/P2b 已反覆出現之 DISPATCH 陷阱**：現行邏輯 `DB_TYPE==='postgres' → 'pushdown'；否則依 ASSIGNMENT_PIPELINE_V2 選 'v2Inmemory'/'v1Inmemory'`。`DB_TYPE='mssql'` 環境下會落入 else 分支，依 `ASSIGNMENT_PIPELINE_V2` 旗標選擇 in-memory JS 路徑（`executeV2`/`executeV1`），**不會**拋錯（`executeV2` 為純 TypeORM repo 查詢，DB-agnostic，可在 MSSQL 上正常執行），但會靜默違反 I-NOLOAD-01（re-hydrate 全 pool 回 heap 計分），是一個「功能正確但架構退化」的隱蔽缺口，比 P3a Stage1 DISPATCH 更難被功能測試揪出（不會有任何錯誤或資料錯誤）。已獨立立 §二 DISPATCH 群組，MUST-FIX。
> 3. **🔴🔴 `to_jsonb(o)->>'col'` 通用 fallback（`stage2to4-sql-builder.ts:290`）為 live production path（未 hardcode 之計分欄位皆走此路，非死碼），MSSQL 無單一 SQL 表達式等價機制，需架構性調整（I-MSSQL-DYNAMIC-FALLBACK-01）**：PG 版對任意 `column_name`（未列於 `MAPPED_SCORING_COLUMNS`）動態讀取 `ob_pool_data` 同名欄位並優雅降級（欄位不存在→NULL→COALESCE 0）。MSSQL 需改為「SQL 生成前，TS 端先查 `INFORMATION_SCHEMA.COLUMNS`（大寫，I-MSSQL-CATALOG-CASE-01）判斷欄位是否存在，存在→產生直接欄位參照；不存在（幽靈欄位）→SQL 生成時直接產生字面值 `0`」，此為 P3b 範圍內**唯一非純語法轉換而是設計調整**的站點，風險本質與其餘轉換站點不同（非「翻譯錯誤」而是「機制不存在，需重新設計」）。已獨立立 §七 FALLBACK 群組。
> 4. **🔴 Stage 2 計分之 AGE 為獨立站點，參考日期（reference date）與 Stage 1 之 AGE 站點不同，複製貼上 P3a 公式時極易誤植 `@ccWorkdt`**：`resolveColumnSource('AGE',...)` 使用 PG `age(cc.date_of_birth)`（單引數形式，隱含以 `CURRENT_DATE`／執行當下實際日期為參考），對應 JS golden oracle `calcAgeYears(cc.date_of_birth, new Date())`（同樣是「今日」而非月跑工作月）；Stage 1 之 AGE（`stage1-customer-core-clause.ts:141`）則明確以 `:ccWorkdt`（PROJECT_WORKYM 對應之月初日）為參考日。AD §2.2 表格文字寫「同 §2.1 AGE 轉換公式，須各自轉換與各自驗證，不可假設改一處兩處都對」，已提醒公式須各自驗證，但**未明講兩處參考日期參數本身不同**——P3a 已驗證正確之 `DATEDIFF(YEAR, dob, @ccWorkdt) - CASE...` 公式**形狀**可複用，但 `@ccWorkdt` 必須替換為 `SYSDATETIME()`/`GETDATE()`，若複製貼上時未替換此參數，本站點會計算出「以月跑工作月為基準的年齡」而非「以執行當下實際日期為基準的年齡」，兩者在跨月份查驗時會產生系統性偏差且不會拋錯（靜默錯誤）。已獨立立 §八 AGESCORE 群組 AGESCORE-META-001 MUST-FIX 守門。
> 5. **🔴 LOAN_RATE `CAST(o.loan_rate AS numeric)`（`stage2to4-sql-builder.ts:277`，無精度宣告）——T-SQL 未指定精度之裸 `NUMERIC` 預設為 `NUMERIC(18,0)`，會將小數部分四捨五入去除，AD 完全未點名此具體站點**：test-designer 查證 `ob_pool_data.loan_rate` 之 MSSQL baseline 型別為 `numeric(5,2)`（保留 2 位小數，如 12.50）。PG `CAST(x AS numeric)`（無精度）對已具型別之來源欄位值原樣保留（PG 之未限定精度 numeric 為「無額外約束」，非「強制整數」）；但 T-SQL `CAST(x AS NUMERIC)` 等同 `CAST(x AS NUMERIC(18,0))`，若逐字翻譯會將 `12.50` 轉為 `13`（四捨五入去小數），使 LOAN_RATE range 計分比對之數值系統性偏移，且不會拋錯（靜默數值錯誤，與 I-MSSQL-DECIMAL-NORMALIZE-01 揭示之 FINDING-P4D-01 同型缺陷家族，僅發生位置從 ETL type_cast 節點換成計分 SQL 本身）。此陷阱同樣適用於 §七 FALLBACK 群組之「命中真實欄位」路徑（若該欄位本身帶小數精度）。已獨立立 §十四 DECIMAL 群組 DECIMAL-LOANRATE-001 MUST-FIX 旗艦守門。
> 6. **🔴 `stage2to4-sql-builder.ts` 檔頭 docblock（1-26 行）內容與實際程式碼不符，可能誤導 tdd-implementation 誤判 P3b 範圍含 Stage 4**：檔頭註解仍描述「Stage 4 st4_exchange：T1/T2 案件 `CEIL(n*0.1)`（保底 1）...轉該部門單一 senior」，但實際 `runStage4Sql` 已於 F101/AD-E07-29（I-NO-ST4-EXCHANGE）移除（`stage2to4-sql-executor.ts:137-142` 明文記錄移除理由與去向：Stage 4 真實比例分派已改由 `stage3to4-ration-sql.ts` 之 `runStage3to4RationSql` 處理，屬 P3c 範圍）。此為過時殘留註解，非程式邏輯缺陷，但足以誤導範圍判斷。已於 §二十三 STATIC 群組設計靜態守門確認 P3b 實際範圍僅 `runStage2and3Sql`（score/card_level/tier_level 三欄，不含 dept_id/emplid/emplid_deptid/assignday 任何 Stage 4 欄位）。
> 7. **Harness 改善（依任務指示，本輪起消除 P3a 已知盲點）**：P3a impl log 明文記錄「正式 CI 需先 bootstrap dbo baseline 才能執行本套件 DB 案例」（P3a §0.2「共用既有表」策略要求六表已存在，本檔不自建）。本文件在此基礎上**新增**：`beforeAll` 對 P3b 額外依賴之 6 張計分專屬表（`ob_levelcard_version`/`ob_levelcard_column`/`ob_levelcard_score`/`ob_levelcard_level`/`ob_tier`/`ob_arreturndf_min_cap`，連同 P3a 已依賴之 6 張，合計 12 張）逐一以 `OBJECT_ID` 探測，缺表者以「零 drift」DDL（逐字複製 `1751884800000-MssqlBaselineSchema.ts` 對應 `CREATE TABLE` 陳述式，不改寫/簡化欄位定義）自建；`afterAll` 對「本次自建」之表額外執行 `DROP TABLE` 還原（對「原本已存在」之共用表**絕不** `DROP`/`TRUNCATE`，僅前綴 `DELETE`）。使套件在全新/部分缺表 dbo 上仍可獨立完整重跑，不再依賴外部人工 bootstrap 步驟。詳見 §零 0.2。
> 8. **`IS_PERSONAL_GATING` 為五個計分維度（CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK）共用之 gating 判斷式，AD §2.2 已提及「任何轉換誤差連帶波及全部五欄」，本文件據此設計交叉驗證手法**：若 gating 轉換有誤，理論上應同步影響全部五欄（而非僅單欄）；反之若僅單一欄位偏差、其餘四欄正確，代表問題出在該欄獨立分支（如 EDUCAT_BACK 額外疊加之 `numExpr` 正則），而非 gating 本身。§十五 CCDIM-GATING 群組據此設計「五欄同步觀察」案例，供除錯時快速定位根因層級。
> 9. **customer_core 之「真實資料」語意延續 P3a §頂部查證發現 6 之澄清**：`customer_core` 表結構已存在（92 欄，P4-0）且 P4d 已證明可透過 56 節點 ETL pipeline 灌入合成 fixture，但**不保證** P4d 執行後之 fixture 列仍殘留於 `dbo.customer_core`（依 P4d 自身 harness 之 `afterAll` 清理策略，執行完畢後極可能已被清空）。本文件 CCDIM/FULLEQ/SCORE 等群組**不依賴** P4d 殘留列，一律比照 P3a 手法自行以顯著前綴（`source_customer_no` 以 `P3BC` 開頭）INSERT 合成測試列。僅 §二十一 MONTHRUN-DIFF 群組（AD §4.2 建議之「真實月重跑」DoD 收尾項）**待 tdd-impl 真庫驗證**是否有可用之既有生產規模資料，若無則以完整月跑觸發真實 ETL pipeline 現場產生。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-42-mssql-p3-raw-sql-engine.md`（§1、§2.2、§4、§5 P3b、§6、§7）+ `AD-E07-42-P3a-impl.md`（AGE/CONCAT/PATINDEX 已驗證公式，AGESCORE/CARYEAR 群組直接複用形狀）+ `stage2to4-sql-builder.ts`/`stage2to4-sql-executor.ts`（PG 現行實作，逐字沿用不變）+ 三份 `.pg.spec.ts`（案例模板）+ `_p4a-mssql-harness.ts`/`mssql-env-preload.ts`（連線 harness）+ `1751884800000-MssqlBaselineSchema.ts`（12 張表結構事實來源）+ `assignment-run-pipeline.service.ts`（`resolveStage2to4Strategy`/`resolveColumnValue`/`calcAgeYears`，DISPATCH/AGESCORE/CCDIM/FALLBACK 群組直接依賴） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P3b 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」（12 表自建/共用策略，避免 CI 誤用 DROP/TRUNCATE 破壞其餘套件） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 Harness 元件

`mssql-env-preload.ts`（`restoreDbType`/`MSSQL`/`mssqlPortReachable`/`SKIP_REASON`）不新增；連線設定沿用 `CDMP_TEST`。不可達 → 整檔 `describe.skip` + 明確 `SKIP_REASON`（不假造綠燈）。`vi.setConfig({ testTimeout: 60000 })`（沿用 P3a/P4 系列教訓）。

### 0.2 🔴 Harness 改善核心：`beforeAll` 冪等自建（零 drift）+ `afterAll` 條件式清理（本輪新增，P3a 未做）

依 §頂部查證發現 7，P3b 依賴 12 張表：P3a 已依賴之 6 張（`ob_pool_data`/`ob_pool_data_list`/`ob_list_definition`/`assignment_run`/`ob_monthly_run_result`/`customer_core`）+ P3b 新增依賴之 6 張（`ob_levelcard_version`/`ob_levelcard_column`/`ob_levelcard_score`/`ob_levelcard_level`/`ob_tier`/`ob_arreturndf_min_cap`）。test-designer 已逐行查證全部 12 張表皆已存在於 `1751884800000-MssqlBaselineSchema.ts`（零風險前提：baseline 事實上已含全部所需表結構）。

- **beforeAll**：對 12 張表逐一 `OBJECT_ID('dbo.<table>','U')` 探測，記錄 `existedBeforeSuite: Set<string>`（本次套件執行前已存在之表）。對不存在者（`existedBeforeSuite` 不含），以**逐字複製** `1751884800000-MssqlBaselineSchema.ts` 對應 `CREATE TABLE` 陳述式建表（禁止改寫/簡化欄位定義、禁止省略約束，避免自建版與真實 baseline 產生 schema drift）。對已存在者，直接沿用，不 synchronize、不 DROP。
- **afterAll**：
  - 對 `existedBeforeSuite` **已包含**之表（P1b2/P4/P3a 系列共用之持久表）：**絕不** `DROP`/`TRUNCATE`，僅執行 `DELETE ... WHERE <前綴欄位> LIKE 'P3B%'`（或等效 run_id 條件）精準刪除本檔寫入列。
  - 對 `existedBeforeSuite` **不包含**之表（本次套件自建，代表套件執行前 dbo 確實缺此表）：執行 `DROP TABLE`，將 dbo 還原至套件執行前狀態。
- **冪等性**：連續執行本套件兩次（不清 dbo）應皆為綠燈——第二次執行時全部 12 表之 `OBJECT_ID` 皆非 NULL（第一次執行已建立或本已存在），`beforeAll` 走「沿用既有」分支，不重複 `CREATE TABLE`（若表已存在，`CREATE TABLE` 本身會拋錯，故此冪等性斷言即是防止「明明已判斷存在卻仍嘗試建表」之邏輯錯誤的直接驗證）。
- **效果**：本套件不再依賴外部人工執行 baseline migration 之 bootstrap 步驟即可獨立完整重跑（在全新/部分缺表 dbo 上亦可），消除 P3a impl log 記錄之已知 CI 盲點。詳見 §二十四 HARNESS 群組之對應測試案例。

### 0.3 測試列隔離前綴慣例

| 表 | 隔離鍵 | 前綴/常數 |
|---|---|---|
| `assignment_run` | `run_id` | 固定測試專用 UUID 常數 `P3B_RUN_ID` |
| `ob_list_definition` | `list_no` | `P3BL%` |
| `ob_pool_data`/`ob_pool_data_list` | `appl_no` | `P3BA%` |
| `ob_monthly_run_result` | 承 `run_id`/`list_no` | 同上 |
| `customer_core` | `source_customer_no` | `P3BC%` |
| `ob_levelcard_version`/`ob_levelcard_column`/`ob_levelcard_score` | `card_type` | `ZP3B`（+ `card_version=999001`，避開真實業務 card_type/version 命名空間） |
| `ob_levelcard_level` | 同上 `card_type`/`card_version` | 同上 |
| `ob_tier` | `card_type` | 同上 `ZP3B` |
| `ob_arreturndf_min_cap` | `appl_no` | 沿用 `P3BA%` |

### 0.4 🔴 開放式決策點（不預設答案）：`resolveColumnSource` MSSQL 版簽章調整——`to_jsonb` fallback 之 TS 端 schema 檢查如何注入純函式

現行 `resolveColumnSource(columnName, cardType)` 為同步純函式（無 IO）。I-MSSQL-DYNAMIC-FALLBACK-01 要求 fallback 分支改為「SQL 生成前，TS 端查詢 `INFORMATION_SCHEMA.COLUMNS` 決定欄位是否存在」，此查詢本質為非同步 IO，與現行函式簽章（同步、無 IO）不相容。tdd-implementation 需自行決定注入方式，本文件不預設答案，僅列出至少兩種可行選項供參考（皆須通過 §七 FALLBACK 群組之黑盒行為驗證，不綁定簽章形狀）：

- **選項甲**：呼叫端先行 `async` 查詢一次 `ob_pool_data` 全部欄位集合（每次 `buildStage2ScoreExpr` 呼叫僅查一次，非逐欄查），以第三參數 `existingColumns: Set<string>` 注入 `resolveColumnSourceMssql(columnName, cardType, existingColumns)`。
- **選項乙**：於 `stage2to4-sql-builder-mssql.ts` 模組層級快取單例（首次呼叫時查詢並快取，後續呼叫直接讀快取）。
- **決策關卡**：§一 GATE-002 要求 tdd-implementation 於 impl log 記錄實際選擇之方案與理由。

---

## 一、GATE — 前置決策關卡與環境事實核對

### TS-MSSQL-P3B-GATE-001（🔴 決策關卡）：12 張表存在性探測 + 「不可假設全新自建」政策落地
- **Related Requirement**：§0.2
- **Test Type**：Decision Gate / Precondition
- **Expected Result**：`OBJECT_ID('dbo.<table>','U')` 對 12 張表探測結果被正確記錄為 `existedBeforeSuite` 集合；後續 `afterAll` 之 DROP/DELETE 分支依此集合正確分流（不得硬編碼「全部視為已存在」或「全部視為自建」）

---

### TS-MSSQL-P3B-GATE-002：`resolveColumnSource` MSSQL 版簽章決策記錄（呼應 §0.4）
- **Related Requirement**：§0.4；I-MSSQL-DYNAMIC-FALLBACK-01
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 之 Architectural Decisions 段落記錄選擇之簽章調整方案（選項甲/乙/其他）與理由；§七 FALLBACK 群組測試案例不因簽章差異而失效（純黑盒行為驗證）

---

### TS-MSSQL-P3B-GATE-003：計分專屬 6 表（`ob_levelcard_*`/`ob_tier`/`ob_arreturndf_min_cap`）欄位型別事實核對
- **Related Requirement**：§頂部查證發現 5；`1751884800000-MssqlBaselineSchema.ts`
- **Test Type**：Static Fact Confirmation
- **Expected Result**：記錄查證結果——`ob_levelcard_score.level1`/`level2_s`/`level2_e` 皆為 `varchar(10)`；`ob_pool_data.loan_rate` 為 `numeric(5,2)`；`ob_pool_data.year_produ` 為 `varchar(4)`；`ob_pool_data.spec_tp` 為 `varchar(2)`。此四項型別事實為 §十四 DECIMAL、§九 CARYEAR、§十 PJTP 群組之測試邊界設計依據，非另需查證項（已於本文件撰寫階段查證完畢，此案例僅供 tdd-implementation regression 複核）

---

### TS-MSSQL-P3B-GATE-004（🔴）：LOAN_RATE 精度轉換方案決策記錄（呼應 §頂部查證發現 5）
- **Related Requirement**：§頂部查證發現 5；I-MSSQL-DECIMAL-NORMALIZE-01
- **Test Type**：Decision Gate（MUST-FIX 前置）
- **Expected Result**：impl log 記錄 LOAN_RATE 之 `CAST(o.loan_rate AS numeric)` MSSQL 版本採用之精度宣告方式（建議 `NUMERIC(5,2)` 對齊來源欄位，或更寬精度如 `NUMERIC(18,2)`），並說明為何不可沿用裸 `CAST(...AS NUMERIC)`（同 §十四 DECIMAL-LOANRATE-001 MUST-FIX 守門之理由）

---

### TS-MSSQL-P3B-GATE-005：`year_produ varchar(4)` 欄寬限制對 CAR_YEAR 測試手法之影響（沿用 P3a YEARABOVE 教訓）
- **Related Requirement**：§頂部查證發現 1（間接）；P3a §0.2 偏離記錄「YEARABOVE-001~007 改直接表達式」
- **Test Type**：Decision Gate（Harness 設計前提）
- **Expected Result**：確認 §九 CARYEAR 群組凡涉及超過 4 字元之髒值輸入（如 `'1980abc'`，7 字），比照 P3a 手法改用 `SELECT ... FROM (VALUES ...) v(yp)` 直接表達式測試（不透過 `ob_pool_data.year_produ` 實際插入），避免觸犯共用表欄寬限制與 §0.2「禁止 ALTER 共用表」政策的雙重約束

---

### TS-MSSQL-P3B-GATE-006：customer_core P4d 殘留列可用性探測（呼應 §頂部查證發現 9）
- **Related Requirement**：§頂部查證發現 9
- **Test Type**：Decision Gate（非阻擋，僅影響 §二十一 MONTHRUN-DIFF 執行方式）
- **Expected Result**：查詢 `dbo.customer_core` 現有列數與 `source_customer_no` 前綴分布；若存在大量非 `P3B`/`P4D` 前綴之既有列（暗示殘留生產規模資料或既有其他套件 fixture），記錄可否作為 §二十一 MONTHRUN-DIFF 之資料來源；若僅有零星或無列，記錄「需另行觸發真實 ETL pipeline 產生」之結論於 impl log

---

## 二、DISPATCH — `resolveStage2to4Strategy` 二元-ish gate MUST-FIX 守門（同型於 P3a/P1c/P2b 已反覆出現之陷阱，AD 完全未提及）

### TS-MSSQL-P3B-DISPATCH-001（🔴🔴 MUST-FIX，對現行未修改程式碼刻意設計為紅燈）：`DB_TYPE='mssql'` 現行落入 in-memory JS 路徑而非 SQL 下推
- **Related Requirement**：§頂部查證發現 2；`resolveStage2to4Strategy:174-180`；I-NOLOAD-01
- **Test Type**：Regression / MUST-FIX Gate
- **Preconditions**：`env.DB_TYPE='mssql'`
- **Steps**：直接呼叫純函式 `resolveStage2to4Strategy({ DB_TYPE: 'mssql', ASSIGNMENT_PIPELINE_V2: 'true' })` 與 `resolveStage2to4Strategy({ DB_TYPE: 'mssql', ASSIGNMENT_PIPELINE_V2: undefined })` 兩種組合
- **Expected Result**：兩種組合皆應回傳新增之 `'pushdownMssql'`（或等效新策略值），**不是** `'v2Inmemory'`/`'v1Inmemory'`（現行未修改程式碼下此案例必為紅燈，逼實作方將 `Stage2to4Strategy` 型別與函式邏輯升級為三態：`postgres → pushdownPg`／`mssql → pushdownMssql`／其餘依 `ASSIGNMENT_PIPELINE_V2` 選 v1/v2）

---

### TS-MSSQL-P3B-DISPATCH-002（🔴 MUST-FIX）：三態互斥（single input 恰對映一條路徑，比照 P3a DISPATCH-004 精神）
- **Related Requirement**：同上
- **Test Type**：Regression / MUST-FIX Gate
- **Steps**：以 `{postgres, mssql, undefined}×{true, undefined}` 全組合（6 種）呼叫 `resolveStage2to4Strategy`
- **Expected Result**：`postgres` 恆回 `pushdownPg`；`mssql` 恆回 `pushdownMssql`（不受 `ASSIGNMENT_PIPELINE_V2` 影響）；其餘依旗標回 `v2Inmemory`/`v1Inmemory`；三態彼此互斥，無重疊

---

### TS-MSSQL-P3B-DISPATCH-003（🔴 MUST-FIX）：`runPipeline` 呼叫端正確依 `pushdownMssql` 策略呼叫 mssql 版 `runStage2and3Sql`
- **Related Requirement**：`assignment-run-pipeline.service.ts:317-329`（`useStage2to4Pushdown` 判定式）
- **Test Type**：Regression / MUST-FIX Gate
- **Steps**：`vi.spyOn` 掛在 `runStage2and3Sql`（PG 版）與其 mssql 對應版本（依 tdd-implementation 實作切分之函式名）兩者，於 `DB_TYPE='mssql'` 環境執行 `runPipeline`
- **Expected Result**：呼叫的是 mssql 版本，**不是** PG 版 `runStage2and3Sql`（現行程式碼下 `useStage2to4Pushdown` 僅檢查 `strategy === 'pushdown'`，DISPATCH-001 未修復前恆為 false，落入 `executeV2`/`executeV1` in-memory 分支，此案例同樣預期紅燈直到三態化完成）

---

### TS-MSSQL-P3B-DISPATCH-004：`useStage2to4Pushdown` 判定式三態化後之字面量掃描守門
- **Related Requirement**：同上
- **Test Type**：Static Guard
- **Expected Result**：原始碼掃描確認 `runPipeline` 內判定式已從 `strategy === 'pushdown'` 擴充為明確涵蓋 `pushdownPg`/`pushdownMssql` 兩個新策略值（而非僅字面替換导致 `pushdownMssql` 被誤判為非 pushdown 落入 in-memory 分支）

---

## 三、REGEX-SAFESEX — `SAFE_INT_CUS_SEX`（`~ '^[0-9]+$'` 站點 1）

**背景**：`cc.cus_sex ~ '^[0-9]+$'` 為 CUS_SEX 計分欄本身之 NULL-safe cast 守門（BR-F104-13）。輸入為 `customer_core.cus_sex` 原始值（未經任何包裝）。

| Case ID | `cus_sex` 輸入 | 預期行為（JS↔MSSQL 皆須等價） |
|---|---|---|
| REGEX-SAFESEX-001 | `NULL` | 不拋例外，safe-cast 結果 NULL → CUS_SEX 計分 default=3 |
| REGEX-SAFESEX-002（🔴 空字串陷阱守門，呼應 ad-based-infra 記憶「正則轉字元類別空字串邊界」） | `''` | 不拋例外，safe-cast NULL → default=3（若誤譯為裸 `NOT LIKE '%[^0-9]%'` 未加 `LEN>0` 守門，空字串會被誤判為「合法數字」求值 TRUE，導致 `TRY_CAST('' AS INT)` 產生 NULL 但邏輯路徑錯誤，需以此案例攔截） |
| REGEX-SAFESEX-003 | `'1'` | safe-cast=1 → CUS_SEX range 命中對應 score row（如 `[1,1]`） |
| REGEX-SAFESEX-004 | `'C'`（髒值） | 不拋例外，safe-cast NULL → default=3（BR-F104-13 核心紅線） |
| REGEX-SAFESEX-005（EQ） | 混合批次（`NULL`/`''`/`'1'`/`'2'`/`'C'`/`'9'`） | 整批 UPDATE 不拋例外、不掉列，JS oracle 與 MSSQL pushdown 逐列 score 結果精確相等 |

---

## 四、REGEX-GATING — `IS_PERSONAL_GATING`（`~ '^[0-9]+$'` 站點 2，五欄共用）

**背景**：`COALESCE(NULLIF(cc.cus_sex,''),'1') ~ '^[0-9]+$'`。輸入已先經 `NULLIF`/`COALESCE` 包裝（保證非 NULL、非空字串，預設 `'1'`），驅動 CAREA_NO1/CAREA_NO2/CELLULAR/AGE/EDUCAT_BACK 五欄之個人/法人分流。

| Case ID | `cus_sex` 輸入 | gating 結果（isPersonal） | 說明 |
|---|---|---|---|
| REGEX-GATING-001 | `NULL` | true（個人，default `'1'`） | COALESCE 保底 |
| REGEX-GATING-002 | `''` | true（個人） | NULLIF+COALESCE 保底，與 REGEX-SAFESEX-002 同一底層公式但包裝後恆非空，驗證「即使裸 `NOT LIKE` 空字串陷阱存在，本站點因輸入恆非空而不受影響」——與站點 1 的空字串风险等级不同，須獨立驗證而非假設共用結論 |
| REGEX-GATING-003 | `'1'`/`'2'` | true（個人） | 正常值 |
| REGEX-GATING-004 | `'3'` | false（法人） | 非 1/2 之合法數字 |
| REGEX-GATING-005（🔴 五欄交叉驗證，呼應 §頂部查證發現 8） | `'C'`（髒值） | false（法人，safe_int NULL → NULL IN(1,2)=UNKNOWN → COALESCE FALSE） | 同時觀察 CAREA_NO1/CAREA_NO2/CELLULAR/AGE/EDUCAT_BACK 五欄是否**同步**呈現法人結果（即使五欄各自有值），若僅部分欄位呈現法人結果，代表 gating 未正確共用、或某欄獨立分支有誤，需個別排查 |

---

## 五、REGEX-EDUCAT — EDUCAT_BACK `numExpr`（`~ '^[0-9]+$'` 站點 3，巢狀輸入）

**背景**：`(${valStr}) ~ '^[0-9]+$'`，其中 `valStr` 本身是巢狀 `CASE`（依 gating 選個人 `RIGHT('0'||code,2)` 或法人/缺值 per-card default）。此站點輸入非原始欄位值，而是「已計算過的補零/default 字串」。

| Case ID | `education_code` 輸入 + `cardType` | `valStr` 中間結果 | 正則驗證後結果 |
|---|---|---|---|
| REGEX-EDUCAT-001 | 個人 `'5'`（`H` 卡） | `RIGHT('05',2)`='05' | 數字化=5，命中對應 range |
| REGEX-EDUCAT-002 | 個人 `''`（`S5` 卡） | fallback per-card default `'08'` | 數字化=8 |
| REGEX-EDUCAT-003（🔴 髒值邊界，本站點特有，非其餘兩站點可涵蓋） | 個人 `'AB'`（非數字，`RIGHT('0AB',2)`='AB'） | `valStr`='AB' | 正則不命中 → NULL → range 比對 UNKNOWN → 不計分（0），JS `Number('AB')`=NaN 亦不命中，須驗證兩者行為等價 |
| REGEX-EDUCAT-004 | 法人（任意 `education_code`） | 恆為 per-card default（如 `'02'`） | 數字化=2，不受 `education_code` 本身值影響（isCorp 分流已在 gating 站點處理，本站點僅需確認法人分支不誤讀個人欄位） |
| REGEX-EDUCAT-005 | 個人 `'99'`（`E` 卡） | `RIGHT('099',2)`='99' | 數字化=99，測試補零機制對已達 2 位數之輸入不誤截斷 |
| REGEX-EDUCAT-006（EQ） | 混合批次跨 6 種 cardType × 個人/法人 | — | JS oracle 與 MSSQL pushdown 逐列 EDUCAT_BACK 計分結果精確相等 |

---

## 六、REGEX-META — 三站點共通結論記錄

### TS-MSSQL-P3B-REGEX-META-001：三處 `~ '^[0-9]+$'` 站點與 P3a `^[0-9]+` 站點語意區分之靜態守門
- **Related Requirement**：§頂部查證發現 1；I-MSSQL-REGEX-CHARCLASS-01
- **Test Type**：Static Guard / Documentation
- **Expected Result**：確認 mssql 版原始碼（`stage2to4-sql-builder-mssql.ts` 或等效檔名）內三處正則轉換皆採用「全字串驗證」形態（`NOT LIKE '%[^0-9]%'` + `LEN(x)>0` 守空字串），**不得**誤用 P3a `mssqlLeadingYearExpr` 之 `PATINDEX` 擷取邏輯（語意不同，套用會產生錯誤結果——擷取邏輯回傳子字串而非布林，直接接續 `::int`/`TRY_CAST` 會產生型別不符或截斷錯誤）

### TS-MSSQL-P3B-REGEX-META-002：三站點皆需獨立 `TRY_CAST`（非裸 `CAST`）守門
- **Related Requirement**：BR-F104-13（NULL-safe cast 紅線）
- **Test Type**：Static Guard
- **Expected Result**：三處轉換後的數值化陳述式皆使用 `TRY_CAST`（防禦性轉型，失敗回 NULL 而非拋例外），對齊 PG 版「先正則驗證通過才轉型」但 T-SQL 環境仍以 `TRY_CAST` 作雙重防線（防止正則轉換本身若有邊界疏漏時仍不拋例外中斷月跑，符合 BR-F104-13「不拋 invalid input syntax」之業務紅線精神延伸）

---

## 七、FALLBACK — `to_jsonb(o)->>'col'` 動態 fallback → TS 端 schema 檢查（🔴🔴 I-MSSQL-DYNAMIC-FALLBACK-01，P3b 唯一「非純語法轉換」站點）

**背景**：`resolveColumnSource` default 分支（`stage2to4-sql-builder.ts:282-291`）為任意未 hardcode 之 `column_name`（`ob_levelcard_column.column_name` 由 DB 管理者設定，非外部輸入）產生動態欄位讀取：PG `COALESCE((to_jsonb(o)->>'${columnName.toLowerCase()}')::numeric, 0)`；幽靈欄位（`ob_pool_data` 無此 key）→ NULL → COALESCE 0（BR-F103-08，不阻擋月跑）。JS golden oracle 對應為 `pool[columnName.toLowerCase()]` 屬性讀取（`assignment-run-pipeline.service.ts:1324-1335`），`raw == null` 時 warn+回 0。此為**唯一 live production path 依賴之通用 fallback**（非死碼，任何未來新增之計分卡欄位若未 hardcode 皆會觸發），MSSQL 無等價單一 SQL 表達式可做「動態欄名讀取＋欄位不存在則優雅降級」，須依 I-MSSQL-DYNAMIC-FALLBACK-01 改為 SQL 生成前 TS 端 `INFORMATION_SCHEMA.COLUMNS` schema 檢查（大寫，I-MSSQL-CATALOG-CASE-01），SQL 生成時即決定產生「直接欄位參照」或「字面值 `0`」，不留待執行期動態解析。

### TS-MSSQL-P3B-FALLBACK-001（🔴 DoD 核心，對稱 F103 FALLBACK-001）：未 hardcode 但**存在**於 `ob_pool_data` schema 之欄位（如 `loan_totamt`）→ 產生直接欄位參照
- **Related Requirement**：§頂部查證發現 3；I-MSSQL-DYNAMIC-FALLBACK-01；I-SCORE-FALLBACK-01
- **Test Type**：Positive / EQ（DoD 核心）
- **Preconditions**：`ob_levelcard_column` 種一筆 `column_name='LOAN_TOTAMT'`（未在 `MAPPED_SCORING_COLUMNS` 清單內）；`ob_pool_data.loan_totamt` 有值（如 50000）
- **Steps**：SQL 生成前 schema 檢查應判定 `loan_totamt` 存在於 `ob_pool_data`
- **Expected Result**：生成之 SQL 字面含直接欄位參照（如 `TRY_CAST(o.[loan_totamt] AS NUMERIC(...))`），**不含**任何動態 JSON/欄名字串組裝機制；計分結果與 PG `COALESCE((to_jsonb(o)->>'loan_totamt')::numeric,0)` 一致（50000 落對應 score row）

### TS-MSSQL-P3B-FALLBACK-002（🔴🔴 DoD 核心旗艦，幽靈欄位，對稱 F103 FALLBACK-002/GHOST-002）：未 hardcode 且**不存在**於 `ob_pool_data` schema 之欄位（如 `xyz_col`）→ SQL 生成時直接產生字面值 `0`
- **Related Requirement**：§頂部查證發現 3；BR-F103-08；I-MSSQL-DYNAMIC-FALLBACK-01
- **Test Type**：MUST-FIX Gate / EQ（DoD 核心）
- **Preconditions**：`ob_levelcard_column` 種一筆 `column_name='XYZ_COL'`（保證不存在於 `ob_pool_data` 任何欄位）
- **Steps**：SQL 生成前 schema 檢查應判定 `xyz_col` 不存在
- **Expected Result**：生成之 SQL 字面**於該欄位計分表達式處直接為字面 `0`**（非 `NULL`、非執行期動態判斷、非拋錯），且**不因幽靈欄位而中斷月跑**（BR-F103-08 語意保留）；若 score row 涵蓋 `[0,100]` 之類含 0 之區間，計分結果應為該 row 之 score（對稱 PG GHOST-002「0 ∈ [0,100] → 50」情境）；靜態掃描生成之 SQL 字串確認**不含**任何 `INFORMATION_SCHEMA`/動態欄名相關 token 殘留在最終 SQL 本身（schema 檢查應僅發生於 SQL 生成前的 TS 端，不應洩漏進最終 SQL 字面）

### TS-MSSQL-P3B-FALLBACK-003（對稱 F103 FALLBACK-003/GHOST-003）：欄位存在但為非數值文字（如 `list_type`）→ `TRY_CAST` 失敗回 NULL → COALESCE 0
- **Related Requirement**：I-SCORE-FALLBACK-01
- **Test Type**：Boundary / EQ
- **Preconditions**：`ob_levelcard_column` 種一筆 `column_name='LIST_TYPE'`；`ob_pool_data.list_type` 為文字值（非數字格式）
- **Steps**：schema 檢查判定欄位存在 → 產生 `TRY_CAST(o.[list_type] AS NUMERIC)`
- **Expected Result**：`TRY_CAST` 對非數值文字回傳 NULL（MSSQL 原生行為，不拋例外），外層 `COALESCE(...,0)` 正確產生 0；與 PG `(to_jsonb(o)->>'list_type')::numeric` cast 失敗行為（PG 此處實際會拋例外，需確認 PG 版本本身是否已有防禦性處理，或本案例僅驗證 MSSQL 端不拋例外之防禦性優於或等於 PG 版）逐列比對計分結果一致

### TS-MSSQL-P3B-FALLBACK-004（🔴 I-MSSQL-CATALOG-CASE-01 交叉驗證）：schema 檢查查詢本身須用大寫 `INFORMATION_SCHEMA.COLUMNS`，且欄名大小寫比對不產生偽陰性/偽陽性
- **Related Requirement**：I-MSSQL-CATALOG-CASE-01；P4a 已驗證慣例
- **Test Type**：Regression / MUST-FIX Gate
- **Expected Result**：schema 檢查陳述式使用大寫 `INFORMATION_SCHEMA.COLUMNS`（BIN collation 下小寫會查無資料，同 P4a `EXTRACT-UNIT-002` 已驗證教訓）；`columnName.toLowerCase()` 與目錄實際回傳之欄名（比照 I-MSSQL-CASE-01 專案慣例應為小寫儲存）比對邏輯正確，不因大小寫不一致誤判「存在」欄位為「不存在」（偽陰性，會誤觸發字面 0 使正常欄位失去計分）或反之（偽陽性）

### TS-MSSQL-P3B-FALLBACK-005（🔴 N+1 禁止，對稱 F103 PREFETCH-001~003 精神）：schema 檢查為 O(1) 一次性查詢，非逐欄重複查詢
- **Related Requirement**：CLAUDE.md ETL/效能紅線精神延伸
- **Test Type**：Performance / Regression（MUST-FIX）
- **Preconditions**：單一 `card_type` 之 `activeColumns` 內含 3+ 個未 hardcode 欄位（皆需走 fallback 分支）
- **Steps**：以 spy/計數斷言包裝 `INFORMATION_SCHEMA.COLUMNS` 查詢呼叫次數，執行一次 `buildStage2ScoreExpr`（或其 mssql 版）
- **Expected Result**：查詢執行**恰 1 次**（一次取得 `ob_pool_data` 全部欄位集合快取使用），**不** 隨未 hardcode 欄位數量線性增長；若逐欄查詢，多 list 批次計分情境下會產生顯著效能劣化

### TS-MSSQL-P3B-FALLBACK-006（🔴 交叉引用 DECIMAL 群組風險，呼應 §頂部查證發現 5）：命中真實欄位路徑之數值轉型不得裸用無精度 `NUMERIC`
- **Related Requirement**：§頂部查證發現 5；I-MSSQL-DECIMAL-NORMALIZE-01
- **Test Type**：Regression（與 DECIMAL-LOANRATE-001 同型風險）
- **Preconditions**：fallback 命中之真實欄位本身帶小數精度（如假設性 `numeric(10,2)` 欄位）
- **Steps**：驗證生成之 `TRY_CAST(...)` 陳述式精度宣告是否對齊來源欄位型別
- **Expected Result**：不因裸 `TRY_CAST(...AS NUMERIC)`（預設 `NUMERIC(18,0)`）而四捨五入去除小數；若來源型別精度未知（fallback 機制設計上不預先假設欄位型別），建議至少採用足夠寬鬆之精度（如 `NUMERIC(18,4)`）避免整數化，此案例待 tdd-impl 具體實作後 regression 確認

### TS-MSSQL-P3B-FALLBACK-007（EQ，DoD 核心綜合）：JS↔MSSQL 逐列等價（涵蓋存在欄位/幽靈欄位/非數值文字三態混合批次）
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01
- **Test Type**：EQ（DoD 核心）
- **Steps**：單一 `card_type` 同時設定 3 個未 hardcode 欄位（分屬存在/幽靈/非數值文字三態），對多筆案件計分
- **Expected Result**：JS oracle（`resolveColumnValue` default 分支）與 MSSQL pushdown 逐列 score 結果精確相等，三態互不干擾

---

## 八、AGESCORE — Stage 2 AGE 獨立站點（參考日期為「今日」，非 `ccWorkdt`）

### TS-MSSQL-P3B-AGESCORE-META-001（🔴🔴 MUST-FIX 旗艦守門，呼應 §頂部查證發現 4）：參考日期須為 `SYSDATETIME()`/`GETDATE()`，不得誤植 `@ccWorkdt`
- **Related Requirement**：§頂部查證發現 4；`resolveColumnSource('AGE',...):215-226`；`calcAgeYears(dob, new Date())`
- **Test Type**：MUST-FIX Gate（已知具體數值斷言，非僅邊界關係，呼應 ad-based-infra 記憶「方向敏感雙引數函式需已知具體期望值」原則）
- **Steps**：以動態計算之 `dob`（相對「執行當下今日」回推 30 年整，如 `dobForAge(30)` 既有 helper 手法）與月跑工作月 `ym` 刻意設為**非當月**（如工作月為 3 個月前或 3 個月後）兩種情境分別跑 MSSQL pushdown
- **Expected Result**：計分結果之年齡分量在兩種 `ym` 設定下**完全相同**（皆為 30，因為參考日是「今日」而非工作月）；若計分結果隨 `ym` 變動而變動，代表誤植 `@ccWorkdt` 為參考日，判定為 MUST-FIX 紅燈

### TS-MSSQL-P3B-AGESCORE-002：age=100/101/−1 邊界（EQ，對稱 F104 AGE100-005）
- **Related Requirement**：BR-F104-07
- **Test Type**：Boundary / EQ
- **Expected Result**：age=100→命中對應 range；101→isCorp 判定外之「>100」分支→0；calcAgeYears 已 clamp 非負，MSSQL 端亦不得產生負值年齡進入 range 比對

### TS-MSSQL-P3B-AGESCORE-003：閏年 2/29 生日邊界（沿用 P3a AGE-MSSQL 群組已驗證手法）
- **Related Requirement**：P3a AGE-MSSQL-003（間接沿用）
- **Test Type**：Boundary
- **Expected Result**：2/29 生日於非閏年執行時之年齡計算與 JS `calcAgeYears` 一致（月/日比較分量正確處理 2 月無 29 日情境）

### TS-MSSQL-P3B-AGESCORE-004：法人（isCorp=true）AGE 恆為 0，不受 `date_of_birth` 實際值影響
- **Related Requirement**：BR-F104-07
- **Test Type**：Boundary
- **Expected Result**：法人 `cus_sex='3'` 即使 `date_of_birth` 有值（如 30 歲對應生日），AGE 計分仍為 0（gating 分流優先於年齡計算本身）

### TS-MSSQL-P3B-AGESCORE-005：`date_of_birth IS NULL` → 0（非拋例外）
- **Related Requirement**：`resolveColumnValue` case 'AGE'：`if (!cc?.date_of_birth) return 0;`
- **Test Type**：Negative / NULL 邊界
- **Expected Result**：`DATEDIFF` 對 NULL 引數之 MSSQL 行為需明確驗證回傳 NULL（非拋例外），外層 `CASE WHEN cc.date_of_birth IS NULL THEN 0 ...` 正確攔截

### TS-MSSQL-P3B-AGESCORE-006（EQ）：跨多筆客戶年齡分布 JS↔MSSQL 逐列等價
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01
- **Test Type**：EQ（DoD 核心）
- **Expected Result**：10+ 筆合成客戶（涵蓋個人/法人、各年齡分布）之 AGE 計分結果 JS oracle 與 MSSQL pushdown 逐列精確相等

---

## 九、CARYEAR — `CAR_YEAR`（`EXTRACT(YEAR FROM CURRENT_DATE)` + `SUBSTRING...FROM` 複合站點）

**背景**：`o.year_produ`（`varchar(4)`）經 `SUBSTRING(col FROM '^[0-9]+')`（前導擷取，與 P3a year-above **同一 pattern**，可直接複用 P3a 已驗證之 `mssqlLeadingYearExpr`）後，與 `EXTRACT(YEAR FROM CURRENT_DATE)`（今日年份，非工作月年份，同 §八 AGESCORE 之參考日陷阱需比照防範）相減。

### TS-MSSQL-P3B-CARYEAR-001（🔴）：複用 P3a `mssqlLeadingYearExpr` 而非重新推導
- **Related Requirement**：§頂部查證發現 1（間接）；P3a `mssqlLeadingYearExpr`
- **Test Type**：Static Guard / Decision Confirmation
- **Expected Result**：確認本站點之 MSSQL 轉換直接呼叫或等價複用 P3a 已於真庫驗證通過之 `mssqlLeadingYearExpr`（`PATINDEX` 手法 + 空字串/全數字/首字元非數字三態邊界），**不得**重新以樸素形式翻譯（重工且可能重新踩 P4a 空字串陷阱）

### TS-MSSQL-P3B-CARYEAR-002（🔴 MUST-FIX）：年份分量須用 `YEAR(SYSDATETIME())`/`DATEPART`，不得誤植 `@ccWorkdt`
- **Related Requirement**：§頂部查證發現 4（同型陷阱，CAR_YEAR 亦依賴「今日」而非工作月）
- **Test Type**：MUST-FIX Gate
- **Steps**：比照 AGESCORE-META-001 手法，以刻意設為非當月之 `ym` 驗證 CAR_YEAR 計分結果不隨 `ym` 變動
- **Expected Result**：CAR_YEAR = `今日年份 - year_produ`，與工作月 `ym` 無關

### TS-MSSQL-P3B-CARYEAR-003：`year_produ` 超欄寬邊界值（改直接表達式測試，呼應 GATE-005）
- **Related Requirement**：GATE-005
- **Test Type**：Boundary（VALUES 直接表達式，非表插入）
- **Expected Result**：`'1980abc'`（若透過 `SELECT ... FROM (VALUES('1980abc')) v(yp)` 直接表達式驗證）→ 擷取 1980 → 車齡正確計算；`''`/`NULL`/`'N/A'` → 0（不計分，對齊 `CASE WHEN o.year_produ IS NULL OR NULLIF(SUBSTRING(...),'') IS NULL THEN 0`）

### TS-MSSQL-P3B-CARYEAR-004：正常 4 位數年份命中 range
- **Related Requirement**：—
- **Test Type**：Positive
- **Expected Result**：`year_produ='2020'` → 車齡 = 今日年份−2020，命中對應 score row

### TS-MSSQL-P3B-CARYEAR-005（EQ）：JS↔MSSQL 逐列等價
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01
- **Test Type**：EQ
- **Expected Result**：多筆不同 `year_produ`（含正常/髒值/NULL）之 CAR_YEAR 計分結果 JS oracle 與 MSSQL pushdown 逐列精確相等

---

## 十、PJTP — PROJECT_TP composite（`TRIM(CAST(...AS text))`，F105/AD-E07-35）

### TS-MSSQL-P3B-PJTP-001：`TRIM(CAST(...AS text))` → `TRIM(CAST(...AS NVARCHAR(4000)))` 轉換正確
- **Related Requirement**：`stage2to4-sql-builder.ts:414-415`
- **Test Type**：Positive / Static
- **Expected Result**：`codeExpr`/`keywordExpr` 之 `AS text` 轉為 MSSQL 合法型別（`NVARCHAR(4000)` 或等效），`TRIM()` 為 MSSQL 2017+ 原生函式，不需額外轉換函式本身

### TS-MSSQL-P3B-PJTP-002：借新還舊關鍵字 + spec_tp 代碼區間雙條件 AND（EQ，對稱 PJTP-EQ-01/02）
- **Related Requirement**：AD-E07-35
- **Test Type**：EQ
- **Expected Result**：`spec_name LIKE '%借新還舊%'` → keyword='A'；`spec_tp` 落 `level2_s`~`level2_e` 區間；兩條件皆需同時成立才取分，JS↔MSSQL 逐列一致

### TS-MSSQL-P3B-PJTP-003：每 score row 迴圈內動態展開，多列 score row 皆需逐一驗證（呼應 AD §2.2 表格「須確保轉換不遺漏任何一次展開」提醒）
- **Related Requirement**：`stage2to4-sql-builder.ts:400-419`
- **Test Type**：Regression
- **Expected Result**：3+ 個 `PROJECT_TP` score row（不同 `level2_s`/`level2_e`/`level1` 組合）皆各自產生正確 `TRIM(CAST(...))` 展開，非僅第一個 row 正確

### TS-MSSQL-P3B-PJTP-004（EQ）：`spec_tp` NULL → COALESCE 01 fallback（對稱 PJTP-EQ-08）
- **Related Requirement**：`resolveColumnSource('PROJECT_TP',...)`
- **Test Type**：Boundary / EQ
- **Expected Result**：`spec_tp IS NULL` → `codeExpr` COALESCE 為 `'01'`，MSSQL 與 JS/PG 一致命中對應 row

---

## 十一、CROSSAPPLY — `CROSS JOIN LATERAL` → `CROSS APPLY`

### TS-MSSQL-P3B-CROSSAPPLY-001：語法轉換正確，且恆產生恰 1 列（無 FROM/WHERE 子查詢語意保留）
- **Related Requirement**：`stage2to4-sql-executor.ts:117`
- **Test Type**：Positive / Structural
- **Expected Result**：`CROSS JOIN LATERAL (SELECT ${scoreSelect} AS score) sub` → `CROSS APPLY (SELECT ${scoreSelect} AS score) sub`；由於子查詢無 `FROM`/`WHERE`（純量常數表達式），`CROSS APPLY` 對外層每一列皆恆產生**恰 1 列**（非 0、非多列），避免 UPDATE 目標列因 JOIN 基數異常而遺漏或重複命中

### TS-MSSQL-P3B-CROSSAPPLY-002：`sub.score` 可被後續 `lv`/`ti` JOIN 正確引用（LATERAL 依賴關係保留）
- **Related Requirement**：同上
- **Test Type**：Regression
- **Expected Result**：`CROSS APPLY` 之計算結果 `sub.score` 在 T-SQL 中天然可被同一 `FROM` 子句內後續 `LEFT JOIN ob_levelcard_level lv ON ... sub.score >= lv.score_s ...` 正確引用（`CROSS APPLY` 語意上等同 `LATERAL`，此為 T-SQL 原生支援特性，非需額外改寫）

### TS-MSSQL-P3B-CROSSAPPLY-003（EQ）：`score IS NULL`（無 active version）情境下 `CROSS APPLY` 仍正確產生 1 列（`NULL::int` → `CAST(NULL AS INT)`）
- **Related Requirement**：`scoreSelect = scoreExpr === null ? 'NULL::int' : ...`
- **Test Type**：Boundary / EQ
- **Expected Result**：無 active version 情境 `sub.score` 為 NULL（非因 `CROSS APPLY` 產生 0 列而導致整列從結果集消失），`card_level`/`tier_level` 依 NULL 傳播正確為 NULL（非誤觸 fallback）

---

## 十二、DISTINCTFROM — `ti.card_level IS NOT DISTINCT FROM lv.card_level` → OR-NULL 重寫（對稱 F100 LEVTIER-002~005）

**背景**：NULL-aware tier fallback join。轉換公式：`(ti.card_level = lv.card_level OR (ti.card_level IS NULL AND lv.card_level IS NULL))`。

| Case ID | `ti.card_level`（`ob_tier` 種子列） | `lv.card_level`（score 命中之區間） | 預期 tier 命中 |
|---|---|---|---|
| DISTINCTFROM-001 | `'A'` | `'A'` | 兩者非 NULL 且相等 → 命中（正常匹配，非 fallback） |
| DISTINCTFROM-002 | `'A'` | `'B'` | 兩者非 NULL 但不相等 → 不命中（🔴 須驗證 OR 子句不因誤譯導致假性匹配） |
| DISTINCTFROM-003（🔴 fallback 核心） | `NULL`（fallback 列） | `NULL`（score 落區間外，card_level 未命中任何 `ob_levelcard_level`） | 兩者皆 NULL → 命中 fallback（LEVTIER-003 對稱） |
| DISTINCTFROM-004（🔴 反面邊界，須驗證不誤觸 fallback） | `NULL`（fallback 列存在） | `'A'`（score 正常命中） | 一 NULL 一非 NULL → **不命中** fallback 列（fallback 列僅應在 `lv.card_level` 亦為 NULL 時匹配，若誤譯為裸 `OR ti.card_level IS NULL` 未同時檢查 `lv.card_level IS NULL`，會導致任何有效 card_level 誤觸 fallback） |
| DISTINCTFROM-005（EQ，對稱 LEVTIER-004） | — | `sub.score IS NULL`（無 active version） | tier NULL（不走 fallback，`AND (sub.score IS NOT NULL OR lv.card_level IS NOT NULL)` 額外守門邊界需同步驗證） |

---

## 十三、UPDATEFROM — `UPDATE ob_monthly_run_result r SET ... FROM ...` 目標併入 FROM 重構

### TS-MSSQL-P3B-UPDATEFROM-001（🔴 MUST-FIX）：目標表 `r`（`ob_monthly_run_result`）正確併入 T-SQL `FROM` 子句
- **Related Requirement**：`stage2to4-sql-executor.ts:107-129`；ad-based-infra 記憶「PG UPDATE 目標就地宣告別名，T-SQL 需併入 FROM」
- **Test Type**：MUST-FIX Gate / Structural
- **Steps**：靜態掃描 mssql 版 SQL 模板，確認 `UPDATE r SET ... FROM ob_monthly_run_result r JOIN ob_pool_data o ON ... LEFT JOIN customer_core cc ... CROSS APPLY (...) sub LEFT JOIN ob_levelcard_level lv ... LEFT JOIN ob_tier ti ... WHERE ...` 結構（`r` 出現於 `FROM` 子句而非僅 `UPDATE` 後）
- **Expected Result**：對真實 MSSQL 執行不拋 `Invalid object name`/`Must declare the scalar variable`；若逐字沿用 PG 版「目標就地宣告別名不列 FROM」寫法，保證語法錯誤

### TS-MSSQL-P3B-UPDATEFROM-002（🔴 防跨 run 污染旗艦案例）：`WHERE r.run_id/list_no` 條件於重構後正確保留，未因目標併入 FROM 而遺漏範圍限定
- **Related Requirement**：同上；I-MSSQL-ENGINE-EQ-01
- **Test Type**：MUST-FIX Gate（呼應 ad-based-infra 記憶「UPDATE-FROM 重構常見遺漏 WHERE 條件」風險）
- **Preconditions**：同一 `dbo.ob_monthly_run_result` 表內存在 2 個不同 `run_id`（或 `list_no`）之案件列
- **Steps**：對 `run_id=A` 執行 `runStage2and3Sql`（mssql 版）
- **Expected Result**：僅 `run_id=A` 之列被更新（score/card_level/tier_level 有值），`run_id=B` 之列**完全不受影響**（仍為 Stage 1 寫入時之 NULL）——此為本群組最高風險案例，若 `WHERE` 條件在重構過程遺漏，會導致跨 run 資料污染且無明顯錯誤徵兆

### TS-MSSQL-P3B-UPDATEFROM-003：`o.orgno = r.orgno AND o.appl_no = r.appl_no` join key 條件保留
- **Related Requirement**：同上
- **Test Type**：Regression
- **Expected Result**：每一 `ob_monthly_run_result` 列僅匹配對應 `orgno+appl_no` 之 `ob_pool_data` 列（非笛卡兒積、非誤配其他案件之屬性）

### TS-MSSQL-P3B-UPDATEFROM-004：`customerCoreJoin`/`arCapitalJoin` 條件式插入（`needsCustomerCore`/`needsArCapital` 為 false 時不 JOIN）於重構後正確保留
- **Related Requirement**：`runStage2and3Sql:93-102`
- **Test Type**：Regression
- **Expected Result**：card_type 之 active columns 皆不含 customer_core/ADD_UN_CAPITAL 依賴時，MSSQL SQL 字面不含對應 `LEFT JOIN`（效能考量保留，非僅正確性）

---

## 十四、DECIMAL — LOAN_RATE 精度 + ADD_UN_CAPITAL + score int cast

### TS-MSSQL-P3B-DECIMAL-LOANRATE-001（🔴🔴 MUST-FIX 旗艦守門，呼應 §頂部查證發現 5）：`CAST(o.loan_rate AS numeric)` 不得裸用無精度 `NUMERIC`
- **Related Requirement**：§頂部查證發現 5；GATE-004；I-MSSQL-DECIMAL-NORMALIZE-01
- **Test Type**：MUST-FIX Gate（已知具體數值斷言）
- **Preconditions**：`o.loan_rate = 12.50`；score row `level2_s='12.00', level2_e='12.99'`（僅小數精度範圍能命中的 range）
- **Steps**：MSSQL pushdown 計分
- **Expected Result**：LOAN_RATE 命中該 score row（因 12.50 落在 [12.00,12.99]）；若 MSSQL 版誤用裸 `CAST(...AS NUMERIC)`（等同 `NUMERIC(18,0)`，四捨五入為 13），13 不落此區間 → 誤判不命中，即為 MUST-FIX 紅燈判定依據

### TS-MSSQL-P3B-DECIMAL-LOANRATE-002：per-card default 精度一致性（S5→77／E/E5→12，皆為整數，不受本站點精度問題影響但仍需 regression 確認）
- **Related Requirement**：`cardDefault('LOAN_RATE', cardType)`
- **Test Type**：Regression
- **Expected Result**：`loan_rate IS NULL` 時 per-card default 命中結果 JS↔MSSQL 一致

### TS-MSSQL-P3B-DECIMAL-ARCAP-001：`ob_arreturndf_min_cap.add_un_capital numeric(15,0)`（無小數，本身精度風險低，仍需 regression）
- **Related Requirement**：`resolveColumnSource('ADD_UN_CAPITAL',...)`
- **Test Type**：Regression
- **Expected Result**：`COALESCE(ar.add_un_capital, 0)` 轉換於 MSSQL 版數值正確（整數精度，無小數遺失風險，但仍需確認 `COALESCE`/型別轉換無誤）

### TS-MSSQL-P3B-DECIMAL-SCOREINT-001：`(scoreExpr)::int` → `CAST((...) AS INT)`；`NULL::int` → `CAST(NULL AS INT)`
- **Related Requirement**：`stage2to4-sql-executor.ts:105`
- **Test Type**：Static / Regression
- **Expected Result**：最終 `score` 欄位型別轉換正確，且 SUM(CASE...) 各分支 `score` 整數字面值（非小數）不因型別轉換產生非預期捨入（此站點值皆為已定義整數常數，風險低於 LOAN_RATE，但仍列入靜態掃描範圍）

### TS-MSSQL-P3B-DECIMAL-005（EQ，統整案例）：LOAN_RATE 精度問題與其餘計分維度混合情境下之整體 score 加總仍正確
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01
- **Test Type**：EQ（DoD 核心）
- **Expected Result**：多維度同時計分（含小數 LOAN_RATE）之總 score JS↔MSSQL 逐列精確相等

---

## 十五、CCDIM — customer_core 9 個計分維度完整 EQ 矩陣（🔴 DoD 核心，AD §0 已解除過渡態限制）

**背景**：`CUS_SEX`/`AGE`/`EDUCAT_BACK`/`CAREA_NO1`/`CAREA_NO2`/`CELLULAR`/`HPOST_NUM_NM`/`CPOST_NUM_NM`/`CO_NUM_NM` 九維度，皆對 customer_core P3B 前綴合成 fixture 執行，逐維度 JS↔MSSQL EQ，對稱 F104 PG spec 之 SEX/SAFE/BRANCH/AGE100/EDU/CITY/PCD 群組。

### 15.1 CCDIM-SEX（對稱 F104 SEX-003/004）
| Case ID | `cus_sex` | 預期命中 |
|---|---|---|
| CCDIM-SEX-001 | `'1'`/`'2'`/`'3'` 各落不同 range | 逐值命中對應 score row |
| CCDIM-SEX-002 | 缺值（`cc=null`，無對應 customer_core 列） | 計分 default=3 命中 `[3,3]` |
| CCDIM-SEX-003（EQ） | 混合批次 | JS=MSSQL |

### 15.2 CCDIM-BRANCH（個人/法人五欄分流，對稱 F104 BRANCH-009/010）
| Case ID | `cus_sex` | CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK 五欄 |
|---|---|---|
| CCDIM-BRANCH-001 | 個人 `'1'`，五欄皆有值 | 五欄依各自屬性值計分（presence=1、年齡實際值、教育補零值） |
| CCDIM-BRANCH-002 | 法人 `'3'`，五欄即使有值 | 五欄皆為 0/per-card default（不讀個人屬性值） |
| CCDIM-BRANCH-003（EQ） | 混合批次 | JS=MSSQL，五欄同步比對 |

### 15.3 CCDIM-EDU（補零 + per-card default，對稱 F104 EDU-006/007）
| Case ID | 情境 | 預期 |
|---|---|---|
| CCDIM-EDU-001 | 個人 `education_code='5'` | 補零 `'05'` 命中 range |
| CCDIM-EDU-002 | `S5` 卡缺值 | default `'08'` 命中 `[08,99]` |
| CCDIM-EDU-003（EQ） | 混合批次跨 6 種 card_type | JS=MSSQL |

### 15.4 CCDIM-CITY（LEFT3 + per-card default，對稱 F104 CITY-002/003/009/010）
| Case ID | 情境 | 預期 |
|---|---|---|
| CCDIM-CITY-001 | `hpost_city='臺北市中正區'` | `LEFT(...,3)`='臺北市' 命中 |
| CCDIM-CITY-002 | `hpost_city='南投縣中寮鄉'` | LEFT3='南投縣'，無對應 level1 → 0 |
| CCDIM-CITY-003 | `M` 卡三縣市欄全缺值 | 走 per-card default（`臺北市`/`臺南市`/`高雄市`）命中 |
| CCDIM-CITY-004（EQ） | 三縣市欄 × 多 card_type 組合 | JS=MSSQL |

### 15.5 CCDIM-GATING（呼應 §頂部查證發現 8，五欄同步交叉觀察）
| Case ID | `cus_sex` | 觀察範圍 |
|---|---|---|
| CCDIM-GATING-001 | `'C'`（髒值） | 五欄（CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK）**同步**呈現法人結果，用於根因定位（若僅單欄偏差代表該欄獨立分支有誤） |
| CCDIM-GATING-002 | `NULL`/`''` | 五欄同步呈現個人（default `'1'`）結果 |

### 15.6 CCDIM-PCD（LIST_MONTH/LOAN_RATE per-card default，對稱 F104 PCD-007/008，非 customer_core 但同批次 per-card 機制一併驗證）
| Case ID | 情境 | 預期 |
|---|---|---|
| CCDIM-PCD-001 | `LIST_MONTH` H→25／E→12 default | 缺值時各卡命中對應 default |
| CCDIM-PCD-002（EQ） | 混合批次 | JS=MSSQL |

### TS-MSSQL-P3B-CCDIM-FULLEQ-001（🔴 DoD 核心綜合大場景，對稱 F104 EQ-012）
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01；AD §4.2「9 個計分維度大量依賴」
- **Test Type**：EQ（DoD 核心）
- **Steps**：單一客戶 `S5` 卡多欄交互（age/educat/loan_rate/co_num 縣市 default + 部分有值混合）計分
- **Expected Result**：JS oracle 與 MSSQL pushdown 之 score 總和逐位元組相等（誤差=0）

---

## 十六、SCORE — F100 SUM(CASE…) 核心機制（對稱 SCORE-001~007）

| Case ID | 情境 | 預期（對稱 PG） |
|---|---|---|
| SCORE-001 | 區間命中（`month_cnt=2→10` / `=10→30`） | 逐值命中對應 score |
| SCORE-002 | 區間邊界（`5→[0,5]`上界 / `6→[6,12]`下界 / `13→`界外 0） | 邊界精確 |
| SCORE-003 | composite code trim 相等（level2 含 padding） | trim 後比對正確 |
| SCORE-004 | 多維度累加（非取單一最大） | SUM 正確 |
| SCORE-005 | disabled 維度不計分 | active columns 過濾正確 |
| SCORE-006 | 無 active version → score NULL（案件仍寫入） | NULL 語意保留 |
| SCORE-007 | 有 active 但 0 命中 → score=0（與 NULL 區分） | 0 ≠ NULL |

---

## 十七、CJOIN — customer_core LEFT JOIN 不掉列

| Case ID | 情境 | 預期 |
|---|---|---|
| CJOIN-001 | customer_core match → CUS_SEX 取分 | 正確取值 |
| CJOIN-002 | customer_core 無 match（無對應 `source_customer_no`） | 案件不消失（LEFT JOIN 保留），屬性 NULL 不取分 |
| CJOIN-003（EQ） | 混合 match/無 match 批次 | JS=MSSQL 逐列（含案件數量一致，非因誤用 INNER JOIN 掉列） |

---

## 十八、AR — ADD_UN_CAPITAL JOIN flag

| Case ID | 情境 | 預期 |
|---|---|---|
| AR-001 | active `ADD_UN_CAPITAL` → `needsArCapital=true` | SQL 含 `LEFT JOIN ob_arreturndf_min_cap` |
| AR-002 | 無 `ADD_UN_CAPITAL` → `needsArCapital=false` | SQL 不含該 JOIN（效能考量） |
| AR-003 | 有對應 `ob_arreturndf_min_cap` 紀錄 | 取值計分正確 |
| AR-004 | 無對應紀錄 | `COALESCE(ar.add_un_capital, 0)`，不掉列 |

---

## 十九、S2CLEAN — Stage 2 不寫 is_cr（I-CR-STAGE2-CLEAN-01）

| Case ID | 情境 | 預期 |
|---|---|---|
| S2CLEAN-001 | Stage 1 帶入 `is_cr='Y'`/`'N'` | Stage 2 後保留原值不變 |
| S2CLEAN-002 | Stage 1 未帶（NULL） | Stage 2 後仍 NULL（不誤寫） |

---

## 二十、FULLEQ — F103/F104/F105 綜合 DoD EQ（高密度逐列比對）

### TS-MSSQL-P3B-FULLEQ-001~008（對稱既有 PG spec EQ-001~008、EQ-012、PJTP-EQ-01~08 精神，逐案綜合）
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01；AD §5 P3b DoD #1
- **Test Type**：EQ（DoD 核心）
- **涵蓋情境**（每案獨立列入本文件之 vitest 實作時應各自成一 `it()`）：
  1. `ADD_UN_CAPITAL>0` + 全 customer_core 有值
  2. `ADD_UN_CAPITAL` NULL（無 `ob_arreturndf_min_cap` 對應列）
  3. `cc=null`（無 customer_core，屬性全 default）
  4. `PROJECT_TP` composite：借新還舊命中 vs 不命中
  5. `SALES_STS`：AGENT / 中古車商 / 其他三值分流
  6. `AGE` 邊界：生日前一天/當天/後一天（今日參考，非工作月）
  7. §七 FALLBACK 群組之通用 fallback（未 hardcode range pool 欄，如 `loan_totamt`，需存在於 `ob_pool_data` schema）
  8. 全部 9 個 customer_core 維度 + LOAN_RATE 小數精度 + PROJECT_TP composite 同時作用之單一綜合大場景（最終 DoD 收尾案例）
- **Expected Result**：全部 8 案 JS oracle 與 MSSQL pushdown 之 score/card_level/tier_level 三欄逐列精確相等（誤差=0）

---

## 二十一、MONTHRUN-DIFF — 真實月重跑跨引擎比對（AD §4.2 DoD #4，非常規 vitest 自動化案例）

> **執行方式說明**：本群組性質同專案既有 F101/F102/F104 之「202606 真實重跑」慣例（見 project memory `project_f104_scoring_legacy_align.md`/`project_f101_stage34_assignment.md`），建議以**腳本/手動觸發**方式執行並記錄於 impl log，而非併入常駐 `.mssql.spec.ts` 自動化套件（資料規模與執行時間不適合 CI 每次跑）。

### TS-MSSQL-P3B-MONTHRUN-DIFF-001（🔴 DoD 收尾核心）：同月同輸入資料，PG 與 MSSQL 各跑一次完整月跑，逐欄逐列比對 score/card_level/tier_level
- **Related Requirement**：AD §4.2「建議一次對真實 customer_core 資料的 202606（或最新月）計分結果重跑，與 PG 版本結果逐欄逐列比對」；AD §5 P3b DoD #4
- **Test Type**：Integration（非阻擋 P3b 核心 DoD，但為 AD 明文建議之補充驗收）
- **Preconditions**：待 GATE-006 查證結果決定資料來源（既有殘留列或現場觸發 ETL）
- **Expected Result**：因 customer_core 已非過渡態（P4 完整就緒），比對應為**完全等價**（非「已知系統性偏低」），任何差異需逐一根因分析（可能指向本文件某站點之殘餘轉換誤差）

### TS-MSSQL-P3B-MONTHRUN-DIFF-002：差異報告格式比照既有 F067/F101/F102 慣例
- **Related Requirement**：同上
- **Test Type**：Documentation
- **Expected Result**：若發現差異，以既有專案慣用之差異報告格式記錄（案件層級 + 彙總層級），供業務簽核判斷是否阻擋 cutover

---

## 二十二、CHARSET — 中文 round-trip

| Case ID | 情境 | 預期 |
|---|---|---|
| CHARSET-001 | `SALES_STS` category '中古車商' 中文字面值比對 | trim 後精確相等，非亂碼 |
| CHARSET-002 | 借新還舊關鍵字（`spec_name LIKE '%借新還舊%'`） | LIKE 中文萬用字元比對正確 |
| CHARSET-003 | 三縣市欄中文（如 '花蓮縣'/'金門縣'） | LEFT3 中文字元計數正確（非 byte 計數，MSSQL `LEFT`/`LEN` 對 NVARCHAR 為字元計數） |

---

## 二十三、STATIC — 原始碼靜態掃描守門

### TS-MSSQL-P3B-STATIC-001（🔴 無 DROP/TRUNCATE 守門，對稱 P3a STATIC-001）
- **Expected Result**：掃描 mssql 測試檔原始碼，確認對 12 張共用表**不存在** `DROP TABLE`/`TRUNCATE TABLE` 字面（僅允許對「本次自建」表之條件式 `DROP`，見 §二十四 HARNESS 群組獨立驗證）

### TS-MSSQL-P3B-STATIC-002：PG 5 核心檔（`stage2to4-sql-builder.ts`/`stage2to4-sql-executor.ts` 等）逐位元組不變
- **Expected Result**：`git diff` 對這些檔案為空（P3b 僅新增平行 `-mssql.ts` 檔）

### TS-MSSQL-P3B-STATIC-003：mssql 新檔命名鎖定
- **Expected Result**：`stage2to4-sql-builder-mssql.ts`/`stage2to4-sql-executor-mssql.ts`（或等效命名）存在，未散落於其他非預期檔案

### TS-MSSQL-P3B-STATIC-004（🔴 零殘留 PG 專屬 token 掃描）：mssql 版產出 SQL 字面**不含**任何 `::`、`~ '`、`to_jsonb`、`->>`、`CROSS JOIN LATERAL`、`IS NOT DISTINCT FROM`
- **Related Requirement**：§頂部查證發現 1、3；ad-based-infra 記憶「PG 特有語法糖速查清單」
- **Test Type**：Static Guard（MUST-FIX）
- **Expected Result**：以正則掃描 mssql 版檔案原始碼字串常數，逐一確認上述 7 種 PG 專屬 token 零命中；發現任一命中即為未完成轉換之遺漏站點（`to_jsonb`/`->>` 兩項對應 §七 FALLBACK 群組——最終 SQL 字面應已於 TS 端解掉，不應殘留這兩個 token）

### TS-MSSQL-P3B-STATIC-005：`stage2to4-sql-builder.ts` 檔頭 docblock stale 註解不誤導範圍（呼應 §頂部查證發現 6）
- **Related Requirement**：§頂部查證發現 6
- **Test Type**：Documentation Guard
- **Expected Result**：impl log 明確記錄 P3b 實際範圍僅 `runStage2and3Sql`（score/card_level/tier_level），不含任何 Stage 4 欄位（`dept_id`/`emplid`/`emplid_deptid`/`assignday`）之 SQL 產生邏輯；建議（非阻擋）system-architect 於下次修訂同步移除/更新該 docblock 過時段落

### TS-MSSQL-P3B-STATIC-006：DISPATCH 三態化字面量鎖定（呼應 DISPATCH-004）
- **Expected Result**：`Stage2to4Strategy` 型別定義字面含 `'pushdownMssql'`（或等效新值），非僅新增獨立於既有型別之旁支邏輯

### TS-MSSQL-P3B-STATIC-007：DECIMAL 精度宣告字面掃描
- **Expected Result**：LOAN_RATE 轉換站點之 MSSQL SQL 字面含明確精度宣告（如 `NUMERIC(5,2)`），非裸 `NUMERIC`/`DECIMAL` 無精度字面

---

## 二十四、HARNESS — beforeAll/afterAll 自建策略驗證（本輪新增改善項，呼應 §頂部查證發現 7）

### TS-MSSQL-P3B-HARNESS-001：全新/部分缺表 dbo 情境下 `beforeAll` 正確自建缺失表（待 tdd-impl 真庫驗證：本機 CDMP_TEST dbo 平時已含 P1b2/P4 系列建立之全部 12 表，此案例需人為製造缺表情境，如比照 P3a impl log 「取得真庫證據」之暫時性驗證手法）
- **Related Requirement**：§0.2
- **Test Type**：Decision Gate / Integration（待真庫驗證）
- **Expected Result**：`beforeAll` 對缺失表以零 drift DDL 自建成功，套件其餘案例可正常執行

### TS-MSSQL-P3B-HARNESS-002：`afterAll` 對本次自建之表正確 `DROP TABLE` 還原
- **Related Requirement**：§0.2
- **Test Type**：Integration（待真庫驗證）
- **Expected Result**：套件執行完畢後，本次自建之表已從 dbo 移除，`OBJECT_ID` 再次查詢為 NULL

### TS-MSSQL-P3B-HARNESS-003：`afterAll` 對「原本已存在」之表絕不 DROP，僅前綴 DELETE
- **Related Requirement**：§0.2；STATIC-001
- **Test Type**：Regression（MUST-FIX）
- **Expected Result**：套件執行完畢後，P1b2/P4/P3a 系列依賴之持久表（如套件執行前已存在）**仍然存在**且結構不變，僅套件寫入之 `P3B%` 前綴列被清除，其餘套件（如 P4d）之殘留資料不受影響

### TS-MSSQL-P3B-HARNESS-004（冪等性）：套件連續執行兩次皆為綠燈
- **Related Requirement**：§0.2「冪等性」
- **Test Type**：Regression（MUST-FIX）
- **Expected Result**：第二次執行時 `beforeAll` 判定全部 12 表已存在（第一次執行已建立），不重複嘗試 `CREATE TABLE`（若誤重複嘗試會因表已存在而拋錯，此案例即是防止該邏輯錯誤的直接驗證）

### TS-MSSQL-P3B-HARNESS-005：零 drift DDL 與 baseline migration 逐欄比對守門
- **Related Requirement**：§0.2「零 drift」
- **Test Type**：Static Guard
- **Expected Result**：自建 DDL 字面（若 tdd-implementation 選擇獨立字串常數而非直接 import baseline migration 之陳述式）與 `1751884800000-MssqlBaselineSchema.ts` 對應 `CREATE TABLE` 陳述式之欄位清單/型別/約束逐一比對相符，避免自建版產生 schema drift（建議 tdd-implementation 直接複用/匯入 migration 檔內字串常數而非手動複製貼上，降低未來 baseline 修訂時之維護風險，此建議記入 risks-and-gaps.md 供决策參考）

---

## 二十五、REG — 回歸

### TS-MSSQL-P3B-REG-001：PG 路徑（`stage2to4-sql-pushdown.pg.spec.ts`/`stage2to4-score-source-f103.pg.spec.ts`/`stage2to4-score-source-f104.pg.spec.ts`）不回歸
- **Expected Result**：三檔既有測試全綠（或延續既有 5433 不可達之 degradable skip 政策，非因本輪變更新增失敗）

### TS-MSSQL-P3B-REG-002：SQLite / in-memory 路徑（`v1Inmemory`/`v2Inmemory`）不受影響
- **Expected Result**：`stage2to4-sql-builder.spec.ts`/`stage2to4-score-source-f103.spec.ts`/`stage2to4-score-source-f104.spec.ts`（非 `.pg.`/`.mssql.` 版本）全綠

### TS-MSSQL-P3B-REG-003：P3a Stage 1 套件不回歸
- **Expected Result**：`stage1-sql-pushdown.mssql.spec.ts`（P3a 63 test blocks）不受本輪變更影響，全綠

### TS-MSSQL-P3B-REG-004：`npx tsc --noEmit -p tsconfig.build.json` 乾淨
- **Expected Result**：exit 0

### TS-MSSQL-P3B-REG-005：P1b2/P4 系列既有套件不回歸（共用 dbo 表隔離驗證）
- **Expected Result**：P1b2 parity 測試、P4a~e ETL 測試套件於本輪變更後仍全綠（Harness §0.2 之表結構/資料隔離未破壞其假設）

---

## 附錄：測試檔案命名建議（供 tdd-implementation 參考，非強制）

比照 AD §4.2 建議：`stage2to4-sql-pushdown.mssql.spec.ts`（涵蓋 §二~十四、十六~十九、二十二~二十五 之結構/邏輯站點）+ `stage2to4-score-source-f103.mssql.spec.ts`/`stage2to4-score-source-f104.mssql.spec.ts`（涵蓋 §七 FALLBACK、§十五 CCDIM、§二十 FULLEQ 之逐維度 EQ 矩陣，對稱既有 F103/F104 PG spec 檔案切分）。§二十一 MONTHRUN-DIFF 建議獨立腳本（非 vitest spec），置於 `scripts/` 或 impl log 附件。
