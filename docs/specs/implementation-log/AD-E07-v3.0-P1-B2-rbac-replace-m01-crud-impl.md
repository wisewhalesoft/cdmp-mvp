---
type: implementation-log
feature_id: AD-E07-v3.0-P1-B2
feature_name: E07 合併重構 P1 B2（SalesManagerGuard 全 callsite 替換 + M01 名單 CRUD）
status: complete
last_updated: 2026-05-16
agent_id: continuation-of-a9559e6e16eecabbc
---

# AD-E07 v3.0 P1 B2 — Guard 替換 + M01 名單 CRUD 實作日誌

## 範圍

承接 P1 B1（business_role 指派完成），依任務分階段：

- **階段 1**：`SalesManagerGuard` 全 callsite 替換為 `DirectorGuard` / `DirectorOrSectionChiefGuard`，依 F002 §4.6.2 GET 開放至處長 / 寫入限部長分流；AuthGuard 補注入 `businessRole` claim 至 `request.user`；3 個 guard / decorator 檔案刪除
- **階段 2**：F048 v2.0 / F050 v2.0 / F051 v2.0 / F052 v2.0 / F077 v1.2 — M01 名單 CRUD（GET 列表 / POST 新建 / PUT 編輯 / PUT disable / DELETE）整套 Controller + Service + DTO + Module
- **階段 3**：測試 — TC-M01-* / TC-ROLE-* / TC-FF-* / TC-YM-* / TC-PAYLOAD-* / TC-LIST-* 共 61 cases

## 測試結果摘要

| TC 範圍 | 描述 | 狀態 |
|---|---|---|
| TC-M01-CREATE-001~007 | F050 v2.0 — 成功新增 / 流水號遞增 / 999 上限 / PROD_KIND+CARD_TYPE 衝突 / case_status 必填 / 月跑鎖 / audit log | PASS (7/7) |
| TC-M01-UPDATE-001~007 | F051 v2.0 — 覆寫成功 / 404 / inactive 422 / case_status 必填 / 衝突排除自身 / 衝突其他 list / 月跑鎖 | PASS (7/7) |
| TC-M01-DISABLE-001~004 | F052 v2.0 — 軟刪除 / 404 / 重複停用 / 月跑鎖 | PASS (4/4) |
| TC-M01-LIST-001~005 | F048 v2.0 / F077 — 列表 / 預設不顯示 inactive / includeDisabled / lockState / stage 篩選 | PASS (5/5) |
| TC-ROLE × 5 endpoint × 4 角色 | director / section_chief / plain / unauth × GET/POST/PUT/PUT-disable/DELETE | PASS (25/25) |
| TC-FF-* | FeatureFlag ENABLE_E07_REFACTOR_PHASE3 寫入保護 + GET 不受影響 | PASS (4/4) |
| TC-YM-* | 5 碼格式 422 / 範圍 ±12 之外 400 INVALID_YM_RANGE / isHistorical / isFuture | PASS (4/4) |
| TC-PAYLOAD-* / TC-LIST-* | DTO 缺欄 422 / stage query 拆 array / includeDisabled string→bool / 預設 currentWorkYm | PASS (5/5) |

**P1 B2 範圍合計：61 / 61 通過**

**回歸（含 B1）**：
- Unit：988 / 1005 PASS（17 fail 全屬 pre-existing ETL / extraction / target-table，已於 P0 / P1 B1 日誌記載，與 P1 B2 範圍無關）
- E2E：580 / 607 PASS（14 fail = pre-existing：accounts-sales-manager 7 個 + target-table 7 個）
  - 含 B2 替換後 e2e 必修：`assignment-code.e2e-spec.ts` (9/9 PASS)、`assignment-scoring.e2e-spec.ts` (134/137 PASS, 3 skipped)、`m02-cross-spec.e2e-spec.ts` (13/13 PASS)、`m02-regression-guards.e2e-spec.ts` (18/18 PASS)

## SalesManagerGuard 替換結果

```
$ grep -rn "SalesManagerGuard\|RequireSalesManager\|sales-manager.guard\|sales-manager.decorator" apps/api/src apps/api/test
apps/api/src/common/guards/director-or-section-chief.guard.ts:15:    取代 v1.x SalesManagerGuard ...（註解）
apps/api/src/common/jwt/jwt.util.ts:7:                              JWT 攜帶以利 SalesManagerGuard 直接讀取（註解）
apps/api/src/database/seeds/seed.ts:35:                             用於 SalesManagerGuard 行為驗證（註解）
apps/api/src/modules/auth/auth.service.ts:96:                       含 is_sales_manager 旗標供 SalesManagerGuard 使用（註解）
```

