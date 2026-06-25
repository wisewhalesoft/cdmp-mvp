/**
 * B2 — 計分卡 seed loader 加法式 reconcile + 漂移偵測 + opt-in repair（PG 真庫）
 *
 * 對象：prod-data-seed.ts 之 seedCardTypes / seedVersions / seedColumns / seedScores /
 *       seedLevels / seedTiers + deriveMatchType（六張計分卡表）。
 *
 * 涵蓋設計三層 + 紅線：
 *   1. 空表 → 全插（每表列數 = seed 列數）；行為不退化。
 *   2. 非空但缺 row（先插部分、刻意漏列）→ 再跑只補缺列、既有列不動、總數 = seed。
 *   3. 值漂移（先插一列但改 status/score）→ 預設跑：WARN 有 log、值不變。
 *   4. SEED_REPAIR_DRIFT=true → 值被修回 seed。
 *   5. 冪等：連跑兩次第二次插 0、不報錯。
 *   + match_type：新插 column 依 score 推導正確（不卡 'RANGE'）；既有 column 不被洗。
 *   + ob_tier NULL card_level（M5）NULL-safe reconcile 冪等。
 *
 * 連線：env PG_BOSS_TEST_HOST/PORT/...，預設對 docker-compose.test.yml 之 postgres-test
 *   （5433/cdmp_test）。不可達 → 整 describe skip-with-reason（不假綠）。啟動：
 *     docker compose -f docker-compose.test.yml up -d postgres-test
 *
 * ⚠️ 平行隔離：vitest 預設 file-parallelism 會把多個 spec 檔分配到不同 worker thread
 *   並行執行；本檔六張計分卡表（ob_card_type / ob_levelcard_* / ob_tier）名稱固定，
 *   若與其它觸及同表的 spec 共用 cdmp_test 預設 public schema 會互相洗資料（INSERT 缺列數
 *   飄移、count 對不上）。故本檔在專屬 PG schema（cdmp_b2_seed_test）建表、設 schema 隔離，
 *   確保即使全量平行跑（CI npx vitest run）也不互相干擾。
 */

// ⚠️ 必須最先 import（side-effect 設 DB_TYPE=postgres，供下方 entity 之 dateColumnType 解析為 PG 型別）。
import { restoreDbType } from './pg-env-preload';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import * as net from 'net';
import { DataSource, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';

import {
  seedCardTypes,
  seedVersions,
  seedColumns,
  seedScores,
  seedLevels,
  seedTiers,
  deriveMatchType,
} from '../prod-data-seed';

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};

const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';

// 計分卡 seed 為 row-by-row INSERT（score 370 列 + column 47 列…），在 CI 全量平行跑時
// 共用 PG server 競爭 CPU，預設 5s test timeout 會不足。放寬至 60s（沿 .pg.spec beforeAll 慣例）。
const TEST_TIMEOUT = 60000;

