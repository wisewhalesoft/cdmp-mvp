# US-069：客戶名單匯出

> **Story ID**：US-069
> **Epic**：[E06 — Customer 360](epic-brief.md)
> **優先級**：Should Have
> **階段**：Phase 2
> **預估點數**：5
> **變更說明（2026-04-07）**：明確說明 Admin 不在允許匯出的角色清單中（與 US-068 功能操作權限矩陣一致）；新增 AC-8（Admin 呼叫匯出 API 回傳 403）

---

## User Story

**As a** 行銷（企劃）人員、分析師、或主管
**I want** 將目前篩選後的客戶清單（含標籤篩選結果）匯出為 CSV 檔案
**So that** 我能在外部工具（如 Excel、行銷系統）中進一步分析或使用這份客戶名單

---

## 驗收標準

### AC-1：觸發匯出動作
- **Given** 使用者在客戶清單頁面（US-060），且目前清單已套用搜尋條件、篩選條件或標籤篩選
- **When** 使用者點擊「匯出」按鈕
- **Then** 系統依據當前所有篩選條件（keyword、客戶類型、tagId 等）計算匯出筆數，並顯示確認對話框，說明「即將匯出 N 筆客戶資料（CSV 格式）」

### AC-2：匯出筆數上限
- **Given** 當前篩選結果超過 5,000 筆
- **When** 使用者點擊「匯出」按鈕
- **Then** 系統不執行匯出，而是顯示提示訊息「篩選結果共 N 筆，超過單次匯出上限 5,000 筆，請縮小篩選條件後再試」，並提供「關閉」按鈕

### AC-3：匯出欄位依角色可見性決定
- **Given** 使用者確認匯出操作
- **When** 後端產生匯出檔案
- **Then** 匯出的欄位依當前使用者的角色存取設定（US-068）決定可見欄位；敏感欄位（如 source_customer_no、mobile_phone）依遮罩規則以遮罩後的值匯出，不匯出原始明文

### AC-4：匯出反映當前篩選條件
- **Given** 使用者在客戶清單套用了搜尋關鍵字「王」＋客戶類型「個人」＋標籤「VIP」
- **When** 使用者執行匯出
- **Then** 匯出檔案僅包含同時符合三個篩選條件的客戶，與畫面上顯示的清單結果一致

### AC-5：CSV 格式與檔名
- **Given** 匯出執行成功
- **When** 瀏覽器下載完成
- **Then** 下載的檔案格式為 UTF-8 編碼的 CSV，第一列為欄位標題（繁體中文），檔名含日期戳記，格式為 `customer_export_YYYYMMDD.csv`（例：`customer_export_20260403.csv`）

### AC-6：匯出期間的使用者回饋
- **Given** 使用者確認匯出，後端開始串流產生 CSV
- **When** 匯出正在執行
- **Then** 按鈕顯示載入狀態，防止重複點擊；匯出完成後瀏覽器自動觸發下載，載入狀態解除

### AC-7：匯出欄位範圍（CSV 必要欄位）
- **Given** 使用者匯出客戶名單
- **When** CSV 檔案產生
- **Then** CSV 至少包含以下欄位（依角色可見性篩選）：客戶編號（遮罩）、客戶姓名/企業名稱、客戶類型、行動電話（遮罩）、標籤清單（以逗號分隔標籤名稱）、資料最後更新時間

### AC-8：Admin 不在允許匯出的角色清單中
- **Given** 登入者角色為 Admin
- **When** Admin 嘗試呼叫匯出 API（GET /api/v1/c360/customers/export）
- **Then** 後端回傳 403 Forbidden；前端在客戶清單頁面不顯示「匯出」按鈕（Admin 為系統設定者，不執行業務匯出操作；允許匯出的角色僅限：行銷、分析師、主管）

---

## Technical Notes

