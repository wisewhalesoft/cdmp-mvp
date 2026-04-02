# US-012：編輯帳號

> **Story ID**：US-012
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** Admin（管理者）
**I want** 編輯現有使用者帳號的詳細資料
**So that** 我可以保持使用者資訊的準確性與時效性

---

## 驗收標準

### AC-1：成功編輯
- **Given** Admin 正在查看某帳號的詳細資料或帳號清單
- **When** Admin 修改帳號姓名或 Email 並點擊「儲存」
- **Then** 系統更新帳號資料，顯示成功訊息，並立即反映變更

### AC-2：Email 唯一性驗證（編輯時，大小寫不敏感）
- **Given** Admin 正在編輯某帳號的 Email
- **When** Admin 將 Email 變更為已被另一個帳號使用的地址（比對前強制轉為小寫）
- **Then** 系統顯示「此 Email 已被使用」，且不儲存變更

### AC-3：編輯時欄位驗證
- **Given** Admin 正在編輯帳號
- **When** Admin 清空必填欄位或輸入不合規資料
- **Then** 系統顯示驗證錯誤訊息，且不儲存變更

---

## Technical Notes

- 端點：`PUT /api/accounts/:id`
- 可編輯欄位：姓名、Email
- Email 在儲存前一律轉為小寫（`toLowerCase()`），與 US-010 一致
- 密碼變更為獨立操作，由 US-016（Admin 重設）處理，不在此 Story 範圍內
- 角色變更由 US-014 處理（支援全部 8 種角色：Admin、User、業務、行銷/企劃、客服、分析師、主管、後端作業/作服）
- 建議使用樂觀鎖定（Optimistic Locking）防止並發編輯衝突

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 成功編輯姓名 | 更新後姓名正確顯示 |
| 2 | 將 Email 改為未使用的值 | 更新後 Email 正確顯示 |
| 3 | 將 Email 改為重複值 | 顯示錯誤訊息 |
| 3a | 以不同大小寫的重複 Email 編輯（如 USER@example.com） | 顯示錯誤訊息 |
| 4 | 清空必填姓名欄位 | 顯示驗證錯誤 |
| 5 | 編輯不存在的帳號 | 回傳 404 Not Found |
| 6 | 非 Admin 嘗試編輯 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-010（帳號必須存在）、US-011（清單提供編輯操作入口）
- **Blocks**：無
- E01：Admin 必須先完成驗證

---

## Definition of Done

- [ ] 編輯表單／對話框 UI 含預填欄位
- [ ] 後端 API 端點含驗證邏輯
- [ ] 更新時的 Email 唯一性檢查
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 變更立即反映於 UI
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **相關 Stories**：US-010、US-011、US-014
