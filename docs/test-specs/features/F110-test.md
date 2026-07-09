---
type: test-design-feature
feature_id: F110
feature_name: Code Decode 節點（泛用單趟多欄位代碼解碼）
priority: P0-MVP
related_spec: /docs/specs/features/F110-etl-code-decode-node.md
related_story: /docs/stories/epics/E05-etl-pipeline/US-173-code-decode-node.md（AC-1~AC-5）
related_architecture:
  - /docs/specs/architecture-spec.md（AD-E05-7，§3 約 line 1050，架構層級 Why/What）
  - /docs/specs/implementation-log/AD-E07-41-mssql-p4-etl-engine.md（§13，SQL/migration 層級 How，本文件測試設計之權威依據）
related_test_baseline:
  - /docs/test-specs/features/F043-test.md（LookupExecutor，TS-F043-045~058，等價基準與回歸錨點）
  - /docs/test-specs/infrastructure/AD-E07-41-P4-codedecode-test.md（本檔姊妹文件，SQL 生成／真實 MSSQL 等價／PG byte-identical／效能／migration 驗證）
last_updated: 2026-07-09
---

# F110: Code Decode 節點（泛用單趟多欄位代碼解碼）— 測試設計

## 測試策略

### 範圍界線（與姊妹文件 AD-E07-41-P4-codedecode-test.md 的分工）

`code_decode` 節點自 AD-E05-7b 起即設計為 **SQL 生成型**（`SELECT INTO` 新暫存表 + N 個 LEFT JOIN），不是像 F043 其餘執行器一樣的純記憶體 `NodeExecutor`；且架構從一開始即拆為 PG（`code-decode-handler.ts`）與 MSSQL（`code-decode-handler-mssql.ts`）兩個平行檔案（AD-E05-7c）。因此本文件與姊妹文件的分工如下：

| 層級 | 本文件（F110-test.md） | 姊妹文件（AD-E07-41-P4-codedecode-test.md） |
|---|---|---|
| 性質 | **dialect-neutral** 設定驗證 + 可觀察語意契約（F110 §5/§6/§10） | **dialect-specific** SQL 生成正確性 + 真實 MSSQL/PG 執行結果 |
| 驗證手段 | Mock `queryRunner`（不斷言 SQL 文字，僅斷言 handler 回傳的 `DataSet` 形狀與值）；純設定驗證（AC-10）不觸及 DB | 真實 MSSQL 連線（`.mssql.spec.ts`）+ SQL 文字結構斷言 + 真實 PG 連線（degradable） |
| 涵蓋不變式 | 無（本文件僅定義**可觀察行為**，不涉及不變式所描述的**實作手段**） | I-CODEDECODE-JOIN-FILTER-01 / DEDUP-TIEBREAK-01 / NORMALIZE-01 / COLLISION-01 / EQ-01 |
| US-173 AC-2（逐格等價，硬性安全網） | 僅定義 DoD 契約（§7.4）與收斂對應表（§7.2/§7.3）供對照 | **實際執行**：真實 MSSQL 上 old `lookup` 鏈 vs new `code_decode` 逐格比對 |
| AC-11（效能） | 僅記錄達標門檻定義 | **實際量測**：dev MSSQL 2022 real ~3.6M 列 |

**不得**只讀本文件就宣稱 F110 已完成驗證——US-173 AC-2（硬性安全網）與 AC-3（效能）兩項 DoD 紅線的**實際證據**都在姊妹文件。

### 單元測試範疇（本文件）

- **設定驗證（AC-10）**：純函式層級，`mappings`/字典來源/`outputAlias` 唯一性等前置檢查，不需 DB 連線。
- **語意契約（AC-1~AC-3/AC-6/AC-7/§6.2/§6.3/§10）**：以 Mock `queryRunner.query()` 回傳「已完成 JOIN／已去重／已正規化」的最終結果列（模擬 handler 對 DB 下一次查詢後拿到的成品），斷言 handler 組出的 `DataSet`（欄位集合、`rowCount`、NULL 語意、欄位順序）符合 F110 §6 定義——**不斷言查詢本身如何寫成**（那是姊妹文件 SQLGEN 群組的責任）。
- **回歸錨點（AC-8）**：確認新增 `code_decode` 不改變 `LookupExecutor` 之驗證與行為介面；實際迴歸執行仍以既有 `F043-test.md` TS-F043-045~058 為準。

