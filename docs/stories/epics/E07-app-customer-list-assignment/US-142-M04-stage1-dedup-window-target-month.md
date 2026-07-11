# US-142：Stage 1 去重視窗語意對齊目標分派月（透過正確 workdt 自動對齊，不改 computeDedupWindow）

> **Story ID**：US-142
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行（Stage 1 去重語意修正）
> **優先級**：Must Have
> **階段**：Phase 2
> **預估點數**：2
> **Feature**：F097 作業月語意統一
> **依賴**：F091 v2.0（`computeDedupWindow` 邏輯已存在）、US-139（`project_workym` 正確寫入）

---

## User Story

**As a** 業務部長（Director）
**I want** 月名單分派 Stage 1 的近 3 個月去重視窗以「分派作業月（目標月）」為基準計算，上界語意為「作業月上月底」
**So that** 去重視窗與 ground-truth SP 的 `workdt − 1 日` 對齊，不因月份語意偏差而少排除一個月的已派案，分派結果更精確

---

## 背景說明

F097 前（US-139 前），`AssignmentRun.project_workym` 儲存的是執行月（`new Date()`），導致 Stage 1 去重視窗的 `workdt` 也是執行月，使去重上界比正確值少一個月。

**設計決策（已拍板）**：`computeDedupWindow(workdt, poolDataListRepo)` 函式邏輯**本身不修改**（F091 v2.0 已定義 `MIN(MAX(assignday), workdt − 1 日)` 邏輯）。F097 只需確保 `workdt` 傳入目標月的 1 號（`project_workym + '01'`），去重視窗即自動對齊正確語意。

---

## 驗收標準

### AC-1：`executeStage1Chain` 的 `workdt` 使用 `project_workym + '01'`

- **Given** `AssignmentRun.project_workym = '202606'`（已由 US-138/139 正確寫入目標月）
- **When** 後端執行 Stage 1 去重（`executeStage1Chain` / `computeDedupWindow` 呼叫路徑）
- **Then** `workdt = new Date('2026-06-01')`（目標月 1 號）
- **And** 去重視窗為 `[2026-03-01, MIN(MAX(ob_pool_data_list.assignday), 2026-05-31)]`
- **And** 去重上界語意 = 「作業月上月底（2026-05-31）」

### AC-2：`computeDedupWindow` 函式本身不修改

- **Given** F091 v2.0 中 `computeDedupWindow(workdt, poolDataListRepo)` 的邏輯
- **When** F097 完成
- **Then** 該函式簽名與內部邏輯**無任何程式碼變更**
- **And** 語意對齊完全依靠傳入正確的 `workdt`（來自正確的 `project_workym`）

### AC-3：F097 前後去重視窗差異可驗證（regression guard）

- **Given** F097 前：`project_workym = '202605'`（執行月，5 月）→ `workdt = 2026-05-01` → 去重上界 = `2026-04-30`
- **When** F097 後：`project_workym = '202606'`（目標月，6 月）→ `workdt = 2026-06-01` → 去重上界 = `2026-05-31`
- **Then** 去重視窗整體往後移一個月，符合設計預期

### AC-4：ETL 切點近似落差文件化（已接受的近似）

- **Given** ETL 載入 `ob_pool_data_list` 的上界仍為「真實日曆本月 1 號」（與目標月 6 月無關，ETL 以執行時的 5 月為基準）
- **When** 5 月下旬跑 6 月月名單分派
- **Then** 系統接受此近似：`MAX(ob_pool_data_list.assignday)` 可能不含 5 月最後幾天（ETL 尚未補入最新派案），`MIN()` 取 `workdt − 1 日 = 2026-05-31` 作為兜底
- **And** 此已接受的近似在 `computeDedupWindow` 附近以明確程式碼注釋標記（對應 F091 OQ-STAGE1-02，本輪不修正）

---

## 開放問題（已決，僅供追蹤）

| OQ | 議題 | 現況決策 |
|---|---|---|
| OQ-STAGE1-02 | 建立 OBASSIGNSET ETL 以取得精確去重上界 `MAX(CASEDT)` | 本輪維持近似（`MIN(MAX(assignday), workdt−1日)`），不建 OBASSIGNSET ETL；業務驗收近似誤差不可接受時再啟動 |

---

## 依賴關係

- **Blocked By**：US-138、US-139（`project_workym` 正確寫入目標月後，`workdt` 才具備正確語意）
- **Blocks**：無

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-4 全部通過
- [ ] `computeDedupWindow` 函式無程式碼變更（可用 git diff 驗證）
- [ ] ETL 切點近似落差以注釋標記（對應 OQ-STAGE1-02）
- [ ] 單元測試確認：`project_workym = '202606'` → `workdt = 2026-06-01` → 去重上界 `2026-05-31`
- [ ] regression test：F097 前後去重視窗差異符合預期（整體後移一個月）
- [ ] Code review 通過

---

## 相關文件

- **Glossary**：[docs/specs/glossary.md](../../../specs/glossary.md)（`workdt` / `target_work_ym` / 去重視窗 / forward-only）
- **Feature Proposal**：[docs/specs/proposals/work-ym-semantics-unification.md](../../../specs/proposals/work-ym-semantics-unification.md) §5 D5、§0.1（R3 決策）
- **F091 v2.0**：[docs/specs/features/F091-stage1-complete-month-cnt-dedup-special-delete.md](../../../specs/features/F091-stage1-complete-month-cnt-dedup-special-delete.md)（`computeDedupWindow` AC-2 / BR-2）
- **相關 Stories**：US-139（`project_workym` 正確語意前提）
