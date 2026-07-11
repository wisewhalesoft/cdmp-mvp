---
spec-id: CDMP-OQ
title: 待決事項與開放問題
version: "2.6"
date: 2026-06-24
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
| R20 | 月名單分派（名單分派）執行紀錄需要哪些表？ | **3 張新建表**：`assignment_run`（紀錄）、`assignment_run_snapshot`（config/input_list/result 快照）、`assignment_audit_log`（CRUD 稽核） | AD-E07-2 |
| R21 | assignment_audit_log 保留期限？ | **3 年**，超過由排程任務定期清除（INSERT-only，不可修改） | AD-E07-3 |
| R22 | 業務主管（Sales Manager）如何識別？ | **`users` 表新增 `is_sales_manager BOOLEAN NOT NULL DEFAULT FALSE`**，由 Admin 設定 | AD-E07-1 |
| R23 | 複雜計分邏輯（CARD_LEVEL 計算）如何實作？ | **保留為 PostgreSQL function**，遷移時轉換 SQL Server stored procedure（Q-C 決策） | architecture-spec Section 9.6 |
| R24 | ob_pool_data 來源更新方式？ | **E04 擷取任務定期匯入**（月名單分派前確保資料新鮮度），非即時同步（Q-B 決策） | architecture-spec Section 9.6 |

## E07 假設清單補充

以下假設為 E07 架構設計階段確認：

