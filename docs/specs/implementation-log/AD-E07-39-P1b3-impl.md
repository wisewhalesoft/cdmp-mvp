---
type: implementation-log
feature_id: AD-E07-39-P1b3
feature_name: MSSQL 全面遷移 P1b3 — Bootstrap/Seed 三支腳本改寫 + B2 npm alias 修復 + 參考資料 baseline 移植
status: complete
last_updated: 2026-07-07
depends_on: [AD-E07-39, AD-E07-39-P1b1, AD-E07-39-P1b2]
---

# AD-E07-39 P1b3 — Implementation Log

> 精簡管線最後一棒：三支 seed 腳本（`seed.ts` / `seed-datasource.ts` / `prod-data-seed.ts`）改寫為跨 driver 可攜、
> 修復 P1b2 §4.2 記錄之 B2 `npm run migration:run`/`bootstrap` alias 失效、移植 PG-only 參考資料 baseline 至 MSSQL。
> 實跑環境：`docker compose --profile mssql`（localhost:1433，CDMP_TEST，`Chinese_Taiwan_Stroke_BIN`，SQL Server 2022），`cdmp` login db_owner。

## 0. Seed Raw SQL 站點清單（DoD #4：A~H 八類轉換前後對照）

> 「轉換前」為 PG 原文；「轉換後」為可攜寫法（PG 續用不壞、MSSQL 亦可跑）。共用輔助置於新檔
> `apps/api/src/database/seeds/seed-connection.ts`：`seedConnectionOptions()`（DataSource 建構）、
> `bindSql()`/`pquery()`（`?`→`$1`/`@0`）、`top1()`（LIMIT↔TOP）。NULL-safe 自然鍵由 `prod-data-seed.ts`
> 之 `keyMatch()`（依值是否 NULL 產生 `col IS NULL` / `col = ?`）處理（G 類）。

### A. DataSource 建構（🔴 阻擋一切；原硬編碼 `type:'postgres'` 無視 DB_TYPE）
| 檔案 | 轉換前 | 轉換後 |
|---|---|---|
| `seed.ts:60`、`seed-datasource.ts:104`、`prod-data-seed.ts:720` | `new DataSource({ type:'postgres', host, port:5432, … })` | `new DataSource({ ...seedConnectionOptions(), … })`（依 DB_TYPE 切 postgres / mssql，mssql 補 `options.encrypt/trustServerCertificate`、預設埠 1433） |
| `seed.ts` synchronize | `synchronize: true` | `synchronize: !isMssql()`（mssql 走 migration:run 建表 → seed 不 synchronize；pg/sqlite 維持 dev 行為） |

### B. 具名/綁定參數化查詢（`$n` → 可攜 `?`）
| 站點 | 轉換前 | 轉換後 |
|---|---|---|
| `seed-datasource.ts` resolveCreatedBy / seedDatasources、`prod-data-seed.ts` resolveSeedUserId / findByKey / reconcile INSERT / repair UPDATE / seedColumns label / deriveMatchType / seedEtlPipelines / seedExtractionTasks | `WHERE … = $1`、動態 `$${params.length}` | 統一以 `?` 佔位、經 `pquery()`→`bindSql()` 依 driver 轉 `$1..`（pg）/ `@0..`（mssql） |

### C. `LIMIT 1` → `TOP(1)`（`top1()`）
| 站點 | 轉換前 | 轉換後 |
|---|---|---|
| 全部存在性檢查（users / datasources / etl_pipelines / extraction_tasks）與 `ORDER BY created_at ASC LIMIT 1` fallback | `SELECT id … LIMIT 1` | `SELECT ${top1().prefix}id … ${top1().suffix}`（pg→`… LIMIT 1`；mssql→`SELECT TOP(1) id …`，含 ORDER BY 時 TOP 置於欄位前、排序仍最後） |

