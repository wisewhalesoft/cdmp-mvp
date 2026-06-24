---
ad-id: AD-E07-v3.5
title: F103 月跑計分引擎欄位來源修正（Stage 2 Score Column Source Fix）
feature-id: F103
source-stories: US-156 / US-157 / US-158
epic: E07
module: M04 分派執行
version: "1.0"
date: 2026-06-24
status: approved
author: system-architect
---

# AD-E07-v3.5：F103 月跑計分引擎欄位來源修正

## Agent Loading Guide

| Agent 角色 | 需載入章節 |
|-----------|-----------|
| TDD Developer | §3（OQ 定案）+ §4（PG 下推精確改法）+ §5（JS oracle 精確改法）+ §6（interface 變更）+ §7（invariant）+ §9（migration 無） |
| Test Designer | §7（invariant + EQ DoD）+ §8（測試注意事項）+ F103 spec §11 |
| QA / Tester | §8（驗收 / 202606 重跑）+ F103 spec §4 AC-11 / AC-12 |

---

## 1. 背景與問題定義

### 1.1 現況缺漏

Stage 2 計分引擎存在兩條平行路徑，兩條路徑皆**未完整對齊 AD-E07-10-L 映射表**：

| 路徑 | 入口函式 | 環境 | 現況缺漏 |
|------|---------|------|---------|
| PG 下推 SQL | `resolveColumnSource` → `buildStage2ScoreExpr` | 正式月跑（`DB_TYPE='postgres'`） | `ADD_UN_CAPITAL` 無 case → undefined → +0；`default` 回 undefined（無通用 fallback）；`PROJECT_TP` 衍生缺 `spec_name` 邏輯；`COMMISSION` 死碼殘留 |
| JS oracle | `resolveColumnValue` → `computeScore` | 非 PG / 單元測試 golden path | 僅映射 `LIST_MONTH` / `PROJECT_TP` / `CAR_YEAR` / `COMMISSION`（死碼），其餘全回 `''` → 無法計分（含全部 customer_core 欄 + ADD_UN_CAPITAL） |

現況後果：H 卡理論上界 255 分，實際 score 範圍 81–152（ADD_UN_CAPITAL +36 分 + customer_core 各欄全缺）→ 無案件達 card C 門檻（185）→ 全 card D → 全 T3，Stage 3/4 比例分派以 tier 分組失去意義。

### 1.2 AD-E07-10-L 現況（architecture-spec.md line 4074–4091）

AD-E07-10-L 映射表本身**正確**，已含所有需求欄位（含 `ADD_UN_CAPITAL` / 通用 fallback / `PROJECT_TP` 衍生 / `SALES_STS`）。兩引擎路徑未完整實作此表，為實作落差，**非 AD 本身錯誤**。

> **稽核結論（AC-5 前置）**：逐欄比對 AD-E07-10-L 與 legacy `OBLEVELCARD_COLUNM_20260505.csv`，所有 active 欄皆可在 AD 映射表找到對應來源，AD 無需修正。`COMMISSION` 在 legacy dump 0 筆且不在 AD 映射表，確認為死碼。

---

## 2. 架構決策

### 2.1 整體原則

- **對齊 AD-E07-10-L 為唯一目標**：所有修正皆以使兩路徑逐欄對齊 AD 映射表為準，不發明新映射。
- **PG 下推為正式路徑，JS oracle 為 EQ 驗證路徑**：正式月跑走 PG；JS oracle 僅用於非 PG 環境（單元測試 / dev 非 PG）及 EQ DoD 驗證。
- **不改 `computeScore` 函式簽章**：採 OQ-1 建議 (b)，呼叫端 batch pre-fetch merge，維持純函式介面對既有測試最小衝擊。
- **`Stage2ScoreSql` interface 擴充 `needsArCapital` flag**：沿用 `needsCustomerCore` 既有 pattern，正交擴充，呼叫端對稱處理。
- **無 migration**：本 feature 純邏輯修正，不新增/修改資料表或 index（`ob_arreturndf_min_cap` PK 與 `customer_core` index 已於先前 ETL migration 建立）。

---

## 3. OQ 定案

### OQ-1 定案：呼叫端 batch pre-fetch merge（採建議 (b)）

**問題**：`computeScore` 現行簽章無 `customer_core` / `ob_arreturndf_min_cap` 參數，JS oracle 無法取到客戶屬性或 `ADD_UN_CAPITAL`。

**定案**：採 **(b) 呼叫端 batch pre-fetch merge**。

