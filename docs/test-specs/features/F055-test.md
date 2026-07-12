---
type: test-design-feature
feature_id: F055
feature_name: 編輯 CARD_LEVEL 分級門檻（M02 Tab 4）
priority: P0-MVP
related_spec: /docs/specs/features/F055-edit-card-level-thresholds.md
last_updated: 2026-07-12
spec_version: "1.7"
---

# F055: 編輯 CARD_LEVEL 分級門檻（M02 Tab 4） — 測試設計

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
| **v1.7 抽樣估算（US-174 / AD-E07-45）** | §5.2 preview 改抽樣估算（固定樣本 50,000 + 可重現種子 42 + 放大推算），取代 v1.6 全量即時計分（含 §5.2 之 BR-2 快取移除，見 v1.7 §I/J 節）；共用元件 `sampling-estimator.ts` 之核心測試**唯一**位於本文件 I 組，F056 / F050 之新增測試 cross-ref 本組不重複驗證 |
| **v1.7 MSSQL-only 測試邊界** | 本專案已完成 MSSQL-only 遷移，PG 測試基礎設施已移除；`TABLESAMPLE` 真實執行行為（決定性 / 效能）僅能於 MSSQL 真實 DB（`.mssql.spec.ts`）驗證，無 MSSQL 可達時誠實 `describe.skip`；純函式與小母體 fallback 分支可於 SQLite / 無 DB 連線之 Unit Test 驗證 |

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
| Given | H active 版本，A 級 [243,999]，B 級 [214,242]，C 級 [185,213]，D 級 [0,184]；無月名單分派鎖；SM Token |
| When | 呼叫 PUT，將 A 級改為 [250,999]，B 級改為 [214,249]，C/D 不變 |
| Then | HTTP 200；response.updatedLevels=4；DB 中 A 級 score_s=250、score_e=999；audit_log 記錄修改前後值 |

### AC-3：門檻變更預覽影響

| 項目 | 內容 |
|------|------|
| Given | ob_pool_data 有已知客戶數量；SM Token |
| When | 呼叫 `GET /api/v1/assignment/scoring/card-levels/preview?cardType=H&levels=[encoded]` |
| Then | HTTP 200；distribution 為 JSONB 物件，各等級數值加總等於 ob_pool_data 中 CARD_TYPE='H' 的總筆數 |

### AC-4：月名單分派執行中禁止修改

| 項目 | 內容 |
|------|------|
| Given | assignment_run status='running'；SM Token |
| When | 呼叫 PUT /api/v1/assignment/scoring/card-levels |
| Then | HTTP 409，SCORING_VERSION_LOCKED |

### AC-5：門檻區間重疊驗證

| 項目 | 內容 |
|------|------|
| Given | 無月名單分派鎖；SM Token |
| When | PUT 傳入 A 級 score_e=80，B 級 score_s=65（B.score_s ≤ A.score_e，重疊） |
| Then | HTTP 422，SCORING_RANGE_OVERLAP；訊息含「等級 B 下限 65 與等級 A 上限 80 重疊」；DB 中原有資料不變 |

---

## Test Scenarios

