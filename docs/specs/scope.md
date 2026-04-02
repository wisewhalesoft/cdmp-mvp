---
spec-id: scope
title: 範圍定義
version: "1.3"
date: 2026-03-25
status: Draft
---

# 範圍定義

## MVP 範圍內（In Scope）

### Epic 總覽

| Epic ID | Epic 名稱 | Stories 數量 | 階段 |
|---------|-----------|-------------|------|
| E01 | 驗證與登入 | 3 | Phase 1（MVP） |
| E02 | 帳號與角色管理 | 7 | Phase 1（MVP） |
| E03 | 資料來源管理 | 6 | Phase 1（MVP） |
| E04 | 資料擷取管理 | 10 | Phase 1（MVP） |
| E05 | ETL Pipeline 管理 | 10 | Phase 1（MVP） |

### 功能對照表

| Feature ID | User Story ID | Epic | 功能名稱 | 優先級 | 簡述 |
|------------|--------------|------|----------|--------|------|
| F001 | US-001 | E01 | Admin 登入 | P0-MVP | Admin 以 Email/密碼登入，取得 JWT Token，支援「記住我」 |
| F002 | US-002 | E01 | User 登入 | P0-MVP | User 以 Email/密碼登入，導向 MVP 說明頁面 |
| F003 | US-003 | E01 | 登出 | P0-MVP | 使 Token 失效、清除用戶端 Session、導回登入頁 |
| F004 | US-010 | E02 | 建立帳號 | P0-MVP | Admin 建立新帳號（姓名、Email、密碼、角色） |
| F005 | US-011 | E02 | 查看帳號清單 | P0-MVP | 分頁清單含搜尋、篩選（角色、狀態） |
| F006 | US-012 | E02 | 編輯帳號 | P0-MVP | 編輯帳號姓名與 Email |
| F007 | US-013 | E02 | 停用／啟用帳號 | P1 | 停用或重新啟用帳號，停用時強制登出 |
| F008 | US-014 | E02 | 指派／變更角色 | P0-MVP | 變更帳號角色（Admin/User），保護最後一位 Admin |
| F009 | US-015 | E02 | 自助式密碼重設 | P0-MVP | 透過 Email 連結自行重設密碼 |
| F010 | US-016 | E02 | Admin 重設使用者密碼 | P0-MVP | Admin 替其他使用者重設密碼 |
| F011 | US-020 | E03 | 新增資料來源 | P0-MVP | 建立資料庫連線設定（MySQL/PostgreSQL/SQL Server） |
| F012 | US-021 | E03 | 查看資料來源清單 | P0-MVP | 清單/卡片顯示模式，含搜尋篩選 |
| F013 | US-022 | E03 | 編輯資料來源 | P0-MVP | 編輯連線設定，密碼條件式更新 |
| F014 | US-023 | E03 | 刪除資料來源 | P1 | 軟刪除（設定 deleted_at），需確認對話框 |
| F015 | US-024 | E03 | 測試連線 | P0-MVP | 手動測試資料來源連線，10 秒逾時 |
| F016 | US-025 | E03 | 狀態監控儀表板 | P1 | 摘要卡片、狀態列表、趨勢圖、圓餅圖、告警列表 |
| F017 | US-030 | E04 | 建立擷取任務 | P0-MVP | 建立全量/增量擷取任務，從下拉選單選擇來源 schema 與資料表，設定排程，系統自動於 AppDB 建立 raw data 表 |
| F018 | US-031 | E04 | 查看擷取任務清單 | P0-MVP | 分頁清單含搜尋、篩選、統計卡片 |
| F019 | US-032 | E04 | 編輯擷取任務 | P0-MVP | 編輯任務設定，執行中不可編輯 |
| F020 | US-033 | E04 | 啟用／停用擷取任務 | P0-MVP | 啟用或停用擷取任務，控制排程觸發 |
| F021 | US-034 | E04 | 立即執行／重新執行 | P0-MVP | 手動觸發執行：從外部 DB 讀取資料，動態建表，批次寫入 AppDB raw data 表 |
| F022 | US-035 | E04 | 查看擷取日誌 | P0-MVP | 查看任務執行歷史日誌 |
| F023 | US-036 | E04 | 排程自動執行 | P0-MVP | 依 cron 排程自動觸發擷取任務 |
| F024 | US-037 | E04 | 擷取監控儀表板 | P1 | 統計卡片、趨勢圖、進度條、失敗清單、效能排名 |
| F025 | US-038 | E04 | 刪除擷取任務 | P1 | 軟刪除擷取任務，日誌保留 |
| F026 | US-039 | E04 | 查看擷取資料預覽 | P0-MVP | 分頁瀏覽 AppDB 中已擷取的 raw data，支援欄位排序 |
| F027 | US-040 | E05 | 查看 Pipeline 列表 | P0-MVP | 統計卡片、分頁清單、搜尋篩選 |
| F028 | US-041 | E05 | 建立 Pipeline | P0-MVP | 建立 Pipeline，設定名稱、描述、排程 |
| F029 | US-042, US-058 | E05 | 視覺化轉換編輯器 | P0-MVP | 拖拉式編輯器，13 種 Transform 節點，JSONB 定義儲存；Lookup 節點雙輸入模式（lookup-input Handle） |
| F030 | US-043 | E05 | 執行 Pipeline | P0-MVP | 手動/測試/排程執行，進度 Polling，重新執行 |
| F031 | US-044 | E05 | 啟用／停用 Pipeline | P0-MVP | 控制排程觸發，啟用需有 published 版本 |
| F032 | US-045 | E05 | 查看 Pipeline 日誌 | P0-MVP | 執行歷史列表、節點級詳情、測試標記 |
| F033 | US-046 | E05 | Pipeline 版本管理 | P1 | 版本清單、Diff 比對、回滾、發布流程 |
| F034 | US-047 | E05 | 刪除 Pipeline | P1 | 軟刪除，日誌保留 |
| F035 | US-048 | E05 | Pipeline 監控儀表板 | P1 | 統計卡片、趨勢圖、進度條、失敗清單、效能排名 |
| F036 | US-049 | E05 | 目標表 Domain-Oriented 規劃 | P0-MVP | 1 個 Domain Data Product 目標表（customer_core，85 欄位），schema API，欄位對應，來源：ZZIP_BAMCUST_M + MLMCUSTOMER |
| F037 | US-050 | E05 | 發布 Pipeline 版本 | P0-MVP | 版本狀態從 draft 轉為 published，發布後不可修改 |
| F038 | US-051 | E04/E05 | 孤兒任務回收 | P0-MVP | 系統啟動時自動修復 running 狀態的孤兒任務 |
| F039 | US-042 | E05 | 節點欄位變化統計 Badge | P0-MVP | 編輯器節點上顯示欄位數量 Badge |
| F040 | US-042 | E05 | Inspector Panel 欄位 Diff | P1 | 欄位 Diff 對比面板 |
| F041 | US-042 | E05 | Badge Hover Tooltip | P2 | Badge 懸停提示框 |
| F042 | US-055 | E05 | ETL 執行引擎核心框架 | P0-MVP | DAG 拓撲排序、Node Dispatcher、nodeOutputMap、temp table 管理 |
| F043 | US-056, US-057, US-058 | E05 | ETL 節點執行器 | P0-MVP | 8 種 NodeExecutor（extract, merge, dedup, type_cast, derived_field, field_mapping, conditional, lookup），含 Lookup 雙輸入模式 |
| F044 | US-057 | E05 | Target Load + UPSERT | P0-MVP | 批次寫入目標表、ETL 追蹤欄位填充、UPSERT 衝突處理 |

