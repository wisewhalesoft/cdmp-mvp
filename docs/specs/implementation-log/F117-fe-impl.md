---
type: implementation-log
feature_id: F117
feature_name: 部門比例設定頁僅提供「有在職處長」之部門設定（前端）
status: complete
last_updated: 2026-08-04
---

# F117: 部門比例設定「有在職處長」過濾 — 前端實作紀錄

> 本檔僅涵蓋 **前端（apps/web）** 側。後端（apps/api）見 `F117-impl.md`。

## 1. 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|---|---|---|
| TS-F117-FE-001 | 孤兒列 `ration` input 為 `disabled`（`ration-input-locked`） | PASS |
| TS-F117-FE-002 | 「無在職處長」琥珀徽章顯示；與「已下線」灰徽章並存且可區分（BR-10） | PASS |
| TS-F117-FE-003 | 孤兒鎖定列操作欄不渲染任何寫入動作（AC-4） | PASS |
| TS-F117-FE-004 | 加總涵蓋孤兒鎖定列：可編輯 60 + 鎖定 40 = 100（AC-5） | PASS |
| TS-F117-FE-005 | `hiddenNoDirectorCount > 0` → 資訊列顯示且含數字；= 0 → 不渲染（AC-8） | PASS |
| TS-F117-FE-006 | 可編輯部門數 = 0 → AC-7 空狀態顯示、儲存停用；文案不含舊誤導字串 | PASS |
| TS-F117-FE-007 | 空狀態與孤兒鎖定列並存（AC-7 末句） | PASS |
| TS-F117-FE-008 | 頁面層：可編輯部門數 = 0 →「儲存並推進」停用（AC-7） | PASS |
| F079 既有 10 案 | `DeptRatioForm (M03a / F079)` 全數未回歸 | PASS |

其他 ring gate（前端側）：

| Gate | 指令 | 結果 |
|---|---|---|
| Component tests | `npx vitest run src/pages/assignment/__tests__/dept-ratio-{form,config-page}.test.tsx` | exit 0（2 files / 30 tests 全綠） |
| 全套回歸（CI lane 3） | `npm test --workspace=apps/web` | exit 0（126 files / 1615 passed / 0 failed） |
| Coverage | `npm run gate:coverage:dept-ratio` | PASS（Stmts 95.77 / Branch 83.44 / Funcs 81.48 / Lines 95.77，門檻 80/75/80/80） |
| Dependency | `npm run deps:check` | PASS（0 violation，191 modules / 904 deps） |
| Typecheck | `npx tsc -b` | exit 1，**70 error 全為既有型別債**（見 §4） |

## 2. 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|---|---|---|
| `apps/web/src/api/assignment-stage.ts` | modified | `getDeptRatios` 新增 `requireDirector` opt（AC-1）；`DeptRatioItem` 增 `hasActiveDirector` / `isRatioEditable`；`GetDeptRatiosResponse` 增 `hiddenNoDirectorCount`。三者皆標 optional 以相容 F117 實作前之回應（AC-10 回歸基準） |
| `apps/web/src/pages/assignment/_components/dept-ratio-form.tsx` | modified | 三分類渲染主體：`isLockedRow()` 判定、孤兒鎖定列（disabled input + 琥珀徽章 + 操作欄無寫入動作）、`HiddenDeptsNotice`（AC-8）、`NoActiveDirectorEmptyState`（AC-7）、`OrphanLockedExplain`（AC-3 末句）、`DeptRatioSumBanner` 加總含鎖定列 + 加總組成說明（AC-5） |
| `apps/web/src/pages/assignment/dept-ratio-config-page.tsx` | modified | 摘要卡 description 改為「各有在職處長的部門」（對齊 AC-1）；導航去向收斂為 `goToListDefinitions()`。AC-7 之「推進停用」由表單層 `canSubmit` 統一決定，頁面層不另設第二套判定 |

無 schema / migration 變更；未新增依賴。

## 3. 實作決策（皆在 spec 邊界內）

