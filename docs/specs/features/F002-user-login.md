---
spec-id: F002
title: User 登入
feature-id: F002
source-story: US-002
epic: E01 — 驗證與登入
priority: P0-MVP
version: "1.2"
date: 2026-05-13
status: Draft
---

# F002: User 登入

**Priority:** P0-MVP | **Status:** Draft | **Last Updated:** 2026-05-13

---

## 1. 功能摘要

提供 User（使用者）角色透過 Email 與密碼憑證登入 CDMP 平台的功能。系統角色維持 Admin / User 兩種（參考 F045），但 User 帳號可額外持有 `is_sales_manager=true` 旗標，形成「業務主管」實質身份。因此登入後的導向行為與 sidebar 可用功能須依「管理者 / 業務主管 / 一般使用者」三種**實質身份**分別處理（詳見 §4.5 與 architecture-spec.md AD-E02-1）。

此功能與 F001（Admin 登入）共用同一個 API 端點，透過 JWT 中的 `role` + `is_sales_manager` 組合決定前端導向目標。MVP 階段 Customer 360（E06）已對所有登入身份開放，因此一般使用者登入後直接導向 Customer 360，不再使用「無可用功能」說明頁面作為預設目的地。

---

## 2. User Story

**As a** User（使用者）
**I want** 使用我的帳號憑證登入 CDMP 平台
**So that** 我可以存取我的帳號，並瀏覽平台（即使 MVP 階段尚無可用功能）

---

## 3. 驗收標準

### AC-1：一般使用者登入後導向 Customer 360

- **Given** User 帳號 `is_sales_manager=false` 且已啟用
- **When** User 在登入頁面輸入正確的 Email 與密碼，並點擊「登入」
- **Then** 系統驗證 User 身份、發行 JWT Token，並重新導向至 `/c360/customers`
- **And** sidebar 僅顯示 Customer 360 群組（不顯示客戶名單分派、帳號管理等 Admin / 業務主管專屬項目）
- **註：** 此 AC 取代 v1.1 之前「導向說明頁面」的行為。MVP 階段 Customer 360 已可用，原 `/user-info` 不再作為預設導向目的地（保留作為 fallback 路由，詳見 §6 UI/UX 需求）

### AC-2：無效憑證

- **Given** User 在登入頁面
- **When** User 輸入錯誤的 Email 或密碼，並點擊「登入」
- **Then** 系統顯示通用錯誤訊息「Email 或密碼錯誤」，且不揭示是哪個欄位有誤

### AC-3：「記住我」功能

- **Given** User 在登入頁面
- **When** User 勾選「記住我」後成功登入
- **Then** 系統發行長效 Token（有效期 30 天），下次開啟瀏覽器時自動維持登入狀態；若未勾選，Token 於瀏覽器關閉或閒置 8 小時後失效

### AC-4：帳號已停用

- **Given** User 帳號已被停用
- **When** User 以正確憑證嘗試登入
- **Then** 系統顯示「您的帳號已被停用，請聯絡管理員。」，且不發行 JWT Token

### AC-5：業務主管登入後導向 Customer 360

- **Given** User 帳號 `is_sales_manager=true` 且已啟用
- **When** User 以正確憑證成功登入
- **Then** 系統發行 JWT Token（payload 含 `role=user`、`is_sales_manager=true`），並重新導向至 `/c360/customers`
- **And** sidebar 同時顯示 Customer 360 群組與「客戶名單分派」群組（含 M01~M06 全部子項，依 E07 相關 Feature 規格）
- **And** 業務主管雖被導向 Customer 360 作為預設首頁，但可透過 sidebar 自由進入分派相關頁面，不會被路由守衛阻擋

### AC-6：sidebar 依實質身份動態顯示

