---
type: implementation-log
feature_id: AD-E07-41-P4a-fix
feature_name: FINDING-P4D-01 — type_cast DECIMAL 去尾零正規化修法
status: complete
last_updated: 2026-07-08
---

# AD-E07-41 P4a-fix：FINDING-P4D-01 type_cast DECIMAL 去尾零正規化 — 實作紀錄

## 一、範圍與缺陷背景

P4d 端對端（`p4d-e2e.mssql.spec.ts`）抓到跨引擎業務級缺陷 **FINDING-P4D-01**：

- `type-cast-handler-mssql.ts` 之 `toMssqlType('DECIMAL')` = `DECIMAL(38, 10)`，使
  `TRY_CAST('3' AS DECIMAL(38, 10))` = `3.0000000000`（固定 10 位小數）。
- 下游 `target_load` 隱式轉入短欄 `customer_core.monthly_income_code varchar(5)`：
  `'3.0000000000'`（12 字元）→ 算術溢位 → `tl1` 節點 `failed` → 整條 pipeline 掛。
- PG `NUMERIC` 無固定尾零（`'3'::TEXT::NUMERIC` 渲染為 `'3'`），故 PG 路徑不受影響。

**architect 裁定（AD-E07-41 v1.2 §5.6，不變式 I-MSSQL-DECIMAL-NORMALIZE-01）**：
`TRY_CAST(.. AS DECIMAL(38,10))` 保留為「合法性關卡」，輸出改「去尾零正規化字串」，
使 MSSQL 輸出對齊 PG。

本次為封閉小切片，**只修此缺陷**：不碰 P4e / 其他 handler，PG 路徑不動。

## 二、修法

### 2.1 `type-cast-handler-mssql.ts`（production，唯一產品碼變更）

新增私有方法 `castExpression(targetType, sv, mssqlType)`：

```ts
private castExpression(targetType: string, sv: string, mssqlType: string): string {
  if (targetType === 'DECIMAL') {
    return `NULLIF(RTRIM(RTRIM(CONVERT(VARCHAR(50), TRY_CAST(${sv} AS ${mssqlType})), '0'), '.'), '')`;
  }
  return `TRY_CAST(${sv} AS ${mssqlType})`;
}
```

- `execute()` 內原 `TRY_CAST(${sv} AS ${mssqlType})` 呼叫改為 `this.castExpression(rule.targetType, sv, mssqlType)`。
- **DECIMAL**：`TRY_CAST` 為合法性關卡（invalid → NULL）；外層 `CONVERT(VARCHAR(50), ..)` 轉字串、
  `RTRIM(.., '0')` 剝尾端 0、`RTRIM(.., '.')` 剝殘留小數點、`NULLIF(.., '')` 保底空字串 → NULL。
- **INTEGER / DATE / 其餘**：維持原 `TRY_CAST(sv AS mssqlType)`，無變更。
- 兩階段結構（外層 `CASE WHEN col IS NOT NULL` 短路 + `buildValidation` 格式關卡）完全保留；
  本修法僅替換「通過驗證後之 THEN 轉型表達式」。
- NULL 傳遞：TRY_CAST 對合法但超界值回 NULL；CONVERT / RTRIM / NULLIF 對 NULL 皆傳遞 NULL，
  行為與原一致（不拋錯）。

正規化行為（真實 MSSQL 實測，見 §四）：
`'3'→'3'`；`'1.5'→'1.5'`；`'3.10'→'3.1'`；`'0.055'→'0.055'`；`'007'→'7'`（DECIMAL 前導零本就正規化）；
`'30'→'30'`（整數尾零於 `.` 之前不剝）；`'0'→'0'`；`'abc'→NULL`（外層 validation 關卡先擋，不進本式）。

### 2.2 CAST-UNIT-002 子字串實測結論（不臆測）

CAST-UNIT-002 斷言 `await cast('DECIMAL')` 之 SQL `toContain('AS DECIMAL(38, 10)')`。

**實測結論：新 SQL 仍含此子字串 → CAST-UNIT-002 不需修改。**
理由：`castExpression('DECIMAL', sv, mssqlType)` 之 TRY_CAST 合法性關卡仍為
`TRY_CAST(${sv} AS DECIMAL(38, 10))`（`mssqlType` 由 `toMssqlType` 回傳 `DECIMAL(38, 10)`，含逗號後空格），
故產出 SQL 內 `AS DECIMAL(38, 10)` 子字串保留。
`npx vitest run p4a-mssql-unit`（36 tests 全綠，含未改動之 CAST-UNIT-002）已實跑佐證。