### A. API Integration Tests — 查詢與修改

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-001 | 查詢 H 型（4 級）CARD_LEVEL 門檻 | AC-1 | Integration | ob_levelcard_level(H,v1) 4 筆（A/B/C/D）；SM Token | GET /api/v1/assignment/scoring/card-levels?cardType=H&cardVersion=1 | HTTP 200；levels 陣列長度=4；各筆含 cardLevel / scoreS / scoreE |
| TS-F055-002 | 查詢 S5 型（2 級）CARD_LEVEL 門檻 | AC-1（等級數不一致） | Integration | ob_levelcard_level(S5,v1) 2 筆（A/B）；SM Token | GET /api/v1/assignment/scoring/card-levels?cardType=S5&cardVersion=1 | HTTP 200；levels 陣列長度=2（僅 A/B）；不硬編碼 4 級 |
| TS-F055-003 | 正常儲存 H 型 4 級門檻修改 | AC-2 | Integration | H active 版本，初始 A:[243,999]、B:[214,242]、C:[185,213]、D:[0,184]；無月名單分派鎖；SM Token | PUT card-levels（A 改為 [250,999]，B 改為 [214,249]，C/D 不變） | HTTP 200；updatedLevels=4；DB 中 A 級 score_s=250；card_version 仍為 1 |
| TS-F055-004 | 正常儲存 S5 型 2 級門檻修改 | AC-2（等級數） | Integration | S5 active 版本，A/B 兩級；無月名單分派鎖；SM Token | PUT card-levels（只傳 2 筆 levels，A/B） | HTTP 200；updatedLevels=2；DB 中 S5 的 A/B 更新正確 |
| TS-F055-005 | PUT 依三欄複合鍵定位更新（驗證不用 surrogate id） | AC-2, spec 5.1 | Integration | H active 版本，B 級有 surrogate id=999；無月名單分派鎖；SM Token | PUT 不傳 id，只傳 cardLevel='B'、scoreS=220、scoreE=242 | HTTP 200；DB 中 card_level='B' 對應列 score_s=220（以三欄定位，非 id） |
| TS-F055-006 | PUT 成功後 audit_log 記錄 UPDATE 含 before/after | AC-2 | Integration | 同 TS-F055-003 成功後 | 查詢 assignment_audit_log 最新一筆 | action='UPDATE'；before_value 含 A 級舊 score_s=243；after_value 含 A 級新 score_s=250 |
| TS-F055-007 | assignment_run status='pending' 時 PUT 回 409 | AC-4, BR-3 | Integration | assignment_run(status='pending')；SM Token | PUT /api/v1/assignment/scoring/card-levels | HTTP 409，SCORING_VERSION_LOCKED |
| TS-F055-008 | assignment_run status='running' 時 PUT 回 409 | AC-4, BR-3 | Integration | assignment_run(status='running')；SM Token | PUT /api/v1/assignment/scoring/card-levels | HTTP 409，SCORING_VERSION_LOCKED |
| TS-F055-009 | 門檻重疊（B.score_s ≤ A.score_e）回 422 | AC-5, BR-1 | Integration | 無月名單分派鎖；SM Token | PUT 傳入 A:[81,100]、B:[65,80]（B.score_s=65 < A.score_s=81，兩等級 overlap） | HTTP 422，SCORING_RANGE_OVERLAP；DB 原資料不變 |
| TS-F055-010 | 相鄰等級合法（score_e+1=下一級 score_s） | AC-5, BR-1 | Integration | 無月名單分派鎖；SM Token | PUT 傳入 A:[81,100]、B:[61,80]（80+1=81，剛好相鄰） | HTTP 200；不回 SCORING_RANGE_OVERLAP |
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
| TS-F055-017 | 月名單分派執行中儲存按鈕 disabled | AC-4 | Frontend Unit | isLocked=true | 渲染頁面 | 「儲存門檻」按鈕 disabled=true；DOM 中按鈕存在但不可點擊 |
| TS-F055-018 | ⚠️ v1.2 SUPERSEDED — 門檻修改後 preview 分佈即時更新（debounce，**已改為 client-side 即時重新分桶，不再對每次門檻編輯呼叫後端**；見下方「v1.2 追加修正」Group N，TS-F055-057） | AC-3（歷史，pre-v1.2） | Frontend Unit（保留供歷史對照，不建議依此案例撰寫新測試） | stub GET preview 回傳已知 distribution；isLocked=false | 修改 A 級 scoreS 欄位（觸發 debounce 300ms 後） | ~~preview 區顯示新的 distribution 數字；更新前後數字不同~~（此「編輯即重新呼叫後端」假設已被 AD-E07-45 v1.2 推翻：histogram 每 cardType 僅載入一次，門檻編輯改為前端瞬時重新分桶，不再產生新的 HTTP 請求） |
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

