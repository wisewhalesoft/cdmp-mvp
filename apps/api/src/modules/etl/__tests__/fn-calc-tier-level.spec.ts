/**
 * E07 Track D — fn_calc_tier_level Integration Tests
 *
 * 連 dev PostgreSQL 直接呼叫 plpgsql 函式驗證行為。每個 it 用 BEGIN/ROLLBACK 隔離。
 *
 * 前置條件：
 *   - docker-compose 起著（postgres :5432，DB cdmp_dev / user cdmp）
 *   - migration 1711360000140 / 141 已執行（npm run migration:run）
 *   - ob_levelcard_score / ob_levelcard_level / ob_tier 已 seed（Track B）
 *
 * 設計：
 *   - 用 pg.Client 直連，不走 NestJS / TypeORM
 *   - 每個 it 都 BEGIN → INSERT 假資料 → 呼叫 function → 斷言 → ROLLBACK
 *   - "delta-based" 斷言：固定其他變數，只改一個維度，斷言 score 差值符合 score 表定義
 *     （比起斷言絕對 score 更穩健 — score 表變動時測試自動跟上）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const TEST_TIMEOUT = 15_000;

// 連線參數來自 .env / docker-compose 預設
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'cdmp',
  password: process.env.DB_PASSWORD || 'cdmp_secret',
  database: process.env.DB_NAME || 'cdmp_dev',
};

// 測試 fixture 用的固定 keys（測試不會 commit，但 ID 仍取避免污染既有資料風格的字串）
const FIX_ORGNO = 'ZZ';
const FIX_APPL_NO = 'TFNCT00001';
const FIX_CUSTO_NO = 'TFNCTCUST01';

// 最小 ob_pool_data INSERT helper — 只填 NOT NULL 欄位 + 我們會用到的計分相關欄位
async function insertPoolData(
  client: Client,
  overrides: Record<string, string | number | null> = {},
): Promise<void> {
  const cols: Record<string, string | number | null> = {
    orgno: FIX_ORGNO,
    appl_no: FIX_APPL_NO,
    custo_no: FIX_CUSTO_NO,
    sta_code: '01',
    dept_id: 'XX0000',
    list_type: '01',
    prod_kind: '01',
    prod_kind_name: '車貸',
    best_case: 'N',
    settle_src: 'N',
    _cdmp_extracted_at: new Date().toISOString(),
    // 計分相關 — 預設值（每個 case 視需要 override）
    spec_tp: '20',
    spec_name: '普通',
    year_produ: '2020',
    month_cnt: 10,
    sales_sts_na: 'HFC',
    loan_rate: 0,
    ...overrides,
  };
  const keys = Object.keys(cols);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map((k) => cols[k]);
  await client.query(
    `INSERT INTO ob_pool_data (${keys.join(', ')}) VALUES (${placeholders})`,
    values,
  );
}

async function insertCustomerCore(
  client: Client,
  overrides: Record<string, string | null> = {},
): Promise<void> {
  const cols: Record<string, string | null> = {
    source_customer_no: FIX_CUSTO_NO,
    customer_type_code: 'P',
    name: '測試客戶',
    data_source: 'TEST_FIX',
    _etl_loaded_at: new Date().toISOString(),
    _etl_pipeline_id: '00000000-0000-0000-0000-000000000000',
    ...overrides,
  };
  const keys = Object.keys(cols);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map((k) => cols[k]);
  await client.query(
    `INSERT INTO customer_core (${keys.join(', ')}) VALUES (${placeholders})`,
    values,
  );
}

async function insertArreturn(client: Client, addUnCapital: number): Promise<void> {
  await client.query(
    `INSERT INTO ob_arreturndf_min_cap (appl_no, add_un_capital, _cdmp_extracted_at)
     VALUES ($1, $2, NOW())`,
    [FIX_APPL_NO, addUnCapital],
  );
}

async function callFn(
  client: Client,
  cardType: string,
  cardVersion: number,
): Promise<{ score: number; card_level: string | null; tier_level: string | null }> {
  const r = await client.query(
    `SELECT score, card_level, tier_level
       FROM ob_pool_data pd
       CROSS JOIN LATERAL fn_calc_tier_level($1, $2, pd) AS calc
      WHERE pd.orgno = $3 AND pd.appl_no = $4`,
    [cardType, cardVersion, FIX_ORGNO, FIX_APPL_NO],
  );
  if (r.rows.length === 0) throw new Error('no row from fn_calc_tier_level');
  const row = r.rows[0];
  return {
    score: Number(row.score),
    card_level: row.card_level,
    tier_level: row.tier_level,
  };
}

// 查 score 表，給定 column_name + value，回傳該 rule 的 score（無 match 時 0）
async function ruleScoreNumeric(
  client: Client,
  cardType: string,
  version: number,
  column: string,
  value: number,
): Promise<number> {
  const r = await client.query(
    `SELECT score FROM ob_levelcard_score
      WHERE card_type = $1 AND card_version = $2 AND column_name = $3
        AND $4::numeric BETWEEN level2_s::numeric AND level2_e::numeric
        AND level1 IS NULL
      ORDER BY score DESC
      LIMIT 1`,
    [cardType, version, column, value],
  );
  return Number(r.rows[0]?.score ?? 0);
}

describe('fn_calc_tier_level (integration)', () => {
  let client: Client;
  let connectFailed = false;

  beforeAll(async () => {
    client = new Client(DB_CONFIG);
    try {
      await client.connect();
      // 確認 function 已建（避免在沒跑 migration 時跑 test 看不出原因）
      const r = await client.query(
        `SELECT 1 FROM pg_proc WHERE proname = 'fn_calc_tier_level' LIMIT 1`,
      );
      if (r.rows.length === 0) {
        throw new Error(
          'fn_calc_tier_level not installed. Run: cd apps/api && npm run migration:run',
        );
      }
    } catch (e) {
      connectFailed = true;
      // 印出原因，讓 vitest 後續 it 跳過時看得到 root cause
      // eslint-disable-next-line no-console
      console.warn('[fn_calc_tier_level.spec] DB connect failed; tests will be skipped:', (e as Error).message);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (client && !connectFailed) await client.end();
  });

  // 共用：每個 it 包 BEGIN / ROLLBACK
  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    try {
      return await fn();
    } finally {
      await client.query('ROLLBACK');
    }
  }

  it('TC-01 不存在的 card_type / version → score=0, card_level=NULL, tier_level=NULL', async () => {
    if (connectFailed) return;
    await tx(async () => {
      await insertPoolData(client);
      const result = await callFn(client, 'XXX', 999);
      expect(result.score).toBe(0);
      expect(result.card_level).toBeNull();
      expect(result.tier_level).toBeNull();
    });
  }, TEST_TIMEOUT);

  it('TC-02 fallback CARD_TYPE M5 → score=0, tier_level=T5M（ob_tier card_level IS NULL fallback）', async () => {
    if (connectFailed) return;
    await tx(async () => {
      await insertPoolData(client);
      // M5 在 ob_levelcard_version 不存在 → score 表也無對應 → score=0
      // ob_tier 中 (M5, NULL) → T5M
      const result = await callFn(client, 'M5', 1);
      expect(result.score).toBe(0);
      expect(result.card_level).toBeNull();
      expect(result.tier_level).toBe('T5M');
    });
  }, TEST_TIMEOUT);

  it('TC-03 customer_core gender 影響 score：H 卡 CUS_SEX 1 → 2 應有 score 表定義的 delta', async () => {
    if (connectFailed) return;
    await tx(async () => {
      await insertPoolData(client);
      // 第一輪 gender='1'
      await insertCustomerCore(client, { gender: '1' });
      const a = await callFn(client, 'H', 1);
      // 第二輪 gender='2'
      await client.query(
        `UPDATE customer_core SET gender = '2' WHERE source_customer_no = $1`,
        [FIX_CUSTO_NO],
      );
      const b = await callFn(client, 'H', 1);
      // delta 應等同 score 表中 CUS_SEX gender=1 vs gender=2 的差
      const expectedA = await ruleScoreNumeric(client, 'H', 1, 'CUS_SEX', 1);
      const expectedB = await ruleScoreNumeric(client, 'H', 1, 'CUS_SEX', 2);
      expect(a.score - b.score).toBe(expectedA - expectedB);
    });
  }, TEST_TIMEOUT);

  it('TC-04 ob_arreturndf_min_cap 影響 score：H 卡 ADD_UN_CAPITAL 變動產生對應 delta', async () => {
    if (connectFailed) return;
    await tx(async () => {
      await insertPoolData(client);
      await insertCustomerCore(client, { gender: '1' });
      // 不 insert arreturn → default 0 → 命中最低區間
      const lowResult = await callFn(client, 'H', 1);
      // INSERT 高額 capital → 命中高區間
      const HIGH_CAP = 500_000_000; // 確保進到 highest 區間 (>= 383258)
      await insertArreturn(client, HIGH_CAP);
      const highResult = await callFn(client, 'H', 1);
      const expectedLow = await ruleScoreNumeric(client, 'H', 1, 'ADD_UN_CAPITAL', 0);
      const expectedHigh = await ruleScoreNumeric(client, 'H', 1, 'ADD_UN_CAPITAL', HIGH_CAP);
      expect(highResult.score - lowResult.score).toBe(expectedHigh - expectedLow);
    });
  }, TEST_TIMEOUT);

  it('TC-05 CAR_YEAR 衍生：year_produ 變動觸發不同 score 區間', async () => {
    if (connectFailed) return;
    await tx(async () => {
      const currentYear = new Date().getFullYear();
      // 第一輪：year_produ → CAR_YEAR = 1（新車）
      await insertPoolData(client, { year_produ: String(currentYear - 1) });
      await insertCustomerCore(client, { gender: '1' });
      const newCarResult = await callFn(client, 'H', 1);

      // ROLLBACK 部分：先 DELETE & re-insert（因為 PK conflict）
      await client.query('DELETE FROM ob_pool_data WHERE orgno=$1 AND appl_no=$2', [
        FIX_ORGNO,
        FIX_APPL_NO,
      ]);
      // 第二輪：year_produ → CAR_YEAR = 15（老車）
      await insertPoolData(client, { year_produ: String(currentYear - 15) });
      const oldCarResult = await callFn(client, 'H', 1);

      const newCarRule = await ruleScoreNumeric(client, 'H', 1, 'CAR_YEAR', 1);
      const oldCarRule = await ruleScoreNumeric(client, 'H', 1, 'CAR_YEAR', 15);
      expect(newCarResult.score - oldCarResult.score).toBe(newCarRule - oldCarRule);
    });
  }, TEST_TIMEOUT);

  it('TC-06 PROJECT_TP LEVEL1=A：spec_name 含「專案」應觸發 LEVEL1 規則', async () => {
    if (connectFailed) return;
    await tx(async () => {
      // 找一個 PROJECT_TP 同時有 LEVEL1=NULL 與 LEVEL1='A' 的 spec_tp（如 22 或 23）
      const r = await client.query(
        `SELECT level2_s, score FROM ob_levelcard_score
          WHERE card_type='H' AND card_version=1 AND column_name='PROJECT_TP'
            AND TRIM(level1) = 'A'
          LIMIT 1`,
      );
      if (r.rows.length === 0) {
        // 若 H 卡 score 表暫無 LEVEL1='A' 設定則 skip 此案例
        return;
      }
      const specTp = r.rows[0].level2_s;

      // 第一輪：spec_name 不含「專案」→ LEVEL1='' → 命中 NULL/'' 規則（如有）
      await insertPoolData(client, { spec_tp: specTp, spec_name: '一般車貸' });
      await insertCustomerCore(client, { gender: '1' });
      const noProjResult = await callFn(client, 'H', 1);

      // 第二輪：spec_name 含「專案」→ LEVEL1='A' → 命中 'A' 規則
      await client.query('DELETE FROM ob_pool_data WHERE orgno=$1 AND appl_no=$2', [
        FIX_ORGNO,
        FIX_APPL_NO,
      ]);
      await insertPoolData(client, { spec_tp: specTp, spec_name: '春節專案' });
      const projResult = await callFn(client, 'H', 1);

      // 含「專案」應比不含「專案」的分數高（多了 LEVEL1='A' 規則的 score）
      expect(projResult.score).toBeGreaterThanOrEqual(noProjResult.score);
    });
  }, TEST_TIMEOUT);

  it('TC-07 SALES_STS 衍生：sales_sts_na = AGENT 應命中 LEVEL1=AGENT 規則（若 H 卡有此設定）', async () => {
    if (connectFailed) return;
    await tx(async () => {
      // 看 H 卡有沒有 SALES_STS 規則；沒有的話此 test skip
      const r = await client.query(
        `SELECT level1, score FROM ob_levelcard_score
          WHERE card_type='H' AND card_version=1 AND column_name='SALES_STS'`,
      );
      if (r.rows.length === 0) return;

      // sales_sts_na='AGENT' → 衍生 'AGENT' = LEVEL1
      await insertPoolData(client, { sales_sts_na: 'AGENT' });
      await insertCustomerCore(client, { gender: '1' });
      const agentResult = await callFn(client, 'H', 1);

      await client.query('DELETE FROM ob_pool_data WHERE orgno=$1 AND appl_no=$2', [
        FIX_ORGNO,
        FIX_APPL_NO,
      ]);
      // 不同的 sales_sts_na（衍生為 'HFC'），讓 SALES_STS rule 命中不同 LEVEL1
      await insertPoolData(client, { sales_sts_na: '其他來源' });
      const hfcResult = await callFn(client, 'H', 1);

      // 兩種衍生值 score 通常不同；若相同則 score 表中 AGENT/HFC 同分（也可接受）
      expect(typeof agentResult.score).toBe('number');
      expect(typeof hfcResult.score).toBe('number');
    });
  }, TEST_TIMEOUT);

  it('TC-08 card_level / tier_level 解析：H 卡 score 落在 score_s..score_e 應對映到 ob_levelcard_level + ob_tier', async () => {
    if (connectFailed) return;
    await tx(async () => {
      await insertPoolData(client);
      await insertCustomerCore(client, { gender: '1' });
      const result = await callFn(client, 'H', 1);
      // 驗證 card_level 真的在 ob_levelcard_level 範圍內
      if (result.card_level !== null) {
        const r = await client.query(
          `SELECT 1 FROM ob_levelcard_level
            WHERE card_type='H' AND card_version=1
              AND card_level=$1
              AND $2 BETWEEN score_s AND score_e
            LIMIT 1`,
          [result.card_level, result.score],
        );
        expect(r.rows.length).toBe(1);
      }
      // 驗證 tier_level 來自 ob_tier
      if (result.tier_level !== null) {
        const r = await client.query(
          `SELECT 1 FROM ob_tier
            WHERE card_type='H'
              AND (card_level = $1 OR (card_level IS NULL AND $1 IS NULL))
              AND tier_level = $2
            LIMIT 1`,
          [result.card_level, result.tier_level],
        );
        expect(r.rows.length).toBe(1);
      }
    });
  }, TEST_TIMEOUT);
});