### 2.3 測試變更

| 測試檔 | 案例 | 變更 |
|--------|------|------|
| `p4a-mssql-unit.spec.ts` | CAST-UNIT-002 | **不改**（實測仍含 `AS DECIMAL(38, 10)`） |
| `p4a-mssql-unit.spec.ts` | CAST-UNIT-007（新增） | 斷言 DECIMAL 走去尾零式（`CONVERT(VARCHAR(50)`/`RTRIM`/`'0'`/`'.'`/`NULLIF`/仍含 `AS DECIMAL(38, 10)`），INTEGER/DATE 維持裸 TRY_CAST。CI 恆跑、不需 MSSQL |
| `p4a-type-cast-handler.mssql.spec.ts` | CAST-EQ-010 | 斷言由 `Number(v)` 改為去尾零**字串**（`'0.055'/'1.5'/'123'` + 一筆 NULL），另附數值語意驗證 |
| `p4a-type-cast-handler.mssql.spec.ts` | CAST-EQ-012（新增） | DECIMAL 邊界逐值：`'3'→'3'`、`'1.5'→'1.5'`、`'3.10'→'3.1'`、`'0.055'→'0.055'`、`'007'→'7'`、`'30'→'30'`、`'0'→'0'`、`'abc'→NULL`（真實 MSSQL） |
| `p4d-e2e.mssql.spec.ts` | FINDING-P4D-01 | 反轉斷言：由「tl1 溢位 failed」改為「tl1 completed、`monthly_income_code='3'`、`monthly_income_desc='中所得'`」 |

### 2.4 `_p4d-fixtures.ts`（fixture）

- `ZZIP_HIT.MONTH_INCOME`：`'B3'`（規避碼）→ **`'3'`**（真實 legacy 數字所得級距）。
- `bamcodeRows()` income 對照列：`{ TBL_ID: 'A3', TBL_CD: 'B3' }` → `{ TBL_ID: 'A3', TBL_CD: '3' }`，
  使 income lookup（`lk_income1`：filter `TBL_ID='A3'`、match `MONTH_INCOME` vs `TBL_CD`）續命中 `'中所得'`。

## 三、資料流佐證（為何只改 type_cast 即解全鏈）

`tc_zzip`（type_cast DECIMAL on `MONTH_INCOME`）→ `fm1`（field_mapping 別名 `monthly_income_code`）
→ `tl1`（target_load 隱式轉入 `customer_core.monthly_income_code varchar(5)`）。

修法後 type_cast 產出 `VARCHAR(50)` 字串 `'3'`（非 `DECIMAL 3.0000000000`），field_mapping 僅別名不改型，
target_load 見其為 varchar → `NULLIF(TRIM('3'),'')='3'` → 塞入 varchar(5) 成功。
故 `target-load-handler-mssql.ts` 無需任何變更。

## 四、真實 MSSQL 實測（1433 可達）

### 4.1 去尾零單元 / EQ（`p4a-type-cast-handler.mssql.spec.ts`）
- **12 tests 全綠**（953ms，非 skip → 真實執行）。
- CAST-EQ-012 逐值佐證：`'3'→'3'`（核心，非 `'3.0000000000'`）、`'3.10'→'3.1'`、`'007'→'7'`、`'abc'→NULL` 等全數符合。
- 連帶佐證：兩參數 `RTRIM(string, chars)` 於本測試容器（SQL Server 2022）可用。

### 4.2 P4d 端對端數字 income 重跑（`p4d-e2e.mssql.spec.ts`）
- **30 tests 全綠**（47.3s）。
- FINDING-P4D-01：`tl1.status = 'completed'`（不再 `failed`）；`console` 佐證 `monthly_income_code = '3'`。
- `zh.monthly_income_code = '3'`、`zh.monthly_income_desc = '中所得'`（lookup 續命中）。
- E2E-004 存活 5 列、LOOKUPHIT-001 income desc、CHARSET / TIEBREAK / IDEMPOTENT / CLEANUP 皆綠。
- **溢位不再發生、customer_core 寫入含 income** — DoD 達成。

