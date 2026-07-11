---
ad-id: AD-E07-v3.6
title: F049 v2.0 Stage 0 試算頁業務化重設計（部門維度每日分派量矩陣架構）
feature-id: F049
source-stories: US-166 / US-167 / US-168 / US-169 / US-170
epic: E07
module: M01 名單定義
version: "1.0"
date: 2026-06-26
status: approved
author: system-architect
---

# AD-E07-v3.6：F049 v2.0 Stage 0 試算頁業務化重設計

## Agent Loading Guide

| Agent 角色 | 需載入章節 |
|-----------|-----------|
| TDD Developer | §3（OQ 全裁定）+ §4（端點拓樸 + DTO）+ §5（Query 策略）+ §6（Guard 接線 + Actor 傳遞）+ §7（不變量 I-RUN-EST-01）+ §8（SQLite/PG 移植性）|
| Test Designer | §3（OQ 裁定彙總）+ §7（不變量 / 邊緣案例）+ §9（驗證 pre-prod 清單）|
| UI/UX Designer | §4（Response DTO 形狀）+ §6（scope=null 友善訊息語意）|
| DevOps | §9（OQ-F049-05 production SQL 查核清單）|

---

## 1. 背景與問題定義

### 1.1 現況

F049 v1.x 試算頁以「選一筆名單 × 每日 ratio 件數表」為操作起點（技術視角）。業務部長 / 處長真正關心的是：「本月整體日均工作量合理嗎？哪個部門的電訪量太重？每位電訪員一天幾通打得完？」。

F049 v2.0（Part B, §14–§22）把試算頁重設計為**部門維度、每日、可行性導向**的業務視圖。核心新增：

| 層 | 名稱 | 輸入 | 產出 |
|---|---|---|---|
| L2 | 聚合層 | 全部 active 名單（或指定名單） | 名單集合 S |
| L3 | 部門投影層 | list_total × ration × dpm | dept_daily_count / org_total / gap |
| L4 | 範圍隔離層 | actor（處長/部長）| scope-filtered 部門列 |
| L5 | 可行性層 | dept_daily_count ÷ active_headcount | per_person_daily + 門檻警示 |

L0（千分位 ratio）與 L1（per-list dry-run COUNT）完全不動（I-RUN-EST-01）。

### 1.2 架構師 Open Questions（OQ-F049-01..07）

本文件解決全部 7 個 OQ。

---

## 2. 既有架構基礎（不分叉）

### 2.1 `computeWorkingDayRatios`（pure function，`stage0-estimate.service.ts`）

- 輸入：`ob_calendar` rows + `calendarSource`
- 輸出：`[{ casedt, ratioPerMille }]`（Σ 工作日 = 1000）
- 現已被 Stage 4 ASSIGNDAY（`distributeStage3to4`）共用（AD-E07-29 §3.4 / I-RUN-EST-01）
- **不得修改此函式**。新增 L3 投影層僅呼叫其輸出值

### 2.2 F088 物化快取（`ob_list_definition.stage0_estimate_count`）

- 於 `approveToReady()` best-effort hook 寫入（AD-E07-20）
- 語意：完整 Stage 1 dry-run COUNT（F092 升級後 = 月名單分派 Stage 1 案件數）
- Nullable：未 approve / 計算失敗時為 NULL → 觸發 fallback 即時計算

### 2.3 `SectionChiefScopeService.getScopeDeptCode(userId)`

- `users.email ↔ ob_emphire.email`（trimmed + case-insensitive）+ `resign_date IS NULL` + `jfun_nm='處長'` → `dept_code`
- 已被 `listLists` 使用（F077 v1.4）；處長 scope filter 模式為 `EXISTS (SELECT 1 FROM ob_dept_pct p WHERE p.list_no=l.list_no AND TRIM(p.obdeptid)=:scope)`

---

## 3. 架構師 OQ 裁定彙總

### OQ-F049-01　端點拓樸（RESOLVED）

**裁定**：新增獨立唯讀端點 `GET /api/v1/assignment/stage0/dept-estimate`，一次回傳整月矩陣（§4 DTO shape）。

**理由**：
- 既有 `GET /api/v1/assignment/stage0/daily-estimate` 為 total-agnostic 純 ratio/calendar API（Design A），職責明確。混入 `list_total` × `ob_dept_pct` 聚合邏輯將違反 I-RUN-EST-01 分工原則。
- 部門矩陣一次回整月（最多 31 天 × N 部門）資料量小，無需 per-day 分頁。

