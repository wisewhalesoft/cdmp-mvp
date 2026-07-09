---
spec-id: F110
title: Code Decode 節點（泛用單趟多欄位代碼解碼）
feature-id: F110
source-story: US-173
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-07-09
status: Draft
---

# F110: Code Decode 節點（泛用單趟多欄位代碼解碼）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-09

> **v1.0（2026-07-09 / US-173 初版）**：新增第 9 種 ETL 轉換節點類型 `code_decode`（代碼字典解碼／單趟多重解碼）。此節點為**泛用（generic）**設計：對**任何一張**對照字典表，在**一次資料流掃描**中，以任意數量、任意 filter 條件的多組「代碼欄位 → 描述欄位」mapping，一次補齊所有描述欄位，取代原本需要 N 個各自對整條分支做「就地全表 UPDATE」的 `lookup` 節點。核心設計：(1) 節點級只保留**單一共用字典來源**（`lookupRef` / `lookupSource`，解析規則與 `lookup` §4.8 完全一致）；(2) `mappings[]` 逐組帶自己的 `matchColumn` / `lookupMatchColumn` / 選用 `filter` / `outputColumns`，每組欄位名稱與 `lookup` 節點**逐一對應**（見 §7 決定性對應表）；(3) 固定 LEFT JOIN 語意（無對應 ⇒ 描述欄 NULL），**輸出與其所取代的等價 `lookup` 節點鏈逐格（cell-for-cell）完全一致**（US-173 AC-2 硬性要求）；(4) `lookup` 節點類型不修改、不淘汰，`code_decode` 為**新增**（additive）。**邊界**：本 spec 為功能／設定 schema／語意／等價契約層；節點的**實體執行策略**（`SELECT INTO` vs `UPDATE`、`##temp` 生命週期、MSSQL/PG 方言 SQL）交 system-architect（AD-E07-41）；測試案例交 test-designer；pipeline 定義的 migration（移除 31 個 lookup、插入 9 個 code_decode，含 `down()` 還原）交 tdd-implementation。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| System Architect | 本文件 §5 / §6 / §7 / §9 / §15 + [F043 §4.8 / §4.9](F043-etl-node-executors.md)（lookup 執行語意為對齊基準）+ [F042](F042-etl-execution-engine.md)（NodeExecutor / DataSet 契約）+ `apps/api/src/modules/etl/engine/handlers/lookup-handler.ts`（PG）/ `lookup-handler-mssql.ts`（MSSQL） |
| TDD Developer | 本文件 + [F043 §4.9](F043-etl-node-executors.md) + AD-E07-41（架構師產出後）+ `apps/api/src/modules/etl/engine/handlers/lookup-handler*.ts` + `resolve-raw-table*.ts` + `node-dispatcher.ts` |
| QA / Tester | 本文件 §4 / §7 / §10 + [F043 §4.8](F043-etl-node-executors.md)（lookup 對照組）+ `error-handling.md`（沿用既有 ETL 錯誤處理慣例） |
| UI/UX Designer | 本文件 §5 / §14（節點由 seed / migration 建立，非畫布手動編輯；F029 編輯器支援為後續，見 §15 OQ-F110-05） |

---

## 對應 User Story

- 來源 Story：[US-173-code-decode-node.md](../../stories/epics/E05-etl-pipeline/US-173-code-decode-node.md)（業務範圍待解決問題已由利害關係人確認；「尚待 Spec 層決定」兩項於本 spec §6.4 落地）
- Epic：[E05 — ETL Pipeline 管理](../../stories/epics/E05-etl-pipeline/epic-brief.md)

---

## 1. 功能摘要

`code_decode` 是 ETL Pipeline 的一種**轉換（transform）節點**，實作 [F042](F042-etl-execution-engine.md) 定義的 `NodeExecutor` 介面（`readonly nodeType = 'code_decode'`，接收 `NodeExecutionContext`、回傳 `DataSet`）。

它是既有 `lookup` 節點（[F043 §4.8](F043-etl-node-executors.md)）的**一般化（generalization）**：`lookup` 一次對一張對照表、以單一 filter 取出一組描述欄；`code_decode` 對**同一張**對照字典表，在**一次資料流掃描**中，同時執行**任意數量**組「代碼欄位 → 描述欄位」的解碼，每組可各自帶**任意 filter**（單一等式、複合條件、或無 filter）。

**存在理由（效能）**：一組打**同一張**小型字典表（約 3,000 列）的 `lookup` 節點，各自對整條大資料量分支（約 360 萬列）做一次「就地全表 UPDATE」（`ALTER TABLE ADD col; UPDATE ... JOIN dict`），每個節點 5–11 分鐘，N 個節點使整條 Pipeline 逼近 1.5 小時。`code_decode` 把「N 次全表更新 + 各自查字典」收斂為「**一次掃描 + N 個 LEFT JOIN**」，一次補齊所有描述欄（§9）。

**泛用（不綁定資料集）**：節點本身不綁定 ZZIP、不綁定任何特定資料來源或欄位命名。只要符合「同一字典表、多欄代碼解碼」模式即可套用。`customer_core` 的 5 個字典表實例（§14）是**佐證用例（informative example）**，非節點適用範圍的限定。

**與 `lookup` 並存（additive）**：`code_decode` 為**新增**節點類型，不修改、不淘汰 `lookup`；兩者並存於系統（AC-8）。

> 完整轉換節點目錄與 `lookup` 執行語意見 [F043](F043-etl-node-executors.md)；本 spec 為 `code_decode` 的權威細節，F043 §4.9 為其目錄摘要。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 在 Pipeline 中使用一個泛用的 `code_decode` 節點，對任何一張對照字典表以任意數量、任意 filter 的多組「代碼 → 描述」mapping 一次解碼完成
**So that** 不需為每一組「同表多欄代碼解碼」各建一個 Lookup 節點、逐一全表掃描更新，Pipeline 執行時間由近 1.5 小時降至分鐘級，畫布節點結構更精簡、更易維護

