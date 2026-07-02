---
ad-id: AD-E07-37
title: F109 客戶資料來源篩選欄位（data_source 判定機制 + Stage 1 條件式 LEFT JOIN customer_core 架構設計）
feature-id: F109
source-stories: US-172
epic: E07
module: M06 篩選欄位
version: "1.0"
date: 2026-07-02
status: approved
author: system-architect
covers: [F109, US-172]
depends-on: [AD-E07-18, AD-E07-28, AD-E07-23]
related: [F075, F076, F050, F051, F100, F103, F104]
invariants:
  - I-CC-DATASOURCE-01
  - I-CC-JOIN-CARD-01
  - I-CC-NULL-EXCLUDE-01
  - I-CC-COMPOSER-SCOPE-01
  - I-CC-PARAM-NS-01
---

# AD-E07-37：F109 客戶資料來源篩選欄位架構設計

## Agent Loading Guide

| Agent 角色 | 需載入章節 |
|-----------|-----------|
| TDD Developer | §3（5 個 OQ 裁定）+ §4（schema / migration）+ §5（Stage 1 SQL 契約，含檔案異動清單）+ §6（寫入路徑契約）+ §7（API 契約）+ §8（不變式）+ §9（測試邊界） |
| Test Designer | §3（OQ 裁定摘要）+ §8（不變式 / 邊緣案例）+ §9（PG-only 測試邊界說明） |
| UI/UX Designer | §7（`dataSource` API 形狀）+ §3 OQ-F109-05（seed-only，dropdown 不變） |
| Product Analyst | §10（風險與殘留議題） |

---

## 1. 背景與問題定義

F109（US-172）在既有「案件資料」（`ob_pool_data`）篩選欄位白名單基礎上，引入第二個資料來源「客戶資料」（`customer_core`），新增 8 個篩選欄位。Feature spec（[F109](../features/F109-customer-source-filter-fields.md) §12.2）留下 5 個架構 Open Question（OQ-F109-01~05），本文件逐一裁定，並定義 Stage 1 SQL 組裝的完整程式碼契約。

**核心張力**：Stage 1 現行 SQL 組裝（`buildStage1WhereConditions` / `buildStage1Sql` / `executeStage1Chain`）僅認識單一來源表 `ob_pool_data`，欄位 fragment 以無 alias 之 `"col"` 引用（單表無歧義）。F109 要求：
1. 對每個 condition 決定性判定其 `data_source`，且與 F075 BR-4「Stage 1 不 join 白名單做欄位有效性驗證」相容。
2. 僅在名單引用 ≥1 個 customer_core 欄位時注入 `LEFT JOIN customer_core`（條件式，避免純案件資料名單效能退化）。
3. 兩個衍生欄位（年齡 AGE、居住城市 LEFT3）需要作業月 `workdt` 與 PG 專屬運算式。
4. PG 下推路徑（`buildStage1Sql`）與「JS oracle」路徑（`executeStage1Chain`，SQLite 測試 / 非 PG）須維持等價。

---

## 2. 既有架構基礎（不分叉，不得修改語意）

| 元件 | 檔案 | 角色 |
|---|---|---|
| `buildStage1WhereConditions(list)` | `stage1-query-composer.ts` | Path A（condition_payload JSONB）/ Path B（5 個 legacy entity column）欄位篩選，純函式 |
| `buildStage1Sql(list, workdt, poolDataListRepo)` | `stage1-sql-builder.ts` | PG SQL 下推核心（AD-E07-28 P2），run/estimate 共用同一 `<core>`（I-RUN-EST-01） |
| `runStage1SqlInsert` / `estimateStage1SqlCount` | `stage1-sql-executor.ts` | 將 `<core>` 包裝為 `INSERT…SELECT FROM ob_pool_data o WHERE <core>` / `SELECT COUNT(*) FROM ob_pool_data o WHERE <core>`；**FROM 子句在此檔硬編碼，`buildStage1Sql` 本身不產生 FROM** |
| `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, opts)` | `stage1-filter-chain.ts` | 完整篩選鏈（欄位篩選 SQL 經 TypeORM `qb.where()` 對實際 DB 執行 + JS Array.filter 之特例 DELETE + JS Set 去重）；SQLite 測試 / `DB_TYPE !== 'postgres'` 環境使用 |

