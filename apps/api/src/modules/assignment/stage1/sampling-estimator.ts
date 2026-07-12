/**
 * sampling-estimator — AD-E07-45：F050 / F055 / F056 三消費者共用之抽樣估算核心元件。
 *
 * 三個消費者（F055 各等級分布 / F056 各 TIER 分布 / F050 草稿命中筆數）之差異僅在於「對抽樣後
 * 的列做什麼聚合」；抽樣本身（如何從 ob_pool_data 取出一組固定、可重現的子集合）是完全共用的
 * 正交關注點。本檔案即為該共用核心。
 *
 * 設計要點（AD-E07-45 §3 / §4 / §7）：
 *   - 固定樣本大小 50,000 + 固定 REPEATABLE 種子 42（不依 cardType / 條件 / 母體筆數變動）。
 *   - 兩階段抽樣：TABLESAMPLE 頁級粗抽（I/O 降低）+ 決定性 hash 排序修剪至精確筆數。
 *   - 抽樣來源別名恆為 `o`（I-SAMPLE-ALIAS-PRESERVE-01）——既有 buildStage2ScoreExpr(Mssql) /
 *     buildStage1WhereConditions / buildCustomerCoreClause 之 `o.` 欄位引用零修改即可運作於抽樣或全量。
 *   - samplePercent / seed / targetSampleSize 一律為驗證過之數值字面量直接嵌入 SQL 文字
 *     （I-SAMPLE-LITERAL-01；TABLESAMPLE 引數在兩種資料庫皆要求常數表達式，純數值不構成注入風險）。
 *   - 小母體 fallback（totalCount <= 50000）：完全略過 TABLESAMPLE，全表直連（I-SAMPLE-SMALLPOOL-FALLBACK-01）。
 *   - 不做任何跨請求層級快取（I-SAMPLE-NO-CACHE-01）。
 *
 * 測試邊界：TABLESAMPLE 不存在於 SQLite；大母體 CTE 分支僅可於 MSSQL 真實 DB（.mssql.spec.ts）
 *   執行；純函式（scaleEstimate / samplePercent / SQL 字串 shape）與小母體 fallback 分支可離線 /
 *   SQLite 驗證。
 */

import type { ObjectLiteral, Repository } from 'typeorm';

/** 固定樣本筆數，跨 F050/F055/F056 三個消費者共用同一常數（AD-E07-45 §3.1 / I-SAMPLE-FIXED-SIZE-01）。 */
export const POOL_DATA_SAMPLE_SIZE = 50_000;

/** 固定 repeatable 種子，恆定不變（不隨 cardType / 條件 / 時間變動，AD-E07-45 §3.2）。 */
export const POOL_DATA_SAMPLE_SEED = 42;

/** 過抽係數，緩衝 TABLESAMPLE 近似回傳量之隨機波動（AD-E07-45 §3.2）。 */
const OVERSAMPLE_FACTOR = 1.3;

export type SamplingDialect = 'mssql' | 'postgres';

export interface PoolDataSampleFrom {
  /** 可直接接在消費者查詢前的 CTE 前綴（含結尾空白）；小母體 fallback 時為空字串。 */
  ctePrefix: string;
  /** 消費者查詢應使用的 FROM 目標，別名固定為 'o'（I-SAMPLE-ALIAS-PRESERVE-01）。 */
  fromClause: string;
  /** 本次實際使用之樣本筆數（大母體 = POOL_DATA_SAMPLE_SIZE；小母體 fallback = totalCount）。 */
  effectiveSampleSize: number;
}

/**
 * SELECT COUNT(*) FROM ob_pool_data；不快取，每次請求即時查詢（AD-E07-45 §3.4 / §4.3）。
 *
 * 以 repo.query 直接跑 raw SQL 針對 ob_pool_data（不依賴傳入 repo 對應之 entity），使
 * assignment-scoring（poolDataListRepo）與 assignment-list（ObPoolData repo）皆可共用同一支。
 */
