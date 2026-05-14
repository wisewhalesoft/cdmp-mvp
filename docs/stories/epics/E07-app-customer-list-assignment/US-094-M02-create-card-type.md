# US-094：新增 CARD_TYPE 計分卡類型

> **Story ID**：US-094
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 1 — CARD_TYPE 計分卡類型）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 新增一種新的計分卡類型，並指定其代碼、名稱及對應的產品類別
**So that** 業務擴展新卡種時，可立即在系統中建立對應的計分設定結構，不需依賴 IT 直接操作資料庫

---

## 驗收標準

### AC-1：填入基本資料並新增

- **Given** 業務主管在 Tab 1 點擊「新增計分卡類型」，開啟新增 Modal
- **When** 填入代碼（card_type，必填，varchar(5) 以內，英數字）、名稱（card_name，必填）、產品類別（prod_kind，必填，下拉選單來源：`ob_code_df WHERE tbl_id = 'PROD_KIND' AND status = 'active'`），點擊「確認新增」
- **Then** 系統在同一 transaction 中執行：① 寫入 `ob_card_type` 新紀錄（status = 'active'）② 自動於 `ob_levelcard_version` 建立 card_version = 1、status = 'active'、sdate = 今日、edate = '20991231' 的空白計分版本
- **And** 新增成功後 Modal 關閉，清單刷新，新 CARD_TYPE 出現於清單中（依 card_type 升序排列），並自動成為 Tab 1 的選中狀態
- **And** 新增記錄寫入 `assignment_audit_log`（action = 'CREATE', entity_type = 'ob_card_type', entity_id = card_type 值）

### AC-2：代碼唯一性驗證

- **Given** 業務主管於新增 Modal 輸入的 card_type 值與 `ob_card_type` 中 status = 'active' 的既有紀錄重複
- **When** 業務主管點擊「確認新增」
- **Then** Modal 顯示行內錯誤提示「計分卡代碼 {code} 已存在，請使用其他代碼」，不寫入資料庫，Modal 不關閉

### AC-3：新增後 Tab 2 顯示空維度提示

- **Given** 業務主管成功新增 CARD_TYPE，系統自動建立 v1 空白計分版本
- **When** 業務主管切換至 Tab 2（計分維度）
- **Then** Tab 2 顯示空狀態提示：「目前無計分維度，請點擊「新增維度」開始設定」
- **And** Tab 3（分數設定）、Tab 4（CARD_LEVEL 門檻）、Tab 5（TIER_LEVEL 對應）同樣顯示對應的空狀態提示，不顯示錯誤訊息

### AC-4：必填欄位驗證

- **Given** 業務主管未填入必填欄位（card_type 或 card_name 或 prod_kind）
- **When** 業務主管點擊「確認新增」
- **Then** 未填欄位顯示「此欄位為必填」提示，不送出 API 請求

### AC-5：月跑執行中禁止新增

- **Given** 目前 `assignment_run` 有 status IN ('pending', 'running') 的紀錄
- **When** 業務主管在 Tab 1 查看清單
- **Then** 「新增計分卡類型」按鈕 disabled，不可點擊
- **And** hover 時顯示 tooltip：「分派執行中，無法修改計分設定」

---

## 技術備註

- **Transaction 範圍**：① `ob_card_type` INSERT ② `ob_levelcard_version` INSERT（v1 空白版本）須同一 transaction，任一失敗全部 rollback
- **v1 版本初始欄位值**：
  - card_type：同新建的 card_type
  - card_name：同新建的 card_name（CARD_NAME 在 ob_levelcard_version 中維護）
  - card_version：1
  - sdate：建立當日（YYYYMMDD）
  - edate：'20991231'
  - status：'active'
  - created_by：當前登入使用者的 user_id
  - created_at：當前時間
- **ob_levelcard_column / ob_levelcard_score / ob_levelcard_level / ob_tier**：新增時不自動建立，業務主管於 Tab 2~5 自行新增各項設定
- **API**：`POST /api/v1/assignment/scoring/card-types`（詳見 F070 §5）
- **錯誤碼**：`CARD_TYPE_DUPLICATE`（422）— 代碼重複；`SCORING_VERSION_LOCKED`（409）— 月跑執行中

> **[ASSUMPTION]** `ob_card_type` 為 AppDB 新建表，prod_kind 欄位以 FK 或 varchar 儲存 ob_code_df 的 code_val，具體欄位設計由 system-architect 於 F069~F072 spec 中確認。本 Story 只定義業務行為，不預設 schema 細節。

---

## 測試案例

### TC-094-01：成功新增 CARD_TYPE 並自動建立 v1 版本

- **Given**：`ob_card_type` 無 card_type = 'X1' 的紀錄
- **When**：業務主管填入代碼 'X1'、名稱 '測試卡'、prod_kind = '01（汽車）'，點擊確認
- **Then**：`ob_card_type` 新增一列（card_type='X1', status='active'）；`ob_levelcard_version` 新增一列（card_type='X1', card_version=1, status='active'）；清單更新，X1 自動選中

### TC-094-02：代碼重複驗證

- **Given**：`ob_card_type` 已有 card_type = 'H' 的 active 紀錄
- **When**：業務主管填入代碼 'H'，點擊確認
- **Then**：Modal 顯示「計分卡代碼 H 已存在，請使用其他代碼」；資料庫無新增；Modal 不關閉

### TC-094-03：Transaction rollback（ob_levelcard_version 寫入失敗）

- **Given**：模擬 ob_levelcard_version INSERT 因 DB constraint 失敗
- **When**：業務主管提交新增
- **Then**：ob_card_type 也未新增（rollback）；回傳 500 並顯示通用錯誤提示

### TC-094-04：必填欄位未填

- **Given**：業務主管未填 prod_kind，其他欄位已填
- **When**：點擊「確認新增」
- **Then**：prod_kind 欄位下方顯示「此欄位為必填」，不送 API

### TC-094-05：月跑執行中按鈕 disabled

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管查看 Tab 1
- **Then**：「新增計分卡類型」按鈕 disabled，hover 顯示 tooltip「分派執行中，無法修改計分設定」

---

## 依賴關係

- **Blocked By**：US-093（需先有 Tab 1 清單頁面）、US-092（PROD_KIND 下拉來源）
- **Blocks**：US-073（新增維度需先有 CARD_TYPE 存在）、US-081（月跑需有 CARD_TYPE 計分設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] Transaction rollback 測試通過（TC-094-03）
- [ ] 代碼唯一性驗證測試通過（TC-094-02）
- [ ] 月跑鎖定保護測試通過（TC-094-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F070（新增 CARD_TYPE）
- **相關 Stories**：US-093（查看清單）、US-095（編輯）、US-096（停用）、US-073（新增後設定維度）、US-092（PROD_KIND 維護）
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
