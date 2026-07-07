---
type: implementation-log
feature_id: AD-E07-40-P2b
feature_name: MSSQL 全面遷移 P2b — Producer/Consumer 接線 + 輪詢 Loop + processPayload 共用
status: complete
last_updated: 2026-07-07
---

# AD-E07-40 P2b：Producer/Consumer 接線 + 輪詢 Loop + processPayload 共用 — Implementation Log

## 摘要

依 `AD-E07-40-P2b-test.md`（44 案例，8 群組）落地 P2 之 **P2b 切片**：把 P2a 已完成的
`MssqlQueueService`（黑盒依賴，本輪不重寫）接線至 `RunQueueProducer` / `RunQueueConsumer`，
新增 mssql 輪詢 loop 與 driver-agnostic 的共用 `processPayload`。pg-boss（postgres）路徑於
cutover 前完全不變。**未碰 P2c**（expire sweep 整合）與 `MssqlQueueService` 本身。

- **fake/unit 34 案例**（`ad-e07-40-p2b.spec.ts`）：全綠、CI 恆跑（免真實連線）。
- **E2E 5 案例**（`ad-e07-40-p2b.mssql.spec.ts`）：對**真實 MSSQL 容器**全綠（本機 1433 可達，實跑）。
- `tsc --noEmit -p tsconfig.build.json` 乾淨（exit 0）。
- 回歸：F098 既有套件除 1 筆**與本輪無關的 pre-existing 失敗**外全綠；`OrphanReaper` / `CancellationPoller` 零改動。

## Test Results Summary

### 一、DISPATCH（🔴 driver 三分支 MUST-FIX 守門，fake/unit）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2B-DISPATCH-001 | mssql → send 呼叫 mssqlQueue.send，不誤觸 boss null throw | PASS |
| TS-MSSQL-P2B-DISPATCH-002 | mssql → cancel 呼叫 mssqlQueue.cancel，不誤觸 boss null 靜默 return | PASS |
| TS-MSSQL-P2B-DISPATCH-003 | mssql → onModuleInit 啟動輪詢，不呼叫 boss.work、不 warn | PASS |
| TS-MSSQL-P2B-DISPATCH-004 | postgres → 走 boss 路徑，mssqlQueue 完全不被呼叫 | PASS |
| TS-MSSQL-P2B-DISPATCH-005 | sqlite（boss=null 無 mssqlQueue）→ 既有防呆保留，不誤判 mssql | PASS |
| TS-MSSQL-P2B-CONFIG-006 | assignment.module.ts providers 含 MssqlQueueService（API 程序） | PASS |

### 二、PROD（Producer mssql 分支，fake/unit）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2B-PROD-001 | send 參數 = (RUN_QUEUE_NAME, payload, 0) | PASS |
| TS-MSSQL-P2B-PROD-002 | send 回傳 jobId（string），簽章不變 | PASS |
| TS-MSSQL-P2B-PROD-003 | cancel 呼叫 mssqlQueue.cancel(jobId) | PASS |
| TS-MSSQL-P2B-PROD-004 | cancel 對已消費 job 由底層吞錯，producer 不誤判 | PASS |
| TS-MSSQL-P2B-PROD-005 | mssql 分支引用 RUN_QUEUE_NAME 常數，不硬寫字面 | PASS |

### 三、POLL（輪詢 loop + reentrancy + 生命週期，fake timer）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2B-POLL-001 | postgres 分支維持既有（boss.work 1 次，不啟動 pollTimer） | PASS |
| TS-MSSQL-P2B-POLL-002 | mssql 分支啟動輪詢，不呼叫 boss.work | PASS |
| TS-MSSQL-P2B-POLL-003 | 輪詢間隔 = tuning.pollIntervalMs（注入 500 / 預設 2000） | PASS |
| TS-MSSQL-P2B-POLL-004 | claimNext=null → 不 processPayload、不 complete | PASS |
| TS-MSSQL-P2B-POLL-005 | claimNext=一筆 → 先 processPayload 再 complete（順序斷言） | PASS |
| TS-MSSQL-P2B-POLL-006 | 業務失敗（pipeline 拋錯，內部吞）→ complete 仍呼叫、pollOnce 不拋 | PASS |
| TS-MSSQL-P2B-POLL-007 | 🔴 reentrancy guard：in-flight 期間下一輪 tick 被擋（claimNext 恰 1 次） | PASS |
| TS-MSSQL-P2B-POLL-008 | 單輪例外（claimNext reject）→ 被 catch、guard 重置、下一輪仍觸發 | PASS |
| TS-MSSQL-P2B-POLL-009 | 🔴 onModuleDestroy 清 pollTimer，destroy 後 claimNext 不再呼叫 | PASS |
| TS-MSSQL-P2B-POLL-010 | Meta：SIGTERM 優雅關閉由 worker-main + onModuleDestroy 組合滿足 | PASS |

