---
type: implementation-log
feature_id: F069
feature_name: CARD_TYPE 計分卡類型清單（Iter 8：prototype 28 排列 B 對齊）
status: complete
last_updated: 2026-05-15
---

# F069 Iter 8：prototype 28 排列 B（單列三欄）— 實作紀錄

## 摘要

對齊 `prototypes/28-scoring-config.html` 第四輪累積變更（使用者已驗收）：
頂部 banner 改為「身分 5 / metadata 3 / 統計+操作 4」三欄式佈局，
拔除 Tab 2~5 panel 內的 `.version-strip`，新增 CARD_TYPE 快速切換 dropdown。

## Test Results Summary

### 新增測試（41 個）

| 測試檔 | 描述 | Status |
|---|---|---|
| `card-type-switcher.test.tsx`（10 個） | trigger / panel / 當前選中 / outside-click / ESC / monthRunLocked / null selection / style guards | PASS |
| `card-type-list-tab.test.tsx` 內 `SelectedCardTypeBanner` describe（17 個） | TC-F069-06 翻轉 + metadata + dash placeholder + status pill + 5 KPI + amber warning + KPI click → onSwitchTab/onGoToListDefinitions + stats=undefined hidden + 排列 B 三欄佈局 + monthRunLocked divide-amber-200 + null col-span-12 + KPI 數字 text-base font-bold | PASS |

### 既有測試（保留）

| 測試檔 | 數量 | Status |
|---|---|---|
| `card-type-list-tab.test.tsx`（CardTypeListTab） | 6 | PASS |
| `tier-mapping-tab.test.tsx`（F056 v1.5） | 9 | PASS（不需修改） |
| `scoring-config-page.test.tsx` | 21 + 12 skip | PASS（移除 TS-F053-009 / 010；switchToLegacyTabs anchor 改 `btn-add-dim`） |
| `create-card-type-modal.test.tsx` | 6 | PASS |
| `edit-card-type-modal.test.tsx` | 5 | PASS |
| `delete-card-type-modal.test.tsx` | 5 | PASS |
| `create-tier-mapping-modal.test.tsx` | 7 | PASS |
| `base-codes-page.test.tsx` | 4 | PASS |

### Skip / Coverage 對照

- `TS-F053-009 / TS-F053-010`（version-card metadata 顯示）：版本/起訖/createdBy/createdAt 已搬到
  `SelectedCardTypeBanner.banner-meta`，覆蓋於 `card-type-list-tab.test.tsx` 新 describe（Metadata / Status pill）。
- `TS-F056-021 ~ 028`（v1.4 legacy）：原本就 `describe.skip`，不變動。

### Assignment 模組整體

- 9 個 test files PASS
- 90 tests PASS / 12 skipped（v1.4 legacy）

### 全 web 套件 regression

- 全套：759 passed / 5 failed / 12 skipped
- 5 failures 為**預先存在**（c360 / etl-pipelines 模組，未在本次變更範圍內，git log 確認）

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `apps/web/src/pages/assignment/_components/card-type-switcher.tsx` | new | 新增 dropdown component（trigger + panel + outside-click + ESC + disabled） |
| `apps/web/src/pages/assignment/__tests__/card-type-switcher.test.tsx` | new | 10 個 RTL test |
| `apps/web/src/pages/assignment/_components/card-type-list-tab.tsx` | modified | `ProdKindInfoBanner` 重寫為 `SelectedCardTypeBanner`（排列 B 三欄）；export 新 props 介面 `BannerCardType` / `BannerStats` / `SelectedCardTypeBannerProps`；保留 `ProdKindInfoBanner` 為 alias 維持向後相容 import |
| `apps/web/src/pages/assignment/_components/version-strip.tsx` | deleted | prototype v3+ 已移除 `.version-strip`；資料改由 banner-meta 顯示 |
| `apps/web/src/pages/assignment/_components/tier-mapping-tab.tsx` | modified | 移除 `VersionStrip` import + JSX + `selectedCardItem` prop |
| `apps/web/src/pages/assignment/scoring-config-page.tsx` | modified | 移除 `VersionStrip` import + Legacy panel 內 JSX；`ProdKindInfoBanner` 改用新 props（selectedCardType / availableCardTypes / onSwitchCardType / monthRunLocked / onSwitchTab）；新增 `handleSwitchCardType` / `handleSwitchTab` 兩個 helper；移除 `selectedCardItem` 從 `ScoringConfigLegacyTabs` 簽名與用法；移除未用的 `CardTypeListItem` import |
| `apps/web/src/pages/assignment/_components/prod-kind-badge.tsx` | modified | `size="sm"` 樣式改為 `px-2 py-0.5 text-xs font-semibold rounded` + icon 12px，對齊 prototype 身分區 badge |
| `apps/web/src/pages/assignment/__tests__/card-type-list-tab.test.tsx` | modified | TC-F069-06 翻轉（不應有連結）；6 個 既有 CardTypeListTab test 不動；新增 17 個 SelectedCardTypeBanner test |
| `apps/web/src/pages/assignment/__tests__/scoring-config-page.test.tsx` | modified | 移除 TS-F053-009 / 010；`switchToLegacyTabs` anchor 改 `btn-add-dim`；更新註解中 `getScoring caller 數量 3 → 2`（VersionStrip 拔除） |