// 專屬隔離 schema：避免與其它平行 spec 在 cdmp_test public schema 共用同名計分卡表互洗。
// 名稱含 pid + 高解析時間 + 隨機 token → 全域唯一，即使 vitest 在高負載時把同檔重派到
// 不同 worker / process，各執行個體仍擁有彼此不可見的獨立 schema，beforeAll 只 DROP 自己的、
// 不會洗到並行執行個體的資料。
const UNIQUE = `${process.pid}_${process.hrtime
  .bigint()
  .toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const TEST_SCHEMA = `cdmp_b2_seed_${UNIQUE}`;

const DATA_DIR = resolve(__dirname, '..', 'data');
function loadSeed<T>(file: string): T[] {
  return JSON.parse(readFileSync(resolve(DATA_DIR, file), 'utf-8')) as T[];
}

const SEED = {
  cardType: loadSeed<any>('ob-card-type.json'),
  version: loadSeed<any>('ob-levelcard-version.json'),
  column: loadSeed<any>('ob-levelcard-column.json'),
  score: loadSeed<any>('ob-levelcard-score.json'),
  level: loadSeed<any>('ob-levelcard-level.json'),
  tier: loadSeed<any>('ob-tier.json'),
};

function pgPortReachable(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: PG.host, port: PG.port });
    const finish = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}

let reachable = false;
let ds: DataSource | null = null;
let qr: QueryRunner;

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[B2 seed reconcile PG] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

async function count(table: string): Promise<number> {
  const r = await qr.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return r[0]?.n ?? 0;
}

// 全檔放寬 test / hook timeout（row-by-row INSERT 在 CI 平行高負載下需更久）。
vi.setConfig({ testTimeout: TEST_TIMEOUT, hookTimeout: TEST_TIMEOUT });

beforeAll(async () => {
  reachable = await pgPortReachable();
  if (!reachable) return;
  // 先以 bootstrap 連線重建專屬隔離 schema（DROP→CREATE 確保乾淨）。
  let bootstrap: DataSource | null = null;
  try {
    bootstrap = new DataSource({
      type: 'postgres',
      host: PG.host,
      port: PG.port,
      username: PG.user,
      password: PG.password,
      database: PG.database,
    });
    await bootstrap.initialize();
    await bootstrap.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await bootstrap.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    await bootstrap.destroy();
    bootstrap = null;

    ds = new DataSource({
      type: 'postgres',
      host: PG.host,
      port: PG.port,
      username: PG.user,
      password: PG.password,
      database: PG.database,
      // schema 隔離：synchronize 於此 schema 建表；連線 search_path 指向它，
      // 使 prod-data-seed.ts 之 unqualified 表名（ob_card_type…）解析到隔離 schema。
      schema: TEST_SCHEMA,
      entities: [
        ObCardType,
        ObLevelcardVersion,
        ObLevelcardColumn,
        ObLevelcardScore,
        ObLevelcardLevel,
        ObTier,
      ],
      synchronize: true,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[B2 seed reconcile PG] init failed → skip:', (e as Error)?.message);
    if (bootstrap) await bootstrap.destroy().catch(() => {});
    reachable = false;
    ds = null;
    return;
  }
  qr = ds.createQueryRunner();
  await qr.connect();
  // 確保此 QueryRunner 連線 search_path 指向隔離 schema（unqualified 名解析）。
  await qr.query(`SET search_path TO ${TEST_SCHEMA}`);
}, 60000);

afterAll(async () => {
  if (ds) {
    await qr.release();
    await ds.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  for (const t of [
    'ob_card_type',
    'ob_levelcard_version',
    'ob_levelcard_column',
    'ob_levelcard_score',
    'ob_levelcard_level',
    'ob_tier',
  ]) {
    await qr.query(`DELETE FROM ${t}`);
  }
  delete process.env.SEED_REPAIR_DRIFT;
});

afterEach(() => {
  delete process.env.SEED_REPAIR_DRIFT;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. 空表 → 全插（每表列數 = seed 列數）
// ---------------------------------------------------------------------------
describe('① 空表全插（行為不退化）', () => {
  it('六張表皆插入 seed 全量列數', async (ctx) => {
    ensurePg(ctx);
    await seedCardTypes(qr);
    await seedVersions(qr);
    await seedColumns(qr);
    await seedScores(qr);
    await seedLevels(qr);
    await seedTiers(qr);

    expect(await count('ob_card_type')).toBe(SEED.cardType.length);
    expect(await count('ob_levelcard_version')).toBe(SEED.version.length);
    expect(await count('ob_levelcard_column')).toBe(SEED.column.length);
    expect(await count('ob_levelcard_score')).toBe(SEED.score.length);
    expect(await count('ob_levelcard_level')).toBe(SEED.level.length);
    expect(await count('ob_tier')).toBe(SEED.tier.length);
  });

  it('column_label 中文標籤於空表全插後補齊（非 NULL）', async (ctx) => {
    ensurePg(ctx);
    await seedColumns(qr);
    const labelled = await qr.query(
      `SELECT COUNT(*)::int AS n FROM ob_levelcard_column WHERE column_label IS NOT NULL`,
    );
    const seedLabelled = SEED.column.filter((c: any) => c.column_label !== null).length;
    expect(labelled[0].n).toBe(seedLabelled);
  });
});

// ---------------------------------------------------------------------------
// 2. 非空但缺 row → 只補缺、既有不動、總數 = seed
// ---------------------------------------------------------------------------
describe('② 加法式補缺（不碰既有列）', () => {
  it('ob_card_type：先插部分→補缺後總數=seed、既有列原值保留', async (ctx) => {
    ensurePg(ctx);
    // 先插 2 列（H / S），其中 H 的 card_name 故意設成業務改過的值
    await qr.query(
      `INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
       VALUES ('H', '期中（業務改名）', '01', 'active', NOW(), 'BIZ', NOW(), 'BIZ'),
              ('S', '中結', '01', 'active', NOW(), 'BIZ', NOW(), 'BIZ')`,
    );
    expect(await count('ob_card_type')).toBe(2);

    await seedCardTypes(qr);

    // 總數 = seed 全量
    expect(await count('ob_card_type')).toBe(SEED.cardType.length);
    // 既有 H 列的 card_name 業務值未被洗（reconcile 不碰既有列 + status 才是值欄，
    // card_name 雖在值欄但 H 既存 → 偵測漂移但預設不改）
    const h = await qr.query(`SELECT card_name FROM ob_card_type WHERE card_type='H'`);
    expect(h[0].card_name).toBe('期中（業務改名）');
    // 缺的列（E / S5 / E5 / M）已補
    const e = await qr.query(`SELECT card_name FROM ob_card_type WHERE card_type='E'`);
    expect(e[0].card_name).toBe('滿期');
  });

  it('ob_levelcard_score：缺列補齊、既有列不重複', async (ctx) => {
    ensurePg(ctx);
    // 先插 1 列（H/CUS_SEX/level2_s=1）
    await qr.query(
      `INSERT INTO ob_levelcard_score (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
       VALUES ('H', 1, 'CUS_SEX', NULL, '1', '1', 30, NOW(), NOW())`,
    );
    await seedScores(qr);
    expect(await count('ob_levelcard_score')).toBe(SEED.score.length);
    // 該既有列不應變成 2 筆
    const dup = await qr.query(
      `SELECT COUNT(*)::int AS n FROM ob_levelcard_score
        WHERE card_type='H' AND card_version=1 AND column_name='CUS_SEX'
          AND level1 IS NULL AND level2_s='1' AND level2_e='1'`,
    );
    expect(dup[0].n).toBe(1);
  });

  it('ob_tier：M5 NULL card_level NULL-safe 補缺（不誤插重複）', async (ctx) => {
    ensurePg(ctx);
    // 先插 M5（card_level=NULL）那筆
    await qr.query(
      `INSERT INTO ob_tier (list_nm, card_type, card_level, tier_level)
       VALUES ('機車中結滿期名單', 'M5', NULL, 'T5')`,
    );
    await seedTiers(qr);
    expect(await count('ob_tier')).toBe(SEED.tier.length);
    // M5 NULL 那筆仍只有 1 筆（IS NOT DISTINCT FROM 認得 NULL=NULL，不重插）
    const m5 = await qr.query(
      `SELECT COUNT(*)::int AS n FROM ob_tier WHERE card_type='M5' AND card_level IS NULL`,
    );
    expect(m5[0].n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. 值漂移 → 預設只 WARN、不改
// ---------------------------------------------------------------------------
describe('③ 漂移偵測（預設 WARN-only）', () => {
  it('ob_card_type status 漂移：有 console.warn、值不變', async (ctx) => {
    ensurePg(ctx);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 先插 H，但 status 改成 inactive（漂移）
    await qr.query(
      `INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
       VALUES ('H', '期中', '01', 'inactive', NOW(), 'BIZ', NOW(), 'BIZ')`,
    );
    await seedCardTypes(qr);

    // WARN 有被觸發且指向 status 漂移
    const warned = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warned).toMatch(/漂移/);
    expect(warned).toMatch(/ob_card_type/);
    expect(warned).toMatch(/status/);
    // 值未被改回 active（預設不修）
    const h = await qr.query(`SELECT status FROM ob_card_type WHERE card_type='H'`);
    expect(h[0].status).toBe('inactive');
  });

  it('ob_levelcard_score score 漂移：預設不修（保留業務 UI 改動）', async (ctx) => {
    ensurePg(ctx);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // seed H/CUS_SEX/level2_s=1 的 score=30；先插但改成 99
    await qr.query(
      `INSERT INTO ob_levelcard_score (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
       VALUES ('H', 1, 'CUS_SEX', NULL, '1', '1', 99, NOW(), NOW())`,
    );
    await seedScores(qr);
    const s = await qr.query(
      `SELECT score FROM ob_levelcard_score
        WHERE card_type='H' AND card_version=1 AND column_name='CUS_SEX'
          AND level2_s='1' AND level2_e='1'`,
    );
    expect(s[0].score).toBe(99); // 不被洗回 30
  });
});

// ---------------------------------------------------------------------------
// 4. SEED_REPAIR_DRIFT=true → 修回 seed 值
// ---------------------------------------------------------------------------
describe('④ opt-in repair（SEED_REPAIR_DRIFT=true）', () => {
  it('ob_card_type status 漂移 → 修回 seed 值 active', async (ctx) => {
    ensurePg(ctx);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.SEED_REPAIR_DRIFT = 'true';
    await qr.query(
      `INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
       VALUES ('H', '期中', '01', 'inactive', NOW(), 'BIZ', NOW(), 'BIZ')`,
    );
    await seedCardTypes(qr);
    const h = await qr.query(`SELECT status FROM ob_card_type WHERE card_type='H'`);
    expect(h[0].status).toBe('active'); // 修回 seed
  });

  it('ob_levelcard_score score 漂移 → 修回 seed 值 30', async (ctx) => {
    ensurePg(ctx);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.SEED_REPAIR_DRIFT = 'true';
    await qr.query(
      `INSERT INTO ob_levelcard_score (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
       VALUES ('H', 1, 'CUS_SEX', NULL, '1', '1', 99, NOW(), NOW())`,
    );
    await seedScores(qr);
    const s = await qr.query(
      `SELECT score FROM ob_levelcard_score
        WHERE card_type='H' AND card_version=1 AND column_name='CUS_SEX'
          AND level2_s='1' AND level2_e='1'`,
    );
    expect(s[0].score).toBe(30); // 修回 seed
  });

  it('repair 僅改漂移欄、不新增/不刪列', async (ctx) => {
    ensurePg(ctx);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.SEED_REPAIR_DRIFT = 'true';
    // 全量插入後改 1 列 status
    await seedCardTypes(qr);
    await qr.query(`UPDATE ob_card_type SET status='inactive' WHERE card_type='S'`);
    process.env.SEED_REPAIR_DRIFT = 'true';
    await seedCardTypes(qr);
    expect(await count('ob_card_type')).toBe(SEED.cardType.length); // 列數不變
    const s = await qr.query(`SELECT status FROM ob_card_type WHERE card_type='S'`);
    expect(s[0].status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// 5. 冪等：連跑兩次第二次插 0、不報錯
// ---------------------------------------------------------------------------
describe('⑤ 冪等（連跑兩次第二次插 0）', () => {
  it('六表連跑兩次：列數穩定、無錯', async (ctx) => {
    ensurePg(ctx);
    const runAll = async () => {
      await seedCardTypes(qr);
      await seedVersions(qr);
      await seedColumns(qr);
      await seedScores(qr);
      await seedLevels(qr);
      await seedTiers(qr);
    };
    await runAll();
    const after1 = {
      cardType: await count('ob_card_type'),
      version: await count('ob_levelcard_version'),
      column: await count('ob_levelcard_column'),
      score: await count('ob_levelcard_score'),
      level: await count('ob_levelcard_level'),
      tier: await count('ob_tier'),
    };
    await expect(runAll()).resolves.not.toThrow();
    expect(await count('ob_card_type')).toBe(after1.cardType);
    expect(await count('ob_levelcard_version')).toBe(after1.version);
    expect(await count('ob_levelcard_column')).toBe(after1.column);
    expect(await count('ob_levelcard_score')).toBe(after1.score);
    expect(await count('ob_levelcard_level')).toBe(after1.level);
    expect(await count('ob_tier')).toBe(after1.tier);
    // 全部 = seed 全量（無多插無漏插）
    expect(after1.cardType).toBe(SEED.cardType.length);
    expect(after1.tier).toBe(SEED.tier.length);
  });
});

// ---------------------------------------------------------------------------
// + match_type derive：新插 column 依 score 推導；既有 column 不被洗
// ---------------------------------------------------------------------------
describe('⑥ match_type derive（僅新列、不洗既有）', () => {
  it('空表全插後 derive：CATEGORY / COMPOSITE / RANGE 正確、無新列卡 RANGE', async (ctx) => {
    ensurePg(ctx);
    const { insertedKeys } = await seedColumns(qr);
    await seedScores(qr);
    await deriveMatchType(qr, insertedKeys);

    // E5/CO_NUM_NM → CATEGORY（level1 有、level2_s 無）
    const cat = await qr.query(
      `SELECT match_type FROM ob_levelcard_column WHERE card_type='E5' AND column_name='CO_NUM_NM'`,
    );
    expect(cat[0]?.match_type).toBe('CATEGORY');
    // H/PROJECT_TP → COMPOSITE（level1 有、level2_s 有）
    const comp = await qr.query(
      `SELECT match_type FROM ob_levelcard_column WHERE card_type='H' AND column_name='PROJECT_TP'`,
    );
    expect(comp[0]?.match_type).toBe('COMPOSITE');
    // H/CUS_SEX → RANGE（level1 無、level2_s 有）
    const rng = await qr.query(
      `SELECT match_type FROM ob_levelcard_column WHERE card_type='H' AND column_name='CUS_SEX'`,
    );
    expect(rng[0]?.match_type).toBe('RANGE');
  });

  it('既有 column 的業務 match_type 不被 derive 覆寫（僅補缺列 derive）', async (ctx) => {
    ensurePg(ctx);
    // 先插「業務調過」的 PROJECT_TP（card_type H），match_type 手動設 CATEGORY（與推導 COMPOSITE 不同）
    await qr.query(
      `INSERT INTO ob_levelcard_column (card_type, card_version, column_name, column_label, status, match_type, created_at, updated_at)
       VALUES ('H', 1, 'PROJECT_TP', '專案類別', 'active', 'CATEGORY', NOW(), NOW())`,
    );
    const { insertedKeys } = await seedColumns(qr);
    await seedScores(qr);
    await deriveMatchType(qr, insertedKeys);

    // PROJECT_TP 既存 → 不在 insertedKeys → match_type 保留業務值 CATEGORY（未被洗成 COMPOSITE）
    const proj = await qr.query(
      `SELECT match_type FROM ob_levelcard_column WHERE card_type='H' AND column_name='PROJECT_TP'`,
    );
    expect(proj[0].match_type).toBe('CATEGORY');
    // PROJECT_TP 不應在新插清單
    expect(
      insertedKeys.some((k) => k.card_type === 'H' && k.column_name === 'PROJECT_TP'),
    ).toBe(false);
    // 但其它新補列（如 CO_NUM_NM）仍正確 derive
    const cat = await qr.query(
      `SELECT match_type FROM ob_levelcard_column WHERE card_type='E5' AND column_name='CO_NUM_NM'`,
    );
    expect(cat[0].match_type).toBe('CATEGORY');
  });
});
