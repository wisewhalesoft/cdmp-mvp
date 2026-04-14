---
type: test-design-feature
feature_id: F046
feature_name: Customer 360 — 客戶搜尋與清單
priority: P0-MVP
related_spec: /docs/specs/features/F046-customer-search-list.md
last_updated: 2026-04-13
---

# F046: Customer 360 — 客戶搜尋與清單 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F046-customer-search-list.md` + `error-handling.md#c360-errors` + `data-model.md#customer-core-entity` |
| QA / Tester | 本文件 + `error-handling.md#c360-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度評估章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + Test Container PostgreSQL）、前端 Unit（React Testing Library） |
| 遮罩驗證 | 以 Admin Token 與 User Token 分別呼叫相同端點，比較 sourceCustomerNo 與 mobilePhone 欄位值 |
| 安全性重點 | SQL Injection 防護（keyword 與 idNumber 參數）、未登入 401 回應 |
| 效能閾值 | 客戶清單分頁查詢 < 500ms（1,000 筆），統計摘要查詢 < 500ms |
| 測試資料策略 | 種子資料建立多種 customer_type_code（01/02/04）客戶；使用工廠函式產生遮罩前後預期值 |
| GIN 索引前置條件 | 所有 Full-Text Search 場景需預先建立 GIN 索引（AddCustomerCoreFullTextIndex Migration） |

---

## Acceptance Test Design

### AC-1：進入客戶清單頁面

| 項目 | 內容 |
|------|------|
| Given | 已登入使用者（Admin 或 User），`customer_core` 有資料 |
| When | 進入客戶清單頁面（`GET /api/v1/c360/customers` + `GET /api/v1/c360/customers/stats`） |
| Then | HTTP 200，stats 回傳四項統計數值，customers 回傳分頁清單 |
| 驗證步驟 | 1. stats.total = individual + corporate + foreign<br>2. data 陣列每筆含 customerId、name、customerTypeCode、customerTypeDesc、sourceCustomerNo、mobilePhone、companyName<br>3. pagination 含 page、pageSize、total、totalPages |

### AC-2：關鍵字搜尋（姓名）— Full-Text Search

| 項目 | 內容 |
|------|------|
| Given | `customer_core` 有含「王小明」的客戶，GIN 索引已建立 |
| When | `GET /api/v1/c360/customers?keyword=王小明` |
| Then | HTTP 200，data 包含 name 欄位含「王小明」的客戶 |
| 驗證步驟 | 1. 結果每筆 name 或 english_name 包含搜尋關鍵字<br>2. 不符合的客戶不出現在結果中 |

### AC-3：精確搜尋（身分證/統編）

| 項目 | 內容 |
|------|------|
| Given | `customer_core` 有 source_customer_no = 'A123456789' 的客戶 |
| When | `GET /api/v1/c360/customers?idNumber=A123456789` |
| Then | HTTP 200，data 最多 1 筆，且 sourceCustomerNo（Admin 明碼）= 'A123456789' |
| 驗證步驟 | 1. 使用 Admin Token 呼叫確認明碼比對<br>2. idNumber 優先於 keyword：同時傳入兩者時，只依 idNumber 比對 |

### AC-4：依客戶類型篩選

| 項目 | 內容 |
|------|------|
| Given | `customer_core` 含 customer_type_code = '01'、'02'、'04' 的客戶 |
| When | `GET /api/v1/c360/customers?type=02` |
| Then | HTTP 200，data 每筆 customerTypeCode = '02' |
| 驗證步驟 | 1. 回傳結果不含 customerTypeCode = '01' 或 '04'<br>2. 逗號分隔多值（如 `type=01,02`）篩選結果包含兩種類型 |

### AC-8：空狀態處理（搜尋無結果）

| 項目 | 內容 |
|------|------|
| Given | 搜尋條件無符合結果 |
| When | `GET /api/v1/c360/customers?keyword=不存在的名字XYZABC` |
| Then | HTTP 200，data: []，pagination.total: 0 |

### AC-9：customer_core 無資料

| 項目 | 內容 |
|------|------|
| Given | `customer_core` 表為空（ETL 未執行） |
| When | `GET /api/v1/c360/customers/stats` 與 `GET /api/v1/c360/customers` |
| Then | stats 回傳 {total:0, individual:0, corporate:0, foreign:0}；customers 回傳 data: []，total: 0 |

---

## Test Scenarios

### A. API Unit Tests — Stats Endpoint

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F046-001 | Stats API 回傳正確統計數值 | AC-1 | Integration | customer_core 含 10 筆個人（01）、5 筆企業（02）、3 筆外籍（04） | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers/stats` | HTTP 200，{total:18, individual:10, corporate:5, foreign:3} |
| TS-F046-002 | customer_core 為空時 Stats 全部為 0 | AC-9 | Integration | customer_core 表無資料 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers/stats` | HTTP 200，{total:0, individual:0, corporate:0, foreign:0} |
| TS-F046-003 | Stats API 未登入回傳 401 | 第 5.1 節錯誤回應 | Integration | 無有效 Token | 1. 不帶 Authorization Header 呼叫 `GET /api/v1/c360/customers/stats` | HTTP 401，AUTH_TOKEN_MISSING |

### B. API Unit Tests — Search/List Endpoint

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F046-004 | 以中文姓名關鍵字進行 Full-Text Search | AC-2 | Integration | customer_core 含 name='王小明' 的客戶，GIN 索引已建立 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?keyword=王小明` | HTTP 200，data 至少含 1 筆 name 包含「王小明」的客戶 |
| TS-F046-005 | 以英文姓名關鍵字進行 Full-Text Search | AC-2 | Integration | customer_core 含 english_name='Wang Xiao Ming' 的客戶，GIN 索引已建立 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?keyword=Wang` | HTTP 200，data 至少含 1 筆 english_name 包含「Wang」的客戶 |
| TS-F046-006 | 以 idNumber 精確比對 source_customer_no | AC-3 | Integration | customer_core 含 source_customer_no='A123456789' 的客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?idNumber=A123456789` | HTTP 200，data 恰好 1 筆，sourceCustomerNo（Admin 明碼）= 'A123456789' |
| TS-F046-007 | idNumber 優先於 keyword | BR-3（第 10 節） | Integration | customer_core 含 source_customer_no='A123456789' 且 name='王測試' 的客戶；另有純名稱含「王測試」的其他客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?keyword=王測試&idNumber=A123456789` | HTTP 200，data 僅含 source_customer_no='A123456789' 的客戶（keyword 被忽略） |
| TS-F046-008 | keyword 不足 2 字元回傳 C360_SEARCH_MIN_LENGTH | 第 12 節錯誤場景 | Integration | 無 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?keyword=王`（1 字元） | HTTP 422，C360_SEARCH_MIN_LENGTH |
| TS-F046-009 | 依 customer_type_code 篩選（type=01） | AC-4 | Integration | customer_core 含 01/02/04 三種類型客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?type=01` | HTTP 200，data 每筆 customerTypeCode='01'，不含 '02' 或 '04' |
| TS-F046-010 | 關鍵字搜尋與類型篩選組合（AND 邏輯） | AC-2 + AC-4 | Integration | customer_core 含不同類型且 name 含「王」的客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?keyword=王&type=01` | HTTP 200，data 每筆同時符合：name 包含「王」且 customerTypeCode='01' |
| TS-F046-011 | 分頁功能（第 2 頁） | AC-6 | Integration | customer_core 含 25 筆客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?page=2&pageSize=20` | HTTP 200，data.length=5，pagination={page:2, pageSize:20, total:25, totalPages:2} |
| TS-F046-012 | 超出範圍的頁碼回傳空陣列 | AC-6 | Integration | customer_core 含 10 筆客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?page=99&pageSize=20` | HTTP 200，data: []，pagination.total=10，pagination.totalPages=1 |
| TS-F046-013 | 未傳分頁參數時套用預設值 | 第 5.2 節預設值 | Integration | customer_core 含任意數量客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers`（不傳 page、pageSize） | HTTP 200，pagination.page=1，pagination.pageSize=20 |
| TS-F046-014 | 客戶清單 API 未登入回傳 401 | 第 5.2 節錯誤回應 | Integration | 無有效 Token | 1. 不帶 Authorization Header 呼叫 `GET /api/v1/c360/customers` | HTTP 401，AUTH_TOKEN_MISSING |

### C. 敏感資料遮罩測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F046-015 | Admin 看到完整明碼 source_customer_no | 第 6 節遮罩規則 | Integration | customer_core 含 source_customer_no='A123456789' 的客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers` | data 中該客戶 sourceCustomerNo = 'A123456789'（完整明碼） |
| TS-F046-016 | User 看到遮罩後的 source_customer_no | 第 6 節遮罩規則 | Integration | customer_core 含 source_customer_no='A123456789' 的客戶；User Token 就緒 | 1. 以 User Token 呼叫 `GET /api/v1/c360/customers` | data 中該客戶 sourceCustomerNo = 'A12****89'（前 3 + 後 2，中間以 `*` 填充） |
| TS-F046-017 | Admin 看到完整明碼 mobile_phone | 第 6 節遮罩規則 | Integration | customer_core 含 mobile_phone='0912345678' 的客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers` | data 中該客戶 mobilePhone = '0912345678'（完整明碼） |
| TS-F046-018 | User 看到遮罩後的 mobile_phone | 第 6 節遮罩規則 | Integration | customer_core 含 mobile_phone='0912345678' 的客戶；User Token 就緒 | 1. 以 User Token 呼叫 `GET /api/v1/c360/customers` | data 中該客戶 mobilePhone = '0912***78'（前 4 + 後 2，中間以 `*` 填充） |

### D. 邊界與異常場景

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F046-019 | customer_core 為空時清單與統計均為零 | AC-9 | Integration | customer_core 表無資料 | 1. 呼叫 `GET /api/v1/c360/customers/stats`<br>2. 呼叫 `GET /api/v1/c360/customers` | stats 全為 0；customers: data=[], total=0 |
| TS-F046-020 | 搜尋無結果時回傳空陣列 | AC-8 | Integration | customer_core 有資料，但無符合條件的客戶 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?keyword=XXXXNOTEXIST` | HTTP 200，data: []，pagination.total=0 |
| TS-F046-021 | SQL Injection 嘗試（keyword 參數） | 安全性 | Integration | customer_core 有資料 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?keyword=' OR '1'='1`（2 字元以上的注入字串）<br>2. 確認回應資料筆數未異常增加 | HTTP 200，data 依正常 Full-Text Search 回傳（不因 SQL Injection 回傳全表資料），無 500 錯誤 |
| TS-F046-022 | 超長 keyword 的處理 | 邊界值 | Integration | 無 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers?keyword=（100 字元以上的字串）` | HTTP 200 或 HTTP 422（422 需含 VALIDATION_ERROR）；不得回傳 500 |