| # | 假設 | 來源 | 驗證方式 |
|---|------|------|---------|
| A42 | ob_pool_data 在月名單分派前由 **E04 + E05 雙層 ETL** 流程確保資料新鮮度（非即時同步；E04 抓 raw → E05 Pipeline TargetLoad full replace，AD-E07-12） | architecture-spec AD-E07-12 | 排程設計確認 |
| A43 | CARD_TYPE 欄位遷移沿用舊值（不重新編碼），缺漏值由遷移腳本填入 NULL | architecture-spec AD-E07-1 | 遷移腳本驗證 |
| A44 | OBLEVELCARD 系列表的計分計算邏輯以 PostgreSQL function 實作（移植自 SQL Server SP） | architecture-spec AD-E07-2 Q-C | function 實作驗證 |
| A45 | ~~`ob_levelcard_column` 新增 `status` 欄位以支援停用維度，或由 `card_version` 遞增區分~~ **已解決（2026-05-05）**：採新增 `status VARCHAR(10) NOT NULL DEFAULT 'active'` 欄位（AD-E07-4）；`card_version` 遞增方案放棄 | F054 設計假設 | ✅ 已確認（AD-E07-4） |
| A46 | F054 覆寫式修改不產生新 `card_version`；歷史追溯依賴月名單分派 config 快照 | F054 設計假設 | 產品確認 |
| A47 | ~~TIER_LEVEL 對應表實際表名（對應舊系統 OBLEVELCARD 主表）由 system-architect 最終確認~~ **已解決（2026-05-05）**：OBTIER schema 已取得（OQ-E07-14）；對應 AppDB 表 `ob_tier` | F056 設計假設 | ✅ 已確認（OQ-E07-14） |
| A48 | ~~CR 回分全域開關實際儲存位置（表名 / 欄位）由 system-architect 確認；映射自舊系統 `OBASSIGNSET`~~ **已解決（2026-05-05）**：採獨立 AppDB 表 `ob_assign_config`（key-value），`config_key = 'cr_reassignment_enabled'`（AD-E07-5） | F059 設計假設 | ✅ 已確認（AD-E07-5） |
| A49 | ~~員工停用機制（`status` 欄位或 `ration = 0`）由 system-architect 最終確認~~ **已解決（2026-05-05）**：採 `ob_emphire.resign_date IS NULL` 為在職判斷唯一條件；不在 `ob_empl_set` 增加 `status` 欄位（AD-E07-6） | F057 設計假設 | ✅ 已確認（AD-E07-6） |
| A50 | ~~F049 工作日/假日表由系統基礎資料或 `ob_calendar` 提供~~ **已解決（2026-05-04，2026-05-05 同步機制細化）**：採 `ob_calendar`（AppDB），透過 **E04 + E05 雙層 ETL** 從舊 OB DB `OBCALENDAR` 同步（E04 抓 raw → E05 Pipeline TargetLoad full replace，AD-E07-12）；詳見 OQ-E07-15 與 [data-model.md#ob-calendar-entity](data-model.md#ob-calendar-entity) | F049 設計假設 | ✅ 已確認（OQ-E07-10/OQ-E07-15/AD-E07-12） |
| A51 | ~~`ob_code_df.system_id` 值為 `'E07'` 或其他固定值~~ **已解決（2026-05-05）**：dump 全表驗證為 `'OB'`（不採 `'E07'`），詳見 OQ-E07-11 | F068 設計假設 | ✅ 已確認（OQ-E07-11） |
| A52 | ~~分派結果匯出（F064）的員工姓名由員工主檔 join 取得~~ **已解決（2026-05-04，2026-05-05 同步機制細化）**：採 `ob_emphire.emp_nm` join（`ob_pool_data_list.emplid = ob_emphire.emp_id`），`ob_emphire` 透過 **E04 + E05 雙層 ETL** 從舊 OB DB `OBEMPHIRE` 同步（E04 每日 03:00 抓 raw → E05 03:30 Pipeline TargetLoad full replace，OBEMPHIRE 採 full 全量重抓，AD-E07-12）；詳見 OQ-E07-15 與 [data-model.md#ob-emphire-entity](data-model.md#ob-emphire-entity) | F064 設計假設 | ✅ 已確認（OQ-E07-12/OQ-E07-15/AD-E07-12） |
| A53 | ~~`ob_tier` 表結構（對應舊系統 OBTIER）以 SP join 邏輯推論之最小欄位集合（card_type / card_level / tier_level + 標準稽核欄位）；複合 PK `(card_type, card_level)`~~ **已解決（2026-05-05）**：OBTIER schema 已取得（`reference/TableSchema/OB/OBTIER.sql`），實際為 4 欄（`LIST_NM` / `CARD_TYPE` / `CARD_LEVEL` / `TIER_LEVEL`）全部 NULLABLE、**無 PK 約束、無稽核欄位**；先前推論之 6 欄稽核欄位（A_PRGID / A_USERID / A_SYSDT / U_*）不存在；`card_type` / `card_level` 實際為 `varchar(5)`（非先前推論之 VARCHAR(2) / VARCHAR(1)）。data-model.md `#ob-tier-entity` 已對應修正；E07 內容變更稽核透過 `assignment_audit_log` 統一處理 | F056 / data-model.md 設計假設（SP 來源：`reference/SP/Stage2_依照CardType分類TierLevel.sql`） | ✅ Resolved（OQ-E07-14） |
| A54 | `ob_tier` 遷移至 AppDB 時補建複合 PK `(card_type, COALESCE(card_level, ''))`（dump 觀察存在 `card_level IS NULL` 紀錄如 `M5` → `T5M`，PostgreSQL 15+ 可改採 `NULLS NOT DISTINCT` 索引語法等價表達）；`card_type` / `tier_level` 補上 NOT NULL 約束（原 OBTIER 全部 NULLABLE）；**`card_level` 維持 NULL** 以支援 fallback CARD_TYPE 不分等級對應；`list_nm` 維持 NULLABLE。依據為 SP join 邏輯 `LEFT JOIN OBTIER C ON A.CARD_LEVEL=C.CARD_LEVEL AND B.CARD_TYPE=C.CARD_TYPE` 必須之唯一性保證，並兼容 dump 觀察的 fallback 場景（OQ-E07-17 第 2 項） | F056 / data-model.md 遷移設計 | system-architect 於 E07 遷移腳本確認 |

## E07 已解決 SPEC 層級問題（2026-04-24 本版規格撰寫）

以下為 E07 規格撰寫階段與使用者共同確認的決策：

| # | 問題 | 決議 | 影響範圍 |
|---|------|------|---------|
| OQ-E07-1 | F067「比對兩次執行結果差異」的優先級？ | **升級為 P0-MVP**（原 epic-brief Should Have）。F067 AC-2b 人員配對不一致率為 NFR-005 主驗收工具，為新舊系統一致性驗收的核心手段，必須納入 MVP | F067, NFR-005 |
| OQ-E07-2 | 月名單分派執行進度 Polling 間隔？ | **3 秒**（與 AD-E07-2 一致；F062 透過環境變數 `ASSIGNMENT_PROGRESS_POLL_INTERVAL_MS` 可配置） | F062 |
| OQ-E07-3 | Stage 0 試算查詢逾時上限？ | **10 秒**；超過回傳 `STAGE0_ESTIMATE_TIMEOUT` 由前端提示稍後再試 | F049 |
| OQ-E07-4 | 分派結果匯出逾時上限？ | **5 分鐘**；超過回傳 `EXPORT_FILE_EXPIRED` | F064 |
| OQ-E07-5 | `ob_dept_pct` 是否有全域比例概念？ | **否**。依 AD-E07-1，`ob_dept_pct` 即為 per-LIST_NO 設定，無全域比例；US-076/077 已於 E07 Story 修訂時刪除為需求誤解產物 | F060 |
| OQ-E07-15 | OBEMPHIRE（員工主檔）與 OBCALENDAR（工作日表）的同步機制？是否由 E07 提供 CRUD 維護？ | **採 E04 + E05 雙層架構（AD-E07-12）**：E04 通用擷取任務從舊 OB DB 全量擷取至 `raw_{id}` 中介表（`mode: full`，F021）；E05 Pipeline TargetLoad 讀取中介表以 `fullMode: true` 寫入 AppDB 目標表（F044）。具體流程：`OBEMPHIRE` → `raw_{obemphire_id}` → `ob_emphire`（每日全量 replace，E04 03:00 / E05 03:30 排程錯開）；`OBCALENDAR` → `raw_{obcalendar_id}` → `ob_calendar`（每年由舊 OB Admin 維護後手動觸發 E04→E05）；`OBPOOLDATA` → `raw_{obpooldata_id}` → `ob_pool_data`（月名單分派前手動觸發 E04→E05）。OBEMPHIRE **不採增量同步**（原表無 PK，`U_SYSDT` 增量鍵可靠性未驗證；員工數 < 1 萬無效能壓力）。E07 不提供 CRUD 維護介面（資料維護於舊 OB 端）。同時解決 OQ-E07-10（F049 工作日表來源）與 OQ-E07-12（F064 員工姓名 join 來源） | F049, F058, F061, F063, F064, data-model.md, scope.md（E04 擷取範圍）; 詳見 AD-E07-12 |

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
| ~~OQ-E07-10~~ | ~~Stage 0 工作日表來源~~ **已解決於 OQ-E07-15（2026-05-04，2026-05-05 細化）**：採 `ob_calendar`，透過 E04 + E05 雙層 ETL 從舊 OB DB `OBCALENDAR` 同步至 AppDB（E04 抓 raw → E05 Pipeline TargetLoad full replace，AD-E07-12） | F049 | ✅ Resolved（OQ-E07-15/AD-E07-12） |
| ~~OQ-E07-11~~ | ~~`ob_code_df.system_id` 固定值~~ **已解決（2026-05-05）**：dump 全表驗證 OBMCODEDF.SYSTEM_ID 全為 `'OB'`（路徑：`reference/DumpData/OBMCODEDF_20260505.csv`），E07 寫入 `ob_code_df` 時固定使用 `system_id = 'OB'`（沿用舊值，**不採** `'E07'`）；F068 對應 `[ASSUMPTION]` 升級為 Resolved | F068 | ✅ Resolved |
| ~~OQ-E07-12~~ | ~~分派結果匯出的員工姓名來源~~ **已解決於 OQ-E07-15（2026-05-04，2026-05-05 細化）**：採 `ob_emphire.emp_nm` join（`ob_pool_data_list.emplid = ob_emphire.emp_id`），`ob_emphire` 透過 E04 + E05 雙層 ETL 從舊 OB DB `OBEMPHIRE` 同步至 AppDB（OBEMPHIRE 採 full 全量重抓策略，AD-E07-12） | F064 | ✅ Resolved（OQ-E07-15/AD-E07-12） |
| ~~OQ-E07-13~~ | ~~F062 Stage 進度儲存方式（JSONB 欄位 vs 獨立表）~~ **已解決（2026-05-05）**：採獨立 `assignment_run_stage_log` 表（`run_id, stage_no, status, started_at, finished_at, processed_count, error_message`）。JSONB 欄位方案放棄（月名單分派執行中原子性更新困難、並發寫入風險高、結構化查詢需在應用層解析） | F062 | ✅ Resolved（AD-E07-7） |
| ~~OQ-E07-14~~ | ~~OBTIER 完整 schema 待索取（TIER_LEVEL 對應表）~~ **已解決（2026-05-05）**：OBTIER schema 已取得（路徑：`reference/TableSchema/OB/OBTIER.sql`），共 4 欄 `LIST_NM nvarchar(30) NULL` / `CARD_TYPE varchar(5) NULL` / `CARD_LEVEL varchar(5) NULL` / `TIER_LEVEL varchar(5) NULL`，**無 PK 約束、無稽核欄位**。data-model.md `#ob-tier-entity` 與 F056 已對應修正型別（CARD_TYPE 由推論 VARCHAR(2) → 實際 VARCHAR(5)；CARD_LEVEL 由推論 VARCHAR(1) → 實際 VARCHAR(5)），新增 `list_nm` 描述性欄位，移除推論之 6 個稽核欄位。PK `(card_type, card_level)` 為遷移時補建（[ASSUMPTION]，記入 A54） | F056 / data-model.md `#ob-tier-entity` | ✅ Resolved |
| ~~OQ-E07-16~~ | ~~ARRETURNDF 完整 schema 待索取（USP_OB_OBPOOLDATA 上游來源）~~ **已解決（2026-05-05）**：ARRETURNDF schema 已取得（路徑：`reference/TableSchema/ZZIPPROD/ARRETURNDF.sql`），共 27 欄。**屬 E04 ETL 範圍**（OBPOOLDATA 計算上游來源），**E07 specs 不為個別來源表新增表定義**（E04 為通用機制）；E07 使用之 `ob_pool_data` 為 ETL 後產物，不直接讀取 ARRETURNDF。✅ Resolved | E04 ETL 配置 | ✅ Resolved |
| ~~OQ-E07-17~~ | ~~dump 資料驗證（9 表）發現的 5 項與 spec 假設差異彙整~~ **已解決（2026-05-05）**：依 dump 9 表（`reference/DumpData/*_20260505.csv`）驗證後處置如下 — (1) `OBLEVELCARD_VERSION` 無 `STATUS` 欄位：採選項 B 於遷移時補建 `status VARCHAR(10) NOT NULL DEFAULT 'active'`，依 `(SDATE <= 今日 < EDATE)` 計算初值（與 `ob_list_definition` 設計對齊）；(2) `OBTIER` 接受計分卡體系外的 CARD_TYPE（dump 觀察 8 種：H/S/E/S5/E5/M/HM/M5），其中 `M5` 之 `CARD_LEVEL` 為空字串（fallback 規則 → T5M 不分等級）：`ob_tier.card_level` 改回 NULL，PK 補建邏輯更新為 `(card_type, COALESCE(card_level, ''))`，F056 補入 fallback BR-8 / AC-4a，F061 Stage 2 補入 fallback join 語意；(3) `ob_levelcard_*` 系列稽核欄位 NULL 化（dump 觀察多筆稽核欄位為 NULL；data-model.md 各表稽核欄位已維持 NULL 設定）；(4) `OBEMPLSETMF.DEPTID_M` 雖宣告 VARCHAR(50) 但實際 4 字元被 padded：遷移時 `RTRIM`，AppDB 儲存 trim 後值；(5) `OBMLISTDF` 多值欄位（`PROD_KIND` / `SPEC_TP` / `SETTLE_SRC` / `CASEYEAR`）以 `$$` 分隔字串儲存（與舊系統相容），UI 多選提交時序列化、查詢時三段 `LIKE` 比對、遷移保留原始字串。詳見 data-model.md 對應章節 + F050 / F051 UI/UX 規範 + F054 / F055 BR + F056 AC-4a / BR-8 + F061 Stage 2 描述。同步將 OQ-E07-11（OBMCODEDF.SYSTEM_ID 固定值）標為 ✅ Resolved（dump 全表 = `'OB'`） | data-model.md / F050 / F051 / F054 / F055 / F056 / F061 / F068 | ✅ Resolved |
| ~~OQ-E07-18~~ | ~~`ob_pool_data` 表結構與 OBPOOLDATA 原表落差~~ **已解決（2026-05-08，System Architect Agent）**：OBPOOLDATA（120 欄）**無 LIST_NO 欄位**；ob_pool_data 為共享案件池，PK 確定為 `(orgno, appl_no)`。4 項落差處置如下：(1) **ob_pool_data.list_no 移除** → AD-E07-13 決議（architecture-spec.md E07-A），spec-writer 修正 data-model.md；(2) **is_sales_manager 實作確認** → OQ-E07-19 並行追蹤，spec-writer 確認 F008 / data-model.md / F002 JWT payload；(3) **API 路徑前綴 v1** → 後續批次修正，spec-writer 掃描 E07 Feature 文件確認 `/api/v1/` 前綴；(4) **JWT payload 補 is_sales_manager** → 與第 2 項連動（OQ-E07-19），spec-writer 確認 F002 規格。`scripts/e07-etl-config.json` OBPOOLDATA-Load fieldMappings 中 LIST_NO 映射須在部署前移除（實作端處理，不修改 spec）。ob_pool_data 與 ob_pool_data_list 確立「池/結果」分離架構：ob_pool_data（L2，無 list_no）為案件原始資料；ob_pool_data_list（L3，含 list_no）為 Stage 1 分派結果 | F049 / F061 / data-model.md `#ob_pool_data` / architecture-spec.md AD-E07-13 / scripts/e07-etl-config.json | ✅ Resolved（AD-E07-13） |
| OQ-E07-19 | `is_sales_manager` 旗標 spec 規格完整但實作端完全缺漏：`apps/api/src/**` 全部 grep 不到 `is_sales_manager` 或 `isSalesManager`；migration / Entity / Auth Service / JWT payload 皆無；現行 login 取得的 token 解出來只有 `{userId, role, iat, exp}`（spec F001 v1.1 / F002 v1.1 規定 JWT payload 應含 `is_sales_manager`） | F001（Admin 登入 + JWT payload）/ F002（User 登入 + JWT payload）/ F004（建立帳號 + 旗標欄位）/ F005（查看帳號清單 + 旗標顯示）/ F008（指派／變更角色 + 旗標切換）/ F061（月名單分派觸發 RBAC 檢查）；E07 月名單分派邏輯所有需要 RBAC 判斷之入口均受影響 | **Open（spec 描述本身正確無需修改）**：待 Phase 1 M3 migration 補建 `users.is_sales_manager BOOLEAN NOT NULL DEFAULT FALSE`、Entity 同步補欄位、Auth Service 於 JWT payload sign / verify 時帶入該旗標、F001/F002 Login 流程驗證旗標寫入 token、E07 RBAC guards 驗證 token claim 而非僅查 DB；處置時點：Track A M3（Auth/RBAC Track）+ 後續 implementation phase。實作端落差不影響 spec 文字正確性，spec-writer 不修改任何 Feature 描述 |

## E07 規格層級待確認事項 — case_status 欄位（AD-E07-14 衍生）

以下開放問題源自 2026-05-12 AD-E07-14（LIST_TYPE 語意拆分：list_type 固定常數 `'01'` + 新增 `case_status` 必填多選欄位）之 spec/architecture/UI 更新流程。OQ-E07-20 / OQ-E07-21 / OQ-E07-22 / OQ-E07-23 / OQ-E07-24 **全部 ✅ Resolved（2026-05-12）**，由 System Architect Agent SP 分析 + DB 驗證 + 舊系統前端探查合力結案，**無需業務主管確認即可進入實作**。本節 case_status 衍生開放問題已全數結案。

> 編號歷史備註：architecture-spec.md v2.4（2026-05-12）內部曾將「ob_pool_data 案件結清期別欄位」議題誤編為 OQ-E07-19，與既有 OQ-E07-19（is_sales_manager 旗標實作缺漏）衝突；v2.4.1 已修正為 OQ-E07-20，並由本節集中追蹤。

| # | 問題 | 影響範圍 | 建議方案 / 狀態 |
|---|------|---------|----------------|
| ~~OQ-E07-20~~ | ~~`ob_pool_data` 中與「案件結清期別」對應的原始欄位名稱尚未確認~~  **✅ Resolved（2026-05-12，System Architect Agent）**：對應欄位確認為 **`ob_pool_data.list_type`**（OBPOOLDATA.LIST_TYPE），儲存單值 `'01'`/`'02'`/`'03'`/`'04'`（非 `$$` 分隔）。證據來源：(1) `USP_OB_OBPOOLDATA.sql` 第 189-216 行 CASE WHEN 以 `STA_CODE` / `MATURITY_DT` 計算後賦值 `'01'`（期中）/`'02'`（中結）/`'03'`（滿期含當月）/`'04'`（滿期）至 `LIST_TYPE`；(2) `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` 第 54 行篩選語法 `AND o.LIST_TYPE IN (SELECT field FROM [fn_SplitString_cte] (OBMLISTDF.LIST_TYPE, '$$'))`；(3) DB 驗證 `ob_pool_data.list_type` 僅含 `'01'`(331,577 筆)/'02'(403,504)/'03'(4,711)/'04'(747,903) 四個值，共 1,487,695 筆，無雜質。architecture-spec.md E07-D BR-7 placeholder `<ob_pool_data_case_status_field>` 已替換為 `list_type` | F049 / F061 / architecture-spec.md E07-D BR-7 | ✅ **Resolved（2026-05-12）** |
| ~~OQ-E07-21~~ | ~~`case_status` 多選的篩選邏輯為 OR 還是 AND？~~ **✅ Resolved（2026-05-12，System Architect Agent）**：SP 直接證據確認為 **OR 邏輯**。`SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` 第 54 行：`AND o.LIST_TYPE IN (SELECT field FROM [fn_SplitString_cte] (OBMLISTDF.LIST_TYPE, '$$'))` — `fn_SplitString_cte` 將 OBMLISTDF.LIST_TYPE 拆分為多筆，`IN` 語義等同 OR；SP 無任何「AND 鏈接多個期別」邏輯。AppDB Stage 1 等效 SQL：`AND pd.list_type IN (SELECT unnest(string_to_array(ld.case_status, '$$')))`。無需業務確認，為 SP 技術性決議 | F050 BR-7 / F051 BR-7 / architecture-spec.md E07-D BR-7 | ✅ **Resolved（2026-05-12）** |
| ~~OQ-E07-22~~ | ~~既有 OBMLISTDF 資料遷移時 `case_status` 補值策略~~ **✅ Resolved（2026-05-12，System Architect Agent）**：DB 驗證 `ob_list_definition.list_type` 既有值分佈：`'01'`(212筆) / `'02'`(177筆) / `'03$$04'`(115筆) / `'02$$03$$04'`(113筆) / `'01$$04'`(1筆) / `'02$$03'`(1筆)，共 619 筆，**全部在合法代碼集 `'01'`/`'02'`/`'03'`/`'04'` 及其 `$$` 組合內，無 NULL，無雜質**。Phase 1b 決議：**直接複製 `list_type` → `case_status`**，格式完全相容，無需額外轉換或業務補填。AD-E07-14 Phase 1 migration SQL：`UPDATE ob_list_definition SET case_status = list_type WHERE case_status IS NULL` | architecture-spec.md AD-E07-14 / E07-B Migration / data-model.md `ob_list_definition` | ✅ **Resolved（2026-05-12）** |
| ~~OQ-E07-23~~ | ~~`case_status` 4 個選項的業務含義細微差異待業務主管確認：`01` 期中（不含當月滿期）／`02` 中結／`03` 滿期（含當月滿期）／`04` 滿期~~ **✅ Resolved（2026-05-12，System Architect Agent + Spec Writer Agent）**：SP 邏輯確認 + DB 實證查詢結合舊系統業務反推，4 個值的業務語意已釐清，**無需業務主管確認即可結案**。結案來源：(1) `reference/SP/USP_OB_OBPOOLDATA.sql:189-216` CASE WHEN 賦值邏輯（以 `STA_CODE` / `MATURITY_DT` / `DEAL_NUM-PAYT_NUM` 計算後賦值 `LIST_TYPE`）；(2) DB 實證 `ob_pool_data` 共 1,487,695 筆 sta_code 分布：`01` 期中 → STA_CODE 05/06 共 331,577 筆；`02` 中結 → STA_CODE 98 共 403,504 筆；`03` 滿期(含當月) → STA_CODE 05/06（**仍 active 處理中**）共 4,711 筆；`04` 滿期 → STA_CODE 90（**已結清完成**）共 747,903 筆。**4 個值業務語意對照表**：<br>• `01` 期中(不含當月滿期)：STA_CODE 05~89（active 處理中），距滿期 > 1 月 **OR** 剩餘期數 > 2，業務目標（建議）= 一般期中案件<br>• `02` 中結：STA_CODE 98（已中途結清），業務目標（建議）= 中途結清客戶<br>• `03` 滿期(含當月滿期)：STA_CODE 05~89（**仍 active**），距滿期 ≤ 1 月 **AND** 剩餘期數 ≤ 2，業務目標（建議）= 即將到期但尚未結清 → 主動續貸、防流失<br>• `04` 滿期：STA_CODE 90（**已完成結清**），業務目標（建議）= 已完整結束 → 回找維繫、再行銷<br>**`03` vs `04` 根本差異**：STA_CODE 不同 — `03` 仍是 active 處理中（即將到期、尚未結清），`04` 已是結清狀態（已完成）。詳見 F050 §5.1.1 業務語意對照表 | F050 §5.1.1 / F051 §5（引用 F050）/ F068 / prototypes/37-base-code.html | ✅ **Resolved（2026-05-12）** |
| ~~OQ-E07-24~~ | ~~OBMCODEDF dump 中 `TBL_ID = '04'`（→ AppDB `ob_code_df.tbl_id = 'CASEYEAR'`）僅 1 筆 `tbl_cd = '01', tbl_desc1 = '0'`，且 AppDB `ob_code_df` 驗證（2026-05-12）確認 tbl_id='04' 仍只有 1 筆。F050 預期 `caseyear` 多選提供 `0~10/99` 共 12 個選項，但 DB 與 dump 均不支援。~~ **✅ Resolved（2026-05-12，Spec Writer Agent + 使用者確認）**：探查 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235` 發現舊系統 CASEYEAR 為前端 hard-coded 的 11 個 CheckBox（value `0`~`10`，每個直接代表合約年數整數；第 12 個 `99 = 10年以上` 被 Razor 註解 `@*...*@` 掉，未啟用），含「全選」勾選框，**無任何 AJAX 呼叫從 API 載入** — 與 PROD_KIND / SPEC_TP / LIST_TYPE 動態載入模式完全不同。對應 SP 邏輯：`SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` Stage 1 使用 `ob_pool_data.year_cnt`（整數）直接與 CheckBox value 比對。dump `OBMCODEDF.TBL_ID='04'` 的 1 筆 `01,0` 為其他模組殘留，與名單定義 CASEYEAR 無關。**修正方向**：(1) CASEYEAR 從 `ob_code_df` 代碼維護範圍移除，F068 降回 3 類（PROD_KIND / SPEC_TP / CASE_STATUS）；(2) F050/F051 `caseyear` 來源改為前端固定 11 個選項（0~10）；(3) AD-E07-14 TBL_ID 映射表移除 `'04'→'CASEYEAR'` 該列；(4) 舊系統 `99 = 10年以上` 未啟用，新系統暫不納入，若未來業務需要再行擴充 | data-model.md `ob_code_df` / F050 `caseyear` 欄位 / F051 `caseyear` 欄位 / F068 / AD-E07-14 / architecture-spec.md §3.10 / error-handling.md `CODE_TYPE_INVALID` | ✅ **Resolved（2026-05-12）** |

## E07 已解決開放問題（計分卡設定 dump 驗證衍生，2026-05-13）

以下問題由 test-designer 比對 OBMLISTDF dump 與舊系統 SP 後識別，由 System Architect Agent 依據使用者決策於 2026-05-13 全數決議：

| # | 問題 | 影響範圍 | 決議 |
|---|------|---------|------|
| ~~OQ-E07-27~~ | HM 計分卡（63 筆名單）：舊 SP_OBLEVELCARD_HM 借用 `CARD_TYPE='M'` 計分設定，但 OBTIER dump 中 HM 有完整 A/B/C/D 四級對應。新系統是否延續借用設計？ | F053–F056 計分卡 UI / ob_levelcard_version / AssignmentRunService Stage 2 | **✅ Resolved（2026-05-13）**：決策：**HM 不延續借用**，補建為獨立計分卡。`fn_calc_tier_level`（migration 141）與 Stage 2 呼叫端均不修改。`ob_tier` 現有 HM 四筆對應正常遷移。業務方須透過 F054 補建 HM 計分設定，補建前月名單分派 HM 名單 score=0 / tier_level=NULL。詳見 **AD-E07-15**（architecture-spec.md）與 data-model.md `#ob-tier-entity` CARD_TYPE 覆蓋率表 |
| ~~OQ-E07-28~~ | M3（31 筆）/ HC（25 筆）/ C3（23 筆）：OBMLISTDF dump 確認三者仍在使用，但 OBTIER dump 與 OBLEVELCARD_VERSION 均無對應；舊 SP 以 L93–123 硬編碼 TIER_LEVEL。是否需補入 ob_tier seed？ | ob_tier 遷移腳本（D3）/ data-model.md `#ob-tier-entity` / F056 | **✅ Resolved（2026-05-13）**：決策：**需補 ob_tier seed**。M3→T5M、HC→THC、C3→T3C 以 `card_level=NULL`（fallback 規則）補建，移植舊 SP 硬編碼語意。月名單分派計分結果語意等效舊系統（score=0，tier_level 由 fallback 取得）。seed SQL 與說明記載於 data-model.md `#ob-tier-entity` M3/HC/C3 seed 規範段落。遷移腳本由 TDD 開發者執行，D11 驗證需補入 M3/HC/C3 各有 1 筆 `card_level IS NULL` 紀錄確認 |

## E07 開放問題（邊緣 CARD_TYPE，2026-05-13）

| # | 問題 | 影響範圍 | 狀態 |
|---|------|---------|------|
| OQ-E07-29 | **HB / SEB / SEC 邊緣 CARD_TYPE**：OBMLISTDF dump 各含 1 筆（共 3 筆），但 OBTIER dump 與 OBLEVELCARD_VERSION 均無對應，不屬已知計分卡體系。不明原因：錯誤輸入？實驗性 CARD_TYPE？已廢棄未清理？月名單分派遇到時現行 `fn_calc_tier_level` 計分結果 score=0 / tier_level=NULL，不存在 ob_tier fallback 紀錄（無 `card_level IS NULL`）。**待業務確認**：1) 是否為錯誤資料應修正？2) 是否計畫保留並補建設定？3) 月名單分派遇到這些 CARD_TYPE 名單時的處置方式（跳過、標記 ERROR、或其他） | F053–F056 UI（是否需顯示這些 CARD_TYPE）/ 月名單分派 AssignmentRunService（異常名單處理邏輯）/ D11 遷移驗證 | **Open（待業務確認）**。在結案前不影響 F053–F056 計分卡設定 UI 的實作；但月名單分派 F061 需確認對 CARD_TYPE 無對應 ob_tier 紀錄的案件的處置邏輯。臨時建議：月名單分派 Stage 2 遇到無對應 ob_tier 紀錄（score=0 且 tier_level=NULL）的案件，記入 `assignment_run_stage_log.error_message` 供業務確認，不中斷整批月名單分派 |

