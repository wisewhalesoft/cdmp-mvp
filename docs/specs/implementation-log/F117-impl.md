---
type: implementation-log
feature_id: F117
feature_name: 部門比例設定頁僅提供「有在職處長」之部門設定（後端）
status: complete
last_updated: 2026-08-04
---

# F117: 部門比例設定「有在職處長」過濾 — 後端實作紀錄

> 本檔僅涵蓋 **後端（apps/api）** 側。前端（apps/web）由前端 runner 另行記錄。

## 1. 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|---|---|---|
| TS-F117-UNIT-001~020 | `dept-ratio.service.spec.ts`（mock repo，SQLite 軌之單元層） | PASS（20/20） |
| TS-F117-INT-001 | GET `requireDirector=true` → 三分類（可編輯 / 孤兒鎖定 / 隱藏） | PASS |
| TS-F117-INT-002 | PUT 孤兒保留全流程（真實 DB round-trip，BR-4） | PASS |
| TS-F117-INT-003 | PUT 無處長新配置 → 422 `RATIO_DEPT_DIRECTOR_REQUIRED` | PASS |
| TS-F117-INT-004 | `section_chief` → GET/PUT 403（AC-9 回歸） | PASS |
| TS-F117-INT-005 | admin 等價 director（F079 BR-7） | PASS |
| TS-F117-INT-006 | GET 不帶 `requireDirector` → 回應與實作前一致（AC-10 回歸） | PASS |

其他 ring gate（後端側）：

| Gate | 指令 | 結果 |
|---|---|---|
| Typecheck | `tsc --noEmit -p apps/api/tsconfig.build.json` | exit 0（0 error） |
| Coverage | `npm run gate:coverage:dept-ratio` | PASS（Stmts 88.15 / Branch 91.46 / Funcs 95 / Lines 88.15，門檻 80/75/80/80） |
| Complexity | `npm run gate:complexity` | PASS（complexity ≤ 10、max-lines-per-function ≤ 80、max-depth ≤ 4、max-lines ≤ 400） |
| Dependency | `npm run deps:check` | PASS（0 error；11 warn 皆為既有 no-orphans，非本 feature 觸及） |
| Mutation | `npx stryker run` | PASS（**75.36%** ≥ break 70；156 killed / 47 survived / 4 no-cov）—— ring 設定已由 test-generator 修復，見 §4 |
| Unit（全 apps/api，排除環境性 `*.mssql.spec.ts`） | `npx vitest run --exclude "**/*.mssql.spec.ts"` | PASS（194 files / 2836 tests，0 fail）—— 確認無跨模組回歸 |

## 2. 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|---|---|---|
| `apps/api/src/modules/assignment-stage/dept-ratio.service.ts` | modified | 核心：`computeActiveDirectorMap()` 抽取為 GET/PUT 唯一處長判定來源；GET 逐列 `hasActiveDirector` / `isRatioEditable` + 回應層 `hiddenNoDirectorCount`；PUT 實作 BR-4/5/6/7/9 |
| `apps/api/src/modules/assignment-stage/dept-ratio.controller.ts` | modified | GET 新增 `requireDirector` query flag（沿用既有 `excludeZeroRatio` 之 `'true' \| '1'` 慣例，抽出 `isTruthyFlag()`） |
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 `RATIO_DEPT_DIRECTOR_REQUIRED`（碼 + 預設訊息） |

無 schema / migration 變更（符合 spec 前提）。

## 3. 實作決策（皆在 spec 邊界內）

1. **處長判定單一來源（BR-1 / AC-2）**：`computeActiveDirectorMap()` 為 GET 與 PUT 共用之唯一實作，在職條件一律取 `common/emphire/emphire-active.util` 的 `activeEmphireCondition`（`resign_date IS NULL OR >= 系統日`，哨兵 `9999-12-31`）。**未使用** `resign_date IS NULL`——真實資料無 NULL，會判全員離職而回空清單。同部門多處長以 `hire_date ASC`（NULL 排最後）取最早到職者。
2. **BR-4 為伺服器端不變式**：PUT 於覆寫式 DELETE+INSERT 前先讀既有列，識別孤兒（無在職處長且既有 `ration > 0`），`buildFinalRows()` 以「payload（濾除孤兒代碼）∪ 孤兒既有值」組成最終集合。孤兒列連同原 `created_by` / `created_at` 一併寫回（「原樣寫回」語意）。前端是否送出孤兒列完全不影響結果。
3. **BR-7 加總驗證對象**：`ratioValidation.assertEachInRange` / `assertSumEquals100` 的輸入為 `finalRows.map(r => r.ration)`，非原始 payload；因此「payload {A:100} + 孤兒 B:40 → 140 → 422 `RATIO_SUM_NOT_100`」成立。
4. **BR-6 早於加總驗證**：`assertDirectorAssigned()` 先於比例驗證執行，確保無處長新配置回 `RATIO_DEPT_DIRECTOR_REQUIRED` 而非被 `RATIO_SUM_NOT_100` 掩蓋；訊息帶入部門代碼（AC-6）。
5. **錯誤信封**：沿用全 repo 既有扁平慣例 `{ error: 'CODE', message }`（`UnprocessableEntityException` + `HttpExceptionFilter`），不為本錯誤碼另立巢狀 `{ error: { code } }`。F117 §1 明言不變更 F079 既有錯誤語意。
6. **AC-10 回歸保護**：`requireDirector` 預設 false，`applyVisibilityFilters()` 於旗標未帶時完全不過濾且 `hiddenNoDirectorCount` 恆為 0；`hasActiveDirector` / `isRatioEditable` 為**新增**欄位（既有消費端逐欄位讀取，不受影響）。與 `excludeZeroRatio` 正交（BR-8）：`hiddenNoDirectorCount` 於 `excludeZeroRatio` 套用**前**計算，故只計「因無處長而隱藏」之數量。
7. **BR-11 未動**：F081 rollback 的 `DELETE` 全部列（含孤兒列）語意完全未修改。
8. **BR-10 正交性**：`isActive`（部門是否仍有在職員工）與 `hasActiveDirector` 各自獨立計算，互不覆寫。

