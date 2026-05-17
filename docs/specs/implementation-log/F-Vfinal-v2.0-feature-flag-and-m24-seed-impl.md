---
type: implementation-log
feature_id: E07-V2.0-FINAL
feature_name: E07 重構 v2.0 收尾 — FeatureFlagGuard 全 module 套用 + m24 BEST_CASE/SPEC_TP seed
status: complete
last_updated: 2026-05-17
---

# E07 重構 v2.0 收尾: FeatureFlagGuard 全 module 套用 + m24 seed — Implementation Log

## 範圍

承接 E07 重構 TDD（agentId: a19f2a99ff3f47767）v2.0 最後一項：
1. FeatureFlagGuard 全 module 套用驗證（grep regression + 補上缺漏 controller）
2. m24 migration：BEST_CASE / SPEC_TP 可選值 seed（補 F076 v1.3 AC-3 / m22 留項）
3. spec-index.md v3.2 → v3.3 升版 + 變更紀錄

預估 0.5 人日，實際完成。

## Test Results Summary

| Scenario ID | Description | Status |
|---|---|---|
| TC-SEED-BEST-CASE-001 | BEST_CASE seed Y/N 兩筆 (PostgreSQL) | PASS |
| TC-SEED-SPEC-TP-001 | SPEC_TP seed 01/02/03 三筆 (PostgreSQL) | PASS |
| TC-SEED-IDEMPOTENT-PG | ON CONFLICT (column_name, option_value) DO NOTHING | PASS |
| TC-SEED-NO-WHITELIST-INSERT | 不重複 INSERT pooldata_field_whitelist | PASS |
| TC-SEED-IDEMPOTENT-SQLITE | SQLite INSERT OR IGNORE | PASS |
| TC-SEED-DOWN | DELETE 限定 BEST_CASE / SPEC_TP IN clause | PASS |
| TC-SEED-ASSUMPTION-MARK | migration source 含 `[ASSUMPTION]` OBMCODEDF 標註 | PASS |
| TC-FEATURE-FLAG-GUARD-IMPORT × 10 | 10 個 E07 寫入 controller 都 import FeatureFlagGuard | PASS |
| TC-FEATURE-FLAG-GUARD-IMPORT-DECORATOR × 10 | 都 import RequireFeatureFlag | PASS |
| TC-FEATURE-FLAG-GUARD-USAGE × 10 | `@UseGuards(... FeatureFlagGuard ...)` 存在 | PASS |
| TC-FEATURE-FLAG-GUARD-DECORATOR × 10 | `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')` 存在 | PASS |
| TC-FEATURE-FLAG-GUARD-COUNT | E07_WRITE_CONTROLLERS 至少 10 個 | PASS |
| 既有 assignment module 全 unit tests | 71 files / 709 tests PASS | PASS |

新增 tests 合計：m24 = 7 個 + feature-flag-coverage = 41 個 = **48 個新 tests，全 PASS**。
既有 assignment 相關 661 tests 全綠不破壞（包含 controller spec 因新 guard 補 `ENABLE_E07_REFACTOR_PHASE3='true'` 後仍 PASS）。
ETL / extraction 模組 17 個 baseline 失敗與本變更無關（B6 impl log 已記錄 baseline-fail）。

## Files Changed

### 新增（4 個）

| File Path | Change Type | Description |
|---|---|---|
| `apps/api/src/database/migrations/1711360000240-SeedBestCaseSpecTpOptions.ts` | new | m24 migration：BEST_CASE Y/N + SPEC_TP 01/02/03 placeholder seed（含 `[ASSUMPTION]` OBMCODEDF 待 dump 註記） |
| `apps/api/src/database/migrations/__tests__/m24-seed-best-case-spec-tp-options.migration.spec.ts` | new | m24 migration 7 個 unit tests（含 PostgreSQL / SQLite / down / annotation 4 大類） |
| `apps/api/src/common/feature-flags/__tests__/feature-flag-coverage.regression.spec.ts` | new | 10 個 E07 寫入 controller 靜態 grep regression（41 tests），確保未來新增 controller 不會遺漏 |
| `docs/specs/implementation-log/F-Vfinal-v2.0-feature-flag-and-m24-seed-impl.md` | new | 本檔 |

