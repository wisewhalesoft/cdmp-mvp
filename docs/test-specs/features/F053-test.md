---
type: test-design-feature
feature_id: F053
feature_name: 查看計分維度設定
priority: P0-MVP
related_spec: /docs/specs/features/F053-view-scoring-dimensions.md
last_updated: 2026-05-13
---

# F053: 查看計分維度設定 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F053-view-scoring-dimensions.md` + `error-handling.md#assignment-scoring-errors` + `data-model.md#e07-data-model` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + Test Container PostgreSQL）、Frontend Unit（React Testing Library） |
| 資料驗證策略 | 植入已知 seed 資料（CARD_TYPE='H'，active 版本），逐一比對 API response 欄位名稱（camelCase）與值；`createdBy` / `createdAt` 額外植入 null 值版本驗證 |
| Active 版本判定 | `ob_levelcard_version.status = 'active'`；測試需植入 `status='active'` 種子，不依賴 sdate/edate 計算（避免時鐘依賴） |
| 無 active 版本路徑 | 僅植入 `status='inactive'` 版本，或清空版本表，驗證 404 回傳 |
| 排序驗證 | 植入 3 個維度（`CELLULAR` / `ACCOUNT_AGE` / `CAREA_NO1`），API 回傳必須為升冪排序 |
| NULL 欄位處理 | dump 觀察 6/4 筆 `createdBy` / `createdAt` 為 null；API 需回傳 null（非省略），前端顯示「—」 |

---

## Acceptance Test Design

### AC-1：顯示當前計分版本的維度清單

| 項目 | 內容 |
|------|------|
| Given | `ob_levelcard_version` 有 CARD_TYPE='H'、status='active' 的版本；`ob_levelcard_column` 有 3 個維度（ACCOUNT_AGE / CELLULAR / CAREA_NO1）；業務主管 Token |
| When | 呼叫 `GET /api/v1/assignment/scoring?cardType=H` |
| Then | HTTP 200；`dimensions` 陣列長度為 3；第一筆 columnName='ACCOUNT_AGE'（升冪排序第一） |
| 驗證步驟 | 1. 確認 HTTP 200<br>2. 比對 `dimensions[0].columnName = 'ACCOUNT_AGE'`<br>3. 確認 `dimensions[1].columnName = 'CAREA_NO1'`<br>4. 確認 `dimensions[2].columnName = 'CELLULAR'` |

### AC-2：顯示版本資訊（含 null 欄位處理）

| 項目 | 內容 |
|------|------|
| Given | `ob_levelcard_version` 中 CARD_TYPE='H' 版本，`created_by = '21251'`、`created_at = '2019-08-23T00:00:00Z'`（有值場景）；另一版本 CARD_TYPE='S'，`created_by = null`、`created_at = null`（null 場景） |
| When | 分別呼叫兩個 cardType 的 GET 端點 |
| Then | H 場景：`version.createdBy = '21251'`、`version.createdAt = '2019-08-23T00:00:00Z'`；S 場景：`version.createdBy = null`、`version.createdAt = null` |
| 驗證步驟 | 1. H 場景確認 `version.cardType = 'H'`、`cardName` 非 null<br>2. H 場景確認 `sdate = '20190823'`、`edate = '20991231'`<br>3. S 場景確認 `version.createdBy === null`（型別為 null，非省略鍵）<br>4. S 場景確認 `version.createdAt === null` |

### AC-3：查看維度詳細分數表

| 項目 | 內容 |
|------|------|
| Given | CARD_TYPE='H' 的 active 版本，維度 ACCOUNT_AGE 有 2 筆 `ob_levelcard_score`（數值型：level2S='0'/level2E='3'，score=10；level2S='4'/level2E='12'，score=20） |
| When | 呼叫 `GET /api/v1/assignment/scoring?cardType=H` |
| Then | `dimensions[0].scores` 長度為 2；`scores[0].level1 = null`、`level2S = '0'`、`level2E = '3'`、`score = 10` |
| 驗證步驟 | 1. 確認 `scores[0].level1 === null`<br>2. 確認 `scores[0].level2S = '0'`、`level2E = '3'`、`score = 10`<br>3. 確認 `scores[1].score = 20`<br>4. 確認 `scoreSummary = '2 個區間'`（或等效摘要格式） |

### AC-4：無生效版本的提示

