---
type: test-design-feature
feature_id: F070
feature_name: 新增 CARD_TYPE 計分卡類型
priority: P0-MVP
related_spec: /docs/specs/features/F070-create-card-type.md
last_updated: 2026-05-14
---

# F070: 新增 CARD_TYPE 計分卡類型 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F070-create-card-type.md` + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + SQLite in-memory）、Frontend Unit（React Testing Library） |
| 同 transaction 驗證策略 | POST 成功後，同一測試案例查詢 ob_card_type 與 ob_levelcard_version 兩張表，確認均新增一筆（無需 mock transaction，直接 DB 查詢驗證） |
| v1 初值驗證 | ob_levelcard_version.sdate = 今日 YYYYMMDD、edate = '20991231'、status = 'active'；使用 `new Date().toISOString().substring(0,10).replace(/-/g,'')` 計算期望值 |
| Rollback 守護 | TC-F070-17 需模擬 ob_levelcard_version INSERT 失敗；建議用 test-only service mock 攔截 TypeORM save；SQLite 環境 savepoint 行為見 RISK-F070-01 |
| 月名單分派鎖 seed 格式 | 所有月名單分派鎖 TC 必須 seed AssignmentRun 全部 4 個 NOT NULL 欄位（run_id / project_workym / triggered_by / created_at），缺一即 SQLite constraint failed |

---

## Acceptance Test Design

### AC-1：同 transaction 建立 ob_card_type + ob_levelcard_version v1

| 項目 | 內容 |
|------|------|
| Given | ob_card_type 無 'X1' 紀錄；ob_code_df 有 tbl_id='PROD_KIND'、tbl_cd='01' 啟用期間內紀錄；無月名單分派鎖；SM Token |
| When | POST /api/v1/assignment/scoring/card-types，body = { cardType:'X1', cardName:'測試卡', prodKind:'01' } |
| Then | HTTP 201；response 含 cardType='X1'、cardName='測試卡'、prodKind='01'、prodKindName='汽車'、status='active'、cardVersion=1；DB ob_card_type 新增 1 筆；DB ob_levelcard_version 新增 1 筆（card_type='X1'、card_version=1、status='active'） |
| 驗證步驟 | 1. 確認 HTTP 201<br>2. 確認 response.cardType='X1'、cardVersion=1<br>3. 查詢 DB：ob_card_type WHERE card_type='X1' → 1 筆，status='active'<br>4. 查詢 DB：ob_levelcard_version WHERE card_type='X1' → 1 筆，card_version=1，status='active'<br>5. 確認 ob_levelcard_version.edate='20991231' |

### AC-2：代碼重複驗證（CARD_TYPE_DUPLICATE）

| 項目 | 內容 |
|------|------|
| Given | ob_card_type 已有 cardType='H'（status='active'）；無月名單分派鎖；SM Token |
| When | POST /api/v1/assignment/scoring/card-types，body = { cardType:'H', cardName:'重複測試', prodKind:'01' } |
| Then | HTTP 422；errorCode='CARD_TYPE_DUPLICATE'；訊息含 'H'；DB 無新增任何紀錄 |

### AC-6：月名單分派執行中禁止新增

| 項目 | 內容 |
|------|------|
| Given | assignment_run status='running'（seed 含全部 4 個 NOT NULL 欄位）；SM Token |
| When | POST /api/v1/assignment/scoring/card-types，body = { cardType:'N1', cardName:'測試', prodKind:'01' } |
| Then | HTTP 409；errorCode='ASSIGNMENT_RUN_ALREADY_RUNNING'；DB 無新增 ob_card_type 或 ob_levelcard_version 紀錄 |

---

## Test Scenarios

### A. API Integration Tests — 新增正常路徑

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F070-01 | POST 成功：ob_card_type + ob_levelcard_version 同 transaction 建立 | AC-1、BR-1 | Integration | ob_card_type 無 X1；ob_code_df 有 prodKind='01' 啟用紀錄；無月名單分派鎖；SM Token | POST { cardType:'X1', cardName:'測試卡', prodKind:'01' } | HTTP 201；DB ob_card_type 1 筆（X1）；DB ob_levelcard_version 1 筆（X1 v1 active） |
| TC-F070-02 | v1 版本初值正確（sdate = 今日、edate = '20991231'、status = 'active'） | AC-1、BR-3 | Integration | 同 TC-F070-01 成功後 | 查詢 ob_levelcard_version WHERE card_type='X1' | sdate = 今日（YYYYMMDD 格式）；edate='20991231'；status='active'；card_version=1 |
| TC-F070-03 | POST 成功後 audit_log 記錄 CREATE | AC-1、BR-6 | Integration | TC-F070-01 成功後 | 查詢 assignment_audit_log 最新一筆 | action='CREATE'；entity_type='ob_card_type'；entity_id='X1'；before_value=null；after_value 含 cardType='X1' |

