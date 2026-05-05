---
spec-id: CDMP-OQ
title: 待決事項與開放問題
version: "2.0"
date: 2026-05-05
status: Draft
---

# 待決事項與開放問題

> 本文件彙整所有 SPEC 撰寫過程中識別出的待決事項、假設與開放問題。
> 各問題標註來源 Feature/支援文件，供架構師與產品負責人決策。

## 已解決問題（來自 Stories）

以下問題已於 Product Requirements 階段解決，記錄於此供參考：

| # | 問題 | 決議 | 來源 |
|---|------|------|------|
| R1 | 是否需要「記住我」功能？ | 是，MVP 提供，30 天 Token | E01 epic-brief |
| R2 | 登入失敗次數上限與帳號鎖定？ | MVP 不提供，延後 | E01 epic-brief |
| R3 | Phase 2 是否需要 SSO/LDAP？ | 是，Phase 2 整合 Microsoft Entra ID | E01 epic-brief |
| R4 | 是否需要大量帳號建立（CSV 匯入）？ | 不需要，不納入任何階段 | E02 epic-brief |
| R5 | 帳號建立時是否需要 Email 驗證？ | 不需要，Admin 建立即可使用 | E02 epic-brief |
| R6 | 密碼重設：自助式或 Admin 執行？ | 兩者皆有（F009 + F010） | E02 epic-brief |
| R7 | 資料來源刪除：軟刪除或硬刪除？ | 軟刪除，設定 deleted_at | E03 epic-brief |
| R8 | 自動健康檢查頻率？ | 每 30 分鐘 | E03 epic-brief |
| R9 | MVP 是否需要連線池？ | 不需要，延後 | E03 epic-brief |

## 已解決的開放問題

以下問題已於 SPEC 撰寫階段由產品負責人決策：

### 架構層級

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-1 | Token 失效策略：Blocklist 或 Refresh Token 撤銷？ | **Refresh Token + 短效 Access Token** | F001, F003, F007, F009, F010 |
| OQ-2 | 技術棧選擇：前端框架、後端框架、ORM、資料庫 | **維持技術中立**，由架構師決策 | 全域 |
| OQ-3 | 前端與後端是否為同一 Repository（Monorepo）？ | **是，同一 Repo（Monorepo）** | 開發流程 |
| OQ-4 | AES-256 加密金鑰管理方式 | **使用環境變數**，不硬編碼 | F011, F013, F015 |

### 功能層級

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-5 | 登入 Rate Limiting 具體規則（次數/時間窗口）？ | **5 次/分鐘/IP** | F001, F002 |
| OQ-6 | 帳號編輯是否需要樂觀鎖定（Optimistic Locking）？ | **是，採用樂觀鎖定** | F006, F013 |
| OQ-7 | 角色變更的稽核日誌格式與儲存方式？ | **MVP 移除角色變更稽核日誌**，延後至 Phase 2 | F008 |
| OQ-8 | Email 發送服務選擇（SMTP/SendGrid/其他）？ | **視部署環境決定**（SMTP 或 SendGrid 皆可） | F009 |
| OQ-9 | 儀表板即時更新方式：Polling 或 WebSocket？ | **Polling（30 秒間隔）** | F016 |
| OQ-10 | 健康檢查歷史紀錄保留期限？ | **保留 90 天**，超過自動清理 | F016 |

### 安全層級

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-11 | JWT Secret 輪替策略？ | **支援多 Secret 並行驗證**，實現無停機輪替 | F001, F002, F003 |
| OQ-12 | API 是否需要 CORS 設定？ | **需要** | 全域 |
| OQ-13 | 是否需要 API 版本控制（如 /api/v1/）？ | **先預留**（路由使用 `/api/v1/` 前綴） | 全域 |

## 已解決問題（來自 E04 Stories）

以下問題已於 E04 Product Requirements 階段解決：

| # | 問題 | 決議 | 來源 |
|---|------|------|------|
| R10 | 擷取任務刪除應為軟刪除還是硬刪除？ | 軟刪除，設定 `deleted_at` 時間戳記，日誌保留 | E04 epic-brief |
| R11 | 執行趨勢圖預設顯示範圍？ | 預設 7 天，可切換 14 天 / 30 天 | E04 epic-brief |
| R12 | 排程引擎實作方式？ | 擴展現有 `@nestjs/schedule` 模組 | E04 epic-brief |

## E04 已解決的開放問題

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-14 | 擷取作業的批次大小（batch size）應為多少？ | **預設 1,000 筆/批次**，可於環境變數 `EXTRACTION_BATCH_SIZE` 設定 | F021, F023 |
| OQ-15 | 擷取日誌保留期限？是否需要定期清理？ | **永久保留**，待資料量增長後再決定清理策略 | F022, F024 |
| OQ-16 | 排程引擎觸發時若多任務同時符合條件，是否需限制並發數？ | **暫不限制並發數**，各任務獨立執行；未來可加入全域最大並發數設定 | F023 |
| OQ-17 | 增量擷取的 `last_incremental_value` 資料類型處理？ | **統一以字串儲存**，擷取時依目標欄位類型轉換 | F017, F021 |
| OQ-18 | 擷取失敗是否需要自動重試機制？ | **MVP 不提供自動重試**，失敗後 Admin 手動重新執行 | F021, F023 |
| OQ-19 | 儀表板 Polling 間隔是否需可配置？ | **前端硬編碼 5 秒**，未來可考慮 WebSocket 替代 | F024 |

## E04 來源資料表選擇方式變更 — 已解決問題

