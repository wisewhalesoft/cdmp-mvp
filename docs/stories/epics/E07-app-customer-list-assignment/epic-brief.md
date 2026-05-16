# Epic Brief：E07 — 客戶名單分派

> **Epic ID**：E07
> **優先級**：P0（Critical）
> **類型**：下游應用
> **階段**：Phase 1（MVP）
> **Stories 數量**：46（含 A~H 組重構全批；廢棄 US-088/089/079/091；US-078 保留為流程外查詢入口）
> **最後更新**：2026-05-15（重構 E~H 組：新增 US-109~119；廢棄 US-079/091；補修 US-081/090/101/104/105/106/108；M03 拆分為 M03a/M03b/M03c/M03d）

## Epic 目標

讓業務主管（Sales Manager）能夠**獨立完成客戶名單分派全流程**，從條件設定、計分維度調整、部門與人員比例配置，到觸發月跑、查看結果、匯出清單，以及回顧歷史快照比對差異，**全程無需 IT 介入**。

現行系統由 IT 人員手動執行 SQL Stored Procedure，業務主管無可視化介面、無法自助調整參數、亦無執行快照可追溯。本 Epic 將上述流程完整搬移至 CDMP 平台，提供五個配置面板（名單定義 / 計分設定 / 分派比例 / 分派執行 / 快照歷史），讓業務主管在每月作業週期內自助完成所有操作。

## User Stories

### M01 — 名單定義

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-070 | 查看本月名單定義清單 | Must Have | [US-070-M01-view-list-definition.md](US-070-M01-view-list-definition.md) |
| US-071 | Stage 0 每日分派數量估算（含單一 LIST_NO 案件試算） | Must Have | [US-071-M01-stage0-daily-estimate.md](US-071-M01-stage0-daily-estimate.md) |
| US-104 | 月份切換與歷史月份唯讀 | Must Have | [US-104-M01-month-switch-history-readonly.md](US-104-M01-month-switch-history-readonly.md) |
| US-105 | 名單五階段狀態總覽 | Must Have | [US-105-M01-list-stage-overview.md](US-105-M01-list-stage-overview.md) |
| US-106 | 草稿階段建立名單與篩選條件 | Must Have | [US-106-M01-draft-create-list-with-filter.md](US-106-M01-draft-create-list-with-filter.md) |
| US-107 | 草稿階段 per-LIST_NO CR 回分開關設定 | Must Have | [US-107-M01-draft-per-list-cr-toggle.md](US-107-M01-draft-per-list-cr-toggle.md) |
| US-108 | 草稿階段推進至部門比例設定 | Must Have | [US-108-M01-draft-advance-to-dept-ratio.md](US-108-M01-draft-advance-to-dept-ratio.md) |
| US-120 | CR 回分儲存位置 spec 落差修正 | Must Have | [US-120-M01-cr-storage-spec-correction.md](US-120-M01-cr-storage-spec-correction.md) |
| US-090 | 名單定義停用（草稿階段退出）| Must Have | [US-090-M01-disable-list-definition.md](US-090-M01-disable-list-definition.md) |
| ~~US-088~~ | ~~新增名單定義~~（**已廢棄，由 US-106 取代**）| 廢棄 | [US-088-M01-create-list-definition.md](US-088-M01-create-list-definition.md) |
| ~~US-089~~ | ~~編輯名單定義~~（**已廢棄，由 US-106 取代**）| 廢棄 | [US-089-M01-edit-list-definition.md](US-089-M01-edit-list-definition.md) |

### M02 — 計分設定

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-072 | 查看計分維度設定 | Must Have | [US-072-M02-view-scoring-dimensions.md](US-072-M02-view-scoring-dimensions.md) |
| US-073 | 編輯計分維度與分數 | Must Have | [US-073-M02-edit-scoring-dimension.md](US-073-M02-edit-scoring-dimension.md) |
| US-074 | 編輯 CARD_LEVEL 分級門檻 | Must Have | [US-074-M02-edit-card-level-thresholds.md](US-074-M02-edit-card-level-thresholds.md) |
| US-097 | 新增 CARD_LEVEL 等級 | Must Have | [US-097-M02-create-card-level.md](US-097-M02-create-card-level.md) |
| US-075 | 編輯 TIER_LEVEL 對應表 | Must Have | [US-075-M02-edit-tier-mapping.md](US-075-M02-edit-tier-mapping.md) |

### M03 — 分派比例（重構後拆分為 M03a/M03b/M03c/M03d）

