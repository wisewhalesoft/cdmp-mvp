---
type: test-design-feature
feature_id: F056
feature_name: 編輯 TIER_LEVEL 對應表
priority: P0-MVP
related_spec: /docs/specs/features/F056-edit-tier-mapping.md
last_updated: 2026-05-13
---

# F056: 編輯 TIER_LEVEL 對應表 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F056-edit-tier-mapping.md` + `error-handling.md#assignment-scoring-errors` + `data-model.md#ob-tier-entity` + `data-model.md#e07-data-model` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + Test Container PostgreSQL）、Frontend Unit（React Testing Library）、跨層整合（fn_calc_tier_level fallback 驗證） |
| 端點分離驗證 | PUT（批次 UPSERT）與 POST（單筆 INSERT）語意不同，各自獨立測試；TIER_LEVEL_DUPLICATE 在兩個端點的觸發條件不同 |
| Fallback 路徑（card_level IS NULL） | M5 為標準 fallback 樣本；M3 / HC / C3 為過渡期 fallback（OQ-E07-28 決策）；均需植入 ob_tier seed 並驗證 GET 回傳 cardLevel=null |
| HM 不再為 fallback | OQ-E07-27 決策：HM 需補建獨立計分卡（走標準路徑），不設計 HM fallback 測試案例 |
| BR-9 長度驗證 | ob_tier.card_level VARCHAR(5) vs ob_levelcard_level.card_level VARCHAR(1)；輸入超過 1 字元的 card_level（如 'AB'）→ 422 CARD_LEVEL_NOT_FOUND |
| BR-10 fn_calc_tier_level NULL fallback | 跨層整合測試：驗證呼叫 fn_calc_tier_level 後，M5 fallback 對應確實被觸發（card_level IS NULL 路徑生效） |
| Audit Log 驗證 | PUT / POST 成功後查 assignment_audit_log，entity_type='ob_tier'，entity_id='{card_type}|{card_level}' |

---

## Acceptance Test Design

### AC-1：顯示目前 TIER_LEVEL 對應表

| 項目 | 內容 |
|------|------|
| Given | ob_tier 有 H/A → T1、M5/null → T5M（fallback）、M3/null → T5M（過渡期）共 3 筆；SM Token |
| When | 呼叫 `GET /api/v1/assignment/scoring/tier-mapping` |
| Then | HTTP 200；mappings 陣列包含 3 筆；M5 那筆 cardLevel=null；依 (card_type, card_level) 升冪排序 |

### AC-2：修改對應關係（PUT 批次 UPSERT）

| 項目 | 內容 |
|------|------|
| Given | ob_tier 有 H/A → T1；無月跑鎖；SM Token |
| When | PUT /tier-mapping，body 含 `{ cardType:'H', cardLevel:'A', tierLevel:'T2' }` |
| Then | HTTP 200；updatedCount=1，insertedCount=0；DB 中 H/A 的 tier_level='T2'；audit_log action='UPDATE'，entity_id='H|A' |

### AC-3：新增 TIER_LEVEL 對應（POST 單筆 INSERT）

| 項目 | 內容 |
|------|------|
| Given | ob_tier 無 H/E 對應；ob_levelcard_level 有 H 型 active 版本的 E 等級（若有）或僅測試現有等級；無月跑鎖；SM Token |
| When | POST /tier-mapping，body 含 `{ cardType:'H', cardLevel:'A', tierLevel:'T1', listNm:'期中名單' }` |
| Then | HTTP 201；DB 新增 H/A → T1；audit_log action='CREATE'，entity_type='ob_tier' |

### AC-3-dup：新增時 PK 已存在回 422

| 項目 | 內容 |
|------|------|
| Given | ob_tier 已有 H/A → T1；無月跑鎖；SM Token |
| When | POST /tier-mapping，body 含 `{ cardType:'H', cardLevel:'A', tierLevel:'T99' }` |
| Then | HTTP 422，TIER_LEVEL_DUPLICATE；DB 中 H/A 的 tier_level 仍為 T1（不修改） |

### AC-4：CARD_LEVEL 必須存在（標準路徑）

