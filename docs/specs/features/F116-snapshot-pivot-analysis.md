---
spec-id: F116
title: 快照詳情 — 樞紐分析頁籤
feature-id: F116
source-story: US-181（v1.0，待建）、US-182（v1.1 — 職稱／新人標註／總計欄置前／工作天模式）
epic: E07 — 客戶名單分派
module: M05 執行歷史 / 快照詳情
priority: P2
version: "1.1"
date: 2026-08-13
status: Draft
---

# F116: 快照詳情 — 樞紐分析頁籤

Priority: P2 | Status: Draft | Last Updated: 2026-08-13

> **目的**：於「客戶名單分派 > 執行歷史 > 快照詳情」（[[F066]]）新增**第 4 個頁籤「樞紐分析」**，以互動式交叉表呈現分派結果的「部門名稱 × 承辦人員 × 名單代號」案件數，對齊「結果摘要」匯出 Excel 之樞紐分析頁（F108 / legacy `reference/202607 分派名單.xlsx` 工作表2）。
>
> **拍板（使用者 2026-07-14 / v1.0）**：
> - 值預設 = **計數（案號數）**，另提供 **佔比（% of parent row）** toggle（對齊 F108 匯出樞紐頁語意）。
> - 員編列同時顯示**姓名**（`ob_emphire.emp_nm`）以利閱讀。
> - 對**所有可進入快照詳情的角色**可見（部長 / 處長；處長套轄區 scope）。
>
> **拍板（使用者 2026-08-13 / v1.1，US-182 OQ-1~OQ-8 人工閘門全數裁定）**：見 §1.1。

---

## 1. 功能摘要

樞紐分析頁籤將 run 之 `ob_monthly_run_result` 依 **部門名稱（`ob_emphire.dept_name`，承辦人員所屬）→ 員編（+姓名+職稱）** 為階層列、**名單代號（`list_no`）** 為欄、**案號計數** 為值，聚合成交叉表；提供部門展開/收合、**整月／工作天**維度切換、計數/佔比切換、總計欄（最左）與總計列（最下）。資料由後端聚合端點提供（GROUP BY），前端負責渲染、佔比換算與工作天換算。

### 1.1 v1.1 增修摘要（US-182）

本版為對既有 v1.0 樞紐分析頁籤的 **UX 精修**：不新增頁籤、不改變導覽入口、不改端點路徑、不新增錯誤碼、不需 migration。三項變更如下：

| # | 變更 | 拍板來源 | 影響 |
|---|---|---|---|
| 增修-1 | 員編列由「員編＋姓名」擴充為「**員編－姓名－職稱**」，並對**未滿三個月**之員編標註「新人」 | US-182 AC-1 / AC-2 / AC-3；OQ-1（基準日＝`project_workym` 月初）、OQ-2（嚴格未滿）、OQ-3（視覺交 ui-ux-designer）RESOLVED 2026-08-13 | BR-5 ~ BR-10、AC-6 ~ AC-8、API 回應新增 `jfunNm` / `isNewcomer` |
| 增修-2 | 「總計」**欄**由表格最右移至**最左**（緊接列標籤欄之後）；「總計」**列**維持在表格最下方**不動** | US-182 AC-4；OQ-8（只移欄不移列）RESOLVED 2026-08-13 | BR-11、AC-9；**純呈現順序調整，API 契約不變** |
| 增修-3 | 新增 **整月／工作天** 第二維度：工作天模式每格值 = `ceil(該格整月計數 ÷ 該月工作日數)`；工作天模式下**停用佔比** | US-182 AC-5 / AC-6；OQ-4（`ob_calendar.rest_flg='0'`）、OQ-5（平均攤提）、OQ-6（ceil）、OQ-7（停用佔比，合法組合 3 種）RESOLVED 2026-08-13 | BR-12 ~ BR-16、AC-10 ~ AC-11、API 回應新增 `projectWorkym` / `workingDays` |

**v1.1 不做之事（明確排除）**：不同步變更 F108 匯出樞紐頁（若需要應另立 story，見 §8）；不變更 `listNos` / `depts` / `byList` / `grandByList` / `grandTotal` 之既有語意與排序；不變更處長 scope 規則；不對 `ob_emphire` 加在職過濾（見 BR-9）。