## 3. 前置條件

- [F042](F042-etl-execution-engine.md)（ETL 執行引擎核心框架）已完成，提供 `NodeExecutor` 介面、`NodeExecutionContext`、`DataSet` 型別。
- [F043 §4.8](F043-etl-node-executors.md)（LookupExecutor）已完成並為**既有解碼行為的權威基準**（本節點的字串比對／casting／TRIM／LEFT JOIN 語意須與之逐一相同）。
- 節點設定（`node.data`）符合 §5 定義的 `CodeDecodeConfig`。
- 對照字典來源可解析（`lookupRef` 動態解析或 `lookupSource`，與 lookup 相同）。

## 4. 驗收標準

> 對應 US-173 AC-1 ~ AC-5；AC-5 ~ AC-7、AC-10 為 spec 層衍生之明確化條款。

### AC-1：泛用單趟多欄位解碼（US-173 AC-1）

- **Given** 一個 `code_decode` 節點設定了對照**任何一張**字典表的多組 mapping，每組可各自帶任意 filter（單一等式、複合條件、或無 filter）
- **When** 該節點執行
- **Then** 節點在一次資料流掃描中完成所有代碼欄位的解碼；不因字典表內容、mapping 組數或 filter 型態不同而需要不同的節點類型
- **And** 每組 mapping 產生的描述欄位（`outputAlias`）名稱與內容，對應到它所取代的那一個 `lookup` 節點原本產生的欄位名稱與內容

### AC-2：輸出資料集 = 原始欄位 + 全部描述欄位

- **Given** 輸入 DataSet 含欄位集合 C，節點含 M 組 mapping、共產生 K 個 `outputAlias`
- **When** 節點執行
- **Then** 輸出 DataSet 欄位 = C ∪ {K 個 outputAlias}；`rowCount` 與輸入相同（LEFT JOIN 語意，不刪列）

### AC-3：無對應 ⇒ 描述欄 NULL（LEFT JOIN 語意）

- **Given** 某 mapping 的主資料列 `matchColumn` 值在（套用該 mapping filter 後的）字典子集中查無對應 `lookupMatchColumn`
- **When** 節點執行
- **Then** 該列此 mapping 的 `outputAlias` 欄位值為 NULL；該列**不被刪除**（LEFT JOIN，非 INNER JOIN）
- **And** 主資料列 `matchColumn` 為 NULL 時同樣不匹配任何字典列，`outputAlias` 為 NULL

### AC-4：解碼結果與等價 Lookup 鏈逐格一致（US-173 AC-2，硬性要求）

- **Given** 相同輸入資料，分別以（a）現行等價 `lookup` 節點鏈、（b）一個 `code_decode` 節點執行解碼
- **When** 比對兩者輸出
- **Then** 每一列、每一個描述欄位的值**逐格（cell-for-cell）完全相同**，包含查無對應時兩者皆為 NULL（含字串 TRIM／型別 cast／重複 key 取首筆等所有邊界，見 §7 / §10）
- **And** 此一致性是 `code_decode` 可上線取代既有 `lookup` 鏈的**前提條件**，非「差不多即可」

### AC-5：一組同字典 lookup 節點 ⇒ 一個 code_decode 節點（決定性對應）

- **Given** 一組 `lookup` 節點 L1..Ln，全部（i）解析到**同一張**字典表、（ii）皆為 `noMatchStrategy = 'null'`
- **When** 依 §7 決定性對應規則收斂
- **Then** 產生唯一一個 `code_decode` 節點 C：節點級字典來源取自共用的 `lookupRef` / `lookupSource`；每個 Li 逐一對應為一個 mapping（`matchColumn` / `lookupMatchColumn` / `filter`（= Li 的 `lookupFilter`）/ `outputColumns` 逐欄搬移），mapping 順序 = 來源節點順序
- **And** 反向（C 的每個 mapping ⇒ 一個等價 `lookup` 節點）亦成立，供 migration `down()` 還原使用

### AC-6：單一 mapping 表亦可使用 code_decode（spec 層決定 a）

- **Given** 一張字典表僅需一組 mapping（無合併效益，例：MLSTDINDUMF，`INDUID → industry_desc`）
- **When** 以 `code_decode`（`mappings` 長度 = 1）設定
- **Then** 節點合法執行，輸出與等價單一 `lookup` 節點逐格一致（AC-4）
- **And** 是否將單一 mapping 表轉為 `code_decode` 屬「可選但一致」；`customer_core` 應用為求一致性一律採用（§6.4 / §14）

### AC-7：filter 表達式三種型態皆支援（spec 層決定 b）

- **Given** mapping 的 `filter` 分別為（i）單一等式 `TBL_ID = 'A2'`、（ii）複合條件 `TRIM(SYSCD)='CF' AND TRIM(DATAID)='CU'`、（iii）不設定（absent）
- **When** 節點執行
- **Then** filter 語意與 `lookup` 的 `lookupFilter` 完全一致：(i)(ii) 對字典表套用該布林過濾後再 JOIN、(iii) 對整張字典表 JOIN
- **And** `filter` 為對字典表欄位求值的**自由格式 SQL 布林表達式字串**（與 `lookupFilter` 同一處理與限制）

### AC-8：既有 lookup 節點類型持續可用（US-173 AC-4）

- **Given** `code_decode` 為新增節點類型
- **When** 新增 `code_decode` 後
- **Then** `lookup` 節點類型本身不被修改或淘汰，其行為、可用性、設定方式完全不受影響
- **And** 兩種節點類型並存於系統中；未被收斂的 `lookup`（含 `noMatchStrategy ≠ 'null'`、或無合併效益者若選擇保留）持續正常運作