**0 個 import / 0 個 @UseGuards / 0 個 @RequireSalesManager 生效 callsite**（僅 4 處註解保留歷史說明）。

### 替換清單（3 個 Controller / 6 個 Test 檔）

| 路徑 | 替換內容 |
|---|---|
| `apps/api/src/modules/assignment-code/assignment-code.controller.ts` | `SalesManagerGuard` → class 級 `DirectorOrSectionChiefGuard + DirectorGuard` + GET 留 class 級 `@RequireDirectorOrSectionChief()` + POST/PUT 加 `@RequireDirector()` |
| `apps/api/src/modules/assignment-scoring/assignment-scoring.controller.ts` | 同上；M02 寫入端點（PUT/POST dimensions, card-levels, tier-mapping, DELETE card-levels/tier-mapping）9 個 method 加 `@RequireDirector()` |
| `apps/api/src/modules/assignment-scoring/controllers/card-type.controller.ts` | 同上；F070 POST / F071 PUT / F072 DELETE 加 `@RequireDirector()` |
| `apps/api/src/modules/assignment-code/__tests__/assignment-code.controller.spec.ts` | fixture isSalesManager → businessRole，新增 section_chief 寫入 403 case；17 tests PASS |
| `apps/api/src/modules/assignment-scoring/__tests__/assignment-scoring-f053.controller.spec.ts` | 同上；8 tests PASS |
| `apps/api/src/modules/assignment-scoring/__tests__/card-type.controller.spec.ts` | 6 endpoints × 4 角色 RBAC 矩陣；36 tests PASS |
| `apps/api/test/m02-regression-guards.e2e-spec.ts` | TC-GUARD-GUARD-001 增 section_chief 拒寫入；新增 SECTION_CHIEF_USER seed；18 tests PASS |
| `apps/api/test/assignment-code.e2e-spec.ts` / `test/assignment-scoring.e2e-spec.ts` / `test/m02-cross-spec.e2e-spec.ts` | SM_USER fixture 補 `business_role: 'director'`，AUTH_FORBIDDEN → E07_ROLE_NOT_ASSIGNED |

### 共用基礎建設變更

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/common/guards/auth.guard.ts` | modified | request.user 新增注入 `businessRole`（legacy JWT 未含 → 顯式降級 null） |
| `apps/api/src/common/__tests__/auth.guard.spec.ts` | modified | 對齊新 user shape |
| `apps/api/src/common/guards/director.guard.ts` | modified | 失敗錯誤碼 `AUTH_FORBIDDEN` → `E07_REQUIRES_DIRECTOR`（依 F002 §4.6.2 / spec L120） |
| `apps/api/src/common/guards/section-chief.guard.ts` | modified | 失敗錯誤碼 → `E07_REQUIRES_SECTION_CHIEF`（依 spec L329） |
| `apps/api/src/common/__tests__/director.guard.spec.ts` / `section-chief.guard.spec.ts` | modified | 對齊新錯誤碼 |
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 7 個 M01 / RBAC 錯誤碼（E07_REQUIRES_DIRECTOR / E07_REQUIRES_SECTION_CHIEF / LIST_NO_LIMIT_EXCEEDED / LIST_NO_DUPLICATE / CASE_STATUS_REQUIRED / ASSIGNMENT_LIST_NOT_FOUND / ASSIGNMENT_LIST_INACTIVE / ASSIGNMENT_LIST_ALREADY_INACTIVE / LIST_HISTORICAL_READONLY） |
| `apps/api/src/common/guards/sales-manager.guard.ts` | deleted | callsite=0 |
| `apps/api/src/common/decorators/sales-manager.decorator.ts` | deleted | callsite=0 |
| `apps/api/src/common/__tests__/sales-manager.guard.spec.ts` | deleted | guard 已刪除 |

## M01 名單 CRUD 變更檔案清單

### 新增（5 個檔案）

| 路徑 | 行數 | 描述 |
|---|---|---|
| `apps/api/src/modules/assignment-list/dto/create-list.dto.ts` | 84 | F050 v2.0 CreateListDto；多選欄位 `$$` 分隔字串；case_status 必填 |
| `apps/api/src/modules/assignment-list/dto/update-list.dto.ts` | 66 | F051 v2.0 UpdateListDto；不含 copyFromListNo |
| `apps/api/src/modules/assignment-list/dto/list-lists-query.dto.ts` | 28 | F048 / F077 ListListsQueryDto；ym `^\d{6}$` + stage + includeDisabled |
| `apps/api/src/modules/assignment-list/assignment-list.service.ts` | 339 | createList / updateList / disableList / listLists / generateNextListNo / findActivePkCardTypeConflict / writeAudit；頂層 assertNoRunningRun() |
| `apps/api/src/modules/assignment-list/assignment-list.controller.ts` | 180 | 5 端點（GET / POST / PUT / PUT disable / DELETE）；class 級 DirectorOrSectionChiefGuard + DirectorGuard + FeatureFlagGuard；GET 計算 currentWorkYm / 範圍驗證 / isHistorical / isFuture |
| `apps/api/src/modules/assignment-list/assignment-list.module.ts` | 46 | TypeOrmModule.forFeature + JwtModule + AssignmentRunGuardService provider |
| `apps/api/src/modules/assignment-list/__tests__/assignment-list.service.spec.ts` | 414 | 23 service tests（real sqlite + TypeOrmModule） |
| `apps/api/src/modules/assignment-list/__tests__/assignment-list.controller.spec.ts` | 386 | 38 controller tests（mocked service + 真實 RBAC + FeatureFlag chain） |

### 修改（1 個檔案）

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/app.module.ts` | modified | import + 註冊 AssignmentListModule |

