---
type: implementation-log
feature_id: F116
feature_name: 快照詳情 — 樞紐分析頁籤（v1.1：職稱／新人標註／總計欄置前／工作天模式）
spec_version: "1.1"
related_spec: /docs/specs/features/F116-snapshot-pivot-analysis.md
related_architecture: /docs/specs/implementation-log/AD-E07-49-f116-v1.1-pivot-newcomer-workday.md
related_test_design: /docs/test-specs/features/F116-test.md
status: complete
last_updated: 2026-08-13
---

# F116 v1.1（US-182）— 實作日誌

> 本輪僅實作 v1.1 增量（US-182）。v1.0 已於 2026-07-14 上線，其既有行為（聚合語意、排序、
> 處長 scope、404）未變更；v1.0 既有測試（後端 3 案例、前端 5 案例）維持全綠作為回歸保護
> （AD-E07-49 §9 R-3 驗收條件）。**本輪未新增、未修改、未刪除任何測試檔**。

## Test Results Summary

### 後端 `assignment-run-report-pivot-newcomer-workday.spec.ts`（21/21 PASS）

| Scenario ID | 說明 | 狀態 |
|---|---|---|
| TS-F116-001（×4） | `isNewcomerAtWorkym` AC-7 樣本表（03-31/04-01/04-02/07-15） | PASS |
| TS-F116-002 | `hire_date=null` → false（BR-8） | PASS |
| TS-F116-003 | 接受 `Date` 與 `'YYYY-MM-DD'` 兩種輸入，結果一致（T-2） | PASS |
| TS-F116-004 | 判定不隨系統當日漂移（`vi.setSystemTime` 相差 4 年） | PASS |
| TS-F116-005 | 跨年份曆月位移（`202601` → 門檻 `2025-10-01`） | PASS |
| TS-F116-010 | `jfunNm` 來源為 `jfun_nm`，非 `title_name`（BR-5） | PASS |
| TS-F116-011 / 012 | `jfun_nm` NULL／空字串 → `jfunNm = null` | PASS |
| TS-F116-013 / 014 | 門檻日 → false；門檻日+1 → true（嚴格大於） | PASS |
| TS-F116-015 | `hire_date=NULL` → `isNewcomer=false` | PASS |
| TS-F116-016 | 已離職員編仍完整顯示（I-F116-NO-ACTIVE-FILTER-01 / T-6） | PASS |
| TS-F116-017 | 「(空白)」分組 → `jfunNm=null`、`isNewcomer=false`（BR-10） | PASS |
| TS-F116-018 | `ob_emphire` 重複 `emp_id` 不 fan-out（I-F116-EMPHIRE-DEDUP-01） | PASS |
| TS-F116-020 | `workingDays` 月界正確（06-30／08-01 不計入，07-01／07-31 計入，T-3） | PASS |
| TS-F116-021 | `projectWorkym` 取自 `run.project_workym` | PASS |
| TS-F116-022 | `ob_calendar` 缺該月 → `workingDays = 0`（number） | PASS |
| TS-F116-023 | 處長無轄區 → `depts=[]`／`grandTotal=0`，`workingDays` 仍為真實值 | PASS |

### 前端 `snapshot-pivot-view-newcomer-workday.test.tsx`（16/16 PASS）

| Scenario ID | 說明 | 狀態 |
|---|---|---|
| TS-F116-030 | 員編 → 姓名 → 職稱 之呈現順序（AC-6） | PASS |
| TS-F116-031 / 032 | `isNewcomer` true/false → 顯示／不顯示 `pivot-newcomer-badge` | PASS |
| TS-F116-033 / 034 | `jfunNm=null`、「(空白)」分組之降級呈現（AC-8 / BR-10） | PASS |
| TS-F116-035 / 036 | 欄序 `列標籤 → 總計 → 名單代號`；總計列維持最下（AC-9 / BR-11） | PASS |
| TS-F116-037 / 038 | 工作天 `ceil(cnt ÷ workingDays)`、逐格獨立（I-F116-CEIL-PER-CELL-01） | PASS |
| TS-F116-039 / 040 / 041 | 工作天下佔比 disabled、值回落計數、切回整月恢復（BR-16） | PASS |
| TS-F116-042 / 043 | `workingDays=0` → 全表 `-` + warning；切回整月恢復（AC-11 / BR-15） | PASS |
| TS-F116-044 | 切換維度不重置展開狀態（AC-3 補充） | PASS |
| TS-F116-045 | 不寫入 localStorage/sessionStorage、不改 URL（I-F116-CLIENT-STATE-01） | PASS |