-- 月名單分派鎖 fixture（TS-F055-007 / 008 分別使用）
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
| 快取 60 秒行為（BR-2） | ~~Manual QA~~ **v1.7 移除**：BR-2 快取機制已移除（AD-E07-45 §3.4），改為 TS-F055-045 迴歸守門驗證快取程式碼不存在 |
| BE-F055-001（levels 陣列數不足） | 待確認 | 行為待實作定義後補充期望值 |
| TS-F055-028 ~ 039（I 組，抽樣估算共用元件） | 高（純函式）/ 中（MSSQL 真實 DB 部分） | 純函式與字串 shape 測試（028-037）無需 DB 連線，CI 常駐；038/039 需 MSSQL 真實 DB，本機無法連線時 `describe.skip` |
| TS-F055-040 ~ 046（J 組，previewCardLevels 改寫） | 高（小母體）/ 中（大母體 MSSQL） | 040-042/045/046 可用 SQLite 小母體驗證；043/044 需 MSSQL 真實 DB |
| TS-F055-047 ~ 052（K 組，前端三態） | 高 | React Testing Library；fake timer 控制 debounce；無 DB 依賴 |
| TS-F055-053 ~ 054（L 組，讀鎖豁免） | 高 | SQLite 小母體可行；為 AD-E07-45 §6 裁決之迴歸守門，非依賴 F055 spec 文件字面 |
| TS-F055-055（M 組，v1.2 histogram 欄位） | 高 | SQLite 小母體可行；純契約 + 一致性驗證，無需真實 TABLESAMPLE |
| TS-F055-056 ~ 059（N 組，v1.2 client-side 重新分桶） | 高 | React Testing Library；無 DB / 無真實 HTTP 依賴（spy fetch 呼叫次數即可）；取代並使 TS-F055-018 SUPERSEDED |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F053（需有 active 版本）、F069（ob_card_type 必須存在，v1.4 新增 CARD_TYPE_NOT_FOUND）、ob_pool_data 表（preview 計算） |
| 環境依賴 | SQLite in-memory（E2E）；ob_pool_data 需植入合理種子資料；ob_card_type entity 需已加入 entities 清單 |
| 風險-1 | TS-F055-013 preview 加總驗證依賴 ob_pool_data 的計分計算邏輯（fn_calc_tier_level）；若 preview 只套用 CARD_LEVEL 門檻而不重新計算分數（更可能的實作方案），需確認 ob_pool_data 中已有 computed score，測試種子資料要預先寫入 score 值 |
| 風險-2 | 若 preview 計算改以 ob_pool_data 的既有 score 欄位套用新門檻（非重新呼叫 fn_calc_tier_level），需釐清 API 讀取的是哪個 score 欄位 |
| 風險-3 | S5 型 2 級門檻（TS-F055-002、TS-F055-004）需確認 ob_levelcard_level 中實際 S5 的等級是 A/B 兩筆；若 dump 實際值與預設不同，需依 dump 真實資料調整 seed |
| 風險-4（v1.7） | AD-E07-45（抽樣估算共用元件）為 F055 / F056 / F050 三消費者共用架構決策；本文件 I 組為該元件之唯一測試位置，F056-test.md / F050-test.md 之新增測試僅 cross-ref 不重複驗證，若三份文件任一方未來獨立修改 I 組內容，需同步檢查另兩份文件之 cross-ref 是否仍成立 |
| 風險-5（v1.7） | F055 spec v1.7 §5.2 錯誤回應表目前仍列 409 SCORING_VERSION_LOCKED，與 AD-E07-45 §6 裁決（讀鎖豁免）不一致；本文件 L 組依 AD 裁決設計，spec 文件對齊（v1.8）為 PO / spec-writer 後續事項，非本測試設計阻擋項 |
| 風險-6（v1.2 追加修正） | `docs/specs/implementation-log/AD-E07-45-sampling-estimator.md` 檔案本身截至本次修訂仍為 v1.1，未見 v1.2（`histogram` 欄位 + client-side 重新分桶 + ~12 秒效能可接受）之正式文字；M/N 組依 coordinator 轉達之 team-lead 決策設計，AD 文件與 F055 spec §5.2 response schema（補 `histogram` 欄位）之正式同步為 system-architect / spec-writer 後續事項，非本測試設計阻擋項；若正式 AD v1.2 內容與本節假設有出入，需回頭核對修訂 |
| 風險-7（v1.2 追加修正） | TS-F055-018（v1.0 時期「debounce 後端重新呼叫」假設）已標記 SUPERSEDED 但**保留原案例**供歷史對照，不建議下游依該案例撰寫新測試；新測試應依 Group N（TS-F055-056~059） |

---

## v1.4 新增 Test Scenarios

### F. API Integration Tests — DELETE 等級端點與 cardType 404（v1.4 新增）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-022 | DELETE /card-levels/:cardLevel 正常刪除等級 | AC-6（v1.4） | Integration | ob_card_type(H active)；ob_levelcard_level(H, v1, D 等級存在)；無月名單分派鎖；SM Token | DELETE /api/v1/assignment/scoring/card-levels/D?cardType=H | HTTP 200；DB ob_levelcard_level WHERE card_type='H' AND card_level='D' 無紀錄（實體刪除）；ob_levelcard_level 其他等級（A/B/C）不受影響 |
| TS-F055-023 | DELETE 等級時月名單分派執行中回 409 | AC-6（v1.4） | Integration | assignment_run(run_id='r1', project_workym='202604', triggered_by='u1', created_at=NOW(), status='running')；SM Token | DELETE /api/v1/assignment/scoring/card-levels/D?cardType=H | HTTP 409；errorCode='SCORING_VERSION_LOCKED' |
| TS-F055-024 | DELETE 不存在的等級回 404 | AC-6（v1.4） | Integration | ob_card_type(H active)；ob_levelcard_level 無 H/Z；SM Token | DELETE /api/v1/assignment/scoring/card-levels/Z?cardType=H | HTTP 404；errorCode='CARD_LEVEL_NOT_FOUND' |
| TS-F055-025 | GET / PUT 傳不存在的 cardType 回 404 | AC-7（v1.4） | Integration | ob_card_type 無 'NOTEXIST'；SM Token | GET /api/v1/assignment/scoring/card-levels?cardType=NOTEXIST | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |

### G. Frontend Unit Tests — DELETE 等級 UI（v1.4 新增）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-026 | DELETE 等級成功後清單移除該列並顯示 toast | AC-6（v1.4） | Frontend Unit | stub DELETE 回傳 HTTP 200；isLocked=false | 點擊 D 級列的「刪除」按鈕 → 確認對話框確認 | ob_levelcard_level 清單不再顯示 D 級列；顯示刪除成功 toast 通知 |