### AC-9：PostgreSQL 行為維持不變（US-173 AC-5）

- **Given** 專案處於 PostgreSQL → MSSQL 遷移期間（新增功能，非既有行為變更）
- **When** `code_decode` 於 PostgreSQL 環境執行
- **Then** 輸出結果須與 MSSQL 環境逐格一致（byte-identical），不因資料庫後端不同而產生解碼結果差異

### AC-10：設定驗證

- **Given** 節點設定
- **When** 節點執行前驗證
- **Then** 下列任一不成立即節點 `'failed'` 並回傳對應 errorMessage（§13）：
  - `mappings` 至少 1 組
  - 字典來源可解析（`lookupRef` 或 `lookupSource`，或雙輸入 `lookup-input`）
  - 每組 mapping 具 `matchColumn`、`lookupMatchColumn`、至少 1 個 `outputColumns`（每項含 `lookupColumn` 與 `outputAlias`）
  - 節點內所有 `outputAlias`（跨全部 mapping）**唯一**（避免輸出欄位歧義）

### AC-11：效能達標為節點存在理由（US-173 AC-3，NFR）

- **Given** `customer_core` Pipeline 大資料量分支（約 360 萬列）之解碼群組
- **When** 以收斂後的 `code_decode` 取代原對應 `lookup` 群組執行
- **Then** 該分支解碼總耗時由 45 分鐘以上大幅降至約 3 分鐘以內（量測基準見 §9 / US-173 AC-3）
- **And** 小資料量分支（MLMCODE / MLSTDINDUMF）仍維持解碼正確（AC-4），全面套用不得使其效能劣化

## 5. 節點設定 / 定義 schema（config）

`code_decode` 節點的 `node.data` 結構如下。**節點級只保留單一共用字典來源**；「比對」「filter」「輸出欄」全部下沉至 per-mapping：

```typescript
interface CodeDecodeConfig {
  nodeType: 'code_decode';
  label: string;

  // ── 共用對照字典來源（單一字典表，全部 mapping 共用；解析規則與 LookupExecutor §4.8 完全一致）──
  lookupSource?: string;          // raw table 名稱（如 'raw_e5a2345c'）；有 lookupRef 時作為 fallback
  lookupRef?: {                   // 邏輯參照，動態查詢 extraction_tasks 取得 raw_table_name
    datasourceName: string;         // datasources.name（如 'APYHFC16.ZZIPPROD'）
    sourceTable: string;            // extraction_tasks.source_table（如 'ZZIP_BAMCODE_D'）
  };
  lookupSourceId?: string;        // taskId（UUID），選用

  // ── 解碼 mapping 清單（至少 1 組）──
  mappings: CodeDecodeMapping[];

  subtitle?: string;
}

interface CodeDecodeMapping {
  matchColumn: string;            // 主資料集的比對欄位（對應 lookup 的 matchColumn）
  lookupMatchColumn: string;      // 對照字典表的比對欄位（對應 lookup 的 lookupMatchColumn）
  filter?: string;                // 選用：對字典表求值的自由格式 SQL 布林表達式（對應 lookup 的 lookupFilter）
  outputColumns: CodeDecodeOutputColumn[];  // 至少 1 個輸出欄（對應 lookup 的 outputColumns）
}

interface CodeDecodeOutputColumn {
  lookupColumn: string;           // 對照字典表欄位名（對應 lookup 的 lookupColumn）
  outputAlias: string;            // 輸出別名（對應 lookup 的 outputAlias）
}
```

### 5.1 欄位名稱與 `lookup` 的對應（刻意重用，非巧合）

`code_decode` 的設定欄位名稱**刻意沿用** `lookup`（[F043 §4.8](F043-etl-node-executors.md)）的既有名稱，使「一組同字典 lookup ⇒ 一個 code_decode」的對應**決定性、無歧義、零重塑**（§7）：

| 層級 | code_decode 欄位 | 語意 | lookup 對應欄位 |
|------|-----------------|------|-----------------|
| 節點級（群組共用） | `lookupRef` | 動態字典來源參照 | `lookupRef` |
| 節點級 | `lookupSource` | 靜態字典 raw table（fallback） | `lookupSource` |
| 節點級 | `lookupSourceId` | 字典 taskId（選用） | `lookupSourceId` |
| mapping 級 | `mappings[].matchColumn` | 主表比對欄 | `matchColumn` |
| mapping 級 | `mappings[].lookupMatchColumn` | 字典比對欄 | `lookupMatchColumn` |
| mapping 級 | `mappings[].filter` | 字典過濾式 | `lookupFilter` |
| mapping 級 | `mappings[].outputColumns[]` | 輸出欄清單 `{lookupColumn, outputAlias}` | `outputColumns[]` |

### 5.2 設計取捨（明確裁定）

