---
last-updated: 2026-06-26
version: v1.1
change-summary: "新增部門維度每日預估件數計算公式；更新 AC-2/AC-3/AC-5 為「保住總量＋標示缺口」模型：全名單總量 org_total 永遠正確顯示，未分派至任何部門的差額以缺口列/徽章明確標示（取代原「視為 0」模型）；AC-5 統一至 AC-2 缺口機制。"
---

# US-167：部門每日預估件數計算公式（ob_dept_pct per-list 比例）

> **Story ID**：US-167
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 2（Advanced）
> **預估點數**：5
> **Feature**：Stage 0 試算頁業務化重設計

---

## 背景說明

US-166 將試算頁預設為「全名單彙總，部門維度」視角，但需要一個具體的計算公式將多份名單的每日 ratio 分配轉換為「各部門今天預估要打幾通電話」。

各份名單的部門分配比例由 **ob_dept_pct**（F079 部門比例設定）提供，且每份名單的比例可能不同（例如名單 A 的 D001 課佔 40%，名單 B 的 D001 課佔 25%）。本 Story 定義彙總公式與缺少比例設定時的 fallback 行為。

---

## User Story

**As a** 業務部長 / 業務處長
**I want** 每日估算表中顯示「各部門分別預估今日要分派幾件」
**So that** 一眼看出哪個課的工作量偏高，不需自行用 Excel 計算加總

---

## 驗收標準

### AC-1：部門每日件數計算公式

- **Given** 系統已取得下列資料：
  - 所有啟用名單的 per-list 估算件數（`list_total[L]`，來自 F092 dry-run Stage 1 完整鏈 COUNT；等同 F049 AC-4 / US-167 依賴 US-166 的名單集合）
  - 每份名單對應各部門的分派比例（`dept_ratio[L][D]`，來自 `ob_dept_pct`；單位：百分比 0–100）
  - 每個日期的千分位 ratio（`daily_per_mille[d]`，來自 F049 §5.1 daily-estimate API；`ratioPerMille` 加總 = 1000）
- **When** 計算日期 `d`、部門 `D` 的預估件數
- **Then** 計算公式為：`dept_daily_count[d][D] = Σ_L( list_total[L] × dept_ratio[L][D] / 100 × daily_per_mille[d] / 1000 )`
- **And** 對於休息日（`daily_per_mille[d] = 0`），所有部門之 `dept_daily_count[d][D] = 0`
- **And** 試算頁顯示各部門 `dept_daily_count` 的整數值（小數無條件捨去或四捨五入；規則由 spec-writer 在 F049 spec 補充後確認）

### AC-2：部門比例缺口的「保住總量＋標示缺口」模型

- **Given** 一份或多份啟用名單的 `ob_dept_pct` 存在以下任一情形：（a）某份名單完全未設定任何部門比例；（b）某份名單的部門比例總和 `Σ ration < 100`（包含「未達 100%」與「比例未設定等同 0%」兩種情況）
- **When** 計算某工作日 `d` 的各部門件數
- **Then** 系統**一律先計算、一律顯示「全名單總量」**：`org_total[d] = Σ_L( list_total[L] × daily_per_mille[d] / 1000 )`；此值不依賴任何部門比例設定，必為正確值
- **And** 部門分解欄位只列**已設定比例的部門**之件數（`dept_daily_count[d][D] = Σ_L( list_total[L] × ration[L][D] / 100 × daily_per_mille[d] / 1000 )`；未設定的 `(L, D)` 對此組合貢獻 0）
- **And** 計算「缺口」：`gap[d] = org_total[d] − Σ_D dept_daily_count[d][D]`；當 `gap[d] > 0` 時，頁面以橘色缺口列 / 徽章標示：「尚有 {gap} 件未分派到部門（比例未設定或未達 100%）」
- **And** 計算**不被中斷**（已設定比例的部門件數正常顯示），且不自動補差（缺口僅標示、不填入任何部門）
- **And** `gap[d] = 0` 時不顯示缺口列（無多餘警示）

