---
type: test-design-feature
feature_id: F118
feature_name: 從上月複製名單顯示「已複製過」提示
priority: P1
related_spec: /docs/specs/features/F118-copy-from-prev-month-duplicate-indicator.md
related_spec_parent: /docs/specs/features/F050-create-list-definition.md
related_architecture: /docs/specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md
spec_version: "1.1"
covers:
  - F118
  - US-181
date: 2026-08-04
last_updated: 2026-08-04
---

# F118：從上月複製名單顯示「已複製過」提示 — 測試設計

> 本文件為 F118 首次建立的 test spec。判定機制採**語意等價**（方案 b，F118 §12.1 D-1）——
> 「已複製過」= `checkCopyDuplicates` 與儲存端 `findActiveConditionDuplicate` **共用同一
> 正規化函式** `normalizeConditionPayload`（BR-1 / I-F118-SINGLE-NORMALIZE-01）。因此本文件
> 的核心測試不是「重新驗證正規化規則本身」（已由既有 `derive-backward-compat.spec.ts` 之
> `normalizeConditionPayload` 測試群組涵蓋），而是**驗證 AC-2 雙向一致性這個結構性不變式**：
> 判定為 false 的名單原樣儲存不得 422；判定為 true 的名單原樣儲存必定 422，且
> `conflictListNo === copiedToListNo`。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F118 spec](../../specs/features/F118-copy-from-prev-month-duplicate-indicator.md) + [F050 spec](../../specs/features/F050-create-list-definition.md) §4 AC-5 / §5 / BR-14 + [AD-E07-48](../../specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md) §3.2 / §5 + [contract](../../specs/contracts/F118-copy-duplicate-check.contract.ts) |
| QA / Tester | 本文件 + F118 spec §4 / §10 + `error-handling.md#assignment-list-errors`（`LIST_NO_DUPLICATE`） |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Unit + Integration（Vitest，in-memory SQLite，真實 `AssignmentListService`，不 mock repo）+ 後端 Route/RBAC（Supertest + mocked Service，沿用既有 `assignment-list.controller.spec.ts` 慣例）+ 後端 E2E（真實 HTTP + Guard + SQLite DB，沿用 `f117-dept-ratio-director-filter.e2e-spec.ts` 慣例）+ 前端 Component（RTL）+ 前端 Page 整合（RTL）+ E2E Fidelity（Playwright，對照 prototype） |
| 測試檔案（後端 Unit/Integration） | `apps/api/src/modules/assignment-list/__tests__/f118-copy-duplicate-check.spec.ts`（新建，沿用 `create-list-v2.1.spec.ts` 之 `buildEnv` pattern：real `AssignmentListService` + in-memory `better-sqlite3`） |
| 測試檔案（後端 Route/RBAC） | `apps/api/src/modules/assignment-list/__tests__/assignment-list.controller.spec.ts`（追加 `describe('TC-F118 ...')` 群組，沿用既有 mocked-service + real-guard-chain 慣例） |
| 測試檔案（後端 E2E） | `apps/api/test/f118-copy-duplicate-check.e2e-spec.ts`（新建，沿用 `f117-dept-ratio-director-filter.e2e-spec.ts` 之 app bootstrap：real `AuthModule` + `AssignmentListModule`、`apps/api/test/fixtures/users.fixture.ts`） |
| 測試檔案（前端 Component） | `apps/web/src/pages/assignment/_components/__tests__/copy-from-prev-month-modal.test.tsx`（追加 `describe('F118 ...')`） |
| 測試檔案（前端 API client 契約） | `apps/web/src/api/__tests__/assignment-list-copy-duplicate-check.test.ts`（2026-08-04 dispute #4 裁決新增，沿用 `sampling-preview-clients.test.ts` 慣例：僅 mock `../client`，真實執行 `checkCopyDuplicates` 函式本體，驗證 GET URL / params 形狀） |
| 測試檔案（前端 Page） | `apps/web/src/pages/assignment/__tests__/list-create-draft-page.test.tsx`（追加 `describe('F118 ...')`，涵蓋 AC-5 / AC-10 / AC-11 之頁面層佈線） |
| 測試檔案（E2E Fidelity） | `e2e/tests/fidelity-f118-copy-duplicate.spec.ts`（新建，Playwright，`page.route()` 攔截，沿用 F117 fidelity 之資料策略選擇，見 `risks-and-gaps.md`） |
| 契約 | [F118-copy-duplicate-check.contract.ts](../../specs/contracts/F118-copy-duplicate-check.contract.ts) |
| Stryker mutate 範圍 | `assignment-list.service.ts`（`checkCopyDuplicates` 新增方法 + `findActiveConditionDuplicate` 的 `ORDER BY` 新增行） |

