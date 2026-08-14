---
spec-id: F115
title: 分派結果回寫 OBPOOLDATA_LIST（外部 legacy 業務系統）
feature-id: F115
source-story: US-180（待建）
epic: E07 — 客戶名單分派
module: M05 執行歷史 / 分派結果
priority: P1
version: "0.2"
date: 2026-07-14
status: In Progress（實作中；execute 真實寫入待業務授權）
---

# F115: 分派結果回寫 OBPOOLDATA_LIST

Priority: P1 | Status: **In Progress** | Last Updated: 2026-07-14

> **目的**：在快照詳情頁「分派結果」分頁提供受控動作，將 CDMP 月名單分派結果（`ob_monthly_run_result`）回寫至**外部 legacy 業務系統** `APYHFC16.OB.OBPOOLDATA_LIST`。
>
> **關鍵決策（使用者 2026-07-14 拍板）**：
> - 回寫目標 = **外部 `APYHFC16.OB.OBPOOLDATA_LIST`**（非 CDMP 自有 `ob_pool_data_list`）。
> - 觸發 = 分派結果畫面手動按鈕（**部長專屬**）+ **預覽（dry-run）** + **二次確認**。
> - 寫入語意 = **UPDATE-in-place 既有列**（9 分派欄）；目標列不存在 → 記 **not-matched**，不 INSERT（OQ-2/OQ-4 定案）。
>
> **v0.2 連線方案定案（Phase 0 調查）**：
> - CDMP 與 `APYHFC16.OB` 為**不同 SQL Server**（OB=172.20.202.193；CDMP=172.20.202.212），無 linked server → 須**開獨立 mssql 連線**（不可 3-part 跨庫）。
> - **重用既有 ETL 外部連線機制**：已 seed `datasources` 表之 `APYHFC16.OB` 列（host/db/user 齊，密碼 UI 填入、AES 加密），dev 已於「資料來源」驗證可連。回寫服務比照 `MSSQLExecutor.withConnection`（`new mssql.ConnectionPool` + `CryptoUtil.decrypt`）開連線；**新增寫入方法**（既有 executor 僅讀）。不新增 app 層 DataSource、不新增 env。
> - **preview** 對外部做**唯讀 SELECT 探測** not-matched（安全、與既有讀取用途一致；連線不可用則 not-matched 回 null 優雅降級）。
> - **execute** 真實寫入外部生產庫為不可逆動作；本實作輪完成程式 + 單元測試（mock 外部連線），**不於開發 session 觸發真實生產寫入**，待業務於 UI 二次確認後執行。
>
> **實作對照**：`docs/specs/features/F066-view-run-snapshot-detail.md`（回寫按鈕位於分派結果分頁）。

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

### 7.1 API（v0.2 定稿）

| 方法 | 路由 | 權限 | 說明 |
|---|---|---|---|
| POST | `/api/v1/assignment/runs/:runId/writeback/preview` | DirectorGuard | dry-run，**不寫入**。回 `{ runId, totalToWrite, byListNo:[{listNo,count}], sample:[…前 N 列…], notMatched, connectionAvailable, writePermission }`。`notMatched` 由對外部**唯讀** SELECT 探測（連線不可用 → `null` + `connectionAvailable:false`）。 |
| POST | `/api/v1/assignment/runs/:runId/writeback` | DirectorGuard | 實際回寫。body `{ confirm: true }`（缺/false → 422）。回 `{ runId, updated, notMatched, failed, byListNo }`。連線未設定 → 422 `WRITEBACK_CONNECTION_NOT_CONFIGURED`；外部拒絕 UPDATE → 422 `WRITEBACK_PERMISSION_DENIED`；其他外部寫入錯誤 → 422 `WRITEBACK_EXTERNAL_WRITE_FAILED`。 |

### 7.2 失敗語意（v0.3，2026-08-14 補強）

實測事故：DBA 尚未授 UPDATE 權限時，mssql `RequestError`（SQL Server error 229，`The UPDATE permission was denied on the object 'OBPOOLDATA_LIST'…`）直接冒泡，前端只收到 `{"statusCode":500,"message":"Internal server error"}`，無從判斷是權限、連線或程式問題。補強後：

| 情境 | 端點 | 回應 |
|---|---|---|
| 帳號無目標表 UPDATE 權限 | preview | `writePermission:false`（唯讀 `fn_my_permissions` 探測）→ 前端停用確認框並提示洽 IT／DBA 開通 |
| 帳號無目標表 UPDATE 權限 | execute | 422 `WRITEBACK_PERMISSION_DENIED`（含驅動原文於 `detail`） |
| 其他外部寫入錯誤（逾時 / 欄位長度 / 死結…） | execute | 422 `WRITEBACK_EXTERNAL_WRITE_FAILED`（message 附驅動訊息） |
| 連線不可用 / 權限探測本身失敗 | preview | `writePermission:null`＝**未知**，不阻擋執行（避免誤擋），由 execute 的 422 兜底 |

**原子性**：上述兩種 execute 失敗皆在套用 `result_status` 與寫稽核**之前**早退 → CDMP 端維持 `PENDING`、不寫 `WRITEBACK` 稽核，可原樣重試（不會把未寫入的列誤標 `SUCCESS`）。