**關鍵既有事實（決定本 AD 設計）**：
- `customer_core` **無 TypeORM Entity**（AD-E06-1），schema 由 migration 直接維護，且**僅在 PostgreSQL 建表**（`CreateCustomerCore` migration 對 SQLite 無等價建表）。因此任何引用 `customer_core` 的 SQL 只可能在 PG 環境成功執行；SQLite 環境下若查詢引用 `customer_core` 會因表不存在而失敗——這是環境固有限制，非本 AD 需要迴避的設計缺陷（見 §9）。
- `buildStage1WhereConditions` 目前只有 **2 個生產呼叫點**：`stage1-sql-builder.ts:87` 與 `stage1-filter-chain.ts:371`，兩者呼叫當下**皆已持有 `workdt`**（分別為函式參數）。
- 「名單試算 / 預覽」（spec §6.3 第三消費點）實際上**沒有獨立實作**：`Stage0EstimateService.estimateListCount` / `dryRunChainCount` 直接呼叫 `estimateStage1SqlCount`（PG）或 `executeStage1Chain`（非 PG），因此 BR-10「三處消費一致」在程式碼層面**只有 2 條路徑**（PG 下推、JS chain），只要這 2 條路徑正確共用同一組客戶條件邏輯即自動滿足三處一致。
- `customer_core(source_customer_no)` 已有 **UNIQUE 索引** `idx_customer_core_source_no`（`CreateCustomerCore` migration）；`ob_pool_data(custo_no)` 已有索引 `idx_ob_pool_data_custo_no`（`CreateObPoolData` migration）。JOIN key 兩側皆已索引。
- F100/F103（`stage2to4-sql-executor.ts:93-96`）已有先例：`LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no`，**僅在需要客戶屬性維度時才注入**（`needsCustomerCore` 旗標）。本 AD 沿用相同條件式 JOIN 慣例與 alias 命名（`cc`）。
- `assignment-list.service.ts` 的 `normalizeConditionPayload`（名單重複偵測，§18.8）僅萃取 `columnName`/`fieldType`/`values`/`min`/`max`/`dateStart`/`dateEnd` 組簽章字串，**不包含**任何未列舉欄位 → 新增 `dataSource` 欄位對重複偵測**零影響**（已驗證，見 §10.3）。

---

## 3. 架構師 OQ 裁定彙總

### OQ-F109-01　condition 之 `data_source` 判定機制（RESOLVED）

**裁定**：採 spec 建議選項 (a) 為主、(c) 為防禦性 fallback 的**雙層機制**：

1. **主要來源（寫入時固化）**：`ObListDefinitionConditionItem` 新增 `dataSource?: 'ob_pool_data' | 'customer_core'` 欄位。`AssignmentListService.createList` / `updateList` 在 `injectSystemFixedConditions` **之後**（確保系統固定注入的 `best_case` 條件也被蓋章）、`deriveBackwardCompatColumns` **之前**，新增一步 `stampConditionDataSource`：查詢當下 `pooldata_field_whitelist`（`is_active=true`）逐 `columnName` 蓋上對應 `data_source`，寫入 `condition_payload`。
2. **防禦性 fallback（讀取時，for 舊名單 / 缺值）**：`resolveConditionDataSource(cond)` — `cond.dataSource` 若為合法值直接採用；若缺漏（`undefined`/`null`，涵蓋 F109 上線前所有既有 `condition_payload`），比對靜態常數 `CUSTOMER_CORE_COLUMN_NAMES`（F109 8 個欄名之 `Set`）；命中則視為 `customer_core`，否則預設 `ob_pool_data`。

**理由**：
- 純方案 (a)：對「事後停用白名單欄位」的既有名單決定性良好，但無法涵蓋 F109 上線**之前**寫入的 `condition_payload`（那些 JSONB 完全沒有 `dataSource` key）。
- 純方案 (b)（runtime 查白名單）：違反 F075 BR-4「Stage 1 不 join 白名單做欄位有效性驗證」的既定分工，且欄位停用後 runtime 查詢會找不到 row，破壞決定性（月跑失敗或誤判）。
- 雙層機制：**新名單** 100% 由固化值決定（欄位停用不影響，滿足 BR-4 相容 + AC-9 決定性）；**舊名單**（F109 上線前）因 8 個 customer_core 欄名在 F109 之前**不存在於白名單**，不可能出現在舊 `condition_payload` 中（除非欄位名稱巧合碰撞——見 §10 殘留風險），故靜態 Set fallback 對舊資料 100% 正確且不需要資料庫 backfill migration。
- **不需要對既有 `condition_payload` JSONB 做 UPDATE backfill**：所有 F109 之前的名單條件只可能引用 7 個既有 `ob_pool_data` 白名單欄位，靜態 fallback 天然覆蓋。

**契約**：

```typescript
// stage1-query-composer.ts（新增，export）
export const CUSTOMER_CORE_COLUMN_NAMES: ReadonlySet<string> = new Set([
  'gender', 'date_of_birth', 'occupation_desc', 'education_desc',
  'marital_status_desc', 'customer_type_desc', 'monthly_income_desc', 'cpost_city',
]);

export function resolveConditionDataSource(
  cond: { columnName: string; dataSource?: 'ob_pool_data' | 'customer_core' },
): 'ob_pool_data' | 'customer_core' {
  if (cond.dataSource === 'customer_core' || cond.dataSource === 'ob_pool_data') {
    return cond.dataSource;
  }
  return CUSTOMER_CORE_COLUMN_NAMES.has(cond.columnName) ? 'customer_core' : 'ob_pool_data';
}
```

`SAFE_COLUMN_NAME_RE` 亦須從 `stage1-query-composer.ts` **export**（供 §5 新模組重用，避免正則重複定義）。

---

### OQ-F109-02　衍生運算式落點 + composer 簽名（RESOLVED）

**裁定**：**composer 簽名不變**（`buildStage1WhereConditions(list)` 維持單參數）。AGE / LEFT3 衍生邏輯**不放入 composer**，而是抽成獨立的**共用**函式 `buildCustomerCoreClause`，由 `buildStage1Sql` 與 `executeStage1Chain` 兩個既有呼叫點**各自呼叫一次**（兩者皆已持有 `workdt`）。composer 內部僅新增一行防禦：Path A 迴圈遇到 `resolveConditionDataSource(cond) === 'customer_core'` 的 condition 時**靜默 skip**（`continue`，不建立 fragment、不發 warning），避免對 `ob_pool_data`（無 `gender` 等欄位）建出會 SQL 出錯的偽 fragment。