### H. audit_log 驗證（DELETE 等級，v1.4 新增）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-027 | DELETE 等級成功後 audit_log 記錄 action='DELETE' | AC-6（v1.4） | Integration | TC-F055-022 成功後 | 查詢 assignment_audit_log 最新一筆 | action='DELETE'；entity_type='ob_levelcard_level'；entity_id 含 'H\|D'（或等效格式）；before_value 含 score_s / score_e；after_value=null |

---

## v1.7 新增 Test Scenarios（US-174 §5.2 preview 改抽樣估算 + 前端三態，AD-E07-45）

> **背景**：F055 v1.7（US-174）將 §5.2 `GET .../card-levels/preview` 從「全表即時 Stage 2 計分」（生產環境 CARD_TYPE=E 實測 224.6 秒）改為「`ob_pool_data` 固定樣本 + 可重現種子 + 放大推算」（AD-E07-45），並修正前端 `catch { setPreview(null) }` 靜默吞噬缺陷。抽樣核心元件 `sampling-estimator.ts`（`POOL_DATA_SAMPLE_SIZE` / `POOL_DATA_SAMPLE_SEED` / `getPoolDataTotalCount` / `buildPoolDataSampleFrom` / `scaleEstimate`）為 **F055 / F056 / F050 三消費者共用**；本組（I）為該共用元件之**唯一測試位置**，[F056-test.md](F056-edit-tier-mapping.md 對應之測試設計) 與 [F050-test.md](F050-create-list-definition.md 對應之測試設計) 之抽樣估算相關新增測試一律 cross-reference 本組，不重複驗證常數值 / `scaleEstimate` / `buildPoolDataSampleFrom` 之核心邏輯，僅各自新增消費端特有的整合案例。
>
> **測試邊界（誠實聲明，依 AD-E07-45 §8 + 本專案現況）**：本專案已完成 MSSQL-only 遷移（PG 測試基礎設施 / CI 已於 2026-07-11 移除，見 `project_mssql_full_migration` 記憶），`TABLESAMPLE` 語法不存在於 SQLite。因此：(1) 純函式（`scaleEstimate`、`samplePercent` 公式、SQL 字串 shape）以一般 Unit Test 驗證，dialect-agnostic，兩種 dialect 分支皆可離線驗證（僅驗證產生的 SQL **文字**，不連線執行）；PG 分支之字串 shape 測試僅確認方言分流邏輯正確，**不代表**可對真實 PG 執行（PG test container 已移除）；(2) 小母體 fallback 分支（無 `TABLESAMPLE`）可於 SQLite 驗證；(3) 真實 `TABLESAMPLE ... REPEATABLE` 執行行為（決定性 / 過抽係數 / 效能）僅能於 **MSSQL 真實 DB**（`.mssql.spec.ts`）驗證，本機無 MSSQL 可達時應 `describe.skip` + 明確 SKIP_REASON，**不得**以 SQLite 假造方言 SQL 之執行結果。

