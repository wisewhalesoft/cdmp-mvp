---
type: test-design-feature
feature_id: F056
feature_name: 編輯 TIER_LEVEL 對應表（M02 Tab 5）
priority: P0-MVP
related_spec: /docs/specs/features/F056-edit-tier-mapping.md
last_updated: 2026-07-12
spec_version: "1.6"
---

# F056: 編輯 TIER_LEVEL 對應表（M02 Tab 5） — 測試設計

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
| 主要測試層 | API Integration（Supertest + SQLite in-memory）、Frontend Unit（React Testing Library）、跨層整合（fn_calc_tier_level fallback 驗證） |
| 端點分離驗證 | PUT（批次 UPSERT）/ POST（單筆 INSERT）/ DELETE（單筆刪除）語意不同，各自獨立測試；TIER_LEVEL_DUPLICATE 在不同端點的觸發條件不同 |
| TIER_LEVEL 列舉約束（v1.5 重大新增） | 所有寫入端點之 tierLevel 必須屬於 T1~T10 列舉；舊後綴值（T5M / THC / T3C 等）一律回 422 TIER_LEVEL_INVALID_ENUM |
| Fallback / Standard 互斥（v1.5 重大新增） | 同一 CARD_TYPE 不可同時存在 card_level IS NULL（Fallback）與 card_level IS NOT NULL（Standard）；違反回 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX；互斥規則採**應用層 Mutex 檢查**，無 DB-level constraint（system-architect 已決議） |
| cardType 範圍鎖（v1.5 新增） | 所有端點之 cardType 必須對應 ob_card_type.status='active'，否則回 404 CARD_TYPE_NOT_FOUND |
| CARD_TYPE 篩選（v1.5 新增） | GET /tier-mapping?cardType=H 僅回傳 card_type='H' 的紀錄；不同 CARD_TYPE 之資料不混入 |
| Fallback 路徑（card_level IS NULL） | M5 為標準 fallback 樣本；均需植入 ob_tier seed 並驗證 GET 回傳 cardLevel=null |
| 月名單分派鎖 seed 格式 | 月名單分派鎖 TC 必須 seed AssignmentRun 全部 4 個 NOT NULL 欄位（run_id / project_workym / triggered_by / created_at） |
| BR-10 fn_calc_tier_level NULL fallback | 跨層整合測試：驗證呼叫 fn_calc_tier_level 後，M5 fallback 對應確實被觸發（card_level IS NULL 路徑生效） |
| Audit Log 驗證 | PUT / POST / DELETE 成功後查 assignment_audit_log，entity_type='ob_tier'，entity_id='{card_type}\|{card_level ?? ""}' |

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
| Given | ob_tier 有 H/A → T1；無月名單分派鎖；SM Token |
| When | PUT /tier-mapping，body 含 `{ cardType:'H', cardLevel:'A', tierLevel:'T2' }` |
| Then | HTTP 200；updatedCount=1，insertedCount=0；DB 中 H/A 的 tier_level='T2'；audit_log action='UPDATE'，entity_id='H|A' |

### AC-3：新增 TIER_LEVEL 對應（POST 單筆 INSERT）

| 項目 | 內容 |
|------|------|
| Given | ob_tier 無 H/E 對應；ob_levelcard_level 有 H 型 active 版本的 E 等級（若有）或僅測試現有等級；無月名單分派鎖；SM Token |
| When | POST /tier-mapping，body 含 `{ cardType:'H', cardLevel:'A', tierLevel:'T1', listNm:'期中名單' }` |
| Then | HTTP 201；DB 新增 H/A → T1；audit_log action='CREATE'，entity_type='ob_tier' |

### AC-3-dup：新增時 PK 已存在回 422

| 項目 | 內容 |
|------|------|
| Given | ob_tier 已有 H/A → T1；無月名單分派鎖；SM Token |
| When | POST /tier-mapping，body 含 `{ cardType:'H', cardLevel:'A', tierLevel:'T99' }` |
| Then | HTTP 422，TIER_LEVEL_DUPLICATE；DB 中 H/A 的 tier_level 仍為 T1（不修改） |

### AC-4：CARD_LEVEL 必須存在（標準路徑）

| 項目 | 內容 |
|------|------|
| Given | ob_levelcard_level 無 H 型的 'Z' 等級；無月名單分派鎖；SM Token |
| When | POST /tier-mapping，body 含 `{ cardType:'H', cardLevel:'Z', tierLevel:'T9' }` |
| Then | HTTP 422，CARD_LEVEL_NOT_FOUND |

### AC-4a：允許 card_level=null 的 fallback 對應

| 項目 | 內容 |
|------|------|
| Given | M5 無對應 ob_levelcard_level（fallback CARD_TYPE）；無月名單分派鎖；SM Token |
| When | POST /tier-mapping，body 含 `{ cardType:'M5', cardLevel:null, tierLevel:'T5M', listNm:'機車中結滿期名單' }` |
| Then | HTTP 201；DB 新增 M5/null → T5M；不觸發 CARD_LEVEL_NOT_FOUND |

### AC-5：月名單分派執行中禁止修改

| 項目 | 內容 |
|------|------|
| Given | assignment_run status='running'（seed 含全部 4 個 NOT NULL 欄位）；SM Token |
| When | PUT /tier-mapping |
| Then | HTTP 409；errorCode='SCORING_VERSION_LOCKED' |

### AC-8：TIER_LEVEL 列舉約束（T1~T10，v1.5 新增）

| 項目 | 內容 |
|------|------|
| Given | 無月名單分派鎖；SM Token |
| When | POST /tier-mapping，body tierLevel='T5M'（舊後綴值，非列舉內值） |
| Then | HTTP 422；errorCode='TIER_LEVEL_INVALID_ENUM'；訊息含「TIER_LEVEL 必須為 T1~T10 之一」；DB 無寫入 |

### AC-9：cardType 範圍鎖（v1.5 新增）

