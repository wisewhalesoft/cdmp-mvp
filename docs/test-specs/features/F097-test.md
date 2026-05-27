---
type: test-design-feature
feature_id: F097
feature_name: 客戶名單分派「作業月」語意統一（target_work_ym 分離 + 過去月 guard + 去重視窗對齊）
priority: P0-MVP
related_spec: /docs/specs/features/F097-work-ym-semantics-unification.md
spec_version: "1.0"
covers:
  - F097
  - US-137
  - US-138
  - US-139
  - US-140
  - US-141
  - US-142
  - US-143
last_updated: 2026-05-27
---

# F097：客戶名單分派「作業月」語意統一 — 測試設計

> **測試設計重點（v1.0）**：
>
> 1. **後端 `SystemService.getDefaultTargetWorkYm()`**：一般月 +1、跨年邊界（202512 → 202601）、OVERRIDE 環境變數套用後 +1（AC-16）
> 2. **`POST /api/v1/assignment/runs` 三分支驗證**：缺省 `workYm` → 400；格式錯 / MM 非 01~12 → 422 `WORK_YM_INVALID_FORMAT`；過去月 → 422 `RUN_WORKYM_PAST`（AC-9、AC-10、AC-11）
> 3. **過去月 guard 邊界語意**：`workdt >= today`（`>=`），目標月 1 號當天合法（AC-12）；`guard` 以 server 時鐘（`SystemService.getCurrentWorkYm()` mock）為基準（BR-6）
> 4. **`project_workym` 寫入正確目標月**（AC-14）：非 `new Date()` 執行月
> 5. **三 controller `computeCurrentWorkYm()` 移除 regression**（AC-15）：行為不變
> 6. **Stage 1 去重視窗 `workdt` 對齊**（AC-19）：`project_workym='202606'` → `workdt=2026-06-01` → 上界 `2026-05-31`；regression 前後移一月
> 7. **`computeDedupWindow` 函式不改**（AC-20）：git diff 驗證無修改
> 8. **前端 `AssignmentWorkYmContext`**：預設 = 下月；四頁同步；`run-history` 獨立；處長 MonthPicker disabled；下游結果頁無 MonthPicker（AC-1~AC-7、AC-17）
>
> **命名鎖定**（對應 glossary.md）：`current_work_ym` / `target_work_ym` / `project_workym` / `workdt` / `AssignmentWorkYmContext` / `AssignmentWorkYmProvider` / `getDefaultTargetWorkYm` / `getCurrentWorkYm` / `RUN_WORKYM_PAST` / `WORK_YM_INVALID_FORMAT` — 下游 agent 禁止自行建立同義詞。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F097-work-ym-semantics-unification.md`（v1.0，21 條 AC + BR + OQ）+ `glossary.md`（命名唯一權威）+ `error-handling.md#assignment-run-errors`（`RUN_WORKYM_PAST` 422）+ `error-handling.md#assignment-list-errors`（`WORK_YM_INVALID_FORMAT` 422）+ `F091-stage1-complete-month-cnt-dedup-special-delete.md`（`computeDedupWindow` 不改）+ `apps/api/src/modules/system/system.service.ts`（既有 `getCurrentWorkYm`）|
| QA / Tester | 本文件 + `F097-work-ym-semantics-unification.md` §4 AC + §5.6 錯誤碼三分支 + §7 錯誤場景 |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Unit（`SystemService` 純函式）；Integration（`POST /runs` DTO + guard pipeline；Stage 1 去重視窗對齊；controller regression）；Component（React Context 同步；MonthPicker disabled；下游頁靜態月份）|
| 時鐘控制策略 | 後端 guard 測試：mock `SystemService.getCurrentWorkYm()` 回傳固定值（如 `'202605'`）控制 server today 基準；前端：mock `GET /api/v1/system/current-work-ym` response |
| 跨年邊界 | 後端：`getCurrentWorkYm()` mock 回 `'202512'` → `getDefaultTargetWorkYm()` 應回 `'202601'`；前端：mock API 回 `{ currentWorkYm: '202512' }` → Context `targetWorkYm = '202601'` |
| `computeDedupWindow` 不改驗證 | git diff 於 `computeDedupWindow` 函式無任何行數變更（AC-20 靜態 guard）|
| forward-only 不回填 | 程式碼注釋 + CHANGELOG 存在性驗證（AC-18、AC-21）|

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F097-SVC-001~005（`getDefaultTargetWorkYm` 單元測試）| 5 | 高 | Unit | 純函式、時鐘可注入 |
| TS-F097-CTL-001~004（三 controller `computeCurrentWorkYm` 移除 regression）| 4 | 高 | Unit/Integration | 呼叫鏈驗證 |
| TS-F097-DTO-001~007（`TriggerRunDto` `workYm` 驗證三分支）| 7 | 高 | Integration | ValidationPipe + NestJS E2E |
| TS-F097-GUARD-001~004（過去月 guard 邊界）| 4 | 高 | Integration | mock `getCurrentWorkYm()` |
| TS-F097-RUN-001~002（`project_workym` 寫入正確目標月）| 2 | 高 | Integration | DB 落點驗證 |
| TS-F097-DEDUP-001~004（Stage 1 去重視窗 `workdt` 對齊）| 4 | 高 | Integration | `computeDedupWindow` 傳入驗證 + regression |
| TS-F097-NODEDUP-001（`computeDedupWindow` 函式不改）| 1 | 高（靜態）| 靜態 git diff | AC-20 原子驗證 |
| TS-F097-CTX-001~006（`AssignmentWorkYmContext` 前端）| 6 | 高 | Component（RTL）| React Testing Library |
| TS-F097-TRIGGER-001~005（觸發頁前端：readiness / triggerRun / modal）| 5 | 高 | Component（RTL）| mock API |
| TS-F097-RBAC-001（處長 MonthPicker disabled）| 1 | 高 | Component（RTL）| `businessRole = 'section_chief'` |
| TS-F097-DOWNSTREAM-001~004（下游結果頁無 MonthPicker、月份靜態）| 4 | 高 | Component（RTL）| mock `run.projectWorkym` |
| TS-F097-LABEL-001~003（UI 標籤「分派作業月份」/ 無舊標籤）| 3 | 高 | Component（RTL）| 字串 regression |
| TS-F097-FORWARD-001（forward-only 注釋 / CHANGELOG 存在）| 1 | 中（手動或文字搜尋）| 靜態 | AC-18 / AC-21 |
| TS-F097-E2E-001（端到端：四頁切月 → 觸發 → 下游頁月份對齊）| 1 | 中（需完整環境）| E2E | AC 全鏈驗證 |

