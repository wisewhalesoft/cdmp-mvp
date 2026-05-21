---
type: test-design-risks
last_updated: 2026-05-20
---

# 風險與缺口

> 本文件記錄 CDMP MVP 測試設計過程中識別的不可測需求、模糊需求、架構限制、整合依賴與待決問題。

---

## 1. 不可測或模糊的需求

### 1.1 Token Blocklist Fail-Open / Fail-Closed 行為

- **來源**：F003（登出）、NFR-001.1
- **問題**：規格未定義 Token Blocklist 服務不可用時的行為。若 Blocklist 查詢失敗：
  - Fail-Open：允許請求通過（安全風險 — 已登出的 Token 仍可使用）
  - Fail-Closed：拒絕所有請求（可用性風險 — 全站停擺）
- **影響**：無法設計 Blocklist 故障場景的預期結果
- **建議**：架構師需決定 fail-open 或 fail-closed 策略

### 1.2 Email 重試機制

- **來源**：F009（自助式密碼重設）
- **問題**：規格未定義 Email 發送失敗時的重試策略。是否需要：
  - 自動重試？次數與間隔？
  - 使用者可見的重試按鈕？
  - 失敗記錄至 audit log？
- **影響**：無法設計 Email 暫時性失敗的完整測試場景
- **建議**：MVP 可暫不實作自動重試，僅回傳 SYSTEM_EMAIL_SEND_FAILED

### 1.3 Refresh Token 具體流程

- **來源**：OQ-1 決議（Refresh Token + 短效 Access Token）
- **問題**：決議了使用 Refresh Token 架構，但以下細節未定義：
  - Access Token 有效期？（建議 15 分鐘）
  - Refresh Token 端點路徑？
  - Refresh Token 儲存位置（HttpOnly Cookie 或 localStorage）？
  - Refresh Token 被撤銷後的前端行為？
- **影響**：無法設計完整的 Token 刷新與撤銷測試場景
- **建議**：架構師需補充 Refresh Token 實作規格

### 1.4 帳號停用後的前端即時反應

- **來源**：F007 AC-1
- **問題**：帳號停用後「若該使用者目前在線則被強制登出」，但未定義：
  - 前端如何得知被停用？（Polling 或 WebSocket 或下次 API 請求？）
  - 使用者看到的畫面為何？（直接跳轉登入頁？顯示停用訊息？）
- **影響**：E2E 測試無法驗證即時強制登出的 UX 流程
- **建議**：依據現有架構，最可能的實作是「下次 API 請求時回傳 401，前端導向登入頁」

---

## 2. 缺少的驗收標準

### 2.1 帳號清單預設排序規則

- **來源**：F005 BR-1
- **問題**：BR-1 定義「預設排序為 created_at DESC」，但未定義：
  - 是否支援使用者切換排序欄位？
  - 是否支援 ASC / DESC 切換？
  - API 是否接受 sort 參數？
- **影響**：測試僅能驗證預設排序，無法測試排序切換
- **建議**：MVP 僅支援預設排序即可，排序功能延後

### 2.2 Dashboard 警示 API 端點定義

- **來源**：F016 AC-6
- **問題**：`GET /api/datasources/alerts` 端點的回應已定義，但：
  - 警示是否需要手動確認（acknowledge）機制？
  - 是否需要 Email/通知推送？
  - 警示歷史紀錄是否保留？
- **影響**：測試範圍限於「警示清單查詢」，無法測試警示互動功能
- **建議**：MVP 僅提供查詢功能，acknowledge 與通知延後

### 2.3 角色變更後 Token 行為

- **來源**：F008 BR-4
- **問題**：BR-4 定義「角色變更於 Token 下次刷新或使用者重新登入後生效」，但：
  - 若使用者當前持有 Admin Token，被降級為 User 後：
    - 在 Token 刷新前，是否仍可存取 Admin 端點？
    - 前端是否需要主動觸發 Token 刷新？
- **影響**：無法精確定義角色變更後的過渡期行為測試
- **建議**：根據安全性考量，角色變更後應使舊 Token 失效

---

## 3. 影響測試的架構限制

### 3.1 Scheduler 多實例重複執行

- **來源**：F016 BR-2（每 30 分鐘健康檢查排程）
- **問題**：若後端部署多個實例，每個實例都啟動排程，可能導致：
  - 同一時間對同一資料來源執行多次健康檢查
  - 重複的 health log 記錄
  - 不必要的目標資料庫負載
- **影響**：效能測試結果可能受排程重複執行干擾
- **建議**：使用分散式鎖（如 Database Lock 或 Redis Lock）確保單一執行

### 3.2 AES-256 加密金鑰輪替測試

- **來源**：OQ-4（加密金鑰使用環境變數）
- **問題**：規格未定義金鑰輪替流程：
  - 輪替期間如何處理舊金鑰加密的密碼？
  - 是否需要重新加密所有現有記錄？
- **影響**：無法設計金鑰輪替的測試場景
- **建議**：MVP 可暫不支援金鑰輪替，延後至 Phase 2

### 3.3 JWT Secret 多 Secret 驗證

- **來源**：OQ-11（支援多 Secret 並行驗證）
- **問題**：已決議支援多 Secret，但具體實作未定義：
  - Secret 列表的管理方式？
  - 舊 Secret 的退役策略？
- **影響**：可設計基本的「新/舊 Secret 皆可驗證」測試，但無法驗證完整輪替流程
- **建議**：測試覆蓋「雙 Secret 並行驗證」場景即可

---

## 4. 需要 Mock / Stub 的整合點

| 整合點 | Mock 原因 | 建議 Mock 方式 | 影響的 Feature |
|--------|---------|---------------|---------------|
| MySQL 資料庫 | 測試環境不一定有 MySQL 實例 | Driver Mock 或 Test Container | F015, F016 |
| PostgreSQL 資料庫 | 測試環境不一定有 PostgreSQL 實例 | Driver Mock 或 Test Container | F015, F016 |
| SQL Server 資料庫 | 測試環境不一定有 SQL Server 實例 | Driver Mock 或 Test Container | F015, F016 |
| SMTP / SendGrid | Email 服務不應在測試中實際發送 | Mock Email Service | F009 |
| System Clock | Token 過期測試需快轉時間 | Clock Mock / Fake Clock | F001, F002, F003, F009 |

