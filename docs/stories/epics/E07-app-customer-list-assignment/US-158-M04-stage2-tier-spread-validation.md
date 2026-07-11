---
last-updated: 2026-06-24
version: v1.0
change-summary: "新增 Story：Stage 2 計分修正後驗收——重跑 202606 月名單分派，驗證 card_level / tier 分佈出現合理 T1/T2/T3 spread，不再全部退化為 T3（最低 tier）"
---

# US-158：Stage 2 計分修正後驗收：202606 重跑 card_level / tier spread

> **Story ID**：US-158
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **Feature**：F103 月名單分派計分引擎欄位來源修正

---

## User Story

**As a** 業務主管（Sales Director）
**I want** 重跑 202606 月名單分派後，card_level 分佈出現多個等級（非全部 D），tier 分佈出現 T1/T2/T3 合理 spread
**So that** 確認計分引擎修正後正確運作，分派結果不再因系統低估而使高優先客戶被排入最低 tier

---

## 背景說明

US-156（PG 下推欄位補齊）與 US-157（JS oracle 補齊）完成後，需以真實月份資料重跑驗收。

現況（修正前）：
- H 卡（期中卡）max 理論分 = 255（7 個主要欄位，AD-E07-10-L）
- 目前 score 範圍 81–152（ADD_UN_CAPITAL +0，多個 customer_core 欄位 +0）
- card C 門檻 185 分 → 無任何案件達到 card C 以上 → 全部落 card D
- tier 結果：全部 T3（D 對應 T3），與 legacy T1/T2/T3 spread 不符

修正後預期：
- ADD_UN_CAPITAL 最高 +36 分
- customer_core 欄位（CUS_SEX / CAREA / CELLULAR 等）正確計分
- 合理客戶應可達 185+ 分（card C → T2）、300+ 分（card A/B → T1）

---

## Acceptance Criteria

### AC-1：重跑 202606 後 card_level 分佈多元

- **Given** US-156 / US-157 修正已部署到 dev；ob_arreturndf_min_cap 與 customer_core ETL 已就緒（覆蓋 ~100%）
- **When** 在 dev 環境觸發 202606 月名單分派
- **Then** `ob_monthly_run_result` 中 card_level 分佈出現至少 2 個不同值（不再 100% 為 D）；具體分佈比例無硬性要求，但 D 不得佔 100%

### AC-2：tier 分佈出現 T1 或 T2

- **Given** 同上
- **When** 查詢 202606 月名單分派結果
- **Then** 至少存在部分案件 tier = 'T1' 或 tier = 'T2'；T3 不得為唯一值

### AC-3：與 legacy 部門分佈方向一致（定性）

- **Given** legacy 202606 分派有 T1/T2/T3 跨部門分佈（由 F067 差異報告為依據）
- **When** 比對 CDMP 202606 重跑結果
- **Then** CDMP tier 分佈方向與 legacy 大致一致（T1 佔比 > 0%、T3 非 100%）；允許因案件集不完全相同而有數量差異，但不允許 T1/T2 全部消失

### AC-4：既有測試全部通過

- **Given** US-156 / US-157 修改完成
- **When** 執行完整測試套件（`pnpm test`）
- **Then** 全部測試通過；無回歸

---

## 技術備註

- **驗收環境**：dev DB（已有 202606 legacy 比例資料、ob_arreturndf_min_cap ETL 就緒）
- **觸發方式**：透過 CDMP 月名單分派介面（M04）觸發，或直接呼叫月名單分派 API endpoint
- **查詢語句（參考）**：
  ```sql
  SELECT card_level, tier_level, COUNT(*)
  FROM ob_monthly_run_result
  WHERE run_id = '<202606-run-id>'
  GROUP BY card_level, tier_level
  ORDER BY card_level, tier_level;
  ```
- **F067 差異報告關係**：本 story 驗收通過後，F067 差異報告才有意義（目前 CDMP 全 T3 vs legacy T1/T2/T3，差異無法做 apples-to-apples 比對）

---

## [OPEN QUESTION]

- **OQ-158-01**：是否需要對「驗收通過的 T1/T2/T3 比例」設定量化門檻（例如 T1 >= 5%、T2 >= 10%）？目前 AC 定為定性（至少有 T1 或 T2 案件存在）。若業務有預期比例，請提供。
- **OQ-158-02**：若重跑後 card_level 分佈仍異常（例如 90% 為 D），是否需要回溯稽核 customer_core 資料品質（空值率）？本 story 的 AC 未涵蓋資料品質問題，需另開 story 追蹤。

---

## Dependencies

- **Blocked By**：US-156（PG 下推 ADD_UN_CAPITAL 補齊），US-157（JS oracle customer_core 欄位補齊）
- **Blocks**：F067（差異報告驗收，需 tier spread 正常後才有意義的 apples-to-apples 比對）

---

## Definition of Done

- [ ] 202606 月名單分派重跑成功完成（無系統錯誤）
- [ ] AC-1：card_level 分佈出現至少 2 種值
- [ ] AC-2：tier 分佈含 T1 或 T2（不全為 T3）
- [ ] AC-3：tier 分佈方向與 legacy 大致一致（定性確認）
- [ ] AC-4：全套測試通過（無回歸）
- [ ] 驗收截圖或查詢結果記錄於實作 PR / 月名單分派執行 log

---

## Related

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Architecture Spec**：AD-E07-10-L（`architecture-spec.md` §4063–4093）
- **Related Stories**：US-156（PG 欄位稽核補齊），US-157（JS oracle 補齊）
- **F067 差異報告**：`docs/specs/implementation-log/F067-202606-cdmp-vs-legacy-diff.md`