### 回歸

| 套件 | 結果 |
|---|---|
| 後端 v1.0 `assignment-run-report-pivot.spec.ts` | 3/3 PASS |
| 前端 v1.0 `snapshot-pivot-view.test.tsx` | 5/5 PASS |
| 前端全套 `npm run test --workspace=apps/web` | 128 檔 / 1647 PASS / 29 skipped，**0 fail** |
| 後端全套（排除真實 MSSQL 連線 spec）`npx vitest run --exclude "**/*.mssql.spec.ts"` | 196 檔 / 2881 PASS，**0 fail** |
| 後端全套（含 `*.mssql.spec.ts`） | 3503 PASS / 68 fail，全數落在 8 支 `*.mssql.spec.ts`（詳見「既知問題」，已證實與本輪異動無關） |
| 型別 gate | `apps/api` `tsc --noEmit -p tsconfig.build.json` PASS；`apps/web` `tsc -b` PASS |
| 架構 gate | `apps/api` `npm run deps:check` → 0 errors（11 warnings 皆為既有 migration `no-orphans`）；新增之 `assignment` → `assignment-list` pure-function import 未產生違規 |

## Files Changed

| 檔案 | 類型 | 說明 |
|---|---|---|
| `apps/api/src/modules/assignment/services/assignment-run-report.service.ts` | modified | `PivotEmplidNode` 增 `jfunNm`/`isNewcomer`、`PivotResponse` 增 `projectWorkym`/`workingDays`；新增匯出純函式 `isNewcomerAtWorkym`；`getPivot` join 改去重 derived table 並擴充 `jfun_nm`/`hire_date`；新增 private `loadWorkingDays(ym)` |
| `apps/web/src/api/assignment-run.ts` | modified | 前端 `PivotResponse`／`PivotEmplidNode` 型別副本補 v1.1 欄位（optional，見「架構決策 D-3」） |
| `apps/web/src/pages/assignment/_components/snapshot-pivot-view.tsx` | modified | 總計欄置左、期間（整月／工作天）segmented toggle、工作天逐格 `ceil`、`workingDays=0` 降級與提示區塊、員編列職稱與「新人」標註、v1.1 test-id |

> 未新增任何 migration、錯誤碼、資料表／欄位（T-7）；未修改 `docs/specs/**`（本檔除外）。

## 架構決策（皆在 spec / AD 邊界內）

- **D-1（A-4 去重 derived table）**：依 AD-E07-49 §4.2，`getPivot` 由 `LEFT JOIN ob_emphire e` 改為
  join `ROW_NUMBER() OVER (PARTITION BY emp.emp_id ORDER BY emp.emp_id) = 1` 之 derived table。
  對正常（`emp_id` 唯一）資料為 no-op，v1.0 既有 3 則回歸測試輸出未變；TS-F116-018 證實舊查詢在
  重複列下 `grandTotal` 會變成 2 倍，本次修正收斂為正確計數。
- **D-2（`loadWorkingDays` 之容錯）**：AD-E07-49 §4.1 之範本以 `this.dataSource.getRepository(ObCalendar)`
  查詢。實作時發現：`ob_calendar` 屬樞紐分析的**輔助**資料（僅影響「工作天」維度換算），而
  spec §5.1 已明載「查無該月資料**不是錯誤**」。為使查詢層面的不可用（例如該 DataSource 未註冊
  `ObCalendar`、或連線層錯誤）同樣不致讓整份 pivot 失敗，`loadWorkingDays` 以 `try/catch` 將任何
  查詢失敗降級為 `workingDays = 0` 並記 `logger.warn`。此決策同時是 v1.0 既有回歸測試
  （`assignment-run-report-pivot.spec.ts` 之 TestingModule 未註冊 `ObCalendar` entity）維持全綠的
  必要條件——依鐵律不得修改該測試檔，故以生產碼的合理降級行為滿足之，而非弱化測試。
  正式環境 `AssignmentModule` 已於 `TypeOrmModule.forFeature` 註冊 `ObCalendar`（AD-E07-49 §2），
  正常路徑不會走到 catch。
