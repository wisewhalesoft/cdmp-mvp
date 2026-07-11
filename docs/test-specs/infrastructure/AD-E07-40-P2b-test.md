---
type: test-design-infrastructure
test-spec-id: AD-E07-40-P2b
feature_name: MSSQL 全面遷移 P2b — Producer/Consumer 接線 + 輪詢 Loop + processPayload 共用
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-40-mssql-p2-self-built-queue.md（§3 pg-boss 契約對齊表、§4 輪詢 loop+processPayload 共用+檔案改動清單、§5 driver-conditional 策略、§7 P2b DoD、§8 不變式）
  - /docs/specs/implementation-log/AD-E07-40-P2a-impl.md（P2a 已落地事實：MssqlQueueService 五操作 59/59 綠；D-CLAIM-01 CTE 投影修正；D-CONC-01 claim 為「單次突發 under-claim、反覆 drain 才全部領完」之固有 SKIP-LOCKED 語意，非 bug）
  - /docs/test-specs/infrastructure/AD-E07-40-P2a-test.md（P2a 測試設計；本文件 STATIC-002 延續其 STATIC-003 之單一位置守門）
  - apps/api/src/modules/assignment/queue/__tests__/f098-producer.spec.ts／f098-consumer.spec.ts／f098-static-guards.spec.ts（現行 pg-boss 路徑既有測試，本文件 DoD 要求對應行為於 mssql 分支重新驗證 + 原樣回歸）
covers: []
spec_version: "1.0"
date: 2026-07-07
last_updated: 2026-07-07
---

# AD-E07-40 P2b：MSSQL 全面遷移 — Producer/Consumer 接線 + 輪詢 Loop + processPayload 共用 — 測試設計