| 項目 | 內容 |
|------|------|
| Given | ob_card_type 無 'NOTEXIST' active 紀錄；SM Token |
| When | GET /tier-mapping?cardType=NOTEXIST |
| Then | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |

---

## Test Scenarios

### A. API Integration Tests — GET 列表

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-001 | GET 依 cardType 篩選，僅回傳該 CARD_TYPE 的對應（v1.5 cardType 必填） | AC-1、AC-9 | Integration | ob_card_type(H active, M5 active)；ob_tier: H/A→T1（標準）、H/B→T2、M5/null→T5M（fallback）；SM Token | GET /api/v1/assignment/scoring/tier-mapping?cardType=H | HTTP 200；mappings 陣列只含 H 的紀錄（長度=2，不含 M5 紀錄）；mappings[0].cardLevel='A'；mappings[1].cardLevel='B' |
| TS-F056-002 | GET list_nm 有值與 null 均正確回傳 | AC-1 | Integration | ob_tier: H/A(listNm='期中名單')、H/B(listNm=null)；SM Token | GET /api/v1/assignment/scoring/tier-mapping | H/A 的 listNm='期中名單'；H/B 的 listNm=null（鍵存在，值為 null） |
| TS-F056-003 | 未登入回 401 | 第 5.1 節 | Integration | 無 Token | GET /api/v1/assignment/scoring/tier-mapping | HTTP 401，AUTH_TOKEN_MISSING |

### B. API Integration Tests — PUT 批次 UPSERT

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-004 | PUT 更新既有對應（UPDATE） | AC-2 | Integration | ob_tier(H/A→T1)；ob_levelcard_level(H/A 存在)；無月名單分派鎖；SM Token | PUT mappings=[{cardType:'H',cardLevel:'A',tierLevel:'T2'}] | HTTP 200；updatedCount=1，insertedCount=0；DB 中 H/A tier_level='T2' |
| TS-F056-005 | PUT 新增不存在對應（INSERT） | AC-2 | Integration | ob_tier 無 H/B 對應；ob_levelcard_level(H/B 存在)；無月名單分派鎖；SM Token | PUT mappings=[{cardType:'H',cardLevel:'B',tierLevel:'T2'}] | HTTP 200；updatedCount=0，insertedCount=1；DB 新增 H/B→T2 |
| TS-F056-006 | PUT 未列出的既有對應不刪除 | AC-2, spec 5.2 | Integration | ob_tier(H/A→T1, H/B→T2)；SM Token | PUT mappings=[{cardType:'H',cardLevel:'A',tierLevel:'T1'}]（只列 H/A） | HTTP 200；DB 中 H/B→T2 仍存在（未刪除） |
| TS-F056-007 | PUT body 內同一 PK 重複回 422 | AC-3, BR-1 | Integration | 無月名單分派鎖；SM Token | PUT mappings=[{cardType:'H',cardLevel:'A',tierLevel:'T1'},{cardType:'H',cardLevel:'A',tierLevel:'T2'}]（H/A 重複） | HTTP 422，TIER_LEVEL_DUPLICATE；DB 不執行任何寫入 |
| TS-F056-008 | PUT 成功後 audit_log 記錄 UPDATE，entity_id 含分隔符 | AC-2 | Integration | PUT TS-F056-004 成功後 | 查詢 assignment_audit_log 最新一筆 | action='UPDATE'；entity_type='ob_tier'；entity_id='H|A'；before_value 含舊 tier_level='T1'；after_value 含新 tier_level='T2' |
| TS-F056-009 | PUT card_level=null 的 fallback 對應 UPSERT（v1.5：M5 無 Standard 列前提） | AC-4a | Integration | ob_card_type(M5 active)；ob_tier 無 M5 的任何 Standard 列（保持互斥規則）；ob_levelcard_level 無 M5 等級（fallback CARD_TYPE）；無月名單分派鎖；SM Token | PUT /tier-mapping?cardType=M5，mappings=[{cardType:'M5',cardLevel:null,tierLevel:'T5'}]（注意：v1.5 tierLevel 必須用 T1~T10 列舉值，此處用 T5 替代舊 T5M） | HTTP 200；DB 中 M5/null → T5 存在（或更新）；不觸發 CARD_LEVEL_NOT_FOUND；不觸發 CARD_TYPE_FALLBACK_STANDARD_MUTEX |
| TS-F056-010 | PUT 月名單分派 pending 時回 409 | AC-5 | Integration | assignment_run(run_id='r-pend', project_workym='202604', triggered_by='u1', created_at=NOW(), status='pending')；ob_card_type(H active)；SM Token | PUT /tier-mapping?cardType=H | HTTP 409；errorCode='SCORING_VERSION_LOCKED' |
| TS-F056-011 | PUT 月名單分派 running 時回 409 | AC-5 | Integration | assignment_run(run_id='r-run', project_workym='202604', triggered_by='u1', created_at=NOW(), status='running')；ob_card_type(H active)；SM Token | PUT /tier-mapping?cardType=H | HTTP 409；errorCode='SCORING_VERSION_LOCKED' |