### D. PG 專屬函式 `NOW()`（→ JS `new Date()` 綁定，三 driver 可攜）
| 站點 | 轉換前 | 轉換後 |
|---|---|---|
| seedDatasources INSERT、reconcile `extraInsert`（6 表 created_at/updated_at）、seedColumns label UPDATE、etl_pipelines/versions/extraction_tasks INSERT | `NOW(), NOW()`、`{ sql: 'NOW()' }`、`updated_at = NOW()` | 綁定 `new Date()`（`{ value: new Date() }` / `?` + Date 參數）；免 `GETDATE()` vs `NOW()` driver 差異 |

### E. PG 專屬 `RETURNING id`（→ JS 端顯式產生 uuid）
| 站點 | 轉換前 | 轉換後 |
|---|---|---|
| `prod-data-seed.ts` seedEtlPipelines etl_pipelines INSERT | `INSERT … VALUES(…) RETURNING id` 再取 `[0].id` | `const pipelineId = randomUUID()` 顯式帶入 `id` 欄（pg uuid / mssql uniqueidentifier 皆接受）；免 RETURNING / OUTPUT driver 分岔 |

### F. PG 專屬型別轉換 `::text`（→ 移除）
| 站點 | 轉換前 | 轉換後 |
|---|---|---|
| etl_pipeline_versions INSERT `definition` | `VALUES ($1,$2,$3::text,…)` | 移除 cast（`definition` 為 `simple-json`：pg text / mssql ntext，字串直接寫入） |

### G. PG 專屬 NULL-safe 運算子 `IS NOT DISTINCT FROM`（🔴 reconcile 核心，6 計分卡表；→ 標準可攜寫法）
| 站點 | 轉換前 | 轉換後 |
|---|---|---|
| `prod-data-seed.ts` findByKey（存在性）、repair UPDATE WHERE | `${col} IS NOT DISTINCT FROM $${n}` | `keyMatch(col,value,params)`：value=NULL→`col IS NULL`（不綁參）、非 NULL→`col = ?`（綁值）。語意同 IS NOT DISTINCT FROM 且 PG/MSSQL/sqlite 皆可攜。⚠️ **不可用 `(col = ? OR (col IS NULL AND ? IS NULL))`——PG 對僅出現於 `? IS NULL` 的參數無型別錨點會拋「could not determine data type」（REG-002 實跑抓出，見 §4）**。**實測對 ob_levelcard_score 212 筆 level1=NULL 冪等** |

### H. 裸布林字面 `true`（MSSQL T-SQL 不接受；→ 綁定 JS boolean）
| 站點 | 轉換前 | 轉換後 |
|---|---|---|
| extraction_tasks INSERT `enabled` | `VALUES (…, true, …)` | 綁定 JS `true`（`?` 參數；pg→boolean / mssql→bit 1）；19 筆實測 `enabled=1` |

### 額外（AD/測試設計未列，實跑抓出）
| 站點 | 問題 | 修法 |
|---|---|---|
| `UPDATE ob_levelcard_column AS c SET … WHERE c…`（deriveMatchType） | MSSQL 不支援 `UPDATE tbl AS alias SET`（SITE-012） | 改「表名完整限定」相關子查詢（`s.card_type = ob_levelcard_column.card_type …`），無 alias、pg/mssql 皆可攜 |
| `res[1] ?? 0`（seedColumns label / deriveMatchType 之 UPDATE 回傳計數） | 🔴 **實跑 crash**：mssql `qr.query()` 對 UPDATE 回傳 `undefined`（非 pg `[rows, affected]` tuple）→ `res[1]` 對 undefined 取索引拋 `Cannot read properties of undefined` | 改 `res?.[1] ?? 0`（optional chaining；PROBE-001 之 log-only 影響，不影響 UPDATE 正確性） |

## 1. B2 npm alias 修法

- **根因（P1b2 §4.2）**：`"typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js"` 兩因疊加失效：
  (1) monorepo workspace 提升 → `./node_modules/typeorm/cli.js` 不存在（實際在 repo root）；
  (2) Node 24 + ts-node 作 entry launcher → `getProjectSearchDir` 對 `require.resolve('./cli.js')` 拋錯。
