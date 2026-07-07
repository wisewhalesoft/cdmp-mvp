---
type: implementation-log
feature_id: AD-E07-39-P1b1
feature_name: MSSQL 全面遷移 P1b1 — 全 Entity 型別修正＋B1 hash＋D1 全 Entity 載入＋Synchronize 全表建成
status: complete
last_updated: 2026-07-07
depends_on: [AD-E07-39, AD-E07-38-P1a]
---

# AD-E07-39 P1b1 — Implementation Log

## 0. F-4 中文編碼實驗結論（🔴 最高優先，決策閘門）

**結論：varchar 已驗證相符（I-MSSQL-VARCHAR-ENCODING-01 = 「已驗證相符」）。**

對真實 MSSQL 2022 容器（`Chinese_Taiwan_Stroke_BIN` collation，Big5 碼頁 950）裸 `varchar(20)` 欄位實測：

| 驗證 | 寫入 | 讀回 | 結果 |
|---|---|---|---|
| CHI-001 | `借新還舊` | `借新還舊`（逐字元 charCode 相等，無 `?`/`�`） | ✅ 相符 |
| CHI-002 | `中古車商` | `中古車商`（逐字元相等） | ✅ 相符 |
| CHI-003 | `LIKE '%借新還舊%'` | 命中 1 筆 | ✅ 相符 |
| CHI-004 | `借新還舊` vs `借新還舊 `(尾空白) | DATALENGTH 8 vs 9 bytes（未 trim/正規化） | ✅ byte-exact |

**tedious driver 對 varchar 中文的編碼轉換路徑正確**（string param 以 NVarChar 送出 → 隱式轉 Big5 儲存 → 讀回以碼頁 950 還原）。

**行動：不觸發全面 `varchar→nvarchar` codemod（AD §4.4 步驟 3 之預設方案不啟動）。** P1b1 範圍維持 §1 之 47 處 uuid/text/boolean/timestamp helper 替換 + B1 + D1。此結論同時作為未來 raw SQL 引擎 `LIKE '%關鍵字%'` 中文比對邏輯之編碼先行驗證（一魚兩吃）。

執行順序遵循指令：F-4 於任何其他改動前，以獨立拋棄式 probe 先行實跑取得結論後才續作。

---

## 1. Test Results Summary（43 設計案例全數覆蓋）

實跑環境：`docker compose --profile mssql`（localhost:1433，CDMP_TEST，`Chinese_Taiwan_Stroke_BIN`，SQL Server 2022 RTM-CU25）。

| 群組 | 案例 | 落地位置 | 結果 |
|---|---|---|---|
| CHI | CHI-001~004、CHI-DECISION-001（5） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| TYPE | TYPE-001~008（8，含 🔴 F-1 TYPE-005/006/007） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| HASH | HASH-001~005（5）、HASH-REG-001a（mssql 分支速驗） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| HASH | HASH-006（既有測試遷移） | `auth.service.spec.ts`(22)＋`auth.guard.spec.ts`(7) | ✅ PASS |
| HASH-E2E | HASH-E2E-001~004（4，🔴 DoD #5 撤銷流程） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| HASH | HASH-REG-001（三分支 mssql/sqlite/postgres 重載，置檔尾） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| HASH | HASH-REG-002（sqlite e2e 登入/登出/撤銷不回歸） | `test/auth.e2e-spec.ts`(25) | ✅ PASS（sqlite）；postgres 見偏離 §5 |
| ENTITY | ENTITY-001~006（6，含完整 AppModule/Worker 啟動） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| DEFAULT | DEFAULT-001/002（2，CURRENT_TIMESTAMP 8 欄） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| CASE/COLLATE | CASE-001/002、COLLATE-001/002（4） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| PKWIDTH | PKWIDTH-001/002（2，動態索引鍵寬度守門） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |
| REG | REG-001（tsc build 乾淨） | `npx tsc --noEmit -p tsconfig.build.json` | ✅ exit 0 |
| REG | REG-002（既有 sqlite/pg 套件不回歸） | 見偏離 §5 | ✅ sqlite；pg 不可達 |
| REG | REG-003（P1a CRUD-003a/b 淘汰） | `mssql-p1a.mssql.spec.ts`(25) | ✅ PASS |
| REG | REG-004（全 entity 無 process.env.DB_TYPE） | `mssql-p1b1.mssql.spec.ts` | ✅ PASS |