### I. 抽樣估算共用元件 — `sampling-estimator.ts`（AD-E07-45 §4，F055/F056/F050 唯一測試位置）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-028 | `POOL_DATA_SAMPLE_SIZE` / `POOL_DATA_SAMPLE_SEED` 常數值正確 | AD-E07-45 §4.2, I-SAMPLE-FIXED-SIZE-01 | Unit | 匯入 `sampling-estimator.ts` | 讀取匯出常數 | `POOL_DATA_SAMPLE_SIZE === 50000`；`POOL_DATA_SAMPLE_SEED === 42`；兩者不可依 cardType / 條件 / 當下母體筆數動態改變（型別為 `const`，非函式參數） |
| TS-F055-029 | `getPoolDataTotalCount()` 回傳精確 `COUNT(*)` | AD-E07-45 §4.3 | Integration | ob_pool_data 植入已知 N 筆（如 120 筆） | 呼叫 `getPoolDataTotalCount(poolDataRepo)` | 回傳值精確等於 120（無方言差異，SQLite 可行） |
| TS-F055-030 | `buildPoolDataSampleFrom()` 小母體 fallback（`totalCount <= 50000`） | AD-E07-45 §3.3, I-SAMPLE-SMALLPOOL-FALLBACK-01 | Unit | `totalCount = 30000`（< 50000） | 呼叫 `buildPoolDataSampleFrom(30000, 'mssql')` 與 `buildPoolDataSampleFrom(30000, 'postgres')` | 兩 dialect 皆回傳 `ctePrefix === ''`；`fromClause` 為全表直連（`'ob_pool_data o'` / `'ob_pool_data AS o'`）；`effectiveSampleSize === 30000`（精確值，非近似） |
| TS-F055-031 | `buildPoolDataSampleFrom()` 大母體 MSSQL SQL 字串 shape（`TABLESAMPLE` 位置） | AD-E07-45 §3.2「易誤植細節」 | Unit（字串斷言，無需連線） | `totalCount = 1679489`，`dialect = 'mssql'` | 呼叫並檢視 `fromClause` / `ctePrefix` 文字 | 產生之 SQL 含 `FROM ob_pool_data TABLESAMPLE (... PERCENT) REPEATABLE (42) AS o`（`TABLESAMPLE` 緊接資料表名稱、**先於**別名 `AS o`） |
| TS-F055-032 | `buildPoolDataSampleFrom()` 大母體 PG SQL 字串 shape（別名在前） | AD-E07-45 §3.2 | Unit（字串斷言，無需連線；**PG 現況註記**：本專案 PG test container 已移除，本案例僅驗證方言分流字串產生邏輯，非可執行之真實 PG 驗證） | `totalCount = 1679489`，`dialect = 'postgres'` | 呼叫並檢視文字 | 產生之 SQL 含 `FROM ob_pool_data AS o TABLESAMPLE SYSTEM (...) REPEATABLE (42)`（別名先於 `TABLESAMPLE`，與 MSSQL 相反）；`LIMIT 50000` 存在 |
| TS-F055-033 | `samplePercent` 計算公式（含上限保護） | AD-E07-45 §4.4 | Unit | `totalCount = 1679489` | 手算 `50000 * 1.3 / 1679489 * 100 ≈ 3.8703...` → 四捨五入至兩位小數 | `samplePercent === 3.87`；另補一案例 `totalCount = 60000`（`samplePercentRaw > 100`）驗證 `Math.min(100, ...)` 上限保護生效，`samplePercent <= 100` |
| TS-F055-034 | I-SAMPLE-LITERAL-01 — `samplePercent` / `seed` / `targetSampleSize` 為數值字面量直接嵌入 SQL，非具名參數 | I-SAMPLE-LITERAL-01 | Unit（靜態掃描） | 取 `buildPoolDataSampleFrom(1679489, 'mssql')` 產生之 SQL 字串 | regex 掃描該字串是否含具名參數 placeholder（如 `:samplePercent` / `@samplePercent`） | 掃描結果為 0 命中；`3.87` / `42` / `50000` 等數值以字面量形式出現於 SQL 文字中 |
| TS-F055-035 | `scaleEstimate()` 已知數值旗艦案例 | AD-E07-45 §4.4, I-SAMPLE-SCALE-DENOM-01 | Unit | — | `scaleEstimate(2000, 50000, 1679489)` | 回傳 `Math.round(2000/50000*1679489) === 67180` |
| TS-F055-036 | `scaleEstimate()` `effectiveSampleSize <= 0` 防禦邊界回 0 | AD-E07-45 §4.4 | Unit（Boundary） | — | `scaleEstimate(0, 0, 1679489)` | 回傳 `0`（不拋除以零錯誤） |
| TS-F055-037 | `scaleEstimate()` 四捨五入行為（`.5` 邊界） | AD-E07-45 §3.5 | Unit（Boundary） | — | 挑選使 `sampleMatchCount/effectiveSampleSize*totalCount` 恰為 `X.5` 之具體數值（如 `scaleEstimate(1, 4, 2)` → `0.5`） | 回傳 `Math.round(0.5) === 1`（標準四捨五入，非無條件捨去 `0`） |
| TS-F055-038 | 🔴 REPEATABLE 決定性 — 相同種子相同輸入，兩次連續呼叫回傳完全相同之列集合 | AC-2 / TC-174-02, I-SAMPLE-FIXED-SIZE-01 | Integration（**MSSQL 真實 DB**，`.mssql.spec.ts`；本機無 MSSQL 可達時 `describe.skip` + SKIP_REASON，不得以 SQLite 假造） | ob_pool_data 大母體（> 50000 筆，MSSQL Test DB） | 對相同 `totalCount` 連續呼叫兩次 `buildPoolDataSampleFrom(totalCount, 'mssql')` 並實際執行查詢 | 兩次查詢回傳之 `(orgno, appl_no)` 集合完全相同（集合相等比對，非僅筆數相同） |
| TS-F055-039 | 大母體情境下 `effectiveSampleSize` 實際修剪後等於 50000（過抽係數 1.3 緩衝生效） | AD-E07-45 §3.2 | Integration（**MSSQL 真實 DB**） | ob_pool_data 大母體（> 50000 筆） | 執行 `buildPoolDataSampleFrom` 產生之查詢並統計實際回傳列數 | 實際列數 `=== 50000`（`sampleSize` 回應欄位誠實回報此值，非配置常數） |

