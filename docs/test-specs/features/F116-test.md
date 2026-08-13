---
type: test-design-feature
feature_id: F116
feature_name: 快照詳情 — 樞紐分析頁籤 v1.1（職稱／新人標註／總計欄置前／工作天模式）
priority: P2
related_spec: /docs/specs/features/F116-snapshot-pivot-analysis.md
spec_version: "1.1"
related_architecture: /docs/specs/implementation-log/AD-E07-49-f116-v1.1-pivot-newcomer-workday.md
covers:
  - F116
  - US-182
source_stories: [US-182]
date: 2026-08-13
last_updated: 2026-08-13
---

# F116 v1.1：快照詳情 — 樞紐分析頁籤 UX 精修 — 測試設計

> ⚠️ **本輪範圍已由使用者明確簡化（2026-08-13 team-lead 指示）**：test-generator **僅撰寫
> vitest（後端 + 前端 component test）**。**不**建立 Playwright / E2E fidelity 測試、**不**設定
> Stryker mutation 門檻、**不**設定 dependency-cruiser / 複雜度 / coverage gate script、**不**呼叫
> `ring-setup` skill。本文件因此僅含「一、後端 vitest」「二、前端 vitest」兩節，省略束縛環第
> 1/3/4 項（Playwright 驗收/Mutation/Metric）——此為使用者指示之刻意簡化，非缺口，不記入
> `risks-and-gaps.md` 之未覆蓋項目。
>
> v1.0（F116 首版，2026-07-14 上線）之既有測試檔（`assignment-run-report-pivot.spec.ts` 後端 3
> 案例、`snapshot-pivot-view.test.tsx` 前端 5 案例）**維持不變、不弱化**；本文件僅描述 v1.1（US-182）
> 新增之場景，兩份既有檔案作為 AD-E07-49 §9 R-3 要求之「無重複 emp_id 情境」回歸保護，已於本輪
> 重新執行確認**維持全綠**（詳見「紅燈驗證」節）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F116 spec v1.1](../../specs/features/F116-snapshot-pivot-analysis.md) §4 AC-6~AC-11 / §5.1.1 / §6 BR-5~BR-17 / §10 技術約束 + [AD-E07-49](../../specs/implementation-log/AD-E07-49-f116-v1.1-pivot-newcomer-workday.md) §3 裁定彙總 / §4 詳細設計（`loadWorkingDays`/derived table/`isNewcomerAtWorkym` 之具體程式碼樣板）/ §7 不變式 + `prototypes/35-snapshot-detail.html` `#panel-pivot`（第 4 頁籤） |
| QA / Tester | 本文件 + F116 spec §4 AC-6~AC-11 之「驗證用具體樣本」表 |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Unit（純函式 `isNewcomerAtWorkym`）+ Integration（真實 `AssignmentRunReportService.getPivot`，in-memory SQLite `better-sqlite3`，不 mock repo）+ 前端 Component（RTL，mock `@/api/assignment-run`） |
| 測試檔案（後端） | `apps/api/src/modules/assignment/services/__tests__/assignment-run-report-pivot-newcomer-workday.spec.ts`（新建，沿用同目錄既有 `assignment-run-report-pivot.spec.ts` 之 `buildModule()`/seed 慣例，擴充 `ObCalendar` entity） |
| 測試檔案（前端） | `apps/web/src/pages/assignment/_components/__tests__/snapshot-pivot-view-newcomer-workday.test.tsx`（新建，沿用同目錄既有 `snapshot-pivot-view.test.tsx` 之 `vi.mock('@/api/assignment-run')` 慣例） |
| 命名慣例 | 檔名沿用 AD-E07-49 檔名字尾 `f116-v1.1-pivot-newcomer-workday`，不採 `-v1_1`/`-v11` 版本號後綴（本 repo 既有慣例為「關注點命名」而非「版本號命名」，見 `f118-copy-duplicate-check.spec.ts` 先例） |