---

## 一、`SystemService.getDefaultTargetWorkYm()` 單元測試

> **設計依據**：AC-16（US-140 AC-3 / AC-4 / AC-5）；glossary §1（`current_work_ym` 唯一計算點）；F097 §5.3

---

### TS-F097-SVC-001：一般月 +1 — 正常計算

- **關聯需求**：AC-16；F097 BR-2（預設下月）
- **測試類型**：Positive / Unit
- **測試層**：Unit
- **前置條件**：
  - `SystemService` 已注入，`getCurrentWorkYm(now)` 回傳 `'202605'`（mock `now = 2026-05-15`）
- **步驟**：
  1. 呼叫 `SystemService.getDefaultTargetWorkYm(new Date('2026-05-15'))`
  2. 驗證回傳值
- **預期結果**：
  - 回傳 `'202606'`（`current_work_ym + 1`）
  - 不呼叫 `new Date()` 直接取月（透過 `getCurrentWorkYm` 路由）

---

### TS-F097-SVC-002：跨年邊界 — 202512 → 202601

- **關聯需求**：AC-16 And「跨年邊界」；AC-1 And「跨年邊界」
- **測試類型**：Boundary / Unit
- **測試層**：Unit
- **前置條件**：mock `now = 2025-12-15`，`getCurrentWorkYm()` 回 `'202512'`
- **步驟**：
  1. 呼叫 `SystemService.getDefaultTargetWorkYm(new Date('2025-12-15'))`
  2. 驗證回傳值
- **預期結果**：
  - 回傳 `'202601'`（非 `'202513'`；年進位正確）

---

### TS-F097-SVC-003：OVERRIDE 環境變數套用後 +1

- **關聯需求**：AC-16 And「OVERRIDE：`OVERRIDE_CURRENT_WORK_YM = '202506'` → `getDefaultTargetWorkYm()` 回 `'202507'`」；glossary §1（OVERRIDE 支援）
- **測試類型**：Positive / Unit
- **測試層**：Unit
- **前置條件**：
  - 環境變數 `OVERRIDE_CURRENT_WORK_YM = '202506'`
  - `now` 實際對應 `'202505'`（但被 OVERRIDE 覆蓋）
- **步驟**：
  1. 呼叫 `SystemService.getDefaultTargetWorkYm(now)`
  2. 驗證 `getCurrentWorkYm(now)` 回 `'202506'`（OVERRIDE 生效）
  3. 驗證 `getDefaultTargetWorkYm()` 回傳值
- **預期結果**：
  - 回傳 `'202507'`（`OVERRIDE 值 + 1`）

---

### TS-F097-SVC-004：`getDefaultTargetWorkYm` 不直接呼叫 `new Date()`

- **關聯需求**：AC-16；glossary §1（「全系統唯一合法呼叫 `new Date()` 之處」= `getCurrentWorkYm`）；BR-1（概念分離）
- **測試類型**：Positive / Unit（實作約束驗證）
- **測試層**：Unit
- **前置條件**：`SystemService.getDefaultTargetWorkYm` 實作已存在
- **步驟**：
  1. Spy on / stub `getCurrentWorkYm`，注入 mock
  2. 呼叫 `getDefaultTargetWorkYm()`
  3. 驗證 `getCurrentWorkYm` 被呼叫，且 `getDefaultTargetWorkYm` 本身不直接建立 `new Date()` 實例（或：驗證 `getDefaultTargetWorkYm` 只透過 `getCurrentWorkYm` 取得基準月）
- **預期結果**：
  - `getCurrentWorkYm` 被呼叫一次
  - `getDefaultTargetWorkYm` 回傳值正確（= `getCurrentWorkYm()` 結果 + 1 月）

---

### TS-F097-SVC-005：`getCurrentWorkYm` 既有行為不受影響（regression）

- **關聯需求**：AC-15（「純 refactor，業務行為不變」）；F097 BR-7
- **測試類型**：Positive / Unit（Regression）
- **測試層**：Unit
- **前置條件**：F097 前既有 `getCurrentWorkYm` 單元測試通過
- **步驟**：
  1. 以既有測試基線執行 `getCurrentWorkYm(now)` 各場景（含 OVERRIDE / 無 OVERRIDE / 一般月）
  2. 驗證回傳值與 F097 前完全一致
- **預期結果**：
  - 所有既有 `getCurrentWorkYm` 測試通過，無 regression
  - `getDefaultTargetWorkYm` 新增不影響 `getCurrentWorkYm` 回傳邏輯

---

## 二、三 Controller `computeCurrentWorkYm` 移除 Regression

> **設計依據**：AC-15（US-140 AC-1 / AC-2 / AC-6）；glossary 舊術語對照（廢棄 3 個 static method）；F097 §5.3

---

### TS-F097-CTL-001：`AssignmentListController` 不含 `computeCurrentWorkYm` static method

- **關聯需求**：AC-15（「`assignment-list.controller.ts` 的 `computeCurrentWorkYm()` static method 完全移除」）
- **測試類型**：Negative / 靜態（Regression）
- **測試層**：靜態（程式碼掃描）
- **前置條件**：F097 實作完成後
- **步驟**：
  1. grep / 靜態掃描 `apps/api/src/modules/assignment-list/assignment-list.controller.ts`
  2. 確認不含 `computeCurrentWorkYm` 字串
  3. 確認 `AssignmentListController` 建構子注入 `SystemService`
- **預期結果**：
  - `computeCurrentWorkYm` 字串不存在於 `assignment-list.controller.ts`
  - `SystemService` 已注入（`private readonly systemService: SystemService` 或等效）

---

### TS-F097-CTL-002：`Stage0EstimateController` 不含 `computeCurrentWorkYm` static method

- **關聯需求**：AC-15（`stage0-estimate.controller.ts` 移除）
- **測試類型**：Negative / 靜態（Regression）
- **測試層**：靜態（程式碼掃描）
- **前置條件**：F097 實作完成後
- **步驟**：
  1. grep `apps/api/src/modules/stage0-estimate/stage0-estimate.controller.ts`
  2. 確認不含 `computeCurrentWorkYm` 字串
  3. 確認 `SystemService` 已注入
- **預期結果**：
  - `computeCurrentWorkYm` 字串不存在
  - `SystemService` 注入確認

---

