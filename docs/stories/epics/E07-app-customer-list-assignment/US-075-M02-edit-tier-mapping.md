# US-075：編輯 TIER_LEVEL 對應表

> **Story ID**：US-075
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 維護 TIER_LEVEL 對應表，設定（CARD_TYPE × CARD_LEVEL）→ TIER_LEVEL 的映射關係
**So that** 確保月跑計分引擎能依照案件的 CARD_TYPE 與 CARD_LEVEL 正確推算出對應的 TIER_LEVEL，避免分派錯誤

---

## 背景說明

TIER_LEVEL 對應邏輯源自舊系統 Stored Procedure（`Stage2_依照CardType分類TierLevel.sql`），核心邏輯為：

```sql
LEFT JOIN OBTIER C ON A.CARD_LEVEL = C.CARD_LEVEL AND B.CARD_TYPE = C.CARD_TYPE
```

亦即 `OBTIER` 表以 `(CARD_TYPE, CARD_LEVEL)` 作為複合 key，對應至 `TIER_LEVEL`。此表與 US-074 所維護的 `OBLEVELCARD_LEVEL`（CARD_LEVEL 分級門檻）是**不同概念的兩張獨立表**：

| 表 | 用途 |
|---|---|
| `OBLEVELCARD_LEVEL` → AppDB `ob_levelcard_level` | 計算總分後判定 CARD_LEVEL（A/B/C/D…） |
| `OBTIER` → AppDB `ob_tier` | 依 CARD_TYPE × CARD_LEVEL 推算 TIER_LEVEL（T1/T2/T3…） |

本 Story 維護的是 **`ob_tier`**（舊表 `OBTIER`），與 US-074 無重疊。

---

## 驗收標準

### AC-1：顯示目前 TIER_LEVEL 對應表

- **Given** 業務主管進入 TIER_LEVEL 對應設定頁
- **When** 頁面載入完成
- **Then** 顯示目前 `ob_tier` 中所有對應列，欄位包含：CARD_TYPE、CARD_LEVEL、TIER_LEVEL（LIST_NM 為描述性欄位，若有值可顯示，不影響 join 邏輯）
- **And** 清單依 CARD_TYPE 升冪、CARD_LEVEL 升冪排序

### AC-2：修改對應關係

- **Given** 對應表已顯示
- **When** 業務主管修改某列的 TIER_LEVEL 值（下拉選單），點擊儲存
- **Then** `ob_tier` 該列的 `tier_level` 欄位更新
- **And** 顯示儲存成功提示，並記錄操作者與操作時間至稽核日誌

### AC-3：新增對應列

- **Given** 對應表已顯示
- **When** 業務主管點擊「新增」，填入 CARD_TYPE（必填，varchar(5) 以內）、CARD_LEVEL（選填，varchar(5) 以內；HM/M5 等特殊 fallback 類型允許 CARD_LEVEL 為空）、TIER_LEVEL（必填），LIST_NM（選填，varchar(30) 以內），點擊確認
- **Then** `ob_tier` 新增一列，顯示新增成功提示
- **And** 若 CARD_LEVEL 非空且 `(CARD_TYPE, CARD_LEVEL)` 複合 key 已存在，顯示錯誤「該 CARD_TYPE × CARD_LEVEL 組合已有對應，請修改現有列」
- **And** 若 CARD_LEVEL 為空（特殊 fallback），以 CARD_TYPE 作為唯一鍵；若 CARD_TYPE 已存在且 CARD_LEVEL 同為空，顯示錯誤「該 CARD_TYPE（無 CARD_LEVEL）的對應已存在，請修改現有列」

### AC-5：特殊 fallback CARD_TYPE 顯示

