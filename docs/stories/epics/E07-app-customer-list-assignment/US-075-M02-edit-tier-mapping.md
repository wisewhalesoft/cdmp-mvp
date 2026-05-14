# US-075：編輯 TIER_LEVEL 對應表

> **Story ID**：US-075
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 5 — TIER_LEVEL 對應）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **版本**：v2（2026-05-14 — 重大改寫：TIER_LEVEL HARDCODE T1~T10、Fallback/Standard 互斥語意重定義、依 Tab 1 選中 CARD_TYPE 篩選、舊後綴值遷移規則補入、US-097 內容併入本 Story）

---

## User Story

**As a** 業務主管
**I want** 維護選定計分卡類型（CARD_TYPE）的 TIER_LEVEL 對應設定，包含「標準規則（CARD_LEVEL 非空）」與「Fallback 規則（CARD_LEVEL 為空，不分等級）」兩種對應模式
**So that** 確保月跑 Stage 2 計分結果能正確分群至外部系統使用的 TIER_LEVEL，避免後續分派與通報資料錯誤

---

## 背景說明

### TIER_LEVEL 對應邏輯

TIER_LEVEL 對應邏輯源自舊系統 Stored Procedure（`Stage2_依照CardType分類TierLevel.sql`），核心邏輯為：

```sql
LEFT JOIN OBTIER C ON A.CARD_LEVEL = C.CARD_LEVEL AND B.CARD_TYPE = C.CARD_TYPE
```

亦即 `OBTIER`（AppDB：`ob_tier`）表以 `(CARD_TYPE, CARD_LEVEL)` 作為複合 key，對應至 `TIER_LEVEL`。此表與 US-074 所維護的 `ob_levelcard_level`（CARD_LEVEL 分級門檻）是**不同概念的兩張獨立表**：

| 表 | 用途 |
|---|---|
| `ob_levelcard_level` | 計算總分後判定 CARD_LEVEL（A/B/C/D…） |
| `ob_tier` | 依 CARD_TYPE × CARD_LEVEL 推算 TIER_LEVEL（T1/T2/…/T10） |

### Standard vs Fallback 規則（互斥定義）

| 規則類型 | card_level 欄位 | 語意 |
|----------|-----------------|------|
| Standard | 非空（如 A/B/C/D） | 該 CARD_TYPE 依 CARD_LEVEL 分別對應不同 TIER_LEVEL |
| Fallback | NULL（空） | 該 CARD_TYPE 不分等級，全部客戶一律對應至指定的 TIER_LEVEL |

同一 CARD_TYPE 下，Standard 列與 Fallback 列**互斥不可並存**：
- 若該 CARD_TYPE 在 `ob_tier` 已有任一筆 card_level 非空的 Standard 列 → 禁止再新增 Fallback 列
- 若該 CARD_TYPE 已有一筆 card_level IS NULL 的 Fallback 列 → 禁止再新增任何 Standard 列
- 切換規則模式必須先刪除既有列再新增，避免語意模糊；違反互斥限制回傳 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`

### TIER_LEVEL 有效值簡化

v2 起，TIER_LEVEL 有效值由原本的後綴變體（T1M / T1HM / T32 / T51 等）統一為整數值 **T1 ~ T10**（HARDCODE），以下拉選單提供，不允許自由輸入。

**舊後綴值遷移規則**（遷移腳本執行）：

| 舊值 | 新值 | 說明 |
|------|------|------|
| T1M、T1HM | T1 | 取前綴數字，去後綴 |
| T2HM、T3HM | T2、T3 | 取前綴數字，去後綴 |
| T3M、T32 | T3 | 取前綴數字 3 |
| T4 | T4 | 無後綴，不變 |
| T51、T52 | T5 | 取前綴數字 5 |
| T5M | T5 | 取前綴數字 5 |
| THC | T1 | 汽車 high-credit 最高層級，遷移至 T1（OQ新-2 決議，2026-05-14） |
| T3C | T3 | 取前綴數字 3 |

---

## 驗收標準

### AC-1：依選中 CARD_TYPE 顯示 TIER_LEVEL 對應列

- **Given** 業務主管已在 Tab 1 選中某 CARD_TYPE，並切換至 Tab 5（TIER_LEVEL 對應）
- **When** Tab 5 載入完成
- **Then** 顯示 `ob_tier WHERE card_type = :selectedCardType` 的所有對應列，欄位包含：CARD_LEVEL（standard 列顯示等級代碼如 A/B/C/D，fallback 列顯示「（無 — Fallback）」）、TIER_LEVEL（T1~T10 值）、LIST_NM（描述性欄位，可空）
- **And** 清單依 CARD_LEVEL 升冪排序，fallback 列（card_level IS NULL）排在末尾
- **And** Fallback 列以視覺提示區分（如紫色底色或「Fallback」標籤）
- **And** Tab 5 頂部清楚標示目前操作的 CARD_TYPE（如「正在編輯：H — 汽車期中名單」）

### AC-2：修改對應關係（TIER_LEVEL 下拉 T1~T10）

- **Given** 對應表已顯示，業務主管點擊某列進入編輯
- **When** 業務主管修改 TIER_LEVEL 值（下拉選單），點擊儲存
- **Then** `ob_tier` 該列的 `tier_level` 欄位更新
- **And** TIER_LEVEL 下拉選單顯示 T1 / T2 / T3 / T4 / T5 / T6 / T7 / T8 / T9 / T10 共 10 個選項，**不允許自由文字輸入**
- **And** 顯示儲存成功提示，並記錄操作者與操作時間至 `assignment_audit_log`（action='UPDATE', entity_type='ob_tier', entity_id='{cardType}|{cardLevel ?? ""}'）

### AC-3：新增 Standard 對應列

- **Given** 業務主管點擊「新增對應」，選擇規則類型為「Standard（依等級）」
- **When** 填入 CARD_LEVEL（必填，下拉來源：目前選中 CARD_TYPE 的 `ob_levelcard_level` 有效等級）、TIER_LEVEL（必填，T1~T10 下拉）、LIST_NM（選填），點擊確認
- **Then** `ob_tier` 新增一列（card_type = 選中的 CARD_TYPE，card_level = 填入值），顯示新增成功提示
- **And** 若 `(card_type, card_level)` 複合 key 已存在，回傳 422 `TIER_LEVEL_DUPLICATE`，訊息：「CARD_TYPE {cardType} × CARD_LEVEL {cardLevel} 的對應已存在，請修改現有列」
- **And** 若該 CARD_TYPE 已存在 fallback 列（card_level IS NULL），回傳 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`，訊息：「CARD_TYPE {cardType} 已有 Fallback 規則，請先移除後再新增 Standard 對應」

