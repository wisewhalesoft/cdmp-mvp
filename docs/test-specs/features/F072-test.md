---
type: test-design-feature
feature_id: F072
feature_name: 停用 CARD_TYPE 計分卡類型（級聯刪除）
priority: P0-MVP
related_spec: /docs/specs/features/F072-disable-card-type.md
last_updated: 2026-05-14
---

# F072: 停用 CARD_TYPE 計分卡類型（級聯刪除） — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F072-disable-card-type.md` + `data-model.md#ob-card-type-entity` + `data-model.md#e07-data-model` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + SQLite in-memory）、Frontend Unit（React Testing Library） |
| 級聯驗證策略 | 需在同一 TC 中逐一查詢 6 張表（ob_tier / ob_levelcard_score / ob_levelcard_level / ob_levelcard_column / ob_levelcard_version / ob_card_type）驗證筆數歸零；同時確認排除表（ob_pool_data_list / ob_list_definition）紀錄不變 |
| Fallback NULL PK 刪除守護 | ob_tier 中 card_level=NULL 的 Fallback 紀錄必須透過 `repo.remove(entity)` 路徑執行；`repo.delete({card_level:null})` 的靜默 bug 應被 TC-F072-19 抓住（參見 `regression/M02-regression-guards.md`） |
| 月跑鎖 seed 格式 | 所有月跑鎖 TC 必須 seed AssignmentRun 全部 4 個 NOT NULL 欄位（run_id / project_workym / triggered_by / created_at） |
| delete-preview 與 DELETE 的數字對應 | 測試種子固定筆數（如 1/3/6/4/2）；delete-preview count 與實際 DELETE response deletedCascade count 均需驗證 |
| ob_list_definition 警告不阻擋 | OQ-E07-30 決策：listDefinitionsAffected > 0 時警告但允許停用；DELETE 仍回 200 |

---

## Acceptance Test Design

### AC-1：delete-preview 回傳五張表 count

| 項目 | 內容 |
|------|------|
| Given | ob_card_type(X)；ob_levelcard_version(X 1筆)；ob_levelcard_column(X 3筆)；ob_levelcard_score(X 6筆)；ob_levelcard_level(X 4筆)；ob_tier(X 2筆，含 X/A→T1 標準 + X/null→T2 fallback)；ob_list_definition(引用 X 2筆 active)；SM Token |
| When | GET /api/v1/assignment/scoring/card-types/X/delete-preview |
| Then | HTTP 200；cascade.versions=1；cascade.columns=3；cascade.scores=6；cascade.levels=4；cascade.tierMappings=2；listDefinitionsAffected=2 |

### AC-3：確認後執行級聯 hard delete

| 項目 | 內容 |
|------|------|
| Given | 同 AC-1 seed；另有 ob_pool_data_list 5 筆歷史（本表不含 card_type 欄位，以 list_no 等 PK 區分）；SM Token |
| When | DELETE /api/v1/assignment/scoring/card-types/X?confirmCascade=true |
| Then | HTTP 200；deletedCascade.versions=1、columns=3、scores=6、levels=4、tierMappings=2；DB ob_tier 0筆；ob_levelcard_score 0筆；ob_levelcard_level 0筆；ob_levelcard_column 0筆；ob_levelcard_version 0筆；ob_card_type(X) 0筆；ob_pool_data_list 全表 COUNT 5（前後不變）；ob_list_definition 2筆（保留） |

---

## Test Scenarios

### A. API Integration Tests — delete-preview 端點

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F072-01 | GET delete-preview 回傳五張表正確 count | AC-1 | Integration | seed 見 AC-1 描述；SM Token | GET /card-types/X/delete-preview | HTTP 200；cascade.versions=1；columns=3；scores=6；levels=4；tierMappings=2 |
| TC-F072-02 | delete-preview 回傳 listDefinitionsAffected | AC-1 | Integration | ob_list_definition(card_type='X' 2筆 active)；SM Token | GET /card-types/X/delete-preview | HTTP 200；listDefinitionsAffected=2 |
| TC-F072-16 | delete-preview 未登入回 401 | §5.1 | Integration | 無 Token | GET /card-types/X/delete-preview | HTTP 401；errorCode='AUTH_TOKEN_MISSING' |
| TC-F072-17 | delete-preview 非 SM 回 403 | §5.1 | Integration | is_sales_manager=false Token | GET /card-types/X/delete-preview | HTTP 403；errorCode='AUTH_FORBIDDEN' |