```
在 scoredPool.map() 之前（pipeline service line ~624）：
  1. 收集本 list 之 custo_no 集合（去重）
  2. batch 查 customer_core WHERE source_customer_no IN (...)
  3. 收集本 list 之 appl_no 集合（去重）
  4. batch 查 ob_arreturndf_min_cap WHERE appl_no IN (...)
  5. 建 Map<custo_no, CustomerCoreRow> + Map<appl_no, ArCapitalRow>
  6. 在 pool.map() 前，對每個 pool 物件組裝 PoolWithExtras wrapper：
     { pool, cc: ccMap.get(pool.custo_no) ?? null, arCap: arMap.get(pool.appl_no) ?? null }
  7. scoredPool = poolWithExtras.map(({ pool, cc, arCap }) =>
       computeScore(pool, cardType, cardVersion, activeColumns, allScores, cc, arCap) → ...)
```

**理由**：
- `computeScore` 維持純函式，不引入 async / repository 依賴，EQ 測試易寫（fixture 直接塞 cc / arCap）。
- batch 查詢（IN clause）對每個 list 各執行一次，比 per-row lookup 顯著減少 RTT。
- 與 PG 路徑 LEFT JOIN 語意等價（無對應 customer_core → cc=null → 屬性欄缺值 default；無 arreturndf → arCap=null → ADD_UN_CAPITAL=0）。
- SQLite 測試無需建 customer_core / arreturndf 表（OQ-3 連帶解決）。

**`computeScore` 新簽章**（最小擴充，型別安全）：
```typescript
private computeScore(
  pool: ObPoolData,
  cardType: string,
  cardVersion: number,
  activeColumns: ObLevelcardColumn[],
  allScores: ObLevelcardScore[],
  cc: CustomerCoreRow | null,       // 新增，batch pre-fetch 結果
  arCap: ArCapitalRow | null,       // 新增，batch pre-fetch 結果
): number
```

`CustomerCoreRow` / `ArCapitalRow` 為 plain object type（非 TypeORM entity），定義於 pipeline service 同檔或共用 interface 檔：

```typescript
interface CustomerCoreRow {
  source_customer_no: string;
  gender: string | null;
  date_of_birth: Date | null;
  education_code: string | null;
  residential_zip: string | null;
  mailing_zip: string | null;
  company_zip: string | null;
  home_phone: string | null;
  contact_phone: string | null;
  mobile_phone: string | null;
}

interface ArCapitalRow {
  appl_no: string;
  add_un_capital: number | null;
}
```

### OQ-2 定案：同 OQ-1 單一 pre-fetch 流程（採建議 (b)）

**問題**：JS oracle 取 `ob_arreturndf_min_cap.add_un_capital` 無資料流。

**定案**：與 OQ-1 合併為同一 pre-fetch 流程。呼叫端一次 batch 查 `ob_arreturndf_min_cap WHERE appl_no IN (...)` 建 `Map<appl_no, ArCapitalRow>`，merge 至 `computeScore` 第 7 個參數 `arCap`。

**invariant I-SCORE-PREFETCH-01**：JS 路徑每個 list 恰好執行兩次 batch 查詢（customer_core / ob_arreturndf_min_cap 各一次），不得 per-row lookup（N+1）。

### OQ-3 定案：SQLite 測試免建 cc / ar 表（OQ-1 (b) 連帶解決）

**問題**：SQLite 測試環境是否需 mock `customer_core` / `ob_arreturndf_min_cap` 表。

**定案**：依 OQ-1 (b)，`resolveColumnValue` 改讀 `computeScore` 參數 `cc` / `arCap`，不直接查表。SQLite 單元測試**無需建 customer_core / arreturndf 表**，僅需於測試 fixture 中直接傳入 `cc` / `arCap` 物件（可為 null）。EQ DoD 測試在 PG 真庫執行（PG-only gate，與 `stage2to4-sql-builder.spec.ts` 現行 pattern 一致）。

---

## 4. PG 下推精確改法（`stage2to4-sql-builder.ts`）

### 4.1 `Stage2ScoreSql` interface 擴充

```typescript
export interface Stage2ScoreSql {
  scoreExpr: string | null;
  needsCustomerCore: boolean;
  needsArCapital: boolean;  // ← 新增：有 active ADD_UN_CAPITAL 欄時為 true
  params: Record<string, unknown>;
}
```

### 4.2 `resolveColumnSource` 修正項目

#### (a) 新增 `ADD_UN_CAPITAL` case（BR-F103-01）

```typescript
case 'ADD_UN_CAPITAL':
  return { kind: 'range', expr: 'COALESCE(ar.add_un_capital, 0)' };
```

alias `ar` = `ob_arreturndf_min_cap`（由呼叫端在 `needsArCapital=true` 時注入 LEFT JOIN）。

