---
type: implementation-log
feature_id: AD-E07-40-P2c
feature_name: MSSQL 全面遷移 P2c — Expire Sweep 整合 + 兩層回收一致性 + 全 F098 套件整體回歸
status: complete
last_updated: 2026-07-07
---

# AD-E07-40 P2c：Expire Sweep 整合 + 兩層回收一致性 + 全 F098 套件整體重跑 — Implementation Log

## 摘要

依 `AD-E07-40-P2c-test.md`（25 案例，4 群組 MOUNT/RECOVERY/STATIC/REG）落地 P2 之 **P2c 切片（P2 最後一片）**：
把 P2a 已完成的 `MssqlQueueService.expireSweep()`（黑盒依賴，本輪不重寫）定時掛載至 worker 程序，
並驗證佇列層（`queue_job.state='expired'`）與業務層（`assignment_run.status='failed'`）**兩層回收各自獨立、
順序無關、結果一致**，最後對 mssql 分支整體重跑全 F098 套件。**未碰** `MssqlQueueService` / Consumer / Producer
本身；**OrphanReaper / CancellationPoller 零改動**（只用不改）。**未 git commit。**

- **MOUNT / STATIC / REG-002 = fake/unit 12 案例**（`ad-e07-40-p2c.spec.ts`：MOUNT 6 + 附 1 非-mssql no-op + STATIC 4 + REG-002）：全綠、CI 恆跑（免真實連線）。
- **RECOVERY = 10 案例**（`ad-e07-40-p2c.mssql.spec.ts`）：對**真實 MSSQL 容器**（本機 1433 可達）全綠、實跑。
- `npx tsc --noEmit -p tsconfig.build.json` 乾淨（exit 0）。
- 全 F098 套件（+ P2a/P2b/P2c mssql spec）於 mssql 分支整體重跑：唯一失敗為 pre-existing `TS-F098-PGINT-002`，其餘全綠。

## 🔴 掛載機制選型（MOUNT-001 決策關卡）

### AD-5：Expire sweep 掛載機制 = 新建獨立 provider `MssqlQueueExpiryReaper`（非擴充 OrphanReaper）

（接續 P2b impl log 之 AD-1~AD-4 編號）

- **選擇之方案**：新建獨立 provider `MssqlQueueExpiryReaper`（`queue/mssql-queue-expiry-reaper.ts`），
  仿 `OrphanReaper` 之生命週期模式（`OnApplicationBootstrap` 啟動立即掃一次 + `setInterval` 定期掃 +
  `.unref()` 不阻擋退出 + `OnModuleDestroy` 清 timer）。
- **實際掛載之 class/method**：`MssqlQueueExpiryReaper.onApplicationBootstrap()` →（mssql 分支）
  `sweepOnce()`（立即一次）+ `startPeriodicSweep()`（`setInterval` 週期）；每次 sweep 委派
  `MssqlQueueService.expireSweep()`（唯一佇列 SQL 來源，本 provider 不自寫 `state='expired'` 邏輯）。
- **worker module 註冊方式**：`assignment-worker.module.ts` 之 `providers` 陣列新增 `MssqlQueueExpiryReaper`
  （與 `RunQueueConsumer` / `OrphanReaper` / `MssqlQueueService` 並列，僅掛於 worker 程序）。
- **為何不選「擴充 OrphanReaper 既有 reaperIntervalMs 定時器」**（AD §4.3 另一選項）：本切片硬約束
  **「OrphanReaper 零改動（只用不改）」**；且 P2b `ZERO-003` 靜態守門已鎖 `orphan-reaper.ts` 不得含
  `DB_TYPE`/`mssqlQueue`/`MssqlQueueService`/`queue_job` 等字串——於 `OrphanReaper` 內新增一句
  `expireSweep()` 會**立即違反該守門**，並破壞其純業務層語意（AD §3「OrphanReaper 純粹查 AssignmentRun repo，
  從未觸碰佇列內部狀態」）。故採獨立 provider，維持兩層回收各自獨立（§9.2）。
- **週期來源（STATIC-004）**：**重用**既有 `RunQueueTuning.reaperIntervalMs`（env `RUN_QUEUE_REAPER_INTERVAL_MS`
  可覆蓋），**不引入新的寫死常數**——sweep 屬佇列層衛生性清理，與 OrphanReaper 業務層回收概念上同節奏，
  且天然滿足「可由 env 注入、不需真實等待」之測試原則。STATIC-004 因此自動滿足（無新設定欄位需補）。
