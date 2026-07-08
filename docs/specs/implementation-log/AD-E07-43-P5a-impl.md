---
type: implementation-log
feature_id: AD-E07-43-P5a
feature_name: MSSQL 全面遷移 P5a — CI mssql-specs baseline bootstrap + P1b2/P1b3 wipe-dbo 隔離
status: complete
last_updated: 2026-07-08
---

# AD-E07-43 P5a：CI mssql-specs Bootstrap + wipe-dbo 排序 — Implementation Log

在 CI `mssql-specs` lane 於執行任何 `*.mssql.spec.ts` 前新增 `migration:run` bootstrap（建完整
MSSQL baseline 於 `CDMP_TEST.dbo`），使 P3a 等「複用既有 dbo baseline」之 DB 案例由**靜默 skip → 真跑**；
並排查/修正**所有會破壞共用 dbo baseline 的測試**（P1b2、P1b3、**pattern-b**——後兩者為調查中發現、
AD 未點名），落實不變式 **I-MSSQL-CI-BOOTSTRAP-01**。

## Test Results Summary

本機模擬 CI 流程（真 MSSQL `cdmp-mssql` 容器 / 2022 Linux / localhost:1433）：
先對 `CDMP_TEST` 執行 `migration:run`（bootstrap），再逐一跑各 spec。

| 情境 | Spec | 結果（本輪實測） | 對照（bootstrap 前） |
|---|---|---|---|
| P3a 真跑（DoD #3） | `stage1-sql-pushdown.mssql.spec.ts` | **63 passed / 0 skip** | 11 passed / 52 skip（假綠）|
| P3b 雙模式相容 | `stage2to4-sql-pushdown.mssql.spec.ts` | **52 passed**（含於 143）| 52（自建）|
| P3c 雙模式相容 | `stage3to4-ration-pushdown.mssql.spec.ts` | **45 passed**（含於 143）| 45（自建）|
| P3d 雙模式相容 | `cr-priority-pushdown.mssql.spec.ts` | **46 passed**（含於 143）| 46（自建）|
| P1b2 隔離（→ CDMP_P1B2） | `mssql-p1b2.mssql.spec.ts` | **43 passed** | 43（於 CDMP_TEST）|
| P1b3 隔離（→ CDMP_P1B3） | `mssql-p1b3.mssql.spec.ts` | **50 passed** | 50（於 CDMP_TEST）|
| pattern-b 隔離（→ CDMP_PATTERNB） | `pattern-b.mssql.spec.ts` | **5 passed** | bootstrap 後 PARAM-003 失敗（回歸）|
| P3a 排序無關（wipe-dbo 後重跑） | `stage1-sql-pushdown.mssql.spec.ts` | **63 passed / 0 skip** | — |

P3b/c/d 合跑一次 = **143 passed / 3 files**（52+45+46）。

**全套 `*.mssql.spec.ts` 序列化（`--no-file-parallelism`，CI 鏡像；三隔離修法全上 + CDMP_TEST 已 bootstrap）**：
**31 files passed / 0 failed；630 passed | 17 skipped（647）**。17 skip 為 Linux 容器 `sp_getapplock`/17750
DLL 缺失之並發鎖案例（P2a/P2b/P2c 等，**非回歸**，見 memory `feedback_mssql_linux_container_17750`）。
修法上線前之首輪全套為 `1 failed`（pattern-b PARAM-003），修法後 `0 failed`（該案轉綠、+1 passed）。

**全套跑完後直接查三庫 dbo（isolation 於完整 CI 序列下坐實）**：
```
CDMP_TEST.dbo total tables=39, P3a six-table set present=6/6   ← 歷經 P1b2/P1b3/pattern-b/P3b~d 全跑完仍完整
CDMP_P1B2.dbo total tables=0                                    /  CDMP_P1B3.dbo total tables=0  /  CDMP_PATTERNB 各自 empty
sys.databases LIKE 'CDMP%' = CDMP, CDMP_P1B2, CDMP_P1B3, CDMP_PATTERNB, CDMP_TEST
```

### 🔴 隔離正確性直接證據（sys.tables 交叉查證）

P1b2 **與** P1b3 皆跑完（兩者於各自 spec 內 `wipe dbo` + 重建）後，直接以 `sa` 查三庫 `dbo`：

```
CDMP_TEST.dbo total tables=39, P3a six-table set present=6/6   ← bootstrap baseline 完整、未被殃及
CDMP_P1B2.dbo total tables=0                                    ← P1b2 只清自己的庫
CDMP_P1B3.dbo total tables=0                                    ← P1b3 只清自己的庫
```