- **修法**：新增 committed 啟動器 `apps/api/scripts/typeorm.cjs`：以 **node 為 launcher**（避開 (2)），`tsconfig-paths/register` + `ts-node/register/transpile-only` 僅作 require hook，並以 `require.resolve('typeorm/cli.js')` 解析 CLI（避開 (1)，提升/未提升皆可）。`package.json` 之 `"typeorm": "node scripts/typeorm.cjs"`；`migration:run`/`migration:revert`/`bootstrap` alias 全數不變（僅底層 typeorm 指向新啟動器）。
- **不破壞 PG 部署**：PG `npm run migration:run` 同樣經新啟動器 → data-source.ts postgres 分支 + `migrations/*.{ts,js}` glob，行為等價（僅 ts-node 由 launcher 降為 require hook + transpile-only）。
- **實證**：字面 `npm run migration:run` / `migration:revert`（×2）/ `seed` / `seed-datasource` / `data-seed` / `bootstrap` 於 mssql CDMP_TEST 全數 exit 0（見 §3）。

## 2. 參考資料 baseline 移植（COUNT-011/012 由「決策關卡」升為必過）

- **單一事實來源**：新檔 `apps/api/src/database/seeds/baseline-reference-data.ts`——以 script 忠實解析 PG `1711360000001-BaselineReferenceData.ts` 內嵌 SQL 產生（**非手抄**），typed 陣列 `BASELINE_ROLES`(2) / `BASELINE_WHITELIST`(17) / `BASELINE_OPTIONS`(186)。含 ASCII 逗號值（`20,001~30,000`）、括號值（`貴金屬商、寶石商(如買賣未切割之原石)`）皆正確解析。
- **新 MSSQL migration**：`apps/api/src/database/migrations/mssql/1751884800001-MssqlBaselineReferenceData.ts`（timestamp 1751884800001 > schema baseline 1751884800000 → migration:run 於建表後灌資料）。Pattern B 轉換：`public.` 前綴移除、`ON CONFLICT DO NOTHING`→逐筆 `IF NOT EXISTS`（roles）、whitelist/option 僅空表插入、裸 `true`/`false`→綁定 boolean（→bit）、`::int` cast 移除、時間戳→`new Date()`（→datetime2）。中文值由 tedious NVarChar→varchar 隱式轉換、逐字元 round-trip（P1b1 CHI 已證）。
- **影響 mssql baseline 由 1 支變 2 支**：連帶更新 P1b2 spec 兩處已過時斷言（見 §4 偏離）。

## 3. 實跑驗證（真 MSSQL CDMP_TEST，非模擬）

### 3.1 Bootstrap 全流程筆數（一次性 `npm run bootstrap`，乾淨 dbo，exit 0）
| 表 | 筆數 | 表 | 筆數 |
|---|---|---|---|
| users | 4 | ob_tier | 27 |
| datasources | 9 | etl_pipelines | 6 |
| ob_card_type | 6 | etl_pipeline_versions | 6 |
| ob_levelcard_version | 7 | extraction_tasks | 19 |
| ob_levelcard_column | 53 | **roles** | **2** |
| ob_levelcard_score | 449 | **pooldata_field_whitelist** | **17** |
| ob_levelcard_level | 26 | **pooldata_field_option** | **186** |
| | | typeorm_migrations | 2（schema + reference-data baseline） |

全數與 PG 版本一致。附帶驗證：match_type 分佈 CATEGORY 9 / COMPOSITE 6 / RANGE 38（非全 RANGE→deriveMatchType 表名限定 UPDATE 正確）；datasources `status='unknown'`、`last_tested_at=NULL`、`decrypt(encrypted_password)=''`；extraction_tasks `enabled=1`×19；中文 option 逐字元 round-trip（`KTV/酒吧/夜總會/卡拉OK/三溫暖/俱樂部` 等）。

### 3.2 冪等（連跑第二次 seed/seed-datasource/data-seed，exit 0）
- seed：4 筆「already correct」。
- seed-datasource：`0 新增 / 9 已存在`。
- data-seed：六表全 `INSERT 0 缺列`（含 **ob_levelcard_score 449，212 筆 level1=NULL 全判定已存在、無重複膨脹** → 可攜 NULL-safe reconcile 正確）；extraction_tasks `0 新增 / 19`；etl_pipelines `0 新增 / 6`；無 `[漂移]` WARN。
- 二次後全表筆數與首次完全相同。

