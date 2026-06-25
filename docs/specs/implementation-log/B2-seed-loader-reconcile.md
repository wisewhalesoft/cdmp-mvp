---
type: implementation-log
feature_id: B2
feature_name: 硬化計分卡 seed loader（加法式 reconcile + 漂移偵測 + opt-in repair）
status: complete
last_updated: 2026-06-25
---

# B2：計分卡 seed loader reconcile 硬化 — Implementation Log

## 目標與背景

`apps/api/src/database/seeds/prod-data-seed.ts` 載入 6 張計分卡表，舊邏輯為
「`tableCount>0` 就整批 SKIP」。此「非空就 SKIP」雖避免洗業務資料，但副作用是
**缺的 row 永遠補不上、值漂移永遠看不到** —— 即 dev DB H/SALES_STS 被標 inactive
（seed 是 active）、M 卡缺 6 column 長期藏住的根因。

本輪僅實作機制 + 測試，**不重跑 seed 對 dev、不改 dev DB 資料**（那是另一個 todo B1）。

## 三層設計（皆已實作）

### ① 加法式 reconcile（取代「非空就整批 SKIP」）
逐 seed row 用自然鍵判存在，**只 INSERT「seed 有、DB 沒有」的缺 row**：
- 空表 → 全插（行為同舊版，不退化）。
- 非空表 → 只補缺、**完全不碰既有 row**、冪等（再跑插 0）。
- 自然鍵可空欄位用 `IS NOT DISTINCT FROM` 對 NULL 安全；表無 unique 約束（只有
  surrogate id PK）→ 用 `WHERE` 手動判存在（容忍 DB 既有重複列不報錯，對應 todo D）。

各表自然鍵：

| 表 | 自然鍵 | 漂移偵測值欄 |
|----|--------|-------------|
| ob_card_type | (card_type) | card_name / prod_kind / status |
| ob_levelcard_version | (card_type, card_version) | card_name / sdate / edate / status |
| ob_levelcard_column | (card_type, card_version, column_name) | status |
| ob_levelcard_score | (card_type, card_version, column_name, level1, level2_s, level2_e) | score |
| ob_levelcard_level | (card_type, card_version, score_s, score_e, card_level) | （無；值欄已全在鍵內） |
| ob_tier | (list_nm, card_type, card_level) | tier_level |

> 註：`ob_levelcard_version` DB 現有同 (card_type,card_version) 重複列＝另一 todo D，
> 本輪不修；NOT EXISTS / 第一筆比對能容忍重複不報錯。
> `ob_levelcard_level` 設計指定值欄＝card_level，但其已全部納入自然鍵 → 自然鍵相等
> 即整列相等、不可能漂移，故 valueColumns 留空（避免 SELECT 欄重複）。

### ② 漂移偵測（WARN-only，預設不改）
seed row 自然鍵**存在、但值欄與 seed 不同**時，`console.warn` 列出
「表 / 自然鍵 / 欄 / seed 值 vs DB 值」，並彙總一行 summary。
**預設只 WARN、不 UPDATE**（保留業務 UI 改動）。

### ③ opt-in repair flag
`process.env.SEED_REPAIR_DRIFT === 'true'` 時，把②偵測到的漂移欄 `UPDATE` 回 seed 值
（並 log「已修 N 筆」）。預設（未設）只 WARN 不改。

> flag 於**每次呼叫時讀取**（`repairDriftEnabled()`），使測試可逐案 toggle。

### 附帶：column_label 補值 + match_type 推導
- `seedColumns` 既有「補 column_label IS NULL」邏輯保留併入新流程（補中文標籤、
  不洗業務調整過的非 NULL 值），同時涵蓋本次新 INSERT 的列（先以 NULL 佔位）。
- 新 INSERT 的 column 以 `'RANGE'` 佔位 match_type，之後 `deriveMatchType(qr, insertedKeys)`
  **僅對本次新補的列**依 score 形態推導正確值（COMPOSITE / CATEGORY / RANGE）；
  **既有 column 的業務 match_type 不被覆寫**（舊版是全表重推，會洗業務值 → 已修正）。

## Flag 用法

```bash
# 預設：加法式補缺 + 漂移 WARN（不改既有值）
docker compose --profile data-seed up data-seed

# 修回漂移值（把偵測到的值欄 UPDATE 回 seed）
SEED_REPAIR_DRIFT=true docker compose --profile data-seed up data-seed
```

## 改了哪些函式（apps/api/src/database/seeds/prod-data-seed.ts）