---

## E07 已解決開放問題（case_status 衍生）

以下為 AD-E07-14（2026-05-12）已決議之 case_status 相關設計問題，原以內部編號（OQ-088-04 / OQ-092-02）標記於 US-088 / US-092 story，本次納入中央清單統一追蹤：

| # | 問題 | 決議 | 影響範圍 | 來源 |
|---|------|------|---------|------|
| OQ-E07-25 | `case_status` 欄位於 `ob_list_definition` schema 中的型態與長度？（原 US-088 OQ-088-04） | **`VARCHAR(14) NOT NULL`**（4 個選項最大 `01$$02$$03$$04` = 14 碼）；採兩階段 migration：Phase 1 新增 NULL 欄位並從 LIST_TYPE 複製初值；Phase 2 驗證無 NULL 後加 NOT NULL 約束並更新 list_type 全數為 `'01'`（AD-E07-14） | data-model.md `ob_list_definition` / architecture-spec.md AD-E07-14 / E07-B Migration / F050 / F051 | ✅ Resolved（AD-E07-14, 2026-05-12） |
| OQ-E07-26 | OBMCODEDF 同時有 TBL_ID 與 CODE_TYPE 兩個欄位，CASE_STATUS / PROD_KIND / CASEYEAR / SPEC_TP 應如何統一查詢？（原 US-092 OQ-092-02） | **採英文常數映射策略**（AD-E07-14）：Migration 時 `OBMCODEDF.TBL_ID` 以白名單映射至 AppDB `ob_code_df.tbl_id`，`'01' → 'PROD_KIND'`、`'02' → 'SPEC_TP'`、`'04' → 'CASEYEAR'`、`'22' → 'CASE_STATUS'`；白名單外 TBL_ID 略過不匯入；新系統 API 統一以英文常數查詢，前端不需處理舊數字代碼 | architecture-spec.md AD-E07-14 / E07-B Migration / §3.10 AssignmentCode Service / data-model.md `ob_code_df` / F068 | ✅ Resolved（AD-E07-14, 2026-05-12） |