**理由（推翻 spec 建議的「JS oracle 另寫等價 JS 計算」，改採更強的等價保證）**：
- 逐一追蹤 `executeStage1Chain` 的實作後確認：其欄位篩選步驟**同樣是透過 TypeORM `qb.where(sql, params)` 對真實 DB 執行 SQL**（SQLite 或 PG），並非在記憶體中以 JS 述詞評估 `buildStage1WhereConditions` 的輸出。composer 從來就不是「PG-only」，其字串本來就是跨引擎可攜的 SQL 子集（`IN` / `BETWEEN`）。
- 因此「PG 下推 vs JS oracle」兩路徑的真正差異只在**去重（NOT EXISTS anti-join vs JS Set filter）**與**特例 DELETE（SQL NOT(...) vs Array.filter）**，欄位篩選本身兩路徑「同源同 SQL」。
- 若依 spec 建議另寫一份「JS 計算」AGE/LEFT3，等於引入第二套獨立實作，天然有 drift 風險（也正是 BR-10 想避免的問題）。改為**兩路徑呼叫同一個函式產生同一段 SQL 字串**，等價性由「同一份程式碼」保證，而非「兩份程式碼靠測試守住」。
- `customer_core` 本身只在 PG 建表，`executeStage1Chain` 若真的執行到含 customer_core 條件的名單，也必然是在 PG 環境（SQLite 環境下該表不存在，查詢會直接失敗——這與「JS oracle」這個既有稱呼所暗示的「非 SQL、記憶體計算」不同，是環境限制而非本 AD 引入的新落差，見 §9）。

**新檔案 `stage1-customer-core-clause.ts`**（`apps/api/src/modules/assignment/stage1/`）：

```typescript
import type { ObListDefinitionConditionItem } from '@/database/entities/ob-list-definition.entity';
import {
  CUSTOMER_CORE_COLUMN_NAMES,
  resolveConditionDataSource,
  SAFE_COLUMN_NAME_RE,
  type Stage1ComposerWarning,
} from './stage1-query-composer';

export interface CustomerCoreClause {
  /** null = 本名單無 customer_core 條件，呼叫端不得注入 JOIN */
  join: string | null;
  /** 已各自用 (...) 包裹之 SQL 片段，呼叫端可直接併入 AND 清單 */
  whereFragments: string[];
  params: Record<string, unknown>;
}

/**
 * 建構 customer_core 條件式 LEFT JOIN 子句 + WHERE fragments（AD-E07-37 §OQ-F109-02）。
 * PG 下推（buildStage1Sql）與 chain 路徑（executeStage1Chain）共用本函式（同一份 SQL，等價由建構即保證）。
 *
 * @param conditions 完整 condition 陣列（未過濾）；內部自行以 resolveConditionDataSource 篩出 customer_core 條件
 * @param workdt     作業月首日（AGE 基準，BR-5）
 * @param baseAlias  ob_pool_data 在呼叫端查詢中的 alias（stage1-sql-builder.ts 用 'o'；
 *                   stage1-filter-chain.ts 之 TypeORM qb 用 'ob_pool_data'）
 * @param warnings   呼叫端 warnings 陣列（本函式 push，不自建新陣列，慣例同 buildMonthCntFragment）
 */
export function buildCustomerCoreClause(
  conditions: ObListDefinitionConditionItem[],
  workdt: Date,
  baseAlias: string,
  warnings: Stage1ComposerWarning[],
): CustomerCoreClause {
  const ccConditions = conditions.filter(
    (c) => resolveConditionDataSource(c) === 'customer_core',
  );
  if (ccConditions.length === 0) {
    return { join: null, whereFragments: [], params: {} };
  }

  const whereFragments: string[] = [];
  const params: Record<string, unknown> = {};
  let catIdx = 0;

  for (const cond of ccConditions) {
    if (!SAFE_COLUMN_NAME_RE.test(cond.columnName)) {
      warnings.push({ code: 'INVALID_COLUMN_NAME', columnName: cond.columnName,
        reason: `columnName violates ${SAFE_COLUMN_NAME_RE}` });
      continue;
    }

    // gender + 5 個 _desc 欄：直接值比對
    if (['gender', 'occupation_desc', 'education_desc', 'marital_status_desc',
         'customer_type_desc', 'monthly_income_desc'].includes(cond.columnName)) {
      if (!Array.isArray(cond.values) || cond.values.length === 0) {
        warnings.push({ code: 'EMPTY_VALUES', columnName: cond.columnName, reason: 'values missing or empty' });
        continue;
      }
      const p = `ccCat${catIdx++}`;
      whereFragments.push(`(cc.${cond.columnName} IN (:...${p}))`);
      params[p] = cond.values;
      continue;
    }

    // cpost_city：LEFT3 衍生（BR-6）
    if (cond.columnName === 'cpost_city') {
      if (!Array.isArray(cond.values) || cond.values.length === 0) {
        warnings.push({ code: 'EMPTY_VALUES', columnName: cond.columnName, reason: 'values missing or empty' });
        continue;
      }
      const p = `ccCat${catIdx++}`;
      whereFragments.push(`(LEFT(cc.cpost_city, 3) IN (:...${p}))`);
      params[p] = cond.values;
      continue;
    }

    // date_of_birth：AGE 衍生（BR-5）
    if (cond.columnName === 'date_of_birth') {
      if (cond.min === undefined || cond.min === null || cond.max === undefined || cond.max === null) {
        warnings.push({ code: 'INCOMPLETE_NUMERIC_RANGE', columnName: cond.columnName, reason: 'min or max missing' });
        continue;
      }
      // EXTRACT(YEAR FROM AGE(...))：PG age() 內建「未達當年生日不計」整年差語意，恰好對齊業務定義（BR-5）
      whereFragments.push(
        `((EXTRACT(YEAR FROM AGE(:ccWorkdt::date, cc.date_of_birth)))::int BETWEEN :ccAgeMin AND :ccAgeMax)`,
      );
      params.ccWorkdt = toIsoDate(workdt);
      params.ccAgeMin = cond.min;
      params.ccAgeMax = cond.max;
      continue;
    }

    // 未知 customer_core 欄名（理論上不會發生，defense-in-depth）
    warnings.push({ code: 'INVALID_COLUMN_NAME', columnName: cond.columnName,
      reason: 'unrecognized customer_core column' });
  }

  if (whereFragments.length === 0) {
    return { join: null, whereFragments: [], params: {} };
  }

  return {
    join: `LEFT JOIN customer_core cc ON cc.source_customer_no = ${baseAlias}.custo_no`,
    whereFragments,
    params,
  };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}
```

