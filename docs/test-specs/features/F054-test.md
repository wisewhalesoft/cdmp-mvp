---
type: test-design-feature
feature_id: F054
feature_name: 編輯計分維度與分數（M02 Tab 3）
priority: P0-MVP
related_spec: /docs/specs/features/F054-edit-scoring-dimension.md
last_updated: 2026-05-18
spec_version: "1.3"
---

# F054: 編輯計分維度與分數 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F054-edit-scoring-dimension.md` + `error-handling.md#assignment-scoring-errors` + `data-model.md#e07-data-model` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + Test Container PostgreSQL）、Frontend Unit（React Testing Library） |
| 覆寫語意驗證 | PUT 操作後，DB 中 `ob_levelcard_score` 的舊區間應被替換，card_version 不遞增（維持 v1） |
| 月跑鎖驗證策略 | 分別植入 status='pending' 與 status='running' 的 assignment_run 紀錄，各確認回 409 |
| Audit Log 驗證 | 每個寫入操作後，以 SQL 查詢 `assignment_audit_log` 最新一筆，驗證 action / before_value / after_value |
| 停用維度連鎖效應 | 停用後（AC-4），呼叫 F053 的 GET /scoring 確認停用維度不出現（跨 Feature 整合點） |
| 區間重疊邊界 | `[0,10]` 與 `[10,20]` 為接觸不重疊（允許）；`[0,10]` 與 `[9,20]` 為重疊（拒絕）；各設計獨立案例 |

---

## Acceptance Test Design

### AC-2：修改維度分數區間並即時儲存

| 項目 | 內容 |
|------|------|
| Given | CARD_TYPE='H'、active 版本；維度 ACCOUNT_AGE 有現有 score 區間 `[0,3]=10`、`[4,12]=20`；無月跑鎖；Sales Manager Token |
| When | 呼叫 `PUT /api/v1/assignment/scoring/dimensions`，修改 score 區間為 `[0,5]=15`、`[6,12]=25` |
| Then | HTTP 200；response.updatedScores=2；DB 中 ACCOUNT_AGE 的舊區間已被替換；card_version 維持 1 不遞增 |
| 驗證步驟 | 1. 確認 HTTP 200，response.updatedDimensions=1，updatedScores=2<br>2. 查詢 DB：`ob_levelcard_score WHERE column_name='ACCOUNT_AGE'` 應有 2 筆，舊值 `[0,3]=10` 不存在<br>3. 確認 `ob_levelcard_version.card_version` 仍為 1<br>4. 確認 `assignment_audit_log` 最新一筆 action='UPDATE'，before_value 含舊分數，after_value 含新分數 |

### AC-3：新增維度直接生效

| 項目 | 內容 |
|------|------|
| Given | CARD_TYPE='H'、active 版本；無 column_name='CONTRACT_YEARS' 的維度；無月跑鎖；Sales Manager Token |
| When | 呼叫 `POST /api/v1/assignment/scoring/dimensions`，新增 CONTRACT_YEARS（數值型 2 個區間） |
| Then | HTTP 201；DB 中 ob_levelcard_column 新增一筆 column_name='CONTRACT_YEARS'；ob_levelcard_score 新增 2 筆對應區間 |
| 驗證步驟 | 1. 確認 HTTP 201<br>2. 查詢 DB：`ob_levelcard_column WHERE column_name='CONTRACT_YEARS'` 有 1 筆，status='active'<br>3. 查詢 DB：`ob_levelcard_score WHERE column_name='CONTRACT_YEARS'` 有 2 筆<br>4. 確認 `assignment_audit_log` 最新一筆 action='CREATE'，entity_type 對應 ob_levelcard_column |

### AC-4：停用維度（Soft Delete）