### AC-3：全名單彙總模式下的雙合計呈現

- **Given** 試算頁在「全名單彙總」模式（US-166 AC-1）
- **When** 計算某個工作日的部門件數
- **Then** 每個部門顯示該日所有啟用名單的加總件數（Σ over 所有 active list）
- **And** 頁面底部同時顯示**兩個合計列並區分語意**：
  1. **「已分派部門合計」**：`Σ_D dept_daily_count[d][D]`（僅含已設定比例的部門列之加總）
  2. **「全名單總量」**：`org_total[d]`（含未分派件數；為工作量的真實上界）
- **And** 兩者之差 = AC-2 的缺口 `gap[d]`；視覺上令使用者直觀看出「總量中有多少件尚未落到任何部門」

### AC-4：單一名單鑽探模式下的部門分解

- **Given** 試算頁在「單一名單模式」（US-166 AC-2，已選定特定 `list_no`）
- **When** 計算某個工作日的部門件數
- **Then** 每個部門僅顯示該份名單對應此部門的件數（名單集合縮減為 1，公式其餘不變）

### AC-5：比例未達 100% 統一納入 AC-2 缺口機制

- **Given** 某份名單的所有部門比例設定之總和 `Σ ration < 100`（包含「完全未設定＝0%」與「部分設定但未達 100%」兩種情況）
- **When** 計算部門每日件數
- **Then** 未達 100% 的差額**統一表現為 AC-2 的缺口**：差額件數加入 `gap[d]`，以缺口列 / 橘色徽章一次標示「尚有 X 件未分派到部門」，**不另行顯示獨立的名單層級警示文字**
- **And** 計算仍按實際設定的比例執行（不自動補差，只標示）
- **And** 若所有名單的比例總和皆為 100%，`gap[d] = 0`，缺口列不顯示

---

## 測試案例

### TC-167-01：兩份名單 × 兩個部門的基本加總

- **Given**：名單 A（total=1000）D001=40%、D002=60%；名單 B（total=500）D001=25%、D002=75%；某工作日 daily_per_mille=50‰
- **When**：計算該日各部門件數
- **Then**：
  - D001 = (1000 × 40/100 × 50/1000) + (500 × 25/100 × 50/1000) = 20 + 6.25 → 依捨入規則取整
  - D002 = (1000 × 60/100 × 50/1000) + (500 × 75/100 × 50/1000) = 30 + 18.75 → 依捨入規則取整
  - 全部門合計 ≈ 75（與兩份名單合計 total=1500 × 50‰ 的值相近）

### TC-167-02：比例未設定時總量仍正確顯示、缺口被標示

- **Given**：名單 A（total=1000）僅設 D001=60%，無 D002 設定；某工作日 daily_per_mille=50‰
- **When**：頁面載入估算結果
- **Then**：
  - `org_total = 1000 × 50/1000 = 50`（全名單總量，正確顯示）
  - D001 件數 = `1000 × 60/100 × 50/1000 = 30`（正常顯示）
  - D002 不列出任何部門行（未設比例，不顯示 0）
  - 缺口標示：「尚有 20 件未分派到部門（比例未設定或未達 100%）」（gap = 50 − 30 = 20）
  - 「已分派部門合計」= 30；「全名單總量」= 50；差值 20 = 缺口，視覺清晰

### TC-167-03：休息日各部門件數為 0

- **Given**：某日為週末（daily_per_mille = 0）
- **When**：計算所有部門的件數
- **Then**：所有部門顯示 0（或「—」），全部門合計亦為 0

### TC-167-04：比例未達 100% 統一表現為缺口（不另出名單層警示）