| 項目 | 內容 |
|------|------|
| Given | ob_levelcard_level 無 H 型的 'Z' 等級；無月跑鎖；SM Token |
| When | POST /tier-mapping，body 含 `{ cardType:'H', cardLevel:'Z', tierLevel:'T9' }` |
| Then | HTTP 422，CARD_LEVEL_NOT_FOUND |

### AC-4a：允許 card_level=null 的 fallback 對應

| 項目 | 內容 |
|------|------|
| Given | M5 無對應 ob_levelcard_level（fallback CARD_TYPE）；無月跑鎖；SM Token |
| When | POST /tier-mapping，body 含 `{ cardType:'M5', cardLevel:null, tierLevel:'T5M', listNm:'機車中結滿期名單' }` |
| Then | HTTP 201；DB 新增 M5/null → T5M；不觸發 CARD_LEVEL_NOT_FOUND |

### AC-5：月跑執行中禁止修改

| 項目 | 內容 |
|------|------|
| Given | assignment_run status='running'；SM Token |
| When | PUT /tier-mapping |
| Then | HTTP 409，SCORING_VERSION_LOCKED |

---

## Test Scenarios

### A. API Integration Tests — GET 列表

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-001 | GET 回傳包含標準對應與 fallback 對應 | AC-1 | Integration | ob_tier: H/A→T1（標準）、M5/null→T5M（fallback）、M3/null→T5M（過渡期 fallback）；SM Token | GET /api/v1/assignment/scoring/tier-mapping | HTTP 200；mappings[M5 那筆].cardLevel=null；M3 那筆 cardLevel=null；依 card_type 升冪排序 |
| TS-F056-002 | GET list_nm 有值與 null 均正確回傳 | AC-1 | Integration | ob_tier: H/A(listNm='期中名單')、H/B(listNm=null)；SM Token | GET /api/v1/assignment/scoring/tier-mapping | H/A 的 listNm='期中名單'；H/B 的 listNm=null（鍵存在，值為 null） |
| TS-F056-003 | 未登入回 401 | 第 5.1 節 | Integration | 無 Token | GET /api/v1/assignment/scoring/tier-mapping | HTTP 401，AUTH_TOKEN_MISSING |

### B. API Integration Tests — PUT 批次 UPSERT

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-004 | PUT 更新既有對應（UPDATE） | AC-2 | Integration | ob_tier(H/A→T1)；ob_levelcard_level(H/A 存在)；無月跑鎖；SM Token | PUT mappings=[{cardType:'H',cardLevel:'A',tierLevel:'T2'}] | HTTP 200；updatedCount=1，insertedCount=0；DB 中 H/A tier_level='T2' |
| TS-F056-005 | PUT 新增不存在對應（INSERT） | AC-2 | Integration | ob_tier 無 H/B 對應；ob_levelcard_level(H/B 存在)；無月跑鎖；SM Token | PUT mappings=[{cardType:'H',cardLevel:'B',tierLevel:'T2'}] | HTTP 200；updatedCount=0，insertedCount=1；DB 新增 H/B→T2 |
| TS-F056-006 | PUT 未列出的既有對應不刪除 | AC-2, spec 5.2 | Integration | ob_tier(H/A→T1, H/B→T2)；SM Token | PUT mappings=[{cardType:'H',cardLevel:'A',tierLevel:'T1'}]（只列 H/A） | HTTP 200；DB 中 H/B→T2 仍存在（未刪除） |
| TS-F056-007 | PUT body 內同一 PK 重複回 422 | AC-3, BR-1 | Integration | 無月跑鎖；SM Token | PUT mappings=[{cardType:'H',cardLevel:'A',tierLevel:'T1'},{cardType:'H',cardLevel:'A',tierLevel:'T2'}]（H/A 重複） | HTTP 422，TIER_LEVEL_DUPLICATE；DB 不執行任何寫入 |
| TS-F056-008 | PUT 成功後 audit_log 記錄 UPDATE，entity_id 含分隔符 | AC-2 | Integration | PUT TS-F056-004 成功後 | 查詢 assignment_audit_log 最新一筆 | action='UPDATE'；entity_type='ob_tier'；entity_id='H|A'；before_value 含舊 tier_level='T1'；after_value 含新 tier_level='T2' |
| TS-F056-009 | PUT card_level=null 的 fallback 對應 UPSERT | AC-4a | Integration | ob_levelcard_level 無 M5 等級（fallback CARD_TYPE）；無月跑鎖；SM Token | PUT mappings=[{cardType:'M5',cardLevel:null,tierLevel:'T5M'}] | HTTP 200；DB 中 M5/null → T5M 存在（或更新）；不觸發 CARD_LEVEL_NOT_FOUND |
| TS-F056-010 | PUT 月跑 pending 時回 409 | AC-5 | Integration | assignment_run(status='pending')；SM Token | PUT /tier-mapping | HTTP 409，SCORING_VERSION_LOCKED |
| TS-F056-011 | PUT 月跑 running 時回 409 | AC-5 | Integration | assignment_run(status='running')；SM Token | PUT /tier-mapping | HTTP 409，SCORING_VERSION_LOCKED |