**execute 演算法**：讀 CDMP `ob_monthly_run_result`（run 全列）→ 依 `list_no` 分批（預設 500/批）→ 每批於外部連線建 `#wb` 暫存表 + 多列 INSERT（參數化）→ `UPDATE t SET OB_DEPT/OB_EMPLID/EMPLID_DEPTID/ASSIGNDAY/CARD_LEVEL/TIER_LEVEL/IS_CR/CR_ID/CR_NM FROM OBPOOLDATA_LIST t INNER JOIN #wb s ON t.LIST_NO=s.list_no AND t.ORGNO=s.orgno AND t.APPL_NO=s.appl_no`（`rowsAffected`=matched）→ LEFT JOIN 反查 not-matched keys → 回填 CDMP `result_status`（matched=SUCCESS / not-matched=FAILED）→ 寫 `assignment_audit_log`（action=`WRITEBACK`）。整體以 dev「資料來源」已驗證之 `APYHFC16.OB` datasource（`CryptoUtil.decrypt` 密碼、`mssql.ConnectionPool`）連線。

---

## 8. 外部連線架構（v0.2 定案）

- CDMP 與 `APYHFC16.OB` 為**不同 SQL Server**（OB=172.20.202.193 / CDMP=172.20.202.212），無 linked server → 開**獨立 mssql 連線**（不可 3-part 跨庫）。
- **重用 ETL 外部連線機制**：`datasources` 表已 seed `APYHFC16.OB`（host/db/user 齊；密碼 UI 填、AES 加密）；**dev 已於「資料來源」測試可連**。回寫服務以 datasource `name='APYHFC16.OB'` 解析、`CryptoUtil.decrypt` 密碼、`new mssql.ConnectionPool`（比照 `MSSQLExecutor.withConnection`）開連線；**新增寫入方法**（既有 executor 僅讀）。不新增 app 層 DataSource、不新增 env。
- **寫入權限（非程式）**：`APYHFC16.OB` 連線帳號（`CDMPT`）原僅供唯讀擷取（`db_datareader`）；DBA 須授予 `OB.dbo.OBPOOLDATA_LIST` 之 UPDATE 權限（`GRANT UPDATE ON dbo.OBPOOLDATA_LIST TO CDMPT`），execute 才能真正寫入。2026-08-14 首次實機執行即因此失敗（見 §7.2）；已請 DBA 開通，程式端亦補上 preview 探測與 422 對應。
- **安全**：preview 對外部只做唯讀 SELECT（探測 not-matched）；execute 為真實生產寫入，須 UI 二次確認；開發 session **不觸發真實寫入**（僅單元測試 mock 外部連線）。

---

## 9. 風險與待決問題（Open Questions）

| # | 問題 | 現況 / 定案 |
|---|---|---|
| OQ-1 | 直連 vs 產生 SQL 交 DBA | ✅**直連**：重用 `APYHFC16.OB` datasource + `mssql.ConnectionPool`（dev 已驗證可連）。 |
| OQ-2 | 目標列不存在 | ✅**記 not-matched → CDMP `result_status=FAILED`，不 INSERT**。 |
| OQ-3 | 是否寫 `SCORE` | 本實作**不寫 SCORE**（對齊 legacy；SCORE 於 legacy 存 OBLEVELCARD）。 |
| OQ-4 | INSERT fallback | ✅**否**（僅 UPDATE 9 分派欄）。 |
| OQ-5 | 重跑覆寫 `SUCCESS` | execute 對 run 全列冪等 UPDATE；「略過已 SUCCESS/強制覆寫」旗標為 follow-up。 |
| OQ-6 | `ASSIGNDAY` 格式 | CDMP `assignday`（月跑 `YYYYMMDD`）原值直送外部 `ASSIGNDAY`。 |
| OQ-7 | 分批大小 | 依 `list_no` 分批、每批預設 500 列（可調常數，未壓測）。 |
| OQ-8 | 是否清空 legacy 當月舊分派 | 本實作**不清空**（純 UPDATE 覆寫既有列分派欄）；需比照 legacy 清空另議。 |
| OQ-9 | 部分失敗 | per-batch 執行、不整體 rollback；連線未設定 → 422 早退。DBA 未授寫權 → preview 以 `writePermission:false` 先擋、execute 回 422 `WRITEBACK_PERMISSION_DENIED` 且不動 `result_status`／不寫稽核（§7.2）。 |

---

## 10. 交叉參考

- 分派結果呈現與回寫按鈕位置：[F066](F066-view-run-snapshot-detail.md)（§7 UI/UX、AC-8）
- 分派結果資料表：`apps/api/src/database/entities/ob-monthly-run-result.entity.ts`（`result_status` 生命週期欄）
- 匯出 join 血緣（回寫來源查詢可重用）：`apps/api/src/modules/assignment/services/assignment-run-report.service.ts`（`buildExportQuery`）
- Set-based pushdown 寫入型式：`apps/api/src/modules/etl/engine/handlers/target-load-handler-mssql.ts`
- Legacy SP：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`、`..._st2_dept.sql`、`..._st3_emplid.sql`、`SP_OBLEVELCARD_*.sql`、`Stage1~4_*.sql`
- 目標表結構參照（CDMP 同構表）：`apps/api/src/database/entities/ob-pool-data-list.entity.ts`（欄位與 legacy `OBPOOLDATA_LIST` 對應，但**CDMP 本表為 ETL 單一來源，非回寫目標**）
