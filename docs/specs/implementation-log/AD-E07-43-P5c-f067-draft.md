---
type: signoff-report-draft
feature_id: AD-E07-43-P5c
feature_name: MSSQL 全面遷移 — PG vs MSSQL 月跑逐列比對簽核報告（底稿，供 P5e 業務簽核）
status: draft-for-signoff
last_updated: 2026-07-08
audience: system-architect（起草潤飾）→ 使用者/業務利害關係人（簽核）
---

# MSSQL 全面遷移 — PG vs MSSQL 月跑逐列比對簽核報告（底稿）

> **本檔為技術底稿，供 P5e 由 system-architect 整合 P5d datetime2 裁示後定稿、交業務簽核。**
> 直接證據與方法細節見技術附件 `AD-E07-43-P5c-impl.md`。

---

## ★ 範圍與方法聲明（最顯著位置，務必先讀）

- **基準＝真實 PostgreSQL 生產月跑 run 之逐列比對**（run `07944a82`，`project_workym=202607`，115,197 案），
  **非 JS oracle 代理、非重驗 legacy SP**。PG 全程唯讀。
- **因此 I-MSSQL-SIGNOFF-GATE-01 條件 (a)「MONTHRUN-DIFF 對至少一個完整生產規模月跑顯示 PG/MSSQL 結果一致」
  可被字面滿足**（現行 dev PG 唯讀可達，得以執行真實 PG↔MSSQL 比對，而非 test-spec 撰寫時因 5433 不可達而
  預設之 JS 代理）。
- 兩側讀取**同一份來源資料**（現行 PG `ob_pool_data` 100% 覆蓋該 run 案件集），案件集完全相同（onlyPG=0/
  onlyMSSQL=0），核心判定為**逐列精確相等**（0-diff 為基準值，非「分佈近似」）。
- 本輪實際涵蓋 **Tier 2（真實 PG 執行結果）**——即 I-MSSQL-SIGNOFF-GATE-01 字面所要求者，非代理。

---

## 1. 執行摘要

MSSQL 全鏈技術驗收（P1-P4 driver/schema/佇列/ETL/Stage 1-4 raw SQL 引擎）已完成。本報告為 cutover 前最終
業務對齊確認：**證明 MSSQL 版月跑結果與已核可之 PG 版逐列一致**。

結論：**Stage 2~4 計分/CR/比例分派全鏈，PG≡MSSQL 逐列等價**（10 關鍵欄位中 8 欄完全 0-diff；score 之微量
差異為「AGE 今日參考日」之預期效應非邏輯不符；assignday 有一項**已定位、待修**之日期正規化缺陷，不影響計分/
分派正確性）。

---

## 2. 逐欄一致率（真實 PG vs MSSQL）

主樣本 6 名單 / 9,376 案（涵蓋卡別 HB/SEB/HC/SEC/S5/HM、tier T1/T2/T3/T5、CR、4 部門、78 員工）；另含
2 名單/198 案小樣本與大 CR 名單 OB202607001（27,796 案 / 1,996 CR，見 §5）。

| 關鍵欄位 | 一致率 | 判定 |
|---|---|---|
| 計分 `score` | 99.947%（5/9376） | 唯今日參考日效應（§3），計分邏輯等價 |
| 計分等級 `card_level` | **100%** | ✅ |
| 分派層級 `tier_level` | **100%** | ✅ |
| CR 標記 `is_cr` | **100%** | ✅ |
| CR 業代 `cr_id` | **100%** | ✅ |
| CR 業代名 `cr_nm` | **100%** | ✅ |
| 分派部門 `dept_id` | **100%** | ✅ |
| 分派員編 `emplid` | **100%** | ✅ |
| 員編部門 `emplid_deptid` | **100%** | ✅ |
| 派案日 `assignday` | 0%（全 −1 日） | 🔴 已定位缺陷（§4），待修 |