**本文件新定義之 test-id（prototype `27a-list-create-draft.html` 未以 `data-testid` 標註處，
由本文件裁定，前端實作須依此命名）**：`dup-confirm-modal` / `dup-confirm-target-list-no` /
`btn-confirm-dup-copy` / `btn-cancel-dup-copy` / `btn-close-dup-reminder`。prototype 已含
`data-testid` 者（`already-copied-badge`、`copy-candidate-row` 之 `data-already-copied` /
`data-copied-to-list-no`、`dup-reminder-banner`）**必須逐字沿用**，不得另創同義詞。

---

## 一、後端 Unit / Integration 測試（`AssignmentListService.checkCopyDuplicates`，真實 SQLite）

> 檔案：`f118-copy-duplicate-check.spec.ts`。沿用 `create-list-v2.1.spec.ts` 之 `buildEnv()`
> （real `AssignmentListService` + in-memory `better-sqlite3`，`synchronize: true`）。候選 /
> 目標名單優先透過真實 `service.createList(dto, actor, workYm)` 建立（而非直接 repo.save），
> 使測試同時驗證「候選資料形狀與 createList 產出一致」。

### TS-F118-BE-001（★核心）：上月 3 筆候選，本月 1 筆等價 → 該筆 alreadyCopied=true 且 copiedToListNo 正確，其餘 2 筆 false

- **關聯需求**：F118 AC-1 / §10 案例 1
- **步驟**：`createList` 建立 prevYm 3 筆（不同條件）；`createList` 建立 currentYm 1 筆，條件與候選 A 相同
- **預期結果**：`checkCopyDuplicates(prevYm, currentYm)` 回傳陣列含 3 筆；候選 A 的 `alreadyCopied === true` 且 `copiedToListNo` 為 currentYm 該筆 `listNo`；候選 B / C 皆 `alreadyCopied === false && copiedToListNo === null`

### TS-F118-BE-002（★核心 / AC-2 正向）：判定為 false 之名單 → 原樣 createList 不得 422

- **關聯需求**：F118 AC-2 / BR-1（★單一判定來源之結構性保證）
- **步驟**：`checkCopyDuplicates` 判定候選 B 為 `alreadyCopied === false`；以候選 B 之 `conditionPayload` + `cardType` 原樣呼叫 `env.service.createList(...)`（`workYm = currentYm`）
- **預期結果**：`createList` **正常回傳**（不拋 `UnprocessableEntityException`）

### TS-F118-BE-003（★核心 / AC-2 反向）：判定為 true 之名單 → 原樣 createList 必定 422，且 details.conflictListNo === copiedToListNo

- **關聯需求**：F118 AC-2 / AC-4 / BR-1（★結構性保證核心）
- **步驟**：`checkCopyDuplicates` 判定候選 A 為 `alreadyCopied === true`，取得 `copiedToListNo`；以候選 A 之 `conditionPayload` + `cardType` 原樣呼叫 `createList`
- **預期結果**：拋 `UnprocessableEntityException`；`e.getResponse().error === ERROR_CODES.LIST_NO_DUPLICATE`；`e.getResponse().details.conflictListNo === copiedToListNo`（與判定結果**完全相同**，非僅同存在）