1. **鎖定判定只信後端欄位**：`isLockedRow(row) = row.isRatioEditable === false`。刻意用 `=== false` 而非 falsy 檢查，使 `undefined`（F117 實作前之舊回應）視為可編輯，確保 AC-10 回歸。**不得**以 `directorName` 字串推導（F117 §5.1 欄位語意；`directorName` 為顯示用，`hasActiveDirector` 才是判定用）。
2. **AC-1 只有設定頁帶旗標**：`requireDirector: true` 僅出現於 `dept-ratio-form.tsx`。已驗證另一既有呼叫端 `ready-summary-detail-page.tsx`（F088 準備完成摘要）維持 `{ excludeZeroRatio: true }` 不變，符合 AC-10。
3. **BR-4 不由前端保證**：PUT payload 僅含可編輯列（孤兒列前端無從變更，AC-4）。孤兒列之保留是**伺服器端不變式**（BR-4/BR-5），前端過濾不構成實作。前端加總校驗涵蓋鎖定列（AC-5），與後端 `finalRows` 之判定基準（BR-7）一致，故不會出現「前端顯示 100% 但後端回 `RATIO_SUM_NOT_100`」之落差。
4. **AC-7 空狀態與表格並存**：表格區以 `rows.length > 0` 為條件、空狀態以 `hasEditableDept === false` 為條件，兩者條件不同，因此「可編輯數 = 0 但有孤兒列」時依 spec 末句同時渲染。`dept-ratio-form` 錨點僅於 `rows.length > 0` 掛載，對齊 prototype 29a 之 `tableSection` / `emptyState` 互斥呈現。
5. **空狀態文案**：刻意不沿用「目前無在職部門可設定」——該字串會被誤讀為 `ob_emphire` 同步異常；改以「系統已完成查詢，這並非資料同步問題」明確排除誤讀（AC-7）。
6. **AC-5 加總組成說明**：`lockedSum > 0` 時另渲染 `dept-ratio-sum-breakdown`，說明「可編輯 X% ＋ 鎖定 Y%」，使加總含一個不可調整的值不致被視為 UI bug。
7. **狀態標示互不混淆（§7 / BR-10）**：「已下線」= 灰徽章（`isActive = false`）、「無在職處長」= 琥珀膠囊徽章（`isRatioEditable = false`），兩者為正交維度、同列可並存，皆有各自 `data-testid`。

## 4. 已知偏離 / 非本 feature 可解事項

1. **`未設代理` 紅點未於 React 落地（spec-backed，非遺漏）**
   - prototype 29a 之 `noDeputy` 紅點為 demo-only 欄位。查證 **F079 BR-14** 明載：「不過濾 `noDeputy` 旗標（v1.3 PO 決議：**MVP 不引入代理機制**）」，且全 repo（`apps/api/src`、`apps/web/src`）查無任何 deputy 資料來源。
   - 依「衝突時以 F079 為準」之流程契約，前端不得為無資料來源之狀態渲染 UI（將構成 speculative / dead code）。
   - F117 §7 之「不得移除」義務已滿足：prototype 未被更動；孤兒鎖定列採**琥珀**而非紅色視覺語彙，未沿用亦未混用其語意。
   - 連帶：列狀態圖例渲染 3 種（可編輯 / 唯讀鎖定 / 已下線）而非 prototype 的 4 種，理由同上（不為不可能出現的狀態標圖例）。ring 之 component 測試與 `e2e/tests/fidelity-f117-dept-ratio.spec.ts` 均未對圖例設斷言。
2. **`npx tsc -b` exit 1 — 70 個既有型別債，與 F117 無關**
   - 已獨立驗證：`git stash push -- apps/web` 後 `npx tsc -b --force` 同樣 exit 1 / 70 error，排序後 `diff` 為 **IDENTICAL_OUTPUT**（本 feature 新增 0 error）。
   - 分布：28 個在 `__tests__/*.test.tsx`（依 ring 規則實作者不得編輯測試檔）；其餘 42 個散落 8 個與 F117 無關之模組（`etl-pipelines/editor`、`datasources/dashboard-tab`、`extraction-tasks`、`App.tsx`）。
   - 符合 `.github/workflows/ci.yml` lane 3 之既有註記：「apps/web 的 `tsc -b` build 目前有 pre-existing 型別債 …… 不跑 web build」。清理屬獨立技術債工項，不在 F117 範圍。
