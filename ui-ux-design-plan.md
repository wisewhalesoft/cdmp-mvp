# CDMP MVP — UI/UX 原型設計執行計畫

## Context

CDMP（企業客戶資料治理平台）MVP 已完成產品需求（16 個 User Stories）與系統架構規格，但尚無任何 UI 設計產出。本計畫旨在根據 `specs/features/F001-F016` 中的 UI/UX 需求，產出完整的互動式 HTML 原型，作為前端開發的設計基準。

---

## 設計決策

| 決策 | 選擇 | 理由 |
|------|------|------|
| 色彩模式 | Light mode only | 企業後台優先可讀性；規格無 dark mode 需求 |
| 元件風格 | shadcn/ui 風格 | 與 React + Tailwind 技術棧最佳搭配 |
| 圖示 | Lucide Icons (CDN) | shadcn/ui 原生圖示集 |
| 語言 | 繁體中文 | 規格書要求 |
| 視窗 | 主要 1440px 桌面，基本支援 1024px | 企業內部使用 |
| 帳號表單 | Modal Dialog | 帳號欄位少（2-4 個），Modal 操作流暢 |
| 資料來源表單 | 獨立頁面 | 欄位多（8 個），獨立頁面空間充裕 |

## 色彩系統

| Token | Hex | 用途 |
|-------|-----|------|
| Primary | #2563EB | 主按鈕、連結、active 狀態 |
| Danger | #EF4444 | 刪除/停用、錯誤、disconnected 狀態 |
| Success | #22C55E | 成功提示、connected 狀態 |
| Warning | #F59E0B | 警告、逾時提示 |
| Unknown | #9CA3AF | unknown 狀態 |
| Background | #F9FAFB | 頁面背景 |
| Surface | #FFFFFF | 卡片背景 |
| Border | #E5E7EB | 邊框 |

---

## 檔案結構

```
prototypes/
├── 00-design-system.html           # 設計系統：色彩、字型、元件庫
├── 01-login.html                   # 登入頁 (F001, F002)
├── 02-user-info-page.html          # User 說明頁 (F002)
├── 03-forgot-password.html         # 忘記密碼 (F009)
├── 04-forgot-password-sent.html    # 重設連結已寄出 (F009)
├── 05-reset-password.html          # 重設密碼表單 (F009)
├── 06-reset-password-success.html  # 重設成功 (F009)
├── 07-account-list.html            # 帳號清單 + 所有 Modal (F004-F008, F010)
├── 08-datasource-list.html         # 資料來源管理（頁籤：儀表板(預設) + 清單）(F012, F014, F015, F016)
├── 09-add-datasource.html          # 新增資料來源 - 獨立頁面 (F011)
├── 10-edit-datasource.html         # 編輯資料來源 - 獨立頁面 (F013)
└── 11-states-and-interactions.html # 錯誤頁面、載入狀態、通用互動
```

共 **12 個 HTML 檔案**，每個檔案獨立可開啟（Tailwind CDN + Lucide CDN）。

---

## 執行順序與內容

### Phase 0：設計系統基礎
**檔案：** `00-design-system.html`

內容：
- 色彩色票展示
- 字型層級（h1-h3、body、label）
- 按鈕變體（Primary / Secondary / Danger / Ghost / Disabled / Loading）
- 表單元件（Text / Email / Password+可見切換 / Select / Checkbox / Textarea）
- 表單驗證狀態（紅邊框 + 錯誤文字）
- 表格樣式（header、hover row、pagination bar）
- 卡片樣式（白底 + rounded-lg + shadow-sm）
- Badge（狀態：connected/disconnected/unknown、角色：Admin/User）
- Modal/Dialog 模板（標題 + 內容 + 動作按鈕）
- Toast 通知（success/error/warning/info，右下角固定）
- Sidebar 導航 + Header 佈局
- Empty State 模板

### Phase 1：認證頁面 (F001-F003, F009)
**檔案：** `01-login.html` ~ `06-reset-password-success.html`

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `01-login.html` | F001, F002 | Email/密碼輸入、記住我、登入按鈕（含 loading）、錯誤提示、忘記密碼連結 |
| `02-user-info-page.html` | F002 | Header+登出、「目前尚無可用功能」訊息 |
| `03-forgot-password.html` | F009 | Email 輸入、發送重設連結按鈕、返回登入 |
| `04-forgot-password-sent.html` | F009 | 「若此 Email 存在，重設連結已寄出」 |
| `05-reset-password.html` | F009 | 新密碼+確認密碼、規則提示、過期連結狀態 |
| `06-reset-password-success.html` | F009 | 成功訊息、導回登入 |

### Phase 2：帳號管理 (F004-F008, F010)
**檔案：** `07-account-list.html`（含所有 Modal）

帳號管理的建立/編輯均使用 **Modal Dialog**，整合於帳號清單頁面內。

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `07-account-list.html` | F004, F005, F006, F003, F007, F008, F010 | Admin 完整佈局（Sidebar+Header+登出）、搜尋欄、角色/狀態篩選、分頁表格、操作按鈕。內嵌 Modal：**建立帳號(F004)**、**編輯帳號(F006)**、停用確認(F007)、角色變更(F008)、重設密碼(F010) |

