---
type: test-design-integration
scope: M02 計分設定（F069~F072 + F053~F056）
priority: P0-MVP
related_specs:
  - /docs/specs/features/F069-view-card-type-list.md
  - /docs/specs/features/F070-create-card-type.md
  - /docs/specs/features/F071-edit-card-type.md
  - /docs/specs/features/F072-disable-card-type.md
  - /docs/specs/features/F053-view-scoring-dimensions.md
  - /docs/specs/features/F054-edit-scoring-dimension.md
  - /docs/specs/features/F055-edit-card-level-thresholds.md
  - /docs/specs/features/F056-edit-tier-mapping.md
last_updated: 2026-05-14
---

# M02 計分設定 — 跨 Spec 整合測試

本文件涵蓋 M02 計分設定模組中跨越多個 Feature 邊界的整合測試場景，包含：

1. **IT-CASCADE** — CARD_TYPE 級聯刪除完整驗證（F072）
2. **IT-TAB-LINKAGE** — 5 Tab 聯動測試（F069 → F053/054/055/056）
3. **IT-LOCK** — 月名單分派鎖跨 Endpoint 一致性（F069~F072 + F053~F056）
4. **IT-MIGRATION** — Migration 冪等性與 TIER 後綴值遷移驗證

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + 對應 Feature 的個別 test spec + `architecture-spec.md` §E07-G（Migration 設計） |
| QA / Tester | 本文件 + `test-levels.md` |

---

## IT-CASCADE：CARD_TYPE 級聯刪除完整驗證

### IT-CASCADE-001：完整六步驟 Transaction 筆數驗證

| 項目 | 內容 |
|------|------|
| 關聯 spec | F072 AC-1 / AC-3 / AC-4 / BR-3 / BR-6 |
| 測試類型 | Integration（Supertest + SQLite in-memory，部分場景需 PostgreSQL） |

**前置 seed（完整 CARD_TYPE X 生態）**

```sql
-- ob_card_type
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
VALUES ('X', '測試停用卡', '01', 'active', NOW(), 'system', NOW(), 'system');

-- ob_levelcard_version（1 筆）
INSERT INTO ob_levelcard_version (card_type, card_name, card_version, sdate, edate, status)
VALUES ('X', '測試版本', 1, '20260514', '20991231', 'active');

-- ob_levelcard_column（3 筆）
-- ob_levelcard_score（6 筆）
-- ob_levelcard_level（4 筆）
-- ob_tier（2 筆：X/A→T1 Standard + X/null→T2 Fallback）
-- ob_list_definition（2 筆 active，card_type='X'）
-- ob_pool_data_list（5 筆歷史；本表不含 card_type 欄位，seed 不需指定 card_type，僅以 list_no 等 PK 區分）
-- （詳細 INSERT 見 F072-test.md seed 資料段）
```

**步驟 1：驗 delete-preview 筆數**

| 步驟 | 預期 |
|------|------|
| GET /api/v1/assignment/scoring/card-types/X/delete-preview | HTTP 200 |
| cascade.versions | 1 |
| cascade.columns | 3 |
| cascade.scores | 6 |
| cascade.levels | 4 |
| cascade.tierMappings | 2（含 Fallback card_level=null 1 筆） |
| listDefinitionsAffected | 2 |

**步驟 2：執行級聯刪除**

| 步驟 | 預期 |
|------|------|
| DELETE /card-types/X?confirmCascade=true | HTTP 200 |
| deletedCascade 各欄位 | 符合 step 1 count |

**步驟 3：後驗各表筆數**

| 表名 | 驗證條件 | 預期 COUNT |
|------|---------|-----------|
| ob_tier WHERE card_type='X' | 含 card_level=null | 0 |
| ob_levelcard_score WHERE card_type='X' | — | 0 |
| ob_levelcard_level WHERE card_type='X' | — | 0 |
| ob_levelcard_column WHERE card_type='X' | — | 0 |
| ob_levelcard_version WHERE card_type='X' | — | 0 |
| ob_card_type WHERE card_type='X' | — | 0 |
| ob_pool_data_list 全表 COUNT(*) | 歷史保留（前後不變；本表不含 card_type 欄位，無法以 card_type 篩選） | 5 |
| ob_list_definition WHERE card_type='X' | 警告但保留 | 2 |

**步驟 4：驗 audit_log**

| 欄位 | 預期值 |
|------|-------|
| action | 'DELETE' |
| entity_type | 'ob_card_type' |
| entity_id | 'X' |
| before_value | 含 versions=1、columns=3、scores=6、levels=4、tierMappings=2、listDefinitionsAffected=2 |
| after_value | null |

---

