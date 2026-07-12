# US-002：User 登入

> **Story ID**：US-002
> **Epic**：[E01 — 驗證與登入](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** User（使用者）
**I want** 使用我的帳號憑證登入 CDMP 平台
**So that** 我可以存取我的帳號，並瀏覽平台（即使 MVP 階段尚無可用功能）

---

## 驗收標準

### AC-1：成功登入 — 一般使用者（businessRole = NULL，本次不變）
- **Given** User 帳號屬一般使用者（`business_role` 為 NULL）且為有效、啟用中的帳號
- **When** User 在登入頁面輸入正確的 Email 與密碼，並點擊「登入」
- **Then** 系統驗證 User 身份，發行 Session Token，並重新導向至 `/c360/customers`；Sidebar 僅顯示「Customer 360」

### AC-1a：成功登入 — 業務部長 / 業務處長（businessRole = 'director' / 'section_chief'，**2026-07-12 變更**）
- **Given** User 帳號屬業務部長或業務處長（`business_role` 為 `'director'` 或 `'section_chief'`）且為有效、啟用中的帳號
- **When** User 在登入頁面輸入正確的 Email 與密碼，並點擊「登入」
- **Then** 系統驗證 User 身份，發行 Session Token，並重新導向至 `/assignment/overview`（分派總覽，客戶名單分派模組首頁）；Sidebar **不再顯示「Customer 360」**入口，僅顯示「客戶名單分派」群組（組內子項依角色不同，詳見 F002 §4.6）

> 系統管理者（admin）之登入導向本次不變（沿用 US-001：預設導向 `/`，且維持 Customer 360 存取權），不在本 story 重複定義。

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
- **Then** 系統顯示「您的帳號已被停用，請聯絡管理員。」，且不發行 Session Token

### AC-5：業務部長 / 業務處長導覽至 Customer 360 路由被攔截（**2026-07-12 新增**）
- **Given** User 帳號屬業務部長或業務處長，已成功登入
- **When** User 嘗試導覽（點擊連結或直接輸入網址）至 `/c360/**` 路徑下任一頁面
- **Then** 前端路由守衛攔截，直接重新導向至 `/assignment/overview`，不顯示任何錯誤訊息（後端 Customer 360／E06 API 權限不變，本次僅前端攔截，非後端 Guard 變更）

### AC-6：一般使用者導覽至客戶名單分派路由被攔截（本次不變，補列以維持 AC 完整性）
- **Given** User 帳號屬一般使用者，已成功登入
- **When** User 嘗試導覽至 `/assignment/**` 路徑下任一頁面
- **Then** 前端路由守衛攔截，直接重新導向至 `/c360/customers`；此行為與本次修訂前相同，未受影響

---

## Technical Notes

- 與 Admin 共用同一個登入端點：`POST /api/auth/login`
- JWT Token 中的 `role` + `businessRole` 組合決定登入後導向與 Sidebar 可見項目：`role='admin'` → `/`；`role='user'` 且 `businessRole IN ('director','section_chief')` → `/assignment/overview`（**2026-07-12 起，原為 `/c360/customers`**）；`role='user'` 且 `businessRole=NULL` → `/c360/customers`（不變）
- 業務部長 / 業務處長之 Sidebar 自本次修訂起不再顯示「Customer 360」入口；前端路由守衛需同步封鎖 `/c360/**`
- 完整角色 × 導向 × Sidebar 矩陣以 [F002 §4.5](../../../specs/features/F002-user-login.md) 為唯一權威來源，本 story 僅為其在 US-002 範疇內的可測試化呈現
- 密碼驗證與 Token 管理機制與 US-001 相同

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 有效的一般使用者憑證（businessRole=NULL） | 重新導向至 `/c360/customers`，Sidebar 僅顯示 Customer 360，Token 已發行 |
| 2 | 有效的業務部長憑證（businessRole='director'）（**2026-07-12 變更**） | 重新導向至 `/assignment/overview`，Sidebar 不顯示 Customer 360、顯示客戶名單分派群組，Token 已發行 |
| 3 | 有效的業務處長憑證（businessRole='section_chief'）（**2026-07-12 變更**） | 重新導向至 `/assignment/overview`，Sidebar 不顯示 Customer 360、顯示客戶名單分派群組（僅處長可達子項），Token 已發行 |
| 4 | 錯誤密碼 | 錯誤訊息，無 Token |
| 5 | 已停用的 User 帳號 | 顯示帳號停用訊息 |
| 6 | 業務部長 / 業務處長直接輸入網址嘗試存取 `/c360/**`（**2026-07-12 新增**） | 前端路由守衛攔截，重新導向至 `/assignment/overview`，無錯誤訊息 |
| 7 | 一般使用者直接輸入網址嘗試存取 `/assignment/**`（不變，回歸測試） | 前端路由守衛攔截，重新導向至 `/c360/customers` |
| 8 | User（任一 businessRole）嘗試存取 Admin 專屬路由（不變，回歸測試） | 前端路由守衛攔截，導向該身份之預設頁（詳見 F002 §4.5），不放行 |
| 9 | 勾選「記住我」後登入 | Token 有效期為 30 天 |
| 10 | 未勾選「記住我」登入 | Token 於閒置 8 小時後失效 |

---

## 依賴關係

- **Blocked By**：無
- **Blocks**：US-003（需先有登入才能登出）
- 帳號必須已透過 US-010 由 Admin 建立
- US-001：共用登入基礎建設
- NFR-001：密碼雜湊與 Token 安全性需求

---

## Definition of Done

- [ ] 一般使用者登入後正確導向 `/c360/customers`（不變）
- [ ] 業務部長 / 業務處長登入後正確導向 `/assignment/overview`（**2026-07-12 變更**）
- [ ] 業務部長 / 業務處長 Sidebar 不再顯示「Customer 360」入口（**2026-07-12 變更**）
- [ ] 業務部長 / 業務處長直接輸入 `/c360/**` 網址時，前端路由守衛正確攔截並導向 `/assignment/overview`（**2026-07-12 新增**）
- [ ] 一般使用者直接輸入 `/assignment/**` 網址時，仍正確導向 `/c360/customers`（不變，回歸測試）
- [ ] 阻擋 User 存取 Admin 專屬路由的機制維持正常（不變，回歸測試）
- [ ] 所有驗收標準的單元測試通過
- [ ] 角色路由邏輯測試通過（含本次新增之業務角色重導向與 Customer 360 攔截情境）

---

## 相關文件

- **Epic Brief**：[E01 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **Spec（權威角色 × 導向 × Sidebar 矩陣）**：[F002 §4.5 帳號角色定義](../../../specs/features/F002-user-login.md)
- **相關 Stories**：US-001、US-003、US-010

---

## 修訂記錄

### 2026-07-12 — RBAC 調整：業務部長 / 業務處長移除 Customer 360、改導向分派總覽
- **變更內容**：業務部長（`businessRole='director'`）與業務處長（`businessRole='section_chief'`）不再擁有 Customer 360 存取權——Sidebar 移除「Customer 360」入口，前端路由守衛封鎖 `/c360/**`；登入後預設導向由 `/c360/customers` 改為 `/assignment/overview`（分派總覽，客戶名單分派模組首頁）。
- **不變**：一般使用者（`businessRole=NULL`）與系統管理者（admin）之登入導向、Sidebar 內容與存取權限維持不變。
- **實施範圍**：僅前端（Sidebar 可見性 + 路由守衛 + 角色導向邏輯）；後端 Customer 360（E06）API 權限不變（維持 `authenticated`），本次未新增或調整任何後端 Guard。
- **異動 AC**：新增 AC-1a、AC-5；AC-6 為補列現況（未變更）；AC-1、AC-2、AC-3、AC-4 內容不變。
- **權威依據**：完整角色 × 導向 × Sidebar 矩陣以 [F002 §4.5](../../../specs/features/F002-user-login.md) 為唯一權威來源；本 story 之驗收標準為其在 US-002 範疇內的可測試化呈現，如有落差以 F002 §4.5 為準。
