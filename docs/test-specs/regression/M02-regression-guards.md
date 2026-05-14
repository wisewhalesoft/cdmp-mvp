---
type: test-design-regression-guards
module: M02
module_name: 計分設定（5-Tab）
covers: [F069, F070, F071, F072, F053, F054, F055, F056]
version: 1.0
status: draft
last_updated: 2026-05-14
sources:
  - C:\Users\cacab\.claude\agent-memory\test-designer\MEMORY.md（feedback 段落）
  - docs/test-specs/features/F056-test.md（RISK-F056-01 已關閉）
  - docs/test-specs/features/F072-test.md（TC-F072-19）
---

# M02 Regression Guards — 計分設定模組迴歸防護

> 本文件集中記錄 M02 模組所有「非顯而易見缺陷」的防護測試案例。
> 這些案例源自過去已發現的靜默錯誤（silent bug）或框架限制，
> **必須在每次功能變更後重新執行**，以確認舊有缺陷不復發。
>
> 各 Feature 測試檔末段已引用本文件（見各 feature test spec「迴歸防護參考」節）。

---

## 目錄

| Guard ID | 分類 | 說明 | 受影響 Feature |
|----------|------|------|----------------|
| TC-GUARD-NULL-PK-001 | TypeORM NULL PK | ob_tier Fallback 列（card_level=NULL）刪除靜默失敗 | F072, F056 |
| TC-GUARD-NULL-PK-002 | TypeORM NULL PK | 六步驟 Cascade Delete 含 Fallback 列完整性 | F072 |
| TC-GUARD-TIMESTAMP-001 | TypeORM Column Type | ob_card_type entity 日期欄位 type helper 驗證 | F070, F071 |
| TC-GUARD-RUN-SEED-001 | E2E Seed | AssignmentRun SQLite NOT NULL 四必填欄位 | F055, F056, F070, F072 |
| TC-GUARD-ERRORCODE-001 | 錯誤碼一致性 | fs + regex 掃描確認錯誤碼 rename 無殘留 | F069~F072 |
| TC-GUARD-GUARD-001 | SalesManagerGuard | F069~F072 全端點 403 覆蓋矩陣 | F069, F070, F071, F072 |

---

## Guard 1：TypeORM NULL PK 刪除靜默失敗

### TC-GUARD-NULL-PK-001

**分類**：Unit / Integration — TypeORM 行為防護
**引發原因**：`repo.delete({ card_level: null })` 產生 SQL `WHERE card_level = NULL`，在 SQL 語義中永不匹配（NULL ≠ NULL），導致刪除靜默成功（影響 0 列）。

**受影響場景**：F056 ob_tier Fallback 列（`card_level IS NULL, tier_level='T2'` 等）；F072 六步驟 Cascade Delete 第一步須刪除 ob_tier（含 Fallback 列）。

**前置條件**：

```sql
-- 建立測試用 ob_card_type
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status)
VALUES ('XTEST', 'Test Card', 'P01', 'active');

-- 建立 Fallback 列（card_level IS NULL）
INSERT INTO ob_tier (card_type, card_level, tier_level)
VALUES ('XTEST', NULL, 'T2');

-- 建立 Standard 列（card_level IS NOT NULL）
INSERT INTO ob_tier (card_type, card_level, tier_level)
VALUES ('XTEST', 'A', 'T5');
```

**步驟（描述用途，非程式碼）**：

1. 以 SalesManager Token 呼叫 `DELETE /api/v1/assignment/card-types/XTEST`
2. 驗證 HTTP 狀態碼為 200（或 204）
3. 查詢 `ob_tier WHERE card_type='XTEST'` → 期望回傳 **0 筆**
4. 若回傳 1 筆（card_level IS NULL 列殘留），表示服務使用 `repo.delete({card_level: null})` 而非 `repo.remove(entity)` — **缺陷復發**

**預期結果**：`ob_tier WHERE card_type='XTEST'` 回傳 0 筆（Standard + Fallback 均已刪除）。

**失敗判定**：ob_tier 殘留任何 card_type='XTEST' 的列。

**修正指引**：服務層刪除含 NULL PK 欄位的列，必須先 `repo.findOneBy(...)` 取得 entity 物件，再呼叫 `repo.remove(entity)`，不可使用 `repo.delete({card_level: null})`。

---

### TC-GUARD-NULL-PK-002

**分類**：Integration — 六步驟 Cascade Delete 完整性
**引發原因**：TC-GUARD-NULL-PK-001 的延伸。若六步驟 Cascade Delete 中，第一步刪除 ob_tier Fallback 列失敗但靜默，後續步驟仍繼續執行，最終 ob_card_type 被刪除，但 ob_tier 有孤立列（orphan row）—— FK constraint 因 on delete cascade 可能已不阻擋，導致資料不一致。

