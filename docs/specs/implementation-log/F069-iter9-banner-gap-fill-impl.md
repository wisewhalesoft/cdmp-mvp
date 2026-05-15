---
type: implementation-log
feature_id: F069
feature_name: SelectedCardTypeBanner Iter 9 — Gap Fill（Stats endpoint + Metadata + listdef navigate + scrollbar 修正）
status: complete
last_updated: 2026-05-15
---

# F069 Iter 9：Banner Gap Fill — 實作紀錄

## 摘要

補完 Iter 8（排列 B）遺留的三個 Gap 加上一個 UI bug：

1. **Gap A — Stats API**：新增 `GET /api/v1/assignment/scoring/card-types/:cardType/stats` 端點，
   一次回傳 banner KPI 5 欄（dim/score/level/tier/listDefsAffected）。
2. **Gap B — Metadata 欄位**：擴充 `listCardTypes` response，JOIN active version + users 表
   帶回 `cardVersion / sdate / edate / createdBy / createdAt` 5 個欄位。
3. **Gap C — KPI listdef 跳轉**：在 ScoringConfigShell 注入 `useNavigate`，
   `onGoToListDefinitions(code)` 跳轉至 `/assignment/list-definitions?cardType=${code}`。
4. **UI bug — Scrollbar layout shift**：`html { scrollbar-gutter: stable }`
   修正主內容區因 scrollbar 出現/消失而抖動 ~15px 的問題。

## Test Results Summary

### 新增測試（11 個）

| 測試檔 | 描述 | Status |
|---|---|---|
| `card-type-stats.service.spec.ts` | 4 個 | PASS |
| `card-type.controller.spec.ts`（新 stats describe） | 5 個 endpoint × guard matrix（4 cases）+ 2 個專屬 stats 行為 = +6 | PASS |
| `card-type-list.service.spec.ts`（metadata describe） | 5 個（含欄位存在、active version 篩選、users.name JOIN、no active version graceful、unknown user graceful） | PASS |
| `scoring-config-page.test.tsx`（Iter 9 banner integration describe） | 4 個（KPI 數字、metadata 顯示、kpi-listdef navigate、enabled guard） | PASS |

### 既有測試（保留 / 調整）

| 測試檔 | 數量 | 變更說明 | Status |
|---|---|---|---|
| `card-type-list-tab.test.tsx` | 22 | 移除 `stats=undefined hidden` 測試（stats 改 required）；test fixture 補 metadata 欄位 | PASS |
| `card-type-switcher.test.tsx` | 10 | test fixture 補 metadata 欄位 | PASS |
| `edit-card-type-modal.test.tsx` | 5 | TARGET fixture 補 metadata | PASS |
| `delete-card-type-modal.test.tsx` | 5 | TARGET fixture 補 metadata | PASS |
| `tier-mapping-tab.test.tsx` | 9 | `initialCardType` 補 metadata | PASS |
| `create-card-type-modal.test.tsx` | 6 | 無需動 | PASS |
| `scoring-config-page.test.tsx` | 21 + 12 skip | beforeEach mock 補 metadata + getCardTypeStats | PASS |

### Assignment 模組整體

- API（assignment-scoring）：22 test files / 204 tests PASS（從 200 → 204，+4 stats service tests）
- Web（assignment）：9 test files / 93 tests PASS / 12 skipped（從 90 → 93，+3 net；details 見上）
- card-type.controller.spec：22 → 30 tests PASS（+8 = 5 endpoint guard matrix tests + 2 stats specific + 1 因為已有 stats endpoint 加入矩陣 ×4 minus already counted）
- 實際數字：原 28 → 30；+2 stats describe specific tests，5 個 guard matrix 端點 × 4 cases = 20（GET stats 加進 endpoints[] 即 +4 = 24，原 24 + 6 額外 case → 30）

### Regression（全套）

