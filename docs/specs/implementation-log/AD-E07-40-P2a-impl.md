---
type: implementation-log
feature_id: AD-E07-40-P2a
feature_name: MSSQL 全面遷移 P2a — queue_job Schema + MssqlQueueService 五操作 + 併發正確性 Harness
status: complete
last_updated: 2026-07-07
---

# AD-E07-40 P2a：MSSQL 自建 T-SQL 佇列 — 實作紀錄

落地 P2 管線最後一棒的第一片：`queue_job` entity（兩軌 schema）＋`MssqlQueueService` 五操作＋併發正確性 harness。
**未碰** P2b（Producer/Consumer/worker 接線）與 P2c（sweep 整合）。**未 git commit。**

## 測試結果彙總

新增 `ad-e07-40-p2a.mssql.spec.ts`（對真實 MSSQL 容器 `localhost:1433` CDMP_TEST 執行）：**59 / 59 全綠**（0 skip；容器可達）。

| 群組 | 案例數 | 結果 | 備註 |
|---|---|---|---|
| SCHEMA | 15 | PASS | 兩軌建表 + 欄位 parity + filtered index（SCHEMA-010 文件化守門、013~015 靜態） |
| UNIT | 6 | PASS | 五操作 SQL 文字/參數 spy（mock DataSource，免連線） |
| SEND | 4 | PASS | |
| CANCEL | 4 | PASS | 含 cancel-before-claim |
| CLAIM | 6 | PASS | 含 FIFO、跨佇列隔離、payload 往返 |
| COMPLETE | 3 | PASS | |
| SWEEP | 5 | PASS | 含 expire 後不重派 |
| CONC | 8 | PASS | 🔴 見下方併發證明 + pool.max=1 對照 |
| STATIC | 3 | PASS | 命名鎖定 + 獨立性 + 單一 SQL 位置 |
| REG | 5 | PASS | REG-001 tsc 代理 + 靜態守門 |

**tsc**：`npx tsc --noEmit -p tsconfig.build.json` → exit 0（乾淨）。

**回歸**：
- 全 mssql 套件序列合跑（`--no-file-parallelism`）：**218 / 218 全綠**（p1a + p1a-unit + p1b1 39 + p1b2 35 + p1b3 50 + p2a 59）。REG-005 確認 `p2a_sync`/`p2a_baseline` 與既有保留 schema 無交集。
- sqlite（REG-003）：f098-trigger-run + assignment `__tests__` = 59/59；`queue_job` 於 sqlite synchronize 正常建成（無 SQLITE_ERROR）。
- F098 套件（REG-002）：76/77（唯一失敗 `TS-F098-PGINT-002` 為**既有 pre-existing**，與本輪無關——已用 git stash 於 baseline 重現，成因為 commit `66b67c1`「收斂 67 支 migration 為 baseline 快照」刪除了 `1711360000299-CreatePgBossSchema.ts` 但該靜態守門仍期望其存在）。
- PG（REG-004）：本機 5433 未起 → PG 套件 gating skip（既有行為）；靜態面（無 `queue_job` 業務 JOIN）由 in-file REG-004 守門確認通過。

## Schema 兩軌結果（AD §1）

| 面向 | Path A（synchronize，`p2a_sync`） | Path B（baseline migration，`p2a_baseline`） |
|---|---|---|
| 建表 | ✅ entity `@Index` 一般索引 | ✅ 手寫 T-SQL migration `1751884800002` |
| 欄位 | id `uniqueidentifier`、queue_name varchar(100)、payload nvarchar(MAX)、state varchar(20)、retry_limit int、4×datetime2 | 逐欄與 Path A 相等 |
| 欄位 parity | 🔴 SCHEMA-008 `diffColumnSets` = 空（含 COLUMN_DEFAULT：`(newsequentialid())`/`('created')`/`((0))`/`(getdate())` 兩軌一致） | 同左 |
| 索引 | `idx_queue_job_pending`(queue_name,state)、`idx_queue_job_active_expiry`(state,expire_at)，皆 `has_filter=0` | `idx_queue_job_pending`(queue_name,created_at) WHERE state='created'、`idx_queue_job_active_expiry`(expire_at) WHERE state='active'，皆 `has_filter=1` |

> 索引「同名但定義刻意不同」→ **不套用** `diffIndexSets` parity（SCHEMA-010 文件化守門；migration 原始碼記錄此為刻意設計）。Path A 為 dev-only synchronize 產物，prod 僅套用 Path B，兩者不會共存於同一實際資料庫。