### TS-F118-BE-004：card_type 不同但條件相同 → alreadyCopied=false（BR-7）

- **步驟**：候選 `cardType='S5'`；本月等價條件但 `cardType='S6'`
- **預期結果**：`alreadyCopied === false`

### TS-F118-BE-005：card_type 兩邊皆 NULL 且條件相同 → alreadyCopied=true（BR-7）

- **步驟**：候選與本月名單皆不帶 `cardType`（`null`）
- **預期結果**：`alreadyCopied === true`

### TS-F118-BE-006：本月等價名單 status != 'active' → alreadyCopied=false（BR-8）

- **步驟**：`createList` 建立本月等價名單後，`listRepo.update` 改 `status = 'disabled'`
- **預期結果**：`alreadyCopied === false && copiedToListNo === null`

### TS-F118-BE-007：條件僅差 system-fixed 欄位（best_case）→ 仍判為等價（BR-5）

- **步驟**：候選 `conditionPayload` 不含 `best_case`；本月名單經 `createList` 後（`injectSystemFixedConditions` 強制注入 `best_case`）條件集為候選 + `best_case`
- **預期結果**：`alreadyCopied === true`（`normalizeConditionPayload` 排除 system-fixed 欄位後兩者簽章相同）

### TS-F118-BE-008：簽章為空（無有效條件）→ alreadyCopied=false（AC-10）

- **前置條件**：候選 `conditionPayload` 僅含 system-fixed 欄位（`best_case`），非 `null`（仍通過 BR-9 候選過濾 `condition_payload IS NOT NULL`）
- **步驟**：直接以 `listRepo.save()` 建立此候選列（繞過 `createList` 的最低條件數驗證，此為 DB 層邊界案例而非使用者可由前端達成之路徑）
- **預期結果**：`alreadyCopied === false`（`normalizeConditionPayload` 回傳 `''`，對齊 `findActiveConditionDuplicate` 於 `inputSig===''` 時回 `null` 之既有行為）

### TS-F118-BE-009（AC-7 / BR-3 ★核心）：N+1 防範 — 候選數 N=3 vs N=20，查詢次數不隨 N 增加

- **關聯需求**：F118 AC-7 / BR-3 / I-F118-CONST-QUERY-01
- **步驟**：`vi.spyOn(env.listRepo, 'find')`；分別以 N=3、N=20 筆候選呼叫 `checkCopyDuplicates`，比較兩次呼叫間 `listRepo.find` 的呼叫次數
- **預期結果**：兩次呼叫次數**相等**（常數，不隨候選數線性增加）；且呼叫次數為個位數（≤ 5，防止「查詢次數雖固定但仍隱藏一個大於預期的常數」之弱斷言，粗略對齊 spec §5.1.1 所述之常數 3 次）

### TS-F118-BE-010：`currentYm` 為使用者所選作業月（≠ 後端系統當月）→ 判定基準正確（AC-5）

- **關聯需求**：F118 AC-5
- **步驟**：`OVERRIDE_CURRENT_WORK_YM` 或系統當月設為與 `currentYm` **不同**之月份；`checkCopyDuplicates(prevYm, currentYm)` 帶入之 `currentYm` 為呼叫端指定值
- **預期結果**：判定完全依呼叫端傳入之 `currentYm` 執行，不受後端系統當月影響（方法簽章本身即為此不變式的結構性保證：僅接受兩個字串參數，無任何系統時鐘查詢）

### TS-F118-BE-011（回歸 / §5.3 R-2）：`findActiveConditionDuplicate` 多筆歷史等價名單 → `conflictListNo` 決定性為 `list_no` 最小者

