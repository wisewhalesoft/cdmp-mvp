---
type: implementation-log
feature_id: AD-E07-43-P5g
feature_name: MSSQL 全面遷移 P5g — ETL target_load ATOMIC 資料完整性修法（交易包裝，PG+MSSQL 雙引擎）
status: complete
last_updated: 2026-07-08
---

# AD-E07-43 P5g：ETL target_load ATOMIC 交易包裝修法 — 實作紀錄

> 對應 AD-E07-43 v1.1 §7（ATOMIC 資料完整性風險）之架構師推薦方案 **(a) 交易包裝**、新增不變式
> **I-ETL-ATOMIC-LOAD-01**、測試設計 `AD-E07-43-P5g-test.md`（53 cases）。使用者裁定「切換前必做」。
> 承 P5b 之凍結清單正式解凍：本輪實際修改 `target-load-handler.ts`（PG）與
> `target-load-handler-mssql.ts`（MSSQL）兩檔，加交易保護。**成功路徑行為不變、僅加交易保護**。

## 一、核心修法（I-ETL-ATOMIC-LOAD-01）

`target_load` 三條寫入路徑之「破壞性陳述式（TRUNCATE/DELETE）／UPDATE + 其後 INSERT」現包在**單一交易**：

| 路徑 | 修法前 | 修法後 |
|---|---|---|
| **fullMode**（4 表） | `TRUNCATE` 先提交 → 單句 `INSERT`（失敗不回滾 TRUNCATE） | `startTransaction` → `TRUNCATE` → `INSERT` → `commit`；INSERT 失敗 → `rollback`（TRUNCATE 復原） |
| **partition_replace**（ob_pool_data_list） | `DELETE WHERE partition` 先提交 → 單句 `INSERT` | 交易包 `DELETE`+`INSERT`；INSERT 失敗 → `rollback`（DELETE 復原、分區既存列保留） |
| **UPSERT**（customer_core） | PG：單句 `ON CONFLICT`（天生原子）；MSSQL：兩段式 `UPDATE`+`INSERT WHERE NOT EXISTS`（**無交易保護、部分套用風險**） | 兩引擎皆包交易；MSSQL 之 UPDATE 成功+INSERT 失敗 → `rollback`（UPDATE 復原、不停留在不一致中間態） |

失敗語意不變：錯誤仍以原有 `fullMode INSERT 失敗：…` / `partition_replace DELETE 失敗：…` / `UPSERT 失敗：…`
包裝訊息拋出，`tl1.status==='failed'`、`errorMessage` 完整，呼叫端可觀察性未因交易包裝而劣化（TXNCORE-005/006）。

## 二、決策關卡（GATE / SCOPE）與理由

### GATE-001：交易管理位置 =「handler 內自行管理」（handler-only）
交易由 `TargetLoadHandler(-Mssql)::execute()` 內部 `startTransaction`→…→`commit`/`rollback` 自行管理，
**不改 `pipeline-runner.ts` / `node-dispatcher.ts`**。理由：
- 交易範圍天然收斂於 target_load 節點之 clear+insert（唯一需要原子性的節點），非整條 pipeline，避免長交易鎖表。
- `pipeline-runner.ts` 為 PG/MSSQL/sqlite 三引擎共用之泛用 DAG 執行器；不動它可避免波及所有 pipeline，風險最小。
- 黑盒驗收（SCOPE-001 `isTransactionActive`）兩種實作位置皆須通過；handler-only 是最窄、最低風險者。
→ STATIC-002 驗證：`pipeline-runner.ts` / `node-dispatcher.ts` 全檔無 `startTransaction/commit/rollback`（未改）。

### GATE-002：isolation level = 未顯式指定（沿用 driver 預設 READ COMMITTED）
不呼叫 `startTransaction(isolationLevel)` 之參數版，沿用 PG/MSSQL 預設 READ COMMITTED（§7.2 論證前提）。
**明確不指定 READ UNCOMMITTED**（會使中間態對外可見、違反不變式效益基礎）→ GATE-002 靜態守門。

### GATE-003：Harness 全數沿用（不新建基礎設施）
`connectMssqlP5b`（CDMP_P5B）/ P4d `connectMssql`（CDMP_TEST，customer_core）/ p5b-eqpg `P5B_PG_DB`（PG degradable）三者直接複用，無新增 docker 服務或資料庫。

