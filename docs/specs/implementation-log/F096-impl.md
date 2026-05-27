---
type: implementation-log
feature_id: F096
feature_name: POOLDATA 篩選欄位白名單 list_type 停用（期別篩選唯一路徑澄清）
status: complete
last_updated: 2026-05-27
---

# F096：白名單 list_type 停用 — 實作日誌（Phase B）

## 摘要

依 F096 spec v1.0（AD-E07-26 §26.7）落地：新增 migration
`1711360000293-DeactivatePooldataWhitelistListType`，將
`pooldata_field_whitelist` 之 `list_type` 條目 `is_active` 設為 `false`（冪等、可逆、
SQLite 0/1 字面分支）。`case_status` 保持 active 不動。純資料/設定變更，不新增表/欄位，
**不改 production 月跑案件數**。

## 端點語意澄清（重要落地依據）

F096 spec/test 與 AD-E07-26 §26.7 文字均提及
`GET /api/v1/pooldata-fields/available-columns` 停用後「不再顯示 list_type」。經查證現行程式：

- `available-columns` 端點的實際語意為「**OBPOOLDATA 來源欄位中尚未列入白名單**的欄位」
  （`PooldataFieldWhitelistService.getAvailableColumns` 用 `NOT IN (SELECT column_name
  FROM pooldata_field_whitelist)`，排除**所有**白名單欄位含 inactive）。`list_type`
  既已在白名單，**本即不在此端點輸出**——與其 active/inactive 狀態無關。
- 名單**篩選欄位 dropdown** 的真正資料源為 `GET /api/v1/pooldata-fields?active=true`
  （前端 `list-create/edit-draft-page` → `listFields({active:'true'})`），以及
  condition_payload 校驗讀 `whitelistRepo.find({ where:{ is_active:true } })`。

因此 F096 的**核心意圖**（list_type 不再可被選為篩選欄位、case_status 仍可選）由下列
驗證達成，與 spec 意圖一致：
1. `active=true` 白名單集合於 m293 後不含 `list_type`、仍含 `case_status`（TS-F096-API-001/002/003）。
2. 後端 `validateConditionPayload`（讀 `is_active=true`）於繞過 dropdown 新增 `list_type`
   條件時回 `CONDITION_COLUMN_NOT_IN_WHITELIST`（TS-F096-COMPAT-002）。

此為 spec/test 文字之端點命名不精確（沿用 AD §26.7 措辭），不影響行為正確性；已依
source-of-truth 以實際端點語意落地並於此記錄。

## 測試結果

| Scenario ID | 說明 | 狀態 |
|---|---|---|
| TS-F096-MIG-001 | up() UPDATE list_type → is_active=false；僅 1 列；不誤動其他 | PASS |
| TS-F096-MIG-002 | down() 還原 list_type=true（可逆）；其他不受影響 | PASS |
| TS-F096-MIG-003 | 冪等 — 重複 up() 後仍 false、列數不變、不 throw | PASS |
| TS-F096-MIG-004 | 最小影響 — case_status / best_case 不變（SQLite functional） | PASS |
| SQLite 字面 | up()=0 / down()=1（非 FALSE/TRUE） | PASS |
| TS-F096-API-001 | 停用後 active 集合不含 list_type | PASS |
| TS-F096-API-002 | case_status 仍在 active 集合；list_type 仍存在白名單（is_active=false，非 DELETE） | PASS |
| TS-F096-API-003 | m293 前後 diff：afterColumns = beforeColumns − {list_type} | PASS |
| TS-F096-COMPAT-001 | 既有 list_type 條件 buildStage1WhereConditions 仍回有效 WHERE（`"list_type" IN (:...)`）| PASS |
| TS-F096-COMPAT-002 | 新增 list_type 條件 → 422 CONDITION_COLUMN_NOT_IN_WHITELIST；case_status 不被誤攔 | PASS |

測試套件：`m293-...spec.ts`(10) + `f096-list-type-cleanup.spec.ts`(8) = 18 PASS。

## 變更檔案

| 檔案 | 類型 | 說明 |
|---|---|---|
| `apps/api/src/database/migrations/1711360000293-DeactivatePooldataWhitelistListType.ts` | new | m293：UPDATE is_active（up false / down true），DB_TYPE 0/1 vs FALSE/TRUE 分支，冪等 |
| `apps/api/src/database/migrations/__tests__/m293-...spec.ts` | new | migration 行為（mock SQL + SQLite functional 冪等/可逆/最小影響） |
| `apps/api/src/modules/assignment-list/__tests__/f096-list-type-cleanup.spec.ts` | new | API regression（active 集合 diff）+ COMPAT-001（composer 解析）+ COMPAT-002（422 攔截） |

## 架構決策 / 落地選擇

- **以 migration 而非 seed 落地**：`pooldata_field_whitelist` 由 migration 管理
  （m220 seed / m280 realign / m284 case_status），F096 沿用同模式（m293），與 F075
  v1.6 既有 whitelist 管理方式一致（A-1 由 AD-E07-26 §26.7 拍板）。
- **migration 編號 m293**：不撞號（m291=data_source、m292=ob_monthly_run_result 皆已存在）。
- **既有名單相容（AC-4 / BR-4）**：`buildStage1WhereConditions` 為純函式，不讀白名單；
  含 `list_type` 條件之既有名單仍正常解析（`list_type` 非 case_status 映射目標，直接映射
  `ob_pool_data.list_type`）。m293 僅作用於「新增條件」入口。

## 須確認之處

無阻擋。OQ-WL-01（既有名單 condition_payload 中 list_type 條件是否一併 backfill 移除）
依 spec 為 follow-up（Low），本階段僅停用未來新增入口，不處理既有條件清理。
