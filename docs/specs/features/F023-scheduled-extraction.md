---
spec-id: F023
title: 排程自動執行
feature-id: F023
source-story: US-036
epic: E04
priority: P0-MVP
version: "1.0"
date: 2026-03-17
status: Draft
---

# F023: 排程自動執行

## 1. 功能摘要

系統排程引擎依據每個擷取任務設定的 cron 表達式，自動在排定時間觸發擷取作業。排程引擎擴展現有 `@nestjs/schedule` 模組，與手動觸發（F021）共用相同的執行邏輯。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 擷取任務能依設定的排程自動執行
**So that** 資料可以定期自動更新，無需手動觸發

## 3. 前置條件

- 系統中存在已啟用且未軟刪除的擷取任務
- 擷取任務已設定合法的 cron 表達式

## 4. 驗收標準

### AC-1: 依排程自動執行

- **Given** 系統中有已啟用的擷取任務，且設定了 cron 排程
- **When** 到達排程觸發時間
- **Then** 系統自動執行該擷取任務，建立 ExtractionLog（`triggered_by = 'schedule'`），更新任務狀態與執行結果

### AC-2: 跳過停用任務

- **Given** 某擷取任務的 `enabled` 為 `false`
- **When** 到達該任務的排程觸發時間
- **Then** 系統跳過該任務，不執行擷取作業，不建立 ExtractionLog

### AC-3: 跳過執行中任務

- **Given** 某擷取任務的 `status` 為 `running`
- **When** 到達該任務的排程觸發時間
- **Then** 系統跳過該任務，避免重複執行，待當前執行完成後由下次排程觸發

### AC-4: 排程執行記錄

- **Given** 排程自動執行完成
- **When** Admin 查看該任務的日誌
- **Then** ExtractionLog 的 `triggered_by` 欄位為 `schedule`，可與手動觸發區分

### AC-5: 軟刪除任務排除

- **Given** 某擷取任務已被軟刪除（`deleted_at IS NOT NULL`）
- **When** 排程引擎掃描待執行任務
- **Then** 系統排除該任務，不納入排程觸發範圍

## 5. 主要流程

1. 主排程以固定頻率（每分鐘）掃描所有符合條件的任務
2. 篩選條件：`enabled = true AND deleted_at IS NULL AND status != 'running'`
3. 對每個符合條件的任務，使用 `cron-parser` 比對 cron 表達式是否符合當前時間
4. 符合條件的任務觸發執行（複用 F021 的執行邏輯，`triggered_by = 'schedule'`）
5. 建立 ExtractionLog（`status = 'running'`, `triggered_by = 'schedule'`）
6. 更新 ExtractionTask（`status = 'running'`）
7. 執行擷取作業（非同步）
8. 執行完成後更新 ExtractionLog 與 ExtractionTask

## 6. 替代流程

- 無（此功能為純後端自動化流程，無 UI 互動）

## 7. 邊界情況

- 多任務同時到達排程時間：各自獨立執行，互不影響
- 排程引擎啟動時有未完成的 running 任務：跳過該任務，不重複觸發
- Cron 表達式 `0 2 * * *` 以 UTC 解析：每日 UTC 02:00（即台北時間 10:00）觸發
- 伺服器重啟後排程恢復：排程引擎隨應用啟動自動恢復，不補執行錯過的排程

## 8. API 規格

此功能無獨立 API 端點。排程引擎為後端內部元件，複用以下端點的執行邏輯：
- 執行邏輯同 `POST /api/v1/extraction-tasks/:id/run`（F021）

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 排程引擎以固定頻率（每分鐘）掃描待執行任務 |
| BR-2 | 篩選條件：`enabled = true AND deleted_at IS NULL AND status != 'running'` |
| BR-3 | Cron 表達式以 UTC 時區解析 |
| BR-4 | 排程觸發與手動觸發共用相同的執行流程，差異僅在 `triggered_by` 欄位 |
| BR-5 | 並發控制：同一任務同時只能有一個執行實例 |
| BR-6 | 排程引擎擴展現有 `@nestjs/schedule` 模組 |
| BR-7 | Cron 表達式解析使用 `cron-parser` 或同等套件 |
| BR-8 | 伺服器重啟後排程自動恢復，不補執行錯過的排程 |
| BR-9 | 排程觸發時，ExtractionLog.created_by 使用 `task.createdBy`（即該擷取任務的建立者 User ID）；`triggered_by = 'schedule'` 欄位已足以區分排程觸發與手動觸發，無需另設系統帳號 |

## 10. 技術設計要點

- 排程引擎設計為 NestJS 排程服務（`@Cron` 或 `@Interval`）
- 主排程每分鐘執行一次掃描
- 掃描邏輯：
  1. 查詢所有符合條件的 ExtractionTask
  2. 以 `cron-parser` 解析每個任務的 cron 表達式
  3. 比對是否符合當前時間（精確到分鐘）
  4. 符合條件者呼叫共用的執行服務
- 共用執行邏輯須為可注入的服務（ExtractionExecutionService），供排程與手動觸發共用

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 排程掃描期間資料庫不可用     | 記錄錯誤至日誌，下次掃描重試                         | error-handling.md#system-errors          |
| 執行失敗                     | 任務 status 設為 failed，ExtractionLog 記錄錯誤      | error-handling.md#extraction-errors      |
| Cron 表達式解析失敗          | 跳過該任務，記錄警告至系統日誌                       | error-handling.md#validation-errors      |

## 12. 相依性

- **F017（建立擷取任務）**：需有擷取任務存在
- **F020（啟用／停用擷取任務）**：排程引擎需檢查 `enabled` 狀態
- **F021（立即執行／重新執行）**：共用執行邏輯
- **@nestjs/schedule 模組**：排程引擎基礎
- **cron-parser 套件**：Cron 表達式解析

## 13. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- ExtractionLog 實體：參見 [data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)、[data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)
- 相關功能：[F017](F017-create-extraction-task.md)、[F020](F020-toggle-extraction-task.md)、[F021](F021-run-extraction-task.md)
