---
type: test-design-feature
feature_id: F095
feature_name: 名單套用之系統特例規則前端唯讀呈現（appliedSpecialRules[] 讀時推導）
priority: P1
related_spec: /docs/specs/features/F095-applied-special-rules-readonly.md
spec_version: "1.0"
covers:
  - F095
  - AD-E07-26 §26.5
last_updated: 2026-05-27
---

# F095：名單套用之系統特例規則前端唯讀呈現（appliedSpecialRules[]）— 測試設計

> **測試設計重點（v1.0）**：
>
> 1. **後端推導正確性**：`deriveAppliedSpecialRules(list_nm)` pure function 對各類 `list_nm` 回傳正確規則集（四規則的觸發邏輯、`isSystemMandatory`、`ruleId`、`exclusionDescription`）
> 2. **觸發一致性（最關鍵）**：`deriveAppliedSpecialRules` 與 `applyListNmSpecialDeletes`（F091 月跑）共用同一 trigger pure utility — UI 顯示規則 = 月跑實際套用規則（防 UI/run drift）
> 3. **API 回傳 appliedSpecialRules[]**：list 詳情 / full-snapshot API 正確序列化
> 4. **前端唯讀 Component（RTL）**：呈現規則列表、無編輯控制項、`isSystemMandatory` 標籤分流
> 5. **空集合防護**：任何名單至少含 `R-FRAUD-WHITEBOARD`（無條件規則）
>
> **依賴**：F091 v2.0 `applyListNmSpecialDeletes` / `matchesSpecialRule` pure utility 已實作（F095 觸發判斷共用同一份）。`deriveAppliedSpecialRules` 不新建任何 DB 欄位（DP-AD26-3）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F095-applied-special-rules-readonly.md`（v1.0）+ `architecture-spec.md` AD-E07-26 §26.5（API 契約 + 推導偽碼）+ F091 v2.0 AC-7 §5.3（共用 trigger pure utility）+ `apps/api/src/modules/assignment-list/assignment-list.controller.ts`（list 詳情端點）|
| QA / Tester | 本文件 + F091 §5.3 規則表（AC-3~AC-6 ground truth）|
| UI/UX Designer | 本文件 §四（前端 Component RTL）+ `prototypes/27-list-definition.html`（唯讀區塊版面，**須補 prototype**）|

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Unit（`deriveAppliedSpecialRules` pure function 行為 + API 序列化）；Component（RTL：唯讀 UI 呈現 + 無編輯操作）|
| 一致性核心 | `deriveAppliedSpecialRules` trigger 判斷與 `applyListNmSpecialDeletes` 觸發邏輯**必須為同一份 pure utility**（AD-E07-26 §26.5 注意段；F091 AC-7）——一致性測試為本 feature 最重要場景 |
| Mock 注意 | 推導函式 mock `list_nm` 字串須含真實繁體中文（期中 / 機車 / 年以上 / 小資 / 白牌，對齊 F091 v2.0 BR-8）；API 測試須 mock AssignmentListService |
| 前端說明 | prototype 尚無 appliedSpecialRules 唯讀區塊（F095 §3 刻意未動）；前端 RTL 場景依 spec §7 版面規範設計 |

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F095-DR-001~007（deriveAppliedSpecialRules 純函式）| 7 | 高 | Unit（純函式）| 各 list_nm 組合 → 正確規則集；含空集合防護 |
| TS-F095-CON-001~003（一致性，關鍵）| 3 | 高 | Unit（共用 utility 驗證）| derive 與 apply 觸發邏輯完全一致 |
| TS-F095-API-001~003（API 序列化）| 3 | 高 | Integration（mock service / PG TC）| full-snapshot API 含 appliedSpecialRules[] |
| TS-F095-FE-001~005（前端 Component RTL）| 5 | 高 | Component（RTL）| 呈現規則 / 無編輯 / 系統強制標籤 / 空集合 |

---

## 一、deriveAppliedSpecialRules 推導正確性

> **設計依據**：F095 AC-1 / AC-2；AD-E07-26 §26.5（推導偽碼）；F091 v2.0 §5.3 規則對照表

---

### TS-F095-DR-001：一般名單 — 僅含 R-FRAUD-WHITEBOARD（無條件規則）

- **關聯需求**：F095 AC-1（`R-FRAUD-WHITEBOARD` 無條件，`isSystemMandatory: true`）；AC-5（空集合防護）
- **測試類型**：Positive / Unit
- **測試層**：Unit（`deriveAppliedSpecialRules` 純函式）
- **前置條件**：`list_nm = '一般催收名單'`（不含「期中」/「機車」/「年以上」任何觸發字）
- **步驟**：
  1. 呼叫 `deriveAppliedSpecialRules('一般催收名單')`
  2. 驗證結果陣列長度與內容
- **預期結果**：
  - 結果陣列長度 = 1（僅 `R-FRAUD-WHITEBOARD`）
  - `rules[0].ruleId = 'R-FRAUD-WHITEBOARD'`
  - `rules[0].isSystemMandatory = true`
  - `rules[0].ruleName = '詐騙白牌排除'`（或等效中文名）
  - `rules[0].exclusionDescription` 非空字串（含「白牌」排除語意說明）

---

### TS-F095-DR-002：含「期中機車」名單 — 含三條規則

- **關聯需求**：F095 AC-1（`R-PERIOD-MOTORCYCLE`：含「期中」+「機車」；`R-PERIOD-XIAOZI`：含「期中」）；AC-2
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list_nm = '機車期中催收名單'`（含「機車」+「期中」）
- **步驟**：
  1. 呼叫 `deriveAppliedSpecialRules('機車期中催收名單')`
  2. 驗證結果陣列長度與 ruleId 集合