## 2. User Story

**As a** 業務部長 / 業務處長
**I want** 在快照詳情以樞紐交叉表檢視各部門／承辦人員在各名單的分派案件數，並能一眼辨識人員資歷與每工作天的實際撥打負荷
**So that** 快速掌握分派分佈，與「結果摘要」匯出的樞紐頁一致，免下載 Excel，且不必自行手動換算工作天負荷

## 3. 前置條件

- 使用者已登入且通過 `DirectorOrSectionChiefGuard`。
- 目標 `run_id` 存在且已完成（`ob_monthly_run_result` 有結果列）。
- run 之 `project_workym`（`YYYYMM`）存在（v1.1 新人判定與工作日數計算之月份基準）。

## 4. 驗收標準

> **AC 編號政策**：v1.0 之 AC-1 ~ AC-5 編號保留不變（AC-1 / AC-2 條文於 v1.1 修訂並標記【v1.1 修訂】）；v1.1 新增行為以 AC-6 ~ AC-11 續編。US-182 AC 對應關係見 §4.1。

### AC-1【v1.1 修訂】：樞紐頁籤與交叉表
- **Given** 使用者於快照詳情
- **When** 點「樞紐分析」頁籤
- **Then** 顯示交叉表：列＝部門名稱（可展開為員編）、欄＝名單代號、值＝案號計數。
- **And** 交叉表含「總計」**欄**與「總計」**列**；【v1.1 修訂】「總計」欄位置為**最左**（緊接列標籤欄之後、所有名單代號欄之前），「總計」列維持**最下**。
- **And** 員編列顯示「員編 + 姓名 + 職稱」（v1.0 為「員編 + 姓名」，職稱見 AC-6）。

### AC-2【v1.1 修訂】：計數 / 佔比 切換
- **Then** 預設顯示**計數**；切至**佔比**時以「% of parent row」呈現：部門列 = 部門/欄總計、員編列 = 員編/所屬部門同欄、總計列 = 100%（0/0 → 空白）。
- **And**【v1.1 修訂】佔比僅適用於「整月」維度；於「工作天」維度下佔比為 disabled（見 AC-10）。

### AC-3：展開 / 收合
- **Then** 每個部門列可展開/收合其員編列；提供「全部展開 / 全部收合」。
- **And**【v1.1 補充】展開/收合行為不受「整月／工作天」維度切換影響（切換維度不重置展開狀態）。

### AC-4：處長轄區 scope
- **Given** `businessRole = 'section_chief'`
- **Then** 聚合僅含處長轄區內 `emplid`（`scopeByCreator`）；不回 403（同 [[F066]] BR-5/BR-6）。無轄區 → 空表（總計 0）。
- **And**【v1.1 補充】職稱、新人標註、工作天換算僅套用於 scoped 後之資料列，不擴大或縮小可見範圍；`workingDays` 為該 run 月份屬性，與 scope 無關（scope 為空時仍回真實 `workingDays`）。

### AC-5：run 不存在
- **Then** 回 404 `ASSIGNMENT_RUN_NOT_FOUND`。

### AC-6【v1.1 新增】：員編列顯示職稱（US-182 AC-1）
- **Given** 使用者於樞紐分析頁籤展開任一部門列
- **When** 檢視該部門下的員編列
- **Then** 每一員編列除「員編＋姓名」外，另顯示**職稱**，資料來源為 `ob_emphire.jfun_nm`（**不得**取 `ob_emphire.title_name`；該表兩欄同時存在）
- **And** 呈現順序為「員編 → 姓名 → 職稱」
- **And** API 回應之 `depts[].emplids[].jfunNm` 即為該員編 `ob_emphire.jfun_nm` 之原值（無值 → `null`）
- **And** 分隔符號與版式屬純視覺，authority = `prototypes/35-snapshot-detail.html`（本 spec 不定義）