### C. API Integration Tests — POST 單筆 INSERT

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-012 | POST 正常新增標準對應 | AC-3 | Integration | ob_tier 無 H/A 對應；ob_levelcard_level(H active, H/A 存在)；無月名單分派鎖；SM Token | POST { cardType:'H', cardLevel:'A', tierLevel:'T1', listNm:'期中名單' } | HTTP 201；response 含 cardType/cardLevel/tierLevel/listNm；DB 新增 H/A→T1 |
| TS-F056-013 | POST DB 已存在 PK 回 422（不執行 UPDATE） | AC-3-dup | Integration | ob_tier 已有 H/A→T1；SM Token | POST { cardType:'H', cardLevel:'A', tierLevel:'T99' } | HTTP 422，TIER_LEVEL_DUPLICATE；DB H/A tier_level 仍為 T1 |
| TS-F056-014 | POST CARD_LEVEL 不存在於 active 版本（標準路徑） | AC-4 | Integration | ob_levelcard_level 無 H 型的 'Z' 等級；SM Token | POST { cardType:'H', cardLevel:'Z', tierLevel:'T9' } | HTTP 422，CARD_LEVEL_NOT_FOUND |
| TS-F056-015 | POST card_level 超過 1 字元回 422（BR-9 長度檢查） | BR-9 | Integration | SM Token | POST { cardType:'H', cardLevel:'AB', tierLevel:'T1' }（cardLevel 長度為 2） | HTTP 422，CARD_LEVEL_NOT_FOUND（ob_levelcard_level.card_level 最多 VARCHAR(1)，'AB' 不存在） |
| TS-F056-016 | POST fallback 對應（card_level=null，M5，v1.5 tierLevel 用 T5） | AC-4a | Integration | ob_card_type(M5 active)；ob_tier 無 M5 任何對應（保持互斥規則）；M5 無 ob_levelcard_level 紀錄；無月名單分派鎖；SM Token | POST { cardType:'M5', cardLevel:null, tierLevel:'T5', listNm:'機車中結滿期名單' }（v1.5：T5M 已不允許，改用列舉值 T5） | HTTP 201；DB 新增 M5/null→T5；不觸發 CARD_LEVEL_NOT_FOUND；不觸發 CARD_TYPE_FALLBACK_STANDARD_MUTEX |
| TS-F056-017 | ~~POST fallback 對應（card_level=null，M3 過渡期）~~ [已調整] | AC-4a | Integration | **v1.5 注意**：M3 過渡 CARD_TYPE 不在 ob_card_type seed 範圍（BR-6）；若業務後續透過 F070 新增 M3 CARD_TYPE，此案例可恢復；目前此 TC 暫標為 [SKIP] 等 M3 被 F070 新增後啟用。若在非正式測試環境需要驗，需先手動 seed ob_card_type(M3 active) | — | — |
| TS-F056-018 | POST 月名單分派執行中回 409 | AC-5 | Integration | assignment_run(run_id='r-run2', project_workym='202604', triggered_by='u1', created_at=NOW(), status='running')；ob_card_type(H active)；SM Token | POST /tier-mapping | HTTP 409；errorCode='SCORING_VERSION_LOCKED' |

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
| TS-F056-025 | 月名單分派執行中按鈕 disabled | AC-5 | Frontend Unit | isLocked=true | 渲染 TIER_LEVEL 對應 Tab | 「新增對應」按鈕 disabled=true；編輯按鈕 disabled=true |
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

-- ob_card_type（v1.5 新增：CARD_TYPE 範圍鎖需要此表）
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
VALUES
  ('H',  '期中',   '01', 'active', NOW(), 'system', NOW(), 'system'),
  ('M5', '機車滿期', '02', 'active', NOW(), 'system', NOW(), 'system');

-- ob_tier 初始 seed（v1.5：tier_level 改用 T1~T10 列舉值）
INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
VALUES
  ('H',  'A',  'T1', '期中名單'),
  ('H',  'B',  'T2', '期中名單'),
  ('M5', NULL, 'T5', '機車中結滿期名單');  -- fallback（v1.5：T5M → T5）

-- 月名單分派鎖 fixture（v1.5：AssignmentRun 必須 4 欄 NOT NULL 全填）
INSERT INTO assignment_run (run_id, project_workym, triggered_by, created_at, status)
VALUES ('run-f056-pend', '202604', 'test-user-id', NOW(), 'pending');
INSERT INTO assignment_run (run_id, project_workym, triggered_by, created_at, status)
VALUES ('run-f056-run',  '202604', 'test-user-id', NOW(), 'running');
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
| TS-F056-001 ~ 018（Integration，含 v1.5 seed 更新） | 高 | Supertest + SQLite in-memory；v1.5 起 tierLevel 改用 T1~T10；ob_card_type entity 需加入 entities 清單 |
| TS-F056-019 ~ 020（跨層整合） | 中 | 需直接呼叫 PostgreSQL function（`SELECT fn_calc_tier_level(...)`）；SQLite 不支援，須改用 Test Container PostgreSQL |
| TS-F056-021 ~ 028（Frontend Unit） | 高 | React Testing Library；isLocked 以 mock prop 注入；v1.5 新增 Modal 規則類型切換測試 |
| TS-F056-029 ~ 049（v1.5 新增，Integration + Frontend Unit） | 高 | TIER_LEVEL 列舉 / 互斥 / DELETE / CARD_TYPE 篩選均可自動化 |
| BE-F056-001 ~ 005（邊界） | 高 | 直接 API 呼叫驗證 |
| TS-F056-050 ~ 059、061 ~ 067（v1.6 新增，SQLite 小母體可行） | 高 | 業務彙總邏輯（多對一合計 / Fallback / 排序 / 無對應提示 / 讀鎖豁免 / 三態）不依賴真實 `TABLESAMPLE` 執行，可用小母體 fallback 於 SQLite 驗證 |
| TS-F056-060（v1.6 新增，MSSQL 真實 DB） | 中 | 需 MSSQL 可達；本機無法連線時 `describe.skip` + SKIP_REASON，不假造綠燈；v1.2 起效能期望已修正為 ~12 秒可接受 |
| TS-F056-068 ~ 070（T 組，v1.2 client-side TIER 彙總） | 高 | React Testing Library；純函式 oracle 比對，無需真實 DB / HTTP，spy 呼叫次數即可驗證「不觸發新 fetch」 |

---

## v1.5 新增 Test Scenarios

