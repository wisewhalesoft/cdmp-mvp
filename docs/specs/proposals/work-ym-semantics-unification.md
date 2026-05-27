# 設計提案：客戶名單分派「作業月」語意統一

> 狀態：**已拍板，進 /tdd 流程**
> 日期：2026-05-27
> 範圍：統一語意 + 對齊 ground-truth SP（P1+P2+P3 合併一次到位）
> 相關：F077（month-switch）、F091/F092（Stage 1）、F090（OBPOOLDATA_LIST ETL）、AD-E07

## 0. 已拍板決策（2026-05-27）

1. **R3 去重視窗**：維持近似（**不**建 OBASSIGNSET 等價 ETL）；但上界語意正名為「**基於作業月的上月底**」（`workdt − 1 日`，`workdt = parseWorkdt(target_work_ym)`）。一旦 `workdt` 餵目標月，`computeDedupWindow` 既有 `MIN(MAX(assignday), workdt−1)` 結構即自動成立，**毋須改 `computeDedupWindow` 本身**，只要 run 傳入目標月。`MAX(assignday)` 封頂維持近似。
2. **R2 歷史資料**：**forward-only，不回填**。既有 run 的 `project_workym`（執行月語意）保留現狀，文件註記。
3. **分期**：**P1+P2+P3 合併一次到位**。
4. **流程**：拆新 feature 編號（≈ F097）+ architecture AD，正式進 **/tdd 多 agent 流程**。

---

## 1. 問題陳述

「當月」一詞在分派模組同時被當成兩種意思：

1. **執行當下的日曆月**（`new Date()` 的 YYYYMM）
2. **名單要派去作業的那個月**（通常是下個月）

5 月準備 6 月名單時，這兩者不一致（5 月 vs 6 月），目前系統各處對「當月」各自解讀，造成：

- **現存 live 不一致**：`/assignment/estimate`、`/assignment/ready-summary`、`/assignment/list-definitions` 讓使用者自由選月（送 `ym` 給後端）；但 `/assignment/run`（觸發）**完全無視選定月**，前端 `trigger-run-page.tsx:79` 寫死 `currentWorkYm()=new Date()`，後端 `POST /assignment/runs` 也忽略 body、自行 `computeCurrentWorkYm()`。→ 今天（5/27）在 estimate 選 6 月預覽，按下 run 卻會跑 5 月。
- **偏離 ground-truth**：見 §2。

---

## 2. Ground-truth 證據：`PROJECT_WORKYM` 本來就是「目標月（未來月）」

`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（L24–34，UTF-16LE）：

```sql
SELECT @WORKDT = PROJECT_WORKYM + '01', ...
FROM OBMLISTDF WHERE LIST_NO = @LIST_NO

IF ISNULL(@IS_ASSIGNED,'N')='Y' OR @WORKDT < getdate()
BEGIN
    RETURN   -- 跳過，不撈這張名單
