---
type: test-design-regression-guards
module: M06
module_name: 篩選欄位管理（POOLDATA 白名單）
covers: [F075]
version: 1.0
status: draft
last_updated: 2026-05-18
sources:
  - C:\Users\cacab\.claude\agent-memory\test-designer\MEMORY.md（feedback_tdd_naming_drift / feedback_grep_negative_lookahead）
  - docs/test-specs/features/F075-test.md（Glossary 節 + RISK-F075-002/004）
  - docs/specs/features/F075-manage-pooldata-field-whitelist.md v1.4（§13 變更紀錄 v1.4 附帶清理）
---

# M06 Regression Guards — 篩選欄位管理模組迴歸防護

> 本文件集中記錄 M06 模組所有「非顯而易見缺陷」的防護測試案例。
> 這些案例源自 v1.4 命名標準化過程中發現的識別符漂移風險，
> **必須在每次功能變更（spec 修改、prototype 更新、src 重構）後重新執行**，
> 以確認關鍵識別符未被靜默改名或舊命名殘留。
>
> 各 Feature 測試檔末段已引用本文件（見 F075-test.md §七「迴歸防護參考」節）。

---

## 目錄

| Guard ID | 分類 | 說明 | 受影響 Feature |
|----------|------|------|----------------|
| TC-GUARD-M06-NAMING-001 | 命名存在性 | spec + prototype 關鍵字出現次數驗證（正向掃描） | F075 |
| TC-GUARD-M06-NAMING-002 | 命名漂移 | source code 禁用識別符不得存在（負向掃描） | F075 |

---

## Guard 1：Spec 與 Prototype 關鍵字存在性掃描

### TC-GUARD-M06-NAMING-001

**分類**：Static Analysis / Build-time 防護
**引發原因**：F075 v1.4 進行 UI 命名標準化（「白名單管理」→「篩選欄位管理」、「新增白名單欄位」→「新增篩選欄位」），同時新增 `available-columns` 端點與 `suggestedFieldType` 等識別符。若未來 PR 不慎在 spec 文件或 prototype 中改名，下游實作將採用錯誤命名，造成前後端不一致。

**根本原因（feedback_tdd_naming_drift）**：多 agent TDD 流程中，下游 agent 容易擅自改識別符名稱（如 `suggestedFieldType` → `inferredType`）；必須加靜態掃描 + regex 驗證防護，不可僅靠 Grep CLI（feedback_grep_negative_lookahead 指出 Grep tool 負向 lookahead 行為不穩定）。

**驗證目標 A — `F075-manage-pooldata-field-whitelist.md` 關鍵字存在性**：

讀取路徑：`docs/specs/features/F075-manage-pooldata-field-whitelist.md`

| 驗證項目 | 正規表達式 | 最少出現次數 | 說明 |
|---------|------------|------------|------|
| UI 命名「篩選欄位管理」 | `/篩選欄位管理/g` | ≥ 5 | 頁面 H1 / breadcrumb / sidebar 等均使用此名稱 |
| Modal 標題「新增篩選欄位」 | `/新增篩選欄位/g` | ≥ 3 | Modal 標題規範 |
| API path `available-columns` | `/available-columns/g` | ≥ 5 | §5.5 端點定義 |
| response key `suggestedFieldType` | `/suggestedFieldType/g` | ≥ 5 | response schema |
| response root key `availableColumns` | `/availableColumns/g` | ≥ 3 | response root key |
| service method `getAvailableColumns` | `/getAvailableColumns/g` | ≥ 2 | service 職責描述 |
| private method `_inferSuggestedFieldType` | `/_inferSuggestedFieldType/g` | ≥ 2 | architecture-spec 決策描述 |

**驗證目標 B — `prototypes/37a-pooldata-whitelist.html` 禁用字串不存在**：

讀取路徑：`prototypes/37a-pooldata-whitelist.html`

> v1.4 附帶清理（F075 spec §13 v1.4 第 8 點）：prototype L187 + FE footer L409 之 `WHITELIST_FIELD_DUPLICATE` 字串應已修正為 `POOLDATA_FIELD_DUPLICATE`。

| 禁用字串 | 說明 | 預期 |
|---------|------|------|
| `白名單管理` | v1.4 前 UI 舊命名（頁面標題等） | 出現次數 = 0 |
| `新增白名單欄位` | v1.4 前 Modal 標題舊命名 | 出現次數 = 0 |
| `新增 POOLDATA 欄位` | 另一種舊命名變體 | 出現次數 = 0 |
| `WHITELIST_FIELD_DUPLICATE` | v1.4 前錯誤碼舊命名（已修正為 `POOLDATA_FIELD_DUPLICATE`） | 出現次數 = 0 |

**步驟（描述用途，非可執行程式碼）**：

1. 以 Node.js `fs.readFileSync('docs/specs/features/F075-manage-pooldata-field-whitelist.md', 'utf-8')` 讀取 spec 文件
2. 對驗證目標 A 每一列，執行 `(content.match(pattern) || []).length >= minCount`，斷言為 true
3. 以 `fs.readFileSync('prototypes/37a-pooldata-whitelist.html', 'utf-8')` 讀取 prototype
4. 對驗證目標 B 每一列，執行 `content.includes(forbiddenString)` 斷言為 false

