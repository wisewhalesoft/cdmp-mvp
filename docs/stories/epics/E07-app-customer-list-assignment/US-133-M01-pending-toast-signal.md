# US-133：子頁返回 M01 主頁時的 sessionStorage Toast 信號協定

> **Story ID**：US-133
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2
> **Gap 覆蓋**：G2（sessionStorage `cdmp.pendingToast` 跨頁信號協定缺 spec）

---

## User Story

**As a** 部長（Director）、Admin 或 處長（Section Chief）
**I want** 在 29a 部門比例設定、29b 個別比例設定、29c 簽核審核等子頁完成操作或取消後返回 M01 主頁，並在主頁看到對應的操作結果提示（success / info toast）
**So that** 工作流程有連貫的操作回饋，不需自行判斷操作是否成功

---

## 背景說明

v2.3 重整 Sidebar IA：29a / 29b / 29c 三個子頁從 Sidebar 獨立入口改為「從 M01 主頁 Kanban 卡片按鈕進入的子頁工作流」（子頁無自己的 Sidebar entry）。

子頁返回 M01 主頁的方式：
- 點擊「取消」或「儲存」後，程式導向（`location.href`）回 `27-list-definition.html`
- 由於是跨頁導航，toast 無法透過同一頁面的狀態傳遞

協定設計：子頁離開前，將 toast 參數寫入 `sessionStorage('cdmp.pendingToast')`；M01 主頁初始化時讀取並顯示，顯示後立即清除 key（consume-once 語意）。

---

## 驗收標準

### AC-1：子頁「儲存」成功後寫入 pendingToast 並導回 M01

- **Given** 使用者在 29a 部門比例設定頁完成設定並點擊「儲存」
- **When** API 呼叫成功
- **Then** 子頁將以下資料寫入 `sessionStorage`（key = `cdmp.pendingToast`，值為 JSON）：`{ type: 'success', msg: '{LIST_NM} 部門比例已儲存', sub: '名單已推進至個別比例設定階段' }`（或等效訊息）
- **And** 子頁導向 `27-list-definition.html`（M01 主頁）

### AC-2：子頁「取消」後寫入 pendingToast 並導回 M01

- **Given** 使用者在 29a / 29b / 29c 任一子頁點擊「取消」
- **When** 使用者確認取消（若有確認對話框）
- **Then** 子頁將 `{ type: 'info', msg: '已取消', sub: '返回名單定義' }` 寫入 `sessionStorage('cdmp.pendingToast')`
- **And** 子頁導向 `27-list-definition.html`

### AC-3：M01 主頁初始化時消化 pendingToast 並顯示 Toast

- **Given** M01 主頁（`27-list-definition.html`）完成初始化
- **When** `sessionStorage` 中存在 key `cdmp.pendingToast`
- **Then** M01 主頁讀取該 JSON，依 `type`（success / info / warning / error）顯示對應樣式的 toast 提示（包含 `msg` 與 `sub`）
- **And** 顯示後立即呼叫 `sessionStorage.removeItem('cdmp.pendingToast')` 清除 key（consume-once）

### AC-4：M01 主頁無 pendingToast 時不顯示 Toast

- **Given** M01 主頁完成初始化
- **When** `sessionStorage` 中不存在 key `cdmp.pendingToast`（或 value 無法解析）
- **Then** 頁面不顯示任何 toast，靜默啟動

### AC-5：pendingToast 為無效 JSON 時靜默失敗

- **Given** `sessionStorage('cdmp.pendingToast')` 的值為非法 JSON 字串
- **When** M01 主頁嘗試解析
- **Then** 解析失敗不拋出錯誤；M01 主頁正常渲染；清除該 key

### AC-6：三個子頁均遵循相同協定

- **Given** 29a 部門比例設定、29b 個別比例設定、29c 簽核審核三個子頁
- **When** 各子頁的「儲存」或「取消」操作觸發返回
- **Then** 三個子頁均採用同一 key 名稱（`cdmp.pendingToast`）、同一 JSON 結構（`{ type, msg, sub }`）寫入 sessionStorage，以確保 M01 主頁可統一消化

---

## 技術備註

- sessionStorage key：`cdmp.pendingToast`（全小寫，點分隔，與其他 `cdmp.*` key 命名一致）
- JSON 結構：`{ type: 'success' | 'info' | 'warning' | 'error', msg: string, sub?: string }`
- 寫入時機：子頁 `location.href` 跳轉前執行 `sessionStorage.setItem`；若 sessionStorage API 不可用，以 try/catch 靜默吞掉例外
- 消化時機：M01 主頁 DOMContentLoaded 或 init 函式執行時，在渲染 Kanban 之後讀取並清除
- 消化後清除：`sessionStorage.removeItem('cdmp.pendingToast')`，確保同一 toast 不重複顯示（不論重整或瀏覽器 back）

---

## 測試案例

### TC-133-01：29a 儲存成功後 M01 顯示 success toast

- **Given**：使用者在 29a 部門比例設定頁儲存成功
- **When**：頁面導向 M01 主頁
- **Then**：M01 初始化後顯示綠色 success toast，訊息包含操作結果說明；顯示後 sessionStorage key 清除

### TC-133-02：29b 取消後 M01 顯示 info toast

- **Given**：使用者在 29b 個別比例設定頁點擊「取消」
- **When**：頁面導向 M01 主頁
- **Then**：M01 初始化後顯示藍色 info toast「已取消，返回名單定義」；顯示後 key 清除

### TC-133-03：M01 無 pendingToast 時靜默啟動

- **Given**：sessionStorage 中無 `cdmp.pendingToast` key（使用者直接從 Sidebar 進入 M01）
- **When**：M01 主頁初始化
- **Then**：頁面正常渲染，無 toast 顯示

### TC-133-04：無效 JSON 靜默處理

- **Given**：sessionStorage 中 `cdmp.pendingToast` 值為 `"not-json"`
- **When**：M01 主頁初始化嘗試 JSON.parse
- **Then**：不拋出 uncaught exception；toast 不顯示；key 被清除；Kanban 正常渲染

### TC-133-05：consume-once — 重整後不再顯示 Toast

- **Given**：M01 主頁已消化並顯示 success toast，key 已清除
- **When**：使用者在 M01 主頁按 F5 重整
- **Then**：重整後不再顯示 toast（key 已不存在）

---

## 依賴關係

- **Blocked By**：US-130（M01 主頁，提供 pendingToast 消化的宿主頁面）
- **關聯子頁**：29a 部門比例設定（US-109 / US-110）、29b 個別比例設定（US-112 / US-113 / US-114）、29c 簽核審核（US-116 / US-117）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 29a 儲存成功後 M01 顯示 toast 測試（TC-133-01）
- [ ] 29b 取消後 M01 顯示 info toast 測試（TC-133-02）
- [ ] 無 pendingToast 靜默啟動測試（TC-133-03）
- [ ] 無效 JSON 靜默處理測試（TC-133-04）
- [ ] consume-once 重整後不再顯示測試（TC-133-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Prototype**：`prototypes/27-list-definition.html`（v2.3 pendingToast 消化段落，行 1184-1197）；`prototypes/29a-dept-ratio-config.html`（pendingToast 寫入段落，行 635-642）
- **Gap 覆蓋**：G2（sessionStorage `cdmp.pendingToast` 跨頁信號協定缺 spec）
- **相關 Stories**：US-130（M01 主頁，toast 消化宿主）、US-109（29a 部門比例儲存）、US-112（29b 個別比例儲存）、US-116（29c 簽核核准）
