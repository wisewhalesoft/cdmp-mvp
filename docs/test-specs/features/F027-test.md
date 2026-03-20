---
type: test-design-feature
feature_id: F027
feature_name: 查看 Pipeline 列表
priority: P0-MVP
related_spec: /docs/specs/features/F027-pipeline-list.md
last_updated: 2026-03-20
---

# F027: 查看 Pipeline 列表 — 測試設計

---

## Acceptance Test Design

### AC-1：統計卡片正確性

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中存在多種狀態的 Pipeline |
| When | 呼叫 `GET /api/v1/etl/pipelines/stats` |
| Then | HTTP 200，回應含 total、active、running、draft、todayProcessed 五個欄位且數值正確 |
| 驗證步驟 | 1. total = 系統中所有未軟刪除 Pipeline 的總數<br>2. active = status 為 `active` 的筆數<br>3. running = status 為 `running` 的筆數<br>4. draft = status 為 `draft` 的筆數<br>5. todayProcessed 以 UTC+8（Asia/Taipei）計算今日範圍 |

### AC-2：Pipeline 列表欄位完整性

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中存在至少一筆 Pipeline |
| When | 呼叫 `GET /api/v1/etl/pipelines` |
| Then | HTTP 200，data 陣列中每筆 Pipeline 含規格定義的所有欄位 |
| 驗證步驟 | 1. 每筆含 id, name, version, stepCount, status, schedule, lastExecutionAt, nextExecutionAt, processedCount, createdBy, createdAt<br>2. 軟刪除 Pipeline 不出現（`deleted_at IS NOT NULL` 被排除）<br>3. 預設排序為 `created_at` DESC |

### AC-3：狀態篩選

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中存在多種狀態的 Pipeline |
| When | 呼叫 `GET /api/v1/etl/pipelines?status=active` |
| Then | 僅回傳 status 為 `active` 的 Pipeline，meta.total 反映篩選後數量 |
| 驗證步驟 | 1. data 陣列中每筆 status 均為指定值<br>2. pagination.total 僅計入符合條件的筆數 |

### AC-4：關鍵字搜尋

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中存在多筆 Pipeline |
| When | 呼叫 `GET /api/v1/etl/pipelines?keyword=客戶` |
| Then | 僅回傳名稱包含「客戶」的 Pipeline（模糊比對，大小寫不敏感） |
| 驗證步驟 | 1. 名稱包含 keyword 的 Pipeline 均出現<br>2. 名稱不含 keyword 的 Pipeline 不出現<br>3. 英文搜尋需大小寫不敏感（如 keyword=etl 能比對到 "ETL Pipeline"） |

### AC-5：分頁行為

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中有超過 10 筆 Pipeline |
| When | 呼叫 `GET /api/v1/etl/pipelines`（預設分頁） |
| Then | HTTP 200，data 最多 10 筆，pagination 含正確的 page、pageSize、total、totalPages |
| 驗證步驟 | 1. data.length <= 10<br>2. pagination.page = 1<br>3. pagination.pageSize = 10<br>4. pagination.totalPages = ceil(total / 10) |

### AC-6：空狀態

| 項目 | 內容 |
|------|------|
| Given | 系統中無任何 Pipeline（或篩選結果為空） |
| When | 呼叫 `GET /api/v1/etl/pipelines` |
| Then | HTTP 200，data = []，pagination.total = 0 |

---

## 測試資料定義

