---
spec-id: F115
title: 分派結果回寫 OBPOOLDATA_LIST（外部 legacy 業務系統）
feature-id: F115
source-story: US-180（待建）
epic: E07 — 客戶名單分派
module: M05 執行歷史 / 分派結果
priority: P1
version: "0.1"
date: 2026-07-14
status: Design（設計中，本輪不實作）
---

# F115: 分派結果回寫 OBPOOLDATA_LIST

Priority: P1 | Status: **Design-only（設計文件，尚未進入實作）** | Last Updated: 2026-07-14

> **本文件為設計/決策紀錄，不含實作碼。** 目的：在快照詳情頁「分派結果」分頁提供一個受控動作，將 CDMP 之月名單分派結果（`ob_monthly_run_result`）回寫至**外部 legacy 業務系統** `APYHFC16.OB.OBPOOLDATA_LIST`，取代 legacy 由一連串 SP（Stage1~4）就地寫入的流程。實作將於後續一輪以 TDD 進行。
>
> **關鍵決策（經使用者 2026-07-14 拍板）**：
> - 回寫目標 = **外部 `APYHFC16.OB.OBPOOLDATA_LIST`**（非 CDMP 自有 `ob_pool_data_list`）。
> - 觸發 = **分派結果畫面之手動按鈕**（部長專屬）+ **預覽** + **二次確認**，且 **dry-run 先行**（先產生/預覽將寫入的內容，確認後才實際寫入）。

---

## 1. 功能摘要

CDMP 月名單分派完成後，結果存於 `ob_monthly_run_result`（每列 `result_status` 初始為 `PENDING`，目前**從未被轉換**）。本功能讓業務部長於「執行歷史 → 快照詳情 → 分派結果」分頁，針對某一已完成之 run，將分派結果（承辦部門 / 承辦人員 / 指派日 / 計分等級 / 分級 / CR 相關欄）回寫到外部 legacy 之 `OBPOOLDATA_LIST`，供 legacy 催收作業系統使用。

回寫採**兩段式**：
1. **預覽（dry-run）**：計算並回傳「將更新的列數、樣本、以及對應 UPDATE 之影響摘要」，**不寫入**。
2. **確認執行**：使用者於 UI 二次確認後，才以 **set-based UPDATE（依 PK 比對、按 `list_no` 分批）** 實際寫入外部庫，並將 `ob_monthly_run_result.result_status` 由 `PENDING` 轉為 `SUCCESS` / `FAILED`。

---

## 2. User Story

**As a** 業務部長
**I want** 在確認某月分派結果無誤後，將結果一鍵回寫到 legacy 業務系統（OBPOOLDATA_LIST），並在寫入前先預覽將變更的內容
**So that** 催收人員能於既有 legacy 系統看到 CDMP 產出的分派，且我能在不可逆寫入前確認範圍、避免誤寫

---

## 3. Legacy 對照（來源：`reference/SP/`）

Legacy 無「一支回寫 SP」；`OBPOOLDATA_LIST`（`[OB].[dbo].[OBPOOLDATA_LIST]`）之分派結果由 Stage1~4 一連串 SP 寫入，以 `LIST_NO`（含 `YYYYMM`）為單位：

| Legacy 階段 | Worker SP | 對 OBPOOLDATA_LIST 的寫入 |
|---|---|---|
| Stage1 撈案 | `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` | 先 `DELETE WHERE LIST_NO=@LIST_NO` 再 set-based **INSERT**（結果欄初始為空） |
| Stage2 計分/分級 | `SP_OBLEVELCARD_*` + inline | **UPDATE** `CARD_LEVEL`，再 `TIER_LEVEL` |
| Stage3 部門分配 | `..._st2_dept`(+變體) | **UPDATE** `OB_DEPT`（CR 案另寫 `OB_EMPLID` / `IS_CR`） |
| Stage4 人員/指派日 | `..._st3_emplid`(+變體) | **UPDATE** `OB_EMPLID`, `ASSIGNDAY` |