### AC-7【v1.1 新增】：未滿三個月標註「新人」（US-182 AC-2）
- **Given** 該 run `project_workym = 'YYYYMM'`，基準日 `baselineDate` = 該月 **1 日**（見 BR-6）
- **And** 門檻日 `thresholdDate` = `baselineDate` 減 3 個月（見 BR-7）
- **When** 員編對應之 `ob_emphire.hire_date` **嚴格大於** `thresholdDate`
- **Then** `depts[].emplids[].isNewcomer = true`，該員編列顯示「新人」標註
- **And** `hire_date` **等於** `thresholdDate`（恰滿 3 個月）→ `isNewcomer = false`，不標註
- **And** `hire_date` 早於 `thresholdDate` → `isNewcomer = false`，不標註
- **驗證用具體樣本**（`project_workym = '202607'` → `baselineDate = 2026-07-01`、`thresholdDate = 2026-04-01`）：

  | `hire_date` | 期望 `isNewcomer` |
  |---|---|
  | `2026-03-31` | `false` |
  | `2026-04-01` | `false`（恰滿 3 個月，不算新人） |
  | `2026-04-02` | `true` |
  | `2026-07-15` | `true` |
  | `NULL` | `false`（見 AC-8） |

- **And** 判定結果固定不隨檢視當日時間漂移（同一 run 於任何日期查詢皆得相同 `isNewcomer`）

### AC-8【v1.1 新增】：職稱／新人標註之邊界情境（US-182 AC-3）
- **Given** `ob_emphire.jfun_nm` 為 NULL 或空字串
- **Then** `jfunNm = null`；該列仍完整呈現（不得整列消失、不得報錯），職稱位置之呈現方式由 prototype 決定
- **Given** `ob_emphire.hire_date` 為 NULL
- **Then** `isNewcomer = false`（不臆測資歷）
- **Given** 員編已離職（`ob_emphire.resign_date` 有值／依 `emphire-active.util` 判定為非在職）但該 run 結果中仍有其分派筆數
- **Then** 該員編列**仍正常顯示**姓名／職稱／新人標註（**不得**加入任何在職過濾，見 BR-9）
- **Given** 部門或員編依 BR-2 歸組為「(空白)」（`ob_emphire` 無對應主檔列）
- **Then** 該節點 `jfunNm = null`、`isNewcomer = false`，不顯示職稱與新人標註

### AC-9【v1.1 新增】：總計欄移至最左（US-182 AC-4）
- **Given** 使用者於樞紐分析頁籤
- **When** 檢視交叉表欄軸
- **Then** 欄序為：`列標籤` → `總計` → `名單代號欄（依 listNos 升冪）`
- **And** 各名單代號欄維持既有升冪排序（BR-17 排序規則不變）
- **And** 總計欄數值語意（部門總計 / 員編總計 / 大表總計）與 v1.0 完全相同，僅位置調整
- **And** 「總計」**列**維持在表格**最下方**，不隨本 AC 移動
- **And** API 回應結構不因本 AC 改變（欄序為前端渲染職責）

### AC-10【v1.1 新增】：整月／工作天維度切換（US-182 AC-5）
- **Given** 工具列提供「整月／工作天」維度切換與既有「計數／佔比」切換
- **Then** 合法組合僅 3 種：`整月-計數`（預設）／`整月-佔比`／`工作天-計數`
- **Given** 目前為 `整月-佔比`
- **When** 使用者切換至「工作天」
- **Then** 值自動回落為「計數」語意（進入 `工作天-計數`），且「佔比」切換控制項呈 **disabled**
- **Given** 目前為 `工作天-計數`
- **When** 使用者切回「整月」
- **Then** 恢復 v1.0 行為：值為「計數」，且「佔比」切換控制項恢復 **enabled**
- **And** 工作天模式下每一格（含部門列、員編列、總計欄、總計列）之值 = `ceil(該格整月計數 ÷ workingDays)`，以**整數**呈現（見 BR-13、BR-14）
- **驗證用具體樣本**（`workingDays = 21`）：

  | 整月計數 | 工作天顯示值 |
  |---|---|
  | `0` | `0` |
  | `1` | `1` |
  | `21` | `1` |
  | `22` | `2` |
  | `100` | `5`（100 ÷ 21 = 4.76…） |

