---
spec-id: F095
title: 名單套用之系統特例規則前端唯讀呈現（appliedSpecialRules[] 讀時推導）
feature-id: F095
source-story: AD 驅動（AD-E07-26 §26.5）
epic: E07
module: M01 名單定義（特例規則透明呈現）
priority: P1
version: "1.0"
date: 2026-05-27
status: Draft
---

# F095: 名單套用之系統特例規則前端唯讀呈現（appliedSpecialRules[]）

Priority: P1 | Status: Draft | Last Updated: 2026-05-27

> **v1.0（2026-05-27 / AD-E07-26 §26.5 前端唯讀 API 契約）**：依 [architecture-spec.md AD-E07-26 v1.1 §26.5](../architecture-spec.md)（DP-AD26-3 Resolved）落地。名單詳情 / 篩選頁以**唯讀資訊區塊**呈現「此名單本次月跑套用之系統特例規則」（詐騙白牌 / 機車期中 / 期中小資 / 年以上）。後端依名單 `list_nm` **讀時推導**（read-time derivation）回傳 `appliedSpecialRules[]`，**不新建任何 DB 欄位**。推導 trigger 判斷與 [F091 v2.0 `applyListNmSpecialDeletes`](F091-stage1-complete-month-cnt-dedup-special-delete.md) **共用同一 pure utility**，確保 UI 顯示與實際月跑套用之規則一致。
>
> **Phase 對應**：屬單源化 / 特例修正工程之 **Phase A**（與 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 trigger 修正同批 deploy；UI 顯示之規則須反映修正後之正確 trigger）。本 feature 為唯讀呈現，**不改變任何月跑行為 / 案件數**。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md`（AD-E07-26 §26.5 為權威）、不新建 DB 欄位 / migration（DP-AD26-3 明確「本輪不新建 DB 欄位」）；不撰寫 code / test（由 tdd-implementation 落地）。**本 feature 涉及前端新增唯讀資訊區塊，但既有 prototype（`prototypes/27-list-definition.html` / `prototypes/27b-list-edit-draft.html`）尚無此區塊** → 見 §7 之 prototype 落差標注（須 UI/UX 補 prototype 或由 tdd 依本 spec §7 版面規範實作）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [architecture-spec.md AD-E07-26 §26.5](../architecture-spec.md)（**API 契約權威** + 推導偽碼）+ [F091 v2.0 AC-7 / §5.3](F091-stage1-complete-month-cnt-dedup-special-delete.md)（共用 trigger pure utility）+ `apps/api/src/modules/assignment-list/assignment-list.controller.ts`（list 詳情端點） |
| QA / Tester | 本文件（§4 AC）+ [F091 §5.3 規則表](F091-stage1-complete-month-cnt-dedup-special-delete.md) |
| UI/UX Designer | 本文件 §7 + `prototypes/27-list-definition.html` / `prototypes/27b-list-edit-draft.html`（唯讀區塊版面，**須補 prototype**） |

---

## 1. 功能摘要

名單詳情 / 篩選頁新增一個**唯讀資訊區塊**「此名單套用之系統特例規則」，列出本名單本次月跑實際套用的特例排除規則（每筆含規則代號 + 人類可讀排除說明 + 是否全名單強制）。資料來源為後端 list 詳情 API 回傳之 `appliedSpecialRules[]`，由 Service 層依 `list_nm` **讀時推導**（無新 DB 欄位）。推導使用之 trigger 判斷與 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 月跑實際套用之 trigger 為**同一份 pure utility**，故 UI 顯示與實際行為保證一致。

此功能提升透明度：業務人員可在名單頁直接看到「為何此名單會排除某些案件」，無需查 SP 或程式碼。

## 2. 使用者故事

**As a** 業務部長 / 分派維運人員
**I want** 在名單詳情頁看到本名單會套用哪些系統特例排除規則（如「機車期中滿期前3個月排除」「詐騙白牌排除」），以及人類可讀的排除說明
**So that** 我能理解為何分派案件數較預期少，並確認系統特例規則符合此名單的業務意圖

## 3. 前置條件

- [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 trigger 判斷 pure utility（`matchesSpecialRule` / `deriveAppliedSpecialRules`）可用且為共用實作
- 名單詳情 API 端點可用（既有 `GET /api/v1/assignment/lists`（list items）/ `GET /api/v1/assignment/lists/:listNo/full-snapshot`（詳情）；端點對齊見 §5.0）
- `ob_list_definition.list_nm` 可由 API 取得（推導輸入）

## 4. 驗收標準

### AC-1：後端讀時推導 `appliedSpecialRules[]`（無新 DB 欄位）

- **Given** 某名單之 `list_nm`
- **When** 前端取得名單詳情（§5.0 端點）
- **Then** API response 含 `appliedSpecialRules: AppliedSpecialRule[]`，由 Service 層依 `list_nm` 即時推導（read-time），**無讀取任何新 DB 欄位**（AD-E07-26 §26.5 / DP-AD26-3）
- **And** 推導邏輯對齊 [AD-E07-26 §26.5 `deriveAppliedSpecialRules` 偽碼](../architecture-spec.md)：
  - `R-FRAUD-WHITEBOARD`：**無條件**加入（所有名單，`isSystemMandatory: true`）
  - `R-PERIOD-MOTORCYCLE`：`list_nm.includes('期中') && list_nm.includes('機車')` → 加入（`isSystemMandatory: false`）
  - `R-PERIOD-XIAOZI`：`list_nm.includes('期中')` → 加入（`isSystemMandatory: false`）
  - `R-YEAR-ABOVE`：`list_nm.includes('年以上')` → 加入（`isSystemMandatory: false`）

### AC-2：每筆規則含代號 + 人類可讀說明 + 強制標記

- **Given** 推導出的某條規則
- **When** 序列化為 `AppliedSpecialRule`
- **Then** 每筆含 `ruleId`（代號，§5.1 enum）、`ruleName`（中文名稱，供前端直接顯示）、`isSystemMandatory`（true = 全名單強制套用 / 前端顯示為不可關閉之系統規則）
- **And**（建議補充）每筆含 `exclusionDescription`（人類可讀排除說明，描述「排除什麼樣的案件」，見 §5.1 / §5.3）

### AC-3：與月跑實際套用一致（共用 trigger pure utility）

- **Given** 同一名單同時被 [F091 v2.0 月跑 `applyListNmSpecialDeletes`](F091-stage1-complete-month-cnt-dedup-special-delete.md) 與本 feature `deriveAppliedSpecialRules` 處理
- **When** 比對「月跑實際套用之規則 ID 集合」與「API 回傳之 `appliedSpecialRules[].ruleId` 集合」
- **Then** 兩者**完全一致**（trigger 判斷為同一 pure utility，[F091 AC-7](F091-stage1-complete-month-cnt-dedup-special-delete.md) / AD-E07-26 §26.5 注意段）
- **And** trigger 判斷修正後（[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)：期中機車 / 期中 / 年以上），API 顯示亦自動正確（含「中結」「年資」之名單**不再**顯示誤判規則，僅顯示無條件之詐騙白牌）

### AC-4：前端唯讀資訊區塊呈現

- **Given** API 回傳 `appliedSpecialRules[]`
- **When** 名單詳情 / 篩選頁渲染
- **Then** 顯示唯讀資訊區塊「此名單套用之系統特例規則」（標題 + 規則清單）
- **And** 每筆規則顯示 `ruleName` + `exclusionDescription`（排除說明）
- **And** `isSystemMandatory: true` 之規則（詐騙白牌）以系統強制樣式呈現（如灰色標籤 / 「系統強制」標記，不可關閉、無操作）
- **And** 此區塊為**純唯讀**：無任何編輯 / 切換 / 刪除操作（本輪不提供規則開關，符合 DP-AD26-3「不新建 DB 欄位」）

### AC-5：空集合處理

- **Given** 某名單 `list_nm` 不含任何 list_nm-based trigger 關鍵字（期中 / 機車 / 年以上）
- **When** 推導 `appliedSpecialRules[]`
- **Then** 至少含 `R-FRAUD-WHITEBOARD`（無條件規則永遠存在）；`appliedSpecialRules` **不為空陣列**
- **And** 前端區塊至少顯示「詐騙白牌排除（系統強制）」一筆

## 5. API 規格

### 5.0 端點對齊（重要）

> [AD-E07-26 §26.5](../architecture-spec.md) 之契約寫為 `GET /api/v1/assignment-lists/:listNo`，但實際 controller prefix 為 **`assignment/lists`**（`@Controller('assignment/lists')`），且目前**無 `GET /:listNo` 純詳情端點**（既有為 `GET /` list items 與 `GET /:listNo/full-snapshot` 詳情）。本 feature 採行如下對齊（行為驗收不變，取得管道明確化）：

| 取得管道 | 端點 | 變更 |
|---|---|---|
| 名單詳情（建議主要管道）| `GET /api/v1/assignment/lists/:listNo/full-snapshot` | response 補 `appliedSpecialRules[]` |
| 名單清單（每筆，選用）| `GET /api/v1/assignment/lists`（每筆 item）| 每筆 item 補 `appliedSpecialRules[]`（清單頁亦可顯示時用；若效能考量可僅在詳情提供）|

> **[ASSUMPTION] A-1**：實際暴露 `appliedSpecialRules[]` 之端點（full-snapshot 詳情 / list items 其一或兩者）由 tdd-implementation 依前端唯讀區塊所在頁面（§7）與既有 controller 結構決定；行為驗收以「名單詳情頁能取得正確 `appliedSpecialRules[]`」為準。AD-E07-26 §26.5 之 `assignment-lists/:listNo` 路徑視為概念契約，實際路徑以 `assignment/lists` prefix 對齊。

### 5.1 `AppliedSpecialRule` 形狀（對齊 AD-E07-26 §26.5）

```typescript
interface AppliedSpecialRule {
  /** 規則代號 */
  ruleId: 'R-FRAUD-WHITEBOARD' | 'R-PERIOD-MOTORCYCLE' | 'R-PERIOD-XIAOZI' | 'R-YEAR-ABOVE';
  /** 規則中文名稱，供前端直接顯示（AD-E07-26 §26.5）*/
  ruleName: string;
  /** 是否為全名單強制套用（true → 前端顯示為灰色不可關閉的系統規則）*/
  isSystemMandatory: boolean;
  /**
   * 人類可讀排除說明（描述「排除什麼樣的案件」）。
   * 本 feature 建議補入，供 UI 直接顯示排除語意（見 §5.3）。
   */
  exclusionDescription: string;
}