**核心紅線全數綠燈**：
- `mssql-p1b1.mssql.spec.ts`：**39/39 passed**（實跑真 MSSQL，未偽造綠燈）。
- `mssql-p1a.mssql.spec.ts`：25/25（REG-003 移除 CRUD-003a/b 後仍全綠）。
- `auth.service.spec.ts` 22 + `auth.guard.spec.ts` 7 + `test/auth.e2e-spec.ts` 25（B1 跨 driver 回歸）。
- `tsc --noEmit -p tsconfig.build.json`：0 錯誤。

---

## 2. Files Changed

### 型別 helper（column-types.ts）
| 檔案 | 變更 | 說明 |
|---|---|---|
| `apps/api/src/common/database/column-types.ts` | modified | 新增第 5 個 helper `hashColumnType`（mssql=`binary`/sqlite=`blob`/pg=`bytea`）+ `hashColumnLength`（mssql=32/其餘 undefined）。 |
| `apps/api/src/common/hash/token-hash.util.ts` | new | 純函式 `hashToken(token): Buffer`（sha256，32 bytes，決定性 I-MSSQL-HASH-DETERMINISM-01）。 |

### B1（token_blocklist → token_hash）
| 檔案 | 變更 | 說明 |
|---|---|---|
| `apps/api/src/database/entities/token-blocklist.entity.ts` | modified | PK `token`(nvarchar 2048) → `token_hash`(`binary(32)`/blob/bytea，Buffer)；欄位刻意改名 fail-loud。 |
| `apps/api/src/modules/auth/auth.service.ts` | modified | `logout`/`isTokenRevoked` 寫入/查詢改先 `hashToken(token)`（service 層單一入口點）。 |
| `apps/api/src/common/guards/auth.guard.ts` | modified | blocklist 查詢改 `where: { token_hash: hashToken(token) }`。 |
| `apps/api/src/modules/auth/__tests__/auth.service.spec.ts` | modified | HASH-006：mock/斷言由 `token` 明文改 `token_hash: hashToken(...)`。 |
| `apps/api/src/common/__tests__/auth.guard.spec.ts` | modified | HASH-006：blocklist mock 改 `token_hash`；斷言 guard 以 `token_hash` 查詢。 |
| `apps/api/src/database/__tests__/mssql-p1a.mssql.spec.ts` | modified | REG-003：移除 CRUD-003a/003b（引用已不存在的 `token` 欄）；HASH-005 取代其驗證意圖。 |

### §1 全 47 處型別 helper 替換（21 entity 檔）
uuid 18 + text 17 + boolean 8 + F-1 timestamp 4 = 47 處，全部 modified：
`assignment-run-snapshot`、`assignment-approval`、`assignment-audit-log`、`assignment-run`、`assignment-run-stage-log`(🔴F-1 started_at/finished_at)、`datasource-health-log`、`datasource`、`etl-pipeline-log`、`etl-pipeline-version`、`extraction-log`、`etl-pipeline`、`extraction-task`、`ob-assign-config`(🔴F-1 updated_at)、`ob-list-definition`、`pooldata-field-whitelist`、`pooldata-field-option`、`ob-levelcard-version`、`ob-pool-data`、`ob-pool-data-list`、`ob-monthly-run-result`(uuid PK)、`ob-arreturndf-min-cap`(🔴F-1 _cdmp_extracted_at)。

### D1（全 entity 載入統一）
| 檔案 | 變更 | 說明 |
|---|---|---|
| `apps/api/src/app.module.ts` | modified | 新增 `ALL_ENTITIES`；sqlite/mssql/postgres 三分支共用同一變數（mssql 分支由 4-entity 擴為全 36）。順帶修 mssql port 字串 bug（見偏離 §5.2）。 |
| `apps/api/src/worker-app.module.ts` | modified | mssql 分支改用既有 glob `entities`（與 sqlite/pg 一致），移除硬寫 4-entity 陣列 + 4 個未用 import。順帶修 mssql port bug。 |

