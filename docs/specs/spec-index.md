---
spec-id: CDMP-INDEX
title: SPEC 文件索引
version: "3.25"
date: 2026-07-08
status: Draft
---

# CDMP MVP — SPEC 文件索引

> **v3.25 / 2026-07-08 / MSSQL P4-Spike 封鎖發現與 AD-E07-41 v1.0→v1.1 架構修訂**：P4-spike（真實 TypeORM `QueryRunner` 環境實測，記錄於 `docs/specs/implementation-log/AD-E07-41-P4-spike-impl.md`）發現**封鎖級事實**，推翻 AD-E07-41 v1.0 §1.1/§3 核心前提——`#local temp` 無法跨 `queryRunner.query()` 存活（TypeORM+node-mssql 於每次 request 間 reset session），CTAS→SELECT INTO 架構原設計不能照搬；`tempdb.sys.columns`+`OBJECT_ID` 內省、`DISTINCT ON`+ctid→`ROW_NUMBER`+`IDENTITY` tie-breaker、中文 round-trip 三項驗證皆通過；附帶發現 `INFORMATION_SCHEMA` 於 BIN collation 下大小寫敏感須用大寫。架構師裁示**採 `##global temp`**（已實測全程存活/內省/中文/去重全套證據，改動最小）取代原 `#local temp` 設計，具名 staging 表方案保留為已預先設計好的 fallback。**就地修訂 `implementation-log/AD-E07-41-mssql-p4-etl-engine.md`（v1.0→v1.1）**：(1) §1.1 修正 temp table 存活性假設、新增 §1.3 完整記錄 spike 發現+裁示理由+強制後續驗證要求；(2) §2 P4-spike 狀態更新為已完成（(b)(d)通過/(a)(c)失敗）；(3) §3/§4 全部 `#`→`##`、新增 `dropMssqlTempTableIfExists` 顯式清理函式；(4) §5 新增 §5.5 `INFORMATION_SCHEMA` 大小寫方言點；(5) §9 新增 **P4-spike-2**（`##global` 併發+崩潰清理驗證，含連線池假陽性陷阱提醒）子切片，**必須先過才可進入 P4a/b/c**；(6) §10 不變式更新——`I-MSSQL-TEMPTABLE-PREFIX-01` 由 **`I-MSSQL-TEMPTABLE-GLOBAL-01`** 取代，新增 `I-MSSQL-TEMPTABLE-CLEANUP-01`（顯式清理安全網）、`I-MSSQL-CATALOG-CASE-01`（系統目錄視圖大寫）；(7) 新增 §12 時程影響評估——**結論：影響小（+1.5–3 人天，原估算 27–46→28.5–49，變動約 5–7%，不構成需重新告知使用者時程的顯著變化）**，並附方案 B 對照組（+5–10 人天，變動 15–20%，屬「顯著」等級）量化本次選 A 的理由。**架構師判斷 tie-breaker 語意（I-MSSQL-DEDUP-TIEBREAK-01）與本次裁示皆不需使用者事前核准**，已在 AD 內部完成裁示並可直接推進 P4-spike-2。**刻意未動**：`architecture-spec.md`（理由同前）。

> **v3.24 / 2026-07-08 / MSSQL 全面遷移 P4（ETL 引擎 MSSQL 化，含 customer_core 真實資料）架構設計**：P3（Raw SQL 引擎移植）設計階段查出 Stage 2 計分 9/15 個對照欄位依賴 `customer_core`，而該表資料完全由「ETL for Customer Core」53 節點 pipeline 灌入；架構師逐 handler 實地盤點（讀 `etl-pipelines.json` 全部 53 節點 nodeType 分布 + 全部 9 個 ETL handler 原始碼）後確認**不存在可控最小子集**——customer_core pipeline 用盡 ETL 引擎全部 9 種 handler，且全部共用同一套 `CREATE TEMP TABLE AS SELECT` PG-only 架構骨幹，估算 27–46 人天，實質等於 Phase 4 大半。使用者核准拉前於 P3 之前執行，接受此工作量。新增 **[`implementation-log/AD-E07-41-mssql-p4-etl-engine.md`](implementation-log/AD-E07-41-mssql-p4-etl-engine.md)**，固化：(1) driver 組織——沿用 P3「PG 檔不動、mssql 平行檔」精神，9 個 handler 各自平行 `*-mssql.ts`，組裝點（`etl-pipeline-execution.service.ts`）依 `DB_TYPE` 分支註冊；`NodeDispatcher`/`pipeline-runner.ts` 不動（driver-agnostic）；(2) **P4-spike 四項技術驗證**（`SELECT INTO #temp` 可行／`information_schema.columns` 對區域暫存表地雷確認+`tempdb.sys.columns`+`OBJECT_ID` 替代方案／單一 QueryRunner 全程存活／`DISTINCT ON`+`ctid`→`ROW_NUMBER()` 改寫可行），**必須在真實 TypeORM QueryRunner 環境驗證**（先前 standalone `mssql` 套件腳本驗證因非真實引擎環境而放棄）；(3) CTAS→`SELECT INTO` 轉換抽共用 helper（`temp-table.util.ts`，內省統一走 `tempdb.sys.columns`）；(4) **Dedup tie-breaker 改寫**＝`ctid`→`SELECT INTO` 專用 `IDENTITY(INT,1,1)` 捕捉寫入順序，架構師判斷為「忠實語意翻譯非業務規則重新定義」不需使用者事前核准，但記錄為 §11 需留意項；(5) `ON CONFLICT`→兩段式 UPDATE+INSERT-WHERE-NOT-EXISTS（不採 MERGE）；Pattern B/cast/正則逐項轉換；(6) bulk-load（COPY→tedious `Request.bulk`，來源端 `mssql-executor.ts` 已相容不需改）；(7) customer_core schema 補齊 MSSQL baseline（獨立最先執行的小顆粒切片）；(8) EQ/端對端測試策略（53 節點 pipeline 端對端比對 PG 結果）；(9) P4-0/spike/a/b/c/d/e 七個子切片與 DoD + 判定不需要 spec-writer。新增 4 個不變式（I-MSSQL-TEMP-METADATA-01/TEMPTABLE-PREFIX-01/DEDUP-TIEBREAK-01/ETL-EQ-01）。**刻意未動**：`architecture-spec.md`（理由同前，P 系列尚未 cutover 落地）。

> **v3.23 / 2026-07-07 / MSSQL 全面遷移 P2（自建 T-SQL 佇列，取代 pg-boss）架構設計**：P1（P1a/P1b1/P1b2/P1b3/P1c）全數 commit、CI 骨架建好後，進入全計畫最高風險項——佇列自建 T-SQL（硬約束②，不得新增 Redis/BullMQ）。新增 **[`implementation-log/AD-E07-40-mssql-p2-self-built-queue.md`](implementation-log/AD-E07-40-mssql-p2-self-built-queue.md)**，固化：(1) 關鍵前提差異——P0 `mssql-smoke.mjs` 已對 Linux 容器實測驗證 `UPDLOCK/READPAST/ROWLOCK+OUTPUT` 佇列 claim 核心語法（純 T-SQL DML，不受 P1c `sp_getapplock` 曾踩之 17750 DLL 缺失影響）→ P2 核心機制可於本機完整測試；(2) `dbo.queue_job` schema（entity + filtered index 走手寫 baseline，沿用 AD-E07-39 兩軌策略）；(3) 五個原子操作 T-SQL（claim/complete/expire sweep/cancel/send）；(4) pg-boss 契約對齊表——`RUN_QUEUE_NAME`/`RunJobPayload`/`RETRY_LIMIT=0`/`BATCH_SIZE=1`/`send`/`cancel` 簽章不變，**`OrphanReaper`/`CancellationPoller` 重新查證確認零改動**；(5) 單 worker 輪詢 loop 設計 + `processPayload` 共用邏輯防止 pg-boss/mssql 兩路徑語意漂移 + 完整檔案改動清單；(6) driver-conditional 策略（RESOLVED：postgres 分支 cutover 前維持 pg-boss 不變，不強行統一 push/pull 介面）；(7) 併發正確性驗證 harness（本專案首次自寫此類測試，含 **pool.max≥K 假陽性陷阱**防範）；(8) P2a/P2b/P2c 三個實作切片與 DoD + 判定不需要 spec-writer。新增 4 個不變式（I-MSSQL-QUEUE-CLAIM-01/SERIAL-01/PAYLOAD-UNITY-01/TEST-CONCURRENCY-01）。**刻意未動**：`architecture-spec.md`（理由同 v3.21/v3.22，P 系列尚未 cutover 落地）。

> **v3.22 / 2026-07-07 / MSSQL 全面遷移 P1b（全 37 Entity Baseline）架構設計**：延續 AD-E07-38（P1），P1a 型別探針完成並 commit（`b495cd8`）後對全 37 entity 進行完整型別轉換、900-byte 索引鍵掃描、B1 正式裁定。新增 **[`implementation-log/AD-E07-39-mssql-p1b-full-baseline.md`](implementation-log/AD-E07-39-mssql-p1b-full-baseline.md)**，固化：(1) 5 項新查證事實 F-1~F-5（`type:'timestamp'` 裸字面值 4 處＝危險的 rowversion 陷阱非單純不支援；舊 baseline 唯一 filtered index 已於 7/7 移除、schema 兩軌流程簡化；`prod-data-seed.ts`/`seed-datasource.ts` 確認為 `$n`+`LIMIT` 而非 `ON CONFLICT`；🆕 varchar+中文編碼風險採實驗先行；D1 entities 陣列漂移純陣列統一修法）；(2) 全 37 entity 型別轉換清單（47 處，含新增之 timestamp 4 處）；(3) 900-byte 索引鍵全面掃描結論＝**全庫僅 `token_blocklist.token` 一例超標（B1）**，其餘皆安全；(4) B1 正式裁定＝`token`→`token_hash`、新增 `hashColumnType`（mssql=`binary(32)`/pg=`bytea`/sqlite=`blob`）、三 driver 統一改 hash 不做 driver-conditional；(5) varchar 中文編碼 test-first 決策流程（相符維持現狀／不符則全面轉 nvarchar）；(6) `ALL_ENTITIES` 統一陣列解 D1；(7) schema 兩軌流程更新（filtered index 步驟省略）；(8) P1b1/P1b2/P1b3 三個實作切片與 DoD；新增 4 個不變式（I-MSSQL-PK-BYTELIMIT-01/HASH-DETERMINISM-01/VARCHAR-ENCODING-01/ENTITY-LIST-PARITY-01）。**同步修訂** `implementation-log/AD-E07-38-mssql-p1-driver-entity-schema.md`（v1.0→v1.1）：新增 §11 Errata，標注 3 項被新事實推翻/更新的原始假設（Errata-1 timestamp 類別遺漏且風險應為「高」；Errata-2 filtered index 遷移前提失效；Errata-3 varchar+中文編碼為 D-2 未涵蓋之新風險維度），交叉引用 AD-E07-39。**刻意未動**：`architecture-spec.md`（理由同 v3.21，P1 系列尚未實作落地）。

> **v3.21 / 2026-07-07 / MSSQL 全面遷移 P1（Driver / Entity / Schema 基礎層）架構設計**：非 F-numbered feature（資料庫平台遷移基礎建設，由使用者直接拍板三項硬約束驅動：完全消除 PostgreSQL／佇列自建 T-SQL／目標 SQL Server 2022 + `Chinese_Taiwan_Stroke_BIN` collation）。新增 **[`implementation-log/AD-E07-38-mssql-p1-driver-entity-schema.md`](implementation-log/AD-E07-38-mssql-p1-driver-entity-schema.md)**，固化 P1 七項設計決策：(1) 三個 TypeORM 設定點（`data-source.ts`/`app.module.ts`/`worker-app.module.ts`）dialect 三分支 + `column-types.ts` 三既有 helper（`dateColumnType`/`jsonColumnType`/`surrogatePkType`）擴充 mssql 分支 + 新增 `uuidColumnType`/`longTextColumnType`；(2) entity 型別逐項對照（uuid 18 處/bigint 2 處/text 17 處/bytea 0 處，helper 覆蓋 29+3+5 檔）；(3) BIN collation 約束（字串比較語意不回歸=正確決策；識別碼大小寫敏感→全小寫+守門測試 I-MSSQL-CASE-01）；(4) schema 兩軌建置流程（dev synchronize 產草稿→人工稽核→prod baseline；`fn_calc_tier_level` 視為死碼、P1 不建立）；(5) Pattern B `$n`→named param 核心 6 處 + `pg_advisory_xact_lock`→`sp_getapplock` 對應表（回傳碼↔`55P03`）；(6) P1a/P1b/P1c 三個實作切片與 DoD；(7) 判定不需要 spec-writer（行為不變、無新業務規則）。**刻意未動**：`architecture-spec.md`（本輪為多階段遷移之 Phase 1 設計、尚未實作落地，暫不改動「現行系統架構」主檔，待 P1 實作完成或遷移進度足夠成熟後再議是否併入；system-architect 判斷保留彈性）。另發現**第 5 個 PG-only 機制**（`assignment-run-report.service.ts` F064 匯出之 PostgreSQL native server-side cursor）已移入 Phase 3/4 待辦。

> **v3.20 / 2026-07-02 / F109 新增「客戶資料」來源篩選欄位（US-172）**：依已核可 US-172 **新建 F109**（M06 篩選欄位）。本輪變更檔案：
> - **新建 v1.0**：[F109-customer-source-filter-fields.md](features/F109-customer-source-filter-fields.md)（白名單引入 `data_source` 概念〔`ob_pool_data` / `customer_core`〕+ API 暴露 `dataSource` + M06 列表來源欄 + 名單定義來源分組；新增 8 個 `customer_core` 篩選欄位〔性別 code→label / 年齡衍生 AGE 基準＝`project_workym` 月首日 / 居住城市 `LEFT(cpost_city,3)` 縣市級 / 5 個 `_desc` value=label〕；F076 seed 7 categorical 欄位可選值〔3/55/8/5/4/9/22〕；月跑 Stage 1 **條件式** LEFT JOIN customer_core〔`custo_no=source_customer_no`〕+ **NULL=排除** 核心語意〔BR-2/BR-3〕+ 三處消費一致〔月跑 / Stage 0 試算 / 名單試算，BR-10〕。US-172 4 個 OQ〔年齡基準 / 城市 seed / 性別機制 / 空表限制〕已裁示落規格）
> - **新建圖表**：[diagrams/F109-customer-source-filter-flow.mmd](diagrams/F109-customer-source-filter-flow.mmd)（Stage 1 條件式 JOIN + NULL 排除決策 flowchart；mermaid 已驗證）
> - **支援文件更新（本 feature 負責）**：`data-model.md` v1.16→**v1.17**（`field_whitelist` 新增 `data_source` 欄位 + F109 seed 延伸段）；spec-index feature 表 + 圖表表登錄 F109
> - **error-handling.md**：無新錯誤碼（審查結論：`CONDITION_COLUMN_NOT_IN_WHITELIST` 涵蓋客戶欄位白名單驗證、`WHITELIST_OPTION_INACTIVE` 涵蓋可選值停用警告、年齡 min/max 前端驗證沿用既有；`customer_core` 空表為已知限制不建前置檢查〔OQ-172-04〕）
> - **刻意未動（邊界，交 system-architect / 其他 agent）**：`architecture-spec.md` / AD-E07-37（`data_source` schema 型別 / CHECK / migration ordering / 既有列 backfill / condition data_source 判定機制 / 條件式 JOIN 與衍生運算式〔AGE、LEFT3〕SQL 落點 / composer 簽名變更 / PG↔JS 等價 / customer_core 索引 = §12 OQ-F109-01~05）；code / test / prototype（tdd-implementation / test-designer / ui-ux 範疇；prototype 昨已 commit e4c441f）
> - **殘留使用者待裁 open question**：無（US-172 4 個 OQ 已由使用者全數拍板；F109 §12 OQ-F109-01~05 均屬架構師 HOW，附建議預設）
>
> **v3.19 / 2026-06-26 / F049 v2.0 Stage 0 試算頁業務化重設計（per-list 技術視角 → 部門維度每日分派可行性）**：依 5 個已核可 user story（US-166~US-170）**升版既有 F049**（非新建編號——Stage 0 試算為同一頁面之重設計，index 既有 F049↔Stage 0 映射）。本輪變更檔案：
> - **升 v2.0**：[F049-stage0-daily-estimate.md](features/F049-stage0-daily-estimate.md)（新增 **Part B §14~§23**，於 v1.x 千分位 ratio 引擎 / per-list dry-run / calendarSource **之上**加聚合 + 部門投影層，**不分叉底層**。新 AC 命名 AC-AGG/AC-DEPT/AC-GAP/AC-SCOPE/AC-FEAS/AC-TERM + BR-7~BR-16，全可追溯至 US-166~170 AC-ID（§22.3 對照表）。**(1)** §15 全名單彙總預設 + 單一名單鑽探（US-166，**supersedes US-071 AC-1/2/3/4-Default**，取消 v1.3 自動選第一筆）；**(2)** §16 部門投影 `dept_daily = Σ_L list_total×ration/100×dpm/1000`（per-list ration 取自 `ob_dept_pct`，與 F101 一致）+ **保住總量＋標示缺口**模型（`org_total` 不依賴比例必正確、`gap=org_total−Σ部門` 標示不補差、gap=0 不顯示）（US-167）；**(3)** §17 處長唯讀 dept scope 隔離，複用 `listLists` 既有 `getScopeDeptCode→EXISTS ob_dept_pct.obdeptid=scope` 模式，授權放寬 `DirectorGuard`→`DirectorOrSectionChiefGuard`、service 為安全邊界、scope=null→200 空結果（US-168）；**(4)** §18 人均每日件數 `round(部門件數÷在職人數)`、`active_headcount=COUNT(ob_emphire dept_code=D AND resign_date IS NULL)`、headcount=0→「—」、超門檻標紅（US-169）；**(5)** §19 術語清理移除黑名單（rest_flg/base/remainder/ratioPerMille/ob_assign_set/OBPOOLDATA/STAGE0_POOL_WARN_THRESHOLD/AD-E07-8/API 路徑…）+ 業務語言替代（US-170）。**estimate≡run I-RUN-EST-01** 列硬約束。**OQ-167-01 裁定**＝`Math.round` 於最終每格實數。**OQ-167-03（HIGH-RISK）已 spec-writer 對 dev DB 實證**：`ob_emphire.dept_code`（在職）↔`ob_dept_pct.obdeptid` 同代號空間同粒度（各 8 distinct、100% 重疊、無孤兒碼、每 obdeptid 在職人數>0、4 處長各對應 1 distinct dept_code）→§20；殘留 production 複核交架構師。）
> - **新建圖表**：[diagrams/F049-stage0-dept-projection-flow.mmd](diagrams/F049-stage0-dept-projection-flow.mmd)（Part B 部門每日分派量資料流 flowchart：名單→per-list COUNT→×ration→×千分位→部門/日矩陣→÷在職人數；含 mode/scope filter/缺口/人均門檻分支；mermaid 已驗證）
> - **同步既有 spec（本 feature 負責）**：[F002-user-login.md](features/F002-user-login.md) v2.0→**v2.0.1**（§4.6.2 Guard 對應表將「名單瀏覽 F048~F049 GET」拆分，F049 Stage 0 試算獨立成列＝`DirectorOrSectionChiefGuard`+service dept scope filter，US-168）
> - **7 個架構師 OQ（spec-writer 附建議預設，交 system-architect）**：OQ-F049-01（部門矩陣端點拓樸，建議新增獨立唯讀端點、`daily-estimate` 保持 total-agnostic）／OQ-F049-02（SQL 下推 vs in-memory + `list_total` 來源，建議取 F088 物化 `estimateCases` + in-memory 小矩陣合成）／OQ-F049-03（人均門檻儲存，建議 env `STAGE0_MAX_CASES_PER_PERSON_PER_DAY` 預設 null 不標紅）／OQ-F049-04（guard 接線，建議移除 method 級 `@RequireDirector()` 落回 class 級 + service 套 scope）／OQ-F049-05（**OQ-167-03 production 複核**，dev 已 100% 對齊、預期免 mapping 層）／OQ-F049-06（人均分母口徑全在職 vs 限電訪職，建議依 US-169 字面全在職）／OQ-F049-07（警告落點 response `warnings[]` vs 擴 audit enum，建議 `warnings[]` 不擴 enum）
> - **刻意未動（邊界，交 system-architect / 其他 agent）**：`architecture-spec.md` / AD-E07-8 / AD-E07-29 / `data-model.md`（system-architect 範疇；部門投影 SQL / ratio 共用機制 / 門檻儲存 / 端點拓樸 / guard 實作 = §23 OQ）；`error-handling.md`（無新錯誤碼，沿用 `STAGE0_ESTIMATE_TIMEOUT` / `ASSIGNMENT_LIST_NOT_FOUND`；scope=null 為 200 非錯誤）；code / test / `prototypes/30-stage0-estimate.html`（tdd-implementation / test-designer / UI-UX 範疇）；v1.x 千分位 ratio 演算法 / per-list dry-run / calendarSource 對應（原樣保留為 Part B 底座）
> - **本輪無殘留使用者待裁 open question**（OQ-167-01 spec-writer 已裁定 Math.round；OQ-167-03 已實證並轉為架構師 production 複核 OQ-F049-05；其餘 7 OQ 均屬架構師 HOW、附建議預設）
>
> **v3.18 / 2026-06-25 / F107 計分卡設定頁顯示衍生碼業務語意（decode UI — 落實可回溯性設計原則的 UI 層）**：依已核可 US-165 新建 1 個 feature spec，把已存在的 decode 對照（AD-E07-10-S `scorecard-derived-code-dictionary.md`）呈現在計分卡設定頁，補「config 有碼（如 PROJECT_TP `level1='A'`）、語意只活在引擎 code / markdown」之 UI 呈現缺口。本輪變更檔案：
> - **新建 v1.0**：[F107-scoring-derived-code-decode-ui.md](features/F107-scoring-derived-code-decode-ui.md)（**唯讀疊加說明、不改計分採計、無新錯誤碼、無新 DB 欄位 / migration、無新側欄/路由**；三項變更：**(1)** **後端同源供給**（OQ-decode-1）`getScoring()` 每個 dimension 新增唯讀 `decode`（`sourceField` + `derivationRule` + `codes[]`）；decode map 為**與引擎 `resolveColumnSource` 同源之後端共用對照常數**（非前端常數、非 config 表）；**(2)** 前端 Tab 3「分數設定」碼層**並陳 decode 業務語意**（原始碼保留利稽核：`A`→借新還舊／`AGENT/UCD/HFC`→代理商/中古車商/和潤自家／CUS_SEX `1/2/3`／三縣市），Tab 2「計分維度」欄層加「來源欄 + 衍生規則」摘要；**(3)** 涵蓋**全部衍生欄**（OQ-decode-2：PROJECT_TP/SALES_STS/CUS_SEX/三縣市/五欄個人法人分流 gating）。**核心 DoD＝OQ-decode-4 同步斷言**「UI/API decode ≡ 引擎衍生規則 + AD-E07-10-S 一致」（防 UI 說 A、引擎做 B 走鐘，BR-4）。與 F106「啟用維度」/ `matchType` 比對型說明**正交**、與 A1/F106 啟用功能不混。OQ-decode-1~4 已全數拍板（spec §13）；殘留 3 個架構師 OQ（decode 常數落點 / AD 同步契約定錨 / 回傳粒度，§10，均附建議預設）交 system-architect）
> - **新建圖表**：[diagrams/F107-decode-ui-flow.mmd](diagrams/F107-decode-ui-flow.mmd)（decode 同源供給 sequenceDiagram：Tab 切換 → GET /assignment/scoring（唯讀 Guard）→ getScoring 查 columns/scores → 逐維度由 SCORING_DECODE 常數取 decode（無對應→null 優雅降級）→ 旁註 BR-4 同步斷言（decode ≡ resolveColumnSource + AD-E07-10-S §2）→ 回傳每維度附 decode → Tab 3 碼層並陳業務語意（原始碼保留）/ Tab 2 欄層來源欄+規則摘要；全程唯讀；mermaid 已驗證）
> - **刻意未動（邊界）**：`architecture-spec.md` / AD-E07-10-S / AD-E07-10-L / `data-model.md`（system-architect 範疇；decode 常數落點 + AD decode 契約定錨列為 §10 OQ-F107-01~03 交 architect）；`error-handling.md`（無新錯誤碼，沿用既有 `GET /assignment/scoring` 之 CARD_TYPE_NOT_FOUND / SCORING_VERSION_NOT_FOUND）；code / test / 原型 HTML / migration / seed（tdd-implementation / test-designer / UI-UX 範疇）；計分引擎採計範圍（decode 純說明、不改 score/card_level/tier）
> - **本輪對使用者無殘留 open question**（OQ-decode-1~4 已由使用者全數拍板並寫入 spec §13 Resolved Decisions；殘留 §10 OQ-F107-01~03 屬 architect 範疇）
>
> **v3.17 / 2026-06-25 / F106 顯示停用計分維度並支援重新啟用（M02 Tab 2 — 對稱補完 F054 disable）**：依已核可 US-164 新建 1 個 feature spec，打通「停用計分維度」之可見性與自助修復管線，修復「H 卡 SALES_STS 被誤標 inactive→UI 完全隱形→月跑長期少一維、靠 m302 手動修回」之盲區。本輪變更檔案：
> - **新建 v1.0**：[F106-show-inactive-dimension-and-enable.md](features/F106-show-inactive-dimension-and-enable.md)（**無新錯誤碼、無新 DB 欄位 / migration**；三項變更：**(1)** `getScoring()` 維度查詢移除 `status='active'` 過濾 → 一律回傳 active+inactive 全部維度 + 每維度補 `status` 欄位（OQ-164-2，前端移除 `?? 'active'` fallback）；**(2)** **新增 enable 端點** `PUT /assignment/scoring/dimensions/:columnName/enable`，**完全對稱** disable（同 `DirectorGuard`+`@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')`+`assertNotLocked()`(409 SCORING_VERSION_LOCKED)+`assertCardTypeActive()`(404)+audit；唯一差異＝`findOne(status='inactive')`、寫 `status='active'`、`action='ENABLE'`、回 `enabledAt`；對已 active 維度啟用→404 SCORING_COLUMN_NOT_FOUND，OQ-164-3 對稱 disable 慣例、不採冪等）；**(3)** 前端 Tab 2 顯示 inactive 列（chip 樣式已就緒、補列級弱化）+ inactive 列「啟用」按鈕（對稱「停用」）+ 月跑鎖一併鎖 + badge / 「共 N 個維度」只計 active（OQ-164-4）+ 不加顯示切換 toggle（OQ-164-5）。**EQ 核心驗收＝enable⇄disable 對稱性**（§5.3 對照表）；沿用既有 `/assignment/scoring` 路由、無新側欄項。**OQ-164-1 decode UI 明確 out-of-scope、另立 Story**）
> - **新建圖表**：[diagrams/F106-enable-dimension-flow.mmd](diagrams/F106-enable-dimension-flow.mmd)（啟用流程 sequenceDiagram：前端 inactive 列點啟用→PUT enable→Guard 鏈→service assertNotLocked(409)→assertCardTypeActive(404)→findOne(status=inactive，含重複啟用 404)→status=active save→writeAudit(ENABLE)→回 {status:active, enabledAt}→前端 refetch；對稱 disable；mermaid 已驗證）
> - **刻意未動（邊界）**：`architecture-spec.md` / AD 文件（system-architect 範疇；F106 對應 AD 由其撰寫）；`data-model.md`（`ob_levelcard_column.status` / `assignment_audit_log.action` 既有，無新 entity 欄位）；`error-handling.md`（無新錯誤碼，僅將既有 SCORING_COLUMN_NOT_FOUND / SCORING_VERSION_LOCKED 之「相關功能」欄補列 F106）；code / test / 原型 HTML / migration / seed（tdd-implementation / test-designer / UI-UX / DevOps 範疇）；計分引擎採計範圍（inactive 仍不參與計分，不改）
> - **本輪無殘留 open question**（OQ-164-1~5 已由使用者全數拍板並寫入 spec §11 Resolved Decisions）
>
> **v3.16 / 2026-06-25 / F105 PROJECT_TP composite 復原 + 計分衍生碼 Decode Dictionary + F067 tier 結案**：(1) **F105** 復原 PROJECT_TP COMPOSITE 真語意（推翻 F104 OQ-F104-03「只做關鍵字 category」簡化，使用者重新拍板）→ [architecture-spec.md](architecture-spec.md) AD-E07-10-L **v5.0** + 新增 **AD-E07-35**（引擎 `ColumnSource.kind:'composite'` 契約：`codeExpr=spec_tp` + `keywordExpr=借新還舊?'A':''`，每 row `code BETWEEN level2 字串 AND keyword=COALESCE(level1,'')`，兩路徑 EQ）；(2) **新建** [scorecard-derived-code-dictionary.md](scorecard-derived-code-dictionary.md)（**AD-E07-10-S**，業務簽核用 decode 層：每衍生碼 → 來源欄 + 規則 + 業務語意，補「config 有碼、語意在 engine code」可回溯缺口，如 `level1='A'`=借新還舊／`UCD`=中古車商；設計原則見 memory `feedback_scorecard_derived_code_traceability`）；(3) [F067 差異報告](implementation-log/F067-202606-cdmp-vs-legacy-diff.md) §6 **tier 維度 RESOLVED**（run `64555220` 三名單逐格對齊 legacy：001 T1=67.9 vs 69／002 59.1 vs 62.2／003 85.2 vs 83.8；靠 F104 引擎 + m302 SALES_STS + F105 composite 三段達成；config 本就對齊、真因＝raw score 偏低）。四維度（部門/員編/CR/tier）全可簽核。