### AC-4：新增 Fallback 對應列（CARD_LEVEL 為空）

- **Given** 業務主管點擊「新增對應」，選擇規則類型為「Fallback（不分等級）」
- **When** 填入 TIER_LEVEL（必填，T1~T10 下拉）、LIST_NM（選填），CARD_LEVEL 欄位自動帶入「不分等級（NULL）」，點擊確認
- **Then** `ob_tier` 新增一列（card_type = 選中的 CARD_TYPE，card_level IS NULL），顯示新增成功提示
- **And** 若選中 CARD_TYPE 的 fallback 列（card_level IS NULL）已存在，回傳 422 `TIER_LEVEL_DUPLICATE`，訊息：「CARD_TYPE {cardType} 的 Fallback 對應已存在，請修改現有列」
- **And** 若該 CARD_TYPE 已存在任一 Standard 列（card_level 非空），回傳 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`，訊息：「CARD_TYPE {cardType} 已有 {N} 筆 Standard 規則，請先移除後再新增 Fallback 對應」
- **And** 新增 Fallback 列時不觸發「CARD_LEVEL 必須存在於 ob_levelcard_level」的驗證（AC-3 的驗證不適用於 fallback 場景）

### AC-5：刪除對應列

- **Given** 業務主管點擊某列的「刪除」，確認刪除
- **When** 確認刪除動作
- **Then** `ob_tier` 移除該列（hard delete），顯示刪除成功提示
- **And** 刪除記錄寫入 `assignment_audit_log`（action='DELETE', entity_type='ob_tier', entity_id='{cardType}|{cardLevel ?? ""}', before_payload 含 tierLevel 值）
- **And** 刪除 fallback 列時，API 接受 cardLevel 參數為省略或明確 null（不可傳空字串，以區別 Standard 的 CARD_LEVEL 操作）

### AC-6：月跑執行中禁止修改

- **Given** 目前 `assignment_run` 有 status IN ('pending', 'running') 的紀錄
- **When** 業務主管嘗試修改對應表
- **Then** 編輯 / 新增 / 刪除按鈕均 disabled，顯示「分派執行中，無法修改計分設定」提示
- **And** API 回傳 409 `SCORING_VERSION_LOCKED`

### AC-7：未選中 CARD_TYPE 時的提示

- **Given** Tab 1 的 CARD_TYPE 清單為空，或業務主管尚未在 Tab 1 選中任何一筆
- **When** 業務主管切換至 Tab 5
- **Then** Tab 5 顯示提示：「請先在 Tab 1 選擇計分卡類型以查看設定」

---

## 技術備註

- **舊表名**：`OBTIER`（位於 OB DB，遷移後進 AppDB）；schema 已於 2026-05-05 取得，路徑：`reference/TableSchema/OB/OBTIER.sql`
- **AppDB 對應表名**：`ob_tier`（依 AD-E07-1，採 `ob_` 前綴 snake_case 命名）
- **OBTIER 原表 4 欄結構**（皆 nullable，原表無 PK constraint，無稽核欄位）：

  | 欄位 | 型別 | 說明 |
  |------|------|------|
  | `LIST_NM` | nvarchar(30) NULL | 描述性輔助欄位，不參與 SP join 邏輯，可空 |
  | `CARD_TYPE` | varchar(5) NULL | 計分卡類別，join key |
  | `CARD_LEVEL` | varchar(5) NULL | 計分卡等級，join key；fallback 場景為空 |
  | `TIER_LEVEL` | varchar(5) NULL | 名單級距（輸出值） |

- **複合 Primary Key**：`(card_type, card_level)`，原表無 constraint，遷移至 AppDB 時由 system-architect 補建；CARD_LEVEL 為 NULL 時以 `COALESCE(card_level, '')` 或 PostgreSQL `NULLS NOT DISTINCT` 納入唯一性
- **TIER_LEVEL 有效值（v2）**：HARDCODE T1~T10，前端下拉選單，不允許自由輸入；後端亦驗證值需在 T1~T10 範圍內
- **舊後綴值遷移**：遷移腳本（D3：OBTIER → ob_tier）執行後，所有含後綴的 TIER_LEVEL 值依「背景說明」中的映射表轉換；UI 設計不需特別處理「舊後綴顯示」場景（遷移後資料已為 T1~T10）
- **ob_tier Seed 範圍**：遷移腳本只匯入 `ob_card_type` seed 的 6 個正規 CARD_TYPE（H / S / E / S5 / E5 / M）所對應的 OBTIER 紀錄；OBTIER 中指向 HM / M3 / HC / C3 等過渡 CARD_TYPE 的紀錄不匯入（避免違反 `ob_card_type` FK 約束）；THC→T1 等舊後綴遷移規則套用於上述 6 個正規 CARD_TYPE 範圍內出現的後綴值
- **CARD_TYPE 篩選脈絡**：由 Tab 1（US-093）的選中狀態提供，API 請求帶入 `cardType` query param
- **稽核欄位**：`ob_tier` 原表不含稽核欄位；AppDB 的操作稽核由 `assignment_audit_log` 統一記錄
- **API**：
  - `GET /api/v1/assignment/scoring/tier-mapping?cardType=:selectedCardType`
  - `PUT /api/v1/assignment/scoring/tier-mapping`（批次 UPSERT）
  - `POST /api/v1/assignment/scoring/tier-mapping`（單筆新增）
  - `DELETE /api/v1/assignment/scoring/tier-mapping?cardType=:ct&cardLevel=:cl`（單筆刪除）
  - 詳見 F056 §5

> **[ASSUMPTION]** AppDB `ob_tier` 的複合 PK `(card_type, card_level)` 為遷移時補建，非原表既有 constraint，待 system-architect 確認並補入 `docs/specs/data-model.md`。

---

## 測試案例

### TC-075-01：依選中 CARD_TYPE 顯示對應清單

- **Given**：Tab 1 選中 CARD_TYPE = 'H'；`ob_tier` 中 H 有 A→T1 / B→T2 / C→T3 / D→T4 四筆 standard 對應
- **When**：業務主管切換至 Tab 5
- **Then**：顯示 4 列，CARD_LEVEL 為 A/B/C/D，TIER_LEVEL 為 T1/T2/T3/T4；依 CARD_LEVEL 升冪排序；頂部顯示「正在編輯：H」

### TC-075-02：修改 TIER_LEVEL（T1~T10 下拉）

- **Given**：Tab 1 選中 'H'；H × B 目前對應 T2
- **When**：業務主管從下拉選單選擇「T1」，點擊儲存
- **Then**：`ob_tier` H × B 的 tier_level 更新為 T1；下拉選單中無後綴選項（無 T1M 等）；稽核日誌新增 UPDATE 紀錄

### TC-075-03：新增 Standard 對應（CARD_LEVEL 驗證）

- **Given**：Tab 1 選中 'H'；`ob_levelcard_level` 中 H 有 A/B/C/D
- **When**：業務主管新增 CARD_LEVEL='A'、TIER_LEVEL='T1'
- **Then**：若 (H, A) 已存在，顯示 422 TIER_LEVEL_DUPLICATE；否則新增成功

### TC-075-04：新增 Fallback 對應（CARD_LEVEL 為空）

- **Given**：Tab 1 選中 'M3'；`ob_tier` 中 M3 無任何對應
- **When**：業務主管選擇「Fallback（不分等級）」，填入 TIER_LEVEL='T5'，點擊確認
- **Then**：`ob_tier` 新增 (M3, NULL, T5)；清單顯示「M3 — （無 — Fallback） — T5」，以紫色底色標示

### TC-075-05：刪除 Standard 對應列

- **Given**：`ob_tier` 中 H × C 的對應存在
- **When**：業務主管點擊刪除並確認
- **Then**：`ob_tier` 移除 H × C；稽核日誌記錄刪除操作

### TC-075-06：刪除 Fallback 對應列

- **Given**：`ob_tier` 中 M3 × NULL 的 fallback 對應存在
- **When**：業務主管點擊刪除並確認
- **Then**：`ob_tier` 移除 (M3, NULL)；稽核日誌 entity_id='M3|'（cardLevel 部份留空）

### TC-075-07：月跑執行中禁止修改

- **Given**：`assignment_run` 有 status = 'running' 的紀錄
- **When**：業務主管進入 Tab 5
- **Then**：編輯 / 新增 / 刪除按鈕均 disabled；顯示「分派執行中，無法修改計分設定」提示

### TC-075-08：切換 CARD_TYPE 後 Tab 5 自動刷新

- **Given**：Tab 5 顯示 CARD_TYPE = 'H' 的 4 筆對應
- **When**：切換 Tab 1 選中 'S'，再切回 Tab 5
- **Then**：Tab 5 改顯示 'S' 的對應清單

### TC-075-09：互斥檢查 — 已有 Standard 列時禁止新增 Fallback

- **Given**：Tab 1 選中 'H'；`ob_tier` 中 H 已有 A→T1 / B→T2 等 Standard 對應列
- **When**：業務主管選擇「Fallback（不分等級）」新增 TIER_LEVEL='T1'，點擊確認
- **Then**：回傳 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`，訊息「CARD_TYPE H 已有 2 筆 Standard 規則，請先移除後再新增 Fallback 對應」；`ob_tier` 無新增紀錄