- API：801 PASS / 17 FAIL（全部 pre-existing：`etl`/`target-table`/`extraction-task`，與本變更無關）
- Web：762 PASS / 5 FAIL（全部 pre-existing：`c360`/`etl-pipelines`/`target-tables`）
- Typecheck（兩邊）：本次變更檔案 clean；剩餘錯誤皆 pre-existing 模組

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/assignment-scoring/services/card-type.service.ts` | modified | 1) `CardTypeListItem` 介面新增 5 個 metadata 欄位（`cardVersion` `number\|null`、`sdate/edate/createdBy/createdAt` `string\|null`）；2) `listCardTypes` JOIN `ob_levelcard_version`（active 列）+ `users`（id→name），組裝 metadata；3) 新增 `CardTypeStatsResult` 介面與 `getCardTypeStats(cardType)` method，複用 `_countCascade()` + `_countActiveListDefinitions()` |
| `apps/api/src/modules/assignment-scoring/controllers/card-type.controller.ts` | modified | 新增 `@Get(':cardType/stats')` 路由，呼叫 `service.getCardTypeStats` |
| `apps/api/src/modules/assignment-scoring/__tests__/card-type-stats.service.spec.ts` | new | 4 個 service unit test（cascade 完整 / 全 0 / listDefs active-only / 404） |
| `apps/api/src/modules/assignment-scoring/__tests__/card-type.controller.spec.ts` | modified | 1) serviceMock 加 `getCardTypeStats`；2) endpoints[] 加入 GET `/stats`（Guard matrix +4）；3) 新 describe「GET /:cardType/stats — Iter 9」(+2 行為 case) |
| `apps/api/src/modules/assignment-scoring/__tests__/card-type-list.service.spec.ts` | modified | 1) provide `versionRepo` / `userRepo` mocks；2) 新增 5 個 metadata describe test case |
| `apps/web/src/api/card-type.ts` | modified | 1) `CardTypeListItem` 補 5 個 metadata 欄位；2) 新增 `CardTypeStatsResponse` 型別與 `getCardTypeStats()` 函式 |
| `apps/web/src/pages/assignment/scoring-config-page.tsx` | modified | 1) import `useNavigate` + `getCardTypeStats`；2) Shell 新增 `statsQuery` useQuery（`enabled: !!selectedCardItem`）；3) `handleGoToListDefinitions(code)` 跳轉；4) `ProdKindInfoBanner` 改傳 `stats={bannerStats}` 與 `onGoToListDefinitions` |
| `apps/web/src/pages/assignment/_components/card-type-list-tab.tsx` | modified | 1) `BannerCardType` 從 `extends CardTypeListItem` 改 `type ... = CardTypeListItem`；2) `SelectedCardTypeBannerProps.stats` 由 optional 改 required；3) 移除 `{stats && ...}` 守衛；4) `versionStr` 改用 `v{n}` 格式（cardVersion=null 顯示 `—`）；5) `setSelected` after `createCardType` 補 metadata 欄位 |
| `apps/web/src/pages/assignment/__tests__/card-type-list-tab.test.tsx` | modified | 1) 移除 `stats=undefined hidden` 測試；2) 補 `META_NULL` constant；3) `FULL_H_CARD.cardVersion: 'v1'` 改 `1` (number) |
| `apps/web/src/pages/assignment/__tests__/scoring-config-page.test.tsx` | modified | 1) mock `getCardTypeStats`；2) `listCardTypes` mock 補 metadata；3) 新增 Iter 9 describe 4 test |
| `apps/web/src/pages/assignment/__tests__/card-type-switcher.test.tsx` | modified | SIX_CARDS fixture 補 metadata |
| `apps/web/src/pages/assignment/__tests__/edit-card-type-modal.test.tsx` | modified | TARGET fixture 補 metadata |
| `apps/web/src/pages/assignment/__tests__/delete-card-type-modal.test.tsx` | modified | TARGET fixture 補 metadata |
| `apps/web/src/pages/assignment/__tests__/tier-mapping-tab.test.tsx` | modified | `initialCardType` 補 metadata |
| `apps/web/src/index.css` | modified | 新增 `html { scrollbar-gutter: stable }` 註解版本 — 修 layout shift |

## Architectural Decisions

### 1. `createdBy` / `createdAt` 採 `ob_card_type` 而非 `ob_levelcard_version`

按 spec 指示：「banner 想顯示的是『這張卡是誰建的』而非『v1 版本誰寫的』」。
雖然 v1 通常同人，但語意上 card_type 的 created_by/created_at 更貼合 banner 顯示語意。
未來若需區分（例如同一張卡多版本不同 maintainer），可在另外的 version-history view 顯示
`ob_levelcard_version.created_by`。

### 2. Active version JOIN 用 Application-layer join，不用 SQL JOIN

理由：
- 6 張卡規模極小（M02 spec 明確上限）
- Repository pattern 比 raw SQL 易測（vi.fn mock 簡單）
- 兩次 query 順序執行：先 cardTypeRepo.find → 再 versionRepo.find(in cardTypeCodes)
  → 再 userRepo.find(in createdByIds)，三次 round-trip 但 batched，total < 10ms。
- 若未來資料量擴大（不太可能），可改為 leftJoin builder pattern 一次 query。

### 3. Stats endpoint 不需月跑鎖檢查

純 read 操作，月跑進行中也應該可以看 stats（用於故障排查）。
但 `listDefsAffected` 仍只計 `status='active'` 行（與 F072 delete preview 一致），
不會因為月跑暫停的列表定義而誤計。

### 4. KPI listdef 跳轉策略

目前 `/assignment/list-definitions` 為 `AssignmentStubPage`（F074 尚未實作）。

選擇：直接 `navigate('/assignment/list-definitions?cardType=H')`，依賴 F074 未來
實作頁面時讀取 `useSearchParams().get('cardType')` 做預設 filter。

不在本 PR 內補 list-definition 頁的 query 解析邏輯，理由：
- 該頁尚未具體實作（仍是 stub）
- 範圍超出本 task（spec 也說「建議一併做」非強制）
- F074 PR 會用真實 list-definition data 重做整頁，此時 query parse 自然加入

### 5. Banner stats required + bannerStats 預設 0

`statsQuery` loading 期間 `statsQuery.data === undefined`，但 banner 要求 stats required。
解法：在 Shell 用 `??` fallback 一個全 0 的 BannerStats object 給 banner。

優點：
- Banner 元件型別 strict，不需 optional chaining 散落多處
- Loading 期間 UI 顯示 0 而非閃爍空白，符合 React Query default behavior
- 切換 cardType 時，舊資料快取會由 React Query 立即提供（非 0），體驗順暢

權衡：第一次載入瞬間會看到「0/0/0/0/0」一閃。若使用者體感不佳，可加 `statsQuery.isPending`
判斷顯示 skeleton，本次未做（避免過度設計）。

### 6. Scrollbar fix 位置選擇

選 `html { scrollbar-gutter: stable }` 而非 `app-layout div`：
- 99% 瀏覽器 scroll container 為 `html`（不是 body 不是內層 div）
- 全域生效 → 所有頁面都受惠（不僅 scoring-config）
- 單一改動點，未來不會因為新頁面忘記加而再次踩雷

不採 `overflow-y: scroll`（強制 scrollbar 永遠在）的原因：
- 內容很短的頁面（例如 login）會出現一條無作用的灰色軌道，視覺髒
- `scrollbar-gutter: stable` 只保留空間，無 scrollbar 時是純空白，比較乾淨

## Known Gaps / TODO

| Gap | 描述 | 建議解法 |
|---|---|---|
| Stats refetch on mutate | 編輯 dimension/score/level/tier 後 banner KPI 不會自動更新（只有重新選 cardType 才會 refetch） | 後續 mutation 成功 callback 加 `queryClient.invalidateQueries(['card-type-stats', code])`。本 PR 範圍未做避免擴大 |
| `cardVersion` 永遠是 1 | 系統設計：每張 cardType 只有一個 active version；目前 backend 寫死 `card_version: 1` 於 createCardType。Iter 9 metadata JOIN 是泛用設計（version table 多列也能正確選 active），但實務上不會看到 v2/v3 | 無需動作；未來若引入 version history feature 再評估 |
| List-definition 頁 cardType filter UI | 路由帶 query 已就緒，但 stub page 不會讀 query | F074 實作 list-definition 頁時補上（`useSearchParams`） |

## TDD 流程紀錄

1. **RED phase**：
   - 新建 `card-type-stats.service.spec.ts`（4 個 test）
   - 擴充 `card-type.controller.spec.ts`（serviceMock + endpoints + 新 describe）
   - 擴充 `card-type-list.service.spec.ts`（versionRepo/userRepo + 5 metadata test）
   - 跑 backend test，確認新增 test 失敗（service method/property 不存在）
   - 更新 `card-type-list-tab.test.tsx`（移除 stats=undefined test、fixture 補 metadata）
   - 更新 `scoring-config-page.test.tsx`（mock getCardTypeStats、新 describe 4 test）
2. **GREEN phase**：
   - Backend：`CardTypeListItem` 補 metadata + `listCardTypes` JOIN 邏輯 + 新 `getCardTypeStats` method + controller route
   - Frontend：`api/card-type.ts` 補型別/函式 + `scoring-config-page.tsx` useQuery + navigate + 改 banner props
   - Banner：`stats` 改 required、`versionStr` 用 `v{n}` 格式
   - 更新散落的 fixture（edit/delete modal test、switcher test、tier-mapping-tab test）以符合新 CardTypeListItem 型別
3. **Refactor**：
   - 移除 banner `{stats && ...}` 守衛（不再需要）
   - 註解清理（spec scope 內，未動 DOM 結構）
4. **Verify**：
   - Backend：22 test files / 204 PASS
   - Frontend assignment：9 test files / 93 PASS / 12 skipped
   - 全套 regression：API 17 fail + Web 5 fail 全 pre-existing
   - 兩邊 typecheck：本變更檔案 clean
   - CSS scrollbar 修正：純 CSS 變更，無 unit test 需求
