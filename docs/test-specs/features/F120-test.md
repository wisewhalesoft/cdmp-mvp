---
type: test-design-feature
feature_id: F120
feature_name: Stage 0 試算頁「名單基礎預估數量總覽」區塊（按產品類別分組小計）
priority: P1
related_spec: /docs/specs/features/F120-stage0-list-estimate-overview.md
related_spec_parent: /docs/specs/features/F049-stage0-daily-estimate.md
related_story: /docs/stories/epics/E07-app-customer-list-assignment/US-184-M01-stage0-list-estimate-overview.md
related_architecture: /docs/specs/implementation-log/AD-E07-51-f120-list-estimate-overview.md
spec_version: "1.3"
covers:
  - F120
  - US-184
date: 2026-08-20
last_updated: 2026-08-20
---

# F120：Stage 0 試算頁「名單基礎預估數量總覽」區塊 — 測試設計

> **⚠️ 本輪範圍（team lead 指示，簡化 ring）**：本文件僅涵蓋**後端 vitest 單元／整合測試**與
> **前端 vitest Component 測試**。不建立 Playwright e2e fidelity、Stryker mutation、
> dependency-cruiser / ESLint 複雜度 metric gate；`ring-setup` skill 未被呼叫。
> §四／§五（Mutation / Metric / E2E）留白，記錄於 `risks-and-gaps.md` R-F120-01。
>
> 測試作者為 test-generator，**blind to implementation**：所有斷言僅源自
> [F120 spec v1.3](../../specs/features/F120-stage0-list-estimate-overview.md)、
> [US-184 v1.1](../../stories/epics/E07-app-customer-list-assignment/US-184-M01-stage0-list-estimate-overview.md)、
> [AD-E07-51 v1.2](../../specs/implementation-log/AD-E07-51-f120-list-estimate-overview.md) 與
> `prototypes/30-stage0-estimate.html`，未讀取任何 F120 production 程式碼。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F120 spec](../../specs/features/F120-stage0-list-estimate-overview.md) 全文 + [AD-E07-51](../../specs/implementation-log/AD-E07-51-f120-list-estimate-overview.md) §4/§6/§8 + [F049 spec](../../specs/features/F049-stage0-daily-estimate.md) §14~§22（既有基礎，不得分叉） |
| QA / Tester | 本文件 + F120 spec §4/§10/§11 |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Unit（Vitest，純函式，零 I/O）+ 後端 Integration（Vitest，in-memory better-sqlite3，真實 Service/DB）+ 後端 Route/RBAC（Vitest + Supertest，mock service）+ 前端 Component（Vitest + RTL） |
| 測試檔案（後端純函式） | `apps/api/src/modules/assignment-list/__tests__/stage0-list-group-resolve.f120.spec.ts` |
| 測試檔案（後端整合） | `apps/api/src/modules/assignment-list/__tests__/stage0-list-estimate-overview.service.f120.spec.ts` |
| 測試檔案（後端 Route/RBAC） | `apps/api/src/modules/assignment-list/__tests__/stage0-list-estimate-overview.controller.f120.spec.ts` |
| 測試檔案（前端 Component） | `apps/web/src/pages/assignment/__tests__/list-estimate-overview-section.f120.test.tsx` |
| Fixture 慣例 | 沿用既有 `stage0-dept-estimate.service.spec.ts`（`buildModule` / `seedList` / `ActorLike` / `vi.spyOn(service,'estimateListCount')` 模擬 fallback）與 `list-kanban-page.test.tsx`（`condition-decoder-fixtures.ts` 共用 decode fixture、`__resetConditionDecoderCache()`） |
| ⚠️ 前端元件路徑之判斷 | `ListEstimateOverviewSection` 元件與其檔案路徑（`_components/list-estimate-overview-section.tsx`）尚不存在，依 [AD-E07-51 §10](../../specs/implementation-log/AD-E07-51-f120-list-estimate-overview.md) 之建議命名撰寫（非強制契約）。若 tdd-implementation 採用不同路徑/檔名，屬合法的測試爭議，**請訊息通知 test-generator 調整 import**，不得自行修改測試。詳見 `risks-and-gaps.md` R-F120-02 |
| vitest 型別檢查提醒 | vitest（swc）不做型別檢查；實作完成後**必須**另跑 `cd apps/api && npx tsc --noEmit -p tsconfig.build.json` 與 `cd apps/web && npx tsc --noEmit`，否則型別錯誤要到 prod build 才會現形 |