### B. API Integration Tests — DELETE 級聯刪除主路徑

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F072-05 | DELETE 級聯六步驟：各表筆數正確清除 | AC-3、BR-6 | Integration | ob_card_type(X)；ob_levelcard_version(X 1筆)；ob_levelcard_column(X 3筆)；ob_levelcard_score(X 6筆)；ob_levelcard_level(X 4筆)；ob_tier(X/A→T1 + X/null→T2 共 2筆)；SM Token | DELETE /card-types/X?confirmCascade=true | HTTP 200；後驗：ob_tier COUNT=0；ob_levelcard_score COUNT=0；ob_levelcard_level COUNT=0；ob_levelcard_column COUNT=0；ob_levelcard_version COUNT=0；ob_card_type(X) COUNT=0 |
| TC-F072-06 | DELETE 成功後 audit_log 記錄 action='DELETE' 含六表 count 摘要 | AC-3、BR-8 | Integration | 同 TC-F072-05 成功後 | 查詢 assignment_audit_log 最新一筆 | action='DELETE'；entity_type='ob_card_type'；entity_id='X'；before_value 含 versions/columns/scores/levels/tierMappings 各 count；after_value=null |

### C. API Integration Tests — 排除項目驗證

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F072-07 | 停用後 ob_pool_data_list 歷史記錄保留不變 | AC-4、BR-3 | Integration | ob_pool_data_list 有 5 筆歷史資料（本表不含 card_type 欄位，無法以 card_type 篩選）；DELETE 執行完畢 | 查詢 ob_pool_data_list 全表 COUNT(*) | COUNT=5（歷史記錄前後不變；本表概念上不受級聯影響） |
| TC-F072-08 | 停用後 ob_list_definition 紀錄保留不變 | AC-4、BR-3 | Integration | ob_list_definition 有 2 筆 card_type='X' active 紀錄；DELETE 執行完畢 | 查詢 ob_list_definition WHERE card_type='X' | COUNT=2（名單定義保留） |

### D. API Integration Tests — 二次確認驗證（BR-5）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F072-09 | DELETE 不帶 confirmCascade=true 回 422 | AC-5、BR-5 | Integration | ob_card_type(X active)；SM Token | DELETE /card-types/X（不帶 query） | HTTP 422；errorCode='CARD_TYPE_CASCADE_NOT_CONFIRMED'；DB 無任何刪除 |
| TC-F072-10 | DELETE confirmCascade=false 回 422 | AC-5、BR-5 | Integration | ob_card_type(X active)；SM Token | DELETE /card-types/X?confirmCascade=false | HTTP 422；errorCode='CARD_TYPE_CASCADE_NOT_CONFIRMED'；DB 無任何刪除 |

### E. API Integration Tests — 錯誤路徑

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F072-13 | DELETE 不存在的 cardType 回 404 | AC-7 | Integration | ob_card_type 無 NOTEXIST；SM Token | DELETE /card-types/NOTEXIST?confirmCascade=true | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |
| TC-F072-14 | 月跑 pending 時 DELETE 回 409 | AC-8、BR-7 | Integration | assignment_run(run_id='r1', project_workym='202604', triggered_by='u1', created_at=NOW(), status='pending')；SM Token | DELETE /card-types/X?confirmCascade=true | HTTP 409；errorCode='ASSIGNMENT_RUN_ALREADY_RUNNING' |
| TC-F072-15 | 月跑 running 時 DELETE 回 409 | AC-8、BR-7 | Integration | assignment_run(run_id='r2', project_workym='202604', triggered_by='u1', created_at=NOW(), status='running')；SM Token | DELETE /card-types/X?confirmCascade=true | HTTP 409；errorCode='ASSIGNMENT_RUN_ALREADY_RUNNING' |

### F. API Integration Tests — Transaction Rollback 守護

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F072-18 | 某步驟失敗時整體 rollback，所有表紀錄還原 | AC-3、BR-6 | Integration | 同 TC-F072-05 seed；測試環境攔截：service 中 step 5（ob_levelcard_version DELETE）拋出異常；SM Token | DELETE /card-types/X?confirmCascade=true | HTTP 500；後驗：ob_tier COUNT=2（還原）；ob_levelcard_column COUNT=3（還原）；ob_card_type(X) COUNT=1（還原）；assignment_audit_log 無新增 action='DELETE' 記錄 |

> **注意（RISK-F070-01 適用）**：SQLite savepoint rollback 行為需確認；若不可靠改用 Test Container PostgreSQL 執行。

