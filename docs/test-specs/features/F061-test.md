---
type: test-design-feature
feature_id: F061
feature_name: 月名單分派計分執行（AssignmentRunPipeline）
priority: P0-MVP
related_spec: /docs/specs/features/F061-assignment-run-pipeline.md
last_updated: 2026-05-21
spec_version: "1.4"
covers_new_in_v1_4:
  - US-132
  - AC-Banner-Entry
  - AC-Banner-1
  - AC-Banner-2
---

# F061: 月名單分派計分執行 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F061-assignment-run-pipeline.md` + `error-handling.md#assignment-scoring-errors` + `data-model.md#e07-data-model` |
| QA / Tester | 本文件 + `test-levels.md` + `risks-and-gaps.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | Unit（ScoringIntegrityCheckService 解耦）、E2E（Supertest + SQLite in-memory） |
| fn_calc_tier_level 驗證 | 僅在 PostgreSQL 環境執行（fn-calc-tier-level.spec.ts）；SQLite E2E 用簡化版 Stage 2 |
| Pre-check 解耦驗證 | ScoringIntegrityCheckService 以 spy/mock 驗證呼叫次數與傳入參數 |
| RANGE try-cast 驗證 | TC-13a/b/c/d 四組案例，覆蓋 numeric / VARCHAR / 零填充三種路徑 |
| warning_summary 儲存 | JSONB report_payload.warningSummary 子鍵（非新 DB 欄位，決策 5.5） |

---

## Acceptance Test Design

### AC-1：月名單分派觸發稽核前置檢查通過後執行計分

| 項目 | 內容 |
|------|------|
| Given | 所有維度均有 match_type；score rows > 0；無月名單分派鎖；DirectorToken |
| When | POST /api/v1/assignment/runs/run { projectWorkym: '202607', cardType: 'H' } |
| Then | HTTP 202 Accepted；polling run status → 'completed'；reportPayload.warningSummary.issueCount=0 |

### AC-2：稽核失敗阻斷月名單分派

| 項目 | 內容 |
|------|------|
| Given | ob_levelcard_column 有一筆 match_type=null |
| When | POST /runs/run |
| Then | run.status='failed'；reportPayload.warningSummary 或 errorDetail 含 MISSING_MATCH_TYPE issue |

---

## Test Scenarios

### TS-F061-PRE 系列：Pre-check（Unit）

| ID | 場景 | 測試類型 | 規格檔 |
|----|------|---------|--------|
| TS-F061-PRE-001 | 稽核通過 → pipeline 繼續執行，checkIntegrity 被呼叫一次 | Unit | `assignment-run-precheck-v13.service.spec.ts` |
| TS-F061-PRE-002 | 稽核失敗 → run status=failed，pipeline 中止 | Unit | 同上 |
| TS-F061-PRE-003 | 月名單分派鎖存在 → 不觸發稽核，409 ConflictException | Unit | 同上 |
| TS-F061-PRE-004 | checkIntegrity spy：呼叫次數=1，傳入正確 cardType/cardVersion | Unit | 同上 |
| TS-F061-PRE-005 | 稽核失敗 → audit_log action=RUN，after_value.status=failed | Unit | 同上 |
| TS-F061-PRE-006 | precheck 通過 → run status pending→running（非 failed） | Unit | 同上 |

### TS-F061-INT 系列：ScoringIntegrityCheckService（Unit）

| ID | 場景 | 測試類型 | 規格檔 |
|----|------|---------|--------|
| TS-F061-INT-001 | 所有維度有 match_type → ok=true, issues=[] | Unit | `scoring-integrity-check.service.spec.ts` |
| TS-F061-INT-002 | 有維度 match_type=null → ok=false, MISSING_MATCH_TYPE | Unit | 同上 |
| TS-F061-INT-003 | 有維度 score rows=0 → 警告 EMPTY_SCORE_RANGE | Unit | 同上 |
| TS-F061-INT-004 | COMPOSITE 無 level1=null 基線 → 警告 COMPOSITE_MISSING_BASELINE | Unit | 同上 |
| TS-F061-INT-005 | checkIntegrity 不觸發 fn_calc_tier_level（解耦驗證） | Unit | 同上 |
| TS-F061-INT-006 | ok=false 時 issues 非空（供 caller 設定 run=failed） | Unit | 同上 |
| TS-F061-INT-007 | warning_summary 寫入 report_payload.warningSummary JSONB 子鍵 | Unit | 同上 |

### TS-F061-013：RANGE try-cast 三類案例（Integration/PostgreSQL）

| ID | 場景 | 測試類型 | 規格檔 |
|----|------|---------|--------|
| TS-F061-013a | numeric BETWEEN：level2_s=5, level2_e=99, value=9 → HIT（score+20） | Integration PG | `fn-calc-tier-level.spec.ts` |
| TS-F061-013b | VARCHAR BETWEEN fallback：level2_s=A, level2_e=Z, value=M → HIT（score+15） | Integration PG | `fn-calc-tier-level.spec.ts` |
| TS-F061-013c | 零填充混合：level2_s=01, level2_e=23, value=15 → HIT（兩種策略均過） | Integration PG | `fn-calc-tier-level.spec.ts` |
| TS-F061-013d | numeric 邊界外：value=4 < level2_s=5 → MISS | Integration PG | `fn-calc-tier-level.spec.ts` |

**設計意圖（決策 5.3）：**
- TC-13a 設計可抓字典序誤用 bug（'9' > '10' 字典序但 9 < 10 數值）
- TC-13b 驗證非數值欄位自動 fallback VARCHAR BETWEEN
- TC-13c 驗證零填充欄位兩種策略皆相容

### TS-F061-E2E 系列：Composite E2E

| ID | 場景 | 測試類型 | 規格檔 |
|----|------|---------|--------|
| TS-F061-E2E-001 | 稽核通過 → POST /runs/run 202，polling completed | E2E | `f054-f061-composite.e2e.spec.ts` |
| TS-F061-E2E-002 | 稽核失敗 → run status=failed，errorDetail 含 MISSING_MATCH_TYPE | E2E | 同上 |
| TS-F061-E2E-003 | 月名單分派鎖 → 409 SCORING_VERSION_LOCKED | E2E | 同上 |
| TS-F061-E2E-004 | 月名單分派完成 → reportPayload.warningSummary.issueCount=0 | E2E | 同上 |
| TS-F061-E2E-005 | 月名單分派完成有警告 → warningSummary.issueCount>0，status=completed | E2E | 同上 |
| TS-F061-E2E-006 | audit_log action=RUN 含 run_id 與 card_type | E2E | 同上 |
| TS-F061-E2E-007 | 有規則違反 → audit_log 含 rule_violated 與 violated_row_count | E2E | 同上 |

---

## Fixture

參見 `/apps/api/test/fixtures/scoring-match-type-v13.sql`：
- **A 類（PROJECT_TP COMPOSITE）**：3 筆（level1=NULL / A / B）
- **B 類（REGION CATEGORY）**：3 筆（N / S / E）
- **C 類（RANGE try-cast）**：3 筆（數值 / 字串 / 零填充）+ 對應 ob_levelcard_column

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---------|------------|------|
| TS-F061-INT / PRE（Unit） | 高 | vi.fn() mock；無外部依賴 |
| TS-F061-013（Integration PG） | 中 | 需 Docker PostgreSQL；connectFailed 條件跳過 |
| TS-F061-E2E（Composite） | 高（框架），中（body 待實作） | Supertest + SQLite；fn_calc_tier_level 以簡化版替代 |
| TS-F061-CTA-001~003（v1.4 CTA Banner） | 高 | RTL + MSW；純前端渲染邏輯 |

---

## v1.4 補強：Ready 欄頂 CTA Banner（US-132 / GAP-G3）

> **spec 版本**：F061 v1.4（2026-05-21）
> **新增背景**：v1.4 將月名單分派執行入口從 F048 Toolbar 移至 Kanban 主頁 Ready 欄頂 CTA Banner（US-132 GAP-G3）。本節新增 3 個前端 Component 場景，覆蓋 CTA Banner 渲染條件與月名單分派鎖中 disabled 行為。
> **cross-reference**：CTA Banner secondary「試算」按鈕場景見 F049-test.md TS-F049-CTA-001~005；本節僅覆蓋主按鈕（月名單分派觸發）行為。

### TS-F061-CTA-001：stageCounts.ready ≥1 且非歷史月份、非月名單分派鎖 → CTA Banner 渲染，主按鈕可點擊

- **關聯需求**：F061 v1.4 §9 AC-Banner-Entry / US-132 AC-1
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub `GET /api/v1/assignment/lists?ym=202605` → `stageCounts: { ..., ready: 3 }`
  - 非歷史月份（`isHistorical: false`）；無月名單分派鎖（`assignment_run.status='idle'` 或無 running 紀錄）
- **步驟**：
  1. render `<ListKanbanPage />`（含 Ready 欄頂 CTA Banner 元件）
  2. 等待渲染完成
  3. 驗證 CTA Banner 主按鈕
- **預期結果**：
  - Ready 欄頂 CTA Banner 存在（`data-testid="ready-cta-banner"` 或對應 selector）
  - 主按鈕（觸發月名單分派，如「執行月名單分派」）存在且 enabled（`not.toBeDisabled()`）
  - 主按鈕點擊後觸發月名單分派 API 請求（MSW 確認收到 `POST /api/v1/assignment/runs/run`）

---

### TS-F061-CTA-002：stageCounts.ready = 0 → CTA Banner DOM 完全不存在（非 display:none）

- **關聯需求**：F061 v1.4 §9 AC-Banner-2 / US-132 AC-2
- **測試類型**：Negative / Component（RTL）
- **前置條件**：MSW stub → `stageCounts: { ..., ready: 0 }`；`lists` 無 `stage='ready'` 名單
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 驗證 Ready 欄頂
- **預期結果**：
  - CTA Banner DOM **完全不存在**（`document.querySelector('[data-testid="ready-cta-banner"]') === null`）
  - 不可僅為 `display: none`（DOM 不存在才符合規範）

---

### TS-F061-CTA-003：月名單分派執行中 → CTA Banner 改 disabled 樣式；主按鈕 disabled

- **關聯需求**：F061 v1.4 §9（月名單分派鎖中 CTA Banner disabled）/ F048 v2.0 AC-4 / F077 v1.3 BR-7 C-2
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub `stageCounts.ready = 2`（Banner 應渲染）
  - MSW stub assignment_run → `{ status: 'running' }`（月名單分派執行中）
- **步驟**：
  1. render `<ListKanbanPage />` 呈現月名單分派執行中狀態
  2. 驗證 CTA Banner 狀態
- **預期結果**：
  - CTA Banner DOM **存在**（月名單分派鎖不移除 Banner，改 disabled 樣式）
  - 主按鈕 disabled（`toBeDisabled()`）
  - Banner 有琥珀色 / disabled 視覺指示（有對應 CSS class 或 aria-disabled）

---

## tdd-implementation 指令

1. **新建 ScoringIntegrityCheckService**：單一職責，checkIntegrity(cardType, version) → IntegrityResult
2. **AssignmentRunPipelineService 注入**：Stage 2 前呼叫 checkIntegrity，失敗時 run=failed + audit log
3. **fn_calc_tier_level try-cast**：內部判斷 level2_s/2_e 是否全可 cast numeric，選擇比較策略
4. **migration**：add-match-type-to-ob-levelcard-column（match_type VARCHAR(10) nullable）
5. **migration**：add-scoring-audit-fields-to-assignment-audit-log（run_id / card_type / column_name / rule_violated / violated_row_count，全 nullable）
6. **warning_summary**：寫入 report_payload.warningSummary（JSONB 子鍵），不新增 DB 欄位