### 明確排除（交姊妹文件）

- SQL 文字結構斷言（filter 位置、`ROW_NUMBER()` 去重、`TRIM`/`TRY_CAST`、`SELECT INTO`、顯式欄位枚舉、`OPTION (HASH JOIN)`）。
- 真實 MSSQL 執行的逐格等價安全網（US-173 AC-2 / I-CODEDECODE-EQ-01）。
- PG/MSSQL byte-identical 比對（AC-9 / BR-11）。
- 效能量測（AC-3 / AC-11）。
- `customer_core` pipeline definition migration（§13.6）之欄位級核對。

---

## Acceptance Test Design（AC-1 ~ AC-11 對照）

| AC | Given / When / Then（摘要） | 本文件驗證 | 姊妹文件驗證（實作證據） |
|---|---|---|---|
| AC-1 泛用單趟多欄位解碼 | Given 任一字典表 + 多組任意 filter 之 mapping；When 節點執行；Then 一次掃描完成全部解碼，欄位名稱/內容對應原 lookup | TS-F110-015、TS-F110-018 | SQLGEN 群組（單一 SQL 陳述式即為「一次掃描」之實作證據） |
| AC-2 輸出 = 原始欄位 + 全部描述欄位 | Given 輸入欄位集 C、M 組 mapping 共 K 個 outputAlias；When 執行；Then 輸出 = C ∪ K 個 outputAlias、`rowCount` 不變 | TS-F110-016 | EQ-MSSQL 群組（真實列數比對） |
| AC-3 無對應 ⇒ NULL（LEFT JOIN） | Given 查無對應或 matchColumn 為 NULL；When 執行；Then 該 outputAlias NULL、列不刪除 | TS-F110-020~023 | SQLGEN-JOINFILTER 群組（I-CODEDECODE-JOIN-FILTER-01：LEFT JOIN 語意不得因 filter 位置錯誤退化為 INNER JOIN） |
| AC-4 逐格等價（硬性安全網） | Given 相同輸入；When 分別以 lookup 鏈與 code_decode 執行；Then 逐格完全相同（含 NULL / TRIM / 重複 key 取首筆） | 僅定義 DoD 契約（§7.4，見下方「等價契約定義」節） | **EQ-MSSQL 群組（DoD 核心，真實 MSSQL，非本文件可驗證）** |
| AC-5 決定性收斂對應 | Given 一組同字典且皆 `noMatchStrategy='null'` 之 lookup；When 依 §7 收斂；Then 產生唯一 code_decode，逐欄零重塑對應 | 僅定義對應表（見下方「lookup ⇒ code_decode 收斂對應」節） | MIGRATION 群組（對照真實 `etl-pipelines.json` 9 節點/31 mapping） |
| AC-6 單一 mapping 表亦可用 | Given 僅需 1 組 mapping 之字典；When 以 code_decode 設定；Then 合法執行，輸出與單一 lookup 逐格一致 | TS-F110-017 | EQ-MSSQL 群組（MLSTDINDUMF ×3 單一 mapping 案例） |
| AC-7 filter 三型態皆支援 | Given filter 為單一等式／複合條件／無 filter；When 執行；Then 語意與 `lookupFilter` 完全一致 | TS-F110-018（設定/資料層 smoke） | SQLGEN-FILTER 群組（SQL 生成層，三型態逐一驗證） |
| AC-8 lookup 持續可用 | Given code_decode 為新增節點類型；When 新增後；Then lookup 行為/可用性/設定方式不受影響，兩者並存 | TS-F110-027、TS-F110-028 | REG-LOOKUP 群組（既有 F043 套件 + P4b lookup MSSQL 套件不回歸） |
| AC-9 PG 行為維持不變（byte-identical） | Given PG→MSSQL 遷移期間；When code_decode 於 PG 執行；Then 與 MSSQL 逐格一致 | 不適用（無 DB 連線） | **EQ-PG-BYTEIDENTICAL 群組（degradable，5433 可達才執行）** |
| AC-10 設定驗證 | Given 節點設定；When 執行前驗證；Then 違反任一規則即 `failed` + errorMessage | TS-F110-001~014 | 不重複（純驗證邏輯，DB-agnostic） |
| AC-11 效能達標（NFR） | Given customer_core 大分支（≈360 萬列）；When 以 code_decode 取代 lookup 群組；Then 耗時由 45 分鐘以上降至約 3 分鐘以內 | 不適用（非單元可測） | **PERF-NFR 群組（live-verified，非 CI 斷言）** |