### F. API Integration Tests — TIER_LEVEL 列舉約束（AC-8）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-029 | PUT 送出舊後綴值 T5M 回 422 | AC-8、BR-2 | Integration | ob_card_type(H active)；無月名單分派鎖；SM Token | PUT /tier-mapping?cardType=H，mappings=[{cardType:'H',cardLevel:'A',tierLevel:'T5M'}] | HTTP 422；errorCode='TIER_LEVEL_INVALID_ENUM'；訊息含「T5M」；DB 無寫入 |
| TS-F056-030 | POST 送出舊後綴值 THC 回 422 | AC-8、BR-2 | Integration | ob_card_type(H active)；無月名單分派鎖；SM Token | POST { cardType:'H', cardLevel:'A', tierLevel:'THC' } | HTTP 422；errorCode='TIER_LEVEL_INVALID_ENUM'；DB 無寫入 |
| TS-F056-031 | POST 送出超出範圍值 T11 回 422 | AC-8、BR-2 | Integration | ob_card_type(H active)；無月名單分派鎖；SM Token | POST { cardType:'H', cardLevel:'A', tierLevel:'T11' } | HTTP 422；errorCode='TIER_LEVEL_INVALID_ENUM'；DB 無寫入 |
| TS-F056-032 | POST 送出 T1（列舉最小值）成功 | AC-8（邊界） | Integration | ob_card_type(H active)；ob_levelcard_level(H/A 存在)；ob_tier 無 H/A；無月名單分派鎖；SM Token | POST { cardType:'H', cardLevel:'A', tierLevel:'T1' } | HTTP 201；DB 新增 H/A→T1；不回 TIER_LEVEL_INVALID_ENUM |
| TS-F056-033 | POST 送出 T10（列舉最大值）成功 | AC-8（邊界） | Integration | ob_card_type(H active)；ob_levelcard_level(H/B 存在)；ob_tier 無 H/B；無月名單分派鎖；SM Token | POST { cardType:'H', cardLevel:'B', tierLevel:'T10' } | HTTP 201；DB 新增 H/B→T10；不回 TIER_LEVEL_INVALID_ENUM |

### G. API Integration Tests — cardType 範圍鎖（AC-9）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-034 | GET 帶不存在的 cardType 回 404 | AC-9 | Integration | ob_card_type 無 'NOTEXIST' active 紀錄；SM Token | GET /tier-mapping?cardType=NOTEXIST | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |
| TS-F056-035 | PUT 帶不存在的 cardType 回 404 | AC-9 | Integration | ob_card_type 無 'NOTEXIST' active 紀錄；SM Token | PUT /tier-mapping?cardType=NOTEXIST | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |
| TS-F056-044 | GET /tier-mapping?cardType=H 僅回傳 H 的紀錄（不含其他 CARD_TYPE） | AC-1、AC-9 | Integration | ob_card_type(H active, S active)；ob_tier H/A→T1、S/A→T2；SM Token | GET /tier-mapping?cardType=H | HTTP 200；mappings 所有列的 cardType='H'；S/A→T2 不在結果中 |

### H. API Integration Tests — Fallback / Standard 互斥（AC-3、AC-4a、BR-13）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-036 | 已有 Standard 列，新增 Fallback（card_level=null）→ 422 互斥 | AC-3、BR-13 | Integration | ob_card_type(H active)；ob_tier H/A→T1（Standard 列存在）；無月名單分派鎖；SM Token | POST { cardType:'H', cardLevel:null, tierLevel:'T1' } | HTTP 422；errorCode='CARD_TYPE_FALLBACK_STANDARD_MUTEX'；訊息含 'H' 與 Standard 規則數量；DB 無新增 |
| TS-F056-037 | 已有 Fallback 列（card_level=null），新增 Standard（card_level='A'）→ 422 互斥 | AC-4a、BR-13 | Integration | ob_card_type(H active)；ob_tier H/null→T1（Fallback 列存在）；ob_levelcard_level(H/A 存在)；無月名單分派鎖；SM Token | POST { cardType:'H', cardLevel:'A', tierLevel:'T1' } | HTTP 422；errorCode='CARD_TYPE_FALLBACK_STANDARD_MUTEX'；訊息含「已有 Fallback 規則」；DB 無新增 |
| TS-F056-038 | PUT batch：body 同時包含 null 與非 null cardLevel → 422 互斥 | AC-3、BR-13 | Integration | ob_card_type(H active)；ob_tier 無任何 H 紀錄；無月名單分派鎖；SM Token | PUT /tier-mapping?cardType=H，mappings=[{cardType:'H',cardLevel:null,tierLevel:'T1'},{cardType:'H',cardLevel:'A',tierLevel:'T2'}] | HTTP 422；errorCode='CARD_TYPE_FALLBACK_STANDARD_MUTEX'；DB 無任何寫入（全部 rollback） |

### I. API Integration Tests — DELETE 端點（AC-6 / AC-7）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-039 | DELETE Standard 對應（cardLevel='A'）正常刪除 | AC-6、BR-11 | Integration | ob_card_type(H active)；ob_tier H/A→T1；無月名單分派鎖；SM Token | DELETE /tier-mapping?cardType=H&cardLevel=A | HTTP 200；response.cardType='H'、cardLevel='A'；DB 中 H/A 紀錄已不存在 |
| TS-F056-040 | DELETE Fallback 對應（省略 cardLevel，card_level=NULL） | AC-7、BR-11 | Integration | ob_card_type(M5 active)；ob_tier M5/null→T5；無月名單分派鎖；SM Token | DELETE /tier-mapping?cardType=M5（不帶 cardLevel） | HTTP 200；response.cardType='M5'、cardLevel=null；DB 中 M5/null 紀錄已不存在 |
| TS-F056-041 | NULL PK delete regression guard（ob_tier fallback 紀錄必須透過 repo.remove 刪除） | AC-7、BR-11 | Integration | ob_card_type(M5 active)；ob_tier M5/null→T5（1 筆 Fallback 紀錄）；無月名單分派鎖；SM Token | DELETE /tier-mapping?cardType=M5（省略 cardLevel）；後驗 ob_tier COUNT | HTTP 200；DB COUNT=0（Fallback 紀錄被成功刪除）；若 service 使用 repo.delete({card_level:null}) 路徑，COUNT=1（靜默 bug，案例失敗，regression 被抓住）。詳見 `docs/test-specs/regression/M02-regression-guards.md` TC-GUARD-NULL-PK-001 |
| TS-F056-042 | DELETE 月名單分派執行中回 409 | AC-6、BR-5 | Integration | assignment_run(run_id='r-del', project_workym='202604', triggered_by='u1', created_at=NOW(), status='running')；ob_card_type(H active)；SM Token | DELETE /tier-mapping?cardType=H&cardLevel=A | HTTP 409；errorCode='SCORING_VERSION_LOCKED' |
| TS-F056-043 | DELETE 不存在的 (cardType, cardLevel) 回 404 | AC-6 | Integration | ob_card_type(H active)；ob_tier 無 H/Z；SM Token | DELETE /tier-mapping?cardType=H&cardLevel=Z | HTTP 404；errorCode='TIER_MAPPING_NOT_FOUND' |