### E. 效能測試（NFR-002）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F046-023 | 1,000 筆資料下清單查詢回應時間 < 500ms | NFR-002.5 | Performance | customer_core 含 1,000 筆資料，GIN 索引已建立 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers`<br>2. 記錄 P95 回應時間 | P95 回應時間 < 500ms |

### F. 前端測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F046-024 | 統計摘要卡片渲染正確數值 | AC-1，第 9.1 節 | Frontend Unit | stub stats API 回傳 {total:100, individual:60, corporate:30, foreign:10} | 1. 渲染客戶清單頁面 | 4 張統計卡片分別顯示 100、60、30、10；數值格式為整數，無小數點 |
| TS-F046-025 | 搜尋輸入框少於 2 字元時顯示提示且不觸發 API | AC-9.2 節 | Frontend Unit | 頁面已渲染 | 1. 在搜尋框輸入「王」（1 字元）<br>2. 按 Enter | 搜尋框下方顯示「請輸入至少 2 個字元」提示；不發送 API 請求（spy 驗證） |
| TS-F046-026 | 類型篩選下拉選單變更時立即觸發 API 呼叫 | AC-4，BR-8 | Frontend Unit | 頁面已渲染，spy API 呼叫 | 1. 從「全部」切換為「企業」 | 立即觸發含 type=02 的 API 請求（前端不做本地篩選） |
| TS-F046-027 | 表格渲染正確欄位與遮罩值 | AC-5 | Frontend Unit | stub API 回傳含遮罩的客戶清單（User 角色） | 1. 渲染客戶清單表格 | 欄位包含客戶姓名、類型、身分證/統編（遮罩值 A12****89）、行動電話（遮罩值 0912***78）、公司名稱 |
| TS-F046-028 | 分頁控制元件導航功能正確 | AC-6 | Frontend Unit | stub API 回傳 totalPages=3；目前在第 1 頁 | 1. 點擊「下一頁」按鈕 | 觸發 page=2 的 API 請求；分頁顯示更新為第 2 頁 |
| TS-F046-029 | 搜尋無結果時顯示空狀態 | AC-8 | Frontend Unit | stub API 回傳 data=[], total=0 | 1. 渲染清單頁面 | 顯示「找不到符合條件的客戶」提示；顯示「清除篩選條件」按鈕；不顯示表格框架 |
| TS-F046-030 | customer_core 無資料時顯示說明訊息 | AC-9 | Frontend Unit | stub stats 回傳 total=0；stub customers 回傳 data=[], total=0 | 1. 渲染清單頁面 | 顯示「客戶資料尚未載入，請聯絡管理員執行 ETL Pipeline」；統計卡片數值均為 0；不顯示空的表格框架 |
| TS-F046-031 | 點擊客戶列導覽至詳情頁 | AC-7 | Frontend Unit | stub API 回傳含 customerId='550e8400-...' 的客戶 | 1. 點擊客戶列 | 導覽至 `/c360/customers/550e8400-...`（F047 詳情頁） |