### TS-F097-CTL-003：`AssignmentRunController` `triggerRun` handler 不再呼叫 `computeCurrentWorkYm`

- **關聯需求**：AC-15（`assignment-run.controller.ts` 移除）；AC-8（「`AssignmentRunController.computeCurrentWorkYm()` static method 在此 handler 不再被呼叫」）
- **測試類型**：Negative / 靜態（Regression）
- **測試層**：靜態（程式碼掃描）
- **前置條件**：F097 實作完成後
- **步驟**：
  1. grep `apps/api/src/modules/assignment-run/assignment-run.controller.ts`
  2. 確認 `computeCurrentWorkYm` 字串不存在（含 `static computeCurrentWorkYm` 與各 handler 呼叫點）
  3. 確認 `triggerRun` handler 改讀 `dto.workYm`（而非舊 static method）
- **預期結果**：
  - `computeCurrentWorkYm` 字串不存在
  - `triggerRun` handler 使用 `dto.workYm`

---

### TS-F097-CTL-004：`assignment-stage` 下各 controller 呼叫方改 `SystemService.getCurrentWorkYm()` 行為不變（regression）

- **關聯需求**：AC-15 And「`assignment-stage` 下各 controller 呼叫方同步更新，行為不變」
- **測試類型**：Positive / Integration（Regression）
- **測試層**：Integration
- **前置條件**：
  - `dept-ratio.controller` / `personnel-ratio.controller` / `stage-action.controller` 改呼叫 `SystemService.getCurrentWorkYm()`
  - mock `SystemService.getCurrentWorkYm()` 回 `'202606'`
- **步驟**：
  1. 呼叫 `assignment-stage` 各端點之 `ym` 取值路徑
  2. 驗證取得值 = `SystemService.getCurrentWorkYm()` 回傳值（`'202606'`）
  3. 對比 F097 前同場景輸出（regression 基線）
- **預期結果**：
  - 端點行為與 F097 前完全一致（`current_work_ym` 值相同）
  - 無新 regression 引入

---

## 三、`TriggerRunDto` `workYm` 三分支驗證（`POST /api/v1/assignment/runs`）

> **設計依據**：AC-8~AC-14（US-139）；F097 §5.6 三分支；error-handling.md `WORK_YM_INVALID_FORMAT` / `RUN_WORKYM_PAST`；BR-4（必填無 fallback）

---

### TS-F097-DTO-001：`workYm` 缺省（空 body） → 400

- **關聯需求**：AC-10（US-139 AC-3）；F097 §5.6 分支 (1)；BR-4
- **測試類型**：Negative / Integration
- **測試層**：Integration（NestJS E2E / supertest）
- **前置條件**：
  - 有效 JWT（部長角色）
  - `POST /api/v1/assignment/runs` 端點已更新為 `workYm` 必填
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{}`（空 body，未帶 `workYm`）
  2. 驗證 response
- **預期結果**：
  - HTTP **400**（缺少必要欄位，通用 ValidationPipe 回應）
  - 無 `new Date()` fallback（後端不自算月份）
  - response body 含 NestJS ValidationPipe 標準格式錯誤結構

---

### TS-F097-DTO-002：`workYm = null` → 400

- **關聯需求**：AC-10（US-139 AC-3）；F097 §5.6 分支 (1)
- **測試類型**：Negative / Integration
- **測試層**：Integration
- **前置條件**：有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": null }`
  2. 驗證 response
- **預期結果**：
  - HTTP **400**（`null` 視為缺省必填，等同缺欄位場景）

---

### TS-F097-DTO-003：`workYm` 非 6 碼（`'20266'`） → 422 `WORK_YM_INVALID_FORMAT`

- **關聯需求**：AC-9（US-139 AC-2）；F097 §5.6 分支 (2)；OQ-F097-03 已裁示
- **測試類型**：Negative / Integration
- **測試層**：Integration
- **前置條件**：有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "20266" }`（5 碼）
  2. 驗證 response
- **預期結果**：
  - HTTP **422**，錯誤碼 `WORK_YM_INVALID_FORMAT`

---

### TS-F097-DTO-004：`workYm` MM 超出範圍（`'202613'`，MM=13） → 422 `WORK_YM_INVALID_FORMAT`

- **關聯需求**：AC-9（US-139 AC-2）；F097 §5.6 分支 (2)；OQ-F097-03（嚴格 regex `^\d{4}(0[1-9]|1[0-2])$`）
- **測試類型**：Negative / Boundary / Integration
- **測試層**：Integration
- **前置條件**：有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "202613" }`（MM=13，6 碼但月份非法）
  2. 驗證 response
- **預期結果**：
  - HTTP **422**，錯誤碼 `WORK_YM_INVALID_FORMAT`
  - 注意：此場景在**格式驗證層即被攔截**，不依賴過去月 guard（AC-9 明定）

---

### TS-F097-DTO-005：`workYm` 非數字字串（`'abcdef'`） → 422 `WORK_YM_INVALID_FORMAT`

- **關聯需求**：AC-9（US-139 AC-2）；F097 §5.6 分支 (2)
- **測試類型**：Negative / Integration
- **測試層**：Integration
- **前置條件**：有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "abcdef" }`（6 碼但非數字）
  2. 驗證 response
- **預期結果**：
  - HTTP **422**，錯誤碼 `WORK_YM_INVALID_FORMAT`

---

### TS-F097-DTO-006：`workYm` 格式合法（`'202606'`），後端通過格式驗證

- **關聯需求**：AC-8~AC-14（格式合法後進入業務邏輯）；F097 §5.2 業務邏輯順序
- **測試類型**：Positive / Integration
- **測試層**：Integration
- **前置條件**：
  - mock server today = 2026-05-27（`SystemService.getCurrentWorkYm()` 回 `'202605'`）
  - mock 既有前置條件通過（readiness / assertNoRunningRun 均 stub pass）
  - 有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "202606" }`
  2. 驗證 response
- **預期結果**：
  - HTTP **201**（run 建立成功）
  - response `ym = '202606'`（AC-14）
  - **不**回 400 / 422

---

### TS-F097-DTO-007：`workYm` MM=00（`'202600'`） → 422 `WORK_YM_INVALID_FORMAT`