### 修改 — 補 FeatureFlagGuard（6 個 controller）

| File Path | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/assignment-scoring/assignment-scoring.controller.ts` | modified | class 級 `@UseGuards(... FeatureFlagGuard ...)` + 9 個寫入 method 加 `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')`（PUT/POST/DELETE dimensions / card-levels / tier-mapping） |
| `apps/api/src/modules/assignment-scoring/controllers/card-type.controller.ts` | modified | class 級 + 3 個寫入 method（POST/PUT/DELETE） |
| `apps/api/src/modules/assignment-code/assignment-code.controller.ts` | modified | class 級 + 3 個寫入 method（POST/PUT/PUT disable） |
| `apps/api/src/modules/assignment/assignment-run.controller.ts` | modified | class 級 + 1 個寫入 method（POST `/runs` triggerRun） |
| `apps/api/src/modules/pooldata-field/controllers/pooldata-field-whitelist.controller.ts` | modified | class 級 + 3 個寫入 method（POST/PATCH/DELETE） |
| `apps/api/src/modules/pooldata-field/controllers/pooldata-field-option.controller.ts` | modified | class 級 + 3 個寫入 method（POST/PATCH deactivate/PATCH reactivate） |

### 修改 — 補 test setup

| File Path | Change Type | Description |
|---|---|---|
| `apps/api/test/setup.ts` | modified | 預設 `ENABLE_E07_REFACTOR_PHASE3='true'` 兜底（個別 unit test 仍可 override） |
| `apps/api/src/modules/assignment-code/__tests__/assignment-code.controller.spec.ts` | modified | `beforeAll` 顯式設 flag=true + `afterAll` restore originalFlag |
| `apps/api/src/modules/assignment-scoring/__tests__/card-type.controller.spec.ts` | modified | 同上 |
| `apps/api/src/modules/assignment/__tests__/assignment-run.controller.spec.ts` | modified | 同上 |

### 修改 — spec-index

| File Path | Change Type | Description |
|---|---|---|
| `docs/specs/spec-index.md` | modified | v3.2 → v3.3；新增 2026-05-17 v3.3 變更紀錄條目；既有「上一輪更新」標籤層級下移 |

## FeatureFlagGuard 套用範圍 grep 結果

涵蓋 10 個 E07 寫入 controller，分三組：

```
P0 / B2 既有（4）：
  src/modules/assignment-list/assignment-list.controller.ts          [class 級]
  src/modules/assignment-stage/stage-action.controller.ts            [class 級]
  src/modules/assignment-stage/dept-ratio.controller.ts              [class 級]
  src/modules/assignment-stage/personnel-ratio.controller.ts         [class 級]

v2.0 補入（6）：
  src/modules/assignment-scoring/assignment-scoring.controller.ts    [method 級 × 9]
  src/modules/assignment-scoring/controllers/card-type.controller.ts [method 級 × 3]
  src/modules/assignment-code/assignment-code.controller.ts          [method 級 × 3]
  src/modules/assignment/assignment-run.controller.ts                [method 級 × 1]
  src/modules/pooldata-field/controllers/pooldata-field-whitelist.controller.ts [method 級 × 3]
  src/modules/pooldata-field/controllers/pooldata-field-option.controller.ts    [method 級 × 3]
```

**套用策略對比**：
- assignment-list / assignment-stage 採 class 級（整 controller 都是寫入或 GET 也適合受 flag 控制）
- 其他 6 個採 **method 級**：class 級 `@UseGuards()` 加入 FeatureFlagGuard，但只在 PUT/POST/DELETE/PATCH method 標 `@RequireFeatureFlag`；GET 端點不受 flag 影響（讀取永遠開放，避免 rollback 時連讀都被擋）

regression test 容許 class / method 級任一形式，只要 source 中存在 `FeatureFlagGuard` + `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')` 即通過。

## m24 seed 內容（含 [ASSUMPTION] 標記）

