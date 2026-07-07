---
type: implementation-log
feature_id: AD-E07-41-P4-spike-2
feature_name: MSSQL ETL 引擎 `##global temp` 補救方案殘留風險驗證（P4-spike-2，去風險閘）
status: complete
last_updated: 2026-07-08
---

# AD-E07-41 P4-spike-2 — `##global temp`（選項 A）併發＋崩潰清理＋生命週期驗證結論

P4-spike-1（`75b6bb7`）證 `#local temp` 不跨 `queryRunner.query()` 存活（封鎖級），架構師裁示改用
`##global temp`（AD §1.3 選項 A），並要求「必須先通過 P4-spike-2 才可進入 P4a 大規模改寫」。
本 spike-2 在真實 MSSQL 容器（CDMP_TEST，localhost:1433，BIN collation）、透過 **TypeORM
`DataSource.createQueryRunner()`**（比照 `pipeline-runner.ts` 真實用法）實測選項 A 之殘留風險。

- 測試檔：`apps/api/src/modules/etl/engine/__tests__/mssql-temp-foundation-spike2.mssql.spec.ts`（7 tests，全綠，實跑非 skip）
- 先行落地之 production helper：`apps/api/src/modules/etl/engine/handlers/mssql/temp-table.util.ts`（僅 `dropMssqlTempTableIfExists`，AD §3.1 簽章；崩潰清理驗證直接呼叫此真實路徑，非測試檔另寫等價 SQL）
- tsc：`npx tsc --noEmit -p tsconfig.build.json` **乾淨（exit 0）**；另全專案 tsc 對本輪 2 個新檔 0 型別錯誤
- 併發/序列化：兩支 mssql spec `--no-file-parallelism` 合跑 16/16 全綠、無跨檔干擾
- 未改任何 handler、未動 production ETL 資料流；未 commit

## 🟢 總結論：P4-spike-2 全數通過 — 選項 A（`##global temp`）殘留風險已排除，可進入 P4-0 / P4a

兩項封鎖級閘（併發 isolation、崩潰清理）皆通過；生命週期實測結果正向佐證 I-MSSQL-TEMPTABLE-CLEANUP-01
之必要性。**無封鎖級發現，不需切換至選項 B（具名 staging 表）。**

## 四項驗證逐點結論

| 點 | 驗證項目 | 結論 | 關鍵實測輸出 |
|---|---|---|---|
| POINT1 | `##` 跨節點鏈存活（pipeline 樣態）+ tempdb 內省 | **PASS** | `##a→##b(SELECT INTO FROM ##a)→查詢` 全程 `OBJECT_ID` 非 NULL；`##b` COUNT=2；`tempdb.sys.columns` 內省得 `["id","memo"]`（依 column_id 序）；中文 `中古車商/其他` round-trip 正確 |
| POINT2 🔴 | 併發不撞名/不互汙（全域命名空間關鍵風險點） | **PASS（封鎖級閘通過）** | 兩個不同 logId pipeline 於**獨立連線池**真正並發（`Promise.all`）；名互異（`##etl_tmp_extract_<logId8>`）；A 只讀 `['A-2','A-3']`、B 只讀 `['B-2','B-3']`；反向交叉讀證明兩組 `##` 同時共存於共享 tempdb（並發真實重疊，isolation 純靠 logId 命名）；負向對照：同名跨連線建表拋「there is already an object named」 |
| POINT3 🔴 | 崩潰清理 + 冪等（真實 `dropMssqlTempTableIfExists`） | **PASS（封鎖級閘通過）** | 中途 `throw` 後 finally 呼叫 helper → `OBJECT_ID` 為 NULL；對「從未建立」及「已 drop」之 `##` 再 drop 皆 `resolves`、不報錯（`IF OBJECT_ID(...) IS NOT NULL` 防禦有效） |
| POINT4 | `##` 生命週期釐清（characterization） | **PASS（實測記錄）** | 見下方「生命週期實測」 |

## `##` 生命週期實測（POINT4 — CLEANUP-01 之直接佐證）

| 情境 | 實測結果 | 意涵 |
|---|---|---|
| **`QueryRunner.release()` 後**（連線歸還池、session 續存） | **`##` 仍殘留 = true**（`[P4-01] ## 於 QueryRunner.release() 後是否殘留 = true`） | 池化 release **不**結束建立 session → `##` 於同一 worker 程序內可殘留至下一輪。**這正是不能只靠 SQL Server 隱性回收、必須顯式清理的原因。** |
| **`DataSource.destroy()` 後**（池全關、建立 session 真正結束） | **自動回收 = true**（`[P4-02] ## 於 DataSource.destroy() 後是否已自動回收 = true`） | SQL Server 隱性回收確實存在，但**僅發生於 session 真正結束**、而非池化 release。 |

**結論**：`##global temp` 的隱性生命週期回收行為與官方文件一致（建立 session 結束＋無引用時自動 drop），
但在**連線池化**下，`release()` 不等於 session 結束，`##` 會殘留——故 **I-MSSQL-TEMPTABLE-CLEANUP-01
（成功/失敗兩路徑顯式 `dropMssqlTempTableIfExists`）為必要安全網，非冗餘**。顯式清理另實測可**跨連線生效**
（由另一 session 的 QueryRunner 對前一 session 建立的 `##` 執行 `IF OBJECT_ID(...) DROP TABLE` 成功）。

## 對 AD-E07-41 不變式的實證覆蓋

- **I-MSSQL-TEMPTABLE-GLOBAL-01**：`##` 跨節點鏈存活（POINT1）＋併發不撞名（POINT2）皆成立；命名沿用
  `makeTempTableName(nodeId, logId)` 僅前綴改 `##`，logId 唯一性為併發 isolation 之唯一依據（POINT2 負向對照證實）。
- **I-MSSQL-TEMPTABLE-CLEANUP-01**：POINT3（顯式清理有效＋冪等）＋POINT4（release 後殘留 ⇒ 需顯式清理）共同佐證其必要性與正確性。
- **I-MSSQL-TEMP-METADATA-01**：POINT1 內省對 `##` 適用（承 spike-1 結論）。

## 是否可進入下一子切片

**✅ 可啟動 P4-0（customer_core schema 補齊 §7）與 P4a（Handler 群組一）。** P4-spike-2 為 P4a 前的
強制去風險閘，已全數通過；選項 A 無殘留封鎖問題，不觸發切換選項 B。

### 交接 P4a 之注意事項（非阻擋）
1. `temp-table.util.ts` 目前**僅含** `dropMssqlTempTableIfExists`（spike-2 先行落地）；P4a 進場時以
   **additive** 方式補齊 `createMssqlTempTable` / `getMssqlTempTableColumns` / `countMssqlTempTableRows`
   （AD §3.1），**勿覆寫（Write 整檔）本函式**，用 Edit 追加。
2. 每個 handler 於成功與失敗兩路徑皆須呼叫 `dropMssqlTempTableIfExists`（建議統一收在 `pipeline-runner`
   層級 try/finally，或各 handler 自理），落實 CLEANUP-01——POINT4 已證此為必要非冗餘。
3. `INFORMATION_SCHEMA` 於 BIN collation 須大寫（承 spike-1 §5.5 / I-MSSQL-CATALOG-CASE-01），
   本 spike 未重複驗證（spike-1 META-01 已證）。

## Blocking Issues

- 無。兩項封鎖級閘（POINT2 併發、POINT3 崩潰清理）皆通過，選項 A 之殘留風險已排除。
