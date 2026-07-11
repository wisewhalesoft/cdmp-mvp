---
spec-id: F106
title: 顯示停用計分維度並支援重新啟用（M02 Tab 2）
feature-id: F106
source-story: US-164
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.0"
date: 2026-06-25
status: Draft
---

# F106: 顯示停用計分維度並支援重新啟用（M02 Tab 2）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-25

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model`（`ob_levelcard_column` / `assignment_audit_log`）+ `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `features/F054-edit-scoring-dimension.md`（停用端點對稱基準） |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求）+ `prototypes/28-scoring-config.html` Tab 2 |
| Architect | 本文件 + `architecture-spec.md` §3.10（M02 計分設定） |

---

## 1. 功能摘要

打通「停用計分維度」在 M02 Tab 2（計分維度）的可見性與自助修復管線，與既有 F054「停用維度」對稱補完：

1. **後端讀取**：`getScoring()` 維度查詢由「只回 `status='active'`」改為「一律回傳 active + inactive 全部維度」，且每個 dimension 物件補上 `status` 欄位（`'active'` / `'inactive'`）。
2. **後端寫入**：新增「啟用」端點 `PUT /assignment/scoring/dimensions/:columnName/enable`，行為**完全對稱**於既有 `PUT .../disable`（同權限、同 feature flag、同月名單分派鎖、同 audit log、同 404 語意，僅狀態方向相反）。
3. **前端**：Tab 2 維度清單同時顯示 inactive 列（既有 active/inactive chip 樣式已就緒），操作欄對 inactive 列顯示「啟用」按鈕（對稱既有「停用」），月名單分派鎖定時一併鎖定。

本功能修復的實害：H 卡 `SALES_STS` 維度曾被誤標 `inactive`，因 UI 完全隱形而月名單分派計分長期少一維、無人察覺，最終靠 migration `m302`（`ActivateHSalesStsScoringColumn`）以資料庫遷移手動修回。本功能消除此盲區——讓停用維度可見、可被部長自助啟用。

**本功能不改計分採計範圍**：計分引擎 / `fn_calc_tier_level` 仍只採 `status='active'` 維度，inactive 維度雖在清單顯示但不參與計分（與既有行為一致）。本功能只改「可見性 + 啟用」。

## 2. 使用者故事

**As a** 業務主管（部長 / 處長）
**I want** 在計分維度清單同時看到停用（inactive）的維度（含狀態標示），並能對停用維度執行「啟用」操作
**So that** 當某維度被誤停用或需重新納入評分時，我能在設定頁直接發現並自助修復，不必依賴 IT 進 DB 改 `status`，避免計分長期少一維而無人察覺

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token。
- 讀取（含查看 inactive 維度）：`businessRole IN ('director', 'section_chief', 'admin')`（沿用 class 級 `DirectorOrSectionChiefGuard`）。
- 寫入（啟用 / 停用）：`businessRole='director'`（沿用寫入 method 級 `DirectorGuard`，M02 計分卡寫入限部長，依 F002 §4.6.2）。
- F069 Tab 1 已選中某 CARD_TYPE，且該 CARD_TYPE 於 `ob_card_type.status='active'`。
- 該 CARD_TYPE 於 `ob_levelcard_version` 至少有一筆 `status='active'` 版本紀錄。
- 啟用操作成立另需：當下 `assignment_run` 無 `status IN ('pending','running')` 紀錄（否則月名單分派鎖 → 409）。

## 4. 驗收標準

### AC-1：維度清單同時顯示 active 與 inactive 維度

- **Given** 業務主管在 Tab 1 已選中某 CARD_TYPE，其 active 計分版本同時含 active 與 inactive 維度
- **When** 切換至 Tab 2（計分維度）且頁面載入完成
- **Then** 維度清單**同時列出該版本的 active 與 inactive 維度**（不再只顯示 active）
- **And** 每列「狀態」欄正確標示：active 顯示綠色 `active` chip、inactive 顯示灰色 `inactive` chip
- **And** inactive 維度列以列級視覺弱化（灰底）與 active 列明顯區隔（具體視覺由 UI/UX 階段依設計系統定義；前端 chip 樣式已就緒，需補列級弱化）

### AC-2：後端維度查詢回傳含 inactive 且帶每維度 `status`

