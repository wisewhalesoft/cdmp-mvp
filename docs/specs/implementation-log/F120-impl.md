---
type: implementation-log
feature_id: F120
feature_name: Stage 0 試算頁「名單基礎預估數量總覽」（按產品類別分組小計）
status: complete
last_updated: 2026-08-20
---

# F120: Stage 0 試算頁「名單基礎預估數量總覽」— 實作日誌

> 依 [F120 v1.3](../features/F120-stage0-list-estimate-overview.md) ＋ [AD-E07-51 v1.2](AD-E07-51-f120-list-estimate-overview.md) ＋ [F049 v2.2 §16.5 / §24](../features/F049-stage0-daily-estimate.md) ＋ `prototypes/30-stage0-estimate.html` 實作。
> **constraint ring 由 test-generator（`tg-f120`）於實作前撰寫（blind on implementation）；本輪實作端零測試異動**（`git diff` 僅含 production 檔）。
>
> **⚠️ 重建紀錄（2026-08-20，同日）**：一次 `git worktree remove --force` 沿 symlink 遞迴刪除，清空了主工作樹之 `apps/` / `packages/`。tracked 檔案由 HEAD 還原，但**未 commit 之新檔永久遺失**——本 feature 之 2 個新增 production 檔與 5 個 tracked 檔的 F120 修改全數歸零。本文件（未受損）即為重建之施工圖，production code 已依本文件之 §Files Changed ／ §Architectural Decisions ／ §不變式落實方式**逐項重出**，ring 複跑結果與事故前逐數相同（94/94）。**重建過程未產生任何與原記錄不同的決定**；`git status` 中約 545 筆 `apps/` 的 M 為還原造成之 CRLF 雜訊，非實質異動。
> **教訓**：ring 已於 `390d1f3` 進版控而倖存，未 commit 的 production code 與 test fixture 修正則兩度遺失（見 BI-1）——每階段完成即 commit。

## Test Results Summary

### Ring（test-generator 撰寫，本輪未動）

| 檔案 | 案例數 | 狀態 |
|---|---|---|
| `apps/api/src/modules/assignment-list/__tests__/stage0-list-group-resolve.f120.spec.ts` | 35 | PASS |
| `apps/api/src/modules/assignment-list/__tests__/stage0-list-estimate-overview.service.f120.spec.ts` | 21 | PASS |
| `apps/api/src/modules/assignment-list/__tests__/stage0-list-estimate-overview.controller.f120.spec.ts` | 8 | PASS |
| `apps/web/src/pages/assignment/__tests__/list-estimate-overview-section.f120.test.tsx` | 30 | PASS |
| **合計** | **94** | **全綠** |

### AC / TC 覆蓋對照

| Scenario | 說明 | 落點 | 狀態 |
|---|---|---|---|
| TC-184-03 / TC-F120-A/B | 單一代碼歸屬、重複值去重、`operator` 缺漏 ≡ `in` | `resolveListGroup()` | PASS |
| TC-184-04 | 多值僅歸「多重產品類別」一次 | `resolveListGroup()` | PASS |
| TC-184-05 | 文字運算子與未設定皆歸「未分類」（判定路徑可分別驗證） | `resolveListGroup()` | PASS |
| TC-184-06 | 分組標題經白名單 decode（改 label 後畫面同步） | `ListEstimateOverviewSection` | PASS |
| TC-184-07 | 跨端點嚴格相等（**無條件斷言**，含部分降級情境） | `resolveListTotals` 共用 | PASS |
| TC-184-08 | 無估算值名單三分處置（列出／不計小計／仍計名單數） | service ＋ 元件 | PASS |
| TC-184-13 | 互斥且完備（聯集＝全集、Σ 小計＝總計） | service | PASS |
| TC-184-14 / 15 | 佔比計算；總計為 0 → `percent = null`（顯示「—」） | service ＋ 元件 | PASS |
| TC-184-16 / TC-F120-D | 處長全量可見 ＋ 三個語意標示觸點 | service ＋ 元件 | PASS |
| TC-F120-C | 孤兒代碼自成一組、標籤 fallback、排序於已登錄代碼之後 | service ＋ 元件 | PASS |
| TC-F120-E | grep 反向斷言（不讀衍生欄位、不自寫 operator fallback、純函式特徵） | `stage0-list-group-resolve.ts` | PASS |
| AC-LIST-14 | 術語黑名單 DOM 全文掃描 | 元件 | PASS |

### 型別檢查

- `apps/api`：`npx tsc --noEmit -p tsconfig.build.json` → **0 error**
- `apps/web`：`npx tsc --noEmit` → **0 error**

### 回歸