- **預期結果**：
  - 結果陣列長度 = 3：`R-FRAUD-WHITEBOARD`（無條件）+ `R-PERIOD-MOTORCYCLE`（含「期中」+「機車」）+ `R-PERIOD-XIAOZI`（含「期中」）
  - 順序依照 spec §5.2 推導偽碼順序（fraud → motorcycle → xiaozi）
  - `R-PERIOD-MOTORCYCLE.isSystemMandatory = false`
  - `R-PERIOD-XIAOZI.isSystemMandatory = false`
- **設計說明**：「期中機車」名單同時觸發 MOTORCYCLE + XIAOZI（與 F091 月跑雙重套用邏輯一致）

---

### TS-F095-DR-003：含「期中」但不含「機車」名單 — 含兩條規則

- **關聯需求**：F095 AC-1（`R-PERIOD-XIAOZI` 觸發：僅需含「期中」）
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list_nm = '期中個人信貸名單'`（含「期中」，不含「機車」）
- **步驟**：
  1. 呼叫 `deriveAppliedSpecialRules('期中個人信貸名單')`
  2. 驗證結果陣列
- **預期結果**：
  - 長度 = 2：`R-FRAUD-WHITEBOARD` + `R-PERIOD-XIAOZI`
  - **不含** `R-PERIOD-MOTORCYCLE`（未觸發，缺「機車」）
  - `R-PERIOD-XIAOZI.exclusionDescription` 含「小資」排除語意說明

---

### TS-F095-DR-004：含「年以上」名單 — 含兩條規則

- **關聯需求**：F095 AC-1（`R-YEAR-ABOVE`：含「年以上」）
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list_nm = '5年以上車主催收名單'`（含「年以上」）
- **步驟**：
  1. 呼叫 `deriveAppliedSpecialRules('5年以上車主催收名單')`
  2. 驗證結果
- **預期結果**：
  - 長度 = 2：`R-FRAUD-WHITEBOARD` + `R-YEAR-ABOVE`
  - `R-YEAR-ABOVE.isSystemMandatory = false`
  - `R-YEAR-ABOVE.exclusionDescription` 含「15年」或「出廠年份」排除語意說明

---

### TS-F095-DR-005：全觸發名單 — 含四條規則