### J. API Integration Tests — DELETE audit_log 驗證

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-039a | DELETE Standard 成功後 audit_log 記錄 | AC-6、BR-7 | Integration | TS-F056-039 成功後 | 查詢 assignment_audit_log 最新一筆 | action='DELETE'；entity_type='ob_tier'；entity_id='H\|A'；before_value 含 tierLevel='T1'；after_value=null |
| TS-F056-040a | DELETE Fallback 成功後 audit_log entity_id 格式（cardLevel 部分留空） | AC-7、BR-7 | Integration | TS-F056-040 成功後 | 查詢 assignment_audit_log 最新一筆 | action='DELETE'；entity_type='ob_tier'；entity_id='M5\|'（cardLevel 部分為空字串） |

### K. Frontend Unit Tests — v1.5 新增

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-045 | TIER_LEVEL 下拉選單只有 T1~T10 共 10 個選項 | AC-2、AC-8 | Frontend Unit | 開啟新增 Modal，切換至 Standard 模式 | 點擊 TIER_LEVEL 下拉 | 選項列表有且僅有 T1 / T2 / T3 / T4 / T5 / T6 / T7 / T8 / T9 / T10（10 個）；無自由輸入欄位；無 T5M / THC 等舊值 |
| TS-F056-046 | 每列右側顯示刪除按鈕，確認後呼叫 DELETE API | AC-6 | Frontend Unit | stub GET /tier-mapping?cardType=H 回傳 H/A→T1；stub DELETE 回傳 HTTP 200 | 點擊 H/A 列的「刪除」icon → 確認對話框點擊「確認刪除」 | DELETE API 被呼叫（spy 確認）；列表移除 H/A 列；顯示刪除成功 toast |
| TS-F056-047 | 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX 時 Modal 顯示對應錯誤 | AC-3、AC-4a | Frontend Unit | stub POST 回傳 HTTP 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX | 點擊確認新增 | Modal 不關閉；顯示「已有 Fallback 規則，請先移除」或等效錯誤文字 |
| TS-F056-048 | 新增 Modal 切換 Standard / Fallback 規則類型 | AC-3、AC-4a | Frontend Unit | 新增 Modal 已開啟 | 切換至「Standard（依等級）」選項；再切換至「Fallback（不分等級）」選項 | Standard 模式：CARD_LEVEL 下拉欄位可見且可選；Fallback 模式：CARD_LEVEL 欄位自動填入「不分等級（NULL）」並變為 readonly |
| TS-F056-049 | Tab 5 頂部標示目前操作的 CARD_TYPE | AC-1（v1.5） | Frontend Unit | selectedCardType='H'；cardName='期中'；stub GET 回傳 H 型資料 | 渲染 Tab 5 | 頁面頂部顯示「正在編輯：H — 期中」文字 |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F055（ob_levelcard_level 需有等級資料，供 Standard CARD_LEVEL 存在性驗證）、F069（ob_card_type entity 必須存在，v1.5 新增 cardType 範圍鎖）、fn_calc_tier_level（TS-F056-019/020 跨層整合） |
| 環境依賴 | SQLite in-memory（E2E）；ob_card_type entity 需已加入 entities 清單；fn_calc_tier_level 跨層整合需 Test Container PostgreSQL |
| RISK-F056-01（已關閉） | Fallback / Standard 互斥採**應用層 Mutex 檢查**（system-architect 已決議，2026-05-14）；不加 DB-level partial unique index 或 trigger；測試只需驗應用層 service 行為，無需驗 DB constraint |
| 風險-2 | v1.5 TS-F056-017（M3 fallback）暫標 [SKIP]；M3 不在 ob_card_type seed 範圍（BR-6）；待業務透過 F070 新增 M3 後啟用 |
| 風險-3 | TS-F056-019 / 020（跨層整合）依賴 fn_calc_tier_level；SQLite 不支援，需 Test Container PostgreSQL |
| 風險-4 | TS-F056-041（NULL PK regression guard）同時引用 `docs/test-specs/regression/M02-regression-guards.md` TC-GUARD-NULL-PK-001 |
| 風險-5（v1.6） | AD-E07-45 抽樣估算共用元件（`sampling-estimator.ts`：`POOL_DATA_SAMPLE_SIZE`/`POOL_DATA_SAMPLE_SEED`/`getPoolDataTotalCount`/`buildPoolDataSampleFrom`/`scaleEstimate`）之核心測試**唯一**位於 [F055-test.md](F055-test.md) I 組；本文件 L~S 組僅新增 F056 消費端特有整合案例（histogram → TIER 映射彙總、Fallback/Standard 分布、讀鎖豁免），不重複驗證共用元件本身 |
| 風險-6（v1.6） | 本專案已完成 MSSQL-only 遷移，PG 測試基礎設施已移除；`TABLESAMPLE` 真實執行相關案例（效能 / 可重現性）標記為 `.mssql.spec.ts`，本機無 MSSQL 可達時誠實 `describe.skip`，不得以 SQLite 假造方言 SQL |
| 風險-7（v1.6） | F056 spec v1.6 AC-11 字面敘述 Fallback 情境「佔比 100%」，但 AD-E07-45 §3.5 / §5.2 point 6 明確定義分母恆為 `effectiveSampleSize`（含 NULL-score 列），故 ratio 並非精確 1.0；本文件 M 組（TS-F056-054/055）刻意拆兩案例呈現此措辭落差，以 AD 之精確規則為準，非測試設計錯誤 |
| 風險-8（v1.2 追加修正） | `AD-E07-45-sampling-estimator.md` 檔案本身截至本次修訂仍為 v1.1，未見 v1.2（histogram 欄位 + client-side TIER 彙總 + ~12 秒效能可接受）之正式文字；T 組依 coordinator 轉達之 team-lead 決策設計，AD 與 F056 spec §5.5 之正式同步為 system-architect / spec-writer 後續事項，非本測試設計阻擋項 |
| 風險-9（v1.2 追加修正） | T 組（前端 client-side 計算）與 L~S 組（backend §5.5 端點）為互補、非取代關係；§5.5 端點依 coordinator 指示「仍為 server API」而保留，其確切消費者（若非互動式 Tab 5 UI）未在本輪說明範圍內，測試設計不代為假設，交 tdd-implementation / system-architect 後續釐清 |

