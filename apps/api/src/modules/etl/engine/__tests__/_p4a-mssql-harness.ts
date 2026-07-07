/**
 * AD-E07-41 P4a — 真實 MSSQL 整合測試共用 harness（非 .spec，vitest 不收集）。
 *
 * 提供：連線生命週期、真實 QueryRunner 之 NodeExecutionContext 建構、`##` 命名、唯一 logId、
 * fixture `##` 暫存表建立與清理輔助。沿用 mssql-env-preload 之連線常數與 CDMP_TEST 隔離。
 *
 * ⚠️ 呼叫端 spec 必須先 side-effect import '@/database/__tests__/mssql-env-preload'（設 DB_TYPE=mssql）。
 */
import { DataSource, QueryRunner } from 'typeorm';
import { MSSQL, mssqlPortReachable } from '@/database/__tests__/mssql-env-preload';
import { NodeExecutionContext, DataSet, makeTempTableName } from '../types';

export interface MssqlHarness {
  ds: DataSource | null;
  qr: QueryRunner | null;
  reachable: boolean;
}

export function mssqlOptions() {
  return {
    type: 'mssql' as const,
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: MSSQL.database,
    options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
    entities: [],
    synchronize: false,
  };
}

export async function connectMssql(): Promise<MssqlHarness> {
  const reachable = await mssqlPortReachable(1500);
  if (!reachable) return { ds: null, qr: null, reachable: false };
  try {
    const ds = new DataSource(mssqlOptions());
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await qr.connect();
    return { ds, qr, reachable: true };
  } catch {
    return { ds: null, qr: null, reachable: false };
  }
}

export async function teardownMssql(h: MssqlHarness | undefined): Promise<void> {
  if (!h) return;
  if (h.qr) await h.qr.release();
  await h.ds?.destroy();
}

/** 隨機 16 hex logId；makeTempTableName 取前 8 碼 → 併發/重跑不撞名。 */
export function uniqueLogId(): string {
  return (
    Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '0000000000000000'
  ).slice(0, 16);
}

export function tempName(nodeId: string, logId: string): string {
  return '##' + makeTempTableName(nodeId, logId);
}

export async function objectExists(qr: QueryRunner, name: string): Promise<boolean> {
  const rows = await qr.query(`SELECT OBJECT_ID('tempdb..' + @0) AS oid`, [name]);
  return rows[0].oid != null;
}

/** 建立真實 NodeExecutionContext（真 QueryRunner）。 */
export function makeRealCtx(
  qr: QueryRunner,
  nodeType: string,
  nodeData: Record<string, unknown>,
  inputs: Record<string, DataSet>,
  opts: { nodeId?: string; logId?: string } = {},
): NodeExecutionContext {
  return {
    node: {
      id: opts.nodeId ?? 'n1',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType, label: 'T', ...nodeData },
    },
    inputs,
    pipelineId: 'p',
    logId: opts.logId ?? uniqueLogId(),
    isTestRun: false,
    queryRunner: qr,
  };
}

/** 讀回一個 `##` 表全部列（ORDER BY 第一欄）供斷言。 */
export async function readAll(qr: QueryRunner, tempTable: string, orderCol?: string): Promise<any[]> {
  const order = orderCol ? ` ORDER BY "${orderCol}"` : '';
  return qr.query(`SELECT * FROM ${tempTable}${order}`);
}
