# US-067：客戶資料變更歷史查詢

> **Story ID**：US-067
> **Epic**：[E06 — Customer 360](epic-brief.md)
> **優先級**：Should Have
> **階段**：Phase 2（原 Phase 3，2026-04-02 合併至 Phase 2）
> **預估點數**：13

---

## User Story

**As a** 已登入的使用者（Admin、客服人員或資料分析師）
**I want** 查看特定客戶在歷次 ETL Pipeline 執行後的資料變更記錄，了解哪些欄位在什麼時間點發生了什麼變化
**So that** 我能追蹤客戶資料的演進歷程，識別異常變更，並在發生爭議時提供稽核依據

---

## User Story（系統觸發）

**As a** ETL Pipeline 執行引擎
**I want** 在每次成功將資料載入 customer_core 後，比對欄位值差異，**僅在有欄位值變更時**自動記錄差異快照
**So that** 系統能提供精準的客戶資料變更稽核軌跡，避免無異動記錄造成的資料膨脹

> **觸發機制決策**：採用**差異偵測模式（Change Detection）**，ETL 執行後比對欄位值，僅有實際差異才寫入 `customer_core_history`；若某客戶的所有欄位值與上次載入完全相同，則不產生歷史記錄。（2026-04-02 業務確認）

---

## 驗收標準

### AC-1：從客戶 360 頁面進入變更歷史
- **Given** 使用者在客戶 360 頁面（US-061）
- **When** 使用者點擊「變更歷史」標籤或按鈕
- **Then** 顯示該客戶的變更歷史清單，按 ETL 載入時間倒序排列，每筆顯示：ETL 載入時間（_etl_loaded_at）、執行的 Pipeline 名稱、變更欄位數量摘要

### AC-2：查看單次 ETL 載入的欄位差異
- **Given** 使用者在變更歷史清單中
- **When** 使用者點擊某一筆歷史記錄
- **Then** 展開顯示詳細的欄位 Diff：僅列出有變更的欄位，每欄位顯示「舊值」→「新值」，格式類似程式碼 Diff（舊值紅色/刪除線，新值綠色）

### AC-3：ETL 載入後差異偵測與記錄
- **Given** ETL Pipeline 成功執行 TargetLoad 節點，將資料載入 customer_core
- **When** TargetLoad 節點完成後，系統比對該客戶在 customer_core 中的新舊欄位值，偵測到任一欄位值發生變更
- **Then** 系統在 `customer_core_history` 表新增一筆記錄，儲存：customer_id、etl_pipeline_id、etl_loaded_at、changed_fields（JSONB，格式：`{ "field_name": { "old": "...", "new": "..." } }`）；差異比較以 TargetLoad 寫入前讀取的舊值與寫入後的新值為基準

### AC-4：無變更時不記錄歷史（差異偵測模式）
- **Given** ETL Pipeline 執行載入，某客戶的所有業務欄位值（A~G 分類）與上次 ETL 載入時完全相同
- **When** TargetLoad 節點完成該客戶的處理
- **Then** 系統**不為該客戶建立** customer_core_history 記錄；僅有實際欄位值差異的客戶才產生歷史記錄

### AC-5：初次載入記錄
- **Given** 某客戶在 customer_core 中沒有歷史記錄（第一次被 ETL 載入）
- **When** ETL TargetLoad 節點成功處理該客戶
- **Then** 建立一筆初始化歷史記錄，changed_fields 中所有欄位的 old 值為 null，new 值為首次載入的值

### AC-6：篩選特定欄位類型的變更
- **Given** 使用者在客戶變更歷史頁面
- **When** 使用者從欄位分類篩選（A識別 / B個人 / C聯絡 / D地址 / E職業 / F財務 / G企業）
- **Then** 歷史清單篩選為包含指定分類欄位變更的記錄

### AC-7：歷史記錄保留期限
- **Given** customer_core_history 記錄持續累積
- **When** 某筆歷史記錄的 etl_loaded_at 距今超過 2 年
- **Then** 系統定期歸檔或刪除超過 2 年的歷史記錄（具體清理策略由系統管理員設定）

---

## Technical Notes

### 資料模型：customer_core_history

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID (PK) | 主鍵 |
| customer_id | UUID | 客戶 ID（參照 customer_core.customer_id） |
| etl_pipeline_id | UUID | 執行載入的 Pipeline ID |
| etl_pipeline_name | VARCHAR(255) | Pipeline 名稱（記錄時快照，避免 Pipeline 改名後歷史失真） |
| etl_loaded_at | TIMESTAMP | ETL 載入時間 |
| changed_fields | JSONB | 欄位差異（`{ "field": { "old": "...", "new": "..." } }`） |
| change_count | INTEGER | 變更欄位數量（冗餘欄位，加速清單查詢） |
| created_at | TIMESTAMP | 記錄建立時間 |