---

## E07 M02 計分設定擴充（2026-05-14 — CARD_TYPE 5 Tab 結構）

本批 OQ 由 product-analyst + spec-writer 於 2026-05-14 M02 計分設定擴充討論流程中產生：將既有 4 Tab 結構（計分維度 / 分數設定 / CARD_LEVEL 門檻 / TIER_LEVEL 對應）改為 5 Tab，新增第 1 個 Tab「CARD_TYPE 計分卡類型」並開放 CRUD（F069 ~ F072）；TIER_LEVEL 改採 HARDCODE T1~T10 列舉；CARD_TYPE 與 PROD_KIND 建立 1:1 業務綁定。OQ-E07-30 / 31 / 34 之決議於本日完成；新增 OQ-E07-32 / 33 兩項待 system-architect 處理。

| # | 問題 | 影響範圍 | 決議 / 狀態 |
|---|------|---------|------------|
| ~~OQ-E07-30~~ | 停用 CARD_TYPE 但 `ob_list_definition` 仍有 active 紀錄引用：阻擋 / 警告 / 允許？ | F072 AC-2 / AC-5 / BR-4 / `ob_list_definition` | **✅ Resolved（2026-05-14，PO 決議）**：**警告但允許**。F072 刪除預覽端點回傳 `listDefinitionsAffected` 計數；確認對話框於非零時顯示警示文字（不強制攔截）；二次確認（`confirmCascade=true` query）後放行；audit log 記載 `listDefinitionsAffected`。理由：CARD_TYPE 停用為業務決策，名單定義由業務主管自行評估後續處置 |
| ~~OQ-E07-31~~ | OBTIER 中既有 TIER_LEVEL 後綴值（T1M / T1HM / T2HM / T3M / T3HM / T32 / T3C / T4M / T51 / T52 / T5M / THC）之遷移規則 | F056 v1.5 BR-12 / data-model.md `#ob-tier-entity` / D3 migration | **✅ Resolved（2026-05-14，PO 決議）**：**一律依「取前綴數字」規則**，正則 `^T(\d+)` 取得 T 後第一個連續數字之首位數字組合為 `T{N}`（如 T32 → T3、T51 → T5、T52 → T5）。完整映射表記入 F056 BR-12 與 data-model.md `#ob-tier-entity`「TIER_LEVEL 列舉約束與遷移規則」段落。THC 之歸屬另由 OQ新-2 決議（→ T1） |
| ~~OQ-E07-34~~ | F070 新增 CARD_TYPE 時自動建立之 v1 `ob_levelcard_version` 之初始欄位值 | F070 AC-1 / BR-3 | **✅ Resolved（2026-05-14，PO 決議）**：`sdate` = 今日（`YYYYMMDD`）、`edate` = `'20991231'`、`card_name` = 同新建之 cardName、`status` = `'active'`、`card_version` = 1；同 transaction 寫入 `ob_card_type` + `ob_levelcard_version`，任一失敗整體 rollback |
| ~~OQ新-1~~ | F072 級聯刪除範圍是否包含 `ob_pool_data_list` 歷史分派結果 | F072 AC-4 / BR-3 | **✅ Resolved（2026-05-14，PO 決議）**：**不包含**。`ob_pool_data_list` / `assignment_run_snapshot` / `ob_list_definition` 三表均不在級聯範圍；歷史分派結果不可變更，由 F066 月名單分派 snapshot 提供追溯。`ob_card_type` 本身採 hard delete（與下游 5 表一致），歷史追溯交 F066 snapshot |
| ~~OQ新-2~~ | TIER 遷移規則中 `THC` 之映射目標值（無 T 後連續數字，需獨立規則） | F056 BR-12 / data-model.md `#ob-tier-entity` | **✅ Resolved（2026-05-14，PO 決議）**：**THC → T1**。理由：HC 為汽車 high-credit 最高層級，遷移至 T1 與業務語意對齊 |
| ~~OQ-E07-32~~ | `ob_card_type` DB 層 schema 細節：FK constraint（`prod_kind` 是否 FK 至 `ob_code_df`）、unique index（如 `(card_type, status)`）、cascade 行為（級聯刪除是否使用 `ON DELETE CASCADE` 或於應用層手動執行）、transaction isolation level、F072 預覽 vs DELETE 之間 race condition 之鎖定策略 | F069 / F070 / F072 / data-model.md `#ob-card-type-entity` / migration | **✅ Resolved（2026-05-14，system-architect）**：(1) **PK**：`card_type VARCHAR(5)` Natural PK，建立後不可修改；(2) **prod_kind**：無 DB-level FK（應用層驗證，見 data-model.md FK 設計決策段）；(3) **Partial unique index**：不需要（F072 hard delete 語意，無 inactive 殘留）；(4) **ON DELETE CASCADE**：**不使用**，採應用層 Transaction（AD-E07-16）；(5) **Transaction isolation**：`READ COMMITTED`（PostgreSQL default）；(6) **Race condition**：「最後一刻為準」策略——DELETE 端點開啟 transaction 後重新計數寫入 audit log，不使用 preview 緩存值；(7) **DB-level CHECK constraint**：`card_type ~ '^[A-Z0-9]{1,5}$'`（PostgreSQL 環境）+ `status IN ('active','inactive')`；(8) **Index**：`idx_ob_card_type_status (status)`。詳見 `architecture-spec.md AD-E07-16` 與 `data-model.md #ob-card-type-entity` |
| ~~OQ-E07-33~~ | 6 個正規 CARD_TYPE（H/S/E/S5/E5/M）之 PROD_KIND seed 對應表確認 | data-model.md `#ob-card-type-entity` Seed 段 / D-CT-02 migration | **✅ Resolved（2026-05-14，system-architect，依 OBMLISTDF dump 實證）**：已依 `reference/DumpData/OBMLISTDF_20260505.csv` 第 9 欄（PROD_KIND）與最後欄（CARD_TYPE）逐一確認：**H → `01`（汽車）**（dump 第 2、7、8 行）、**S → `01`（汽車）**（dump 第 4、5 行）、**E → `01`（汽車）**（dump 第 6 行）、**S5 → `01`（汽車）**（dump 第 53 行）、**E5 → `01`（汽車）**（dump 第 54 行）、**M → `02`（機車）**（dump 第 3 行）。Migration D-CT-02 Seed 採冪等 `INSERT ... ON CONFLICT (card_type) DO NOTHING`。詳見 `architecture-spec.md E07-G D-CT-02` 與 `data-model.md #ob-card-type-entity Seed 段` |
| OQ-E07-34a | F071 編輯 `ob_card_type.card_name` 是否同步更新 `ob_levelcard_version.card_name`？ | F071 BR-4 | **✅ Decided（2026-05-14，spec-writer；architecture-spec 確認採納）**：**不同步**。理由：兩表語意不同（CARD_TYPE 主資料 vs 計分版本快照），同步會造成歷史快照語意污染。`ob_levelcard_version.card_name` 由 F054 編輯端點維護 |
| ~~OQ-E07-35~~ | F056 v1.5 Fallback / Standard 互斥規則之 DB 層約束實作（partial unique index 或 trigger 或應用層保證） | F056 BR-13 / data-model.md `#ob-tier-entity` | **✅ Resolved（2026-05-14，system-architect）**：採**應用層 Mutex 檢查**，不建立 DB-level partial unique index 或 trigger。理由：(1) 互斥語意（「同一 card_type 不可同時存在 card_level IS NULL 與 IS NOT NULL」）無法用單一 DB constraint 精確表達；(2) 應用層已是唯一寫入路徑；(3) SQLite E2E trigger 語法差異問題；(4) MVP 並發量極低。Service 層 F056 所有寫入端點內部執行互斥性檢查（先 COUNT Standard / 確認 Fallback existence，再 INSERT）。詳見 `data-model.md #ob-tier-entity Fallback/Standard 互斥約束實作段` |
| ~~OQ-E07-36~~ | F056 v1.5 TIER_LEVEL 列舉 T1~T10 之 DB 層約束實作（CHECK constraint / ENUM type / 應用層驗證） | F056 BR-2 / data-model.md `#ob-tier-entity` | **✅ Resolved（2026-05-14，system-architect）**：採 `CHECK constraint`（非 PostgreSQL `ENUM type`，非純應用層驗證）。決策：`ALTER TABLE ob_tier ADD CONSTRAINT chk_ob_tier_tier_level CHECK (tier_level IN ('T1','T2','T3','T4','T5','T6','T7','T8','T9','T10'))`。選 CHECK 而非 ENUM 原因：未來擴展至 T11+ 只需 `ALTER TABLE`，不需 `ALTER TYPE`（DDL 部分版本不可 rollback）。執行時序：D3 migration → TIER_LEVEL 轉換 UPDATE → M3/HC/C3 seed → D11 驗證確認 0 違規 → D-CT-03 加 CHECK（PostgreSQL）。SQLite E2E 版本省略 CHECK，由應用層 `TIER_LEVEL_ENUM` 常數陣列保護。詳見 `architecture-spec.md E07-G D-CT-03` 與 `data-model.md #ob-tier-entity DB 層列舉約束實作段` |

---

## E07 重構批次 4 — M03a 部門比例設定衍生（2026-05-15）

本批次將原 F060（US-091）拆分為 F079 / F080 / F081，並引入「五階段流程引擎」之 service helper 共用模式。以下開放問題待 system-architect 於批次 4 architecture 階段決議。