### J. F055 `previewCardLevels` 抽樣估算改寫（AC-3 v1.7 / US-174）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-040 | preview 回應新增 `isEstimate` / `sampleSize` / `totalCount` 契約 | AC-3, spec §5.2 v1.7 | Integration（SQLite 小母體可行） | ob_pool_data ≤ 50000 筆（小母體）；SM Token | GET card-levels/preview | HTTP 200；response 含 `isEstimate === true`、`sampleSize`（number）、`totalCount`（number） |
| TS-F055-041 | 小母體 fallback：`isEstimate=true` 但 `sampleSize === totalCount`（精確值） | I-SAMPLE-SMALLPOOL-FALLBACK-01 | Integration | ob_pool_data 恰 100 筆（< 50000） | GET card-levels/preview | `sampleSize === 100`；`totalCount === 100`；`isEstimate === true`（即便是全量掃描仍固定 true，AD §3.5） |
| TS-F055-042 | `distribution` 為 `scaleEstimate` 放大推算值，小母體下等同精確全量 | AC-3, BR-8 | Integration | ob_pool_data 100 筆已知分數分佈（A:20/B:40/C:30/D:10） | GET card-levels/preview | `distribution.A+B+C+D === 100`；各等級數字與已知精確分佈完全相符（小母體 fallback 無抽樣誤差） |
| TS-F055-043 | 🔴 相同 CARD_TYPE + 相同草稿門檻，兩次呼叫 distribution 完全相同（AC-2 / TC-174-02） | AC-2 | Integration（**MSSQL 真實 DB**，`.mssql.spec.ts`） | ob_pool_data 大母體（> 50000 筆） | 短時間內對相同 `cardType` + `levels` 連續呼叫兩次 GET preview | 兩次 response 之 `distribution` 逐鍵完全相等 |
| TS-F055-044 | ⏱️ v1.2 修正：CARD_TYPE=E（重量級卡別）histogram 首次載入回應時間 ~12 秒為**可接受值**（AC-1 / TC-174-01；**不再是** sub-second 目標 — AD-E07-45 v1.2 team-lead 效能決策，2026-07-12） | AC-1 | Integration（**MSSQL 真實 DB**；效能量測性質，非硬性 CI gate） | ob_pool_data 比照生產規模（≈1,679,489 筆，或等比例縮小之 MSSQL Test DB 規模） | 呼叫 GET preview（`cardType=E`），量測回應時間（此呼叫為該 cardType 進入 Tab 4 後**唯一**一次 histogram 抓取，後續門檻編輯不再重新呼叫，見 Group N） | 回應時間 ≈12 秒屬可接受（相較 v1.6 全量計分 224.6 秒仍大幅改善）；**不再要求** < 1000ms — sub-second 目標改適用於（1）前端 client-side 重新分桶（TS-F055-057）與（2）F050 §6.3 `preview-hit-count` 端點（不涉及 Stage 2 計分，維持 sub-second） |
| TS-F055-045 | 迴歸守門：BR-2 快取移除（`cardLevelHistogramCache` / `CARD_LEVEL_HISTOGRAM_TTL_MS` 已不存在） | BR-2, AD-E07-45 §3.4 | Unit（static/regression guard，fs + regex，非僅概念性 Grep，依 `feedback_grep_negative_lookahead` 教訓） | 讀取 `assignment-scoring.service.ts` 原始碼 | regex 掃描 `cardLevelHistogramCache` / `CARD_LEVEL_HISTOGRAM_TTL_MS` 兩個識別字 | 掃描結果為 0 命中（快取機制已完全移除，非僅停用） |
| TS-F055-046 | `totalCount` 絕不快取（I-SAMPLE-NO-CACHE-01） | I-SAMPLE-NO-CACHE-01 | Integration（SQLite 小母體可行） | ob_pool_data 初始 100 筆 | 呼叫 GET preview（第一次）→ 資料庫再植入 1 筆 → 呼叫 GET preview（第二次） | 第一次 `totalCount === 100`；第二次 `totalCount === 101`（即時反映新增，無 60 秒快取延遲） |