以下問題於 2026-03-18 由產品負責人確認：

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-24 | `source_schema` 欄位是否加入 ExtractionTask Entity？還是維持單一 `source_table`？ | **拆分為 `source_schema` + `source_table` 兩個獨立欄位** | F017, F019, F021, F026, data-model.md |
| OQ-25 | `IExtractionExecutor` 需新增 `listSchemas()` 與 `listTables()` 方法，各資料庫類型的實作方式？ | **由各資料庫 Executor 實作**：MySQL 使用 `SHOW DATABASES` / `SHOW TABLES`；PostgreSQL 使用 `information_schema.schemata` / `information_schema.tables`；SQL Server 使用 `sys.schemas` / `INFORMATION_SCHEMA.TABLES`。新增兩個 Datasource Controller 端點：`GET /api/v1/datasources/:id/schemas` 與 `GET /api/v1/datasources/:id/schemas/:schema/tables` | F017, F019, architecture-spec.md |
| OQ-26 | 連線失敗時是否需要手動輸入 fallback？ | **不需要**。連線失敗時一律顯示錯誤訊息，要求使用者修復連線設定後重新嘗試 | F017, F019 |
| OQ-27 | Schema / table 列表是否需要快取機制？ | **不需要**。每次開表單直接向外部資料庫查詢 | F017, F019 |

## E04 Raw Data 落地相關開放問題 — 已解決

以下問題於 2026-03-18 由產品負責人確認，採用建議假設方案：

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-20 | raw data 表的欄位型別映射策略？ | **建立型別映射表**，已知型別精確映射（MySQL→PG, MSSQL→PG），未知型別 fallback 為 `TEXT` | F021, F023, F026 |
| OQ-21 | 變更 `source_schema` 或 `source_table` 後，現有 raw data 表的處理策略？ | **DROP 舊表 + 重建新結構**，下次執行時自動處理 | F019, F021 |
| OQ-22 | raw data 表的磁碟空間管理？ | **MVP 不自動管理**，由 DBA 監控 | F021, F024 |
| OQ-23 | 全量模式 TRUNCATE 失敗後是否需要回復策略？ | **不提供回復**，TRUNCATE 失敗直接標記 failed | F021 |

## E04 來源資料表動態選擇相關開放問題 — 已解決

以下問題於 2026-03-18 由產品負責人確認，採用建議假設方案：

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-28 | 編輯表單的 AC-9 警告提示（變更來源資料表時的 raw data 重建警告）以何種方式呈現？ | **Modal 對話框確認**，需使用者確認才能繼續 | F019 |
| OQ-29 | 編輯表單開啟時需同時發出 2 支 API 請求（schemas + tables），若外部資料庫回應慢，表單顯示會延遲。是否接受此 UX 取捨？ | **接受延遲**，表單載入完成再啟用下拉 | F019 |

---

## 已解決問題（來自 E05 Stories）

以下問題已於 E05 Product Requirements 階段解決：

| # | 問題 | 決議 | 來源 |
|---|------|------|------|
| R13 | 版本管理範疇？ | 完整：查看 + Diff + 回滾 | E05 epic-brief |
| R14 | 發布流程？ | 草稿 -> 測試執行 -> 發布（三階段） | E05 epic-brief |
| R15 | 目標表管理方式？ | 系統預先定義 schema，Load 節點直接選擇 | E05 epic-brief |
| R16 | 草稿可否執行？ | 允許手動測試執行，標記為 test_run，不被排程觸發 | E05 epic-brief |
| R17 | 目標表規劃方法？ | Domain-Oriented 來源驅動設計（Phase 1 MVP 僅 1 個 customer_core，Phase 2/3 待來源接入後擴充） | E05 epic-brief（US-049 v2 修訂） |

## E05 已解決的開放問題

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-30 | Pipeline 排程引擎實作方式？ | **擴展現有 `@nestjs/schedule` 模組** | F030 |
| OQ-31 | Pipeline 執行進度更新方式：Polling 或 WebSocket？ | **Polling（5 秒間隔）**，與 E04 保持一致 | F030, F035 |
| OQ-32 | Pipeline 日誌保留期限？ | **永久保留**，與 E04 ExtractionLog 一致 | F032, F035 |
| OQ-33 | 目標表寫入策略？ | **UPSERT**（以主鍵判斷 INSERT 或 UPDATE） | F036 |
| OQ-34 | 測試執行是否影響正式統計？ | **不影響**，測試執行的 processed_count 不計入 Pipeline 累計統計 | F030, F035 |
| OQ-35 | Pipeline 執行失敗是否需要自動重試？ | **MVP 不提供自動重試**，失敗後 Admin 手動重新執行（與 E04 一致） | F030 |

## E05 相關開放問題 — 已解決

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-36 | Transform 節點的運算式引擎實作方式？（Derived Column 節點的 expression 如何解析執行） | **使用 SQL 層級運算式**，後端將 expression 轉換為 SQL 語句執行 | F029, F030 |
| OQ-37 | 加密脫敏（Masking）節點的 AES 加密金鑰管理？是否與資料來源密碼使用同一金鑰？ | **使用獨立的環境變數 `ETL_MASKING_KEY`**，與資料來源密碼加密金鑰分離 | F029, F030 |
| OQ-38 | Pipeline 執行的最大並發數是否需要限制？ | **暫不限制並發數**，各 Pipeline 獨立執行。未來可加入全域最大並發數設定 | F030 |

## F038 已解決的開放問題

以下問題已於 F038 規格撰寫階段決策：

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-39 | `etl_pipelines` 實體是否有 `error_message` 欄位？ | **不新增欄位**。回收時僅更新 `status = 'failed'`，錯誤原因記錄在 `etl_pipeline_logs.error_message` | F038 |
| OQ-40 | ETL Pipeline 回收後 `status` 應設為 `'failed'` 還是回復為啟動前狀態？ | **統一設為 `'failed'`**，與 extraction tasks 保持一致 | F038 |
| OQ-41 | 應用程式啟動回收失敗時，是否應中止啟動？ | **記錄錯誤日誌但不中止啟動**。回收失敗不應阻止系統提供其他正常服務 | F038 |

## F036（US-049 v2）已解決的開放問題

