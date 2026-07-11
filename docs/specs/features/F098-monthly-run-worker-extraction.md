---
spec-id: F098
title: 月名單分派 Worker 抽離（pg-boss 入列 + cdmp-worker 容器 + cancellation / orphan 回收）
feature-id: F098
source-story: AD 驅動（AD-E07-28 P1）
epic: E07
module: M04 分派執行（月名單分派執行模型重構 P1）
priority: P0-MVP
version: "1.0"
date: 2026-06-02
status: Draft
---

# F098: 月名單分派 Worker 抽離（AD-E07-28 P1）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-02

> ⚠️ **執行模型變更警告（必讀）**：本 feature 將月名單分派 pipeline 之執行容器由「cdmp-api 同程序 `setImmediate` 背景跑」改為「入列 pg-boss job → 獨立 `cdmp-worker` 容器消費」。**P1 不改 pipeline 內部演算法**（Stage 1~4 仍為現行 JS 版），僅更換執行容器並補齊 cancellation / orphan 回收。此變更解決 [AD-E07-28 §1](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) 之 **F1（event loop 阻塞 → 月名單分派期間整站 API 逾時）**；F2（OOM）於 P1 尚未解，但 OOM 改炸 worker 程序、不再炸 API（整站不再 500），此即 P1 之「先止血」價值。
>
> **v1.0（2026-06-02 / AD-E07-28 P1）**：依 [AD-E07-28](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) §5「P1 — Worker 抽離」與 [architecture-spec.md §5.13](../architecture-spec.md) 落地。已拍板決策（不需再問）：佇列 = **pg-boss**（靠現有 Postgres，免 Redis）；新增獨立 `cdmp-worker` 容器；月名單分派 job `retryLimit=0`（OQ-AD28-04）；單 worker 序列化（OQ-AD28-05，沿用 `assertNoRunningRun` 同月保護）；orphan 偵測靠 pg-boss job expiration、不新增 schema 欄位（OQ-AD28-02）。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md` / AD 文件（system-architect 維護，AD-E07-28 為權威）；不撰寫 production / test 程式碼（tdd-implementation / test-designer 承接）；不跑 migration、不做 docker 操作；Stage 1~4 演算法不變（P2/P3 才下推 SQL，見 [F099](F099-stage1-sql-pushdown.md) / [F100](F100-stage2-4-sql-pushdown-scoring.md)）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [AD-E07-28 §4~§9](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)（**權威**）+ [architecture-spec.md §5.13.2 / §5.13.3 / §5.13.6 / §5.13.7](../architecture-spec.md) + `apps/api/src/modules/assignment/services/assignment-run.service.ts`（`kickoffPipeline` L257 / `triggerRun` / `cancelRun` L160~216）+ `assignment-run-pipeline.service.ts`（`runPipeline`） |
| Test Designer | 本文件 §4 AC + §10 測試覆蓋點名 + [AD-E07-28 §9 狀態機 / §10 風險](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) |
| DevOps / CI/CD | 本文件 §5（docker-compose worker service）+ §6（pg-boss schema migration）+ [architecture-spec.md §5.13.7](../architecture-spec.md) + [AD-E07-28 §7~§8](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) |
| Architect | 本文件 + [AD-E07-28](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) |
| 圖表 | [diagrams/F098-worker-extraction-flow.mmd](../diagrams/F098-worker-extraction-flow.mmd) |

---

## 1. 功能摘要

將月名單分派觸發由「`AssignmentRunService.kickoffPipeline()` 之 `setImmediate(() => pipeline.runPipeline(...))`」改為「`triggerRun` 入列 pg-boss job → 立即回 202」，由新增的獨立 `cdmp-worker` 容器以 pg-boss work handler 消費並執行**現行** `runPipeline(runId, ym)`。同時補齊兩個現況缺陷：(a) **cancellation**——worker 內 `CancellationPoller` 於可中斷邊界輪詢 `assignment_run.status`，被使用者取消（標 `failed`）則提早結束 pipeline（修復 `cancelRun` 註解自承「背景不會真停」）；(b) **orphan 回收**——`OrphanReaper` 掃描 `status='running'` 但對應 pg-boss job 已消失 / 逾時（worker 崩潰遺留）之 run，標為 `failed`。

## 2. 使用者故事

**As a** 分派維運人員 / 系統使用者
**I want** 月名單分派執行時不再卡死整站 API（含登入、查詢、其他 E07 寫入），且使用者取消月名單分派能真正停止背景運算、worker 崩潰遺留的 running run 能被自動回收
**So that** 月名單分派期間網頁維持可用、取消行為符合預期、不會留下永久卡在 running 的殭屍 run

## 3. 前置條件

- `assignment_run` 表已存在（`run_id` UUID PK、`status` 欄位、`error_message` 欄位）。
- 現行月名單分派 pipeline（`AssignmentRunPipelineService.runPipeline()`）可用且可被 worker entrypoint 注入。
- 現有 `triggerRun` 前置驗證鏈（`assertNoRunningRun` 同月保護、readiness 前置條件）保留不變。
- PostgreSQL 16 為唯一資料庫（pg-boss `pgboss` schema 與 `cdmp_dev` 同庫）。
- 現有 `ASSIGNMENT_PIPELINE_V2` 等 feature flag 環境變數。

## 4. 驗收標準

### AC-1：`triggerRun` 改為入列 pg-boss job，立即回 202

- **Given** 使用者觸發月名單分派且通過現有前置驗證（`assertNoRunningRun` + readiness）
- **When** `triggerRun` 執行
- **Then** `INSERT assignment_run(status='pending')`（不變），接著呼叫 `pgboss.send('assignment-run', { runId, ym })` 入列 job，**立即**回應 `202 { runId, status: 'pending' }`
- **And** `triggerRun` **不再**呼叫 `kickoffPipeline()` / `setImmediate(() => pipeline.runPipeline(...))`（同程序背景啟動路徑移除）
- **And** API event loop 於回應後立即釋放（不承載任何 Stage 1~4 運算）

> **不變式 I-TRIGGER-01**：`triggerRun` 回應後，cdmp-api 程序不得執行任何 Stage 1~4 pipeline 運算；pipeline 一律於 cdmp-worker 程序執行。

### AC-2：worker 容器消費 job 並執行現行 pipeline

- **Given** pg-boss job `assignment-run` 已入列
- **When** cdmp-worker 之 `RunQueueConsumer`（`pgboss.work('assignment-run', handler)`）取得 job
- **Then** `UPDATE assignment_run SET status='running'`，呼叫現行 `runPipeline(runId, ym)`（P1 演算法不變）
- **And** pipeline 成功完成 → 原子寫入三份快照 + `UPDATE status='completed'`（沿用現有 pipeline 結尾邏輯）
- **And** pipeline 拋錯 → `UPDATE status='failed', error_message=<錯誤摘要>`（沿用現有 try/catch）

### AC-3：月名單分派 job 不自動重試（retryLimit=0）

- **Given** pg-boss `assignment-run` queue / job 設定
- **When** 設定 retry 參數
- **Then** `retryLimit=0`（OQ-AD28-04 拍板：未冪等前防雙寫）；月名單分派 job 失敗一律標 `failed`，由人工重新觸發，不由 pg-boss 自動重跑

> **[ASSUMPTION] A-1**：`retryLimit=0` 為已拍板（OQ-AD28-04）。冪等清理（I-IDEM-01）於 P2/P3 SQL 下推時實作完整（見 [F099 §4](F099-stage1-sql-pushdown.md)）；P1 因 retry=0 且單 worker 序列化，重複寫入風險已由「不重試 + `assertNoRunningRun`」阻斷，P1 不要求 pipeline 內部冪等清理。

### AC-4：單 worker 序列化執行

- **Given** cdmp-worker 啟動 pg-boss work handler
- **When** 設定併發參數
- **Then** worker 併發 = 1（`teamSize` / `teamConcurrency` 等效設定為 1），月名單分派序列化執行（OQ-AD28-05 拍板）
- **And** 同月併發仍由現有 `assertNoRunningRun`（API 側）阻擋；跨月併發於 P1 不開放（單 worker 自然序列化）

### AC-5：cancellation —— worker 可中斷邊界輪詢並提早結束

- **Given** 月名單分派於 worker 執行中（`status='running'`），使用者呼叫 `cancelRun`
- **When** `cancelRun` 標記 `assignment_run.status='failed'` + audit `CANCEL`（API 側，**不變**）
- **And** worker 內 `CancellationPoller` 於**可中斷邊界**（每處理完一份 list、每個 Stage 之間）查詢 `assignment_run.status`
- **Then** 若偵測到已被標 `failed`，拋 `RunCancelledException` 使 pipeline 提早結束，**不再**寫快照 / result
- **And** pg-boss `cancel(jobId)` 可取消**尚未被消費**之 job（pending 階段取消的快路徑）

> **[ASSUMPTION] A-2**：「可中斷邊界」於 P1 為「list 與 list 之間」「Stage 與 Stage 之間」。P1 pipeline 仍 JS 全載，單一 list 的同步 JS 迴圈內無讓出點，故 P1 之取消粒度為 list 級（與 P2/P3 SQL 下推後一致，見 [AD-E07-28 §9.3](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)）。**輪詢間隔（每 N 秒 / 每邊界一次）由 tdd-implementation 定，本 spec 要求「至少每個 list/stage 邊界查一次」。**

### AC-6：orphan 回收 —— 掃描並標記殭屍 running run

- **Given** worker 崩潰（如 OOM）遺留 `assignment_run.status='running'` 但對應 pg-boss job 已不存在 / 已 expire
- **When** `OrphanReaper` 於 worker 啟動時 + 定期掃描
- **Then** 將該 run 標為 `status='failed', error_message='worker 中斷，請重新觸發'`
- **And** orphan 偵測靠 pg-boss job expiration + 逾時 threshold（OQ-AD28-02 拍板：**不新增 `worker_id` / `heartbeat_at` schema 欄位**）

> **[ASSUMPTION] A-3**：orphan 偵測閾值（pg-boss job expiration 時間 / 掃描週期）由 tdd-implementation 對齊月名單分派預期最長執行時間設定（P1 為 JS 版，最壞案例可達數十分鐘，閾值須大於此以免誤殺執行中 run）。錯誤訊息文案 `'worker 中斷，請重新觸發'` 為本 spec 指定（前端 `F062` polling 顯示此 `error_message`）。

### AC-7：run 狀態機（業務層，語意不變，新增轉移來源）

- **Given** 月名單分派生命週期
- **When** 各事件發生
- **Then** 狀態轉移符合：`pending`（triggerRun 入列）→ `running`（worker work() 開始）→ `completed`（pipeline 成功 + 快照原子寫入）/ `failed`（pipeline 錯誤 / OOM 被 reaper 標記 / 使用者 cancelRun）
- **And** 前端 / 使用者僅讀 `assignment_run.status`（業務領域狀態）；pg-boss job 狀態（created/active/completed/failed/cancelled）為佇列傳輸層狀態，不直接暴露給前端

> 狀態圖見 [diagrams/F098-worker-extraction-flow.mmd](../diagrams/F098-worker-extraction-flow.mmd) 與 [AD-E07-28 §9.1](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)。狀態雙寫不衝突原則見 [AD-E07-28 §4.3](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)。

### AC-8：worker entrypoint 共用既有 NestJS module

- **Given** cdmp-worker 容器
- **When** 啟動
- **Then** 以同一份 `apps/api` 程式碼啟動，bootstrap 為 worker entrypoint（**非** `app.listen()`），只註冊 pipeline + queue consumer 所需 provider，**不掛 HTTP server / 不 expose port**
- **And** `ASSIGNMENT_PIPELINE_V2` 等 flag 須供 worker（worker 才是真正執行 pipeline 者）

## 5. docker-compose 變更（概念層，最終 yaml 由 tdd-implementation 定）

| Service | 變更 |
|---------|------|
| `worker`（**新增**） | `build.context: ./apps/api`、`target: dev`；`command` 改為 worker entrypoint（如 `npx ts-node -r tsconfig-paths/register src/worker-main.ts`，實際檔名由 tdd-implementation 定）；共用與 `api` 相同的 `DB_*` / AES / feature-flag 環境變數；`depends_on: postgres (healthy)`；**不 expose port** |
| `api` | 移除「同程序跑 pipeline」職責（`kickoffPipeline` 路徑）；新增 pg-boss producer 初始化（`RunQueueProducer`） |
| `postgres` | 不變（pg-boss `pgboss` schema 同庫，**不新增 Redis、不新增第二資料庫**） |

> 元件圖 / 資料流見 [architecture-spec.md §5.13.2](../architecture-spec.md)（目標元件與資料流）+ [AD-E07-28 §8](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)。

## 6. schema 變更與 migration 要求

| 變更項 | dev（synchronize） | prod / 新 DB（migration） |
|--------|-------------------|--------------------------|
| pg-boss `pgboss` schema（job / archive 表） | pg-boss `boss.start()` 自建（非 TypeORM entity，synchronize 不涉入） | **須提供 migration 包 DDL** 固定 pg-boss schema 版本（OQ-AD28-01 拍板），避免 prod 多 worker 首啟 race；不可僅依賴 worker 首啟自建 |
| orphan 偵測欄位 | 無（OQ-AD28-02：不新增 `worker_id` / `heartbeat_at`） | 無 |

> **專案慣例**：dev DB 靠 `synchronize:true`、`migration:run` 不可用於 dev；prod / 新 DB 走 migration runner。**pg-boss schema 雖非 TypeORM entity，仍須以 migration 形式固定其 DDL（OQ-AD28-01 拍板採此方案）**，使 prod 部署可版本化、可重現、防多 worker 首啟 race。詳見 [AD-E07-28 §7](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) 與 [architecture-spec.md §5.13.7](../architecture-spec.md)。

## 7. 假設與約束

> **AD OQ 採納狀態（2026-06-02 ratified，非待裁）**：以下四項 AD-E07-28 之 OQ 已由使用者於 2026-06-02 採納其預設決議，本 feature 以**既定約束**形式落地（**不**列為 open question）：
> - **OQ-AD28-01 = pg-boss schema 用 migration 包 DDL**（§6 / AC 對齊；prod 版本化、防多 worker 首啟 race）
> - **OQ-AD28-02 = orphan 靠 pg-boss job expiration、不新增 schema 欄位**（AC-6；無 `worker_id` / `heartbeat_at`）
> - **OQ-AD28-04 = 月名單分派 job retry=0**（AC-3 / A-1；未冪等前防雙寫）
> - **OQ-AD28-05 = 單 worker 序列化**（AC-4；沿用 `assertNoRunningRun` 同月保護）
>
> （OQ-AD28-03 portability 選項 A 屬 [F099](F099-stage1-sql-pushdown.md) 範疇、已採納；OQ-AD28-06 / OQ-F100-01 st4_exchange 配對交換 fidelity 屬 [F100](F100-stage2-4-sql-pushdown-scoring.md) 範疇、亦已採納 = 對齊現行 JS 簡化版。AD-E07-28 之 6 個 OQ-AD28-* 全數已採納，無待裁業務 open question。）

- **[ASSUMPTION] A-4**：pg-boss queue name 為 `'assignment-run'`，job payload 為 `{ runId, ym }`（沿用 AD-E07-28 圖示；實際欄位名由 tdd-implementation 對齊 `triggerRun` 之既有變數）。
- **[CONSTRAINT] C-1**：P1 **不**改 Stage 1~4 演算法，不下推 SQL；F2（OOM）於 P1 仍可能發生，但僅炸 worker 程序、不炸 API。
- **[CONSTRAINT] C-2**：`cancelRun` API 側行為（標 `failed` + audit）不變；新增的只有 worker 側的 `CancellationPoller` 偵測與提早結束。
- **[CONSTRAINT] C-3**：狀態雙寫（pg-boss job 狀態 vs `assignment_run.status`）各自權威，不互相覆寫；前端只看 `assignment_run.status`。

## 8. 相依關係

- **前置**：無（P1 可獨立交付）。
- **被依賴**：[F099](F099-stage1-sql-pushdown.md)（P2 Stage 1 SQL 下推需 worker 容器作為「不影響 API」的安全執行環境）→ [F100](F100-stage2-4-sql-pushdown-scoring.md)（P3）。
- **修訂既有**：本 feature 改變 [F061](F061-trigger-assignment-run.md) 之觸發執行模型（同程序 → 入列 worker）；F061 之前置驗證、快照原子性、`MONTHLY_RUN_BLOCKED_LIST_NOT_READY` 等業務語意**不變**，僅執行容器與啟動方式改變。
- **不影響**：[F062](F062-view-run-progress.md)（polling `getRunById` 讀 `assignment_run.status` 不變）、[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) / [F094](F094-monthly-run-result-table.md)（pipeline 內部寫入目標不變）。

## 9. 錯誤情境

| 情境 | 系統回應 |
|------|---------|
| pg-boss 入列失敗（DB 不可用） | `triggerRun` 應回錯誤、不留下孤兒 `pending` run（或事後由 OrphanReaper 處理）。**[OQ-F098-01]**：`pending` 但入列失敗之 run 是否由 OrphanReaper 涵蓋（掃 `pending` 且無對應 job）？建議涵蓋。 |
| worker 崩潰（OOM 等） | OrphanReaper 標 `failed`（AC-6）；整站 API 不受影響（不再 500） |
| 使用者取消執行中月名單分派 | `CancellationPoller` 於下個可中斷邊界拋 `RunCancelledException`，run 維持 `failed`（AC-5） |

> 既有錯誤碼沿用，本 feature **不新增錯誤碼**（cancellation / orphan 走 `status='failed'` + `error_message` 文案，非 HTTP 錯誤碼）。

## 10. 測試覆蓋點名（test-designer / tdd 承接）

| 項目 | 承接 agent | 覆蓋要求 |
|------|-----------|---------|
| `triggerRun` 改入列、不再 setImmediate（I-TRIGGER-01） | test-designer | 斷言 `triggerRun` 後 `pgboss.send` 被呼叫、`kickoffPipeline` 未被呼叫、立即回 202 |
| worker consumer 消費 → status 轉移（AC-2 / AC-7） | test-designer | pending → running → completed/failed 全路徑 |
| cancellation 提早結束（AC-5） | test-designer | 取消後不再寫快照 / result；`RunCancelledException` 於可中斷邊界拋出 |
| orphan 回收（AC-6） | test-designer | 模擬 running + job 消失 → reaper 標 failed + 正確 error_message |
| retryLimit=0（AC-3）/ 單 worker 序列化（AC-4） | test-designer | job 失敗不自動重跑；併發 = 1 |
| worker entrypoint / docker-compose worker service / pg-boss schema migration（§5 / §6） | tdd-implementation + DevOps | worker 不掛 HTTP；migration 固定 pg-boss schema |
| OQ-F098-01（pending 入列失敗 orphan 涵蓋） | test-designer | 待 OQ 拍板後補 |

## 11. Open Questions

| ID | 問題 | 影響 | 建議 |
|----|------|------|------|
| **OQ-F098-01** | pg-boss 入列失敗導致 `pending` 但無對應 job 之 run，是否由 OrphanReaper 一併掃描回收（擴及 `pending`）？ | 孤兒 run 清理完整性 | 建議涵蓋：OrphanReaper 同時掃 `pending` 且超過閾值無對應 job 者，標 `failed` |
| **OQ-F098-02** | OrphanReaper 掃描週期與 pg-boss job expiration 閾值之具體數值（須大於 P1 JS 版月名單分派最長執行時間以免誤殺）？ | orphan 偵測準確度 | 由 tdd-implementation 依 dev/prod 觀測之最長月名單分派時間設定（含安全邊際） |

## 12. 相關

- AD：[AD-E07-28 §5 P1](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)
- 架構：[architecture-spec.md §5.13](../architecture-spec.md)
- 圖表：[diagrams/F098-worker-extraction-flow.mmd](../diagrams/F098-worker-extraction-flow.mmd)
- 下一階段：[F099](F099-stage1-sql-pushdown.md)（P2）、[F100](F100-stage2-4-sql-pushdown-scoring.md)（P3）
- 修訂：[F061](F061-trigger-assignment-run.md)（觸發執行模型）