**NULL 排除語意如何「自動」成立（BR-3 / AC-8）**：
- 「無對應客戶」：`cc.*` 全 NULL → `cc.gender IN (...)` / `LEFT(cc.cpost_city,3) IN (...)` / `AGE(...,NULL)` 均求值為 `NULL` → `WHERE` 過濾為 false → 排除。
- 「客戶欄本身 NULL」：同上機制，無需特殊分支。
- **不得**對任何 `cc.*` 欄位 COALESCE 為預設值（BR-3 硬性要求；本函式所有分支均無 COALESCE，符合）。
- 兩種情境由**同一段 SQL 三值邏輯**處理，無需 if/else 特判，天然滿足 AC-8 的兩個排除子句。

**參數命名空間隔離（避免與 composer 既有 param 撞名）**：composer 既有前綴 `cat{n}` / `numMin{n}` / `numMax{n}` / `dateStart{n}` / `dateEnd{n}` / `pbCat{n}` / `pbNum{n}` / `caseyear{n}`；本函式一律使用 `cc` 前綴（`ccCat{n}` / `ccAgeMin` / `ccAgeMax` / `ccWorkdt`），零碰撞。此為**強制命名規則**（不變式 I-CC-PARAM-NS-01）。

---

### OQ-F109-03　「性別」實體欄位確認（RESOLVED — 已由 Phase 0 dev 實查解決）

**裁定**：**遵循 story，使用 `customer_core.gender`（`VARCHAR(1)`），不改綁 `cus_sex`。**

**依據**：Phase 0 dev 實查 `SELECT DISTINCT gender FROM customer_core` 結果為 `1`（男）/ `2`（女）/ `3`（法人）+ 空白 + 約 25 筆雜訊碼（總 360 萬筆中占比極低）。`gender` 值域乾淨，可直接 `cc.gender IN (:...values)` 比對，無需如 `cus_sex`（F104 計分引擎使用之欄位，含 `'C'`/`'D'`/`'8'` 等大量髒值，需要 `<safe_int>` NULL-safe cast，AD-E07-34）的防禦性 cast。

**雜訊碼處理**：25 筆雜訊碼（非 `1`/`2`/`3`）**不特殊處理**——因白名單 seed 的可選值僅 `1`/`2`/`3`（AC-5），雜訊碼永遠不會出現在使用者選取的 `values` 中，`IN (...)` 天然不比對到 → 該客戶被排除（與 NULL 排除語意一致，非錯誤）。`gender` 與 `cus_sex` 為 `customer_core` 上兩個獨立欄位（分別服務 F109 篩選 與 F104 計分），互不影響、無需同步。

---

### OQ-F109-04　LEFT JOIN 效能 / 索引（RESOLVED — 索引已存在，無需新 migration）

**裁定**：**不需新增索引**。已查證兩側索引齊備：

| 表.欄位 | 索引 | 來源 migration |
|---|---|---|
| `customer_core.source_customer_no` | `idx_customer_core_source_no`（**UNIQUE**） | `1711360000000-CreateCustomerCore.ts` |
| `ob_pool_data.custo_no` | `idx_ob_pool_data_custo_no` | `1711360000110-CreateObPoolData.ts` |

**基數不變式（I-CC-JOIN-CARD-01）**：`source_customer_no` 為 **UNIQUE** 索引，保證 `LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no` 對每筆 `ob_pool_data` 列最多匹配 1 筆 `customer_core` 列（1:1 或 1:0），**不會列膨脹**。這對 `estimateStage1SqlCount`（`SELECT COUNT(*)`）與 `runStage1SqlInsert`（`INSERT…SELECT`）皆是正確性前提——若此唯一性未來被 ETL 破壞（`source_customer_no` 出現重複），COUNT 會虛增、INSERT 會產生重複派案列。**此為高風險不變式，`customer_core` ETL pipeline 必須保持 `source_customer_no` UNIQUE 約束**（現有 migration 已建 UNIQUE INDEX，若 ETL 寫入邏輯改動須確保不違反此約束，非本 AD 範圍但列為風險見 §10）。