### 測試
| 檔案 | 變更 | 說明 |
|---|---|---|
| `apps/api/src/database/__tests__/mssql-p1b1.mssql.spec.ts` | new | 39 test（CHI/TYPE/HASH/HASH-E2E/ENTITY/DEFAULT/CASE-COLLATE/PKWIDTH/REG），沿用 P1a gating harness，專屬 schema `p1b1`。 |

---

## 3. B1 跨 driver 影響（三 driver 一致改 hash）

- **語意不變**：blocklist 純為成員存在性檢查（`WHERE token_hash = ?`），三個 driver 對外可觀察行為完全一致（登入→登出→撤銷後拒絕），僅底層儲存由明文欄改 32-byte hash 欄。
- **sqlite 實證**：`test/auth.e2e-spec.ts` 25 綠（sqlite `blob` PK + Buffer 查詢正常）。
- **mssql 實證**：HASH-E2E-001~004 綠（含長 JWT >900 bytes 撤銷、跨 token 不誤傷、service 層冪等）。
- **附帶效益**：消除明文 JWT 落庫疑慮（AD §3.2 理由 3）。
- **既有單元測試遷移**：`auth.service.spec.ts` / `auth.guard.spec.ts` 由 `token` 明文改 `token_hash`，全綠（HASH-006）。

---

## 4. Architectural Decisions（spec 界內選擇）

1. **主 DataSource 用顯式 36-entity 陣列（非 glob）**：vitest+swc 下 TypeORM glob loader 之 `require('*.entity.ts')` 會 `Invalid or unexpected token`（見偏離 §5.3）。測試檔以顯式 `ALL_ENTITIES` 承載全 36 entity，兼作 parity 期望集合，避免 glob 風險。
2. **ENTITY-002/003 以 `.compile()`（不 `app.init()`）+ NODE_ENV=production（synchronize off）**：`compile()` 已解析 DataSource 連線 + 實例化全 provider（可攔 EntityMetadataNotFound），但不觸發 `onApplicationBootstrap`（orphan recovery）/cron 之 DB 副作用；synchronize off → 不建 dbo 表、不污染 CDMP_TEST。
3. **HASH-REG-001（三分支 resetModules）置於檔尾**：`vi.resetModules()` 會使 entity/service class ref 前後不一致；置於所有 module-boot 測試之後，避免污染。
4. **CASE 守門正規表示式改 `^[a-z0-9_]+$`**：I-MSSQL-CASE-01 核心為「無大寫」；legacy OB 欄含數字（`order1`/`addr1`），原 `^[a-z_]+$` 過嚴（P1a 僅 4 auth 表無數字欄故未觸發）。

---

## 5. 與設計/現實之偏離（Deviations）

### 5.1 表數 37 → 36（AD/測試設計算術 off-by-one）
AD §1 / 測試設計述「37 entity」，實際 entity 檔 = **36**（`@Entity` 去重亦 36）。來源：AD「14 未改 + 23 已改 = 37」中「23」實為 22（§1 表格 22 列，含 token_blocklist），14+22=36。所有計數斷言改動態對齊 `ds.entityMetadatas.length`（=36），不寫死 37。**非漏 entity**，純算術。

### 5.2 mssql `DB_PORT` 字串 bug（順帶修正，DoD #1 必要）
ENTITY-002 實跑抓到：`app.module.ts` / `worker-app.module.ts` mssql 分支 `configService.get<number>('DB_PORT', 1433)` 回傳**字串**（env 值），tedious 拋 `config.options.port must be of type number` → **完整 AppModule 無法於 mssql 啟動**。`.env` 現況 `DB_TYPE=mssql, DB_PORT=1433`（dev 遷移中）→ 此為真實 prod-boot 阻擋 bug。修正：mssql 分支 `port: Number(configService.get('DB_PORT', 1433))`。屬 D1/DoD #1 範圍（「啟動完整 AppModule 成功」之必要條件）。