### G. API Integration Tests — NULL PK Fallback 刪除守護

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F072-19 | 級聯刪除包含 ob_tier card_level=NULL（Fallback 列）時正確刪除（NULL PK delete regression guard） | AC-3、BR-11 | Integration | ob_card_type(X)；ob_tier(X/null→T2 1筆 Fallback 列 + X/A→T1 1筆 Standard 列）；SM Token | DELETE /card-types/X?confirmCascade=true | HTTP 200；後驗 ob_tier COUNT=0（含 card_level=NULL 的 Fallback 列也被成功刪除）；若 service 改用 repo.delete({card_level:null}) 路徑，此案例 ob_tier COUNT=1（測試失敗，regression 被抓住） |

> **設計說明**：此 TC 專門守護 TypeORM `repo.delete({card_level: null})` 的靜默 bug（SQL `WHERE card_level = NULL` 永不匹配）。正確路徑為先 `repo.findOneBy({card_type:'X', card_level: null})` 取得 entity，再呼叫 `repo.remove(entity)`。詳見 `docs/test-specs/regression/M02-regression-guards.md` TC-GUARD-NULL-PK-001。

### H. Frontend Unit Tests

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F072-03 | listDefinitionsAffected > 0 時確認對話框顯示警告文字 | AC-2 | Frontend Unit | stub GET delete-preview 回傳 listDefinitionsAffected=3 | 點擊「停用」按鈕，等待對話框渲染 | 對話框含「注意：該計分卡仍有 3 筆有效名單定義」警告文字；「確認停用」按鈕存在（不被停用） |
| TC-F072-04 | listDefinitionsAffected = 0 時確認對話框不顯示警告 | AC-2 | Frontend Unit | stub GET delete-preview 回傳 listDefinitionsAffected=0 | 點擊「停用」按鈕，等待對話框渲染 | 對話框不含警告文字（不顯示「注意」段落）；顯示正常級聯範圍說明 |
| TC-F072-11 | 停用成功後清單刷新，已刪除 CARD_TYPE 不再顯示 | AC-6 | Frontend Unit | stub DELETE 回傳 HTTP 200；stub GET /card-types 第二次呼叫回傳不含 X 的清單 | 確認對話框點擊「確認停用」 | Tab 1 清單不再顯示 X 列；清單刷新（GET /card-types 被呼叫第二次） |
| TC-F072-12 | 被停用之 CARD_TYPE 為當前選中 → 清除選中、Tab 2~5 空狀態 | AC-6 | Frontend Unit | 當前 selectedCardType='X'；stub DELETE 回傳 HTTP 200 | 停用 X 後 | selectedCardType 狀態清除（為 null 或 undefined）；Tab 2~5 顯示「請選擇計分卡類型以查看設定」空狀態提示；不自動選中其他 CARD_TYPE |

---

## 跨 Spec 整合測試（級聯刪除完整驗證）

以下整合測試補充於本檔末段，亦引用自 `docs/test-specs/integration/M02-cross-spec-tests.md`。

### IT-CASCADE-001：完整六步驟 Transaction 筆數驗證

| 項目 | 內容 |
|------|------|
| 測試類型 | Integration（跨 spec 整合） |
| 關聯 spec | F072 AC-3 + AC-4 + BR-3 + BR-6 |
| 測試環境 | Supertest + SQLite in-memory（或 Test Container PostgreSQL） |
| 前置 seed | ob_card_type(X)、ob_levelcard_version(X v1 1筆)、ob_levelcard_column(X 3筆)、ob_levelcard_score(X 6筆)、ob_levelcard_level(X 4筆)、ob_tier(X/A→T1 + X/null→T2 共 2 筆)、ob_list_definition(引用 X 2筆 active)、ob_pool_data_list 5筆歷史（本表不含 card_type 欄位，以 list_no 等 PK 區分） |
| 步驟 1 | GET delete-preview → 驗 cascade.versions=1、columns=3、scores=6、levels=4、tierMappings=2、listDefinitionsAffected=2 |
| 步驟 2 | DELETE /card-types/X?confirmCascade=true → 驗 HTTP 200、deletedCascade 各 count 符合 |
| 後驗 ob_tier | COUNT=0（Fallback 列 card_level=NULL 也被刪除） |
| 後驗 ob_levelcard_score | COUNT=0 |
| 後驗 ob_levelcard_level | COUNT=0 |
| 後驗 ob_levelcard_column | COUNT=0 |
| 後驗 ob_levelcard_version | COUNT=0 |
| 後驗 ob_card_type(X) | COUNT=0 |
| 後驗 ob_pool_data_list 全表 COUNT(*) | COUNT=5（前後不變；本表不含 card_type 欄位，級聯刪除概念上不影響此表） |
| 後驗 ob_list_definition(X) | COUNT=2（警告但保留） |
| 後驗 audit_log | action='DELETE'、entity_type='ob_card_type'、before_value 含 6 表 count 摘要、after_value=null |

---

## 邊界與例外情境

| ID | 情境 | 預期行為 | 測試類型 |
|----|------|---------|---------|
| BE-F072-001 | CARD_TYPE 無任何下游紀錄（空淨 CARD_TYPE） | DELETE 成功；deletedCascade 全部 count=0；ob_card_type 本身仍被刪除 | Integration |
| BE-F072-002 | delete-preview 呼叫不存在的 cardType | HTTP 404 CARD_TYPE_NOT_FOUND | Integration |

---

## 測試資料

### Seed 資料（SQLite in-memory E2E）

```sql
-- ob_card_type（待停用目標）
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
VALUES ('X', '測試停用卡', '01', 'active', NOW(), 'system', NOW(), 'system');

-- ob_levelcard_version（1 筆）
INSERT INTO ob_levelcard_version (card_type, card_name, card_version, sdate, edate, status)
VALUES ('X', '測試版本', 1, '20260514', '20991231', 'active');

-- ob_levelcard_column（3 筆）
INSERT INTO ob_levelcard_column (card_type, card_version, column_name, column_label, status)
VALUES
  ('X', 1, 'COL_A', '欄位A', 'active'),
  ('X', 1, 'COL_B', '欄位B', 'active'),
  ('X', 1, 'COL_C', '欄位C', 'active');

-- ob_levelcard_score（6 筆）
INSERT INTO ob_levelcard_score (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('X', 1, 'COL_A', NULL, '0', '10', 5),
  ('X', 1, 'COL_A', NULL, '11', '20', 10),
  ('X', 1, 'COL_B', 'Y', NULL, NULL, 8),
  ('X', 1, 'COL_B', 'N', NULL, NULL, 0),
  ('X', 1, 'COL_C', NULL, '0', '5', 3),
  ('X', 1, 'COL_C', NULL, '6', '10', 6);

-- ob_levelcard_level（4 筆）
INSERT INTO ob_levelcard_level (card_type, card_version, card_level, score_s, score_e)
VALUES
  ('X', 1, 'A', 20, 99),
  ('X', 1, 'B', 15, 19),
  ('X', 1, 'C', 10, 14),
  ('X', 1, 'D', 0,  9);

-- ob_tier（2 筆：1 Standard + 1 Fallback）
INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
VALUES
  ('X', 'A',  'T1', NULL),    -- Standard 列
  ('X', NULL, 'T2', NULL);    -- Fallback 列（card_level IS NULL）

-- ob_list_definition（2 筆 active，供 listDefinitionsAffected 驗證）
-- ob_pool_data_list（5 筆歷史，供排除項目驗證）

-- 月跑鎖 seed（TC-F072-14，pending；4 欄全填）
INSERT INTO assignment_run (run_id, project_workym, triggered_by, created_at, status)
VALUES ('run-pending-f072', '202604', 'test-user-id', NOW(), 'pending');

-- 月跑鎖 seed（TC-F072-15，running；4 欄全填）
INSERT INTO assignment_run (run_id, project_workym, triggered_by, created_at, status)
VALUES ('run-running-f072', '202604', 'test-user-id', NOW(), 'running');
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
| TC-F072-01~02（delete-preview） | 高 | 直接查詢 DB count 驗證；seed 固定筆數 |
| TC-F072-05（六步驟級聯） | 高 | 逐一 COUNT 查詢；含 Fallback card_level=NULL 驗證 |
| TC-F072-06（audit_log） | 高 | 直接查詢 assignment_audit_log |
| TC-F072-07、08（排除項目） | 高 | seed ob_pool_data_list / ob_list_definition；DELETE 後查詢 COUNT |
| TC-F072-18（rollback 守護） | 中 | 依 RISK-F070-01，SQLite savepoint 行為需確認；建議 PostgreSQL Test Container |
| TC-F072-19（NULL PK regression） | 高 | 關鍵守護 TC；若 repo.remove() 正確，COUNT=0；若誤用 repo.delete()，COUNT=1，case 失敗 |
| TC-F072-03、04、11、12（Frontend Unit） | 高 | RTL；stub API；selectedCardType context 可注入 |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F069（Tab 1 入口）、F070（需先建立才能停用） |
| 環境依賴 | SQLite in-memory；ob_pool_data_list / ob_list_definition entity 需已定義於 E2E 的 entities 清單 |
| RISK-F072-01 | delete-preview 與 DELETE 之間的 race condition（A-5 假設）：DELETE response 的 deletedCascade count 以 DELETE 內部重新計數為準；測試僅驗最終 count，不驗與 preview 是否完全一致 |