### GATE-004：暫存表（enriched `##`/PG TEMP、dedup）建立時機 =「交易外」
enriched 暫存表與去重暫存表於 `startTransaction` **之前**建立；交易只包 clear+insert。理由：
- 交易範圍最小化（SCOPE 要求）。
- 真庫實證（見下 §三 PROBE-D）：MSSQL `##` 全域暫存表於交易開始前建立，交易內可正常 `SELECT`，且 rollback 後仍存在、可由既有 `finally` 之 `dropMssqlTempTableIfExists` 正常清理。
- PG 側 `CREATE TEMP TABLE` 於 autocommit 下先提交、交易 rollback 不影響其存在；既有 `DROP TABLE IF EXISTS` 清理不受影響。

### SCOPE-005（🔴 7.8M 列規模決策，不臆測）：**維持現行單條 `INSERT…SELECT`（選項 a）**
- 現行架構本就是**單條** `INSERT…SELECT`（In-DB 搬移、無 bind 參數、不受 65535 上限約束）。交易包裝**不改變 INSERT 本身的寫入量體**，只是不讓 TRUNCATE/DELETE 單獨先提交——交易額外持有的僅是「TRUNCATE/DELETE 到 INSERT 之間」原本就連續執行的極短間隙。
- 交易鎖持有時間 ≈ 原本單句 INSERT 的執行時間（fullMode 對 7.8M 列本就是一次大 INSERT），交易包裝的邊際成本是 BEGIN/COMMIT 的微秒級開銷（SUCC-006 小量佐證：ob_calendar 端對端 157ms 級）。
- **未改為分批**：分批會引入「部分批次已提交」與 I-ETL-ATOMIC-LOAD-01「INSERT 失敗須完整回滾」的直接衝突（除非「全批同一交易、僅最終 commit」，但那與現行單句語意等價、無收益）。
- **真實 7.8M 規模之交易日誌／鎖行為未在本輪以生產級資料量測**（測試用小 fixture）。**風險記錄**：單一超大交易對 SQL Server 交易日誌（`ldf`）成長與鎖升級（lock escalation → 表級 X 鎖）之壓力，屬本修法將「TRUNCATE 提交後的短暫可見空窗」轉為「INSERT 期間的表級鎖持有」的權衡；此權衡與 ISO-002 之 Read Committed 鎖行為（見 §四）同源。**此為正確性優先於效能的既定取捨**（架構師 §7.3 已裁定 (a) 為必要立即修法），非兩難、不阻擋 DoD；生產切換前建議以真實資料量測交易日誌成長與鎖等待，若構成問題再評估 (c) 前置驗證或分批 commit 之 hardening（另立任務）。

## 三、關鍵未驗假設之真庫實證（勿臆測）

以獨立 probe（真實 MSSQL / CDMP_P5B，執行後刪除）驗證，結論直接支撐上述設計：

| Probe | 結論 |
|---|---|
| **TRUNCATE 交易回滾** | ✅ MSSQL `TRUNCATE TABLE` 於顯式交易內可回滾（seed 3 列 → BEGIN → TRUNCATE（inside=0）→ rollback → 3 列復原）。T-SQL TRUNCATE 為交易性（不同於 MySQL）。此為方案 (a) 對 fullMode 成立之根本前提。 |
| **XACT_ABORT OFF（預設）失敗後狀態** | 失敗 INSERT 後 `isTransactionActive===true`（交易仍活、可提交狀態）→ catch 內 `rollbackTransaction()` 有效、既存列保留。 |
| **XACT_ABORT ON** | `rollbackTransaction()` 不拋錯、資料同樣保留。→ **結論：XACT_ABORT ON 對正確性非必要**，且會污染連線池化之連線狀態（SET 為連線層級），故**不採用**；統一以「顯式 rollback」達成兩引擎一致語意。 |
| **`##` 全域暫存表 × 交易** | 交易開始前建立之 `##` 表，交易內 `SELECT` 可見（SCOPE-006）；rollback 後仍存在、可 `DROP`（支撐 GATE-004「交易外建立」+ 既有 finally 清理）。 |

## 四、ISO-002/003 — MSSQL 並行讀者可見性（架構師 §7.2 之 MSSQL 精確化）

雙連線手動編排（連線 A `BEGIN`→`TRUNCATE`→未提交；連線 B 同時 `SELECT COUNT(*)`）真庫實測：