| 項目 | 內容 |
|------|------|
| Given | CARD_TYPE='H' 的 active 版本；維度 ACCOUNT_AGE 現存（status='active'）；無月跑鎖；Sales Manager Token |
| When | 呼叫 `PUT /api/v1/assignment/scoring/dimensions/ACCOUNT_AGE/disable?cardType=H` |
| Then | DB 中 `ob_levelcard_column.status='inactive'` for ACCOUNT_AGE；`assignment_audit_log` action='DISABLE'；後續 GET /scoring 不再包含 ACCOUNT_AGE |
| 驗證步驟 | 1. 確認 HTTP 200<br>2. 查詢 DB：`ob_levelcard_column WHERE column_name='ACCOUNT_AGE' AND status='inactive'` 有 1 筆<br>3. 確認 ob_levelcard_score 中對應資料仍存在（不刪除）<br>4. 確認 audit_log action='DISABLE'<br>5. 呼叫 `GET /api/v1/assignment/scoring?cardType=H`，dimensions 中不含 ACCOUNT_AGE |

### AC-5：月跑執行中禁止修改

| 項目 | 內容 |
|------|------|
| Given | assignment_run 有 status='pending' 的紀錄；Sales Manager Token |
| When | 呼叫 PUT /api/v1/assignment/scoring/dimensions |
| Then | HTTP 409，SCORING_VERSION_LOCKED，訊息含「分派執行中，無法修改計分設定」 |

### AC-6：分數區間重疊驗證

| 項目 | 內容 |
|------|------|
| Given | ACCOUNT_AGE 現有區間 `[0,10]`；Sales Manager Token |
| When | 呼叫 PUT 嘗試新增重疊區間 `[9,20]` |
| Then | HTTP 422，SCORING_RANGE_OVERLAP；DB 中原有資料不變 |

---

## Test Scenarios

### A. API Integration Tests — 修改分數區間

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F054-001 | 正常修改維度分數區間（覆寫式） | AC-2 | Integration | H active 版本；ACCOUNT_AGE 有 2 筆 score；無月跑鎖；SM Token | PUT /api/v1/assignment/scoring/dimensions（修改 ACCOUNT_AGE 2 筆區間） | HTTP 200；updatedScores=2；DB 舊 score 被替換；card_version 仍 1 |
| TS-F054-002 | 修改後 audit_log 記錄 before/after 值 | AC-2 | Integration | 同上 | PUT 成功後查詢 assignment_audit_log | action='UPDATE'；before_value 含舊 score 值；after_value 含新 score 值；entity_type='ob_levelcard_score' |
| TS-F054-003 | 類別型（level1）區間修改正常 | AC-2, BR-3 | Integration | CELLULAR 維度有 2 筆 level1 類別型 score；無月跑鎖；SM Token | PUT 修改 level1 值與 score | HTTP 200；DB 更新正確；level2_s / level2_e 仍為 null |

### B. API Integration Tests — 新增維度

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F054-004 | 新增維度（數值型 2 個區間） | AC-3 | Integration | 無 CONTRACT_YEARS 維度；無月跑鎖；SM Token | POST /api/v1/assignment/scoring/dimensions（columnName='CONTRACT_YEARS'，2 個區間） | HTTP 201；DB: ob_levelcard_column 1 筆（status='active'）；ob_levelcard_score 2 筆 |
| TS-F054-005 | 新增維度後 audit_log 記錄 CREATE | AC-3 | Integration | 同上（POST 成功後） | 查詢 assignment_audit_log 最新一筆 | action='CREATE'；before_value=null（新建無舊值）；after_value 含 columnName='CONTRACT_YEARS' |
| TS-F054-006 | 新增維度 column_name 已存在則拒絕（重複驗證） | AC-3, BR-3 | Integration | ACCOUNT_AGE 維度已存在；SM Token | POST 嘗試新增 column_name='ACCOUNT_AGE' | HTTP 422，SCORING_COLUMN_DUPLICATE；DB 無重複寫入 |