- 後端採串流方式（Streaming）逐筆產生 CSV，不在記憶體中載入全部資料；適用於接近上限的大量筆數（最多 5,000 筆）
- 前端觸發下載：後端設定 `Content-Disposition: attachment; filename="customer_export_YYYYMMDD.csv"` 與 `Content-Type: text/csv; charset=utf-8`
- CSV 需加 BOM（`\uFEFF`）以確保 Excel 正確顯示繁體中文欄位
- 匯出欄位與遮罩規則由 US-068 的角色欄位可見性設定（`c360_field_visibility`）決定，由統一 Mask Middleware 套用；允許匯出的角色為行銷（marketing）、分析師（analyst）、主管（supervisor），後端 RBAC Guard 驗證，其他角色（含 Admin）呼叫時回傳 403
- 筆數上限 5,000 筆由後端強制驗證（query 加 LIMIT 5001，超過則回傳 400）
- Excel 格式（.xlsx）列為 Could Have，Phase 2 不在此 Story 範圍內

### API 端點

**匯出客戶名單（CSV 串流下載）**

- 端點：`GET /api/v1/c360/customers/export`
- Query 參數：與客戶清單 API 相同（`keyword`、`type`、`tagId` 等），額外參數 `format=csv`
- Response：
  - 成功（200）：`Content-Type: text/csv; charset=utf-8`，串流回傳 CSV 內容
  - 超過上限（400）：
```json
{
  "error": "EXPORT_LIMIT_EXCEEDED",
  "message": "篩選結果共 N 筆，超過單次匯出上限 5,000 筆",
  "count": 5001
}
```

**預先計算匯出筆數**

- 端點：`GET /api/v1/c360/customers/export/count`
- Query 參數：同上（不含 `format`）
- Response：
```json
{
  "count": 1234,
  "withinLimit": true
}
```

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 篩選結果 100 筆，點擊「匯出」 | 確認對話框顯示「即將匯出 100 筆」，確認後下載 CSV |
| 2 | 無任何篩選（全部客戶），共 3,000 筆 | 正常匯出 3,000 筆 CSV |
| 3 | 篩選結果 6,000 筆，點擊「匯出」 | 顯示超過上限提示，不觸發下載 |
| 4 | 匯出後開啟 CSV | 第一列為欄位標題，編碼正確（中文無亂碼），檔名含當天日期 |
| 5 | 套用關鍵字「王」後匯出 | CSV 僅包含姓名含「王」的客戶 |
| 6 | 行銷角色匯出（source_customer_no 應遮罩） | CSV 中 source_customer_no 欄位以遮罩值呈現（非明文） |
| 7 | 匯出執行中，再次點擊「匯出」 | 按鈕呈載入狀態，第二次點擊無效 |
| 8 | 未登入直接呼叫匯出 API | 回傳 401，拒絕下載 |

---

## 依賴關係

- **Blocked By**：US-060（客戶清單頁面與篩選條件）、US-068（角色欄位可見性與遮罩規則）
- **Blocks**：無

---

## Definition of Done

- [ ] 匯出 API（GET /api/v1/c360/customers/export）以串流方式實作完成
- [ ] 筆數上限 5,000 筆由後端強制驗證
- [ ] 匯出欄位依角色存取設定（US-068）套用遮罩
- [ ] CSV 包含 UTF-8 BOM，Excel 開啟中文正常顯示
- [ ] 檔名含日期戳記（customer_export_YYYYMMDD.csv）
- [ ] 前端確認對話框顯示匯出筆數
- [ ] 超過上限時顯示錯誤提示，不執行下載
- [ ] 匯出執行期間按鈕防止重複點擊
- [ ] 單元測試覆蓋率達標（> 80%）
- [ ] 未登入呼叫 API 回傳 401

---

## 相關文件

- **Epic Brief**：[E06 Epic Brief](epic-brief.md)
- **依賴**：US-060（客戶清單）、US-068（角色存取設定）
- **相關 Story**：US-066（依標籤篩選）
- **NFR**：[NFR-002 效能](../../non-functional/NFR-002-performance.md)
