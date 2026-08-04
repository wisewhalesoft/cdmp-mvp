---
type: test-design-feature
feature_id: F117
feature_name: 部門比例設定頁僅提供「有在職處長」之部門設定
priority: P1
related_spec: /docs/specs/features/F117-dept-ratio-director-required-filter.md
related_spec_parent: /docs/specs/features/F079-set-dept-ratio.md
related_architecture: /docs/specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md
spec_version: "1.1"
covers:
  - F117
  - US-180
date: 2026-08-04
last_updated: 2026-08-04
---

# F117：部門比例設定頁僅提供「有在職處長」之部門設定 — 測試設計

> 本文件為 F117 首次建立的 test spec。F117 為 F079 之精煉（疊加可設定範圍限縮），
> 契約衝突時以 F079 為準（見 F117 §9）。AC-9 / AC-10 為**回歸**基準（既有行為不變），
> 不對應新增測試，而是「確認未破壞」——已由既有 F079 測試涵蓋，本文件僅標註為
> regression 錨點供 CI 對照。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F117 spec](../../specs/features/F117-dept-ratio-director-required-filter.md) + [F079 spec](../../specs/features/F079-set-dept-ratio.md) + [AD-E07-48](../../specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md) §4 + `error-handling.md#assignment-ratio-errors` + [contract](../../specs/contracts/F117-dept-ratio.contract.ts) |
| QA / Tester | 本文件 §一~四 + F117 spec §4/§10 |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Unit（Vitest，mock repo，`DeptRatioService`）+ 後端 Integration（Vitest + Supertest，in-memory SQLite，真實 Guard/Controller/Service/DB）+ 前端 Component（RTL）+ E2E Fidelity（Playwright，對照 prototype 三分類渲染） |
| 測試檔案（後端 Unit） | `apps/api/src/modules/assignment-stage/__tests__/dept-ratio.service.spec.ts`（追加 `describe('DeptRatioService (F117)', ...)` 群組，沿用既有 mock 慣例）|
| 測試檔案（後端 Integration） | `apps/api/test/f117-dept-ratio-director-filter.e2e-spec.ts`（新建，沿用 `f081-f085-f089-rollback.e2e-spec.ts` 之 bootstrap 慣例：in-memory better-sqlite3、真實 AuthModule + AssignmentStageModule、`apps/api/test/fixtures/{users,ob-emphire}.fixture.ts`）|
| 測試檔案（前端 Component） | `apps/web/src/pages/assignment/__tests__/dept-ratio-form.test.tsx`（追加）+ `dept-ratio-config-page.test.tsx`（追加）|
| 測試檔案（E2E Fidelity） | `e2e/tests/fidelity-f117-dept-ratio.spec.ts`（新建，Playwright） |
| 契約 | [F117-dept-ratio.contract.ts](../../specs/contracts/F117-dept-ratio.contract.ts) |
| 處長在職判定 fixture 注意 | `ob-emphire.fixture.ts` 之 `buildEmphire()` 預設 `resign_date = ACTIVE_RESIGN_SENTINEL('9999-12-31')`（在職），**不可**改用 `resign_date: null` 表示在職——雖然 `emphire-active.util` 兩者皆判在職，但真實來源系統一律寫哨兵值，`null` 為未曾出現之組合，混用會弱化測試對真實 contract 的覆蓋（見專案記憶 `feedback_mock_real_system_contract` / `feedback_emphire_active_resign_sentinel`）|

---

## Fixture 規範（後端 Integration 共用）

| 部門 | ob_emphire 處長 | ob_dept_pct 既有 ration | 分類（BR-2）|
|---|---|---|---|
| XTA0 | 王處長（在職，哨兵 resign_date）| 60 | 有處長部門（可編輯）|
| XTB0 | 無 | 40 | 孤兒部門（鎖定顯示）|
| XTC0 | 無 | 0（或無紀錄） | 無關部門（隱藏）|
| XTD0 | 陳處長（`resign_date` 為過去日期，非哨兵，即離職）| 0 | 無關部門（隱藏，處長已離職）|
| XTE0 | 2 位在職處長（`hire_date` 分別為 2018/2020）| 20 | 有處長部門（取 2018 到職者為 directorName）|

---

## 一、後端 Unit 測試（`DeptRatioService`，mock repo）

