---
spec-id: overview
title: 系統總覽
version: "1.2"
date: 2026-03-19
status: Draft
---

# 系統總覽

## 專案資訊

| 項目 | 內容 |
|------|------|
| 專案名稱 | CDMP（Customer Data Management Platform）企業客戶資料治理平台 |
| 版本 | v1.0（MVP） |
| 文件日期 | 2026-03-06 |
| 來源 PRD | [stories/overview.md](../stories/overview.md) |

## 產品願景

CDMP 是一套企業級客戶資料治理平台，旨在為組織內部團隊提供統一的資料來源管理能力。MVP 階段聚焦於五大核心能力：安全驗證與登入、帳號與角色管理、資料來源（資料庫連線）的設定與監控、資料擷取管理（從外部資料來源讀取資料並搬移至 CDMP AppDB）、以及 ETL Pipeline 管理（透過視覺化編輯器組合 Extract / Transform / Load 節點，將 raw data 轉換後載入 Domain-Oriented 目標表）。

## 產品目標

1. **建立安全的身份驗證基礎** — 透過 JWT Token 機制與 RBAC 角色控制，確保平台存取安全性
2. **提供完整的帳號生命週期管理** — 讓 Admin 能夠建立、查看、編輯、停用帳號及管理角色指派
3. **實現資料來源的集中化管理** — 支援 MySQL、PostgreSQL、SQL Server 三種資料庫類型的連線設定、測試與健康監控
4. **實現資料擷取與落地** — 從外部資料來源讀取指定的來源資料表，將 raw data 真正搬移至 CDMP AppDB 的動態建立表中，支援全量與增量兩種擷取模式
5. **實現 ETL Pipeline 資料轉換** — 透過視覺化拖拉式編輯器組合 Extract / Transform（13 種轉換節點）/ Load 節點，將 raw data 經轉換處理後載入 Domain-Oriented 目標表（Customer Core / Interaction / Financial / Service），支援版本管理、三階段發布流程、排程自動執行與監控儀表板
6. **確保憑證安全** — 使用者密碼以 bcrypt 雜湊儲存，資料庫連線密碼以 AES-256 加密儲存

## 非目標（Non-Goals）

- 本版本不提供 SSO / LDAP 整合（規劃於 Phase 2）
- 本版本不提供雙向資料同步功能（僅支援單向擷取至 AppDB）
- 本版本不提供稽核日誌與操作歷程（規劃於 Phase 2）
- 本版本不提供 User 角色的功能存取權管控（User 登入後僅顯示說明頁面）
- 本版本不定義特定技術棧（技術選型由架構師決定）

## 目標使用者

### Admin（管理者）

- **角色定位**：平台的主要操作者，負責所有管理功能
- **職責範圍**：帳號建立與管理、角色指派、資料來源設定與監控、密碼重設
- **存取權限**：完整存取所有 API 端點與管理後台功能
- **典型場景**：IT 管理員、資料團隊主管、系統管理員

### User（使用者）

- **角色定位**：一般平台使用者（MVP 階段功能受限）
- **職責範圍**：登入平台、自助式密碼重設
- **存取權限**：僅能登入與查看說明頁面，無法存取管理功能
- **典型場景**：資料分析師、業務人員（Phase 2 將開放更多功能）
- **MVP 限制**：登入後顯示「目前尚無可用功能，請聯絡您的管理員。」

## 系統邊界

### 系統內部（In-System）

- 登入 / 登出 / Session 管理
- 帳號 CRUD 與角色管理
- 資料來源 CRUD、連線測試、健康監控
- 資料擷取任務管理（建立、編輯、執行、排程、監控）
- Raw data 落地（動態建表、批次寫入 AppDB、分頁預覽）
- ETL Pipeline 管理（建立、視覺化編輯、執行、排程、版本管理、監控）
- Domain-Oriented 目標表（customer_core / customer_interaction / customer_financial / customer_service）
- 密碼重設流程（自助式與 Admin 代為重設）

### 系統外部（External Dependencies）

- **外部資料來源**：MySQL、PostgreSQL、SQL Server 實例（連線測試、健康檢查、資料擷取的對象）
- **Email 服務**：SMTP 或第三方 Email 服務（用於密碼重設連結寄送）
- **瀏覽器**：使用者透過現代瀏覽器存取平台

### 系統架構概覽

參見 [系統上下文圖](diagrams/system-context.md) 與 [容器架構圖](diagrams/container-architecture.md)

## 成功指標

| 指標 | 目標值 | 量測方式 |
|------|--------|----------|
| API 回應時間（p95） | < 500ms | 負載測試工具（k6 / JMeter） |
| 並發使用者支援 | >= 100 人 | 負載測試 |
| 連線測試逾時 | <= 10 秒 | 自動化測試 |
| 儀表板載入時間 | < 2 秒（50 個資料來源） | 前端效能測試 |
| 清單分頁回應時間 | < 500ms（1,000 筆以內） | API 效能測試 |
| 安全性 | 零明文密碼 / 憑證洩漏 | 程式碼審查 + OWASP 掃描 |

## 關鍵假設

1. 目標使用者規模為 500+ 人的企業內部團隊
2. Admin 為少數人（預估 5-10 人），User 為多數
3. 資料來源數量在 MVP 階段預估不超過 50 個
4. 系統不需要離線存取能力
5. Email 服務（用於密碼重設）在部署環境中可用

## 關鍵限制

1. MVP 僅支援兩種角色：Admin 與 User，不支援自訂角色
2. MVP 中 User 角色無任何可操作功能，僅能登入查看說明頁面
3. 技術棧尚未決定 — 本規格書保持技術中立，不指定特定框架或資料庫引擎
4. 不提供帳號鎖定機制（登入失敗次數限制延後至後續版本）

## 文件導讀指南

本規格書套件採用模組化架構，每個檔案聚焦單一關注點。下游 Agent 或工程師應先閱讀 [spec-index.md](spec-index.md) 作為入口，再依需求載入對應檔案。

| 閱讀順序 | 檔案 | 用途 |
|----------|------|------|
| 1 | spec-index.md | 路由表 — 查詢所有檔案位置與狀態 |
| 2 | overview.md（本檔案） | 了解專案全貌與系統邊界 |
| 3 | scope.md | 確認 MVP 範圍與排除項目 |
| 4 | features/F###-*.md | 查看特定功能的完整規格與驗收標準 |
| 5 | nfr.md | 了解效能與安全性要求 |
| 6 | data-model.md | 了解資料實體與關聯 |
| 7 | error-handling.md | 了解錯誤處理慣例與錯誤碼 |

### 文件慣例

- **語言**：所有內容以繁體中文撰寫，技術名詞（API、JWT、bcrypt 等）保留英文
- **Feature ID**：F001-F037 連續編號，對應 User Story ID
- **優先級**：P0-MVP（Must Have）、P1（Should Have）
- **驗收標準格式**：Given / When / Then
- **交叉參照**：使用相對路徑連結其他檔案