### AC-11【v1.1 新增】：工作天模式之邊界情境（US-182 AC-6）
- **Given** 該 run `project_workym` 當月工作日數為 0（`workingDays = 0`，例如 `ob_calendar` 缺該月資料）
- **When** 使用者切換至「工作天」模式
- **Then** 全表所有數值格（含總計欄／總計列）顯示 `-`
- **And** **不得**出現 `NaN` / `Infinity` / 空白 / `0`（`-` 為唯一合法呈現）
- **And** 不得執行除以零、不得中斷頁面渲染、不得拋出前端例外
- **And** 工具列顯示提示訊息，語意為「本月無工作日資料，無法計算」（確切措辭 authority = `prototypes/35-snapshot-detail.html`）
- **Given** `workingDays = 0`
- **When** 使用者切回「整月」模式
- **Then** 計數／佔比正常顯示，提示訊息消失（整月模式不受 `workingDays` 影響）
- **Given** 「(空白)」部門／員編分組
- **Then** 工作天換算邏輯與一般分組完全一致（不特殊處理）；其職稱／新人標註仍依 AC-8 一律不顯示

### 4.1 US-182 ↔ F116 AC 對應表

| US-182 AC | F116 v1.1 AC | 相關 BR |
|---|---|---|
| AC-1 員編列顯示「員編－姓名－職稱」 | AC-1（列內容）、AC-6 | BR-5 |
| AC-2 未滿三個月標註「新人」 | AC-7 | BR-6、BR-7 |
| AC-3 職稱／新人標註的邊界情境 | AC-8 | BR-8、BR-9、BR-10 |
| AC-4 總計欄改列於名單代號欄位之前 | AC-1（欄序）、AC-9 | BR-11 |
| AC-5 新增「整月／工作天」切換 | AC-10 | BR-12 ~ BR-16 |
| AC-6 工作天模式的邊界情境 | AC-3（展開收合不受影響）、AC-11 | BR-15 |

## 5. API 規格

### 5.1 GET /api/v1/assignment/runs/:runId/pivot

聚合來源：`ob_monthly_run_result r` LEFT JOIN `ob_emphire e ON e.emp_id = r.emplid`，
`GROUP BY e.dept_name, r.emplid, e.emp_nm, r.list_no`（COUNT(*)）。**不 join `ob_pool_data`**（樞紐不需 pool 業務欄）。dept/emplid 為 NULL/空 → 歸組 `(空白)`。

**【v1.1 增修】** 為取得職稱與到職日，SELECT / GROUP BY 需擴充 `e.jfun_nm`、`e.hire_date`（見 §10 技術約束 T-4，含重複 `emp_id` 之裂列風險）。**不得**因此加入任何 `resign_date` 過濾（BR-9）。

**Response — 200 OK**（v1.1 欄位以 `// v1.1` 標示）

```json
{
  "runId": "...",
  "projectWorkym": "202607",
  "workingDays": 21,
  "listNos": ["OB202607001", "OB202607002", "..."],
  "depts": [
    {
      "deptName": "中區電銷1",
      "total": 19932,
      "byList": { "OB202607001": 4614, "OB202607002": 3486 },
      "emplids": [
        {
          "emplid": "20501",
          "empNm": "王大明",
          "jfunNm": "業務專員",
          "isNewcomer": false,
          "total": 310,
          "byList": { "OB202607001": 46 }
        }
      ]
    }
  ],
  "grandByList": { "OB202607001": 13360 },
  "grandTotal": 76212
}
```

#### 5.1.1【v1.1 新增】欄位契約

| 欄位 | 型別 | 位置 | 語意 | 邊界值 |
|---|---|---|---|---|
| `projectWorkym` | `string` | top-level | 該 run 之作業年月（`YYYYMM`，取自 `assignment_run.project_workym`）。供前端顯示與工作天換算之月份佐證 | 必填；恆有值（run 存在即有） |
| `workingDays` | `number` | top-level | 該 `projectWorkym` 當月工作日數 = `COUNT(*) FROM ob_calendar WHERE rest_flg='0' AND calendar_date` 落在當月（見 BR-12） | `ob_calendar` 缺該月資料 → `0`（**不得** `null` / `undefined` / 負值） |
| `jfunNm` | `string \| null` | `depts[].emplids[]` | 該員編職稱，來源 `ob_emphire.jfun_nm` | 無主檔對應 / NULL / 空字串 → `null`；「(空白)」節點 → `null` |
| `isNewcomer` | `boolean` | `depts[].emplids[]` | 是否為新人（BR-6 / BR-7 判定結果） | `hire_date` NULL 或無主檔對應 → `false`；「(空白)」節點 → `false`（**不得** `null`） |

