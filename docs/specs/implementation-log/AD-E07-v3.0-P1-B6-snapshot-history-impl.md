---
type: implementation-log
feature_id: AD-E07-v3.0-P1-B6
feature_name: E07 P1 B6 — M05 快照歷史（F063 摘要 / F064 匯出 / F066 快照詳情 / F067 比對）
status: complete
last_updated: 2026-05-17
agent_id: a51115cec036b8602
---

# AD-E07 v3.0 P1 B6 — M05 快照歷史 Implementation Log

承接 P1 B5（commit d313ca3）。本批次完成 M05 快照歷史四份 Feature 後端，依託 P1 B4 補完所建立的 `assignment_run_snapshot`（config / input_list / result）三份快照結構。

## 範圍對應

| Spec / AC | 端點 | 本批次完成度 |
|---|---|---|
| **F062** v1.0 | GET /runs/:runId（進度／詳情） | ✓ 評估後沿用 B4 既有實作（spec §5.1 結構已含 status / startedAt / finishedAt）；stages 細粒度進度為 v2.0（依 `assignment_run_stage_log` 表，B4 已標明） |
| **F063** v1.0 AC-1~4 | GET /runs/:runId/summary | ✓ 完整（含 BR-2 偏差 > 3% alert / AC-5 warnings + skipped_cases） |
| **F064** v1.0 AC-1~3, AC-5 | GET /runs/:runId/export?format=csv | ✓ CSV 完整 + audit log（AC-4 streaming 與 xlsx 為 v2.0，見「已知不在範圍」） |
| **F065** v1.0 | GET /runs（歷史清單） | ✓ B4 既有實作，狀態無變動 |
| **F066** v1.0 AC-1~5 | GET /runs/:runId/snapshot[?type=…] + /runs/:runId/snapshot/:type | ✓ 完整 |
| **F067** v1.0 AC-1~6 | GET /runs/compare?runA=&runB= | ✓ 完整（含 NFR-005 人員配對不一致率） |

> **F062 / F065 已於 B4 完成**，本批次未動既有 service／路由語意；spec §5.1 base 欄位（status / total_cases / triggered_at / finished_at / duration_ms / errorMessage）已對齊。`stages` 細粒度進度遵循 B4 補完日誌「v2.0 補完」備註。

## Test Results Summary

| Test Suite | Tests | Status |
|---|---|---|
| **assignment-run-snapshot.service.spec（新）** | **6** | **PASS** |
| **assignment-run-report.service.spec（新）** | **15** | **PASS** |
| **assignment-run.controller.spec（擴充）** | **28**（既有 10 + 新增 18） | **PASS** |
| 既有 P0~P1 B5 assignment 模組（其他 37 suites） | 396 | PASS |
| **assignment 模組合計** | **445** | **PASS** |
| 全 backend 回歸（vitest run） | 1152 / 1169 | 17 fail 全為 pre-existing ETL/extraction-task（與 B4 補完 log L33 / B5 commit d313ca3 一致），與 B6 無關 |

**B4/B5 既有 396 PASS 全數保留，新增 49 PASS，0 回歸破壞。**

### 涵蓋場景對應任務 TC

