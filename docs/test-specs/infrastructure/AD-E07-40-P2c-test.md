---
type: test-design-infrastructure
test-spec-id: AD-E07-40-P2c
feature_name: MSSQL 全面遷移 P2c — Expire Sweep 整合 + 兩層回收一致性 + 全 F098 套件整體回歸
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-40-mssql-p2-self-built-queue.md（§2.3 expire sweep T-SQL、§4.3 掛載點（未定案，交 tdd-implementation 依現行風格擇一）、§7 P2c DoD、§3 OrphanReaper/CancellationPoller 零改動、§8 不變式、§9.2 雙層回收可觀測性殘留風險）
  - /docs/specs/implementation-log/AD-E07-40-P2a-impl.md（`MssqlQueueService.expireSweep()` 已完成簽章：**無** `now` 參數，與 `OrphanReaper.reap(now)` 不同；D-CLAIM-01 CTE 投影修正）
  - /docs/specs/implementation-log/AD-E07-40-P2b-impl.md（`processPayload`/`RunQueueConsumer`/`RunQueueProducer` 現況；REG-004 補充記錄 `TS-F098-PGINT-002` pre-existing 失敗根因，本文件 REG 群組沿用同一排除理由）
  - /docs/test-specs/infrastructure/AD-E07-40-P2a-test.md（`SWEEP-001~005` 已完整覆蓋 `expireSweep()` 單元語意，本文件不重複；`STATIC-003` 為單一位置守門鏈起點）
  - /docs/test-specs/infrastructure/AD-E07-40-P2b-test.md（`STATIC-002` 為單一位置守門鏈延續，本文件 STATIC 群組再延續一棒）
  - apps/api/src/modules/assignment/queue/orphan-reaper.ts（`reap(now)` 注入時鐘慣例 + `onApplicationBootstrap`/`OnModuleDestroy`/`unref` 生命週期模式，MOUNT 群組直接沿用同一寫法）
  - apps/api/src/modules/assignment/queue/mssql-queue.service.ts（`expireSweep()` 現行簽章：`async expireSweep(): Promise<void>`，無參數）
  - apps/api/src/modules/assignment/assignment-worker.module.ts
  - apps/api/src/modules/assignment/queue/__tests__/f098-*.spec.ts（7 檔，REG 群組整體重跑對象）
  - apps/api/src/modules/assignment/queue/__tests__/f098-static-guards.spec.ts（`TS-F098-PGINT-002` 既有斷言原始碼，REG 群組排除項根因）
  - apps/api/src/modules/assignment/queue/__tests__/ad-e07-40-p2a.mssql.spec.ts／ad-e07-40-p2b.spec.ts／ad-e07-40-p2b.mssql.spec.ts（REG 群組一併整體重跑對象）
  - docker-compose.yml（`worker:` service `environment:` 區塊，STATIC-001 驗證對象；服務鍵為 `worker:`，`container_name: cdmp-worker`——AD §7 DoD#4 原文用「cdmp-worker」指的是 container_name，非 compose 服務鍵，比照既有 `TS-F098-WORKER-001b` 之 slice 方式）
covers: []
spec_version: "1.0"
date: 2026-07-07
last_updated: 2026-07-07
---

# AD-E07-40 P2c：MSSQL 全面遷移 — Expire Sweep 整合 + 兩層回收一致性 + 全 F098 套件整體回歸 — 測試設計