**前置條件**（完整 Cascade 生態，參考 F072 IT-CASCADE-001 seed）：

```sql
INSERT INTO ob_card_type (card_type, card_name, prod_kind, status) VALUES ('YTEST', 'Guard Test', 'P01', 'active');
INSERT INTO ob_levelcard_version (card_type, version, sdate, edate, status) VALUES ('YTEST', 1, '2026-01-01', NULL, 'active');
INSERT INTO ob_levelcard_column (card_type, version, col_seq, col_name) VALUES ('YTEST', 1, 1, 'Card Level');
INSERT INTO ob_levelcard_level (card_type, version, card_level, card_level_name) VALUES ('YTEST', 1, 'A', 'Level A');
INSERT INTO ob_levelcard_score (card_type, version, card_level, col_seq, score) VALUES ('YTEST', 1, 'A', 1, 100);
-- Fallback tier 列（card_level IS NULL）
INSERT INTO ob_tier (card_type, card_level, tier_level) VALUES ('YTEST', NULL, 'T3');
-- Standard tier 列
INSERT INTO ob_tier (card_type, card_level, tier_level) VALUES ('YTEST', 'A', 'T5');
```

**步驟**：

1. 呼叫 `DELETE /api/v1/assignment/card-types/YTEST`
2. 驗證 HTTP 狀態碼為 200（或 204）
3. 查詢以下 6 個資料表，每個均應回傳 **0 筆**：
   - `SELECT COUNT(*) FROM ob_tier WHERE card_type='YTEST'`
   - `SELECT COUNT(*) FROM ob_levelcard_score WHERE card_type='YTEST'`
   - `SELECT COUNT(*) FROM ob_levelcard_level WHERE card_type='YTEST'`
   - `SELECT COUNT(*) FROM ob_levelcard_column WHERE card_type='YTEST'`
   - `SELECT COUNT(*) FROM ob_levelcard_version WHERE card_type='YTEST'`
   - `SELECT COUNT(*) FROM ob_card_type WHERE card_type='YTEST'`
4. 任一資料表 COUNT > 0 均視為缺陷

**預期結果**：6 個資料表各回傳 0 筆；HTTP 200。

**失敗判定**：ob_tier 殘留 NULL card_level 列，或任一中間表有孤立列。

---

## Guard 2：TypeORM 日期欄位 Column Type Helper

### TC-GUARD-TIMESTAMP-001

**分類**：Unit — Entity 設定驗證
**引發原因**：TypeORM 在 PostgreSQL 環境下不支援 `datetime` column type，必須使用 `timestamp`。若開發者硬寫 `type: 'datetime'`，在 SQLite E2E 測試中可能正常（SQLite 接受 datetime），但在 PostgreSQL 生產環境啟動時噴錯。  
**正確做法**：使用 `dateColumnType()` helper（根據 `DB_TYPE` 環境變數自動回傳 `'timestamp'` 或 `'datetime'`）。

**驗證目標**：`ob_card_type` entity 檔案中，`created_at`、`updated_at` 欄位使用 `dateColumnType()` helper，而非硬編碼字串。

**步驟**：

1. 讀取 `apps/api/src/` 下對應 ob_card_type 的 TypeORM entity 檔案（例如 `ob-card-type.entity.ts`）
2. 確認 `created_at` 欄位的 `@Column` 裝飾器中，`type` 屬性值為 `dateColumnType()` 函式呼叫，而非字串 `'datetime'` 或 `'timestamp'`
3. 確認 `updated_at` 欄位同上
4. 確認 `dateColumnType` 已從正確路徑匯入（通常為 `../../common/utils/db-column-types`）

**預期結果**：兩個日期欄位均透過 helper 函式動態決定型別，無硬編碼 `'datetime'`。

**失敗判定**：entity 檔案中出現 `type: 'datetime'`（字串字面量）。

**自動化建議**：可在 CI 中以正規表達式掃描 entity 檔案：
```
pattern: column\(\{.*type:\s*['"]datetime['"]
glob: apps/api/src/**/*.entity.ts
期望：0 筆符合
```

---

## Guard 3：AssignmentRun E2E Seed 四必填欄位

### TC-GUARD-RUN-SEED-001

**分類**：E2E Seed 設定防護
**引發原因**：SQLite in-memory 模式下（`better-sqlite3 + synchronize: true`），若 AssignmentRun 的 E2E seed INSERT 缺少任一 NOT NULL 欄位，SQLite 拋出 `SQLITE_CONSTRAINT: NOT NULL constraint failed`，整個測試套件 crash，且錯誤訊息不直接指向哪個欄位缺失，排查成本高。

**四個 NOT NULL 必填欄位**：