1. **每個 mapping 保留 `outputColumns` **清單**（非單一 `lookupColumn`/`outputAlias`）**。理由：`lookup` 的 `outputColumns` 本身是清單（一個 lookup 節點可從同一匹配列輸出多個描述欄）；保留清單使「一個 lookup 節點 ⇔ 一個 mapping」為**零重塑的 1:1 對應**（§7），不因某 lookup 剛好輸出 2 欄而被迫拆成 2 個 mapping。實務上 `customer_core` 全部 mapping 的 `outputColumns` 長度皆為 1（§14），但 schema 保留 lookup 的完整表達力（安全超集）。
2. **固定 LEFT JOIN / NULL 語意，不提供 `noMatchStrategy` / `defaultValue`**。`code_decode` 的目的是「代碼 → 描述」的加值（enrich），無對應即 NULL。`lookup` 的 `skip_row`（INNER JOIN 刪列）在單趟多 mapping 下語意衝突（mapping A 刪列、mapping B 保留列無法共存於一次掃描），`default_value` 在真實用例中未使用。故 `code_decode` **固定**為 LEFT JOIN（等同 `noMatchStrategy = 'null'`）。需要 `skip_row` / `default_value` 的 lookup 群組**維持 `lookup` 節點**（AC-8）；這也正是 §7 收斂前提「群組內全部 `noMatchStrategy = 'null'`」的來源。
3. **字典來源解析沿用 lookup 的雙模式**（§6.1）：雙輸入 `lookup-input` handle（若連接）或向下相容模式（`lookupRef` 動態解析 → `lookupSource` fallback）。`customer_core` 全部用例為向下相容模式（`lookupSource` + per-mapping `filter`）。

### 5.3 預設與驗證

- `filter` 未設定 / 空字串 ⇒ 不對字典表加 WHERE（對整張字典 JOIN），與 lookup `lookupFilter` 相同。
- `lookupSourceId` 選用。
- 驗證規則見 AC-10；違反 ⇒ 節點 `'failed'`（§13）。

## 6. 語意（dialect-neutral）

> 本節定義**可觀察的資料語意**，不指定 SQL 方言。實體執行策略（`SELECT INTO` vs 就地 `UPDATE`、`##temp` 生命週期、MSSQL/PG 具體語句）交 system-architect（AD-E07-41，見 §15 OQ-F110-01）。

### 6.1 字典來源決定（與 lookup 相同）

| 條件 | 模式 | 字典資料來源 |
|------|------|-------------|
| `inputs['lookup-input']` 存在 | 雙輸入模式 | 直接使用 `inputs['lookup-input']` DataSet（單一字典，全部 mapping 共用） |
| `inputs['lookup-input']` 不存在 | 向下相容模式 | 由 `lookupRef` 動態解析 raw table（查不到 → `lookupSource` fallback → 仍無 → 節點 failed），行為與 [F043 §4.8](F043-etl-node-executors.md) 的 lookupRef 決策流程一致 |

- **一個 `code_decode` 節點只解析一張字典表**（節點級來源），供所有 mapping 共用。
- 每個 mapping 的 `filter` 在**兩種模式中皆套用**（與 lookup `lookupFilter` 一致）。

### 6.2 單趟多 mapping 資料流

在**一次資料流掃描**中，對每個 mapping `Mᵢ`（`i = 1..M`）：

1. 取字典子集 `Dᵢ` = 對節點級字典表套用 `Mᵢ.filter`（無 filter ⇒ 整張字典）。
2. 對輸入資料以 `normalize(Mᵢ.matchColumn) = normalize(Mᵢ.lookupMatchColumn)` 做 **LEFT JOIN** `Dᵢ`。
3. 匹配列：以匹配到的字典列之 `lookupColumn` 值填入對應 `outputAlias`（每個 `outputColumns` 項各一欄）。
4. 無匹配列：`outputAlias` = NULL（不刪列）。

**輸出資料集** = 全部輸入欄位 + 全部 mapping 的全部 `outputAlias`。`rowCount` 與輸入相同（不刪列）。全部 mapping 打**同一張**字典表，於同一次邏輯掃描完成。

> 輸出欄位的**加入順序**為決定性：依 mapping 於 `mappings[]` 的順序、再依各 mapping `outputColumns[]` 的順序。欄位順序不影響任一格的值（等價由值而非位置定義），但固定順序利於下游 / 快照的決定性。

### 6.3 字串比對／casting／TRIM（等價硬性要求）

`code_decode` 對 join key 與輸出值的正規化，**必須與 LookupExecutor（[F043 §4.8](F043-etl-node-executors.md) 步驟 4）完全相同**：

- JOIN 等式兩側皆做 **TRIM + 文字 cast**（`lookup` 對 CHAR 型別尾隨空白的既有處理），以確保 MSSQL CHAR 欄位不因尾隨空白而漏配。
- 輸出值取字典列 `lookupColumn` 的 **TRIM + 文字 cast** 結果。
- **字典子集重複 key**：取首筆匹配列（與 [F043 §6](F043-etl-node-executors.md) lookup 邊界「對照資料集有重複 key → 取首筆匹配列」相同）。

此正規化是 §7 等價契約的一部分；其具體 SQL 落點（PG 的 `TRIM(col::text)`、MSSQL 對應寫法）由架構師依方言處理（與 lookup 同源），本 spec 只約束**語意須逐一相同**。

### 6.4 spec 層兩問題的裁定

- **(a) 單一 mapping 表**（如 MLSTDINDUMF，僅 `INDUID → industry_desc`）：**允許**使用 `code_decode`（`mappings` 長度 ≥ 1）。就節點類型而言，轉換單一 mapping 表為「可選但一致」——單一 mapping 的 `code_decode` 語意上等同對應的單一 `lookup`（AC-4），無任何負面效果。**`customer_core` 應用一律採用**（依字典表實例分組，含單一 mapping 表），以維持節點結構一致（§14）。需保留為 `lookup` 亦不違反本 spec（AC-8）。
- **(b) filter 表達式語法**：與 `lookup` 的 `lookupFilter` **同一種自由格式 SQL 布林表達式**——單一等式（`TBL_ID = 'A2'`）、複合條件（`TRIM(SYSCD)='CF' AND TRIM(DATAID)='CU'`）、或不設定（absent）。處理方式、限制、方言責任（例如 filter 內若含 `TRIM` 之類函式的 MSSQL/PG 差異）與 `lookupFilter` 完全一致（AC-7）。