**預期結果**：

- 驗證目標 A：7 個關鍵字各符合最低出現次數
- 驗證目標 B：4 個禁用字串出現次數均為 0

**失敗判定**：

- 任一關鍵字出現次數低於閾值 → spec 文件可能被改名，需檢查最近 PR
- 任一禁用字串出現次數 > 0 → v1.4 附帶清理未完成，或有 PR 不慎還原舊命名

**自動化建議**：

此掃描邏輯應加入 `test/regression/M06-naming.regression.spec.ts`（或 `apps/api/test/regression/M06-naming.regression.spec.ts`），作為獨立 spec 執行，不依賴 Grep CLI 工具。使用 `fs` + `RegExp.exec` 逐字計數，確保統計行為一致。

---

## Guard 2：Source Code 禁用識別符掃描

### TC-GUARD-M06-NAMING-002

**分類**：Static Analysis / Build-time 防護
**引發原因**：即使 spec 文件命名正確，實作端仍可能引入舊命名或不正確的別名。本 Guard 掃描 `src/` 下所有 `.ts` 與 `.tsx` 檔案，確認禁用識別符不存在。

**禁用識別符清單（src/ 掃描目標）**：

| 禁用識別符 | 應替換為 | 說明 |
|-----------|---------|------|
| `WHITELIST_FIELD_DUPLICATE` | `POOLDATA_FIELD_DUPLICATE` | 舊錯誤碼字串，v1.4 附帶清理已修正 |
| `candidateColumns` | `availableColumns` | 禁止使用的 response key 別名 |
| `sourceColumns` | `availableColumns` | 禁止使用的 response key 別名 |
| `poolColumns` | `availableColumns` | 禁止使用的 response key 別名 |
| `recommendedType` | `suggestedFieldType` | 禁止使用的 property 別名 |
| `inferredType` | `suggestedFieldType` | 禁止使用的 property 別名 |
| `autoType` | `suggestedFieldType` | 禁止使用的 property 別名 |
| `guessedType` | `suggestedFieldType` | 禁止使用的 property 別名 |
| `getAvailableFields` | `getAvailableColumns` | 禁止使用的 service method 別名 |
| `inferFieldType` | `_inferSuggestedFieldType` | 禁止使用的 private method 別名 |

**掃描範圍**：`src/**/*.ts`、`src/**/*.tsx`（遞迴掃描所有前後端原始碼）

**步驟**：

1. 以 Node.js `glob.sync('src/**/*.{ts,tsx}')` 取得所有目標檔案路徑
2. 逐一讀取每個檔案內容
3. 對每個禁用識別符，統計在所有檔案中的總出現次數
4. 斷言每個禁用識別符的總出現次數 = 0
5. 同時驗證：`POOLDATA_FIELD_DUPLICATE` 在 `src/` 至少出現 1 次（確認正確錯誤碼已定義）；`availableColumns` 在 `src/` 至少出現 1 次；`suggestedFieldType` 在 `src/` 至少出現 1 次

**預期結果**：

- 10 個禁用識別符各出現 0 次
- `POOLDATA_FIELD_DUPLICATE`、`availableColumns`、`suggestedFieldType` 各至少出現 1 次

**失敗判定**：

- 任一禁用識別符出現次數 > 0 → 實作端使用了別名，需 rename 並更新
- 任一正確識別符出現次數 = 0 → 對應功能尚未實作，或識別符拼寫錯誤

**實作建議**：可在 `test/regression/M06-naming.regression.spec.ts` 與 TC-GUARD-M06-NAMING-001 合併為同一個 `describe` block，分為兩個 `it()` 群組（spec/prototype 掃描 vs source code 掃描），共享 `readFileSync` 工具函式。

---

## 執行優先順序

依缺陷嚴重度排列：

| 優先 | Guard ID | 嚴重度 | 理由 |
|------|----------|--------|------|
| 1 | TC-GUARD-M06-NAMING-002 | High | 實作端識別符錯誤導致 API contract 不一致，前後端斷裂 |
| 2 | TC-GUARD-M06-NAMING-001 | Medium | spec / prototype 命名漂移，影響下游 agent 實作正確性 |

---

## 相關文件參照

- `docs/test-specs/features/F075-test.md` §Glossary — 完整識別符防漂移清單
- `docs/test-specs/features/F075-test.md` §七「迴歸防護參考」— 本文件引用點
- `docs/specs/features/F075-manage-pooldata-field-whitelist.md` §13 v1.4 — 附帶清理說明（prototype + FE footer `WHITELIST_FIELD_DUPLICATE` 修正）
- `docs/test-specs/regression/M02-regression-guards.md` — M02 模組防護範本（格式參照）
- `C:\Users\cacab\.claude\agent-memory\test-designer\MEMORY.md` — feedback_tdd_naming_drift, feedback_grep_negative_lookahead