**Query Parameters**：

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `ym` | string（YYYYMM）| 否 | `currentWorkYm` | 估算月份 |
| `calendarSource` | `weekday` \| `weekday-only` \| `all` | 否 | `weekday` | 工作日來源（沿用 v1.3 語意）|
| `startDate` | string（YYYY-MM-DD）| 否 | ym 整月第一天 | 估算範圍起日 |
| `endDate` | string（YYYY-MM-DD）| 否 | ym 整月最後一天 | 估算範圍訖日 |
| `listNo` | string | 否 | absent | 缺少時 = 全名單彙總模式；指定時 = 單一名單鑽探模式 |

---

### OQ-F049-02　Query 策略與逾時防護（RESOLVED）

**裁定**：以下三階段組合。

#### 階段 A：`list_total[L]` 取得策略

| 優先 | 來源 | 說明 |
|---|---|---|
| Primary（O(1)）| `ob_list_definition.stage0_estimate_count`（F088 物化）| 最快；reflect F092 語意（dry-run ≡ run）|
| Fallback（O(N×10s) 最差）| `Stage0EstimateService.estimateListCount(listNo)` live 即時 | `stage0_estimate_count IS NULL` 時觸發 |

Fallback 策略細節：
- 多份名單並行 `Promise.all`（非逐份串行），整體 timeout 以環境變數 `STAGE0_DEPT_ESTIMATE_TIMEOUT_MS`（預設 30000 ms）控制
- 某份名單 fallback 逾時 → 從加總中排除該名單，寫入 `warnings[]` 碼 `STAGE0_LIST_ESTIMATE_PARTIAL`（`{ code, listNo, message }`），繼續回傳其他名單結果
- 不因單份名單逾時阻擋整個 dept-estimate response

#### 階段 B：部門比例批次取得

```sql
-- 一次查詢所有 active 名單的 ob_dept_pct
SELECT list_no, TRIM(obdeptid) AS dept_code, obdeptid, obdeptnm, ratio
FROM ob_dept_pct
WHERE list_no IN (:listNos)
```

#### 階段 C：在職人數批次取得

```sql
-- 一次查詢所有相關部門的在職人數
SELECT TRIM(dept_code) AS dept_code, COUNT(*) AS headcount
FROM ob_emphire
WHERE resign_date IS NULL
GROUP BY TRIM(dept_code)
```

#### 階段 D：In-memory 部門投影合成

資料量：最多 31 天 × 8 部門 = 248 cells，in-memory 計算足夠。不走 SQL 下推（原因：無需 JOIN 跨表聚合運算，JS 算術已足夠且可測試性佳）。

公式（對應 spec §16.1）：
```
dept_real[d][D] = Σ_{L ∈ S} ( list_total[L] × ration[L][D] / 100 × dpm[d] / 1000 )
org_real[d]     = Σ_{L ∈ S} ( list_total[L] × dpm[d] / 1000 )
gap_real[d]     = org_real[d] − Σ_D dept_real[d][D]
```

捨入：最終值以 `Math.round()` 一次套用（沿用 §16.3 裁定，不做中間捨入）。

---

### OQ-F049-03　每人每日上限門檻儲存（RESOLVED）

**裁定**：環境變數 `STAGE0_MAX_CASES_PER_PERSON_PER_DAY`，預設 `null`（未設定）→ 不標紅（AC-FEAS-4 降級）。

**實作**：
```typescript
private resolvePerPersonThreshold(): number | null {
  const raw = process.env.STAGE0_MAX_CASES_PER_PERSON_PER_DAY;
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
```

**理由**：與既有 `STAGE0_POOL_WARN_THRESHOLD` 模式一致（同一 service 已有此 pattern）；MVP 不需要 per-user 設定，未來升級至 DB config 不影響 AC。

---

### OQ-F049-04　Guard 接線 + Actor 傳遞（RESOLVED）

#### Guard 變更矩陣

| 端點 | 現況 | 變更後 | section_chief 可存取 |
|---|---|---|---|
| `GET stage0/dept-estimate` | N/A（新） | 無 `@RequireDirector()`，繼承 class `DirectorOrSectionChief` | ✅（唯讀）|
| `GET list-definitions/:listNo/estimate` | `@RequireDirector()` | 移除 `@RequireDirector()` | ✅（BR-12，名單層總量，無部門分解）|
| `GET stage0/daily-estimate` | `@RequireDirector()` | **不變**（director only，v1.x 純 ratio 視圖）| ❌ |

