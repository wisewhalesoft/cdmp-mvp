---
last-updated: 2026-06-12
version: v1.0
change-summary: "新增 story：F102 per-list cr_enabled 閘控——月名單分派依 ob_list_definition.cr_enabled 決定是否執行 CR 優先分派；cr_enabled=false 時全名單 is_cr 強制為 'N'，進入標準比例分派。"
---

# US-153：月名單分派 per-list CR 優先分派閘控（cr_enabled gate）

> **Story ID**：US-153
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **Feature**：F102 月名單分派 CR 優先分派

---

## User Story

**As a** 業務主管
**I want** 月名單分派依照每份名單各自的 `ob_list_definition.cr_enabled` 設定，決定是否為該名單執行 CR 優先分派邏輯
**So that** 不同名單可有不同 CR 行為——啟用的名單走 CR 優先指派（US-152），停用的名單直接走標準比例分派，兩者可在同一次月名單分派中共存

---

## 背景說明

`ob_list_definition.cr_enabled` 欄位由 US-107（草稿階段 per-list CR 開關設定，migration `1711360000182-AddObListDefinitionCrEnabled.ts`）建立，預設為 `true`。F102 的 CR 優先分派邏輯（US-152）必須先通過本 story 的閘控判斷才執行。

**關聯決策**（F102 背景確認）：
- US-107 / US-120 已正式確立 `ob_list_definition.cr_enabled` 為唯一 CR 開關來源，廢棄 OBASSIGNSET 路徑
- 全域旗標 `ob_assign_config.cr_reassignment_enabled` 的廢除由 US-154 負責；本 story 不依賴全域旗標

### 閘控行為定義

| `cr_enabled` | 月名單分派 CR 優先分派行為 |
|---|---|
| `true` | 執行 US-152 的步驟 1–3（失效清空 + CR 優先指派）；US-152 AC-5 扣量生效 |
| `false` | 跳過 US-152 所有步驟；該名單所有案件 `is_cr` 強制為 `'N'`；全部進入 F101 標準比例分派池 |

---

## 驗收標準

### AC-1：cr_enabled=true 時執行 CR 優先分派

- **Given** 名單 OB202606001 的 `ob_list_definition.cr_enabled = true`；月名單分派觸發
- **When** 月名單分派進入 Stage 3 前置 CR 處理
- **Then** 月名單分派為 OB202606001 執行 US-152 的步驟 1（逾2年清空）、步驟 2（離職清空）、步驟 3（CR 優先指派）
- **And** 月名單分派執行日誌記錄：`OB202606001：cr_enabled=true，執行 CR 優先分派`

### AC-2：cr_enabled=false 時跳過 CR 優先分派，is_cr 強制為 'N'

- **Given** 名單 OB202606002 的 `ob_list_definition.cr_enabled = false`
- **When** 月名單分派進入 Stage 3 前置 CR 處理
- **Then** 月名單分派跳過 OB202606002 的 US-152 步驟 1–3
- **And** OB202606002 所有案件的 `is_cr` 強制更新為 `'N'`（確保無殘留 'Y' 值）
- **And** OB202606002 所有案件進入 F101 標準比例分派池（不扣量）
- **And** 月名單分派執行日誌記錄：`OB202606002：cr_enabled=false，跳過 CR 優先分派`

### AC-3：同一月名單分派中多份名單 cr_enabled 可有不同設定

- **Given** 月名單分派包含 OB202606001（cr_enabled=true）與 OB202606002（cr_enabled=false）
- **When** 月名單分派完整執行（Stage 0–4）
- **Then** OB202606001 的 CR 案件有 `is_cr='Y'`、`emplid=cr_id`
- **And** OB202606002 的所有案件 `is_cr='N'`，走標準比例分派
- **And** 兩份名單的 Stage 3/4 比例分派互不干擾，月名單分派整體 status = 'completed'

### AC-4：cr_enabled 在月名單分派開始後鎖定，不受執行中修改影響

- **Given** 月名單分派開始時讀取 `ob_list_definition.cr_enabled` 快照
- **When** 月名單分派執行中（status = 'running'），管理員嘗試修改名單的 cr_enabled
- **Then** 修改操作被月名單分派鎖阻擋（已有 US-107 AC-5 / US-104 鎖定機制）
- **And** 月名單分派全程使用月名單分派開始時的 cr_enabled 快照值，不受後續變更影響

---

## 技術備註

