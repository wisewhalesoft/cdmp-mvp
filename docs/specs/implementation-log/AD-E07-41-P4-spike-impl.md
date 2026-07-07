---
type: implementation-log
feature_id: AD-E07-41-P4-spike
feature_name: MSSQL ETL 引擎技術地基驗證（P4-spike，去風險）
status: blocked
last_updated: 2026-07-08
---

# AD-E07-41 P4-spike — 四項技術驗證結論

在真實 MSSQL 容器（CDMP_TEST，localhost:1433，BIN collation）、透過 **TypeORM `DataSource.createQueryRunner()`**
（比照 `pipeline-runner.ts` 真實用法，非 standalone `mssql` 套件腳本）實測。

- 測試檔：`apps/api/src/modules/etl/engine/__tests__/mssql-temp-foundation.mssql.spec.ts`（9 tests，全綠，實跑非 skip）
- tsc：`npx tsc --noEmit -p tsconfig.build.json` 乾淨（exit 0；本 spike 僅新增測試檔，未動 production 碼）
- 環境版本：TypeORM 0.3.x + `mssql`(tedious)（apps/api 既有依賴）

## 🔴 總結論：P4-spike 未達 DoD（封鎖級）— 需架構師裁示補救路線後方可進入 §9 各子切片

AD-E07-41 §1.1 / §3 之核心前提「**單一 QueryRunner 貫穿 ⇒ 區域暫存表（#local temp）可跨節點存活**」
在 TypeORM+node-mssql 下 **實測不成立**。以 `#local temp` 作為節點間資料傳遞介質的 CTAS 架構，無法照 AD 原設計搬到 MSSQL。

## 四項驗證逐點結論

| 點 | AD §2.1 項目 | 結論 | 關鍵實測輸出 |
|---|---|---|---|
| (a) | `SELECT ... INTO #temp` 跨多次 query 存活（COUNT=2） | **FAIL（封鎖）** | 見下方 FINDING |
| (b) | `information_schema.columns` 抓不到 #temp（地雷確認） | **PASS**（且發現 BIN 下須大寫） | `INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@0` → 0 列 |
| (c) | `tempdb.sys.columns`+`OBJECT_ID('tempdb..#temp')` 可靠內省 | **PASS（機制成立）** | 回 `["id","memo"]`，型別 `int`/`nvarchar`，依 `column_id` 序 |
| (d) | `DISTINCT ON`+`ctid` → `ROW_NUMBER()`+tie-breaker 改寫 | **PASS（SQL 邏輯正確）** | A→A-new、C→C-dated（NULL 最後）、B 並列取 MIN(_seq)、重跑一致 |

註：(c)(d) 的「機制/邏輯」本身成立，但 (d) 及 pipeline 多節點傳遞都依賴「暫存表跨 query 存活」，
故實務上仍被 (a) 的封鎖問題卡住（除非改用可存活的介質）。

## 封鎖級發現（FINDING — 已實測）

1. **連線其實是同一條**：連續 `queryRunner.query()` 的 `@@SPID` 恆定（例：56→56→56）→ 排除「連線池切換」為主因。
2. **#local temp 於「下一次 `.query()`」即消失**：`SELECT INTO #foo` 成功（CTAS 語法本身可行），
   但緊接的 `SELECT COUNT(*) FROM #foo` 拋 `Invalid object name '#foo'`。driver 於每次 request 之間重置 session 狀態
   （推測：node-mssql 連線池於 request 間 reset）→ session-local 暫存表被清除。
3. **即使 `startTransaction()` 亦無法補救**：交易內同一 SPID，`#tx` 仍於下一次 query 消失 →「包一層交易」不解決。
4. **對照組（證明是存活性、非語法/連線問題）**：
   - 單一 `.query()` 內多語句 batch（建表+計數同一 round-trip）→ 得 2（存活）。
   - `##global temp` 跨多次 `.query()` **可存活**（落 tempdb、instance-scoped、不受 session reset 影響）。

## 附帶通用結論（P4a 需採用）

- **`INFORMATION_SCHEMA` 在 BIN collation 下大小寫敏感**：小寫 `information_schema.columns` 直接拋
  `Invalid object name`；P4a 各 handler 的 catalog 查詢須改大寫 `INFORMATION_SCHEMA.COLUMNS`
  （現行 PG 碼為小寫，屬 §5.2 Pattern B 之外的額外方言修正點）。
- **暫存表內省（I-MSSQL-TEMP-METADATA-01）機制成立**：`tempdb.sys.columns` + `OBJECT_ID('tempdb..' + @0)`
  具名參數版可靠（對 `#` 與 `##` 皆適用）；`@0` 位置參數綁定與既有 `MssqlQueueService` 慣例一致。
- **中文 `N'…'` 於暫存表 round-trip 正確**（呼應 BIG5/BIN）。
- **dedup tie-breaker 改寫（§4.2）SQL 邏輯正確**：`SELECT IDENTITY(INT,1,1) AS _seq ... INTO` + `ROW_NUMBER() OVER
  (PARTITION BY k ORDER BY ts DESC, CASE WHEN ts IS NULL THEN 1 ELSE 0 END, _seq ASC)=1`；
  MSSQL `ts DESC` 本即 NULL 最後，`CASE` 鍵為可攜備援。

## 候選補救（REMEDY — 已取得可行性證據，待裁示；非本 spike 逕自定案）

| 選項 | 證據 / 說明 | 需留意 |
|---|---|---|
| A. `##global temp` | 已實測多節點鏈 `##a→##b→查詢` 全程存活；tempdb.sys.columns 內省與中文 round-trip 皆正常 | 全域命名空間（現行 `makeTempTableName` 已含 logId → 併發不撞名，僅前綴改 `##`，牴觸 I-MSSQL-TEMPTABLE-PREFIX-01 之 `#` 約定，需更新不變式）；生命週期（建立 session 結束且無引用即 drop）於連線池下需驗證；跨 session 可見（內部 ETL 影響小） |
| B. 具名實體 staging 表（專屬 schema，engine 顯式 CREATE/DROP，以 logId 為鍵） | 完全不依賴 driver session 語意，最穩健；對齊「顯式優於隱式」既有風格 | 成本較高（需管理 DDL 與清理）；改動幅度大於 AD 原 `#temp` 設計 |
| C. 停用 node-mssql 連線 reset | 保留 `#local temp` 設計最省事 | 未找到 TypeORM/node-mssql 乾淨的 per-request「不 reset」開關，可行性未證，風險高 |

## 建議

- 本 spike 已完成「去風險」職責：確認 AD §1.1 假設不成立，並縮小補救選項至 A/B（C 風險高）。
- 建議由 system-architect 裁示補救路線（傾向 **A ##global temp**：改動最小、已有存活/內省/中文/去重全套證據；
  或 **B 具名 staging 表**：最穩健），更新 AD-E07-41 §1.1/§3/§4 與不變式 I-MSSQL-TEMPTABLE-PREFIX-01
  後，再啟動 §9 P4-0 / P4a…各子切片。**在裁示前不逕自改採任一方案、不動任何 handler。**

## 阻擋事項（Blocking Issues）

- **B-1（封鎖）**：`#local temp` 不跨 `queryRunner.query()` 存活（含交易內），推翻 AD-E07-41 §1.1「單一 QueryRunner ⇒ #temp 存活」前提。
  → 需架構師裁示改用 `##global temp`（選項 A）或具名 staging 表（選項 B），並更新 AD 對應章節與 I-MSSQL-TEMPTABLE-PREFIX-01。
