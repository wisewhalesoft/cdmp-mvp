---
type: test-design-levels
last_updated: 2026-03-20
---

# 測試層級策略

> 本文件定義 CDMP MVP 各測試層級的覆蓋策略、責任邊界與執行方式。

---

## 1. Unit Tests — 單元測試

### 1.1 Auth 模組

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| 密碼雜湊與比對（bcrypt） | NFR-001.3 — 密碼安全性為 P0 | 驗證 cost factor >= 10、明文不儲存 |
| JWT Token 產生與解析 | NFR-001.1 — Token 管理為核心安全機制 | Payload 欄位驗證、過期時間計算（8h / 30d） |
| Token Blocklist 查詢 | F003 — 登出後舊 Token 必須被拒絕 | Blocklist 命中/未命中、過期記錄清理 |
| 密碼重設 Token 驗證 | F009 — Token 有效期 24h、一次性使用 | 過期判斷、已使用判斷、無效 Token |

### 1.2 Account 模組

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| Email 正規化（toLowerCase） | F004 AC-2 — 大小寫不敏感唯一性 | 各種大小寫混合輸入轉換 |
| 帳號狀態轉換 | F007 — active ↔ disabled | 合法轉換、自我停用阻擋 |
| 最後 Admin 保護邏輯 | F008 AC-2 — 系統必須保留至少一位 Admin | Admin 計數查詢、邊界情況（恰好 1 位） |
| 欄位驗證（name / email / password / role） | F004 AC-3 — 各欄位驗證規則 | 必填、長度、格式、列舉值 |

### 1.3 Datasource 模組

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| AES-256 加密／解密 | NFR-001.4 — 憑證靜態加密 | 加密後不可讀、解密還原正確 |
| 名稱唯一性檢查（排除軟刪除） | F011 AC-2 — 名稱唯一 | 同名未刪除記錄阻擋、同名已刪除記錄允許 |
| 狀態重置邏輯 | F013 BR-4 — 編輯後 status 重設為 unknown | 編輯觸發狀態重置 |
| 預設 Port 對應 | F011 BR-5 — MySQL=3306 / PostgreSQL=5432 / SQL Server=1433 | 各類型預設值 |
| 軟刪除過濾 | F014 BR-3 — 查詢排除 deleted_at IS NOT NULL | 軟刪除記錄不出現在查詢結果 |

### 1.4 Scheduler 模組

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| 健康檢查排程邏輯 | F016 AC-3 — 每 30 分鐘自動檢查 | 排程觸發、排除已刪除資料來源 |
| 連續失敗計算 | F016 AC-6 — 連續 >= 2 次失敗觸發警示 | 計數邏輯、恢復後重置 |
| 歷史紀錄清理 | OQ-10 — 保留 90 天 | 超過 90 天記錄被清理 |

### 1.5 Shared Infra（共用基礎設施）

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| Input Sanitization | OWASP — XSS / SQL Injection 防護 | 惡意輸入被消毒 |
| 分頁參數解析 | F005 / F012 — page / limit 參數 | 預設值、邊界值、無效值 |
| 錯誤回應格式化 | error-handling.md — 標準錯誤格式 | JSON 結構、欄位驗證 details 格式 |

---

## 2. Integration Tests — 整合測試

### 2.1 API 端點整合測試

每個 API 端點需驗證完整的請求→中介層→業務邏輯→資料庫→回應流程。

| 端點 | 方法 | 相關 Feature | 驗證重點 |
|------|------|-------------|---------|
| `/api/auth/login` | POST | F001, F002 | 成功登入（Admin/User）、無效憑證、帳號停用、Rate Limiting |
| `/api/auth/logout` | POST | F003 | Token 失效、Blocklist 寫入 |
| `/api/auth/forgot-password` | POST | F009 | Email 存在/不存在一致回應、Token 產生 |
| `/api/auth/reset-password` | POST | F009 | Token 驗證、密碼更新、Session 失效 |
| `/api/accounts` | POST | F004 | 帳號建立、Email 重複、欄位驗證 |
| `/api/accounts` | GET | F005 | 分頁、搜尋、篩選、排序 |
| `/api/accounts/:id` | PUT | F006 | 帳號更新、Email 唯一性、404 |
| `/api/accounts/:id/status` | PATCH | F007 | 停用/啟用、自我停用阻擋、Token 失效 |
| `/api/accounts/:id/role` | PATCH | F008 | 角色變更、最後 Admin 保護 |
| `/api/accounts/:id/reset-password` | POST | F010 | 密碼重設、自我重設阻擋 |
| `/api/datasources` | POST | F011 | 建立資料來源、名稱重複、密碼加密 |
| `/api/datasources` | GET | F012 | 分頁、搜尋、篩選、排除軟刪除 |
| `/api/datasources/:id` | GET | F013 | 單筆查詢、密碼不回傳 |
| `/api/datasources/:id` | PUT | F013 | 更新、密碼處理、狀態重置 |
| `/api/datasources/:id` | DELETE | F014 | 軟刪除、已刪除再刪除 404 |
| `/api/datasources/:id/test` | POST | F015 | 連線測試成功/失敗/逾時 |
| `/api/datasources/dashboard` | GET | F016 | 摘要統計、資料正確性 |
| `/api/datasources/:id/metrics` | GET | F016 | 效能指標、時間範圍篩選 |
| `/api/datasources/alerts` | GET | F016 | 警示清單、排序 |

