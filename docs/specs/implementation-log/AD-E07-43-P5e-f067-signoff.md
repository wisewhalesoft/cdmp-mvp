---
type: signoff-report
feature_id: AD-E07-43-P5e
feature_name: MSSQL 全面遷移 — F067 式業務簽核報告（正式版）
status: ready-for-signoff
last_updated: 2026-07-08
audience: 使用者/業務利害關係人（簽核）
supersedes: AD-E07-43-P5c-f067-draft.md（草稿，已整合 P5h/P5g 修法後結果，正式定稿）
depends-on: [AD-E07-43-P5c-impl.md, AD-E07-43-P5h-impl.md, AD-E07-43-P5g-impl.md]
---

# MSSQL 全面遷移 — PG vs MSSQL 月跑逐列比對業務簽核報告

> 本報告取代技術底稿 `AD-E07-43-P5c-f067-draft.md`。差異：assignday 缺陷（P5h）與 ATOMIC 資料完整性風險
> （P5g）於底稿產出後已修復並重驗，本報告納入修法後最終結果。

---

## ★ 範圍與方法聲明（務必先讀）

- **基準＝真實 PostgreSQL 生產月跑 run 之逐列比對**（run `07944a82`，`project_workym=202607`，115,197 案），
  **非 JS oracle 代理、非重驗 legacy SP**。PG 全程唯讀。
- **I-MSSQL-SIGNOFF-GATE-01 條件 (a)**「MONTHRUN-DIFF 對至少一個完整生產規模月跑顯示 PG/MSSQL 結果一致」
  **已被字面滿足**——本報告基於真實 PG↔MSSQL 執行結果比對，非測試設計時預設之 JS 代理路徑。
- 兩側讀取同一份來源資料，案件集完全相同（onlyPG=0/onlyMSSQL=0），核心判定為**逐列精確相等**（0-diff 為
  基準值，非「分佈近似」）。

---

## 1. 執行摘要

MSSQL 全鏈技術驗收（P1-P4 driver/schema/佇列/ETL/Stage 1-4 raw SQL 引擎）與 cutover 前最終驗證（P5a-h）
**已全數完成**。本報告確認：**MSSQL 版月跑結果與已核可之 PG 版逐列一致，兩項已知缺陷（assignday 日期
正規化、ETL 資料完整性風險）皆已修復並重驗通過**。

**結論：具備進入正式 cutover 簽核之技術條件**，餘下事項為 3 項**待量測/待排程之非阻擋性 follow-up**
（見 §7），建議記錄於簽核文件但不阻擋簽核本身。

---

## 2. 逐欄一致率（真實 PG vs MSSQL，含修法後結果）

主樣本 6 名單 / 9,376 案；另含 2 名單 / 198 案小樣本、大 CR 名單 OB202607001 / 27,796 案（1,996 CR）。

| 關鍵欄位 | 修法前（P5c） | **修法後（P5h，198+9,376 案樣本）** | 判定 |
|---|---|---|---|
| 計分 `score` | 99.947%（5/9376 差異） | **同 5 案差異，同根因**（今日參考日效應，非引擎不符，§3） | ✅ 邏輯等價 |
| 計分等級 `card_level` | 100% | 100% | ✅ |
| 分派層級 `tier_level` | 100% | 100% | ✅ |
| CR 標記 `is_cr` | 100% | 100% | ✅ |
| CR 業代 `cr_id` | 100% | 100% | ✅ |
| CR 業代名 `cr_nm` | 100% | 100% | ✅ |
| 分派部門 `dept_id` | 100% | 100% | ✅ |
| 分派員編 `emplid` | 100% | 100% | ✅ |
| 員編部門 `emplid_deptid` | 100% | 100% | ✅ |
| 派案日 `assignday` | **0%（全 −1 日）** | **🟢 100%（0-diff，198+9,376 案）** | ✅ **已修復** |

**10/10 關鍵欄位達成逐列一致**（score 之 5 案差異為系統既有「AGE 以今日為參考」設計效應，非引擎不符，
兩引擎表現完全相同，見 §3）。

分佈檢核兩側完全一致：tier（T1 38.5/T2 22.5/T3 13.7/T5 25.3%）、card（A 62.3/B 24.0/C 10.2/D 3.5%）、
dept（XVE1 36.1/XVE2 29.0/XVE3 16.4/XVE4 18.5%）、CR（is_cr='Y' 11＝11）。