**運算歸屬**：

| 項目 | 歸屬 | 說明 |
|---|---|---|
| `jfunNm` | **後端** | 直接取自 join 結果 |
| `isNewcomer` | **後端** | 後端依 `project_workym` + `hire_date` 計算布林值；`hire_date` 本身**不**回傳（不擴大資料曝光面） |
| `workingDays` | **後端** | 後端查 `ob_calendar` 一次算出 |
| 工作天每格數值 `ceil(cnt / workingDays)` | **前端**（spec 預設，延續 BR-3） | 後端只回整月計數與 `workingDays`，維持單一數據源；⚠ 見 §12 A-1 |
| 佔比 | **前端**（v1.0 既有，不變） | BR-3 |

**排序（對齊 F108 I-PIV-DET-01，v1.1 不變）**：`listNos` 升冪；`depts` 依名稱 localeCompare（`(空白)` 最後）；`emplids` 升冪。

**權限**：`DirectorOrSectionChiefGuard`；處長走 `scopeByCreator`（`r.emplid IN (...)`；無轄區 → 空）。

**向後相容性**：v1.1 僅**新增**欄位，不移除、不改名、不改型別既有欄位；既有 v1.0 前端在未升級狀態下仍可正常渲染（新欄位被忽略）。

**錯誤（v1.1 不新增錯誤碼）**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_ROLE_NOT_ASSIGNED | 角色非部長/處長 |
| 404 | ASSIGNMENT_RUN_NOT_FOUND | run 不存在 |

> `ob_calendar` 查無該月資料**不是錯誤**：回 200 且 `workingDays = 0`，由前端依 AC-11 呈現 `-` 與提示（見 §11）。

## 6. 商業規則

| 規則 | 版本 | 說明 |
|---|---|---|
| BR-1 | v1.0 | 部門＝承辦人員所屬 `ob_emphire.dept_name`（與 F108 匯出樞紐頁一致，非案件分處 `ob_pool_data.dept_name`） |
| BR-2 | v1.0 | dept/emplid 為空 → 歸組「(空白)」，排序置末 |
| BR-3 | v1.0 | 佔比為前端換算；後端僅回計數（單一數據源、避免重算漂移） |
| BR-4 | v1.0 | 處長 scope 同 F066：縮小集合、不回 403 |
| BR-5 | **v1.1** | 職稱來源**唯一**為 `ob_emphire.jfun_nm`。**禁止**使用 `ob_emphire.title_name`（該表兩欄並存，取錯欄位為已知易錯點）。`jfun_nm` 為 NULL 或空字串 → 契約值 `null` |
| BR-6 | **v1.1** | 新人判定**基準日** = 該 run `project_workym` 之**當月 1 日**（例：`202607` → `2026-07-01`）。基準日**不得**取系統當日、run 執行日或月底；快照為歷史資料，判定結果須固定不隨檢視時間漂移 |
| BR-7 | **v1.1** | 新人**判定式** = `hire_date > (基準日 − 3 個月)`（**嚴格大於**）。恰滿 3 個月（`hire_date == 基準日 − 3 個月`）**不**算新人。門檻日以曆月位移計算（`2026-07-01 − 3 個月 = 2026-04-01`）；比較以**日期（date-only）**語意進行，不含時分秒、不受時區位移影響 |
| BR-8 | **v1.1** | `hire_date` 為 NULL（或員編無 `ob_emphire` 對應列）→ `isNewcomer = false`，不臆測資歷 |
| BR-9 | **v1.1** | **不得**對 `ob_emphire` 施加在職過濾。本功能依 `emp_id` 補資料（職稱／姓名／到職日），呈現的是**歷史 run 快照的分派事實**；離職者（`resign_date` 有值／`emphire-active.util` 判定非在職）仍須完整顯示職稱與新人標註。**禁止**在 pivot 查詢引入 `emphire-active.util` 或任何 `resign_date` 條件 |
| BR-10 | **v1.1** | 「(空白)」節點（BR-2）無 `ob_emphire` 主檔對應 → `jfunNm = null`、`isNewcomer = false`，不顯示職稱與新人標註 |
| BR-11 | **v1.1** | 交叉表欄序 = `列標籤` → `總計` → `名單代號（升冪）`。「總計」**列**維持在表格最下方；本規則**僅**規範欄軸位置，不改動列軸 |
| BR-12 | **v1.1** | 工作日數 `workingDays` = `ob_calendar` 中 `rest_flg = '0'` 且 `calendar_date` 落於 `project_workym` 當月（該月 1 日 ~ 該月末日，含頭尾）之列數。沿用既有 `weekday` CalendarSource 判準（排除週末＋國定假日），與 F049 Stage 0 每日試算同一套規則 |
| BR-13 | **v1.1** | 工作天模式每格值 = `ceil(該格整月計數 ÷ workingDays)`（無條件進位到整數）。**不**採 `assignday` 逐日實際分佈 |
| BR-14 | **v1.1** | BR-13 之換算對**每一格獨立套用**，包含部門列、員編列、總計欄與總計列。因 `ceil` 非線性，工作天模式下「總計欄值」不必然等於同列各名單代號欄值之和，「總計列值」亦不必然等於同欄各部門值之和 —— 此為**預期行為**，不得為求加總一致而改為「先加總再 ceil」或「先 ceil 再加總」 |
| BR-15 | **v1.1** | `workingDays = 0` → 工作天模式全表數值格顯示 `-`；**禁止**輸出 `NaN` / `Infinity` / 除以零。整月模式不受影響 |
| BR-16 | **v1.1** | 維度組合僅 3 種合法：`整月-計數`／`整月-佔比`／`工作天-計數`。`工作天-佔比` 為非法狀態：切至工作天時值自動回落計數且佔比控制項 disabled；切回整月時佔比控制項恢復 enabled |
| BR-17 | v1.0（本版明列） | 排序不變：`listNos` 升冪、`depts` localeCompare（`(空白)` 置末）、`emplids` 升冪 |

