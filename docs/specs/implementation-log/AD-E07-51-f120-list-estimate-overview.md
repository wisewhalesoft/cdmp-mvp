---
ad-id: AD-E07-51
title: F120 Stage 0 試算頁「名單基礎預估數量總覽」架構決策
feature-id: F120
epic: E07
version: "1.2"
status: Draft
date: 2026-08-20
supersedes-illustrative-shape-in: ../features/F120-stage0-list-estimate-overview.md#6-api-契約
---

# AD-E07-51：F120 Stage 0 試算頁「名單基礎預估數量總覽」架構決策

## Agent Loading Guide

| Agent 角色 | 需載入的章節 |
|---|---|
| TDD Developer | §2（既有架構基礎）、§4（核心設計決策）、§6（端點契約總覽）、§8（不變式）、§10（檔案異動清單） |
| Test Generator | §4（A1~A4 裁定）、§6、§8（不變式）、§9（測試邊界建議） |
| UI/UX Designer | §6.1（response shape）、§7（前端架構 brief） |
| Product Analyst / Team Lead | §4.5（OQ-F120-B1 已拍板 + 嚴格相等邊界處理）、§11（風險與殘留議題）、§12（待裁決） |

---

## 1. 背景與問題定義

[F120](../features/F120-stage0-list-estimate-overview.md) v1.0（依 [US-184](../../stories/epics/E07-app-customer-list-assignment/US-184-M01-stage0-list-estimate-overview.md) v1.1 建立）於 Stage 0 試算頁新增第三個唯讀區塊「名單基礎預估數量總覽」，以名單為單位、按產品類別分組小計呈現當月啟用名單之預估數量。spec 已完整定義 `GROUP-RESOLVE` 判定演算法、`GROUP-ORDER` 排序、小計 / 佔比公式與 5 個不變量（`I-F120-01~05`），並交付 4 項 HOW 層級問題（§13.1 OQ-F120-A1~A4）與 1 項需 team lead 拍板之斷言形式問題（OQ-F120-B1）予本 AD 裁決。

本 AD 之目的：在**不變動** F120 spec 之任何 AC / BR / 不變量的前提下，裁定端點拓樸、運算歸屬、`listTotals` 共用機制與效能防護，並給出可直接動工的端點契約與檔案異動清單。

> **v1.1（2026-08-20）補充**：使用者已對 OQ-F120-B1 拍板——F049「本月全名單總量」KPI 改為 `Σ_L list_total[L]` 精確整數和（`I-F120-03` 由容差升級為嚴格相等）。**F049 spec 由 spec-writer 同步更新，本 AD 不修改 F049 spec / code**；本次修訂僅在 §4.5 補上此裁決之架構可行性確認（§4.3 之 `resolveListTotals` 共用機制在何種條件下使嚴格相等依建構成立、殘餘邊界案例如何被既有降級語意合法涵蓋），並更新 §8 / §12。§4.1~§4.4（A1~A4）與 §6 端點契約**未變動**。

---

## 2. 既有架構基礎（查證彙總）

> 本節查證程式碼現況，作為 §4 裁決之依據；引用位置皆已逐行核對（2026-08-20）。

### 2.1 `computeDeptEstimate` 之 L1/L2 名單集合建立現況（`stage0-estimate.service.ts:536-573`）

```ts
let lists = await this.listRepo.find({
  where: { project_workym: ym, status: 'active' },
});
if (mode === 'single-list') lists = lists.filter((l) => l.list_no === opts.listNo);

const listTotals = new Map<string, number>();
const fallbackLists: ObListDefinition[] = [];
for (const l of lists) {
  if (l.stage0_estimate_count != null) listTotals.set(l.list_no, l.stage0_estimate_count);
  else fallbackLists.push(l);
}
if (fallbackLists.length > 0) {
  const timeoutMs = this.resolveDeptTimeoutMs(); // 預設 30_000ms
  await Promise.all(fallbackLists.map(async (l) => {
    try {
      const r = await this.raceTimeout(this.estimateListCount(l.list_no), timeoutMs);
      listTotals.set(l.list_no, r.count);
    } catch {
      warnings.push({ code: 'STAGE0_LIST_ESTIMATE_PARTIAL', listNo: l.list_no, message: `名單 ${l.list_no} 估算逾時，已從本次合計排除。` });
    }
  }));
}
```

**關鍵事實**：這段邏輯（名單集合查詢 + `listTotals` 建立 + fallback dry-run + PARTIAL warning）**現行即未套用任何 dept scope filter**。scope filter（`isSectionChief` → `getScopeDeptCode()` → 過濾）僅施加於**其後**的 `deptPctRows`（L575-587），與 `lists` / `listTotals` 完全無關。這意味著 F120 之「不套 dept scope」（AC-LIST-11 / BR-10）與現行程式碼結構**天然對齊**，不需要新增任何過濾邏輯，也不需要移除任何既有過濾（因為本就沒有）。

### 2.2 `resolveCategoricalOperator` 之既有雙落點先例（F119 / AD-E07-50 已建立）

| 落點 | 檔案 | 用途 |
|---|---|---|
| 後端 | `apps/api/src/modules/assignment/stage1/stage1-query-composer.ts:150` | Stage 1 SQL fragment 產生（composer + customer_core/financial 四處呼叫共用） |
| 前端 | `apps/web/src/pages/assignment/_utils/labels.ts:71` | 顯示層條件摘要 / decode |

兩者皆已明確標註「單一 fallback 落點、禁止各自 `cond.operator ?? 'in'`」（`I-CATOP-OPERATOR-FALLBACK-01`）。F119 之既定模式是**前後端各自一個單一落點**，非跨進程共用同一份程式碼——這是 GROUP-RESOLVE 運算歸屬裁決（§4.2）之直接先例。

### 2.3 `PooldataFieldOption` 之跨模組注入慣例（`assignment-list.service.ts:115`）

