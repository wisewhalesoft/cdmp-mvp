---
type: implementation-log
feature_id: AD-E07-39-P1b2
feature_name: MSSQL 全面遷移 P1b2 — Prod Baseline Migration + Dev/Prod Parity 驗證
status: complete
last_updated: 2026-07-07
depends_on: [AD-E07-39, AD-E07-39-P1b1]
---

# AD-E07-39 P1b2 — Implementation Log

> 精簡管線最後一棒：prod 手寫 T-SQL baseline migration + dev/prod 兩軌結構化 parity 驗證。
> 實跑環境：`docker compose --profile mssql`（localhost:1433，CDMP_TEST，`Chinese_Taiwan_Stroke_BIN`，SQL Server 2022），`cdmp` login 僅 db_owner（無 dbcreator）。

## 0. Baseline Migration 產生流程（AD §6 步驟 2~5，忠實記錄）

1. **草稿**：對空的 `CDMP_TEST.dbo` 以 TypeORM schema builder `driver.createSchemaBuilder().log()`（全 36 entity、`DB_TYPE=mssql`、**不執行只回傳 SQL**）取得 up/down DDL。此法等同 `migration:generate`，但完全掌控輸出、且保證與 `synchronize` 路徑逐句同源（parity by construction）。
2. **人工稽核**（逐項核對，全數通過）：
   - 型別：`uuid→uniqueidentifier`、長文字→`nvarchar(MAX)`、`boolean→bit`、裸 `timestamp→datetime2`（F-1）、`simple-json→ntext`、`@PrimaryGeneratedColumn bigint→IDENTITY(1,1)`。
   - **B1**：`token_blocklist` PK = `token_hash binary(32)`（非 `nvarchar(2048)`），無明文 `token` 欄。
   - collation：無逐欄覆寫（一律繼承 DB 層級 `Chinese_Taiwan_Stroke_BIN`）。
   - **不建立** `fn_calc_tier_level`（AD-E07-38 裁定死碼）；**無 filtered index**（AD §0 F-2，全文 `CREATE INDEX … WHERE` 零命中）。
   - **無動態 SQL 執行 API**（P1b1 §5.6：本機容器對 `EXEC sp_executesql` 拋 17750）；純 `CREATE/ALTER` DDL。
   - 無任何 PostgreSQL 專屬語法（`public.` schema 前綴 / `::` / `SERIAL` / `RETURNING` / `uuid_generate_v4` / `NOW()` 等零命中）。
3. **定案**：`apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts`（64 up + 64 down 句：36 `CREATE TABLE` + 14 index + 14 FK）。`down()` 以 up 之反序執行（先 drop FK、再 drop index/table）。
4. **實跑驗證**（真 MSSQL 容器，非模擬）：`NODE_ENV=production` 下 `migration:run` → 36 表 + 全索引/FK 零錯誤、`typeorm_migrations` 恰 1 筆、`INSERT INTO … typeorm_migrations`（parameterized `@0,@1`）**未觸發 17750**（證實 tedious 參數化 RPC 與 literal `EXEC sp_executesql` 為不同路徑，前者正常）。

## 1. Test Results Summary（39 案例）

| 群組 | 案例 | 落地 | 結果 |
|---|---|---|---|
| BASELINE | 001~006（6，含 🔴 DoD #1） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| PARITY | 001~010（10，含 🔴 001/004/009） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| TIERFN | 001~003（3，含 🔴 DoD #3） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| FILTER | 001~003（3） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| COLLATE-BASELINE | 001~003（3） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| CASE-BASELINE | 001~002（2） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| HASH-BASELINE | 001~003（3） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| STATIC | 001~004（4，含 🔴 001） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| REG | 005（dbo 閉環） | `mssql-p1b2.mssql.spec.ts` | ✅ PASS |
| REG | 001（tsc build 乾淨） | `tsc --noEmit -p tsconfig.build.json` | ✅ exit 0 |
| REG | 002（p1b1 不回歸） | `mssql-p1b1.mssql.spec.ts` | ✅ 39/39 |
| REG | 003（p1a 不回歸） | `mssql-p1a.mssql.spec.ts` | ✅ 25/25 |
| REG | 004（sqlite/unit 不回歸） | `auth.guard`/`auth.service` 代表性 | ✅ 29/29；pg 容器不可達（見偏離 §4.4） |