### C. API Integration Tests — 停用維度

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F054-007 | 停用維度後 status='inactive' | AC-4 | Integration | ACCOUNT_AGE status='active'；無月跑鎖；SM Token | PUT /api/v1/assignment/scoring/dimensions/ACCOUNT_AGE/disable?cardType=H | HTTP 200；DB ob_levelcard_column.status='inactive'；ob_levelcard_score 原資料仍存在 |
| TS-F054-008 | 停用後 audit_log 記錄 DISABLE | AC-4 | Integration | 同 TS-F054-007 成功後 | 查詢 assignment_audit_log 最新一筆 | action='DISABLE'；entity_type='ob_levelcard_column'；before_value.status='active'，after_value.status='inactive' |
| TS-F054-009 | 停用維度後 F053 GET /scoring 不再回傳該維度 | AC-4（跨 F053） | Integration | TS-F054-007 完成後 | 呼叫 GET /api/v1/assignment/scoring?cardType=H | dimensions 中不含 columnName='ACCOUNT_AGE' |

### D. API Integration Tests — 月跑鎖與驗證

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F054-010 | assignment_run status='pending' 時 PUT 回 409 | AC-5, BR-4 | Integration | assignment_run(status='pending')；SM Token | PUT /api/v1/assignment/scoring/dimensions | HTTP 409，SCORING_VERSION_LOCKED |
| TS-F054-011 | assignment_run status='running' 時 PUT 回 409 | AC-5, BR-4 | Integration | assignment_run(status='running')；SM Token | PUT /api/v1/assignment/scoring/dimensions | HTTP 409，SCORING_VERSION_LOCKED |
| TS-F054-012 | assignment_run status='pending' 時 POST 新增維度也回 409 | AC-5, BR-4 | Integration | assignment_run(status='pending')；SM Token | POST /api/v1/assignment/scoring/dimensions | HTTP 409，SCORING_VERSION_LOCKED |
| TS-F054-013 | 數值型區間重疊（交集不為空）回 422 | AC-6, BR-3 | Integration | ACCOUNT_AGE 現有區間 [0,10]；無月跑鎖；SM Token | PUT 嘗試新增 [9,20] 區間 | HTTP 422，SCORING_RANGE_OVERLAP；DB 原有資料不變 |
| TS-F054-014 | 相鄰區間接觸（score_e+1=下一級 score_s）允許 | AC-6, BR-3 | Integration | ACCOUNT_AGE 現有區間 [0,10]；無月跑鎖；SM Token | PUT 新增 [11,20] 區間（相鄰接觸） | HTTP 200；不回傳 SCORING_RANGE_OVERLAP |
| TS-F054-015 | 未登入呼叫 PUT 回 401 | 第 5.1 節 | Integration | 無 Token | PUT /api/v1/assignment/scoring/dimensions | HTTP 401，AUTH_TOKEN_MISSING |
| TS-F054-016 | 非 Sales Manager 呼叫 PUT 回 403 | 第 5.1 節 | Integration | is_sales_manager=false 的 Token | PUT /api/v1/assignment/scoring/dimensions | HTTP 403，AUTH_FORBIDDEN |

### E. Frontend Unit Tests — 編輯 UI 狀態

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F054-017 | 月跑執行中全部按鈕 DOM disabled（非 CSS 隱藏） | AC-5 | Frontend Unit | stub API 回傳月跑鎖定狀態（或由 assignment_run 狀態注入）；isLocked=true | 渲染計分設定頁 | 新增維度按鈕 disabled=true；編輯按鈕 disabled=true；停用按鈕 disabled=true；這些按鈕在 DOM 中存在但不可點擊 |
| TS-F054-018 | 月跑鎖定時頁面顯示提示訊息 | AC-5 | Frontend Unit | isLocked=true | 渲染計分設定頁 | 頁面顯示「分派執行中，無法修改計分設定」文字提示 |
| TS-F054-019 | 新增維度 Modal 表單渲染與欄位驗證 | AC-3 | Frontend Unit | 正常狀態（無鎖）；點擊「新增維度」按鈕 | 渲染 Modal | Modal 顯示 column_name / column_label / 分數區間欄位；column_name 必填驗證觸發 |
| TS-F054-020 | 停用維度確認對話框 | AC-4 | Frontend Unit | 正常狀態（無鎖） | 點擊停用按鈕 | 顯示確認 Modal，訊息包含維度名稱；點擊取消後不發送 API 請求 |
| TS-F054-021 | 儲存成功後顯示 toast 通知 | AC-2 | Frontend Unit | stub PUT API 回傳 HTTP 200 | 點擊儲存 | 頁面顯示儲存成功 toast（持續時間合理，之後消失） |
| TS-F054-022 | 分數區間重疊提示顯示於對應欄位 | AC-6 | Frontend Unit | stub PUT API 回傳 HTTP 422 SCORING_RANGE_OVERLAP | 點擊儲存 | 錯誤提示顯示於分數區間欄位旁（紅色提示）；不使用 alert/confirm |
| TS-F054-023 | 類別型與數值型區間二擇一驗證 | AC-6, BR-3 | Frontend Unit | 新增分數區間 Modal 已開啟 | 同時填入 level1 與 level2_s | 前端驗證阻擋：只能選擇一種類型（類別型 OR 數值型） |
| TS-F054-024 | 修改後重新取得清單反映最新資料 | AC-2 | Frontend Unit | PUT 成功後 | 成功 toast 後頁面自動刷新或 re-fetch | dimensions 清單顯示更新後的分數摘要（如「4 個區間」→「2 個區間」） |