---

## 等價契約定義（§7.4，供姊妹文件 EQ-MSSQL 群組直接引用，本文件不重複執行）

> 給定**相同輸入 DataSet**，以（a）收斂前的 `lookup` 節點鏈與（b）收斂後的 `code_decode` 節點分別執行，**每一列、每一個 `outputAlias` 欄位的值逐格相同**（含 NULL、含 TRIM／cast、含重複 key 取首筆），即為等價。此為 `code_decode` 上線取代 `lookup` 鏈的 DoD 門檻（US-173 AC-2）。

## lookup ⇒ code_decode 收斂對應（§7.2/§7.3，供 MIGRATION 群組核對用）

**收斂前提**：(A) 全部解析到同一張字典表；(B) 全部 `noMatchStrategy = 'null'`。

| 對應層級 | code_decode 欄位 | 取自 lookup |
|---|---|---|
| 節點級 | `lookupRef` / `lookupSource` / `lookupSourceId` | 群組共用值 |
| mapping 級 | `matchColumn` | `Lᵢ.matchColumn` |
| mapping 級 | `lookupMatchColumn` | `Lᵢ.lookupMatchColumn` |
| mapping 級 | `filter` | `Lᵢ.lookupFilter`（無則不設定） |
| mapping 級 | `outputColumns` | `Lᵢ.outputColumns`（原樣搬移） |

mapping 順序 = 來源 lookup 節點在 pipeline 定義中的順序。反向（供 migration `down()`）：每個 `mappings[i]` ⇒ 一個 `lookup` 節點，`noMatchStrategy` 固定還原為 `'null'`。

---

## Mock 資料設計

### VALIDATE 群組用設定（純物件，無需 DB）

```typescript
const minimalValidConfig: CodeDecodeConfig = {
  nodeType: 'code_decode',
  label: '教育程度解碼',
  lookupSource: 'raw_e5a2345c',
  mappings: [
    { matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD', filter: "TBL_ID = 'A2'",
      outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }] },
  ],
};
```

### 多 mapping 語意測試用資料（比照 F110 §14.2 `raw_e5a2345c`，9 組 mapping 之縮減代表子集：教育程度 + 職業）

```typescript
// context.inputs['default']（主資料流，4 列）
const mainRows = [
  { CUSTO_NO: 'C001', EDUCAT_BACK: 'B2', VOCATION_CODE: 'V1' },  // 兩者皆命中
  { CUSTO_NO: 'C002', EDUCAT_BACK: 'Z9', VOCATION_CODE: 'V1' },  // 教育程度查無對應
  { CUSTO_NO: 'C003', EDUCAT_BACK: null, VOCATION_CODE: 'V2' },  // matchColumn 為 NULL
  { CUSTO_NO: 'C004', EDUCAT_BACK: 'B2', VOCATION_CODE: 'V2' },
];

// Mock queryRunner.query 回傳（模擬 handler 已完成 SQL 端 JOIN+去重+正規化 之最終結果列）
const mockJoinedRows = [
  { CUSTO_NO: 'C001', EDUCAT_BACK: 'B2', VOCATION_CODE: 'V1', education_desc: '大學', occupation_desc: '軍公教' },
  { CUSTO_NO: 'C002', EDUCAT_BACK: 'Z9', VOCATION_CODE: 'V1', education_desc: null, occupation_desc: '軍公教' },
  { CUSTO_NO: 'C003', EDUCAT_BACK: null, VOCATION_CODE: 'V2', education_desc: null, occupation_desc: '商業' },
  { CUSTO_NO: 'C004', EDUCAT_BACK: 'B2', VOCATION_CODE: 'V2', education_desc: '大學', occupation_desc: '商業' },
];
```