## 3a. 本輪（第 2 輪）production 修正

**`resolveDeptName()` fallback 語意回歸修正（AC-10）**：第 1 輪重構時，部門顯示名稱之
fallback 由 nullish（`??`）誤改為 falsy（`||`）。差異僅在「既有 `ob_dept_pct` 列之
`obdeptnm` 為空白字串」之退化情境：F117 實作前回傳空字串（不 fallback），改為 `||` 後
會 fallback 到員工主檔部門名。此為既有消費端（準備完成摘要 `excludeZeroRatio=true` /
Detail Drawer）之**逐欄位輸出變動**，違反 AC-10「與本 feature 實作前完全一致」。

F117 §1 明定本 feature「僅疊加限縮規則、不改變 F079 既有語意」，故已還原為
`existingRow?.obdeptnm?.trim() ?? activeName ?? code` 並加註不得改回 `||` 之理由。
ring 測試兩軌皆未覆蓋此退化情境（還原前後皆綠），屬主動的 spec 保真修正而非測試驅動。

## 4. 已解除之阻塞事項（ring 設定，由 test-generator 於本輪修復）

- **（已解除）Mutation gate 無法產出分數**：原 `apps/api/stryker.conf.json` 之 `vitest.configFile` 指向 `vitest.config.ts`，其 `include` 為 `['src/**/*.spec.ts','test/**/*.spec.ts']`，因而：
  1. 把整條真實 dev-MSSQL 軌拉進 dry run → `mssql-p1b1.mssql.spec.ts` TS-MSSQL-P1B1-DEFAULT-002（HEAD baseline 即失敗之 UTC+8 時差案例）使 DryRunExecutor 中止；
  2. 同時**排除**了 F117 自己的整合測試（`test/f117-*.e2e-spec.ts` 不符 `*.spec.ts` glob）。
- 實測（同一份 production 程式碼、同一份 ring 測試，僅將 stryker 的 vitest include 換成「F117 unit spec + F117 integration spec」）：
  - 僅 unit spec → **64.90%**（135 killed / 70 survived），低於 break 70；
  - unit + integration spec → **75.00%**（156 killed / 49 survived），**通過** break 70。
  - 差異來源為 `computeActiveDirectorMap()` / `computeActiveDeptMap()` 內 TypeORM QueryBuilder 的 SQL 字串常數突變——mock repo 的單元測試在結構上無法殺死，唯有真實 SQLite round-trip 可殺。
- **📍 後續（2026-08-05）**：`stryker.conf.json` / `vitest.mutation.config.ts` 已拆分為 `stryker.dept-ratio.conf.json` + `stryker.assignment-list.conf.json` 並刪除（理由見 `risks-and-gaps.md` R-F118-08）。以下為當時之解除紀錄。
- **解除方式**：test-generator 已新增 `apps/api/vitest.mutation.config.ts`（include 縮限為 F117 unit spec + F117 integration spec）並將 `stryker.conf.json` 之 `vitest.configFile` 指向之。本輪實跑 `npx stryker run` → **75.36%**、EXIT 0。production 側無對應改動（如當初判定）。

### 4a. 尚存之突變存活者（測試覆蓋缺口，非 production 缺陷；供 test-generator 參考）

兩個具診斷價值、且**已確認 production 程式碼正確**的存活突變：

1. `buildFinalRows()` 之 `.filter((r) => !orphanIds.has(deptKey(r.obdeptId)))` 被整段移除仍存活。
   原因：移除後孤兒部門會在 `finalRows` 中出現兩次（payload 竄改值 + 保留之既有值），
   而 BE-009 的情境（payload `{A:60, B:0}`、既有 `B:40`）加總恰為 `60+0+40=100`，
   加總斷言無法分辨。該 filter 是 BR-5 的實際執行點，且可避免真實 DB 對同一
   `(project_workym, list_no, obdeptid)` 重複 INSERT 而撞 PK。建議補一條斷言
   「最終寫入之 dept 代碼集合無重複」或直接斷言 B 的持久化值 = 40。
2. `isDirectorSetter()` 之 `setter.role === 'admin'` 分支存活（可變為 `false` 或 `""`）。
   屬 F088 v1.3 既有邏輯（非 F117 觸及），現有測試僅覆蓋 `business_role` 軸，
   未覆蓋 `role = 'admin'` 且 `business_role !== 'director'` 之組合。
