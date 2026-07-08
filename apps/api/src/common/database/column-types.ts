import type { ColumnType } from 'typeorm';
import type { PrimaryGeneratedColumnType } from 'typeorm/driver/types/ColumnTypes';

/**
 * Returns the correct date column type for the current database.
 * - PostgreSQL: 'timestamp'
 * - better-sqlite3: 'datetime'
 * - MSSQL: 'datetime2'（AD-E07-38 D-2；預設 datetime2(3) 毫秒精度）
 */
export const dateColumnType: ColumnType =
  process.env.DB_TYPE === 'sqlite'
    ? 'datetime'
    : process.env.DB_TYPE === 'mssql'
      ? 'datetime2'
      : 'timestamp';

/**
 * Returns a JSON column type compatible with the current database.
 * - PostgreSQL: 'jsonb'（native）
 * - better-sqlite3: 'simple-json'（TypeORM 內建 portable，序列化為 TEXT）
 * - MSSQL: 'simple-json'（AD-E07-38 D-2；MSSQL 無原生 json 型別，走 nvarchar(max)+app 層序列化，
 *   欄位皆為 app 層不透明 blob，未見任何 SQL jsonb operator 查詢）
 *
 * F068 / E2E sqlite 相容用：assignment_audit_log.before_value / after_value
 */
export const jsonColumnType: ColumnType =
  process.env.DB_TYPE === 'sqlite'
    ? 'simple-json'
    : process.env.DB_TYPE === 'mssql'
      ? 'simple-json'
      : 'jsonb';

/**
 * Surrogate PK 型別（@PrimaryGeneratedColumn）。
 * - PostgreSQL: 'bigint'（業務真機，64-bit ID 空間）
 * - better-sqlite3: 'integer'（sqlite AUTOINCREMENT 僅允許 INTEGER PRIMARY KEY）
 * - MSSQL: 'bigint'（AD-E07-38 D-2；沿用 postgres 分支值，原生同名）
 *
 * F053~F056 e2e 相容用：4 個 ob_levelcard_* 與 ob_tier surrogate PK。
 */
export const surrogatePkType: PrimaryGeneratedColumnType =
  process.env.DB_TYPE === 'sqlite'
    ? 'integer'
    : process.env.DB_TYPE === 'mssql'
      ? 'bigint'
      : 'bigint';

/**
 * Boolean 欄位型別。
 * - PostgreSQL / better-sqlite3: 'boolean'（原生支援）
 * - MSSQL: 'bit'（AD-E07-38 P1a 實測補強）
 *
 * ⚠️ AD-E07-38 D-2 假設「driver 層通常自動轉換 boolean↔bit」，但 P1a 實測發現 TypeORM mssql driver
 *    對「顯式」`type:'boolean'` 字面值會拋 DataTypeNotSupportedError（僅「反射式」Boolean 才自動映射 bit）。
 *    故 4 個 auth entity 內顯式 boolean 欄位（User.is_sales_manager）須改走本 helper 才能於 mssql synchronize。
 *    driver 層仍自動處理 JS true/false ↔ 1/0 的值轉換（讀寫仍為 JS boolean）。
 */
export const boolColumnType: ColumnType =
  process.env.DB_TYPE === 'mssql' ? 'bit' : 'boolean';

/**
 * UUID 型別（用於 `@Column({ type: uuidColumnType })`）。
 * - PostgreSQL: 'uuid'（原生）
 * - better-sqlite3: 'uuid'（TypeORM 對 sqlite 以 varchar 相容承載）
 * - MSSQL: 'uniqueidentifier'（AD-E07-38 D-1）
 *
 * ⚠️ P1a 實測（TYPE-001/決策 TYPE-007）：
 *   - `@PrimaryGeneratedColumn('uuid')`（產生策略）於 mssql driver 已正確映射 `uniqueidentifier`
 *     → P1a 兩個 PK 欄位（User.id / PasswordResetToken.id）**維持裸 'uuid' 產生策略，不需改寫**。
 *   - 但「裸 `@Column({ type: 'uuid' })` 字面值」於 mssql driver 會拋
 *     `Cannot find data type uuid` → P1b 的 18 處 `@Column({ type: 'uuid' })` **必須改用本 helper**。
 *   本 helper 於 P1a 建立、P1b 逐檔套用（HELPER-SCOPE-01 收斂）。
 */
export const uuidColumnType: ColumnType =
  process.env.DB_TYPE === 'mssql' ? 'uniqueidentifier' : 'uuid';

