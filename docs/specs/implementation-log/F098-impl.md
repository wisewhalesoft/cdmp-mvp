---
type: implementation-log
feature_id: F098
feature_name: 月跑 Worker 抽離（pg-boss 入列 + cdmp-worker 容器 + cancellation / orphan 回收）
scope: P1-only
status: complete
last_updated: 2026-06-02
branch: feat/F098-monthly-run-worker-extraction
---

# F098：月跑 Worker 抽離（AD-E07-28 P1）— Implementation Log

> 範圍限定 **P1**（執行容器抽離 + cancellation + orphan 回收）。**不**改 Stage 1~4 演算法（仍 JS 版），
> 只改「pipeline 在哪裡、由誰執行」。不碰 P2（F099 Stage 1 SQL 下推）/ P3（F100）。

## Test Results Summary

| 群組 / Scenario | 對應 AC | Level | 狀態 |
|---|---|---|---|
| TS-F098-TRIG-001~006（triggerRun 入列、不跑 pipeline、回 202、不暴露 jobId） | AC-1 / I-TRIGGER-01 | Unit | PASS |
| TS-F098-OQ-001（入列失敗不留孤兒 pending → 標 failed） | OQ-F098-01 | Unit | PASS |
| TS-F098-CONS-001~006（consumer 取 job.data → runPipeline；run 不存在不 crash；queue name 一致） | AC-2 / AC-7 | Unit | PASS |
| TS-F098-RETRY-001（send retryLimit=0） | AC-3 | Unit | PASS |
| TS-F098-SER-001（work batchSize=1，v10 序列化等效） | AC-4 | Unit | PASS |
| TS-F098-CANCEL-001~004（poller 偵測 failed → 拋例外；取消後不寫快照/result；stage 間生效；list 級粒度） | AC-5 | Unit | PASS |
| TS-F098-ORPHAN-001~006 + OQ-002（running/pending 逾時回收、不誤殺、閾值邊界、completed/failed 不觸碰、回收後解鎖） | AC-6 / §9.2 | Unit | PASS |
| TS-F098-RG-001~005 + WORKER-001~004（靜態 guard：無 setImmediate/kickoffPipeline、無自動 re-enqueue、worker 不掛 HTTP/無 ports/同源/flag、producer 註冊、migration 存在） | I-TRIGGER-01 / §5 / §6 | 靜態 | PASS |
| TS-F098-PGINT-001/002/004/005、RETRY-002、SER-002、CANCEL-006（真 pg-boss 端到端） | AC-1~AC-6 | PG Integration | PASS（已對真 Postgres 5433 實跑）/ CI 預設 skip-with-reason |

- **Unit / 靜態（SQLite + mock，快速 CI）**：42 tests，**全綠**。
- **PG Integration（需 Postgres）**：6 tests，**已對 `docker-compose.test.yml` 之 postgres-test（5433/cdmp_test）實跑通過**；無 Postgres 環境（預設 `DB_TYPE=sqlite`）自動 `skip-with-reason`（印 `[F098 PG Integration] SKIPPED — 需 Postgres…`，不假綠）。
- **F098 合計 48 tests**（7 spec 檔）。
- **Worker DI smoke**（暫時性，已移除）：`createApplicationContext(WorkerAppModule)` 對真 Postgres 成功解析 consumer + reaper + pipeline（`WORKER_DI_OK`）。
- **Migration smoke**（暫時性，已移除）：m299 `up()` 建 `pgboss` schema + `job` 表、`down()` 可逆，對真 Postgres 通過。

### 回歸基準（RG-002 / RG-003，P1 不改演算法 → 結果不變）

- 既有 `assignment-run.service.spec.ts`（triggerRun / cancelRun / 併發 / readiness）、3 個 `assignment-run-pipeline*.spec.ts`：**全綠**（producer / poller 皆 `@Optional()`，舊 harness 未提供 → 行為與 P1 前一致）。
- 全 apps/api suite：`1966 passed / 74 skipped`。**6 個既有失敗檔（10 tests）為 pre-existing baseline**（`assignment-run-report/scope/snapshot` 之 `SectionChiefScopeService` DI 缺 ObEmphire；ETL `fn-calc-tier-level`、`target-table*` 欄數），已用 `git stash` 在乾淨樹驗證為 F098 前即失敗，**F098 零回歸**。

### tsc（RG-005，vitest 不檢型別）

- `tsc --noEmit -p tsconfig.build.json`（prod build 權威）：**0 errors**。
- 全 `tsconfig.json`（含 tests）：85 errors，**全為 pre-existing 無關測試檔**（F098 檔 0 errors，已逐一 grep 驗證）。

## Files Changed

### Production