> 沿用既有 `dept-ratio.service.spec.ts` 之 mock 慣例（`emphireRepo.createQueryBuilder()` mock chain、`deptPctRepo.find()`、`dataSource.transaction()`）。新增 `describe('DeptRatioService (F117)', ...)` 群組，不修改既有 F079 群組。

### TS-F117-BE-001：GET requireDirector=true，4 部門皆有處長 → 全數可編輯、hiddenNoDirectorCount=0

- **關聯需求**：F117 AC-1 / §10 案例 1
- **前置條件**：`emphireRepo` mock 回傳 4 位在職處長（4 個不同部門）
- **步驟**：`svc.getDeptRatios(listNo, { requireDirector: true })`
- **預期結果**：`deptRatios.length === 4`；每列 `hasActiveDirector === true && isRatioEditable === true`；`hiddenNoDirectorCount === 0`

### TS-F117-BE-002：GET requireDirector=true，5 部門其中 1 無處長且 ration=0 → 回 4 列、hiddenNoDirectorCount=1

- **關聯需求**：F117 AC-1 / BR-2 / BR-3 / §10 案例 2
- **預期結果**：回傳陣列不含該部門；`hiddenNoDirectorCount === 1`；`total` 不受影響（該部門 ration 恆為 0）

### TS-F117-BE-003：GET requireDirector=true，1 部門無處長但既有 ration=20 → 回該列、isRatioEditable=false、不計入 hiddenNoDirectorCount

- **關聯需求**：F117 AC-3（★核心）/ BR-2 / A-3 / §10 案例 3
- **預期結果**：`deptRatios` 含該部門；`hasActiveDirector === false`；`isRatioEditable === false`；`hiddenNoDirectorCount` 不含此列（孤兒非隱藏）

### TS-F117-BE-004：GET，處長已離職（resign_date < 系統日，非哨兵）→ 判定無處長

- **關聯需求**：F117 AC-2（在職判定沿用 emphire-active.util）
- **預期結果**：該部門 `hasActiveDirector === false`

### TS-F117-BE-005：GET，處長 resign_date = 9999-12-31（哨兵）→ 判定有處長

- **關聯需求**：F117 AC-2（在職語意迴歸；防止誤用 `resign_date IS NULL` 導致全員判離職）
- **預期結果**：`hasActiveDirector === true`

### TS-F117-BE-006：GET，同部門 2 位在職處長 → 取最早 hire_date 者為 directorName

- **關聯需求**：F117 BR-1（沿用 F079 BR-14）
- **預期結果**：`directorName` 為較早到職者姓名

### TS-F117-BE-007：GET 不帶 requireDirector → 回應與 F117 實作前完全一致（AC-10）

- **關聯需求**：F117 AC-10 / BR-8
- **預期結果**：`deptRatios` 不因處長狀態被過濾（無關部門仍出現）；`hiddenNoDirectorCount === 0`；但 `hasActiveDirector` / `isRatioEditable` 仍**恆計算並回傳**（AD-E07-48 §4.2：新增欄位、零行為變更，不因未帶 flag 而消失）

### TS-F117-BE-008（★核心）：PUT 孤兒保留 — 既有 {A:60(有處長), B:40(無處長)}，payload 僅送 {A:60} → 持久化為 {A:60, B:40}，總和 100，B 未消失

- **關聯需求**：F117 AC-3 / AC-4 / BR-4 / I-F117-ORPHAN-PRESERVE-01 / §10 核心案例
- **步驟**：mock `deptPctRepo.find()` 回傳既有 2 筆（A 有處長、B 無處長）；`svc.setDeptRatios(listNo, { deptRatios: [{obdeptId:'A', ration:60, ...}] })`
- **預期結果**：`mgr.insert` 或等價寫入呼叫之最終列集合含 B（ration=40）；`ratioValidation.assertSumEquals100` 之呼叫參數含 A+B（100），非僅 A（60）

### TS-F117-BE-009：PUT 孤兒列竄改 — payload 送 {A:60, B:0} → B 仍為既有值 40（BR-5），加總驗證以 {A:60,B:40} 為準

- **關聯需求**：F117 BR-5
- **預期結果**：最終寫入集合中 B 的 ration 為既有值 40，非 payload 的 0；不拋錯誤

### TS-F117-BE-010：PUT 無處長新配置 — payload 對無處長且無既有比例之 C 配 10% → 422 RATIO_DEPT_DIRECTOR_REQUIRED

- **關聯需求**：F117 AC-6 / BR-6
- **預期結果**：拋出 `UnprocessableEntityException`，`error.code === 'RATIO_DEPT_DIRECTOR_REQUIRED'`，訊息含部門代碼 C

