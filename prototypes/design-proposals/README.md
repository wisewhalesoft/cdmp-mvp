# 名單定義 v2 設計提案（27-list-definition.html 改版）

> 目錄：`prototypes/design-proposals/`
> 改版範圍：`27-list-definition.html`（客戶名單分派 → 名單定義入口頁）
> 三套方案均已修正 v1 的 role 邏輯 bug，並加入「該月準備度進度條」整體視覺。

---

## 1. 背景與目的

v1 的 `27-list-definition.html` 雖然功能完整（KPI、stage chip 篩選、表格、Modal），但有兩個痛點需要解決：

| 痛點 | 影響 | v2 改善方向 |
| --- | --- | --- |
| Role 邏輯混淆 | `director`（部長）被當成 `section_chief`（處長）過濾轄區 → 部長看不到全部名單 | 三套方案皆**直接修正**：部長/Admin 看全部、處長才過濾轄區 |
| 缺少「整月推進感」 | 五階段 KPI 雖然分開列出，但看不到「整月準備好沒？還差幾份？」 | 三套方案皆加入「該月準備度進度條」，五段顏色堆疊呈現整月狀態 |

---

## 2. v1 Bug 對照（落地時請順手修正）

| 檔案 | 行號 | 原始（錯誤） | 應改為 |
| --- | --- | --- | --- |
| `27-list-definition.html` | line 794-796 | `if (currentRole === 'director') { rows = rows.filter(r => r.createdBy === '李處長') }` | `if (currentRole === 'section_chief') { rows = rows.filter(r => r.createdBy === '李處長') }` |
| `27-list-definition.html` | line 687-689 | `if (role === 'director' && row.createdBy !== '李處長') return '轄區外'` | 移除整段；改為 `if (role === 'section_chief' && row.createdBy !== '李處長') return '轄區外'`（且 section_chief 本來就被前面 filter 過了，這段其實可刪） |

**正確 role 行為矩陣：**

| Role | 看到的範圍 | 可操作 |
| --- | --- | --- |
| `admin` 系統管理者 | 全部名單 | 全部階段（同 director） |
| `director` 業務部長 | **全部名單**（修正） | draft/dept_ratio/personnel_ratio/approval/ready 全部 |
| `section_chief` 業務處長 | **僅自己轄區**（修正） | 僅 `personnel_ratio` 階段可設定本部門業務；其他唯讀 |
| `user` 一般使用者 | （無權限）整頁封鎖 | 提示前往 Customer 360 |

---

## 3. 三套方案比較表

| 維度 | **Option A 階段流水線** | **Option B Kanban 看板** | **Option C 分組表格** |
| --- | --- | --- | --- |
| **主視覺** | 5 階段卡片水平串聯（funnel 風） | 5 欄並列看板（每欄卡片陳列） | 5 個分組表格（可折疊） |
| **資訊密度** | 中（卡片只顯示階段聚合） | 中高（卡片含 LIST_NO + 條件 + CR） | **高**（完整表格欄位） |
| **準備度進度條位置** | 頂部 主視覺區（與 funnel 並列強調） | 中段（KPI 與 Kanban 之間，水平 12px 細條） | 頂部 主視覺區（粗條 18px，段內嵌數字） |
| **單頁可掌握名單數** | 點擊後一次看一階段（焦點明確） | 5 欄並列，一眼掃描完所有階段 | 全部展開後可一頁滾完所有名單 |
| **適合場景** | 部長想看「流程哪一階段卡住了」 | 部長想「橫向比較哪個階段名單最多」 | Admin / 處長想「逐筆驗證資料正確性」 |
| **互動模式** | 點擊階段卡片 → 展開該階段名單 | 直接看 5 欄並列卡片，欄內捲動 | 點擊階段標頭 → 展開/收合整個分組 |
| **操作按鈕** | 在展開區，標準大小 | 在卡片底部，較小（壓縮） | 在表格列尾，標準大小 |
| **CR / 建立者 / 時間** | 在展開區內 | 在卡片內（迷你版） | 在表格欄內（標準版） |
| **業務員無權限提示** | 整頁封鎖 | 整頁封鎖 | 整頁封鎖 |
| **歷史月份 readonly** | 寫入按鈕隱藏 | 寫入按鈕隱藏 | 寫入按鈕隱藏 |
| **流暢度 / 視覺新穎度** | **★★★★★** 流程感最強 | ★★★★ 看板感親切 | ★★★ 接近 v1 表格保守 |
| **開發複雜度（落地 React）** | 中（展開區 lazy render） | 中高（5 欄 grid + per-col scroll） | **低**（保留 v1 表格結構） |