- **關聯需求**：F095 AC-1~AC-2（全觸發組合）
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list_nm = '機車期中小資5年以上催收名單'`（含「機車」+「期中」+「年以上」，全觸發）
- **步驟**：
  1. 呼叫 `deriveAppliedSpecialRules('機車期中小資5年以上催收名單')`
  2. 驗證結果陣列長度與 ruleId 集合
- **預期結果**：
  - 長度 = 4：`R-FRAUD-WHITEBOARD` + `R-PERIOD-MOTORCYCLE` + `R-PERIOD-XIAOZI` + `R-YEAR-ABOVE`
  - 順序依照 spec §5.2 偽碼（fraud → motorcycle → xiaozi → year-above）
  - 各 ruleId、ruleName、isSystemMandatory 均正確

---

### TS-F095-DR-006：含 v1.0 誤判關鍵字名單 — 不顯示誤判規則（Regression）

- **關聯需求**：F095 AC-3（「觸發條件修正後，API 顯示亦自動正確：含「中結」「年資」之名單不再顯示誤判規則」）；F091 v2.0 BR-8
- **測試類型**：Regression / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list_nm = '中結強案年資催收名單'`（v1.0 誤判觸發）
- **步驟**：
  1. 呼叫 `deriveAppliedSpecialRules('中結強案年資催收名單')`
  2. 驗證結果不含 v1.0 誤判規則
- **預期結果**：
  - 長度 = 1（僅 `R-FRAUD-WHITEBOARD`）
  - **不含** `R-PERIOD-MOTORCYCLE` / `R-PERIOD-XIAOZI` / `R-YEAR-ABOVE`（v2.0 修正後不觸發）
  - 舊 v1.0 誤判行為不再出現

---

### TS-F095-DR-007：AppliedSpecialRule 物件欄位完整性

- **關聯需求**：F095 AC-2（「每筆含 ruleId + ruleName + isSystemMandatory + exclusionDescription」）；AD-E07-26 §26.5
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：呼叫 `deriveAppliedSpecialRules` 任一有效 list_nm
- **步驟**：
  1. 取回傳陣列中任一規則物件
  2. 驗證 TypeScript interface 所有必填欄位存在且非 empty
- **預期結果**：
  - 每筆規則均含：
    - `ruleId`：`'R-FRAUD-WHITEBOARD' | 'R-PERIOD-MOTORCYCLE' | 'R-PERIOD-XIAOZI' | 'R-YEAR-ABOVE'` 之一
    - `ruleName`：非空字串（如「詐騙白牌排除」）
    - `isSystemMandatory`：boolean（`R-FRAUD-WHITEBOARD` 為 true，其餘為 false）
    - `exclusionDescription`：非空字串（人類可讀排除說明）
  - 不存在缺少任一欄位的規則物件

---

## 二、觸發一致性（最關鍵場景）

> **設計依據**：F095 AC-3；F091 v2.0 AC-7；AD-E07-26 §26.5 注意段（「trigger 判斷須提取為 pure utility，供兩者共用」）

---

### TS-F095-CON-001：共用 pure utility — deriveAppliedSpecialRules 與 applyListNmSpecialDeletes 呼叫同一 matchesSpecialRule

- **關聯需求**：F095 AC-3；F091 v2.0 AC-7（BR-5）；AD-E07-26 §26.5
- **測試類型**：Positive / Unit（靜態驗證）
- **測試層**：Unit（原始碼 import 路徑 + 函式引用）
- **前置條件**：`stage1-filter-chain.ts` + `assignment-list.service.ts`（或等效 derive 函式所在模組）均已實作
- **步驟**：
  1. 確認 `deriveAppliedSpecialRules` 的 trigger 判斷邏輯（`list_nm.includes('期中')` 等）使用與 `applyListNmSpecialDeletes` 相同的 `matchesSpecialRule` utility（或等效共用函式）
  2. 確認兩個函式 **import 同一個** utility 模組（非各自獨立實作）
  3. 使用 `grep` 確認不存在兩處各自定義 `includes('期中')` 之重複觸發判斷
- **預期結果**：
  - `deriveAppliedSpecialRules` 與 `applyListNmSpecialDeletes` 引用同一份 trigger pure utility（`matchesSpecialRule` 或等效）
  - 不存在兩份獨立的 trigger 判斷（防 UI/run drift）
  - 任何未來修改 trigger 條件只需改一處

