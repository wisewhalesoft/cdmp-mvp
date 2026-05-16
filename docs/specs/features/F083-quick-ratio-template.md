---
spec-id: F083
title: 獎懲快速比例設定（相對調整模板 ±10/20%）
feature-id: F083
source-story: US-113
epic: E07
module: M03b 個別業務比例設定階段（F082 之 UI 子模組）
priority: P0-MVP
version: "1.3"
date: 2026-05-16
status: Draft
---

# F083: 獎懲快速比例設定（相對調整模板 ±10/20%）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

> **v1.3 救援重寫（2026-05-16）**：前一輪 PowerShell 編碼事故損毀本檔內容，本版本依 US-113 user story、F082 v1.3 與 AD-E07 v3.0 一致性決議完整重建；Guard 引用對齊新體系（DirectorGuard / DirectorOrSectionChiefGuard / SectionChiefScopeGuard），業務角色欄位 `business_role`，廢除 `SalesManagerGuard` / `is_sales_manager` / `e07_role`。
> **v1.2 修訂（2026-05-16）**：補入 BR-11 cross-ref（本 Feature 之儲存路徑透過 F082 PUT、月跑並發守衛沿用 `AssignmentRunGuardService.assertNoRunningRun()`、Feature Flag fallback 503 + `FEATURE_NOT_ENABLED` 沿用 F082）。
> **v1.1 修訂（2026-05-16 / E07 補修）**：PO 確認 F083-A：模板**僅相對於系統預設值**（`100/N`），**不疊加**目前 RATION；§12 A-2 升級為 [RESOLVED]；BR-2 補連續套用語意；UI 顯示提示目前已套用模板。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F082-set-personnel-ratio.md` §3 / §6 BR-2 / §6 BR-7（儲存路徑統一走 F082 PUT 端點）+ `error-handling.md#assignment-ratio-errors`（`BONUS_PENALTY_TEMPLATE_INVALID`） |
| QA / Tester | 本文件 + F082 對應測試案例（模板套用後仍須通過 F082 加總驗證） |
| UI/UX Designer | 本文件 §7 UI/UX 需求 + F082 §7（按鈕嵌於 F082 業務員清單列右側） |
| Architect | 本文件 + `architecture-spec.md` §3.10（模板計算為純前端輔助，無新後端流程） |

---

## 對應 User Story