- **Given** `ob_tier` 中存在 CARD_LEVEL 為空的列（如 HM、M5）
- **When** 業務主管查看對應表
- **Then** CARD_LEVEL 欄位顯示「（無）」或空值提示，清單依 CARD_TYPE 升冪排序後置末
- **And** TIER_LEVEL 欄位可正常顯示與修改（fallback 規則：月跑 Stage 2 僅比對 CARD_TYPE 即輸出 TIER_LEVEL，不經 CARD_LEVEL join）

### AC-4：刪除對應列

- **Given** 對應表已顯示
- **When** 業務主管點擊某列的「刪除」，確認刪除
- **Then** `ob_tier` 移除該列，顯示刪除成功提示
- **And** 刪除記錄寫入稽核日誌

---

## 技術備註

- **舊表名**：`OBTIER`（位於 OB DB，遷移後進 AppDB）；schema 已於 2026-05-05 取得，路徑：`reference/TableSchema/OB/OBTIER.sql`
- **AppDB 對應表名**：`ob_tier`（依 AD-E07-1，採 `ob_` 前綴 snake_case 命名）
- **OBTIER 原表 4 欄結構**（皆 nullable，原表無 PK constraint，無稽核欄位）：

  | 欄位 | 型別 | 說明 |
  |------|------|------|
  | `LIST_NM` | nvarchar(30) NULL | 描述性輔助欄位，不參與 SP join 邏輯，可空 |
  | `CARD_TYPE` | varchar(5) NULL | 計分卡類別，join key |
  | `CARD_LEVEL` | varchar(5) NULL | 計分卡等級，join key |
  | `TIER_LEVEL` | varchar(5) NULL | 名單級距（輸出值），e.g. T1/T2/T3 |

- **複合 Primary Key**：`(card_type, card_level)` 從 SP join 邏輯推論業務上唯一（`LEFT JOIN OBTIER C ON A.CARD_LEVEL=C.CARD_LEVEL AND B.CARD_TYPE=C.CARD_TYPE`），原表無此 constraint，**遷移至 AppDB 時由 system-architect 補建**
  - 但書：當 CARD_LEVEL 為空時（如 HM/M5），以 `(card_type)` 單欄唯一作為 fallback 規則；PK 設計需能容納 NULL CARD_LEVEL（待 system-architect 確認 UNIQUE 約束策略）
- **CARD_TYPE 實際值（dump 驗證）**：OBTIER dump 顯示 8 種 CARD_TYPE（H / S / E / S5 / E5 / M / HM / M5），其中 HM（機車期中名單）與 M5（機車中結滿期名單）為計分卡體系外的特殊 fallback，不在 OBLEVELCARD_* 計分卡表中；M5 的 CARD_LEVEL 為空字串（SP hardcoded fallback，僅比對 CARD_TYPE 即輸出 TIER_LEVEL）
- **TIER_LEVEL 實際值（dump 驗證）**：約 13 種（T1 / T2 / T3 / T1M / T3M / T32 / T4 / T51 / T52 / T1HM / T2HM / T3HM / T5M）
- **稽核欄位**：`OBTIER` 原表不含任何稽核欄位（無 A_PRGID / A_USERID / A_SYSDT 等）；AppDB `ob_tier` 的操作稽核改由 `assignment_audit_log` 表統一記錄
- **對應結果欄位**：`tier_level`
- 此對應表為靜態設定，修改後直接生效（無計分版本草稿機制）
- `CARD_LEVEL` 有效值來自 US-074 的 `ob_levelcard_level` 設定（下拉選單應動態載入）；HM/M5 等 fallback 類型的 CARD_LEVEL 可為空，UI 需允許
- `CARD_TYPE` 有效值參照 dump 驗證的 8 種值（H/S/E/S5/E5/M/HM/M5），由業務代碼設定（US-092 / OBMCODEDF）維護

