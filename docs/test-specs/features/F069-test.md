---
type: test-design-feature
feature_id: F069
feature_name: 查看 CARD_TYPE 計分卡類型清單
priority: P0-MVP
related_spec: /docs/specs/features/F069-view-card-type-list.md
last_updated: 2026-05-14
---

# F069: 查看 CARD_TYPE 計分卡類型清單 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F069-view-card-type-list.md` + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + SQLite in-memory）、Frontend Unit（React Testing Library） |
| PROD_KIND join 策略 | 後端 join ob_card_type.prod_kind → ob_code_df WHERE tbl_id='PROD_KIND' 取 tbl_desc1；seed 需同時建立 ob_code_df 啟用期間內紀錄 |
| 清單排序驗證 | seed 故意打亂插入順序（M / H / S），驗證 API 回傳依 card_type 升冪（E / H / M / S 等） |
| 月名單分派鎖狀態 | GET 端點不受月名單分派鎖影響；僅前端 UI 需依月名單分派狀態 disabled 按鈕 |
| 空清單場景 | ob_card_type 無任何 active 紀錄時 GET 回傳 200 空陣列（非 404） |

---

## Acceptance Test Design

### AC-1：顯示 CARD_TYPE 清單（含 PROD_KIND join）

| 項目 | 內容 |
|------|------|
| Given | ob_card_type 有 H（汽車 01）/ S（汽車 01）/ M（機車 02）共 3 筆 active 紀錄；ob_code_df 有 tbl_id='PROD_KIND' 之 tbl_cd='01'（tbl_desc1='汽車'）與 tbl_cd='02'（tbl_desc1='機車'）啟用期間內紀錄；SM Token |
| When | 呼叫 `GET /api/v1/assignment/scoring/card-types` |
| Then | HTTP 200；cardTypes 陣列長度=3；每筆含 cardType / cardName / prodKind / prodKindName / status；H 那筆 prodKindName='汽車'；M 那筆 prodKindName='機車' |
| 驗證步驟 | 1. 確認 HTTP 200<br>2. 確認 cardTypes 陣列長度=3<br>3. 找出 cardType='H' 的筆，驗證 prodKind='01'、prodKindName='汽車'<br>4. 找出 cardType='M' 的筆，驗證 prodKind='02'、prodKindName='機車'<br>5. 確認每筆 status='active' |

### AC-1 + BR-3：清單依 card_type 升冪排序

| 項目 | 內容 |
|------|------|
| Given | ob_card_type seed 以 M / H / S 順序插入（故意打亂）；SM Token |
| When | 呼叫 `GET /api/v1/assignment/scoring/card-types` |
| Then | HTTP 200；cardTypes[0].cardType ≤ cardTypes[1].cardType ≤ cardTypes[2].cardType（ASCII 升冪：H < M < S） |

### AC-5：清單為空狀態

| 項目 | 內容 |
|------|------|
| Given | ob_card_type 無任何 status='active' 紀錄（可有 inactive 紀錄）；SM Token |
| When | 呼叫 `GET /api/v1/assignment/scoring/card-types` |
| Then | HTTP 200；cardTypes 陣列長度=0（回傳空陣列，非 404） |

---

## Test Scenarios

### A. API Integration Tests — GET 清單

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F069-01 | GET 清單含 prodKindName（join ob_code_df 正常） | AC-1 | Integration | ob_card_type(H,01)/(S,01)/(M,02) active；ob_code_df 有 01/02 啟用紀錄；SM Token | GET /api/v1/assignment/scoring/card-types | HTTP 200；cardTypes[H].prodKindName='汽車'；cardTypes[M].prodKindName='機車' |
| TC-F069-02 | 清單依 card_type 升冪排序 | AC-1 + BR-3 | Integration | ob_card_type seed 以 M/H/S 順序插入；SM Token | GET /api/v1/assignment/scoring/card-types | HTTP 200；cardTypes[0].cardType='H'；cardTypes[1].cardType='M'；cardTypes[2].cardType='S' |
| TC-F069-08 | 清單為空時回傳 200 空陣列 | AC-5 | Integration | ob_card_type 無 active 紀錄；SM Token | GET /api/v1/assignment/scoring/card-types | HTTP 200；cardTypes=[]（非 404） |
| TC-F069-11 | status='inactive' 紀錄不在預設回傳清單 | BR-1 | Integration | ob_card_type 有 H active 與 Z inactive；SM Token | GET /api/v1/assignment/scoring/card-types（預設不帶 status query） | HTTP 200；cardTypes 中無 cardType='Z'；cardTypes 中有 cardType='H' |
| TC-F069-12 | 未登入回 401 | §5.1 | Integration | 無 Token | GET /api/v1/assignment/scoring/card-types | HTTP 401；errorCode='AUTH_TOKEN_MISSING' |
| TC-F069-13 | 非 Sales Manager 回 403 | §5.1 | Integration | is_sales_manager=false 的有效 Token | GET /api/v1/assignment/scoring/card-types | HTTP 403；errorCode='AUTH_FORBIDDEN' |