| 欄位名 | 型別 | 說明 |
|--------|------|------|
| `run_id` | VARCHAR / UUID | 執行批次識別碼，不可為 NULL |
| `project_workym` | VARCHAR | 期別（格式 YYYYMM），不可為 NULL |
| `triggered_by` | VARCHAR | 觸發者（'manual' 或 'schedule'），不可為 NULL |
| `created_at` | TIMESTAMP | 建立時間，不可為 NULL（TypeORM default 不在 SQLite 生效） |

**驗證步驟**：

1. 在所有涉及 AssignmentRun 的 E2E 測試中（F055 §A.鎖定、F056 §E.鎖定、F070 §rollback 前置、F072 §刪除鎖定），檢查 seed SQL 是否明確提供上述四欄位的非 NULL 值
2. 特別確認 `created_at` 有明確賦值（例如 `new Date()` 或 ISO 字串），而非依賴 TypeORM default
3. 若發現 seed 缺少任一欄位，補上後重新執行測試

**正確 seed 範例**（描述意圖，非可執行程式碼）：

```
AssignmentRunRepo.save({
  run_id: 'guard-run-001',
  project_workym: '202601',
  triggered_by: 'manual',
  created_at: new Date('2026-01-15T08:00:00Z'),
  status: 'running'
})
```

**預期結果**：所有含 AssignmentRun seed 的 E2E 測試套件正常初始化，無 SQLite NOT NULL 錯誤。

**失敗判定**：測試輸出含 `NOT NULL constraint failed: assignment_run.*` 訊息。

---

## Guard 4：錯誤碼一致性 fs + regex 掃描

### TC-GUARD-ERRORCODE-001

**分類**：Static Analysis / Build-time 防護
**引發原因**：過去發生錯誤碼 rename 後（例如將 `SCORING_VERSION_LOCKED` 拆分為 `SCORING_VERSION_LOCKED` 與 `ASSIGNMENT_RUN_ALREADY_RUNNING`），部分引用點未同步更新，但 Grep tool 的負向 lookahead regex 行為不穩定，導致殘留舊錯誤碼未被偵測。
**正確驗證方式**：使用 Node.js fs + regex 逐檔掃描，並撰寫 regression guard test 明確斷言舊錯誤碼不存在。

**M02 相關錯誤碼清單**：

| 錯誤碼 | 所屬 Feature | 正確使用位置 |
|--------|-------------|-------------|
| `CARD_TYPE_NOT_FOUND` | F069~F072 | 所有需要 cardType 參數的端點 |
| `CARD_TYPE_ALREADY_EXISTS` | F070 | POST /card-types 重複建立時 |
| `CARD_TYPE_HAS_ACTIVE_RUNS` | F072 | DELETE 時有執行中 run |
| `CARD_TYPE_DISABLED` | F071 | PUT 嘗試編輯已停用 card_type |
| `SCORING_VERSION_LOCKED` | F054, F055 | 計分版本被鎖定（非 run 問題） |
| `ASSIGNMENT_RUN_ALREADY_RUNNING` | F055, F056 | AssignmentRun 進行中導致鎖定 |
| `TIER_LEVEL_INVALID` | F056 | tierLevel 不在 T1~T10 白名單 |
| `TIER_MUTEX_VIOLATION` | F056 | Fallback/Standard 互斥違反 |

**舊錯誤碼（已廢棄，不應再出現）**：

| 廢棄錯誤碼 | 替代碼 | 廢棄原因 |
|-----------|--------|---------|
| `CARD_TYPE_NOT_EXISTS` | `CARD_TYPE_NOT_FOUND` | 統一命名慣例 |
| `VERSION_LOCKED` | `SCORING_VERSION_LOCKED` | 加上模組前綴 |
| `RUN_IN_PROGRESS` | `ASSIGNMENT_RUN_ALREADY_RUNNING` | 語意更精確 |

**驗證步驟**：

1. 以 fs 遞迴掃描 `apps/api/src/` 與 `apps/api/test/` 下所有 `.ts` 檔案
2. 對每個廢棄錯誤碼字串執行全文字比對（包含帶引號的 `'CARD_TYPE_NOT_EXISTS'` 及 `"CARD_TYPE_NOT_EXISTS"`）
3. 期望每個廢棄錯誤碼的符合數為 **0**
4. 同時驗證每個有效錯誤碼至少在 `error-codes.ts`（或等效定義檔）出現 **1 次**

**預期結果**：廢棄錯誤碼 0 符合；有效錯誤碼定義存在。

**失敗判定**：廢棄錯誤碼仍存在於任何 `.ts` 檔案中。

**實作建議**：此掃描邏輯應加入 `apps/api/test/regression/error-code-consistency.spec.ts`，作為獨立 spec 執行，不依賴 Grep CLI 工具。