- **關聯需求**：AD-E07-48 §5.3 / OQ-F118-02 / I-F118-CONFLICT-ORDER-01；本 AD 對既有已上線程式碼的**唯一修改點**，需回歸測試
- **步驟**：以 `listRepo.save()` 直接建立 2 筆同月、同條件、`status='active'` 之「歷史異常」等價名單（`list_no` 刻意以非插入順序命名，例如先建 `...002` 再建 `...001`，模擬非決定性 DB 隱式順序的情境）；呼叫既有 `createList`（觸發 `findActiveConditionDuplicate`）建立第 3 筆同條件名單
- **預期結果**：422 `LIST_NO_DUPLICATE`，`details.conflictListNo` 恆為 **`list_no` 字典序最小者**（`...001`），與插入順序無關

---

## 二、後端 Route / RBAC 測試（Supertest + mocked Service，真實 Guard chain）

> 檔案：`assignment-list.controller.spec.ts` 追加 `describe('TC-F118 ...')` 群組，沿用既有
> `serviceMock` + `overrideGuard(AuthGuard)` 慣例（真實 RBAC guard chain 未被 override）。

### TS-F118-RBAC-001：GET copy-duplicate-check → 未登入 401 AUTH_TOKEN_MISSING

### TS-F118-RBAC-002：GET copy-duplicate-check → plain user（businessRole=null）403 E07_ROLE_NOT_ASSIGNED

### TS-F118-RBAC-003：GET copy-duplicate-check → section_chief 200（唯讀端點，非寫入，沿用既有 DirectorOrSectionChiefGuard 語意）

### TS-F118-RBAC-004：GET copy-duplicate-check → director / admin 200

### TS-F118-RBAC-005（★核心 / 路由順序）：GET copy-duplicate-check 不被任何 `:listNo` 動態路由吞掉

- **關聯需求**：AD-E07-48 §5.1「必須宣告於任何 `@Get(':listNo...')` 動態路由之前」
- **步驟**：`director` 登入後 `GET /api/v1/assignment/lists/copy-duplicate-check?prevYm=202604&currentYm=202605`
- **預期結果**：`serviceMock.checkCopyDuplicates` 被呼叫且參數為 `('202604', '202605')`（而非任何以 `listNo='copy-duplicate-check'` 為參數呼叫其他 service 方法的痕跡）；回應狀態非 404 / 非因誤路由導致的非預期 5xx

### TS-F118-RBAC-006：GET 不受 FeatureFlag（`ENABLE_E07_REFACTOR_PHASE3`）影響（唯讀端點，沿用既有 GET /lists 慣例）

### TS-F118-RBAC-007：缺 `prevYm` 或 `currentYm` / 格式非 6 碼數字 → 422 VALIDATION_ERROR

- **關聯需求**：F118 §5.1「作業月參數必填」；422 VALIDATION_ERROR 為本 controller 既有 `ym` 查詢參數之既定慣例（見 TC-YM 群組），本端點沿用相同慣例而非另創錯誤碼

---

## 三、後端 E2E 測試（真實 HTTP + Guard + in-memory SQLite DB）

> 檔案：`apps/api/test/f118-copy-duplicate-check.e2e-spec.ts`。沿用
> `f117-dept-ratio-director-filter.e2e-spec.ts` 之 app bootstrap（real `AuthModule` +
> `AssignmentListModule`、`apps/api/test/fixtures/users.fixture.ts`、真實
> `POST /api/v1/auth/login`）。

### TS-F118-E2E-001：director 登入 → 完整 GET round-trip，回應形狀符合契約

- **步驟**：seed prevYm 2 筆候選（1 筆等價、1 筆不等價）+ currentYm 1 筆等價名單；`director` 登入後呼叫端點
- **預期結果**：HTTP 200；`res.body.prevYm` / `res.body.currentYm` 回傳呼叫端傳入值；`res.body.items` 長度與涵蓋內容符合 BR-9 候選過濾（`status='active' AND condition_payload IS NOT NULL`）

### TS-F118-E2E-002：section_chief 登入 → 200（唯讀角色平權，真實 Guard round-trip）

### TS-F118-E2E-003：admin 等價於 director（BR-7 母流程「admin OR business_role=director」，F118 未變更此語意）

---

