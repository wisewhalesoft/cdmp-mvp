---
spec-id: CDMP-OQ
title: 待決事項與開放問題
version: "1.0"
date: 2026-03-06
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

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-06 | 初版建立 | Spec Writer Agent |
| 2026-03-06 | OQ-1 ~ OQ-13 全部解決；OQ-7 決議移除稽核日誌，已同步更新 US-014 與 F008 | Product Owner |