### IT-CASCADE-002：Transaction Rollback 守護

| 項目 | 內容 |
|------|------|
| 關聯 spec | F072 AC-3、BR-6 |
| 測試類型 | Integration（需 PostgreSQL Test Container，SQLite savepoint 行為待確認） |

**前提**：測試環境攔截 CardTypeCascadeService 中 step 5（ob_levelcard_version DELETE）拋出異常（如 throw new Error('simulated failure')）。

**驗證點**：

| 後驗項目 | 預期 |
|---------|------|
| API 回傳 | HTTP 500（或 503，依實作） |
| ob_tier WHERE card_type='X' COUNT | 2（rollback 還原） |
| ob_levelcard_column WHERE card_type='X' COUNT | 3（rollback 還原） |
| ob_card_type WHERE card_type='X' COUNT | 1（rollback 還原） |
| assignment_audit_log 有無新 action='DELETE' | 無（rollback 確保 audit 也不寫入） |

---

## IT-TAB-LINKAGE：5 Tab 聯動測試

### IT-TAB-001：Tab 1 切換 CARD_TYPE，Tab 2 自動刷新

| 項目 | 內容 |
|------|------|
| 關聯 spec | F069 AC-3、F053 AC-4 |
| 測試類型 | Frontend Unit（React Testing Library） |

**Given**：stub GET /card-types 回傳 [H, S]；stub GET /dimensions?cardType=H 回傳 H 的維度；stub GET /dimensions?cardType=S 回傳 S 的維度；初始 selectedCardType='H'。

**When**：在 Tab 1 點擊 S 列（觸發 onCardTypeChange('S')）。

**Then**：
- selectedCardType context 更新為 'S'
- GET /dimensions?cardType=S 被呼叫（spy 確認）
- Tab 2 顯示 S 的維度資料（舊 H 資料清空）

---

### IT-TAB-002：F072 停用當前選中 CARD_TYPE 後 Tab 2~5 清空

| 項目 | 內容 |
|------|------|
| 關聯 spec | F072 AC-6、F069 AC-3 |
| 測試類型 | Frontend Unit（React Testing Library） |

**Given**：selectedCardType='H'；Tab 2~5 均顯示 H 型資料；stub DELETE /card-types/H 回傳 HTTP 200。

**When**：停用 H 操作完成後（DELETE 回傳 200）。

**Then**：
- selectedCardType 清除為 null
- Tab 2~5 均顯示空狀態提示：「請選擇計分卡類型以查看設定」
- 不自動選中其他 CARD_TYPE

---

### IT-TAB-003：F070 新增 CARD_TYPE 後 Tab 2 顯示空維度狀態

| 項目 | 內容 |
|------|------|
| 關聯 spec | F070 AC-3、F053 AC-5 |
| 測試類型 | Integration（Supertest）+ Frontend Unit |

**Given**：POST /card-types 成功新增 X1；v1 空白版本自動建立；stub GET /dimensions?cardType=X1 回傳 dimensions=[]。

**When**：前端切換至 Tab 2（selectedCardType='X1'）。

**Then**：
- GET /dimensions?cardType=X1 被呼叫
- Tab 2 顯示「目前無計分維度，請點擊『新增維度』開始設定」空狀態提示
- 不顯示錯誤訊息（非 404）

---

## IT-LOCK：月名單分派鎖跨 Endpoint 一致性

### IT-LOCK-001：月名單分派 running 時所有寫入端點一致回 409

| 項目 | 內容 |
|------|------|
| 關聯 spec | F070 AC-6、F071 AC-7、F072 AC-8、F054 AC-5、F055 AC-4、F056 AC-5 |
| 測試類型 | Integration |

**前置**：seed AssignmentRun（run_id='lock-test', project_workym='202604', triggered_by='u1', created_at=NOW(), status='running'）；ob_card_type(H active)。

**端點一覽表**（每個端點各設計一個獨立 TC，共 9 個）：

| Endpoint | Method | 預期錯誤碼 | 備注 |
|----------|--------|-----------|------|
| POST /card-types | POST | ASSIGNMENT_RUN_ALREADY_RUNNING | F070 |
| PUT /card-types/H | PUT | ASSIGNMENT_RUN_ALREADY_RUNNING | F071 |
| DELETE /card-types/H?confirmCascade=true | DELETE | ASSIGNMENT_RUN_ALREADY_RUNNING | F072 |
| PUT /dimensions?cardType=H | PUT | SCORING_VERSION_LOCKED | F054 |
| POST /dimensions?cardType=H | POST | SCORING_VERSION_LOCKED | F054 |
| PUT /card-levels?cardType=H | PUT | SCORING_VERSION_LOCKED | F055 |
| DELETE /card-levels/A?cardType=H | DELETE | SCORING_VERSION_LOCKED | F055 |
| PUT /tier-mapping?cardType=H | PUT | SCORING_VERSION_LOCKED | F056 |
| POST /tier-mapping | POST | SCORING_VERSION_LOCKED | F056 |
| DELETE /tier-mapping?cardType=H&cardLevel=A | DELETE | SCORING_VERSION_LOCKED | F056 |