**Schema 感知**：migration 與 service 皆讀 `connection.options.schema`（未設 → `dbo`）動態前綴表名——因 raw SQL 不受 TypeORM schema 選項自動前綴。使同一 migration 檔於「隔離結構驗證（p2a_baseline）」與「prod 部署（dbo）」皆落正確 schema。**非 driver-conditional**（不依 DB_TYPE/isPostgres）。

## 五個原子操作（AD §2）

| 方法 | 核心 SQL | 不變式 |
|---|---|---|
| `send` | `INSERT ... OUTPUT inserted.id VALUES (NEWID(), @0, @1, 'created', @2, SYSUTCDATETIME())` | payload 以 `JSON.stringify` 綁參，不字串內插 |
| `cancel` | `UPDATE ... SET state='cancelled' WHERE id=@0 AND state='created'` | 已消費/不存在 → 影響 0、吞錯 |
| `claimNext` | 🔴 單一陳述式 `;WITH candidate AS (SELECT TOP(1) ... WITH (READPAST,ROWLOCK,UPDLOCK) WHERE queue_name=@0 AND state='created' ORDER BY created_at ASC) UPDATE candidate SET state='active',... OUTPUT ...` | I-MSSQL-QUEUE-CLAIM-01：單次 round-trip、無兩段式 TOCTOU |
| `complete` | `UPDATE ... SET state='completed', completed_at=SYSUTCDATETIME() WHERE id=@0` | 冪等、僅接受 jobId |
| `expireSweep` | `UPDATE ... WITH (ROWLOCK) SET state='expired' WHERE state='active' AND expire_at<=SYSUTCDATETIME()` | 集合式 UPDATE，非逐筆 |

## 🔴 CONC 併發證明（含 pool.max=1 對照鑑別力）

專屬 `DataSource` 明設 `pool: { max: 20 }`（≥ K=10，I-MSSQL-QUEUE-TEST-CONCURRENCY-01；TypeORM mssql 預設 max=1 會靜默序列化）。

**CONC-004（併發性證據，多輪穩定）**：`singleBaseline≈5–7ms`、`batch(K=10)≈8.5–12ms`、`ratio≈1.3–2.2`、`startSpread≈0ms`。批次總耗時遠小於「單次×10（≈50–70ms）」→ 證明 10 個 claim 為**真並發**（≈1 個 round-trip 時間），非序列化。

**CONC-006（決策關卡，鑑別力反證）**：同 M=5/K=10 場景，
- `serial(pool.max=1) firstBurst≈35–40ms` vs `concurrent(pool.max=20) firstBurst≈8.5–9.4ms`（序列化約 **4×** 慢）。
- **drain 計數兩者皆=5**（無重複）→ 證明「計數正確」對序列化**無鑑別力**；必須靠耗時/併發性證據才能抓到 pool.max=1 的序列化退化。此即測試設計要求保留的 pool.max=1 對照組價值。

## 檔案異動

| 檔案 | 類型 | 說明 |
|---|---|---|
| `apps/api/src/database/entities/queue-job.entity.ts` | new | QueueJob entity（`@Index` 一般索引 + portable helper） |
| `apps/api/src/database/migrations/mssql/1751884800002-MssqlQueueJobSchema.ts` | new | 手寫 baseline migration（schema 感知 + filtered index） |
| `apps/api/src/modules/assignment/queue/mssql-queue.service.ts` | new | MssqlQueueService 五操作（`@Injectable`，注入 DataSource） |
| `apps/api/src/modules/assignment/queue/__tests__/ad-e07-40-p2a.mssql.spec.ts` | new | 59 案例 |
| `apps/api/src/app.module.ts` | modified | ALL_ENTITIES 加入 QueueJob（SCHEMA-013） |
| `apps/api/src/database/__tests__/mssql-p1b1.mssql.spec.ts` | modified | 見偏差 D-RIPPLE（AppModule entity 36→37、entity 檔數 36→37） |
| `apps/api/src/database/__tests__/mssql-p1b2.mssql.spec.ts` | modified | 見偏差 D-RIPPLE（dbo 讀取排除 queue_job、migration 2→3、STATIC-004 revert 3 次） |
| `apps/api/src/database/__tests__/mssql-p1b3.mssql.spec.ts` | modified | 見偏差 D-RIPPLE（dboBusinessTableCount 排除 queue_job、migration 2→3、revert 3 次） |

