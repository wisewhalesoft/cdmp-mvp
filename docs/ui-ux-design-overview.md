# CDMP MVP — UI/UX 原型設計執行計畫

## Context

CDMP（企業客戶資料治理平台）MVP 已完成產品需求與系統架構規格。本計畫根據 `specs/features/F001-F036` 中的 UI/UX 需求，產出完整的互動式 HTML 原型，作為前端開發的設計基準。E01-E03 涵蓋認證、帳號管理與資料來源（F001-F016），E04 涵蓋資料擷取管理（F017-F026），E05 涵蓋 ETL Pipeline 管理（F027-F036）。

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
| Pipeline 管理頁面策略 | 單頁雙頁籤（17），儀表板為預設 | 沿用 08/12 的雙頁籤模式；F035 儀表板已納入範圍，儀表板為預設頁籤（與 E03/E04 一致） |
| Pipeline 監控儀表板 | 整合於 17 的儀表板頁籤（預設） | F035 規格：5 張統計小卡 + 執行趨勢雙色長條圖（7/14/30 天切換）+ 執行中 Pipeline 進度條 + 今日失敗清單 + 效能最差 Top 5，佈局與 E04 擷取儀表板一致 |
| 目標表管理 | 整合於 18 的 Load 節點屬性面板 + 獨立頁面（22） | F036 目標表選擇與欄位對應整合於 Pipeline 編輯器 Load 節點屬性面板；目標表 Schema 瀏覽使用獨立頁面（22），展示 4 個 Domain 目標表的完整欄位定義 |
| Pipeline 建立表單 | Modal Dialog | 欄位少（名稱+描述+排程，共 3 個），F028 明確要求「對話框或表單」，Modal 操作流暢，建立後直接導向編輯器 |
| Pipeline 視覺化編輯器 | 全頁三欄式佈局（18） | F029 核心功能，左側工具箱+中央畫布+右側屬性面板，需最大化畫布空間。原型以靜態 HTML 模擬 React Flow 畫布佈局 |
| Pipeline 日誌檢視 | 獨立頁面 + 右側 Drawer（19, 17 內嵌） | 日誌列表為獨立頁面（從列表行操作進入），日誌詳情使用右側 Drawer 展示節點執行記錄 |
| Pipeline 版本管理 | 獨立頁面（20） | F033 包含版本清單、Diff 比對、回滾/發布操作，內容較多適合獨立頁面 |
| Pipeline 版本 Diff | 左右對照面板 | F033 規格明確要求左右對照方式，新增節點綠色、刪除紅色、修改黃色 |
| Pipeline 狀態 Badge 色彩 | draft=#6B7280, active=#22C55E, running=#3B82F6, failed=#EF4444, disabled=#9CA3AF | 依 F027 規格定義，與擷取任務狀態色彩體系一致 |
| Pipeline 版本狀態 Badge 色彩 | draft=#6B7280, testing=#F59E0B, published=#22C55E | 依 F033 規格定義 |
| Pipeline 編輯器節點色彩 | Extract=#3B82F6(藍), Transform=#F59E0B(橘), Load=#22C55E(綠) | 依 F029 規格定義，三種類型以色彩區分 |
| Sidebar 新增項目 | ETL Pipeline（`workflow` 圖示） | 新增第四個 Sidebar 項目，`workflow` 圖示表達「流程/管線」語意 |
| Cron UI 選擇器 | 頻率選擇+時間選擇+Cron 預覽 | F028 要求 Cron UI 選擇器，複用 F017 的 cron 輸入模式（頻率下拉+時間+人類可讀說明） |
| Pipeline 執行進度 | 行內進度條 + Polling 5s | F030 要求即時進度更新，列表行內顯示進度條，與擷取任務的進度條模式一致 |

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
├── 16-raw-data-preview.html       # 擷取資料預覽 - 獨立頁面 (F026)
├── 17-pipeline-management.html    # Pipeline 管理（頁籤：監控儀表板(預設) + Pipeline 清單）(F027, F028, F030, F031, F034, F035)
├── 18-pipeline-editor.html        # Pipeline 視覺化編輯器 - 三欄式佈局 (F029)
├── 19-pipeline-logs.html          # Pipeline 日誌列表 + 日誌詳情 Drawer (F032)
├── 20-pipeline-versions.html      # Pipeline 版本管理 - Diff/回滾/發布 (F033)
├── 21-pipeline-interactions.html  # Pipeline 互動狀態展示（進度條/執行中/各 Transform 節點屬性面板）
└── 22-target-tables.html          # 目標表 Schema 瀏覽 - 4 個 Domain 目標表欄位定義 (F036)
```

共 **23 個 HTML 檔案**，每個檔案獨立可開啟（Tailwind CDN + Lucide CDN）。

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

### Phase 6：ETL Pipeline 管理 (F027-F036)
**檔案：** `17-pipeline-management.html` ~ `22-target-tables.html`

ETL Pipeline 管理整合為**單一頁面雙頁籤**設計（17），監控儀表板（F035）為預設頁籤，Pipeline 清單（F027）為第二頁籤（與 E03/E04 模式一致）。建立 Pipeline 使用 **Modal Dialog**（欄位少）。視覺化編輯器使用**獨立全頁面三欄式佈局**（18），Load 節點屬性面板整合 F036 目標表選擇與欄位對應。日誌使用**獨立頁面**（19）。版本管理使用**獨立頁面**（20）。目標表 Schema 瀏覽使用**獨立頁面**（22）。

#### Phase 6a：Pipeline 清單與基本操作 (17)

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `17-pipeline-management.html` | F027, F028, F030, F031, F034, **F035** | **頁籤 1 — 監控儀表板（預設）**：5 張統計小卡（總 Pipeline 數/執行中/今日成功/今日失敗/成功率）、執行趨勢雙色長條圖（綠色成功#22C55E/紅色失敗#EF4444，7d/14d/30d 切換）、執行中 Pipeline 進度條列表（藍色#3B82F6，每 5 秒 Polling）、今日失敗清單（含「查看日誌」「重新執行」按鈕）、效能最差 Top 5（平均執行時間+累計執行次數）、各區塊空狀態提示。**頁籤 2 — Pipeline 清單**：5 張統計卡片（總 Pipeline 數/啟用中/執行中/草稿/今日處理筆數）、搜尋框+狀態篩選下拉、Pipeline 表格（名稱/版本/步驟數/狀態 Badge/排程(人類可讀)/最後執行時間/下次執行時間/處理筆數/建立者）、行操作（編輯/執行或測試執行/啟用或停用/刪除）、分頁（10 筆/頁）、空狀態（引導建立第一個 Pipeline）。**內嵌互動**：建立 Pipeline Modal(F028，含名稱/描述/排程 Cron UI 選擇器)、刪除確認 Dialog(F034，含名稱+影響說明)、停用即時切換(F031，無確認框)、草稿啟用 disabled + tooltip(F031)、執行中進度條(F030，行內顯示)、running 狀態行操作按鈕 disabled。**Demo 狀態切換**：儀表板正常/儀表板空狀態/清單正常/清單空狀態/執行中/建立 Modal/刪除確認 |

#### Phase 6b：Pipeline 視覺化編輯器 (18)

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `18-pipeline-editor.html` | F029, **F036** | **全頁面三欄式佈局**（Sidebar 隱藏或收合，Header 保留 breadcrumb + 儲存/返回按鈕）。**左側工具箱**（200px，可收合）：三個分類（Extract/Transform/Load），Extract 含 1 種節點、Transform 含 13 種節點（合併/欄位對應/格式轉換/條件轉換/NULL 處理/型別轉換/篩選/去重/查找/字串處理/加密脫敏/聚合/衍生欄位）、Load 含 1 種節點，各節點帶圖示+名稱。**中央畫布**（React Flow 模擬）：靜態展示已放置的節點（Extract 藍色/Transform 橘色/Load 綠色）、節點間連線箭頭、縮放控制鈕（+/-/reset）。**右側屬性面板**（320px，選中節點時顯示）：根據節點類型動態切換表單 — Extract（raw data 表下拉）、Load（F036 目標表下拉選單含 Domain 分類標籤+選擇後載入欄位定義+左右兩欄欄位對應介面+ETL 追蹤欄位灰色標示「系統自動填充」+必填欄位紅色星號）、13 種 Transform 各有對應設定表單。**頂部工具列**：breadcrumb（Pipeline 清單 > Pipeline 名稱 > 編輯器）、「儲存」按鈕、「測試執行」按鈕、「返回」按鈕。**Demo 狀態切換**：空畫布/已有節點與連線/選中 Extract 節點/選中 Transform 節點（展示不同 Transform 類型的屬性面板）/選中 Load 節點。**連線規則視覺提示**：合法連線灰色箭頭、非法連線紅色閃爍 |

#### Phase 6c：Pipeline 日誌 (19)

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `19-pipeline-logs.html` | F032 | **獨立頁面**（從 Pipeline 清單行操作「查看日誌」進入）。**Breadcrumb**：Pipeline 清單 > Pipeline 名稱 > 執行日誌。**Pipeline 摘要卡片**：Pipeline 名稱/狀態/版本/排程。**日誌列表表格**：執行時間/版本號/狀態 Badge（running 藍/completed 綠/failed 紅）/處理筆數/耗時/觸發方式 Badge（manual 灰/schedule 藍/test 橘/retry 紫）、測試執行標記（橘色「測試」標籤）。**日誌詳情 Drawer**（480px，點擊日誌行展開）：頂部摘要（時間/版本/狀態/處理筆數/耗時/觸發方式）、各節點執行記錄表格（節點名稱/類型/狀態/處理筆數/耗時/錯誤訊息）、失敗節點紅色高亮+錯誤訊息。**分頁**：10 筆/頁。**空狀態**：「尚無執行紀錄」。**Demo 狀態切換**：正常/空狀態/有失敗日誌/Drawer 展開 |

#### Phase 6d：Pipeline 版本管理 (20)

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `20-pipeline-versions.html` | F033 | **獨立頁面**（從編輯器工具列或清單進入）。**Breadcrumb**：Pipeline 清單 > Pipeline 名稱 > 版本管理。**Pipeline 摘要卡片**：Pipeline 名稱/目前版本/狀態。**版本清單表格**：版號/時間/變更摘要/狀態 Badge（draft 灰/testing 橘/published 綠）/建立者/操作按鈕（Diff/回滾/發布）。**Diff 比對視圖**（Modal 或展開區域）：版本選擇器（from/to 下拉）、左右對照面板（新增節點綠色背景/刪除節點紅色背景/修改節點黃色背景）、新增/刪除連線列表。**回滾確認 Dialog**：「將回滾至版本 N，系統將建立一個新的草稿版本」。**發布按鈕**：僅 testing 狀態版本可見，draft 狀態版本顯示 disabled + tooltip「請先完成測試執行」。**Demo 狀態切換**：單版本（無 Diff）/多版本/Diff 視圖/回滾確認/發布確認 |

#### Phase 6e：Pipeline 互動狀態展示 (21)

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `21-pipeline-interactions.html` | — | 獨立展示頁面，集中展示 Pipeline 相關的所有互動狀態（含 F035 儀表板各區塊空狀態、F036 目標表欄位對應互動）。**Pipeline 狀態 Badge 全集**：draft/active/running/failed/disabled。**版本狀態 Badge 全集**：draft/testing/published。**觸發方式 Badge 全集**：manual/schedule/test/retry。**建立 Pipeline Modal**：含 Cron UI 選擇器（頻率/時間/Cron 預覽+下次執行時間）。**執行進度條**：行內進度條動畫 + 百分比 + 當前節點名稱。**編輯器節點樣式**：Extract（藍色）/Transform（橘色）/Load（綠色）節點卡片、連線箭頭、選中狀態。**13 種 Transform 屬性面板**：逐一展示每種 Transform 節點的設定表單（Merge/Field Mapping/Format/Conditional/Null Handler/Type Cast/Filter/Deduplicate/Lookup/String/Masking/Aggregate/Derived Column）。**Diff 比對色彩**：新增綠色/刪除紅色/修改黃色。**Toast 通知**：Pipeline 儲存成功/執行已開始/發布成功/刪除成功 |

#### Phase 6f：目標表 Schema 瀏覽 (22)

| 檔案 | 涵蓋 Feature | 關鍵元素 |
|------|-------------|---------|
| `22-target-tables.html` | F036 | **獨立頁面**（從 Sidebar 或編輯器 Load 節點連結進入）。**Breadcrumb**：ETL Pipeline > 目標表定義。**4 張目標表卡片**：customer_core（身分/主檔，16 欄位）/ customer_interaction（行為/接觸，14 欄位）/ customer_financial（交易/風控，20 欄位）/ customer_service（客服/申訴，17 欄位），每張卡片顯示 tableName、displayName、domain 標籤、columnCount、description。**展開式欄位定義**：點擊卡片展開該表的完整欄位清單表格（欄位名稱/型別/是否可為 null/是否主鍵/描述），ETL 追蹤欄位（data_source / _etl_loaded_at / _etl_pipeline_id）以灰色背景+「系統自動填充」標籤區分，主鍵欄位以紅色星號標示。**Demo 狀態切換**：全部收合/展開 customer_core/展開 customer_financial |

---

## 共用 UI 模式

| 模式 | 規則 |
|------|------|
| 導航 Sidebar | 四項目：帳號管理(Users)、資料來源(Database)、資料擷取(arrow-down-to-line)、ETL Pipeline(workflow)，active 狀態顯示藍色左/右邊框。資料來源頁、資料擷取頁、Pipeline 頁各含儀表板頁籤（儀表板均為預設頁籤） |
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
| Pipeline 狀態 Badge | draft=灰色(#6B7280) / active=綠色(#22C55E) / running=藍色(#3B82F6) / failed=紅色(#EF4444) / disabled=灰色(#9CA3AF)。Badge 使用 rounded-full + px-2.5 py-0.5 + text-xs font-medium + 對應色彩的淺背景+深文字 |
| Pipeline 版本狀態 Badge | draft=灰色(#6B7280) / testing=橘色(#F59E0B) / published=綠色(#22C55E) |
| Pipeline 觸發方式 Badge | manual=灰色 / schedule=藍色 / test=橘色 / retry=紫色(#8B5CF6)。使用 outline 風格 Badge |
| Pipeline 編輯器畫布 | 靜態 HTML 模擬 React Flow 佈局。背景使用點陣格線（CSS repeating-radial-gradient）。節點為圓角卡片（shadow-md + border-l-4 色彩邊條）。連線以 SVG path + arrowhead marker 繪製。縮放控制鈕固定於畫布右下角 |
| Pipeline 節點工具箱 | 左側 200px 面板，白色背景，按 Extract/Transform/Load 三個 Accordion 分組。每個節點項目顯示圖示+名稱，hover 時 bg-gray-50。Transform 分類預設展開，顯示 13 種節點 |
| Pipeline 屬性面板 | 右側 320px 面板，白色背景，border-l。頂部顯示節點類型 Badge + 節點名稱。下方為對應的設定表單。未選中節點時顯示提示「點擊節點以編輯屬性」 |
| Pipeline 節點圖示 | Extract: `database`(藍) / Transform-Merge: `git-merge` / Transform-Field-Mapping: `columns` / Transform-Format: `type` / Transform-Conditional: `git-branch` / Transform-Null-Handler: `circle-slash` / Transform-Type-Cast: `repeat` / Transform-Filter: `filter` / Transform-Deduplicate: `copy-minus` / Transform-Lookup: `search` / Transform-String: `text-cursor` / Transform-Masking: `shield` / Transform-Aggregate: `sigma` / Transform-Derived-Column: `calculator` / Load: `upload`(綠) |
| Pipeline 連線規則 | Extract 只能連到 Transform / Transform 可連到 Transform 或 Load / Load 為終端節點。非法連線嘗試以紅色虛線+提示文字表示 |
| Pipeline Cron UI 選擇器 | 頻率下拉（每小時/每日/每週/每月）+ 時間選擇（時:分）+ 手動 Cron 輸入 toggle + 人類可讀說明 + 下次執行時間預覽。複用 F017 擷取任務的 cron 輸入模式 |
| Pipeline 刪除確認 Dialog | 標題「確認刪除 Pipeline」+ Pipeline 名稱 + 影響說明「刪除後排程將停止，歷史日誌將保留」+ 取消(ghost) / 確認刪除(danger red) |
| Pipeline 回滾確認 Dialog | 標題「確認回滾版本」+ 說明「將回滾至版本 N，系統將建立一個新的草稿版本」+ 取消(ghost) / 確認回滾(primary) |
| Pipeline Diff 視圖 | 左右對照面板（50%/50%），左側標題「版本 N」右側標題「版本 M」。新增節點行：bg-green-50 + 左側綠色邊條。刪除節點行：bg-red-50 + 左側紅色邊條。修改節點行：bg-amber-50 + 左側黃色邊條，顯示欄位名稱+舊值→新值 |
| Pipeline 執行進度條 | 行內顯示：藍色 #3B82F6 進度條 + 百分比文字 + 當前處理節點名稱。running 狀態行的操作按鈕全部 disabled |
| Pipeline 儀表板統計小卡 | 5 張橫向排列：總 Pipeline 數（紫色圖示）/ 執行中（藍色#3B82F6）/ 今日成功（綠色#22C55E）/ 今日失敗（紅色#EF4444）/ 成功率（百分比，依數值色彩漸變）。佈局與 E04 擷取儀表板一致 |
| Pipeline 執行趨勢圖 | 雙色長條圖：X 軸日期、Y 軸次數，綠色(#22C55E)成功/紅色(#EF4444)失敗。右上角 7天/14天/30天 切換按鈕組，預設 7 天。使用 Chart.js CDN 繪製 |
| Pipeline 儀表板失敗清單 | 表格顯示：Pipeline 名稱/失敗時間/錯誤摘要。每行含「查看日誌」Ghost 按鈕（連結至 F032）+「重新執行」Primary 按鈕（觸發 F030）。空狀態：「今日無失敗紀錄」 |
| Pipeline 效能最差 Top 5 | 排名表格：#序號/Pipeline 名稱/平均執行時間（格式化為 秒/分/時）/累計執行次數。空狀態：「尚無執行紀錄」 |
| 目標表卡片 | 圓角卡片含 Domain 色彩標籤（core=藍/interaction=綠/financial=橘/service=紫）+ 表名 + 說明 + 欄位數 Badge。點擊展開欄位定義表格 |
| 目標表欄位對應（Load 節點） | 左右兩欄佈局：左側「來源欄位」（上游節點輸出欄位下拉選單）、右側「目標欄位」（目標表欄位名稱+型別）。ETL 追蹤欄位行灰色背景+「系統自動填充」標籤，不可操作。必填欄位（主鍵且非 nullable）紅色星號標示 |

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
| F027 查看 Pipeline 列表 | `17-pipeline-management.html` (清單頁籤) | — |
| F028 建立 Pipeline | `17-pipeline-management.html` (modal) | — |
| F029 視覺化轉換編輯器 | `18-pipeline-editor.html` | `21-pipeline-interactions.html` (節點樣式+屬性面板展示) |
| F030 執行 Pipeline | `17-pipeline-management.html` (行操作+進度條) | `18-pipeline-editor.html` (工具列「測試執行」按鈕), `21-pipeline-interactions.html` (進度條展示) |
| F031 啟用/停用 Pipeline | `17-pipeline-management.html` (行操作切換) | — |
| F032 查看 Pipeline 日誌 | `19-pipeline-logs.html` | `17-pipeline-management.html` (行操作「查看日誌」連結) |
| F033 Pipeline 版本管理 | `20-pipeline-versions.html` | `18-pipeline-editor.html` (工具列版本資訊) |
| F034 刪除 Pipeline | `17-pipeline-management.html` (dialog) | — |
| F035 Pipeline 監控儀表板 | `17-pipeline-management.html` (監控儀表板頁籤, 預設) | `21-pipeline-interactions.html` (儀表板空狀態展示) |
| F036 目標表 Domain-Oriented 規劃 | `22-target-tables.html` | `18-pipeline-editor.html` (Load 節點屬性面板：目標表選擇+欄位對應), `21-pipeline-interactions.html` (欄位對應互動展示) |

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
- `specs/features/F027-pipeline-list.md` — Pipeline 列表與統計卡片規格
- `specs/features/F028-create-pipeline.md` — 建立 Pipeline 表單與 Cron UI 規格
- `specs/features/F029-pipeline-editor.md` — 視覺化編輯器三欄佈局、13 種 Transform 節點 JSONB 結構與設定表單、連線規則
- `specs/features/F030-execute-pipeline.md` — 手動/測試/排程執行與進度 Polling 規格
- `specs/features/F031-toggle-pipeline.md` — 啟用/停用規則與 UI 行為
- `specs/features/F032-pipeline-logs.md` — 日誌列表與詳情（含節點級執行記錄）
- `specs/features/F033-pipeline-version.md` — 版本清單、Diff 比對 API、回滾與發布流程
- `specs/features/F034-delete-pipeline.md` — 軟刪除確認對話框
- `specs/diagrams/pipeline-states.md` — Pipeline 狀態轉換圖（draft/active/running/failed/disabled）
- `specs/diagrams/pipeline-version-states.md` — 版本狀態轉換圖（draft/testing/published）
- `specs/diagrams/pipeline-editor-flow.md` — 編輯器操作流程圖
- `specs/diagrams/pipeline-crud-flow.md` — Pipeline CRUD 時序圖
- `specs/diagrams/pipeline-execution-flow.md` — Pipeline 執行流程（含排程觸發與 Polling）
- `specs/error-handling.md` §ETL_PIPELINE — Pipeline 相關錯誤碼（PIPELINE_NAME_EXISTS / PIPELINE_NOT_FOUND / PIPELINE_RUNNING / PIPELINE_NO_DEFINITION / PIPELINE_DRAFT_CANNOT_ENABLE / PIPELINE_INVALID_CONNECTION / PIPELINE_PUBLISH_REQUIRES_TEST）
- `specs/features/F035-pipeline-dashboard.md` — Pipeline 監控儀表板佈局、統計小卡、趨勢圖、執行中進度條、失敗清單、效能最差 Top 5
- `specs/features/F036-target-tables.md` — 目標表 Domain-Oriented 規劃、4 個目標表 Schema 定義、Load 節點欄位對應介面、ETL 追蹤欄位自動填充
- `specs/data-model.md` §EtlPipeline / §EtlPipelineVersion / §EtlPipelineLog / §target-tables — Pipeline 相關 Entity 定義與目標表 Schema

---

## 驗證方式

1. **逐檔開啟**：每個 HTML 檔案可在瀏覽器直接開啟，無需 build
2. **Feature 覆蓋**：對照上方 Feature→檔案表，確認 F001-F036 全部涵蓋
3. **互動狀態**：每個檔案內含 JavaScript 切換，可展示多種狀態（正常/錯誤/loading/empty）
4. **文字校對**：所有按鈕、標籤、錯誤訊息與 specs 中定義的繁中文字一致
5. **色彩驗證**：狀態 Badge 色彩與規格一致（#22C55E / #EF4444 / #9CA3AF / #3B82F6 / #F59E0B / #8B5CF6）
6. **Pipeline 狀態覆蓋**：Pipeline 5 種狀態（draft/active/running/failed/disabled）與版本 3 種狀態（draft/testing/published）均有對應 Badge 展示
7. **編輯器節點覆蓋**：13 種 Transform 節點均有對應的屬性面板展示（在 21-pipeline-interactions.html 中）
8. **連線規則驗證**：編輯器原型展示合法與非法連線的視覺差異
9. **Sidebar 導航**：所有 E05 頁面的 Sidebar 應有 4 個項目，ETL Pipeline 為 active 狀態
10. **Pipeline 儀表板覆蓋**：F035 的 5 個區塊（統計小卡/趨勢圖/執行中進度條/失敗清單/效能最差 Top 5）均在 17-pipeline-management.html 儀表板頁籤中呈現，各區塊空狀態可展示
11. **目標表覆蓋**：F036 的 4 個 Domain 目標表（customer_core/customer_interaction/customer_financial/customer_service）在 22-target-tables.html 中展示完整欄位定義，Load 節點屬性面板在 18-pipeline-editor.html 中展示目標表選擇與欄位對應