### 四、PAYLOAD（🔴 processPayload 共用，fake/unit）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2B-PAYLOAD-001 | 🔴 pg-boss（handleJobs）與 mssql（pollOnce）呼叫同一 processPayload（spy=2） | PASS |
| TS-MSSQL-P2B-PAYLOAD-002 | 靜態：runPipeline / 取消檢查特徵字串各恰 1 次（單一方法） | PASS |
| TS-MSSQL-P2B-PAYLOAD-003 | run 不存在 → 記 log、不拋、不呼叫 pipeline | PASS |
| TS-MSSQL-P2B-PAYLOAD-004 | run.status===failed → 略過 pipeline | PASS |
| TS-MSSQL-P2B-PAYLOAD-005 | 正常路徑 → runPipeline(runId, ym) | PASS |
| TS-MSSQL-P2B-PAYLOAD-006 | pipeline 拋錯 → try/catch 吞、不向上拋 | PASS |
| TS-MSSQL-P2B-PAYLOAD-007 | pg-boss 轉接層從 job.data/job.id 取參數 | PASS |
| TS-MSSQL-P2B-PAYLOAD-008 | 🔴 mssql 轉接層 JSON.parse(claimed.payload) 還原為物件後才傳入 | PASS |

### 五、E2E（真實 MSSQL，佇列層 drain）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2B-E2E-001 | 🔴 send → 輪詢撿到 → stub pipeline → status=completed、queue_job=completed | PASS（真 MSSQL） |
| TS-MSSQL-P2B-E2E-002 | 業務失敗 → status=failed、queue_job.state=completed（retry=0 不卡） | PASS（真 MSSQL） |
| TS-MSSQL-P2B-E2E-003 | 🔴 連續 send 3 筆 → 單 worker 逐筆 drain 全部至終態 | PASS（真 MSSQL） |
| TS-MSSQL-P2B-E2E-004 | 量測性：send→pipeline 延遲（實測約 160ms ≈ 一個 pollIntervalMs=150ms 週期） | PASS（真 MSSQL） |
| TS-MSSQL-P2B-E2E-005 | cancel-before-consume → worker 不執行 pipeline、queue_job=cancelled | PASS（真 MSSQL） |

### 六、ZERO / 七、STATIC / 八、REG
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-MSSQL-P2B-ZERO-001 | f098-orphan-reaper.spec.ts 原樣通過（測試檔零改動） | PASS |
| TS-MSSQL-P2B-ZERO-002 | f098-cancellation.spec.ts 原樣通過（測試檔零改動） | PASS |
| TS-MSSQL-P2B-ZERO-003 | orphan-reaper.ts / cancellation-poller.ts 無 DB_TYPE/mssqlQueue/queue_job 等新增 | PASS |
| TS-MSSQL-P2B-STATIC-001 | 命名鎖定 startMssqlPolling/pollOnce/processPayload/pollTimer/polling | PASS |
| TS-MSSQL-P2B-STATIC-002 | READPAST/UPDLOCK/ROWLOCK 於 src/ 僅命中 mssql-queue.service.ts 一處 | PASS |
| TS-MSSQL-P2B-STATIC-003 | RunQueueTuning.pollIntervalMs 存在 + env 覆蓋 + fallback 2000 | PASS |
| TS-MSSQL-P2B-REG-001 | tsc --noEmit -p tsconfig.build.json 乾淨 | PASS（exit 0） |
| TS-MSSQL-P2B-REG-002 | f098-producer/consumer 原樣通過（黑箱契約不變） | PASS（8+8） |
| TS-MSSQL-P2B-REG-003 | sqlite 既有套件不受影響 | PASS |
| TS-MSSQL-P2B-REG-004 | f098-static-guards（含 WORKER-004/004b）不因新增 MssqlQueueService 破壞 | PASS（見下註） |