> **class 級 `@UseGuards`**：現行 `Stage0EstimateController` 的 `@UseGuards(AuthGuard, DirectorOrSectionChiefGuard, DirectorGuard)` + `@RequireDirectorOrSectionChief()` 不改（沿用 B2 標準模式基底）。

#### Actor 傳遞方式

`dept-estimate` controller method 以 NestJS `@Request()` 注入 `req.user`，傳入 service：

```typescript
// Controller（新 method，不寫生產碼，僅架構契約）
@Get('stage0/dept-estimate')
async deptEstimate(
  @Request() req: { user: ActorUser },
  @Query('ym') ym?: string,
  @Query('calendarSource') calendarSource?: string,
  @Query('startDate') startDate?: string,
  @Query('endDate') endDate?: string,
  @Query('listNo') listNo?: string,
) {
  const effectiveYm = ym ?? this.systemService.getCurrentWorkYm();
  return this.service.computeDeptEstimate(effectiveYm, {
    calendarSource, startDate, endDate, listNo,
    actor: req.user,
  });
}
```

`ActorUser` 型別已由 `SectionChiefScopeService` 匯出（`{ userId, role, businessRole? }`）。

#### Service scope filter 邏輯（鏡像 `listLists`）

```
isSectionChief = actor.businessRole === 'section_chief' && actor.role !== 'admin'

if isSectionChief:
  scope = await scopeService.getScopeDeptCode(actor.userId)
  if scope === null:
    → 回 200 空結果（empty departments / empty days[].deptCells） + warnings: [{ code: 'SCOPE_UNRESOLVED' }]
    → logger.warn('[Stage0Estimate] section_chief scope applied: null → empty result')
  else:
    → filter ob_dept_pct 結果，只保留 TRIM(obdeptid) === scope 的部門列
    → 回應不含任何其他部門（非遮罩，資料根本不存在）
    → logger.log('[Stage0Estimate] section_chief scope applied dept_code=' + scope)
else (director / admin):
  → bypass，回傳全部門
```

---

### OQ-F049-05　OQ-167-03 Production ETL 後代號空間驗證（RESOLVED 為 Pre-prod 阻擋清單）

**裁定**：dev DB 已 100% 對齊（spec §20.1）。Production ETL 後由系統管理員執行以下 SQL 查核，結果須全為 0 方可上線：

```sql
-- 查核 1：ob_dept_pct.obdeptid 是否有孤兒碼（期望 0 列）
SELECT COUNT(*) AS orphan_obdeptid_count
FROM (SELECT DISTINCT TRIM(obdeptid) AS d FROM ob_dept_pct) dp
WHERE NOT EXISTS (
  SELECT 1 FROM ob_emphire e
  WHERE TRIM(e.dept_code) = dp.d AND e.resign_date IS NULL
);

-- 查核 2：被指派比例的部門在職人數是否有恆 0 的（期望 0 列）
SELECT TRIM(obdeptid) AS dept_code, COUNT(DISTINCT list_no) AS list_count
FROM ob_dept_pct
GROUP BY TRIM(obdeptid)
HAVING NOT EXISTS (
  SELECT 1 FROM ob_emphire
  WHERE TRIM(dept_code) = TRIM(ob_dept_pct.obdeptid)
  AND resign_date IS NULL
);
```

若出現孤兒碼：評估是否需要 `dept_code ↔ obdeptid` mapping 層（對應 spec §20.2 / US-169 OQ-169-02）。

**這是 build blocker 嗎**？否。Production 驗證為上線前置條件，不阻擋 dev 實作與測試。

---

### OQ-F049-06　人均分母口徑（RESOLVED）

**裁定**：全部在職員工（`COUNT(ob_emphire WHERE TRIM(dept_code)=D AND resign_date IS NULL)`），不過濾 `jfun_nm`。

**依據**：PO 口頭確認（2026-06-26）+ US-169 AC-1 字面定義。非電訪職（處長/課長/襄理）納入分母是 PO 業務決策，非技術議題。

---

### OQ-F049-07　警告通道（RESOLVED）

**裁定**：response `warnings[]` 結構性欄位。每筆警告物件：