| 識別碼 | 資料說明 | 狀態 | 備註 |
|--------|---------|------|------|
| PL_DRAFT | 草稿 Pipeline，無排程，未執行 | draft | enabled=false |
| PL_ACTIVE | 已啟用 Pipeline，有排程，曾執行 | active | enabled=true |
| PL_RUNNING | 執行中 Pipeline | running | enabled=true |
| PL_FAILED | 執行失敗 Pipeline | failed | enabled=true |
| PL_DISABLED | 已停用 Pipeline | disabled | enabled=false |
| PL_DELETED | 已軟刪除 Pipeline | — | deleted_at IS NOT NULL |
| PL_TODAY | 今日（UTC+8）有 processedCount 記錄的 Pipeline | active | 用於 todayProcessed 邊界測試 |
| PL_YESTERDAY | 昨日（UTC+8）有 processedCount 記錄的 Pipeline | active | 用於 todayProcessed 邊界測試 |
| USER_ACTIVE | 非 Admin 的普通使用者帳號 | — | role=user |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F027-001 | 統計卡片基本正確性 | AC-1, BR-4 | Integration | PL_DRAFT × 2、PL_ACTIVE × 3、PL_RUNNING × 1、PL_FAILED × 1、PL_DISABLED × 1 | 1. `GET /api/v1/etl/pipelines/stats` | HTTP 200；total=8、draft=2、active=3、running=1；todayProcessed 為整數型態（>= 0） |
| TS-F027-002 | 列表基本查詢與欄位完整性 | AC-2, BR-2, BR-5 | Integration | PL_DRAFT、PL_ACTIVE、PL_RUNNING 各一筆存在 | 1. `GET /api/v1/etl/pipelines` | HTTP 200；data 每筆均含 id、name、version、stepCount、status、schedule、lastExecutionAt、nextExecutionAt、processedCount、createdBy、createdAt；排序 created_at DESC |
| TS-F027-003 | 狀態篩選（active） | AC-3 | Integration | PL_ACTIVE × 2、PL_DRAFT × 1、PL_RUNNING × 1 | 1. `GET /api/v1/etl/pipelines?status=active` | HTTP 200；data 長度為 2；所有 data[*].status = "active"；pagination.total = 2 |
| TS-F027-004 | 狀態篩選（running） | AC-3 | Integration | PL_RUNNING × 1、其他狀態各若干 | 1. `GET /api/v1/etl/pipelines?status=running` | HTTP 200；data 長度為 1；data[0].status = "running" |
| TS-F027-005 | 狀態篩選（draft） | AC-3 | Integration | PL_DRAFT × 3、PL_ACTIVE × 1 | 1. `GET /api/v1/etl/pipelines?status=draft` | HTTP 200；data 長度為 3；所有 data[*].status = "draft" |
| TS-F027-006 | 狀態篩選（failed） | AC-3 | Integration | PL_FAILED × 1、其他狀態各若干 | 1. `GET /api/v1/etl/pipelines?status=failed` | HTTP 200；data 中所有 status = "failed" |
| TS-F027-007 | 狀態篩選（disabled） | AC-3 | Integration | PL_DISABLED × 2、其他狀態各若干 | 1. `GET /api/v1/etl/pipelines?status=disabled` | HTTP 200；data 中所有 status = "disabled"；pagination.total = 2 |
| TS-F027-008 | 關鍵字搜尋（中文，模糊比對） | AC-4 | Integration | 「每日客戶同步 Pipeline」與「每週庫存 Pipeline」各一筆 | 1. `GET /api/v1/etl/pipelines?keyword=客戶` | HTTP 200；data 僅含「每日客戶同步 Pipeline」；pagination.total = 1 |
| TS-F027-009 | 關鍵字搜尋（英文，大小寫不敏感） | AC-4 | Integration | 「ETL Daily Pipeline」與「Customer Sync」各一筆 | 1. `GET /api/v1/etl/pipelines?keyword=etl` | HTTP 200；data 含「ETL Daily Pipeline」；keyword 大小寫不影響結果 |
| TS-F027-010 | 分頁第一頁（超過 10 筆） | AC-5 | Integration | 15 筆 Pipeline 存在 | 1. `GET /api/v1/etl/pipelines` | HTTP 200；data.length = 10；pagination = {page:1, pageSize:10, total:15, totalPages:2} |
| TS-F027-011 | 分頁第二頁（最後一頁不足 10 筆） | AC-5 | Integration | 15 筆 Pipeline 存在 | 1. `GET /api/v1/etl/pipelines?page=2` | HTTP 200；data.length = 5；pagination = {page:2, pageSize:10, total:15, totalPages:2} |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F027-012 | User 角色無法查看 Pipeline 列表 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 `GET /api/v1/etl/pipelines` | HTTP 403；error.code = "AUTH_FORBIDDEN" |
| TS-F027-013 | User 角色無法查看統計卡片 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 `GET /api/v1/etl/pipelines/stats` | HTTP 403；error.code = "AUTH_FORBIDDEN" |
| TS-F027-014 | 未攜帶 Token 被拒絕（列表端點） | NFR-001.1 | Integration | 無 Token | 1. 不攜帶 Authorization header 呼叫 `GET /api/v1/etl/pipelines` | HTTP 401；error.code = "AUTH_TOKEN_MISSING" |
| TS-F027-015 | 伺服器錯誤降級（列表 API） | 錯誤場景 | Integration | 模擬 DB 查詢失敗（stub 回 500） | 1. stub DB 使列表查詢拋出例外<br>2. 以 Admin Token 呼叫 `GET /api/v1/etl/pipelines` | HTTP 500；error.code = "SYSTEM_INTERNAL_ERROR"；回應 body 不含 stack trace 或內部實作細節 |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F027-016 | 軟刪除 Pipeline 不出現在列表 | BR-2 | Integration | PL_DELETED（deleted_at IS NOT NULL）與 PL_DRAFT 各一筆存在 | 1. `GET /api/v1/etl/pipelines` | HTTP 200；data 不含 PL_DELETED；pagination.total 不計入 PL_DELETED |
| TS-F027-017 | 軟刪除 Pipeline 不計入統計 | BR-2 | Integration | PL_ACTIVE × 2、PL_DELETED × 3 | 1. `GET /api/v1/etl/pipelines/stats` | total = 2（不含 3 筆已刪除）；active = 2 |
| TS-F027-018 | todayProcessed 時區邊界（UTC+8） | BR-4 | Integration | 在 UTC+8 00:00（即 UTC 前一日 16:00）前一秒有 processed 記錄（PL_YESTERDAY）；UTC+8 00:00 當日有 processed 記錄（PL_TODAY）。種子資料使用 `todayInTaipei()` 工廠函式產生，CI 設定 `TZ=Asia/Taipei` | 1. `GET /api/v1/etl/pipelines/stats` | todayProcessed 僅加計 UTC+8 今日範圍內的記錄，不含昨日記錄 |
| TS-F027-019 | 空狀態（無任何 Pipeline） | AC-6 | Integration | DB 中無任何 Pipeline | 1. `GET /api/v1/etl/pipelines` | HTTP 200；data = []；pagination = {page:1, pageSize:10, total:0, totalPages:0} |
| TS-F027-020 | 篩選無結果時空狀態 | AC-6（替代流程） | Integration | 系統只有 PL_DRAFT；無任何 active Pipeline | 1. `GET /api/v1/etl/pipelines?status=active` | HTTP 200；data = []；pagination.total = 0 |
| TS-F027-021 | 搜尋無結果時空狀態 | AC-6（替代流程） | Integration | 系統有「每日客戶 Pipeline」，無任何名稱含「庫存」的 Pipeline | 1. `GET /api/v1/etl/pipelines?keyword=庫存` | HTTP 200；data = []；pagination.total = 0 |
| TS-F027-022 | 統計卡片全為零（空系統） | AC-1 | Integration | DB 中無任何 Pipeline | 1. `GET /api/v1/etl/pipelines/stats` | HTTP 200；total=0、active=0、running=0、draft=0、todayProcessed=0 |