---

## 一、後端純函式測試：`resolveListGroup()`（GROUP-RESOLVE）

> 檔案：`stage0-list-group-resolve.f120.spec.ts`。零 I/O，直接覆蓋 F120 spec §5.2 演算法之 6 個步驟
> 與 §10.2 邊界矩陣全部案例，並含 3 則原始碼層級 grep 反向斷言（TC-F120-E）。

### 測試案例（依 GROUP-RESOLVE 步驟編組）

| 案例群組 | 涵蓋內容 | 對應 |
|---|---|---|
| 步驟 1：payload 為空 | null / undefined / conditions 非陣列 / conditions=[] → unclassified | §5.2 步驟 1 |
| 步驟 2a/2b：prod_kind 條件之有無與多筆防禦 | 無 prod_kind 條件 → unclassified；多筆 prod_kind（防禦）→ last-wins | §5.2 步驟 2 |
| 步驟 3：fieldType 防禦 | fieldType≠categorical → unclassified | §5.2 步驟 3 |
| 步驟 4/5：文字運算子 | contains / not_contains / equals → unclassified | TC-184-05 |
| **TC-F120-B** | operator 缺漏 ≡ 顯式 `'in'`，兩者判定結果**相等** | AC-LIST-06b |
| 步驟 6a/6c：防禦 | values 非陣列 → unclassified；values=[] → unclassified | §5.2 步驟 6a/6c |
| **TC-F120-A** | values 重複值（`['01','01']`、三重複）去重後仍為單一代碼（非 multi）；`['01','1']`（不同字串）不視為重複 → multi（驗證精確字串相等去重，非數值正規化） | §5.2 步驟 6b/6d |
| 步驟 6d：單一代碼 | `['01']` → code '01'；未登錄代碼 `['09']` 判定不查白名單，仍回傳 code | TC-184-03 |
| 步驟 6e：多值 | `['01','02']`、`['01','02','03']` → multi | TC-184-04 |
| AC-LIST-06b 決定性 | 同一 payload 連續呼叫 5 次結果相同 | I-F120-01 之基礎 |
| 全函式特性 | 7 種代表性輸入之回傳值皆恰為 `code\|multi\|unclassified` 三型之一 | I-F120-01 依建構成立 |
| **TC-F120-E** | grep：不得出現 `.prod_kind` 屬性存取（I-F120-04）／不得自寫 `?? 'in'`（I-LISTOVW-OPERATOR-SINGLE-SOURCE-01）／須匯入 `resolveCategoricalOperator`／須為純函式（無 `@InjectRepository` / `typeorm` 匯入） | I-F120-04, I-LISTOVW-OPERATOR-SINGLE-SOURCE-01, I-LISTOVW-PURE-GROUP-RESOLVE-01 |

共 **30 案例**（含 `it.each` 之 7 個子案例）。

---

## 二、後端整合測試：`computeListEstimateOverview()`

> 檔案：`stage0-list-estimate-overview.service.f120.spec.ts`。真實 in-memory `better-sqlite3`，
> entities 含 `PooldataFieldOption`（seed `prod_kind` 01/02/03，`display_order` 皆 0，比照現行
> baseline seed 現況，見 spec §12 G-2）。