### Phase 3：資料來源管理 (F011-F016)
**檔案：** `08-datasource-list.html` ~ `10-edit-datasource.html`

資料來源管理整合為**單一頁面雙頁籤**設計，儀表板（F016）與清單（F012）透過頁籤切換，**預設顯示儀表板頁籤**。新增/編輯使用**獨立頁面**（欄位較多，共 8 個）。

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `08-datasource-list.html` | F012, F014, F015, **F016** | **頁籤 1 — 狀態總覽（預設）**：4 張摘要卡片（總數/已連線/已斷線/未知）+ 全部重新整理按鈕、類型分佈圓餅圖、效能趨勢折線圖（24h/7d/30d 切換）、資料來源狀態卡片格線（含「立即測試」按鈕）、告警列表。**頁籤 2 — 資料來源清單**：列表/卡片視圖切換（localStorage 記憶）、搜尋/類型/狀態篩選、狀態 Badge、刪除確認對話框(F014)、測試連線按鈕+結果 Toast(F015) |
| `09-add-datasource.html` | F011 | 獨立頁面表單：名稱/類型(選擇後自動填入 port)/主機/埠/資料庫名/帳號/密碼/描述、欄位驗證 |
| `10-edit-datasource.html` | F013 | 獨立頁面預填表單（密碼欄空白+placeholder「若不修改請留空」）、測試連線按鈕 |

### Phase 4：通用狀態與互動
**檔案：** `11-states-and-interactions.html`

內容：403 禁止存取頁、404 找不到頁面、500 伺服器錯誤頁、Session 過期提示、Loading skeleton、各種 Toast 展示。

---

## 共用 UI 模式

| 模式 | 規則 |
|------|------|
| 導航 Sidebar | 兩項目：帳號管理(Users)、資料來源(Database)，active 狀態顯示藍色左邊框。資料來源頁內含儀表板頁籤 |
| 表單驗證 | blur 觸發、紅邊框+紅色錯誤文字、送出按鈕處理中 disabled |
| 確認對話框 | 破壞性操作必須確認，取消(Secondary)+確認(Danger red) |
| Toast 通知 | 右下角固定、5 秒自動消失、左邊框色彩區分類型 |
| 密碼欄位 | 遮罩+眼睛圖示切換可見、8 字元提示 |
| 分頁 | 預設 20 筆/頁、顯示「第 X 頁，共 Y 頁」 |

---

## Feature → 檔案對照表

| Feature | 主要檔案 | 也出現於 |
|---------|---------|---------|
| F001 Admin 登入 | `01-login.html` | — |
| F002 User 登入 | `01-login.html`, `02-user-info-page.html` | — |
| F003 登出 | `07-account-list.html` (header) | 所有 authenticated 頁面 |
| F004 建立帳號 | `07-account-list.html` (modal) | — |
| F005 帳號清單 | `07-account-list.html` | — |
| F006 編輯帳號 | `07-account-list.html` (modal) | — |
| F007 停用/啟用 | `07-account-list.html` (dialog) | — |
| F008 角色變更 | `07-account-list.html` (dialog) | — |
| F009 自助密碼重設 | `03~06*.html` | `01-login.html` (連結) |
| F010 Admin 重設密碼 | `07-account-list.html` (dialog) | — |
| F011 新增資料來源 | `09-add-datasource.html` | — |
| F012 資料來源清單 | `08-datasource-list.html` (清單頁籤) | — |
| F013 編輯資料來源 | `10-edit-datasource.html` | — |
| F014 刪除資料來源 | `08-datasource-list.html` (清單頁籤 dialog) | — |
| F015 測試連線 | `08-datasource-list.html` (toast) | `10-edit-datasource.html` |
| F016 儀表板 | `08-datasource-list.html` (狀態總覽頁籤，預設) | — |

---

## 關鍵參考檔案

- `specs/features/F001-admin-login.md` — 登入表單規格
- `specs/features/F005-view-account-list.md` — 清單/表格模式
- `specs/features/F012-view-datasource-list.md` — 雙視圖切換
- `specs/features/F016-datasource-status-dashboard.md` — 儀表板佈局與色彩（整合於 08-datasource-list.html 頁籤）
- `specs/error-handling.md` — 完整錯誤碼與繁中訊息
- `specs/architecture-spec.md` §10.3 — 前端技術棧

---

## 驗證方式

1. **逐檔開啟**：每個 HTML 檔案可在瀏覽器直接開啟，無需 build
2. **Feature 覆蓋**：對照上方 Feature→檔案表，確認 F001-F016 全部涵蓋
3. **互動狀態**：每個檔案內含 JavaScript 切換，可展示多種狀態（正常/錯誤/loading/empty）
4. **文字校對**：所有按鈕、標籤、錯誤訊息與 specs 中定義的繁中文字一致
5. **色彩驗證**：狀態 Badge 色彩與規格一致（#22C55E / #EF4444 / #9CA3AF）