### TS-F117-BE-011：PUT 加總範圍 — payload {A:100} + 孤兒 B:40 → 最終 140 → 422 RATIO_SUM_NOT_100

- **關聯需求**：F117 AC-5 / BR-7 / I-F117-SUM-SCOPE-01
- **預期結果**：`ratioValidation.assertSumEquals100` 收到 [100, 40]（加總 140）而拋出既有 `RATIO_SUM_NOT_100`（非以 payload 單獨的 100 判定為合法）

### TS-F117-BE-012：PUT 稽核 — after_value 含保留之孤兒列

- **關聯需求**：F117 AC-4 / BR-9
- **預期結果**：audit 呼叫（或 `mgr` 寫入呼叫）之 `after_value` 陣列含孤兒部門 B 的紀錄

---

## 二、後端 Integration 測試（真實 HTTP + Guard + SQLite DB）

> 檔案：`apps/api/test/f117-dept-ratio-director-filter.e2e-spec.ts`。沿用 `f081-f085-f089-rollback.e2e-spec.ts` 之 app bootstrap（in-memory better-sqlite3、`AuthModule` + `AssignmentListModule` + `AssignmentStageModule`、`ThrottlerModule`、`HttpExceptionFilter`）與 `apps/api/test/fixtures/{users,ob-emphire}.fixture.ts` builder。所有帳號 / 部門 / 處長皆為測試自建 fixture，不依賴外部 MSSQL 或 seed.ts。

### TS-F117-INT-001：GET ?requireDirector=true → 三分類正確回應（director 角色）

- **關聯需求**：F117 AC-1 / AC-3 / AC-8 / §5.1
- **前置條件**：Fixture 規範表全 5 部門
- **步驟**：`director` 登入 → `GET /api/v1/assignment/ratios/dept/:listNo?requireDirector=true`
- **預期結果**：HTTP 200；回傳陣列僅含 XTA0（editable）、XTB0（locked）、XTE0（editable，directorName=較早到職者）；`hiddenNoDirectorCount === 2`（XTC0 + XTD0）；`total === 80`（60+40+20 之孤兒/可編輯加總，需依實際 fixture 數值核對）

### TS-F117-INT-002：PUT 孤兒保留全流程 — 未送孤兒列 payload → DB 持久化仍含孤兒列，HTTP 200

- **關聯需求**：F117 AC-3 / AC-4 / BR-4（★核心，需真實 DB round-trip 驗證，非 mock）
- **步驟**：PUT payload 僅含有處長部門（XTA0, XTE0），總和連同孤兒 XTB0 應為 100
- **預期結果**：HTTP 200；查詢 DB `ob_dept_pct WHERE list_no=...` 仍含 XTB0（ration=40，未被 DELETE 語意抹除）；`assignment_audit_log.after_value` 含 XTB0

### TS-F117-INT-003：PUT 無處長新配置 → 422 RATIO_DEPT_DIRECTOR_REQUIRED

- **關聯需求**：F117 AC-6 / BR-6
- **步驟**：PUT payload 對 XTC0（無處長、無既有 ration）配置 ration=10
- **預期結果**：HTTP 422；`res.body.error === 'RATIO_DEPT_DIRECTOR_REQUIRED'`（**扁平**信封 `{error:'CODE',message}`，沿用 §二引言所述 `f081-f085-f089-rollback.e2e-spec.ts` 慣例，非 `error-handling.md`/`F117-dept-ratio.contract.ts` 敘述性的巢狀 `{error:{code,...}}`——兩者矛盾之裁決見 `risks-and-gaps.md` R-F117-04）；DB 未變更（transaction 未提交）

### TS-F117-INT-004：section_chief 角色 → GET/PUT 403 AUTH_FORBIDDEN（AC-9 回歸）

- **關聯需求**：F117 AC-9（沿用 F079 AC-8，非新行為，作為 regression 錨點）
- **預期結果**：HTTP 403；`error.code === 'AUTH_FORBIDDEN'`

### TS-F117-INT-005：admin 角色等價於 director（BR-7「admin OR business_role=director」）

- **關聯需求**：F079 BR-7（母流程），F117 未變更此語意
- **預期結果**：`admin` 帳號呼叫 GET/PUT `requireDirector=true` 行為與 `director` 完全相同