- **cr_enabled 來源**：`ob_list_definition.cr_enabled`（BOOLEAN，migration `1711360000182-AddObListDefinitionCrEnabled.ts`）；快照時機與 F101 其他名單參數（ob_dept_pct、ob_empl_set）一致
- **is_cr 強制清空（AC-2）**：cr_enabled=false 時，需在月名單分派工作集中執行 `UPDATE ob_monthly_run_result SET is_cr='N' WHERE list_no=:listNo AND is_cr IS NOT NULL AND is_cr<>'N'`，避免 ob_pool_data_list 中殘留的 is_cr='Y' 值污染月名單分派結果
- **不依賴全域旗標**：本 story 不讀取 `ob_assign_config.cr_reassignment_enabled`；全域旗標廢除由 US-154 負責
- **閘控讀取時機**：建議在月名單分派 Stage 3 前置處理的「per-list 迴圈」開始時讀取，與 F101 Stage 3 比例分派的 per-list 讀取點一致

---

## [OPEN QUESTION]

- **[OPEN QUESTION-5]**：legacy SP 有一行被注解的 `PROD_KIND` 判斷（`--AND B.LIST_NM NOT LIKE '%機車%'`），暗示機車名單歷史上曾被排除出 CR 邏輯。現行 F102 決議以 `cr_enabled` per-list 控制，不再有全域機車過濾。**請業務主管確認：現有機車名單（如有）的 `cr_enabled` 預設值是否應為 `false`？** 若是，需在 migration 初始資料中對機車名單做差異化設定，超出本 story 範圍，交 spec-writer/architect 處理。

- **[OPEN QUESTION-6]**：月名單分派開始時，是否需要在快照（AssignmentRunSnapshot）中記錄每份名單的 `cr_enabled` 值，以便事後稽核？目前 F101 快照含 ob_dept_pct/ob_empl_set 比例，是否需一併快照 cr_enabled？建議 spec-writer 確認 F066 快照範圍。

---

## 測試案例

### TC-153-01：cr_enabled=true 名單執行 CR 分派

- **Given**：OB202606001 cr_enabled=true；ob_monthly_run_result 有 cr_id 非空案件
- **When**：月名單分派 Stage 3 前置 CR 步驟
- **Then**：執行失效規則 + CR 優先指派；is_cr='Y' 案件存在；日誌含「執行 CR 優先分派」

### TC-153-02：cr_enabled=false 名單跳過 CR 分派

- **Given**：OB202606002 cr_enabled=false；ob_pool_data_list 有 cr_id 非空案件
- **When**：月名單分派 Stage 3 前置 CR 步驟
- **Then**：0 件 is_cr='Y'；所有案件進比例分派池；日誌含「跳過 CR 優先分派」

### TC-153-03：混合 cr_enabled 名單月名單分派不互相干擾

- **Given**：OB202606001 cr_enabled=true；OB202606002 cr_enabled=false；同一次月名單分派
- **When**：月名單分派完整執行
- **Then**：OB202606001 有 is_cr='Y' 案件；OB202606002 無 is_cr='Y' 案件；月名單分派 status='completed'

### TC-153-04：cr_enabled=false 名單 is_cr 強制清 N

- **Given**：OB202606002 在 ob_pool_data_list 有 is_cr='Y' 的來源案件；cr_enabled=false
- **When**：月名單分派 Stage 3 前置 CR 步驟
- **Then**：ob_monthly_run_result 中 OB202606002 所有案件 is_cr='N'；無 is_cr='Y' 殘留

---

## 依賴關係

- **Blocked By**：US-107（ob_list_definition.cr_enabled 欄位建立）、US-145/US-146（F101 Stage 3/4，扣量修改依賴本 story 確認閘控語意）
- **Blocks**：US-152（CR 優先分派核心，依賴本 story 閘控邏輯確認後才執行步驟 1–3）

---

## Definition of Done

- [ ] AC-1 ~ AC-4 全部通過
- [ ] TC-153-01 ~ TC-153-04 全部通過
- [ ] cr_enabled=true/false 整合測試各覆蓋一次完整月名單分派（TC-153-03）
- [ ] is_cr 強制清 N 測試（TC-153-04）通過
- [ ] 不讀取 `ob_assign_config.cr_reassignment_enabled`（code review 確認）
- [ ] OPEN QUESTION-5（機車名單 cr_enabled 預設）已由業務主管確認並記錄
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-107（per-list CR 開關設定，閘控來源）、US-152（CR 優先分派核心）、US-154（全域旗標廢除）、US-145（Stage 3 扣量修改）、US-146（Stage 4 扣量修改）