### C. API Integration Tests — POST 單筆 INSERT

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-012 | POST 正常新增標準對應 | AC-3 | Integration | ob_tier 無 H/A 對應；ob_levelcard_level(H active, H/A 存在)；無月跑鎖；SM Token | POST { cardType:'H', cardLevel:'A', tierLevel:'T1', listNm:'期中名單' } | HTTP 201；response 含 cardType/cardLevel/tierLevel/listNm；DB 新增 H/A→T1 |
| TS-F056-013 | POST DB 已存在 PK 回 422（不執行 UPDATE） | AC-3-dup | Integration | ob_tier 已有 H/A→T1；SM Token | POST { cardType:'H', cardLevel:'A', tierLevel:'T99' } | HTTP 422，TIER_LEVEL_DUPLICATE；DB H/A tier_level 仍為 T1 |
| TS-F056-014 | POST CARD_LEVEL 不存在於 active 版本（標準路徑） | AC-4 | Integration | ob_levelcard_level 無 H 型的 'Z' 等級；SM Token | POST { cardType:'H', cardLevel:'Z', tierLevel:'T9' } | HTTP 422，CARD_LEVEL_NOT_FOUND |
| TS-F056-015 | POST card_level 超過 1 字元回 422（BR-9 長度檢查） | BR-9 | Integration | SM Token | POST { cardType:'H', cardLevel:'AB', tierLevel:'T1' }（cardLevel 長度為 2） | HTTP 422，CARD_LEVEL_NOT_FOUND（ob_levelcard_level.card_level 最多 VARCHAR(1)，'AB' 不存在） |
| TS-F056-016 | POST fallback 對應（card_level=null，M5） | AC-4a | Integration | M5 無 ob_levelcard_level 紀錄；無月跑鎖；SM Token | POST { cardType:'M5', cardLevel:null, tierLevel:'T5M', listNm:'機車中結滿期名單' } | HTTP 201；DB 新增 M5/null→T5M；不觸發 CARD_LEVEL_NOT_FOUND |
| TS-F056-017 | POST fallback 對應（card_level=null，M3 過渡期） | AC-4a, BR-6 | Integration | M3 無 ob_levelcard_level 紀錄（OBMLISTDF 仍有 31 筆名單）；SM Token | POST { cardType:'M3', cardLevel:null, tierLevel:'T5M' } | HTTP 201；DB 新增 M3/null→T5M；符合 OQ-E07-28 決策 |
| TS-F056-018 | POST 月跑執行中回 409 | AC-5 | Integration | assignment_run(status='running')；SM Token | POST /tier-mapping | HTTP 409，SCORING_VERSION_LOCKED |