**詳細 Mock 策略**：請參閱 [test-data-strategy.md](test-data-strategy.md#6-mock-策略)。

---

## 5. 待決問題

### AQ-1：Access Token 儲存位置（高優先級）

- **來源**：F001、F002
- **問題**：JWT Token 儲存在 localStorage、sessionStorage 或 HttpOnly Cookie？
- **測試影響**：
  - localStorage → E2E 測試需操作 localStorage
  - HttpOnly Cookie → E2E 測試無法直接讀取 Cookie
  - 安全性測試需驗證 XSS 無法竊取 Token（Cookie > localStorage）
- **狀態**：待架構師決定
- **建議**：從安全性角度，建議 HttpOnly Cookie

### AQ-2：Token Blocklist 實作方式

- **來源**：F003、data-model.md
- **問題**：OQ-1 決議使用 Refresh Token + 短效 Access Token，但 Token Blocklist 是否仍需要？
  - 若 Access Token 有效期很短（如 15 分鐘），是否可以不維護 Blocklist？
  - 登出時僅撤銷 Refresh Token 是否足夠？
- **測試影響**：決定是否需要 Blocklist 查詢相關的測試場景
- **狀態**：待架構師確認
- **建議**：短效 Access Token + 撤銷 Refresh Token 即可，不需 Blocklist

### AQ-3：密碼重設 Email 內容範本

- **來源**：F009
- **問題**：Email 內容與格式未定義（主旨、正文、重設連結 URL 格式）
- **測試影響**：無法驗證 Email 內容的正確性
- **狀態**：待產品確認
- **建議**：最低需定義重設連結的 URL 格式（如 `{baseUrl}/reset-password?token={token}`）

### AQ-4：API 版本前綴

- **來源**：OQ-13
- **問題**：已決議預留 `/api/v1/` 前綴，但目前所有 Feature 規格的端點路徑為 `/api/`（無版本號）
- **測試影響**：端點路徑不確定，影響所有 API 測試
- **狀態**：待架構師統一
- **建議**：測試設計中使用相對路徑，允許 base path 可配置

### AQ-5：Refresh All 並行上限

- **來源**：F016 AC-7
- **問題**：「Refresh All」平行測試所有資料來源，但未定義：
  - 最大並行連線數？（若有 50 個資料來源，同時開 50 個連線是否合理？）
  - 是否需要 throttle 機制？
- **測試影響**：無法設計並行上限相關的測試
- **狀態**：待架構師決定
- **建議**：設定合理的並行上限（如 10），超過的排隊執行

### AQ-6：Optimistic Locking 實作方式

- **來源**：F006 BR-7、F013
- **問題**：規格建議使用 Optimistic Locking，但未定義：
  - 使用 version 欄位或 updated_at 比對？
  - 衝突時的 HTTP 狀態碼（409 已定義，但 error code 未指定）
- **測試影響**：可設計基本的並發編輯衝突場景
- **狀態**：待架構師確認具體方式

---

## 6. 風險等級摘要

| 風險等級 | 項目 | 說明 |
|---------|------|------|
| **高** | Refresh Token 流程未定義（1.3） | 影響所有驗證相關測試的完整性 |
| **高** | Access Token 儲存位置未定（AQ-1） | 影響安全性測試策略 |
| **中** | Token Blocklist Fail 行為未定（1.1） | 影響故障場景測試 |
| **中** | Scheduler 多實例重複執行（3.1） | 影響 F016 測試的可靠性 |
| **中** | 角色變更後 Token 行為（2.3） | 影響 F008 安全性測試 |
| **低** | Email 重試機制（1.2） | MVP 可暫不處理 |
| **低** | AES 金鑰輪替（3.2） | MVP 不需要 |
| **低** | 帳號清單排序切換（2.1） | MVP 僅需預設排序 |

---

---

## E04 資料擷取模組風險（F017–F025）

> 以下 6 項風險已於規劃階段獲得核准解決方案，解決方案已整合至對應 Feature 測試設計文件。

### E04-RISK-001：排程計時器控制（Clock Control）

- **來源**：F023（排程自動執行）
- **問題**：排程引擎依賴真實時間，無法在測試中精確控制觸發時機，導致測試不穩定或執行速度過慢
- **已核准解決方案**：設計 `scanAndExecute(fakeNow: Date)` 方法，透過 injectable time 參數取代真實時鐘。測試直接呼叫此方法並傳入特定時間點，無需等待真實計時器，完全消除時間相依性
- **影響 Feature**：F023
- **風險等級**：已解決

### E04-RISK-002：非同步執行結果同步（Async Execution Sync）

- **來源**：F021（立即執行／重新執行）
- **問題**：擷取任務採非同步執行（202 Accepted 立即回傳），測試無法確定何時查詢最終狀態，若使用固定 sleep 則不穩定且慢
- **已核准解決方案**：建立純測試工具函式 `waitForTaskStatus(taskId, expectedStatus, timeoutMs=5000)`，以 300ms interval polling ExtractionTask 狀態，達到預期狀態後立即繼續。不需修改任何 production code
- **影響 Feature**：F021
- **風險等級**：已解決

### E04-RISK-003：時區造成測試不穩定（Timezone Flaky）

- **來源**：F018（今日統計）、F024（儀表板今日統計）
- **問題**：「今日成功 / 今日失敗」以 UTC+8（Asia/Taipei）時區計算，若測試種子資料使用固定日期字串，可能在不同時區 CI 環境中計算結果不同，導致測試時好時壞
- **已核准解決方案**：種子資料日期改用 `todayInTaipei()` 工廠函式動態產生，確保相對於當前台北時間。CI 環境設定環境變數 `TZ=Asia/Taipei`
- **影響 Feature**：F018、F024
- **風險等級**：已解決

### E04-RISK-004：無效 range 參數的測試行為未定義

- **來源**：F024（擷取監控儀表板，趨勢圖 range 參數）
- **問題**：原始 F024 規格允許 range 為 7d / 14d / 30d，但未定義傳入非法值（如 60d 或任意字串）時的回應行為，導致無法設計對應的負向測試
- **已核准解決方案（規格補充）**：F024 規格補充：使用 `@IsIn(['7d','14d','30d'])` 白名單驗證。傳入任何不在清單中的 range 值，回傳 HTTP 422，錯誤碼 `VALIDATION_ERROR`。測試場景 TS-F024-009 已依此設計
- **影響 Feature**：F024
- **風險等級**：已解決

### E04-RISK-005：DB 不可用時排程日誌驗證方式

- **來源**：F023（排程掃描期間 DB 不可用）
- **問題**：排程引擎掃描時若 DB 不可用，規格要求「記錄錯誤至日誌」，但無額外的 audit log 系統，且無法透過 API 查詢系統日誌
- **已核准解決方案**：MVP 使用 `Logger.error` 記錄錯誤（NestJS 內建 Logger）。測試使用 `jest.spyOn(Logger, 'error')` 監聽確認被呼叫。無需額外 audit log 系統
- **影響 Feature**：F023
- **風險等級**：已解決

### E04-RISK-006：排程觸發的 ExtractionLog.createdBy 歸屬不明

- **來源**：F023（排程觸發）、F022（日誌查看）
- **問題**：排程自動觸發時，ExtractionLog.created_by 應記錄誰？規格提到「系統帳號或建立者」，但未精確定義，導致測試無法驗證此欄位
- **已核准解決方案（規格補充）**：F023 規格補充：排程觸發時，ExtractionLog.created_by 使用 `task.createdBy`（即該任務建立者的 User ID）。`triggered_by = 'schedule'` 欄位已足以區分排程觸發與手動觸發，無需另設系統帳號。測試場景 TS-F023-002 已依此設計
- **影響 Feature**：F023、F022
- **風險等級**：已解決

---

## Raw Data 落地需求風險（F017 v1.1、F019 v1.1、F021 v1.1、F022 v1.1、F026 v1.0）

> 以下風險來自 2026-03-18 的需求更新（raw data 實際資料落地功能）。

### RAW-RISK-001：動態 DDL 測試環境複雜度高

- **來源**：F021 BR-9（首次執行自動建立 raw data 表）
- **問題**：raw data 表需在 AppDB 動態建立，且結構來自外部 DB 的 `INFORMATION_SCHEMA`。這要求測試環境同時具備「外部來源 DB」與「AppDB」兩個資料庫實例，且需具備 DDL 執行權限（CREATE TABLE、DROP TABLE）。若使用 Transaction Rollback 隔離策略，動態建立的 raw data 表無法在事務中回滾（DDL 是 auto-commit 操作）
- **影響**：F021 TS-F021-011 ~ TS-F021-016；測試執行後 AppDB 中會遺留 raw data 表，可能干擾後續測試
- **建議解決方案**：
  1. 使用雙 Test Container（外部 DB + AppDB）；每個測試套件結束後使用 `DROP TABLE IF EXISTS raw_{task_id_short}` 清理
  2. 每個 F021 raw data 落地測試使用不同的新建任務（確保唯一的 task_id，避免表名衝突）
  3. 不使用 Transaction Rollback 隔離，改用 Database Reset（每套件前重置 AppDB 種子資料）
- **風險等級**：中

### RAW-RISK-002：批次寫入中途失敗的測試難以重現

- **來源**：F021 邊界情況（批次寫入中途連線中斷）
- **問題**：TS-F021-018 需要模擬「第 2 批次寫入時 DB 連線中斷」的場景，但控制外部 DB 連線在特定批次失敗的技術手段複雜：
  - 需要 DB 層面的注入機制（如 DB Proxy 或 Fault Injection）
  - 若使用 Driver Mock，已寫入批次的「保留」行為無法真實驗證
- **影響**：TS-F021-018 的自動化難度高；可能只能做半自動測試
- **建議解決方案**：將 TS-F021-018 設計為「使用 DB Driver Mock，設定第 2 次批次 INSERT 時拋出 ConnectionError；透過 Test Double 驗證 error 被正確處理，extracted_count 停在 1,000」的 Integration 測試。真實批次斷線場景列入手動驗收測試
- **風險等級**：中

### RAW-RISK-003：F026 百萬筆效能測試資料準備成本

- **來源**：F026 效能需求（百萬筆分頁 < 2 秒 / < 5 秒）
- **問題**：TS-F026-PERF-001 ~ PERF-003 需要在 AppDB 建立含 1,000,000 筆資料的 raw data 表。每次 CI 動態建立此資料集耗時過長（PostgreSQL INSERT 百萬筆約需數分鐘），不適合納入 CI Pipeline
- **影響**：效能測試無法自動化，需手動在 QA 環境執行；CI Pipeline 只能跑功能正確性測試
- **建議解決方案**：
  1. 在 QA 環境預先建立效能測試 DB，一次性插入 1,000,000 筆資料（使用 PostgreSQL `generate_series`），持久保存
  2. 效能測試 CI Job 獨立配置，手動觸發（不在 PR 時自動執行）
  3. 在 test-data-strategy.md 第 8.4 節中記錄資料建立腳本
- **風險等級**：中

### RAW-RISK-004：來源表欄位名稱 sanitize 的邊界定義模糊

- **來源**：data-model.md#raw-data-table（欄位名稱安全性）
- **問題**：規格說明「從來源表讀取的欄位名稱需經過 sanitize 處理（僅允許字母、數字、底線）」，但未定義：
  - 含空格的欄位名稱（如 `first name`）：是否替換為 `first_name` 或跳過此欄位？
  - 以數字開頭的欄位名稱（如 `2nd_value`）：是否允許？
  - 含 Unicode 字符的欄位名稱（如中文欄位名）：是否允許？
  - sanitize 失敗時的行為：整個任務 failed？僅跳過該欄位？
- **影響**：TS-F021-SEC-002 的「預期結果」無法精確定義；實作可能與測試預期不符
- **建議**：架構師需補充 sanitize 規則細節；建議方案：含非法字元的欄位名稱 → 以 `col_{index}` 替換（而非跳過）；任務不因此 failed，但 ExtractionLog 記錄 warning
- **風險等級**：高（需在實作前確認，否則 SEC-002 測試場景設計有誤）

### RAW-RISK-005：來源表結構變更重建行為缺少完整定義

- **來源**：F021 邊界情況、F019 BR-6
- **問題**：「來源表結構與現有 raw data 表不匹配時，系統嘗試 DROP + 重建」，但未定義：
  - 觸發條件：任何欄位新增/刪除/型別變更均觸發？還是僅欄位刪除觸發？
  - 重建前是否備份舊資料？（規格暗示不備份，但未明確）
  - DROP 後重建 DDL 失敗的回滾策略：表已 DROP 但新表建立失敗時，raw data 表消失，F026 會回傳 EXTRACTION_RAW_TABLE_NOT_FOUND
- **影響**：TS-F021-015 的觸發條件和預期結果可能不完整；F026 的空狀態場景需考慮「重建失敗後表消失」的 edge case
- **建議**：Architecture 需補充結構不匹配的偵測機制（建議 hash 欄位結構）與重建失敗時的 fallback（保留舊表 + 任務標記 failed，而非 DROP 後失敗）
- **風險等級**：高（影響測試場景設計及 F026 的錯誤處理覆蓋）

### RAW-RISK-006：F026 API 的 `sortBy` 欄位存在注入風險（待確認）

- **來源**：F026 AC-4（欄位排序）
- **問題**：`GET /raw-data?sortBy=field_name` 的 `sortBy` 參數值被用於動態 SQL `ORDER BY` 子句。若實作時直接將 `sortBy` 值拼接進 SQL，可能產生 ORDER BY 注入風險（例：`sortBy=1; DROP TABLE --`）
- **影響**：若未妥善驗證，F026 可能成為 SQL Injection 入口；測試需覆蓋 `sortBy` 注入向量
- **建議解決方案**：
  1. `sortBy` 值應與 `columns`（回應中的合法欄位清單）比對白名單驗證，僅允許已知欄位名稱
  2. 不符合白名單的 `sortBy` 值回傳 HTTP 422，VALIDATION_ERROR
  3. 在 TS-F026 新增 Security 測試：`sortBy=1; DROP TABLE --` → 預期 HTTP 422 或 ORDER BY 被安全處理
- **待決事項**：需確認實作是否採用白名單驗證（優先）或參數化 ORDER BY（僅部分 ORM 支援）
- **風險等級**：高（安全性問題，需在實作前確認）

---

## 連鎖下拉選單需求風險（F017 v1.2、F019 v1.2）

> 以下風險來自 2026-03-18 的需求更新（`sourceTable` 單一欄位 → `sourceSchema` + `sourceTable` 連鎖下拉選單）。

### SCHEMA-RISK-001：外部 DB 連線不穩定對 Schema / Table 載入的影響

- **來源**：F017 AC-8、F019 AC-8（連線失敗時行為）
- **問題**：連線測試（`GET /datasources/:id/schemas`）依賴外部資料庫可用性，但外部 DB 可能因各種原因不可達（逾時、防火牆、認證失敗等）：
  - 若連線持續不穩定，Admin 將無法完成新建或編輯任務的表單（BR-11 明確不提供手動輸入 fallback）
  - 503 錯誤的使用者指引（「請至資料來源設定頁面確認連線設定」）是否能有效引導 Admin 解決問題，尚未驗證
  - 測試環境中「外部 DB 連線失敗」的 stub 策略需確認：是 Mock Datasource Service 層的方法？還是 Mock HTTP 層的回應？
- **影響**：TS-F017-015、TS-F017-016、TS-F019-FE-005 測試的可靠性，需確保「連線失敗場景」可在 CI 中穩定重現
- **建議解決方案**：
  1. Integration 測試：使用 DS_PG_DISCONNECTED 搭配 Test Container，讓 PG container 不啟動或 stub Datasource Service 的 `getSchemas()` 方法拋出 Error
  2. 前端測試：stub GET /datasources/:id/schemas 直接回傳 HTTP 503
  3. 確認 Datasource Service 的 connection timeout 值：若預設逾時過長（如 30 秒），測試會慢；建議在測試環境中注入短逾時（如 2 秒）
- **風險等級**：中

### SCHEMA-RISK-002：不同資料庫類型的 Schema 概念差異影響下拉行為

- **來源**：F017 BR-8、BR-10；架構規格 AD-E04-10
- **問題**：MySQL、PostgreSQL、SQL Server 對「schema」的概念不同：
  - MySQL：`GET /schemas` 回傳 database 列表（無 schema 概念）
  - PostgreSQL：`GET /schemas` 回傳 schema 列表（public, analytics 等）
  - SQL Server：`GET /schemas` 回傳 schema 列表（dbo, sys 等）
  - 若 MySQL 回傳的是「database 名稱」，前端下拉顯示的是「資料庫」而非「schema」，但標籤仍寫「schema」，可能造成 Admin 混淆
  - 各 DB 類型的 `INFORMATION_SCHEMA`（系統 schema）是否應過濾，規格未定義
- **影響**：前端 Schema 下拉的 Label（「Schema」或「Database」？）可能需依 Datasource.type 動態變更；若不區分，可能降低可用性
- **建議解決方案**：
  1. MVP 階段前端統一顯示「Schema」標籤，不依 DB 類型動態切換（簡化實作）
  2. 後端過濾系統 schema（`information_schema`、`pg_catalog`、`performance_schema` 等），僅回傳使用者建立的 schema/database
  3. 在 test-data-strategy.md 第 9.1 節中記錄各 DB 類型的 Mock 回應範例
- **待決事項（需向架構師確認）**：
  - 系統 schema/database 是否過濾？過濾哪些？
  - MySQL 的 `GET /schemas` 是否回傳 database 列表？還是空陣列？
- **風險等級**：中（影響前端顯示與測試資料設計）

### SCHEMA-RISK-003：F019 編輯表單初始化並行 API 請求的錯誤處理邊界

- **來源**：F019 AC-5（編輯表單開啟時同步呼叫兩個 API）
- **問題**：編輯表單開啟時並行呼叫 `GET /schemas` 與 `GET /schemas/:schema/tables`（AC-5 要求「同步呼叫」）。若兩個請求其中一個失敗：
  - 若 GET /schemas 失敗：schema 與 table 下拉均無法預選
  - 若 GET /schemas 成功但 GET /tables 失敗：schema 可預選，但 table 下拉停用
  - 上述兩種失敗情境下，表單的 UI 狀態與使用者引導訊息，規格僅描述「顯示錯誤訊息，schema 與 table 下拉停用」，未區分兩種失敗情境
- **影響**：TS-F019-FE-005 僅涵蓋「schema 載入失敗」場景；「tables 載入失敗但 schemas 載入成功」的複合場景需補充
- **建議解決方案**：
  1. 新增 F019 前端測試場景：GET /schemas 成功（回傳 ["public"]）但 GET /tables 失敗（503）→ 驗證 schema 下拉預選 "public"，table 下拉停用並顯示錯誤
  2. 由 UX 確認：兩個 API 失敗時是否顯示同一條錯誤訊息，還是分別顯示
- **風險等級**：低（邊界情況，MVP 可簡化處理）

### SCHEMA-RISK-004：sourceSchema 欄位為空字串的語義問題

- **來源**：F017 BR-9（`sourceSchema` 視資料庫類型而定，可為空）
- **問題**：API 接受 `sourceSchema` 為選填，可省略或傳空字串。但儲存時「省略」與「空字串」的語義不同：
  - 省略 → null（資料庫不需要 schema 前綴，如 MySQL 直接存取 table）
  - 空字串 `""` → 是驗證錯誤？還是等同 null？
  - F021 執行時，若 `sourceSchema = null` 應如何組合 SQL？（直接 `"table_name"` 而非 `"null"."table_name"`）
- **影響**：TS-F017-006（sourceSchema 省略場景）的預期結果不明確；F021 執行時的 SQL 組合格式需包含 null 場景
- **建議解決方案**：
  1. 後端統一：空字串 `""` 轉換儲存為 `null`（避免「空字串 schema」的無效狀態）
  2. F021 執行邏輯：若 `sourceSchema = null`，SQL 僅使用 `"sourceTable"`；若非 null，使用 `"sourceSchema"."sourceTable"`
  3. 在 test-data-strategy.md 新增 sourceSchema="" 邊界測試值（目前 2.6 節已初步標注「需確認」）
- **風險等級**：低（需在實作前確認，影響 1~2 個測試場景的預期結果）

---

## E05 ETL Pipeline 管理模組風險（F027–F036）

> 以下 8 項風險來自 2026-03-20 的 E05 測試設計過程，整合各 Feature test spec 中 Risks and Notes 提出的問題。

### E05-RISK-001：F029 視覺化編輯器 Transform 節點測試範圍（部分已解決）

- **來源**：F029 AC-7（Transform 節點 JSONB 儲存與還原）
- **問題**：規格定義 13 種 Transform 節點，若每種均設計獨立的 JSONB 結構驗證場景，將產生大量重複且維護成本高的測試。
- **2026-03-31 更新**：Lookup 節點因 US-042 AC-7a~7d 雙輸入重設計，已從採樣策略提升至**獨立覆蓋**（TS-F029-032~037，含前端 E2E 與 Integration 場景；F043 TS-F043-045~058 涵蓋後端 LookupExecutor）。採樣策略調整為：Merge（TS-F029-019）、Filter（TS-F029-020）、Masking（TS-F029-021）+ Lookup（TS-F029-037）。
- **目前狀態**：仍採樣策略，其餘 9 種節點（FieldMapping、Format、Conditional、NullHandler、TypeCast、Deduplicate、String、Aggregate、DerivedColumn）僅依規格文件確認結構。
- **影響**：9 種未採樣節點的 JSONB 結構若與規格定義不符，可能在實作層未被測試發現
- **建議**：①維持採樣策略，要求開發者在 code review 時比對規格；②若日後規格有變動，需將受影響節點加入採樣測試集
- **風險等級**：低（採樣策略已有效降低風險；Lookup 缺口已填補）

### E05-RISK-002：F029 循環連線定義不明確

- **來源**：F029 AC-4 / BR-5（禁止逆向循環連線）
- **問題**：規格描述「禁止逆向循環連線」，但未精確定義「循環」的偵測範圍：
  - 直接循環（A→B, B→A）：規格有 TS-F029-013 明確覆蓋
  - 間接循環（A→B, B→C, C→A）：規格未提及，後端連線驗證邏輯是否包含間接循環未定義
- **影響**：若後端僅驗證直接循環（相鄰節點）而非完整 DAG 拓撲，間接循環可能被接受，導致 ETL 執行時進入無限迴圈
- **建議**：向 Architecture 確認連線驗證演算法是否支援完整 DAG 拓撲分析（非僅相鄰節點比對）；若是，補充間接循環場景（如 3 個節點相互連線）至 F029 測試設計
- **風險等級**：中（影響執行時穩定性）

### E05-RISK-003：F030 processed_count 更新粒度與 execution_count 的排除範圍

- **來源**：F030 BR-7（測試執行不計入 processed_count）
- **問題**：規格明確說明 `is_test_run=true` 的日誌不計入 `EtlPipeline.processed_count`，但未說明：
  - `EtlPipeline.execution_count` 是否也排除測試執行？（规格無此欄位定義）
  - `processed_count` 是在每個節點執行後累加，還是在 Load 節點完成後才更新？
  - 若 Pipeline 執行失敗，已處理的記錄數是否計入 `processed_count`？
- **影響**：TS-F030-008 僅驗證「processed_count 不增加」，但若 execution_count 行為不同，可能漏測
- **建議**：向 Product 確認 execution_count 是否排除測試執行；向 Architecture 確認 processed_count 的更新時機（建議：僅在 status=completed 時更新，失敗不更新）
- **風險等級**：低（功能上不影響核心邏輯，但可能導致統計數字不一致）

### E05-RISK-004：F031 排程引擎同步可測性（Scheduler Engine Testability）

- **來源**：F031 AC-1/AC-2（停用/啟用時排程引擎行為）
- **問題**：F031 規格要求停用時移除排程任務（removeJob）、啟用時重新註冊（addJob/registerJob），但排程引擎（如 Bull、node-cron、NestJS Schedule）不一定支援測試注入（spy/mock）。若排程引擎是全域單例或無法在測試環境替換，TS-F031-002 / TS-F031-004 / TS-F031-006 將無法自動化驗證。
- **影響**：相關場景可能只能驗證 DB 狀態（enabled/status 欄位），無法驗證排程引擎是否實際被呼叫
- **建議**：Architecture 在設計 Pipeline 啟用/停用服務時，將排程引擎依賴設計為可注入的 interface（Dependency Injection）；若無法注入，TS-F031-002/004/006 退為手動整合測試，並補充至 risks-and-gaps.md
- **風險等級**：中（影響 3 個測試場景的自動化可行性）

### E05-RISK-005：F033 Diff API 路由優先順序衝突

- **來源**：F033 AC-3（Diff 比對）
- **問題**：`GET /api/v1/etl/pipelines/:id/versions/diff` 與 `GET /api/v1/etl/pipelines/:id/versions/:versionId` 使用相同的路由前綴。若路由器按定義順序匹配，`"diff"` 字串可能被解析為 versionId（UUID），導致路由到錯誤的 handler，回傳 `PIPELINE_VERSION_NOT_FOUND`（404）而非 Diff 結果。
- **影響**：若路由優先順序錯誤，F033 Diff 端點（TS-F033-006 ~ TS-F033-010）全部失敗，且錯誤訊息為「版本不存在」而非路由問題，難以排查
- **建議**：① 靜態路由（`/diff`）必須在動態路由（`/:versionId`）之前定義；② 實作層驗證路由順序，加入測試備注；③ 若使用 NestJS，Controller 中確保 `@Get('diff')` 裝飾器優先於 `@Get(':versionId')`
- **風險等級**：中（實作層問題，需在 code review 中確認，但測試本身能夠揭露此問題）

### E05-RISK-006：E05 效能閾值未在 NFR 規格中明確定義

- **來源**：test-levels.md E05 NFR Tests（效能閾值）
- **問題**：F035 BR-7 定義「儀表板需在 2 秒內完成載入（50 個 Pipeline 基準）」，但其他 E05 效能需求未在 NFR 規格中明確定義：
  - Pipeline 列表 API（GET /pipelines）的 P95 閾值
  - 排程掃描（scanAndExecute）的執行時間上限
  - 版本 Diff 計算的回應時間上限
  - 大量版本（如 100 個版本）的版本清單查詢效能
- **影響**：無法設計可量測的 NFR 測試場景；test-levels.md 中的效能閾值（列表 P95 < 500ms、排程掃描 < 5 秒）為假設值，非規格定義
- **建議**：請 Architecture / Product 補充 E05 效能需求至 nfr.md；測試設計將依補充後的規格修訂
- **風險等級**：中（NFR 閾值缺失導致效能測試無法量化驗收）

### E05-RISK-007：F036 目標表 ETL 追蹤欄位自動填充的環境依賴

- **來源**：F036 AC-5（ETL 追蹤欄位自動填充）
- **問題**：TS-F036-018 / TS-F036-019 為跨模組 E2E 級測試，需要：
  ① Pipeline 已有合法的已發布版本（含 Load 節點，目標表為 customer_core）
  ② 完整的 ETL 執行環境（外部來源 DB + AppDB + Pipeline 執行引擎）
  ③ 目標表（customer_core）已由 migration 建立
  若任一條件不滿足，這兩個場景無法自動化執行。另外，`data_source` 欄位 nullable=true（AC-5 說「由系統自動填充」），但若 Datasource 名稱未設定，填充值可能為 null，與規格描述矛盾。
- **影響**：TS-F036-018/019 可能只能在完整整合環境中手動執行；`data_source` 欄位的行為需向 Arch 確認
- **建議**：① 先以 Unit Test 驗證 Load 節點注入追蹤欄位的邏輯；再以整合測試驗證完整 Pipeline 執行；② 向 Arch 確認：Datasource.name 為 null 時，data_source 填充 null 還是空字串？
- **風險等級**：中（影響 2 個跨模組場景的可測性）

### E05-RISK-008：F032 / F031 待確認的規格缺口

- **來源**：F032 Risks and Notes；F031 Risks and Notes
- **問題**：以下兩項規格缺口需向 Architecture 確認後才能完成測試場景設計：

  **F032：**
  1. `GET /api/v1/etl/pipelines/:id/logs` 在 Pipeline 已軟刪除時，BR-5 說日誌保留（應回 200），但錯誤碼表定義「不存在或已刪除」回傳 404。規格矛盾，目前 TS-F032-015 以 BR-5 精神（200）為假設，若確認為 404 則需修正
  2. `GET /api/v1/etl/logs/:logId` 的 404 錯誤碼未定義：應為 PIPELINE_LOG_NOT_FOUND（新增）還是複用 PIPELINE_NOT_FOUND？目前 TS-F032-018 預期結果留空待確認
  3. `nodeLogs` 陣列排列順序：依 definition 節點順序，還是依實際執行起始時間？目前 TS-F032-006 假設按執行順序，若不同需調整

  **F031：**
  1. 規格未定義 `running` 狀態 Pipeline 的後端 toggle 防護（前端按鈕停用，但後端是否也拒絕？）
  2. `draft → disabled`（對 draft Pipeline 送出 enabled=false）是否允許？規格未明確

- **影響**：F032 TS-F032-015、TS-F032-018 的預期結果不完整；F031 可能缺少 1~2 個後端防護場景
- **建議**：向 Architecture 確認上述 5 個問題，更新對應測試場景的預期結果
- **風險等級**：中（規格缺口直接影響 5 個測試場景的正確性）

---

## F036 US-049 修訂風險（2026-03-25 新增）

> 以下 5 項風險來自 2026-03-25 US-049「目標表 Domain-Oriented 規劃」重大修訂（目標表由 4 個改為 1 個），更新自 F036-test.md v2.0 的風險章節。

### F036-RISK-001：customer_core 欄位總數已確認為 85 — 已解決

- **來源**：US-049 目標表定義（A~H 分類欄位加總）
- **問題**：原規格標注「約 45 欄位」與實際不符。
- **決議（2026-04-01）**：A~H 分類加總為 85 欄（6+13+10+10+12+14+15+5），以 `target-table-schemas.ts` 為準。TS-F036-003、TS-F036-004、TS-F036-039 預期值已更新為 85。
- **風險等級**：~~中~~ → 已解決

### F036-RISK-002：ETL 轉換規則測試依賴 US-042 與 US-030

- **來源**：US-049 ETL 轉換規則（代碼描述、衝突解決）
- **問題**：
  - **代碼描述轉換**（TS-F036-026/027）：`_desc` 欄位由 US-030 代碼對照表填入。若 US-030 尚未完成，測試時代碼對照表不存在，無法驗證 `_desc` 欄位的正確性
  - **衝突解決**（TS-F036-028/029）：US-049 明確標注「於 US-042 處理」，實際衝突解決邏輯的程式碼位置尚未確認（可能在 US-042 的 Load 節點執行器，或是共用 ETL 服務）
- **影響**：TS-F036-026/027 在 US-030 完成前需以 stub 代碼對照表；TS-F036-028/029 在 US-042 完成前無法執行完整整合測試
- **建議**：①代碼描述測試：在測試環境注入靜態 stub 對照表（e.g., `educationCode["03"] = "大學"`）；②衝突解決測試：向 Architecture 確認邏輯實作位置後，補充對應 Unit Test 或整合測試的設置方式
- **風險等級**：中（影響 4 個測試場景，需等待依賴功能完成）

### F036-RISK-003：佔位電話值的精確定義需確認

- **來源**：US-049 ETL 轉換規則（電話合併：佔位值→NULL）
- **問題**：規格定義佔位值為「如 `00-0000000000`」，「如」暗示可能有其他佔位格式。實際來源資料中是否存在其他佔位值（如全零但格式不同 `0-000000000`、`000-00000000`、空字串等）未定義。若只過濾 `00-0000000000` 精確匹配，其他格式的佔位值將被寫入目標表，造成髒資料。
- **影響**：TS-F036-019/020 的佔位值輸入僅覆蓋 `00+0000000000`，若實際資料有其他佔位格式，測試覆蓋不足
- **建議**：向業務單位確認 ZZIP / MLMC 中電話佔位值的完整清單；將確認後的清單納入 test-data-strategy.md 電話測試資料表
- **風險等級**：中（影響 ETL 資料品質，建議在 UAT 前確認）

### F036-RISK-004：Phase 2/3 表在 Phase 1 不應存在的測試假設 — 已解決

- **來源**：US-049 Phase 擴展規劃；TS-F036-013
- **問題**：TS-F036-013 假設 Phase 1 migration 不建立 `customer_interaction`、`customer_financial`、`customer_service` 三個表。若 Architecture 決定 Phase 1 migration 預先建立所有 4 個表（為未來 Phase 2/3 預留），TS-F036-013 設計的「Phase 2/3 表回 404」場景的前提將失效，且 TS-F036-001（`data.length === 1`）也會失敗。
- **影響**：TS-F036-001 與 TS-F036-013 的正確性取決於 migration 策略
- **決議（2026-03-25）**：Phase 1 migration 只建立 `customer_core` 一張表。TS-F036-001（`data.length === 1`）與 TS-F036-013（Phase 2/3 表回 404）的測試預期值正確，無需調整。
- **風險等級**：~~高~~ → 已解決

### F036-RISK-005：前端欄位對應介面拖曳功能的自動化可測性

- **來源**：US-049 AC-4（欄位對應介面支援拖曳）；TS-F036-033
- **問題**：拖曳（Drag and Drop）操作在自動化測試框架（如 Playwright、Cypress）中的模擬行為與真實使用者拖曳存在差異（觸發事件順序、dataTransfer 物件等）。若拖曳事件實作不標準（如使用自訂 drag 事件而非 HTML5 Drag API），測試框架的 drag-and-drop helper 可能無效。
- **影響**：TS-F036-033（拖曳一對一對應）在 CI 自動化環境中可能不穩定或失敗；可能需要降為手動 E2E 測試
- **建議**：①優先驗證「下拉選單對應」路徑（TS-F036-034），該路徑自動化更穩定；②若拖曳為主要互動方式，需在實作時確認使用 HTML5 原生 Drag API（方便測試框架模擬），並在 test-levels.md 中標注拖曳場景為「手動 E2E 備選」
- **風險等級**：低（替代路徑已覆蓋，拖曳可退為手動測試）

---

## F039 節點欄位變化 Badge + Tooltip 風險

### F039-RISK-001：merge 節點左/右輸入識別方式未定義（阻斷性）

- **來源**：F039 Badge 規格（`左 N + 右 M → K`）、TS-F039-005、TS-F039-017、TS-F039-035
- **問題**：`computeNodeOutputColumns` 在 merge 節點需要區分「左側輸入」與「右側輸入」，以計算各自的欄位數。區分方式可能為：
  - 依 Handle ID（`left-input` / `right-input`）——需要 edges 攜帶 `targetHandle` 屬性
  - 依 edges 陣列中的連接順序——但陣列順序不保證穩定
  - 依節點資料中另存的 `leftSourceId` / `rightSourceId` 欄位
  目前現有的 `pipeline-node.tsx` 定義了 `id="left-input"` 與 `id="right-input"` 兩個 Handle，但規格未確認 edges 是否攜帶 `targetHandle`。
- **影響**：若 merge 節點左/右識別方式錯誤，`左 N + 右 M` 的計數會對調，導致 Badge 文字正確但語意錯誤；TS-F039-005 與 TS-F039-017 無法精確定義期望值
- **建議**：確認 React Flow 的 edge `targetHandle` 欄位在儲存定義時是否被保留；若是，以 `targetHandle === 'left-input'` 區分；若否，需在節點資料中儲存 `leftNodeId` / `rightNodeId`
- **風險等級**：高（阻斷 merge 相關測試場景最終化）

### F039-RISK-002：dropUnmapped=false 時 field_mapping 的欄位重命名行為未定義

- **來源**：TS-F039-003、TS-F039-015（OQ-F039-001 / OQ-F039-002）
- **問題**：規格定義「`dropUnmapped=false` 時透傳」，但未說明：
  - 已設定 mapping 的欄位是否從 `sourceColumn` 改名為 `targetColumn`？
  - 若改名，Badge 文字應顯示 `5 → 5（改名）` 或仍顯示 `5 → 5（-0）`？
  - 若不改名，`targetColumn` 的用途為何？
- **影響**：TS-F039-003 與 TS-F039-015 的預期輸出無法確定
- **建議**：與前端開發確認 `dropUnmapped=false` 的語意，建議明確定義：「`false` = 透傳，mapping 僅作為欄位重命名提示，`sourceColumn` 改名為 `targetColumn`，未設定 mapping 的欄位保持原名」
- **風險等級**：中（影響 2 個測試場景，不阻斷主要路徑）

### F039-RISK-003：Tooltip 邊界定位在 JSDOM 環境無法測試

- **來源**：TS-F039-039（OQ-F039-003）
- **問題**：JSDOM 的 `getBoundingClientRect()` 固定回傳全為 0 的物件，導致邊界定位邏輯（防止 tooltip 超出視窗）在單元/整合測試中無法透過實際計算驗證
- **影響**：TS-F039-039 無法以標準方式驗證 tooltip 不超出視窗邊界
- **建議**：將邊界定位邏輯提取為純函式 `clampToViewport(rect, viewportWidth, viewportHeight)`，直接以單元測試驗證數學計算；元件整合測試以 `vi.spyOn(element, 'getBoundingClientRect')` mock 座標驗證元件行為
- **風險等級**：低（替代測試路徑清晰可行）

### F039-RISK-004：computeNodeOutputColumns 快取策略影響 API 呼叫次數驗證

- **來源**：TS-F039-021（OQ-F039-005）
- **問題**：若 `computeNodeOutputColumns` 實作快取（同一 nodeId 的計算結果快取），則在測試中驗證「`getRawTableColumns` 僅被呼叫 1 次」是有意義的；但若無快取，則在遞迴圖中同一 extract 節點可能被多次計算，測試中的呼叫次數斷言需隨之調整
- **影響**：TS-F039-021 的「getRawTableColumns 僅被呼叫 1 次」斷言可能在無快取情境下誤判為失敗
- **建議**：在實作 `computeNodeOutputColumns` 時確認是否加入 memoization；若加入，測試可驗證 API 呼叫次數；若不加入，則移除此斷言，改為只驗證回傳結果正確
- **風險等級**：低（不影響功能正確性，僅影響測試斷言精確度）

---

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-12 | 初版建立，彙整 16 個 Feature 測試設計過程中的風險與缺口 | Test Designer Agent |
| 2026-03-18 | 新增 E04 資料擷取模組 6 項風險（E04-RISK-001 至 E04-RISK-006），均已獲核准解決方案 | Test Designer Agent |
| 2026-03-18 | 新增 raw data 落地需求 6 項風險（RAW-RISK-001 至 RAW-RISK-006）；RAW-RISK-004/005/006 為高風險，需於實作前確認 | Test Designer Agent |
| 2026-03-18 | 新增連鎖下拉選單需求 4 項風險（SCHEMA-RISK-001 至 SCHEMA-RISK-004）；SCHEMA-RISK-001/002 為中風險，001 影響 CI 穩定性，002 影響前端顯示設計 | Test Designer Agent |
| 2026-03-20 | 新增 E05 ETL Pipeline 管理模組 8 項風險（E05-RISK-001 至 E05-RISK-008）；整合自 F027~F036 各 test spec 的 Risks and Notes | Test Designer Agent |
| 2026-03-25 | 新增 F036 US-049 修訂風險 5 項（F036-RISK-001 至 F036-RISK-005）；因應目標表由 4 個改為 1 個的重大規格變更；F036-RISK-004 為高風險（migration 策略假設）需向 Architecture 確認 | Test Designer Agent |
| 2026-03-27 | 新增 F039 節點欄位變化 Badge + Tooltip 4 項風險（F039-RISK-001 至 F039-RISK-004）；F039-RISK-001（merge 左右識別）為高風險，阻斷 merge 相關場景最終化 | Test Designer Agent |
| 2026-03-31 | 新增 Lookup 節點雙輸入重設計測試場景（F029 TS-F029-032~037，F043 TS-F043-045~058）；更新 E05-RISK-001（Lookup 已從採樣策略提升至獨立覆蓋）；新增 LOOKUP-RISK-001~003 | Test Designer Agent |

---

## Lookup 節點雙輸入重設計風險（F029 / F043 / US-042 / US-058）

> 以下 3 項風險來自 2026-03-31 新增 Lookup 節點雙輸入測試設計過程。

### LOOKUP-RISK-001：lookup-input 連線的視覺樣式規格未定義量測基準

- **來源**：TS-F029-033（AC-7b）
- **問題**：規格說明 lookup-input 連線「以對照來源的視覺樣式建立，如虛線或不同顏色」，但未具體指定：①虛線的 CSS 樣式值（如 `strokeDasharray`）；②顏色值（hex 或 token）；③前端驗證方法（Canvas 截圖比對、DOM className 或 CSS variable）
- **影響**：TS-F029-033 的「視覺樣式不同」斷言無法自動化驗證，只能以人工視覺確認或截圖比對工具（如 Percy）實施
- **建議**：向 Architecture/UI 確認 lookup-input edge 的具體視覺規格（className 或 React Flow edgeType），測試改為驗證 DOM className 或 data attribute 而非像素比對
- **風險等級**：低（不影響功能正確性，僅影響自動化覆蓋）

### LOOKUP-RISK-002：向下相容模式 noMatchStrategy 在雙輸入模式下的行為未定義

- **來源**：TS-F043-054 / F043 Section 4.8 規格
- **問題**：規格明確說明雙輸入模式忽略 `noMatchStrategy`（AC-18 / US-058 AC-1），但節點設定 JSONB 中 `noMatchStrategy` 欄位仍存在（向下相容欄位）。如果節點設定同時含有 `noMatchStrategy` 與 `lookup-input` 連線，驗證應：①雙輸入模式強制 LEFT JOIN 語意（所有無匹配列補 null，等同 noMatchStrategy='null'）；②或以 noMatchStrategy 決定行為
- **影響**：若 LookupExecutor 實作未明確忽略 noMatchStrategy，雙輸入模式的行為可能受舊欄位影響，造成不一致結果
- **建議**：TS-F043-054 已設計驗證雙輸入模式完全忽略 DB 查詢，但無法間接驗證 noMatchStrategy 被忽略；建議補充測試：雙輸入模式下設定 noMatchStrategy='skip_row'，驗證無匹配列**仍然保留**（不被跳過）
- **風險等級**：中（設計意圖清晰但實作容易遺漏忽略邏輯）

### LOOKUP-RISK-003：扇出場景（TS-F043-058）依賴 F042 ExecutionEngine 框架完成

- **來源**：TS-F043-058（扇出場景 — 同一 Extract 接多個 Filter 各接不同 Lookup 節點）
- **問題**：TS-F043-058 為整合測試，需要 F042 ExecutionEngine 的拓撲排序、`collectInputs(edge.targetHandle ?? 'default')`、節點狀態回寫均已正確實作，才能有效驗證扇出場景
- **影響**：若 F042 尚未完成，TS-F043-058 無法執行；扇出時 `inputs['lookup-input']` 的路由正確性只能在整合層驗證，單元測試無法覆蓋
- **建議**：①F043 TDD 時先跳過 TS-F043-058，以 TS-F043-045~057 單元測試完成 LookupExecutor 實作；②F042 完成後再補充 TS-F043-058 整合測試；③確認 US-058 Technical Notes 描述的 `collectInputs()` 路由邏輯（`edge.targetHandle ?? 'default'`）已在 F042 測試中覆蓋（TS-F042-xxx 系列）
- **風險等級**：低（有明確的實作與測試順序，非阻斷性風險）

---

## E07 M08 Whitelist-Driven 重構測試風險（2026-05-20 新增）

> 以下 TEST-RISK 項目對應 F050 v2.1 / F051 v2.1 / F076 v1.5 / F068-deprecated 測試設計所識別的風險。
> 覆蓋 GAP-LIST §A~K 中未能完全確定的測試前提。

### TEST-RISK-001：_backfill_empty 標記的實作位置不明確

- **來源**：OQ-TEST-002 解答 / MT-M2-003 / IT-M01-016
- **問題**：`_backfill_empty = true` 的具體儲存位置（獨立 DB 欄位 vs condition_payload metadata vs 其他）在規格中未明確定義。測試設計假設存在可查詢的標記欄位，但實際欄位名稱待 architecture-spec §18.2.12 補充。
- **影響**：IT-M01-016 Step 2 的「查詢 _backfill_empty 標記」驗證步驟需在實作確定後補充具體 SQL
- **建議**：Phase 5 TDD Developer 在 M2 migration 設計時確認欄位名稱，並回報更新 MT-M2-003 / IT-M01-016 預期結果
- **風險等級**：中（影響 2 個場景的具體驗證語句，但不影響整體語意）

---

### TEST-RISK-002：Stage 1 生成 SQL 的攔截方式未確定

- **來源**：IT-M01-009、IT-M01-010、IT-M01-011、IT-M01-012
- **問題**：Stage 1 動態 SQL 生成後，測試無法直接斷言 SQL 字串。驗證需透過：①攔截 ORM query builder log；②查詢 DB 結果（間接驗證）；③在 Service 層注入 SQL spy
- **影響**：若採用間接驗證（查詢結果），測試資料設計複雜度高；若採用 SQL spy，需 Architecture 確認 test seam 位置
- **建議**：優先採用「查詢 staging 結果」間接驗證（確認篩選後 ob_pool_data 筆數符合 SQL 邏輯）；test seam（QueryBuilder spy）作為 Unit 補充
- **風險等級**：中（影響 4 個整合場景的驗證機制，需 Phase 5 決策）

---

### TEST-RISK-003：prod_kind 交集唯一性衝突的確切錯誤碼待確認

- **來源**：IT-M01-018 / TS-F050-013~016
- **問題**：architecture-spec §18.8 定義 prod_kind 交集唯一性規則，但 error-handling.md v1.15 中未見對應錯誤碼。IT-M01-018 斷言「error_code 含 prod_kind 衝突語意」但無法指定確切錯誤碼。
- **影響**：測試 assertion 不完整（只驗 HTTP 409，不驗確切 error_code 字串）
- **建議**：向 Architecture / Product Analyst 確認錯誤碼定義（建議 `PROD_KIND_INTERSECTION_CONFLICT` 或類似）；確認後更新 IT-M01-018 + TS-F050-013
- **風險等級**：中（影響 error contract 驗證完整性）

---

### TEST-RISK-004：M5 migration 測試只能在 staging/CI 執行，不可自動化於 prod

- **來源**：MT-M5-001~006 / AD-E07-18 §18.4.5（M5 高風險）
- **問題**：M5 DELETE ob_code_df 為不可逆操作。自動化測試若不小心在 prod 環境執行，將永久刪除生產資料。
- **影響**：MT-M5-002~006 需要明確的環境隔離機制（如 `NODE_ENV=test` + DB connection guard）
- **建議**：①在 migration test runner 加入環境檢查（reject prod connection string）；②M5 tests 加 `@skip('prod')` 標記；③ CI pipeline 使用獨立 staging Test Container（不連接 prod DB）
- **風險等級**：高（誤執行可能導致生產資料永久損失）

---

### TEST-RISK-005 ✅ Resolved（2026-05-21 v2）：spec_tp 52 筆 / TBL_ID='12'

- **來源**：TS-F076-003 / MT-M3-001
- **問題**（歷史）：`reference/DumpData/OBMCODEDF_20260505.csv` 中 SPEC_TP 對應的 TBL_ID 經歷兩次筆誤更正：v1 寫 `TBL_ID='09'`（實際為 best_case Y/N flag，2 筆）；v1.1 改為 `TBL_ID='02'`（實際為 PROD_KIND 3 筆 / 汽車・機車・一般商品三大類）。
- **解決**（v2 / 2026-05-21）：實際 SPEC_TP 在 `TBL_ID='12'`，共 **52 筆**（含本牌 / 他牌 / 重車 等品牌前綴細分；典型代碼 `01='本牌/新車'` / `11='他牌/新車'` / `42='重車_新車'` / `48='3C通訊家電'` / `99='其他'`）。option_value 取 TBL_CD、option_label 取 TBL_DESC1。MT-M3-001 / TS-F076-003 assertion 已更新為 `count = 52`。m283 v2 hardcoded 52 筆完整清單。
- **風險等級**：✅ 已解除（v2 落地後 assertion 與實際 dump 一致）

---

### TEST-RISK-006：caseyear wildcard 語意（99）的 Stage 1 SQL 生成邊界尚待 Architecture 確認

- **來源**：IT-M01-013、IT-M01-014 / OQ-TEST-001 解答
- **問題**：OQ-TEST-001 解答確認 values 含 99 → 不加 year_cnt 條件。但未確認：①若 values=['99'] 且無其他 categorical 條件，Stage 1 是否生成完全無 WHERE 的 SQL（可能全表掃描）；②values=['99','0'] 時是否正確跳過（而非只跳過 99 的部分）
- **影響**：IT-M01-013/014 的 SQL 攔截驗證需確認「完全無 year_cnt 條件」vs「year_cnt IS NULL 條件」的差異
- **建議**：Architecture 確認 Stage 1 SQL 生成邏輯：caseyear=99 wildcard 時完全省略 year_cnt JOIN/WHERE 子句，而非生成 `year_cnt IS NULL`；若邊界未定義，IT-M01-013 將成為 Architecture 決策的 regression guard
- **風險等級**：中（影響全表掃描效能風險評估）
