# US-011：查看帳號清單

> **Story ID**：US-011
> **Epic**：[E02 — 帳號與角色管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（管理者）
**I want** 查看所有使用者帳號的清單
**So that** 我可以管理並監督所有平台使用者

---

## 驗收標準

### AC-1：顯示帳號清單
- **Given** Admin 導覽至帳號管理頁面
- **When** 頁面載入完成
- **Then** 系統顯示分頁帳號清單，包含：姓名、Email、角色（顯示中文名稱，如「分析師」、「業務」）、狀態（啟用／停用）、建立日期

### AC-2：搜尋與篩選（大小寫不敏感）
- **Given** Admin 正在查看帳號清單
- **When** Admin 輸入搜尋關鍵字（例如輸入「john」可匹配「John」或「JOHN」），或選擇篩選條件（依角色或狀態）
- **Then** 系統以大小寫不敏感方式比對姓名與 Email，清單更新僅顯示符合條件的帳號

### AC-4：依業務角色篩選
- **Given** Admin 正在查看帳號清單
- **When** Admin 從角色篩選下拉選單選擇「分析師」
- **Then** 系統僅顯示 role_code 為 `analyst` 的帳號；其他業務角色（業務、行銷、客服、主管、後端作業）同樣可個別篩選

### AC-3：空狀態顯示
- **Given** 目前沒有任何帳號符合搜尋／篩選條件
- **When** 清單渲染
- **Then** 系統顯示「找不到帳號」訊息，並建議調整篩選條件

---

## Technical Notes

- 端點：`GET /api/accounts`
- Query params：`?page=1&limit=20&search=keyword&role=analyst&status=active`
- `role` 篩選參數使用 role_code（如 `admin`、`analyst`、`backend_ops`），支援全部 8 種角色代碼
- 搜尋為大小寫不敏感（SQL 使用 `ILIKE` 或 `LOWER()` 比對）
- Response：`{ data: [...], total, page, limit }`
- 回傳的帳號資料中，角色欄位以 `{ roleCode, displayName }` 格式呈現，前端顯示 `displayName`（如「分析師」）
- 預設排序：建立日期由新至舊
- 分頁：預設每頁 20 筆
- 欄位：姓名、Email、角色（中文顯示名稱）、狀態、建立時間、操作

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 載入含現有帳號的頁面 | 顯示分頁清單 |
| 2 | 依姓名搜尋 | 顯示篩選後結果 |
| 2a | 以不同大小寫搜尋（如「JOHN」匹配「john」） | 顯示篩選後結果 |
| 3 | 依角色「Admin」篩選 | 僅顯示 Admin 帳號 |
| 3a | 依角色「分析師」（analyst）篩選 | 僅顯示業務角色為分析師的帳號 |
| 3b | 依角色「後端作業」（backend_ops）篩選 | 僅顯示後端作業（作服）帳號 |
| 4 | 依狀態「停用」篩選 | 僅顯示停用帳號 |
| 5 | 無符合結果 | 顯示空狀態訊息 |
| 6 | 翻頁操作 | 顯示正確頁面內容 |
| 7 | 帳號角色欄位顯示 | 業務角色正確顯示中文名稱（如「行銷（企劃）」而非 `marketing`） |
| 8 | 非 Admin 存取 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-001（Admin 必須先完成驗證）、US-010（需有帳號才能列出）
- **Blocks**：US-012、US-013、US-014（清單提供存取編輯操作的入口）
- NFR-002：清單必須在 500ms 內回傳分頁結果

---

## Definition of Done

- [ ] 帳號清單頁面 UI 含表格版面
- [ ] 分頁功能正常運作
- [ ] 依姓名／Email 搜尋功能正常
- [ ] 依角色與狀態篩選功能正常
- [ ] 空狀態正確處理
- [ ] 後端 API 含分頁與篩選邏輯
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E02 Epic Brief](epic-brief.md)
- **NFR**：[NFR-002 效能需求](../../non-functional/NFR-002-performance.md)
- **相關 Stories**：US-010、US-012、US-013、US-014
