---
type: implementation-log
feature_id: US-144
feature_name: best_case 鎖定為系統固定篩選條件（Design A）
status: complete
last_updated: 2026-05-28
---

# US-144（F050 v2.3.1 / F051 v2.2.1 / F075 v1.7）：best_case 系統固定篩選條件 — 實作紀錄

## 測試結果摘要

| 場景 ID | 說明 | 狀態 |
|---|---|---|
| TS-F050-L01~L05 | createList 注入 / tamper 正規化 / copy-from-prev | PASS |
| TS-F050-M01~M04 | validateConditionPayload min-count 排除 system-fixed + 驗證順序 | PASS |
| TS-F050-N01~N04 | updateList 注入 / 竄改 / null-payload / stage guard 先於注入 | PASS |
| TS-F051-021~025 | updateList 竄改 / min-count / LEGACY readonly | PASS |
| TS-F050-O01~O06 | m295 ADD COLUMN / best_case=true / idempotent / down | PASS |
| TS-F050-O07~O10 | m296 draft-only 回填 / 正規化 / idempotent / down | PASS |
| TS-F050-P01 | Stage 1 composer 注入後產生 `"best_case" IN ('Y')` | PASS |
| TS-F050-Q01~Q06 | 建立頁鎖定列 / dropdown 排除 / 最低條件數阻擋 | PASS |
| TS-F050-R01~R03 | 編輯頁鎖定列 / dropdown 排除 / 最低條件數阻擋 | PASS |
| TS-F075-v17-001~006 | is_system_fixed seed / isSystemFixed 暴露 / deactivation guard（PATCH+DELETE） | PASS |
| TS-F075-v17-007~010 | M06 system-fixed badge / 停用按鈕 disabled / click 不發 API | PASS |

後端 unit/migration：161 tests PASS（7 檔）。後端 e2e（pooldata-field-whitelist）：14 PASS。
前端 assignment 全套：592 PASS / 29 skip。

## 變更檔案

### Backend（apps/api）
| 路徑 | 類型 | 說明 |
|---|---|---|
| src/database/entities/pooldata-field-whitelist.entity.ts | modified | 新增 `isSystemFixed`（@Column name=is_system_fixed boolean default false） |
| src/common/errors/error-codes.ts | modified | 新增 SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE（碼 + 訊息「此為系統固定篩選欄位，無法停用」） |
| src/modules/assignment-list/assignment-list.service.ts | modified | SYSTEM_FIXED_VALUE_MAP + injectSystemFixedConditions + loadSystemFixedFields；validateConditionPayload 新增 systemFixedColumnNames 參數（min-count 排除）；createList / updateList 接線（§18.12.5 呼叫順序，stage guard 先於注入） |
| src/modules/pooldata-field/services/pooldata-field-whitelist.service.ts | modified | PooldataFieldItem + _toItem 暴露 isSystemFixed；updateField（isActive=false）+ disableField deactivation guard 回 422 |

### Migrations（apps/api/src/database/migrations）
| 路徑 | 類型 | 說明 |
|---|---|---|
| 1711360000295-AddIsSystemFixedToPooldataFieldWhitelist.ts | new | ADD COLUMN（PG IF NOT EXISTS / SQLite PRAGMA guard）+ backfill false + best_case=true；down() DROP COLUMN |
| 1711360000296-BackfillBestCaseConditionPayloadDraftLists.ts | new | draft+NOT NULL 名單回填 best_case:['Y']；PG JSONB / SQLite TEXT 雙模式；idempotent；down() 移除注入 |

### Frontend（apps/web）
| 路徑 | 類型 | 說明 |
|---|---|---|
| src/api/pooldata-fields.ts | modified | PooldataField 新增 `isSystemFixed?: boolean` |
| src/pages/assignment/list-create-draft-page.tsx | modified | 鎖定列（condition-row-best_case / value-best_case / 無 remove）；dropdown 排除；最低條件數文案；copy 排除 system-fixed |
| src/pages/assignment/list-edit-draft-page.tsx | modified | 同上；載入後自 user conditions 過濾 system-fixed（避免重複列） |
| src/pages/assignment/_components/fields-tab.tsx | modified | field-row-{col} + data-system-fixed；系統固定 badge；停用按鈕 disabled+aria-disabled |

### 測試（new/modified）
- new：migrations/__tests__/m295-*.spec.ts、m296-*.spec.ts
- modified：create-list-v2.1.spec.ts（L+M04）、validate-condition-payload.spec.ts（M）、update-list-v2.1.spec.ts（N）、stage1-query-composer.spec.ts（波7/P）、pooldata-field-whitelist.service.spec.ts（v17 guard）、test/pooldata-field-whitelist.e2e-spec.ts（v17 整合）、前端 list-create/edit/field-base 三 test 檔

## 4 個 test-designer flags 解法
1. **stage guard 先於注入（updateList）**：updateList 在 `if (hasDtoPayload)` 內，stage guard（step 6）位於 loadSystemFixedFields + validate + injectSystemFixedConditions（step 6b~7b）之前 → TS-F050-N04 驗證 dept_ratio 名單帶 payload 回 422 不進入注入。
2. **m295 SQLite ADD COLUMN idempotent guard**：SQLite 不支援 `ADD COLUMN IF NOT EXISTS`，改用 `PRAGMA table_info` 偵測欄位存在才 ADD（functional test 連跑 2 次驗證欄位不重複）。
3. **deactivation 路徑（PATCH vs DELETE）**：controller 同時有 `PATCH :columnName`（{isActive:false}）與 `DELETE :columnName`（軟刪除）兩個停用路徑 → guard 同時置於 updateField（input.isActive===false 時）與 disableField；displayName 編輯不攔截。
4. **前端最低條件數文案**：精確採用 prototype 27a 文案「請至少新增 1 個篩選條件（優質案件為系統固定，不計入）」；因鎖定列獨立渲染，user conditions 陣列不含 best_case，故 `conditions.length===0` 即非系統固定條件數=0。

## 與架構的偏差
無。完全對齊 AD-E07-18 §18.12.3~18.12.10。injectSystemFixedConditions 採 immutable pattern、不 hardcode 'best_case'（值來自 SYSTEM_FIXED_VALUE_MAP + whitelist query）；Stage 1 零改動（§18.12.7）。

## 待人工驗證
1. **dev DB seed**：dev 用 synchronize:true，`is_system_fixed` 欄位自動 sync 為預設 false；best_case=true 與 m296 draft 回填需以 migration 等價 SQL 套用至 dev DB（`UPDATE pooldata_field_whitelist SET is_system_fixed=true WHERE column_name='best_case'` + m296 邏輯）後方可在 app 驗證。本實作未變更 dev DB。
2. **UI smoke**：建立 / 編輯草稿名單頁鎖定列、M06 篩選欄位管理頁停用按鈕 disabled（需 `docker restart cdmp-api cdmp-web` 後驗證）。
3. **既有預先存在失敗（非本 story 造成，已於 stash baseline 驗證）**：apps/api 9 檔（assignment-run-report/snapshot DI、etl target-table/fn-calc-tier、extraction executors）、apps/web 4 檔（c360 customer-list/detail、etl target-tables/load-properties）。均與 US-144 無關。