### 非功能需求

| NFR ID | 名稱 | 優先級 | 規格檔案 |
|--------|------|--------|----------|
| NFR-001 | 安全性 | P0 | [nfr.md](nfr.md) |
| NFR-002 | 效能 | P0 | [nfr.md](nfr.md) |

## MVP 範圍外（Out of Scope）

以下項目明確排除於 MVP 範圍，不應在本版本實作：

| 排除項目 | 說明 | 規劃階段 |
|----------|------|----------|
| SSO / LDAP 整合 | Microsoft Entra ID（Azure AD）登入 | Phase 2 |
| 稽核日誌與操作歷程 | 記錄所有使用者操作的完整稽核軌跡 | Phase 2 |
| 進階資料同步 | 雙向同步、增量合併等進階同步策略 | Phase 2 |
| 進階資料來源類型 | API 端點、檔案上傳等非資料庫類型 | Phase 2 |
| CSV 批次匯入帳號 | 大量帳號建立功能 | 不納入任何階段規劃 |
| 連線池（Connection Pooling） | 資料庫連線池管理 | 待有資料同步排程需求時引入 |
| User 角色功能存取控制 | User 登入後可操作的功能模組 | Phase 2 |
| 帳號鎖定機制 | 登入失敗次數限制與帳號鎖定 | 後續版本 |
| Email 驗證 | 帳號建立時的 Email 驗證流程 | 不需要（Admin 建立即可用） |
| 多語系支援 | 平台介面多國語言切換 | 未規劃 |
| 行動裝置原生應用 | iOS / Android App | 未規劃 |
| Raw Data 全量匯出 | 擷取資料的 CSV/Excel 匯出下載功能 | Phase 2 |

## 假設

1. **部署環境**：系統部署於企業內部網路或私有雲環境，具備 HTTPS 支援
2. **Email 服務可用**：密碼重設功能依賴 Email 寄送服務（SMTP 或第三方服務如 SendGrid）
3. **初始 Admin**：系統部署時需透過 seed 機制或手動建立至少一個 Admin 帳號
4. **瀏覽器相容性**：目標使用者使用現代瀏覽器（Chrome、Firefox、Edge、Safari 最新兩個主要版本）
5. **目標資料庫可達性**：Admin 設定的資料庫主機在網路上可從 CDMP 伺服器連線
6. **時區**：系統時間戳記統一使用 UTC

## 依賴關係

### Epic 間依賴