---

## 4. 視覺細節對照

### 4.1 該月準備度進度條（三套通用）

**5 段顏色堆疊**（左→右對應推進方向，已採納原任務要求）：

```
[草稿 灰 #9CA3AF] [部門比例 藍 #3B82F6] [個別比例 青 #06B6D4] [待簽核 琥珀 #F59E0B] [準備完成 綠 #22C55E]
```

範例：2026-05 月份 `ready 11/15 (73%)`，進度條 73% 寬度為綠色，剩 27% 為其他四階段比例堆疊。

| 方案 | 進度條規格 |
| --- | --- |
| **Option A** | 中等 12px 厚度，置於頂部第一個 section，旁邊有醒目「ready X / Y · pct」大字 |
| **Option B** | 細 12px 厚度，置於 KPI 卡與 Kanban 之間，作為「橋接視覺」 |
| **Option C** | **粗 18px 厚度**，置於頂部第一個 section，段內嵌數字（段寬 ≥ 8% 才顯示）+ 底部 legend 顯示各階段數量 |

### 4.2 STAGE_META 配色（三套一致，沿用 v1）

| stage 鍵 | label | bg (淺) | fg (字) | solid (進度條) | icon |
| --- | --- | --- | --- | --- | --- |
| `draft` | 草稿 | `#F3F4F6` | `#6B7280` | `#9CA3AF` | `pencil` |
| `dept_ratio` | 部門比例 | `#DBEAFE` | `#1E40AF` | `#3B82F6` | `building-2` |
| `personnel_ratio` | 個別比例 | `#CFFAFE` | `#0E7490` | `#06B6D4` | `users` |
| `approval` | 待簽核 | `#FEF3C7` | `#92400E` | `#F59E0B` | `stamp` |
| `ready` | 準備完成 | `#DCFCE7` | `#15803D` | `#22C55E` | `check-circle-2` |

### 4.3 ROLE_META 配色（v3.0 四角色，三套一致）

| role | label | bg | fg | icon |
| --- | --- | --- | --- | --- |
| `admin` | 系統管理者 | `#DBEAFE` | `#1D4ED8` | `crown` |
| `director` | 業務部長 | `#EDE9FE` | `#6D28D9` | `briefcase` |
| `section_chief` | 業務處長 | `#CFFAFE` | `#0E7490` | `user-cog` |
| `user` | 一般使用者 | `#F3F4F6` | `#374151` | `user` |

---

## 5. 推薦選擇

### 推薦：**Option C 分組表格版**

**一句話理由**：在「資訊密度」與「視覺改善」之間取得最佳平衡 — 用最少的開發成本（保留 v1 表格結構）換來最大的可讀性提升（粗條準備度 + 階段分組折疊），同時資訊量最完整、最適合部長/Admin 的實際使用情境（驗證、比對、定位特定名單）。

**選擇理由分項：**

1. **資訊量無損** — v1 表格的所有欄位（LIST_NO、名稱、條件、CR、建立者、時間、操作）完整保留，沒有任何資訊降級。
2. **視覺新意夠** — 頂部粗條準備度進度條（18px + 段內嵌數字 + 底部 legend）為新視覺主視覺，足以呈現「整月推進感」，又不會過於花俏。
3. **階段分組可折疊** — 例如「準備完成」階段名單多時可一鍵收合，把精力集中在 draft / approval 等待辦項目。
4. **落地成本最低** — 表格邏輯沿用 v1，主要改動只在「加進度條 + 把單一 tbody 拆成 5 個 group」，React 落地 1-2 天可完成。
5. **適配未來功能擴充** — 若未來需要加 sort by column、bulk action、export csv 等表格進階功能，分組表格的擴充性遠高於 funnel / kanban。