**核心紅線全數綠燈**：
- `mssql-p1b2.mssql.spec.ts`：**35/35 passed**（真 MSSQL 實跑；REG-001~004 為外部閘，見 §3）。
- PARITY-001~007（結構化 diff 為空）+ **PARITY-009（comparator 敏感度：注入合成差異被抓到恰 1 筆）**+ **STATIC-001（無 `sp_executesql`）** 全綠。
- 兩軌 parity：`p1b2_sync`（synchronize）vs `dbo`（baseline migration）欄位/索引/表集合 diff 皆空、check_constraints 兩路徑皆 0。

## 2. Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts` | new | 手寫 T-SQL baseline（36 表 + 索引 + FK）；prod MSSQL schema 唯一事實來源。 |
| `apps/api/src/database/data-source.ts` | modified | 新增 per-dialect `migrationsGlob`：mssql→`migrations/mssql/*`、postgres→`migrations/*.{ts,js}`（非遞迴，不撿子目錄）。 |
| `apps/api/src/database/__tests__/schema-parity.ts` | new | 可重用純函式 parity comparator（欄位/索引/表集合結構化 diff；比對 key 不含 schema 名/索引實體名）。 |
| `apps/api/src/database/__tests__/mssql-p1b2.mssql.spec.ts` | new | 35 in-spec test（BASELINE/PARITY/TIERFN/FILTER/COLLATE/CASE/HASH/STATIC/REG-005）；沿用 P1b1 gating harness。 |

## 3. 兩路徑 Harness 與 comparator 設計要點

- **Path A**：`new DataSource({ schema:'p1b2_sync', entities: ALL_ENTITIES, synchronize:false })` → `synchronize()`（TypeORM 自動把 DDL 前綴 `p1b2_sync`）。
- **Path B**：實際 `migration:run` 落於 `dbo`（data-source.ts mssql 分支未設 schema = 連線 default `dbo`），**與 prod 部署路徑完全一致**。
- **comparator 靈敏度自測（PARITY-008/009）**：純記憶體操作查詢結果複本；A-vs-A 必空、注入單一竄改必回報恰 1 筆可定位 diff（`{table,column,field,valueA,valueB}`）——確保「diff 為空」可信、非 no-op。
- **dbo 保留慣例**：beforeAll fail-fast 斷言 dbo 為空（BASELINE-006）；REG-005（最後一個 test）+ afterAll 清空 dbo（含 `typeorm_migrations`）+ p1b2_sync，斷言歸零。實測套件結束後 `DBO_TABLES=0 P1B2_SYNC_TABLES=0`。

## 4. 與設計/現實之偏離（Deviations）

### 4.1 表數 36（非 37）
沿用 P1b1：AD/測試設計述「37」為算術 off-by-one。全計數斷言動態對齊 `ALL_ENTITIES.length`（=36）/`ds.entityMetadatas.length`，不寫死。

### 4.2 🔴 CLI 呼叫改 node launcher（非 `npm run migration:run`）——需裁示之 prod 部署阻擋
- **現象**：本機 `npm run migration:run`（`ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js …`）**失敗**，兩個獨立原因疊加：
  1. **monorepo workspace 提升**：typeorm 0.3.28 被提升到 **repo root** `node_modules/typeorm/cli.js`，`apps/api/node_modules/typeorm` 不存在 → 腳本的相對路徑 `./node_modules/typeorm/cli.js` 找不到。
  2. **Node 24 + ts-node launcher bug**：以 ts-node 作為 entry launcher 時，`getProjectSearchDir` 對 script 參數 `require.resolve('./cli.js')` 拋 `Cannot find module './cli.js'`。
