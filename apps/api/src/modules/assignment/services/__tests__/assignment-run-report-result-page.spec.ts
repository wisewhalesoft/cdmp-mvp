/**
 * AssignmentRunReportService.getResultPage — F066 v1.3 分派結果友善分頁端點
 *
 * 對應 spec：F066 §5.3 / AC-8。以 sqlite in-memory 真實 join 驗證：
 *   - TC-RESULTPAGE-001：回傳 23 欄 columns（label 對齊 EXPORT_HEADER_V2）
 *   - TC-RESULTPAGE-002：分頁（page/pageSize）＋ total 正確
 *   - TC-RESULTPAGE-003：欄值格式與匯出一致（指派日 YYYYMMDD、join decode 部門名稱/姓名/名單名稱）
 *   - TC-RESULTPAGE-004：搜尋 q 比對 custo_no / emplid / appl_no
 *   - TC-RESULTPAGE-005：run 不存在 → 404 ASSIGNMENT_RUN_NOT_FOUND
 *   - TC-RESULTPAGE-006：處長 scope → 僅回轄區 emplid（縮小集合，不 403）
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AssignmentRunReportService,
  EXPORT_HEADER_V2,
} from '../assignment-run-report.service';
import { SectionChiefScopeService } from '../section-chief-scope.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const RUN_ID = '0b3a5196-047d-f111-80a2-00155dc92813';

interface Env {
  service: AssignmentRunReportService;
  runRepo: Repository<AssignmentRun>;
  resultRepo: Repository<ObMonthlyRunResult>;
  poolRepo: Repository<ObPoolData>;
  emphireRepo: Repository<ObEmphire>;
  listRepo: Repository<ObListDefinition>;
  emplSetRepo: Repository<ObEmplSet>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          AssignmentRun,
          AssignmentRunSnapshot,
          AssignmentAuditLog,
          ObDeptPct,
          ObMonthlyRunResult,
          ObPoolData,
          ObEmphire,
          ObListDefinition,
          ObEmplSet,
          User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        AssignmentRun,
        AssignmentRunSnapshot,
        AssignmentAuditLog,
        ObDeptPct,
        ObMonthlyRunResult,
        ObPoolData,
        ObEmphire,
        ObListDefinition,
        ObEmplSet,
        User,
      ]),
    ],
    providers: [AssignmentRunReportService, SectionChiefScopeService],
  }).compile();
  await app.init();
  return {
    service: app.get(AssignmentRunReportService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    resultRepo: app.get(getRepositoryToken(ObMonthlyRunResult)),
    poolRepo: app.get(getRepositoryToken(ObPoolData)),
    emphireRepo: app.get(getRepositoryToken(ObEmphire)),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    emplSetRepo: app.get(getRepositoryToken(ObEmplSet)),
    app,
  };
}

async function seed(env: Env): Promise<void> {
  await env.runRepo.save(
    env.runRepo.create({
      run_id: RUN_ID,
      project_workym: '202607',
      triggered_by: 'u-director',
      status: 'completed',
      total_cases: 3,
      created_at: new Date('2026-07-11T08:43:28Z'),
    } as Partial<AssignmentRun>),
  );

  // 名單定義（供 名單名稱 decode）
  await env.listRepo.save(
    env.listRepo.create({
      list_no: 'OB202607001',
      list_nm: '2026-07 汽車期中名單',
      prod_kind: '01',
      list_type: '01',
      list_period_start: '000',
      list_period_end: '999',
      list_interval: '001',
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: new Date('2026-07-01T00:00:00Z'),
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: new Date('2026-07-01T00:00:00Z'),
    } as Partial<ObListDefinition>),
  );

  // 員工（供 部門名稱 / 姓名 / 職級 decode）
  await env.emphireRepo.save([
    env.emphireRepo.create({
      emp_id: '20742',
      dept_name: '業務一部',
      emp_nm: '王大明',
      title_name: '專員',
    } as Partial<ObEmphire>),
    env.emphireRepo.create({
      emp_id: '20815',
      dept_name: '業務二部',
      emp_nm: '林志強',
      title_name: '資深專員',
    } as Partial<ObEmphire>),
  ]);

  const pool = (applNo: string, custoNo: string, extra: Partial<ObPoolData>) =>
    env.poolRepo.create({
      orgno: '02',
      appl_no: applNo,
      custo_no: custoNo,
      sta_code: '05',
      sta_code_na: '期中',
      dept_id: 'D01',
      list_type: '01',
      settle_src: 'N',
      dept_name: '台北分處',
      project_tp: '01',
      spec_name: '汽車貸款',
      pro_rate: '12.5',
      brand_name: 'TOYOTA',
      month_cnt: '6',
      appl_date: new Date('2015-05-18T00:00:00Z'),
      _cdmp_extracted_at: new Date('2026-07-01T00:00:00Z'),
      ...extra,
    } as Partial<ObPoolData>);

  await env.poolRepo.save([
    pool('A0000001', 'C001', {}),
    pool('A0000002', 'C002', { brand_name: 'HONDA' }),
    pool('A0000003', 'C003', { brand_name: 'NISSAN' }),
  ]);

  const result = (
    applNo: string,
    custoNo: string,
    emplid: string,
    extra: Partial<ObMonthlyRunResult>,
  ) =>
    env.resultRepo.create({
      run_id: RUN_ID,
      list_no: 'OB202607001',
      orgno: '02',
      appl_no: applNo,
      custo_no: custoNo,
      emplid,
      dept_id: 'D01',
      assignday: '20260701',
      card_level: 'A',
      tier_level: 'T1',
      is_cr: 'N',
      result_status: 'PENDING',
      ...extra,
    } as Partial<ObMonthlyRunResult>);

  await env.resultRepo.save([
    result('A0000001', 'C001', '20742', {}),
    result('A0000002', 'C002', '20742', { tier_level: 'T2', card_level: 'B' }),
    result('A0000003', 'C003', '20815', {
      tier_level: 'T2',
      is_cr: 'Y',
      cr_id: 'CR088',
      cr_nm: 'CR林志強',
    }),
  ]);
}

describe('AssignmentRunReportService.getResultPage (F066 v1.3)', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
    await seed(env);
  });

  afterAll(async () => {
    await env.app.close();
  });

  it('TC-RESULTPAGE-001：columns 為 23 欄，label 對齊 EXPORT_HEADER_V2', async () => {
    const res = await env.service.getResultPage(RUN_ID, {}, null);
    expect(res.columns).toHaveLength(EXPORT_HEADER_V2.length);
    expect(res.columns.map((c) => c.label)).toEqual([...EXPORT_HEADER_V2]);
    // 每欄有唯一 key
    const keys = res.columns.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('TC-RESULTPAGE-002：分頁 page/pageSize + total 正確', async () => {
    const p1 = await env.service.getResultPage(RUN_ID, { page: 1, pageSize: 2 }, null);
    expect(p1.total).toBe(3);
    expect(p1.page).toBe(1);
    expect(p1.pageSize).toBe(2);
    expect(p1.rows).toHaveLength(2);

    const p2 = await env.service.getResultPage(RUN_ID, { page: 2, pageSize: 2 }, null);
    expect(p2.total).toBe(3);
    expect(p2.rows).toHaveLength(1);
  });

  it('TC-RESULTPAGE-003：欄值格式與匯出一致（指派日 + join decode）', async () => {
    const res = await env.service.getResultPage(RUN_ID, { page: 1, pageSize: 50 }, null);
    const byAppl = new Map(res.rows.map((r) => [r.applNo, r]));
    const row1 = byAppl.get('A0000001')!;
    expect(row1.assignday).toBe('20260701'); // YYYYMMDD
    expect(row1.branchName).toBe('台北分處'); // pool.dept_name（分處）
    expect(row1.listNm).toBe('2026-07 汽車期中名單'); // list def decode
    expect(row1.deptName).toBe('業務一部'); // emphire dept name
    expect(row1.empNm).toBe('王大明'); // emphire emp name
    expect(row1.titleName).toBe('專員');
    expect(row1.tierLevel).toBe('T1');
    expect(row1.isCr).toBe('N');

    const row3 = byAppl.get('A0000003')!;
    expect(row3.isCr).toBe('Y');
    expect(row3.crId).toBe('CR088');
    expect(row3.deptName).toBe('業務二部'); // emplid 20815
  });

  it('TC-RESULTPAGE-004：搜尋 q 比對 custo_no / emplid / appl_no', async () => {
    const byEmplid = await env.service.getResultPage(RUN_ID, { q: '20815' }, null);
    expect(byEmplid.total).toBe(1);
    expect(byEmplid.rows[0].applNo).toBe('A0000003');

    const byCusto = await env.service.getResultPage(RUN_ID, { q: 'C001' }, null);
    expect(byCusto.total).toBe(1);
    expect(byCusto.rows[0].applNo).toBe('A0000001');

    const byAppl = await env.service.getResultPage(RUN_ID, { q: 'A0000002' }, null);
    expect(byAppl.total).toBe(1);
    expect(byAppl.rows[0].applNo).toBe('A0000002');

    const none = await env.service.getResultPage(RUN_ID, { q: 'ZZZ' }, null);
    expect(none.total).toBe(0);
    expect(none.rows).toHaveLength(0);
  });

  it('TC-RESULTPAGE-005：run 不存在 → 404 ASSIGNMENT_RUN_NOT_FOUND', async () => {
    await expect(
      env.service.getResultPage('no-such-run', {}, null),
    ).rejects.toMatchObject({
      response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND },
    });
  });

  it('TC-RESULTPAGE-006：處長 scope → 僅回轄區 emplid（不 403）', async () => {
    // 處長 sc-user 轄區含 20742（由 ob_empl_set.created_by 反查）
    await env.emplSetRepo.save(
      env.emplSetRepo.create({
        list_no: 'OB202607001',
        deptid_m: 'D01',
        emplid: '20742',
        ration: 100,
        created_by: 'sc-user',
      } as Partial<ObEmplSet>),
    );
    const actor = { userId: 'sc-user', role: 'user', businessRole: 'section_chief' };
    const res = await env.service.getResultPage(RUN_ID, { page: 1, pageSize: 50 }, actor);
    // 僅 emplid=20742 的兩列（A0000001 / A0000002），不含 20815 的 A0000003
    expect(res.total).toBe(2);
    expect(res.rows.every((r) => r.emplid === '20742')).toBe(true);
  });
});