**盲測原則聲明**：本輪斷言內容僅依 F116 v1.1 spec + AD-E07-49 之契約與規則撰寫，**未讀取**
`assignment-run-report.service.ts` / `snapshot-pivot-view.tsx` 生產碼決定斷言內容。僅讀取
`assignment-run-report-pivot.spec.ts`（v1.0）/ `snapshot-pivot-view.test.tsx`（v1.0）/
`assignment-run-pipeline.service.spec.ts` / `stage0-estimate.service.spec.ts`（既有測試檔，非生產碼）
以取得 `buildModule()`/`seed()` 慣例、`ObCalendar` fixture 寫法（`calendar_date`/`rest_flg` 欄位名）；
`ob_emphire` 欄位名（`jfun_nm`/`title_name`/`hire_date`/`resign_date`）取自 `docs/specs/data-model.md`
§ob_emphire（規格文件，非生產碼）。`isNewcomerAtWorkym` 之簽章與 `getPivot` 之 SQL 設計取自
AD-E07-49 §4（架構文件明文交付之介面契約，依 blindness-practical-exceptions 記憶為合法輸入）。

---

## 本文件新定義之 test-id（前端；prototype 僅以原生 `id`/`class` 標註處，由本文件裁定）

沿用既有 v1.0 命名風格（`pivot-dept-{deptName}`、`pivot-mode-pct` 等）：

| test-id | 說明 |
|---|---|
| `pivot-emp-{emplid}` | 員編列容器（平行於既有 `pivot-dept-{deptName}`） |
| `pivot-total-row` | 表格最下方「總計」列容器 |
| `pivot-cell-total` | 任一列（部門/員編/總計列）內「總計」欄儲存格；需以 `within(row)` 限定範圍查詢（同一 test-id 於不同列重複出現，屬設計） |
| `pivot-cell-list-{listNo}` | 任一列內特定名單代號欄儲存格；同上，需 `within(row)` 限定範圍 |
| `pivot-header-label` / `pivot-header-total` / `pivot-header-list-{listNo}` | 表頭儲存格，DOM 出現順序即代表視覺欄序（供 BR-11 斷言） |
| `pivot-dim-full` / `pivot-dim-workday` | 整月／工作天切換按鈕（平行於既有 `pivot-mode-count`/`pivot-mode-pct`） |
| `pivot-workday-info` / `pivot-workday-warning` | 工作天模式之說明／缺工作日資料提示區塊 |
| `pivot-newcomer-badge` | 員編列內「新人」標註（僅 `isNewcomer=true` 時渲染，需 `within(row)` 限定範圍） |

---

## 一、後端 Unit / Integration 測試

> 檔案：`assignment-run-report-pivot-newcomer-workday.spec.ts`。共 **21 個場景**。

### 1.1 `isNewcomerAtWorkym` 純函式（BR-6/BR-7/BR-8，T-2：TS 端 date-only 計算）

不依賴 DB，直接匯入 AD-E07-49 §4.3 交付之純函式簽章 `isNewcomerAtWorkym(hireDate, projectWorkym)`。

| # | 場景 | 依據 |
|---|---|---|
| TS-F116-001（it.each ×4） | spec §4 AC-7「驗證用具體樣本」表：`2026-03-31`→false／`2026-04-01`（恰滿 3 個月）→false／`2026-04-02`→true／`2026-07-15`→true | AC-7、BR-7 |
| TS-F116-002 | `hire_date=null` → false（不臆測資歷） | BR-8 |
| TS-F116-003 | 接受 `Date` 物件與 `YYYY-MM-DD` 字串兩種輸入，同一天結果一致 | T-2 |
| TS-F116-004（★核心） | 判定結果不隨系統當日時間漂移（`vi.setSystemTime` 兩個相差 4 年的「現在」，同一 `hireDate`/`projectWorkym` 輸入結果相同） | AC-7 末句 |
| TS-F116-005 | 跨年份曆月位移（`project_workym=202601` → 門檻 `2025-10-01`） | BR-7 |

