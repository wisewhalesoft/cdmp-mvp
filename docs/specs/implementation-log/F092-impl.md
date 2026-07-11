---
type: implementation-log
feature_id: F092
feature_name: Stage 1 完整鏈 Dry-run 精確估算（Stage 1 精確化 Phase 3）
status: complete
last_updated: 2026-05-26
---

# F092: Stage 1 完整鏈 Dry-run 精確估算 — 實作日誌

## 摘要

將 per-list 估算（`Stage0EstimateService.estimateListCount`）由 F049 v1.2「欄位篩選版 COUNT」
升級為「完整 Stage 1 篩選鏈唯讀 dry-run」，與月名單分派共用同一 `executeStage1Chain`（dryRun:true），
使 estimate ≡ 月名單分派 Stage 1 案件數（DP-AD23-1 完整鏈精確模式）。未 fork Stage 1 邏輯。

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F092-DR-001 | estimateListCount dry-run 不寫入 ob_pool_data_list（save/insert/delete spy=0、count 不增） | PASS |
| TS-F092-DR-002 | dry-run 不建立 assignment_run / snapshot | PASS（covered — chain dryRun:true 路徑完全不觸及 run/snapshot repo；service 亦未注入該 repo） |
| TS-F092-DR-003 | dry-run cases=undefined、count 仍有值 | PASS |
| TS-F092-DR-004 | estimateListCount 內部 dryRun:true 呼叫、workdt=WORKYM+'01' | PASS |
| TS-F092-EQ-001 | 全規則名單 dry-run ≡ 月名單分派（真實 PG） | DEFERRED（本專案無 PG TestContainer；以 EQ-001-SQLITE 子集替代） |
| TS-F092-EQ-001-SQLITE | 同名單 dry-run count === 月名單分派 cases.length（含 month_cnt + 去重，SQLite 真 chain） | PASS |
| TS-F092-EQ-002 | EMPTY_CONDITIONS → count=0、skipped、skipReason | PASS |
| TS-F092-EQ-003 | 去重表為空 → 同步退化（dry-run === run） | PASS |
| TS-F092-EST-001 | 路徑 A condition_payload → 完整鏈 dry-run COUNT | PASS |
| TS-F092-EST-002 | 路徑 B condition_payload=null → 完整鏈 dry-run | PASS |
| TS-F092-EST-003 | EMPTY_CONDITIONS → count=0（HTTP 200，不拋例外） | PASS |
| TS-F092-EST-004 | timeoutMs=0 → STAGE0_ESTIMATE_TIMEOUT | PASS |
| TS-F092-EST-004b | chain 永不 resolve → race timeout → STAGE0_ESTIMATE_TIMEOUT | PASS |
| TS-F092-UPG-001 | Stage 0 試算頁 total 完全來自 API count（前端值流，無寫死） | PASS（web） |
| TS-F092-UPG-002 | total 升級後 ≤ 升級前（語意 regression guard，非寫死） | PASS（UPG-001 同案件涵蓋 + 後端 EQ-SQLITE 證明去重/month_cnt 後較少） |
| TS-F092-UPG-003 | F088 物化來源升級（approve→ready hook 呼叫升級後 estimateListCount） | PASS（stage-action F086 案件，hook 對 count 內部算法不敏感） |
| TS-F092-UPG-004 | F088 物化失敗不阻擋 approve（best-effort） | PASS（stage-action F086 best-effort 案件） |
| TS-F092-RG-001 | 舊欄位篩選版 buildPoolCountQuery / getCount() 路徑已移除（fs+regex guard） | PASS |
| TS-F092-RG-002 | F049 BR-6 / F049-test EST-010 語意矛盾標注 | 待下游（見下方「需主流程確認」） |
| TS-F092-RG-003 | Stage 0 試算頁「上界」UI 文案（選填升級通知） | SKIP（spec §7 非強制；prototype 30-stage0-estimate.html 版面未新增說明文字 → 不執行） |

### 測試套件執行結果