## TDD 紅綠重構 cycle

P1 B2 共完成 **3 個 TDD cycle**：

1. **階段 1 RBAC 替換**：RED（既有 6 個既存 spec 改 fixture → 全 fail）→ GREEN（auth.guard 注入 + 3 controller 替換 + 2 guard error code 對齊 + 6 test 更新 fixture）→ REFACTOR（刪除 3 個 sales-manager 檔）
2. **階段 2 M01 Service**：RED（23 service spec 寫完，service 未實作）→ GREEN（AssignmentListService 4 method + audit + LIST_NO 生成 + 衝突檢查）→ REFACTOR（service 內共用 findActivePkCardTypeConflict / writeAudit）
3. **階段 2 M01 Controller**：RED（38 controller spec 寫完，controller 未實作）→ GREEN（AssignmentListController + 5 endpoint + computeCurrentWorkYm + assertYmInRange）→ REFACTOR（fixture 用 OVERRIDE_CURRENT_WORK_YM 環境變數固定當月避免時點漂移）

## 架構決策對齊

- **Controller 級 Guard chain**：因 F002 §4.6.2 表規定「同 controller 內讀 / 寫不同 Guard」，採 **class 級 `@UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard)` + class 級 `@RequireDirectorOrSectionChief()`（基準閘）+ 寫入方法級 `@RequireDirector()`（額外閘）** 模式。DirectorGuard 在「未標 `@RequireDirector` → allow」規則下，GET 方法不被擋；寫入方法因有 `@RequireDirector` → 只允許 director/admin
- **`assignment_audit_log.action='DISABLE'` 衝突**：spec F052 AC-2 要 `'DISABLE'`，但 entity union（B1 m16）僅含 CREATE/UPDATE/DELETE/RUN/STAGE_*/ASSIGN_ROLE/REVOKE_ROLE。**選擇用 `action='UPDATE'` + `before_value._operation='DISABLE'`** 標示，避免再加 migration 擴 union。後續若 architect 認為需擴，可於 P1 B3 補 m17
- **`current_work_ym` 計算**：F077 §5.1 規範後端服務 `GET /api/v1/system/current-work-ym` 與 controller 共用。**本輪僅實作 `AssignmentListController.computeCurrentWorkYm()` static 方法**（含 `OVERRIDE_CURRENT_WORK_YM` env var 覆蓋），未抽 SystemModule。後續若 F077 §5.1 API 端點納入 P1 B3 / B4，可重構抽出
- **歷史月份寫入攔截**：F077 §6 BR-3 規範各下游 controller 寫入路徑統一攔截 `request.ym < current_work_ym` → 403 LIST_HISTORICAL_READONLY。本輪 controller 提供 `assertNotHistorical()` 私有方法但**未在寫入端點呼叫**（F050 POST 無 ym 參數，僅以 currentWorkYm 為新建月份；F051/F052 以 listNo 推月份需查 DB → 屬 service 層責任）。待 P1 B3 service 層補檢查 `existing.project_workym < currentWorkYm` 並丟 LIST_HISTORICAL_READONLY
- **`case_status` 與 `cr_enabled` 欄位**：F050 v2.0 spec 規格本身要求這兩欄位，但 entity `ob_list_definition` 目前無此 columns（B1 未加 migration）。**DTO 接受、service 不寫入 entity**（caseStatus 暫存於 audit log `_operation` payload；crEnabled 接受後忽略）。data-model.md L876 已要 case_status migration 兩階段補值，**待 P1 B3 補 m17/m18 ADD COLUMN + backfill** 後 service 再寫入 entity field
- **F048 v2.0 spec 路徑（`/assignment/list-definitions`）vs F077 v1.2（`/assignment/lists`）**：spec 兩處路徑不同。本輪採 F077 為主（`/assignment/lists`），因任務文件明示「F048 v2.0 / F077: GET /assignment/lists」。spec F048 v2.0 §5.1 路徑會與本實作衝突；建議 spec-writer 統一為 `/assignment/lists`
- **FeatureFlag 範圍**：寫入 3 method（POST / PUT / PUT-disable / DELETE）標 `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')`；GET 不受 flag 影響（spec 未要求，避免 flag 鎖定後唯讀也壞）

