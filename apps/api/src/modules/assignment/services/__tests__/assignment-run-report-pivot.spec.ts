/**
 * AssignmentRunReportService.getPivot — F116 樞紐分析
 *
 * 對應 spec：F116 §5.1。以 sqlite in-memory GROUP BY 驗證：
 *   - TC-PIVOT-001：聚合結構（depts/byList/emplids[+empNm]/listNos/grandByList/grandTotal）
 *   - TC-PIVOT-002：排序（listNos 升冪、emplids 升冪、(空白) 置末）
 *   - TC-PIVOT-003：dept/emplid 空 → (空白)
 *   - TC-PIVOT-004：run 不存在 → 404
 *   - TC-PIVOT-005：處長 scope → 僅回轄區 emplid
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssignmentRunReportService } from '../assignment-run-report.service';
import { SectionChiefScopeService } from '../section-chief-scope.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const RUN_ID = '0b3a5196-047d-f111-80a2-00155dc92813';

interface Env {
  service: AssignmentRunReportService;
  runRepo: Repository<AssignmentRun>;
  resultRepo: Repository<ObMonthlyRunResult>;
  emphireRepo: Repository<ObEmphire>;
  emplSetRepo: Repository<ObEmplSet>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app = await Test.createTestingModule({
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
          ObEmphire,
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
        ObEmphire,
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
    emphireRepo: app.get(getRepositoryToken(ObEmphire)),
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
      total_cases: 7,
      created_at: new Date('2026-07-11T08:43:28Z'),
    } as Partial<AssignmentRun>),
  );
  await env.emphireRepo.save([
    env.emphireRepo.create({ emp_id: '20501', dept_name: '中區電銷1', emp_nm: '王大明' } as Partial<ObEmphire>),
    env.emphireRepo.create({ emp_id: '20502', dept_name: '中區電銷1', emp_nm: '林淑芬' } as Partial<ObEmphire>),
    env.emphireRepo.create({ emp_id: '30001', dept_name: '北區電銷1', emp_nm: '陳志明' } as Partial<ObEmphire>),
  ]);

  let seq = 0;
  const mk = (emplid: string, listNo: string) =>
    env.resultRepo.create({
      run_id: RUN_ID,
      list_no: listNo,
      orgno: '02',
      appl_no: `A${String(++seq).padStart(6, '0')}`,
      emplid,
      dept_id: 'D01',
      result_status: 'PENDING',
    } as Partial<ObMonthlyRunResult>);

  await env.resultRepo.save([
    // 中區電銷1 / 20501：OB1 x2, OB2 x1
    mk('20501', 'OB1'),
    mk('20501', 'OB1'),
    mk('20501', 'OB2'),
    // 中區電銷1 / 20502：OB1 x1
    mk('20502', 'OB1'),
    // 北區電銷1 / 30001：OB1 x1, OB2 x1
    mk('30001', 'OB1'),
    mk('30001', 'OB2'),
    // 無 emphire 對應 → dept (空白)：OB1 x1
    mk('99999', 'OB1'),
  ]);
}

describe('AssignmentRunReportService.getPivot (F116)', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
    await seed(env);
  });

  afterAll(async () => {
    await env.app.close();
  });

  it('TC-PIVOT-001/002/003：聚合結構 + 排序 + (空白)', async () => {
    const res = await env.service.getPivot(RUN_ID, null);

    expect(res.listNos).toEqual(['OB1', 'OB2']);
    expect(res.grandTotal).toBe(7);
    expect(res.grandByList).toEqual({ OB1: 5, OB2: 2 });

    // 部門排序：中區電銷1 / 北區電銷1 / (空白 置末)
    expect(res.depts.map((d) => d.deptName)).toEqual(['中區電銷1', '北區電銷1', '(空白)']);

    const zhong = res.depts.find((d) => d.deptName === '中區電銷1')!;
    expect(zhong.total).toBe(4);
    expect(zhong.byList).toEqual({ OB1: 3, OB2: 1 });
    // 員編升冪 + 姓名
    expect(zhong.emplids.map((e) => e.emplid)).toEqual(['20501', '20502']);
    const e20501 = zhong.emplids.find((e) => e.emplid === '20501')!;
    expect(e20501.empNm).toBe('王大明');
    expect(e20501.total).toBe(3);
    expect(e20501.byList).toEqual({ OB1: 2, OB2: 1 });

    const blank = res.depts.find((d) => d.deptName === '(空白)')!;
    expect(blank.total).toBe(1);
    expect(blank.emplids[0].emplid).toBe('99999');
  });

  it('TC-PIVOT-004：run 不存在 → 404', async () => {
    await expect(env.service.getPivot('no-run', null)).rejects.toMatchObject({
      response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND },
    });
  });

  it('TC-PIVOT-005：處長 scope → 僅回轄區 emplid', async () => {
    await env.emplSetRepo.save(
      env.emplSetRepo.create({
        list_no: 'OB1',
        deptid_m: 'D01',
        emplid: '20501',
        ration: 100,
        created_by: 'sc-user',
      } as Partial<ObEmplSet>),
    );
    const actor = { userId: 'sc-user', role: 'user', businessRole: 'section_chief' };
    const res = await env.service.getPivot(RUN_ID, actor);
    // 僅 20501（3 筆：OB1 x2 + OB2 x1）
    expect(res.grandTotal).toBe(3);
    expect(res.depts).toHaveLength(1);
    expect(res.depts[0].deptName).toBe('中區電銷1');
    expect(res.depts[0].emplids.map((e) => e.emplid)).toEqual(['20501']);
  });
});