- **Given** 前端呼叫 `GET /api/v1/assignment/scoring?cardType={X}`
- **When** 該 CARD_TYPE 的 active 版本下存在 inactive 維度
- **Then** 回應 `dimensions[]` **同時包含 active 與 inactive 維度**（移除 `getScoring()` 維度查詢的 `status='active'` 過濾，**OQ-164-2 決議：一律回傳全部，不引入 `?includeInactive` 參數**）
- **And** 每個 dimension 物件**必含 `status` 欄位**，值為 `'active'` 或 `'inactive'`
- **And** 前端不再依賴 `?? 'active'` 防禦性 fallback（移除該 fallback，改用後端回傳的真實 `status` 渲染）
- **And** inactive 維度雖在清單顯示，但**不影響月名單分派計分**（計分引擎 / `fn_calc_tier_level` 仍只採 `status='active'` 維度——本功能不改「計分採計範圍」）

### AC-3：對停用維度執行「啟用」

- **Given** 業務主管（具寫入權限的部長）在 Tab 2 看到一個 inactive 維度列
- **When** 點擊該列的「啟用」操作並於確認後送出
- **Then** 系統呼叫新增的啟用端點 `PUT /api/v1/assignment/scoring/dimensions/:columnName/enable`，將該維度 `ob_levelcard_column.status` 由 `'inactive'` 改回 `'active'`
- **And** 清單即時刷新（重新 `getScoring()`），該維度狀態 chip 變為 `active`、列級灰底弱化移除
- **And** 顯示「維度已啟用」成功 toast
- **And** 啟用動作寫入 `assignment_audit_log`：`action='ENABLE'`、`entity_type='ob_levelcard_column'`、`entity_id='{cardType}|{cardVersion}|{columnName}'`、`before_value={status:'inactive'}`、`after_value={status:'active'}`（與既有 disable 對稱）

### AC-4：啟用端點對稱於既有停用端點（API 契約）

- **Given** 後端需提供啟用能力
- **When** 設計啟用端點
- **Then** 新增端點 `PUT /api/v1/assignment/scoring/dimensions/:columnName/enable`（路徑、`cardType` query、回應結構對稱於既有 `.../disable`，見 §5.2）
- **And** 權限沿用既有寫入規則：class 級 `DirectorOrSectionChiefGuard` 基準閘 + method 級 `@RequireDirector()`（寫入限部長）
- **And** 套用相同 `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')`
- **And** 目標維度若不存在於選中 CARD_TYPE，或其 `status` 已是 `active` → 回 **404 `SCORING_COLUMN_NOT_FOUND`**（**OQ-164-3 決議：對稱於 disable「對已 inactive 維度停用 → 404」之既有慣例**，見 BR-3）

### AC-5：月名單分派執行中禁止啟用 / 停用（資料鎖）

- **Given** 目前有月名單分派正在執行（`assignment_run.status IN ('pending','running')`）
- **When** 業務主管嘗試對某維度執行「啟用」（或「停用」）
- **Then** 寫入被阻擋，後端回 **409 `SCORING_VERSION_LOCKED`**（沿用既有 `assertNotLocked()`，與 disable 完全一致）
- **And** 前端「啟用」/「停用」按鈕在鎖定期間 `disabled`，並顯示「分派執行中，無法修改計分設定」提示
- **And** 月名單分派完成後，啟用 / 停用功能自動恢復可用

### AC-6：權限——僅具寫入權限者可操作「啟用」

- **Given** 使用者以「處長 / section_chief」（僅讀）身分進入 Tab 2
- **When** 檢視 inactive 維度列
- **Then** 可看到 inactive 維度與狀態 chip（讀取開放至處長），但「啟用」操作按鈕為 `disabled` / 不顯示（寫入限部長，沿用 F054 既有讀寫分流）
- **And** 後端 enable 端點對非部長身分一律拒絕（`DirectorGuard` → 403）

### AC-7：Tab 維度數量 badge 只計 active

- **Given** 某 CARD_TYPE 的維度清單同時含 active 與 inactive 維度（例：4 active + 2 inactive）
- **When** Tab 2「計分維度」分頁標籤的數量 badge 與表格底部「共 N 個維度」渲染
- **Then** 兩處皆**只計算 `status='active'` 的維度數**（本例顯示 4，非 6）（**OQ-164-4 決議：只計 active，以反映實際參與計分的維度數**）
- **And** inactive 維度仍完整顯示於清單列中（以狀態 chip 與列級弱化區隔），不被 badge 排除即等同隱藏

