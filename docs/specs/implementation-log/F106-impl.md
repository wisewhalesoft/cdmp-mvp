---
type: implementation-log
feature_id: F106
feature_name: 顯示停用計分維度並支援重新啟用（M02 Tab 2）
status: complete
last_updated: 2026-06-25
---

# F106：顯示停用計分維度並支援重新啟用 — 實作紀錄

## 摘要

打通「停用計分維度」在 M02 Tab 2 的可見性與啟用管線，與既有 F054 disable 對稱補完：

1. **後端讀取**：`getScoring()` 移除維度查詢 `status='active'` 過濾，一律回傳 active + inactive 全部維度，每維度補 `status` 欄位（AC-2 / BR-1 / OQ-164-2）。
2. **後端寫入**：新增 `PUT /assignment/scoring/dimensions/:columnName/enable`，完全對稱 disable（同 guard / feature flag / 月名單分派鎖 / cardType 範圍鎖 / 404 語意 / audit），僅狀態方向相反（AC-3 / AC-4 / §5.3）。
3. **前端**：Tab 2 顯示 inactive 列（列級灰底弱化 + 狀態 chip），inactive 列以「啟用」鈕取代「停用」鈕；移除 `?? 'active'` fallback；Tab badge 與「共 N 個維度」只計 active；月名單分派鎖時啟用 / 停用 一併 disabled。

**無新錯誤碼、無新 DB 欄位、無 migration**（沿用既有計分設定錯誤體系與 `ob_levelcard_column.status`）。

## 測試結果

| Scenario ID | 描述 | Status |
|-------------|------|--------|
| TS-F106-001（unit + e2e） | enable 成功 → status=active，回 enabledAt | PASS |
| TS-F106-002（unit + e2e） | audit ENABLE，before inactive / after active，entity_id={cardType}\|{cardVersion}\|{columnName} | PASS |
| TS-F106-003（unit + e2e，BR-3） | 對已 active 維度 enable → 404 SCORING_COLUMN_NOT_FOUND | PASS |
| TS-F106-004（unit + e2e，AC-5） | 月名單分派鎖 → 409 SCORING_VERSION_LOCKED | PASS |
| TS-F106-005（unit） | 不存在 column → 404 | PASS |
| TS-F106-006（unit / e2e 權限） | findOne 限定 status='inactive'；非部長 enable → 403 | PASS |
| TS-F106-007（unit，§5.3 EQ） | disable→enable→disable 往返狀態 + audit 軌跡逐項對稱 | PASS |
| F106 AC-2（unit + e2e） | getScoring 回 active + inactive，每維度含 status；columnRepo.find 不帶 status 過濾 | PASS |
| TS-F054-009（e2e，F106 修正） | 停用後 GET /scoring 仍含該維度且 status=inactive | PASS |
| TS-F106-FE-01 | 清單同顯 active + inactive，狀態 chip + 列級弱化（data-inactive） | PASS |
| TS-F106-FE-02 | inactive 列顯啟用鈕（無停用）、active 列顯停用鈕（無啟用） | PASS |
| TS-F106-FE-03 / 04（OQ-164-4） | 「共 N 個維度」與 Tab badge 只計 active | PASS |
| TS-F106-FE-05 / 06 | 啟用確認 Modal → enableDimension + toast；取消不發 API | PASS |
| TS-F106-FE-07（AC-5） | 月名單分派鎖時啟用 / 停用 鈕一併 disabled | PASS |

**後端**：assignment-scoring 模組 272 unit tests 全綠（含新增 F106 enable spec 7 個 + F053 getScoring 改寫 2 個）。F106 E2E 6 個全綠。
**前端**：scoring-config-page 46 tests 全綠（新增 F106 7 個）；assignment 目錄 597 tests 全綠。
**型別**：後端 `tsc --noEmit -p tsconfig.build.json` 零錯誤；前端 `tsc -b` 與 baseline 完全相同（73 個皆為 repo 既有 TS6133 等 pre-existing，F106 新增程式碼零型別錯誤）。

## 變更檔案