### 錯誤情境用 Mock（§13 錯誤表）

```typescript
// 主資料流缺失
const emptyInputs = {};

// 字典來源不存在（mock queryRunner 拋錯）
mockQueryRunner.query.mockRejectedValueOnce(new Error('Invalid object name \'raw_nonexistent\''));

// mapping filter 語法錯誤
mockQueryRunner.query.mockRejectedValueOnce(new Error("Incorrect syntax near 'AND'"));
```

---

## 測試場景 — 設定驗證（AC-10）

### TS-F110-001: `mappings` 為空陣列 → 節點 `failed`

- **Related Requirement**: F110 AC-10 / BR-9 / §13
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Preconditions**: 節點設定 `mappings: []`
- **Steps**: 執行 CodeDecodeExecutor 前置驗證
- **Expected Result**: 節點狀態 `'failed'`，errorMessage = `code_decode 節點缺少解碼 mapping`

---

### TS-F110-002: `mappings` 欄位缺失（`undefined`）→ 節點 `failed`

- **Related Requirement**: F110 AC-10 / BR-9
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Preconditions**: 節點設定物件無 `mappings` 鍵
- **Expected Result**: 節點狀態 `'failed'`，errorMessage 同 TS-F110-001

---

### TS-F110-003: 字典來源完全無法解析（無 `lookupRef`、無 `lookupSource`、無 `lookup-input`）→ 節點 `failed`

- **Related Requirement**: F110 AC-10 / §6.1
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Preconditions**: `context.inputs` 僅 `'default'`；節點設定無 `lookupRef`/`lookupSource`
- **Expected Result**: 節點狀態 `'failed'`，errorMessage 指出字典來源不可解析（沿用 lookup 慣例文案）

---

### TS-F110-004: mapping 缺少 `matchColumn` → 節點 `failed`

- **Related Requirement**: F110 AC-10 / §13
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Expected Result**: errorMessage = `code_decode 節點 mapping 缺少比對欄位（主表）`

---

### TS-F110-005: mapping 缺少 `lookupMatchColumn` → 節點 `failed`

- **Related Requirement**: F110 AC-10 / §13
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Expected Result**: errorMessage = `code_decode 節點 mapping 缺少比對欄位（對照表）`

---

### TS-F110-006: mapping 之 `outputColumns` 為空陣列 → 節點 `failed`

- **Related Requirement**: F110 AC-10 / §13
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Expected Result**: errorMessage = `code_decode 節點 mapping 缺少輸出欄位`

---

### TS-F110-007: `outputColumns` 項目缺少 `lookupColumn` 或 `outputAlias` → 節點 `failed`

- **Related Requirement**: F110 §5 CodeDecodeOutputColumn 結構完整性
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Preconditions**: 兩個子案例：(a) 缺 `lookupColumn`、(b) 缺 `outputAlias`
- **Expected Result**: 兩子案例皆為節點 `'failed'`，errorMessage 同 TS-F110-006 語意（輸出欄位設定不完整）

---

### TS-F110-008: 跨 mapping 出現重複 `outputAlias` → 節點 `failed`（I-CODEDECODE-COLLISION-01 / BR-8）

- **Related Requirement**: F110 AC-10 / BR-8 / §13
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Preconditions**: mapping 1 之 `outputColumns` 含 `outputAlias: 'customer_type_desc'`；mapping 2 亦含相同 alias
- **Expected Result**: 節點狀態 `'failed'`，errorMessage = `code_decode 節點輸出別名重複：customer_type_desc`

---

### TS-F110-009: 同一 mapping 內 `outputColumns` 重複 `outputAlias` → 節點 `failed`（BR-8 延伸邊界）

