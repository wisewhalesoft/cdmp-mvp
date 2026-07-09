# US-173：Code Decode 節點（泛用單趟多欄位代碼解碼）

> **Story ID**：US-173
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** Admin（管理者）
**I want** 在 Pipeline 中使用一個**泛用（generic）**的 `code_decode` 節點，可對**任何一張**對照字典表，以任意數量、任意 filter 條件（單一等式、複合條件、或無 filter）的多組「代碼欄位 → 描述欄位」mapping，一次解碼完成
**So that** 不需要為每一組「同表多欄代碼解碼」各建一個 Lookup 節點、逐一全表掃描更新，Pipeline 執行時間從近 1.5 小時降到可接受的分鐘級，且畫布上的節點結構更精簡、更容易維護 — 此節點類型不綁定特定資料來源，未來任何符合「同一字典表、多欄代碼解碼」模式的情境皆可套用

---

## 背景

### 現有設計問題（已在真實 dev MSSQL 2022 環境量測，作為問題根因的具體佐證）

`customer_core`（客戶主檔）ETL Pipeline 目前有 31 個 Lookup 節點，其中多組 Lookup **對照的是同一張字典表**，只是用不同的過濾條件（如 `TBL_ID = 'A2'`、複合條件 `SYSCD + DATAID`，或無篩選）各自取出一欄描述。每個 Lookup 節點的實作方式是對整個分支資料做一次「就地全表 UPDATE」（`ALTER TABLE ADD col; UPDATE ... FROM ... JOIN dict ...`），這種寫法在大資料量分支（約 360 萬列）上，每個 Lookup 節點需要 5–11 分鐘（全程記錄交易記錄檔的隨機堆積更新），導致整條 Pipeline 需要約 1.5 小時，實務上已不堪使用。

相對地，同一份 360 萬列資料做一次 `SELECT ... INTO`（最小記錄交易）大約只需 30 秒。由於這些 Lookup 節點打的是**同一張、體積很小（約 3000 列）**的字典表，理論上可以把 N 次「全表更新＋各自查字典」合併成**一次資料流掃描、N 個 LEFT JOIN**，一次補齊所有描述欄位。這是一個**泛用模式**（同一字典表 + 多組代碼欄位解碼），不限於任何特定資料來源。

### 新設計方向：泛用節點類型

新增一種 ETL 轉換節點類型 `code_decode`（代碼字典解碼／單趟多重解碼）。此節點為**泛用（generic）**設計：可對**任何一張**對照字典表，在**一次資料流掃描**中，同時執行任意數量組「代碼欄位 → 描述欄位」的解碼，每組可各自帶**任意 filter 表達式**（單一等式如 `TBL_ID = 'A2'`、複合條件如 `SYSCD + DATAID`、或無 filter），取代原本需要 N 個各自全表更新的 Lookup 節點。節點本身不綁定 ZZIP、不綁定任何特定資料集或欄位命名，只要符合「同一字典表、多欄代碼解碼」這個模式即可套用。

`code_decode` 節點與現有 `lookup` 節點是**新增的另一種節點類型**，不修改、不淘汰 `lookup` 節點本身；`lookup` 節點在其他 Pipeline／情境（含本次未收斂的單一 mapping 情境）下維持原有可用性。

### customer_core 中符合泛用模式的具體情境（佐證資料，非節點適用範圍的限定）

以下為 `customer_core` Pipeline 中，目前 31 個 Lookup 節點裡符合「同一字典表、多欄代碼解碼」模式、可收斂為 `code_decode` 節點的具體字典表實例，依「不同字典表實例」自然分組：