#### (b) 移除 `COMMISSION` case（BR-F103-05）

刪除：
```typescript
case 'COMMISSION':
  return { kind: 'range', expr: 'COALESCE(CAST(o.commission AS numeric), 0)' };
```

#### (c) 修正 `PROJECT_TP` case（BR-F103-03，補 spec_name 衍生）

現行（錯誤）：
```typescript
case 'PROJECT_TP':
  return { kind: 'category', expr: "COALESCE(o.spec_tp, '01')" };
```

修正後：
```typescript
case 'PROJECT_TP':
  return {
    kind: 'category',
    expr: "CASE WHEN o.spec_name LIKE '%專案%' THEN 'A' ELSE COALESCE(o.spec_tp, '01') END",
  };
```

> **前置確認（A-4）**：tdd 落地前以 `ObPoolData` entity 查證 `spec_name` 欄位存在且為 `string | null`；若欄名不符，依 entity 修正表達式，不變更 AD。

#### (d) 實作通用 fallback，取代 `default: return undefined`（BR-F103-04）

現行：
```typescript
default:
  return undefined;
```

修正後：
```typescript
default:
  // 通用引擎 fallback（AD-E07-10-L line 4091）：
  // 未 hardcode 之 ob_pool_data 數值欄位 → to_jsonb(o) 取值 cast numeric。
  // 安全性：column_name 已由 ob_levelcard_column 資料庫 active row 提供（非使用者輸入）；
  //   lower() 處理大小寫差異。category 維度（字串相等）不走此 fallback，已由 hardcode case 處理。
  // 幽靈欄位（ob_pool_data 無此 key）→ COALESCE 取 0 → 靜默 +0（BR-F103-08）。
  return {
    kind: 'range',
    expr: `COALESCE((to_jsonb(o)->>'${columnName.toLowerCase()}')::numeric, 0)`,
  };
```

**安全性論據**：
- `columnName` 來自 `ob_levelcard_column.column_name`（DB 管理者設定，非外部使用者輸入），不存在 SQL injection 風險。
- `lower()` 確保大小寫一致（`ADD_UN_CAPITAL` → `add_un_capital`）。
- 非數值文字（如 `'ABC'`）→ `cast numeric` 失敗 → `NULL` → `COALESCE` 取 0，不阻擋月跑（BR-F103-08）。
- category 維度（字串欄）已在 hardcode case 明確處理，不進入 default 分支；即使意外進入，`cast numeric` 會回 0，不匹配 category score row，結果等同 +0（無害）。

#### (e) 在 `buildStage2ScoreExpr` 中追蹤 `needsArCapital`

```typescript
let needsCustomerCore = false;
let needsArCapital = false;  // ← 新增

for (const col of activeColumns) {
  if (!col.column_name) continue;
  const src = resolveColumnSource(col.column_name);
  if (!src) continue;

  if (CUSTOMER_CORE_COLUMNS.has(col.column_name)) needsCustomerCore = true;
  if (col.column_name === 'ADD_UN_CAPITAL') needsArCapital = true;  // ← 新增

  // ... 其餘 CASE fragment 組裝不變 ...
}

return { scoreExpr: ..., needsCustomerCore, needsArCapital, params };
```

> **注意**：通用 fallback case 已回傳 `ColumnSource`（不再回 `undefined`），故 `if (!src) continue` 不再跳過未 hardcode 欄位。幽靈欄位（`ob_pool_data` 不存在此 key）靜默 +0，`buildStage2ScoreExpr` 無需額外判斷。

#### (f) 更新 `MAPPED_SCORING_COLUMNS` 公開集合

移除 `'COMMISSION'`，新增 `'ADD_UN_CAPITAL'`：

```typescript
export const MAPPED_SCORING_COLUMNS = [
  'LIST_MONTH',
  'PROJECT_TP',
  'CAR_YEAR',
  // 'COMMISSION' ← 移除（BR-F103-05）
  'CUS_SEX',
  'AGE',
  'EDUCAT_BACK',
  'CAREA_NO1',
  'CAREA_NO2',
  'CELLULAR',
  'HPOST_NUM_NM',
  'CPOST_NUM_NM',
  'CO_NUM_NM',
  'SALES_STS',
  'LOAN_RATE',
  'ADD_UN_CAPITAL',  // ← 新增（BR-F103-01）
] as const;
```

---

## 5. PG executor 呼叫端修正（`stage2to4-sql-executor.ts`）

### 5.1 `ob_arreturndf_min_cap` LEFT JOIN 注入

在 `runStage2and3Sql` 中，沿用 `needsCustomerCore` 的對稱 pattern：

