# CDMP MVP — UI/UX 原型設計執行計畫

## Context

CDMP（企業客戶資料治理平台）MVP 已完成產品需求與系統架構規格。本計畫根據 `specs/features/F001-F026` 中的 UI/UX 需求，產出完整的互動式 HTML 原型，作為前端開發的設計基準。E01-E03 涵蓋認證、帳號管理與資料來源（F001-F016），E04 涵蓋資料擷取管理（F017-F026）。

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
| 擷取任務表單 | 獨立頁面（13, 14） | 6-7 個欄位含條件邏輯（增量模式）+ cron 預覽，複雜度近似資料來源表單 |
| 擷取儀表板+清單 | 單頁雙頁籤（12），儀表板為預設 | 仿照 08-datasource-list.html 模式，F024 規格明確要求 |
| 日誌檢視 | 右側 Drawer（480px） | 優於 Modal：保留任務清單上下文，適合表格式日誌資料 |
| Sidebar 圖示 | `arrow-down-to-line` | 視覺表達「擷取/下載」，與 `users`、`database` 區隔 |
| 擷取狀態 Badge 色彩 | running=#3B82F6, scheduled=#6B7280, completed=#22C55E, failed=#EF4444, disabled=#9CA3AF | 依 F018 規格 |
| 擷取任務分頁 | 10 筆/頁 | 依 F018/F022 規格（不同於帳號的 20 筆/頁） |
| 欄位更名 | `sourceTable`（來源資料表） | F017/F019 原 `targetTable`（目標資料表）更名，反映實際語意：指定外部資料庫中要讀取的表 |
| 來源資料表選擇 | 連鎖下拉（Datasource → Schema → Table） | F017 v1.2 / F019 v1.2：從手動文字輸入改為動態載入下拉選單，避免人為輸入錯誤；連線失敗時停用下拉、不提供手動 fallback |
| 來源資料表顯示格式 | `schema.table`（如 `dbo.customers`） | 統一在清單、預覽頁使用此格式顯示，語意更明確 |
| 變更來源表警告 | 紅色 Destructive Modal | F019：已執行過的任務變更 schema/table 時可能導致 raw data 表重建，需明確警告使用者 |
| Raw data 預覽分頁 | 預設 50 筆/頁，可切 100/200 | F026 規格；大量資料不提供全量下載（Phase 2） |
| 系統欄位區分 | 灰色背景列 `cdmp-sys-col` | `_cdmp_id`、`_cdmp_extracted_at` 以淺灰背景與一般欄位視覺區分 |

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
├── 11-states-and-interactions.html # 錯誤頁面、載入狀態、通用互動
├── 12-extraction-management.html   # 擷取管理（頁籤：監控儀表板(預設) + 任務清單）(F018, F020-F022, F024, F025)
├── 13-add-extraction-task.html     # 新增擷取任務 - 獨立頁面 (F017)
├── 14-edit-extraction-task.html    # 編輯擷取任務 - 獨立頁面 (F019)
├── 15-extraction-interactions.html # 擷取互動狀態展示
└── 16-raw-data-preview.html       # 擷取資料預覽 - 獨立頁面 (F026)
```

共 **17 個 HTML 檔案**，每個檔案獨立可開啟（Tailwind CDN + Lucide CDN）。

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

### Phase 5：資料擷取管理 (F017-F026)
**檔案：** `12-extraction-management.html` ~ `16-raw-data-preview.html`

資料擷取管理整合為**單一頁面雙頁籤**設計，監控儀表板（F024）與任務清單（F018）透過頁籤切換，**預設顯示監控儀表板頁籤**。新增/編輯使用**獨立頁面**（欄位含條件邏輯）。日誌檢視使用**右側 Drawer**（480px）保留清單上下文。Raw data 預覽使用**獨立頁面**（F026），可從日誌 Drawer 的 completed 日誌連結進入。

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `12-extraction-management.html` | F018, F020, F021, F022, F024, F025 | **頁籤 1 — 監控儀表板（預設）**：5 張摘要卡片（總任務數/執行中/今日成功/今日失敗/成功率）、執行趨勢堆疊長條圖（7d/14d/30d 切換）、執行中任務進度條、今日失敗清單（含「查看日誌」「重新執行」）、最慢任務 Top 5。**頁籤 2 — 任務清單**：搜尋/狀態/模式/資料來源篩選、任務表格（名稱/資料來源/模式/狀態 Badge/排程/上次執行/擷取筆數）、行操作（編輯/立即執行/查看日誌/啟用停用/刪除）、分頁（10 筆/頁）、空狀態。**內嵌互動**：停用確認 Dialog(F020)、刪除確認 Dialog(F025)、日誌 Drawer(F022，completed 日誌含「預覽資料」連結)、進度條動畫(F021) |
| `13-add-extraction-task.html` | F017 | 獨立頁面表單：名稱/資料來源下拉/擷取模式(全量/增量 radio)/來源資料表/排程(cron+人類可讀說明)/增量欄位(條件顯示)/增量起始值(選填)、blur 驗證、Demo 狀態切換 |
| `14-edit-extraction-task.html` | F019 | 與建立表單同結構，預填資料。執行中任務：黃色警告 banner + 所有欄位 disabled |
| `15-extraction-interactions.html` | — | 獨立展示：進度條各階段狀態、Drawer 日誌詳情（含「預覽資料」連結）、disabled 狀態、Toast 通知 |
| `16-raw-data-preview.html` | F026 | 獨立頁面：任務摘要卡片（任務名稱/來源資料表/Raw Data 表名/最後更新時間/總筆數）、資料表格（動態欄位/排序/系統欄位灰色背景區分）、分頁（50/100/200 筆切換）、空狀態、Skeleton loading、大量資料警告 banner |

---

## 共用 UI 模式

| 模式 | 規則 |
|------|------|
| 導航 Sidebar | 三項目：帳號管理(Users)、資料來源(Database)、資料擷取(arrow-down-to-line)，active 狀態顯示藍色左/右邊框。資料來源頁與資料擷取頁各含儀表板頁籤 |
| 表單驗證 | blur 觸發、紅邊框+紅色錯誤文字、送出按鈕處理中 disabled |
| 確認對話框 | 破壞性操作必須確認，取消(Secondary)+確認(Danger red) |
| Toast 通知 | 右下角固定、5 秒自動消失、左邊框色彩區分類型 |
| 密碼欄位 | 遮罩+眼睛圖示切換可見、8 字元提示 |
| 分頁 | 預設 20 筆/頁（帳號）或 10 筆/頁（擷取任務/日誌）、顯示「第 X 頁，共 Y 頁」 |
| 進度條 | 藍色 #3B82F6 進度條，顯示 extracted_count/total_count 與百分比 |
| 右側 Drawer | 480px 寬度、右側滑入、半透明背景、Z-40 層級 |
| 日誌預覽連結 | completed 且 extracted_count > 0 的日誌顯示「預覽資料」Ghost 連結 + external-link 圖示 |
| 大量資料警告 | 資料量 > 100,000 筆時顯示 amber 色 banner（bg-amber-50 border-amber-200） |
| 系統欄位標記 | `_cdmp_id`、`_cdmp_extracted_at` 表頭與儲存格使用 `.cdmp-sys-col` 灰色背景 |
| 表格排序 | 點擊欄位標題：第一次升冪、第二次降冪、第三次恢復預設；排序方向以 chevron-up/chevron-down 圖示表示 |
| 連鎖下拉 (Cascade Select) | Datasource → Schema → Table 三層連動：(1) 上層變更時清空並停用所有下層 (2) 載入中顯示 spinner + disabled (3) 載入完成啟用 (4) 連線失敗顯示紅色邊框+錯誤訊息，下拉保持停用，不提供手動輸入 |
| Raw Data 重建警告 Modal | 編輯表單變更 schema/table 時彈出：紅色 icon + 標題「確認變更來源資料表」+ 說明文字 + 取消(ghost) / 確認變更(danger red) 按鈕。取消時回復原選擇值 |

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
| F017 建立擷取任務 | `13-add-extraction-task.html` | — |
| F018 查看擷取任務清單 | `12-extraction-management.html` (任務清單頁籤) | — |
| F019 編輯擷取任務 | `14-edit-extraction-task.html` | — |
| F020 啟用/停用 | `12-extraction-management.html` (dialog) | — |
| F021 立即執行/重新執行 | `12-extraction-management.html` (progress + button) | `15-extraction-interactions.html` |
| F022 查看擷取日誌 | `12-extraction-management.html` (drawer) | `15-extraction-interactions.html` |
| F023 排程擷取 | 無獨立 UI（cron 欄位在 F017 表單） | `13-add-extraction-task.html` |
| F024 擷取監控儀表板 | `12-extraction-management.html` (監控儀表板頁籤, 預設) | — |
| F025 刪除擷取任務 | `12-extraction-management.html` (dialog) | — |
| F026 查看擷取資料預覽 | `16-raw-data-preview.html` | `12-extraction-management.html` (drawer 連結), `15-extraction-interactions.html` (drawer 連結) |

---

## 關鍵參考檔案

- `specs/features/F001-admin-login.md` — 登入表單規格
- `specs/features/F005-view-account-list.md` — 清單/表格模式
- `specs/features/F012-view-datasource-list.md` — 雙視圖切換
- `specs/features/F016-datasource-status-dashboard.md` — 儀表板佈局與色彩（整合於 08-datasource-list.html 頁籤）
- `specs/error-handling.md` — 完整錯誤碼與繁中訊息
- `specs/features/F017-create-extraction-task.md` — 擷取任務表單規格
- `specs/features/F018-view-extraction-task-list.md` — 擷取任務清單與統計
- `specs/features/F024-extraction-dashboard.md` — 擷取監控儀表板佈局
- `specs/features/F026-preview-raw-data.md` — 擷取資料預覽規格
- `specs/architecture-spec.md` §10.3 — 前端技術棧

---

## 驗證方式

1. **逐檔開啟**：每個 HTML 檔案可在瀏覽器直接開啟，無需 build
2. **Feature 覆蓋**：對照上方 Feature→檔案表，確認 F001-F026 全部涵蓋
3. **互動狀態**：每個檔案內含 JavaScript 切換，可展示多種狀態（正常/錯誤/loading/empty）
4. **文字校對**：所有按鈕、標籤、錯誤訊息與 specs 中定義的繁中文字一致
5. **色彩驗證**：狀態 Badge 色彩與規格一致（#22C55E / #EF4444 / #9CA3AF）