### TS-F117-INT-006：GET 不帶 requireDirector → 回應與實作前完全一致（AC-10 回歸，實際 HTTP round-trip）

- **關聯需求**：F117 AC-10 / BR-8
- **預期結果**：陣列包含全部 5 部門（不因處長狀態過濾）；`hiddenNoDirectorCount === 0`

---

## 三、前端 Component 測試（RTL）

> 檔案：`apps/web/src/pages/assignment/__tests__/dept-ratio-form.test.tsx`（表格渲染邏輯）+ `dept-ratio-config-page.test.tsx`（頁面層角色/空狀態）。沿用既有 `vi.mock('@/api/assignment-stage')` + `buildGetResponse()` 慣例，擴充其欄位以支援 `hasActiveDirector` / `isRatioEditable` / `hiddenNoDirectorCount`。
>
> **Test-id 對照說明**：新元素（孤兒鎖定列 / 已隱藏資訊列 / 空狀態 / 無處長徽章）採用 prototype `29a-dept-ratio-config.html` 明訂之 `data-testid`；既有元素（Sum Banner／儲存鈕）沿用既有 F079 測試已建立之 test-id（`dept-ratio-sum-banner` / `btn-save-dept-ratio`），因該互動行為未變更、僅擴充其加總組成，重新命名屬不必要之破壞性變更。

### TS-F117-FE-001：孤兒列 ration 輸入框 disabled，且不同於一般 disabled 樣式（`locked-orphan`）

- **關聯需求**：F117 AC-3 / §7
- **預期結果**：`isRatioEditable: false` 且 `ration > 0` 的列渲染 `data-testid="ration-input-locked"` 且該 input 為 `disabled`

### TS-F117-FE-002：孤兒列顯示「無在職處長」徽章（與「已下線」徽章視覺可區分，二者可並存）

- **關聯需求**：F117 AC-3 / BR-10 / A-5
- **預期結果**：`data-testid="no-active-director-badge"` 存在；若同時 `isActive:false`，`dept-inactive-badge-{id}`（既有）亦存在，兩者不互斥

### TS-F117-FE-003：孤兒列之操作欄不渲染任何寫入動作（AC-4）

- **關聯需求**：F117 AC-4
- **預期結果**：孤兒列所在 `<tr>` 內查無「清空」或任何寫入類 button

### TS-F117-FE-004：加總涵蓋鎖定列（AC-5），Sum Banner 顯示加總組成

- **關聯需求**：F117 AC-5
- **預期結果**：`dept-ratio-sum-banner` 之加總值 = 可編輯列 + 孤兒鎖定列 ration 總和（不含隱藏之無關部門）

### TS-F117-FE-005：`hiddenNoDirectorCount > 0` → 資訊列顯示；`= 0` → 不顯示

- **關聯需求**：F117 AC-8
- **預期結果**：`data-testid="hidden-depts-notice"` 依 `hiddenNoDirectorCount` 條件渲染，且文案含該數字

### TS-F117-FE-006：可編輯部門數 = 0 → 空狀態文案，「儲存」與「推進」皆停用（AC-7）

- **關聯需求**：F117 AC-7（v1.1：儲存亦停用）
- **預期結果**：`data-testid="no-active-director-empty-state"` 顯示；`btn-save-dept-ratio` 與 `btn-advance-personnel-ratio` 皆 disabled 或不渲染；文案不得含「目前無在職部門可設定」舊字串（誤導為同步異常）

### TS-F117-FE-007：可編輯部門數 = 0 但存在孤兒鎖定列 → 空狀態與鎖定列並存（AC-7 末句）

- **關聯需求**：F117 AC-7
- **預期結果**：空狀態顯示的同時，孤兒鎖定列仍依 AC-3 顯示於表格（不因空狀態互斥而消失）

### TS-F117-FE-008：頁面層 — 可編輯部門數 = 0 時「儲存並推進」按鈕 disabled（DeptRatioConfigPage）

- **關聯需求**：F117 AC-7
- **預期結果**：`btn-advance-personnel-ratio` 存在但 `disabled`，或 `queryByTestId` 為 null（依實作選擇，二擇一皆須明確可測）

---

## 四、E2E Fidelity 測試（Playwright）

