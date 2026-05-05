# US-092：E07 相關代碼維護

> **Story ID**：US-092
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M06 基礎代碼維護
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 維護客戶名單分派所需的代碼選項（PROD_KIND、SPEC_TP、CASEYEAR）
**So that** 可在不需 IT 介入的情況下，自行調整名單定義表單中的下拉與多選選項，確保代碼符合業務現況

---

## 驗收標準

### AC-1：查看代碼清單

- **Given** 業務主管進入 M06 基礎代碼維護頁面
- **When** 頁面載入
- **Then** 顯示三個代碼類別頁籤（或區塊）：「PROD_KIND（產品類別）」、「SPEC_TP（專案類別）」、「CASEYEAR（進件/滿期/中結年數）」
- **And** 每個類別列出目前所有代碼選項，含代碼值、顯示名稱、狀態（啟用/停用）

### AC-2：新增代碼選項

- **Given** 業務主管在某代碼類別頁籤點擊「新增」
- **When** 業務主管填入代碼值與顯示名稱後點擊「儲存」
- **Then** 新代碼選項寫入 OBMCODEDF 對應類別，狀態預設為啟用
- **And** 新選項立即出現於 US-088/089 表單對應欄位的可選清單中

### AC-3：修改代碼選項

- **Given** 業務主管點擊某代碼選項的「修改」
- **When** 業務主管更新顯示名稱後點擊「儲存」
- **Then** OBMCODEDF 對應列更新顯示名稱
- **And** 已使用該代碼值的既有名單定義不受影響（代碼值不變，僅顯示名稱改變）

### AC-4：停用代碼選項

- **Given** 業務主管點擊某代碼選項的「停用」
- **When** 確認對話框確認後
- **Then** OBMCODEDF 對應列狀態更新為停用
- **And** 停用的代碼選項不再出現於 US-088/089 表單的可選清單中
- **And** 既有名單定義中已選用該代碼值的欄位值保持不變（不做回溯修改）

### AC-5：代碼值唯一性驗證

- **Given** 業務主管在同一代碼類別新增代碼值
- **When** 輸入的代碼值與該類別既有代碼值重複
- **Then** 系統顯示錯誤「此代碼值在該類別中已存在」，不寫入

---

## 技術備註

### Scope 控制說明（為何不做通用代碼管理平台）

本 Story 的 scope 嚴格限定為 E07 客戶名單分派需要的三個 OBMCODEDF 代碼類別：**PROD_KIND、SPEC_TP、CASEYEAR**。

刻意不做通用代碼管理平台的原因：
1. **避免功能蔓延（scope creep）**：通用平台需處理所有 Epic 的代碼，牽涉範圍過廣，MVP 不宜納入
2. **業務邊界清晰**：這三類代碼由業務主管（M06）自行維護，技術邊界對應 E07；其他 Epic 的代碼由對應模組負責
3. **可擴充性**：若業務需求增加，Phase 2 可將 M06 升級為獨立通用 Epic，提供跨 Epic 代碼管理能力

### 技術細節

- 資料來源：OBMCODEDF 表（既有 OB 系統表，含 CODE_TYPE、CODE_VAL、CODE_NM、STATUS 等欄位）
- **SYSTEM_ID 固定值**（Resolved 2026-05-05，dump 全表驗證）：OBMCODEDF.SYSTEM_ID 全部為 `OB`，為固定常數，不需 UI 呈現或維護，後端查詢時加 `WHERE SYSTEM_ID = 'OB'` 條件即可。

> **[ASSUMPTION - Resolved]** OQ-E07-11：OBMCODEDF.SYSTEM_ID 固定為 `OB`（2026-05-05 dump 全表驗證確認，無其他值）。

- 本 Story 管理的三個 CODE_TYPE：
  - `PROD_KIND`：產品類別（名單定義必填，單選）
  - `SPEC_TP`：專案類別（名單定義必填，多選）
  - `CASEYEAR`：進件/滿期/中結年數（名單定義必填，多選 + 全選）
- 代碼選項的 UI 動態載入：US-088/089 表單在渲染時查詢 OBMCODEDF 啟用中的選項
- CASEYEAR 的「全選」邏輯：前端在 US-088/089 處理，OBMCODEDF 只存個別選項值
- 停用代碼的既有名單影響：代碼值儲存在 OBMLISTDF 欄位中（字串），停用代碼不會觸發名單的連鎖更新（MVP 不做），但月跑執行前的前置條件可選擇性警示（system-architect 評估）

---

## 測試案例

### TC-092-01：新增 PROD_KIND 代碼

- **Given**：OBMCODEDF 中 CODE_TYPE = 'PROD_KIND' 有 3 個啟用選項
- **When**：業務主管新增代碼值 'D'、顯示名稱「健康險」
- **Then**：OBMCODEDF 新增一列，US-088 PROD_KIND 下拉新增「健康險」選項

### TC-092-02：停用代碼不影響既有名單

- **Given**：SPEC_TP 代碼值 'S2' 已被 LIST_NO = 'OB202605001' 使用（SPEC_TP 欄位含 'S2'）
- **When**：業務主管停用 'S2'
- **Then**：OBMCODEDF 'S2' 狀態改為停用，US-088 SPEC_TP 多選不再顯示 'S2'
- **And**：OBMLISTDF LIST_NO = 'OB202605001' 的 SPEC_TP 欄位值不變（'S2' 保留）

### TC-092-03：代碼值重複阻擋

- **Given**：CASEYEAR 已有代碼值 '5'
- **When**：業務主管嘗試在 CASEYEAR 類別再次新增代碼值 '5'
- **Then**：顯示「此代碼值在該類別中已存在」，不寫入

---

## 依賴關係

- **Blocked By**：US-001（登入驗證）
- **Blocks**：US-088（新增名單需 PROD_KIND / CASEYEAR / SPEC_TP 代碼就緒）、US-089（編輯名單同上）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 三個代碼類別的 CRUD 操作測試
- [ ] 代碼值唯一性驗證測試
- [ ] 停用代碼後表單不顯示測試
- [ ] 停用代碼不回溯修改既有名單測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：無直接 NFR 約束
- **相關 Stories**：US-088（新增名單定義，使用 PROD_KIND / CASEYEAR / SPEC_TP 代碼）、US-089（編輯名單定義，同上）
- **Reference**：`reference/TableSchema/OB/OBMLISTDF.sql`（OBMLISTDF 欄位參照代碼值）、`reference/Areas/OBZ/Views/OBZ020/edit.cshtml`（代碼選項在舊系統的呈現方式）