- **關聯需求**：AC-9；regex `^\d{4}(0[1-9]|1[0-2])$`（`00` 不在 `0[1-9]` 或 `1[0-2]`）
- **測試類型**：Negative / Boundary / Integration
- **測試層**：Integration
- **前置條件**：有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "202600" }`（MM=00）
  2. 驗證 response
- **預期結果**：
  - HTTP **422**，錯誤碼 `WORK_YM_INVALID_FORMAT`

---

## 四、過去月 Guard 邊界測試

> **設計依據**：AC-11 / AC-12 / AC-13（US-139 AC-4 / AC-5 / AC-6）；F097 §5.6 分支 (3)；BR-5（`>=` 邊界）；BR-6（server 時鐘，`SystemService.getCurrentWorkYm()` mock）；glossary §4（`workdt` = `target_work_ym + '01'`）

---

### TS-F097-GUARD-001：過去月 → 422 `RUN_WORKYM_PAST`

- **關聯需求**：AC-11（US-139 AC-4）；F097 §5.6 分支 (3)；error-handling.md `RUN_WORKYM_PAST`
- **測試類型**：Negative / Integration
- **測試層**：Integration
- **前置條件**：
  - mock `SystemService.getCurrentWorkYm()` 回 `'202605'`（server today = 2026-05-27）
  - `workYm` 格式驗證已通過
  - 有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "202504" }`（目標月 1 號 = 2025-04-01 < 今天 2026-05-27）
  2. 驗證 response
- **預期結果**：
  - HTTP **422**，錯誤碼 `RUN_WORKYM_PAST`
  - response `message` 表達「不可對已開始或過去的作業月觸發月跑」（或等效說明，對齊 error-handling.md）

---

### TS-F097-GUARD-002：當月 1 號邊界 — 當天可觸發（`>=` 語意）

- **關聯需求**：AC-12（US-139 AC-5）；BR-5（`workdt >= today`）；ground truth SP `@WORKDT < getdate()` 等價移植
- **測試類型**：Boundary / Integration
- **測試層**：Integration
- **前置條件**：
  - mock server today = 2026-06-01（`SystemService.getCurrentWorkYm()` mock 回 `'202606'`）
  - mock 既有前置條件通過
  - 有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "202606" }`（`workdt = 2026-06-01 = today`）
  2. 驗證 response
- **預期結果**：
  - Guard **通過**（`workdt = today >= today`，`>=` 邊界合法）
  - HTTP **201**（run 建立成功，不回 422）
  - **注意**：此為關鍵邊界，必須確認 `<` 嚴格比較未被誤用（否則當天觸發會被錯誤拒絕）

---

### TS-F097-GUARD-003：未來月份通過 guard

- **關聯需求**：AC-13（US-139 AC-6）
- **測試類型**：Positive / Integration
- **測試層**：Integration
- **前置條件**：
  - mock server today = 2026-05-27（`'202605'`）
  - mock 既有前置條件通過
  - 有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "202607" }`（目標月 1 號 = 2026-07-01 > 今天）
  2. 驗證 response
- **預期結果**：
  - Guard 通過，HTTP **201**
  - 不回 422 `RUN_WORKYM_PAST`

---

### TS-F097-GUARD-004：Guard 以 server 時鐘（`SystemService.getCurrentWorkYm()`）為基準，不依賴前端時鐘

- **關聯需求**：AC-11~AC-13；BR-6（「guard 以 server 時鐘為準」）；F097 §5.2 業務邏輯順序步驟 2
- **測試類型**：Positive / Unit（設計約束驗證）
- **測試層**：Unit
- **前置條件**：
  - `triggerRun` service 或 guard 實作已存在
- **步驟**：
  1. Spy on `SystemService.getCurrentWorkYm()`（或等效計算 `today` 的路徑）
  2. 不傳入任何前端提供之日期
  3. 呼叫 guard 邏輯（`workYm = '202606'`，mock today = 2026-07-01）
  4. 驗證 guard 拒絕（`2026-06-01 < 2026-07-01`）
- **預期結果**：
  - `SystemService.getCurrentWorkYm()` 被呼叫（server 時鐘基準）
  - Guard 正確拒絕，不依賴任何前端傳入之時間參數

---

## 五、`project_workym` 寫入正確目標月

> **設計依據**：AC-14（US-138 AC-7 / US-139 AC-7）；F097 BR-4（必填無 fallback）；glossary §3（DB 欄位 `project_workym`）

---

### TS-F097-RUN-001：guard 通過後 `assignment_run.project_workym` = 選定 `workYm`

- **關聯需求**：AC-14；AC-8 And「`AssignmentRun.project_workym` 使用 `dto.workYm`，不呼叫 `new Date()`」
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer 或 supertest + DB 查詢）
- **前置條件**：
  - mock server today = 2026-05-27（`'202605'`）
  - mock readiness / assertNoRunningRun 均通過
  - 有效 JWT（部長角色）
- **步驟**：
  1. 發送 `POST /api/v1/assignment/runs`，body = `{ "workYm": "202606" }`
  2. 取得 response `run_id`
  3. 查詢 DB `SELECT project_workym FROM assignment_run WHERE run_id = :runId`
- **預期結果**：
  - `assignment_run.project_workym = '202606'`（目標月，**非執行月 `'202605'`**）
  - response `ym = '202606'`（`TriggerRunResponse.ym`）

---

### TS-F097-RUN-002：`project_workym` 不等於 `new Date()` 執行月（regression，breaking change 驗證）

- **關聯需求**：AC-14；AC-8（`computeCurrentWorkYm()` 不再被呼叫）；F097 PRODUCTION 行為變更警告
- **測試類型**：Negative / Integration（Regression）
- **測試層**：Integration
- **前置條件**：
  - mock server today = 2026-05-27（current_work_ym = `'202605'`）
  - request body `workYm = '202606'`（目標月與執行月不同）
  - run 建立成功
- **步驟**：
  1. 建立 run（同 TS-F097-RUN-001）
  2. 查詢 `assignment_run.project_workym`
  3. 驗證其**不等於** `'202605'`（執行月）
- **預期結果**：
  - `project_workym ≠ '202605'`（執行月）
  - `project_workym = '202606'`（選定目標月）

---

## 六、Stage 1 去重視窗 `workdt` 對齊

> **設計依據**：AC-19（US-142 AC-1 / AC-3）；AC-20（US-142 AC-2，`computeDedupWindow` 不改）；glossary §4（`workdt`）；glossary §6（去重視窗）；F097 §5.5

---

### TS-F097-DEDUP-001：`project_workym='202606'` → `workdt=2026-06-01` → 去重上界 `2026-05-31`