```typescript
interface Stage0DeptWarning {
  code: 'DEPT_HEADCOUNT_ZERO' | 'SCOPE_UNRESOLVED' | 'STAGE0_LIST_ESTIMATE_PARTIAL';
  deptCode?: string;   // DEPT_HEADCOUNT_ZERO 時填寫
  listNo?: string;     // STAGE0_LIST_ESTIMATE_PARTIAL 時填寫
  message?: string;    // 人類可讀提示（非翻譯 key）
}
```

- **不**擴充 `assignment_audit_log.action` enum（無 migration）
- **不**新增錯誤碼（沿用既有 `STAGE0_ESTIMATE_TIMEOUT`）
- 門檻超過（`overThreshold`）為前端顯示態，不寫入後端 `warnings[]`
- 與 F101 / F102 `assignment_run.skipped_cases.warnings[]` 慣例一致（無強制 audit）

---

## 4. Response DTO 設計（正式契約）

### 4.1 `GET /api/v1/assignment/stage0/dept-estimate` — 200 OK

```jsonc
{
  "ym": "202606",
  "mode": "aggregated",           // "aggregated" | "single-list"
  "listNo": null,                  // single-list 模式時為選定 list_no，aggregated 時 null
  "calendarSource": "weekday",
  "startDate": "2026-06-01",
  "endDate": "2026-06-30",
  "scope": {                       // 處長為 { role: "section_chief", deptCode: "XVE1", scoped: true }
    "role": "director",            // director | section_chief | admin
    "deptCode": null,              // 處長時非 null；部長/admin 時 null
    "scoped": false                // true = 已套用 dept scope filter
  },
  "departments": [                 // 本次 response 涵蓋的部門（處長僅含轄區）
    { "deptCode": "XVE1", "deptName": "北區電銷1", "activeHeadcount": 27 }
  ],
  "days": [
    {
      "date": "2026-06-03",
      "weekday": "三",
      "isWorkday": true,
      "orgTotal": 1234,            // 全名單總量（不依賴部門比例，必正確）；休息日 = 0
      "deptAssignedTotal": 1100,   // Σ 已設定比例部門件數；休息日 = 0
      "gap": 134,                  // org_total − deptAssignedTotal（恆 ≥ 0）；休息日 = 0
      "deptCells": [               // 已設定比例的部門列，ordered by deptCode ASC
        {
          "deptCode": "XVE1",
          "cases": 480,            // Math.round(dept_real[d][D])；休息日 = 0
          "perPerson": 18,         // Math.round(cases / activeHeadcount)；headcount=0 → null；休息日 → null
          "overThreshold": true    // cases/activeHeadcount > threshold；threshold=null → false
        }
      ]
    },
    {
      "date": "2026-06-08",
      "weekday": "日",
      "isWorkday": false,
      "orgTotal": 0, "deptAssignedTotal": 0, "gap": 0,
      "deptCells": []              // 休息日：空陣列，不渲染部門列
    }
  ],
  "threshold": 15,                 // 每人每日上限（env var 取得）；null = 未設定
  "warnings": [                    // 結構性警告（非 HTTP 錯誤碼）
    { "code": "DEPT_HEADCOUNT_ZERO", "deptCode": "AI000", "message": "AI000 在職人數為 0，請確認 ob_emphire 資料是否已同步" }
  ],
  "poolCount": 50000,
  "poolWarning": null              // "POOL_COUNT_LOW" | null（沿用 v1.x AC-3）
}
```

> **處長 scope=null（AC-SCOPE-5）**：HTTP 200，`departments: []`，`days[].deptCells: []`，`warnings: [{ code: "SCOPE_UNRESOLVED", message: "..." }]`，不回 403、不 500。

### 4.2 `days[].deptCells` 排序

`deptCells` 陣列依 `deptCode ASC` 排序（確定性，利於測試斷言 / diff 比對）。`days[]` 陣列依 `date ASC` 排序。

### 4.3 處長模式（AC-SCOPE-2）

- `scope.scoped = true`，`scope.deptCode = "XVE1"`
- `departments` 只含 `deptCode = "XVE1"` 一個元素
- `days[].deptCells` 只含 `deptCode = "XVE1"`（不含其他部門）
- `days[].orgTotal` / `deptAssignedTotal` / `gap` **不呈現**（或設計為 null）——處長沒有全部門合計語意（BR-13）
  - **具體決定**：處長模式下 `orgTotal = null`，`deptAssignedTotal = null`，`gap = null`；前端不渲染合計列

---

## 5. Service 新增方法簽章