### 次選：Option A 階段流水線版

如果業務部長明確表示「我只想知道現在卡在哪一階段，不太需要看詳細欄位」，Option A 的流水線視覺感最強烈，閱讀體驗也最輕快。

### 不推薦預設：Option B Kanban 看板版

Kanban 雖然親切，但「5 欄並列」在 1440px 桌面上每欄只有 ~270px 寬度，卡片資訊壓縮嚴重（操作按鈕需縮成 2 字「停」、「設定」等），實際使用時容易誤點。除非未來導入「拖拉推進階段」功能（如將 draft 卡片拖到 dept_ratio 欄），否則 Kanban 的優勢無法完全發揮。

---

## 6. 檔案清單

| 檔案 | 大小（行） | 描述 |
| --- | --- | --- |
| `27-v2-option-A.html` | ~600 行 | 階段流水線版（funnel） |
| `27-v2-option-B.html` | ~570 行 | Kanban 看板版（5 欄） |
| `27-v2-option-C.html` | ~600 行 | 分組表格版（推薦） |
| `README.md` | 本檔 | 三方案比較與選擇建議 |

---

## 7. 共通功能對照表（三套皆有）

| 功能 | Option A | Option B | Option C |
| --- | --- | --- | --- |
| 月份切換器（左/右箭頭 + dropdown） | ✓ | ✓ | ✓ |
| 角色切換器（4 角色） | ✓ | ✓ | ✓ |
| Demo bar（normal + historical） | ✓ | ✓ | ✓ |
| 該月準備度進度條（5 段堆疊） | ✓（頂部主視覺） | ✓（中段細條） | ✓（頂部粗條） |
| 搜尋（LIST_NO / 名單名稱） | ✓ | ✓ | ✓ |
| 歷史月份唯讀 banner | ✓ | ✓ | ✓ |
| 業務員整頁封鎖 banner | ✓ | ✓ | ✓ |
| 停用名單 Modal（destructive） | ✓ | ✓ | ✓ |
| 推進至部門比例 Modal（F078） | ✓ | ✓ | ✓ |
| Toast 通知（success/warning/info/error） | ✓ | ✓ | ✓ |
| Lucide icons | ✓ | ✓ | ✓ |
| Tailwind CDN | ✓ | ✓ | ✓ |
| 完整 Mock data（11 筆 2026-05 + 3 筆 2026-04） | ✓ | ✓ | ✓ |
| Sidebar 四提案互通連結 | ✓ | ✓ | ✓ |

---

## 8. 驗證方式

1. **直接打開 HTML** — 每個檔案 self-contained，可直接於瀏覽器打開預覽（推薦 Chrome / Edge），無需 build step。
2. **切換角色測試 role 邏輯**：
   - `admin` / `director` → 應看到**全部 11 筆 2026-05 名單**（包括王部長 / 李處長建立的）
   - `section_chief` → 應只看到**李處長建立的 4 筆**（OB202605003 / 005 / 007 / 011）
   - `user` → 應顯示整頁封鎖 banner
3. **切換月份測試歷史唯讀**：切到 `2026-04`，所有寫入按鈕應消失，僅留「查看」連結。
4. **點擊互動測試**：
   - Option A：點擊階段卡片應展開該階段名單；再次點擊收合
   - Option B：卡片應在欄內陳列，欄高度依名單數調整
   - Option C：點擊階段標頭應折疊/展開該分組；可使用「全部展開 / 全部收合」按鈕
5. **準備度進度條測試**：切角色後進度條應同步更新（director 看 11 筆基準，section_chief 看 4 筆基準）。

---

## 9. 後續步驟建議