> **[ASSUMPTION]** AppDB `ob_tier` 的複合 PK `(card_type, card_level)` 為遷移時補建，非原表既有 constraint，待 system-architect 確認並補入 `docs/specs/data-model.md`。
>
> **[ASSUMPTION]** OBTIER 允許 CARD_TYPE 為計分卡體系外的特殊值（HM/M5），其 CARD_LEVEL 可為空字串（fallback 邏輯：月跑 Stage 2 比對 CARD_TYPE 即輸出 TIER_LEVEL，不參與 CARD_LEVEL join）。「`(card_type, card_level)` 為唯一 key」的假設附加但書：當 CARD_LEVEL 為空時，以 CARD_TYPE 唯一。TIER_LEVEL 有效值參照 dump 觀察：約 13 種（T1/T2/T3/T1M/T3M/T32/T4/T51/T52/T1HM/T2HM/T3HM/T5M）。

---

## 測試案例

### TC-075-01：顯示現有對應清單

- **Given**：`ob_tier` 有 6 筆對應（2 種 CARD_TYPE × 3 種 CARD_LEVEL）
- **When**：業務主管進入對應設定頁
- **Then**：顯示 6 列，含 CARD_TYPE、CARD_LEVEL、TIER_LEVEL，並依 CARD_TYPE、CARD_LEVEL 升冪排序

### TC-075-02：修改對應成功

- **Given**：CARD_TYPE「VISA」× CARD_LEVEL「B」目前對應 TIER_LEVEL「T2」
- **When**：業務主管改為「T1」，點擊儲存
- **Then**：`ob_tier` 對應列更新為 T1，顯示儲存成功，稽核日誌新增一筆紀錄

### TC-075-03：複合 key 重複驗證

- **Given**：`(CARD_TYPE='VISA', CARD_LEVEL='A')` 已存在
- **When**：業務主管新增相同組合
- **Then**：顯示錯誤「該 CARD_TYPE × CARD_LEVEL 組合已有對應，請修改現有列」，不寫入資料庫

### TC-075-04：刪除對應列

- **Given**：CARD_TYPE「MASTER」× CARD_LEVEL「C」對應列存在
- **When**：業務主管點擊刪除並確認
- **Then**：`ob_tier` 移除該列，稽核日誌記錄刪除操作，操作者與時間正確

---

## 依賴關係

- **Blocked By**：US-074（CARD_LEVEL 有效值來源，作為下拉選單依據）
- **Blocks**：US-081（月跑 Stage 2 讀取 `ob_tier` 做 TIER_LEVEL 推算）

---

## 待解決問題

- [x] **OBTIER 完整 schema**（Resolved 2026-05-05）：已取得原始 schema（`reference/TableSchema/OB/OBTIER.sql`）。確認為 4 欄結構（LIST_NM / CARD_TYPE / CARD_LEVEL / TIER_LEVEL），皆 nullable，無 PK constraint，無稽核欄位。
- [x] **TIER_LEVEL 有效值範圍**（Resolved 2026-05-05，dump 驗證）：觀察值共約 13 種（T1 / T2 / T3 / T1M / T3M / T32 / T4 / T51 / T52 / T1HM / T2HM / T3HM / T5M）。MVP 以下拉選單提供此清單，業務方確認前不允許自由輸入以防誤植。
- [x] **CARD_TYPE 有效值來源**（Resolved 2026-05-05，dump 驗證）：OBTIER dump 共 8 種 CARD_TYPE（H / S / E / S5 / E5 / M / HM / M5），由 OBMCODEDF 維護（US-092）。其中 HM/M5 為計分卡體系外 fallback，CARD_LEVEL 可為空，詳見技術備註。

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 複合 key 重複驗證測試通過（TC-075-03）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新
- [ ] `ob_tier` schema 已確認並更新至 data-model.md（system-architect 負責）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-074（CARD_LEVEL 門檻）、US-081（觸發月跑）、US-092（CARD_TYPE 代碼維護）
- **Reference SP**：`reference/SP/Stage2_依照CardType分類TierLevel.sql`
- **NFR**：NFR-005（結果準確性，TIER_LEVEL 推算必須與舊 SP 一致）
