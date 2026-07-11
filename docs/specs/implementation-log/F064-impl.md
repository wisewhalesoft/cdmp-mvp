---
type: implementation-log
feature_id: F064
feature_name: 匯出分派結果（23 欄對齊 legacy）
status: complete
last_updated: 2026-06-17
spec_version: "2.1"
related: [US-155, AD-E07-31, F101, F102]
---

# F064 v2.1：匯出分派結果（23 欄對齊 legacy）— 實作紀錄

## v2.1 血緣修正（I-EXP-LINEAGE-01，2026-06-17 live 抓 bug 後）

**問題**：v2.0 `buildExportQuery` 以 `INNER JOIN ob_pool_data_list p ON p.list_no=r.list_no AND p.orgno=r.orgno AND p.appl_no=r.appl_no` 取 pool 屬性 → 202606 匯出**掉 6,438 列（11.5%；55,863 → 49,425）**。

**根因**：月名單分派 Stage 1 為 `INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data o`（共享池，PK=orgno+appl_no，無 list_no）衍生 result 母體；`ob_pool_data_list`（per-list 去重表）只在 Stage 1 被 LEFT JOIN 取 CR 欄，**非** result 母體。以 list_no+orgno+appl_no 連 per-list 表會掉「不在該名單去重表」之 result 列。

**修法**（`buildExportQuery`）：
- pool join 改 `INNER JOIN ob_pool_data o ON o.orgno=r.orgno AND o.appl_no=r.appl_no`（維持 INNER，血緣保證每筆 result 必有對應 ob_pool_data 列）。
- 10 個 pool 欄（dept_name/appl_date/pro_rate/sta_code/sta_code_na/project_tp/spec_name/brand_name/overdue_day/month_cnt）改取自 `o.`（欄名不變、matched 列值逐欄相同，無回歸）。
- 進件日改取 `o.appl_date`（ob_pool_data.appl_date 為 timestamp 帶時間 → `formatApplDate` 只取日期部分：Date 分支本地 getter、字串分支 slice(0,10)，timestamp/Date 皆正確）。
- emphire / list_def 的 LEFT JOIN 不變。
- 新增 **LINEAGE 測試**：PG 真庫 seed 25 筆 result + ob_pool_data、**完全不 seed ob_pool_data_list** → 匯出列數 == result 列數（25，不掉列）；靜態斷言實際 SQL `INNER JOIN ob_pool_data`、無 `JOIN ob_pool_data_list`。
- 受影響 PG fixture：改 seed `ob_pool_data`（PK orgno+appl_no，補 custo_no/sta_code/dept_id/list_type/settle_src/_cdmp_extracted_at）取代 ob_pool_data_list。SQLite 單元測試（mock cursorRows）資料來源無關、不受影響。

**確認**：join 查 `ob_pool_data`（非 ob_pool_data_list）— 已於 LINEAGE-002 靜態 + production SQL `FROM ob_monthly_run_result r INNER JOIN ob_pool_data o ON o.orgno=r.orgno AND o.appl_no=r.appl_no` 確認。

---

## 摘要

依 F064 v2.0 spec（US-155）+ AD-E07-31 + v2.1 血緣修正（I-EXP-LINEAGE-01）落地匯出重構：
- 資料來源由 `assignment_run_snapshot.payload`（8 欄）改為 `ob_monthly_run_result` 多表 join（**23 欄**，GAP-1/GAP-2）。
- pool 屬性 join **ob_pool_data**（共享池母體，I-EXP-LINEAGE-01）；進件日取 `ob_pool_data.appl_date`（GAP-3 / I-EXP-APLDATE-01）。
- xlsx 與 CSV **共用同一 server-side cursor row-producer**，皆 streaming（I-EXP-STREAM-01 / I-EXP-NOOFFSET-01）。
- 處長 scope filter 改 **SQL WHERE 注入**（I-EXP-SCOPE-01），不再 post-fetch in-memory 過濾。
- 日期格式集中於 `formatRow()`（I-EXP-FMT-01）；emphire join-miss fallback + WARNING 彙總（I-EXP-JOINMISS-01）。
- 稽核 `after_value` 補 `actorBusinessRole` / `scopedByCreator` / `exportedRowCount`（BR-F064-15）。

