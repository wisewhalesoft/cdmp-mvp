---
last-updated: 2026-06-24
version: v1.0
change-summary: "新增 Story：月跑 Stage 2 計分欄位來源逐欄稽核——補 ADD_UN_CAPITAL / 移除 COMMISSION 死碼 / 驗證 CAREA_NO 語意 / 確認 PG 下推所有欄位均有效貢獻計分"
---

# US-156：月跑 Stage 2 計分欄位來源逐欄稽核（PG 下推路徑）

> **Story ID**：US-156
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8
> **Feature**：F103 月跑計分引擎欄位來源修正

---

## User Story

**As a** 業務主管（Sales Director）
**I want** 月跑 Stage 2 計分引擎在 PG 下推路徑中正確對每個 active 計分欄（`ob_levelcard_column`）取值並計分
**So that** 最終 card_level / tier 分佈能反映客戶真實屬性，與 legacy 系統應有的 T1/T2/T3 spread 一致，而非全部退化為最低 tier

---

## 背景說明

月跑 Stage 2 走 PG 下推路徑時，計分 SQL 由 `buildStage2ScoreExpr`（`stage2to4-sql-builder.ts`）動態組裝。
其中 `resolveColumnSource` 函式依 `column_name` 回傳 SQL 表達式；若回傳 `undefined`，該欄位靜默貢獻 +0 分。

目前已確認的問題：
1. **ADD_UN_CAPITAL 未計分**：switch 無對應 case，回 `undefined`，實為 legacy H 卡最高 36 分項。
2. **COMMISSION 為死碼**：switch 有 case，但 legacy `OBLEVELCARD_COLUNM_20260505.csv` dump 完全無此欄位，永遠不會被呼叫。
3. **逐欄覆蓋率未驗證**：legacy 各 card_type 的 active 欄（H/S/S5/E/E5/M）是否每個都在 `resolveColumnSource` 有對應表達式、且實際取到非空值，目前無系統性稽核。

**權威來源**：AD-E07-10-L（`architecture-spec.md` §4063–4093 映射規則表）
**legacy ground truth**：`reference/DumpData/OBLEVELCARD_COLUNM_20260505.csv`（各 card_type 的 active 欄名單）

---

## Acceptance Criteria

### AC-1：ADD_UN_CAPITAL 補齊 ob_arreturndf_min_cap LEFT JOIN