### 3.3 revert 對稱性
- `npm run migration:revert` ×2：#1 逆轉 reference-data（down no-op）、#2 逆轉 schema（DROP 全 36 表）皆 exit 0；dbo 業務表歸 0、typeorm_migrations 紀錄歸 0。

## 4. Test Results Summary（AD-E07-39-P1b3-test.md 54 案例）

| 群組 | 案例 | 落地 | 結果 |
|---|---|---|---|
| DIALECT | 001~004（4） | `mssql-p1b3.mssql.spec.ts` | ✅ PASS（實跑 MSSQL） |
| ALIAS | 001/003/004/005/006/002（6） | 同上 | ✅ PASS |
| SITE | 001~012（12，SITE-007 於 SITE-DRIFT 群組） | 同上 | ✅ PASS |
| BOOT | 001~005（5） | 同上 | ✅ PASS |
| COUNT | 001~012（12，含 011/012 🔴 必過） | 同上 | ✅ PASS |
| IDEM | 001~005（5，IDEM-004 於 SITE-DRIFT 群組） | 同上 | ✅ PASS |
| PROBE | 001~002（2） | 同上 | ✅ PASS |
| STATIC | 001~003（3） | 同上 | ✅ PASS |
| REG | 005（in-spec，package.json bootstrap 順序不變） | 同上 | ✅ PASS |
| REG | 001（tsc build 乾淨） | `tsc --noEmit -p tsconfig.build.json` | ✅ exit 0（外部閘） |
| REG | 003（sqlite/unit 不回歸） | auth.service / password-reset / crypto 套件 | ✅ 35/35（外部閘） |
| REG | 004（p1a/p1b1/p1b2 不回歸） | `*.mssql.spec.ts` 序列 | ✅ 99/99；4 檔合跑（含 p1b3）149/149（外部閘） |
| REG | 002（PG reconcile 不回歸，🔴 可攜性關鍵閘） | `prod-data-seed-reconcile.pg.spec.ts` | ✅ 13/13（外部閘，見 §5） |

> in-spec 落地 50 案例 + 外部閘 4 案例（REG-001~004，比照 P1b2 慣例：跨 vitest 進程再起 vitest 不穩，改獨立指令實跑並記錄，非偽造綠燈）。
> 全 4 支 `*.mssql.spec.ts` 序列合跑（`--no-file-parallelism`）149/149，證 p1b2（本輪修改）↔p1b3 共用 dbo 無衝突。

### REG-002 詳記（🔴 PG 可攜性回歸，實跑抓出並修正一個真實 PG regression）
- test 容器 PG 5433 不可達 → 改對 **dev PG 5432 之 `cdmp_dev`** 執行；該 spec 自建/自刪唯一隔離 schema（`cdmp_b2_seed_<pid_hrtime_rand>`），不觸及 dev `public` 資料，安全。
- **首次跑出 13/13 FAIL — `QueryFailedError: could not determine data type of parameter $2`**：源自最初 NULL-safe 可攜寫法 `(col = ? OR (col IS NULL AND ? IS NULL))`——PG 對「僅出現於 `? IS NULL` 的參數」無型別錨點（MSSQL 容忍、PG 不容忍）。
- **修正**：改採 `keyMatch(col, value, params)`——值為 NULL→產生 `col IS NULL`（不綁參）、非 NULL→`col = ?`（綁值），語意同 IS NOT DISTINCT FROM 且 PG/MSSQL/sqlite 皆可攜、無untyped-param。修正後 PG 13/13 綠、MSSQL P1b3 50/50 仍綠（SITE-005 212 筆 level1=NULL 冪等維持）。

## 5. Files Changed

