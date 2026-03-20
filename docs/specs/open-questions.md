---
spec-id: CDMP-OQ
title: 待決事項與開放問題
version: "1.2"
date: 2026-03-19
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
| R17 | 目標表規劃方法？ | Domain-Oriented 設計（4 個 Domain Data Product） | E05 epic-brief |

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

## 假設清單

以下為 SPEC 撰寫過程中採用的假設，需於架構設計階段驗證：

| # | 假設 | 來源 | 驗證方式 |
|---|------|------|---------|
| A1 | JWT 為 Session 管理的唯一機制 | US-001 Technical Notes | 架構師確認 |
| A2 | 系統僅有 Admin 與 User 兩種角色 | stories/overview.md | 產品確認 |
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
