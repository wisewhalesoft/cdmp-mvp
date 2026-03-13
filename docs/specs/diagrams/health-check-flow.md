---
spec-id: DIAG-010
title: 自動健康檢查流程圖 (Health Check Flow)
version: "1.0"
date: 2026-03-06
status: Draft
---

# 自動健康檢查流程圖

本圖呈現排程器自動執行資料源健康檢查的完整流程，包含平行測試、紀錄寫入、告警評估與儀表板更新。

## 主要流程

```mermaid
sequenceDiagram
    autonumber
    participant 排程器 as 排程器 (Cron)
    participant API as 後端 API
    participant DB as 應用資料庫
    participant 外部DB1 as 外部資料庫 A
    participant 外部DB2 as 外部資料庫 B
    participant 外部DBn as 外部資料庫 N

    Note over 排程器: 每 30 分鐘觸發一次

    排程器->>API: 觸發健康檢查任務
    API->>DB: 查詢所有活躍資料源<br/>WHERE deleted_at IS NULL
    DB-->>API: 資料源列表 [A, B, ..., N]

    alt 無活躍資料源
        API-->>排程器: 完成（無需檢查）
    else 有活躍資料源
        par 平行測試資料源 A
            API->>API: AES-256 解密 A 的密碼
            API->>外部DB1: 建立連線 + SELECT 1<br/>(10 秒逾時)
            alt 成功
                外部DB1-->>API: 成功 (回應時間: X ms)
                API->>DB: 更新 A: status → Connected<br/>last_tested_at → now()
                API->>DB: 寫入 HealthLog<br/>(success: true, response_time: X)
            else 失敗/逾時
                外部DB1-->>API: 失敗或逾時
                API->>DB: 更新 A: status → Disconnected<br/>last_tested_at → now()
                API->>DB: 寫入 HealthLog<br/>(success: false, error_message)
            end
        and 平行測試資料源 B
            API->>API: AES-256 解密 B 的密碼
            API->>外部DB2: 建立連線 + SELECT 1<br/>(10 秒逾時)
            alt 成功
                外部DB2-->>API: 成功 (回應時間: Y ms)
                API->>DB: 更新 B: status → Connected
                API->>DB: 寫入 HealthLog (success: true)
            else 失敗/逾時
                外部DB2-->>API: 失敗或逾時
                API->>DB: 更新 B: status → Disconnected
                API->>DB: 寫入 HealthLog (success: false)
            end
        and 平行測試資料源 N
            API->>API: AES-256 解密 N 的密碼
            API->>外部DBn: 建立連線 + SELECT 1<br/>(10 秒逾時)
            alt 成功
                外部DBn-->>API: 成功 (回應時間: Z ms)
                API->>DB: 更新 N: status → Connected
                API->>DB: 寫入 HealthLog (success: true)
            else 失敗/逾時
                外部DBn-->>API: 失敗或逾時
                API->>DB: 更新 N: status → Disconnected
                API->>DB: 寫入 HealthLog (success: false)
            end
        end

        Note over API,DB: 所有測試完成後進行告警評估

        API->>DB: 查詢各資料源最近<br/>連續失敗次數
        DB-->>API: 連續失敗統計

        loop 針對每個連續失敗 >= 2 的資料源
            API->>DB: 建立或更新告警紀錄
        end

        API-->>排程器: 健康檢查完成
    end
```

## 告警評估邏輯

```mermaid
flowchart TD
    A["健康檢查完成"] --> B["查詢各資料源最近 HealthLog"]
    B --> C{連續失敗次數 >= 2?}
    C -- 是 --> D["產生告警<br/>加入告警列表"]
    C -- 否 --> E{之前有告警?}
    E -- 是 --> F["解除告警"]
    E -- 否 --> G["無需處理"]
    D --> H["告警可於儀表板查看<br/>GET /api/datasources/alerts"]
    F --> H
    G --> H
```

## 儀表板資料來源

```mermaid
flowchart LR
    subgraph 儀表板API["儀表板 API 端點"]
        Dashboard["GET /api/datasources/dashboard<br/>摘要卡片資料"]
        Alerts["GET /api/datasources/alerts<br/>告警列表"]
        Metrics["GET /api/datasources/:id/metrics<br/>單一資料源指標"]
    end

    subgraph 資料來源["資料來源"]
        DS["Datasource 表<br/>status 統計"]
        HL["DatasourceHealthLog 表<br/>歷史趨勢"]
    end

    DS --> Dashboard
    HL --> Dashboard
    DS --> Alerts
    HL --> Alerts
    HL --> Metrics

    subgraph 儀表板元件["前端儀表板元件"]
        Cards["摘要卡片<br/>Connected / Disconnected /<br/>Unknown 數量"]
        Trend["趨勢圖表<br/>歷史成功/失敗比例"]
        Pie["圓餅圖<br/>各狀態佔比"]
        AlertList["告警列表<br/>需關注的資料源"]
    end

    Dashboard --> Cards
    Dashboard --> Trend
    Dashboard --> Pie
    Alerts --> AlertList
```

## 排程器規格

| 項目 | 說明 |
|------|------|
| 執行頻率 | 每 30 分鐘 |
| 檢查範圍 | 所有 `deleted_at IS NULL` 的 Datasource |
| 執行方式 | 平行測試所有資料源 |
| 單一逾時 | 10 秒 |
| 紀錄寫入 | 每筆測試結果寫入 DatasourceHealthLog |
| 狀態更新 | 每筆測試後更新對應 Datasource 的 status 與 last_tested_at |

## 告警規則

| 項目 | 說明 |
|------|------|
| 觸發條件 | 同一資料源連續失敗次數 >= 2 |
| 告警內容 | 資料源名稱、類型、最後錯誤訊息、連續失敗次數 |
| 解除條件 | 資料源重新測試成功（連續失敗歸零） |
| 查看方式 | `GET /api/datasources/alerts` |

## 儀表板元件

| 元件 | API 端點 | 資料來源 | 說明 |
|------|---------|---------|------|
| 摘要卡片 | `GET /api/datasources/dashboard` | Datasource.status 統計 | 顯示 Connected / Disconnected / Unknown 數量 |
| 趨勢圖表 | `GET /api/datasources/dashboard` | DatasourceHealthLog 歷史 | 顯示一段時間內的成功/失敗趨勢 |
| 圓餅圖 | `GET /api/datasources/dashboard` | Datasource.status 統計 | 各狀態佔比視覺化 |
| 告警列表 | `GET /api/datasources/alerts` | HealthLog 連續失敗統計 | 列出所有需關注的資料源 |
| 單一指標 | `GET /api/datasources/:id/metrics` | DatasourceHealthLog | 單一資料源的歷史回應時間與成功率 |
