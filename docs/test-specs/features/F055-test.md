---
type: test-design-feature
feature_id: F055
feature_name: 編輯 CARD_LEVEL 分級門檻
priority: P0-MVP
related_spec: /docs/specs/features/F055-edit-card-level-thresholds.md
last_updated: 2026-05-13
---

# F055: 編輯 CARD_LEVEL 分級門檻 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F055-edit-card-level-thresholds.md` + `error-handling.md#assignment-scoring-errors` + `data-model.md#e07-data-model` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + Test Container PostgreSQL）、Frontend Unit（React Testing Library） |
| 更新語意驗證 | PUT 依 `(card_type, card_version, card_level)` 三欄定位 UPDATE，不傳 surrogate id；card_version 不遞增 |
| 等級數不一致場景 | 植入 S5（2 級：A/B）與 H（4 級：A/B/C/D）各自的 ob_levelcard_level seed，分別測試；API/UI 不可硬編碼 4 級邏輯 |
| 重疊邊界 | 「A.score_e=80，B.score_s=65」為重疊（拒絕）；「A.score_e=80，B.score_s=81」為合法相鄰（允許）；各設計獨立案例 |
| Preview 快取策略 | CI 中只驗計算正確性；快取 60 秒行為移至 Manual QA（除非實作提供 injectable TTL）；Preview URL encode 使用 spec 5.2 提供的範例字串 |
| Audit Log 驗證 | PUT 成功後查 assignment_audit_log，確認 action='UPDATE'，before/after_value 含 score_s / score_e |

---

## Acceptance Test Design

### AC-1：顯示目前 CARD_LEVEL 門檻設定

| 項目 | 內容 |
|------|------|
| Given | ob_levelcard_level 有 CARD_TYPE='H'、card_version=1、4 筆等級（A/B/C/D）；Sales Manager Token |
| When | 呼叫 `GET /api/v1/assignment/scoring/card-levels?cardType=H&cardVersion=1` |
| Then | HTTP 200；回傳 levels 陣列長度 4；各筆含 cardLevel / scoreS / scoreE |

### AC-2：修改門檻值並儲存

| 項目 | 內容 |
|------|------|
| Given | H active 版本，A 級 [243,999]，B 級 [214,242]，C 級 [185,213]，D 級 [0,184]；無月跑鎖；SM Token |
| When | 呼叫 PUT，將 A 級改為 [250,999]，B 級改為 [214,249]，C/D 不變 |
| Then | HTTP 200；response.updatedLevels=4；DB 中 A 級 score_s=250、score_e=999；audit_log 記錄修改前後值 |

### AC-3：門檻變更預覽影響

| 項目 | 內容 |
|------|------|
| Given | ob_pool_data 有已知客戶數量；SM Token |
| When | 呼叫 `GET /api/v1/assignment/scoring/card-levels/preview?cardType=H&levels=[encoded]` |
| Then | HTTP 200；distribution 為 JSONB 物件，各等級數值加總等於 ob_pool_data 中 CARD_TYPE='H' 的總筆數 |

### AC-4：月跑執行中禁止修改

| 項目 | 內容 |
|------|------|
| Given | assignment_run status='running'；SM Token |
| When | 呼叫 PUT /api/v1/assignment/scoring/card-levels |
| Then | HTTP 409，SCORING_VERSION_LOCKED |

### AC-5：門檻區間重疊驗證

| 項目 | 內容 |
|------|------|
| Given | 無月跑鎖；SM Token |
| When | PUT 傳入 A 級 score_e=80，B 級 score_s=65（B.score_s ≤ A.score_e，重疊） |
| Then | HTTP 422，SCORING_RANGE_OVERLAP；訊息含「等級 B 下限 65 與等級 A 上限 80 重疊」；DB 中原有資料不變 |

---

## Test Scenarios