> **[重構決策，2026-05-15]**：M03 原為單一模組，重構後依五階段流程拆分如下：
> - **M03a（部門比例設定階段）**：US-109/110/111
> - **M03b（個別業務比例設定階段）**：US-112/113/114/115
> - **M03c（簽核階段）**：US-116/117
> - **M03d（準備完成階段）**：US-118/119

#### M03a — 部門比例設定階段

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-109 | 部門比例設定（各部門分配比例）| Must Have | [US-109-M03a-set-dept-ratio.md](US-109-M03a-set-dept-ratio.md) |
| US-110 | 部門比例設定階段推進至個別業務比例設定 | Must Have | [US-110-M03a-advance-to-personnel-ratio.md](US-110-M03a-advance-to-personnel-ratio.md) |
| US-111 | 部門比例設定階段 Rollback 至草稿 | Must Have | [US-111-M03a-rollback-to-draft.md](US-111-M03a-rollback-to-draft.md) |

#### M03b — 個別業務比例設定階段

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-112 | 個別業務比例設定（處長設定本部門業務員比例）| Must Have | [US-112-M03b-set-personnel-ratio.md](US-112-M03b-set-personnel-ratio.md) |
| US-113 | 獎懲快速比例設定（相對調整模板）| Must Have | [US-113-M03b-quick-ratio-template.md](US-113-M03b-quick-ratio-template.md) |
| US-114 | 個別業務比例設定階段推進至簽核 | Must Have | [US-114-M03b-advance-to-approval.md](US-114-M03b-advance-to-approval.md) |
| US-115 | 個別業務比例設定階段 Rollback 至部門比例設定 | Must Have | [US-115-M03b-rollback-to-dept-ratio.md](US-115-M03b-rollback-to-dept-ratio.md) |

#### M03c — 簽核階段

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-116 | 部長核准名單（簽核通過 → 準備完成）| Must Have | [US-116-M03c-approve-to-ready.md](US-116-M03c-approve-to-ready.md) |
| US-117 | 部長拒絕名單並退回個別業務比例設定 | Must Have | [US-117-M03c-reject-to-personnel-ratio.md](US-117-M03c-reject-to-personnel-ratio.md) |

#### M03d — 準備完成階段

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-118 | 準備完成階段查詢摘要（唯讀）| Must Have | [US-118-M03d-ready-stage-summary.md](US-118-M03d-ready-stage-summary.md) |
| US-119 | 準備完成階段 Rollback 至簽核 | Must Have | [US-119-M03d-rollback-to-approval.md](US-119-M03d-rollback-to-approval.md) |

#### M03（舊版，部分廢棄 / 保留）

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-078 | 查看人員比例設定（**流程外查詢入口，保留**）| Must Have | [US-078-M03-view-personnel-ratio.md](US-078-M03-view-personnel-ratio.md) |
| ~~US-079~~ | ~~編輯人員比例設定~~（**已廢棄，由 US-112 取代**）| 廢棄 | [US-079-M03-edit-personnel-ratio.md](US-079-M03-edit-personnel-ratio.md) |
| US-080 | 開關 CR 回分規則 | Must Have | [US-080-M03-toggle-cr-reassignment.md](US-080-M03-toggle-cr-reassignment.md) |
| ~~US-091~~ | ~~設定 per-LIST_NO 部門比例~~（**已廢棄，由 US-109 取代**）| 廢棄 | [US-091-M03-edit-per-list-dept-ratio.md](US-091-M03-edit-per-list-dept-ratio.md) |

### M04 — 分派執行

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-081 | 觸發分派月跑 | Must Have | [US-081-M04-trigger-assignment-run.md](US-081-M04-trigger-assignment-run.md) |
| US-082 | 查看分派執行進度 | Must Have | [US-082-M04-view-run-progress.md](US-082-M04-view-run-progress.md) |
| US-083 | 查看分派結果摘要 | Must Have | [US-083-M04-view-run-result-summary.md](US-083-M04-view-run-result-summary.md) |
| US-084 | 匯出分派結果 | Must Have | [US-084-M04-export-assignment-result.md](US-084-M04-export-assignment-result.md) |

### M05 — 快照歷史

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-085 | 查看歷史執行紀錄清單 | Must Have | [US-085-M05-view-run-history-list.md](US-085-M05-view-run-history-list.md) |
| US-086 | 查看執行快照詳情 | Must Have | [US-086-M05-view-run-snapshot-detail.md](US-086-M05-view-run-snapshot-detail.md) |
| US-087 | 比對兩次執行結果差異 | Should Have | [US-087-M05-compare-run-results.md](US-087-M05-compare-run-results.md) |

