import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

/**
 * F115 — 分派結果回寫外部 legacy `APYHFC16.OB.OBPOOLDATA_LIST`
 *
 * 設計：docs/specs/features/F115-writeback-obpooldata-list.md
 *
 * - 目標為**獨立** SQL Server（非 CDMP 庫）→ 重用 ETL 外部連線機制：以 `datasources` 表之
 *   `APYHFC16.OB` 列（`CryptoUtil.decrypt` 密碼）開 `mssql.ConnectionPool`（比照 MSSQLExecutor）。
 * - 語意：**UPDATE-in-place** 既有列之 9 分派欄（OB_DEPT/OB_EMPLID/EMPLID_DEPTID/ASSIGNDAY/
 *   CARD_LEVEL/TIER_LEVEL/IS_CR/CR_ID/CR_NM），比對鍵 = 完整 PK (LIST_NO,ORGNO,APPL_NO)；
 *   目標列不存在 → not-matched（CDMP `result_status=FAILED`），不 INSERT。
 * - preview：CDMP-only 統計 + 連線唯讀探測（不寫入）。execute：真實外部寫入（需 confirm）。
 *
 * ⚠️ execute 為外部**生產庫**不可逆寫入；連線未設定/無寫權 → 422。開發環境不觸發真實寫入。
 */

/** 回寫目標之外部 datasource 名稱（seeded 於 datasources.json）。 */
const EXTERNAL_DATASOURCE_NAME = 'APYHFC16.OB';
/** 每批列數：受 mssql 單次 request 2100 參數上限限制（12 欄 × 150 = 1800 < 2100）。 */
const INSERT_BATCH_SIZE = 150;
/** preview 樣本列數。 */
const SAMPLE_SIZE = 20;

/** #wb 暫存欄序（與 UPDATE / INSERT 對應）。 */
const WB_COLUMNS = [
  'list_no',
  'orgno',
  'appl_no',
  'ob_dept',
  'ob_emplid',
  'emplid_deptid',
  'assignday',
  'card_level',
  'tier_level',
  'is_cr',
  'cr_id',
  'cr_nm',
] as const;

export interface WritebackActor {
  userId: string;
  name?: string | null;
}

export interface WritebackByList {
  listNo: string;
  count: number;
}

export interface WritebackPreview {
  runId: string;
  totalToWrite: number;
  byListNo: WritebackByList[];
  sample: Array<Record<string, string | null>>;
  /** 目標未命中筆數；preview 不做全量探測 → null（execute 時回報）。 */
  notMatched: number | null;
  /** 外部連線是否可用（唯讀 SELECT 1 探測）。 */
  connectionAvailable: boolean;
}

export interface WritebackResult {
  runId: string;
  updated: number;
  notMatched: number;
  byListNo: WritebackByList[];
}

interface NotMatchedKey {
  listNo: string;
  orgno: string;
  applNo: string;
}

/** mssql 驅動最小介面（測試可注入）。 */
export interface MssqlDriverLike {
  ConnectionPool: new (config: any) => any;
}

@Injectable()
export class ObpooldataWritebackService {
  private readonly logger = new Logger(ObpooldataWritebackService.name);
  private _driver: MssqlDriverLike | undefined;

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(ObMonthlyRunResult)
    private readonly resultRepo: Repository<ObMonthlyRunResult>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(Datasource)
    private readonly datasourceRepo: Repository<Datasource>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** dry-run：回傳將回寫之統計（CDMP-only）+ 外部連線可用性（唯讀探測）。不寫入。 */
  async preview(runId: string, _actor?: WritebackActor | null): Promise<WritebackPreview> {
    await this.requireCompletedRun(runId);

    const total = await this.resultRepo.count({ where: { run_id: runId } });
    const byListNo = await this.loadByListNo(runId);
    const sampleRows = await this.resultRepo
      .createQueryBuilder('r')
      .where('r.run_id = :runId', { runId })
      .orderBy('r.list_no', 'ASC')
      .addOrderBy('r.orgno', 'ASC')
      .addOrderBy('r.appl_no', 'ASC')
      .limit(SAMPLE_SIZE)
      .getMany();
    const sample = sampleRows.map((r) => this.toSampleObject(r));

    const connectionAvailable = await this.probeConnection();

    return {
      runId,
      totalToWrite: total,
      byListNo,
      sample,
      notMatched: null,
      connectionAvailable,
    };
  }