- 比對鍵：Stage2/4 以 `APPL_NO`（Stage4 僅 `APPL_NO`，月內以 `LEFT(LIST_NO,8)` 界定範圍）。⚠️ 此為 legacy 潛在跨名單碰撞風險，CDMP **不複製**，改用完整 PK。
- 重跑安全：Stage1 delete+insert；Stage2/3/4 先清空當月結果欄再重算。
- SCORE：legacy 存於 `OBLEVELCARD` 表，`OBPOOLDATA_LIST` 上不維護（本功能是否寫 `SCORE` 見 §9 OQ-3）。

> 註：`USP_OB_OBPOOLDATA.sql` 建的是上游母體 `OBPOOLDATA`（非 `_LIST`）；`USP_OBZ020_*` 管的是名單定義 `OBMLISTDF`。三者皆非回寫路徑。

---

## 4. 欄位對應（CDMP `ob_monthly_run_result` → legacy `OBPOOLDATA_LIST`）

⚠️ **命名陷阱**：CDMP `dept_id` / `emplid` 是**分派結果**，對應 legacy 之 **`OB_DEPT` / `OB_EMPLID`**（不是 legacy 的來源欄 `DEPT_ID` / `EMPLID`）。對錯欄會靜默毀資料。

| CDMP 欄（`ob_monthly_run_result`） | legacy `OBPOOLDATA_LIST` 欄 | 備註 |
|---|---|---|
| `list_no`（PK） | `LIST_NO` | 比對鍵之一 |
| `orgno`（PK） | `ORGNO` | 比對鍵之一 |
| `appl_no`（PK） | `APPL_NO` | 比對鍵之一 |
| `dept_id` | **`OB_DEPT`** | 承辦部門（分配結果） |
| `emplid` | **`OB_EMPLID`** | 承辦人員（分配結果） |
| `emplid_deptid` | `EMPLID_DEPTID` | 人員所屬部門 |
| `assignday` | `ASSIGNDAY` | 指派日（`YYYYMMDD` 字串，確認格式一致） |
| `card_level` | `CARD_LEVEL` | 計分等級 |
| `tier_level` | `TIER_LEVEL` | 分級 |
| `is_cr` | `IS_CR` | 是否 CR 回分 |
| `cr_id` | `CR_ID` | CR 承辦 |
| `cr_nm` | `CR_NM` | CR 名稱 |
| `score`（選寫） | `SCORE` | legacy 不維護；是否寫入見 OQ-3 |

**比對鍵 = 完整 PK `(LIST_NO, ORGNO, APPL_NO)`**（避免 legacy 之 `APPL_NO`-only 碰撞）。

---

## 5. 寫入語意

- **UPDATE-in-place**（非 delete+insert）：僅更新 §4 之結果欄；`OBPOOLDATA_LIST` 之母列假設已由 legacy Stage1（或既有流程）建立。若目標列不存在 → 記為「未命中」，於預覽與結果摘要標示（見 OQ-4：是否 fallback INSERT）。
- **set-based `UPDATE ... FROM`**，**按 `list_no` 分批**（每批一交易），避免 7.8M 級鎖 / log 膨脹。禁止全載記憶體（沿用 `target-load-handler-mssql.ts` 的 pushdown 型式）。
- **範圍界定**：以 CDMP `run_id` → 該 run 之所有列（乾淨可辨識），不依賴 legacy 之 `LEFT(LIST_NO,8)` 月字串。
- **一致性**：對象為**已完成** run，`ob_monthly_run_result` 不再異動。

---

## 6. `result_status` 生命週期

`PENDING`（月跑寫入時）→ 執行回寫：
- 每列成功寫入外部庫 → `SUCCESS`
- 寫入失敗 / 目標列未命中 → `FAILED`（附原因碼）
- 重跑：允許對 `PENDING` / `FAILED` 之列重試；`SUCCESS` 列預設略過（冪等；可加「強制覆寫」旗標，見 OQ-5）。

---

## 7. 觸發、預覽與安全（經拍板）

- **入口**：快照詳情頁「分派結果」分頁上之「回寫 OBPOOLDATA_LIST」按鈕。
- **權限**：**部長專屬**（`DirectorGuard`，比照觸發月跑 F061）。處長 / 一般使用者不得執行。
- **兩段式 + 二次確認**：
  1. 按下按鈕 → 呼叫**預覽端點（dry-run）**：回傳將更新列數、依 `list_no` 分組摘要、樣本 N 列、未命中列數。**不寫入**。
  2. UI 顯示預覽摘要 + 明確警語（不可逆、寫入外部生產系統）→ 使用者二次確認 → 呼叫**執行端點**才實際寫入。