### M06 — 代碼維護

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-092 | E07 相關代碼維護（PROD_KIND / SPEC_TP / CASEYEAR） | Must Have | [US-092-M06-edit-base-code.md](US-092-M06-edit-base-code.md) |
| US-102 | 管理 POOLDATA 篩選欄位白名單（含欄位類別 metadata） | Must Have | [US-102-M06-manage-pooldata-field-whitelist.md](US-102-M06-manage-pooldata-field-whitelist.md) |
| US-103 | 管理類別型欄位的可選值 | Must Have | [US-103-M06-manage-categorical-field-values.md](US-103-M06-manage-categorical-field-values.md) |

### M07 — 角色與可見範圍

> **重要（2026-05-15 決策）**：E07 角色矩陣最終定案如下：
> - **部長 + Admin**：對 E07 全模組（白名單維護、計分設定、部門比例、簽核、月跑觸發、名單 CRUD）擁有完整操作權限
> - **處長**：**僅限**「個別業務比例設定」（可操作）+ 「準備完成階段查詢」（可查詢唯讀）；其他所有 E07 功能無操作權限（M02 計分設定可唯讀查看）
> - **角色指派入口**：E02 帳號管理頁（US-014），E07 不另設指派 UI
> - 此矩陣為 **F002（auth/permission feature spec）** 的更新依據，需通知 spec-writer 同步

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-100 | 部長角色定義與 E07 全模組操作權限 | Must Have | [US-100-M07-define-director-role.md](US-100-M07-define-director-role.md) |
| US-101 | 處長角色定義與可見範圍（收斂版） | Must Have | [US-101-M07-define-section-chief-role.md](US-101-M07-define-section-chief-role.md) |

## 依賴關係

- **依賴**：E01（驗證登入，業務主管須通過身分驗證）、E02（帳號角色管理，需定義業務主管角色及其存取權限）、E04（資料擷取）：OBEMPHIRE / OBCALENDAR 透過 E04 通用擷取任務同步至 AppDB，E07 業務邏輯直接查詢 `ob_emphire` / `ob_calendar`，無需 E07 額外維護
- **封鎖下游**：無
- **NFR 關聯**：NFR-003（分派執行效能）、NFR-004（快照原子性）、NFR-005（結果準確性）

## 關鍵資料實體

### AssignmentRun（分派月跑紀錄）

| 欄位 | 類型 | 說明 |
|------|------|------|
| run_id | UUID (PK) | 執行唯一識別碼 |
| ym | VARCHAR(6) | 作業年月（YYYYMM） |
| status | ENUM('pending','running','completed','failed') | 執行狀態 |
| triggered_by | UUID (FK) | 觸發者帳號 |
| triggered_at | TIMESTAMP | 觸發時間 |
| completed_at | TIMESTAMP | 完成時間 |
| total_count | INTEGER | 總分派筆數 |
| error_message | TEXT | 錯誤訊息（失敗時填入） |

### AssignmentRunSnapshot（執行快照）

| 欄位 | 類型 | 說明 |
|------|------|------|
| run_id | UUID (FK) | 關聯月跑 |
| snapshot_type | ENUM('config','input_list','result') | 快照類型 |
| payload | JSONB | 快照內容 |
| created_at | TIMESTAMP | 快照時間 |

### AssignmentAuditLog（E07 CRUD 操作稽核日誌）

記錄 E07 所有 CRUD 操作完整歷程，含 action（新增/編輯/停用/比例設定）、操作者、操作時間、LIST_NO 等。

**待解決**：表結構由 system-architect 設計（見「待解決問題」第 2 點）。

### OBMCODEDF（既有，代碼維護）

| 欄位（參考） | 說明 |
|------------|------|
| CODE_TYPE | 代碼類別（PROD_KIND / SPEC_TP / CASEYEAR） |
| CODE_VAL | 代碼值 |
| CODE_NM | 顯示名稱 |
| STATUS | 啟用/停用 |

參照 Story：US-092（代碼維護）、US-088/089（表單選項來源）

### per-LIST_NO 部門比例表（待確認）

為特定 LIST_NO 設定各部門 RATION，覆寫全域 OBMDEPTPCT。

**待解決**：需確認是否為既有 OBPCTLIST 或需新建（見「待解決問題」第 4 點）。

參照 Story：US-091（設定 per-LIST_NO 部門比例）、US-081（月跑 Stage 2 讀取）

### 既有 OB 相關表