### AC-8：一律顯示全部，不提供「僅 active / 顯示全部」前端切換

- **Given** 清單同時含 active 與 inactive 維度
- **When** 使用者檢視 Tab 2
- **Then** 清單**一律顯示全部維度**（active + inactive），**不提供任何隱藏 inactive 的 toggle / 篩選切換**（**OQ-164-5 決議：不加 toggle，避免再造一層「隱形」風險、與本功能「消除盲區」初衷相左**）

## 5. API 契約

> 路由前綴 `assignment/scoring`（global prefix `api/v1`，最終 `/api/v1/assignment/scoring/...`）。

### 5.1 GET /assignment/scoring（既有端點，變更回傳）

| 項目 | 內容 |
|------|------|
| Method / Path | `GET /api/v1/assignment/scoring` |
| Query | `cardType`（必填） |
| 權限 | class 級 `DirectorOrSectionChiefGuard`（讀取開放至處長，既有） |
| 變更 | `dimensions[]` 由「只含 active」改為「含 active + inactive 全部」；每個 dimension 物件**新增 `status` 欄位** |

回傳 `dimensions[]` 內每筆物件結構（新增 `status`，其餘維持既有）：

```jsonc
{
  "columnName": "SALES_STS",
  "columnLabel": "業務狀態",
  "matchType": "CATEGORY",          // 既有
  "status": "inactive",             // ★ 新增（'active' | 'inactive'）
  "scoreSummary": "3 個區間",
  "scores": [ /* 既有 */ ]
}
```

排序：依 `column_name` 升冪（既有行為不變；active 與 inactive 混合於同一排序，不另分群——分群與否屬前端視覺，由 UI/UX 決定，後端不保證 active 在前）。

### 5.2 PUT /assignment/scoring/dimensions/:columnName/enable（★ 新增端點）

| 項目 | 內容 |
|------|------|
| Method / Path | `PUT /api/v1/assignment/scoring/dimensions/:columnName/enable` |
| Path 參數 | `columnName`（維度 column_name） |
| Query | `cardType`（必填，DTO 鏡像既有 `DisableDimensionQueryDto`：`@IsString` + `@IsNotEmpty` + `@MaxLength(5)`） |
| Body | 無 |
| 權限 | class 級 `DirectorOrSectionChiefGuard` + method 級 `@RequireDirector()`（寫入限部長） |
| Feature Flag | `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')` |
| 成功回應 | `200 OK`，結構對稱於 disable（見下） |

成功回應 body（對稱於 `DisableDimensionResult`，狀態與時間戳欄位方向相反）：

```jsonc
{
  "cardType": "H",
  "cardVersion": 1,
  "columnName": "SALES_STS",
  "status": "active",                       // disable 為 "inactive"
  "enabledAt": "2026-06-25T08:30:00.000Z"   // disable 為 "disabledAt"
}
```

> service 方法簽章對稱 disable：`enableDimension(cardType: string, columnName: string, actor: ActorContext): Promise<EnableDimensionResult>`。
> 回傳型別 `EnableDimensionResult`：`{ cardType: string; cardVersion: number; columnName: string; status: 'active'; enabledAt: string }`。

### 5.3 端點對稱性對照表（核心驗收依據）