## 四、前端 Component 測試（RTL，`CopyFromPrevMonthModal`）

> 檔案：`copy-from-prev-month-modal.test.tsx` 追加 `describe('F118 — 已複製過提示')`。
> 新 prop：`duplicateItems?: Array<{ listNo: string; alreadyCopied: boolean; copiedToListNo: string | null }>`
> （未傳入 / `undefined` → AC-10 降級，行為與 F118 實作前完全相同，既有測試案例不變）。

### TS-F118-FE-001：`duplicateItems` 含 `alreadyCopied=true` 之候選 → 該 row 顯示 `already-copied-badge`，內容含目標編號

- **關聯需求**：AC-1 / AC-4；prototype `27a-list-create-draft.html` L1200 `data-testid="already-copied-badge"`

### TS-F118-FE-002：未複製過之候選 → 不渲染 `already-copied-badge`（AC-1，訊號雜訊比裁定 D-2）

### TS-F118-FE-003：`copy-candidate-row`（即既有 `copy-row-{listNo}`）帶 `data-already-copied` / `data-copied-to-list-no` 屬性

- **關聯需求**：prototype L1204-1206；純資料屬性，供 fidelity 測試對照

### TS-F118-FE-004：目標編號為純文字，非連結（AC-4 / D-8）

- **預期結果**：`already-copied-badge` 內文含 `copiedToListNo`；該區塊內查無 `<a>` 標籤或任何導航型互動元素

### TS-F118-FE-005（★核心 / AC-3）：點擊已複製過候選之「使用此名單」→ 觸發二次確認彈窗，`onCopy` **尚未**被呼叫

- **步驟**：`fireEvent.click(getByTestId('btn-use-{listNo}'))`（該 listNo 之 `alreadyCopied === true`）
- **預期結果**：`dup-confirm-modal` 出現；`dup-confirm-target-list-no` 內容為 `copiedToListNo`；`onCopy` 尚未被呼叫

### TS-F118-FE-006：確認彈窗按「取消」→ 彈窗關閉，`onCopy` 未被呼叫

### TS-F118-FE-007：確認彈窗按「仍要以此名單為基礎建立」→ `onCopy` 被呼叫且帶入該 list，彈窗關閉

### TS-F118-FE-008：未複製過候選之「使用此名單」→ 不觸發確認彈窗，`onCopy` **立即**被呼叫（AC-3 末句 / 既有行為不變）

- **對應**：既有測試「點 row『使用此名單』→ onCopy 帶入該 list」（未傳入 `duplicateItems` 之既有 case）必須不受影響（回歸）

### TS-F118-FE-009（AC-10 降級）：`duplicateItems` 未傳入 → 全部候選皆不顯示徽章，任何候選點擊皆直接 `onCopy`（不觸發確認彈窗）

- **關聯需求**：AC-10；即使某候選的 `listNo` 客觀上「應該」是重複，只要頁面未能取得判定資料，Modal 行為與 F118 實作前完全相同

---

## 五、前端 Page 整合測試（RTL，`ListCreateDraftPage`）

> 檔案：`list-create-draft-page.test.tsx` 追加 `describe('F118 — 已複製過提示（頁面整合）')`。
> 沿用既有 `vi.mock('@/api/assignment-list')` + `mockedListLists` 慣例，新增
> `mockedCheckCopyDuplicates = vi.mocked(assignmentListApi.checkCopyDuplicates)`。

### TS-F118-PAGE-001（AC-5）：開啟複製 Modal → `checkCopyDuplicates` 以 `{ prevYm, currentYm }` 呼又，`currentYm` 為頁面作業月（非系統當月）

- **對應**：既有 F097 測試「複製上月以『作業月的上月』查詢（?ym=2026-06 → listLists ym=202605）」之姊妹案例
- **步驟**：`renderPage('/assignment/list-definitions/new?ym=2026-06')` → 開啟複製 Modal
- **預期結果**：`mockedCheckCopyDuplicates` 被呼叫，參數 `{ prevYm: '202605', currentYm: '202606' }`