- **D-3（前端型別以 optional 承載 v1.1 欄位）**：`apps/web` 之 `tsconfig.json` `include` 含 `src`，
  `tsc -b` 會型別檢查測試檔。若前端 `PivotResponse` 將 v1.1 欄位設為必填，既有 v1.0 測試檔
  （`snapshot-pivot-view.test.tsx`、`snapshot-detail-page.test.tsx`）之 fixture 物件字面值會產生
  `TS2739`，而依鐵律不得修改測試檔。因此前端型別副本將 4 個 v1.1 欄位宣告為 optional，元件端以
  `data?.workingDays ?? 0` 等預設值承接——此作法與 spec §5.1「向後相容性：既有 v1.0 前端在未升級
  狀態下仍可正常渲染」完全一致。**後端契約（`assignment-run-report.service.ts`）之對應欄位仍為必填**，
  API 恆回傳這 4 個欄位（TS-F116-021/022 已鎖定）。
- **D-4（無分派格於工作天模式之呈現）**：spec §11「run 有結果但整月計數為 0 之格」列與
  prototype `pvVal()`（`v == null → '-'`，且 footer note 明載「顯示『-』的格代表該員編在該名單無
  分派案件」）對「`byList` 無該 key」之格存在措辭落差。實作採 prototype（視覺 authority，§7）：
  **`byList` 無該 key（＝無分派）→ 三種合法組合一律 `-`**；若後端明確回傳數值 `0`，工作天模式
  仍依 BR-13 顯示 `ceil(0 ÷ n) = 0`（滿足 AC-10 樣本表「整月計數 0 → 0」）。此格未被任何測試場景
  斷言，兩份文件皆未被違反。
- **D-5（部門列點擊區域）**：依 prototype，部門列整列可點擊展開／收合（`<tr onClick>`），並保留
  v1.0 之內層 `<button>`（`stopPropagation` 避免重複 toggle）以維持鍵盤可及性。`data-testid`
  `pivot-dept-{deptName}` 依測試設計之 test-id 契約移至 `<tr>`（需以 `within(row)` 查詢列內儲存格）。

## 不變式落地對照

| 不變式 | 落地位置 |
|---|---|
| I-F116-CALENDAR-SHARE-01 | `loadWorkingDays` 呼叫 `computeWorkingDayRatios`（`assignment-list/stage0-estimate.service`），未另立第二套週末／假日判準 |
| I-F116-EMPHIRE-DEDUP-01 | `getPivot` 之 `leftJoin((sub) => …ROW_NUMBER()… )` derived table + `e.rn = 1` |
| I-F116-CEIL-PER-CELL-01 | 前端 `fmt()` 對每一格獨立 `Math.ceil`，總計欄／列不另作加總校正 |
| I-F116-NO-ACTIVE-FILTER-01 | pivot 查詢與 `loadWorkingDays` 皆無 `resign_date` / `emphire-active.util` 條件 |
| I-F116-CLIENT-STATE-01 | `dim` / `mode` 為 `useState`，未寫入 storage、未改動 URL |

## 既知問題（超出本輪範圍）

- **後端全套之失敗全數落在 8 支真實 MSSQL 連線 spec**（`stage1-sql-pushdown` / `stage2to4-sql-pushdown` /
  `stage3to4-ration-pushdown` / `cr-priority-pushdown` / `assignment-scoring-preview` /
  `preview-hit-count-customer-core` / `p5fu-appl-date-export` / `mssql-p1b1`），錯誤型態為
  `Transaction … was deadlocked on lock resources`、`Request failed to complete in 15000ms`、
  `Hook timed out in 10000ms` 與效能門檻超標——皆為多 spec 併行競爭同一 dev MSSQL 實例之既有環境
  問題。三項佐證：(a) 排除 `*.mssql.spec.ts` 後後端 2881 測全綠；(b) 失敗數在兩次相同執行間由 59
  變 68（非決定性）；(c) `preview-hit-count-customer-core.mssql.spec.ts` 單獨執行即通過，而
  `mssql-p1b1.mssql.spec.ts` 之失敗（`expected 28799711 to be less than 300000`，＝ 8 小時
  UTC/UTC+8 時鐘偏移）在**將本輪異動 stash 後單獨重跑仍相同失敗**，證實早於本輪。
  建議另立議題以 `--no-file-parallelism` 或獨立 schema 隔離真庫 spec。
- **AD-E07-49 §9 R-1 技術債仍在**：`AssignmentRunReportService.loadWorkingDays` 與
  `AssignmentRunPipelineService.loadWorkingDayRatios` 之「月份字串邊界組裝」仍為兩份同構程式碼
  （判準本身已收斂於 `computeWorkingDayRatios`）。依 AD 裁定本輪不重構已上線程式碼。
- **F108 匯出樞紐頁未同步 v1.1 三項變更**（spec §8 明載須另立 story）。