END
```

`@WORKDT = PROJECT_WORKYM 的 1 號`，guard 要求 **`@WORKDT >= getdate()`** 才處理。
→ 5 月中執行時 `PROJECT_WORKYM=202505`（WORKDT=5/1 < 今天）被跳過；只有 `PROJECT_WORKYM=202506`（WORKDT=6/1 >= 今天）才被處理。

**結論：原系統 `PROJECT_WORKYM` = 名單作業的目標月（通常下個月），不是執行月。**

我們現在的偏差：

| 項目 | ground-truth SP | 現況 |
|---|---|---|
| `PROJECT_WORKYM` 語意 | 目標作業月（未來月） | `computeCurrentWorkYm()` = `new Date()` 執行月 |
| `@WORKDT >= getdate()` 未來月 guard | 有 | **未移植** |
| Stage 1 去重視窗 `[WORKDT-3月, WORKDT-1日]` | 以目標月為基準 | 以執行月為基準 → 整段錯一個月 |

---

## 3. 現況盤點

### 3.1 前端各頁月份來源

| 路由 | MonthPicker | 月份來源 | 預設 |
|---|---|---|---|
| list-definitions | ✅ | 使用者選 `ym` → 後端 | `new Date()`（後端回 currentWorkYm） |
| ready-summary | ✅ | 使用者選 `ym` → 後端 | `new Date()` |
| estimate (stage0) | ✅ | 使用者選 `ym` → 後端 | `new Date()` |
| run-history | ✅ | 使用者選 `ym` → 後端 | `new Date()` |
| **run（觸發）** | ❌ | **前端寫死 `new Date()`；POST 後端再算一次** | 無 |
| run-progress / run-summary / snapshots / compare | ❌ | URL `runId`（讀 run 記錄內的 `project_workym`） | — |

- 前端**無全域共享月份狀態**（無 Context/Zustand/Redux），各頁 local `useState` 各算各的 `new Date()`。
- 後端 `computeCurrentWorkYm()` **重複 3 份**（assignment-list / stage0-estimate / assignment-run controller），另 system.service 一份，皆吃 `OVERRIDE_CURRENT_WORK_YM`，但前端對 OVERRIDE 完全無感。

### 3.2 F077 既有模型（不要破壞）

`assignment-list.controller.ts`：
- `current_work_ym` = `new Date()` 的 YYYYMM（每月 1 號 0:00 切換）。
- `isHistorical = ym < currentWorkYm` → 歷史月**唯讀**（`LIST_HISTORICAL_READONLY`）。
- `isFuture = ym > currentWorkYm` → 未來月可編輯。
- `ym` 限 `current_work_ym ± 12`（超出 `INVALID_YM_RANGE`）。
- `ob_list_definition.project_workym` 每張名單綁定一個作業月（資料模型層早已 per-list）。

→ 「為未來月（下月）建立名單」本來就支援；缺的是**把整個工作流的預設與 run 觸發指向那個未來月**。

---

## 4. 核心設計：分離兩個概念

| 概念 | 定義 | 來源 | 用途 |
|---|---|---|---|
| **`current_work_ym`**（系統錨點） | 真實日曆當月 | `new Date()`（+OVERRIDE） | 判定歷史/未來/唯讀、±12 範圍、衍生預設目標月。**唯一合法用 `new Date()` 之處** |
| **`target_work_ym`**（作業月 / 目標分派月） | 使用者正在作業的那個月 | top-bar 選擇，**預設 = `current_work_ym + 1`** | 名單篩選、估算、月跑觸發 → 寫入 `AssignmentRun.project_workym` |

下游頁（progress/summary/snapshot/compare）**不需** top-bar：它們是某筆 run 的結果，單一真實來源 = 該 run 的 `project_workym`。只要 run 觸發時把選定月寫進去，下游自動一致。

---

## 5. 設計決策

- **D1**　前端建立**單一共享 `target_work_ym` 狀態**（Context 或 URL query），涵蓋 list-definitions / ready-summary / estimate / run。一處切換、全頁一致。
- **D2**　**預設值 = `current_work_ym + 1`**（下個月）。`current_work_ym` 仍由 `new Date()` 算（F077 不變），只是預設選取改指向下月。
- **D3**　**run 觸發改吃選定的 `target_work_ym`**：`trigger-run-page` 移除寫死 `currentWorkYm()`，改讀共享狀態；`POST /assignment/runs` 改接受 body `workYm`（取代忽略 `_dto` + server 端 `new Date()`）。
- **D4**　**補 ground-truth guard**：`POST /runs` 套 SP `@WORKDT >= getdate()`（用 `>=`）→ 不可對已開始/過去的作業月跑名單。
- **D5**　**Stage 1 去重視窗自動對齊**：`workdt = parseWorkdt(project_workym)` 一旦帶的是目標（下）月，`[workdt-3月, workdt-1日]` 自然回到 SP 語意，`computeDedupWindow` 邏輯本身不需改（但見 R3）。
- **D6**　**後端 `computeCurrentWorkYm()` 去重**：3+1 份收斂為單一 `SystemService.getCurrentWorkYm()`，新增 `getDefaultTargetWorkYm() = current + 1`。
- **D7**　**語意正名**：概念層把「當月」正名「作業月 / 目標分派月」；UI top-bar label 改「分派作業月份」。DB 欄位 `project_workym` 維持不動（語意本就正確，只是預設值餵錯）。

---

## 6. 受影響清單

**Frontend**
- 新增共享 month state（Context/store）+ 預設 +1。
- `trigger-run-page.tsx:52-55,79` 移除寫死 `currentWorkYm()`；改讀共享狀態；加 MonthPicker。
- list-definition / ready-summary / stage0-estimate / run-history 的 local `useState` → 接共享狀態（預設 +1）。
- api client `triggerRun()` 改帶 `workYm`。

**Backend**
- `assignment-run.controller.ts:69-75,85-87` — 接 body `workYm`、套 D4 guard、去重 `computeCurrentWorkYm`。
- `assignment-list.controller.ts:63-69` / `stage0-estimate.controller.ts:35-41` — 收斂到 `SystemService`。
- `system.service.ts` — 新增 `getCurrentWorkYm` + `getDefaultTargetWorkYm`。
- readiness / pipeline 邏輯不需改（已吃 `ym` 參數），只是傳入值改對。

---

## 7. 相容性 / 風險 / 開放問題

- **R1（spec 變更）**　F077 spec 寫「預設 = current_work_ym（本月）」。改成下月需 product-analyst/spec-writer 更新 F077，並評估「檢視本月已派名單需手動切回本月」的使用者預期。
- **R2（歷史資料語意混雜）**　既有 run/list 都用 `new Date()=本月`建立，其 `project_workym` 是「執行月」非「目標月」。建議 **forward-only + 文件註記，不回填**（回填風險高）。
- **R3（ETL 切點 × 去重視窗交互）→ 已決（§0.1）**　去重視窗上界語意正名為「基於作業月的上月底」（`workdt−1日`，target-relative）。`computeDedupWindow` 既有 `MIN(MAX(assignday), workdt−1)` 不改，只靠 run 傳入目標月使 `workdt−1` 自動 = 作業月上月底。維持近似（不建 OBASSIGNSET ETL）。
  - ⚠️ **spec 階段需確認的衍生點**：ETL `currentMonthFirstDay` 仍以「真實日曆本月 1 號」為上界載入 `ob_pool_data_list`（`extract-handler.ts:104`）。當 target=下月、且最近一個月（=作業月上月）的派案資料尚未被 ETL 載入時，`MAX(assignday)` 封頂會使實際去重範圍少一個月。此為**已接受的近似**；spec 需明文記載此落差，並評估 ETL 切點是否改為作業月相對（後續迭代，非本輪必做）。對應既有 **OQ-STAGE1-02**。
- **R4**　`assertYmInRange`（±12）與新預設 +1 相容，無需改。
- **R5（guard 邊界）**　月初（6/1）跑 6 月，WORKDT=6/1 = getdate()，沿用 SP 的 `>=`（即邊界當天可跑）。

---

## 8. 建議分期

- **P1（止血，最小）**：run 觸發改吃選定月 + 前端共享 month state + 預設 +1。解決「估算選 6 月卻跑 5 月」的 live 不一致。
- **P2（對齊 ground-truth）**：補 `@WORKDT >= getdate()` guard；確認並修正去重視窗 × ETL 切點（R3）；`computeCurrentWorkYm` 去重收斂。
- **P3（語意正名）**：F077 spec 更新預設月；概念/UI 改名「作業月」；architecture AD 記錄。

---

## 9. 開放問題（已於 §0 拍板）

1. **R3** → 維持近似，上界語意 = 作業月上月底；不建 OBASSIGNSET ETL。✅
2. **R2** → forward-only 不回填。✅
3. 分期 → P1+P2+P3 合併。✅
4. 流程 → 新 feature（≈ F097）+ architecture AD，進 /tdd。✅