```typescript
// apps/api/src/modules/assignment-list/stage0-estimate.service.ts
// （架構契約，不寫生產碼）

import type { ActorUser } from '@/modules/assignment/services/section-chief-scope.service';

interface ComputeDeptEstimateOptions {
  calendarSource?: CalendarSource;
  startDate?: string;
  endDate?: string;
  listNo?: string;  // absent = aggregated
  actor?: ActorUser | null;
}

interface Stage0DeptEstimateResult {
  // 同 §4.1 DTO
}

class Stage0EstimateService {
  // 新增（F049 v2.0 Part B）
  async computeDeptEstimate(
    ym: string,
    opts: ComputeDeptEstimateOptions,
  ): Promise<Stage0DeptEstimateResult> { ... }
}
```

`Stage0EstimateService` 需新增注入：
- `@InjectRepository(ObDeptPct) private readonly deptPctRepo: Repository<ObDeptPct>`
- `@InjectRepository(ObEmphire) private readonly emphireRepo: Repository<ObEmphire>`
- `private readonly scopeService: SectionChiefScopeService`（透過 module import wiring）

> **注意**：`ObEmphire` 已被 `AssignmentListModule` 的其他 service 注入，無重複 import 問題。`SectionChiefScopeService` 由 `AssignmentRunModule`（或 `AssignmentModule`）export，需在 `AssignmentListModule` 的 imports 中加入。實作者確認注入鏈不形成循環依賴（AD-E07-20 §20.4 模式可參考）。

---

## 6. 不變量（Invariants）

### I-RUN-EST-01（繼承 AD-E07-28/29，擴展至 L3 投影層）

> `computeWorkingDayRatios()` 是 Stage 0 試算千分位 ratio 計算的**唯一來源**，同時被：
> - Stage 4 ASSIGNDAY 分配（`distributeStage3to4`）
> - Stage 0 每日 ratio API（`calculateDailyEstimate`）
> - **本次新增**：`computeDeptEstimate` 部門投影（via `computeWorkingDayRatios` output）
>
> 三個消費者不得各自重寫 ratio 邏輯，一律呼叫此函式輸出。

**Part B 新增約束**：
- `list_total[L]` 來源必須與月名單分派 Stage 1 同源（F088 物化 = F092 dry-run COUNT，AD-E07-23）
- `ration[L][D]` 來源必須是 `ob_dept_pct`（per-list 百分比），與 F101 Stage 3 部門分派一致（BR-F049-8）

### I-DEPT-SCOPE-01（新增）

> 處長 scope filter 在 service 層強制套用，前端遮罩僅為 UX。任何 bypass（直接 API 呼叫、修改 query param）仍只能看到自己轄區的部門列。

### I-DEPT-ORDER-01（新增）

> `deptCells` 陣列依 `deptCode ASC` 確定性排序。`days` 陣列依 `date ASC` 排序。此為跨測試與 diff 比對的穩定不變式。

---

## 7. 邊緣案例與預期行為

| 案例 | 預期行為 |
|---|---|
| 全部名單的 `stage0_estimate_count IS NULL` | 並行 fallback 呼叫 `estimateListCount`，整體 30s timeout |
| 某份名單 fallback 逾時 | 從 Σ 排除，`warnings[]` 加 `STAGE0_LIST_ESTIMATE_PARTIAL`，其他名單正常 |
| 當月 0 筆 active 名單 | `departments: []`，`days[].deptCells: []`，`mode: "aggregated"`，無 warnings |
| 名單全無 `ob_dept_pct` 比例 | `deptCells: []`，`gap = org_total`（全額缺口），缺口橘色標示 |
| 名單比例 Σ < 100% | `gap = org_total - deptAssignedTotal > 0`，標示缺口，不自動補差 |
| 休息日（`dpm[d] = 0`） | `orgTotal = 0`，`deptAssignedTotal = 0`，`gap = 0`，`deptCells: []` |
| 某部門在職人數 = 0 | `cases` 正常顯示，`perPerson = null`，`warnings[]` 加 `DEPT_HEADCOUNT_ZERO { deptCode }` |
| 門檻未設定（`threshold = null`） | 所有 `overThreshold = false`，不標紅 |
| 處長 scope = null | HTTP 200，`departments: []`，`days[].deptCells: []`，`warnings: [SCOPE_UNRESOLVED]` |
| single-list 模式，`listNo` 的 `stage0_estimate_count IS NULL` | fallback 單份即時計算，10s timeout → `STAGE0_ESTIMATE_TIMEOUT` |

---

## 8. SQLite（測試）/ PostgreSQL（生產）移植性