- **Related Requirement**: F110 BR-8（「節點內跨全部 mapping」之定義涵蓋同一 mapping 內部）
- **Test Type**: 邊界
- **測試層次**: 單元測試（無 DB）
- **Preconditions**: 單一 mapping 之 `outputColumns` 陣列內出現兩筆相同 `outputAlias`
- **Expected Result**: 節點狀態 `'failed'`，errorMessage 同 TS-F110-008 格式

---

### TS-F110-010: 合法最小設定（1 mapping、1 outputColumn、無 filter）通過驗證（正向對照組）

- **Related Requirement**: F110 AC-6 / BR-9（≥1 mapping 之下界合法值）
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**: `minimalValidConfig`（見 Mock 資料設計）
- **Expected Result**: 前置驗證通過，節點繼續進入執行階段（不因設定本身被判定 `'failed'`）

---

## 測試場景 — 主資料流／字典解析錯誤（§13 錯誤表其餘列）

### TS-F110-011: 主資料流缺失（`inputs` 無 `'default'`）→ 節點 `failed`

- **Related Requirement**: F110 AC-10 / §13
- **Test Type**: 負向
- **測試層次**: 單元測試（無 DB）
- **Preconditions**: `context.inputs = {}`
- **Expected Result**: errorMessage = `code_decode 節點缺少主資料流輸入`

---

### TS-F110-012: 字典來源表不存在（Mock queryRunner 拋錯）→ 節點 `failed`

- **Related Requirement**: F110 §13（沿用 lookup 慣例）
- **Test Type**: 負向
- **測試層次**: 單元測試（Mock queryRunner 拋例外）
- **Preconditions**: `lookupSource: 'raw_nonexistent'`；Mock queryRunner.query 拋 `Invalid object name` 例外
- **Expected Result**: errorMessage 包含 `對照表 raw_nonexistent 不存在`

---

### TS-F110-013: 向下相容模式 `lookupRef` 查不到且無 `lookupSource` fallback → 節點 `failed`

- **Related Requirement**: F110 §6.1 / §13
- **Test Type**: 負向
- **測試層次**: 單元測試（Mock queryRunner 查 `extraction_tasks` 回傳空）
- **Preconditions**: 節點設定僅 `lookupRef`（`datasourceName`/`sourceTable`），無 `lookupSource`；Mock 查詢回傳 0 筆
- **Expected Result**: errorMessage 包含 `找不到對應的 extraction task（datasourceName: {ds}, sourceTable: {tbl}）且無 lookupSource fallback`

---

### TS-F110-014: mapping `filter` 語法錯誤 → 節點 `failed`

- **Related Requirement**: F110 §10 邊界情況 / §13
- **Test Type**: 負向
- **測試層次**: 單元測試（Mock queryRunner 拋語法例外）
- **Preconditions**: `filter: "TBL_ID = 'A2' AND"`（不完整表達式）；Mock queryRunner.query 拋語法例外
- **Expected Result**: errorMessage 包含 `對照表查詢失敗：`

---

## 測試場景 — 泛用單趟多重解碼語意（AC-1 / AC-2 / AC-6 / AC-7 / §6.2）

### TS-F110-015: 單一節點 9 組 mapping 一次掃描完成解碼（AC-1）

- **Related Requirement**: F110 AC-1；比照 customer_core #1 `raw_e5a2345c`（§14.2）9 組 mapping
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner 回傳已含 9 欄描述之最終結果列）
- **Preconditions**: 節點設定含 9 組 mapping（教育程度／職業／職稱／婚姻／客戶類型／收入來源／行業／職級／月收入級距），皆對 `raw_e5a2345c`、皆各自 `TBL_ID='xx'`
- **Steps**: 執行 CodeDecodeExecutor
- **Expected Result**:
  - 輸出 DataSet 同時含全部 9 個 `outputAlias` 欄位，且各自對應正確描述值
  - `rowCount` 與輸入相同
  - 不因 mapping 組數不同而需要切換節點類型（同一 executor 處理 1~9 組 mapping）

---

### TS-F110-016: 輸出資料集 = 輸入欄位 ∪ 全部 `outputAlias`，`rowCount` 與輸入相同（AC-2）

