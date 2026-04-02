# US-017：業務角色定義（系統預設角色）

> **Story ID**：US-017
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** Admin（管理者）
**I want** 在系統帳號管理中看到完整的角色清單（含系統角色與業務角色），並於指派帳號時從清單中選擇適當角色
**So that** 我可以依據每位使用者的業務職能，指派對應的角色，以確保 Customer 360 及其他模組的存取控制能正確套用

---

## 背景說明

CDMP 系統採用**雙層角色架構**：

**系統角色（System Roles）**
- `admin`：管理者，具備完整平台管理權限
- `user`：一般使用者基礎角色（MVP 中作為業務角色的基底，登入後依業務角色決定功能存取範圍）

**業務角色（Business Roles，六種）**
- `business`：業務（一線業務人員）
- `marketing`：行銷（企劃）
- `customer_service`：客服（客戶服務人員）
- `analyst`：分析師（資料分析師）
- `supervisor`：主管（各部門主管）
- `backend_ops`：後端作業（作服，後端作業服務人員）

**設計決策（2026-04-02 業務確認）**：六種業務角色為**系統預設角色（Seed Data）**，不開放 Admin 自行新增或刪除角色。原因：業務角色與 Customer 360 模組（US-068）的欄位可見性、遮罩規則、功能開關緊密耦合，角色名稱必須與 `c360_role_permissions` 資料表保持一致，任意新增角色將導致存取控制規則失效。

---

## 驗收標準

### AC-1：系統啟動時預設角色存在
- **Given** 系統完成初始化或資料庫遷移
- **When** Admin 查詢角色清單（或查看建立帳號表單的角色下拉選單）
- **Then** 系統顯示全部 8 種角色：Admin、User、業務、行銷（企劃）、客服、分析師、主管、後端作業（作服）

### AC-2：Admin 無法新增或刪除角色
- **Given** Admin 在帳號管理介面
- **When** Admin 嘗試新增自訂角色或刪除現有角色
- **Then** 系統不提供「新增角色」或「刪除角色」的操作入口；若透過 API 嘗試，回傳 `403 Forbidden`，訊息為「角色為系統預設，不支援自訂新增或刪除」

### AC-3：角色顯示名稱與別名正確
- **Given** Admin 在建立帳號或指派角色的介面
- **When** 角色選單顯示
- **Then** 每種角色顯示正確名稱：
  - `admin` → 管理者（Admin）
  - `user` → 使用者（User）
  - `business` → 業務
  - `marketing` → 行銷（企劃）
  - `customer_service` → 客服
  - `analyst` → 分析師
  - `supervisor` → 主管
  - `backend_ops` → 後端作業（作服）

### AC-4：至少一位 Admin 限制
- **Given** 系統中現有的角色保護機制（源自 US-014）
- **When** Admin 嘗試將最後一位 Admin 帳號的角色改為非 Admin
- **Then** 系統阻止此操作，顯示「系統必須至少保留一個 Admin 帳號」

---

## Technical Notes

### 角色資料模型

系統角色與業務角色統一存放於 `roles` 表（或以 Enum 定義），以 `role_code` 作為與其他模組整合的識別鍵：

| role_code | display_name | alias | type |
|-----------|-------------|-------|------|
| admin | 管理者 | Admin | system |
| user | 使用者 | User | system |
| business | 業務 | — | business |
| marketing | 行銷 | 企劃 | business |
| customer_service | 客服 | — | business |
| analyst | 分析師 | — | business |
| supervisor | 主管 | — | business |
| backend_ops | 後端作業 | 作服 | business |

### Seed Data 初始化

- 系統部署時透過 migration 或 seed script 自動建立上述 8 筆角色資料
- 角色資料不可由 API 刪除（後端強制保護）
- `c360_role_permissions`（US-068）使用 `role_code` 作為外鍵，須與本表保持一致

### API 端點

- `GET /api/roles` — 查詢所有角色清單（Admin 可見）
- Response：`{ data: [{ roleCode, displayName, alias, type }] }`
- 不提供 `POST /api/roles`（新增角色）與 `DELETE /api/roles/:code`（刪除角色）端點

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 系統初始化後查詢角色清單 | 回傳 8 種角色 |
| 2 | 建立帳號表單角色下拉選單 | 顯示全部 8 種角色供選擇 |
| 3 | 嘗試透過 API POST /api/roles 新增角色 | 回傳 403 Forbidden |
| 4 | 嘗試透過 API DELETE /api/roles/business 刪除角色 | 回傳 403 Forbidden |
| 5 | 非 Admin 存取 GET /api/roles | 回傳 403 Forbidden |
| 6 | Seed Data 遷移後驗證 role_code 正確性 | 全部 8 筆 role_code 與 display_name 正確 |

---

## 依賴關係

- **Blocked By**：E01 US-001（Admin 必須先完成驗證）
- **Blocks**：
  - US-010（建立帳號需選擇角色）
  - US-014（指派／變更角色需完整角色清單）
  - US-068（Customer 360 角色存取設定依賴 role_code）

---

## Definition of Done

- [ ] roles Seed Data migration 腳本實作完成，包含全部 8 種角色
- [ ] `GET /api/roles` 端點實作完成，僅限 Admin 存取
- [ ] 後端防護：不提供角色新增 / 刪除 API
- [ ] 建立帳號與指派角色表單的角色下拉選單正確顯示全部 8 種角色
- [ ] 角色顯示名稱與別名正確呈現
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-010、US-014、US-068