| 套件 | 結果 |
|---|---|
| `apps/api` 全套（排除真實 MSSQL `*.mssql.spec.ts`，208 檔） | **3031 passed / 0 failed**（2 skipped、15 todo）— 事故前量測 |
| `apps/api/src/modules/assignment-list/`（排除 MSSQL，27 檔） | **452 passed / 0 failed**（1 skipped）— 重建後複跑 |
| `apps/api` 真實 MSSQL：`preview-hit-count-customer-core.mssql.spec.ts` | 首次合跑 1 筆逾時 → 以 `git stash` 前後各跑一次證明為 dev DB 負載之既有 flake（stash 後綠、還原後單跑亦綠），非本輪回歸 |
| e2e（掛載 `AssignmentListModule` 之三檔） | 28 passed — 事故前量測 |
| `apps/web` 全套（132 檔） | **1717 passed / 0 failed**（29 skipped）— 事故前量測 |
| `apps/web/src/pages/assignment/`（67 檔） | **879 passed / 0 failed**（29 skipped）— 重建後複跑 |

## Files Changed

### 後端

| File Path | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/assignment-list/stage0-list-group-resolve.ts` | new | `resolveListGroup()` 純函式（§5.2 GROUP-RESOLVE 6 步驟）；匯入既有 `resolveCategoricalOperator`，不新建第三個 fallback 落點 |
| `apps/api/src/modules/assignment-list/stage0-estimate.service.ts` | modified | ①抽出私有 `resolveListTotals(ym, listNo?)`（純重構、行為不變）②`computeDeptEstimate` 回傳新增 top-level `orgMonthTotal`③新增 `computeListEstimateOverview()` ＋ 私有 `buildListEstimateGroups()` / `loadProductKindOptions()`④新增回應型別⑤constructor 新增 `@Optional() @InjectRepository(PooldataFieldOption)` |
| `apps/api/src/modules/assignment-list/stage0-estimate.controller.ts` | modified | 新增 `GET stage0/list-estimate-overview`（class 級 Guard，**未**加 `@RequireDirector()`） |

### 前端

| File Path | Change Type | Description |
|---|---|---|
| `apps/web/src/pages/assignment/_components/list-estimate-overview-section.tsx` | new | 區塊元件（props `{ data }`，純呈現；條件字串走既有 `formatConditionSummary()`、分組標籤走既有 `useConditionDecoder()`） |
| `apps/web/src/api/assignment-run.ts` | modified | `DeptEstimateResponse` 新增 `orgMonthTotal: number`；新增 `ListEstimateOverview*` 型別族與 `getListEstimateOverview()` |
| `apps/web/src/pages/assignment/stage0-estimate-page.tsx` | modified | ①新增第三區塊掛載點（既有兩區塊之後、頁尾提示之前）②`orgMonthTotal` 改直接取用回應欄位（**移除**客戶端 `Σ_d days[].orgTotal` reduce）③處長 banner 文案補「部門相關區塊」限定語（F049 v2.2 §24.2 #7a）④處長 scope=null／轄區 0 件兩個降級分支亦渲染本區塊（F120 §10.2） |

**無 migration**（無新表、無新欄位）；`assignment-list.module.ts` 無須異動（`PooldataFieldOption` 已在 `forFeature`）。

## Architectural Decisions

1. **`@Optional()` 標註新注入之 `PooldataFieldOption` repository**（AD §10 只寫「constructor 新增 `@InjectRepository`」，未指定 optionality）。
   四個既有精簡 TestingModule（`stage0-dept-estimate` / `stage0-estimate` / `stage0-estimate-dryrun` / `f119-ac14-stage0-delegation`）未註冊本 entity；設為必填會使其 DI 解析失敗（純測試佈線問題，非行為問題）。標為 `@Optional()` 後：正式 module 恆已註冊、行為不變；缺席時僅使分組**標籤／排序**降級為原始代碼並發 logger warning，**不影響分組歸屬**（歸屬只讀 `condition_payload`）。F120 ring 之 service spec 已註冊本 entity，故環路完整驗證正常路徑。

2. **佔比之單一名單降級放在顯示層，後端維持 §5.5 公式**。
   後端 `percent = totalEstimatedCount > 0 ? Math.round(...) : null`（§5.5 無 mode 分支，且 §6.1 明訂 `percent = null ⇔ totalEstimatedCount = 0`）；「單一名單鑽探所有佔比格顯示『—』」（OQ-F120-U2）為 ui-ux-designer 之**顯示決策**，故由元件以 `data.mode !== 'single-list'` 判定。兩份文件因此同時滿足，且與 prototype 之 `percentApplicable` 同構。

3. **元件空狀態之「前往名單定義」使用原生 `<a href>` 而非 `react-router-dom` 的 `<Link>`**。
   本元件依 AD §7 為純呈現元件（props 餵入後端 shape、自身不 fetch），ring 測試以 `render(<ListEstimateOverviewSection data={...} />)` 直接渲染、未包 Router；使用 `Link` 會在 AC-LIST-12 空狀態情境拋 `useHref` 錯誤。以原生 anchor 保留 prototype 之導覽 affordance，同時不對呼叫端強加 Router context 依賴。

4. **`warnings` 順序維持不變**：`computeDeptEstimate` 仍先推 `SCOPE_UNRESOLVED`（L4），再 `push(...resolveListTotals().warnings)`，最後 `DEPT_HEADCOUNT_ZERO` / `CALENDAR_EMPTY`——與抽出前逐筆相同，既有斷言不受影響。

5. **`groupKey` 保留字 vs DOM 鍵刻意不同**：契約層用 `MULTI` / `UNCLASSIFIED`（§6.1），DOM 屬性用 `data-group-kind="code|combined|unset"` ＋ `data-group-id="g-*"`（§13.2.1），使 §9.1 之黑名單 DOM 全文掃描不會誤判。

## 不變式落實方式

| 不變式 | 落實 |
|---|---|
| `I-LISTOVW-SHARED-SOURCE-01` | `computeDeptEstimate` 與 `computeListEstimateOverview` 皆呼叫同一個 `resolveListTotals()`；兩者皆無自建 `listRepo.find(...)` |
| `I-LISTOVW-NO-SCOPE-FILTER-01` | `computeListEstimateOverview` 之呼叫鏈不存在任何 `scopeDeptCode` 過濾；`scope.deptCode` 僅寫入回應、`listOverviewScoped` 型別即字面 `false` |
| `I-LISTOVW-OPERATOR-SINGLE-SOURCE-01` | `stage0-list-group-resolve.ts` 匯入 `resolveCategoricalOperator`；ring 之 grep 反向斷言（禁 `?? 'in'` / `\|\| 'in'`）通過 |
| `I-LISTOVW-PURE-GROUP-RESOLVE-01` | 該檔零 repository / 零 typeorm 匯入（ring grep 驗證） |
| `I-LISTOVW-NO-NEW-CACHE-01` | 未引入任何快取層 |
| `I-F120-01 / 02` | `resolveListGroup` 為全函式 ＋ 單一分桶；總計由分組小計加總（非另行計算） |
| `I-F120-03` | `orgMonthTotal` 與 `totalEstimatedCount` 同為 `resolveListTotals().listTotals` 之 reduce ⇒ 依建構成立 |
| `I-F120-04` | 分組判定僅讀 `condition_payload`；`stage0-list-group-resolve.ts` 內不存在 `.prod_kind` 屬性存取 |
| `I-F120-05` | ring 已以「處長 vs 部長同參數 → `listNo` 集合與總計相同」實證 |

## Blocking Issues

**無殘留阻塞項。** 下方 BI-1 已於本輪由 test-generator 處置完畢（記錄供溯源）。

### BI-1 ✅ 已解決（test-generator 修正，非實作缺陷）：既有 `stage0-estimate-page.test.tsx` 需更新 fixture

- **成因**：依 F049 v2.1 §16.5.5 ＋ §24.2 #5，頁面之月層級「全名單總量」已改為**直接取用後端 `orgMonthTotal`**，spec 明文禁止保留原客戶端 `Σ_d days[].orgTotal` reduce 作為 fallback。既有 fixture `deptResp()` 無此 top-level 欄位。
- **症狀（兩筆，同一根因）**：
  1. `TS-F049-FE-001`（`:333-337`）：`expected '全名單總量0缺口 80' to contain '200'`
  2. `tsc --noEmit`（web）唯一錯誤 `:120`：`deptResp()` 缺 `orgMonthTotal`（FE 型別副本依 F049 §16.5.5「型別 `number`、非 nullable」宣告為必填）
- **spec 早已預告**：[F049 §24.3 #8 / #10](../features/F049-stage0-daily-estimate.md)（「fixture 改為設定 `orgMonthTotal`；**期望值本身之業務意圖不變**」）。
- **處置**：依團隊模式規則，實作端**不修改任何測試**；以訊息向 `tg-f120` 說明並請其調整 fixture。
- **結果**：`tg-f120` 已修正該檔（`deptResp()` 預設 `orgMonthTotal: 989`＝刻意與 `days[]` 無關聯之獨立值，以免 fixture 人工同步掩蓋 v2.1 允許之殘差；`TS-F049-FE-001` 以 override 指定 `orgMonthTotal: 200`），並依 §24.3 #11a 追加處長 banner 之逐字斷言（`部門相關區塊僅顯示您轄區部門（北區電銷一課）的預估資料`），該斷言由本輪之 §24.2 #7a 文案變更滿足。該檔現為 20 passed，`apps/web` 全套與 `tsc --noEmit` 皆已恢復全綠。
- **⚠️ 曾復發一次**：該 fixture 修正原為未 commit 狀態，於上述重建事故中一併遺失，實作重出後同樣兩筆症狀再現；已再次通知 `tg-f120` 並由其重出（同一份修法）。**兩次皆非測試自身缺陷、非業務爭議**，根本對策為儘早 commit。