| 操作 | 決策 | 理由 |
|---|---|---|
| Ratio 計算 | JS `Math.floor` / `Math.round` / `%`（`computeWorkingDayRatios`，既有）| 不走 SQL，無 CAST 問題 |
| 部門投影計算 | JS in-memory（`computeDeptEstimate`，§5）| 不走 SQL，可測試性佳 |
| `TRIM(dept_code)` | TypeORM QueryBuilder `.where('TRIM(e.dept_code) = :d', { d })` 或 JS `.trim()`（headcount 查詢可全取再 map）| 兩資料庫均支援 `TRIM()`；headcount 全取再 map 在 JS 做也可避免 SQL 相容問題 |
| `COUNT(*)` headcount | `SELECT TRIM(dept_code), COUNT(*) FROM ob_emphire WHERE resign_date IS NULL GROUP BY TRIM(dept_code)` | 語法在 SQLite / PG 均相容 |
| `ob_list_definition.stage0_estimate_count` | TypeORM `find()` 讀整數欄位 | nullable int，兩資料庫一致 |
| `ob_dept_pct` IN 查詢 | TypeORM `In([...])` | 相容 |
| `dpm[d]` from `computeWorkingDayRatios` | 純 JS，`ob_calendar` rows 全取後 TS 端判定 | 已有 SQLite/PG 雙模式測試（stage0-estimate.service.spec.ts） |

> **TRIM 注意事項（沿用 AD-E07-23 移植性規範）**：`ob_emphire.dept_code` 與 `ob_dept_pct.obdeptid` 兩欄在資料庫中可能有尾端空白（varchar 欄不 NOT NULL TRIM）。headcount 查詢的 `GROUP BY TRIM(dept_code)` 與 scope filter 的 `TRIM(p.obdeptid) = :scope` 皆須保持 TRIM，以確保比對一致。

---

## 9. Production 上線前置條件（非 build blocker）

### OQ-F049-05 SQL 查核（須由系統管理員於 production ETL 後執行）

```sql
-- 查核 1：孤兒 obdeptid（期望 = 0）
SELECT COUNT(*) AS orphan_count
FROM (SELECT DISTINCT TRIM(obdeptid) AS d FROM ob_dept_pct) dp
WHERE NOT EXISTS (
  SELECT 1 FROM ob_emphire e
  WHERE TRIM(e.dept_code) = dp.d AND e.resign_date IS NULL
);

-- 查核 2：比例設定部門在職人數恆 0（期望 0 列）
WITH assigned_depts AS (
  SELECT DISTINCT TRIM(obdeptid) AS dept_code FROM ob_dept_pct
)
SELECT ad.dept_code
FROM assigned_depts ad
WHERE NOT EXISTS (
  SELECT 1 FROM ob_emphire e
  WHERE TRIM(e.dept_code) = ad.dept_code AND e.resign_date IS NULL
);
```

若查核 1 回傳 > 0 → 評估 `dept_code ↔ obdeptid` mapping 層（US-169 OQ-169-02，另議）。

---

## 10. 與既有 AD 的關係

| AD | 關係 |
|---|---|
| AD-E07-8（千分位 ratio）| **擴展消費者**：`computeDeptEstimate` 呼叫 `computeWorkingDayRatios()` output，不改 AD-E07-8 定義 |
| AD-E07-20（F088 物化快取）| **複用**：`stage0_estimate_count` 為 `list_total[L]` primary source |
| AD-E07-23（Stage 1 dry-run）| **語意對齊**：F088 物化 = F092 dry-run COUNT，fallback 呼叫同一 `estimateListCount()` |
| AD-E07-27（SystemService.getCurrentWorkYm）| **複用**：`ym` 預設值取自 `SystemService.getCurrentWorkYm()`（同 `dailyEstimate`）|
| AD-E07-28 I-RUN-EST-01 | **延伸**：Part B 新增第三個消費者，不分叉底層 |
| AD-E07-29（I-RUN-EST-01 ASSIGNDAY 層）| **相容**：`ob_dept_pct` per-list 比例語意與 Stage 3 ration 一致（BR-F049-8）|

---

## 11. Migration 需求

**無新 migration**。本 AD 涉及的全部資料來源（`ob_list_definition.stage0_estimate_count`、`ob_dept_pct`、`ob_emphire`）均已存在。`Stage0EstimateController` / `Stage0EstimateService` 為既有服務的擴充，不新增表或欄位。