**重要注意**：F069~F072（CARD_TYPE CRUD）回傳 `ASSIGNMENT_RUN_ALREADY_RUNNING`；F053~F056（Tab 2~5 計分設定寫入）回傳 `SCORING_VERSION_LOCKED`。此差異為預期行為，需明確驗證。

---

## IT-MIGRATION：Migration 冪等性與 TIER 後綴值遷移

### IT-MIGRATION-001：D-CT-01/02/03 Migration 冪等性

| 項目 | 內容 |
|------|------|
| 關聯 spec | `architecture-spec.md` §E07-G（D-CT-01/02/03） |
| 測試類型 | Integration（需 Test Container PostgreSQL 執行 real migration） |

| Migration | 驗證方式 | 通過標準 |
|-----------|---------|---------|
| D-CT-01（ob_card_type 建表）| 執行兩次 migration | 第二次執行不拋 AlreadyExists 或 duplicate table error |
| D-CT-01（6 筆 seed INSERT ON CONFLICT DO NOTHING）| 執行兩次 seed | ob_card_type 仍為 6 筆（H/S/E/S5/E5/M），無重複 |
| D-CT-02（ob_tier PK 補建）| 執行兩次 migration | 第二次執行不拋 duplicate constraint error；驗 `(card_type, card_level)` UNIQUE constraint 存在 |
| D-CT-03（OBTIER → ob_tier 遷移）| 執行後查詢 ob_tier | ob_tier 中不含 HM / M3 / HC / C3 / M5 的 card_type 值（BR-6：遷移範圍限 6 個正規 CARD_TYPE） |

---

### IT-MIGRATION-002：TIER 後綴值遷移冪等性（BR-12）

| 項目 | 內容 |
|------|------|
| 關聯 spec | F056 BR-12（TIER 遷移規則，v1.5） |
| 測試類型 | Integration（需 PostgreSQL；SQLite 替代方案見下方注意） |

以下為逐條驗證（遷移腳本執行後）：

| 輸入值（遷移前） | 預期輸出（遷移後） | 冪等性要求 |
|----------------|----------------|-----------|
| T1M | T1 | 二次執行後仍為 T1（非 TT1 或 T1M） |
| T1HM | T1 | 同上 |
| T2HM | T2 | 同上 |
| T3M | T3 | 同上 |
| T3HM | T3 | 同上 |
| T3C | T3 | 同上 |
| T32 | T3 | 同上 |
| T4M | T4 | 同上 |
| T51 | T5 | 同上 |
| T52 | T5 | 同上 |
| T5M | T5 | 同上 |
| THC | T1（OQ新-2 決議：HC 為汽車 high-credit 最高層級） | 同上 |
| T1（已在列舉內） | T1（不改） | 二次執行不影響已正確值 |

> **SQLite 替代方案**：若無法使用 PostgreSQL Test Container，改用 Node.js 測試直接呼叫遷移腳本的轉換函式（純 JS 邏輯，不依賴 DB）。詳見 RISK-MIGRATION-01。

---

### IT-MIGRATION-003：D11 驗證 SQL — 遷移後所有 TIER_LEVEL 值符合 T1~T10

| 項目 | 內容 |
|------|------|
| 關聯 spec | F056 BR-12、`architecture-spec.md` §E07-G（D11 驗證 SQL） |
| 測試類型 | Integration（PostgreSQL Test Container） |

**驗證 SQL**：

```sql
SELECT COUNT(*) AS non_conforming
FROM ob_tier
WHERE tier_level NOT IN ('T1','T2','T3','T4','T5','T6','T7','T8','T9','T10');
```

**預期結果**：non_conforming = 0。

若非零，表示遷移腳本有遺漏項目，需阻止上線並修正遷移邏輯。

**SQLite 替代方案（RISK-MIGRATION-01）**：

若 CI 環境無 PostgreSQL，改用以下 Node.js 驗證：

```typescript
// 從 ob_tier 讀取所有 tier_level 值
const VALID_TIERS = new Set(['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10']);
const allValues = await tierRepo.find().then(rows => rows.map(r => r.tier_level));
const invalid = allValues.filter(v => !VALID_TIERS.has(v));
expect(invalid).toHaveLength(0); // 確認無非法值
```