### 1.2 `getPivot` 整合測試（真實 SQLite）

| # | 場景 | 依據 |
|---|---|---|
| TS-F116-010（★核心） | `jfunNm` 來源為 `jfun_nm`，同一員編 `title_name` 刻意設為不同值，斷言不得取到 `title_name` | BR-5、AC-6 |
| TS-F116-011 | `jfun_nm=NULL` → `jfunNm` 契約值為 `null` | AC-8、BR-5 |
| TS-F116-012 | `jfun_nm=''`（空字串）→ `jfunNm` 契約值為 `null` | BR-5 |
| TS-F116-013 | `hire_date` 恰等於門檻日 → `isNewcomer=false`（嚴格大於） | BR-7 |
| TS-F116-014 | `hire_date` 門檻日+1天 → `isNewcomer=true` | BR-7 |
| TS-F116-015 | `hire_date=NULL` → `isNewcomer=false` | BR-8 |
| TS-F116-016（★核心 / I-F116-NO-ACTIVE-FILTER-01） | 員編 `resign_date` 有值（非哨兵、明確已離職）但該 run 有分派筆數 → 仍完整顯示 `empNm`/`jfunNm`/`isNewcomer`/計數，若實作誤加在職過濾該員編會從結果消失 | BR-9、T-6 |
| TS-F116-017 | 「(空白)」分組（無 `ob_emphire` 對應）→ `jfunNm=null`、`isNewcomer=false` | BR-10 |
| TS-F116-020（★核心 / T-3 邊界） | `workingDays` 僅計入 `project_workym` 當月 `rest_flg=0` 之列；混合 202606/07/08 邊界日（06-30/07-01/07-02/07-03/07-31/08-01）驗證月界不漏含首尾日、不誤含跨月日 | BR-12、T-3 |
| TS-F116-021 | `projectWorkym` 回傳值取自 `run.project_workym` | §5.1.1 |
| TS-F116-022（★核心） | `ob_calendar` 該月無資料 → `workingDays=0`（型別 `number`，非 `null`/`undefined`） | AC-11、BR-15 |
| TS-F116-023 | `section_chief` 無轄區 → `depts=[]`、`grandTotal=0`，但 `workingDays`/`projectWorkym` 仍為真實值（不受 scope 影響） | AC-4 v1.1 補充、spec §11 邊界矩陣 |
| TS-F116-018（★核心 / I-F116-EMPHIRE-DEDUP-01） | `ob_emphire` 同 `emp_id` 重複列（獨立 `:memory:` DB，raw SQL 重建無 PK 約束之表以模擬 ETL 髒資料）→ 計數不得因 join fan-out 被重複計入、輸出仍收斂為單一節點 | AD-E07-49 §4.2、I-F116-EMPHIRE-DEDUP-01 |

**TS-F116-018 之技術筆記**：SQLite `synchronize:true` 建的 `ob_emphire` 表對 `emp_id` 有真實
PK/UNIQUE 約束，會擋下重複插入；為重現「ETL full-replace 同步表繞過 PK 產生同一 `emp_id` 兩列」
情境，本場景使用**獨立**一份 `:memory:` DB（不與其他場景共用 `env`），以 `DataSource.query()` 執行
`DROP TABLE` + 無 PK 之 `CREATE TABLE`，再以 raw SQL `INSERT`（非 `repo.save()`/`repo.insert()`，兩者
皆會因整個 `ObEmphire` entity 欄位集合與精簡表不符而報 `no such column`）寫入重複列。此 raw DDL
手法沿用既有 `c360.service.spec.ts` 已驗證之慣例。**實測結果**：對現行（v1.0）未去重之查詢執行本
情境，`grandTotal` 回傳 `6`（真實應為 `3`）——**empirically 證實 AD-E07-49 §2 事實 4 所述之 join
fan-out 缺陷確實存在**，是本輪紅燈驗證中訊號最強的一個案例。

