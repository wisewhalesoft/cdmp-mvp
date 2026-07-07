/**
 * AD-E07-41 P4a — `type-cast-handler.ts` 之 MSSQL 平行版。
 *
 * 方言轉換：
 *   - `CAST(... AS type)` → `TRY_CAST`（AD §5.3：type_cast 輸入恆為外部來源資料，統一防禦性轉型）
 *   - PG `"${col}"::TEXT ~ regex` 驗證 → MSSQL `LIKE`/`SUBSTRING`/`LEN`/`CHARINDEX` 字元類別（AD §5.4；
 *     三目標型別 DECIMAL/INTEGER/DATE 皆為簡單字元類別型，無 lookahead/alternation）
 *   - 🔴 空字串陷阱（本文件查證發現）：`'' NOT LIKE '%[^0-9]%'` 求值為 TRUE，須加 `LEN(col) > 0` 守門，
 *     否則空字串誤判為合法整數（與 PG `+` 量詞「至少一位數字」語意相反）——CAST-EQ-002。
 *   - DATE 保留 PG 版「格式前綴比對、非曆法驗證」寬鬆語意（正則無 `$` 錨點），不得過度修正為真實日期驗證。
 *
 * 欄位清單改用 `getMssqlTempTableColumns`（I-MSSQL-TEMP-METADATA-01）。
 */

import { NodeExecutor, NodeExecutionContext, DataSet, makeTempTableName, emptyDataSet } from '../types';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
} from './mssql/temp-table.util';

interface CastRule {
  column: string;
  sourceType: string;
  targetType: string;
}

/** `::TEXT` 等價字串轉型（字元類別驗證於字串上進行）。 */
const TEXT_CAST = 'NVARCHAR(4000)';

export class TypeCastHandlerMssql implements NodeExecutor {
  readonly nodeType = 'type_cast';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const input = context.inputs['default'];
    if (!input || input.rowCount === 0) {
      return emptyDataSet();
    }

    const castRules = context.node.data.castRules as CastRule[];
    const inputTable = input.tempTable;

    // Validate cast rules（白名單，與 PG 版相同）
    for (const rule of castRules) {
      if (!['DECIMAL', 'INTEGER', 'DATE'].includes(rule.targetType)) {
        throw new Error(`不支援的型別轉換：${rule.sourceType} → ${rule.targetType}`);
      }
    }

    const columns = await this.getColumns(context, inputTable);
    const tempTable = '##' + makeTempTableName(context.node.id, context.logId);

    const selectParts: string[] = [];

    for (const col of columns) {
      const rule = castRules.find((r) => r.column === col);
      if (rule) {
        const mssqlType = this.toMssqlType(rule.targetType);
        // 全程 TRY_CAST（AD §5.3 統一防禦；nvarchar 轉型必然合法，TRY_CAST 對非 NULL 輸入不回 NULL）
        const sv = `TRY_CAST("${col}" AS ${TEXT_CAST})`;
        const validation = this.buildValidation(rule.targetType, sv);
        // 兩階段：先短路 NULL、再格式驗證，通過才轉型（invalid 值 TRY_CAST 回 NULL，不拋錯）
        const castExpr = this.castExpression(rule.targetType, sv, mssqlType);
        selectParts.push(
          `CASE WHEN "${col}" IS NOT NULL THEN ` +
            `CASE WHEN ${validation} THEN ${castExpr} ELSE NULL END ` +
            `ELSE NULL END AS "${col}"`,
        );
      } else {
        selectParts.push(`"${col}"`);
      }
    }

    await createMssqlTempTable(
      context.queryRunner,
      tempTable,
      `SELECT ${selectParts.join(', ')} FROM "${inputTable}"`,
    );

    const rowCount = await countMssqlTempTableRows(context.queryRunner, tempTable);

