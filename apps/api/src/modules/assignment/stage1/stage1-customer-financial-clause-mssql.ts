/**
 * buildCustomerFinancialClauseMssql — F114：`stage1-customer-financial-clause.ts` 之 MSSQL 平行版。
 *
 * 與 customer_core 不同，customer_financial 篩選欄位**無任何方言相依表達式**：
 *   - has_guarantor → `cf.has_guarantor IN (...)`（ANSI）
 *   - 各件數 / 次數 → `cf.col BETWEEN :min AND :max`（ANSI）
 * 兩方言逐字相同，故本檔直接 **re-export** PG 版函式（無 DATEDIFF/AGE 之類的分歧），
 * 以維持「builder 依 dialect 匯入對應 clause 檔」的既有慣例（AD-E07-42 平行檔命名）。
 */

export {
  buildCustomerFinancialClause as buildCustomerFinancialClauseMssql,
  type CustomerFinancialClause,
} from './stage1-customer-financial-clause';