| 表名 | 說明 | 資料同步機制 | 參照 Story |
|------|------|------------|-----------|
| OBEMPHIRE | 員工主檔（EMP_ID / EMP_NM / DEPT_CODE / DEPT_NAME / JFUN_ID / RESIGN_DATE），提供姓名/部門 join 與在職狀態過濾（RESIGN_DATE IS NULL） | E04 ETL 每日擷取 → AppDB `ob_emphire` | US-079（員工清單）、US-081（Stage 4 人員 join）、US-084（匯出員工姓名） |
| OBCALENDAR | 工作日/假日表（CALENDAR_DATE / REST_FLG），REST_FLG=0 為工作日，排除週末與國定假日 | E04 ETL 定期擷取 → AppDB `ob_calendar` | US-071（Stage 0 工作日試算） |
| OBMDEPTPCT | 全域部門比例設定 | 業務主管於 E07 M03 維護 | US-076、US-077 |
| OBMLISTDF | 名單定義（Stage 篩選條件）**[需 schema 變更：新增 STATUS ENUM('active','inactive') 欄位]** | 業務主管於 E07 M01 維護 | US-070、US-071、US-088、US-089、US-090 |
| OBLEVELCARD_VERSION | 計分版本管理 | 業務主管於 E07 M02 維護 | US-072、US-073 |
| OBLEVELCARD_COLUNM | 計分維度欄位定義 | 業務主管於 E07 M02 維護 | US-073 |
| OBLEVELCARD_SCORE | 計分維度分數設定 | 業務主管於 E07 M02 維護 | US-073 |
| OBLEVELCARD_LEVEL | CARD_LEVEL 分級設定（總分區間 → CARD_LEVEL=A/B/C/D…） | 業務主管於 E07 M02 維護 | US-074 |
| OBTIER | TIER_LEVEL 對應表（CARD_TYPE × CARD_LEVEL → TIER_LEVEL=T1/T2/T3…）；AppDB 對應名 `ob_tier`；原表 4 欄（LIST_NM / CARD_TYPE / CARD_LEVEL / TIER_LEVEL，皆 nullable，無 PK constraint，無稽核欄位）；schema 已確認（2026-05-05）；dump 顯示 8 種 CARD_TYPE（H/S/E/S5/E5/M/HM/M5），HM/M5 為計分卡外 fallback，其 CARD_LEVEL 可為空；複合 PK `(card_type, card_level)` **[ASSUMPTION：遷移時補建，非原表既有；CARD_LEVEL 為空時以 CARD_TYPE 唯一]** | 業務主管於 E07 M02 維護 | US-075 |
| OBPOOLDATA | 案件池（OB 月跑輸入案件清單） | E04 ETL 擷取 | US-081（Stage 1 讀取） |
| OBPOOLDATA_LIST | per-LIST_NO 案件池 / 分派結果寫回表（OB_DEPT、OB_EMPLID） | 月跑寫入 | US-081（Stage 3/4 寫入）、US-083、US-086 |
| OBEMPLSETMF | 人員比例設定（業務員 RATION） | 業務主管於 E07 M03 維護 | US-078、US-079、US-081 |

## 成功標準

1. 業務主管能夠在不需要 IT 協助的情況下，完成每月名單分派全流程
2. 執行月跑後，系統產生唯一 `run_id`，三份快照（條件設定 / 輸入清單 / 結果明細）原子性寫入，可完整追溯
3. 新系統分派結果與舊系統 Stored Procedure 結果誤差 < 3%（以件數計算）
4. 五個配置面板（M01 ~ M05）全部可操作，無任何功能需跳出至資料庫工具
5. 歷史快照支援任意兩次執行的差異比對，業務主管可清楚看出人員配置或參數變動的影響

## 已解決問題（2026-04-24 system-architect 決策）

原 6 條待解決問題已全數決策完成：