### D. 跨層整合測試 — fn_calc_tier_level NULL fallback 驗證（BR-10）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-019 | fn_calc_tier_level 對 M5 pool_data 觸發 fallback（card_level IS NULL） | BR-10 | Integration（跨層） | ob_tier(M5/null→T5M)；ob_pool_data 一筆 card_type='M5'（無對應 CARD_LEVEL 的計分卡）；ob_levelcard_version(M5 active 版本存在，或用已有版本替代）；呼叫 fn_calc_tier_level | 以 SELECT 呼叫 `fn_calc_tier_level('M5', 1, pool_data_row)` 或在 Stage 2 的整合測試中驗證 | 回傳 tier_level='T5M'（fallback 路徑生效）；不回傳 null 或空字串 |
| TS-F056-020 | fn_calc_tier_level 標準路徑（card_level NOT NULL）優先於 fallback | BR-10 | Integration（跨層） | ob_tier(H/A→T1, H/null→T_FALLBACK)；H 型 pool_data 計算後 card_level='A' | 呼叫 fn_calc_tier_level 針對 H 型資料 | 回傳 tier_level='T1'（精確匹配，不走 fallback） |

### E. Frontend Unit Tests — TIER_LEVEL 對應表 UI

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-021 | Fallback 列顯示紫色底色與「Fallback」標籤 | AC-4a, prototype 28 | Frontend Unit | stub API 回傳含 cardLevel=null 的 M5 對應 | 渲染 TIER_LEVEL 對應 Tab | M5 那列有紫色底色（prototype 28 使用 bg-purple-50）；顯示「Fallback」標籤（標籤或徽章形式） |
| TS-F056-022 | 標準對應列不顯示 Fallback 標籤 | AC-4a | Frontend Unit | stub API 回傳 H/A 對應（cardLevel='A'，非 null） | 渲染 TIER_LEVEL 對應 Tab | H/A 那列無紫色底色；無「Fallback」標籤 |
| TS-F056-023 | CARD_LEVEL 下拉選項依 CARD_TYPE 動態載入 | spec 7 節 | Frontend Unit | stub ob_levelcard_level API：CARD_TYPE='H' 有 A/B/C/D；CARD_TYPE='S5' 有 A/B | 新增 Modal 中切換 CARD_TYPE 選擇 | 選 H 時 CARD_LEVEL 下拉有 A/B/C/D；切換至 S5 時下拉只有 A/B |
| TS-F056-024 | list_nm 為 null 時 UI 顯示「—」 | AC-1 | Frontend Unit | stub API 回傳含 listNm=null 的對應 | 渲染對應表格 | listNm 欄位顯示「—」；不顯示 'null' 或空白 |
| TS-F056-025 | 月跑執行中按鈕 disabled | AC-5 | Frontend Unit | isLocked=true | 渲染 TIER_LEVEL 對應 Tab | 「新增對應」按鈕 disabled=true；編輯按鈕 disabled=true |
| TS-F056-026 | 新增成功後列表即時更新 | AC-3 | Frontend Unit | stub POST 回傳 HTTP 201 | POST 成功後 | 列表新增一列；顯示成功提示（toast） |
| TS-F056-027 | POST 422 TIER_LEVEL_DUPLICATE 顯示錯誤 | AC-3-dup | Frontend Unit | stub POST 回傳 HTTP 422 TIER_LEVEL_DUPLICATE | 點擊「確認新增」 | Modal 顯示錯誤訊息「CARD_TYPE H × CARD_LEVEL A 的對應已存在」；Modal 不關閉 |
| TS-F056-028 | M3/HC/C3 過渡期 fallback 對應顯示 Fallback 標籤 | AC-4a, BR-6 | Frontend Unit | stub API 回傳含 M3/null、HC/null、C3/null 三筆過渡期 fallback 對應 | 渲染 TIER_LEVEL 對應 Tab | 三筆均顯示紫色底色與「Fallback」標籤，視覺上與 M5 fallback 一致 |

---

## 邊界與例外情境

| ID | 情境 | 預期行為 | 測試類型 |
|----|------|---------|---------|
| BE-F056-001 | PUT listNm 省略時保留 DB 現有值 | 現有 listNm='期中名單'，PUT body 不傳 listNm → DB listNm 仍為 '期中名單' | Integration |
| BE-F056-002 | PUT listNm 明確傳 null 時清空 | 現有 listNm='期中名單'，PUT body 傳 listNm=null → DB listNm=null | Integration |
| BE-F056-003 | cardType 超過 5 字元 | 回 422 VALIDATION_ERROR（maxLength 5 約束）；DB 無寫入 | Integration |
| BE-F056-004 | tierLevel 超過 5 字元 | 回 422 VALIDATION_ERROR（maxLength 5 約束）；DB 無寫入 | Integration |
| BE-F056-005 | listNm 超過 30 字元 | 回 422 VALIDATION_ERROR（maxLength 30 約束）；DB 無寫入 | Integration |