| 函式 | 變更 |
|------|------|
| `repairDriftEnabled()` | 新增；每次呼叫讀 `SEED_REPAIR_DRIFT` env（取代 module-load 常數） |
| `ReconcileSpec<T>` / `findByKey` / `keyDesc` / `reconcileTable<T>` / `valueEquals` | 新增；六表共用的加法式 reconcile + 漂移偵測 + opt-in repair 核心 |
| `seedCardTypes` / `seedVersions` / `seedColumns` / `seedScores` / `seedLevels` / `seedTiers` | 改寫；由「非空就 SKIP」改為呼叫 `reconcileTable`（皆 export 供測試） |
| `seedColumns` | 回傳改為 `{ insertedKeys }`（供 match_type 僅對新列推導）；保留 column_label 補值 |
| `deriveMatchType` | 改簽名 `(qr, keys)`；僅對 `keys`（新列）推導，不再全表重推（不洗業務值） |
| `main()` | 改呼叫 `deriveMatchType(qr, columnsResult.insertedKeys)`；移除舊「inserted 才 derive、否則 SKIP」分支 |

其餘 5 個非計分卡 loader（`seedEtlPipelines` / `seedExtractionTasks` 等）**未動**
（已是 per-row name-key SKIP，非本輪範圍）。

## 紅線遵守

- ✅ 絕不預設覆寫既有 row（除非 `SEED_REPAIR_DRIFT=true`）。
- ✅ 空表全插行為不退化（測試①驗證每表列數 = seed 列數）。
- ✅ 不改 seed data JSON、不改 docker-compose、不跑 seed 對 dev、不改 dev DB。
- ✅ docker-compose data-seed 呼叫方式未改（只改 loader 函式）。

## 測試

新增 PG 真庫測試：`apps/api/src/database/seeds/__tests__/prod-data-seed-reconcile.pg.spec.ts`
（沿用既有 `.pg.spec.ts` pattern + `pg-env-preload.ts`，連 `cdmp-postgres-test` 5433/cdmp_test；
不可達 → skip-with-reason，不假綠）。**13 個測試**：

| 測試群 | 涵蓋 |
|--------|------|
| ① 空表全插 | 六表列數 = seed 列數；column_label 補齊 |
| ② 加法式補缺 | 先插部分→補缺後總數=seed、既有列原值保留；score 不重複；ob_tier M5 NULL card_level NULL-safe 不誤插 |
| ③ 漂移偵測（預設） | status/score 漂移有 WARN、值不變 |
| ④ opt-in repair | `SEED_REPAIR_DRIFT=true` 修回 seed；僅改漂移欄不增刪列 |
| ⑤ 冪等 | 連跑兩次第二次插 0、不報錯、列數穩定 |
| ⑥ match_type derive | 新插 column CATEGORY/COMPOSITE/RANGE 正確；既有 column 業務 match_type 不被洗 |

新增輔助：`apps/api/src/database/seeds/__tests__/pg-env-preload.ts`（side-effect 設
`DB_TYPE=postgres` + `restoreDbType`）。

### 測試隔離設計（重要）
- **專屬隔離 schema**：本檔在全域唯一 schema（`cdmp_b2_seed_<pid>_<hrtime>_<rand>`）建表，
  避免與其它平行 spec 在 cdmp_test public schema 共用同名計分卡表互洗。
- **放寬 timeout**：計分卡 seed 為 row-by-row INSERT（score 370 列…），CI 全量平行跑時
  共用 PG server 競爭 CPU，預設 5s test timeout 不足 → `vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 })`。
  （此為根因：未放寬前在高負載下 `①空表全插` 因逐列 INSERT 超時，造成偽 count 漂移。）

## 結果

| 項目 | 結果 |
|------|------|
| 新增測試數 | 13（reconcile pg spec） |
| PG pass（本 spec 單跑） | 13 / 13 |
| PG pass（與 seeds + assignment-scoring + fn-calc-tier 平行全跑） | 13 / 13（本 spec 全綠） |
| 既有 seed 測試（prod-data-seed-extraction.spec.ts，mock） | 15 / 15 不退化 |
| scoring/assignment 不退化（seeds + assignment-scoring + assignment-list 合跑） | 573 passed / 0 failed |
| `tsc --noEmit -p tsconfig.build.json` | EXIT=0（零錯誤） |

### Baseline 退化說明（誠實）
- `src/modules/etl/__tests__/fn-calc-tier-level.spec.ts` 之 `TC-02 fallback CARD_TYPE M5
  → tier_level=T5M`（expected 'T5M' got 'T5'）為 **pre-existing 失敗**：已於 `git stash`
  移除本輪變更後對 baseline（main）單跑重現，與本次無關。該 spec 連 **dev DB（5432）**
  且依賴 dev DB `ob_tier` 已 seed M5 fallback 列；屬資料狀態問題，非本輪 code。
- 既有 10 個 etl 模組 fail（記憶中既存 baseline）與本次無關。