- **關聯需求**：AC-19 Then「`workdt = new Date('2026-06-01')`」And「去重視窗 = `[2026-03-01, MIN(MAX(assignday), 2026-05-31)]`」
- **測試類型**：Positive / Integration
- **測試層**：Integration
- **前置條件**：
  - `AssignmentRun.project_workym = '202606'`（AC-14 正確寫入後）
  - `executeStage1Chain` / `runStage1ForList` 路徑使用 `project_workym + '01'` 計算 `workdt`
  - `computeDedupWindow` 以 `workdt = 2026-06-01` 呼叫
- **步驟**：
  1. stub `computeDedupWindow` 捕捉傳入參數，或驗證其被以 `new Date('2026-06-01')` 呼叫
  2. 計算去重上界：`MIN(MAX(ob_pool_data_list.assignday), workdt - 1 日)` = `MIN(MAX(assignday), 2026-05-31)`
  3. 驗證上界值
- **預期結果**：
  - `computeDedupWindow` 被以 `workdt = 2026-06-01` 呼叫
  - 去重視窗上界 = `2026-05-31`（作業月上月底，對齊 glossary §6）

---

### TS-F097-DEDUP-002：`workdt` 來自 `project_workym + '01'`，非 `new Date()`

- **關聯需求**：AC-19 Then「`workdt = new Date('2026-06-01')`（目標月 1 號）」；BR-10（去重視窗靠正確 `workdt` 自動對齊）
- **測試類型**：Positive / Unit
- **測試層**：Unit
- **前置條件**：`executeStage1Chain` / `runStage1ForList` 函式實作
- **步驟**：
  1. Spy / stub `computeDedupWindow`
  2. 以 `run = { project_workym: '202606' }` 呼叫 Stage 1 pipeline
  3. 驗證 `computeDedupWindow` 的第一個參數（`workdt`）
- **預期結果**：
  - 第一個參數 = `new Date('2026-06-01')`（`project_workym + '01'` 衍生）
  - **非** `new Date()`（執行當下日期）

---

### TS-F097-DEDUP-003：Regression — 去重上界後移一月（`'202605'` → `2026-04-30`；`'202606'` → `2026-05-31`）

- **關聯需求**：AC-19 And「regression：F097 後 `'202606'` → 上界 `2026-05-31`，整體後移一個月」
- **測試類型**：Boundary / Integration（Regression）
- **測試層**：Integration
- **前置條件**：
  - 場景 A：`run.project_workym = '202605'`（F097 前語意，執行月；作為基線）
  - 場景 B：`run.project_workym = '202606'`（F097 後，目標月）
  - `MAX(ob_pool_data_list.assignday)` stub 為 `2026-04-30`（不影響 MIN 取值）
- **步驟**：
  1. 場景 A：以 `workdt = 2026-05-01` 呼叫 `computeDedupWindow`，驗證上界
  2. 場景 B：以 `workdt = 2026-06-01` 呼叫 `computeDedupWindow`，驗證上界
  3. 比較兩場景上界差值
- **預期結果**：
  - 場景 A（`workdt=2026-05-01`）上界 = `2026-04-30`
  - 場景 B（`workdt=2026-06-01`）上界 = `2026-05-31`
  - 上界整體後移一個月（符合 F097 語意修正預期）

---

### TS-F097-DEDUP-004：ETL 切點近似落差說明文件化（程式碼注釋存在）

- **關聯需求**：AC-21（US-142 AC-4）；glossary §6（「ETL 近似落差（已接受）」）；F091 OQ-STAGE1-02
- **測試類型**：Positive / 靜態
- **測試層**：靜態（程式碼文字搜尋）
- **前置條件**：F097 實作完成後
- **步驟**：
  1. grep `computeDedupWindow` 函式附近（前後 30 行）搜尋「ETL 切點近似」或「OQ-STAGE1-02」或等效說明注釋
- **預期結果**：
  - 存在說明注釋：ETL 載入上界為真實日曆本月 1 號（非目標月）、`MAX(assignday)` 可能不含上月末幾天、`MIN()` 以 `workdt − 1 日` 兜底、已接受近似

---

## 七、`computeDedupWindow` 函式不改驗證

> **設計依據**：AC-20（US-142 AC-2）；F097 §5.5「`computeDedupWindow` 函式不改」；glossary §6

---

### TS-F097-NODEDUP-001：`computeDedupWindow` 函式無 git diff（函式不修改）

- **關聯需求**：AC-20（「該函式簽名與內部邏輯無任何程式碼變更（可用 git diff 驗證）」）
- **測試類型**：Positive / 靜態
- **測試層**：靜態（git diff）
- **前置條件**：F097 feature branch 與 main（或 pre-F097 commit）的 diff
- **步驟**：
  1. 執行 `git diff main...HEAD -- apps/api/src/modules/assignment-stage/compute-dedup-window.ts`（或對應路徑）
  2. 驗證 diff 結果
- **預期結果**：
  - `computeDedupWindow` 函式定義（簽名 + 函式體）無任何行數新增、刪除或修改
  - diff 為空（或不含該函式的變更行）

---

## 八、`AssignmentWorkYmContext` 前端測試

> **設計依據**：AC-1 / AC-2 / AC-3（US-137）；glossary §8（共享月份狀態）；F097 §5.1

---

### TS-F097-CTX-001：Provider 初始化 — 預設 `targetWorkYm` = `currentWorkYm + 1`

- **關聯需求**：AC-1 Then「`target_work_ym` 預設 = `currentWorkYm + 1`」；glossary §2（預設值「下個月」）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component（React Testing Library）
- **前置條件**：
  - mock `GET /api/v1/system/current-work-ym` → `{ currentWorkYm: '202605' }`
  - `AssignmentWorkYmProvider` 掛載於測試樹中
- **步驟**：
  1. render 包含 `AssignmentWorkYmProvider` 的測試元件
  2. 等待 Context 初始化完成（API call resolved）
  3. 讀取 Context `targetWorkYm` 值
- **預期結果**：
  - `targetWorkYm = '202606'`（`currentWorkYm + 1`）
  - `currentWorkYm = '202605'`（API 回傳值）

---

### TS-F097-CTX-002：跨年邊界 — `currentWorkYm='202512'` → `targetWorkYm='202601'`

- **關聯需求**：AC-1 And「跨年邊界：`currentWorkYm = '202512'` → `target_work_ym = '202601'`（非 `'202513'`）」
- **測試類型**：Boundary / Component（RTL）
- **測試層**：Component
- **前置條件**：mock API → `{ currentWorkYm: '202512' }`
- **步驟**：
  1. render `AssignmentWorkYmProvider`
  2. 等待初始化
  3. 讀取 Context `targetWorkYm`