| 字典表實例 | 內容 | 資料量／分支 | 目前耗時 | 效能影響 |
|------|------|------|------|------|
| `raw_e5a2345c`（和潤 ZZIP_BAMCODE_D） | 9 個 Lookup，各以 `TBL_ID` 篩選（教育程度 A2、職業 A4、職稱 A5、婚姻 33、客戶類型 55、收入來源 Y0、行業 AA、職級 A6、月收入級距 A3） | 大分支，360 萬列以上 | 每個 5–11 分鐘 | **高（主要瓶頸之一）** |
| `raw_6fce5258`（和勁 ZZIP_BAMCODE_D） | 同上結構，7 個 Lookup | 同一大分支 | 每個 5–11 分鐘 | **高（主要瓶頸之一）** |
| `raw_b4a48f10`（ZZIP_BAMPOST_M） | 3 個 Lookup，郵遞區號對應城市，無 filter | 同一大分支 | 每個 5–11 分鐘 | **高（同一瓶頸分支）** |
| MLMCODE（3 個表實例：客戶類型／員工／上市櫃） | 各以 `SYSCD + DATAID` 複合條件篩選，共 9 個 Lookup | 小型合併分支 | 每個 0–1 秒 | 低（非效能瓶頸，仍屬同一泛用模式） |
| MLSTDINDUMF（行業） | 3 個 Lookup | 小型合併分支 | 每個 0–1 秒 | 低（非效能瓶頸，僅 1 組 mapping） |

上述 5 個字典表實例、共 31 個 Lookup 節點，全數符合 `code_decode` 節點的泛用適用模式；其中前 3 個（19 個 Lookup）落在大資料量分支，是整條 Pipeline 耗時的主要來源，後 2 個（12 個 Lookup）資料量小、執行時間本身非問題，但仍一體適用同一節點類型（見下方「套用範圍」）。

### 套用範圍（已定案）

因 `code_decode` 為泛用節點類型，**customer_core 中所有「同一字典表、多欄代碼解碼」的 Lookup 群組全面套用**，不因資料量大小或是否為效能瓶頸而排除任何一組。分組方式為**依不同字典表實例自然分組**（上表 5 個字典表實例 → 對應數量的 `code_decode` 節點；MLMCODE 的複合 `SYSCD+DATAID` filter 只是節點支援的其中一種 filter 表達式，不構成額外的範圍決策）。單一 mapping 即可涵蓋、無合併效益的字典表（如 MLSTDINDUMF，僅 1 組 mapping）是否仍統一走 `code_decode`、或維持 `lookup` 節點，屬節點粒度設計細節，留給 spec-writer 決定，不影響本 story 的業務範圍定案。

---

## 驗收標準

### AC-1：泛用單趟多欄位解碼

- **Given** 一個 `code_decode` 節點設定了對照**任何一張**字典表的多組「代碼欄位 → 描述欄位」解碼規則，每組可各自帶**任意 filter 表達式**（單一等式、複合條件、或無 filter）
- **When** 該節點執行
- **Then** 節點在一次資料流掃描中完成所有代碼欄位的解碼，輸出資料集包含原始欄位與所有新增的描述欄位，不因字典表內容、mapping 組數或 filter 型態不同而需要不同的節點類型
- **And** 產生的描述欄位名稱與內容，對應到它所取代的那一組 Lookup 節點原本各自產生的欄位名稱與內容

### AC-2：解碼結果與現有 Lookup 鏈完全一致（硬性要求，安全網）

- **Given** 相同的輸入資料，分別以（a）現行 Lookup 節點鏈與（b）新的 `code_decode` 節點執行解碼
- **When** 比對兩者輸出
- **Then** 每一列、每一個描述欄位的值必須逐格（cell-for-cell）完全相同，包含代碼在字典表中查無對應時，兩者皆須以 NULL 表示（LEFT JOIN／查無對應＝NULL 語意須保持一致）
- **And** 此一致性是本節點類型可上線取代既有 Lookup 節點鏈的前提條件，非「差不多即可」

### AC-3：效能提升（非功能）

- **Given** `customer_core` Pipeline 全面套用 `code_decode` 節點後（31 個 Lookup 節點收斂為對應數量的 `code_decode` 節點，依字典表實例分組），其中落在大資料量分支（約 360 萬列以上）的解碼群組
- **When** 以收斂後的 `code_decode` 節點取代原本對應的 Lookup 節點群組執行
- **Then** 該大資料量分支的解碼總耗時應由目前的 45 分鐘以上（19 個 Lookup 節點各 5–11 分鐘的總和）大幅降至約 3 分鐘以內，作為本節點類型效能達標的判斷基準
- **And** 小資料量分支（MLMCODE／MLSTDINDUMF 群組）雖非效能瓶頸，仍須維持解碼結果正確（見 AC-2），全面套用不得使其效能劣化
- **And** 效能提升的量測基準為 dev MSSQL 2022（dev CDMP）真實 `customer_core` 全量資料（約 360 萬列）下的端對端 live 重跑執行時間，非抽樣或估算