---

## v1.6 新增 Test Scenarios（US-175 §5.5 新端點「預估各 TIER 分布」，AD-E07-45）

> **背景**：F056 v1.6（US-175）新增 §5.5 `GET .../tier-mapping/preview` 唯讀端點：對選中 CARD_TYPE 之 `ob_pool_data` 抽樣，先套用該 CARD_TYPE **active** CARD_LEVEL 門檻（F055，非草稿值）分級，再依 `ob_tier` 對應規則映射並彙總至 TIER_LEVEL，共用 AD-E07-45 D1 抽樣估算邏輯。抽樣核心元件（`sampling-estimator.ts`）之常數 / `scaleEstimate` / `buildPoolDataSampleFrom` 核心測試已於 [F055-test.md](F055-test.md) I 組完整覆蓋，本組不重複驗證，僅新增 F056 消費端特有之 histogram→分桶→TIER 彙總邏輯與端點契約測試。
>
> **測試邊界**：沿用 [F055-test.md](F055-test.md) v1.7 章節「測試邊界」聲明（MSSQL-only、PG test container 已移除、`TABLESAMPLE` 不存在於 SQLite）；本組多數案例可透過**小母體 fallback**（`totalCount ≤ 50000`，無 `TABLESAMPLE`）於 SQLite 驗證業務彙總邏輯本身之正確性，僅效能 / 可重現性案例（P 組）需 MSSQL 真實 DB。

### L. §5.5 GET tier-mapping/preview — 契約與 Standard 多對一合計（AC-10 / TC-175-01）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-050 | Standard 規則多對一合計（TC-175-01） | AC-10 | Integration（SQLite 小母體可行） | ob_card_type(H active)；ob_tier(H)：A→T1、B→T1、C→T2、D→T3；ob_levelcard_level(H active) 4 級門檻；ob_pool_data 小母體（≤50000，已知分數分佈使 A/B/C/D 各有已知筆數）；SM/處長 Token | GET /tier-mapping/preview?cardType=H | HTTP 200；`distribution` 含 T1（A+B 樣本放大推算後加總）、T2（C）、T3（D）三筆，非四筆（A/B 已合併）；`ratio` 加總約為 1 |
| TS-F056-051 | 單一 CARD_LEVEL 對應單一 TIER（無合計情境）基本正確性 | AC-10 | Integration | ob_tier(H)：A→T1、B→T2、C→T3、D→T4（一對一，無合計） | GET /tier-mapping/preview?cardType=H | `distribution` 含 4 筆，每筆對應單一 CARD_LEVEL 之放大推算值，彼此不合併 |
| TS-F056-052 | response 契約完整性（cardType/hasMapping/ruleType/isEstimate/sampleSize/totalCount/distribution[]） | spec §5.5 response schema | Integration | 同 TS-F056-050 | GET /tier-mapping/preview?cardType=H | response 含全部 7 個頂層鍵；`cardType==='H'`；`hasMapping===true`；`ruleType==='standard'`；`isEstimate===true`；`distribution[]` 每筆含 `tierLevel`/`count`/`ratio` |
| TS-F056-053 | 🔴 `distribution[]` 依 tierLevel **數值序**排序（非字典序，T10 不得排在 T2 之前） | spec §5.5 point 8（AD-E07-45 §5.2 明確提醒陷阱） | Integration/Unit | ob_tier(H)：A→T1、B→T2、...含使結果同時出現 T2 與 T10 之對應規則（如 J→T10，J 為額外等級或改用 10 級測試卡） | GET /tier-mapping/preview?cardType=H | `distribution` 陣列順序為 `T1, T2, ..., T9, T10`（數值遞增）；**不得**為字典序 `T1, T10, T2, ...` |

### M. Fallback 規則情境（AC-11 / TC-175-02）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-054 | Fallback 全樣本皆可計分 → 單一 TIER，`ratio` 恰為 1.0（對齊 AC-11 字面「100%」） | AC-11 | Integration（SQLite 小母體） | ob_tier(M5)：card_level=NULL → T5（Fallback）；ob_pool_data 小母體樣本內全部列皆落在 M5 active CARD_LEVEL 門檻可計分區間內（無 NULL-score 列） | GET /tier-mapping/preview?cardType=M5 | `distribution` 僅 1 筆（`tierLevel==='T5'`）；`ratio===1`（或近似 1.0000，四捨五入至小數點後 4 位） |
| TS-F056-055 | ⚠️ 精確度落差案例：Fallback 樣本含 NULL-score 列 → 仍單一 TIER 條目，但 `ratio < 1.0`（分母含 NULL-score 列，AD-E07-45 §3.5 精確定義） | AC-11 vs AD-E07-45 §5.2 point 6（本案例明確記錄 spec「100%」字面敘述與 AD 精確定義之措辭落差，以 AD 為準） | Integration（SQLite 小母體） | 同上，但樣本中刻意植入部分列使其分數落於 CARD_LEVEL 門檻範圍外（不可計分，score IS NULL 之等效情境） | GET /tier-mapping/preview?cardType=M5 | `distribution` 仍僅 1 筆 `tierLevel==='T5'`（fallback 不因不可計分列而拆分）；`ratio < 1.0`（分母 `effectiveSampleSize` 含不可計分列，非僅計分列） |