## 7. 等價契約（硬性）與 lookup ⇒ code_decode 決定性對應

> US-173 AC-2 為硬性安全網：`code_decode` 輸出必須與等價 `lookup` 節點鏈逐格一致。本節精確定義收斂的雙向對應，使 migration 與 EQ 測試**無歧義**。

### 7.1 收斂前提

一組 `lookup` 節點 `L1..Ln` 可收斂為**一個** `code_decode` 節點，當且僅當：

- **(前提 A)** 全部解析到**同一張**字典表：`lookupRef` 相同（或在無 `lookupRef` 時 `lookupSource` 相同）；
- **(前提 B)** 全部 `noMatchStrategy = 'null'`（LEFT JOIN 語意）。

> `customer_core` 現行全部 lookup 皆 `noMatchStrategy = 'null'`（= LEFT JOIN），前提 B 全數成立。不滿足前提者維持 `lookup`（AC-8）。

### 7.2 正向對應（N 個 lookup ⇒ 1 個 code_decode）

節點級（取自群組共用值）：

| code_decode 節點欄位 | 取值 |
|---------------------|------|
| `lookupRef` | `Lᵢ.lookupRef`（群組共用） |
| `lookupSource` | `Lᵢ.lookupSource`（群組共用） |
| `lookupSourceId` | `Lᵢ.lookupSourceId`（群組共用，若有） |

mapping 級（每個 `Lᵢ` ⇒ 一個 `Mᵢ`，逐欄搬移、零重塑）：

| code_decode `mappings[i]` 欄位 | 取自 `Lᵢ` |
|-------------------------------|-----------|
| `matchColumn` | `Lᵢ.matchColumn` |
| `lookupMatchColumn` | `Lᵢ.lookupMatchColumn` |
| `filter` | `Lᵢ.lookupFilter`（`Lᵢ` 無 `lookupFilter` ⇒ `filter` 不設定） |
| `outputColumns` | `Lᵢ.outputColumns`（同一 `[{lookupColumn, outputAlias}]` 清單，原樣搬移） |

- **mapping 順序** = 來源 `lookup` 節點在 pipeline 定義中的順序，使輸出欄加入順序決定性。
- **`noMatchStrategy` 無對應欄位**：`code_decode` 固定 LEFT JOIN（§5.2），前提 B 保證來源皆為 `'null'`，故無資訊遺失。

### 7.3 反向對應（1 個 code_decode ⇒ N 個 lookup）

`code_decode` 的每個 `mappings[i]` ⇒ 一個 `lookup` 節點：`matchColumn` / `lookupMatchColumn` = 同名欄位、`lookupFilter` = `mappings[i].filter`、`outputColumns` = `mappings[i].outputColumns`、`noMatchStrategy = 'null'`、`lookupRef`/`lookupSource` = 節點級來源。供 pipeline 定義 migration 的 `down()` 還原舊 lookup 鏈使用（migration 本身交 tdd-implementation，見 §15 OQ-F110-03）。

### 7.4 等價的判定（EQ）

給定**相同輸入 DataSet**：以（a）§7.2 前的 `lookup` 鏈與（b）收斂後的 `code_decode` 分別執行，**每一列、每一個 `outputAlias` 欄位的值逐格相同**（含 NULL、含 §6.3 的 TRIM／cast／重複 key 取首筆），即為等價。此為 `code_decode` 上線取代 `lookup` 鏈的 DoD 門檻（US-173 AC-2）。

## 8. 商業規則（BR）

| 規則編號 | 說明 |
|---|---|
| BR-1 | **單一共用字典**：一個 `code_decode` 節點只解析一張字典表（節點級 `lookupRef`/`lookupSource`），全部 mapping 共用（§6.1）。 |
| BR-2 | **per-mapping filter**：每個 mapping 各自帶選用 `filter`（自由格式 SQL 布林式），語意等同 lookup `lookupFilter`；無 filter ⇒ 對整張字典 JOIN（§6.4b / AC-7）。 |
| BR-3 | **固定 LEFT JOIN / NULL**：無對應 ⇒ `outputAlias` = NULL、不刪列；不提供 `noMatchStrategy`／`defaultValue`（§5.2 / AC-3）。 |
| BR-4 | **輸出 = 原欄 + 全部描述欄**：輸出欄位 = 輸入欄位 ∪ 全部 mapping 的 `outputAlias`；`rowCount` 不變（§6.2 / AC-2）。 |
| BR-5 | **正規化逐一對齊 lookup**：join key 與輸出值的 TRIM + 文字 cast、重複 key 取首筆，與 [F043 §4.8](F043-etl-node-executors.md) 完全相同（§6.3，等價前提）。 |
| BR-6 | **逐格等價（硬性）**：輸出須與等價 lookup 鏈逐格一致（含 NULL）；為上線前提（§7.4 / AC-4）。 |
| BR-7 | **決定性收斂對應**：一組同字典（前提 A）且全 `noMatchStrategy='null'`（前提 B）的 lookup ⇔ 一個 code_decode，逐欄對應（§7）。 |
| BR-8 | **alias 全域唯一**：節點內跨全部 mapping 的 `outputAlias` 必須唯一（AC-10）。 |
| BR-9 | **≥ 1 mapping**：`mappings` 至少 1 組；允許單一 mapping（§6.4a / AC-6）。 |
| BR-10 | **additive**：`lookup` 節點類型不受影響、持續可用；`code_decode` 為新增（§1 / AC-8）。 |
| BR-11 | **PG/MSSQL 逐格一致**：同輸入下 PG 與 MSSQL 輸出 byte-identical（AC-9）。 |
| BR-12 | **決定性（無隨機）**：輸出欄加入順序依 mapping 順序、再依 outputColumns 順序；不引入任何非決定性（§6.2）。 |

