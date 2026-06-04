---
type: test-design-feature
feature_id: F098
feature_name: 月跑 Worker 抽離（pg-boss 入列 + cdmp-worker 容器 + cancellation / orphan 回收）
priority: P0-MVP
related_spec: /docs/specs/features/F098-monthly-run-worker-extraction.md
related_ad: /docs/specs/implementation-log/AD-E07-v3.1-monthly-run-execution-model.md
spec_version: "1.0"
scope: P1-only
covers:
  - F098
last_updated: 2026-06-02
---

# F098：月跑 Worker 抽離（AD-E07-28 P1）— 測試設計

> ⚠️ **範圍限定 P1**：本測試設計**只**涵蓋 F098 P1（執行容器抽離 + cancellation + orphan 回收）。
> **不**涵蓋 P2（[F099](F099-stage1-sql-pushdown.md) Stage 1 SQL 下推）/ P3（[F100](F100-stage2-4-sql-pushdown-scoring.md) Stage 2~4 SQL 下推）。
> P1 **不改 Stage 1~4 演算法**（仍為現行 JS 版），只改「pipeline 在哪裡、由誰執行」。
> 故 JS↔SQL 等價測試矩陣、I-RUN-EST-01 / I-PORT-01 SQL core 等價斷言屬 P2/P3，本文件不設計。