### A. API Integration Tests — 查詢與修改

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-001 | 查詢 H 型（4 級）CARD_LEVEL 門檻 | AC-1 | Integration | ob_levelcard_level(H,v1) 4 筆（A/B/C/D）；SM Token | GET /api/v1/assignment/scoring/card-levels?cardType=H&cardVersion=1 | HTTP 200；levels 陣列長度=4；各筆含 cardLevel / scoreS / scoreE |
| TS-F055-002 | 查詢 S5 型（2 級）CARD_LEVEL 門檻 | AC-1（等級數不一致） | Integration | ob_levelcard_level(S5,v1) 2 筆（A/B）；SM Token | GET /api/v1/assignment/scoring/card-levels?cardType=S5&cardVersion=1 | HTTP 200；levels 陣列長度=2（僅 A/B）；不硬編碼 4 級 |
| TS-F055-003 | 正常儲存 H 型 4 級門檻修改 | AC-2 | Integration | H active 版本，初始 A:[243,999]、B:[214,242]、C:[185,213]、D:[0,184]；無月跑鎖；SM Token | PUT card-levels（A 改為 [250,999]，B 改為 [214,249]，C/D 不變） | HTTP 200；updatedLevels=4；DB 中 A 級 score_s=250；card_version 仍為 1 |
| TS-F055-004 | 正常儲存 S5 型 2 級門檻修改 | AC-2（等級數） | Integration | S5 active 版本，A/B 兩級；無月跑鎖；SM Token | PUT card-levels（只傳 2 筆 levels，A/B） | HTTP 200；updatedLevels=2；DB 中 S5 的 A/B 更新正確 |
| TS-F055-005 | PUT 依三欄複合鍵定位更新（驗證不用 surrogate id） | AC-2, spec 5.1 | Integration | H active 版本，B 級有 surrogate id=999；無月跑鎖；SM Token | PUT 不傳 id，只傳 cardLevel='B'、scoreS=220、scoreE=242 | HTTP 200；DB 中 card_level='B' 對應列 score_s=220（以三欄定位，非 id） |
| TS-F055-006 | PUT 成功後 audit_log 記錄 UPDATE 含 before/after | AC-2 | Integration | 同 TS-F055-003 成功後 | 查詢 assignment_audit_log 最新一筆 | action='UPDATE'；before_value 含 A 級舊 score_s=243；after_value 含 A 級新 score_s=250 |
| TS-F055-007 | assignment_run status='pending' 時 PUT 回 409 | AC-4, BR-3 | Integration | assignment_run(status='pending')；SM Token | PUT /api/v1/assignment/scoring/card-levels | HTTP 409，SCORING_VERSION_LOCKED |
| TS-F055-008 | assignment_run status='running' 時 PUT 回 409 | AC-4, BR-3 | Integration | assignment_run(status='running')；SM Token | PUT /api/v1/assignment/scoring/card-levels | HTTP 409，SCORING_VERSION_LOCKED |
| TS-F055-009 | 門檻重疊（B.score_s ≤ A.score_e）回 422 | AC-5, BR-1 | Integration | 無月跑鎖；SM Token | PUT 傳入 A:[81,100]、B:[65,80]（B.score_s=65 < A.score_s=81，兩等級 overlap） | HTTP 422，SCORING_RANGE_OVERLAP；DB 原資料不變 |
| TS-F055-010 | 相鄰等級合法（score_e+1=下一級 score_s） | AC-5, BR-1 | Integration | 無月跑鎖；SM Token | PUT 傳入 A:[81,100]、B:[61,80]（80+1=81，剛好相鄰） | HTTP 200；不回 SCORING_RANGE_OVERLAP |
| TS-F055-011 | 未登入回 401 | 第 5.2 節 | Integration | 無 Token | PUT /api/v1/assignment/scoring/card-levels | HTTP 401，AUTH_TOKEN_MISSING |
| TS-F055-012 | 非 Sales Manager 回 403 | 第 5.2 節 | Integration | is_sales_manager=false 的 Token | PUT /api/v1/assignment/scoring/card-levels | HTTP 403，AUTH_FORBIDDEN |

### B. API Integration Tests — Preview 端點

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-013 | preview 分佈加總等於 ob_pool_data 總筆數 | AC-3 | Integration | ob_pool_data 植入已知筆數（如 100 筆 H 型，分數已知）；SM Token | GET /api/v1/assignment/scoring/card-levels/preview?cardType=H&levels=[URL encoded 門檻陣列] | HTTP 200；distribution.A + B + C + D = 100（加總等於 pool_data 筆數） |
| TS-F055-014 | preview URL encoded levels 參數格式 | AC-3, spec 5.2 | Integration | SM Token | GET preview 使用 spec 5.2 範例字串（levels=%5B%7B%22cardLevel%22%3A%22A%22...%7D%5D） | HTTP 200；正確解析 JSON 並計算 distribution |

### C. Frontend Unit Tests — 門檻編輯 UI

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-015 | S5（2 級）門檻表格只渲染 A/B 兩列 | AC-1（等級數） | Frontend Unit | stub API 回傳 S5 levels 2 筆（A/B） | 渲染 CARD_LEVEL 門檻 Tab | 表格只有 2 列（A 與 B）；不顯示 C/D；無空白行 |
| TS-F055-016 | H（4 級）門檻表格渲染 A/B/C/D 四列 | AC-1 | Frontend Unit | stub API 回傳 H levels 4 筆（A/B/C/D） | 渲染 CARD_LEVEL 門檻 Tab | 表格有 4 列；等級依序顯示 |
| TS-F055-017 | 月跑執行中儲存按鈕 disabled | AC-4 | Frontend Unit | isLocked=true | 渲染頁面 | 「儲存門檻」按鈕 disabled=true；DOM 中按鈕存在但不可點擊 |
| TS-F055-018 | 門檻修改後 preview 分佈即時更新（debounce） | AC-3 | Frontend Unit | stub GET preview 回傳已知 distribution；isLocked=false | 修改 A 級 scoreS 欄位（觸發 debounce 300ms 後） | preview 區顯示新的 distribution 數字；更新前後數字不同 |
| TS-F055-019 | 重疊錯誤提示顯示於問題等級列（紅色邊框） | AC-5 | Frontend Unit | stub PUT 回傳 HTTP 422 SCORING_RANGE_OVERLAP | 點擊儲存 | 問題等級（B 級）的 scoreS 輸入框顯示紅色邊框；錯誤訊息顯示於該列旁 |
| TS-F055-020 | 門檻儲存成功後顯示成功提示 | AC-2 | Frontend Unit | stub PUT 回傳 HTTP 200 | 點擊「儲存門檻」 | 頁面顯示儲存成功提示（toast 或 inline） |
| TS-F055-021 | preview 區顯示 ob_pool_data 樣本數來源說明 | AC-3, prototype 28 | Frontend Unit | stub preview 回傳 distribution 及樣本數 n=9500 | 渲染 preview 區 | 頁面顯示「樣本來源 ob_pool_data n=9,500」或等效文字 |