/**
 * 長文字型別（用於 `@Column({ type: longTextColumnType, length: longTextColumnLength })`）。
 * - PostgreSQL / better-sqlite3: 'text'（length 為 undefined）
 * - MSSQL: 'nvarchar' + length 'MAX'（AD-E07-38 D-1）
 *
 * ⚠️ P1a 實測（TYPE-002/決策 TYPE-007）：裸 `@Column({ type: 'text' })` 於 mssql driver 會落入
 *   **已棄用的原生 `TEXT` 型別**（DATA_TYPE='text', 長度 2^31-1），非 `NVARCHAR(MAX)`。
 *   故 P1b 的 17 處裸 'text' **必須改用本 helper**（nvarchar + length 'MAX'）。
 *   P1a 的 4 個 auth entity 無裸 'text' 欄位，helper 於 P1a 先建立供 P1b 直接套用。
 */
export const longTextColumnType: ColumnType =
  process.env.DB_TYPE === 'mssql' ? 'nvarchar' : 'text';
export const longTextColumnLength: string | undefined =
  process.env.DB_TYPE === 'mssql' ? 'MAX' : undefined;

/**
 * Unicode 顯示字串型別（用於 `@Column({ type: nvarcharColumnType, length: N })`；N≤255 之中文顯示欄位）。
 * AD-E07-43 §9 / I-MSSQL-NVARCHAR-DISPLAY-01（P5i）。
 * - PostgreSQL / better-sqlite3: 'varchar'（與現行 literal 'varchar' 逐值等價 → 零回歸）
 * - MSSQL: 'nvarchar'（Unicode 安全；避免 Chinese_Taiwan_Stroke_BIN collation 下 byte-length 截斷）
 *
 * ⚠️ 根因（AD §9.2）：來源 legacy MSSQL schema（reference/TableSchema/OB/*.sql）明確宣告 SPEC_NAME／
 *    CAR_NAME／BROKER／EMP_NM／DEPT_NAME 等中文顯示欄位為 `nvarchar(N)`，但 schema 產生器
 *    parse-ob-schema.mjs::mapType() 為當初純 PG 目標而將 nvarchar/varchar 收斂為泛用 'varchar'。
 *    MSSQL 目標下同一 'varchar' 型別以 byte 計長（中文 2 bytes/字），nvarchar(45) 只能容 22 個中文字即截斷。
 *    本 helper 使「來源宣告為 nvarchar」之欄位於 MSSQL 還原 Unicode 安全，PG/sqlite 維持 varchar 不變。
 *
 * ⚠️ 形式差異（刻意）：AD §9.5 步驟 1 以 `nvarcharColumnType(length)` 描述「結果型別為 nvarchar(N)」；
 *    length 已由 @Column 之 length 選項獨立承載，故比照既有 longTextColumnType 採 const（非 function），
 *    使既有 entity 逐行僅需將 `type: 'varchar'` 改為 `type: nvarcharColumnType`，length 保留不動、diff 最小。
 *
 * ⚠️ sqlite 分支取 'varchar'（非 AD §9.5 建議之 'text'）：現行 entity 對此類欄位為 literal 'varchar'，
 *    sqlite 亦落 'varchar'；為守「sqlite 零回歸」硬約束，本 helper 於 sqlite 維持 'varchar'（與現況逐值等價）。
 */
export const nvarcharColumnType: ColumnType =
  process.env.DB_TYPE === 'mssql' ? 'nvarchar' : 'varchar';

/**
 * Hash-based PK 型別（B1 / AD-E07-39 §3.1；token_blocklist 專用）。
 * - PostgreSQL: 'bytea'
 * - better-sqlite3: 'blob'
 * - MSSQL: 'binary'（固定長度 32 bytes，SHA-256 摘要；索引鍵僅 32 bytes，遠低於 900-byte 上限）
 *
 * ⚠️ AD-E07-39 §2/§3：token_blocklist.token（nvarchar(2048) PK = 4096 bytes）為全庫唯一超過
 *    MSSQL clustered index 900-byte 上限之案例（P1a CRUD-003b 實測 2048 字元 JWT INSERT 失敗）。
 *    B1 裁定：改以 sha256(token) 之 32-byte 定長雜湊為 PK，與 token 原始長度脫鉤。
 *    三個 driver 一致改 hash（不做 driver-conditional 分岔，AD §3.2）。
 */
export const hashColumnType: ColumnType =
  process.env.DB_TYPE === 'mssql'
    ? 'binary'
    : process.env.DB_TYPE === 'sqlite'
      ? 'blob'
      : 'bytea';
export const hashColumnLength: number | undefined =
  process.env.DB_TYPE === 'mssql' ? 32 : undefined;