---

## 特殊驗證規則

### 回應欄位型態驗證（TS-F027-002 擴充）

列表 API 每筆 Pipeline 的欄位需符合以下型態與格式：

| 欄位 | 型態 | 格式 | 可為空 |
|------|------|------|--------|
| id | string | UUID v4 | 否 |
| name | string | — | 否 |
| version | integer | >= 1 | 否 |
| stepCount | integer | >= 0 | 否 |
| status | string | draft / active / running / failed / disabled | 否 |
| schedule | string | cron 格式 或 null | 是 |
| lastExecutionAt | string | ISO 8601 或 null | 是 |
| nextExecutionAt | string | ISO 8601 或 null | 是 |
| processedCount | integer | >= 0 | 否 |
| createdBy | string | 使用者姓名（非 ID） | 否 |
| createdAt | string | ISO 8601 | 否 |

### 統計卡片數值一致性

`GET /api/v1/etl/pipelines/stats` 的 total 必須等於 active + running + draft + failed + disabled（即所有非軟刪除 Pipeline 按狀態分類之和）。設計一個複合驗證場景：DB 中有各狀態 Pipeline 各若干筆，驗證 total 與各狀態計數之和相等。

---

## 測試環境注意事項

| 事項 | 說明 |
|------|------|
| 時區設定 | CI 環境需設定 `TZ=Asia/Taipei`，todayProcessed 時區邊界測試才能穩定 |
| 種子資料時間 | today / yesterday 邊界種子資料需使用 `todayInTaipei()` 工廠函式，不可使用硬編碼時間戳記 |
| 伺服器錯誤模擬 | 使用 stub / mock 方式讓 DB 查詢拋出例外，驗證 API 不洩漏 stack trace |
| 分頁邊界 | 15 筆資料集的第一頁、第二頁必須分開為獨立 test case（TS-F027-010 與 TS-F027-011） |
