---
type: test-design-risks
last_updated: 2026-03-12
---

# 風險與缺口

> 本文件記錄 CDMP MVP 測試設計過程中識別的不可測需求、模糊需求、架構限制、整合依賴與待決問題。

---

## 1. 不可測或模糊的需求

### 1.1 Token Blocklist Fail-Open / Fail-Closed 行為

- **來源**：F003（登出）、NFR-001.1
- **問題**：規格未定義 Token Blocklist 服務不可用時的行為。若 Blocklist 查詢失敗：
  - Fail-Open：允許請求通過（安全風險 — 已登出的 Token 仍可使用）
  - Fail-Closed：拒絕所有請求（可用性風險 — 全站停擺）
- **影響**：無法設計 Blocklist 故障場景的預期結果
- **建議**：架構師需決定 fail-open 或 fail-closed 策略

### 1.2 Email 重試機制

- **來源**：F009（自助式密碼重設）
- **問題**：規格未定義 Email 發送失敗時的重試策略。是否需要：
  - 自動重試？次數與間隔？
  - 使用者可見的重試按鈕？
  - 失敗記錄至 audit log？
- **影響**：無法設計 Email 暫時性失敗的完整測試場景
- **建議**：MVP 可暫不實作自動重試，僅回傳 SYSTEM_EMAIL_SEND_FAILED

### 1.3 Refresh Token 具體流程

- **來源**：OQ-1 決議（Refresh Token + 短效 Access Token）
- **問題**：決議了使用 Refresh Token 架構，但以下細節未定義：
  - Access Token 有效期？（建議 15 分鐘）
  - Refresh Token 端點路徑？
  - Refresh Token 儲存位置（HttpOnly Cookie 或 localStorage）？
  - Refresh Token 被撤銷後的前端行為？
- **影響**：無法設計完整的 Token 刷新與撤銷測試場景
- **建議**：架構師需補充 Refresh Token 實作規格

### 1.4 帳號停用後的前端即時反應

- **來源**：F007 AC-1
- **問題**：帳號停用後「若該使用者目前在線則被強制登出」，但未定義：
  - 前端如何得知被停用？（Polling 或 WebSocket 或下次 API 請求？）
  - 使用者看到的畫面為何？（直接跳轉登入頁？顯示停用訊息？）
- **影響**：E2E 測試無法驗證即時強制登出的 UX 流程
- **建議**：依據現有架構，最可能的實作是「下次 API 請求時回傳 401，前端導向登入頁」

---

## 2. 缺少的驗收標準

### 2.1 帳號清單預設排序規則

- **來源**：F005 BR-1
- **問題**：BR-1 定義「預設排序為 created_at DESC」，但未定義：
  - 是否支援使用者切換排序欄位？
  - 是否支援 ASC / DESC 切換？
  - API 是否接受 sort 參數？
- **影響**：測試僅能驗證預設排序，無法測試排序切換
- **建議**：MVP 僅支援預設排序即可，排序功能延後

### 2.2 Dashboard 警示 API 端點定義

- **來源**：F016 AC-6
- **問題**：`GET /api/datasources/alerts` 端點的回應已定義，但：
  - 警示是否需要手動確認（acknowledge）機制？
  - 是否需要 Email/通知推送？
  - 警示歷史紀錄是否保留？
- **影響**：測試範圍限於「警示清單查詢」，無法測試警示互動功能
- **建議**：MVP 僅提供查詢功能，acknowledge 與通知延後

### 2.3 角色變更後 Token 行為

- **來源**：F008 BR-4
- **問題**：BR-4 定義「角色變更於 Token 下次刷新或使用者重新登入後生效」，但：
  - 若使用者當前持有 Admin Token，被降級為 User 後：
    - 在 Token 刷新前，是否仍可存取 Admin 端點？
    - 前端是否需要主動觸發 Token 刷新？
- **影響**：無法精確定義角色變更後的過渡期行為測試
- **建議**：根據安全性考量，角色變更後應使舊 Token 失效

---

## 3. 影響測試的架構限制

### 3.1 Scheduler 多實例重複執行

- **來源**：F016 BR-2（每 30 分鐘健康檢查排程）
- **問題**：若後端部署多個實例，每個實例都啟動排程，可能導致：
  - 同一時間對同一資料來源執行多次健康檢查
  - 重複的 health log 記錄
  - 不必要的目標資料庫負載
- **影響**：效能測試結果可能受排程重複執行干擾
- **建議**：使用分散式鎖（如 Database Lock 或 Redis Lock）確保單一執行

### 3.2 AES-256 加密金鑰輪替測試

- **來源**：OQ-4（加密金鑰使用環境變數）
- **問題**：規格未定義金鑰輪替流程：
  - 輪替期間如何處理舊金鑰加密的密碼？
  - 是否需要重新加密所有現有記錄？
- **影響**：無法設計金鑰輪替的測試場景
- **建議**：MVP 可暫不支援金鑰輪替，延後至 Phase 2

### 3.3 JWT Secret 多 Secret 驗證

