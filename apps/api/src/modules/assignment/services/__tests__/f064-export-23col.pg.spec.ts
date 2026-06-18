/**
 * F064 v2.1 — 匯出分派結果（23 欄）PG 真庫整合測試（強制 Postgres）
 *
 * v2.1 修正（I-EXP-LINEAGE-01）：pool 母體 join 由 ob_pool_data_list（per-list 去重表，會掉列）
 *   改為 ob_pool_data（共享池，PK=orgno+appl_no）——result 母體血緣源頭。seed 改 seed ob_pool_data。
 *
 * 對應 test spec：docs/test-specs/features/F064-test.md 需 Postgres 群組：
 *   - LINEAGE-001：匯出列數 == ob_monthly_run_result 列數（不掉列）
 *   - COLSRC-001~003/006：INNER JOIN ob_pool_data / LEFT JOIN emphire / LEFT JOIN list_def / 每列一筆
 *   - COLSEQ-001/003：xlsx 表頭 23 欄 + worked example 端到端逐欄
 *   - CR-001/003：is_cr='Y' CR 三欄非空；混合案件共存
 *   - SCOPE-003/004：section_chief 僅含轄區列；無轄區→僅表頭
 *   - DET-001：同 run 兩次匯出列序相同
 *   - APLDATE-001：進件日取 ob_pool_data.appl_date（非 run_result.appl_date）
 *
 * 連線：env PG_BOSS_TEST_*（預設 docker-compose.test.yml postgres-test 5433/cdmp_test）。
 * 不可達 → 整 describe skip-with-reason（不假綠）。
 *
 * ⚠️ CI 序列：與 F098~F102 pg.spec 共用 cdmp_test DB（DROP/synchronize），一次跑一個檔案。
 */

// ⚠️ 必須最先 import（side-effect 設 DB_TYPE=postgres，讓 entity dateColumnType 解析 PG 型別）。
import { restoreDbType } from '../../stage1/__tests__/pg-env-preload';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as net from 'net';
import { DataSource, Repository } from 'typeorm';

import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { AssignmentRunReportService, EXPORT_HEADER_V2 } from '../assignment-run-report.service';
import { SectionChiefScopeService } from '../section-chief-scope.service';

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};

const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';

const RUN_ID = '00000000-0000-0000-0000-0000000000f1';
const YM = '202606';
const LIST_NO = 'OB202606001';
// actor_id 為 uuid 欄位（NOT NULL）；PG 拒絕非 UUID 字串。用合法 UUID 充當 actor。
const ACTOR_DEFAULT = '00000000-0000-0000-0000-0000000000a0';
const ACTOR_SC = '00000000-0000-0000-0000-0000000000a1';
const ACTOR_SC_EMPTY = '00000000-0000-0000-0000-0000000000a2';
const ACTOR_DIR = '00000000-0000-0000-0000-0000000000a3';

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
let service: AssignmentRunReportService;
let runRepo: Repository<AssignmentRun>;
let resultRepo: Repository<ObMonthlyRunResult>;
let poolRepo: Repository<ObPoolData>;
let emphireRepo: Repository<ObEmphire>;
let listDefRepo: Repository<ObListDefinition>;
let emplSetRepo: Repository<ObEmplSet>;
let auditRepo: Repository<AssignmentAuditLog>;

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F064 PG Integration] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

interface SeedCaseOpts {
  applNo: string;
  orgno?: string;
  emplid: string;
  isCr?: string;
  crId?: string | null;
  crNm?: string | null;
  tier?: string;
  deptId?: string;
  assignday?: string;
  poolApplDate?: string;
  resultApplDate?: string;
  poolDeptName?: string;
  projectTp?: string;
  specName?: string;
  proRate?: string;
  staCode?: string;
  staCodeNa?: string;
  brandName?: string;
  monthCnt?: number;
}