---

### TS-F095-CON-002：相同 list_nm — derive 回傳規則集 = apply 實際套用規則集

- **關聯需求**：F095 AC-3（「月跑實際套用之規則 ID 集合 = API 回傳之 appliedSpecialRules[].ruleId 集合」）
- **測試類型**：Positive / Integration（一致性驗證）
- **測試層**：Unit（純函式，對比兩個函式回傳值）
- **前置條件**：`deriveAppliedSpecialRules` 和 `applyListNmSpecialDeletes` 均已實作
- **步驟**：
  1. 以 `list_nm = '機車期中小資名單'` 呼叫 `deriveAppliedSpecialRules('機車期中小資名單')`，取 `ruleId` 集合 `Set A`
  2. 以 pool（含各規則條件之案件）+ 相同 `list_nm` 呼叫 `applyListNmSpecialDeletes`，記錄實際套用的規則（哪條規則觸發 → 哪條 DELETE 執行），取 `ruleId` 集合 `Set B`
  3. 比對 `Set A === Set B`
- **預期結果**：
  - `Set A`（API 推導）= `Set B`（月跑實際套用），完全相等
  - 兩集合均含：`R-FRAUD-WHITEBOARD`, `R-PERIOD-MOTORCYCLE`, `R-PERIOD-XIAOZI`（不含 `R-YEAR-ABOVE`，因 list_nm 不含「年以上」）

---

### TS-F095-CON-003：trigger 修正後 derive 同步正確（v1.0 誤判名單不再顯示誤判規則）

- **關聯需求**：F095 AC-3（「trigger 判斷修正後，API 顯示亦自動正確」）；F091 v2.0 BR-8
- **測試類型**：Regression / Unit
- **測試層**：Unit（純函式，同 TS-F095-DR-006 行為面驗證）
- **前置條件**：`list_nm = '中結強案年資催收名單'`（v1.0 誤判觸發）；F091 v2.0 trigger utility 已修正
- **步驟**：
  1. `Set A = deriveAppliedSpecialRules('中結強案年資催收名單')` 之 ruleId 集合
  2. `Set B = applyListNmSpecialDeletes` 對此名單實際套用之規則集合
  3. 比對 `Set A === Set B`
- **預期結果**：
  - `Set A = Set B = { 'R-FRAUD-WHITEBOARD' }`（僅無條件規則）
  - 兩者一致，均不含 v1.0 誤判的 MOTORCYCLE / XIAOZI / YEAR-ABOVE 規則

---

## 三、API 回傳 appliedSpecialRules[]

> **設計依據**：F095 AC-1；§5.0 端點對齊（`GET /api/v1/assignment/lists/:listNo/full-snapshot` 補 `appliedSpecialRules[]`）

---

### TS-F095-API-001：full-snapshot API 回應含 appliedSpecialRules[]

- **關聯需求**：F095 AC-1；§5.0 端點對齊（full-snapshot 詳情端點）；AD-E07-26 §26.5
- **測試類型**：Positive / Integration
- **測試層**：Integration（mock AssignmentListService / 或真實 DB seed）
- **前置條件**：
  - 名單 `list_no = 'OB202605001'`，`list_nm = '機車期中催收名單'`（含「機車」+「期中」）
  - `GET /api/v1/assignment/lists/OB202605001/full-snapshot` 端點已補入 `appliedSpecialRules[]`
- **步驟**：
  1. 呼叫 `GET /api/v1/assignment/lists/OB202605001/full-snapshot`
  2. 驗證 response body 含 `appliedSpecialRules` 陣列
  3. 驗證陣列成員
- **預期結果**：
  - `response.appliedSpecialRules` 存在，為陣列
  - 長度 = 3（`R-FRAUD-WHITEBOARD` + `R-PERIOD-MOTORCYCLE` + `R-PERIOD-XIAOZI`）
  - 每筆含 `ruleId` / `ruleName` / `isSystemMandatory` / `exclusionDescription`
  - **不含任何 DB 欄位讀取**（read-time derivation，僅依 list_nm）

---

### TS-F095-API-002：full-snapshot API — 無新 DB 欄位讀取（推導為 read-time）