1. 用戶選擇方案 → 將該方案複製為新版 `27-list-definition.html`（替換 v1）
2. 同時修正 v1 line 794-796 / 687-689 的 role 判斷 bug（即使選了其他方案，這個 bug 也需修正）
3. 進入 spec-writer agent 將選定方案寫入 spec
4. 進入 product-analyst 補充 user story（如需要）
5. TDD 落地時嚴格以選定的 HTML 為 ground truth（per CLAUDE.md frontend guideline）

---

## Update log

### v2.1 (2026-05-21) — 三項補強（A/B/C 同步升級）

**使用者選擇：Option B Kanban 看板版**（原本推薦為 Option C，但用戶最終採納 Option B 作為落地方案；本文檔保留原推薦結論以記錄設計師觀點）

Review 後發現三個產品 gap，三套同步升級保持一致：

| # | 補強項目 | 對應的產品 gap | 落地影響 |
| --- | --- | --- | --- |
| 1 | **Rollback 退回按鈕** | regression bug — v1 已有的退回 affordance 在 v2 初版被誤刪 | dept_ratio / personnel_ratio / ready 三階段恢復「退回」按鈕（gray + `undo-2` icon）；click 後將 `row.stage` mutate 回前一階段並 toast `info`；toast 文案沿用 v1 `27-list-definition.html` line 703/705/709 |
| 2 | **統一 Detail Drawer** | Q2 簽核盲簽問題 — 簽核者無法在不離開列表的前提下檢視名單的完整 condition、部門配比、個別配比、簽核歷史 | 新增右側 slide-in drawer，含 4 個 tab（篩選條件 / 部門比例 / 個別比例 / 簽核歷史）；任何角色在任何階段點「查看」均可開啟；部門/個別配比為 mock placeholder（落地時對應新 API `GET /api/v1/assignment/list-definitions/:listNo/full-snapshot`） |
| 3 | **「停」→「停用」全寫** | Option B 卡片版面壓縮把「停用」縮成「停」，可讀性差 | Option B 改回「停用」全寫，接受卡片內換行；Option A / C 本來就是全寫（本次補確認 changelog） |

#### Drawer 內容 mock data 範例

| Tab | 內容 |
| --- | --- |
| 篩選條件 | 依 `condition_payload` 完整逐筆列出（categorical 顯示 code + label 對照；numeric 顯示 range；date 顯示起訖；LEGACY 名單灰底） |
| 部門比例 | 4 個部門 mock 配比表（業務一/二/三/四部 = 35/28/22/15%，合計 100%），含分布條；非 dept_ratio 階段之前顯示「尚未設定」placeholder |
| 個別比例 | 7 位業務員 mock 配比表（含部門欄），合計 100%；非 personnel_ratio 階段之前顯示「尚未設定」placeholder |
| 簽核歷史 | Timeline 樣式，依 row.stage 推導 1-7 個事件（建立草稿 → 推進 dept → 部門配比設定 → 推進 indiv → 個別比例設定 → 送出簽核 →（可選）拒絕 → 核准），含時間戳、icon、描述 |

#### 落地時 API 對應

新增一支 endpoint：

```
GET /api/v1/assignment/list-definitions/:listNo/full-snapshot

Response:
{
  list: { listNo, listNm, stage, cr, createdBy, createdAt, ym, conditionPayload, legacyEntityFallback },
  dept_ratios: [{ deptId, deptName, ratio, headcount }, ...],
  personnel_ratios: [{ deptId, deptName, userId, userName, ratio }, ...],
  audit_trail: [{ ts, actor, eventType, fromStage, toStage, reason }, ...]
}
```

三 tab 的 `null` / 「尚未設定」狀態由 stage 決定（dept_ratios 在 draft 階段必為空陣列；personnel_ratios 在 draft/dept_ratio 階段必為空陣列；audit_trail 永遠至少有 1 筆 create 事件）。

#### Drawer 與 viewBtn 整合行為

