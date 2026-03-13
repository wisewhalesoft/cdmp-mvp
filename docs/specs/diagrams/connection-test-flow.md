---
spec-id: DIAG-009
title: 連線測試流程圖 (Connection Test Flow)
version: "1.0"
date: 2026-03-06
status: Draft
---

# 連線測試流程圖

本圖呈現管理員手動觸發資料源連線測試的完整流程，涵蓋成功、失敗與逾時情境。

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 管理員
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫
    participant 外部DB as 外部資料庫

    Admin->>前端: 點擊「測試連線」
    前端->>前端: 顯示測試中狀態（Loading）
    前端->>API: POST /api/datasources/:id/test<br/>Header: Authorization: Bearer {JWT}

    API->>API: 驗證請求者權限 (Admin)
    API->>DB: 查詢 Datasource (by id)
    DB-->>API: Datasource

    alt 資料源不存在或已刪除
        API-->>前端: 404 "資料源不存在"
        前端-->>Admin: 顯示錯誤訊息
    else 資料源存在
        API->>API: AES-256 解密 encrypted_password
        API->>API: 根據 type 建立資料庫連線<br/>(MySQL:3306 / PostgreSQL:5432 /<br/>SQL Server:1433)
        API->>API: 設定連線逾時 = 10 秒

        alt 連線成功
            API->>外部DB: 建立 TCP 連線
            外部DB-->>API: 連線已建立
            API->>外部DB: SELECT 1
            外部DB-->>API: 查詢成功（記錄回應時間）
            API->>外部DB: 關閉連線
            API->>DB: 更新 Datasource<br/>status → Connected<br/>last_tested_at → now()
            API->>DB: 寫入 DatasourceHealthLog<br/>(success: true,<br/>response_time_ms: N)
            DB-->>API: 確認寫入
            API-->>前端: 200 {status: "Connected",<br/>responseTime: N ms}
            前端-->>Admin: 顯示連線成功<br/>回應時間: N ms

        else 驗證失敗（帳號密碼錯誤）
            API->>外部DB: 建立 TCP 連線
            外部DB-->>API: 驗證失敗 (Auth Error)
            API->>DB: 更新 Datasource<br/>status → Disconnected<br/>last_tested_at → now()
            API->>DB: 寫入 DatasourceHealthLog<br/>(success: false,<br/>error_message: "驗證失敗")
            DB-->>API: 確認寫入
            API-->>前端: 200 {status: "Disconnected",<br/>error: "驗證失敗"}
            前端-->>Admin: 顯示連線失敗<br/>原因: 驗證失敗

        else 連線被拒絕（主機/埠號錯誤）
            API->>外部DB: 嘗試建立 TCP 連線
            外部DB-->>API: Connection Refused
            API->>DB: 更新 Datasource<br/>status → Disconnected<br/>last_tested_at → now()
            API->>DB: 寫入 DatasourceHealthLog<br/>(success: false,<br/>error_message: "連線被拒絕")
            DB-->>API: 確認寫入
            API-->>前端: 200 {status: "Disconnected",<br/>error: "連線被拒絕"}
            前端-->>Admin: 顯示連線失敗<br/>原因: 連線被拒絕

        else 逾時（超過 10 秒）
            API->>外部DB: 嘗試建立 TCP 連線
            Note over API,外部DB: 等待超過 10 秒...
            API->>API: 觸發逾時中斷
            API->>DB: 更新 Datasource<br/>status → Disconnected<br/>last_tested_at → now()
            API->>DB: 寫入 DatasourceHealthLog<br/>(success: false,<br/>error_message: "連線逾時 (10s)")
            DB-->>API: 確認寫入
            API-->>前端: 200 {status: "Disconnected",<br/>error: "連線逾時"}
            前端-->>Admin: 顯示連線失敗<br/>原因: 連線逾時
        end
    end
```

## 連線測試邏輯摘要

```mermaid
flowchart TD
    A["管理員觸發測試"] --> B["查詢資料源"]
    B --> C{資料源存在?}
    C -- 否 --> D["回傳 404"]
    C -- 是 --> E["AES-256 解密密碼"]
    E --> F["根據 type 建立連線<br/>(10 秒逾時)"]
    F --> G{連線結果}
    G -- 成功 --> H["SELECT 1"]
    H --> I["記錄回應時間"]
    I --> J["status → Connected"]
    G -- 驗證失敗 --> K["status → Disconnected<br/>錯誤: 驗證失敗"]
    G -- 連線被拒 --> L["status → Disconnected<br/>錯誤: 連線被拒絕"]
    G -- 逾時 --> M["status → Disconnected<br/>錯誤: 連線逾時"]
    J --> N["寫入 DatasourceHealthLog"]
    K --> N
    L --> N
    M --> N
    N --> O["回傳測試結果"]
```

## 技術細節

| 項目 | 說明 |
|------|------|
| 逾時限制 | 10 秒，超時即判定為 Disconnected |
| 測試指令 | `SELECT 1`，驗證連線可正常執行查詢 |
| 密碼處理 | 從 DB 讀取 `encrypted_password`，AES-256 解密後用於連線 |
| 連線關閉 | 測試完成後必須關閉連線，避免連線洩漏 |
| 紀錄保存 | 每次測試結果（成功/失敗）皆寫入 DatasourceHealthLog |
| 狀態更新 | 同步更新 Datasource 的 `status` 與 `last_tested_at` |

## 失敗類型對照

| 失敗類型 | 可能原因 | 錯誤訊息 |
|---------|---------|---------|
| 驗證失敗 | 帳號或密碼錯誤 | "資料庫驗證失敗，請確認帳號密碼" |
| 連線被拒絕 | 主機位址或埠號錯誤、防火牆阻擋、資料庫未啟動 | "無法連線至目標資料庫" |
| 連線逾時 | 網路不通、主機無回應 | "連線逾時（超過 10 秒）" |