| # | 問題 | 影響範圍 | 建議方案 / 狀態 |
|---|------|---------|----------------|
| OQ-E07-37 | **F079 / F080 / F081 是否與 F050 v2.0 §13 同套 `ENABLE_E07_REFACTOR_PHASE3` feature flag gating？** F060 v1.x PUT `/api/v1/assignment/ratios/dept/:listNo` 端點與 F079 v1.0 PUT 端點路由完全相同；同時上線將產生路由衝突或 service 層分流複雜度。**潛在方案**：(1) 沿用 F050 v2.0 §13 同一 flag（flag = false 保留 F060 行為 / flag = true 切換為 F079 行為）+ 新增 F060 殘留偵測（500 `LIST_RATIO_BLOCKED_LEGACY_F060` 或共用 `LIST_DRAFT_ADVANCE_BLOCKED_LEGACY_F059`）；(2) 獨立新 flag `ENABLE_E07_REFACTOR_PHASE4`；(3) 直接於同一個 controller 依 `stage` 動態分流至新 / 舊 service。建議採方案 (1) 維持「批次間原子性上線」一致性 | F079 §12 A-5 / F080 §12 A-3 / F081 §12 A-4 / F060 v2.0 DEPRECATED banner / architecture-spec.md feature flag 設計 | **Open（待 system-architect 批次 4 architecture 階段決議）** |
| OQ-E07-38 | **是否提供「跨階快速 Rollback」捷徑？** F081 採嚴格 BR-1（單階 Rollback：`dept_ratio` → `draft`）；後續批次 5/6/7 將分別提供 `personnel_ratio` → `dept_ratio` / `approval` → `personnel_ratio` / `ready` → `approval` 端點。實務上若部長 / Admin 需從 `personnel_ratio` 直接回到 `draft`，需執行 2 次 Rollback 動作（且各觸發 cleanup）。**待 PO 評估**：(1) 維持嚴格單階 Rollback（清楚的稽核軌跡 + cleanup 邊界明確）；(2) 提供「快速退回至草稿」捷徑端點（單一動作 + 一次性 cleanup 多階資料）；(3) 提供「快速退回任意階段」endpoint（`POST /list-definitions/{listNo}/rollback?targetStage=draft`，一次性 cleanup 中間所有階段資料）。建議 MVP 採方案 (1) 維持簡潔；Phase 2 視業務反饋評估 (2)/(3) | F081 §12 A-2 / 後續批次 5/6/7 Rollback spec | **Open（待 PO 評估，建議 MVP 採嚴格單階）** |
| OQ-E07-39 | **`StageTransitionService` + `RatioValidationService` 共用 service helper 之模組邊界與 transaction 設計**：spec 層已要求 system-architect 抽出兩個 service helper（`StageTransitionService.assertStageEquals` / `advanceTo` / `rollbackTo` + `RatioValidationService.assertSumEquals100` / `assertEachInRange`），但 helper 之內部設計（DB transaction 邊界、稽核寫入時機、跨 service 依賴注入）由 system-architect 決議。**待決事項**：(1) `advanceTo` / `rollbackTo` 是否強制接受 `Transaction` / `EntityManager` 參數以支援呼叫端組合多步驟操作？(2) `cleanupFn` / `preconditionFn` 之執行順序與 transaction 邊界（cleanupFn 失敗是否 rollback `stage` 更新）？(3) 稽核 `assignment_audit_log` 寫入是否封裝於 helper 內，或由呼叫端負責（避免重複稽核）？ | F079 §12 A-1, A-2 / F080 §12 A-1, A-2 / F081 §12 A-1, A-3 / architecture-spec.md §3.10 service 設計 | **Open（待 system-architect 批次 4 architecture 階段決議）** |
| ~~OQ-E07-40~~ | **F083 獎懲快速比例模板之「相對預設值」基準語意確認**：批次 5 任務說明提及「系統預設 = 部門取得比例 ÷ 業務員人數」（暗示模板基準為「`ob_dept_pct.ration` ÷ N」），但 US-113 Story 與 OQ-E07-20 已決議之文字為「均等分配 = 100% / 部門人數」。F083 v1.0 採後者解讀（部門內加總為 100%；模板基準 = 100% / N）。**✅ Resolved（2026-05-15，使用者決議）**：採「相對 %」語意 — 「部門預配的 100%、5 人 → 預設每人 20%（指該部門配額之 20%，UI 顯示為「20%」而非「6%」）」。F082 v1.1 / F083 補 BR-2a 明確「處長介面顯示之比例值為相對部門配額之百分比，非絕對佔全名單百分比」。落地修訂：F082 v1.1 BR-2a + F083 BR-2a + F057 v1.1 BR-6（顯示語意一致）。**DB 儲存值之語意（相對 % 直接存 vs 絕對 % 換算後存）由 system-architect 決議**（標 [ASSUMPTION] 於 F082 §12 A-7；建議採「存相對 %」與 fn_calc_tier_level SP 既有邏輯一致 + UI 顯示不需轉換 + `ob_dept_pct` 與 `ob_empl_set` 解耦）| F083 §6 BR-2a / F082 v1.1 §6 BR-2a + §12 A-7 / F057 v1.1 §6 BR-6 / data-model.md `ob_empl_set` | ✅ **Resolved（2026-05-15，使用者決議；DB 儲存語意待 system-architect）** |

## E07 重構批次 6 — M03c 簽核 + M03d 準備完成（2026-05-15，最後一批）

本批次新增 F086 / F087 / F088 / F089 完成 E07 五階段流程引擎之最後兩階段（簽核 + 準備完成），同步修訂 F082 v1.1（banner 渲染）+ F061 v1.1（月名單分派前置條件強化 + CR 路徑遷移）+ F057 v1.1（流程外查詢定位明確）。

| # | 問題 | 影響範圍 | 建議方案 / 狀態 |
|---|------|---------|----------------|
| ~~OQ-E07-21~~ | **F087 拒絕後 banner 顯示位置與互動設計**：US-117 拒絕後處長進入 F082 修正頁時，拒絕原因應如何呈現？(A) 主動以 banner 顯示於頁首（醒目）；(B) 僅於稽核日誌 tab 顯示（被動）；(C) 兩者並存。**✅ Resolved（2026-05-15，使用者決議）**：採方案 A，F082 頁面頂部主動顯示 banner，可關閉 / 可折疊。落地：F087 BR-11 規範資料來源（GET response `latestRejection` 欄位）+ F082 v1.1 §7.x 規範渲染與互動（樣式 / LocalStorage 記憶 / Accessibility / 跨頁面行為）；F087 AC-4 與 F082 v1.1 cross-spec 整合；資料來源於 `assignment_approval` 表最近一筆 `action = 'reject'` 紀錄 | F087 §6 BR-11 + AC-4 / F082 v1.1 §7.x / data-model.md `assignment_approval` | ✅ **Resolved（2026-05-15，使用者決議）** |
| OQ-E07-41 | **`assignment_approval` 表之 PK 設計與索引策略**：本 spec（F086 / F087）建立新表 `assignment_approval` 記錄簽核操作；具體 PK 設計需 system-architect 決議：(A) 單 PK `approval_id` UUID（與 `assignment_audit_log` 模式一致；INSERT 簡單；查詢需 index）；(B) 複合 PK `(list_no, approved_at)`（自然 PK；查詢效能好；但 `approved_at` 為 TIMESTAMP 可能撞鍵需處理 microsecond 精度）。建議採 (A) UUID PK + 額外 covering index `(list_no, approved_at DESC)` 滿足 F082 banner / F088 approvalHistory 查詢需求 | F086 §12 A-2 / F087 §12 A-2 / data-model.md `assignment_approval` | **Open（待 system-architect 決議；建議採方案 A）** |
| OQ-E07-42 | **`StageTransitionService.rejectTo` helper 是否新增 vs 重用 `rollbackTo`**：F087 拒絕語意 = rollback（退回上一階段 + cleanup 資料），但需額外接受 `rejectReason` 參數並 INSERT `assignment_approval`。建議方案：(A) 新增獨立 `rejectTo(listNo, fromStage, toStage, rejectReason, cleanupFn?, postActionFn?)` helper（語意明確、與 `advanceTo` / `rollbackTo` 並列為三大階段轉換動作）；(B) 擴充 `rollbackTo` 加 optional `rejectReason` 與 `postActionFn` 參數（避免新增 helper，但語意混淆 rollback vs reject）。建議採 (A) 因簽核為業務流程獨特語意 | F087 §6 BR-10 + §12 A-1 | **Open（待 system-architect 決議；建議採方案 A 新 helper）** |
| OQ-E07-43 | **`MonthlyRunReadinessService.calculateReadiness(workYm)` helper 之計算策略與快取**：F088 之 `monthlyRunReady` 計算需 SQL `COUNT(*) GROUP BY stage` 統計當月 active 名單；F089 Rollback 與 F086 核准會即時改變狀態。建議方案：(A) 每次 GET 重算（簡單、無 cache invalidation 問題；MVP 推薦）；(B) Redis 快取 + invalidation hook（高效但需處理 stage 變更時之 invalidation 邏輯）。建議 MVP 採 (A) 直接計算 | F088 §12 A-2 + 實作 Checklist | **Open（待 system-architect 決議；建議 MVP 採方案 A）** |
| OQ-E07-44 | **F089 Rollback 後 `assignment_approval` 採 hard delete vs soft delete**：F089 BR-4 規範「DELETE FROM `assignment_approval` WHERE `list_no = :listNo`」清空簽核紀錄（避免 F082 banner / F088 `approvalHistory` 顯示已過時資料；歷史完整資訊由 `assignment_audit_log.before_value.approvalHistory` 保留）。**Open**：(A) hard delete（建議；查詢簡單；歷史可從 audit log 追溯）；(B) soft delete 加 `is_active` 欄位（F082 / F088 query 需額外 WHERE 條件，影響 covering index 設計）。建議採 (A) hard delete | F089 §6 BR-4 + §12 A-2 / data-model.md `assignment_approval` | **Open（待 system-architect 決議；建議採方案 A hard delete）** |
| OQ-E07-45 | **F088 `monthlyRunReady` 之「Active 名單」定義是否含草稿**：F088 BR-5 / F061 v1.1 BR-5 規範「`status = 'active'` 且 `stage != 'draft'`」（草稿名單不計入月名單分派必要 ready 範圍）。**Open**：(A) 排除草稿（建議；草稿可能為使用者測試中之名單）；(B) 含草稿（要求部長必須處理所有名單後才能月名單分派，更嚴格）。建議採 (A) 因草稿名單可能為部長測試中、月名單分派前可批次清除或推進 | F088 §12 A-1 / F061 v1.1 §12 A-1 / BR-5 | **Open（待 system-architect 決議；建議採方案 A）** |

---

## F104 Stage 2 計分引擎全欄對齊 legacy SP（2026-06-24）

本批次新建 F104，將 Stage 2 計分引擎兩路徑（PG 下推 `resolveColumnSource` + JS oracle `resolveColumnValue`）由「對齊 AD-E07-10-L」改為「對齊 legacy `SP_OBLEVELCARD_*.sql` 真語意」（AD 本身經稽核確認有多欄偏差）。