---

## 二、前端 Component 測試（RTL，`SnapshotPivotView`）

> 檔案：`snapshot-pivot-view-newcomer-workday.test.tsx`。共 **16 個場景**。

| # | 場景 | 依據 |
|---|---|---|
| TS-F116-030（★核心） | 職稱顯示於員編列，呈現順序為「員編 → 姓名 → 職稱」（分隔符號本身不斷言，authority=prototype） | AC-6 |
| TS-F116-031 | `isNewcomer=true` → 員編列顯示 `pivot-newcomer-badge`，內文含「新人」 | AC-7 |
| TS-F116-032 | `isNewcomer=false` → 不顯示 `pivot-newcomer-badge` | AC-7 |
| TS-F116-033 | `jfunNm=null` → 不顯示職稱文字，但員編／姓名整列仍正常顯示（不得整列消失） | AC-8 |
| TS-F116-034 | 「(空白)」分組員編列不顯示職稱與新人標註，計數仍正常顯示 | AC-8、BR-10 |
| TS-F116-035（★核心） | 表頭欄序為「列標籤 → 總計 → 名單代號（升冪）」（`pivot-header-*` DOM 出現順序） | AC-9、BR-11 |
| TS-F116-036 | 「總計」列（橫向）不受總計欄（縱向）移動影響，展開全部部門後仍維持在表格最下方 | AC-9、BR-11 |
| TS-F116-037 | 切至「工作天」→ 每格顯示 `ceil(整月計數 ÷ workingDays)` | AC-10、BR-13 |
| TS-F116-038（★核心 / I-F116-CEIL-PER-CELL-01） | 逐格獨立 ceil：專用 fixture（workingDays=4，總計列 grandTotal=6→ceil=2，但 grandByList.OB1=1→ceil=1 + OB2=5→ceil=2 之和=3 ≠ 2）驗證總計欄不等於名單代號欄相加，防止實作偷改為「先加總再 ceil」 | BR-14 |
| TS-F116-039 | 工作天模式下「佔比」切換按鈕 `disabled` | BR-16 |
| TS-F116-040 | 由「整月-佔比」切至「工作天」→ 值自動回落計數（不殘留 `%`），佔比按鈕 disabled | AC-10、BR-16 |
| TS-F116-041 | 由「工作天」切回「整月」→ 佔比切換按鈕恢復 enabled | AC-10 |
| TS-F116-042（★核心） | `workingDays=0` → 全表數值格顯示 `-`；不得出現 `NaN`/`Infinity`；顯示 `pivot-workday-warning`，不顯示 `pivot-workday-info` | AC-11、BR-15 |
| TS-F116-043 | `workingDays=0` 時切回「整月」→ 計數正常顯示，提示訊息消失 | AC-11 |
| TS-F116-044 | 展開第二部門後切換整月/工作天，展開狀態維持不變 | AC-3 補充 |
| TS-F116-045 | 切換整月/工作天與計數/佔比皆不寫入 `localStorage`/`sessionStorage`，亦不改變 URL `search` | I-F116-CLIENT-STATE-01、AD-E07-49 §3 A-5 |

**⚠️ prototype 內「原型示範開關」不可測**：`prototypes/35-snapshot-detail.html:582-589` 之
`setPivotDemoWorkingDays()` 為原型專用示範（切換 `ob_calendar` 有／無資料以預覽降級呈現），標註
「此為原型示範開關，產品不提供」。本文件與測試檔**未**為其撰寫任何斷言；`workingDays=0` 情境一律
透過 mock API 回應（`pivotZeroWorkdayFixture`）驅動。

---

## 紅燈驗證（實際執行結果，2026-08-13）

- **後端**：`npx vitest run assignment-run-report-pivot-newcomer-workday.spec.ts` → **21/21 紅**。
  8 個純函式案例因 `isNewcomerAtWorkym is not a function`（未匯出）；12 個整合案例因回應缺少
  `jfunNm`/`isNewcomer`/`workingDays`/`projectWorkym` 欄位（`undefined`）；TS-F116-018 因現行未去重
  查詢實際回傳 `grandTotal=6`（應為 `3`）而紅，訊號最強（見上）。