- **結果 = 分支 (b)（鎖based，符合 `docker/mssql-init.sql` 無 RCSI 之推測）**：連線 B 被阻塞 **~712ms**（直到連線 A `COMMIT` 才返回），返回 `count=5`（**永不讀到空表**）。
- **架構師 §7.2 之 MSSQL 版精確化（ISO-003 記錄性，交 architect/業務）**：MSSQL 標準 Read Committed（無 `READ_COMMITTED_SNAPSHOT`）下，其他 session 於載入期間**不會讀到空表，但會被短暫阻塞等待**（而非 PG MVCC 之「立即讀到舊資料、無感知」）。核心論證（不會讀到空表）成立，但「等待」是月名單分派排程/其他查詢可感知之體感差異。
- **與既有效能基準之張力（供業務評估，非本文件裁定）**：project memory 記載「月名單分派改 worker 抽離後 API 8–34ms」。ETL 全量載入期間，觸及同一被載入表的並行查詢會阻塞至該表 INSERT 交易 commit 為止；小 fixture 為次秒級，7.8M 列規模之阻塞時間需以真實資料量測（見 SCOPE-005 風險記錄）。若阻塞達秒級且業務不可接受，可評估對 CDMP_P5B/生產庫啟用 `READ_COMMITTED_SNAPSHOT`（使 MSSQL 行為對稱 PG，讀者立即讀舊快照不阻塞）——此為獨立 DB 設定決策，記錄供 architect/業務參考。

## 五、CLEANUPTXN — catch 先 rollback 再 re-throw（MUST-FIX）

- 兩引擎 catch 皆先 `if (isTransactionActive) rollbackTransaction()` 再 re-throw。**PG 專屬風險**：交易中止會毒化連線（後續語句被拒直到 `ROLLBACK`），若未先 rollback，`pipeline-runner` 外層 `cleanupAll(queryRunner)`（DROP 上游暫存表）會連帶失敗、使 `run()` 拋錯而非正常回傳 `tl1 failed`。→ CLEANUPTXN-001（PG degradable）以「run() 正常回傳 + tl1 failed + 資料保留」為 rollback 確實被呼叫之黑盒證明。
- **MSSQL 側**（CLEANUPTXN-002/003）：真庫實測 TXNCORE 失敗後 `tempLeakCount==0`——handler 既有 `finally`（清自身 `##`）+ `cleanupAll`（清上游 `##`）於 rollback 後皆成功執行，連線未毒化。**兩引擎一致地顯式 rollback（正確性不依賴引擎寬容度）**。
- **CLEANUPTXN-004（記錄性，不擴大範圍）**：PG 版 `target-load-handler.ts` 本就無對稱 `finally` 清理自身 `tempTable`/`dedupTable`（既有缺口、非本輪引入）；交易 rollback 後這些 PG session-scoped TEMP 表殘留至連線釋放時自動回收（測試每次 fresh queryRunner + release，無實際洩漏）。不在本輪擴大修復，記錄供未來獨立任務。

## 六、範圍擴張說明（★發現 1，UPSERTATOMIC-003）

**I-ETL-ATOMIC-LOAD-01 之不變式文字僅列 fullMode / partition_replace 兩路徑，未明確涵蓋 customer_core UPSERT 兩段式路徑。** `target-load-handler-mssql.ts` 之 UPSERT 為 `UPDATE…FROM` + `INSERT…WHERE NOT EXISTS` 兩段獨立陳述式，兩者間同樣無交易保護——若 `UPDATE` 成功但 `INSERT` 失敗，會產生「既有列已更新為新值、但本應新增的客戶列缺失」之不一致中間態（同一「多陳述式操作缺乏交易保護」根因家族）。PG 版 UPSERT 為單句 `ON CONFLICT` 天生原子、不受影響。

本輪基於「**同一 handler、同一修法機制**」原則主動將 UPSERT 路徑一併納入交易保護（非另開新任務），並於此明確標記此範圍擴張。**建議 architect 後續修訂 I-ETL-ATOMIC-LOAD-01 正式文字，將涵蓋範圍擴大至「target_load 之所有多陳述式寫入路徑（含 customer_core UPSERT 兩段式）」。**

## 七、IMPACT-003 — P5b 既有 ATOMIC 斷言之翻轉（防誤判回歸）