## 9. 效能理據（brief）

- **問題**：一組打同一張小字典（約 3,000 列）的 lookup，各自對整條大分支（約 360 萬列）做「就地全表 UPDATE」（全程記錄交易記錄檔的隨機堆積更新），每個 5–11 分鐘；19 個此類 lookup 使大分支解碼逾 45 分鐘。
- **收斂**：把 N 次「全表更新 + 各自查字典」改為**一次資料流掃描 + N 個 LEFT JOIN**，一次補齊所有描述欄。相同 360 萬列做一次最小記錄的整表寫入約 30 秒等級（story 佐證）。
- **達標基準**（US-173 AC-3）：大分支解碼總耗時由 45 分鐘以上降至約 3 分鐘以內，以 **dev MSSQL 2022（dev CDMP）真實 `customer_core` 全量（約 360 萬列）端對端 live 重跑**量測為準（非抽樣／估算）。
- **本 spec 不指定實體執行方式**（`SELECT INTO` vs 就地 `UPDATE`、`##temp`、批次策略），交 AD-E07-41（§15 OQ-F110-01）。此節點的**存在理由**即效能；但「怎麼跑得快」是架構決策。

## 10. 邊界情況

| 情境 | 預期行為 |
|------|---------|
| 輸入 DataSet 為空（`rowCount = 0`） | 回傳空 DataSet，節點 `'completed'`（與 F043 §6 全節點慣例一致） |
| 字典表為空（或某 mapping filter 過濾後為空） | 該 mapping 全部 `outputAlias` = NULL；`rowCount` = 輸入列數（與 lookup「空對照集」邊界一致，[F043 §6](F043-etl-node-executors.md)） |
| 主資料列 `matchColumn` 為 NULL | 該列該 mapping 的 `outputAlias` = NULL（NULL key 不匹配任何字典列） |
| 字典子集有重複 key | 取首筆匹配列（與 lookup 相同，§6.3 / BR-5） |
| 某 mapping filter 語法錯誤 | 節點 `'failed'`，errorMessage 為「對照表查詢失敗：{error}」（沿用 lookup 慣例，§13） |
| `mappings` 為空陣列 | 節點 `'failed'`（AC-10 / §13） |
| 跨 mapping 出現重複 `outputAlias` | 節點 `'failed'`（AC-10 / BR-8 / §13） |
| 單一 mapping（`mappings` 長度 = 1） | 合法；語意等同單一等價 lookup（§6.4a / AC-6） |
| `outputAlias` 與既有輸入欄同名 | 沿用 lookup 對既有欄的處理（`ADD COLUMN IF NOT EXISTS` + `UPDATE`）；實體處理交架構師（§15 OQ-F110-04），語意上以該 mapping 解碼結果為該欄值 |

## 11. 依賴關係

- **Blocked By**：
  - US-055 / [F042](F042-etl-execution-engine.md)（ETL 執行引擎核心框架）
  - US-058 / [F043 §4.8](F043-etl-node-executors.md)（Lookup 節點雙輸入重設計，作為既有解碼邏輯與正規化的**行為基準**）
- **Blocks / 影響**：
  - `customer_core` Pipeline 定義收斂（移除 31 個 lookup、插入 9 個 code_decode，§14）——由 pipeline 定義 migration 落地（tdd-implementation）
- **架構前置**：AD-E07-41（system-architect；ETL 引擎 MSSQL 化 / temp table 策略，落地 §15 Open Questions）

## 12. 交叉參照

- **節點目錄摘要**：[F043 §4.9 CodeDecodeExecutor](F043-etl-node-executors.md)（本 spec 為其權威細節）
- **對齊基準（lookup）**：[F043 §4.8 LookupExecutor](F043-etl-node-executors.md)（config 欄位名、字串正規化、LEFT JOIN 語意、lookupRef 解析、邊界）
- **引擎契約**：[F042 ETL 執行引擎核心框架](F042-etl-execution-engine.md)（`NodeExecutor` / `NodeExecutionContext` / `DataSet`）
- **既有 lookup handler 程式碼**：`apps/api/src/modules/etl/engine/handlers/lookup-handler.ts`（PG）/ `lookup-handler-mssql.ts`（MSSQL）/ `resolve-raw-table.ts`
- **來源 Story**：[US-173](../../stories/epics/E05-etl-pipeline/US-173-code-decode-node.md)

## 13. 錯誤處理（沿用既有 ETL 慣例，無新錯誤碼）

`code_decode` 沿用 ETL 節點既有的節點級失敗慣例（節點狀態 `'failed'` + errorMessage，非全域錯誤碼目錄）。審查 [error-handling.md](../error-handling.md) 後結論：**無需新增錯誤碼**。

| 錯誤情境 | errorMessage（沿用 lookup 措辭風格） |
|---------|-------------------------------------|
| 主資料流缺失（`inputs` 無 `default`） | `code_decode 節點缺少主資料流輸入` |
| `mappings` 為空 | `code_decode 節點缺少解碼 mapping` |
| mapping 缺 `matchColumn` | `code_decode 節點 mapping 缺少比對欄位（主表）` |
| mapping 缺 `lookupMatchColumn` | `code_decode 節點 mapping 缺少比對欄位（對照表）` |
| mapping 缺 `outputColumns` | `code_decode 節點 mapping 缺少輸出欄位` |
| 跨 mapping `outputAlias` 重複 | `code_decode 節點輸出別名重複：{alias}` |
| 字典來源不可解析 / 表不存在 | `對照表 {source} 不存在`（沿用 lookup） |
| 向下相容模式 lookupRef 查不到且無 lookupSource fallback | `找不到對應的 extraction task（datasourceName: {ds}, sourceTable: {tbl}）且無 lookupSource fallback`（沿用 lookup） |
| mapping filter 語法錯誤 | `對照表查詢失敗：{error}`（沿用 lookup） |