async function seedCase(o: SeedCaseOpts): Promise<void> {
  const orgno = o.orgno ?? '01';
  // I-EXP-LINEAGE-01：pool 母體為 ob_pool_data（PK=orgno+appl_no，無 list_no）。
  await poolRepo.insert({
    orgno,
    appl_no: o.applNo,
    custo_no: `C${o.applNo}`,
    dept_name: o.poolDeptName ?? '台北分處',
    appl_date: (o.poolApplDate ?? '2025-03-01') as unknown as Date,
    project_tp: o.projectTp ?? '01',
    spec_name: o.specName ?? '優質專案',
    overdue_day: null,
    pro_rate: (o.proRate ?? '12.50') as unknown as string,
    sta_code: o.staCode ?? 'A1',
    sta_code_na: o.staCodeNa ?? '正常',
    brand_name: o.brandName ?? 'Toyota',
    month_cnt: o.monthCnt ?? 3,
    dept_id: o.deptId ?? 'XVE1',
    list_type: '01',
    settle_src: 'N',
    _cdmp_extracted_at: new Date(),
  } as never);
  await resultRepo.insert({
    run_id: RUN_ID,
    list_no: LIST_NO,
    orgno,
    appl_no: o.applNo,
    settle_src: 'N',
    is_cr: o.isCr ?? 'N',
    cr_id: o.crId ?? null,
    cr_nm: o.crNm ?? null,
    tier_level: o.tier ?? 'T2',
    dept_id: o.deptId ?? 'XVE1',
    emplid: o.emplid,
    assignday: o.assignday ?? '20260601',
    appl_date: (o.resultApplDate ?? '2025-03-01') as unknown as Date,
    result_status: 'PENDING',
    created_at: new Date(),
    updated_at: new Date(),
  } as never);
}

async function csvExport(
  actor?: { userId: string; role: string; businessRole?: string | null },
): Promise<string[][]> {
  const out = await service.exportResult(
    RUN_ID,
    'csv',
    actor?.userId ?? ACTOR_DEFAULT,
    actor ?? null,
  );
  return (out.body as string)
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => l.split(','));
}

beforeAll(async () => {
  reachable = await pgPortReachable();
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'postgres',
      host: PG.host,
      port: PG.port,
      username: PG.user,
      password: PG.password,
      database: PG.database,
      entities: [
        ObMonthlyRunResult,
        ObPoolData,
        ObEmphire,
        ObListDefinition,
        ObEmplSet,
        AssignmentRun,
        AssignmentRunSnapshot,
        AssignmentAuditLog,
        User,
      ],
      synchronize: true,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F064 PG Integration] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  runRepo = ds.getRepository(AssignmentRun);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  poolRepo = ds.getRepository(ObPoolData);
  emphireRepo = ds.getRepository(ObEmphire);
  listDefRepo = ds.getRepository(ObListDefinition);
  emplSetRepo = ds.getRepository(ObEmplSet);
  auditRepo = ds.getRepository(AssignmentAuditLog);

  const scope = new SectionChiefScopeService(
    emplSetRepo,
    emphireRepo,
    ds.getRepository(User),
  );
  service = new AssignmentRunReportService(
    runRepo,
    ds.getRepository(AssignmentRunSnapshot),
    auditRepo,
    scope,
    ds,
  );
}, 60000);