P5b `p5b-e2e.mssql.spec.ts` §六 ATOMIC-001~004 原斷言「分支 A（資料遺失、count=0）」，與本輪修法後之正確行為（分支 B、資料保留）直接矛盾。**採「原地更新斷言」**（IMPACT-003 二擇一）：
- ATOMIC-001/002/003：`expect(count).toBe(0)` → `toBe(3)`（既存 3 列保留）。
- ATOMIC-004：`etl_load` 分區 `toBe(0)` → `toBe(3)`（DELETE 回滾）；他分區 `toBe(1)` 不變。
- 更新 describe/it 標題與註解為「P5g 修法後＝分支 B（資料保留）」，console.log 補「+rollback」。
- ATOMIC-005 交叉引用改指 `p5g-pgtxn.spec.ts`。
另同步 `p5b-static.mssql.spec.ts` STATIC-004：解除 `target-load-handler-mssql.ts` 之凍結守門（本輪正式解凍），僅保留 `pipeline-runner`/`node-dispatcher` 之凍結（handler-only 決策）。P5b impl log 之歷史 probe 結論（分支 A）為當時真實狀態，保留不改。

## 八、影響面（IMPACT-001/002/004）

- **6 條 target_load pipeline 全數受影響**（IMPACT-001 靜態核對 `etl-pipelines.json`：ob_arreturndf_min_cap / ob_calendar / ob_emphire / ob_pool_data〔fullMode ×4〕+ ob_pool_data_list〔partition_replace〕+ customer_core〔UPSERT〕），無第 7 條遺漏。
- **核心異動點 = 兩 target-load handler**；`pipeline-runner.ts` / `node-dispatcher.ts` 不改（GATE-001 handler-only）。
- **其餘 8×2 handler 未動**（STATIC-004）；交易站點 PG/MSSQL 各 3、對稱（STATIC-003）。

## 九、檔案異動

| 檔案 | 異動 | 說明 |
|---|---|---|
| `src/modules/etl/engine/handlers/target-load-handler.ts` | modified | PG：partition_replace / fullMode / UPSERT 三路徑加交易包裝 + catch 先 rollback |
| `src/modules/etl/engine/handlers/target-load-handler-mssql.ts` | modified | MSSQL：同三路徑加交易包裝（含兩段式 UPDATE+INSERT UPSERT）+ catch 先 rollback |
| `src/modules/etl/engine/__tests__/p5g-txn.mssql.spec.ts` | new | CDMP_P5B 端對端：TXNCORE-001..007 / SCOPE-001/003 / SUCC-001..006 / CLEANUPTXN-002/003 / ISO-002/003（17 tests） |
| `src/modules/etl/engine/__tests__/p5g-upsert.mssql.spec.ts` | new | CDMP_TEST customer_core 直驅：UPSERTATOMIC-001（UPDATE ok+INSERT fail→回滾）/ SUCC-003（2 tests） |
| `src/modules/etl/engine/__tests__/p5g-pgtxn.mssql.spec.ts` | new | PG degradable：PGTXN-001..006 / PGTXN-005 旗艦 / CLEANUPTXN-001（9 tests，6 gated skip） |
| `src/modules/etl/engine/__tests__/p5g-static.spec.ts` | new | 非 gated：IMPACT-001/002/004 / STATIC-001..004 / GATE-002 / REG-003 + 決策關卡文件守門（15 tests） |
| `src/modules/etl/engine/__tests__/p5b-e2e.mssql.spec.ts` | modified | IMPACT-003：ATOMIC-001..004 斷言分支 A→B 翻轉 |
| `src/modules/etl/engine/__tests__/p5b-static.mssql.spec.ts` | modified | STATIC-004：解凍 target-load-handler-mssql.ts（本輪正式解凍） |
| `src/modules/etl/__tests__/engine-target-load.spec.ts` | modified | mock-contract 修正：PG 版 `createMockQueryRunner` 補交易 API no-op stub（見下 §十三） |
| `src/modules/etl/engine/__tests__/p4c-mssql-unit.spec.ts` | modified | mock-contract 修正：MSSQL 版 `createMock` 補交易 API no-op stub |
| `src/modules/etl/engine/__tests__/p4c-target-load.mssql.spec.ts` | modified | mock-contract 修正：CLEANUP-MSSQL-002 之 proxy 委派真實 QueryRunner 之交易 API |

## 十、測試結果

| 群組 | 檔案 | 結果 |
|---|---|---|
| TXNCORE-001..007 / SCOPE-001a/b/003 / SUCC-001/002/004/005/006 / CLEANUPTXN-002/003 / ISO-002/003 | `p5g-txn.mssql.spec.ts` | **PASS（17，真實 MSSQL / CDMP_P5B）** |
| UPSERTATOMIC-001 / SUCC-003 | `p5g-upsert.mssql.spec.ts` | **PASS（2，真實 MSSQL / CDMP_TEST customer_core）** |
| PGTXN-006 / 前置 / 清理（非 gated）；PGTXN-001..005 / CLEANUPTXN-001（gated） | `p5g-pgtxn.mssql.spec.ts` | 非 gated PASS（3）；gated **SKIP（6，5433/P5B_PG_DB 不可達，degradable、不偽綠）** |
| IMPACT / STATIC / GATE-002 / REG-003 / 文件守門 | `p5g-static.spec.ts` | **PASS（15，CI 恆跑）** |
| P5b 全套（含翻轉後 ATOMIC-001..004、STATIC-004） | `p5b-*.mssql.spec.ts` | **PASS（回歸不破，翻轉斷言綠）** |