export async function getPoolDataTotalCount(
  poolDataRepo: Repository<ObjectLiteral>,
): Promise<number> {
  const rows = await poolDataRepo.query('SELECT COUNT(*) AS cnt FROM ob_pool_data');
  const raw = Array.isArray(rows) && rows.length > 0 ? rows[0].cnt : 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * samplePercent 計算（AD-E07-45 §4.4）：
 *   samplePercentRaw = (POOL_DATA_SAMPLE_SIZE * OVERSAMPLE_FACTOR / totalCount) * 100
 *   samplePercent    = min(100, round(samplePercentRaw, 2))
 *
 * 例：totalCount = 1,679,489 → 3.87。totalCount 太小使 raw > 100 時由 Math.min 上限保護。
 */
export function computeSamplePercent(totalCount: number): number {
  if (totalCount <= 0) return 100;
  const raw = ((POOL_DATA_SAMPLE_SIZE * OVERSAMPLE_FACTOR) / totalCount) * 100;
  const twoDp = Math.round(raw * 100) / 100;
  return Math.min(100, twoDp);
}

/**
 * 建構抽樣 FROM 來源（AD-E07-45 §3.2 / §3.3 / §4.4）。
 *
 * totalCount <= POOL_DATA_SAMPLE_SIZE 時回傳無 CTE 之全表直連（小母體 fallback）；否則回傳
 * TABLESAMPLE + 決定性 hash 修剪 CTE。samplePercent / seed / targetSampleSize 皆為數值字面量直接
 * 嵌入 SQL 文字（I-SAMPLE-LITERAL-01），不透過具名參數傳遞。
 */
export function buildPoolDataSampleFrom(
  totalCount: number,
  dialect: SamplingDialect,
): PoolDataSampleFrom {
  const isMssql = dialect === 'mssql';

  // I-SAMPLE-SMALLPOOL-FALLBACK-01：小母體完全略過 TABLESAMPLE，全表直連，樣本 = 精確全量。
  if (totalCount <= POOL_DATA_SAMPLE_SIZE) {
    return {
      ctePrefix: '',
      fromClause: isMssql ? 'ob_pool_data o' : 'ob_pool_data AS o',
      effectiveSampleSize: totalCount,
    };
  }

  const samplePercent = computeSamplePercent(totalCount);
  const seed = POOL_DATA_SAMPLE_SEED;
  const size = POOL_DATA_SAMPLE_SIZE;

  if (isMssql) {
    // 🔴 MSSQL 語法修正（runtime 查證 2026-07-12，dev CDMP）：AD-E07-45 §3.2 稱「MSSQL TABLESAMPLE
    //   須先於別名（FROM tbl TABLESAMPLE(...) AS o）」為**誤述**——真實 SQL Server 對此拋
    //   「Incorrect syntax near the keyword 'AS'」。實際 T-SQL 文法為
    //   `table [ [AS] alias ] [ <tablesample_clause> ]`，即別名**先於** TABLESAMPLE（與 PG 相同順序）。
    //   決定性排序鍵 ABS(CHECKSUM(orgno, appl_no, seed))；TOP (n) 精確修剪。
    const ctePrefix =
      `WITH sampled_pool AS (` +
      ` SELECT TOP (${size}) o.*` +
      ` FROM ob_pool_data AS o TABLESAMPLE (${samplePercent} PERCENT) REPEATABLE (${seed})` +
      ` ORDER BY ABS(CHECKSUM(o.orgno, o.appl_no, ${seed})), o.orgno, o.appl_no` +
      ` ) `;
    return { ctePrefix, fromClause: 'sampled_pool o', effectiveSampleSize: size };
  }

  // PG：別名先於 TABLESAMPLE（與 MSSQL 相反）；hashtext 決定性排序鍵；LIMIT 精確修剪。
  const ctePrefix =
    `WITH sampled_pool AS (` +
    ` SELECT o.*` +
    ` FROM ob_pool_data AS o TABLESAMPLE SYSTEM (${samplePercent}) REPEATABLE (${seed})` +
    ` ORDER BY hashtext(o.orgno || o.appl_no || '${seed}'), o.orgno, o.appl_no` +
    ` LIMIT ${size}` +
    ` ) `;
  return { ctePrefix, fromClause: 'sampled_pool o', effectiveSampleSize: size };
}

/**
 * 樣本 → 母體放大推算（AD-E07-45 §3.1 / §3.5 / §4.4 / I-SAMPLE-SCALE-DENOM-01）。
 *
 * 分母恆為 effectiveSampleSize（實際使用之樣本列數，非配置常數）；四捨五入至整數
 * （不得無條件捨去或進位造成系統性偏差）。effectiveSampleSize <= 0 時防禦性回 0（不拋除以零）。
 */
export function scaleEstimate(
  sampleMatchCount: number,
  effectiveSampleSize: number,
  totalCount: number,
): number {
  if (effectiveSampleSize <= 0) return 0;
  return Math.round((sampleMatchCount / effectiveSampleSize) * totalCount);
}