> 檔案：`e2e/tests/fidelity-f117-dept-ratio.spec.ts`。針對「即使不知道 dev DB 實際存在哪個 list_no」仍可決定性驗證前端對 spec 的忠實度，採用 Playwright `page.route()` 攔截 GET/PUT `/api/v1/assignment/ratios/dept/**`，以 F117 spec 的 response 範例與 prototype 29a 之 6 個 Demo 場景（`all_director` / `hidden` / `orphan` / `orphan_inactive` / `empty` / `empty_orphan`）逐一供應固定回應，同時仍對**真實運行中的前端**（`npm run web:dev` 或 docker `cdmp-web`）執行導覽、點擊、斷言 DOM——因此仍能捕捉建置 / 路由 / proxy 層級的漂移，只是資料層以攔截取代真實 DB round-trip。此為刻意設計選擇，理由與已知限制記錄於 `risks-and-gaps.md`「F117 E2E 資料策略」一節。

### TS-F117-E2E-001：三分類渲染（`orphan` 場景，對照 prototype demo③）

- **Given** GET 回應含 1 個可編輯部門 + 1 個孤兒鎖定部門 + 1 個已隱藏無關部門
- **Then** 表格僅顯示 2 列（可編輯 + 孤兒）；孤兒列 `data-testid=ration-input-locked` 為 disabled；`hidden-depts-notice` 顯示「有 1 個部門因目前無在職處長而未列出」

### TS-F117-E2E-002：孤兒＋已下線同列並存（對照 prototype demo④，BR-10）

- **Then** 同一列同時顯示「已下線」徽章與「無在職處長」徽章，二者可區分（不同色系：灰 vs 琥珀）

### TS-F117-E2E-003：空狀態（對照 prototype demo⑤）

- **Then** `no-active-director-empty-state` 顯示；文案不含「資料同步異常」相關誤導字眼；儲存/推進按鈕 disabled 或不可見

### TS-F117-E2E-004：空狀態＋孤兒並存（對照 prototype demo⑥，AC-7 末句）

- **Then** 空狀態與孤兒鎖定列同時顯示於畫面

### TS-F117-E2E-005：處長角色（`admin`／`director` 等價）Sidebar／Header 導覽路徑與 F079 既有頁一致（無新增/移除項目）

- **關聯需求**：CLAUDE.md 導覽層級 fidelity 規則；F117 未變更導覽層級
- **Then** Sidebar「客戶名單分派 → 名單定義」高亮路徑與既有 F079 頁面相同；Header breadcrumb 顯示「名單定義 › 部門比例設定」

---

## 五、Mutation / Metric 對應

| Ring 元件 | 範圍 | 門檻 |
|---|---|---|
| Stryker（`apps/api/stryker.conf.json`）| `dept-ratio.service.ts`（F117 新增之 `computeActiveDirectorMap` + PUT 孤兒保留分支為主要覆蓋標的）| break 70 / low 75 / high 90 |
| dependency-cruiser（`apps/api/.dependency-cruiser.cjs` / `apps/web/.dependency-cruiser.cjs`）| `src/`（no-circular error, no-orphans warn）| error on circular |
| ESLint 複雜度 gate（`apps/api/eslint.ring.config.cjs`）| `dept-ratio.service.ts` / `dept-ratio.controller.ts` | complexity ≤10 / max-lines-per-function ≤80 / max-depth ≤4 / max-lines ≤400 |
| Coverage gate | `dept-ratio.service.ts` / `dept-ratio.controller.ts`（BE）、`dept-ratio-form.tsx` / `dept-ratio-config-page.tsx`（FE）| lines/functions ≥80%、branches ≥75% |

---

## 對應總表（AC → 測試場景）

| AC | 測試場景 |
|---|---|
| AC-1 | TS-F117-BE-001/002, TS-F117-INT-001, TS-F117-E2E-001 |
| AC-2 | TS-F117-BE-004/005 |
| AC-3 | TS-F117-BE-003/008, TS-F117-INT-002, TS-F117-FE-001/002/007, TS-F117-E2E-001 |
| AC-4 | TS-F117-BE-008/009/012, TS-F117-INT-002, TS-F117-FE-003 |
| AC-5 | TS-F117-BE-011, TS-F117-FE-004 |
| AC-6 | TS-F117-BE-010, TS-F117-INT-003 |
| AC-7 | TS-F117-FE-006/007/008, TS-F117-E2E-003/004 |
| AC-8 | TS-F117-FE-005, TS-F117-INT-001, TS-F117-E2E-001 |
| AC-9 | TS-F117-INT-004（regression 錨點）|
| AC-10 | TS-F117-BE-007, TS-F117-INT-005/006（regression 錨點）|