`AssignmentListService` 已直接 `@InjectRepository(PooldataFieldOption)`（非透過 `PooldataFieldModule` 匯入整個 service），且 `PooldataFieldOption` 已註冊於 `assignment-list.module.ts` 之 `TypeOrmModule.forFeature([...])`（第 49 行）。此為本 module 之既定慣例：**跨 feature 邊界之唯讀查詢以直接 repository 注入取代匯入整個外部 module**（與 `stage1Chain` / `estimateStage1SqlCount` 之「共用 pure function、不共用 module」慣例同構，見 [F116 / AD-E07-49 §5.19.2](../architecture-spec.md#519-f116-v11-樞紐分析頁籤架構決策ad-e07-49) 之相同先例）。

### 2.4 `Stage0EstimateController` / `Stage0EstimateService` 現行結構

單一 module（`assignment-list`）內，單一 controller 承載全部 Stage 0 端點（`daily-estimate` / `dept-estimate` / `list-definitions/:listNo/estimate` / `preview-hit-count`），單一 service 承載對應邏輯。Guard 慣例：class 級 `AuthGuard, DirectorOrSectionChiefGuard, DirectorGuard` + `@RequireDirectorOrSectionChief()`；`dailyEstimate` / `previewHitCount` 以 method 級 `@RequireDirector()` 收緊為部長 / Admin 專屬，`deptEstimate` / `estimateListCount` 則維持 class 級基準（處長可達）。

---

## 3. 決策總覽

| # | 議題 | 裁定 |
|---|---|---|
| OQ-F120-A1 | 端點拓樸 | **新增獨立端點** `GET /api/v1/assignment/stage0/list-estimate-overview`（採納 spec-writer 建議） |
| OQ-F120-A2 | 運算歸屬 | **後端計算**（`GROUP-RESOLVE` / 小計 / 佔比皆在 service 層），純函式 `resolveListGroup()` 匯入後端既有 `resolveCategoricalOperator`（§2.2），不新建第三個 fallback 落點 |
| OQ-F120-A3 | `listTotals` 共用機制 | 抽出 `Stage0EstimateService.resolveListTotals(ym, listNo?)` 私有方法，供 `computeDeptEstimate` 與新 `computeListEstimateOverview` 兩者呼叫（同一 class、同一段程式碼） |
| OQ-F120-A4 | 效能（fallback 重複成本） | **不新增快取層**；A3 之程式碼共用消除「兩區塊算出不同值」之正確性風險，殘餘之「同頁兩次 HTTP 請求各觸發一次 fallback dry-run」成本評估為有界、非資料量爆炸風險，列為 §11 殘留風險並附具體重新評估觸發條件 |
| OQ-F120-B1 | F049 KPI 捨入落差 | **✅ 已由使用者拍板（2026-08-20）**：採納 G-1 修正，F049 新增頂層欄位 `orgMonthTotal`（`Σ_L list_total[L]` 精確和），`I-F120-03` 升級為嚴格相等。本 AD §4.5 / §4.5.1 確認架構可行性並給出可直接轉譯為斷言的精確條件 |

---

## 4. 核心設計決策

### 4.1 OQ-F120-A1：端點拓樸 — 新增獨立端點

**裁定**：新增 `GET /api/v1/assignment/stage0/list-estimate-overview`，**不**擴充既有 `GET /api/v1/assignment/stage0/dept-estimate`。

**理由**：

1. **安全邊界**：本區塊授權語意（全公司名單層、無 dept scope）與部門矩陣（處長強制 `obdeptid` 限縮）**相反**。若塞入同一回應，該回應會同時包含「已被 scope 過濾」與「未被 scope 過濾」兩種語意的欄位——這正是 memory 中反覆出現的「安全邊界最容易出錯的形態」：未來任何一次維護若誤判整份回應之 scope 語意一致，即可能引入資料外洩或誤導。獨立端點使「這個回應完全不做 dept scope」成為端點簽章本身即可傳達的事實，不依賴欄位層級文件才能辨識。
2. **零額外過濾成本，程式碼結構天然支持**：§2.1 已查證 `lists` / `listTotals` 之建立本就未經 scope 過濾，新增獨立端點只需呼叫同一段邏輯（§4.3）並跳過 `deptPctRows` / `deptCells` / 可行性計算——比起在既有 `dept-estimate` 回應中「新增一個不受同回應其他欄位 scope 規則約束的子物件」更不易出錯。
3. **獨立降級**：部門矩陣之 fallback 逾時 / 在職人數查詢失敗不牽連名單總覽渲染，反之亦然（`dept-estimate` 回應體積更大、涉及更多表 join，失敗面更廣）。
4. **查詢足跡更小**：本區塊不需要 `ob_calendar`（無日曆維度）、`ob_dept_pct`（無部門投影）、`ob_emphire`（無在職人數），獨立端點使新 service 方法完全不觸碰這三張表，符合「不为不需要的維度付查詢成本」之精神。

**Guard**：沿用 `Stage0EstimateController` class 級基準（`AuthGuard, DirectorOrSectionChiefGuard, DirectorGuard` + `@RequireDirectorOrSectionChief()`），method 級**不**加 `@RequireDirector()`（否則處長 403，違反 AC-LIST-11）。與 `deptEstimate` / `estimateListCount` 兩個既有方法之 Guard 配置完全一致。

**路徑與命名**：`GET /api/v1/assignment/stage0/list-estimate-overview`（team lead 指定路徑，予以採用；與既有 `stage0/dept-estimate`、`stage0/daily-estimate` 同一路徑族，命名一致）。

### 4.2 OQ-F120-A2：運算歸屬 — 後端計算

**裁定**：`GROUP-RESOLVE`、`GROUP-ORDER`、小計、佔比全數於後端 `Stage0EstimateService.computeListEstimateOverview()` 計算並回傳 §6.1 之 shape；顯示層僅負責條件字串格式化（`formatConditionSummary()`）、分組標籤 decode 呈現（後端已回傳 `option_value`，前端沿用既有 `useConditionDecoder()` 或直接顯示後端回傳之標籤，見 §7）與版面。

**理由**：

1. **不新建第三個 operator fallback 落點**：§2.2 已確認前後端各有一個 `resolveCategoricalOperator()` 單一落點。若 `GROUP-RESOLVE` 放在顯示層，勢必要嘛呼叫前端 `labels.ts` 版本（語意上可行，但會使「分組結果」與「Stage 1 SQL 篩選」兩件事依賴不同 runtime 的兩份獨立實作，僅靠測試守住一致——這正是 F119 SA-3 明確排斥的模式）、要嘛在顯示層再寫一份——兩者皆劣於後端直接呼叫後端已有的**同一個**規範性 `resolveCategoricalOperator`（`stage1-query-composer.ts`）。後端計算使 `GROUP-RESOLVE` 與 Stage 1 篩選解讀 `operator` 之邏輯**引用同一支函式**，非僅「行為上恰好一致」。
2. **TC-184-13~15 可於 API 層直接斷言**：分組互斥完備、佔比計算、總計為 0 時降級，皆為回應 JSON 之欄位值，測試不需要渲染 DOM。
3. **與既有部門矩陣分工一致**：`computeDeptEstimate` 之慣例即「數值由後端算、顯示層只呈現」（cases / perPerson / overThreshold 皆後端算好）。

**`GROUP-RESOLVE` 實作位置**：新檔 `apps/api/src/modules/assignment-list/stage0-list-group-resolve.ts`，匯出純函式：

```ts
export type ListGroupResolution =
  | { groupType: 'code'; optionValue: string }
  | { groupType: 'multi' }
  | { groupType: 'unclassified' };

export function resolveListGroup(
  payload: ObListDefinitionConditionPayload | null | undefined,
): ListGroupResolution
```

- 內部 `import { resolveCategoricalOperator } from '@/modules/assignment/stage1/stage1-query-composer'`——**不**在本檔重新實作 `operator ?? 'in'`（延續 `I-CATOP-OPERATOR-FALLBACK-01`，見 §8 `I-LISTOVW-OPERATOR-SINGLE-SOURCE-01`）。
- 純函式、零 I/O、零外部狀態依賴（不查白名單、不查估算結果），與 F120 spec §5.2 演算法逐步對應，直接可單元測試（AC-LIST-06b「決定性」之落地方式）。
- 置於 `assignment-list` 模組而非 `assignment/stage1`：本函式服務 Stage 0 顯示聚合，與 Stage 1 SQL fragment 產生（`stage1-query-composer.ts` 之核心職責）性質不同；僅**借用**其 operator 解析函式，不與其 SQL 產生邏輯耦合。此跨模組函式級 import 與既有 `stage0-estimate.service.ts` 已 import `stage1Chain` / `estimateStage1SqlCount` 之慣例同構（§2.4）。

**`GROUP-ORDER` 組裝**：不做成獨立純函式（需要查 `pooldata_field_option`，屬 I/O），直接為 `Stage0EstimateService` 之私有方法 `private buildGroups(lists, listTotals, options): GroupsResult`，內部呼叫 `resolveListGroup()` 逐筆歸類，再依 §6.1 契約組裝。

### 4.3 OQ-F120-A3：`listTotals` 共用機制 — `resolveListTotals(ym, listNo?)`

**裁定**：將 §2.1 引述之既有邏輯區塊（`stage0-estimate.service.ts:536-573`）抽出為新私有方法：

```ts
private async resolveListTotals(
  ym: string,
  listNo?: string,
): Promise<{
  lists: ObListDefinition[];
  listTotals: Map<string, number>;
  warnings: Stage0DeptWarning[];
}>
```

`computeDeptEstimate` 與新 `computeListEstimateOverview` **皆呼叫此同一方法**（同一 class instance、同一段程式碼，非兩份平行實作）；呼叫端各自把回傳的 `warnings` 併入自己的 `warnings` 陣列。此為方法簽章與呼叫端之**契約**，非僅建議命名——`I-F120-03`（跨區塊同源）由此**依建構成立**：兩區塊若曾經算出不同的 `list_total[L]`，唯一可能原因是兩次 HTTP 請求之間名單資料本身在極短時間內被修改（非本 feature 之併發語意範圍，與既有 `dept-estimate` 本身之併發語意一致，不另行加鎖）。

**重構影響面**：`computeDeptEstimate` 之既有行為（含 `STAGE0_LIST_ESTIMATE_PARTIAL` warning 之產生時機、fallback timeout 值）**完全不變**——純粹是把一段既有程式碼搬進一個新命名的私有方法，呼叫端邏輯逐行對應，屬於安全的內部重構（無外部可觀察行為差異），既有 `dept-estimate` 相關測試不應變動任何斷言。

### 4.4 OQ-F120-A4：效能（fallback 重複成本）— 不新增快取層

**裁定**：**不引入任何新快取層**（無 in-process cache、無 Redis、無 request-scoped memoization）。

**分析**：

- A3 之程式碼共用消除的是**正確性風險**（兩區塊算出不同數字），**不**消除「同一次頁面載入觸發兩次 HTTP 請求、各自呼叫一次 `resolveListTotals`」之事實——`dept-estimate` 與新 `list-estimate-overview` 是兩個獨立端點（§4.1 之刻意設計），沒有跨請求共享的執行期狀態，故 fallback dry-run COUNT（僅在 `stage0_estimate_count IS NULL` 時觸發）在最壞情況下會被執行兩次。
- **此非資料量爆炸風險**：fallback 路徑本身（`dryRunChainCount` → `estimateStage1SqlCount` / `estimateStage1SqlCountMssql`）已是 SQL `COUNT(*)` 下推（PG / MSSQL 皆走 SQL 層聚合，非撈全表到記憶體），符合專案「ETL / 資料處理一律以生產級資料量設計」之既有規矩（`ob_pool_data` 7.8M 列規模下亦不會 OOM，與 [F055 preview OOM 修復](../architecture-spec.md) 教訓所警惕之 bare `find()` 全表撈取模式**不同**）。故本項之代價是「查詢次數 × 2」之固定倍率，而非隨資料量增長之無界成本。
- **`stage0_estimate_count` 物化值是常態路徑**：fallback 僅在名單缺乏物化估算值時觸發；[F088](../features/F088-ready-stage-summary.md) 既有流程會維護此欄位。換言之，此 2× 成本只影響「名單尚未被估算過」的過渡態，非穩態下每次頁面載入的常態成本。
- 既有 `STAGE0_DEPT_ESTIMATE_TIMEOUT_MS`（預設 30s）已對單次 fallback 批次設下界；2× 亦不改變此上界（兩次獨立請求各自受此上界約束，不會疊加超時）。
- **明確拒絕的替代方案**：為此新增請求層或程序內快取（keyed by `ym`/`listNo`，TTL 數秒）在技術上可行，但屬於為一個有界、低頻（僅過渡態觸發）、無資料損毀風險的成本，引入一個新的失效語意問題（快取何時失效？名單被編輯後如何確保下次請求看到新值？）——不符合 MVP 規模下之成本效益，亦違反「不為未驗證需求引入新狀態管理機制」之一般原則。若日後生產環境量測顯示此問題material，應優先檢討 F088 是否有物化值長期缺漏（根因），而非在讀取端疊加快取（治標）。

**重新評估觸發條件**（記錄於 §11，非本輪動作）：若正式環境量測顯示（a）`stage0_estimate_count` 長期缺漏比例明顯高於預期，或（b）Stage 0 試算頁 p95 頁面完整載入時間因此超出可接受範圍，應優先修 F088 物化值覆蓋率，其次才考慮請求層快取。

### 4.5 OQ-F120-B1：F049 KPI 精確和（✅ 已拍板，2026-08-20）——架構可行性確認

使用者已拍板採納 G-1 修正：F049「本月全名單總量」KPI 由「逐日先 `Math.round` 再相加」改為 `Σ_L list_total[L]` 精確整數和。F049 spec（升版至 v2.1）與 F120 spec 之 AC-LIST-09 由 spec-writer 同步修訂，**本 AD 不修改 F049 spec 或程式碼**，僅在此確認架構可行性與處理團隊要求明確化之邊界案例。

**執行方式（team lead 拍板採用，欄位命名依 spec-writer F049 v2.1 查證後之裁決）**：新增欄位 **`orgMonthTotal: number`**——`Stage0DeptEstimateResult` 之**頂層**欄位（非 `days[]` 內），值為對 `resolveListTotals()`（§4.3）既有之 `listTotals: Map<string, number>` 做一次 `reduce`（`Σ_L list_total[L]`）。零新查詢成本（對已在記憶體中的資料多做一次加總）、純加性變更，F049 既有兩區塊之逐日 / 逐部門呈現（`days[].orgTotal` 之個別捨入值）完全不動。命名理由（非本 AD 裁決，記錄供追溯）：`prototypes/30-stage0-estimate.html:517` 之 `orgMonthTotal` 本即精確和、`stage0-estimate-page.tsx:227` 既有前端變數同名、與同回應之 `days[].orgTotal` 命名族系一致——採此名避免同一數字在 prototype／前端／後端出現第三種叫法。完整受影響落點清單見 [F049 v2.1 §24](../features/F049-stage0-daily-estimate.md)（`Stage0DeptEstimateResult` interface、前端 `orgMonthTotal` useMemo、`apps/web/src/api/assignment-run.ts` 型別、既有測試 fixture），本 AD 不重複列舉。

#### 4.5.1 `I-F120-03` 升級為嚴格相等——可斷言之精確條件（team lead 本輪要求之核心產出）

**先區分兩組不同的比較關係，避免與 F049 v2.1 之既有容差規則混淆**：

| 比較 | 關係 | 斷言方式 |
|---|---|---|
| **（本節範圍）跨端點・月層級 vs 月層級**：`dept-estimate.orgMonthTotal` vs `list-estimate-overview.totalEstimatedCount` | 兩者皆為 `Σ_L list_total[L]` 精確整數和，理論上同源（皆經 `resolveListTotals`） | **嚴格相等**（條件見下） |
| **（F049 v2.1 既定範圍，非本節）同端點內・月層級 vs 逐日捨入和**：`dept-estimate.orgMonthTotal` vs `Σ_d Math.round(dept-estimate.days[d].orgTotal)` | 精確和 vs 逐日先捨入再相加，捨入殘差 ≤ 工作日數 × 0.5（F049 v2.1 已定案，非本 AD 範圍） | **不得斷言相等**（此為預期殘差，屬 F049 spec 既有規則，`orgMonthTotal` 欄位存在之目的正是取代這種逐日和作為精確口徑） |

以下僅處理第一列（跨端點月層級 vs 月層級）。

**可直接轉譯為斷言的精確條件**：定義

```
excluded(response) := { listNo : 該回應之 warnings[] 含
                         { code: 'STAGE0_LIST_ESTIMATE_PARTIAL', listNo } }
```

（dept-estimate 端從 `warnings[]` 取得；list-estimate-overview 端等價於 `groups[].lists[]` 中 `estimateUnavailable === true` 之 `listNo` 集合，兩者皆為 `resolveListTotals()` 回傳之同一組 `warnings` 之直接透傳，來源相同。）

則：

```
excluded(dept-estimate response) === excluded(list-estimate-overview response)
  ⟹  dept-estimate.orgMonthTotal === list-estimate-overview.totalEstimatedCount   （嚴格相等）
```

此為**充分條件**：兩端排除之名單集合相同時，兩端 `listTotals` 之定義域與各元素之值必然相同（`dryRunChainCount` 對同一名單同一資料為確定性 SQL），Σ 後嚴格相等依算術成立。

**此條件何時成立**：
- **穩態（`resolveListTotals` 全程未觸發 fallback，即所有名單皆有物化 `stage0_estimate_count`）**：`excluded(A) = excluded(B) = ∅`，條件**無條件成立**——兩端請求對 `ob_list_definition` 執行同一個 `WHERE project_workym = :ym AND status = 'active'` 查詢、讀取同一批既存欄位值，不涉及任何查詢時間或 timeout 之不確定性。
- **過渡態（存在 fallback dry-run COUNT）**：`dryRunChainCount` 本身確定性；唯一的不確定性來自 `raceTimeout()` 之 30 秒門檻——理論上兩次獨立 HTTP 請求可能對同一名單的 fallback 各自得到不同的 timeout 結果（例如 A 端點於 29 秒完成、B 端點因資料庫當下負載於 30 秒逾時），使 `excluded(A) ≠ excluded(B)`，此時嚴格相等**不成立**，`orgMonthTotal` 與 `totalEstimatedCount` 之差額即為此差集名單之真實件數。此為**生產環境限定**之窄窗口（見下）。

**測試環境下之推論（回應 team lead「避免下游間歇性紅燈」之疑慮）**：`excluded(A) ≠ excluded(B)` 之唯一成因是兩個獨立 HTTP 請求對同一 fallback 查詢的**真實、獨立、依當下資料庫負載而定**之 timeout 結果分歧——這需要真實網路時序競爭，任何測試環境（無論是直接 seed `stage0_estimate_count` 使 fallback 根本不觸發，或以 `vi.spyOn` / mock 使 `estimateListCount` 對特定名單確定性地拋錯 / 逾時）之 fallback 結果對**同一個測試行程內的兩次呼叫**皆為同一組 mock/fixture 所決定，`excluded(A)` 與 `excluded(B)` 在測試環境下**恆相等**（含刻意建構 AC-LIST-10 部分降級情境的測試——只要該測試對兩個 service 方法呼叫套用同一組 mock，兩端排除的名單集合仍然相同，差額僅是相等的較小總和，嚴格相等依然成立）。

**因此對 test-generator 之明確指示**：**TC-184-07 應在測試套件中無條件斷言嚴格相等**（`expect(deptEstimateResponse.orgMonthTotal).toBe(listEstimateOverviewResponse.totalEstimatedCount)`，含涵蓋 AC-LIST-10 部分降級情境的測試案例在內），**不需要**、也**不應該**寫成依 `unestimatedListCount` 或其他執行期狀態分支的條件式斷言——因為在測試環境下 `excluded(A) = excluded(B)` 恆成立，寫成條件式斷言反而會掩蓋一個實作錯誤（若兩端排除集合在測試中意外不同，通常代表測試沒有把 mock 一致套用到兩個呼叫，是測試本身的 bug，不應該被一個「容許不等」的分支悄悄放過）。

**若未來確有需要（安全閥，非本輪要求）**：若 test-generator 遇到某測試場景之兩次呼叫**無法**共用同一組確定性 mock（例如刻意模擬時序競爭本身），可退回較保守的規則——「任一端 `warnings[]` 含 `STAGE0_LIST_ESTIMATE_PARTIAL`（等價 `unestimatedListCount > 0`）時不斷言嚴格相等」；此規則更寬鬆、更安全，但會連帶放棄對「兩端排除集合恰好相同、可斷言縮減後總和相等」情境的驗證力道，故僅建議作為上一段主要規則不適用時的備援，非預設寫法。

**生產環境殘留風險**（非測試風險，記錄於 §11）：`excluded(A) ≠ excluded(B)` 之窗口僅存在於生產環境、兩個獨立請求對同一批未物化名單分別觸發 fallback 且 timeout 結果分歧時。此時差異**非靜默錯誤**——受影響名單在排除它的一端，已透過既有機制明確標示（F120 端 `estimatedCount: null` / `estimateUnavailable: true`；F049 端 `warnings[]` 含對應 `STAGE0_LIST_ESTIMATE_PARTIAL`），與 F120 spec 既有 AC-LIST-10 / BR-7 之單一名單降級語意同構，僅是觀察範圍從單一回應內擴及跨回應。若日後生產觀察顯示此窗口 material，應優先檢討 F088 物化覆蓋率（根因，同 §4.4 A4 之殘留風險處置原則），而非在讀取端引入新的同步 / 快取機制。

---

## 5. Schema 變更

**無**。本 feature 不新增資料表、不新增欄位、不需要 migration。所有新邏輯皆為對既有欄位（`ob_list_definition.list_no` / `list_nm` / `condition_payload` / `status` / `project_workym` / `stage0_estimate_count`，`pooldata_field_option.column_name` / `option_value` / `option_label` / `display_order` / `is_active`）的唯讀聚合。

---

## 6. 端點契約總覽

### 6.1 端點簽章

```
GET /api/v1/assignment/stage0/list-estimate-overview
  ?ym=202608
  &listNo=OB202608001        // 選填；提供時進入 single-list 模式
  &calendarSource=weekday    // 選填；接受但忽略（A-1，見 F120 spec §6.2）
  &startDate=2026-08-01      // 選填；接受但忽略
  &endDate=2026-08-31        // 選填；接受但忽略
```

Guard：`AuthGuard, DirectorOrSectionChiefGuard, DirectorGuard` + class 級 `@RequireDirectorOrSectionChief()`（§4.1）。`calendarSource` / `startDate` / `endDate` 於 controller 方法簽章中宣告（維持與 `dept-estimate` 之參數一致性），但**不**傳入 service——避免 service 方法簽章帶著「看起來會影響輸出、實則永遠 no-op」的參數（比起把 dead 參數往下傳更誠實地反映本區塊無日曆維度之事實）。

### 6.2 Response 契約（實作依據；細節對齊 F120 spec §6.1，一處經確認調整見下方註記）

```jsonc
{
  "ym": "202608",
  "mode": "aggregated",              // "aggregated" | "single-list"
  "listNo": null,

  "scope": {
    "role": "section_chief",          // "director" | "section_chief" | "admin"
    "deptCode": "XVE1",                // 處長之轄區代碼（純顯示用途；本端點從不以此過濾，見下方註記）
    "listOverviewScoped": false        // 恆為 false（AC-LIST-11 / I-F120-05 之顯式契約標記）
  },

  "totalListCount": 12,
  "totalEstimatedCount": 28500,
  "unestimatedListCount": 1,

  "groups": [
    {
      "groupKey": "01",
      "groupType": "code",             // "code" | "multi" | "unclassified"
      "optionValue": "01",
      "displayOrder": 0,
      "listCount": 5,
      "estimatedListCount": 4,
      "subtotalCount": 12000,
      "percent": 42,
      "lists": [
        {
          "listNo": "OB202608001",
          "listNm": "汽車滿期名單",
          "conditions": [ /* 原樣透傳 ObListDefinitionConditionItem[] */ ],
          "estimatedCount": 3200,
          "estimateUnavailable": false
        }
      ]
    }
  ],

  "warnings": [
    { "code": "STAGE0_LIST_ESTIMATE_PARTIAL", "listNo": "OB202608005",
      "message": "名單 OB202608005 估算逾時，已從本次合計排除。" }
  ]
}
```

**採用 F120 spec §6.1 全部欄位、不刪減**。`scope.deptCode` 之取得方式（§6.3）：僅供前端顯示用途（例如未來若要在語意標示文案中帶出「即使您是 XVE1 處長，以下仍為全公司口徑」），**本端點之名單集合查詢從不讀取此值**——安全邊界完全由「本端點程式碼路徑不存在任何 `filter(scopeDeptCode)` 呼叫」保證，`listOverviewScoped: false` 是此事實的顯式契約標記，`scope.deptCode` 是否為 `null` 不影響任何過濾行為（`I-LISTOVW-NO-SCOPE-FILTER-01`，見 §8）。

**與部門矩陣之明確差異**：本端點**不**呼叫 `getScopeDeptCode()` 後產生 `SCOPE_UNRESOLVED` warning（F120 spec §6.3 已明訂此 warning 僅屬部門矩陣）；若 `getScopeDeptCode()` 回傳 `null`，`scope.deptCode` 即為 `null`，其餘回應內容照常完整回傳，不降級。

### 6.3 Service 方法簽章

```ts
async computeListEstimateOverview(
  ym: string,
  opts: { listNo?: string; actor?: ActorLike | null } = {},
): Promise<Stage0ListEstimateOverviewResult>
```

實作步驟（對應 F120 spec §5.5 公式，逐步映射）：

1. `mode` = `opts.listNo` 存在 → `'single-list'`，否則 `'aggregated'`。
2. `scope` 判定：與 `computeDeptEstimate` 之 L4 段（`isSectionChief` / `scopeRole` 判定）**同一段邏輯**（可考慮一併抽出共用私有方法 `resolveActorScope(actor)`，非必要但可避免兩處重複判定 `businessRole === 'section_chief' && role !== 'admin'` 之三元式；若抽出，命名 `resolveActorScope`，回傳 `{ role, isSectionChief }`）。若 `isSectionChief`，呼叫 `scopeService.getScopeDeptCode(actor.userId)` 取得 `scope.deptCode`（**僅供顯示**，不用於過濾，不因 `null` 推 warning）。
3. `const { lists, listTotals, warnings } = await this.resolveListTotals(ym, opts.listNo);`（§4.3）。
4. `const options = await this.optionRepo.find({ where: { column_name: 'prod_kind' } });`（含 `is_active=false`，因排序 / 標籤仍需涵蓋停用代碼，F120 spec §5.3 第 1 段）；依 `display_order ASC, option_value ASC` 排序（與 `PooldataFieldOptionService.listOptions()` 同排序鍵，§2.3 / F120 spec §5.1 已查證表）。
5. 逐筆 `lists` 呼叫 `resolveListGroup(l.condition_payload)`（§4.2），依回傳之 `groupType` / `optionValue` 分桶。
6. 依 F120 spec §5.3 GROUP-ORDER 組裝 `groups[]`：已登錄單一代碼組（依 step 4 排序）→ 孤兒代碼組（代碼字串遞增）→ `MULTI` → `UNCLASSIFIED`；`listCount[g] = 0` 之分組不輸出。
7. 依 F120 spec §5.5 公式計算 `listCount[g]` / `estimatedListCount[g]` / `subtotalCount[g]` / `percent[g]`，以及 `totalListCount` / `totalEstimatedCount` / `unestimatedListCount`。
8. 回傳前組裝完整 shape（§6.2）。

**不變性**：本方法**不**呼叫 `deptPctRepo` / `emphireRepo` / `calendarRepo`（§4.1 已論證無此三個維度）。

### 6.4 Controller 方法

```ts
@Get('stage0/list-estimate-overview')
async listEstimateOverview(
  @Request() req: { user?: ActorLike | null },
  @Query('ym') ym?: string,
  @Query('listNo') listNo?: string,
  @Query('calendarSource') calendarSource?: string, // 接受但忽略（A-1）
  @Query('startDate') startDate?: string,            // 接受但忽略
  @Query('endDate') endDate?: string,                // 接受但忽略
) {
  const effectiveYm = ym ?? this.systemService.getCurrentWorkYm();
  return this.service.computeListEstimateOverview(effectiveYm, {
    listNo,
    actor: req.user ?? null,
  });
}
```

置於既有 `Stage0EstimateController` 內（新增第 5 個方法，與現有 4 個方法同 class，不新建 controller，不新建 module）。

---

## 7. 前端架構（brief；元件實作交 tdd-implementation / ui-ux-designer）

- 新區塊為獨立元件（例如 `ListEstimateOverviewSection`），置於既有 `stage0-estimate-page.tsx` 內、既有兩區塊之後，呼叫新端點（獨立 `useQuery` / fetch，與部門矩陣區塊之查詢**不合併**、不共用 loading/error 狀態——對齊 §4.1「獨立降級」之設計意圖）。
- 條件字串格式化：**必須**透過既有 `formatConditionSummary()`（`apps/web/src/pages/assignment/_utils/condition-summary.ts`）+ `useConditionDecoder()`，本區塊元件**不得**另拼字串（F120 BR-4）。
- 分組標題：後端已回傳 `optionValue`（`groupType='code'` 時），前端經既有 decode 機制（`useConditionDecoder().decodeValue('prod_kind', optionValue)`）轉為中文標籤，**不**信任後端另外回傳一個预先格式化的中文標籤字串——維持「單一格式化 / decode 落點在前端」之既有分工（與 `formatConditionSummary` 同一精神）；`groupType='multi'` / `'unclassified'` 則為固定文案，不查白名單。
- 佔比 / 小計 / 總計數字**直接使用**後端回傳值（`percent` / `subtotalCount` / `totalEstimatedCount` 等），前端**不**重新計算（§4.2 已裁定後端算好）。

---

## 8. 不變式（Invariants）

延續 F120 spec 之業務層不變量 `I-F120-01~05`（原樣成立，不受本 AD 影響），新增以下 HOW 層級不變式：

| 不變式 | 說明 | 對應 |
|---|---|---|
| `I-LISTOVW-SHARED-SOURCE-01` | `computeDeptEstimate` 與 `computeListEstimateOverview` 之 `lists` / `listTotals` **恆**經由同一個私有方法 `resolveListTotals(ym, listNo?)` 取得，禁止任一方法自行 `listRepo.find(...)` 重寫此邏輯 | `I-F120-03` 之實作保證 |
| `I-LISTOVW-NO-SCOPE-FILTER-01` | `computeListEstimateOverview` 之呼叫鏈（含 `resolveListTotals`）不得出現任何 `scopeDeptCode` 過濾；`scope.deptCode` 欄位僅供顯示，可用 grep 反向斷言（本方法程式碼不得引用 `scopeDeptCode` 於任何 `.filter(` / `WHERE` 子句） | `I-F120-05` / BR-10 |
| `I-LISTOVW-OPERATOR-SINGLE-SOURCE-01` | `resolveListGroup()` 之 operator 解讀**僅**經由 `import { resolveCategoricalOperator } from '.../stage1-query-composer'`，本檔案不得自行撰寫 `operator ?? 'in'` | AC-LIST-06b / BR-3 |
| `I-LISTOVW-PURE-GROUP-RESOLVE-01` | `resolveListGroup()` 為純函式：不注入 repository、不接受 request context、輸出僅依輸入 `payload` 決定 | AC-LIST-06b 決定性 / `I-F120-01` |
| `I-LISTOVW-NO-NEW-CACHE-01` | 本 feature 不引入任何新快取層（in-process / 分散式）；`resolveListTotals` 之 fallback dry-run 成本上界沿用既有 `STAGE0_DEPT_ESTIMATE_TIMEOUT_MS` | §4.4 |
| `I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01` | `I-F120-03`（跨區塊同源，已於 B1 拍板後升級為嚴格相等）之精確條件：`excluded(dept-estimate) === excluded(list-estimate-overview)` ⟹ `orgMonthTotal === totalEstimatedCount`（`excluded()` = 該回應 `warnings[]` 中 `STAGE0_LIST_ESTIMATE_PARTIAL` 對應之 listNo 集合）。測試環境下兩端共用同一組 mock/fixture，此條件恆成立——TC-184-07 應無條件斷言嚴格相等（見 §4.5.1）。僅生產環境下兩端各自 fallback timeout 結果分歧時可能不成立，此時受影響名單在兩端皆透過既有 warning / `estimateUnavailable` 機制明確標示，非靜默錯誤 | §4.5.1 |

---

## 9. 測試邊界建議（交 test-generator）

- `resolveListGroup()` 純函式單元測試可**完全脫離資料庫**（無需 SQLite fixture），直接覆蓋 F120 spec §10.2 邊界矩陣全部案例（空 payload / 無 prod_kind 條件 / 單一代碼 / 重複代碼去重 / 多值 / 空陣列 / 三種文字運算子 / operator 缺漏 / `fieldType` 非 categorical 防禦）。
- `computeListEstimateOverview` 之整合測試建議直接複用 `computeDeptEstimate` 既有測試 fixture 之 `ob_list_definition` seed 資料（同一批名單集合），落實 TC-184-07：**無條件**斷言 `deptEstimateResult.orgMonthTotal === listEstimateOverviewResult.totalEstimatedCount`（含 AC-LIST-10 部分降級情境測試在內；理由與可轉譯條件見 §4.5.1，**不要**依 `unestimatedListCount` 或其他執行期狀態寫成條件式斷言）。
- `I-LISTOVW-NO-SCOPE-FILTER-01` 之 TC-F120-D（處長與部長 `listNo` 集合相同）可直接以兩次呼叫 `computeListEstimateOverview(ym, { actor: sectionChiefActor })` vs `computeListEstimateOverview(ym, { actor: directorActor })` 斷言 `groups[].lists[].listNo` 聯集相同、`totalEstimatedCount` 相同。
- Grep 回歸測試（`I-LISTOVW-OPERATOR-SINGLE-SOURCE-01` / `I-F120-04`）：`stage0-list-group-resolve.ts` 不得出現 `\?\?\s*['"]in['"]` 字面樣式，亦不得出現對 `\.prod_kind\b`（entity 欄位存取）之讀取。

---

## 10. 檔案異動清單

### 後端（新增 / 修改）

| 檔案 | 異動類型 | 說明 |
|---|---|---|
| `apps/api/src/modules/assignment-list/stage0-list-group-resolve.ts` | 新增 | `resolveListGroup()` 純函式（§4.2） |
| `apps/api/src/modules/assignment-list/stage0-estimate.service.ts` | 修改 | 抽出 `resolveListTotals()`（§4.3）；新增 `computeListEstimateOverview()`（§6.3）；新增回應型別 `Stage0ListEstimateOverviewResult` / `Stage0ListEstimateGroup` / `Stage0ListEstimateListItem`；constructor 新增 `@InjectRepository(PooldataFieldOption)`（module 已註冊，無需改 `assignment-list.module.ts`） |
| `apps/api/src/modules/assignment-list/stage0-estimate.controller.ts` | 修改 | 新增 `listEstimateOverview()` 方法（§6.4） |

### 前端（新增；細節交 tdd-implementation / ui-ux-designer）

| 檔案 | 異動類型 |
|---|---|
| `apps/web/src/pages/assignment/stage0-estimate-page.tsx` | 修改（新增第三區塊掛載點） |
| 新元件（命名交 ui-ux-designer / tdd-implementation，例如 `_components/list-estimate-overview-section.tsx`） | 新增 |

### 文件（本輪已由 system-architect 直接提交）

| 檔案 | 異動 |
|---|---|
| `docs/specs/implementation-log/AD-E07-51-f120-list-estimate-overview.md` | 新增（本檔） |
| `docs/specs/architecture-spec.md` | 新增 §5.21 摘要段落 + frontmatter `covers` 補入 F120 + 版本 banner |

### 不需異動

`docs/specs/data-model.md`（無新 entity / 無新欄位，§5 已列現況欄位映射表無誤）、`docs/specs/error-handling.md`（F120 spec §8 已確認不新增錯誤碼）、任何 migration 檔案。

---

## 11. 風險與殘留議題

| 風險 | 評估 | 處置 |
|---|---|---|
| fallback dry-run 2× 成本（§4.4） | 有界、低頻（僅過渡態），非資料量爆炸風險 | 不處置；訂重新評估觸發條件（§4.4 末段） |
| OQ-F120-B1（F049 KPI 精確和） | **✅ 已拍板（2026-08-20）**：F049 新增 `orgMonthTotal` 欄位（`Σ_L list_total[L]`）；TC-184-07 為嚴格相等斷言（無條件，見 §4.5.1） | 已裁決；不阻塞其餘實作 |
| 生產環境下 `excluded(dept-estimate) ≠ excluded(list-estimate-overview)`（兩端獨立 fallback timeout 結果分歧，§4.5.1） | 窄窗口、僅發生於過渡態（存在未物化名單）且兩次請求恰好在 30 秒門檻附近分歧；受影響名單於兩端皆有既有 warning / `estimateUnavailable` 明確標示，非靜默錯誤；測試環境不可觸發（§4.5.1 已論證） | 不處置（新增同步 / 快取機制違反 A4 裁定）；若生產觀察顯示 material，優先檢討 F088 物化覆蓋率（根因） |
| `scope.deptCode` 為純顯示欄位，未來維護者可能誤讀為過濾依據 | 已有 `listOverviewScoped: false` 顯式標記 + `I-LISTOVW-NO-SCOPE-FILTER-01` grep 回歸測試雙重防呆 | 已緩解；tdd-implementation 實作時應在該欄位加註 code comment 提醒（比照 §6.2 之註記文字） |
| `resolveActorScope` 是否值得抽出共用私有方法（§6.3 step 2） | 非必要重構，僅為避免兩處重複判定式；不影響任何契約或不變量 | 留給 tdd-implementation 依實作時之程式碼整潔判斷，非本 AD 強制要求 |

---

## 12. 待裁決（Open Decisions）

**無殘留 open decision。** OQ-F120-A1~A4（§4.1~4.4）與 OQ-F120-B1（§4.5，2026-08-20 使用者拍板）已全數裁定完畢。§13.2（交 ui-ux-designer 之 U1~U3）維持原歸屬，非本 AD 範圍。

---

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 | 負責人 |
|---|---|---|---|
| 1.0 | 2026-08-20 | 初版。裁定 OQ-F120-A1（新增獨立端點）、A2（後端計算 + 匯入既有 `resolveCategoricalOperator`）、A3（`resolveListTotals` 共用方法）、A4（不新增快取層，附有界性論證）；對 OQ-F120-B1 提出零額外成本之具體實作路徑主張。新增 5 個 HOW 層級不變式（`I-LISTOVW-*`）。無 schema 變更。 | System Architect Agent |
| 1.1 | 2026-08-20 | 同日更新：使用者對 OQ-F120-B1 拍板（採納 G-1，F049 KPI 改精確和，`I-F120-03` 升級為嚴格相等）。新增 §4.5.1 明確處理嚴格相等之邊界案例——區分「全數物化值」（無條件成立）與「存在 fallback」（雙端估算皆成功時成立；timeout 分歧時之短暫不一致由既有 AC-LIST-10 / BR-7 降級語意涵蓋，非新失效模式）。新增不變式 `I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01`。§3 / §8 / §12 同步更新，§12 open decisions 清空。**F049 spec / code 本輪未變動**（spec-writer 範疇）。A1~A4 與 §6 端點契約無變化。 | System Architect Agent |
| 1.2 | 2026-08-20 | 同日再更新，回應 team lead 兩項要求：(1) 欄位命名裁決——B1 新增欄位正式定名為 **`orgMonthTotal`**（非 v1.1 之草案命名；spec-writer 查證 F049 v2.1 後之裁定，理由：prototype `orgMonthTotal` 本即精確和 / 與既有前端變數同名 / 命名族系一致），§4.5 / §9 / §11 全數同步改名。(2) §4.5.1 全面改寫，給出可直接轉譯為斷言的精確條件——定義 `excluded(response)`（該回應 `STAGE0_LIST_ESTIMATE_PARTIAL` 對應之 listNo 集合），證明 `excluded(A)=excluded(B) ⟹ orgMonthTotal=totalEstimatedCount`；論證此條件於**測試環境下恆成立**（mock/fixture 對兩次呼叫一致），故**明確指示 test-generator：TC-184-07 應無條件斷言嚴格相等**，不寫成依執行期狀態分支的條件式；生產環境限定之窄窗口改列 §11 風險表（非測試風險）。新增「月層級 vs 月層級（跨端點，嚴格相等）」與「月層級 vs 逐日和（F049 v2.1 既定容差，非本節範圍）」對照表避免混淆。§11 移除「B1 未拍板」列，改列已裁決狀態 + 生產環境殘留窗口之獨立風險列。§3 / §8 同步更新欄位名與條件描述。§10 檔案異動清單、§4.1~4.4（A1~A4）、§6 端點契約皆無變化。 | System Architect Agent |