- **處置（未硬繞、合法等價）**：spec 之 BASELINE/STATIC-004 子行程改以 **node launcher + require hooks** 直呼 hoisted cli：
  `node -r tsconfig-paths/register -r ts-node/register/transpile-only <root>/node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts`。
  此為**功能等價**（仍是「CLI 工具 + data-source.ts + 真 migration 檔案」三者串接對真容器執行），已實證 `migration:run`/`migration:revert`/二次 no-op 全部 exit 0。
- **⚠️ 需裁示**：`npm run migration:run` / `npm run bootstrap` 之 alias 於「本機 Node 24 + 提升布局」下無法直接跑。此**不影響 P1b2 DoD**（migration 產物 + parity 已證），但**會影響 prod 一鍵部署**（`bootstrap` 依賴 `migration:run` alias）。建議由部署負責人（deploy branch 脈絡）裁定修法：更新 `typeorm` npm script 指向 hoisted cli（或改用 `typeorm-ts-node-commonjs` bin + `-r tsconfig-paths/register`），並釘選相容 Node 版本。**本輪未動 package.json scripts（屬 P1b3/deploy 範圍，避免跨界）。**

### 4.3 data-source.ts per-dialect migrations glob（架構決策，spec 界內）
BASELINE-003 要求 `typeorm_migrations` 恰 1 筆，故 mssql CLI 不得撿到 PG baseline（`1711360000000/…0001`，跑起來會因 `public`/`uuid`/`jsonb` 失敗且多記錄）。解法：mssql 分支專屬 glob `migrations/mssql/*`；postgres 維持 `migrations/*.{ts,js}`（單層 `*` 不遞迴、天然排除 `mssql/` 子目錄，PG 部署不受影響）。STATIC-003 據此斷言實際 glob（非測試設計原文之單一 `*.{ts,js}`）。

### 4.4 REG-001~004 為外部閘（沿用 P1b1 慣例）；pg 端未實跑
- REG-001（tsc）/002（p1b1）/003（p1a）/004（sqlite）以獨立指令實跑並記錄（見 §1），非 in-spec（跨 vitest 進程再起 vitest 不穩且與容器爭用）；REG-005（dbo 閉環）為 in-spec 最後一個 test。
- REG-004 之 **postgres 端未實跑**（本機 PG 5433 不可達，**不偽造綠燈**）；但本輪改動（新 mssql-only migration/comparator/spec + CLI-only 之 data-source glob 分岔）不改變任何 sqlite/pg **應用執行期**行為（postgres migrations glob 未變），代表性 sqlite/unit 29/29 綠佐證工具鏈未壞。

### 4.5 `simple-json → ntext`（記錄，非偏離）
`condition_payload`/`definition`/`payload`/`before_value`/`after_value`/`skipped_cases` 等 `jsonColumnType='simple-json'` 於 mssql 由 TypeORM 映射為 `ntext`；兩路徑一致，parity 為空。與 PG 版 `jsonb`/`text` 不同屬既定跨 driver 差異（AD-E07-38 D-2），非本輪引入。

## 5. Blocking Issues

- **P1b2 DoD 無阻擋**，三項全達成：
  1. ✅ Baseline migration 對全新 MSSQL 容器建 36 表成功，`NODE_ENV=production`（synchronize 關）下驗證。
  2. ✅ Parity 驗證腳本執行，synchronize vs baseline migration 兩路徑欄位/索引/表集合結構化 diff 為空（comparator 敏感度自測通過）。
  3. ✅ `fn_calc_tier_level` 未建立（`OBJECT_ID('dbo.fn_calc_tier_level')` = NULL）。
- **⚠️ 需裁示（不阻擋 P1b2，但阻擋 prod 一鍵部署）**：`npm run migration:run`/`bootstrap` alias 於本機提升布局 + Node 24 下無法直接執行（見 §4.2），須由 deploy 負責人修 npm script/釘 Node 版本。

## 6. 下一棒
- **P1b3**：bootstrap/seed 三支腳本改寫（`seed-datasource.ts`/`prod-data-seed.ts`/`seed.ts`，`$n`→named param、`LIMIT`→`TOP`）。**修 §4.2 npm alias 為 P1b3/deploy 前置**（bootstrap 依賴它）。
- **P1c**：`sp_getapplock` + Pattern B（`$n`→named param 引擎層）。