### TS-F118-PAGE-002（★核心 / AC-11）：確認採用已複製過之來源 → 表單顯示 `dup-reminder-banner`，內容含目標編號

- **步驟**：`mockedCheckCopyDuplicates` 回傳含 1 筆 `alreadyCopied=true`；開啟 Modal → 點擊該候選「使用此名單」→ 確認彈窗按「仍要使用」
- **預期結果**：`dup-reminder-banner` 出現且 `textContent` 含 `copiedToListNo`

### TS-F118-PAGE-003：`dup-reminder-banner` 可關閉，關閉後不阻擋任何操作（AC-11 末句）

- **步驟**：延續 PAGE-002 情境，點擊 `btn-close-dup-reminder`
- **預期結果**：banner 自 DOM 消失；`btn-save-draft` 仍可正常點擊（不 disabled）

### TS-F118-PAGE-004：確認採用**未**複製過之來源 → 不顯示 `dup-reminder-banner`

### TS-F118-PAGE-005（AC-10 降級 ★核心）：`checkCopyDuplicates` rejects → Modal 仍正常列出候選、無錯誤訊息、複製流程不受阻擋

- **步驟**：`mockedCheckCopyDuplicates.mockRejectedValue(new Error('network'))`；開啟 Modal → 選擇任一候選 → 完成複製
- **預期結果**：候選正常列出（`copy-row-{listNo}` 存在）；畫面無新增之錯誤 banner；複製後表單欄位正常帶入（既有 `copy-applied-banner` 出現）；`dup-reminder-banner` 不出現

---

## 六、E2E Fidelity 測試（Playwright）

> 檔案：`e2e/tests/fidelity-f118-copy-duplicate.spec.ts`。沿用 `fidelity-f117-dept-ratio.spec.ts`
> 之資料策略：`page.route()` 攔截 `GET **/assignment/lists**`（既有候選）與
> `GET **/copy-duplicate-check**`（F118 判定），對真實運行中的前端執行導覽 / 點擊 / 斷言 DOM。
> 後端業務規則（BR-1~BR-9）之真實正確性由 §一 ~ §三之後端測試涵蓋，不依賴本檔。

### TS-F118-FID-001：已複製過候選顯示徽章（對照 prototype demo，AC-1 / AC-4）

- **Then** 候選列顯示 `already-copied-badge`，內文含目標名單編號；未複製過候選不顯示任何等價徽章

### TS-F118-FID-002：點擊已複製過候選 →二次確認彈窗 → 確認 → 表單出現 AC-11 提醒列

- **Then** `dup-confirm-modal` 出現 → 點 `btn-confirm-dup-copy` → 表單 `dup-reminder-banner` 顯示

### TS-F118-FID-003：判定端點回應失敗（AC-10）→ Modal 正常列出候選，無錯誤提示

- **Given** `page.route()` 對 `**/copy-duplicate-check**` 回傳 500
- **Then** Modal 候選列表正常渲染；不顯示任何徽章；不顯示錯誤 toast/banner

### TS-F118-FID-004：Sidebar／Header 導覽路徑與既有 F050 建立草稿頁一致（未變更導覽層級，CLAUDE.md 規則）

---

## 七、Mutation / Metric 對應

