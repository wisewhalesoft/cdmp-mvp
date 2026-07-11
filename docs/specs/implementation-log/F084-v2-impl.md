---
type: implementation-log
feature_id: F084
feature_name: 個別業務比例設定階段「自動推進」至簽核（auto-advance v2.0）
status: complete
last_updated: 2026-05-25
phase: Phase 1（後端 + 30 unit）+ Phase 2（前端 + 11 unit）+ Phase 3（integration defer 文件）完成
related_spec: /docs/specs/features/F084-advance-to-approval.md
related_spec_version: "2.0.1"
related_arch: /docs/specs/architecture-spec.md#AD-E07-19
related_test_design: /docs/specs/handoffs/F084-v2-auto-advance-test-design.md
---

# F084 v2.0 Auto-Advance — 實作紀錄（Phase 1 + Phase 3）

## 範圍與進度

| Phase | 內容 | 狀態 |
|-------|------|------|
| Phase 1 | 後端 auto-advance 主路徑 + 30 unit | ✅ 完成（commit e43dcc6） |
| Phase 2 | 前端 response 分支（toast/redirect/fallback）+ prototype 29b + 11 unit | ✅ 完成（commit 51d6379） |
| Phase 3 | 4 integration defer 標記 + staging 手動驗證文件 | ✅ 完成（commit f6eb78f） |

## Phase 2 測試結果（前端 Unit）

> 執行：`npx vitest run .../personnel-ratio-config-page.test.tsx .../personnel-ratio-auto-advance.test.tsx .../assignment-stage.contract.test.ts`
> 結果：**31 passed (3 files)** — 新 11 FE + 既有 page 14 + contract 6。typecheck 觸碰前端檔零錯誤。

| Scenario ID | 說明 | Status |
|-------------|------|--------|
| TC-F084-FE-001 | autoAdvanced=true → 自動推進 toast + redirect 名單列表 | PASS |
| TC-F084-FE-002 | autoAdvanced=true → redirect 至名單列表頁 | PASS |
| TC-F084-FE-003 | failReason=ASSIGNMENT_RUN_ALREADY_RUNNING → 月名單分派 toast + fallback 按鈕 + 不 redirect | PASS |
| TC-F084-FE-004 | 月名單分派 guard 跳過 → fallback 按鈕 disabled + tooltip「分派執行中，無法推進」 | PASS |
| TC-F084-FE-005 | 部分完成（autoAdvanced:false 無 failReason）→ 僅既有儲存 toast、不 redirect | PASS |
| TC-F084-FE-006 | 所有部門完成 → 顯示可點擊手動推進按鈕（flag off / fallback） | PASS |
| TC-F084-FE-007 | stage=approval（isReadOnly:true）→ 推進按鈕完全不渲染 | PASS |
| TC-F084-FE-008 | 歷史月份（isReadOnly:true）→ 推進按鈕完全不渲染 | PASS |
| TC-F084-FE-009 | 手動 fallback → 確認對話框 + 成功推進 + redirect | PASS |
| TC-F084-FE-010 | 手動推進「取消」→ 不呼叫 API、不 redirect | PASS |
| TC-F084-FE-011 | 手動推進 422 → 顯示錯誤訊息、不 redirect | PASS |

### Phase 2 前端決策