```typescript
const { scoreExpr, needsCustomerCore, needsArCapital, params: scoreParams } =
  buildStage2ScoreExpr(...);

const customerCoreJoin = needsCustomerCore
  ? 'LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no'
  : '';

// ← 新增
const arCapitalJoin = needsArCapital
  ? 'LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no'
  : '';
```

SQL 組裝位置（緊接 `customerCoreJoin` 之後）：

```typescript
`FROM ob_pool_data o ` +
`${customerCoreJoin} ` +
`${arCapitalJoin} ` +          // ← 新增
`CROSS JOIN LATERAL (SELECT ${scoreSelect} AS score) sub ` +
// ... 其餘不變 ...
```

**JOIN 順序**：`customer_core` 先，`ob_arreturndf_min_cap` 後，均為 LEFT JOIN（不掉列）。alias 固定：`o`（pool）/ `cc`（customer_core）/ `ar`（arreturndf）。

---

## 6. JS oracle 精確改法（`assignment-run-pipeline.service.ts`）

### 6.1 新增 plain-object types

在 pipeline service 頂端（或共用 interface 檔）定義：

```typescript
interface CustomerCoreRow {
  source_customer_no: string;
  gender: string | null;
  date_of_birth: Date | null;
  education_code: string | null;
  residential_zip: string | null;
  mailing_zip: string | null;
  company_zip: string | null;
  home_phone: string | null;
  contact_phone: string | null;
  mobile_phone: string | null;
}

interface ArCapitalRow {
  appl_no: string;
  add_un_capital: number | null;
}
```

### 6.2 呼叫端 batch pre-fetch（scoredPool.map 前，line ~621）

```typescript
// ── F103：batch pre-fetch customer_core + ob_arreturndf_min_cap ──
const custoNos = [...new Set(pool.map((p) => p.custo_no).filter(Boolean) as string[])];
const applNos  = [...new Set(pool.map((p) => p.appl_no).filter(Boolean) as string[])];

// customer_core：raw SQL（AD-E06-1 不建 entity）
const ccRows: CustomerCoreRow[] = custoNos.length > 0
  ? await manager.query<CustomerCoreRow[]>(
      `SELECT source_customer_no, gender, date_of_birth, education_code,
              residential_zip, mailing_zip, company_zip,
              home_phone, contact_phone, mobile_phone
       FROM customer_core
       WHERE source_customer_no = ANY($1)`,
      [custoNos],
    )
  : [];
const ccMap = new Map<string, CustomerCoreRow>(
  ccRows.map((r) => [r.source_customer_no, r]),
);

// ob_arreturndf_min_cap：TypeORM repo 或 raw SQL（依 entity 存在與否）
const arRows: ArCapitalRow[] = applNos.length > 0
  ? await this.arreturndfRepo.find({
      where: { appl_no: In(applNos) },
      select: ['appl_no', 'add_un_capital'],
    })
  : [];
const arMap = new Map<string, ArCapitalRow>(
  arRows.map((r) => [r.appl_no, r]),
);
// ── end F103 pre-fetch ──

const scoredPool = pool.map((p) => {
  const cc    = p.custo_no ? (ccMap.get(p.custo_no) ?? null) : null;
  const arCap = p.appl_no  ? (arMap.get(p.appl_no)  ?? null) : null;
  const score = activeVer && activeVer.card_version !== null
    ? this.computeScore(p, list.card_type ?? '', activeVer.card_version,
                        activeColumns, allScores, cc, arCap)
    : null;
  // ... lvl / cardLevel / tierLevel 不變 ...
});
```

> `this.arreturndfRepo` 需注入（`@InjectRepository(ObArreturndfMinCap)`）；若 entity 尚未建立，改用 `manager.query` raw SQL（tdd 落地時確認 entity 存在）。

### 6.3 `computeScore` 簽章更新

```typescript
private computeScore(
  pool: ObPoolData,
  cardType: string,
  cardVersion: number,
  activeColumns: ObLevelcardColumn[],
  allScores: ObLevelcardScore[],
  cc: CustomerCoreRow | null,   // F103 新增
  arCap: ArCapitalRow | null,   // F103 新增
): number {
  let total = 0;
  for (const col of activeColumns) {
    if (!col.column_name) continue;
    const value = this.resolveColumnValue(pool, col.column_name, cc, arCap);
    // ... 區間型 / 類別型 計分邏輯不變 ...
  }
  return total;
}
```

### 6.4 `resolveColumnValue` 全面補齊