| 角色 / 月份 | 查看按鈕行為 |
| --- | --- |
| `admin` / `director` 當月 | 任何階段（含 draft）皆可開 Drawer 看完整快照 |
| `section_chief` 當月 | 自己轄區的名單可開 Drawer 看完整快照（含轄區外資訊？答：drawer 內顯示完整 dept/indiv，但僅限自己轄區的名單能開啟；轄區外名單根本不會出現在列表） |
| 任何角色 歷史月份 | 寫入按鈕全部隱藏，但 Drawer 仍可開啟（檢視歷史快照） |

#### 驗證方式（v2.1 新增測項）

1. **退回按鈕測試**：切到當月 director 角色，找到 `OB202605003`（dept_ratio）/`OB202605005`（personnel_ratio）/`OB202605009`（ready），點「退回」，確認名單 stage 回到前一階段，toast 顯示對應文案。
2. **Drawer 測試**：任一名單點「查看」，drawer 應從右側滑入。切 4 個 tab 應分別看到：
   - 條件 tab：完整 condition 列表 + logic + payload source 標示
   - 部門比例 tab：draft 階段顯示 placeholder；非 draft 顯示 4 部門表
   - 個別比例 tab：draft/dept_ratio 階段顯示 placeholder；personnel_ratio 之後顯示 7 人配比
   - 簽核歷史 tab：依目前階段顯示 1-7 個 timeline 事件；`OB202605007` 應出現「簽核拒絕」紅色事件
3. **Option B 按鈕測試**：找到 draft 階段卡片，操作按鈕應顯示完整「停用」（不再是縮寫「停」）；超過寬度時可換行

---

### 2026-05-21 更新：Option B 已升為 canonical

**v2.2** Option B 完成最後一輪補強並 **port 至 `prototypes/27-list-definition.html`**（直接覆蓋原 v1）。從此 Kanban 看板版即為 27 的正式設計，三個 design-proposal 檔案保留作為設計沿革記錄：

| 檔案 | 角色 |
| --- | --- |
| `prototypes/27-list-definition.html` | **Canonical**（落地 ground truth，TDD 必須對齊此檔） |
| `prototypes/design-proposals/27-v2-option-A.html` | 設計對照（流水線版，未採用） |
| `prototypes/design-proposals/27-v2-option-B.html` | 原始設計檔（Kanban 版，已升為 canonical） |
| `prototypes/design-proposals/27-v2-option-C.html` | 設計對照（分組表格版，未採用） |

#### v2.2 額外補強內容

| # | 補強項目 | 對應的產品 gap |
| --- | --- | --- |
| 1 | **移除 ready 階段 per-card「觸發」按鈕** | 月名單分派為月份級操作（F078 原子性），per-list 觸發違反語意。Ready 卡片現只保留「檢視 + 退回」兩按鈕 |
| 2 | **Ready 欄頂 CTA banner** | 引導使用者執行月名單分派。淺綠底配 `check-circle-2`，文案「N 份名單已準備完成」+ 主要按鈕「執行 YYYY-MM 月名單分派」（藍底白字）。`cnt.ready === 0` / `isHistoricalMonth` 時不渲染；`currentDemoState === 'locked'` 時改禁用狀態 |
| 3 | **Canonical 化** | v2-B 內容 port 至 `prototypes/27-list-definition.html`；sidebar 從「v2 對照連結」改為完整 collapsible「客戶名單分派」section（與其他 assignment page 一致）；所有 `href="../X.html"` → `href="X.html"`；移除 header 上的「v2 設計提案 B」標籤 |

#### v2.2 驗證方式

1. **開 `prototypes/27-list-definition.html`**：應看到 Kanban 看板（不是 v1 表格）、ready 欄頂淺綠 CTA banner、頂部「v2 設計提案 B」標籤已消失
2. **Sidebar 完整性**：「客戶名單分派」應為可摺疊 section，展開後含 15 個子項（含「比例設定 (已廢棄)」尾端 entry）；「名單定義」自己 active
3. **Sidebar 路徑**：所有子項 href 為相對 sibling 路徑（如 `28-scoring-config.html`，無 `../` 前綴）
4. **Role bug 修正**：切換 admin / director 應看到全部 11 筆 2026-05 名單；切 section_chief 應只看到李處長的 4 筆
5. **Ready CTA**：切到 admin/director 當月，ready 欄應顯示 3 份卡片 + 頂部 CTA banner。切到歷史月份（2026-04）→ CTA 不應顯示
6. **Ready 卡片**：點任一 ready 卡片，動作區只顯示「退回」+「檢視」兩個按鈕（沒有「觸發」）

