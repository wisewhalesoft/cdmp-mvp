# US-032：編輯擷取任務

> **Story ID**：US-032
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 編輯已建立的擷取任務設定，並透過下拉選單重新選擇來源 schema 與資料表
**So that** 我可以調整任務參數以符合變更的需求，且不必擔心手動輸入資料表名稱時因格式錯誤導致執行失敗

---

## 驗收標準

### AC-1：成功編輯擷取任務
- **Given** Admin 在擷取任務清單頁面
- **When** Admin 點擊某任務的「編輯」按鈕，修改欄位後點擊「儲存」
- **Then** 系統更新擷取任務設定，顯示成功訊息，清單反映最新資料

### AC-2：執行中不可編輯
- **Given** 某擷取任務的 `status` 為 `running`
- **When** Admin 嘗試編輯該任務
- **Then** 系統顯示「任務執行中，無法編輯」的提示訊息，編輯按鈕為停用狀態

### AC-3：編輯時保留既有欄位值
- **Given** Admin 開啟某任務的編輯表單
- **When** 表單載入完成
- **Then** 所有欄位預先填入該任務的目前設定值；schema 下拉選單顯示既有 `source_schema` 值，資料表下拉選單顯示既有 `source_table` 值

### AC-4：編輯時的欄位驗證
- **Given** Admin 在編輯擷取任務表單
- **When** Admin 修改欄位後提交，有必填欄位為空或格式不合規
- **Then** 系統針對每個不合規欄位顯示具體的驗證錯誤訊息

### AC-5：編輯表單開啟時載入既有資料來源的 Schema 列表
- **Given** Admin 開啟某任務的編輯表單，任務已有設定的資料來源
- **When** 表單載入完成
- **Then** 系統自動呼叫 `GET /api/v1/datasources/:id/schemas` 載入 schema 列表，並將既有的 `source_schema` 值設為預選項；同步呼叫 `GET /api/v1/datasources/:id/schemas/:schema/tables` 載入資料表列表，並將既有的 `source_table` 值設為預選項

### AC-6：變更資料來源時重置並重新載入 Schema 與資料表
- **Given** Admin 在編輯表單中，且目前已有選定的資料來源、schema 及資料表
- **When** Admin 變更資料來源選擇
- **Then** 系統清除 schema 與資料表的選擇值，顯示 loading 狀態，並重新載入對應新資料來源的 schema 列表

### AC-7：變更 Schema 時重置並重新載入資料表列表
- **Given** Admin 在編輯表單中，且已選定資料來源與 schema
- **When** Admin 變更 schema 選擇
- **Then** 系統清除資料表的選擇值，顯示 loading 狀態，並重新載入對應新 schema 的資料表列表

### AC-8：載入失敗時顯示錯誤訊息
- **Given** Admin 在編輯表單，但系統無法連線至外部資料庫
- **When** schema 或資料表列表載入失敗
- **Then** 系統顯示錯誤訊息（例如：「無法連線至資料來源，請至資料來源設定頁面確認連線設定」），schema 與資料表下拉選單保持停用狀態；不提供手動輸入選項，使用者必須先修復連線設定後重新嘗試

### AC-9：變更來源資料表時的警告提示
- **Given** Admin 在編輯表單中，且任務先前已成功執行過（`execution_count > 0`）
- **When** Admin 變更 schema 或資料表選擇（與既有值不同）
- **Then** 系統顯示警告訊息：「變更來源資料表後，下次執行時系統將重新推斷欄位結構，既有 raw data 表可能被重建」，讓 Admin 確認後再繼續

---

## Technical Notes

- 端點：`PATCH /api/v1/extraction-tasks/:id`
- Request body：僅包含需更新的欄位
  ```json
  {
    "name": "string",
    "datasourceId": "uuid",
    "mode": "full | incremental",
    "sourceSchema": "string (選填，視資料庫類型而定)",
    "sourceTable": "string",
    "schedule": "string",
    "incrementalColumn": "string",
    "lastIncrementalValue": "string"
  }
  ```
- Response：`200 OK`，回傳更新後的 ExtractionTask 物件
- 當 `status` 為 `running` 時，API 回傳 `409 Conflict`
- 名稱唯一性驗證需排除自身（`WHERE name = :name AND id != :id`）
- 時區處理：後端儲存 UTC 時間，前端顯示時轉換為 UTC+8（Asia/Taipei）