## 測試結果摘要

### SQLite / Unit（`f064-export-23col.spec.ts`，45 案全綠）

| 群組 | 對應 test spec 案例 | 狀態 |
|------|---------------------|------|
| STATIC | STATIC-001/002/003、REGRESSION-005/006、DET-002、APLDATE-002、LINEAGE-002、SCOPE-005、STREAM-003 | PASS |
| COLSEQ | COLSEQ-001(unit)/002/003(unit)/004 | PASS |
| REGRESSION | REGRESSION-001/002/003/004（DoD 紅線） | PASS |
| FMT | FMT-001~008 | PASS |
| CR | CR-001(unit)/002 | PASS |
| JOINMISS | JOINMISS-001~005、COLSRC-004 | PASS |
| OVERDUE | OVERDUE-001/002 | PASS |
| STREAM | STREAM-001/002 | PASS |
| STATUS | STATUS-001/002/003/004、AUTH-003 | PASS |
| AUDIT | AUDIT-001/002 | PASS |
| SCOPE | SCOPE-001(unit)/002(unit)/004(empty) | PASS |
| FILENAME | AC-1 檔名 | PASS |

### PG Integration（`f064-export-23col.pg.spec.ts`，10 案；需 Postgres，序列執行）

| 群組 | 對應 test spec 案例 | 狀態 |
|------|---------------------|------|
| LINEAGE | LINEAGE-001（匯出列數==result 列數、不掉列；不 seed ob_pool_data_list） | PASS |
| COLSRC | COLSRC-001/002/003/006（INNER JOIN ob_pool_data）、COLSEQ-003 端到端 | PASS |
| CR | CR-001/003（PG 真 join） | PASS |
| APLDATE | APLDATE-001（ob_pool_data.appl_date 非 run_result.appl_date） | PASS |
| DET | DET-001（同 run 兩次列序相同 + ORDER BY 升冪） | PASS |
| SCOPE | SCOPE-003（僅含轄區列）/004（無轄區→僅表頭 + 稽核 exportedRowCount=0） | PASS |
| COLSEQ | COLSEQ-001（xlsx 表頭 23 欄） | PASS |

### tsc gate

`cd apps/api && npx tsc --noEmit -p tsconfig.build.json` → **退出碼 0（乾淨）**。

### 回歸

- `assignment-run-report.service.spec.ts`（F063/F067，11 案）PASS — v1.1 8 欄匯出測試移除（已被新二檔取代）。
- `assignment-run-report.scope.spec.ts`（F063/F064/F067 scope，12 案）PASS — F064 scope 測試改驗 SQL WHERE 注入。
- 非 PG assignment 全模組（1078 案）PASS（唯一 `legacy-grep-regression.spec.ts` 在「全模組並行」下 starve 逾時，獨立執行 272ms 綠；與 F064 無關）。
- F101（24）/ F102（21）PG spec 各自序列重跑全綠（共用 `cdmp_test`，未受本次影響）。

### 已涵蓋於 PG 真庫但 test spec 標「手動/規模」者

