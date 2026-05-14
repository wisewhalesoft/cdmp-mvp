# US-093：查看 CARD_TYPE 計分卡類型清單

> **Story ID**：US-093
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 1 — CARD_TYPE 計分卡類型）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** 業務主管
**I want** 查看所有已設定的計分卡類型（CARD_TYPE）清單，以及每種卡別對應的產品類別（PROD_KIND）
**So that** 我能一眼掌握系統目前支援哪些計分卡種類、各計分卡與哪類產品相關聯，再決定是否需要新增或調整

---

## 背景說明

M02 計分設定原有 4 個 Tab（計分維度 / 分數設定 / CARD_LEVEL 門檻 / TIER_LEVEL 對應），本次調整新增第 1 個 Tab「CARD_TYPE 計分卡類型」，原 Tab 1~4 順移為 Tab 2~5。CARD_TYPE 在系統中隱含於 `ob_levelcard_version` 的 `card_type` 欄位，本次透過 `ob_card_type` 表將其提升為可獨立 CRUD 的主資料。

Tab 1 的選中狀態作為整個 M02 頁面的 CARD_TYPE 篩選脈絡，Tab 2~5 均依此自動載入資料。

---

## 驗收標準

### AC-1：顯示 CARD_TYPE 清單

- **Given** 業務主管已登入（is_sales_manager = true）並進入 M02 計分設定頁面
- **When** 頁面載入完成，停留在第 1 個 Tab（CARD_TYPE 計分卡類型）
- **Then** 顯示 `ob_card_type` 中 status = 'active' 的所有 CARD_TYPE 列表，每列包含：代碼（card_type）、名稱（card_name）、產品類別（prod_kind 的 code_nm，來自 ob_code_df WHERE tbl_id = 'PROD_KIND'）
- **And** 清單依 card_type 升序排列

### AC-2：預設選中第一筆並帶動後續 Tab

- **Given** CARD_TYPE 清單已顯示且至少有一筆資料
- **When** 頁面初始載入完成
- **Then** 清單自動選中第一列（依 card_type 升序的第一筆），以視覺高亮（如左側邊框色或列底色）標示當前選中狀態
- **And** Tab 2~5 均依此選中 CARD_TYPE 載入對應資料

### AC-3：手動切換選中 CARD_TYPE

- **Given** 業務主管在 Tab 1 查看 CARD_TYPE 清單
- **When** 業務主管點擊另一列 CARD_TYPE
- **Then** 頁面更新選中狀態至該列，高亮移動
- **And** Tab 2~5 的資料自動依新選中的 CARD_TYPE 重新載入
- **And** 若目前正在 Tab 2~5 查看資料，切換 CARD_TYPE 後停留在當前 Tab 並刷新其內容

### AC-4：PROD_KIND 醒目提示

- **Given** CARD_TYPE 清單已顯示
- **When** 業務主管查看頁面
- **Then** 頁面頂部顯示 info banner：「產品類別（PROD_KIND）由 M06 基礎代碼維護（ob_code_df tbl_id='PROD_KIND'）管理，如需新增或修改產品類別，請前往 M06」，banner 包含可點擊的「前往 M06」連結
- **And** CARD_TYPE 清單中每列的 prod_kind 以 badge 形式顯示（如 01=汽車 / 02=機車 / 其他）

### AC-5：清單為空狀態

- **Given** `ob_card_type` 中無任何 status = 'active' 的 CARD_TYPE 紀錄
- **When** 業務主管進入 M02 計分設定頁面
- **Then** Tab 1 顯示空狀態提示：「目前尚未設定任何計分卡類型，請點擊「新增計分卡類型」開始設定」
- **And** Tab 2~5 同樣顯示空狀態提示：「請先在 Tab 1 新增並選擇計分卡類型」
- **And** 月跑觸發按鈕（若在同頁面）應 disabled 並提示「尚無可用計分卡類型」

### AC-6：月跑執行中清單仍可查看

- **Given** 目前 `assignment_run` 有 status IN ('pending', 'running') 的紀錄
- **When** 業務主管查看 CARD_TYPE 清單
- **Then** 清單正常顯示（唯讀），新增 / 編輯 / 停用按鈕均 disabled
- **And** 頁面顯示「分派執行中，無法修改計分設定」提示

---

## 技術備註

- **CARD_TYPE 主資料表**：`ob_card_type`（AppDB 新建表，欄位設計由 system-architect 負責，參見 F069 §5.1）
- **PROD_KIND 來源**：`ob_code_df WHERE tbl_id = 'PROD_KIND' AND status = 'active'`（由 US-092 / F068 維護）
- **Tab 聯動實作**：頁面層級的 React Context 或 State 儲存 selectedCardType，Tab 2~5 的資料 fetch 均以此為參數
- **初始 Seed 範圍**：6 筆正規 CARD_TYPE（H / S / E / S5 / E5 / M），遷移時自 ob_levelcard_version 萃取唯一 card_type 值寫入 ob_card_type；prod_kind 需業務補齊或遷移腳本推算
- **API**：`GET /api/v1/assignment/scoring/card-types`（詳見 F069 §5.1）

---

## 測試案例

### TC-093-01：正常顯示 6 筆 CARD_TYPE

- **Given**：`ob_card_type` 有 H / S / E / S5 / E5 / M 共 6 筆 active 資料，各自綁定 PROD_KIND
- **When**：業務主管進入 M02
- **Then**：Tab 1 顯示 6 列，依 card_type 升序排列（E / E5 / H / M / S / S5），每列顯示代碼、名稱、PROD_KIND badge

### TC-093-02：預設選中第一筆聯動 Tab 2

- **Given**：TC-093-01 情境，頁面載入
- **When**：頁面 mount 完成
- **Then**：第一列（E）自動高亮選中；Tab 2（計分維度）顯示 E 的維度清單

### TC-093-03：手動切換 CARD_TYPE 後 Tab 2 刷新

- **Given**：目前選中 E，Tab 2 顯示 E 的維度
- **When**：業務主管點擊 H 列
- **Then**：H 列高亮，Tab 2 改顯示 H 的維度清單，E 的選中狀態消失

### TC-093-04：清單為空時的空狀態

- **Given**：`ob_card_type` 無 active 資料
- **When**：業務主管進入 M02
- **Then**：Tab 1 顯示空狀態提示；Tab 2~5 均顯示「請先在 Tab 1 新增並選擇計分卡類型」

### TC-093-05：月跑執行中按鈕全部 disabled

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管進入 M02 Tab 1
- **Then**：新增 / 編輯 / 停用按鈕均 disabled；banner 顯示「分派執行中，無法修改計分設定」

---

## 依賴關係

- **Blocked By**：US-001（登入驗證）、US-092（PROD_KIND 代碼資料來源）
- **Blocks**：US-094（新增 CARD_TYPE）、US-095（編輯 CARD_TYPE）、US-096（停用 CARD_TYPE）、US-072（計分維度查看需依選中 CARD_TYPE 篩選）、US-073（編輯計分維度需選中 CARD_TYPE）、US-074（CARD_LEVEL 門檻需選中 CARD_TYPE）、US-075（TIER_LEVEL 對應需選中 CARD_TYPE）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] Tab 聯動（AC-2 / AC-3）測試通過
- [ ] 空狀態（AC-5）測試通過
- [ ] 月跑鎖定（AC-6）測試通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F069（查看 CARD_TYPE 清單）
- **相關 Stories**：US-094（新增）、US-095（編輯）、US-096（停用）、US-072~075（Tab 2~5 聯動）、US-092（PROD_KIND 維護）
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