### 4.3 PG/MSSQL EQ 一致
- 本機 PG 5433 不可達 → `p4d-eqpg.mssql.spec.ts` 6 案例 degradable skip（EQPG-006 meta 佐證 gating 正確，非造假）。
- 理論一致性：PG `'3'::TEXT::NUMERIC` 於 varchar 欄渲染為 `'3'`；MSSQL 去尾零後亦 `'3'`。fixture income 皆整數值，
  兩側寫入 `monthly_income_code` 均為 `'3'`，EQ 成立（待 5433 可達時逐列覆核）。

## 五、驗收核對
- `npx tsc --noEmit -p tsconfig.build.json`：**乾淨**（TSC_CLEAN）。
- CAST-UNIT-002 子字串實測：**新 SQL 仍含 `AS DECIMAL(38, 10)`，不需改**（`p4a-mssql-unit` 36 綠佐證）。
- P4d 數字 income 重跑：**溢位消失、income 寫入、tl1 completed**（30 綠）。
- **P4a 全套件回歸**：`p4a-*` 12 檔 + `p4d-static` + `p4d-eqpg` 合跑 **105 passed / 10 skipped / 0 failed**
  （skip = PG 5433 degradable 6 + p4a-extract resolve 可達性 gate 4，皆既有機制、非本次退化）。
- **PG type_cast 路徑 byte-identical**：`handlers/type-cast-handler.ts` 未在 git 變更清單內。
- STATIC-004（凍結 pipeline-runner / node-dispatcher / node-output-store / types）通過；
  `target-load-handler-mssql.ts` 未動。

## 六、Files Changed
| 檔案 | 類型 | 說明 |
|------|------|------|
| `apps/api/src/modules/etl/engine/handlers/type-cast-handler-mssql.ts` | modified | 新增 `castExpression`；execute() 改呼叫之（唯一產品碼變更） |
| `apps/api/src/modules/etl/engine/__tests__/_p4d-fixtures.ts` | modified | `MONTH_INCOME 'B3'→'3'`；income bamcode `TBL_CD 'B3'→'3'` |
| `apps/api/src/modules/etl/engine/__tests__/p4a-mssql-unit.spec.ts` | modified | 新增 CAST-UNIT-007（去尾零 SQL shape，CI 恆跑） |
| `apps/api/src/modules/etl/engine/__tests__/p4a-type-cast-handler.mssql.spec.ts` | modified | CAST-EQ-010 改字串斷言；新增 CAST-EQ-012 邊界逐值 |
| `apps/api/src/modules/etl/engine/__tests__/p4d-e2e.mssql.spec.ts` | modified | FINDING-P4D-01 反轉為「已修」正向斷言 |

## 七、偏差 / 待架構師知悉（非阻擋）
1. **兩參數 `RTRIM(string, chars)` 需 SQL Server 2022+ / Azure SQL**（16.x）。§5.6 裁定 SQL 直接採用，
   於本測試容器（SQL2022）實測通過。若正式環境含 **SQL Server 2019**，`RTRIM(x, '0')` 會拋
   「requires 1 argument(s)」。專案 constraint 為 SQL 2019–2022，建議架構師確認正式環境版本；
   若需相容 2019，去尾零式需改以版本中立寫法（如 `REPLACE`/`SUBSTRING` 組合或 `FORMAT`）替代。
   本次依裁定實作，未自行改寫。
2. **殘留 EQ edge case（varchar 目標 + 真實尾零小數輸入）**：MSSQL DECIMAL(38,10) 先固定 10 位再去尾零，
   對輸入 `'3.10'` 產出 `'3.1'`；PG `NUMERIC` 保留輸入 scale 產出 `'3.10'`。故對「輸入即帶尾零之小數」
   於 varchar 目標欄，兩側字串表徵可能相異（`'3.1'` vs `'3.10'`）。此為架構師去尾零裁定之刻意取捨
   （優先消除溢位）；實際 fixture 之 income / capital 皆整數值，EQ 成立、p4d-eqpg 不受影響。記錄供
   日後若出現帶尾零小數之來源欄時知悉。
3. 既有 10 項 ETL / 其他 tech debt 未擴大（本次僅動 type_cast MSSQL 路徑與其專屬測試 + fixture）。