索引：`(customer_id, etl_loaded_at DESC)` — 依客戶 ID 查詢時間倒序的主要查詢路徑。

### 差異計算策略（Change Detection）

**觸發時機**：ETL TargetLoad 節點完成後，對每位受影響的客戶執行差異比對。

**執行步驟**：
1. TargetLoad 節點寫入前，讀取 `customer_core` 中該客戶的現有欄位值（舊值快照）
2. 完成寫入後，取得新值
3. 逐欄位比對舊值與新值，收集有差異的欄位
4. 若有差異，寫入 `customer_core_history`；若無差異，跳過不寫入

**差異比對範圍**：
- 僅比較業務欄位（A~G 分類）
- 不比較 ETL 追蹤欄位（H 分類的 `_etl_loaded_at`、`_etl_pipeline_id` 本身）
- 差異比較使用嚴格相等（考量型別，避免 `"01"` 與 `1` 被視為不同）
- NULL 視為特定值處理：NULL → 有值 視為新增，有值 → NULL 視為刪除，均記錄差異

### API 端點

**客戶變更歷史清單**

- 端點：`GET /api/v1/c360/customers/:customerId/history?fieldCategory=&page=1&pageSize=20`
- Response：
```json
{
  "data": [
    {
      "historyId": "uuid",
      "etlPipelineName": "Customer Core Pipeline",
      "etlLoadedAt": "ISO8601",
      "changeCount": 3,
      "changedFields": {
        "mobile_phone": { "old": "0912-XXX-XXX", "new": "0923-XXX-XXX" },
        "mailing_address": { "old": "台北市...", "new": "新北市..." }
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
}
```

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | ETL 首次載入客戶 A | 建立一筆歷史記錄，all old = null |
| 2 | ETL 第二次載入，客戶 A 的 mobile_phone 變更 | 建立一筆歷史記錄，changed_fields 含 mobile_phone diff |
| 3 | ETL 第三次載入，客戶 A 無欄位變更 | 不建立歷史記錄 |
| 4 | 查看客戶 A 的變更歷史清單 | 顯示 2 筆記錄（首次 + mobile_phone 變更） |
| 5 | 展開第二筆歷史記錄 | 顯示 mobile_phone 的舊值→新值 diff |
| 6 | 篩選「C. 聯絡資訊」類欄位變更 | 僅顯示含聯絡資訊欄位變更的歷史記錄 |
| 7 | 客戶無任何歷史記錄 | 顯示空狀態提示（尚未有 ETL 變更記錄） |

---

## 依賴關係

- **Blocked By**：US-061（變更歷史查詢入口在客戶 360 頁面）、US-057（ETL TargetLoad 節點執行後觸發差異計算）
- **Blocks**：無

---

## 已確認決策

| 問題 | 決策 | 確認日期 |
|------|------|---------|
| 變更歷史觸發機制 | 差異偵測模式（Change Detection），ETL 執行後比對欄位值，僅有差異才寫入歷史記錄 | 2026-04-02 |

## Open Questions

- [ ] 差異計算效能：大量客戶批次載入時（10 萬筆以上），逐筆計算 diff 對 ETL 執行時間的影響是否可接受？是否改為非同步後台計算？
- [ ] `customer_core_history` 資料量評估：每次 ETL 載入 10 萬筆，每筆平均變更 3 欄位，1 年後資料量約多大？是否需要分表或分區策略？
- [ ] 歷史記錄中的敏感欄位是否需要遮罩（如 source_customer_no、mobile_phone）？遮罩規則是否與 US-068 保持一致？

---

## Definition of Done

- [ ] customer_core_history 資料表建立（含 JSONB 索引）
- [ ] ETL TargetLoad 節點整合差異計算邏輯（讀取現有資料 → 比較差異 → 寫入歷史表）
- [ ] 無變更時不建立記錄的邏輯實作完成
- [ ] 客戶變更歷史 API（GET /api/v1/c360/customers/:customerId/history）實作完成
- [ ] 前端變更歷史清單與欄位 Diff 展示實作完成
- [ ] 欄位分類篩選功能實作完成
- [ ] 效能測試：10 萬筆客戶批次載入時差異計算時間可接受
- [ ] 單元測試覆蓋率達標（> 80%）

---

## 相關文件

- **Epic Brief**：[E06 Epic Brief](epic-brief.md)
- **依賴**：US-057（ETL TargetLoad 節點）、US-049（customer_core schema 定義）
- **相關 Story**：US-061（客戶 360 頁面入口）