| Ring 元件 | 範圍 | 門檻 |
|---|---|---|
| Stryker（`apps/api/stryker.conf.json`）| `assignment-list.service.ts`（`checkCopyDuplicates` 新增方法 + `findActiveConditionDuplicate` 的 `ORDER BY` 新增行為主要覆蓋標的；dry-run test 集擴大為既有 19 個 SQLite unit spec + 本輪新增之 `f118-copy-duplicate-check.spec.ts`，見 `vitest.mutation.config.ts` 註記）| break 70 / low 75 / high 90（同 F117 門檻） |
| dependency-cruiser（`apps/api/.dependency-cruiser.cjs`）| `src/`（no-circular error, no-orphans warn）| error on circular；F118 未新增模組邊界，沿用既有設定 |
| ESLint 複雜度 gate（`apps/api/eslint.ring.config.cjs`）| `assignment-list.service.ts` / `assignment-list.controller.ts`（新增獨立 `files` 區塊，`max-lines` 門檻另計，見下方風險說明）| complexity ≤10 / max-lines-per-function ≤80 / max-depth ≤4（per-function 規則，即使檔案本身已大，仍能有意義地檢查新增之 `checkCopyDuplicates`）；執行載體為 `scripts/gate-complexity-diff.cjs`（非直接呼叫 `eslint`），比對 `eslint-baseline.f118.json`（F118 開工前既有 14 項違規之基準線）僅對**新違規**回傳非 0，見 `risks-and-gaps.md` R-F118-04 |
| Coverage gate（後端） | `assignment-list.service.ts` + `.controller.ts`（`gate:coverage:f118`，`--coverage.include` 鎖定此二檔；測試檔清單為該模組全部既有 20 個 SQLite unit spec，非僅新增之 1 個，見 `risks-and-gaps.md` R-F118-06） | lines/functions ≥80%、branches ≥75% |
| Coverage gate（前端） | `copy-from-prev-month-modal.tsx`（`apps/web` `gate:coverage:f118`；**不**含 `src/api/assignment-list.ts` 整檔，理由見 `risks-and-gaps.md` R-F118-07） | lines/functions ≥80%、branches ≥75%；`checkCopyDuplicates` client 之契約另由 `src/api/__tests__/assignment-list-copy-duplicate-check.test.ts` 執行驗證（不計入本檔案級門檻） |

**`max-lines` 門檻特別說明**：`assignment-list.service.ts` 於 F118 開工前已達 1580 行（既有、非本 feature 造成之技術債，遠早於 F118 範圍）。比照 `ring-setup-patterns` memory 之既定原則（「不得為了讓 gate 通過而悄悄調高門檻，須如實回報」），本 gate 對此檔案之 `max-lines` 門檻**不**沿用 F117 之 400（該值僅對 dept-ratio.service.ts 有意義），而是設為現況 + 合理增量（1650 行，容納 `checkCopyDuplicates` 新增之 ~50 行），使其仍能偵測「F118 是否讓檔案不成比例地繼續膨脹」，而非對既有債務重複告警。完整說明見 `risks-and-gaps.md`「F118」。

---

## 對應總表（AC → 測試場景）

| AC | 測試場景 |
|---|---|
| AC-1 | TS-F118-BE-001, TS-F118-FE-001/002/003, TS-F118-FID-001 |
| AC-2 | TS-F118-BE-002/003（★核心） |
| AC-3 | TS-F118-FE-005/006/007/008, TS-F118-FID-002 |
| AC-4 | TS-F118-BE-003, TS-F118-FE-001/004 |
| AC-5 | TS-F118-BE-010, TS-F118-PAGE-001 |
| AC-6 | （不引入快取；由 BR-6 之「每次呼叫皆重新查詢」設計本身保證，方法簽章不含任何快取層，無獨立可測之負向案例——見 `risks-and-gaps.md`） |
| AC-7 | TS-F118-BE-009（★核心） |
| AC-8 | 回歸：既有 `create-list-v2.1.spec.ts` / `list-create-draft-page.test.tsx`（lc.test#11 / #11b）不受影響（見驗證章節） |
| AC-9 | 回歸：既有 `lc.test#11`「舊格式名單不出現」不受影響 |
| AC-10 | TS-F118-BE-008, TS-F118-FE-009, TS-F118-PAGE-005, TS-F118-FID-003 |
| AC-11 | TS-F118-PAGE-002/003/004 |
| BR-4 / §5.3 R-2 | TS-F118-BE-011（回歸，既有程式碼行為收斂） |
| BR-9 / AC-9 | TS-F118-E2E-001（候選過濾契約） |