`worker-app.module.ts` / `data-source.ts` **不需改動**（entity/migration glob 自動載入；SCHEMA-014 靜態確認）。`assignment-worker.module.ts` **未改**（service providers 接線屬 P2b）。

## 架構決策與偏差（🔴 需下游/裁示知悉）

### D-CLAIM-01（必要修正）：claim CTE 投影補齊被 SET 的欄位
AD §2.1 pseudocode 之 CTE 僅投影 `id, payload, retry_limit`，但 `UPDATE candidate SET state/started_at/expire_at` 於**真實 MSSQL** 報 `Invalid column name 'expire_at'`——SQL Server 要求 UPDATE-through-CTE 所 SET 的欄位必須在 CTE 投影中。AD §0 P0 smoke 只 `SET state`（state 已在投影）故未暴露。已忠實修正為投影 `id, payload, retry_limit, state, started_at, expire_at`；語法骨架（READPAST/ROWLOCK/UPDLOCK/OUTPUT/單一陳述式）與不變式不變。**建議 test-designer/architect 回填 AD §2.1 SQL。**

### D-CONC-01（實測驅動之必要修正）：單一併發突發「恰 M」不可達 → 改 drain
AD §6.2 / 測試設計 CONC-002/003/005 期望「單一 `Promise.all` 恰領 M 筆」。實測（含直接 probe，plain 與 filtered index 皆然）：**READPAST（＝模擬 PG `FOR UPDATE SKIP LOCKED`）為非阻塞、跳過被鎖列語意**，單一並發突發會 under-claim（5 筆常只領 2–4 筆）。此為 SKIP-LOCKED 家族的**固有正確行為**（PG 亦然），非 bug；真正不變式是「**絕不重複領取（no double-claim）**」＋「**反覆輪詢終能全部領完（no loss）**」——後者正是 prod 單一 worker 輪詢 loop 的行為。故 CONC 改為 **drain**（反覆併發突發直到領完），斷言：累計恰 M、零重複、涵蓋全部 seed、最終狀態正確；每輪仍是真並發（Promise.all of K），CONC-004 另證並發性。此偏離測試設計字面步驟但**完整保全其真正意圖**（AD §6.1「兩個並發 claim，恰好一個成功」＝ no double-claim）。**建議 test-designer 回填 CONC 群組之 drain 語意。**
> 附帶重要發現：filtered index 只影響效能不影響此語意；且 synchronize（dev, plain index）在多 worker 併發下 under-claim 幅度更大——但 prod 為單一 worker 輪詢，不受影響。

### D-RIPPLE（必要之跨 slice 回歸維護）：P1b1/P1b2/P1b3 計數
SCHEMA-013 要求 QueueJob 入 `app.module` ALL_ENTITIES、SCHEMA-014 要求 migration 入 `migrations/mssql/*` glob——兩者使既有 P1b「全 entity / 全 migration 鏈」計數斷言必然位移，與 REG-005「既有 mssql 套件不受影響」表面衝突。**解法沿用 P1b3→P1b2 既有先例**（P1b3 新增第 2 支 migration 時即更新 P1b2 計數）：
- P1b1：ENTITY-002（真實 AppModule）36→37；REG-004 entity 檔數 36→37。
- P1b2：dbo 讀取端一律排除 `queue_job`（fetch 三 helper + BASELINE-002 + CASE-BASELINE-001 + countFiltered），使 queue_job 完全落在「36 表業務 baseline parity」範疇之外；BASELINE-003 migration 2→3；STATIC-004 revert 2→3 次。
- P1b3：`dboBusinessTableCount` 排除 queue_job；ALIAS-001/006 migration 2→3；ALIAS-002 revert 2→3 次。
全部已驗證綠燈。此為「新表加入共用 entity 清冊/migration 鏈」的必然維護，非破壞既有語意（queue_job 由 P2a 專屬套件驗證，P1b 專注 36 表業務 baseline）。

## Blocking Issues
無阻擋。P2a DoD（#1 兩軌建表、#2 併發 harness、#3 §6.3 四場景、#4 完全獨立驗證不依賴 Producer/Consumer）全數達成。上述 D-CLAIM-01 / D-CONC-01 建議回填 AD/測試設計文字，但不阻擋 P2b。