| 構面 | disable（既有 F054） | enable（本功能 F106） | 對稱性要求 |
|------|---------------------|----------------------|-----------|
| HTTP Method / Path | `PUT .../dimensions/:columnName/disable` | `PUT .../dimensions/:columnName/enable` | 路徑僅尾段動詞不同 |
| Query DTO | `DisableDimensionQueryDto`（cardType 必填 / MaxLength 5） | `EnableDimensionQueryDto`（鏡像同規則） | 完全相同驗證規則 |
| Class guard | `AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard` | 同 | 相同 |
| Method 權限 | `@RequireDirector()` | `@RequireDirector()` | 相同 |
| Feature flag | `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')` | 同 | 相同 |
| 月名單分派鎖 | `assertNotLocked()` → 409 `SCORING_VERSION_LOCKED` | `assertNotLocked()` → 409 `SCORING_VERSION_LOCKED` | 相同 |
| cardType 範圍鎖 | `assertCardTypeActive()` → 404 `CARD_TYPE_NOT_FOUND` | `assertCardTypeActive()` → 404 `CARD_TYPE_NOT_FOUND` | 相同 |
| findOne 限定狀態 | `status='active'`（找不到 → 404） | `status='inactive'`（找不到 → 404） | **方向相反**（核心對稱點） |
| 找不到錯誤 | 404 `SCORING_COLUMN_NOT_FOUND` | 404 `SCORING_COLUMN_NOT_FOUND` | 相同錯誤碼 |
| 重複操作 | 對已 inactive 維度停用 → 404 | 對已 active 維度啟用 → 404 | **對稱**（BR-3） |
| 狀態變更 | `active` → `inactive` | `inactive` → `active` | **方向相反** |
| audit action | `'DISABLE'` | `'ENABLE'` | 動詞對稱 |
| audit before / after | `{status:'active'}` / `{status:'inactive'}` | `{status:'inactive'}` / `{status:'active'}` | **方向相反** |
| audit entity_id | `{cardType}\|{cardVersion}\|{columnName}` | 同格式 | 相同 |
| 回應狀態欄 | `status:'inactive'` + `disabledAt` | `status:'active'` + `enabledAt` | **方向相反** |

> **EQ / 契約驗收重點**：enable 與 disable 的對稱性是本功能核心驗收點。下游測試應對「同一維度 disable → enable → disable」往返後狀態與 audit 軌跡逐項驗證對稱（除狀態方向、動詞、時間戳欄名外，guard / flag / lock / 404 / entity_id 行為完全一致）。

## 6. 商業規則

- **BR-1（getScoring 移除 active 過濾）**：`getScoring()` 維度查詢移除 `where.status='active'`，改回傳 active + inactive 全部維度；mapper 補輸出 `status` 欄位（值取自 `ob_levelcard_column.status`）。`scores` 查詢與映射邏輯不變（inactive 維度仍照常帶其 scores，前端僅以狀態區隔）。
- **BR-2（enable 對稱 disable 寫入流程）**：`enableDimension(cardType, columnName, actor)` 依序：
  1. `assertNotLocked()`（月名單分派鎖 → 409 `SCORING_VERSION_LOCKED`）
  2. `assertCardTypeActive(cardTypeRepo, cardType)`（範圍鎖 → 404 `CARD_TYPE_NOT_FOUND`）
  3. `columnRepo.findOne({ card_type, column_name, status:'inactive' })`；找不到 → 404 `SCORING_COLUMN_NOT_FOUND`
  4. `existing.status='active'` → `columnRepo.save(existing)`
  5. `writeAudit(actor, 'ENABLE', 'ob_levelcard_column', '{cardType}|{cardVersion}|{columnName}', {status:'inactive'}, {status:'active'})`
  6. 回傳 `{ cardType, cardVersion, columnName, status:'active', enabledAt: new Date().toISOString() }`
  （`cardVersion` 取自 `existing.card_version ?? 1`，與 disable 一致。）
- **BR-3（重複啟用 → 404，對稱慣例）**：對已 `active` 維度執行啟用時，步驟 3 的 `findOne(status='inactive')` 找不到 → 404 `SCORING_COLUMN_NOT_FOUND`。此即對稱於 disable「對已 inactive 維度停用 → 404」的既有慣例（disable 用 `findOne(status='active')`）。**不採冪等 200**——維持兩端點對稱性與測試可預期性（OQ-164-3）。
- **BR-4（計分採計範圍不變）**：本功能不改計分引擎 / `fn_calc_tier_level` 的 `status='active'` 過濾；inactive 維度顯示於清單但永不參與計分。啟用後該維度即重新納入下一次月名單分派計分（因 `status` 已回 `active`）。
- **BR-5（audit action 'ENABLE' 寫入）**：`writeAudit` 既有 action union 已含 `'DISABLE'`（`assignment_audit_log.action` 為 `varchar(10)`，DB schema 容許）；新增 `'ENABLE'` 沿用同一 cast pattern（寫入時 cast 進 `CREATE|UPDATE|DELETE` 型別占位，DB 實存字串 `'ENABLE'`）。**不新增 error code、不新增 DB 欄位、不需 migration**。
- **BR-6（Tab badge 只計 active）**：Tab 2 數量 badge 與表格底部「共 N 個維度」計數，皆對前端持有之 dimensions 以 `d.status==='active'` 過濾後取 `length`（OQ-164-4）。

## 7. UI/UX 需求