- **F092 新案例**：`stage0-estimate-dryrun.service.spec.ts`（12 tests，1 skipped=EQ-001 DEFERRED）+ `stage0-estimate-dryrun.regression.spec.ts`（5 tests）→ 全綠。
- **既有 stage0-estimate.service.spec.ts**：38 tests 全綠（更新 3 個 estimateListCount 案例預期，見下）。
- **無迴歸（直接相關套件）**：assignment-list + stage1 + pipeline(.service/-stage1-dynamic/-v2) + engine-target-load + stage-action = **391 passed / 1 skipped**（22 test files）。
- **Web**：stage0-estimate-page.test.tsx + ready-summary-list-page.test.tsx = **27 passed**。
- **全套 api（`npx vitest run`）**：1706 passed / 14 failed / 68 skipped。**14 failed 全為 pre-existing 且與 F092 無關**（已 `git stash` 還原我的變更後驗證同樣 fail）：
  - `assignment-run-report.*` / `assignment-run-snapshot.*`：SectionChiefScopeService DI（ObEmphireRepository）— 與 F092 無關。
  - `target-table-schemas` / `target-table.service`（ETL customer_core 欄位數）、`*-executor`（extraction-task 分頁 SQL）— 與 F092 無關。

## 變更檔案清單

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| apps/api/src/modules/assignment-list/stage0-estimate.service.ts | modified | estimateListCount 升級為完整鏈 dry-run；注入 ObPoolDataList repo；新增 deriveWorkdt；移除 buildStage1WhereConditions import + buildPoolCountQuery（換為 dryRunChainCount） |
| apps/api/src/modules/assignment-list/assignment-list.module.ts | modified | TypeOrmModule.forFeature 加入 ObPoolDataList（去重查詢 repo） |
| apps/api/src/modules/assignment-list/__tests__/stage0-estimate-dryrun.service.spec.ts | new | F092 DR / EQ / EST 案例（SQLite in-memory + spy） |
| apps/api/src/modules/assignment-list/__tests__/stage0-estimate-dryrun.regression.spec.ts | new | F092 RG-001 fs+regex 靜態 guard |
| apps/api/src/modules/assignment-list/__tests__/stage0-estimate.service.spec.ts | modified | buildModule 註冊 ObPoolDataList entity + cleanup；3 個 estimateListCount 案件補 month_cnt:1（反映升級後 MONTH_CNT 期別過濾） |
| apps/api/src/modules/assignment-stage/__tests__/stage-action.service.spec.ts | modified | F086 物化 hook 兩案件加 F092 AC-6（UPG-003/004）交叉引用註解（行為不變） |
| apps/web/src/pages/assignment/__tests__/stage0-estimate-page.test.tsx | modified | 新增 TS-F092-UPG-001（Stage 0 total 完全來自 API count、每日件數依 total 重算、無寫死 9500） |

## estimateListCount 改法關鍵 diff（service）

```ts
// import：以 namespace import 引用 chain（與月名單分派同源；使 vi.spyOn(chainModule,'executeStage1Chain') 可攔截）
import * as stage1Chain from '@/modules/assignment/stage1/stage1-filter-chain';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
// （移除）import { buildStage1WhereConditions } ... ← 不再於 service 直接用

// constructor：新增 repo 注入
@InjectRepository(ObPoolDataList)
private readonly poolDataListRepo: Repository<ObPoolDataList>,

// estimateListCount：countPromise 改呼叫 dryRunChainCount（保留既有 404 / timeoutMs<=0 / race timeout）
const countPromise = this.dryRunChainCount(def);

// dryRunChainCount：完整鏈 dry-run（取代 buildPoolCountQuery）
private async dryRunChainCount(def: ObListDefinition): Promise<number> {
  const workdt = this.deriveWorkdt(def.project_workym);
  const result = await stage1Chain.executeStage1Chain(
    def, workdt, this.poolRepo, this.poolDataListRepo, { dryRun: true },
  );
  // warning log；result.skipped（EMPTY_CONDITIONS）→ result.count 已為 0
  return result.count;
}

// deriveWorkdt：PROJECT_WORKYM('YYYYMM') → new Date(y, m-1, 1)（同 pipeline parseWorkdt）；缺值退化為當前月
```

## 唯讀 guard 驗證

- TS-F092-DR-001：spy `poolDataListRepo.save/insert/delete` 全 0 次、estimate 前後 `count()` 不變（0→0）。
- DR-002（assignment_run / snapshot）：`Stage0EstimateService` 根本未注入 run/snapshot repo；`executeStage1Chain` dryRun:true 路徑亦不接觸該表（已於 pipeline F091 測試保證寫入僅在 dryRun:false）。
- 唯讀本質來自 `executeStage1Chain` dryRun:true 僅 SELECT（撈必要欄位於應用層 filter，回 `count`、`cases=undefined`），與月名單分派同一函式不同 flag。