- **Related Requirement**: F110 AC-2 / BR-4
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**: `mainRows`（4 列，欄位 C = {CUSTO_NO, EDUCAT_BACK, VOCATION_CODE}）；2 組 mapping，共 K=2 個 outputAlias
- **Expected Result**: 輸出欄位集合 = C ∪ {education_desc, occupation_desc}；`rowCount = 4`（與輸入相同，LEFT JOIN 不刪列）

---

### TS-F110-017: 單一 mapping 的 code_decode 合法執行（AC-6）

- **Related Requirement**: F110 AC-6 / §6.4a；比照 customer_core #5 `MLSTDINDUMF`
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**: `mappings` 長度 = 1（`INDUID → industry_desc`，無 filter）
- **Expected Result**: 節點合法執行（不因僅 1 組 mapping 被拒絕），輸出欄位語意等同單一等價 `lookup` 節點（僅新增 1 個 `industry_desc` 欄位）

---

### TS-F110-018: mapping 分別設定單一等式／複合條件／無 filter 三種型態皆可設定並各自套用（AC-7，設定/資料層 smoke）

- **Related Requirement**: F110 AC-7 / §6.4b；SQL 產生層級之嚴格驗證見姊妹文件 SQLGEN-FILTER 群組
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**: 單一節點含 3 組 mapping：(i) `filter: "TBL_ID = 'A2'"`（單一等式）、(ii) `filter: "TRIM(SYSCD)='CF' AND TRIM(DATAID)='CU'"`（複合條件）、(iii) 無 `filter` 鍵（無 filter，全表 JOIN）
- **Expected Result**: 三組 mapping 皆通過設定驗證並各自產出對應 `outputAlias`；handler 不因 filter 型態不同而拒絕設定或改變回傳形狀

---

### TS-F110-019: 輸出欄位加入順序 = mapping 順序、再依 `outputColumns` 順序，決定性（§6.2）

- **Related Requirement**: F110 §6.2 決定性欄位順序
- **Test Type**: 正向（決定性）
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**: 3 組 mapping，依序 M1(2 個 outputColumns)/M2(1 個)/M3(1 個)
- **Steps**: 執行兩次（相同輸入與設定）
- **Expected Result**: 兩次執行輸出之欄位加入順序皆為 `[M1.out1, M1.out2, M2.out1, M3.out1]`，完全一致（欄位順序不影響值正確性，但順序本身須決定性）

---

## 測試場景 — LEFT JOIN／NULL 語意（AC-3 / §10）

### TS-F110-020: 某 mapping 查無對應 → 該 `outputAlias` NULL、列不刪除

- **Related Requirement**: F110 AC-3
- **Test Type**: 正向（LEFT JOIN 語意驗證）
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**: `mainRows` 之 C002（`EDUCAT_BACK='Z9'`，字典無此值）
- **Expected Result**: C002 該列**保留**，`education_desc = null`；`occupation_desc`（VOCATION_CODE='V1' 命中）仍正常有值；`rowCount` 不因此列部分欄位無對應而減少

---

### TS-F110-021: 主資料列 `matchColumn` 為 NULL → 該 mapping `outputAlias` NULL

- **Related Requirement**: F110 AC-3 / §10
- **Test Type**: 邊界
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**: `mainRows` 之 C003（`EDUCAT_BACK = null`）
- **Expected Result**: C003 列保留，`education_desc = null`（NULL key 不匹配任何字典列）；`occupation_desc`（VOCATION_CODE='V2' 有值）不受影響

---

### TS-F110-022: 字典子集為空（表本身空或 filter 後為空）→ 該 mapping 全部 `outputAlias` NULL，`rowCount` 不變

- **Related Requirement**: F110 §10 邊界情況
- **Test Type**: 邊界
- **測試層次**: 單元測試（Mock queryRunner 回傳全部 mapping 對應欄位皆為 NULL 之結果列）
- **Preconditions**: 某 mapping 之 filter 套用後字典子集為空
- **Expected Result**: 全部主資料列該 mapping 的 `outputAlias` 皆為 NULL；`rowCount` = 輸入列數（與 lookup「空對照集」邊界一致）

---