```sql
-- BEST_CASE [ASSUMPTION] 待 OBMCODEDF OBMTYPE='BEST_CASE' 之 OBMVALUE dump 確認
INSERT INTO pooldata_field_option (column_name, option_value, option_label, is_active, ...) VALUES
  ('BEST_CASE', 'Y', '優質案件', TRUE, ...) ON CONFLICT (column_name, option_value) DO NOTHING,
  ('BEST_CASE', 'N', '一般案件', TRUE, ...) ON CONFLICT (column_name, option_value) DO NOTHING;

-- SPEC_TP [ASSUMPTION] 待 OBMCODEDF OBMTYPE='SPEC_TP' 之 OBMVALUE dump 確認
INSERT INTO pooldata_field_option (...) VALUES
  ('SPEC_TP', '01', '特殊類別 01', TRUE, ...) ON CONFLICT ... DO NOTHING,
  ('SPEC_TP', '02', '特殊類別 02', TRUE, ...) ON CONFLICT ... DO NOTHING,
  ('SPEC_TP', '03', '特殊類別 03', TRUE, ...) ON CONFLICT ... DO NOTHING;
```

**不傷既有資料**：
- 不重複 INSERT `pooldata_field_whitelist`（BEST_CASE / SPEC_TP 兩筆由 m22 owns）
- down() 限定 `column_name IN ('BEST_CASE', 'SPEC_TP')`，不動 m22 已 seed 的其他 6 個欄位 / 部長透過 F076 手動新增的紀錄
- Idempotent：PostgreSQL ON CONFLICT DO NOTHING / SQLite INSERT OR IGNORE

**未來補修路徑**：待用戶取得 OBMCODEDF 真實 dump 後，以 m25+ migration 補對齊 OBMVALUE / OBMDESC（如 SPEC_TP 真實列舉可能與本 placeholder 不同）。

## 整體 v2.0 完成度總覽

| 項目 | 狀態 | 對應 impl log |
|---|---|---|
| **v2.0 B1** business_role 整合 | DONE | AD-E07-v3.0-P1-B1-business-role-impl.md |
| **v2.0 B2** RBAC 替換 + M01 CRUD | DONE | AD-E07-v3.0-P1-B2-rbac-replace-m01-crud-impl.md + supplementary |
| **v2.0 B4** monthly-run 月跑 + stage0 estimate + pipeline v2 + snapshot | DONE | AD-E07-v3.0-P1-B4-* 系列 |
| **v2.0 B6** snapshot history + xlsx export | DONE | AD-E07-v3.0-P1-B6-snapshot-history-impl.md + F064-v2.0-B6-xlsx-export-impl.md |
| **v2.0 補 FeatureFlagGuard 全套用** | **DONE（本輪）** | 本檔 |
| **v2.0 補 m24 BEST_CASE/SPEC_TP seed** | **DONE（本輪）** | 本檔 |
| **v2.0 補 spec-index v3.3** | **DONE（本輪）** | 本檔 |
| **P2** stage-actions 補完 | DONE | E07-P2-stage-actions-impl.md + E07-P2-supplementary-impl.md |

## E07 重構終局報告 — 後端 P0~P2 + v2.0 全部完成

### 完成範圍

**P0 共用基礎建設**（AD-E07-v3.0-P0-shared-infra-impl.md）：
- `DirectorGuard` / `SectionChiefGuard` / `DirectorOrSectionChiefGuard` 三 Guard 體系
- `FeatureFlagGuard` + `@RequireFeatureFlag` 裝飾器（503 FEATURE_NOT_ENABLED）
- `AssignmentRunGuardService.assertNoRunningRun()` 月跑互斥
- `SectionChiefScopeService` 處長轄區過濾
- `PersonnelRatioValidationService` / `RatioValidationService` / `StageTransitionService`
- m14 `business_role` migration + 錯誤碼 `E07_ROLE_NOT_ASSIGNED` / `E07_REQUIRES_DIRECTOR` / `FEATURE_NOT_ENABLED`