- **預期結果**：
  - `targetWorkYm = '202601'`（非 `'202513'`；年進位正確）

---

### TS-F097-CTX-003：一處切換四頁同步 — MonthPicker 選新月後 Context 更新

- **關聯需求**：AC-2（US-137 AC-2）；glossary §8（`setTargetWorkYm` setter）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：
  - 四頁均在 `AssignmentWorkYmProvider` 下 render（以 mock layout 模擬）
  - 初始 `targetWorkYm = '202606'`
- **步驟**：
  1. 於「名單定義頁」MonthPicker 呼叫 `setTargetWorkYm('202607')`
  2. 讀取其他三頁（準備完成摘要 / Stage 0 試算 / 月跑觸發）的 Context `targetWorkYm`
- **預期結果**：
  - 所有四頁 `targetWorkYm = '202607'`（Context 已同步）

---

### TS-F097-CTX-004：`run-history` 頁 MonthPicker 不影響共享 `targetWorkYm`（獨立 local state）

- **關聯需求**：AC-3（US-137 AC-4 / US-141 AC-5）；glossary §8（「月跑歷史頁（`run-history`，F065）：維持獨立 local state」）
- **測試類型**：Negative / Component（RTL）
- **測試層**：Component
- **前置條件**：
  - 共享 `targetWorkYm = '202606'`（Provider 初始）
  - `run-history` 頁有獨立 local state MonthPicker
- **步驟**：
  1. 於 `run-history` 頁 MonthPicker 切換至 `'202504'`
  2. 讀取共享 Context `targetWorkYm`
  3. 反向：呼叫共享 `setTargetWorkYm('202607')`
  4. 讀取 `run-history` 頁 MonthPicker 當前值
- **預期結果**：
  - 步驟 2：共享 `targetWorkYm` 仍為 `'202606'`（`run-history` 操作不影響 Context）
  - 步驟 4：`run-history` MonthPicker 仍為 `'202504'`（Context 變更不影響 `run-history`）

---

### TS-F097-CTX-005：Context 值可被 Consumer 讀取（`currentWorkYm` / `targetWorkYm` / `setTargetWorkYm` 均可用）

- **關聯需求**：AC-1；F097 §5.1（「Context 提供值」）；glossary §8
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：mock API → `{ currentWorkYm: '202605' }`；Provider 初始化完成
- **步驟**：
  1. 在 Consumer 元件讀取 `currentWorkYm` / `targetWorkYm` / `setTargetWorkYm`
  2. 確認三值均非 `undefined`
  3. 呼叫 `setTargetWorkYm('202607')`，確認 `targetWorkYm` 更新
- **預期結果**：
  - `currentWorkYm = '202605'`
  - `targetWorkYm = '202606'`
  - `setTargetWorkYm` 為函式（非 undefined）
  - 呼叫後 `targetWorkYm = '202607'`

---

### TS-F097-CTX-006：四頁使用 Context 的 `targetWorkYm` 作為篩選預設值（fetch 帶選定月）

- **關聯需求**：AC-1 And「四頁均以此 `target_work_ym` 作為月份篩選預設值」；AC-5（readiness check 帶 `?ym=`）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：Context `targetWorkYm = '202606'`
- **步驟**：
  1. render 「名單定義頁」，spy on 其 API fetch 呼叫
  2. render 「準備完成摘要頁」，spy on 其 API fetch
  3. render 「Stage 0 試算頁」，spy on 其 API fetch
  4. render 「月跑觸發頁」，spy on readiness API fetch
  5. 驗證各頁 fetch URL / params 含 `ym=202606` 或等效
- **預期結果**：
  - 四頁均以 `202606` 作為月份篩選參數（非各頁自行 `new Date()` 計算）

---

## 九、觸發頁前端：readiness / triggerRun / modal

> **設計依據**：AC-5 / AC-6（US-138 AC-2 / AC-3 / AC-4 / AC-5）；F097 §5.1（`triggerRun` 簽名）

---

### TS-F097-TRIGGER-001：readiness check 使用選定月 `?ym=202606`，非 `new Date()`

- **關聯需求**：AC-5（US-138 AC-2 / AC-3）；glossary 舊術語對照（廢棄「前端 `function currentWorkYm() { const now = new Date(); ... }`」）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：
  - Context `targetWorkYm = '202606'`
  - 觸發頁 render（部長角色）
  - spy on `GET /api/v1/assignment/runs/readiness`
- **步驟**：
  1. 等待觸發頁自動發送 readiness check
  2. 驗證請求 URL
- **預期結果**：
  - request URL 含 `?ym=202606`（選定月）
  - **不含** `?ym=202605`（`new Date()` 執行月）
  - 舊 `currentWorkYm()` helper 不被呼叫（移除驗證）

---

### TS-F097-TRIGGER-002：`triggerRun(workYm)` 呼叫帶 body `{ workYm: '202606' }`

- **關聯需求**：AC-6（US-138 AC-4 / AC-5）；F097 §5.1（`triggerRun(workYm: string): Promise<TriggerRunResponse>`）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：
  - Context `targetWorkYm = '202606'`
  - readiness check 通過（stub）
  - spy on `POST /api/v1/assignment/runs`
  - 部長角色
- **步驟**：
  1. 點擊「啟動月跑」按鈕
  2. 點擊 confirm modal 確認按鈕
  3. 驗證 `POST /api/v1/assignment/runs` 請求 body
- **預期結果**：
  - request body = `{ "workYm": "202606" }`（選定月）
  - **不包含**無 `workYm` 欄位的舊 body 格式

---

### TS-F097-TRIGGER-003：confirm modal 標題顯示選定月份格式（「確認觸發 2026-06 月跑？」）

- **關聯需求**：AC-6 And「confirm modal 標題顯示『確認觸發 2026-06 月跑？』（格式化自 `target_work_ym`，不顯示 `new Date()` 月份）」；F097 §5.1（`data-testid="confirm-trigger-modal"` 保留）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：Context `targetWorkYm = '202606'`；部長角色；readiness 通過（stub）
- **步驟**：
  1. 點擊「啟動月跑」按鈕
  2. 驗證 confirm modal 內的標題文字