- 來源 Story：[US-113-M03b-quick-ratio-template.md](../../stories/epics/E07-app-customer-list-assignment/US-113-M03b-quick-ratio-template.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03b 個別業務比例設定階段（F082 之 UI 子模組）
- 相關 OQ：OQ-E07-20（模板語意確認）

---

## 1. 功能摘要

於 F082 個別業務比例設定頁面，提供「+10% / +20% / -10% / -20%」4 個快速調整模板按鈕，讓處長能以相對於系統預設值的方式快速調整某業務員的 RATION，並由系統自動重新平衡其餘業務員 RATION，**確保部門內加總 = 100%**。

**核心特性**：
- 模板為**純前端計算輔助**（無獨立後端 API）；儲存路徑：仍透過 F082 PUT 端點寫入 `ob_empl_set`
- 系統自動重新平衡：目標業務員 RATION = 預設值 + delta；其餘業務員均分剩餘額度，使加總 = 100%
- 若任一業務員 RATION 落在 [0, 100] 範圍外，**禁止套用**並提示
- 模板為**純畫面操作**，需透過 F082「儲存」按鈕方能落 DB

**OQ-E07-20 確認**：「相對預設值」=「均等分配」（100% / 部門業務員人數）；模板的 ±N% 為「相對預設值的固定增減量」，**不疊加**目前 RATION（v1.1 PO 決議 F083-A）。

## 2. 使用者故事

**As a** 處長 / 部長 / Admin
**I want** 對部門內業務員一鍵套用「±10% / ±20%」模板，快速反映業務員獎懲表現
**So that** 不需手動逐人計算精確比例，能以直觀獎懲快速完成個別業務比例設定

## 3. 前置條件

- 使用者已在 F082 個別業務比例設定頁進入編輯模式（沿用 F082 §3 前置條件）
- 部門業務員人數 ≥ 2（人數 = 1 時模板不可套用，詳 BR-8 / AC-9）
- 名單 `stage = 'personnel_ratio'` / 名單未停用 / 月跑非執行中 / 轄區符合（沿用 F082）

## 4. 驗收標準

### AC-1：4 個快速模板按鈕顯示於 F082 業務員清單

- **Given** 使用者在 F082 個別業務比例設定頁編輯模式
- **When** 頁面載入該部門業務員清單
- **Then** 每位業務員列右側顯示 4 個按鈕：[+20%] [+10%] [-10%] [-20%]
- **And** 按鈕語意以 tooltip 標示：「相對系統預設值（{defaultRation}%）調整」
- **And** 處長 / 部長 / Admin 均可看到，沿用 F082 角色 × 階段權限矩陣

### AC-2：套用 +10% 模板後重新平衡

- **Given** 部門有 N 位業務員（預設值 = 100% / N，例 4 人 → 25%）
- **When** 使用者對 EMP_X 點擊 [+10%]
- **Then** 系統計算：
  1. EMP_X 之 RATION = `defaultRation + 10`（例 25 + 10 = 35）
  2. 其他 (N - 1) 位業務員均分剩餘額度：`(100 - EMP_X 之 RATION) / (N - 1)`（例 (100 - 35) / 3 = 21.67）
- **And** 頁面即時更新所有業務員 RATION 數值
- **And** F082 之 per-DEPT 動態加總顯示「100%」（沿用 F082 AC-3）

### AC-3：套用 +20% / -10% / -20% 模板

- **Given** 同 AC-2 場景，4 人 / 預設 25%
- **When** 使用者對 EMP_X 點擊不同模板
- **Then** 系統依下表計算 EMP_X 與其餘業務員 RATION：

| 模板 | EMP_X 之 RATION | 其餘業務員 RATION |
|---|---|---|
| +20% | `defaultRation + 20`（例 45） | `(100 - 45) / (N - 1)`（例 18.33） |
| +10% | `defaultRation + 10`（例 35） | `(100 - 35) / (N - 1)`（例 21.67） |
| -10% | `defaultRation - 10`（例 15） | `(100 - 15) / (N - 1)`（例 28.33） |
| -20% | `defaultRation - 20`（例 5） | `(100 - 5) / (N - 1)`（例 31.67） |

### AC-4：套用後 RATION 範圍越界阻擋

- **Given** 部門有 2 位業務員（預設各 50%）
- **When** 使用者對 EMP_X 點擊 [-60%]（不存在於模板選項；範例僅供示意，[-20%] 後即 50 - 20 = 30，仍合法）
- **Or Given** 部門有 5 位業務員（預設各 20%），對 EMP_X 點擊 [-20%]，20 - 20 = 0，仍合法
- **Or Given** 部門有 6 位業務員（預設各 ~16.67%），對 EMP_X 點擊 [-20%]，16.67 - 20 = -3.33，**越界**
- **When** 系統計算 EMP_X 之 RATION < 0% 或 > 100%
- **Then** 前端顯示警示 toast：「套用 [{template}] 模板後，{empName} 之 RATION 將為 {newRation}%，超出 [0, 100%] 範圍，無法套用。請手動調整或選擇其他模板。」**不執行套用**（業務員 RATION 維持原值）

### AC-5：套用後其餘業務員 RATION 越界阻擋

- **Given** 部門有 3 位業務員（預設各 33.33%）
- **When** 使用者對 EMP_X 點擊 [+80%]（不存在於模板；以 [+20%] 為例：33.33 + 20 = 53.33，其餘 2 人均分 (100 - 53.33) / 2 = 23.33，合法）
- **Or Given** 部門有 2 位業務員（預設各 50%），使用者對 EMP_X 點擊 [+20%]，50 + 20 = 70，其餘 1 人 = 100 - 70 = 30，合法
- **And** 模板計算過程中：若任一業務員 RATION < 0% 或 > 100%，依 AC-4 規則阻擋

### AC-6：套用模板後加總 = 100%

- **Given** 任一模板成功套用
- **When** 系統計算完成
- **Then** 部門內所有業務員 RATION 加總落在 [99.99, 100.01]（沿用 F082 BR-2 容忍 ±0.01% 浮點誤差）
- **And** F082 之「儲存」按鈕啟用

### AC-7：模板套用後可手動微調

- **Given** 使用者套用 [+10%] 模板後，所有業務員 RATION 已重新平衡
- **When** 使用者手動修改某業務員 RATION 值（直接輸入框）
- **Then** 系統允許覆寫模板結果，繼續依 F082 AC-3 即時加總驗證即時更新

### AC-8：模板套用不觸發儲存

- **Given** 使用者套用模板後，畫面顯示重新平衡後的 RATION
- **When** 使用者未點擊 F082「儲存」按鈕，直接離開頁面或重新整理
- **Then** 資料庫 `ob_empl_set` 不更新，模板結果為純前端暫存狀態
- **And** 重新進入頁面後，RATION 顯示 DB 既值（或預設值 = 均分）

### AC-9：部門業務員人數 = 1 時模板停用

- **Given** 部門僅有 1 位業務員（預設 100%）
- **When** 使用者試圖點擊任一模板按鈕
- **Then** 前端顯示提示：「部門僅有 1 位業務員，無法套用相對調整模板」（按鈕為 disabled 狀態並附 tooltip）
- **And** 該業務員 RATION 自動為 100%（沿用 F082 預設值規則）

### AC-10：後端二次校驗模板套用結果

- **Given** F082 PUT 寫入時，service 層驗證模板套用後之 RATION 數值
- **When** 收到 PUT 請求
- **Then** 沿用 F082 AC-3 / AC-4 之 per-DEPT 加總 100% 驗證 + 數值範圍 [0, 100] 驗證
- **And** 額外規則（service 層）：若 request payload 帶有 `appliedTemplate` 欄位（標示來源於模板套用），且套用後加總落在 [99.99, 100.01] 之外或某 RATION 越界，回 422 `BONUS_PENALTY_TEMPLATE_INVALID`（v1.0 新增；details 含 `template` / `targetEmpId` / `actualSum`）。**目的**：防範前端計算 bug 落地；正常使用流程不會觸發

## 5. API 規格

### 5.1 模板計算為純前端邏輯（無獨立 API 端點）

本 Feature 之核心計算（模板套用 + 重新平衡 + 範圍校驗）完全於**前端 JavaScript 執行**；最終儲存仍透過 F082 §5.2 PUT 端點

**前端計算 pseudo-code**（建議 UI/UX 與 architect 協作落實）：

```typescript
function applyTemplate(
  template: '+10%' | '+20%' | '-10%' | '-20%',
  targetEmpId: string,
  employees: Array<{ empId: string; ration: number }>,
): { success: boolean; updatedEmployees?: typeof employees; error?: string } {
  const N = employees.length;
  if (N <= 1) {
    return { success: false, error: '部門僅有 1 位業務員，無法套用模板' };
  }
  const defaultRation = 100 / N;
  const delta = parseInt(template); // +10 / +20 / -10 / -20
  const targetNewRation = defaultRation + delta;

  if (targetNewRation < 0 || targetNewRation > 100) {
    return { success: false, error: `業務員 ${targetEmpId} 將變為 ${targetNewRation}%，超出 0~100%` };
  }

  const remainingShare = (100 - targetNewRation) / (N - 1);
  if (remainingShare < 0 || remainingShare > 100) {
    return { success: false, error: `其他業務員均分結果為 ${remainingShare}%，超出 0~100%` };
  }

  const updated = employees.map(e =>
    e.empId === targetEmpId
      ? { ...e, ration: parseFloat(targetNewRation.toFixed(2)) }
      : { ...e, ration: parseFloat(remainingShare.toFixed(2)) },
  );
  return { success: true, updatedEmployees: updated };
}
```

### 5.2 後端儲存路徑（沿用 F082）

詳見 [F082 §5.2](F082-set-personnel-ratio.md#52-put-apiv1assignmentratiospersonnellistno) PUT 端點。Request body 可附加可選欄位 `appliedTemplate`（紀錄此次儲存最後套用的模板，便於 audit log 追蹤）：

```json
{
  "deptCode": "XTC0",
  "appliedTemplate": { "template": "+10%", "targetEmpId": "EMP001" },
  "employees": [...]
}
```

**錯誤碼補充**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 422 | BONUS_PENALTY_TEMPLATE_INVALID | **v1.0 新增**：request body 之 `appliedTemplate` 對應之計算結果不符合 per-DEPT 加總 100% 或值域 [0, 100]（防範前端 bug 落地） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **預設值定義**：`defaultRation = 100% / N`（N = 部門業務員人數）；對應 F082 之「若該業務員於 `ob_empl_set` 無紀錄，前端顯示為均等分配」（暫存狀態，未落 DB） |
| BR-2 | **模板語意（v1.1 修訂 / PO 決議 F083-A）**：±N% 為相對於**系統預設值**的固定增減量，**不疊加目前 RATION 值**。例：4 人部門首次套用 [+10%] 後 EMP_X = 35%、其餘 = 21.67%；若再點 [+20%]，EMP_X 變為 45%（= 25 + 20），**而非** 35 + 20 = 55%。UI 應提示目前已套用模板（例 §7「目前已套用：[+20%]」標記） |
| BR-2a | **「相對 %」UI 顯示語意（OQ-E07-40 用戶決議落地，2026-05-15）**：F082 / F083 全程顯示給處長 / 部長之 RATION 數值均為**相對部門內**的百分比（部門內加總 = 100%），**不顯示「相對全名單」絕對百分比**。例：部門配額 30%，3 人各「相對部門內」33.33%（即「相對全名單」絕對 = 30% × 33.33% ≈ 10%）；DB 落地語意（相對 % vs 絕對 %）由 system-architect 決議（[ASSUMPTION] 詳 §12 A-3 與 OQ-E07-40） |
| BR-3 | **重新平衡演算法**：套用模板時，目標業務員 RATION = `defaultRation + delta`；其餘 (N - 1) 位均分剩餘額度 = `(100 - targetRation) / (N - 1)`；確保部門內加總 = 100% |
| BR-4 | **範圍越界阻擋**：若目標業務員或剩餘業務員之 RATION 落在 [0, 100] 之外，**禁止套用**；前端顯示警示 toast，業務員 RATION 維持原值（AC-4 / AC-5） |
| BR-5 | **手動覆寫**：模板套用後，使用者可自由再修改任一業務員 RATION（取消模板效果）；最終儲存時依 F082 之加總 100% 驗證為準 |
| BR-6 | **儲存責任歸屬**：模板計算結果為前端暫存；需透過 F082「儲存」按鈕方能落 DB |
| BR-7 | **小數精度**：所有計算採 `toFixed(2)` 四捨五入至 2 位小數；加總容忍 ±0.01%（沿用 F082 BR-2 / I-8） |
| BR-8 | **部門業務員人數 = 1 時無模板**：N = 1 時所有模板按鈕為 disabled，hover 提示原因（AC-9） |
| BR-9 | **後端二次校驗**：F082 PUT 接收 `appliedTemplate` 時，service 層需重算模板結果，若不符合則回 422 `BONUS_PENALTY_TEMPLATE_INVALID`（防範前端 bug 落地，正常流程不會觸發） |
| BR-10 | **與 F082 共享驗證**：本 Feature 之 RATION 範圍 [0, 100] 與部門加總 100% 規則完全沿用 F082 BR-2 |
| BR-11 | **月跑並發守衛 + Feature Flag 沿用 F082（v1.2 補修 / system-architect 決議 #6 + #2）**：本 Feature 無獨立後端端點；儲存走 F082 PUT，故月跑並發守衛（`AssignmentRunGuardService.assertNoRunningRun()`）由 F082 service method 統一執行；Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`）亦沿用 F082 端點之 `FeatureFlagGuard` 行為 |

## 7. UI/UX 需求

- **按鈕位置**：F082 業務員清單列右側，4 個按鈕橫向排列：[+20%] [+10%] [-10%] [-20%]
- **按鈕色彩建議**：
  - [+20%] / [+10%]：暖色系（橙色 / 黃色，獎勵語意）
  - [-10%] / [-20%]：冷色 / 警示色（紅色 / 灰色，懲戒語意；避免極端紅色，以免引發負面情緒）
  - 尺寸統一，按鈕高度與 RATION 輸入框對齊
- **Tooltip 文字**：每位業務員按鈕區附 tooltip：「相對系統預設值（{defaultRation}%）調整」；hover 顯示「+10% = 在預設值 {defaultRation}% 基礎上加 10 個百分點 → {targetRation}%」
- **越界 toast**：套用越界時於頁面右上角顯示警示 toast：「套用 [{template}] 模板後，{empName} 將為 {newRation}%，超出 [0, 100%] 範圍，無法套用」，停留 5 秒後自動消失
- **套用後即時更新**：模板成功套用後，所有業務員 RATION 即時更新顯示（含其餘業務員），並更新 F082 動態加總「100%」
- **目前已套用模板提示**：套用模板後可在業務員列下方小字標示「已套用 [{template}] 模板，可繼續手動微調」
- **部門業務員人數 = 1 時按鈕停用**：所有模板按鈕為灰色 disabled 狀態，hover 提示「部門僅有 1 位業務員，無法套用模板」（避免無原因停用導致使用者困惑）

## 8. 相依性

- **Blocked By**：
  - F082（個別業務比例設定，本 Feature 為其 UI 子模組）
  - F074（處長角色定義）
  - F077 v1.0（`stage` + 角色 × 階段操作矩陣）
- **Blocks**：（無下游 Feature；儲存路徑走 F082 PUT 端點）
- **連帶議題**：F079（OQ-E07-20 已確認模板語意，不再連動）

## 9. 交叉參考

- **資料模型**：[data-model.md#ob-empl-set-obemplsetmf--人員比例設定](../data-model.md#ob_empl_setobemplsetmf--人員比例設定)（透過 F082 PUT 寫入）
- **錯誤處理**：[error-handling.md#assignment-ratio-errors](../error-handling.md#assignment-ratio-errors)（`BONUS_PENALTY_TEMPLATE_INVALID`）
- **OQ 來源**：OQ-E07-20（模板語意：相對於系統預設值 + 不疊加 RATION）
- **相關功能**：
  - [F082](F082-set-personnel-ratio.md)（個別業務比例設定，本 Feature 為其 UI 子模組）
  - [F084](F084-advance-to-approval.md)（推進至簽核，要求所有部門加總 = 100%）
  - [F085](F085-rollback-to-dept-ratio.md)（Rollback；不影響本 Feature 之模板計算）
- **圖表**：[diagrams/F082-personnel-ratio-flow.mmd](../diagrams/F082-personnel-ratio-flow.mmd)（含模板套用子流程）

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 前端關鍵測試案例（純前端計算邏輯為主）：
  - 4 人部門（預設 25%），對 EMP_X [+10%] → EMP_X = 35%、其餘 = 21.67%、加總 = 100%
  - 4 人部門對 EMP_X [+20%] → EMP_X = 45%、其餘 = 18.33%、加總 = 100%
  - 4 人部門對 EMP_X [-10%] → EMP_X = 15%、其餘 = 28.33%、加總 = 100%
  - 4 人部門對 EMP_X [-20%] → EMP_X = 5%、其餘 = 31.67%、加總 = 100%
  - 6 人部門（預設 16.67%），對 EMP_X [-20%] → 阻擋（EMP_X 變為 -3.33%）
  - 1 人部門所有模板按鈕 disabled
  - 模板套用後手動修改 RATION → F082 加總即時更新
  - 模板套用後未點擊「儲存」→ 重新進入頁面 RATION 為預設值
  - 加總精度：模板計算結果落在 [99.99, 100.01]
- 後端關鍵測試案例：
  - PUT 帶 `appliedTemplate`、加總正確 → 200 OK
  - PUT 帶 `appliedTemplate`、加總越界（前端 bug 模擬）→ 422 `BONUS_PENALTY_TEMPLATE_INVALID`
- E2E：F082 編輯模式 → 套用 [+10%] → 加總 = 100% → 點擊 F082「儲存」→ 寫入成功 → 重新進入頁面顯示已儲存值

## 11. 實作 Checklist

- [ ] 前端模板計算函式（`applyTemplate` function；§5.1 pseudo-code）
- [ ] 前端按鈕渲染：每位業務員 4 個按鈕 + 越界 toast + 部門人數 = 1 時 disabled 處理
- [ ] 前端套用後 F082 加總即時更新串接
- [ ] 前端「相對系統預設值」說明文字 / tooltip
- [ ] 後端 F082 PUT 之 `appliedTemplate` 欄位接收與 service 層二次校驗
- [ ] error-handling.md 新增 `BONUS_PENALTY_TEMPLATE_INVALID` 錯誤碼
- [ ] 整合測試：F082 + F083 模板套用 → 儲存路徑
- [ ] 邊界測試：部門人數 1 / 2 / 3 / 6 時模板套用結果

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **小數精度策略**：所有計算採 `toFixed(2)` 四捨五入至 2 位小數；加總容忍 ±0.01%（沿用 F082 I-8）。若 PO 後續要求更高精度（不容忍），可由 UI/UX 改為 `Math.round`，但需注意可能加總偏差 → 100%（需後端二次校驗）；本 spec 預設為 2 位小數 | [ASSUMPTION] 待 PO 確認 |
| A-2 | **模板語意完整**：~~本 spec 預設為「所有模板皆以預設值為基準」~~ **[RESOLVED] 2026-05-16 / PO 決議 F083-A**：模板僅相對於系統預設值（100/N）為基準，**不疊加**；若使用者連續套用第二次模板，仍以 `defaultRation` 為基準（**非**前次套用後值）。UI 應提示目前已套用模板（如 §7「目前已套用：[+20%]」標記）。詳 §6 BR-2 補充說明 | ✅ Resolved（PO，2026-05-16） |
| A-3 | **「相對預設值」vs「相對部門配額」語意確認**：本次以「相對於 100% / 部門業務員人數」為預設值定義。**本 spec 採「100% = 部門業務員加總」基準**（即部門配額已分配後，加總 100%；參 OQ-E07-20 + US-113 Story 確認）。若 PO 後續要求改為「相對全名單絕對百分比」（例：部門配額 30%，4 人各預設 7.5%），則 §1 / §4 / §6 / §7 需重寫 | [ASSUMPTION] 待 PO；詳 open-questions.md OQ-E07-40 |
| A-4 | **`appliedTemplate` 欄位是否落 audit log**：本 spec 建議 F082 PUT 接收 `appliedTemplate` 後寫入 `assignment_audit_log.metadata` 以追蹤每筆業務員設定來自哪個模板套用 / 手動微調；具體 schema 由 system-architect 決議 | [ASSUMPTION] 待 system-architect |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（對應 US-113，E07 補修批次 5）：OQ-E07-20 確認 → 預設值 = 100% / 部門業務員人數（均等分配）+ 模板 ±10/20% 為相對預設值調整 + 套用後重新平衡；前端計算為主、後端二次校驗；新增 `BONUS_PENALTY_TEMPLATE_INVALID` 錯誤碼；§12 A-3 標 [ASSUMPTION] 待 OQ-E07-40 PO 確認 |
| v1.1 | 2026-05-16 | **E07 補修批次（PO 決議 F083-A 落地）**：(1) §6 BR-2 補連續套用語意（**僅相對於預設值**，不疊加目前 RATION）；(2) §12 A-2 升級為 ✅ Resolved；(3) 標頭 banner 更新；(4) UI 提示目前已套用模板（§7 「目前已套用：[{template}]」標記） |
| v1.2 | 2026-05-16 | **E07 補修（system-architect Phase 1 風險決議落地）**：新增 BR-11 cross-ref：本 Feature 無獨立後端端點，月跑並發守衛 + Feature Flag fallback 沿用 F082 端點行為 |
| **v1.3** | **2026-05-16** | **【救援重寫 / 編碼事故修復】**：依 US-113 + F082 v1.3 + AD-E07 v3.0 一致性決議完整重建本檔；Guard 引用對齊新體系（`DirectorGuard` / `DirectorOrSectionChiefGuard` / `SectionChiefScopeGuard`）；廢除 `SalesManagerGuard` 引用；business_role 欄位語意對齊 F074 v2.0 |