| # | 測試場景 | 對應 AC/TC/不變量 |
|---|---|---|
| 1 | 八筆名單涵蓋全部分組型態：正確歸類（單一代碼／重複值去重／operator 缺漏／孤兒代碼／多值／文字運算子／未設定／空值清單）、GROUP-ORDER 正確排序（01→03→09→MULTI→UNCLASSIFIED）、`02`（機車，無名單）分組完全不輸出、`lists[]` 依 listNo ASC | AC-LIST-06/06a/07；TC-184-03~06/13；TC-F120-A/B/C；BR-9 |
| 2 | G-2：全部 `display_order` 相同時，次鍵 `option_value ASC` 決定順序（01→02→03） | §5.3／§12 G-2 |
| 3 | F076 BR-4：`is_active=false` 之已登錄代碼仍視為已登錄（`displayOrder` 非 null，非降級為孤兒） | §5.3 第 1 段子句 |
| 4 | 顯示層契約：`groups[]` 陣列本身即為排序後結果（seed 寫入順序刻意顛倒仍回傳已排序陣列） | §6.1「顯示層不得重排」 |
| 5 | TC-184-13：5 筆涵蓋五種情境名單 → 跨分組 listNo 聯集=全集無重複；Σ listCount=totalListCount；Σ subtotalCount=totalEstimatedCount | AC-LIST-06a／I-F120-01／I-F120-02 |
| 6 | TC-184-14：42%（4200/10000 四捨五入） | AC-LIST-08／BR-8 |
| 7 | TC-184-15：totalEstimatedCount=0（全數 fallback 逾時）→ 所有分組 percent 皆 null | AC-LIST-08／BR-8 |
| 8 | **★§10.2 對照表**：分組小計=0 但總計>0 → percent 為數字 **0**（非 null，不得誤判為缺陷） | AC-LIST-08 兩情境對照 |
| 9 | BR-9：`listCount>0`、`subtotal=0` 之分組仍顯示（依名單數判定，非依小計） | BR-9／§12 G-6 |
| 10 | TC-184-08：fallback 逾時之名單仍列於分組（`estimatedCount=null`、`estimateUnavailable=true`），不計入小計/總計，仍計入名單數/名單總數，`warnings[]` 含對應 `STAGE0_LIST_ESTIMATE_PARTIAL` | AC-LIST-10／BR-7 |
| 11 | TC-184-07 穩態：`dept-estimate.orgMonthTotal === listOverview.totalEstimatedCount`（全數已物化） | AC-LIST-09／I-F120-03 |
| 12 | **★TC-184-07 過渡態**：兩端於同一組 mock 下 fallback，excluded 集合恆相等 → **無條件**嚴格相等（AD §4.5.1，不得寫成依 `unestimatedListCount` 之分支斷言） | I-F120-03／I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01 |
| 13 | `orgMonthTotal` 對處長角色亦為非 null 數字（F049 v2.1 §16.5.5：所有角色皆回傳全公司口徑） | I-F120-03 角色範圍 |
| 14 | TC-F120-D：director 與 section_chief 同 ym 呼叫 → listNo 聯集與 totalEstimatedCount 完全相同 | I-F120-05／BR-10 |
| 15 | `scope.listOverviewScoped` 恆為 false（director／section_chief 皆是） | §6.2 契約標記 |
| 16 | §6.3：section_chief 之 `getScopeDeptCode()` 回傳 null → 本區塊仍完整回傳，不降級、不產生 `SCOPE_UNRESOLVED` | AC-LIST-11／§6.3 |
| 17 | `scope.deptCode` 為純顯示欄位：即使處長 deptCode 非 null，名單集合仍與部長相同 | I-F120-05 二次證明 |
| 18 | AC-LIST-02：`listNo` 提供 → `mode=single-list`，僅回傳該筆名單；該名單無估算值時總計為 0 | AC-LIST-02／§6.2 |
| 19 | AC-LIST-12：當月 0 筆 active 名單 → `groups=[]`、`totalListCount=0`、`totalEstimatedCount=0`、不 throw | AC-LIST-12／BR-11 |
| 20 | AC-LIST-13：呼叫前後 `ob_pool_data_list` 列數不變；既有 `stage0_estimate_count` 值不被回寫覆蓋 | AC-LIST-13／BR-12 |

