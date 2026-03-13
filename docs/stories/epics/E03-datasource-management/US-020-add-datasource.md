# US-020：新增資料來源

> **Story ID**：US-020
> **Epic**：[E03 — 資料來源管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 新增一個資料庫連線作為資料來源
**So that** 平台可以連線至外部資料庫並管理其中的資料

---

## 驗收標準

### AC-1：成功新增資料來源
- **Given** Admin 在資料來源管理頁面
- **When** Admin 填寫必填欄位（名稱、類型、主機位址、連接埠、資料庫名稱、帳號、密碼）並點擊「新增資料來源」
- **Then** 系統儲存資料來源設定，加密連線憑證，顯示成功訊息，且新資料來源出現於清單中

### AC-2：防止重複名稱
- **Given** 名為「Production DB」的資料來源已存在
- **When** Admin 嘗試建立另一個相同名稱的資料來源
- **Then** 系統顯示「此名稱的資料來源已存在」，且不建立該筆記錄

### AC-3：欄位驗證
- **Given** Admin 在新增資料來源表單
- **When** Admin 提交表單時有必填欄位未填或數值不合規（例如：連接埠非數字、主機位址為空）
- **Then** 系統針對每個不合規欄位顯示具體的驗證錯誤訊息

---

## Technical Notes

- 端點：`POST /api/datasources`
- Request body：`{ name, type, host, port, databaseName, username, password, description? }`
- 支援類型：`mysql`、`postgresql`、`sqlserver`
- 預設連接埠：MySQL=3306、PostgreSQL=5432、SQL Server=1433
- 密碼必須以 AES-256 加密後再儲存
- 密碼絕不能以明文方式出現於 API 回應中
- 選填功能：建立後自動觸發連線測試

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 以有效資料新增 MySQL 資料來源 | 建立成功 |
| 2 | 新增 PostgreSQL 資料來源 | 建立成功 |
| 3 | 新增 SQL Server 資料來源 | 建立成功 |
| 4 | 使用重複名稱新增 | 顯示錯誤訊息 |
| 5 | 缺少主機位址 | 驗證錯誤訊息 |
| 6 | 連接埠為非數字 | 驗證錯誤訊息 |
| 7 | 缺少密碼 | 驗證錯誤訊息 |
| 8 | 確認資料庫中密碼已加密 | 密碼非明文儲存 |
| 9 | 非 Admin 嘗試建立 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-001（Admin 必須先完成驗證）
- **Blocks**：US-021、US-022、US-023、US-024、US-025（資料來源必須存在才能進行後續操作）
- NFR-001：憑證加密需求

---

## Definition of Done

- [ ] 新增資料來源表單 UI 含所有必填欄位
- [ ] 資料庫類型選擇器（MySQL、PostgreSQL、SQL Server）
- [ ] 根據選擇的類型自動填入預設連接埠
- [ ] 後端 API 端點含驗證邏輯
- [ ] 憑證在儲存前完成加密
- [ ] 重複名稱檢查實作完成
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E03 Epic Brief](epic-brief.md)
- **NFR**：[NFR-001 安全性需求](../../non-functional/NFR-001-security.md)
- **相關 Stories**：US-021、US-022、US-023、US-024、US-025