以下問題已於 US-049 修訂時決策：

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-42 | Phase 1 MVP 應預建幾個目標表？ | **僅建立 `customer_core` 1 個目標表**，來源驅動設計，不預建無法填充的空表 | F036, data-model.md |
| OQ-43 | `customer_core` 的來源資料表為何？ | **ZZIP_BAMCUST_M（核心系統）+ MLMCUSTOMER（行銷/租賃系統）**，以身分證字號/統編為共同鍵 | F036 |
| OQ-44 | 兩來源資料衝突時的解決策略？ | **以 `source_updated_at` 較新者為準**，於 US-042 Pipeline 編輯器 Transform 節點處理 | F036, F029 |
| OQ-45 | 電話欄位佔位值如何處理？ | **過濾為 NULL**，佔位值包含 `00-0000000000`、區碼或號碼全為 0、空字串 | F036 |
| OQ-46 | 代碼欄位（education_code、occupation_code 等）的描述如何取得？ | **`_code` 保留原始代碼，`_desc` 由 US-030 代碼對照表轉換**，於 US-042 Transform 節點處理 | F036, F017 |
| OQ-47 | MLMC 資本額欄位型別轉換？ | **varchar → DECIMAL**，CUSTNOWCAPTIAL 與 CUSTCREATECAPTIAL 均需轉換 | F036 |
| OQ-48 | Badge 計算是否需要 debounce 或 throttle？ | **[ASSUMPTION] 使用 300ms debounce**，避免連線頻繁變更時大量重複計算。需效能測試驗證閾值是否合適 | F039 |
| OQ-49 | `computeNodeOutputColumns` 快取策略？ | **[ASSUMPTION] 以 `nodeId + JSON.stringify(data)` 為 cache key 進行 memoization**。需確認是否會因 data 物件順序不同導致快取失效 | F039, F040 |
| OQ-50 | Tooltip 全域管理方案：React Context vs Zustand? | **[ASSUMPTION] 使用 React Context**，因 Tooltip 狀態僅在 Pipeline Editor 範圍內共享，不需全域 store | F041 |

## 假設清單

以下為 SPEC 撰寫過程中採用的假設，需於架構設計階段驗證：

| # | 假設 | 來源 | 驗證方式 |
|---|------|------|---------|
| A1 | JWT 為 Session 管理的唯一機制 | US-001 Technical Notes | 架構師確認 |
| A2 | ~~系統僅有 Admin 與 User 兩種角色~~ **已更新（2026-04-02）**：系統共 8 種角色（2 系統 + 6 業務），為 Seed Data 不可自訂增減（US-017） | stories/overview.md, US-017 | ✅ 已確認（US-017） |
| A3 | 單一 Admin 即可執行所有管理操作（無分級 Admin） | E02 epic-brief | 產品確認 |
| A4 | 資料來源僅支援三種 RDBMS（MySQL, PostgreSQL, SQL Server） | US-020 | 產品確認 |
| A5 | 密碼規則僅有最小長度 8 字元（無複雜度要求） | US-010, US-015, US-016 | 產品確認 |
| A6 | 前端為 SPA（Single Page Application）架構 | US-003 Technical Notes | 架構師確認 |
| A7 | CDMP 使用獨立的應用資料庫（非管理的資料來源之一） | 系統設計需求 | 架構師確認 |
| A8 | 擷取作業僅支援 SELECT 查詢，不修改來源資料庫 | E04 epic-brief | 架構師確認 |
| A9 | Cron 表達式以 UTC 時區解析，前端顯示時轉換為 UTC+8 | US-036 | 產品確認 |
| A10 | 擷取的批次大小預設 1,000 筆/批次 | 架構設計假設 | ✅ 已確認（OQ-14） |
| A11 | 擷取日誌永久保留 | 架構設計假設 | ✅ 已確認（OQ-15） |
| A12 | MVP 不提供擷取失敗自動重試機制 | 架構設計假設 | ✅ 已確認（OQ-18） |
| A13 | 擷取作業為真正的資料搬移，從外部 DB 讀取資料寫入 CDMP AppDB | E04 epic-brief（更新） | 產品確認 |
| A14 | raw data 表命名規則：`raw_{task_id 前 8 碼}`，由系統自動生成 | US-030, US-034 | 產品確認 |
| A15 | raw data 表不納入 ORM Entity 管理，透過動態 SQL 操作 | 架構設計假設 | 架構師確認 |
| A16 | AppDB 使用 PostgreSQL（raw data 表的型別映射以 PostgreSQL 為目標） | 專案技術棧 | 架構師確認 |
| A17 | raw data 表在任務軟刪除後保留，不自動刪除 | 架構設計假設 | 產品確認 |
| A18 | `source_schema` 與 `source_table` 均透過下拉選單從外部資料來源動態載入選擇，不支援手動輸入 | US-030, US-032 決策 | ✅ 已確認（OQ-26） |
| A19 | Schema / table 列表不使用快取，每次請求即時查詢外部資料庫 | US-030, US-032 決策 | ✅ 已確認（OQ-27） |
| A20 | 連線失敗時不提供手動輸入 fallback | US-030, US-032 決策 | ✅ 已確認（OQ-26） |
| A21 | `IExtractionExecutor` 介面新增 `listSchemas()` 與 `listTables()` 方法 | 架構設計需求 | ✅ 已確認（OQ-25） |
| A22 | ETL Pipeline 排程引擎擴展現有 `@nestjs/schedule` 模組 | E05 epic-brief | ✅ 已確認（OQ-30） |
| A23 | Pipeline 執行進度以 Polling（5 秒間隔）更新 | E05 設計決策 | ✅ 已確認（OQ-31） |
| A24 | Pipeline 日誌永久保留 | E05 設計決策 | ✅ 已確認（OQ-32） |
| A25 | 目標表使用 UPSERT 策略寫入 | E05 設計決策 | ✅ 已確認（OQ-33） |
| A26 | 測試執行不影響正式統計 | E05 設計決策 | ✅ 已確認（OQ-34） |
| A27 | MVP 不提供 Pipeline 執行自動重試 | E05 設計決策 | ✅ 已確認（OQ-35） |
| A28 | Transform 節點運算式使用 SQL 層級執行 | 架構設計假設 | ✅ 已確認（OQ-36） |
| A29 | Masking 節點使用獨立環境變數 `ETL_MASKING_KEY` | 架構設計假設 | ✅ 已確認（OQ-37） |
| A30 | Pipeline 執行暫不限制並發數 | 架構設計假設 | ✅ 已確認（OQ-38） |
| A31 | CDMP MVP 以單一 Node.js 進程運行（無水平擴展/多副本），孤兒回收無需分散式鎖 | F038 設計假設 | 架構師確認 |
| A32 | E04/E05 的執行邏輯均為 fire-and-forget，進程終止即代表執行中止 | F038 設計假設 | 架構師確認 |
| A33 | 回收服務執行時 TypeORM DataSource 已初始化，資料庫連線已就緒 | F038 設計假設 | 架構師確認 |
| A34 | Phase 1 MVP 目標表僅 `customer_core` 1 個，Phase 2/3 目標表待來源系統接入後再建立 | US-049 v2 修訂 | ✅ 已確認（OQ-42） |
| A35 | 兩來源系統（ZZIP_BAMCUST_M / MLMCUSTOMER）以身分證字號/統編為共同鍵 | US-049 v2 來源定義 | ✅ 已確認（OQ-43） |
| A36 | 電話欄位佔位值（`00-0000000000`、全零、空字串）過濾為 NULL | US-049 v2 轉換規則 | ✅ 已確認（OQ-45） |
| A37 | `customer_core` 目標表 85 欄位，分 A~H 八個分類 | US-049 v2 欄位定義 | ✅ 已確認（OQ-42） |
| A38 | Badge 計算使用 300ms debounce 防止效能問題 | F039 設計假設 | 效能測試驗證 |
| A39 | `computeNodeOutputColumns` 結果以 nodeId + data hash 為 key 進行 memo 快取 | F039/F040 設計假設 | 架構師確認 |
| A40 | Tooltip 全域狀態管理使用 React Context（非 Zustand） | F041 設計假設 | 架構師確認 |
| A41 | Badge 計算失敗時靜默降級（不顯示 Badge），不阻斷使用者操作 | F039 設計假設 | 架構師確認 |