**Schema / Table 查詢端點（與 US-030 共用）：**

| 端點 | 說明 |
|------|------|
| `GET /api/v1/datasources/:id/schemas` | 查詢指定資料來源的可用 schema 或 database 列表 |
| `GET /api/v1/datasources/:id/schemas/:schema/tables` | 查詢指定 schema 下的資料表列表 |

**編輯表單初始化邏輯（前端）：**

1. 載入任務詳細資料（`GET /api/v1/extraction-tasks/:id`）
2. 以任務的 `datasource_id` 呼叫 `GET /api/v1/datasources/:datasource_id/schemas`，預選既有 `source_schema`
3. 以任務的 `source_schema` 呼叫 `GET /api/v1/datasources/:datasource_id/schemas/:schema/tables`，預選既有 `source_table`
4. 若步驟 2 或 3 失敗，顯示錯誤訊息，schema 與資料表下拉保持停用狀態；不提供手動輸入 fallback

**變更來源資料表對 AppDB 的影響（後端）：**

- 若 `sourceTable`（或 `sourceSchema`）有變更，下次執行時系統重新推斷欄位結構並可能重建 AppDB raw data 表
- 此邏輯與 US-034（執行擷取任務）相關，不在本 Story 內實作

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 編輯任務名稱 | 更新成功 |
| 2 | 變更擷取模式從全量到增量 | 更新成功，增量欄位必填 |
| 3 | 修改 cron 排程 | 更新成功 |
| 4 | 編輯執行中的任務 | 顯示「任務執行中，無法編輯」 |
| 5 | 名稱改為已存在的名稱 | 顯示重複名稱錯誤 |
| 6 | 編輯表單預填既有值（含 schema 與 table 預選） | 所有欄位正確載入 |
| 7 | 變更資料來源後 schema 與 table 下拉重置並重新載入 | 下拉清空，顯示新資料來源的 schema 列表 |
| 8 | 變更 schema 後 table 下拉重置並重新載入 | 資料表下拉清空，顯示新 schema 的 table 列表 |
| 9 | 開啟編輯表單時資料來源連線失敗 | 顯示錯誤訊息，schema 與資料表下拉保持停用，不提供手動輸入 |
| 10 | 已執行過的任務變更來源資料表 | 顯示 raw data 表可能重建的警告訊息 |
| 11 | 非 Admin 嘗試編輯 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-030（需有擷取任務存在）、US-031（需從清單進入編輯）
- **Blocks**：無

---

## Open Questions

- [x] **OQ-1（共享 OQ-1）**：`source_schema` 欄位是否加入 Entity？
  - **決策（2026-03-18）**：採用拆分欄位設計，確認使用 `source_schema` + `source_table` 兩個獨立欄位。與 US-030 OQ-1 同步決策。
- [ ] **OQ-2（警告確認互動）**：AC-9 的警告提示以何種方式呈現？對話框（Modal）需使用者確認，或僅顯示內嵌警告文字即可？需 UI/UX 設計師確認。
- [ ] **OQ-3（初始化效能）**：編輯表單開啟時需同時發出 2 支 API 請求（schemas + tables），若外部資料庫回應慢，表單顯示會延遲。是否接受此 UX 取捨？或改為懶載入（用戶點選才觸發）？

---

## Definition of Done

- [ ] 編輯表單 UI 預填既有值（含 schema 與資料表下拉預選）
- [ ] 表單開啟時自動載入既有資料來源的 schema 列表與資料表列表
- [ ] 選定 schema 後載入資料表列表，選定資料表後填入表單值
- [ ] 變更資料來源時清除 schema / 資料表並重新載入
- [ ] 變更 schema 時清除資料表並重新載入
- [ ] 載入失敗時顯示錯誤訊息，schema 與資料表下拉保持停用，不提供手動輸入
- [ ] 已執行過的任務變更來源資料表時顯示警告訊息
- [ ] 執行中任務的編輯按鈕停用
- [ ] 後端 API 端點含驗證邏輯
- [ ] 執行中任務回傳 409 Conflict
- [ ] 名稱唯一性驗證（排除自身）
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030、US-031