```typescript
private resolveColumnValue(
  pool: ObPoolData,
  columnName: string,
  cc: CustomerCoreRow | null,   // F103 新增
  arCap: ArCapitalRow | null,   // F103 新增
): string | number {
  switch (columnName) {
    // ── ob_pool_data 直接取（既有，保留）──
    case 'LIST_MONTH':
      return pool.month_cnt ?? 25;

    case 'PROJECT_TP':
      // BR-F103-03：spec_name '%專案%' → 'A'，否則 spec_tp
      return (pool.spec_name?.includes('專案'))
        ? 'A'
        : (pool.spec_tp ?? '01');

    case 'CAR_YEAR': {
      const yp = pool.year_produ ? parseInt(pool.year_produ, 10) : null;
      return (yp && !Number.isNaN(yp)) ? new Date().getFullYear() - yp : 0;
    }

    // ── COMMISSION 移除（BR-F103-05）──
    // case 'COMMISSION': ← 刪除

    // ── ADD_UN_CAPITAL（BR-F103-01 / OQ-2）──
    case 'ADD_UN_CAPITAL':
      return arCap?.add_un_capital ?? 0;

    // ── customer_core 欄位（BR-F103-06）──
    case 'CUS_SEX':
      return cc?.gender ?? '3';

    case 'AGE':
      // BR-F103-09（OQ-157-01）：AGE 統一演算法，對齊 PG EXTRACT(YEAR FROM age(date_of_birth))
      // PG age() = 精確到月（生日未到者不計當年）→ JS 須同語意。
      if (!cc?.date_of_birth) return 0;
      return calcAgeYears(cc.date_of_birth, new Date());

    case 'CAREA_NO1':
      return cc?.home_phone != null ? 1 : 0;

    case 'CAREA_NO2':
      return cc?.contact_phone != null ? 1 : 0;

    case 'CELLULAR':
      return cc?.mobile_phone != null ? 1 : 0;

    case 'EDUCAT_BACK':
      return cc?.education_code ?? '';

    case 'HPOST_NUM_NM':
      return cc?.residential_zip ?? '';

    case 'CPOST_NUM_NM':
      return cc?.mailing_zip ?? '';

    case 'CO_NUM_NM':
      return cc?.company_zip ?? '';

    case 'SALES_STS': {
      // AD-E07-10-L line 4089：CASE sales_sts_na WHEN 'AGENT' ... END
      const s = pool.sales_sts_na;
      if (s === 'AGENT') return 'AGENT';
      if (s === '經銷商') return 'UCD';
      return 'HFC';
    }

    case 'LOAN_RATE':
      return pool.loan_rate != null ? Number(pool.loan_rate) : 0;

    default:
      // 通用 fallback（BR-F103-04）：讀 pool 同名欄（lowercase key）
      // 對應 PG to_jsonb(o)->>lower(column_name)::numeric
      {
        const key = columnName.toLowerCase() as keyof ObPoolData;
        const raw = pool[key];
        if (raw == null) {
          // 幽靈欄位（BR-F103-08）
          this.logger.warn(
            `[Stage2] 幽靈欄位 column_name="${columnName}" 在 ob_pool_data 無對應欄，計 +0`,
          );
          return 0;
        }
        const num = Number(raw);
        return Number.isNaN(num) ? 0 : num;
      }
  }
}
```

### 6.5 AGE 統一演算法實作（BR-F103-09）

獨立為純函式（可置於同檔或 utils），供 `resolveColumnValue` 呼叫：

```typescript
/**
 * 計算整數年齡，語意等價 PostgreSQL EXTRACT(YEAR FROM age(date_of_birth))。
 * PG age() 精確到月：本年生日未到者，年齡 = 當前年 - 出生年 - 1。
 * 此 JS 實作須完全對齊，確保 JS↔SQL EQ（BR-F103-09 / OQ-157-01）。
 */
export function calcAgeYears(dateOfBirth: Date, now: Date): number {
  const birthYear  = dateOfBirth.getFullYear();
  const birthMonth = dateOfBirth.getMonth(); // 0-indexed
  const birthDay   = dateOfBirth.getDate();

  const nowYear  = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay   = now.getDate();

  let age = nowYear - birthYear;
  // 本年生日尚未到 → 減 1（對齊 PG age() 語意）
  if (nowMonth < birthMonth || (nowMonth === birthMonth && nowDay < birthDay)) {
    age -= 1;
  }
  return Math.max(0, age); // 邊界保護：不回負數
}
```

**關鍵語意**：`now` 參數必須為測試可注入的基準日（非 `new Date()` hardcode），以確保 EQ 測試中 JS 與 PG `CURRENT_DATE` 使用同一日期。