## 7. UI/UX 需求

- 對應 prototype：`prototypes/35-snapshot-detail.html`（第 4 頁籤「樞紐分析」）。**視覺 authority = prototype**，本 spec 僅定義可驗證之資料語意。
- 交叉表：sticky 首欄（列標籤）+ sticky 表頭；名單代號欄多 → 水平捲動（不使頁面本體橫捲）；總計行/列強調。
- **【v1.1】** 欄序：列標籤 → **總計（最左）** → 名單代號欄；總計列維持最下（BR-11）。總計欄置於 sticky 區或捲動區由 prototype 決定。
- 工具列：標題 + 值說明 + 全部展開/收合 + **【v1.1】整月/工作天 segmented toggle** + 計數/佔比 segmented toggle（工作天模式下 disabled）+ 對應匯出樞紐頁註記 + **【v1.1】`workingDays = 0` 之提示訊息區**。
- 員編列：員編（灰色小 mono）+ 姓名（主要）+ **【v1.1】職稱** + **【v1.1】「新人」標註**。
- **【v1.1】以下屬純視覺決策，由 ui-ux-designer 於 prototype 定案，本 spec 不定義**（US-182 OQ-3 RESOLVED）：
  - 「員編－姓名－職稱」之分隔符號與排版
  - `jfunNm = null` 時之呈現（空白 / placeholder / dash）
  - 「新人」標註樣式（badge / 文字 / 顏色）
  - `workingDays = 0` 提示訊息之確切措辭與位置
  - 新增職稱欄與工作天 toggle 不得迫使頁面本體橫向捲動（既有約束延續）
- 三態：載入 / 空（無結果）/ 錯誤。

## 8. 相依性

- **Blocked By**：[[F066]]（快照詳情頁）、F108（匯出樞紐頁語意來源）。
- **Related**：F063 / F064。
- **【v1.1】F108 匯出樞紐頁不同步變更**：本版三項變更（職稱／新人／總計欄位置／工作天模式）**僅**套用於畫面上的樞紐分析頁籤，**不**反映至 F108 匯出 Excel 樞紐頁。若業務需要匯出同步，應另立 story（US-182 §相依性明載）。
- **【v1.1】資料相依**：`ob_calendar` 需有 `project_workym` 當月資料方能計算 `workingDays`（缺資料為可容忍降級，見 AC-11）。

## 9. 交叉參考