- **Given**：名單 B（total=2000）設定 D001=30%、D002=40%（總和 70%，缺 30%）；某工作日 daily_per_mille=50‰
- **When**：試算頁載入
- **Then**：
  - `org_total = 2000 × 50/1000 = 100`
  - D001 = `2000 × 30/100 × 50/1000 = 30`；D002 = `2000 × 40/100 × 50/1000 = 40`
  - 缺口 = 100 − (30 + 40) = 30，顯示「尚有 30 件未分派到部門」
  - **不**另外顯示「名單 B 部門比例總和 70%，未達 100%」的獨立名單層警示文字

---

## 依賴關係

- **Blocked By**：F049 Stage 0 daily-estimate API（提供 `daily_per_mille`）、F092 per-list dry-run estimate（提供 `list_total`）、F079 部門比例設定（提供 `ob_dept_pct` 資料，處長應已在 M03 設定好比例）
- **Blocks**：US-166（本 Story 的公式是 US-166 彙總視角的核心數值來源）、US-169（可行性指標使用本 Story 的 `dept_daily_count`）

---

## Definition of Done

- [ ] AC-1 ~ AC-5 全部通過
- [ ] TC-167-01 ~ TC-167-04 全部通過
- [ ] 比例未設定時 org_total 仍正確顯示、缺口被標示（TC-167-02）
- [ ] 比例未達 100% 統一表現為缺口列、不另出名單層警示（TC-167-04）
- [ ] gap = 0 時缺口列不顯示（AC-2 最後一條）
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨通過
- [ ] 單元測試覆蓋率 ≥ 80%（含 TC-167-01 公式驗算）
- [ ] Code review 通過
- [ ] 文件已更新（F049 spec 補部門公式章節）

---

## 開放問題

| OQ 編號 | 議題 | 狀態 |
|---------|------|------|
| OQ-167-01 | 計算結果的小數捨入規則（四捨五入 vs. 無條件捨去）？對齊 F049 §13 的 `round(ratioPerMille/1000 × total)` 語意，建議一致使用 JS `Math.round`；但由 spec-writer 確認 | 待 spec-writer 裁定 |
| OQ-167-02 | **已確認（2026-06-26）**：`ob_dept_pct` 的比例欄位名稱為 **`ration`**（numeric，0–100）；PK = `project_workym + list_no + obdeptid + ration`；另有 `obdeptid`（6 字部門代號）、`obdeptnm`（部門名稱）欄位。AC-1 公式中的 `dept_ratio[L][D]` 即對應 `ob_dept_pct.ration`（WHERE `list_no = L AND obdeptid = D`） | **已確認** |
| OQ-167-03 | **⚠️ 資料模型風險 — 務必由 spec-writer / 架構師驗證**：本 Story 的部門投影使用 `ob_dept_pct.obdeptid`；US-169 人均指標用 `ob_emphire.dept_code` 計在職人數；US-168 處長 scope 用 `getScopeDeptCode`（回傳 `ob_emphire.dept_code`）。現有 `assignment-list.service.ts` 的 `listLists` 已用 `getScopeDeptCode` 去 filter `ob_dept_pct.obdeptid`，**暗示 `ob_emphire.dept_code` 與 `ob_dept_pct.obdeptid` 同一代號空間**。但「以 `dept_code` 分組計算在職人數」是否確實對應到 `obdeptid` 那一層（課 vs 處的層級落差），**需對 ob_emphire 實際資料驗證**。若存在層級不一致（例如 `dept_code` 為處別代號、`obdeptid` 為課別代號），US-169 的人均計算與 US-167 的部門件數將對應到不同粒度，使指標失去意義。請 spec-writer 以實際資料確認後記入 F049 spec | **待 spec-writer / 架構師驗證（高風險）** |

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-166（彙總視角）、US-169（可行性指標）、US-170（術語清理）
- **Spec**：`docs/specs/features/F049-stage0-daily-estimate.md`（需新增部門公式定義）、`docs/specs/features/F079-dept-ratio-setting.md`（ob_dept_pct 資料來源）