分佈檢核（業務可讀）：tier（T1 38.5/T2 22.5/T3 13.7/T5 25.3%）、card（A 62.3/B 24.0/C 10.2/D 3.5%）、
dept（XVE1 36.1/XVE2 29.0/XVE3 16.4/XVE4 18.5%）、CR（is_cr='Y' 11）—**兩側完全一致**。

---

## 3. score 差異＝AGE 今日參考日（非邏輯不符）

5 案 score 差異經逐案查證，**全部**為客戶生日（07-07 或 07-08）落在「PG run 執行日 2026-07-06」與「本輪
MSSQL 重現日 2026-07-08」之間，年齡 +1 跨越計分 AGE 級距所致。AGE 以「今日」為參考係既有設計（PG/MSSQL
皆然），若於 PG run 同一日重現則為 0-diff。**計分邏輯 PG≡MSSQL 等價，無任何一案屬引擎不符。**

---

## 4. assignday −1 日（已知、待修、不影響計分/分派正確性）

- **性質**：日期**正規化**缺陷（非計分/分派邏輯錯誤）。分派之部門/員編 100% 正確，僅「派案日」日期標籤整體
  早一天。
- **根因**：MSSQL 驅動（tedious）回傳 `date` 欄為「本地時區午夜」JS 日期，工作日計算 `computeWorkingDayRatios`
  以 UTC 分量取值 → 於 UTC+8（台灣）取到前一日；PostgreSQL 驅動回 UTC 午夜故無此偏移。
- **影響**：UTC+ 時區之 MSSQL 部署，月跑派案日與 Stage 0 每日試算之日期標籤早一天。
- **處置**：屬**日期正規化**，修法明確、成本低、兩引擎對稱（見技術附件 §4.4）。**cutover 前必修**，由
  system-architect 排入。**不影響本報告對「計分/CR/比例分派邏輯 PG≡MSSQL 等價」之結論。**

---

## 5. CR 全鏈強化證據（大 CR 名單 OB202607001）

大 CR 名單 OB202607001（H 卡，27,796 案）：**9/10 欄完全 0-diff（含 score 本名單 0 差異）**。CR 前置由
3,638 初始候選，經失效清空 + 優先指派，最終 **is_cr='Y' = 1,996 筆，與 PG 完全一致**；`cr_id`/`cr_nm`/
`emplid`（=cr_id）逐列 0-diff。分佈兩側一致（tier T1 67.7/T2 22.8/T3 9.5%；dept XVE1 34.2/XVE2 33.0/
XVE3 15.2/XVE4 17.6%）。唯 `assignday` −1 日（§4 同一缺陷）。

**綜合三樣本**（198 案 / 9,376 案 / 27,796 案，涵蓋 8 卡別、tier T1-T5、4 部門、78 員工、2,007 筆 CR）：
除 assignday（date 正規化缺陷）與 score 之今日參考日效應（5 案，非邏輯不符）外，**計分/CR/比例分派全鏈
PG≡MSSQL 逐列等價**。

---

## 6. datetime2 / P5d 銜接

- production `appl_date` 確含非午夜時間分量（查證 run 全案 115,197/115,197 皆非午夜）。
- 以 wall-clock 載入時 MSSQL `datetime2` 忠實保存（round-trip 0 不符）。
- CR「逾2年清空」邊界對「日」粒度比較，當日任何時分皆不清空（與 PG 一致）。
- **§4 之 assignday 偏移與 datetime2 時區同源（驅動日期時區處理）**；production 時區/連線組態之最終裁示屬 **P5d**，
  併同修法交 architect。

---

## 7. 待簽核事項

1. 接受「Stage 2~4 計分/CR/比例分派全鏈 PG≡MSSQL 逐列等價」之結論（8/10 欄 0-diff；score 唯今日參考日效應）。
2. 認可 **assignday −1 日**為 cutover 前必修之日期正規化缺陷（已定位、修法明確），並排定修復 + 修後重驗。
3. P5d：裁示 production datetime2 時區/連線組態（與 §4 同源修法一併）。

簽核人：＿＿＿＿＿＿　日期：＿＿＿＿＿＿
