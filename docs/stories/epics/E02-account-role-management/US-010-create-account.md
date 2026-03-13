# US-010：建立帳號

> **Story ID**：US-010
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（管理者）
**I want** 建立一個指定角色的新使用者帳號
**So that** 團隊成員可以以適當的權限存取 CDMP 平台

---

## 驗收標準

### AC-1：成功建立帳號
- **Given** Admin 在帳號管理頁面
- **When** Admin 填寫必填欄位（姓名、Email、密碼、角色）並點擊「建立帳號」
- **Then** 系統建立帳號，顯示成功訊息，且新帳號出現於帳號清單中

### AC-2：防止重複 Email（大小寫不敏感）
- **Given** Email 為「User@Example.com」的帳號已存在
- **When** Admin 嘗試以「user@example.com」建立另一個帳號
- **Then** 系統將 Email 強制轉為小寫後進行比對，顯示「此 Email 已有帳號存在」，且不建立該帳號

### AC-3：欄位驗證
- **Given** Admin 在建立帳號表單
- **When** Admin 提交表單時有必填欄位未填或資料格式不正確（例如：Email 格式錯誤、密碼太短）
- **Then** 系統針對每個不合規欄位顯示具體的驗證錯誤訊息，且不建立帳號

---

## Technical Notes

- 端點：`POST /api/accounts`
- Request body：`{ name, email, password, role }`
- 密碼必須在儲存前以 bcrypt 雜湊處理
- 角色值：`admin`、`user`
- 最短密碼長度：8 個字元
- Email 在儲存前一律轉為小寫（`toLowerCase()`），確保大小寫不敏感的唯一性比對
- Email 格式驗證（RFC 5322 基礎規範）
- 僅 Admin 角色可存取此端點

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 以有效資料建立帳號 | 帳號建立成功，顯示成功訊息 |
| 2 | 使用重複 Email 建立 | 錯誤訊息，未建立帳號 |
| 2a | 以不同大小寫的重複 Email 建立（如 USER@example.com） | 錯誤訊息，未建立帳號 |
| 3 | 缺少姓名欄位 | 驗證錯誤訊息 |
| 4 | Email 格式不正確 | 驗證錯誤訊息 |
| 5 | 密碼不足 8 個字元 | 驗證錯誤訊息 |
| 6 | 角色設為「user」 | 帳號以 User 角色建立 |
| 7 | 角色設為「admin」 | 帳號以 Admin 角色建立 |
| 8 | 非 Admin 嘗試建立帳號 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-001（Admin 必須先完成驗證）
- **Blocks**：US-011、US-012、US-013、US-014（帳號必須存在才能進行管理操作）
- NFR-001：密碼雜湊需求

---

## Definition of Done

- [ ] 建立帳號表單 UI 含所有必填欄位
- [ ] 後端 API 端點含驗證邏輯
- [ ] 密碼在儲存前完成雜湊處理
- [ ] 重複 Email 檢查實作完成
- [ ] 角色指派功能正常運作
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過
- [ ] 僅限 Admin 存取的權限控制已強制執行

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-001、US-011、US-012、US-013、US-014