- **關聯需求**：F095 AC-1（「無讀取任何新 DB 欄位」，DP-AD26-3）；AD-E07-26 §26.5
- **測試類型**：Positive / Unit（靜態分析）
- **測試層**：Unit（原始碼 grep）
- **前置條件**：`assignment-list.service.ts`（或 controller）的 full-snapshot handler 已實作
- **步驟**：
  1. 確認 `deriveAppliedSpecialRules` 函式僅接受 `list_nm: string` 作為輸入
  2. 確認函式實作**不含** `await`、DB query、`repository.find`、SQL 等非同步或 DB 操作
  3. 確認函式為純函式（相同輸入永遠相同輸出）
- **預期結果**：
  - `deriveAppliedSpecialRules` 為純函式，無 DB 依賴
  - 不新增任何 DB 欄位或 migration

---

### TS-F095-API-003：API RBAC — 需 authenticated user（401 防護）

- **關聯需求**：F095 §5.0（既有端點沿用既有 RBAC）；AC-1
- **測試類型**：Negative / Integration
- **測試層**：Integration（mock / E2E）
- **前置條件**：無有效 JWT Token
- **步驟**：
  1. 呼叫 `GET /api/v1/assignment/lists/OB202605001/full-snapshot`，不帶 Authorization header
  2. 驗證 HTTP response code
- **預期結果**：
  - HTTP 401（未認證，沿用既有 full-snapshot 端點 RBAC）
  - `appliedSpecialRules` 不洩漏（401 直接拒絕）

---

## 四、前端唯讀 Component（RTL）

> **設計依據**：F095 AC-4；§7 版面規範（prototype 尚無此區塊，依 spec §7 實作）
> **注意**：Component 名稱假設為 `AppliedSpecialRulesPanel`；實際命名由 tdd-implementation 決定。

---

### TS-F095-FE-001：呈現規則清單（ruleName + exclusionDescription）

- **關聯需求**：F095 AC-4（「每筆規則顯示 `ruleName` + `exclusionDescription`」）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component（React Testing Library）
- **前置條件**：
  - mock `appliedSpecialRules = [{ ruleId: 'R-FRAUD-WHITEBOARD', ruleName: '詐騙白牌排除', isSystemMandatory: true, exclusionDescription: '排除 list_type=01 且規格名稱含「白牌」之案件' }, { ruleId: 'R-PERIOD-MOTORCYCLE', ruleName: '機車期中滿期前3個月排除', isSystemMandatory: false, exclusionDescription: '排除 payt_term >= deal_num−3 或 appl_no 以 T/Y 開頭之案件' }]`
- **步驟**：
  1. render `<AppliedSpecialRulesPanel rules={mockRules} />`
  2. 驗證 DOM 內容
- **預期結果**：
  - DOM 中可見「詐騙白牌排除」文字
  - DOM 中可見「機車期中滿期前3個月排除」文字
  - DOM 中可見兩條 `exclusionDescription` 文字
  - 區塊標題含「此名單套用之系統特例規則」或等效文字

---

### TS-F095-FE-002：純唯讀 — 無任何編輯 / 切換 / 刪除操作

- **關聯需求**：F095 AC-4（「此區塊為純唯讀：無任何編輯 / 切換 / 刪除操作」）；DP-AD26-3
- **測試類型**：Negative / Component（RTL）
- **測試層**：Component（RTL）
- **前置條件**：同 FE-001 之 mock 資料
- **步驟**：
  1. render `<AppliedSpecialRulesPanel rules={mockRules} />`
  2. 在 DOM 中搜尋所有 `input`、`button`（非連結）、`select`、`checkbox`、`switch` 元素
  3. 搜尋「編輯」/「刪除」/「關閉」/「停用」等操作性文字
- **預期結果**：
  - DOM 中**不存在** input / select / checkbox / switch 元素
  - 不存在任何「編輯」/「刪除」/「關閉」/「停用」操作按鈕
  - 如有「關閉」按鈕，須為 Modal 關閉（非規則關閉），且此元素應明確標示
  - 區塊為純資訊呈現（HTML tag 類型確認，非 interactive）