> **tdd 注意**：`resolveColumnValue` 呼叫 `calcAgeYears(cc.date_of_birth, new Date())` 時，EQ 測試須讓 PG 端也使用相同「今天」（透過在同一 ms 內執行兩者，或在 PG 測試中以固定日期 cast）。建議：EQ 測試中以 `AGE` column 場景額外驗證「未過生日 → JS age = PG age」與「已過生日 → JS age = PG age」兩個邊界。

---

## 7. Invariants

| Invariant ID | 描述 |
|-------------|------|
| **I-SCORE-COLSRC-01** | 計分引擎（PG + JS）所有 active 計分欄之取值來源**完全對齊 AD-E07-10-L**（architecture-spec.md line 4074–4091）；映射不得有無根據之自創來源。 |
| **I-SCORE-FALLBACK-01** | `resolveColumnSource` 之 `default` 分支**永遠不回 `undefined`**；未 hardcode 的 range 維度一律回通用 fallback `COALESCE((to_jsonb(o)->>lower(col))::numeric, 0)`；category 維度不走此 fallback（由 hardcode case 覆蓋）。 |
| **I-SCORE-EQ-01** | JS oracle（`computeScore`）與 PG 下推（`buildStage2ScoreExpr` 生成 SQL）對相同輸入（pool + cc + arCap）之 score 結果**完全相等**（EQ DoD）；差異容許誤差 = 0（整數分）。 |
| **I-SCORE-AR-JOIN-01** | PG 下推：有任一 active `ADD_UN_CAPITAL` 欄時，`needsArCapital=true`，executor 注入 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no`；無 active ADD_UN_CAPITAL 欄時，`needsArCapital=false`，不注入此 JOIN（避免無謂掃描）。 |
| **I-SCORE-PREFETCH-01** | JS 路徑每個 list 恰好執行兩次 batch 查詢（customer_core / ob_arreturndf_min_cap 各一次 IN clause）；不得 per-row lookup（N+1 禁止）。 |
| **I-SCORE-GHOST-01** | 幽靈欄位（`ob_pool_data` 不存在此 key 且非 AD-E07-10-L hardcode）→ 兩路徑皆靜默貢獻 +0 + `logger.warn`（含 column_name + card_type）；不拋例外、不阻擋月跑。 |
| **I-SCORE-AGE-01** | JS `calcAgeYears()` 之年齡語意與 PG `EXTRACT(YEAR FROM age(date_of_birth))` **完全一致**（精確到月，本年生日未到者不計當年）；EQ 測試覆蓋「剛好生日當天」/ 「生日前一天」/ 「生日後一天」三個邊界。 |
| **I-SCORE-COMMISSION-01** | `COMMISSION` 從兩路徑完全移除（`resolveColumnSource` switch + `resolveColumnValue` switch + `MAPPED_SCORING_COLUMNS` 集合）；若 active column 出現 COMMISSION（legacy dump 確認不會出現），走通用 fallback → +0。 |

---

## 8. 測試注意事項（給 test-designer / tdd）

### 8.1 PG 下推單元測試（`stage2to4-sql-builder.spec.ts`）

| 測試場景 | 驗證重點 |
|---------|---------|
| ADD_UN_CAPITAL active → | `needsArCapital=true`；生成 SQL 含 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no`；表達式 `COALESCE(ar.add_un_capital, 0)` |
| 無 ADD_UN_CAPITAL active → | `needsArCapital=false`；生成 SQL **不含** `ob_arreturndf_min_cap` |
| 通用 fallback：未 hardcode 的 pool 數值欄（如 `LOAN_AMOUNT`）active → | 生成 SQL 含 `COALESCE((to_jsonb(o)->>'loan_amount')::numeric, 0)` |
| PROJECT_TP active + spec_name 含 `'專案'` → | 表達式取 `'A'`（`CASE WHEN o.spec_name LIKE '%專案%' THEN 'A' ...`） |
| PROJECT_TP active + spec_name 不含 `'專案'` → | 表達式取 `COALESCE(o.spec_tp, '01')` |
| COMMISSION 不再出現 → | `resolveColumnSource('COMMISSION')` 回 fallback expr（非死碼 case），`MAPPED_SCORING_COLUMNS` 不含 COMMISSION |
| SALES_STS active → | 表達式含 `CASE o.sales_sts_na WHEN 'AGENT' ... END` |

### 8.2 JS oracle 單元測試（pipeline service spec）