`CDMP_TEST.dbo` = 36 業務表 + `queue_job` + `customer_core` + `typeorm_migrations` = 39，P3a 六表齊全。
**wipe-dbo 測試完全未觸及 bootstrap 所建之 baseline** → I-MSSQL-CI-BOOTSTRAP-01 達成。

### tsc / YAML

- `npx tsc --noEmit -p tsconfig.build.json`：**乾淨（exit 0）**。
- `.github/workflows/ci.yml`：YAML `safe_load` 解析通過（合法）。

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `.github/workflows/ci.yml` | modified | `mssql-specs` job 新增 `Bootstrap MSSQL baseline (migration:run → CDMP_TEST.dbo)` step，置於 `Init MSSQL` 之後、`MSSQL specs (serialized)` 之前 |
| `docker/mssql-init.sql` | modified | 新增三個隔離資料庫 `CDMP_P1B2` / `CDMP_P1B3` / `CDMP_PATTERNB`（BIN collation + `cdmp` db_owner），供各自建/丟 baseline 名稱表之測試使用，與共用之 `CDMP_TEST.dbo` 解耦 |
| `src/database/__tests__/mssql-p1b2.mssql.spec.ts` | modified | 新增 `P1B2_DATABASE = process.env.MSSQL_P1B2_DB ?? 'CDMP_P1B2'`；DataSource `database` 與 CLI env `DB_NAME` 皆改指向該隔離庫；兩處測試名之 `CDMP_TEST` 描述更正為隔離庫 |
| `src/database/__tests__/mssql-p1b3.mssql.spec.ts` | modified | 新增 `P1B3_DATABASE = process.env.MSSQL_P1B3_DB ?? 'CDMP_P1B3'`；DataSource `database` 與子行程 `childEnv().DB_NAME` 皆改指向該隔離庫 |
| `src/modules/assignment/services/__tests__/pattern-b.mssql.spec.ts` | modified | 新增 `PATTERNB_DATABASE = process.env.MSSQL_PATTERNB_DB ?? 'CDMP_PATTERNB'`；DataSource `database` 改指向該隔離庫（保「dbo 空」前提；PARAM-003 之 customer_core 於空庫天然缺表，斷言不動）|

## Architectural Decisions

### CI Bootstrap 步驟（P5a 工作項 1）

在 `mssql-specs` job 加一個 step：以 `npm run migration:run`（沿用 `apps/api/scripts/typeorm.cjs`
launcher + `data-source.ts`）對 `CDMP_TEST` 建完整 baseline。順序 = `Init MSSQL`（mssql-init.sql 建空庫）
→ **`Bootstrap`（migration:run 建 37 表 + reference-data + queue_job）** → `MSSQL specs (--no-file-parallelism)`。
env（DB_TYPE=mssql / DB_HOST=localhost / DB_PORT=1433 / DB_NAME=CDMP_TEST / encrypt+trust / NODE_ENV=production）
與既有 specs step 一致。此步同時**額外驗證 migration 檔案本身可正確執行**（P3a 若改自建則無此價值，AD §2.1 理由 1）。

本機實測 bootstrap：三支 mssql migration（schema / reference-data / queue_job）皆
`has been executed successfully`、exit 0、無 `QueryFailedError|17750|DLL`。

### P1b2/P1b3 wipe-dbo 排序修法 — 採 §2.1 選項 (b)「隔離範圍」（獨立資料庫）

**調查結果（超出 task 原述）**：task 只點名 P1b2，但實查 24 個 dbo-touching mssql spec 後確認**共有兩支**
會清空共用 `dbo`：
- **P1b2**：Path B 以真實 CLI `migration:run` 建 `dbo`，`STATIC-004` revert + `REG-005`/`afterAll`
  `dropAllTablesInSchema(dbo)` → **結束時 dbo 淨空**；且 `BASELINE-006` **斷言起始 dbo 為空**。
- **P1b3**：`beforeAll` 先 `dropAllDbo` 再 `migration:run + seed*3`，`afterAll` 再 `dropAllDbo` → **結束時 dbo 淨空**。

另發現**第三支**（不同子類）：
- **pattern-b（P1c PARAM）**：`PARAM-003` 斷言 `customer_core` **缺表**錯誤（設計前提＝dbo 空）；`PARAM-007/009/016/016b`
  於 dbo **建立並於 `afterAll` 無條件 DROP** 簡化版 baseline 名稱表（`ob_arreturndf_min_cap` /
  `ob_monthly_run_result` / `ob_pool_data` / `ob_emphire` / `ob_list_definition`）。bootstrap 後：(1) customer_core
  已存在 → PARAM-003 直接失敗；(2) 其 `DROP` 會把 bootstrap 建於 `CDMP_TEST.dbo` 的 5 張 baseline 表刪除
  → 若後續 spec 依賴則消失。**此非「全 dbo wipe」子類，而是「建/丟 baseline 名稱表」子類**，但同樣違反
  I-MSSQL-CI-BOOTSTRAP-01，故一併隔離。

