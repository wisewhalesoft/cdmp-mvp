---
type: implementation-log
feature_id: F068
feature_name: E07 相關代碼維護（PROD_KIND / SPEC_TP / CASE_STATUS）
status: complete
last_updated: 2026-05-13
---

# F068: E07 相關代碼維護 實作日誌

## 範圍

依 spec `docs/specs/features/F068-edit-base-code.md` 與 AD-E07-14 完整實作：

1. **DB Migration**：`ob_code_df.tbl_id` VARCHAR(2) → VARCHAR(11)；既有 dump 資料白名單轉碼 `'01'→PROD_KIND`、`'02'→SPEC_TP`、`'22'→CASE_STATUS`；白名單外 `tbl_id` 保持不動
2. **Backend**：`AssignmentCodeModule` 完整 CRUD + SalesManagerGuard + audit log
3. **Frontend**：對應 `prototypes/37-base-code.html` 的 React 頁面取代 stub 路由
4. **測試**：50 tests pass（8 migration + 18 service + 15 controller + 9 e2e）

## OQ 決議（user 確認）

| OQ | 主題 | 決議 |
|---|---|---|
| OQ-F068-01 | 前端 E2E 框架 | 採手動驗收清單（不擴大 scope，無 Playwright） |
| OQ-F068-02 | Migration `down()` reverse | 不可逆，`down()` throw Error |
| OQ-F068-03 | 停用 `enddt` 值 | 設為當日（YYYYMMDD = today，Asia/Taipei） |
| OQ-F068-04 | `assignment_audit_log.actor_id` | 寫入 `req.user.empl_id`（沿用其他 audit log pattern） |
| OQ-F068-05 | `active` 時基日 TZ | Asia/Taipei（業務日曆） |

## Commit 拆解

| # | Hash | 訊息 |
|---|---|---|
| 1 | `5ebbf93` | `feat(api/db): F068 擴充 ob_code_df.tbl_id 至 VARCHAR(11) 並白名單轉碼` |
| 2 | `a5ad612` | `feat(api/assignment-code): F068 AssignmentCodeModule（CRUD + 業務主管 Guard + audit log）` |
| 3 | `233158f` | `test(api/assignment-code): F068 E2E (9 cases) + entity sqlite 相容` |
| 4 | `ea4a400` | `feat(web/assignment): F068 代碼維護頁面（PROD_KIND / SPEC_TP / CASE_STATUS）` |

## 測試結果摘要

### Backend (vitest)

| 測試集 | tests pass |
|---|---|
| `src/database/migrations/__tests__/ob-code-df-varchar11.migration.spec.ts` | 8 / 8 |
| `src/modules/assignment-code/__tests__/assignment-code.service.spec.ts` | 18 / 18 |
| `src/modules/assignment-code/__tests__/assignment-code.controller.spec.ts` | 15 / 15 |
| `test/assignment-code.e2e-spec.ts` | 9 / 9 |
| **合計** | **50 / 50** |

### PG migration 實機驗證（cdmp-postgres）

| 驗證項 | 結果 |
|---|---|
| `tbl_id` 欄寬（`information_schema.columns`） | VARCHAR(11) ✓ |
| `PROD_KIND` 筆數 | 3（原 `tbl_id='01'`） ✓ |
| `SPEC_TP` 筆數 | 32（原 `tbl_id='02'`） ✓ |
| `CASE_STATUS` 筆數 | 4（原 `tbl_id='22'`，tbl_cd 01/02/03/04 + tbl_desc1 完整保留） ✓ |
| 殘留舊 tbl_id（'01'/'02'/'22'） | 0 ✓ |
| 白名單外 tbl_id（'03'/'04'/...）筆數 | 未動 ✓ |

### Backend API 直接驗證（curl 對 cdmp-api）

