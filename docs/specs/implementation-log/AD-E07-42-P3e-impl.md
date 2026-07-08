---
type: implementation-log
feature_id: AD-E07-42-P3e
feature_name: MSSQL 全面遷移 P3e — fn_calc_tier_level 死碼收尾（確認 + 防重引入守門 + PG 歷史保留）
status: complete
last_updated: 2026-07-08
---

# AD-E07-42 P3e：`fn_calc_tier_level` 死碼收尾 — Implementation Log

P3 系列最後、最小片。**先調查確認死碼、再收尾**：確認全系統無 live 依賴 →
標記 PG-only legacy 死碼產物淘汰（不刪、不動 PG migration 歷史）→ 加「純靜態 fs+regex」
回歸守門防止重新引入。**非等價移植，是清理收尾**（AD-E07-42 §2.5 / §3）。

## 調查結論：確認死碼（無非預期 live 依賴）

全 `apps/api` grep `fn_calc_tier_level` 共 68 檔命中，逐一分類後結論如下。

### live SQL 呼叫 / 建立形式（`fn_calc_tier_level(`）— 僅 5 處，全為 PG-only 或測試

| 位置 | 類別 | 處置 |
|---|---|---|
| `src/database/migrations/1711360000000-BaselineSchema.ts:146`（`CREATE FUNCTION public.fn_calc_tier_level(...)`） | PG baseline migration DDL | **刻意不動**（§2.5 PG 路徑零風險原則；保留 PG migration 歷史） |
| `src/database/functions/fn_calc_tier_level.sql:23`（`CREATE OR REPLACE FUNCTION`） | PG-only 函式定義檔 | 標記 DEPRECATED（不刪，待 Phase 6） |
| `src/modules/etl/__tests__/fn-calc-tier-level.spec.ts:109`（`CROSS JOIN LATERAL fn_calc_tier_level(...)`） | PG 直測整合測試 | 標記 DEPRECATED（PG-only legacy，連不上 dev PG 時整組優雅 skip） |
| `test/assignment-scoring.e2e-spec.ts:2322/2344`（`SELECT * FROM fn_calc_tier_level(...)`） | F056 e2e，`describe.skipIf(DB_TYPE!=='postgres')` 閘 | 不動（PG-only e2e，非 P3e 收尾範圍，待 Phase 6） |
| `scripts/install-fn-calc-tier-level.mjs`（讀取 SQL 安裝到 dev PG） | dev 安裝腳本，**且已 dangling-broken** | 標記 DEPRECATED（見下方發現 1） |

### 其餘 63 檔命中 — 全為註解 / 文件 / 測試描述字串，**無 live 呼叫**

- production 引擎服務（`assignment-run-pipeline.service.ts`、`scoring-integrity-check.service.ts`、
  `assignment-run-report.service.ts`）之所有命中皆為**註解**，且多處明文記錄「**不嵌入
  fn_calc_tier_level**」的解耦設計（F061 v1.3 BR-13）。
- entity 註解（`ob-levelcard-column.entity.ts` / `ob-pool-data-list.entity.ts`）、seed 描述文字
  （`extraction-tasks.json`）、docs/spec/prototype、其餘測試檔的 describe 字串 —— 皆非呼叫。

### tier_level 之真實產生來源（計分引擎，非死碼函式）

- production src（排除 `__tests__`）之 `fn_calc_tier_level(` 呼叫形式精確 grep = **僅上表 PG
  baseline migration + `.sql` 兩處**；計分/分派引擎（`stage1/` builders+executors、`services/`、
  `assignment-scoring/`）**零 live 呼叫**。
- tier 已於 migration 162 統一 T1–T5，改由計分引擎（P3b）以
  `stage2to4-sql-executor.ts:111`（PG）／`stage2to4-sql-executor-mssql.ts:101`（MSSQL）之
  `tier_level = ti.tier_level`（JOIN `ob_tier`，NULL-aware）產生。
- MSSQL baseline（`mssql/1751884800000-MssqlBaselineSchema.ts`）**不建立**此函式（P1b2 TIERFN
  已端對端斷言 `OBJECT_ID('dbo.fn_calc_tier_level') = NULL`；`ob_tier` 表本身有 `tier_level`
  欄位但那是欄名，非函式）。

**結論：確認死碼。無任何 production 執行期 live 依賴。無非預期 live 依賴（無封鎖級發現）。**