**首輪全套實測即抓到此回歸並證實排序風險**：三隔離修法上線前先跑一次全套 → `pattern-b` PARAM-003 FAIL
（`expected null not to be null`＝customer_core 存在、查詢未拋錯）；且該輪結束後直接查 `CDMP_TEST.dbo`
= 34 表 / 六表僅 3 存在（舊 pattern-b `afterAll` 把 `ob_pool_data`/`ob_monthly_run_result`/`ob_list_definition`
刪掉了）。→ pattern-b 對共用 baseline 之破壞為**實測坐實**，非臆測。

其餘 baseline 類 spec 皆安全、無需處理：
- **獨立 SQL schema 隔離**：P1a=`p1a`、P1b1=`p1b1`、P2a=`p2a_sync`/`p2a_baseline`、P2b=`p2b_e2e`、P2c=`p2c_e2e`。
- **雙模式（probe→只建缺表、只丟自建）**：P3b/c/d（`existedBeforeSuite`/`selfBuiltTables`）、
  P4a/P4b（`ownDs`/`ownEt` ownership flag 對 `datasources`/`extraction_tasks`）、P4c（`ensureTargetTable`
  只建缺表、`afterAll` 只丟 `tl_p4c_*`/`##fx_*` 測試專屬表 + 前綴 DELETE `customer_core`）。全套實測皆通過。
- **測試專屬表名**：P4a/c/d 之 `raw_*` / `tl_*` / tempdb `##` 表，非 baseline 名稱。

**為何 (a) 自身還原 / (c) 排序控制不可行**：
- **bootstrap 為 vitest 之前的 CI step**，跑完 vitest 時 `CDMP_TEST.dbo` 已非空 → P1b2 之 `BASELINE-006`
  （斷言 dbo 空）與 `BASELINE-001`（僅在 `dboInitialTableCount===0` 時才跑 migration:run）會**直接失敗**。
  故 **(c) 純排序控制無法修**（無論 wipe 測試排在何處，bootstrap 已先污染 P1b2 所需的「空 dbo」前提）；
  且 task 明示「勿依賴檔案跑序隱含假設」。
- **(a) 自身還原**需改寫 `BASELINE-006` 語意 + 於 `afterAll` 再跑一次 `migration:run` 還原 baseline（多一次
  migration + 有還原失敗 window，一旦失敗會連鎖打掉所有後續 consumer）。

**選 (b) 之理由（最穩健、CI 與本機皆可獨立重跑）**：給 P1b2/P1b3 各自一個 fresh 空庫（`CDMP_P1B2`/
`CDMP_P1B3`，由 `mssql-init.sql` 以 `sa` 建立），它們的真實 CLI migration 與 wipe 全落在自己的庫。
- 與 bootstrap 的 `CDMP_TEST.dbo` **完全解耦** → 執行序無關、無還原步驟、無失敗 window。
- P1b2「起始 dbo 為空」**天然成立**（專屬庫 fresh empty）→ **無需改寫任何斷言**。
- Path B 仍走「連線之 DB 的 `dbo`、CLI 無 schema override」＝**真實 prod 部署路徑**，僅資料庫名不同，
  parity/baseline 語意不受影響（隔離發生在 database 層而非 schema 層，因 CLI migration 恆進 dbo，
  改走 schema 需動 prod `data-source.ts`，風險更高、且弱化「測到 prod dbo 路徑」之主張）。
- 附帶修掉**本機既有 footgun**（P3a impl log 記「p1b2 套件跑後留空 dbo」使本機 P3a 靜默 skip）——
  現 P1b2/P1b3 本機也不再動共用 dbo。

覆寫以 `process.env.MSSQL_P1B2_DB` / `MSSQL_P1B3_DB` / `MSSQL_PATTERNB_DB` 提供 env 可調
（預設 `CDMP_P1B2`/`CDMP_P1B3`/`CDMP_PATTERNB`）。若隔離庫不存在（本機未重跑 mssql-init），spec
`ds.initialize()` throw → 既有 try/catch 降級為 skip（不假綠、不 crash）。

### 雙模式相容性驗證（P5a 工作項 4 / DoD #4）

P3b/c/d harness 為「`OBJECT_ID('dbo.<t>')` 探測 → 存在則入 `existedBeforeSuite`（afterAll **絕不** DROP）、
缺表才自 `MSSQL_BASELINE_DDL` 自建入 `selfBuiltTables`（afterAll DROP）」。bootstrap 後 12 表皆存在 →
全入 `existedBeforeSuite`、`selfBuiltTables` 空 → **afterAll 不 DROP 任何表**，baseline 全保留（上方
`CDMP_TEST.dbo total tables=39` 於 P3b/c/d 之後仍成立即為證）。`GATE-001` 之
`existedBeforeSuite.size + selfBuiltTables.length === 12` 於兩模式皆成立。→ **雙模式相容確認**。