### 2.2 中介層整合測試

| 中介層 | 驗證重點 |
|--------|---------|
| JWT 驗證 | 有效 Token 放行、過期 Token 拒絕（401）、無效簽章拒絕、Blocklist Token 拒絕 |
| RBAC | Admin 端點 — Admin Token 放行 / User Token 拒絕（403）；公開端點（login / forgot-password）— 無 Token 放行 |
| Rate Limiting | 登入端點 5 次/分鐘/IP；超過回傳 429 |
| CORS | 允許的 Origin 放行、非允許的 Origin 拒絕 |
| Input Sanitization | XSS payload 被清理、SQL Injection 被阻擋 |

---

## 3. System / E2E Tests — 端對端測試

### 對應 UI 原型頁面的完整瀏覽器流程

| 流程 | 涵蓋 Feature | 關鍵驗證點 |
|------|-------------|-----------|
| Admin 登入 → 管理後台首頁 | F001 | 表單提交、JWT 取得、頁面導向 |
| User 登入 → 說明頁面 | F002 | 角色區分導向、Admin 路由阻擋 |
| 登出 → 登入頁面 | F003 | Session 清除、返回鍵阻擋 |
| 建立帳號 → 帳號清單 | F004, F005 | 表單填寫、清單更新 |
| 帳號清單搜尋篩選 | F005 | 搜尋、角色篩選、狀態篩選、分頁 |
| 編輯帳號 | F006 | 表單預填、儲存、清單更新 |
| 停用/啟用帳號 | F007 | 確認對話框、狀態變更、視覺標記 |
| 角色變更 | F008 | 確認對話框、最後 Admin 保護 |
| 忘記密碼 → 重設密碼 → 登入 | F009 | Email 發送、連結點擊、密碼更新 |
| Admin 重設密碼 | F010 | 對話框、密碼規則驗證 |
| 新增資料來源 → 清單 | F011, F012 | 表單填寫、預設 Port、清單更新 |
| 編輯資料來源 | F013 | 預填表單、密碼處理、狀態重置 |
| 刪除資料來源 | F014 | 確認對話框、清單移除 |
| 測試連線 | F015 | 測試中狀態、結果顯示、狀態更新 |
| 儀表板瀏覽 | F016 | 摘要統計、圖表渲染、警示清單 |

---

## 4. Non-Functional Tests — 非功能測試

### 4.1 效能測試

| 測試項目 | NFR | 閾值 | 驗證方法 |
|---------|-----|------|---------|
| API 回應時間（CRUD） | NFR-002.1 | p95 < 500ms | 負載測試工具對各端點發送請求，量測 p95 |
| 並發使用者 | NFR-002.2 | 100 人並發，回應時間 <= 2x 基準值 | 100 並發使用者模擬，比較單一使用者基準值 |
| 連線測試逾時 | NFR-002.3 | 10 秒內回傳結果 | 對不可達主機發起連線測試，驗證 10 秒逾時 |
| 儀表板載入 | NFR-002.4 | < 2 秒（50 個資料來源） | 50 個資料來源環境下量測初始渲染時間 |
| 清單分頁效能 | NFR-002.5 | < 500ms（1,000 筆資料） | 1,000 筆帳號/資料來源下量測分頁 API 回應時間 |

### 4.2 安全性測試

| 測試項目 | NFR | 驗證方法 |
|---------|-----|---------|
| JWT Token 管理 | NFR-001.1 | 驗證閒置 8h 後 Token 失效、登出後舊 Token 被拒絕、「記住我」Token 30 天有效 |
| RBAC 強制執行 | NFR-001.2 | User 角色逐一測試每個 Admin 端點 → 預期全部回傳 403；記錄日誌驗證 |
| 密碼安全性 | NFR-001.3 | 資料庫直接查詢 password_hash — 驗證為 bcrypt 格式、cost factor >= 10；日誌掃描 — 驗證無明文密碼 |
| 憑證保護 | NFR-001.4 | API 回應檢查 — 密碼欄位為遮罩（`****`）或不存在；日誌掃描 — 驗證無憑證明文 |
| 傳輸安全 | NFR-001.5 | TLS 掃描 — 驗證 TLS 1.2+；HTTP 請求 — 驗證被拒絕或重導至 HTTPS |