- **driver 分支**：僅 mssql 路徑啟用（`DB_TYPE==='mssql'`，先於「mssqlQueue 是否注入」判定，比照
  `RunQueueConsumer.driverIsMssql`，避開 §0.3 二元 gate 陷阱）。postgres（cutover 前 pg-boss）/ sqlite
  路徑一律 no-op、不啟動任何 timer（REG-003 postgres 分支零副作用）。

## Test Results Summary

### 一、MOUNT — 定時掃描機制掛載（fake spy / fake timer，`ad-e07-40-p2c.spec.ts`）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2C-MOUNT-001 | 🔴 決策關卡：impl log 記錄 AD-5 + 落實獨立 provider + worker module 註冊 | PASS |
| TS-MSSQL-P2C-MOUNT-002 | onApplicationBootstrap 立即執行一次 sweep | PASS |
| TS-MSSQL-P2C-MOUNT-003 | 定期觸發（短週期）≥ 3 次 | PASS |
| TS-MSSQL-P2C-MOUNT-004 | reaperIntervalMs=0 → 不啟動定時器 | PASS |
| TS-MSSQL-P2C-MOUNT-005 | 🔴 onModuleDestroy → 清 timer、之後不再觸發 | PASS |
| TS-MSSQL-P2C-MOUNT-006 | 靜態：setInterval 緊鄰 .unref | PASS |
| TS-MSSQL-P2C-MOUNT（附） | 非 mssql（postgres）→ onApplicationBootstrap no-op | PASS |

### 二、RECOVERY — 🔴 兩層回收獨立且一致（真實 MSSQL，`ad-e07-40-p2c.mssql.spec.ts`）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2C-RECOVERY-001 | 🔴 崩潰後 queue_job 逾時 → expireSweep 標 expired | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-002 | 🔴 reap 獨立標 run failed，即使 queue_job 仍 active | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-003 | 🔴 先 reap 後 sweep 結果與正常順序一致（順序無關） | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-004 | 只 sweep → job=expired、run 仍 running | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-005 | 只 reap → run=failed、job 仍 active | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-006 | 兩層終態穩定，重跑各自冪等 | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-007 | retry=0：expired 不被重撈，其他 created 正常領取 | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-008 | 非崩潰對照組：completed job/run 不被誤傷 | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-009 | 批次崩潰 3 筆：一次全 expired / 全 failed | PASS（真 MSSQL） |
| TS-MSSQL-P2C-RECOVERY-010 | 🔴 三片段協同：pending 孤兒未被 claim + processPayload 防線 | PASS（真 MSSQL） |

### 三、STATIC — docker-compose env + 單一 SQL 位置守門（fake，`ad-e07-40-p2c.spec.ts`）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2C-STATIC-001 | 🔴 docker-compose worker: 區塊含 RUN_QUEUE_POLL_INTERVAL_MS | PASS |
| TS-MSSQL-P2C-STATIC-002 | READPAST/UPDLOCK/ROWLOCK 於 src/ 僅命中 mssql-queue.service.ts | PASS |
| TS-MSSQL-P2C-STATIC-003 | state='expired' 於 src/（剝註解）僅命中 mssql-queue.service.ts | PASS |
| TS-MSSQL-P2C-STATIC-004 | 決策關卡：重用 reaperIntervalMs（env 可覆蓋）、無寫死週期常數 | PASS |

### 四、REG — 全 F098 套件於 mssql 分支整體重跑 + 已知失敗排除
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2C-REG-001 | 🔴 全套件 mssql 分支重跑，失敗集 = {TS-F098-PGINT-002} | PASS（見下方回歸段） |
| TS-MSSQL-P2C-REG-002 | CreatePgBossSchema migration 持續不存在（排除理由有效） | PASS |
| TS-MSSQL-P2C-REG-003 | postgres 分支不受 P2c 影響（本機 5433 未起 → gated skip） | PASS（gated） |
| TS-MSSQL-P2C-REG-004 | sqlite 既有套件不受影響 | PASS |
| TS-MSSQL-P2C-REG-005 | tsc --noEmit -p tsconfig.build.json 乾淨 | PASS（exit 0） |