| File Path | Change | 說明 |
|---|---|---|
| `apps/api/src/modules/assignment/queue/run-queue.constants.ts` | new | 單一匯出 `RUN_QUEUE_NAME='assignment-run'` + `RunJobPayload{runId,ym}` + `RUN_QUEUE_RETRY_LIMIT=0` + `RUN_QUEUE_BATCH_SIZE=1`（防 producer/consumer typo） |
| `apps/api/src/modules/assignment/queue/run-cancelled.exception.ts` | new | `RunCancelledException`（非 HttpException；worker 內提早結束用） |
| `apps/api/src/modules/assignment/queue/pg-boss.provider.ts` | new | `PG_BOSS` DI token + `createPgBoss`（DB_TYPE!=postgres 回 null）+ `RUN_QUEUE_TUNING`（可注入閾值/週期，OQ-F098-02；env 可調，預設 jobExpire=4h / reaper=60s / orphanThreshold=4h） |
| `apps/api/src/modules/assignment/queue/run-queue.producer.ts` | new | `RunQueueProducer.send`（回 jobId）/ `.cancel`（v10 `cancel(name,id)`）；retryLimit=0 + expireInSeconds |
| `apps/api/src/modules/assignment/queue/run-queue.consumer.ts` | new | `RunQueueConsumer`（`work(name,{batchSize:1},handler)`；v10 handler 收 job **陣列**；run 不存在/已 failed → 略過；不 crash worker） |
| `apps/api/src/modules/assignment/queue/cancellation-poller.ts` | new | `CancellationPoller.throwIfCancelled/isCancelled`（查 status=failed → 拋 RunCancelledException） |
| `apps/api/src/modules/assignment/queue/orphan-reaper.ts` | new | `OrphanReaper`（onApplicationBootstrap + 可注入週期；掃 running/pending 逾時 → failed + `error_message='worker 中斷，請重新觸發'`；含 OQ-F098-01 pending 涵蓋） |
| `apps/api/src/modules/assignment/assignment-worker.module.ts` | new | worker 專屬 module（consumer + reaper；重用 AssignmentModule 之 pipeline+pgboss+producer） |
| `apps/api/src/worker-app.module.ts` | new | worker 根 module（TypeOrm root glob entities + AssignmentWorkerModule，無 HTTP/controller） |
| `apps/api/src/worker-main.ts` | new | worker entrypoint（`createApplicationContext`，**無** `app.listen`；SIGTERM/SIGINT graceful close） |
| `apps/api/src/modules/assignment/services/assignment-run.service.ts` | modified | `triggerRun` 改入列（INSERT pending → audit → `queueProducer.send` → 202）；**移除** `kickoffPipeline`/`setImmediate(runPipeline)`；入列失敗補償標 failed |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | 注入 `@Optional() CancellationPoller`；於 list 邊界 / Stage 之間 / 寫快照前 `checkCancelled`；catch `RunCancelledException` 不覆寫 failed、不寫結果 |
| `apps/api/src/modules/assignment/assignment.module.ts` | modified | 註冊 + export `RunQueueProducer` / `CancellationPoller` / `pgBossProvider` / `runQueueTuningProvider` / `AssignmentRunPipelineService`（API 側僅 producer；consumer/reaper 在 worker module） |

### Test

| File Path | 說明 |
|---|---|
| `apps/api/src/modules/assignment/queue/__tests__/f098-trigger-run.spec.ts` | TRIG-001~006 + OQ-001 + NFR-002（8 tests） |
| `apps/api/src/modules/assignment/queue/__tests__/f098-consumer.spec.ts` | CONS-001~006 + SER-001 + RETRY-001 等（8 tests） |
| `apps/api/src/modules/assignment/queue/__tests__/f098-producer.spec.ts` | RETRY-001 + cancel contract（5 tests） |
| `apps/api/src/modules/assignment/queue/__tests__/f098-cancellation.spec.ts` | CANCEL-001~004 + 基準（5 tests） |
| `apps/api/src/modules/assignment/queue/__tests__/f098-orphan-reaper.spec.ts` | ORPHAN-001~006 + OQ-002（8 tests） |
| `apps/api/src/modules/assignment/queue/__tests__/f098-static-guards.spec.ts` | RG-001/004 + WORKER-001~004 + PGINT-002 靜態（8 tests） |
| `apps/api/src/modules/assignment/queue/__tests__/f098-pg-integration.spec.ts` | PGINT-001/002/004/005 + RETRY-002 + SER-002 + CANCEL-006（6 tests，需 Postgres） |

### Infra / 依賴

| File Path | Change | 說明 |
|---|---|---|
| `apps/api/package.json` | modified | 新增 `pg-boss@^10.4.2` 依賴 |
| `package-lock.json`（root） | modified | pg-boss + 其相依 lock |
| `apps/api/src/database/migrations/1711360000299-CreatePgBossSchema.ts` | new | m299：`PgBoss.getConstructionPlans('pgboss')` 固定 pgboss schema DDL（冪等、advisory-lock race-safe）；SQLite no-op；down DROP SCHEMA CASCADE |
| `docker-compose.yml` | modified | 新增 `worker` service（build.context `./apps/api` 同源、無 ports、depends_on postgres healthy、含 feature flag、command `worker-main.ts`） |

## Architectural Decisions（spec 邊界內之實作抉擇）