**效能影響範圍**：本 JOIN 為**條件式注入**（僅名單引用 customer_core 欄位時才 JOIN），純案件資料名單（多數既有名單）SQL 與效能**完全不變**（regression guard，spec §10 已列測試要求）。對「有」customer_core 條件的名單，JOIN 兩側皆為 B-tree/UNIQUE 索引 equality join，PG 應規劃為 Nested Loop 或 Hash Join，成本可控，360 萬筆 `customer_core` 不會被全表掃描（僅透過 `custo_no` 索引查找對應列）。

---

### OQ-F109-05　是否開放 UI 新增任意 customer_core 欄位（RESOLVED — 維持 seed-only）

**裁定**：**F109 維持 seed-only**，不擴充 `available-columns` 端點、不擴充 `POST /api/v1/pooldata-fields` 之 `CreatePooldataFieldInput`（維持不含 `dataSource`，經 API 新增之欄位一律沿用 DB `DEFAULT 'ob_pool_data'`）。

**理由**：擴充至「Admin 自由選 customer_core 任意欄位建白名單」需要 (1) `available-columns` 端點改為可指定來源、(2) `POST` DTO 增加 `dataSource` 欄位與對應寫入驗證、(3) 前端 UI 選源器；三者皆非 MVP 範圍必要，且 F109 明確要求的 8 欄已透過 migration seed 滿足業務需求。若未來有「業務主管自選任意客戶欄位」的明確需求，須另開 spec 評估（含 `buildCustomerCoreClause` 的 switch-case 需改為資料驅動，而非目前的 8 欄硬編碼）。

---

## 4. Schema 變更與 Migration 計畫

### 4.1 `pooldata_field_whitelist.data_source`

| 屬性 | 決定 |
|---|---|
| 型別 | `VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'` |
| CHECK | PG：`CHECK (data_source IN ('ob_pool_data', 'customer_core'))`；SQLite：不建 CHECK（沿用既有 `field_type` 之「PG CHECK / SQLite 應用層保證」慣例，entity TS 型別 `'ob_pool_data' \| 'customer_core'` + service 層只會寫入合法值） |
| 既有 7 筆 backfill | **自動達成**：PG `ALTER TABLE ... ADD COLUMN data_source VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'` 對既有列自動套用 DEFAULT，無需額外 UPDATE 陳述式 |
| Entity | `pooldata-field-whitelist.entity.ts` 新增 `@Column({ name: 'data_source', type: 'varchar', length: 20, default: 'ob_pool_data' }) dataSource: 'ob_pool_data' \| 'customer_core';` |

### 4.2 Migration 檔案（下一可用編號 = m305）

**`1711360000305-AddDataSourceToPooldataFieldWhitelist.ts`**（schema-only，小顆粒、易審查/易 revert）：
- PG：`ALTER TABLE pooldata_field_whitelist ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'` + `ADD CONSTRAINT chk_pooldata_whitelist_data_source CHECK (data_source IN ('ob_pool_data','customer_core'))`
- SQLite：`ALTER TABLE pooldata_field_whitelist ADD COLUMN data_source VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'`（無 CHECK）
- `down()`：DROP CONSTRAINT（PG）+ DROP COLUMN

**`1711360000306-SeedCustomerCoreFilterFields.ts`**（資料 seed，沿用 F075/F076 `ON CONFLICT DO NOTHING` 冪等慣例，BR-12；比照 m286 分離「schema」與「seed」兩支 migration 以利個別審查，但不採 m286 的 UPSERT/DO UPDATE——F109 無「覆寫殘留舊資料」需求，單純新增）：
1. INSERT 8 筆 `pooldata_field_whitelist`（`data_source='customer_core'`, `is_active=true`, `is_system_fixed=false`）：`gender` / `date_of_birth` / `occupation_desc` / `education_desc` / `marital_status_desc` / `customer_type_desc` / `monthly_income_desc` / `cpost_city`（`field_type` 依 F109 spec §5.2：`date_of_birth`=numeric，其餘 7 筆=categorical）
2. INSERT `pooldata_field_option`：7 個 categorical 欄位之可選值（gender 3 / occupation_desc 55 / education_desc 8 / marital_status_desc 5 / customer_type_desc 4 / monthly_income_desc 9 / cpost_city 22），值內容依 F109 spec §5.4；**職業別 55 筆須以 dev `SELECT DISTINCT occupation_desc FROM customer_core` 完整枚舉核對**（spec A-3，tdd-implementation 落地時執行，非本 AD 逐筆列舉）
3. PG：`ON CONFLICT (column_name) DO NOTHING` / `ON CONFLICT (column_name, option_value) DO NOTHING`；SQLite：`INSERT OR IGNORE`
4. `down()`：DELETE `pooldata_field_option WHERE column_name IN (8 個欄名)` → DELETE `pooldata_field_whitelist WHERE column_name IN (8 個欄名)`（子表先刪，FK 安全）

不需要新增 `customer_core` 側 migration（索引已齊備，§OQ-F109-04）。

---

## 5. Stage 1 SQL 契約（檔案異動清單）