bootstrap 之 reference-data migration 只灌 `roles`/`pooldata_field_whitelist`/`pooldata_field_option`，
**非** P3a-d 任何 fixture 表（Stage1/2/3/4 用 `ob_*`/`customer_core` 之 P3-prefix / version-scoped 隔離）；
計分表 `ob_levelcard_*`/`ob_tier` 由 `data-seed` 灌、bootstrap 不跑 → 保持空，P3b/c/d 自種 version-scoped
fixture → **無污染**。

### postgres / sqlite lane 不受影響

`ci.yml` 僅於 `mssql-specs` job 內新增一 step；`lint-typecheck-unit`（SQLite）、`pg-specs`、`web-unit`
三 job 之步驟與邏輯**零改動**。bootstrap step env 皆 mssql 專屬（DB_TYPE=mssql），不影響其他 lane。
未動任何 PG migration 檔或其 glob（`data-source.ts` 兩軌獨立 glob 維持不變）。

## 偏離 spec/AD 與測試設計

1. **P1b3 一併納入修法（AD 只點名 P1b2）**：AD §2.1 與 task 描述聚焦 P1b2，但 P1b3 同樣 wipe 共用 dbo
   （`beforeAll`/`afterAll` `dropAllDbo`），若不處理，P1b3-before-P3a 之執行序仍會殃及 baseline。
   依 I-MSSQL-CI-BOOTSTRAP-01「**任何**會清空/重建共用 dbo schema 之測試」，同以選項 (b) 隔離至 `CDMP_P1B3`。
   此為忠實落實不變式之必要擴充，非擅自擴大範圍。
2. **pattern-b 一併納入修法（bootstrap 引入之回歸 + 排序風險）**：bootstrap 使 `customer_core` 存在 →
   pattern-b `PARAM-003` 回歸失敗；且其無條件 DROP 5 張 baseline 名稱表會破壞共用 baseline（實測坐實）。
   同以選項 (b) 隔離至 fresh empty 之 `CDMP_PATTERNB`（永不 bootstrap）→ customer_core 於該庫天然缺表
   （PARAM-003 斷言**不需改動**，保原始意圖「具名參數轉換本身合法、錯誤僅來自缺表」）、其 DROP 只作用於自身庫。
   屬 DoD「P1/P2/P4 既有 `.mssql.spec.ts` 零回歸」之必要修復（pattern-b 為 P1c 套件），非擴大範圍。
   *方案取捨*：未改 PARAM-003 為「sentinel 不存在表名」或「翻轉為 customer_core 存在→斷言成功」，因隔離庫方案
   同時解決 PARAM-007/016 之 baseline 破壞（單一手法解全套 5 案），且免動任何斷言、最忠實原設計「dbo 空」前提。
3. **未改動 P3a spec 本體**：P3a 維持「缺表則 GATE-002 引導 bootstrap、DB 案例 skip」之既有設計（AD §2.1
   裁定「CI 層 bootstrap，非 P3a 回頭自建」）；bootstrap 後表齊 → 自然真跑，符合裁定。

## Blocking Issues

無。P3a 由 11/52-skip → 63 全綠、P3b/c/d 143 全綠（雙模式相容）、P1b2 43 / P1b3 50 / pattern-b 5 於隔離庫全綠、
全套 CI 鏡像 **31 files / 0 failed（630 passed / 17 skipped）**、歷經全套後 `CDMP_TEST.dbo` baseline 完整
（39 表、六表齊）、P3a wipe-dbo 後重跑仍 63 綠、tsc 乾淨、YAML 合法、postgres/sqlite lane 零改動。

### 給後續（P5b / DevOps）之備註
- **本機開發者**：需重跑 mssql-init（`docker compose --profile mssql up -d mssql-init`，或手動套用
  `docker/mssql-init.sql` 新增之 `CDMP_P1B2`/`CDMP_P1B3`/`CDMP_PATTERNB` 區塊）才能於本機真跑
  P1b2/P1b3/pattern-b；否則三者降級 skip（非假綠）。
- **P5b（其餘 5 條 pipeline）**：同樣依賴 `CDMP_TEST.dbo` baseline，直接受惠於本 bootstrap，無需另建表；
  且 P5b 之新測試若要於 dbo 建/丟 baseline 名稱表，須沿用「雙模式 probe」或「隔離庫」擇一，勿無條件 DROP
  共用 baseline（同 I-MSSQL-CI-BOOTSTRAP-01）。