- `npx tsc --noEmit -p tsconfig.build.json`：**乾淨（EXIT 0）**。
- 全量回歸：P4c/P4d/P5b/P5c ETL MSSQL 套件不回歸；成功路徑（SUCC 群組）證交易包裝不破壞乾淨路徑；sqlite/PG dispatcher 分流不變（REG-003）。

## 十一、UPSERTATOMIC-001 之真實可觸發路徑（未退化為測試替身）

測試設計提供「若找不到真實可觸發路徑則退化為 mock/stub」之決策關卡。**本輪找到真實可觸發路徑、未退化**：以「新客戶列之 `customer_type_code` 值超過 `varchar(2)` 長度（'XYZ'）」觸發 `INSERT` 截斷錯誤（`ghostGate` 只擋 NOT NULL、不擋長度溢位，故該列通過 gate 而於 INSERT 失敗）；既有客戶列之 `UPDATE` 值乾淨（'02'）故 UPDATE 成功。修法後兩段式同屬一交易 → INSERT 失敗回滾 → 既有列恢復 'OLD'/'01'、新列不存在。真庫實測通過。

## 十三、mock-contract 回歸修正（本輪 handler 契約擴張之連帶影響）

交易包裝使 `TargetLoadHandler(-Mssql)` 對 `queryRunner` 的**依賴契約擴張**：新增依賴
`startTransaction`/`commitTransaction`/`rollbackTransaction`/`isTransactionActive`（真實 TypeORM `QueryRunner`
皆具備，故生產路徑不受影響）。3 個以**不完整 mock queryRunner** 直驅 handler 的既有單元/整合測試因此
連帶失敗（真實系統契約 vs mock 缺口，非生產缺陷）——已修正 mock 使其忠實反映真實 `QueryRunner` 契約：

- `engine-target-load.spec.ts`（PG 版 `createMockQueryRunner`）+ `p4c-mssql-unit.spec.ts`（MSSQL 版 `createMock`）：補交易 API no-op stub（`startTransaction`→翻 `isTransactionActive=true`，commit/rollback→翻 false）。交易方法不進 `calls`，既有 SQL 生成斷言完全不變。
- `p4c-target-load.mssql.spec.ts` CLEANUP-MSSQL-002 之 `proxy`：交易 API 委派真實 `realQr`（真實 rollback，確保「強制 UPSERT 失敗後 ## 暫存表仍被 finally 清理」之斷言在交易語意下仍成立）。

修正後三檔全綠（engine-target-load 32、p4c-mssql-unit 37、p4c-target-load 28）。**未擴大範圍至非
target_load 之測試**；此為 handler 契約擴張之必要連帶修正，非新功能。

## 十二、偏差 / 未驗假設結果 / 待回報

- **PG 側交易測試 DEFERRED**：本機無 5433（postgres-test）且 dev PG（5432）依裁示全程唯讀勿寫 → PGTXN gated 全 skip（非偽綠，degradable）。PG 修法已落地（兩引擎對稱、STATIC-003）+ tsc 乾淨 + degradable 測試就緒，待專用 PG 庫（P5B_PG_DB）可用即可揭露 PG 側逐案實跑。PG「交易中止毒化連線 + rollback-before-rethrow」為既確立之 PG 語意，程式已正確處理。
- **XACT_ABORT ON 未採用**：真庫實證非正確性所需（見 §三），且污染連線池狀態；改以顯式 rollback 統一兩引擎語意。
- **ISO-002 結果 = 分支 (b)（鎖based 阻塞）**：已 §四 記錄，交 architect/業務評估月名單分派期間查詢阻塞可接受度（非本文件裁定）。
- **7.8M 列規模交易日誌/鎖行為未以生產級資料量測**：非兩難、不阻擋 DoD（架構師已裁定 (a) 為必要修法），記錄為切換前建議量測項（見 SCOPE-005）。
- **無新增依賴、無 git commit、未動記憶檔、未動 P5i/P5e**（守角色）。
