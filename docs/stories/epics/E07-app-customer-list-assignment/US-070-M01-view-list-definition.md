# US-070：查看本月名單定義清單

> **Story ID**：US-070
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 查看本月各 Stage 的名單定義條件清單
**So that** 在觸發月跑之前，確認每個 Stage 的篩選條件與預期涵蓋範圍符合本月業務策略

---

## 驗收標準

### AC-1：顯示本月名單定義清單

- **Given** 業務主管已登入系統並進入名單定義頁面
- **When** 頁面載入完成
- **Then** 顯示本作業年月（YYYYMM）下所有 Stage（Stage 0 ~ Stage N）的名單定義列表，每列包含：Stage 編號、Stage 名稱、篩選條件摘要、預估客戶數量、生效狀態
- **And** 清單依 Stage 編號升序排列

### AC-2：查看單一 Stage 條件詳情

- **Given** 名單定義清單已顯示
- **When** 業務主管點擊某一 Stage 列
- **Then** 展開或跳至詳情頁，顯示該 Stage 的完整篩選條件（包含每個條件欄位名稱、運算子、條件值）

### AC-3：無資料時的提示

- **Given** 本月名單定義尚未建立（或查無資料）
- **When** 頁面載入完成
- **Then** 顯示空白狀態提示：「本月（YYYYMM）尚無名單定義，請聯繫 IT 確認資料是否已就緒」

---

## 技術備註

- 名單定義資料來源：`reference/TableSchema/OB/OBMLISTDF.sql`（OBMLISTDF 表）
- 各 Stage 條件欄位定義可參照：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（Stage 1 名單篩選邏輯）
- 頁面為唯讀查看，不提供新增或編輯功能（配置由 IT 預先設定）
- 預估客戶數量可由 US-071 的每日估算邏輯衍生

---

## 測試案例

### TC-070-01：正常顯示本月 Stage 清單

- **Given**：OBMLISTDF 中本月有 3 個 Stage 定義
- **When**：業務主管進入名單定義頁面
- **Then**：顯示 3 列，Stage 編號分別為 0、1、2，依序排列

### TC-070-02：展開 Stage 詳情

- **Given**：清單中 Stage 1 有 5 個篩選條件
- **When**：業務主管點擊 Stage 1
- **Then**：詳情區顯示 5 個條件，含欄位名稱、運算子（如 =、>=、IN）、條件值

### TC-070-03：無資料空白狀態

- **Given**：當月 OBMLISTDF 查無符合資料
- **When**：頁面載入
- **Then**：顯示空白提示文字，不顯示錯誤訊息

---

## 依賴關係

- **Blocked By**：US-001（登入驗證）
- **Blocks**：US-071（Stage 0 估算需要名單定義已就緒）、US-081（觸發月跑前需確認名單定義）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)
- **相關 Stories**：US-071（Stage 0 估算）、US-081（觸發月跑）
- **Reference**：`reference/TableSchema/OB/OBMLISTDF.sql`、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`