### K. F055 前端三態（AC-4 / AC-8，US-174 AC-4 修正靜默吞噬缺陷）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-047 | 三態之一：載入中（loading）— ⚠️ v1.2 範圍澄清：對應**該 cardType 首次進入 Tab 4 之 histogram 抓取**（可能長達 ~12 秒，見 TS-F055-044），非門檻編輯觸發 | AC-8 | Frontend Unit | stub GET preview 為 pending Promise（尚未 resolve） | 首次選中 CARD_TYPE 進入 Tab 4 後渲染（**非**修改門檻後） | 面板顯示 loading 狀態（skeleton / spinner），非空白、非舊資料殘留 |
| TS-F055-048 | 三態之二：已顯示估算（estimate），含約略值標示 | AC-3, AC-8 | Frontend Unit | stub GET preview 回傳 200 + `isEstimate:true` + distribution + `histogram` | 渲染 preview 區 | 面板顯示各等級「約 N 人」或等效估算標示文字；不呈現為精確計數用語 |
| TS-F055-049 | 🔴 三態之三：錯誤重試（error-retry），**不得**直接變回空白 — ⚠️ v1.2 範圍澄清：對應 histogram 抓取失敗（每 cardType 一次），非門檻編輯失敗（編輯已無對應 API 呼叫） | AC-4, AC-8（MUST-FIX，取代原 `catch { setPreview(null) }`） | Frontend Unit | stub GET preview 回傳 500 或逾時 | 首次選中 CARD_TYPE 進入 Tab 4 後等待 reject | 面板顯示「預估分佈暫時無法取得，請稍後再試」等明確錯誤文字 + 可重試操作（按鈕）；**不得**渲染為空白 DOM 區塊 |
| TS-F055-050 | 🔴 迴歸守門：靜態掃描確認 `catch { setPreview(null) }` 吞噬 pattern 已移除 | AC-4, AC-8（regression guard） | Unit（static，fs + regex） | 讀取 `apps/web/src/pages/assignment/scoring-config-page.tsx` 原始碼（原缺陷位置約 L1499） | regex 掃描 `setPreview(null)` 出現於 `catch` 區塊內之 pattern | 掃描結果為 0 命中（該吞噬寫法已被三態錯誤處理取代） |
| TS-F055-051 | 點擊「重試」→ 重新呼叫 API → 成功後切回 estimate 態 | AC-4, AC-8 | Frontend Unit | 面板處於 error-retry 態；stub 第二次呼叫回傳 200 | 點擊重試按鈕 | preview API 被重新呼叫（spy 確認）；面板切換為 estimate 態並顯示新資料 |
| TS-F055-052 | 三態視覺可清楚區分（各自獨立可辨識狀態） | AC-8「三態視覺可清楚區分」 | Frontend Unit | 分別以三種 stub 狀態渲染 | 檢視各狀態下的 DOM（`data-state` 屬性或對應 testid） | loading / estimate / error 三態之 DOM 標記互斥且可各自被獨立查詢到（非僅文字內容不同、底層仍是同一區塊） |

### L. 讀鎖豁免（AD-E07-45 §6 裁決，覆蓋 F055 spec 文件過時之 409 描述）

> **重要說明**：F055 spec v1.7 §5.2 錯誤回應表**目前仍列出** `409 SCORING_VERSION_LOCKED`（月名單分派執行中），但 AD-E07-45 §6 已查證 `previewCardLevels`（`assignment-scoring.service.ts:951-1146`）**現行程式碼從未呼叫 `assertNotLocked()`**——該 409 列為文件與程式碼不一致之過時描述（可能為 v1.6 之前遺留、從未真正落地），並非現行實際行為。AD-E07-45 §6 裁定三個估算端點（F055 §5.2 / F056 §5.5 / F050 §6.3）**一律讀鎖豁免**，此裁定待 F055 spec 下一輪修訂（v1.8）正式移除該 409 列。本組測試依 **AD-E07-45 §6 之裁決**設計（非依 F055 spec v1.7 文件字面），做為迴歸守門，確保 tdd-implementation 在同步文件時**不會**反向誤植鎖檢查邏輯。本組只涉及 **GET §5.2 preview 端點**，與既有 TS-F055-007 / TS-F055-008（**PUT** §5.1 端點於 running / pending 時回 409）完全獨立、互不影響，兩者並存不衝突。

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-053 | 🔴 `assignment_run.status='running'` 時 GET preview 仍回 200（不回 409） | AD-E07-45 §6, I-SAMPLE-LOCK-EXEMPT-01（MUST-FIX，覆蓋 F055 spec 文件過時描述） | Integration（SQLite 小母體可行） | assignment_run(status='running')；SM Token | GET card-levels/preview | HTTP 200（**不**回 409 SCORING_VERSION_LOCKED）；distribution 正常回傳 |
| TS-F055-054 | `assignment_run.status='pending'` 時同上 | AD-E07-45 §6, I-SAMPLE-LOCK-EXEMPT-01 | Integration | assignment_run(status='pending')；SM Token | GET card-levels/preview | HTTP 200（不回 409） |

---

## v1.2 追加修正 Test Scenarios（AD-E07-45 v1.2 — team-lead 效能決策，2026-07-12）