- **預期結果**：
  - modal 標題含「2026-06」（格式化自 `targetWorkYm = '202606'`）
  - **不顯示** `new Date()` 計算之執行月份（如 `2026-05`）

---

### TS-F097-TRIGGER-004：觸發頁 MonthPicker 存在 `data-testid="trigger-run-month-picker"`

- **關聯需求**：F097 §5.1（「觸發頁 MonthPicker 新增 `data-testid="trigger-run-month-picker"`」）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：觸發頁 render（部長角色）
- **步驟**：
  1. render 觸發頁
  2. 查找 `data-testid="trigger-run-month-picker"`
- **預期結果**：
  - 元素存在（testid 確認 E2E 可定位）

---

### TS-F097-TRIGGER-005：`btn-start-run` / `confirm-trigger-modal` testid 保留

- **關聯需求**：F097 §5.1（「既有 `btn-start-run` / `confirm-trigger-modal` 保留」）；regression
- **測試類型**：Positive / Component（RTL）（Regression）
- **測試層**：Component
- **前置條件**：觸發頁 render（部長角色）；readiness 通過（stub）
- **步驟**：
  1. 查找 `data-testid="btn-start-run"`
  2. 點擊後查找 `data-testid="confirm-trigger-modal"`
- **預期結果**：
  - `btn-start-run` 存在
  - `confirm-trigger-modal` 點擊後出現

---

## 十、處長 MonthPicker 唯讀

> **設計依據**：AC-7（US-138 AC-6）；F097 §4 AC-7

---

### TS-F097-RBAC-001：`businessRole='section_chief'` — 觸發頁 MonthPicker disabled

- **關聯需求**：AC-7（US-138 AC-6）；glossary（`businessRole` 角色語意）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：
  - 使用者 `businessRole = 'section_chief'`
  - Context `targetWorkYm = '202606'`
  - 觸發頁 render
- **步驟**：
  1. render 觸發頁（section_chief JWT）
  2. 查找 `data-testid="trigger-run-month-picker"` 或等效 MonthPicker 元素
  3. 驗證其 `disabled` 狀態
- **預期結果**：
  - MonthPicker **disabled**（不可互動）
  - MonthPicker 仍顯示 `targetWorkYm = '202606'`（顯示共享值作為參考，AC-7 Then）
  - 處長唯讀 banner 維持現有行為（不受 F097 影響）

---

## 十一、下游結果頁無 MonthPicker、月份靜態

> **設計依據**：AC-17（US-141 AC-1 / AC-2 / AC-3）；glossary §3（API 回傳欄位 `projectWorkym` camelCase）；BR-8

---

### TS-F097-DOWNSTREAM-001：月跑進度頁（F062）月份來自 `run.projectWorkym`，無 MonthPicker

- **關聯需求**：AC-17 Then「月份取自 response 之 `project_workym`，非共享 `target_work_ym` Context」；「此四頁不出現 MonthPicker」
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：
  - mock `GET /api/v1/assignment/runs/:runId` → `{ projectWorkym: '202606', ... }`
  - 共享 Context `targetWorkYm = '202607'`（與 run 月份不同，驗證隔離）
- **步驟**：
  1. render F062 進度頁（傳入 `runId`）
  2. 確認月份顯示
  3. 確認無 MonthPicker 元素
- **預期結果**：
  - 月份顯示 `'202606'`（`run.projectWorkym`），非共享 `targetWorkYm = '202607'`
  - 頁面無 MonthPicker（無日曆/月份選擇器元件）

---

### TS-F097-DOWNSTREAM-002：結果摘要頁（F063）月份靜態，不隨共享狀態變動

- **關聯需求**：AC-17 And「即使使用者在其他頁切換共享 `target_work_ym`，此四頁顯示月份不受影響」
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：mock `run.projectWorkym = '202606'`；共享 `targetWorkYm = '202606'`（初始）
- **步驟**：
  1. render F063 結果摘要頁，確認顯示 `'202606'`
  2. 呼叫 `setTargetWorkYm('202608')`（共享狀態切換）
  3. re-render，驗證 F063 月份顯示
- **預期結果**：
  - 步驟 3：F063 仍顯示 `'202606'`（`run.projectWorkym`）
  - 不因共享 `targetWorkYm` 切換而變動

---

### TS-F097-DOWNSTREAM-003：快照詳情頁（F066）與比對差異頁（F067）同規則

- **關聯需求**：AC-17（F066 / F067 包含在四下游頁中）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：mock `run.projectWorkym = '202606'`；共享 `targetWorkYm = '202607'`
- **步驟**：
  1. render F066 快照詳情頁，驗證月份顯示與無 MonthPicker
  2. render F067 比對差異頁，驗證月份顯示與無 MonthPicker
- **預期結果**：
  - F066 / F067 均顯示 `'202606'`（`run.projectWorkym`）
  - 均無 MonthPicker
  - 月份格式依現有設計（「分派作業月份」前置文字 + 「2026年06月」或「2026-06」格式，AC-17 Then）

---

### TS-F097-DOWNSTREAM-004：下游頁不被納入 `AssignmentWorkYmContext`（不呼叫 `useAssignmentWorkYm` / useContext）

- **關聯需求**：AC-17；glossary §8（「下游結果頁：不加 MonthPicker，月份來源為 `run.project_workym`」）；F097 §5.4
- **測試類型**：Negative / 靜態
- **測試層**：靜態（程式碼掃描）
- **前置條件**：F097 實作完成後
- **步驟**：
  1. grep F062 / F063 / F066 / F067 各頁元件原始碼，搜尋 `useAssignmentWorkYm` / `AssignmentWorkYmContext` 字串
  2. 確認不存在
- **預期結果**：
  - 四個下游頁元件**不引用**共享 Context

---

## 十二、UI 標籤驗證

> **設計依據**：AC-4（US-137 AC-5 / AC-6 / US-138 AC-1）；glossary §2（UI 中文標籤「分派作業月份」）

---

### TS-F097-LABEL-001：MonthPicker label 顯示「分派作業月份」

- **關聯需求**：AC-4 Then「label / placeholder 一律顯示『分派作業月份』」；glossary §2（UI 中文標籤固定）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component
- **前置條件**：四頁 MonthPicker render（任一頁均可）
- **步驟**：
  1. render 各頁 MonthPicker
  2. 查找 label / placeholder 文字
- **預期結果**：
  - label / placeholder 顯示「**分派作業月份**」（完整詞，不簡化）

---

### TS-F097-LABEL-002：不出現舊標籤字串（「作業年月」/ 「當月」/ 「本月」）