- **來源**：OQ-11（支援多 Secret 並行驗證）
- **問題**：已決議支援多 Secret，但具體實作未定義：
  - Secret 列表的管理方式？
  - 舊 Secret 的退役策略？
- **影響**：可設計基本的「新/舊 Secret 皆可驗證」測試，但無法驗證完整輪替流程
- **建議**：測試覆蓋「雙 Secret 並行驗證」場景即可

---

## 4. 需要 Mock / Stub 的整合點

| 整合點 | Mock 原因 | 建議 Mock 方式 | 影響的 Feature |
|--------|---------|---------------|---------------|
| MySQL 資料庫 | 測試環境不一定有 MySQL 實例 | Driver Mock 或 Test Container | F015, F016 |
| PostgreSQL 資料庫 | 測試環境不一定有 PostgreSQL 實例 | Driver Mock 或 Test Container | F015, F016 |
| SQL Server 資料庫 | 測試環境不一定有 SQL Server 實例 | Driver Mock 或 Test Container | F015, F016 |
| SMTP / SendGrid | Email 服務不應在測試中實際發送 | Mock Email Service | F009 |
| System Clock | Token 過期測試需快轉時間 | Clock Mock / Fake Clock | F001, F002, F003, F009 |

**詳細 Mock 策略**：請參閱 [test-data-strategy.md](test-data-strategy.md#6-mock-策略)。

---

## 5. 待決問題

### AQ-1：Access Token 儲存位置（高優先級）

- **來源**：F001、F002
- **問題**：JWT Token 儲存在 localStorage、sessionStorage 或 HttpOnly Cookie？
- **測試影響**：
  - localStorage → E2E 測試需操作 localStorage
  - HttpOnly Cookie → E2E 測試無法直接讀取 Cookie
  - 安全性測試需驗證 XSS 無法竊取 Token（Cookie > localStorage）
- **狀態**：待架構師決定
- **建議**：從安全性角度，建議 HttpOnly Cookie

### AQ-2：Token Blocklist 實作方式

- **來源**：F003、data-model.md
- **問題**：OQ-1 決議使用 Refresh Token + 短效 Access Token，但 Token Blocklist 是否仍需要？
  - 若 Access Token 有效期很短（如 15 分鐘），是否可以不維護 Blocklist？
  - 登出時僅撤銷 Refresh Token 是否足夠？
- **測試影響**：決定是否需要 Blocklist 查詢相關的測試場景
- **狀態**：待架構師確認
- **建議**：短效 Access Token + 撤銷 Refresh Token 即可，不需 Blocklist

### AQ-3：密碼重設 Email 內容範本

- **來源**：F009
- **問題**：Email 內容與格式未定義（主旨、正文、重設連結 URL 格式）
- **測試影響**：無法驗證 Email 內容的正確性
- **狀態**：待產品確認
- **建議**：最低需定義重設連結的 URL 格式（如 `{baseUrl}/reset-password?token={token}`）

### AQ-4：API 版本前綴

- **來源**：OQ-13
- **問題**：已決議預留 `/api/v1/` 前綴，但目前所有 Feature 規格的端點路徑為 `/api/`（無版本號）
- **測試影響**：端點路徑不確定，影響所有 API 測試
- **狀態**：待架構師統一
- **建議**：測試設計中使用相對路徑，允許 base path 可配置

### AQ-5：Refresh All 並行上限

- **來源**：F016 AC-7
- **問題**：「Refresh All」平行測試所有資料來源，但未定義：
  - 最大並行連線數？（若有 50 個資料來源，同時開 50 個連線是否合理？）
  - 是否需要 throttle 機制？
- **測試影響**：無法設計並行上限相關的測試
- **狀態**：待架構師決定
- **建議**：設定合理的並行上限（如 10），超過的排隊執行

### AQ-6：Optimistic Locking 實作方式

- **來源**：F006 BR-7、F013
- **問題**：規格建議使用 Optimistic Locking，但未定義：
  - 使用 version 欄位或 updated_at 比對？
  - 衝突時的 HTTP 狀態碼（409 已定義，但 error code 未指定）
- **測試影響**：可設計基本的並發編輯衝突場景
- **狀態**：待架構師確認具體方式

---

## 6. 風險等級摘要

| 風險等級 | 項目 | 說明 |
|---------|------|------|
| **高** | Refresh Token 流程未定義（1.3） | 影響所有驗證相關測試的完整性 |
| **高** | Access Token 儲存位置未定（AQ-1） | 影響安全性測試策略 |
| **中** | Token Blocklist Fail 行為未定（1.1） | 影響故障場景測試 |
| **中** | Scheduler 多實例重複執行（3.1） | 影響 F016 測試的可靠性 |
| **中** | 角色變更後 Token 行為（2.3） | 影響 F008 安全性測試 |
| **低** | Email 重試機制（1.2） | MVP 可暫不處理 |
| **低** | AES 金鑰輪替（3.2） | MVP 不需要 |
| **低** | 帳號清單排序切換（2.1） | MVP 僅需預設排序 |

---

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-12 | 初版建立，彙整 16 個 Feature 測試設計過程中的風險與缺口 | Test Designer Agent |
