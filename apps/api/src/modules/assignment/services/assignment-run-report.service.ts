import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PassThrough } from 'stream';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import {
  SectionChiefScopeService,
  ActorUser,
} from './section-chief-scope.service';

export interface SummaryDeptRow {
  deptId: string;
  configRatio: number;
  actualCount: number;
  actualRatio: number;
  deviation: number;
  alert: boolean;
}

export interface SummaryLevelRow {
  cardLevel: string;
  count: number;
  ratio: number;
}

export interface SummaryResponse {
  runId: string;
  projectWorkym: string;
  finishedAt: Date | null;
  durationMs: number | null;
  totalCases: number | null;
  stage1Count: number;
  stage4Count: number;
  coverageRate: number;
  deptSummary: SummaryDeptRow[];
  levelDistribution: SummaryLevelRow[];
  // F063 AC-5：warnings 段含 skipped_cases 與 warning_summary 碼
  warnings: {
    summaryCode: string | null;
    skippedCases: Record<string, unknown> | null;
  };
}

export interface ExportResult {
  filename: string;
  contentType: string;
  /** CSV 為 string，xlsx 為 Buffer（streaming written 後集合） */
  body: string | Buffer;
  rowCount: number;
}

export interface ExportOptions {
  /** xlsx streaming timeout (ms)，超過回 EXPORT_FILE_EXPIRED；預設 5 分鐘 */
  timeoutMs?: number;
}

/** F064 BR-3：xlsx 串流匯出 timeout 上限（5 分鐘） */
const EXPORT_TIMEOUT_MS_DEFAULT = 5 * 60 * 1000;

/** F064 AC-2 / BR-1：xlsx + csv 共用欄位（8 欄） */
const EXPORT_HEADER = [
  'list_no',
  'appl_no',
  'card_level',
  'tier_level',
  'dept_id',
  'emplid',
  'score',
  'is_cr',
] as const;

export interface CompareResponse {
  base: { runId: string; projectWorkym: string; totalCases: number };
  compare: { runId: string; projectWorkym: string; totalCases: number };
  summary: {
    totalDiff: number;
    deptDiff: Array<{
      deptId: string;
      baseCount: number;
      compareCount: number;
      diff: number;
    }>;
    levelDiff: Array<{
      cardLevel: string;
      baseCount: number;
      compareCount: number;
      diff: number;
    }>;
  };
  configDiff: {
    cardVersionChanged: { from: number | null; to: number | null } | null;
    deptRatioChanges: Array<{
      listNo: string;
      deptId: string;
      from: number | null;
      to: number | null;
    }>;
    crRuleChanged: { from: boolean | null; to: boolean | null } | null;
  };
  personnelMismatch: {
    list: Array<{
      applNo: string;
      baseEmplId: string | null;
      compareEmplId: string | null;
    }>;
    mismatchCount: number;
    totalCount: number;
    rate: number;
    alert: boolean;
  };
  customerDiff: {
    added: Array<{ applNo: string }>;
    removed: Array<{ applNo: string }>;
  };
}

interface ResultAssignment {
  listNo?: string;
  applNo?: string;
  deptId?: string | null;
  emplid?: string | null;
  score?: number | null;
  cardLevel?: string | null;
  tierLevel?: string | null;
  isCr?: string | null;
}

/**
 * AssignmentRunReportService — F063 摘要 / F064 匯出 / F067 比對
 *
 * - getSummary(runId)：F063 結果摘要（總量 / 部門偏差 / 等級分佈 / warnings）
 * - exportResult(runId, format)：F064 匯出 CSV（xlsx 未實作 → 422）
 * - compareRuns(runA, runB)：F067 差異比對 + 人員配對不一致率（NFR-005）
 *
 * 來源：assignment_run + assignment_run_snapshot.payload（type='result' / 'config'）
 *
 * 注意：未完成（pending / running / failed）的 run → 422 ASSIGNMENT_RUN_NOT_COMPLETED。
 */
@Injectable()
export class AssignmentRunReportService {
  private readonly logger = new Logger(AssignmentRunReportService.name);