- **後端 v1.0 回歸**：`assignment-run-report-pivot.spec.ts` 重新執行 → **3/3 綠**，無回歸。
- **前端**：`npx vitest run snapshot-pivot-view-newcomer-workday.test.tsx` → **16/16 紅**，均因新
  test-id（`pivot-emp-*`/`pivot-dim-*`/`pivot-total-row`/`pivot-header-*`/`pivot-newcomer-badge`/
  `pivot-workday-*`）尚未存在於元件輸出而找不到元素，逐一以 `-t` 隔離重跑確認錯誤訊息均為
  `Unable to find an element by: [data-testid="..."]`，非測試本身之型別/引用錯誤。
- **前端 v1.0 回歸**：`snapshot-pivot-view.test.tsx` 重新執行 → **5/5 綠**，無回歸（僅既有、與本輪
  無關之 React `key` prop 警告，非本輪引入）。
- **型別 gate**：`tsc --noEmit`（後端 `tsconfig.json`、前端 `tsconfig.json`）分別對兩份新檔過濾輸出，
  確認全部型別錯誤皆為預期之「新欄位/新匯出尚不存在」（`TS2305`/`TS2339`/`TS2353`），無測試檔自身
  之型別錯誤或誤用。

---

## 對應總表（AC/BR/不變式 → 測試場景）

| AC/BR/不變式 | 測試場景 |
|---|---|
| AC-6 / BR-5 | TS-F116-010/011/012（後端）、TS-F116-030（前端） |
| AC-7 / BR-6/7/8 | TS-F116-001~005（後端純函式）、TS-F116-013/014/015（後端整合）、TS-F116-031/032（前端） |
| AC-8 / BR-8~10 | TS-F116-011/012/015/016/017（後端）、TS-F116-033/034（前端） |
| AC-9 / BR-11 | TS-F116-035/036（前端；spec 明載 API 契約不變，故不在後端測） |
| AC-10 / BR-12~14/16 | TS-F116-020/021（後端 workingDays 計算）、TS-F116-037/038/039/040/041（前端） |
| AC-11 / BR-15 | TS-F116-022（後端）、TS-F116-042/043（前端） |
| AC-3 補充 | TS-F116-044（前端） |
| AC-4 v1.1 補充 | TS-F116-023（後端） |
| I-F116-CALENDAR-SHARE-01 | TS-F116-020/021（間接，`workingDays` 數值正確性即證明複用 `computeWorkingDayRatios` 之 weekday 判準，未另立第二套邏輯） |
| I-F116-EMPHIRE-DEDUP-01 | TS-F116-018（★核心，實測揭露現行真實缺陷） |
| I-F116-CEIL-PER-CELL-01 | TS-F116-038（★核心） |
| I-F116-NO-ACTIVE-FILTER-01 | TS-F116-016（★核心） |
| I-F116-CLIENT-STATE-01 | TS-F116-045 |
| BR-9 / T-6 | TS-F116-016 |
| T-3 | TS-F116-020（月界字串邊界陷阱） |
| T-4 | TS-F116-018 |

---

## 相關文件

- Feature spec：[F116-snapshot-pivot-analysis.md](../../specs/features/F116-snapshot-pivot-analysis.md) v1.1
- Architecture：[AD-E07-49](../../specs/implementation-log/AD-E07-49-f116-v1.1-pivot-newcomer-workday.md)
- Story：[US-182](../../stories/epics/E07-app-customer-list-assignment/US-182-M05-pivot-title-newcomer-workday-mode.md)
- Prototype：`prototypes/35-snapshot-detail.html` `#panel-pivot`
- 風險與缺口：[risks-and-gaps.md](../risks-and-gaps.md)「F116 v1.1」節