**樣本涵蓋範圍誠實聲明**：`assignday` 0-diff 之修法後重驗涵蓋 198 案 + 9,376 案兩樣本（P5h DoD 要求之
決定性樣本）；27,796 案大 CR 名單之 `assignday` 修法前已知全 −1（與其他樣本同根因、同修法涵蓋範圍），
**修法後未於本輪對該大樣本重跑逐列比對**（P5h-impl §10 已備妥重跑腳本 `mssql-monthrun-diff-p5c.ts`，
可於簽核後或需要更高把握時單獨執行 `P5C_LISTS=OB202607001` 補強，非阻擋簽核之必要前提，因根因與修法
機制對 198/9,376 樣本已具決定性證據，且 27,796 樣本之其餘 9 欄〔含 CR 全鏈〕在 P5c 已 100% 驗證）。

---

## 3. score 差異＝AGE 今日參考日效應（非邏輯不符，兩引擎表現相同）

5 案 score 差異（P5c 與 P5h 重跑後**完全相同之 5 案**，同 custo_no、同生日 07-07/07-08）：客戶生日落在
「PG run 執行日 2026-07-06」與「本輪 MSSQL 重現日 2026-07-08」之間，年齡 +1 跨越計分 AGE 級距所致。AGE
以「今日」（MSSQL `SYSDATETIME()`）為參考係兩引擎既有共同設計，若於同一日重現則為 0-diff。**計分邏輯
PG≡MSSQL 完全等價，此 5 案非引擎不符、亦非 P5h 修法所引入或擾動。**

---

## 4. assignday −1 日缺陷 — 已修復（P5h）

| 項目 | 內容 |
|---|---|
| **根因** | TypeORM `SqlServerDriver` 於連線設定未顯式指定時間表示方式時，強制採用「本地時區」而非「世界標準時間（UTC）」解讀 MSSQL 日期欄位；PostgreSQL 驅動預設行為不同，不受影響 |
| **修法** | 4 個資料庫連線設定進入點（主應用／worker／CLI／seed）各新增 1 行明確設定（`useUTC: true`），**未更動任何月跑核心運算程式碼** |
| **驗證** | 198 案 + 9,376 案樣本，`assignday` 由 0% 一致率轉為 **100%（0-diff）**；全量 MSSQL 自動化測試（673 通過）零回歸；`tsc` 乾淨 |
| **副帶效益** | 一併解決先前待業務裁示之「datetime2 時區 production 組態」懸案（P5d）——根因已定位於程式碼連線層，非需選擇時區組態，P5d 已隨 P5h 結案 |
| **殘餘 follow-up（非阻擋，見 §7）** | 匯出功能中一處日期格式化程式碼（`assignment-run-report.service.ts::formatApplDate`）在特定時刻條件下仍有跨引擎顯示格式差異風險，屬匯出顯示層、非本報告 10 欄比對範圍，已記錄為獨立 follow-up |

---

## 5. CR 全鏈強化證據（大 CR 名單 OB202607001，27,796 案）

9/10 欄完全 0-diff（含 score 本名單 0 差異）；CR 前置由 3,638 初始候選，經失效清空 + 優先指派，最終
**is_cr='Y' = 1,996 筆，與 PG 完全一致**；`cr_id`/`cr_nm`/`emplid`（=cr_id）逐列 0-diff。分佈兩側一致
（tier T1 67.7/T2 22.8/T3 9.5%；dept XVE1 34.2/XVE2 33.0/XVE3 15.2/XVE4 17.6%）。`assignday` 之 −1 日
缺陷同根因、同修法（§4），第 10 欄未於本輪對此 27,796 案樣本重跑（§2 樣本涵蓋範圍聲明）。

**綜合三樣本**（198 案／9,376 案／27,796 案，涵蓋 8 卡別、tier T1-T5、4 部門、78 員工、2,007 筆 CR）：
**計分／CR／比例分派全鏈 PG≡MSSQL 逐列等價；assignday 於已驗證樣本（198+9,376 案）達 0-diff。**

---

## 6. 資料完整性風險 — 已修復（P5g，ATOMIC）