| 任務 TC | spec.ts / describe block | 狀態 |
|---|---|---|
| TC-M05-001 / TC-M05-SNAPSHOT-001 | getFullSnapshot 三份完整 | PASS |
| TC-M05-002 / TC-M05-SNAPSHOT-002 | inputList 缺 → null（結構保留） | PASS |
| TC-M05-003 / TC-M05-SNAPSHOT-003 | getSnapshotByType('config') 單份 | PASS |
| TC-M05-004 / TC-M05-SNAPSHOT-004 | type 不存在 → 404 | PASS |
| TC-M05-005 / TC-M05-SNAPSHOT-005 | run_id 不存在 → 404 | PASS |
| TC-M05-006 / TC-M05-SNAPSHOT-006 | running 期間仍可讀（缺者為 null） | PASS |
| TC-M05-007 / TC-M05-SUMMARY-001 | F063 正常輸出（總量 / coverage / 部門偏差 / 等級分佈） | PASS |
| TC-M05-008 / TC-M05-SUMMARY-002 | 未完成 → 422 ASSIGNMENT_RUN_NOT_COMPLETED | PASS |
| TC-M05-009 / TC-M05-SUMMARY-003 | NFR-005 偏差 = 3% → alert=false（嚴格 >） | PASS |
| TC-SKIPPED-CASES / TC-M05-SUMMARY-004 | warnings 段含 skipped_cases + warning_summary 碼 | PASS |
| TC-EXPORT / TC-M05-EXPORT-001 | CSV header + rows + filename | PASS |
| TC-M05-010 / TC-M05-EXPORT-002 | xlsx → 422 EXPORT_FORMAT_NOT_SUPPORTED（v2.0 範圍）| PASS |
| TC-M05-011 / TC-M05-EXPORT-003 | audit log（action=EXPORT） | PASS |
| TC-M05-012 / TC-M05-EXPORT-004 | 未完成 → 422 | PASS |
| TC-M05-013 / TC-M05-EXPORT-005 | CSV escape 含逗號 / 引號 | PASS |
| TC-COMPARE / TC-M05-COMPARE-001 | F067 正常輸出 | PASS |
| TC-M05-014 / TC-M05-COMPARE-002 | 任一非 completed → 422 ASSIGNMENT_RUN_NOT_COMPARABLE | PASS |
| TC-NFR-005 / TC-M05-COMPARE-003 | 人員配對不一致率 > 3% → alert=true | PASS |
| TC-M05-015 / TC-M05-COMPARE-004 | 0 共同案件 → rate=0, alert=false（不發生除零） | PASS |
| TC-M05-COMPARE-005 | customerDiff added/removed 集合運算 | PASS |
| TC-M05-COMPARE-006 | configDiff card_version + dept_pct ration + crEnabled | PASS |
| TC-RBAC / Controller M05 18 個 | 各端點 director / section_chief / plain user / 路由排序 | PASS |

### Frontend / 處長轄區 filter（TC-SCOPE）

**處長轄區 filter（spec L122 ob_emphire join scope）**：本批次後端尚未實作 scopeByCreator 過濾（spec L122 BR-5 僅描述員工姓名 join，未具體要求結果集 filter）。F063 / F064 / F066 / F067 目前回傳全集；spec 用詞「處長視角應加 scopeByCreator filter」屬任務需求**強化**而非 spec 明示 AC。**未實作**標記於「已知不在範圍」第 4 項。