- 快照詳情頁：[F066](F066-view-run-snapshot-detail.md)
- 上游 story：`docs/stories/epics/E07-app-customer-list-assignment/US-182-M05-pivot-title-newcomer-workday-mode.md`
- 匯出樞紐頁實作（語意來源）：`apps/api/src/modules/assignment/services/assignment-run-report.service.ts`（`accumulatePivot` / `writePivotSheet`）
- 現行 pivot 聚合實作：`apps/api/src/modules/assignment/services/assignment-run-report.service.ts`（`getPivot`，v1.0）
- 現行端點：`apps/api/src/modules/assignment/assignment-run.controller.ts`（`@Get(':runId/pivot')`，前綴 `/api/v1/assignment/runs`）
- 現行前端：`apps/web/src/pages/assignment/_components/snapshot-pivot-view.tsx`
- 工作日判準既有純函式（語意參照）：`apps/api/src/modules/assignment-list/stage0-estimate.service.ts`（`resolveCalendarDay` / `computeWorkingDayRatios`，`CalendarSource = 'weekday'`）
- 結果表：`apps/api/src/database/entities/ob-monthly-run-result.entity.ts`
- 資料模型：[data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)、[data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity)
- Legacy 參照：`reference/202607 分派名單.xlsx`（工作表2 樞紐）

## 10.【v1.1 新增】技術約束

> 以下為**必須遵守**之專案硬性限制，違反將直接導致 production 失效。

| 編號 | 約束 | 理由 |
|---|---|---|
| T-1 | 資料庫為 **MSSQL**（非 PostgreSQL）。所有日期運算須採 MSSQL 相容語意，或明確在 TS 端計算 | 專案已全面 PG → MSSQL 遷移，PG 專屬語法（如 `EXTRACT(DOW)`、`::date`、`INTERVAL '3 months'`）不可用 |
| T-2 | **新人判定（BR-6 / BR-7）之月份位移與日期比較一律在 TS 端計算**，不得下推為 SQL `DATEADD` / `DATEDIFF` 條件 | 避免 MSSQL 日期函式與 JS 端語意分岐；亦保持 SQLite e2e 相容（同 `resolveCalendarDay` 之既有慣例：日期以 UTC date-only 處理） |
| T-3 | 查詢 `ob_calendar` 之月份區間須以 **`'YYYY-MM-DD'` 字串邊界**（該月 1 日 ~ 該月末日）比較，**不得**傳入 JS `Date` 物件作為 TypeORM `Between` 參數 | 已知陷阱：`Date` 物件經 UTC+8 換算會漏掉邊界日 |
| T-4 | pivot 查詢擴充 `e.jfun_nm` / `e.hire_date` 時，兩欄須同時進 SELECT 與 GROUP BY（MSSQL 嚴格要求）。若 `ob_emphire` 存在同一 `emp_id` 之重複列，將導致既有 `(deptName, emplid, listNo)` 聚合裂為多列、計數被重複計入 —— 實作須確保聚合結果對同一 `emplid` 仍收斂為單一節點 | `ob_emphire` PK 為 `emp_id`（data-model §ob-emphire），理論上不重複；但為 ETL full replace 同步表，須有防禦（見 §12 A-4） |
| T-5 | **`apps/api` 不得 `import ... from '@cdmp/shared'`** | 容器內無 symlink → `TS2307` → nest 啟動失敗；本機 `tsc` 會假性通過。跨端 DTO 由 api 自持本地型別副本（現行 `PivotResponse` 等介面即定義於 `assignment-run-report.service.ts`） |
| T-6 | **禁止**在 pivot 查詢引入在職過濾（`emphire-active.util` / `resign_date` 條件） | BR-9；離職者之歷史分派事實仍須完整呈現 |
| T-7 | v1.1 **不需 migration**、**不新增錯誤碼**、**不新增資料表/欄位** | 所有新增資訊皆為既有欄位之讀取或衍生計算 |
| T-8 | 實作完成後須執行 `tsc --noEmit -p tsconfig.build.json`（vitest 不做型別檢查） | 型別錯誤在測試綠燈下仍會使 production build 失敗 |

## 11.【v1.1 新增】錯誤情境與邊界矩陣