### TC-075-10：互斥檢查 — 已有 Fallback 列時禁止新增 Standard

- **Given**：Tab 1 選中 'M'；`ob_tier` 中 M 已有一筆 fallback 列（card_level IS NULL → T3）
- **When**：業務主管選擇「Standard（依等級）」，填入 CARD_LEVEL='A'、TIER_LEVEL='T1'，點擊確認
- **Then**：回傳 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`，訊息「CARD_TYPE M 已有 Fallback 規則，請先移除後再新增 Standard 對應」；`ob_tier` 無新增紀錄

---

## 依賴關係

- **Blocked By**：US-074（CARD_LEVEL 有效值來源，Standard 規則的 CARD_LEVEL 下拉選單依據）、US-093（Tab 1 CARD_TYPE 選中狀態來源）
- **Blocks**：US-081（月跑 Stage 2 讀取 `ob_tier` 做 TIER_LEVEL 推算）

---

## 待解決問題

- [x] **OBTIER 完整 schema**（Resolved 2026-05-05）：確認為 4 欄結構，皆 nullable，無 PK constraint，無稽核欄位
- [x] **TIER_LEVEL 有效值範圍**（Resolved 2026-05-14，v2 重定義）：統一為 T1~T10，去除所有後綴變體；遷移映射規則見「背景說明」
- [x] **CARD_TYPE 有效值來源**（Resolved 2026-05-14，v2 重定義）：CARD_TYPE 來源改為 `ob_card_type`（US-093/094），不再依賴 OBMCODEDF / US-092
- [x] **THC 遷移目標值**（Resolved 2026-05-14，OQ新-2）：THC 為汽車 high-credit 最高層級，遷移至 T1
- [x] **Fallback 語意**（Resolved 2026-05-14，v2 重定義）：Fallback（card_level IS NULL）與 Standard（card_level 非空）**互斥不可並存**；同一 CARD_TYPE 下新增違反互斥限制 → 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] TIER_LEVEL 下拉僅 T1~T10，無後綴選項（AC-2）
- [ ] Standard 新增時 CARD_LEVEL 需存在於 ob_levelcard_level（AC-3）
- [ ] Fallback 新增時不觸發 CARD_LEVEL 驗證（AC-4）
- [ ] 複合 key 重複驗證（TC-075-03 / TC-075-04）
- [ ] Standard / Fallback 互斥檢查測試通過（TC-075-09 / TC-075-10）
- [ ] Tab 5 依 CARD_TYPE 篩選（TC-075-08）
- [ ] 月跑鎖定保護（TC-075-07）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新
- [ ] `ob_tier` schema 已確認並更新至 data-model.md（system-architect 負責）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F056（編輯 TIER_LEVEL 對應表）
- **相關 Stories**：US-074（CARD_LEVEL 門檻）、US-093（Tab 1 CARD_TYPE 選中狀態）、US-081（觸發月跑）
- **Reference SP**：`reference/SP/Stage2_依照CardType分類TierLevel.sql`
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)（結果準確性，TIER_LEVEL 推算必須與舊 SP 一致）