- **關聯需求**：AC-4 And「不出現『作業年月』、『當月』、『本月』等舊標籤字串」；glossary 舊術語對照
- **測試類型**：Negative / Component（RTL）（Regression）
- **測試層**：Component
- **前置條件**：四頁均 render
- **步驟**：
  1. render 名單定義 / 準備完成摘要 / Stage 0 試算 / 月跑觸發四頁
  2. 搜尋頁面文字是否含「作業年月」/ 「當月」/ 「本月」（指 MonthPicker 旁之標籤，非一般說明文字）
- **預期結果**：
  - MonthPicker 附近標籤**不含**上述舊字串

---

### TS-F097-LABEL-003：F097 未新增任何 E07 sidebar 路由

- **關聯需求**：AC-4 And「F097 不新增任何 E07 sidebar 路由」
- **測試類型**：Negative / 靜態（Regression）
- **測試層**：靜態（設定檔掃描）
- **前置條件**：F097 實作完成後
- **步驟**：
  1. 比較 F097 前後 sidebar 設定（routes config / sidebar menu config）
  2. 確認 E07 路由條目數量不增加
- **預期結果**：
  - sidebar 設定 diff 不含新 E07 路由條目
  - 所有 F097 變更均為既有頁面行為調整

---

## 十三、forward-only / CHANGELOG 靜態驗證

> **設計依據**：AC-18（US-141 AC-4）；AC-21；glossary §7（forward-only 定義）；F097 BR-9

---

### TS-F097-FORWARD-001：`AssignmentRunService.triggerRun` 附近含 forward-only 注釋與生效日期

- **關聯需求**：AC-18 And「程式碼注釋或 CHANGELOG 記載（`AssignmentRunService.triggerRun` 附近），標注生效日期 = F097 部署日」；AC-21 And「此已接受之近似於 `computeDedupWindow` 附近以程式碼注釋標記」
- **測試類型**：Positive / 靜態
- **測試層**：靜態（程式碼文字搜尋）
- **前置條件**：F097 實作完成後
- **步驟**：
  1. grep `AssignmentRunService.triggerRun` 所在檔案，搜尋「forward-only」/ 「F097」/ 「目標分派月」等關鍵字
  2. 驗證注釋包含「生效日期」/ 「F097 部署後」或等效時間標記
- **預期結果**：
  - 存在明確注釋說明 forward-only 策略（歷史 run `project_workym` 為執行月語意，不回填）
  - 注釋含生效日期（F097 部署日）
  - AC-18 And「不呈現給一般使用者」（無任何 UI 回填操作）

---

## 十四、端對端整合測試（E2E）

> **設計依據**：F097 §12（E2E：四頁切月同步 → 觸發頁選 6 月 → readiness 帶 6 月 → 確認 modal 顯示 2026-06 → `run.project_workym = '202606'` → 進度頁顯示 6 月）

---

### TS-F097-E2E-001：全流程端到端 — 四頁同步 → 觸發 6 月月跑 → 進度頁顯示 6 月

- **關聯需求**：AC-1~AC-6、AC-8、AC-12~AC-14、AC-17（全鏈驗證）；F097 §12 E2E 描述
- **測試類型**：Positive / E2E
- **測試層**：E2E（完整環境，Playwright 或等效）
- **前置條件**：
  - server today mock（`OVERRIDE_CURRENT_WORK_YM` 或 test hook）= `'202605'`（2026-05-27）
  - 有效部長帳號登入
  - 各名單已處於 `stage = 'ready'`（readiness 通過前置條件）
- **步驟**：
  1. 進入「名單定義頁」
  2. 確認 MonthPicker 顯示 `202606`（預設下月）
  3. 切換至「Stage 0 試算頁」，確認 `202606`
  4. 切換至「月跑觸發頁」，確認 MonthPicker 顯示 `202606`
  5. 確認 readiness check URL 含 `?ym=202606`
  6. 點擊「啟動月跑」
  7. confirm modal 顯示「2026-06」
  8. 確認觸發，`POST /api/v1/assignment/runs` body 含 `{ workYm: '202606' }`
  9. DB 驗證 `assignment_run.project_workym = '202606'`
  10. 進入月跑進度頁（F062）
  11. 確認月份顯示 `202606`（從 `run.projectWorkym`）
  12. 返回「名單定義頁」切換月份至 `202608`
  13. 確認進度頁月份仍為 `202606`（不受共享狀態影響）
- **預期結果**：
  - 所有步驟符合預期（四頁同步 + 觸發月份正確 + 下游頁隔離）
  - DB `project_workym = '202606'`（非執行月 `'202605'`）

---

## 自動化就緒度彙整

| 群組 | 案例 ID | 案例數 | 自動化適合度 | 說明 |
|---|---|---|---|---|
| `getDefaultTargetWorkYm` 單元 | TS-F097-SVC-001~005 | 5 | 高 | 純函式；時鐘可注入 |
| Controller regression 靜態 | TS-F097-CTL-001~004 | 4 | 高 | grep + Integration |
| DTO 驗證三分支 | TS-F097-DTO-001~007 | 7 | 高 | NestJS E2E ValidationPipe |
| guard 邊界 | TS-F097-GUARD-001~004 | 4 | 高 | mock `getCurrentWorkYm()` |
| `project_workym` 寫入 | TS-F097-RUN-001~002 | 2 | 高 | DB 落點驗證 |
| 去重視窗對齊 | TS-F097-DEDUP-001~004 | 4 | 高 | 含 regression 比對 |
| `computeDedupWindow` 不改 | TS-F097-NODEDUP-001 | 1 | 高（靜態）| git diff 驗證 |
| Context 前端 | TS-F097-CTX-001~006 | 6 | 高 | RTL |
| 觸發頁前端 | TS-F097-TRIGGER-001~005 | 5 | 高 | RTL + mock API |
| 處長 disabled | TS-F097-RBAC-001 | 1 | 高 | RTL |
| 下游結果頁 | TS-F097-DOWNSTREAM-001~004 | 4 | 高 | RTL + 靜態 |
| UI 標籤 | TS-F097-LABEL-001~003 | 3 | 高 | RTL + 靜態 |
| forward-only 靜態 | TS-F097-FORWARD-001 | 1 | 中（文字搜尋）| 靜態驗證 |
| E2E | TS-F097-E2E-001 | 1 | 中（需完整環境）| Playwright |
| **合計** | | **48** | | |
