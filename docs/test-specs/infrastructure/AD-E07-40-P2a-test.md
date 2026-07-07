---
type: test-design-infrastructure
test-spec-id: AD-E07-40-P2a
feature_name: MSSQL 全面遷移 P2a — queue_job Schema + MssqlQueueService 五操作 + 併發正確性 Harness
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-40-mssql-p2-self-built-queue.md（§0 前提差異、§1 queue_job schema、§2 五個原子操作 T-SQL、§6 併發驗證 harness、§7 P2a DoD、§8 不變式）
  - /docs/specs/implementation-log/AD-E07-38-mssql-p1-driver-entity-schema.md（column-types.ts helper 原始定義、mssql-env-preload.ts gating 慣例）
  - /docs/specs/implementation-log/AD-E07-39-mssql-p1b-full-baseline.md（schema-parity.ts comparator、dbo 保留慣例、baseline migration 兩軌 harness 模式之直接前例）
covers: []
spec_version: "1.0"
date: 2026-07-07
last_updated: 2026-07-07
---

# AD-E07-40 P2a：MSSQL 全面遷移 — queue_job Schema + MssqlQueueService 五操作 + 併發正確性 Harness — 測試設計

> 本文件覆蓋 AD-E07-40「MSSQL 全面遷移 P2（自建 T-SQL 佇列，取代 pg-boss）」之 **P2a 切片**（§1 queue_job schema + §2 五個原子操作封裝為 `MssqlQueueService` + §6 併發正確性 harness，**獨立驗證層，不碰 Producer/Consumer**）。
> P2 不經 spec-writer（AD-E07-40 §「是否需要 spec-writer」已裁定：純底層儲存/驅動置換，無新業務行為，比照 AD-E07-38 §3 D-7 先例）；本文件依 system-architect 產出之 AD-E07-40 §0/§1/§2/§6/§7/§8 直接產出測試設計，交 tdd-implementation。
>
> **範圍**：§1（entity + 手寫 filtered index baseline migration）／§2（五個 T-SQL 操作）／§6（併發 harness，本切片最有料的部分）。
> **明確排除**（分別由 P2b/P2c 各自一棒設計）：`RunQueueProducer`/`RunQueueConsumer` 接線、輪詢 loop、`processPayload` 業務邏輯去重（P2b）；expire sweep 定時掛載整合、`OrphanReaper` 雙層回收一致性、F098 全套件於 mssql 分支下整體重跑（P2c）。
>
> **關鍵前提（AD §0，直接決定本文件不需要任何「等 Windows」緩衝）**：佇列 claim 用純 T-SQL DML（`WITH (READPAST,ROWLOCK,UPDLOCK)` + CTE + `OUTPUT`），P0 smoke 已證於本機 Linux 容器可行，不經過如 `sp_getapplock` 那樣的系統預存程序、不受 P1c 已踩之 17750 DLL 缺失影響。本文件全部案例（含 CONC 群組）皆可對真實 MSSQL 容器完整執行。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-40-mssql-p2-self-built-queue.md`（§1/§2/§6）+ `apps/api/src/database/__tests__/mssql-env-preload.ts`（gating helper，沿用）+ `apps/api/src/database/__tests__/schema-parity.ts`（欄位層 comparator 沿用；**索引層 comparator 不可直接沿用**，見 §一 SCHEMA-010）+ `apps/api/src/common/database/column-types.ts`（`dateColumnType`/`longTextColumnType`/`longTextColumnLength` 既有 helper，queue_job 直接引用不需新增）+ `apps/api/src/modules/assignment/queue/run-queue.constants.ts`（`RUN_QUEUE_NAME` 沿用作為 CLAIM/FIFO 測試之 queueName 參數）+ `apps/api/src/database/__tests__/mssql-p1b2.mssql.spec.ts`（兩軌 harness 撰寫範例、`dropAllTablesInSchema` cleanup 模式） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P2a 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」章節（併發測試對 CI runner 資源之隱含要求：`pool.max` 提高會同時提高瞬時連線數） |

---

## 零、測試環境與 Harness 設計（★ 本文件核心交付）

### 0.1 沿用既有 gating helper，不新增基礎設施

沿用 `mssql-env-preload.ts`（`mssqlPortReachable()`/`restoreDbType()`/`SKIP_REASON`/`MSSQL` 連線常數）與 `CDMP_TEST` 資料庫，連不上 MSSQL 容器 → 整檔 `describe.skip`，不假造綠燈。既有 `R-MSSQL-P1A-01`（test-only port/DB 未與 dev 分離）風險原樣延續，本文件不重複記錄。

### 0.2 Schema 隔離策略（三個新 schema，皆非 `dbo`）

| Schema | 用途 | 建置方式 |
|---|---|---|
| `p2a_sync` | SCHEMA 群組 Path A（synchronize）+ **UNIT 以外全部操作性群組**（SEND/CANCEL/CLAIM/COMPLETE/SWEEP/CONC）共用之 queue_job 表 | `new DataSource({...mssqlOptions('p2a_sync'), entities:[QueueJob], synchronize:true})` |
| `p2a_baseline` | SCHEMA 群組 Path B（baseline migration 結構驗證，**不使用 `dbo`**，見 0.3 之刻意偏離說明） | 程式化呼叫新 queue_job baseline migration 之 `up(queryRunner)`（比照 P1b2 §0.4 方式 2：直接 import migration class，非謄寫 SQL 字串） |

**與 P1b2/P1b3 之差異（刻意偏離，非疏漏）**：P1b2/P1b3 之 Path B 因需驗證「與 prod 真實部署路徑完全一致」而刻意落在 `dbo`（raw SQL 不受 TypeORM schema 選項前綴）。P2a 的 Path B 目的僅是**驗證單一新表（queue_job）的結構本身正確**，不需要重現「新 migration 疊加在既有 36 表 baseline 之上」的完整部署序列——若沿用 `dbo`，會與 P1b2/P1b3 既有的「`dbo` 全套 36 表 baseline 建置/清空」流程產生範圍重疊（需先重建整條 migration 鏈才能疊加 queue_job migration，且與既有套件的 `dbo` 獨佔慣例衝突）。改用獨立 `p2a_baseline` schema **仍完整驗證** raw SQL migration 檔本身的正確性（欄位/filtered index），只是不驗證「這支新 migration 檔實際疊加進 `dbo` 既有鏈的整合順序」——此範圍缺口已記入 `risks-and-gaps.md`（低風險、非阻擋，因新 migration 檔為 glob 自動載入、無需手動註冊陣列，疊加順序風險低於 P1b1 的 `ALL_ENTITIES` 手動陣列類問題）。

### 0.3 CONC 群組專用 DataSource（★ 最關鍵設計決策，MUST-FIX）

**已查證（非假設）**：`node_modules/typeorm/driver/sqlserver/SqlServerConnectionOptions.d.ts` 明確定義 mssql `DataSourceOptions` 頂層 `pool?: { max?: number (default=1); min?: number; ... }`。**TypeORM mssql driver 的連線池預設上限 `max=1`**——這比 AD §6.2 的「陷阱」措辭更嚴重：若 CONC 群組沿用未特別設定 `pool` 的預設 `DataSource`，K 個並發 `Promise.all(...)` 呼叫**保證**被序列化（連線池只有 1 條可用連線，其餘全部排隊等待歸還），測試不是「可能」退化為假陽性，而是**預設值本身就會導致退化**。

**設計要求（I-MSSQL-QUEUE-TEST-CONCURRENCY-01 之具體落地）**：
1. CONC 群組使用**獨立於**其餘操作性群組（SEND/CANCEL/CLAIM/COMPLETE/SWEEP）的專屬 `DataSource` 實例（連向同一 `p2a_sync` schema 亦可，但物件本身獨立建構），於該 `DataSource` 建構時**明確傳入 `pool: { max: 20 }`**（本文件 K 之最大值為 10，設 20 留一倍緩衝；未來若調高 K 上限須同步調高，不可低於 K）。
2. 建構處程式碼註解須引用 `I-MSSQL-QUEUE-TEST-CONCURRENCY-01`，供 code review 快速定位，防止未來被靜默移除或調低（AD §8 明文要求）。
3. **不可僅憑「恰 M 次成功、無重複」判定併發性已被驗證**——見 CONC-004（時間戳重疊證據）與 CONC-006（🔴 決策關卡：刻意用預設 `pool.max=1` 重跑同組計數斷言，證明計數斷言本身無鑑別力，必須靠 CONC-004 才能抓到序列化退化）。

### 0.4 逾時設定

建議 `vi.setConfig({ testTimeout: 120000 })`（比照既有 P1a/P1b1 慣例），CONC 群組單一案例本身應在數秒內完成（K≤10 之列鎖爭用），逾時餘裕主要留給 SCHEMA 群組兩軌建表與多個 `beforeAll`/`afterAll` 之 DataSource 生命週期。

### 0.5 MssqlQueueService 建構方式

比照 AD §6.2 pseudocode，測試直接 `new MssqlQueueService(dataSource)`（或注入其建構所需之 `DataSource`），不透過 NestJS `TestingModule`／不依賴 `RunQueueProducer`/`RunQueueConsumer`——對應 P2a DoD #4「完全獨立驗證」。

---

## 一、SCHEMA — `queue_job` 表結構兩軌驗證（AD §1）

> **對應**：P2a DoD #1／不變式 I-MSSQL-BASELINE-PARITY-01（延伸至 queue_job 單表）。

### TS-MSSQL-P2A-SCHEMA-001：Path A（synchronize，schema `p2a_sync`）成功建出 `queue_job` 表
- **Related Requirement**：AD §1 entity 定義／P2a DoD #1
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Steps**：`new DataSource({schema:'p2a_sync', entities:[QueueJob], synchronize:true})` 初始化；查詢 `INFORMATION_SCHEMA.TABLES`
- **Expected Result**：`p2a_sync.queue_job` 存在

---

### TS-MSSQL-P2A-SCHEMA-002：Path B（baseline migration，schema `p2a_baseline`）成功建出 `queue_job` 表
- **Related Requirement**：AD §1 filtered index 兩軌策略／P2a DoD #1
- **Test Type**：Positive / Integration
- **Steps**：`new DataSource({schema:'p2a_baseline', migrations:[QueueJobMssqlMigration], synchronize:false})`；`runMigrations()`
- **Expected Result**：`p2a_baseline.queue_job` 存在；`typeorm_migrations` 恰 1 筆

---

### TS-MSSQL-P2A-SCHEMA-003：`id` 欄位型別 = `uniqueidentifier`（兩路徑一致）
- **Related Requirement**：AD §1 `@PrimaryGeneratedColumn('uuid')`（沿用 P1a 已驗證之產生策略映射，不需 `uuidColumnType` helper）
- **Test Type**：Positive / Integration
- **Steps**：`sys.columns` join `sys.types` 查兩路徑 `queue_job.id`
- **Expected Result**：兩路徑皆為 `uniqueidentifier`

---

### TS-MSSQL-P2A-SCHEMA-004：`queue_name varchar(100)` / `state varchar(20)` / `retry_limit int`（兩路徑一致）
- **Related Requirement**：AD §1 entity 欄位定義
- **Test Type**：Positive / Integration
- **Steps**：`INFORMATION_SCHEMA.COLUMNS` 查三欄之 `DATA_TYPE`/`CHARACTER_MAXIMUM_LENGTH`
- **Expected Result**：`queue_name`=varchar(100)、`state`=varchar(20)、`retry_limit`=int，兩路徑相等

---

### TS-MSSQL-P2A-SCHEMA-005：`payload` 為 `nvarchar(MAX)`（`longTextColumnType`/`longTextColumnLength` helper 映射正確）
- **Related Requirement**：AD §1／既有 `column-types.ts` helper（P1a 已驗證，本案例僅涵蓋 queue_job 新站點，不重複探測）
- **Test Type**：Positive / Integration
- **Steps**：查 `INFORMATION_SCHEMA.COLUMNS` 之 `payload` 欄
- **Expected Result**：`DATA_TYPE='nvarchar'`，`CHARACTER_MAXIMUM_LENGTH=-1`（MAX 之 metadata 表示值），兩路徑相等

---

### TS-MSSQL-P2A-SCHEMA-006：4 個日期欄位 `datetime2`；`started_at`/`expire_at`/`completed_at` 為 nullable，其餘欄位 NOT NULL
- **Related Requirement**：AD §1 entity 定義
- **Test Type**：Positive / Integration
- **Steps**：查 `INFORMATION_SCHEMA.COLUMNS` 之 `IS_NULLABLE`
- **Expected Result**：`created_at`/`started_at`/`expire_at`/`completed_at` 皆 `datetime2`；`id`/`queue_name`/`payload`/`state`/`retry_limit`/`created_at` = `NO`；`started_at`/`expire_at`/`completed_at` = `YES`；兩路徑相等

---

### TS-MSSQL-P2A-SCHEMA-007：`state` 預設值 `'created'`，`created_at` 預設 `CURRENT_TIMESTAMP`→mssql 轉換正確（沿用 P1a DEFAULT 群組已驗證行為，僅涵蓋新站點）
- **Related Requirement**：AD §1／P1a 既有 CURRENT_TIMESTAMP smoke（不重複探測轉換機制本身）
- **Test Type**：Positive / Integration（smoke，非探測）
- **Steps**：Path A 插入一筆僅帶必要值（不帶 `state`/`created_at`）之 `queue_job`，讀回
- **Expected Result**：`state==='created'`；`created_at` 為近似當下時間之有效 `Date`

---

### TS-MSSQL-P2A-SCHEMA-008（🔴 DoD 核心）：兩路徑欄位集合結構化 diff 為空（複用 `schema-parity.ts` 之 `diffColumnSets`）
- **Related Requirement**：I-MSSQL-BASELINE-PARITY-01（延伸至 queue_job）
- **Test Type**：Positive / Integration（DoD 紅線）
- **Steps**：分別查 `p2a_sync.queue_job`／`p2a_baseline.queue_job` 之 `INFORMATION_SCHEMA.COLUMNS` 為 `ColumnRow[]`；呼叫 `diffColumnSets(a,b)`；`isEmptyComparison(...)`
- **Expected Result**：`true`（fieldDiffs 與 setDiffs 皆為空陣列）

---

### TS-MSSQL-P2A-SCHEMA-009（前置守門）：`diffColumnSets` 對本表具鑑別力（比照 PARITY-009 敏感度驗證精神，人工注入合成差異）
- **Related Requirement**：測試工具本身的測試（避免「永遠回報空 diff」的無效比對）
- **Test Type**：Meta / Guard
- **Steps**：取 Path A 之 `ColumnRow[]`，複製一份並人工竄改 `retry_limit` 之 `DATA_TYPE`；重新呼叫 `diffColumnSets`
- **Expected Result**：`fieldDiffs` 非空，含 `table='queue_job', column='retry_limit', field='DATA_TYPE'` 一筆

---

### TS-MSSQL-P2A-SCHEMA-010（🔴 決策關卡／設計提醒，MUST-FIX 說明性案例）：`queue_job` 之 Path A／Path B 索引**同名但欄位組成刻意不同**，不可直接套用既有 `diffIndexSets` 判定「parity 應為空」
- **Related Requirement**：AD §1「filtered index 兩軌策略」／既有 `schema-parity.ts` comparator 設計邊界
- **Test Type**：Meta / Guard（阻擋誤用）
- **問題說明**：entity `@Index` 產生之一般索引（Path A）為 `idx_queue_job_pending`=(queue_name,state) 與 `idx_queue_job_active_expiry`=(state,expire_at)；手寫 baseline migration 之 filtered index（Path B）**同名**但為 `idx_queue_job_pending`=(queue_name,created_at) WHERE state='created' 與 `idx_queue_job_active_expiry`=(expire_at) WHERE state='active'。既有 `IndexRecord`/`indexLogicalKey`（`schema-parity.ts`）不含 `has_filter`/`filter_definition` 欄位，且比對 key 含欄位組成——套用於本表會將兩者誤判為「兩側各自獨有的索引」（因欄位組成不同），既掩蓋了「同名但定義不同」這個更關鍵的事實，也不會捕捉到 filter 屬性本身的差異。
- **Steps**：（不執行 `diffIndexSets`；本案例為文件化守門，程式碼註解須引用本 TS-ID）
- **Expected Result**：tdd-implementation **改用 SCHEMA-011/012 之獨立明確斷言**驗證兩路徑索引，不對索引集合套用「diff 應為空」的 parity 判定；程式碼註解記錄「索引命名重複但定義不同係刻意設計（Path A 為 dev-only 產物，prod 部署僅套用 Path B，兩者不會同時存在於同一實際資料庫）」，避免未來被誤判為需修正之 bug

---

### TS-MSSQL-P2A-SCHEMA-011：Path A（synchronize）之兩個一般索引結構正確、`has_filter=0`
- **Related Requirement**：AD §1 entity `@Index` 定義
- **Test Type**：Positive / Integration
- **Steps**：查 `p2a_sync` 之 `sys.indexes`（`has_filter`）+ `sys.index_columns`
- **Expected Result**：`idx_queue_job_pending` 欄位=[queue_name,state]、`has_filter=0`；`idx_queue_job_active_expiry` 欄位=[state,expire_at]、`has_filter=0`

---

### TS-MSSQL-P2A-SCHEMA-012（🔴 DoD 核心）：Path B（baseline migration）之兩個 filtered index 結構與 `filter_definition` 正確、`has_filter=1`
- **Related Requirement**：AD §1 filtered index SQL／P2a DoD #1
- **Test Type**：Positive / Integration（DoD 紅線）
- **Steps**：查 `p2a_baseline` 之 `sys.indexes.filter_definition` + `sys.index_columns`
- **Expected Result**：`idx_queue_job_pending` 欄位=[queue_name,created_at]、`has_filter=1`、`filter_definition` 正規化後含 `state='created'` 語意；`idx_queue_job_active_expiry` 欄位=[expire_at]、`has_filter=1`、`filter_definition` 含 `state='active'` 語意

---

### TS-MSSQL-P2A-SCHEMA-013：`ALL_ENTITIES`（`app.module.ts`）已納入 `QueueJob`（I-MSSQL-ENTITY-LIST-PARITY-01 延伸）
- **Related Requirement**：AD §1「Entity 清冊收斂」／既有不變式 I-MSSQL-ENTITY-LIST-PARITY-01
- **Test Type**：Static / Guard
- **Steps**：靜態讀取 `app.module.ts` 原始碼，正則比對 `ALL_ENTITIES` 陣列字面內容
- **Expected Result**：陣列含 `QueueJob`

---

### TS-MSSQL-P2A-SCHEMA-014：`worker-app.module.ts`／`data-source.ts` 之 glob entity/migration 載入自動涵蓋新檔案（不需手動註冊）
- **Related Requirement**：AD §1「不需要改動」聲明
- **Test Type**：Static / Guard
- **Steps**：靜態檢視兩檔之 entity/migration glob pattern（`entities/*.entity.{ts,js}`／`migrations/mssql/*.{ts,js}`）
- **Expected Result**：pattern 未寫死檔名清單，新增 `queue-job.entity.ts` 與新 baseline migration 檔會被自動涵蓋

---

### TS-MSSQL-P2A-SCHEMA-015：`queue_job` 在所有 driver 通用建立，entity/migration 不含 driver-conditional schema 邏輯（AD §1 RESOLVED 決策）
- **Related Requirement**：AD §1「設計選擇（RESOLVED）」
- **Test Type**：Static / Guard
- **Steps**：靜態掃描 `queue-job.entity.ts` 與新 baseline migration 檔，grep `process.env.DB_TYPE`／`isPostgres`／driver 條件字樣
- **Expected Result**：零命中（PG 上為無害空表，見 §1 §9.3 之刻意簡化選擇）

---

## 二、UNIT — 五操作 SQL 文字／參數 spy（免真實連線，CI 恆常執行）

> 沿用「`escapeQueryWithParameters` 可離線驗證」精神延伸：以 mock `DataSource`/`queryRunner` spy 呼叫參數，驗證 SQL 文字骨架與具名參數，不需真實 MSSQL 連線，CI 成本最低、訊號最快。

### TS-MSSQL-P2A-UNIT-001：`send()` 呼叫之 SQL 含 `INSERT INTO`、`NEWID()`、`SYSUTCDATETIME()`，具名參數綁定 `queueName`/`payloadJson`/`retryLimit`
- **Related Requirement**：AD §2.5
- **Test Type**：Positive / Unit（mock query spy）
- **Steps**：spy `dataSource.query`／`queryRunner.query`；呼叫 `send('assignment-run', payload, 0)`
- **Expected Result**：SQL 字串含 `INSERT INTO`／`queue_job`／`NEWID()`／`OUTPUT inserted.id`；params 陣列含對應具名值，非字串拼接內插

---

### TS-MSSQL-P2A-UNIT-002：`cancel()` SQL 含 `WHERE id = @jobId AND state = 'created'`（防止語法退化成不帶狀態條件的誤刪）
- **Related Requirement**：AD §2.4
- **Test Type**：Positive / Unit
- **Steps**：spy query；呼叫 `cancel(jobId)`
- **Expected Result**：SQL 字串同時含 `id`/`jobId` 參數與 `state = 'created'` 字面條件

---

### TS-MSSQL-P2A-UNIT-003（🔴 I-MSSQL-QUEUE-CLAIM-01 靜態／spy 守門）：`claimNext()` 為單一陳述式（CTE + UPDATE + OUTPUT），SQL 同時含 `READPAST`/`ROWLOCK`/`UPDLOCK`/`OUTPUT`，且僅呼叫一次 DB round-trip
- **Related Requirement**：不變式 I-MSSQL-QUEUE-CLAIM-01（「不得以先 SELECT 再另一句 UPDATE 的兩段式操作模擬」）
- **Test Type**：Positive / Unit（🔴 DoD 紅線）
- **Steps**：spy `dataSource.query`（或 `queryRunner.query`）之呼叫次數與參數；呼叫 `claimNext('assignment-run', 14400)`
- **Expected Result**：query spy **恰被呼叫 1 次**；該次 SQL 字串同時含 `READPAST`、`ROWLOCK`、`UPDLOCK`、`OUTPUT`、`WITH (`；**不存在**任何獨立的先行 `SELECT` 呼叫

---

### TS-MSSQL-P2A-UNIT-004：`complete()` 為單一 `UPDATE ... WHERE id = @jobId`
- **Related Requirement**：AD §2.2
- **Test Type**：Positive / Unit
- **Steps**：spy query；呼叫 `complete(jobId)`
- **Expected Result**：SQL 含 `state = 'completed'`／`completed_at = SYSUTCDATETIME()`；恰 1 次呼叫

---

### TS-MSSQL-P2A-UNIT-005：`expireSweep()` SQL 含 `WHERE state = 'active' AND expire_at <= SYSUTCDATETIME()` 及 `ROWLOCK` hint
- **Related Requirement**：AD §2.3
- **Test Type**：Positive / Unit
- **Steps**：spy query；呼叫 `expireSweep()`
- **Expected Result**：SQL 字串符合上述條件

---

### TS-MSSQL-P2A-UNIT-006：五個方法之外部輸入（`queueName`/`payload`/`jobId`/`retryLimit`）一律以具名參數傳遞，不做字串拼接內插（SQL injection 防線）
- **Related Requirement**：一般安全性要求，比照既有 Pattern B ESCAPE 群組精神
- **Test Type**：Negative / Security（unit）
- **Steps**：以含單引號之惡意字串（如 `payload = "{'x':\"'; DROP TABLE queue_job; --\"}"`）呼叫 `send()`；檢視組出之 SQL 字面文字
- **Expected Result**：惡意字串**不**直接出現於 SQL 字面文字中，僅出現於獨立 params 陣列

---

## 三、SEND — 入列（Integration，真實 MSSQL）

### TS-MSSQL-P2A-SEND-001：`send()` 成功寫入一筆 `state='created'`，回傳 job id
- **Related Requirement**：AD §2.5
- **Test Type**：Positive / Integration
- **Steps**：`await queue.send(RUN_QUEUE_NAME, {runId:'r1',ym:'202606'}, 0)`；查該筆
- **Expected Result**：回傳值為合法 `uniqueidentifier` 字串；DB 中該筆 `state='created'`，`payload` 為 JSON 字串

---

### TS-MSSQL-P2A-SEND-002：`retry_limit` 正確寫入所帶入的值
- **Related Requirement**：AD §2.5
- **Test Type**：Positive / Integration
- **Steps**：`send(..., retryLimit=0)`；查該筆
- **Expected Result**：`retry_limit === 0`

---

### TS-MSSQL-P2A-SEND-003：多次 `send()` 產生的 id 皆唯一（無 PK 碰撞）
- **Related Requirement**：`NEWID()` 唯一性
- **Test Type**：Positive / Integration
- **Steps**：連續呼叫 `send()` 20 次
- **Expected Result**：20 個回傳 id 兩兩不同

---

### TS-MSSQL-P2A-SEND-004：`created_at` 由 DB 端 `SYSUTCDATETIME()` 產生（非 app 端傳入值）
- **Related Requirement**：AD §2.5／FIFO 排序依賴 DB 時鐘一致性之前提
- **Test Type**：Positive / Integration
- **Steps**：呼叫 `send()` 前後各記錄 app 端 `Date.now()`；查回 `created_at`
- **Expected Result**：`created_at` 落於呼叫前後時間窗內（容許時鐘飄移誤差），且非 app 端顯式傳入的固定值

---

## 四、CANCEL — 取消（Integration，含 §6.3.2 cancel-before-claim）

### TS-MSSQL-P2A-CANCEL-001：`send()` 後立即 `cancel()` → `state='cancelled'`
- **Related Requirement**：AD §2.4
- **Test Type**：Positive / Integration
- **Steps**：`send()` → `cancel(jobId)`；查該筆
- **Expected Result**：`state==='cancelled'`

---

### TS-MSSQL-P2A-CANCEL-002（🔴 §6.3.2 核心）：cancel-before-claim → 之後 `claimNext()` 對該筆回傳 null，不影響同佇列其他 created job 被正常領取
- **Related Requirement**：AD §6.3 場景 2
- **Test Type**：Positive / Integration（DoD 紅線）
- **Preconditions**：seed 2 筆 created job（A、B）
- **Steps**：`cancel(A)`；連續呼叫 `claimNext()` 2 次
- **Expected Result**：A 不會被任何一次 claim 撈到；B 被其中一次 claim 正確領走；第二次呼叫回傳 null（無其他 created job）

---

### TS-MSSQL-P2A-CANCEL-003：`cancel()` 對已 `active`（已被 claim）的 job → 影響列數 0，不改變其狀態（AD §2.4 語意）
- **Related Requirement**：AD §2.4 註解「影響列數 0 → 已被消費」
- **Test Type**：Negative / Integration
- **Steps**：`send()` → `claimNext()`（轉 active）→ `cancel(同一 jobId)`
- **Expected Result**：`cancel()` 不拋例外；查該筆 `state` 仍為 `'active'`（未被改為 cancelled）

---

### TS-MSSQL-P2A-CANCEL-004：`cancel()` 對不存在 `jobId` → 影響列數 0，不拋例外（吞錯語意，呼應既有 F098 `RunQueueProducer.cancel` regression 一致性）
- **Related Requirement**：AD §2.4；既有 `f098-producer.spec.ts`「cancel 失敗不向上拋」之語意於 mssql 路徑對齊
- **Test Type**：Negative / Integration
- **Steps**：`cancel('11111111-1111-1111-1111-111111111111')`（不存在之合法格式 uuid）
- **Expected Result**：resolves，不拋例外

---

## 五、CLAIM — 原子領取（Integration，含 §6.3.3 claim-after-claim / §6.3.4 FIFO）

### TS-MSSQL-P2A-CLAIM-001：對唯一一筆 created job 成功 claim，`state→active`，`started_at`/`expire_at` 正確寫入
- **Related Requirement**：AD §2.1
- **Test Type**：Positive / Integration
- **Steps**：`send()` 一筆 → `claimNext(RUN_QUEUE_NAME, 14400)`
- **Expected Result**：回傳 `{jobId, payload, retryLimit}` 非 null；查該筆 `state==='active'`，`started_at` 有值，`expire_at` ≈ `started_at` + 14400 秒（容許誤差）

---

### TS-MSSQL-P2A-CLAIM-002（🔴 §6.3.3 核心）：對同一筆已 `active` 的 job 再次呼叫 claim（序列，非併發）→ 回傳 null
- **Related Requirement**：AD §6.3 場景 3
- **Test Type**：Negative / Integration（DoD 紅線）
- **Steps**：`send()` → `claimNext()`（成功）→ 再次 `claimNext()`（同佇列已無其他 created job）
- **Expected Result**：第二次呼叫回傳 `null`

---

### TS-MSSQL-P2A-CLAIM-003（§6.3.4 FIFO）：多筆 created job 依 `created_at ASC` 依序被領取
- **Related Requirement**：AD §6.3 場景 4／AD §2.1 `ORDER BY created_at ASC`
- **Test Type**：Positive / Integration
- **Preconditions**：seed 3 筆，人工指定遞增 `created_at`（A < B < C，或以 `send()` 間隔 sleep 確保順序）
- **Steps**：連續呼叫 `claimNext()` 3 次，記錄各次回傳 jobId
- **Expected Result**：領取順序恰為 A、B、C

---

### TS-MSSQL-P2A-CLAIM-004：佇列為空（無 created job）→ `claimNext()` 回傳 null，不拋例外
- **Related Requirement**：AD §2.1 邊界
- **Test Type**：Negative / Integration
- **Steps**：對空表（或全部已非 created 狀態）呼叫 `claimNext()`
- **Expected Result**：回傳 `null`

---

### TS-MSSQL-P2A-CLAIM-005：claim 僅選擇符合 `queueName` 的 job（跨佇列隔離）
- **Related Requirement**：AD §2.1 `WHERE queue_name = @queueName`
- **Test Type**：Negative / Integration（邊界）
- **Preconditions**：seed 一筆 `queue_name='assignment-run'`、一筆 `queue_name='other-queue'`
- **Steps**：`claimNext('assignment-run', 14400)`
- **Expected Result**：僅領到 `assignment-run` 之該筆；`other-queue` 之該筆仍為 `created`

---

### TS-MSSQL-P2A-CLAIM-006：`payload` JSON 序列化往返不失真（比照既有 F098 PGINT-004 精神）
- **Related Requirement**：AD §2.1／`RunJobPayload {runId, ym}` 契約
- **Test Type**：Positive / Integration
- **Steps**：`send(queueName, {runId:'r-abc', ym:'202606'})` → `claimNext()`；`JSON.parse(claimed.payload)`
- **Expected Result**：還原物件與原始 `{runId:'r-abc', ym:'202606'}` 深相等

---

## 六、COMPLETE — 完成（Integration）

### TS-MSSQL-P2A-COMPLETE-001：`complete()` 後 `state='completed'`，`completed_at` 有值
- **Related Requirement**：AD §2.2
- **Test Type**：Positive / Integration
- **Steps**：`send()` → `claimNext()` → `complete(jobId)`；查該筆
- **Expected Result**：`state==='completed'`，`completed_at` 為近似當下之有效 `Date`

---

### TS-MSSQL-P2A-COMPLETE-002：`complete()` 對已 `completed` 或不存在 jobId → 影響列數 0，不拋例外（冪等防呆）
- **Related Requirement**：AD §2.2 一般冪等要求
- **Test Type**：Negative / Integration
- **Steps**：對同一 jobId 呼叫 `complete()` 兩次；對不存在 jobId 呼叫 `complete()`
- **Expected Result**：兩者皆不拋例外

---

### TS-MSSQL-P2A-COMPLETE-003：`complete()` 本身不區分業務成功/失敗（純狀態轉移，語意記錄）
- **Related Requirement**：AD §2.2「retry=0，無論業務成功/失敗一律 completed」
- **Test Type**：Positive / Integration（契約記錄）
- **Steps**：直接呼叫 `complete(jobId)`（不經任何業務層邏輯，`MssqlQueueService` 本身無「成功/失敗」參數）
- **Expected Result**：`complete()` 簽章僅接受 `jobId`，無 `success`/`error` 參數；業務層失敗處理屬 P2b `processPayload` 職責，不在本檔範圍內斷言

---

## 七、SWEEP — 逾時回收（Integration，含 §6.3.1 expire 後不重派）

### TS-MSSQL-P2A-SWEEP-001（🔴 §6.3.1 核心）：claim 一筆不 complete，撥 `expire_at` 至過去，`expireSweep()` 後 `state='expired'`
- **Related Requirement**：AD §6.3 場景 1／AD §2.3
- **Test Type**：Positive / Integration（DoD 紅線）
- **Steps**：`send()` → `claimNext(queueName, expireSeconds=1)`（極短 expire）→ 等待 > 1 秒（或直接 SQL `UPDATE` 該筆 `expire_at` 撥至過去，避免真實 sleep）→ `expireSweep()`
- **Expected Result**：該筆 `state==='expired'`

---

### TS-MSSQL-P2A-SWEEP-002（🔴 §6.3.1 核心，對齊 retry=0「不自動重派」）：SWEEP-001 之後再呼叫 `claimNext()` → 回傳 null
- **Related Requirement**：AD §6.3 場景 1
- **Test Type**：Negative / Integration（DoD 紅線）
- **Steps**：接續 SWEEP-001 狀態，呼叫 `claimNext(queueName, 14400)`
- **Expected Result**：回傳 `null`（`expired` 不在 claim 之 `state='created'` 範圍內）

---

### TS-MSSQL-P2A-SWEEP-003：未過期的 `active` job 不受 sweep 影響（對照組邊界）
- **Related Requirement**：AD §2.3 `WHERE expire_at <= SYSUTCDATETIME()`
- **Test Type**：Negative / Integration
- **Steps**：`send()` → `claimNext(queueName, 14400)`（遠期 expire）→ `expireSweep()`
- **Expected Result**：該筆 `state` 仍為 `'active'`

---

### TS-MSSQL-P2A-SWEEP-004：sweep 對多筆同時過期 job 一次全部標記（非逐筆遺漏）
- **Related Requirement**：AD §2.3（集合式 `UPDATE`，非迴圈）
- **Test Type**：Positive / Integration
- **Preconditions**：seed 3 筆皆 claim 為 active 且 `expire_at` 撥至過去
- **Steps**：呼叫一次 `expireSweep()`
- **Expected Result**：3 筆皆變為 `'expired'`

---

### TS-MSSQL-P2A-SWEEP-005：sweep 對 `created` 狀態的 job 不受影響（`WHERE state='active'` 條件守門）
- **Related Requirement**：AD §2.3
- **Test Type**：Negative / Integration
- **Steps**：seed 一筆 `created`（未 claim），呼叫 `expireSweep()`
- **Expected Result**：該筆仍為 `'created'`

---

## 八、CONC — 🔴 併發正確性 Harness（旗艦群組，AD §6，I-MSSQL-QUEUE-CLAIM-01 / TEST-CONCURRENCY-01 核心）

> 使用 §0.3 之專屬 `DataSource`（`pool.max=20`）。所有案例對真實 MSSQL 容器執行。

### TS-MSSQL-P2A-CONC-001（🔴 MUST-FIX，前置守門）：CONC 群組所用 `DataSource` 明確設定 `pool.max ≥ 10`
- **Related Requirement**：不變式 I-MSSQL-QUEUE-TEST-CONCURRENCY-01
- **Test Type**：Meta / Guard（配置斷言，非執行期行為斷言）
- **Steps**：讀取 CONC 群組共用 `DataSource` 之 `options.pool.max`（TypeORM `DataSourceOptions.pool.max`，已查證 driver 定義，見 §0.3）
- **Expected Result**：`pool.max >= 10`（本群組最大 K）；程式碼中該設定緊鄰處須有引用 `I-MSSQL-QUEUE-TEST-CONCURRENCY-01` 的註解

---

### TS-MSSQL-P2A-CONC-002（🔴 DoD 核心，僧多粥少邊界）：M=5 created job，K=10 併發 claim → 恰 5 次成功、無重複、無遺漏
- **Related Requirement**：AD §6.2／不變式 I-MSSQL-QUEUE-CLAIM-01
- **Test Type**：Positive / Integration（DoD 紅線）
- **Steps**：seed 5 筆 created job；`Promise.all(Array.from({length:10}, () => queue.claimNext(RUN_QUEUE_NAME, 14400)))`
- **Expected Result**：`results.filter(r=>r!==null).length === 5`；`new Set(claimedIds).size === 5`；claimed id 集合 === 原 5 筆 seed id 集合（無遺漏）；其餘 5 次為 `null`

---

### TS-MSSQL-P2A-CONC-003（🔴 DoD 核心，粥多僧少邊界）：M=10 created job，K=5 併發 claim → 恰 5 次成功、無重複，剩餘 5 筆仍為 created
- **Related Requirement**：AD §6.2
- **Test Type**：Positive / Integration（DoD 紅線）
- **Steps**：seed 10 筆；`Promise.all(Array.from({length:5}, () => queue.claimNext(...)))`
- **Expected Result**：5 次全部成功（無 null）；無重複 jobId；查表確認另外 5 筆仍為 `'created'`（未被誤觸）

---

### TS-MSSQL-P2A-CONC-004（🔴 併發性證據，防假陽性核心）：K=10 個 claim 呼叫確為併發送出（起始時間戳重疊），非變相序列化
- **Related Requirement**：AD §6.2「額外斷言/記錄確為並發送出」
- **Test Type**：Positive / Integration（DoD 紅線）
- **Steps**：seed 10 筆 created job；每個 claim 呼叫前以 `performance.now()` 記錄各自的呼叫發起時間戳（於 `Promise.all` 的 mapping 函式內，呼叫 `claimNext()` 之前立即記錄）；量測全部 10 個時間戳的最大值與最小值之差
- **Expected Result**：10 個發起時間戳彼此差距 < 50ms（同一 event loop tick 內同步發起，證明並非逐一等待前一個完成才發起下一個）；額外交叉驗證：批次總耗時（`Promise.all` resolve 時間 − 最早發起時間）應遠小於「單次 claim 耗時基準 × 10」（另跑一次單次 claim 量測基準值，若批次耗時 ≈ 10×基準值則高度懷疑序列化）

---

### TS-MSSQL-P2A-CONC-005：K = M（K=5, M=5，剛好足額分配）→ 全部成功、無 null、無重複
- **Related Requirement**：AD §6.2 補充邊界
- **Test Type**：Positive / Integration
- **Steps**：seed 5 筆；`Promise.all` 發出 5 個併發 claim
- **Expected Result**：5 次全部非 null；無重複；查表確認全部 5 筆皆變為 `'active'`

---

### TS-MSSQL-P2A-CONC-006（🔴 決策關卡，Harness 鑑別力驗證，比照 PARITY-009 敏感度驗證精神延伸至併發 harness）：刻意以 `pool.max=1`（TypeORM 預設值）重跑 CONC-002 之計數斷言 → 證明「恰 M 次成功、無重複」單獨不足以偵測序列化退化
- **Related Requirement**：AD §6.2 陷阱說明／I-MSSQL-QUEUE-TEST-CONCURRENCY-01「此設定不得被靜默移除或調低」之直接反證
- **Test Type**：Meta / Guard（決策關卡，證明性案例，非常規 pass/fail 驗收項）
- **Steps**：另建一個 `pool.max=1`（或不設定，沿用 driver 預設）之對照 `DataSource`；重複 CONC-002 之 M=5/K=10 場景與計數斷言；另外對同一批呼叫套用 CONC-004 之時間戳重疊斷言
- **Expected Result**（探測型，兩段式）：**計數斷言（`claimed.length===5`、無重複）預期仍然通過**（列鎖本身在序列化下依然正確，只是變慢）——此即證明「計數正確」不能單獨作為併發性證據；**時間戳重疊斷言預期失敗**（K 個呼叫的發起時間戳會被連線池排隊拉開，總耗時 ≈ 10×單次基準值）。若實測與預期不符（例如連 CONC-004 式時間戳斷言在 `pool.max=1` 下也意外通過），代表 CONC-004 的容差設定過鬆，須調緊重新設計，不可略過此矛盾

---

### TS-MSSQL-P2A-CONC-007：连续兩輪併發 claim（Harness 可重複執行，無殘留鎖／連線洩漏）
- **Related Requirement**：Harness 自身的穩健性（非 AD 明文要求，測試設計附加防線）
- **Test Type**：Positive / Integration（穩健性）
- **Steps**：完成一輪 CONC-002 場景後清空 `queue_job` 表並重新 seed，再跑第二輪相同場景（同一 `DataSource` 不重建）
- **Expected Result**：第二輪結果與第一輪相同模式（恰 M 次成功、無重複），無因前一輪殘留鎖／連線未歸還導致的逾時或異常

---

### TS-MSSQL-P2A-CONC-008：K 個並發 claim 對 0 筆 created job（全部已被前輪領走或空表）→ 全部回傳 null，無例外、無死鎖
- **Related Requirement**：AD §6.2 邊界延伸
- **Test Type**：Negative / Integration
- **Steps**：確保表中無 `created` 狀態列；`Promise.all(Array.from({length:10}, () => queue.claimNext(...)))`
- **Expected Result**：`results.every(r => r === null)`；`Promise.all` 正常 resolve（不逾時、不拋例外）

---

## 九、STATIC — 命名鎖定 + 獨立性靜態守門

### TS-MSSQL-P2A-STATIC-001：命名鎖定 — `MssqlQueueService`／`send`/`cancel`/`claimNext`/`complete`/`expireSweep`／`queue_job`／欄位名與 AD §1/§2 完全一致
- **Related Requirement**：AD §1/§2 命名
- **Test Type**：Static / Guard
- **Steps**：fs+regex 靜態掃描 `queue/mssql-queue.service.ts`
- **Expected Result**：類別名與 5 個方法名、表名、8 個欄位名皆與 AD 文字完全一致（比照既有命名鎖定慣例，`feedback_tdd_naming_drift`）

---

### TS-MSSQL-P2A-STATIC-002（P2a DoD #4 核心）：`MssqlQueueService` 不依賴 `RunQueueProducer`/`RunQueueConsumer`（完全獨立驗證）
- **Related Requirement**：P2a DoD #4
- **Test Type**：Static / Guard
- **Steps**：靜態掃描 `mssql-queue.service.ts` 之 import 陳述式
- **Expected Result**：不 import `run-queue.producer.ts`／`run-queue.consumer.ts`

---

### TS-MSSQL-P2A-STATIC-003：五個 T-SQL 操作字串於程式碼中僅存在單一位置（預先守住 P2b 不得複製貼上另一份相似 SQL）
- **Related Requirement**：呼應不變式 I-MSSQL-QUEUE-PAYLOAD-UNITY-01 之精神延伸（雖然 P2a 尚未接線 producer/consumer）
- **Test Type**：Static / Guard（前瞻性守門，供 P2b 沿用）
- **Steps**：全域 grep `READPAST`／`UPDLOCK`／`ROWLOCK`（claim SQL 之特徵字串）於 `src/` 範圍
- **Expected Result**：僅命中 `mssql-queue.service.ts` 一處，記錄本結果供 P2b test-designer 於接線後重跑同一守門，確保未來未被複製第二份

---

## 十、REG — 回歸

### TS-MSSQL-P2A-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨（新增 `QueueJob` entity + `MssqlQueueService` 後）
- **Related Requirement**：`feedback_vitest_no_typecheck`（vitest 不做型別檢查，須另跑 tsc gate）
- **Test Type**：Static / Guard
- **Steps**：`npm run` 對應 tsc 腳本
- **Expected Result**：exit code 0，零型別錯誤

---

### TS-MSSQL-P2A-REG-002：既有 F098 套件（producer/consumer/orphan-reaper/cancellation/static-guards/trigger-run/pg-integration）全數不回歸
- **Related Requirement**：P2a 範圍聲明「不碰 Producer/Consumer」
- **Test Type**：Regression
- **Steps**：重跑 `queue/__tests__/f098-*.spec.ts` 全部 7 個檔案
- **Expected Result**：全綠，且測試檔本身未被本輪改動

---

### TS-MSSQL-P2A-REG-003：sqlite 既有全套件不受影響（`queue_job` entity 加入 `ALL_ENTITIES` 後 sqlite `synchronize` 仍正常）
- **Related Requirement**：AD §1「所有 driver 通用建立」
- **Test Type**：Regression
- **Steps**：以 `DB_TYPE` 預設（sqlite）跑既有 `assignment`/`assignment-list` 模組測試套件
- **Expected Result**：全綠，`queue_job` 表對 sqlite 亦可 `synchronize` 建成（`dateColumnType`/`longTextColumnType` 既有 sqlite 分支值沿用，不需新增）

---

### TS-MSSQL-P2A-REG-004：PG 既有 `.pg.spec.ts` 套件（F098~F109）不受影響（`queue_job` 在 PG 為新增空表）
- **Related Requirement**：AD §1「PG 上會是一張建了但未使用的空表」
- **Test Type**：Regression
- **Steps**：重跑既有 `.pg.spec.ts` 套件（沿用既有序列執行慣例）；靜態掃描既有程式碼確認無 `queue_job` 之 JOIN/查詢
- **Expected Result**：全綠，零回歸；靜態掃描零命中

---

### TS-MSSQL-P2A-REG-005：既有 P1a/P1b1/P1b2/P1b3/P1c `.mssql.spec.ts` 套件不受影響（本文件新 schema 不佔用既有保留 schema）
- **Related Requirement**：`dbo`/`p1a`/`p1b1`/`p1b2_sync`/`p1b3` 既有保留慣例
- **Test Type**：Regression
- **Steps**：重跑既有全部 `.mssql.spec.ts` 檔案（序列執行，比照 `feedback_pg_spec_parallel_timeout` 之序列化慣例延伸至 mssql）
- **Expected Result**：全綠；本文件新增之 `p2a_sync`/`p2a_baseline` 與既有 schema 無交集，無交叉污染

---

## 附錄：本文件案例數彙總

| 群組 | 案例數 | 對真 MSSQL 執行 |
|---|---|---|
| SCHEMA | 15 | 是（001~002/003~009/011~012 需真實連線；010 為文件化決策關卡；013~015 為靜態） |
| UNIT | 6 | 否（mock spy，免連線） |
| SEND | 4 | 是 |
| CANCEL | 4 | 是 |
| CLAIM | 6 | 是 |
| COMPLETE | 3 | 是 |
| SWEEP | 5 | 是 |
| CONC | 8 | 是（001/006 部分為配置/決策關卡性質，仍需真實連線觀測） |
| STATIC | 3 | 否（靜態掃描） |
| REG | 5 | 部分（REG-002/004/005 需真實連線重跑既有套件；REG-001/003 不需） |
| **合計** | **59** | — |