> **測試設計重點（v1.0 / P1）**：
>
> 1. **I-TRIGGER-01（最核心）**：`triggerRun` 改為「`INSERT pending` → `pgboss.send` 入列 → 立即回 202」，
>    **不得**在 API 程序內呼叫 `kickoffPipeline` / `runPipeline`（解 F1 event loop 阻塞）。
> 2. **worker 消費**：`RunQueueConsumer`（`pgboss.work`）取 job → `runPipeline(runId, ym)` → status `pending→running→completed/failed`。
> 3. **cancellation 真生效（修現有 bug）**：`CancellationPoller` 於可中斷邊界（list 之間 / stage 之間）輪詢
>    `assignment_run.status`；被 `cancelRun` 標 `failed` → 拋 `RunCancelledException` 提早結束、**不再寫快照 / result**。
> 4. **OrphanReaper**：worker 崩潰遺留 `status='running'` 但 job 已消失 / expire 之 run → 標 `failed` +
>    `error_message='worker 中斷，請重新觸發'`。
> 5. **retryLimit=0（OQ-AD28-04）+ 單 worker 序列化（OQ-AD28-05）+ 同月併發保護（`assertNoRunningRun`，不可回歸）**。
> 6. **回歸基準**：P1 不改演算法 → 既有 `assignment-run-pipeline.*.spec` / `assignment-run.service.spec` 結果不變，作為「結果不變」基準。
>
> **命名鎖定**（對齊 F098 spec + AD-E07-28，下游 agent 禁止自行建立同義詞）：
> `RunQueueProducer` / `RunQueueConsumer` / `CancellationPoller` / `OrphanReaper` / `RunCancelledException` /
> queue name `'assignment-run'` / job payload `{ runId, ym }` / `error_message='worker 中斷，請重新觸發'` /
> orphan 偵測**不新增** schema 欄位（無 `worker_id` / `heartbeat_at`）。
> 實際檔名 / class 名若 spec 標「由 tdd-implementation 定」者（如 `worker-main.ts`、輪詢間隔數值），
> 測試以「行為 / contract」斷言，不 pin 具體檔名（見各案例「驗證方式」欄）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F098-monthly-run-worker-extraction.md`（§4 AC-1~AC-8 + §9 錯誤情境 + §10 覆蓋點名）+ [AD-E07-28 §5 P1 / §9 狀態機 / §9.2 失敗 / §9.3 取消](../../specs/implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) + `apps/api/src/modules/assignment/services/assignment-run.service.ts`（`triggerRun` L78 / `kickoffPipeline` L257 / `cancelRun` L173）+ `assignment-run-pipeline.service.ts`（`runPipeline` L104，list 迴圈 L151 = 可中斷邊界、快照寫入 L215） |
| QA / Tester | 本文件 + F098 spec §4 AC + §9 錯誤情境；特別關注「強制需 Postgres」案例分層 |
| CI/CD / DevOps | 本文件「§ 測試環境與 CI 決策」+ F098 spec §5（worker service）§6（pg-boss schema migration） |

---

## 測試策略概覽

### 分層原則（pg-boss = Postgres 專屬，必須分層）

| 測試層 | 對象 | pg-boss 處理 | DB |
|---|---|---|---|
| **Unit** | `triggerRun` 入列行為、`RunQueueConsumer` handler 邏輯、`CancellationPoller` 純判定、`OrphanReaper` 純判定 | **mock / fake** `RunQueueProducer`（`send` spy）、`pgboss` work handler 以直呼 handler 模擬派發 | SQLite（沿用專案多數 spec）或 mock repo |
| **PG Integration** | 真實入列→消費→冪等→job expiration orphan、pg-boss schema migration | **真實 pg-boss**（`boss.start()` 對真 Postgres） | **Postgres Test Container（強制）** |
| **E2E** | 觸發 API → worker 容器消費 → 前端 polling 看到 status 推進；月跑期間 API 仍可回應（非功能） | 真實 pg-boss + 真實 `cdmp-worker` 容器 | Postgres（docker-compose） |
| **Regression（靜態 / 結果不變）** | 既有 pipeline spec baseline 不變；`triggerRun` 不再呼叫 `kickoffPipeline`（grep） | 不涉入 | 既有 |

### 時鐘 / 計時器控制策略

| 項目 | 策略 |
|---|---|
| `CancellationPoller` 輪詢間隔 | 測試**注入**極短間隔（或直接呼叫 `poll()` 一次），不依賴真實 `setInterval`；沿用專案 fake timer 慣例（如 F035 / F023 `scanAndExecute(fakeNow)` 模式） |
| `OrphanReaper` 掃描週期 / job expiration 閾值 | 閾值設為**可注入參數**（env / config），測試以極短閾值觸發；不等真實逾時（沿用 F098 OQ-F098-02：閾值由 tdd-implementation 對齊最長月跑時間，但測試環境須可縮短） |
| job expiration（pg-boss `expireInSeconds`） | PG Integration 測試以極短 `expireInSeconds` 觸發 expire，再驗證 OrphanReaper 回收 |

### mock 必須模擬真實 pg-boss contract（feedback_mock_real_system_contract）

- `RunQueueProducer.send`（包 `pgboss.send`）**回傳 jobId（string）**，非 void；mock 須回傳合法 UUID 形 jobId。
- work handler 收到的 job 物件形狀為 `{ id, name, data }`（pg-boss 真實形狀），payload 在 `job.data`（即 `{ runId, ym }`），**不可**假設 payload 直接是 handler 參數本身。
- `retryLimit=0` 行為：handler 拋錯後 pg-boss **不重派**（job 直接 `failed`）；mock 不可「自動重呼 handler」做 happy-path 假設。
- 單 worker 序列化：`teamConcurrency=1`（或等效）；mock 不可平行呼叫 handler 模擬併發消費（會掩蓋序列化回歸）。

---

## 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 對應 AC | 說明 |
|---|---|---|---|---|---|
| TS-F098-TRIG-001~006（triggerRun 入列、不在程序內跑） | 6 | Unit | 否 | AC-1 / I-TRIGGER-01 | 入列 spy + `kickoffPipeline` 不被呼叫 + 立即回 202 |
| TS-F098-CONS-001~006（worker 消費 + status 轉移） | 6 | Unit | 否 | AC-2 / AC-7 | handler 直呼，pending→running→completed/failed |
| TS-F098-RETRY-001~003（retryLimit=0） | 3 | Unit + PG Integration | 部分 | AC-3 | 失敗不重派；PG 真庫驗證 job 終態 failed |
| TS-F098-SER-001~003（單 worker 序列化 + 同月併發保護） | 3 | Unit + PG Integration | 部分 | AC-4 | `teamConcurrency=1`；`assertNoRunningRun` 不回歸 |
| TS-F098-CANCEL-001~007（cancellation 真生效） | 7 | Unit + PG Integration | 部分 | AC-5 | poller 偵測 failed → 提早結束、不寫快照；pending job `cancel(jobId)` 快路徑 |
| TS-F098-ORPHAN-001~007（orphan 回收） | 7 | Unit + PG Integration | 部分 | AC-6 / §9.2 | running + job 消失/expire → failed + 正確 error_message；邊界（執行中不誤殺） |
| TS-F098-PGINT-001~005（真實佇列端到端 + schema migration） | 5 | PG Integration | **是** | AC-1~AC-6 | 真 pg-boss 入列→消費→冪等→expiration；migration 固定 schema |
| TS-F098-NFR-001~003（月跑期間 API 仍可回應） | 3 | E2E + PG Integration | **是** | F098 spec §1 價值點 / I-TRIGGER-01 | 解 F1：worker 跑 pipeline 時 API 路由仍即時回應 |
| TS-F098-WORKER-001~004（worker entrypoint / docker-compose） | 4 | 靜態 / E2E | 部分 | AC-8 / §5 | worker 不掛 HTTP；共用 flag；不 expose port |
| TS-F098-RG-001~005（回歸基準 / 靜態 guard） | 5 | 靜態 + 既有 spec | 否 | I-TRIGGER-01 / C-1 / C-2 | 既有 pipeline 結果不變；`setImmediate` 移除 grep |
| TS-F098-OQ-001~002（OQ-F098-01 待裁） | 2 | Unit | 否 | OQ-F098-01 | pending 入列失敗 orphan 涵蓋（拍板後啟用） |
| **合計** | **51** | | | | |

> **強制需 Postgres 的案例**（連動 CI 決策，見文末）：TS-F098-PGINT-001~005、TS-F098-NFR-001~003，以及
> TS-F098-RETRY / SER / CANCEL / ORPHAN 群組中標「PG Integration」的子案例（共約 **18** 個案例必須在真 Postgres 執行）。
> 其餘約 33 個案例可在 SQLite / mock 下執行，納入快速 CI。

---

## 1. AC-1 / I-TRIGGER-01：triggerRun 改入列，不在 API 程序執行 pipeline

> **這是 P1 的核心價值斷言**。現行 `triggerRun`（L119）呼叫 `kickoffPipeline` → `setImmediate(runPipeline)`，
> 在 API 程序背景跑 → event loop 阻塞（F1）。P1 後必須改為「只入列、不執行」。

### TS-F098-TRIG-001：triggerRun 通過前置後入列 pg-boss job（不執行 pipeline）
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-1
- **Preconditions**: `assertNoRunningRun` 通過、readiness `allReady=true`；`RunQueueProducer.send` 為 spy；`AssignmentRunPipelineService.runPipeline` 為 spy
- **When**: 呼叫 `triggerRun(ym, actorId)`
- **Then**:
  1. `INSERT assignment_run(status='pending')` 仍發生（沿用既有）
  2. `RunQueueProducer.send` 被呼叫**恰一次**，queue name = `'assignment-run'`，payload = `{ runId: <savedRunId>, ym }`
  3. `runPipeline` spy **未被呼叫**（0 次）
  4. 回傳 `{ runId, status: 'pending', projectWorkym: ym, triggeredAt }`，HTTP 202

### TS-F098-TRIG-002：triggerRun 不再呼叫 kickoffPipeline / setImmediate（I-TRIGGER-01）
- **Test Type**: Negative（不變式）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-1 / I-TRIGGER-01
- **When**: 呼叫 `triggerRun`
- **Then**: `kickoffPipeline`（若保留為 dead method 應移除）不被呼叫；`runPipeline` 不被呼叫；fake timer 下 advance timers 後 `runPipeline` 仍 0 次（證明無 `setImmediate` 殘留背景啟動）
- **驗證方式**: spy on `runPipeline` + `vi.advanceTimersByTime` / flush microtask 後仍 0 次

### TS-F098-TRIG-003：入列發生在 audit log 與 pending INSERT 之後
- **Test Type**: Positive（順序）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-1
- **Then**: 呼叫順序 = `runRepo.save(pending)` → `writeAudit(RUN)` → `RunQueueProducer.send`；確保入列時 run 已存在（避免 worker 取到 job 卻查不到 run 的 race）
- **驗證方式**: mock 呼叫順序斷言（invocationCallOrder）

### TS-F098-TRIG-004：前置驗證失敗時不入列（同月併發 / readiness 未過）
- **Test Type**: Negative | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-1 / AC-4
- **When**: `assertNoRunningRun` 拋 409；或 readiness `allReady=false` 拋 422
- **Then**: `RunQueueProducer.send` **未被呼叫**；不產生 pending run（驗證原子性，避免孤兒 pending）

### TS-F098-TRIG-005：triggerRun 即時返回，不承載 Stage 1~4 運算（event loop 釋放）
- **Test Type**: Positive（非功能語意）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-1
- **Then**: `triggerRun` resolve 後，無任何 pipeline 同步 / microtask 背景任務在 API 程序排程；`send` 為純入列（不 await pipeline）
- **驗證方式**: spy `runPipeline` 0 次 + `send` 立即 resolve（mock 回 jobId）

### TS-F098-TRIG-006：send 回傳 jobId 但 triggerRun 不暴露 jobId 給前端
- **Test Type**: Positive（contract）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-7（C-3：前端只看 `assignment_run.status`）
- **Then**: `TriggerRunResult` 不含 pg-boss `jobId`；前端僅得 `runId` + `status`（佇列傳輸層狀態不外洩）

---

## 2. AC-2 / AC-7：worker 消費並執行 pipeline + status 轉移

### TS-F098-CONS-001：consumer 取得 job → 呼叫 runPipeline(runId, ym)
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-2
- **Preconditions**: 構造 pg-boss job 物件 `{ id, name:'assignment-run', data:{ runId, ym } }`
- **When**: 直接呼叫 `RunQueueConsumer` 的 work handler(job)
- **Then**: `runPipeline` 被以 `(runId, ym)` 呼叫一次；參數取自 `job.data`（非 job 物件本身）
- **驗證方式**: spy `runPipeline`，斷言實參 = `job.data.runId` / `job.data.ym`

### TS-F098-CONS-002：pending → running 轉移（worker work 開始）
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-2 / AC-7
- **Then**: handler 執行使 `assignment_run.status` 由 pending → running（`runPipeline` L109 既有 `update status='running'`）；`started_at` 寫入

### TS-F098-CONS-003：pipeline 成功 → completed + 快照原子寫入
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-2 / AC-7
- **Then**: pipeline 走完 → status='completed'，三份快照 + `ob_monthly_run_result` 寫入（沿用既有 `completeRun`）；P1 不改此結尾邏輯

### TS-F098-CONS-004：pipeline 拋錯 → failed + error_message
- **Test Type**: Negative | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-2 / §9.2
- **When**: `runPipeline` 內部某 stage 拋錯（mock 注入）
- **Then**: status='failed'，`error_message` 為錯誤摘要（沿用既有 try/catch）；handler 對 pg-boss 之回傳須使 job 不重派（配合 retryLimit=0，見 TS-F098-RETRY）

### TS-F098-CONS-005：worker 收到 job 但對應 run 不存在（防禦）
- **Test Type**: Negative（邊界）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-2
- **When**: `job.data.runId` 在 `assignment_run` 查無（極端 race / 手動刪除）
- **Then**: handler 不 crash worker；記 log；job 視為已處理（不無限重派——本就 retry=0）
- **驗證方式**: spy logger，斷言不拋未捕捉例外使 worker 程序退出

### TS-F098-CONS-006：consumer 註冊 queue name 與 producer 一致（contract）
- **Test Type**: Positive（contract）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-2
- **Then**: `pgboss.work` 註冊之 queue name === producer `send` 之 queue name === `'assignment-run'`（防 typo 導致 job 永不被消費）
- **驗證方式**: 共用常數斷言；建議 queue name 為單一匯出常數，spy 註冊參數

---

## 3. AC-3：retryLimit=0（OQ-AD28-04）

### TS-F098-RETRY-001：job 設定 retryLimit=0
- **Test Type**: Positive（config）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-3
- **Then**: `send`（或 queue policy）之 options 含 `retryLimit: 0`
- **驗證方式**: 斷言傳入 `pgboss.send` / queue 設定之 options

### TS-F098-RETRY-002【PG】：handler 拋錯後 pg-boss 不重派
- **Test Type**: Negative | **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: AC-3
- **Preconditions**: 真 pg-boss；handler 計數每次被呼叫次數，首呼即拋錯
- **Then**: handler 僅被呼叫**一次**；job 終態 = `failed`（pg-boss 不自動重跑）；`assignment_run.status='failed'`
- **驗證方式**: 等待 job 終態（polling job state），斷言 handler 計數 === 1

### TS-F098-RETRY-003：失敗後需人工重觸發（不自動恢復）
- **Test Type**: Negative（語意）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-3 / §9.2
- **Then**: 系統無自動「重新入列 failed run」之路徑；重跑須由使用者再次 `triggerRun`（新 run）
- **驗證方式**: grep / 設計檢查無自動 re-send 程式碼路徑（靜態 guard，見 TS-F098-RG-004）

---

## 4. AC-4：單 worker 序列化 + 同月併發保護

### TS-F098-SER-001：worker 併發設定 = 1
- **Test Type**: Positive（config）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-4
- **Then**: `pgboss.work` options `teamConcurrency`（或等效）=== 1
- **驗證方式**: 斷言 work 註冊 options

### TS-F098-SER-002【PG】：兩 job 入列 → 序列化執行（不重疊）
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: AC-4
- **Preconditions**: handler 以 barrier 記錄「進入 / 離開」時間戳；入列兩個 job（不同 ym）
- **Then**: 第二個 job 的「進入」時間 >= 第一個 job 的「離開」時間（無重疊執行）
- **驗證方式**: 時間戳區間不交疊斷言

### TS-F098-SER-003：同月重複觸發被 assertNoRunningRun 擋（不回歸）
- **Test Type**: Negative（回歸）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-4
- **When**: 同月已有 pending/running run，再 `triggerRun`
- **Then**: 拋 409（`assertNoRunningRun` 既有行為）；不入列第二個 job
- **驗證方式**: 沿用既有 `assignment-run.service.spec` 併發保護案例，確認 P1 後仍綠

---

## 5. AC-5：cancellation —— worker 可中斷邊界輪詢並提早結束（修現有 bug）

> 現行 `cancelRun`（L173-216）只改 DB status，註解 L167-168 自承「背景不會立即中斷」。
> P1 須讓**執行中**的 run 被取消時，worker 真正停止後續 stage / 不再寫結果。
> 可中斷邊界（A-2）= 「list 與 list 之間」「stage 與 stage 之間」；`runPipeline` 之 list 迴圈在 L151。

### TS-F098-CANCEL-001：CancellationPoller 偵測 status=failed → 拋 RunCancelledException
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-5
- **Preconditions**: run 執行中（status='running'）；測試於某 list 邊界將 DB status 改為 'failed'（模擬 `cancelRun`）
- **When**: pipeline 抵達下一可中斷邊界，`CancellationPoller` 查 status
- **Then**: 偵測 status='failed' → 拋 `RunCancelledException`，pipeline 提早結束
- **驗證方式**: 注入 poller（極短間隔或邊界直呼 `checkCancelled(runId)`），斷言拋出指定例外型別

### TS-F098-CANCEL-002：取消後不再寫快照 / result
- **Test Type**: Positive（核心）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-5
- **Preconditions**: 多 list run；於第 1 個 list 完成後標 failed
- **Then**: 後續 list 不再處理；三份快照 + `ob_monthly_run_result` 寫入路徑（L215 起）**未被呼叫**；run 維持 status='failed'（不被 pipeline 覆寫回 completed）
- **驗證方式**: spy 快照 repo `save` / `completeRun` → 0 次；spy `ob_monthly_run_result` 寫入 → 0 次

### TS-F098-CANCEL-003：取消發生在 stage 之間亦生效
- **Test Type**: Positive（邊界）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-5 / A-2
- **Then**: 於 Stage 1 與 Stage 2 之間標 failed → 進入 Stage 2 前 poller 偵測 → 提早結束；驗證至少每個 stage 邊界查一次 status

### TS-F098-CANCEL-004：單一 list 處理中途不可中斷（A-2 邊界誠實揭露）
- **Test Type**: Boundary（負面誠實）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-5 / A-2
- **Then**: P1 JS 全載下，單一 list 的同步迴圈內無讓出點 → 該 list 一旦開始即跑完才檢查；測試斷言「取消粒度為 list 級」（不期望 list 中途秒停），避免下游誤以為可即時中斷
- **驗證方式**: 文件化斷言 + poller 只在 list 邊界呼叫（驗證 poll 點位於 list 迴圈頂/底，非 list 內）

### TS-F098-CANCEL-005：cancelRun API 側行為不變（C-2 回歸）
- **Test Type**: Positive（回歸）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-5 / C-2
- **Then**: `cancelRun` 仍標 status='failed' + `error_message='使用者取消'` + audit `CANCEL`（既有，L188-208 不變）；P1 只**新增** worker 側 poller，不改 API 側語意
- **驗證方式**: 沿用既有 `cancelRun` spec 案例確認綠燈

### TS-F098-CANCEL-006【PG】：pending job 取消快路徑（pgboss.cancel）
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: AC-5
- **Preconditions**: job 已入列但 worker 尚未消費（pending 階段）；`cancelRun` 被呼叫
- **Then**: `pgboss.cancel(jobId)` 取消尚未消費之 job → worker 永不執行該 run；`assignment_run.status='failed'`
- **驗證方式**: 真 pg-boss，斷言 handler 從未被呼叫 + job state 為 cancelled

### TS-F098-CANCEL-007【PG】：執行中取消 end-to-end（真 worker 提早結束）
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: AC-5
- **Preconditions**: 真 pg-boss + 真 worker handler，pipeline 以多 list 慢執行（注入可控延遲於 list 邊界）
- **When**: 執行中呼叫 `cancelRun`
- **Then**: worker 於下個 list 邊界停止；`ob_monthly_run_result` 不含該 run 之列；run 終態 failed
- **驗證方式**: 真庫查 `ob_monthly_run_result WHERE run_id=` 為空

---

## 6. AC-6 / §9.2：OrphanReaper —— 殭屍 running 回收

> worker 崩潰（OOM 等）後遺留 `status='running'` 但對應 pg-boss job 已不存在 / 已 expire。
> 偵測**不新增** schema 欄位（OQ-AD28-02），靠 pg-boss job expiration + 逾時 threshold。
> 前例：F038 `OrphanRecoveryService`（onApplicationBootstrap + Test Container）為最近結構參考。

### TS-F098-ORPHAN-001：worker 啟動時掃描 running 且無對應 job → 標 failed
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-6
- **Preconditions**: seed 一筆 `status='running'` 的 run；對應 pg-boss job 不存在（mock job store 回 null / 查無）
- **When**: `OrphanReaper`（worker 啟動 hook，類比 F038 `onApplicationBootstrap`）執行
- **Then**: 該 run → `status='failed'`，`error_message='worker 中斷，請重新觸發'`（精確文案）
- **驗證方式**: 斷言 update set 值；error_message 字串完全相等（含繁中）

### TS-F098-ORPHAN-002：定期掃描亦回收（非只啟動時）
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-6
- **Then**: 定期掃描（可注入週期）執行時同樣回收符合條件之 orphan；驗證掃描週期為可注入參數（測試用極短週期）

### TS-F098-ORPHAN-003：執行中 run（job 仍存在 / 未逾時）不被誤殺（核心邊界）
- **Test Type**: Negative（邊界，防誤殺）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-6 / A-3 / OQ-F098-02
- **Preconditions**: `status='running'` 但對應 job **仍 active / 未 expire**（worker 正常執行中）
- **Then**: OrphanReaper **不**回收；run 維持 running
- **驗證方式**: 斷言 update **未被呼叫**；此為「閾值須大於最長月跑時間以免誤殺」之核心驗證

### TS-F098-ORPHAN-004：剛 expire 邊界 —— 閾值前後分開驗證
- **Test Type**: Boundary | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-6 / A-3
- **Then**:
  - 案例 A：running 時間 = 閾值 − ε（未逾時）→ 不回收
  - 案例 B：running 時間 = 閾值 + ε（已逾時且 job expire）→ 回收
- **驗證方式**: 注入閾值 + mock `started_at` / 時鐘；兩子案例分開斷言（沿用專案邊界值分離慣例）

### TS-F098-ORPHAN-005：completed / failed run 不被 reaper 觸碰
- **Test Type**: Negative | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-6
- **Then**: 只掃 `status='running'`；completed / failed / pending 不在回收範圍（pending 之涵蓋見 OQ-F098-01 / TS-F098-OQ-001）
- **驗證方式**: seed 各 status，斷言僅 running 被更新

### TS-F098-ORPHAN-006：回收後可重新觸發（冪等解鎖）
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-6 / §9.4
- **Then**: orphan 標 failed 後，`assertNoRunningRun(ym)` 不再阻擋同月重新 `triggerRun`（殭屍解除，類比 F038 回收後解鎖 triggerRun）
- **驗證方式**: 回收後呼叫 `assertNoRunningRun` 不拋

### TS-F098-ORPHAN-007【PG】：job expiration 真實觸發 → reaper 回收 end-to-end
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: AC-6 / OQ-AD28-02
- **Preconditions**: 真 pg-boss，`expireInSeconds` 設極短；模擬 worker 取得 job 後「崩潰」（不完成、不 fail handler），留 `status='running'`
- **When**: 等 job expire + OrphanReaper 掃描
- **Then**: run → failed + 正確 error_message；驗證「靠 pg-boss job expiration 偵測」這條真實路徑成立（不靠 schema 欄位）
- **驗證方式**: 真庫查 run 終態 + pg-boss job archive/expired 狀態

---

## 7. PG Integration：真實佇列端到端 + schema migration（強制 Postgres）

### TS-F098-PGINT-001【PG】：入列 → 消費 → completed 全鏈
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: AC-1 / AC-2
- **Then**: 真 `triggerRun` 入列 → 真 worker handler 消費 → `runPipeline` 跑（可用最小 ready list seed）→ status pending→running→completed

### TS-F098-PGINT-002【PG】：pg-boss schema migration 固定版本（OQ-AD28-01）
- **Test Type**: Positive | **Level**: PG Integration / Migration | **需 Postgres**: **是**
- **Related**: F098 spec §6 / OQ-AD28-01
- **Then**: migration（`1711360000299+`）建立 `pgboss` schema（job / archive 表）；migration 後 `boss.start()` 不再自建（或冪等不衝突）；多 worker 首啟不 race
- **驗證方式**: 跑 migration → 查 `pgboss` schema 表存在；模擬兩 worker 並行 `start()` 不報 DDL race（類比 F038 Migration test / M01-migration-test 結構）

### TS-F098-PGINT-003【PG】：冪等 —— 同 runId 重入不雙寫（I-IDEM-01 P1 範圍）
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: §9.4 / A-1
- **Then**: P1 因 retry=0 + 單 worker 序列化，正常路徑不會雙寫；但若同 runId 之 pipeline 實質寫入前，須清該 run_id 既有 result / snapshot（I-IDEM-01）。P1 驗證「不重試 + 序列化」下 `ob_monthly_run_result` 無重複 PK `(run_id,list_no,orgno,appl_no)`
- **驗證方式**: 真庫查無重複 PK
- **註**: P1 不要求 pipeline 內部完整冪等清理（A-1，屬 P2/P3）；本案例只守 P1 邊界不雙寫

### TS-F098-PGINT-004【PG】：job payload contract 真實往返（runId/ym 不失真）
- **Test Type**: Positive（contract）| **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: AC-1 / AC-2 / feedback_mock_real_system_contract
- **Then**: `send({ runId, ym })` 經 pg-boss JSON 序列化往返後，handler `job.data` 取回**完全相等**之 runId（UUID）與 ym（字串，含前導零如 `'202606'`）；驗證序列化不變形
- **驗證方式**: 真庫往返後值相等斷言（防 happy-path 同形式假設踩雷）

### TS-F098-PGINT-005【PG】：worker 重啟後接續消費佇列殘留 job
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是**
- **Related**: AC-2 / §9.2
- **Then**: 入列後 worker 尚未消費即重啟 → 重啟後 worker 仍能取得並消費該 job（job 持久於 Postgres，非記憶體佇列）

---

## 8. 非功能驗收：月跑期間 API 仍可回應（解 F1 的可行驗證）

> F1 = 月跑 pipeline 在 API 同程序卡滿 event loop → 整站逾時。P1 抽離後，pipeline 在 worker 程序，
> API 程序不再承載運算。以下為「月跑期間 API 仍可回應」之**可行**驗證方式（非需 prod 量級壓測）。

### TS-F098-NFR-001【PG / E2E】：worker 跑 pipeline 期間，API 健康 / 查詢端點即時回應
- **Test Type**: Non-Functional（可用性）| **Level**: E2E / PG Integration | **需 Postgres**: **是**
- **Related**: F098 spec §1 價值點 / I-TRIGGER-01
- **Preconditions**: 真 worker 執行一個刻意慢的 pipeline（注入延遲 / 多 list）；API 與 worker 為**分離程序**
- **When**: pipeline 執行中，對 API 發送輕量請求（如 `GET /api/v1/system/...` 或登入 / `getRunById`）
- **Then**: 該請求於合理上限（如 < 1s）回應，**不**逾時；證明 API event loop 未被月跑佔據
- **驗證方式**: 並行請求計時；對比「P1 前同程序版本會逾時」作為說明性基準（非自動門檻）

### TS-F098-NFR-002【Unit】：triggerRun 回應延遲與 pipeline 規模無關
- **Test Type**: Non-Functional（替代性 / CI 友善）| **Level**: Unit | **需 Postgres**: 否
- **Related**: AC-1 / I-TRIGGER-01
- **Then**: `triggerRun` 只做 INSERT + audit + send，回應時間不隨 ready list 數量增長（因不執行 pipeline）；spy 確認 `runPipeline` 0 次即為此性質的**結構性保證**（無需真壓測）
- **驗證方式**: 結構性斷言（runPipeline 不被呼叫）為主；計時為輔
- **註**: 此為 NFR-001 的 CI 可重複替身；真實可用性驗證見 NFR-001（PG/E2E，可僅於 QA 環境跑）

### TS-F098-NFR-003【PG / E2E】：worker OOM 崩潰不影響 API（F2 止血驗證）
- **Test Type**: Non-Functional（隔離）| **Level**: E2E / PG Integration | **需 Postgres**: **是**
- **Related**: F098 spec §1（F2 改炸 worker、不炸 API）/ AC-6
- **When**: worker 程序崩潰（可模擬 kill worker 容器 / 注入 OOM-like throw 使程序退出）
- **Then**: API 程序仍存活、仍回應；崩潰遺留之 running run 由 OrphanReaper 回收（接 TS-F098-ORPHAN-007）
- **驗證方式**: kill worker 後 API 請求成功；run 最終 failed
- **註**: 「kill 容器」屬 docker 操作 / E2E，CI 內可用「worker 程序退出」的 process-level 模擬替代

---

## 9. AC-8 / §5：worker entrypoint / docker-compose（靜態 + E2E）

> 實作細節（檔名 `worker-main.ts`、yaml）由 tdd-implementation 定；測試以「行為 / 結構」斷言。

### TS-F098-WORKER-001：worker entrypoint 不掛 HTTP server / 不 expose port
- **Test Type**: Positive（結構）| **Level**: 靜態 / E2E | **需 Postgres**: 否（靜態）/ 是（E2E）
- **Related**: AC-8
- **Then**: worker bootstrap 不呼叫 `app.listen()`；docker-compose `worker` service 無 `ports` 對外映射
- **驗證方式**: 靜態檢查 worker entrypoint 無 `listen`；解析 compose 確認 worker 無 `ports`

### TS-F098-WORKER-002：worker 共用同一份 apps/api 程式碼（不複製 entity）
- **Test Type**: Positive（結構）| **Level**: 靜態 | **需 Postgres**: 否
- **Related**: AC-8
- **Then**: worker service `build.context: ./apps/api`（與 api 同源）；避免 entity drift
- **驗證方式**: 解析 compose `worker.build.context`

### TS-F098-WORKER-003：worker 取得 pipeline 所需 feature flag
- **Test Type**: Positive（config）| **Level**: 靜態 / Unit | **需 Postgres**: 否
- **Related**: AC-8 / §5
- **Then**: worker 環境含 `ASSIGNMENT_PIPELINE_V2` 等 flag（worker 才是真正執行 pipeline 者）；缺 flag 會導致 v1/v2 分支錯誤
- **驗證方式**: 解析 compose worker env 含必要 flag；或 worker module 啟動時讀取 flag 之測試

### TS-F098-WORKER-004：api service 移除「同程序跑 pipeline」職責 + 加入 producer
- **Test Type**: Positive（結構回歸）| **Level**: 靜態 | **需 Postgres**: 否
- **Related**: §5 / I-TRIGGER-01
- **Then**: api 程序註冊 `RunQueueProducer`；不再註冊 / 啟動會在 api 程序跑 pipeline 的路徑
- **驗證方式**: 靜態檢查（接 TS-F098-RG-001）

---

## 10. 回歸基準與靜態 Guard（結果不變）

> P1 不改演算法 → 既有測試應維持綠燈，作為「結果不變」基準。

### TS-F098-RG-001：grep 確認 triggerRun 不再 setImmediate 跑 pipeline
- **Test Type**: Static Guard | **Level**: 靜態 | **需 Postgres**: 否
- **Related**: I-TRIGGER-01
- **Then**: `assignment-run.service.ts` 中 `triggerRun` 路徑不含 `setImmediate(() => ...runPipeline)` / `kickoffPipeline` 呼叫（若 `kickoffPipeline` 全面移除則 grep 應為零）
- **驗證方式**: fs 讀檔 + regex（沿用 feedback_grep_negative_lookahead：用 fs+regex regression guard，不只靠 Grep tool）

### TS-F098-RG-002：既有 assignment-run-pipeline.*.spec baseline 不變
- **Test Type**: Regression | **Level**: 既有 spec | **需 Postgres**: 否
- **Related**: C-1
- **Then**: P1 後既有 pipeline 結果 / 案件數 baseline 不變（演算法未動）；若有 spec 因「現在由 worker 呼叫」而需調整注入方式，僅改 test harness 不改期望結果
- **驗證方式**: 既有 spec 全綠；列出受影響 spec 清單（見「回歸基準清單」）

### TS-F098-RG-003：既有 assignment-run.service.spec 併發 / readiness / cancel 案例不變
- **Test Type**: Regression | **Level**: 既有 spec | **需 Postgres**: 否
- **Related**: AC-4 / C-2
- **Then**: `assertNoRunningRun`、readiness 422、`cancelRun` 標 failed 等既有案例維持綠（P1 只新增入列 + worker 側 poller）

### TS-F098-RG-004：無自動重新入列 failed run 之路徑（retry=0 語意 guard）
- **Test Type**: Static Guard | **Level**: 靜態 | **需 Postgres**: 否
- **Related**: AC-3
- **Then**: 程式碼無「偵測 failed run 後自動 re-send job」之路徑（重跑須人工 triggerRun）
- **驗證方式**: fs+regex 檢查無自動 re-enqueue 模式

### TS-F098-RG-005：tsc 型別檢查（vitest 不檢型別，US-144 教訓）
- **Test Type**: Static Guard | **Level**: 靜態 | **需 Postgres**: 否
- **Related**: 全部
- **Then**: 實作後須跑 `tsc --noEmit -p tsconfig.build.json` 通過（pg-boss 型別、`RunQueueProducer/Consumer` 簽章、`RunCancelledException` 型別）；vitest 全綠**不等於**型別正確（feedback_vitest_no_typecheck，US-144 登入 500 教訓）
- **驗證方式**: CI 加 tsc gate（連動 CI 決策）

---

## 11. OQ-F098-01 待裁案例（pending 入列失敗 orphan 涵蓋）

> F098 spec §9 / OQ-F098-01：pg-boss 入列失敗導致 `pending` 但無對應 job 之 run，是否由 OrphanReaper 涵蓋？
> spec 建議「涵蓋」。以下案例**待 OQ-F098-01 拍板後啟用**；在此先設計、標 pending。

### TS-F098-OQ-001：入列失敗 → 不留孤兒 pending（即時補償）
- **Test Type**: Negative | **Level**: Unit | **需 Postgres**: 否 | **狀態**: 待 OQ-F098-01
- **When**: `RunQueueProducer.send` 拋錯（DB 不可用）
- **Then（建議案）**: `triggerRun` 回錯誤，且**不**留下孤兒 pending run（同 transaction 回滾 pending INSERT，或標 failed）
- **驗證方式**: 斷言無殘留 status='pending' 且無對應 job 之 run

### TS-F098-OQ-002：OrphanReaper 擴及 pending（事後兜底）
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否 | **狀態**: 待 OQ-F098-01
- **Then（建議案）**: OrphanReaper 掃描 `status='pending'` 且超過閾值仍無對應 job 者 → 標 failed
- **註**: 若 OQ 拍板「不涵蓋 pending」，本兩案例廢棄，改由 TS-F098-OQ-001 即時補償單獨守。

---

## 回歸基準清單（P1 不改演算法，以下既有 spec 須維持綠燈）

| 既有 spec / 測試 | 為何是基準 | P1 後預期 |
|---|---|---|
| `assignment-run-pipeline.service.spec.ts`（Stage 1~4 結果 / 案件數 baseline） | 演算法未動 | 結果不變；至多改 harness（pipeline 改由 worker 呼叫的注入方式） |
| `assignment-run.service.spec.ts`（triggerRun 前置 / readiness / 併發 / cancelRun） | API 側語意只新增入列、不改既有驗證 | 全綠；新增入列 spy 斷言 |
| F091 / F094 既有 Stage 1 / result 表測試 | pipeline 內部寫入目標不變（F098 spec §8） | 不受影響 |
| F062 `getRunById` polling 讀 status | 前端只讀 `assignment_run.status`（C-3） | 不受影響 |

---

## 風險與待決（彙整至 risks-and-gaps.md）

| ID | 風險 / 待決 | 等級 | 處置 |
|---|---|---|---|
| RISK-F098-001 | OrphanReaper 閾值設太短 → 誤殺執行中長月跑（P1 JS 版最壞數十分鐘） | 高 | TS-F098-ORPHAN-003/004 守邊界；閾值須 > 最長月跑時間（OQ-F098-02 由 tdd-implementation 定，測試環境可注入縮短） |
| RISK-F098-002 | mock pg-boss 用 happy-path 同形式假設（payload 直接當參數、自動重派） | 高 | 「mock 模擬真實 contract」段 + TS-F098-PGINT-004 真庫往返驗證 |
| RISK-F098-003 | CI 未起 Postgres → PGINT / NFR 群組（18 案例）無法執行，pg-boss 真實行為失覆蓋 | 高 | CI 決策：必須能起 Postgres Test Container（與 F038 / F075 / M01 PG 整合慣例一致） |
| RISK-F098-004 | 單一 list 內無讓出點 → 取消「秒停」期待落空 | 中 | TS-F098-CANCEL-004 誠實揭露取消粒度為 list 級 |
| RISK-F098-005 | vitest 不檢型別 → pg-boss 型別錯誤潛伏至 prod build（US-144 教訓） | 中 | TS-F098-RG-005 強制 tsc gate |
| OQ-F098-01 | 入列失敗之 pending run 是否由 OrphanReaper 涵蓋 | — | TS-F098-OQ-001/002 待裁；spec 建議涵蓋 |
| OQ-F098-02 | OrphanReaper 掃描週期 / job expiration 具體數值 | — | tdd-implementation 依最長月跑時間 + 安全邊際定；測試以可注入閾值驗邏輯 |

---

## tdd-implementation 注意事項（交接）

1. **I-TRIGGER-01 是驗收紅線**：`triggerRun` 改完後，spy `runPipeline` 必須 0 次；保留 `kickoffPipeline` dead code 會讓 TS-F098-RG-001 失敗 —— 請直接移除其 `setImmediate` 路徑。
2. **queue name / payload 用單一匯出常數**：避免 producer / consumer typo 導致 job 永不被消費（TS-F098-CONS-006）。
3. **poller 與 reaper 閾值 / 週期必須可注入**（env / config），否則測試只能等真實逾時 → 不可行（TS-F098-CANCEL / ORPHAN 全群組依賴此）。
4. **OrphanReaper 結構可參考 F038 `OrphanRecoveryService`**（`onApplicationBootstrap` + Test Container），但本案在 **worker** 程序啟動，不在 api。
5. **error_message 文案精確**：`'worker 中斷，請重新觸發'`（前端 F062 直接顯示），勿改字。
6. **pg-boss schema 走 migration（`1711360000299+`）**，不可只靠 worker 首啟自建（多 worker race）；dev 仍 synchronize，但 pg-boss schema 非 TypeORM entity，須 migration 包 DDL（OQ-AD28-01）。
7. **實作後跑 `tsc --noEmit -p tsconfig.build.json`**（TS-F098-RG-005）；vitest 全綠不代表型別正確。
8. **AssignmentRun seed 四欄位必填**（run_id / project_workym / triggered_by / created_at），PG Integration / orphan seed 缺一即 NOT NULL 失敗（feedback_assignment_run_e2e_seed）。
9. **CI 必須能起 Postgres**：18 個 PGINT / NFR 案例強制需真 pg-boss；沿用專案既有 Test Container 慣例（F038 / F075 / M01）。