| 檔案 | 類型 | 說明 |
|------|------|------|
| apps/api/src/modules/assignment-scoring/assignment-scoring.service.ts | modified | `getScoring()` 移除 status 過濾 + 映射 status；新增 `enableDimension()` + `EnableDimensionResult`；`ScoringDimensionItem.status`；`writeAudit` action union 加 'ENABLE' |
| apps/api/src/modules/assignment-scoring/dto/enable-dimension-query.dto.ts | new | 鏡像 DisableDimensionQueryDto（cardType 必填 / MaxLength 5） |
| apps/api/src/modules/assignment-scoring/assignment-scoring.controller.ts | modified | 新增 `@Put('dimensions/:columnName/enable')`（同 class guard + @RequireDirector + @RequireFeatureFlag） |
| apps/api/src/modules/assignment-scoring/__tests__/assignment-scoring-f106-enable.service.spec.ts | new | enable 7 個 unit test（含 §5.3 往返對稱 EQ） |
| apps/api/src/modules/assignment-scoring/__tests__/assignment-scoring-f053.service.spec.ts | modified | 原 BE-F053-001（過濾 active）改寫為 F106 AC-2 兩個測試（含 inactive + status） |
| apps/api/test/assignment-scoring.e2e-spec.ts | modified | 新增 enable E2E 區塊；改寫 BE-F053-001 / TS-F054-009 對齊 F106；seed 補 match_type（修 pre-existing 阻擋） |
| apps/web/src/api/assignment-scoring.ts | modified | `ScoringDimensionItem.status` 改必填；新增 `enableDimension()` |
| apps/web/src/pages/assignment/scoring-config-page.tsx | modified | 移除 `?? 'active'` fallback；DimensionsTab inactive 列級弱化 + 啟用鈕；EnableConfirmModal；dimCount / 共 N 個維度只計 active |
| apps/web/src/pages/assignment/__tests__/scoring-config-page.test.tsx | modified | fixtures 補 status；改寫 TS-F054-NEW-06；新增 F106 前端 7 個測試 |

## 架構決議（spec 範圍內）

- **getScoring status 映射**：`col.status === 'active' ? 'active' : 'inactive'`（任何非 'active' 一律歸 inactive），避免回傳未知狀態值給前端。排序維持依 column_name 升冪（active / inactive 混排，分群屬前端視覺）。
- **enable 完全對稱 disable**：唯一差異 = `findOne(status='inactive')`（disable 為 'active'）、status 寫 'active'、audit action 'ENABLE'、回 `enabledAt`。月名單分派鎖 / cardType 範圍鎖 / 404 / entity_id 行為一致。
- **前端 badge / 共 N 個維度只計 active（OQ-164-4）**：`dimensionsQuery` queryFn 端 filter active 供 Tab badge；DimensionsTab 內以 `activeCount` 供表格底部，inactive 仍完整顯示於列。
- **enable 圖示 / 色調**：採 lucide `Power` + 綠色（`#10B981`），對稱 disable 的 `Ban` + 琥珀色，符合 UI-3「成功色調」。

## 既有測試退化 / pre-existing 說明（誠實）

- **無 F106 相關退化**。後端 assignment-scoring unit 全綠、前端 scoring-config-page 全綠。
- **E2E pre-existing**：`apps/api/test/assignment-scoring.e2e-spec.ts` 在 baseline 已有 **30 個失敗**，根因＝該檔多處 seed 將 `ObLevelcardColumn` 存入但未帶 `match_type`（entity NOT NULL），與 F106 無關。本次只修了 F106 用到的 seed helper（`seedHWithAccountAge`）與新增 / 改寫測試的 seed，淨失敗由 30 降至 **26**（其餘 26 屬其他 seed 區塊的同一 pre-existing bug，超出 F106 範圍未動）。F106 相關 6 個 E2E + 改寫的 BE-F053-001 / TS-F054-009 全綠。
- **前端 tsc -b**：repo baseline 既有 73 個 TS error（App.tsx / etl-pipelines / c360 / datasources 等 TS6133/TS2769），與 F106 無關；本次變更後維持 73 個（diff 完全相同，F106 程式碼零新增型別錯誤）。題庫所述「既有 10 個 etl 模組 fail」屬此類 pre-existing，與本次無關。

## 邊界遵循

- 只改 `apps/api`（assignment-scoring service/controller/dto/test + e2e）+ `apps/web`（API client / page / test）。
- 未改原型、spec / AD / story；未做 decode UI（OQ-164-1 out of scope）；未加前端 toggle（OQ-164-5）。
- 沿用既有 `/assignment/scoring` 路由，無新頁 / 側欄項目（§7 確認）。
- 無 migration。