### 4.3 可觀測性測試

| 測試項目 | 驗證方法 |
|---------|---------|
| 日誌遮罩敏感欄位 | 觸發密碼相關操作 → 檢查日誌檔 → 驗證無密碼明文、無資料庫連線密碼 |
| 未授權存取日誌 | User 嘗試存取 Admin 端點 → 驗證日誌包含 userId、端點、時間戳記 |
| 稽核日誌完整性 | 帳號停用/密碼重設/資料來源刪除 → 驗證 audit log 記錄存在且不含敏感值 |

---

---

## E05 ETL Pipeline 管理模組測試策略（F027–F036）

> 本章節補充 E05 模組特有的測試層級策略，與前述各層級策略共同適用。

### E05 Unit Tests

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| Pipeline 名稱唯一性檢查（排除軟刪除） | F028 AC-2 / BR-2 | 同名未刪除記錄阻擋；軟刪除後名稱可重用 |
| Cron 表達式驗證邏輯 | F028 BR-4 — 5 欄位（`0 2 * * *`）與 6 欄位（`0 0 2 * * *`）均合法；4 欄位或值超出範圍須拒絕 | 各格式邊界值、白名單驗證（使用 `cron-parser` 或同等套件） |
| Pipeline 連線驗證規則（BR-2 ~ BR-5） | F029 AC-4 — Extract/Transform/Load 連線方向規則 | 9 種合法/非法組合（含逆向循環、Load 終端節點）；每種組合獨立驗證 |
| 成功率計算公式 | F035 BR-3 — successRate = success / (success + failed) * 100 | 分母為零回傳 0.0（不除以零）；一位小數四捨五入（75.0、88.9） |
| progressPercent 計算 | F035 AC-4 — processedCount / totalCount * 100 | totalCount=0 時回傳 0.0；totalCount > 0 時精確計算 |
| 排程掃描條件（scanAndExecute 篩選邏輯） | F030 BR-4、F033 BR-5 — 僅觸發 status=active 且 enabled=true 且有 published 版本的 Pipeline | draft 不觸發；running 跳過；disabled 跳過；軟刪除排除 |
| 版本號遞增規則 | F033 AC-4 — 回滾建立新版本，版本號 = max(version) + 1 | 單版本（max=1 → 新版本=2）；多版本（max=5 → 新版本=6）；非依 created_at 排序 |
| is_test_run 隔離規則 | F030 BR-7、F035 BR-4/BR-5 — 測試執行不計入 Pipeline.processed_count | processed_count 累加邏輯需過濾 is_test_run=true；統計 API 均需排除測試執行 |
| step_count 更新（BR-6） | F029 AC-9 — PUT definition 後 etl_pipelines.step_count = definition.nodes.length | 0 個節點→step_count=0；3 個節點→step_count=3；覆寫時正確更新 |

### E05 Integration Tests

#### E05 API 端點整合測試