### 已查證／已解決（spec-writer 直接採用，寫入 F104 §13）

| # | 問題 | 查證結論 | 出處 |
|---|------|---------|------|
| OQ-159-01 | SALES_STS 上游轉換是否等於 AD 之 CASE（`'經銷商'→'UCD'`）？ | **已解＝須修**。`SP_GET_CUSTATTRIB_OB.sql` 為客戶特質 OBOUT 資格查詢、**與 SALES_STS 無關**；SALES_STS CASE 在 `SP_OBLEVELCARD_*.sql` 就地完成，UCD key 確為 **`'中古車商'`**（非 `'經銷商'`）。現行引擎誤用 `'經銷商'`，F104 AC-2 修正 | F104 §13 / legacy H L40–43 |
| 縣市比對粒度 | cc.*_city 為「縣市+區」，但 per-card default 為縣市-only——legacy 計分 LEVEL 是縣市-only 還是縣市+區？ | **已解＝縣市-only 3 字**。dev `ob_levelcard_score` 三縣市欄 level1 共 25 distinct、`MAX(char_length)=MIN=3`。cc.*_city 為 6 字（含區）。→ 引擎須 `LEFT(value,3)` 比對（legacy 自身亦 `LEFT(POSTAL_ADD,3)`）。F104 BR-F104-10 | F104 §13 / legacy M L42 |
| per-card 啟用矩陣（縣市欄 card 別）| stories 列 HPOST H/S→臺北市、CO_NUM H→金門縣/S→高雄市 之 default | **RESOLVED（使用者 2026-06-24 拍板：依 legacy）**。stories 假設有誤——H/S **不計分**縣市欄；縣市欄 default 屬 S5/E5/M/HM。F104 §5 已依 legacy 修正、保留不動 | F104 §13 |
| 空/NULL cus_sex 分流走向 | 五欄分流時空/NULL cus_sex 視為個人或法人？（先前版本採 CDMP=法人）| **RESOLVED（使用者 2026-06-24：改為 legacy＝個人）**。**分流(gating) default='1'（個人）**，空/NULL→個人、用自身屬性；**但 CUS_SEX 計分欄 default 仍=3**（range 計分）。**兩 default 刻意分離**，下游 impl 不可混用 | F104 BR-F104-04 / BR-F104-13a / legacy H L36 vs L97 |

### 待 system-architect 裁示（spec-writer 附建議）→ 全部 RESOLVED（System Architect，2026-06-24）

| # | 問題 | 裁定結論 |
|---|------|---------|
| OQ-F104-01 | **`resolveColumnSource` / `resolveColumnValue` signature 加 `cardType`** | **RESOLVED ✓**：採用建議。`resolveColumnSource(columnName, cardType)` + `resolveColumnValue(pool, columnName, cc, arCap, cardType)`。呼叫端 `buildStage2ScoreExpr`（L233）/ `computeScore`（L1098）已持有 cardType，直接傳入。`MAPPED_SCORING_COLUMNS`/`CUSTOMER_CORE_COLUMNS` 不變。EQ DoD 要求兩路徑對同 (column, card, 缺值) 回傳相同值。`tsc --noEmit -p tsconfig.build.json` 硬性 DoD。→ **AD-E07-32** |
| OQ-F104-02 | **per-card default 完整 card 清單 + 未知 card fallback** | **RESOLVED ✓**：採用建議。建 `CARD_DEFAULTS` 常數映射（詳細矩陣見 AD-E07-33）。**M/HM LIST_MONTH 與 LOAN_RATE 不啟用**（SP 查證：M L79-85 / HM L80-86 scoring block 無此兩欄）。未知 card fallback：數值欄套 H 基準（LIST_MONTH→25/LOAN_RATE→0）；縣市欄未知 card 不計分（無 default）；EDUCAT→`'02'`；所有 fallback `logger.warn` + 不阻擋月名單分派（BR-F104-16）。→ **AD-E07-33** |
| OQ-F104-03 | **AD-E07-10-L 全欄改寫（含 PROJECT_TP 複合條件 + SALES_STS）** | ~~**RESOLVED（F104，2026-06-24）**：本版維持 category 單欄簡化 + 關鍵字修正，不複刻完整複合語意；AD 標注殘留風險，F067 差異若顯示偏差另立 story。→ AD-E07-10-L v4.0~~ **⟶ REOPENED → RESOLVED（F105，2026-06-25，使用者重新拍板）**：F067 差異報告確認 PROJECT_TP 為最大宗分差缺口（~43%，27 分 / 63 分，001 名單 H 卡）。F104 `kind='category'` 使 category 分支「`level1=NULL → skip`」跳過 16 個 NULL-level1 score row → 73.9% 客戶 PROJECT_TP=0。**F105 決策：新增 `kind:'composite'`（第三 ColumnSource kind），`resolveColumnSource('PROJECT_TP')` 回傳 `{kind:'composite', codeExpr, keywordExpr}`；每 score row 比對 `TRIM(code) BETWEEN level2_s AND level2_e`（字串）AND `TRIM(keyword)=COALESCE(level1,'')`，第一命中取分；F104 借新還舊關鍵字修正保留。SALES_STS 維持 `kind:'category'`（match_type='COMPOSITE' 標籤不觸發新邏輯）。** → **AD-E07-10-L v5.0 + AD-E07-35** |
| OQ-F104-04 | **EDUCAT_BACK 比較型別 + 縣市 LEFT3 落點** | **RESOLVED ✓**：(a) **EDUCAT_BACK SP 查證**（S L95 / S5 L82 / E L109 / E5 L109）：值為 `RIGHT('0'+code,2)` 補零字串，用 `BETWEEN LEVEL2_S/LEVEL2_E` → **字串 lexical range**。`kind='range'`，PG/JS range 分支以 `Number()` 數值比較（補零字串 '02'/'08' 數值等價）；tdd 落地前須驗 ob_levelcard_score EDUCAT_BACK score row 是 level2（range），若實為 level1（category）則改字串相等（預留交接點）。(b) **縣市 LEFT3 落點**：在 `resolveColumnSource` 縣市 case 之 `expr` 直接含 `LEFT(COALESCE(NULLIF(cc.*_city,''),<default>),3)`，category 比對端不需改（對齊 legacy M L42-44 source CTE 預套 LEFT3 後直接 `=LEVEL1` 的語意）。→ **AD-E07-10-L v4.0 說明** |

> **OQ-159-02（未知 card_type default）**＝spec-writer 裁定：F104 BR-F104-16（未知 card 套 H/S 基準 + warn，不阻擋月名單分派），不另交 architect。
> **OQ-161-01（縣市萃取方案）/ OQ-161-02（gender vs cus_sex 保留）**＝已由使用者 ETL（m301）落地解決：縣市以 `POSTAL_NO→POSTAL_ADD` lookup 取「縣市+區」存 `*_city`；`cus_sex`（varchar）與既有 `gender` 並存，F104 計分改讀 `cus_sex`，`gender` 不再用於 CUS_SEX 計分（F105 可清理）。
> **OQ-160-01（CAREA 區碼有無語意）**＝已解：cc.carea_no1/no2 為區碼字串，presence = `IS NOT NULL AND <>''`（BR-F104-05）。