---

## Guard 5：SalesManagerGuard 端點覆蓋矩陣

### TC-GUARD-GUARD-001

**分類**：Integration — 授權防護
**引發原因**：E07 模組所有計分設定端點（F053~F056, F069~F072）均需 SalesManager 以上權限。若 Controller 裝飾器缺少 `@RequireSalesManager()` 或未套用 `SalesManagerGuard`，一般 User Token 可繞過授權直接操作計分設定，造成安全漏洞。

**授權規則**：
- `SalesManager` 角色：可讀取 + 寫入所有計分設定端點
- `User`（無 SalesManager 角色）：呼叫任何端點均應收到 HTTP 403 `AUTH_FORBIDDEN`

**端點覆蓋矩陣**：

| 端點 | Method | Feature | SM Token | User Token |
|------|--------|---------|----------|-----------|
| `/assignment/card-types` | GET | F069 | 200 | 403 |
| `/assignment/card-types` | POST | F070 | 201 | 403 |
| `/assignment/card-types/:cardType` | PUT | F071 | 200 | 403 |
| `/assignment/card-types/:cardType/delete-preview` | GET | F072 | 200 | 403 |
| `/assignment/card-types/:cardType` | DELETE | F072 | 200/204 | 403 |
| `/assignment/scoring/dimensions` | GET | F053 | 200 | 403 |
| `/assignment/scoring/dimensions` | PUT | F054 | 200 | 403 |
| `/assignment/scoring/dimensions` | POST | F054 | 201 | 403 |
| `/assignment/scoring/card-level/:cardType` | DELETE | F055 | 200/204 | 403 |
| `/assignment/scoring/tier-mapping` | GET | F056 | 200 | 403 |
| `/assignment/scoring/tier-mapping` | POST | F056 | 201 | 403 |
| `/assignment/scoring/tier-mapping/:id` | PUT | F056 | 200 | 403 |
| `/assignment/scoring/tier-mapping/:id` | DELETE | F056 | 200/204 | 403 |

**前置條件**：

```
SM_TOKEN: SalesManager 角色的有效 JWT
USER_TOKEN: 無 SalesManager 角色的一般 User JWT
```

**驗證步驟（逐端點）**：

1. 以 USER_TOKEN 呼叫上述矩陣中每個端點
2. 驗證每次回應均為 HTTP 403，response body 含 `errorCode: 'AUTH_FORBIDDEN'`
3. 以 SM_TOKEN 呼叫同一端點（攜帶最小合法 body），驗證為非 403 的成功/業務錯誤回應

**預期結果**：13 個端點 × User Token = 13 個 HTTP 403；SM Token 均可正常進入業務邏輯。

**失敗判定**：User Token 收到非 403 回應（例如 200 或 404），表示 Guard 缺失或設定錯誤。

**實作建議**：可統一寫成一個 table-driven test loop，使用共同 `USER_TOKEN` 常數，迭代 13 個端點組合，減少重複程式碼。

---

## 執行優先順序

依缺陷嚴重度排列，建議執行順序如下：

| 優先 | Guard ID | 嚴重度 | 理由 |
|------|----------|--------|------|
| 1 | TC-GUARD-NULL-PK-001 | Critical | 靜默刪除失敗，資料不一致，無任何錯誤訊息 |
| 2 | TC-GUARD-NULL-PK-002 | Critical | Cascade Delete 完整性，生產資料可能孤立 |
| 3 | TC-GUARD-GUARD-001 | High | 授權漏洞，一般用戶可操作計分設定 |
| 4 | TC-GUARD-ERRORCODE-001 | Medium | 錯誤碼不一致，前後端溝通斷裂 |
| 5 | TC-GUARD-TIMESTAMP-001 | Medium | 生產啟動失敗，但 E2E 測試可能正常（遮蔽缺陷） |
| 6 | TC-GUARD-RUN-SEED-001 | Low | 僅影響測試環境，不影響生產 |

---

## 相關文件參照

- `docs/test-specs/features/F069-test.md` §風險 → RISK-F069-01
- `docs/test-specs/features/F070-test.md` §風險 → RISK-F070-01
- `docs/test-specs/features/F072-test.md` §TC-F072-19（NULL PK 防護設計說明）
- `docs/test-specs/features/F056-test.md` §H（Fallback/Standard Mutex，RISK-F056-01 已關閉）
- `docs/test-specs/integration/M02-cross-spec-tests.md` §IT-CASCADE-001/002
- `C:\Users\cacab\.claude\agent-memory\test-designer\MEMORY.md` — feedback_typeorm_null_pk_delete, feedback_typeorm_timestamp, feedback_assignment_run_e2e_seed, feedback_grep_negative_lookahead, feedback_e07_controllers_use_sales_manager_guard