> **背景（team-lead 效能決策，透過 coordinator 轉達，非本 test-designer 自行推導）**：實測發現 histogram（score → 樣本列數）之計算，對重量級卡別（如 CARD_TYPE=E，維度多、`buildStage2ScoreExpr` 表達式複雜）即使已套用 AD-E07-45 v1.1 之抽樣（50,000 筆樣本），仍需約 **12 秒**，未達 v1.1 原訂之 sub-second 目標。既有觀察（AD-E07-45 §2「histogram 只取決於 `(cardType, cardVersion)`，門檻分桶純粹是記憶體重新分桶」）進一步驅動架構調整：**histogram 與門檻/TIER 分桶無關（threshold-/tier-independent）**，故 `GET .../card-levels/preview` 除既有 `distribution`/`isEstimate`/`sampleSize`/`totalCount` 外，**新增回傳 `histogram: [{score, count}]`**；前端**每 CARD_TYPE 僅呼叫一次**該端點取得 histogram 並快取，之後門檻編輯（CARD_LEVEL 分桶）與切換至 TIER 分布面板（F056）之彙總，皆於 **client-side JS** 依已快取之 histogram 即時重新計算，不再對每次編輯或每次分頁切換重新呼叫後端。
>
> **效能目標修正**：~12 秒之 histogram 首次抓取（每 cardType 一次）視為**可接受值**，**不再是** sub-second 目標（見 TS-F055-044 已就地修正）；sub-second 目標改適用於（1）前端 client-side 重新分桶（本節 Group N）、（2）F050 §6.3 `preview-hit-count` 端點（不涉及 Stage 2 計分，維持原 D1 sub-second 契約，不受本次調整影響）。
>
> **文件狀態誠實聲明**：截至本次修訂，`docs/specs/implementation-log/AD-E07-45-sampling-estimator.md` 檔案本身仍為 **v1.1**（未見 v1.2 修訂內容）。本節依 coordinator 轉達之 team-lead 決策設計，**不代表**已查證 AD 文件本身已更新至 v1.2；依本任務分工邊界（test-designer 不編輯 AD / 不編輯程式碼），AD 文件與 F055 spec（§5.2 response schema 需補 `histogram` 欄位）之正式同步為 system-architect / spec-writer 之後續事項。若後續查證 AD v1.2 內容與本節假設有出入，應以正式 AD 文件為準並回頭修訂本節。

### M. F055 §5.2 backend 契約新增 `histogram` 欄位（v1.2）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-055 | `histogram` 欄位格式良好且與 `distribution` 一致（shape + 單調 + 一致性） | AD-E07-45 v1.2（team-lead 效能決策） | Integration（SQLite 小母體可行，亦可於 MSSQL 大母體重跑作為迴歸） | ob_pool_data 已知分數分佈（如 100 筆，score 分散於多個相異值，涵蓋 A/B/C/D 各等級區間） | GET card-levels/preview | response 新增 `histogram` 為陣列，每筆含 `score`（number）與 `count`（number，`>= 0`）；`score` 值**彼此相異**且**依遞增排序**（單調性）；**一致性**：加總落於各等級 `[scoreS, scoreE]` 區間內之 `histogram[].count`（依相同 `scaleEstimate` 換算）恰等於該等級於 `distribution` 之值（逐等級核對，總和亦相符） |

### N. F055 前端 — Client-side 即時重新分桶（v1.2，取代逐次後端呼叫）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F055-056 | histogram 每 CARD_TYPE 僅載入一次 | AD-E07-45 v1.2 | Frontend Unit（spy fetch 呼叫次數） | stub GET preview 回傳 200 + histogram | 選中 CARD_TYPE='H' 進入 Tab 4 → 連續修改門檻欄位 5 次 | `GET .../card-levels/preview` 僅被呼叫 **1 次**（首次載入），5 次門檻編輯**皆未**觸發新呼叫 |
| TS-F055-057 | 門檻編輯後即時重新分桶（client-side），無新 API 呼叫 | AD-E07-45 v1.2（取代 TS-F055-018 舊行為） | Frontend Unit（fake timer 排除，驗證無 debounce 等待） | histogram 已快取（TS-F055-056 前置狀態） | 修改 A 級 `scoreS` 欄位 | 面板顯示之 distribution 數字**立即**（同一 tick 內，非等待 debounce/API 往返）更新為新門檻對應之分桶結果；`fetch` 呼叫次數維持不變（仍為 1） |
| TS-F055-058 | 前端重新分桶邏輯正確性（已知數值案例，client 端計算與後端 first-match-wins 邏輯一致） | AD-E07-45 v1.2 | Frontend Unit（純函式 / oracle 比對） | 已知 `histogram`（如 `[{score:100,count:10},{score:200,count:20},{score:300,count:5}]`）+ 已知草稿門檻（A:[250,999], B:[150,249], C:[0,149]） | 呼叫前端 client-side 分桶函式 | 分桶結果與手算 first-match-wins 結果一致（A=5, B=20, C=10，經 `scaleEstimate` 放大推算後之對應值）；與後端 `previewCardLevels` 既有分桶迴圈邏輯（AD-E07-45 §5.1 point 5）採**相同演算法**（first-match-wins），非另一套獨立實作 |
| TS-F055-059 | 切換 CARD_TYPE 觸發新的 histogram 抓取（cache 依 cardType 區分） | AD-E07-45 v1.2 | Frontend Unit（spy fetch 呼叫次數與參數） | 已載入 CARD_TYPE='H' 之 histogram（快取中） | Tab 1 切換選中 CARD_TYPE 為 'S5' | `GET .../card-levels/preview?cardType=S5` 被呼叫（新的一次請求，`cardType` 參數為 'S5'）；切回 'H' 若快取未過期則**不**重新呼叫（沿用同一 request 生命週期內之快取，實作細節由 tdd-implementation 決定快取範圍，本案例僅斷言「不同 cardType 必觸發新請求」此一契約） |