## Test Results Summary

新增純靜態 fs+regex 守門 `src/database/__tests__/fn-calc-tier-level-p3e-deadcode.spec.ts`
（不需 MSSQL/PG 連線，恆執行於預設 `vitest run`）：**7 test 全綠**。

| Scenario ID | 描述 | Status |
|---|---|---|
| TS-MSSQL-P3E-GATE-001 | MSSQL baseline schema 原始碼完全不含 `fn_calc_tier_level`（承 P1b2 TIERFN-002，獨立靜態補強） | PASS |
| TS-MSSQL-P3E-GATE-002 | MSSQL baseline reference-data migration 亦不含此函式名 | PASS |
| TS-MSSQL-P3E-GATE-003 | MSSQL queue-job schema migration 亦不含此函式名 | PASS |
| TS-MSSQL-P3E-ENGINE-001 | `src/modules/assignment`（排除 `__tests__`）無 `fn_calc_tier_level(` 呼叫形式（含 files.length>0 空掃描防呆） | PASS |
| TS-MSSQL-P3E-ENGINE-002 | `src/modules/assignment-scoring`（排除 `__tests__`）無 `fn_calc_tier_level(` 呼叫形式 | PASS |
| TS-MSSQL-P3E-TIERSRC-001 | PG executor 以 `tier_level = ti.tier_level`（JOIN `ob_tier`）計算 tier，且不含 `fn_calc_tier_level(` | PASS |
| TS-MSSQL-P3E-TIERSRC-002 | MSSQL executor 同樣以 `tier_level = ti.tier_level` 計算 tier，且不含 `fn_calc_tier_level(` | PASS |

**回歸實測**：
- 守門新檔：**7 綠**（無 DB，決定性）。
- 非 DB 計分/分派 JS oracle sanity：`scoring-integrity-check.service`（7）+`stage3to4-ration`（16）+
  `cr-priority`（16）+守門（7）＝**55 綠**（引擎路徑不變）。
- 3 檔組合（守門 + etl 整合 + p1b2）：**stash 我方編輯前後皆為 1 failed / 57 passed / 4 todo（完全一致）**
  → 我方變更零回歸；唯一失敗＝pre-existing 死碼漂移（見下方發現 2，非本輪造成）。
- `npx tsc --noEmit -p tsconfig.build.json`：**乾淨（exit 0）**。

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| src/database/__tests__/fn-calc-tier-level-p3e-deadcode.spec.ts | new | 純靜態 fs+regex 死碼防重引入守門（GATE×3 / ENGINE×2 / TIERSRC×2）；掃描呼叫形式 `/fn_calc_tier_level\s*\(/`（註解僅提及名稱、無括號→不誤判），ENGINE 群含 `files.length>0` 空掃描防呆 |
| src/database/functions/fn_calc_tier_level.sql | modified | 檔首加 DEPRECATED 標記（純註解）：確認死碼、tier 改由計分引擎算、MSSQL baseline 不建、PG 保留待 Phase 6，指向守門檔 |
| scripts/install-fn-calc-tier-level.mjs | modified | JSDoc 加 DEPRECATED 標記（純註解）：標明已 dangling-broken（MIG_PATH 指向已收斂移除之 `1711360000141-CreateFnCalcTierLevel.ts`）+ 死碼理由 |
| src/modules/etl/__tests__/fn-calc-tier-level.spec.ts | modified | 檔首加 DEPRECATED 標記（純註解）：PG-only legacy、cutover 前 PG 安全網、待 Phase 6 隨整批 PG 測試移除，指向守門檔 |
| src/database/migrations/1711360000000-BaselineSchema.ts | unchanged | PG baseline `CREATE FUNCTION` **刻意保留**（§2.5 PG 路徑零風險 + 保留 PG migration 歷史） |

**PG migration 歷史保留決策**：PG baseline migration（`1711360000000-BaselineSchema.ts`）內
`CREATE FUNCTION public.fn_calc_tier_level(...)` **完全不動**，不寫任何 down/DROP 清理。理由：
（1）§2.5 明訂 PG 路徑 cutover 前零風險，即使函式為死碼亦保留；（2）PG baseline 為 pg_dump 快照
收斂之單一事實來源，任何改動都動到 migration 歷史；（3）本輪 P3e 的死碼「移除」以架構師裁定之
「**MSSQL baseline 不建立 + production 無 code 依賴**」為實質達成標準（P1b2 已斷言 MSSQL 不建、
本輪守門鎖死 engine 零 live 呼叫），而非物理刪除 PG 產物。PG-only legacy 三檔（`.sql`／整合測試／
安裝腳本）改以 DEPRECATED 標記，物理刪除延至 Phase 6 cutover 隨整批 PG 產物一併處理。