### N. 無對應規則 / 未選中 CARD_TYPE（AC-12 / TC-175-03 / TC-175-04）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-056 | CARD_TYPE 於 ob_tier 無任何對應（Standard 與 Fallback 皆無） | AC-12 | Integration | ob_card_type(S5 active)；ob_tier 無 S5 任何列 | GET /tier-mapping/preview?cardType=S5 | HTTP 200（非錯誤）；`hasMapping===false`；`ruleType==='none'`；`distribution===[]` |
| TS-F056-057 | 未選中 CARD_TYPE（前端層級）→ 不呼叫 §5.5 端點，沿用既有空狀態提示 | AC-12（US-175 AC-5） | Frontend Unit | selectedCardType='' / undefined | 渲染 Tab 5 | 頁面顯示「請先在 Tab 1 選擇計分卡類型以查看設定」；`GET .../tier-mapping/preview` 未被呼叫（spy 確認呼叫次數為 0） |

### O. 讀鎖豁免 / 唯讀（AC-13 / TC-175-05）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-058 | `assignment_run.status='running'` 時 GET tier-mapping/preview 仍回 200（不受寫入鎖影響） | AC-13, I-SAMPLE-LOCK-EXEMPT-01 | Integration（SQLite 小母體） | assignment_run(status='running')；ob_card_type(H active) | GET /tier-mapping/preview?cardType=H | HTTP 200（不回 409 SCORING_VERSION_LOCKED）；distribution 正常回傳 |
| TS-F056-059 | 同一情境下對應表格 PUT / POST / DELETE 寫入端點仍回 409（確保 preview 唯讀豁免不誤擴大） | AC-5, AC-13 | Integration（交叉引用既有 TS-F056-010 / 011 / 018 / 042，不重複實作） | 同上 running 狀態 | 依序呼叫 PUT / POST / DELETE tier-mapping | 三者皆回 HTTP 409 SCORING_VERSION_LOCKED（既有行為不受本輪新增之 §5.5 讀鎖豁免影響） |

### P. 效能與可重現性（AC-7 / TC-175-06）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-060 | 🔴 v1.2 修正：CARD_TYPE 對應規則不變，重複兩次載入 distribution 完全一致；各次回應時間 ~12 秒為可接受值（**不再是** sub-second — 本端點內部呼叫與 F055 相同之昂貴 `computeScoreHistogram`，見 AD-E07-45 v1.2） | AC-7, TC-175-06 | Integration（**MSSQL 真實 DB**，`.mssql.spec.ts`；本機無 MSSQL 可達時 `describe.skip` + SKIP_REASON） | ob_pool_data 大母體（> 50000 筆，MSSQL Test DB）；ob_tier(H) 對應規則固定 | 對 `cardType=H` 連續呼叫兩次 GET /tier-mapping/preview，分別量測回應時間 | 兩次 `distribution` 逐筆完全相等（決定性不受影響）；各次回應時間 ≈12 秒屬可接受，**不再要求** < 1000ms（正是此昂貴成本驅動 Group T 之前端 client-side 快取設計，避免互動式 UI 重複觸發本端點） |

### Q. "重用 histogram、不重掃" 精確語意（AD-E07-45 §5.2）

> **與 v1.2 Group T 的關係（易混淆，需區分）**：本組驗證的是**單一 HTTP request 內部**不重複查詢（backend 層級的既有語意，AD-E07-45 §5.2 原文）；v1.2 新增之 Group T 驗證的是**互動式 UI 層級**——切換至 Tab 5 時**完全不發出**本端點的 HTTP request（改用 F055 已快取之 histogram 於前端計算）。兩者是不同層級的「不重複」語意，不可互相取代：本組案例即使全數通過，仍無法保證 Group T 之行為成立（backend 端點本身效率如何，與前端是否選擇呼叫它是兩件事）。

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-061 | 單一 F056 request 內部 `computeScoreHistogram`（F055/F056 共用私有方法）僅被呼叫一次 | AD-E07-45 §5.2「不重掃」精確語意 | Unit/Integration（spy） | spy `computeScoreHistogram` 呼叫次數 | 呼叫一次 GET /tier-mapping/preview | `computeScoreHistogram` 恰好被呼叫 1 次（非為支援 CARD_LEVEL 分桶與 TIER 分桶各查一次） |
| TS-F056-062 | F055 與 F056 為兩個獨立 HTTP request 時，各自重新查詢（不共用快取結果） | I-SAMPLE-NO-CACHE-01（F056 端點同樣適用） | Integration（SQLite 小母體） | 先呼叫 F055 GET card-levels/preview，DB 再變動 1 筆，再呼叫 F056 GET tier-mapping/preview | 依序呼叫兩端點 | F056 之 `totalCount` 反映變動後之最新筆數（未沿用 F055 request 之查詢結果或任何跨請求快取） |

### R. RBAC / CARD_TYPE 範圍鎖（沿用既有模式）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-063 | 處長角色可讀取 §5.5 preview（`DirectorOrSectionChiefGuard`） | spec §5「Controller 規範」 | Integration | 處長 Token（businessRole='section_chief'） | GET /tier-mapping/preview?cardType=H | HTTP 200（處長可讀取，與 §5.1 GET 對應清單權限模型一致） |
| TS-F056-064 | cardType 不存在於 active ob_card_type → 404 | 沿用 AC-9 | Integration | ob_card_type 無 'NOTEXIST' active 紀錄 | GET /tier-mapping/preview?cardType=NOTEXIST | HTTP 404；errorCode='CARD_TYPE_NOT_FOUND' |