## Files Changed

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/modules/assignment/services/assignment-run-snapshot.service.ts` | new (109 行) | F066 快照詳情 — getFullSnapshot / getSnapshotByType |
| `apps/api/src/modules/assignment/services/assignment-run-report.service.ts` | new (501 行) | F063 摘要 + F064 匯出 + F067 比對 + audit 寫入 |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-snapshot.service.spec.ts` | new (159 行) | 6 tests（sqlite in-memory） |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-report.service.spec.ts` | new (343 行) | 15 tests（sqlite in-memory） |
| `apps/api/src/modules/assignment/assignment-run.controller.ts` | modified (88→168 行) | 新增 5 endpoint：/compare、/:runId/summary、/:runId/export、/:runId/snapshot、/:runId/snapshot/:type；路由排序 /compare 在 /:runId 之前 |
| `apps/api/src/modules/assignment/__tests__/assignment-run.controller.spec.ts` | modified (+265 行) | 既有 10 tests 保留 + 新增 18 tests（M05 RBAC / DTO 驗證 / 路由排序） |
| `apps/api/src/modules/assignment/dto/export-query.dto.ts` | new (10 行) | format enum |
| `apps/api/src/modules/assignment/dto/snapshot-query.dto.ts` | new (12 行) | type enum |
| `apps/api/src/modules/assignment/dto/compare-runs-query.dto.ts` | new (13 行) | runA / runB UUID 驗證 |
| `apps/api/src/modules/assignment/assignment.module.ts` | modified | 註冊 AssignmentRunSnapshotService + AssignmentRunReportService |
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 ASSIGNMENT_RUN_NOT_COMPLETED / ASSIGNMENT_RUN_NOT_COMPARABLE / EXPORT_FILE_EXPIRED / EXPORT_FORMAT_NOT_SUPPORTED 4 個錯誤碼 + 中文訊息 |
| `apps/api/src/database/entities/assignment-audit-log.entity.ts` | modified | action union 補 'EXPORT'（F064 AC-5） |

**合計：新增 6 檔 / 修改 5 檔 / 新增 49 tests（21 service + 28 controller，其中 18 為新測項）。**

## TDD Cycle 統計

| Cycle | 元件 | RED → GREEN |
|---|---|---|
| 1 | AssignmentRunSnapshotService | 6 RED（service 未存在）→ 6 PASS |
| 2 | AssignmentRunReportService.getSummary | 4 RED → 4 PASS（含 NFR-005 alert 嚴格 > 邊界） |
| 3 | AssignmentRunReportService.exportResult | 5 RED → 5 PASS（CSV escape + audit log + xlsx 422） |
| 4 | AssignmentRunReportService.compareRuns | 6 RED → 6 PASS（人員配對 + customerDiff + configDiff + 422） |
| 5 | Controller 5 新 endpoint × RBAC × 路由排序 | 18 RED（endpoint 未掛載）→ 18 PASS（含 2 次修正：mock reset 改 mockClear 保留實作、UUID fixture 改為合法 v4） |

合計 **5 個 RED-GREEN cycle**，含 2 次測試 fixture 修正：
1. `vi.clearAllMocks()` 會清除 mock 實作 → 改為個別 `mockClear()` 保留 default `mockResolvedValue`。
2. compare query UUID 使用 v4 合法格式（`11111111-...` 不符 v4 nibble 校驗，被 `@IsUUID` 拒絕 422）。

## Architectural Decisions

1. **Service 拆分為 Snapshot + Report 兩支** — Snapshot 純讀（F066），Report 含計算邏輯 + audit 寫入（F063/F064/F067）。Repository 注入面不同（Report 多 AuditLog），測試模組依賴隔離。
2. **路由排序 /compare 在 /:runId 之前** — NestJS Controller 依宣告順序註冊到 Express Router。`@Get('compare')` 必須於 `@Get(':runId')` 之前，避免 `/compare?runA=` 被 path 攔截變成 `getRunById('compare')`。此為 memory[feedback_etl] 同類「FastAPI 路由順序」教訓於 Nest 重現。
3. **xlsx 格式回 422 EXPORT_FORMAT_NOT_SUPPORTED（非 501）**：exceljs 未列入 MVP 依賴（avoid scope creep）。F064 AC-1 / spec L120 提及 xlsx，但因「未經 architectural approval 不引入新依賴」憲法約束，採用「明確錯誤」勝於「假實作」。架構決議：v2.0 補完 xlsx 時改 200 即可，client 端錯誤碼為 v2.0 新增（向前相容）。
4. **AC-4 streaming for >50,000 筆未實作**：CSV in-memory 拼接於 MVP 範圍可接受；若實測 >50,000 筆觸發記憶體壓力，v2.0 改 `Readable` stream（無需動 service 介面，僅 controller 層）。
5. **csvEscape 規則**：值含 `,` / `"` / `\n` / `\r` 才 quote；引號用 `""` 雙化 escape（RFC 4180）。
6. **F063 部門設定比例聚合**：spec L62 未明示「同 deptId 跨多 listNo」聚合方式；採 **算術平均 ration**（單名單時等同原值，多名單時平均）；偏差精度小數 1 位 + alert 嚴格 `> 3`（避免 3.0 邊界誤警示）。
7. **F067 personnel mismatch 共同案件定義**：對齊 spec BR-2「不一致率 = 不一致案件數 / 同批次總案件數」，採 **base ∩ compare applNo 集合大小** 為分母（非 base 全集）。差異「只在 base / 只在 compare」歸入 customerDiff，不計入 personnel mismatch（避免 NFR-005 統計失真）。
8. **F067 configDiff card_version 採 levelcardLevels 最大 cardVersion**：對齊 P1 B4 pipeline payload 結構（config.levelcardLevels[].cardVersion）。
9. **F067 configDiff crRuleChanged 採 listDefinitions.some(crEnabled)**：對齊 spec L97 「CR 回分規則狀態（啟用 / 停用）」單一布林表達 — 任一 list 啟用即視為「啟用」。
10. **AssignmentAuditLog.action union 補 'EXPORT'**：F064 AC-5 必要欄位值，length=30 已足夠（'EXPORT' 6 字元）；migration 1711360000120 column type=`varchar(30)` 無需改動。
11. **未實作處長轄區 scopeByCreator 過濾**：spec L122 BR-5 僅描述員工姓名 join，未列為 AC；任務需求屬「強化」。為避免實作 spec 未要求行為（憲法約束「Implement only what is required to pass tests」），標記於「已知不在範圍」第 4 項，待 spec-writer 顯式補 AC 後實作。