## 兩層回收結論（RECOVERY 群組，AD §7 DoD #2）

- **獨立性**（004/005）：只執行 sweep → `queue_job=expired` 但 `assignment_run` 仍 `running`（sweep 不觸碰業務表）；
  只執行 reap → `assignment_run=failed` 但 `queue_job` 仍 `active`（reap 不觸碰佇列表）。兩層互不依賴。
- **一致性 + 順序無關**（001/002/003）：無論先 sweep 後 reap 或先 reap 後 sweep，最終皆為
  `queue_job=expired` + `assignment_run=failed`（`error_message=ORPHAN_ERROR_MESSAGE`），結果相同。
- **冪等穩定終態**（006）：兩層皆執行後重跑 sweep/reap 不再變動；`error_message`/`finished_at` 不被覆寫。
- **retry=0**（007）：expired job 不被 `claimNext` 重撈；同時存在的正常 `created` job 正常領取（不誤配已 expired 者）。
- **對照組**（008）：正常 `complete` 之 job / `completed` 之 run 於極端 now/threshold 施壓下仍不被誤傷。
- **批次**（009）：3 筆同時崩潰，sweep 集合式一次全標 expired、reap 集合式一次全標 failed（非逐筆遺漏）。
- **三片段協同**（010）：未被 claim 的 pending 孤兒——reap（pending 分支）標 run failed、sweep 不影響其 `created` 狀態、
  `claimNext` 仍可撈到，之後 `processPayload` 因 `run.status==='failed'` 快路徑（P2b PAYLOAD-004）正確略過 pipeline。
