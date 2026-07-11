# US-095：編輯 CARD_TYPE 計分卡類型

> **Story ID**：US-095
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 1 — CARD_TYPE 計分卡類型）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 修改計分卡類型的名稱或產品類別綁定
**So that** 當業務定義調整（如卡種更名或產品重分類）時，計分設定能即時反映，無需 IT 介入

---

## 驗收標準

### AC-1：開啟編輯 Modal

- **Given** 業務主管在 Tab 1 查看 CARD_TYPE 清單
- **When** 業務主管點擊某列 CARD_TYPE 的「編輯」按鈕
- **Then** 開啟編輯 Modal，預填現有值：名稱（card_name）、產品類別（prod_kind 下拉，來源：`ob_code_df WHERE tbl_id = 'PROD_KIND' AND status = 'active'`）
- **And** 代碼（card_type）欄位以唯讀方式顯示（disabled），不允許修改

### AC-2：代碼不可修改

- **Given** 業務主管開啟編輯 Modal
- **When** 業務主管查看代碼欄位
- **Then** card_type 欄位為 disabled 狀態，UI 呈現為灰色唯讀輸入框，附說明文字：「計分卡代碼為系統 join 鍵，建立後不可修改」

### AC-3：修改名稱或 PROD_KIND 並儲存

- **Given** 業務主管修改了 card_name 或 prod_kind
- **When** 業務主管點擊「儲存」
- **Then** `ob_card_type` 對應列更新（card_name / prod_kind 欄位），頁面顯示儲存成功提示（toast）
- **And** 清單即時反映更新後的名稱與 prod_kind badge
- **And** 修改記錄寫入 `assignment_audit_log`（action = 'UPDATE', entity_type = 'ob_card_type', entity_id = card_type 值，before_payload 含舊值，after_payload 含新值）

### AC-4：必填欄位驗證

- **Given** 業務主管清空 card_name 或未選擇 prod_kind
- **When** 業務主管點擊「儲存」
- **Then** 未填欄位顯示「此欄位為必填」提示，不送出 API 請求

### AC-5：月名單分派執行中禁止編輯

- **Given** 目前 `assignment_run` 有 status IN ('pending', 'running') 的紀錄
- **When** 業務主管在 Tab 1 查看清單
- **Then** 所有列的「編輯」按鈕均 disabled，不可點擊
- **And** hover 時顯示 tooltip：「分派執行中，無法修改計分設定」

---

## 技術備註

- **可修改欄位**：`card_name`、`prod_kind` — 僅這兩個欄位開放修改
- **不可修改欄位**：`card_type`（系統 join key，影響 ob_levelcard_version / ob_levelcard_column / ob_levelcard_score / ob_levelcard_level / ob_tier 所有下游表）
- **API**：`PUT /api/v1/assignment/scoring/card-types/:cardType`（詳見 F071 §5）
- **ob_levelcard_version 的 card_name 欄位**：ob_levelcard_version 表中亦有 card_name 欄位，編輯 ob_card_type 時是否同步更新 ob_levelcard_version 中對應的 card_name，由 spec-writer / system-architect 於 F071 中確認業務規則
- **錯誤碼**：`CARD_TYPE_NOT_FOUND`（404）— 操作的 CARD_TYPE 不存在；`SCORING_VERSION_LOCKED`（409）— 月名單分派執行中

---

## 測試案例

### TC-095-01：成功修改 card_name

- **Given**：CARD_TYPE 'H' 的 card_name 為「汽車期中名單」
- **When**：業務主管將名稱改為「汽車高資產期中名單」，點擊儲存
- **Then**：`ob_card_type` 更新 card_name；清單顯示新名稱；toast 顯示儲存成功；稽核日誌新增一筆 UPDATE 紀錄

### TC-095-02：代碼欄位不可輸入

- **Given**：業務主管開啟 CARD_TYPE 'H' 的編輯 Modal
- **When**：業務主管嘗試點擊或修改代碼欄位
- **Then**：代碼欄位不可輸入，保持顯示 'H'

### TC-095-03：清空必填欄位驗證

- **Given**：業務主管清空 card_name 欄位
- **When**：點擊「儲存」
- **Then**：card_name 欄位下方顯示「此欄位為必填」，不送 API

### TC-095-04：月名單分派執行中編輯按鈕 disabled

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管查看 Tab 1
- **Then**：所有列的「編輯」按鈕均 disabled

---

## 依賴關係

- **Blocked By**：US-093（需先有 Tab 1 清單頁面）、US-094（CARD_TYPE 先新增才有資料可編輯）
- **Blocks**：無直接下游（編輯不影響計分設定資料）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 代碼欄位不可修改驗證通過（TC-095-02）
- [ ] 稽核日誌寫入驗證通過（TC-095-01）
- [ ] 月名單分派鎖定保護測試通過（TC-095-04）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F071（編輯 CARD_TYPE）
- **相關 Stories**：US-093（查看清單）、US-094（新增）、US-096（停用）
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
