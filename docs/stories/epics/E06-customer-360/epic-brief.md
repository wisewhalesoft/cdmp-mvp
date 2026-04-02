# Epic Brief：E06 — Customer 360

> **Epic ID**：E06
> **優先級**：P1（Important）
> **階段**：Phase 2（進階）
> **Stories 數量**：9
> **階段更新（2026-04-02）**：原屬 Phase 3 的 US-067、US-068 合併至 Phase 2，E06 全部 9 個 Stories 均屬 Phase 2

## Epic 目標

Customer 360 是 CDMP 平台面向業務使用者的客戶資料洞察模組，讓不同角色的使用者能從 ETL Pipeline 治理後的 `customer_core` 目標表中，獲取有價值的客戶洞察，達成「**可採取行動的客戶資料洞察**」之核心價值主張。

Phase 2 聚焦四項核心能力：
1. **客戶搜尋與清單** — 讓使用者快速找到目標客戶，支援多條件篩選
2. **單一客戶 360 檢視** — 整合 customer_core 所有維度的客戶完整側寫
3. **標籤管理** — 業務人員對客戶進行自訂分類、批次標記與篩選
4. **變更歷史與角色存取控制** — 追蹤客戶資料演進歷程、依業務角色設定欄位可見性與遮罩規則

原 Phase 3 規劃的 US-067（變更歷史查詢）與 US-068（角色存取設定）已合併至 Phase 2（2026-04-02 業務決策）。

## User Stories

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-060 | 客戶搜尋與清單 | Must Have | [US-060-customer-search-list.md](US-060-customer-search-list.md) |
| US-061 | 單一客戶 360 檢視 | Must Have | [US-061-customer-360-view.md](US-061-customer-360-view.md) |
| US-062 | 建立標籤 | Must Have | [US-062-create-tag.md](US-062-create-tag.md) |
| US-063 | 管理標籤 | Must Have | [US-063-manage-tags.md](US-063-manage-tags.md) |
| US-064 | 為客戶新增／移除標籤 | Must Have | [US-064-tag-customer.md](US-064-tag-customer.md) |
| US-065 | 批次標記客戶 | Should Have | [US-065-bulk-tag-customers.md](US-065-bulk-tag-customers.md) |
| US-066 | 依標籤篩選客戶 | Must Have | [US-066-filter-by-tag.md](US-066-filter-by-tag.md) |
| US-067 | 客戶資料變更歷史查詢（原 Phase 3，合併至 Phase 2） | Should Have | [US-067-customer-change-history.md](US-067-customer-change-history.md) |
| US-068 | Customer 360 角色存取設定（原 Phase 3，合併至 Phase 2） | Could Have | [US-068-customer-360-role-access.md](US-068-customer-360-role-access.md) |

## 依賴關係

- **依賴**：
  - E01（使用者必須完成驗證）
  - E05 US-049（customer_core 目標表必須存在且有資料）
  - E05 US-057（ETL TargetLoad 節點完成，資料已載入 customer_core）
- **封鎖下游**：無（Customer 360 為消費端模組，不產出下游依賴）
- **NFR 關聯**：NFR-002（客戶清單分頁效能）、NFR-001（RBAC 角色存取控制）

## 資料實體（新增）

### CustomerTag（標籤定義）

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID (PK) | 主鍵 |
| name | VARCHAR(50) | 標籤名稱（系統唯一） |
| color | VARCHAR(7) | 標籤色碼（HEX，如 `#3B82F6`） |
| description | VARCHAR(200) | 標籤說明（選填） |
| created_by | UUID (FK) | 建立者（參照 accounts 表） |
| created_at | TIMESTAMP | 建立時間 |
| updated_at | TIMESTAMP | 更新時間 |
| deleted_at | TIMESTAMP | 軟刪除時間 |

### CustomerTagAssignment（客戶標籤指派）

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID (PK) | 主鍵 |
| customer_id | UUID (FK) | 客戶 ID（參照 customer_core.customer_id） |
| tag_id | UUID (FK) | 標籤 ID（參照 customer_tags 表） |
| assigned_by | UUID (FK) | 指派者（參照 accounts 表） |
| assigned_at | TIMESTAMP | 指派時間 |

索引建議：`(customer_id, tag_id)` 唯一約束、`tag_id` 索引（用於依標籤查詢客戶清單）。

### customer_core_history（客戶資料變更歷史，Phase 2）