| 端點 | 方法 | 相關 Feature | 驗證重點 |
|------|------|-------------|---------|
| `/api/v1/etl/pipelines/stats` | GET | F027 | 統計卡片五欄位數值一致性（total = active+running+draft+failed+disabled）；軟刪除排除；todayProcessed UTC+8 邊界 |
| `/api/v1/etl/pipelines` | GET | F027 | 狀態篩選（5 種）；關鍵字搜尋（中英文大小寫不敏感）；分頁；軟刪除排除 |
| `/api/v1/etl/pipelines` | POST | F028 | Pipeline 建立（含/不含排程）；同步建立 EtlPipelineVersion v1；名稱唯一性（排除軟刪除）；Cron 驗證 |
| `/api/v1/etl/pipelines/:id/definition` | GET | F029 | 空定義還原；含節點與連線的定義還原；各欄位型態 |
| `/api/v1/etl/pipelines/:id/definition` | PUT | F029 | 連線驗證矩陣（9 種組合）；step_count 同步更新；changeSummary 500/501 字元邊界；JSONB 完整性（Merge/Filter/Masking） |
| `/api/v1/extraction-tasks/raw-tables` | GET | F029 | 可用 raw data 表清單；空清單（無已完成任務） |
| `/api/v1/etl/pipelines/:id/execute` | POST | F030 | 202+logId；triggered_by=manual；Pipeline.status→running；重複觸發 409；無 definition 422 |
| `/api/v1/etl/pipelines/:id/test` | POST | F030 | is_test_run=true；triggered_by=test；版本 draft→testing（成功後）；processed_count 不累加 |
| `/api/v1/etl/pipelines/:id/progress` | GET | F030 | 執行中完整欄位（processedCount/totalCount/progressPercent/currentNode） |
| `/api/v1/etl/pipelines/:id/toggle` | PATCH | F031 | active→disabled（removeJob 驗證）；disabled→active（addJob 驗證）；PIPELINE_DRAFT_CANNOT_ENABLE；無排程時不呼叫 removeJob |
| `/api/v1/etl/pipelines/:id/logs` | GET | F032 | 9 欄位完整性；startedAt 降序；測試執行標記；分頁；軟刪除後日誌仍可存取 |
| `/api/v1/etl/logs/:logId` | GET | F032 | 12 頂層欄位 + nodeLogs 7 欄位；失敗節點 errorMessage；執行中 finishedAt=null |
| `/api/v1/etl/pipelines/:id/versions` | GET | F033 | 降序；無 definition 欄位；三種狀態混合 |
| `/api/v1/etl/pipelines/:id/versions/:versionId` | GET | F033 | 含完整 definition JSONB；深度比對完整性 |
| `/api/v1/etl/pipelines/:id/versions/diff` | GET | F033 | nodesAdded/nodesRemoved/nodesModified/edgesAdded/edgesRemoved 各獨立場景；from=to 全空差異邊界；路由優先順序（"diff" 不被誤解為 versionId） |
| `/api/v1/etl/pipelines/:id/versions/:versionId/rollback` | POST | F033 | 新版本號遞增；status=draft；definition 深度複製；原始版本不修改 |
| `/api/v1/etl/pipelines/:id/versions/:versionId/publish` | PATCH | F033 | testing→published；EtlPipeline.version 同步更新；舊 published 版本不改變；PIPELINE_PUBLISH_REQUIRES_TEST（draft 版本或無成功測試執行） |
| `/api/v1/etl/pipelines/:id` | DELETE | F034 | 軟刪除（deleted_at IS NOT NULL）；running 不可刪除（409）；日誌保留；名稱唯一性釋放 |
| `/api/v1/etl/dashboard/stats` | GET | F035 | 五欄位數值；UTC+8 今日邊界；is_test_run 排除；successRate 精度 |
| `/api/v1/etl/dashboard/trend` | GET | F035 | 7d/14d/30d 資料點數量；is_test_run 排除；range 白名單（422） |
| `/api/v1/etl/dashboard/running` | GET | F035 | progressPercent 計算；totalCount=0 邊界；Polling fake timer |
| `/api/v1/etl/dashboard/failures` | GET | F035 | 今日 UTC+8 失敗清單；is_test_run 排除；空陣列 |
| `/api/v1/etl/dashboard/slowest` | GET | F035 | Top 5 嚴格降序；is_test_run 排除；最多 5 筆 |
| `/api/v1/etl/target-tables` | GET | F036 | 4 個目標表；columnCount 正確；domain 欄位值 |
| `/api/v1/etl/target-tables/:tableName/schema` | GET | F036 | columns 陣列長度；isPrimaryKey/isEtlTracking 標示；追蹤欄位 nullable |

#### E05 排程引擎整合測試

| 測試目標 | 驗證方式 |
|---------|---------|
| 排程觸發使用最新 published 版本（非舊版） | `scanAndExecute(fakeNow)` + 驗證 EtlPipelineLog.version = max(published version) |
| draft Pipeline 不被排程觸發 | `scanAndExecute(fakeNow=觸發時間)` + 驗證無新 EtlPipelineLog |
| running Pipeline 被排程跳過 | `scanAndExecute(fakeNow=觸發時間)` + 驗證不新增 EtlPipelineLog |
| 停用時排程引擎移除任務（removeJob） | spy 排程引擎 removeJob；PATCH /toggle enabled=false |
| 啟用時排程引擎重新註冊任務（addJob） | spy 排程引擎 addJob；PATCH /toggle enabled=true |
| 無排程 Pipeline 停用時不呼叫 removeJob | spy 確認 removeJob 未被呼叫 |

> **Injectable Time 模式**：F030 / F033 排程測試與 F023（E04）採相同 `scanAndExecute(fakeNow: Date)` 模式，不依賴真實計時器。
>
> **Polling Helper**：`waitForPipelineStatus(logId, expectedStatus, timeoutMs=10000)` 間隔 300ms polling EtlPipelineLog.status，達到預期狀態後繼續，超時拋出錯誤。

