---
type: implementation-log
feature_id: AD-E07-v3.0-P1-B1
feature_name: E07 合併重構 P1 B1（schema 補修 m15/m16 + E02 business_role 指派 F006a）
status: complete
last_updated: 2026-05-16
agent_id: continuation-of-acec103101e527cc4
---

# AD-E07 v3.0 P1 B1 — Schema 補修 + business_role 指派實作日誌

## 範圍

承接 P0 共用基礎建設，依 AD-E07-17 議題 1/2/3 與 v2 計畫 P1 B1 範圍：

- **階段 1 schema 補修**：m15（`ob_list_definition.stage`）+ m16（`assignment_audit_log.action` 擴 VARCHAR(30)）+ ob_empl_set entity 改 `dateColumnType`
- **階段 2 E02 + business_role 指派**：F006a `PATCH /api/v1/accounts/:id/business-role` + 廢棄 `/sales-manager-flag` 與 `/e07-role`（410 Gone）+ JWT 補 `businessRole` claim
- **階段 3 測試**：TC-MERGED-001~010 / TC-MIG-stage / TC-MIG-audit / TC-AUTH-200~205 / TC-LEGACY-1 / TC-DEPRECATED-1/2 / TC-CTRL-BR-1/2

## 測試結果摘要

| TC ID | 描述 | 狀態 |
|---|---|---|
| TC-MIG-stage (1~6) | m15 ADD COLUMN + backfill + CHECK + SQLite 退化 + 順序 + down | PASS (6/6) |
| TC-MIG-audit (1~4) | m16 ALTER COLUMN VARCHAR(30) + SQLite 退化 + down + 不 backfill | PASS (4/4) |
| TC-MERGED-001~010 | AccountsService.updateBusinessRole 完整生命週期（指派 / 撤銷 / 覆寫 / 404 / token revoke / audit / transaction / Admin / oldRole suffix） | PASS (10/10) |
| TC-AUTH-200~203 | JwtUtil businessRole claim（director / section_chief / null / 預設 null） | PASS (4/4) |
| TC-LEGACY-1 | legacy JWT（未含 businessRole）→ undefined → callsite 降級 null | PASS (1/1) |
| TC-AUTH-204/205 | UpdateBusinessRoleDto 雙層驗證（接受 3 值 / 拒絕 6 種非法） | PASS (9/9) |
| TC-DEPRECATED-1/2 | PATCH `/sales-manager-flag`、`/e07-role` → 410 Gone + ENDPOINT_GONE | PASS (2/2) |
| TC-CTRL-BR-1/2 | PATCH `/business-role` 委派 service.updateBusinessRole（director / null） | PASS (2/2) |

**P1 B1 範圍合計：38 / 38 通過**

回歸（Regression）：accounts / auth / jwt / m15 / m16 共 91 tests 全 PASS（含先前 73 + 新 18）。全套後端 940 tests 中 17 個 pre-existing fail 屬 ETL / extraction / target-table（P0 日誌已記載，與本批次無關，動到範圍外）。

## 變更檔案清單

