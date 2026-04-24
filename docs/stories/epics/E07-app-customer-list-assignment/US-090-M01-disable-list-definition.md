# US-090：停用名單定義

> **Story ID**：US-090
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 停用不再需要的名單定義
**So that** 避免已過時或錯誤設定的名單條件在下次月跑中被誤用，同時保留歷史記錄以供查閱

---

## 驗收標準

### AC-1：停用確認對話框

- **Given** 業務主管在名單定義清單（US-070）中，點擊某個 STATUS = 'active' 名單的「停用」按鈕
- **When** 系統彈出確認對話框
- **Then** 對話框顯示警告文字：「確定停用名單『{LIST_NM}』（{LIST_NO}）？停用後此名單將不再用於未來月跑，且無法在本系統重新啟用。歷史快照資料不受影響。」
- **And** 對話框提供「確認停用」與「取消」兩個按鈕

### AC-2：執行停用（軟刪除）

- **Given** 業務主管在確認對話框點擊「確認停用」
- **When** 後端處理停用請求
- **Then** OBMLISTDF 中對應列的 STATUS 從 'active' 更新為 'inactive'
- **And** audit 欄位（U_* 修改者與修改時間）由後端自動更新
- **And** 操作寫入 AssignmentAuditLog（action = 'disable'，含 LIST_NO、操作者、時間）
- **And** 頁面顯示成功提示：「名單『{LIST_NM}』已停用」，清單刷新

### AC-3：停用後可從「已停用」頁籤查閱

- **Given** 名單 STATUS 已更新為 'inactive'
- **When** 業務主管切換至「已停用」頁籤
- **Then** 該名單出現在「已停用」頁籤中，可展開查看所有欄位值（唯讀）
- **And** 「已停用」頁籤不顯示「編輯」或「停用」按鈕，僅供查閱

### AC-4：不提供重新啟用（MVP 範圍）

- **Given** 名單 STATUS = 'inactive'
- **When** 業務主管在「已停用」頁籤查看該名單
- **Then** 不顯示任何「啟用」、「重新啟用」或「恢復」按鈕
- **And** 若需恢復使用相同條件，業務主管可透過「複製名單」（US-088）建立新名單

### AC-5：月跑執行中禁止停用

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 業務主管嘗試點擊任何名單的「停用」按鈕
- **Then** 停用按鈕為停用狀態，hover 顯示提示「分派執行中，無法停用名單定義」

### AC-6：已被 completed 月跑使用過的名單可停用

- **Given** 某名單曾被歷史 completed 月跑使用（快照中有記錄）
- **When** 業務主管執行停用
- **Then** 系統允許停用，STATUS 更新為 'inactive'
- **And** 歷史快照中對該名單的參照保持完整，不受停用影響

---

## 技術備註

- 資料來源：`reference/TableSchema/OB/OBMLISTDF.sql`（OBMLISTDF 表，STATUS 欄位需 system-architect 新增 ENUM('active','inactive')）
- 停用為軟刪除：僅更新 STATUS，不刪除資料列
- **不提供重新啟用**：MVP 範圍決策，避免業務邏輯複雜化；若業務需求升級可列入 Phase 2
- AssignmentAuditLog 寫入：action = 'disable'（待 system-architect 設計表結構）
- 月跑中資料鎖判斷：查詢 AssignmentRun 是否有 status = 'running' 記錄
- 停用後對未來月跑的影響：月跑 Stage 0/1 只讀取 STATUS = 'active' 的名單；已停用名單不參與未來分派計算
- 歷史快照（AssignmentRunSnapshot 的 input_list / result 快照）記錄的是月跑當時的篩選結果，不受名單 STATUS 變更影響

---

## 測試案例

### TC-090-01：正常停用流程

- **Given**：LIST_NO = 'OB202605001'，STATUS = 'active'，LIST_NM = 「車貸月跑名單」
- **When**：業務主管點擊「停用」→ 確認對話框 → 點擊「確認停用」
- **Then**：OBMLISTDF 該列 STATUS = 'inactive'，AssignmentAuditLog 新增 action = 'disable' 記錄，清單移至「已停用」頁籤

### TC-090-02：停用後唯讀查閱

- **Given**：LIST_NO = 'OB202605001'，STATUS = 'inactive'
- **When**：業務主管在「已停用」頁籤展開該名單
- **Then**：顯示全部欄位值，不顯示「編輯」或「停用」或「啟用」按鈕

### TC-090-03：月跑中禁止停用

- **Given**：AssignmentRun status = 'running'
- **When**：業務主管嘗試點擊名單的「停用」按鈕
- **Then**：按鈕停用，顯示鎖定提示

---

## 依賴關係

- **Blocked By**：US-070（停用按鈕在清單頁）、US-088（新增後才有名單可停用）
- **Blocks**：無（停用後不影響歷史快照；US-081 月跑前置條件只讀取 active 名單）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 停用後 STATUS 更新測試（OBMLISTDF）
- [ ] 確認對話框警告文字顯示測試
- [ ] AssignmentAuditLog 寫入測試
- [ ] 「已停用」頁籤唯讀顯示測試
- [ ] 不提供重新啟用測試（無啟用按鈕）
- [ ] 月跑中資料鎖測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)
- **相關 Stories**：US-070（清單頁入口，「已停用」頁籤）、US-088（新增名單，提供複製路徑以替代重新啟用）、US-081（月跑前置條件只讀 active 名單）
- **Reference**：`reference/TableSchema/OB/OBMLISTDF.sql`
