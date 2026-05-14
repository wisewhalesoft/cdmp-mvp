---
type: test-design-feature
feature_id: F071
feature_name: 編輯 CARD_TYPE 計分卡類型
priority: P0-MVP
related_spec: /docs/specs/features/F071-edit-card-type.md
last_updated: 2026-05-14
---

# F071: 編輯 CARD_TYPE 計分卡類型 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F071-edit-card-type.md` + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + SQLite in-memory）、Frontend Unit（React Testing Library） |
| cardType 不可修改策略 | PUT 端點以 URL path param 為準；即使 request body 含 cardType 欄位，後端忽略之（AC-2 決策）；測試需驗證 body 中的 cardType 不影響實際更新結果 |
| ob_levelcard_version 不同步驗證 | AC-3 BR-4 決策：編輯 ob_card_type.card_name 不回寫 ob_levelcard_version.card_name；測試需直接查詢 DB 確認 ob_levelcard_version 無變動 |
| audit_log 驗證 | PUT 成功後查詢 assignment_audit_log，確認 before_value 含舊值、after_value 含新值 |
| 月跑鎖 seed 格式 | 所有月跑鎖 TC 必須 seed AssignmentRun 全部 4 個 NOT NULL 欄位（run_id / project_workym / triggered_by / created_at） |

---

## Acceptance Test Design

### AC-3：修改 cardName 或 prodKind 並儲存

| 項目 | 內容 |
|------|------|
| Given | ob_card_type 有 H（card_name='期中'，prod_kind='01'）；ob_code_df 有 prodKind='01' 與 '02' 啟用紀錄；ob_levelcard_version 有 H v1（card_name='期中版本'）；無月跑鎖；SM Token |
| When | PUT /api/v1/assignment/scoring/card-types/H，body = { cardName:'汽車高資產期中', prodKind:'01' } |
| Then | HTTP 200；response 含 cardType='H'、cardName='汽車高資產期中'；DB ob_card_type.card_name='汽車高資產期中'；ob_levelcard_version.card_name 仍為'期中版本'（未同步） |

### AC-5：cardType 不存在

| 項目 | 內容 |
|------|------|
| Given | ob_card_type 無 'NOTEXIST' active 紀錄；SM Token |
| When | PUT /api/v1/assignment/scoring/card-types/NOTEXIST，body = { cardName:'測試', prodKind:'01' } |
| Then | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |

---

## Test Scenarios

### A. API Integration Tests — 修改正常路徑

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F071-03 | PUT 成功：DB card_name / prod_kind 更新，ob_levelcard_version 不同步 | AC-3、BR-2、BR-4 | Integration | ob_card_type(H, card_name='期中', prod_kind='01')；ob_levelcard_version(H, v1, card_name='期中版本')；ob_code_df 有 01/02；無月跑鎖；SM Token | PUT /card-types/H，body { cardName:'汽車高資產期中', prodKind:'01' } | HTTP 200；DB ob_card_type.card_name='汽車高資產期中'；DB ob_levelcard_version.card_name 仍為'期中版本' |
| TC-F071-04 | PUT 成功後 audit_log 記錄 UPDATE 含 before/after | AC-3 | Integration | 同 TC-F071-03 成功後 | 查詢 assignment_audit_log 最新一筆 | action='UPDATE'；entity_type='ob_card_type'；entity_id='H'；before_value 含 card_name='期中'；after_value 含 card_name='汽車高資產期中' |
| TC-F071-14 | PUT cardName 後 ob_levelcard_version.card_name 原值不變（版本獨立） | AC-3、BR-4 | Integration | 同 TC-F071-03；ob_levelcard_version(H, v1, card_name='期中版本') | PUT /card-types/H，body { cardName:'新名稱', prodKind:'01' } → 查詢 ob_levelcard_version | ob_levelcard_version WHERE card_type='H' AND card_version=1 的 card_name 仍為'期中版本'（未改動） |

### B. API Integration Tests — cardType 不可修改驗證

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F071-02 | body 含 cardType 欄位時後端忽略（以 URL path 為準） | AC-2、BR-1 | Integration | ob_card_type(H active)；無月跑鎖；SM Token | PUT /card-types/H，body { cardName:'新名稱', prodKind:'01', cardType:'TAMPERED' } | HTTP 200；DB ob_card_type.card_type 仍為'H'（未被改寫）；cardName 更新成功 |

### C. API Integration Tests — 驗證錯誤

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F071-05 | cardName 為空回 422 | AC-4 | Integration | ob_card_type(H active)；無月跑鎖；SM Token | PUT /card-types/H，body { cardName:'', prodKind:'01' } | HTTP 422；errorCode='VALIDATION_ERROR' |
| TC-F071-06 | prodKind 為空回 422 | AC-4 | Integration | ob_card_type(H active)；無月跑鎖；SM Token | PUT /card-types/H，body { cardName:'期中', prodKind:'' } | HTTP 422；errorCode='VALIDATION_ERROR' |
| TC-F071-07 | 不存在的 cardType 回 404 | AC-5 | Integration | ob_card_type 無 NOTEXIST；SM Token | PUT /card-types/NOTEXIST，body { cardName:'測試', prodKind:'01' } | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |
| TC-F071-08 | prodKind 不在 ob_code_df 啟用期間內回 422 | AC-6 | Integration | ob_code_df 無 tbl_cd='99' 啟用紀錄；ob_card_type(H active)；無月跑鎖；SM Token | PUT /card-types/H，body { cardName:'期中', prodKind:'99' } | HTTP 422；errorCode='VALIDATION_ERROR' |

