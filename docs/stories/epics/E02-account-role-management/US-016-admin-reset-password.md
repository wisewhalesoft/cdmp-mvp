# US-016：Admin 重設使用者密碼

> **Story ID**：US-016
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** Admin（管理者）
**I want** 替其他使用者重設密碼
**So that** 當使用者無法自行重設密碼時（例如無法收取 Email），我可以協助恢復其平台存取權

---

## 驗收標準

### AC-1：成功重設密碼
- **Given** Admin 在帳號管理頁面查看某使用者帳號
- **When** Admin 點擊「重設密碼」，輸入新密碼並確認
- **Then** 系統以 bcrypt 雜湊儲存新密碼、失效該使用者所有現有 Session Token，並顯示成功訊息「密碼已重設，使用者需以新密碼重新登入」

### AC-2：密碼規則驗證
- **Given** Admin 為某使用者輸入新密碼
- **When** 新密碼不符合密碼規則（少於 8 個字元）
- **Then** 系統顯示驗證錯誤訊息，且不執行重設

### AC-3：不可重設自己的密碼
- **Given** Admin 在帳號清單中查看自己的帳號
- **When** Admin 嘗試透過此功能重設自己的密碼
- **Then** 系統顯示「請透過個人設定變更您自己的密碼」，且不執行重設

---

## Technical Notes

- 端點：`POST /api/accounts/:id/reset-password`
- Request body：`{ newPassword }`
- 新密碼須符合既有密碼規則（最少 8 字元）
- 密碼以 bcrypt 雜湊處理後儲存
- 重設成功後，該使用者所有現有 Session Token 必須失效
- 僅 Admin 角色可存取此端點
- 此操作與 US-015（自助式密碼重設）為獨立流程，不需要 Email 驗證

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | Admin 成功重設其他使用者密碼 | 密碼已更新，顯示成功訊息 |
| 2 | 新密碼少於 8 字元 | 驗證錯誤 |
| 3 | 重設後使用者舊 Token 存取 API | 回傳 401 Unauthorized |
| 4 | 重設後使用者以新密碼登入 | 登入成功 |
| 5 | Admin 嘗試重設自己的密碼 | 顯示提示訊息，不執行重設 |
| 6 | 重設不存在的帳號 | 回傳 404 Not Found |
| 7 | 非 Admin 嘗試重設 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-010（帳號必須存在）、US-011（清單提供操作入口）
- **Blocks**：無
- NFR-001：密碼雜湊與 Token 失效安全性需求

---

## Definition of Done

- [ ] 帳號清單或詳細頁面中的「重設密碼」按鈕
- [ ] 重設密碼對話框 UI（含密碼輸入與確認）
- [ ] 後端 API 端點含密碼規則驗證
- [ ] 新密碼以 bcrypt 雜湊儲存
- [ ] 重設後該使用者所有 Session 失效
- [ ] 不可重設自己密碼的限制
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-010、US-011、US-015