> 具體 errorMessage 文案由 tdd-implementation 落地時對齊 lookup handler 現行措辭；本表定義**情境與語意**，不新增 error-handling.md 錯誤碼。

## 14. 附錄（Informative）：customer_core 具體套用

> 本附錄為**佐證用例**，示範 §5 schema 覆蓋所有 filter 型態與 mapping 組數；**非** `code_decode` 節點的適用範圍限定。`customer_core` Pipeline 現有 31 個 lookup 中符合「同一字典表、多欄代碼解碼」模式者，依**不同字典表實例**自然分組，收斂為 **9 個 `code_decode` 節點**。

### 14.1 收斂總覽

| # | 字典表實例（raw id） | 來源表 | filter 型態 | mapping 數 | 分支 |
|---|----------------------|--------|-------------|-----------|------|
| 1 | `raw_e5a2345c` | 和潤 ZZIP_BAMCODE_D | 單一等式（`TBL_ID='xx'`） | 9 | 大分支（≈360 萬列） |
| 2 | `raw_6fce5258` | 和勁 ZZIP_BAMCODE_D | 單一等式 | 7 | 大分支 |
| 3 | `raw_b4a48f10` | ZZIP_BAMPOST_M | 無 filter | 3 | 大分支 |
| 4 | `raw_8b80671e` / `raw_9dd0eca5` / `raw_9dcaf414` | MLMCODE ×3 | 複合條件（`TRIM(SYSCD)='CF' AND TRIM(DATAID)='xx'`） | 各 3（3 節點） | 小型合併分支 |
| 5 | `raw_b9558d10` / `raw_3acd58e7` / `raw_afe6a874` | MLSTDINDUMF ×3 | 無 filter | 各 1（3 節點） | 小型合併分支 |

- 節點數：1 + 1 + 1 + 3 + 3 = **9 個 `code_decode`**。
- mapping / lookup 數：9 + 7 + 3 + (3×3) + (1×3) = **31**（＝原 31 個 lookup，1:1 收斂）。
- schema 覆蓋驗證：**單一等式 filter**（#1/#2）、**複合 filter**（#4）、**無 filter**（#3/#5）、**多 mapping**（#1 九組）、**單一 mapping**（#5）皆涵蓋。
- 全部來源 lookup `noMatchStrategy = 'null'`（前提 B 成立，§7.1）。

### 14.2 #1 `raw_e5a2345c`（和潤 ZZIP_BAMCODE_D）— 9 mappings

節點級：`lookupSource = raw_e5a2345c`。每組 `lookupMatchColumn = TBL_CD`、`outputColumns = [{ lookupColumn: TBL_DESC1, outputAlias: <下表> }]`；`filter` 為 `TBL_ID = '<代碼>'`：

| `matchColumn` | `filter` | `outputAlias` |
|---------------|----------|---------------|
| `EDUCAT_BACK` | `TBL_ID = 'A2'` | `education_desc` |
| `VOCATION_CODE` | `TBL_ID = 'A4'` | `occupation_desc` |
| `JOB_TITLE` | `TBL_ID = 'A5'` | `job_title_desc` |
| `CMARRY_MK` | `TBL_ID = '33'` | `marital_status_desc` |
| `CUSTOM_MK` | `TBL_ID = '55'` | `customer_type_desc` |
| `INCOME_SOURCE` | `TBL_ID = 'Y0'` | `income_source_desc` |
| `INDUSTRY` | `TBL_ID = 'AA'` | `industry_desc` |
| `JOB_LEVEL` | `TBL_ID = 'A6'` | `job_level_desc` |
| `MONTH_INCOME` | `TBL_ID = 'A3'` | `monthly_income_desc` |

### 14.3 #2 `raw_6fce5258`（和勁 ZZIP_BAMCODE_D）— 7 mappings

結構同 #1（`lookupMatchColumn = TBL_CD`、`lookupColumn = TBL_DESC1`、`filter = TBL_ID = '...'`），為 #1 的子集（7 組）。

### 14.4 #3 `raw_b4a48f10`（ZZIP_BAMPOST_M）— 3 mappings，無 filter

郵遞區號對應城市，無 filter；`lookupMatchColumn` / `lookupColumn` 沿用既有 lookup 節點設定（郵遞區號欄 / 城市名欄）：

| `matchColumn` | `filter` | `outputAlias` |
|---------------|----------|---------------|
| `HPOST_NUM` | （無） | `hpost_city` |
| `CPOST_NUM` | （無） | `cpost_city` |
| `CO_NUM` | （無） | `co_city` |

### 14.5 #4 MLMCODE ×3（`raw_8b80671e` / `raw_9dd0eca5` / `raw_9dcaf414`）— 各 3 mappings，複合 filter

三個 MLMCODE 字典表實例（對應三個來源系統分支），**各收斂為一個 `code_decode` 節點**，每節點 3 組 mapping（`filter = TRIM(SYSCD)='CF' AND TRIM(DATAID)='<代碼>'`）：

| `matchColumn` | `filter`（DATAID） | `outputAlias` |
|---------------|-------------------|---------------|
| `CUTYPE` | `... AND TRIM(DATAID)='CU'` | `customer_type_desc` |
| `EMPLOYEE` | `... AND TRIM(DATAID)='BM'` | `employee_count_desc` |
| `LISTED` | `... AND TRIM(DATAID)='03'` | `is_listed_desc` |

### 14.6 #5 MLSTDINDUMF ×3（`raw_b9558d10` / `raw_3acd58e7` / `raw_afe6a874`）— 各 1 mapping，無 filter