---

## 邊界與例外情境

| ID | 情境 | 預期行為 | 測試類型 |
|----|------|---------|---------|
| BE-F055-001 | PUT levels 陣列比 DB 現有筆數少（如 H 型只傳 A/B 兩筆） | 行為依實作：僅更新傳入的 2 筆，C/D 保留；或回 422 VALIDATION_ERROR（等級數不足）；測試需確認後補充期望值 | Integration |
| BE-F055-002 | preview 門檻中某等級 scoreS > scoreE（不合理范圍） | 回 422 SCORING_RANGE_OVERLAP 或 VALIDATION_ERROR | Integration |
| BE-F055-003 | ob_pool_data 為空時 preview 回傳全零 distribution | distribution 各等級=0；HTTP 200（非錯誤） | Integration |

---

## 測試資料

### Seed 資料（Test Container PostgreSQL）

```sql
-- H 型（4 級）ob_levelcard_level
INSERT INTO ob_levelcard_level (card_type, card_version, card_level, score_s, score_e)
VALUES
  ('H', 1, 'A', 243, 999),
  ('H', 1, 'B', 214, 242),
  ('H', 1, 'C', 185, 213),
  ('H', 1, 'D', 0,   184);

-- S5 型（2 級）ob_levelcard_level
INSERT INTO ob_levelcard_level (card_type, card_version, card_level, score_s, score_e)
VALUES
  ('S5', 1, 'A', 200, 999),
  ('S5', 1, 'B', 0,   199);

-- ob_pool_data（preview 計算用，植入已知分數分佈）
-- 假設 100 筆 H 型客戶：A 級 20 筆（score >= 243）、B 級 40 筆（214-242）、C 級 30 筆（185-213）、D 級 10 筆（0-184）
-- 實際 seed 需配合 ob_pool_data 的具體 schema（此處為示意）

-- 月跑鎖 fixture（TS-F055-007 / 008 分別使用）
INSERT INTO assignment_run (run_ym, status, created_at) VALUES ('202604', 'pending', NOW());
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
| TS-F055-001 ~ 014（Integration） | 高 | Supertest + Test Container；不依賴時鐘；audit_log 直接 DB 查詢驗證 |
| TS-F055-013（preview 加總） | 高 | 以受控 seed ob_pool_data（已知筆數）驗證加總，確定性高 |
| TS-F055-014（URL encoded 格式） | 高 | 直接使用 spec 5.2 提供的 encoded 字串 |
| TS-F055-015 ~ 021（Frontend Unit） | 高 | React Testing Library；isLocked 以 mock prop 注入；debounce 以 fake timer 控制 |
| 快取 60 秒行為（BR-2） | Manual QA | CI 中不驗真實等待；若實作提供 injectable TTL，可升級為自動化 |
| BE-F055-001（levels 陣列數不足） | 待確認 | 行為待實作定義後補充期望值 |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F053（需有 active 版本）、Migration 1711360000100（ob_levelcard_level 表）、ob_pool_data 表（preview 計算） |
| 環境依賴 | Test Container PostgreSQL（AppDB）；ob_pool_data 需植入合理種子資料 |
| 風險-1 | TS-F055-013 preview 加總驗證依賴 ob_pool_data 的計分計算邏輯（fn_calc_tier_level）；若 preview 只套用 CARD_LEVEL 門檻而不重新計算分數（更可能的實作方案），需確認 ob_pool_data 中已有 computed score，測試種子資料要預先寫入 score 值 |
| 風險-2 | 若 preview 計算改以 ob_pool_data 的既有 score 欄位套用新門檻（非重新呼叫 fn_calc_tier_level），需釐清 API 讀取的是哪個 score 欄位 |
| 風險-3 | S5 型 2 級門檻（TS-F055-002、TS-F055-004）需確認 ob_levelcard_level 中實際 S5 的等級是 A/B 兩筆；若 dump 實際值與預設不同，需依 dump 真實資料調整 seed |