afterAll(async () => {
  if (ds) {
    await ds.query('DROP TABLE IF EXISTS ob_monthly_run_result CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_emphire CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_list_definition CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_empl_set CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run_snapshot CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_audit_log CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run CASCADE');
    await ds.query('DROP TABLE IF EXISTS users CASCADE');
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await ds.query('DELETE FROM ob_monthly_run_result');
  await ds.query('DELETE FROM ob_pool_data');
  await ds.query('DELETE FROM ob_emphire');
  await ds.query('DELETE FROM ob_list_definition');
  await ds.query('DELETE FROM ob_empl_set');
  await ds.query('DELETE FROM assignment_audit_log');
  await ds.query('DELETE FROM assignment_run');
  await runRepo.insert({
    run_id: RUN_ID,
    project_workym: YM,
    status: 'completed',
    triggered_by: '00000000-0000-0000-0000-000000000001',
    total_cases: 100,
    duration_ms: 1000,
    finished_at: new Date(),
    created_at: new Date(),
  } as never);
  await listDefRepo.insert({
    list_no: LIST_NO,
    list_nm: '2026年6月汽車名單',
    created_by_prog: 'TEST',
    created_by: 'tester',
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: 'tester',
    updated_at: new Date(),
    prod_kind: '01',
    list_type: '01',
    list_period_start: '001',
    list_period_end: '030',
    list_interval: '001',
    status: 'active',
    stage: 'ready',
    cr_enabled: false,
  } as never);
});

describe('F064 v2.1 — 匯出分派結果（23 欄）PG Integration', () => {
  it('TS-F064-COLSRC-001/003/COLSEQ-003：INNER JOIN ob_pool_data + LEFT JOIN list_def 逐欄', async (ctx) => {
    ensurePg(ctx);
    await emphireRepo.insert({
      emp_id: 'E003',
      emp_nm: '王小明',
      title_name: '專員',
      dept_name: '電銷一課',
    } as never);
    await seedCase({ applNo: 'A001', emplid: 'E003', isCr: 'Y', crId: 'E003', crNm: '王小明' });
    const rows = await csvExport();
    expect(rows[0]).toEqual([...EXPORT_HEADER_V2]);
    const r = rows[1];
    expect(r[0]).toBe('台北分處'); // 分處（ob_pool_data.dept_name）
    expect(r[1]).toBe('A001'); // 案號
    expect(r[2]).toBe('20260601'); // 指派日
    expect(r[3]).toBe(LIST_NO); // 名單代號
    expect(r[4]).toBe('2026年6月汽車名單'); // 名單名稱（list_def）
    expect(r[5]).toBe('2025/03/01'); // 進件日（ob_pool_data.appl_date）
    expect(r[6]).toBe('E003'); // CR_ID
    expect(r[11]).toBe('電銷一課'); // 部門名稱（emphire）
    expect(r[13]).toBe('王小明'); // 姓名（emphire）
    expect(r[14]).toBe('專員'); // 職級（emphire）
    expect(r[18]).toBe('12.50'); // 客戶利率（ob_pool_data.pro_rate）
  });

  it('TS-F064-LINEAGE-001：匯出列數 == ob_monthly_run_result 列數（不掉列，I-EXP-LINEAGE-01）', async (ctx) => {
    ensurePg(ctx);
    // 25 筆 result 全來自 ob_pool_data（共享池）；**完全不 seed ob_pool_data_list**。
    // 舊版 INNER JOIN ob_pool_data_list 會掉光全部 25 列（list 表空）；新版血緣 join 不掉列。
    for (let i = 0; i < 25; i++) {
      await seedCase({ applNo: `A${String(i).padStart(3, '0')}`, emplid: 'E1' });
    }
    const resultCount = await resultRepo.count({ where: { run_id: RUN_ID } });
    expect(resultCount).toBe(25);
    const rows = await csvExport();
    // 匯出資料列（排除表頭）== result 列數
    expect(rows.length - 1).toBe(resultCount);
    const out = await service.exportResult(RUN_ID, 'csv', ACTOR_DEFAULT, null);
    expect(out.rowCount).toBe(resultCount);
  });

  it('TS-F064-COLSRC-002 / JOINMISS：LEFT JOIN emphire join-miss 三欄空、員編原值、不中斷', async (ctx) => {
    ensurePg(ctx);
    // emphire 無 X999；有 E003
    await emphireRepo.insert({ emp_id: 'E003', emp_nm: '王小明', title_name: '專員', dept_name: '電銷一課' } as never);
    await seedCase({ applNo: 'A001', emplid: 'E003' });
    await seedCase({ applNo: 'A099', emplid: 'X999', poolDeptName: '台中分處' });
    const rows = await csvExport();
    expect(rows.length).toBe(3); // header + 2
    // ORDER BY appl_no → A001 先
    const miss = rows.find((r) => r[1] === 'A099')!;
    expect(miss[11]).toBe(''); // 部門名稱空
    expect(miss[12]).toBe('X999'); // 員編原值
    expect(miss[13]).toBe(''); // 姓名空
    expect(miss[14]).toBe(''); // 職級空
  });

  it('TS-F064-COLSRC-006：每列一筆分派紀錄（10 筆 → 10 列）', async (ctx) => {
    ensurePg(ctx);
    for (let i = 0; i < 10; i++) {
      await seedCase({ applNo: `A${String(i).padStart(3, '0')}`, emplid: 'E1' });
    }
    const rows = await csvExport();
    expect(rows.length).toBe(11); // header + 10
  });

  it('TS-F064-CR-001/003：is_cr=Y CR 三欄非空 / is_cr=N 空值；混合共存', async (ctx) => {
    ensurePg(ctx);
    await seedCase({ applNo: 'A001', emplid: 'E1', isCr: 'Y', crId: 'CR01', crNm: '張三' });
    await seedCase({ applNo: 'A002', emplid: 'E2', isCr: 'N', crId: null, crNm: null });
    const rows = await csvExport();
    const y = rows.find((r) => r[1] === 'A001')!;
    const n = rows.find((r) => r[1] === 'A002')!;
    expect(y[6]).toBe('CR01'); // CR_ID
    expect(y[7]).toBe('張三'); // CR_NM
    expect(y[8]).toBe('Y');
    expect(n[6]).toBe(''); // CR_ID 空
    expect(n[7]).toBe(''); // CR_NM 空
    expect(n[8]).toBe('N');
  });

  it('TS-F064-APLDATE-001：進件日取 pool.appl_date 非 run_result.appl_date', async (ctx) => {
    ensurePg(ctx);
    // pool=2025-03-01；result=2025-04-01（不同值用以區分）
    await seedCase({
      applNo: 'A001',
      emplid: 'E1',
      poolApplDate: '2025-03-01',
      resultApplDate: '2025-04-01',
    });
    const rows = await csvExport();
    expect(rows[1][5]).toBe('2025/03/01'); // pool 端，非 2025/04/01
  });

  it('TS-F064-DET-001：同 run_id 兩次匯出列序完全相同', async (ctx) => {
    ensurePg(ctx);
    // 故意亂序 insert（appl_no 非遞增）
    for (const a of ['A050', 'A001', 'A030', 'A002', 'A010']) {
      await seedCase({ applNo: a, emplid: 'E1' });
    }
    const r1 = (await csvExport()).slice(1).map((r) => r[1]);
    const r2 = (await csvExport()).slice(1).map((r) => r[1]);
    expect(r1).toEqual(r2);
    // ORDER BY list_no, orgno, appl_no → appl_no 升冪
    expect(r1).toEqual(['A001', 'A002', 'A010', 'A030', 'A050']);
  });

  it('TS-F064-SCOPE-003：section_chief 僅含轄區資料列；director 全量', async (ctx) => {
    ensurePg(ctx);
    // 轄區：ACTOR_SC 擁有 E1（ob_empl_set.created_by=ACTOR_SC）；E2 屬他人
    await emplSetRepo.insert({
      list_no: LIST_NO,
      deptid_m: 'XVE1',
      emplid: 'E1',
      ration: '50',
      created_by_prog: 'TEST',
      created_by: ACTOR_SC,
      created_at: new Date(),
      updated_by_prog: 'TEST',
      updated_by: ACTOR_SC,
      updated_at: new Date(),
    } as never);
    await seedCase({ applNo: 'A001', emplid: 'E1' });
    await seedCase({ applNo: 'A002', emplid: 'E2' });
    const scRows = await csvExport({ userId: ACTOR_SC, role: 'user', businessRole: 'section_chief' });
    expect(scRows.length).toBe(2); // header + 1（僅 E1）
    expect(scRows[1][12]).toBe('E1');
    const dirRows = await csvExport({ userId: ACTOR_DIR, role: 'user', businessRole: 'director' });
    expect(dirRows.length).toBe(3); // header + 2（全量）
  });

  it('TS-F064-SCOPE-004：section_chief 無轄區 → 200 + 僅表頭（0 列）', async (ctx) => {
    ensurePg(ctx);
    await seedCase({ applNo: 'A001', emplid: 'E1' });
    const out = await service.exportResult(RUN_ID, 'csv', ACTOR_SC_EMPTY, {
      userId: ACTOR_SC_EMPTY,
      role: 'user',
      businessRole: 'section_chief',
    });
    const rows = (out.body as string).split('\n').filter((l) => l.length > 0);
    expect(rows.length).toBe(1); // 僅表頭
    expect(out.rowCount).toBe(0);
    // 稽核 exportedRowCount=0
    const logs = await auditRepo.find();
    expect((logs[0].after_value as any).exportedRowCount).toBe(0);
    expect((logs[0].after_value as any).scopedByCreator).toBe(true);
  });

  it('TS-F064-COLSEQ-001：xlsx 表頭 23 欄', async (ctx) => {
    ensurePg(ctx);
    await seedCase({ applNo: 'A001', emplid: 'E1' });
    const out = await service.exportResult(RUN_ID, 'xlsx', ACTOR_DEFAULT, null);
    const buf = out.body as Buffer;
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
    const wb = new (await import('exceljs')).Workbook();
    await wb.xlsx.load(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    const sheet = wb.getWorksheet('assignment_result')!;
    const header = sheet.getRow(1);
    const values: string[] = [];
    for (let c = 1; c <= 23; c++) values.push(String(header.getCell(c).value ?? ''));
    expect(values).toEqual([...EXPORT_HEADER_V2]);
  });
});