---

## 測試資料

### Seed 資料（Test Container PostgreSQL）

```sql
-- ob_levelcard_version（H active 版本）
INSERT INTO ob_levelcard_version (card_type, card_name, card_version, sdate, edate, status)
VALUES ('H', '期中', 1, '20190823', '20991231', 'active');

-- ob_levelcard_level（H 型 A/B/C/D，供 CARD_LEVEL 存在性驗證）
INSERT INTO ob_levelcard_level (card_type, card_version, card_level, score_s, score_e)
VALUES
  ('H', 1, 'A', 243, 999),
  ('H', 1, 'B', 214, 242),
  ('H', 1, 'C', 185, 213),
  ('H', 1, 'D', 0,   184);

-- ob_tier 初始 seed（標準對應 + fallback 對應）
INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
VALUES
  ('H',  'A',  'T1',  '期中名單'),
  ('H',  'B',  'T2',  '期中名單'),
  ('M5', NULL, 'T5M', '機車中結滿期名單'),  -- fallback
  ('M3', NULL, 'T5M', NULL),               -- 過渡期 fallback（OQ-E07-28）
  ('HC', NULL, 'THC', NULL),               -- 過渡期 fallback
  ('C3', NULL, 'T3C', NULL);               -- 過渡期 fallback

-- 月跑鎖 fixture（分別用於 TS-F056-010/011/018）
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
| TS-F056-001 ~ 018（Integration） | 高 | Supertest + Test Container；audit_log 直接 DB 查詢；fallback seed 依 OQ-E07-28 決策植入 |
| TS-F056-019 ~ 020（跨層整合） | 中 | 需直接呼叫 PostgreSQL function（`SELECT fn_calc_tier_level(...)`）；fn_calc_tier_level 需 ob_pool_data 型別已知；可在整合 test suite 中執行 raw SQL |
| TS-F056-021 ~ 028（Frontend Unit） | 高 | React Testing Library；isLocked 以 mock prop 注入；stub API 回傳 fallback 對應資料 |
| BE-F056-001 ~ 005（邊界） | 高 | 直接 API 呼叫驗證；不依賴複雜狀態 |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F055（ob_levelcard_level 需有 H 型 A/B/C/D 等級，供 AC-4 驗證）、Migration 1711360000100（ob_tier 表及 UNIQUE INDEX）、fn_calc_tier_level（TS-F056-019/020 跨層整合） |
| 環境依賴 | Test Container PostgreSQL（AppDB）；fn_calc_tier_level 需已安裝於 Test Container（Migration 1711360000141） |
| 風險-1 | A-3 假設（M3/HC/C3 以 ob_tier 對應取代 SP 硬編碼）仍標記 [ASSUMPTION]，若遷移腳本未補 M3/HC/C3 seed，TS-F056-017 / TS-F056-028 需使用 test-only seed 替代，並記錄差異 |
| 風險-2 | A-4 假設（ob_tier PK 補建方式：UNIQUE INDEX with COALESCE vs PostgreSQL NULLS NOT DISTINCT）影響 TS-F056-019 的 INSERT 行為；若 UNIQUE INDEX 設計不同，重複 null 的唯一性約束可能有差異 |
| 風險-3 | TS-F056-019 / 020（跨層整合）依賴 fn_calc_tier_level 的 ob_pool_data 複合型別定義；若 ob_pool_data 型別尚未在 Test Container 中建立，需先確認 Migration 1711360000110 已執行 |
| 風險-4 | HB / SEB / SEC 三種異常 CARD_TYPE（A-6 假設）不在本次測試範圍，若業務決定後加入，需補充對應測試案例 |
