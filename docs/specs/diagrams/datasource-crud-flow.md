---
spec-id: DIAG-008
title: 資料源 CRUD 流程圖 (Datasource CRUD Flow)
version: "1.0"
date: 2026-03-06
status: Draft
---

# 資料源 CRUD 流程圖

本圖呈現資料源的建立、編輯、刪除操作流程。

## 建立資料源

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 管理員
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫
    participant 外部DB as 外部資料庫

    Admin->>前端: 填寫資料源表單<br/>(名稱/類型/主機/埠號/帳號/密碼/...)
    前端->>前端: 前端欄位驗證

    前端->>API: POST /api/datasources<br/>{name, type, host, port,<br/>database_name, username,<br/>password, description, autoTest}

    API->>API: 驗證請求者權限 (Admin)
    API->>API: 驗證必填欄位與格式
    API->>API: AES-256 加密 password<br/>→ encrypted_password

    API->>DB: 儲存 Datasource<br/>(status: Unknown, created_by: adminId)
    DB-->>API: 確認儲存

    alt autoTest = true（選填自動測試）
        API->>API: 解密 encrypted_password
        API->>外部DB: 嘗試連線 + SELECT 1<br/>(10 秒逾時)

        alt 連線成功
            外部DB-->>API: 成功（含回應時間）
            API->>DB: 更新 status → Connected<br/>更新 last_tested_at
            API->>DB: 寫入 DatasourceHealthLog (success: true)
        else 連線失敗
            外部DB-->>API: 失敗（錯誤訊息）
            API->>DB: 更新 status → Disconnected<br/>更新 last_tested_at
            API->>DB: 寫入 DatasourceHealthLog (success: false)
        end
    end

    API-->>前端: 201 {datasource 完整資料}
    前端-->>Admin: 顯示建立成功<br/>（含連線測試結果，若有）
```

## 編輯資料源

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 管理員
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫

    Admin->>前端: 修改資料源欄位
    前端->>前端: 前端欄位驗證

    前端->>API: PUT /api/datasources/:id<br/>{name, type, host, port,<br/>database_name, username,<br/>password?, description}

    API->>API: 驗證請求者權限 (Admin)
    API->>DB: 查詢現有 Datasource
    DB-->>API: Datasource

    alt 資料源不存在或已刪除
        API-->>前端: 404 "資料源不存在"
    else 資料源存在
        alt 密碼欄位有值
            API->>API: AES-256 加密新密碼<br/>→ encrypted_password
        else 密碼欄位為空
            API->>API: 保留原 encrypted_password
        end

        API->>API: 檢查連線相關欄位是否變更<br/>(host/port/database_name/<br/>username/password)

        alt 連線相關欄位有變更
            API->>DB: 更新 Datasource<br/>status → Unknown<br/>last_tested_at → null
        else 僅非連線欄位變更
            API->>DB: 更新 Datasource<br/>（保留原 status）
        end

        DB-->>API: 確認更新
        API-->>前端: 200 {datasource 更新後資料}
        前端-->>Admin: 顯示更新成功
    end
```

## 刪除資料源（軟刪除）

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 管理員
    participant 前端 as 前端 (SPA)
    participant API as 後端 API
    participant DB as 應用資料庫

    Admin->>前端: 點擊刪除資料源
    前端->>前端: 顯示確認對話框<br/>"確定要刪除此資料源？"

    alt 使用者取消
        前端-->>Admin: 關閉對話框
    else 使用者確認
        前端->>API: DELETE /api/datasources/:id<br/>Header: Authorization: Bearer {JWT}

        API->>API: 驗證請求者權限 (Admin)
        API->>DB: 查詢 Datasource
        DB-->>API: Datasource

        alt 資料源不存在或已刪除
            API-->>前端: 404 "資料源不存在"
        else 資料源存在
            API->>DB: 軟刪除：設定 deleted_at = now()
            DB-->>API: 確認更新
            API-->>前端: 200 "資料源已刪除"
            前端->>前端: 從列表中移除該資料源
            前端-->>Admin: 顯示刪除成功訊息
        end
    end
```

## 操作摘要

| 操作 | API | 方法 | 關鍵行為 |
|------|-----|------|---------|
| 建立 | `/api/datasources` | POST | 加密密碼，初始 status = Unknown，可選自動測試 |
| 查詢列表 | `/api/datasources` | GET | 僅回傳 `deleted_at IS NULL` 的資料源 |
| 查詢單筆 | `/api/datasources/:id` | GET | 已刪除的資料源回傳 404 |
| 編輯 | `/api/datasources/:id` | PUT | 連線欄位變更時重置 status → Unknown；密碼欄位為空時保留原值 |
| 刪除 | `/api/datasources/:id` | DELETE | 軟刪除（設定 `deleted_at`），歷史紀錄保留 |