| 項目 | 內容 |
|------|------|
| Given | `ob_levelcard_version` 中無 `status = 'active'` 的版本（只有 inactive 版本或空表） |
| When | 呼叫 `GET /api/v1/assignment/scoring` |
| Then | HTTP 404，錯誤碼 `SCORING_VERSION_NOT_FOUND`，訊息含「目前無生效的計分版本」 |

---

## Test Scenarios

### A. API Integration Tests — 查詢與排序

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F053-001 | 正常查詢 active 版本維度清單 | AC-1 | Integration | ob_levelcard_version(H, active) + ob_levelcard_column 3 筆（ACCOUNT_AGE / CELLULAR / CAREA_NO1）；Sales Manager Token | 呼叫 `GET /api/v1/assignment/scoring?cardType=H` | HTTP 200；dimensions 陣列長度=3；依 column_name 升冪排列（ACCOUNT_AGE → CAREA_NO1 → CELLULAR） |
| TS-F053-002 | 無 active 版本回傳 404 | AC-4 | Integration | 僅有 status='inactive' 版本（或空表）；Sales Manager Token | 呼叫 `GET /api/v1/assignment/scoring?cardType=H` | HTTP 404，SCORING_VERSION_NOT_FOUND |
| TS-F053-003 | 版本資訊欄位有值時正確回傳 | AC-2 | Integration | ob_levelcard_version(H, active，created_by='21251'，created_at='2019-08-23T00:00:00Z')；Sales Manager Token | 呼叫 `GET /api/v1/assignment/scoring?cardType=H` | version.cardType='H'，cardVersion=1，sdate='20190823'，edate='20991231'，createdBy='21251'，createdAt='2019-08-23T00:00:00Z' |
| TS-F053-004 | createdBy / createdAt 為 null 時回傳 null（非省略鍵） | AC-2 | Integration | ob_levelcard_version(S, active，created_by=null，created_at=null)；Sales Manager Token | 呼叫 `GET /api/v1/assignment/scoring?cardType=S` | version.createdBy === null（鍵存在，值為 null）；version.createdAt === null |
| TS-F053-005 | 維度分數表（數值型區間）正確回傳 | AC-3 | Integration | ACCOUNT_AGE 有 2 筆 score（level2S/level2E 型；level1=null）；Sales Manager Token | 呼叫 `GET /api/v1/assignment/scoring?cardType=H` | scores[0].level1=null，level2S='0'，level2E='3'，score=10；scores[1].level2S='4'，level2E='12'，score=20 |
| TS-F053-006 | 維度分數表（類別型 level1）正確回傳 | AC-3 | Integration | 植入一個使用 level1（類別型）的維度；Sales Manager Token | 呼叫 GET 端點 | 對應維度的 scores 中 level1 有值、level2S=null、level2E=null |
| TS-F053-007 | 未登入回傳 401 | 第 5.1 節 | Integration | 無 Token | 呼叫 `GET /api/v1/assignment/scoring` | HTTP 401，AUTH_TOKEN_MISSING |
| TS-F053-008 | 非 Sales Manager（is_sales_manager=false）回傳 403 | 第 5.1 節 | Integration | is_sales_manager=false 的 User Token | 呼叫 `GET /api/v1/assignment/scoring` | HTTP 403，AUTH_FORBIDDEN |

### B. Frontend Unit Tests — 版本卡片與維度顯示

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F053-009 | 版本卡片顯示版本資訊（有值） | AC-2 | Frontend Unit | stub API 回傳 version.createdBy='21251'、createdAt='2019-08-23T00:00:00Z' | 渲染計分設定頁 | 頁面顯示 'H'（cardType）、'1'（cardVersion）、'20190823 ~ 20991231'、建立者 '21251' |
| TS-F053-010 | createdBy / createdAt 為 null 時顯示「—」 | AC-2 | Frontend Unit | stub API 回傳 version.createdBy=null、createdAt=null | 渲染計分設定頁版本卡片 | 建立者欄位顯示「—」；建立時間欄位顯示「—」；不顯示 'null' 或空白 |
| TS-F053-011 | 維度清單正確渲染（維度數量 Badge） | AC-1 | Frontend Unit | stub API 回傳 dimensions 陣列長度 8 | 渲染計分維度 Tab | Tab 上的計數 Badge 顯示 '8' |
| TS-F053-012 | 無 active 版本顯示警示訊息 | AC-4 | Frontend Unit | stub API 回傳 HTTP 404 SCORING_VERSION_NOT_FOUND | 渲染計分設定頁 | 頁面顯示警示文字「目前無生效的計分版本，請聯繫 IT 確認設定」；不顯示空的維度清單 |
| TS-F053-013 | 維度展開顯示分數詳細表 | AC-3 | Frontend Unit | stub API 回傳含 scores 陣列的維度資料 | 點擊維度列展開 | 展開後顯示 level2S、level2E、score 欄位；收合後隱藏 |