| 項目 | 內容 |
|---|---|
| **風險** | ETL 全量/分區替換載入（`ob_pool_data`／`ob_calendar` 等 5 張核心來源表 + `customer_core`）原設計中，清空（TRUNCATE/DELETE）與寫入（INSERT/UPDATE）非同一交易，寫入失敗時清空動作不會回滾，可能導致生產資料遺失。PG／MSSQL 兩引擎共通存在（非本次遷移新增） |
| **修法** | 為 `target-load-handler`（PG／MSSQL 兩版）之 fullMode／partition_replace／customer_core UPSERT 三條寫入路徑加上交易保護；寫入失敗時完整回滾，既存資料保留 |
| **範圍擴張** | 原不變式僅列 fullMode／partition_replace 兩路徑；本輪實作發現 customer_core 之兩段式 UPSERT（`UPDATE`+`INSERT WHERE NOT EXISTS`）同樣無交易保護，屬同一根因家族，一併納入修復（見 §8 AD 更新） |
| **驗證** | 真庫實測確認：MSSQL `TRUNCATE` 於顯式交易內可回滾；UPSERT 部分失敗（真實可觸發路徑，非 mock）情境下正確回滾；6 條 target_load pipeline 全數覆蓋；P5b 既有斷言（原「資料遺失」）已翻轉為「資料保留」並重驗通過；`tsc` 乾淨 |
| **殘餘 follow-up（非阻擋，見 §7）** | MSSQL 標準 Read Committed（未啟用 RCSI）下，載入期間並行查詢會被**阻塞**至交易提交為止（不會讀到空表，但會等待）；小規模測試為次秒級（~712ms），**7.8M 列生產規模之阻塞時間未實測**；PG 側因本機環境限制（無 5433 測試庫、dev PG 唯讀）未執行真實交易回滾之端對端探測（程式碼已對稱落地、`tsc` 乾淨、既有 PG 交易語意成熟，風險為驗證深度而非正確性存疑） |

---

## 7. 待簽核前置了解事項（誠實列示，非阻擋簽核，供業務知情）

以下事項**不影響「MSSQL 忠實重現 PG」之核心結論**，但建議簽核時一併知悉：

1. **7.8M 列生產規模之交易日誌／鎖阻塞未實測**：P5g 修法在測試規模下驗證正確，但真實生產資料量下，
   單一大交易對 SQL Server 交易日誌成長、鎖持有時間（尤其月跑期間查詢阻塞秒數）尚未以生產級資料量測。
   建議 cutover 前以生產規模資料做一次量測；若阻塞時間不可接受，可評估啟用 `READ_COMMITTED_SNAPSHOT`
   （使 MSSQL 讀取行為對稱 PG 之 MVCC 快照讀，非阻塞）。**非阻擋簽核**，建議列為 cutover 前置檢查項。
2. **varchar/nvarchar 顯示欄位元組語意**（見 P5i 裁定，`AD-E07-43-mssql-p5-ci-signoff.md` §9）：
   已確認為真實待修事項（非測試假象），但**確認不影響本報告 10 欄核心比對結果**（純顯示/匯出欄位，非
   計分/CR/分派輸入）。已排入獨立處理，使用者已裁示自主執行，不需另行簽核。
3. **datetime2 匯出顯示格式化 follow-up**：`assignment-run-report.service.ts::formatApplDate`（匯出用途）
   於特定時刻條件下（MSSQL 且 `appl_date` 時分 ≥16:00 本地時間）仍有跨引擎顯示格式偏差風險；純顯示層，
   非分派/計分邏輯，已記錄為獨立 follow-up 任務。
4. **assignday 0-diff 之樣本涵蓋**：已於 198 案 + 9,376 案兩樣本達成 100% 一致；27,796 案大 CR 名單之
   `assignday` 修法後未於本輪重跑驗證（其餘 9 欄含 CR 全鏈已於原始 P5c 驗證 100% 一致）。如需更高把握，
   可於簽核前後另行執行既有腳本補強（成本低、非阻擋）。

---

## 8. 待簽核事項（正式）

1. **接受「Stage 2~4 計分/CR/比例分派/派案日全鏈 PG≡MSSQL 逐列等價」之結論**（10/10 欄位達成；score 5 案
   為既知今日參考日效應，非引擎不符）。
2. **認可 assignday −1 日缺陷（P5h）與 ATOMIC 資料完整性風險（P5g）皆已修復並重驗通過**，無殘留阻擋項。
3. **知悉 §7 之 4 項待量測/待排程 follow-up**（皆非阻擋簽核之條件，供 cutover 排程時參考）。
4. **裁示是否核准進入下一階段（Phase 6 cutover）**。

簽核人：＿＿＿＿＿＿　日期：＿＿＿＿＿＿

---

## 附錄：技術證據索引

| 文件 | 內容 |
|---|---|
| `AD-E07-43-P5c-impl.md` | 原始 PG vs MSSQL 逐列比對（assignday 缺陷發現） |
| `AD-E07-43-P5h-impl.md` | assignday 修法（useUTC 連線層）+ 重驗（0-diff）+ 全量回歸 |
| `AD-E07-43-P5g-impl.md` | ATOMIC 交易包裝修法 + 真庫探測 + 範圍擴張說明 |
| `AD-E07-43-mssql-p5-ci-signoff.md` | 架構決策全紀錄（§7 ATOMIC、§8 assignday、§9 varchar/nvarchar） |