- **Given** 任一已登入身份（管理者 / 業務主管 / 一般使用者）
- **When** 進入任何受保護頁面
- **Then** sidebar 僅渲染該身份可存取的選單項目；不可見項目**完全不渲染**（非 `disabled` 也非隱藏 CSS），避免任何揭露未授權功能存在的痕跡
- **And** 「客戶名單分派」群組僅在 `role=admin` 或 `is_sales_manager=true` 時整組顯示，否則整組省略
- **And** 「帳號管理」「資料來源」「資料擷取」「ETL Pipeline」等管理者專屬群組僅在 `role=admin` 時顯示

---

## 4. API 規格

### 共用端點

此功能與 F001（Admin 登入）共用同一個登入端點。完整 API 規格請參閱 [F001-admin-login.md#4-api-規格](F001-admin-login.md#4-api-規格)。

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/login` | 使用者登入（Admin 與 User 共用） |

### 差異說明

- Request / Response 結構與 F001 完全相同
- 成功 Response 中 `user.role` 值為 `"user"`（而非 `"admin"`）
- JWT Payload 中 `is_sales_manager` 欄位反映該 User 的業務主管旗標狀態（`true` / `false`）
- 前端根據 `role` + `is_sales_manager` 組合決定導向目標與 sidebar 內容（完整規則見 §4.5）

### RBAC 路由保護

| 情境 | 行為 |
|------|------|
| 一般使用者嘗試存取 Admin 專屬前端路由 | 前端路由守衛攔截，重新導向至 `/c360/customers` |
| 一般使用者嘗試存取業務主管專屬前端路由（`/assignment/**`） | 前端路由守衛攔截，重新導向至 `/c360/customers` |
| 業務主管嘗試存取 Admin 專屬前端路由 | 前端路由守衛攔截，重新導向至 `/c360/customers` |
| 任何 User 嘗試呼叫 Admin 專屬 API 端點 | 後端回傳 HTTP 403 Forbidden，並記錄至日誌 |
| 非業務主管 User 嘗試呼叫 `/api/v1/assignment/**` 端點 | 後端 `SalesManagerGuard` 回傳 HTTP 403 Forbidden（AD-E02-1 步驟 3） |

### Admin 專屬 API 端點保護 — Response（HTTP 403）

```json
{
  "error": "FORBIDDEN",
  "message": "您沒有權限執行此操作。"
}
```

---

## 4.5 登入後導向與可用功能（RBAC × 實質身份矩陣）

本節為 spec 層級的**單一權威來源**，定義三種實質身份的登入後預設導向與 sidebar 可見項目。架構決策依據為 [architecture-spec.md AD-E02-1](../architecture-spec.md)（角色 + is_sales_manager 旗標 RBAC 模型）；本節聚焦於 UX 層面（前端導向與導覽），與 AD-E02-1 的後端中介層檢查順序對應但側重點不同。

### 實質身份矩陣

| 實質身份 | role | is_sales_manager | 登入後預設導向 | Sidebar 可見項目 |
|---------|------|-----------------|---------------|------------------|
| 管理者 | `admin` | 任意（忽略） | `/`（帳號管理） | 帳號管理、資料來源、資料擷取、ETL Pipeline、Customer 360、客戶名單分派（全部子項 M01~M06） |
| 業務主管 | `user` | `true` | `/c360/customers` | Customer 360、客戶名單分派（全部子項 M01~M06） |
| 一般使用者 | `user` | `false` | `/c360/customers` | Customer 360 |

### 設計約束

- **唯一權威性：** 其他文件（前端路由設定、sidebar 元件、F008 / F045 / scope.md / error-handling.md）涉及登入後導向與 sidebar 顯示規則時，必須引用本節而非另行定義
- **與後端對齊：** 本節為前端 UX 規則；後端 RBAC 中介層的執行順序（JWT 驗證 → role 檢查 → is_sales_manager 檢查）詳見 AD-E02-1，兩層必須對同一矩陣達成共識
- **不可見項目不渲染：** sidebar 對該身份不可見的項目必須完全不出現在 DOM（不可僅用 `disabled` 或 CSS `hidden`），參考 AC-6
- **客戶名單分派分組：** 此分組（含 M01~M06 全部子項）僅在 `role=admin` 或 `is_sales_manager=true` 時整組顯示；分組內的個別端點權限細節由 E07 相關 Feature 與後端 `SalesManagerGuard` 進一步控制（詳見 [feedback_e07_controllers_use_sales_manager_guard](../../../.claude/projects/.../) 與 E07 spec）

### 既有矩陣的下游引用

| 下游文件 | 引用內容 |
|---------|---------|
| architecture-spec.md AD-E02-1 | 後端 RBAC 中介層執行順序對應此矩陣 |
| F008（指派/變更角色） | Admin 變更 `is_sales_manager` 旗標後，受影響 User 下次登入適用新矩陣行  |
| F045（系統角色定義） | 提供 `role` 的有效值範圍（admin / user） |
| scope.md | 模組存取範圍（E01~E07）對應本矩陣 |

---

## 5. 業務規則

| 規則編號 | 規則說明 |
|---------|---------|
| BR-001 | 密碼驗證邏輯與 F001 完全相同（bcrypt compare，cost factor >= 10） |
| BR-002 | 無效憑證的錯誤訊息與 F001 一致，使用通用訊息 |
| BR-003 | JWT Payload 中 `role` + `is_sales_manager` 組合決定前端登入後導向與 sidebar 顯示（詳見 §4.5 矩陣） |
| BR-004 | 一般使用者（`role=user`, `is_sales_manager=false`）不可存取 Admin 專屬功能與業務主管專屬功能 |
| BR-005 | RBAC 強制執行必須同時在前端路由層、前端 sidebar 渲染層與後端 API 層實施（三層對齊 §4.5 矩陣） |
| BR-006 | `/user-info` 說明頁面在 MVP 階段不作為任何身份的預設導向目的地；保留為極端 fallback 路由（無 sidebar 項可顯示時使用） |
| BR-RBAC | §4.5「實質身份矩陣」為 spec 層級**唯一權威來源**；架構層（middleware / guard）與實作層（前端 router / sidebar）所有 RBAC 行為必須對齊此矩陣，矩陣變更時須同步檢視 AD-E02-1 |
| BR-Redirect | 登入後預設導向遵循 §4.5 矩陣第 5 欄：`admin` 導向 `/`（帳號管理）；`user` 不論 `is_sales_manager` 為何均導向 `/c360/customers` |

---

## 6. UI/UX 需求

### 登入頁面

登入頁面與 F001 共用同一個介面，無需區分角色。所有 UI 元素請參閱 [F001-admin-login.md#6-uiux-需求](F001-admin-login.md#6-uiux-需求)。

### 登入後預設頁面

依 §4.5 矩陣決定，使用者登入成功後直接進入該身份的預設頁面（admin → `/`、業務主管 / 一般使用者 → `/c360/customers`）。預設頁面本身的 UI/UX 由對應 Feature spec 規範（帳號管理 F005、Customer 360 E06 相關 Feature），本節不重複定義。

### Sidebar（跨頁共用元件）

| 項目 | 要求 |
|------|------|
| 共用範圍 | sidebar 為**跨頁共用元件**，所有受保護頁面（含 admin、業務主管、一般使用者可存取的頁面）共用同一份元件實作；不可在個別頁面重複實作或硬編寫死選單 |
| 動態渲染 | sidebar 依登入身份（JWT 解析後的 `role` + `is_sales_manager`）動態決定可見項目，遵循 §4.5 矩陣第 6 欄 |
| 不可見即不渲染 | 對該身份不可見的項目必須完全不出現在 DOM（不可僅 `disabled` 或 CSS hidden），參考 AC-6 |
| 群組摺疊 | 多子項的群組（如「客戶名單分派」含 M01~M06）支援摺疊；摺疊狀態屬 UI 偏好，不影響 RBAC |
| 路由高亮 | 當前路由對應的 sidebar 項目須有視覺高亮（具體樣式參考既有 prototype `/prototypes/sidebar` 與 Customer 360 prototype） |
| 登出按鈕 | sidebar 或頂部 Header 須提供登出入口，觸發 F003 登出流程 |

### `/user-info` 頁面（極端 fallback，MVP 階段不應觸及）

| 項目 | 說明 |
|------|------|
| 用途 | 僅在「無任何 sidebar 項可對該身份顯示」的極端情境下作為 fallback 目的地 |
| MVP 階段預期 | **不應發生**，因 §4.5 矩陣保證所有合法登入身份至少擁有 Customer 360 入口 |
| 內容 | 簡潔的品牌化頁面，顯示「目前尚無可用功能，請聯絡您的管理員。」與登出按鈕 |
| 架構層處理 | 若 system-architect 評估後決議移除此 fallback 路由，本 spec 不阻擋；移除前須確認 §4.5 矩陣中無任何身份會落入「零可見 sidebar 項」狀態 |

### 互動狀態

| 狀態 | 行為 |
|------|------|
| 登入成功（admin） | 重新導向至 `/`，sidebar 顯示完整管理者選單 |
| 登入成功（user, is_sales_manager=true） | 重新導向至 `/c360/customers`，sidebar 顯示 Customer 360 + 客戶名單分派 |
| 登入成功（user, is_sales_manager=false） | 重新導向至 `/c360/customers`，sidebar 僅顯示 Customer 360 |
| 一般使用者導航至 Admin 路由 | 路由守衛攔截，重新導向至 `/c360/customers` |
| 一般使用者導航至業務主管專屬路由（`/assignment/**`） | 路由守衛攔截，重新導向至 `/c360/customers` |
| 業務主管導航至 Admin 路由 | 路由守衛攔截，重新導向至 `/c360/customers` |

---

## 7. 錯誤場景

登入相關錯誤場景與 F001 完全一致，請參閱 [F001-admin-login.md#7-錯誤場景](F001-admin-login.md#7-錯誤場景)。

以下為 F002 特有的錯誤場景：

| 錯誤情境 | 錯誤代碼 | 使用者可見訊息 | 系統行為 |
|---------|---------|--------------|---------|
| 一般使用者存取 Admin 前端路由 | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至 `/c360/customers` |
| 一般使用者存取業務主管專屬前端路由 | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至 `/c360/customers` |
| 業務主管存取 Admin 前端路由 | N/A（前端攔截） | 無錯誤訊息，直接重新導向 | 前端路由守衛重新導向至 `/c360/customers` |
| User 呼叫 Admin 專屬 API | FORBIDDEN | 「您沒有權限執行此操作。」 | 回傳 HTTP 403，記錄存取嘗試至日誌 |
| 非業務主管呼叫 `/api/v1/assignment/**` | FORBIDDEN | 「您沒有權限執行此操作。」 | 後端 `SalesManagerGuard` 回傳 HTTP 403，記錄至日誌 |
| 登入後 JWT 解析時 `is_sales_manager` 欄位缺失或型別錯誤 | N/A（前端容錯） | 無錯誤訊息 | **保守視為 `false`** 並導向 `/c360/customers`（無業務主管視角，sidebar 不顯示客戶名單分派群組）；**不阻擋登入**；前端記錄 console warning 供 DevTools 觀察 |

詳細 Retry / Fallback 策略請參閱 [error-handling.md](../error-handling.md#auth-errors)。

---

## 8. 測試案例

| # | 測試案例 | 前置條件 | 操作 | 預期結果 |
|---|---------|---------|------|---------|
| T-001 | 一般使用者登入後導向 Customer 360 | User 帳號（`is_sales_manager=false`）已建立且啟用 | 輸入正確 Email 與密碼，點擊登入 | HTTP 200，JWT 發行（payload `role=user`, `is_sales_manager=false`），重新導向至 `/c360/customers`，sidebar 僅顯示 Customer 360 |
| T-002 | 錯誤密碼 | User 帳號已建立且啟用 | 輸入正確 Email 與錯誤密碼 | HTTP 401，顯示「Email 或密碼錯誤」 |
| T-003 | 已停用的 User 帳號 | User 帳號已停用 | 輸入正確 Email 與密碼 | HTTP 403，顯示帳號停用訊息 |
| T-004 | 一般使用者嘗試存取 Admin 前端路由 | User（`is_sales_manager=false`）已登入 | 瀏覽器直接輸入 Admin 路由 URL（如 `/`） | 路由守衛攔截，重新導向至 `/c360/customers` |
| T-005 | User 呼叫 Admin 專屬 API | User 已登入 | 以 User Token 呼叫 Admin API 端點 | HTTP 403 Forbidden，日誌記錄存取嘗試 |
| T-006 | 勾選「記住我」 | User 帳號已建立且啟用 | 勾選後成功登入 | Token 有效期為 30 天 |
| T-007 | 未勾選「記住我」 | User 帳號已建立且啟用 | 不勾選，成功登入 | Token 於閒置 8 小時後失效 |
| T-008 | 業務主管登入後導向 Customer 360 | User 帳號（`is_sales_manager=true`）已建立且啟用 | 輸入正確 Email 與密碼，點擊登入 | HTTP 200，JWT 發行（payload `role=user`, `is_sales_manager=true`），重新導向至 `/c360/customers`，sidebar 顯示 Customer 360 + 客戶名單分派（M01~M06） |
| T-009 | 業務主管可存取分派路由 | User（`is_sales_manager=true`）已登入 | 點擊 sidebar 「客戶名單分派」項目 | 成功進入分派頁面，路由守衛不攔截 |
| T-010 | 業務主管嘗試存取 Admin 路由 | User（`is_sales_manager=true`）已登入 | 瀏覽器直接輸入 Admin 路由 URL | 路由守衛攔截，重新導向至 `/c360/customers` |
| T-011 | 一般使用者嘗試存取分派路由 | User（`is_sales_manager=false`）已登入 | 瀏覽器直接輸入 `/assignment/**` 路由 | 路由守衛攔截，重新導向至 `/c360/customers` |
| T-012 | sidebar 不渲染未授權項目 | User（`is_sales_manager=false`）已登入 | 檢查 DOM 中 sidebar 結構 | 客戶名單分派與 Admin 專屬群組完全不出現在 DOM（非 disabled、非 CSS hidden） |
| T-013 | JWT 缺 `is_sales_manager` 欄位保守降級 | 後端發出舊版 JWT（payload 無 `is_sales_manager` 欄位） | User 登入並由前端解析 JWT | 不阻擋登入；前端視為 `false`，導向 `/c360/customers`，sidebar 僅顯示 Customer 360；console 輸出 warning |

---

## 9. 依賴關係

| 類型 | 項目 | 說明 |
|------|------|------|
| Blocked By | 無 | 此為基礎功能，無前置依賴 |
| Blocks | F003（登出） | 需先有登入才能登出 |
| 資料依賴 | US-010（建立帳號） | 帳號須透過 Admin 帳號管理功能預先建立 |
| 共用基礎建設 | F001（Admin 登入） | 共用同一個 API 端點、驗證邏輯與 Token 管理機制 |
| NFR | NFR-001（安全性） | JWT Token 管理、bcrypt 密碼雜湊、RBAC 強制執行 |
| NFR | NFR-001.2（授權強制執行） | User 存取 Admin 端點時回傳 HTTP 403 並記錄日誌 |
| NFR | NFR-002（效能） | API 回應時間 P95 低於 500ms |

---

## 10. 資料需求

### 涉及實體

| 實體 | 操作 | 說明 |
|------|------|------|
| User | 讀取 | 依 Email 查詢使用者記錄，驗證密碼與帳號狀態 |
| Session / Token | 建立 | 登入成功後發行 JWT Token（role: user） |

### 相關欄位

與 F001 相同，完整欄位清單請參閱 [F001-admin-login.md#10-資料需求](F001-admin-login.md#10-資料需求)。

關鍵差異：
- `user.role` 值為 `"user"`，與 `is_sales_manager` 組合決定前端登入後導向（詳見 §4.5）
- `user.is_sales_manager` 布林旗標反映該帳號是否為業務主管；RBAC 中介層以 `role` + `is_sales_manager` 組合判斷 API 端點存取權限（參考 AD-E02-1）
- 前端 sidebar 渲染同樣依此組合決定可見項目，三層（前端路由 / sidebar / 後端 API）必須對齊 §4.5 矩陣

詳細資料模型請參閱 [data-model.md#user-entity](../data-model.md#user-entity)。

---

## 11. 安全性考量

所有登入安全性要求與 F001 相同，請參閱 [F001-admin-login.md#11-安全性考量](F001-admin-login.md#11-安全性考量)。

F002 特有的安全性要求：

| 項目 | 要求 |
|------|------|
| RBAC 前端路由保護 | 前端路由守衛必須阻擋一般使用者存取 Admin 路由與業務主管專屬路由；業務主管存取 Admin 路由同樣攔截（依 §4.5 矩陣） |
| RBAC 前端 sidebar 保護 | sidebar 元件不可渲染當前身份無權存取的項目（不可僅 disable），避免揭露未授權功能存在 |
| RBAC 後端 API 保護 | 後端中介層遵循 AD-E02-1 三步驟檢查（JWT → role → is_sales_manager）；違反者回傳 HTTP 403 |
| 存取日誌 | 未授權的 API 端點存取嘗試必須記錄至日誌（含 userId、嘗試存取的端點、檢查失敗的步驟、時間戳記） |

完整安全性需求請參閱 [NFR-001](../stories/non-functional/NFR-001-security.md)。

---

## 12. 效能需求

與 F001 相同，請參閱 [F001-admin-login.md#12-效能需求](F001-admin-login.md#12-效能需求)。

---

## 13. 交叉參考

| 類型 | 連結 |
|------|------|
| 來源 Story | [US-002-user-login.md](../stories/epics/E01-auth-and-login/US-002-user-login.md) |
| Epic Brief | [E01 epic-brief.md](../stories/epics/E01-auth-and-login/epic-brief.md) |
| 相關 Feature | [F001-admin-login.md](F001-admin-login.md)、[F003-logout.md](F003-logout.md)、[F008-assign-change-role.md](F008-assign-change-role.md)、[F045-business-role-definitions.md](F045-business-role-definitions.md) |
| 架構決策 | [architecture-spec.md AD-E02-1](../architecture-spec.md)（角色 + is_sales_manager 旗標 RBAC 模型） |
| 安全性 NFR | [NFR-001-security.md](../stories/non-functional/NFR-001-security.md) |
| 效能 NFR | [NFR-002-performance.md](../stories/non-functional/NFR-002-performance.md) |
| 流程圖 | [diagrams/F002-user-login.mmd](../diagrams/F002-user-login.mmd) |
| 資料模型 | [data-model.md#user-entity](../data-model.md#user-entity) |
| 錯誤處理 | [error-handling.md#auth-errors](../error-handling.md#auth-errors) |

---

## 14. 更新紀錄

| 版本 | 日期 | 變更摘要 |
|------|------|---------|
| v1.0 | 2026-04-02 | 初版（與 F001 拆分） |
| v1.1 | 2026-04-24 | 補 `is_sales_manager` 旗標說明與 JWT payload 差異 |
| v1.2 | 2026-05-13 | 彙整 RBAC 矩陣與登入導向邏輯（解決 `manager@cdmp.test` 登入後被導向無 sidebar 的 `/user-info`、無法導覽至 Customer 360 的 bug）：新增 §4.5「登入後導向與可用功能」實質身份矩陣作為唯一權威來源；修訂 AC-1（一般使用者導向 `/c360/customers`）；新增 AC-5（業務主管導向）、AC-6（sidebar 動態渲染）；新增 BR-RBAC、BR-Redirect；補強 §6 UI/UX 章節（sidebar 為共用元件、`/user-info` 改為極端 fallback）；§7 補 JWT `is_sales_manager` 解析失敗保守降級規則；新增 T-008~T-013 測試案例 |
