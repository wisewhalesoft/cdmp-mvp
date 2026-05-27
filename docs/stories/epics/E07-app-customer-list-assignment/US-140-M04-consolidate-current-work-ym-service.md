# US-140：後端 computeCurrentWorkYm() 收斂為 SystemService 單一來源，並新增 getDefaultTargetWorkYm()

> **Story ID**：US-140
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行（後端架構整頓）
> **優先級**：Must Have
> **階段**：Phase 2
> **預估點數**：2
> **Feature**：F097 作業月語意統一
> **修正對象**：`assignment-list.controller.ts:63`、`stage0-estimate.controller.ts:35`、`assignment-run.controller.ts:69`（三個重複 static method）

---

## User Story

**As a** 後端維護工程師
**I want** 計算系統錨點月（`current_work_ym`）的邏輯只存在一個地方（`SystemService.getCurrentWorkYm()`），並且新增 `getDefaultTargetWorkYm()` 方便各呼叫方取得預設作業月（下月）
**So that** 未來修改計算邏輯（如調整月份切換時間）只需改 `SystemService` 一處，不會因遺漏某個 controller 的 static copy 造成行為不一致

---

## 背景說明：現況重複點

目前後端有 3 個功能完全相同的 static method copy（加上 `SystemService` 共 4 份）：

| 位置 | 名稱 |
|---|---|
| `assignment-list.controller.ts:63` | `AssignmentListController.computeCurrentWorkYm()` |
| `stage0-estimate.controller.ts:35` | `Stage0EstimateController.computeCurrentWorkYm()` |
| `assignment-run.controller.ts:69` | `AssignmentRunController.computeCurrentWorkYm()` |
| `system.service.ts:19` | `SystemService.getCurrentWorkYm()` ← **正確形式，已有 Injectable** |

另外 `assignment-stage` 下有 `dept-ratio.controller`、`personnel-ratio.controller`、`stage-action.controller`（8+ 處）呼叫 `AssignmentListController.computeCurrentWorkYm()`，這些呼叫方也需同步更新。

---

## 驗收標準

### AC-1：三個 controller static method 廢除，改呼叫 SystemService

- **Given** `assignment-list.controller.ts`、`stage0-estimate.controller.ts`、`assignment-run.controller.ts` 各有 `computeCurrentWorkYm()` static method
- **When** US-140 完成
- **Then** 上述三個 static method 完全移除
- **And** 各 controller 注入 `SystemService` 並改呼叫 `this.systemService.getCurrentWorkYm()`
- **And** 所有既有業務行為不變（邏輯相同，僅集中）

### AC-2：`assignment-stage` 下各 controller 呼叫同步更新

- **Given** `dept-ratio.controller`、`personnel-ratio.controller`、`stage-action.controller` 等呼叫 `AssignmentListController.computeCurrentWorkYm()`
- **When** US-140 完成
- **Then** 改呼叫 `SystemService.getCurrentWorkYm()`，行為不變

### AC-3：SystemService 新增 `getDefaultTargetWorkYm()`

- **Given** `SystemService` 現有 `getCurrentWorkYm(now?: Date): string`
- **When** 呼叫 `SystemService.getDefaultTargetWorkYm(now?: Date): string`
- **Then** 回傳 `getCurrentWorkYm(now)` 加一個月的 YYYYMM
- **And** 函式邏輯可供 US-137 前端 Context 初始化的對應後端端點使用

### AC-4：跨年邊界正確計算

- **Given** `getCurrentWorkYm()` 回傳 `'202512'`（12 月）
- **When** 呼叫 `getDefaultTargetWorkYm()`
- **Then** 回傳 `'202601'`（次年 1 月，而非 `'202513'`）

### AC-5：OVERRIDE 環境變數在 `getDefaultTargetWorkYm()` 中正確套用

- **Given** 環境變數 `OVERRIDE_CURRENT_WORK_YM = '202506'`
- **When** 呼叫 `getDefaultTargetWorkYm()`
- **Then** 回傳 `'202507'`（以 override 值為基準 +1）

### AC-6：既有 `assertYmInRange` / `assertNotHistorical` 行為不變

- **Given** `assignment-list.service.ts`、`dept-ratio.service.ts` 等各 service 接收 `currentWorkYm: string` 參數
- **When** controller 改由 `SystemService` 提供 `currentWorkYm`
- **Then** service 層邏輯不需改動（只改 controller 的取值來源）

---

## 技術備註

- `SystemService` 已是 `@Injectable()`，只需在各 controller constructor 新增 `private readonly systemService: SystemService`，並確認 `SystemModule` 已 export `SystemService`（或各 module 已 import）。
- `getDefaultTargetWorkYm()` 建議實作：`const cur = this.getCurrentWorkYm(now); const y = +cur.slice(0,4), m = +cur.slice(4,6); return m === 12 ? \`${y+1}01\` : \`${y}${String(m+1).padStart(2,'0')}\`;`（spec-writer / tdd-implementation 可調整）。
- 此 story 不改任何業務邏輯，為純粹的 refactor；風險低，但需確認所有 module import 正確後才合併。

---

## 依賴關係

- **Blocked By**：無（獨立 refactor）
- **Blocks**：US-139（guard 使用 `SystemService.getCurrentWorkYm()` 計算比對基準）

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-6 全部通過
- [ ] 三個 controller 的 `computeCurrentWorkYm()` static method 已移除
- [ ] `SystemService.getDefaultTargetWorkYm()` 已新增並有單元測試（含跨年邊界 + OVERRIDE）
- [ ] `assignment-stage` 下各 controller 呼叫已同步更新
- [ ] 單元測試覆蓋率 ≥ 80%（`getDefaultTargetWorkYm` 全邊界）
- [ ] Code review 通過，無功能行為變更

---

## 相關文件

- **Glossary**：[docs/specs/glossary.md](../../../specs/glossary.md)（`current_work_ym` 唯一合法計算點）
- **Feature Proposal**：[docs/specs/proposals/work-ym-semantics-unification.md](../../../specs/proposals/work-ym-semantics-unification.md) §5 D6
- **相關 Stories**：US-137（前端 Context 對應的預設值邏輯）、US-139（使用 SystemService）