> **v3.15 / 2026-06-24 / F104 Stage 2 計分引擎 AD-E07-10-L 全欄對齊 legacy SP（AD 本身有 12+ 欄偏差，F103 對齊了有錯的 AD）**：深度稽核 legacy `SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`（UTF-16LE 解碼）發現 AD-E07-10-L 本身與 legacy 真語意多欄偏差。依 5 個已核可 user story（US-159 AD 全欄修正 / US-160 CUS_SEX 分流引擎 / US-161 cc 新欄 contract / US-162 縣市欄 / US-163 202606 驗收）新建 1 個 feature spec，兩引擎路徑改對齊 **legacy SP**（非 AD 現況表）。本輪變更檔案：
> - **新建 v1.0**：[F104-stage2-ad-e07-10-l-full-legacy-alignment.md](features/F104-stage2-ad-e07-10-l-full-legacy-alignment.md)（**純後端、無新前端頁、無新錯誤碼**。七類修正：PROJECT_TP `'%專案%'`→`'%借新還舊%'`／SALES_STS `'經銷商'`→`'中古車商'`／CUS_SEX category→range（**BR-13 NULL-safe cast**）／五欄 CUS_SEX 分流（個人自身屬性 vs 法人 0/default 保證人停用複刻）+ AGE >100 排除 + EDUCAT_BACK 補零 per-card default(E/S '02'、S5 '08')／三縣市欄改讀 `cc.*_city` + **`LEFT(...,3)` 比對** + per-card default／LIST_MONTH·LOAN_RATE per-card default／signature 加 cardType。引擎權威＝§5 legacy 真語意表（附 SP 行號出處）。JS↔SQL EQ = DoD）
> - **新建圖表**：[diagrams/F104-cus-sex-branching-flow.mmd](diagrams/F104-cus-sex-branching-flow.mmd)（取值流程：CUS_SEX range／五欄 isCorporate 分流／縣市 LEFT3+per-card default／PROJECT_TP·SALES_STS 關鍵字／LIST_MONTH·LOAN_RATE per-card → score 比對 → EQ DoD；mermaid 已驗證）
> - **spec-writer 查證結論（直接採用）**：(1) **縣市比對粒度**＝score row level1 全縣市-only 3 字（dev 25 distinct、max_len=3），cc.*_city 為「縣市+區」6 字→引擎須 `LEFT(value,3)`（legacy 自身亦 `LEFT(POSTAL_ADD,3)`）；(2) **OQ-159-01 已解**＝`SP_GET_CUSTATTRIB_OB` 為客戶特質 OBOUT 資格查詢、**與 SALES_STS 無關**，SALES_STS CASE 在 OBLEVELCARD SP 就地完成、key 確為 `'中古車商'`→現行 `'經銷商'` **須修**；(3) **per-card 啟用矩陣**＝H/S 不計分縣市欄→stories 之 H/S 縣市 default 假設有誤、已依 legacy 修正為 S5/E5/M/HM；(4) **cus_sex 髒值**（'C'/'D'/空）→裸 `::int` 拋例外整支月跑掛→NULL-safe cast 硬性要求。
> - **4 個架構師 OQ（spec-writer 附建議，交 system-architect）**：OQ-1（`resolveColumnSource`/`resolveColumnValue` signature 加 cardType）／OQ-2（per-card default 完整 card 清單 + 未知 card fallback）／OQ-3（**依本 spec §5 改寫 AD-E07-10-L 映射表**，US-159 AC-9）／OQ-4（PROJECT_TP 複合條件是否完整複刻 + EDUCAT_BACK range vs category 比較型別 + 縣市 LEFT3 在 builder 落點）。
> - **刻意未動（邊界，交 system-architect / 其他 agent）**：`architecture-spec.md` / AD-E07-10-L（system-architect 依本 spec §5 改寫，本 feature 只讀作 input）／`resolveColumnSource` signature 變更（OQ-1）／code / test / migration（tdd-implementation / test-designer 範疇）／`data-model.md`（cc 新欄已由使用者 ETL m301 落地，無新 entity 設計需求）。
> - **⚠️ Production 影響**：修正後 score/card_level/tier 分佈改變（更多欄取到正確值、tier 上移），影響下游 [F101](features/F101-stage3-4-proportional-assignment.md) Stage 3/4 與 [F064](features/F064-export-assignment-result.md) 匯出；上線前須 dev 重跑 202606 驗收（tier 含 T1/T2）+ [F067](features/F067-compare-run-results.md) 差異報告 + 業務知會（NFR-005）。**JS↔SQL EQ（`stage2to4-sql-builder.spec.ts`）為硬性 DoD**；下游須跑 `tsc --noEmit -p tsconfig.build.json`（vitest 不做型別檢查）。
> - **前置依賴（已查證就緒）**：cc 新欄（cus_sex/carea_no1/carea_no2/cellular/hpost_city/cpost_city/co_city）已由使用者 ETL（m301）載入 dev DB；date_of_birth 沿用既有欄。
>
> **v3.14 / 2026-06-24 / F103 月跑計分引擎欄位來源修正（Stage 2 系統性低估 → card_level/tier 退化為單一值）**：根因＝引擎欄位來源映射不完整使 Stage 2 計分系統性低估（H 卡 score 範圍 81–152 vs 理論上界 255），無案件達 card C 門檻（185 分）→ 全 card D → tier 全退化 T3。依 3 個已核可 user story 新建 1 個 feature spec，將計分引擎兩條路徑（PG 下推 `buildStage2ScoreExpr`/`resolveColumnSource` + JS oracle `computeScore`/`resolveColumnValue`）**完全對齊 AD-E07-10-L**（`architecture-spec.md` line 4074–4091 權威映射表）。本輪變更檔案：
> - **新建 v1.0**：[F103-stage2-score-column-source-fix.md](features/F103-stage2-score-column-source-fix.md)（**純後端、無新前端頁、無新錯誤碼**。六項修正：**(1)** ADD_UN_CAPITAL 補 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no=o.appl_no` + `COALESCE(ar.add_un_capital,0)` range 計分（AD line 4085，原缺 case→`undefined`→靜默 +0，實為 H 卡最高 +36 分項）；**(2)** **通用 fallback（OQ-156-02 納入、不留債）** 取代 `default: return undefined` → AD line 4091 `COALESCE((to_jsonb(o)->>lower(column_name))::numeric,0)` BETWEEN level2_s/level2_e，使任何被計分卡引用之 pool 欄位都取得到值；**(3)** PROJECT_TP 衍生（AD line 4088 `spec_name LIKE '%專案%'→LEVEL1='A'`，稽核兩路徑皆漏→補齊）；**(4)** 移除 COMMISSION 死碼（不在 AD-E07-10-L、legacy `OBLEVELCARD_COLUNM_20260505.csv` 0 筆）；**(5)** JS oracle 補齊 customer_core 欄（CUS_SEX/AGE/CAREA_NO1/NO2/CELLULAR/EDUCAT_BACK/HPOST_NUM_NM/CPOST_NUM_NM/CO_NUM_NM/LOAN_RATE）+ ADD_UN_CAPITAL，達 JS↔SQL EQ 等價；**(6)** 逐欄稽核全 card_type（H/S/S5/E/E5/M）每個 active 欄依 AD 取到正確來源且實際計分 + dev 重跑 202606 驗收）
> - **OQ 裁定（已和使用者確認，寫進 spec）**：**OQ-156-02** 通用 fallback → 納入本輪；**OQ-158-02** 資料品質根因 → 納入本輪（仍異常則本輪內根因引擎 vs customer_core 空值率，不另開 story 推延）；**OQ-158-01** tier spread 驗收＝定性（card_level 不全 D、tier 含 T1/T2、方向對 legacy，案件集不同故不逐格量化）；**OQ-156-01** 幽靈欄位（AD 無映射且 pool 無此欄）＝通用 fallback 取不到值時靜默 +0 + log，不阻擋月跑（BR-F103-08）；**OQ-157-01** AGE → JS 與 PG 統一演算法（同式）確保 EQ（BR-F103-09）。
> - **3 個架構師 OQ（spec-writer 附建議，交 system-architect）**：OQ-1（SCHEMA GAP-157-01：`computeScore` 簽章加 customerCore 參數 vs 呼叫端 pre-fetch merge，**建議呼叫端 batch pre-fetch merge 至 pool wrapper**）／OQ-2（SCHEMA GAP-157-02：JS oracle 取 `ob_arreturndf_min_cap` 資料流，**建議與 OQ-1 同一 merge 流程**）／OQ-3（OQ-157-02：SQLite 測試 customer_core mock 策略，**建議 JS 改讀 pool wrapper 擴充欄位、測試免建表**）。如 §8 逐欄稽核發現 AD-E07-10-L 映射表本身與 legacy dump 有落差，另列架構師 OQ-4 交 architect 修 AD。
> - **⚠️ Production 影響**：修正後 ADD_UN_CAPITAL（最高 +36 分）+ 全 customer_core 欄正確計分→**改變 score/card_level/tier 分佈**（部分案件升 card C/B/A → T2/T1）。屬「修正系統低估 bug」非演算法變更，但影響下游 [F101](features/F101-stage3-4-proportional-assignment.md) Stage 3/4（依 tier_level 分組）與 [F064](features/F064-export-assignment-result.md) 匯出；上線前須 dev 重跑 202606 驗收 tier spread + [F067](features/F067-compare-run-results.md) 差異報告 + 業務知會（NFR-005）。**JS↔SQL EQ 等價（`stage2to4-sql-builder.spec.ts`）為硬性 DoD**。
> - **前置依賴**：ADD_UN_CAPITAL 維度需 `ob_arreturndf_min_cap` ETL 就緒（AD line 4093，月跑前置必要檢核）；customer_core / arreturndf ETL 已重做、對 pool ~100% 覆蓋、TEST_* 污染欄已清。
> - **刻意未動（邊界，交 system-architect / 其他 agent）**：`architecture-spec.md` / AD-E07-10-L（system-architect 範疇，本 feature 對齊它、不修改；如稽核發現 AD 落差列架構師 OQ-4）／`computeScore` 簽章與 JS arreturndf 資料流（3 架構師 OQ）／`data-model.md`（無新 entity 欄位）／code / test / migration（tdd-implementation / test-designer 範疇）。
>
> **v3.13 / 2026-06-17 / F064 v2.1 匯出 pool 源血緣 bug 修正（live 抓到掉 11.5% 列）**：[F064](features/F064-export-assignment-result.md) v2.0 之 pool 欄 join 源 `ob_pool_data_list`（per-list 去重表）**錯誤** → INNER JOIN 掉 11.5% 列。根因：月跑 Stage 1 `INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data o`（共享池，PK orgno+appl_no，無 list_no），`ob_pool_data_list` 僅於 Stage 1 被 LEFT JOIN 取 CR 三欄、非 result 列母體。本輪變更檔案：
> - **patch v2.0 → v2.1**：[F064-export-assignment-result.md](features/F064-export-assignment-result.md)（pool 欄 join 源由 `ob_pool_data_list` 改 **`ob_pool_data`（by orgno+appl_no，維持 INNER JOIN 不掉列）**；AC-2 欄位表 10 個 pool 欄來源 `ob_pool_data_list.*` → `ob_pool_data.*`（欄名不變）；進件日（欄 6）source 改 `ob_pool_data.appl_date`（`dateColumnType` timestamp，格式化只取日期 `YYYY/MM/DD`）；**新增 BR-F064-16 + 不變式 I-EXP-LINEAGE-01**：匯出列數 = 該 run 之 `ob_monthly_run_result` 列數（不掉列，DoD 門檻）；**新增 AC-2b** + GAP-2b + legacy 差異列 + 假設 A-3 改 Resolved。live 驗證：`ob_pool_data` 55,863/55,863 全對、matched 列值逐欄無回歸。architect 已同步修 AD（pool 源改 `ob_pool_data`）。其餘 v2.0 內容不變。）
>
> **v3.12 / 2026-06-17 / F064 v2.0 匯出分派結果對齊 legacy 23 欄**：依 [US-155](../stories/epics/E07-app-customer-list-assignment/US-155-M04-export-assignment-result-23col.md)（已核可，supersedes US-084）校正 [F064](features/F064-export-assignment-result.md) 匯出欄位與資料源。**破壞性修正**（與 v1.1 之 8~9 欄輸出不相容）。本輪變更檔案：
> - **升版 v2.0**：[F064-export-assignment-result.md](features/F064-export-assignment-result.md)（**三項 SCHEMA GAP 修正**：GAP-1 刪除誤列 `custo_no`/`cust_name`、案號改 `appl_no`、欄位數 9→23；GAP-2 資料源由 `assignment_run_snapshot.payload`（8 欄瘦投影）改 `ob_monthly_run_result`（by run_id）join `ob_pool_data_list`(list_no+orgno+appl_no) + `ob_emphire`(emplid→emp_id) + `ob_list_definition`(list_no)；GAP-3 進件日 source = `ob_pool_data_list.appl_date`。**移除** `card_level`/`score`。**23 欄 authority** = `reference/202606 分派名單.xlsx` 工作表 1（AC-2 欄位表含來源+join 鍵+格式）。**新增 BR**：日期格式轉換（指派日 `YYYYMMDD` / 進件日 `YYYY/MM/DD`）、`ob_emphire` join-miss fallback（空值 + 後端 WARNING log 含 emplid，不中斷匯出）、`overdue_day` 恆空保留欄。**xlsx + CSV 皆 streaming**（補回 v1.1 CSV in-memory 拼接問題）。**保留** v1.1 AC-3 422 阻擋 / AC-5 稽核 / AC-6 處長 scope filter。前置 = [F102](features/F102-cr-priority-assignment.md)（CR 三欄/emplid/assignday 已填值，commit on main））
> - **OQ 裁定（已和使用者確認，寫進 spec）**：`overdue_day` 恆空→保留欄輸出空值；`ob_emphire` join-miss→空值 + WARNING log；`ob_list_definition` join key = `list_no`；樞紐 sheet 先不做（另案）；5 分鐘 streaming timeout 維持。
> - **4 個架構師 OQ（spec-writer 附建議，交 system-architect）**：OQ-1（多表 join 下推 SQL 設計 + 索引）／OQ-2（CSV streaming 實作機制，建議單一 row-producer 餵 format-specific writer）／OQ-3（200k+ 筆背景 job，建議維持同步 streaming，逾時另開 story 走 pg-boss worker）／OQ-4（`data-model.md` 補述匯出 join 路徑，system-architect 範疇）。
> - **刻意未動（邊界，交 system-architect）**：AD-* / `architecture-spec.md`（join 下推 SQL / CSV streaming / 背景 job 機制）／`data-model.md`（匯出 join 路徑＝OQ-4）／code / test（TDD / test-designer 範疇）。
>
> **v3.11 / 2026-06-12 / F102 月跑 CR 優先分派（補 F101 simplified is_cr 缺口 + per-list `cr_enabled` 閘控 + 廢除全域旗標）**：接續 [F101](features/F101-stage3-4-proportional-assignment.md)（BR-F101-12 將 is_cr 簡化為被動標記、未實作 CR 優先分配），依 3 個已核可 user story 新建 1 個 feature spec，於 F101 Stage 3/4 比例分派**之前**插入 CR 優先分派前置處理。本輪變更檔案：
> - **新建 v1.0**：[F102-cr-priority-assignment.md](features/F102-cr-priority-assignment.md)（**純後端、無新前端頁、無新錯誤碼**；legacy ground truth = `st2_dept.sql` 第 116–190 行 CR LIVE 段，已 UTF-16LE 解碼，`st3_emplid` 之 CR 段為 `/* */` 死碼不引用。**閘控**：per-list `ob_list_definition.cr_enabled` 快照（`true` 跑步驟 1–3／`false` 強制 `is_cr='N'` 全案件入 F101 池、不扣量；不讀全域旗標）。**步驟 1** 逾2年清空（`appl_date < DATEADD(YEAR,-2,@SYS_DT)` 嚴格小於，`@SYS_DT=project_workym+'01'`）→ `cr_id/cr_nm=NULL, is_cr='N'`；**步驟 2** 離職清空（join `ob_emphire.resign_date < @SYS_DT` 嚴格小於；查無 emp_id INNER JOIN 不命中=不清空，BR-F102-08 spec-writer 裁定）；**步驟 3** CR 優先指派（join `ob_empl_set ration>0` 才指派 `emplid=cr_id`/`dept_id=deptid_m`/`is_cr='Y'`，per-list 查詢鍵）；**步驟 4** 扣量（F101 案件池 `WHERE is_cr<>'Y'`，基數扣 CR、不覆蓋 CR 案）。**全確定性**（align AD-E07-29 **I-DET-01**，無 NEWID()）；**廢除全域旗標** `ob_assign_config.cr_reassignment_enabled`（US-154，per-list `cr_enabled` 為唯一來源）；驗收=deploy 後重跑 202606、`is_cr='Y'`≈1.9%、`cr_id` 非空、`emplid=cr_id`（AC-13））
> - **新建圖表**：[diagrams/F102-cr-priority-flow.mmd](diagrams/F102-cr-priority-flow.mmd)（Stage 2 就緒 → F101 清除 → cr_enabled 閘控（true 步驟 1→2→3→4 扣量 ／ false 強制 N）→ F101 比例分派只跑 is_cr<>'Y' → 202606 驗證；旁註廢除全域旗標 + 死碼不引用）
> - **修正既有 spec（本 feature 負責，US-154 AC-4）**：[F059-toggle-cr-reassignment.md](features/F059-toggle-cr-reassignment.md)（§1 功能摘要 + §6 BR-1 之「全域開關」誤述加 `[DEPRECATED]` 標記、改述為 per-list `ob_list_definition.cr_enabled`；DEPRECATED header `supersededBy` 不變）
> - **已查證事實（直接用）**：`ob_monthly_run_result` 之 `cr_id`/`cr_nm` **全空**、`is_cr` 全 `'N'`；`ob_pool_data_list` `cr_id` 非空 344,092 / `is_cr='Y'` 118,116（≈1.5%）→ CR 三欄**目前未帶進 result 表**（欄位流向列架構師 OQ）；相關 entity 欄位皆已存在（無需建欄）：`ob_monthly_run_result`(cr_id/cr_nm/is_cr/emplid/dept_id/emplid_deptid) / `ob_pool_data_list`(cr_id/cr_nm/is_cr/appl_date) / `ob_list_definition.cr_enabled`(BOOLEAN **DEFAULT false**) / `ob_empl_set`(list_no/deptid_m/emplid/ration/prod_type) / `ob_emphire`(emp_id/resign_date)
> - **3 個 schema gap（spec-writer flag，交 system-architect）**：(G-1) CR 三欄欄位流向（result 表現況全空→Stage 1 SELECT 帶入 vs CR 步驟 join 回 pool）；(G-2) `cr_enabled` 預設值文字矛盾（`data-model.md` L967 / US-153 寫「預設 true」，**實際 entity/migration `DEFAULT false`**）；(G-3) `ob_assign_config` 退役評估
> - **5 個架構師 OQ（spec-writer 附建議預設，交 system-architect）**：OQ-1（CR 三欄流向 + F101 清除與步驟 3 寫入順序，建議 Stage 1 SELECT 帶入 + 清除→CR 步驟→比例分派）／OQ-2（`cr_id` 對多筆 `ob_empl_set` 取哪筆 deptid_m，建議 `deptid_m ASC`）／OQ-3（機車 `cr_enabled` migration 初始值，建議不需新 migration + 修正 data-model.md 文字為 DEFAULT false）／OQ-4（`ob_assign_config` 是否 DROP）／OQ-5（**`architecture-spec.md` S2 稽核點更新為 per-list cr_enabled**，US-154 AC-5，system-architect 範疇）
> - **spec-writer 裁定（不交架構師）**：US-152 OQ-3（CR 業代查無 `ob_emphire` 不清空＝沿用 legacy INNER JOIN）／US-153 OQ-6（建議快照記每名單 `cr_enabled`，呼應 F066）／US-154 OQ-8（prod 刪旗標 checklist：查 `cr_reassignment_enabled` 記錄、提供清理 SQL 不自動執行）
> - **刻意未動（邊界，交 system-architect）**：`architecture-spec.md`（US-154 AC-5 S2 稽核點＝OQ-5）／`data-model.md`（cr_enabled 預設值文字矛盾＝G-2/OQ-3、CR 欄位流向＝G-1/OQ-1；`ob_monthly_run_result` 既有欄位、無新欄位 / migration）／AD 文件（F102 對應 AD 由 system-architect 撰寫）／code / test / seed / migration（US-154 AC-1/2/3 之 seed/migration/entity `[DEPRECATED-F102]` 注解、CR 步驟實作＝tdd-implementation / test-designer 範疇）
> - **⚠️ Production 影響**：F102 啟用後 `cr_enabled=true` 名單之 CR 三欄 + emplid/dept_id 由「全空/全 N」→「≈1.9% CR 案件有值且預指派」，**改變各課/員工案件分佈**（CR 從配額扣除）；deploy 前須 [F067](features/F067-compare-run-results.md) 差異報告 + 業務知會（NFR-005）+ deploy 後 202606 重跑驗證（AC-13）
>
> **v3.10 / 2026-06-04 / F101 月跑 Stage 3/4 真實比例分派（Bug C：OB202606001 全員 `emplid=NULL`）**：接續 AD-E07-28 系列（F098/F099/F100），依 5 個已核可 user story 新建 1 個 feature spec，**取代 F100 之 placeholder Stage 4**（僅取 `ob_dept_pct` 第一列電銷課 + 單一 `defaultEmpl`，全案件指向同一員工 → 該課無員工時全員 `emplid=NULL`）。本輪變更檔案：
> - **新建 v1.0**：[F101-stage3-4-proportional-assignment.md](features/F101-stage3-4-proportional-assignment.md)（Stage 3 三維分組（分處 `dept_id`, `list_no`, `tier_level`）`FLOOR(件數×ob_dept_pct.ration/100)`+確定性差額補足 → 寫 `dept_id`；Stage 4 員工 `FLOOR(×ob_empl_set.ration/100)`+兩階段補足（均攤 `ADD_CNT` + 前 N 各 +1）→ 寫 `emplid`/`emplid_deptid`；ASSIGNDAY 複用 [F049](features/F049-stage0-daily-estimate.md) `calculateDailyEstimate(ym)` 千分比+最末 casedt 吸收餘額+跨 Tier `DIVIDE_LEFT` round-robin → 寫 `assignday`，estimate≡run **I-RUN-EST-01**；統一 **T1–T5 單一演算法**（migration `1711360000162` 收斂，無變體分流）；**simplified is_cr=被動標記**（無 legacy CR 優先 pre-assign / 無 CR 超額移除）；**全程確定性取代 `NEWID()`**（US-150；align Stage 1 OQ-06）；`ob_assign_set` vestigial 不引用（US-151）；dual-path gate=`DB_TYPE='postgres'`（PG SQL 下推延伸 stage2to4 builder/executor ／ SQLite=`executeV2` golden oracle）；**手算 oracle 等效性（AC-13/14）+ PG 真庫 JS↔SQL 逐列等價（AC-15）= DoD**；無新錯誤碼）
> - **新建圖表**：[diagrams/F101-stage3-4-proportional-flow.mmd](diagrams/F101-stage3-4-proportional-flow.mmd)（Stage 2 tier_level 就緒 → Stage 3 三維分組 FLOOR+確定性差額 → Stage 4 員工 FLOOR+兩階段補足 → ASSIGNDAY 千分比+DIVIDE_LEFT；DB_TYPE dual-path PG/JS gate + 三 fallback 分支 + 警告通道）
> - **SP ground truth（已 UTF-16LE 解碼）**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（Stage 3 dept→電銷課比例基底）、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`（Stage 4 員工 + ASSIGNDAY 基底，STEP 10–13）
> - **⚠️ Production 影響**：F101 改變各名單 `dept_id`/`emplid`/`emplid_deptid`/`assignday` 真實分佈（placeholder 單一 default → 比例分派）；**JS↔SQL PG 真庫逐列等價測試為 DoD，未通過不得 deploy**；deploy 前須 [F067](features/F067-compare-run-results.md) 差異報告 + 業務知會驗收（NFR-005）
> - **2 個 schema gap（spec-writer flag，交 system-architect）**：(G-1) `ob_pool_data` **無 `tier_level` 欄** → Stage 3 分組之 tier_level 須讀 `ob_monthly_run_result`（Stage 2 之後），分處=`ob_pool_data.dept_id`；(G-2) `assignment_audit_log.action` 為固定 union enum、**不含** story 自創的 `STAGE3_NO_DEPT_RATION`/`STAGE4_NO_EMPL_WARN`/`ASSIGNDAY_NO_CALENDAR_WARN` → 警告預設改走 `assignment_run.report_payload`/`warning_summary`（US-083/F063 摘要頁既有機制），不擴 enum（OQ-F101-05）
> - **5 個 Open Question（保留 OPEN，交 system-architect 裁示，spec-writer 不自決）**：OQ-F101-01（確定性排序鍵各粒度，align OQ-06）／OQ-F101-02（**F101 ration 分派 vs F100 st4_exchange 10% senior-swap 交互/取代**，關鍵）／OQ-F101-03（`ob_assign_set` 是否退役）／OQ-F101-04（單一 transaction vs per-list 冪等，複用 I-IDEM-01）／OQ-F101-05（警告落點 report_payload vs 擴 audit enum+migration）
> - **刻意未動（邊界）**：architecture-spec.md / AD 文件（system-architect 範疇）；data-model.md（無新 entity 欄位；`ob_monthly_run_result` 既有）；code / test / migration / docker（tdd-implementation / test-designer / DevOps 範疇）；F100 Stage 2 計分 / Stage 3 CR `EXISTS` / score→level→tier（F101 只換 dept / empl / ASSIGNDAY 分派）
>
> **v3.9 / 2026-06-02 / AD-E07-28 月跑執行模型重構（Worker 抽離 + Stage 1~4 SQL 下推）**：依 [architecture-spec.md §5.13 + AD-E07-28 v3.1](architecture-spec.md)（system-architect 維護，status: proposed）新建 3 個 feature spec，將月跑執行模型由「cdmp-api 同程序 `setImmediate` 背景跑」重構為「pg-boss 入列 → 獨立 cdmp-worker 容器消費 → Stage 1~4 set-based SQL `INSERT…SELECT`」，分 P1/P2/P3 三階段交付。本輪變更檔案：
> - **新建 v1.0**：[F098-monthly-run-worker-extraction.md](features/F098-monthly-run-worker-extraction.md)（**P1** — Worker 抽離：pg-boss 入列 + `cdmp-worker` 容器 + `triggerRun` 改入列立即回 202 + `CancellationPoller`（補齊 cancelRun「背景不會真停」缺陷）+ `OrphanReaper`（殭屍 running run 回收）；解 F1 event loop 阻塞；I-TRIGGER-01）、[F099-stage1-sql-pushdown.md](features/F099-stage1-sql-pushdown.md)（**P2** — Stage 1 SQL 下推：`buildStage1Sql` 單一 core，run（`INSERT…SELECT`）與 estimate（`SELECT COUNT(*)`）共用，**I-RUN-EST-01**；year-above 保留應用層 filter（選項 C，**I-PORT-01**）；**JS↔SQL 逐 list 等價測試為 P2 DoD**，廢除 RGv2-005 / SDv2-* JS-pin guard；解 F2 Stage 1）、[F100-stage2-4-sql-pushdown-scoring.md](features/F100-stage2-4-sql-pushdown-scoring.md)（**P3** — Stage 2~4 SQL 下推 + v2 真實計分引擎：`ob_levelcard_*` `SUM(CASE…)` + `customer_core` LEFT JOIN 補完、CR `EXISTS`、st4_exchange `ROW_NUMBER()+CEIL(×0.1)`；**OQ-06 排序鍵已解**；JS↔SQL 逐列等價測試為 P3 DoD；解 F2 全）
> - **新建圖表**：[diagrams/F098-worker-extraction-flow.mmd](diagrams/F098-worker-extraction-flow.mmd)（run 業務狀態機含取消 / orphan 轉移）、[diagrams/F099-stage1-sql-pushdown-flow.mmd](diagrams/F099-stage1-sql-pushdown-flow.mmd)（buildStage1Sql 單一 core 兩種外層包裝）、[diagrams/F100-stage2-4-pushdown-flow.mmd](diagrams/F100-stage2-4-pushdown-flow.mmd)（Stage 2~4 下推 + OQ-06 排序鍵 + DoD 門檻）
> - **OQ-06 結論（st4_exchange 排序鍵）**：已 UTF-16LE 解碼 `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（英文版主檔解碼成功；中文版 mojibake 不採信）。SP 選「哪 10% 被交換」之排序鍵 = **`ROW_NUMBER() OVER (PARTITION BY OB_DEPT, OB_EMPLID ORDER BY NEWID())`（隨機）**，與 JS 現況「無顯式 ORDER BY 取前 10%」業務等價（皆任取 10%、無業務優先序）。本輪 spec（F100 AC-5）採 **deterministic `ORDER BY orgno, appl_no`**（業務等價於隨機 + 可做 deterministic 等價測試）。**OQ-F100-01 ✅ RESOLVED（使用者 2026-06-02）= 對齊現行 JS 簡化版**：partition 維度與員工分配維持 JS 簡化版（`PARTITION BY list_no` + 單一 senior）；legacy SP 真實配對交換（`PARTITION BY OB_DEPT, OB_EMPLID` + 主管↔專員等量配對 + 整批失敗回滾 + 寄信告警）含 legacy 副作用、**明確 out-of-scope、不復刻**。
> - **權威來源**：[architecture-spec.md §5.13 v2.22](architecture-spec.md)（system-architect 維護）；[AD-E07-28](implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)（status: proposed）；`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（**已 UTF-16LE 解碼驗證**）
> - **AD OQ 採納狀態（使用者 2026-06-02 ratified）**：**OQ-AD28-01**（pg-boss schema 用 migration 包 DDL）/ **02**（orphan 靠 job expiration、不新增 schema 欄位）/ **03**（portability = **選項 A** 全 SQL + 等價測試走 PG 真庫，**四特例規則含 year-above 全下推、無應用層 filter**，**覆蓋 AD 原文選項 C 預設**）/ **04**（月跑 job retry=0）/ **05**（單 worker 序列化）/ **06**（st4_exchange 配對交換 fidelity = **OQ-F100-01 對齊現行 JS 簡化版**，SP 配對交換 out-of-scope）**全數已採納、非待裁**，於 F098/F099/F100 以既定約束形式落地。**AD-E07-28 之 6 個 OQ-AD28-* + OQ-F100-01 全部 RESOLVED，本輪 spec 無業務性待裁 open question**（僅餘 OQ-F098-01/02 / OQ-F099-01 為非業務性技術項，見各 feature §9/§11）。
> - **P2 測試設計揪出之 spec/schema 落差（已修正並 RESOLVED）**：**OQ-F099-03**（assignday 來源錯誤）= `ob_pool_data` 無 `assignday` 欄、現行 JS 從不寫此欄 → 下推 INSERT 移除 assignday、該欄保持 NULL（與現行 JS 等價、業務日後回填，F099 §4 / A-0 修正）；**OQ-F099-02**（year-above golden + SQL 寫法）= oracle = **現行 JS** `parseInt(year_produ ?? '1900') < cutoff`，SQL 須等價對齊三類 `parseInt` 語意（NULL→1900 刪 / 非數字→NaN 留 / 前導數字 `'1980abc'`→1980 刪），**禁用 `^[0-9]+$` strict**（對 `'1980abc'` 不等價），不硬 pin SQL、由 tdd 於 PG 真庫 EQ 測試滿足（F099 AC-8 修正）。
> - **三個不變式（驗收門檻）**：**I-RUN-EST-01**（run / estimate SQL core 同源，F049 老坑不可再 fork，F099 AC-1）、**I-PORT-01**（CAST 行為差異規則須 PG integration test，F099 AC-8）、**I-IDEM-01**（重觸發前清 result / snapshot，F099 AC-9）；新增 I-TRIGGER-01（API 不執行 pipeline，F098）/ I-NOLOAD-01（不全載 heap，F099 AC-3）
> - **建議實作順序**：P1（F098）→ P2（F099）→ P3（F100），嚴格序列；P1 worker 抽離單獨即解最嚴重之 F1，且為 SQL 下推提供「不影響 API」之安全執行容器（先 worker 後下推）
> - **刻意未動（邊界）**：architecture-spec.md / AD-E07-28（system-architect 範疇，§5.13 + AD 已由其寫入；OQ-AD28-01~05 採納為使用者決議，AD 文件文字若仍標 proposed / 選項 C 預設由 system-architect 後續同步，非 spec-writer 範疇）；data-model.md（pg-boss schema 非 TypeORM entity、`ob_monthly_run_result` 既有，無新 entity 欄位）；code / test / migration / docker（tdd-implementation / test-designer / DevOps 範疇）；legacy SP st4_exchange 主管↔專員配對交換 / 寄信告警 / 整批回滾（OQ-F100-01 裁定 out-of-scope、不復刻，如未來需精準復刻 SP 須另立 spec）
> - **⚠️ Production 影響**：P2/P3 為「改機制、結果須可證等價」+ P3 含「計分引擎簡化版→真實版升級」；**JS↔SQL PG 真庫等價測試為 P2/P3 硬性 DoD，未通過不得 deploy**；P3 計分升級造成的差異須業務知會 + F067 差異驗收（NFR-005）
>
> **v3.8.1 / 2026-05-28 / US-144 最低條件數語意修正（系統固定欄位不計入「≥1 條件」門檻）**：依用戶決議，名單「至少 1 個篩選條件」門檻改為**僅計算非系統固定（`is_system_fixed = false`）之 conditions**——`best_case`（系統固定、自動注入）不計入；使用者須自行提供至少 1 個非系統固定 condition（更貼近舊系統名單必有 prod_kind / list_type 等）。本輪變更檔案（細化 v3.8 之最低條件數驗證；沿用既有 `VALIDATION_ERROR` 422，**不**新增錯誤碼）：
> - **升 v2.3.1**：[F050-create-list-definition.md](features/F050-create-list-definition.md)（AC-10 重寫 + BR-6 補述 + §5.4 規則表「conditions 至少 1 個」列細化：最低條件數檢查於 `validateConditionPayload`、`injectSystemFixedConditions`（BR-14）**之前**執行，計數對象為使用者送入之 payload，排除所有 `is_system_fixed = true` 欄位；非系統固定條件數為 0 時回 422 `VALIDATION_ERROR`，訊息精修為「至少設定一個非系統固定（使用者自訂）篩選欄位」）
> - **升 v2.2.1**：[F051-edit-list-definition.md](features/F051-edit-list-definition.md)（AC-6 + BR-6 鏡像同規則；僅在提供 `conditionPayload` 時套用，舊名單 `condition_payload IS NULL` 唯讀不受影響）
> - **不動**：F075 v1.7 / error-handling.md v1.17（最低條件數沿用 `VALIDATION_ERROR`，無新錯誤碼）
> - **對應 User Story**：US-144（最低條件數語意修正）
>
> **v3.8 / 2026-05-28 / US-144 best_case 鎖定為系統固定篩選條件（Design A）**：將 `best_case`（優質案件）鎖定為系統固定篩選條件，使用者不可移除 / 修改其值（對齊舊系統硬編碼 `'Y'`）。本輪變更檔案：
> - **升 v2.3**：[F050-create-list-definition.md](features/F050-create-list-definition.md)（新增 BR-14 `injectSystemFixedConditions` 注入契約 + AC-17：`createList` 於驗證後強制注入 / 正規化 `best_case → ['Y']`，竄改靜默修正回 201；`best_case` 非 backward-compat 衍生欄位；驅動旗標 `is_system_fixed`，不 hardcode 字串）
> - **升 v2.2**：[F051-edit-list-definition.md](features/F051-edit-list-definition.md)（新增 BR-14 + AC-14：`updateList` 對「有提供 conditionPayload」之名單同套 `injectSystemFixedConditions`，竄改靜默修正回 200；尊重 4-state — 舊名單 `condition_payload IS NULL` 維持唯讀，不注入）
> - **升 v1.7**：[F075-manage-pooldata-field-whitelist.md](features/F075-manage-pooldata-field-whitelist.md)（新增 `is_system_fixed BOOLEAN NOT NULL DEFAULT false` 欄位，`best_case = true`；BR-15 系統固定欄位不可停用 → 422 `SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE`；BR-16 從名單「新增條件」可選池排除；AC-18/19/20；GET API 回應暴露 `isSystemFixed`）
> - **錯誤碼（error-handling.md v1.17）**：`#assignment-errors` 新增 `SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE`（422）
> - **對應 User Story**：US-144（M01 best_case 系統固定條件 Design A）
> - **刻意未動（system-architect 範疇）**：AD-E07-18（或衍生決策）需補 `is_system_fixed` 欄位 migration + 既有列 backfill `false` + `best_case` 設 `true`、draft-only 之 `best_case: ['Y']` 回填 migration（idempotent）、上述與既有 v2.1/v2.1.1 migration 之 ordering；backend DTO / Guard 實作（tdd-implementation 範疇）；prototype（27b 鎖定列 + 27/dropdown 排除 + 37a M06 停用按鈕 disabled，UI/UX-designer 範疇）；data-model.md `pooldata_field_whitelist` 補 `is_system_fixed` 欄位（system-architect 範疇）
>
> **v3.7 / 2026-05-27 / F097 客戶名單分派「作業月」語意統一（US-137~US-143）**：新建 1 個 feature + 升版 F077。依 [glossary.md](glossary.md)（命名單一權威）+ [proposals/work-ym-semantics-unification.md](proposals/work-ym-semantics-unification.md)（已拍板）落地：
> - **新建 v1.0**：[F097-work-ym-semantics-unification.md](features/F097-work-ym-semantics-unification.md)（分離 `current_work_ym` / `target_work_ym`；前端 `AssignmentWorkYmContext` 四頁共享預設下月；`POST /runs` 必填 `workYm` + 過去月 guard `>=`；`SystemService` 收斂 + `getDefaultTargetWorkYm()`；下游結果頁讀 `run.project_workym`；Stage 1 去重靠正確 `workdt` 自動對齊；forward-only 不回填）
> - **升 v1.4**：[F077](features/F077-month-switch-and-stage-overview.md)（US-143 限定範圍：月份預設改 `target_work_ym`（下月）+ 四頁共享 `AssignmentWorkYmContext` + UI 標籤「分派作業月份」+ 順修 BR-7 C-4 殘留舊文字；**未動** §5.2 ym error code 既有技術債）
> - **錯誤碼（error-handling.md v1.16）**：方案 A（OQ-F097-01）— 缺省 → 400（缺必填）；帶值格式錯 / 月份非 01~12 → 422 沿用 `WORK_YM_INVALID_FORMAT`；過去月 → 422 **新增 `RUN_WORKYM_PAST`**。**未新增** `INVALID_YM_FORMAT`。
> - **breaking change**：`POST /api/v1/assignment/runs` body 新增必填 `workYm`（方案 A，無 `new Date()` fallback）。歷史 run `project_workym` 採 **forward-only 不回填**。
> - **權威來源**：[glossary.md](glossary.md)（F097 命名）；`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` L24-34（過去月 guard ground truth，UTF-16LE 解碼驗證）
> - **刻意未動**：architecture-spec.md / data-model.md（system-architect 範疇；`project_workym` 不改名、無新欄位、無 migration）；code / test（tdd-implementation 範疇）；F091 `computeDedupWindow` 邏輯（不改，靠正確 `workdt` 自動對齊）；F077 §5.2 ym error code 既有技術債（OQ-F097-01 方案 A 不清，僅加 note 指向未來 cleanup 選項 C）
>
> **v3.6 / 2026-05-27 / ob_pool_data_list 單源化（AD-E07-25）+ 特例規則 SP 落差修正（AD-E07-26）— architecture-spec v2.18**：依 system-architect AD-E07-25 + AD-E07-26（全 DP Resolved）新建 3 個 feature + 升版 3 個既有 feature。本輪變更檔案：
> - **新建 v1.0**：[F094-monthly-run-result-table.md](features/F094-monthly-run-result-table.md)（單源化 Phase A — 月跑結果表 `ob_monthly_run_result` + pipeline 落點切換，migration `1711360000292`）、[F095-applied-special-rules-readonly.md](features/F095-applied-special-rules-readonly.md)（特例規則前端唯讀 `appliedSpecialRules[]` 讀時推導，無新 DB 欄位）、[F096-pooldata-whitelist-list-type-cleanup.md](features/F096-pooldata-whitelist-list-type-cleanup.md)（白名單 `list_type` 停用，migration/seed `1711360000293`）
> - **升 v2.0**：[F091](features/F091-stage1-complete-month-cnt-dedup-special-delete.md)（**high-severity bug fix**：特例 DELETE trigger 由 mojibake 誤判「中結強案/中結/年資+滿」修正為 SP 正確版「**期中機車/期中/年以上+小資/白牌**」；去重上界 `MIN(MAX(assignday), workdt−1日)`；year_produ 補 `parseInt`；月跑寫入目標改 `ob_monthly_run_result`）、[F090](features/F090-obpooldata-list-etl.md)（單源化：`data_source` 值域 `'etl_load'`、月跑不再寫本表）
> - **升 v1.1**（note-only 同步）：[F092](features/F092-stage1-dry-run-estimate.md)（dry-run 同步 F091 v2.0 修正後 trigger / 去重上界 + 月跑落點 `ob_monthly_run_result`；唯讀行為不變）
> - **權威來源**：[architecture-spec.md AD-E07-25 / AD-E07-26 v2.18](architecture-spec.md)（system-architect 維護，全 DP Resolved）；[data-model.md v1.15](data-model.md)（`ob_monthly_run_result` 新表 + `ob_pool_data_list.data_source` 值域 `'etl_load'` 已由 system-architect 同步）；`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（**已 UTF-16LE 解碼驗證** SP 真實 trigger）
> - **⚠️ Production 影響（Phase A 群組）**：F091 v2.0（特例修正）+ F094（落點切換）+ F095（前端唯讀）**同批 deploy、無 feature flag、deploy 後直接生效**（DP-AD23-2 / DP-AD26-1）。F091 v2.0 之 trigger bug fix 將顯著改變各類名單案件數（含「中結/強案/年資」名單案件數增加、含「期中機車/期中小資/年以上」名單案件數減少），**須 deploy 前業務知會 + 各類名單案件數差異驗收**。F090（ETL）/ F092（dry-run）/ F096（白名單清理）不改月跑案件數。
> - **刻意未動**：architecture-spec.md / data-model.md（system-architect 範疇，本輪 AD-E07-25/26 + `ob_monthly_run_result` 已由其寫入）；code / test（tdd-implementation 範疇）；F095 之名單詳情頁唯讀區塊**無對應 prototype**（`27-list-definition.html` / `27b-list-edit-draft.html` 待 UI/UX 補，見 F095 §7）；既有名單 `condition_payload` 中 `list_type` 條件之 backfill 清理（F096 OQ-WL-01，本輪不處理）
>
> **v3.5.1 / 2026-05-26 / F092 落地後 estimate 語意漂移同步（F049 → v1.4、F088 → v1.3.1）+ F090 歷史限定欄位修正**：F092 已落地（estimate 改為完整 `Stage1FilterChain` dry-run，≡ 月跑），本輪同步既有 spec 之 estimate 語意文字漂移（只動 docs，不碰 code/test）：
> - **F049 升 v1.4**：[F049-stage0-daily-estimate.md](features/F049-stage0-daily-estimate.md) BR-6 由「估算為條件符合上界」改為「**完整 Stage 1 預估（≡ 月跑分派案件數）**」（已含 month_cnt + 去重 + 特殊 DELETE）；AC-4 / §5.2 對齊（複用 `executeStage1Chain({dryRun:true})`）；保留 BR-1（最終以月跑為準）；交叉引用 F091 / F092 / AD-E07-23。
> - **F088 升 v1.3.1**：[F088-ready-stage-summary.md](features/F088-ready-stage-summary.md) BR-10 + §5 欄位表 `estimateCases` 補註物化 COUNT 來源自 F092 起升級為完整鏈 dry-run（物化機制不變）。
> - **F049-test 升 v1.4**：[F049-test.md](../test-specs/features/F049-test.md) TS-F049-EST-010 預期值 `≈ 241,978`（欄位篩選版）過時 → 改為「dry-run COUNT === 月跑（不 assert 固定值）；完整鏈後 ≤ 241,978」，標 Integration DEFERRED（需真實 PG + ob_pool_data_list seed）。
> - **F090 升 v1.0.1**：[F090-obpooldata-list-etl.md](features/F090-obpooldata-list-etl.md) 歷史限定過濾由 `WHERE PROJECT_WORKYM < 本月` 修正為 **`WHERE ASSIGNDAY < 本月第一天 (yyyyMMdd)`**（實作發現源表 `OBPOOLDATA_LIST` 無 `PROJECT_WORKYM`，該欄屬 `OBMLISTDF`，唯一時間欄為 `ASSIGNDAY`；已與 AD-E07-21 同步裁示）。
>
> **v3.5 / 2026-05-26 / Stage 1 精確化工程三階段交付（AD-E07-21~24）**：依 system-architect AD-E07-21~24 v1.1（全部 DP Resolved），新建 3 個 feature spec 落地 Stage 1 精確化三階段。本輪變更檔案：
> - **新建 v1.0**：[F090-obpooldata-list-etl.md](features/F090-obpooldata-list-etl.md)（Phase 1 — OBPOOLDATA_LIST 雙層 ETL + `data_source` 欄 migration `1711360000291`，歷史限定見 v1.0.1 修正為 `ASSIGNDAY < 本月第一天`）、[F091-stage1-complete-month-cnt-dedup-special-delete.md](features/F091-stage1-complete-month-cnt-dedup-special-delete.md)（Phase 2 — Stage 1 補完整：MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE，忠實複刻 SP，封裝 `Stage1FilterChain`）、[F092-stage1-dry-run-estimate.md](features/F092-stage1-dry-run-estimate.md)（Phase 3 — 完整鏈 dry-run 精確估算，per-list estimate / F088 物化升級）
> - **對應 User Story**：US-133（Phase 1 ETL）、US-134（Phase 2 Stage 1 補完整）、US-135（Phase 3 dry-run）
> - **權威來源**：[architecture-spec.md AD-E07-21~24 v1.1](architecture-spec.md)（system-architect 維護，全部 6 個 DP Resolved）；[data-model.md v1.15](data-model.md)（`ob_pool_data_list.data_source` 欄已由 system-architect 同步）
> - **⚠️ Production 影響**：F091（Phase 2）為唯一改變 production 月跑分派案件數之階段，**無 feature flag、deploy 後直接生效**（DP-AD23-2），須 deploy 前業務知會。F090 / F092 不影響月跑案件數。
> - **對既有 spec 影響（v3.5.1 已落地同步）**：F092 升級 estimate 語意（「條件符合上界」→「完整 Stage 1 預估」），影響 [F049 BR-6](features/F049-stage0-daily-estimate.md)（升 v1.4）與 [F088 estimateCases / BR-10](features/F088-ready-stage-summary.md)（升 v1.3.1）及 [F049-test](../test-specs/features/F049-test.md)（升 v1.4）— 已於 v3.5.1 同步更新。
> - **刻意未動**：architecture-spec.md / data-model.md（system-architect 範疇）；code / test（tdd-implementation 範疇）；無新建 prototype（Phase 3 沿用 `30-stage0-estimate.html` + `29d-ready-summary.html`）
>
> **v3.4 / 2026-05-20 / F050 v2.1 名單定義 whitelist-driven 重構**：依 GAP-LIST §A1~A6 解除 spec 內部矛盾。本輪變更檔案：
> - **升 v2.1**：[F050-create-list-definition.md](features/F050-create-list-definition.md)、[F051-edit-list-definition.md](features/F051-edit-list-definition.md)（condition_payload 為 source of truth；新增 4 個 error code 引用：`CONDITION_COLUMN_NOT_IN_WHITELIST` / `RESERVED_FIELD_IN_CONDITIONS` / `LEGACY_LIST_CONDITION_READONLY` / `LEGACY_LIST_NOT_COPYABLE`）
> - **升 v1.5**：[F075-manage-pooldata-field-whitelist.md](features/F075-manage-pooldata-field-whitelist.md)（seed 補 case_status，6 筆）、[F076-manage-categorical-field-values.md](features/F076-manage-categorical-field-values.md)（seed 補 case_status 4 筆 + caseyear 確認 8 筆 + spec_tp 升真實 dump **52 筆**，OBMCODEDF TBL_ID='12'）
> - **整份 DEPRECATED v1.3**：[F068-edit-base-code.md](features/F068-edit-base-code.md)（保留歷史內容 + banner；F075 v1.5 + F076 v1.5 + US-124 + US-125 承接）
> - **支援文件更新**：data-model.md v1.13、error-handling.md v1.15、[diagrams/F050-draft-create-flow.mmd](diagrams/F050-draft-create-flow.mmd)（whitelist 節點 rename + 補 RESERVED 節點）
> - **對應 User Story**：US-121（whitelist-condition-payload）、US-122（Stage 1 dynamic filter）、US-123（backward-compat list read）、US-124（deprecate F068 + merge field-base）、US-125（migrate options to whitelist）；既有修改：US-070 / US-102 / US-103 / US-106；DEPRECATED：US-092
> - **拍板**：Q1 `LIST_FILTER_FIELD_NOT_IN_WHITELIST` DEPRECATED + 並存；Q3 + Q4 兩個 LEGACY error code 都加；Q5 prod_kind 唯一性比對語意延至 Phase 3a；Q7 mermaid diagram 一併更新；Q2 / Q6 採預設處置；Q8 F048 不本輪處理（下一輪追補）

> **專案**：CDMP（Customer Data Management Platform）v1.0 MVP
> **文件總數**：132 份（7 支援文件含 spec-index 本檔 + 86 Feature 文件含新建 F006a + 39 圖表文件）
> **最後更新**：2026-05-16（**v3.0 / E07 合併重構 AD-E07 v3.0 — 破壞性大改**）

> **v3.0 / 2026-05-16 破壞性變更摘要**：依 system-architect AD-E07 v3.0 合併重構決議，廢除 v1.x 「`users.is_sales_manager` BOOLEAN + `users.e07_role` VARCHAR」正交雙欄位設計，整合為**單一欄位** `users.business_role VARCHAR(20) NULL`（enum：`'director'` / `'section_chief'` / `NULL`，DB CHECK constraint 強制）。系統實質身份共 **4 種 label**：「系統管理者」/「業務部長」/「業務處長」/「一般使用者」（廢除 v1.x「業務主管」中間語意層）。`SalesManagerGuard` 全數廢除，改用 `DirectorGuard` / `SectionChiefGuard` / `DirectorOrSectionChiefGuard` 三 Guard 體系。新增錯誤碼 `E07_ROLE_NOT_ASSIGNED`（403）取代未指派時的模糊 `AUTH_FORBIDDEN`。
>
> **本輪受影響檔案清單**：
> - **新建**：[F006a-update-business-role.md](features/F006a-update-business-role.md) v1.0（PATCH `/business-role` 唯一寫入入口）
> - **重寫 v2.0**：[F073-define-director-role.md](features/F073-define-director-role.md)、[F074-define-section-chief-role.md](features/F074-define-section-chief-role.md)
> - **DEPRECATED**：[F008-assign-change-role.md](features/F008-assign-change-role.md) v3.0-DEPRECATED（PATCH `/sales-manager-flag` 與 v1.4 短期過渡 PATCH `/e07-role` 端點均廢除）
> - **補修 banner**：F002 v2.0 / F005 v3.2 / F006 v2.3（核心欄位變更聲明 + 變更指向 F006a；§4.5 / §4.6 之完整重寫請以 F006a + F073 v2.0 + F074 v2.0 三 spec 為主要權威來源）
> - **支援文件**：data-model.md（User 實體 + m14 migration 規範）、error-handling.md v1.14（新增 `E07_ROLE_NOT_ASSIGNED` / `ACCOUNT_BUSINESS_ROLE_INVALID`；標 DEPRECATED：`ACCOUNT_E07_ROLE_INVALID` / `ACCOUNT_E07_ROLE_FORBIDDEN` / `E07_FORBIDDEN_DIRECTOR_ONLY`）、architecture-spec.md v2.11（§3.10 補 `AccountsService.updateBusinessRole()` + Guard 三元件清單）
> - **F050~F072 批次**：23 個 spec 中之 ASCII 識別字（`SalesManagerGuard` → `DirectorOrSectionChiefGuard` / `is_sales_manager` → `business_role` / `e07_role` → `business_role`）需於下一輪批次補修；本輪因 PowerShell 編碼事故（見下方 Known Issues）已 git checkout 還原；改採「依 demand 逐 spec 補修」策略，下游 TDD developer / QA 應以 [F002 v2.0 §4.6](features/F002-user-login.md#e07-角色矩陣) + [F006a](features/F006a-update-business-role.md) + [F073 v2.0](features/F073-define-director-role.md) + [F074 v2.0](features/F074-define-section-chief-role.md) 四檔為**唯一權威來源**，凡這四檔與其他 E07 spec 衝突時以這四檔為準
>
> **⚠️ Known Issues（本輪事故記錄）**：spec-writer agent 於 2026-05-16 嘗試以 PowerShell 5.1 批次替換 23 個 spec 之識別字時，因 `Get-Content -Raw` 預設 cp950 解碼導致 15 個 untracked 新檔（F075~F089）之中文段落損壞（識別字、結構、code 區塊、英文 ASCII 內容**仍正確**，僅中文文字段落變為亂碼或 `?` 替代字元）。F083 受兩次 PowerShell 操作疊加破壞，亂碼最重。**這 15 個 spec 之 ASCII 識別字、API 端點、欄位名、Guard 名、錯誤碼名等技術內容仍可信賴**；中文敘述、AC 描述、BR 文字部分需用戶提供原始備份或重新生成。已 commit 至 HEAD 之 31 個 spec（F048 / F049 / F050~F072 / F002 / F005 / F006 / F008 等）已透過 `git checkout -- ...` 完整還原至 HEAD 版（v1.x），未受編碼事故影響；其中 F002 / F005 / F006 / F008 已重新加上 v3.0 補修 banner（核心變更聲明）。
>
> **下一輪建議（給 spec-writer）**：(1) 用戶確認 F075~F089 救援策略（從本機備份恢復 / 從 `.claude/projects/.../*.jsonl` 對話記錄抓回 / 重新生成）；(2) F048~F072 之 23 個 spec 之識別字批次補修，**禁用 PowerShell**，改用 Edit 工具或 Git Bash sed（具備 LANG=zh_TW.UTF-8 環境）；(3) 補 F002 §4.5 / §4.6 完整重寫（目前僅 banner，矩陣詳細表格須以 [F002 v2.0 ${EDITOR_RESCUE}] 之既有編輯為基礎重作 — 由於 git checkout 還原，這些細節已遺失，需重做）。
>
> **本輪更新**：2026-05-17（**v3.3 / E07 重構 v2.0 補完項目 + FeatureFlagGuard 全 module 套用 + m24 seed**：依 TDD developer 收尾完成 v2.0 所有留項：(1) **FeatureFlagGuard 套用範圍補齊**：原僅 assignment-list / assignment-stage / pooldata-field 寫入端點套用，本輪補入 assignment-scoring（F053~F056）、card-type（F069~F072）、assignment-code（F068）、assignment-run trigger（F061）、pooldata-field-whitelist（F075）、pooldata-field-option（F076）六個 controller 的寫入端點；新增 `feature-flag-coverage.regression.spec.ts` 對 10 個 E07 寫入 controller 做靜態 grep regression（41 tests PASS），確保未來新增 controller 不會遺漏；test/setup.ts 預設 `ENABLE_E07_REFACTOR_PHASE3=true` 兜底；ENABLE_E07_REFACTOR_PHASE3 保留切換能力以利出事 rollback。 (2) **m24 seed**：新增 `1711360000240-SeedBestCaseSpecTpOptions` migration，補 F076 v1.3 AC-3 / m22 留項之 BEST_CASE（Y/N）與 SPEC_TP（01/02/03 placeholder）可選值；標 `[ASSUMPTION] 待真實 OBMCODEDF dump 確認`，後續 m25+ 可依 OBMCODEDF OBMTYPE='BEST_CASE' / 'SPEC_TP' 之 OBMVALUE 對齊；m24 不重 INSERT whitelist（m22 owns）、down 限定 BEST_CASE / SPEC_TP IN clause 不傷其他 6 欄；7 tests PASS。 (3) **既有 PASS 不破壞**：assignment module 全 709/709 unit tests PASS（含本輪新增 41 + 7 = 48 個新 tests）。詳見 [F-Vfinal-v2.0-feature-flag-and-m24-seed-impl.md](implementation-log/F-Vfinal-v2.0-feature-flag-and-m24-seed-impl.md)。v2.0 至此完成；後端 P0~P2 + v2.0 全部 done，下一步為前端 FE。）

> **上一輪更新**：2026-05-17（**v3.2 / E07 重構 P1 B6 處長轄區補修**：依 F002 §4.6.2 + AD-E07 v3.0，補入 F063 / F064 / F066 / F067 四份 spec 之處長視角 `scopeByCreator()` filter AC 與 BR；service 層 helper pattern 與 P0 `PersonnelRatioValidationService` / F057 v1.1 / F082 BR-3 一致；F063 升 v1.1（AC-5 + BR-6/7）、F064 升 v1.1（AC-6 + AC-5 audit 補欄位 + BR-6/7）、F066 升 v1.1（AC-6 分型過濾 + BR-5/6）、F067 升 v1.1（AC-7 + BR-7/8 + §7 效能備註）。等用戶確認後 TDD 可進入 P2 補 `scopeByCreator` 實作。）
>
> **上上輪更新**：2026-05-16（**TDD P0 完成後 schema/spec 修補（AD-E07-17 三議題決議）**：architecture-spec 升至 v2.12（新增 AD-E07-17 三議題決議）；data-model 升至 v1.12（`assignment_audit_log.action` VARCHAR(10)→VARCHAR(30) + stage 系列 action；`ob_empl_set.created_at/updated_at` 補 dateColumnType helper 強制說明；`ob_list_definition.stage` 補 migration 歸屬明示為 m100 / m12 backfill 仍有效））
>
> **上上上輪更新**：2026-05-16（**E07 重構衍生 spec 補修第二輪（system-architect Phase 1 / 6 項風險決議落地）**：F082 升至 v1.3（決議 #1 全員離職邊界選項 D + 決議 #2 503 + `FEATURE_NOT_ENABLED` + 決議 #4 `SectionChiefScopeGuard` method 分支 + 決議 #5 fixture factory 策略 + 決議 #6 `AssignmentRunGuardService.assertNoRunningRun()` 集中實作）；F079 / F081 升至 v1.1、F080 升至 v1.1、F083 升至 v1.2、F084 升至 v1.2、F085 升至 v1.2、F086 升至 v1.1、F087 升至 v1.1、F089 升至 v1.1（統一補入 BR-`AssignmentRunGuardService` cross-ref + Feature Flag fallback 503，相關 [ASSUMPTION] 升 ✅ Resolved）；F050 v2.0 §13.2 升 v2.0.1（Feature Flag Gating [ASSUMPTION] → [RESOLVED]，明確 flag = false 回 503 + `FEATURE_NOT_ENABLED`）；error-handling 升至 v1.12（新增 #feature-flag-errors 段落 + `FEATURE_NOT_ENABLED` 503 + `PERSONNEL_RATIO_OUT_OF_SCOPE` 補「僅適用 PUT/POST」備註 + `ASSIGNMENT_RUN_ALREADY_RUNNING` 補「`AssignmentRunGuardService` 集中拋出」備註）；data-model 補修（`ob_list_definition.stage` m12 migration 範圍說明 + `ob_emphire` 補 CI fixture 策略指引）；architecture-spec §3.10 補登 `AssignmentRunGuardService` / `StageTransitionService` / `PersonnelRatioValidationService` / `RatioValidationService` / `FeatureFlagGuard` / `SectionChiefScopeGuard` 6 個共用元件說明）

---

## 快速統計

| 類別 | 數量 |
|------|------|
| 核心支援文件 | 7 |
| Feature 文件（E01） | 3 |
| Feature 文件（E02） | 8 |
| Feature 文件（E03） | 6 |
| Feature 文件（E04） | 10 |
| Feature 文件（E05） | 17 |
| Feature 文件（E04/E05 跨模組） | 1 |
| Feature 文件（E06） | 2 |
| Feature 文件（E07） | 52 |
| Mermaid 圖表 | 47 |
| **總計** | **153** |

---

## 核心支援文件

| 文件 | 說明 | 主要使用者 |
|------|------|-----------|
| [overview.md](overview.md) | 系統總覽、產品願景、目標使用者 | 所有 Agent |
| [scope.md](scope.md) | MVP 範圍定義、Feature 對照表、階段規劃 | 所有 Agent |
| [nfr.md](nfr.md) | 非功能需求（安全性、效能、E07 月跑執行效能/快照原子性/結果準確性） | Architect, TDD, QA |
| [data-model.md](data-model.md) | 資料模型、實體定義、欄位約束（含 E07 `ob_*` 表與 `assignment_*` 表） | Architect, TDD |
| [error-handling.md](error-handling.md) | 錯誤處理慣例、錯誤碼目錄（含 ASSIGNMENT 領域錯誤） | TDD, QA, UI |
| [open-questions.md](open-questions.md) | 待決事項、假設清單 | Architect, Product |
| [spec-index.md](spec-index.md) | 本文件 — SPEC 索引與導覽 | 所有 Agent |

---

## Feature 文件

### E01 — 驗證與登入

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F001 | [F001-admin-login.md](features/F001-admin-login.md) | Admin 登入 | US-001 | P0-MVP |
| F002 | [F002-user-login.md](features/F002-user-login.md) | User 登入 | US-002 | P0-MVP |
| F003 | [F003-logout.md](features/F003-logout.md) | 登出 | US-003 | P0-MVP |

### E02 — 帳號與角色管理

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F004 | [F004-create-account.md](features/F004-create-account.md) | 建立帳號 | US-010 | P0-MVP |
| F005 | [F005-view-account-list.md](features/F005-view-account-list.md) | 查看帳號清單（**v3.2 / 2026-05-16 補 banner — `business_role` 欄位**）| US-011 | P0-MVP |
| F006 | [F006-edit-account.md](features/F006-edit-account.md) | 編輯帳號（**v2.3 / 2026-05-16 — 不含 `business_role` 寫入；變更入口走 F006a**）| US-012 | P0-MVP |
| **F006a** | [**F006a-update-business-role.md**](features/F006a-update-business-role.md) | **變更帳號業務角色（business_role）— PATCH `/api/v1/accounts/:id/business-role` 唯一寫入入口** | **US-014（接續，取代 F008 v3.x 之 sales-manager-flag / e07-role 端點）** | **P0-MVP（v1.0 新建 / 2026-05-16）** |
| F007 | [F007-disable-enable-account.md](features/F007-disable-enable-account.md) | 停用／啟用帳號 | US-013 | P1 |
| ~~F008~~ | ~~[F008-assign-change-role.md](features/F008-assign-change-role.md)~~ | ~~指派／變更角色（Admin / User）＋ 業務主管旗標切換~~ | ~~US-014~~ | **DEPRECATED v3.0-DEPRECATED / 2026-05-16**（PATCH `/sales-manager-flag` 與 v1.4 短期過渡 PATCH `/e07-role` 端點均廢除；業務角色變更改走 F006a；系統角色變更如需重啟動請另起 spec） |
| F009 | [F009-self-service-password-reset.md](features/F009-self-service-password-reset.md) | 自助式密碼重設 | US-015 | P0-MVP |
| F010 | [F010-admin-reset-password.md](features/F010-admin-reset-password.md) | Admin 重設使用者密碼 | US-016 | P0-MVP |
| F045 | [F045-business-role-definitions.md](features/F045-business-role-definitions.md) | 系統角色定義（系統預設角色 admin / user） | US-017 | P0-MVP |

### E03 — 資料來源管理

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F011 | [F011-add-datasource.md](features/F011-add-datasource.md) | 新增資料來源 | US-020 | P0-MVP |
| F012 | [F012-list-datasources.md](features/F012-list-datasources.md) | 查看資料來源清單 | US-021 | P0-MVP |
| F013 | [F013-edit-datasource.md](features/F013-edit-datasource.md) | 編輯資料來源 | US-022 | P0-MVP |
| F014 | [F014-delete-datasource.md](features/F014-delete-datasource.md) | 刪除資料來源 | US-023 | P1 |
| F015 | [F015-test-datasource-connection.md](features/F015-test-datasource-connection.md) | 測試資料來源連線 | US-024 | P0-MVP |
| F016 | [F016-datasource-status-dashboard.md](features/F016-datasource-status-dashboard.md) | 資料來源狀態監控儀表板 | US-025 | P1 |

### E04 — 資料擷取管理

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F017 | [F017-create-extraction-task.md](features/F017-create-extraction-task.md) | 建立擷取任務（含來源 Schema / 資料表動態選擇） | US-030 | P0-MVP |
| F018 | [F018-view-extraction-task-list.md](features/F018-view-extraction-task-list.md) | 查看擷取任務清單 | US-031 | P0-MVP |
| F019 | [F019-edit-extraction-task.md](features/F019-edit-extraction-task.md) | 編輯擷取任務（含來源 Schema / 資料表動態選擇） | US-032 | P0-MVP |
| F020 | [F020-toggle-extraction-task.md](features/F020-toggle-extraction-task.md) | 啟用／停用擷取任務 | US-033 | P0-MVP |
| F021 | [F021-run-extraction-task.md](features/F021-run-extraction-task.md) | 立即執行／重新執行擷取任務（含動態建表與批次寫入） | US-034 | P0-MVP |
| F022 | [F022-view-extraction-logs.md](features/F022-view-extraction-logs.md) | 查看擷取日誌 | US-035 | P0-MVP |
| F023 | [F023-scheduled-extraction.md](features/F023-scheduled-extraction.md) | 排程自動執行 | US-036 | P0-MVP |
| F024 | [F024-extraction-dashboard.md](features/F024-extraction-dashboard.md) | 擷取監控儀表板 | US-037 | P1 |
| F025 | [F025-delete-extraction-task.md](features/F025-delete-extraction-task.md) | 刪除擷取任務 | US-038 | P1 |
| F026 | [F026-preview-raw-data.md](features/F026-preview-raw-data.md) | 查看擷取資料預覽 | US-039 | P0-MVP |

### E05 — ETL Pipeline 管理

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F027 | [F027-pipeline-list.md](features/F027-pipeline-list.md) | 查看 Pipeline 列表 | US-040 | P0-MVP |
| F028 | [F028-create-pipeline.md](features/F028-create-pipeline.md) | 建立 Pipeline | US-041 | P0-MVP |
| F029 | [F029-pipeline-editor.md](features/F029-pipeline-editor.md) | 視覺化轉換編輯器（13 種 Transform 節點，Lookup 雙輸入模式） | US-042, US-058 | P0-MVP |
| F030 | [F030-execute-pipeline.md](features/F030-execute-pipeline.md) | 執行 Pipeline（手動/測試/排程） | US-043 | P0-MVP |
| F031 | [F031-toggle-pipeline.md](features/F031-toggle-pipeline.md) | 啟用／停用 Pipeline | US-044 | P0-MVP |
| F032 | [F032-pipeline-logs.md](features/F032-pipeline-logs.md) | 查看 Pipeline 日誌 | US-045 | P0-MVP |
| F033 | [F033-pipeline-version.md](features/F033-pipeline-version.md) | Pipeline 版本管理（Diff/回滾/發布） | US-046 | P1 |
| F034 | [F034-delete-pipeline.md](features/F034-delete-pipeline.md) | 刪除 Pipeline | US-047 | P1 |
| F035 | [F035-pipeline-dashboard.md](features/F035-pipeline-dashboard.md) | Pipeline 監控儀表板 | US-048 | P1 |
| F036 | [F036-target-tables.md](features/F036-target-tables.md) | 目標表 Domain-Oriented 規劃（customer_core 85 欄位） | US-049 | P0-MVP |
| F037 | [F037-publish-pipeline-version.md](features/F037-publish-pipeline-version.md) | 發布 Pipeline 版本 | US-050 | P0-MVP |
| F039 | [F039-node-field-badge.md](features/F039-node-field-badge.md) | 節點欄位變化統計 Badge | US-042 (擴充) | P0-MVP |
| F040 | [F040-field-inspector-diff.md](features/F040-field-inspector-diff.md) | Inspector Panel 欄位 Diff | US-042 (擴充) | P1 |
| F041 | [F041-badge-hover-tooltip.md](features/F041-badge-hover-tooltip.md) | Badge Hover Tooltip | US-042 (擴充) | P2 |
| F042 | [F042-etl-execution-engine.md](features/F042-etl-execution-engine.md) | ETL 執行引擎核心框架（DAG 排序、Node Dispatcher、nodeOutputMap） | US-055 | P0-MVP |
| F043 | [F043-etl-node-executors.md](features/F043-etl-node-executors.md) | ETL 節點執行器（8 種節點處理邏輯與 TypeScript interfaces，含 Lookup 雙輸入模式） | US-056, US-057, US-058 | P0-MVP |
| F044 | [F044-etl-target-load.md](features/F044-etl-target-load.md) | Target Load + UPSERT（批次寫入、ETL 追蹤欄位） | US-057 | P0-MVP |

### E04/E05 — 跨模組系統維運

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F038 | [F038-orphan-task-recovery.md](features/F038-orphan-task-recovery.md) | 孤兒任務回收（系統啟動時自動修復 running 狀態） | US-051 | P0-MVP |

### E06 — Customer 360

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F046 | [F046-customer-search-list.md](features/F046-customer-search-list.md) | Customer 360 — 客戶搜尋與清單 | US-060 | P0-MVP |
| F047 | [F047-customer-360-detail.md](features/F047-customer-360-detail.md) | Customer 360 — 單一客戶詳情 | US-061 | P0-MVP |

### E07 — 客戶名單分派

#### M01 名單定義

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F048 | [F048-view-list-definition.md](features/F048-view-list-definition.md) | M01 名單定義入口（月份 + 階段總覽，v2.0 升版合併 US-104/105 入口骨架） | US-070, US-104, US-105 | P0-MVP |
| F049 | [F049-stage0-daily-estimate.md](features/F049-stage0-daily-estimate.md) | **Stage 0 試算頁業務化重設計（v2.0 / 2026-06-26 / US-166~170：per-list 技術視角 → 部門維度每日分派可行性。Part B §14~§23：全名單彙總預設 + 單一名單鑽探（US-166，supersedes US-071 AC-1/2/3/4-Default）／部門投影 `Σ list_total×ration×千分位` + 保住總量＋標示缺口（US-167）／處長唯讀 dept scope 隔離 複用 `getScopeDeptCode→ob_dept_pct.obdeptid`（US-168）／人均每日件數 ÷ 在職人數 + 門檻標紅（US-169）／術語清理移除黑名單（US-170）。estimate≡run I-RUN-EST-01 硬約束（部門投影只在 `computeWorkingDayRatios` 之上加法、不分叉）。OQ-167-03 已對 dev DB 實證：`ob_emphire.dept_code`↔`ob_dept_pct.obdeptid` 同代號空間同粒度（8=8 distinct、100% 重疊）。含單一 LIST_NO 案件試算）** | US-071, US-166, US-167, US-168, US-169, US-170 | P0-MVP（**v2.0**）|
| F050 | [F050-create-list-definition.md](features/F050-create-list-definition.md) | **草稿階段建立名單定義（v2.3.1 / 2026-05-28 / US-144：最低條件數修正 — 「≥1 條件」門檻僅計非系統固定 condition，best_case 不計入，計數於 inject 前看使用者 payload，AC-10 / BR-6 / §5.4 重寫，沿用 `VALIDATION_ERROR` 422；v2.3 best_case 系統固定條件 — BR-14 `injectSystemFixedConditions` 注入契約 + AC-17，`createList` 驗證後強制注入 / 正規化 `best_case → ['Y']`，竄改靜默修正回 201；v2.1 whitelist-driven 重構：`condition_payload` 為 source of truth + columnName 白名單驗證 `CONDITION_COLUMN_NOT_IN_WHITELIST` + list_period_* reserved `RESERVED_FIELD_IN_CONDITIONS` + 舊名單複製防呆 `LEGACY_LIST_NOT_COPYABLE` + 5 個 entity column 降為 backward-compat 衍生欄位；解除 GAP-LIST §A1~A6）** | US-106, US-107, US-120, US-121, US-125, US-144 | P0-MVP（**v2.3.1**）|
| F051 | [F051-edit-list-definition.md](features/F051-edit-list-definition.md) | **草稿階段編輯名單定義（v2.2.1 / 2026-05-28 / US-144：最低條件數修正 — 鏡像 F050 v2.3.1，「≥1 條件」僅計非系統固定 condition，僅在提供 conditionPayload 時套用，AC-6 / BR-6 補述；v2.2 對齊 F050 v2.3 — BR-14 + AC-14，`updateList` 對「有提供 conditionPayload」之名單同套 `injectSystemFixedConditions`，竄改靜默修正回 200，舊名單 `condition_payload IS NULL` 維持唯讀不注入；v2.1 condition_payload 覆寫式 + 舊名單條件區塊唯讀 `LEGACY_LIST_CONDITION_READONLY`；限 `stage = 'draft'`）** | US-106, US-107, US-121, US-123, US-144 | P0-MVP（**v2.2.1**）|
| F052 | [F052-disable-list-definition.md](features/F052-disable-list-definition.md) | **草稿階段停用名單定義（軟刪除，限 `stage = 'draft'`，v2.0 重寫）** | US-090, US-106 | P0-MVP（**v2.0**）|
| F077 | [F077-month-switch-and-stage-overview.md](features/F077-month-switch-and-stage-overview.md) | 月份切換與名單五階段總覽（M01 入口互動補強，合併 US-104 + US-105；**v1.4 / 2026-05-27**：F097 月份預設改 `target_work_ym`（下月）、UI 標籤「分派作業月份」、順修 BR-7 C-4 殘留舊文字） | US-104, US-105, US-143 | P0-MVP（**v1.4**）|
| F078 | [F078-draft-advance-to-dept-ratio.md](features/F078-draft-advance-to-dept-ratio.md) | **草稿階段推進至部門比例設定（五階段流程引擎之第一個推進操作）** | US-108 | P0-MVP（**新增 v1.0**）|

#### M02 計分設定（5 Tab 結構，2026-05-14 擴充）

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 | 版本 |
|------------|------|------|-----------|--------|------|
| F069 | [F069-view-card-type-list.md](features/F069-view-card-type-list.md) | 查看 CARD_TYPE 計分卡類型清單（M02 Tab 1） | US-093 | P0-MVP | v1.0 |
| F070 | [F070-create-card-type.md](features/F070-create-card-type.md) | 新增 CARD_TYPE 計分卡類型 | US-094 | P0-MVP | v1.0 |
| F071 | [F071-edit-card-type.md](features/F071-edit-card-type.md) | 編輯 CARD_TYPE 計分卡類型 | US-095 | P0-MVP | v1.0 |
| F072 | [F072-disable-card-type.md](features/F072-disable-card-type.md) | 停用 CARD_TYPE 計分卡類型（級聯刪除） | US-096 | P0-MVP | v1.0 |
| F053 | [F053-view-scoring-dimensions.md](features/F053-view-scoring-dimensions.md) | 查看計分維度設定（M02 Tab 2） | US-072 | P0-MVP | v1.2 |
| F054 | [F054-edit-scoring-dimension.md](features/F054-edit-scoring-dimension.md) | 編輯計分維度與分數（M02 Tab 2 寫入） | US-073 | P0-MVP | v1.2 |
| F055 | [F055-edit-card-level-thresholds.md](features/F055-edit-card-level-thresholds.md) | 編輯 CARD_LEVEL 分級門檻（M02 Tab 4） | US-074、US-097 | P0-MVP | v1.6 |
| F056 | [F056-edit-tier-mapping.md](features/F056-edit-tier-mapping.md) | 編輯 TIER_LEVEL 對應表（M02 Tab 5） | US-075 | P0-MVP | v1.5 |
| F106 | [F106-show-inactive-dimension-and-enable.md](features/F106-show-inactive-dimension-and-enable.md) | 顯示停用計分維度並支援重新啟用（M02 Tab 2；對稱補完 F054 disable，getScoring 回 inactive+status + enable 端點 + 前端啟用入口；無新錯誤碼） | US-164 | P0-MVP | v1.0 |
| F107 | [F107-scoring-derived-code-decode-ui.md](features/F107-scoring-derived-code-decode-ui.md) | 計分卡設定頁顯示衍生碼業務語意（decode UI；getScoring 每維度附唯讀 decode（來源欄+衍生規則+碼意義），Tab 3 碼層並陳語意/Tab 2 欄層摘要；decode 為與引擎同源共用常數+同步斷言；唯讀、不改採計、無新錯誤碼） | US-165 | P1 | v1.0 |

> M02 5 Tab 結構：Tab 1 = F069 CARD_TYPE 清單（含 F070/F071/F072 操作入口）、Tab 2 = F053 唯讀 + F054 寫入（+ F106 顯示 inactive 維度與啟用 + F107 欄層 decode 摘要）、Tab 3 = F054 分數設定子視圖（+ F107 碼層 decode 並陳）、Tab 4 = F055 CARD_LEVEL 門檻、Tab 5 = F056 TIER 對應；Tab 1 selectedCardType 驅動 Tab 2~5 篩選。
>
> **F054 ⇄ F106 對稱關係**：F054 提供「停用維度」（disable，`status active→inactive`），F106 對稱補完「顯示停用維度 + 重新啟用」（enable，`status inactive→active`）；兩端點除狀態方向 / 動詞 / 時間戳欄名外，guard / feature flag / 月跑鎖 / audit / 404 語意完全一致（見 F106 §5.3 對稱性對照表）。
>
> **F107 decode UI（與 F106 正交）**：F107 在同頁疊加「衍生碼 → 來源欄 + 衍生規則 + 業務語意」唯讀說明（落實 AD-E07-10-S 可回溯性原則的 UI 層）；decode 由 `getScoring()` 同源供給（與引擎 `resolveColumnSource` 共用常數，同步斷言 BR-4 為核心 DoD）。decode 與 F106 之 `status` chip、`matchType` 比對型說明三者並存不互相取代；本功能純呈現、不改計分採計。

#### M03 分派比例（重構後拆分，2026-05-15）

> **[通知 spec-writer]**：M03 分派比例模組已依五階段流程拆分為 M03a/M03b/M03c/M03d，需新增對應 Feature spec。F058（US-079）與 F060（US-091）標記 DEPRECATED。

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 | 狀態 |
|------------|------|------|-----------|--------|------|
| F057 | [F057-view-personnel-ratio.md](features/F057-view-personnel-ratio.md) | **查看人員比例設定（流程外快速查詢入口，v1.1 修訂；明確與 F088 分工 + 角色限縮為部長 / 處長 / Admin + 處長轄區過濾）** | US-078 | P0-MVP | **v1.1** |
| ~~F058~~ | ~~[F058-edit-personnel-ratio.md](features/F058-edit-personnel-ratio.md)~~ | ~~編輯人員比例設定~~ | ~~US-079~~ | P0-MVP | **DEPRECATED v2.0（2026-05-15 / E07 重構批次 5，由 F082 / F083 / F084 / F085 取代；限 `stage = 'personnel_ratio'` + 處長轄區 Guard + per-DEPT 加總驗證 + 獎懲模板獨立 spec）** |
| ~~F059~~ | ~~[F059-toggle-cr-reassignment.md](features/F059-toggle-cr-reassignment.md)~~ | ~~開關 CR 回分規則（全域開關）~~ | ~~US-080~~ + US-120 | P0-MVP | **DEPRECATED v2.0（2026-05-15 / E07 重構批次 3，由 F050 v2.0 per-LIST_NO `cr_enabled` 取代；US-120 spec 落差修正）** |
| ~~F060~~ | ~~[F060-edit-per-list-dept-ratio.md](features/F060-edit-per-list-dept-ratio.md)~~ | ~~設定 per-LIST_NO 部門比例~~ | ~~US-091~~ | P0-MVP | **DEPRECATED v2.0（2026-05-15 / E07 重構批次 4，由 F079 / F080 / F081 取代；限 `stage = 'dept_ratio'` 寫入 + 部長 + Admin 限制 + I-8 容忍誤差語意）** |

**M03a — 部門比例設定階段（E07 重構批次 4，2026-05-15 新增）**

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F079 | [F079-set-dept-ratio.md](features/F079-set-dept-ratio.md) | 部門比例設定（per-LIST_NO 各部門分配比例，限 `stage = 'dept_ratio'`） | US-109 | P0-MVP |
| F080 | [F080-advance-to-personnel-ratio.md](features/F080-advance-to-personnel-ratio.md) | 部門比例設定階段推進至個別業務比例設定 | US-110 | P0-MVP |
| F081 | [F081-rollback-to-draft.md](features/F081-rollback-to-draft.md) | 部門比例設定階段 Rollback 至草稿（清空 `ob_dept_pct`） | US-111 | P0-MVP |

**M03b — 個別業務比例設定階段（E07 重構批次 5，2026-05-15 新增）**

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F082 | [F082-set-personnel-ratio.md](features/F082-set-personnel-ratio.md) | **個別業務比例設定（per-LIST_NO 各部門業務員 RATION，處長轄區 + 部長代操作；v1.2 PO 決議 F082-A：離職員工保留顯示 + isResigned flag + 比例驗算排除 + ETL E07-OBEMPHIRE-Load pipeline 來源明確化）** | US-112 | P0-MVP（**v1.2**）|
| F083 | [F083-quick-ratio-template.md](features/F083-quick-ratio-template.md) | 獎懲快速比例模板（相對均等預設值之 ±10/20% 調整，OQ-E07-20 落地；v1.1 PO 決議 F083-A 覆蓋式模板落地） | US-113 | P0-MVP（**v1.1**）|
| F084 | [F084-advance-to-approval.md](features/F084-advance-to-approval.md) | 個別業務比例設定階段推進至簽核（多角色 Actor + per-DEPT 加總驗證；v1.1 PO 決議 F084-A 無代理推進 + 不增加 is_proxy_set 欄位 + F088 cross-ref） | US-114 | P0-MVP（**v1.1**）|
| F085 | [F085-rollback-to-dept-ratio.md](features/F085-rollback-to-dept-ratio.md) | 個別業務比例設定階段 Rollback 至部門比例（限部長 + Admin，跨轄區清空 `ob_empl_set`；v1.1 PO 決議 F085-B 跨轄區清空不需處長同意 + audit log 完整紀錄） | US-115 | P0-MVP（**v1.1**）|

**M03c — 簽核階段（E07 重構批次 6，2026-05-15 新增）**

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F086 | [F086-approve-to-ready.md](features/F086-approve-to-ready.md) | **部長核准名單（簽核 → 準備完成；限部長 + Admin；新建 `assignment_approval` 表）** | US-116 | P0-MVP |
| F087 | [F087-reject-to-personnel-ratio.md](features/F087-reject-to-personnel-ratio.md) | **部長拒絕並退回個別業務比例設定（簽核拒絕；限部長 + Admin；拒絕原因必填 1~500 字；觸發 F082 banner OQ-E07-21 落地）** | US-117 | P0-MVP |

**M03d — 準備完成階段（E07 重構批次 6，2026-05-15 新增）**

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F088 | [F088-ready-stage-summary.md](features/F088-ready-stage-summary.md) | **準備完成階段查詢摘要（部長 + 處長 + Admin 唯讀；含篩選 / 部門比例 / 個別業務比例 / CR 開關四區塊；處長轄區過濾；月跑前置條件即時計算；v1.1 補 `proxyStatus` 欄位 schema 對應 F084-A 落地）** | US-118 | P0-MVP（**v1.1**）|
| F089 | [F089-rollback-to-approval.md](features/F089-rollback-to-approval.md) | **準備完成階段 Rollback 至簽核（限部長 + Admin；保留設定資料；清空 `assignment_approval`）** | US-119 | P0-MVP |

#### M04 分派執行

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F061 | [F061-trigger-assignment-run.md](features/F061-trigger-assignment-run.md) | **觸發分派月跑（Stage 0~4 + 三份快照原子性寫入；v1.2 PO 決議 OQ-E07-29-A 邊緣 CARD_TYPE HB/SEB/SEC 跳過 + report_payload.skippedCases JSONB + 月跑仍 completed；v1.1 補「所有 active 名單 stage = 'ready'」前置條件 + Stage 3 CR 路徑改 per-LIST_NO `cr_enabled` + `MONTHLY_RUN_BLOCKED_LIST_NOT_READY` 錯誤碼）** | US-081 | P0-MVP（**v1.2**）|
| F062 | [F062-view-run-progress.md](features/F062-view-run-progress.md) | 查看分派執行進度（3 秒 Polling） | US-082 | P0-MVP |
| F063 | [F063-view-run-result-summary.md](features/F063-view-run-result-summary.md) | 查看分派結果摘要（部門偏差 / 等級分佈） | US-083 | P0-MVP |
| F064 | [F064-export-assignment-result.md](features/F064-export-assignment-result.md) | **匯出分派結果（v2.1：對齊 legacy 23 欄明細；**pool 源 = `ob_pool_data`(by orgno+appl_no，v2.1 血緣修正，非 `ob_pool_data_list`，不掉列 I-EXP-LINEAGE-01)**；GAP-1 刪 custo_no/cust_name 改 appl_no、GAP-2 資料源由 snapshot payload 改 `ob_monthly_run_result` join `ob_pool_data`/emphire/list_definition、GAP-3 進件日=`ob_pool_data.appl_date`(timestamp 只取日期)；移除 card_level/score；xlsx + CSV 皆 streaming；emphire join-miss fallback 空值+WARNING log；overdue_day 恆空保留欄；樞紐 sheet 另案）** | US-155（supersedes US-084）| P0-MVP（**v2.1**）|

#### M04 — Stage 1 精確化 / ob_pool_data_list 單源化 + 特例規則 SP 修正工程（AD-E07-21~26）

> **v3.6 / 2026-05-27 / AD-E07-25 + AD-E07-26（architecture-spec v2.18）**：在原 Stage 1 精確化三階段（F090~F092）之上，依 AD-E07-25（資料單源化）+ AD-E07-26（特例規則 SP 落差修正）新增 F094~F096 並升版 F090/F091/F092。**⚠️ Phase A 群組（F091 v2.0 + F094 + F095）同批 deploy，無 feature flag、deploy 後直接生效（DP-AD23-2 / DP-AD26-1），改變 production 月跑各類名單案件數，須 deploy 前業務知會 + 案件數差異驗收。** 詳見各 feature §13。

| Feature ID | 文件 | 標題 | 來源 | 優先級 |
|------------|------|------|-----------|--------|
| F090 | [F090-obpooldata-list-etl.md](features/F090-obpooldata-list-etl.md) | **Phase 1 + Phase B 單源化 — OBPOOLDATA_LIST ETL 載入 + `data_source` 單源化**（雙層 ETL；**v2.0**：`data_source` 值域單一化 `'etl_load'`、月跑改寫 `ob_monthly_run_result` 不再寫本表、Load 前置 DELETE 可全量；歷史限定 `ASSIGNDAY < 本月第一天`；ETL 不影響 production 月跑案件數） | AD-E07-25 / US-133 | P0-MVP（**v2.0**）|
| F091 | [F091-stage1-complete-month-cnt-dedup-special-delete.md](features/F091-stage1-complete-month-cnt-dedup-special-delete.md) | **Phase 2 + Phase A 特例修正 — Stage 1 補完整 + 特例 DELETE SP 修正**（MONTH_CNT 期別 + 近 3 月去重 + 特例 DELETE；**v2.0 high-severity bug fix**：trigger 由誤判「中結強案/中結/年資+滿」修正為 SP 正確版「**期中機車/期中/年以上+小資/白牌**」、去重上界改 `MIN(MAX(assignday), workdt−1日)`、year_produ 補 `parseInt`；`Stage1FilterChain`；**⚠️ 改變 production 月跑各類名單案件數、無 flag 直接生效**） | AD-E07-22/25/26 / US-134 | P0-MVP（**v2.0**）|
| F092 | [F092-stage1-dry-run-estimate.md](features/F092-stage1-dry-run-estimate.md) | **Phase 3 — Stage 1 完整鏈 Dry-run 精確估算**（per-list estimate / F088 物化升級為完整鏈唯讀 dry-run COUNT ≡ 月跑；**v1.1**：同步 F091 v2.0 修正後 trigger / 去重上界 + 月跑落點 `ob_monthly_run_result`；唯讀不寫表） | AD-E07-23 / US-135 | P0-MVP（**v1.1**）|
| **F094** | [**F094-monthly-run-result-table.md**](features/F094-monthly-run-result-table.md) | **單源化 Phase A — 月跑分派結果表 `ob_monthly_run_result`**（migration `1711360000292`；PK=run_id+list_no+orgno+appl_no、FK→assignment_run CASCADE、nullable assignday；月跑 Stage 1 寫入 + Stage 3/4 讀取由 `ob_pool_data_list` 切換至本表；同一 PR 完整切換；snapshot 雙軌短期保留；**⚠️ Phase A 同批 deploy，結構切換不改案件數但須完整回歸**） | AD-E07-25 | P0-MVP（**v1.0 新增**）|
| **F095** | [**F095-applied-special-rules-readonly.md**](features/F095-applied-special-rules-readonly.md) | **特例規則前端唯讀呈現 — `appliedSpecialRules[]`**（名單詳情 API 讀時推導 list_nm → 規則清單，**無新 DB 欄位**；前端唯讀資訊區塊「此名單套用之系統特例規則」；trigger 判斷與 F091 v2.0 共用 pure utility；**prototype 落差待補**；Phase A 同批 deploy，唯讀不改月跑） | AD-E07-26 §26.5 | **P1**（**v1.0 新增**）|
| **F096** | [**F096-pooldata-whitelist-list-type-cleanup.md**](features/F096-pooldata-whitelist-list-type-cleanup.md) | **白名單清理 Phase B — `pooldata_field_whitelist.list_type` 停用**（migration/seed `1711360000293` 設 `is_active=false`；available-columns dropdown 不再顯示；澄清 `case_status → ob_pool_data.list_type` 為唯一期別篩選路徑；不改月跑案件數） | AD-E07-26 §26.7 | **P1**（**v1.0 新增**）|
| **F097** | [**F097-work-ym-semantics-unification.md**](features/F097-work-ym-semantics-unification.md) | **客戶名單分派「作業月」語意統一**（分離 `current_work_ym` / `target_work_ym`；前端 `AssignmentWorkYmContext` 四頁共享預設下月；`POST /runs` 接受必填 `workYm` + 過去月 guard `>=`；`SystemService` 收斂 + `getDefaultTargetWorkYm()`；下游結果頁讀 `run.project_workym`；Stage 1 去重靠正確 `workdt` 自動對齊不改 `computeDedupWindow`；forward-only 不回填。錯誤碼方案 A：缺省 400 / 格式 422 `WORK_YM_INVALID_FORMAT` 沿用 / 過去月 422 `RUN_WORKYM_PAST` 新增。**OQ-F097-01/02/03 已裁示；F077 已同步 v1.4；error-handling.md 已登記**） | US-137~US-143 / proposals/work-ym-semantics-unification.md | **P0-MVP**（**v1.0 新增**）|

#### M04 — 月跑執行模型重構（AD-E07-28：Worker 抽離 + Stage 1~4 SQL 下推）

> **v3.9 / 2026-06-02 / AD-E07-28（architecture-spec §5.13 v2.22，status: proposed）**：月跑由「cdmp-api 同程序 `setImmediate` 背景跑」重構為「pg-boss 入列 → 獨立 cdmp-worker 容器 → Stage 1~4 set-based SQL `INSERT…SELECT`」，分 P1/P2/P3 三階段。解決 (F1) event loop 阻塞（月跑期間整站 API 逾時）+ (F2) OOM（全載 ob_pool_data 進 heap）。**佇列 = pg-boss（免 Redis）；新增 cdmp-worker 容器；I-RUN-EST-01 estimate≡run 共用 buildStage1Sql；JS↔SQL PG 真庫等價測試為 P2/P3 DoD。** 建議實作順序 P1→P2→P3 嚴格序列。

| Feature ID | 文件 | 標題 | 來源 | 優先級 |
|------------|------|------|-----------|--------|
| **F098** | [**F098-monthly-run-worker-extraction.md**](features/F098-monthly-run-worker-extraction.md) | **P1 — 月跑 Worker 抽離**（pg-boss 入列 + `cdmp-worker` 容器 + `triggerRun` 改入列立即回 202 + `CancellationPoller` 補齊取消 + `OrphanReaper` 殭屍回收；解 F1；retryLimit=0 / 單 worker 序列化 / 不新增 orphan 欄位；I-TRIGGER-01；無 HTTP 錯誤碼） | AD-E07-28 P1 | P0-MVP（**v1.0 新增**）|
| **F099** | [**F099-stage1-sql-pushdown.md**](features/F099-stage1-sql-pushdown.md) | **P2 — Stage 1 SQL 下推**（`buildStage1Sql` 單一 core，run `INSERT…SELECT` ／ estimate `SELECT COUNT(*)` 共用 **I-RUN-EST-01**；**四特例規則（詐騙白牌 / 機車期中 / 期中小資 / year-above）全 SQL 下推、無應用層 filter（OQ-AD28-03=選項 A，2026-06-02 拍板）** + month_cnt + 去重 anti-join；year-above 數值化 PG 真庫驗收 **I-PORT-01**（CI 必起 Postgres）；冪等清理 **I-IDEM-01**；**JS↔SQL 逐 list 等價測試 = P2 DoD**，廢除 RGv2-005 / SDv2-*；解 F2 Stage 1；無新錯誤碼） | AD-E07-28 P2 / 修訂 AD-E07-22/23/25 | P0-MVP（**v1.0 新增**）|
| **F100** | [**F100-stage2-4-sql-pushdown-scoring.md**](features/F100-stage2-4-sql-pushdown-scoring.md) | **P3 — Stage 2~4 SQL 下推 + v2 真實計分引擎**（`ob_levelcard_*` 區間/類別 `SUM(CASE…)` + `customer_core` LEFT JOIN 補完 + CR `EXISTS` + st4_exchange `ROW_NUMBER()+CEIL(×0.1)`；**OQ-06 排序鍵已解**：SP=隨機 NEWID()→採 deterministic `ORDER BY orgno,appl_no`；**OQ-F100-01 已解（2026-06-02）= 對齊現行 JS 簡化版**（`PARTITION BY list_no` + 單一 senior；SP 主管↔專員配對交換 out-of-scope、不復刻）；JS↔SQL 逐列等價 = P3 DoD；含計分簡化版→真實版升級須業務知會；解 F2 全；無新錯誤碼） | AD-E07-28 P3 / OQ-AD28-06（已解） | P0-MVP（**v1.0 新增**）|
| **F101** | [**F101-stage3-4-proportional-assignment.md**](features/F101-stage3-4-proportional-assignment.md) | **月跑 Stage 3/4 真實比例分派**（取代 F100 placeholder Stage 4＝dept[0]+單一 defaultEmpl，修 OB202606001 全員 `emplid=NULL`／Bug C）：Stage 3 三維分組（分處 dept_id, list_no, tier_level）`FLOOR(件數×ob_dept_pct.ration/100)`+確定性差額；Stage 4 員工 `FLOOR(×ob_empl_set.ration/100)`+兩階段補足（均攤 ADD_CNT + 前 N 各 +1）；ASSIGNDAY 複用 `calculateDailyEstimate(ym)` 千分比+最末吸收+DIVIDE_LEFT round-robin（estimate≡run，I-RUN-EST-01）；統一 T1–T5 單一演算法（無變體分流）；simplified is_cr=被動標記（無 CR 優先/超額移除，**CR 優先分派由 F102 承接**）；**全確定性取代 NEWID()**（手算 oracle AC-13/14 + JS↔SQL 逐列等價 = DoD AC-15）；**2 schema gap flag**（tier_level 來源/警告碼通道）+ **5 OQ 待架構師裁示**（確定性鍵/vs F100 st4_exchange 交互/ob_assign_set 退役/冪等粒度/警告落點）；無新錯誤碼） | US-145/146/149/150/151 | P0-MVP（**v1.0 新增**）|
| **F102** | [**F102-cr-priority-assignment.md**](features/F102-cr-priority-assignment.md) | **月跑 CR 優先分派**（補 F101 simplified is_cr 缺口；**純後端、無新前端頁、無新錯誤碼**；ground truth=`st2_dept.sql` 第 116–190 行 CR LIVE 段，`st3_emplid` CR 段死碼不引用）：**閘控** per-list `ob_list_definition.cr_enabled` 快照（`true` 跑步驟 1–3／`false` 強制 `is_cr='N'` 全案件入 F101 池、不扣量；不讀全域旗標）；**步驟 1** 逾2年清空（`appl_date < DATEADD(YEAR,-2,@SYS_DT)` 嚴格小於）；**步驟 2** 離職清空（`ob_emphire.resign_date < @SYS_DT`；查無 emp_id 不清空）；**步驟 3** CR 優先指派（`ob_empl_set ration>0` 才指派 `emplid=cr_id`/`is_cr='Y'`，per-list 鍵）；**步驟 4** 扣量（F101 池 `WHERE is_cr<>'Y'`，不覆蓋 CR 案）；全確定性 align **I-DET-01**；**廢除全域旗標** `cr_reassignment_enabled`（US-154，修正 F059 doc body）；**3 schema gap**（CR 三欄流向/cr_enabled 預設值文字矛盾 DEFAULT false/ob_assign_config 退役）+ **5 架構師 OQ**（CR 欄位流向+清除順序/多筆 deptid_m/機車 migration+data-model 修正/ob_assign_config DROP/architecture-spec S2）；驗收=202606 重跑 `is_cr='Y'`≈1.9% | US-152/153/154 | P0-MVP（**v1.0 新增 / 2026-06-12**）|
| **F103** | [**F103-stage2-score-column-source-fix.md**](features/F103-stage2-score-column-source-fix.md) | **月跑計分引擎欄位來源修正**（**純後端、無新前端頁、無新錯誤碼**；引擎兩路徑 PG 下推 `resolveColumnSource` + JS oracle `resolveColumnValue` **完全對齊 AD-E07-10-L**（`architecture-spec.md` line 4074–4091））：**(1)** ADD_UN_CAPITAL 補 `LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no=o.appl_no` + `COALESCE(ar.add_un_capital,0)`（AD line 4085，H 卡最高 +36 分項，原缺 case→靜默 +0）；**(2)** 通用 fallback（**OQ-156-02 納入、不留債**）取代 `default: return undefined` → AD line 4091 `COALESCE((to_jsonb(o)->>lower(col))::numeric,0)` range BETWEEN；**(3)** PROJECT_TP 衍生（AD line 4088 `spec_name LIKE '%專案%'→LEVEL1='A'`，兩路徑補）；**(4)** 移除 COMMISSION 死碼（不在 AD、legacy dump 0 筆）；**(5)** JS oracle 補齊 cc 欄（CUS_SEX/AGE/CAREA_*/CELLULAR/EDUCAT_BACK/*_NUM_NM/LOAN_RATE）+ ADD_UN_CAPITAL，達 JS↔SQL EQ；**(6)** 逐欄稽核全 card_type（H/S/S5/E/E5/M）+ dev 重跑 202606 驗收（card_level 不全 D、tier 含 T1/T2，**定性** OQ-158-01；**仍異常則本輪根因引擎 vs customer_core 資料品質空值率**，**OQ-158-02 納入、不推延**）；AGE 兩路徑統一演算法（OQ-157-01）；幽靈欄位 +0+log 不阻擋（OQ-156-01）；**3 架構師 OQ**（computeScore 簽章 vs 呼叫端 pre-fetch merge / JS 取 arreturndf 資料流 / SQLite cc mock）；改變 score/card_level/tier 分佈→F067 差異報告+業務知會 | US-156/157/158 | P0-MVP（**v1.0 新增 / 2026-06-24**）|
| **F104** | [**F104-stage2-ad-e07-10-l-full-legacy-alignment.md**](features/F104-stage2-ad-e07-10-l-full-legacy-alignment.md) | **Stage 2 計分引擎 AD-E07-10-L 全欄對齊 legacy SP**（**純後端、無新前端頁、無新錯誤碼**；F103 對齊的 AD-E07-10-L 本身有多欄偏差，本輪兩路徑改對齊 **legacy `SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`** 真語意）：**(1)** PROJECT_TP 關鍵字 `'%專案%'`→**`'%借新還舊%'`**（legacy H L101）；**(2)** SALES_STS 關鍵字 `'經銷商'`→**`'中古車商'`**（legacy H L41；**OQ-159-01 已查證＝SP_GET_CUSTATTRIB 與 SALES_STS 無關、CASE 就地完成、確需修**）；**(3)** CUS_SEX category→**range** `COALESCE(safe_int(cc.cus_sex),3) BETWEEN`（**BR-13 NULL-safe cast，禁裸 `::int`**，dev cus_sex 含 'C'/'D'/空髒值會 cast 失敗整支月跑掛）；**(4)** 五欄 **CUS_SEX 分流**（CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK）個人取自身屬性、法人取 0/default（保證人停用複刻、不 JOIN）；AGE **>100 排除**；EDUCAT_BACK 補零 + per-card default（E/S→'02'、**S5→'08'**）；**(5)** 三縣市欄改讀 `cc.hpost_city/cpost_city/co_city`（縣市+區）+ **`LEFT(...,3)` 比對**（**縣市比對粒度已查證＝score row level1 全縣市-only 3 字**）+ per-card default（S5 花蓮縣/金門縣、M-HM 臺北市/臺南市/高雄市；**H/S 不計分縣市欄→stories 之 H/S default 假設有誤、已依 legacy 修正**）；**(6)** LIST_MONTH（H/S→25、E/E5→12）/ LOAN_RATE（S5→77、E/E5→12）per-card default；**(7)** signature 加 `cardType`（OQ-1，交 architect）；JS↔SQL EQ = DoD；驗收 dev 重跑 202606 tier 含 T1/T2（定性）；**4 架構師 OQ**（signature 加 cardType / AD-E07-10-L 改寫 / per-card default 完整表 / PROJECT_TP 複合條件+EDUCAT_BACK 比較型別+縣市 LEFT3 落點） | US-159/160/161/162/163 | P0-MVP（**v1.0 新增 / 2026-06-24**）|

#### M05 快照歷史

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 |
|------------|------|------|-----------|--------|
| F065 | [F065-view-run-history-list.md](features/F065-view-run-history-list.md) | 查看歷史執行紀錄清單 | US-085 | P0-MVP |
| F066 | [F066-view-run-snapshot-detail.md](features/F066-view-run-snapshot-detail.md) | 查看執行快照詳情（config / input_list / result） | US-086 | P0-MVP |
| F067 | [F067-compare-run-results.md](features/F067-compare-run-results.md) | 比對兩次執行結果差異（含人員配對 diff，NFR-005 主驗收工具） | US-087 | **P0-MVP**（使用者升級） |

#### M06 基礎代碼維護

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 | 版本 |
|------------|------|------|-----------|--------|------|
| ~~F068~~ | ~~[F068-edit-base-code.md](features/F068-edit-base-code.md)~~ | ~~E07 相關代碼維護（PROD_KIND / SPEC_TP / CASE_STATUS）~~ | ~~US-092~~ | P0-MVP | **DEPRECATED v1.3（2026-05-20 / F050 v2.1 重構 / J2）— 由 F075 v1.5 + F076 v1.5 + US-124 + US-125 承接；保留歷史內容 + banner** |
| F075 | [F075-manage-pooldata-field-whitelist.md](features/F075-manage-pooldata-field-whitelist.md) | POOLDATA 篩選欄位白名單管理（含 `field_type` metadata；**v1.7 / 2026-05-28 / US-144**：新增 `is_system_fixed BOOLEAN NOT NULL DEFAULT false` 欄位（`best_case = true`）+ BR-15 系統固定欄位不可停用 → 422 `SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE` + BR-16 從名單「新增條件」可選池排除 + GET API 暴露 `isSystemFixed`（AC-18/19/20）；**v1.6 / 2026-05-20**：seed 擴充為 **7 筆全部啟用**，新增 `best_case`（categorical），對應 US-128 / US-129；**v1.5**：seed 補 `case_status`，6 筆，對應 US-125 AC-5；v1.4.7：available-columns 補 `columnDescription` + Modal 自動填入；v1.4 UI 命名改「篩選欄位管理」+ `GET /available-columns` dropdown 唯一新增路徑 + `suggestedFieldType` 推斷；v1.4.3 case 對齊小寫 snake_case） | US-102, US-125, US-128, US-129, US-144 | P0-MVP | **v1.7** |
| F076 | [F076-manage-categorical-field-values.md](features/F076-manage-categorical-field-values.md) | 類別型欄位可選值管理（**v1.5 / 2026-05-20**：AC-3 seed 補 `case_status` 4 筆（01/02/03/04，業務語意對照引用 F050 v2.1 §5.1.1）+ caseyear 確認 8 筆（0~6 + 99，J5 拍板）+ spec_tp 升真實 OBMCODEDF dump **52 筆**（TBL_ID='12'，取代 m24 placeholder 3 筆，E5 ✅ Resolved；2026-05-21 二次更正：原為 TBL_ID='02' 32 筆筆誤）；v1.4.5 多欄位 accordion master 架構；v1.3 PO 決議 F076-C 軟停用機制：§5.0 schema 補 `deactivation_reason` ENUM `'manual'`/`'field_type_changed'` + §5.4 deactivate 端點 + reason 必填 200 字 + `WHITELIST_OPTION_INACTIVE` 警告紀錄 cross-ref） | US-103, US-125 | P0-MVP | **v1.5** |
| F109 | [F109-customer-source-filter-fields.md](features/F109-customer-source-filter-fields.md) | 新增「客戶資料」來源篩選欄位（**v1.0 / 2026-07-02 / US-172**）：白名單新增 `data_source` 概念（`ob_pool_data` 案件資料 / `customer_core` 客戶資料，既有 7 筆預設 `ob_pool_data`）+ API 暴露 `dataSource` + M06 列表「資料來源」欄 + 名單定義「新增條件」選單依來源分組；新增 8 個 `data_source='customer_core'` 欄位（性別 code→label / 年齡衍生 AGE 以 `project_workym` 月首日為基準 / 居住城市 `LEFT(cpost_city,3)` 縣市級 22 / 5 個 `_desc` value=label）；F076 seed 7 個 categorical 欄位可選值（3/55/8/5/4/9/22）；月跑 Stage 1 條件式 LEFT JOIN customer_core（`custo_no=source_customer_no`）+ NULL 排除語意（BR-2/BR-3）+ 三處消費一致（月跑/Stage 0 試算/名單試算，BR-10）。5 個架構 OQ（OQ-F109-01~05）交 system-architect（AD-E07-37）。 | US-172 | P1 | **v1.0** |

#### M07 角色與可見範圍（E07 重構批次 1，2026-05-15）

| Feature ID | 文件 | 標題 | 來源 Story | 優先級 | 版本 |
|------------|------|------|-----------|--------|------|
| F073 | [F073-define-director-role.md](features/F073-define-director-role.md) | **部長角色定義與 E07 全模組權限（v1.1：§E02 整合 — PATCH `/accounts/:id/e07-role` 唯一寫入端點 + Token revoke 沿用 `password_changed_at` + 並存正交 BR）** | US-100 | P0-MVP | **v1.1** |
| F074 | [F074-define-section-chief-role.md](features/F074-define-section-chief-role.md) | **處長角色定義與轄區（`created_by`）限縮（v1.1：§E02 整合沿用 F073 §5.4 + 並存正交 BR）** | US-101 | P0-MVP | **v1.1** |

> **E07 角色矩陣權威來源**：[F002 §4.6](features/F002-user-login.md#e07-角色矩陣)（v1.4 補入「`is_sales_manager` 與 `e07_role` 正交維度說明」+ JWT Payload `e07_role` claim 規範 + Guard `req.user.e07_role` 暴露機制；v1.3 由 F073 / F074 導入定義部長 / 處長 / Admin × M01~M06 之 CRUD 矩陣與三層 Guard 行為）。~~F068（v1.2）~~（**DEPRECATED v1.3 / 2026-05-20**）/ F055（v1.6）/ F069~F072 / F075 v1.5 / F076 v1.5 / 後續 M03a~d spec 一律引用本節。

---

## 圖表文件

### 系統架構

| 文件 | 說明 | 圖表類型 |
|------|------|---------|
| [diagrams/system-context.md](diagrams/system-context.md) | C4 Level 1 系統上下文圖 | Flowchart |
| [diagrams/container-architecture.md](diagrams/container-architecture.md) | 容器架構圖 | Flowchart |
| [diagrams/er-diagram.md](diagrams/er-diagram.md) | 實體關聯圖 | erDiagram |

### 流程圖（E01~E06）

| 文件 | 說明 | 圖表類型 | 相關 Feature |
|------|------|---------|-------------|
| [diagrams/auth-flow.md](diagrams/auth-flow.md) | 身份驗證流程 | Sequence | F001, F002, F003 |
| [diagrams/password-reset-flow.md](diagrams/password-reset-flow.md) | 密碼重設流程 | Sequence | F009, F010 |
| [diagrams/datasource-crud-flow.md](diagrams/datasource-crud-flow.md) | 資料來源 CRUD 流程 | Sequence | F011, F013, F014 |
| [diagrams/connection-test-flow.md](diagrams/connection-test-flow.md) | 連線測試流程 | Sequence | F015 |
| [diagrams/health-check-flow.md](diagrams/health-check-flow.md) | 自動健康檢查流程 | Sequence | F016 |
| [diagrams/extraction-crud-flow.md](diagrams/extraction-crud-flow.md) | 擷取任務 CRUD 流程 | Sequence | F017, F019, F025 |
| [diagrams/extraction-execution-flow.md](diagrams/extraction-execution-flow.md) | 擷取任務執行流程 | Sequence | F021, F023 |
| [diagrams/pipeline-crud-flow.md](diagrams/pipeline-crud-flow.md) | Pipeline CRUD 流程 | Sequence | F027, F028, F034 |
| [diagrams/pipeline-execution-flow.md](diagrams/pipeline-execution-flow.md) | Pipeline 執行流程 | Sequence | F030 |
| [diagrams/pipeline-editor-flow.md](diagrams/pipeline-editor-flow.md) | Pipeline 編輯器流程 | Flowchart | F029 |
| [diagrams/target-table-etl-flow.md](diagrams/target-table-etl-flow.md) | 目標表 ETL 轉換流程 | Flowchart | F036 |
| [diagrams/F039-node-field-badge.mmd](diagrams/F039-node-field-badge.mmd) | 節點欄位 Badge 資料流與元件結構 | Flowchart | F039 |
| [diagrams/F041-badge-hover-tooltip.mmd](diagrams/F041-badge-hover-tooltip.mmd) | Badge Hover Tooltip 互動時序 | Sequence | F041 |
| [diagrams/F042-etl-execution-engine.mmd](diagrams/F042-etl-execution-engine.mmd) | ETL 執行引擎流程與 Node Dispatcher 架構 | Flowchart | F042 |
| [diagrams/F046-customer-search-list.mmd](diagrams/F046-customer-search-list.mmd) | 客戶搜尋與清單流程 | Sequence | F046 |
| [diagrams/F047-customer-360-detail.mmd](diagrams/F047-customer-360-detail.mmd) | 單一客戶 360 詳情載入流程 | Sequence | F047 |

### 流程圖（E07）

| 文件 | 說明 | 圖表類型 | 相關 Feature |
|------|------|---------|-------------|
| [diagrams/F049-stage0-estimate-flow.mmd](diagrams/F049-stage0-estimate-flow.mmd) | Stage 0 每日分派數量估算流程（v1.x per-list 試算） | Sequence | F049 |
| [diagrams/F049-stage0-dept-projection-flow.mmd](diagrams/F049-stage0-dept-projection-flow.mmd) | **F049 v2.0 Part B 部門每日分派量資料流（名單 → per-list COUNT → ×ration → ×千分位 → 部門/日矩陣 → ÷在職人數；含 scope filter + 缺口分支 + 人均門檻；mermaid 已驗證）** | Flowchart | F049, F079, F088 |
| [diagrams/F061-assignment-run-flow.mmd](diagrams/F061-assignment-run-flow.mmd) | 月跑 Stage 0~4 執行引擎流程 | Flowchart | F061 |
| [diagrams/F066-snapshot-detail-flow.mmd](diagrams/F066-snapshot-detail-flow.mmd) | 執行快照詳情載入流程 | Sequence | F066 |
| [diagrams/F067-run-comparison-flow.mmd](diagrams/F067-run-comparison-flow.mmd) | 兩次執行結果差異比對流程 | Sequence | F067 |
| [diagrams/F073-role-matrix.mmd](diagrams/F073-role-matrix.mmd) | E07 角色 × 模組權限矩陣決策流程（Guard 檢查順序） | Flowchart | F073, F074, F002 §4.6 |
| [diagrams/F075-whitelist-flow.mmd](diagrams/F075-whitelist-flow.mmd) | POOLDATA 篩選欄位白名單管理流程（seed / 列表 / CRUD） | Flowchart | F075, F076 |
| [diagrams/F109-customer-source-filter-flow.mmd](diagrams/F109-customer-source-filter-flow.mmd) | **F109 v1.0 客戶資料來源篩選：Stage 1 條件式 LEFT JOIN customer_core 與 NULL 排除語意決策流程（含年齡 AGE / 居住城市 LEFT3 衍生欄 + AND 跨來源組合 + 三處消費一致 I-RUN-EST-01）** | Flowchart | F109, F075, F076, F050 |
| [diagrams/F077-month-switch-flow.mmd](diagrams/F077-month-switch-flow.mmd) | M01 月份切換 + 唯讀判斷 + lockState 渲染流程 | Flowchart | F077, F048 |
| [diagrams/F050-draft-create-flow.mmd](diagrams/F050-draft-create-flow.mmd) | F050 v2.0 草稿建立名單流程（含「從上月複製」分支與 feature flag gating） | Flowchart | F050 v2.0, F077 |
| [diagrams/F078-draft-advance-flow.mmd](diagrams/F078-draft-advance-flow.mmd) | F078 v1.0 草稿推進至部門比例設定流程（含 6 項前置條件嚴格驗證 + feature flag gating） | Flowchart | F078, F050 v2.0, F077 |
| [diagrams/F079-dept-ratio-flow.mmd](diagrams/F079-dept-ratio-flow.mmd) | F079 / F080 / F081 v1.0 部門比例設定整合流程（含 advance / rollback 分支 + service 層共用 helper 註記） | Flowchart | F079, F080, F081, F077 |
| [diagrams/F082-personnel-ratio-flow.mmd](diagrams/F082-personnel-ratio-flow.mmd) | F082 / F083 / F084 / F085 v1.0 個別業務比例設定整合流程（含轄區 Guard / 模板套用 / advance / rollback + service 層共用 helper 註記） | Flowchart | F082, F083, F084, F085, F077 |
| [diagrams/F086-approval-flow.mmd](diagrams/F086-approval-flow.mmd) | **F086 / F087 v1.0 簽核階段流程（核准 → ready / 拒絕 → personnel_ratio 兩條分支 + banner 觸發機制）** | Flowchart | F086, F087, F082 v1.1 |
| [diagrams/F088-ready-summary.mmd](diagrams/F088-ready-summary.mmd) | **F088 / F089 v1.0 準備完成階段查詢摘要與 Rollback 資訊架構（三角色 × 四區塊 + 月跑前置條件耦合 + monthlyRunReady 即時更新）** | Flowchart | F088, F089, F061 v1.1, F082 v1.1 |
| [diagrams/F098-worker-extraction-flow.mmd](diagrams/F098-worker-extraction-flow.mmd) | **F098 v1.0 月跑 Worker 抽離 run 業務狀態機（pending→running→completed/failed，含 cancelRun / OrphanReaper 轉移來源 + I-TRIGGER-01）** | State | F098, F061 |
| [diagrams/F099-stage1-sql-pushdown-flow.mmd](diagrams/F099-stage1-sql-pushdown-flow.mmd) | **F099 v1.0 Stage 1 SQL 下推：buildStage1Sql 單一 core 之 run / estimate 兩種外層包裝（I-RUN-EST-01）+ 四特例規則含 year-above 全 SQL 下推（選項 A，無應用層 filter）+ I-IDEM-01** | Flowchart | F099, F049, F091, F094 |
| [diagrams/F100-stage2-4-pushdown-flow.mmd](diagrams/F100-stage2-4-pushdown-flow.mmd) | **F100 v1.0 Stage 2~4 SQL 下推 + v2 計分引擎（SUM(CASE) + customer_core LEFT JOIN + CR EXISTS + st4_exchange ROW_NUMBER；OQ-06 排序鍵；PG 真庫 JS↔SQL 等價 DoD 門檻）** | Flowchart | F100, F036, F067 |
| [diagrams/F101-stage3-4-proportional-flow.mmd](diagrams/F101-stage3-4-proportional-flow.mmd) | **F101 v1.0 月跑 Stage 3/4 真實比例分派（Stage 2 tier_level 就緒 → Stage 3 三維分組 FLOOR+確定性差額 → Stage 4 員工 FLOOR+兩階段補足 → ASSIGNDAY 千分比+DIVIDE_LEFT；DB_TYPE dual-path PG 下推/JS oracle gate + 三 fallback 分支 + 警告通道 report_payload + JS↔SQL 等價 DoD）** | Flowchart | F101, F100, F049, F067 |
| [diagrams/F102-cr-priority-flow.mmd](diagrams/F102-cr-priority-flow.mmd) | **F102 v1.0 月跑 CR 優先分派（Stage 2 就緒 → F101 清除 → cr_enabled 閘控：true 步驟 1 逾2年清空→2 離職清空→3 CR 優先指派→4 扣量／false 強制 is_cr='N'；F101 比例分派只跑 is_cr<>'Y'；確定性 SET-based align I-DET-01；旁註廢除全域旗標 + 死碼不引用）** | Flowchart | F102, F101, F059, F064, F067 |
| [diagrams/F106-enable-dimension-flow.mmd](diagrams/F106-enable-dimension-flow.mmd) | **F106 v1.0 啟用計分維度流程（對稱 disable）：前端 inactive 列點啟用 → PUT enable → Guard 鏈（Director + FeatureFlag）→ assertNotLocked(409 SCORING_VERSION_LOCKED) → assertCardTypeActive(404 CARD_TYPE_NOT_FOUND) → findOne(status=inactive，找不到/重複啟用 404 SCORING_COLUMN_NOT_FOUND) → status=active save → writeAudit(action=ENABLE) → 回 {status:active, enabledAt} → 前端 refetch getScoring；對稱 disable findOne(status=active)/寫 inactive/action=DISABLE** | Sequence | F106, F054, F053 |
| [diagrams/F107-decode-ui-flow.mmd](diagrams/F107-decode-ui-flow.mmd) | **F107 v1.0 decode UI 同源供給流程（唯讀）：Tab 切換 → GET /assignment/scoring（DirectorOrSectionChiefGuard 唯讀）→ getScoring 查 columns/scores → 逐維度由 SCORING_DECODE 共用常數取 decode（PROJECT_TP/SALES_STS/CUS_SEX/三縣市/五欄分流有；純數值欄→null 優雅降級 BR-6）→ 旁註 BR-4 同步斷言（decode codes/sourceField ≡ resolveColumnSource 衍生規則 + AD-E07-10-S §2）→ 回傳每維度附 decode → Tab 3 碼層並陳業務語意（原始碼保留）/ Tab 2 欄層來源欄+規則摘要；全程唯讀無寫入** | Sequence | F107, F053, F054, F106 |

### 狀態圖

| 文件 | 說明 | 圖表類型 | 相關 Feature |
|------|------|---------|-------------|
| [diagrams/account-states.md](diagrams/account-states.md) | 帳號狀態轉換 | State | F004, F007 |
| [diagrams/datasource-states.md](diagrams/datasource-states.md) | 資料來源狀態轉換 | State | F011, F013, F014, F015 |
| [diagrams/extraction-task-states.md](diagrams/extraction-task-states.md) | 擷取任務狀態轉換 | State | F017, F020, F021, F023, F025 |
| [diagrams/pipeline-states.md](diagrams/pipeline-states.md) | Pipeline 狀態轉換 | State | F028, F030, F031, F034 |
| [diagrams/pipeline-version-states.md](diagrams/pipeline-version-states.md) | Pipeline 版本狀態轉換 | State | F029, F030, F033, F037 |
| [diagrams/F061-assignment-run-states.mmd](diagrams/F061-assignment-run-states.mmd) | AssignmentRun 狀態轉換（pending/running/completed/failed） | State | F061, F062 |
| [diagrams/F077-stage-overview.mmd](diagrams/F077-stage-overview.mmd) | 名單定義五階段狀態轉換（draft → dept_ratio → personnel_ratio → approval → ready，含 advance / rollback / 拒絕 / 停用 / 遷移分支） | State | F077, F048, F050, F052, F061 |

---

## Agent 導覽指南

各下游 Agent 的建議載入策略：

### Architect Agent
1. 必讀：`overview.md`, `scope.md`, `nfr.md`, `data-model.md`, `open-questions.md`
2. 必讀圖表：`system-context.md`, `container-architecture.md`, `er-diagram.md`
3. 視需求載入：個別 Feature 文件（特別是 E07 F061/F066/F067 涉及跨模組整合）

### TDD Agent
1. 必讀：`data-model.md`, `error-handling.md`, `nfr.md`
2. 依實作順序載入對應 Feature 文件
3. 建議順序：
   - E01/E02：F001->F002->F003->F045->F004->F005->F006->F008->F009->F010->F007
   - E03：F011->F012->F013->F015->F014->F016
   - E04：F017->F018->F019->F020->F021->F022->F023->F024->F025->F026
   - E05：F027->F028->F029->F036->F030->F037->F031->F032->F033->F034->F035
   - 跨模組：F038
   - E05 執行引擎：F042->F043->F044
   - E06：F046->F047
   - **E07 建議順序**：**F073->F074**（M07 角色定義，E07 重構批次 1 前置依賴）->F068->**F075->F076**（M06 進階白名單）->**F048 v2.0->F077**（M01 入口 + 月份 / 階段總覽，E07 重構批次 2）->**F050 v2.0->F051 v2.0->F052 v2.0->F078**（M01 草稿階段建立 / 編輯 / 停用 / 推進，E07 重構批次 3；含 F059 同批次標 DEPRECATED + 移除舊路徑程式碼 + feature flag `ENABLE_E07_REFACTOR_PHASE3` 上線；原子性 I-1）->**F079->F080->F081**（M03a 部門比例設定 + 推進 + Rollback，E07 重構批次 4；含 F060 同批次標 DEPRECATED + service 層共用 `StageTransitionService` + `RatioValidationService` helper；建議與 F050 v2.0 §13 同套 flag gating，OQ-E07-37）->**F082 v1.1->F083->F084->F085**（M03b 個別業務比例 + 獎懲模板 + 推進至簽核 + Rollback 至部門比例，E07 重構批次 5；含 F058 同批次標 DEPRECATED + 新 `SectionChiefScopeGuard` + `PersonnelRatioValidationService` helper + `BONUS_PENALTY_TEMPLATE_INVALID` 等 4 個新錯誤碼；F082 v1.1 補 banner 渲染 OQ-E07-21）->**F086->F087->F088->F089**（M03c 簽核 + M03d 準備完成 + Rollback，E07 重構批次 6 最後一批；含新建 `assignment_approval` 表 + `MonthlyRunReadinessService` helper + `StageTransitionService.rejectTo` 新 helper + 4 個新錯誤碼 `MONTHLY_RUN_BLOCKED_LIST_NOT_READY` / `APPROVAL_INVALID_STAGE` / `APPROVAL_REJECT_REASON_REQUIRED` / `APPROVAL_REJECT_REASON_TOO_LONG`）->F049->**F069->F070->F071->F072**（CARD_TYPE CRUD，M02 入口）->F053->F054->F055->F056（M02 Tab 2~5）->F057 v1.1->~~F058~~（DEPRECATED 不實作）->~~F059~~（DEPRECATED 不實作）->~~F060~~（DEPRECATED 不實作）->**F061 v1.1**（補 ready 名單前置條件 + Stage 3 CR per-LIST_NO 路徑 + `MONTHLY_RUN_BLOCKED_LIST_NOT_READY` 錯誤碼）->F062->F063->F064->F065->F066->F067

### QA / Test Design Agent
1. 必讀：`scope.md`, `error-handling.md`, `nfr.md`
2. 載入所有 Feature 文件的 Acceptance Criteria 區段
3. E07 特別注意：NFR-003 月跑執行效能、NFR-004 快照原子性、NFR-005 結果準確性（F067 為主驗收工具）

### UI/UX Agent
1. 必讀：`overview.md`, `error-handling.md`
2. 依畫面載入對應 Feature 文件的 UI/UX Requirements 區段
3. E07 重點：F048 雙頁籤、F061 確認對話框、F062 Polling 進度、F066 三分頁快照、F067 比對視圖

### DevOps Agent
1. 必讀：`nfr.md`（含 NFR-003/004/005 E07 效能）
2. 視需求：`architecture-spec.md` §3.10 E07 Assignment Module

### E07 TDD Developer
1. 必讀：本索引 + `architecture-spec.md` §3.10（AD-E07-1~3）+ `data-model.md#e07-data-model` + `error-handling.md#assignment-errors`
2. 必讀圖表：`F061-assignment-run-flow.mmd`, `F061-assignment-run-states.mmd`, `F066-snapshot-detail-flow.mmd`, `F067-run-comparison-flow.mmd`
3. 依 M01→M06 順序實作（參見「TDD Agent 建議順序」E07 段）

---

## 優先級分類

### P0-MVP（Must Have）

**E01~E06 既有**（37 個）：
F001, F002, F003, F004, F005, F006, F008, F009, F010, F011, F012, F013, F015, F017, F018, F019, F020, F021, F022, F023, F026, F027, F028, F029, F030, F031, F032, F036, F037, F038, F039, F042, F043, F044, F045, F046, F047

**E07 新增**（42 個，2026-05-14 M02 計分設定擴充 +4，2026-05-15 M07 角色 + M06 進階 +4，2026-05-15 重構批次 2 +1，2026-05-15 重構批次 3 +1 含 F059 標 DEPRECATED，2026-05-15 重構批次 4 +3 含 F060 標 DEPRECATED，2026-05-15 重構批次 5 +4 含 F058 標 DEPRECATED，2026-05-15 重構批次 6 +4 M03c/d）：
F048, F049, F050（v2.0.1）, F051（v2.0）, F052（v2.0）, F053, F054, F055, F056, F057（v1.1）, ~~F058（v2.0 DEPRECATED）~~, ~~F059（v2.0 DEPRECATED）~~, ~~F060（v2.0 DEPRECATED）~~, F061（v1.2）, F062, F063, F064, F065, F066, F067, F068, F069, F070, F071, F072, F073, F074, F075, F076（v1.1）, F077, **F078**, **F079（v1.1）**, **F080（v1.1）**, **F081（v1.1）**, **F082（v1.3）**, **F083（v1.2）**, **F084（v1.2）**, **F085（v1.2）**, **F086（v1.1）**, **F087（v1.1）**, **F088（v1.1）**, **F089（v1.1）**, **F098（v1.0 / AD-E07-28 P1）**, **F099（v1.0 / AD-E07-28 P2）**, **F100（v1.0 / AD-E07-28 P3）**, **F101（v1.0 / Stage 3/4 真實比例分派）**

**P0-MVP 總計：79 個 Feature**（37 既有 + 43 E07 新增 - 1 既有 F058 計入但已標 DEPRECATED 不再實作；實際新建構數 37 既有 + 42 E07 = 79。F058 / F059 / F060 標 DEPRECATED 之既有計算保留於索引以供脈絡追溯，但不重複實作）

### P1（Should Have）— 9 個 Feature

F007（停用／啟用帳號）, F014（刪除資料來源）, F016（狀態監控儀表板）, F024（擷取監控儀表板）, F025（刪除擷取任務）, F033（Pipeline 版本管理）, F034（刪除 Pipeline）, F035（Pipeline 監控儀表板）, F040（Inspector Panel 欄位 Diff）

### P2（Nice to Have）— 1 個 Feature

F041（Badge Hover Tooltip）

---

## 依賴鏈

```
E01（驗證）──封鎖──> E02（帳號管理）
E01（驗證）──封鎖──> E03（資料來源管理）
E01（驗證）──封鎖──> E04（資料擷取管理）
E01（驗證）──封鎖──> E05（ETL Pipeline 管理）
E01（驗證）──封鎖──> E06（Customer 360）
E01（驗證）──封鎖──> E07（客戶名單分派）
E02（角色管理）──封鎖──> E07（業務主管旗標 is_sales_manager）
E03（資料來源管理）──封鎖──> E04（資料擷取管理）
E04（資料擷取管理）──封鎖──> E05（ETL Pipeline 管理）
E04（資料擷取管理）──封鎖──> E07（ob_pool_data 由 E04 匯入）

F001/F002 ──> F003（登出需登入）
F045 ──> F004, F005, F008（角色 Seed Data）
F045 ──> F048, F061（業務主管旗標）
F004 ──> F005 ──> F006, F007, F008, F010
F004 ──> F009
F011 ──> F012 ──> F013, F014
F011 ──> F015 ──> F016
F017 ──> F018 ──> F019, F025
F017 ──> F020, F021 ──> F022, F023, F024, F026
F027 ──> F028 ──> F029 ──> F030, F033, F036
F028 ──> F031, F034
F030 ──> F032, F035, F037
F037 ──> F031（發布後才能啟用）
F029 ──> F039（Badge 依賴編輯器畫布）
F039 ──> F040（欄位 Diff 共用計算邏輯）
F039 ──> F041（Tooltip 依賴 Badge）
F040 ──> F041（點擊查看完整導向欄位流分頁）
F030 ──> F042（執行引擎替換模擬邏輯）
F042 ──> F043（節點執行器依賴引擎框架）
F042 ──> F044（Target Load 依賴引擎框架）
F043 ──> F044（Target Load 依賴上游節點輸出）
F036 ──> F044（目標表 schema 定義）
F036 ──> F046（customer_core 85 欄位 Schema）
E01 ──> F046（使用者驗證）
F044 ──> F046（ETL TargetLoad 資料已載入）
F046 ──> F047（客戶清單為 360 詳情主要入口）

# E07 依賴鏈
F002 v1.3 §4.6 ──權威定義──> F073, F074, ~~F068~~（DEPRECATED v1.3）, F055, F069~F072, F075 v1.5, F076 v1.5（E07 角色矩陣）
F073 ──> F074（處長以部長為對比基準）、F075 v1.5、F076 v1.5、~~F068 v1.2~~（DEPRECATED v1.3）、F055 v1.6（部長 / 處長 Guard 行為導入）
F074 ──> ~~F068 v1.2~~（DEPRECATED v1.3 / 改參照 F075 v1.5 + F076 v1.5）、F055 v1.6（M02 處長 Nav 完全不可見 cross-ref）
F075 v1.5 ──> F076 v1.5（categorical 欄位可選值掛父表；v1.5 新增 case_status 父表條目）、F050 v2.1 / F051 v2.1（新名單動態篩選欄位來源；含 caseyear / case_status / prod_kind / spec_tp / settle_src / list_type 6 欄）
F076 v1.5 ──> F050 v2.1 / F051 v2.1（新名單多選元件選項來源；caseyear 8 筆 0~6 + 99、case_status 4 筆 01/02/03/04、prod_kind 3 筆、spec_tp 52 筆 OBMCODEDF dump（TBL_ID='12'）、settle_src 2 筆、list_type 3 筆）
~~F068~~（DEPRECATED v1.3 / 2026-05-20 / F050 v2.1 重構 / J2） ──> ~~F050, F051~~（v2.1 已移除 F068 引用，改引 F075 v1.5 + F076 v1.5）
F048 v2.0 ──> F077（互動補強：月份切換 + 階段總覽）
F048 v2.0 + F077 ──> F049（Stage 0 估算於清單頁觸發）
F048 v2.0 + F077 ──> F050 v2.1, F051 v2.1, F052, F060（清單頁為入口；操作按鈕渲染依 F077 角色 × 階段矩陣）
F077 ──> F050 v2.1（新建名單預設 stage = 'draft'）、F052 v2.0（停用僅在草稿階段）、F061（月跑前置條件 stage = 'ready'）、F078（草稿推進）、後續批次 4+ Rollback / 簽核 spec
F050 v2.1 ──> F051 v2.1, F052, F078, F060（需先有草稿名單才能編輯/停用/推進/設定比例）
F050 v2.1 + F078 + F059 程式碼移除 ──原子性上線（I-1）──> 受 feature flag ENABLE_E07_REFACTOR_PHASE3 統一控制；違反順序回 500 LIST_DRAFT_ADVANCE_BLOCKED_LEGACY_F059
F050 v2.1 ──取代──> ~~F059~~（per-LIST_NO `cr_enabled` 取代全域 OBASSIGNSET CR 開關；US-120 spec 落差修正）
F075 v1.5, F076 v1.5 ──> F050 v2.1（動態篩選條件欄位來源 + categorical 可選值來源；含 caseyear / case_status 動態載入；source of truth = condition_payload）

# E07 重構批次 4 — M03a 部門比例設定（2026-05-15）
F078 ──> F079（推進至 dept_ratio 後才能設定部門比例）
F079 ──> F080（部門比例加總 = 100% 才可推進至個別業務比例設定）
F079 ──> F081（Rollback 至草稿時清空 ob_dept_pct）
F080 ──> F082（推進至 personnel_ratio 後才能設定個別業務比例）
F081 ──> F050 v2.0 / F051 v2.0 / F052 v2.0 / F078（Rollback 後重新可用）
F079 / F080 / F081 ──取代──> ~~F060~~（限 stage = 'dept_ratio' + 部長 + Admin + I-8 容忍誤差語意；DEPRECATED v2.0）
F079 / F080 / F081 ──共用 service helper──> StageTransitionService.assertStageEquals / advanceTo / rollbackTo + RatioValidationService.assertSumEquals100 + assertEachInRange（system-architect 抽出，與後續 M03b/c/d 共用）
F079 / F080 / F081 ──[ASSUMPTION] 與 F050 v2.0 §13 同套 ENABLE_E07_REFACTOR_PHASE3 flag gating──> 詳見 OQ-E07-37

# E07 重構批次 5 — M03b 個別業務比例（2026-05-15）
F080 ──> F082（推進至 personnel_ratio 後處長 / 部長 / Admin 設定業務員比例）
F079 / F080 ──> F082（前置 ob_dept_pct 加總 = 100% 為 F082 寫入前置條件）
F082 ──> F083（獎懲快速模板為 F082 之 UI 子模組；計算結果透過 F082 PUT 儲存）
F082 ──> F084（per-DEPT 加總 = 100% 為推進至 approval 之前置條件）
F082 ──> F085（Rollback 清空 ob_empl_set 跨轄區所有紀錄）
F084 ──> F086 / F087（推進至 approval 後可核准或拒絕）
F085 ──> F079 / F080（Rollback 後重新可寫入 / 重新推進）
F082 / F083 / F084 / F085 ──取代──> ~~F058~~（限 stage = 'personnel_ratio' + 處長轄區 Guard + per-DEPT 加總 + 獎懲模板獨立；DEPRECATED v2.0）
F082 / F084 ──共用 service helper──> SectionChiefScopeGuard（新）+ PersonnelRatioValidationService.assertDeptSumEquals100 / assertAllDeptsSumEquals100（system-architect 抽出，與後續 M03d 共用）
F085 ──共用 service helper──> StageTransitionService.rollbackTo cleanupFn = DELETE ob_empl_set WHERE list_no（與 F081 共用 helper）
F082 / F083 / F084 / F085 ──[ASSUMPTION] 與 F050 v2.0 §13 同套 ENABLE_E07_REFACTOR_PHASE3 flag gating──> 詳見 OQ-E07-37

# E07 重構批次 6 — M03c 簽核 + M03d 準備完成（2026-05-15，最後一批）
F084 ──> F086（推進至 approval 後部長 / Admin 核准 → ready）
F084 ──> F087（推進至 approval 後部長 / Admin 拒絕 → personnel_ratio + 清空 ob_empl_set）
F086 ──> F088（核准後名單出現於 ready 清單供查詢）
F086 ──> F061 v1.1（核准後 stage = 'ready'，月跑前置條件 BR-6 達成）
F086 ──> F089（核准後可 Rollback 至 approval）
F087 ──> F082 v1.1（拒絕觸發 banner 顯示於 F082 頁面，OQ-E07-21 落地；資料來源 GET response latestRejection 欄位）
F088 ──> F061 v1.1（monthlyRunReady.allReady 為月跑前置條件 1 之核心入口）
F088 ──> F089（提供「退回簽核」按鈕入口）
F089 ──> F086 / F087（Rollback 後重新可核准 / 拒絕）
F089 ──連動──> F088 monthlyRunReady 即時更新（從 ready 清單移出）+ F082 latestRejection = null（清空 assignment_approval）
F086 / F087 ──共用 DB 表──> assignment_approval（新建表，data-model #assignment_approval）
F086 / F087 ──共用 service helper──> StageTransitionService 擴充 advanceTo + 新增 rejectTo（含 postActionFn = INSERT assignment_approval；建議由 system-architect 抽出）
F089 ──共用 service helper──> StageTransitionService.rollbackTo cleanupFn = DELETE assignment_approval WHERE list_no（與 F081 / F085 共用 helper）
F088 ──新建 helper──> MonthlyRunReadinessService.calculateReadiness(workYm)（建議由 system-architect 抽出）
F086 / F087 / F088 / F089 ──[ASSUMPTION] 與 F050 v2.0 §13 同套 ENABLE_E07_REFACTOR_PHASE3 flag gating──> 詳見 OQ-E07-37
F057 v1.1 ──分工──> F088（F057 流程外快速查詢；F088 流程內最終確認）
F061 v1.1 ──取代──> ~~OBASSIGNSET 全域 CR 路徑~~（Stage 3 改讀 per-LIST_NO ob_list_definition.cr_enabled，對齊 F050 v2.0 / F059 廢棄）
~~F068~~（DEPRECATED v1.3 / 2026-05-20）──> F069（PROD_KIND 代碼為 CARD_TYPE 綁定來源）— **待 Phase 3a 評估**（拍板 Q2）：F069~F072（CARD_TYPE CRUD 4 個 spec）對 PROD_KIND 來源描述是否改引 F075 v1.5 + F076 v1.5，本輪 spec-writer 不擅自改寫該 4 份 spec 內文
F069 ──> F070, F071, F072（CARD_TYPE CRUD 鏈）
F069 ──> F053, F054, F055, F056（Tab 1 selectedCardType 驅動 Tab 2~5 篩選）
F070 ──> F054, F055, F056（新建 CARD_TYPE 後才能設定維度 / CARD_LEVEL / TIER 對應）
F053 ──> F054, F055, F056（需先查看現有設定）
F055 ──> F056（TIER 對應依賴 CARD_LEVEL）
F057 ──> F058（編輯需先查看）
F048, F050, F054, F055, F056, F058, F059, F060 ──> F061（月跑前置條件）
E04 + E05 雙層 ETL ──> F061（ob_pool_data / ob_emphire / ob_calendar 由 E04 抓 raw → E05 Pipeline TargetLoad 載入，AD-E07-12）
F061 ──> F062（進度查詢）、F063（結果摘要）、F064（匯出）、F065（歷史清單）
F065 ──> F066（快照詳情入口）
F066 ──> F067（比對需讀取個別快照）
```

---

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-06 | 初版建立，33 份文件索引完成 | Spec Writer Agent |
| 2026-03-17 | 新增 E04 資料擷取管理 9 個 Feature（F017-F025）、3 個圖表、更新支援文件 | Spec Writer Agent |
| 2026-03-18 | E04 raw data 落地重大更新：`target_table` -> `source_table`、動態建表、批次寫入、新增 F026 查看擷取資料預覽、新增 NFR-002.9/002.10/002.11 | Spec Writer Agent |
| 2026-03-18 | E04 來源資料表選擇方式變更：`source_table` 單一欄位拆分為 `source_schema` + `source_table`；新增 Datasource Schema/Table 查詢 API 端點；F017/F019 新增動態載入下拉選單；新增 DATASOURCE_SCHEMA_LOAD_FAILED / DATASOURCE_TABLE_LOAD_FAILED 錯誤碼 | Spec Writer Agent |
| 2026-03-19 | 新增 E05 ETL Pipeline 管理 10 個 Feature（F027-F036）、6 個圖表、更新支援文件（data-model、error-handling、scope、overview、open-questions） | Spec Writer Agent |
| 2026-03-23 | 新增 F037（發布 Pipeline 版本），對應 US-050；新增錯誤碼 PIPELINE_VERSION_ALREADY_PUBLISHED；更新 P0-MVP 為 29 個 Feature | Spec Writer Agent |
| 2026-03-25 | 新增 F038（孤兒任務回收），對應生產環境 Bug Fix；跨 E04/E05 模組；P0-MVP；更新總文件數為 64 份 | Product Analyst Agent |
| 2026-03-25 | F038 規格審閱完善：統一為標準 Feature 格式、修正 AC-4 移除不存在的 error_message 引用、OQ-3 決策（回收失敗不中止啟動）反映至 BR-11/AC-10/替代流程、新增 NFR-002.12 孤兒回收效能、來源 Story 修正為 US-051、OQ 編號對齊全域序列（OQ-39~41）、新增假設 A31~A33 | Spec Writer Agent |
| 2026-03-25 | F036（US-049）重大更新：4 個目標表縮減為 1 個（customer_core 約 45 欄位）、新增來源資料表定義（ZZIP_BAMCUST_M + MLMCUSTOMER）、新增 ETL 轉換規則（電話合併/衝突解決/代碼描述/型別轉換）、新增依賴（US-030/US-042）、更新 data-model/scope/overview/open-questions、新增 target-table-etl-flow 圖表、文件總數 65 份 | Spec Writer Agent |
| 2026-03-27 | 新增 F039（節點欄位 Badge, P0）、F040（Inspector Panel 欄位 Diff, P1）、F041（Badge Hover Tooltip, P2）；新增 2 個圖表（F039 資料流、F041 互動時序）；US-042 編輯器功能擴充三階段規格；文件總數 70 份 | Spec Writer Agent |
| 2026-03-27 | 新增 F042（ETL 執行引擎核心框架）、F043（ETL 節點執行器 7 種）、F044（Target Load + UPSERT）；新增 1 個圖表（F042 引擎流程）；對應 US-055/056/057；P0-MVP 增至 34 個 Feature；文件總數 74 份 | Spec Writer Agent |
| 2026-03-31 | Lookup 節點雙輸入重設計：F029 新增 AC-7a~7d（Lookup 雙輸入 UI）與更新 JSON schema；F043 新增第 8 種節點執行器 LookupExecutor（雙輸入模式 + 向下相容），新增 AC-18~AC-24；對應 US-058 | Spec Writer Agent |
| 2026-04-02 | E02 角色擴充：新增 F045（業務角色定義，US-017）；更新 F004/F005/F006/F008 支援 8 種角色（2 系統 + 6 業務）；新增 Role 實體至 data-model；新增 ROLE_MODIFICATION_FORBIDDEN/ROLE_NOT_FOUND 錯誤碼；更新 VALIDATION_INVALID_ROLE 訊息；P0-MVP 增至 35 個 Feature；文件總數 75 份 | Spec Writer Agent |
| 2026-04-13 | 新增 E06 Customer 360：F046（客戶搜尋與清單，US-060）、F047（單一客戶 360 詳情，US-061）；新增 2 個圖表（F046 搜尋流程、F047 詳情載入流程）；新增 C360_CUSTOMER_NOT_FOUND / C360_SEARCH_MIN_LENGTH 錯誤碼；更新 NFR-002.5 受影響功能；解決 G-01~G-08 所有缺口；P0-MVP 增至 37 個 Feature；文件總數 79 份 | Spec Writer Agent |
| 2026-04-24 | E02 `is_sales_manager` 旗標同步：F001 v1.1、F002 v1.1、F004 v3.1、F005 v3.1、F006 v2.1、F008 v3.1 更新，對應業務主管旗標與 Token Blocklist 處理 | Spec Writer Agent |
| 2026-04-24 | 新增 E07 客戶名單分派 21 個 Feature（F048~F068）+ 5 個圖表（F049/F061 flow+states/F066/F067）；新增 ASSIGNMENT 領域錯誤碼區段（LIST_NO_LIMIT_EXCEEDED / LIST_NO_DUPLICATE / ASSIGNMENT_RUN_ALREADY_RUNNING 等 20+ 項）；新增 NFR-003（月跑執行效能 < 30 min）、NFR-004（快照原子性 ACID）、NFR-005（分派結果準確性 < 3%，F067 為主驗收工具）；更新 scope/overview/open-questions；F067 優先級由 Should Have 升級為 P0-MVP；Feature 順序重排為 E01→E02→E03→E04→E05→E04/E05 跨模組→E06→E07；P0-MVP 增至 58 個；文件總數 104 份 | Spec Writer Agent |
| 2026-05-04 | 修正 F056 TIER_LEVEL 對應表資料來源誤標為 `ob_levelcard_level`，實際應為 `ob_tier`（OBTIER 舊表，SP `reference/SP/Stage2_依照CardType分類TierLevel.sql` 證據）；data-model.md 新增 `ob_tier` 假設定義（含 anchor `#ob-tier-entity`、SP 推論依據對照表、與 `ob_levelcard_level` 用途差異說明）；F056 升至 v1.1（API schema 改為 `cardType/cardLevel/tierLevel`、複合 PK `(card_type, card_level)`、acceptance criteria 對齊 ob_tier 寫入語意）；open-questions 新增 OQ-E07-14（OBTIER schema 待索取）+ 假設 A53 | Spec Writer Agent |
| 2026-05-04 | OBEMPHIRE / OBCALENDAR 採 E04 通用擷取任務同步至 AppDB（`ob_emphire` / `ob_calendar`）；data-model.md 新增 `ob_emphire`（含 anchor `#ob-emphire-entity`、PK 補建 `emp_id`、`(dept_code)` / `(resign_date)` 索引）與 `ob_calendar`（含 anchor `#ob-calendar-entity`、`rest_flg` 為 VARCHAR(1)）兩張表正式定義；F049（Stage 0 工作日表）/ F058（員工下拉清單）/ F061（Stage 4 員工 join）/ F063（部門 / 員工分布資料來源）/ F064（員工姓名 join）內 `[ASSUMPTION]` 升級為 Resolved；scope.md 補入 E04 擷取範圍涵蓋 OBPOOLDATA / OBEMPHIRE / OBCALENDAR；open-questions 新增 OQ-E07-15（同步機制決議），同時解決 OQ-E07-10 與 OQ-E07-12，假設 A50 / A52 標為 Resolved | Spec Writer Agent |
| 2026-05-05 | OBTIER schema 已取得（`reference/TableSchema/OB/OBTIER.sql`）→ data-model `ob_tier` 修正型別與欄位（移除推論的 6 個稽核欄位、補入 `list_nm` VARCHAR(30) NULL、`card_type` / `card_level` 修為 VARCHAR(5)）；OQ-E07-14 / 假設 A53 標為 ✅ Resolved；新增假設 A54（PK `(card_type, card_level)` 為遷移時補建）保留 [ASSUMPTION]；F056 升至 v1.2（補入 `listNm` 欄位、cardType/cardLevel 約束、新增 BR-7 稽核策略）。ARRETURNDF schema 已取得（`reference/TableSchema/ZZIPPROD/ARRETURNDF.sql`，OQ-E07-16 直接 ✅ Resolved）→ 屬 E04 ETL 範圍（OBPOOLDATA 上游來源），**E07 specs 不為個別來源表新增表定義** | Spec Writer Agent |
| 2026-05-05 | dump 資料驗證 9 表（`reference/DumpData/*_20260505.csv`），發現 5 項與 spec 假設差異並修正：(1) `OBLEVELCARD_VERSION` STATUS 欄位遷移補建（原表無，依 SDATE/EDATE 計算初值；data-model 補入欄位 + blockquote，F054/F055 補 BR）；(2) `OBTIER` 接受計分卡體系外的 CARD_TYPE（H/S/E/S5/E5/M/HM/M5 共 8 種，M5 → T5M 為 fallback 規則 CARD_LEVEL 可 NULL；data-model `ob_tier` `card_level` 改回 NULL + PK 補建邏輯更新 `(card_type, COALESCE(card_level, ''))` + Fallback CARD_TYPE 觀察表；F056 新增 AC-4a + BR-8；F061 Stage 2 補 fallback join 語意）；(3) `ob_levelcard_*` 系列稽核欄位 NULL 化驗證（既有設定無誤）；(4) `OBEMPLSETMF.DEPTID_M` 遷移時 RTRIM（dump 觀察 4 字元代碼被 padded 至 50 字元；data-model `ob_empl_set` 補註腳）；(5) `OBMLISTDF` 多值欄位 `$$` 分隔（`prod_kind` / `spec_tp` / `settle_src` / `caseyear`；data-model 補多值欄位儲存規範段落，F050/F051 UI/UX 補多選序列化規範）；OQ-E07-11（OBMCODEDF.SYSTEM_ID）✅ Resolved（dump 全表 = `'OB'`，F068 同步更新）；新增 OQ-E07-17（dump 驗證決議彙整 ✅ Resolved）；假設 A51 / A54 同步更新 | Spec Writer Agent |
| 2026-05-05 | 修正 E04 ETL 描述：`ob_pool_data` / `ob_emphire` / `ob_calendar` 改為 **E04 + E05 雙層 ETL** 流程（AD-E07-12）— E04 通用擷取任務從舊 OB DB 抓取至 raw_{task_id_short} 中介表（既有機制），再由 E05 Pipeline TargetLoad 載入目標表（full replace 模式，沿用 F044 customer_core 機制）；OBEMPHIRE 同步策略改為 **full 全量重抓**（每日重抓全表，員工數 < 1 萬筆無效能壓力）；data-model.md 三表 blockquote 「資料同步機制」更新（`ob_emphire` / `ob_calendar` / `ob_pool_data`）；F049（Stage 0 前置條件 + BR-2 + 假設 A-1）/ F058（BR-6 員工下拉清單來源）/ F061（Stage 0 前置條件 + Stage 4 員工 join + Blocked By）/ F063（BR-5 部門名稱 + ob_emphire 引用）/ F064（員工姓名 join 來源 + 假設 A-1）引用文字對齊；scope.md Epic 依賴圖補入 E05 → E07 封鎖關係 + E04 擷取任務範圍說明改寫為雙層 ETL 描述；E07 整體不新增 ETL Feature（pipeline 設定屬部署文件，由 Admin 於系統初始化建立 E04 + E05 並設定排程） | Spec Writer Agent |
| 2026-05-05 | 修正 E07-C ETL 設計：改為 E04 raw 擷取 + E05 Pipeline TargetLoad 雙層架構（AD-E07-12）；OBEMPHIRE 同步策略改為 full 全量（移除增量同步描述）；E07-F 檢核清單 E 類項目重組為 9 項（E1/E2/E4/E5/E7/E8 為 BLOCKER）；新增 AD-E07-12 架構決策；architecture-spec.md 升至 v2.1；open-questions OQ-E07-15 解決方案補入 E04 + E05 雙層流程說明及引用 AD-E07-12 | System Architect Agent |
| 2026-05-06 | 修正 `ob_pool_data` 結構：移除誤含的 `list_no` 欄位、PK 重設為 `(orgno, appl_no)`（system-architect 並行處理 AD-E07-13），blockquote 補「共享案件池」說明（120 欄無 LIST_NO，per-LIST_NO 候選由 Stage 1 join `ob_list_definition` 篩選條件動態取得），索引重構為 `(orgno, appl_no)` / `(custo_no)` / `(prod_kind)` / `(settle_src)` / `(card_type, card_level)`；F049 AC-4 文字明確化（讀 `ob_list_definition` 取篩選條件後對 `ob_pool_data` 套用 WHERE 子句，非按 list_no 過濾）；F061 / F063 檢視後語意正確不需改。新增 OQ-E07-18（`ob_pool_data` 結構落差，與 system-architect 並行處理）與 OQ-E07-19（`is_sales_manager` 實作完全缺漏 — migration / Entity / Auth Service / JWT payload 全無；spec 描述本身正確無需修改；Open，待 Phase 1 Track A M3 補建） | Spec Writer Agent |
| 2026-05-08 | 修正 ob_pool_data 結構落差（AD-E07-13）：移除 list_no（OBPOOLDATA 來源無此欄）、PK 重設為 `(orgno, appl_no)`；確立 ob_pool_data（L2 共享案件池）與 ob_pool_data_list（L3 分派結果）的「池/結果」分離架構；E07-D 補充 Stage 1 演算法說明（ob_pool_data 無 list_no，per-list 透過 JOIN ob_list_definition 篩選條件取候選）；新增 OQ-E07-18（schema 落差盤點，直接 ✅ Resolved，含 4 項落差處置）；architecture-spec.md 升至 v2.2 | System Architect Agent |
| 2026-05-06 | 清理 data-model `ob_pool_data` 章節殘留：移除 4 個 `ob_pool_data_list` 才有的欄位（`card_level` / `tier_level` / `card_type` / `case_type`）與對應 `(card_type, card_level)` 索引；對齊 AD-E07-13 完整映射 OBPOOLDATA（120 欄 + `_cdmp_extracted_at` = 121 欄，**無 LIST_NO 欄位**）。`ob_pool_data_list` 章節正確列示這些欄位不受影響 | Spec Writer Agent |
| 2026-05-06 | 修正 ob_list_definition.card_type VARCHAR(2) → VARCHAR(5)（dump 含 3 字元值如 SEC/SEB）；對齊 ob_levelcard_* 系列 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 1**（4 個新 spec + 3 個既有 spec 升版 + 連帶更新）：新增 F073（部長角色定義，US-100）、F074（處長角色定義 + `created_by` 轄區限縮，US-101）、F075（POOLDATA 篩選欄位白名單，US-102）、F076（類別型欄位可選值，US-103）；新增 2 個圖表（F073 角色矩陣決策、F075 白名單流程）；F002 升至 v1.3（新增 §4.6 E07 角色矩陣作為權威來源 + Director / SectionChief 應用層角色定義 + 三層 Guard 規格）；F068 升至 v1.2（補 BR-6 處長禁用寫入 + 處長視圖規則）；F055 升至 v1.6（補 BR-10 處長對 M02 完全不可見，OQ-C-03 決議）；data-model.md 新增 `field_whitelist`（#field-whitelist-entity）+ `categorical_field_value`（#categorical-field-value-entity）兩表 schema；error-handling.md 新增 `E07_FORBIDDEN_DIRECTOR_ONLY`（403）/ `E07_FORBIDDEN_SECTION_CHIEF_SCOPE`（403）/ `WHITELIST_FIELD_DUPLICATE`（422）/ `WHITELIST_FIELD_NOT_FOUND`（404）/ `OPTION_VALUE_DUPLICATE`（422）/ `OPTION_VALUE_NOT_FOUND`（404）/ `OPTION_FIELD_TYPE_MISMATCH`（422）共 7 個錯誤碼；P0-MVP 增至 66 個 Feature；新增 M07 角色與可見範圍模組（F073/F074）與 M06 進階段落（F075/F076）；TDD 順序前置 F073->F074->F068->F075->F076 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 2 — M01 流程基礎**（1 個新 spec + 1 個既有 spec 升版 + 連帶更新）：新增 F077（月份切換與名單五階段總覽，合併 US-104 + US-105 為單一 M01 入口互動補強 spec）；F048 升至 v2.0（從「查看本月名單定義清單」升版為「M01 名單定義入口（月份 + 階段總覽）」，雙頁籤改由 `stage` 篩選器涵蓋，新增 `stage` / `readonly` / `currentWorkYm` / `selectedYm` 欄位，操作按鈕渲染改依 F077 角色 × 階段矩陣）；新增 2 個圖表（F077-stage-overview 五階段狀態轉換 stateDiagram-v2、F077-month-switch-flow 月份切換 + 唯讀判斷流程）；data-model.md `ob_list_definition` 新增 `stage VARCHAR(20)`（5 值 CHECK constraint）+ `status VARCHAR(10)` 明確定義、新增「舊名單遷移規則（I-5）」段落（既有 OBMLISTDF 全數初始 `stage = 'ready'`）、新增 §`current_work_ym` 規則（每月 1 號 0:00 UTC+8 切換 / ±12 個月範圍 / 後端唯一計算來源）、新增 `(project_workym, stage, status)` 與 `(created_by)` 兩個索引；error-handling.md 新增 `WORK_YM_OUT_OF_RANGE`（422）/ `WORK_YM_INVALID_FORMAT`（422）/ `LIST_HISTORICAL_READONLY`（403）共 3 個錯誤碼；P0-MVP 增至 67 個 Feature；TDD 順序補入 F048 v2.0->F077；下游 F050/F051/F052/F061 將於批次 3 統一補入「歷史月份寫入 → 403」cross-ref 與 `stage` 流轉行為 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 5 — M03b 個別業務比例設定 + F058 廢棄**（4 個新 spec + 1 個既有 spec 標 DEPRECATED + 連帶更新）：新增 F082（個別業務比例設定 / US-112，per-LIST_NO + per-DEPT 業務員 RATION，處長轄區 Guard + 部長 / Admin 跨轄區）、F083（獎懲快速比例模板 / US-113，OQ-E07-20 落地：均等分配 + 相對 ±10/20% 調整 + 邊界阻擋 + 前端計算 + 後端防呆）、F084（推進至簽核 / US-114，多角色 Actor + per-DEPT 加總 = 100% 驗證 + 處長 / 部長 / Admin 三角色推進邏輯 + 無代理處長時部長代推進）、F085（Rollback 至部門比例 / US-115，限部長 + Admin + 跨轄區清空 `ob_empl_set` + 保留 `ob_dept_pct`）；F058 標 DEPRECATED v2.0（保留 v1.0 內容 + 頂部 banner + cross-ref F082 / F083 / F084 / F085）；新增 1 個圖表 F082 個別業務比例整合流程（含轄區 Guard + 模板套用 + advance / rollback）；data-model.md `ob_empl_set` 補入「比例驗證規則（per-DEPT 加總）」「轄區規則（I-3）」「stage 鎖定規則」「FK 級聯規則」「`project_workym` 補建決策」5 個段落；error-handling.md 新增 `PERSONNEL_RATIO_SUM_NOT_100`（422，per-DEPT，取代 `PERSONNEL_RATIO_SUM_INVALID`）/ `PERSONNEL_RATIO_DEPT_NOT_FOUND`（422）/ `PERSONNEL_RATIO_OUT_OF_SCOPE`（403）/ `BONUS_PENALTY_TEMPLATE_INVALID`（422）共 4 個錯誤碼；標 `PERSONNEL_RATIO_SUM_INVALID` 為 DEPRECATED；`STAGE_ROLLBACK_BLOCKED` 補入 F085 為相關功能；`E07_FORBIDDEN_SECTION_CHIEF_SCOPE` 註明 F082 採更具體之 `PERSONNEL_RATIO_OUT_OF_SCOPE`；P0-MVP 增至 74 個 Feature；新增 OQ-E07-40（F083 「相對預設值 vs 相對部門佔比 ÷ 人數」之語意確認，待 PO）；TDD 順序補入 F082 → F083 → F084 → F085；F058 加入「DEPRECATED 不實作」清單；提示批次 6 進入 M03c/d 簽核 + 準備完成 + F061/F057 修訂 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 3 — M01 草稿階段（最高風險批次，含 F059 廢棄與原子性上線約束）**（1 個新 spec + 3 個既有 spec 升版 + 1 個既有 spec 標 DEPRECATED + 連帶更新）：新增 F078（草稿推進至部門比例設定，US-108）；F050 升至 v2.0（重大改寫：取代來源 US-088 → US-106 / US-107 / US-120；Actor 收斂為部長 + Admin；篩選條件改為 F075 白名單動態驅動 + `condition_payload` JSONB 欄位；新增 per-LIST_NO `cr_enabled` 欄位取代 F059 OBASSIGNSET 全域路徑；新增「從上月名單複製」AC-10 OQ-D-01 決議；建立後 `stage = 'draft'`；§13 完整描述原子性上線約束 + feature flag `ENABLE_E07_REFACTOR_PHASE3` gating + 部署順序 T0-T3 + 失敗回滾路徑）；F051 升至 v2.0（僅 `stage = 'draft'` 可編輯篩選條件 + CR 開關；非草稿階段回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`；表單欄位規範指向 F050 v2.0 共用）；F052 升至 v2.0（僅 `stage = 'draft'` 可停用；非草稿階段回 422 `LIST_STAGE_NOT_DRAFT`，提示先 Rollback）；F059 標 DEPRECATED v2.0（保留歷史脈絡與 v1.0 內容、頂部加廢棄 banner、cross-ref F050 v2.0 / F051 v2.0 / F061 / data-model `cr_enabled` / US-120）；新增 2 個圖表（F050-draft-create-flow 含「從上月複製」分支 + feature flag gating；F078-draft-advance-flow 含 6 項前置條件嚴格驗證 + feature flag gating）；data-model.md `ob_list_definition` 新增 `cr_enabled BOOLEAN NOT NULL DEFAULT TRUE` + `condition_payload JSONB NULL` 兩個欄位；新增「草稿階段欄位編輯規則」表格段落（哪些欄位草稿可改 / 推進後鎖定）；新增「從上月名單複製」API 行為規則段落（OQ-D-01）；error-handling.md 新增 `LIST_FILTER_FIELD_NOT_IN_WHITELIST`（422，置於 assignment-list-errors）+ 新增 `assignment-stage-transition-errors` 子段落（4 個錯誤碼：`LIST_STAGE_NOT_DRAFT`、`LIST_STAGE_TRANSITION_FORBIDDEN`、`LIST_DRAFT_NO_CONDITIONS`、`LIST_DRAFT_ADVANCE_BLOCKED_LEGACY_F059`）共 5 個新錯誤碼；P0-MVP 增至 68 個 Feature；依賴鏈補入「F050 v2.0 + F078 + F059 程式碼移除原子性上線（I-1）」、「F050 v2.0 取代 F059」、「F075/F076 ──> F050 v2.0 動態篩選來源」；提示批次 4 進入 M03a 部門比例 + F060 廢棄 | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 6 — M03c 簽核 + M03d 準備完成 + F061/F057 修訂（最後一批）**（4 個新 spec + 3 個既有 spec 升版 + 連帶更新）：新增 F086（部長核准名單 / US-116，簽核 → ready，限部長 + Admin，新建 `assignment_approval` 表）、F087（部長拒絕並退回個別業務比例設定 / US-117，簽核 → personnel_ratio + 跨轄區清空 `ob_empl_set`，拒絕原因必填 1~500 字，OQ-E07-21 用戶決議落地：F082 GET response 補 `latestRejection` 欄位作為 banner 觸發資料來源）、F088（準備完成階段查詢摘要 / US-118，部長 / 處長 / Admin 三角色唯讀，含篩選 / 部門比例 / 個別業務比例 / CR 開關四區塊摘要，處長轄區過濾，月跑前置條件 `monthlyRunReady` 即時計算，與 F086 共用 GET `summary/{listNo}` 端點，與 F057 並存分工）、F089（準備完成 Rollback 至簽核 / US-119，限部長 + Admin，保留設定資料 + DELETE `assignment_approval`）；F082 升至 v1.1（OQ-E07-21 落地：補 §7.x「拒絕 banner 渲染與互動」UI 規範 + GET response 補 `latestRejection` 欄位 + BR-2a「相對 %」UI 顯示語意 OQ-E07-40 落地）；F083 補 BR-2a「相對 %」UI 顯示語意（OQ-E07-40 用戶決議落地）；F061 升至 v1.1（OQ Q6.1=A 用戶決議落地：AC-1 第 2 項新增「所有 active 名單需 `stage = 'ready'`」前置條件 + Stage 3 CR 回分讀取路徑改為 per-LIST_NO `ob_list_definition.cr_enabled` 欄位 + 快照 `config` 內容含 per-LIST_NO `cr_enabled` 取代全域開關 + 新增錯誤碼 `MONTHLY_RUN_BLOCKED_LIST_NOT_READY`）；F057 升至 v1.1（明確「流程外快速查詢入口」定位 + 與 F088 分工說明 + 角色限縮為部長 / 處長 / Admin + 處長轄區過濾 + Response 補 `stage` / `viewerRole` / `isInScope` 欄位 + 「stage 篩選器」+ 「LIST_NO 連結依 stage 跳轉至 F082 / F088 / F048」）；新增 2 個圖表（F086-approval-flow 簽核流程含核准 → ready / 拒絕 → personnel_ratio 兩條分支 + banner 觸發機制；F088-ready-summary 準備完成階段查詢摘要與 Rollback 資訊架構含三角色 × 四區塊 × 月跑前置條件耦合）；data-model.md 新增 `assignment_approval` 表完整 schema（含 PK / FK / 索引建議 / 多次拒絕 / 重複核准場景處理表 / [ASSUMPTION] 4 項待 system-architect 決議）；error-handling.md 新增 `MONTHLY_RUN_BLOCKED_LIST_NOT_READY`（422，含 `details.notReadyLists` 陣列）+ 新增 `assignment-approval-errors` 子段落（3 個錯誤碼 `APPROVAL_INVALID_STAGE` / `APPROVAL_REJECT_REASON_REQUIRED` / `APPROVAL_REJECT_REASON_TOO_LONG`）共 4 個新錯誤碼 + 補 `STAGE_ROLLBACK_BLOCKED` 沿用至 F089 描述 + 補 `E07_FORBIDDEN_DIRECTOR_ONLY` 適用範圍含 F086 / F087 / F089；P0-MVP 增至 78 個 Feature；依賴鏈補入「批次 6 — M03c/d」完整鏈、「F057 v1.1 vs F088 分工」、「F061 v1.1 取代 OBASSIGNSET 全域 CR 路徑」；TDD 順序補入 F082 v1.1->F083->F084->F085->**F086->F087->F088->F089**->F057 v1.1->F061 v1.1；**E07 重構 spec-writer 階段 100% 完成**（剩餘事項移交 system-architect 處理 [ASSUMPTION] 與 helper 抽出 / OQ-E07-37 flag gating 決議 / OQ-E07-40 DB 儲存值語意） | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 4 — M03a 部門比例設定階段（含 F060 廢棄）**（3 個新 spec + 1 個既有 spec 標 DEPRECATED + 連帶更新）：新增 F079（部門比例設定 per-LIST_NO，US-109）/ F080（部門比例設定階段推進至個別業務比例設定，US-110）/ F081（部門比例設定階段 Rollback 至草稿，US-111）；3 個 spec 統一沿用 `DirectorGuard`（部長 + Admin，處長一律 403 `E07_FORBIDDEN_DIRECTOR_ONLY`）；F079 限 `stage = 'dept_ratio'` 寫入（非此階段 422 `LIST_STAGE_TRANSITION_FORBIDDEN`）；F079 比例驗證採容忍 ±0.01% 浮點誤差（沿用 Invariant I-8）；F080 採 7 項前置條件嚴格驗證（沿用 F078 模式）；F081 採嚴格單階 Rollback（不允許跨階捷徑，OQ-E07-26）；F060 標 DEPRECATED v2.0（保留 v1.x 歷史內容、頂部加廢棄 banner + 取代路徑摘要 + 語意變更對照表 + 原子性上線 [ASSUMPTION] 沿用 F050 v2.0 §13 flag gating，OQ-E07-37）；新增 1 個圖表（F079-dept-ratio-flow 整合 F079 / F080 / F081 三 spec 含 advance / rollback / cleanup 子流程 + service 層共用 helper 註記）；data-model.md `ob_dept_pct` 新增「比例驗證規則（I-8）」+「stage 鎖定規則」+「FK 級聯規則 [ASSUMPTION]」3 個段落；error-handling.md 新增 `assignment-ratio-errors` 之 `RATIO_SUM_NOT_100`（取代舊 `RATIO_SUM_INVALID`，後者標 deprecated）+ `RATIO_OUT_OF_RANGE` 共 2 個；新增 `assignment-stage-transition-errors` 之 `STAGE_ADVANCE_PRECONDITION_FAILED`（含 `details.reason` / `details.actualSum`）+ `STAGE_ROLLBACK_BLOCKED`（含 `details.reason` = `already_at_first_stage` / `wrong_source_stage`）共 2 個；總計 4 個新錯誤碼；P0-MVP 增至 71 個 Feature；依賴鏈補入「F079 / F080 / F081 取代 F060」、「F079 / F080 / F081 共用 service helper」、「F079 / F080 / F081 與 F050 v2.0 §13 同套 flag gating [ASSUMPTION]」；spec 中明確要求 system-architect 抽出 `StageTransitionService`（`assertStageEquals` / `advanceTo` / `rollbackTo`）+ `RatioValidationService`（`assertSumEquals100` / `assertEachInRange`）兩個 service helper 供後續 M03b/c/d 共用；提示批次 5 進入 M03b 個別業務比例 + F058 廢棄 | Spec Writer Agent |
| 2026-05-16 | **E07 重構衍生 spec 補修（system-architect Phase 1 / 6 個 PO 決策落地）**（7 份 spec 升版 + 2 個支援文件連帶更新）：F082 v1.1 → v1.2（PO 決議 F082-A：業務員清單從 `resign_date IS NULL` 改為「全取，含已離職員工帶 `isResigned = true` flag」+ UI 顯示「離職」badge + per-DEPT 比例驗算排除離職員工 + 既有 ration 紀錄保留供歷史 + 明確 `appdb.ob_emphire` 由 ETL E07-OBEMPHIRE-Load pipeline 載入；BLOCKING 議題解除）；F083 v1.0 → v1.1（PO 決議 F083-A：模板覆蓋式 — 每次以均等值 100/N 為基準重新計算，非疊加 + UI 顯示目前套用模板名稱 + §12 A-2 [RESOLVED]）；F084 v1.0 → v1.1（PO 決議 F084-A：無代理處長允許推進 + 不增加 `is_proxy_set` 欄位 + 推進條件以 `ob_empl_set` 加總合法為唯一判斷 + AC-9 補 F088 cross-ref + §12 A-6 [RESOLVED]）；F085 v1.0 → v1.1（PO 決議 F085-B：跨轄區清空不需處長同意 + 直接執行 + audit log 完整紀錄 + §12 A-5 [RESOLVED]）；F088 v1.0 → v1.1（補 `personnelRatios[].proxyStatus` schema：`{ isProxySet, setBy, setByRole }` + service 層即時計算 `ob_empl_set.created_by` 對應角色，無需新增 DB 欄位 + UI 顯示「此部門由 {setByRole} 代為設定」標示）；F061 v1.1 → v1.2（PO 決議 OQ-E07-29-A：Stage 2 邊緣 CARD_TYPE HB/SEB/SEC 跳過該案件不拋錯 + `report_payload.skippedCases[]` JSONB 結構 BR-12/BR-13 + 月跑仍 `status = 'completed'` + §8 補警告紀錄行為）；F076 v1.0 → v1.1（PO 決議 F076-C：F075 切換 `field_type` 離開 categorical 時批次 SET `is_active = false` 軟停用，**不 CASCADE 刪除** + 補 `deactivation_reason ENUM('manual', 'field_type_changed') DEFAULT 'manual'` 欄位於 m10 一次到位 + 歷史保留供追溯 + 既有名單月跑沿用 BR-3 不阻擋 + §12 A-5 [RESOLVED]）；error-handling v1.10 → v1.11（新增 `#assignment-run-warnings` 段落 + `RUN_REPORT_SKIPPED_CASES` 警告紀錄（F061 v1.2 引入）+ `WHITELIST_OPTION_INACTIVE` 警告紀錄（F076 v1.1 引入）+ 前端展示建議）；data-model 連帶更新（`assignment_run.report_payload` JSONB 欄位 + 結構範例與欄位說明 + `categorical_field_value.deactivation_reason` ENUM 欄位 + F076 v1.1 BR-7/BR-10 業務規則更新 + `ob_emphire` blockquote 補 ETL pipeline 識別碼 `E07-OBEMPHIRE-Load` 與 F082 v1.2 使用模式說明）；spec-index 升至 v2.15；Feature 版本標註對應更新；**spec-writer 階段補修完成，等用戶確認後可交棒 test-designer 規劃測試策略** | Spec Writer Agent |
| 2026-05-16 | **E07 重構衍生 spec 補修第二輪（system-architect Phase 1 / 6 項風險決議落地）**（11 份 spec 升版 + 3 個支援文件連帶更新 + architecture-spec 元件補登）：F082 v1.2 → v1.3（**決議 #1 全員離職邊界選項 D**：per-DEPT sum=0% 允許 + `PersonnelRatioValidationService.assertDeptSumEquals100()` 短路 return + GET response 補 `activeCount` / `sumValidated` / `allResigned` 欄位 + 新增 AC-14；**決議 #2 503 + `FEATURE_NOT_ENABLED`** 新增 BR-16 + AC-15；**決議 #4 `SectionChiefScopeGuard` method 分支**：GET 不攔截、PUT/POST 攔截 + 新增 §5.x 對照表 + BR-14 改寫 + §12 A-1 [RESOLVED]；**決議 #5 fixture factory 策略**：§11 補測試 Fixture 策略章節（`apps/api/test/fixtures/ob-emphire.fixture.ts` + ob_emphire 必要欄位清單）；**決議 #6 `AssignmentRunGuardService.assertNoRunningRun()` 集中實作**：新增 BR-15 + AC-11 補充 + §11 實作 Checklist 補 5 項；§12 A-6 [RESOLVED]）；F079 v1.0 → v1.1、F080 v1.0 → v1.1、F081 v1.0 → v1.1、F083 v1.1 → v1.2、F084 v1.1 → v1.2、F085 v1.1 → v1.2、F086 v1.0 → v1.1、F087 v1.0 → v1.1、F089 v1.0 → v1.1（統一補入 BR-`AssignmentRunGuardService` cross-ref + Feature Flag fallback 503 BR + 相關 [ASSUMPTION] 升 ✅ Resolved）；F050 v2.0 → v2.0.1（§13.2 Feature Flag Gating [ASSUMPTION] → [RESOLVED]，明確 flag = false 回 503 + `FEATURE_NOT_ENABLED`，統一套用至 F078 / F079~F089）；error-handling v1.11 → v1.12（新增 `#feature-flag-errors` 段落 + `FEATURE_NOT_ENABLED`（503）+ `PERSONNEL_RATIO_OUT_OF_SCOPE` 補「僅適用 PUT/POST；GET 對越權回 200 空陣列」備註 + `ASSIGNMENT_RUN_ALREADY_RUNNING` 補「由 `AssignmentRunGuardService.assertNoRunningRun()` 集中拋出」備註 + 套用範圍清單）；data-model 補修（`ob_list_definition.stage` m12 migration `status != 'inactive'` AND `stage = 'draft'` 範圍規則表 + `ob_emphire` 補 CI fixture 策略指引 / fixture factory 對應 / 必要欄位清單）；architecture-spec §3.10 E07 Assignment Module 補登 6 個共用元件說明：`AssignmentRunGuardService`（新增 / 決議 #6）/ `StageTransitionService` / `PersonnelRatioValidationService`（補全員離職邊界）/ `RatioValidationService` / `FeatureFlagGuard`（補登 / 決議 #2）/ `SectionChiefScopeGuard`（補 method 分支 / 決議 #4）；spec-index 升至 v2.16；Feature 版本標註對應更新；**spec-writer 階段補修第二輪完成，等用戶確認後可正式進入 TDD developer 實作** | Spec Writer Agent |
| 2026-05-16 | **E07 重構衍生 spec 補修第三輪（§E02 整合 PO 三項決議落地）**（5 份 spec 升版 + 3 個支援文件連帶更新）：tdd-implementation 提出 E02 整合範圍，PO 確認 3 個關鍵決議：**(A) 新增專用 PATCH `/accounts/:id/e07-role`** — 沿用 F008 sales-manager-flag 端點對稱模式，不擴充既有 PUT `/accounts/:id`；**(C) Token revoke 沿用 F009 / F010 既有 `password_changed_at` 機制** — 不新建 token blocklist 表、不新增 `AuthService.revokeAllUserTokens(userId)` method，最低跨模組耦合；**(D) `is_sales_manager` 與 `e07_role` 完全並存不遷移** — 兩欄位語意正交，`is_sales_manager` 管「業務主管讀寫權」、`e07_role` 管「E07 月度流程審批層級」，獨立 Guard 檢查可同時存在於同一 user 帳號。本批次：**F073 v1.0 → v1.1**（新增 §5.4「§E02 整合」+ §5.4.2 Token revoke 機制詳述 + 2 個錯誤碼 `ACCOUNT_E07_ROLE_INVALID`（422）/ `ACCOUNT_E07_ROLE_FORBIDDEN`（403）+ BR-9（角色變更入口唯一性）/ BR-10（Token revoke 同步觸發）/ BR-11（正交維度並存）+ AC-7 升級為 [RESOLVED]（明確 `password_changed_at` 比對流程與 audit log 結構）+ §12 假設 A-1 / A-2 升 ✅ Resolved）；**F074 v1.0 → v1.1**（新增 §5.4 沿用 F073 §5.4 規格 + BR-10（正交並存）/ BR-11（Token revoke 同步觸發）+ AC-7 升 [RESOLVED] + §12 假設 A-1 升 ✅ Resolved）；**F002 v1.3 → v1.4**（§4.6 補入「`is_sales_manager` 與 `e07_role` 正交維度說明」+ JWT Payload 補充「`e07_role` claim 型別 + `req.user.e07_role` 暴露」+ E07 模組 × 角色 CRUD 權限矩陣前補「欄位對應 `e07_role` 維度」說明 + E07 應用層角色定義表三欄調整指派入口為 PATCH `/accounts/:id/e07-role` + Guard 規格補 `req.user` 比對寫法）；**F006 v2.1 → v2.2**（功能摘要明確列示「`e07_role` 不在 PUT 範圍」+ BR-9 變更入口為 PATCH `/accounts/:id/e07-role` 專用端點 + 交叉參考補 F073 / F074 + §更新紀錄補建）；**architecture-spec v2.9 → v2.10**（§3.10 Account Service 元件補登 `AccountsService.updateE07Role()` method 完整規格表 + [RESOLVED] `AuthService.revokeAllUserTokens()` 不新增決策說明 + covers list 補入 F073 / F074）；**data-model.md** `users` 表 E07 新增欄位區塊補 `e07_role` 欄位定義（VARCHAR(20) NULL，CHECK 限三值）+ 5 條業務規則（`e07_role` 由 Admin 設定 / 並存正交 / 變更觸發 `password_changed_at` / 不在 PUT 範圍 / 對應 PATCH `/accounts/:id/e07-role` 端點）+ 索引建議 `(e07_role) WHERE NOT NULL` + Migration `[ASSUMPTION]` m06 待 system-architect 確認；**error-handling v1.12 → v1.13**（ACCOUNT 領域新增 `ACCOUNT_E07_ROLE_INVALID`（422）/ `ACCOUNT_E07_ROLE_FORBIDDEN`（403）共 2 個錯誤碼）；spec-index 升至 v2.17；F073 / F074 / F002 / F006 版本標註更新；**spec-writer §E02 整合補修完成，等用戶確認後可進入 ui-ux-designer 補 07-account-list.html prototype 對應端點 UI** | Spec Writer Agent |
| 2026-05-17 | **E07 重構 spec 補修第四輪（F075 / F076 v1.3 — 補回 v1.2 救援過程遺失之 PO 決議 F076-C 軟停用機制）**（2 份 spec 升版 + spec-index 連帶更新；data-model / error-handling 已於 2026-05-16 完成不重複動工）：**F075 v1.2 → v1.3**（BR-7 從「保留紀錄不刪除」強化為「service 層批次 SET `is_active = false` + `deactivation_reason = field_type_changed`，同 PATCH transaction」+ AC-6 confirm Modal 文字補「將自動停用 N 個可選值」（N 由 `GET options?active=true` 預查）+ 稽核 details 補 `deactivatedOptionCount` + §7 UI Modal 文字升級 + 與 F076 v1.3 BR-11/BR-12 對齊）；**F076 v1.2 → v1.3**（§5.0 新增概念 schema 區塊明列 `deactivation_reason VARCHAR(30) NULL` ENUM `manual` / `field_type_changed` + AC-6 停用流程 reason 改為必填 textarea 200 字（OQ-E07-21 Resolved）+ §5.1 GET 補 `includeInactive=true` query 供歷史追溯 + §5.3 PATCH 改為「啟用專用」、§5.4 新增 deactivate 專屬端點 `PATCH /:columnName/options/:optionValue/deactivate` + DTO `{ isActive: false, reason: string }` 200 字驗證 + 新增 BR-11（F076-C 批次軟停用）/ BR-12（歷史保留 + `includeInactive` 查詢）/ BR-13（manual 停用 reason 必填）+ 跨參照 data-model `pooldata_field_option.deactivation_reason` + error-handling `WHITELIST_OPTION_INACTIVE` 警告碼）；**data-model.md（無需動工）**：`pooldata_field_option.deactivation_reason VARCHAR(30) NULL` ENUM 規範已於 2026-05-16 第一輪補修時寫入（v1.1 / data-model 行 1973+1984），與本輪 F075/F076 v1.3 spec 完全一致；**error-handling.md（無需動工）**：`WHITELIST_OPTION_INACTIVE` 警告碼已於 2026-05-16 第一輪補修時寫入 `#assignment-run-warnings` 段落（行 322），與本輪 F076 v1.3 cross-ref 完全一致；spec-index 升至 v3.1；**提示：等用戶確認後 TDD 可啟動 B5（含 F076-C 軟停用實作 — F075 service 層批次 UPDATE + F076 deactivate 端點 + reason 必填驗證）** | Spec Writer Agent |