---

## 邊界與例外情境

| ID | 情境 | 預期行為 | 測試類型 |
|----|------|---------|---------|
| BE-F054-001 | PUT 傳入 scores 為空陣列（刪除所有區間）| 依實作定義：若允許，DB 中該 column 的 score 全部清除；若禁止，回 422 VALIDATION_ERROR | Integration |
| BE-F054-002 | PUT 覆寫後 card_version 不遞增 | 確認 DB ob_levelcard_version.card_version 仍為 1（BR-2 保證） | Integration |
| BE-F054-003 | 停用已停用的維度（重複停用） | 回 422 或 200（冪等，視實作）；不應拋出 500；audit_log 不應產生重複 DISABLE 紀錄 | Integration |
| BE-F054-004 | 數值型區間邊界：[0,10] 與 [10,20] 接觸但不重疊 | HTTP 200（BR-1：score_e+1=下一級 score_s 允許）；不回 SCORING_RANGE_OVERLAP | Integration |

---

## 測試資料

### Seed 資料（Test Container PostgreSQL）

```sql
-- ob_levelcard_version（active 版本）
INSERT INTO ob_levelcard_version (card_type, card_name, card_version, sdate, edate, status)
VALUES ('H', '期中', 1, '20190823', '20991231', 'active');

-- ob_levelcard_column（測試用維度）
INSERT INTO ob_levelcard_column (card_type, card_version, column_name, column_label, status)
VALUES
  ('H', 1, 'ACCOUNT_AGE', '帳齡',   'active'),
  ('H', 1, 'CELLULAR',    '有無手機', 'active');

-- ob_levelcard_score（初始分數區間）
INSERT INTO ob_levelcard_score (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'ACCOUNT_AGE', NULL, '0',  '3',  10),
  ('H', 1, 'ACCOUNT_AGE', NULL, '4',  '12', 20),
  ('H', 1, 'CELLULAR',    'Y',  NULL, NULL, 15),
  ('H', 1, 'CELLULAR',    'N',  NULL, NULL, 0);

-- 月跑鎖 fixture（用於 TS-F054-010 / 011 / 012）
-- pending 鎖：
INSERT INTO assignment_run (run_ym, status, created_at) VALUES ('202604', 'pending', NOW());
-- running 鎖（分別在不同 test case 使用，每個 test 獨立 seed）：
INSERT INTO assignment_run (run_ym, status, created_at) VALUES ('202604', 'running', NOW());
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
| TS-F054-001 ~ 016（Integration） | 高 | Supertest + Test Container；audit_log 驗證需直接查詢 DB |
| TS-F054-009（停用→F053 串聯） | 高 | 在同一 test suite 中順序呼叫兩個 API，無需額外工具 |
| TS-F054-017 ~ 024（Frontend Unit） | 高 | React Testing Library；月跑鎖狀態以 mock context 注入 |
| BE-F054-001（空 scores 陣列） | 中 | 行為（允許 vs 拒絕）待實作確認；先以 TBD 標記，實作後補充期望值 |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F053（BE-F054-009 跨 Feature 串聯）、F069（ob_card_type 必須存在，v1.2 新增 CARD_TYPE_NOT_FOUND 場景） |
| 環境依賴 | SQLite in-memory（E2E）；ob_card_type entity 需已加入 E2E app 的 entities 清單 |

---

## v1.2 新增 Test Scenarios

### E. API Integration Tests — cardType 不存在回 404（v1.2 新增）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F054-025 | PUT /dimensions 傳不存在的 cardType 回 404 | AC-7（v1.2） | Integration | ob_card_type 無 'NOTEXIST'（或 status='inactive'）；SM Token | PUT /api/v1/assignment/scoring/dimensions?cardType=NOTEXIST，body 含任意 dimensions | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |
| TS-F054-026 | POST /dimensions 傳不存在的 cardType 回 404 | AC-7（v1.2） | Integration | ob_card_type 無 'NOTEXIST'；SM Token | POST /api/v1/assignment/scoring/dimensions?cardType=NOTEXIST，body 含任意 dimension | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |

---

## v1.3 新增 Test Scenarios（2026-05-18）

### F. match_type 欄位（F054 v1.3 AC-7 新增）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F054-MT-001 | createDimension 帶 matchType=RANGE → ob_levelcard_column.match_type='RANGE' | F054 v1.3 AC-7 | Unit | DirectorToken；migration add-match-type 已執行 | POST /dimensions body 含 matchType:'RANGE' | HTTP 201；columnRepo.create 參數含 match_type:'RANGE' |
| TS-F054-MT-002 | createDimension 帶 matchType=CATEGORY → 儲存 'CATEGORY' | F054 v1.3 AC-7 | Unit | 同上 | POST /dimensions body 含 matchType:'CATEGORY' | columnRepo.save 傳入 match_type:'CATEGORY' |
| TS-F054-MT-003 | createDimension 帶 matchType=COMPOSITE → 儲存 'COMPOSITE' | F054 v1.3 AC-7 | Unit | 同上 | POST /dimensions body 含 matchType:'COMPOSITE' | columnRepo.save 傳入 match_type:'COMPOSITE' |
| TS-F054-MT-004 | createDimension 不帶 matchType → 套用預設值 | F054 v1.3 AC-7 | Unit | 同上 | POST /dimensions body 無 matchType | column.match_type 為預設值（與 spec 確認） |
| TS-F054-MT-005 | updateDimensions 修改 matchType → audit_log 記前後值 | F054 v1.3 AC-7 | Unit | column 現有 match_type='RANGE' | PUT /dimensions body 含 matchType:'CATEGORY' | auditRepo before_value.matchType='RANGE'；after_value.matchType='CATEGORY' |
| TS-F054-MT-006 | matchType='UNKNOWN' → 422 VALIDATION_ERROR | F054 v1.3 AC-7 | E2E | 同上 | POST /dimensions body 含 matchType:'UNKNOWN' | HTTP 422；error='VALIDATION_ERROR' |
| TS-F054-MT-007 | GET /scoring response 含 matchType 欄位 | F054 v1.3 AC-7 | E2E | dimension 已存在 | GET /api/v1/assignment/scoring?cardType=H&cardVersion=1 | response.dimensions[].matchType 非 undefined |

#### 規格檔：`assignment-scoring-f054-match-type.service.spec.ts`

---

### G. audit_log 欄位擴充（F061 v1.3 AC-9，與 F054 共用 entity）

| ID | 場景 | 關聯需求 | 測試類型 | 說明 |
|----|------|---------|---------|------|
| TS-F054-AL-001 | migration add-scoring-audit-fields up() 新增 5 個 nullable 欄位 | F061 v1.3 AC-9 | Migration Unit | 見 m16-audit-log-action-varchar30.spec.ts（F061 v1.3 describe 區段） |
| TS-F054-AL-002 | migration add-scoring-audit-fields down() 正確刪除欄位 | F061 v1.3 AC-9 | Migration Unit | 同上 |