---

### 2026-05-21 v2.3 — Toolbar 清理 + sidebar 一致性 + 子頁返回 toast signal

繼 v2.2 升 canonical 之後，做最後一輪整理。範圍跨 35 個檔案，包含 sidebar 同步與工作流串接。

#### 三大變更項目

| # | 變更項目 | 影響範圍 |
| --- | --- | --- |
| **A** | **Toolbar 清理 + Ready CTA secondary action** | 限 27-list-definition.html + design-proposals/27-v2-option-B.html |
| **B** | **Sidebar 一致性更新（移除 29a/29b/29c + deprecated 29 entries）** | 35 個 prototype 檔案 |
| **C** | **29a / 29b / 29c 子頁返回 toast signal** | 3 個子頁 + 27 init helper |

#### A. Toolbar 清理 + Ready CTA secondary action（限 27 + design-proposals/B）

- 27 toolbar 移除「Stage 0 試算」與「執行月名單分派」兩個按鈕（消除重複入口，月名單分派入口收歸 Ready CTA 唯一）
- Toolbar 第一列剩：搜尋框 + 新增名單按鈕（director / admin only）
- Ready CTA banner 從單按鈕變雙按鈕：
  - 主按鈕「執行 YYYY-MM 月名單分派」(藍底白字，`bg-primary text-white`) — flex-1 撐滿
  - secondary「試算」(白底藍邊，`border-primary text-primary bg-white`，icon `calculator`) — shrink-0
  - 兩按鈕同列 `gap-2`
- locked 狀態：兩按鈕都禁用（主按鈕灰底，secondary 灰邊）
- 歷史月份：整個 CTA 不渲染

#### B. Sidebar 一致性更新（35 個檔案）

從每個檔案的「客戶名單分派」section 移除 4 個 entries：
- `29a-dept-ratio-config.html` (部門比例設定)
- `29b-personnel-ratio-config.html` (個別業務比例)
- `29c-approval-review.html` (簽核審閱)
- `29-ratio-config.html` (deprecated 比例設定，連同上方 dashed divider 一併移除)

最終 sidebar 「客戶名單分派」下方 **11 個 entries**：篩選欄位 / 計分卡設定 / 名單定義 / 準備完成摘要 / Stage 0 試算 / 觸發月名單分派 / 執行進度 / 結果摘要 / 執行歷史 / 快照詳情 / 結果比對

同步更新 `assignmentPages` JS array 移除上述 4 個檔名引用，保留 `29d-ready-summary.html`。

設計理念：29a/29b/29c 為**工作流子頁**，正確入口為從 27 名單列表點 per-stage 動作按鈕（如「設定」/「核准」），不應出現在側欄主導航中。Sidebar 只列出**獨立功能入口**。

涉及 35 個檔案處理結果：
- **34 檔有 sidebar 變更**（27, 27a, 27b, 28~37, 07~22, 25, 26 + 29 deprecated 自己 + 29a/b/c 移除自身 active 引用）
- **1 檔 sidebar 無變更**（27 canonical 已於 v2.2 port 時清理過；design-proposals/A/B/C sidebar 早已是簡化版本，無需動）
- **31 檔同步移除 JS assignmentPages 中過時引用**

#### C. 29a / 29b / 29c 子頁返回 toast signal

問題：原本 29a/b/c 子頁完成操作後 → 顯示本頁 toast 1.5 秒 → 跳回 27。但 1.5s 等待時間用戶可能立刻被新頁面接管，看不到 toast。