#### E05 版本狀態流轉整合測試

| 狀態流轉 | 觸發操作 | 驗證要點 |
|---------|---------|---------|
| draft → testing | 測試執行成功（POST /test + waitForPipelineStatus completed） | EtlPipelineVersion.status = "testing" |
| testing → published | PATCH /publish | EtlPipelineVersion.status = "published"；EtlPipeline.version 更新 |
| active → running → active | 手動執行成功 | EtlPipeline.status 執行中=running，完成後=active |
| draft → running → draft | 測試執行成功 | EtlPipeline.status 完成後回歸 draft（非 active） |
| running → failed | 執行失敗（stub 節點拋出錯誤） | EtlPipeline.status=failed；EtlPipelineLog.error_message 非空 |
| active → disabled | PATCH /toggle enabled=false | EtlPipeline.status=disabled、enabled=false |
| disabled → active | PATCH /toggle enabled=true（需有 published 版本） | EtlPipeline.status=active、enabled=true |
| failed → disabled | PATCH /toggle enabled=false | EtlPipeline.status=disabled |

### E05 System / E2E Tests

| 流程 | 涵蓋 Feature | 關鍵驗證點 |
|------|-------------|-----------|
| 建立 Pipeline → 編輯定義 → 測試執行 → 發布 → 排程觸發 | F028, F029, F030, F033 | 完整 Pipeline 生命週期；版本狀態流轉（draft→testing→published） |
| Pipeline 列表篩選與搜尋 | F027 | 狀態篩選；關鍵字搜尋；分頁；統計卡片一致性 |
| 未儲存變更離開確認對話框 | F029 | dirty flag 追蹤；確認/取消對話框 |
| 非法連線嘗試的視覺提示 | F029 | 紅色提示訊息；連線未建立 |
| 停用/啟用 Pipeline 列表即時更新 | F031 | Badge 即時更新；按鈕切換；running/draft 按鈕 disabled |
| 刪除 Pipeline 確認對話框 | F034 | 對話框內容；取消不刪除；running 按鈕停用 |
| Pipeline 監控儀表板 Polling 更新 | F035 | fake timer 5 秒觸發；進度條更新 |
| ETL 追蹤欄位自動填充 | F036 | Load 執行後 _etl_loaded_at / _etl_pipeline_id / data_source 非 null |

### E05 Non-Functional Tests

#### 效能閾值

| 測試項目 | 閾值 | 資料量 | 驗證方法 |
|---------|------|-------|---------|
| Pipeline 列表 API（GET /pipelines） | P95 < 500ms | 1,000 筆 Pipeline | 負載測試工具 |
| Pipeline 統計 API（GET /pipelines/stats） | P95 < 500ms | 1,000 筆 Pipeline + 30 天日誌 | 負載測試工具 |
| Pipeline 監控儀表板（全部 5 個端點） | < 2 秒（含前端渲染） | 50 個 Pipeline | 瀏覽器效能工具 |
| 排程掃描執行（scanAndExecute） | < 5 秒 | 100 個 active Pipeline | 計時驗證 |
| 版本 Diff 計算 | P95 < 1 秒 | definition 含 50 個節點 | API 回應時間量測 |

> **注意**：以上閾值來自規格（F035 BR-7：儀表板 < 2 秒；50 個 Pipeline 基準）。Pipeline 列表與排程掃描的精確閾值需向架構師確認後補充至 risks-and-gaps.md（E05-RISK-006）。

#### 安全性測試

| 測試項目 | 驗證方式 |
|---------|---------|
| E05 全端點 RBAC（User 403） | User Token 逐一測試 F027–F036 所有受保護端點 |
| Pipeline definition JSONB 注入 | PUT /definition 傳入含 `$where` / prototype pollution 攻擊向量，驗證 JSONB 儲存後無執行 |
| 排程引擎表達式安全 | POST /pipelines 傳入含 Shell Injection 的 cron 字串（如 `; rm -rf /`），驗證 cron-parser 拒絕而非執行 |

---

## 測試執行建議

### CI Pipeline 分層

| 階段 | 測試類型 | 預估時間 | 觸發條件 |
|------|---------|---------|---------|
| Pre-commit | Lint + 靜態分析 | < 30s | 每次 commit |
| Unit | 單元測試 | < 2min | 每次 push |
| Integration | API 整合測試 | < 5min | 每次 push |
| E2E | 瀏覽器端對端測試 | < 15min | PR merge 前 |
| NFR | 效能 + 安全性 | < 30min | Release 前 / 週期性 |