### 階段 1 — Schema 補修

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/database/migrations/1711360000180-AddObListDefinitionStage.ts` | new (49 行) | m15：ADD `stage VARCHAR(20) NOT NULL DEFAULT 'draft'` + backfill (`status != 'inactive'` → ready) + CHECK constraint（PostgreSQL only；SQLite 略過） |
| `apps/api/src/database/migrations/__tests__/m15-list-definition-stage.spec.ts` | new (135 行 / 6 tests) | TC-MIG-stage 1~6 |
| `apps/api/src/database/migrations/1711360000181-AddAuditLogActionVarchar30.ts` | new (41 行) | m16：`ALTER COLUMN action TYPE VARCHAR(30)`（PostgreSQL only） |
| `apps/api/src/database/migrations/__tests__/m16-audit-log-action-varchar30.spec.ts` | new (92 行 / 4 tests) | TC-MIG-audit 1~4 |
| `apps/api/src/database/entities/assignment-audit-log.entity.ts` | modified | `action` length 由 10 擴為 30 + union 補 STAGE_ADVANCE/ROLLBACK/REJECT/ASSIGN_ROLE/REVOKE_ROLE |
| `apps/api/src/database/entities/ob-empl-set.entity.ts` | modified | `created_at` / `updated_at` 由 'timestamp' 改 `dateColumnType` helper（SQLite e2e 相容） |
| `apps/api/src/modules/assignment/services/stage-transition.service.ts` | modified | 移除 P0 truncate workaround，直接寫完整 STAGE_ADVANCE/ROLLBACK/REJECT name |

### 階段 2 — E02 + business_role 指派

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/modules/accounts/dto/update-business-role.dto.ts` | new (29 行) | UpdateBusinessRoleDto：`@IsDefined` + `@ValidateIf(o => o.business_role !== null)` + `@IsIn(['director','section_chief'])`，雙層驗證 |
| `apps/api/src/modules/accounts/__tests__/update-business-role.dto.spec.ts` | new (53 行 / 9 tests) | TC-AUTH-204/205 |
| `apps/api/src/modules/accounts/accounts.service.ts` | modified | 新增 `updateBusinessRole(targetId, newRole, actorId)` method：同 transaction 內 findOne → UPDATE business_role + password_changed_at → INSERT assignment_audit_log（action=ASSIGN_ROLE/REVOKE_ROLE） |
| `apps/api/src/modules/accounts/__tests__/update-business-role.service.spec.ts` | new (220 行 / 10 tests) | TC-MERGED-001~010 |
| `apps/api/src/modules/accounts/accounts.controller.ts` | modified | 新增 `PATCH :id/business-role`（admin only）+ `/sales-manager-flag`/`/e07-role` 改 410 GoneException ENDPOINT_GONE |
| `apps/api/src/modules/accounts/__tests__/accounts.controller.spec.ts` | new (74 行 / 4 tests) | TC-DEPRECATED-1/2 + TC-CTRL-BR-1/2 |
| `apps/api/src/common/jwt/jwt.util.ts` | modified | JwtPayloadInput 補 `businessRole?: 'director'\|'section_chief'\|null` + sign 時顯式寫 null（不為 undefined） |
| `apps/api/src/common/jwt/__tests__/jwt-business-role.spec.ts` | new (71 行 / 5 tests) | TC-AUTH-200~203 + TC-LEGACY-1 |
| `apps/api/src/modules/auth/auth.service.ts` | modified | LoginResult 補 `businessRole` 欄位 + login() 讀 `user.business_role` 傳入 JWT |