- **稽核**：預覽與執行皆寫 `assignment_audit_log`（actor、run_id、影響列數、結果）。

### 7.1 提議 API（實作輪定稿）

| 方法 | 路由 | 說明 |
|---|---|---|
| POST | `/api/v1/assignment/runs/:runId/writeback/preview` | dry-run；回 `{ totalToUpdate, byListNo[], sample[], notMatched }`，不寫入 |
| POST | `/api/v1/assignment/runs/:runId/writeback` | 實際回寫（需 body 帶預覽產生之確認 token / checksum，防跳過預覽） |

---

## 8. 外部連線架構（關鍵前置）

- 目前 CDMP **沒有**到 `APYHFC16`（企業 legacy MSSQL）之任何連線 / linked server / OPENQUERY（已 grep 確認）。回寫**前置需求**：
  - 於部署環境提供 legacy 連線（獨立 DataSource / 連線字串；帳密走 env，不入庫、不入前端）。
  - 網路可達性（CDMP 容器 → APYHFC16）、寫入權限帳號、TLS。
  - 決定連線方式：CDMP 直連 legacy DataSource（TypeORM 第二連線） vs 產生 UPDATE SQL 交由 DBA/排程套用（後者更保守；見 OQ-1）。
- **本輪不建立此連線**；F115 實作輪的第一步即為連線可行性驗證（PoC）。

---

## 9. 風險與待決問題（Open Questions）

| # | 問題 | 現況 / 傾向 |
|---|---|---|
| OQ-1 | 直連外部庫寫入 vs 產生 SQL 交 DBA 套用 | 直連較即時但風險高；保守方案為 dry-run 產生 SQL + 人工套用。實作輪 PoC 後定案 |
| OQ-2 | 目標列不存在時 | 預設記 `FAILED`/未命中；是否 fallback INSERT（比照 legacy Stage1）待定（OQ-4） |
| OQ-3 | 是否寫 `OBPOOLDATA_LIST.SCORE` | legacy 不維護；CDMP 有值。傾向不寫（對齊 legacy），待業務確認 |
| OQ-4 | INSERT fallback | 若母列缺失是否補插整列（需完整欄位來源）；傾向否（回寫僅更新結果欄） |
| OQ-5 | 重跑覆寫 `SUCCESS` 列 | 預設略過；是否提供「強制覆寫」 |
| OQ-6 | `ASSIGNDAY` 型別/格式 | CDMP `varchar`，legacy `YYYYMMDD`；確認格式一致 |
| OQ-7 | 分批交易大小 | 依 `list_no` 分批；每批列數上限待壓測 |
| OQ-8 | 是否同時清空 legacy 當月舊分派 | legacy Stage2/3/4 會先清空；CDMP 回寫是否需比照，避免殘留舊結果 |
| OQ-9 | 部分失敗處理 | per-batch 交易；失敗批標記 `FAILED` 並可重試，不整體 rollback |

---

## 10. 交叉參考

- 分派結果呈現與回寫按鈕位置：[F066](F066-view-run-snapshot-detail.md)（§7 UI/UX、AC-8）
- 分派結果資料表：`apps/api/src/database/entities/ob-monthly-run-result.entity.ts`（`result_status` 生命週期欄）
- 匯出 join 血緣（回寫來源查詢可重用）：`apps/api/src/modules/assignment/services/assignment-run-report.service.ts`（`buildExportQuery`）
- Set-based pushdown 寫入型式：`apps/api/src/modules/etl/engine/handlers/target-load-handler-mssql.ts`
- Legacy SP：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`、`..._st2_dept.sql`、`..._st3_emplid.sql`、`SP_OBLEVELCARD_*.sql`、`Stage1~4_*.sql`
- 目標表結構參照（CDMP 同構表）：`apps/api/src/database/entities/ob-pool-data-list.entity.ts`（欄位與 legacy `OBPOOLDATA_LIST` 對應，但**CDMP 本表為 ETL 單一來源，非回寫目標**）