> 對齊 `prototypes/28-scoring-config.html` Tab 2「計分維度」（表頭欄序：column_name / column_label / 類型 / 比對模式 / 分數區間摘要 / 狀態 / 操作）。React `DimensionsTab` 已超前原型畫好「狀態」欄與 active/inactive chip，本功能不改欄序、不新增欄。
>
> 側欄導覽：沿用既有 `/assignment/scoring` 路由（`App.tsx` 既有、側欄「計分卡設定」既有），**無需新增任何 route 或側欄項目**。

- **UI-1（狀態渲染改用後端 status）**：移除 `fetchAll` mapper 的 `status: (d as any).status ?? 'active'` fallback，改直接採後端回傳的 `status`。`DimensionsTab` 既有 chip 分支（`d.status==='active'` 綠 chip / 否則灰 chip）維持不變，但 inactive 列自此會真正出現。
- **UI-2（inactive 列級弱化）**：inactive 維度列補列級視覺弱化（灰底），與 active 列明顯區隔。具體 token（背景色 / 文字色階）由 UI/UX 階段依設計系統定義；本功能僅界定「需有列級弱化、且與 active 可一眼區分」。
- **UI-3（操作欄「啟用」按鈕，對稱「停用」）**：
  - active 列：維持既有「編輯（pencil）+ 停用（Ban）」兩顆按鈕。
  - inactive 列：顯示「啟用」按鈕（樣式對稱既有「停用」icon 按鈕；圖示與成功色調由 UI/UX 定義，行為對稱）。inactive 列不顯示「停用」（已停用無需再停用）；「編輯」於 inactive 列是否顯示由 UI/UX 決定，預設仍顯示（不阻擋編輯 inactive 維度設定，與 F054 不阻擋一致）。
- **UI-4（啟用確認 + toast）**：點「啟用」開確認對話框（對稱既有 `DisableConfirmModal`，文案改為啟用語意：「確定啟用維度 {columnName}『{columnLabel}』？」、說明區改述「狀態 inactive→active、寫入 audit log(action=ENABLE)、啟用後該維度重新納入月名單分派計分」），確認後經既有 `runWriteOp` 呼叫 enable API client，成功 toast「維度已啟用」。
- **UI-5（月名單分派鎖定）**：月名單分派鎖定（`isLocked`）期間，「啟用」按鈕與既有「停用」/「編輯」/「新增維度」按鈕一併 `disabled`，沿用既有鎖定樣式與 banner 提示（`runWriteOp` 偵測 409 `SCORING_VERSION_LOCKED` 顯示「分派執行中，無法修改計分設定」）。
- **UI-6（badge / 共 N 個維度只計 active）**：Tab 數量 badge（`dimCount`）與表格底部「共 N 個維度」改為只計 `status==='active'` 的維度數（BR-6）。
- **UI-7（API client 新增 enableDimension）**：`apps/web/src/api/assignment-scoring.ts` 新增 `enableDimension(cardType, columnName)`，對稱既有 `disableDimension`，PUT `.../dimensions/{encodeURIComponent(columnName)}/enable?cardType=`；`ScoringDimensionItem` interface 補必填 `status: 'active' | 'inactive'`。

## 8. 錯誤處理

> 本功能**不新增任何 error code**，完全沿用既有計分設定錯誤體系。詳見 `error-handling.md#assignment-scoring-errors`。

| 情境 | HTTP | 錯誤碼 | 觸發 |
|------|------|--------|------|
| 月名單分派執行中啟用 / 停用 | 409 | `SCORING_VERSION_LOCKED` | `assignment_run.status IN ('pending','running')` |
| 啟用目標維度不存在或已是 active | 404 | `SCORING_COLUMN_NOT_FOUND` | `findOne(status='inactive')` 找不到（含重複啟用） |
| cardType 不存在 / 已停用 | 404 | `CARD_TYPE_NOT_FOUND` | `assertCardTypeActive` 失敗 |
| 非部長嘗試啟用 | 403 | （Guard 既有拒絕回應） | `DirectorGuard` 拒絕 |
| feature flag 未開 | （FeatureFlagGuard 既有回應） | — | `ENABLE_E07_REFACTOR_PHASE3` 未啟用 |

## 9. 資料模型

> 詳見 `data-model.md#e07-data-model`。本功能**不新增 entity、不新增欄位、不需 migration**。

