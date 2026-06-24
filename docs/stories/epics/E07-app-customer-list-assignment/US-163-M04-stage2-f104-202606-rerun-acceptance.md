---
last-updated: 2026-06-24
version: v1.0
change-summary: "新增 Story：F104 全欄修正後 202606 重跑驗收——tier spread 更貼近 legacy H/S 名單"
---

# US-163：F104 全欄修正後 202606 重跑驗收（tier spread 更貼近 legacy）

> **Story ID**：US-163
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **Feature**：F104 計分引擎 + AD-E07-10-L 全欄對齊 legacy SP

---

## User Story

**As a** 業務主管（Sales Director）
**I want** 在 F104 全欄修正（US-159/160/162）部署後於 dev 環境重跑 202606，並比對重跑結果的 tier spread 更貼近 legacy H/S 名單
**So that** 確認計分引擎的欄位映射修正確實改善了 card_level/tier 分佈，使下游 Stage 3/4 比例分派以更有意義的 tier 分組運作，並為業務簽核提供依據

---

## 背景說明

- **F103 驗收（US-158）** 已確認修正後 tier 不再 100% 為 T3（card_level 出現多種值）
- **F104（本批修正）** 在 F103 基礎上，額外修正：借新還舊關鍵字、CUS_SEX 分流（5 欄）、縣市名欄（3 欄）、per-card default（2 欄）
- 預期效果：F104 修正後 H/S 名單 tier spread 應比 F103 更貼近 legacy 202606 的 T1/T2/T3 比例，因為更多欄位取到正確值
- **差異報告（F067）**：案件集不完全相同（CDMP vs legacy），不要求逐格對數，但 tier 方向（T1/T2/T3 佔比趨勢）應一致

---

## Acceptance Criteria

### AC-1：F104 全部引擎修正部署至 dev

- **Given** US-159/160/162 引擎修正已 commit 到 dev，US-161 ETL 新欄（cus_sex/carea_no1/carea_no2/cellular/hpost_city/cpost_city/co_city）已 ETL 完成並載入 dev DB
- **When** 觸發 dev 環境 202606 月跑
- **Then** 月跑完成無錯誤；`ob_monthly_run_result` 含有效 card_level 與 tier_level 紀錄

### AC-2：card_level 分佈出現 ≥ 3 種值（H/S 名單）

- **Given** H 卡理論計分上界 255 分；F103 後已出現多種 card_level，F104 修正更多欄
- **When** 查詢 202606 月跑結果 `GROUP BY card_level`（只看 card_type = 'H'/'S'）
- **Then** card_level 出現 ≥ 3 種不同值（例如 A、B、C、D 中至少 3 種，不全為 D）；若仍 ≤ 2 種值，啟動 AC-5 根因分析

### AC-3：tier spread 含 T1/T2（H/S 名單定性）

- **Given** F104 修正後 H/S 名單計分
- **When** 查詢 202606 月跑 `GROUP BY tier_level`（card_type = 'H'/'S'）
- **Then** tier_level 包含 T1 與 T2（不僅 T3）；T3 佔比相較 F103 修正前有明顯改善（定性，不設精確百分比門檻）；方向與 legacy 202606 一致（legacy T1 佔比 > 0%）

### AC-4：CUS_SEX 分流欄位有效貢獻計分（抽樣驗證）

- **Given** dev DB `customer_core` 已含 `cus_sex`/`carea_no1`/`carea_no2`/`cellular` 欄（ETL 完成）
- **When** 抽取 10 筆個人客戶（cus_sex IN (1,2)）在 H 名單的月跑結果，手動核算其 CAREA_NO1/CAREA_NO2/CELLULAR 計分
- **Then** 手動計算值與 `ob_monthly_run_result.score` 紀錄一致（允許 ±0 誤差）；確認分流邏輯不再使 cus_sex=1/2 的個人客戶在這三欄取到 0

### AC-5：若 tier spread 仍異常，本輪根因分析

- **Given** AC-2 或 AC-3 未達標（如仍 ≥ 90% 為 T3）
- **When** 進行根因分析
- **Then** **本輪內**判定根因為：
  - 引擎欄位映射仍有落差（回 US-159/160/162 補漏）
  - ETL 新欄 NULL 率過高（查 `customer_core` 各新欄空值率；若空值率 >50%，縣市/區碼欄對計分影響有限，為 ETL 範疇問題，記錄在驗收文件）
  - 其他（如 score rows 閾值設定）
  - 記錄根因及後續行動，不推延至 F105

### AC-6：F103 EQ DoD 不退化

- **Given** US-156/157/158（F103）的全部測試在 F104 修正後
- **When** 執行完整測試套件（`pnpm test`）+ `tsc --noEmit -p tsconfig.build.json`
- **Then** 所有 F103 測試仍通過（或已更新反映 F104 新語意）；不引入新型別錯誤；F104 新增 EQ 場景（借新還舊/分流/縣市/per-card default）全部通過

---

## 技術備註

- **驗收查詢參考**（dev PostgreSQL）：
  ```sql
  -- tier spread
  SELECT tier_level, COUNT(*) as cnt, ROUND(COUNT(*)::numeric/SUM(COUNT(*)) OVER() * 100, 1) AS pct
  FROM ob_monthly_run_result
  WHERE work_ym = '202606' AND list_type LIKE '%H%'
  GROUP BY tier_level ORDER BY tier_level;

  -- card_level spread
  SELECT card_level, COUNT(*) as cnt
  FROM ob_monthly_run_result
  WHERE work_ym = '202606'
  GROUP BY card_level ORDER BY card_level;
  ```
- **legacy 對比參考**：`reference/DumpData/_legacy_appls.txt` 或 F067 差異報告
- **ETL 前置**：US-161 新欄 ETL（使用者負責）必須在本 Story 執行前完成，否則 AC-4 無法驗收

---

## [OPEN QUESTION]

- **OQ-163-01（ETL 時序）**：F104 引擎修正（US-159/160/162）可以先 TDD 實作並 merge，但 AC-4 驗收需要 ETL 新欄就緒。兩者是否有 staging 計劃？建議：引擎修正先 TDD → test 全綠 → merge，ETL 完成後再執行 AC-1~AC-5 驗收（不阻擋引擎 TDD 進度）。

---

## Dependencies

- **Blocked By**：US-159（AD 修正），US-160（CUS_SEX 分流引擎），US-161（cc 新欄 contract + ETL），US-162（縣市欄引擎）
- **Blocks**：業務簽核（F067 差異報告，prod 上線前置）

---

## Definition of Done

- [ ] dev 環境 202606 月跑完成，無錯誤
- [ ] AC-2 card_level ≥ 3 種值（H/S 名單）
- [ ] AC-3 tier_level 含 T1/T2（H/S 名單，定性）
- [ ] AC-4 個人客戶分流欄位抽樣驗證通過
- [ ] AC-5（若觸發）根因分析完成並記錄
- [ ] AC-6 全測試通過 + tsc 零錯誤
- [ ] 驗收結果摘要記錄於 implementation-log（供業務審核參考）

---

## Related

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Architecture Spec**：AD-E07-10-L（修正版，US-159 產出）
- **Related Stories**：US-158（F103 驗收，前一版本），US-159/160/161/162（F104 修正），F067（差異報告）
- **NFRs**：NFR-003（Stage 2 計分效能 < 10 分鐘，F104 新增 LEFT JOIN 不得顯著升高）