- **flag 讀取方案（response-driven，前端無 flag）**：grep 確認前端無 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL`
  / `import.meta.env` flag 機制（唯一 match 為 `trigger-run-page.tsx` 一句錯誤訊息字串）。依 prototype 29b
  L26-30 採 response-driven：前端不需知 flag 狀態，僅依 PUT response（autoAdvanced / newStage /
  autoAdvanceFailReason）+ `allDone` 分支。flag off 時 response 永遠 autoAdvanced:false 無 failReason
  → allDone 時自然顯示 fallback 手動按鈕（= 既有手動行為）。
- **FLAG-1（批准）**：`PersonnelRatioFormHandle.save()` 回傳 `Promise<SetPersonnelRatiosResponse | null>`；
  `onSaved` 回呼攜帶 response。「儲存全部」Promise.all 收集所有 response，任一 autoAdvanced=true → redirect、
  任一 failReason → 月名單分派 toast + fallback。
- **fallback 按鈕渲染**：`showFallbackAdvance = (stage=personnel_ratio 且非 isReadOnly) 且 (allDone 或
  月名單分派 guard 跳過)`；disabled：月名單分派進行中 / 處長本部門未完成 / 尚有部門未完成（對齊 prototype renderActionBar）。

### Phase 2 更新的既有測試斷言（保留原驗收意圖）

| 既有測試 | 原斷言 | 新斷言 | 理由 |
|---------|--------|--------|------|
| 「顯示推進按鈕（部長+處長皆可）」 | 預設 mock（部門未完成）即斷言按鈕存在 | 改 mock 為部門完成後斷言按鈕存在 | 按鈕改 response-driven（allDone 才渲染）；保留「兩角色皆可見」原意 |
| 「section_chief 不顯示退回按鈕」 | 斷言推進按鈕存在（incidental）+ 退回按鈕不存在（core） | mock 部門完成使推進按鈕存在 + 保留退回按鈕不存在 | core 意圖（處長無退回按鈕）完整保留；incidental 推進按鈕斷言因渲染條件改變而補 mock |
| 「未全部完成時按鈕 disabled」 | 斷言推進按鈕存在且 disabled | 斷言推進按鈕**不存在** + 儲存全部 disabled | 行為變更：!allDone 時按鈕完全不渲染（原為渲染+disabled），對齊 prototype showFallbackBtn |


## Phase 1 測試結果（後端 Unit）

> 執行：`npx vitest run src/modules/assignment-stage/__tests__/personnel-ratio-auto-advance.service.spec.ts`
> 結果：**30 passed (30)**；併同既有 `personnel-ratio.service.spec.ts` 共 **39 passed**（無 regression）。

| Scenario ID | 說明 | Status |
|-------------|------|--------|
| TC-F084-001 | flag off → auto-advance 不執行、autoAdvanced:false | PASS |
| TC-F084-002 | flag off + phase3 on → 退回手動推進行為 | PASS |
| TC-F084-003 | 部分部門未完成 → autoAdvanced:false、不帶 failReason、寫入保留 | PASS |
| TC-F084-004 | 容差邊界 99.99% 通過 / 99.98% 不通過 | PASS |
| TC-F084-005 | 全員離職部門短路通過，不阻擋 auto-advance | PASS |
| TC-F084-006 | 處長完成最後部門 PUT → auto-advance 成功（主場景） | PASS |
| TC-F084-007 | 部長完成最後部門 → operator_role:director | PASS |
| TC-F084-008 | Admin 完成最後部門 → operator_role:admin（不 fallback section_chief） | PASS |
| TC-F084-009 | 稽核 metadata 完整性（boolean true + 無多餘 key） | PASS |
| TC-F084-010 | 手動 fallback 路徑稽核不含 auto_advanced_by_completion | PASS |
| TC-F084-011 | operator_role 推導三角色 × 公式 | PASS |
| TC-F084-012 | 月名單分派 running → autoAdvanced:false + failReason、寫入保留 | PASS |
| TC-F084-013 | 月名單分派 pending（isRunning true）同樣觸發 guard | PASS |
| TC-F084-014 | lock 逾時 55P03 → autoAdvanced:false、不帶 failReason、寫入保留（Option B） | PASS |
| TC-F084-015 | lock 超時 catch 後 tx 照常 commit（不 rethrow） | PASS |
| TC-F084-016 | lock 超時 vs 月名單分派 guard 回應欄位差異 | PASS |
| TC-F084-017 | 取得 lock 後 stage 已 approval → idempotent no-op | PASS |
| TC-F084-018 | idempotent no-op 時稽核不重複 | PASS |
| TC-F084-019 | advanceToInMgr 接受外部 EntityManager、不自開 tx | PASS |
| TC-F084-020 | advanceToInMgr auditMetadata=undefined 不寫 auto_advanced_by_completion | PASS |
| TC-F084-021 | advanceToInMgr stage 不符 → 422、不 update | PASS |
| TC-F084-022 | assertAllDeptsSumEquals100WithMgr 使用傳入 mgr 查詢 | PASS |
| TC-F084-023 | WithMgr 全員離職短路；非離職部門仍被驗證 | PASS |
| TC-F084-024 | stage=approval 再 PUT → 422，不寫入 | PASS |
| TC-F084-025 | 歷史月份 → 403，auto-advance 不執行 | PASS |
| TC-F084-026 | fallback 部長手動推進成功（走 advanceTo，不含 metadata flag） | PASS |
| TC-F084-027 | fallback 部門未完成 → 422 STAGE_ADVANCE_PRECONDITION_FAILED | PASS |
| TC-F084-028 | fallback 月名單分派進行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING | PASS |
| TC-F084-029 | fallback 歷史月份 → 403 LIST_HISTORICAL_READONLY | PASS |
| TC-F084-030 | fallback stage 非 personnel_ratio → 422 LIST_STAGE_TRANSITION_FORBIDDEN | PASS |

## Phase 3 — Integration（4 個，決策 B：defer + 手動驗證）

| Scenario ID | 說明 | Status |
|-------------|------|--------|
| INT-F084-001 | 兩並發 PUT advisory lock 序列化 | DEFERRED（需真 PG；手動驗證步驟已建立） |
| INT-F084-002 | lock 逾時 55P03 + Option B 寫入保留 | DEFERRED（需真 PG；手動驗證步驟已建立） |
| INT-F084-003 | WithMgr 讀同 tx 未 commit 資料 | DEFERRED（需真 PG；手動驗證步驟已建立） |
| INT-F084-004 | advanceToInMgr 原子性 rollback | DEFERRED（需真 PG；手動驗證步驟已建立） |

- 測試設計文件 §4 四個 INT heading 已加 `【DEFERRED — 需真 PG，本 MVP 不落地】` 標記
- 手動驗證步驟：`docs/specs/handoffs/F084-v2-staging-manual-verification.md`（含 PR checklist 4 項）

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/api/src/modules/assignment/services/stage-transition.service.ts | modified | 新增 `advanceToInMgr()` 過載（接受外部 EntityManager、不自開 tx、auditMetadata 合併進 after_value.metadata） |
| apps/api/src/modules/assignment/services/personnel-ratio-validation.service.ts | modified | 新增 `assertAllDeptsSumEquals100WithMgr()`（EntityManager 版本，讀同 tx 未 commit；新增私有 `countActiveEmployeesWithMgr()`）；import 補 `EntityManager` |
| apps/api/src/modules/assignment/services/assignment-run-guard.service.ts | modified | 新增 `isRunning()`（tx 內輕量月名單分派 guard，回 boolean） |
| apps/api/src/modules/assignment-stage/personnel-ratio.service.ts | modified | `setPersonnelRatios()` tx scope 擴大（Option B）+ 新增私有 `tryAutoAdvance()` / `resolveOperatorRole()` / `isAutoAdvanceEnabled()` / `isPostgres()` / `isPgLockNotAvailable()`；response 補 autoAdvanced / newStage / autoAdvanceFailReason；import 補 `EntityManager` |
| apps/api/src/modules/assignment-stage/__tests__/personnel-ratio-auto-advance.service.spec.ts | new | TC-F084-001~030 共 30 個後端 unit |
| docs/specs/handoffs/F084-v2-auto-advance-test-design.md | modified | §4 四個 INT 案例標 DEFERRED + 決策 B 說明 |
| docs/specs/handoffs/F084-v2-staging-manual-verification.md | new | INT-F084-001~004 真 PG staging 手動驗證步驟 + PR checklist |

## 架構決策與落差處理（依使用者裁示）

- **FLAG-3（批准）**：個別比例稽核沿用既有 `action:'UPDATE'`（標 SET_PERSONNEL_RATIO），**不擴 enum**；
  auto-advance 的 `STAGE_ADVANCE` 才是本次新增稽核。
- **FLAG-4（批准）**：`operator_role` 推導採 AD-E07-19 §19.4 公式
  `role==='admin' ? 'admin' : (businessRole ?? 'section_chief')`，**僅套用於 auto-advance 路徑**；
  既有手動 fallback（`stage-action.service.ts` `advancedByRole`）維持 `?? null` 不動。
- **SQLite 相容**：`tryAutoAdvance()` 內 advisory lock 段以 `isPostgres()`（`DB_TYPE!=='postgres'` 視為非 PG）gate；
  SQLite 測試 infra 下跳過 advisory lock，直接做完成度偵測 + 推進，使 30 unit 在現有 SQLite infra 全綠。
  lock 超時 catch 路徑（55P03）以 mock 在 `DB_TYPE='postgres'` 子情境下驗證（TC-014~016）。
- **Option B 順序**：tx 內 [1]DELETE [2]INSERT ob_empl_set [3]INSERT 稽核（寫入）皆在 [4a] advisory lock **之前**；
  lock 超時 / 月名單分派 guard / 未完成 / idempotent no-op 任一降級皆不 rollback 寫入，tx 照常 commit。

## 待辦（Phase 2 接續時）

- 待 ui-ux-designer 更新 prototype 29b（auto-advance UX）後，以更新後 prototype 為 ground truth 實作：
  - `apps/web/src/api/assignment-stage.ts`：`SetPersonnelRatiosResponse` 補 autoAdvanced/newStage/autoAdvanceFailReason
  - `personnel-ratio-form.tsx`：`save()` 回傳改 `Promise<SetPersonnelRatiosResponse | null>`（FLAG-1 批准）
  - `personnel-ratio-config-page.tsx`：依 response 分支（任一 autoAdvanced=true → toast+redirect；
    任一 autoAdvanceFailReason → 月名單分派 toast + 保留 fallback 按鈕；無 → 既有 toast）
  - TC-F084-FE-001~011 共 11 個前端 unit
- F084 spec §10 末補測試設計文件連結（§6.4 要求）：因 `/docs/specs/features/` 為唯讀，**未在本輪改動**，
  提醒由 spec-writer 或經使用者確認後補上。

## Bugfix v2.0.2（2026-05-26）：完成度偵測 universe 錯誤導致提早推進

**現象**：OB202605002 有 4 個 deptRatio>0 部門（XVE1~4），僅 1 個（XVE4）設定即自動推進至簽核。

**根因**：`assertAllDeptsSumEquals100` / `assertAllDeptsSumEquals100WithMgr` 以 `GROUP BY ob_empl_set.deptid_m` 為 universe（只驗「已有 empl_set 紀錄的部門」），「該設但完全沒設」之部門（0 筆）不在迴圈中 → 漏檢。此 gap 手動 fallback 路徑亦有（但部長通常全設完才按推進故未引爆）。

**修正**（`personnel-ratio-validation.service.ts`）：
- universe 改為 `ob_dept_pct` 中 `ration > 0` 之部門（對齊 F082 BR-18 / GET 顯示範圍）；注入 `ObDeptPct` repo（mgr 版用 `mgr.find(ObDeptPct)`）。
- 該 universe 部門 active>0 但 empl_set 0 筆 → 加總=0 → 視為未完成、攔截；active=0 → BR-8 短路；deptRatio=0 不在 universe。
- 同步修 spec F084 §5.2 step 1 / BR-2 / BR-12（v2.0.2 changelog）。

**測試**：
- `personnel-ratio-validation.service.spec.ts`：補「deptRatio>0 完全沒設 → 422」+「deptRatio=0 不要求」；既有案例改 seed deptPctRepo universe。
- `personnel-ratio-auto-advance.service.spec.ts` §3.9：buildMgr 補 `find`（universe）；新增 TC-F084-023b（4 部門僅 1 設定 → 拋）。
- 全部相關後端測試綠（validation + auto-advance + personnel-ratio）。

**資料修正**：OB202605002 stage 由 approval 直接 UPDATE 回 personnel_ratio（保留 XVE4 已設資料）；bogus STAGE_ADVANCE 稽核（15:48:48）保留為歷史紀錄。

**環境**：docker-compose.yml 已於 e4ca81b 補 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL=true`；cdmp-api 已重啟載入本 fix。

**4 個真 PG integration 測試**：仍 defer（決策 B）；本 bug 的迴歸已由 unit（validation universe）覆蓋。