// list 詳情 response 補充欄位
interface ListSnapshotResponse {
  // ... 現有欄位 ...
  appliedSpecialRules: AppliedSpecialRule[];
}
```

### 5.2 推導邏輯（共用 pure utility，對齊 AD-E07-26 §26.5）

```typescript
function deriveAppliedSpecialRules(listNm: string): AppliedSpecialRule[] {
  const rules: AppliedSpecialRule[] = [];
  // R-FRAUD-WHITEBOARD 無條件套用（所有名單）
  rules.push({
    ruleId: 'R-FRAUD-WHITEBOARD',
    ruleName: '詐騙白牌排除',
    isSystemMandatory: true,
    exclusionDescription: '排除名單類別為期中（list_type=01）且規格名稱含「白牌」之案件',
  });
  if (listNm.includes('期中') && listNm.includes('機車'))
    rules.push({
      ruleId: 'R-PERIOD-MOTORCYCLE',
      ruleName: '機車期中滿期前3個月排除',
      isSystemMandatory: false,
      exclusionDescription: '排除已繳期數接近總期數減3（接近滿期）或申請號以 T/Y 開頭之案件',
    });
  if (listNm.includes('期中'))
    rules.push({
      ruleId: 'R-PERIOD-XIAOZI',
      ruleName: '期中小資最後七期排除',
      isSystemMandatory: false,
      exclusionDescription: '排除已繳期數超過總期數減8（最後七期）且規格名稱含「小資」之案件',
    });
  if (listNm.includes('年以上'))
    rules.push({
      ruleId: 'R-YEAR-ABOVE',
      ruleName: '年以上車齡超15年排除',
      isSystemMandatory: false,
      exclusionDescription: '排除出廠年份距今超過15年之案件',
    });
  return rules;
}
```

> **共用約束**：本函數之 trigger 判斷（`includes('期中')` 等）須與 [F091 v2.0 `applyListNmSpecialDeletes`](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 trigger 判斷**提取為同一 pure utility**（AD-E07-26 §26.5 注意段 / F091 AC-7），避免兩處不同步。`ruleName` / `exclusionDescription` 文案為前端顯示用，可由本函數提供或前端依 `ruleId` 對照。

### 5.3 規則排除說明對照（與 F091 §5.3 一致）

| ruleId | ruleName | 排除說明（exclusionDescription）| 觸發 |
|---|---|---|---|
| `R-FRAUD-WHITEBOARD` | 詐騙白牌排除 | 排除 `list_type='01' AND spec_name LIKE '%白牌%'` 之案件 | 無條件 |
| `R-PERIOD-MOTORCYCLE` | 機車期中滿期前3個月排除 | 排除 `payt_term >= deal_num−3` 或 `appl_no` 以 T/Y 開頭之案件 | `list_nm` 含「期中」+「機車」|
| `R-PERIOD-XIAOZI` | 期中小資最後七期排除 | 排除 `payt_num > deal_num−8` 且 `spec_name LIKE '%小資%'` 之案件 | `list_nm` 含「期中」|
| `R-YEAR-ABOVE` | 年以上車齡超15年排除 | 排除 `year_produ < 當年−15` 之案件 | `list_nm` 含「年以上」|

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **讀時推導，無新 DB 欄位**（DP-AD26-3）：`appliedSpecialRules[]` 由 Service 層依 `list_nm` 即時推導，不持久化、不新建 DB 欄位 |
| BR-2 | **共用 trigger pure utility**（AD-E07-26 §26.5 / F091 AC-7）：推導與月跑 `applyListNmSpecialDeletes` 共用同一 trigger 判斷，UI 顯示與實際行為保證一致 |
| BR-3 | **純唯讀**：本區塊無任何規則開關 / 編輯操作（本輪不提供結構化旗標控制，DP-AD26-3 延後）|
| BR-4 | **詐騙白牌恆存**：`R-FRAUD-WHITEBOARD` 為無條件規則，所有名單之 `appliedSpecialRules[]` 必含此筆（`isSystemMandatory: true`）|
| BR-5 | **顯示反映修正後 trigger**：UI 顯示須基於 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 修正後之正確 trigger（期中機車 / 期中 / 年以上），含「中結」「年資」名單不顯示誤判規則 |

## 7. UI/UX 需求

> ⚠️ **Prototype 落差標注**：既有 prototype（`prototypes/27-list-definition.html` 名單詳情、`prototypes/27b-list-edit-draft.html` 篩選條件編輯頁）**目前無「系統特例規則」唯讀資訊區塊**。本 feature 需要新增此區塊。依專案規範（UI 以 prototype 為 ground truth），**建議由 UI/UX 於上述 prototype 補入此唯讀區塊後再實作**；若直接由 tdd 實作，須依本 §7 版面規範並回報 prototype 落差待補。

- **位置**：名單詳情 / 篩選頁之篩選條件區塊**下方**，新增獨立唯讀資訊區塊（卡片 / panel）
- **區塊標題**：「此名單套用之系統特例規則」（或「系統特例排除規則」）
- **每筆規則呈現**：
  - 規則名稱（`ruleName`）為主標
  - 排除說明（`exclusionDescription`）為次要說明文字
  - `isSystemMandatory: true`（詐騙白牌）：灰色 / 系統強制樣式 + 「系統強制」標記，表示不可關閉
  - `isSystemMandatory: false`：一般唯讀標籤樣式（仍無操作）
- **空態**：至少顯示詐騙白牌一筆（AC-5），不會完全空白
- **唯讀**：無任何按鈕 / 開關 / 編輯入口（本輪僅呈現）
- **建議文案**：可於區塊頂部補一行說明「以下為系統依名單名稱自動套用之特例排除規則，影響本名單的月跑分派案件數」

## 8. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| `list_nm` 為 NULL / 空字串 | 推導僅回 `R-FRAUD-WHITEBOARD`（無條件規則）；前端正常顯示一筆 | AC-5 |
| API 未回 `appliedSpecialRules` 欄位（舊版）| 前端容錯：欄位缺失時隱藏整個區塊（漸進增強）；本 feature deploy 後欄位恆存 | — |
| trigger pure utility 與 F091 不同步 | 由 [F091 AC-7 一致性測試](F091-stage1-complete-month-cnt-dedup-special-delete.md)防護（CI 攔截）| [F091 §10](F091-stage1-complete-month-cnt-dedup-special-delete.md) |

## 9. 相依性

- **Blocked By**：[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（共用 trigger pure utility）
- **Blocks**：無
- **同批 deploy（Phase A）**：[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)、[F094](F094-monthly-run-result-table.md)

## 10. 交叉參考

- 架構決策：[architecture-spec.md AD-E07-26 §26.5 v1.1](../architecture-spec.md)（前端唯讀 API 契約 + 推導偽碼，**權威來源**）
- 共用 trigger：[F091 v2.0 AC-7 / §5.3](F091-stage1-complete-month-cnt-dedup-special-delete.md)（`applyListNmSpecialDeletes` / pure utility）
- 既有實作：`apps/api/src/modules/assignment-list/assignment-list.controller.ts`（`@Controller('assignment/lists')`，`GET /:listNo/full-snapshot`）
- prototype：`prototypes/27-list-definition.html` / `prototypes/27b-list-edit-draft.html`（**須補唯讀區塊**，見 §7）
- 相關功能：[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)、[F050](F050-create-list-definition.md) / [F051](F051-edit-list-definition.md)（名單篩選頁）、[F048](F048-view-list-definition.md)（名單詳情入口）

## 11. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 關鍵測試案例：
  - `deriveAppliedSpecialRules('期中機車5年')` → 含 R-FRAUD-WHITEBOARD + R-PERIOD-MOTORCYCLE + R-PERIOD-XIAOZI（期中機車兩規則均觸發）
  - `deriveAppliedSpecialRules('期中小資專案')` → 含 R-FRAUD-WHITEBOARD + R-PERIOD-XIAOZI（不含 MOTORCYCLE，無「機車」）
  - `deriveAppliedSpecialRules('5年以上名單')` → 含 R-FRAUD-WHITEBOARD + R-YEAR-ABOVE
  - `deriveAppliedSpecialRules('一般名單')` → 僅 R-FRAUD-WHITEBOARD（AC-5）
  - **bug fix 防回退**：`deriveAppliedSpecialRules('中結強案')` / `'年資5年'` → **僅** R-FRAUD-WHITEBOARD（不誤判 MOTORCYCLE / YEAR-ABOVE）
  - `list_nm` 為 NULL / '' → 僅 R-FRAUD-WHITEBOARD
  - **一致性測試**：對同一 `list_nm` 集合，`deriveAppliedSpecialRules` 推導之 ruleId 集合 === [F091 月跑 `applyListNmSpecialDeletes`](F091-stage1-complete-month-cnt-dedup-special-delete.md) 實際套用之 ruleId 集合（共用 pure utility，AC-3）
  - 每筆含 ruleId + ruleName + isSystemMandatory + exclusionDescription（AC-2）
  - API response 含 `appliedSpecialRules[]`（§5.0 端點）
- mock 契約注意（[記憶 feedback_mock_real_system_contract]）：`list_nm` mock 須含**真實中文**（期中 / 機車 / 小資 / 年以上），bug fix 防回退案例須含「中結」「年資」確認不誤判

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | 暴露 `appliedSpecialRules[]` 之實際端點（full-snapshot / list items）由 tdd 依前端區塊所在頁面決定；AD-E07-26 §26.5 之 `assignment-lists/:listNo` 路徑以實際 `assignment/lists` prefix 對齊 | [ASSUMPTION] |
| A-2 | `exclusionDescription` 文案由本 feature 提供建議版（§5.3）；最終措辭可由 UI/UX 微調，不影響 ruleId / isSystemMandatory 之行為驗收 | [ASSUMPTION] |
| A-3 | 唯讀區塊之 prototype 須由 UI/UX 補入既有 `27-list-definition.html` / `27b-list-edit-draft.html`；本輪以 §7 版面規範為實作依據，回報 prototype 落差 | [ASSUMPTION]（prototype 落差） |

## 13. Production 影響標注

- **本 feature 為唯讀呈現，不改變任何月跑行為 / 案件數**：`appliedSpecialRules[]` 為讀時推導，不影響 Stage 1 篩選邏輯。
- 屬 **Phase A**（與 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 同批 deploy）：UI 顯示之規則須反映 F091 v2.0 修正後之正確 trigger（期中機車 / 期中 / 年以上），故與 F091 同批上線可避免「UI 顯示舊規則 / 月跑套用新規則」之短暫不一致。
- 唯一可見變化：名單詳情 / 篩選頁新增「系統特例規則」唯讀資訊區塊（透明度提升）。
</content>