| 情境 | 後端行為 | 前端行為 | 對應 AC / BR |
|---|---|---|---|
| run 不存在 | 404 `ASSIGNMENT_RUN_NOT_FOUND` | 錯誤態 | AC-5 |
| 未登入 | 401 `AUTH_TOKEN_MISSING` | 導向登入 | §5.1 |
| 角色非部長/處長 | 403 `E07_ROLE_NOT_ASSIGNED` | 錯誤態 | §5.1 |
| 處長無轄區 | 200，`depts = []`、`grandTotal = 0`、`workingDays` 仍為真實值 | 空態 | AC-4 |
| `ob_calendar` 無該月資料 | 200，`workingDays = 0`（**非**錯誤、**非** `null`） | 工作天模式全表 `-` + 工具列提示；整月模式正常 | AC-11、BR-15 |
| `jfun_nm` NULL / 空字串 | `jfunNm = null` | 職稱位置依 prototype 呈現，列不消失 | AC-8、BR-5 |
| `hire_date` NULL | `isNewcomer = false` | 不顯示「新人」 | AC-8、BR-8 |
| 員編無 `ob_emphire` 對應列 | `empNm = null`、`jfunNm = null`、`isNewcomer = false` | 僅顯示員編 | AC-8、BR-8 |
| 「(空白)」部門／員編分組 | `jfunNm = null`、`isNewcomer = false`；計數與換算比照一般分組 | 不顯示職稱／新人；工作天換算照常 | AC-8、AC-11、BR-10 |
| 員編已離職 | 照常回傳 `empNm` / `jfunNm` / `isNewcomer` | 照常顯示 | AC-8、BR-9 |
| run 有結果但整月計數為 0 之格 | `byList` 無該 key（同 v1.0） | 工作天模式該格 `0`（`ceil(0/n) = 0`） | AC-10、BR-13 |
| 使用者於 `工作天-計數` 下重新載入頁面 | 不涉後端 | 維度狀態為前端 UI state，不需持久化（v1.1 未要求記憶） | — |

## 12.【v1.1 新增】待 system-architect 確認事項

> 以下為**架構歸屬（HOW）**問題，spec 已給出預設立場但不越權拍板。標記 `⚠` 者須由 system-architect 於 `architecture-spec.md` 定案。

| 編號 | 事項 | spec 預設立場 | 備註 |
|---|---|---|---|
| ⚠ A-1 | 工作天每格數值 `ceil(cnt / workingDays)` 之運算歸屬：前端換算 vs 後端下推（後端多回一組 `byListPerWorkday`） | **前端換算**（延續 BR-3 單一數據源原則，後端只回整月計數 + `workingDays`，回應體積不變） | 若 architect 改為後端下推，須同步修訂 §5.1.1 運算歸屬表與 BR-3 適用範圍；BR-13 / BR-14 之公式語意不因歸屬改變 |
| ⚠ A-2 | `workingDays` 之查詢實作是否複用 `assignment-list/stage0-estimate.service.ts` 之 `resolveCalendarDay` / `CalendarSource`（跨模組依賴：`assignment` → `assignment-list`），或於 `assignment` 模組內自持一份工作日計數查詢 | **語意必須與 `weekday` 判準一致**（BR-12）；程式碼複用方式交 architect | 若自持，須確保與 F049 判準不分叉（避免同一月份兩處算出不同工作日數） |
| ⚠ A-3 | `isNewcomer` 是否需同時回傳 `hireDate` 供 UI tooltip / 稽核 | **不回傳**（最小曝光面；`isNewcomer` 已足以驗證 AC-7） | 若 prototype 需顯示到職日，須回頭增修契約 |
| ⚠ A-4 | `ob_emphire` 同一 `emp_id` 重複列之防禦策略（T-4）：`GROUP BY` 後於 TS 端合併、或查詢層以子查詢取單列 | **聚合結果對同一 `emplid` 須收斂為單一節點**（行為契約），實作手段交 architect | 現行 `getPivot` 已在 TS 端以 `Map` 聚合，天然具備收斂能力；須確認計數不會因裂列被重複累加 |
| ⚠ A-5 | 前端維度狀態（整月／工作天）是否需與既有計數／佔比狀態一併納入 URL query 或 session 記憶 | **不需要**（v1.1 未要求；維持純 UI state） | 若 UX 要求，另立 story |