> 本文件覆蓋 AD-E07-40「MSSQL 全面遷移 P2（自建 T-SQL 佇列，取代 pg-boss）」之 **P2c 切片（P2 最後一片）**（§2.3 expire sweep T-SQL + §4.3 掛載點 + §7 P2c DoD）。
> P2 不經 spec-writer（AD-E07-40「是否需要 spec-writer」已裁定，比照 AD-E07-38 §3 D-7 先例）；本文件依 system-architect 產出之 AD-E07-40 §2.3/§4.3/§7/§3/§8/§9.2 直接產出測試設計，交 tdd-implementation。
>
> **範圍**：`MssqlQueueService.expireSweep()`（P2a 已完成、黑盒依賴，不重測其 SQL 本身正確性）之**定時掛載**（機制未定案，交 tdd-implementation 依現行風格擇一，見 §0.4）＋**兩層回收（佇列層 `queue_job.state='expired'` vs 業務層 `assignment_run.status='failed'`）獨立性與一致性**（本文件旗艦群組，AD §7 DoD #2）＋**全 F098 套件於 mssql 分支之最終整體重跑**（AD §7 DoD #3）＋`docker-compose.yml` `RUN_QUEUE_POLL_INTERVAL_MS` 環境變數補齊（AD §7 DoD #4）。
> **明確排除（P2a/P2b 已完成，本文件不重複）**：`MssqlQueueService` 五操作本身正確性（含 `expireSweep()` 之 SQL 語意，P2a `SWEEP-001~005` 59/59 綠）、`RunQueueProducer`/`RunQueueConsumer` mssql 分支接線與輪詢 loop（P2b 44/44 綠）、`OrphanReaper`/`CancellationPoller` 之業務邏輯本身（`reap()`/`pollForCancellation()`——本文件僅驗證其於「雙層回收」情境下與佇列層之互動結果，不重新驗證既有 `f098-orphan-reaper.spec.ts`/`f098-cancellation.spec.ts` 已覆蓋之單元邊界）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-40-mssql-p2-self-built-queue.md`（§2.3/§4.3/§7）+ `AD-E07-40-P2a-impl.md`（`expireSweep()` 現行簽章，**無** `now` 參數）+ `AD-E07-40-P2b-impl.md`（`processPayload`/driver 判定現況，CRASH-010 之防線依據）+ 既有 `orphan-reaper.ts`（生命週期模式直接沿用）+ 既有 `f098-orphan-reaper.spec.ts`（`reap(now)` 注入時鐘 harness 建構風格沿用）+ `mssql-queue.service.ts`（`expireSweep()` 簽章） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P2c 風險段落） |
| DevOps / CI/CD | 本文件「三、STATIC」群組（`docker-compose.yml` `RUN_QUEUE_POLL_INTERVAL_MS` 缺口，AD §7 DoD #4）+「四、REG」群組（CI 整體重跑腳本設計 + 已知失敗排除清單維護責任） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 gating helper + P2a/P2b schema 隔離慣例（新增 `p2c_e2e`）

RECOVERY 群組沿用 `mssql-env-preload.ts`（`mssqlPortReachable()`/`restoreDbType()`/`SKIP_REASON`），連不上 MSSQL 容器 → 整檔 `describe.skip`，不假造綠燈。使用獨立 schema `p2c_e2e`（不與既有 `dbo`/`p1a`/`p1b1`/`p1b2_sync`/`p1b3`/`p2a_sync`/`p2a_baseline`/`p2b_e2e` 交集），內含 `AssignmentRun` + `QueueJob` 兩表（P1b1/P2a 已各自驗證其 MSSQL 型別轉換，可直接 `synchronize`）。

### 0.2 兩檔分流

| 新檔案 | 群組 | 是否需真實 MSSQL |
|---|---|---|
| `queue/__tests__/ad-e07-40-p2c.spec.ts` | 一 MOUNT／三 STATIC | 否（fake `MssqlQueueService` spy + `vi.useFakeTimers()` + fs/regex 靜態掃描） |
| `queue/__tests__/ad-e07-40-p2c.mssql.spec.ts` | 二 RECOVERY | 是 |
| （無新檔，重跑既有＋新增） | 四 REG | 部分 |

### 0.3 🔴 關鍵澄清：`expireSweep()` **無** injectable `now` 參數，與 `OrphanReaper.reap(now)` 之注入時鐘機制不對稱

P2a 已定案之簽章為 `async expireSweep(): Promise<void>`（`mssql-queue.service.ts:113`），**不接受**任何時間參數——SQL 內以 DB 端 `SYSUTCDATETIME()` 判定，非 app 端傳入值。這與 `OrphanReaper.reap(now: Date = new Date())` 之注入時鐘慣例**不對稱**：後者可用固定 `now` 常數 + 固定 `startedAt`/`createdAt` 種子資料直接算出「是否逾時」，前者必須沿用 P2a `SWEEP-001` 已驗證之技術——**直接以 SQL 竄改種子列的 `expire_at` 至過去**（而非真實 `sleep`），才能控制 sweep 是否判定逾時。**本文件 RECOVERY 群組統一採此技術**：`claimNext()` 後立即以 `dataSource.query('UPDATE ... SET expire_at = DATEADD(SECOND,-100,expire_at) WHERE id=@0', [jobId])` 撥至過去；`OrphanReaper` 側則沿用其既有 `reap(now)` 注入時鐘。**兩層「控制時間」的手法本質不同，此非疏漏，記入 §一 MOUNT 群組設計說明與 `risks-and-gaps.md`，避免未來誤以為兩者可用同一套 harness 工具。**

### 0.4 🔴 掛載機制未定案 — 決策關卡，MUST 避免預設答案（比照既有 `SCHEMA-010`/`POLL-010` 決策關卡精神）

AD §4.3 原文明確**不強制**掛載方式：「搭 `OrphanReaper` 既有的 `reaperIntervalMs` 定時器一起跑（同一個 `setInterval` 內多執行一句 SQL）」**或**「讓 `MssqlQueueService` 自行內部啟動 timer」，**兩者擇一交 tdd-implementation 依現行程式碼風格決定，架構上不強制統一**。test-designer 依角色分工**不得替 tdd-implementation 決定實作細節**，故本文件之 MOUNT 群組設計為**黑盒觀察式**：一律以 `vi.spyOn`/fake `MssqlQueueService.expireSweep` 驗證「該方法是否於預期時機被呼叫」，不預設呼叫者是 `OrphanReaper`（擴充既有類別）還是一個新建的獨立 provider（如 `MssqlQueueExpiryReaper`）。**MOUNT-001 為本群組之決策記錄案例**（非阻擋，但 MUST 執行）：要求 tdd-implementation 於 `AD-E07-40-P2c-impl.md` 之 Architectural Decisions 段落（比照 P2b impl log 之 AD-1~AD-4 編號慣例，接續編為 AD-5）明確記錄選擇之方案與具體 class/method 名稱，供未來讀者與 REG 群組的靜態守門對齊。

### 0.5 RECOVERY 群組 Harness 設計（真實 MSSQL，最小化依賴，比照既有 F098 PGINT / P2b E2E 精簡精神）

不透過 NestJS 完整 bootstrap `AssignmentModule`/`AssignmentWorkerModule`（會牽連 ETL/計分等非本輪依賴）。直接：
- `new MssqlQueueService(dataSource)`（P2a 已驗證黑盒依賴，比照 P2a §0.5 建構方式）。
- 以最小 `TestingModule`（`TypeOrmModule.forRoot(mssqlOptions('p2c_e2e'))` + `TypeOrmModule.forFeature([AssignmentRun])` + `OrphanReaper` provider + `RUN_QUEUE_TUNING` 覆寫短閾值）建構真實 `OrphanReaper`（比照既有 `f098-orphan-reaper.spec.ts` 之 `buildModule()` 建構風格，直接沿用同一模式，非重新發明）。
- 「模擬 worker 崩潰」＝呼叫真實 `claimNext()` 使 `queue_job` 該筆轉為 `active`，**刻意不呼叫 `complete()`**（模擬程序於 `processPayload` 執行中中斷）；同步以 `runRepo.save()` 將對應 `assignment_run.status` 設為 `'running'`、`started_at` 設為足夠久遠之過去（模擬 `processPayload` 已呼叫 `pipeline.runPipeline` 但尚未完成即崩潰）。
- 逾時判定：`queue_job.expire_at` 以 §0.3 之直接 SQL 竄改技術撥至過去；`assignment_run` 之逾時判定由 `orphanReaper.reap(now)` 之注入 `now` + 短 `orphanThresholdMs`（如 1000ms）控制，兩者皆不依賴真實 `sleep`。

### 0.6 逾時設定與已知的併跑減速（沿用 P2b `D-P2B-02` 教訓）

`vi.setConfig({ testTimeout: 120000 })`；若與其他 `.mssql.spec.ts` 併跑，比照 P2b `E2E-001~003` 已記錄之共享容器 CPU/連線競爭減速現象，`waitFor`／輪詢型斷言建議放寬至 20 秒等級並吞瞬時查詢錯誤續輪詢，非阻擋性設計提醒（非本文件案例強制要求，交 tdd-implementation 依實測狀況決定是否需要）。

---

## 一、MOUNT — 定時掃描機制掛載（免真實連線，`ad-e07-40-p2c.spec.ts`）

> 黑盒驗證：一律 spy `MssqlQueueService.expireSweep`，不預設掛載者之具體類別/方法名稱（§0.4）。

### TS-MSSQL-P2C-MOUNT-001（🔴 決策關卡／MUST-FIX 說明性案例，非常規 pass/fail）：sweep 掛載機制之選型須於 impl log 明確記錄
- **Related Requirement**：AD §4.3「掛載方式交 tdd-implementation 依現行風格擇一，架構上不強制統一」
- **Test Type**：Meta / Guard（決策關卡，供 tdd-implementation 與未來讀者對齊理解）
- **問題說明**：AD 原文列出兩種掛載方案（搭 `OrphanReaper` 既有 `reaperIntervalMs` 定時器 vs `MssqlQueueService` 自行啟動獨立 timer），本文件刻意不預設答案。若選擇前者，`OrphanReaper.onApplicationBootstrap()`/`startPeriodicScan()` 內需新增一行呼叫 `expireSweep()`；若選擇後者，需新建一個仿 `OrphanReaper` 模式（`OnApplicationBootstrap`+`OnModuleDestroy`+`setInterval`+`unref`）的獨立 provider，並於 `assignment-worker.module.ts` 之 `providers` 註冊。
- **Steps**：（不執行；本案例為文件化守門）
- **Expected Result**：tdd-implementation 於 `AD-E07-40-P2c-impl.md` 之 Architectural Decisions 段落（接續 P2b impl log 之 AD-1~AD-4 編號，本案編為 AD-5）明確記錄：(a) 選擇之方案、(b) 實際掛載之 class/method 名稱、(c) 若新建獨立 provider，其於 `assignment-worker.module.ts` 之註冊方式。下方 MOUNT-002~006 之測試程式碼撰寫時依此決策對應到實際符號，本文件僅描述行為層期望

---

### TS-MSSQL-P2C-MOUNT-002：掛載者啟動時（`onApplicationBootstrap` 或等效生命週期起點）立即執行一次 sweep（比照 `OrphanReaper` 既有「啟動時掃一次＋啟動定期掃描」模式）
- **Related Requirement**：AD §4.3／`orphan-reaper.ts:49-52` 既有模式
- **Test Type**：Positive / Unit（fake `MssqlQueueService` spy）
- **Preconditions**：以短/零週期注入 tuning，避免測試殘留 timer（比照既有 `TEST_TUNING` 慣例）；fake `mssqlQueue.expireSweep` 為 `vi.fn()`
- **Steps**：以 `TestingModule` 建構掛載者（依 MOUNT-001 之決策記錄對應之類別）並呼叫 `app.init()`（觸發 `onApplicationBootstrap`）
- **Expected Result**：`expireSweep` 於 `app.init()` 期間**至少被呼叫 1 次**（若選擇獨立 provider 且刻意不做啟動時立即掃描，須於 impl log 說明理由，非阻擋，但需被記錄——此為期望而非強制紅線，因 AD 未明文要求「啟動立即掃」，僅 `OrphanReaper` 既有模式如此）

---

### TS-MSSQL-P2C-MOUNT-003：定期觸發（週期可注入，短間隔驗證多次 tick）
- **Related Requirement**：AD §4.3「定時掃描」／比照 `orphan-reaper.ts` `startPeriodicScan()` 模式
- **Test Type**：Positive / Unit（`vi.useFakeTimers()` 或短 real-interval，依 tdd-implementation 選型對應之測試技巧）
- **Preconditions**：注入短週期（如 100ms）
- **Steps**：啟動掛載者；推進時間 3 個週期
- **Expected Result**：`expireSweep` 呼叫次數 ≥ 3（不含啟動時之立即呼叫，或含之亦可，本案例僅驗證「有持續定期觸發」，非精確次數計數）

---

### TS-MSSQL-P2C-MOUNT-004：週期設為 0 或未設 → 不啟動定時器（比照 `orphan-reaper.ts:63` 既有防呆 `if (!interval || interval <= 0) return;`）
- **Related Requirement**：既有 `OrphanReaper` 防呆模式之延伸期望（若掛載機制沿用同一段程式碼路徑，此防呆天然適用；若為獨立 provider，需自行實作等效防呆）
- **Test Type**：Negative / Unit
- **Preconditions**：注入週期 = 0
- **Steps**：啟動掛載者；推進時間數個週期
- **Expected Result**：`expireSweep` 除（若有）啟動時立即呼叫外，不再有後續定期呼叫；不拋例外

---

### TS-MSSQL-P2C-MOUNT-005（🔴 DoD 核心）：停止生命週期（`OnModuleDestroy` 或等效）→ 清除計時器，之後不再觸發
- **Related Requirement**：AD §4.3／比照 `orphan-reaper.ts:54-59` 既有 `onModuleDestroy()` 模式
- **Test Type**：Positive / Unit（🔴 DoD 紅線）
- **Preconditions**：掛載者已啟動且至少完成一輪定期觸發
- **Steps**：呼叫其 destroy 生命週期方法；之後推進時間數個週期
- **Expected Result**：destroy 呼叫後 `expireSweep` 呼叫次數不再增加（與 destroy 前計數相同）

---

### TS-MSSQL-P2C-MOUNT-006（靜態守門，`unref` 不阻擋程序退出）：掛載者之計時器建構處緊鄰 `.unref?.()` 呼叫（比照 `orphan-reaper.ts:70` 既有模式）
- **Related Requirement**：AD §4.3「不阻擋程序退出」／`orphan-reaper.ts` 既有慣例
- **Test Type**：Static / Guard
- **Steps**：靜態掃描掛載者所在檔案（依 MOUNT-001 決策記錄對應之檔案），grep `setInterval`/`.unref`
- **Expected Result**：新增之 `setInterval(...)` 呼叫附近存在 `.unref?.()`（或等效 `typeof x.unref === 'function' && x.unref()`）調用，防止定時器阻擋 worker 程序正常退出（呼應既有 `orphan-reaper.ts`/`run-queue.consumer.ts` 之 `pollTimer` 皆有此模式）

---

## 二、RECOVERY — 🔴 兩層回收獨立且一致（旗艦群組，AD §7 DoD #2，真實 MSSQL，`ad-e07-40-p2c.mssql.spec.ts`）

> 沿用 §0.5 Harness：真實 `MssqlQueueService(dataSource)` + 真實 `OrphanReaper`（最小 `TestingModule`），schema `p2c_e2e`。所有案例先執行「模擬崩潰」前置動作（claim 不 complete + 業務層標記 running）。

### TS-MSSQL-P2C-RECOVERY-001（🔴 DoD #2 核心，佇列層獨立回收）：模擬崩潰後，`queue_job` 逾時 → `expireSweep()` 將該筆標為 `expired`
- **Related Requirement**：AD §7 DoD #2／AD §2.3
- **Test Type**：Positive / Integration（真實 MSSQL，DoD 紅線）
- **Preconditions**：`send()` 一筆 → `claimNext()`（轉 active，不 complete）→ 以 §0.3 技術將 `expire_at` 撥至過去；同步 seed 對應 `assignment_run`（`status='running'`, `started_at`=久遠過去）
- **Steps**：呼叫 `mssqlQueue.expireSweep()`
- **Expected Result**：`queue_job` 該筆 `state==='expired'`

---

### TS-MSSQL-P2C-RECOVERY-002（🔴 DoD #2 核心，業務層獨立回收，不依賴佇列表狀態）：`OrphanReaper.reap(now)` 獨立將對應 `assignment_run` 標為 `failed`，**即使佇列層尚未 sweep（`queue_job` 仍為 `active`）**
- **Related Requirement**：AD §7 DoD #2「業務層回收不依賴佇列表狀態」／AD §3「`OrphanReaper` 零改動，純粹查 `AssignmentRun` repo，從未觸碰 pg-boss 或佇列內部狀態」
- **Test Type**：Positive / Integration（真實 MSSQL，DoD 紅線）
- **Preconditions**：同 RECOVERY-001 之崩潰模擬，**但本案例故意先不呼叫 `expireSweep()`**（`queue_job` 仍為 `active`）
- **Steps**：呼叫 `orphanReaper.reap(now)`（`now` 與 `orphanThresholdMs` 注入使其判定逾時）
- **Expected Result**：`assignment_run.status==='failed'`，`error_message===ORPHAN_ERROR_MESSAGE`；`queue_job` 該筆**仍為 `'active'`**（本案例證明 reap 完全不觸碰佇列表，即使佇列層尚未清理，業務層判定依然正確）

---

### TS-MSSQL-P2C-RECOVERY-003（🔴 DoD #2 核心，順序無關性）：兩層依相反順序執行（先 `reap` 後 `sweep`）結果與正常順序（先 `sweep` 後 `reap`）一致
- **Related Requirement**：AD §7 DoD #2「兩層回收各自獨立運作，互不依賴，但結果一致」
- **Test Type**：Positive / Integration（真實 MSSQL，DoD 紅線）
- **Preconditions**：同 RECOVERY-001 崩潰模擬（獨立一組種子資料）
- **Steps**：先呼叫 `orphanReaper.reap(now)`，再呼叫 `mssqlQueue.expireSweep()`
- **Expected Result**：最終狀態與 RECOVERY-001+002 依「先 sweep 後 reap」順序執行之結果相同（`queue_job.state==='expired'`、`assignment_run.status==='failed'`），證明執行順序不影響最終一致性

---

### TS-MSSQL-P2C-RECOVERY-004（獨立性直接證據）：只執行 sweep 不執行 reap → `queue_job=expired` 但 `assignment_run` 仍為 `running`（sweep 不觸碰業務表）
- **Related Requirement**：AD §2.3「佇列層衛生性清理，不影響業務正確性」
- **Test Type**：Negative / Integration（真實 MSSQL，獨立性反證）
- **Preconditions**：同 RECOVERY-001 崩潰模擬
- **Steps**：僅呼叫 `mssqlQueue.expireSweep()`，**不**呼叫 `orphanReaper.reap()`
- **Expected Result**：`queue_job.state==='expired'`；`assignment_run.status` 仍為 `'running'`（未被觸碰）

---

### TS-MSSQL-P2C-RECOVERY-005（獨立性直接證據，鏡像於 RECOVERY-004）：只執行 reap 不執行 sweep → `assignment_run=failed` 但 `queue_job` 仍為 `active`（reap 不觸碰佇列表，佇列層卡住不影響業務層判定正確性）
- **Related Requirement**：AD §3「`OrphanReaper` 零改動」／AD §7 DoD #2
- **Test Type**：Negative / Integration（真實 MSSQL，獨立性反證，與 RECOVERY-002 同場景不同斷言角度）
- **Preconditions**：同 RECOVERY-001 崩潰模擬
- **Steps**：僅呼叫 `orphanReaper.reap(now)`，**不**呼叫 `expireSweep()`
- **Expected Result**：`assignment_run.status==='failed'`；`queue_job.state` 仍為 `'active'`（未被觸碰）

---

### TS-MSSQL-P2C-RECOVERY-006：兩層皆執行後之最終一致狀態為穩定終態，重跑 sweep/reap 各自冪等不再變動
- **Related Requirement**：AD §2.2/§2.3 既有冪等語意（P2a `COMPLETE-002`/`SWEEP` 群組已於單元層驗證，本案例於整合情境重新確認）
- **Test Type**：Positive / Integration（真實 MSSQL，穩健性）
- **Preconditions**：接續 RECOVERY-003 之最終狀態（`queue_job=expired`、`assignment_run=failed`）
- **Steps**：再次呼叫 `expireSweep()`（全域，非鎖定單筆）與 `orphanReaper.reap(now)`
- **Expected Result**：兩表狀態不再變動（`queue_job` 仍 `expired`、`assignment_run` 仍 `failed`，`error_message`/`finished_at` 不被覆寫為不同值）

---

### TS-MSSQL-P2C-RECOVERY-007（retry=0 於崩潰恢復整合語境重新確認，銜接需求 #3；延伸而非重複 P2a `SWEEP-002`）：sweep 標 `expired` 後，`claimNext()` 對該筆仍回傳 `null`
- **Related Requirement**：AD §6.3 場景 1／既有業務決策「retry=0 不自動重派」；P2a `SWEEP-002` 已於 `MssqlQueueService` 單元層驗證此語意本身，本案例驗證其於「完整崩潰恢復流程」（含 `assignment_run` 已被 `OrphanReaper` 標記 `failed` 之後）之整合情境下依然成立，並非重複相同測試意圖
- **Test Type**：Negative / Integration（真實 MSSQL）
- **Preconditions**：接續 RECOVERY-001（`queue_job` 已 `expired`）
- **Steps**：呼叫 `claimNext(RUN_QUEUE_NAME, ...)`
- **Expected Result**：回傳 `null`（`expired` 不在 claim 之 `state='created'` 範圍內）；即使佇列中同時存在其他正常 `created` job，亦不會誤將已 expired 之該筆重新配發

---

### TS-MSSQL-P2C-RECOVERY-008：非崩潰對照組（正常完成路徑）— sweep/reap 皆不誤傷正常 `complete` 之 job / 正常 `completed` 之 run
- **Related Requirement**：AD §2.3「`WHERE state='active'`」／`OrphanReaper` 既有「只掃 running/pending」語意；避免 RECOVERY 群組整體只驗證陽性案例、遺漏對照組
- **Test Type**：Negative / Integration（邊界，對照組）
- **Preconditions**：`send()` → `claimNext()` → 正常 `complete(jobId)`；對應 `assignment_run.status` 正常設為 `'completed'`
- **Steps**：呼叫 `expireSweep()` 與 `orphanReaper.reap(now)`（`now` 與閾值設定為足以判定該 run 早已「逾時」的極端值，刻意製造「若邏輯有誤會誤殺」的壓力情境）
- **Expected Result**：`queue_job.state` 仍為 `'completed'`（未被改為 `expired`）；`assignment_run.status` 仍為 `'completed'`（未被改為 `failed`，`error_message` 不被寫入）

---

### TS-MSSQL-P2C-RECOVERY-009（批次崩潰，延伸 P2a `SWEEP-004` 至整合情境）：3 筆同時崩潰（皆 claim 未 complete）→ sweep 一次全部標 `expired`，reap 一次全部標 `failed`
- **Related Requirement**：AD §2.3「集合式 `UPDATE`，非逐筆迴圈」／`OrphanReaper.reap` 既有之集合式 `IN(:...ids)` 更新
- **Test Type**：Positive / Integration（真實 MSSQL，批次邊界）
- **Preconditions**：seed 3 組（各含 1 筆 `queue_job` + 1 筆對應 `assignment_run`），皆執行崩潰模擬（claim 不 complete + `expire_at`/`started_at` 撥至過去）
- **Steps**：呼叫一次 `expireSweep()`，再呼叫一次 `orphanReaper.reap(now)`
- **Expected Result**：3 筆 `queue_job` 皆變為 `'expired'`；3 筆 `assignment_run` 皆變為 `'failed'`（非逐筆遺漏）

---

### TS-MSSQL-P2C-RECOVERY-010（🔴 三片段協同驗證：P2a claim + P2b processPayload 既有防線 + P2c OrphanReaper，「入列但從未消費」孤兒情境）：`assignment_run` 已被 `OrphanReaper` 標記 `failed`（pending 逾時孤兒，OQ-F098-01），但 `queue_job` 該筆因從未被 claim（仍為 `created`）而**不受 sweep 影響**；此時若 worker 恢復並剛好 `claimNext()` 撈到該筆，`processPayload` 既有防線（P2b `PAYLOAD-004`）正確略過 pipeline
- **Related Requirement**：AD §7 DoD #2 精神延伸／`OrphanReaper` 既有 `pending` 分支（OQ-F098-01）／既有 `processPayload` 「`run.status==='failed'` → 略過 pipeline」防線（P2b `PAYLOAD-004`，本案例驗證其於「佇列層仍可正常 claim 到已被業務層判定失敗之 job」此邊界下依然生效）
- **Test Type**：Positive / Integration（真實 MSSQL，三片段整合邊界）
- **Preconditions**：`send()` 一筆（**不呼叫 `claimNext()`**，`queue_job` 保持 `'created'`）；同步 seed 對應 `assignment_run`（`status='pending'`, `created_at`=久遠過去，未被任何 worker 撿取即逾時）
- **Steps**：① 呼叫 `orphanReaper.reap(now)`（依 `pending` 分支邏輯判定逾時）；② 呼叫 `expireSweep()`；③ 呼叫 `claimNext(RUN_QUEUE_NAME, ...)`（模擬 worker 之後仍正常運作、撿到此筆）
- **Expected Result**：步驟①後 `assignment_run.status==='failed'`；步驟②後 `queue_job` 該筆**仍為 `'created'`**（sweep 只掃 `state='active'`，未曾被 claim 之孤兒不受影響，這是與 RECOVERY-001~009「已 claim 崩潰」情境不同的另一類孤兒）；步驟③ `claimNext()` **仍會**成功撈到該筆（因其仍為 `created`）——若之後呼叫 `processPayload(jobId, payload)`，既有 `run.status==='failed'` 快路徑防線（P2b `PAYLOAD-004`）會使其正確略過 `pipeline.runPipeline`，不重複執行，此為驗證「佇列層可正常運作」與「業務層已提前判定失敗」兩者並存時，既有防線仍足以避免誤跑之組合場景

---

## 三、STATIC — `docker-compose.yml` 環境變數補齊 + 前瞻性守門延續（免真實連線，`ad-e07-40-p2c.spec.ts`）

### TS-MSSQL-P2C-STATIC-001（🔴 DoD #4 核心）：`docker-compose.yml` 之 `worker:` service `environment:` 區塊含 `RUN_QUEUE_POLL_INTERVAL_MS`
- **Related Requirement**：AD §7 P2c DoD #4「`docker-compose.yml` 的 `cdmp-worker` service 環境變數補上 `RUN_QUEUE_POLL_INTERVAL_MS`」（原文之「cdmp-worker」為 `container_name`，compose 服務鍵為 `worker:`，比照既有 `TS-F098-WORKER-001b` 之 slice 方式）
- **Test Type**：Static / Guard（🔴 DoD 紅線，本輪目前確認為紅燈——已 grep 查證 `docker-compose.yml` 現行 `worker:` 區塊**零個** `RUN_QUEUE_*` 環境變數）
- **Steps**：比照既有 `TS-F098-WORKER-001b` 之讀檔+slice 方式（`compose.indexOf('\n  worker:')` 到 `compose.indexOf('\n  web:')`），regex 比對區塊內容
- **Expected Result**：`worker:` 區塊之 `environment:` 含 `RUN_QUEUE_POLL_INTERVAL_MS`（字面環境變數名稱，值可為固定數字或 `${RUN_QUEUE_POLL_INTERVAL_MS:-2000}` 形式，皆可接受，僅要求變數本身存在）

---

### TS-MSSQL-P2C-STATIC-002（前瞻性守門延續，接續 P2a `STATIC-003`→P2b `STATIC-002` 之單一位置守門鏈）：`READPAST`/`UPDLOCK`/`ROWLOCK`（claim SQL 特徵字串）於 `src/` 範圍**仍僅命中 `mssql-queue.service.ts` 一處**（P2c 掛載新程式碼未複製第二份佇列 SQL）
- **Related Requirement**：I-MSSQL-QUEUE-CLAIM-01 精神延伸／P2b `STATIC-002`「記錄本結果供 P2c test-designer 於接線後重跑」（雖然 P2b 原文字面指向 P2c 才是本鏈條下一棒的正確銜接點）
- **Test Type**：Static / Guard
- **Steps**：全域 grep `READPAST`／`UPDLOCK`／`ROWLOCK` 於 `apps/api/src/`
- **Expected Result**：僅命中 `mssql-queue.service.ts` 一處（掛載機制無論選擇何種方案，皆只透過呼叫 `MssqlQueueService.expireSweep()` 觸發，未繞過 service 直接下 SQL 或複製貼上一份相似的 `UPDATE ... SET state='expired'` 邏輯）

---

### TS-MSSQL-P2C-STATIC-003：`state\s*=\s*'expired'`（sweep 之狀態轉移特徵字串）於 `src/` 範圍僅出現在 `mssql-queue.service.ts` 之 `expireSweep()` 方法內（獨立守門，與 STATIC-002 驗證對象互補而非重複）
- **Related Requirement**：I-MSSQL-QUEUE-PAYLOAD-UNITY-01 精神延伸至 sweep（單一實作來源，不因新增掛載程式碼而衍生第二份判定邏輯，例如掛載者不得自行另寫一段 `UPDATE queue_job SET state='expired' WHERE ...` 繞過 service）
- **Test Type**：Static / Guard
- **Steps**：全域 grep `state\s*=\s*'expired'`（剝除註解後）於 `apps/api/src/`
- **Expected Result**：僅命中 `mssql-queue.service.ts` 一處

---

### TS-MSSQL-P2C-STATIC-004（決策關卡／建議項，非阻擋，供未來部署一致性參考）：若 MOUNT-001 選擇之方案引入**新的**週期設定（非重用既有 `reaperIntervalMs`），該新設定亦應可由 env 覆蓋，並建議同步補上 `docker-compose.yml`
- **Related Requirement**：一般部署一致性慣例（比照既有 `RunQueueTuning` 5 個既存欄位皆有對應 `process.env.RUN_QUEUE_*` 覆蓋之模式）；AD §7 DoD #4 字面**僅**要求 `RUN_QUEUE_POLL_INTERVAL_MS`，本案例為超出字面 DoD 之建議性延伸，非阻擋
- **Test Type**：Meta / Guard（決策關卡，依 MOUNT-001 實際選擇之方案分流判定）
- **Steps**：（不預先執行；依 MOUNT-001 記錄之決策事後填入判定）若選擇「搭 `reaperIntervalMs` 既有定時器」→ 本案例自動滿足（該欄位已有 `RUN_QUEUE_REAPER_INTERVAL_MS` env 覆蓋，惟**本輪 grep 查證 `docker-compose.yml` 現行亦未設此變數**，見 `risks-and-gaps.md` 一併記�录）；若選擇「新建獨立 timer」→ 檢視新設定欄位是否比照既有 5 個欄位模式提供 `process.env.RUN_QUEUE_*` fallback
- **Expected Result**：兩種分流皆應可由 env 注入（不可為程式碼寫死常數，否則測試環境需真實等待，違反本文件全篇「不真實等待」之設計原則）；`docker-compose.yml` 是否補上新變數為**建議**而非本文件阻擋項（AD §7 DoD #4 字面僅列 `RUN_QUEUE_POLL_INTERVAL_MS`）

---

## 四、REG — 全 F098 套件於 mssql 分支整體重跑 + 已知失敗排除（部分需真實連線）

### TS-MSSQL-P2C-REG-001（🔴 AD §7 DoD #3 核心）：F098 全部既有套件（7 檔）+ P2a/P2b 新增套件（`ad-e07-40-p2a.mssql.spec.ts`／`ad-e07-40-p2b.spec.ts`／`ad-e07-40-p2b.mssql.spec.ts`）+ 本文件新增之 `ad-e07-40-p2c.spec.ts`／`ad-e07-40-p2c.mssql.spec.ts`，於 `DB_TYPE=mssql` 下整體序列重跑一次，**零新增回歸**（僅排除已知 `TS-F098-PGINT-002`）
- **Related Requirement**：AD §7 P2c DoD #3
- **Test Type**：Regression（🔴 DoD 紅線）
- **Steps**：以 `DB_TYPE=mssql`（真實 MSSQL 容器連線）序列執行 `queue/__tests__/` 目錄下全部 `*.spec.ts`／`*.mssql.spec.ts`（比照既有 `.pg.spec.ts` 序列化慣例延伸至 mssql，`feedback_pg_spec_parallel_timeout` 之序列化教訓同樣適用）；統計總案例數、失敗案例清單（含測試名稱字面，非僅計數）
- **Expected Result**：失敗案例清單**恰為** `{'TS-F098-PGINT-002'}`（集合相等比對，非僅「失敗數=1」的數字比對——避免「已知失敗被替換成另一個不相關失敗、但總數剛好還是 1」的誤判）；其餘全部通過

---

### TS-MSSQL-P2C-REG-002（守門，防止「已知失敗」被濫用掩蓋新回歸）：`TS-F098-PGINT-002` 之排除理由持續有效——`CreatePgBossSchema` migration 檔持續不存在於 repo
- **Related Requirement**：`AD-E07-40-P2b-impl.md` REG-004 補充「該紅燈為與本輪完全無關之 pre-existing 失敗：斷言 `1711360000299-CreatePgBossSchema.ts` 存在，但該 migration 檔早於本輪即已從 repo 移除」
- **Test Type**：Static / Guard（🔴 REG-001 排除清單有效性之前置驗證）
- **Steps**：`fs.readdirSync` 掃描 `database/migrations` 目錄，正則比對 `1711360000299-CreatePgBossSchema\.ts$`
- **Expected Result**：**零命中**（若此檔案未來因任何原因重新出現於 repo，代表排除理由已失效，REG-001 之排除清單須重新評估是否仍可排除該案例，不可盲目沿用舊排除清單——本案例即為此假設之持續有效性驗證）

---

### TS-MSSQL-P2C-REG-003：`DB_TYPE=postgres` 分支全套件亦不受 P2c 影響（sweep 掛載新程式碼零觸碰 postgres 路徑）
- **Related Requirement**：AD §3「postgres 分支於 cutover 前維持 pg-boss 不變」／AD §5「driver-conditional，不強行統一介面」
- **Test Type**：Regression
- **Steps**：以 `DB_TYPE=postgres` 重跑 F098 全套件（含 P2b `DISPATCH-004`/`REG-002` 等既有 postgres 路徑案例）
- **Expected Result**：全綠，與 P2b 完成時之基準一致（不因本輪新增 mssql-only 之 sweep 掛載程式碼而產生任何 postgres 路徑副作用）

---

### TS-MSSQL-P2C-REG-004：sqlite 既有套件（assignment/assignment-list 模組）不受影響
- **Related Requirement**：AD §5「sqlite 測試路徑不變」
- **Test Type**：Regression
- **Steps**：以 `DB_TYPE` 預設（sqlite）跑既有 `assignment`/`assignment-list` 模組測試套件
- **Expected Result**：全綠

---

### TS-MSSQL-P2C-REG-005：`tsc --noEmit -p tsconfig.build.json` 乾淨（新增 sweep 掛載程式碼後）
- **Related Requirement**：`feedback_vitest_no_typecheck`
- **Test Type**：Static / Guard
- **Steps**：對應 tsc 腳本
- **Expected Result**：exit code 0，零型別錯誤

---

## 附錄：本文件案例數彙總

| 群組 | 案例數 | 對真 MSSQL 執行 | 新檔案 |
|---|---|---|---|
| 一、MOUNT | 6 | 否（fake spy / 短 fake-timer） | `ad-e07-40-p2c.spec.ts` |
| 二、RECOVERY | 10 | 是（🔴 旗艦群組） | `ad-e07-40-p2c.mssql.spec.ts` |
| 三、STATIC | 4 | 否 | `ad-e07-40-p2c.spec.ts` |
| 四、REG | 5 | 部分（REG-001/003 需真實 MSSQL 重跑既有套件；REG-002/004/005 否） | 無（重跑既有＋新增） |
| **合計** | **25** | — | — |

**P2（P2a/P2b/P2c）全範圍測試設計至此完成**：P2a 59 + P2b 44 + P2c 25 = **128 場景**，MSSQL 全面遷移 P1+P2 累計場景數 2192（P1 收官）+128 = 2320（P2 收官，含本文件）。