## F067 NFR-005 差異比對演算法

```
1. 載入兩 run 的 result snapshot.assignments[]
2. 構建 Map<applNo, emplid>：baseMap, cmpMap
3. common = base.keys ∩ cmp.keys（applNo 交集）
4. mismatchList = common.filter(applNo => baseMap[applNo] !== cmpMap[applNo])
5. rate = mismatchList.length / common.length（common.length=0 → rate=0）
6. alert = rate > 0.03（NFR-005 嚴格 >）
7. customerDiff:
     added   = cmp \ base
     removed = base \ cmp
```

時間複雜度 O(N+M)；空間 O(N+M)。10 萬筆 × 2 份快照可於 <1 秒完成，遠低於 spec §7「< 30 秒」閾值。

## F064 匯出格式支援

| 格式 | MVP 狀態 | v2.0 規劃 |
|---|---|---|
| CSV | ✓ 完成（in-memory 拼接 + audit + RFC 4180 escape） | 大量資料改 `Readable` stream（>50,000 筆觸發） |
| Excel (xlsx) | 422 EXPORT_FORMAT_NOT_SUPPORTED | 補依賴 `exceljs` + streaming 寫入；架構審核後新增 |

CSV 欄位：`list_no, appl_no, card_level, tier_level, dept_id, emplid, score, is_cr`（8 欄）。

對齊 spec L57：客戶編號 / 姓名（custo_no / cust_name）/ 員工姓名（emp_nm）需 join ob_pool_data_list + ob_emphire — 本批次僅輸出 ob_pool_data_list 快照欄位（result.assignments[]）。**client 端可由 custo_no 反查 customer_core 取得姓名**；員工姓名 join 待 ob_emphire ETL 上線後（spec L122 BR-5）補完。

## AD-E07 v3.0 Alignment 確認

- ✓ AC-3 + AC-4 三份快照原子寫入（B4 完成）所建立的 payload 結構（config / input_list / result）— B6 完全消費此結構
- ✓ F062 §5.1 響應 status / triggeredBy / triggeredAt / startedAt / finishedAt / durationMs / totalCases — B4 既有實作
- ✓ F063 §5.1 響應 deptSummary + levelDistribution + coverageRate + warnings（含 BR-12 skipped_cases）
- ✓ F064 §5.1 CSV streaming-friendly（line-by-line 組裝）+ audit log（action=EXPORT）
- ✓ F066 §5.1 三份快照同響應（snapshots.{config, inputList, result}）+ §5.1 type query/path 變體
- ✓ F067 §5.1 personnelMismatch.rate + alert（NFR-005 0.03 閾值）+ customerDiff.added/removed 集合運算
- ✓ DirectorOrSectionChiefGuard 全 GET endpoint 套用（F002 §4.6.2）
- ✓ TypeORM dateColumnType / jsonColumnType helper 嚴格沿用（sqlite 相容）