- **`ob_levelcard_column`**：`status` 欄位（`'active'` / `'inactive'`）既有；本功能僅讓 enable 端點寫回 `'active'`，並讓 `getScoring()` 回傳 inactive 列。
- **`assignment_audit_log`**：`action` 欄位（`varchar(10)`）既有；本功能寫入字串值 `'ENABLE'`（沿用 `'DISABLE'` 之 cast pattern，無 schema 變更）。

## 10. 範圍邊界（明確 out of scope）

- **碼意義 decode 顯示**（如 bracket / 分數設定旁顯示 `level1='A'` = 借新還舊）：**明確 out of scope，另立獨立 Story**（OQ-164-1 決議）。該需求涉及跨 Tab 顯示策略與 decode dictionary 綁定，與「啟用」功能正交，已有專屬設計產物 `scorecard-derived-code-dictionary.md`（AD-E07-10-S）獨立承載。
- **不改計分引擎採計邏輯**（inactive 仍不參與計分）。
- **不改原型 HTML**（設計意圖回寫原型由 UI/UX 階段處理）。
- **不提供「僅 active / 顯示全部」前端 toggle**（OQ-164-5）。

## 11. 已拍板決議（Resolved Decisions）

| 編號 | 決議 | 落點 |
|------|------|------|
| OQ-164-1 | decode UI **out of scope，另立獨立 Story**；本功能不含碼意義顯示 | §10 |
| OQ-164-2 | `getScoring()` **一律回全部維度 + 每維度 `status`**，不引入 `?includeInactive` 參數 | AC-2 / BR-1 |
| OQ-164-3 | 對已 active 維度啟用 → **404**（對稱 disable 對已 inactive 停用 → 404 之慣例），不採冪等 200 | AC-4 / BR-3 / §5.3 |
| OQ-164-4 | Tab count badge 與「共 N 個維度」**只計 active** | AC-7 / BR-6 / UI-6 |
| OQ-164-5 | **不加「顯示全部 / 僅 active」前端 toggle**（一律顯示全部） | AC-8 / §10 |

> 本功能無殘留 open question。

## 12. Definition of Done（下游驗收）

- AC-1 ~ AC-8 全部滿足。
- 後端 `getScoring` 回傳 active + inactive 維度且每維度含 `status`；新增 `enable` 端點對稱 `disable`（含權限、feature flag、月名單分派鎖、audit log、404 語意）。
- 前端 Tab 2 顯示 inactive 維度（狀態 chip + 列級弱化）並提供「啟用」入口；移除 `?? 'active'` fallback；鎖定 / 權限行為正確；badge 與「共 N 個維度」只計 active。
- 計分採計範圍未變更（inactive 仍不參與計分）之回歸驗證。
- enable ⇄ disable 對稱性測試（往返 + audit 軌跡逐項對照，§5.3）。
- Unit / 整合測試涵蓋：含 inactive 的查詢、啟用成功、重複啟用 404、cardType 404、月名單分派鎖 409、非部長 403（>80% 覆蓋）。
- 後端 `tsc --noEmit -p tsconfig.build.json` 乾淨（vitest 不做型別檢查）；前端 build / 型別檢查通過。
- 設計意圖回寫原型之需求已交付 UI/UX 階段（本功能不改原型）。

## 相關文件

- **來源 Story**：[US-164](../../stories/epics/E07-app-customer-list-assignment/US-164-M02-show-inactive-dimension-and-enable.md)
- **對稱基準（停用）**：[F054 編輯計分維度與分數](F054-edit-scoring-dimension.md)（提供 disable 端點，本功能對稱補完 enable）
- **唯讀查看**：[F053 查看計分維度設定](F053-view-scoring-dimensions.md)（getScoring 回傳消費端）
- **錯誤碼**：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)
- **資料模型**：[data-model.md#e07-data-model](../data-model.md#e07-data-model)
- **流程圖**：[diagrams/F106-enable-dimension-flow.mmd](../diagrams/F106-enable-dimension-flow.mmd)
- **decode 設計產物（out of scope 承載）**：[scorecard-derived-code-dictionary.md](../scorecard-derived-code-dictionary.md)（AD-E07-10-S）
- **實害修復遷移**：`apps/api/src/database/migrations/1711360000302-ActivateHSalesStsScoringColumn.ts`
- **原型**：`prototypes/28-scoring-config.html`（Tab 2 計分維度）