---

### TS-F095-FE-003：isSystemMandatory 標籤分流（系統強制 vs 名稱觸發）

- **關聯需求**：F095 AC-4（「`isSystemMandatory: true` 以系統強制樣式呈現：如灰色標籤 / 「系統強制」標記，不可關閉」）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component（RTL）
- **前置條件**：mock rules 含 `isSystemMandatory: true`（`R-FRAUD-WHITEBOARD`）與 `isSystemMandatory: false`（`R-PERIOD-MOTORCYCLE`）
- **步驟**：
  1. render `<AppliedSpecialRulesPanel rules={mockRules} />`
  2. 驗證 `R-FRAUD-WHITEBOARD` 的 DOM 元素含「系統強制」標籤或等效 aria-label / data-testid
  3. 驗證 `R-PERIOD-MOTORCYCLE` 的 DOM 元素**不含**「系統強制」標籤（名稱觸發）
- **預期結果**：
  - 系統強制規則（R-FRAUD-WHITEBOARD）有明確的「系統強制」視覺標記
  - 名稱觸發規則（R-PERIOD-MOTORCYCLE）無「系統強制」標記
  - 兩類標籤樣式可明確區分

---

### TS-F095-FE-004：空集合防護 — 仍顯示 R-FRAUD-WHITEBOARD

- **關聯需求**：F095 AC-5（「`appliedSpecialRules` 不為空陣列，至少含 `R-FRAUD-WHITEBOARD`」）
- **測試類型**：Negative / Component（RTL）
- **測試層**：Component（RTL）
- **前置條件**：mock `appliedSpecialRules = [{ ruleId: 'R-FRAUD-WHITEBOARD', ruleName: '詐騙白牌排除', isSystemMandatory: true, exclusionDescription: '...' }]`（僅含詐騙白牌）
- **步驟**：
  1. render `<AppliedSpecialRulesPanel rules={mockRules} />`
  2. 確認 DOM 顯示「詐騙白牌排除」
  3. 確認 DOM 不顯示「尚無規則」/「無套用規則」等空狀態文字
- **預期結果**：
  - 即使只有一條規則，仍正常顯示（不顯示空狀態）
  - 「詐騙白牌排除」可見

---

### TS-F095-FE-005：Component 與 API 資料串接（Integration Component test）

- **關聯需求**：F095 AC-1 + AC-4（API 資料 → 前端顯示流程）
- **測試類型**：Positive / Component（RTL + mock API）
- **測試層**：Component（RTL，mock fetch / axios）
- **前置條件**：
  - mock `GET /api/v1/assignment/lists/OB202605001/full-snapshot` 回傳 `{ ..., appliedSpecialRules: [{ ruleId: 'R-FRAUD-WHITEBOARD', ... }, { ruleId: 'R-YEAR-ABOVE', ... }] }`
  - 名單詳情頁或相關父 Component 可 render
- **步驟**：
  1. render 名單詳情頁（含 mock API）
  2. 等待 API 回傳（mock fulfilled）
  3. 驗證唯讀區塊顯示兩條規則
- **預期結果**：
  - 「詐騙白牌排除」與「年以上車齡超15年排除」均顯示
  - 不顯示任何 loading 錯誤或空白
  - 不顯示 `R-PERIOD-MOTORCYCLE` / `R-PERIOD-XIAOZI`（API 未回傳）

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F095-DR-001~007（deriveAppliedSpecialRules 純函式）| 高 | 純函式，無 DB；直接 unit 測試；mock list_nm 必須含真實繁體中文 |
| TS-F095-CON-001~003（觸發一致性）| 高 | CON-001 靜態 import 路徑驗證；CON-002~003 純函式比對兩函式輸出 |
| TS-F095-API-001~002（API 回傳 + read-time）| 高（API-001 需 mock service）| API-002 為靜態分析；API-001 mock AssignmentListService |
| TS-F095-API-003（RBAC 401）| 高 | E2E 或 Integration mock 均可 |
| TS-F095-FE-001~005（前端 Component RTL）| 高 | RTL 測試；prototype 缺少唯讀區塊，依 spec §7 版面規範設計 |
