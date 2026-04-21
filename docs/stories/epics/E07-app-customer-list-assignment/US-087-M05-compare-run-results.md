# US-087：比對兩次執行結果差異

> **Story ID**：US-087
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M05 快照歷史
> **優先級**：Should Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 選擇任意兩次月跑的結果進行差異比對
**So that** 清楚了解調整計分設定或比例設定後，對最終分派結果的具體影響（新增了哪些客戶、移除了哪些客戶、等級有何變化）

---

## 驗收標準

### AC-1：選擇兩次月跑進行比對

- **Given** 業務主管在歷史清單頁或快照詳情頁
- **When** 業務主管選擇「比對差異」功能，並選定比對基準（Base run_id）與比對目標（Compare run_id）
- **Then** 頁面顯示兩次月跑的基本資訊並排（作業年月、觸發時間、總分派筆數）
- **And** 若兩次月跑的作業年月相同，顯示提示「同月比對通常用於重跑調參情境」

### AC-2：摘要層級差異報告

- **Given** 兩次月跑已選定
- **When** 比對計算完成
- **Then** 顯示摘要差異：
  - 總分派筆數差異（Base N → Compare M，差異 ±X）
  - 各部門分配量差異表（Base 量 / Compare 量 / 差異值）
  - 各 CARD_LEVEL 等級分佈差異表

### AC-2b：人員配對一致性 diff（NFR-005 主指標驗收工具）

- **Given** 兩次月跑已選定且均為 completed 狀態
- **When** 比對計算完成
- **Then** 系統顯示「人員配對不一致」報告，包含：
  - 兩次月跑中**分派給不同業務員的案件清單**（每列顯示 APPL_NO、Base 月跑 OB_EMPLID、Compare 月跑 OB_EMPLID）
  - **人員配對不一致率**：不一致案件數 / 同批次總案件數 × 100%
  - 若不一致率 > 3%，顯示紅色警示並連結至 NFR-005
- **And** 提供「下載不一致案件清單」按鈕，匯出 Excel 格式（欄位：APPL_NO、Base OB_EMPLID、Compare OB_EMPLID）

### AC-3：設定差異報告

- **Given** 兩次月跑已選定
- **When** 業務主管查看「設定差異」區塊
- **Then** 列出兩次月跑的 config 快照差異項目，包含：
  - 計分版本是否變更（版本號）
  - 各部門比例是否有調整（差異 ≥ 1% 標示）
  - CR 回分規則是否有切換

### AC-4：客戶層級差異查詢

- **Given** 比對摘要已顯示
- **When** 業務主管點擊「查看新增客戶」或「查看移除客戶」
- **Then** 顯示僅出現在 Compare 結果而不在 Base 結果中的客戶清單（新增），以及僅在 Base 而不在 Compare 中的客戶清單（移除），每列顯示客戶編號與姓名

---

## 技術備註

- 比對邏輯基於兩次月跑的 AssignmentRunSnapshot（result 與 config 快照）
- 客戶層級差異使用集合運算（Set A - Set B 為移除，Set B - Set A 為新增）
- **人員配對不一致率**（AC-2b）為 NFR-005 的主要驗收工具：此比對功能是驗證新舊系統一致性的核心手段，計算邏輯為 APPL_NO join 兩次快照結果後比較 OB_EMPLID 欄位，不一致率 > 3% 則警示
- 建議後端提供比對 API（POST /api/v1/assignment/runs/compare，body: { base_run_id, compare_run_id }），避免前端處理大量 JSONB 資料；人員配對 diff 計算應在後端完成

---

## 測試案例

### TC-087-01：摘要差異顯示

- **Given**：Base run 總分派 9,000，Compare run 總分派 9,500
- **When**：比對完成
- **Then**：總筆數差異顯示「+500」，各部門差異表格正確呈現

### TC-087-01b：人員配對不一致率計算

- **Given**：Base run 共 9,000 案件；Compare run 共 9,000 案件；其中 200 案件分派給不同業務員
- **When**：比對計算完成
- **Then**：顯示人員配對不一致率 2.2%（200 / 9000 × 100%），不觸發紅色警示（低於 3%）

### TC-087-01c：人員配對不一致率超標警示

- **Given**：不一致案件數 / 總案件數 > 3%
- **When**：比對計算完成
- **Then**：不一致率顯示為紅色，顯示警示「人員配對不一致率超過 3% 驗收門檻，請確認後再執行正式上線」，並提供 NFR-005 連結

### TC-087-01d：下載不一致案件清單

- **Given**：人員配對不一致案件清單已顯示
- **When**：業務主管點擊「下載不一致案件清單」
- **Then**：下載 Excel 檔案，含欄位 APPL_NO、Base OB_EMPLID、Compare OB_EMPLID，列數等於不一致案件數

### TC-087-02：設定差異偵測

- **Given**：Base run 計分版本 v1，Compare run 計分版本 v2
- **When**：查看設定差異
- **Then**：顯示「計分版本從 v1 變更為 v2」

### TC-087-03：客戶層級差異

- **Given**：Base 有客戶 A、B、C；Compare 有客戶 B、C、D
- **When**：點擊「查看新增客戶」
- **Then**：顯示客戶 D（僅出現在 Compare）

### TC-087-04：同月比對提示

- **Given**：選擇同一作業年月的兩次月跑
- **When**：選定後
- **Then**：顯示提示「同月比對通常用於重跑調參情境」，但不阻擋比對執行

---

## 依賴關係

- **Blocked By**：US-086（兩次月跑的快照詳情需可讀取）
- **Blocks**：（無）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 集合差異運算邏輯測試
- [ ] 設定差異比對測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-004](../../non-functional/NFR-004-snapshot-integrity.md)、[NFR-005](../../non-functional/NFR-005-result-accuracy.md)（AC-2b 為 NFR-005 主指標的主要驗證工具）
- **相關 Stories**：US-085（歷史清單）、US-086（快照詳情）