修正：用 `sessionStorage.setItem('cdmp.pendingToast', JSON.stringify({type, msg, sub}))` 跨頁傳遞 signal。27 init 時 `(function consumePendingToast(){...})()` 立即消化，setTimeout 100ms 後顯示 toast 並從 sessionStorage 移除（一次性、不會跨多次返回重複顯示、私密模式 sessionStorage 不可用時 graceful degrade）。

實作位置與訊息對照：

| 子頁 | 操作 | function | toast type | msg | sub |
| --- | --- | --- | --- | --- | --- |
| 29a | 儲存並推進 | `confirmAdvance` | success | 部門比例已儲存 | OB202605003 已推進至個別比例階段 |
| 29a | 退回草稿 | `confirmRollback` | warning | OB202605003 已退回草稿 | 部門比例資料已清空，名單需重新調整 |
| 29b | 儲存並推進 | `confirmAdvance` | success | 個別比例已儲存 | OB202605007 已推進至待簽核階段 |
| 29b | 退回部門比例 | `confirmRollback` | warning | OB202605007 已退回部門比例階段 | 個別業務比例已清空（保留 ob_dept_pct） |
| 29c | 核准 | `confirmApprove` | success | 簽核審閱已完成 | OB202605008 已推進至準備完成階段 |
| 29c | 拒絕 | `confirmReject` | warning | OB202605008 簽核拒絕，已退回個別比例階段 | 已清空 ob_empl_set；拒絕原因將於下次編輯頁面 banner 顯示 |

「取消」按鈕保留 `<a href="27-list-definition.html">` 不帶 signal（不顯示 toast，符合「取消＝無事發生」語義）。「純儲存 onSave」（29a 內，不推進階段、留在本頁）也保留原本 inline toast 行為。

#### v2.3 落地對應 spec 變更建議

- F078 spec：明確記載月名單分派入口只在「ready 階段 N>0」時於 27 頁面 Ready 欄頂出現（單一入口）
- 29a/29b/29c spec：補上「儲存後跨頁 toast signal」協定（sessionStorage key `cdmp.pendingToast` 為共用 contract）
- 27 spec：補上 init 時 consumePendingToast 流程

---

### 2026-05-21 v2.3.1 — Rename stage enum 'indiv_ratio' → 'personnel_ratio' 對齊 DB source of truth（修正命名漂移）

Prototype 內 `indiv_ratio` 是漂移命名，DB enum / spec / backend 全部用 `personnel_ratio`。此次 patch 將 7 個檔案內 102 處（line-level Grep count；substring-level 107 處）一次性 case-sensitive 重命名 `indiv_ratio` → `personnel_ratio`，包含 `indiv_ratios` plural 形式（API response array 名稱）。

涉及位置：JS object key（STAGE_META / STAGE_PREV / STAGE_PREV_TOAST / cnt counters）、JS string value（switch case / 模擬資料 stage 欄位 / STAGES_ORDER array / timeline events）、HTML attribute（`data-stage="..."`）、註解。**中文 display label「個別比例」「個別業務比例」保持不變**（UI 顯示文字，與 enum 解耦）。**檔名 `29b-personnel-ratio-config.html` 早已對齊，無需改名**。

| 檔案 | Grep line-count | Node substring-count |
| --- | --- | --- |
| `prototypes/00-design-system.html` | 4 | 4 |
| `prototypes/27-list-definition.html` | 22 | 23（STAGE_PREV 物件同行 key + value） |
| `prototypes/27b-list-edit-draft.html` | 1 | 1 |
| `prototypes/design-proposals/27-v2-option-A.html` | 22 | 23 |
| `prototypes/design-proposals/27-v2-option-B.html` | 22 | 23 |
| `prototypes/design-proposals/27-v2-option-C.html` | 22 | 24（STAGE_PREV + STAGE_PREV_TOAST 雙映射） |
| `prototypes/design-proposals/README.md` | 9 | 9 |
| **TOTAL** | **102** | **107** |

DB enum / backend / spec 在本次未動 — 此 patch 純粹是 prototype 對齊 spec 的單向修正。