共 **21 案例**。

---

## 三、後端 Route / RBAC 測試

> 檔案：`stage0-list-estimate-overview.controller.f120.spec.ts`。沿用既有
> `stage0-estimate.controller.spec.ts` 之慣例（mount 真實 `Stage0EstimateController`、mock
> `Stage0EstimateService`、`AuthGuard` override、supertest）。

| # | 測試場景 | 對應 |
|---|---|---|
| 1 | director → 200，`computeListEstimateOverview` 以 `actor=director` 呼叫 | AD §6.4 |
| 2 | **★section_chief → 200**（唯讀可進入；與 `dailyEstimate`/`previewHitCount` 不同，不得為 403） | AC-LIST-11／AD §4.1 最高風險點 |
| 3 | plain user（無 businessRole）→ 403（class 級 `DirectorOrSectionChiefGuard`） | §6.3 |
| 4 | 未登入 → 401 | §6.3 |
| 5 | `ym` 未帶 → 使用 `currentWorkYm` | §6.2 |
| 6 | `ym` / `listNo` query → 傳給 service（`listNo` 觸發 single-list 模式） | §6.2 |
| 7 | `calendarSource` / `startDate` / `endDate` 接受但不影響呼叫結果（A-1 no-op） | §6.2 |
| 8 | 回應內容直接透傳 service 回傳值（controller 不另行轉換 shape） | §6.1 |

共 **8 案例**。

---

## 四、前端 Component 測試：`ListEstimateOverviewSection`

> 檔案：`list-estimate-overview-section.f120.test.tsx`。依 AD-E07-51 §4.2/§7 之分工，後端已算好
> `groups[]`/`subtotalCount`/`percent` 等數值，元件僅負責渲染、條件字串格式化（既有
> `formatConditionSummary()`）與分組標籤 decode（既有 `useConditionDecoder()`）——故測試以「後端
> 回應 shape」為 props 餵入，不 mock fetch／不依賴 API client 命名。