| 測試場景 | 驗證重點 |
|---------|---------|
| cc=null → CUS_SEX | 回 `'3'`（缺值 default） |
| cc.gender='1' → CUS_SEX | 回 `'1'` |
| cc=null → AGE | 回 `0` |
| cc.date_of_birth=生日未到 → AGE | 回 `整數年齡`（對齊 PG age()，未過生日 −1 年） |
| cc.date_of_birth=生日當天 → AGE | 回 `整數年齡`（不 −1，已到） |
| cc.home_phone=null → CAREA_NO1 | 回 `0` |
| cc.home_phone='02-12345678' → CAREA_NO1 | 回 `1` |
| arCap=null → ADD_UN_CAPITAL | 回 `0` |
| arCap.add_un_capital=20 → ADD_UN_CAPITAL | 回 `20` |
| COMMISSION（若傳入）→ | 走 default 通用 fallback，回 `0`（pool 無 commission key 或 NaN）；logger.warn（幽靈欄位） |
| pool.spec_name='專案名稱' → PROJECT_TP | 回 `'A'` |
| pool.sales_sts_na='經銷商' → SALES_STS | 回 `'UCD'` |
| 通用 fallback：pool 有 `loan_amount` 欄 → 未 hardcode column | 回 `Number(pool.loan_amount)`（0 若 null） |

### 8.3 EQ DoD（PG 真庫，`stage2to4-sql-builder.spec.ts` EQ 群組）

以下場景**每個皆需** JS oracle score === PG 下推 score（逐列等價）：

1. H 卡案件：ADD_UN_CAPITAL > 0 + 全 customer_core 屬性有值
2. H 卡案件：ADD_UN_CAPITAL null（無 arreturndf 對應）
3. H 卡案件：cc=null（無 customer_core 對應，屬性全 default）
4. PROJECT_TP active + spec_name 含 `'專案'`
5. PROJECT_TP active + spec_name 不含 `'專案'`
6. SALES_STS active，sales_sts_na='AGENT' / '經銷商' / 其他
7. AGE：生日未到 vs 生日已過（BR-F103-09）
8. 通用 fallback：未 hardcode 的 range pool 欄

### 8.4 AGE 統一演算法邊界

AGE EQ 測試必須涵蓋以下三個精確邊界（BR-F103-09 / I-SCORE-AGE-01）：

```
today=2026-06-24
  生日=1990-06-23 → age=36（已過生日）
  生日=1990-06-24 → age=36（當天算已過）
  生日=1990-06-25 → age=35（尚未到生日，−1）
```

PG 端與 JS 端須在同一次 EQ 測試中以相同 `today` 基準驗證。

### 8.5 通用 fallback 邊界測試

| 輸入條件 | 預期 PG 行為 | 預期 JS 行為 |
|---------|------------|------------|
| `ob_pool_data` 有 `loan_amount=50000` 欄，active column `LOAN_AMOUNT`（非 hardcode） | `COALESCE((to_jsonb(o)->>'loan_amount')::numeric, 0) = 50000` | `Number(pool.loan_amount) = 50000` |
| `ob_pool_data` 無 `xyz_col` 欄，active column `XYZ_COL` | `COALESCE(NULL::numeric, 0) = 0` | `0` + logger.warn |
| active column `ABC_STR`，pool 值為文字 `'N/A'` | `'N/A'::numeric` 失敗 → `COALESCE(NULL, 0) = 0` | `Number.isNaN(Number('N/A')) → 0` |

### 8.6 202606 重跑驗收（US-158 AC-11 / AC-12）

**執行條件**：dev 環境，ETL 就緒（customer_core ~100% 覆蓋 + ob_arreturndf_min_cap ~100% 覆蓋）。

**驗收 SQL**：
```sql
SELECT card_level, tier_level, COUNT(*) AS cnt
FROM ob_monthly_run_result
WHERE run_id = '<202606 run_id>'
GROUP BY card_level, tier_level
ORDER BY card_level, tier_level;
```

**定性門檻（OQ-158-01，AC-11）**：
- `card_level` 出現至少 2 種不同值（不再 100% 為 `'D'`）
- `tier_level` 含至少部分 `'T1'` 或 `'T2'`（非 100% `'T3'`）

**異常後根因（AC-12）**：若 card_level 仍 ≥ 90% 為 D：
```sql
-- 量測 customer_core 屬性欄空值率
SELECT
  COUNT(*) AS pool_total,
  COUNT(cc.source_customer_no) AS cc_matched,
  SUM(CASE WHEN cc.date_of_birth IS NULL THEN 1 ELSE 0 END) AS age_null,
  SUM(CASE WHEN cc.gender IS NULL THEN 1 ELSE 0 END) AS sex_null
FROM ob_pool_data o
LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no
WHERE o.orgno || o.appl_no IN (
  SELECT orgno || appl_no FROM ob_monthly_run_result WHERE run_id = '<202606 run_id>'
);
```
根因屬「資料品質」時，記錄空值率於驗收文件，本 feature 引擎修正仍須通過 §8 稽核（引擎正確性與資料品質獨立判定）。

