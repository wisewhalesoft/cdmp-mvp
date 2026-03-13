# Epic Brief：E02 — 帳號與角色管理

> **Epic ID**：E02
> **優先級**：P0（Critical）
> **階段**：Phase 1（MVP）
> **Stories 數量**：7

## Epic 目標

讓 Admin 能夠在 CDMP 平台內建立、查看、編輯及管理使用者帳號與其角色指派。此 Epic 確保平台具備妥善的存取控制與使用者生命週期管理能力，供組織內部使用。

Admin 是唯一有權執行所有帳號管理操作的角色。正確的帳號管理是平台安全性與可用性的基礎。

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

## 依賴關係

- **封鎖下游**：無（此 Epic 不封鎖其他 Epic，但為 E03 提供使用者基礎）
- **依賴**：E01（Admin 必須完成驗證才能存取帳號管理功能）
- **NFR 關聯**：NFR-001（帳號建立時的密碼雜湊需求）

## 成功標準

- Admin 能夠建立包含姓名、Email、密碼與角色的新帳號
- Admin 能夠查看所有帳號的分頁清單
- Admin 能夠編輯帳號詳細資料（姓名、Email）
- Admin 能夠停用或啟用帳號
- Admin 能夠為任何帳號指派或變更角色
- 所有操作僅限 Admin 角色執行

## 待解決問題

- [x] 是否需要大量帳號建立功能（CSV 匯入）？ → **不需要，不納入任何階段規劃**
- [x] 帳號建立時是否需要 Email 驗證？ → **不需要，Admin 建立帳號後即可直接使用**
- [x] 密碼重設是否為自助式，或需由 Admin 執行？ → **兩者皆有：使用者可透過 US-015 自助重設，Admin 亦可透過 US-016 替使用者重設**