---

## 邊界與例外情境

| ID | 情境 | 預期行為 | 測試類型 |
|----|------|---------|---------|
| BE-F053-001 | ob_levelcard_column 有 status='inactive' 的停用維度 | GET /scoring 回傳的 dimensions 中不含 status='inactive' 的維度（F054 停用維度後 F053 不顯示） | Integration |
| BE-F053-002 | ob_levelcard_score 無任何分數區間（dimensions 存在但 scores 為空陣列） | dimensions 中該維度的 scores=[]；scoreSummary='0 個區間' 或等效表達 | Integration |
| BE-F053-003 | cardType 參數未傳（查詢所有 active card_type） | HTTP 200；回傳所有 active card_type 的版本資料（可能是陣列或 map） | Integration |

---

## 測試資料

### Seed 資料（Test Container PostgreSQL）

```sql
-- ob_levelcard_version（active 版本，含 null 稽核欄位場景）
INSERT INTO ob_levelcard_version (card_type, card_name, card_version, sdate, edate, status, created_by, created_at)
VALUES
  ('H', '期中', 1, '20190823', '20991231', 'active', '21251', '2019-08-23T00:00:00Z'),
  ('S', '中結', 1, '20190823', '20991231', 'active', NULL, NULL);

-- ob_levelcard_column（3 個維度，順序故意打亂以驗證排序）
INSERT INTO ob_levelcard_column (card_type, card_version, column_name, column_label, status)
VALUES
  ('H', 1, 'CELLULAR',    '有無手機', 'active'),
  ('H', 1, 'ACCOUNT_AGE', '帳齡',     'active'),
  ('H', 1, 'CAREA_NO1',   '戶籍縣市', 'active');

-- ob_levelcard_score（數值型與類別型各一維度）
INSERT INTO ob_levelcard_score (card_type, card_version, column_name, level1, level2_s, level2_e, score)
VALUES
  ('H', 1, 'ACCOUNT_AGE', NULL, '0',  '3',  10),
  ('H', 1, 'ACCOUNT_AGE', NULL, '4',  '12', 20),
  ('H', 1, 'CELLULAR',    'Y',  NULL, NULL, 15),  -- 類別型
  ('H', 1, 'CELLULAR',    'N',  NULL, NULL, 0);
```

### Token 種類

| Token 名稱 | 角色 | is_sales_manager | 用途 |
|-----------|------|-----------------|------|
| SALES_MANAGER_TOKEN | user | true | 正常路徑（業務主管） |
| USER_NO_SM_TOKEN | user | false | 403 驗證 |
| NO_TOKEN | — | — | 401 驗證 |

---

## 自動化就緒度

| 場景 | 自動化適合度 | 說明 |
|------|------------|------|
| TS-F053-001 ~ 008（Integration） | 高 | Supertest + Test Container PostgreSQL；不依賴時鐘，seed 直接寫 status='active' |
| TS-F053-009 ~ 013（Frontend Unit） | 高 | React Testing Library + MSW stub；BE-F053-001 依賴 F054 停用維度操作，可在整合 suite 中串聯驗證 |
| BE-F053-003 無 cardType 查詢 | 中 | 回傳格式（陣列 vs map）需實作確認後調整期望值 |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F054（停用維度影響 BE-F053-001）、Migration 1711360000143（ob_levelcard_column.status 欄位） |
| 環境依賴 | Test Container PostgreSQL（AppDB）；無需外部資料庫 |
| 風險 | `scoreSummary` 欄位格式（如「4 個區間」）為 API 計算而來，需確認計算邏輯後調整測試期望字串；建議在 spec 補充 scoreSummary 格式規範 |
| 跨 Feature 驗證點 | BE-F053-001（F054 停用維度後 F053 不顯示）應在 F054 整合 suite 末尾串聯呼叫 F053 的 GET 端點確認 |