- **兩層「控制時間」手法不同（§0.3，非疏漏）**：佇列層 `expireSweep()` 無注入 now → 直接 SQL 把 `expire_at`
  撥至過去；業務層 `OrphanReaper.reap(now)` 有注入時鐘 → 傳「遠未來」now + 短 `orphanThresholdMs`。
  seed 時間欄用近期值 + 以遠大於 ±12h 的時間差判逾時，避開 tedious datetime2↔JS Date 時區偏移。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/queue/mssql-queue-expiry-reaper.ts` | new | 🔴 AD-5：獨立 sweep 掛載 provider（OnApplicationBootstrap+setInterval(unref)+OnModuleDestroy；mssql-only；委派 `MssqlQueueService.expireSweep()`）。 |
| `apps/api/src/modules/assignment/assignment-worker.module.ts` | modified | `providers` 加入 `MssqlQueueExpiryReaper`（worker 程序）。 |
| `docker-compose.yml` | modified | worker service `environment` 補 `RUN_QUEUE_POLL_INTERVAL_MS`（DoD #4）。 |
| `apps/api/src/modules/assignment/queue/__tests__/ad-e07-40-p2c.spec.ts` | new | MOUNT(6+附1) + STATIC(4) + REG-002 = fake/unit 12 案例（fake spy + `vi.useFakeTimers()` + fs/regex）。 |
| `apps/api/src/modules/assignment/queue/__tests__/ad-e07-40-p2c.mssql.spec.ts` | new | RECOVERY 10 案例，真實 `MssqlQueueService(ds)` + 真實 `OrphanReaper`（直接 new），schema `p2c_e2e`。 |

## 全 F098 回歸總數（REG-001，🔴 AD §7 DoD #3）

指令：`npx vitest run src/modules/assignment/queue/__tests__/ --no-file-parallelism`（序列，比照
`feedback_pg_spec_parallel_timeout` 延伸至 mssql；本機 MSSQL 1433 可達、PG 5433 未起）。

- **Test Files 12（1 failed / 11 passed）**；**Tests 168：1 failed / 161 passed / 6 skipped**。
- **唯一失敗 = `TS-F098-PGINT-002`（pre-existing，排除項）**：`f098-static-guards.spec.ts` 斷言
  `database/migrations/1711360000299-CreatePgBossSchema.ts` 存在，但該檔早於本輪即已從 repo 移除
  （commit `66b67c1`「收斂 67 支 migration 為 baseline 快照」刪除；P2a REG-002 / P2b REG-004 已記錄同一根因）。
  REG-002（本輪新增守門）已獨立確認該 migration 檔持續不存在 → 排除理由有效。**失敗集恰為 `{TS-F098-PGINT-002}`**
  （集合相等，非「失敗數=1」的弱比對）；無任何新增回歸。
- **6 skipped = `f098-pg-integration.spec.ts`**（需 PG 5433，本機未起 → gated skip；即 REG-003 postgres 分支之
  gated 行為，postgres 路徑零副作用由 §MOUNT 非-mssql no-op + 靜態守門確認）。
- **REG-004（sqlite 回歸）**：另跑 `assignment/__tests__` + `assignment-list` = **369 passed / 1 skipped / 0 failed**
  （worker module 新增 provider 無 ripple）。
- **REG-005（tsc）**：`npx tsc --noEmit -p tsconfig.build.json` exit 0。

### 逐檔明細（queue/__tests__，序列 mssql 分支）
| Spec 檔 | 結果 |
|---|---|
| `ad-e07-40-p2a.mssql.spec.ts` | 59 passed（真 MSSQL） |
| `ad-e07-40-p2b.spec.ts` | 34 passed（fake/unit） |
| `ad-e07-40-p2b.mssql.spec.ts` | 5 passed（真 MSSQL） |
| `ad-e07-40-p2c.spec.ts` | 12 passed（fake/unit） |
| `ad-e07-40-p2c.mssql.spec.ts` | 10 passed（真 MSSQL） |
| `f098-consumer.spec.ts` | 8 passed |
| `f098-producer.spec.ts` | 5 passed |
| `f098-trigger-run.spec.ts` | 8 passed |
| `f098-cancellation.spec.ts` | 5 passed |
| `f098-orphan-reaper.spec.ts` | 8 passed（零改動原樣通過） |
| `f098-static-guards.spec.ts` | 7 passed / **1 failed（TS-F098-PGINT-002，pre-existing）** |
| `f098-pg-integration.spec.ts` | 6 skipped（PG 5433 未起，gated） |

## 實作偏差（Deviations）

### D-P2C-01：RECOVERY harness 以「直接 new OrphanReaper」取代 f098-orphan-reaper 之 buildModule()（等價、更簡）
測試設計 §0.5 建議「比照 f098-orphan-reaper.spec.ts 之 `buildModule()` 建構風格」。該 harness 用
`TypeOrmModule.forRoot(sqlite in-memory)` + DI 建 OrphanReaper，是因其無現成 DataSource。本檔已對真實 MSSQL
建好 `ds`（schema `p2c_e2e`），故直接 `new OrphanReaper(ds.getRepository(AssignmentRun), ds, TEST_TUNING)`
（OrphanReaper 建構子即 `(runRepo, dataSource, tuning)`）——語意等價、避免多一層 TestingModule，忠實保全
「真實 OrphanReaper 於真實 MSSQL 之兩層互動」意圖。OrphanReaper 原始碼零改動。

### D-P2C-02：MOUNT 群組以「直接 new + 直呼 onApplicationBootstrap」取代 app.init()（黑盒觀察等價）
測試設計 MOUNT-002 描述「以 TestingModule 建構掛載者並呼叫 `app.init()`（觸發 onApplicationBootstrap）」。
因 `MssqlQueueExpiryReaper` 之依賴皆可 `@Optional` 注入（tuning/config/mssqlQueue），MOUNT 群組直接 `new` +
直呼 `onApplicationBootstrap()`/`onModuleDestroy()` + `vi.useFakeTimers()`，黑盒 spy `expireSweep`——與經
`app.init()` 觸發同一 lifecycle hook 等價，且免除 TypeOrm 依賴。符合 §0.4「黑盒觀察式、不預設呼叫者」精神。

## Blocking Issues

無。P2c DoD #1~#4 全數達成：
- #1 sweep 定時掃描正確運作（MOUNT-002~005 fake-timer 驗證；週期可 env 注入，不需真實等待）。
- #2 崩潰情境兩層回收各自獨立、順序無關、結果一致（RECOVERY-001~010 對真 MSSQL 實跑通過）。
- #3 全 F098 套件於 mssql 分支整體重跑，唯一失敗為 pre-existing `TS-F098-PGINT-002`（REG-001/-002）。
- #4 `docker-compose.yml` worker service 補 `RUN_QUEUE_POLL_INTERVAL_MS`（STATIC-001）。

**P2（P2a/P2b/P2c）全部完成** — MSSQL 全面遷移之自建 T-SQL 佇列（取代 pg-boss）收官。