### B. Frontend Unit Tests — Tab 1 選中聯動與 UI 元素

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TC-F069-03 | 初始載入自動選中第一列（視覺高亮） | AC-2 | Frontend Unit | stub GET /card-types 回傳 [E, H, M] 三筆（已升冪排序）；cardType context 初始為 null | 渲染 M02 計分設定頁 Tab 1 | 第一列（cardType='E'）有高亮樣式（CSS class 或 aria-selected）；其他列無高亮 |
| TC-F069-04 | 初始選中後 Tab 2~5 傳入正確 cardType props | AC-2 | Frontend Unit | stub 同上；初始選中 'E' | 渲染頁面後讀取 Tab 2~5 組件的 selectedCardType prop | 四個 Tab 的 selectedCardType prop 均為 'E' |
| TC-F069-05 | 點擊另一列觸發 onCardTypeChange、Tab 2~5 reload | AC-3 | Frontend Unit | stub GET /card-types 回傳 [E, H, M]；初始選中 'E' | 點擊 cardType='H' 那列 | 高亮切換至 H 列；onCardTypeChange 被呼叫（spy 確認）；Tab 2~5 的 selectedCardType prop 更新為 'H' |
| TC-F069-06 | PROD_KIND info banner 顯示且含「前往 M06」連結 | AC-4 | Frontend Unit | stub GET /card-types 回傳任意清單 | 渲染 Tab 1 | 頁面含有 banner 元素，文字含「產品類別（PROD_KIND）由 M06 基礎代碼維護管理」；banner 中有 href 指向 M06 路由的連結元素 |
| TC-F069-07 | 每列 prodKind 以 badge 形式顯示 | AC-4 | Frontend Unit | stub GET /card-types 回傳 H（prodKind='01'，prodKindName='汽車'） | 渲染 Tab 1 | H 列中存在 badge 元素，文字含 '01' 與 '汽車' |
| TC-F069-09 | 清單為空時顯示空狀態提示 | AC-5 | Frontend Unit | stub GET /card-types 回傳空陣列 [] | 渲染 Tab 1 | 頁面顯示「目前尚未設定任何計分卡類型」文字；不顯示表格列；「新增計分卡類型」按鈕存在 |
| TC-F069-10 | 月名單分派鎖定時新增 / 編輯 / 停用按鈕 disabled | AC-6 | Frontend Unit | stub GET /card-types 回傳 [H]；stub assignment_run status='running'（或 isLocked=true prop 注入） | 渲染 Tab 1 | 「新增計分卡類型」按鈕 disabled=true；H 列的「編輯」按鈕 disabled=true；H 列的「停用」按鈕 disabled=true；頁面顯示「分派執行中，無法修改計分設定」提示 |

---

## 邊界與例外情境

| ID | 情境 | 預期行為 | 測試類型 |
|----|------|---------|---------|
| BE-F069-001 | prodKind 對應 ob_code_df 紀錄不存在（PROD_KIND 已停用或遺失） | GET 正常回傳，prodKindName=null（鍵存在，值為 null）；UI 顯示「—」 | Integration |
| BE-F069-002 | ob_card_type 有 6 筆正規 CARD_TYPE（H/S/E/S5/E5/M），全數 active | 回傳 6 筆；依升冪排序 E < E5 < H < M < S < S5 | Integration |

---

## 測試資料

### Seed 資料（SQLite in-memory E2E）

```sql
-- ob_code_df（PROD_KIND 啟用紀錄）
INSERT INTO ob_code_df (system_id, tbl_id, tbl_cd, tbl_desc1, stadt, enddt)
VALUES
  ('OB', 'PROD_KIND', '01', '汽車', '20000101', '20991231'),
  ('OB', 'PROD_KIND', '02', '機車', '20000101', '20991231');

-- ob_card_type（三筆，故意打亂插入順序以驗排序）
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
VALUES
  ('M', '機車', '02', 'active', NOW(), 'system', NOW(), 'system'),
  ('H', '期中', '01', 'active', NOW(), 'system', NOW(), 'system'),
  ('S', '中結', '01', 'active', NOW(), 'system', NOW(), 'system');

-- inactive 紀錄（TC-F069-11 用）
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
VALUES
  ('Z', '測試停用', '01', 'inactive', NOW(), 'system', NOW(), 'system');
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
| TC-F069-01、02、08、11、12、13（Integration） | 高 | Supertest + SQLite in-memory；ob_code_df seed 需含 PROD_KIND 啟用紀錄 |
| TC-F069-03~05（Frontend Unit 選中狀態） | 高 | React Testing Library；selectedCardType context 可由 wrapper 注入；spy onCardTypeChange 確認呼叫 |
| TC-F069-06（banner 連結） | 高 | RTL getByText + getByRole('link')；連結 href 格式依路由設計調整 |
| TC-F069-07（badge） | 高 | RTL getByText 搜尋 badge 內容 |
| TC-F069-10（月名單分派鎖定 UI） | 高 | isLocked prop 直接注入；不依賴真實 assignment_run 狀態 |
| BE-F069-001（prodKindName=null） | 高 | seed ob_code_df 不含對應 prod_kind 值，驗證 API 回傳 null |

---

## 相依與風險

| 項目 | 內容 |
|------|------|
| 相依功能 | F001（JWT 驗證）、F068（ob_code_df PROD_KIND 資料來源）、F070/F071/F072（Tab 1 操作按鈕需存在以驗 disabled 狀態） |
| 環境依賴 | SQLite in-memory（E2E）；ob_code_df 需有 PROD_KIND 種子資料 |
| RISK-F069-01 | AC-2「預設選中第一列」為前端 State 初始化行為，純 API 測試無法驗證；必須依賴 Frontend Unit（TC-F069-03）與瀏覽器驗收測試（驗收清單 #3）|