| # | 測試場景 | 對應 |
|---|---|---|
| 1 | 名單編號／名稱顯示；預估數量千分位格式 | AC-LIST-03 |
| 2 | 每筆條件各自一個 chip，不以分隔字元串接成一句 | AC-LIST-04／D-4 |
| 3 | **★D-13**：重複可選值不去重顯示（`['01','01']`→「產品類別：汽車、汽車」，刻意行為，不得「修正」） | AC-LIST-04 最高風險點 |
| 4 | 底部說明句含「且」的關係說明 | AC-LIST-04 |
| 5 | 條件為空陣列 → 顯示「（未設定篩選條件）」 | AC-LIST-04 |
| 6 | 超過 2 筆條件 → 預設前 2 筆＋「＋N 項」`<button>`；點擊就地展開；焦點回到同一顆按鈕 | AC-LIST-04／D-5 |
| 7 | 展開控制項為真正 `<button>`（非 hover-only） | AC-LIST-04／D-5 |
| 8 | TC-184-06：白名單 label 變更後分組標題同步反映（regression，非固定字串） | AC-LIST-05 |
| 9 | 查無代碼時 fallback 顯示原始代碼（未登錄組 `09`） | AC-LIST-05 |
| 10 | 多重產品類別／未分類為固定業務文案，不查白名單 | AC-LIST-05 |
| 11 | `groups[]` 依給定順序渲染，元件不得自行重排 | AC-LIST-07 |
| 12 | 分組標題列＝小計列：顯示名單數／小計／佔比；收合後三數字仍可見 | AC-LIST-08／D-3 |
| 13 | 收合互動之焦點回到同一顆摺疊按鈕 | AC-LIST-04／D-5 精神延伸 |
| 14 | 分母>0、分子>0 → 顯示整數百分比 | AC-LIST-08 |
| 15 | **★分子=0、分母>0 → 必須顯示「0%」（非「—」）**，不得誤判為缺陷 | AC-LIST-08 兩情境對照最高風險點 |
| 16 | **★分母=0（全數未能估算）→ 所有分組顯示「—」**，不得出現 0%／NaN／Infinity | AC-LIST-08 |
| 17 | BR-9：空分組（`listCount=0`）不顯示 | BR-9 |
| 18 | BR-9：`listCount>0`、`subtotal=0` 之分組仍顯示，帶分組層級提示（含具體數字） | BR-9 |
| 19 | 單一名單模式：保留佔比欄、所有格「—」、標題下灰字副標，不得顯示 100%，欄位未被抽掉 | AC-LIST-08／OQ-F120-U2／D-8 |
| 20 | 總計列顯示 `totalListCount`／`totalEstimatedCount`（直接採用後端給值） | AC-LIST-09 |
| 21 | 名單列：無估算值顯示「—」＋「未能估算」徽章，不得顯示 0 或空白 | AC-LIST-10 |
| 22 | 分組層級：顯示「本組合計未涵蓋 N 張未能估算的名單」或等義（含具體數字） | AC-LIST-10／D-9 |
| 23 | 區塊層級：`unestimatedListCount>0` 時出現「不完整」徽章；`=0` 時不出現 | AC-LIST-10／D-9 |
| 24 | **★role=section_chief → 三個觸點皆須出現**：標題徽章／說明條第一行逐字／總計後綴 | AC-LIST-11 最高風險點 |
| 25 | role=section_chief 且 `scope.deptCode=null` → 三個觸點仍完整出現 | AC-LIST-11／§6.3 |
| 26 | role=director／admin → 三個觸點皆不出現 | AC-LIST-11（prototype 對照） |
| 27 | `totalListCount=0` → 空狀態文案，不渲染分組列／名單列／總計列 | AC-LIST-12 |
| 28 | 術語黑名單全文掃描（多分組／未能估算／處長之豐富場景，比照 US-170 TC-170-01 先例） | AC-LIST-14／§9.1 |

共 **28 案例**（component 測試檔實測 30 個 `it`，含 2 個由同一 `describe` 拆出之子案例）。

> **驗證方式**：本檔已以一次性 throwaway stub 元件（未進入交付範圍，測試完即刪除）自我驗證全數
> 30 案例可被正確實作滿足，且刪除 stub 後恢復 RED（`Cannot find module`）。詳見任務完成回報。

---

## 對應總表（AC → 測試場景）

| AC | 測試場景 |
|---|---|
| AC-LIST-01 | *（本輪未涵蓋，見 risks-and-gaps.md R-F120-03：頁面層定位驗證屬 Playwright fidelity 範圍，本輪排除）* |
| AC-LIST-02 | 後端整合 #18；FE（元件測試以 `mode` prop 驅動，未另建頁面層測試） |
| AC-LIST-03 | 後端整合 #1；FE #1 |
| AC-LIST-04 | 後端純函式（條件字串非本層職責）；FE #2/3/4/5/6/7 |
| AC-LIST-05 | 後端整合 #3；FE #8/9/10 |
| AC-LIST-06/06a/06b | 後端純函式全部；後端整合 #1/5 |
| AC-LIST-07 | 後端整合 #1/2/4；FE #11 |
| AC-LIST-08 | 後端整合 #6/7/8/9；FE #12/13/14/15/16/17/18/19 |
| AC-LIST-09 | 後端整合 #5/11/12/13；FE #20 |
| AC-LIST-10 | 後端整合 #10；FE #21/22/23 |
| AC-LIST-11 | 後端整合 #14/15/16/17；FE #24/25/26 |
| AC-LIST-12 | 後端整合 #19；FE #27 |
| AC-LIST-13 | 後端整合 #20 |
| AC-LIST-14 | FE #28 |
| I-F120-01~05 | 後端純函式（全函式特性）＋後端整合 #1/5/11/12/14/15/17 |