  /** 實際回寫外部 OBPOOLDATA_LIST（UPDATE-in-place）。需 confirm=true。 */
  async execute(
    runId: string,
    opts: { confirm?: boolean },
    actor?: WritebackActor | null,
  ): Promise<WritebackResult> {
    if (!opts?.confirm) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.WRITEBACK_CONFIRM_REQUIRED,
        message: ERROR_MESSAGES.WRITEBACK_CONFIRM_REQUIRED,
      });
    }
    await this.requireCompletedRun(runId);

    const rows = await this.resultRepo
      .createQueryBuilder('r')
      .select([
        'r.list_no',
        'r.orgno',
        'r.appl_no',
        'r.dept_id',
        'r.emplid',
        'r.emplid_deptid',
        'r.assignday',
        'r.card_level',
        'r.tier_level',
        'r.is_cr',
        'r.cr_id',
        'r.cr_nm',
      ])
      .where('r.run_id = :runId', { runId })
      .orderBy('r.list_no', 'ASC')
      .addOrderBy('r.orgno', 'ASC')
      .addOrderBy('r.appl_no', 'ASC')
      .getMany();

    const byListNo = await this.loadByListNo(runId);

    const pool = await this.openExternalPool();
    let matched = 0;
    let notMatchedKeys: NotMatchedKey[] = [];
    try {
      const res = await this.writeBatches(pool, rows);
      matched = res.matched;
      notMatchedKeys = res.notMatchedKeys;
    } finally {
      try {
        await pool.close();
      } catch {
        /* ignore */
      }
    }

    await this.applyResultStatus(runId, notMatchedKeys);
    await this.writeAudit(runId, actor, matched, notMatchedKeys.length);

    return {
      runId,
      updated: matched,
      notMatched: notMatchedKeys.length,
      byListNo,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal — CDMP side
  // ---------------------------------------------------------------------------

  private async requireCompletedRun(runId: string): Promise<AssignmentRun> {
    const run = await this.runRepo.findOne({ where: { run_id: runId } });
    if (!run) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }
    if (run.status !== 'completed') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_COMPLETED,
      });
    }
    return run;
  }

  private async loadByListNo(runId: string): Promise<WritebackByList[]> {
    const raw = await this.resultRepo
      .createQueryBuilder('r')
      .select('r.list_no', 'listNo')
      .addSelect('COUNT(*)', 'count')
      .where('r.run_id = :runId', { runId })
      .groupBy('r.list_no')
      .orderBy('r.list_no', 'ASC')
      .getRawMany<{ listNo: string; count: number | string }>();
    return raw.map((b) => ({ listNo: b.listNo, count: Number(b.count) }));
  }

  private toSampleObject(r: ObMonthlyRunResult): Record<string, string | null> {
    return {
      listNo: r.list_no,
      orgno: r.orgno,
      applNo: r.appl_no,
      obDept: r.dept_id ?? null,
      obEmplid: r.emplid ?? null,
      emplidDeptid: r.emplid_deptid ?? null,
      assignday: r.assignday ?? null,
      cardLevel: r.card_level ?? null,
      tierLevel: r.tier_level ?? null,
      isCr: r.is_cr ?? null,
      crId: r.cr_id ?? null,
      crNm: r.cr_nm ?? null,
    };
  }

  /** run 全列標記 SUCCESS，not-matched 覆蓋為 FAILED。 */
  private async applyResultStatus(
    runId: string,
    notMatchedKeys: NotMatchedKey[],
  ): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .update(ObMonthlyRunResult)
      .set({ result_status: 'SUCCESS', updated_at: () => 'CURRENT_TIMESTAMP' })
      .where('run_id = :runId', { runId })
      .execute();

    for (const keyChunk of this.chunk(notMatchedKeys, 50)) {
      const params: Record<string, unknown> = { runId };
      const ors = keyChunk
        .map((k, i) => {
          params[`l${i}`] = k.listNo;
          params[`o${i}`] = k.orgno;
          params[`a${i}`] = k.applNo;
          return `(list_no = :l${i} AND orgno = :o${i} AND appl_no = :a${i})`;
        })
        .join(' OR ');
      await this.dataSource
        .createQueryBuilder()
        .update(ObMonthlyRunResult)
        .set({ result_status: 'FAILED', updated_at: () => 'CURRENT_TIMESTAMP' })
        .where(`run_id = :runId AND (${ors})`, params)
        .execute();
    }
  }

  private async writeAudit(
    runId: string,
    actor: WritebackActor | null | undefined,
    updated: number,
    notMatched: number,
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        entity_type: 'assignment_run',
        entity_id: runId,
        action: 'WRITEBACK',
        actor_id: actor?.userId ?? '00000000-0000-0000-0000-000000000000',
        actor_name: actor?.name ?? actor?.userId ?? 'system',
        after_value: { target: 'OBPOOLDATA_LIST', updated, notMatched },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Internal — external connection (reuse ETL pattern)
  // ---------------------------------------------------------------------------

  protected getDriver(): MssqlDriverLike {
    if (!this._driver) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this._driver = require('mssql') as MssqlDriverLike;
    }
    return this._driver;
  }

  /** 開啟外部 APYHFC16.OB 連線；未設定/無法連線 → 422 WRITEBACK_CONNECTION_NOT_CONFIGURED。 */
  protected async openExternalPool(): Promise<any> {
    const ds = await this.datasourceRepo.findOne({
      where: { name: EXTERNAL_DATASOURCE_NAME },
    });
    const notConfigured = () =>
      new UnprocessableEntityException({
        error: ERROR_CODES.WRITEBACK_CONNECTION_NOT_CONFIGURED,
        message: ERROR_MESSAGES.WRITEBACK_CONNECTION_NOT_CONFIGURED,
      });
    if (!ds) throw notConfigured();

    let password = '';
    try {
      password = CryptoUtil.decrypt(ds.encrypted_password);
    } catch {
      throw notConfigured();
    }
    if (!password) throw notConfigured();

    const driver = this.getDriver();
    const pool = new driver.ConnectionPool({
      server: ds.host,
      port: ds.port,
      database: ds.database_name,
      user: ds.username,
      password,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 10000,
        requestTimeout: 0,
      },
    });
    try {
      await pool.connect();
    } catch (err) {
      this.logger.warn(`回寫外部連線失敗：${(err as Error).message}`);
      throw notConfigured();
    }
    return pool;
  }

  /** preview 用：唯讀探測外部連線是否可用（SELECT 1）。失敗回 false（優雅降級）。 */
  protected async probeConnection(): Promise<boolean> {
    let pool: any;
    try {
      pool = await this.openExternalPool();
      await pool.request().query('SELECT 1 AS ok');
      return true;
    } catch {
      return false;
    } finally {
      if (pool) {
        try {
          await pool.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * 逐批以 table variable @wb + set-based UPDATE...FROM 回寫；回 matched 數與 not-matched keys。
   * pool 由呼叫端開/關（execute）；本方法可單元測試（傳入 fake pool）。
   */
  protected async writeBatches(
    pool: any,
    rows: ObMonthlyRunResult[],
  ): Promise<{ matched: number; notMatchedKeys: NotMatchedKey[] }> {
    let matched = 0;
    const notMatchedKeys: NotMatchedKey[] = [];

    for (const chunk of this.chunk(rows, INSERT_BATCH_SIZE)) {
      const req = pool.request();
      const valueTuples = chunk
        .map((row, i) => {
          const wb = this.toWbValues(row);
          const placeholders = WB_COLUMNS.map((_, c) => {
            const p = `p${i}_${c}`;
            req.input(p, wb[c]);
            return `@${p}`;
          });
          return `(${placeholders.join(',')})`;
        })
        .join(',');

      const sql = this.buildBatchSql(valueTuples);
      const res = await req.query(sql);
      const recordset: Array<{ list_no: string; orgno: string; appl_no: string }> =
        res?.recordset ?? [];
      for (const r of recordset) {
        notMatchedKeys.push({ listNo: r.list_no, orgno: r.orgno, applNo: r.appl_no });
      }
      matched += chunk.length - recordset.length;
    }

    return { matched, notMatchedKeys };
  }

  /** result 列 → #wb 欄值（WB_COLUMNS 順序）。 */
  private toWbValues(r: ObMonthlyRunResult): Array<string | null> {
    return [
      r.list_no,
      r.orgno,
      r.appl_no,
      r.dept_id ?? null,
      r.emplid ?? null,
      r.emplid_deptid ?? null,
      r.assignday ?? null,
      r.card_level ?? null,
      r.tier_level ?? null,
      r.is_cr ?? null,
      r.cr_id ?? null,
      r.cr_nm ?? null,
    ];
  }

  private buildBatchSql(valueTuples: string): string {
    const insertCols = WB_COLUMNS.join(',');
    return `
      DECLARE @wb TABLE (
        list_no NVARCHAR(100), orgno NVARCHAR(2), appl_no NVARCHAR(10),
        ob_dept NVARCHAR(6), ob_emplid NVARCHAR(10), emplid_deptid NVARCHAR(6),
        assignday NVARCHAR(100), card_level NVARCHAR(1), tier_level NVARCHAR(5),
        is_cr NVARCHAR(1), cr_id NVARCHAR(20), cr_nm NVARCHAR(50)
      );
      INSERT INTO @wb (${insertCols}) VALUES ${valueTuples};
      UPDATE t SET
        t.OB_DEPT = s.ob_dept, t.OB_EMPLID = s.ob_emplid, t.EMPLID_DEPTID = s.emplid_deptid,
        t.ASSIGNDAY = s.assignday, t.CARD_LEVEL = s.card_level, t.TIER_LEVEL = s.tier_level,
        t.IS_CR = s.is_cr, t.CR_ID = s.cr_id, t.CR_NM = s.cr_nm
      FROM dbo.OBPOOLDATA_LIST t
      INNER JOIN @wb s
        ON t.LIST_NO = s.list_no AND t.ORGNO = s.orgno AND t.APPL_NO = s.appl_no;
      SELECT s.list_no, s.orgno, s.appl_no
      FROM @wb s
      LEFT JOIN dbo.OBPOOLDATA_LIST t
        ON t.LIST_NO = s.list_no AND t.ORGNO = s.orgno AND t.APPL_NO = s.appl_no
      WHERE t.APPL_NO IS NULL;
    `;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }
}