三個字典表實例各收斂為一個 `code_decode` 節點，每節點單一 mapping（`INDUID → industry_desc`，無 filter）。**印證 §6.4a**：單一 mapping 表仍統一走 `code_decode`（可選但一致）。

### 14.7 alias 於不同節點重複的說明

`customer_type_desc`（#1 `CUSTOM_MK` 與 #4 `CUTYPE`）、`industry_desc`（#1 `INDUSTRY` 與 #5 `INDUID`）等 `outputAlias` 在**不同的 `code_decode` 節點**（不同字典、ZZIP vs MLMC 不同分支）各自產生，最終由下游 merge / 衝突解決（[F043 §4.2 / §4.7](F043-etl-node-executors.md) 的 m4 / cd1）決定採用值。BR-8 的 alias 唯一性約束為**節點內**（跨同一節點的全部 mapping），上述跨節點重複不違反 BR-8。

## 15. 假設與待架構師裁示（Open Questions）

### 15.1 假設

| # | 假設 | 標記 |
|---|------|------|
| A-1 | `customer_core` 現行全部 lookup 皆 `noMatchStrategy = 'null'`（= LEFT JOIN），滿足 §7.1 前提 B，可全數收斂 | [ASSUMPTION] tdd 落地時逐節點核對 |
| A-2 | 同一字典表實例的一組 lookup 具相同 `lookupRef`（或無 `lookupRef` 時相同 `lookupSource`），滿足前提 A | [ASSUMPTION] 由 pipeline 定義核對 |
| A-3 | #3 / #4 / #5 的 `lookupMatchColumn` / `lookupColumn` 由既有對應 lookup 節點 1:1 搬移（本 spec 未逐一列舉者，以既有節點設定為準） | [ASSUMPTION] migration 讀既有節點 |
| A-4 | 字典來源解析（lookupRef 動態解析 / lookupSource fallback）沿用 lookup 的既有機制，不新增解析路徑 | [RESOLVED] 對齊 F043 §4.8 |

### 15.2 Open Questions（交 system-architect / AD-E07-41）

| ID | 問題 | spec-writer 建議預設 |
|----|------|---------------------|
| OQ-F110-01 | **實體執行策略**：單趟 N 個 LEFT JOIN 應以何種方式落地（`SELECT INTO` 一次寫出 vs 就地 `ALTER + UPDATE`）？`##temp` 生命週期、MSSQL/PG 方言（TRIM／文字 cast 對應）、批次策略為何？ | 建議沿用 AD-E07-41 既有 ETL temp table 架構（`SELECT INTO` + `##global temp` + 消費完即 DROP）；JOIN key / 輸出正規化對齊 lookup handler（PG `TRIM(col::text)`、MSSQL 對應）。等價基準見 §7.4。 |
| OQ-F110-02 | **雙輸入模式是否支援**：`code_decode` 是否比照 lookup 支援 `lookup-input` handle（單一上游字典 DataSet）？`customer_core` 全部用例為向下相容模式（`lookupSource` + per-mapping filter）。 | 建議向下相容模式為主（覆蓋全部真實用例）；雙輸入為與 lookup 對稱之選配，filter 於兩模式皆套用（§6.1）。 |
| OQ-F110-03 | **pipeline 定義 migration**：移除 31 個 lookup、插入 9 個 code_decode 的成對 PG/MSSQL data-update migration，`down()` 依 §7.3 還原舊 lookup 鏈——落點與實作。 | 屬 tdd-implementation 範疇；本 spec §7 提供無歧義的雙向對應規則。US-173 待解決問題已裁定「回滾以 migration `down()`，不保留舊節點並存」。 |
| OQ-F110-04 | **`outputAlias` 與既有輸入欄同名**之實體處理（沿用 lookup `ADD COLUMN IF NOT EXISTS` + `UPDATE`）。 | 建議沿用 lookup 行為（以該 mapping 解碼結果為該欄值）；語意見 §10 末列。 |
| OQ-F110-05 | **NodeExecutor 註冊 / dispatcher 接線 / F029 編輯器 UI**：新增 `code-decode-handler.ts`（PG）+ `code-decode-handler-mssql.ts`（MSSQL）並於 `node-dispatcher` 註冊；[F029](F029-pipeline-editor.md) 畫布是否需 code_decode 節點設定 UI？ | 建議先支援「由 seed / migration 建立」（`customer_core` pipeline 即此模式，與既有 lookup 相同）；F029 編輯器對 code_decode 的視覺化設定為後續 story，非本 spec 範圍。 |

## 16. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-07-09 | 初版（US-173）：新增泛用轉換節點 `code_decode`。定義 config schema（節點級單一共用字典來源 `lookupRef`/`lookupSource` + `mappings[]`，欄位名沿用 lookup、per-mapping `matchColumn`/`lookupMatchColumn`/選用 `filter`/`outputColumns` 清單）；固定 LEFT JOIN/NULL 語意（不提供 noMatchStrategy/defaultValue）；單趟多 mapping 資料流語意（dialect-neutral，實體執行交 AD-E07-41）；字串 TRIM/cast/重複 key 取首筆逐一對齊 lookup（等價前提）；**逐格等價契約（US-173 AC-2 硬性）** + 「N 個同字典 lookup ⇔ 1 個 code_decode」雙向決定性對應（供 EQ 測試與 migration down()）；裁定 spec 層兩問題（(a) 單一 mapping 表允許且 customer_core 一律採用、(b) filter = 同 lookupFilter 之自由格式 SQL 布林式）；效能理據；informative 附錄（customer_core 5 字典表實例 → 9 節點 / 31 mapping，涵蓋全部 filter 型態與 mapping 組數）。5 個架構 OQ（OQ-F110-01~05）交 system-architect（AD-E07-41）。 |