> 本文件覆蓋 AD-E07-40「MSSQL 全面遷移 P2（自建 T-SQL 佇列，取代 pg-boss）」之 **P2b 切片**（§3 對齊 pg-boss 契約 + §4 單一 worker 輪詢 loop / reentrancy guard / `processPayload` 共用 / 檔案改動清單 + §5 driver-conditional 策略）。
> P2 不經 spec-writer（AD-E07-40「是否需要 spec-writer」已裁定：純底層儲存/驅動置換，無新業務行為，比照 AD-E07-38 §3 D-7 先例）；本文件依 system-architect 產出之 AD-E07-40 §3/§4/§5/§7/§8 直接產出測試設計，交 tdd-implementation。
>
> **範圍**：`RunQueueProducer.send`/`cancel` mssql 分支、`RunQueueConsumer.onModuleInit` driver 分支、輪詢 loop（`startMssqlPolling`/`pollOnce`）、reentrancy guard、`OnModuleDestroy` 清 timer、`processPayload` 共用（I-MSSQL-QUEUE-PAYLOAD-UNITY-01）、端對端（真 mssql，佇列層 drain）、`OrphanReaper`/`CancellationPoller` 零改動回歸、pg-boss/sqlite 回歸。
> **明確排除**：`MssqlQueueService` 五操作本身之正確性（P2a 已完成，59/59 綠，本文件視為已驗證黑盒依賴）、expire sweep 定時掛載整合與雙層回收一致性（P2c）、F098 全套件於 mssql 分支下之最終整體重跑（P2c 收尾）。
>
> **關鍵前提（沿用 AD §0）**：佇列 claim 用純 T-SQL DML，P0 smoke 已證本機 Linux 容器可行，不受 `sp_getapplock` 之 17750 DLL 缺失影響。但**本文件刻意將測試案例分兩檔**（見 §0.2）：多數群組（DISPATCH/PROD/POLL/PAYLOAD/STATIC）為 driver 分支邏輯/Node.js timer 邏輯，**不需要真實 MSSQL 連線**即可完整驗證（比照既有 `f098-producer.spec.ts`/`f098-consumer.spec.ts` 之 fake boss 單元測試風格，改用 fake `MssqlQueueService`）；只有 E2E 群組需要真實 MSSQL 容器。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-40-mssql-p2-self-built-queue.md`（§3/§4/§5）+ `AD-E07-40-P2a-impl.md`（D-CLAIM-01/D-CONC-01 兩項實測偏差，P2b 接線時之 `claimNext`/`complete` 呼叫約定須以此為準，非 AD 原始 pseudocode）+ 既有 `f098-producer.spec.ts`/`f098-consumer.spec.ts`/`f098-static-guards.spec.ts`（沿用 fake boss 建構風格，擴充 fake `MssqlQueueService`）+ `apps/api/src/modules/assignment/queue/mssql-queue.service.ts`（P2a 已完成之五操作簽章，`claimNext` 回傳 `{jobId, payload, retryLimit} \| null`，`payload` 為 **JSON 字串**非物件） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P2b 風險段落，含 AD §4.2 檔案改動清單缺口） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」§0.2（fake/unit 群組免真實連線，CI 恆常執行；E2E 群組需 MSSQL 容器） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 gating helper + P2a schema 隔離慣例

E2E 群組沿用 `mssql-env-preload.ts`（`mssqlPortReachable()`/`restoreDbType()`/`SKIP_REASON`/`MSSQL` 連線常數），連不上 MSSQL 容器 → 整檔 `describe.skip`，不假造綠燈。E2E 群組使用獨立 schema `p2b_e2e`（不與 P2a 之 `p2a_sync`/`p2a_baseline`、P1 系列之 `dbo`/`p1a`/`p1b1`/`p1b2_sync`/`p1b3` 交集），內含 `AssignmentRun`（既有 entity，P1b1 已完成 MSSQL 型別轉換，可直接 synchronize）+ `QueueJob`（P2a 已完成）兩表。

### 0.2 兩檔分流：fake/unit（免真實連線）vs 真實 MSSQL（僅 E2E）

**設計決策（成本考量，DevOps 應知悉）**：DoD #1 原文「新增 `.mssql.spec.ts` 或擴充既有測試矩陣，視 test-designer 判斷」授權本文件自行決定分層。查證 DISPATCH/PROD/POLL/PAYLOAD 四組所驗證的行為——driver 分支呼叫哪個依賴、輪詢計時器排程、reentrancy guard、`processPayload` 共用——皆是 **Node.js 控制流程邏輯**，與 SQL Server 本身的鎖行為無關（那是 P2a 已驗證的獨立層），故比照既有 `f098-producer.spec.ts`/`f098-consumer.spec.ts` 之 fake boss 風格，改用 **fake `MssqlQueueService`**（`{ send: vi.fn(), cancel: vi.fn(), claimNext: vi.fn(), complete: vi.fn(), expireSweep: vi.fn() }`）與 `vi.useFakeTimers()`，即可完整驗證，不需要真實 MSSQL 連線、CI 恆常執行、成本最低。

| 新檔案 | 群組 | 是否需真實 MSSQL |
|---|---|---|
| `queue/__tests__/ad-e07-40-p2b.spec.ts` | 一 DISPATCH／二 PROD／三 POLL／四 PAYLOAD／七 STATIC | 否（fake `MssqlQueueService` + fake boss + `vi.useFakeTimers()`） |
| `queue/__tests__/ad-e07-40-p2b.mssql.spec.ts` | 五 E2E | 是 |
| （無新檔，重跑既有） | 六 ZERO／八 REG | REG-002/003 否；ZERO 否 |

### 0.3 🔴 Driver 分支判定機制尚未定案 — 決策關卡提醒，MUST 避開二元 gate 陷阱

AD §4/§4.2 未明確規定 `RunQueueProducer`/`RunQueueConsumer` 判斷「目前是 mssql 分支」的具體機制（可能是直接讀 `ConfigService.get('DB_TYPE')`比照 `createPgBoss` 既有寫法；也可能是依賴注入誰非 null 推斷）。**本文件刻意不預設答案**（test-designer 不決定實作細節），但依專案既有教訓（`feedback` 記憶：「為多 driver 新增第 N 個分支時，先查現行 gate 是否為二元」——`AD-E07-38-P1c` DISPATCH-001 曾抓到 `isPostgres()` 二元 gate 使新分支變死碼）明確標注一個**已查證存在、極易複製到本輪的同型陷阱**：

- `RunQueueProducer.send()` 現行程式碼：`if (!this.boss) { throw new Error(...) }`（無 else if）。
- `RunQueueProducer.cancel()` 現行程式碼：`if (!this.boss) return;`（靜默 no-op）。
- `RunQueueConsumer.onModuleInit()` 現行程式碼：`if (!this.boss) { logger.warn(...); return; }`（不註冊任何 work handler）。

**三處皆是「`boss` 為 null」二元判斷**。而 `this.boss` 在 `DB_TYPE='mssql'` 環境下**必然為 null**（`createPgBoss` 對非 postgres 一律回傳 null，pg-boss 本就不支援 MSSQL）——與現行測試環境（sqlite，未 override）判斷 `boss` 為 null 時的訊號**完全相同**。若 tdd-implementation 只在三處程式碼「內部」新增 mssql 分支邏輯而未同步把這三個既有的二元 gate 改為三分支（先判斷 mssql、再判斷 boss 是否存在），mssql 分支會被現行程式碼**直接吞掉**（send 誤拋錯／cancel 誤靜默略過／onModuleInit 誤 warn+return 不啟動輪詢），且沒有任何測試會自然失敗提示——除非測試明確 spy「呼叫了哪個依賴」而非只驗證最終回傳值。**一、DISPATCH 群組全部案例即為此陷阱之守門**，對現行未修改程式碼預期為紅燈。

### 0.4 processPayload 抽出後，既有 `f098-consumer.spec.ts` 之黑箱契約不可變

`handleJobs(jobs)` 為既有測試呼叫之 **public 介面**，不可變動簽章；`handleOne(job)` 抽出 `processPayload(jobId, payload)` 後應變成薄轉接層（取 `job.data`/`job.id` 後呼叫 `processPayload`）。若如此實作，既有 `f098-consumer.spec.ts` 全部案例**不需修改程式碼即可通過**（黑箱行為契約不變）——此為 REG-002 之驗收基準；若 tdd-implementation 發現無法在不修改既有測試斷言的情況下完成重構，應視為偏離本文件設計預期，須停下向 test-designer/architect 回報，而非默默修改既有測試斷言掩蓋落差。

### 0.5 POLL 群組 fake timer 策略

reentrancy guard（`polling` flag）與生命週期案例需要精確控制「上一輪 tick 尚未完成、下一輪 tick 已觸發」的時序，建議 `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(intervalMs)`；`claimNext` 的 fake 實作以「可外部控制何時 resolve 的 deferred promise」模擬「processPayload 仍在執行中」的窗口（例如陣列收集 resolver 函式，測試主體呼叫 `resolvers.shift()()` 決定何時放行）。逾時設定沿用既有 P1a/P2a 慣例 `vi.setConfig({ testTimeout: 30000 })` 即可（本群組不需真實 I/O 等待）。

### 0.6 E2E 群組 harness 設計（比照既有 F098 `f098-pg-integration.spec.ts` 精簡佇列-only harness，非完整 pipeline bootstrap）

查證既有 `f098-pg-integration.spec.ts`（F098 P1 唯一真連線端對端測試）之既定手法：**不**透過 NestJS 完整 bootstrap `AssignmentModule`/`AssignmentWorkerModule`（會牽連 ETL/計分/customer_core 等大量非本輪範圍依賴），而是直接 `new` 出待測物件並以最小手寫表驗證 status 轉移，`pipeline` 以行內模擬（直接下 SQL 更新 `status`）取代真實 `AssignmentRunPipelineService`。

**本文件 E2E 群組比照此precedent，但範圍略有不同（需明確記錄，避免與 P1 既有慣例混淆）**：P1 之 PGINT 測試連 `RunQueueProducer`/`RunQueueConsumer` 都繞過，直接操作原生 `pg-boss` API（因為當時待測的是「pg-boss 這個第三方套件本身在本專案是否可靠」）；但 P2b 待測的正是 `RunQueueProducer`/`RunQueueConsumer` **這兩個類別本身新增的 mssql 分支接線邏輯**，繞過它們就測不到本輪的變更標的。故 E2E 群組**直接建構真實的** `RunQueueProducer`/`RunQueueConsumer` 實例（`new`，不經 Nest DI，比照既有 `f098-producer.spec.ts`/`f098-consumer.spec.ts` 建構風格）並注入真實 `MssqlQueueService(dataSource)`（P2a 已驗證），只有 `pipeline: { runPipeline }` 一項以簡化 stub 取代（直接對 `AssignmentRun` 表下 SQL 更新 status，模擬 pending→running→completed/failed），避免拖入完整 ETL/計分依賴——此與 P1 PGINT 之「業務邏輯簡化，佇列/consumer 骨架不簡化」精神一致，只是 P2b 額外把 `RunQueueProducer`/`RunQueueConsumer` 本身也納入真實驗證範圍（因為它們才是本輪變更標的）。

---

## 一、DISPATCH — 🔴 Driver 分支觸發 MUST-FIX 守門（免真實連線）

> 對應 §0.3 之核心陷阱；所有案例以 spy 驗證「呼叫了哪個依賴」而非僅驗證最終回傳值，對現行未修改程式碼刻意設計為紅燈。

### TS-MSSQL-P2B-DISPATCH-001（🔴 MUST-FIX）：`DB_TYPE='mssql'` → `producer.send()` 呼叫 `mssqlQueue.send`，不呼叫 `boss.send`，且不誤觸現行「`boss` 為 null 即 throw」防呆分支
- **Related Requirement**：AD §3「Producer send 簽章不變，內部新增 mssql 分支」／§0.3 陷阱
- **Test Type**：Positive / Unit（🔴 對現行程式碼為紅線）
- **Preconditions**：以 mssql 環境設定建構 `RunQueueProducer`（機制由 tdd-implementation 決定，測試僅關心可觀察結果）；注入 fake `mssqlQueue.send` spy（回傳固定 jobId）；`boss` 依現行慣例為 null（mssql 環境下 pg-boss 本就不存在）
- **Steps**：呼叫 `producer.send({ runId: 'r1', ym: '202606' })`
- **Expected Result**：`mssqlQueue.send` 恰被呼叫 1 次；回傳值 = fake 回傳之 jobId；**不**拋出例外（現行未修改程式碼會因 `!this.boss` 為 true 而 throw，此案例即為守門）

---

### TS-MSSQL-P2B-DISPATCH-002（🔴 MUST-FIX）：`DB_TYPE='mssql'` → `producer.cancel()` 呼叫 `mssqlQueue.cancel`，不誤觸現行「`boss` 為 null 即靜默 return」分支
- **Related Requirement**：AD §3「Producer cancel 簽章不變」／§0.3 陷阱
- **Test Type**：Negative / Unit（🔴 對現行程式碼為紅線）
- **Preconditions**：同 DISPATCH-001
- **Steps**：呼叫 `producer.cancel('some-job-id')`
- **Expected Result**：`mssqlQueue.cancel` 恰被呼叫 1 次，參數為該 jobId（現行未修改程式碼會因 `!this.boss` 為 true 直接 `return`，`mssqlQueue.cancel` 永遠 0 次呼叫，此案例即為守門）

---

### TS-MSSQL-P2B-DISPATCH-003（🔴 MUST-FIX，本輪最核心守門）：`DB_TYPE='mssql'` → `consumer.onModuleInit()` 呼叫 `startMssqlPolling()`（輪詢啟動），不誤觸現行「`boss` 為 null 即 warn+return」分支
- **Related Requirement**：AD §4.1/§4.2「`onModuleInit()` 加 driver 分支：mssql → `startMssqlPolling()`」／§0.3 陷阱（三處中影響最大——若漏接，mssql worker 完全不消費任何 job，且無任何錯誤訊息，僅一行 warn log 靜默吞沒）
- **Test Type**：Positive / Unit（🔴 DoD 紅線，對現行程式碼為紅線）
- **Preconditions**：同 DISPATCH-001；以可觀察方式驗證輪詢已啟動（例如 mock `setInterval` 全域或驗證內部 timer handle 非 null，機制由 tdd-implementation 決定，測試僅斷言可觀察結果）
- **Steps**：呼叫 `consumer.onModuleInit()`
- **Expected Result**：輪詢已啟動（`setInterval` 被呼叫 1 次，或等效可觀察狀態）；`boss.work` **不**被呼叫；**不**記錄「未提供 pg-boss 實例」之 warn log（現行未修改程式碼會因 `!this.boss` 為 true 直接 warn+return，輪詢永不啟動，此案例即為守門）

---

### TS-MSSQL-P2B-DISPATCH-004：`DB_TYPE='postgres'`（`boss` 存在）→ 既有 pg-boss 分支維持不變，`mssqlQueue` 完全不被呼叫（回歸 + 互斥）
- **Related Requirement**：AD §3「postgres 分支在 cutover 前維持 pg-boss 不變」
- **Test Type**：Regression / Unit
- **Preconditions**：以 postgres 環境設定建構 `RunQueueProducer`/`RunQueueConsumer`，注入 fake boss（沿用既有 f098-producer/consumer.spec.ts 建構風格）+ fake `mssqlQueue`
- **Steps**：分別呼叫 `producer.send()`／`producer.cancel()`／`consumer.onModuleInit()`
- **Expected Result**：三者皆走既有 boss 路徑（`boss.send`/`boss.cancel`/`boss.work` 各被呼叫）；`mssqlQueue.send`/`cancel`/`claimNext` 全數 0 次呼叫

---

### TS-MSSQL-P2B-DISPATCH-005：`DB_TYPE` 非 postgres 非 mssql（sqlite/測試預設，`boss=null` 且未 override `mssqlQueue`）→ 既有防呆行為保留不變，不誤判為 mssql
- **Related Requirement**：AD §5「不強行統一介面」／防止新 gate 把「未知/sqlite」誤判為 mssql
- **Test Type**：Regression / Unit（防禦性）
- **Preconditions**：`boss=null`、`mssqlQueue` 亦未提供（`undefined`/`null`，模擬現行 sqlite 測試環境未 override 任何佇列依賴之現況）
- **Steps**：分別呼叫 `producer.send()`（預期拋錯）／`producer.cancel()`（預期靜默 resolve）／`consumer.onModuleInit()`（預期 warn+return，不拋例外）
- **Expected Result**：三者行為與 P2b 之前完全一致（send 拋錯、cancel 靜默 resolve、onModuleInit warn+return 不註冊任何 handler）——確保新增的 mssql 分支判斷邏輯有明確的「兩者皆非」兜底，不會把 sqlite 測試環境意外導向 mssql 分支而報出非預期錯誤

---

### TS-MSSQL-P2B-CONFIG-006（🔴 MUST-FIX，AD §4.2 檔案改動清單缺口）：API 程序（`assignment.module.ts`）亦須能取得 `MssqlQueueService`，非僅 `assignment-worker.module.ts`
- **Related Requirement**：AD §4.2 檔案改動清單（**僅列 `assignment-worker.module.ts` providers 加入 `MssqlQueueService`**，未列 `assignment.module.ts`）；但 `RunQueueProducer`（`send`/`cancel`，mssql 分支需要 `MssqlQueueService`）依現行 `assignment.module.ts` 之既有結構註冊於 **API 程序**（`f098-static-guards.spec.ts` 之 `TS-F098-WORKER-004` 已確認：`AssignmentModule` 註冊 `RunQueueProducer`；`RunQueueConsumer`/`OrphanReaper` 才是 worker-only）
- **Test Type**：Static / Guard（🔴 MUST-FIX，前置守門，非 P2a 涵蓋範圍）
- **Steps**：靜態掃描 `assignment.module.ts` 原始碼，正則比對 `providers`／`imports` 是否含 `MssqlQueueService`（或等效供應 `MssqlQueueService` 之 provider/module）
- **Expected Result**：`assignment.module.ts` 之 `providers` 陣列含 `MssqlQueueService`（若沿用 AD §4.2 字面清單、只改 `assignment-worker.module.ts`，本案例應為紅燈——此為本文件查證 AD 文件本身之缺口，見 `risks-and-gaps.md`）

---

## 二、PROD — Producer mssql 分支業務行為（免真實連線）

> `MssqlQueueService` 本身之 SQL 正確性已由 P2a SEND/CANCEL 群組驗證（黑盒依賴，本組僅驗證 Producer 正確轉接呼叫）。

### TS-MSSQL-P2B-PROD-001：`producer.send(payload)` mssql 分支呼叫 `mssqlQueue.send` 之參數 = `(RUN_QUEUE_NAME, payload, RUN_QUEUE_RETRY_LIMIT)`
- **Related Requirement**：AD §3「`RUN_QUEUE_RETRY_LIMIT=0` 不變，mssql 路徑：claim 後無論成功/失敗一律 complete」／既有 `TS-F098-RETRY-001` 精神於 mssql 路徑重新驗證
- **Test Type**：Positive / Unit
- **Steps**：呼叫 `producer.send({ runId: 'r1', ym: '202606' })`
- **Expected Result**：`mssqlQueue.send` 呼叫參數依序為 `RUN_QUEUE_NAME`（即 `'assignment-run'`）、`{ runId: 'r1', ym: '202606' }`、`0`（`RUN_QUEUE_RETRY_LIMIT`）

---

### TS-MSSQL-P2B-PROD-002：`producer.send()` mssql 分支回傳值 = `mssqlQueue.send` 之回傳 jobId（`string`），簽章不變
- **Related Requirement**：AD §3「`send(payload): Promise<string｜null>` 簽章不變」／DoD #1「send 回傳 jobId」
- **Test Type**：Positive / Unit
- **Steps**：`mssqlQueue.send` fake 回傳固定 uuid 字串；呼叫 `producer.send(...)`
- **Expected Result**：回傳值型別為 `string`，且等於 fake 回傳值（與既有 pg-boss 路徑回傳型別一致，呼叫端無需區分 driver）

---

### TS-MSSQL-P2B-PROD-003：`producer.cancel(jobId)` mssql 分支呼叫 `mssqlQueue.cancel(jobId)`
- **Related Requirement**：AD §3「cancel 簽章不變，內部新增 mssql 分支」
- **Test Type**：Positive / Unit
- **Steps**：呼叫 `producer.cancel('job-abc')`
- **Expected Result**：`mssqlQueue.cancel` 恰被呼叫 1 次，參數為 `'job-abc'`

---

### TS-MSSQL-P2B-PROD-004：`producer.cancel()` mssql 分支對「已消費/不存在」job 之語意對齊——`MssqlQueueService.cancel` 本身已吞錯（P2a CANCEL-003/004 已驗證），producer 層不額外包一層 try/catch 誤判其 resolve 為錯誤
- **Related Requirement**：AD §2.4「影響列數 0 → 已被消費」／既有 `f098-producer.spec.ts`「cancel 失敗（job 已被消費）不向上拋」語意於 mssql 路徑對齊
- **Test Type**：Negative / Unit（DoD #1「cancel 對已消費 job 吞錯」核心）
- **Steps**：`mssqlQueue.cancel` fake 正常 resolve（模擬 P2a 已驗證之「影響列數 0，不拋例外」語意）；呼叫 `producer.cancel(jobId)`
- **Expected Result**：`producer.cancel()` 正常 resolve，不拋例外，且不需要 producer 層額外的 try/catch 包裝（因為底層本身不拋錯；若 tdd-implementation 誤加了一層會誤判為錯誤的防禦性 try/catch，本案例雖仍會通過，但應以程式碼審閱確認未過度設計，非本案例可自動偵測之範圍）

---

### TS-MSSQL-P2B-PROD-005：`producer.send()` 使用之 queueName 參數 = `RUN_QUEUE_NAME` 常數（不硬寫字面字串）
- **Related Requirement**：`run-queue.constants.ts`「單一事實來源」既有慣例（`feedback_tdd_naming_drift`）於 mssql 路徑延伸
- **Test Type**：Static / Guard
- **Steps**：靜態掃描 `run-queue.producer.ts` 之 mssql 分支程式碼片段
- **Expected Result**：呼叫 `mssqlQueue.send`/`mssqlQueue.cancel` 之 queueName 引數皆引用 `RUN_QUEUE_NAME` 識別字，無硬寫 `'assignment-run'` 字面字串於 mssql 分支內

---

## 三、POLL — Consumer 輪詢 Loop（reentrancy + 生命週期，免真實連線）

### TS-MSSQL-P2B-POLL-001：`onModuleInit`（postgres 分支）維持既有行為不變（`boss.work` 被呼叫，不啟動 `pollTimer`）
- **Related Requirement**：AD §4.2「postgres → 現行 `boss.work()` 不變」
- **Test Type**：Regression / Unit
- **Steps**：以 postgres 環境 + fake boss 呼叫 `consumer.onModuleInit()`
- **Expected Result**：`boss.work` 恰被呼叫 1 次（沿用既有 `TS-F098-CONS-006`/`SER-001` 斷言）；輪詢計時器未啟動（無 `setInterval` 呼叫）

---

### TS-MSSQL-P2B-POLL-002：`onModuleInit`（mssql 分支）啟動輪詢 loop，且不呼叫 `boss.work`（互斥）
- **Related Requirement**：AD §4.1「`startMssqlPolling()`」／§4.2 driver 分支
- **Test Type**：Positive / Unit
- **Steps**：以 mssql 環境呼叫 `consumer.onModuleInit()`
- **Expected Result**：輪詢已啟動（`setInterval` 被呼叫 1 次）；`boss.work` 0 次呼叫（此案例聚焦「啟動」本身，「是否真的走到這條分支」已由 DISPATCH-003 守門，本案例可視為 DISPATCH-003 之延伸細節驗證，用不同斷言角度交叉確認）

---

### TS-MSSQL-P2B-POLL-003：輪詢間隔 = `tuning.pollIntervalMs`（預設 2000ms，可由 `RunQueueTuning` 注入）
- **Related Requirement**：AD §4.1「`intervalMs = this.tuning.pollIntervalMs ?? 2000`」／§4.2「`RunQueueTuning` 新增 `pollIntervalMs`」
- **Test Type**：Positive / Unit
- **Preconditions**：以自訂 `tuning.pollIntervalMs=500` 注入 consumer（測試可注入短間隔，不等真實 2000ms）
- **Steps**：呼叫 `onModuleInit()`；檢視 `setInterval` 呼叫之第二參數（間隔毫秒數）
- **Expected Result**：等於注入值 `500`；若未注入（沿用 `DEFAULT_RUN_QUEUE_TUNING`）則為 `2000`

---

### TS-MSSQL-P2B-POLL-004：`pollOnce()` — `claimNext` 回傳 `null`（無待處理 job）→ 不呼叫 `processPayload`、不呼叫 `complete`
- **Related Requirement**：AD §4.1 pseudocode「`if (!claimed) return;`」
- **Test Type**：Negative / Unit
- **Preconditions**：`mssqlQueue.claimNext` fake 回傳 `null`
- **Steps**：直接呼叫 `pollOnce()`（private method，比照既有 F098 慣例直接呼叫）
- **Expected Result**：`processPayload`（spy）與 `mssqlQueue.complete` 皆 0 次呼叫

---

### TS-MSSQL-P2B-POLL-005：`pollOnce()` — `claimNext` 回傳一筆 → 依序呼叫 `processPayload(jobId, payload)` 再呼叫 `complete(jobId)`
- **Related Requirement**：AD §4.1 pseudocode「`await this.processPayload(...)` → `finally` → `complete`」
- **Test Type**：Positive / Unit
- **Preconditions**：`mssqlQueue.claimNext` fake 回傳 `{ jobId: 'j1', payload: '{"runId":"r1","ym":"202606"}', retryLimit: 0 }`
- **Steps**：呼叫 `pollOnce()`
- **Expected Result**：`processPayload` 恰 1 次，`complete('j1')` 恰 1 次，且 `complete` 於 `processPayload` resolve **之後**才呼叫（呼叫順序斷言，非僅次數）

---

### TS-MSSQL-P2B-POLL-006：`pollOnce()` — `processPayload` 拋錯 → `complete` 仍被呼叫（`finally` 語意，佇列層不因業務失敗卡在 `active`）
- **Related Requirement**：AD §4.1「無論成功/失敗一律 completed（retry=0 語意）」；此為 `RUN_QUEUE_RETRY_LIMIT=0` 語意在 mssql 路徑之核心體現
- **Test Type**：Positive / Unit（DoD 紅線）
- **Preconditions**：`processPayload`（若可 spy/override）或其內部依賴（`pipeline.runPipeline`）拋錯
- **Steps**：呼叫 `pollOnce()`
- **Expected Result**：`complete(jobId)` 仍被呼叫 1 次；`pollOnce()` 本身不向上拋出未捕捉例外（與既有 `TS-F098-CONS-004` 語意一致，於新輪詢架構下重新驗證）

---

### TS-MSSQL-P2B-POLL-007（🔴 I-MSSQL-QUEUE-SERIAL-01 核心，MUST-FIX，reentrancy guard）：上一輪 `pollOnce()` 尚未完成時，下一輪計時器 tick 觸發 → `polling` guard 阻擋重疊呼叫，`claimNext` 於此期間恰被呼叫 1 次
- **Related Requirement**：不變式 I-MSSQL-QUEUE-SERIAL-01（「`polling` reentrancy guard（同程序內不重疊 tick）」三要素之一，缺一不成立）
- **Test Type**：Positive / Unit（🔴 DoD 紅線）
- **Preconditions**：`vi.useFakeTimers()`；`mssqlQueue.claimNext` fake 實作回傳一個「可由測試主體外部控制何時 resolve」的 promise（模擬 `processPayload` 仍在執行中的窗口）；以 `tuning.pollIntervalMs` 短間隔（如 100ms）啟動輪詢
- **Steps**：`onModuleInit()` 啟動輪詢 → `vi.advanceTimersByTimeAsync(100)`（觸發第一次 tick，`claimNext` 進入呼叫但尚未 resolve）→ 再 `vi.advanceTimersByTimeAsync(100)` 兩次（模擬第二、三次計時器到期，但第一輪仍卡在 in-flight）
- **Expected Result**：`claimNext` 於此三次 tick 期間**恰被呼叫 1 次**（第二、三次 tick 因 `polling===true` 被 guard 擋下，回呼函式直接 return，不進入 `claimNext`）；待測試主體手動 resolve 第一輪的 promise 後（模擬 `pollOnce` 完成、`polling` 重置為 `false`），下一次 tick 才允許 `claimNext` 第 2 次呼叫

---

### TS-MSSQL-P2B-POLL-008：單輪 tick 例外（如 `claimNext` 本身 reject，非 `processPayload` 拋錯）→ 被 catch 記 log，不使輪詢 loop 停止（下一輪 tick 仍正常觸發）
- **Related Requirement**：AD §4.1 pseudocode「`.catch((err) => this.logger.error(...))`」
- **Test Type**：Negative / Unit
- **Preconditions**：`vi.useFakeTimers()`；`mssqlQueue.claimNext` 第一次呼叫 reject，第二次呼叫正常 resolve `null`
- **Steps**：啟動輪詢 → 推進兩次 tick 間隔
- **Expected Result**：第一次 tick 之例外不拋出至頂層（不使測試/程序崩潰）；`polling` guard 於 `.finally` 正確重置為 `false`（否則例外路徑會使 guard 永久卡死、輪詢自此失效——此為額外驗證的隱含前提）；第二次 tick 正常呼叫 `claimNext`

---

### TS-MSSQL-P2B-POLL-009（🔴 DoD #4 核心）：`onModuleDestroy()` 清除 `pollTimer`（無孤兒 interval）；destroy 後即使時間持續推進，`claimNext` 不再被呼叫
- **Related Requirement**：AD §4.2「`OnModuleDestroy` 補 `clearInterval(this.pollTimer)`」／P2b DoD #4「pollTimer 正確 clear，不留孤兒 interval」
- **Test Type**：Positive / Unit（🔴 DoD 紅線）
- **Preconditions**：`vi.useFakeTimers()`；輪詢已啟動且至少成功完成一輪（`claimNext` 已被呼叫過，回傳 `null`）
- **Steps**：呼叫 `consumer.onModuleDestroy()`；之後推進時間數個 `pollIntervalMs` 週期
- **Expected Result**：`onModuleDestroy()` 呼叫後 `claimNext` 呼叫次數不再增加（與 destroy 前的計數相同）；比照既有 `OrphanReaper.onModuleDestroy` 結構（`if (this.timer) { clearInterval(this.timer); this.timer = null; }`）

---

### TS-MSSQL-P2B-POLL-010（Meta / 決策關卡說明性案例，非常規 pass/fail）：P2b DoD #4「Worker 程序 SIGTERM 優雅關閉」之驗證範圍界定 — 以 NestJS lifecycle（`onModuleDestroy`）驗證，非真實 OS 級 SIGTERM 訊號測試
- **Related Requirement**：P2b DoD #4 字面「Worker 程序 SIGTERM 優雅關閉」
- **Test Type**：Meta / Guard（範圍界定說明，供 tdd-implementation 與未來讀者對齊理解）
- **問題說明**：`worker-main.ts` 之 `SIGTERM`/`SIGINT` handler（呼叫 `appContext.close()`）為既有程式碼，P2b **不改動**該檔（AD §4.2 明文「不變」）；`appContext.close()` 會觸發 NestJS 對所有 provider 自動呼叫 `OnModuleDestroy` 生命週期鉤子，其中即包含本輪新增之 `RunQueueConsumer.onModuleDestroy()`（POLL-009 已單元驗證）。既有 `TS-F098-WORKER-001`（`f098-static-guards.spec.ts`）已靜態確認 `worker-main.ts` 有註冊 `SIGTERM`/`SIGINT` handler 且未變動。
- **Steps**：（不執行；本案例為文件化範圍界定）
- **Expected Result**：DoD #4「優雅關閉」由「既有 `worker-main.ts` SIGTERM handler（未變動，TS-F098-WORKER-001 既有靜態守門涵蓋）」+「POLL-009（`onModuleDestroy` 直接清 timer 之單元驗證）」兩者組合滿足；本文件**不**額外設計 spawn child process 送真實 OS SIGTERM 訊號之案例（現行 F098 P1 測試套件亦無此類先例，屬過度工程；若之後有需求，應獨立追加專屬 process-level 測試，非本輪範圍）

---

## 四、PAYLOAD — 🔴 `processPayload` 共用（I-MSSQL-QUEUE-PAYLOAD-UNITY-01 DoD 核心，免真實連線）

### TS-MSSQL-P2B-PAYLOAD-001（🔴 DoD 核心，本文件旗艦案例）：pg-boss 路徑（`handleOne`/`handleJobs`）與 mssql 路徑（`pollOnce`）皆呼叫**同一個** `processPayload` 方法（同一函式參照，非各自兩份相似實作）
- **Related Requirement**：不變式 I-MSSQL-QUEUE-PAYLOAD-UNITY-01
- **Test Type**：Positive / Unit（🔴 DoD 紅線）
- **Preconditions**：以 `vi.spyOn(consumer as any, 'processPayload')` 包裝同一個 `RunQueueConsumer` 實例上的 `processPayload` 方法（單一 spy 物件，非分別對兩條路徑各建一個 spy）
- **Steps**：先以 postgres 分支驅動 `consumer.handleJobs([job])` 觸發一次；再以 mssql 分支驅動 `consumer.pollOnce()`（`claimNext` fake 回傳一筆）觸發一次
- **Expected Result**：同一個 spy 累計呼叫次數 = 2（各路徑各 1 次），證明兩條路徑呼叫的是同一個方法定義；**不存在**任何以不同方法名（如 `processPayloadMssql`/`processPayloadPg`）各自實作業務邏輯的情形——若 tdd-implementation 為兩路徑各寫一份相似方法，本案例之 spy 呼叫次數會是 0（因為 spy 掛在 `processPayload` 這個名稱上，兩份各自命名的方法都不會被呼叫到，形成明確可觀察的紅燈訊號）

---

### TS-MSSQL-P2B-PAYLOAD-002（靜態守門，延續 P2a STATIC-003 前瞻性）：業務邏輯特徵字串（查 run 狀態 / 取消檢查 / `pipeline.runPipeline` 呼叫）於 `run-queue.consumer.ts` 僅出現在單一方法（`processPayload`）內
- **Related Requirement**：I-MSSQL-QUEUE-PAYLOAD-UNITY-01 之靜態延伸；P2a `TS-MSSQL-P2A-STATIC-003`「記錄本結果供 P2b test-designer 於接線後重跑同一守門」之延續（本案例為新增，非重跑該案例本身——P2a STATIC-003 驗證的是 claim SQL 特徵字串僅存在 `mssql-queue.service.ts` 一處，與本案例驗證對象不同，不可混淆）
- **Test Type**：Static / Guard
- **Steps**：靜態掃描 `run-queue.consumer.ts`（剝除註解），以正則統計 `this.pipeline.runPipeline` 與 `status\s*===?\s*['"]failed['"]` 兩特徵字串各自出現次數
- **Expected Result**：`this.pipeline.runPipeline` 恰出現 1 次；取消檢查特徵字串恰出現 1 次（皆位於 `processPayload` 方法體內，不在 `handleOne`/`pollOnce` 各自重複）

---

### TS-MSSQL-P2B-PAYLOAD-003：`processPayload(jobId, payload)` — 對應 run 不存在 → 記 log、不拋、不呼叫 pipeline（新 signature 下重新驗證既有 `TS-F098-CONS-005` 語意）
- **Related Requirement**：既有 `TS-F098-CONS-005`
- **Test Type**：Negative / Unit
- **Preconditions**：`runRepo.findOne` fake 回傳 `null`
- **Steps**：呼叫 `processPayload('job-1', { runId: 'ghost-run', ym: '202606' })`
- **Expected Result**：`pipeline.runPipeline` 0 次呼叫；不拋例外

---

### TS-MSSQL-P2B-PAYLOAD-004：`processPayload(jobId, payload)` — `run.status==='failed'`（pending 取消快路徑）→ 略過 pipeline（新 signature 下重新驗證既有取消快路徑語意）
- **Related Requirement**：既有 f098-consumer.spec.ts「取消快路徑」案例／DoD #1「processPayload 對 status==='failed' 略過」
- **Test Type**：Positive / Unit（DoD #1 核心）
- **Preconditions**：`runRepo.findOne` fake 回傳 `{ run_id: 'r1', status: 'failed' }`
- **Steps**：呼叫 `processPayload('job-1', { runId: 'r1', ym: '202606' })`
- **Expected Result**：`pipeline.runPipeline` 0 次呼叫

---

### TS-MSSQL-P2B-PAYLOAD-005：`processPayload(jobId, payload)` — 正常路徑呼叫 `pipeline.runPipeline(runId, ym)`，參數正確對應（不論來源為 `job.data` 或 `claimed.payload` 解析後之相同形狀 payload）
- **Related Requirement**：既有 `TS-F098-CONS-001`/`001b`
- **Test Type**：Positive / Unit
- **Preconditions**：`runRepo.findOne` fake 回傳 `{ run_id: 'r1', status: 'pending' }`
- **Steps**：呼叫 `processPayload('job-1', { runId: 'r-abc', ym: '202607' })`
- **Expected Result**：`pipeline.runPipeline` 恰 1 次，呼叫參數為 `('r-abc', '202607')`

---

### TS-MSSQL-P2B-PAYLOAD-006：`processPayload(jobId, payload)` — pipeline 拋錯 → try/catch 吞錯，不向上拋（新 signature 下重新驗證既有 `TS-F098-CONS-004` 語意；DoD #1「pipeline 拋錯不使 worker 崩潰」）
- **Related Requirement**：既有 `TS-F098-CONS-004`／DoD #1
- **Test Type**：Positive / Unit（DoD #1 核心）
- **Preconditions**：`pipeline.runPipeline` fake reject
- **Steps**：呼叫 `processPayload('job-1', { runId: 'r1', ym: '202606' })`
- **Expected Result**：resolves，不拋例外（無論是被 pg-boss 的 `handleOne` 呼叫或 mssql 的 `pollOnce` 呼叫，皆不使各自呼叫端崩潰——此為 unity 的另一層意義：錯誤處理語意兩路徑天然一致，因為根本是同一份程式碼）

---

### TS-MSSQL-P2B-PAYLOAD-007：pg-boss 路徑轉接層正確從 `job.data`/`job.id` 取出參數傳入 `processPayload`（既有 `TS-F098-CONS-001`/`001b` 於重構後之轉接層回歸）
- **Related Requirement**：既有 `TS-F098-CONS-001b`「payload 在 job.data，非 job 物件本身（v10 contract）」
- **Test Type**：Regression / Unit
- **Steps**：呼叫 `consumer.handleJobs([job])`（`job.data = { runId: 'run-xyz', ym: '202607' }`，`job.id = 'job-9'`）
- **Expected Result**：`processPayload` 呼叫參數為 `('job-9', { runId: 'run-xyz', ym: '202607' })`（即 `handleOne` 轉接層正確拆解 `job.id`/`job.data`）

---

### TS-MSSQL-P2B-PAYLOAD-008：mssql 路徑轉接層正確 `JSON.parse(claimed.payload)` 還原為 `{runId, ym}` 物件後才傳入 `processPayload`（非直接傳遞原始 JSON 字串）
- **Related Requirement**：AD §1「`payload: string; // JSON.stringify(RunJobPayload)`」（queue_job 表結構）／P2a `TS-MSSQL-P2A-CLAIM-006`「payload JSON 序列化往返不失真」於消費端之延伸——**此為 pg-boss 與 mssql 兩路徑唯一的資料形狀差異**（pg-boss 之 `job.data` 已是 driver 自動解析後之物件，mssql 之 `claimed.payload` 是原始 JSON 字串），若轉接層漏做 `JSON.parse`，`processPayload` 收到的會是字串而非物件，`payload.runId`/`payload.ym` 皆為 `undefined`
- **Test Type**：Positive / Unit（DoD 紅線，pg-boss/mssql 唯一資料形狀落差之守門）
- **Preconditions**：`mssqlQueue.claimNext` fake 回傳 `{ jobId: 'j1', payload: '{"runId":"r-abc","ym":"202606"}', retryLimit: 0 }`（`payload` 為**字串**，模擬 P2a 已驗證之真實回傳形狀）
- **Steps**：呼叫 `pollOnce()`
- **Expected Result**：`processPayload` 呼叫參數為 `('j1', { runId: 'r-abc', ym: '202606' })`（**已還原為物件**，非原始字串 `'{"runId":"r-abc","ym":"202606"}'`）

---

## 五、E2E — 端對端（真實 MSSQL，佇列層 drain，`ad-e07-40-p2b.mssql.spec.ts`）

> 沿用 §0.6 harness：真實 `RunQueueProducer`/`RunQueueConsumer`/`MssqlQueueService(dataSource)`，`pipeline` 以簡化 stub（直接 SQL 更新 `assignment_run.status`）取代真實 `AssignmentRunPipelineService`，schema `p2b_e2e`。

### TS-MSSQL-P2B-E2E-001（🔴 P2b DoD #3 核心）：`producer.send()` 觸發一次「月名單分派」→ worker 輪詢 loop 於數個 tick 內撿到 job → 呼叫 stub pipeline → `assignment_run.status` 推進至 `completed`
- **Related Requirement**：P2b DoD #3
- **Test Type**：Positive / Integration（真實 MSSQL，DoD 紅線）
- **Preconditions**：seed 一筆 `assignment_run`（`status='pending'`）；啟動真實輪詢（短 `pollIntervalMs`，如 200ms，不等真實 2000ms）
- **Steps**：呼叫 `producer.send({ runId, ym: '202606' })`；輪詢等待（polling，非 sleep 固定時長，比照既有 `waitFor` helper 精神）直到 `assignment_run.status==='completed'` 或逾時
- **Expected Result**：於合理逾時內（如 5 秒，數個 poll tick）狀態推進為 `completed`；`queue_job` 該筆 `state='completed'`

---

### TS-MSSQL-P2B-E2E-002：stub pipeline 模擬業務失敗路徑 → `assignment_run.status` 最終為 `failed`；`queue_job` 該筆仍正確變為 `completed`（retry=0，佇列層不因業務失敗卡住）
- **Related Requirement**：AD §4.1「無論成功/失敗一律 completed」；P2b DoD #3「completed/failed」兩種結果皆須驗證
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：stub pipeline 對該 run 執行「標記 failed」邏輯（而非 completed）
- **Steps**：同 E2E-001，等待 `assignment_run.status` 落定
- **Expected Result**：`assignment_run.status==='failed'`；`queue_job.state==='completed'`（佇列層與業務層狀態各自獨立、皆正確落定）

---

### TS-MSSQL-P2B-E2E-003（🔴 D-CONC-01 drain 語意延伸至 E2E 層）：連續 `send()` 3 筆不同 run job → 單一 worker 輪詢 loop 經多次 tick 逐筆 drain 完畢，全部推進至 completed/failed（非卡在 pending/running）
- **Related Requirement**：AD-E07-40-P2a-impl.md D-CONC-01「反覆輪詢終能全部領完」之單 worker prod 語意，於 P2b 實際輪詢 loop 層級驗證（P2a 之 CONC drain 驗證的是 `MssqlQueueService.claimNext` 本身；本案例驗證的是**整條輪詢 loop 是否真的會反覆 tick 直到全部處理完**，兩者互補、驗證對象不同）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：seed 3 筆 `assignment_run`（皆 `pending`）
- **Steps**：連續呼叫 `producer.send()` 3 次（各對應一筆 run）；輪詢等待直到 3 筆皆推進至終態或逾時
- **Expected Result**：3 筆 `assignment_run.status` 皆為 `completed`/`failed`（非 `pending`/`running`）；3 筆 `queue_job.state` 皆為 `completed`；期間單一 worker（同一個 `RunQueueConsumer` 實例）依序處理，不需併發 claim（單 worker 序列化語意）

---

### TS-MSSQL-P2B-E2E-004（量測性，非嚴格 pass/fail，AD §9.1 非阻擋項）：`send()` 呼叫至 stub pipeline 實際被呼叫之延遲量測
- **Related Requirement**：AD §9.1「建議 P2b 端對端測試順便量測 trigger → worker 開始執行之實際延遲分佈，作為是否需要調整 `pollIntervalMs` 預設值的依據，非阻擋項」
- **Test Type**：Positive / Integration（真實 MSSQL，觀察性）
- **Steps**：記錄 `send()` 呼叫時間戳與 stub pipeline 實際被呼叫之時間戳，計算差值
- **Expected Result**：延遲落於 `[0, pollIntervalMs + 合理緩衝]` 區間內（本案例目的為記錄實測數據供決策參考，非嚴格阻擋性驗收；若實測延遲遠超預期，記入 `risks-and-gaps.md` 供後續調整 `pollIntervalMs` 預設值之依據，不阻擋 P2b DoD）

---

### TS-MSSQL-P2B-E2E-005：cancel-before-consume 端對端 — `send()` 後立即 `producer.cancel()` → worker 輪詢不會執行該筆對應 pipeline
- **Related Requirement**：AD §2.4／既有 F098「pending job cancel 快路徑」語意於 mssql 全鏈路對齊（既有 `TS-F098-PGINT` 之 mssql 對應）
- **Test Type**：Negative / Integration（真實 MSSQL）
- **Preconditions**：seed 一筆 `assignment_run`（`pending`）
- **Steps**：`producer.send(payload)` → 立即 `producer.cancel(jobId)`；啟動輪詢，等待數個 tick 週期
- **Expected Result**：stub pipeline 從未被呼叫（`queue_job` 該筆 `state='cancelled'`，`claimNext` 之 `WHERE state='created'` 天然排除）；`assignment_run.status` 維持原值（不被推進至 running/completed）

---

## 六、ZERO — `OrphanReaper`/`CancellationPoller` 零改動驗證（回歸，無新檔）

### TS-MSSQL-P2B-ZERO-001：既有 `f098-orphan-reaper.spec.ts` 全部案例於 P2b 程式碼異動後原樣通過（不修改測試檔）
- **Related Requirement**：AD §3「`OrphanReaper` 零改動（重新確認）」／P2b DoD #2
- **Test Type**：Regression
- **Steps**：重跑 `queue/__tests__/f098-orphan-reaper.spec.ts`
- **Expected Result**：全綠，測試檔本身未被本輪改動（git diff 該檔為空）

---

### TS-MSSQL-P2B-ZERO-002：既有 `f098-cancellation.spec.ts` 全部案例於 P2b 程式碼異動後原樣通過（不修改測試檔）
- **Related Requirement**：AD §3「`CancellationPoller` 零改動（重新確認）」／P2b DoD #2
- **Test Type**：Regression
- **Steps**：重跑 `queue/__tests__/f098-cancellation.spec.ts`
- **Expected Result**：全綠，測試檔本身未被本輪改動

---

### TS-MSSQL-P2B-ZERO-003（靜態守門，對齊 AD §3「零改動」聲明）：`orphan-reaper.ts`／`cancellation-poller.ts` 兩檔案原始碼於 P2b 前後無異動
- **Related Requirement**：AD §3 明文「零改動（重新確認）」聲明之直接靜態驗證
- **Test Type**：Static / Guard
- **Steps**：靜態掃描（或 git diff）兩檔案，確認不含任何 `DB_TYPE`／`isPostgres`／`mssqlQueue`／`queue_job`／`MssqlQueueService` 字樣新增
- **Expected Result**：零命中（兩檔案繼續保持 driver-agnostic，僅操作 `assignment_run` 業務表，不觸碰佇列內部狀態）

---

## 七、STATIC — 命名鎖定 + 前瞻性守門（免真實連線）

### TS-MSSQL-P2B-STATIC-001：命名鎖定 — `startMssqlPolling`/`pollOnce`/`processPayload`/`pollTimer`/`polling`（reentrancy flag）於 `run-queue.consumer.ts` 命名與 AD §4.1 pseudocode 完全一致
- **Related Requirement**：AD §4.1 命名／`feedback_tdd_naming_drift`
- **Test Type**：Static / Guard
- **Steps**：fs+regex 靜態掃描 `run-queue.consumer.ts`
- **Expected Result**：五個識別字（方法名/欄位名）皆與 AD 文字完全一致

---

### TS-MSSQL-P2B-STATIC-002（延續 P2a `STATIC-003` 前瞻性守門，現於接線後重跑）：`READPAST`/`UPDLOCK`/`ROWLOCK`（claim SQL 特徵字串）於 `src/` 範圍**僅命中 `mssql-queue.service.ts` 一處**
- **Related Requirement**：I-MSSQL-QUEUE-PAYLOAD-UNITY-01 精神延伸／P2a `TS-MSSQL-P2A-STATIC-003`「記錄本結果供 P2b test-designer 於接線後重跑同一守門，確保未來未被複製第二份」
- **Test Type**：Static / Guard
- **Steps**：全域 grep `READPAST`／`UPDLOCK`／`ROWLOCK` 於 `apps/api/src/`
- **Expected Result**：僅命中 `mssql-queue.service.ts` 一處；`run-queue.producer.ts`/`run-queue.consumer.ts` 皆透過 `MssqlQueueService` 之方法呼叫，未複製貼上第二份相似 SQL 或繞過 service 直接下 SQL

---

### TS-MSSQL-P2B-STATIC-003：`RunQueueTuning.pollIntervalMs` 存在於 interface + `DEFAULT_RUN_QUEUE_TUNING` 有預設值（2000）+ 可由 env `RUN_QUEUE_POLL_INTERVAL_MS` 覆蓋
- **Related Requirement**：AD §4.2「`RunQueueTuning` interface 新增 `pollIntervalMs: number`；`DEFAULT_RUN_QUEUE_TUNING` 補預設值（建議 2000ms，可 env `RUN_QUEUE_POLL_INTERVAL_MS` 調整）」
- **Test Type**：Static / Guard
- **Steps**：靜態掃描 `pg-boss.provider.ts` 之 `RunQueueTuning` interface 定義與 `DEFAULT_RUN_QUEUE_TUNING` 物件字面值
- **Expected Result**：`pollIntervalMs` 存在於 interface；`DEFAULT_RUN_QUEUE_TUNING.pollIntervalMs` 之運算式含 `process.env.RUN_QUEUE_POLL_INTERVAL_MS` 讀取 + fallback `2000`（比照既有 4 個既存 tuning 欄位之 env 覆蓋模式）

---

## 八、REG — 回歸

### TS-MSSQL-P2B-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨（`RunQueueProducer`/`RunQueueConsumer` 新增 mssql 分支 + `processPayload` 重構後）
- **Related Requirement**：`feedback_vitest_no_typecheck`
- **Test Type**：Static / Guard
- **Steps**：對應 tsc 腳本
- **Expected Result**：exit code 0，零型別錯誤

---

### TS-MSSQL-P2B-REG-002：postgres 路徑既有 `f098-producer.spec.ts`/`f098-consumer.spec.ts` 全部案例不修改斷言即可原樣通過（黑箱行為契約不變，見 §0.4）
- **Related Requirement**：AD §3「postgres 分支維持 pg-boss 不變」／§0.4 黑箱契約聲明
- **Test Type**：Regression
- **Steps**：重跑兩檔既有測試（不修改測試檔內容）
- **Expected Result**：全綠；`retry=0`（不重派）/`batchSize=1`（序列化）/`cancel` 語意皆不變

---

### TS-MSSQL-P2B-REG-003：sqlite 既有套件（`f098-trigger-run.spec.ts` + assignment 模組套件）不受影響
- **Related Requirement**：AD §5「sqlite 測試路徑不變」
- **Test Type**：Regression
- **Steps**：以 `DB_TYPE` 預設（sqlite）跑既有 `assignment`/`assignment-list` 模組測試套件
- **Expected Result**：全綠

---

### TS-MSSQL-P2B-REG-004：`f098-static-guards.spec.ts` 全部案例原樣通過（`RUN_QUEUE_NAME`/`RunJobPayload`/`RUN_QUEUE_RETRY_LIMIT`/`RUN_QUEUE_BATCH_SIZE` 等既有靜態守門不受影響）
- **Related Requirement**：AD §3 契約對齊表「不變」欄位全項
- **Test Type**：Regression
- **Steps**：重跑 `f098-static-guards.spec.ts`
- **Expected Result**：全綠；特別確認 `TS-F098-WORKER-004`（`AssignmentModule` 註冊 `RunQueueProducer`，`RunQueueConsumer`/`OrphanReaper` 不在 API module）與 `TS-F098-WORKER-004b`（`AssignmentWorkerModule` 註冊 consumer+reaper）兩案例不因 P2b 新增 `MssqlQueueService`（見 DISPATCH-006）而破壞既有斷言（新增 provider 不應觸發既有「不含 X」之負向斷言誤判，需交叉確認既有正則未意外把 `MssqlQueueService` 誤判為 `RunQueueConsumer`/`OrphanReaper` 之類）

---

## 附錄：本文件案例數彙總

| 群組 | 案例數 | 對真 MSSQL 執行 | 新檔案 |
|---|---|---|---|
| 一、DISPATCH | 6 | 否 | `ad-e07-40-p2b.spec.ts` |
| 二、PROD | 5 | 否 | `ad-e07-40-p2b.spec.ts` |
| 三、POLL | 10 | 否（fake timer） | `ad-e07-40-p2b.spec.ts` |
| 四、PAYLOAD | 8 | 否 | `ad-e07-40-p2b.spec.ts` |
| 五、E2E | 5 | 是 | `ad-e07-40-p2b.mssql.spec.ts` |
| 六、ZERO | 3 | 部分（重跑既有 PG-optional 套件，本身不強制 PG） | 無（重跑既有） |
| 七、STATIC | 3 | 否 | `ad-e07-40-p2b.spec.ts` |
| 八、REG | 4 | 否 | 無（重跑既有 + tsc） |
| **合計** | **44** | — | — |