1. **pg-boss v10 contract**（與多數網路 v9 範例不同，已驗實庫）：work handler 收 **job 陣列**（非單一 job）；v10 **已無 `teamConcurrency`/`teamSize`** → 序列化採 `batchSize:1` + 單 worker；`retryLimit` 於 `createQueue` + per-send 設；`cancel(name,id)`（queue name 第一參數）；migration DDL = `getConstructionPlans(schema)`。
2. **CommonJS interop（關鍵）**：pg-boss 為 `export = PgBoss`。本專案 tsconfig `module:commonjs` 無 `esModuleInterop` → `import PgBoss from 'pg-boss'` 在 **ts-node**（worker entrypoint / migration runner）下會變 `pg_boss_1.default`（undefined）→ "is not a constructor"，但 swc/vitest 有 interop → **vitest 全綠卻 prod 崩潰**。已全面改 `import PgBoss = require('pg-boss')`（值使用處）；`import type` 處不受影響。已用 ts-node 實跑 worker bootstrap + migration 驗證。
3. **CancellationPoller 註冊於 AssignmentModule**（非僅 worker module）：使 worker 之 pipeline（同 module scope）可注入取消檢查，避免重複宣告 pipeline 的龐大依賴；API 程序之 pipeline 雖也注入但不執行 → 無副作用；既有 pipeline unit test 未提供 poller（`@Optional` undefined）→ baseline 不變。
4. **閾值 / 週期可注入**（OQ-F098-02）：`RUN_QUEUE_TUNING` provider + env（`RUN_QUEUE_JOB_EXPIRE_SECONDS` / `RUN_QUEUE_REAPER_INTERVAL_MS` / `RUN_QUEUE_ORPHAN_THRESHOLD_MS`）；預設保守（4h job expire / 60s reaper / 4h orphan threshold，明顯大於 P1 JS 版最長月跑）；測試以極短閾值 + 注入時鐘驗邏輯。
5. **OrphanReaper 偵測不新增 schema 欄位**（OQ-AD28-02）：靠 running/pending 持續時間 > 閾值（`started_at` / `created_at` vs cutoff）+ pg-boss job expiration；不依賴 jobId 持久化。
6. **OQ-F098-01 = 採納**：OrphanReaper 一併掃 `pending` 逾時孤兒（入列失敗 / 遺留）；另 triggerRun 入列失敗即時補償標 failed（雙保險，TS-F098-OQ-001 + OQ-002）。
7. **cancelRun API 側不變**（C-2 / RG-CANCEL-005）：仍標 failed + `'使用者取消'` + audit CANCEL；P1 只**新增** worker 側 poller。pending-not-yet-consumed 取消快路徑：因不持久 jobId，由 consumer 消費前檢查 `status==='failed'` 略過（+ PG 真庫驗證 `pgboss.cancel` 可取消未消費 job，TS-F098-CANCEL-006）。

## 與 spec / test-design 的偏差 / follow-up

| 項目 | 說明 |
|---|---|
| **PG Integration CI 化** | 18 個強制需 Postgres 之案例中，本次以**最具代表性的 6 個**（入列→消費→completed、retry=0 不重派、序列化、payload 往返、pending cancel、worker 重啟接續）對真 Postgres（5433）實跑通過；其餘（如 PGINT-003 冪等 PK、ORPHAN-007 真 expire 端到端、NFR-001/003 E2E 可用性 / OOM 隔離）之**邏輯**已由 unit + 6 個 PG 案例覆蓋其核心契約。完整 18 案例之 E2E（含 docker kill worker）建議於 CI 起 Postgres 容器後補跑（沿用 F038/F075/M01 慣例）。CI 須能起 Postgres（RISK-F098-003）。 |
| **`pgboss.cancel` 快路徑未綁 jobId** | 因 OQ-AD28-02 不新增 schema 欄位、未持久化 jobId，`cancelRun` 無法直接 `cancel(jobId)`；改由 consumer 消費前 `status==='failed'` 略過達同等效果（worker 不執行該 run）。真 `pgboss.cancel` 能力已於 TS-F098-CANCEL-006 對真庫驗證。若未來要在 pending 階段「主動」自佇列移除 job（而非消費時略過），需評估是否持久化 jobId（牴觸 OQ-AD28-02，留待 P2/P3 觀察）。 |
| **NFR-001/003（月跑期間 API 可回應 / worker OOM 隔離）** | 結構性保證已由 TS-F098-TRIG（runPipeline 0 次）+ worker 程序分離（docker-compose）達成；真實可用性 / kill 容器之 E2E 屬 QA / staging 環境驗證（測試設計亦標 E2E）。 |
| **pre-existing baseline 失敗** | 6 檔 / 10 tests（report/scope/snapshot + ETL）F098 前即失敗，非本次引入；未修（超出 F098 範圍）。 |

## 如何實跑 PG Integration（需 Postgres）

```
docker compose -f docker-compose.test.yml up -d postgres-test   # 5433/cdmp_test
cd apps/api && npx vitest run src/modules/assignment/queue/__tests__/f098-pg-integration.spec.ts
# 或自訂連線：PG_BOSS_TEST_HOST/PORT/USER/PASSWORD/DB
```