此表為 `customer_core` 的 SCD Type 2 歷史快照表，於 Phase 2 實作（US-067），紀錄每次 ETL 載入前後的欄位差異。詳細 Schema 定義見 US-067 Technical Notes。

## 業務角色定義（已確認）

系統支援六種預定義業務角色（由業務方確認，2026-04-02）：

| 角色名稱 | 別名 | 說明 |
|---------|------|------|
| 業務 | — | 一線業務人員 |
| 行銷 | 企劃 | 行銷企劃人員 |
| 客服 | — | 客戶服務人員 |
| 分析師 | — | 資料分析師 |
| 主管 | — | 各部門主管 |
| 後端作業 | 作服 | 後端作業服務人員 |

**角色管理整合**：六種業務角色的定義（Seed Data）與使用者指派，整合至 E02 帳號管理模組（US-017 + US-014），不在 E06 獨立管理。E02 Phase 1 已新增 US-017（業務角色定義）以支援六種業務角色的 Seed Data 建立，此設計決策已確認（2026-04-02）。

## 角色與功能矩陣

| 功能 | 業務 | 行銷（企劃） | 客服 | 分析師 | 主管 | 後端作業（作服） |
|------|------|------------|------|-------|------|---------------|
| 客戶搜尋與清單 | 可 | 可 | 可 | 可 | 可 | 可 |
| 客戶 360 檢視 | 可 | 可 | 可 | 可 | 可 | 可 |
| 建立標籤 | 可 | 可 | 可 | 可 | 可 | — |
| 管理標籤（編輯/刪除） | 自建 | 自建 | 自建 | 可 | 可 | — |
| 為客戶新增/移除標籤 | 可 | 可 | 可 | 可 | 可 | — |
| 批次標記客戶 | 可 | 可 | — | 可 | 可 | — |
| 變更歷史查詢（Phase 3） | — | — | 可 | 可 | 可 | — |
| 角色存取設定（Admin） | — | — | — | — | — | — |

**Phase 2 角色存取**：E02 在 Phase 1 已建立六種業務角色的 Seed Data（US-017）。Phase 2 的 Customer 360 模組直接支援六種業務角色的存取控制，不再以 Admin / User 兩種角色作為暫行方案。角色細粒度的欄位可見性與遮罩規則由 US-068 定義與設定。

## 成功標準

- 使用者能在 2 秒內找到目標客戶（NFR-002）
- 單一客戶 360 頁面整合 customer_core 全部 8 個資料分類展示
- 標籤 CRUD 完整，支援批次標記至少 100 筆客戶
- 依標籤篩選客戶清單效能符合 NFR-002（500ms / 1000 筆以內）
- 變更歷史查詢（Phase 3）能追蹤至少最近 12 次 ETL 載入的差異

## 已確認決策（原 Open Questions，2026-04-02 業務確認）

| # | 問題 | 決策結果 |
|---|------|---------|
| 1 | 六種業務角色名稱 | 業務、行銷（企劃）、客服、分析師、主管、後端作業（作服） |
| 2 | 聯絡資訊遮罩處理 | 由 US-068 角色存取設定控制，US-060／US-061 不預設遮罩 |
| 3 | 標籤結構 | 單層扁平標籤，**不支援階層結構**（父標籤／子標籤） |
| 4 | 客戶搜尋方式 | 支援全文搜尋（Full-Text Search），建議使用 PostgreSQL full-text search |
| 5 | 變更歷史觸發機制 | ETL 執行後欄位值差異偵測，**僅有差異才寫入歷史記錄**（非每次 snapshot） |
| 6 | 欄位隱藏控制 | 由 US-068 角色存取設定控制可見欄位，不在 US-060／US-061 硬編碼 |
| 7 | 角色管理方式 | 六種業務角色整合進 E02 帳號管理，不在 E06 獨立管理 |

## 待解決問題

- [x] E02 帳號管理是否需要新增 Story，以支援六種業務角色的管理？ → **已確認：E02 新增 US-017（業務角色定義），六種業務角色為系統預設 Seed Data，不開放動態 CRUD（2026-04-02）**
- [ ] US-067 差異計算的效能影響：大量客戶批次載入時，是否應改為非同步後台計算？
- [ ] US-068 欄位遮罩細粒度：以欄位分類（A~H）為最小粒度，還是支援每個欄位的細粒度控制？