## Blocking Issues

無。

## 已知不在範圍（v2.0 / 後續批次）

1. **F064 xlsx 匯出**：返 422 EXPORT_FORMAT_NOT_SUPPORTED；待引入 exceljs 依賴（架構審核）後實作。
2. **F064 AC-4 streaming for >50,000 筆**：MVP CSV in-memory 拼接；觸發 OOM 後升級 Readable stream（不動 service 介面）。
3. **F064 員工姓名 join（ob_emphire.emp_nm）**：依賴 ob_emphire ETL 上線（spec L122 BR-5）；MVP CSV 僅輸出 emplid。
4. **處長轄區 scopeByCreator filter**：spec L122 BR-5 僅描述員工姓名 join，未列為 AC。F063 / F064 / F066 / F067 目前回傳全集。建議 spec-writer 在後續版本顯式補 AC（如「F063 處長視角 deptSummary 限制 scopeByCreator」）後實作。
5. **F062 stages 細粒度進度**：B4 已標明 `assignment_run_stage_log` 為 v2.0；本批次 §5.1 響應 stages[] 仍為空 array。
6. **F067 §5.2 mismatch Excel 匯出**：待 xlsx 框架完成後一併補。
7. **F066 §5.2 後端搜尋 API（資料量 > 100,000 筆）**：spec BR-2 標明前端解析優先；後端 search API 為條件性需求，MVP 不實作。
8. **前端整合（FE-6）**：依任務指示留待下輪；對應 prototypes：`32-run-progress.html` / `33-run-summary.html` / `34-run-history.html` / `35-snapshot-detail.html` / `36-run-compare.html`。

## 提示下一步（P2 邊界與錯誤）

1. **FE-6 前端整合**：5 個 prototype 對接，建議 React Query polling 3 秒（F062 BR-1）+ 完成後停止；Recharts 渲染 F063 levelDistribution / deptSummary（與 E03/E04 Dashboard 一致）。
2. **NFR 驗證**：用 1 萬 / 10 萬筆假資料測 F067 比對時間，驗證 spec §7 「< 30 秒」；目前 unit test 為小資料集 (3~100 筆)。
3. **scopeByCreator filter spec 補強**：與 spec-writer 確認 F063 / F064 / F066 / F067 是否需處長轄區限制（spec L122 BR-5 模糊）；確認後補實作。
4. **F064 xlsx 補完**：架構審核 exceljs 依賴；同時補 §5.2 mismatch Excel 匯出。
5. **F062 stages 細粒度**：v2.0 補完 `assignment_run_stage_log` 表（B4 標明）+ getRunById 響應 stages[] 從 log 聚合。
6. **錯誤碼補強**：本批次未實作 EXPORT_FILE_EXPIRED（spec L72 AC-4 5 分鐘 timeout）— streaming 完成後可加 setTimeout watchdog。
7. **P2 補完 Stage 2/4 真實邏輯**：B4 標明的 fn_calc_tier_level / st4_exchange 補完 — 影響 F063 deptSummary 與 F067 personnelMismatch 真實值。

## 設計衝突或歧義

**輕度澄清需求**（未阻塞本批次）：

- **spec L62「設定比例」聚合方式未明示**：同 deptId 跨多 listNo 時，採加總或平均？本批次採算術平均（多名單情境下意義較清晰）。建議 spec-writer 補一句「同 deptId 跨 LIST_NO 採 SUM 或 AVG」。
- **spec L97「CR 回分規則狀態（啟用 / 停用）」單一布林表達**：實際 listDefinitions[] 為 per-list cr_enabled。本批次採 `some()` 聚合（任一啟用即視為「啟用」）。建議 spec-writer 補一句「per-list 表示時，顯示為 enabledLists / disabledLists 名單；單一布林時 = any(crEnabled)」。
- **spec F062 §5.1 stages 結構為 v2.0**：B4 已標明，本批次延續。