## E07 已解決問題（來自 E07 Stories）

以下問題已於 E07 architecture-spec 設計階段，由架構師確認決策：

| # | 問題 | 決議 | 來源 |
|---|------|------|------|
| R18 | OB 資料庫遷移至 AppDB 還是維持讀 SQL Server？ | **遷移至 AppDB（PostgreSQL）**，E04 擷取任務定期匯入，避免跨庫事務與效能風險 | AD-E07-1（architecture-spec） |
| R19 | OB 表的命名規範如何決定？ | **`ob_` 前綴 + snake_case 全小寫**，稽核欄位統一重命名（A_*/U_* → created_*/updated_*） | AD-E07-1 |
| R20 | 月跑（名單分派）執行紀錄需要哪些表？ | **3 張新建表**：`assignment_run`（紀錄）、`assignment_run_snapshot`（config/input_list/result 快照）、`assignment_audit_log`（CRUD 稽核） | AD-E07-2 |
| R21 | assignment_audit_log 保留期限？ | **3 年**，超過由排程任務定期清除（INSERT-only，不可修改） | AD-E07-3 |
| R22 | 業務主管（Sales Manager）如何識別？ | **`users` 表新增 `is_sales_manager BOOLEAN NOT NULL DEFAULT FALSE`**，由 Admin 設定 | AD-E07-1 |
| R23 | 複雜計分邏輯（CARD_LEVEL 計算）如何實作？ | **保留為 PostgreSQL function**，遷移時轉換 SQL Server stored procedure（Q-C 決策） | architecture-spec Section 9.6 |
| R24 | ob_pool_data 來源更新方式？ | **E04 擷取任務定期匯入**（月跑前確保資料新鮮度），非即時同步（Q-B 決策） | architecture-spec Section 9.6 |

## E07 假設清單補充

以下假設為 E07 架構設計階段確認：