  static readonly DEVIATION_ALERT_THRESHOLD = 3; // 百分比
  static readonly MISMATCH_ALERT_THRESHOLD = 0.03; // NFR-005

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentRunSnapshot)
    private readonly snapshotRepo: Repository<AssignmentRunSnapshot>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    private readonly scope: SectionChiefScopeService,
  ) {}

  // -------------------------------------------------------------------------
  // F063 結果摘要
  // -------------------------------------------------------------------------

  async getSummary(runId: string, actor?: ActorUser | null): Promise<SummaryResponse> {
    const run = await this.requireCompletedRun(runId);
    const { configPayload, resultPayload, inputListPayload } =
      await this.loadAllPayloads(runId);

    const allAssignments: ResultAssignment[] = Array.isArray(
      (resultPayload as any)?.assignments,
    )
      ? ((resultPayload as any).assignments as ResultAssignment[])
      : [];
    // F063 v1.1 BR-6 / BR-7：section_chief scopeByCreator filter；director / admin bypass
    const assignments = await this.scope.filterByEmplId<ResultAssignment>(
      allAssignments,
      actor,
    );
    const stage4Count = assignments.length;
    const allStage1Cases = Array.isArray((inputListPayload as any)?.cases)
      ? ((inputListPayload as any).cases as Array<{ emplid?: string | null }>)
      : [];
    const stage1Cases = await this.scope.filterByEmplId(allStage1Cases, actor);
    const stage1Count = stage1Cases.length;
    const coverageRate = stage1Count === 0 ? 0 : stage4Count / stage1Count;

    // 部門統計：聚合 result 中 deptId
    const deptActual = new Map<string, number>();
    for (const a of assignments) {
      const d = a.deptId ?? null;
      if (!d) continue;
      deptActual.set(d, (deptActual.get(d) ?? 0) + 1);
    }

    // 部門設定比例：聚合 config.deptPct 中各 deptId 的 ration 平均（spec L62 「設定比例」）
    const deptConfigRatio = new Map<string, number>();
    const deptConfigSum = new Map<string, { sum: number; cnt: number }>();
    const cfgDeptPct: Array<{ deptId: string; ration: string | number }> =
      Array.isArray((configPayload as any)?.deptPct)
        ? (configPayload as any).deptPct
        : [];
    for (const d of cfgDeptPct) {
      if (!d.deptId) continue;
      const v = Number(d.ration);
      if (!Number.isFinite(v)) continue;
      const prev = deptConfigSum.get(d.deptId) ?? { sum: 0, cnt: 0 };
      prev.sum += v;
      prev.cnt += 1;
      deptConfigSum.set(d.deptId, prev);
    }
    for (const [k, { sum, cnt }] of deptConfigSum.entries()) {
      deptConfigRatio.set(k, cnt === 0 ? 0 : sum / cnt);
    }

    // F063 AC-5：section_chief 視角下，deptSummary 只列出 assignments 中出現的 dept
    //            （不洩漏轄區外 deptId 的存在性）。director / admin bypass 顯示 union。
    const allDeptIds = this.scope.shouldFilter(actor)
      ? new Set<string>(deptActual.keys())
      : new Set<string>([...deptActual.keys(), ...deptConfigRatio.keys()]);
    const deptSummary: SummaryDeptRow[] = [];
    for (const deptId of allDeptIds) {
      const actualCount = deptActual.get(deptId) ?? 0;
      const actualRatio =
        stage4Count === 0
          ? 0
          : Math.round(((actualCount / stage4Count) * 100) * 10) / 10;
      const configRatio =
        Math.round((deptConfigRatio.get(deptId) ?? 0) * 10) / 10;
      const deviation =
        Math.round((actualRatio - configRatio) * 10) / 10;
      const alert =
        Math.abs(deviation) >
        AssignmentRunReportService.DEVIATION_ALERT_THRESHOLD;
      deptSummary.push({
        deptId,
        configRatio,
        actualCount,
        actualRatio,
        deviation,
        alert,
      });
    }
    deptSummary.sort((a, b) => a.deptId.localeCompare(b.deptId));

    // 等級分佈
    const levelCounts = new Map<string, number>();
    for (const a of assignments) {
      const l = a.cardLevel ?? null;
      if (!l) continue;
      levelCounts.set(l, (levelCounts.get(l) ?? 0) + 1);
    }
    const levelDistribution: SummaryLevelRow[] = Array.from(
      levelCounts.entries(),
    )
      .map(([cardLevel, count]) => ({
        cardLevel,
        count,
        ratio:
          stage4Count === 0
            ? 0
            : Math.round(((count / stage4Count) * 100) * 10) / 10,
      }))
      .sort((a, b) => a.cardLevel.localeCompare(b.cardLevel));

    // F063 AC-5：section_chief 視角下 totalCases 為轄區內子集（= stage4Count）；
    //            director / admin bypass，回原值（run.total_cases）。
    const totalCases = this.scope.shouldFilter(actor)
      ? stage4Count
      : run.total_cases;

    return {
      runId: run.run_id,
      projectWorkym: run.project_workym,
      finishedAt: run.finished_at,
      durationMs: run.duration_ms,
      totalCases,
      stage1Count,
      stage4Count,
      coverageRate: Math.round(coverageRate * 10000) / 10000,
      deptSummary,
      levelDistribution,
      warnings: {
        summaryCode: run.warning_summary,
        skippedCases: run.skipped_cases,
      },
    };
  }

  // -------------------------------------------------------------------------
  // F064 匯出（CSV）
  // -------------------------------------------------------------------------

  async exportResult(
    runId: string,
    format: 'csv' | 'xlsx' = 'csv',
    actorId?: string,
    actor?: ActorUser | null,
    options?: ExportOptions,
  ): Promise<ExportResult> {
    const run = await this.requireCompletedRun(runId);
    const { resultPayload } = await this.loadAllPayloads(runId);
    const allAssignments: ResultAssignment[] = Array.isArray(
      (resultPayload as any)?.assignments,
    )
      ? ((resultPayload as any).assignments as ResultAssignment[])
      : [];
    // F064 v1.1 scope filter
    const assignments = await this.scope.filterByEmplId<ResultAssignment>(
      allAssignments,
      actor,
    );

    const shortId = run.run_id.replace(/-/g, '').slice(0, 8);

    if (format === 'xlsx') {
      const body = await this.buildXlsxStreaming(
        assignments,
        options?.timeoutMs ?? EXPORT_TIMEOUT_MS_DEFAULT,
      );
      const filename = `assignment_result_${run.project_workym}_${shortId}.xlsx`;
      // F064 AC-5：稽核
      await this.writeAudit(runId, actorId, 'xlsx', assignments.length);
      return {
        filename,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body,
        rowCount: assignments.length,
      };
    }

    // CSV path
    const lines: string[] = [EXPORT_HEADER.join(',')];
    for (const a of assignments) {
      lines.push(
        [
          a.listNo,
          a.applNo,
          a.cardLevel,
          a.tierLevel,
          a.deptId,
          a.emplid,
          a.score,
          a.isCr,
        ]
          .map((v) => this.csvEscape(v))
          .join(','),
      );
    }
    const body = lines.join('\n');

    const filename = `assignment_result_${run.project_workym}_${shortId}.csv`;

    // F064 AC-5：稽核
    await this.writeAudit(runId, actorId, 'csv', assignments.length);

    return {
      filename,
      contentType: 'text/csv; charset=utf-8',
      body,
      rowCount: assignments.length,
    };
  }

  /**
   * F064 AC-4 / BR-2：使用 exceljs WorkbookWriter（streaming mode），
   * 逐 row commit，並支援 BR-3 timeout 監看（超過回 EXPORT_FILE_EXPIRED）。
   *
   * 採 PassThrough 為 sink，收集 chunks 到 Buffer（最終仍需回給 controller 寫 response），
   * 但寫入過程為 streaming（exceljs sheet.commit() / workbook.commit() 觸發 partial flush），
   * 避免一次性建立完整 in-memory Workbook 物件。
   */
  private async buildXlsxStreaming(
    rows: ResultAssignment[],
    timeoutMs: number,
  ): Promise<Buffer> {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));
    const sinkEnd = new Promise<void>((resolve, reject) => {
      sink.once('end', () => resolve());
      sink.once('error', reject);
    });

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: sink,
      useStyles: true,
      useSharedStrings: false,
    });
    const sheet = workbook.addWorksheet('assignment_result');
    sheet.columns = EXPORT_HEADER.map((key) => ({ header: key, key }));
    // header style（粗體）
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    const writeAndFinish = (async () => {
      for (const a of rows) {
        sheet
          .addRow({
            list_no: a.listNo ?? '',
            appl_no: a.applNo ?? '',
            card_level: a.cardLevel ?? '',
            tier_level: a.tierLevel ?? '',
            dept_id: a.deptId ?? '',
            emplid: a.emplid ?? '',
            score: a.score ?? '',
            is_cr: a.isCr ?? '',
          })
          .commit();
      }
      sheet.commit();
      // workbook.commit() 結束後 ExcelJS 會關閉 stream → sink 收到 end
      await workbook.commit();
      await sinkEnd;
    })();

    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new InternalServerErrorException({
            error: ERROR_CODES.EXPORT_FILE_EXPIRED,
            message: ERROR_MESSAGES.EXPORT_FILE_EXPIRED,
          }),
        );
      }, timeoutMs);
      if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
    });

    try {
      await Promise.race([writeAndFinish, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
    return Buffer.concat(chunks);
  }

  // -------------------------------------------------------------------------
  // F067 比對
  // -------------------------------------------------------------------------

  async compareRuns(
    runA: string,
    runB: string,
    actor?: ActorUser | null,
  ): Promise<CompareResponse> {
    const base = await this.requireRun(runA);
    const compare = await this.requireRun(runB);

    for (const r of [base, compare]) {
      if (r.status !== 'completed') {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPARABLE,
          message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_COMPARABLE,
        });
      }
    }

    const baseSnap = await this.loadAllPayloads(runA);
    const cmpSnap = await this.loadAllPayloads(runB);

    const baseListRaw: ResultAssignment[] = Array.isArray(
      (baseSnap.resultPayload as any)?.assignments,
    )
      ? (baseSnap.resultPayload as any).assignments
      : [];
    const cmpListRaw: ResultAssignment[] = Array.isArray(
      (cmpSnap.resultPayload as any)?.assignments,
    )
      ? (cmpSnap.resultPayload as any).assignments
      : [];
    // F067 v1.1 scope filter — 兩邊都套
    const baseList = await this.scope.filterByEmplId<ResultAssignment>(
      baseListRaw,
      actor,
    );
    const cmpList = await this.scope.filterByEmplId<ResultAssignment>(
      cmpListRaw,
      actor,
    );

    // 摘要 dept / level diff
    const sumDept = this.aggregateBy(baseList, cmpList, (x) => x.deptId);
    const sumLevel = this.aggregateBy(baseList, cmpList, (x) => x.cardLevel);

    // 設定 diff
    const configDiff = this.diffConfig(
      baseSnap.configPayload,
      cmpSnap.configPayload,
    );

    // 人員配對 diff（NFR-005）
    const personnelMismatch = this.calcPersonnelMismatch(baseList, cmpList);

    // 客戶層級 diff（spec BR-4：依 applNo 集合運算）
    const baseSet = new Set(baseList.map((x) => x.applNo).filter(Boolean) as string[]);
    const cmpSet = new Set(cmpList.map((x) => x.applNo).filter(Boolean) as string[]);
    const added = [...cmpSet].filter((a) => !baseSet.has(a));
    const removed = [...baseSet].filter((a) => !cmpSet.has(a));

    // F067 v1.1：section_chief 視角 totalCases 為轄區內子集
    const filtered = this.scope.shouldFilter(actor);
    return {
      base: {
        runId: base.run_id,
        projectWorkym: base.project_workym,
        totalCases: filtered ? baseList.length : (base.total_cases ?? baseList.length),
      },
      compare: {
        runId: compare.run_id,
        projectWorkym: compare.project_workym,
        totalCases: filtered ? cmpList.length : (compare.total_cases ?? cmpList.length),
      },
      summary: {
        totalDiff: cmpList.length - baseList.length,
        deptDiff: sumDept,
        levelDiff: sumLevel.map((r) => ({
          cardLevel: r.deptId,
          baseCount: r.baseCount,
          compareCount: r.compareCount,
          diff: r.diff,
        })),
      },
      configDiff,
      personnelMismatch,
      customerDiff: {
        added: added.map((applNo) => ({ applNo })),
        removed: removed.map((applNo) => ({ applNo })),
      },
    };
  }

  // -------------------------------------------------------------------------
  // F067 比對匯出（xlsx）
  // -------------------------------------------------------------------------

  /**
   * F067 AC-3 + v1.1：比對差異匯出 xlsx（streaming）。
   * 3 個 sheet：summary / personnelMismatch / customerDiff。
   *
   * 重用 compareRuns() 已計算之 CompareResponse，避免重複 query payload。
   */
  async compareRunsExport(
    runA: string,
    runB: string,
    actorId?: string,
    actor?: ActorUser | null,
    options?: ExportOptions,
  ): Promise<ExportResult> {
    const cmp = await this.compareRuns(runA, runB, actor);
    const body = await this.buildCompareXlsxStreaming(
      cmp,
      options?.timeoutMs ?? EXPORT_TIMEOUT_MS_DEFAULT,
    );
    const shortA = cmp.base.runId.replace(/-/g, '').slice(0, 8);
    const shortB = cmp.compare.runId.replace(/-/g, '').slice(0, 8);
    const filename = `assignment_compare_${shortA}_${shortB}.xlsx`;
    // F067 audit log：沿用 EXPORT action，entity_id 採 base run，after_value 加入兩端 run_id
    await this.writeAudit(
      cmp.base.runId,
      actorId,
      'xlsx',
      cmp.personnelMismatch.list.length + cmp.customerDiff.added.length +
        cmp.customerDiff.removed.length,
      { compareRunId: cmp.compare.runId },
    );
    return {
      filename,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body,
      rowCount:
        cmp.personnelMismatch.list.length +
        cmp.customerDiff.added.length +
        cmp.customerDiff.removed.length,
    };
  }

  private async buildCompareXlsxStreaming(
    cmp: CompareResponse,
    timeoutMs: number,
  ): Promise<Buffer> {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));
    const sinkEnd = new Promise<void>((resolve, reject) => {
      sink.once('end', () => resolve());
      sink.once('error', reject);
    });

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: sink,
      useStyles: true,
      useSharedStrings: false,
    });

    // sheet 1：summary
    const summarySheet = workbook.addWorksheet('summary');
    summarySheet.columns = [
      { header: 'metric', key: 'metric' },
      { header: 'base', key: 'base' },
      { header: 'compare', key: 'compare' },
      { header: 'diff', key: 'diff' },
    ];
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).commit();
    summarySheet
      .addRow({
        metric: 'totalCases',
        base: cmp.base.totalCases,
        compare: cmp.compare.totalCases,
        diff: cmp.summary.totalDiff,
      })
      .commit();
    for (const d of cmp.summary.deptDiff) {
      summarySheet
        .addRow({
          metric: `dept_${d.deptId}`,
          base: d.baseCount,
          compare: d.compareCount,
          diff: d.diff,
        })
        .commit();
    }
    for (const l of cmp.summary.levelDiff) {
      summarySheet
        .addRow({
          metric: `level_${l.cardLevel}`,
          base: l.baseCount,
          compare: l.compareCount,
          diff: l.diff,
        })
        .commit();
    }
    summarySheet
      .addRow({
        metric: 'personnelMismatchRate',
        base: '',
        compare: cmp.personnelMismatch.rate,
        diff: cmp.personnelMismatch.alert ? 'ALERT' : '',
      })
      .commit();
    summarySheet.commit();

    // sheet 2：personnelMismatch（NFR-005 主驗收清單）
    const pmSheet = workbook.addWorksheet('personnelMismatch');
    pmSheet.columns = [
      { header: 'appl_no', key: 'appl_no' },
      { header: 'base_emplid', key: 'base_emplid' },
      { header: 'compare_emplid', key: 'compare_emplid' },
    ];
    pmSheet.getRow(1).font = { bold: true };
    pmSheet.getRow(1).commit();
    for (const m of cmp.personnelMismatch.list) {
      pmSheet
        .addRow({
          appl_no: m.applNo,
          base_emplid: m.baseEmplId ?? '',
          compare_emplid: m.compareEmplId ?? '',
        })
        .commit();
    }
    pmSheet.commit();

    // sheet 3：customerDiff
    const cdSheet = workbook.addWorksheet('customerDiff');
    cdSheet.columns = [
      { header: 'change', key: 'change' },
      { header: 'appl_no', key: 'appl_no' },
    ];
    cdSheet.getRow(1).font = { bold: true };
    cdSheet.getRow(1).commit();
    for (const a of cmp.customerDiff.added) {
      cdSheet.addRow({ change: 'added', appl_no: a.applNo }).commit();
    }
    for (const r of cmp.customerDiff.removed) {
      cdSheet.addRow({ change: 'removed', appl_no: r.applNo }).commit();
    }
    cdSheet.commit();

    const writeAndFinish = (async () => {
      await workbook.commit();
      await sinkEnd;
    })();

    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new InternalServerErrorException({
            error: ERROR_CODES.EXPORT_FILE_EXPIRED,
            message: ERROR_MESSAGES.EXPORT_FILE_EXPIRED,
          }),
        );
      }, timeoutMs);
      if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
    });

    try {
      await Promise.race([writeAndFinish, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
    return Buffer.concat(chunks);
  }

  // -------------------------------------------------------------------------
  // 內部 helpers
  // -------------------------------------------------------------------------

  private async requireRun(runId: string): Promise<AssignmentRun> {
    const run = await this.runRepo.findOne({ where: { run_id: runId } });
    if (!run) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }
    return run;
  }

  private async requireCompletedRun(runId: string): Promise<AssignmentRun> {
    const run = await this.requireRun(runId);
    if (run.status !== 'completed') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_COMPLETED,
      });
    }
    return run;
  }

  private async loadAllPayloads(runId: string): Promise<{
    configPayload: Record<string, unknown> | null;
    inputListPayload: Record<string, unknown> | null;
    resultPayload: Record<string, unknown> | null;
  }> {
    const snaps = await this.snapshotRepo.find({ where: { run_id: runId } });
    const byType = new Map<string, Record<string, unknown>>();
    for (const s of snaps) byType.set(s.snapshot_type, s.payload);
    return {
      configPayload: byType.get('config') ?? null,
      inputListPayload: byType.get('input_list') ?? null,
      resultPayload: byType.get('result') ?? null,
    };
  }

  private csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[,"\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  private aggregateBy(
    base: ResultAssignment[],
    cmp: ResultAssignment[],
    key: (x: ResultAssignment) => string | null | undefined,
  ): Array<{
    deptId: string;
    baseCount: number;
    compareCount: number;
    diff: number;
  }> {
    const baseMap = new Map<string, number>();
    for (const x of base) {
      const k = key(x);
      if (!k) continue;
      baseMap.set(k, (baseMap.get(k) ?? 0) + 1);
    }
    const cmpMap = new Map<string, number>();
    for (const x of cmp) {
      const k = key(x);
      if (!k) continue;
      cmpMap.set(k, (cmpMap.get(k) ?? 0) + 1);
    }
    const keys = new Set([...baseMap.keys(), ...cmpMap.keys()]);
    return [...keys]
      .map((k) => {
        const b = baseMap.get(k) ?? 0;
        const c = cmpMap.get(k) ?? 0;
        return { deptId: k, baseCount: b, compareCount: c, diff: c - b };
      })
      .sort((a, b) => a.deptId.localeCompare(b.deptId));
  }

  private diffConfig(
    base: Record<string, unknown> | null,
    cmp: Record<string, unknown> | null,
  ): CompareResponse['configDiff'] {
    // card_version：取 levelcardLevels 最大 cardVersion
    const baseVer = this.extractMaxCardVersion(base);
    const cmpVer = this.extractMaxCardVersion(cmp);
    const cardVersionChanged =
      baseVer !== cmpVer ? { from: baseVer, to: cmpVer } : null;

    // 部門比例變更：依 (listNo, deptId) 比對 ration
    const baseDept = new Map<string, number>();
    for (const d of this.deptPctArray(base)) {
      baseDept.set(`${d.listNo}__${d.deptId}`, Number(d.ration));
    }
    const cmpDept = new Map<string, number>();
    for (const d of this.deptPctArray(cmp)) {
      cmpDept.set(`${d.listNo}__${d.deptId}`, Number(d.ration));
    }
    const allKeys = new Set([...baseDept.keys(), ...cmpDept.keys()]);
    const deptRatioChanges: Array<{
      listNo: string;
      deptId: string;
      from: number | null;
      to: number | null;
    }> = [];
    for (const k of allKeys) {
      const [listNo, deptId] = k.split('__');
      const fromV = baseDept.has(k) ? baseDept.get(k)! : null;
      const toV = cmpDept.has(k) ? cmpDept.get(k)! : null;
      if (fromV !== toV) {
        deptRatioChanges.push({ listNo, deptId, from: fromV, to: toV });
      }
    }

    // CR 規則：聚合所有 listDefinitions 中 crEnabled，任一不同則記
    const baseCr = this.aggregateCrEnabled(base);
    const cmpCr = this.aggregateCrEnabled(cmp);
    const crRuleChanged =
      baseCr !== cmpCr ? { from: baseCr, to: cmpCr } : null;

    return { cardVersionChanged, deptRatioChanges, crRuleChanged };
  }

  private extractMaxCardVersion(
    cfg: Record<string, unknown> | null,
  ): number | null {
    if (!cfg) return null;
    const arr = (cfg as any)?.levelcardLevels;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    let max = -Infinity;
    for (const x of arr) {
      const v = Number(x?.cardVersion);
      if (Number.isFinite(v) && v > max) max = v;
    }
    return max === -Infinity ? null : max;
  }

  private deptPctArray(cfg: Record<string, unknown> | null): Array<{
    listNo: string;
    deptId: string;
    ration: string | number;
  }> {
    if (!cfg) return [];
    const arr = (cfg as any)?.deptPct;
    return Array.isArray(arr) ? arr : [];
  }

  private aggregateCrEnabled(
    cfg: Record<string, unknown> | null,
  ): boolean | null {
    if (!cfg) return null;
    const arr = (cfg as any)?.listDefinitions;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // 任一 list cr_enabled 為 true 即視為 true
    return arr.some((x: any) => x?.crEnabled === true);
  }

  private calcPersonnelMismatch(
    base: ResultAssignment[],
    cmp: ResultAssignment[],
  ): CompareResponse['personnelMismatch'] {
    const baseMap = new Map<string, string | null>();
    for (const x of base) {
      if (!x.applNo) continue;
      baseMap.set(x.applNo, x.emplid ?? null);
    }
    const cmpMap = new Map<string, string | null>();
    for (const x of cmp) {
      if (!x.applNo) continue;
      cmpMap.set(x.applNo, x.emplid ?? null);
    }
    // 共同案件
    const common = [...baseMap.keys()].filter((k) => cmpMap.has(k));
    const list: Array<{
      applNo: string;
      baseEmplId: string | null;
      compareEmplId: string | null;
    }> = [];
    for (const applNo of common) {
      const b = baseMap.get(applNo) ?? null;
      const c = cmpMap.get(applNo) ?? null;
      if (b !== c) list.push({ applNo, baseEmplId: b, compareEmplId: c });
    }
    const totalCount = common.length;
    const mismatchCount = list.length;
    const rate = totalCount === 0 ? 0 : mismatchCount / totalCount;
    return {
      list,
      mismatchCount,
      totalCount,
      rate: Math.round(rate * 10000) / 10000,
      alert: rate > AssignmentRunReportService.MISMATCH_ALERT_THRESHOLD,
    };
  }

  private async writeAudit(
    runId: string,
    actorId: string | undefined,
    format: string,
    rowCount: number,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    if (!actorId) return;
    const afterValue: Record<string, unknown> = { format, rowCount };
    if (extra) Object.assign(afterValue, extra);
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          entity_type: 'assignment_run',
          entity_id: runId,
          action: 'EXPORT',
          actor_id: actorId,
          actor_name: actorId,
          before_value: null,
          after_value: afterValue,
          ip_address: null,
          created_at: new Date(),
        } as Partial<AssignmentAuditLog>),
      );
    } catch (err: any) {
      this.logger.error(
        `audit EXPORT write failed: run=${runId} err=${err?.message ?? err}`,
      );
    }
  }
}