| 案例 | 處置 |
|------|------|
| STREAM-004/005（50k/200k OOM NFR） | 未自動化（需大規模 seed）；cursor 批次 FETCH 500 已達 streaming 不全載 invariant。建議 staging 實測。 |
| CR-004（202606 約 2,073 筆 CR 規模） | 標手動驗收；以 202606 重跑匯出人工核對（見下方執行指引）。 |
| AUTH-001/002（401/403 RBAC） | 由既有 `assignment-run.controller.spec.ts` + `DirectorOrSectionChiefGuard` 覆蓋（controller 層，非 service 層 F064 範疇）。 |
| AUDIT-003（500 timeout 不寫 log） | timeout 機制沿用 v1.1 `raceTimeout`（EXPORT_FILE_EXPIRED），既有 `ExportOptions.timeoutMs` 可注入；service 於 timeout 拋例外時不執行 writeAudit。 |

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/services/assignment-run-report.service.ts` | modified | exportResult 重構：移除 loadAllPayloads 呼叫、改 buildExportQuery 多表 join + native cursor streaming；新增 EXPORT_HEADER_V2(23)/RawExportRow/FormattedExportRow/ExportQuerySpec、buildExportQuery/cursorRows/formatRow/formatAssignday/formatApplDate/buildExportXlsxStreaming(重構)/buildExportCsvStreaming/raceTimeout；writeAudit 改收完整 afterValue；注入 DataSource。**v2.1**：buildExportQuery pool join 改 INNER JOIN ob_pool_data o（by orgno+appl_no，I-EXP-LINEAGE-01），10 欄改 o.* |
| `apps/api/src/modules/assignment/services/__tests__/f064-export-23col.spec.ts` | new | F064 SQLite/Unit 測試（45 案，mock cursorRows）；含 LINEAGE-002 靜態 |
| `apps/api/src/modules/assignment/services/__tests__/f064-export-23col.pg.spec.ts` | new | F064 PG 真庫整合測試（10 案，需 Postgres）；**v2.1** seed ob_pool_data + LINEAGE-001 不掉列 |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-report.service.spec.ts` | modified | 移除 v1.1 8 欄 / snapshot-based F064 匯出測試（已被新二檔取代）；保留 F063/F067 |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-report.scope.spec.ts` | modified | F064 scope 測試改驗 SQL WHERE 注入（mock cursorRows）；beforeEach 補 vi.restoreAllMocks |
| `apps/web/src/pages/assignment/run-summary-page.tsx` | modified | 匯出注意事項文字：資料來源由 snapshot.payload 改 ob_monthly_run_result 多表 join（GAP-2） |
| `prototypes/33-run-summary.html` | modified | 同步匯出注意事項文字（與 v2.0 GAP-2 一致） |

## 架構決策與實作選擇（spec/AD 邊界內）

1. **native cursor 取代 TypeORM `stream()`（偏離 AD §2.2.2「方案 A 建議」，採方案 B）**
   - AD-E07-31 §2.2.2 建議方案 A（`queryRunner.stream()`），但其依賴 `pg-query-stream` 套件，本專案**未安裝**（`require.resolve` 不可達），且 tdd 不得擅引新依賴。
   - 故採 AD 已列之**方案 B**：PostgreSQL native `DECLARE … NO SCROLL CURSOR` + `FETCH 500`（在 transaction 內），逐批 push 至 objectMode `Readable`。仍滿足 I-EXP-STREAM-01（不全載）與 I-EXP-NOOFFSET-01（無 OFFSET）。
   - `cursorRows()` 設為 `protected`，使 SQLite 測試可 `vi.spyOn` mock（SQLite 無 native cursor，AD §9 已知）。

2. **scope WHERE 注入用 `getScopeEmplIds` + `emplid IN ($n…)`**
   - `SectionChiefScopeService` **無** `buildScopeWhereClause()`（GAP-TEST-001 確認）；改用既有 `getScopeEmplIds(userId)` 取轄區 emplid 集合，於 `buildExportQuery` 組 `AND r.emplid IN (...)`（位置參數）。
   - 無轄區（空集合）→ 注入 `AND 1 = 0`（仍回 200 + 僅表頭，BR-F064-14）。

3. **日期欄位本地時區 getter（PG `date` 漂移防護）**
   - `formatApplDate` Date 分支改用 `getFullYear/getMonth/getDate`（本地），因 node-postgres 將 `date` 欄解析為**本地午夜** Date；UTC+8 下 `getUTCDate()` 會把 `2025-03-01` 漂移為 `2025-02-28`（feedback_typeorm_between_timezone 同源教訓）。字串分支取前 10 碼。

4. **稽核 after_value 雙形狀**
   - F064 v2.0：`{ format, actorBusinessRole, scopedByCreator, exportedRowCount }`。
   - F067 compareRunsExport 沿用 `{ format, rowCount, compareRunId }`（不破壞既有）。`writeAudit` 改收完整 `afterValue` 物件，兩呼叫端各自組裝。

## 偏離 spec/AD 或發現的真問題

- **AD §2.2.2 方案 A 不可用（已記於「架構決策 1」）**：採方案 B native cursor，非真 bug，但 AD 假設 `pg-query-stream` 可用係與現況不符；建議架構師於 AD 補註「本專案採方案 B」。
- **AC-9 稽核 actor_id 為 uuid 欄位**：`assignment_audit_log.actor_id` 型別 `uuid`（NOT NULL）。PG 真庫下非 UUID 字串會使稽核 INSERT 失敗（writeAudit catch 吞掉 → 不寫 log）。實務 actorId 由 JWT 帶入皆為 UUID，無影響；PG 測試以合法 UUID actor 驗證。非 F064 引入之問題（既有 entity 設計）。
- 無其他 spec/AD 衝突；23 欄欄序、欄位來源、格式皆依 BR-F064-03 表逐欄落地。

## 「202606 重跑/匯出」執行驗證指引

> 前提：F102 已 commit（cr_id/cr_nm/is_cr/emplid/assignday 有值）；202606 月名單分派已 completed。

1. **取得 202606 completed run_id**：
   `GET /api/v1/assignment/runs?ym=202606` → 取 `status='completed'` 之 `runId`。
2. **匯出 CSV（部長視角，全量）**：
   `GET /api/v1/assignment/runs/{runId}/export?format=csv`（director JWT）。
3. **人工核對 23 欄**（對齊 `reference/202606 分派名單.xlsx` 工作表 1）：
   - 表頭恰 23 欄、欄序 = 分處/案號/指派日/名單代號/名單名稱/進件日/CR_ID/CR_NM/是否分配CR/TIER/部門代號/部門名稱/員編/姓名/職級/專案類別/專案名稱/逾期天數/客戶利率/STA_CODE/案件狀態/廠牌名稱/名單週期月數。
   - **不含** custo_no / cust_name / card_level / score。
   - 指派日為 `YYYYMMDD`（8 位數字字串）；進件日為 `YYYY/MM/DD`（斜線）。
   - CR 案件（`是否分配CR='Y'`）之 CR_ID/CR_NM 非空；約 2,073 筆（容許 ±10%）。
   - 逾期天數欄全空（legacy 恆 NULL，保留欄）。
   - 客戶利率取 `pro_rate`（非 loan_rate）。
4. **xlsx 同步核對**：`?format=xlsx`，以 Excel 開啟確認指派日/進件日不被誤判為數字序號（為文字）。
5. **處長視角過濾**：以 section_chief JWT 匯出，確認僅含轄區員編之資料列；稽核 log `scopedByCreator=true`。
6. **emphire join-miss**：若有 emplid 在 `ob_emphire` 查無，欄 12/14/15 空、欄 13 員編仍輸出；後端 log 一筆 WARNING（含 emplid 清單 + run_id）。
7. **稽核**：查 `assignment_audit_log`（action='EXPORT', entity_id=runId），`after_value` 含 `{ format, actorBusinessRole, scopedByCreator, exportedRowCount }`。

> 自動化 PG 測試本機驗證方式：
> `docker compose -f docker-compose.test.yml up -d postgres-test` →
> `cd apps/api && npx vitest run src/modules/assignment/services/__tests__/f064-export-23col.pg.spec.ts`（須序列，勿與其他 .pg.spec 並行）。