```mermaid
graph TD
    A["condition_payload.conditions[]"] --> B{"resolveConditionDataSource(cond)"}
    B -->|ob_pool_data| C["buildStage1WhereConditions（composer，不變）\n輸出：裸欄名 fragment，如 \"prod_kind\" IN (...)"]
    B -->|customer_core| D["buildCustomerCoreClause（新模組）\n輸出：cc.* fragment + LEFT JOIN 子句"]
    C --> E["clauses[]（AND 合併）"]
    D --> E
    D -->|join≠null| F["FROM ob_pool_data o\nLEFT JOIN customer_core cc ON cc.source_customer_no=o.custo_no"]
    D -->|join=null（無 customer_core 條件）| G["FROM ob_pool_data o（不變，AC-11 regression guard）"]
    E --> H["stage1-sql-executor.ts\nINSERT…SELECT / SELECT COUNT(*)"]
    F --> H
    G --> H

    classDef unchanged fill:#e8e8e8,stroke:#888
    classDef new fill:#d4f4dd,stroke:#2a9d5c
    class C,G unchanged
    class D,F new
```

### 5.1 `stage1-query-composer.ts`（既有檔，最小異動）

- **export** `CUSTOMER_CORE_COLUMN_NAMES`、`resolveConditionDataSource`、`SAFE_COLUMN_NAME_RE`（供新模組 import；composer 簽名 `buildStage1WhereConditions(list)` **不變**）。
- `buildPathA` 的 condition 迴圈開頭新增：
  ```typescript
  for (const cond of payload.conditions) {
    if (resolveConditionDataSource(cond) === 'customer_core') continue; // F109：委派 buildCustomerCoreClause
    if (cond.fieldType === 'categorical') { ... }  // 其餘邏輯完全不變
  ```
- composer 自身的 `EMPTY_CONDITIONS` 判定邏輯（`if (fragments.length === 0) return {...skipReason:'EMPTY_CONDITIONS'}`）**維持逐字不變**——即使名單只含 customer_core 條件、composer 因此回報 `EMPTY_CONDITIONS`，也不代表整個 Stage1 查詢要 skip；**是否真正 skip 改由呼叫端（§5.2/5.3）依「composer 側與 customer_core 側是否皆無有效 fragment」統一判定**（見下方統一 skip 邏輯）。此設計零風險破壞既有 40+ composer 單元測試（無 customer_core 條件的既有測試案例，`resolveConditionDataSource` 恆回傳 `'ob_pool_data'`，行為 100% 不變）。

### 5.2 `stage1-sql-builder.ts`（`buildStage1Sql`）

```typescript
// Stage1SqlCore 新增欄位
export interface Stage1SqlCore {
  where: string | null;
  params: Record<string, unknown>;
  fromAlias: 'o';
  skip: boolean;
  skipReason?: 'EMPTY_CONDITIONS';
  warnings: Stage1ChainWarning[];
  /** F109 / AD-E07-37：customer_core LEFT JOIN 子句；null = 不注入 */
  customerCoreJoin: string | null;
}
```

`buildStage1Sql` 內部順序調整：
1. 呼叫 `buildStage1WhereConditions(list)`（不變）。
2. **新增**：`const ccConditions = list.condition_payload?.conditions ?? [];` → `buildCustomerCoreClause(ccConditions, workdt, 'o', warnings)`。
3. **統一 EMPTY_CONDITIONS 判定**（取代現行 `if (fieldFragment.skipReason === 'EMPTY_CONDITIONS')`）：
   ```typescript
   if (fieldFragment.where === null && customerCoreClause.whereFragments.length === 0) {
     return { where: null, params: {}, fromAlias, skip: true, skipReason: 'EMPTY_CONDITIONS',
       warnings, customerCoreJoin: null };
   }
   ```
   當無 customer_core 條件時，`customerCoreClause.whereFragments` 恆為 `[]`，此判斷退化為與現行邏輯完全等價（`fieldFragment.where === null` 與 `fieldFragment.skipReason === 'EMPTY_CONDITIONS'` 為同義，composer 兩者同步設定）——**對既有 ob_pool_data-only 名單零行為改變**。當名單**僅**含 customer_core 條件（如 TC-172-06「性別 IN [1]」單一條件）：`fieldFragment.where === null`（composer 側因迴圈 continue 全部條件，fragments 為空，觸發既有 EMPTY_CONDITIONS 分支）但 `customerCoreClause.whereFragments.length > 0` → 整體判斷為 false → **不 skip，正確繼續組裝查詢**（修正純方案 (a) 若未特別處理會誤判 skip 的陷阱）。
4. 其餘 clauses（`fieldFragment.where` 包裹入 `clauses`、`customerCoreClause.whereFragments` 逐一 push、`Object.assign(params, customerCoreClause.params)`）於 month_cnt fragment **之前**併入（順序不影響正確性，AND 交換律）。
5. 回傳物件所有分支補上 `customerCoreJoin: customerCoreClause.join`。

### 5.3 `stage1-sql-executor.ts`

`runStage1SqlInsert` 與 `estimateStage1SqlCount` 的 SQL 模板各自在 `FROM ob_pool_data o` 之後插入 `${core.customerCoreJoin ? core.customerCoreJoin + ' ' : ''}`：

```typescript
// estimateStage1SqlCount
const countSql =
  `SELECT COUNT(*) AS cnt FROM ob_pool_data o ` +
  `${core.customerCoreJoin ? core.customerCoreJoin + ' ' : ''}` +
  `WHERE ${core.where}`;

// runStage1SqlInsert（customer_core JOIN 插在既有 pdl CR JOIN 之前，順序不影響正確性）
const selectSql =
  `INSERT INTO ob_monthly_run_result (...) ` +
  `SELECT ... FROM ob_pool_data o ` +
  `${core.customerCoreJoin ? core.customerCoreJoin + ' ' : ''}` +
  `LEFT JOIN (SELECT ... FROM ob_pool_data_list WHERE list_no = :insListNo) pdl ON ... ` +
  `WHERE ${core.where}`;
```