> **REG-004 補充**：`f098-static-guards.spec.ts` 8 案例中 7 綠、1 紅（`TS-F098-PGINT-002`）。該紅燈為
> **與本輪完全無關之 pre-existing 失敗**：它斷言 `database/migrations/1711360000299-CreatePgBossSchema.ts`
> 存在，但該 migration 檔早於本輪即已從 repo 移除（`git ls-files` 確認 HEAD 未追蹤；本輪未改 migrations 目錄
> 亦未改該 spec）。REG-004 真正關切之 `TS-F098-WORKER-004`（斷言 assignment.module 不含
> `RunQueueConsumer`/`OrphanReaper`）**通過** — 新增之 `MssqlQueueService` 未誤觸該負向斷言。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/queue/pg-boss.provider.ts` | modified | `RunQueueTuning` 新增 `pollIntervalMs: number`；`DEFAULT_RUN_QUEUE_TUNING` 補 `Number(process.env.RUN_QUEUE_POLL_INTERVAL_MS) \|\| 2000`。postgres 建構邏輯不變。 |
| `apps/api/src/modules/assignment/queue/run-queue.producer.ts` | modified | `send`/`cancel` 各加 mssql 分支（先於 `!boss` 防呆）；新增 `driverIsMssql` getter（讀 DB_TYPE）+ 注入 `@Optional ConfigService` / `@Optional MssqlQueueService`。 |
| `apps/api/src/modules/assignment/queue/run-queue.consumer.ts` | modified | `onModuleInit` driver 三分支（mssql→`startMssqlPolling`；pg→`boss.work` 不變）；新增 `pollTimer`/`polling`/`startMssqlPolling`/`pollOnce`/`processPayload`；`handleOne` 變薄轉接層；`OnModuleDestroy` 清 timer。 |
| `apps/api/src/modules/assignment/assignment.module.ts` | modified | providers + exports 加入 `MssqlQueueService`（CONFIG-006 MUST-FIX，API 程序 producer mssql 分支所需）。 |
| `apps/api/src/modules/assignment/assignment-worker.module.ts` | modified | providers 加入 `MssqlQueueService`（AD §4.2，worker consumer mssql 分支所需）。 |
| `apps/api/src/modules/assignment/queue/__tests__/ad-e07-40-p2b.spec.ts` | new | fake/unit 34 案例（DISPATCH/PROD/POLL/PAYLOAD/STATIC + ZERO-003），fake MssqlQueueService + fake ConfigService + `vi.useFakeTimers()`。 |
| `apps/api/src/modules/assignment/queue/__tests__/ad-e07-40-p2b.mssql.spec.ts` | new | E2E 5 案例，真實 `RunQueueProducer`/`RunQueueConsumer`/`MssqlQueueService(ds)` + pipeline stub，schema `p2b_e2e`。 |

## Architectural Decisions（spec 邊界內之實作選擇）

### AD-1：driver 判定機制 = `DB_TYPE`（ConfigService，process.env fallback），非「mssqlQueue 是否注入」
測試設計 §0.3 授權 tdd 決定判定機制並警示「二元 gate 陷阱」。採 `driverIsMssql` getter：
`this.config?.get('DB_TYPE') ?? process.env.DB_TYPE === 'mssql'`（比照 `createPgBoss` 既有寫法）。
**為何不能用「mssqlQueue 是否被注入」判定**：`MssqlQueueService` 已於 `assignment.module` /
`assignment-worker.module` **無條件註冊**（所有 driver 皆建立此 provider，postgres 上為無害空表依賴），
故「mssqlQueue 存在」在 postgres 環境同樣為真、不具鑑別力。唯有顯式 `DB_TYPE` 判定能正確三分支，
且先於既有 `!this.boss` 防呆（mssql 下 boss 必為 null，與 sqlite 訊號相同 — 即 §0.3 之核心陷阱）。

### AD-2：`processPayload(jobId, payload: RunJobPayload)` 為唯一業務邏輯實作（I-MSSQL-QUEUE-PAYLOAD-UNITY-01）
`handleOne`（pg-boss）薄轉接層取 `job.id`/`job.data`；`pollOnce`（mssql）薄轉接層
`JSON.parse(claimed.payload)`（🔴 PAYLOAD-008：mssql payload 為 JSON 字串，pg-boss `job.data` 已解析
— 兩路徑唯一資料形狀差異）。兩者呼叫同一 `processPayload`。`handleJobs` public 簽章不變（REG-002 黑箱契約）。

### AD-3：`pollOnce` 之 `try { processPayload } finally { complete }`（retry=0 語意）
`complete` 於 `finally` 保證執行，無論業務成功/失敗一律 completed（佇列層不因業務失敗卡在 active）。
`processPayload` 內部 try/catch 已吞 pipeline 例外，故正常情況 pollOnce 不 reject；輪詢 loop 之
`setInterval` 回呼另加 `.catch(log).finally(polling=false)` 為第二層保護（POLL-008：claimNext 本身 reject 時）。

### AD-4：MssqlQueueService 於 API module 亦註冊（補 AD §4.2 文件缺口）
AD §4.2 檔案改動清單僅列 `assignment-worker.module.ts`，但 `RunQueueProducer`（send/cancel mssql 分支
需 `MssqlQueueService`）註冊於 `assignment.module.ts`（API 程序）。故 API module providers/exports 亦補
`MssqlQueueService`（CONFIG-006 守門）；worker module 另行顯式註冊，語意明確。

## 實作偏差（Deviations）

### D-P2B-01：E2E waitFor 改以 queue_job 狀態為主鍵（修測試 race，非產品 bug）
初版 E2E-001/002/003 以 `assignment_run.status` 為 waitFor 主鍵，並緊接斷言 `queue_job.state==='completed'`。
併跑其他 `.mssql.spec.ts`（共享 MSSQL 容器）時 E2E-002 偶發 `expected 'active' to be 'completed'`：
`processPayload` 先推進 run status，`pollOnce` 之 `finally { complete }` 才把 job 轉 completed —
兩者間有極短窗，測試在 complete 尚未執行前即抽樣 job state。**產品行為正確**（complete 嚴格晚於 status 推進）。
修正：waitFor 改 key on `queue_job.state==='completed'`（佇列層最後動作）→ 一旦成立，run status 必已落定，
再斷言 run status。此為測試同步問題之忠實修正，非放寬驗收。

### D-P2B-02：E2E waitFor 逾時放寬（20s/40s）+ 吞瞬時查詢錯誤
併跑下共享 MSSQL 容器之 CPU/連線競爭會拖慢 claim/處理（既有 pg/mssql shared-DB parallel 慣例）。
`testTimeout` 沿用 120s；waitFor 逾時放寬至 20s（drain 40s）並 try/catch 吞瞬時查詢錯誤續輪詢，
避免併跑假性失敗。單跑（隔離）5/5 綠、併跑（4 個 assignment mssql spec 同跑）亦 5/5 綠、重跑穩定。

## Blocking Issues

無。P2b DoD #1~#4 全數達成：
- #1 send 回 jobId / cancel 吞錯 / processPayload 對 status==='failed' 略過 / pipeline 拋錯不崩 — 於 mssql 分支重新驗證。
- #2 OrphanReaper / CancellationPoller 既有測試原樣通過（零改動）。
- #3 端對端 `DB_TYPE=mssql` 觸發 → worker 輪詢撿到 → pipeline → assignment_run.status 推進 completed/failed（E2E-001/002/003 對真 MSSQL 實跑通過）。
- #4 pollTimer 正確 clear、不留孤兒 interval（POLL-009 + worker-main SIGTERM handler 未變）。

## 明確排除（交後續切片）
- P2c：expire sweep 定時掛載整合、雙層回收一致性、F098 全套件於 mssql 分支最終整體重跑。
- `MssqlQueueService` 五操作本身正確性（P2a 已完成，59/59 綠，本輪視為黑盒依賴）。