### 既有 spec wiring 微調（非業務邏輯）

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/modules/accounts/__tests__/accounts.service.spec.ts` | modified | 補 `getDataSourceToken` mock provider（因 AccountsService 新增 DataSource 依賴） |
| `apps/api/src/modules/accounts/__tests__/admin-reset-password.service.spec.ts` | modified | 同上 |
| `apps/api/src/modules/auth/__tests__/auth.service.spec.ts` | modified | 5 個 generateToken expectation 補 `businessRole: null` 欄位 |

## TDD 紅綠重構 cycle

P1 B1 共完成 **9 個 TDD cycle**：

1. m15 migration（前 agent 已完成 RED→GREEN→REFACTOR；本輪驗證 6/6 PASS）
2. m16 migration（前 agent 已完成；本輪驗證 4/4 PASS）
3. ob-empl-set entity dateColumnType（純 entity 改寫，無新增 test；既有 ETL test 涵蓋）
4. `AccountsService.updateBusinessRole` RED 10 → GREEN（實作）→ REFACTOR（合併 UPDATE 為單一語句）
5. AccountsController `:id/business-role` route RED 2 → GREEN
6. AccountsController `/sales-manager-flag` deprecation RED 1 → GREEN（410 Gone）
7. AccountsController `/e07-role` deprecation RED 1 → GREEN
8. JwtUtil businessRole claim RED 5 → GREEN
9. UpdateBusinessRoleDto 雙層驗證 RED 9 → GREEN → REFACTOR（`@ValidateIf` workaround：class-validator `@IsIn` 對顯式 null 不可信）

## 三個 schema 補修 PASS 狀態

| 補修 | Migration / Entity | Test 結果 | 備註 |
|---|---|---|---|
| AD-E07-17 議題 1（stage column） | `1711360000180-AddObListDefinitionStage.ts` | TC-MIG-stage 6/6 PASS | 含 backfill `status != 'inactive' → ready` |
| AD-E07-17 議題 2（audit_log.action VARCHAR(30)） | `1711360000181-AddAuditLogActionVarchar30.ts` + entity length=30 + stage-transition 移除 truncate | TC-MIG-audit 4/4 PASS + entity union 5 個 STAGE_*/ROLE_* | 同步移除 StageTransitionService P0 truncate workaround |
| AD-E07-17 議題 3（ob_empl_set 日期欄位） | `ob-empl-set.entity.ts` `dateColumnType` | 由現有 ETL test 涵蓋（無新增 spec） | SQLite e2e 相容 |

## 架構決策對齊

- **GoneException 410**：依用戶任務「廢棄 endpoint → 410 Gone + 引導訊息」，使用 NestJS 內建 `GoneException` 傳 `{ error: 'ENDPOINT_GONE', message: '...請改用 PATCH /api/v1/accounts/:id/business-role...' }`，前端可解析 message 顯示遷移提示
- **JWT businessRole 預設 null**：未傳 / undefined / legacy JWT 一律降級為 `null`，符合 F002 §4.6「未指派 = null」語意，避免 `undefined` 邊界
- **UpdateBusinessRoleDto null 驗證**：spec L138~145 用 `@IsIn(['director', 'section_chief', null])`，但 class-validator `@IsIn` 對顯式 null 拒絕（內部 includes 比較）。改用 `@ValidateIf(o => o.business_role !== null)` + `@IsIn(['director', 'section_chief'])` 達到等價語意（spec 未對 decorator 內部實作做硬性綁定，僅要求行為一致）
- **AccountsService.updateBusinessRole 單一 UPDATE 語句**：spec L243 要求「同 transaction 內」(a) UPDATE business_role + (b) UPDATE password_changed_at + (c) INSERT audit log。實作合併 (a)+(b) 為單一 `mgr.update(User, ...)` 呼叫，效能更佳且仍滿足同 transaction 要求
- **DataSource 在 AccountsService 變成必填依賴**：兩個既有 spec（accounts.service.spec / admin-reset-password.service.spec）需補 `getDataSourceToken` mock provider；不破壞既有行為（既有 method 完全不走 transaction 路徑）
- **未引入 @nestjs/swagger**：專案未安裝該套件，DTO 不加 `@ApiProperty`；註解保留說明，未來導入時可補

## 未完成 / 未實作元件

| 元件 | 說明 |
|---|---|
| FE-1 帳號管理頁前端 | 用戶任務指明可「留待下輪或前端工程師」；前端 prototype `prototypes/07-account-list.html` 已對齊 v1.4 三選項 enum，但 `apps/web/` 端 React 元件未動 |
| E2E test for F006a | spec §12 列出 9 個 E2E 要求（含 token revoke 跨 device）；本輪僅 unit + controller-level 覆蓋；E2E 待 P1 B2 或專屬 E2E 批次補齊 |
| OpenAPI/Swagger 文件 | 專案未安裝 `@nestjs/swagger`，整體缺；非本批次範圍 |
| 17 個 pre-existing ETL/extraction/target-table 失敗 | P0 日誌已記載，與 P1 B1 動到範圍無關 |

## 設計衝突或歧義

無新衝突。spec L138-145 之 `@IsIn(['director','section_chief',null])` 與 class-validator 實作行為不一致，已透過 `@ValidateIf` 等價實作解決（不更動 spec，因 spec 僅描述「雙層驗證」行為，未綁定 decorator 內部組合）。

## 對應 spec / 規格參照

- [F006a v1.0](../features/F006a-update-business-role.md) §3~§9（全 AC + BR + 5.5 token revoke）
- [F002 v2.0 §4.6](../features/F002-user-login.md) E07 角色矩陣 + JWT payload businessRole
- [data-model.md L848](../data-model.md) `ob_list_definition.stage`
- [architecture-spec.md §3.10](../architecture-spec.md) `AccountsService.updateBusinessRole()`
- [error-handling.md v1.14](../error-handling.md) ACCOUNT_BUSINESS_ROLE_INVALID / E07_ROLE_NOT_ASSIGNED
- [AD-E07-17](../adr/) 議題 1（stage） + 議題 2（VARCHAR(30)） + 議題 3（dateColumnType）

## 下一階段提示（P1 B2）

依 v2 計畫，**P1 B2** 範圍應為：

1. **既有 SalesManagerGuard 全 callsite 替換為 DirectorOrSectionChiefGuard**：grep `SalesManagerGuard` 應為 0 hits；目前 E07 既有 controller 仍以 SalesManagerGuard 鎖權限，需逐 controller 替換並補 RED test
2. **F073 / F074 spec v2.0 端點實作**：依 business_role enum 解鎖 director / section_chief 專屬端點（M02 customer list 寫入路徑等）
3. **JWT iat vs password_changed_at 比對於 AuthGuard 已實作**：本輪僅補 payload 寫入；驗證該機制在「指派 business_role 後舊 JWT 立即 401 AUTH_TOKEN_REVOKED」需 E2E 跨 request 驗證（P1 B2 + E2E 批次共同處理）
4. **m14 step 5：DROP users.is_sales_manager column**：待所有 callsite 改用 business_role 後執行（P1 B2 或 P1 B3）

建議先盤點 SalesManagerGuard 殘留 callsite 數量再決定 B2 切割顆粒度。
