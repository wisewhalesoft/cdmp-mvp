---
type: implementation-log
feature_id: F110
feature_name: Code Decode 節點（泛用單趟多欄位代碼解碼）— SLICE 1（backend engine only）
status: partial
last_updated: 2026-07-10
---

# F110: Code Decode 節點 — SLICE 1 實作紀錄（backend engine only）

> **範圍（SLICE 1）**：僅 backend handler（PG + MSSQL）+ 其 DB-agnostic 單元測試 + dispatcher 註冊。
> **不含（後續切片，由 orchestrator 主導）**：frontend、`etl-pipelines.json` 收斂編輯、成對 data-update migration、
> 真實 MSSQL EQ / PERF / MIGRATION 驗證群組（`.mssql.spec.ts` 真實連線）。

## 交付內容對照 AD-E07-41 §13 / F110 §5~§7

- 執行策略：`SELECT INTO` 新暫存表（MSSQL）／`CREATE TEMP TABLE AS SELECT`（PG），N 個 filtered LEFT JOIN
  單趟補齊全部 mapping 描述欄（OQ-F110-01），**非**就地 ALTER+UPDATE。輸入表由既有 `NodeOutputStore.release()`
  eager-drop（不新增 cleanup）。
- 五項不變式逐一落地：I-CODEDECODE-JOIN-FILTER-01（filter 套於字典衍生子查詢內部 WHERE）／
  DEDUP-TIEBREAK-01（`ROW_NUMBER() OVER (PARTITION BY 正規化鍵 ORDER BY _cdmp_id ASC 或 (SELECT NULL)) = 1`）／
  NORMALIZE-01（複製 lookup 之 `trimCast`）／COLLISION-01（顯式欄位枚舉，outputAlias 同名覆蓋既有欄）／EQ-01。

## Test Results Summary（本切片 DB-agnostic 群組，全綠）

| 群組 | Scenario | Status |
|------|----------|--------|
| VALIDATE (AC-10) | TS-F110-001~014（兩 dialect 各一份，共用 `validateCodeDecodeConfig`） | PASS |
| SQLGEN-MSSQL | JOINFILTER/DEDUP(a/b)/NORMALIZE/SELECTINTO/COLLISION(1,2)/HASHJOIN/MULTIMAP/FILTER(1,2) | PASS |
| SQLGEN-PG | JOINFILTER/DEDUP/NORMALIZE/SELECTINTO/COLLISION/HASHJOIN(負向) | PASS |
| DISPATCH | DISPATCH-001/002/003 | PASS |
| SEMANTIC | TS-F110-015/016/017/018/019/023/025/026 | PASS |
| STATIC | STATIC-001/003/004 + 檔名鎖定 + SELECTINTO 主體 | PASS |
| REG-LOOKUP | REG-LOOKUP-003（lookup handler 未被修改） | PASS |
| DISPATCH-004 | node-dispatcher/pipeline-runner/types 未動 | PASS |

- 新測試：`p4f-codedecode-unit.spec.ts`（58 tests）+ `p4f-codedecode-static.spec.ts`（26 tests）。
- 合併相關 DB-agnostic 套件重跑：**190 tests 全綠**（含既有 p4a/p4b/p4c 靜態、engine-core、service spec）。
- `tsc --noEmit -p tsconfig.build.json`：**exit 0（乾淨）**。
- 真實 MSSQL/PG EQ、PERF、MIGRATION 群組：**未執行（後續切片）**，非本切片 DoD。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/api/src/modules/etl/engine/handlers/code-decode-handler.ts | new | PG handler（`nodeType='code_decode'`）；含 `validateCodeDecodeConfig`（export，供 MSSQL 版共用） |
| apps/api/src/modules/etl/engine/handlers/code-decode-handler-mssql.ts | new | MSSQL handler；SELECT INTO ## + OPTION (HASH JOIN) + `trimCast`（TRY_CAST NVARCHAR(4000)） |
| apps/api/src/modules/etl/engine/index.ts | modified | barrel 匯出 `CodeDecodeHandler` / `CodeDecodeHandlerMssql` |
| apps/api/src/modules/etl/etl-pipeline-execution.service.ts | modified | createDispatcher 第 10 對（MSSQL 分支 + PG 分支各註冊） |
| apps/api/src/modules/etl/engine/__tests__/p4f-codedecode-unit.spec.ts | new | VALIDATE + SQLGEN(兩 dialect) + DISPATCH + SEMANTIC |
| apps/api/src/modules/etl/engine/__tests__/p4f-codedecode-static.spec.ts | new | STATIC + REG-LOOKUP + DISPATCH-004 |
| apps/api/src/modules/etl/engine/__tests__/p4a-mssql-static.spec.ts | modified | DISPATCH-002：PG register 由 9 → 10（附加 CodeDecodeHandler，既有 9 順序不變） |
| apps/api/src/modules/etl/engine/__tests__/p4b-mssql-static.spec.ts | modified | 同上 |
| apps/api/src/modules/etl/engine/__tests__/p4c-mssql-static.spec.ts | modified | STATIC-004：mssql/pg register 由 9 → 10（附加 code_decode 對） |

## Architectural Decisions（spec 邊界內）

1. **驗證共用**：`validateCodeDecodeConfig` 定義於 PG handler 並 export，MSSQL handler import 之——兩 dialect
   驗證邏輯逐一相同（dialect-neutral），避免重複；不違反 AD-E05-7c「檔內不依 DB_TYPE 切 SQL 邏輯」（本函式與 SQL 產生無關）。
2. **空輸入 vs 缺主流**：`inputs['default']` 缺席 → 拋 `缺少主資料流輸入`（TS-F110-011）；present 但 `rowCount=0`
   → 回傳 emptyDataSet、completed（TS-F110-023）。此為 F110-test 明確區分（lookup 兩者同待，code_decode 不同）。
3. **`_cdmp_id` 排序鍵**：節點級字典表單次內省（MSSQL：`##`/`#` 走 tempdb.sys.columns、實體表走大寫
   INFORMATION_SCHEMA.COLUMNS；PG：information_schema.columns）；存在 → `ORDER BY d."_cdmp_id" ASC`，
   否則 fallback `ORDER BY (SELECT NULL)`（AD §13.2 Critical #2；GATE-002 逐表核對留待真實 fixture 切片）。
4. **filter 錯誤包裝**：主 JOIN 查詢以 try/catch 包裝，拋 `對照表查詢失敗：{error}`（F110 §13）。

## 已知偏差（依 spec 授權對齊 lookup 現行措辭）

- **TS-F110-013 文案**：F110 §13 表列建議文案為「找不到對應的 extraction task（…）且無 lookupSource fallback」，
  但 spec §13 明訂「文案由 tdd 落地時對齊 lookup handler 現行措辭」。lookup 現行重用 `resolveRawTable(Mssql)`，
  其實際拋出訊息為「lookupRef 解析失敗且無靜態表名可 fallback（…）」。本實作沿用該 helper，故測試斷言對齊
  `解析失敗…fallback`（非 §13 表列之建議文案）。屬 spec 授權之措辭對齊，非行為偏差。

## 後續切片（非本切片，供 orchestrator 銜接）

- 真實 MSSQL EQ-MSSQL / EQ-PG-BYTEIDENTICAL / PERF-NFR 群組（`.mssql.spec.ts`，需真實連線）。
- `etl-pipelines.json` 收斂（31 lookup → 9 code_decode，version 13→14、step_count →34）+ 成對 PG/MSSQL
  data-update migration + 共用 definition 模組（AD §13.6）。
- F029 畫布編輯器 UI（後續獨立 story）。