### 5.4 `stage1-filter-chain.ts`（`executeStage1Chain`）

```typescript
const fieldFragment = buildStage1WhereConditions(list);
for (const w of fieldFragment.warnings) warnings.push(w);
const appliedRuleIds = computeAppliedRuleIds(list);

// F109 新增
const ccConditions = list.condition_payload?.conditions ?? [];
const customerCoreClause = buildCustomerCoreClause(ccConditions, workdt, 'ob_pool_data', warnings);

if (fieldFragment.where === null && customerCoreClause.whereFragments.length === 0) {
  return { count: 0, cases: opts.dryRun ? undefined : [], skipped: true,
    skipReason: 'EMPTY_CONDITIONS', warnings, appliedRuleIds };
}

const whereClauses: string[] = [];
const params: Record<string, unknown> = {};
if (fieldFragment.where) { whereClauses.push(`(${fieldFragment.where})`); Object.assign(params, fieldFragment.params); }
for (const f of customerCoreClause.whereFragments) whereClauses.push(f);
Object.assign(params, customerCoreClause.params);
if (monthCntFragment) { ... }  // 不變

const qb = poolRepo.createQueryBuilder('ob_pool_data');
if (customerCoreClause.join) {
  qb.leftJoin('customer_core', 'cc', 'cc.source_customer_no = ob_pool_data.custo_no');
}
if (whereClauses.length > 0) { qb.where(whereClauses.join(' AND '), params); }
let pool = await qb.getMany();
// ⑤⑥ 去重 / 特例 DELETE：完全不變（ob_pool_data-only，與 customer_core 無關）
```

**注意**：TypeORM `.leftJoin(tableName, alias, condition)` 傳入原始表名字串（非 relation path）是合法用法，不需要 `customer_core` 有對應 Entity/Relation 定義。`getMany()` 只 hydrate `ObPoolData` 自身欄位，`cc.*` 不會被 SELECT（未呼叫 `leftJoinAndSelect`），不污染回傳型別。

---

## 6. 寫入路徑契約（`assignment-list.service.ts`）

`createList` / `updateList` 於既有流程新增一步 `stampConditionDataSource`，**插入順序**：

```
1. loadSystemFixedFields()
2. validateConditionPayload(dto.conditionPayload, systemFixedColumnNames)   // 不變
2b. dto.conditionPayload = injectSystemFixedConditions(...)                 // 不變
2c. dto.conditionPayload = await this.stampConditionDataSource(dto.conditionPayload)   // F109 新增
3. copyFromListNo 檢查                                                       // 不變
4. deriveBackwardCompatColumns(dto.conditionPayload)                        // 不變（仍只讀 5 個 legacy 欄，忽略 dataSource）
5. findActiveConditionDuplicate(...)                                        // 不變（已驗證 normalizeConditionPayload 不受影響，§10.3）
```

**必須在 `injectSystemFixedConditions` 之後**：確保系統固定注入之 `best_case` 條件（本來就是 `ob_pool_data` 來源）也一併蓋上 `dataSource:'ob_pool_data'`，避免遺漏。

```typescript
private async stampConditionDataSource<T extends ObListDefinitionConditionPayload>(
  payload: T | null | undefined,
): Promise<T | null | undefined> {
  if (!payload || !Array.isArray(payload.conditions)) return payload;
  const activeRows = await this.whitelistRepo.find({ where: { is_active: true } });
  const dataSourceMap = new Map(activeRows.map((r) => [r.column_name, r.dataSource]));
  const conditions = payload.conditions.map((c) => ({
    ...c,
    dataSource: dataSourceMap.get(c.columnName) ?? 'ob_pool_data',
  }));
  return { ...payload, conditions } as T;
}
```

> 實作優化建議（非強制）：`validateConditionPayload` 已於 step 2 查詢過 `activeRows`；tdd-implementation 可考慮重構為共用同一次查詢結果，避免重複 DB round-trip。此為效能優化，不影響正確性，不作為本 AD 硬性契約。

**不需要 backfill migration**：既有 `condition_payload` JSONB 之 `conditions[].dataSource` 保持缺漏，由 §3 OQ-F109-01 之 fallback 機制在讀取時正確解析。

---

## 7. API 契約

### 7.1 `GET /api/v1/pooldata-fields`

`pooldata-field-whitelist.service.ts`：
- `PooldataFieldItem` 介面新增 `dataSource: 'ob_pool_data' | 'customer_core';`
- `_toItem(row)` 新增 `dataSource: row.dataSource,`

`CreatePooldataFieldInput` / `UpdatePooldataFieldInput` **不變更**（不新增 `dataSource` 可寫欄位，對齊 OQ-F109-05 seed-only 裁定；經 API 新增之白名單欄位一律沿用 DB `DEFAULT 'ob_pool_data'`）。

### 7.2 `GET /api/v1/pooldata-fields/available-columns`

**不變更**（OQ-F109-05），維持僅回傳 `ob_pool_data` 既有但未列入白名單之欄位。

---

## 8. 不變式（Invariants）