## Architectural Decisions

### 1. Stats 為 optional / 父層暫傳 undefined

- prototype 從 mock data 算 `cascadePreview[cardType]` 等；React 端 backend 尚未提供統計 API。
- 採 spec 建議：`stats?: BannerStats` optional；當 undefined 時 KPI 列 hidden（`banner-stats` testid 不存在）。
- Shell 暫時傳 `stats={undefined}`，未來補 backend endpoint 後改傳真實資料。
- 對應 gap：見下方「Known Gaps」。

### 2. 切換器 selection=null 仍可見可開

- prototype 用 reattach DOM trick 把 switcher 移到身分區末尾；
- React 端改用條件渲染兩份 layout（placeholder vs normal），切換器各自獨立 mount。
- 行為一致：selection=null 時切換器可開、可選任一張 → 觸發 `onSwitchCardType` → 父層 `setSelected`。

### 3. ProdKindInfoBanner alias 保留

- 雖然 prototype 名稱為「目前選中卡」，但既有 import 路徑用 `ProdKindInfoBanner`；
- 保留 `export const ProdKindInfoBanner = SelectedCardTypeBanner` 維持向後相容；
- 後續 PR 可逐步將 import 改為 `SelectedCardTypeBanner` 再移除 alias。

### 4. 404 警示安置

- spec 建議「檢查 404 警示處理 (line 468) 是否需要重新安置」。
- 結論：保留原位置（Legacy 內 versionError 路徑）。原因：
  - `versionError` 來自 `fetchAll` 的 `getScoring` 404；
  - 404 時 Banner 仍會渲染（cardType 已選但版本資料無 active），banner 顯示卡基本資訊（cardName / status）；
  - Legacy panel 額外渲染 `no-active-version` 警示，提示「目前無生效的計分版本」；
  - 二者並存，無冗餘。

### 5. 切換器 panel 用 absolute 而非 portal

- spec 明確說「不要用 portal 除非有 overflow:hidden 衝突」。
- 採用 `absolute right-0 mt-2 z-20`；測試確認 panel 在 banner 內定位無衝突。

### 6. Toast 取消

- spec 建議「如果 web 沒有 toast，切換時可暫時不 toast」。
- web 有 `useToast` 但 `CardTypeSwitcher` 為 pure UI component（無 hook 依賴）；
- 切換成功的 toast 由父層 Shell 決定是否觸發；目前未加（避免噪音）。

## Known Gaps / TODO

| Gap | 描述 | 建議解法 |
|---|---|---|
| Stats API 未實作 | Banner 的 5 個 KPI（dim/score/level/tier/listDefsAffected）目前 hidden（stats=undefined）。Backend 尚無 single endpoint 同時回傳這 5 個數字 | Iter 9：新增 `GET /api/v1/assignment/scoring/card-types/{cardType}/stats` 端點 + frontend `useQuery` 寫入 Banner |
| KPI listDef 跳轉 | `onGoToListDefinitions` 目前未串接：Shell 沒傳此 prop，因為 F074 名單定義頁路由尚未建立 | F074 名單定義頁實作後補上 routing |
| BannerCardType metadata 欄位 | `cardVersion / sdate / edate / createdBy / createdAt` 在 `CardTypeListItem` 為 optional，但 `listCardTypes` API 目前不回這些欄位 | Iter 9：擴充 `GET /card-types?include=meta` 或 在 list response 直接加 metadata |
| prodKindName fallback | 已正常處理（`ProdKindBadge` isFallback 走灰色 + alert-circle icon） | 無需動作 |

## TDD 流程紀錄

1. **RED phase**：
   - 改 `card-type-list-tab.test.tsx`（翻轉 TC-F069-06 + 新增 17 個 banner test）
   - 新建 `card-type-switcher.test.tsx`（10 個 test）
   - 跑測試確認 17 個 banner test fail（Element type undefined：`SelectedCardTypeBanner` 未 export）
   - 10 個 switcher test fail（`CardTypeSwitcher` 未存在）
2. **GREEN phase**：
   - 新建 `card-type-switcher.tsx` → 10 個 switcher test PASS
   - 改寫 `ProdKindInfoBanner` → `SelectedCardTypeBanner` → 23 個 card-type-list-tab test PASS
   - 刪除 `version-strip.tsx`，更新 `tier-mapping-tab.tsx` / `scoring-config-page.tsx` 移除 import + 用法
   - 修正 test 工具 helper（`switchToLegacyTabs` anchor 改 `btn-add-dim`）
3. **Verify**：
   - 9 個 assignment test files：90 tests PASS / 12 skipped
   - 全 web typecheck：clean（我的檔案無 error；pre-existing errors 在 etl-pipelines / extraction-tasks）
   - 全 web 套件 regression：759 PASS / 5 FAIL pre-existing（c360, etl-pipelines；與本次無關）