### B. API Integration Tests — 驗證錯誤

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F070-04 | 重複 cardType（active 紀錄存在）回 422 | AC-2、BR-2 | Integration | ob_card_type 已有 H active；無月名單分派鎖；SM Token | POST { cardType:'H', cardName:'重複', prodKind:'01' } | HTTP 422；errorCode='CARD_TYPE_DUPLICATE'；DB ob_card_type 無新增 |
| TC-F070-05 | cardType 格式違規（含小寫字母）回 422 | AC-4、data-model CHECK | Integration | 無月名單分派鎖；SM Token | POST { cardType:'x1', cardName:'小寫', prodKind:'01' } | HTTP 422；errorCode='VALIDATION_ERROR'；DB 無寫入 |
| TC-F070-06 | cardType 超過 5 字元回 422 | AC-4 | Integration | 無月名單分派鎖；SM Token | POST { cardType:'TOOLONG', cardName:'超長', prodKind:'01' } | HTTP 422；errorCode='VALIDATION_ERROR'；DB 無寫入 |
| TC-F070-08 | cardType 為空（必填驗證）回 422 | AC-4 | Integration | 無月名單分派鎖；SM Token | POST { cardType:'', cardName:'測試', prodKind:'01' } | HTTP 422；errorCode='VALIDATION_ERROR'；details 含 cardType 欄位說明 |
| TC-F070-09 | prodKind 不在 ob_code_df 啟用期間內紀錄回 422 | AC-5 | Integration | ob_code_df 無 tbl_cd='99' 啟用紀錄；無月名單分派鎖；SM Token | POST { cardType:'Y1', cardName:'測試', prodKind:'99' } | HTTP 422；errorCode='VALIDATION_ERROR'；details 含 prodKind 欄位說明 |

### C. API Integration Tests — 月名單分派鎖

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F070-10 | 月名單分派 pending 時 POST 回 409 | AC-6、BR-5 | Integration | assignment_run(run_id='r1', project_workym='202604', triggered_by='u1', created_at=NOW(), status='pending')；SM Token | POST { cardType:'N1', cardName:'新增', prodKind:'01' } | HTTP 409；errorCode='ASSIGNMENT_RUN_ALREADY_RUNNING' |
| TC-F070-11 | 月名單分派 running 時 POST 回 409 | AC-6、BR-5 | Integration | assignment_run(run_id='r2', project_workym='202604', triggered_by='u1', created_at=NOW(), status='running')；SM Token | POST { cardType:'N2', cardName:'新增', prodKind:'01' } | HTTP 409；errorCode='ASSIGNMENT_RUN_ALREADY_RUNNING' |

### D. API Integration Tests — 認證

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F070-15 | 未登入回 401 | §5.1 | Integration | 無 Token | POST /api/v1/assignment/scoring/card-types | HTTP 401；errorCode='AUTH_TOKEN_MISSING' |
| TC-F070-16 | 非 Sales Manager 回 403 | §5.1 | Integration | is_sales_manager=false 的有效 Token | POST /api/v1/assignment/scoring/card-types | HTTP 403；errorCode='AUTH_FORBIDDEN' |

### E. API Integration Tests — Transaction Rollback 守護

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F070-17 | ob_levelcard_version INSERT 失敗時整體 rollback | AC-1、BR-1 | Integration | ob_card_type 無 X9；測試環境攔截：service 中 ob_levelcard_version INSERT 步驟拋出異常；SM Token | POST { cardType:'X9', cardName:'Rollback測試', prodKind:'01' } | HTTP 500（通用錯誤）；DB ob_card_type WHERE card_type='X9' 無紀錄（rollback 確認）；DB ob_levelcard_version WHERE card_type='X9' 無紀錄 |

> **注意（RISK-F070-01）**：SQLite in-memory 對 savepoint 的 rollback 行為可能與 PostgreSQL 不同。若 SQLite 環境無法可靠模擬 rollback，此 TC 應改為 Test Container PostgreSQL 執行，並在測試套件中標註為 `@requires-postgres`。

### F. API Integration Tests — 新增後空版本可查

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F070-07 | 新建後 GET /dimensions 回傳空 dimensions 陣列（非 404） | AC-3、BR-7 | Integration | POST X1 成功後（同 TC-F070-01）；SM Token | GET /api/v1/assignment/scoring/dimensions?cardType=X1 | HTTP 200；dimensions=[]（長度=0，非 404 或錯誤）；version.cardType='X1'、cardVersion=1 |

