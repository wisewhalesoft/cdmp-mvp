# US-013：停用／啟用帳號

> **Story ID**：US-013
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Should Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（管理者）
**I want** 停用或重新啟用使用者帳號
**So that** 我可以在不永久刪除帳號的情況下控制平台存取權限

---

## 驗收標準

### AC-1：停用帳號
- **Given** Admin 正在查看一個啟用中的帳號
- **When** Admin 點擊「停用帳號」並確認操作
- **Then** 帳號狀態變更為「停用」，若該使用者目前在線則被強制登出，且帳號在清單中顯示為停用狀態

### AC-2：啟用帳號
- **Given** Admin 正在查看一個已停用的帳號
- **When** Admin 點擊「啟用帳號」
- **Then** 帳號狀態變更為「啟用」，使用者可再次登入

### AC-3：防止自我停用
- **Given** Admin 正在查看自己的帳號
- **When** Admin 嘗試停用自己的帳號
- **Then** 系統阻止此操作，並顯示「您無法停用自己的帳號」

---

## Technical Notes

- 端點：`PATCH /api/accounts/:id/status`
- Request body：`{ status: "active" | "disabled" }`
- 停用帳號時應使該使用者所有有效的 Session 失效
- 停用操作需要確認對話框
- 停用帳號在清單中以視覺標記（badge／tag）區分

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 停用啟用中的帳號 | 狀態變更為停用 |
| 2 | 啟用已停用的帳號 | 狀態變更為啟用 |
| 3 | 已停用使用者嘗試登入 | 登入被拒（依 US-001／US-002 AC-3） |
| 4 | Admin 嘗試停用自己的帳號 | 操作被阻止，顯示錯誤訊息 |
| 5 | 非 Admin 嘗試操作 | 回傳 403 Forbidden |
| 6 | 未確認即停用 | 操作未執行 |

---

## 依賴關係

- **Blocked By**：US-010（帳號必須存在）、US-011（清單提供操作入口）
- **Blocks**：US-001、US-002（登入需要檢查帳號狀態）
- E01：Admin 必須先完成驗證

---

## Definition of Done

- [ ] 帳號清單與詳細頁面中的停用／啟用切換或按鈕
- [ ] 停用操作的確認對話框
- [ ] 後端端點更新帳號狀態
- [ ] 停用時使所有有效 Session 失效
- [ ] 防止自我停用機制實作完成
- [ ] UI 中的狀態視覺標記
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-001、US-002、US-010、US-011
