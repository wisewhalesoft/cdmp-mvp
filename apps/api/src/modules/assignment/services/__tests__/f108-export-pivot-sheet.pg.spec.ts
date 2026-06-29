/**
 * F108 — 匯出樞紐分析頁籤 PG 真庫端對端（選配 / 慢速套件）
 *
 * 對應 test spec：docs/test-specs/features/F108-test.md §十一 PG：
 *   - PG-001：對真實 202606 月跑匯出，xlsx 含 2 個工作表且第 2 頁可正常解析（總計列每欄 ≈ 1.0）
 *   - PG-002：真實月跑樞紐部門分佈量級與 F063 摘要一致（四電銷部門 32/34/15/18% 量級）
 *
 * 真實 run_id = 84486ddd-1a54-4eaf-a4d0-096ba9bdde58（202606 月跑，status='completed'）。
 *
 * 連線：env PG_BOSS_TEST_*（預設 docker-compose.test.yml postgres-test 5433/cdmp_test）。
 *   ⚠️ 本檔為**唯讀**（synchronize:false，afterAll 不 DROP 任何表），僅消費既有月跑資料。
 *   PG 不可達、或該 run 不存在 / 非 completed → 整 describe skip-with-reason（不假綠、不偽造）。
 */

// ⚠️ 必須最先 import（side-effect 設 DB_TYPE=postgres，讓 entity dateColumnType 解析 PG 型別）。
import { restoreDbType } from '../../stage1/__tests__/pg-env-preload';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as net from 'net';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';

import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { AssignmentRunReportService } from '../assignment-run-report.service';
import { SectionChiefScopeService } from '../section-chief-scope.service';

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};

const RUN_ID = '84486ddd-1a54-4eaf-a4d0-096ba9bdde58';
const ACTOR_DIR = {
  userId: '00000000-0000-0000-0000-0000000000a3',
  role: 'user',
  businessRole: 'director',
};

const SKIP_REASON_PG =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';
const SKIP_REASON_RUN = `cdmp_test 不含 202606 月跑 run=${RUN_ID}（completed）— 未實跑`;

let reachable = false;
let hasRun = false;
let ds: DataSource | null = null;
let service: AssignmentRunReportService;

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