| File Path | Change | Description |
|---|---|---|
| `apps/api/src/database/seeds/seed-connection.ts` | new | 共用連線工廠 `seedConnectionOptions()` + 可攜 SQL 輔助 `bindSql`/`pquery`/`top1`。 |
| `apps/api/src/database/seeds/seed.ts` | modified | DataSource 依 DB_TYPE；mssql 不 synchronize。 |
| `apps/api/src/database/seeds/seed-datasource.ts` | modified | DataSource 工廠；`$n`→`?`、LIMIT→TOP、NOW()→Date；export resolveCreatedBy/seedDatasources。 |
| `apps/api/src/database/seeds/prod-data-seed.ts` | modified | DataSource 工廠；八類轉換 + deriveMatchType 表名限定 UPDATE + `res?.[1]` 防禦；export resolveSeedUserId/seedEtlPipelines。 |
| `apps/api/src/database/seeds/baseline-reference-data.ts` | new | 參考資料單一事實來源（解析 PG migration 產生，2/17/186）。 |
| `apps/api/src/database/migrations/mssql/1751884800001-MssqlBaselineReferenceData.ts` | new | MSSQL reference-data baseline migration（參數化 INSERT + 冪等守門）。 |
| `apps/api/scripts/typeorm.cjs` | new | B2：robust typeorm CLI 啟動器（hoisting + Node 24）。 |
| `apps/api/package.json` | modified | `"typeorm": "node scripts/typeorm.cjs"`（alias 修復；bootstrap 順序不變）。 |
| `apps/api/src/database/__tests__/mssql-p1b3.mssql.spec.ts` | new | 50 in-spec 案例（真 MSSQL 實跑 + 靜態）。 |
| `apps/api/src/database/__tests__/mssql-p1b2.mssql.spec.ts` | modified | BASELINE-003（1→2 migration）、STATIC-004（revert ×2）反映 P1b3 新增 reference-data baseline。 |

## 6. 偏離（Deviations）

1. **mssql baseline 由 1 支變 2 支**：P1b3 移植 reference-data 為獨立 migration（對稱 PG 之 schema+reference-data 雙 migration 結構），故更新 P1b2 spec 兩處硬編碼斷言（BASELINE-003 `typeorm_migrations` 1→2；STATIC-004 revert 1→2 次）。此為 P1b3 合理行為變更之必要維護，非破壞 P1b2 語意。
2. **測試設計 ALIAS-001「typeorm_migrations 恰 1 筆」與 COUNT-011/012「決策關卡（預期 0）」被任務裁示升級**：任務明訂「migration:run[兩 baseline]」+ 移植參考資料使 COUNT-011/012 必過 → ALIAS-001 改斷言 2 筆、COUNT-011/012 改必過（roles 2 / whitelist 17 / option 186）。已於 spec 與本 log 顯性記錄。
3. **PROBE-001（mssql UPDATE 回傳形狀）於實跑升級為阻擋**：原設計視為 log-only，但 `res[1]`（非 `res?.[1]`）對 undefined 取索引實際 crash → 已修為 optional chaining（生產碼），非僅記錄。
4. **REG-001~004 為外部閘**（沿用 P1b1/P1b2 慣例，非 in-spec）：tsc / sqlite / p1a-b1-b2 / pg reconcile 以獨立指令實跑記錄。
5. **NULL-safe 可攜寫法二度修正（PG 型別推斷）**：最初採 `(col = ? OR (col IS NULL AND ? IS NULL))`，MSSQL 綠但 PG REG-002 拋「could not determine data type of parameter」→ 改 `keyMatch` 依值 NULL 與否條件產生 `col IS NULL` / `col = ?`。教訓：「跨 driver 可攜」須雙向實跑驗證，MSSQL 容忍 untyped param 不代表 PG 容忍。

## 7. Blocking Issues

- 無阻擋。P1b3 DoD 四項全達成：(1) `npm run bootstrap` 全流程對 MSSQL 跑通；(2) 參考/種子表筆數與 PG 版本一致；(3) 冪等（連跑兩次無重複列，含 212 NULL-level1 scores）；(4) seed raw SQL 站點清單（本 log §0，A~H 全類別 + 額外兩項）。