### G. Frontend Unit Tests

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F070-12 | 月名單分派鎖定時「新增」按鈕 disabled 且 hover tooltip 存在 | AC-6 | Frontend Unit | isLocked=true（月名單分派 running 狀態注入） | 渲染 Tab 1 | 「新增計分卡類型」按鈕 disabled=true；按鈕有 title 或 aria-label 含「分派執行中」或等效說明文字 |
| TC-F070-13 | POST 成功後 Modal 關閉、清單刷新、新紀錄自動選中 | AC-1 | Frontend Unit | stub POST 回傳 HTTP 201（cardType='X1'）；stub GET /card-types 第二次呼叫回傳含 X1 的更新清單 | 填寫 Modal 表單並點擊「確認新增」 | Modal 不再渲染（closed）；Tab 1 清單顯示 X1；X1 列有高亮（自動選中） |
| TC-F070-14 | 422 CARD_TYPE_DUPLICATE 時 Modal 不關閉，顯示行內錯誤 | AC-2 | Frontend Unit | stub POST 回傳 HTTP 422 CARD_TYPE_DUPLICATE | 送出 cardType='H' 的新增請求 | Modal 仍存在（未關閉）；cardType 輸入欄位下方顯示錯誤訊息（含 'H' 或「已存在」）；API 未被再次呼叫 |

---

## 邊界與例外情境

| ID | 情境 | 預期行為 | 測試類型 |
|----|------|---------|---------|
| BE-F070-001 | cardName 超過 20 字元 | HTTP 422 VALIDATION_ERROR；DB 無寫入 | Integration |
| BE-F070-002 | cardType 含特殊字元（如 H-1、H.1） | HTTP 422 VALIDATION_ERROR（不符合 ^[A-Z0-9]{1,5}$ 格式） | Integration |
| BE-F070-003 | 停用的 cardType（status='inactive'）重複建立 | BR-2：唯一性只對 active 紀錄；若 inactive 記錄存在，仍可建立同代碼的 active 紀錄（需確認業務語意後調整） | Integration（待確認） |

---

## 測試資料

### Seed 資料（SQLite in-memory E2E）

```sql
-- ob_code_df（PROD_KIND 啟用紀錄，多數 TC 共用）
INSERT INTO ob_code_df (system_id, tbl_id, tbl_cd, tbl_desc1, stadt, enddt)
VALUES ('OB', 'PROD_KIND', '01', '汽車', '20000101', '20991231');

-- 既有 CARD_TYPE（TC-F070-04 重複驗證用）
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
VALUES ('H', '期中', '01', 'active', NOW(), 'system', NOW(), 'system');

-- 月名單分派鎖 seed（TC-F070-10，pending）
-- 注意：必須 4 個 NOT NULL 欄位全填
INSERT INTO assignment_run (run_id, project_workym, triggered_by, created_at, status)
VALUES ('run-pending-001', '202604', 'test-user-id', NOW(), 'pending');

-- 月名單分派鎖 seed（TC-F070-11，running）
INSERT INTO assignment_run (run_id, project_workym, triggered_by, created_at, status)
VALUES ('run-running-001', '202604', 'test-user-id', NOW(), 'running');
```

### Token 種類

| Token 名稱 | 角色 | is_sales_manager | 用途 |
|-----------|------|-----------------|------|
| SALES_MANAGER_TOKEN | user | true | 所有正常路徑 |
| USER_NO_SM_TOKEN | user | false | 403 驗證 |
| NO_TOKEN | — | — | 401 驗證 |

---

## 自動化就緒度

| 場景 | 自動化適合度 | 說明 |
|------|------------|------|
| TC-F070-01~03（同 tx + audit_log） | 高 | Supertest + DB 查詢；sdate 用今日日期動態計算 |
| TC-F070-04~09（驗證錯誤） | 高 | 直接 API 呼叫驗證 HTTP status + errorCode |
| TC-F070-10、11（月名單分派鎖） | 高 | seed AssignmentRun 含 4 欄 NOT NULL |
| TC-F070-17（rollback 守護） | 中 | SQLite savepoint 行為待確認（RISK-F070-01）；建議優先以 PostgreSQL Test Container 執行 |
| TC-F070-12~14（Frontend Unit） | 高 | RTL；isLocked prop 注入；stub API |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F068（ob_code_df PROD_KIND 資料）、F069（Tab 1 入口）、F053（TC-F070-07 依賴 GET /dimensions 端點） |
| 環境依賴 | SQLite in-memory（E2E）；ob_code_df 需有 PROD_KIND 種子資料 |
| RISK-F070-01 | TC-F070-17（rollback 守護）依賴 SQLite in-memory 的 savepoint 行為；若 SQLite 無法可靠 rollback nested transaction，改為 Test Container PostgreSQL 執行，標記 @requires-postgres |
