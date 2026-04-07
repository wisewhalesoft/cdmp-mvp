# US-062：建立標籤

> **Story ID**：US-062
> **Epic**：[E06 — Customer 360](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 2
> **預估點數**：3

---

## User Story

**As a** 已登入的使用者（Admin 或一般使用者）
**I want** 建立標籤，指定名稱、顏色與標籤類型
**So that** 我能依照業務需求對客戶進行分類標記，方便後續篩選與管理

> **設計決策**：標籤採用**單層扁平結構，不支援階層（父標籤／子標籤）**。（2026-04-02 業務確認）
>
> **設計決策**：標籤區分兩種類型：**全域標籤（global）**由 Admin 建立，全部使用者可見可用；**自訂標籤（custom）**由一般使用者建立，僅建立者本人可見可用。（2026-04-07 業務確認）

---

## 驗收標準

### AC-1：進入建立標籤對話框（Admin）
- **Given** Admin 在標籤管理頁面（或客戶 360 頁面的標籤 Panel）
- **When** Admin 點擊「建立標籤」按鈕
- **Then** 開啟建立標籤 Modal Dialog，包含：標籤名稱（必填）、顏色選擇器（必選，預設顯示 8 個預設色票）、說明（選填）、**標籤類型（必選，Radio Button：「全域標籤」或「自訂標籤」，預設為「全域標籤」）**

### AC-2：進入建立標籤對話框（一般使用者）
- **Given** 一般使用者（業務、行銷、客服、分析師、主管）在標籤管理頁面
- **When** 使用者點擊「建立標籤」按鈕
- **Then** 開啟建立標籤 Modal Dialog，包含：標籤名稱（必填）、顏色選擇器、說明（選填）；**不顯示標籤類型選擇器**，系統自動設定為 `custom`，`owner_id` 為當前登入使用者

### AC-3：Admin 建立全域標籤成功
- **Given** Admin 填入有效的標籤名稱並選擇「全域標籤」類型
- **When** Admin 點擊「確認建立」按鈕
- **Then** 系統建立 `tag_type = 'global'`、`owner_id = NULL` 的標籤，關閉 Dialog，標籤清單即時新增該標籤，並顯示成功 Toast 通知「標籤「{名稱}」已建立」

### AC-4：Admin 建立自訂標籤成功
- **Given** Admin 填入有效的標籤名稱並選擇「自訂標籤」類型
- **When** Admin 點擊「確認建立」按鈕
- **Then** 系統建立 `tag_type = 'custom'`、`owner_id = Admin 的使用者 ID` 的標籤，關閉 Dialog，顯示成功 Toast 通知

### AC-5：一般使用者建立自訂標籤成功
- **Given** 一般使用者填入有效的標籤名稱（1~50 字元）並選擇顏色
- **When** 使用者點擊「確認建立」按鈕
- **Then** 系統建立 `tag_type = 'custom'`、`owner_id = 當前使用者 ID` 的標籤，關閉 Dialog，標籤清單在「我的標籤」區段即時新增該標籤，並顯示成功 Toast 通知「標籤「{名稱}」已建立」

### AC-6：標籤名稱重複驗證（依 scope 判斷）
- **Given** 系統中已存在名稱為「跟進中」的自訂標籤（owner_id = 使用者 A）
- **When** 使用者 A 嘗試建立另一個名稱同為「跟進中」的自訂標籤並提交
- **Then** 系統顯示驗證錯誤訊息「標籤名稱已存在，請使用不同名稱」，不關閉 Dialog
- **注意**：使用者 B 建立同名「跟進中」的自訂標籤時**不受限制**（不同 owner 可有同名自訂標籤）；全域標籤名稱在全系統唯一

### AC-7：標籤名稱長度驗證
- **Given** 使用者在標籤名稱欄位輸入超過 50 個字元的文字
- **When** 使用者嘗試提交
- **Then** 表單驗證顯示錯誤訊息「標籤名稱不得超過 50 個字元」

### AC-8：標籤名稱必填驗證
- **Given** 使用者未填入標籤名稱
- **When** 使用者點擊「確認建立」
- **Then** 表單驗證顯示錯誤訊息「標籤名稱為必填欄位」

### AC-9：取消建立
- **Given** 使用者開啟建立標籤 Dialog
- **When** 使用者點擊「取消」或關閉按鈕
- **Then** 關閉 Dialog，不儲存任何資料，不發出 API 請求

---

## Technical Notes

- 標籤採用**單層扁平結構**，不支援父標籤／子標籤階層，每個標籤為獨立個體
- 標籤分為兩種類型：
  - **global**：全域標籤，`owner_id = NULL`，所有使用者均可見、可使用；僅 Admin 可建立
  - **custom**：自訂標籤，`owner_id = 建立者 UUID`，僅建立者本人可見、可使用
- 全域標籤名稱在 `customer_tags` 表中設有全域唯一約束（UNIQUE INDEX on `name` WHERE `tag_type = 'global'`）
- 自訂標籤名稱在同一 `owner_id` 下唯一（UNIQUE INDEX on `(name, owner_id)` WHERE `tag_type = 'custom'`）
- 顏色欄位儲存 HEX 色碼（VARCHAR(7)，如 `#3B82F6`）
- 預設色票：提供 8 個預設色選項（Blue=#3B82F6、Green=#22C55E、Yellow=#F59E0B、Red=#EF4444、Purple=#8B5CF6、Pink=#EC4899、Gray=#6B7280、Teal=#14B8A6）

### 資料模型變更

`customer_tags` 表新增欄位：

| 欄位 | 類型 | 說明 |
|------|------|------|
| tag_type | ENUM('global', 'custom') | 標籤類型，NOT NULL |
| owner_id | UUID nullable (FK) | 自訂標籤的建立者；全域標籤為 NULL |

### API 端點

- 端點：`POST /api/v1/c360/tags`
- Request Body（Admin）：
```json
{
  "name": "VIP",
  "color": "#3B82F6",
  "description": "高價值客戶",
  "tagType": "global"
}
```
- Request Body（一般使用者，`tagType` 欄位由後端強制設為 `custom`）：
```json
{
  "name": "跟進中",
  "color": "#F59E0B",
  "description": "本週需要跟進的客戶"
}
```
- Response（201 Created）：
```json
{
  "tagId": "uuid",
  "name": "VIP",
  "color": "#3B82F6",
  "description": "高價值客戶",
  "tagType": "global",
  "ownerId": null,
  "createdBy": "uuid",
  "createdAt": "ISO8601"
}
```
- 錯誤（403 Forbidden）：一般使用者嘗試建立 `tagType = 'global'`
- 錯誤（409 Conflict）：標籤名稱在有效 scope 內重複

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | Admin 建立全域標籤「VIP」（選藍色、類型全域） | 標籤建立成功，`tag_type = 'global'`，`owner_id = NULL`，所有使用者可見 |
| 2 | Admin 建立自訂標籤（選擇自訂類型） | `tag_type = 'custom'`，`owner_id = Admin UUID` |
| 3 | 一般使用者建立標籤（無類型選擇器） | `tag_type = 'custom'`，`owner_id = 使用者 UUID` |
| 4 | 名稱欄位空白提交 | 顯示必填驗證錯誤 |
| 5 | 名稱超過 50 字元提交 | 顯示長度驗證錯誤 |
| 6 | 一般使用者建立與現有全域標籤同名的自訂標籤 | 允許建立（不同 scope，不衝突） |
| 7 | 一般使用者建立與自己現有自訂標籤同名的標籤 | 顯示「名稱已存在」錯誤，不建立 |
| 8 | 使用者 A 與使用者 B 各建立名為「跟進中」的自訂標籤 | 兩者均允許建立（不同 owner） |
| 9 | 一般使用者透過 API 傳入 `tagType = 'global'` | 回傳 403 Forbidden |
| 10 | 點擊取消按鈕 | 關閉 Dialog，無資料變更 |
| 11 | 建立成功後 | 顯示成功 Toast，清單即時更新 |

---

## 依賴關係

- **Blocked By**：無（可獨立開發）
- **Blocks**：US-063（標籤管理需先有標籤）、US-064（標籤指派需先有標籤）

---

## Definition of Done

- [ ] 建立標籤 API（POST /api/v1/c360/tags）實作完成，支援 `tag_type` 與 `owner_id`
- [ ] `customer_tags` 表新增 `tag_type`、`owner_id` 欄位與對應唯一約束
- [ ] 後端強制限制：一般使用者只能建立 `custom` 類型標籤
- [ ] 名稱唯一約束驗證（全域標籤全系統唯一；自訂標籤同 owner 唯一）
- [ ] 前端建立標籤 Modal Dialog 實作完成（Admin 顯示類型選擇器；一般使用者隱藏）
- [ ] 表單驗證（必填、長度、重複名稱）
- [ ] 建立成功後清單即時更新
- [ ] Toast 通知實作完成
- [ ] 單元測試覆蓋率達標（> 80%）

---

## 相關文件

- **Epic Brief**：[E06 Epic Brief](epic-brief.md)
- **相關 Story**：US-063（標籤管理）、US-064（標籤指派）、US-066（依標籤篩選）
