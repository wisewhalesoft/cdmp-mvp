# US-015：自助式密碼重設

> **Story ID**：US-015
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 使用者（Admin 或 User）
**I want** 透過「忘記密碼」流程自行重設我的密碼
**So that** 我在忘記密碼時不需要依賴管理員協助，即可恢復平台存取權

---

## 驗收標準

### AC-1：發送重設連結
- **Given** 使用者在登入頁面點擊「忘記密碼」
- **When** 使用者輸入已註冊的 Email 並點擊「發送重設連結」
- **Then** 系統發送一封包含密碼重設連結的 Email 至該信箱，並顯示「若此 Email 存在，重設連結已寄出」訊息

### AC-2：不揭露帳號是否存在
- **Given** 使用者輸入一個未註冊的 Email
- **When** 使用者點擊「發送重設連結」
- **Then** 系統仍顯示相同的成功訊息「若此 Email 存在，重設連結已寄出」，不揭露該 Email 是否已註冊

### AC-3：重設密碼
- **Given** 使用者點擊 Email 中的有效重設連結
- **When** 使用者輸入新密碼（符合密碼規則）並確認
- **Then** 系統更新密碼（以 bcrypt 雜湊儲存）、失效所有現有 Session Token，並重新導向至登入頁面顯示「密碼已成功重設，請重新登入」

### AC-4：重設連結過期
- **Given** 重設連結已超過有效期限（24 小時）
- **When** 使用者點擊該過期連結
- **Then** 系統顯示「此連結已過期，請重新申請密碼重設」，並提供返回忘記密碼頁面的連結

---

## Technical Notes

- 忘記密碼端點：`POST /api/auth/forgot-password`
- Request body：`{ email }`
- 重設密碼端點：`POST /api/auth/reset-password`
- Request body：`{ token, newPassword }`
- 重設 Token 使用 UUID 或 JWT，有效期 24 小時
- Token 為一次性使用，成功重設後立即失效
- 新密碼須符合既有密碼規則（最少 8 字元）
- 重設成功後，所有現有 Session Token 必須失效
- Email 寄送可使用 SMTP 或第三方服務（如 SendGrid）

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 已註冊 Email 發送重設連結 | Email 寄出，顯示通用成功訊息 |
| 2 | 未註冊 Email 發送重設連結 | 不寄出 Email，仍顯示通用成功訊息 |
| 3 | 有效連結重設密碼 | 密碼更新，導向登入頁面 |
| 4 | 過期連結重設密碼 | 顯示連結過期訊息 |
| 5 | 已使用過的連結再次使用 | 顯示連結已失效訊息 |
| 6 | 新密碼少於 8 字元 | 驗證錯誤 |
| 7 | 重設後舊 Token 存取 API | 回傳 401 Unauthorized |

---

## 依賴關係

- **Blocked By**：US-010（帳號必須已存在）
- **Blocks**：無
- NFR-001：密碼雜湊安全性、Token 安全性需求

---

## Definition of Done

- [ ] 「忘記密碼」頁面 UI 實作完成
- [ ] 密碼重設頁面 UI 實作完成（含密碼強度驗證）
- [ ] 後端忘記密碼與重設密碼 API 端點功能正常
- [ ] 重設 Token 產生、驗證與過期機制實作完成
- [ ] Email 發送功能實作完成
- [ ] 重設成功後所有現有 Session 失效
- [ ] 所有驗收標準的單元測試通過
- [ ] 安全性審查完成（確認不洩漏帳號是否存在）

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-001、US-002、US-010