## Architectural Decisions

1. **守門採「呼叫形式」而非「子字串」掃描 engine**：production 引擎服務合法地在**註解**提及
   `fn_calc_tier_level`（記錄解耦），故 ENGINE 群掃 `/fn_calc_tier_level\s*\(/`（函式呼叫/建立
   形式）而非裸子字串——否則會誤判解耦註解為違規。GATE 群（掃 MSSQL baseline migration）反之採
   最嚴的「完全不含子字串」（承 P1b2 TIERFN-002：migration DDL 內出現此名即異常）。
2. **守門為獨立純靜態 `.spec.ts`，不繼承 mssql-env-preload 副作用**：不 import `mssql-env-preload`
   （其 side-effect 設 `DB_TYPE='mssql'` 影響 entity column-type helper）；僅用 `fs`/`path`。故本守門
   在預設 `vitest run` 恆執行、無 DB 依賴、決定性綠，補強 P1b2 TIERFN-001/003（需真 MSSQL 連線、
   無連線時 skip）之覆蓋盲區。
3. **TIERSRC 承 P3b**：以「兩版 executor 皆含 `tier_level = ti.tier_level`（JOIN `ob_tier`）且皆不含
   `fn_calc_tier_level(`」作為「tier 由計分引擎產生、非死碼函式」的結構化證據，與 P3b 既有行為測試
   （逐列等價）互補。

## 偏差（deviations）與發現

1. **`install-fn-calc-tier-level.mjs` 已 dangling-broken（非本輪造成）**：其 `MIG_PATH` 指向
   `src/database/migrations/1711360000141-CreateFnCalcTierLevel.ts`，該 migration 已於 baseline
   收斂（現只剩 `1711360000000-BaselineSchema.ts` + `...001-BaselineReferenceData.ts`）中移除 → 腳本
   執行必失敗。此為既有事實、印證死碼；本輪僅加 DEPRECATED 標記，不修復（PG-only legacy，Phase 6 移除）。
2. **🔴 pre-existing 失敗（非本輪造成、非本輪修復）— legacy PG 整合測試死碼漂移**：
   `src/modules/etl/__tests__/fn-calc-tier-level.spec.ts` 之 **TC-02** 期望
   `tier_level='T5M'`，但 dev PG（:5432 可連）之現行資料因 tier 統一 T1–T5 回傳 `'T5'` → 失敗。
   **已用 `git stash` 驗證：移除我方 3 個純註解編輯前後，3 檔組合皆為 1 failed / 57 passed / 4 todo
   （完全一致）** → 此失敗與本輪無關，是死碼本身漂移的症狀（正是其被判死碼、待 Phase 6 移除之由）。
   依「PG 路徑不可壞（不改其行為）＋ 既有 tech debt 非本次勿擴大」，**不改此測試之執行行為**
   （僅加 DEPRECATED 註解），忠實記錄為 pre-existing baseline 失敗，建議 Phase 6 隨整批 PG 測試移除。
   （附註：`fn-calc-tier-level.spec.ts` 在與其他 spec 並行時失敗數會浮動〔曾見 15 failed〕，屬該
   legacy PG 測試在共享 dev PG + 並行下的 flaky；單獨或穩定重跑收斂為 TC-02 單一決定性失敗。）

## Blocking Issues

無。無非預期 live 依賴（無封鎖級發現）。死碼確認完成、MSSQL baseline 不建 + engine 零 live 呼叫
雙重鎖定於守門、PG migration 歷史完整保留、tsc 乾淨、計分/分派（postgres/sqlite/mssql）引擎路徑不變。

**範圍外後續（非本輪）**：Phase 6 cutover 時，隨整批 PG 產物一併物理移除
`fn_calc_tier_level.sql` / `fn-calc-tier-level.spec.ts` / `install-fn-calc-tier-level.mjs` /
PG baseline `CREATE FUNCTION` / F056 e2e PG-only 區塊。屆時本守門之 GATE/ENGINE/TIERSRC 三群仍應
持續通過（MSSQL 側不受影響）。