**P1 B1~B6** 業務功能：
- B1：business_role 整合（廢 is_sales_manager / e07_role 正交雙欄）
- B2：M01 名單 CRUD（F048/F050/F051/F052/F077）+ Director 寫入 + DirectorOrSectionChief 讀取
- B4：M03 月跑（F061~F067）+ stage0 估算（F049）+ pipeline v2 + snapshot
- B5：POOLDATA 白名單 + 可選值（F075/F076 含 m22 seed）
- B6：snapshot history + xlsx 匯出（F064 50k 筆 streaming + F067 mismatch 3-sheet）

**P2** stage actions：F078~F089 五階段流程（advance / rollback / approve / reject / personnel-ratio scope filter）

**v2.0 收尾**（本輪）：FeatureFlagGuard 全 module 套用 grep regression + m24 BEST_CASE/SPEC_TP seed + spec-index v3.3

### 既有 PASS 全綠

| 模組 | tests |
|---|---|
| assignment + assignment-list + assignment-stage + assignment-scoring + assignment-code + pooldata-field + common/feature-flags + database/migrations | **709 / 709 PASS** |
| 本輪新增 | **48 PASS**（m24 = 7 + feature-flag-coverage = 41） |
| ETL / extraction baseline-fail（與本變更無關） | 17 failed（已存在於 B6 impl log baseline，與 v2.0 補項無關） |

## 下一步建議

**1. （優先）前端 FE 階段**
- E07 後端已全綠且穩定，可進入前端對接：
  - `/scoring-config`、`/assignment-codes`、`/assignment-runs`、`/pooldata-fields` 等管理頁
  - `/assignment-lists` M01 名單 CRUD 與五階段流程操作 UI
  - 月跑進度 / 結果摘要 / 匯出 / 比對頁
- 參考 `/prototypes/28-scoring-config.html` 等 prototype 與 ui-ux-design-overview.md

**2.（可選）git commit v2.0**
- 建議分 3 個 commit：
  1. `feat(api/feature-flags): v2.0 補 FeatureFlagGuard 套用至 6 個 E07 寫入 controller`
  2. `feat(api/db): m24 seed BEST_CASE / SPEC_TP placeholder options [ASSUMPTION OBMCODEDF]`
  3. `docs(specs): spec-index v3.2 → v3.3 + 本輪 impl log`

**3.（待用戶提供）OBMCODEDF dump**
- 用以驗證 / 補修 m24 之 BEST_CASE / SPEC_TP placeholder 值；以 m25+ migration 對齊真實 OBMVALUE / OBMDESC

## 架構決策（本輪）

1. **method 級套用 vs class 級**：assignment-scoring / card-type / assignment-code / assignment-run / pooldata-field 採 method 級，僅寫入 endpoint 受 flag 影響；GET 端點不受影響，rollback 時用戶仍可讀取資料（最小破壞性）。
2. **test/setup.ts 預設 flag=true 兜底**：避免每個既有 controller spec 都要顯式設 flag；個別 TC-FF tests（如 assignment-list controller spec）仍可顯式 `delete` / `'false'` override。
3. **regression test 採靜態 grep**：在不啟動 NestJS app 的前提下做 source-level 覆蓋驗證，速度快（< 10ms / 41 tests）、零 runtime DI 風險。
4. **m24 與 m22 解耦**：m24 只 seed pooldata_field_option，不重複 INSERT pooldata_field_whitelist（m22 owns），down 限定 IN clause，未來補修 OBMCODEDF dump 不需動 m22。

## Blocking Issues

無。

## 驗收清單

- [x] m24 migration 7 個 tests PASS
- [x] feature-flag-coverage regression 41 個 tests PASS
- [x] 6 個 controllers 補 FeatureFlagGuard 完成
- [x] 既有 709 unit tests 全綠（assignment-related 模組）
- [x] spec-index.md v3.2 → v3.3 升版
- [x] 變更紀錄 2026-05-17 v3.3 條目補入
- [x] impl log 產出（本檔）
- [x] [ASSUMPTION] OBMCODEDF 標註於 m24 source