### TS-F110-023: 輸入 DataSet 為空（`rowCount = 0`）→ 回傳空 DataSet，節點 `'completed'`

- **Related Requirement**: F110 §10 邊界情況（與 F043 全節點慣例一致）
- **Test Type**: 邊界
- **測試層次**: 單元測試（無需 Mock queryRunner 回傳資料）
- **Preconditions**: `context.inputs['default'] = { rows: [], rowCount: 0 }`
- **Expected Result**: 回傳 `{ rows: [], rowCount: 0 }`，節點狀態 `'completed'`（非 `'failed'`）

---

## 測試場景 — 重複 key／欄位覆蓋／決定性（§6.3 / §10 / BR-5）

### TS-F110-024: 字典子集重複 key 語意上僅取一筆（契約層定義）

- **Related Requirement**: F110 §6.3 / BR-5；具體 tie-break 規則（`ROW_NUMBER() OVER (... ORDER BY _cdmp_id ASC)`）之 SQL 層級驗證見姊妹文件 I-CODEDECODE-DEDUP-TIEBREAK-01 群組
- **Test Type**: 契約定義（非可獨立於 SQL 層驗證的單元測試）
- **測試層次**: 文件化守門（Decision-consistency check）
- **Expected Result**: 本文件明確記錄「重複 key 取首筆」之語意與 [F043 §6](../features/F043-etl-node-executors.md) lookup 既有定義相同；handler 端的**具體排序鍵**與**去重時機**由姊妹文件之真實 MSSQL 執行結果驗證，不在本文件重複斷言

---

### TS-F110-025: `outputAlias` 與既有輸入欄同名時，以該 mapping 解碼值覆蓋

- **Related Requirement**: F110 §10 邊界情況 / §13.1 OQ-F110-04
- **Test Type**: 邊界
- **測試層次**: 單元測試（Mock queryRunner 回傳結果列已將同名欄位值替換為解碼值）
- **Preconditions**: 輸入欄位已存在 `education_desc`（例如上游節點誤植同名欄）；mapping 之 `outputAlias` 亦為 `education_desc`
- **Expected Result**: 輸出該欄位值 = 本次 mapping 之解碼結果（覆蓋語意），非原輸入值；欄位集合不因此產生重複欄名

---

### TS-F110-026: 相同設定重複執行兩次，輸出欄位順序與值皆相同（決定性 regression）

- **Related Requirement**: F110 §6.2 / BR-12（決定性，無隨機）
- **Test Type**: 正向（決定性回歸）
- **測試層次**: 單元測試（Mock queryRunner，兩次呼叫回傳相同資料）
- **Expected Result**: 兩次執行結果（欄位順序、每格值）完全相同，無非決定性差異

---

## 測試場景 — additive／回歸錨點（AC-8）

### TS-F110-027: 新增 `code_decode` 節點類型不影響既有 `LookupExecutor` 之驗證邏輯與行為

- **Related Requirement**: F110 AC-8 / BR-10
- **Test Type**: 回歸錨點
- **測試層次**: 單元測試 + 既有套件回歸指標
- **Preconditions**: 既有 `F043-test.md` TS-F043-045~058（LookupExecutor 全部場景）
- **Steps**: 本次新增 `code_decode` 相關程式碼後，重跑既有 F043 lookup 套件
- **Expected Result**: TS-F043-045~058 全數維持通過，不因 `code_decode` 新增而需修改任何既有斷言（若需修改，視為 AC-8 違反，須停下釐清）

---

### TS-F110-028: `nodeType='code_decode'` 與 `nodeType='lookup'` 可並存於同一 dispatcher，互不覆蓋

- **Related Requirement**: F110 AC-8 / §13.1 OQ-F110-05；完整 register 順序與雙 handler（PG/MSSQL）之驗證見姊妹文件 DISPATCH 群組
- **Test Type**: 正向（契約 smoke）
- **測試層次**: 單元測試
- **Expected Result**: `CodeDecodeExecutor.nodeType === 'code_decode'`（不等於 `'lookup'`），兩種 nodeType 可同時註冊於同一 `NodeDispatcher` 而不互相覆蓋對方之處理函式

---
