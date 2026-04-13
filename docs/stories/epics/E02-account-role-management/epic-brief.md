# Epic Brief：E02 — 帳號與角色管理

> **Epic ID**：E02
> **優先級**：P0（Critical）
> **階段**：Phase 1（MVP）
> **Stories 數量**：8
> **變更說明（2026-04-13）**：移除六種業務角色（業務、行銷、客服、分析師、主管、後端作業），回歸 Admin / User 兩種角色；US-017 簡化為系統角色定義

## Epic 目標

讓 Admin 能夠在 CDMP 平台內建立、查看、編輯及管理使用者帳號與其角色指派。此 Epic 確保平台具備妥善的存取控制與使用者生命週期管理能力，供組織內部使用。

Admin 是唯一有權執行所有帳號管理操作的角色。正確的帳號管理是平台安全性與可用性的基礎。

## 角色架構（Role Architecture）

CDMP 採用兩種系統角色，均為系統預設（Seed Data），不支援 Admin 自行新增或刪除角色：

| 角色代碼 | 顯示名稱 | 說明 |
|---------|---------|------|
| `admin` | 管理者（Admin） | 具備完整平台管理權限 |
| `user` | 使用者（User） | 一般使用者，可存取 Customer 360 查詢功能（敏感欄位套用固定遮罩） |

## User Stories

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-010 | 建立帳號 | Must Have | [US-010-create-account.md](US-010-create-account.md) |
| US-011 | 查看帳號清單 | Must Have | [US-011-view-account-list.md](US-011-view-account-list.md) |
| US-012 | 編輯帳號 | Must Have | [US-012-edit-account.md](US-012-edit-account.md) |
| US-013 | 停用／啟用帳號 | Should Have | [US-013-disable-enable-account.md](US-013-disable-enable-account.md) |
| US-014 | 指派／變更角色 | Must Have | [US-014-assign-change-role.md](US-014-assign-change-role.md) |
| US-015 | 自助式密碼重設 | Must Have | [US-015-self-service-password-reset.md](US-015-self-service-password-reset.md) |
| US-016 | Admin 重設使用者密碼 | Must Have | [US-016-admin-reset-password.md](US-016-admin-reset-password.md) |
| US-017 | 系統角色定義（系統預設角色） | Must Have | [US-017-business-role-definitions.md](US-017-business-role-definitions.md) |

## 依賴關係

- **封鎖下游**：E06（Customer 360 依賴帳號驗證與角色判斷）
- **依賴**：E01（Admin 必須完成驗證才能存取帳號管理功能）
- **NFR 關聯**：NFR-001（帳號建立時的密碼雜湊需求、RBAC 強制執行）

## 成功標準

- Admin 能夠建立包含姓名、Email、密碼與角色（Admin 或 User）的新帳號
- Admin 能夠查看所有帳號的分頁清單（含角色欄位）
- Admin 能夠編輯帳號詳細資料（姓名、Email）
- Admin 能夠停用或啟用帳號
- Admin 能夠為任何帳號指派或變更角色（Admin / User）
- 系統具備完整的 2 種角色 Seed Data，並於初始化後自動存在
- 所有管理操作僅限 Admin 角色執行

## 待解決問題

- [x] 是否需要大量帳號建立功能（CSV 匯入）？ → **不需要，不納入任何階段規劃**
- [x] 帳號建立時是否需要 Email 驗證？ → **不需要，Admin 建立帳號後即可直接使用**
- [x] 密碼重設是否為自助式，或需由 Admin 執行？ → **兩者皆有：使用者可透過 US-015 自助重設，Admin 亦可透過 US-016 替使用者重設**
- [x] 角色是否開放 Admin 自行新增？ → **不開放。角色為系統預設 Seed Data（US-017），僅 Admin / User 兩種（2026-04-13 精簡）**