### 8.7 回歸與型別

- **`pnpm test` 全綠**（無退化，含 F101 / F102 50 筆測試）
- **`tsc --noEmit -p tsconfig.build.json` 零錯誤**（vitest 不做型別檢查，必跑，AC-13）

---

## 9. Migration

**本 feature 無 migration**。

- `ob_arreturndf_min_cap` PK（`appl_no`）與 `customer_core` unique index（`source_customer_no`）已於先前 ETL migration 建立。
- Stage 2 修正純為 TypeScript 邏輯，不新增/修改任何資料表。

---

## 10. 效能考量

- **PG 路徑**：新增 `LEFT JOIN ob_arreturndf_min_cap ar`（`ar.appl_no` PK index scan）；AD-E07-10-L line 4098 預估含 customer_core + arreturndf 雙 lookup，100K 案件 Stage 2 < 30 秒（dev 基準）。`needsArCapital=false` 時不注入 JOIN。
- **JS 路徑**：batch pre-fetch 每個 list 各兩次 IN clause 查詢（I-SCORE-PREFETCH-01）；pool 規模 < 10K 案件 / list，IN clause 無效能疑慮。
- **通用 fallback `to_jsonb(o)`**：每個 pool 列執行一次 JSONB cast；對大量幽靈欄位（數量極少，均為 +0）影響可忽略；正常情況 active 欄皆有 hardcode case，不走 fallback。

---

## 11. 改/建檔案清單

| 操作 | 路徑 | 變更摘要 |
|------|------|---------|
| 修改 | `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts` | `resolveColumnSource`：補 ADD_UN_CAPITAL case、移除 COMMISSION case、修正 PROJECT_TP（補 spec_name 衍生）、實作通用 fallback（default 不再 undefined）；`Stage2ScoreSql` interface 擴充 `needsArCapital`；`buildStage2ScoreExpr` 追蹤 `needsArCapital`；`MAPPED_SCORING_COLUMNS` 更新 |
| 修改 | `apps/api/src/modules/assignment/stage1/stage2to4-sql-executor.ts` | `runStage2and3Sql`：解構 `needsArCapital`，條件注入 `LEFT JOIN ob_arreturndf_min_cap ar` |
| 修改 | `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | 呼叫端加 batch pre-fetch（customer_core + arreturndf）；`computeScore` 簽章擴充 `cc` / `arCap` 參數；`resolveColumnValue` 全面補齊（含 AGE 統一演算法呼叫）；移除 COMMISSION case |
| 新增（或同檔） | `CustomerCoreRow` / `ArCapitalRow` interface 定義 | plain-object types，供 computeScore / resolveColumnValue 使用 |
| 新增（或同檔） | `calcAgeYears(dateOfBirth, now)` pure function | AGE 統一演算法，對齊 PG age() 語意（BR-F103-09） |
| **不動** | `docs/specs/architecture-spec.md` §AD-E07-10-L（line 4074–4091） | 稽核確認 AD 映射表本身正確，無需修正 |
| **不動** | 任何 migration 檔 | 本 feature 無新 migration |
| 新建 | `docs/specs/implementation-log/AD-E07-v3.5-f103-stage2-score-column-source-fix.md`（本檔） | 架構決策文件 |

---

## 12. 給 test-designer 的 Handoff 摘要

1. **EQ DoD 為硬性 DoD**（BR-F103-07）：`stage2to4-sql-builder.spec.ts` EQ 群組（PG 真庫）須覆蓋 §8.3 所有場景，全綠才上線。
2. **AGE 邊界**（BR-F103-09 / I-SCORE-AGE-01）：§8.4 三個精確邊界，PG 與 JS 使用同一 `today` 基準。
3. **通用 fallback**（BR-F103-04 / I-SCORE-FALLBACK-01）：§8.5 三個邊界（有值 / 無 key / 非數值文字），PG 與 JS 皆測。
4. **幽靈欄位**（BR-F103-08 / I-SCORE-GHOST-01）：PG 端 `to_jsonb(o)` 無 key → COALESCE 0；JS 端 pool key 不存在 → logger.warn + 0；**不拋例外**。
5. **202606 重跑驗收**（AC-11 / AC-12）：§8.6 定性門檻，異常時附 customer_core 空值率量測 SQL。
6. **回歸**：`pnpm test` 全綠 + `tsc --noEmit` 零錯誤（AC-13）。
7. **SQLite 測試**（OQ-3）：`computeScore` 單元測試直接傳入 `cc` / `arCap` fixture，無需建表。PG EQ 測試走真庫。