---

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-06-24 | 新增 F104 全欄對齊 legacy SP：OQ-159-01／縣市粒度／per-card 矩陣 3 項已查證解決；OQ-F104-01~04 交 system-architect（附建議）；OQ-159-02／OQ-160-01／OQ-161-01/02 記為已解 | Spec Writer Agent |
| 2026-06-24 | F104 定點修正（使用者拍板 2 項）：縣市計分卡別 RESOLVED＝依 legacy（H/S 不計分縣市、default 屬 S5/E5/M/HM，保留不動）；空/NULL cus_sex 分流走向 RESOLVED＝改 legacy＝個人（gating default='1'，與 CUS_SEX 計分欄 default=3 分離，BR-F104-04/13a） | Spec Writer Agent |
| 2026-06-24 | OQ-F104-01~04 全部 RESOLVED：signature 加 cardType（AD-E07-32）、per-card default 完整矩陣 + M/HM 不啟用 LIST_MONTH/LOAN_RATE（AD-E07-33）、AD-E07-10-L 全欄改寫 v4.0 + PROJECT_TP 單欄簡化標殘留風險（使用者拍板）、EDUCAT_BACK 字串 BETWEEN + 縣市 LEFT3 落點（AD-E07-34）；新增 AD-E07-32/33/34 | System Architect |
| 2026-06-25 | **OQ-F104-03 REOPENED → RESOLVED（F105）**：使用者重新拍板復原 PROJECT_TP COMPOSITE 真語意；新增 `kind:'composite'` 引擎路徑（AD-E07-35）；AD-E07-10-L 升至 v5.0（PROJECT_TP composite 取代 category 簡化） | System Architect |
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
| 2026-04-24 | 新增 E07 已解決問題 R18 ~ R24（OB 遷移策略/月名單分派表設計/稽核保留期/業務主管旗標/計分 function 實作）、假設 A42 ~ A44 | System Architect Agent |
| 2026-04-24 | E07 SPEC 撰寫：新增 OQ-E07-1~5（SPEC 層級決策）、OQ-E07-Arch-1~6（Story 層級問題標記為 Resolved）、OQ-E07-6~13（待 system-architect 確認細項）、假設 A45 ~ A52 | Spec Writer Agent |
| 2026-05-04 | 修正 F056 TIER_LEVEL 對應表資料來源：原 spec 誤指為 `ob_levelcard_level`，實際舊系統使用獨立 `OBTIER` 表（SP 證據 `reference/SP/Stage2_依照CardType分類TierLevel.sql`）。新增 OQ-E07-14（OBTIER schema 待索取）與假設 A53（ob_tier 表結構推論依據） | Spec Writer Agent |
| 2026-05-04 | OBEMPHIRE / OBCALENDAR 同步機制決議：新增 OQ-E07-15（採 E04 通用擷取任務同步至 AppDB `ob_emphire` / `ob_calendar`，E07 不提供 CRUD 維護），同時解決 OQ-E07-10（F049 工作日表來源）與 OQ-E07-12（F064 員工姓名 join 來源）；假設 A50 / A52 標為 Resolved；F049 / F058 / F061 / F063 / F064 內 `[ASSUMPTION]` 升級為 Resolved；data-model.md 新增 `ob_emphire`（含 anchor `#ob-emphire-entity`）與 `ob_calendar`（含 anchor `#ob-calendar-entity`）正式表定義；scope.md 補上 E04 擷取範圍涵蓋 OBPOOLDATA/OBEMPHIRE/OBCALENDAR | Spec Writer Agent |
| 2026-05-05 | OBTIER schema 收件（路徑：`reference/TableSchema/OB/OBTIER.sql`）：data-model.md `#ob-tier-entity` 修正欄位（CARD_TYPE / CARD_LEVEL 由推論型別 VARCHAR(2)/(1) 修為實際 VARCHAR(5)；新增 `list_nm` VARCHAR(30) NULL；**移除**先前推論之 6 個稽核欄位 A_PRGID/A_USERID/A_SYSDT/U_*，原表確認無稽核欄位）；OQ-E07-14 與假設 A53 標為 ✅ Resolved；新增假設 A54（PK `(card_type, card_level)` 為遷移時補建，依 SP join 邏輯）保留 [ASSUMPTION]；F056 升至 v1.2，API request/response 補入 `listNm` optional 欄位、cardType/cardLevel 約束改為 maxLength 5、新增 BR-7（`ob_tier` 稽核透過 `assignment_audit_log` 統一處理）。ARRETURNDF schema 收件（路徑：`reference/TableSchema/ZZIPPROD/ARRETURNDF.sql`）：新增 OQ-E07-16 並直接標為 ✅ Resolved，註記屬 E04 ETL 範圍（OBPOOLDATA 上游來源），**E07 specs 不為個別來源表新增表定義** | Spec Writer Agent |
| 2026-05-05 | dump 9 表資料驗證（路徑：`reference/DumpData/*_20260505.csv`）發現 5 項與 spec 假設差異並修正：(1) `ob_levelcard_version` 補加 `status VARCHAR(10) NOT NULL DEFAULT 'active'`（**遷移補建**，原表無；初值由 `(SDATE <= 今日 < EDATE)` 計算），稽核欄位維持 NULL 設定；F054/F055 補入 BR 說明；(2) `ob_tier.card_level` 從 NOT NULL 改回 NULL（dump 觀察 `M5` → `T5M` fallback 紀錄 CARD_LEVEL 為空字串），PK 補建邏輯更新為 `(card_type, COALESCE(card_level, ''))`；ob_tier 章節補入 Fallback CARD_TYPE 觀察表（H/S/E/S5/E5/M/HM/M5 共 8 種），F056 新增 AC-4a（允許 NULL CARD_LEVEL fallback）+ BR-8（fallback 規則）+ API 範例與欄位約束更新；F061 Stage 2 補入 fallback join 語意；(3) `ob_levelcard_*` 系列稽核欄位 NULL 化驗證（dump 觀察多筆為 NULL，data-model 既有設定無誤）；(4) `ob_empl_set.deptid_m` 補入尾隨空白 RTRIM 註腳（dump 觀察 4 字元代碼被 padded 至 50 字元）；(5) `ob_list_definition` 補入「多值欄位儲存規範」段（`prod_kind` / `spec_tp` / `settle_src` / `caseyear` 為 `$$` 分隔字串），F050 / F051 UI/UX 補入多值欄位序列化規範。OQ-E07-11（OBMCODEDF.SYSTEM_ID 固定值）標為 ✅ Resolved（dump 全表 = `'OB'`）；假設 A51 同步 Resolved；A54 更新為含 NULL CARD_LEVEL 處理；新增 OQ-E07-17（dump 驗證決議彙整）並標為 ✅ Resolved | Spec Writer Agent |
| 2026-05-08 | OQ-E07-18 標為 ✅ Resolved（System Architect Agent）：ob_pool_data spec/schema 落差盤點 4 項全部處置完畢——(1) ob_pool_data.list_no 移除（AD-E07-13）；(2) is_sales_manager 追蹤至 OQ-E07-19；(3) API 路徑前綴 v1 批次修正；(4) JWT payload is_sales_manager 連動 OQ-E07-19。架構決策 AD-E07-13 新增至 architecture-spec.md E07-A 章節（ob_pool_data PK 確定為 (orgno, appl_no)，不含 list_no；ob_pool_data 與 ob_pool_data_list 確立「池/結果」分離架構） | System Architect Agent |
| 2026-05-05 | E07 進入開發前架構決策（System Architect Agent）：(1) OQ-E07-6 → AD-E07-4（ob_levelcard_column.status 欄位）✅ Resolved；(2) OQ-E07-8 → AD-E07-5（ob_assign_config 獨立表，CR 開關存 config_key）✅ Resolved；(3) OQ-E07-9 → AD-E07-6（ob_emphire.resign_date IS NULL 為在職判斷）✅ Resolved；(4) OQ-E07-13 → AD-E07-7（assignment_run_stage_log 獨立表）✅ Resolved；新增 AD-E07-8（Stage 0 日比例演算法確認）、AD-E07-9（ob_assign_set 歸屬 L3）、AD-E07-10（fn_calc_tier_level function 簽章）、AD-E07-11（F064 exceljs streaming）；假設 A45/A47/A48/A49 升級為 Resolved；更新 architecture-spec.md 至 v2.0（新增附錄 E07-A~F，含資料來源分層圖、Migration 設計、ETL 設計、月名單分派執行架構、PostgreSQL function 設計、開發前檢核清單） | System Architect Agent |
| 2026-05-05 | 修正 E07-C ETL 設計根本性架構錯誤（AD-E07-12）：E07 ETL 改採 E04 raw 擷取（`raw_{id}` 中介表）+ E05 Pipeline TargetLoad（`fullMode: true`）雙層架構；OBEMPHIRE 同步策略改為全量 full replace（移除增量同步描述）；OQ-E07-15 解決方案文字補入具體雙層流程說明（E04 mode:full → raw_{id} → E05 TargetLoad fullMode → ob_*，OBEMPHIRE 每日 03:00/03:30 排程錯開，OBPOOLDATA/OBCALENDAR 手動觸發）；E07-F 檢核清單 E 類重組為 9 項（E1~E9）；新增 AD-E07-12 架構決策；architecture-spec.md 升至 v2.1 | System Architect Agent |
| 2026-05-06 | 開發前 spec/schema/implementation 三方對齊：(1) 新增 OQ-E07-18 — `ob_pool_data` 與 OBPOOLDATA 原表結構落差（spec 誤含 `LIST_NO`，實際為 120 欄共享案件池），data-model.md `#ob_pool_data` 已修正（移除 `list_no` 欄位、PK 改為 `(orgno, appl_no)`、blockquote 補「共享案件池」說明、索引重構），F049 AC-4 文字明確化（讀 `ob_list_definition` 取篩選條件對 `ob_pool_data` 套用 WHERE，非按 `list_no` 過濾），F061 Stage 1 / F063 檢視後語意正確不需改；system-architect 並行處理 PK 方案與補 AD-E07-13；(2) 新增 OQ-E07-19 — `is_sales_manager` 旗標實作端完全缺漏（`apps/api/src/**` 全 grep 無 `is_sales_manager` / `isSalesManager`，migration / Entity / Auth Service / JWT payload 皆無），spec 描述本身正確無需修改，標 Open，待 Track A M3 migration + Auth Service + JWT payload 補建；不修改 F001/F002/F004/F005/F008/F061 Feature 描述 | Spec Writer Agent |
| 2026-05-12 | AD-E07-14（LIST_TYPE 語意拆分 + case_status 必填欄位）衍生 OQ 集中登錄；同步修正 OQ-E07-19 編號衝突：(1) architecture-spec.md v2.4 內部曾誤將「ob_pool_data 案件結清期別欄位待確認」標為 OQ-E07-19，與既有 OQ-E07-19（is_sales_manager 實作缺漏）衝突，本次改編為 **OQ-E07-20**（架構 BLOCKER）並由本清單集中追蹤；(2) 新增 **OQ-E07-21**（case_status 多選 OR/AND 篩選邏輯，[ASSUMPTION] OR）；(3) 新增 **OQ-E07-22**（既有 OBMLISTDF 遷移 case_status 補值策略，AD-E07-14 Phase 1b 細節）；(4) 新增 **OQ-E07-23**（case_status 4 選項業務含義細微差異）；(5) 新增 **OQ-E07-24**（OBMCODEDF dump TBL_ID='04' 僅 1 筆語意不明 — CASEYEAR 12 選項待對齊）；(6) 已解決問題納入中央清單：**OQ-E07-25**（原 US-088 OQ-088-04，case_status VARCHAR(14) NOT NULL 兩階段 migration）✅、**OQ-E07-26**（原 US-092 OQ-092-02，OBMCODEDF tbl_id 英文常數映射策略）✅，兩者均由 AD-E07-14 決議。architecture-spec.md 同步升至 v2.4.1（修正內部 OQ-E07-19 引用為 OQ-E07-20，並新增 OQ-E07-21 之指引）；F050 / F051 BR-7 內部仍引用 OQ-088-02 不強制改寫，但於本清單以 OQ-E07-21 為主編號 | Spec Writer Agent |
| 2026-05-12 | SP 分析 + DB 驗證解決 OQ-E07-20/21/22，縮窄 OQ-E07-23/24（System Architect Agent）：(1) **OQ-E07-20 ✅ Resolved**：ob_pool_data 案件結清期別欄位確認為 `list_type`（證據：USP_OB_OBPOOLDATA.sql 行 189-216 CASE WHEN 賦值邏輯 + SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql 行 54 篩選語法 + DB 驗證共 1,487,695 筆）；architecture-spec.md E07-D BR-7 placeholder 已替換、ASSUMPTION 已移除；(2) **OQ-E07-21 ✅ Resolved**：Stage 1 case_status 篩選 OR 邏輯由 SP fn_SplitString_cte + IN 直接確認（無需業務確認）；(3) **OQ-E07-22 ✅ Resolved**：DB 驗證 ob_list_definition.list_type 619 筆全在合法代碼集，Phase 1b 直接複製 list_type→case_status；(4) **OQ-E07-23 縮窄**：SQL 反推 4 期別 STA_CODE 邏輯，業務確認範圍大幅縮減（僅需確認 '03' vs '04' 語意差異供 tooltip 使用）；(5) **OQ-E07-24 深化**：DB 確認 tbl_id='04' 仍只有 1 筆；SP 分析揭露 CASEYEAR 實為 year_cnt 整數比對（非年份字串），F050 caseyear 欄位語意需重新確認；architecture-spec.md 升至 v2.5 | System Architect Agent |
| 2026-05-12 | **OQ-E07-24 ✅ Resolved**（Spec Writer Agent + 使用者確認）：舊系統前端探查 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235` 證實 CASEYEAR 為 cshtml hard-coded 的 11 個 CheckBox（value `0`~`10`，第 12 個 `99 = 10年以上` 被 Razor 註解掉未啟用），無 AJAX 載入，**不屬 `ob_code_df` 代碼維護範圍**。OBMCODEDF dump `TBL_ID='04'` 該 1 筆紀錄屬其他模組殘留，與 E07 名單定義 CASEYEAR 無關。連動修正：(1) F068 由 4 類降回 3 類（PROD_KIND / SPEC_TP / CASE_STATUS），移除 CASEYEAR 頁籤；(2) F050 / F051 `caseyear` 欄位來源從 `ob_code_df` 改為前端固定 11 個選項（0~10）；(3) AD-E07-14 TBL_ID 映射表移除 `'04'→'CASEYEAR'` 該列，AD 仍有效但範圍縮小至 3 類；(4) data-model.md `ob_code_df` 使用範圍、`ob_list_definition.caseyear` 描述同步更新；(5) error-handling.md `CODE_TYPE_INVALID` 白名單由 4 類降為 3 類；(6) spec-index.md / scope.md 同步描述。architecture-spec.md 升至 v2.6 | Spec Writer Agent |
| 2026-05-12 | **OQ-E07-23 ✅ Resolved**（Spec Writer Agent，依 System Architect Agent SP + DB 實證）：`case_status` 4 個選項的業務語意已由 SP 邏輯（`reference/SP/USP_OB_OBPOOLDATA.sql:189-216`）+ DB 實證（`ob_pool_data` 1,487,695 筆 sta_code 分布）確認，**無需業務主管確認即可結案**。4 值對照：(1) `01` 期中(不含當月滿期) = STA_CODE 05~89 且 (距滿期>1月 OR 剩餘期數>2)，331,577 筆；(2) `02` 中結 = STA_CODE 98，403,504 筆；(3) `03` 滿期(含當月滿期) = STA_CODE 05~89 且 距滿期≤1月 AND 剩餘期數≤2（**仍 active**，4,711 筆）；(4) `04` 滿期 = STA_CODE 90（**已結清完成**，747,903 筆）。`03` vs `04` 根本差異：`03` 仍是 active 處理中（即將到期、未結清），`04` 已完成結清。業務目標（建議）：`03` → 主動續貸、防流失；`04` → 回找維繫、再行銷。連動更新：(1) F050 §5.1.1 新增「case_status 4 個值業務語意對照表」並引用 SP:189-216 與 DB 證據；(2) F051 §5 引用 F050 §5.1.1（避免重複）；(3) data-model.md `ob_list_definition.case_status` 與 `ob_pool_data.list_type` 欄位描述補上業務語意對照與 SP 計算來源；(4) AD-E07-14 Consequences 補註 case_status 4 值業務語意已於 OQ-E07-23 結案時確認，指向 F050 §5.1.1 | Spec Writer Agent |
| 2026-05-13 | test-designer 比對 OBMLISTDF dump 與舊系統 SP 後識別 5 項架構問題，System Architect Agent 依使用者決策全數決議：(1) **OQ-E07-27 ✅ Resolved**：HM 不延續借用 M 計分設定，補建為獨立計分卡（AD-E07-15）；fn_calc_tier_level / Stage 2 呼叫端不修改；業務需透過 F054 補建 HM 計分設定；(2) **OQ-E07-28 ✅ Resolved**：M3/HC/C3 仍在業務使用（OBMLISTDF 實證），需補 ob_tier seed（M3→T5M、HC→THC、C3→T3C，card_level=NULL fallback 語意，移植舊 SP L93–123 硬編碼）；seed SQL 記入 data-model.md `#ob-tier-entity`；(3) **OQ-E07-29 新增（Open）**：HB/SEB/SEC 各 1 筆邊緣 CARD_TYPE，無計分設定無 ob_tier 對應，待業務確認處置；(4) architecture-spec.md 新增 AD-E07-15 + E07-F P5 項 + Fallback 行為備註（fn 修正舊 SP NULL=NULL 行為）；data-model.md ob_tier 補入 CARD_TYPE 覆蓋率表 + M3/HC/C3 seed 規範 + ob_levelcard_level card_level VARCHAR(1) 型別備註 | System Architect Agent |
| 2026-05-14 | **E07 M02 計分設定擴充 DB 層設計**（system-architect）：OQ-E07-32（ob_card_type DB schema 細節）✅ Resolved — Natural PK / 無 prod_kind FK / 無 ON DELETE CASCADE / READ COMMITTED / 應用層 race condition 策略 / CHECK constraints / idx_ob_card_type_status index；OQ-E07-33（PROD_KIND seed 對照表）✅ Resolved — H/S/E/S5/E5→01、M→02（OBMLISTDF dump 實證）；OQ-E07-35（Fallback/Standard 互斥 DB 約束）✅ Resolved — 應用層 Mutex 檢查；OQ-E07-36（TIER_LEVEL 列舉 DB 約束）✅ Resolved — CHECK constraint；新增 architecture-spec.md AD-E07-16（F072 採應用層 Transaction）+ E07-G（D-CT-01/02/03 Migration 設計 + D11 驗證 SQL）+ 風險 13~16（E07 M02 計分設定擴充）；data-model.md `#ob-card-type-entity` 補入完整 DB-level schema / FK 決策 / index / 級聯刪除執行順序；`#ob-tier-entity` 補入 CHECK constraint 設計 / Fallback 互斥約束實作 / Fallback 刪除規範（TypeORM NULL PK silent bug） | System Architect Agent |
| 2026-05-15 | **E07 重構批次 5 — M03b 個別業務比例設定**（Spec Writer Agent）：新增 OQ-E07-40（F083 「相對預設值 vs 相對部門佔比 ÷ 人數」之語意確認；本 spec 採前者，待 PO 確認）；F082 §12 A-1~A-6 / F083 §12 A-1~A-4 / F084 §12 A-1~A-6 / F085 §12 A-1~A-6 全部標 [ASSUMPTION]，主要待 system-architect 處理者：新 `SectionChiefScopeGuard` 設計（F082 A-1）、`PersonnelRatioValidationService` 與 `RatioValidationService` 之模組分離 vs 擴充（F082 A-2）、`PersonnelRatioValidationService.assertAllDeptsSumEquals100(listNo)` SQL JOIN 設計（F084 A-2）、`ob_empl_set.project_workym` 是否補建（F082 A-3，影響跨月份索引）、F082 / F083 / F084 / F085 與 F050 v2.0 §13 `ENABLE_E07_REFACTOR_PHASE3` flag gating（沿用 OQ-E07-37）；待 PO 處理者：F083 模板基準語意（OQ-E07-40）、模板疊加行為（F083 A-2）、業務員離職後 UI 處理（F082 A-5）、無代理處長之 `is_proxy_set` 欄位是否補建（F084 A-6）、跨轄區清空是否需要處長同意機制（F085 A-5） | Spec Writer Agent |
| 2026-05-15 | **E07 重構批次 6 — M03c 簽核 + M03d 準備完成（最後一批）**（Spec Writer Agent）：(1) **OQ-E07-21 ✅ Resolved**：使用者決議 F087 拒絕後採方案 A，F082 頁面頂部主動以 banner 顯示拒絕原因，可關閉 / 可折疊（落地：F087 BR-11 + F082 v1.1 §7.x + GET response `latestRejection` 欄位）；(2) **OQ-E07-40 ✅ Resolved**：使用者決議採「相對 %」UI 顯示語意（落地：F082 v1.1 BR-2a + F083 BR-2a + F057 v1.1 BR-6；DB 儲存值語意待 system-architect 標 [ASSUMPTION] 於 F082 §12 A-7）；(3) 新增 OQ-E07-41（`assignment_approval` PK 設計，建議單 PK UUID，待 system-architect）/ OQ-E07-42（`StageTransitionService.rejectTo` helper 是否新增 vs 重用 `rollbackTo`，建議新增獨立 helper，待 system-architect）/ OQ-E07-43（`MonthlyRunReadinessService.calculateReadiness` 計算策略，建議 MVP 採直接計算，待 system-architect）/ OQ-E07-44（F089 Rollback 後 `assignment_approval` 採 hard delete vs soft delete，建議 hard delete，待 system-architect）/ OQ-E07-45（`monthlyRunReady` 之「Active 名單」定義是否含草稿，建議排除草稿，待 system-architect）；F086 §12 A-1~A-5 / F087 §12 A-1~A-7 / F088 §12 A-1~A-6 / F089 §12 A-1~A-6 全部標 [ASSUMPTION]；**E07 重構 spec-writer 階段 100% 完成**，剩餘事項移交 system-architect / TDD / QA | Spec Writer Agent |
| 2026-05-14 | **E07 M02 計分設定擴充**（spec-writer 依 product-analyst 已建立的 4 個新 Story + 4 個 v2 Story 撰寫）：(1) 將 M02 計分設定 4 Tab 結構擴充為 **5 Tab 結構**，新增 Tab 1「CARD_TYPE 計分卡類型」；(2) 新增 **F069 / F070 / F071 / F072** 4 個 spec（CARD_TYPE 清單 / 新增 / 編輯 / 級聯停用），對應 US-093~096；(3) 既有 spec 升版：F053 → v1.2（補 CARD_TYPE 篩選 AC / PROD_KIND badge / Tab 切換聯動 / 空狀態 / API path 改為 `/scoring/dimensions`）、F054 → v1.2（CARD_TYPE 範圍鎖 BR-7）、F055 → v1.4（CARD_TYPE 範圍鎖 BR-7 + AC-1 改寫）、**F056 → v1.5（breaking）**（TIER_LEVEL HARDCODE T1~T10 列舉 + Fallback/Standard 互斥 + CARD_TYPE 篩選 + 6 個正規 CARD_TYPE 遷移範圍限定 + 後綴值遷移規則 BR-12 + 5 個新 AC + 新 BR-12/13）；(4) 新增 OQ：**OQ-E07-30** ✅ Resolved（ob_list_definition 引用警告但允許）、**OQ-E07-31** ✅ Resolved（後綴 TIER 取前綴數字遷移）、**OQ-E07-34** ✅ Resolved（v1 自動建立規則）、**OQ新-1** ✅ Resolved（級聯不含 ob_pool_data_list）、**OQ新-2** ✅ Resolved（THC → T1）、**OQ-E07-32 / 33 / 34a / 35 / 36** Open（待 system-architect 確認 DB 層細節）；(5) data-model.md 新增 `#ob-card-type-entity` 段、`#ob-tier-entity` 補入 TIER_LEVEL 列舉約束與遷移規則段；(6) error-handling.md 升至 v1.8，新增 5 個錯誤碼（`CARD_TYPE_DUPLICATE` / `CARD_TYPE_NOT_FOUND` / `CARD_TYPE_CASCADE_NOT_CONFIRMED` / `TIER_LEVEL_INVALID_ENUM` / `CARD_TYPE_FALLBACK_STANDARD_MUTEX`），修改 `TIER_LEVEL_DUPLICATE` / `CARD_LEVEL_NOT_FOUND_IN_VERSION` / `SCORING_VERSION_LOCKED` 之說明與相關 Feature 範圍；(7) spec-index.md M02 區段補 F069~F072、E07 P0-MVP Feature 數由 21 升至 25、E07 建議實作順序補 F069→F070→F071→F072；所有新 / 改 spec 均明確標註「Controller 使用 `SalesManagerGuard + @RequireSalesManager()`」；DB 層細節（FK / unique index / cascade / Fallback 互斥約束實作）由 system-architect 後續於 architecture-spec 與 migration 中決定 | Spec Writer Agent |