## 更新的既有測試預期值

| 測試 | 升級前 | 升級後 | 原因 |
|------|--------|--------|------|
| stage0-estimate.service.spec.ts「AC-4 路徑 B 多值 IN + 欄位映射」 | count=3（pool 無 month_cnt） | count=3（pool 補 month_cnt:1） | 升級後套 MONTH_CNT 期別過濾（list 預設 period→month_cnt IN (1,31)）；補 month_cnt:1 讓鑑別維持於欄位篩選 |
| 「AC-4 路徑 A categorical 多值 IN」 | count=2 | count=2（pool 補 month_cnt:1） | 同上 |
| 「TS-F049-EST-007 路徑 B prod_kind='01\$\$02'」 | count=3 | count=3（pool 補 month_cnt:1） | 同上 |

> 註：未動 buildStage1WhereConditions 純函式群組（TS-F049-EST-001~008，直接 import composer，不經 service），預期值不變。

## 架構決策（spec 邊界內）

- **namespace import 引用 chain**：service 以 `import * as stage1Chain` 後 `stage1Chain.executeStage1Chain(...)` 呼叫，
  使 unit test `vi.spyOn(chainModule,'executeStage1Chain')` 能攔截內部呼叫（具名 import 在 Vitest/ESM 下無法 spy）。
  與 pipeline service（具名 import + 真 chain，不 spy）不衝突。
- **循環依賴**：依 AD-E07-23 §23.5，`executeStage1Chain` 為「接受 repo 參數的純函式」（非 Injectable），
  Stage0EstimateService 僅多注入 ObPoolDataList repo，無新增模組 import，無循環。
- **workdt 推導**：以 `def.project_workym` → `new Date(y, m-1, 1)`（本地時間，同 pipeline parseWorkdt）；
  缺值退化為當前月份（dry-run 去重視窗仍可算，不阻擋估算）。
- **EQ-001 真 PG 全規則一致性**：本專案未裝 PG TestContainer package；以 SQLite in-memory 跑真實
  `executeStage1Chain` 之 dryRun/run 子集（EQ-001-SQLITE，含 month_cnt + 去重）驗證同鏈一致性，
  全規則特殊 DELETE PG 版標 DEFERRED（與既有 F091 / advisory-lock 決策一致 — 真 PG 案例標 DEFERRED + staging 手動驗證）。

## 前端

- F049 Stage 0 試算頁 + F088 卡片之 API 契約（`GET .../estimate` → `{ listNo, count }`；`estimateCases`）**不變**，
  僅 `count` 數值語意更精確 → 前端**無需改 code**。
- 既有 TS-F049-V13F-001/002/005（total 來自 count、無寫死 9500）已是 UPG-001/002 值流覆蓋；
  另補 TS-F092-UPG-001 明確標注 F092 覆蓋（count=8200 → KPI 8,200 + 每日件數 round(50/1000×8200)=410）。

## 需主流程 / 下游 agent 確認之處

1. **F049 BR-6 / F049 §5.2 / AC-4 spec 正文待 spec-writer 更新**（F092 §11 + RG-002）：
   升級後「估算為條件符合上界、實際更少」之描述與新行為矛盾（現為「≡ 月名單分派」）。
   F049-test.md TS-F049-EST-010 預期值「≈241,978（欄位篩選版）」亦過時 —— 完整鏈後應 ≤ 該值（去重 + month_cnt + 特殊 DELETE）。
   **本輪未改 F049 / F088 spec 正文與 F049-test.md**（屬 docs/specs 與 docs/test-specs，非 tdd-implementation 邊界；
   F092 spec §11 已明列待 spec-writer 處理）。建議下一輪 spec-writer 同步修 F049 BR-6 + F088 BR-10 + F049-test EST-010 預期值。

2. **F088 BR-10 estimateCases 物化來源 spec 描述**：同上，COUNT 來源已升級為完整鏈 dry-run，spec 文字待 spec-writer 補註。

3. **EQ-001 全規則精確一致性**：需在 staging/dev 真實 PostgreSQL 環境，以同一名單 dry-run vs 月名單分派實跑驗證
   （可作為 F091 §13「部署前 dry-run 驗證」工具）；CI 無 PG TC 故此案例自動化標 DEFERRED。