1. ✅ **OB 資料庫架構定位** → 方案 C：OB 表全數遷移至 AppDB（PostgreSQL），採 `ob_` 前綴 snake_case 命名，不直連 OB DB。詳見 [architecture-spec.md §3.10](../../specs/architecture-spec.md) 與 [data-model.md](../../specs/data-model.md) OB 表映射表
2. ✅ **OBMLISTDF STATUS 欄位** → AppDB 新建表 `ob_list_definition` 直接加 `status VARCHAR(10) NOT NULL DEFAULT 'active'`
3. ✅ **AssignmentAuditLog 表設計** → 採納建議設計（id / action / entity_type / entity_id / operator_id / operated_at / before_payload JSONB / after_payload JSONB / ip_address），存於 AppDB，保留 3 年
4. ✅ **LIST_NO 999 上限處理** → MVP 達上限回傳 422（error_code: `LIST_NO_LIMIT_EXCEEDED`）；Phase 2 backlog 評估擴位
5. ✅ **per-LIST_NO 部門比例表** → 使用 `ob_dept_pct`（OBMDEPTPCT 映射），無「全域比例」概念；**US-076/077 已確認為需求誤解產物，本版刪除**
6. ✅ **CARD_TYPE 舊資料遷移策略** → 遷移時直接沿用現有值（舊 SP 由 LIST_NM 解析之結果），缺漏筆數由遷移腳本識別處理
7. ✅ **OBEMPHIRE / OBCALENDAR 同步機制（2026-05-04 決議）** → 採 E04 通用擷取任務：Admin 於系統初始化時建立兩個擷取任務（`ob_emphire` 每日擷取、`ob_calendar` 定期擷取），E07 業務邏輯直接 query AppDB。不在 E07 額外新增 CRUD Story，業務主管不維護這兩張表。
8. ✅ **OBTIER schema 已取得（2026-05-05）** → 確認為 4 欄結構（LIST_NM nvarchar(30) / CARD_TYPE varchar(5) / CARD_LEVEL varchar(5) / TIER_LEVEL varchar(5)，皆 nullable，原表無 PK constraint，無稽核欄位）。LIST_NM 為描述性輔助欄位，不參與 SP join 邏輯。複合 PK `(card_type, card_level)` 從 SP join 條件推論業務上唯一，遷移至 AppDB 時補建。操作稽核由 `assignment_audit_log` 統一記錄，`ob_tier` 本表不含稽核欄位。

相關架構決策：AD-E07-1（OB 資料遷移）、AD-E07-2（月跑非同步 + 快照原子性）、AD-E07-3（複雜計分保留為 PostgreSQL function）。

9. ✅ **2026-05-05 dump 驗證後 6 項 Story 層決議**：

   a. **OBLEVELCARD_VERSION 補加 STATUS 欄位**（差異 1）：原表無 STATUS 欄位，以 SDATE/EDATE（VARCHAR(8) YYYYMMDD）表達計分版本生效期間（dump 6 筆全部 EDATE='20991231'）。採選項 B：遷移至 AppDB 時補加 `status VARCHAR(10) NOT NULL DEFAULT 'active'`，初值由 SDATE/EDATE 計算（SDATE ≤ 今日 < EDATE 則設 'active'）。與 ob_list_definition 採相同設計。影響：US-072、US-073、US-074。

   b. **OBTIER 接受 HM/M5 等計分卡外 fallback，CARD_LEVEL 可空**（差異 2）：OBTIER dump 顯示 8 種 CARD_TYPE（H/S/E/S5/E5/M/HM/M5），HM（機車期中名單）、M5（機車中結滿期名單）為計分卡體系外 fallback；M5 的 CARD_LEVEL 為空字串，月跑 Stage 2 僅比對 CARD_TYPE 即輸出 TIER_LEVEL。複合 PK 假設附加但書：CARD_LEVEL 為空時以 CARD_TYPE 唯一。TIER_LEVEL 有效值約 13 種（T1/T2/T3/T1M/T3M/T32/T4/T51/T52/T1HM/T2HM/T3HM/T5M）。影響：US-075；OQ 待解決項（TIER_LEVEL 有效值範圍 / CARD_TYPE 有效值來源）標記 Resolved。

   c. **OBEMPLSETMF.DEPTID_M 遷移時 RTRIM**（差異 4）：原表 DEPTID_M 宣告 VARCHAR(50)，業務值為 4 字元部門代碼，dump 顯示 46 個空白填充。遷移腳本需 `RTRIM`，新系統 `ob_empl_set.deptid_m` 存入 trim 後值。影響：US-079。

   d. **OBMLISTDF 多值欄位採 `$$` 分隔，UI 為多選**（差異 5）：dump 驗證 SPEC_TP / SETTLE_SRC / CASEYEAR / PROD_KIND 均為多值欄位，以 `$$` 分隔儲存（例：SPEC_TP = `02$$04$$05$$06$$11$$12`、SETTLE_SRC = `Y$$N`）。表單元件改為多選 CHKBOX，PROD_KIND 由「單選下拉」更正為「多選 CHKBOX」。影響：US-088、US-089。

   e. **OBMCODEDF.SYSTEM_ID 固定為 `OB`**（差異 6，OQ-E07-11 Resolved）：dump 全表驗證 SYSTEM_ID 全部為 `OB`，後端查詢加 `WHERE SYSTEM_ID = 'OB'` 即可，不需 UI 呈現。影響：US-092。

   f. **差異 3（稽核欄位 NULL）屬 spec 範圍**：OBLEVELCARD_VERSION 稽核欄位允許 NULL（dump 6 筆中至少 4 筆為 NULL），此差異僅影響 data-model.md，不在 Story 層處理，由 spec-writer 負責。