### 5.3 WorkerAppModule glob 於 vitest 無法載入 .ts（ENTITY-003 調整）
WorkerAppModule 以 glob `*.entity.{ts,js}` 載入 entity；TypeORM 內部 `require` 於 vitest 下無法解析 .ts（`Invalid or unexpected token`）——**vitest 環境限制，非 production 問題**（worker 走 ts-node / 編譯後 .js，glob 正常）。ENTITY-003 改以顯式 `ALL_ENTITIES` 掛載真實 worker 業務模組 `AssignmentWorkerModule`（含 RunQueueConsumer/OrphanReaper + AssignmentModule），驗證 worker 模組圖於 mssql 可解析 + pg-boss 於 mssql `createPgBoss` 回 null 安全降級。glob 分支設定本身由 ENTITY-004 靜態守門。

### 5.4 HASH-E2E-004 於 service 層驗冪等（非 HTTP 兩次 200）
測試設計 HASH-E2E-004 述「HTTP logout 兩次皆 200」，但 `/auth/logout` 帶 `AuthGuard`，第二次因撤銷檢查回 **401**（= HASH-E2E-001 語意）。故冪等性（`AuthService.logout` findOne 存在→skip save）於 **service 層對真實 MSSQL** 驗證：連呼兩次不拋錯 + `token_blocklist` 該 `token_hash` 僅 1 筆。

### 5.5 postgres 端回歸未跑（容器不可達）
REG-002 / HASH-REG-002 之 postgres 端：本機 PG（5433）不可達，未實跑，**不偽造綠燈**。B1 跨 driver 之 pg 分支（`bytea`）由 `hashColumnType` 三分支單元（HASH-REG-001）+ sqlite e2e 佐證；pg e2e 待 PG 容器可達時補跑。

### 5.6 本機 MSSQL 容器 `sp_executesql` 觸發 17750（測試基礎設施避讓）
本機 SQL Server 2022 Linux 容器對 `EXEC sp_executesql @var` 拋 `17750 Could not load the DLL (server internal), Reason 126`（`EXEC('...')`、一般 DDL/DML、`NEWSEQUENTIALID`、`NEWID` 皆正常，僅 sp_executesql 受影響）。測試之表清理改「以 JS 列舉 sys 目錄 + 逐句 plain DDL」，不用 sp_executesql。**非 P1b1 production 程式問題**（TypeORM synchronize 走 plain DDL，不用 sp_executesql；已實證 36 表 synchronize 全綠）；記錄供 P1b2 baseline migration 撰寫時留意（避免於 migration 使用 sp_executesql）。

---

## 6. 既有 baseline 失敗（與本次無關，已 git stash 對照驗證）

- `test/assignment-scoring.e2e-spec.ts`：pristine tree 亦 **23 failed**（`ob_levelcard_column.match_type` NOT NULL / `PooldataFieldOption` no metadata，屬該 e2e 自建 DataSource/seed 之既有問題，非本次 47 處型別/B1/D1 引入）。已以 `git stash` 還原 pristine 實跑同數失敗確認。
- `datasource.e2e` / `extraction-task.e2e`：綠（本次改動之 datasource/etl entity 於 sqlite synchronize 無回歸）。

---

## 7. Blocking Issues

無阻擋。P1b1 DoD 全數達成：
1. ✅ DB_TYPE=mssql 啟動完整 AppModule（ENTITY-002）+ worker 模組（ENTITY-003）。
2. ✅ synchronize 建出全 36 entity 對應表，零錯誤（ENTITY-006）。
3. ✅ sys.columns 型別符合 §1（uuid→uniqueidentifier、text→nvarchar(max)、boolean→bit、F-1 timestamp→datetime2 非 rowversion、token_hash→binary(32)）。
4. ✅ 中文編碼 smoke 明確記錄（§0：已驗證相符，不需 varchar→nvarchar）。
5. ✅ token_blocklist 新結構通過真實 JWT 撤銷 E2E（HASH-E2E-001~004）。
6. ✅ I-MSSQL-CASE-01 + collation 一致性守門通過（CASE/COLLATE）。

**下一棒**：P1b2（prod baseline migration + dev/prod parity 驗證，注意 §5.6 sp_executesql）、P1b3（bootstrap/seed 腳本改寫）。

**待補**：postgres 端 e2e 回歸（§5.5，待 PG 容器可達）。