    return { tempTable, rowCount };
  }

  private toMssqlType(targetType: string): string {
    switch (targetType) {
      case 'DECIMAL':
        // PG NUMERIC 無界；MSSQL 裸 NUMERIC 預設 scale 0 會截斷小數 → 顯式高精度保留小數（見 impl log）
        return 'DECIMAL(38, 10)';
      case 'INTEGER':
        return 'INT';
      case 'DATE':
        return 'DATE';
      default:
        return 'NVARCHAR(4000)';
    }
  }

  /**
   * 目標型別之轉型表達式（FINDING-P4D-01 / AD-E07-41 v1.2 §5.6，不變式 I-MSSQL-DECIMAL-NORMALIZE-01）。
   *
   * 🔴 DECIMAL 特例：`toMssqlType('DECIMAL')` = `DECIMAL(38, 10)` 使 `TRY_CAST('3' AS DECIMAL(38,10))`
   *   = `3.0000000000`（固定 10 位小數）。下游 target_load 隱式轉入短欄（如 customer_core
   *   `monthly_income_code varchar(5)`）→ '3.0000000000'（12 字元）→ 算術溢位、pipeline tl1 掛。
   *   PG `NUMERIC` 無固定尾零（`'3'::NUMERIC` → '3'），故 PG 路徑不受影響、byte-identical 不動。
   *
   *   修法：`TRY_CAST(.. AS DECIMAL(38,10))` 保留為「合法性關卡」（invalid → NULL），輸出改「去尾零
   *   正規化字串」——先 `CONVERT(VARCHAR(50), ..)` 為字串，`RTRIM(.., '0')` 剝尾端 0，`RTRIM(.., '.')`
   *   剝殘留小數點，`NULLIF(.., '')` 保底空字串 → NULL。使 MSSQL 輸出與 PG 對齊：
   *     '3'→'3'；'1.5'→'1.5'；'3.10'→'3.1'；'0.055'→'0.055'；'007'→'7'（DECIMAL 前導零本就正規化）；
   *     'abc'→NULL（driven by 外層 validation 關卡，不進本式）。
   *
   *   （TRY_CAST 對合法但超界值 → NULL；CONVERT/RTRIM/NULLIF 對 NULL 皆傳遞 NULL，行為與原一致。）
   *
   * INTEGER / DATE / 其餘：維持原 `TRY_CAST(sv AS mssqlType)`（無固定尾零問題）。
   *
   * @param sv 已為字串型別之欄位表達式（`TRY_CAST("col" AS NVARCHAR(4000))`）
   * @param mssqlType `toMssqlType(targetType)` 之方言型別（DECIMAL 為 `DECIMAL(38, 10)`）
   */
  private castExpression(targetType: string, sv: string, mssqlType: string): string {
    if (targetType === 'DECIMAL') {
      return `NULLIF(RTRIM(RTRIM(CONVERT(VARCHAR(50), TRY_CAST(${sv} AS ${mssqlType})), '0'), '.'), '')`;
    }
    return `TRY_CAST(${sv} AS ${mssqlType})`;
  }

  /**
   * 產生對應 PG `getValidationRegex` 的 MSSQL 字元類別驗證片段（CAST-UNIT-003 覆核結論）。
   * @param sv 已為字串型別的欄位表達式（`CAST("col" AS NVARCHAR(...))`）
   */
  private buildValidation(targetType: string, sv: string): string {
    switch (targetType) {
      case 'INTEGER':
        return this.integerValidation(sv);
      case 'DECIMAL':
        return this.decimalValidation(sv);
      case 'DATE':
        return this.dateValidation(sv);
      default:
        // 不可達（外層白名單已擋非法 targetType）
        return '1 = 1';
    }
  }

  /** PG `^-?[0-9]+$`：可選負號 + 至少一位數字；空字串 / 單一 '-' 皆拒絕（含 LEN>0 空字串守門）。 */
  private integerValidation(x: string): string {
    return (
      `((LEFT(${x}, 1) = '-' AND LEN(${x}) > 1 AND SUBSTRING(${x}, 2, LEN(${x}) - 1) NOT LIKE '%[^0-9]%') ` +
      `OR (LEFT(${x}, 1) <> '-' AND LEN(${x}) > 0 AND ${x} NOT LIKE '%[^0-9]%'))`
    );
  }

  /**
   * PG `^-?[0-9]+(\.[0-9]+)?$`：以 CHARINDEX('.') 拆整數/小數部分分別驗字元類別，兩部分皆需非空。
   * 無小數點 → 整段為整數；有小數點 → 整數部分（含可選負號）+ 小數部分（純數字，非空）。
   */
  private decimalValidation(sv: string): string {
    const dotPos = `CHARINDEX('.', ${sv})`;
    const intPart = `LEFT(${sv}, ${dotPos} - 1)`;
    const fracPart = `SUBSTRING(${sv}, ${dotPos} + 1, LEN(${sv}))`;
    return (
      `((${dotPos} = 0 AND ${this.integerValidation(sv)}) ` +
      `OR (${dotPos} > 0 AND ${this.integerValidation(intPart)} ` +
      `AND LEN(${fracPart}) > 0 AND ${fracPart} NOT LIKE '%[^0-9]%'))`
    );
  }

  /**
   * PG `^[0-9]{4}-[0-9]{2}-[0-9]{2}`（無 `$` 錨點，前綴格式比對、非曆法驗證）。
   * 刻意不驗證月份 1-12 / 日期 1-31，忠實保留 PG 版寬鬆語意（over-correction 守門，CAST-EQ-006/007）。
   */
  private dateValidation(sv: string): string {
    return (
      `(LEN(${sv}) >= 10 ` +
      `AND LEFT(${sv}, 4) NOT LIKE '%[^0-9]%' ` +
      `AND SUBSTRING(${sv}, 5, 1) = '-' ` +
      `AND SUBSTRING(${sv}, 6, 2) NOT LIKE '%[^0-9]%' ` +
      `AND SUBSTRING(${sv}, 8, 1) = '-' ` +
      `AND SUBSTRING(${sv}, 9, 2) NOT LIKE '%[^0-9]%')`
    );
  }

  private async getColumns(context: NodeExecutionContext, tableName: string): Promise<string[]> {
    const cols = await getMssqlTempTableColumns(context.queryRunner, tableName);
    return cols.map((c) => c.name);
  }
}