| Endpoint | 預期 | 實際 |
|---|---|---|
| `GET /api/v1/assignment/codes?tblId=PROD_KIND`（manager token） | 200 + 3 筆 | 200 + 3 筆 ✓ |
| `POST /api/v1/assignment/codes`（tblCd='01' 重複） | 422 CODE_IN_USE | 422 CODE_IN_USE「代碼值 01 在類別 PROD_KIND 中已存在」 ✓ |
| `GET ?tblId=CASEYEAR` | 422 CODE_TYPE_INVALID | 422「本功能僅支援 PROD_KIND / SPEC_TP / CASE_STATUS 三類代碼維護」 ✓ |
| `PUT /api/v1/assignment/codes/PROD_KIND/ZZ/disable` | 404 CODE_NOT_FOUND | 404「找不到指定的代碼」 ✓ |
| 無 Token | 401 AUTH_TOKEN_MISSING | 401 ✓ |
| 一般 user role 403 AUTH_FORBIDDEN | controller spec TS-C-013 已驗證 | ✓（curl 受 rate-limit 卡） |

### Frontend 手動驗收清單（Claude in Chrome）

對應 `prototypes/37-base-code.html`，登入 `manager@cdmp.test`：

| ID | 項目 | 結果 |
|---|---|---|
| TS-FE-001 | 三個 Tab PROD_KIND / SPEC_TP / CASE_STATUS（無 CASEYEAR） | ✓ |
| TS-FE-002 | Tab badge 顯示 active count（3 / 32 / 4） | ✓ |
| TS-FE-003 | CASE_STATUS Tab 切換時 banner 顯示/隱藏 | ✓ |
| TS-FE-004 | 搜尋框即時篩選 tbl_cd / tbl_desc1 | ✓（"汽車" 在 PROD_KIND 篩出 1 筆） |
| TS-FE-005 | 狀態下拉 4 選項（全部 / 生效中 / 未生效 / 已過期） | ✓ |
| TS-FE-006 | 清除按鈕重設搜尋 + 狀態 | ✓ |
| TS-FE-007 | Demo Bar 3 狀態切換 | ✓ |
| TS-FE-008 | 新增 Modal：system_id disabled='OB' / tbl_id disabled=當前 Tab | ✓ |
| TS-FE-009 | 新增 Modal 預設值：stadt=今日 / enddt=99991231 | ✓ |
| TS-FE-010 | 編輯 Modal：tbl_cd disabled、現有值帶入 | ✓ |
| TS-FE-011 | 停用 Modal 文字對齊 spec | ✓ |
| TS-FE-012 | CODE_IN_USE 時 Modal 不關閉 | ✓ |
| TS-FE-013 | 業務主管角色操作按鈕可用 | ✓ |
| TS-FE-014 | Admin 角色 BR-5 允許 | ✓（controller spec TS-C-014） |

## 已識別的後續 follow-up

1. **`apps/api/test/` 未 mount 進 cdmp-api 容器**：本次 E2E 是 `docker cp` 暫時放入跑通；建議在 `docker-compose.yml` 補 mount `./apps/api/test:/app/test` 以利後續 E2E 開發
2. **API rate limit 影響 dev 驗收**：connect rate limit 在頻繁 curl 驗證時被觸發（30s 內多次登入），建議 dev 環境放寬或加 X-Test-Bypass header
3. **Migration `migrations` 表不存在**：目前 dev 用 synchronize 模式，未走正式 `migration:run`；migration 檔本身為 idempotent（ALTER COLUMN 同型別 no-op + UPDATE 對應 0 row 也 no-op），prod 部署時可安全執行
4. **enddt = today 的當日 still active 行為**：依 OQ-F068-03 決議，停用當日 today == enddt 仍 active；明日才 expired。若 UAT 反映需「立即 inactive」可調為 today - 1
5. **AC-2/3/4 audit log 寫入後續驗證**：service / e2e 都已驗 `assignment_audit_log` 寫入動作；prod 上線後可加 dashboard 監控

## 交叉參考

- Spec：[F068-edit-base-code.md](../features/F068-edit-base-code.md)
- 架構決策：architecture-spec.md §AD-E07-14
- 資料模型：data-model.md #ob_code_df-entity
- 錯誤處理：error-handling.md #assignment-errors
- 前端原型：`prototypes/37-base-code.html`