```
E01（驗證與登入）
 ├── 封鎖 → E02（帳號管理需要 Admin 已完成驗證）
 ├── 封鎖 → E03（資料來源管理需要 Admin 已完成驗證）
 ├── 封鎖 → E04（資料擷取管理需要 Admin 已完成驗證）
 └── 封鎖 → E05（ETL Pipeline 管理需要 Admin 已完成驗證）
E03（資料來源管理）
 └── 封鎖 → E04（擷取任務需要資料來源存在）
E04（資料擷取管理）
 └── 封鎖 → E05（ETL Pipeline 需讀取 raw data 表）
```

- E01 為基礎 Epic，無外部依賴
- E02 依賴 E01：Admin 必須完成驗證才能執行帳號管理操作
- E03 依賴 E01：Admin 必須完成驗證才能執行資料來源管理操作
- E04 依賴 E01 與 E03：Admin 已驗證且需有資料來源才能建立擷取任務
- E05 依賴 E01 與 E04：Admin 已驗證且需有擷取任務產生 raw data 表
- E02 與 E03 之間無直接依賴，可平行開發（前提是 E01 已完成）
- E04 需 E03 完成後才能開始（前提是 E01 也已完成）
- E05 需 E04 完成後才能開始（Extract 節點讀取 raw data 表）

### 功能間依賴（關鍵路徑）

| 功能 | 被依賴（Blocked By） | 封鎖（Blocks） |
|------|---------------------|----------------|
| F001 Admin 登入 | 無 | F003, F004, F005, F011 |
| F002 User 登入 | 無 | F003 |
| F003 登出 | F001, F002 | 無 |
| F004 建立帳號 | F001 | F005, F006, F007, F008, F009, F010 |
| F005 查看帳號清單 | F001, F004 | F006, F007, F008, F010 |
| F009 自助式密碼重設 | F004 | 無 |
| F011 新增資料來源 | F001 | F012, F013, F014, F015, F016 |
| F012 查看資料來源清單 | F011 | F013, F014, F015 |
| F015 測試連線 | F011 | F016 |
| F016 狀態監控儀表板 | F011, F015 | 無 |
| F017 建立擷取任務 | F001, F011 | F018, F019, F020, F021, F022, F023, F024, F025 |
| F018 查看擷取任務清單 | F017 | F019, F025 |
| F019 編輯擷取任務 | F017, F018 | 無 |
| F020 啟用／停用擷取任務 | F017 | 無 |
| F021 立即執行／重新執行 | F017 | F022, F023, F024, F026 |
| F022 查看擷取日誌 | F021 | F026 |
| F023 排程自動執行 | F017, F021 | 無 |
| F024 擷取監控儀表板 | F018, F021, F022 | 無 |
| F025 刪除擷取任務 | F017, F018 | 無 |
| F026 查看擷取資料預覽 | F021, F022 | 無 |
| F027 查看 Pipeline 列表 | 無 | F028 |
| F028 建立 Pipeline | 無 | F029, F031, F034 |
| F029 視覺化轉換編輯器 | F028 | F030, F033 |
| F030 執行 Pipeline | F029 | F032, F035 |
| F031 啟用／停用 Pipeline | F028, F033 | 無 |
| F032 查看 Pipeline 日誌 | F030 | 無 |
| F033 Pipeline 版本管理 | F029, F030 | 無 |
| F034 刪除 Pipeline | F028 | 無 |
| F035 Pipeline 監控儀表板 | F030, F032 | 無 |
| F036 目標表 Domain-Oriented | F029, F017（US-030 代碼對照表） | F044 |
| F037 發布 Pipeline 版本 | F030 | F031 |
| F038 孤兒任務回收 | F021, F030 | 無 |
| F039 節點欄位 Badge | F029 | F040, F041 |
| F040 Inspector Panel 欄位 Diff | F039 | F041 |
| F041 Badge Hover Tooltip | F039, F040 | 無 |
| F042 ETL 執行引擎核心框架 | F030 | F043, F044 |
| F043 ETL 節點執行器（含 Lookup） | F042 | F044 |
| F044 Target Load + UPSERT | F042, F043, F036 | 無 |

### 外部依賴

| 依賴項目 | 用途 | 影響功能 |
|----------|------|----------|
| Email 寄送服務（SMTP / SendGrid） | 密碼重設連結寄送 | F009 |
| 目標資料庫實例 | 連線測試、健康檢查、資料擷取 | F015, F016, F021, F023 |
| HTTPS / TLS 憑證 | 傳輸加密 | 全部功能 |

## Phase 2 預覽

以下為 Phase 2 規劃的重點方向（僅供參考，詳細規格待 Phase 1 完成後制定）：

1. **Microsoft Entra ID（Azure AD）SSO 整合** — 企業單一登入
2. **User 角色功能存取控制** — 開放 User 角色可操作的功能模組
3. **資料同步排程** — 自動化資料抽取與同步
4. **進階資料來源類型** — 支援 API 端點、檔案上傳等
5. **稽核日誌與操作歷程** — 完整的操作追蹤與合規性記錄