### AC-4：既有 Lookup 節點類型持續可用

- **Given** `code_decode` 為泛用節點類型，`customer_core` 中所有符合「同一字典表、多欄代碼解碼」模式的 Lookup 群組皆已收斂套用（無範圍排除）
- **When** 新增 `code_decode` 節點類型後
- **Then** `lookup` 節點類型本身不被修改或淘汰，其行為、可用性、設定方式完全不受影響，持續可用於系統中其他 Pipeline，以及 `customer_core` 中未被收斂的情境（如單一 mapping、無合併效益的字典表，屬 spec 層決定）
- **And** 兩種節點類型（`lookup` 與 `code_decode`）並存於系統中

### AC-5：PostgreSQL 行為維持不變

- **Given** 本專案目前處於 PostgreSQL → MSSQL 遷移期間（新增功能，非既有行為變更）
- **When** `code_decode` 節點在 PostgreSQL 環境下執行
- **Then** 輸出結果須與 MSSQL 環境下逐格一致（byte-identical），不因資料庫後端不同而產生解碼結果差異

---

## 待解決問題（已由利害關係人確認，記錄結論）

- [x] **GROUP C（MLMC，12 個 Lookup）是否納入收斂範圍？** → **納入**。`code_decode` 為泛用節點類型，非 ZZIP 限定，對 `customer_core` 中所有「同一字典表、多欄代碼解碼」群組一體適用，不再有「選配範圍」的概念。
- [x] **`code_decode` 節點的分組邊界？** → **依「不同字典表實例」自然分組**（見上方套用範圍表：`raw_e5a2345c`／`raw_6fce5258`／`raw_b4a48f10`／MLMCODE ×3／MLSTDINDUMF，共 5 個字典表實例）。MLMCODE 的複合 `SYSCD+DATAID` filter 只是節點支援的一種 filter 表達式，非額外範圍決策。
- [x] **現有 Lookup 節點是否保留供比對／回滾？** → **不保留，直接從 Pipeline 定義移除**已收斂的舊 Lookup 節點（保留舊節點會使其照常執行，效能未獲改善，喪失本 story 的效益）。回滾機制改以**成對的 PG／MSSQL data-update migration 的 `down()`** 還原舊 Pipeline 定義，非透過保留舊節點並存的方式回滾。
- [x] **效能達標基準的量測環境？** → **以 dev MSSQL 2022（dev CDMP）真實 `customer_core` 全量（約 360 萬列）資料，端對端 live 重跑量測為準**，非抽樣或估算。

## 尚待 Spec 層決定（非本 story 業務範圍開放問題，僅供 spec-writer 參考）

- 單一 mapping 即可涵蓋、無合併效益的字典表（如 MLSTDINDUMF，僅 1 組 mapping）是否仍統一走 `code_decode`、或維持 `lookup` 節點，屬節點粒度設計取捨。
- `code_decode` 節點的內部設定（config）結構、各組 mapping 的 filter 表達式語法。

---

## 依賴關係

- **Blocked By**：US-055（ETL 執行引擎核心框架）、US-058（Lookup 節點雙輸入重設計，作為既有解碼邏輯的行為基準）
- **Blocks**：無

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-5 全數確認達成
- [x] 業務範圍待解決問題已取得利害關係人確認並記錄結論（見上方「待解決問題」區塊）
- [ ] `code_decode` 節點的規格（spec）、架構決策、測試案例由後續 agent（spec-writer / system-architect / test-designer / tdd-implementation）依本 story 之業務意圖與驗收標準展開，含「尚待 Spec 層決定」項目的落地

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **既有解碼行為基準**：[US-058 Lookup 節點雙輸入重設計](US-058-lookup-node-dual-input.md)
- **執行引擎框架**：[US-055 ETL 執行引擎核心框架](US-055-etl-execution-engine-core.md)