### D. API Integration Tests — 月跑鎖

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F071-09 | 月跑 pending 時 PUT 回 409 | AC-7、BR-5 | Integration | assignment_run(run_id='r1', project_workym='202604', triggered_by='u1', created_at=NOW(), status='pending')；SM Token | PUT /card-types/H，body { cardName:'測試', prodKind:'01' } | HTTP 409；errorCode='ASSIGNMENT_RUN_ALREADY_RUNNING' |
| TC-F071-10 | 月跑 running 時 PUT 回 409 | AC-7、BR-5 | Integration | assignment_run(run_id='r2', project_workym='202604', triggered_by='u1', created_at=NOW(), status='running')；SM Token | PUT /card-types/H，body { cardName:'測試', prodKind:'01' } | HTTP 409；errorCode='ASSIGNMENT_RUN_ALREADY_RUNNING' |

### E. API Integration Tests — 認證

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F071-12 | 未登入回 401 | §5.1 | Integration | 無 Token | PUT /api/v1/assignment/scoring/card-types/H | HTTP 401；errorCode='AUTH_TOKEN_MISSING' |
| TC-F071-13 | 非 Sales Manager 回 403 | §5.1 | Integration | is_sales_manager=false 的有效 Token | PUT /api/v1/assignment/scoring/card-types/H | HTTP 403；errorCode='AUTH_FORBIDDEN' |

### F. Frontend Unit Tests

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F071-01 | 開啟編輯 Modal 預填現有 cardName / prodKind 值 | AC-1 | Frontend Unit | stub GET /card-types 回傳 H（cardName='期中'，prodKind='01'） | 點擊 H 列的「編輯」按鈕 | Modal 開啟；cardName 輸入欄位預填'期中'；prodKind 下拉預選'01'；cardType 欄位顯示'H'且 disabled |
| TC-F071-11 | 月跑鎖定時編輯按鈕 disabled | AC-7 | Frontend Unit | isLocked=true；stub GET /card-types 回傳 [H] | 渲染 Tab 1 | H 列的「編輯」按鈕 disabled=true；不可點擊（onClick 不被觸發） |

---

## 邊界與例外情境

| ID | 情境 | 預期行為 | 測試類型 |
|----|------|---------|---------|
| BE-F071-001 | cardName 超過 20 字元 | HTTP 422 VALIDATION_ERROR | Integration |
| BE-F071-002 | PUT 只修改 prodKind（cardName 不變） | HTTP 200；DB ob_card_type.prod_kind 更新；card_name 不變；audit_log before/after 僅 prod_kind 有差異 | Integration |

---

## 測試資料

### Seed 資料（SQLite in-memory E2E）

```sql
-- ob_code_df（PROD_KIND 啟用紀錄）
INSERT INTO ob_code_df (system_id, tbl_id, tbl_cd, tbl_desc1, stadt, enddt)
VALUES
  ('OB', 'PROD_KIND', '01', '汽車', '20000101', '20991231'),
  ('OB', 'PROD_KIND', '02', '機車', '20000101', '20991231');

-- ob_card_type（待編輯的目標）
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
VALUES ('H', '期中', '01', 'active', NOW(), 'system', NOW(), 'system');

-- ob_levelcard_version（TC-F071-03/14 驗證不同步）
INSERT INTO ob_levelcard_version (card_type, card_name, card_version, sdate, edate, status)
VALUES ('H', '期中版本', 1, '20190823', '20991231', 'active');

-- 月跑鎖 seed（TC-F071-09，pending；4 欄全填）
INSERT INTO assignment_run (run_id, project_workym, triggered_by, created_at, status)
VALUES ('run-pending-f071', '202604', 'test-user-id', NOW(), 'pending');

-- 月跑鎖 seed（TC-F071-10，running；4 欄全填）
INSERT INTO assignment_run (run_id, project_workym, triggered_by, created_at, status)
VALUES ('run-running-f071', '202604', 'test-user-id', NOW(), 'running');
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
| TC-F071-02~14（Integration） | 高 | Supertest + DB 查詢；ob_levelcard_version 查詢確認不同步 |
| TC-F071-09、10（月跑鎖） | 高 | AssignmentRun seed 含 4 欄 NOT NULL |
| TC-F071-01（Modal 預填） | 高 | RTL；點擊按鈕後驗 input.value |
| TC-F071-11（disabled 狀態） | 高 | isLocked prop 注入；getByRole('button').disabled |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F068（ob_code_df PROD_KIND）、F069（Tab 1 入口）、F070（需先建立 CARD_TYPE 才有對象可編輯） |
| 環境依賴 | SQLite in-memory（E2E）；ob_code_df 需有 PROD_KIND 啟用紀錄 |
| 設計決策點 | TC-F071-14（ob_levelcard_version 不同步）依賴 BR-4 spec 決策（✅ 已確認不同步）；若後續需求改變，此 TC 需同步修訂 |