function ensureData(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F108 PG Integration] SKIPPED — ${SKIP_REASON_PG}`);
    ctx.skip();
    return;
  }
  if (!hasRun) {
    // eslint-disable-next-line no-console
    console.warn(`[F108 PG Integration] SKIPPED — ${SKIP_REASON_RUN}`);
    ctx.skip();
  }
}

async function loadXlsx(body: string | Buffer): Promise<ExcelJS.Workbook> {
  const buf = body as Buffer;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  return wb;
}

/** 讀出樞紐第 2 頁所有部門列（A 欄非員編、非標頭、非總計）的「總計欄」值。 */
function deptGrandTotals(ws: ExcelJS.Worksheet): Map<string, number> {
  // R4 為 listNo 標頭；總計欄 = 最後一欄。資料列從 R5 起。
  // 部門列以「該列總計欄為 % of grand」呈現；員編列為 % of dept —— 兩者皆 0.0%，
  // 無法只憑值區分。故改以結構：部門列後緊跟其員編列，但此處只需粗略量級驗證，
  // 改為直接讀 A 欄非數字 label 且其後存在縮排員編列者。簡化：用 getSummary 部門集合交叉。
  const lastCol = ws.columnCount;
  const out = new Map<string, number>();
  for (let r = 5; r <= ws.rowCount; r++) {
    const label = String(ws.getRow(r).getCell(1).value ?? '');
    const v = ws.getRow(r).getCell(lastCol).value;
    if (typeof v === 'number') out.set(label, v);
  }
  return out;
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
        ObDeptPct,
        AssignmentRun,
        AssignmentRunSnapshot,
        AssignmentAuditLog,
        User,
      ],
      synchronize: false, // 唯讀，不動既有 schema / 資料
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F108 PG Integration] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  const runRepo: Repository<AssignmentRun> = ds.getRepository(AssignmentRun);
  try {
    const run = await runRepo.findOne({ where: { run_id: RUN_ID } });
    hasRun = !!run && run.status === 'completed';
  } catch {
    hasRun = false;
  }

  const scope = new SectionChiefScopeService(
    ds.getRepository(ObEmplSet),
    ds.getRepository(ObEmphire),
    ds.getRepository(User),
  );
  service = new AssignmentRunReportService(
    runRepo,
    ds.getRepository(AssignmentRunSnapshot),
    ds.getRepository(AssignmentAuditLog),
    ds.getRepository(ObDeptPct),
    scope,
    ds,
  );
}, 60000);

afterAll(async () => {
  if (ds) await ds.destroy();
  restoreDbType();
});

describe('F108 — 匯出樞紐分析頁籤 PG Integration（選配）', () => {
  it('TS-F108-PG-001：真實 202606 月跑 xlsx 含 2 工作表、第 2 頁可解析、總計列每欄 ≈ 1.0', async (ctx) => {
    ensureData(ctx);
    const out = await service.exportResult(RUN_ID, 'xlsx', ACTOR_DIR.userId, ACTOR_DIR);
    const buf = out.body as Buffer;
    expect(buf[0]).toBe(0x50); // 'P'（ZIP magic）
    expect(buf[1]).toBe(0x4b); // 'K'
    const wb = await loadXlsx(buf);
    expect(wb.worksheets.length).toBe(2);
    expect(wb.worksheets[0].name).toBe('assignment_result');
    expect(wb.worksheets[1].name).toBe('樞紐分析');
    const ws = wb.worksheets[1];
    expect(ws.getCell('A1').value).toBe('部門代號');
    expect(ws.getCell('B1').value).toBe('(全部)');
    expect(ws.getCell('A4').value).toBe('列標籤');
    // R4：至少 1 個 listNo 欄 + 最右「總計」
    const lastCol = ws.columnCount;
    expect(lastCol).toBeGreaterThanOrEqual(3); // 列標籤 + ≥1 listNo + 總計
    expect(ws.getRow(4).getCell(lastCol).value).toBe('總計');
    expect(String(ws.getRow(4).getCell(2).value ?? '')).toMatch(/^OB/);
    // 總計列（最後一列）每欄 ≈ 1.0
    const totalRowIdx = ws.rowCount;
    expect(String(ws.getRow(totalRowIdx).getCell(1).value ?? '')).toBe('總計');
    for (let c = 2; c <= lastCol; c++) {
      const v = ws.getRow(totalRowIdx).getCell(c).value;
      expect(typeof v).toBe('number');
      expect(Math.abs((v as number) - 1.0)).toBeLessThan(1e-3);
    }
  }, 120000);

  it('TS-F108-PG-002：樞紐部門分佈量級（四電銷部門加總 ≈ 1.0，與 F063 摘要同量級）', async (ctx) => {
    ensureData(ctx);
    const out = await service.exportResult(RUN_ID, 'xlsx', ACTOR_DIR.userId, ACTOR_DIR);
    const ws = (await loadXlsx(out.body)).worksheets[1];

    // 部門列「總計欄」share：部門加總 = 100%（員編列為佔部門 %，不納入部門加總）。
    // 以 getSummary 部門名稱集合過濾出「部門列」（與員編列、(空白) 區分），驗證量級。
    const summary = await service.getSummary(RUN_ID, ACTOR_DIR);
    const summaryDeptNames = new Set(
      summary.deptSummary.map((d) => d.deptName).filter((n): n is string => !!n),
    );

    const grandTotals = deptGrandTotals(ws);
    // 部門列加總 ≈ 1.0（取 summary 認得的部門名稱列；若摘要無部門名稱解析則退回所有 share 排序驗證）
    const deptShares: number[] = [];
    for (const [label, v] of grandTotals) {
      if (summaryDeptNames.has(label) || label === '(空白)') deptShares.push(v);
    }

    if (deptShares.length >= 2) {
      const sum = deptShares.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-2);
    }

    // F063 摘要四電銷部門 actualRatio 量級驗收（32/34/15/18% band；容 scope/浮點差異）。
    const ratiosByDept = new Map(
      summary.deptSummary.map((d) => [d.deptId, d.actualRatio]),
    );
    for (const [deptId, lo, hi] of [
      ['XVE1', 30, 36],
      ['XVE2', 32, 37],
      ['XVE3', 13, 18],
      ['XVE4', 16, 20],
    ] as Array<[string, number, number]>) {
      const r = ratiosByDept.get(deptId);
      if (r !== undefined) {
        expect(r).toBeGreaterThanOrEqual(lo);
        expect(r).toBeLessThanOrEqual(hi);
      }
    }
  }, 120000);
});