- **Given** `ob_levelcard_column` 中有 `column_name = 'ADD_UN_CAPITAL'` 的 active 欄（card_type H）
- **When** `buildStage2ScoreExpr` 組裝 Stage 2 計分 SQL
- **Then** 生成的 SQL 含 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no`；`ADD_UN_CAPITAL` 對應表達式為 `COALESCE(ar.add_un_capital, 0)`（numeric）；該欄以 range 型參與計分加總

### AC-2：CAREA_NO1 / CAREA_NO2 語意確認為電話有無（不需修改）

- **Given** `CAREA_NO1` 的 legacy 欄名稱為「有無戶籍電話」、score rows 為 level2_s/level2_e = {0,0} / {1,1}
- **When** 執行全欄稽核，比對 `resolveColumnSource` 現行表達式 `(cc.home_phone IS NOT NULL)::int` / `(cc.contact_phone IS NOT NULL)::int`
- **Then** 語意吻合（電話有無 → 0 or 1）；稽核報告記錄為「已驗證，無需修改」；無需更動程式碼

### AC-3：COMMISSION 死碼從 resolveColumnSource 移除

- **Given** `COMMISSION` 在 legacy `OBLEVELCARD_COLUNM_20260505.csv` 完全不存在（任何 card_type 皆無）
- **When** 完成稽核後清理 `stage2to4-sql-builder.ts`
- **Then** `resolveColumnSource` switch 中移除 `case 'COMMISSION'`；同時從 `POOL_DATA_COLUMNS` / `CUSTOMER_CORE_COLUMNS` 等集合移除（若有）；移除後所有既有測試仍通過

### AC-4：全 card_type 欄位覆蓋稽核結果文件

- **Given** legacy dump 列出各 card_type 的 active 欄（H: 8 欄含 ADD_UN_CAPITAL；S/S5/E/E5/M 各數欄）
- **When** 完成稽核
- **Then** 產出欄位稽核清單，格式如下：

  | card_type | column_name | 應有來源（AD-E07-10-L） | 現行 resolveColumnSource 狀態 | 稽核結果 |
  |-----------|-------------|------------------------|-------------------------------|---------|
  | H         | ADD_UN_CAPITAL | ob_arreturndf_min_cap.add_un_capital | 缺 case → undefined | 需補 |
  | H         | CAREA_NO1   | (cc.home_phone IS NOT NULL)::int | 有，正確 | 已驗證 |
  | ...       | ...          | ...                    | ...                           | ...     |

  清單中所有欄位稽核結果欄必須為「已驗證」或「已修正」，不得有「需補」或「待確認」留至上線。

### AC-5：PG 下推路徑計分 SQL 不含映射錯誤的欄位

- **Given** 稽核後的 `resolveColumnSource`
- **When** 以任意 card_type 執行 `buildStage2ScoreExpr`
- **Then** 每個 active 欄要麼有明確的 SQL 表達式，要麼因 AD-E07-10-L 未列且 legacy dump 亦無此欄而有文件化理由跳過；不得有無 legacy 依據但被計分的幽靈欄位

### AC-6：EQ 等價測試（PG 路徑 vs JS oracle）更新並通過

- **Given** `stage2to4-sql-builder.spec.ts` 的 EQ DoD 測試組
- **When** 補上 ADD_UN_CAPITAL 修正後執行
- **Then** 含 `ADD_UN_CAPITAL` 場景的 EQ 測試全部通過；既有測試不退化

---

## 技術備註

- **PG 下推 SQL 組裝入口**：`stage2to4-sql-builder.ts` → `buildStage2ScoreExpr` → `resolveColumnSource`
- **AD-E07-10-L 映射規則表**：`architecture-spec.md` §4063–4093
- **ADD_UN_CAPITAL JOIN 別名**：建議用 `ar`（`ob_arreturndf_min_cap ar`），避免與現有 `o`（pool）/ `cc`（customer_core）衝突
- **ob_arreturndf_min_cap 覆蓋率**：ETL 重做後對 pool 覆蓋 ~100%，LEFT JOIN 為安全設計（無對應案件 fallback 0 分）
- **COMMISSION 欄位確認**：`reference/DumpData/OBLEVELCARD_COLUNM_20260505.csv` 完整 dump 中 0 筆 COMMISSION，100% dead code

---

## [OPEN QUESTION]

- **OQ-156-01（關鍵）**：legacy dump 僅涵蓋 H/S/S5/E/E5/M 五類。若 CDMP dev DB `ob_levelcard_column` 中有 legacy dump 未列出的 card_type（例如管理者自行新增的 custom card），這些 card type 的計分欄若在 AD-E07-10-L 亦無映射，應「靜默 +0」還是「拋錯阻止月跑」？需業務拍板。
- **OQ-156-02（輕度）**：AD-E07-10-L §4091 備註「其餘維度」以通用引擎 `to_jsonb(p_pool_data)` 取值。現行 PG 下推 `resolveColumnSource` 未實作此 fallback 通用邏輯（有 case 的才計分）。若 dev DB 有 `ob_levelcard_column` 欄位既不在 AD-E07-10-L 明確映射表、也不在通用引擎覆蓋範圍，需確認處理方式。

---

## Dependencies

- **Blocked By**：無（ob_arreturndf_min_cap ETL 已重做、覆蓋 ~100%，可立即補 JOIN）
- **Blocks**：US-157（JS oracle customer_core 欄位補齊），US-158（Stage 2 計分驗收：202606 重跑 tier spread）

---

## Definition of Done

- [ ] `resolveColumnSource` 補 `ADD_UN_CAPITAL` case，產生正確 LEFT JOIN + COALESCE 表達式
- [ ] `COMMISSION` dead case 從 `resolveColumnSource` 及相關集合移除
- [ ] AC-4 欄位稽核清單完成，全欄結果為「已驗證」或「已修正」
- [ ] `stage2to4-sql-builder.spec.ts` 新增 ADD_UN_CAPITAL EQ 場景，全測試通過
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨（零型別錯誤）
- [ ] OQ-156-01 / OQ-156-02 有業務決議或記錄為「MVP 暫不處理，靜默 +0」

---

## Related

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Architecture Spec**：AD-E07-10-L（`architecture-spec.md` §4063–4093）
- **Legacy Ground Truth**：`reference/DumpData/OBLEVELCARD_COLUNM_20260505.csv`、`OBLEVELCARD_SCORE_20260505.csv`
- **Related Stories**：US-157（JS oracle 補齊），US-158（tier spread 驗收）
- **NFRs**：NFR-003（Stage 2 < 10 分鐘效能門檻，新 LEFT JOIN 不得顯著升高耗時）