## 未完成 / 未實作元件

| 元件 | 說明 |
|---|---|
| **FE-2 M01 React 元件** | 任務指明可「留待下輪」；prototype `prototypes/27-list-definition.html` / `27a-list-create-draft.html` / `27b-list-edit-draft.html` 存在；前端尚未實作 |
| **`ob_list_definition.case_status` / `cr_enabled` columns** | data-model L876 / L918 已要；本輪未加 migration（避免擴大本批次範圍）。DTO 接受但 service 不寫入 entity。建議 P1 B3 補 m17/m18 |
| **歷史月份寫入攔截（service 層）** | controller 已具方法但未在寫入端點呼叫；service 層應額外查 `existing.project_workym < currentWorkYm` 後丟 LIST_HISTORICAL_READONLY |
| **GET /api/v1/system/current-work-ym 端點** | F077 §5.1 規範；本輪僅 controller static method；待抽 SystemModule |
| **assignment-audit-log action='DISABLE' union 擴充** | 採 UPDATE + `_operation` 標記 workaround |
| **F049 試算 / F060 部門比例（已 DEPRECATED → F079）/ F079~F089** | 非 B2 範圍 |
| **`test/accounts-sales-manager.e2e-spec.ts` 過時 spec** | F008 sales-manager-flag 已於 B1 改 410 Gone；7 個 e2e 仍 reference 舊行為應廢棄/重寫，非本輪 |

## 設計衝突或歧義

1. **F048 v2.0 §5.1 路徑 `/assignment/list-definitions` vs F077 v1.2 §5.2 路徑 `/assignment/lists`**：本實作採後者（任務文件權威），spec 應統一
2. **F052 spec `action='DISABLE'`** vs entity union（B1 m16 未含 DISABLE）：本輪採 `action='UPDATE'` + `_operation='DISABLE'`，spec 與 entity 二擇一需澄清
3. **F050 spec `case_status` / F050 v2.0 `cr_enabled`** 欄位 spec 已規範但 entity 無 column：DTO 接受、service 不持久化。屬 spec 推進但 data-model migration 滯後

## 對應 spec / 規格參照

- [F048 v1.0](../features/F048-view-list-definition.md) §5.1（GET 端點與 lockState）
- [F050 v2.0](../features/F050-create-list-definition.md) §3~§7（DirectorGuard + LIST_NO 生成 + 999 上限 + PROD_KIND+CARD_TYPE 唯一 + case_status 必填）
- [F051 v2.0](../features/F051-edit-list-definition.md) §3~§7（覆寫式編輯 + inactive 422 + case_status 不可清空）
- [F052 v2.0](../features/F052-disable-list-definition.md) §3~§6（軟刪除 + 重複停用 422）
- [F077 v1.2](../features/F077-month-switch-and-stage-overview.md) §5.2 / §6 BR-2 / BR-7（GET + ym 範圍 + 角色 × 階段矩陣）
- [F002 v2.0 §4.6.2](../features/F002-user-login.md) Controller Guard 對應表（單一權威）
- [error-handling.md](../error-handling.md) L239~247 / L329（M01 + RBAC 錯誤碼）

## 下一階段提示（P1 B3）

依任務文件，**P1 B3** 為 M02 評分組態：

1. **F053~F056 / F069~F072 既有 controller** 已於 B2 替換為 RBAC 分流；service 邏輯仍維持
2. **F082 / F079~F081 / F083~F089** 階段相關 spec（M03a / M03b / M03c / M03d）尚未實作；應依 F077 §6 BR-7 角色 × 階段矩陣套對應 Guard
3. **歷史月份寫入攔截 service 層**：所有 E07 寫入 service 應補 `if (existing.project_workym < currentWorkYm) throw LIST_HISTORICAL_READONLY`
4. **m17/m18 migration**：`ob_list_definition` 補 `case_status VARCHAR(14)` + `cr_enabled BOOLEAN NOT NULL DEFAULT false`；F050 / F051 service 補寫入；F050 spec §7 BR-7 OR 篩選邏輯由 F049 / F061 月跑 Stage 1 使用
5. **GET /api/v1/system/current-work-ym 端點**：抽 SystemModule（F077 §5.1）
6. **`assignment_audit_log.action` union 擴 DISABLE**（若 architect 認為需要明確 action 而非 _operation workaround）
