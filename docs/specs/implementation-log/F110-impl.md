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
- ~~F029 畫布編輯器 UI（後續獨立 story）~~ → **已由下方 SLICE 5 落地**。

---

# F110 SLICE 5 — Frontend 編輯器節點註冊（pipeline-editor）

> **範圍（SLICE 5）**：僅 frontend（`apps/web/src/pages/etl-pipelines/editor/*`）——將 `code_decode`
> 註冊為第 14 種 pipeline-editor 節點，使其可從節點工具箱拖入畫布、於畫布渲染（雙輸入 handle）、
> 於屬性面板編輯（共用字典來源 + N 組 mapping），並正確參與欄位流 / badge / tooltip 統計。
> **一律鏡射既有 `lookup` 節點的 frontend 模式**（code_decode 為 lookup 的泛化 → N mappings）。
> **不含（其他切片）**：backend handler（SLICE 1 已完成）、migration、`etl-pipelines.json` 收斂。

## Prototype 參照結論

- pipeline-editor prototype = `prototypes/18-pipeline-editor.html`；其僅示範 `lookup` 節點（雙輸入 handle、
  對照來源 dual/backward-compat 兩模式、輸出欄位清單），**無 `code_decode` 專屬原型**。
- spec §15 OQ-F110-05 明訂「F029 編輯器對 code_decode 的視覺化設定為後續 story」。
- 依專案規則「若節點面板無對應原型 → 沿用既有 in-app 模式」：本切片**逐一鏡射 in-app `lookup` 模式**
  （工具箱項目 / 雙輸入 handle / 屬性面板 dual-vs-compat 來源 / 輸出欄位子清單），僅將單一 mapping
  泛化為可增減的 N 組 mapping。導覽階層無變更（節點類型，非新頁面／路由 → **不動 sidebar**）。

## Test Results Summary

| Scenario / 群組 | 說明 | Status |
|-----------------|------|--------|
| code_decode computeNodeOutputColumns | 輸出欄 = 輸入欄 + 全部 mapping outputAlias（含多輸出、空 mapping 透傳） | PASS |
| code_decode computeNodeFieldStats + Badge | meta `{type:'code_decode',decodeCount,outputCount}` → amber「+N 解碼欄位」badge | PASS |
| code_decode buildTooltipContent | `type:'code_decode'`（source / mappingCount / decodeCount / 代碼欄→別名列） | PASS |

- 新測試檔：`editor/__tests__/code-decode-field-stats.test.ts`（5 tests，先紅後綠）。
- editor `__tests__` 全套重跑：**69 / 70 pass**（唯一失敗 `load-properties.test.tsx` 之 category E `(10)`
  為 pre-existing，git stash 驗證乾淨樹同樣失敗）。
- `apps/web` 全 etl-pipelines 重跑：**165 / 167 pass**（2 pre-existing 失敗＝load-properties + target-tables-page，
  皆 customer_core schema 欄數 drift，git stash 驗證與本切片無關）。
- `apps/web` `tsc -b`：baseline 70 → after **70**，**新增錯誤 = 0**（diff 僅 node-types.ts 89→90 與
  pipeline-node.tsx 20→21 兩筆 pre-existing 錯誤因新增 import/陣列列位移，非新錯誤）。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/web/src/pages/etl-pipelines/editor/node-types.ts | modified | `TRANSFORM_NODES` 新增 `code_decode` 項（label「代碼解碼 (Code Decode)」、icon `BookMarked`、category transform，緊接 lookup 之後） |
| apps/web/src/pages/etl-pipelines/editor/pipeline-node.tsx | modified | import + ICON_MAP 加 `BookMarked`；單輸入 handle 排除 code_decode；lookup 雙輸入 handle 區塊改為 `lookup \|\| code_decode`（main `default` 33% + `lookup-input` 67%） |
| apps/web/src/pages/etl-pipelines/editor/toolbox.tsx | modified | import + ICON_MAP 加 `BookMarked`（工具箱項目由 TRANSFORM_NODES 自動渲染） |
| apps/web/src/pages/etl-pipelines/editor/properties-panel.tsx | modified | switch 加 `case 'code_decode'`；新增 `CodeDecodeProperties`（共用字典來源 dual/compat + N 組 mapping：matchColumn / lookupMatchColumn / 選用 filter / 輸出欄位子清單，均可增減） |
| apps/web/src/pages/etl-pipelines/editor/node-field-stats.ts | modified | 兩個 `switch(nodeType)` 皆加 code_decode：`computeNodeOutputColumns`（輸入欄 + mapping aliases）、`computeNodeFieldStats`（`code_decode` meta）；`NodeFieldStatsMeta` / `getBadgeDescriptor` / `BadgeTooltipContent` / `buildTooltipContent` 同步新增 code_decode 分支 |
| apps/web/src/pages/etl-pipelines/editor/badge-tooltip.tsx | modified | `TooltipBody` switch 加 `case 'code_decode'` + 新增 `CodeDecodeTooltip`（字典來源 / 組數 / 代碼欄→別名列） |
| apps/web/src/pages/etl-pipelines/editor/__tests__/code-decode-field-stats.test.ts | new | code_decode 欄位流 / badge / tooltip 單元測試（鏡射 lookup 契約，5 tests） |

## 如何鏡射 lookup（逐點對照）

1. **palette**：TRANSFORM_NODES 新增一列，與 lookup 同 category/結構；工具箱由該陣列自動列出。
2. **canvas handle**：lookup 的雙輸入（`default` 33% 主資料 + `lookup-input` 67% 對照）條件擴為
   `lookup || code_decode`，並自單輸入分支排除 code_decode → 畫布連線與 lookup 完全一致。
3. **properties**：沿用 lookup 的「dual-input 唯讀 vs backward-compat 下拉 + subtitle 自動同步」來源區塊；
   將 lookup 的單組（matchColumn / lookupMatchColumn / lookupFilter / outputColumns[]）泛化為可增減的
   `mappings[]`，每組內含 outputColumns 子清單（保留 lookup 的完整表達力，spec §5.2）。
4. **field-stats**：lookup 於 `computeNodeOutputColumns` 讀 `data.outputColumns`；code_decode 改讀
   `data.mappings[].outputColumns[].outputAlias`，輸出 = 輸入欄 ∪ 全部 alias（LEFT JOIN 不減列，spec AC-2）。
   badge 採 amber「+N 解碼欄位」（transform 色系），tooltip 列出「代碼欄 → 別名」對。
5. **additive**：`lookup` 節點類型完全未改（BR-10 / AC-8）；`code_decode` 純新增。
