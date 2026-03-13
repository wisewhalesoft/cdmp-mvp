# US-001：Admin 登入

> **Story ID**：US-001
> **Epic**：[E01 — 驗證與登入](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（管理者）
**I want** 使用我的帳號憑證登入 CDMP 平台
**So that** 我可以存取管理後台，管理帳號與資料來源

---

## 驗收標準

### AC-1：成功登入
- **Given** Admin 擁有一個有效且啟用中的帳號
- **When** Admin 在登入頁面輸入正確的 Email 與密碼，並點擊「登入」
- **Then** 系統驗證 Admin 身份，發行 Session Token，並重新導向至管理後台首頁

### AC-2：無效憑證
- **Given** Admin 在登入頁面
- **When** Admin 輸入錯誤的 Email 或密碼，並點擊「登入」
- **Then** 系統顯示通用錯誤訊息「Email 或密碼錯誤」，且不揭示是哪個欄位有誤

### AC-3：「記住我」功能
- **Given** Admin 在登入頁面
- **When** Admin 勾選「記住我」後成功登入
- **Then** 系統發行長效 Token（有效期 30 天），下次開啟瀏覽器時自動維持登入狀態；若未勾選，Token 於瀏覽器關閉或閒置 8 小時後失效

### AC-4：帳號已停用
- **Given** Admin 帳號已被停用
- **When** Admin 以正確憑證嘗試登入
- **Then** 系統顯示「您的帳號已被停用，請聯絡管理員。」，且不發行 Session Token

---

## Technical Notes

- 使用 JWT 進行 Session Token 管理
- Token Payload 應包含：使用者 ID、角色、發行時間（issued-at）、到期時間（expiration）
- 登入端點：`POST /api/auth/login`
- Request body：`{ email, password, rememberMe? }`
- 若 `rememberMe: true`，Token 有效期延長至 30 天；否則維持預設（閒置 8 小時失效）
- Response：`{ token, user: { id, name, email, role } }`
- 密碼驗證透過 bcrypt compare 執行
- 建議在登入端點加入 Rate Limiting

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 有效的 Admin 憑證 | 重新導向至管理後台，Token 已發行 |
| 2 | 錯誤密碼 | 錯誤訊息，無 Token |
| 3 | 不存在的 Email | 錯誤訊息，無 Token |
| 4 | Email 欄位為空 | 前端驗證錯誤 |
| 5 | 密碼欄位為空 | 前端驗證錯誤 |
| 6 | 已停用的 Admin 帳號 | 顯示帳號停用訊息 |
| 7 | Email 欄位含 SQL injection | 輸入已消毒，顯示錯誤訊息 |
| 8 | 勾選「記住我」後登入 | Token 有效期為 30 天 |
| 9 | 未勾選「記住我」登入 | Token 於閒置 8 小時後失效 |

---

## 依賴關係

- **Blocked By**：無
- **Blocks**：US-003（需先有登入才能登出）
- 帳號必須已透過 US-010 由其他 Admin 建立
- NFR-001：密碼雜湊與 Token 安全性需求

---

## Definition of Done

- [ ] 登入頁面 UI 實作完成，含 Email、密碼欄位與「記住我」勾選框
- [ ] 後端登入 API 端點功能正常
- [ ] 成功驗證後正確發行 JWT Token
- [ ] 無效憑證與帳號停用情境的錯誤訊息正確顯示
- [ ] 所有驗收標準的單元測試通過
- [ ] 安全性審查完成（確認無明文密碼出現於日誌）

---

## 相關文件

- **Epic Brief**：[E01 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-002、US-003、US-010
