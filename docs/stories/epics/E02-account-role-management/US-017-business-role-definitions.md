# US-017：系統角色定義（系統預設角色）

> **Story ID**：US-017
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：1
> **變更說明（2026-04-13）**：移除六種業務角色，簡化為 Admin / User 兩種系統角色
> **變更說明（2026-04-24）**：新增 is_sales_manager 旗標語意說明（業務主管為 User 子類旗標，非第三種系統角色）；新增 AC-5 旗標 Seed Data 初始值

---

## User Story

**As a** Admin（管理者）
**I want** 在系統帳號管理中看到完整的角色清單，並於指派帳號時從清單中選擇適當角色
**So that** 我可以依據每位使用者的職能，指派對應的角色

---

## 背景說明

CDMP 系統採用兩種系統角色：

- `admin`：管理者，具備完整平台管理權限（含 E07 客戶名單分派全功能）
- `user`：一般使用者，可存取 Customer 360 查詢功能（敏感欄位套用固定遮罩）

角色為系統預設 Seed Data，不開放 Admin 自行新增或刪除。

### 業務主管旗標（is_sales_manager）

除系統角色外，User 帳號具備 `is_sales_manager` 布林旗標，用以標記該使用者是否具備業務主管身分：

- **旗標預設值**：false（所有帳號於建立時預設不啟用）
- **適用角色**：僅適用於 role = `user` 的帳號；Admin 帳號不適用，不顯示此設定入口
- **功能影響**：is_sales_manager = true 的 User 可額外存取 E07 客戶名單分派（M01~M06 全功能）及 E06 Customer 360
- **指派方式**：由 Admin 透過帳號管理介面設定（US-010 建立時選填 / US-014 事後切換）

---

## 驗收標準

### AC-1：系統啟動時預設角色存在
- **Given** 系統完成初始化或資料庫遷移
- **When** Admin 查詢角色清單（或查看建立帳號表單的角色下拉選單）
- **Then** 系統顯示全部 2 種角色：管理者（Admin）、使用者（User）

### AC-2：Admin 無法新增或刪除角色
- **Given** Admin 在帳號管理介面
- **When** Admin 嘗試新增自訂角色或刪除現有角色
- **Then** 系統不提供「新增角色」或「刪除角色」的操作入口；若透過 API 嘗試，回傳 `403 Forbidden`，訊息為「角色為系統預設，不支援自訂新增或刪除」

### AC-3：角色顯示名稱正確
- **Given** Admin 在建立帳號或指派角色的介面
- **When** 角色選單顯示
- **Then** 每種角色顯示正確名稱：
  - `admin` → 管理者（Admin）
  - `user` → 使用者（User）

### AC-4：至少一位 Admin 限制
- **Given** 系統中現有的角色保護機制（源自 US-014）
- **When** Admin 嘗試將最後一位 Admin 帳號的角色改為 User
- **Then** 系統阻止此操作，顯示「系統必須至少保留一個 Admin 帳號」

### AC-5：業務主管旗標 Seed Data 初始值
- **Given** 系統完成初始化或資料庫遷移
- **When** 查詢所有現有帳號的 is_sales_manager 欄位值
- **Then** 所有帳號的 is_sales_manager 均為 false（旗標預設不啟用）
- **And** 新建帳號若未明確指定，is_sales_manager 預設為 false

---

## Technical Notes

### 角色資料模型

| role_code | display_name | type |
|-----------|-------------|------|
| admin | 管理者 | system |
| user | 使用者 | system |

**備註**：`is_sales_manager` 旗標為 users 資料表欄位（非 roles 表欄位），schema 設計由 system-architect 負責。

### Seed Data 初始化

- 系統部署時透過 migration 或 seed script 自動建立上述 2 筆角色資料
- 角色資料不可由 API 刪除（後端強制保護）
- migration 須為冪等（idempotent）：使用 `INSERT ... ON CONFLICT DO NOTHING`
- users 表的 `is_sales_manager` 欄位預設值為 false，由 migration 加入欄位定義

### API 端點

- `GET /api/roles` — 查詢所有角色清單（Admin 可見）
- Response：`{ data: [{ roleCode, displayName, type }] }`
- 不提供 `POST /api/roles`（新增角色）與 `DELETE /api/roles/:code`（刪除角色）端點

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 系統初始化後查詢角色清單 | 回傳 2 種角色 |
| 2 | 建立帳號表單角色下拉選單 | 顯示全部 2 種角色供選擇 |
| 3 | 嘗試透過 API POST /api/roles 新增角色 | 回傳 403 Forbidden |
| 4 | 嘗試透過 API DELETE /api/roles/admin 刪除角色 | 回傳 403 Forbidden |
| 5 | 非 Admin 存取 GET /api/roles | 回傳 403 Forbidden |
| 6 | Seed Data 遷移後驗證 role_code 正確性 | 全部 2 筆 role_code 與 display_name 正確 |
| 7 | 系統初始化後所有帳號的 is_sales_manager | 所有帳號均為 false |
| 8 | 建立新 User 帳號未指定 is_sales_manager | is_sales_manager 預設為 false |

---

## 依賴關係

- **Blocked By**：E01 US-001（Admin 必須先完成驗證）
- **Blocks**：
  - US-010（建立帳號需選擇角色）
  - US-014（指派／變更角色需完整角色清單）

---

## Definition of Done

- [ ] roles Seed Data migration 腳本實作完成，包含全部 2 種角色
- [ ] `GET /api/roles` 端點實作完成，僅限 Admin 存取
- [ ] 後端防護：不提供角色新增 / 刪除 API
- [ ] 建立帳號與指派角色表單的角色下拉選單正確顯示全部 2 種角色
- [ ] 角色顯示名稱正確呈現
- [ ] users 表 is_sales_manager 欄位 migration 完成（預設值 false）
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-010、US-014