| # | 假設 | 來源 | 驗證方式 |
|---|------|------|---------|
| A42 | ob_pool_data 在月跑前由 E04 擷取任務確保資料新鮮度（非即時同步） | architecture-spec AD-E07-1 | 排程設計確認 |
| A43 | CARD_TYPE 欄位遷移沿用舊值（不重新編碼），缺漏值由遷移腳本填入 NULL | architecture-spec AD-E07-1 | 遷移腳本驗證 |
| A44 | OBLEVELCARD 系列表的計分計算邏輯以 PostgreSQL function 實作（移植自 SQL Server SP） | architecture-spec AD-E07-2 Q-C | function 實作驗證 |
| A45 | ~~`ob_levelcard_column` 新增 `status` 欄位以支援停用維度，或由 `card_version` 遞增區分~~ **已解決（2026-05-05）**：採新增 `status VARCHAR(10) NOT NULL DEFAULT 'active'` 欄位（AD-E07-4）；`card_version` 遞增方案放棄 | F054 設計假設 | ✅ 已確認（AD-E07-4） |
| A46 | F054 覆寫式修改不產生新 `card_version`；歷史追溯依賴月跑 config 快照 | F054 設計假設 | 產品確認 |
| A47 | ~~TIER_LEVEL 對應表實際表名（對應舊系統 OBLEVELCARD 主表）由 system-architect 最終確認~~ **已解決（2026-05-05）**：OBTIER schema 已取得（OQ-E07-14）；對應 AppDB 表 `ob_tier` | F056 設計假設 | ✅ 已確認（OQ-E07-14） |
| A48 | ~~CR 回分全域開關實際儲存位置（表名 / 欄位）由 system-architect 確認；映射自舊系統 `OBASSIGNSET`~~ **已解決（2026-05-05）**：採獨立 AppDB 表 `ob_assign_config`（key-value），`config_key = 'cr_reassignment_enabled'`（AD-E07-5） | F059 設計假設 | ✅ 已確認（AD-E07-5） |
| A49 | ~~員工停用機制（`status` 欄位或 `ration = 0`）由 system-architect 最終確認~~ **已解決（2026-05-05）**：採 `ob_emphire.resign_date IS NULL` 為在職判斷唯一條件；不在 `ob_empl_set` 增加 `status` 欄位（AD-E07-6） | F057 設計假設 | ✅ 已確認（AD-E07-6） |
| A50 | ~~F049 工作日/假日表由系統基礎資料或 `ob_calendar` 提供~~ **已解決（2026-05-04）**：採 `ob_calendar`（AppDB），由 E04 通用擷取任務從舊 OB DB `OBCALENDAR` 同步；詳見 OQ-E07-10、OQ-E07-15 與 [data-model.md#ob-calendar-entity](data-model.md#ob-calendar-entity) | F049 設計假設 | ✅ 已確認（OQ-E07-10/OQ-E07-15） |
| A51 | ~~`ob_code_df.system_id` 值為 `'E07'` 或其他固定值~~ **已解決（2026-05-05）**：dump 全表驗證為 `'OB'`（不採 `'E07'`），詳見 OQ-E07-11 | F068 設計假設 | ✅ 已確認（OQ-E07-11） |
| A52 | ~~分派結果匯出（F064）的員工姓名由員工主檔 join 取得~~ **已解決（2026-05-04）**：採 `ob_emphire.emp_nm` join（`ob_pool_data_list.emplid = ob_emphire.emp_id`），`ob_emphire` 由 E04 通用擷取任務從舊 OB DB `OBEMPHIRE` 同步；詳見 OQ-E07-12、OQ-E07-15 與 [data-model.md#ob-emphire-entity](data-model.md#ob-emphire-entity) | F064 設計假設 | ✅ 已確認（OQ-E07-12/OQ-E07-15） |
| A53 | ~~`ob_tier` 表結構（對應舊系統 OBTIER）以 SP join 邏輯推論之最小欄位集合（card_type / card_level / tier_level + 標準稽核欄位）；複合 PK `(card_type, card_level)`~~ **已解決（2026-05-05）**：OBTIER schema 已取得（`reference/TableSchema/OB/OBTIER.sql`），實際為 4 欄（`LIST_NM` / `CARD_TYPE` / `CARD_LEVEL` / `TIER_LEVEL`）全部 NULLABLE、**無 PK 約束、無稽核欄位**；先前推論之 6 欄稽核欄位（A_PRGID / A_USERID / A_SYSDT / U_*）不存在；`card_type` / `card_level` 實際為 `varchar(5)`（非先前推論之 VARCHAR(2) / VARCHAR(1)）。data-model.md `#ob-tier-entity` 已對應修正；E07 內容變更稽核透過 `assignment_audit_log` 統一處理 | F056 / data-model.md 設計假設（SP 來源：`reference/SP/Stage2_依照CardType分類TierLevel.sql`） | ✅ Resolved（OQ-E07-14） |
| A54 | `ob_tier` 遷移至 AppDB 時補建複合 PK `(card_type, COALESCE(card_level, ''))`（dump 觀察存在 `card_level IS NULL` 紀錄如 `M5` → `T5M`，PostgreSQL 15+ 可改採 `NULLS NOT DISTINCT` 索引語法等價表達）；`card_type` / `tier_level` 補上 NOT NULL 約束（原 OBTIER 全部 NULLABLE）；**`card_level` 維持 NULL** 以支援 fallback CARD_TYPE 不分等級對應；`list_nm` 維持 NULLABLE。依據為 SP join 邏輯 `LEFT JOIN OBTIER C ON A.CARD_LEVEL=C.CARD_LEVEL AND B.CARD_TYPE=C.CARD_TYPE` 必須之唯一性保證，並兼容 dump 觀察的 fallback 場景（OQ-E07-17 第 2 項） | F056 / data-model.md 遷移設計 | system-architect 於 E07 遷移腳本確認 |

## E07 已解決 SPEC 層級問題（2026-04-24 本版規格撰寫）

以下為 E07 規格撰寫階段與使用者共同確認的決策：

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-E07-1 | F067「比對兩次執行結果差異」的優先級？ | **升級為 P0-MVP**（原 epic-brief Should Have）。F067 AC-2b 人員配對不一致率為 NFR-005 主驗收工具，為新舊系統一致性驗收的核心手段，必須納入 MVP | F067, NFR-005 |
| OQ-E07-2 | 月跑執行進度 Polling 間隔？ | **3 秒**（與 AD-E07-2 一致；F062 透過環境變數 `ASSIGNMENT_PROGRESS_POLL_INTERVAL_MS` 可配置） | F062 |
| OQ-E07-3 | Stage 0 試算查詢逾時上限？ | **10 秒**；超過回傳 `STAGE0_ESTIMATE_TIMEOUT` 由前端提示稍後再試 | F049 |
| OQ-E07-4 | 分派結果匯出逾時上限？ | **5 分鐘**；超過回傳 `EXPORT_FILE_EXPIRED` | F064 |
| OQ-E07-5 | `ob_dept_pct` 是否有全域比例概念？ | **否**。依 AD-E07-1，`ob_dept_pct` 即為 per-LIST_NO 設定，無全域比例；US-076/077 已於 E07 Story 修訂時刪除為需求誤解產物 | F060 |
| OQ-E07-15 | OBEMPHIRE（員工主檔）與 OBCALENDAR（工作日表）的同步機制？是否由 E07 提供 CRUD 維護？ | **採 E04 通用擷取任務從舊 OB DB 同步至 AppDB**：`OBEMPHIRE` → `ob_emphire`（每日同步，PK 補建 `emp_id`，原表無 PK constraint）；`OBCALENDAR` → `ob_calendar`（每年由舊 OB Admin 維護下年度資料後 ETL 帶入）。E07 不提供 CRUD 維護介面（資料維護於舊 OB 端）。同步策略（CDC vs 全量替換）由 system-architect 於 E04 擷取任務設定時決定。同時解決 OQ-E07-10（F049 工作日表來源）與 OQ-E07-12（F064 員工姓名 join 來源） | F049, F058, F061, F063, F064, data-model.md, scope.md（E04 擷取範圍） |

## E07 已解決的 Story 層級問題（本版標註為 Resolved）

以下為 E07 Story 中的「待解決問題」，已由 architecture-spec.md（2026-04-24 system-architect 決策）全部解決，記錄於此供實作參照：

| # | 問題 | 決議 | 決議日期 | 來源 |
|---|------|------|---------|------|
| OQ-E07-Arch-1 | OB 資料庫架構定位（直連 SQL Server 或遷移至 AppDB） | **方案 C：遷移至 AppDB（PostgreSQL）**，採 `ob_` 前綴 snake_case 命名；E04 擷取任務定期匯入；詳見 architecture-spec §3.10（AD-E07-1）與 data-model.md §E07 資料模型 | 2026-04-24 | epic-brief Q-B |
| OQ-E07-Arch-2 | `OBMLISTDF.STATUS` 欄位如何新增 | **AppDB 新建表 `ob_list_definition` 直接加入 `status VARCHAR(10) NOT NULL DEFAULT 'active'`** | 2026-04-24 | epic-brief Q-1 |
| OQ-E07-Arch-3 | `AssignmentAuditLog` 表設計 | **採納建議設計**（`id` / `action` / `entity_type` / `entity_id` / `operator_id` / `operated_at` / `before_payload` JSONB / `after_payload` JSONB / `ip_address`），存於 AppDB，保留 3 年（AD-E07-3） | 2026-04-24 | epic-brief Q-2 |
| OQ-E07-Arch-4 | LIST_NO 999 上限處理 | **MVP：達上限回傳 422 `LIST_NO_LIMIT_EXCEEDED`**；Phase 2 backlog 評估擴位方案 | 2026-04-24 | epic-brief Q-3 |
| OQ-E07-Arch-5 | per-LIST_NO 部門比例表歸屬 | **使用 `ob_dept_pct`（OBMDEPTPCT 映射），無全域比例概念**；US-076/077 已確認為需求誤解產物並於 E07 Story 修訂時刪除 | 2026-04-24 | epic-brief Q-4 |
| OQ-E07-Arch-6 | CARD_TYPE 舊資料遷移策略 | **遷移時直接沿用現有值**（舊 SP 由 `list_nm` 解析之結果），缺漏筆數由遷移腳本識別處理；新版 UI（F050/F051）改為獨立輸入欄位 | 2026-04-24 | epic-brief Q-A |

## E07 規格層級待確認事項（已全數解決）

以下為本版 SPEC 撰寫過程中識別需進一步確認的事項，**已於 2026-05-05 由 System Architect Agent 全部決議**：

| # | 問題 | 影響範圍 | 決議 |
|---|------|---------|------|
| ~~OQ-E07-6~~ | ~~`ob_levelcard_column` 停用維度機制（新增 `status` 欄位 vs `card_version` 遞增）~~ **已解決（2026-05-05）**：採新增 `status VARCHAR(10) NOT NULL DEFAULT 'active'` 欄位；`card_version` 遞增方案放棄（版本號膨脹且語意混淆）。假設 A45 升級為 Resolved | F054 | ✅ Resolved（AD-E07-4） |
| ~~OQ-E07-7~~ | ~~TIER_LEVEL 對應表實際 schema~~ **已解決（2026-05-05）**：已由 OQ-E07-14 取得 OBTIER schema（`reference/TableSchema/OB/OBTIER.sql`）並完成 data-model.md 修正 | F056 | ✅ Resolved（OQ-E07-14） |
| ~~OQ-E07-8~~ | ~~CR 回分全域開關儲存位置~~ **已解決（2026-05-05）**：採獨立 AppDB 表 `ob_assign_config`（key-value 設計），`config_key = 'cr_reassignment_enabled'`。`ob_assign_set` 為 Stage 0 每日比例輸出，語意不符全域開關儲存。假設 A48 升級為 Resolved | F059 | ✅ Resolved（AD-E07-5） |
| ~~OQ-E07-9~~ | ~~`ob_empl_set` 員工停用機制~~ **已解決（2026-05-05）**：採 `ob_emphire.resign_date IS NULL` 為在職判斷條件，不在 `ob_empl_set` 新增 `status` 欄位（Single Source of Truth：ob_emphire 為 E04 每日 ETL 同步，resign_date 為原生欄位）。假設 A49 升級為 Resolved | F057, F058, F061 | ✅ Resolved（AD-E07-6） |
| ~~OQ-E07-10~~ | ~~Stage 0 工作日表來源~~ **已解決於 OQ-E07-15（2026-05-04）**：採 `ob_calendar`，由 E04 通用擷取任務從舊 OB DB `OBCALENDAR` 同步至 AppDB | F049 | ✅ Resolved（OQ-E07-15） |
| ~~OQ-E07-11~~ | ~~`ob_code_df.system_id` 固定值~~ **已解決（2026-05-05）**：dump 全表驗證 OBMCODEDF.SYSTEM_ID 全為 `'OB'`（路徑：`reference/DumpData/OBMCODEDF_20260505.csv`），E07 寫入 `ob_code_df` 時固定使用 `system_id = 'OB'`（沿用舊值，**不採** `'E07'`）；F068 對應 `[ASSUMPTION]` 升級為 Resolved | F068 | ✅ Resolved |
| ~~OQ-E07-12~~ | ~~分派結果匯出的員工姓名來源~~ **已解決於 OQ-E07-15（2026-05-04）**：採 `ob_emphire.emp_nm` join（`ob_pool_data_list.emplid = ob_emphire.emp_id`），`ob_emphire` 由 E04 通用擷取任務從舊 OB DB `OBEMPHIRE` 同步至 AppDB | F064 | ✅ Resolved（OQ-E07-15） |
| ~~OQ-E07-13~~ | ~~F062 Stage 進度儲存方式（JSONB 欄位 vs 獨立表）~~ **已解決（2026-05-05）**：採獨立 `assignment_run_stage_log` 表（`run_id, stage_no, status, started_at, finished_at, processed_count, error_message`）。JSONB 欄位方案放棄（月跑執行中原子性更新困難、並發寫入風險高、結構化查詢需在應用層解析） | F062 | ✅ Resolved（AD-E07-7） |
| ~~OQ-E07-14~~ | ~~OBTIER 完整 schema 待索取（TIER_LEVEL 對應表）~~ **已解決（2026-05-05）**：OBTIER schema 已取得（路徑：`reference/TableSchema/OB/OBTIER.sql`），共 4 欄 `LIST_NM nvarchar(30) NULL` / `CARD_TYPE varchar(5) NULL` / `CARD_LEVEL varchar(5) NULL` / `TIER_LEVEL varchar(5) NULL`，**無 PK 約束、無稽核欄位**。data-model.md `#ob-tier-entity` 與 F056 已對應修正型別（CARD_TYPE 由推論 VARCHAR(2) → 實際 VARCHAR(5)；CARD_LEVEL 由推論 VARCHAR(1) → 實際 VARCHAR(5)），新增 `list_nm` 描述性欄位，移除推論之 6 個稽核欄位。PK `(card_type, card_level)` 為遷移時補建（[ASSUMPTION]，記入 A54） | F056 / data-model.md `#ob-tier-entity` | ✅ Resolved |
| ~~OQ-E07-16~~ | ~~ARRETURNDF 完整 schema 待索取（USP_OB_OBPOOLDATA 上游來源）~~ **已解決（2026-05-05）**：ARRETURNDF schema 已取得（路徑：`reference/TableSchema/ZZIPPROD/ARRETURNDF.sql`），共 27 欄。**屬 E04 ETL 範圍**（OBPOOLDATA 計算上游來源），**E07 specs 不為個別來源表新增表定義**（E04 為通用機制）；E07 使用之 `ob_pool_data` 為 ETL 後產物，不直接讀取 ARRETURNDF。✅ Resolved | E04 ETL 配置 | ✅ Resolved |
| ~~OQ-E07-17~~ | ~~dump 資料驗證（9 表）發現的 5 項與 spec 假設差異彙整~~ **已解決（2026-05-05）**：依 dump 9 表（`reference/DumpData/*_20260505.csv`）驗證後處置如下 — (1) `OBLEVELCARD_VERSION` 無 `STATUS` 欄位：採選項 B 於遷移時補建 `status VARCHAR(10) NOT NULL DEFAULT 'active'`，依 `(SDATE <= 今日 < EDATE)` 計算初值（與 `ob_list_definition` 設計對齊）；(2) `OBTIER` 接受計分卡體系外的 CARD_TYPE（dump 觀察 8 種：H/S/E/S5/E5/M/HM/M5），其中 `M5` 之 `CARD_LEVEL` 為空字串（fallback 規則 → T5M 不分等級）：`ob_tier.card_level` 改回 NULL，PK 補建邏輯更新為 `(card_type, COALESCE(card_level, ''))`，F056 補入 fallback BR-8 / AC-4a，F061 Stage 2 補入 fallback join 語意；(3) `ob_levelcard_*` 系列稽核欄位 NULL 化（dump 觀察多筆稽核欄位為 NULL；data-model.md 各表稽核欄位已維持 NULL 設定）；(4) `OBEMPLSETMF.DEPTID_M` 雖宣告 VARCHAR(50) 但實際 4 字元被 padded：遷移時 `RTRIM`，AppDB 儲存 trim 後值；(5) `OBMLISTDF` 多值欄位（`PROD_KIND` / `SPEC_TP` / `SETTLE_SRC` / `CASEYEAR`）以 `$$` 分隔字串儲存（與舊系統相容），UI 多選提交時序列化、查詢時三段 `LIKE` 比對、遷移保留原始字串。詳見 data-model.md 對應章節 + F050 / F051 UI/UX 規範 + F054 / F055 BR + F056 AC-4a / BR-8 + F061 Stage 2 描述。同步將 OQ-E07-11（OBMCODEDF.SYSTEM_ID 固定值）標為 ✅ Resolved（dump 全表 = `'OB'`） | data-model.md / F050 / F051 / F054 / F055 / F056 / F061 / F068 | ✅ Resolved |

---

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-06 | 初版建立 | Spec Writer Agent |
| 2026-03-06 | OQ-1 ~ OQ-13 全部解決；OQ-7 決議移除稽核日誌，已同步更新 US-014 與 F008 | Product Owner |
| 2026-03-17 | 新增 E04 相關開放問題 OQ-14 ~ OQ-19、假設 A8 ~ A12、已解決問題 R10 ~ R12 | Spec Writer Agent |
| 2026-03-17 | OQ-14 ~ OQ-19 全部以建議假設確認解決；A10 ~ A12 標記為已確認 | Product Owner |
| 2026-03-18 | 新增 OQ-20 ~ OQ-23（raw data 落地相關）；新增假設 A13 ~ A17 | Spec Writer Agent |
| 2026-03-18 | 新增 OQ-24 ~ OQ-29（來源資料表動態選擇相關）；OQ-24 ~ OQ-27 已解決；新增假設 A18 ~ A21 | Spec Writer Agent |
| 2026-03-18 | OQ-20 ~ OQ-23、OQ-28 ~ OQ-29 全部以建議假設方案確認解決 | Product Owner |
| 2026-03-19 | 新增 E05 相關已解決問題 R13 ~ R17、OQ-30 ~ OQ-35、待決問題 OQ-36 ~ OQ-38、假設 A22 ~ A30 | Spec Writer Agent |
| 2026-03-19 | OQ-36 ~ OQ-38 以建議假設方案確認解決；A28 ~ A30 標記為已確認 | Product Owner |
| 2026-03-25 | 新增 F038 已解決的開放問題 OQ-39 ~ OQ-41、假設 A31 ~ A33 | Spec Writer Agent |
| 2026-03-25 | US-049 v2 修訂：更新 R17 決議（4 表→1 表）、新增 OQ-42 ~ OQ-47（目標表縮減/來源定義/衝突解決/佔位值/代碼轉換/型別轉換）、新增假設 A34 ~ A37 | Spec Writer Agent |
| 2026-03-27 | 新增 F039/F040/F041 相關開放問題 OQ-48 ~ OQ-50、假設 A38 ~ A41（Badge 計算 debounce/快取/Tooltip 狀態管理/降級策略） | Spec Writer Agent |
| 2026-04-24 | 新增 E07 已解決問題 R18 ~ R24（OB 遷移策略/月跑表設計/稽核保留期/業務主管旗標/計分 function 實作）、假設 A42 ~ A44 | System Architect Agent |
| 2026-04-24 | E07 SPEC 撰寫：新增 OQ-E07-1~5（SPEC 層級決策）、OQ-E07-Arch-1~6（Story 層級問題標記為 Resolved）、OQ-E07-6~13（待 system-architect 確認細項）、假設 A45 ~ A52 | Spec Writer Agent |
| 2026-05-04 | 修正 F056 TIER_LEVEL 對應表資料來源：原 spec 誤指為 `ob_levelcard_level`，實際舊系統使用獨立 `OBTIER` 表（SP 證據 `reference/SP/Stage2_依照CardType分類TierLevel.sql`）。新增 OQ-E07-14（OBTIER schema 待索取）與假設 A53（ob_tier 表結構推論依據） | Spec Writer Agent |
| 2026-05-04 | OBEMPHIRE / OBCALENDAR 同步機制決議：新增 OQ-E07-15（採 E04 通用擷取任務同步至 AppDB `ob_emphire` / `ob_calendar`，E07 不提供 CRUD 維護），同時解決 OQ-E07-10（F049 工作日表來源）與 OQ-E07-12（F064 員工姓名 join 來源）；假設 A50 / A52 標為 Resolved；F049 / F058 / F061 / F063 / F064 內 `[ASSUMPTION]` 升級為 Resolved；data-model.md 新增 `ob_emphire`（含 anchor `#ob-emphire-entity`）與 `ob_calendar`（含 anchor `#ob-calendar-entity`）正式表定義；scope.md 補上 E04 擷取範圍涵蓋 OBPOOLDATA/OBEMPHIRE/OBCALENDAR | Spec Writer Agent |
| 2026-05-05 | OBTIER schema 收件（路徑：`reference/TableSchema/OB/OBTIER.sql`）：data-model.md `#ob-tier-entity` 修正欄位（CARD_TYPE / CARD_LEVEL 由推論型別 VARCHAR(2)/(1) 修為實際 VARCHAR(5)；新增 `list_nm` VARCHAR(30) NULL；**移除**先前推論之 6 個稽核欄位 A_PRGID/A_USERID/A_SYSDT/U_*，原表確認無稽核欄位）；OQ-E07-14 與假設 A53 標為 ✅ Resolved；新增假設 A54（PK `(card_type, card_level)` 為遷移時補建，依 SP join 邏輯）保留 [ASSUMPTION]；F056 升至 v1.2，API request/response 補入 `listNm` optional 欄位、cardType/cardLevel 約束改為 maxLength 5、新增 BR-7（`ob_tier` 稽核透過 `assignment_audit_log` 統一處理）。ARRETURNDF schema 收件（路徑：`reference/TableSchema/ZZIPPROD/ARRETURNDF.sql`）：新增 OQ-E07-16 並直接標為 ✅ Resolved，註記屬 E04 ETL 範圍（OBPOOLDATA 上游來源），**E07 specs 不為個別來源表新增表定義** | Spec Writer Agent |
| 2026-05-05 | dump 9 表資料驗證（路徑：`reference/DumpData/*_20260505.csv`）發現 5 項與 spec 假設差異並修正：(1) `ob_levelcard_version` 補加 `status VARCHAR(10) NOT NULL DEFAULT 'active'`（**遷移補建**，原表無；初值由 `(SDATE <= 今日 < EDATE)` 計算），稽核欄位維持 NULL 設定；F054/F055 補入 BR 說明；(2) `ob_tier.card_level` 從 NOT NULL 改回 NULL（dump 觀察 `M5` → `T5M` fallback 紀錄 CARD_LEVEL 為空字串），PK 補建邏輯更新為 `(card_type, COALESCE(card_level, ''))`；ob_tier 章節補入 Fallback CARD_TYPE 觀察表（H/S/E/S5/E5/M/HM/M5 共 8 種），F056 新增 AC-4a（允許 NULL CARD_LEVEL fallback）+ BR-8（fallback 規則）+ API 範例與欄位約束更新；F061 Stage 2 補入 fallback join 語意；(3) `ob_levelcard_*` 系列稽核欄位 NULL 化驗證（dump 觀察多筆為 NULL，data-model 既有設定無誤）；(4) `ob_empl_set.deptid_m` 補入尾隨空白 RTRIM 註腳（dump 觀察 4 字元代碼被 padded 至 50 字元）；(5) `ob_list_definition` 補入「多值欄位儲存規範」段（`prod_kind` / `spec_tp` / `settle_src` / `caseyear` 為 `$$` 分隔字串），F050 / F051 UI/UX 補入多值欄位序列化規範。OQ-E07-11（OBMCODEDF.SYSTEM_ID 固定值）標為 ✅ Resolved（dump 全表 = `'OB'`）；假設 A51 同步 Resolved；A54 更新為含 NULL CARD_LEVEL 處理；新增 OQ-E07-17（dump 驗證決議彙整）並標為 ✅ Resolved | Spec Writer Agent |
| 2026-05-05 | E07 進入開發前架構決策（System Architect Agent）：(1) OQ-E07-6 → AD-E07-4（ob_levelcard_column.status 欄位）✅ Resolved；(2) OQ-E07-8 → AD-E07-5（ob_assign_config 獨立表，CR 開關存 config_key）✅ Resolved；(3) OQ-E07-9 → AD-E07-6（ob_emphire.resign_date IS NULL 為在職判斷）✅ Resolved；(4) OQ-E07-13 → AD-E07-7（assignment_run_stage_log 獨立表）✅ Resolved；新增 AD-E07-8（Stage 0 日比例演算法確認）、AD-E07-9（ob_assign_set 歸屬 L3）、AD-E07-10（fn_calc_tier_level function 簽章）、AD-E07-11（F064 exceljs streaming）；假設 A45/A47/A48/A49 升級為 Resolved；更新 architecture-spec.md 至 v2.0（新增附錄 E07-A~F，含資料來源分層圖、Migration 設計、ETL 設計、月跑執行架構、PostgreSQL function 設計、開發前檢核清單） | System Architect Agent |
