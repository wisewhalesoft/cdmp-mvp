---
type: implementation-log
feature_id: F043, F044
feature_name: ETL Bug Fix — merge-handler / target-load-handler / pipeline-definition
status: complete
last_updated: 2026-04-14
---

# F043/F044: ETL Bug Fix — 實作紀錄

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F043-010A | [BUG-1] same-name join key 輸出 `_left`/`_right` 欄位 | PASS |
| TS-F043-010B | [BUG-1] same-name join key 雙方均 match | PASS |
| TS-F044-018 | [BUG-2] name=null 記錄不被隱性 NOT NULL 過濾排除 | PASS |
| TS-F044-019 | [BUG-2] ghost record 閘門（LENGTH >= 5） | PASS |
| TS-F044-020 | [BUG-2] VARCHAR 空字串正規化 NULLIF(TRIM) | PASS |
| TS-F042-002 | pipeline definition 拓撲排序（更新節點數 + padStart 順序） | PASS |

## 修改檔案

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| `apps/api/src/modules/etl/engine/handlers/merge-handler.ts` | modified | BUG-1：same-name join key 額外輸出 `{key}_left` 和 `{key}_right` 欄位 |
| `apps/api/src/modules/etl/engine/handlers/target-load-handler.ts` | modified | BUG-2a：移除隱性 NOT NULL 過濾，新增 ghost record 閘門（LENGTH >= 5），VARCHAR 欄位 NULLIF(TRIM) 正規化 |
| `scripts/seed-pipeline-definition.json` | modified | BUG-2b：cd1 rules 從 5 擴充至 14 個欄位；BUG-3：新增 df_zzip_ctype_pad1/2 padStart 節點；BUG-1 補充：df3 表達式改用 source_customer_no_left/right |
| `apps/api/src/modules/etl/__tests__/engine-node-executors.spec.ts` | modified | 新增 TS-F043-010A、TS-F043-010B 測試 |
| `apps/api/src/modules/etl/__tests__/engine-target-load.spec.ts` | modified | 新增 TS-F044-018、TS-F044-019、TS-F044-020 測試；更新 mock queryRunner 支援 data_type 查詢 |
| `apps/api/src/modules/etl/__tests__/engine-core.spec.ts` | modified | 更新 TS-F042-002 以反映新增 padStart 節點及動態節點數 |

## 架構決策

- **BUG-1 merge-handler**：在 `sameKeyName` 分支中，除了 COALESCE 主欄位外，額外 SELECT `l."{key}" AS "{key}_left"` 和 `r."{key}" AS "{key}_right"`，使下游 CASE WHEN 可區分記錄來源
- **BUG-2a target-load-handler**：
  - 移除 `information_schema.columns WHERE is_nullable='NO'` 動態查詢，避免隱性排除 nullable 欄位為 null 的合法記錄
  - 新增 ghost record 閘門 `WHERE LENGTH(TRIM("source_customer_no")) >= 5`，顯式過濾短識別碼
  - 新增 VARCHAR 欄位偵測（查詢 `data_type`），對 `character varying` 和 `text` 型別欄位套用 `NULLIF(TRIM(col), '')`
- **BUG-2b cd1 rules**：Newer 策略（`source_updated_at >=`）用於 13 個欄位，MIN 策略（`source_created_at <=`）用於 `source_created_at`
- **BUG-3 padStart**：在 ZZIP 路線 e1/e2 之後、lk_edu1/lk_edu2 之前插入 `df_zzip_ctype_pad` 節點，確保 CUSTOM_MK 補零後 Lookup 能正確命中

## 全套測試結果

- 469 passed / 14 failed（14 個失敗均為 pre-existing，與本次修正無關）
- 本次新增 5 個測試、修改 1 個測試，全部 PASS