| ID | 說明 |
|---|---|
| **I-CC-DATASOURCE-01** | condition 之 `data_source` 一律經 `resolveConditionDataSource` 決定性解析（固化值優先，靜態 Set fallback 次之）；Stage 1 讀取路徑**永不** runtime 查詢 `pooldata_field_whitelist` 做 JOIN 決策（沿用 F075 BR-4） |
| **I-CC-JOIN-CARD-01** | `customer_core.source_customer_no` UNIQUE 索引保證 LEFT JOIN 基數 ≤1:1，Stage1 COUNT / INSERT 不因 JOIN 列膨脹 |
| **I-CC-NULL-EXCLUDE-01** | customer_core 條件 fragment 一律不得 COALESCE；NULL（無對應客戶 / 客戶欄本身 NULL）恆通過 SQL 三值邏輯自然排除，兩種情境共用同一段運算式，不得另立 if/else 特判 |
| **I-CC-COMPOSER-SCOPE-01** | `buildStage1WhereConditions` 僅負責 `ob_pool_data` 側 fragment；customer_core 側 fragment 一律由 `buildCustomerCoreClause` 產生，composer 不得內建任何 `cc.` 前綴邏輯 |
| **I-CC-PARAM-NS-01** | `buildCustomerCoreClause` 參數命名一律 `cc` 前綴（`ccCat{n}` / `ccAgeMin` / `ccAgeMax` / `ccWorkdt`），與 composer 既有前綴（`cat`/`numMin`/`numMax`/`dateStart`/`dateEnd`/`pbCat`/`pbNum`/`caseyear`）零碰撞 |

---

## 9. 測試邊界（PG-only 限制，供 test-designer 參考）

`customer_core` 僅存在於 PostgreSQL（SQLite 測試 DB 無此表）。因此：
- 含 customer_core 條件的 Stage 1 測試（AC-6~AC-11、TC-172-05~10）**只能寫在 `.pg.spec.ts`**（比照既有 `stage1-sql-pushdown.pg.spec.ts` / `stage2to4-score-source-f104.pg.spec.ts` 慣例），需要真實 PostgreSQL 連線。
- 「PG 下推 vs JS chain 路徑等價」（BR-10 DoD）測試須在同一支 `.pg.spec.ts` 內，對同一 PG 資料庫**分別呼叫 `buildStage1Sql`/`estimateStage1SqlCount` 與 `executeStage1Chain`**，比對兩者回傳的 `count`（或案件集合）一致——不是「PG vs SQLite」比較，而是「同一 PG DB 上兩條程式路徑」比較（因兩路徑皆呼叫同一個 `buildCustomerCoreClause`，理論上應逐位元等價，此測試主要作為 regression guard 而非發現新差異的手段）。
- **不需要**在既有 SQLite-backed composer/chain 單元測試（`stage1-query-composer.spec.ts`、`stage1-filter-chain.spec.ts` 等）中加入 customer_core 情境——這些測試環境沒有 customer_core 表，加入會直接失敗。純案件資料 regression（AC-11「無 customer_core 條件不注入 JOIN」）**可以且應該**在 SQLite 測試中驗證（斷言 `core.customerCoreJoin === null` / 對現有名單行為不變），不需要真的執行含 JOIN 的查詢。

---

## 10. 風險與殘留議題

### 10.1 舊 `condition_payload` columnName 碰撞風險（低機率，已知可接受）

若 F109 上線前某名單的 `condition_payload` 恰好含有一個 `columnName` 字面值與 8 個 customer_core 欄名之一相同（例如假設性地曾經有人在別的脈絡下使用了 `gender` 這個字串——實務上不可能，因為 F109 之前白名單只有 7 個 `ob_pool_data` 欄位，且 `validateConditionPayload` 的 whitelist 檢查會拒絕不在白名單內的 `columnName`，故理論上**不存在**這種舊資料）。列為文件化風險而非需要工程處理的問題。

### 10.2 `customer_core` schema 未來欄位命名碰撞（低機率，fail-loud 可接受）

若 `customer_core` 物理表未來新增與現行 7 個 `ob_pool_data` 白名單欄名相同的欄位（如假設性 `customer_core.prod_kind`），composer 產出的裸欄名 fragment（`"prod_kind" IN (...)`）在有 JOIN 存在時會變成**歧義引用**，PostgreSQL 會拋出 `column reference "prod_kind" is ambiguous` 編譯期錯誤。此為**失敗即顯（fail-loud）**而非靜默錯誤，與本專案既有先例（`stage1-sql-executor.ts` 對 `ob_pool_data_list` CR JOIN 的同類風險，已在該檔案註解中明確接受）一致的風險接受策略，不需要額外防禦程式碼。

### 10.3 名單重複偵測（`findActiveConditionDuplicate`）已驗證不受影響

`normalizeConditionPayload`（§18.8 完整條件集相等比對）之簽章字串只萃取 `columnName:fieldType:values/min~max/dateStart~dateEnd`，**不包含** `dataSource`，故新增此欄位對既有重複偵測邏輯零影響，不需修改。

### 10.4 效能觀察建議（非阻擋）

建議在 prod 上線後首次含 customer_core 條件之月跑，人工 `EXPLAIN ANALYZE` 驗證 PG 實際採用 Nested Loop / Hash Join（而非因統計資訊過舊誤選 Seq Scan），作為 post-deploy 觀察項，非本 AD 阻擋項。