### S. Frontend Tests — Tab 5「預估各 TIER 分布」面板 UI（AC-3 / D3）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-065 | 面板三態（載入中 / 已顯示估算 / 錯誤重試）視覺可區分，比照 F055 Tab 4 | AC-13, US-175 AC-7 | Frontend Unit | 分別以三種 stub 狀態渲染 Tab 5 分布面板 | 檢視各狀態 DOM | 三態各自有獨立可辨識標記（`data-state` 或對應 testid），與 [F055 TS-F055-052](F055-test.md) 同一驗證手法 |
| TS-F056-066 | 🔴 估算失敗顯示「預估分布暫時無法取得」+ 重試，不得空白 | AC-13「估算失敗時面板顯示錯誤 / 無法載入狀態而非空白」 | Frontend Unit | stub GET /tier-mapping/preview 回傳 500 或逾時 | 渲染面板 | 面板顯示明確錯誤文字 + 可重試操作；不得渲染為空白區塊（比照 [F055 AC-8](F055-edit-card-level-thresholds.md)） |
| TS-F056-067 | 資訊架構比照 Tab 4（分類項目 + 人數 + 佔比 呈現邏輯一致，D3） | AC-3（US-175 AC-3） | Frontend Unit | stub GET tier-mapping/preview 回傳 3 筆 distribution | 渲染面板並比對 Tab 4 CARD_LEVEL 分布面板之 DOM 結構 | 兩面板之資料列結構（分類代碼欄 + 筆數欄 + 佔比欄）呈現邏輯相同；視覺樣式細節（顏色/圖示/排版）不在本案例斷言範圍（由 ui-ux-designer 決定） |

---

## v1.2 追加修正 Test Scenarios（AD-E07-45 v1.2 — team-lead 效能決策，2026-07-12）

> **背景**：同 [F055-test.md](F055-test.md) v1.2 章節之背景說明（histogram threshold-/tier-independent、每 cardType 昂貴計算約 12 秒、故只抓一次並快取）。本次調整對 F056 之延伸：Tab 5「預估各 TIER 分布」面板之互動路徑（使用者從 Tab 4 切換至 Tab 5）**改為 client-side 計算**——複用 F055 已快取之 `histogram`（TS-F055-056 快取結果）+ 該 CARD_TYPE **active** CARD_LEVEL 門檻（既有 GET card-levels，非草稿值）+ 既有 `GET tier-mapping`（§5.1 對應清單，本身即需載入以顯示對應表格，非新增呼叫）之 `ob_tier` 映射，於前端 JS 完成「histogram → CARD_LEVEL 分桶 → TIER 彙總」全流程，**不**呼叫 §5.5 `GET tier-mapping/preview`。
>
> **§5.5 backend 端點仍保留**（coordinator 明確指示「it remains a server API」）——本文件 L~S 組（TS-F056-050~067）**維持不變**，作為該端點本身之契約 / 業務邏輯 / RBAC / 讀鎖豁免測試，惟 P 組（TS-F056-060）效能期望已修正為 ~12 秒可接受（見上）。本節（T 組）為**新增**之互動式 UI 層級案例，與既有 backend 案例並存、互補，不互相取代。
>
> **文件狀態誠實聲明**：同 F055-test.md 之聲明——`AD-E07-45-sampling-estimator.md` 檔案本身截至本次修訂仍為 v1.1，本節依 coordinator 轉達之 team-lead 決策設計，AD 與 F056 spec 之正式同步為 system-architect / spec-writer 後續事項。

### T. F056 前端 — Client-side 即時 TIER 彙總（v1.2，取代逐次後端 scan）

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F056-068 | 切換至 Tab 5（TIER 分布面板）不觸發新的 fetch/scan | AD-E07-45 v1.2 | Frontend Unit（spy fetch 呼叫次數） | 已於 Tab 4 載入 CARD_TYPE='H' 之 histogram（快取中）；Tab 5 既有 `GET tier-mapping`（對應清單）已載入 | 切換至 Tab 5 | `GET .../tier-mapping/preview`（§5.5）**未被呼叫**（spy 呼叫次數為 0）；TIER 分布面板仍正確顯示（由前端計算） |
| TS-F056-069 | client-side TIER 彙總正確性 — 多對一合計（JS 計算，取代 TS-F056-050 之後端案例） | AD-E07-45 v1.2, AC-10 | Frontend Unit（純函式 / oracle 比對） | 已知 `histogram`（快取自 F055）+ 已知 active CARD_LEVEL 門檻（H: A/B/C/D）+ 已知 `ob_tier` 映射（H: A→T1、B→T1、C→T2、D→T3） | 呼叫前端 client-side TIER 彙總函式 | 計算結果 T1（A+B 加總）、T2（C）、T3（D）三筆，與 TS-F056-050 之後端案例數值一致（同一 first-match-wins 分桶邏輯 + 相同 `ob_tier` 映射，僅執行位置由 backend 移至 frontend） |
| TS-F056-070 | client-side Fallback 100% 呈現正確性（JS 計算） | AD-E07-45 v1.2, AC-11 | Frontend Unit（純函式 / oracle 比對） | 已知 `histogram`（全樣本可計分，無 NULL-score）+ `ob_tier` Fallback 映射（M5: card_level=NULL→T5） | 呼叫前端 client-side TIER 彙總函式（Fallback 路徑：不套用 card_level 分桶，直接以 histogram 全部 count 加總） | 計算結果僅 1 筆（`tierLevel==='T5'`），`ratio===1`；與 TS-F056-054 之後端案例數值一致 |
